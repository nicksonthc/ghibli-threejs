// Water render passes: slope map, refraction/reflection targets, mirror camera, per-frame order.
// Adapt: `renderer`, `scene`, `camera`, `composer`, `water` (the mesh), `waterU` (its uniforms, see
// water-material.glsl.js), `hash2(x, y)` (any deterministic 0..1 hash). Resize the targets in your
// resize handler (reflection at half resolution) and set waterU.uRes / uNear / uFar to match.
import * as THREE from 'three'

// ── A tileable ripple slope map (mipmapped, so distant water calms instead of aliasing into noise) ──
export function makeWaterSlopeMap(renderer, hash2) {
  const N = 512, H = new Float32Array(N * N)
  const oct = [[4, 1], [8, .55], [16, .32], [32, .17], [64, .09]]
  const pn = (x, y, P) => {                                    // periodic value noise (period P cells)
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
    const h = (a, b) => hash2(((a % P) + P) % P + P * 31, ((b % P) + P) % P - P * 17)
    const a0 = h(ix, iy), b0 = h(ix + 1, iy), c0 = h(ix, iy + 1), d0 = h(ix + 1, iy + 1)
    return a0 + (b0 - a0) * ux + (c0 - a0) * uy + (a0 - b0 - c0 + d0) * ux * uy
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let v = 0
    for (const [P, A] of oct) { const n = pn(i / N * P, j / N * P, P); v += A * (P <= 8 ? n : 1 - Math.abs(2 * n - 1)) }  // soft swells + ridged crests
    H[j * N + i] = v
  }
  const data = new Uint8Array(N * N * 4), k = 18
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = H[j * N + (i + 1) % N] - H[j * N + (i - 1 + N) % N], dz = H[((j + 1) % N) * N + i] - H[((j - 1 + N) % N) * N + i]
    const o = (j * N + i) * 4
    data[o] = THREE.MathUtils.clamp(128 + dx * k * 127, 0, 255); data[o + 1] = THREE.MathUtils.clamp(128 + dz * k * 127, 0, 255); data[o + 2] = 255; data[o + 3] = 255
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true
  return t
}

// ── Targets ──
export const refractRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) })
export const reflectRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })   // size it at half resolution
export const mirrorCam = new THREE.PerspectiveCamera()
mirrorCam.layers.enableAll()
export const waterClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.015)]   // keep only what is above the surface

// ── Mirror the camera through the plane y = 0 (the Reflector.js construction) ──
const _m = { rot: new THREE.Matrix4(), look: new THREE.Vector3(), pos: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0) }
export function updateMirror(camera, waterU) {
  camera.updateMatrixWorld()
  _m.rot.extractRotation(camera.matrixWorld)
  _m.pos.copy(camera.position); _m.pos.y = -_m.pos.y
  _m.look.set(0, 0, -1).applyMatrix4(_m.rot).add(camera.position); _m.look.y = -_m.look.y
  mirrorCam.position.copy(_m.pos)
  mirrorCam.up.set(0, 1, 0).applyMatrix4(_m.rot).reflect(_m.n)
  mirrorCam.lookAt(_m.look)
  mirrorCam.near = camera.near; mirrorCam.far = camera.far
  mirrorCam.updateMatrixWorld()
  mirrorCam.projectionMatrix.copy(camera.projectionMatrix)
  waterU.uReflMat.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
    .multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse)
}

// ── Per-frame order (call from your animation loop) ──
// `under` = camera below the surface (see the underwater skill); `aoHidden` = transparent things the AO pass must not see.
export function renderWater({ renderer, scene, camera, composer, water, waterU, under = false, aoHidden = [] }) {
  renderer.shadowMap.needsUpdate = true                        // with shadowMap.autoUpdate = false: one shadow render for all passes
  water.visible = false; aoHidden.forEach(o => o.visible = false)
  // 1) refraction: from above only layer 0 (above-water foliage lives on layer 1); from below the whole world above
  if (!under) camera.layers.set(0)
  renderer.setRenderTarget(refractRT); renderer.render(scene, camera)
  camera.layers.enable(1)
  // 2) planar reflection: above → banks and sky; below → the bed (total internal reflection)
  updateMirror(camera, waterU)
  waterClip[0].normal.set(0, under ? -1 : 1, 0)
  renderer.clippingPlanes = waterClip
  renderer.setRenderTarget(reflectRT); renderer.render(scene, mirrorCam)
  renderer.clippingPlanes = []
  renderer.setRenderTarget(null)
  water.visible = true; aoHidden.forEach(o => o.visible = true)
  // 3) main pass
  composer.render()
}
