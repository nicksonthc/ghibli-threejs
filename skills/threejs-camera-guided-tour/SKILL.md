---
name: threejs-camera-guided-tour
description: Builds a hands-free guided camera tour for a three.js scene — keyframes as data, a time-parametrised Catmull-Rom (Hermite) path with continuous velocity, one camera-owner flag, the tour driving time of day and a day→night blend, staged creatures crossing the frame, handwritten captions, portrait-phone lens widening, instant hand-back on drag/scroll/tap/Esc, and a seek() hook for screenshots and video capture. Use when adding a tour mode, cinematic flythrough, attract mode, camera path animation, keyframed camera, spline camera or showcase video capture to a WebGL scene.
---

# Guided tour: a hands-free camera journey

A `▶ Tour` button (or `?tour`) plays a ~80–90 s camera journey that shows every core view in one smooth flow,
day into night, with one short caption per beat. The visitor can take over at any moment — the camera stays where
it is and the orbit controls pick up from there, no jump.

Stack: three.js `WebGLRenderer` + `OrbitControls`, an existing sun/day-cycle function and ideally a night blend
(see threejs-day-cycle-lighting, threejs-ghibli-night-mode). Vanilla or R3F (drive it from `useFrame`).

## When to use

- The scene is finished and you want an attract mode, a showcase, or a capturable video path.
- You have preset views and want them stitched into one continuous move.
- You need scripted camera motion that coexists with orbit controls, a day cycle and other camera owners.

## Paste-ready prompt

> Add a **Tour mode** to `{{entry file}}`: a hands-free camera journey of about `{{90}}` s that shows every core
> view in one smooth flow, ending at night.
> - **Entry/exit:** a "▶ Tour" HUD button. `?tour` does **not** skip the loading gate: it changes "tap to enter"
>   into "tap to start the tour", so that tap is the gesture that lets the music start. `?tour&silent` keeps the
>   music off for capture. The visitor leaves any time via the controls' `start` event, `wheel`, or Esc; the camera
>   stays put and the controls take over.
> - **Sequence** (every move eased, no hard cuts): `{{beats, e.g. 1 wide establishing orbit · 2 look up at the sun
>   through backlit leaves · 3 glide down through the water surface · 4 slow glide under the surface while 2–3
>   fish cross the frame, then rise · 5 core views · 6 pull back while day turns to night, tilt up to the moon ·
>   7 final wide night shot, fade in "tap to explore"}}`. One short handwritten caption per beat.
> - **How:** keys `{ t, pos, target }` plus `[t, value]` tracks for time of day and night blend; first key `null` =
>   the visitor's current camera. Time-parametrised Catmull-Rom on position and target, zero tangents only at the
>   ends. Reuse the scene's cinematic flag (`'tour'`). The tour owns the time of day. Stage the fish, don't chase
>   them. Widen the lens on portrait phones. Expose `tour.seek(seconds)`.
> - **Verify:** screenshot every beat by seeking and calling `frame()` directly, at 16:9 and phone portrait. Test
>   drag, Esc, wheel and completion paths.

## Implementation (`references/tour-path.js`)

### Keys as data
```js
keys: [ { t:0, pos:null, target:null },            // null = wherever the camera is now
        { t:5, pos:[7.5, 8.6, 10.8], target:[1.8, .4, -1.2] }, … ],
day:   [[0, .25], [61, .25], [70, .97], [80, .97]],   // dayPhase 0 sunrise … 1 sunset
night: [[0, 0], [65, 0], [75, 1], [80, 1]],
captions: [[2, 10, 'somewhere along the river'], …]
```
Tracks are piecewise with `smoothstep` between samples.

### Path: time-parametrised Catmull-Rom
- Hermite per segment with tangents `(p[i+1] − p[i−1]) · dt_seg / (t[i+1] − t[i−1])`. Velocity is continuous
  through every key: no stop-and-go. Tangents are zero only at the first and last key, so the tour eases in and out.
- Evaluate both `pos` and `target`; `camera.position.copy(pos); controls.target.copy(target); camera.lookAt(target)`.

### One camera owner
- Reuse the existing cinematic flag with the value `'tour'` — whatever already skips `controls.update()` and the
  ground/waterline clamp. **Audit every reader of that flag**: in the reference scene it also hid the hero object's
  hover glow, which the tour's close-up needed (the ring gets a special case for `'tour'`).
- Ignore view hotkeys while touring. End any follow camera before starting.

### The tour owns the time of day
- The day cycle, the night toggle and the night fade all write the same state and would fight it (the toggle even
  snaps the sun back to noon). Their per-frame steps return early while the tour is active; the tour writes day
  phase, sun angles and `k` every frame, then calls the one `applySun`.
- On exit: keep night on if `k ≥ 0.5`, else restore the visitor's day-cycle setting. Always switch `autoRotate`
  back on at the end (OrbitControls pauses it during drags and resumes by itself — just make sure no path leaves it off).

### Sun follows the lens (daytime beats)
- Keep the sun ~40–42° to the side of the lens heading, ~30° up (+ half the camera pitch, clamp 18–60°), eased with
  `1 − exp(−dt/2.4)` on the wrapped angle. Heading uses the sun's convention: `az = atan2(fx, −fz)` for
  `dir = (sin a, ·, −cos a)`. Side (±) is sticky: change only when the sun is > 8° from dead ahead.
- Boost god rays ×(1 + 2.2·w) and add forward scatter `pow(dot(−V, sunDir), 4)`; fade the follow out (w → 0)
  before the sunset sweep. Write **absolute** values (`params.rays * (1 + boost*w)`), and restore them in
  `stopTour` when a tour is cut short mid-day.

### Staged fish crossings (stage them, don't chase them)
- Pointing at a fish fails when underwater fog hides anything past ~3 m; following one makes the camera jerk.
- Table `{ t, dur, fish, dist, dy, dir }`. Each frame, place the fish on a line `dist` m (≈ 1–1.8) ahead of the
  lens, moving along the camera's screen-right axis from just past one frame edge
  (`dist·tan(vfov/2)·aspect + body length`) to the other, with a small bow toward the lens (`.14·sin(πu)`), heading
  from the path. Pure function of tour time, so `seek` lands mid-crossing.
- The flocking step skips `scripted` fish; on release, hand it a velocity along its crossing so it swims on.
- Widen the other fish's avoid-the-camera radius (~1.6 → 3.4 m) from the dive on, so the foreground clears.
- Stagger starts ~2 s apart, alternate directions and distances so they never overlap into one blob. Each fish is
  off-screen for its first and last ~1 s and on screen ~2.5 s.

### Portrait phones
- Widen the lens instead of pulling back: `vfov = 2·atan(tan(25°)/aspect)`, capped at ~80°. Pulling back from a
  target high in the sky pushed the camera into the canopy and under the water. Restore fov on exit.

### Ending
- On completion, optionally hand off to an auto-play of the hero interaction (e.g. the book reads itself with a
  4.5 s dwell per page); any pointerdown/keydown cancels the auto-play.

## Pitfalls

- Seeking into a *smoothed follow* shows the unsmoothed start — make scripted motion a pure function of time.
- The foreground only clears if the beat is *played* from the dive (~18 s): other fish need seconds to leave the
  widened radius. Seeking straight to the fish beat shows them in the way.
- CSS transitions (captions) run on real time, not the stepped `frame()` clock: screenshots right after a seek
  show stale captions. Drive captions from the tour clock if you capture video.
- A hidden/background tab throttles `requestAnimationFrame`: tweens freeze and FPS reads 0 — not a bug.
- Boosting with `uStrength *= boost` compounds every frame when the night code returns early in pure day (it
  reached 1e167). Always write absolute values.

## Verify

- `tour.seek(s)` + direct `frame()` calls for each beat, at 16:9 and ~390×844 portrait.
- Project each staged fish to NDC every 0.6 s: off-screen at both ends, on screen in between.
- Drag, wheel, Esc mid-tour: no camera jump, controls live, `autoRotate` on, day/night state sensible.
- Let it complete once end to end.

## Related skills

threejs-day-cycle-lighting · threejs-ghibli-night-mode · threejs-fish-school-boids ·
threejs-cinematic-loading-screen (`?tour` gate) · threejs-webaudio-generative-soundtrack ·
threejs-object-interaction · threejs-headless-visual-verification
