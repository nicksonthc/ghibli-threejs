// Koi shader chunks for an onBeforeCompile patch on MeshPhysicalMaterial (body, fins) and on the
// shadow's MeshDepthMaterial (same vertex chunk, so the shadow swims too).
//
// Mesh contract (object space, metres): nose at +X ≈ 0.28, tail tip at X ≈ −0.30, back at +Y,
// fish-left at −Z. One NEUTRAL mesh with no painted pattern; animation data in COLOR_0:
//   R = pectoral weight (root → tip), G = side (> .5 = left), B = flutter weight toward free edges.
// Export from Blender with export_vertex_color='ACTIVE'; in three rename it so it doesn't tint:
//   geo.setAttribute('finData', geo.attributes.color); geo.deleteAttribute('color')
//
// ADAPT: the helper `patch(material, { uniforms, vertexPars, vertexBegin, fragmentPars, color, emissive })`
// is whatever injects code at <common>, after <begin_vertex>, at <color_fragment> and after
// <emissivemap_fragment>. `fbm2` = any 2D fbm; `uTime`, `uBio*` are shared uniforms.

export const KOI_VERTEX_PARS = /* glsl */`attribute vec3 finData;
  uniform float uPhase, uSwim, uAmp, uTurn, uFinBeat, uFold; varying vec3 vObj; varying vec3 vFin;`

// inserted after #include <begin_vertex>
export const KOI_VERTEX = /* glsl */`{
  vObj = position; vFin = finData;
  float s = clamp((position.x + .30)/.58, 0., 1.);            // 0 tail tip … 1 snout
  float amp = uAmp * (.010 + .085*pow(1.-s, 2.2));           // travelling wave, amplitude grows toward the tail
  transformed.z += amp * sin(position.x*10.5 - uSwim + uPhase);      // uSwim / uFinBeat are PHASES integrated on the CPU (see koi-boids.js)
  float bx = position.x - .14; transformed.z += uTurn * bx*bx * 2.2;   // whole-body C-bend ∝ turn rate
  float side = finData.g > .5 ? -1. : 1.;
  transformed.y += finData.r * (sin(uFinBeat + (side>0.?0.:1.3)) * .016 - uFold*.004);   // pectorals flap…
  transformed.z += finData.r * side * uFold * -.028;                                            // …and tuck when sprinting
  transformed.z += finData.b * sin(uTime*4.5 + position.x*28. + position.y*37.) * .0045;       // free edges flutter
}`

// fragment: pattern from object-space position, one variety uniform per fish
export const KOI_FRAG_PARS = /* glsl */`
  uniform float uVariety, uSeed, uPhase; varying vec3 vObj; varying vec3 vFin;
  float koiScaleEdge(vec3 o){                                   // hex scale rows, atan around the body
    vec2 su = vec2(o.x*105., atan(o.z, o.y)*8.5);
    su.x += step(1., mod(floor(su.y), 2.))*.5;
    vec2 sf = fract(su) - vec2(.5);
    return smoothstep(.18, .52, length(sf*vec2(1.25,1.)));
  }
  // glow = mask the night bioluminescence maps onto (red patches, tancho spot, asagi belly…)
  vec3 koiColour(vec3 o, out float metal, out float glow){
    metal = 0.; glow = 0.;
    float top = smoothstep(-.02, .035, o.y);                    // dorsal side carries the pattern
    float belly = smoothstep(-.012, -.05, o.y);                 // pale belly
    float n = fbm2(o.xz*16. + uSeed)*.62 + fbm2(o.xy*15. + uSeed*1.7)*.38;
    float head = smoothstep(.15, .23, o.x) * (1. - smoothstep(.25, .27, o.x));
    vec3 white = vec3(.93,.92,.88), red = vec3(.80,.09,.02), black = vec3(.025,.025,.03);
    vec3 c = white;
    int v = int(uVariety + .5);
    float hi = smoothstep(.465, .495, n + top*.2 + head*.22 - .1) * (1.-belly);   // crisp patches biased to the back
    if (v == 0 || v == 1) { c = mix(white, red, hi); glow = hi; }                                    // kohaku / sanke
    if (v == 1) { float sumi = smoothstep(.60, .63, fbm2(o.xz*34. + uSeed*3.1)) * top; c = mix(c, black, sumi); }
    if (v == 2) { float bk = smoothstep(.45, .48, fbm2(o.xz*12. + uSeed*2.3)*.8 + top*.25);          // showa
                  c = mix(white, black, bk*(1.-belly*.6)); c = mix(c, red, hi*.95*(1.-bk*.5)); glow = hi*(1.-bk); }
    if (v == 3) { vec3 gold = vec3(.95,.62,.10); c = mix(gold, gold*vec3(.62,.45,.2), top*.6); metal = .75; glow = top*.45; }   // ogon
    if (v == 4) { float d = length(vec2((o.x-.19)*1.05, o.z)); float spot = smoothstep(.036, .031, d) * top; c = mix(white, red, spot); glow = spot; }   // tancho
    if (v == 5) { vec3 blue = vec3(.24,.36,.46), orng = vec3(.86,.30,.06); float dorsal = smoothstep(-.015, .04, o.y);
                  c = mix(orng, blue, dorsal); c = mix(c, white, head*top*.7); glow = 1. - dorsal; }           // asagi
    if (v == 6) { vec3 yel = vec3(.98,.78,.12); c = mix(yel*1.02, yel*.8, top*.5); glow = top*.4; }            // kigoi
    if (v == 7) { float mot = smoothstep(.5, .62, fbm2(o.xz*9. + uSeed*1.3)) * top;                            // ghost (silver)
                  c = mix(vec3(.90,.93,.98), vec3(.40,.45,.55), mot*.6); metal = .35; }
    return c;
  }`

export const KOI_BODY_COLOR = /* glsl */`{
  float m, g; vec3 c = koiColour(vObj, m, g);
  c *= 1. - .16*koiScaleEdge(vObj);                            // overlapping scale rows
  diffuseColor.rgb = c;
}`
export const KOI_FIN_COLOR = /* glsl */`{
  float m, g; vec3 c = koiColour(vObj, m, g);
  vec3 finC = mix(vec3(.96,.95,.92), c, int(uVariety+.5)==3 || int(uVariety+.5)==6 ? .85 : .25);
  float rays = .86 + .14*sin((vObj.y*1.2 + vObj.z + vObj.x*.4)*190.);   // fin rays
  diffuseColor.rgb = finC * rays;
  diffuseColor.a *= mix(.95, .45, vFin.b);                               // alpha fades to the edge
}`
// night: pulse per fish; body spots orange, fin tips cyan (vFin.b = root → tip)
export const KOI_BODY_EMISSIVE = /* glsl */`{
  float pulse = (.55 + .45*sin(uTime*uBioSpeed + uPhase*2.1)) * uBio;
  float m, g; koiColour(vObj, m, g); totalEmissiveRadiance += uBioColor * g * pulse * .6;
  if (int(uVariety+.5) == 7) totalEmissiveRadiance += vec3(.62,.72,.9) * .10 * uBio;   // ghost: faint steady silver
}`
export const KOI_FIN_EMISSIVE = /* glsl */`{
  float pulse = (.55 + .45*sin(uTime*uBioSpeed + uPhase*2.1)) * uBio;
  totalEmissiveRadiance += uBioFinColor * smoothstep(.25, 1., vFin.b) * pulse * .5;
}`

/* Materials:
   body  = MeshPhysicalMaterial({ roughness:.3, clearcoat:.9, clearcoatRoughness:.12, sheen:.4 })
           ogon: metalness .7, roughness .25; ghost: metalness .35 (NOT 1), roughness .18
   fins  = MeshPhysicalMaterial({ roughness:.35, transparent:true, opacity:.78, side:DoubleSide, depthWrite:false })
   eyes  = MeshPhysicalMaterial({ color:0x050505, roughness:.05, clearcoat:1 })
   castShadow only on the body (translucent fins print dark streaks on the back);
   o.customDepthMaterial = patch(new MeshDepthMaterial({ depthPacking:RGBADepthPacking }), { vertexPars, vertexBegin })
   Keep koi out of any toon-ramp light-loop replacement so clearcoat/sheen stay on the stock path.
   In onBeforeCompile, inject helper GLSL (fbm2) BEFORE any code that calls it. */
