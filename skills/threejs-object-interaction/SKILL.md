---
name: threejs-object-interaction
description: Makes a three.js object hoverable and clickable (canvas-rect raycast, additive pulsing hover ring, click-vs-drag filter) and plays a one-shot cinematic on click — the camera glides into a first-person view, an openable copy of the object (e.g. a book) lifts and opens, text writes itself onto CanvasTexture pages in handwriting, pages come from JSON and turn with a real hinged page flip, Esc reverses it all; optionally lets visitors write their own pages kept in localStorage. Use when adding click interaction, raycasting hover, cinematic camera sequences, an interactive book / diary / letter, handwriting reveal, page-flip animation or user-editable 3D text to a WebGL scene.
---

# Interactive hero object: hover, click, cinematic, handwriting, page flip

Turns one object in the scene into the "hero interaction": a soft glow hints it can be clicked, hover shows a
pulsing ring and a pointer cursor, and a click starts **one continuous shot** (no flash, no cut, no HTML pop-up):
the camera glides to a character's eye point, an openable copy of the object lifts overhead and opens, text writes
itself onto the pages in handwriting while the camera pushes in, and pages turn with a real hinged leaf. Esc reverses
the whole thing back to the saved orbit.

Stack: three.js `WebGLRenderer` + `OrbitControls` (vanilla; in R3F put the same logic in `useFrame` and a ref-held
state object). Proven on three.js r186 with a book resting on a sleeping character's face.

## When to use

- A scene has one object that should "do something" when clicked (book, letter, sketchbook, scroll, sign).
- You need hover detection that doesn't fire on orbit drags.
- You want a cinematic camera move that temporarily owns the camera and hands it back cleanly.
- You want dynamic text on a 3D surface (handwriting reveal, data-driven pages, visitor-written pages).

## Paste-ready prompt

> Make `{{object}}` in `{{entry file}}` clickable: a glowing ring on hover. On click, glide the camera into
> `{{character}}`'s first-person view, lift and open it, and write `{{text}}` onto it in handwriting while the
> camera slowly pushes in. One continuous shot: no flash, no pop-up. Esc reverses it.
> - Raycast on `pointermove` using the **canvas** rect (not the window). Additive, pulsing, sweeping ring and a
>   pointer cursor. A click counts only if the pointer moved < 6 px since `pointerdown`.
> - The sequence takes camera ownership: disable OrbitControls and skip `controls.update()` while it runs.
>   1. Glide (~2.4 s) to the eye point while lerping `camera.up` toward the top of the character's head.
>   2. Swap in an openable copy at ~10 % of the glide: two page halves hinged at the spine (bowed page plane +
>      page block + cover each), oriented with `makeBasis(up × down, headDir, down)`; lift it overhead and rotate
>      the halves from tented (~58°) to nearly flat (~7°).
>   3. One `CanvasTexture` for the spread as `map` **and** `emissiveMap` (~0.5 emissive). Pencil doodle on the left,
>      handwriting (`{{web font, e.g. Caveat}}`) revealed char by char with an advancing clip rect on the right.
>   4. Ease-out dolly to the distance where the spread fills ~85 % of the view, from fov/aspect on both axes.
>   5. Pages from `{{data file}}` (`pages: [{ text, cite }]`), wrapped to page width, spilling past ~9 lines onto
>      extra pages, cite on the last. Fixed characters-per-second; a click mid-sentence finishes the page. Then a
>      hand-written "turn the page ↗" sign + HTML pill; Click / → / Space flips a real leaf toward the reader.
> - Hide the HUD, show a "close · Esc" pill. Esc / pill / click on the last page reverses it in one shot and
>   restores position, up vector, target and controls.
> - Optional: *"Let visitors write their own text into the book: up to `{{3}}` pages, Enter = new line, refuse
>   anything that would spill past 9 handwritten lines, keep it in the visitor's own browser (localStorage), Reset
>   returns `{{data file}}`."*

## Implementation

### Hover and click (`references/hover-click-raycast.js`)
- NDC from `renderer.domElement.getBoundingClientRect()` — never `innerWidth/innerHeight` (breaks as soon as the
  canvas isn't full-window or the page scrolls). `ray.layers.enableAll()` if the object sits on a non-default layer.
- Toggle a `body.hover<Obj>` class for `cursor:pointer`.
- Click = `pointerup` within **6 px** of `pointerdown`; anything more was an orbit drag.
- Ring: `RingGeometry(.2, .3, 96)` rotated flat, `ShaderMaterial` additive, `depthWrite:false`, `fog:false`:
  `band = exp(-((r-.235)*40)²) + .35·exp(-((r-.25)*14)²)`, `sweep = .65 + .35·sin(atan(y,x)·3 − t·2.5)`,
  `pulse = .8 + .2·sin(t·4)`, colour warm gold ×2.2. Ease `uOn` toward 1 (hover), a breathing idle (`.28 + .12 sin`)
  until first use, 0 during the cinematic. Hide it from the AO pass (see threejs-postprocessing-anime-grade).

### One camera owner
- A single `cine` flag (`false | 'opening' | 'reading' | 'flipping' | 'closing'`). While truthy: `controls.enabled =
  false`, the render loop skips `controls.update()` and any ground/waterline clamp, hover is ignored.
- Save `{ pos, target, up, autoRotate }` before, restore exactly after, then `controls.update()`.
- Tweens are promises (`tweenP(dur, fn, ease)`) so the sequence reads as `await glide; await write; …`.

### The openable copy (`references/openable-book.js`)
- The GLB object stays for the idle scene; the openable copy is visible only while `lift > .002 || open > .002`
  and the original meshes hide at the same moment — the swap happens far from the camera, so it is never seen.
- Each half: `PlaneGeometry(W, H, 16, 1)` bowed out of the gutter (`z = .016·sin(min(1, fromSpine·1.6)·π/2)`), u
  remapped to its half of the shared spread canvas (`[0,.5]` or `[.5,1]`), a page block box and a cover box.
- Page size used: W = .165 m, H = .23 m, lifted .42 m. Canvas 1400×980 for the spread, anisotropy = max.
- Orientation: `makeBasis(cross(headDir, down), headDir, down)` so the text reads upright for someone lying down.
- Handwriting: per line, clip to `measureText(line.slice(0, whole)).width + fractional next glyph` — a soft pen tip.
  Redraw and `tex.needsUpdate = true` every frame while writing. Wait for `document.fonts.load(PAGE_FONT)` then
  repaint (canvas text doesn't pull web fonts by itself).
- Push-in distance: `max((2W·1.18/2)/tan(hfov/2), (H·1.18/2)/tan(vfov/2))`, `hfov = 2·atan(tan(vfov/2)·aspect)`.

### Pagination and page flip
- `wrapLine` splits on spaces; a run wider than the page falls back to **character-by-character** (URLs, Chinese).
- Write speed ~16 chars/s, minimum 1.2 s per page; a click sets `skip` to finish instantly.
- Leaf: a pivot at the spine with a **FrontSide** plane (page just read) and a **BackSide** plane (next spread's
  doodle) sharing one canvas (front | back). Back u: `u = .5 + (1 − t)·.5`, or the doodle lands mirrored.
- With the halves at ±a (a = 7°): `pivot.rotation.y = −a − (π − 2a)·k`, bow `z = .03·sin(kπ)·sin(x/W·π)` on both
  planes, 1.15 s ease-in-out. During the flip the static right page is blank and the left keeps the old doodle
  until the leaf lands; then redraw and write the next page.

### Visitor-editable pages (`references/editable-pages.js`)
- Store `{ pages:[{text, cite}], savedAt }` under a versioned key; wrap every `localStorage` access in try/catch.
- Measure the limit with the **same** canvas font and width the page paints with (shared `wrapEntry`), never a
  character count. Refuse overflow by restoring the last good value and caret, and flash the line counter.
- Every keystroke repaints the 3D page as a live preview; place the panel over the left (doodle) page.
- Gate the reading keys (Space / Enter / → / Esc) while the panel is open, or typing turns pages.

## Pitfalls

- The flip arc must swing on the **reader's** side; the other way the leaf travels behind the open book and is never
  seen — the end state still looks right, so test a frozen mid-angle.
- A BackSide plane shows its texture mirrored: reverse its u.
- Don't rule the leaf's back if the static left page is unruled.
- Emissive pages are required: in the shade under a lifted book, a plain `map` is unreadable.
- Pure-white paper albedo blooms; keep paper cream (`#f6ecd4 → #ecdcb8`) and bloom threshold above it.
- Word wrap on spaces alone never breaks Chinese text.
- Vercel with a `public/` folder and no framework serves `public/` as the root: a root `index.html` needs
  `vercel.json` `"outputDirectory": "."`; CLI deploys need `.vercelignore` alongside `.gitignore`.

## Verify

- Hover from several angles; drag the orbit across the object — no click must fire.
- Screenshot the glide at 10 %, 50 %, 100 %; the swap must be invisible.
- Freeze the flip at k = .5: the leaf is between the reader and the book, doodle not mirrored.
- Long entry → spills onto a second page; Chinese text wraps; Esc mid-sentence returns the exact saved camera.
- Browser-automation clicks don't fire `pointermove`: dispatch `PointerEvent`s on the canvas at **CSS**
  coordinates (the tool's screenshot frame ≠ CSS px). A harmless OrbitControls `setPointerCapture` exception from
  the synthetic `pointerdown` is expected.

## Related skills

threejs-camera-guided-tour · threejs-hud-objective-markers · threejs-night-lights-lanterns (lanterns can carry the
visitor's lines) · threejs-postprocessing-anime-grade · threejs-headless-visual-verification
