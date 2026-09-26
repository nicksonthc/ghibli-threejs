// Pebble riverbed + meadow bank for a terrain MeshStandardMaterial (roughness .95).
// Adapt: needs a varying vWPos (world position), noise helpers h21 (hash vec2→float), vn (2D value noise)
// and fbm2 (5-octave fbm of vn, ~0..1). Water at y = 0: pebbles below, mud at the edge, grass above.

// ── colour: replace '#include <color_fragment>' with itself + this block ──
float hgt = vWPos.y;
vec2 wp = vWPos.xz;
float n1 = fbm2(wp*.18), n2 = fbm2(wp*.9+7.), n3 = fbm2(wp*3.1);
// watercolour meadow: pooled pigment blotches between two greens + ochre warmth
vec3 gA = vec3(.12,.30,.05), gB = vec3(.38,.58,.10), gC = vec3(.55,.55,.16);
vec3 grass = mix(gA, gB, smoothstep(.3,.75,n1));
grass = mix(grass, gC, smoothstep(.62,.9,n2)*.45);
grass *= .85 + .3*n3;
// domain-warped Voronoi at two scales: gravel, and cobble patches picked by low-frequency noise
float big = step(.58, fbm2(wp*.35+9.));
vec2 warp = (vec2(fbm2(wp*1.7), fbm2(wp*1.7+5.3)) - .5) * .9;
vec2 g = wp*mix(8.5, 3.6, big) + warp; vec2 gi = floor(g), gf = fract(g);
float md = 8., md2 = 8.; vec2 id = vec2(0); vec2 mr = vec2(0);
for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
  vec2 o=vec2(x,y); vec2 r = o + vec2(h21(gi+o), h21(gi+o+19.7))*.85 - gf; float d = dot(r,r);
  if(d<md){ md2=md; md=d; id=gi+o; mr=r; } else if(d<md2) md2=d; }
// one rounded stone per cell, jittered size, set in sand (sand shows in the gaps)
float dc = sqrt(md), gap = sqrt(md2) - dc;
float rad = .30 + .16*h21(id+7.7);
float stoneM = smoothstep(rad+.05, rad-.03, dc) * smoothstep(.0, .06, gap);
float dome = sqrt(max(0., 1. - pow(dc/(rad+.05), 2.)));                               // hemispherical shading
float pick = h21(id*1.31);
vec3 stone = pick<.28 ? vec3(.50,.48,.44) : pick<.5 ? vec3(.42,.36,.28) : pick<.68 ? vec3(.58,.50,.38)
           : pick<.82 ? vec3(.34,.34,.30) : pick<.93 ? vec3(.62,.44,.30) : vec3(.74,.72,.66);
stone *= (.8 + .35*h21(id+3.3)) * (.62 + .38*dome) * (.9 + .2*vn(wp*60.));          // speckle, darker toward the rim
vec3 sand = vec3(.52,.47,.36) * (.8+.35*n2) * (.85 + .3*vn(wp*45.));
sand *= mix(.72, 1., smoothstep(.0, .12, dc - rad));                                  // contact shadow ring round each stone
float stones = smoothstep(.12,.42, fbm2(wp*.5+2.));
vec3 bed = mix(sand, stone, stoneM * stones);
bed = mix(bed, bed*vec3(.62,.82,.55), smoothstep(.55,.8,n1)*.45 * (1. - dome*.5));    // algae film, thinner on stone crowns
float pebMask = stoneM * stones * smoothstep(.02,-.1,hgt);
vec3 mud = vec3(.30,.25,.16) * (.8+.4*n3);
vec3 col = bed;
col = mix(col, mud, smoothstep(-.14,.02,hgt));
col = mix(col, grass, smoothstep(.04,.2,hgt));
diffuseColor.rgb = col;

// ── normal: replace '#include <normal_fragment_maps>' with itself + this line ──
// (both injections land in main(), colour before normal, so mr and pebMask are still in scope — don't wrap the colour block in braces)
// normal = normalize(normal + (viewMatrix*vec4(-mr.x, 0., -mr.y, 0.)).xyz * pebMask * 2.2);   // each pebble a little dome
