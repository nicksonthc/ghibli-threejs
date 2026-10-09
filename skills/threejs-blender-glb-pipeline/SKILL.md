---
name: threejs-blender-glb-pipeline
description: Builds a reference-image-driven asset pipeline from headless Blender to GLB for a three.js scene — an asset contract (units, axes, grounding, required mesh/material names, budgets, attachment numbers), one parallel subagent per asset group writing craft_<slug>.py generators, preview renders compared against the reference, measured-bounding-box placement in the web scene, Draco compression, and a scored asset quality pass. Use when the user has a reference picture and wants a 3D scene from it, asks to model props/trees/characters in Blender for three.js, export GLBs, fix glTF export issues (vertex-colour alpha, UV flip, axes, custom normals), compress models, or rate and improve every asset in a scene.
---

# Headless Blender → GLB → three.js pipeline

Turn a reference image into an explorable three.js scene built from procedural Blender
generators. Stack: Blender 5.x run as `{{blender path}} --background --factory-startup
--python craft_<slug>.py`, glTF 2.0 binary export, three.js `GLTFLoader` (+ `DRACOLoader`),
vanilla or R3F. The generators are deterministic Python (seeded), so every asset can be
rebuilt, reviewed and iterated by agents.

## When to use
- "Turn this picture into a 3D scene", "model the `{{object}}` in Blender", "make GLBs for …".
- A scene needs new props, trees, figures or buildings that must match a painted reference.
- glTF export looks wrong in three.js (lost vertex alpha, flipped UVs, faceted or
  black-flipped leaves, rotated parts), or the models are too heavy to load.
- You want a systematic "score everything, fix the worst" quality pass.

## Paste-ready prompt
> Turn `{{reference image}}` into an explorable 3D scene with orbit camera controls and
> preset views. Use my headless Blender (`{{blender path}}`) to produce one GLB per object.
> - **Asset contract first:** write `blender/CONTRACT.md` covering metres, Z-up, the
>   viewer-facing side on −Y, the grounding rule, **required mesh/material names** the web
>   code will look up (e.g. `Leaves*` for wind, `{{Shirt}}` for breathing), budgets, and an
>   acceptance loop (render a preview, compare with the reference, iterate ≥ 3 times, check a
>   rear view). Give each asset its **attachment numbers**: rope anchor points, the Z of the
>   surface a figure rests on, a chest pivot.
> - **Parallelise:** one subagent per asset group (tree / figure / architecture / props /
>   instancing assets). Each writes `craft_<slug>.py` + GLB + preview + entry JSON; merge
>   the manifest yourself. Review every preview against the reference and send weak ones back.
> - **Textures from the reference:** perspective-crop painted surfaces (a canvas, a
>   sketchbook) straight out of the image with PIL `Image.QUAD` and map them onto the model.
> - **Web scene:** a single HTML file, three.js via import map. Place every GLB from its
>   *measured* bounding box, never hard-coded offsets. Derive dependent placements from the
>   reported numbers (e.g. tree yaw from the rope anchor, so the swing lands under the limb).
>   A terrain height function shared by JS scatter and shaders. OrbitControls with damping,
>   preset view buttons with numeric hotkeys, a loading bar.
> - **Instance at scale:** grass and flowers as `InstancedMesh`; reuse GLB sub-meshes as
>   instanced geometry via `mesh.matrixWorld × instanceMatrix`.
> - **Verify** in a real browser each round: reference view, eye level, close-up, max
>   zoom-out. Read the console. Profile triangles per mesh when it's slow.

Per-asset agent prompt (e.g. one tree species per agent):
> Build ONE Blender `{{asset}}` from this reference following `blender/CONTRACT.md`: metres,
> Z up, ground Z = 0, base on the origin, viewer side −Y. Material names exactly
> `{{Bark / Moss / Leaves light / Leaves dark (/ Blossom)}}`. Budget `{{N}}` triangles and
> `{{M}}` MB because it is instanced `{{20–40}}`×. Iterate ≥ 3 times comparing the preview PNG
> with the reference; report the `EXPORTED` line and the REQUIRED numbers.

Then review each preview yourself and send back **specific** fixes — every first pass of
the trees came back too sparse.

## Implementation

### Contract and helper library
- Start from `references/CONTRACT.template.md`. It fixes units, axes, naming, budgets,
  acceptance and the report format, so parallel agents produce interchangeable assets.
- `references/studio.py` is a small helper library: `mat()` (painterly materials with
  optional sRGB-correct grain), `Builder` (accumulate geometry per material → one mesh per
  material, so draw calls stay low), primitives (`box`, `tube`, `lathe`, `sphere`,
  `extrude`), and `export()` which grounds at Z = 0, writes `.glb`, `.blend`, a transparent
  Cycles preview `.png` and `<slug>.entry.json`, and prints
  `EXPORTED slug: X × Y × Z m, N triangles, S MB`. Generators never write the shared
  manifest, so they run in parallel; `merge_manifest()` folds entries in by `id`.
- Put REQUIRED numbers as asserted constants at the top of each generator (e.g.
  `ROPE_TOP = 2.75`) so a rebuild can't drift from what the scene expects.

### Placement in three.js
```js
const bbox = o => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o) }
function sitOn(obj, x, z, y = terrainHeight(x, z), yaw = 0){
  obj.rotation.y = yaw; obj.position.set(0, 0, 0)
  const b = bbox(obj); obj.position.set(x, y - b.min.y, z); scene.add(obj); return obj }
```
Find parts by the contract's names (`/leaves/i.test(mesh.name + ' ' + mat.name)`), never by
index. For instancing, bake each node transform into the geometry
(`geo.clone().applyMatrix4(o.matrixWorld)`), one `InstancedMesh` per mesh.

### Crafted trees (budgets that worked)
- A 45k budget can't make a dense crown from 8–14 cm cards; realistic density needs
  55–80k triangles and bigger cards (14–20 cm). GLB bytes (~112 B per card) bind before
  triangles do.
- Keep smooth icosphere "shade cores" ≤ .35 of the clump radius and buried (or replace them
  with dark short strands). Sample the crown envelope and add clumps wherever no twig tip is
  near, or the dome has sky holes.
- A hero tree that must read as one mass *needs* cores: ~.55 R, built from the same 5-vert
  card units (a jittered tetrakis cube, UVs on one opaque texel of the leaf atlas) with
  normals **bent downward** (`.35·ellipsoid + .15·crown − .5·Z`). Faceted normals read as
  green boxes; smooth outward normals read as balloons.
- Leaf cards get "soft" custom normals (`.7·billow ellipsoid + .3·crown dome`, 80 % over the
  card's own) and each card is wound to agree with them — otherwise three.js `DoubleSide`
  flips half the sunlit cards dark. Set them with `normals_split_custom_set_from_vertices`;
  the glTF exporter keeps them.
- Mirror most cards (`u −= 2(u·o)o`, p ≈ .55–.75) onto the billow's outward side.
- Honest previews: rasterise the web scene's leaf canvas as an alpha cut-out (> .42) and
  apply it *after* `export()` saved the GLB, then re-render. The GLB stays texture-free.

### Compression
`npx @gltf-transform/cli draco in.glb out.glb` +
`loader.setDRACOLoader(new DRACOLoader().setDecoderPath('<three CDN>/examples/jsm/libs/draco/gltf/'))`.
Four heavy models went 13.97 → 2.17 MB, visually identical. **Prefer Draco over meshopt when
shaders read object-space `position` (vLocal):** meshopt quantises into a normalised range
wrapped in a node transform, so every vLocal-driven pattern changes scale. Re-run the Draco
step after any Blender re-export. Version the URL (`?v=…`) when topology/UVs change so
browsers drop stale copies.

### Asset quality pass
> Rate every object in the scene from six perspectives (silhouette, form, material, life,
> integration, performance), weighted 20/20/20/10/20/10. Rank them in a master issue with a
> checklist. Then take them one at a time from the lowest score: enhance, verify in the live
> scene, re-score, tick, and comment what changed.
- Score GLBs **in the scene**, not from Blender previews (previews lack the web shaders; the
  rocks were underrated by ~1 point).
- After every enhancement, check neighbours that share its material: one canopy pass gave
  every blob the green elm card and the pink sakura blobs went brown. Keep a grey copy of
  any tinted card for instance-coloured variants.

## Pitfalls (from the Blender agents)
- **Vertex-colour alpha is dropped by default.** `export_vertex_color='MATERIAL'` gives VEC3.
  Use `export_vertex_color='ACTIVE'` and confirm the accessor is VEC4 by parsing the GLB JSON.
  In three.js rename non-colour data attributes (e.g. fin weights) so they don't tint.
- **glTF V is flipped:** the exporter writes V as 1 − V; author card UVs as `(u, 1 − v)`.
  Verify by parsing the GLB, not by eye.
- **Axes:** Blender Y becomes three.js −Z. A rotation about local X keeps its sign; ask agents
  for spin/hinge axes in three.js terms. Use `part.quaternion.copy(rest); part.rotateX(th)`.
- `primitive_ico_sphere_add(subdivisions=1)` is a bare 20-face icosahedron (faceted
  haunches); moss at detail 1 reads as flat leaves — use 2. Clamp moss domes at Z ≥ 0 or
  grounding lifts the whole model.
- `me.materials.clear()` after setting per-face material indices resets every face to slot 0.
  Add slots first, then set indices.
- A folded wing as one rigid hinged panel needs ~100–120° to spread; brute-force the hinge axis.
- **Splitting a model for wind:** one object per hanging point, renamed materials via
  `material.copy()` (share the baked texture), seam hidden under something, new parts on
  their own seed so existing geometry stays vertex-identical.
- `computeVertexNormals()` on non-indexed geometry gives flat facets — keep lathe normals.
- Angle-based smoothing keeps hex/box edges crisp. Vermilion needs ~(.29, .021, .0065) linear
  or it goes salmon. Bolt pairs on a blank round sign read as eyes.
- **Global rng drift.** A helper like `sphere(jitter=…)` that draws from the module's global
  `rng` once per vertex makes the whole layout order-dependent: adding a jittered primitive,
  or changing an existing one's `detail` (vertex count), reshuffles every later draw and
  moves trees, shrubs and roots you never touched. Give every new feature its own
  `random.Random(seed)` (or an `@own_rng` decorator that swaps the global for the call), never
  change the detail of a jittered primitive, and diff the exported placement JSON (plants,
  spots) after every run — it must be byte-identical unless you meant to move something.
- A long background Blender agent can stall; ask it to keep each tool call short. A resume
  message works if it wrote nothing.

## Verify
- Read every preview PNG against the reference; render one rear/other angle from the `.blend`.
- An ortho camera with `clip_start` at a chosen depth renders a cross-section — a quick check
  that folded parts sit against the body.
- In the scene: reference view, eye level, close-up, max zoom-out; console clean; triangle and
  byte counts per GLB logged (see threejs-webgl-performance-profiling).

## References
- `references/CONTRACT.template.md` — asset contract to copy into `blender/CONTRACT.md`.
- `references/studio.py` — Blender helper library (materials, Builder, primitives, export, manifest merge).
- `references/generator-template.py` — skeleton for one `craft_<slug>.py`.

## Related skills
threejs-procedural-vegetation · threejs-open-world-streaming · threejs-shell-fur-rendering ·
threejs-stylized-rock-material · threejs-fish-school-boids · threejs-webgl-performance-profiling ·
threejs-headless-visual-verification · threejs-floating-island-landmark · threejs-first-person-bvh-walk
