# Prompts for Claude Code

Copy one of these into Claude Code in the folder with your model. Replace the paths.

## Full realism pass (first time)
> Use the threejs-glb-realism-pipeline skill on `models/warehouse.glb`. Inspect it first and tell me what's wrong before changing anything. Then create `realism/config.json`, run the Blender pass with bevels and textures on (bake off for now), optimize, screenshot all views, and critique as iteration 1.

## Add baked lighting
> Using the threejs-glb-realism-pipeline skill, turn on lightmap baking for the warehouse at draft quality (512 px, 64 samples). The scene should be lit by the ceiling high-bay lights, not a sun. Screenshot and critique as the next iteration and compare scores with the previous one.

## Critique only
> Using the threejs-glb-realism-pipeline skill's rubric, critique the screenshots in `realism/shots/iter-3/` against the reference photo `refs/real_warehouse.jpg`. Don't change anything, just log the critique and the top 3 fixes.

## Autonomous improvement loop
> Use the threejs-glb-realism-pipeline skill to iterate on `models/warehouse.glb` for up to 4 iterations. After each one, apply only the top fixes from the critique, screenshot, and re-score. Stop early if the overall score improves by less than 0.5. At the end, show me the score trend and the before/after eye-level shot.

## Set dressing
> The warehouse scores low on Composition. Add believable clutter using the realism checklist: floor-marking tape along aisles, pallets with ±5° rotation and color variation on the boxes, a few safety barriers, and signage on the racking. Keep everything at real-world scale, then screenshot and critique.

## Final quality
> Final export: rerun the bake at 1024/2048 px and 256 samples, optimize, and screenshot at 2560×1440. Give me the final viewer params so I can embed the same look in our app.

## Match a reference photo
> Here is a photo of a real warehouse (`refs/site.jpg`). Using the threejs-glb-realism-pipeline skill, match its light color temperature, exposure, floor material and rack colors. Critique each iteration specifically against this photo.
