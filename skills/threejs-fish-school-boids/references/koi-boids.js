// Calm koi traffic: light boids + a patrol home per fish + slow-sine wander + look-ahead shallows
// avoidance + obstacles, with clamped steering and frame-rate independent easing. 2D on the
// water plane (vel = Vector2(x, z)); heading h ⇒ forward = (cos h, −sin h), yaw = h.
//
// ADAPT: terrainHeight(x,z) (bed height, water at 0), riverCenter(z), riverHalf(z), obstacles
// [{x,z,r}], `camera`, and spawnRipple(x, z, t) that writes a ripple slot for the water shader.
import * as THREE from 'three'

export const KOI = { active: 20, speed: 1.0, spacing: 1.0, schooling: .25, roam: 1.0 }   // expose in a Tune folder
const ease1 = (dt, k) => 1 - Math.exp(-dt * k)                  // frame-rate independent lerp
const _acc = new THREE.Vector2(), _coh = new THREE.Vector2(), _ali = new THREE.Vector2(), _sep = new THREE.Vector2()
let nextKiss = null

// fish = { obj (Group, rotation.order 'YXZ'), u (shader uniforms), vel: Vector2, heading, depth,
//          wander, burst, kissUntil, turn, homeZ, homeF, homePh, scripted? }
export function stepFish(F, dt, t, W) {
  nextKiss ??= t + 4                                             // seed timers from the live clock
  if (t > nextKiss && F.length) { F[(Math.random() * F.length) | 0].kissUntil = t + 3.2; nextKiss = t + 5 + Math.random() * 6 }
  const sepR2 = .8 * KOI.spacing * KOI.spacing, school = KOI.schooling
  for (const f of F) {
    if (!f.obj.visible || f.scripted) continue                   // a cinematic may own this fish
    const p = f.obj.position, v = f.vel, acc = _acc.set(0, 0)
    // neighbours within ~2.4 m: small cohesion (× schooling), alignment, ramped separation (not 1/d²)
    let n = 0; _coh.set(0, 0); _ali.set(0, 0); _sep.set(0, 0)
    for (const g of F) { if (g === f || !g.obj.visible) continue
      const dx = g.obj.position.x - p.x, dz = g.obj.position.z - p.z, d2 = dx * dx + dz * dz
      if (d2 < 5.8) { n++; _coh.x += dx; _coh.y += dz; _ali.add(g.vel)
        if (d2 < sepR2) { const w = 1 - d2 / sepR2; _sep.x -= dx * w * w; _sep.y -= dz * w * w } } }
    if (n) acc.addScaledVector(_coh, .12 * school / n).addScaledVector(_ali.divideScalar(n).sub(v), .1 + .5 * school)
    acc.addScaledVector(_sep, .9 * KOI.spacing)
    // patrol home: soft spring beyond `reach` keeps traffic spread along the river (cohesion alone collapses into one stuck crowd)
    const homeZ = f.homeZ + Math.sin(t * .05 + f.homePh) * 2.5 * KOI.roam
    const homeX = W.riverCenter(homeZ) + f.homeF * W.riverHalf(homeZ) * Math.min(1, KOI.roam)
    const hdx = homeX - p.x, hdz = homeZ - p.z, hd = Math.hypot(hdx, hdz), reach = 2.5 * KOI.roam + .5
    if (hd > reach) { const k = Math.min(1, (hd - reach) / 3) * .35; acc.x += hdx / hd * k; acc.y += hdz / hd * k }
    // wander: two slow sines per fish, not a per-frame random walk → long lazy S-curves
    const ang = f.heading + (Math.sin(t * .23 + f.wander) + .6 * Math.sin(t * .61 + f.wander * 1.7)) * .9
    acc.x += Math.cos(ang) * .08; acc.y -= Math.sin(ang) * .08
    const sp0 = Math.max(v.length(), 1e-4), hx = v.x / sp0, hz = v.y / sp0
    // shallows: look 1.2 m ahead, ease toward the channel
    const ax = p.x + hx * 1.2, az = p.z + hz * 1.2, hAhead = W.terrainHeight(ax, az)
    if (hAhead > -.45) { const k = THREE.MathUtils.smoothstep(hAhead, -.45, -.25); acc.x += Math.sign(W.riverCenter(az) - p.x) * .8 * k; acc.y -= v.y * .3 * k }
    // rocks: ramped push from half a metre out
    for (const o of W.obstacles) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz)
      if (d < o.r + .5) { const k = 1 - (d - o.r) / .5; acc.x += dx / (d + .05) * k * .7; acc.y += dz / (d + .05) * k * .7 } }
    // a submerged camera is a ~1.6 m obstacle, or a koi swims through the lens
    if (W.camera.position.y < 0) { const cr = W.camClear ?? 1.6, dx = p.x - W.camera.position.x, dz = p.z - W.camera.position.z, d = Math.hypot(dx, dz)
      if (d < cr) { const k = 1 - d / cr; acc.x += dx / (d + .05) * k * 1.2; acc.y += dz / (d + .05) * k * 1.2 } }
    // occasional gentle speed flick
    if (f.burst <= 0 && Math.random() < dt * .04) f.burst = 1.4
    f.burst = Math.max(0, f.burst - dt)
    const am = acc.length(); if (am > .9) acc.multiplyScalar(.9 / am)          // clamp steering: nothing yanks a fish sideways
    v.addScaledVector(acc, dt)
    const target = KOI.speed * (.20 + .06 * Math.sin(t * .19 + f.wander) + (f.burst > 0 ? .28 * Math.sin(Math.PI * f.burst / 1.4) : 0))
    const sp = v.length(); v.multiplyScalar(THREE.MathUtils.lerp(sp, target, ease1(dt, 2.5)) / Math.max(sp, 1e-4))
    p.x += v.x * dt; p.z += v.y * dt
    // depth: mid-water cruise with a slow bob; rise to kiss the surface → ripple ring
    const kissing = t < f.kissUntil
    const wantY = kissing ? -.09 : Math.max(f.depth + .03 * Math.sin(t * .4 + f.wander), W.terrainHeight(p.x, p.z) + .14)
    p.y = THREE.MathUtils.lerp(p.y, wantY, ease1(dt, kissing ? 1.2 : .6))
    if (kissing && p.y > -.12 && !f.kissed) { const hs = f.obj.scale.x * .27; W.spawnRipple(p.x + hx * hs, p.z + hz * hs, t); f.kissed = true }
    if (!kissing) f.kissed = false
    // heading: turn-rate-limited (≤ 1.5 rad/s); bend and bank follow the eased turn rate
    let dy = Math.atan2(-v.y, v.x) - f.heading; dy = Math.atan2(Math.sin(dy), Math.cos(dy))
    const step = THREE.MathUtils.clamp(dy, -1.5 * dt, 1.5 * dt)
    f.heading += step; f.obj.rotation.y = f.heading
    f.turn = THREE.MathUtils.lerp(f.turn, THREE.MathUtils.clamp(step / Math.max(dt, 1e-4) * .15, -.35, .35), ease1(dt, 3))
    f.obj.rotation.x = f.turn * .25                                            // roll into turns (Euler order YXZ)
    const spn = v.length()
    f.u.uTurn.value = -f.turn
    f.u.uAmp.value = .55 + spn * 1.2 + Math.abs(f.turn) * .8
    f.u.uFold.value = THREE.MathUtils.smoothstep(spn, .3, .55)                 // pectorals tuck when sprinting
    // tail and fin beats: a rate from speed (≈ .65 Hz cruising, ≈ 1 Hz in a flick), eased, integrated into a phase.
    // Never sin(uTime·rate) with a changing rate: with page-time uTime in the thousands every change jumps the phase → a twitchy tail.
    const k = ease1(dt, 1.5)
    f.swimW = THREE.MathUtils.lerp(f.swimW ?? 4, 2.6 + spn * 8, k); f.u.uSwim.value = (f.u.uSwim.value + f.swimW * dt) % 6283.2
    f.finW = THREE.MathUtils.lerp(f.finW ?? 2.5, 1.6 + (1 - f.u.uFold.value) * 1.6, k); f.u.uFinBeat.value = (f.u.uFinBeat.value + f.finW * dt) % 6283.2
  }
}
