// Underwater extras: refracted light shafts, a camera-tiled bubble cloud, the wobble/cyan post pass,
// and the per-frame switch. Adapt: `scene`, `camera`, `renderer`, `composer`, `time` ({ value: s }),
// `sunDir` (normalised, TO the sun), `isDeepWater(x, z)` (where shafts may hang), `valueNoiseGLSL`
// (a GLSL string defining float vn(vec2)), and a seeded `rand()` (0..1).
import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

export function buildUnderwater({ scene, camera, renderer, time, sunDir, isDeepWater, valueNoiseGLSL, rand, area = { x: [-6, 6], z: [-9, 8] } }) {
  const underFX = new THREE.Group(); underFX.visible = false; scene.add(underFX)
  // shafts start at the surface and fall along the refracted sun direction (sin r = sin i / 1.33)
  const sinI = Math.hypot(sunDir.x, sunDir.z), sinR = sinI / 1.33, cosR = Math.sqrt(1 - sinR * sinR)
  const down = new THREE.Vector3(-sunDir.x / sinI * sinR, -cosR, -sunDir.z / sinI * sinR).normalize()
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: time, uColor: { value: new THREE.Color(0xbff5e6) }, uAxis: { value: down } },
    vertexShader: `attribute float seed; varying vec3 vN; varying vec3 vWP; varying float vSeed; varying vec2 vUv;
      void main(){ vSeed = seed; vUv = uv; vec4 wp = modelMatrix*vec4(position,1.); vWP = wp.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor, uAxis; varying vec3 vN; varying vec3 vWP; varying float vSeed; varying vec2 vUv;
      ${valueNoiseGLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        float core = pow(abs(dot(vN, V)), 3.) * (1. - pow(abs(dot(uAxis, V)), 4.));      // soft core, vanishes looking down the axis
        float depthFade = smoothstep(-.02, -.12, vWP.y) * smoothstep(-.9, -.25, vWP.y);
        float streak = .35 + .65*vn(vec2(vUv.x*9. + vSeed*40., uTime*.35 + vSeed*9.));
        float flick = .55 + .45*sin(uTime*1.3 + vSeed*21.);
        float dist = length(cameraPosition - vWP);
        gl_FragColor = vec4(uColor * core * depthFade * streak * flick * .16 * exp(-dist*.12), 1.); }`,
  })
  for (let i = 0; i < 46; i++) {
    const z = area.z[0] + rand() * (area.z[1] - area.z[0]), x = area.x[0] + rand() * (area.x[1] - area.x[0])
    if (!isDeepWater(x, z)) continue                                     // e.g. terrainHeight(x, z) < -0.2
    const L = 1.4, rad = .05 + rand() * .14
    const g = new THREE.CylinderGeometry(rad, rad * 1.8, L, 12, 1, true).translate(0, -L / 2, 0)
    g.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(rand()), 1))
    const m = new THREE.Mesh(g, shaftMat); m.position.set(x, 0, z)
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), down); m.renderOrder = 6
    underFX.add(m)
  }
  // bubbles: a 5 m cloud tiled around the camera, rising and wobbling, discarded above the surface
  const N = 260, pos = new Float32Array(N * 3), seed = new Float32Array(N)
  for (let i = 0; i < N; i++) { pos[i * 3] = (rand() - .5) * 5; pos[i * 3 + 1] = rand() * 1.2; pos[i * 3 + 2] = (rand() - .5) * 5; seed[i] = rand() }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
  const bm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: time, uCam: { value: camera.position }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float seed; uniform float uTime, uPR; uniform vec3 uCam; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime*(.10 + seed*.12), 1.2) - 1.1;            // rise from ~1 m down to the surface, respawn
        p.x += sin(uTime*2. + seed*50.)*.03; p.z += cos(uTime*1.7 + seed*31.)*.03;
        p.xz += floor((uCam.xz - p.xz)/5. + .5)*5.;                     // tile the cloud around the camera
        vA = smoothstep(-.02, -.1, p.y);
        vec4 mv = viewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
        gl_PointSize = (1.5 + seed*3.5) * uPR * (4./-mv.z); }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord-.5; float d = length(c);
      if (d > .5 || vA <= 0.) discard;
      float ring = smoothstep(.5,.38,d) * (.35 + .65*smoothstep(.25,.45,d)) + smoothstep(.2,.0,length(c-vec2(-.15,-.15)))*.8;
      gl_FragColor = vec4(vec3(.85,1.,.97)*ring*vA, ring*vA*.8); }` })
  const bubbles = new THREE.Points(bg, bm); bubbles.frustumCulled = false
  underFX.add(bubbles)
  return underFX
}

// Post pass: add after bloom, before your grade / OutputPass / SMAA.
export function makeUnderwaterPass(time) {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: time, uAmt: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAmt; varying vec2 vUv;
      void main(){
        vec2 uv = vUv + uAmt*vec2(sin(vUv.y*22. + uTime*1.6), cos(vUv.x*18. + uTime*1.3))*.0022;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        c = mix(c, c*vec3(.72,1.,1.04) + vec3(.0,.012,.016), uAmt);    // cyan grade
        float v = smoothstep(1.15, .25, length((vUv-.5)*vec2(1.2,1.)));
        c *= mix(1., .55 + .45*v, uAmt);                                 // heavier vignette
        gl_FragColor = vec4(c, 1.); }`,
  })
  pass.enabled = false
  return pass
}

// Per frame, between the pre-passes and composer.render():
//   const under = camera.position.y < waveHeight(x, z) && terrainHeight(x, z) < 0
//   refraction: if (!under) camera.layers.set(0)            // under: render everything (the world above)
//   reflection: waterClip[0].normal.set(0, under ? -1 : 1, 0)
//   if (under) { scene.fog.color.copy(UW_FOG); scene.fog.density = 0.17 }   // after the reflection pass
//   sky.visible = !under; underFX.visible = under; rays.visible = !under; stars.visible = !under
//   scene.background.copy(under ? UW_FOG : dayFog)
//   uwPass.enabled = under; uwPass.uniforms.uAmt.value = under ? 1 : 0
//
// Warm-up at the end of build(), before the loading screen lifts:
//   if (!new URLSearchParams(location.search).has('nowarm')) { goView('underwater', true); frame(performance.now()); goView('default', true); frame(performance.now()) }
