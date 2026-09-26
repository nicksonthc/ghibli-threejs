---
name: threejs-webgl-performance-profiling
description: Profiles and speeds up a heavy three.js WebGL scene with multi-pass rendering (refraction/reflection pre-passes, GTAO, bloom, shadows, thousands of instances) — honest GPU timing with gl.finish and a default-framebuffer readPixels, per-pass on/off toggles, triangles-per-mesh reports, shader-compile hitch warm-up, one shared shadow render per frame, render layers, distance culling and LOD, no-recompile light fading, program-cache keys, adaptive resolution and GLB compression. Use when the user says the scene is slow, stutters, hitches on first dive/click, fps dropped, asks for a performance pass, frame budget, or "report frame cost per pass".
---

# three.js WebGL performance profiling

A method, not a list of tricks: measure honestly, find the biggest cost, cut it without
visible loss, re-measure in the same session. Stack: three.js `WebGLRenderer` +
`EffectComposer` (vanilla or R3F), often with water pre-passes and post-processing.

## When to use
- "It's slow / janky / hitches", "profile the render passes", "report frame cost per pass".
- A one-off stall the first time something appears (diving, opening, night toggle).
- Before and after adding a heavy feature (foliage, water, fur, simulation).

## Paste-ready prompt
> Profile each render pass of `{{entry file}}` with synchronous timing (`gl.finish()` then a
> 1-pixel `readPixels` of the **default framebuffer**, warm-up render first, median of ~12
> runs) and list triangles per mesh (× instance count, with cast-shadow flag). Toggle each
> pass (AO, bloom, water, shadows, pixel ratio) on/off in alternating cycles. Cut the biggest
> costs without visible loss, then report before and after at the same size in the same session.

## Implementation

### Measure honestly
- **Timing:** run a warm-up render first (it includes shader compiles), then take the
  median of ~12 runs. Sync with `gl.finish()` followed by a `readPixels` of the default
  framebuffer. A `readPixels(RGBA, UNSIGNED_BYTE)` on a **HalfFloat** target is
  `INVALID_OPERATION`, which silently gives you CPU-submit time only.
- **Hitches:** measure with direct `frame()` calls + `gl.finish()`, not
  `requestAnimationFrame` — direct calls work in a hidden tab and give compile cost exactly.
- **fps toggles:** single runs vary ±5 fps. Toggle a feature on/off in alternating cycles
  and compare medians (26 crafted trees cost ~2 fps; a 256² × 225-tap wake simulation showed
  no measurable difference). See `references/profile-passes.mjs`.
- In a hidden/background tab `requestAnimationFrame` stalls: tweens freeze and FPS reads 0.
  Don't mistake that for a bug. An MCP/automation tab must be visible or an rAF-based
  evaluate hangs.
- Re-measure the baseline and the new build **in the same session at the same size**.

### Triangles per mesh
Log the top offenders after load (`?stats` flag):
```js
const costs = []
scene.traverse(o => { if (o.isMesh) costs.push({ name:o.name || o.material.name,
  triangles:(o.geometry.index?.count || o.geometry.attributes.position.count)/3*(o.count || 1), shadow:o.castShadow }) })
console.log(JSON.stringify(costs.sort((a, b) => b.triangles - a.triangles).slice(0, 15)))
```
The first bottleneck here was a 5k-triangle blob × 2000 instances. Also watch
`renderer.info.render.calls/triangles` per frame.

### Structural rules
- **One shadow render per frame:** `renderer.shadowMap.autoUpdate = false`; set
  `shadowMap.needsUpdate = true` once per frame before the pre-passes, so refraction,
  reflection and main passes share it.
- **Layers:** keep above-water-only foliage on layer 1 and render the refraction pass with
  layer 0 only. **Enable layer 1 on the shadow camera**, or the leaves stop casting shadows.
- **Shadow casters:** thousands of instances must not cast shadows. Only trees inside the
  sun's ±13 m shadow square cast; the square follows the view (snapped).
- **Culling:** bake node transforms, then `computeBoundingSphere()` + a pad (~.35 m for wind
  sway) so frustum culling works on instanced foliage. Add coarse distance culling (every
  0.25 s, radii matched to where fog is ~94 %).
- **LOD:** swap in a sparse index buffer (`sparseGeometry(g, groupSize, stride)` keeps every
  n-th card group) past ~33 m, back under ~27 m (hysteresis), checked every 0.2 s. Choose
  fur shell counts by distance (24/14/6/3/0).
- **Streaming:** build terrain chunks nearest-first, 2 per frame.
- **No recompiles at runtime:** create night/extra lights at build time with intensity 0
  and fade them. Adding a `PointLight` later recompiles every lit material on that frame.
  Prefer one real point light that follows the nearest source over N lights.
- **Program cache:** materials with identical `onBeforeCompile` source share a program. If you
  inject something only one material needs (a leaf-clearing `discard`), add a key such as
  `houseClip:true` to its `customProgramCacheKey`, or the other material gets it too. The
  reverse also holds: per-slot tint *uniforms* on otherwise identical materials keep one program.
- **Avoid extra passes:** swap a transmissive material (cornea, glass) for transparent
  clearcoat physical — transmission adds a whole extra render pass.
- **Adaptive resolution:** smooth frame ms (`avg = avg·.98 + ms·.02`), after 180 samples and
  12 s since the last change drop the scale ×0.9 (floor .7) above 28 ms, raise +.05 below
  18 ms (30 s later); reset on `visibilitychange`.
- **GLB weight:** Draco (`@gltf-transform/cli draco`) took four heavy models 13.97 → 2.17 MB.
  Prefer Draco over meshopt when shaders read object-space `position`.

### Shader-compile warm-up
The one-second hitch on the first dive under water was **compilation**, not render cost.
Make the render loop a named `frame()`; during load render one frame from the underwater
view and one from above before the loading screen lifts. Measured with `?nowarm`: first dive
163 ms cold → 10 ms warmed. The main thread blocks for seconds while shaders compile at load
— automation calls time out in that window; wait ~15 s before probing.

## Budgets that worked (upper bounds)
Frame ~20 ms at 2.5K; GTAO ≈ 8 ms at half-res (8 samples, 8 denoise samples); shadow pass
≈ 3.5 ms. Later `gl.finish()` timing put the composer at 8–18 ms and every other pass under
5 ms. Grass: 10 tris × 100k ≈ 1.0M; 163 shrubs ≈ 150k; a 290-culm bamboo grove ≈ 270k (+2 %).

## Pitfalls
- CPU-submit time masquerading as GPU time (HalfFloat `readPixels`, no `gl.finish`).
- Comparing numbers from different sessions, window sizes or a background tab.
- Multiplying light intensities in place every frame (compounding to 1e167) — write absolute values.
- Translucent / additive objects (rays, motes, mist, water sheets) in the GTAO pass cost time
  *and* print as hard sheets; hide them for the AO pass.

## Verify
Report a before/after table: per-pass ms (median), fps median, draw calls, triangles, GLB
MB, first-interaction hitch ms. Screenshot the same views before and after to prove "no
visible loss".

## References
- `references/profile-passes.mjs` — Playwright script: median frame time with passes toggled.
- `references/gpu-timing.js` — in-page synchronous per-pass timer.

## Related skills
threejs-headless-visual-verification · threejs-postprocessing-anime-grade ·
threejs-open-world-streaming · threejs-procedural-vegetation · threejs-blender-glb-pipeline ·
threejs-webgl-realistic-water · threejs-cinematic-loading-screen
