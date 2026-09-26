---
name: threejs-boat-buoyancy-steering
description: Floats a boat (or any buoyant prop) on three.js water with Gerstner waves generated from one JS table that feeds both the GLSL vertex shader and a CPU waveHeight(), four-probe heave/pitch/roll damped springs, an arc-length drift lane that bends round rocks, click-to-steer W/A/S/D rowing with momentum and drag, an autopilot that pursues the lane back, and a chase camera that keeps the orbit. Use when the user wants a drifting or steerable boat, buoyancy, objects bobbing on waves, Gerstner waves on a river/lake, a boat autopilot, or a follow/chase camera behind a vehicle on water.
---

# Boat on waves: shared GPU/CPU Gerstner, buoyancy, lane, helm, chase camera

A small rowing boat carrying `{{character}}` drifts downstream, rises and rocks on a gentle swell
that exactly matches the drawn water, swings round submerged rocks, and can be taken over by
clicking it (W/S row, A/D steer). Let go and after 3 s the autopilot steers back and rejoins its
lane. A chase camera rides along without stealing the orbit. Built for a three.js WebGL scene
whose water is a patched `MeshStandardMaterial` (see `threejs-webgl-realistic-water`); the same
logic runs in R3F `useFrame`. This takes the idea of a TSL/WebGPU "boat on waves" template and
applies it to an existing WebGL scene — rewriting `onBeforeCompile` patches in TSL isn't worth it.

## When to use
- You want anything to float (boat, lily pads, lanterns) on displaced water.
- You want a boat that drifts along a river on its own, or that the visitor can steer.
- You need a chase/follow camera that still lets the user orbit and zoom.

## Paste-ready prompt

> Give `{{water}}` a slow tide and a few Gerstner trains in the vertex shader, and float
> `{{boat}}` on them: sample the same height function on the CPU at the bow, stern, port and
> starboard. Heave follows the mean, pitch the bow–stern difference, roll the port–starboard
> difference, each through a damped spring. Lily pads, lanterns and the camera's waterline guard
> use the same function.
>
> Add a small wooden rowing boat carrying `{{character}}`, drifting downstream. Smooth motion: a
> lane offset from the centreline that bends round submerged rocks and is smoothed, constant m/s
> along it (slower where the visitor looks), heading eased late, a gentle bob/roll/pitch, fish
> that give it room. Click `{{boat}}` to take the helm: W/S row, A/D steer, momentum and water drag,
> a rudder that bites with speed, soft collisions with banks and rocks. After 3 s without input
> the autopilot steers back and rejoins its lane smoothly. While steering, glide the camera to a
> chase framing behind `{{character}}` (about 6 m back, 2 m up) with a little lag; dragging still
> looks round the boat, the wheel zooms, and after a drag hold the view ~4 s before easing back
> behind the stern over ~3 s. Never go through the bank or into the river. Hand back to the free
> orbit a few seconds after the autopilot has the boat again, or on Esc.

## Implementation

### 1. One wave table → GLSL + CPU
`WAVES = [{dir, len, amp, speed, q}, …]` + `TIDE = {amp, period}`. Normalise `dir`, `k = 2π/len`.
Generate `waveDisp(p, t)` (Gerstner: `y += A sin θ`, `xz += qA·dir·cos θ`) and `waveSlope(p, t)`
GLSL strings from the table, **printing constants with `toFixed(5)`**; `waveHeight(x, z, t)` sums
the same sines on the CPU. GPU and CPU can't drift apart. See `references/gerstner-waves.js`.

River values that worked (a river isn't an ocean): four trains, 9.0/5.3/3.1/1.9 m wavelength,
2.2/1.4/0.8/0.5 cm amplitude, q 0.35–0.55, plus a 1.8 cm tide over 26 s. **About 2–5 cm of swell
plus 2 cm of tide** reads as alive without flooding the deck or lifting lily pads over the banks.
Expose a global amplitude in the Tune panel (both sides read it).

- The water needs real vertices once it displaces: 1×1 → ~200×309 (about 55 cm cells). A
  camera-following grid snapped to its own cell size keeps world-anchored waves from swimming.
- Add `waveSlope × 1.3` to the ripple normal, or the light won't follow the swell.
- The camera's underwater test and its "off the waterline" guard compare against
  `waveHeight(x, z)`, not `y = 0`.

### 2. Buoyancy (four probes, damped springs)
Probes 1.3 m fore/aft and 0.45 m port/starboard of the hull centre:
`heave = mean(hB, hS, hP, hR)`, `pitch = atan2(hB − hS, 2·1.3) + trim(0.02)`,
`roll = atan2(hP − hR, 2·0.45)`. Each through a spring `a = 16(x* − x) − 4.5v` (≈ 0.6 Hz, settles
in ~1 s). Euler order `YXZ`; with the bow on local +X, `rotation.z` tips the bow and `rotation.x`
rolls. The character leans against the roll (`−roll·0.6`).

### 3. Drift lane
- Sample `riverCenter(z) + offset` every 0.5 m; push points away from obstacles
  (`need = r + 1.1`, falloff over `1.8·need` in z).
- Run 6–8 passes of `[1 2 1]/4` smoothing, then `CatmullRomCurve3(pts, false, 'centripetal')`.
- Use `getPointAt`/`getTangentAt` (arc length, so the speed is honest): 0.9 m/s open river,
  0.24 m/s past where the visitor looks.
- Yaw = `atan2(−t.z, t.x)` for a bow at local +X, eased `min(1, dt·0.8)` (a drifting boat swings a
  little late) plus a slow wander `0.07 sin(t·.13) + 0.04 sin(t·.31)`.
- Loop by restarting far upstream round a bend, deep in the haze (or inside a mist bank).
- **Rebuild the lane after all scatter is done** — built earlier it "avoids" an empty obstacle list.

### 4. Helm: `auto → manual → return → auto`
- One hull model for manual and return: `v += (thrust·1.1 − v·0.35 − v|v|·0.22)·dt`;
  yaw rate eases toward `turn · 0.9 · (0.35 + min(|v|, 1.2))` (rudder bites with speed).
- **Return** = pure pursuit of the lane point ~4 m ahead (8 samples at 0.5 m) of the nearest
  pre-sampled point; hand back to `auto` when offset < 0.3 m and heading error < 0.12 rad,
  setting the arc length to that sample.
- Banks push back down the water SDF's gradient (keep 1 m clearance) and soak up speed;
  rocks shoulder the hull aside (`need = r + 0.7`, `v *= 0.96`).
- Hold-W boost: after 3 s thrust ramps to ×1.9 over 1.5 s.
- Accept WASD **only after the boat has been clicked**, so the keys stay free otherwise; ignore
  keys when typing in inputs; clear held keys on `blur`. Click = pointer moved < 6 px since down.
- Publish the boat position/heading/speed to the water (wake, foam) and to the fish (avoid radius ~1.9 m).

See `references/boat-helm.js` (lane, helm, buoyancy) and `references/chase-camera.js`.

### 5. Chase camera that keeps the orbit
- Target = a point just ahead of the character's head, smoothed `1 − exp(−dt·4.5)`. **Carry the
  camera by the same translation as the smoothed target**, so OrbitControls keeps the user's offset.
- When not dragging and moving (`|v| > 0.15`): relax only the azimuth relative to the heading
  (`rel *= exp(−0.55·swing·dt)`); ease distance to 6.2 m (+1.4 m while boosting) and elevation to
  the preferred tilt. A drag's final tilt becomes the new preferred elevation (clamped 0.03–1.2 rad),
  so lowering the eye looks far downriver; a wheel zoom sets the preferred distance.
- After a drag, hold 4 s, then ease the swing back in over 3 s (`smoothstep(since, 0, 3)`).
- Floor: `y ≥ max(terrain + 0.5, waveHeight + 0.35)`.
- Disable `autoRotate` while following and restore it afterwards. If the autopilot loop teleports,
  end the follow (or cut through a mist overlay) instead of flying across the world.

### 6. A lantern at the bow
Hang it plumb from a pole via `inverse(hull world quaternion) × swing` with a pendulum spring
driven by `−acceleration/g` — see `threejs-night-lights-lanterns`.

## Pitfalls
- A Python heredoc edit turned `'\n'` inside a JS template literal into a real newline and the page
  died at 0% with `Invalid or unexpected token`. Escape it as `\\n`, or edit with a raw string.
- The boat's speed/heading are unset until its first step → anything reading them gets `NaN`,
  which survives every later frame and hides meshes. Default inputs to 0 and reset non-finite state.
- The lane passing a point of interest at 5.3 m means a 5 m trigger never fires — check trigger
  distances against the real path.
- Walk the lane numerically: clearance from every bank and depth under the keel (≥ 2.2 m and
  ≥ 0.45 m worked).
- `OrbitControls.maxDistance` silently clamps debug cameras; raise it for aerial checks.

## Verify
- Freeze time and compare the hull's waterline against the drawn surface at several phases.
- Take the helm, row into a bank and a rock, let go, and watch the return merge without a snap.
- Drag the camera while following, release, confirm the 4 s hold and the gentle swing back.
- Print lane clearance/draft stats over the whole voyage.

## Related skills
`threejs-webgl-realistic-water` · `threejs-webgl-wake-simulation` · `threejs-night-lights-lanterns`
· `threejs-skeletonless-character-animation` · `threejs-fish-school-boids` · `threejs-open-world-streaming`
· `threejs-hud-objective-markers` · `threejs-object-interaction`
