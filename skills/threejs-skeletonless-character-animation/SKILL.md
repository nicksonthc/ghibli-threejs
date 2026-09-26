---
name: threejs-skeletonless-character-animation
description: Makes a three.js character feel alive without a skeleton or rig — a shared vertex-shader pose function (upper-body twist and nod, lidless blinks, pupil swivel, ear flicks, breathing) run by every posed material including shell fur and shadow depth materials; a "mind" of critically damped springs where eyes lead, head follows and body turns last; animal blink timing, looking around and glancing at points of interest; dangling legs; a held leaf/umbrella that bends as a cantilever in wind, apparent wind and inertia; shader-drawn faces for small spirits; and hinged-wing props. Use when animating a static GLB creature, adding blinking, head turns, idle life, look-at behaviour, or wind-reactive held props in WebGL/R3F.
---

# Skeletonless character animation: blink, look around, glance, held props

Produces idle life on a static-mesh character — it blinks like an animal, looks down the river,
at a fish, at the visitor; when something interesting passes, its eyes, then head, then body turn
to it with a slow blink and a curious tilt. A held leaf sways and cups in the wind. All of it is
vertex-shader deformation driven by a few uniforms, so it works with instanced shell fur (skinned
meshes can't be instanced) and shadows move with it.

Stack: three.js `WebGLRenderer`, `MeshStandardMaterial`/`MeshPhysicalMaterial` patched through
`onBeforeCompile` (chained with any existing patches), matching `MeshDepthMaterial`s. Vanilla or R3F.

## When to use
- A GLB character has no rig (or a rig that would break shell fur) and must feel alive.
- You want look-at / attention behaviour with natural lag and eye lead.
- A held prop (leaf, umbrella, flag) should react to wind and vehicle motion.
- Small background creatures need crisp faces at any distance.

## Paste-ready prompt

> Make `{{character}}` feel alive on `{{vehicle / spot}}`:
> - Blinks like an animal: a fast close, a brief hold, a slower open, every 2–7 s at random,
>   sometimes a double blink, and a blink at the start of any big head turn.
> - Looks around every few seconds: the path ahead, the banks, `{{a creature}}`, the sky,
>   sometimes the visitor's camera. The eyes lead, the head follows on a spring.
> - When it passes `{{point of interest}}`: eyes, then head, then body (with what it holds) turn
>   to it; a slow blink and a curious tilt; a ~3 s hold while the vehicle slows; then back.
> - Plus breathing, ear flicks and eye micro-motion.
> No skeleton: deform in the vertex shaders with one shared pose function used by every posed
> material, the fur shells and the shadow depth materials.
>
> Held prop: *"Give `{{character}}`'s `{{leaf umbrella}}` its own motion. Model the stem as a
> cantilever held at the paw, with the blade riding the tip. Use a spring–damper (≈1.4 Hz, lightly
> damped) driven by: the wind with gusts; the apparent wind of the vehicle's own motion; inertia
> from its acceleration and turns and from the character's body turns; and heave. The blade cups
> in the airflow and its rim flutters, faster in stronger air. Apply the same deformation to the shadow."*

## Implementation

### Shared pose function ([`references/pose-shader.js`](references/pose-shader.js))
- Every posed material gets the same GLSL `charPose(inout p, inout n)`, with `#define`s per part:
  - **upper body** twists and nods about a shoulder pivot, weight `smoothstep(.5, .78, y) ×
    (1 − armMask)` so the paw keeps its grip on the held prop;
  - **eyes** squash up to a lid line to blink; **pupils** rotate about the measured eye centres;
  - **ear tips** rotate about their bases (`smoothstep(.9, 1.01, y)` weight);
  - **belly** pushes along its normals (`sin(1.25t)·8 mm`).
- Body turns are just the group's yaw. This suits a neckless character, where turning the head
  *is* twisting the upper body.
- Apply to the body, face parts, **fur shells** (`InstancedMesh`) and each `customDepthMaterial`.
- **Measure pivots from the mesh** (eye centre + radius from the eye-white bounding box per side).
- **Blinking with no eyelids:** collapse the eyeball *fully* to the lid line and push it back
  (`z −= b²·r·0.8`) so the socket behind reads as a shut lid.

### Mind: springs, eye lead, attention ([`references/attention.js`](references/attention.js))
- Critically damped springs `a = ω²(target − x) − 2ωv`: head ω ≈ 5.5, tilt 3, body ≈ 3.2, pupils ≈ 16.
- **Eye lead:** drive the pupils by the head's *remaining* error (`(target − head)·0.55`, clamped
  ±0.35/±0.2) plus micro-motion, so they jump first and re-centre as the head arrives.
- Blink curve: close 0.07 s → hold 0.04 s → open 0.12 s; sleepy blink = × 2.6; 17 % double blinks;
  every 2–7 s; a blink when a new look target is > 0.35 rad away.
- **Aiming:** world target → vehicle-local, subtract head position, `yaw = atan2(−dz, dx)` for a
  front along +X; head yaw relative to body yaw. Idle head limit ~0.61 rad, glance ~0.87.
- **Glance:** split ~55 % body / 45 % head, clamp each; tilt 0.13 after 1.5 s; slow blink at 1.9 s;
  look back at 4.5 s; done at 6.2 s; the vehicle slows to ~0.65 during it; cooldown ~30 s;
  points-of-interest list, each looked at once per pass.
- Ear flick: 0.3 s half-sine of 0.35 rad on one or both ears every 6–15 s; fold back when rowing hard.

### Dangling legs
Everything below the knee plane swings ~7° about the knees on a ~6.5 s beat, legs out of step,
each leg's reach breathing slowly, eased in over 10 cm so the knee stays soft (`LEG_SWING` in
`pose-shader.js`). At 3° nobody noticed.

### Held leaf in the wind ([`references/held-leaf-wind.js`](references/held-leaf-wind.js))
- Stem: `t = dot(p − grip, axis)/L`, cantilever shape `t²(3 − t)/2`; twist grows with t.
- Blade: translate by the tip deflection, twist about the stem, tilt by `1.5·|bend|/L` about
  `cross(axis, bend)`; rotate normals by the same rigid part in `beginnormal_vertex`.
- Cupping/flutter from polar UVs: `r²·(flutter(angle, t) − 0.03·dot(radial, airDir)·|air| + nod)`.
- Physics in the holder's frame: air = wind − vehicle velocity (rotated by the inverse world
  quaternion); drag ∝ `|air|^0.5·air` (quadratic is too violent); inertia `−k·acceleration`, so the
  leaf swings forward when the boat stops; clamp bend at 20 cm.
- **Measure the rig from the mesh:** grip = the stem ring at the paw's height, top = the highest ring.
- Targets: calm bend 0.6–2.5 cm, twist ±3°, rim nod ±2 cm; rowing up to 10 cm; ~7 cm forward lag
  when decelerating.
- Leaf look: canvas-drawn veins (main, secondary, fine net) as `map` + `bumpMap`, roughness ~0.62,
  faked view-space translucency `pow(sat(V·L·.5 + .5), 3)·sat(−N·L·1.4 + .2)` × vein mask ×
  `(1 − .85·night)`, gain ~0.75.

### Small spirits with shader faces
Faces from the head's local position (`vLocal`): two tilted oval hollows and an O or slit mouth
as SDFs, antialiased with `fwidth`, a faint carved rim; each variant is one material with a
`uFace` vec4 (tilt, eye height, mouth type, scale). Lumpy heads: sine lobes along 4 random
directions, then `computeVertexNormals`. Heads rattle now and then and turn to watch the boat.

### Hinged-wing props (from the Blender side)
A folded wing as one rigid hinged panel needs ~100–120° to spread — brute-force search the hinge
axis for the angle you want. The glTF Y-up conversion is a rotation about X, so local-X rotations
keep their sign: `wing.quaternion.copy(rest); wing.rotateX(th)`, not `rotation.x`.

## Pitfalls
- **Depth shaders compile `beginnormal_vertex` only under some defines**, so a variable declared
  there doesn't exist in `begin_vertex`. Pose the normal and the position in two self-contained steps.
- **Trigger distances vs real paths:** the lane passed the point of interest at 5.3 m, so a 5 m
  look-up never fired. Measure against the actual path.
- **5 % eyeball left** after a blink shows a white sliver.
- **Duplicate module-scope `const` names** (`_lq`) in one big script throw a SyntaxError and
  nothing loads — give temporaries unique names (`_leafQ`).
- **Vertex-colour faces blur** on a 22×16 sphere; shader faces stay crisp.
- **Rim/fill light and bloom lift dark face hollows to grey:** multiply the final colour down
  inside the hollows (`gl_FragColor.rgb *= 1. − .9·hole` after `opaque_fragment`), zero the
  emissive there, keep the albedo below pure white.
- **Leaf translucency 1.35** bloomed neon lime; start at 0.75.
- **Chain `onBeforeCompile`**: keep the previous patch and extend `customProgramCacheKey`, or
  programs get shared/overwritten.

## Verify
- Stretch one blink (`queueBlink(t, 40)`) to screenshot it shut; expose `startGlance` on a debug
  hook to fire the sequence on demand.
- Check the shadow follows the head turn and the leaf bend; fur moves with the body.
- Log leaf bend in calm vs rowing vs a hard stop against the target numbers.

## Related skills
`threejs-shell-fur-rendering` · `threejs-boat-buoyancy-steering` · `threejs-blender-glb-pipeline` ·
`threejs-ghibli-toon-shading` · `threejs-headless-visual-verification`
