---
name: threejs-first-person-bvh-walk
description: Lands a character on a landmark and lets the visitor walk it in first person in three.js — a floating-down arrival, the camera slipping from a three-quarter view into her eyes, WASD + pointer-lock look, Shift run, E use, V over-shoulder, Esc leave, a touch thumb stick, a levitation lift between floors, interiors lit by the nearest lamps — with a three-mesh-bvh capsule controller that never gets stuck (footprint ground, sideways-only capsule push-out, glancing along edges, climb-back for every drop, a breadcrumb unstick) and a headless flood-fill + random-wander soak test that proves it. Use when the user wants first-person or third-person walking inside a GLB building or island, WASD movement with collision, a character controller, pointer lock, or says the player gets stuck on walls, balconies, stairs, rails or seams.
---

# First-person walk on a landmark, with a capsule that never sticks

Click the landmark (or press a key) and `{{character}}` floats down onto the arrival spot; the
camera watches from a three-quarter view, then slides into her eyes. You walk the whole
thing — terraces, stairs, balconies, furnished rooms — and nothing ever traps you. Proven on
a Laputa-style floating castle (≈120k tris, six rooms, a lift to an observatory), where a
30-visitor soak test went from **110 lock checkpoints to 0**.

Stack: three.js r186, `three-mesh-bvh` 0.9.1 (`build/index.module.js`, imports bare `three`
so it resolves through the import map; `+esm` pulls a second copy of three), a landmark GLB
from a Blender generator (`threejs-floating-island-landmark`, `threejs-blender-glb-pipeline`).

## When to use
- Walking inside or around a GLB building, castle, island or interior.
- A character controller over arbitrary triangle soup (no navmesh, no physics engine).
- The player sticks at walls, balcony edges, rails, seams between meshes or pits.

## Paste-ready prompt

> Let me visit `{{landmark}}` on foot. Clicking it (or `{{key}}`) floats `{{character}}` down
> onto `{{arrival spot}}`; the camera watches from a three-quarter view, then slides into her
> eyes. WASD/arrows walk (arrows left/right turn), mouse looks with pointer lock (drag as a
> fallback), Shift runs, E uses, V toggles an over-shoulder view with a walk cycle, Esc leaves
> (the first Esc only releases the mouse). On touch: a thumb stick that appears under the left
> thumb, the right half looks, E and view buttons.
>
> Make the building enterable **in the generator**: hollow shell, a separate interior
> material, archways, a `walk.json` with spawn, lamps `[pos, rgb, intensity, range]`, things
> to use and room boxes.
>
> Collision: one three-mesh-bvh over every static mesh in the landmark's frame; a capsule
> pushed out sideways; ground = highest floor under a small footprint; sub-steps ≤ 12 cm; at
> an edge retry the step turned along it; every drop ≤ `{{drop}}` must be climbable back
> (outdoors, hop ≤ `{{climb}}` onto ≥ 1 m of level ground or her own trail); a breadcrumb
> trail leads her back if she presses on and goes nowhere for 0.5 s. Prove it headless:
> flood-fill reachability from the spawn and a 30 × 90 s random-wander soak with lock checks.

## Implementation

### Frame and flow
- The player lives in the **landmark's local frame** (`walk.p` in model metres), so its bob
  and spin carry her. Camera = `isle.localToWorld(eye)`, quaternion = isle world quaternion ×
  local yaw/pitch (Euler YXZ).
- Phases: `descend` (from 26 m, eased `(1−u)^2.3`, a slow turn, arms out) → `enter` (1.7 s
  lerp/slerp from the watch pose into the eye, fov to 68, hide her at 72 %) → `walk` ↔
  `float` (lift) → `endWalk` flies back to the orbit.
- A capture-phase key/pointer guard (`addEventListener(…, true)` + `stopImmediatePropagation`)
  silences the rest of the scene's shortcuts while walking.

### Numbers that worked (`WALK`)
`eye 1.5, radius .34, step .56, drop 1.25, climb 1.32, speed 2.7, run 5.4, fov 68`.
Stair treads must be deeper than the radius, wall probes start above step height.

### Controller (`references/walk-controller.js`)
1. **BVH:** merge every static mesh (skip leaves, water, banners, sprites, moving parts),
   transformed by `inv(isle.matrixWorld) · mesh.matrixWorld`, positions + index only; build
   `MeshBVH` once on the first walk.
2. **Floor:** one ray from `p.y + step` down; accept only `|n.y| > .6`.
3. **Ground:** the highest floor under a **footprint** (centre + 5 toes at .24 m), needing two
   hits (one stray toe on a ledge is not standing). Seams and hand-width gaps vanish.
4. **Body:** a capsule segment from `y + step + .6r` to `y + 1.62 − r`; `bvh.shapecast` with
   `tri.closestPointToSegment`; push **sideways only** by `r − d`, 3 passes. Dead-centre on a
   face → push along the face normal.
5. **Step:** try the move; if the capsule ate more than half of it, try a climb; then try the
   step turned by `[0, ±.5, ±1, ±1.35]` rad, scaled by `max(0, cos)`, so rails and cliffs are
   glanced along. Accept only if ground exists, is ≤ `drop` below, and a step up has room for
   the body at the new height (`walkFits`).
6. **Climb-back:** outdoors only (never in rooms or on roofs): a ledge `step < h ≤ climb` ahead
   is hopped onto if the landing is solid (8 points at .45 m all within .1 m) or on her own
   trail, and the body fits there.
7. **Sub-steps** ≤ 12 cm so a thin rail can't be stepped through.
8. **Trail + unstick:** a crumb every .35 m (max 60). `stuckT` grows while input > .2 but
   speed < 25 % of intended; after .5 s walk back toward the nearest crumb that lies roughly
   in the wanted direction (|dy| ≤ climb). Clear the trail after a lift ride.

### Interiors and lift
- On interior materials only, scale sun ×.06, hemisphere ×.1, ambient ×.14,
  `envMapIntensity` .12, and add the **four lamps nearest the eye** (view space) after
  `lights_fragment_end`; outdoor shaders pay nothing. The same patch on the character with an
  eased 0…1 factor as she walks in and out.
- Lift: a glowing circle under an oculus; E floats her up over ~4 s (smoothstep) onto a glass
  lens that counts as floor. Hide her and damp the additive beam when the eye is inside it.

### Headless soak test (`references/walk-soak-test.mjs`)
Expose `walkMove`, `walkGround`, `walk` on a debug handle. **Flood-fill:** from the spawn,
8 headings × 0.3 s of real `walkMove`, bucket to 1 m cells, BFS. **Hug-and-return:** from
every cell walk 1.6 s into whatever is there, then try to walk back. **Soak:** 30 visitors ×
90 s, random heading changes every 1–4 s, a lock check every 5 s (moved < .3 m while pressing).
Diff reachable sets between versions: a stricter rule once cut off the lower lawns.

## Pitfalls
- **The four stuck causes:** (1) a single centre floor ray fell through seams between meshes
  and refused the move; (2) the edge refusal cancelled the whole move, so walking into a
  balcony edge at an angle stopped dead; (3) drop 1.25 but step .56 — every gutter or pit
  behind a parapet was a trap; (4) mid-fall step-ups landed on rail tops. Ray-fan walls also
  let the walker slip *through* arcaded parapets under the handrail.
- Unrestricted climbing lets her hop rail → coping → roof. Limit it to outdoor terraces below
  the main floor with a 1 m solid landing; then give parapets real gates so lower areas stay
  reachable.
- glTF materials from Blender are double-sided: a hollowed block can't rely on culling, and
  anything that ran through the solid now runs through the room — push it out by its full radius.
- New interior geometry built with a jittered helper shifted the generator's global rng and
  moved every plant: build it on its own rng and diff the placement JSON.
- First-person whiteout: the eye inside her own glow sprite / additive beam.
- Painted windows mean a telescope sees plaster: take its view from ~70 m out along the line.
- Dust motes need `gl_PointSize` clamped to 1–6 px, or they are bokeh balls at 1 m.

## Verify
- Soak test: 0 lock checkpoints; reachable cells ≥ the previous version's (diff the sets).
- End-to-end in a headless page: arrive, real `keydown` W events, ride the lift, walk the top.
- Manual: walk diagonally into every balcony edge and parapet — she slides, never stops dead.

## References
- `references/walk-controller.js` — BVH build, floor/ground/collide/fits/solid/climb/step/trail/unstick/move.
- `references/walk-soak-test.mjs` — Playwright flood-fill + hug-and-return + random-wander soak.

## Related skills
threejs-floating-island-landmark · threejs-blender-glb-pipeline · threejs-object-interaction ·
threejs-camera-guided-tour · threejs-skeletonless-character-animation ·
threejs-headless-visual-verification
