// TEMPLATE (trimmed): one material-name -> procedural-shader table for a generated landmark GLB.
// Assumes a patch(material, { vertexPars, vertexBegin, fragmentPars, color, normal, uniforms, onShader }) hook
// (threejs-ghibli-toon-shading) that exposes vLocal (object-space position, metres) and noise helpers vn()/fbm2().
// ADAPT: the material prefix, the keys, the numbers. No UVs and no textures: everything comes from vLocal + vObjN.

// object-space normal for triplanar weights
export const LAP_VERT = { vertexPars:'varying vec3 vObjN;', vertexBegin:'vObjN = objectNormal;' }
export const LAP_PARS = `varying vec3 vObjN; float gLapH = 0.;
  float lpH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  // running-bond courses on a plane: x = joint (0..1), y = a per-block random
  vec2 lpAshlar(vec2 q, float H, float W){ float row = floor(q.y/H); float u = q.x/W + .5*mod(row, 2.) + lpH(vec2(row, 3.1))*.35;
    vec2 f = vec2(fract(u)*W, fract(q.y/H)*H); float d = min(min(f.x, W - f.x), min(f.y, H - f.y));
    return vec2(1. - smoothstep(.018, .06, d), lpH(vec2(floor(u), row))); }
  float lpFar(){ return smoothstep(45., 260., length(vViewPosition)); }`
// a shared bump: the colour pass leaves a height in gLapH, the normal pass tilts the normal by its screen-space slope
export const LAP_BUMP = s => `{ vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(gLapH)*${s}, dhy = dFdy(gLapH)*${s};
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
    normal = normalize(abs(det)*normal - sign(det)*(dhx*r1 + dhy*r2)); }`

export const SHADE = {
  // ivory limestone: triplanar ashlar on walls, flagstones on floors, per-block tint, streaks, grime, moss on ledges.
  // Joints are cut in with COLOUR; the bump is faint (-joint*.1). A deep joint bump lights every block's lip like glazed tile.
  stone:{ ...LAP_VERT, fragmentPars:LAP_PARS, color:`{
      vec3 nn = normalize(vObjN), p = vLocal; float fa = lpFar();
      vec3 w = pow(abs(nn), vec3(4.)); w /= w.x + w.y + w.z;
      vec2 aX = lpAshlar(vec2(p.z, p.y), .44, 1.0), aZ = lpAshlar(vec2(p.x, p.y), .44, 1.0), aY = lpAshlar(p.xz + vec2(.3, .7), .9, .9);
      float joint = aX.x*w.x + aZ.x*w.z + aY.x*w.y, tint = aX.y*w.x + aZ.y*w.z + aY.y*w.y;
      vec3 c = diffuseColor.rgb*vec3(1.04, 1., .93)*(.93 + .13*tint);
      float stain = smoothstep(.52, .86, fbm2(vec2((p.x + p.z)*1.4, p.y*.16)))*(1. - w.y);
      float moss = smoothstep(.55, .85, nn.y)*smoothstep(.56, .74, fbm2(p.xz*.32 + 7.));
      c *= 1. - .2*joint*(1. - fa);                               // ~20 % darker joints; 36 % reads as cartoon brick
      c = mix(c, c*vec3(.74, .72, .67), stain*.4);
      c = mix(c, vec3(.15, .2, .07), moss*.55);
      diffuseColor.rgb = c;
      gLapH = (-joint*.1 + vn(p.xz*5. + p.y*4.)*.07 + vn(p.xz*19. + p.y*17.)*.025)*(1. - fa); }`, normal:LAP_BUMP('.5') },
  // verdigris copper: pale runs of patina streaming down the domes, copper in worn patches
  roof:{ ...LAP_VERT, fragmentPars:LAP_PARS, color:`{
      vec3 p = vLocal; float st = fbm2(vec2((p.x + p.z)*2.4, p.y*.3)), wear = fbm2(p.xz*1.4 + p.y*.9 + 3.);
      vec3 c = mix(diffuseColor.rgb*.72, diffuseColor.rgb*1.7 + vec3(.02, .07, .05), smoothstep(.35, .78, st));
      diffuseColor.rgb = mix(c, vec3(.36, .19, .08), smoothstep(.72, .86, wear)*.4); gLapH = st*.4; }`, normal:LAP_BUMP('.25') },
  // aged bronze: low-frequency pits (fine pits on a mirror metal alias into glitter), verdigris in the hollows
  bronze:{ ...LAP_VERT, fragmentPars:LAP_PARS, color:`{
      vec3 p = vLocal; float v = fbm2(p.xz*2.1 + p.y*1.7), pit = vn(p.xy*4.5 + p.z*3.);
      diffuseColor.rgb = mix(diffuseColor.rgb*(.88 + .3*pit), vec3(.14, .36, .3), smoothstep(.6, .82, v)*.6);
      gLapH = pit*.1*(1. - lpFar()); }`, normal:LAP_BUMP('.08') },
  // the rock: wandering strata broken into slabs, dark joints and cracks, paler weathered crusts
  rock:{ ...LAP_VERT, fragmentPars:LAP_PARS, color:`{
      vec3 p = vLocal; float st = p.y*.42 + fbm2(p.xz*.09 + p.y*.05)*3.5, band = smoothstep(.15, .85, fract(st))*.6 + .4*fbm2(vec2(p.x + p.z, p.y*2.2)*.5);
      float crust = fbm2(p.xz*.35 + p.y*.25), crack = smoothstep(.06, 0., fract(st))*.35;
      vec3 c = diffuseColor.rgb*(.78 + .4*band)*(1. - crack);
      diffuseColor.rgb = mix(c, c*vec3(1.35, 1.2, 1.) + .02, smoothstep(.6, .88, crust)*.6);
      gLapH = band*.5 + fbm2(p.xz*1.1 + p.y*.9)*.6; }`, normal:LAP_BUMP('.8') },
  // falling water: streaks racing down; dk = 0 at the lip, 1 far down - the sheet whitens, frays and fades as it drops
  water:{ color:`{
      float f = fbm2(vec2((vLocal.x + vLocal.z)*.9, vLocal.y*.22 + uTime*2.1)), dk = smoothstep(2.5, -21., vLocal.y);
      float strand = vn(vec2((vLocal.x + vLocal.z)*1.6, vLocal.y*.08 + uTime*.35)), rag = smoothstep(dk*.75 - .05, dk*.75 + .2, strand);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), smoothstep(.4, .76, f)*.75 + dk*.35);
      diffuseColor.a *= (.45 + .55*smoothstep(.22, .7, f))*mix(1., rag, smoothstep(.05, .3, dk))*(1. - .55*dk*dk); }` },
}

// per-key PBR knobs, then the shader. glowAtNight() (clones) must run BEFORE this: a clone drops onBeforeCompile.
export function dressIsland(isle, patch, { prefix = 'island', haze } = {}){
  isle.traverse(o => { if (!o.isMesh) return
    const m = o.material, key = (m.name.match(new RegExp(`${prefix} ([a-z ]+)`)) || [])[1]?.trim()
    m.fog = false                                                       // far away exp2 fog is total: the island takes its own haze
    if (key === 'stone' || key === 'rock'){ m.roughness = .97; m.envMapIntensity = .45; if (m.specularIntensity !== undefined) m.specularIntensity = .04 }
    if (key === 'bronze'){ m.metalness = .82; m.roughness = .34 }
    if (key === 'roof'){ m.metalness = .35; m.roughness = .42 }
    if (key === 'water'){ Object.assign(m, { transparent:true, opacity:.85, depthWrite:false, side:2 /* DoubleSide */ }); o.renderOrder = 2 }
    patch(m, { fill:false, ...(SHADE[key] || {}), onShader:haze })
  })
}
