// Seat a straight run (fence, wall, rail) on a slope: rails follow the ground, posts stay plumb.
// A vertical SHEAR along the run's local X, not a tilt. Adapt: terrainHeight(x, z); the run's local X must be its length axis.
import * as THREE from 'three'

export function seatRaked(scene, obj, x, z, yaw, len, terrainHeight, sink = .03){
  const dx = Math.cos(yaw)*len/2, dz = -Math.sin(yaw)*len/2
  const h0 = terrainHeight(x - dx, z - dz), h1 = terrainHeight(x + dx, z + dz)
  obj.position.set(x, (h0 + h1)/2 - sink, z); obj.rotation.set(0, yaw, 0); obj.updateMatrix()
  // y += k·x with k = (h1 − h0)/len
  obj.matrix.multiply(new THREE.Matrix4().set(1, 0, 0, 0,  (h1 - h0)/len, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1))
  obj.matrixAutoUpdate = false                      // or three recomposes the matrix and the shear is lost
  scene.add(obj); return obj
}
