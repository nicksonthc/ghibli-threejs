// TEMPLATE — evaluate an expression in the scene page and print the result (state probes, numeric checks).
//   node ev.cjs "__app.renderer.info.render"            node ev.cjs "(() => { … return x })()"
// Keep one evaluate under ~30 s of work or the CDP call times out.
const { chromium } = require('playwright')
const URL = process.env.URL || 'http://localhost:8765/', READY = process.env.READY || '#loading.ready'
;(async () => {
  const b = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport:{ width:1280, height:720 } })
  p.on('pageerror', e => console.log('[pageerror]', e.message))
  await p.goto(URL + '?v=' + Date.now(), { waitUntil:'commit' })
  await p.waitForSelector(READY, { timeout:180000 })
  const out = await p.evaluate(expr => { const v = (0, eval)(expr); return JSON.parse(JSON.stringify(v ?? null)) }, process.argv[2] || 'document.visibilityState')
  console.log(JSON.stringify(out, null, 1))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
