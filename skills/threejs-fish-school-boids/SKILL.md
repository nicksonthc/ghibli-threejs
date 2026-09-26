---
name: threejs-fish-school-boids
description: Builds a school of swimming fish (koi) in three.js — one neutral Blender mesh with animation weights in COLOR_0, per-fish variety patterns (kohaku, sanke, showa, ogon, tancho, asagi, kigoi, ghost) painted in the fragment shader, vertex-shader swimming with a travelling tail wave, turn bend, flapping/tucking pectorals and fin flutter mirrored in the shadow depth material, and calm boids traffic with patrol homes, look-ahead shallows and obstacle avoidance, clamped steering, surface "kisses" that spawn ripples, and night bioluminescence. Use when adding fish, koi ponds, creature schools, flocking/boids, or swimming animation to WebGL/R3F.
---

# Fish school: koi with shader patterns, vertex swimming and calm boids

Produces vivid, wet-looking koi that swim with a believable body wave, bank into turns, spread
along the whole river instead of clumping, avoid shallows, rocks, a boat and a submerged camera,
and now and then rise to kiss the surface (spawning a ripple ring the water shader draws).

Stack: three.js `WebGLRenderer`, `MeshPhysicalMaterial` patched with `onBeforeCompile`, a
matching `MeshDepthMaterial` for shadows; the mesh comes from headless Blender. Vanilla or R3F.
Water surface at y = 0, bed height `terrainHeight(x, z)`.

## When to use
- Adding fish or any swimming creature school.
- Fish look grey or pattern edges stair-step; shadows don't move with the fish.
- Boids collapse into one crowd that looks stuck, or fish jitter / swim through the camera.

## Paste-ready prompt

> Add `{{n, e.g. 24}}` `{{creature, e.g. koi}}` to `{{entry file}}`.
> - **Mesh (Blender, headless):** one *neutral* mesh with body, fins, eyes and barbels, and **no
>   painted pattern**. Chunky from above. Fins are multi-segment sheets. Put animation data in
>   `COLOR_0`: **R** = pectoral weight (root → tip), **G** = side, **B** = flutter weight toward
>   free edges. Export with `export_vertex_color='ACTIVE'`. In three, rename the attribute to
>   `finData` so it doesn't tint the material.
> - **Patterns in the fragment shader** from object-space position: one variety uniform per fish
>   (kohaku, sanke, showa, ogon, tancho, asagi, kigoi…). Crisp noise patches biased to the back, a
>   pale belly, hex scale rows (`atan` around the body). `MeshPhysicalMaterial` with clearcoat 0.9;
>   ogon metalness 0.7. Fins translucent with rays, alpha fading to the edge.
> - **Vertex swimming:** a travelling wave growing toward the tail; a whole-body C-bend ∝ turn
>   rate; pectorals flap and tuck in when sprinting; free edges flutter. Give the
>   `customDepthMaterial` the same patch.
> - **Behaviour:** boids (cohesion, alignment, separation) plus wander; look ahead and turn away
>   from the shallows; avoid rocks; occasional bursts; turn-rate-limited heading; roll into turns
>   (Euler `YXZ`); tail-beat frequency from speed; every few seconds one fish kisses the surface
>   and spawns a ripple. Give each fish a patrol home and expose count/speed/spacing/schooling/roam
>   in a Tune folder.

## Implementation

### Mesh and attributes
- Object space (metres): snout at +X (~0.28), tail tip ~−0.30, back +Y, fish-left −Z.
- COLOR_0 → `finData` on load: `geo.setAttribute('finData', geo.attributes.color); geo.deleteAttribute('color')`.
- Material split by mesh name: `/fin/` → translucent fin material, `/eye/` → black clearcoat, else body.

### Shaders ([`references/koi-shader.js`](references/koi-shader.js))
- **Swim:** `s = clamp((x + .30)/.58)` (0 tail, 1 snout); `amp = uAmp·(.010 + .085(1 − s)^2.2)`;
  `z += amp·sin(x·10.5 − t·uSwim + phase)`; C-bend `z += uTurn·(x − .14)²·2.2`; pectorals
  `y += R·(sin(t·beat + sideOffset)·.016 − fold·.004)`, tuck `z += R·side·fold·−.028`; flutter
  `z += B·sin(7.5t + 28x + 37y)·.0045`.
- **Pattern:** `top = smoothstep(−.02, .035, y)`, belly `smoothstep(−.012, −.05, y)`, two-fbm
  noise; patches `smoothstep(.465, .495, n + top·.2 + head·.22 − .1)·(1 − belly)` — a narrow
  smoothstep gives crisp edges. Scale rows: `(x·105, atan(z, y)·8.5)` with odd rows offset by .5,
  darken edges by 16 %. Fin rays `.86 + .14 sin(190·(…))`, alpha `mix(.95, .45, B)`.
- **Materials:** body `MeshPhysicalMaterial({ roughness .3, clearcoat .9, clearcoatRoughness .12,
  sheen .4 })`; fins `transparent, opacity .78, DoubleSide, depthWrite false`; ogon metalness 0.7.
- **Shadows:** only the body casts; `customDepthMaterial` = a `MeshDepthMaterial(RGBADepthPacking)`
  with the same vertex chunk and uniforms.
- If the scene has a toon-ramp light-loop replacement, opt the fish out so clearcoat/sheen stay on
  the stock path.

### Behaviour ([`references/koi-boids.js`](references/koi-boids.js))
- Neighbours within ~2.4 m (`d² < 5.8`): cohesion `.12·schooling/n`, alignment `.1 + .5·schooling`,
  separation **ramped** `(1 − d²/r²)²` inside `0.9 m × spacing` (not 1/d²).
- **Patrol home per fish:** even slots along the river, own side of the channel, drifting slowly
  (`sin(.05t)·2.5·roam`); a soft spring only beyond `reach = 2.5·roam + .5`. Keep cohesion small
  (`schooling` ≈ .25).
- **Wander = two slow sines per fish** (`sin(.23t + w) + .6 sin(.61t + 1.7w)`), not a per-frame
  random walk.
- Shallows: sample the bed 1.2 m ahead; if above −0.45 m, push toward the channel. Rocks: ramped
  push from 0.5 m out. A boat hull: a moving obstacle with a wider berth. A submerged camera:
  a ~1.6 m obstacle (widen to ~3.4 m for a cinematic that stages its own fish).
- **Clamp steering acceleration ≤ 0.9**, target speed `.20 + .06 sin(…)` + bursts (`.28 sin(π·b/1.4)`,
  rate ~0.04/s), speed and depth eased with `1 − exp(−dt·k)` (frame-rate independent).
- Heading: turn rate ≤ 1.5 rad/s; `turn` eased, bank `rotation.x = turn·.25` with Euler order `YXZ`;
  shader `uSwim = 4.5 + 14·speed`, `uAmp = .6 + 1.4·speed + .8|turn|`, `uFold = smoothstep(speed, .3, .55)`.
- **Surface kiss:** every 5–11 s a random fish rises to y ≈ −0.09 for 3.2 s; when above −0.12 it
  writes a ripple slot `(x, z, amp .9, startTime)` just ahead of its snout.

### Night
Clearcoat → 1.0, clearcoat roughness → 0.05. Bioluminescence: the colour function also outputs a
glow mask; add `mask × orange × (.55 + .45 sin(t·1.3 + phase)) × uBio` to
`totalEmissiveRadiance`; fin tips pale cyan from B. Ghost/silver variety: **metalness ≈ 0.35**,
faint steady silver emissive. See `threejs-ghibli-night-mode`.

## Pitfalls
- **Vertex-colour patterns stair-step** at this mesh density — paint in the fragment shader.
- **Translucent fins casting shadows** print dark streaks on the back.
- **In `onBeforeCompile`, inject helper GLSL before any code that calls it.**
- **Absorption from vertical depth** (not view-ray thickness) in the water makes fish look grey.
- **Flocking cohesion** makes koi collapse into one crowd that looks stuck — use patrol homes.
- **Random-walk wander + unclamped steering** looks nervous; use sines, clamps and eased speed.
- **A fully metallic ghost koi goes black** when the environment map dims at night.
- **Tours/cinematics:** pointing the camera at a fish through hazy water fails and following one
  makes the camera jerk — stage fish instead (`threejs-camera-guided-tour`), flag them `scripted`
  so the flocking step skips them, and hand them a velocity on release.
- **Timers seeded at build with small absolute values** fire at once when the clock is page time.

## Verify
- Close up: patterns crisp and vividly coloured through the water, scales visible, fins translucent.
- Shadows on the bed swim with the bodies.
- Watch 60 s from above: fish spread along the river, no crowd, no jitter, no fish crossing the
  bank; occasional ripple rings from kisses. Dive the camera: fish curve around it.

## Related skills
`threejs-webgl-realistic-water` · `threejs-webgl-underwater-effect` · `threejs-ghibli-night-mode` ·
`threejs-blender-glb-pipeline` · `threejs-camera-guided-tour` · `threejs-boat-buoyancy-steering`
