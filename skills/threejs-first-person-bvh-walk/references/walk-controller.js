// TEMPLATE (trimmed): a first-person capsule controller on a three-mesh-bvh, in the landmark's local frame.
// ADAPT: the skip list, isOutdoors(), the WALK numbers. The player position walk.p is in model metres (isle-local),
// so the landmark's bob and spin carry her; set the camera from isle.localToWorld(eye) (see SKILL.md).
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const WALK = { eye:1.5, radius:.34, step:.56, drop:1.25, climb:1.32, speed:2.7, run:5.4 }
export const walk = { bvh:null, p:new THREE.Vector3(), vel:new THREE.Vector3(), yaw:0, keys:{}, trail:[], stuckT:0 }

// one BVH over every static mesh, in the isle's frame (positions + index only)
export async function walkPrepare(isle, skip = /leaves|water|foam|banner|crystal|fire/){
  const { MeshBVH } = await import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.1/build/index.module.js')   // not +esm: it pulls a 2nd three
  isle.updateMatrixWorld(true); const inv = isle.matrixWorld.clone().invert(), parts = [], m4 = new THREE.Matrix4()
  isle.traverse(o => { if (!o.isMesh || o.isInstancedMesh || !o.geometry.index || skip.test(o.material.name)) return
    const g = new THREE.BufferGeometry(); g.setAttribute('position', o.geometry.attributes.position.clone()); g.setIndex(o.geometry.index.clone())
    g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); parts.push(g) })
  walk.bvh = new MeshBVH(mergeGeometries(parts))
}

const _r = new THREE.Ray(), _f = new THREE.Vector3()
// the floor under p: one ray from a step above, steep faces are not floor
export function walkFloor(p, far = WALK.step + 30){
  _r.origin.set(p.x, p.y + WALK.step, p.z); _r.direction.set(0, -1, 0)
  const hit = walk.bvh.raycastFirst(_r, THREE.DoubleSide, 0, far)
  return hit && Math.abs(hit.face.normal.y) > .6 ? hit.point.y : null
}
// the ground: the highest floor under a footprint (centre + 5 toes), so seams and hand-width gaps are stepped over
const FOOT = [[0, 0], ...Array.from({ length:5 }, (_, i) => [Math.cos(i*1.2566)*.24, Math.sin(i*1.2566)*.24])]
export function walkGround(p){
  let best = null, n = 0
  for (const [dx, dz] of FOOT){ const y = walkFloor(_f.set(p.x + dx, p.y, p.z + dz)); if (y === null) continue; n++; if (best === null || y > best) best = y }
  return n >= 2 || (n === 1 && walkFloor(_f.copy(p)) !== null) ? best : null      // one stray toe on a ledge is not standing
}
// the body: a capsule from just above step height to the crown, pushed SIDEWAYS out of every triangle it overlaps
const seg = new THREE.Line3(), box = new THREE.Box3(), tp = new THREE.Vector3(), cp = new THREE.Vector3(), push = new THREE.Vector3()
export function walkCollide(p){
  const r = WALK.radius
  for (let pass = 0; pass < 3; pass++){
    seg.start.set(p.x, p.y + WALK.step + r*.6, p.z); seg.end.set(p.x, p.y + 1.62 - r, p.z)
    box.makeEmpty(); box.expandByPoint(seg.start); box.expandByPoint(seg.end); box.min.addScalar(-r); box.max.addScalar(r)
    let any = false
    walk.bvh.shapecast({ intersectsBounds:b => b.intersectsBox(box),
      intersectsTriangle:tri => { const d = tri.closestPointToSegment(seg, tp, cp); if (d >= r) return false
        push.subVectors(cp, tp).setY(0); let l = push.length()
        if (l < 1e-5){ tri.getNormal(push); push.setY(0); l = push.length(); if (l < 1e-3) return false }   // dead centre: out along the face normal
        push.multiplyScalar((r - d)/l); seg.start.add(push); seg.end.add(push); any = true; return false } })
    if (!any) return
    p.x = seg.start.x; p.z = seg.start.z
  }
}
const fit = new THREE.Vector3()
export const walkFits = (x, y, z) => { fit.set(x, y, z); walkCollide(fit); return Math.hypot(fit.x - x, fit.z - z) < .03 }
// a metre of level ground: a terrace, never a coping or a rail top
const LAND = Array.from({ length:8 }, (_, i) => [Math.cos(i*.7854)*.45, Math.sin(i*.7854)*.45])
const walkSolid = (x, y, z) => LAND.every(([dx, dz]) => { const f = walkFloor(_f.set(x + dx, y, z + dz)); return f !== null && Math.abs(f - y) <= .1 })

// every drop can be climbed back: outdoors, hop a ledge up to WALK.climb onto solid ground or onto her own trail
export function walkClimb(p, d, isOutdoors){
  if (!isOutdoors(p)) return false
  const l = Math.hypot(d.x, d.z); if (l < 1e-6) return false
  const x = p.x + d.x/l*(WALK.radius + .2), z = p.z + d.z/l*(WALK.radius + .2)
  const fy = walkFloor(_f.set(x, p.y + WALK.climb - WALK.step, z), WALK.climb)
  if (fy === null || fy <= p.y + WALK.step || fy > p.y + WALK.climb) return false
  const been = walk.trail.some(c => Math.hypot(c.x - x, c.z - z) < .7 && Math.abs(c.y - fy) < .2)
  if (!(been || walkSolid(x, fy, z)) || !walkFits(x, fy, z)) return false
  p.set(x, fy, z); return true
}
// one sub-step: go, get pushed out, find the ground; at an edge retry turned along it so it is glanced along, not a wall
const GLANCE = [0, .5, -.5, 1, -1, 1.35, -1.35], tr = new THREE.Vector3()
export function walkStep(p, d, isOutdoors){
  const x0 = p.x, y0 = p.y, z0 = p.z
  for (const a of GLANCE){
    const c = Math.cos(a), s = Math.sin(a), k = Math.max(0, c)
    tr.set((d.x*c + d.z*s)*k, 0, (-d.x*s + d.z*c)*k); if (a && tr.lengthSq() < 1e-10) continue
    p.set(x0 + tr.x, y0, z0 + tr.z); walkCollide(p)
    if (!a && Math.hypot(p.x - x0 - tr.x, p.z - z0 - tr.z) > tr.length()*.5){     // blocked: a ledge to climb?
      p.set(x0, y0, z0); if (walkClimb(p, d, isOutdoors)) return true; p.set(x0 + tr.x, y0, z0 + tr.z); walkCollide(p) }
    const fy = walkGround(p)
    if (fy === null || fy < y0 - WALK.drop) continue                              // the edge of the sky, or too far down
    if (fy > y0 + .02 && !walkFits(p.x, fy, p.z)) continue                        // no stepping up under an overhang
    p.y = fy; return true
  }
  p.set(x0, y0, z0); return false
}
// the way back: crumbs every 35 cm; pressing on and going nowhere for .5 s leads her back along them
function walkTrail(p){ const T = walk.trail, l = T[T.length - 1]; if (!l || l.distanceTo(p) > .35){ T.push(p.clone()); if (T.length > 60) T.shift() } }
const dir = new THREE.Vector3()
function walkUnstick(p, want, dt){
  dir.copy(want).setY(0).normalize()
  for (let i = walk.trail.length - 1; i >= 0; i--){ const c = walk.trail[i], dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz)
    if (l < .3 || Math.abs(c.y - p.y) > WALK.climb || (dx*dir.x + dz*dir.z)/l < .1) continue
    const go = Math.min(l, WALK.speed*dt); p.x += dx/l*go; p.z += dz/l*go; p.y += (c.y - p.y)*Math.min(1, go/l); return true }
  return false
}
// per frame: input -> eased velocity -> 12 cm sub-steps -> stuck check
const want = new THREE.Vector3(), old = new THREE.Vector3(), dd = new THREE.Vector3()
export function walkMove(dt, isOutdoors = () => true){
  const k = walk.keys, f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0), s = (k.d ? 1 : 0) - (k.a ? 1 : 0)
  walk.yaw += ((k.arrowleft ? 1 : 0) - (k.arrowright ? 1 : 0))*dt*1.9
  want.set(-Math.sin(walk.yaw)*f + Math.cos(walk.yaw)*s, 0, -Math.cos(walk.yaw)*f - Math.sin(walk.yaw)*s)
  const m = Math.min(1, want.length()); if (m > 0) want.normalize().multiplyScalar(m*(k.shift ? WALK.run : WALK.speed))
  walk.vel.lerp(want, 1 - Math.exp(-dt*9))
  const p = walk.p; old.copy(p); dd.copy(walk.vel).multiplyScalar(dt); const moved = dd.length()
  if (moved > 1e-5){ const n = Math.ceil(moved/.12); dd.divideScalar(n); for (let i = 0; i < n; i++) if (!walkStep(p, dd, isOutdoors)) break }
  else { walkCollide(p); const fy = walkGround(p); if (fy !== null && Math.abs(fy - p.y) <= WALK.drop) p.y = fy }
  const sp = Math.hypot(p.x - old.x, p.z - old.z)/Math.max(dt, 1e-3)
  walk.stuckT = m > .2 && sp < .25*m*WALK.speed ? walk.stuckT + dt : 0
  if (!(walk.stuckT > .5 && walkUnstick(p, want, dt))) walkTrail(p)
  if (moved > 1e-5 && sp < moved/dt*.25) walk.vel.multiplyScalar(.5)              // pressed against something: don't bank speed
  return sp
}
