---
name: threejs-webgl-rain-effect
description: Adds clear / rain / thunderstorm weather to a three.js scene driven by one eased wetness value — GPU rain streaks in a camera-following box slanted by wind, rain rings on the water, lightning with Poisson strikes, multi-pulse flashes and delayed Web Audio thunder, denser colder fog, slate/ink storm sky, darker clouds, dimmed sun/moon/stars/god rays, wind gusts and wet (darker, glossier) materials — using a base×factors pattern so nothing compounds. Use when adding rain, storm, lightning, thunder, weather cycle, wet surfaces or overcast mood to WebGL/R3F.
---

# Weather: clear, rain and thunderstorm

One number, `WEATHER.rain` (clear 0, rain 0.7, storm 1), eases toward the selected mode and the
whole scene reads it: rain streaks and water rings scale with it, the sky and clouds go slate by
day and ink by night, the sun dims, fog thickens, materials get wet, and above ~0.75 lightning
starts.

Stack: three.js `WebGLRenderer` (vanilla or R3F) with `ShaderMaterial` / `onBeforeCompile`
patches; assumes a sun-update function (`applySun`) that writes lights and sky, and optionally a
night blend (`threejs-ghibli-night-mode`).

## When to use
- You want rain, a storm, lightning and thunder, or a weather toggle.
- Storm tints "stick" after returning to clear, or light intensities drift/compound over time.
- Rain looks like a static texture or pops when the camera moves.

## Paste-ready prompt

> Add weather to `{{scene}}`. One eased wetness value (clear 0, rain 0.7, storm 1) drives:
> - GPU rain streaks in a camera-following box, slanted by the wind, faded at the lens and the box edge
> - rain rings on the water
> - lightning: Poisson strikes, multi-pulse flashes, a cold directional burst, the fill light and
>   fog lifted, delayed brown-noise thunder
> - denser, colder fog; a slate/ink sky; darker clouds; dimmer sun, moon, stars and god rays; wind gusts
> - wet materials: roughness down, colour darker
>
> Alternate a clear day and a storm night across page loads (`?weather=` overrides). Expose
> everything in lil-gui with `.listen()`, plus a HUD button that cycles the modes. Verify that
> clear → storm → clear returns to the exact starting light values.

## Implementation

### State: base × factors (the important part)
- **Never multiply lights in place every frame.** `applySun` writes the clean state; the weather
  captures it as a base; each frame writes `base × factors`.
- **Before `applySun` runs, restore the base** (`weatherUndo`), because a night blend that skips
  half its writes in pure day would otherwise capture storm-tinted values as the new base.
- Order inside `applySun`: `weatherUndo() → applyDay() → applyNight(k) → captureBase() → applyWeather()`.
- `applySun` runs long before the weather module exists. Guard it with a hoisted
  `var weatherReady = false` (set true at the end of the weather module), **not** a `const`, which
  would hit the temporal dead zone.
- Overcast: `darkness d = min(1, rain·1.25)·0.75`; sun × `(1 − 0.85·d)`, hemi × `(1 − .25d)`,
  ambient × `(1 − .2d)`, exposure × `(1 − .18d)`. At 29 % less sun a rainy day still looked sunny.
- Sky stops lerp toward `0x6f7880 / 0x8a939a / 0xa3aaae` (day) and `0x10151f / 0x1a2230 / 0x2a3240`
  (night); clouds toward `0x7a8290 / 0x565d69 / 0x2c313b`. Moon × `(1 − .8r)`, god rays × `(1 − r)`,
  stars × `(1 − .92r)`.
- Fog (after the frame sets its base): density `+= rain·0.016`; colour toward `0x8c969d` by day /
  `0x232a36` by night × `d·.85`.
- Code: [`references/weather-state.js`](references/weather-state.js).

### Rain streaks (GPU)
- One instanced quad (6 vertices), up to ~14 000 instances, `instanceCount =
  RAIN_MAX·density·smoothstep(rain, .02, .4)`.
- Box 26 × 14 × 26 m centred on the camera: `p = cam + (fract(seed − t·speed/box) − .5)·box`, x/z
  drifted by the wind. Speed ~9.5 m/s ± 20 %.
- Streak axis = the fall vector `normalize(wind.x, −speed, wind.z)`; width axis =
  `cross(fall, view)`. Length 0.32–0.54 m, width 1.2–2 cm.
- Alpha fades under the water surface, at the box edge (30–50 % of the box) and right against the
  lens (0.9–2.6 m); `(1 − vT)·vT·4` tapers each streak. Colour = sky hemisphere colour lerped to
  pale grey, ×0.55 at night; flashes brighten it (`1 + flash·2.5`).
- Keep it on layer 1 so the refraction pass skips it; hide it underwater; add it to the GTAO-hidden list.
- Code: [`references/rain-streaks.js`](references/rain-streaks.js).

### Rain rings on the water
In the water normal: a jittered cell grid (two offset layers, ~2.6 cells/m). Each cell's ring
radius is `fract(t·rate + hash)·.42`, profile `sin((L − R)·44)·exp(−((L − R)·13)²)·(1 − age)`,
and `step(hash, rain·.9 + .1)` thins the rings at light rain. Fade by `1/(1 + dist·.06)`.
The same `uRain` uniform drives rock/terrain wetness (see `threejs-stylized-rock-material`).

### Lightning and thunder
- Poisson process above rain 0.75: next strike at `t − ln(1 − U)·60/(rate·(r − .7)/.3)`,
  `rate` ≈ 5 strikes/min at full storm. Seed the first one from the live clock (`t + 3..9 s`).
- Each strike: 2–4 pulses `[offset, amp]`, flash `k = max(amp·exp(−14·(age − offset)))`.
- Flash light: a cold `DirectionalLight(0xdfe6ff)` placed high at a random azimuth, intensity
  `k·7`; hemi `+k·1.6`, ambient `+k·.5`; sky, clouds and fog lerp toward pale blue-white.
- Thunder: 4 s of brown noise with a long `(1 − i/len)^1.6` tail, low-pass 160–280 Hz, delayed
  1.2–3.4 s, gain ∝ rain. Only after the visitor's gesture has started audio.

### Wind and wet materials
- Gusts: `uWind = base·(1 + r·1.4·(.75 + .25 sin(.37t) + .15 sin(1.3t)))` — trees, grass, swings follow.
- Wet: roughness × `(1 − .5w)`, colour × `(1 − .2w)`, with `w = rain·wet·2`. Take the list only
  **after the models load**, record originals once, rescale only when `w` moves > 0.01, and skip
  materials another system recolours (the night's white-dim list).
- Hide fireflies when rain > 0.35.

### Modes and UI
Alternate clear day / storm night across page loads (store the last mode in `localStorage`, in a
`try` block), `?weather=clear|rain|storm` overrides. A HUD button cycles clear → rain → storm.
lil-gui controllers use `.listen()` so they follow the eased values; a "⚡ strike now" button helps testing.

## Pitfalls
- **In-place multiplication compounds** — values drift every frame (the same bug sent a tour's
  god-ray strength to 1e167). Always write absolute values from a base.
- **TDZ:** `const weatherReady` referenced by an early `applySun` throws; use hoisted `var`.
- **Capturing the base after a partial write** (the night blend skipping writes in pure day)
  bakes storm tints in. Undo first, then write the day, then capture.
- **Wet-material list taken too early** misses every GLB material.
- **Timers seeded with small absolute values** (`next: 8`) fire at once because the frame clock
  is page time; seed from the first step's `t`.
- **Rain in the refraction/AO passes** prints dark streak sheets; keep it on layer 1 and AO-hidden.

## Verify
- clear → storm → clear: light intensities, sky and cloud colours return to the exact starting values.
- Storm by day and by night, from eye level and looking down on water (rings visible, streaks
  not blocking the lens), a forced strike, and underwater (no rain).
- Watch the lil-gui wetness value ease over the transition time (~6 s).

## Related skills
`threejs-day-cycle-lighting` · `threejs-ghibli-night-mode` · `threejs-webgl-realistic-water` ·
`threejs-stylized-rock-material` · `threejs-ghibli-sky-clouds` · `threejs-webaudio-generative-soundtrack` ·
`threejs-webgl-performance-profiling`
