// Floating paper lanterns: ONE InstancedMesh for the paper + one for the wooden frame. Each
// lantern reads its own cell of a canvas atlas through an `aCell` instance attribute patched into
// the UV varyings. The atlas is both `map` and `emissiveMap`, so the handwriting stays dark on
// glowing paper. Redraw the atlas whenever the text source changes.
//
// ADAPT: `lines()` returns the strings to write (user notes, a guest book...), `wrapLine(ctx, text,
// maxW)` is any canvas word-wrapper, `uTime` your shared time uniform, `k` the night blend,
// `riverCenter(z)` / `waveHeight(x,z,t)` your path + water height. Layer 1 = out of the refraction
// pre-pass but still seen by the planar-reflection camera (the water mirrors the writing).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const COUNT = 9, COLS = 3, ROWS = Math.ceil(COUNT / COLS), CELL = [320, 384]
const SIZE = [0.3, 0.34]            // storybook scale (m)
const GLOW = 1.35                   // emissive gain: just over night's bloom threshold, ink stays dark
const FONT = '600 50px Caveat, cursive'

export function buildLanterns({ scene, uTime, lines, wrapLine }) {
  const [W, H] = SIZE, baseH = .04
  const cv = document.createElement('canvas'); cv.width = CELL[0] * COLS; cv.height = CELL[1] * ROWS
  const ctx = cv.getContext('2d'), tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4

  function draw() {
    const [CW, CH] = CELL, L = lines()
    for (let i = 0; i < COUNT; i++) {
      const ox = (i % COLS) * CW, oy = Math.floor(i / COLS) * CH
      const gr = ctx.createRadialGradient(ox + CW / 2, oy + CH * .58, 20, ox + CW / 2, oy + CH * .58, CH * .72)
      gr.addColorStop(0, '#fff6e2'); gr.addColorStop(.55, '#f7e3bb'); gr.addColorStop(1, '#d8ad72')   // washi, warm where the candle sits
      ctx.fillStyle = gr; ctx.fillRect(ox, oy, CW, CH)
      ctx.font = FONT; ctx.fillStyle = '#5b2614'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const rows = wrapLine(ctx, L[i % L.length], CW - 60).filter(Boolean).slice(0, 5)
      const lh = 56, y0 = oy + CH / 2 - (rows.length - 1) * lh / 2
      rows.forEach((row, k) => ctx.fillText(row, ox + CW / 2, y0 + k * lh, CW - 44))
    }
    tex.needsUpdate = true
  }

  // paper: four panels, each showing the whole cell (the line reads from every side)
  const paperGeo = mergeGeometries([0, 1, 2, 3].map(i => new THREE.PlaneGeometry(W, H).translate(0, baseH + H / 2, W / 2).rotateY(i * Math.PI / 2)))
  const cells = new Float32Array(COUNT * 2)
  for (let i = 0; i < COUNT; i++) cells.set([i % COLS, ROWS - 1 - Math.floor(i / COLS)], i * 2)
  paperGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2))
  const paperMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffa94d, emissiveIntensity: 0,
    roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  paperMat.userData.keepAlbedo = true                        // don't let the night white-dim touch it
  paperMat.customProgramCacheKey = () => 'lanternPaper'
  paperMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell; uniform float uTime; varying float vFlick;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = (uv + aCell) / vec2(${COLS}., ${ROWS}.); vEmissiveMapUv = vMapUv;
        { float s = dot(instanceMatrix[3].xz, vec2(1.7, 2.9)); vFlick = .88 + .07*sin(uTime*7.3 + s) + .05*sin(uTime*17.1 + s*2.3); }`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlick;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vFlick;')
  }
  const fw = W + .05, parts = [new THREE.BoxGeometry(fw, baseH, fw).translate(0, baseH / 2, 0)]
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(new THREE.BoxGeometry(.022, H + .02, .022).translate(sx * W / 2, baseH + H / 2, sz * W / 2))
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3121, roughness: .8, transparent: true, opacity: 0 })
  const paper = new THREE.InstancedMesh(paperGeo, paperMat, COUNT)
  const frames = new THREE.InstancedMesh(mergeGeometries(parts), frameMat, COUNT)
  for (const m of [paper, frames]) { m.frustumCulled = false; m.layers.set(1); m.visible = false; scene.add(m) }
  draw(); document.fonts?.load(FONT).then(draw).catch(() => {})

  const seeds = Array.from({ length: COUNT }, (_, i) => ({ a: Math.random(), b: Math.random(), c: Math.random(), yaw: Math.random() * 6.28, lane: -1.9 + ((i * .618) % 1) * 4.5 }))
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3()
  const Z = [-34, 16], SPEED = 0.16
  function step(t, k, riverCenter, waveHeight) {
    const on = k > .003; paper.visible = frames.visible = on
    if (on) {
      const span = Z[1] - Z[0]
      seeds.forEach((sd, i) => {
        const z = Z[0] + (((i + sd.a * .5) / COUNT) * span + t * SPEED * (.85 + .3 * sd.b)) % span
        const fade = THREE.MathUtils.smoothstep(z, Z[0], Z[0] + 3) * (1 - THREE.MathUtils.smoothstep(z, Z[1] - 3, Z[1]))
        const x = riverCenter(z) + sd.lane + .25 * Math.sin(t * .13 + sd.c * 6)
        p.set(x, waveHeight(x, z, t) - .012, z)
        q.setFromEuler(e.set(.035 * Math.sin(t * .9 + sd.a * 7), sd.yaw + t * .05 * (sd.b - .5), .035 * Math.sin(t * .8 + sd.b * 5)))
        m4.compose(p, q, s.setScalar(Math.max(fade, 1e-3))); paper.setMatrixAt(i, m4); frames.setMatrixAt(i, m4)
      })
      paper.instanceMatrix.needsUpdate = frames.instanceMatrix.needsUpdate = true
    }
    paperMat.opacity = frameMat.opacity = Math.min(1, k * 1.6)
    paperMat.emissiveIntensity = GLOW * k * (.94 + .06 * Math.sin(t * 5.3) * Math.sin(t * 3.1))
  }
  return { paper, frames, redraw: draw, step }
}
