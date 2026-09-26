// Drift lane, helm (auto → manual → return → auto) and four-probe buoyancy for a boat whose bow is local +X.
// Adapt: `riverCenter(z)`, `bankDist(x, z)` (signed distance to the water's edge, < 0 in water),
// `waveHeight(x, z, t)` (gerstner-waves.js), `obstacles` [{x, z, r}], `zStart/zEnd`, `speedAt(x, z)`.
import * as THREE from 'three'

export const BOAT = {
  lane: 1.15, clear: 1.1,                     // metres right of the centreline; clearance round a submerged rock (+ its radius)
  probe: [1.3, .45], spring: [16, 4.5], trim: .02,   // buoyancy probes fore/aft, port/stbd; stiffness, damping (~0.6 Hz); bow lift
  row: [1.1, .35, .22, .9],                   // thrust (m/s²), linear + quadratic drag, turn rate (rad/s at speed)
  bank: 1.0, idleReturn: 3,                   // metres kept from the bank; seconds hands-off before the autopilot takes over
}

export function buildLane({ riverCenter, obstacles, zStart, zEnd }) {
  const pts = []
  for (let z = zStart; z <= zEnd; z += .5) {
    let x = riverCenter(z) + BOAT.lane
    for (const o of obstacles) {
      const dz = Math.abs(o.z - z), need = o.r + BOAT.clear
      if (dz < need * 1.8 && Math.abs(x - o.x) < need) x += (x >= o.x ? 1 : -1) * (need - Math.abs(x - o.x)) * (1 - dz / (need * 1.8))
    }
    pts.push(new THREE.Vector3(x, 0, z))
  }
  for (let pass = 0; pass < 8; pass++) for (let i = 1; i < pts.length - 1; i++) {        // [1 2 1]/4 smoothing
    pts[i].x = (pts[i - 1].x + 2 * pts[i].x + pts[i + 1].x) / 4; pts[i].z = (pts[i - 1].z + 2 * pts[i].z + pts[i + 1].z) / 4
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength()
  const samples = curve.getSpacedPoints(Math.round(len / .5))
  return { curve, len, samples, step: len / (samples.length - 1) }
}

const _p = new THREE.Vector3(), _t = new THREE.Vector3()
const nearest = b => { let bi = 0, bd = 1e9; b.samples.forEach((q, i) => { const d = (q.x - b.pos.x) ** 2 + (q.z - b.pos.y) ** 2; if (d < bd) { bd = d; bi = i } }); return bi }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))

// b = { obj, ...buildLane(), s:0, mode:'auto', pos:Vector2, v:0, yaw:null, lastInput:-99 }; keys = { w, a, s, d }
export function stepBoat(b, keys, dt, t, { bankDist, waveHeight, obstacles, speedAt }) {
  const input = keys.w || keys.s || keys.a || keys.d
  if (input) { b.mode = 'manual'; b.lastInput = t }
  if (b.mode === 'manual' && t - b.lastInput > BOAT.idleReturn) b.mode = 'return'
  let speed
  if (b.mode === 'auto') {
    b.curve.getPointAt(b.s / b.len, _p)
    speed = speedAt(_p.x, _p.z)
    b.s += speed * dt; if (b.s >= b.len) { b.s = 0; b.yaw = null; b.spring = null }     // loop: restart deep in the haze
    const u = b.s / b.len; b.curve.getPointAt(u, _p); b.curve.getTangentAt(u, _t)
    const want = Math.atan2(-_t.z, _t.x) + .07 * Math.sin(t * .13) + .04 * Math.sin(t * .31 + 1.7)   // eased late + current wander
    b.yaw = b.yaw == null ? want : b.yaw + wrap(want - b.yaw) * Math.min(1, dt * .8)
    b.v = speed; b.pos.set(_p.x, _p.z)
  } else {
    let thrust, turn
    if (b.mode === 'manual') { thrust = (keys.w ? 1 : 0) - (keys.s ? .6 : 0); turn = (keys.a ? 1 : 0) - (keys.d ? 1 : 0) }
    else {                                                        // pure pursuit of a point ~4 m down the lane
      const i = nearest(b), tp = b.samples[Math.min(b.samples.length - 1, i + 8)]
      const err = wrap(Math.atan2(-(tp.z - b.pos.y), tp.x - b.pos.x) - b.yaw)
      turn = THREE.MathUtils.clamp(err * 1.6, -1, 1); thrust = THREE.MathUtils.clamp((.3 - b.v) * 2, -.5, .6)
      const off = Math.hypot(b.samples[i].x - b.pos.x, b.samples[i].z - b.pos.y)
      if (off < .3 && Math.abs(err) < .12) { b.mode = 'auto'; b.s = i * b.step }        // back on the lane
    }
    const [T, k1, k2, R] = BOAT.row
    b.v += (thrust * T - b.v * k1 - b.v * Math.abs(b.v) * k2) * dt
    b.yawRate = THREE.MathUtils.lerp(b.yawRate || 0, turn * R * (.35 + Math.min(Math.abs(b.v), 1.2)), Math.min(1, dt * 3))
    b.yaw += b.yawRate * dt * (b.v < 0 ? -1 : 1)
    b.pos.x += Math.cos(b.yaw) * b.v * dt; b.pos.y += -Math.sin(b.yaw) * b.v * dt
    const bd = bankDist(b.pos.x, b.pos.y)
    if (bd > -BOAT.bank) {                                        // pushed back down the distance field's slope, speed soaked up
      const e = .25, gx = bankDist(b.pos.x + e, b.pos.y) - bankDist(b.pos.x - e, b.pos.y), gz = bankDist(b.pos.x, b.pos.y + e) - bankDist(b.pos.x, b.pos.y - e), gl = Math.hypot(gx, gz) || 1
      const k = (bd + BOAT.bank) * Math.min(1, dt * 6); b.pos.x -= gx / gl * k; b.pos.y -= gz / gl * k; b.v *= 1 - Math.min(1, dt * 2)
    }
    for (const r of obstacles) { const dx = b.pos.x - r.x, dz = b.pos.y - r.z, d = Math.hypot(dx, dz), need = r.r + .7
      if (d < need) { b.pos.x += dx / d * (need - d); b.pos.y += dz / d * (need - d); b.v *= .96 } }
    speed = Math.abs(b.v); _p.set(b.pos.x, 0, b.pos.y)
  }
  const o = b.obj; o.rotation.y = b.yaw
  // buoyancy: bow, stern, port, starboard on the same surface the shader draws; each DOF through a damped spring
  const cy = Math.cos(b.yaw), sy = -Math.sin(b.yaw), [F, S] = BOAT.probe
  const hB = waveHeight(_p.x + cy * F, _p.z + sy * F, t), hS = waveHeight(_p.x - cy * F, _p.z - sy * F, t)
  const hP = waveHeight(_p.x - sy * S, _p.z + cy * S, t), hR = waveHeight(_p.x + sy * S, _p.z - cy * S, t)
  const want = [(hB + hS + hP + hR) / 4, Math.atan2(hB - hS, 2 * F) + BOAT.trim, Math.atan2(hP - hR, 2 * S)]
  b.spring ||= { x: [...want], v: [0, 0, 0] }
  for (let i = 0; i < 3; i++) { const a = BOAT.spring[0] * (want[i] - b.spring.x[i]) - BOAT.spring[1] * b.spring.v[i]; b.spring.v[i] += a * dt; b.spring.x[i] += b.spring.v[i] * dt }
  const [heave, pitch, roll] = b.spring.x
  o.position.set(_p.x, heave, _p.z)
  o.rotation.order = 'YXZ'; o.rotation.z = pitch; o.rotation.x = roll + .006 * Math.sin(t * .7)   // local X is bow→stern
  return { x: _p.x, z: _p.z, speed, dirX: cy, dirZ: sy }          // feed the water (wake/foam) and the fish (avoid radius ~1.9 m)
}

// Keys: only after the boat was clicked (pointer moved < 6 px between down and up, raycast hit on the canvas rect).
export function bindHelmKeys(keys, isSteering) {
  const map = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd' }
  const key = (e, on) => { if (e.metaKey || e.ctrlKey || /input|textarea/i.test(e.target.tagName)) return
    const k = map[e.key.toLowerCase()] || e.key.toLowerCase(); if (!(k in keys)) return
    if (on && !isSteering()) return
    keys[k] = on; if (on) e.preventDefault() }
  addEventListener('keydown', e => key(e, true)); addEventListener('keyup', e => key(e, false))
  addEventListener('blur', () => { for (const k in keys) keys[k] = false })
}
