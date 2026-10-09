---
name: threejs-floating-island-landmark
description: Builds a Castle-in-the-Sky style floating island landmark for three.js — a headless-Blender generator for a hanging rock cone (strata steps, crags, stalactites, crystals, roots), an ivory castle with towers and ribbed verdigris domes, a courtyard, stairs, a gear and waterfalls pouring off the rim, exported with named materials, plant sites and spot JSON, then dressed in the browser by one material-name → procedural-shader table (triplanar ashlar stone, copper patina, aged bronze, broken-strata rock, fraying falls), its own far haze instead of scene fog, a slow spin and bob, and windows and crystals that glow at night. Use when the user wants a floating island, sky castle, Laputa, a distant landmark in the clouds, a large procedural castle or ruin GLB, stone that looks shiny or tiled, or a big model that vanishes into fog.
---

# Floating island landmark: a sky castle on a hanging rock

A landmark that reads at 400 m as a silhouette in the cloud layer and holds up when you fly
in and walk it: a rock cone stepping down in strata to hanging roots and a glowing crystal,
an ivory keep with round towers and ribbed copper domes, an arrival platform, bridge,
courtyard and stairs, gears, waterfalls tipping off the rim. Proven on a Laputa-style sky
castle (≈66 m model at scale 1.5, ≈120k tris, 0.7–0.9 MB with Draco).

Stack: headless Blender 5.x generator on the `studio.py` helpers from
`threejs-blender-glb-pipeline`; three.js r186 `WebGLRenderer`, GLB through `GLTFLoader` +
`DRACOLoader`; materials patched with the `patch()` hook from `threejs-ghibli-toon-shading`.

## When to use
- A floating island, sky castle or distant hero landmark in the sky.
- A large generated building GLB whose surfaces should be procedural (no UVs, no textures).
- The landmark disappears in fog, turns into a black blob at night, or its stone looks
  glossy / like glazed tile.

## Paste-ready prompt

> Add `{{landmark}}`, a floating island in the far cloud layer of `{{scene}}`, built as a
> headless-Blender GLB (`blender/craft_{{slug}}.py`) after `{{reference image}}`:
> - an inverted rock cone whose profile alternates wall and ledge pairs (strata steps), with
>   crag jitter, hanging crags and stalactites, short hanging roots and crystals at the tip;
> - an ivory keep with round towers, ribbed verdigris domes on bronze ribs, an arrival
>   platform → arcaded bridge → round courtyard → stairs → half-open bronze door;
> - gears, `{{n}}` waterfalls off the rim, banners, cypress, a guardian figure.
>
> Export named materials (`{{slug}} stone`, `roof`, `bronze`, `rock`, `water`, `window` …),
> plant sites and spots as JSON in the web frame, and Draco-compress. In the browser, shade
> every material procedurally from object-space position (one table keyed by material name),
> skip the scene fog in favour of the far clouds' haze, spin it slowly, bob it, light the
> windows and crystals at night. Keep the hand-painted look: no photo PBR textures.
>
> Every new random draw uses its own `random.Random(seed)`; diff the plants JSON after each
> export.

## Implementation

### 1. Generator layout (`references/island-generator.py`)
- **Constants first:** `RIM`, the `CONE` profile `[(r, z), …]` (wall/ledge pairs), terrace
  levels, courtyard/platform centres, `FALLS = [(deg, width, drop)]`. The web scene reads
  some of them (fall feet, rim height), so print them in a REPORT line and assert them.
- **Rock:** `revolve()` the cone profile with a `crag(seed, amp)` radial jitter so it doesn't
  read as a lathe; boulders on the ledges; 12 hanging crags + stalactites under the ledges;
  hanging roots **6–16 m** (70 m roots hid the tip crystal); crystals seeded into the flanks
  from their own rng.
- **Castle:** helpers `tower()` (cornice bands, window slits, balcony ring), `dome()`
  (verdigris lathe + bronze rib tubes + finial), `arcade()` (deck, arched spandrel slices,
  piers), `rail_ring()` with gaps, `balustrade()` with vase balusters. Use **≥ 20 slices per
  arch** — 9 read as stairs.
- **Moving parts** go into their own nodes with the origin at the pivot (`part()` context →
  exported as `<part>__<material>`), so the web can spin gears or turn a head.
- **Waterfalls:** `sheet()` builds 2–4 strands of uneven width that bulge over the lip,
  sway as they drop and narrow; seeded by the lip position. A low foam roll over the lip,
  never bead-like balls down the sheet (they read as a string of pearls).
- **Curves that bend:** run roots and vines through a Catmull-Rom `spline()` before
  `tube()`; straight segments kink.
- **Export:** named materials, plant sites → `{{slug}}.plants.json` (cypress, shrubs, ivy,
  ferns, leaf clumps; converted to the glTF frame `(x, z, −y)`), spots → `{{slug}}.walk.json`,
  then `npx @gltf-transform/cli draco` (3 MB → 0.5 MB at 69k tris). Foliage is grown in the
  browser on those sites (see `threejs-procedural-vegetation`).

### 2. Runtime dressing (`references/material-table.js`)
- Traverse the island once; key = material name minus the prefix. Set per-key PBR knobs, then
  `patch()` with the table entry. Shaders work in object metres (`vLocal`) with an
  object-space normal varying (`vObjN = objectNormal`) — no UVs.
- **Shared screen-space bump:** the colour hook writes a height `gLapH`, the normal hook
  tilts `normal` by `dFdx/dFdy(gLapH)` (perturbNormalArb). Fade detail with
  `lpFar() = smoothstep(45, 260, viewDist)`.
- **Stone:** triplanar running-bond ashlar (courses .44 × 1.0 m on walls, .9 m flags on
  floors) sized for a 1.5 m eye, per-block tint ±7 %, joints darkened ~20 %, rain streaks,
  grime under ledges, moss on up-facing ledges. **Cut the joints with colour, not bump.**
- **Roof:** verdigris runs (`fbm` stretched vertically), copper showing in worn patches;
  metalness .35, roughness .42.
- **Bronze:** metalness .82, roughness .34, verdigris in the hollows, a **low-frequency,
  weak bump (.08)** — fine pits on a mirror metal alias into glitter.
- **Rock:** wandering strata (`y*.42 + fbm*3.5`) broken into slabs with dark joints and
  cracks, paler weathered crusts.
- **Falls:** transparent, double-sided; fbm streaks scroll down; a depth factor
  `dk = smoothstep(2.5, −21, y)` whitens, frays and fades the sheet as it drops.
- **Tiles:** turquoise tesserae with per-tile tint and pale grout (roughness .12 is fine here).

### 3. Far haze, motion, night (`references/night-glow.js`)
- At 400 m `FogExp2` is total, so set `material.fog = false` and replace
  `#include <fog_fragment>` with the far clouds' own haze: horizon mist by height,
  `.28*smoothstep(250, 620, dist)`, plus a weather wash. Fade all of it with
  `smoothstep(90, 330, dist)` so the island is crisp when flown up to.
- **Night:** mix toward the night sky's mid tone (≈ `.38*night`), not the night fog colour
  (that gave a black blob). Windows via `glowAtNight()`; hall/fire/crystal get a day and a
  night emissive with a small pulse: `I = (day + (night − day)·k)·(1 − p/2 + p/2·sin(t·ω))`.
  A soft additive halo sprite at the crystal, opacity `.55·night`.
- **Motion:** a pivot group at the rim: bob `2.2·sin(.07t)` m, spin `.004` rad/s plus the
  faintest roll. Pause the spin while it is flown to or inspected; the inspect camera rides
  the bob (`camera.y += dy; target.y += dy`) so it holds still in frame.
- **LOD:** past 280 m swap plant geometry to a sparse copy (a third of the cards).

## Pitfalls
- **Glazed-tile stone.** A deep joint bump (height `−joint*.9` at bump strength .5) tilts
  every block's lip toward the sun and draws a bright bevel line: the castle reads as shiny,
  reflective tile. Use `−joint*.1`, grain at ≈ .07 and .025, roughness .97,
  `specularIntensity` .04, `envMapIntensity` .45. Grain at .3 is as bad: it ripples like
  caustics. Joint darkening above ~20 % reads as cartoon brick.
- **Global rng drift.** `ball(jitter=…)` drew from the global rng once per vertex, so adding
  any jittered primitive — or changing a jittered ball's `detail` — reshuffled every later
  draw and moved trees, shrubs and roots. Give each new feature `random.Random(seed)`, wrap
  bigger builders in an `@own_rng` decorator that swaps the global, and diff the plants JSON
  after every export (it must be unchanged unless you meant it).
- `glowAtNight()` clones materials and a clone drops `onBeforeCompile`: call it **before**
  `patch()`.
- The geometry bbox is pre-ground; the mesh node carries the offset. A halo placed from the
  bbox sat 57.8 m low — add `o.position`.
- Crystal emissive blows out to white under bloom: clamp to ≈ `.85 + .2·sin + 2.4·pulse`,
  halo ≤ .3.
- Hollowing a block exposes geometry it hid (tree trunks through rooms): push such points
  out through the wall by their full radius.
- OrbitControls `maxDistance` clamps any view of a target 400 m away; aim 25 m along the line
  of sight, and loosen limits while flying there, restoring them once settled.
- Mist points at the fall feet read as blobs unless faded with distance.

## Verify
- Fixed views from far (river, meadow), mid (inspect orbit) and close (courtyard, keep door,
  stairs, towers) — headless, manual clock, clear weather (`threejs-headless-visual-verification`).
- Close-up stone in low sun: no bright bevel lines, no ripple; far: no shimmer.
- Night: windows lit, crystal glows without a white blowout, island a moonlit silhouette.
- Rebuild twice: GLB size stable, plants JSON byte-identical, REPORT constants unchanged.
- For a quality pass, score each object in the scene (form / story / paint), fix the lowest
  first, stop when a round gains < ~0.1.

## References
- `references/island-generator.py` — trimmed generator skeleton: cone, crags, own-rng
  decorator, `sheet()`, `spline()`, `part()`, JSON + REPORT export.
- `references/material-table.js` — the material-name → shader table (stone, roof, bronze,
  rock, water), the ashlar helper and the screen-space bump.
- `references/night-glow.js` — haze replacing fog, night emissive table, spin/bob step.

## Related skills
threejs-blender-glb-pipeline · threejs-first-person-bvh-walk · threejs-ghibli-toon-shading ·
threejs-ghibli-sky-clouds · threejs-ghibli-night-mode · threejs-procedural-vegetation ·
threejs-stylized-rock-material · threejs-headless-visual-verification
