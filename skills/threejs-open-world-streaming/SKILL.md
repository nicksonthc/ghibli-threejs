---
name: threejs-open-world-streaming
description: Extends a small three.js scene into a long, streamed world (hundreds of metres along a river, road or valley) — one signed-distance function for water/land, a curvilinear chunked terrain strip with seamless normals, a camera-following snapped water grid, a shadow frustum that follows the view, landmark pads, a pooled set of crafted GLB trees re-seated near the camera, deterministic seeded scatter and distance culling. Use when the user asks to "extend the world", "make the river longer", add a lake/spring/village/terraces, stream terrain in chunks, place landmarks on terrain, or when far reaches look empty, flat-shadowed or cost too much.
---

# Open-world streaming along a river (three.js)

Grow a hand-built home scene into a ~600 m journey without touching the home reach: a
source upstream, chapters along the way, a finale downstream. Stack: three.js
`WebGLRenderer` (vanilla or R3F), everything procedural in JS plus GLB landmarks. The
core idea: **one height function and one signed-distance function define the world**, and
every system (terrain, water shader, scatter, boat bounds, camera clamps) asks them.

## When to use
- The scene is a single reach and the visitor (or a boat, a tour) should travel far.
- You need a lake, a spring pool, an island, terraces or a village along a path.
- Far terrain has visible seams, the water sheet shows past the land, distant shadows are
  flat, or crafted trees exist only near home.

## Paste-ready prompt
> Extend `{{scene}}` along the river to about `{{600}}` m: `{{source, e.g. a spring pool under
> a waterfall}}` upstream, `{{chapters, e.g. rice terraces, a village road, a bridge}}` on the
> way, `{{finale, e.g. a lake with an island}}` downstream. Keep the home reach identical.
> One signed-distance function (river ∪ lake ∪ pool, minus the island) drives terrain,
> scatter and boat bounds. Stream the ground as chunks. Populate deterministically, with
> crafted trees near the camera and painterly blobs beyond, and cull by distance. Verify
> the voyage numerically (clearance from banks, depth under the keel) and screenshot each
> chapter.

## Implementation

### 1. The water SDF (`bankDist`)
Signed distance to the water's edge, `< 0` in water (see `references/world-sdf.js`):
```
d = max(|x − c(z)| − half(z), z − z_lake, z_source − z)   // river between pool and lake
d = smin(d, lakeCircle(wobbled radius), 6)                 // polynomial smooth-min
d = smin(d, poolCircle, 3)
d = max(d, −islandCircle)                                  // the island is land again
```
- Anything that asks "is this water?" is then right in the lake, the pool and the island.
- Replace every "push toward the centreline" rule (boat bounds, scatter keep-outs) with the
  SDF's **gradient**.
- Keep `riverCenter(z)` piecewise: the home formula unchanged, extra meanders added only
  beyond the home reach with `smooth()` ramps, so the original scene doesn't move.
- Duplicate the centreline in GLSL (template literal with `toFixed()` constants) so the
  water shader can clip itself to the land strip.

### 2. `terrainHeight(x, z)` composes everything
bed → bank (smoothstep on `d`) → gentle rise → rolling hills → valley walls that rise with
distance upstream/downstream → cliffs → island mound → **terraces** → **landmark pads**.
- **Terraces:** quantise a hillside height into levels (`k = floor(hb/step)`); flat paddy,
  smooth riser (`smooth(.86, 1, f)`), floor eased 6 cm under the water level, an earth bund
  near the outer edge. The paddy water is a merged mesh of flooded cells at their level with
  a tiny sky-Fresnel shader reading the live sky uniforms.
- **Pads:** `h += (P.h − h)·smooth(P.r + 4, P.r, dist)`. Fix site positions and compute pads
  **before any terrain chunk is built**, since pads are part of `terrainHeight`.
- **Non-square extension:** make terrain/water non-square (deep along the river, near edge
  fixed). Give far layers **their own RNG seed** so near rocks, flowers and fish (on the
  shared RNG) keep their places.

### 3. Curvilinear chunked terrain strip
`references/terrain-chunks.js`:
- Rows at `x = riverCenter(z) + u`, so adjacent chunks share edge vertices exactly however
  the river bends.
- Columns dense near the water (0.34 m), opening out on far hills (~2 m):
  `x += .34 + max(0, x − 28)·.045`.
- 20 m chunks, row spacing 0.45 m. Build each chunk with **one hidden extra row either
  side** before `computeVertexNormals`, then drop those rows → seams have matching normals.
- Build the home reach at load; stream the rest nearest-first, **2 chunks per frame**; draw
  only within `TER_DRAW` (200 m) of the camera.
- If the terrain material depends only on world position, the old single mesh can be
  swapped out invisibly.

### 4. Water that follows the camera
- One grid (e.g. 190 m, 330 segments ≈ 58 cm cells) that travels with the camera, snapped to
  its own cell: `pos = round(cam/s)·s`, so world-anchored waves never swim.
- `frustumCulled = false`. In the fragment shader: `if (outsideWorld(vWPos.xz)) discard;`
  so no water sheet shows past the ends of the land.
- Write your own smoothstep in GLSL (`rsm`): GLSL's `smoothstep` is undefined for reversed
  edges (`e0 > e1`), which the ramps use.

### 5. Shadows that follow the view
The home shadow frustum is ±13 m. When the target is > 14 m from home (or the boat camera
is on), move `SUN_FOCUS` to the target **snapped to 2 m** (so shadows don't crawl), and put
the sun at `focus + sunDir·30`. Only trees within the shadow square cast shadows.

### 6. Population
- One deterministic scatter over the whole strip (`mulberry32(seed)`), rejection-sampled with
  `bankDist` and a keep-out (home reach, pads + 2.5 m, road segments + 2.4 m).
- Zones by `z` (spring / terrace / upper / meadow / village / lake) pick species and density.
- Instanced per 32 m cell; cull radii ~170 m for trees, ~90 m for small things (fog is ~94 %
  by 170 m). Check culling every 0.25 s, not every frame.
- **Crafted-tree pool** (`references/tree-pool.js`): N crafted trees per species (16 here),
  re-seated every 0.5 s on the candidate sites nearest the camera (within 55 m). Each site
  holds references to its blob instances (canopy + trunk), which are scaled to zero
  (`makeScale(0,0,0)`) while a crafted tree stands there. Per-slot tint uniform on one shared
  program varies the greens.
- Keep tall trees sparse near the water so the pool covers them: blob "lollipops" at the
  water's edge read as toys.
- **Autopilot loop:** end the voyage inside one mist bank (soft fog-coloured billboards,
  excluded from the AO pass) and begin it inside another far away, so the wrap is hidden.

### 7. Landmarks
- Place each GLB from its measured bounding box (`sitOn(obj, x, z)`: reset, measure,
  `y − box.min.y`). Skip quietly if a model is missing.
- Sample a cliff lip where the cliff actually is: step back until the height clears a
  threshold (a waterfall came out 3.6 m tall because the sample was on the lower slope).
- Water-edge buildings (a mill): keep the levelling pad on the **land side**, or its blend
  radius fills the riverbed under the wheel.

## Pitfalls
- **Culling registration:** read world positions only after `updateMatrixWorld(true)`. A
  just-placed object still holds its old matrix; a mill 245 m away registered at the origin
  and was culled forever.
- **One-line functions + `//`:** a comment dropped mid-line silently commented out an
  `isMesh` guard; `build()` threw halfway and the page sat at 100 % on the loading curtain.
  Put comments on their own line.
- **Strip winding:** a road strip built across a side vector `(−t.z, t.x)` that points left
  gets downward-facing triangles (back-face culled, lit from below). Build right to left or
  flip the index order.
- **Axis conversion:** a Blender "axle along Y" is not three.js Y (glTF converts Y → −Z).
  Ask the modelling agent for spin axes in three.js terms.
- **Signs:** a glTF sign face with 0–1 UVs takes a canvas texture with `flipY = false`; the
  canvas's top row is the sign's top.
- **Transparent sheets** (waterfall, foam, mist, paddy water) print as dark panels in the AO
  pass: add them to the AO/pre-pass hidden list.
- **Paths built before the obstacles:** the boat lane was built before rocks existed, so it
  avoided an empty list. Rebuild it once scatter is done.
- A paddy sheet cut on the terrain grid shows staircase edges: ease the floor 6 cm down,
  dilate wet cells one step in 4 directions within the same level, sit the sheet 2.5 cm under
  the rim. Dilating downhill leaves a sheet floating over the riser.
- OrbitControls `maxDistance` silently pulls a far debug camera in. Raise it for aerials.

## Verify
- **Numerically:** walk the lane samples and check clearance from every bank and depth under
  the keel (≥ 2.2 m and ≥ 0.45 m here). Print a height grid around each landmark site before
  shading anything.
- Screenshot every chapter at eye level and from above; look for seams, water past the land,
  flat shadows, floating/buried pads. Log chunk count, draw calls and triangles far from home.

## References
- `references/world-sdf.js` — noise, `smin`, `bankDist`, `terrainHeight` skeleton, GLSL centreline.
- `references/terrain-chunks.js` — curvilinear strip, hidden-row normals, streaming, water grid, shadow follow.
- `references/tree-pool.js` — crafted-tree pool re-seating and blob hiding; distance culling.

## Related skills
threejs-webgl-realistic-water · threejs-boat-buoyancy-steering · threejs-procedural-vegetation ·
threejs-webgl-waterfall-effect · threejs-webgl-performance-profiling · threejs-blender-glb-pipeline ·
threejs-hud-objective-markers · threejs-headless-visual-verification
