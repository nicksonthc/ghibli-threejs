// Synchronous per-pass GPU timing inside the page (paste into devtools or an automation evaluate).
// ADAPT: the `passes` object — each entry renders exactly one pass the way your frame() does.
// Why this shape: gl.finish() + a 1-px readPixels of the DEFAULT framebuffer forces the GPU to finish.
// readPixels(RGBA, UNSIGNED_BYTE) on a HalfFloat render target is INVALID_OPERATION and silently
// measures CPU submit time only — always read back from the canvas (setRenderTarget(null)).
export function timePasses(renderer, passes, runs = 12){
  const gl = renderer.getContext(), px = new Uint8Array(4)
  const sync = () => { renderer.setRenderTarget(null); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
  const out = {}
  for (const [name, run] of Object.entries(passes)){
    run(); sync()                                   // warm-up: includes shader compiles
    const ms = []
    for (let i = 0; i < runs; i++){ sync(); const t0 = performance.now(); run(); sync(); ms.push(performance.now() - t0) }
    ms.sort((a, b) => a - b); out[name] = +ms[ms.length >> 1].toFixed(2)   // median
  }
  return out
}

// Example (names from a scene with water pre-passes + EffectComposer):
// timePasses(renderer, {
//   shadow:     () => { renderer.shadowMap.needsUpdate = true; renderer.setRenderTarget(refractRT); renderer.render(emptyScene, camera) },
//   refraction: () => { water.visible = false; camera.layers.set(0); renderer.setRenderTarget(refractRT); renderer.render(scene, camera); camera.layers.enable(1); water.visible = true },
//   reflection: () => { renderer.clippingPlanes = waterClip; renderer.setRenderTarget(reflectRT); renderer.render(scene, mirrorCam); renderer.clippingPlanes = [] },
//   composer:   () => composer.render(),
// })

// Measure a first-time hitch (e.g. the first dive) with direct frame() calls — works in a hidden tab too:
// const gl = renderer.getContext(); goView('underwater', true)
// const t0 = performance.now(); frame(performance.now()); gl.finish(); console.log('first dive', performance.now() - t0, 'ms')
