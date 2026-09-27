---
name: threejs-webgl-underwater-effect
description: Lets the three.js orbit camera dive below a water surface and renders a convincing underwater view — Snell's window (the world above inside the 48.6° critical cone), total internal reflection outside it, teal underwater fog, light shafts along the refracted sun, a camera-tiled bubble cloud, a wobble/cyan-grade/vignette post pass, an over-under lens (half the frame above the water, half below, joined along the live waterline with a meniscus) while the camera crosses the surface, and a shader warm-up so the first dive doesn't hitch. Use when the user wants to go underwater, look up at the surface from below, add an underwater preset view, Snell's window, god rays under water, bubbles, a split / over-under / half-underwater shot, or when the first dive below the surface stutters or snaps between above and below.
---

# Underwater camera: Snell's window, TIR, shafts, bubbles, over-under lens

Drag the orbit below the waterline and the scene turns into a river seen from inside: a bright
circular window of the sky and banks overhead (squeezed into a ~97° cone), a mirror of the riverbed
around it, deep-teal fog, shafts of sunlight falling at the refracted angle, bubbles rising
past the lens, and a gentle wobble. While the lens is at the surface the frame splits: the banks above, the
riverbed below, a wavy meniscus between them. Built on the water from `threejs-webgl-realistic-water` (same
refraction/reflection targets, same patched `MeshStandardMaterial`, `side: DoubleSide`) in a
three.js `WebGLRenderer` + `EffectComposer` pipeline; works in R3F by doing the same in `useFrame`.

## When to use

- The scene already has refraction + planar reflection water, and you want the camera to go under it.
- You want an "Underwater" preset view looking up at the main subject.
- The very first time the camera crosses the surface there's a ~1 s hitch (shader compilation).
- Scrolling through the surface snaps from "all above" to "all below" and you want the half-and-half split
  shot of nature films instead.

## Paste-ready prompt

> Let me drag the orbit camera below the water surface in `{{entry file}}`. From below, show
> Snell's window (the world above within the 48.6° critical cone, total internal reflection
> outside it), a teal underwater fog, light shafts along the refracted sun direction, rising
> bubbles and a gentle wobble. Add an 'Underwater' preset view that starts underwater looking up
> at `{{main subject}}`. While the camera is at the surface, split the frame: above the live waterline show
> the world above the water, below it the underwater view, with a dark meniscus and a water film on the lens.
> Warm up the underwater shaders at load so the first dive doesn't hitch.
> Screenshot above, at the surface and below before and after.

## Implementation

### 1. Camera
- Raise OrbitControls `maxPolarAngle` to ~0.97π.
- After `controls.update()`: clamp `camera.y ≥ bed + 0.14`; push it out of `|y − waterHeight| < 0.05`
  so the near plane never slices the surface:
  `if (bed < -.1 && |y − hw| < .05) y = hw + (y < hw ? −.05 : .05)`.
  With the over-under lens (§7) skip this push wherever the lens can split (`bed ≤ −.25`): the lens
  handles the waterline itself, and the ±5 cm jump makes the split line leap.
- `under = camera.y < waveHeight(x, z) && terrainHeight(x, z) < 0` (use the live wave height if
  the water displaces, not `y = 0`).

### 2. Passes when `under`
- **Refraction pass** renders *all* layers (don't `layers.set(0)`), so the world above is available.
- **Reflection pass** flips the clip-plane normal (`(0, −1, 0)`) to keep what's *below* the surface —
  that's the total internal reflection image.
- **Main pass:** swap fog to deep teal (`FogExp2` ≈ 0.17), hide sky dome, stars, rain and
  above-water god rays; `scene.background = fog colour`; enable the underwater post pass.

### 3. Back face of the water (`!gl_FrontFacing`)
```glsl
float cosI = max(dot(-Nw, V), 0.);
vec2 wob = Nw.xz * .09 / (1. + surfZ*.08);                         // strong wobble
vec3 above = texture2D(tRefract, suv + wob).rgb * vec3(.82, 1., .98);
vec4 rcu = uReflMat * vec4(vWPos, 1.);
vec3 mirror = texture2D(tReflect, rcu.xy/rcu.w + wob*.6).rgb;
float win = smoothstep(.62, .70, cosI);                              // critical angle 48.6° → cos ≈ .66
vec3 col = mix(mirror*.9, above, win);
col += uSunColor * pow(max(dot(-V, uSunDir), 0.), 180.) * 6. * win;  // the sun burning through
col += vec3(.6,.9,.85) * pow(1. - abs(cosI - .66)*6., 6.) * .08 * step(abs(cosI-.66), .16);  // bright rim
```

### 4. Underwater extras (a group shown only when `under`)
- **Light shafts:** ~46 open additive cylinders (r 0.05–0.19, flaring ×1.8, 1.4 m long) hanging from
  the surface over water deeper than 0.2 m, aimed along the **refracted** sun:
  `sinR = sinI/1.33`, `down = (−sun.x/sinI·sinR, −cosR, −sun.z/sinI·sinR)`.
  Fragment: `core = |N·V|³ · (1 − |axis·V|⁴)`, depth fade
  `smoothstep(−.02, −.12, y)·smoothstep(−.9, −.25, y)`, streak noise, flicker, `× .16 × exp(−dist·.12)`.
- **Bubbles:** 260 points in a 5 m cloud **tiled around the camera** in the vertex shader
  (`p.xz += floor((cam.xz − p.xz)/5 + .5)·5`), rising `mod(y + t·(.10 + seed·.12), 1.2) − 1.1`,
  wobbling ±3 cm, discarded above `y = 0`, drawn as a ring with a highlight.
- **Post pass** (after bloom, before grade/OutputPass): UV wobble `±.0022`
  (`sin(uv.y·22 + t·1.6)`, `cos(uv.x·18 + t·1.3)`), cyan grade `c·(.72, 1, 1.04) + (0, .012, .016)`,
  heavier vignette.

See `references/underwater-fx.js` (shafts, bubbles, post pass, frame logic).

### 5. Preset view
An `underwater` view that starts just below the surface looking up at the hero,
e.g. `{ pos: [3.4, −0.42, 3.4], target: [1.2, 1.4, −0.8] }`.

### 6. Warm-up (kill the first-dive hitch)
The one-second hitch at the first crossing is **shader compilation**, not render cost: the
underwater pass, shafts, bubbles and the clipped mirror pass of bed and fish all compile on that
frame. Make the render loop a named `frame()`; at the end of `build()` (before the loading screen
lifts) jump to the underwater view and render one frame, then one from above. Measured with a
`?nowarm` switch: first dive **163 ms cold → 10 ms warmed**.

### 7. Over-under lens: half above, half below
Treat the lens as a camera-facing plate `L = band / tan(fov/2)` metres tall (`band` ≈ 0.30 m: the camera
height over which, at level pitch, the waterline sweeps the whole frame). For a pixel at NDC `(x, y)`:

```
side(x, y) = L·(x·tanH·right.y + y·tanV·up.y) − (waveHeight(lens point at x) − camera.y)    // > 0 above water
```

Using `right.y` / `up.y` (not the forward vector) makes the line follow roll and pitch, and a steep look
down or up falls back to a single side on its own.

- **CPU:** sample `waveHeight` at 5 points across the lens (`camera + right·x·tanH·L`) into a `float uD[5]`.
  Evaluate `side` at the frame's edges; if the sign never changes (±1 cm for the chop), render normally.
- **Split frame:** render the whole frame twice (pre-passes plus composer), first with the camera nudged to
  `min(y, hw − .06)` (`under = true`), then to `max(y, hw + .06)`, and restore it. The water shader picks its face with
  `gl_FrontFacing`, so the camera has to be on each side of the surface. Set `composer.renderToScreen = false`. The
  result is in `readBuffer` when the last enabled pass swaps, otherwise in `writeBuffer`. Copy the first result
  to your own target before the second render reuses the buffers.
- **Join** in a full-screen quad: `px = side / fwidth(side)` gives pixel distance to the line. Blend over
  ±1.2 px, darken with `1 − .55·exp(−px²/5)` (the meniscus), add a bright crest at `px ≈ 3`, add a silvery
  underside just below it, and warp the image above within 26 px so it sags toward the line (a water film on the
  port). Add a little high-frequency chop so the line never looks ruled.
- **Cost:** a split frame is about 1.5× a normal one, and scene draws dominate (GTAO and bloom barely matter). Give
  the under pass `camera.far ≈ 14 m`: fog at 0.17 hides everything past about 12 m, and culling saves the most.
  Share one shadow-map update between the passes. For offline capture, drop the cut, since it can give a far
  boulder a hard edge.
- `renderWorld(under)` now runs twice per frame, so set every per-side visibility explicitly (sky, stars, god
  rays, `underFX`, `rain.visible = rainOn && !under`). A toggle that is only ever turned off leaks into the
  second pass.

See `references/over-under-lens.js` (lens test, join shader, two-pass render, wiring).

## Pitfalls
- Forgetting to render all layers in the refraction pass when under → the window shows no foliage.
- Not flipping the clip plane → the TIR ring mirrors the sky instead of the bed.
- Without the lens, the near plane slicing the surface at `|y| < 0.05` gives an ugly accidental split; nudge the
  camera off the band. With the lens, don't nudge where it can split, or the line jumps (§1, §7).
- Over-under: rendering the "under" half without moving the camera below the surface shows the water's top face
  (`gl_FrontFacing` is decided by the camera, not by a flag).
- Shafts, motes and bubbles must be excluded from GTAO (hide them for the AO pass) or AO prints
  them as hard-edged sheets.
- Additive effects need non-negative colour; negative values show up as black dots.
- Measure the hitch with direct `frame()` calls + `gl.finish()`, not rAF — direct calls work in a
  hidden tab and give the compile cost exactly.
- The water's back face must be tested with `gl_FrontFacing`, so keep `side: DoubleSide`.

## Verify
- Drag or scroll slowly through the surface: no hitch. The waterline enters at the top, sweeps down the frame
  riding the waves, and leaves at the bottom (or the reverse), with no jump at the crossing.
- Split frame: banks and sky above the line, riverbed and fish below, a dark meniscus between, no top face of
  the water below the line; roll the camera and the line tilts with it.
- From below: a bright window overhead with the sun disc, a rim at its edge, the bed mirrored outside it.
- Shafts slant at the refracted angle and fade with depth; bubbles never appear above the water.
- Load with `?nowarm` and without; compare the first-dive frame time.

## Related skills
`threejs-webgl-realistic-water` · `threejs-fish-school-boids` · `threejs-camera-guided-tour`
· `threejs-postprocessing-anime-grade` · `threejs-webgl-performance-profiling` · `threejs-cinematic-loading-screen`
