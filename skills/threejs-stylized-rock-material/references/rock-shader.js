// River-rock web shader options for the patch() helper (threejs-ghibli-toon-shading/references/ghibli-patch.js):
// granite grain, a derivative bump, a wet band on the live waterline, rain, moss from COLOR_0 alpha, per-instance seed.
// Adapt: GLSL_WAVES must define `vec3 waveDisp(vec2 xz, float t)` — the SAME function your water vertex shader uses
// (see threejs-boat-buoyancy-steering); uRain (0..1) and uWaveAmp from your weather/water uniforms.
// Material: new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.85 }) — the GLB must carry COLOR_0 as VEC4.
import * as THREE from 'three'

const ROCK = {
  grain:.8,        // dark mica specks and pale feldspar grains (0 = off)
  bump:.012,       // metres of relief
  wetBand:.07,     // metres above the moving waterline the splash and tide keep wet
  wetDarken:.62,   // albedo multiplier of wet stone (before the pow that deepens it)
  wetRough:.32,    // .16 mirrors the sky as a white smear
  detailFar:22,    // metres at which grain and bump have faded out
}
const f = (x, d = 3) => x.toFixed(d)

export const rockShader = (GLSL_WAVES, uRain, uWaveAmp) => ({
  uniforms:{ uRain, uWaveAmp },
  vertexPars:'varying vec3 vRockSeed;',
  vertexBegin:`#ifdef USE_INSTANCING
      vRockSeed = instanceMatrix[3].xyz;     // each stone gets its own grain from where it lies
    #else
      vRockSeed = vec3(0.);
    #endif`,
  fragmentPars:`varying vec3 vRockSeed; uniform float uRain, uWaveAmp; ${GLSL_WAVES}
    float rockH(vec3 p){ return fbm3(p*1.6)*.55 + vn3(p*7.)*.3 + vn3(p*19.)*.15; }
    float gRockWet, rMoss, rFd;`,
  color:`
    #ifdef USE_COLOR_ALPHA
      rMoss = 1. - vColor.a;                 // alpha = 1 − moss, painted in Blender
    #else
      rMoss = 0.;
    #endif
    vec3 rp = vLocal*3. + vRockSeed*.61;
    rFd = 1. - smoothstep(${f(ROCK.detailFar*.3, 2)}, ${f(ROCK.detailFar, 2)}, length(vViewPosition));
    float gSpeck = vn3(rp*72.), gGrain = vn3(rp*125. + 3.7), gMot = fbm3(rp*.7), gVein = fbm3(rp*2.3 + 9.1);
    vec3 rc = diffuseColor.rgb*(.86 + .3*gMot);
    rc = mix(rc, rc*.76, smoothstep(.68, .84, gSpeck)*${f(ROCK.grain, 2)}*rFd*(1. - rMoss));            // dark mica
    rc = mix(rc, rc*1.16 + .015, smoothstep(.66, .86, gGrain)*${f(ROCK.grain*.7, 2)}*rFd*(1. - rMoss)); // pale feldspar
    rc *= 1. - .16*(1. - rMoss)*smoothstep(.45, .5, gVein)*smoothstep(.56, .5, gVein);                   // faint veins
    rc *= mix(1., .75 + .5*vn3(rp*30.), rMoss*.6*rFd);                                                    // tufted moss
    float wl = waveDisp(vWPos.xz, uTime).y;
    float band = ${f(ROCK.wetBand)}*(.6 + .4*uWaveAmp)*(.55 + .9*vn3(vec3(vWPos.xz*3.1, vWPos.y*9.)));
    gRockWet = max(smoothstep(wl + band, wl + .008, vWPos.y), uRain*.85);
    rc = mix(rc, pow(rc, vec3(1.3))*${f(ROCK.wetDarken, 2)}*1.25, gRockWet*(1. - rMoss*.5));
    rc += vec3(.022, .02, .015)*exp(-pow((vWPos.y - wl - band - .015)/.01, 2.))*(1. - rMoss)*(1. - uRain);  // tide mark
    diffuseColor.rgb = rc;`,
  normal:`{ // bump on our own height (perturbNormalArb construction), no bumpMap needed
    float hB = rockH(vLocal*3. + vRockSeed*.61);
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det)*(dFdx(hB)*r1 + dFdy(hB)*r2);
    float bs = ${f(ROCK.bump, 4)}*rFd*(1. - .6*rMoss)*(1. - .5*gRockWet);
    normal = normalize(abs(det)*normal - bs*grad); }`,
  onShader: sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor = mix(roughnessFactor, ${f(ROCK.wetRough, 2)}, gRockWet*(1. - rMoss*.6));
    roughnessFactor = mix(roughnessFactor, 1., rMoss*.8);`) },
})
// NOTE: color_fragment runs before normal_fragment_maps and roughnessmap_fragment in three's standard fragment
// shader order, which is why the shared values (gRockWet, rMoss, rFd) are file-scope globals declared in fragmentPars.

// Usage:
//   const mat = patch(new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.85 }), rockShader(GLSL_WAVES, waterU.uRain, waterU.uWaveAmp))
//   one InstancedMesh per rock variant; seat each at y = ground − .12*scale (stepping stones: − .03*scale, never Y-squashed)
