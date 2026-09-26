---
name: threejs-cinematic-loading-screen
description: Builds a cinematic loading gate for a three.js scene — a painted CSS dawn (layered gradients, drifting blurred mist bands, optional conic god rays, SVG feTurbulence grain, vignette), a 2D-canvas layer of falling petals and glowing motes, a handwritten title that animates in, a gold progress line with stage captions, then "tap anywhere to enter" whose tap is the browser gesture that unlocks audio; uses a still captured from the live scene as the backdrop that cross-fades into the real render, and warms up shaders before lifting so the first interaction never stalls. Use when adding a loading screen, splash screen, intro curtain, preloader, tap-to-start / audio unlock gate or shader pre-compilation to a WebGL scene.
---

# Cinematic loading gate

The loading screen is a gate, not a spinner: a dawn over the scene with mist, petals and a handwritten title, a thin
gold progress line, and — once everything is built, compiled and rendered behind it — "tap anywhere to enter". That
tap starts the music (browsers only allow audio after a gesture), so no separate "tap to start sound" is needed. The
backdrop is a still of the opening view captured from the live scene, which fades into the live render so the reveal
has nothing to jump to.

Stack: plain HTML/CSS + one 2D canvas for particles, over a three.js `WebGLRenderer`. Works with any framework; in
R3F put the gate outside `<Canvas>` and flip classes from an `onCreated`/ready callback.

## When to use

- Load takes more than a second or two (GLBs, textures, shader compiles).
- The scene has sound that needs a user gesture.
- The first dive/zoom/interaction hitches because shaders compile on that frame.

## Paste-ready prompt

> Replace the loading screen of `{{entry file}}` with a cinematic gate: a layered CSS dawn (radial sun glow + banded
> sky gradient), `{{optional: a slowly rotating repeating-conic-gradient masked to a disc for god rays}}`, three
> blurred mist bands drifting on alternate animations, an SVG feTurbulence grain overlay, and a 2D canvas of
> petals and motes. The title animates letter-spacing .34em → .06em with a blur-in. A thin gold progress bar with
> stage captions. When loading completes the bar fades and "tap anywhere to enter" appears; that tap starts the
> music. Leave with opacity 0 + scale(1.06) + blur(8px). Use a still of the opening view captured from the live
> scene as the backdrop, cross-fade it into the live render when ready, and hide the HUD until entered. Before
> lifting the curtain, render one frame from each view that compiles new shaders (e.g. underwater) so the first
> interaction doesn't stall. `?tour` turns the gate text into "tap to start the tour".

## Implementation

### Layers (`references/loading-gate.html`)
Bottom to top: `.shot` (the captured still, `background-size:cover`, a 30 s scale drift 1.04 → 1.07) · `.tint`
gradient · `.mist` bands (`filter:blur(18px)`, radial white gradients, 46 s / 63 s / 80 s `translateX(±6%)`
alternate) · `<canvas id="loadFx">` petals + motes · `.vignette` · `.grain` (inline SVG feTurbulence
`baseFrequency .9`, `numOctaves 2`, opacity .06, `mix-blend-mode:overlay`) · intro text · progress bar · enter hint.
- Title: web handwriting font, `@keyframes titleIn { from { letter-spacing:.34em; filter:blur(6px); translateY(12px) } to { letter-spacing:.06em } }`,
  2.2 s with a .6 s delay; eyebrow / tagline / rule `riseIn` staggered .3 s, 1.4 s, 1.8 s.
- Particles: ~46 petals (pink/green hsla, rotate, "edge-on" thinning via a per-petal sine on y-scale and alpha) and
  ~70 rising motes with twinkle and `shadowBlur`, DPR-aware; stop the loop when the gate leaves (`__stopLoadFx`).
- Progress: `#bar i` width transition .5 s, glowing dot at the tip; caption swaps with a fade (`.swap`).

### States (`references/enter-and-warmup.js`)
- `body.loading` → HUD and wordmark hidden. `#loading.ready` → bar/caption/percent fade out, `.shot` fades
  (1.6 s) so the live scene shows through the now-translucent curtain, `.enter` fades in and pulses.
- Enter on `pointerdown` or `keydown` only once `.ready`: add `.leave` (opacity 0, scale 1.06, blur 8 px, 1.4 s),
  remove `body.loading`, start auto-orbit (or the tour), remove the DOM after 1.5 s.
- The orbit starts only on enter, so the still and the live camera line up exactly.
- `?silent` removes the "sound on" promise; `?tour` rewrites the enter text and starts the tour instead.

### Shader warm-up before the reveal
- Make the render loop a named `frame()`. At the end of `build()`, jump to each view that uses different programs
  (underwater: underwater pass, shafts, bubbles, the clipped mirror of the bed and fish), call `frame()` twice, then
  return to the opening view and render once — all behind the curtain.
- Measured with a `?nowarm` switch: first dive **163 ms cold → 10 ms warmed**.
- Create night-only lights at build time with intensity 0 — adding a light later recompiles every material.

### Capturing the backdrop still
- Render a frame with `frame()` and call `canvas.toBlob` **in the same task** (the drawing buffer is cleared before the
  next frame, not after this one), POST it to a throwaway local receiver, downscale:
  `sips -Z 1600 in.png --setProperty format jpeg --setProperty formatOptions 68 --out public/loading.jpg` (~500 KB).
- Re-capture after any change to the opening view.

## Pitfalls

- The main thread blocks for seconds while shaders compile at load; automation (MCP/CDP) calls time out in that
  window — wait ~15 s before probing.
- A dev server may cache `index.html`; after edits navigate with `?v=N`.
- Don't start audio on page load; only the gate's tap (or first pointer/key anywhere) may call `AudioContext.resume()`.
- If the still and first live frame differ (camera moved, orbit started early), the reveal visibly jumps.
- `hidden` attributes lose to author `display:` rules; hide with body classes or `[hidden]{display:none}`.

## Verify

- Throttle the network: captions progress, the bar never goes backwards, the gate waits at 100 %.
- The cross-fade from still to live shows no jump.
- First dive/first interaction after entering: no hitch (compare with `?nowarm`).
- Audio starts on the entering tap; `?silent` stays silent; `?tour` starts the tour from that tap.
- Phone portrait: title scales (`clamp(56px, 11vmin, 104px)`), nothing overflows.

## Related skills

threejs-webaudio-generative-soundtrack · threejs-camera-guided-tour · threejs-hud-objective-markers ·
threejs-webgl-performance-profiling · threejs-headless-visual-verification
