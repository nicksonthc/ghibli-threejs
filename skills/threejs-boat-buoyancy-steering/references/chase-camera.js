// Chase camera that keeps OrbitControls: drag still orbits the boat, wheel still zooms.
// Adapt: `camera`, `controls` (OrbitControls), `rider` (Object3D to frame, e.g. the character on the boat),
// `boat` ({ yaw, v, boost? }), `terrainHeight`, `waveHeight`. Call start()/end(); step(dt, t) after controls.update().
import * as THREE from 'three'

export const CHASE = { dist: 6.2, elev: .36, elevMin: .03, elevMax: 1.2, look: 1.6, head: .95, follow: 4.5, relax: .55, hold: 4, regain: 3 }

export function makeChaseCam({ camera, controls, renderer }) {
  const S = { on: false, t: new THREE.Vector3(), drag: false, prefR: CHASE.dist, prefEl: CHASE.elev, zoomAt: -9, dragEnd: -99, orbit: false }
  const _w = new THREE.Vector3(), _o = new THREE.Vector3()
  controls.addEventListener('start', () => { S.drag = true })
  controls.addEventListener('end', () => {
    S.drag = false; if (!S.on) return
    const off = _o.subVectors(camera.position, controls.target), r = off.length()   // the visitor's tilt becomes the new framing
    S.prefEl = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(off.y / r, -1, 1)), CHASE.elevMin, CHASE.elevMax)
    S.dragEnd = performance.now()
  })
  renderer.domElement.addEventListener('wheel', () => { S.zoomAt = performance.now() }, { passive: true })

  S.start = () => { if (S.on) return; S.on = true; S.orbit = controls.autoRotate; controls.autoRotate = false
    S.t.copy(controls.target); S.prefR = CHASE.dist; S.prefEl = CHASE.elev; S.dragEnd = -99 }
  S.end = () => { if (!S.on) return; S.on = false; controls.autoRotate = S.orbit }

  S.step = (dt, t, { rider, boat, terrainHeight, waveHeight }) => {
    if (!S.on) return
    const hx = Math.cos(boat.yaw), hz = -Math.sin(boat.yaw)
    // target: just ahead of the rider's head, smoothed; carry the camera by the same move so the orbit offset survives
    rider.getWorldPosition(_w); _w.y += CHASE.head; _w.x += hx * CHASE.look; _w.z += hz * CHASE.look
    const prev = _o.copy(S.t); S.t.lerp(_w, 1 - Math.exp(-dt * CHASE.follow))
    camera.position.add(prev.sub(S.t).negate()); controls.target.copy(S.t)
    if (!S.drag) {
      const off = _o.subVectors(camera.position, S.t), r = off.length()
      if (performance.now() - S.zoomAt < 400) S.prefR = r                                 // the visitor zoomed: keep it
      const behind = Math.atan2(-hx, -hz), az = Math.atan2(off.x, off.z), el = Math.asin(THREE.MathUtils.clamp(off.y / r, -1, 1))
      let rel = Math.atan2(Math.sin(az - behind), Math.cos(az - behind))
      const since = (performance.now() - S.dragEnd) / 1000 - CHASE.hold                  // hold after a drag, then regain gently
      if (Math.abs(boat.v) > .15) rel *= Math.exp(-CHASE.relax * THREE.MathUtils.smoothstep(since, 0, CHASE.regain) * dt)
      const k = 1 - Math.exp(-dt * .9), e2 = THREE.MathUtils.lerp(el, S.prefEl, k), r2 = THREE.MathUtils.lerp(r, S.prefR + 1.4 * (boat.boost || 0), k)
      const a2 = behind + rel
      camera.position.set(S.t.x + Math.sin(a2) * Math.cos(e2) * r2, S.t.y + Math.sin(e2) * r2, S.t.z + Math.cos(a2) * Math.cos(e2) * r2)
    }
    const floor = Math.max(terrainHeight(camera.position.x, camera.position.z) + .5, waveHeight(camera.position.x, camera.position.z, t) + .35)
    if (camera.position.y < floor) camera.position.y = floor                              // never through the bank or into the river
  }
  return S
}
