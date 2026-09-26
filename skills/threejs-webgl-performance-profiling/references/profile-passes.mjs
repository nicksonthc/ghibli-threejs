// Median frame time with each pass toggled off in turn (Playwright + real Chrome GPU).
// ADAPT: URL, the ready selector, how the page exposes its objects (here window.__app = { renderer, composer, gtao, bloom, water }).
// Run: npm i playwright && node profile-passes.mjs      (serve the site first, e.g. `npx serve -l 8765`)
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:8765/?v=' + Date.now()   // cache-bust: static servers cache index.html
const b = await chromium.launch({ channel:'chrome', headless:false, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport:{ width:1000, height:675 }, deviceScaleFactor:2 })
p.on('console', m => m.type() === 'error' && console.log('[page]', m.text()))
await p.goto(URL, { waitUntil:'commit' })                        // 'load' can time out on CDN fonts
await p.waitForSelector('#loading.ready', { timeout:120000 })    // shaders compile first: the main thread blocks for seconds
await p.keyboard.press('Enter'); await p.waitForTimeout(4000)

const r = await p.evaluate(async () => {
  const A = window.__app, gl = A.renderer.getContext()
  // rAF-driven: the window must be visible (a hidden tab never fires rAF)
  const measure = () => new Promise(res => { const ts = []
    const f = t => { ts.push(t); if (ts.length < 40) requestAnimationFrame(f); else { gl.finish()
      const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b)
      res(`${d[d.length >> 1].toFixed(1)} ms median / ${d[d.length - 2].toFixed(0)} ms worst`) } }
    requestAnimationFrame(f) })
  const out = { pixelRatio:A.renderer.getPixelRatio(), base:await measure() }
  const tog = async (name, off, on) => { off(); await new Promise(r => setTimeout(r, 300)); out[name] = await measure(); on() }
  await tog('noAO',     () => A.gtao.enabled = false,  () => A.gtao.enabled = true)
  await tog('noBloom',  () => A.bloom.enabled = false, () => A.bloom.enabled = true)
  await tog('noWater',  () => A.water.visible = false, () => A.water.visible = true)
  await tog('noShadow', () => A.renderer.shadowMap.enabled = false, () => A.renderer.shadowMap.enabled = true)
  out.base2 = await measure()                                   // alternate: single runs vary ±5 fps
  out.info = `${A.renderer.info.render.calls} calls · ${(A.renderer.info.render.triangles/1e6).toFixed(2)}M tris`
  return out
})
console.log(JSON.stringify(r, null, 1))
await b.close()
