// TEMPLATE (trimmed): far haze instead of scene fog, night glow, and the slow spin + bob of a floating island.
// ADAPT: uniform sources (sky mist / night colours), night.k (0 day .. 1 night), the material keys.
import * as THREE from 'three'

export const ISLE = { bob:[2.2, .07], spin:.004, haze:.08 }    // bob amplitude (m) and rad/s; spin rad/s; base wash
export const hazeU = { uHaze:{ value:ISLE.haze }, uMist:{ value:new THREE.Color(0xc9d6e2) }, uNightC:{ value:new THREE.Color(0x2a3550) }, uNightK:{ value:0 } }

// replaces #include <fog_fragment>: the far clouds' horizon mist by height, a distance wash, cleared when flown up close.
// Needs a world-position varying vWPos (the patch hook provides one).
export function islandHaze(sh, cloudMist = .35){
  Object.assign(sh.uniforms, hazeU)
  sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `{
      vec3 c = gl_FragColor.rgb;
      float low = 1. - smoothstep(30., 150., vWPos.y - length(vWPos.xz)*.06);
      float dc = distance(vWPos, cameraPosition), far = smoothstep(250., 620., dc), nearK = smoothstep(90., 330., dc);
      c = mix(c, uMist, ${cloudMist.toFixed(3)}*low*nearK);
      c = mix(c, uMist, .28*far);
      c = mix(c, uMist, uHaze*nearK);
      gl_FragColor.rgb = mix(c, uNightC, uNightK*(.45 + .55*nearK)); }`)   // night: toward the sky's mid tone, never the dark fog colour
    .replace('void main() {', 'uniform float uHaze, uNightK; uniform vec3 uMist, uNightC;\nvoid main() {')
}

// windows: emissive 0 by day, `strength` at night. Clones the material - so call it BEFORE patch().
export function glowAtNight(root, re, color, strength, list){
  root.traverse(o => { if (o.isMesh && re.test(o.name + ' ' + o.material.name)){
    o.material = o.material.clone(); o.material.emissive = new THREE.Color(color); o.material.emissiveIntensity = 0; list.push([o.material, strength]) } })
}

// lights that also burn by day: [material, day, night, pulse]. Crystal: keep it modest or bloom blows it out to white.
export function litTable(isle, prefix = 'island'){
  const lit = [], E = { hall:[0xffa24a, .9, 2.2, .04], glow:[0x3fe6d0, .9, 2.6, .35], fire:[0xff8a2a, 1.4, 3.2, .3] }
  isle.traverse(o => { if (!o.isMesh) return; const key = (o.material.name.match(new RegExp(`${prefix} ([a-z ]+)`)) || [])[1]?.trim(), e = E[key]
    if (e){ o.material.emissive = new THREE.Color(e[0]); lit.push([o.material, e[1], e[2], e[3]]) } })   // glTF emission is lost by toon conversion: set it here
  return lit
}

// pivot at the rim: bob, a slow turn with the faintest roll; paused while inspected, and the inspect camera rides the bob
export function stepIsland(L, t, { camera, controls, night, glows, inspecting }){
  L.pivot.position.y = L.y0 + Math.sin(t*ISLE.bob[1])*ISLE.bob[0]
  const dy = L.pivot.position.y - (L.lastY ?? L.pivot.position.y); L.lastY = L.pivot.position.y
  if (inspecting){ camera.position.y += dy; controls.target.y += dy }             // so the island holds still in frame
  const dt = Math.min(.1, t - (L.lastT ?? t)); L.lastT = t
  if (!inspecting) L.spin = (L.spin || 0) + dt*ISLE.spin
  L.pivot.rotation.set(Math.sin(t*.05)*.012, L.yaw0 + (L.spin || 0), Math.cos(t*.043)*.01)
  hazeU.uNightK.value = .38*night.k
  for (const [m, s] of glows) m.emissiveIntensity = s*night.k
  for (const [m, d, n, p] of L.lit) m.emissiveIntensity = (d + (n - d)*night.k)*(1 - p*.5 + p*.5*Math.sin(t*(p > .2 ? 2.1 : 9.) + d))
  // LOD: far away the plants drop to a sparse copy of their cards
  const far = camera.position.distanceTo(L.pivot.position) > 280
  if (far !== L.plantsFar){ L.plantsFar = far; for (const p of L.plants) p.mesh.geometry = far ? p.low : p.high }
}
