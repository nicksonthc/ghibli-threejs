// Star field on the sky sphere: background (static, dim) + foreground (twinkling) + Milky-Way-packed
// stars, plus a second Points layer of "hero" stars with a four-point sparkle.
//
// ADAPT: `rng` = any seeded RNG (mulberry32), `uTime` = your shared time uniform, `mwA/mwB/mwN` =
// the Milky Way basis also used by the sky shader, `aoHidden` = the list of objects you hide for
// the GTAO pass only. Layer 1 keeps the stars out of a refraction/depth pre-pass that renders
// layer 0 only, but the mirror camera must still see layer 1 so the water reflects them.
import * as THREE from 'three'

export function buildStars({ scene, renderer, rng, uTime, mwA, mwB, mwN, aoHidden,
  counts = [2600, 700], milkyCount = 900, milkyWidth = 0.13, minPx = 2.4, twinkle = 1.6,
  heroCount = 26, heroPx = 15, heroBright = 0.7, R = 470 }) {
  const [n0, n1] = counts, N = n0 + n1 + milkyCount
  const pos = new Float32Array(N * 3), star = new Float32Array(N * 3)   // aStar = (size px, brightness, twinkle phase; 0 = static)
  const v = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const fg = i >= n0 && i < n0 + n1, milky = i >= n0 + n1
    if (milky) {
      do { const a = rng() * Math.PI * 2, off = (rng() + rng() + rng() - 1.5) * milkyWidth * .9
        v.copy(mwA).multiplyScalar(Math.cos(a)).addScaledVector(mwB, Math.sin(a)).addScaledVector(mwN, off).normalize() } while (v.y < .04)
      pos.set([v.x * R, v.y * R, v.z * R], i * 3)
    } else {
      const y = .02 + Math.pow(rng(), .8) * .98, a = rng() * Math.PI * 2, rr = Math.sqrt(1 - y * y)
      pos.set([Math.cos(a) * rr * R, y * R, Math.sin(a) * rr * R], i * 3)
    }
    // brightness stays under the bloom threshold: a blooming star is a blob
    star.set([fg ? 2.6 + rng() * 2.4 : 1.4 + rng() * 1.2, fg ? .5 + rng() * .3 : milky ? .14 + rng() * .2 : .2 + rng() * .25, fg ? .5 + rng() * 6 : 0], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aStar', new THREE.BufferAttribute(star, 3))
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime, uNight: { value: 0 }, uTwinkle: { value: twinkle }, uPR: { value: renderer.getPixelRatio() }, uMinPx: { value: minPx } },
    vertexShader: /* glsl */`attribute vec3 aStar; uniform float uTime, uNight, uTwinkle, uPR, uMinPx; varying float vA; varying float vWarm;
      void main(){
        vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
        float tw = aStar.z > 0. ? .55 + .45*sin(uTime*uTwinkle + aStar.z + dot(position, vec3(.031,.017,.023))) : 1.;
        float horizon = smoothstep(.0, .12, position.y/${R}.);
        vA = aStar.y * tw * uNight * horizon; vWarm = fract(aStar.z*7.31);
        gl_PointSize = max(aStar.x, uMinPx) * uPR; }`,          // a 1-px star flickers under camera motion
    fragmentShader: /* glsl */`varying float vA; varying float vWarm;
      void main(){ float d = length(gl_PointCoord - .5)*2.; float a = smoothstep(1., .15, d); a *= a;
        vec3 tint = mix(vec3(.8,.88,1.), vec3(1.,.92,.8), step(.8, vWarm));
        gl_FragColor = vec4(tint * a * vA, 1.); }`,
  })
  const stars = new THREE.Points(geo, mat)
  stars.frustumCulled = false; stars.layers.set(1); stars.renderOrder = -9
  scene.add(stars); aoHidden.push(stars)

  // hero stars: children of `stars`, same fade and layers
  const hp = new Float32Array(heroCount * 3), hs = new Float32Array(heroCount * 2)
  for (let i = 0; i < heroCount; i++) {
    const y = .22 + rng() * .68, a = -Math.PI * .95 + rng() * Math.PI * .9, rr = Math.sqrt(1 - y * y)
    hp.set([Math.sin(a) * rr * R * .99, y * R * .99, -Math.cos(a) * rr * R * .99], i * 3); hs.set([.6 + rng() * .5, rng() * 6.28], i * 2)
  }
  const hg = new THREE.BufferGeometry()
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hg.setAttribute('aHero', new THREE.BufferAttribute(hs, 2))
  const hero = new THREE.Points(hg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime, uNight: mat.uniforms.uNight, uPR: mat.uniforms.uPR },
    vertexShader: /* glsl */`attribute vec2 aHero; uniform float uTime, uNight, uPR; varying float vA;
      void main(){ gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.);
        float tw = .7 + .3*sin(uTime*.9 + aHero.y);
        vA = uNight * tw * smoothstep(.1, .3, position.y/${R}.);
        gl_PointSize = ${heroPx}. * aHero.x * (.85 + .15*tw) * uPR; }`,
    fragmentShader: /* glsl */`varying float vA;
      void main(){ vec2 p = (gl_PointCoord - .5)*2.; float c = cos(.2), s = sin(.2); p = mat2(c,-s,s,c)*p;
        float r = length(p), core = exp(-r*r*28.), halo = exp(-r*r*5.)*.18;
        float spikes = (exp(-abs(p.y)*38.) + exp(-abs(p.x)*38.)) * (1. - smoothstep(.1, 1., r)) * .55;
        gl_FragColor = vec4(vec3(.9,.94,1.) * (core + halo + spikes) * vA * ${heroBright}, 1.); }`,
  }))
  hero.frustumCulled = false; hero.layers.set(1); hero.renderOrder = -9; stars.add(hero)
  return stars   // drive with stars.material.uniforms.uNight.value = k * starBright
}
