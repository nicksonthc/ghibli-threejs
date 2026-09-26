---
name: threejs-webgl-wake-simulation
description: Makes a boat split the water with a physically dispersive Kelvin wake in three.js WebGL — a ping-pong half-float GPU height-field simulation using the iWave kernel over a world-locked window that follows the hull, hull-footprint forcing, streaky foam, relief shading that reads on clear shallow water, and a hull-attached analytic bow wave; also documents the simpler analytic Kelvin-wedge decal and why it looks wrong. Use when the user wants a boat wake, Kelvin V, bow wave, foam trail, interactive water ripples from a moving object, iWave, or a wake that stays in the water when the boat turns or stops.
---

# Boat wake: iWave GPU height field + near-field bow wave

The boat leaves a real wake in the water: the 19.5° Kelvin V with feathered divergent crests,
transverse waves behind the stern (wavelength 2πv²/g), bow and stern wave systems — all emerging
from the physics, left in the water where they were made, spreading and settling, with streaky
foam at the bow and in steep crests. A hull-attached analytic bow wave covers the first metre.
Runs as a 256² fragment-shader simulation in the three.js `WebGLRenderer` (two `HalfFloat` render
targets), read by the water material from `threejs-webgl-realistic-water`.

## When to use
- A moving object (boat, swimmer, duck) should leave a wake that persists, spreads and settles.
- An existing decal wake swings rigidly when the boat turns and vanishes when it stops.
- You need a quick analytic V first (see "Analytic Kelvin wake" below) — then upgrade.

## Paste-ready prompt

> Replace `{{boat}}`'s wake with an interactive simulation: a ping-pong half-float render target
> (height, previous height, foam) over a window that follows the boat but stays world-locked.
> Deep-water dispersion via the iWave kernel, so the Kelvin V, its divergent and
> transverse waves and the bow/stern wave systems come out by themselves at a scale right for a
> small, slow wooden boat. The hull's moving footprint displaces the water; bobbing rings it; foam
> comes from steep crests and the hull rim and fades. The water shader displaces vertices with it,
> bends normals, shades crests and troughs, and shows foam, blended with the ambient swell. Keep a
> hull-attached near-field bow wave. Keyboard steering to test. Draw the height field to a debug
> canvas before judging the shading.

## Implementation

### 1. State and window
- Two `WebGLRenderTarget(256, 256, { type: HalfFloatType, depthBuffer: false })`, RGBA:
  **R = height (cm), G = previous height, B = foam**. Clear to 0 at start.
- Window span 24 m (texel ≈ 9.4 cm). **World-locked:** re-centre by whole texels
  (`c = round(pos/dx)·dx`) and read the previous state at `uv + shift`, so nothing blurs.
- **Sponge** at the edges: `h *= mix(0.9, 1, smoothstep(0, .08, edgeDist))` — nothing reflects back.
- Fixed 60 Hz sub-steps (≤ 4 per frame), interpolating the hull pose between steps.

### 2. Physics: why iWave
- A plain wave equation gives a Mach cone — one sharp shock line that reads as a laser line.
- Scaling the wave speed with boat speed (c ≈ 0.34v) keeps a ~20° cone but still looks like a shock.
- **iWave gives true dispersion** (ω² = g·k, long waves outrun short ones — that *is* a Kelvin wake):
  `h' = (h(2 − αdt) − h_prev − (g/dx)·dt²·s·(G ⊗ h)) / (1 + αdt)`,
  `G(r) = Σ q² e^(−σq²) J0(qr)` normalised to `G(0) = 1`.
- **Calibrate `s` on the discrete taps**, so the response to `cos(kx)` equals `k` at k = 0.25 rad/texel.
- Check the response curve: it must stay positive at every k or that mode grows. The truncated
  kernel dips slightly negative near Nyquist: **lift the centre tap by 0.15** and add viscous damping
  on the velocity `0.03·∇²(h − h_prev)` to kill grid-scale noise.
- σ = 0.6 with radius 7 (225 taps, as a `uniform vec3[]`) tracks dispersion to about k ≈ 0.5 and is isotropic.
- Damping α = 0.18, plus a slow global relax `exp(−0.04·dt)`.

See `references/iwave-kernel.js` (Bessel J0, taps, calibration) and `references/wake-sim.glsl.js`.

### 3. Forcing (the big pitfall)
- Hull footprint `F(pose)` ∈ 0..1: pointed bow, full body, slightly narrowed transom, deepest amidships.
- In a leapfrog scheme, adding δ only to the new height is a **velocity kick that keeps re-adding
  itself for hundreds of steps** — with low damping it reached ±1 m. Add
  `force·(F(pose_now) − F(pose_prev))` to **both** the new height and the stored previous height.
- **Don't damp heights under the hull:** removing 12% of the bow's bump each step left a net trench
  behind every pass.
- Bobbing: `− bob·heaveVelocity·dt·F`. Force scales with speed `(0.7 + 0.6·min(v, 2))`.
- Skip forcing on teleports (loop restarts): if the pose jumped > 1.5 m, use the new pose for both.

### 4. Foam
- From steepness `max(0, slope − 16 cm/m)·0.003`, lingering (`× exp(−dt/2.2)`), spreading 12% to neighbours.
- **Hull foam only in the footprint's thin rim band**:
  `smoothstep(0, .12, F)·(1 − smoothstep(.12, .3, F))`, weighted to bow and transom. Using `|ΔF|` over
  the whole footprint whitens the entire track.
- Render foam streaky and translucent (≤ 0.5), from high-frequency noise
  (`smoothstep(.3, .9, foam·(.35 + 1.1·n))`). A soft threshold on low-frequency noise gives cotton-wool blobs.

### 5. Rendering on clear, shallow water
- Vertex: `y += h·0.01` (cm → m) inside the window, faded at its edge.
- Fragment slope by central differences on the texture; add `× 3.5` to the ripple normal.
  **Normal gain ×8 smears the reflection** (picks up the hull and bank); ~×3.5 is the limit.
- Slope-only normals mostly bend the refraction, which barely shows on clear water. Add **relief shading**:
  `col *= 1 + clamp(dot(slope, normalize(sunDir.xz))·6.5, −.28, .36)` — readable from above.
- Troughs sink slightly: `col *= 1 − clamp(−h·7, 0, .14)`. Keep the crest highlight tiny
  (it multiplies by sun brightness).

### 6. Near-field bow wave (hull-attached, analytic)
In the boat frame (a = ahead, c = across, stem at +1.5 m): water heaped at the stem
`exp(−sa²/.022 − c²/.035)`, two shoulder crests peeling aft and outward (~35–40° from the centreline,
narrowing with speed), a trough along the sides amidships, a white lip at the bow only. Slope by three
taps (e = 2 cm). The simulation carries everything beyond ~1 m.

### 7. Analytic Kelvin wake (first version, and why it was replaced)
A steady height field `wakeH(p)` in the boat frame (s = metres behind the bow, x = |c|/s/0.354):
V wedge of half-angle 19.47° (tan = 0.354) from just ahead of the bow; transverse waves
(wavelength 2πU²/g **floored at 0.62 m**) curving forward toward the edges; divergent feathers crossing
the wedge edge; a bright cusp line; bow pile-up; stern wash. Slope by finite differences (3 calls,
e = 2.5 cm), added after the ripple normal's distance fade at full strength; crest lines
`pow(max(sin(phase), 0), 6)` as a light term; textured foam by value noise + smoothstep.
**It looks wrong** because a pattern fixed in the boat's frame swings rigidly when the boat turns and
vanishes the moment it stops. A real wake is left in the water.

## Pitfalls
- A normal-only wake is nearly invisible on clear, shallow water — it needs shading (troughs,
  relief, crests, foam).
- Without a wavelength/amplitude floor, a boat drifting at 0.24 m/s makes a 4 cm pattern nobody sees.
- **Honest scale:** a drifting boat at 0.24 m/s makes almost no Kelvin wake (4 cm wavelength, below the
  grid). It shows when rowing — also true to life.
- A milky, uniform fan means the foam threshold is too soft.
- `readPixels` of the sim needs a `Uint16Array` + half-float decode for debugging.

## Verify
- **Scale check:** at 1.5 m/s the transverse wavelength ≈ 1.2 m (2πv²/g ≈ 1.4 m). Height ≈ ±0.7 cm
  drifting, ±3 cm rowing, ±5 cm in hard turns — right for a 3 m rowing boat.
- Draw the height field onto a debug canvas via `readRenderTargetPixels` to see the V first.
- Check top-down and from a low chase angle; turn hard and stop — the wake must stay and settle.
- Cost: 256² × 225 taps per step showed no measurable fps difference on/off. Expose on/off and the
  forces in the Tune panel.

## Related skills
`threejs-webgl-realistic-water` · `threejs-boat-buoyancy-steering` · `threejs-webgl-rain-effect`
· `threejs-webgl-performance-profiling` · `threejs-headless-visual-verification`
