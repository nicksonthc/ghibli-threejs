// Over-under lens: when the camera sits at the surface, show half the frame above the water and half below, joined along the
// live waterline (a dark meniscus, a bright crest, a film of water clinging to the port above the line).
//
// Adapt: `renderer`, `camera`, `composer` (EffectComposer, final pass OutputPass/SMAA), `time` ({ value: s }),
// `waveHeight(x, z, t)` (the same wave sum the water shader draws), `terrainHeight(x, z)`, and your existing
// `renderWorld(under)` — the whole pre-pass + composer frame for one side of the surface (refraction, reflection with the
// flipped clip plane, fog/sky/underFX switches, composer.render()). The water shader must pick its face with gl_FrontFacing.
import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const SPLIT = { on: true, band: .30, underFar: 14 }   // band: metres of camera height (level pitch) over which the line sweeps the frame
                                                             // underFar: far plane for the under pass (FogExp2 .17 hides everything past ~12 m)
export function createOverUnderLens({ renderer, camera, composer, time, waveHeight, terrainHeight }) {
  const splitRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const quadVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`
  const copy = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: quadVS, fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }` }))
  const U = { tAbove: { value: null }, tUnder: { value: splitRT.texture }, uTime: time, uL: { value: 1 }, uA: { value: 1 }, uB: { value: 1 },
    uRy: { value: 0 }, uUy: { value: 1 }, uD: { value: [0, 0, 0, 0, 0] }, uPxK: { value: 1 } }
  const join = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: U, depthTest: false, depthWrite: false, vertexShader: quadVS,
    fragmentShader: /* glsl */`uniform sampler2D tAbove, tUnder; uniform float uTime, uL, uA, uB, uRy, uUy, uPxK; uniform float uD[5]; varying vec2 vUv;
      // metres above (+) or below (-) the water of the lens point behind this pixel
      float lensSide(vec2 n){
        float f = clamp((n.x + 1.)*2., 0., 3.999); int i = int(f);
        float d = mix(uD[i], uD[i+1], smoothstep(0., 1., fract(f)));        // the real waves, sampled across the lens on the CPU
        float lx = n.x*uA*uL;
        d += .005*sin(lx*37. + uTime*2.3) + .003*sin(lx*83. - uTime*3.4);    // fine chop licking the port
        return uL*(n.x*uA*uRy + n.y*uB*uUy) - d;
      }
      void main(){
        vec2 n = vUv*2. - 1.;
        float sd = lensSide(n), px = sd/max(fwidth(sd), 1e-6)/uPxK;           // signed distance to the waterline in 1080p pixels
        float film = smoothstep(26., 0., px)*step(0., px);                   // water clinging above the line: lensed, sagging toward it
        vec2 uvA = vUv + vec2(sin(vUv.x*60. + uTime*1.7)*.0015, -.012*film*film);
        vec3 above = texture2D(tAbove, mix(vUv, uvA, film)).rgb;
        vec3 under = texture2D(tUnder, vUv + vec2(0., .004*smoothstep(-20., 0., px)*step(px, 0.))).rgb;
        under += vec3(.16,.24,.24)*exp(-px*px/18.)*step(px, 0.);           // silvery underside right at the line
        vec3 c = mix(under, above, smoothstep(-1.2, 1.2, px));
        c *= 1. - .55*exp(-px*px/5.);                                        // meniscus: the dark lip where water meets glass
        c += vec3(.9,.95,1.)*.16*exp(-(px - 3.2)*(px - 3.2)/2.2);            // sky caught on its crest
        gl_FragColor = vec4(c, 1.);
      }` }))
  const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3()

  // null when the whole frame is on one side of the water; otherwise fills the join uniforms for this frame
  function lens(t) {
    if (!SPLIT.on) return null
    const c = camera.position
    if (terrainHeight(c.x, c.z) > -.25) return null                    // only where a camera below the surface fits
    camera.updateMatrixWorld(); camera.matrixWorld.extractBasis(_r, _u, _f)
    const B = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), A = B * camera.aspect, L = SPLIT.band / B
    const D = U.uD.value
    for (let i = 0; i < 5; i++) { const x = (i / 2 - 1) * A * L; D[i] = waveHeight(c.x + _r.x * x, c.z + _r.z * x, t) - c.y }
    let lo = Infinity, hi = -Infinity                                    // does the line cross the frame? test its edges
    for (const nx of [-1, -.5, 0, .5, 1]) for (const ny of [-1, 1]) {
      const f = Math.min(3.999, (nx + 1) * 2), i = f | 0, d = D[i] + (D[i + 1] - D[i]) * (f - i)
      const v = L * (nx * A * _r.y + ny * B * _u.y) - d; lo = Math.min(lo, v); hi = Math.max(hi, v) }
    if (lo > .01 || hi < -.01) return null
    U.uL.value = L; U.uA.value = A; U.uB.value = B; U.uRy.value = _r.y; U.uUy.value = _u.y
    U.uPxK.value = renderer.domElement.height / 1080
    return U
  }
  // where the composer left its last image when it is not drawing to the screen
  const composerOut = () => composer.passes.filter(p => p.enabled).at(-1).needsSwap ? composer.readBuffer.texture : composer.writeBuffer.texture

  // call in place of `renderWorld(under)` each frame
  function render(t, under, renderWorld) {
    if (!lens(t)) { composer.renderToScreen = true; renderWorld(under); return false }
    const c = camera.position, y0 = c.y, hw = waveHeight(c.x, c.z, t)
    composer.renderToScreen = false
    // the same lens nudged 6 cm to each side of the surface, so the water shader draws the right face in each pass
    const far = camera.far; camera.far = Math.min(far, SPLIT.underFar); camera.updateProjectionMatrix()
    c.y = Math.min(y0, hw - .06); renderWorld(true)
    camera.far = far; camera.updateProjectionMatrix()
    copy.material.uniforms.tDiffuse.value = composerOut(); renderer.setRenderTarget(splitRT); copy.render(renderer)
    c.y = Math.max(y0, hw + .06); renderWorld(false)
    c.y = y0; camera.updateMatrixWorld()
    U.tAbove.value = composerOut(); renderer.setRenderTarget(null); join.render(renderer)
    return true
  }
  // call from your resize(), with the drawing-buffer size
  const setSize = (w, h) => splitRT.setSize(w, h)
  return { render, lens, setSize, uniforms: U }
}

// Frame wiring (sketch):
//   const overUnder = createOverUnderLens({ renderer, camera, composer, time: U.uTime, waveHeight, terrainHeight })
//   // camera clamp: the lens handles the waterline itself wherever it can split, so only nudge off it elsewhere
//   if (bed < -.1 && !(SPLIT.on && bed <= -.25) && Math.abs(c.y - hw) < .05) c.y = hw + (c.y < hw ? -.05 : .05)
//   renderer.shadowMap.needsUpdate = true                 // one shadow update shared by both passes
//   overUnder.render(t, under, renderWorld)
//   // renderWorld must set rain.visible = rainOn && !under (and sky/stars/rays/underFX) explicitly, since it now runs twice a frame
