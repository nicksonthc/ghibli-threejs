// Water material: MeshStandardMaterial patched via onBeforeCompile.
// Adapt: `refractRT`, `reflectRT`, `slopeMap` from water-passes.js; `sunDir` (THREE.Vector3 uniform value,
// normalised, pointing TO the sun) and `sunLum` (luminance of the sun light's colour × intensity).
// Set uRes to the drawing-buffer size and uNear/uFar to the camera's each resize. Wave displacement,
// wake, rain rings and night terms are stripped here — see the buoyancy, wake and night skills.
import * as THREE from 'three'

const RIPPLES = 8
export function makeWaterMaterial({ refractRT, reflectRT, slopeMap, sunDir, sunColor, time }) {
  const waterU = {
    uTime: time,                                   // shared { value: seconds }
    tRefract: { value: refractRT.texture }, tDepth: { value: refractRT.depthTexture }, tReflect: { value: reflectRT.texture },
    tNormal: { value: slopeMap }, uReflMat: { value: new THREE.Matrix4() },
    uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: .1 }, uFar: { value: 700 },
    uAbsorb: { value: new THREE.Vector3(.95, .24, .20) }, uScatter: { value: new THREE.Color(0x2f9c8e) },
    uNStr: { value: 1 }, uRefr: { value: .035 }, uSpec: { value: .28 }, uSunLum: { value: 3 },
    uSunDir: { value: sunDir }, uSunColor: { value: sunColor },
    uRipples: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4()) },   // x, z, strength (0 = off), w (<0 steady, else start time)
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .11, metalness: 0, side: THREE.DoubleSide })
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, waterU)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix*vec4(transformed,1.)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform float uTime, uNear, uFar, uNStr, uRefr, uSpec, uSunLum; uniform vec3 uSunDir, uSunColor, uAbsorb, uScatter;
        uniform sampler2D tRefract, tDepth, tReflect, tNormal; uniform mat4 uReflMat; uniform vec2 uRes; uniform vec4 uRipples[${RIPPLES}];
        varying vec3 vWPos;
        float linZ(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
        vec2 slopeAt(vec2 uv){ return texture2D(tNormal, uv).rg*2.-1.; }
        vec3 waterNormal(){
          vec2 p = vWPos.xz; float t = uTime;
          // four octaves drifting downstream (+Z) at different speeds and angles
          vec2 sl = slopeAt(p*.075 + vec2(.00, -t*.022))*.55
                  + slopeAt(mat2(.8,-.6,.6,.8)*p*.19 + vec2(t*.010, -t*.045))*.38
                  + slopeAt(mat2(.6,.8,-.8,.6)*p*.52 + vec2(-t*.02, -t*.10))*.22
                  + slopeAt(p*1.45 + vec2(t*.03, -t*.19))*.10;
          for (int i=0;i<${RIPPLES};i++){
            vec4 r = uRipples[i]; if (r.z <= 0.) continue;
            vec2 d = p - r.xy; float L = length(d) + 1e-4; float w;
            if (r.w < 0.) w = sin(L*36. - t*5.2) * exp(-L*4.5);                          // steady rings (feet, posts)
            else { float age = t - r.w; float R = age*.32;                                 // an expanding ring (fish kiss, stone)
                   w = exp(-pow((L-R)*16., 2.)) * exp(-age*.9) * sin((L-R)*60.); }
            sl += d/L * w * r.z * .9;
          }
          float dist = length(cameraPosition - vWPos);
          sl *= uNStr / (1. + dist*.035);                                                  // distance fade: no milky aliasing far away
          return normalize(vec3(-sl.x, 1., -sl.y));
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 Nw = waterNormal();
        normal = normalize((viewMatrix*vec4(gl_FrontFacing ? Nw : -Nw, 0.)).xyz);`)
      .replace('#include <opaque_fragment>', /* glsl */`
        vec3 V = normalize(cameraPosition - vWPos);
        vec2 suv = gl_FragCoord.xy / uRes;
        float surfZ = vViewPosition.z;
        // (back faces / underwater: see threejs-webgl-underwater-effect)
        float thick0 = max(0., linZ(texture2D(tDepth, suv).x) - surfZ);
        vec2 off = Nw.xz * uRefr * clamp(thick0*2.5, 0., 1.) / (1. + surfZ*.06);           // shallows barely distort
        vec2 ruv = suv + off;
        float sceneZ = linZ(texture2D(tDepth, ruv).x);
        if (sceneZ < surfZ) { ruv = suv; sceneZ = surfZ + thick0; }                        // never refract things above the water
        float thick = max(0., sceneZ - surfZ) * length(vViewPosition) / max(vViewPosition.z, 1e-3);   // true path length
        vec3 refr = vec3(texture2D(tRefract, ruv + off*.12).r, texture2D(tRefract, ruv).g, texture2D(tRefract, ruv - off*.12).b);
        // shadowed sun arriving here (canopy shadows included) drives the in-scattered turquoise
        float NL = max(dot(Nw, uSunDir), .05);
        float sunLit = clamp(dot(reflectedLight.directDiffuse, vec3(.2126,.7152,.0722)) * PI / (uSunLum * NL), 0., 1.);
        vec3 T = exp(-thick * uAbsorb);
        vec3 under = refr * T + uScatter * (1. - exp(-thick*.9)) * (.15 + .65*sunLit);
        vec4 rc = uReflMat * vec4(vWPos, 1.);
        vec3 refl = texture2D(tReflect, rc.xy/rc.w + Nw.xz*.06/(1. + surfZ*.04)).rgb;
        float F = .02 + .98*pow(1. - max(dot(Nw, V), 0.), 5.);                              // Schlick, F0 = .02
        vec3 col = mix(under, refl, F);
        col += reflectedLight.directSpecular * uSpec;                                      // GGX glints, already shadowed
        col = mix(refr, col, smoothstep(0., .035, thick));                                 // no hard waterline
        gl_FragColor = vec4(col, 1.);`)
  }
  return { mat, waterU }
}

// Spawn an expanding ring (e.g. a fish kissing the surface): reuse the oldest slot.
let _next = 0
export function spawnRipple(waterU, x, z, strength = 1) {
  waterU.uRipples.value[_next].set(x, z, strength, waterU.uTime.value); _next = (_next + 1) % waterU.uRipples.value.length
}
