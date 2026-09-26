# Asset contract — "{{scene name}}"

<!-- Copy to blender/CONTRACT.md and fill every {{slot}}. Every asset agent reads this first. -->

Reference image: `{{public/references/source.png}}` ({{one-line description of the look, e.g.
anime / painterly: a figure asleep on a wooden deck over a turquoise river, a big oak, a rope swing}}).
Scene brief: `{{prompts.md}}`.

## Tooling
- Blender {{5.x}}: `{{blender path}} --background --factory-startup --python <script>`.
- Helper library: `blender/studio.py` (load by path with importlib; see its docstring).
- Generators live at `blender/craft_<slug>.py`, run with cwd = project root, so output lands in
  `public/models/<slug>.glb|png|blend|entry.json`.
- **Do NOT write `manifest.json`** — the coordinator merges `*.entry.json` by `id`.
- Pass `source='{{public/references/source.png}}'` to `export()`.

## Conventions (Blender space)
- Metres, Z up. `export()` grounds the lowest vertex at Z = 0 — design with that in mind.
- The side facing the viewer faces **−Y** (becomes three.js +Z after glTF export).
- Blender Y → three.js −Z. State any spin / hinge axis **in three.js terms** in your report.
- Materials via `studio.mat`, with clear, stable names. The web scene finds meshes by
  material/object name — the names listed per asset below are **REQUIRED**.
- Colours: saturated, painterly ({{style}}), a step darker than the photo. Linear values:
  vermilion ≈ (.29, .021, .0065).
- Seed all randomness (`random.Random(n)`); new parts get their own seed so existing geometry
  stays vertex-identical.
- Vertex data that the shader reads (painted albedo, moss, fur length, animation weights) goes
  in COLOR_0 **RGBA**; export with `export_vertex_color='ACTIVE'` and confirm VEC4.
- Card UVs are authored as `(u, 1 − v)` (the exporter flips V).

## Budgets
| kind | triangles | size |
|---|---|---|
| prop | < {{20k}} | |
| figure | < {{40k}} | |
| hero tree | < {{150k}} | |
| instanced tree (20–40×) | {{55–80k}} | ≤ {{M}} MB (≈112 B per leaf card) |
| rock | ~{{2.4k}} | |

## Acceptance
Read every preview PNG and compare with the reference. Iterate **at least 3 times**
(silhouette/proportions → colour → detail). Render one other angle from the `.blend` to check
unseen sides are closed. Report in your final message:
- file list, the `EXPORTED` line (dimensions, triangles, MB);
- every REQUIRED number asked for below;
- describe results as reference-guided stylised studies, not reconstructions.

## Assets
### {{slug}} — {{title}}
- REQUIRED names: `{{Leaves*}}` (wind), `{{Bark}}`, `{{Moss}}` …
- REQUIRED numbers (attachment points, measured after grounding):
  - `{{ROPE_ANCHORS}}` — world XYZ of the rope tie points on the limb
  - `{{SEAT_Z}}` — Z of the surface a figure rests on
  - `{{CHEST_PIVOT}}` — XYZ of the breathing pivot
  - `{{WATERLINE_Z}}` / `{{FLOOR_Z}}` — for boats and buildings
- Budget: {{…}}. Instanced {{n}}×: yes/no.
