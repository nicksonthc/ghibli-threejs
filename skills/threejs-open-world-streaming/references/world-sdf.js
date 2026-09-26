// World definition: deterministic noise, a water signed-distance function and a composed height function.
// ADAPT: WORLD/SOURCE/LAKE/ISLAND numbers, riverCenter/riverHalf formulas, the hill/cliff/terrace terms.
// Everything that stands on land asks terrainHeight(); everything that asks "is this water?" asks bankDist().

// ── deterministic noise (JS side, shared by terrain + scatter) ──
export function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function hash2(ix, iy){ let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 }
function vnoise(x, y){ const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx*fx*(3 - 2*fx), uy = fy*fy*(3 - 2*fy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1); return a + (b - a)*ux + (c - a)*uy + (a - b - c + d)*ux*uy }
export function fbm(x, y, o = 4){ let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++){ s += a*vnoise(x*f + i*17.3, y*f - i*9.1); f *= 2.03; a *= .5 } return s/(1 - Math.pow(.5, o)) }
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t) }   // works with reversed edges
export const smin = (a, b, k) => { const h = Math.min(1, Math.max(0, .5 + .5*(b - a)/k)); return b + (a - b)*h - k*h*(1 - h) }

// ── the river: home reach unchanged, meanders added only beyond it ──
export const WORLD  = { zMin:-372, zMax:258, half:62 }        // terrain strip z range and metres either side of the centreline
export const SOURCE = { z:-345, r:9 }                         // spring pool at the head
export const LAKE   = { z:200, r:30 }                         // the lake the river ends in
export const ISLAND = { dx:3, dz:6, r:7.5 }                   // offset from the lake centre
const HOME = { z0:-127, z1:43 }
const riverCenterHome = z => 4.1 + 1.0*Math.sin(z*0.11 + 0.9)
export const riverCenter = z => riverCenterHome(z)
  + (z < HOME.z0 ? 7*smooth(HOME.z0, HOME.z0 - 43, z)*Math.sin((z - HOME.z0)*.035) : 0)
  + (z > HOME.z1 ? 6*smooth(HOME.z1, HOME.z1 + 32, z)*Math.sin((z - HOME.z1)*.028) : 0)
export const riverHalf = z => (5.25 + 0.7*Math.sin(z*0.07 + 2.0)) * (1 - .35*smooth(-300, -340, z))
SOURCE.x = riverCenter(SOURCE.z); LAKE.x = riverCenter(LAKE.z); ISLAND.x = LAKE.x + ISLAND.dx; ISLAND.z = LAKE.z + ISLAND.dz

// the same centreline for shaders (the camera-following water discards outside the land strip).
// Own smoothstep: GLSL smoothstep is undefined when edge0 > edge1.
export const GLSL_RIVER = /* glsl */`
  float rsm(float a, float b, float x){ float t = clamp((x - a)/(b - a), 0., 1.); return t*t*(3. - 2.*t); }
  float riverCenterG(float z){
    float c = 4.1 + sin(z*.11 + .9);
    if (z < ${HOME.z0.toFixed(1)}) c += 7.*rsm(${HOME.z0.toFixed(1)}, ${(HOME.z0 - 43).toFixed(1)}, z)*sin((z - ${HOME.z0.toFixed(1)})*.035);
    if (z > ${HOME.z1.toFixed(1)}) c += 6.*rsm(${HOME.z1.toFixed(1)}, ${(HOME.z1 + 32).toFixed(1)}, z)*sin((z - ${HOME.z1.toFixed(1)})*.028);
    return c; }
  bool outsideWorld(vec2 p){ return p.y < ${WORLD.zMin.toFixed(1)} || p.y > ${WORLD.zMax.toFixed(1)} || abs(p.x - riverCenterG(p.y)) > ${(WORLD.half - .5).toFixed(1)}; }`

// ── signed distance to the water's edge (m): < 0 in the water ──
export function bankDist(x, z){
  let d = Math.abs(x - riverCenter(z)) - riverHalf(z)
  d = Math.max(d, z - LAKE.z, SOURCE.z - z)                                   // river runs from the pool to the lake
  const lx = x - LAKE.x, lz = z - LAKE.z
  if (lz > -60 && lz < 60){ const a = Math.atan2(lz, lx); d = smin(d, Math.hypot(lx, lz) - (LAKE.r + 3.5*Math.sin(3*a + .5) + 2*Math.sin(5*a + 1.7)), 6) }
  const px = x - SOURCE.x, pz = z - SOURCE.z
  if (pz > -30 && pz < 30){ const a = Math.atan2(pz, px); d = smin(d, Math.hypot(px, pz) - (SOURCE.r + 1.2*Math.sin(4*a)), 3) }
  const ix = x - ISLAND.x, iz = z - ISLAND.z
  if (iz > -20 && iz < 20){ const a = Math.atan2(iz, ix); d = Math.max(d, -(Math.hypot(ix, iz) - (ISLAND.r + 1.1*Math.sin(4*a + .3)))) }   // island = land
  return d
}
// gradient of the SDF: use it instead of "push toward the centreline"
export function bankGrad(x, z, e = .25){ return [(bankDist(x + e, z) - bankDist(x - e, z))/(2*e), (bankDist(x, z + e) - bankDist(x, z - e))/(2*e)] }

// ── terraces: quantised hillside, flooded paddies 6 cm under their water level, a bund at the outer edge ──
const TERRACE = { z0:-290, z1:-200, step:.55, start:5 }
export function terraceAt(x, z, d){
  if (z < TERRACE.z0 - 8 || z > TERRACE.z1 + 8 || x < riverCenter(z)) return null
  const m = smooth(TERRACE.z0 - 8, TERRACE.z0 + 6, z) * smooth(TERRACE.z1 + 8, TERRACE.z1 - 6, z) * smooth(TERRACE.start - 1.5, TERRACE.start + 1, d)
  if (m <= 0) return null
  const hb = Math.max(0, d - TERRACE.start)*.15 + .35*(fbm(x*.05 + 2, z*.05) - .5)
  const k = Math.floor(hb/TERRACE.step), f = hb/TERRACE.step - k
  const level = k*TERRACE.step + .32, flooded = f > .05 && f < .8
  let h = level + TERRACE.step*smooth(.86, 1, f)                       // flat paddy, then the riser
  h -= .06*smooth(.02, .14, f)*(1 - smooth(.7, .8, f))                 // floor eased down under a few cm of water
  h += .1*smooth(.76, .82, f)*(1 - smooth(.86, .92, f))                // earth bund along the outer edge
  return { m, h, level, flooded, k }
}

// ── landmark pads: filled BEFORE any terrain chunk is built (they are part of the ground) ──
export const PADS = []   // { x, z, r, h }
export function addPad(x, z, r){ PADS.push({ x, z, r, h:terrainHeight(x, z) }) }   // mill-type sites: pass an inland x

export function terrainHeight(x, z){
  const d = bankDist(x, z) + (fbm(x*.35, z*.35) - .5)*0.9
  const bed = -0.78 + 0.28*fbm(x*.25 + 3, z*.25) + 0.12*smooth(-6, -1.5, d)
  const bank = 0.30 + 0.10*fbm(x*.5, z*.5)
  let h = bed + (bank - bed)*smooth(-2.0, 0.5, d)
  h += Math.max(0, d - 0.5)*0.035                                          // banks rise gently
  h += smooth(7, 26, d) * 3.2 * fbm(x*.06 + 11, z*.06 - 4)                 // rolling hills
  h += smooth(10, 34, d) * smooth(-30, -110, z) * 9 * fbm(x*.04 - 3, z*.04 + 8)   // valley walls rise upstream
  if (Math.abs(z - ISLAND.z) < 14){ const di = ISLAND.r - Math.hypot(x - ISLAND.x, z - ISLAND.z); if (di > 0) h += smooth(0, 6, di)*1.1 }
  const T = terraceAt(x, z, d); if (T) h += (T.h - h)*T.m
  for (const P of PADS){ const q = Math.hypot(x - P.x, z - P.z); if (q < P.r + 4) h += (P.h - h)*smooth(P.r + 4, P.r, q) }
  return h
}
