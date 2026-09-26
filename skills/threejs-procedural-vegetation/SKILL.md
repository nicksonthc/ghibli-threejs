---
name: threejs-procedural-vegetation
description: Builds and scatters storybook (Ghibli-scale) vegetation in three.js at scale with InstancedMesh — crafted GLB trees with leaf-card normals and shadow groups, a sakura made from a shader swap, procedural bamboo groves, leaf-card shrubs (mound/upright/arching habits, hydrangea mopheads), folded-blade meadow grass in tussocks, wildflowers with shader-only eye rings and clumps, painterly blob trees with shader-cut leafy rims, reeds/lilies/lotus, ferns, falling sakura petals and flooded rice paddies. Use when the user asks for trees, forest, grass, meadow, flowers, bushes, shrubs, bamboo, cherry blossom, petals, reeds, riverbank vegetation, foliage instancing, vegetation LOD/culling, or when foliage looks sparse, balloon-like, faceted or washed out.
---

# Procedural & instanced vegetation at storybook scale

A Ghibli meadow is dense, deep green and slightly oversized: blades and leaves big enough to read at 10 m, shrubs that rise out of the grass, trees whose crowns read as one mass, flowers with painted eyes, petals drifting from sakura. This skill covers how to generate, instance, cull and shade that vegetation without blowing the triangle budget.

Stack: three.js `WebGLRenderer` (r186), vanilla or R3F; `InstancedMesh` per (geometry, material, spatial cell); shading via the `patch()` helper from `threejs-ghibli-toon-shading` (wind, puff normals, SSS, flecks) with matching `customDepthMaterial`s. Seeded RNG (mulberry32) everywhere so layouts are deterministic.

## When to use

- Grass/flowers/trees exist but look sparse, flat, balloon-like or lime-green.
- You need thousands of plants with wind, shadows, culling and LOD.
- You want a new species without a Blender pass (a shader variant of an existing GLB).

## Paste-ready prompt

> Using `{{reference image}}`, revise the vegetation of `{{entry file}}`: a well-spaced `{{grove species, e.g. bamboo}}` grove on `{{left bank}}`, `{{flowering trees, e.g. sakura}}` on `{{right bank}}`, neat evenly spaced crafted leafy shrubs (boxwood/azalea habit, leaf cards in overlapping clumps on a dome, woody shoots at the foot, some flowering), meadow grass as folded blades in 2–5-blade tussocks, and wildflowers with shader-painted petal gradients, eye rings and veins. Everything instanced per spatial cell with wind, puff normals and matching shadow depth materials; crafted plants near the camera, painterly blobs in the haze. Keep hero objects and camera views unchanged. Screenshot the default and eye-level views against the reference and report the triangle cost.

## Implementation

### Instancing, culling, shadows (all species)
- Bake each GLB node transform into the geometry; one `InstancedMesh` per mesh per (species, shadow group, 16–32 m cell). `computeBoundingSphere()` + pad (~0.4–0.5 m for wind) so frustum culling works.
- Only instances inside the sun's shadow square (±13–15 m of the shadow focus) cast shadows; thousands of casting instances kill the shadow pass.
- LOD: `sparseGeometry(geo, groupSize, stride)` keeps whole cards/flowers by index decimation (e.g. `(…, 8, 3)` past ~33 m) — no fragmented triangles.
- Rank tall-tree candidates by distance to the stage **before** taking the N nearest, or the cap fills with far trees and near blobs survive.
- Background foliage blobs: `mergeVertices` the icosphere before jittering (else faceted), darker underside by object-space y, leaf-fleck noise, no shadows. Grass density falls off radially (`exp(-(d/11)²)`), no box boundary; flowers inside noise-edged ellipses.
- Keep above-water-only foliage on layer 1 so refraction pre-passes skip it — and enable layer 1 on the shadow camera or it stops casting.

### Crafted trees (Blender GLB, instanced 20–40×)
- Per-species brief to the modelling agent: metres, Z up, trunk base on origin, viewer side −Y, material names exactly `Bark / Moss / Leaves light / Leaves dark (/ Blossom)`, a triangle and MB budget, ≥3 preview iterations. Every first pass came back too sparse.
- Density: 45k triangles can't make a dense crown from 8–14 cm cards; it took 55–80k and 14–20 cm cards. GLB bytes (~112 B per card) bind before triangles do.
- Leaf cards get soft custom normals (`.7·billow ellipsoid + .3·crown dome`, 80 % over the card's own) and each card is wound to agree, else `DoubleSide` flips half the sunlit cards dark (`normals_split_custom_set_from_vertices`; the glTF exporter keeps them). Mirror most cards (p≈.55–.75) onto the billow's outward side.
- Hero trees that must read as one mass need **cores** at ~.55 R, built from the same card units on an opaque atlas texel, normals bent downward (`.35·ellipsoid + .15·crown − .5·Z`) so they shade as interior shadow. Faceted normals read as green boxes; smooth outward normals as balloons.
- Blender's glTF writes V as 1−V: author card UVs as `(u, 1−v)`; verify by parsing the GLB.

### New species as a shader (sakura from the elm GLB)
Alias the GLB, swap leaf colour for two pinks (`0xf0a3bd`, `0xffe6ee`) mixed by object-space `fbm3`, keep ~10 % green, **flecks off** (the fleck tint turns pink orange), per-material `uSssColor` pink (`0xffb8cc`), darker greyer bark (`0x6e5a55`). Same instancing/wind/shadow paths.

### Bamboo grove (procedural beats a GLB)
5 culm variants in metres: tapered tube, vertex-coloured node rings with a pale band just below each node, a slight arc; leaf sprays as 4-vertex lanceolate cards drooping from upper nodes with `clusterCenter` = spray centre. Instances only place/yaw/scale. 56 clumps ≈ 290 culms ≈ 270k triangles. Storybook scale: 7.5–9 cm culms, 40–60 cm leaves, deeper green (real 5 cm / 25 cm vanish at 10 m). Per-instance culm tints via `setColorAt` from their own RNG stream. Floor: fallen blades, banded-lathe takenoko; thin grass inside clumps by zero-scaling instance matrices (the grass RNG stays unchanged).

### Crafted shrubs (`references/shrub-geometry.js`)
`shrubGeometry(seed, { leaves, bloom, bloomColor, hue, habit, leafL, tip })`: 11–16 clumps in a (1, .8, 1) dome, ~1100 elliptic cards on each clump's outward shell (normal = outward·.75 + up·.45 + noise, tip droops 18 %), `clusterCenter` = clump centre, vertex colour deeper inside/underneath, yellow-green on sunny tips. ~900 triangles per shrub; 163 shrubs ≈ 150k. Habits: mound, upright vase (hydrangea: Fibonacci sphere of floret cards drifting between two colours), arching canes (yamabuki). Red new growth: lerp sunny outer leaves to a tip colour. Divide the leaf budget by the *actual* clump count; keep old variants' RNG streams untouched. Bank shrubs are a walk along each bank every ~3 m with jitter, not random blobs. Scale ×1.45 or they vanish in 0.6 m grass.

### Meadow grass (`references/meadow-grass.js`)
V-folded blade (3 verts per row, midrib raised `w·.45`), pointed tip, `computeVertexNormals`; blend normal toward view-space up by ~.18 in `normal_fragment_maps` (at .5 the meadow goes flat pale lime). Tussocks of 2–5 blades splayed outward, lean ≤ .33 rad, width ~8.6 cm at the base (`.043` × scale 0.8–1.4). Per-blade seed `fract(sin(dot(instanceMatrix[3].xz, …)))` → droop and a few dry tips; veins, darker foot, SSS `0xd9f07c` at .3. Cost: 10 tris × 100k ≈ 1.0 M. Keep grass off the toon ramp.

### Wildflowers (shader-only refinement)
`instanceGLB(…, { shader: mat => options })` so Petal/Centre/Stem get their own shading. Radial coordinates without UVs: measure head centre (Centre primitive bbox) and petal reach in mesh space in JS and bake them into GLSL (`vLocal` is mesh space because node matrices are baked into instances); spike flowers use height instead. Eye rings, throat, veins, translucency, pincushion floret discs, darker stem foot. White rays + SSS bloom into blobs: daisy `sss ≈ .22`, no tip lift, ×.82 albedo, SSS colour = petal ×.8. Clumps: 1–3 blooms + buds + basal rosette, keep ~60 % of placements (~1.5× triangles), per-copy `aHead` attribute (xyz + scale) because shading is relative to one head point. Flowers stand ~0.6 m: look down from ~1.7 m.

### Painterly blob trees, round two
Lumpy core (icosphere detail 2) + ~56 small leaf cards (core UVs pinned to an opaque leaf texel). Cut the outline in the shader: discard where `1 − |N·V| > .24 + .62·lobe(fbm3)`; darken clump gaps by the same noise (`references/canopy-rim.glsl`). Trunk: flared base + three forks, scaled `(g, h, g)` with `g = .75 + .05h`. Keep a grey copy of any tinted leaf card for instance-coloured variants (pink × yellow-green = brown).

### Water-edge plants, ferns, paddies, petals
- Reeds: cattail/rush/sedge chosen by zone, per-clump tint and height. Lily pad: polar grid, curled rim, veins/midrib/red rim in shader. Lotus: two lathe rings + seed pod; keep the lathe's normals (`computeVertexNormals` on non-indexed = facets).
- Fern: canvas frond texture on curved 7-segment cards arching from a crown, `clusterCenter` for puff.
- Rice paddies: terraces in `terrainHeight`, floor eased 6 cm under water with a bund; dilate wet cells one step in 4 directions within the same level; sheet 2.5 cm under the rim (dilating downhill floats a sheet over the riser). Rice hills on a 0.34 m grid.
- Sakura petals (`references/sakura-petals.js`): gather every sakura crown into one list; twice a second hand the 8 nearest to a GPU petal system (1440 instances) that spawns in the crown, falls, drifts downwind, tumbles and lies flat once landed; plus a static carpet per crown. Petals 3.5–4.5 cm (real 1.5 cm = 3 px at 5 m). Hide from AO.

## Pitfalls

- Near crafted trees that lose their slot to spacing must be **dropped**, not drawn as blobs — pink blobs next to the stage look like balloons. "Well spaced" means rejecting, not shrinking.
- Smooth icosphere shade cores are the worst artefact: ≤ .35 of clump radius and buried, or dark strands (willow); fill sky holes by adding clumps where no twig tip is near.
- Willow curtains: strands must be leaf-coloured ribbons; launch velocity (not limb reach) sets the spread.
- Pink vertex colour × green leaf atlas = muddy salmon: map blossom cards' `u` to the atlas's pale centre stripe (.45–.55).
- A mostly top-down default view hides banks off-frame: project candidates with `Vector3.project(camera)` and hand-place a few clumps at NDC x ≈ −0.8 to frame the view.
- Far scatter uses its own seed so near rocks/flowers/fish on the shared RNG keep their places.
- A trailing `// comment` pasted onto a line ending in `)` comments out the paren → "missing ) after argument list". Put comments on their own line.

## Verify

- Top view: meadow lush and deep green, no lime ground showing through.
- Eye level at 10 m: blades, culms and leaves still read; no balloon silhouettes.
- `renderer.info.render.triangles` before/after; toggle species on/off in alternating cycles for fps (single runs vary ±5 fps). 26 crafted trees cost ~2 fps.
- Shadows under trees move with the wind (depth materials patched).

## Related skills

`threejs-ghibli-toon-shading`, `threejs-blender-glb-pipeline`, `threejs-open-world-streaming`, `threejs-webgl-performance-profiling`, `threejs-stylized-rock-material`.
