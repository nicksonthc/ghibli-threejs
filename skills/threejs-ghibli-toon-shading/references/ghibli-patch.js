// One onBeforeCompile helper that injects wind, banded toon light, subsurface backlight, rim, warm shadow fill,
// puff normals, leaf flecks and painterly bark into a built-in three material (tested on three r186).
// Adapt: the uniform values in U (drive them from lil-gui), sunLum() = luminance of your sun colour × intensity,
// and the option expressions you pass per material. Free-form hooks: vertexPars, vertexBegin, fragmentPars,
// color (after color_fragment), normal (after normal_fragment_maps), uniforms, onShader(sh).
//
//   patch(mat, { toon:true, puff:true, sss:true, rim:true, flecks:true, wind:'clamp((position.y-2.)*.06,0.,.6)*.22', flutter:'.55' })
//   mesh.customDepthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, side:THREE.DoubleSide,
//                                    map:mat.map, alphaTest:mat.alphaTest }), { wind:…, flutter:… })   // same wind!
//   patch(barkMat, { toon:true, bark:'vLocal.y' })
import * as THREE from 'three'

export const U = {
  uTime:{ value:0 }, uWind:{ value:1 }, uSunLum:{ value:1 },
  uPuff:{ value:.72 }, uBands:{ value:3 }, uSoft:{ value:.10 }, uToonMix:{ value:.85 },
  uSss:{ value:.55 }, uSssColor:{ value:new THREE.Color(0xd6ff6a) },
  uRim:{ value:.30 }, uRimColor:{ value:new THREE.Color(0xbfff8a) },
  uFleck:{ value:.55 }, uFleckScale:{ value:3.2 },
  uSway:{ value:1 }, uFlutter:{ value:.035 },
  uBarkWarm:{ value:new THREE.Color(0x8a5a36) }, uBarkWarmMix:{ value:.35 }, uBarkGrain:{ value:.45 },
  uBarkRootAO:{ value:.45 }, uBarkCanopyAO:{ value:.30 },
  uShadowFill:{ value:new THREE.Color(0xffb27a) }, uShadowFillK:{ value:.14 },
}

const PARS = /* glsl */`
  uniform float uPuff, uBands, uSoft, uToonMix, uSss, uRim, uFleck, uFleckScale, uBarkWarmMix, uBarkGrain, uBarkRootAO, uBarkCanopyAO, uShadowFillK, uSunLum;
  uniform vec3 uSssColor, uRimColor, uBarkWarm, uShadowFill;`

// value noise with no divisions → no Inf specks
export const GLSL_NOISE = /* glsl */`
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
  float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec2(17.1,9.7); a*=.5; } return s/.97; }
  float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
  float vn3(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
    return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),u.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x), u.y),
               mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x), u.y), u.z); }
  float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vn3(p); p=p*2.07+vec3(11.3,7.1,5.9); a*=.5; } return s/.9375; }`

// w = slow sway weight (by height), fw = high-frequency flutter weight (outer leaf edges). World space.
const GLSL_WIND = /* glsl */`
  vec3 windOffset(vec3 wp, float w, float fw){
    float t = uTime;
    float gust = .55 + .45*sin(t*.35 + wp.x*.05)*sin(t*.23 + wp.z*.07);
    float sway = sin(t*1.6 + wp.x*.55 + wp.z*.35) + .35*sin(t*3.7 + wp.x*1.9 - wp.z*1.3);
    vec3 o = vec3(.55, 0., .35)*sway*gust*w*uSway;
    float fl = sin(t*6.3 + wp.x*7.1 + wp.y*4.3 + wp.z*5.7)*(.55 + .45*sin(t*2.9 + wp.z*3.1 + wp.x*1.7));
    o += vec3(.5, .8, .5)*fl*fw*uFlutter*(.4 + .6*gust);
    return o*uWind; }`

// Must be injected AFTER lights_physical_pars_fragment (needs PhysicalMaterial + RE_Direct_Physical).
const GLSL_LIT = /* glsl */`
  float toonRamp(float x){ float n = max(uBands, 1.); float s = pow(x, .85)*n; float f = floor(s);   // no stronger gamma: washes out
    float t = smoothstep(.5-uSoft, .5+uSoft, fract(s)); return mix(x, clamp((f+t)/n, 0., 1.), uToonMix); }
  float gLit = 0.;   // NdotL × shadow of the sun, read by the fill pass
  void RE_Direct_Toon(const in IncidentLight dl, const in vec3 gp, const in vec3 gn, const in vec3 gv, const in vec3 gcn, const in PhysicalMaterial m, inout ReflectedLight rl){
    float ndl = saturate(dot(gn, dl.direction));
    gLit = max(gLit, ndl*saturate(dot(dl.color, vec3(.2126,.7152,.0722))/max(uSunLum, 1e-3)));
    IncidentLight tl = dl;
    #ifdef G_TOON
      tl.color *= clamp(toonRamp(ndl)/max(ndl, 1e-3), 0., 4.);   // RE_Direct re-applies the cosine → the band replaces it
    #endif
    RE_Direct_Physical(tl, gp, gn, gv, gcn, m, rl);                // specular/clearcoat/sheen + soft PCF shadows untouched
    #ifdef G_SSS
      float back = pow(saturate(dot(-gv, dl.direction)), 3.)*uSss;
      rl.directDiffuse += back*dl.color*uSssColor*m.diffuseColor;
    #endif
  }`

export function patch(mat, o){
  const key = JSON.stringify(o, (k, v) => typeof v === 'function' ? String(v) : v)
  mat.customProgramCacheKey = () => key            // otherwise differently patched materials share one program
  const fill = o.fill !== false
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, o.uniforms || {})
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uWind, uSway, uFlutter; varying vec3 vWPos; varying vec3 vLocal; ${GLSL_NOISE} ${GLSL_WIND}
        ${o.puff ? 'attribute vec3 clusterCenter; varying vec3 vSphN;' : ''} ${o.vertexPars || ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLocal = position;
        ${o.vertexBegin || ''}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${o.puff ? `{ vec3 d = position - clusterCenter; vec3 sN = dot(d,d) > 1e-8 ? normalize(d) : objectNormal;
          #ifdef USE_INSTANCING
            sN = mat3(instanceMatrix)*sN;
          #endif
          vSphN = normalize(normalMatrix*sN); }` : ''}`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix*mvPosition;
        #endif
        vec4 wPos = modelMatrix*mvPosition;
        ${o.wind || o.flutter ? `wPos.xyz += windOffset(wPos.xyz, ${o.wind || '0.'}, ${o.flutter || '0.'});` : ''}
        vWPos = wPos.xyz;
        mvPosition = viewMatrix*wPos;
        gl_Position = projectionMatrix*mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        #if defined( USE_SHADOWMAP ) || defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = wPos;
        #endif`)
    if (!sh.fragmentShader.includes('#include <common>')) return
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      ${o.toon ? '#define G_TOON' : ''} ${o.sss ? '#define G_SSS' : ''}
      uniform float uTime; varying vec3 vWPos; varying vec3 vLocal; ${PARS} ${GLSL_NOISE} ${o.puff ? 'varying vec3 vSphN;' : ''} ${o.fragmentPars || ''}`)
    if (!sh.fragmentShader.includes('lights_physical_pars_fragment')) return   // depth materials stop here
    if (o.toon || o.sss || fill) sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        ${GLSL_LIT}`)
      .replace('#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replaceAll('RE_Direct( directLight,', 'RE_Direct_Toon( directLight,'))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          ${fill ? 'reflectedLight.indirectDiffuse += BRDF_Lambert(diffuseColor.rgb)*uShadowFill*uShadowFillK*(1. - gLit)*PI;' : ''}
          ${o.rim ? `#if NUM_DIR_LIGHTS > 0
            float rimF = pow(1. - saturate(dot(normal, geometryViewDir)), 3.)*uRim*(.3 + .7*saturate(dot(normal, directionalLights[0].direction) + .3));
            reflectedLight.indirectDiffuse += uRimColor*rimF*(.4 + diffuseColor.rgb);
          #endif` : ''}
        }`)
    if (o.color || o.flecks || o.bark) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      ${o.flecks ? `{ vec3 fp = vLocal*uFleckScale; float f1 = vn3(fp*2.3), f2 = fbm3(fp*.55 + 7.3);
        diffuseColor.rgb *= 1. - .35*uFleck*smoothstep(.35, .65, f2);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.55,1.45,.65) + vec3(.06,.08,0.), uFleck*smoothstep(.66, .84, f1)); }` : ''}
      ${o.bark ? `{ float hh = ${o.bark};
        float g1 = vn(vec2((vLocal.x + vLocal.z)*7., vLocal.y*.9)), g2 = fbm2(vec2((vLocal.x - vLocal.z)*3.5, vLocal.y*.45));
        diffuseColor.rgb = mix(diffuseColor.rgb, uBarkWarm, uBarkWarmMix);
        diffuseColor.rgb *= 1. + (g2 - .5)*uBarkGrain*1.6 + (g1 - .5)*uBarkGrain*.7;
        diffuseColor.rgb *= mix(1. - uBarkRootAO, 1., smoothstep(0., 1.8, hh));
        diffuseColor.rgb *= mix(1., 1. - uBarkCanopyAO, smoothstep(3.2, 6.5, hh)); }` : ''}
      ${o.color || ''}`)
    if (o.puff || o.normal) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${o.puff ? 'normal = normalize(mix(normal, normalize(vSphN), uPuff));   // after the card\'s double-sided flip' : ''}
      ${o.normal || ''}`)
    o.onShader?.(sh)
  }
  return mat
}
