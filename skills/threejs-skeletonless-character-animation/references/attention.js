// The character's "mind": animal blinks, looking around, and a long glance at a point of interest.
// Everything is a critically damped spring toward a target, so nothing snaps: the eyes lead,
// the head follows (ω ≈ 5.5), the body last (ω ≈ 3.2), pupils fastest (ω ≈ 16).
//
// ADAPT: `M.char` = the character Group (its rotation.y is the BODY turn; +π/2 if its front is +X
// on the vehicle), `vehicle` = the Object3D it rides (or the scene), `pickLook()` sources, and
// POSE_U from pose-shader.js. Front of the character is +X in the vehicle frame.
import * as THREE from 'three'
import { POSE_U } from './pose-shader.js'

export const CFG = { blink: [2, 7], doubleBlink: .17, look: [3, 7], headLimit: .87, idleHeadLimit: .61, bodyLimit: .7,
  glanceDist: 7, glanceCooldown: 30, headSpring: 5.5, bodySpring: 3.2 }

const spring = (x, v, target, w, dt) => { const a = w * w * (target - x) - 2 * w * v; v += a * dt; return [x + v * dt, v] }
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))

export function makeMind(char, vehicle) {
  return { char, vehicle, blinks: [], nextBlink: null, head: { x: [0, 0, 0], v: [0, 0, 0] }, body: { x: 0, v: 0 },
    pupil: { x: [0, 0], v: [0, 0] }, look: null, nextLook: null, mode: 'idle', glance: null, lastGlance: -99, want: [0, 0, 0],
    ear: { t0: -9, side: 0, next: null } }
}

// blink shape: fast close (.07 s), brief hold (.04 s), slower open (.12 s); a sleepy blink = same curve × s
export function blinkAt(age, s) {
  const c = .07 * s, h = .04 * s, o = .12 * s
  if (age < 0 || age > c + h + o) return 0
  if (age < c) return THREE.MathUtils.smoothstep(age, 0, c)
  if (age < c + h) return 1
  return 1 - THREE.MathUtils.smoothstep(age, c + h, c + h + o)
}
export function queueBlink(M, t, slow = 1) {
  M.blinks.push([t, slow])
  if (Math.random() < CFG.doubleBlink && slow === 1) M.blinks.push([t + .28, 1])      // sometimes a double blink
}

// world point → yaw/pitch in the vehicle frame from the head (front = +X ⇒ yaw = atan2(−dz, dx))
const _v = new THREE.Vector3()
export function aimAt(M, p, headHeight = .72) {
  M.vehicle.worldToLocal(_v.copy(p))
  _v.x -= M.char.position.x; _v.y -= M.char.position.y + headHeight; _v.z -= M.char.position.z
  return [Math.atan2(-_v.z, _v.x), Math.atan2(_v.y, Math.hypot(_v.x, _v.z))]
}

export function startGlance(M, t, at) { M.mode = 'glance'; M.glance = { t0: t, at }; M.lastGlance = t; queueBlink(M, t) }

// pickLook(t) → { at: Vector3 } or { get: () => Vector3 } (live targets: a fish, the camera) + hold seconds
export function stepMind(M, dt, t, pickLook) {
  M.nextBlink ??= t + 2; M.nextLook ??= t + 1.5; M.ear.next ??= t + 6     // seed from the live clock
  let headT = [0, 0, 0], bodyT = 0
  if (M.mode === 'glance') {
    // eyes, then head, then body turn to it; slow blink + curious tilt; ~3 s hold; back
    const g = M.glance, age = t - g.t0, [yaw, pitch] = aimAt(M, g.at)
    bodyT = age > .4 && age < 4.9 ? THREE.MathUtils.clamp(yaw * .55, -CFG.bodyLimit, CFG.bodyLimit) : 0   // ~55 % body / 45 % head
    headT = age > 4.5 ? [0, 0, 0] : [THREE.MathUtils.clamp(wrap(yaw - M.body.x), -CFG.headLimit, CFG.headLimit),
      THREE.MathUtils.clamp(pitch, -.35, .45), age > 1.5 ? .13 : 0]
    if (!g.slowBlink && age > 1.9) { g.slowBlink = true; queueBlink(M, t, 2.6) }
    if (!g.backBlink && age > 4.45) { g.backBlink = true; queueBlink(M, t) }
    M.slowVehicle = age < 5 ? .65 : 1                                   // the boat slows while they look
    if (age > 6.2) { M.mode = 'idle'; M.nextLook = t + 2.5; M.look = null }
  } else {
    M.slowVehicle = 1
    if (t > M.nextLook) {
      const prev = M.want[0]; M.look = pickLook(t)
      M.nextLook = t + M.look.hold + CFG.look[0] + Math.random() * (CFG.look[1] - CFG.look[0]) * .5
      const [y] = aimAt(M, M.look.get ? M.look.get() : M.look.at)
      if (Math.abs(wrap(y - M.body.x) - prev) > .35) queueBlink(M, t)    // a blink at the start of any big head turn
    }
    if (M.look && t > M.nextLook - CFG.look[0] * .6) M.look = null      // settle back between looks
    if (M.look) { const [yaw, pitch] = aimAt(M, M.look.get ? M.look.get() : M.look.at)
      headT = [THREE.MathUtils.clamp(wrap(yaw - M.body.x), -CFG.idleHeadLimit, CFG.idleHeadLimit), THREE.MathUtils.clamp(pitch, -.3, .5), 0] }
  }
  M.want = headT
  for (let i = 0; i < 3; i++) [M.head.x[i], M.head.v[i]] = spring(M.head.x[i], M.head.v[i], headT[i], i === 2 ? 3 : CFG.headSpring, dt)
  ;[M.body.x, M.body.v] = spring(M.body.x, M.body.v, bodyT, CFG.bodySpring, dt)
  // eye lead: pupils driven by the head's REMAINING error, so they jump first and re-centre as the head arrives
  const lead = [THREE.MathUtils.clamp((headT[0] - M.head.x[0]) * .55, -.35, .35), THREE.MathUtils.clamp((headT[1] - M.head.x[1]) * .5, -.2, .2)]
  const micro = [.015 * Math.sin(t * 2.3) + .01 * Math.sin(t * 5.1), .01 * Math.sin(t * 1.7)]   // eyes never perfectly still
  for (let i = 0; i < 2; i++) [M.pupil.x[i], M.pupil.v[i]] = spring(M.pupil.x[i], M.pupil.v[i], lead[i] + micro[i], 16, dt)
  if (t > M.nextBlink) { queueBlink(M, t); M.nextBlink = t + CFG.blink[0] + Math.random() * (CFG.blink[1] - CFG.blink[0]) }
  let bk = 0; M.blinks = M.blinks.filter(([t0, s]) => { bk = Math.max(bk, blinkAt(t - t0, s)); return t - t0 < .3 * s + .05 })
  if (t > M.ear.next) M.ear = { t0: t, side: Math.random() < .5 ? 0 : (Math.random() < .5 ? 1 : 2), next: t + 6 + Math.random() * 9 }
  const ea = t - M.ear.t0 < .3 ? .35 * Math.sin(Math.PI * (t - M.ear.t0) / .3) : 0
  POSE_U.uTHead.value.set(M.head.x[0], M.head.x[1], M.head.x[2])
  POSE_U.uTPupil.value.set(M.pupil.x[0], M.pupil.x[1])
  POSE_U.uTBlink.value.set(bk, bk)
  POSE_U.uTEar.value.set(M.ear.side !== 1 ? ea : 0, M.ear.side !== 0 ? ea : 0)
  POSE_U.uTBreath.value = Math.sin(t * 1.25)
  M.char.rotation.y = Math.PI / 2 + M.body.x                            // body turn = the group's yaw
}
