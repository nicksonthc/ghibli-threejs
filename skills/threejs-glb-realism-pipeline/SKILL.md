---
name: threejs-glb-realism-pipeline
description: Turn an existing Blender scene or GLB (buildings, warehouses, factories, rooms, props) into an ultra-realistic three.js/WebGL scene, then critique and improve it in a screenshot-driven loop. Covers the Blender headless realism pass (real-world scale, edge bevels, PBR texture sets, baked lightmaps), GLB optimization, a tuned WebGL viewer (HDRI, AgX tone mapping, shadows, GTAO, bloom, SMAA, procedural weathering), automated Playwright screenshots, and a structured visual critique. Use this whenever the user wants a 3D model, GLB, Blender scene or three.js scene to look more realistic, asks for a realism critique or review of a render or screenshot, wants to "enhance", "polish" or "make it look real", wants lighting baked, or wants a WebGL viewer for a GLB, even if they don't say "realism".
---

# three.js Realism Pipeline

Realism in real-time 3D comes mostly from light and surface response, not from polygon count. This skill applies the techniques in a fixed order (scale → geometry → materials → baked light → viewer → post) and then *looks* at the result through screenshots instead of guessing from code.

## Work folder

Everything for a model goes in `realism/` next to the source file:

```
realism/
  config.json          # texture mapping + pass settings (copy from references/config.example.json)
  build/scene.glb      # output of the Blender pass
  build/scene.opt.glb  # optimized output (what the viewer loads)
  shots/iter-N/*.png   # screenshots per iteration
  critique-log.md      # running history of scores and fixes
```

`SKILL_DIR` below means the directory this SKILL.md lives in.

**One-time setup** (skip if `SKILL_DIR/scripts/node_modules` exists):
```bash
cd SKILL_DIR/scripts && npm install && npx playwright install chromium
```
Blender 4.x must be on PATH as `blender`. The viewer loads three.js r170 from cdn.jsdelivr.net, so it needs internet access.

## The loop

### 1. Inspect (always first)
```bash
node SKILL_DIR/scripts/inspect_glb.mjs path/to/model.glb
```
(For a `.blend` file, skip to step 2, which accepts `.blend` directly, then inspect its output.)

Read the report for: bounding size in meters (a warehouse should be tens of meters, a pallet ~1.2 m; anything wildly off means a scale fix), meshes without UVs, materials without textures, and triangle count. Write down the problems before changing anything.

### 2. Blender realism pass
```bash
blender -b --factory-startup --python SKILL_DIR/scripts/blender_realism_pass.py -- \
  --input path/to/model.glb --output realism/build/scene.glb --config realism/config.json
```
The config controls each stage, so you can turn them on one at a time and compare:
- `scale`: multiplier to reach real meters.
- `bevel`: small chamfer on hard edges so they catch highlights (width ~0.005–0.02 m).
- `textures`: maps material-name patterns to PBR texture folders (Poly Haven / ambientCG downloads). Objects without UVs get box-projected UVs at real-world scale.
- `bake`: Cycles bakes direct and indirect diffuse light into a second UV set ("Lightmap") and exports it through the glTF occlusion slot. The viewer promotes it to a true lightmap. This step is what gives soft bounce light and contact darkening. It is slow, so start at 512 px / 64 samples and raise only for the final version.
- `lights`: `"auto"` adds a sun and sky for baking when the scene has no lights. For an indoor warehouse, prefer the scene's own ceiling lights (area lights or emissive panels).

Read `references/realism-checklist.md` when deciding values, since it lists the numbers that work for industrial and architectural scenes.

### 3. Optimize
```bash
bash SKILL_DIR/scripts/optimize.sh realism/build/scene.glb realism/build/scene.opt.glb
```

### 4. View and screenshot
```bash
node SKILL_DIR/scripts/screenshot.mjs --root . --model realism/build/scene.opt.glb \
  --out realism/shots/iter-1 [--hdri path/to/studio.hdr] [--params "exposure=1.1&weather=0.6"]
```
This serves `scripts/viewer/index.html` and renders fixed camera views (overview, eye-level, aisle, close-up) so every iteration compares the same angles.

For interactive tuning, run the same script with `--serve`. It prints a URL, and the viewer has a GUI panel (exposure, lightmap intensity, AO, bloom, weathering, sun). Copy good values back into `--params`.

### 5. Critique
Open every screenshot in the iteration folder (use the Read/view tool on each PNG; look at them, don't skip). If the user gave a reference photo, compare side by side. Score using `references/critique-rubric.md` and append the result to `realism/critique-log.md` in the format specified there.

The critique must end in **at most 3 fixes**, each mapped to a concrete knob (a config key, a viewer param, or a Blender change). Vague fixes like "improve lighting" are not actionable. A fix reads like "floor has no variation → set weather=0.7 and map `*floor*` to ambientCG Concrete034".

### 6. Apply and repeat
Apply the fixes, rerun from the earliest affected step, screenshot into `iter-N+1`, and critique again. Stop when the overall score stops improving by more than ~0.5 between iterations, or when the user is satisfied. Tell the user the score trend and show the before/after shots of the same view.

## Ground rules

- Change one category per iteration where possible, so the score change can be attributed.
- Never judge from code alone. A screenshot is the source of truth.
- Keep the original model untouched. All output goes in `realism/`.
- Downloaded textures and HDRIs: prefer CC0 sources (Poly Haven, ambientCG) and record what was used in `critique-log.md`.
- If WebGL fails in headless Chromium (black frames), the screenshot script retries with SwiftShader. Report it if both fail rather than critiquing a blank image.

## Reference files
- `references/realism-checklist.md`: the techniques with recommended values. Read before choosing pass settings.
- `references/critique-rubric.md`: scoring categories and log format. Read before every critique.
- `references/prompts.md`: ready-made prompts the user can give Claude Code to drive this skill.
- `references/config.example.json`: starting config.
