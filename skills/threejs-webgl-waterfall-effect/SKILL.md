---
name: threejs-webgl-waterfall-effect
description: Builds a stylised-realistic waterfall in three.js WebGL that pours off a heightfield cliff's true lip into a carved plunge basin — layered parabolic sheets (glassy at the lip, aerated and streaky below, tearing into spray), side threads, a wet ledged rock face, rising spray billboards with a 42° rainbow, ballistic droplets, rings and froth on the pool, and boulders at the foot. Use when the user wants a waterfall, cascade, spring, plunge pool, spray/mist with a rainbow, or water falling off terrain in a three.js / R3F scene.
---

# Waterfall: lip, basin, sheets, spray, rainbow

A waterfall that reads from far away and close up: water tipping glassy over an overhanging lip,
turning white and streaky as it accelerates, tearing into spray where it strikes a plunge basin
it has dug into the cliff's foot; a dark wet rock face behind it; spray puffs boiling up with a
faint rainbow when the sun is behind you; droplets thrown out; rings and froth running across the
pool. Everything is procedural geometry + `ShaderMaterial`/patched `MeshStandardMaterial` in a
three.js `WebGLRenderer` scene with a terrain height function and a water SDF (see
`threejs-open-world-streaming`) and water from `threejs-webgl-realistic-water`.

## When to use
- The terrain has (or can have) a cliff and you want water to fall from it into a pool.
- You need spray/mist that doesn't show a hard line at the water plane, or a physically placed rainbow.

## Paste-ready prompt

> A waterfall in `{{scene}}` that pours off the cliff's true lip into a plunge basin cut into its foot:
> - a wet rock face behind it;
> - three sheet layers on a parabola, glassy at the lip, white and aerated below, tearing into spray at the foot;
> - thin side threads;
> - rising spray puffs that fade at the water, with a rainbow at 42° from the antisolar point;
> - ballistic droplets;
> - rings and froth on the water;
> - boulders at the foot.
>
> **Check the geometry numerically before shading:** print a height grid round the site, find the
> real lip, and confirm the sheet's foot lands in water. Syntax-check the module with `node --check`
> before every reload.

## Implementation

### 1. Site geometry first
- **Plunge basin:** smooth-union a small ellipse into the river's signed distance
  (`d = smin(d, hypot((x − px)·0.8, z − pz) − r, 1.5)`), and multiply the cliff term in
  `terrainHeight` by `smooth(−0.3, 2.4, dPlunge)` so the cliff is notched steeply round it. The water
  plane already exists everywhere under the terrain, so carving the terrain is enough.
- **Find the lip where the cliff actually is:** from the basin, walk back up the notch wall in 10 cm
  steps until the ground is above a threshold (≥ 4 m here) *and* levels off
  (`h(z − .4) − h(z) ≤ .12`). The first version sampled the lower slope: the fall came out 3.6 m
  tall, started in mid-air, and its foam disc was buried under the terrain.

### 2. Wet rock face over a heightfield cliff
For each (angle a ∈ ±1.8 rad, height y) bisect along a ray from the basin centre to where the ground
reaches that height (24 steps); if it never does, tuck the vertex underground. Then pull the vertex
out by relief (`.16 + .42n + .16n2 + .26·ledge`, ledges `fract(y·.62 + n)³`, seams), add an
overhanging roll just under the lip (`.55·exp(−(a/.3)²)`), and push it back into the turf at the sides
and top so it emerges rather than ending in a hard panel. Vertex COLOR_0 with moss in alpha.
Reuse the rocks' shader (`threejs-stylized-rock-material`) and inject extra wetness by
string-replacing its rain term: `uRain*.85)` → `max(uRain*.85, cliffWet(vWPos)))`; soaked rock goes
dark `×(.5, .58, .56)`, dry rock gets long vertical stains.

### 3. Sheets (three layers + threads)
Grid 10 × 44 (+3 rows of "tongue" sliding to the lip along the ground). Row v ∈ 0..1:
`y = top − v·(top − yBot)`, `z = lip.z + zOff + throw·√v + bow·(1 − (2u−1)²)·(.25 + .75v)`
(out ∝ √drop — a parabola), width widening `× (1 + v·spread)`.
Layers `[width×, zOff, spread, bow, [speed, alpha, streak density, seed]]`:
back `[1.14, −.22, .36, .12]`, main `[1, 0, .28, .24]`, front `[.78, .15, .2, .3]`. Two thin threads
either side at `±(W/2 + 1.1)` falling onto catch-stones.

Fragment: **streak coordinate `f = √v·k − t·speed`** so streaks stretch as the water accelerates;
`aer = smoothstep(0, .2, v)` (glassy → aerated); frayed edges that widen with aeration; alpha tears
into spray over the last 22%; a bright roll at v ≈ 0.012
(`.45·exp(−((v − .012)/.014)²)`); colour teal-glass → white. `transparent`, `depthWrite: false`,
`DoubleSide`, fog on. See `references/waterfall-sheet.js`.

### 4. Spray + rainbow
30 instanced view-facing puffs born at the strike, swelling (`.8 + 3ph`) and rising (`ph²·5.5`) as they
drift out, fading in/out over their life.
- **Mist billboards:** fade alpha by the *corner's* world height — for a view-space quad,
  `world y = c.y + (viewMatrix[1][0]·x + viewMatrix[1][1]·y)·size`. This removes the hard line where a
  puff crosses the water plane.
- **Rainbow:** `θ = acos(dot(viewDir, −sunDir))`, band 40.7–42.4° (k = (θ − .706)/.036), hue violet
  (inner) → red (outer), only by day and with the sun above the horizon. **Let it raise the puff's
  alpha as well as its colour** (`a·(.17 + .3·bow)`), or it vanishes at spray opacities.
  Test by setting a low sun behind the camera for one frame.

### 5. Droplets, rings, froth, boulders
- 900 ballistic points: `p = origin + v0·t − (0, 4.2t², 0)`, life 0.7–1.5 s, sized in metres
  (`gl_PointSize = size·uPx/−mv.z`, `uPx = drawingBufferHeight/(2·tan(fov/2))`), culled below water.
- Water shader: a `uFall = (x, z, halfWidth, on)` uniform; rings run out from the strike *line*
  (`sin(L·6.5 − t·5.2 + noise)·exp(−L·.3)`), churn noise `exp(−L²·.9)`, froth
  `smoothstep(.3, .85, (exp(−L·.6) + .4·churn)·(.4 + .95n))·.9`.
- Boulders: two big ones flanking the strike, catch-stones under the threads, a few breaking the
  surface in front, a ring round the basin — instanced from the rock GLBs with caustics.
- Put spray and droplets on layer 1 (refraction pass skips them); cull them past ~160 m.

## Pitfalls
- **Transparent sheets, foam, mist and spray print as dark panels** because the AO pass draws them
  as solid — put them in the AO/pre-pass hidden list.
- Sampling the lip on the lower slope → a short fall starting in mid-air, landing on a dry shelf.
- `Math.exp(-(a/.3)**2)` is a **SyntaxError** (a unary minus before `**`) and the whole module fails
  — write `Math.exp(-((a/.3)**2))`. Run `node --check` on the extracted module before every reload.
- A rainbow that only tints colour disappears at spray alpha (~0.17).
- A `// comment` dropped mid-line in a one-line function silently comments out the rest.

## Verify
- Print a height grid round the site; confirm lip height, basin depth, and that the sheet foot is in water.
- Screenshot from the pool, from the side (parabola), and from above.
- Low sun behind the camera for one frame → the bow appears at ~42°.
- Look along the waterline for hard puff edges or dark sheets (AO).

## Related skills
`threejs-webgl-realistic-water` · `threejs-stylized-rock-material` · `threejs-open-world-streaming`
· `threejs-postprocessing-anime-grade` · `threejs-headless-visual-verification` · `threejs-day-cycle-lighting`
