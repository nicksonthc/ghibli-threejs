// iWave vertical-derivative kernel: G(r) = Σ q² e^(-σq²) J0(q·r), r in texels, normalised to G(0) = 1,
// then scaled so its discrete response to a long wave matches the true vertical derivative |k|.
// Returns { taps: [[i, j, w], …], scale }. Pass taps as a uniform vec3[] and use
//   uGdt2 = g / dx * dt * dt * scale   (dx = span/size metres per texel)
// in the update  h' = (h(2 − αdt) − h_prev − uGdt2·Σ w·h(i,j)) / (1 + αdt).

export function iwaveKernel({ radius = 7, sigma = .6, calibK = .25, centreLift = .15 } = {}) {
  const J0 = x => { const ax = Math.abs(x)                     // Bessel J0 (Numerical Recipes rational approximation)
    if (ax < 8) { const y = x * x
      return (57568490574 + y * (-13362590354 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))) /
             (57568490411 + y * (1029532985 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y))))) }
    const z = 8 / ax, y = z * z, xx = ax - .785398164
    return Math.sqrt(.636619772 / ax) * (Math.cos(xx) * (1 + y * (-.1098628627e-2 + y * (.2734510407e-4 + y * (-.2073370639e-5 + y * .2093887211e-6)))) -
      z * Math.sin(xx) * (-.1562499995e-1 + y * (.1430488765e-3 + y * (-.6911147651e-5 + y * (.7621095161e-6 - y * .934935152e-7))))) }
  const dq = .001, N = 10000
  const G = r => { let s = 0; for (let n = 1; n <= N; n++) { const q = n * dq; s += q * q * Math.exp(-sigma * q * q) * J0(q * r) } return s }
  const g0 = G(0), taps = []
  for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) {
    const w = G(Math.hypot(i, j)) / g0; if (Math.abs(w) > 1e-4) taps.push([i, j, w])
  }
  // the truncated kernel dips just below zero at the finest scale; lift the centre (that mode would grow)
  taps.find(t => !t[0] && !t[1])[2] += centreLift
  // calibrate on the discrete taps: response to cos(k·x) must equal k at k = calibK rad/texel
  const resp = taps.reduce((a, [i, , w]) => a + w * Math.cos(calibK * i), 0)
  return { taps, scale: calibK / resp }
}

// Sanity check the dispersion: the response must stay positive for every k up to Nyquist, or that mode grows.
export function kernelResponse(taps, scale, k) { return scale * taps.reduce((a, [i, , w]) => a + w * Math.cos(k * i), 0) }
// for (let k = .05; k <= Math.PI; k += .05) console.assert(kernelResponse(taps, scale, k) > 0, 'unstable mode at', k)
