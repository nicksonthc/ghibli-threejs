// Anime post chain: RenderPass → half-res GTAO (additive/transparent things hidden) → UnrealBloom (linear-HDR
// threshold) → grade (linear, before tone mapping) → OutputPass → SMAA LAST. three r186 addons.
// Adapt: constants, the aoHidden / aoOnly lists (push every shaft, mote, cloud, mist, foam, petal, hover ring),
// and GRADE_FRAG from anime-grade.glsl. Set renderer.toneMapping = THREE.ACESFilmicToneMapping, exposure ≈ .9.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'

export const POST = {
  bloomStrength:.42, bloomRadius:.55, bloomThreshold:1.05,   // ≈ .85 on screen: bloom reads LINEAR HDR before ACES
  saturation:1.18, warmth:.05, vignette:.28,
  hiTint:0xffe2bf, shTint:0x8ec6cf, split:.35, splitAmt:.42,
}
export const aoHidden = []   // hidden from AO (and from any depth/refraction pre-pass)
export const aoOnly = []     // hidden from AO only (e.g. stars: the water's mirror camera must still see them)

export function buildComposer(renderer, scene, camera, GRADE_FRAG){
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type:THREE.HalfFloatType }))
  composer.addPass(new RenderPass(scene, camera))

  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight)
  gtao.blendIntensity = .85
  gtao.updateGtaoMaterial({ radius:.35, distanceExponent:1.2, thickness:1.2, scale:1, samples:8 })
  gtao.updatePdMaterial({ samples:8, rings:2, radius:6 })
  const setSize = gtao.setSize.bind(gtao)
  gtao.setSize = (w, h) => setSize(Math.ceil(w/2), Math.ceil(h/2))       // half-res: soft contact shadows don't need more
  const render = gtao.render.bind(gtao)
  gtao.render = (...args) => {                                          // AO must only see solid surfaces
    aoHidden.forEach(o => o.visible = false); aoOnly.forEach(o => o.visible = false)
    const mask = camera.layers.mask; camera.layers.set(0)               // fine foliage on layer 1 skipped too
    render(...args)
    camera.layers.mask = mask
    aoHidden.forEach(o => o.visible = true); aoOnly.forEach(o => o.visible = true)
  }
  composer.addPass(gtao)

  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold)
  composer.addPass(bloom)

  const grade = new ShaderPass({
    uniforms:{ tDiffuse:{ value:null }, uSat:{ value:POST.saturation }, uWarm:{ value:POST.warmth }, uVig:{ value:POST.vignette },
      uHiTint:{ value:new THREE.Color(POST.hiTint) }, uShTint:{ value:new THREE.Color(POST.shTint) }, uMidTint:{ value:new THREE.Color(0xffffff) },
      uSplit:{ value:POST.split }, uSplitAmt:{ value:POST.splitAmt } },
    vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:GRADE_FRAG,
  })
  // (an optional underwater ShaderPass goes here, enabled only below the surface)
  composer.addPass(grade)
  composer.addPass(new OutputPass())
  composer.addPass(new SMAAPass())   // AFTER tone mapping: on HDR input SMAA prints dark specks on bright highlights

  const resize = () => {
    const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio()
    renderer.setSize(w, h); composer.setPixelRatio(pr); composer.setSize(w, h)
    camera.aspect = w/h; camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize); resize()
  return { composer, gtao, bloom, grade }
}

// Tone white albedos down so they don't bloom into blobs (day ×.6; a night pass may go to ×.4):
export function toneWhites(root, k = .6){
  root.traverse(o => { if (!o.isMesh) return
    for (const m of [o.material].flat()){
      if (!m.isMeshStandardMaterial || m.vertexColors) continue
      const c = m.color, lum = .2126*c.r + .7152*c.g + .0722*c.b
      if (lum > .5) c.multiplyScalar(k) } })
}
