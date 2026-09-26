// TEMPLATE — shot-list capture for a three.js page, derived from a working setup; adapt before use.
// Assumes the page exposes window.__app = { renderer, camera, controls, frame, setNight?, … } and a
// ready selector. Every frame is stepped by hand, so a hidden/background tab can't give stale images.
//
//   npm i playwright && npx serve -l 8765 .   (in another shell)
//   node capture.cjs shots.json out/          (or edit SHOTS below)
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')

const URL = process.env.URL || 'http://localhost:8765/'
const READY = process.env.READY || '#loading.ready'
const OUT = process.argv[3] || 'shots'
const VIEWPORT = { width:1280, height:720 }                 // add a phone portrait run: { width:390, height:844 }
// name, pos [x,y,z] or posExpression (JS evaluated in the page), target, night (0..1), js (setup code), frames, log (expression)
const SHOTS = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [
  { name:'reference', pos:[6, 4, 12], target:[0, .5, 0], frames:6 },
  { name:'eye-level', pos:[3, 1.6, 6], target:[0, 1, 0], frames:6 },
  { name:'max-zoom-out', posExpression:'[0, 40, 80]', target:[0, 0, 0], frames:6 },
  { name:'night', pos:[6, 4, 12], target:[0, .5, 0], night:1, frames:90, log:'__app.night && __app.night.k' },   // fades need ~80 stepped frames
]

;(async () => {
  fs.mkdirSync(OUT, { recursive:true })
  const browser = await chromium.launch({ channel:'chrome', headless:true,
    args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })   // Linux: '--use-angle=gl'
  const page = await browser.newPage({ viewport:VIEWPORT })
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log(`[page ${m.type()}]`, m.text()) })
  page.on('pageerror', e => console.log('[pageerror]', e.message))
  await page.goto(URL + '?v=' + Date.now(), { waitUntil:'commit' })   // cache-bust; 'load' can time out on CDN fonts
  await page.waitForSelector(READY, { timeout:180000 })              // shader compiles block the main thread for seconds
  await page.keyboard.press('Enter').catch(() => {})                 // leave a "tap to enter" gate, if any
  await page.waitForTimeout(1500)

  for (const s of SHOTS){
    const res = await page.evaluate(async s => {
      const A = window.__app, THREE_V = (a) => ({ x:a[0], y:a[1], z:a[2] })
      A.renderer.setAnimationLoop(null)                               // own the clock
      if (s.night !== undefined && A.setNight) A.setNight(s.night > .5)
      if (s.js) (0, eval)(s.js)
      const pos = s.posExpression ? (0, eval)(s.posExpression) : s.pos
      if (pos){ const p = THREE_V(pos); A.camera.position.set(p.x, p.y, p.z) }
      if (s.target){ const t = THREE_V(s.target); A.controls.target.set(t.x, t.y, t.z); A.camera.lookAt(t.x, t.y, t.z) }
      A.controls.update && A.controls.update()
      // a timestamp is required: frame() without one rendered a white canvas
      window.__t = window.__t ?? performance.now()
      for (let i = 0; i < (s.frames || 4); i++){ window.__t += 50; A.frame(window.__t) }
      const log = s.log ? (0, eval)(s.log) : undefined
      // read in the SAME task as the frames (no preserveDrawingBuffer needed)
      return { png:A.renderer.domElement.toDataURL('image/png'), log, visibility:document.visibilityState }
    }, s)
    const file = path.join(OUT, `${s.name}.png`)
    fs.writeFileSync(file, Buffer.from(res.png.split(',')[1], 'base64'))
    console.log(file, res.log !== undefined ? `log=${JSON.stringify(res.log)}` : '', res.visibility)
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })
