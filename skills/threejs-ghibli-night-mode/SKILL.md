---
name: threejs-ghibli-night-mode
description: Turns an existing three.js day scene into a Studio Ghibli-style night behind a ☾ toggle — indigo-to-teal painted sky, a storybook moon with maria, halo and rim, twinkling stars, Milky Way, hero stars and an in-shader shooting star, moonlit water with a reflection floor and silver glints, bioluminescent fish, purple-filled shadows, a cool grade and night exposure — all as one applyNight(k) cross-fade over the day state, with an eased moonrise. Use when adding night mode, moon, stars, moonlit water, day-to-night transition or a "Night Tune" panel to a WebGL/R3F scene.
---

# Ghibli night: moon, stars, moonlit water & glowing creatures

Produces a bright, vibrant anime night (never black): a deep indigo zenith fading to a cool teal
horizon, a big painted moon whose glint path runs down the water, stars the water reflects, and
warm/cool accents that give the eye a focal point.

Stack: three.js `WebGLRenderer` + `EffectComposer` (vanilla or React Three Fiber), sky as a
`ShaderMaterial` dome, other materials patched through `onBeforeCompile`. Assumes a day scene
already exists (see Related skills): a painted sky shader, a directional sun that every shader
reads, water with refraction/reflection, and a grade pass.

**Core idea:** night is a blend factor `k` (0 = day, 1 = night), not a second scene. One
`applyNight(k)` lerps every live value from the day state toward night constants, and is called
from the same place the sun update runs. The toggle, the tune panel and any day cycle all go
through it, so the day look keeps working and every night value is one lerp away from day.

## When to use

- A day scene exists and you want a night version behind a toggle.
- You need a painterly moon, stars, Milky Way or shooting stars in a sky shader.
- Night water looks like a black hole, fish vanish at night, or the night looks like "day through
  a blue filter".

## Paste-ready prompt

> Enhance the visual effects of the three.js scene in `{{entry file, e.g. index.html}}` to
> transition it into a Studio Ghibli-style night scene. The aesthetic target is
> `{{reference image path}}` — {{style: e.g. "painterly indigo night sky, luminous moon,
> twinkling stars, and deep moonlit water"}}.
>
> Keep every tunable as a named constant at the top of the script and expose them in a lil-gui
> **"Night Tune"** panel. Implement night as a blend factor `k` (0 = day, 1 = night) driven by a
> **`☾ Night` toggle** that cross-fades over `{{~4}}` s: write one `applyNight(k)` that lerps
> every live value from the day state toward the night constants, and call it from the same place
> the sun update runs so sliders, the day cycle and the toggle all go through it. After each
> section, screenshot close-up, eye-level and max-zoom-out views. **Verify the visibility of the
> fish and the water reflections before moving on.**
> 1. Painterly night sky (extend, don't replace, the day sky), a painted moon with a halo, stars
>    as `THREE.Points` with twinkle; retarget the directional light to the moon.
> 2. Moonlit water: a reflection floor, dimmed refraction, blue-shifted absorption, silver
>    glints at roughness ~0.2, soft ghost-blue caustics.
> 3. Fish: wet clearcoat, bioluminescent pattern spots and fin tips, a ghost/silver variety,
>    glowing ripple crests.
> 4. Night lighting and a cool grade; dim white albedos and the environment map.
> 5. A brighter night with a focal point: night exposure, a storybook moon, Milky Way, hero
>    stars, a shooting star, `{{warm pockets, e.g. paper lanterns / an oil lamp}}`.

## Implementation

### 1. Sky, moon and stars
Extend the sky `ShaderMaterial` — the day sky is still needed at k = 0 — and end with
`mix(dayColour, nightColour, uNight)`. Full shader: [`references/night-sky.glsl`](references/night-sky.glsl).
- **Gradient:** three stops — zenith `0x1a1e5e` (deep indigo), mid `0x2f4c94` (a Ghibli night is
  bright blue), horizon `0x3f8a98` (teal, light enough for the treeline to read as a silhouette).
  The same haze band ramps into the dark-blue terrain fog (`0x172642`, FogExp2 ≈ 0.012).
- **Moon:** project the view direction onto the moon's tangent plane (`muv = (d·mx, d·my)/size`),
  paint mottled maria with 2D fbm, a gentle limb falloff and a soft-edged disc. Keep the disc's
  linear value **≈ 0.8–1.0** (white after ACES × exposure but *under* the bloom threshold, so the
  maria survive). A separate warm-silver halo (`exp(-ang²/w²)·.5 + exp(-ang/(3.5w))·.14`) carries
  the glow into bloom. Storybook size: angular radius ~0.088 rad (~10° across), halo width
  scaled with the disc, plus a glowing rim hugging the limb: `exp(-((ang − size)/(size·.16))²)`.
- **Retarget the directional light** to the moon's vector and tint it silver-blue (`0xc9d6ff`).
  Every sun-driven shader (halo, clouds, toon ramp, caustics, water glints) follows for free.
- **Moonrise:** on the first frame with k > 0, start a cubic-out climb (~18 s) from −6° to the
  moon elevation; reset when k returns to 0. The *light* uses `max(el, 10°)` so the world is never
  lit from under the horizon. Keep calling `applySun` after the fade until the climb ends. Any
  path into night (button, tour) gets the rise for free.
- **Stars:** one `THREE.Points` on the sky sphere (R ≈ 470) with a per-star attribute
  `(size px, brightness, twinkle phase)`: ~2600 static dim background stars, ~700 twinkling
  foreground stars (`.55 + .45 sin(t·1.6 + phase + dot(pos, k))`). Clamp `gl_PointSize ≥ ~2.4 px`
  and let a soft circular alpha carry the rest. Put them on a layer the refraction camera doesn't
  render and hide them for the GTAO pass only — **but leave them visible to the mirror camera** so
  the water reflects them. Code: [`references/stars.js`](references/stars.js).
- **Milky Way:** `exp(-d²/w²)` around one great circle (w ≈ 0.13), brushed with fbm and split by
  a dark rift, ~0.075 linear, plus ~900 extra faint stars packed into the band.
- **Hero stars:** 20–30 in a second `Points` layer, ~15 px, with a four-point sparkle (thin cross
  spikes + core + halo), core ~0.7 so bloom only kisses them.
- **Shooting star:** computed in the sky shader from the time uniform — one slot every ~22 s,
  ~30 % empty, a thin streak with a tail, lifetime ~1.1 s. It costs nothing and the water reflects
  it for free.

### 2. Moonlit water
- **Reflection floor:** keep F0 = 0.02, then `F = max(F, uReflMin)` with ~0.22–0.30 at night.
  From above, Fresnel alone gives 2–3 % and the water becomes a black hole.
- **Dark refraction:** multiply the refraction sample by `uRefrDim` ≈ 0.65–0.78. Below ~0.5 the
  fish disappear.
- **Beer–Lambert:** absorption ≈ `(1.9, 1.1, 0.42)`/m (× ~0.7 for clearer water) and a dark-blue
  in-scatter (`0x0b1e3a`).
- **Glints:** GGX `directSpecular` already takes the light colour, so it turns silver by itself.
  Lerp roughness toward **0.2** and glint gain to ~0.55–0.7.
- **Caustics:** `mix(c, sqrt(c)*.5, uCausticSoft)` (~0.7) softens the web into a pale wash, tinted
  ghost-blue (`0x8fb8ff`); the caustic UV follows the light vector so they drift with the moon.

### 3. Fish and creatures
- Clearcoat → 1.0, clearcoat roughness → ~0.05: wet scales catch the moon near the surface.
- **Bioluminescence:** the pattern function also outputs a *glow mask* (red patches, tancho spot,
  asagi belly…); add `mask × colour × (.55 + .45 sin(t·speed + phase))` to
  `totalEmissiveRadiance` (orange `0xff7a30`, speed ~1.3 rad/s). On fins, use the root→tip weight
  in the vertex data for pale-cyan tips (`0x6cf2ff`). One shared `uBio` uniform × k.
- **Ghost variety:** silver, **mostly dielectric** (metalness ≈ 0.35) with a faint steady silver
  emissive. Fully metallic reflects only the dimmed env map and goes black.
- **Ripple glow:** when a surface kiss spawns a ring, have the normal loop record the envelope
  (`gCrest = max(gCrest, env × amp)`) and add `paleBlue × gCrest × ~0.9` (1.4+ reads as a neon hoop).

### 4. Lighting and grade
- Hemisphere: indigo sky / purple ground. A dark *hex* is tiny in linear space — `0x1e2a66` at
  0.75 contributes almost nothing; use mid-blues (`0x4a5cb0` / `0x54407a` at ~0.6–0.75), ambient
  `0x3a4c86` at ~0.55, and a purple shadow fill.
- Moon intensity ≈ 1/6–1/8 of the sun (**≤ ~0.55**). Above that, toon-ramped grass reads as
  daylight through a blue filter.
- Foliage: subsurface colour → cool cyan (`0x62e0f0`), rim → moon-blue; the banded ramp needs no change.
- Grade (linear HDR, before OutputPass/SMAA): shadows → deep teal/purple, a **mid-tone tint**
  toward cool blue (`mid = 1 − sh − hi`), highlights → silver, saturation **up** (~1.28). Bloom
  threshold 0.85 linear, strength ~0.6.
- Dim the environment map (RoomEnvironment ≈ 0.12 at night); scale god rays (~0.35×) and dust
  motes down with k.
- White albedos: at k = 1 multiply white-ish `MeshStandardMaterial` colours (luminance > ~0.5) by
  ~0.4, weighted by `smoothstep(lum, .45, .85)`. Collect once after loading; skip vertex- and
  instance-coloured materials and shader-coloured ones.

### 5. A brighter night with a focal point
A first pass usually comes out murky. Fix it in this order:
- **Night exposure:** `renderer.toneMappingExposure = lerp(dayExposure ~0.9, NIGHT_EXPOSURE ~1.15, k)`
  inside `applyNight`, so the panel's exposure slider must go through `applyNight` too. Exposure is
  applied after bloom, so it lifts the frame without new blooms — but lower the moon disc to ~0.8
  at the same time or it clips.
- **Brightness from colour, not the moon:** lighter mid-blues in the night sky, hemisphere/ambient
  and the grade's mid tint. Clearer water: absorption × ~0.7, reflection floor ~0.3, refraction dim ~0.78.
- **Warm pockets and life:** lanterns, a lamp, fireflies, lotus — see `threejs-night-lights-lanterns`.

Structure of `applyNight` / `stepNight`: [`references/apply-night.js`](references/apply-night.js).

## Pitfalls
- **Glint blobs:** water roughness below ~0.12 with bloom 0.85 turns every ripple facet into a
  blooming white disc — a field of them looks like a star cluster in the water and is easy to
  misattribute to the stars. Roughness 0.2 gives a broad painterly glint path.
- **Anything additive that was fine by day blooms at night:** stars, motes, ring glows. Keep star
  brightness (after tint) under the threshold and scale motes with the rays.
- **A blown-out moon** hides its painting. Disc ~0.8–1.0, the halo does the glow.
- **Metallic ghost varieties go black** when the environment intensity drops.
- **Create night lights at build time with intensity 0** and fade them with k. Adding a
  `PointLight` when night is toggled recompiles every patched material on that frame.
- **Mist is strong very quickly:** alpha 0.3 over the river turned the night into lavender fog;
  ~0.1 with a sparse `smoothstep(.5, .82, fbm)` reads as wisps.
- **Night clouds go white fast:** keep the lit colour in the mid-blues (`0xa3aed6`) and the moon
  glow narrow (`pow(nearMoon, 24)`).
- **Pure-day early return:** `applyNight` returns early at k = 0 when it wasn't night last frame,
  so the day panel keeps its edits. Therefore never write `x *= factor` inside it — write
  absolute values from a stored base, or values compound every frame.
- **Clouds fade on their own clock:** switching night → day instantly in a capture leaves navy
  puffs; shoot day views first or in a fresh page.

## Verify
- Drive k directly (`k = 0` / `k = 1`) to check end states; don't trust a fade in a background tab
  (`requestAnimationFrame` throttles to ~1 fps and screenshots are stale). Check
  `document.visibilityState` and that the time uniform advances.
- At k = 1: fish readable through the surface, banks and moon mirrored in the water, moon maria
  visible (not a white blob), no star-cluster glints, shadows purple not black.
- Toggle day → night → day and confirm the day values return exactly.

## Related skills
`threejs-ghibli-sky-clouds` · `threejs-webgl-realistic-water` · `threejs-fish-school-boids` ·
`threejs-night-lights-lanterns` · `threejs-day-cycle-lighting` · `threejs-postprocessing-anime-grade` ·
`threejs-ghibli-toon-shading` · `threejs-camera-guided-tour` · `threejs-headless-visual-verification`
