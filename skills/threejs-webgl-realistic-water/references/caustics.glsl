// Caustics for every submerged material (bed, rocks, fish, posts, piers).
// Adapt: needs uniforms uTime, uSunDir (normalised, TO the sun), uSunColor, uCaustic (strength ~1),
// and a varying vWPos (world position) set in the vertex shader after project_vertex.
// Water plane assumed at y = 0.

// ── 1) helper: add to the fragment header (after #include <common>), BEFORE any code that calls it ──
// Sharp, dancing caustic web (iterated domain warp; tiles every 2π).
float causticF(vec2 p, float t){
  vec2 q = mod(p*6.2831, 6.2831) - 250.;
  vec2 i = q; float c = 1.; float inten = .005;
  for(int n=0;n<4;n++){
    float tt = t*(1. - 3.5/float(n+1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    float sx = sin(i.x+tt), cy = cos(i.y+tt);
    // the classic formula divides by zero here → Inf → black specks. Clamp to ±1e-3.
    sx = (sx < 0. ? -1. : 1.)*max(abs(sx), 1e-3); cy = (cy < 0. ? -1. : 1.)*max(abs(cy), 1e-3);
    c += 1./max(length(vec2(q.x/(sx/inten), q.y/(cy/inten))), 1e-4);
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return min(pow(abs(c), 8.), 4.);                 // clamp the output to ≤ 4
}

// ── 2) injection: replace '#include <emissivemap_fragment>' with itself + this block ──
/*
#include <emissivemap_fragment>
{
  float under  = smoothstep(0.02, -0.08, vWPos.y);                            // only below the surface
  float depthK = exp(vWPos.y*1.2) * smoothstep(0.02, 0.22, -vWPos.y);        // fade in with depth, weaken deep down
  vec2  cp = vWPos.xz*.42 + (uSunDir.xz/uSunDir.y)*vWPos.y*.42;              // project along the sun direction
  float cr = causticF(cp + vec2(.004,0.), uTime*.55);                         // one sample per channel → chromatic
  float cg = causticF(cp,                 uTime*.55);
  float cb = causticF(cp - vec2(.004,0.), uTime*.55);
  vec3 c = vec3(cr,cg,cb) * under * depthK * uCaustic;
  // night variant: c = mix(c, sqrt(c)*.5, uCausticSoft); tint = mix(uSunColor*1.1, uCausticTint, uNight);
  totalEmissiveRadiance += diffuseColor.rgb * c * uSunColor*1.1 + c*.04;      // multiplied by albedo and sun colour
}
*/
