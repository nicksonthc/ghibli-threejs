// Waterfall: lip finder, parabolic sheet geometry, sheet shader, spray puffs with a 42° rainbow.
// Adapt: `terrainHeight(x, z)`, a basin { x, z, r } whose back wall faces −Z, `time` ({ value }),
// `sunDir` (TO the sun), `lit` (Color uniform: ~.35 at night → 1 by day). Add every mesh to your
// AO-hidden list and put spray on layer 1.
import * as THREE from 'three'

// the lip: from the basin, walk back up the notch wall until the ground is high AND levels off onto the plateau
export function findLip(terrainHeight, basin, x, minH = 4) {
  let z = basin.z - Math.sqrt(Math.max(0, basin.r ** 2 - ((x - basin.x) * .8) ** 2))
  for (let k = 0; k < 90 && (terrainHeight(x, z) < minH || terrainHeight(x, z - .4) - terrainHeight(x, z) > .12); k++) z -= .1
  return new THREE.Vector3(x, terrainHeight(x, z), z)
}

// one sheet: 3 "tongue" rows sliding to the lip along the ground, then NV rows falling on a parabola (out ∝ √drop)
export function sheetGeometry(terrainHeight, x0, lip, width, zOff, spread, bow, landZ, yBot = -.15) {
  const NU = 10, NV = 44, pos = [], uv = [], idx = [], throwZ = landZ - lip.z, top = lip.y + .05
  for (let j = 0; j <= NV + 3; j++) { const back = j < 3, v = back ? 0 : (j - 3) / NV
    for (let i = 0; i <= NU; i++) { const u = i / NU, x = x0 + (u - .5) * width * (1 + v * spread)
      if (back) { const z = lip.z - (3 - j) * .3 + zOff; pos.push(x, Math.max(top, terrainHeight(x, z) + .04), z); uv.push(u, -(3 - j) * .02) }
      else { pos.push(x, top - v * (top - yBot), lip.z + zOff + throwZ * Math.sqrt(v) + bow * (1 - (2 * u - 1) ** 2) * (.25 + .75 * v)); uv.push(u, v) } } }
  for (let j = 0; j < NV + 3; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
  return g
}

// L = [speed, alpha, streak density, seed]; layers used: back [.72,.38,.7,3.1], main [1,.82,1,0], front [1.4,.5,1.7,7.7]
export function sheetMaterial(L, time, lit) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLit: lit, uL: { value: new THREE.Vector4(...L) } },
    vertexShader: 'varying vec2 vUv;\n#include <fog_pars_vertex>\nvoid main(){ vUv = uv; vec4 mvPosition = modelViewMatrix*vec4(position, 1.); gl_Position = projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uLit; uniform vec4 uL; varying vec2 vUv;
      float h1(float n){ return fract(sin(n)*43758.5453); }
      float vn1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f); float a = h1(i.x + i.y*57.), b = h1(i.x + 1. + i.y*57.), c = h1(i.x + (i.y + 1.)*57.), d = h1(i.x + 1. + (i.y + 1.)*57.); return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
      #include <fog_pars_fragment>
      void main(){
        float v = max(vUv.y, 0.), x = vUv.x, f = sqrt(v)*2.4, sp = uTime*uL.x;            // √drop: streaks stretch as the water speeds up
        float streak = vn1(vec2(x*24.*uL.z + uL.w, f*3. - sp*2.4))*.5 + vn1(vec2(x*57.*uL.z + uL.w, f*7. - sp*3.6))*.3 + vn1(vec2(x*131.*uL.z, f*15. - sp*5.2))*.2;
        float aer = smoothstep(0., .2, v);                                                  // glassy at the lip, aerated below
        float fray = vn1(vec2(x*7. + uL.w, v*5. - sp*1.6));
        float edge = smoothstep(0., .1 + .18*fray*aer, x) * smoothstep(1., .9 - .18*fray*aer, x);
        float a = edge * mix(.55, .22 + .78*smoothstep(.28, .7, streak), aer);
        a *= 1. - smoothstep(.78, 1., v)*smoothstep(.3, .75, vn1(vec2(x*33., v*26. - sp*7.)));   // tears into spray at the foot
        a *= smoothstep(-.065, -.015, vUv.y);                                               // the tongue fades in behind the lip
        vec3 col = mix(vec3(.34, .54, .56), vec3(1.), clamp(aer*smoothstep(.35, .85, streak)*1.25 + v*.45, 0., 1.));
        col += .45*exp(-pow((vUv.y - .012)/.014, 2.));                                       // bright roll where it breaks over
        gl_FragColor = vec4(col*uLit, a*uL.y);
        #include <fog_fragment>
      }` })
}

// spray: instanced view-facing puffs from the strike line O = (x, 0, landZ, halfWidth); rainbow at ~41° from the antisolar point
export function sprayMesh({ time, lit, sunDir, day, O, count = 30, rand = Math.random }) {
  const g = new THREE.InstancedBufferGeometry(); g.copy(new THREE.PlaneGeometry(1, 1)); const sd = []
  for (let i = 0; i < count; i++) sd.push(rand() * 2 - 1, rand(), rand(), rand())
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(new Float32Array(sd), 4)); g.instanceCount = count
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uLit: lit, uSunDir: { value: sunDir }, uDay: day, uO: { value: O } },
    vertexShader: /* glsl */`attribute vec4 seed; uniform float uTime; uniform vec4 uO; varying vec2 vUv; varying vec3 vW; varying float vFade, vSeed;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vSeed = seed.w;
        float ph = fract(uTime*(.05 + .05*seed.z) + seed.w), sz = (.8 + ph*3.)*(.7 + .6*seed.z);
        vec3 c = uO.xyz + vec3(seed.x*uO.w*(1. + ph*.8) + sin(uTime*.3 + seed.w*9.)*.4, .1 + ph*ph*5.5 + seed.y*.4, seed.y*.8 + ph*4.2);
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), Up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vW = c + (R*position.x + Up*position.y)*sz;                          // world position of THIS corner
        vFade = smoothstep(0., .12, ph)*(1. - smoothstep(.5, 1., ph));
        vec4 mvPosition = viewMatrix*vec4(vW, 1.); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`uniform vec3 uLit, uSunDir; uniform float uDay; varying vec2 vUv; varying vec3 vW; varying float vFade, vSeed;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      #include <fog_pars_fragment>
      void main(){ vec2 p = vUv - .5; float r = length(p)*2., n = vn2(p*3.2 + vSeed*17.)*.6 + vn2(p*7.5 + vSeed*5.)*.4;
        float m = smoothstep(1., .1, r)*(.35 + .65*n)*vFade*smoothstep(-.2, .7, vW.y);         // thins out at the water: no hard line
        float th = acos(clamp(dot(normalize(vW - cameraPosition), -uSunDir), -1., 1.)), k = (th - .706)/.036;   // 40.4°..42.5°
        vec3 bow = clamp(abs(fract(vec3(1., 2./3., 1./3.) + (1. - clamp(k, 0., 1.))*.78)*6. - 3.) - 1., 0., 1.);  // violet in, red out
        float bw = smoothstep(-.4, .1, k)*smoothstep(1.4, .9, k)*uDay*smoothstep(.02, .15, uSunDir.y);
        gl_FragColor = vec4(mix(vec3(.96, .98, 1.)*uLit, bow*1.3, bw*.6), m*(.17 + .3*bw));   // the bow raises alpha too
        #include <fog_fragment>
      }` })
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.layers.set(1)
  return mesh
}

// Usage sketch:
//   const lip = findLip(terrainHeight, BASIN, BASIN.x), landZ = BASIN.z - BASIN.r*.45, W = 3
//   for (const [wk, zo, sp, bow, L] of LAYERS) scene.add(new THREE.Mesh(sheetGeometry(terrainHeight, BASIN.x, lip, W*wk, zo, sp, bow, landZ), sheetMaterial(L, time, lit)))
//   waterU.uFall.value.set(BASIN.x, landZ, W*.55, 1)   // rings + froth in the water shader
