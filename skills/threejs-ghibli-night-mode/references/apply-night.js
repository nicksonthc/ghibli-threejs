// applyNight(k): one function lerps every live value from the day state (just written by
// applySun/applyDay) toward the night constants in NP. k = 0 day, 1 night. Called from the same
// place the sun update runs, so the ☾ toggle's fade, the Night Tune panel and any day cycle all go
// through it. Moonrise starts on the first frame with k > 0.
//
// ADAPT: rename the handles (sun, hemi, ambient, skyU, cloudU, waterU, grade, bloom, stars,
// fishMats, U = shared uniforms). Everything not present in your scene: delete the line.
import * as THREE from 'three'
const lerp = THREE.MathUtils.lerp, _c = new THREE.Color(), _c2 = new THREE.Color()

export const night = { on: false, k: 0, last: -1, rise: null }
const MOONRISE_SECONDS = 18, MOONRISE_FROM_DEG = -6, MOON_LIGHT_MIN_DEG = 10

// white-ish standard materials get dimmed at night (collect once, after models load)
export const albedo = []
export function collectAlbedo(scene, skip = new Set()) {
  const seen = new Set()
  scene.traverse(o => {
    if (!o.isMesh || skip.has(o)) return
    const perInstance = o.isInstancedMesh && o.instanceColor
    ;[].concat(o.material).forEach(m => {
      if (!m || seen.has(m) || !m.isMeshStandardMaterial || m.vertexColors || perInstance || m.userData.keepAlbedo) return
      seen.add(m)
      const lum = m.color.r * .2126 + m.color.g * .7152 + m.color.b * .0722
      const w = THREE.MathUtils.smoothstep(lum, .45, .85)
      if (w > 0) albedo.push([m, m.color.clone(), w])
    })
  })
}

export function applyNight(k, S /* scene handles */, NP /* night params */, DAY /* day params */) {
  const nowS = performance.now() / 1000
  if (k > 0 && night.rise == null) night.rise = nowS
  if (k === 0) night.rise = null
  const riseK = night.rise == null ? 1 : Math.min(1, (nowS - night.rise) / MOONRISE_SECONDS)
  const riseE = 1 - Math.pow(1 - riseK, 3)                               // cubic-out climb
  const elDeg = lerp(MOONRISE_FROM_DEG, NP.moonEl, riseE)
  const a = THREE.MathUtils.degToRad(NP.moonAz), e = THREE.MathUtils.degToRad(elDeg)
  S.skyU.uMoonDir.value.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize()
  const eL = THREE.MathUtils.degToRad(Math.max(elDeg, MOON_LIGHT_MIN_DEG)) // never light from under the horizon
  const moonLightDir = new THREE.Vector3(Math.sin(a) * Math.cos(eL), Math.sin(eL), -Math.cos(a) * Math.cos(eL)).normalize()

  const wasNight = night.last > 0; night.last = k
  S.U.uNight.value = k
  S.renderer.toneMappingExposure = lerp(DAY.exposure, NP.exposure, k)   // ~0.9 day → ~1.15 night
  if (k === 0 && !wasNight) return        // pure day: leave the day panel's live edits alone

  // 1) the directional light slides from the sun to the moon; every sun-driven shader follows
  S.sunDir.lerp(moonLightDir, k).normalize(); S.placeSun()
  S.sun.color.lerp(_c.set(NP.moonColor), k)
  S.sun.intensity = lerp(S.sun.intensity, NP.moonIntensity, k)         // ≤ ~0.55
  // absolute values, never `*=` (applyNight runs every frame)
  S.rays.uStrength.value = lerp(DAY.rays, DAY.rays * NP.rays, k)
  S.cloudU.uLit.value.set(DAY.cloudLit).lerp(_c.set(NP.cloudLit), k)
  S.scene.fog.color.set(DAY.fog).lerp(_c2.set(NP.fog), k)
  S.scene.environmentIntensity = lerp(DAY.env, NP.env, k)               // RoomEnvironment is a bright studio

  // 2) fill light: indigo sky, purple ground, purple shadow fill, cyan foliage backlight
  S.hemi.color.set(DAY.hemiSky).lerp(_c.set(NP.hemiSky), k)
  S.hemi.groundColor.set(DAY.hemiGround).lerp(_c.set(NP.hemiGround), k)
  S.hemi.intensity = lerp(DAY.hemiIntensity, NP.hemiIntensity, k)
  S.U.uSssColor.value.set(DAY.sssColor).lerp(_c.set(NP.sssColor), k)
  S.U.uCausticSoft.value = NP.causticSoft * k

  // 3) water: absorption eats red+green, dim refraction, reflection floor, silver glints
  S.waterU.uAbsorb.value.set(...DAY.absorb).lerp(new THREE.Vector3(...NP.absorb).multiplyScalar(NP.absorbK), k)
  S.waterU.uRefrDim.value = lerp(1, NP.refractDim, k)       // ≥ ~0.65; below ~0.5 the fish vanish
  S.waterU.uReflMin.value = NP.reflectMin * k               // F = max(F, uReflMin)
  S.waterMat.roughness = lerp(.11, NP.roughness, k)         // ~0.2: never < 0.12 (glint blobs)

  // 4) creatures: wet clearcoat + bioluminescence
  S.fishMats.forEach(m => { m.clearcoat = lerp(.9, 1, k); m.clearcoatRoughness = lerp(.12, .05, k) })
  S.U.uBio.value = NP.bio * k
  albedo.forEach(([m, c, w]) => m.color.copy(c).multiplyScalar(lerp(1, NP.whiteDim, k * w)))

  // 5) grade + bloom + stars
  S.grade.uniforms.uMidTint.value.set(0xffffff).lerp(_c.set(NP.gradeMid), k)
  S.grade.uniforms.uSat.value = lerp(DAY.saturation, NP.saturation, k)
  S.bloom.threshold = lerp(DAY.bloomThreshold, NP.bloomThreshold, k)
  S.bloom.strength = lerp(DAY.bloom, NP.bloomStrength, k)
  if (S.stars) S.stars.material.uniforms.uNight.value = k * NP.starBright
}

// per-frame fade (4 s). Keep calling applySun while the moon is still climbing.
export function stepNight(dt, applySun, fadeSeconds = 4) {
  const target = night.on ? 1 : 0
  if (night.k === target) {
    if (night.rise != null && performance.now() / 1000 - night.rise < MOONRISE_SECONDS + .2) applySun()
    return
  }
  night.k = THREE.MathUtils.clamp(night.k + Math.sign(target - night.k) * dt / fadeSeconds, 0, 1)
  if (Math.abs(night.k - target) < 1e-3) night.k = target
  applySun()   // applySun writes the day state, then calls applyNight(night.k)
}
