# Realism Checklist (industrial / architectural)

Ordered by typical impact. Each item lists the symptom, the fix, and where it lives in this pipeline.

## 1. Lighting
| Symptom | Fix | Where |
|---|---|---|
| Flat, evenly-lit, "game-like" | Bake lightmaps (direct + indirect diffuse) | config `bake.enabled` |
| No darkening where objects meet the floor | Lightmap bake, then GTAO in viewer | `bake`, viewer `ao` |
| Scene looks grey or washed out | AgX or ACES tone mapping, exposure 0.8–1.3 | viewer `tonemap`, `exposure` |
| Metal looks like plastic | Needs an environment to reflect: HDRI as `scene.environment` | `--hdri` |
| Sharp, pixelated shadows | Shadow map 4096, PCFSoft, radius 3–6, normalBias 0.02 | viewer (auto) |

Indoor warehouse: real light comes from ceiling high-bays (typically 4000–5000 K, slightly cool) and skylights or dock doors. Model them as area lights or emissive panels in Blender before baking. A single sun through the roof looks wrong.

When a lightmap is applied, lower the viewer's `sun` and `env` intensity. The lightmap already contains the diffuse light, so leaving them high double-lights the scene.

Recommended bake: 1024 px for large surfaces (floor, walls), 256–512 for racks and props; 128–256 samples for final, 64 for drafts; margin 8 px.

## 2. Materials (PBR)
- Every visible surface needs at least albedo + roughness + normal. Untextured flat colors are the most common giveaway.
- Albedo values: concrete 0.35–0.5, painted steel 0.2–0.7 depending on paint, galvanized metal is metallic=1 with roughness 0.3–0.5. Never pure white (1.0) or pure black.
- Texel density: floors and walls tile every 2–4 m. Tiles repeating every 0.5 m read as wallpaper.
- Good CC0 sets for warehouses: ambientCG Concrete (floor), Metal (galvanized racking), PaintedMetal (rack uprights and beams), CorrugatedSteel (walls/roof), Asphalt (dock area); Poly Haven for HDRIs (industrial or warehouse interiors).

## 3. Imperfection
- Roughness variation: 15–30% noise over large surfaces (viewer `weather`).
- Grime near the floor: darken the bottom 0.2–0.5 m of walls and rack uprights (viewer `grime`, `grimeHeight`).
- Floor: tire marks, oil stains, worn floor-marking paint (decals or texture variation).
- Variation in repeated objects: ±5° rotation, ±5% color or scale on boxes and pallets, a few gaps or misplaced items.

## 4. Geometry
- Bevels: 0.005–0.02 m on hard edges, 2 segments. Bevel width should scale with object size.
- Real-world scale: pallet 1.2 × 1.0 m (EUR) or 1.2 × 0.8 m; rack beam level spacing ~1.5–2 m; aisle width 3–4 m (forklift); clear height 8–12 m.
- Thickness: walls, beams and shelves need real depth. Zero-thickness planes look like paper.

## 5. Camera and post
- Eye-level views (1.6–1.7 m) sell realism. High orbit views look like a model.
- FOV 35–50° (vertical). Wide FOV exaggerates scale.
- GTAO subtle. Bloom only on emissive lights (threshold ≥ 0.9, strength ≤ 0.3).
- Optional: slight vignette and film grain. Never strong chromatic aberration.

## 6. Clutter and story
Empty clean scenes read as CG. Add signage, safety barriers, floor-marking tape, fire extinguishers, cable trays, pipes, a forklift, stacked pallets, shrink-wrapped loads. AI generators (Meshy, Tripo, Rodin, Hunyuan3D) are fine for these props, but pass them through steps 1–3 too so they match the scene's scale and materials.

## Viewer params (URL query / --params)
| Param | Default | Notes |
|---|---|---|
| exposure | 1.0 | |
| tonemap | agx | `agx`, `aces`, `neutral` |
| env | 1.0 | HDRI / environment intensity |
| sun | 2.5 | directional light intensity; 0 to disable |
| sunAz, sunEl | 35, 50 | degrees |
| lightmap | auto | `auto` promotes baked occlusion-slot lightmaps; `off` ignores |
| lmIntensity | 1.0 | lightmap intensity |
| ao | 1 | GTAO on/off |
| bloom | 0.15 | strength; 0 disables |
| weather | 0.4 | roughness noise + albedo mottling, 0–1 |
| grime | 0.35 | darkening near floor, 0–1 |
| grimeHeight | 0.4 | meters |
| fov | 45 | |
| bg | env | `env` (blurred HDRI) or hex color like `1a1a1a` |
