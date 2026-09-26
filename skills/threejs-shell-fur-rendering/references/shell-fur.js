// Shell fur grown in three.js from a sculpted body mesh (a GLB can't carry hair).
// The body geometry is drawn again N times as ONE InstancedMesh (identity instance matrices);
// shell i = gl_InstanceID/N is pushed out along the normal by layer × length × COLOR_0.a, droops a
// little under gravity, sways in the wind, and keeps only fragments inside a strand: a jittered
// 3D cell grid in REST (object) space — no UV dependence, so no seams.
//
// ADAPT: `mesh` = the body Mesh whose geometry has COLOR_0 as VEC4 (RGB = painted albedo with
// markings, A = fur length 0..1), `U` = shared uniforms containing uTime and uWind.
// If the character is deformed in the vertex shader (blink, head turn), run the same pose function
// here BEFORE the shell push — see threejs-skeletonless-character-animation.
import * as THREE from 'three'

export const FUR = {
  shells: 24, length: .028, density: 420, droop: .35,
  lod: [[3, 24], [7, 14], [16, 6], [40, 3]],       // [camera distance (m), shells]; beyond → 0
}

export function growFur(mesh, U) {
  const g = mesh.geometry, col = g.attributes.color
  if (!col || col.itemSize !== 4) return null      // exporter dropped the alpha: export_vertex_color='ACTIVE'
  mesh.material.vertexColors = true; mesh.material.needsUpdate = true
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0, side: THREE.DoubleSide })
  const uFur = { uShells: { value: FUR.shells }, uFurLen: { value: FUR.length }, uFurDensity: { value: FUR.density }, uDroop: { value: FUR.droop } }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, uFur)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uShells, uFurLen, uDroop; varying float vLayer; varying float vFurA; varying vec3 vRest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = position; vFurA = color.a;
        float layer = (float(gl_InstanceID) + 1.) / uShells; vLayer = layer;
        float len = color.a * uFurLen;
        transformed += normalize(objectNormal) * layer * len;
        transformed.y -= layer*layer * len * uDroop;                                  // the coat hangs a little
        transformed.xz += layer*layer * len * .25 * uWind * vec2(sin(uTime*1.7 + position.y*9.), cos(uTime*1.3 + position.x*7.));`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uFurDensity; varying float vLayer; varying float vFurA; varying vec3 vRest;
        vec3 fhash3(vec3 p){ p = fract(p*vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx)*p.zyx); }`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        {
          if (vFurA < .02 || vLayer > vFurA*1.15 + .05) discard;          // short fur (face, palms) stops at fewer shells
          vec3 q = vRest * uFurDensity, c = floor(q); float d = 9.;
          for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) for (int k = 0; k < 2; k++){
            vec3 n = c + vec3(i, j, k); d = min(d, length(q - n - fhash3(n)*.8)); }
          float r = .55 * (1. - vLayer);                                   // strands taper to a point
          if (d > r) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(.62, 1.12, vLayer);                        // deep in the coat is shadowed, tips catch the light`)
  }
  mat.customProgramCacheKey = () => 'shell-fur'
  const shells = new THREE.InstancedMesh(g, mat, FUR.shells)
  for (let i = 0; i < FUR.shells; i++) shells.setMatrixAt(i, new THREE.Matrix4())
  shells.castShadow = false                        // shells must not cast: the body already does
  shells.receiveShadow = true
  shells.frustumCulled = false
  mesh.add(shells)
  return shells
}

// LOD: choose the shell count by camera distance every frame (instanced count = shells drawn)
const _p = new THREE.Vector3()
export function stepFur(shells, camera) {
  if (!shells) return
  const d = camera.position.distanceTo(shells.getWorldPosition(_p))
  shells.count = (FUR.lod.find(([r]) => d < r) || [0, 0])[1]
  shells.visible = shells.count > 0
}
