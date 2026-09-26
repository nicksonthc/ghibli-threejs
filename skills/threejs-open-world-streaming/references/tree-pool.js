// A pool of crafted GLB trees re-seated on the candidate sites nearest the camera, while those sites' cheap
// "blob" instances step aside; plus coarse distance culling for everything instanced per cell.
// ADAPT: `parts` (one entry per mesh of the tree GLB, node matrices baked into geometry), POOL_N, radii, tint.
import * as THREE from 'three'

const REACH = { poolN:16, treeR:55, cullTree:170, cullSmall:90 }   // cull radii: the fog is ~94% by 170 m
export const reachSites = []   // { x, y, z, yaw, s, sp, seed, refs:[[instancedMesh, index, matrix]], slot }
const _hide = new THREE.Matrix4().makeScale(0, 0, 0)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)

// blob instances of a site: scaled to zero while a crafted tree stands there
function showBlob(site, on){ for (const [im, i, mat] of site.refs){ im.setMatrixAt(i, on ? mat : _hide); im.instanceMatrix.needsUpdate = true } }

export function buildTreePool(scene, species, parts){   // parts[sp] = [{ geo, makeMaterial(), depth }]
  const slots = []
  for (const sp of species) for (let i = 0; i < REACH.poolN; i++){
    const slot = { sp, site:null, meshes:[] }
    for (const p of parts[sp]){
      const mesh = new THREE.Mesh(p.geo, p.makeMaterial())   // leaves: one material per slot with a uTint uniform, same program
      mesh.matrixAutoUpdate = false; mesh.visible = false; mesh.receiveShadow = true; mesh.customDepthMaterial = p.depth
      p.geo.computeBoundingSphere(); p.geo.boundingSphere.radius += .35   // pad so wind sway never pops out of the frustum
      scene.add(mesh); slot.meshes.push(mesh)
    }
    slots.push(slot)
  }
  return { slots, t:0 }
}

// every 0.5 s (not every frame)
export function stepTreePool(pool, camera, t, shadowFocus, shadowR = 13){
  if (!pool.slots.length || t - pool.t < .5) return; pool.t = t
  const cx = camera.position.x, cz = camera.position.z, want = new Set()
  for (const sp of new Set(pool.slots.map(s => s.sp)))
    reachSites.filter(s => s.sp === sp && Math.abs(s.x - cx) < REACH.treeR && Math.abs(s.z - cz) < REACH.treeR)
      .map(s => [s, Math.hypot(s.x - cx, s.z - cz)]).filter(a => a[1] < REACH.treeR)
      .sort((a, b) => a[1] - b[1]).slice(0, REACH.poolN).forEach(a => want.add(a[0]))
  // release slots whose site is no longer wanted
  for (const slot of pool.slots) if (slot.site && !want.has(slot.site)){ showBlob(slot.site, true); slot.site.slot = null; slot.site = null; slot.meshes.forEach(m => m.visible = false) }
  // seat free slots on new sites
  for (const site of want){ if (site.slot) continue
    const slot = pool.slots.find(s => !s.site && s.sp === site.sp); if (!slot) continue
    slot.site = site; site.slot = slot; showBlob(site, false)
    _m.compose(_p.set(site.x, site.y, site.z), _q.setFromAxisAngle(Y, site.yaw), _s.setScalar(site.s))
    slot.meshes.forEach(m => { m.matrix.copy(_m); m.matrixWorldNeedsUpdate = true; m.visible = true
      const tn = m.material.userData.tint; if (tn){ const u = site.seed ?? .5, v = (u*7.31) % 1; tn.value.setRGB(.9 + .22*v, 1 - .06*u, .8 + .25*(1 - v)) } })   // no two crowns the same green
  }
  // only trees inside the sun's shadow square cast shadows
  for (const slot of pool.slots) if (slot.site){ const sh = Math.hypot(slot.site.x - shadowFocus.x, slot.site.z - shadowFocus.z) < shadowR; slot.meshes.forEach(m => m.castShadow = sh) }
}

// ── coarse distance culling (per 32 m cell InstancedMeshes, landmarks) ──
const cullList = []   // { o, x, z, r }
export function registerCull(o, r){
  o.updateMatrixWorld(true)   // FIRST: a just-placed object still holds its old matrix (it would register at the origin)
  o.traverse(m => { if (!m.isMesh) return
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere()
    const c = m.isInstancedMesh ? (m.computeBoundingSphere(), m.boundingSphere.center) : m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld)
    cullList.push({ o:m, x:c.x, z:c.z, r }) })
}
let cullT = 0
export function stepCull(camera, t){
  if (t - cullT < .25) return; cullT = t
  for (const c of cullList){ if (c.o.userData.hidden) continue; c.o.visible = Math.hypot(camera.position.x - c.x, camera.position.z - c.z) < c.r }
}
