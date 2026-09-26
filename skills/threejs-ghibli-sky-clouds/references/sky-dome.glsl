// Painterly Ghibli sky dome — day branch only (see threejs-ghibli-night-mode for moon/stars).
// Adapt: palette uniforms, uHazeH/uHazePow, halo size. Use on SphereGeometry(500,48,24), side BackSide,
// depthWrite false, fog false, renderOrder -10. Copy scene.fog.color into `low` every frame.

// ---- vertex ----
varying vec3 vP;
void main(){
  vP = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
  gl_Position.z = gl_Position.w;                 // on the far plane
}

// ---- fragment ----
uniform vec3 top, mid, horizon, low, uSunDir, uSunColor;
uniform float uHazeH, uHazePow, uHaloSize, uHaloStr;
varying vec3 vP;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

void main(){
  vec3 d = normalize(vP); float y = d.y;
  float sunUp = smoothstep(-.05, .35, uSunDir.y);                 // low sun: the dome dims and warms
  // zenith → mid-sky → horizon warmth by view height
  float t = clamp(y, 0., 1.);
  vec3 c = mix(horizon, mid, smoothstep(0., uHazeH*1.6, t));
  c = mix(c, top, smoothstep(uHazeH, .85, pow(t, .8)));
  // non-linear haze band into the terrain fog colour: no hard horizon line
  float haze = pow(1. - smoothstep(-.04, uHazeH*.55, y), uHazePow);
  c = mix(c, low, haze);
  // warmth gathers on the sun's side of the horizon
  vec2 sxz = normalize(uSunDir.xz + 1e-4), dxz = normalize(d.xz + 1e-4);
  float toward = pow(max(dot(sxz, dxz), 0.), 3.) * (1. - smoothstep(0., .35, y));
  c = mix(c, horizon*vec3(1.05,.95,.85), toward*.45);
  // painted sun glow: three soft lobes, no disc
  float cosA = dot(d, uSunDir);
  float halo = exp(-(1. - cosA)*90./uHaloSize)*.75
             + exp(-(1. - cosA)*11./uHaloSize)*.28
             + exp(-(1. - cosA)*2.2/uHaloSize)*.08;
  vec3 sunTint = uSunColor / max(max(uSunColor.r, uSunColor.g), max(uSunColor.b, 1e-3));
  c += sunTint * halo * uHaloStr * (.5 + .5*sunUp) * smoothstep(-.08, .02, y + .06);
  c *= mix(.55, 1., sunUp);
  c += (h21(gl_FragCoord.xy) - .5) / 255.;                        // dither: no banding
  gl_FragColor = vec4(c, 1.);
}

// Starting values (sRGB hex → THREE.Color): top 0x3684d8, mid 0x8ccbee, horizon 0xf7e6c6, low = fog 0xdcefe4,
// uHazeH .14, uHazePow 2.2, uHaloSize 1, uHaloStr .9. Dusk palette to lerp toward: 0x3a5f9a / 0xe9a26f / 0xffb46a.
