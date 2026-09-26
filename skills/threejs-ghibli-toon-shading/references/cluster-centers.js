// k-means over leaf-card triangles → per-vertex `clusterCenter` attribute (object space), so baked GLB foliage
// (which carries no clump data) can use puff normals. Per TRIANGLE so a card never straddles two clusters.
// Adapt: K (~36 per leaf mesh worked), the seeded RNG. Call once after loading, before patching the material.
import * as THREE from 'three'

export function addClusterCenters(geo, K = 36, rand = mulberry32(11)){
  const p = geo.attributes.position, idx = geo.index, n = p.count
  const tri = idx ? idx.count/3 : n/3, cen = new Float32Array(tri*3)
  for (let t=0;t<tri;t++){ let x=0,y=0,z=0
    for (let k=0;k<3;k++){ const i = idx ? idx.getX(t*3+k) : t*3+k; x+=p.getX(i); y+=p.getY(i); z+=p.getZ(i) }
    cen[t*3]=x/3; cen[t*3+1]=y/3; cen[t*3+2]=z/3 }
  const C = new Float32Array(K*3), sum = new Float32Array(K*3), cnt = new Int32Array(K), asg = new Int32Array(tri)
  for (let k=0;k<K;k++){ const t = (rand()*tri)|0; C.set(cen.subarray(t*3, t*3+3), k*3) }
  for (let it=0; it<10; it++){                                  // 10 iterations is plenty
    sum.fill(0); cnt.fill(0)
    for (let t=0;t<tri;t++){ const x=cen[t*3], y=cen[t*3+1], z=cen[t*3+2]; let best=0, bd=1e9
      for (let k=0;k<K;k++){ const dx=x-C[k*3], dy=y-C[k*3+1], dz=z-C[k*3+2], d=dx*dx+dy*dy+dz*dz; if (d<bd){ bd=d; best=k } }
      asg[t]=best; sum[best*3]+=x; sum[best*3+1]+=y; sum[best*3+2]+=z; cnt[best]++ }
    for (let k=0;k<K;k++) if (cnt[k]){ C[k*3]=sum[k*3]/cnt[k]; C[k*3+1]=sum[k*3+1]/cnt[k]; C[k*3+2]=sum[k*3+2]/cnt[k] }
  }
  const out = new Float32Array(n*3)
  for (let t=0;t<tri;t++) for (let k=0;k<3;k++){ const i = idx ? idx.getX(t*3+k) : t*3+k; out.set(C.subarray(asg[t]*3, asg[t]*3+3), i*3) }
  geo.setAttribute('clusterCenter', new THREE.BufferAttribute(out, 3))
}

export function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a)
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
