---
name: threejs-ghibli-toon-shading
description: Adds Studio Ghibli–style anime shading to existing three.js MeshStandardMaterial/MeshPhysicalMaterial objects via one onBeforeCompile patch helper — banded toon diffuse that keeps soft PCF shadows and GGX specular (RE_Direct wrapper), warm never-grey shadow fill, spherical "puff" normals for foliage clumps (k-means clusterCenter for baked GLB leaves), backlit subsurface glow, rim light, painterly leaf flecks, warm grained bark, and world-space wind with matching customDepthMaterial so dappled shadows move. Use when the user asks for Ghibli/anime/cel/toon look on trees, bushes or props, painterly foliage, puffy canopies, toon ramp without banded shadows, leaf wind sway, or moving leaf shadows.
---

# Ghibli toon shading for foliage, bark and props

Turns physically lit foliage into the soft-banded, sun-glowing canopy of a Ghibli background: each leaf clump shades as one puffy volume, light falls in 2–3 soft steps, leaves glow yellow-green when backlit, shadows are warm brown instead of grey, and everything sways with shadows that move in sync.

Stack: three.js `WebGLRenderer` (proven on r186), vanilla or R3F. Built materials (`MeshStandardMaterial`, `MeshPhysicalMaterial`, `MeshDepthMaterial`) are patched with `onBeforeCompile` so they keep three's shadows, fog, instancing and tone mapping. One shared uniform object means one lil-gui slider re-tunes every material at once.

## When to use

- Foliage from GLBs or procedural cards looks like green noise or plastic.
- You want a toon look but three's `MeshToonMaterial` loses soft shadows/specular.
- Leaves move in the main pass but their shadows are frozen.

## Paste-ready prompt

> Give the trees, bushes and leaves in `{{entry file}}` an authentic Studio Ghibli look matching `{{reference image}}`. Use one `patch(material, options)` helper around `onBeforeCompile` with a single shared uniform object (options: `toon`, `puff`, `flecks`, `rim`, `sss`, `bark`, `wind`, `flutter`, `fill`), every value in a lil-gui "Ghibli Tune" folder.
> 1. **Puff normals:** blend each leaf normal toward the vector from its clump centre, `normalize(mix(normal, sphereNormal, 0.6–0.8))`. Baked GLB foliage has no clump data: derive a per-vertex `clusterCenter` with seeded k-means over *triangles* (~36 clusters, 10 iterations). Blend after `normal_fragment_maps`.
> 2. **Banded toon light without banded shadows:** inline `THREE.ShaderChunk.lights_fragment_begin`, `replaceAll('RE_Direct( directLight,', 'RE_Direct_Toon( directLight,')`, scale `directLight.color` by `toonRamp(ndl)/ndl` and call the stock `RE_Direct_Physical`. Inject the helper after `#include <lights_physical_pars_fragment>`.
> 3. **Backlight SSS** `pow(saturate(dot(-V, L)), 3) * translucency` in a warm yellow-green, a saturated **rim** on silhouettes, painterly object-space **leaf flecks**.
> 4. **Warm shadow fill:** record `gLit = ndl·shadow` in the wrapper; after `lights_fragment_end` add `albedo · fillColour · fill · (1 − gLit)`.
> 5. **Wind** in a replaced `project_vertex`, in world space after `instanceMatrix`: slow height-weighted sway + high-frequency flutter. Give every foliage mesh a `customDepthMaterial` patched with the **identical** wind.
> 6. **Bark:** warm painterly wood, vertical grain noise, darker at the roots and up inside the canopy.
> Screenshot close-up, eye-level and wide after each step and compare with the reference.

## Implementation

The complete helper is in `references/ghibli-patch.js`; k-means is in `references/cluster-centers.js`.

### Patch helper structure
- `mat.customProgramCacheKey = () => JSON.stringify(options)` — otherwise three shares one program between differently patched materials.
- Vertex: add noise + wind GLSL after `#include <common>`; set `vLocal = position` after `begin_vertex` (object-space coords for flecks/bark); replace `project_vertex` with instance → world → **wind offset** → view; replace `worldpos_vertex` so shadow lookups use the displaced `wPos`.
- Fragment injection points: `common` (defines + uniforms), `lights_physical_pars_fragment` (toon/SSS wrapper), `lights_fragment_begin` (inlined, with `RE_Direct` swapped — 4 call sites in r186: directional, point, spot, sun), `lights_fragment_end` (fill + rim), `color_fragment` (flecks, bark), `normal_fragment_maps` (puff).

### Toon ramp
```glsl
float toonRamp(float x){ float n = max(uBands,1.); float s = pow(x,.85)*n; float f = floor(s);
  float t = smoothstep(.5-uSoft, .5+uSoft, fract(s)); return mix(x, clamp((f+t)/n,0.,1.), uToonMix); }
tl.color *= clamp(toonRamp(ndl)/max(ndl,1e-3), 0., 4.);   // RE_Direct re-applies the cosine
```
Specular, clearcoat, sheen and PCF shadows stay stock. Values: bands 3, soft 0.10, mix 0.85.

### Starting values
| Uniform | Value | Note |
|---|---|---|
| puff blend | 0.72 | 0.6–0.8; >0.9 = plastic balls |
| translucency / SSS colour | 0.55 / `0xd6ff6a` | natural GLB foliage: 0.24 / `0xc4dc8c` |
| rim / colour | 0.30 / `0xbfff8a` | `pow(1-N·V,3)`, brighter toward the sun |
| fleck strength / scale | 0.55 / 3.2 per m | object space |
| shadow fill / colour | 0.14 / `0xffb27a` | >~0.2 turns sunlit grass lime |
| hemisphere | sky `0xd9e6ff`, ground `0x7d6a36`, 0.55 | keep ambient strong and warm |
| bark warm / mix / grain | `0x8a5a36` / .35 / .45 | root AO .45 (0–1.8 m), canopy AO .30 (3.2–6.5 m) |
| wind sway / flutter | 1.0 / 0.035 m | flutter at outer leaf edges |

### Wind weights
Pass GLSL expressions: e.g. trees `wind: 'clamp((position.y-2.)*.06,0.,.6)*.22'`, `flutter: '.55'`; grass `wind: 'position.y*position.y*.16'`. The depth material:
```js
leaves.customDepthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking,
  side: THREE.DoubleSide, map: mat.map, alphaTest: mat.alphaTest }), { wind: w, flutter: fl })
```

### Puff normals for baked GLB foliage
k-means per **triangle** (so a card never straddles two clusters), seeded, 10 iterations, ~36 clusters → per-vertex `clusterCenter` in object space. In the vertex shader `sN = normalize(position - clusterCenter)`, rotated by `mat3(instanceMatrix)` and `normalMatrix`; in the fragment shader blend **after** `normal_fragment_maps` so the double-sided face flip of the card survives.

## Pitfalls

- **Un-synced shadows:** wind in the main material but not in `customDepthMaterial` leaves shadows frozen.
- Declare every attribute the depth material's wind expression uses (e.g. `clusterCenter`) there too; weight displacement from `position`, never by reading a varying back in the vertex shader.
- Don't gamma-lift `ndl` in a `ramp(ndl)/ndl` ramp below ~0.85 — grazing light gets boosted ~3× and the scene washes out.
- Inject the toon helper after `lights_physical_pars_fragment`, **never** into a shared noise block that depth materials and custom ShaderMaterials also include (they have no `PhysicalMaterial` type → compile error).
- `onBeforeCompile` sees unexpanded `#include`s — that's why `lights_fragment_begin` must be inlined from `THREE.ShaderChunk` before the `replaceAll`.
- In `onBeforeCompile`, inject helper GLSL *before* any code that calls it.
- Opt out materials that need their clearcoat path intact (wet fish) and keep grass on plain Lambert-ish shading: uniform blade normals band into one flat tone under a toon ramp.
- Over-dark foliage shadows ruin the look; keep ambient/hemisphere strong and warm and use the fill term.
- Leaf cards need `alphaTest` (~0.5), not `transparent: true` (sorting glitches).
- The fleck tint (×(1.55,1.45,.65)) turns pink blossoms orange — turn `flecks` off for flowers/sakura.
- A linear sun colour normalised to its max channel reads orange; blend halfway to white for tints.
- Known limit: puff normals fix shading, not silhouettes — close up, cards still read as angular slivers. A low-opacity ink outline was tried and judged not worth it.

## Verify

- Close-up of a canopy: clumps read as soft volumes, 2–3 visible light steps, shadow edges still soft.
- Look toward the sun through leaves: warm yellow-green glow, not white.
- Shadows under trees: warm brown, never flat grey or black; they move with the leaves.
- Drag each GUI slider: every patched material responds (one shared uniform object).

## Related skills

`threejs-procedural-vegetation`, `threejs-ghibli-sky-clouds`, `threejs-postprocessing-anime-grade`, `threejs-ghibli-night-mode`, `threejs-stylized-rock-material`.
