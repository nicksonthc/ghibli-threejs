// One wave table → GLSL (vertex displacement + slope for the normal) and a CPU waveHeight() for buoyancy.
// Adapt: inject GLSL_WAVES into the water material's vertex header (and the fragment header for
// waveSlope), set `uniforms.uWaveAmp = WAVE_AMP_UNIFORM`, and pass your shared time uniform.
// Everything that floats (boat, lily pads, lanterns) and the camera's waterline guard calls waveHeight().

// dir: travel direction on the water plane (mostly downstream, +Z); len: wavelength (m); amp: height (m);
// speed: phase speed (m/s); q: Gerstner steepness. A river, not an ocean: 2–5 cm of swell.
export const WAVES = [
  { dir: [ .12, 1], len: 9.0, amp: .022, speed: .90, q: .55 },
  { dir: [-.35, 1], len: 5.3, amp: .014, speed: .70, q: .55 },
  { dir: [ .60, .8], len: 3.1, amp: .008, speed: .55, q: .45 },
  { dir: [-.80, .6], len: 1.9, amp: .005, speed: .45, q: .35 },
]
export const TIDE = { amp: .018, period: 26 }       // the whole surface breathes this much (m), this slowly (s)
export const WAVE = { amp: 1 }                      // live scale (Tune panel); CPU and GPU both read it
export const WAVE_AMP_UNIFORM = { value: WAVE.amp } // keep in sync: onChange(v => { WAVE.amp = v; WAVE_AMP_UNIFORM.value = v })

WAVES.forEach(w => { const l = Math.hypot(...w.dir); w.dir = [w.dir[0] / l, w.dir[1] / l]; w.k = 2 * Math.PI / w.len })
const f = x => x.toFixed(5)                         // print constants into GLSL so both sides use identical numbers

export const GLSL_WAVES = /* glsl */`
  uniform float uWaveAmp;
  // Gerstner: points slide toward each crest (xz) as they rise (y), so crests sharpen and troughs flatten
  vec3 waveDisp(vec2 p, float t){
    vec3 d = vec3(0., ${f(TIDE.amp)}*sin(t*${f(2 * Math.PI / TIDE.period)}), 0.);
    ${WAVES.map(w => `{ float th = ${f(w.k)}*(dot(vec2(${f(w.dir[0])}, ${f(w.dir[1])}), p) - ${f(w.speed)}*t);
      d.y += ${f(w.amp)}*sin(th); d.xz += ${f(w.q * w.amp)}*vec2(${f(w.dir[0])}, ${f(w.dir[1])})*cos(th); }`).join('\n    ')}
    return d*uWaveAmp;
  }
  // slope (dh/dx, dh/dz): add ×1.3 to the ripple normal so the light follows the swell
  vec2 waveSlope(vec2 p, float t){
    vec2 g = vec2(0.);
    ${WAVES.map(w => `{ float th = ${f(w.k)}*(dot(vec2(${f(w.dir[0])}, ${f(w.dir[1])}), p) - ${f(w.speed)}*t); g += ${f(w.amp * w.k)}*vec2(${f(w.dir[0])}, ${f(w.dir[1])})*cos(th); }`).join('\n    ')}
    return g*uWaveAmp;
  }`

// Same surface on the CPU (height at the undisplaced point: the Gerstner slide is ≤ ~1.2 cm, well inside a hull's width).
export function waveHeight(x, z, t) {
  let h = TIDE.amp * Math.sin(t * 2 * Math.PI / TIDE.period)
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dir[0] * x + w.dir[1] * z - w.speed * t))
  return h * WAVE.amp
}

// Vertex injection for the water material (the mesh is only translated, so world and local offsets agree):
//   .replace('#include <begin_vertex>', `#include <begin_vertex>
//      transformed += waveDisp((modelMatrix*vec4(transformed, 1.)).xz, uTime);`)
// Fragment: include GLSL_WAVES minus waveDisp (regex it out) and do `sl += waveSlope(vWPos.xz, uTime) * 1.3;`
// Water mesh: PlaneGeometry(190, 190, 330, 330).rotateX(-PI/2) following the camera, snapped to its cell:
//   const s = 190/330; water.position.set(Math.round(cam.x/s)*s, 0, Math.round(cam.z/s)*s)
