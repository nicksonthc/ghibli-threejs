---
name: threejs-day-cycle-lighting
description: Animates the sun in a three.js scene from sunrise to sunset through a single applySun(az, el) writer — azimuth sweep, elevation arc, warm-to-gold light colour, horizon falloff, warming sky dome and fog, re-aimed god rays and every sun-driven shader uniform — plus a cinematic "sun follows the lens" mode that keeps the sun beside the camera heading for backlit shots with boosted god rays and forward scattering. Use when adding a day/night cycle, time-of-day slider, sunrise/sunset, moving sun, backlit tour shots, or when several systems fight over the sun direction in WebGL/R3F.
---

# Day cycle and sun-driven lighting

A toggle sweeps the sun across the sky; light colour, intensity, sky, fog, god rays, water and
every patched shader follow, and the shadow map follows for free. The key design is **one
writer**: `applySun(az, el)` writes the day state for that sun position, then the night blend on
top, then weather on top. The day cycle, GUI sliders, the night toggle and a guided tour all call
it, so nothing disagrees and nothing compounds.

Stack: three.js `WebGLRenderer`, a shadow-casting `DirectionalLight` with a target, shared
uniform objects (`uSunDir`, `uSunColor`, `uSunLum`) read by `ShaderMaterial`s and
`onBeforeCompile` patches. Vanilla or R3F.

## When to use
- Adding a day cycle or time-of-day control.
- The sky, clouds, water or foliage don't follow the sun (a shader kept its own copy).
- A tour or cinematic needs the sun placed for backlit shots.

## Paste-ready prompt

> Add a day cycle to `{{entry file}}`: a toggle animates the sun from sunrise to sunset.
> - Azimuth sweeps about 230°, and elevation = 3° + 70°·sin(π·phase).
> - Light colour lerps from warm orange to noon gold, and intensity falls near the horizon.
> - The sky dome warms and the fog tints warm.
> - Light shafts re-aim, and the water's sun-luminance uniform updates.
> - Shadows follow for free, because the shadow map updates every frame.
> Route everything through one `applySun(az, el)`; anything that already drives the sun (a sun
> GUI, a night toggle) must keep driving every shader.
>
> Optional, for tours: *"During the daytime beats of `{{tour}}`, move the sun with the camera:
> keep it ~40° to the side of the lens's heading, ~30° up (tilting the camera lifts it), easing in
> over a couple of seconds and never flipping sides. Make the god rays clearly stronger then and
> add forward scattering (brighter looking toward the sun). Fade the follow out before the sunset
> sweep."*

## Implementation

### The single writer
```
applySun(az, el):
  if (weatherReady) weatherUndo()     // restore the clean base (see threejs-webgl-rain-effect)
  applyDay(az, el)                    // this file
  applyNight(night.k)                 // threejs-ghibli-night-mode
  if (weatherReady){ captureWeatherBase(); applyWeather() }
```
- `sunDir = (sin a·cos e, sin e, −cos a·cos e)`; place the light 30 m up `sunDir` from a shadow
  focus point and aim its target there (move the focus with the view, snapped to 2 m, if the
  world is larger than the shadow frustum).
- `h = smoothstep(el, 4°, 40°)`: sun colour `lerp(0xff8a4a, noon, h)`; intensity
  `SUN · (.25 + .75·smoothstep(el, 0°, 25°))`.
- Sky stops, cloud mid/shade lerp toward a dusk palette by `1 − h`; fog colour toward `0xf0c49a`
  by `(1 − h)·.7`.
- Write `uSunDir`, `uSunColor`, `uSunLum` (luminance × intensity) every call — sky halo, clouds,
  toon ramp, caustics and water glints all read them.
- God-ray meshes: `quaternion.setFromUnitVectors(up, sunDir)`.

### The cycle
`phase = (phase + dt/150 s) % 1`, `az = −75° + 230°·phase` (east → west), `el = 3° + 70°·sin(π·phase)`.
When toggled off, restore the default sun and call `applySun` once. A tour owning the time of day
makes `stepDay` return early (`threejs-camera-guided-tour`).

### Sun follows the lens (cinematic)
- Heading uses the same convention as the sun: `camAz = atan2(fx, −fz)` for `dir = (sin a, ·, −cos a)`.
- Target: `camAz ± 42°`, elevation `clamp(30° + pitch/2, 18°, 60°)`. Ease with
  `1 − exp(−dt/2.4 s)` on the **wrapped** angle difference.
- **Sticky side:** change ± only when the sun is more than 8° from dead ahead, so it never flips
  across the frame.
- A sun ~40° off the view axis works better than straight ahead: the shaft shader fades as
  `1 − |dot(axis, V)|³`, so looking straight down a shaft makes it vanish. Side-on shafts plus a
  `pow(dot(−V, sunDir), 4)` forward-scatter term reads as backlit haze.
- Blend with a weight `w` that fades out over a handover window before the sunset sweep:
  `az = lerpAngle(sweepAz, followAz, w)`, `el = lerp(sweepEl, followEl, w)`.
- God rays while following: `strength = baseRays·(1 + 2.2·w)`, motes `1 + .8w`.
- Code: [`references/day-cycle.js`](references/day-cycle.js).

## Pitfalls
- **Compounding:** `applyNight` returns early in pure day, so `uStrength *= boost` compounded
  every frame (it reached 1e167). Write absolute values (`params.rays·(1 + boost·w)`), and put
  them back when a tour is cut short mid-day.
- **Several writers fight:** a day cycle, a night toggle and a tour all writing the sun. The night
  toggle even snaps the sun back to noon. Make their per-frame steps return early while a tour is
  active; one owner writes the phase and angles, then calls `applySun`.
- **Shafts at fixed spots:** beats aimed elsewhere get the backlight but no visible shafts —
  position the shafts where the shots look.
- **Shadow frustum:** a ±13 m frustum at home goes flat elsewhere; follow the view target, snapped.
- **Linear sun colour** normalised to its max channel reads orange; blend halfway to white for
  halo and cloud tints.

## Verify
- Step the phase through 0, .25, .5, .75, 1 and screenshot: sky, fog, water glints, shafts and
  shadows agree with the light direction at each.
- Toggle day cycle, night and weather in every order; the sun returns to the same state.
- During a tour, log the ray strength over time — it must stay bounded.

## Related skills
`threejs-ghibli-night-mode` · `threejs-webgl-rain-effect` · `threejs-ghibli-sky-clouds` ·
`threejs-camera-guided-tour` · `threejs-ghibli-toon-shading` · `threejs-webgl-realistic-water`
