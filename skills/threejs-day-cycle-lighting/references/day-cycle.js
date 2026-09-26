// Day cycle with ONE writer: applySun(az, el) = the day state for this sun position, then the
// night blend on top, then weather on top. Every caller (day cycle, GUI sliders, night toggle,
// tour) goes through it, so shaders reading the sun uniforms never disagree.
//
// ADAPT: `sun` (DirectionalLight with target), `U` shared uniforms (uSunDir, uSunColor, uSunLum),
// `skyU` / `cloudU` stops, the god-ray meshes (`rays`), fog, and `SUN_FOCUS` (the shadow frustum
// centre). Direction convention: az 0 = −Z, az 90 = +X.
import * as THREE from 'three'

export const sunDir = new THREE.Vector3()
export function updateSunDir(azDeg, elDeg) {
  const a = THREE.MathUtils.degToRad(azDeg), e = THREE.MathUtils.degToRad(elDeg)
  sunDir.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize()
}
export function placeSun(sun, focus) {                  // light sits 30 m up the sun direction from the shadow focus
  sun.position.copy(focus).addScaledVector(sunDir, 30); sun.target.position.copy(focus)
}
export const sunLum = sun => (sun.color.r * .2126 + sun.color.g * .7152 + sun.color.b * .0722) * sun.intensity

const sunWarm = new THREE.Color(0xff8a4a)
export function applyDay(S, az, el) {
  updateSunDir(az, el); placeSun(S.sun, S.focus)
  const h = THREE.MathUtils.smoothstep(el, 4, 40)        // 0 at the horizon, 1 by mid-morning
  S.sun.color.copy(sunWarm).lerp(S.sunNoon, h)             // warm orange → noon gold
  S.sun.intensity = S.SUN_INTENSITY * (.25 + .75 * THREE.MathUtils.smoothstep(el, 0, 25))
  S.U.uSunDir.value.copy(sunDir)
  S.U.uSunLum.value = sunLum(S.sun); S.U.uSunColor.value.copy(S.sun.color)   // → sky halo, clouds, toon ramp, caustics, water
  S.skyU.top.value.copy(S.PAL.zenith).lerp(S.DUSK.zenith, 1 - h)             // the dome warms at low sun
  S.skyU.mid.value.copy(S.PAL.mid).lerp(S.DUSK.mid, 1 - h)
  S.skyU.horizon.value.copy(S.PAL.horizon).lerp(S.DUSK.horizon, 1 - h)
  S.cloudU.uMidC.value.copy(S.PAL.cloudMid).lerp(S.DUSK.cloudMid, 1 - h)
  S.fogColor.set(S.FOG_COLOR).lerp(new THREE.Color(0xf0c49a), (1 - h) * .7)   // fog tints warm
  S.rays?.forEach(m => m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir))   // shafts re-aim
  // shadows follow for free: the shadow map updates every frame
}

// the per-frame cycle: azimuth sweeps ~230°, elevation = 3° + 70°·sin(π·phase)
export const day = { on: true, phase: .35, seconds: 150 }
export function stepDay(dt, applySun, blocked = false) {
  if (!day.on || blocked) return                          // e.g. a tour owns the time of day
  day.phase = (day.phase + dt / day.seconds) % 1
  applySun(-75 + day.phase * 230, 3 + 70 * Math.sin(Math.PI * day.phase))
}

// ── the sun follows the lens (tour / cinematic daytime beats) ──
// Keeps the sun ~42° to the side of the camera's heading and ~30° up (tilting the camera lifts it by
// half the pitch), eased with 1 − exp(−dt/lag) on the wrapped angle, the side sticky.
const wrapDeg = a => ((a + 540) % 360) - 180
const lerpAngle = (a, b, k) => a + wrapDeg(b - a) * k
export const follow = { az: 0, el: 30, side: 1 }
export function followSun(dt, camPos, target, { offset = 42, el = 30, lag = 2.4 } = {}) {
  const fx = target.x - camPos.x, fy = target.y - camPos.y, fz = target.z - camPos.z, fl = Math.hypot(fx, fz) || 1
  const camAz = THREE.MathUtils.radToDeg(Math.atan2(fx, -fz))          // same convention as updateSunDir
  const pitch = THREE.MathUtils.radToDeg(Math.atan2(fy, fl))
  const rel = wrapDeg(follow.az - camAz)
  if (Math.abs(rel) > 8) follow.side = Math.sign(rel)                  // change side only when > 8° from dead ahead
  const k = 1 - Math.exp(-dt / lag)
  follow.az = wrapDeg(lerpAngle(follow.az, camAz + follow.side * offset, k))
  follow.el = THREE.MathUtils.lerp(follow.el, THREE.MathUtils.clamp(el + pitch * .5, 18, 60), k)
}
// blend follow → the normal sweep with a weight w (1 while following, 0 after the handover):
//   az = lerpAngle(sweepAz, follow.az, w); el = lerp(sweepEl, follow.el, w); applySun(az, el)
// and boost god rays with ABSOLUTE values:  rays.uStrength = baseRays * (1 + 2.2*w)   (never *=)
export { lerpAngle, wrapDeg }
