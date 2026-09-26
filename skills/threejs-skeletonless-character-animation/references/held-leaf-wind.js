// A held leaf (or umbrella, flag, fishing rod) that moves in the wind: the stem is a cantilever
// held at the paw, the blade rides its tip. A spring–damper (~1.4 Hz, lightly damped) drives the tip
// from wind + gusts, the apparent wind of the vehicle's motion, inertia from its acceleration and
// the holder's body turns, and heave. The blade also cups in the airflow and its rim flutters.
// Same deformation in the colour AND depth materials, so the shadow moves too.
//
// ADAPT: measure uGrip / uStemTop from the stem mesh (see rigLeaf). Blade UVs must be POLAR
// (u = angle round the stem point, v = radius). `holder` = the character Object3D (world quat),
// `boat` = { obj, v, yaw }, uWind = global wind strength.
import * as THREE from 'three'

export const LEAF_U = { uGrip: { value: new THREE.Vector3() }, uStemTop: { value: new THREE.Vector3() }, uBend: { value: new THREE.Vector3() },
  uTwist: { value: 0 }, uFlap: { value: 0 }, uFlut: { value: new THREE.Vector2(.01, 1) }, uAir: { value: new THREE.Vector3() } }
export const LEAF_WIND = { freq: 1.4, damp: .16, drag: 1.75, inertia: 4.6, turn: .9, wind: 1.5, maxBend: .2, flutter: 1.2, twist: 3.5, nod: 1.4 }

export const LEAF_GLSL = /* glsl */`
  uniform vec3 uGrip, uStemTop, uBend, uAir; uniform float uTwist, uFlap; uniform vec2 uFlut;
  vec3 leafRot(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1. - c); }
  // blade rigidly follows the tip: twist about the stem, tilt by the tip slope 1.5·|bend|/L about cross(axis, bend)
  vec3 bladeRigid(vec3 p){ vec3 A = uStemTop - uGrip; float L = length(A); vec3 ax = A/L;
    p = leafRot(p, ax, uTwist); float bl = length(uBend);
    if (bl > 1e-5) p = leafRot(p, normalize(cross(ax, uBend)), 1.5*bl/L);
    return p; }
  // stem: t = dot(p − grip, axis)/L, cantilever shape t²(3 − t)/2 (0 at the paw, 1 at the top); twist grows with t
  vec3 stemBend(vec3 p){ vec3 A = uStemTop - uGrip; float L = length(A); vec3 ax = A/L;
    float t = clamp(dot(p - uGrip, ax)/L, 0., 1.), sh = t*t*(3. - t)*.5;
    vec3 o = uGrip + ax*t*L; return o + leafRot(p - o, ax, uTwist*t) + uBend*sh; }
  // cupping + flutter from polar UVs: r²·(flutter(angle, t) − 0.03·dot(radial, airDir)·|air| + nod)
  vec3 bladeBend(vec3 p, vec2 luv, float time){
    vec3 q = p - uStemTop; float r = luv.y, ang = luv.x*6.2832;
    float fl = sin(ang*3. + time*uFlut.y*6.)*.6 + sin(ang*5. - time*uFlut.y*8.3 + 1.3)*.4;
    vec2 rad = normalize(q.xz + 1e-5), air = uAir.xz;
    float cup = dot(rad, normalize(air + 1e-5)) * min(length(air), 3.5);
    q.y += r*r*(uFlut.x*fl - .03*cup + uFlap);
    return uStemTop + uBend + bladeRigid(q); }`

export function leafWindMaterial(m, part, uTime) {           // part: 'blade' | 'stem'; colour or depth material
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey ? m.customProgramCacheKey() : ''
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r)
    Object.assign(sh.uniforms, LEAF_U, { uTime })
    let vs = sh.vertexShader
    if (!/uniform float uTime/.test(vs)) vs = vs.replace('#include <common>', '#include <common>\nuniform float uTime;')
    sh.vertexShader = vs.replace('#include <common>', '#include <common>\n' + LEAF_GLSL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n  ${part === 'blade' ? 'objectNormal = bladeRigid(objectNormal);' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed = ${part === 'blade' ? 'bladeBend(transformed, uv, uTime)' : 'stemBend(transformed)'};`)
  }
  m.customProgramCacheKey = () => key + '|leafwind:' + part; m.needsUpdate = true
  return m
}

// measure the rig from the mesh: grip = the stem ring at the paw's height, top = the highest ring
export function rigLeaf(stem, blade, uTime, gripY = .5) {
  const p = stem.geometry.attributes.position, v = new THREE.Vector3(); let maxY = -9
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i))
  const top = new THREE.Vector3(), grip = new THREE.Vector3(); let nt = 0, ng = 0
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > maxY - .03) { top.add(v); nt++ } if (Math.abs(v.y - gripY) < .03) { grip.add(v); ng++ } }
  if (nt) LEAF_U.uStemTop.value.copy(top.multiplyScalar(1 / nt)); if (ng) LEAF_U.uGrip.value.copy(grip.multiplyScalar(1 / ng))
  leafWindMaterial(blade.material, 'blade', uTime); leafWindMaterial(stem.material, 'stem', uTime)
  for (const [mesh, part] of [[blade, 'blade'], [stem, 'stem']]) { mesh.castShadow = true
    mesh.customDepthMaterial = leafWindMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), part, uTime) }
  return { D: new THREE.Vector2(), V: new THREE.Vector2(), tw: 0, twv: 0, fl: 0, flv: 0, vel: new THREE.Vector2(), acc: new THREE.Vector2(), yaw: null, yawRate: 0, heave: null, heaveV: 0 }
}

// module-scope temporaries get UNIQUE names: a duplicate `const` in one big script is a SyntaxError
const _leafQ = new THREE.Quaternion(), _leafQi = new THREE.Quaternion(), _leafA = new THREE.Vector3(), _leafAcc = new THREE.Vector3()
export function stepLeaf(L, dt, t, holder, boat, uWind) {
  if (dt <= 0) return
  const W = LEAF_WIND, k = (2 * Math.PI * W.freq) ** 2, c = 2 * W.damp * 2 * Math.PI * W.freq
  const bv = boat.v || 0, byaw = boat.yaw || 0
  const vx = Math.cos(byaw) * bv, vz = -Math.sin(byaw) * bv
  L.acc.lerp(new THREE.Vector2((vx - L.vel.x) / dt, (vz - L.vel.y) / dt), Math.min(1, dt * 6)); L.vel.set(vx, vz)
  holder.getWorldQuaternion(_leafQ); _leafQi.copy(_leafQ).invert()
  const yaw = Math.atan2(2 * (_leafQ.w * _leafQ.y + _leafQ.x * _leafQ.z), 1 - 2 * (_leafQ.y * _leafQ.y + _leafQ.x * _leafQ.x))
  const dyaw = L.yaw == null ? 0 : Math.atan2(Math.sin(yaw - L.yaw), Math.cos(yaw - L.yaw)); L.yaw = yaw
  const yawRate = dyaw / dt, yawAcc = (yawRate - L.yawRate) / dt; L.yawRate = THREE.MathUtils.lerp(L.yawRate, yawRate, Math.min(1, dt * 8))
  const hy = boat.obj.position.y, hv = L.heave == null ? 0 : (hy - L.heave) / dt, ha = (hv - L.heaveV) / dt; L.heave = hy; L.heaveV = hv
  // air on the blade = wind (veering, gusting) − the boat's own motion, rotated into the holder's frame
  const wa = .95 + .35 * Math.sin(t * .031) + .15 * Math.sin(t * .11)
  const gust = .55 + .3 * Math.sin(t * .47) * Math.sin(t * .13 + 1) + .25 * Math.max(0, Math.sin(t * .71 + Math.sin(t * .23) * 3)) ** 3
  const ws = W.wind * uWind * gust
  const air = _leafA.set(Math.sin(wa) * ws - vx, 0, -Math.cos(wa) * ws - vz).applyQuaternion(_leafQi)
  const am = Math.hypot(air.x, air.z)
  const acc = _leafAcc.set(L.acc.x, 0, L.acc.y).applyQuaternion(_leafQi)
  // drag ∝ |air|^0.5·air (quadratic is too violent at rowing speeds); inertia −k·acc; tangential swing from body turns
  const tip = LEAF_U.uStemTop.value
  const fx = W.drag * Math.pow(am, .5) * air.x - W.inertia * acc.x + W.turn * yawAcc * tip.z * .1
  const fz = W.drag * Math.pow(am, .5) * air.z - W.inertia * acc.z - W.turn * yawAcc * tip.x * .1
  L.V.x += (fx - k * L.D.x - c * L.V.x) * dt; L.V.y += (fz - k * L.D.y - c * L.V.y) * dt
  L.D.x += L.V.x * dt; L.D.y += L.V.y * dt
  const dl = L.D.length(); if (dl > W.maxBend) { L.D.multiplyScalar(W.maxBend / dl); L.V.multiplyScalar(.5) }   // clamp bend at 20 cm
  const tq = W.twist * (.4 + am) * (Math.sin(t * 1.7 + Math.sin(t * .6) * 2) * .6 + Math.sin(t * 3.1 + 1.1) * .25) + .5 * yawAcc * .05
  L.twv += (tq - 60 * L.tw - 2.4 * L.twv) * dt; L.tw = THREE.MathUtils.clamp(L.tw + L.twv * dt, -.35, .35)
  L.flv += (-.06 * ha + W.nod * (.3 + am) * (Math.sin(t * 2.3 + Math.sin(t * .9)) * .7 + Math.sin(t * 4.1) * .3) - 90 * L.fl - 3 * L.flv) * dt
  L.fl = THREE.MathUtils.clamp(L.fl + L.flv * dt, -.07, .07)
  LEAF_U.uBend.value.set(L.D.x, 0, L.D.y); LEAF_U.uTwist.value = L.tw; LEAF_U.uFlap.value = L.fl
  LEAF_U.uAir.value.copy(air); LEAF_U.uFlut.value.set((.006 + .01 * Math.min(am, 3.5)) * W.flutter, .55 + .45 * Math.min(am, 3.5))
}

/* Leaf look (fragment, in the blade's MeshStandardMaterial patch, added to totalEmissiveRadiance):
   veins drawn on a canvas as straight strokes (polar UVs make radial veins vertical) → map + bumpMap,
   roughness ~.62, and faked translucency in VIEW space:
     vec3 Lv = normalize((viewMatrix*vec4(uSunDir,0.)).xyz), Vv = normalize(vViewPosition);
     float back = pow(saturate(dot(Vv, Lv)*.5 + .5), 3.) * saturate(dot(-normal, Lv)*1.4 + .2);
     float vein = texture2D(uVeinMask, vMapUv).r;
     totalEmissiveRadiance += diffuseColor.rgb * vec3(.92,1.05,.5) * uSunColor * uLeafTrans * back
                              * (1. - smoothstep(.45,.66,vein)*.55) * (1. - .85*uNight);
   uLeafTrans ≈ 0.75 — at 1.35 it bloomed neon lime. */
