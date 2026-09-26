// Falling sakura petals: one instanced quad (1440 instances) animated fully on the GPU. Twice a second the CPU
// hands the 8 crowns nearest the camera to the shader; each petal spawns inside a crown, falls, drifts downwind,
// flutters, tumbles, and lies flat once it lands. Size for the scene: 3.5–4.5 cm (a real 1.5 cm petal is 3 px at 5 m).
// Adapt: CROWNS = [[x, crownCentreY, z, crownRadius, groundY], …] gathered wherever sakura are placed (crafted,
// far and blob trees alike); U.uTime/uWind/uSunDir shared uniforms; hide the mesh from the AO pass.
import * as THREE from 'three'

export function buildPetals(scene, U, CROWNS, rand, { n = 1440, crowns = 8, reach = 60 } = {}){
  const c = document.createElement('canvas'); c.width = c.height = 64; const g2 = c.getContext('2d')   // notched oval, pink flush at the base
  const grad = g2.createLinearGradient(0, 60, 0, 4); grad.addColorStop(0, '#f2b9ca'); grad.addColorStop(.45, '#fff2f5'); grad.addColorStop(1, '#ffffff')
  g2.fillStyle = grad; g2.beginPath(); g2.moveTo(32, 62); g2.bezierCurveTo(6, 44, 8, 10, 24, 5); g2.quadraticCurveTo(32, 12, 40, 5); g2.bezierCurveTo(56, 10, 58, 44, 32, 62); g2.fill()
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace

  const geo = new THREE.InstancedBufferGeometry(); geo.copy(new THREE.PlaneGeometry(1, 1))
  const sd = []; for (let i = 0; i < n; i++) sd.push(rand(), rand(), rand(), rand())
  geo.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(sd), 4)); geo.instanceCount = n
  const mat = new THREE.ShaderMaterial({ alphaTest:.5, side:THREE.DoubleSide, fog:true,
    uniforms:{ ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime:U.uTime, uWind:U.uWind, uSunDir:U.uSunDir, tPetal:{ value:tex },
      uCrown:{ value:Array.from({ length:crowns }, () => new THREE.Vector4()) }, uGround:{ value:new Array(crowns).fill(0) } },
    vertexShader:/* glsl */`attribute vec4 seed; uniform float uTime, uWind; uniform vec4 uCrown[${crowns}]; uniform float uGround[${crowns}];
      varying vec2 vUv; varying vec3 vN; varying float vTint;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vTint = seed.y;
        int ci = int(seed.x*${crowns}.); vec4 C = uCrown[ci]; float gy = uGround[ci];
        if (C.w <= 0.){ gl_Position = vec4(2., 2., 2., 1.); return; }                       // empty slot: off-screen
        float sp = .42 + .32*seed.y, life = (C.y + C.w - gy)/sp + 3., ph = fract(uTime/life + seed.z), tt = ph*life;
        vec3 p = C.xyz + (vec3(fract(seed.w*13.1), fract(seed.w*7.7), fract(seed.w*3.3)) - .5)*2.*C.w*vec3(1., .55, 1.);
        p.y -= sp*tt; p.xz += vec2(.55, .35)*uWind*tt*.5 + vec2(sin(tt*2.1 + seed.w*9.), cos(tt*1.7 + seed.z*7.))*.3;
        float landed = step(p.y, gy + .012); p.y = max(p.y, gy + .012);
        float a = tt*(2.2 + 3.*seed.y) + seed.w*6.3, b = tt*(1.4 + 2.*seed.z) + seed.x*4.;
        mat3 Ry = mat3(cos(a), 0., -sin(a), 0., 1., 0., sin(a), 0., cos(a)), Rx = mat3(1., 0., 0., 0., cos(b), sin(b), 0., -sin(b), cos(b));
        mat3 R = landed > .5 ? Ry : Ry*Rx;                                                   // tumbling in the air, flat once down
        vec3 corner = R*vec3(position.x*.042, 0., position.y*.052);
        vN = R*vec3(0., 1., 0.);
        float vis = smoothstep(0., .03, ph)*(1. - smoothstep(.94, 1., ph));
        vec4 mvPosition = viewMatrix*vec4(p + corner*vis, 1.); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:/* glsl */`uniform sampler2D tPetal; uniform vec3 uSunDir; varying vec2 vUv; varying vec3 vN; varying float vTint;
      #include <fog_pars_fragment>
      void main(){ vec4 t = texture2D(tPetal, vUv); if (t.a < .5) discard;
        vec3 base = t.rgb*mix(vec3(1., .84, .9), vec3(.97, .72, .82), vTint);
        float l = .55 + .35*abs(dot(normalize(vN), uSunDir)) + .15*max(uSunDir.y, 0.);        // thin petal: lit from either side
        gl_FragColor = vec4(base*l, 1.);
        #include <fog_fragment>
      }` })
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.layers.set(1); scene.add(mesh)

  let last = -1
  return function stepPetals(t, camera){                                                   // call every frame; updates at 2 Hz
    if (t - last < .5) return; last = t
    const near = CROWNS.map(c => [c, Math.hypot(c[0] - camera.position.x, c[2] - camera.position.z)])
      .filter(a => a[1] < reach).sort((a, b) => a[1] - b[1]).slice(0, crowns)
    const u = mat.uniforms
    for (let i = 0; i < crowns; i++){ const c = near[i]?.[0]
      if (c){ u.uCrown.value[i].set(c[0], c[1], c[2], c[3]); u.uGround.value[i] = c[4] } else u.uCrown.value[i].w = 0 }
  }
}
// Add a static carpet under each crown too: ~55 small PlaneGeometry(.034,.042) instances per crown, tinted per
// instance, culled per 32 m cell.
