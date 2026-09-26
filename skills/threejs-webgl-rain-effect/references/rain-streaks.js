// GPU rain: one instanced quad, every streak animated in the vertex shader inside a box that
// follows the camera. Position = fract(seed − t·speed/box), slanted by the wind; the streak axis
// is the fall vector and the width axis is cross(fall, view), so streaks always face the lens.
//
// ADAPT: `uTime` (shared time uniform), `aoHidden` (objects hidden for GTAO), `rng` (seeded).
// Keep it on layer 1 so a refraction pre-pass (layer 0 only) skips it; hide it underwater.
import * as THREE from 'three'

export const RAIN_MAX = 14000            // streaks at density 1
export const RAIN_BOX = [26, 14, 26]     // metres, centred on the camera

export function buildRain({ scene, uTime, rng, aoHidden }) {
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,0, .5,0,0, .5,1,0, -.5,0,0, .5,1,0, -.5,1,0], 3))
  const seed = new Float32Array(RAIN_MAX * 4)
  for (let i = 0; i < seed.length; i++) seed[i] = rng()
  g.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4))
  g.instanceCount = 0
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime, uBox: { value: new THREE.Vector3(...RAIN_BOX) }, uCam: { value: new THREE.Vector3() },
      uSpeed: { value: 9.5 }, uWindV: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color() },
      uAlpha: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: /* glsl */`attribute vec4 seed; uniform float uTime, uSpeed; uniform vec3 uBox, uCam; uniform vec2 uWindV;
      varying float vT; varying float vA;
      void main(){
        float sp = uSpeed*(.8 + .4*seed.w);
        vec3 fall = normalize(vec3(uWindV.x, -sp, uWindV.y));
        vec3 p;
        p.x = uCam.x + (fract(seed.x + uWindV.x*uTime/uBox.x) - .5)*uBox.x;
        p.z = uCam.z + (fract(seed.z + uWindV.y*uTime/uBox.z) - .5)*uBox.z;
        p.y = uCam.y - 4. + fract(seed.y - uTime*sp/uBox.y)*uBox.y;
        vec3 view = normalize(p - cameraPosition), side = normalize(cross(fall, view));
        float len = .32 + .22*seed.w, wid = .012 + .008*seed.x;
        vec3 w = p - fall*position.y*len + side*position.x*wid;
        vT = position.y;
        vA = smoothstep(-.1, .4, w.y)                                                    // gone under the water surface (y = 0)
           * (1. - smoothstep(uBox.x*.3, uBox.x*.5, length(p.xz - uCam.xz)))             // thin at the box edge
           * smoothstep(.9, 2.6, distance(p, cameraPosition));                          // and right against the lens
        gl_Position = projectionMatrix*viewMatrix*vec4(w, 1.); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAlpha, uFlash; varying float vT; varying float vA;
      void main(){ float a = uAlpha*vA*(1. - vT)*vT*4.; if (a < .004) discard;
        gl_FragColor = vec4(uColor*(1. + uFlash*2.5), a); }` })
  const mesh = new THREE.Mesh(g, m)
  mesh.frustumCulled = false; mesh.layers.set(1); mesh.renderOrder = 6
  scene.add(mesh); aoHidden.push(mesh)
  return mesh
}

// per frame: count, colour lit by the sky, wind slant
export function stepRain(mesh, { rain, density, camera, hemiColor, windStrength, nightK, flash, speed = 9.5 }) {
  const g = mesh.geometry, u = mesh.material.uniforms
  g.instanceCount = Math.round(RAIN_MAX * density * THREE.MathUtils.smoothstep(rain, .02, .4))
  mesh.visible = g.instanceCount > 0
  u.uCam.value.copy(camera.position); u.uSpeed.value = speed
  u.uWindV.value.set(1.6 * windStrength, .7 * windStrength)
  u.uColor.value.copy(hemiColor).lerp(new THREE.Color(0xc9d3de), .6).multiplyScalar(nightK > .5 ? .55 : 1.15)
  u.uAlpha.value = .28 * Math.min(1, rain * 1.4)
  u.uFlash.value = flash
}

/* Rain rings in the WATER fragment shader (add to the ripple-slope accumulation `sl`):
   a jittered cell grid, two offset layers, each ring radius = fract(t·rate + hash);
   step(hash, rain) thins the rings at light rain.

  if (uRain > .01){
    for (int k = 0; k < 2; k++){
      vec2 g = p*2.6 + float(k)*vec2(.37, .71), id = floor(g), f = fract(g) - .5;
      float h = hash(id + float(k)*7.1), age = fract(t*(.8 + .4*h) + h);
      vec2 d = f - (vec2(hash(id + 1.3), hash(id + 2.7)) - .5)*.5;
      float L = length(d) + 1e-4, R = age*.42;
      float w = sin((L - R)*44.) * exp(-pow((L - R)*13., 2.)) * (1. - age) * step(hash(id + 5.9), uRain*.9 + .1);
      sl += d/L * w * uRain * .5 / (1. + dist*.06);
    }
  }
*/
