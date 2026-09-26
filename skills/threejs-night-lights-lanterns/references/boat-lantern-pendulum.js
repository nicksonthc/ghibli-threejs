// A paper lantern hung from a bent bamboo pole at the bow of a moving boat. It hangs plumb in
// the world whatever the hull's pitch/roll, and swings as a damped pendulum from the boat's
// acceleration plus a slow sine for wind. One shared, pre-created point light rides just UNDER
// the paper (inside it, the bamboo a hand's width away blows out white-gold).
//
// ADAPT: `boat` = { obj: Object3D (hull, +X = bow), v: speed m/s, yaw: rad }, `light` a PointLight
// created at intensity 0, `k` the night blend. Tip = pole tip position in the hull frame.
import * as THREE from 'three'

export function makeLanternPaperTexture() {
  // washi gradient, darker rib lines, vermilion end bands — used as BOTH map and emissiveMap,
  // so the ribs stay dark when the paper glows
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const g = cv.getContext('2d')
  const grd = g.createLinearGradient(0, 0, 0, 256)
  grd.addColorStop(0, '#f3d9a8'); grd.addColorStop(.5, '#fff3d6'); grd.addColorStop(1, '#f3d9a8')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 256)
  g.fillStyle = 'rgba(120,80,40,.35)'; for (let y = 14; y < 244; y += 11) g.fillRect(0, y, 64, 2)
  g.fillStyle = '#b8321f'; g.fillRect(0, 0, 64, 16); g.fillRect(0, 240, 64, 16)
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function buildBoatLantern(hull, { tip = [1.62, 1.5], cord = .18, height = .3, radius = .105, color = 0xffa850 } = {}) {
  const tex = makeLanternPaperTexture()
  const paper = new THREE.MeshStandardMaterial({ map: tex, emissive: color, emissiveMap: tex, emissiveIntensity: 0, roughness: .85 })
  const prof = []
  for (let i = 0; i <= 12; i++) { const v = i / 12; prof.push(new THREE.Vector2(radius * (.55 + .45 * Math.sin(Math.PI * v)), -cord - .02 - height * v)) }
  const pivot = new THREE.Group(); pivot.position.set(tip[0], tip[1], 0); hull.add(pivot)
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 24), paper); body.castShadow = true; pivot.add(body)
  return { pivot, paper, lightLocal: new THREE.Vector3(0, -cord - .02 - height - .07, 0),
           ang: new THREE.Vector2(), vel: new THREE.Vector2(), lastV: new THREE.Vector2() }
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler()
export function stepBoatLantern(L, boat, light, dt, t, k, { omega = 6.5, damp = 1.6, glow = 1.6, intensity = 2.6 } = {}) {
  // PITFALL: speed/heading are undefined until the boat's first step -> NaN, and NaN survives
  // every later frame and hides the mesh. Default to 0 and reset non-finite state.
  const v = boat.v || 0, yaw = boat.yaw || 0
  const vx = Math.cos(yaw) * v, vz = -Math.sin(yaw) * v
  if (dt > 0 && dt < .1) {
    const ax = (vx - L.lastV.x) / dt, az = (vz - L.lastV.y) / dt
    const fX = -az / 9.8 + .02 * Math.sin(t * 1.3), fZ = ax / 9.8 + .015 * Math.sin(t * .9 + 1)   // target = −a/g + wind
    L.vel.x += (omega * omega * (fX - L.ang.x) - damp * L.vel.x) * dt
    L.vel.y += (omega * omega * (fZ - L.ang.y) - damp * L.vel.y) * dt
    L.ang.x = THREE.MathUtils.clamp(L.ang.x + L.vel.x * dt, -.5, .5)
    L.ang.y = THREE.MathUtils.clamp(L.ang.y + L.vel.y * dt, -.5, .5)
    if (!Number.isFinite(L.ang.x + L.ang.y + L.vel.x + L.vel.y)) { L.ang.set(0, 0); L.vel.set(0, 0) }
  }
  L.lastV.set(vx, vz)
  // plumb: inverse(hull world quaternion) × swing
  boat.obj.updateMatrixWorld(); boat.obj.getWorldQuaternion(_q)
  L.pivot.quaternion.copy(_q.invert()).multiply(_q2.setFromEuler(_e.set(L.ang.x, 0, L.ang.y)))
  const flick = .93 + .05 * Math.sin(t * 7.3 + .8) + .02 * Math.sin(t * 19.1)
  L.paper.emissiveIntensity = glow * k * flick                 // by day: unlit paper
  if (k > .003) {
    L.pivot.updateMatrixWorld()
    light.position.copy(L.lightLocal).applyMatrix4(L.pivot.matrixWorld)
    light.intensity = intensity * k * flick
  } else light.intensity = 0
}
