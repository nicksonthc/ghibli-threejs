// Meadow grass: V-folded blades with real normals, planted as tussocks, instanced per 16 m cell.
// Adapt: GRASS_COUNT, the scatter area, terrainHeight(x,z), excluded(x,z), fbm(x,z) (any 2D noise 0..1),
// rand (seeded RNG), and `patch` from threejs-ghibli-toon-shading/references/ghibli-patch.js.
import * as THREE from 'three'

export function bladeGeometry(){
  const rows = [0, .3, .58, .82], pos = [], col = [], idx = []
  const base = new THREE.Color(0x1f3f0d), mid = new THREE.Color(0x528c22), tip = new THREE.Color(0x8fc44c), c = new THREE.Color()
  for (const t of rows){
    const w = .043*(1 - t*.74)*(t < .12 ? .8 + t*1.6 : 1), bend = t*t*.26, fold = w*.45   // ~8.6 cm wide at the base (storybook)
    pos.push(-w, t, bend,  0, t, bend + fold,  w, t, bend)                                  // midrib raised → a shallow V
    c.copy(base).lerp(mid, Math.min(1, t/.55)); if (t > .55) c.copy(mid).lerp(tip, (t - .55)/.45)
    for (let k=0;k<3;k++) col.push(c.r, c.g, c.b)
  }
  pos.push(0, 1, .26 + .012); col.push(tip.r, tip.g, tip.b)                              // pointed tip
  for (let i=0;i<rows.length-1;i++){ const a = i*3, b = a+3; idx.push(a,a+1,b+1, a,b+1,b,  a+1,a+2,b+2, a+1,b+2,b+1) }
  const T = rows.length*3, L = (rows.length-1)*3; idx.push(L,L+1,T, L+1,L+2,T)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals()                                               // real normals: no flat two-tone slabs
  return g
}

const GRASS = { droop:.2, skyNormal:.18, sss:.3, sssColor:0xd9f07c, dryTips:.22, veins:.12 }
export const GRASS_SHADER = {
  wind:'position.y*position.y*.16', sss:true, fill:true,                                   // no `toon`: blades band into one flat tone
  uniforms:{ uSss:{ value:GRASS.sss }, uSssColor:{ value:new THREE.Color(GRASS.sssColor) } },
  // per-blade seed from the instance position (no extra attribute) → droop and dry-tip selection.
  vertexPars:'varying float vBladeSeed;', fragmentPars:'varying float vBladeSeed;',
  vertexBegin:`#ifdef USE_INSTANCING
      vBladeSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233)))*43758.5453);
    #else
      vBladeSeed = .5;
    #endif
    transformed.z += position.y*position.y*vBladeSeed*${GRASS.droop.toFixed(2)};
    transformed.y -= position.y*position.y*vBladeSeed*${(GRASS.droop*.3).toFixed(3)};`,
  color:`{ float gt = clamp(vLocal.y, 0., 1.);
    diffuseColor.rgb *= 1. - ${GRASS.veins.toFixed(2)}*smoothstep(.25, .75, vn(vec2(vLocal.x*260., gt*6. + vBladeSeed*40.)));
    float dry = smoothstep(.72, 1., gt)*step(1. - ${GRASS.dryTips.toFixed(2)}, vBladeSeed);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.62, .55, .26)*dot(diffuseColor.rgb, vec3(.9)), dry*.7);
    diffuseColor.rgb *= mix(.38, 1., smoothstep(0., .4, gt)); }`,                           // darker foot
  // small blend toward the sky: >.5 makes the meadow flat pale lime from above
  normal:`normal = normalize(mix(normal, normalize((viewMatrix*vec4(0., 1., 0., 0.)).xyz), ${GRASS.skyNormal.toFixed(2)}));`,
}

export function buildGrass(scene, { count, rand, terrainHeight, excluded, fbm, patch, center = [1, -1] }){
  const mat = patch(new THREE.MeshStandardMaterial({ vertexColors:true, side:THREE.DoubleSide, roughness:.72 }), GRASS_SHADER)
  const geo = bladeGeometry(), items = []
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color()
  let tries = 0
  while (items.length < count && tries++ < count*40){
    const x = -32 + rand()*66, z = -42 + rand()*60
    const dd = Math.hypot(x - center[0], (z - center[1])*.9)
    if (rand() > .22 + .78*Math.exp(-((dd/11)**2))) continue           // radial falloff: no box boundary
    const h = terrainHeight(x, z); if (h < .1 || excluded(x, z)) continue
    if (fbm(x*.4, z*.4) < .32 && rand() < .6) continue                  // patchy, painterly meadow
    const tall = .22 + rand()*.38*(.6 + fbm(x*.3 + 5, z*.3)), hue = .22 + rand()*.08, sat = .55 + rand()*.25, lit = .38 + rand()*.22
    for (let k = 0, nk = 2 + (rand()*4|0); k < nk && items.length < count; k++){   // a tussock of 2–5 blades
      const a = rand()*Math.PI*2, rr = rand()*.09, hgt = tall*(.7 + rand()*.45)
      q.setFromEuler(new THREE.Euler(.05 + rand()*.28, a, (rand() - .5)*.15, 'YXZ'))   // yaw outward, then lean (≤ .33 rad)
      s.set(.8 + rand()*.6, hgt, 1); p.set(x + Math.sin(a)*rr, h - .02, z + Math.cos(a)*rr)
      c.setHSL(hue + (rand() - .5)*.02, sat, lit*(.9 + rand()*.2))
      items.push([new THREE.Matrix4().compose(p, q, s), c.clone()])
    }
  }
  const cells = new Map()                                              // spatial batches → frustum culling
  for (const it of items){ const e = it[0].elements, k = `${Math.floor(e[12]/16)},${Math.floor(e[14]/16)}`; (cells.get(k) || cells.set(k, []).get(k)).push(it) }
  for (const list of cells.values()){
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach(([m, col], i) => { im.setMatrixAt(i, m); im.setColorAt(i, col) })
    im.receiveShadow = true; im.layers.set(1); im.computeBoundingSphere(); im.boundingSphere.radius += .4
    scene.add(im)
  }
}
