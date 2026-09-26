// Ghibli split-tone grade, as the fragment shader of a ShaderPass placed BEFORE OutputPass (linear HDR input).
// Adapt: uniforms from the Tune panel. Day: sat 1.18, warm .05, vig .28, hi 0xffe2bf, sh 0x8ec6cf, mid white,
// split .35, amount .42. Night (lerp by the night blend k): sat ~1.28, mid-tone tint cool blue, shadows toward
// deep teal/purple, highlights toward silver.
uniform sampler2D tDiffuse;
uniform float uSat, uWarm, uVig, uSplit, uSplitAmt;
uniform vec3 uHiTint, uShTint, uMidTint;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = mix(vec3(l), col, uSat);                                   // saturation
  col *= vec3(1. + uWarm, 1. + uWarm*.3, 1. - uWarm*.7);           // overall warmth
  // split toning: teal/cyan mid-shadows, gold/peach highlights; mid-tones take their own tint (cool blue at night)
  float sh = 1. - smoothstep(0., uSplit, l), hi = smoothstep(uSplit, 1.1, l);
  col *= mix(vec3(1.), uShTint, sh*uSplitAmt);
  col *= mix(vec3(1.), uMidTint, (1. - sh - hi)*uSplitAmt);
  col *= mix(vec3(1.), uHiTint, hi*uSplitAmt);
  float v = smoothstep(1.05, .3, length((vUv - .5)*vec2(1.15, 1.)));
  col *= mix(1. - uVig, 1., v);                                   // vignette
  gl_FragColor = vec4(col, c.a);
}
