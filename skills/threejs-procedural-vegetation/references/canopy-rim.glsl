// Painterly blob trees, round two — cut a ragged, leafy outline into a lumpy canopy core in the fragment shader,
// no extra geometry. Inject after #include <color_fragment> (e.g. patch(mat, { color: CANOPY_RIM, puff:true, … })).
// Needs: vLocal (object-space position varying), vViewPosition, `normal`, and vn3/fbm3 value noise.
// Adapt: the .24 / .62 thresholds (higher = fuller silhouette) and the noise frequencies (per unit of blob radius).
// Geometry that pairs with it: icosphere detail 2 core (UVs pinned to one opaque texel of the leaf texture) plus
// ~56 small leaf cards (10–17 % of the radius) on the upper/outer surface, tipped ~50 % outward, alphaTest .5.
{
  vec3 Vv = normalize(vViewPosition);
  float rim = 1. - abs(dot(normalize(normal), Vv));          // 0 facing the eye, 1 at the silhouette
  float lobes = fbm3(vLocal*2.6 + 1.7), ln = lobes*.7 + vn3(vLocal*9.)*.3;
  if (rim > .24 + .62*ln) discard;                            // ragged, lobed outline instead of a balloon
  diffuseColor.rgb *= .72 + .42*smoothstep(.32, .68, lobes);  // clumps catch the light, gaps between them sink
}

// Trunk to go with it: flared base + three forks merged into one geometry reaching up into the clumps,
// instanced with scale (g, h, g), g = .75 + .05*h, random yaw — so no canopy floats on a stick.
