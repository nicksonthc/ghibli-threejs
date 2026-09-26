// Skeletonless pose: ONE shared GLSL pose function run by every posed material of a character —
// body, face parts, fur shells and every shadow depth material — so shading, fur and shadows
// always agree. Parts opt in with #defines.
//
// Character space (glTF Y up, face +Z). MEASURE these from the mesh, don't hand-type them:
//   eyes: centre + radius per side (bounding box of the eye_white vertices split by x < 0)
//   ear bases, shoulder pivot height, arm mask |x| threshold.
// ADAPT: mesh-name regexes in poseCharacter(), the pivot numbers, and which parts get which define.
import * as THREE from 'three'

export const POSE_U = {
  uTHead:  { value: new THREE.Vector3() },   // yaw, pitch, tilt (rad), head relative to body
  uTBlink: { value: new THREE.Vector2() },   // 0 open … 1 shut, per eye (left = x < 0)
  uTPupil: { value: new THREE.Vector2() },   // eye swivel yaw, pitch
  uTEar:   { value: new THREE.Vector2() },   // ear flick per ear
  uTBreath:{ value: 0 },
  uTEyeL:  { value: new THREE.Vector4(-.116, .706, .188, .055) },   // xyz centre, w radius
  uTEyeR:  { value: new THREE.Vector4(.116, .706, .188, .055) },
}

export const POSE_GLSL = /* glsl */`
  uniform vec3 uTHead; uniform vec2 uTBlink, uTPupil, uTEar; uniform float uTBreath; uniform vec4 uTEyeL, uTEyeR;
  mat3 tRotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  mat3 tRotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
  mat3 tRotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
  void charPose(inout vec3 p, inout vec3 n){
    vec3 rest = p;
    #ifdef POSE_PUPIL      // pupils rotate about the measured eye centres
    { vec4 E = rest.x < 0. ? uTEyeL : uTEyeR; mat3 R = tRotY(uTPupil.x) * tRotX(-uTPupil.y); p = E.xyz + R*(p - E.xyz); n = R*n; }
    #endif
    #ifdef POSE_EYE        // blink with no eyelids: collapse FULLY to the lid line and push back
    { vec4 E = rest.x < 0. ? uTEyeL : uTEyeR; float b = rest.x < 0. ? uTBlink.x : uTBlink.y; float lid = E.y + E.w*.3;
      p.y = mix(p.y, lid, b); p.z -= b*b*E.w*.8; }          // the socket behind reads as a shut lid
    #endif
    #ifdef POSE_BODY       // ear tips rotate about their bases; belly breathes along its normals
    { float e = smoothstep(.9, 1.01, rest.y), sgn = rest.x < 0. ? -1. : 1.;
      if (e > 0.){ vec3 piv = vec3(sgn*.116, .9, -.012); float a = rest.x < 0. ? uTEar.x : uTEar.y;
        mat3 R = tRotZ(-sgn*a*.7) * tRotX(-a); vec3 q = piv + R*(p - piv); p = mix(p, q, e); n = normalize(mix(n, R*n, e)); }
      float bw = smoothstep(.1, .3, rest.y) * (1. - smoothstep(.5, .66, rest.y)) * smoothstep(-.05, .2, rest.z);
      p += n * uTBreath * .008 * bw; }
    #endif
    // upper body twist + nod about a shoulder pivot: nothing at the hips or arms (the paw keeps its grip), all of it in the head
    float arm = smoothstep(.28, .42, abs(rest.x)) * (1. - smoothstep(.64, .74, rest.y));
    float w = smoothstep(.5, .78, rest.y) * (1. - arm);
    mat3 R = tRotY(uTHead.x*w) * tRotX(-uTHead.y*w) * tRotZ(uTHead.z*w);
    vec3 piv = vec3(0., .55, 0.);
    p = piv + R*(p - piv); n = R*n;
  }`

// Pose the normal and the position in TWO self-contained steps: depth shaders compile
// <beginnormal_vertex> only under some defines, so a variable declared there may not exist in <begin_vertex>.
export function poseMaterial(m, defs) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : ''
  m.defines = { ...(m.defines || {}), ...defs }
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r)                              // chain earlier patches (toon, fur…)
    Object.assign(sh.uniforms, POSE_U)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + POSE_GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  { vec3 tp = position; charPose(tp, objectNormal); }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  { vec3 tn = vec3(0., 1., 0.); charPose(transformed, tn); }')
  }
  m.customProgramCacheKey = () => prevKey + '|pose:' + Object.keys(defs).join(',')
  m.needsUpdate = true
  return m
}

export function poseCharacter(root) {
  root.traverse(m => {
    if (!m.isMesh || /held_prop/.test(m.name)) return          // held props ride the paws, not the head
    const defs = { POSE: '' }
    if (m.name === 'body') defs.POSE_BODY = ''
    if (/eye_white|cornea|pupil|catchlight/.test(m.name)) defs.POSE_EYE = ''
    if (/pupil|catchlight/.test(m.name)) defs.POSE_PUPIL = ''
    if (m.isInstancedMesh) defs.POSE_BODY = ''                 // shell fur bends exactly like the body under it
    poseMaterial(m.material, defs)
    if (m.castShadow) m.customDepthMaterial = poseMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), defs)
  })
  // measure the eyes so blink and swivel pivots sit exactly in the sockets
  root.traverse(m => { if (m.name !== 'eye_white') return
    const p = m.geometry.attributes.position, box = [new THREE.Box3(), new THREE.Box3()], v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); box[v.x < 0 ? 0 : 1].expandByPoint(v) }
    box.forEach((b, i) => { if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3())
      ;(i ? POSE_U.uTEyeR : POSE_U.uTEyeL).value.set(c.x, c.y, c.z, (b.max.y - b.min.y) / 2) }) })
}

// Relaxed dangling legs (vertex hook after <begin_vertex>, same chunk in the depth material):
// everything below the knee plane (y = 0 in model space) swings ~7° about the knees, ~6.5 s beat,
// legs out of step, eased in over 10 cm so the knee stays soft. At 3° nobody noticed.
export const LEG_SWING = /* glsl */`{
  float below = max(0., -position.y);
  if (below > 0.){
    float w = smoothstep(0., .10, below);
    float ph = position.x > 0. ? 0. : 2.4;
    float a = w * (.1 + .035*sin(uTime*.13 + ph*1.7)) * sin(uTime*.97 + ph + .35*sin(uTime*.29 + ph));
    float c = cos(a), sn = sin(a); vec2 q = vec2(transformed.y, transformed.z);
    transformed.y = q.x*c - q.y*sn; transformed.z = q.x*sn + q.y*c;
  }
}`
