// Night branch of a painterly sky-dome fragment shader: indigo gradient, painted Milky Way,
// a shooting star computed in-shader, and a storybook moon (mottled disc + halo + glowing rim).
//
// ADAPT: `d` is the normalised view direction (sky sphere position), `t = clamp(d.y,0,1)`,
// `haze` is the day shader's horizon-haze weight, `low` is the live terrain fog colour and `c`
// the day colour. `fbm2` / `h21` are any 2D fbm and 2D->1D hash. Constants in CAPS are baked
// from JS with template literals (e.g. `${MILKY_WIDTH}`); keep MILKY_STR ~0.075, MOON_BRIGHT ~0.8.
//
// uniforms: vec3 nTop, nMid, nHorizon, uMoonDir, uMoonColor, uMwN, uMwA, uMwB;
//           float uNight, uMoonSize, uMoonBright, uMoonHalo, uMoonHaloStr, uMoonRim, uTime, uMwStr;

// ── gradient: indigo zenith → luminous mid-blue → cool teal horizon, haze ramps into the dark fog
vec3 nc = mix(nHorizon, nMid, smoothstep(0., .22, t));
nc = mix(nc, nTop, smoothstep(.12, .8, pow(t, .85)));
nc = mix(nc, low, haze);
vec2 dxz = normalize(d.xz + 1e-4), mxz = normalize(uMoonDir.xz + 1e-4);
nc += nHorizon * pow(max(dot(mxz, dxz), 0.), 2.) * (1. - smoothstep(0., .45, d.y)) * .25; // moon side of the horizon glows

// ── Milky Way: exp(-d²/w²) around one great circle (pole uMwN, basis uMwA/uMwB), fbm dust, dark rift
float mwd = dot(d, uMwN), mwa = atan(dot(d, uMwB), dot(d, uMwA));
float band = exp(-mwd*mwd/(MILKY_WIDTH*MILKY_WIDTH));
float dust = fbm2(vec2(mwa*3.1, mwd*7.) + 4.2);
float rift = smoothstep(.42, .66, fbm2(vec2(mwa*5.3 + 1.7, mwd*19.)));
float core = exp(-mwd*mwd/((MILKY_WIDTH*.35)*(MILKY_WIDTH*.35)));
nc += vec3(.62, .68, .95) * uMwStr * band * (.25 + .95*dust + .5*core) * (1. - .65*rift*core) * smoothstep(.04, .3, d.y);

// ── shooting star: one slot every SHOOT_PERIOD s (~22), ~30 % empty, life SHOOT_SECONDS (~1.1)
{ float slot = floor(uTime/SHOOT_PERIOD), ph = uTime - slot*SHOOT_PERIOD;
  float go = step(.3, h21(vec2(slot, 7.1)));
  if (go > 0. && ph < SHOOT_SECONDS){
    float az = (h21(vec2(slot, 1.3)) - .5)*2.2, el = .55 + h21(vec2(slot, 2.9))*.5;
    vec3 s0 = vec3(sin(az)*cos(el), sin(el), -cos(az)*cos(el));
    vec3 side = normalize(cross(s0, vec3(0., 1., 0.))) * (h21(vec2(slot, 5.5)) < .5 ? -1. : 1.);
    vec3 dir = normalize(side*.8 - vec3(0., .6, 0.)); dir = normalize(dir - s0*dot(dir, s0));  // tangent to the sky
    float life = ph/SHOOT_SECONDS;
    vec3 head = normalize(s0 + dir*life*.55);
    vec3 q = d - head; float along = -dot(q, dir);
    float perp = length(q + dir*along);
    float tail = step(0., along) * (1. - smoothstep(0., SHOOT_LENGTH, along));
    float w = exp(-perp*perp/(2.*.0011*.0011)) + .25*exp(-perp*perp/(2.*.004*.004));
    nc += vec3(.88, .94, 1.) * w * tail * tail * sin(3.14159*life) * SHOOT_BRIGHT;
  } }

// ── the moon: project onto its tangent plane, paint maria with fbm, soft limb, halo, rim outline
float ang = acos(clamp(dot(d, uMoonDir), -1., 1.));
vec3 mx = normalize(cross(uMoonDir, vec3(0., 1., 0.))), my = cross(mx, uMoonDir);
vec2 muv = vec2(dot(d, mx), dot(d, my)) / uMoonSize;          // |muv| = 1 at the limb
float mare = fbm2(muv*2.6 + 7.3);
vec3 moon = uMoonColor * (1. - .42*smoothstep(.44, .68, mare)) * (.86 + .14*(1. - clamp(dot(muv, muv), 0., 1.)));
float disc = 1. - smoothstep(uMoonSize*.82, uMoonSize*1.06, ang);
float above = smoothstep(-.08, .02, d.y + .06);
float mhalo = exp(-ang*ang/(uMoonHalo*uMoonHalo))*.5 + exp(-ang/(uMoonHalo*3.5))*.14;   // the halo feeds bloom
nc += uMoonColor * vec3(1., .97, .9) * mhalo * uMoonHaloStr * above;
nc += moon * disc * uMoonBright;                                // ~0.8–1.0 linear: under the bloom threshold
float rimD = (ang - uMoonSize)/(uMoonSize*.16);
nc += uMoonColor * vec3(1., .98, .92) * exp(-rimD*rimD) * uMoonRim * above;

c = mix(c, nc, uNight);
c += (h21(gl_FragCoord.xy) - .5) / 255.;                        // dither: no banding
