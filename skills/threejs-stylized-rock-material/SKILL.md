---
name: threejs-stylized-rock-material
description: Creates painterly river-worn Ghibli rocks for three.js — Blender SDF/soft-min faceted stones with colour, crevices, worn edges and moss painted into COLOR_0 (moss in the alpha), plus a web shader that adds scale-correct granite grain, a derivative bump without a bumpMap, a wet band that follows the live waterline/tide, rain wetness and per-instance variation. Also covers reusing the rock shader on stone props (lanterns, cliffs) and seating fences on slopes by shearing. Use when the user asks for rocks, boulders, stones, granite, pebbles, cliffs, wet rocks at the waterline, moss on stone, stylised rock material, or rocks that look like soap bars or have zig-zag moss edges.
---

# Stylised river rocks: faceted granite, painted moss, a live wet line

Rocks in a Ghibli background are blocked in with soft, broad facets: pale warm tops, cool blue-grey flanks, dark crevices, pale worn edges, a little lichen, soft moss caps. At the river they are darker and glistening up to a wet line that moves with the water. This skill splits the job: **shape and broad paint** in Blender (baked to vertex colour), **fine grain, bump, wetness and variation** in the web shader.

Stack: headless Blender (5.x) + glTF export; three.js `WebGLRenderer` (r186), `MeshStandardMaterial` with `vertexColors` patched through `onBeforeCompile` (the `patch()` helper in `threejs-ghibli-toon-shading` with `color` / `normal` / `onShader` hooks). Rocks are `InstancedMesh`es (~800 instances, ~2.4k triangles each).

## When to use

- Rocks look like smooth noise blobs ("soap bars") or low-poly gems.
- Moss is a second material with a hard triangle border.
- Stones at the water's edge don't react to waves, tide or rain.
- You want a stone prop (lantern, cliff face) to match the rocks without new textures.

## Paste-ready prompt

> Refine `{{rock GLBs}}` into river-worn granite that matches `{{reference}}`: pale warm tops, cool blue-grey flanks, soft facets with rounded edges, dark crevices and pale worn edges, lichen, soft moss caps (no hard triangle edge). In the web shader add fine mineral grain, a bump, a wet band that follows the live waterline and tide, and rain wetness. Keep placements, instancing and shadows unchanged; ~2.4k triangles each.

## Implementation

### Shape (Blender, `references/rock-sdf.py`)
Two constructions that worked:
1. **Mesh route:** icosphere(5) → low-frequency lobes → carve 6–9 planes with a polynomial **soft-min** (`smin(r, off/dot(d, n), .055)`, offsets .72–.86) → optional fissure groove → decimate to 2.4k. The soft-min is what gives the painted "blocked-in facet" look; plain noise gives soap bars.
2. **SDF route:** ellipsoid + lumps, cut by large planes whose edges a smooth-max rounds, strata/bedding lines, cracks, a wedge split for split boulders, a tilted/dished top for stepping stones; shrink-wrap a sphere mesh onto the field, decimate to 2.4k. Specify every length as a fraction of the stone's size so variants rescale without retuning.
- Seat thin shapes (a 20 cm stepping stone) barely sunk and **never Y-squashed**.

### Broad paint in `COLOR_0`, moss in its alpha
- Warm sunlit top ↔ cool blue-grey flank (linear ≈ `(.36,.31,.235)` / `(.135,.16,.195)`), dark crevices from **curvature** (vertex minus neighbour mean, along the normal, over mean edge length, smoothed twice) or from SDF occlusion, pale worn edges from positive curvature, bedding bands, a darker foot, sparse lichen.
- **Moss as `alpha = 1 − moss`**, blended per vertex; the web shader reads it via `USE_COLOR_ALPHA` / `vColor.a`. As a separate material it leaves a zig-zag triangle border.
- Export with `export_vertex_color='ACTIVE'` — the default (`'MATERIAL'`) drops the alpha and COLOR_0 comes out VEC3. Check the accessor type in the GLB JSON.

### Web shader (`references/rock-shader.js`)
- **Per-instance seed** for free: pass `instanceMatrix[3].xyz` as a varying in the vertex hook.
- **Grain:** noise on `vLocal*3 + seed*.61`. Dark mica specks at **72** cycles (×.76) and pale feldspar at **125** (×1.16) read as granite; 17–46 cycles read as dalmatian spots (the GLB is instanced at up to 2.2×, so `vLocal` noise grows with it). Faint veins; tufted moss (never flat paint). Fade grain and bump by `length(vViewPosition)` — gone by ~22 m (they alias beyond).
- **Bump without `bumpMap`** (perturbNormalArb on your own height):
  `normal = normalize(|det|·normal − s·sign(det)(dFdx(h)·cross(dpy,N) + dFdy(h)·cross(N,dpx)))`, `dpx/dpy = dFdx/dFdy(−vViewPosition)`, `s` = metres of relief (~0.012).
- **Wet line:** include the same wave function the water uses (`waveDisp(xz, t).y`) in the fragment shader; `wet = smoothstep(wl + band, wl + .008, y)` with a noisy band ≈ 7 cm (scaled by wave amplitude); `max(wet, rain*.85)`. Wet colour `pow(c, 1.3)·.78`, roughness → **.32**, plus a faint pale tide mark just above the band. Moss wets less and stays matte (roughness → 1).

### Reuse on other stone
- **Stone lantern / unpatched GLB props** read flat: apply the rocks' granite shader, then lift or tint colour after the shader's colour stage.
- **Cliff faces:** reuse the rock shader and inject extra wetness by string-replacing its rain term (`uRain*.85)` → `max(uRain*.85, cliffWet(vWPos)))`).

### Fences on slopes: shear, don't tilt
`matrix = T · R_y · Shear(y += k·x)` with `k = (h1 − h0)/len`, `matrixAutoUpdate = false`, so rails follow the ground and posts stay plumb (`references/seat-raked.js`). A 4 m run on a village slope rose 0.9 m — tilted, one end floated and the other was buried.

## Pitfalls

- Roughness **.16** on the wet band mirrors the sky as a white smear on the stone's foot; .32 glistens without it.
- Grain frequency chosen at 1× instance scale turns into spots on 2.2× instances — pick frequencies at the largest scale.
- Blender previews lack the web shader: score rocks in the scene (previews underrated them by ~1 point).
- Icosphere `detail = 1` moss reads as flat leaves; use 2. Clamp moss domes at Z ≥ 0 or grounding lifts the model.
- Blender 5.x `primitive_ico_sphere_add(subdivisions=1)` is a bare 20-face icosahedron.
- `me.materials.clear()` after setting per-face material indices resets every face to slot 0 — add slots first.

## Verify

- Parse the GLB JSON: COLOR_0 accessor type is `VEC4`.
- Close-up at the waterline while waves run: the wet band rises and falls with the swell; toggle rain → all stones darken and glisten.
- At 2 m, 8 m and 25 m: grain reads as granite, no aliasing shimmer far away.
- Seated fence runs: both ends touch the ground, posts vertical.

## Related skills

`threejs-blender-glb-pipeline`, `threejs-ghibli-toon-shading`, `threejs-webgl-realistic-water`, `threejs-boat-buoyancy-steering` (shared wave function), `threejs-webgl-rain-effect`, `threejs-webgl-waterfall-effect`.
