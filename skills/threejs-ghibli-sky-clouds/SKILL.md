---
name: threejs-ghibli-sky-clouds
description: Builds a Studio Ghibli–style painterly sky for a three.js scene — an inverted sky-dome ShaderMaterial with a zenith/mid/horizon gradient, a hand-painted horizon haze that melts into the fog colour, a soft painted sun halo (no photoreal disc), and fluffy cumulus clouds made of instanced icosphere puffs with three-tone toon shading, wispy torn limbs, core occlusion and Henyey–Greenstein silver linings. Use when the user asks for an anime/Ghibli sky, painterly clouds, cumulus, sky gradient, sun halo, horizon haze, stylised volumetric clouds, or a sky that must follow a day cycle.
---

# Ghibli sky dome & hand-painted clouds

Produces the anime sky of a Ghibli background painting: a saturated blue zenith, a pale turquoise mid-sky, warm cream at the horizon, a haze band that blends into the terrain fog with no visible seam, a soft glowing sun, and fair-weather cumulus with cream tops, sky-blue sides and lilac bellies.

Stack: three.js `WebGLRenderer` (tested on r186), vanilla or React Three Fiber. The sky is a `ShaderMaterial` on a `BackSide` sphere; the clouds are a single `InstancedBufferGeometry` draw with a custom `ShaderMaterial`. Both read a shared `uSunDir`/`uSunColor` uniform object, so anything that already moves the sun (a day cycle, a GUI) drives them for free.

## When to use

- The scene has a flat colour/HDRI background and should look hand-painted.
- You need clouds that read as volumes but stay cheap (one draw call, ~150 puffs).
- A day cycle or night mode exists (or will): the sky must re-tint with sun elevation.

## Paste-ready prompt

> Enhance the sky and clouds of the three.js scene in `{{entry file}}` toward an authentic Studio Ghibli look. Target: `{{reference image}}` — {{style, e.g. "vibrant sky gradient, fluffy painterly cumulus, warm sunlight"}}. Keep every tunable as a named constant at the top of the script and in a lil-gui "Ghibli Tune" folder. **Anything that already drives the sun must keep driving the new shaders.**
>
> 1. **Painterly sky dome.** Custom `ShaderMaterial` on an inverted sphere: zenith → mid-sky → horizon warmth by view height and sun elevation; a soft hand-painted haze band at the horizon blended into the fog colour with a non-linear smoothstep ramp (the ground must never meet the sky on a hard line); a soft painted sun glow from the sun-direction uniform, never a hard disc. Dither the output.
> 2. **Hand-painted clouds.** One instanced icosphere (detail 3, `mergeVertices` first), ~150 puffs with per-instance `aPos / aCenter / aDrift`: a flat row of belly puffs plus a cauliflower crown. Three tones — warm cream sunlit tops, saturated turquoise/light-blue mid-tones, warm lilac undersides — keyed on `dot(normal, sunDir)` with smoothstep edges so contours look brushed. Blend each puff normal toward the whole-cloud normal. Tear the limbs with drifting 3D fbm, add core occlusion, a powder term and Henyey–Greenstein forward scattering for silver linings that turn fiery at dusk. Drift slowly and wrap.
> 3. Set the sky's haze colour from `scene.fog.color` every frame. Screenshot close-up, eye-level and wide views after each step and fix flaws before moving on. Report the frame cost.

## Implementation

### Sky dome (`references/sky-dome.glsl`)
- `SphereGeometry(500, 48, 24)`, `side: BackSide`, `depthWrite: false`, `fog: false`, `renderOrder = -10`. In the vertex shader set `gl_Position.z = gl_Position.w` so it sits on the far plane.
- Gradient on `t = clamp(dir.y, 0, 1)`: `mix(horizon, mid, smoothstep(0, hazeH*1.6, t))`, then `mix(…, top, smoothstep(hazeH, .85, pow(t, .8)))`.
- Haze: `haze = pow(1 - smoothstep(-.04, hazeH*.55, y), hazePow)`; `c = mix(c, fogColour, haze)`. Values that worked: `hazeH = 0.14`, `hazePow = 2.2` (>1 hugs the horizon).
- Warmth toward the sun's azimuth: `pow(max(dot(sunXZ, dirXZ), 0), 3) * (1 - smoothstep(0, .35, y))`, mixed ~0.45 toward a warmer horizon colour.
- Sun halo = three exponential lobes of `(1 − cosA)` (widths 90, 11, 2.2 divided by a size uniform; weights .75/.28/.08) — no disc. Normalise the sun colour by its max channel for the tint.
- Low sun: `c *= mix(.55, 1., smoothstep(-.05, .35, sunDir.y))`; the day cycle lerps top/mid/horizon toward a dusk palette.
- Dither: `c += (hash(gl_FragCoord.xy) - .5) / 255.` removes gradient banding.
- Starting palette (sRGB): zenith `0x3684d8`, mid `0x8ccbee`, horizon `0xf7e6c6`, fog `0xdcefe4`; dusk `0x3a5f9a / 0xe9a26f / 0xffb46a`.
- **Every frame:** copy `scene.fog.color` into the sky's `low` (haze) uniform so the horizon always matches the fog, whatever the day cycle, weather or night blend did to it.

### Clouds (`references/cloud-puffs.js`)
- Layout per cloud: 5–9 belly puffs on one flat base line (radius `w*(.15+.08r)*sqrt(1-|u|*1.4)`), then 4–7 crown puffs peaking off-centre. Two layers: near at 170–250 m (55–110 m up), far at 380–540 m, bigger, higher and sinking into haze. A sparse sky (≈9 clouds) reads more like a painting than a full one.
- Vertex: displace along the sphere normal by `fbm3(n*2.6 + seed) - .5` times a lump amount (~0.38), squash Y (~0.68 → thin fair-weather clouds). Drift the whole cloud together: `shift = mod(c.x + t*drift + 420, 840) - 420 - c.x`, applied to puff and centre.
- Whole-cloud normal `vCN = normalize((p - centre) * vec3(1, 1.7, 1))`; shading normal `mix(puffN, vCN, ~0.42)` (higher = one smooth lump, lower = a bag of balls).
- Fragment, in order:
  1. **Limb alpha** from `dot(puffN, V)` torn by drifting fbm: `alpha = smoothstep(.02, .5, rim + (wisp - .5)*.6) * 0.8`; discard below .02. Material: `transparent: true`, `depthWrite: true`.
  2. **Three tones as a continuous transfer**: `l = dot(N, L) + noise*.35`; `k1/k2 = smoothstep` around edges `lo = −0.42`, `hi = −0.06` (seen from below most of a cloud is side/belly, so keep these low), softness 0.10. Colours: lit `0xfff8e8`, mid `0xb4dcef`, shade `0x9a8fc6`.
  3. **Ambient**: 18 % toward `mix(fog, zenith, .5 + .5*N.y)`; flatten and shade bellies by `vCN.y`.
  4. **Core occlusion**: `c *= mix(.6, 1., smoothstep(-.35, .75, dot(puffN, vCN)))`.
  5. **Micro-detail + powder**: `c *= .84 + .3*fbm3(p*.11)`; brighten just inside lit edges with `1 − exp(−2.2(1 − rim))`.
  6. **Silver lining**: Henyey–Greenstein `g = 0.62`, normalised so forward = 1, times limb thinness, boosted at low sun (fiery at dusk).
  7. Horizon haze and far-layer mist toward the fog colour; dim with low sun.
- Sun tint: blend the normalised linear sun colour **halfway to white** — `0xffe2a8` normalised is ~(1, .75, .4) and reads orange.
- Put the mesh on a layer the refraction/depth pre-pass skips, `frustumCulled = false`, and hide it from the AO pass.

## Pitfalls

- A hard horizon line: always blend the haze into the *fog* colour, and update it from `fog.color` every frame.
- `IcosahedronGeometry` without `mergeVertices` renders faceted after displacement.
- Hard toon bands on clouds look like cut paper; soft continuous transfer + noise-brushed `l` reads painted.
- Clouds **drift** (+X ~1.3 m/s, wrapping every 840 m): a cloud bank meant to sit on the moon's or sun's path must get near-zero drift (~0.03) or it walks away within minutes.
- Icosphere clouds look slightly faceted/balloon-like up close — this is a known limit; keep them far.
- Guard every noise division (no Inf → no black specks); the value noise here has no divisions.
- Clouds printed by GTAO become dark sheets: exclude them from the AO pass (see `threejs-postprocessing-anime-grade`).
- Night: a brighter lit colour plus a moon glow makes clouds read as daytime. Keep night lit colours in the mid-blues and the moon glow narrow (`pow(nearMoon, 24)`), and read the *visual* moon direction, not a clamped light direction.

## Verify

- Eye-level view: no seam where terrain meets sky; horizon colour equals the fog colour.
- Look toward the sun at low elevation: halo soft, cloud limbs glowing, no disc.
- Sweep the day cycle: sky, halo and clouds follow the sun uniform with no stale colours.
- Wide zoom-out: clouds sit in haze, nothing clips the far plane.

## Related skills

`threejs-day-cycle-lighting`, `threejs-ghibli-night-mode`, `threejs-ghibli-toon-shading`, `threejs-postprocessing-anime-grade`, `threejs-webgl-rain-effect`.
