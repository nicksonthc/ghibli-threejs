// Curvilinear terrain strip streamed in chunks + camera-following water grid + shadow frustum that follows the view.
// ADAPT: riverCenter/terrainHeight/WORLD come from world-sdf.js; terMat, waterMat, sun, sunDir, controls, camera from your scene.
import * as THREE from 'three'
import { WORLD, riverCenter, terrainHeight } from './world-sdf.js'

// columns: dense near the water (0.34 m), opening out to ~2 m on the far hills, mirrored either side
const TER_U = (() => { const u = [0]; let x = 0
  while (x < WORLD.half){ x += .34 + Math.max(0, x - 28)*.045; u.push(Math.min(x, WORLD.half)) }
  return [...u.slice(1).reverse().map(v => -v), ...u] })()
const TER_DZ = .45, TER_CHUNK = 20, TER_DRAW = 200
export const terChunks = []   // { z0, z1, cx, cz, mesh }

// Rows sit at x = riverCenter(z) + u, so neighbouring chunks share edge vertices exactly however the river bends.
// One hidden row either side lends its neighbours to computeVertexNormals, then is dropped → seams match.
function terrainChunkGeometry(z0, z1){
  const nu = TER_U.length, n = Math.round((z1 - z0)/TER_DZ), rows = n + 3, P = new Float32Array(rows*nu*3), I = []
  for (let j = 0; j < rows; j++){ const z = z0 + (j - 1)*(z1 - z0)/n, c = riverCenter(z)
    for (let i = 0; i < nu; i++){ const x = c + TER_U[i], k = (j*nu + i)*3; P[k] = x; P[k + 1] = terrainHeight(x, z); P[k + 2] = z } }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < nu - 1; i++){ const a = j*nu + i, b = a + 1, c = a + nu, d = c + 1; I.push(a, c, b, b, c, d) }
  const full = new THREE.BufferGeometry(); full.setAttribute('position', new THREE.BufferAttribute(P, 3)); full.setIndex(I); full.computeVertexNormals()
  const pos = P.slice(nu*3, (n + 2)*nu*3), nrm = full.attributes.normal.array.slice(nu*3, (n + 2)*nu*3), idx = []
  for (let j = 0; j < n; j++) for (let i = 0; i < nu - 1; i++){ const a = j*nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, c, b, b, c, d) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setIndex(idx)
  g.computeBoundingSphere(); full.dispose(); return g
}

export function initTerrain(scene, terMat, home = { z0:-140, z1:60 }){
  for (let z = WORLD.zMin; z < WORLD.zMax; z += TER_CHUNK){ const z1 = Math.min(WORLD.zMax, z + TER_CHUNK), cz = (z + z1)/2
    terChunks.push({ z0:z, z1, cz, cx:riverCenter(cz), mesh:null }) }
  const build = ch => { ch.mesh = new THREE.Mesh(terrainChunkGeometry(ch.z0, ch.z1), terMat); ch.mesh.receiveShadow = true; scene.add(ch.mesh) }
  terChunks.filter(c => c.z1 > home.z0 && c.z0 < home.z1).forEach(build)   // the home reach is there from the first frame
  // per frame: draw only what is near; build the missing chunks nearest the camera first, two per frame
  return function stepTerrain(camera){
    for (const ch of terChunks) if (ch.mesh) ch.mesh.visible = Math.hypot(camera.position.x - ch.cx, camera.position.z - ch.cz) < TER_DRAW
    const todo = terChunks.filter(c => !c.mesh).sort((a, b) => Math.abs(a.cz - camera.position.z) - Math.abs(b.cz - camera.position.z))
    let built = 0; for (const ch of todo){ build(ch); if (++built >= 2) break }
  }
}

// ── water: one grid that travels with the camera, snapped to its own cell so world-anchored waves never swim.
//    In the water fragment shader (with GLSL_RIVER included):  if (outsideWorld(vWPos.xz)) discard;
export function makeWaterGrid(scene, waterMat, size = 190, seg = 330){   // ~58 cm cells: fine enough for the shortest wave train
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI/2), waterMat)
  water.frustumCulled = false; water.receiveShadow = true; scene.add(water)
  const s = size/seg
  water.userData.step = camera => water.position.set(Math.round(camera.position.x/s)*s, 0, Math.round(camera.position.z/s)*s)
  return water
}

// ── shadows: the map covers ±13 m; away from home it follows the orbit target, snapped to 2 m so shadows don't crawl
export function makeSunFollow(sun, sunDir, home, { reach = 14, snap = 2, dist = 30 } = {}){
  const focus = home.clone()
  const place = () => { sun.position.copy(focus).addScaledVector(sunDir, dist); sun.target.position.copy(focus); sun.target.updateMatrixWorld() }
  place()
  return function followSunFocus(target, forceAway = false){
    const away = forceAway || Math.hypot(target.x - home.x, target.z - home.z) > reach
    const fx = away ? Math.round(target.x/snap)*snap : home.x, fz = away ? Math.round(target.z/snap)*snap : home.z
    if (fx !== focus.x || fz !== focus.z){ focus.set(fx, 0, fz); place() }
    return focus   // also use it to decide which trees cast shadows (within the shadow square)
  }
}
