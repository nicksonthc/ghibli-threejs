---
name: threejs-webgl-realistic-water
description: Builds physically lit, painterly-realistic river/lake/pond water in three.js WebGL — depth-aware screen-space refraction, Beer–Lambert absorption and in-scatter, planar reflection with Schlick Fresnel, shadowed GGX sun glints, mipmapped slope-map ripples, ripple-ring sources, soft waterlines, chromatic caustics on submerged surfaces and a Voronoi pebble riverbed. Use when a three.js / React Three Fiber scene has flat, transparent or milky water, when the user asks for realistic water, refraction, reflection, caustics, a clear stream, a riverbed, or "water like Ghibli but physically lit".
---

# Realistic water (refraction, absorption, reflection, caustics, riverbed)

A water surface that reads as clear, deep and alive from max zoom-out to eye level: you see the bed
through it, the banks mirror in it at grazing angles, tree shadows dapple it, sun glints bloom off
ripples, and submerged stones carry a dancing caustic web. Proven on a three.js r186
`WebGLRenderer` + `EffectComposer` scene (vanilla, single HTML file); everything is built by
patching stock materials with `onBeforeCompile`, so it works the same inside R3F
(`material.onBeforeCompile` / `useFrame` for the pre-passes).

The water is a **`MeshStandardMaterial` (roughness ≈ 0.1, `side: DoubleSide`)** so it inherits
three's shadowed sun lighting and fog, and the final colour is composed yourself at
`#include <opaque_fragment>`.

## When to use

- The scene has a water plane (river, pond, lake) at a known height and a terrain/bed height function.
- Water looks flat, plastic, milky, or like a transparent sheet with no depth.
- You want caustics on everything below the surface, or a riverbed that reads as pebbles, not tiles.
- Follow-ups: go under the surface → `threejs-webgl-underwater-effect`; waves and floating
  objects → `threejs-boat-buoyancy-steering`; night water → `threejs-ghibli-night-mode`.

## Paste-ready prompt

> Enhance the water in `{{entry file, e.g. index.html}}`. The look to match is
> `{{reference image path}}` — **{{style: e.g. "Ghibli-painterly but physically lit"}}**. Water
> surface is the plane `y = {{0}}`; the terrain/bed height function is `{{terrainHeight(x,z)}}`.
> Keep every tunable as a named constant at the top of the script **and** in a lil-gui "Tune"
> panel. After each section, open the page in a browser, screenshot close-up, eye-level and
> max-zoom-out views, compare against the reference, and fix what's wrong before moving on.
>
> Replace any flat/transparent water with a `MeshStandardMaterial` (roughness ≈ 0.1,
> DoubleSide) patched via `onBeforeCompile`: a refraction pre-pass with a real `DepthTexture`
> (true thickness along the view ray), Beer–Lambert absorption `(0.95, 0.24, 0.20)`/m plus
> turquoise in-scatter scaled by the shadowed sun arriving at the surface, a half-res planar
> reflection mixed by Schlick Fresnel (F0 = 0.02), `directSpecular` glints ×~0.3, ripple normals
> from a precomputed mipmapped tileable slope map (4 octaves drifting downstream, faded with
> distance), a `vec4` ripple-source array, and a soft waterline. Inject a chromatic caustic web
> into submerged materials, and make the bed read as pebbles set in sand (domain-warped
> Voronoi, one rounded stone per cell). Report frame cost per pass at the end.

## Implementation

### 1. Render passes (per frame, before the composer)
1. **Refraction pre-pass.** Hide the water; render the scene into a `HalfFloatType` target with a
   `DepthTexture` (`UnsignedIntType`). Keep above-water-only foliage on layer 1 and render this
   pass with `camera.layers.set(0)`, then re-enable layer 1.
2. **Planar reflection.** Mirror the camera through the plane (Reflector.js construction), render
   at **half resolution** with `renderer.clippingPlanes = [plane]` keeping only what's above
   (`Plane((0,1,0), 0.015)`), then build the projective texture matrix
   `bias(0.5) × mirrorCam.projection × mirrorCam.matrixWorldInverse`.
3. **Main pass** via the composer, water visible.
4. Share one shadow render: `renderer.shadowMap.autoUpdate = false`, `needsUpdate = true` once per frame.

See `references/water-passes.js` (render loop + mirror camera + slope-map generator).

### 2. Water fragment (at `#include <opaque_fragment>`)
- **Thickness:** linearise scene depth vs. surface depth: `linZ(d) = 2nf / (f+n − (2d−1)(f−n))`.
  `thick = (sceneZ − surfZ) · |viewPos| / viewPos.z` → true path length along the ray.
- **Refraction offset:** `off = N.xz · uRefr · clamp(thick0·2.5, 0, 1) / (1 + surfZ·0.06)` — shallows
  barely distort, distance calms it. If the offset sample is *in front of* the surface
  (`sceneZ < surfZ`) fall back to the un-offset UV so above-water objects never leak in.
  Sample R/G/B at `ruv ± off·0.12` for dispersion.
- **Beer–Lambert + in-scatter:** `T = exp(-thick·absorb)`, absorb ≈ `(0.95, 0.24, 0.20)`/m (reds fade first).
  `under = refr·T + scatter·(1 − exp(-thick·0.9))·(0.15 + 0.65·sunLit)`.
  `sunLit` = luminance of `reflectedLight.directDiffuse` (white albedo) `· π / (sunLum · N·L)` —
  the lit/shadowed light arriving at the surface, so canopy shadows dapple the water.
- **Reflection:** sample the mirror target at `rc.xy/rc.w + N.xz·0.06/(1 + surfZ·0.04)`;
  `F = 0.02 + 0.98(1 − N·V)^5`; `col = mix(under, refl, F)`.
- **Glints:** `col += reflectedLight.directSpecular · ~0.3` — already GGX and shadowed; bloom does the rest.
- **Waterline:** `col = mix(refr, col, smoothstep(0, 0.035, thick))` — no hard edge at the bank.

### 3. Ripple normals
- Precompute a **512² tileable slope map** in JS: periodic value noise, octaves
  `[[4,1],[8,.55],[16,.32],[32,.17],[64,.09]]`, soft swells for P ≤ 8 and ridged `1−|2n−1|` above,
  stored as RG slopes (central differences × 18), `generateMipmaps`, `LinearMipmapLinearFilter`,
  max anisotropy.
- Sample 4 octaves drifting downstream at different angles/speeds (scales `.075, .19, .52, 1.45`,
  weights `.55, .38, .22, .10`), multiply by `uNStr / (1 + dist·0.035)`.
- **Ripple sources:** `uniform vec4 uRipples[8]` (x, z, strength, w). `w < 0` → steady rings
  (`sin(L·36 − t·5.2)·exp(−L·4.5)`, feet/posts); `w = startTime` → expanding ring
  `R = age·0.32`, envelope `exp(−((L−R)·16)²)·exp(−age·0.9)` (a fish kiss, a thrown stone).
- Normal = `normalize(vec3(-sl.x, 1, -sl.y))`, flipped for back faces, then to view space in
  `normal_fragment_maps` so three's lighting uses it.

See `references/water-material.glsl.js` for the full `onBeforeCompile` patch.

### 4. Caustics on submerged surfaces
Inject into `#include <emissivemap_fragment>` of bed, rocks, fish, posts:
- the iterated domain-warp caustic web (`causticF`, 4 iterations, tiles every 2π),
- sampled once per channel with ±0.004 offsets (chromatic),
- projected along the sun: `cp = wp.xz·0.42 + (sunDir.xz/sunDir.y)·wp.y·0.42`,
- faded in with depth: `smoothstep(0.02, −0.08, y) · exp(y·1.2) · smoothstep(0.02, 0.22, −y)`,
- `totalEmissiveRadiance += albedo · c · sunColour·1.1`.

See `references/caustics.glsl`.

### 5. Pebble riverbed
Domain-warped Voronoi (`warp = (fbm(wp·1.7), fbm(wp·1.7+5.3)) − .5)·0.9`) at two scales — gravel
(×8.5) and cobble patches (×3.6) picked by `step(.58, fbm(wp·.35))`. **One rounded stone per cell**
with jittered radius `0.30 + 0.16·hash`, set in sand so sand shows in the gaps; dome shading
`sqrt(1 − (dc/r)²)`, a speckle, a contact-shadow ring on the sand, algae thinning on stone
crowns. Perturb the view-space normal by the vector to the cell centre (`× pebMask × 2.2`) so each
pebble catches light. See `references/riverbed-pebbles.glsl`.

### Numbers that worked
| Constant | Value |
|---|---|
| roughness | 0.11 |
| absorb (/m) | (0.95, 0.24, 0.20) |
| F0 | 0.02 |
| glint gain | 0.28 |
| refraction offset | < 0.05 |
| ripple distance fade | 1/(1 + d·0.035) |
| waterline blend | smoothstep(0, 0.035, thick) |

## Pitfalls
- Per-pixel fbm normals alias at distance into sky-coloured noise → the water goes milky when
  zoomed out. Mipmapped slopes + the distance fade fix it.
- Absorption from *vertical* terrain depth instead of true thickness makes fish look grey.
- Strong in-scatter makes the water milky.
- Refraction offsets ≥ 0.05 smear the riverbed into mush.
- The classic caustic formula divides by `sin()` → infinities → black speckles. Clamp the
  denominators to `±1e-3` and the output to ≤ 4.
- In `onBeforeCompile`, inject helper GLSL *before* any code that calls it.
- `readPixels(RGBA, UNSIGNED_BYTE)` on a HalfFloat target is `INVALID_OPERATION` — time passes on
  the default framebuffer (see `threejs-webgl-performance-profiling`).
- Once the water displaces (waves), the plane needs real vertices (~55 cm cells) — a 1×1 plane can't move.
- Transparent sheets (foam, mist) near the water must be hidden from the AO pass or they print dark.

## Verify
- Zoom out to max distance: you must still see the bed, no milky noise.
- Eye level: the banks must be mirrored.
- Close up: fish stay vividly coloured; no leak of above-water objects into the refraction.
- Look for black specks on caustic stones (Inf) and hard edges at the bank.
- Measure refraction, reflection and main pass cost separately.

## Related skills
`threejs-webgl-underwater-effect` · `threejs-boat-buoyancy-steering` · `threejs-webgl-wake-simulation`
· `threejs-webgl-waterfall-effect` · `threejs-ghibli-night-mode` · `threejs-webgl-rain-effect`
· `threejs-fish-school-boids` · `threejs-postprocessing-anime-grade` · `threejs-webgl-performance-profiling`
