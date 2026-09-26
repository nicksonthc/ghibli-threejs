---
name: threejs-hud-objective-markers
description: Adds game-style objective markers and a minimal HUD to a three.js scene — glass badges pinned to the screen edge with a chevron and live distance when a hero is off-screen or behind the camera, floating labels when far but visible, hysteresis so they never flicker, click-or-key fly-to on an arc that climbs with distance, a follow/watch camera that survives loops with a mist-cut overlay, and a translucent icon dock with CSS tooltips plus a corner wordmark. Use when adding waypoints, off-screen indicators, objective markers, "where is X" badges, fly-to camera travel, minimal HUD, icon toolbar or tooltips to a WebGL scene.
---

# Hero markers, fly-to and a full-view HUD

Shows where the scene's heroes are without cluttering the view:
- **Off-screen:** a glass badge rides the screen edge with a chevron pointing the way and the distance.
  **Behind the camera:** the bottom corner on the hero's side, chevron angled back.
- **On-screen but far:** the badge floats over the hero with a pointer, label and key hint.
- **Close enough to click the hero itself:** the badge steps aside (with hysteresis).
- Clicking a badge (or its key) **flies** the camera there on an arc, then follows or settles into orbit.
- The rest of the HUD shrinks to a translucent icon dock with hover tooltips and a small wordmark.

Stack: three.js `WebGLRenderer` + `OrbitControls`, DOM overlay (absolutely positioned buttons, CSS variables for
position/angle). Vanilla; in R3F run `stepHeroes` from `useFrame` and keep the DOM outside the canvas.

## When to use

- A large scene where the visitor can lose a moving hero (boat, character) or the "home" spot.
- You need smooth camera travel between distant places that the visitor can interrupt.
- The HUD is too heavy and you want the whole scene visible.

## Paste-ready prompts

> When a hero (`{{hero A}}`, `{{hero B}}`) is far away or out of view, show a game-style objective marker:
> - Off-screen: a glass badge pinned to the screen edge with a chevron toward it and a live distance. Behind the
>   camera: the bottom corner on its side.
> - On-screen but far: the badge floats over the hero with a pointer, a label and a key hint.
> - Close enough to click the hero itself: it steps aside, with hysteresis.
>
> Clicking the marker (or pressing its key) flies the camera there on an arc that climbs with the distance, then
> follows (hero A) or settles into the orbit (hero B). Hide the markers during loading, the tour, reading and
> mid-flight.

> Hide the title and camera-view panels (keep the number keys). Shrink the toggles into a small translucent icon
> dock bottom-left that brightens on hover and shows each label as a tooltip. Replace the signature pill with a
> plain `{{domain}}` wordmark, bottom-right. The visitor should see the whole scene.

## Implementation

### Markers (`references/hero-markers.js`, `references/hero-markers.css`)
- Anchor point per hero: world position + a head offset (e.g. +2.35 m over a character in a boat).
- `ahead = dot(p − camPos, camDir) > 0`; project to screen; `onScreen` = ahead and inside the **inset rectangle**
  (insets top/right/bottom/left ≈ 64/70/104/64 px — keep them clear of the HUD dock and wordmark).
- Show/hide with hysteresis: e.g. show on-screen beyond 16 m, hide under 12 m; off-screen show beyond 8 m.
  Never while already riding with that hero; always hidden during loading, tour, reading, editing, flight.
- **Edge placement:** from the screen centre, scale the direction to the inset rectangle:
  `s = min((W − ir − cx)/|dx| or (cx − il)/|dx|, (H − ib − cy)/|dy| or (cy − it)/|dy|)`; chevron angle `atan2(dy, dx)`.
- **Behind the camera:** use the sign of the camera-space x (`p.applyMatrix4(camera.matrixWorldInverse).x`) and pin
  to that bottom corner (chevron at .3π / .7π). Mirroring the projection instead sends it to the bottom centre,
  right over the thing you're following.
- **Smoothing:** ease screen position with `1 − e^(−16·dt)`; toggle the `.edge` class only when the state changes;
  update distance text at 4 Hz (`m` below 1 km, else `x.x km`). Nudge two overlapping edge badges apart (58 px).
- Position via CSS variables `--x --y --a` and `transform: translate3d(var(--x), var(--y), 0)`; edge badges collapse
  to the icon and expand the label on hover/focus. Respect `prefers-reduced-motion`.

### Fly-to
- `duration = clamp(1.3 + d/70, 1.3, 5)` s, `arc = min(38 m, 0.2·d)`.
- Position: ease-in-out cubic lerp, plus `arc·sin(πu)` on y. Gaze eases faster: `1 − (1 − 1.25u)³`, so the view
  turns toward the destination early.
- The destination is a **function** (`dest() → { pos, tgt }`) so a moving boat is chased all the way.
- Set the camera-owner flag to `'flight'` while flying; `controls` `start` event (visitor grabs the camera) cancels.
- On arrival: start a follow camera (hero A) or re-enable auto-orbit (hero B), plus a short toast.

### Follow ("watch") that survives loops
- A watch-follow keeps riding the hero under autopilot. If the hero's path loops (teleports to its start), whiten
  the screen into mist with a CSS overlay faded in just before the wrap, cut the camera to the start pose, then
  clear the mist (~350 ms later). If a non-watch follow sees a teleport, end the follow instead of flying across
  the world.

### Full-view HUD dock (`references/hud-dock.css`)
- Icon-only buttons with the label in `data-label` + `aria-label`; tooltip via
  `::before { content: attr(data-label) }`. A "tap to start" suffix becomes a pulsing ring on `::after`.
- Dock at ~.6 opacity on a translucent blurred pill; full opacity on `:hover` / `:focus-within`.
- Hide HUD and wordmark with body classes (`body.loading`, `body.reading`, `body.touring`).

## Pitfalls

- `hidden` loses to any author `display:` rule: `#views { display:flex }` kept the panel visible. Add
  `#views[hidden] { display:none }`.
- A flex-column HUD stretches children to the widest one; a lone dock needs `align-items:flex-start`.
- `//` is not a CSS comment. A trailing `// …` after a rule swallows the next selector, silently dropping that rule
  (a HUD fade transition was lost this way). Use `/* … */`.
- Toggling classes every frame makes badges flicker; only on state change.
- Keyboard shortcuts must ignore modifier keys and typing in `input`/`textarea`.

## Verify

- Orbit so each hero goes off every edge and behind the camera; the badge must slide, not jump.
- Walk the camera across the show/hide distance: no flicker.
- Fly to a moving hero from far away; grab the camera mid-flight — control returns instantly.
- Check at phone width (labels trimmed at ≤ 640 px) and with reduced motion.

## Related skills

threejs-boat-buoyancy-steering (follow camera, lane loop) · threejs-camera-guided-tour ·
threejs-object-interaction · threejs-cinematic-loading-screen · threejs-open-world-streaming
