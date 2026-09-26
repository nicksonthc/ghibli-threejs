// The wake simulation step (one full-screen quad into the other ping-pong target) + the JS driver.
// Adapt: `renderer`, the hull size uHull = (half-length, half-beam) in metres, and a `pose` {x, z, yaw}
// with the bow along (cos yaw, −sin yaw). The water shader reads tWake + uWakeRect (centre x, z, span, texel).
import * as THREE from 'three'
import { iwaveKernel } from './iwave-kernel.js'

export const WAKE = { size: 256, span: 24, damp: .18, force: 3.4, bob: 14, foam: 1, foamLife: 2.2, g: 9.81 }
const DX = WAKE.span / WAKE.size
const K = iwaveKernel({ radius: 7, sigma: .6 })

export function makeWakeSim(renderer) {
  const rt = [0, 1].map(() => new THREE.WebGLRenderTarget(WAKE.size, WAKE.size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }))
  const mat = new THREE.ShaderMaterial({
    uniforms: { tState: { value: null }, uShift: { value: new THREE.Vector2() }, uTexel: { value: 1 / WAKE.size }, uGdt2: { value: 0 }, uAdt: { value: 0 },
      uTaps: { value: K.taps.map(([i, j, w]) => new THREE.Vector3(i, j, w)) }, uCenter: { value: new THREE.Vector2() }, uSpan: { value: WAKE.span },
      uHullA: { value: new THREE.Vector4() }, uHullB: { value: new THREE.Vector4() }, uHull: { value: new THREE.Vector2(1.55, .53) },
      uForce: { value: 0 }, uBob: { value: 0 }, uFoamGen: { value: 0 }, uFoamKeep: { value: 1 }, uRelax: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */`#define NTAPS ${K.taps.length}
      uniform sampler2D tState; uniform vec2 uShift, uCenter, uHull; uniform vec4 uHullA, uHullB; uniform vec3 uTaps[NTAPS];
      uniform float uTexel, uGdt2, uAdt, uSpan, uForce, uBob, uFoamGen, uFoamKeep, uRelax; varying vec2 vUv;
      // hull draught 0..1: pointed bow, full body, slightly narrowed transom, deepest amidships. H = (x, z, dirX, dirZ)
      float hullF(vec2 w, vec4 H){
        vec2 q = w - H.xy; float a = dot(q, H.zw), c = dot(q, vec2(-H.w, H.z)), t = a/uHull.x;
        if (abs(t) > 1.) return 0.;
        float hb = uHull.y * (t > 0. ? 1. - pow(t, 2.2)*.95 : 1. - pow(-t, 4.)*.25);
        float x = abs(c)/max(hb, 1e-3);
        return (1. - x*x) * (1. - t*t*.35) * smoothstep(1., .82, x);
      }
      vec4 at(vec2 uv){ return (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) ? vec4(0.) : texture2D(tState, uv); }
      void main(){
        vec2 src = vUv + uShift;                                                    // window moved by whole texels
        vec4 S = at(src), N = at(src + vec2(0., uTexel)), So = at(src - vec2(0., uTexel)), E = at(src + vec2(uTexel, 0.)), W = at(src - vec2(uTexel, 0.));
        float h = S.r, hp = S.g;
        float vd = 0.; for (int k = 0; k < NTAPS; k++) vd += uTaps[k].z * at(src + uTaps[k].xy*uTexel).r;   // vertical derivative
        float hn = (h*(2. - uAdt) - hp - uGdt2*vd) / (1. + uAdt);                  // iWave: dispersive, damped
        hn += .03*((N.r - N.g) + (So.r - So.g) + (E.r - E.g) + (W.r - W.g) - 4.*(h - hp));   // viscous damping: grid-scale only
        vec2 w = uCenter + (vUv - .5)*uSpan;
        float fA = hullF(w, uHullA), fB = hullF(w, uHullB);
        // displacement added to BOTH new and stored height: moves the surface without kicking its velocity
        float dh = uForce*(fA - fB) - uBob*fA;
        hn = (hn + dh)*uRelax;
        vec2 e2 = min(vUv, 1. - vUv); hn *= mix(.9, 1., smoothstep(0., .08, min(e2.x, e2.y)));   // sponge
        float slope = length(vec2(E.r - W.r, N.r - So.r)) / (2.*uTexel*uSpan);     // cm per m
        float foam = mix(S.b, (N.b + So.b + E.b + W.b)*.25, .12) * uFoamKeep;
        float along = dot(w - uHullA.xy, uHullA.zw)/uHull.x;                        // -1 stern … +1 bow
        float rim = smoothstep(0., .12, fA) * (1. - smoothstep(.12, .3, fA));       // thin band where hull meets water
        foam += uFoamGen * (max(0., slope - 16.)*.003 + rim*smoothstep(-.2, .9, along)*.05 + rim*smoothstep(-.8, -1., along)*.03);
        gl_FragColor = vec4(hn, h + dh, clamp(foam, 0., 1.), 1.);
      }` })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false
  const scene = new THREE.Scene(); scene.add(quad); const cam = new THREE.Camera()
  { const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); renderer.setClearColor(0, 0)
    rt.forEach(r => { renderer.setRenderTarget(r); renderer.clear() }); renderer.setRenderTarget(null); renderer.setClearColor(cc, ca) }
  const S = { i: 0, acc: 0, center: new THREE.Vector2(), pose: null, heave: null, rect: new THREE.Vector4(0, 0, WAKE.span, 1 / WAKE.size), rt }

  function step(pose, heaveV, dt, speed) {
    const u = mat.uniforms, cx = Math.round(pose.x / DX) * DX, cz = Math.round(pose.z / DX) * DX
    u.uShift.value.set((cx - S.center.x) / WAKE.span, (cz - S.center.y) / WAKE.span); S.center.set(cx, cz); u.uCenter.value.copy(S.center)
    u.uGdt2.value = WAKE.g / DX * dt * dt * K.scale; u.uAdt.value = WAKE.damp * dt; u.uRelax.value = Math.exp(-.04 * dt)
    const prev = S.pose || pose, jump = Math.hypot(pose.x - prev.x, pose.z - prev.z) > 1.5   // a teleport: no splash
    u.uHullA.value.set(pose.x, pose.z, Math.cos(pose.yaw), -Math.sin(pose.yaw))
    u.uHullB.value.copy(jump ? u.uHullA.value : new THREE.Vector4(prev.x, prev.z, Math.cos(prev.yaw), -Math.sin(prev.yaw)))
    u.uForce.value = WAKE.force * (.7 + .6 * Math.min(speed, 2)); u.uBob.value = WAKE.bob * heaveV * dt
    u.uFoamGen.value = WAKE.foam * THREE.MathUtils.smoothstep(speed, .15, 1.2); u.uFoamKeep.value = Math.exp(-dt / WAKE.foamLife)
    u.tState.value = rt[S.i].texture
    renderer.setRenderTarget(rt[1 - S.i]); renderer.render(scene, cam); renderer.setRenderTarget(null)
    S.i = 1 - S.i; S.pose = { ...pose }; S.rect.set(S.center.x, S.center.y, WAKE.span, 1 / WAKE.size)
  }
  // per frame: fixed 60 Hz sub-steps walking the pose from the last step to now
  S.update = (obj, dt, waterU) => {
    const pose = { x: obj.position.x, z: obj.position.z, yaw: obj.rotation.y }
    const heaveV = S.heave == null ? 0 : (obj.position.y - S.heave) / Math.max(dt, 1e-3); S.heave = obj.position.y
    S.acc = Math.min(S.acc + dt, 4 / 60)
    const from = S.pose || pose, n = Math.floor(S.acc * 60); if (!n) return
    for (let k = 1; k <= n; k++) { const f = k / n
      const p = { x: THREE.MathUtils.lerp(from.x, pose.x, f), z: THREE.MathUtils.lerp(from.z, pose.z, f), yaw: from.yaw + Math.atan2(Math.sin(pose.yaw - from.yaw), Math.cos(pose.yaw - from.yaw)) * f }
      step(p, heaveV, 1 / 60, Math.hypot(p.x - (S.pose || p).x, p.z - (S.pose || p).z) * 60) }
    S.acc -= n / 60
    waterU.tWake.value = rt[S.i].texture; waterU.uWakeRect.value.copy(S.rect)
  }
  return S
}

// ── In the water fragment's normal function (p = vWPos.xz, sl = accumulated slope, dist fade already applied) ──
/*
vec2 wuv = (p - uWakeRect.xy)/uWakeRect.z + .5;
if (wuv.x > 0. && wuv.y > 0. && wuv.x < 1. && wuv.y < 1.){
  float e = uWakeRect.w; vec2 e2 = min(wuv, 1. - wuv); float fade = smoothstep(0., .1, min(e2.x, e2.y));
  vec4 C = texture2D(tWake, wuv);
  float hE = texture2D(tWake, wuv + vec2(e, 0.)).r, hW = texture2D(tWake, wuv - vec2(e, 0.)).r;
  float hN = texture2D(tWake, wuv + vec2(0., e)).r, hS = texture2D(tWake, wuv - vec2(0., e)).r;
  vec2 wsl = vec2(hE - hW, hN - hS) / (2.*e*uWakeRect.z) * .01 * fade;     // true slope (m/m)
  sl += wsl * 3.5; gWakeSlope += wsl;                                       // ×3.5 max: more smears the reflection
  gWake = C.r*.01*fade;
  float n = wNoise(p*vec2(13., 17.) + vec2(0., -t*.4))*.55 + wNoise(p*37. - t*.7)*.45;   // fine, streaky foam
  gFoam = max(gFoam, smoothstep(.3, .9, C.b*(.35 + 1.1*n)) * .5 * fade);
}
// … and in the final colour:
col *= 1. - clamp(-gWake*7., 0., .14);                                                      // troughs sink
col *= 1. + clamp(dot(gWakeSlope, normalize(uSunDir.xz + 1e-4)) * 6.5, -.28, .36);          // relief readable from above
col = mix(col, vec3(.93, .97, 1.)*(.55 + .35*min(uSunLum, 1.5)), gFoam*.62);
*/
