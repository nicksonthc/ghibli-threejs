// Weather as ONE eased wetness value. applySun writes the clean light/sky state; the weather
// captures it as a base and each frame writes `base × factors` — it never multiplies in place.
//
// ADAPT: sun / hemi / ambient lights, sky uniforms (day + night stops), cloud uniforms, star and
// god-ray uniforms, your fog, and `applyDay/applyNight`. The `var weatherReady` must be hoisted:
// applySun runs long before this module is evaluated (a `const`/`let` would throw in the TDZ).
import * as THREE from 'three'

export const WEATHER_MODES = { clear: 0, rain: .7, storm: 1 }
export const WEATHER = { mode: 'clear', rain: 0, density: 1, lightning: 5, wind: 1.4, fog: .016, dark: .75, light: 1, wet: .5, fade: 6 }
const base = {}, _c = new THREE.Color(), _c2 = new THREE.Color()

// ── in the sun module (runs early) ──
//   var weatherReady = false
//   function applySun(az, el){
//     if (weatherReady) weatherUndo()      // restore the clean base first: the night blend skips half its
//     applyDay(az, el); applyNight(k)      // writes in pure day and would otherwise capture storm-tinted values
//     if (weatherReady){ captureBase(); applyWeather() }
//   }

export function captureBase(S) {
  base.sun = S.sun.intensity; base.hemi = S.hemi.intensity; base.amb = S.ambient.intensity
  base.exp = S.renderer.toneMappingExposure
  base.sky = S.skyStops.map(u => u.value.clone())          // [dayTop, dayMid, dayHorizon, nightTop, nightMid, nightHorizon]
  base.cloud = S.cloudStops.map(u => u.value.clone())      // [lit, mid, shade]
  base.moon = S.moonBright.value; base.rays = S.rays.value; base.stars = S.stars.value
}
export function weatherUndo(S) {
  if (base.sun == null) return
  S.sun.intensity = base.sun; S.hemi.intensity = base.hemi; S.ambient.intensity = base.amb
  S.renderer.toneMappingExposure = base.exp
  S.skyStops.forEach((u, i) => u.value.copy(base.sky[i])); S.cloudStops.forEach((u, i) => u.value.copy(base.cloud[i]))
  S.moonBright.value = base.moon; S.rays.value = base.rays; S.stars.value = base.stars
}

export function applyWeather(S, flashK) {
  if (base.sun == null) captureBase(S)
  const r = WEATHER.rain
  const d = Math.min(1, r * 1.25) * WEATHER.dark            // how overcast: rain already greys a day, storm goes to ink
  S.sun.intensity = base.sun * (1 - .85 * d) * WEATHER.light // at only 29 % less sun a rainy day still looked sunny
  S.hemi.intensity = base.hemi * (1 - .25 * d) + flashK * 1.6
  S.ambient.intensity = base.amb * (1 - .2 * d) + flashK * .5
  S.renderer.toneMappingExposure = base.exp * (1 - .18 * d)
  const grey = [0x6f7880, 0x8a939a, 0xa3aaae, 0x10151f, 0x1a2230, 0x2a3240]   // slate by day, ink by night
  S.skyStops.forEach((u, i) => u.value.copy(base.sky[i]).lerp(_c.set(grey[i]), Math.min(1, d * 1.2)).lerp(_c2.set(0xd8deff), flashK * .5))
  S.cloudStops[0].value.copy(base.cloud[0]).lerp(_c.set(0x7a8290), d).lerp(_c2.set(0xf0f2ff), flashK * .8)
  S.cloudStops[1].value.copy(base.cloud[1]).lerp(_c.set(0x565d69), d)
  S.cloudStops[2].value.copy(base.cloud[2]).lerp(_c.set(0x2c313b), d)
  S.moonBright.value = base.moon * (1 - .8 * r)
  S.rays.value = base.rays * (1 - r)
  S.stars.value = base.stars * (1 - .92 * r)
  S.flash.intensity = flashK * 7                           // a cold DirectionalLight(0xdfe6ff) placed high
}

// fog: runs after the frame has set the base fog colour/density
export function weatherFog(fog, nightK, flashK) {
  const d = Math.min(1, WEATHER.rain * 1.25) * WEATHER.dark
  fog.density += WEATHER.rain * WEATHER.fog
  fog.color.lerp(_c.set(nightK > .5 ? 0x232a36 : 0x8c969d), d * .85).lerp(_c2.set(0xc7cff5), flashK * .45)
}

// lightning: Poisson strikes whose rate rises with the storm; multi-pulse flashes
export const bolt = { k: 0, t0: -99, pulses: [], next: 0 }
export function strike(t, flash, thunder) {
  bolt.t0 = t
  bolt.pulses = Array.from({ length: 2 + (Math.random() * 3 | 0) }, (_, i) => [i * .09 + Math.random() * .12, .6 + Math.random() * .4])
  flash.position.set((Math.random() - .5) * 80, 45, -20 - Math.random() * 40)
  thunder(1.2 + Math.random() * 2.2)                       // delayed rumble
}
export function stepWeather(dt, t, S) {
  const target = WEATHER_MODES[WEATHER.mode] ?? 0
  WEATHER.rain += THREE.MathUtils.clamp(target - WEATHER.rain, -dt / WEATHER.fade, dt / WEATHER.fade)
  const r = WEATHER.rain
  if (r > .75 && WEATHER.lightning > 0) {
    if (!bolt.next) bolt.next = t + 3 + Math.random() * 6   // seed from the live clock, not a small absolute value
    if (t > bolt.next) { strike(t, S.flash, S.thunder); bolt.next = t - Math.log(1 - Math.random()) * 60 / (WEATHER.lightning * (r - .7) / .3) }
  } else bolt.next = 0
  const age = t - bolt.t0; bolt.k = 0
  for (const [at, amp] of bolt.pulses) { const x = age - at; if (x > 0) bolt.k = Math.max(bolt.k, amp * Math.exp(-x * 14)) }
  if (age > 1.5) bolt.pulses = []
  S.uWind.value = S.baseWind * (1 + r * WEATHER.wind * (.75 + .25 * Math.sin(t * .37) + .15 * Math.sin(t * 1.3)))   // gusts
  S.uRain.value = r                                         // water rings + rock/terrain wetness read it
  if (r > 0 || bolt.k > 0 || WEATHER.touched) { applyWeather(S, bolt.k); WEATHER.touched = r > 0 || bolt.k > 0 }
}

// thunder: brown noise with a long tail through a low-pass, delayed after the flash
export function makeThunder(getCtx, gain = () => .55) {
  return delay => {
    const c = getCtx(); if (!c) return                        // only after a user gesture started audio
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { last = (last + .02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = last * 3.5 * Math.pow(1 - i / len, 1.6) * (i < c.sampleRate * .05 ? i / (c.sampleRate * .05) : 1) }
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain()
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 160 + Math.random() * 120; g.gain.value = gain()
    src.connect(lp).connect(g).connect(c.destination); src.start(c.currentTime + delay)
  }
}

// wet materials: darker, glossier. Take the list ONCE after models load; skip materials another
// system recolours (e.g. the night white-dim list).
let wetMats = null, wetLast = -1
export function applyWet(scene, w, { ready, skip = new Set(), exclude = new Set() }) {
  if (!wetMats && !ready) return
  if (!wetMats) { wetMats = []
    scene.traverse(o => { if (!o.isMesh || exclude.has(o)) return
      for (const m of [].concat(o.material)) if (m?.isMeshStandardMaterial && !m.transparent && !wetMats.some(e => e.m === m))
        wetMats.push({ m, r: m.roughness, c: m.color?.clone(), dim: !skip.has(m) }) }) }
  if (Math.abs(w - wetLast) < .01) return; wetLast = w
  for (const e of wetMats) { e.m.roughness = e.r * (1 - .5 * w); if (e.c && e.dim) e.m.color.copy(e.c).multiplyScalar(1 - .2 * w) }
}
