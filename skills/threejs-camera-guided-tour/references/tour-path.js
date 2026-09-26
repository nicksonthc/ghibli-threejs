// Guided tour core: keys as data, time-parametrised Catmull-Rom, one camera owner, time of day, staged crossings.
// Adapt: TOUR (your keys/tracks/captions), `setCine`/`getCine` (your camera-owner flag), `applyTimeOfDay(phase, k)`,
// `fish[i]` objects ({ obj, vel, scripted }), `terrainHeight`, and the caption element.
import * as THREE from 'three'

export const TOUR = {
  keys: [
    { t:0,  pos:null, target:null },                       // null = the visitor's current camera: no jump at the start
    { t:5,  pos:[7.5, 8.6, 10.8], target:[1.8, .4, -1.2] }, // 1 establishing orbit
    { t:13, pos:[9.4, 6.2, -4.2], target:[1.4, .9, -1.6] },
    { t:22, pos:[5.1, .32, 3.5],  target:[5.3, -.3, -.3] }, // 2 down to the surface
    { t:29, pos:[5.3, -.38, 1.5], target:[5.3, -.34, -2.6] },// 3 slow glide just under it
    { t:41, pos:[4.6, .55, -4.4], target:[2.2, 1.2, -3.2] }, //   … and a slow rise
    { t:66, pos:[6.2, 2.6, 9.5],  target:[2.8, 2.2, -4.5] }, // 5 pull back as day turns to night
    { t:80, pos:[4.4, 3.1, 12.6], target:[2.7, 2.6, -6] },
  ],
  day:   [[0, .25], [61, .25], [70, .97], [80, .97]],       // day phase 0 sunrise … 1 sunset
  night: [[0, 0], [65, 0], [75, 1], [80, 1]],               // night blend k
  captions: [[2, 10, 'somewhere along the river'], [26, 36, '{{caption}}'], [67, 76, 'and the river turns to night']],
}
// fish crossing the frame, camera-relative (dist m ahead, dy above the lens); dir +1 = left → right
export const CROSSINGS = [
  { t:27.4, dur:4.8, fish:0, dist:1.2,  dy:-.03, dir: 1 },
  { t:29.4, dur:5.8, fish:4, dist:1.75, dy:-.10, dir:-1 },
  { t:31.6, dur:4.4, fish:3, dist:.95,  dy: .02, dir: 1 },
]

// piecewise lookup in [[t, v], …], smoothstepped between samples
export const track = (tr, t) => { for (let i = 1; i < tr.length; i++) if (t <= tr[i][0]){ const [t0, v0] = tr[i-1], [t1, v1] = tr[i]; return v0 + (v1 - v0)*THREE.MathUtils.smoothstep(t, t0, t1) } return tr[tr.length-1][1] }

// non-uniform Catmull-Rom = Hermite with time-scaled tangents; zero tangents only at the ends (ease in/out)
const _a = new THREE.Vector3(), _b = new THREE.Vector3()
export function tourSample(keys, field, t, out){
  const n = keys.length; let i = 0
  while (i < n - 2 && t > keys[i+1].t) i++
  const k0 = keys[Math.max(0, i-1)], k1 = keys[i], k2 = keys[i+1], k3 = keys[Math.min(n-1, i+2)]
  const d = k2.t - k1.t, u = THREE.MathUtils.clamp((t - k1.t)/d, 0, 1), p1 = k1[field], p2 = k2[field]
  _a.set(0, 0, 0); if (i > 0)     _a.subVectors(p2, k0[field]).multiplyScalar(d/(k2.t - k0.t))
  _b.set(0, 0, 0); if (i + 2 < n) _b.subVectors(k3[field], p1).multiplyScalar(d/(k3.t - k1.t))
  const u2 = u*u, u3 = u2*u
  return out.copy(p1).multiplyScalar(2*u3 - 3*u2 + 1).addScaledVector(_a, u3 - 2*u2 + u).addScaledVector(p2, -2*u3 + 3*u2).addScaledVector(_b, u3 - u2)
}

export function createTour({ camera, controls, setCine, getCine, applyTimeOfDay, getNightK, fish = [], terrainHeight = () => -1e9, captionEl }){
  const tour = { active:false, time:0, keys:null, fov:camera.fov, saved:null }
  const P = new THREE.Vector3(), T = new THREE.Vector3()

  tour.start = () => {
    if (tour.active || getCine()) return
    tour.keys = TOUR.keys.map(k => ({ ...k, pos:k.pos ? new THREE.Vector3(...k.pos) : camera.position.clone(), target:k.target ? new THREE.Vector3(...k.target) : controls.target.clone() }))
    tour.fov = camera.fov
    if (camera.aspect < 1){                                  // portrait: widen the lens rather than pull the camera back
      camera.fov = Math.min(80, THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(25))/camera.aspect))); camera.updateProjectionMatrix() }
    tour.saved = { autoRotate:controls.autoRotate }; controls.autoRotate = false
    tour.time = 0; tour.active = true; setCine('tour')       // the render loop skips controls.update() + ground clamps while cine is set
    document.body.classList.add('touring')
  }
  tour.stop = () => {
    if (!tour.active) return
    tour.active = false; setCine(false)
    fish.forEach(f => { f.scripted = false })
    if (camera.fov !== tour.fov){ camera.fov = tour.fov; camera.updateProjectionMatrix() }
    document.body.classList.remove('touring'); captionEl?.classList.remove('show')
    // leave night on if it had mostly arrived (k ≥ .5), else restore the visitor's day cycle — do that in your own state code
    controls.autoRotate = true                               // never leave auto-orbit off
    controls.update()                                        // the camera stays where the tour left it
  }
  tour.step = dt => {
    if (!tour.active) return
    tour.time += dt
    const keys = tour.keys, t = Math.min(tour.time, keys[keys.length-1].t)
    tourSample(keys, 'pos', t, P); tourSample(keys, 'target', t, T)
    camera.position.copy(P); controls.target.copy(T); camera.lookAt(T)
    stepCrossings(t)
    applyTimeOfDay(track(TOUR.day, t), track(TOUR.night, t)) // the tour owns time of day; day-cycle/night steps return early while active
    const cap = TOUR.captions.find(([a, b]) => t >= a && t < b)
    if (captionEl){ if (cap){ if (captionEl.textContent !== cap[2]) captionEl.textContent = cap[2]; captionEl.classList.add('show') } else captionEl.classList.remove('show') }
    if (tour.time >= keys[keys.length-1].t) tour.stop()
  }
  // a pure function of tour time, so seek() lands mid-crossing; the flocking step must skip f.scripted
  function stepCrossings(t){
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect
    let fx = T.x - P.x, fz = T.z - P.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl   // heading; screen-right = (−fz, fx)
    for (const c of CROSSINGS){
      const f = fish[c.fish]; if (!f) continue
      const u = (t - c.t)/c.dur
      if (u < 0 || u > 1){ if (f.scripted){ f.scripted = false; f.vel?.set(-fz*c.dir, fx*c.dir).multiplyScalar(.3) } continue }   // release: swim on
      f.scripted = true; f.obj.visible = true
      const half = c.dist*tanH + .55*f.obj.scale.x           // half the frame width at that distance + a body length
      const s = (u*2 - 1)*half*c.dir
      const bow = .14*Math.sin(Math.PI*u), dBow = .14*Math.PI*Math.cos(Math.PI*u)/(2*half*c.dir)
      const d = c.dist - bow, p = f.obj.position
      p.set(P.x + fx*d - fz*s, 0, P.z + fz*d + fx*s)
      p.y = Math.max(Math.min(P.y + c.dy, -.12), terrainHeight(p.x, p.z) + .14)
      const vx = -fz*c.dir - fx*dBow*c.dir, vz = fx*c.dir - fz*dBow*c.dir
      f.obj.rotation.set(0, Math.atan2(-vz, vx), 0)          // body axis along the crossing (fish front = +X)
    }
  }
  tour.seek = s => { if (!tour.active) tour.start(); tour.time = Math.max(0, s) - .016 }   // then call frame() yourself

  // hand-back: drag/tap (controls 'start'), wheel, Esc
  controls.addEventListener('start', () => tour.stop())
  controls.domElement.addEventListener('wheel', () => tour.stop(), { passive:true })
  addEventListener('keydown', e => { if (e.key === 'Escape') tour.stop() })
  return tour
}

// Sun follows the lens during day beats (degrees). Sticky side; eased; lifted by half the camera pitch.
const wrapDeg = a => ((a + 540) % 360) - 180
export function followSun(state, P, T, dt, { offset = 42, el = 30, lag = 2.4 } = {}){
  const fx = T.x - P.x, fy = T.y - P.y, fz = T.z - P.z, fl = Math.hypot(fx, fz) || 1
  const camAz = THREE.MathUtils.radToDeg(Math.atan2(fx, -fz)), pitch = THREE.MathUtils.radToDeg(Math.atan2(fy, fl))
  const rel = wrapDeg(state.sunAz - camAz); if (Math.abs(rel) > 8) state.sunSide = Math.sign(rel)
  const k = 1 - Math.exp(-dt/lag)
  state.sunAz = wrapDeg(state.sunAz + wrapDeg(camAz + state.sunSide*offset - state.sunAz)*k)
  state.sunEl += (THREE.MathUtils.clamp(el + pitch*.5, 18, 60) - state.sunEl)*k
}
