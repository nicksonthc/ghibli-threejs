// Fireflies (one Points draw call), moths round fire boxes, the "one real light follows the
// nearest source" pattern, and point lights created at build time with intensity 0.
//
// ADAPT: `uTime`, `uNight` (the night blend k as a uniform), `pickSpot()` returns a world position
// near the banks, `aoHidden` is the list you hide during the GTAO pass.
import * as THREE from 'three'

// ── lights: create EVERY night light before the first compile, at intensity 0 ──
// Adding a PointLight later recompiles every lit material on that frame (a visible hitch).
export const lampLight    = new THREE.PointLight(0xffa050, 0, 6, 2)   // an oil lamp by the focal character
export const lanternLight = new THREE.PointLight(0xffa850, 0, 7, 2)   // ONE light shared by N stone lanterns
export const boatLight    = new THREE.PointLight(0xffa850, 0, 8, 2)   // a lantern riding a boat

export function buildFireflies({ scene, renderer, uTime, uNight, pickSpot, aoHidden, count = 110, color = 0xd6ff72, bright = 1.25, px = 7 }) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count)
  for (let i = 0; i < count; i++) { const v = pickSpot(); pos.set([v.x, v.y, v.z], i * 3); seed[i] = Math.random() }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime, uNight, uPR: { value: renderer.getPixelRatio() }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`attribute float seed; uniform float uTime, uNight, uPR; varying float vA;
      void main(){
        // wander by summed sines (no CPU update)
        vec3 p = position + vec3(sin(uTime*.31 + seed*40.)*.7 + sin(uTime*.87 + seed*13.)*.15,
                                 sin(uTime*.47 + seed*17.)*.22,
                                 cos(uTime*.27 + seed*23.)*.7 + cos(uTime*.73 + seed*29.)*.15);
        float blink = pow(max(0., sin(uTime*(.6 + seed*.8) + seed*50.)), 4.);   // slow pulses, never in sync
        vA = (.06 + blink) * uNight;
        vec4 mv = modelViewMatrix*vec4(p, 1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = max(${px}.*(.7 + .6*seed)*uPR*(8./-mv.z), 2.*uPR); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5)*2.; float a = exp(-d*d*10.) + exp(-d*d*2.6)*.3;
        gl_FragColor = vec4(uColor * a * vA * ${bright}, 1.); }` })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false; pts.layers.set(1); pts.visible = false; pts.renderOrder = 8
  scene.add(pts); aoHidden.push(pts)
  return pts
}

// moths: points on erratic orbits round each fire box, with a wingbeat size flicker; night only
export function buildMoths({ scene, uTime, fires, perFire = 5, aoHidden }) {
  const P = [], S = []
  for (const f of fires) for (let i = 0; i < perFire; i++) { P.push(f.x, f.y, f.z); S.push(Math.random(), Math.random(), Math.random(), Math.random()) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('seed', new THREE.Float32BufferAttribute(S, 4))
  const uK = { value: 0 }
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime, uK, uPx: { value: 800 } },
    vertexShader: `attribute vec4 seed; uniform float uTime, uPx; varying float vB;
      void main(){ float t = uTime, r = .16 + .22*seed.x, a = t*(1.4 + 2.2*seed.y)*(seed.z > .5 ? 1. : -1.) + seed.z*6.283;
        vec3 p = position + vec3(cos(a)*r + sin(t*3.1 + seed.w*9.)*.04, sin(t*(2.1 + seed.w*1.7) + seed.x*9.)*.15 + .04, sin(a*1.13)*r*.85);
        vec4 mv = viewMatrix*vec4(p, 1.); gl_Position = projectionMatrix*mv; vB = .55 + .45*abs(sin(t*37. + seed.x*20.));
        gl_PointSize = clamp(.024*uPx/-mv.z, 1., 6.)*vB; }`,
    fragmentShader: `uniform float uK; varying float vB; void main(){ float r = length(gl_PointCoord - .5)*2.;
        gl_FragColor = vec4(vec3(1., .88, .66)*(.6 + .4*vB), smoothstep(1., .35, r)*uK); }` })
  const moths = new THREE.Points(g, m); moths.frustumCulled = false; moths.layers.set(1); scene.add(moths); aoHidden.push(moths)
  return { moths, uK }
}

// one real point light jumps to the source nearest the camera and fades with distance.
// N point lights would add N light loops to EVERY shader.
export function stepNearestLight(light, fires, camera, k, t, reach = 40, intensity = 1.6) {
  let best = null, bd = reach
  for (const f of fires) { const d = f.distanceTo(camera.position); if (d < bd) { bd = d; best = f } }
  if (best && k > .003) {
    light.position.copy(best)
    light.intensity = intensity * k * (.94 + .06 * Math.sin(t * 5.1 + 2.4)) * (1 - THREE.MathUtils.smoothstep(bd, reach * .6, reach))   // full inside 60 % of reach, 0 at reach
  } else light.intensity = 0
}
