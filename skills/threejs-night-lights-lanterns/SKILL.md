---
name: threejs-night-lights-lanterns
description: Adds warm night light and life to a three.js scene — floating paper lanterns drawn from one InstancedMesh and a canvas text atlas (aCell), fireflies and moths as single Points draw calls, glowing lotus and lily pads, low river mist, a hurricane oil lamp with an additive flame, paper chōchin lanterns, a boat-bow lantern that hangs plumb and swings as a damped pendulum, and the "one real point light follows the nearest source" pattern with lights pre-created at intensity 0. Use when a night scene needs a focal point, lanterns, fireflies, lamps, point lights without recompiles, or glowing props.
---

# Night lights, lanterns and river life

A first night pass is usually correct but murky: all cool blue, nothing leading the eye. Warm
pockets fix it — lanterns drifting with the current carrying lines of text, a lamp beside the
focal character, fireflies along the banks, a lantern swinging on a boat. Everything fades with
the night blend `k` and costs one draw call per system.

Stack: three.js `WebGLRenderer` (vanilla or R3F), `MeshStandardMaterial` patched with
`onBeforeCompile`, `ShaderMaterial` Points, a bloom pass. Assumes a night blend `k` exists
(`threejs-ghibli-night-mode`).

## When to use
- The night scene needs warmth or a focal point.
- You want many glowing light sources without N real lights.
- Toggling night causes a hitch (a light added at runtime recompiles everything).
- A lantern must hang from a moving/rocking vehicle.

## Paste-ready prompt

> Add warm pockets and life to the night of `{{entry file}}`:
> - `{{n, e.g. 9}}` floating paper lanterns drifting with the current: one InstancedMesh for the
>   paper, one for the wooden frame; each lantern reads its own cell of a canvas atlas through an
>   `aCell` instance attribute patched into the UV varyings; the paper texture is both `map` and
>   `emissiveMap` so the handwriting stays dark on glowing paper. Write one line of
>   `{{user text source}}` per lantern and redraw the atlas when it changes.
> - A small oil lamp beside `{{focal character}}` with the only extra real light.
> - ~110 fireflies (one `Points`, wander by summed sines, `pow(sin, 4)` blinks, never in sync),
>   lily pads with a few faintly glowing lotus, and a very faint low mist masked to the river.
> - Hang a `{{paper lantern}}` from a bent `{{bamboo}}` pole at the bow of `{{boat}}`. Keep it
>   plumb in the world and swing it as a damped pendulum from the boat's acceleration and rocking.
>   By day it is unlit paper; at night the paper glows and one point light (created at intensity 0
>   so night never recompiles) lights `{{character}}` and the water.
> Everything fades with the night blend. Screenshot at night from eye level and from above.

## Implementation

### Lights: born at 0, one real light for many sources
- **Create every night `PointLight` at build time with intensity 0** and raise it with k. Adding
  a light when night is toggled changes the light count and recompiles every patched material on
  that frame.
- **Many small sources (stone lanterns, fire boxes):** one real point light jumps to the source
  nearest the camera and fades with distance (full inside ~60 % of a ~40 m reach). It lights the
  ground for real; N point lights would make every shader loop N more lights. A terrain decal
  "light pool" failed — it hid under the road strip and the grass.
- **A light inside a small metal prop** lights it from centimetres away and blows out under bloom.
  Hang it above the prop (the oil lamp's light sits ~0.46 m above its base).
- Code: [`references/fireflies-and-lights.js`](references/fireflies-and-lights.js).

### Floating paper lanterns (tōrō nagashi)
- Paper = four `PlaneGeometry` panels merged, each showing the whole cell so the line reads from
  every side. `aCell` = `(col, rows−1−row)`; in the vertex shader after `<uv_vertex>`:
  `vMapUv = (uv + aCell)/vec2(COLS, ROWS); vEmissiveMapUv = vMapUv;`.
- Canvas cell 320×384: a radial washi gradient warm where the candle sits, a few long fibres, the
  text in a handwriting web font (wait for `document.fonts.load(font)` then redraw).
- Emissive gain ~**1.35** × warm orange (`0xffa94d`): just over night's bloom threshold, so it
  glows without flattening the text. Per-lantern flicker from `instanceMatrix[3].xz` as a seed.
- Optional washi crinkle: unsmoothed value noise as a tiny bump (`.0016` m) and as emissive
  modulation (thinner creases glow brighter) plus a hot spot where the candle sits.
- Motion: lane offsets from the river centreline, ~0.16 m/s with the current, gentle roll/pitch
  (±0.035 rad), y from the shared wave height; fade in/out at the ends of the reach by scale.
- Layer 1 keeps them out of the refraction pre-pass; the planar reflection mirrors the writing,
  which reads as real. Mark the materials `keepAlbedo` so night white-dimming skips them.
- Code: [`references/lantern-atlas.js`](references/lantern-atlas.js).

### Fireflies and moths
- ~110 fireflies, one `Points`: spawn mostly along the banks, a few over the water, 0.25–1.65 m up.
  Wander by summed sines in the vertex shader; blink `pow(max(0, sin(t·(.6 + seed·.8) + seed·50)), 4)`
  so they are never in sync. Colour `0xd6ff72`, peak ~1.25 linear (a small soft bloom each),
  ~7 px at 8 m, min 2 px.
- A swarm in a hero tree's crown seen from far: same shader, bigger points (`30/-mv.z`) and a
  higher floor (`.25 + blink`).
- Moths: points on erratic orbits (r 0.16–0.38 m) round each fire box, wingbeat size flicker
  `.55 + .45|sin(37t)|`, night only.

### Lilies, lotus, mist
- Lily pad: a polar grid with the notch cut out, the rim curled up (`.07 r⁴`) and faintly wavy;
  veins (~18), midrib and a reddish rim painted in the shader from `vLocal`. Pads/lotus/buds float
  on the shared wave-height function (y only).
- Lotus: two lathe rings of pointed petals (white base → pink tips in vertex colour) round a
  yellow seed pod; emissive pink `0xff7fb4` × ~0.5 × k. Keep the lathe's own smooth normals —
  `computeVertexNormals()` on non-indexed geometry gives flat facets.
- Mist: two large planes (y ≈ 0.14 and 0.4) with alpha `smoothstep(.5, .82, fbm) × riverMask ×
  nearFade × farFade × ~0.1 × k`, the river-centre formula re-implemented in GLSL. Put them in
  the AO-hidden list.

### Oil lamp (hurricane lamp from lathe profiles)
Fount, burner gallery, wick knob, bellied chimney (fresnel-rimmed transparent glass, emissive
warms only slightly), four wire guards as `TubeGeometry` along Catmull-Rom arcs, vented cap, bail.
The flame is an additive lathe teardrop: blue at the wick, a white-gold core by the view-facing
term `pow(N·V, 1.5)`, orange skirts, swaying and stretching on the **same beat** as the light's
flicker (`.9 + .06 sin(9.1t) + .04 sin(23.7t + 1.3)`). Light: `0xffa050`, ~2.4 cd, distance 6.

### Paper chōchin (treehouse eave, shrine)
Ribbed lathe (`r = .085 sin(π(.12 + .76t))·(1 + .04 cos(14πt))`) between black caps on a short
cord; paper emissive `0xffa050` × ~2.2 × k with a slow flicker. Collect all glow materials in one
list stepped with k.

### Boat-bow lantern (plumb pendulum)
Parent a pivot to the hull at the pole tip and each frame set
`pivot.quaternion = inverse(hullWorldQuat) × swing(ax, az)`. Drive the swing with a spring
(ω ≈ 6.5, damping ≈ 1.6) toward `−acceleration/g` plus a slow sine for wind; clamp ±0.5 rad.
Paper is a lathe with a canvas texture (washi gradient, rib lines, vermilion end bands) as both
`map` and `emissiveMap`. Move the shared, pre-created point light to just under the paper each
frame. Code: [`references/boat-lantern-pendulum.js`](references/boat-lantern-pendulum.js).

## Pitfalls
- **NaN pendulum:** the boat's speed and heading are unset until its first step, so the pendulum
  read `NaN`; NaN survives every later frame and hides the mesh. Default inputs to 0 and reset the
  state when it isn't finite.
- **A light inside the paper** turned the bamboo tip, a hand's width away, white-gold. Use a
  longer cord and put the light just under the paper.
- **Unpatched GLB materials** (a stone lantern) read flat next to the toon-shaded scene. Reuse an
  existing shader (e.g. the rocks' granite) and lift/tint the colour after its colour stage.
- **Mist:** alpha 0.3 turned the whole night lavender; ~0.1 with sparse wisps.
- **Lantern emissive too high** flattens the handwriting into a white card; too low and it
  doesn't bloom. Stay just over the night bloom threshold.
- **Additive sprites that were fine by day bloom at night.** Keep firefly peaks modest and put
  every transparent/additive sheet in the GTAO-hidden list or AO prints it as a dark panel.

## Verify
- Force k = 1 and check: text readable on lanterns and mirrored in the water, the lamp lights the
  deck/character without blowing out its own brass, the nearest-lantern light hands off smoothly
  as the camera moves, no frame hitch on the first night toggle (lights already exist).
- Rock/accelerate the boat and watch the lantern lag and settle; freeze a frame mid-swing.

## Related skills
`threejs-ghibli-night-mode` · `threejs-boat-buoyancy-steering` · `threejs-postprocessing-anime-grade` ·
`threejs-webgl-performance-profiling` · `threejs-stylized-rock-material` · `threejs-webgl-realistic-water`
