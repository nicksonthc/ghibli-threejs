---
name: threejs-headless-visual-verification
description: Verifies a three.js / WebGL scene visually and numerically without fighting the browser — headless Playwright on real Chrome with GPU flags, stopping the animation loop and stepping frame(t) deterministically, reading the canvas with toDataURL in the same evaluate, a shot-list capture script, synthetic PointerEvents for hover/click, and a checklist of the traps (hidden-tab rAF throttling, stale cached index.html, shader-compile stalls, blank canvases, syntax errors that stop the page at 0%). Use when the user asks to screenshot, check, compare against a reference, verify a visual change, capture beats of a camera tour, or when screenshots come back blank, stale, white or frozen.
---

# Headless visual verification for three.js scenes

Every visual change should be checked against the reference from fixed views. Doing that
through an interactive browser tab is slow and flaky (throttled rAF, stolen focus, stale
frames). The reliable path: headless Chrome with a real GPU, the render loop stopped, and
frames stepped by hand. Stack: three.js `WebGLRenderer` (vanilla or R3F) served locally,
Playwright (`npm i playwright`), Chrome installed.

## When to use
- After each section of a visual prompt: "screenshot close-up, eye-level and max zoom-out,
  compare with the reference, fix, then move on".
- Capturing tour beats, day/night end states, weather modes, a mid-animation frame.
- Screenshots are blank/white/page-coloured, don't change after a tweak, or a fade "never finishes".
- Testing hover/click logic that needs `pointermove`.

## Paste-ready prompt
> Verify `{{change}}` in `{{entry file}}` headlessly: serve the folder, launch Playwright
> Chrome headless with `--use-angle={{metal|gl}} --enable-gpu --ignore-gpu-blocklist`, wait for
> the page's ready state, stop the animation loop, set camera / night / weather state, step
> `frame(t += 50)` N times and read `canvas.toDataURL()` in the same evaluate. Shoot
> `{{views: reference, eye level, close-up, max zoom-out, 16:9 and phone portrait}}`, log the
> relevant state at shot time, read the console, and compare each PNG with `{{reference image}}`.

## Implementation

### Page contract (make the scene testable)
- Name the render loop: `const frame = time => { … }; renderer.setAnimationLoop(frame)`.
- Expose a debug handle: `window.__app = { scene, camera, controls, renderer, composer, frame,
  goView, setNight, applySun, … }` plus `seek(seconds)` for tours and `k = 0/1` setters for
  blends, so end states can be driven directly.
- A ready signal (`#loading.ready`) after models load and a warm-up frame has compiled shaders.

### Capture loop
1. Serve: `npx serve -l 8765 .` (or any static server).
2. Launch `chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal',
   '--enable-gpu', '--ignore-gpu-blocklist'] })` (macOS: metal; Linux: try `--use-angle=gl`
   or `swiftshader` as a slow fallback).
3. `goto(url + '?v=' + Date.now(), { waitUntil:'commit' })` — the default `load` wait times
   out on CDN fonts; `npx serve` redirects `/index.html` → `/`.
4. `waitForSelector('#loading.ready')`, press a key/tap to enter if there is a gate.
5. In **one** evaluate: `renderer.setAnimationLoop(null)`, set camera/state, call
   `frame(t0 + i*50)` N times (a timestamp is required — without it the canvas renders
   white), then `return canvas.toDataURL('image/png')`. Write it to disk from Node.
6. Shot list as data: `{ name, pos | posExpression, target, night, js, frames, log }` —
   see `references/capture.cjs` (template).

### Numeric checks beat eyeballing
Project objects to NDC once per 0.6 s to prove they cross the frame; walk path samples for
clearance; print height grids around placements; log `renderer.info` and state at shot time
rather than guessing.

### Hover / click tests
Browser-automation clicks don't fire the `pointermove` hover logic needs. Dispatch
`PointerEvent`s on the **canvas** at CSS coordinates (the tool's screenshot frame ≠ CSS px):
```js
const c = renderer.domElement, r = c.getBoundingClientRect()
for (const type of ['pointermove', 'pointerdown', 'pointerup', 'click'])
  c.dispatchEvent(new PointerEvent(type, { clientX:r.left + x, clientY:r.top + y, bubbles:true, pointerId:1, isPrimary:true }))
```
Expect a harmless OrbitControls `setPointerCapture` exception from the synthetic `pointerdown`.

### Syntax-check before every reload
A single-file scene dies silently at 0 % (or hangs the headless wait) on a syntax error.
Extract the module and run `node --check`:
```bash
awk '/<script type="module">/{f=1;next}/<\/script>/{f=0}f' index.html > /tmp/m.mjs && node --check /tmp/m.mjs
```

## Pitfalls
- **Hidden / occluded tab:** rAF throttles to ~1 fps or stops; screenshots are stale frames,
  tuning "does nothing", fades "never finish", FPS reads 0. A flat page-coloured frame with
  `renderer.info` frames not advancing means the tab is hidden, not NaN or a lost context.
  Check `document.visibilityState` and that the time uniform advances. The headless loop
  sidesteps this entirely.
- **Blank reads:** a WebGL canvas without `preserveDrawingBuffer` reads back blank after the
  frame; `toDataURL` must run in the same task as the frames. `page.screenshot` came back blank.
- **Stale page:** static servers cache `index.html` — navigate with `?v=N`.
- **Shader compile at load** blocks the main thread for seconds; evaluates time out. Wait ~15 s
  before probing. Keep one evaluate under ~30 s of frame work or CDP times out.
- **Stepped clock ≠ wall clock:** direct `frame()` calls advance `dt` by ≤ .05 s each, so a 4 s
  fade needs ~80 frames; CSS transitions (captions) and wall-clock effects run on real time,
  so captions look stale right after a seek.
- **Order-dependent state:** switching night → day instantly leaves clouds night-tinted (they
  fade on their own clock). Shoot day views first or use a fresh page.
- **Timers seeded at build time** with small absolute values (`next: 8 + rand*10`) fire at once
  because the frame clock is page time (thousands of seconds). Seed from the first step's `t`
  (`C.next ??= t + …`).
- **Seeking into a smoothed follow** shows the unsmoothed start; make scripted motion a pure
  function of time so seeks land correctly.
- **Interactive radii:** a crow that spooks within 3 m kept "vanishing" because the test camera
  was 2.9 m away. OrbitControls `maxDistance` silently pulls a far debug camera in.
- **`//` in one-line code:** a trailing `// comment` pasted after a `)` comments out the paren
  ("missing ) after argument list"); mid-line it can remove a guard. In CSS `//` isn't a comment
  and swallows the next rule. Comments on their own line.
- **JS escapes via heredoc edits:** a Python heredoc turned `'\n'` in a template literal into a
  real newline → `Invalid or unexpected token`. Escape as `\\n` or edit with a raw string.
- `Math.exp(-(a/.3)**2)` is a SyntaxError (unary minus before `**`) — `node --check` catches it.
- **Don't steal focus** while the user works: check the frontmost app and HID idle time
  (`ioreg -c IOHIDSystem | awk '/HIDIdleTime/'`) before opening a visible browser; batch
  visible checks for when they're away. Prefer headless.

## Verify (the checklist itself)
For each change: reference view, eye level, close-up, max zoom-out (plus 16:9 and portrait
phone for camera work); console clean; the relevant state logged at shot time; numbers
checked where they exist.

## References
- `references/capture.cjs` — TEMPLATE shot-list capture script (Playwright, stepped frames, toDataURL).
- `references/ev.cjs` — TEMPLATE: evaluate an expression in the running page and print it.

## Related skills
threejs-webgl-performance-profiling · threejs-camera-guided-tour · threejs-object-interaction ·
threejs-cinematic-loading-screen · threejs-ghibli-night-mode · threejs-blender-glb-pipeline
