---
name: threejs-shell-fur-rendering
description: Grows real-time fur on a character in three.js with shell rendering — one watertight sculpted body mesh whose COLOR_0 RGBA carries painted albedo and per-vertex fur length, drawn again as a single InstancedMesh of shells indexed by gl_InstanceID, pushed along the normal with gravity droop and wind, strands cut from jittered 3D rest-space cells that taper to the tip, coat darkened toward the skin, distance-based shell LOD, no shell shadows. Use when a creature, plush toy, mascot or animal needs fur, hair, fuzz, moss or grass-like coats in WebGL/R3F, or when a GLB can't carry hair.
---

# Shell fur rendering

Produces a soft, readable fur coat on a stylised character (a big furry forest creature, a cat,
a plush toy) at a cost that scales with distance. The body is one sculpted mesh; the fur is that
same geometry drawn N more times as one instanced draw call, each shell a little further out,
discarding everything outside a strand.

Stack: three.js `WebGLRenderer` (WebGL2 for `gl_InstanceID`), `MeshStandardMaterial` patched
with `onBeforeCompile`. Mesh from headless Blender. Vanilla or R3F.

## When to use
- A character needs fur and a GLB can't carry hair cards/strands.
- A furry model looks like smooth plastic, or fur costs too much far away.
- Markings on a furry body blur into a single smear.

## Paste-ready prompt

> Recraft `{{character}}` realistically: one watertight sculpted body mesh with COLOR_0 RGBA (RGB
> = painted albedo including markings, A = fur length), then grow the fur in three.js with shell
> rendering.
> - Draw the shells as one `InstancedMesh` of the body geometry, with `gl_InstanceID/shells` as
>   the layer. Push each shell along `objectNormal × layer × length × color.a`, add a little
>   gravity droop and wind, and discard outside jittered 3D cells in rest space (no UV
>   dependence). Strands taper as `r = .55(1 − layer)`, and the colour is darkened deep in the
>   coat (`mix(.62, 1.12, layer)`).
> - Choose the shell count by camera distance (24/14/6/3/0) and don't let the shells cast shadows.
> - Paint markings as separate shapes with gaps.
> - Eyes: a transparent clearcoat physical material, not a transmissive cornea.
> Verify close-up, at mid distance and far, and parse the GLB to confirm COLOR_0 is VEC4.

## Implementation

### Asset (Blender)
- One **watertight** body mesh (no separate floating parts under the coat); eyes, claws, nose as
  separate meshes/materials without fur.
- COLOR_0 as RGBA: RGB = painted albedo *including markings*, A = fur length (long on the back,
  short on the face and palms, 0 where the eyes sit).
- Export with `export_vertex_color='ACTIVE'`. Blender's glTF exporter drops vertex-colour alpha by
  default (`'MATERIAL'` gives VEC3). Parse the GLB JSON and confirm the accessor is `VEC4`.
- Paint markings (chevrons on a belly, stripes) as separate shapes with clear gaps between them.

### Shells ([`references/shell-fur.js`](references/shell-fur.js))
- `InstancedMesh(bodyGeometry, furMaterial, SHELLS)` with identity instance matrices, added as a
  child of the body mesh; `customProgramCacheKey = () => 'shell-fur'`.
- Vertex (after `<begin_vertex>`): `layer = (gl_InstanceID + 1)/shells`;
  `transformed += normalize(objectNormal)·layer·len` with `len = color.a·0.028 m`; droop
  `y −= layer²·len·0.35`; wind `xz += layer²·len·.25·uWind·(sin(1.7t + 9y), cos(1.3t + 7x))`.
- Fragment (after `<alphatest_fragment>`): discard if `color.a < .02` or `layer > a·1.15 + .05`
  (short fur stops at fewer shells); cell grid in **rest space** `q = position·420`, nearest of the
  2×2×2 neighbouring jittered cell centres (`hash3·.8`); keep if `d < .55·(1 − layer)` — strands
  taper to a point.
- Colour (after `<color_fragment>`): `rgb *= mix(.62, 1.12, layer)` — deep in the coat is
  shadowed, tips catch the light.
- `DoubleSide`, roughness .95, metalness 0.
- **LOD:** shell count by camera distance — `< 3 m: 24`, `< 7 m: 14`, `< 16 m: 6`, `< 40 m: 3`,
  beyond: 0 — by setting `instancedMesh.count` each frame.
- **Shadows:** shells `castShadow = false`, `receiveShadow = true`; the body casts.

### Posed characters
If the character deforms in the vertex shader (head turn, blink, breathing), the fur material must
run the **same pose function** before the shell push, and so must the body's depth material —
otherwise the coat stays behind when the head turns. Skinned meshes can't be instanced this way,
which is one reason to deform without a skeleton (`threejs-skeletonless-character-animation`).

### Eyes
Swap a transmissive cornea for a transparent clearcoat `MeshPhysicalMaterial`. Transmission adds a
whole extra render pass.

## Pitfalls
- **COLOR_0 comes out VEC3** — alpha lost in export; fur length reads as 1 everywhere (or the code
  bails). Use `'ACTIVE'` and verify the accessor type.
- **UV-based strand cells** show seams; rest-space 3D cells don't.
- **Markings painted close together** read as one zigzag once the fur blurs them.
- **Shells casting shadows** cost N× the shadow pass and darken the coat.
- **Transmission for eyes** adds an extra full render pass.
- **Pose not applied to the shells** → the fur lags the body.

## Verify
- Close up (< 1 m): individual tapered strands, darker at the skin; face fur short; no fur on eyes.
- Mid (5 m) and far (20 m): coat still reads soft; check `instancedMesh.count` drops with distance.
- Frame time with fur on/off; shadow pass unchanged.

## Related skills
`threejs-skeletonless-character-animation` · `threejs-blender-glb-pipeline` ·
`threejs-webgl-performance-profiling` · `threejs-ghibli-toon-shading`
