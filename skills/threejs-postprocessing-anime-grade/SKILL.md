---
name: threejs-postprocessing-anime-grade
description: Sets up a Ghibli/anime post-processing chain for three.js EffectComposer — RenderPass → half-res GTAO (with additive/transparent objects hidden from it) → UnrealBloom with a linear-HDR threshold → optional underwater pass → split-tone colour grade (gold/peach highlights, teal shadows, saturation, warmth, vignette) → OutputPass → SMAA last. Covers bloom threshold maths before ACES, white-albedo toning, dark-speck and dark-sheet artefacts, and night grade variants. Use when the user asks for bloom, colour grading, anime/film look, tone mapping, GTAO/SSAO, SMAA/antialiasing, vignette, or sees glowing white blobs, sparkling grass, black specks on highlights, or dark sheets where light shafts/clouds are.
---

# Anime post chain & colour grade

The final look of a Ghibli frame is decided after lighting: soft contact shadows, bloom only on the sunniest tips and halos, warm gold highlights over teal shadows, a gentle vignette, clean edges. This skill gives the pass order that works, the numbers, and the artefacts each wrong choice produces.

Stack: three.js `WebGLRenderer` + `EffectComposer` (r186 addons: `RenderPass`, `GTAOPass`, `UnrealBloomPass`, `ShaderPass`, `OutputPass`, `SMAAPass`), composer target `HalfFloatType`, ACES tone mapping in `OutputPass`. Works the same in R3F with a manual composer.

## When to use

- The scene is lit and shaded; now it should read as a painted frame.
- White props bloom into blobs, grass tips sparkle, highlights have black specks.
- Light shafts, clouds or mist show up as dark hard-edged sheets.

## Paste-ready prompt

> Set up post-processing for `{{entry file}}`: `RenderPass → GTAO (half-res, 8 samples, 8 denoise samples) → UnrealBloom (threshold ≈ 1.05 linear, i.e. ~0.85 on screen) → [underwater pass] → grade (saturation, warmth, gold/peach highlights, teal/cyan mid-shadows, vignette) → OutputPass → SMAA`. Composer target HalfFloat. Hide god rays, dust motes, clouds, mist, hover rings and other additive/transparent sheets from the GTAO pass by wrapping `gtao.render`. Tone pure-white albedos down ~0.6×. Every value in the lil-gui Tune panel. Screenshot sunlit foliage, a white object and a backlit view; report the ms per pass.

## Implementation

Full wiring in `references/post-chain.js`; grade shader in `references/anime-grade.glsl`.

### Order and why
1. `RenderPass`
2. `GTAOPass` — half resolution (override `setSize` to `ceil(w/2), ceil(h/2)`), `samples: 8`, denoise `samples: 8, rings: 2, radius: 6`, `radius .35, distanceExponent 1.2, thickness 1.2`, `blendIntensity .85`. Soft contact shadows don't need full res; measured ≈ 8 ms at half-res on a 2.5K frame (early upper bound).
3. `UnrealBloomPass(strength .42, radius .55, threshold 1.05)`.
4. Optional underwater `ShaderPass` (UV wobble, cyan grade, heavier vignette), disabled above water.
5. Grade `ShaderPass` — linear HDR, **before** tone mapping.
6. `OutputPass` (tone mapping + sRGB).
7. `SMAAPass` — **must come after OutputPass**: on HDR input its edge detection prints dark single-pixel specks on bright highlights.

### Grade (linear HDR)
```glsl
float l = dot(col, vec3(.2126,.7152,.0722));
col = mix(vec3(l), col, uSat);                                    // 1.18 day, 1.28 night
col *= vec3(1.+uWarm, 1.+uWarm*.3, 1.-uWarm*.7);                  // warmth .05
float sh = 1. - smoothstep(0., uSplit, l), hi = smoothstep(uSplit, 1.1, l);   // split .35
col *= mix(vec3(1.), uShTint, sh*uSplitAmt);                     // teal 0x8ec6cf, amount .42
col *= mix(vec3(1.), uMidTint, (1. - sh - hi)*uSplitAmt);        // white by day; cool blue at night
col *= mix(vec3(1.), uHiTint, hi*uSplitAmt);                     // gold/peach 0xffe2bf
```
Vignette `smoothstep(1.05, .3, length((uv-.5)*vec2(1.15,1.)))`, strength .28. Exposure .9 by day.

### GTAO exclusions
Wrap `gtao.render`: hide everything in an `aoHidden` list (god-ray cylinders, dust motes, clouds, mist billboards, waterfall sheets, foam, paddy water, petals, hover rings) and an `aoOnly` list (stars — hidden from AO but still visible to the water's mirror camera), optionally render AO with `camera.layers.set(0)` so fine foliage on layer 1 is skipped (it already gets dappled sun shadows; this avoids cutout halos and millions of duplicate triangles), then restore.

## Pitfalls

- **Bloom threshold is linear HDR**, compared *before* OutputPass/ACES: "0.85 on screen" is ≈ **1.05 linear**. At 0.85 linear, sunlit grass tips sparkle.
- White albedos (shirts, paper, daisy rays) bloom into glowing blobs — tone them ~0.6× (at night ~0.4× for luminance > ~0.5; skip vertex/instance-coloured and shader-coloured materials).
- Anything additive with a negative colour (dust motes) shows as black dots — keep alpha/colour non-negative.
- Transparent sheets drawn solid by the AO pass print as dark panels — add every new transparent effect to the AO-hidden list.
- Saturated highlight tints (beyond `0xffe2bf`) or a shadow fill above ~0.2 turn sunlit grass lime.
- Guard every shader division (`max(x, 1e-3)`): Inf/NaN pixels become black specks that bloom spreads.
- Night: exposure is applied after bloom, so raising it lifts the frame without new blooms, but clips the moon — lower the disc value at the same time. Night bloom threshold .85 linear, strength ~.6; mid-tone tint toward cool blue.
- A subtle depth/normal ink outline was tried for trunks and judged not worth it.
- Reading back a WebGL canvas without `preserveDrawingBuffer` returns blank; pixel probes on it prove nothing.

## Verify

- Sunlit foliage at 1:1 zoom: no sparkling tips; only halos, cloud tops and sun-lit leaf tips bleed light.
- A white object in full sun: no bloom blob.
- Bright specular highlights: no dark single-pixel specks (SMAA after OutputPass).
- Toggle GTAO on/off with shafts/clouds in view: no dark sheets appear.
- Time each pass with `gl.finish()` + a `readPixels` of the **default framebuffer** (not a HalfFloat target — that's `INVALID_OPERATION` and silently gives CPU time only).

## Related skills

`threejs-ghibli-toon-shading`, `threejs-ghibli-night-mode`, `threejs-webgl-underwater-effect`, `threejs-webgl-performance-profiling`, `threejs-headless-visual-verification`.
