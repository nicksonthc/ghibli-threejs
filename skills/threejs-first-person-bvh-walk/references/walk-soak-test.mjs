// TEMPLATE: prove a first-person walk never sticks - flood-fill reachability, hug-and-return, random-wander soak.
//   node walk-soak-test.mjs            (site served on URL; the page exposes window.__app = { walk, walkMove, walkGround, enterWalk })
// Runs real walkMove() in the page with a fixed dt, no rendering. ADAPT: URL, the debug handle, the cell size.
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:8791/?silent'
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage()
await page.goto(URL, { waitUntil:'load' }); await page.waitForSelector('#loading.ready', { timeout:180000 })
await page.evaluate(() => window.__app.enterWalk())                  // build the BVH, place her at the spawn, phase 'walk'

// helpers inside the page: run `secs` of walkMove with a held key set at a heading
await page.evaluate(() => {
  const A = window.__app, w = A.walk
  window.__run = (x, y, z, yaw, secs, keys = { w:true }) => { w.p.set(x, y, z); w.yaw = yaw; w.vel.set(0, 0, 0); w.trail = []; w.stuckT = 0; w.keys = keys
    for (let t = 0; t < secs; t += 1/30) A.walkMove(1/30); w.keys = {}; return [w.p.x, w.p.y, w.p.z] }
})

// 1 · flood-fill: from the spawn, 8 headings x 0.3 s of real walking, bucketed to 1 m cells (x, z, floor level)
const spawn = await page.evaluate(() => window.__app.walk.p.toArray())
const key = ([x, y, z]) => `${Math.round(x)},${Math.round(y*2)/2},${Math.round(z)}`
const seen = new Map([[key(spawn), spawn]]), queue = [spawn]
while (queue.length){
  const from = queue.shift()
  const outs = await page.evaluate(([p]) => Array.from({ length:8 }, (_, i) => window.__run(p[0], p[1], p[2], i*Math.PI/4, .3)), [from])
  for (const q of outs){ const k = key(q); if (!seen.has(k)){ seen.set(k, q); queue.push(q) } }
}
console.log('reachable cells', seen.size)

// 2 · hug-and-return: from every cell walk 1.6 s straight into whatever is there, then try to walk back
let trapped = 0
for (const p of seen.values()){
  const ok = await page.evaluate(([p]) => { const yaw = Math.random()*Math.PI*2, q = window.__run(p[0], p[1], p[2], yaw, 1.6)
    const b = window.__run(q[0], q[1], q[2], yaw + Math.PI, 1.6); return Math.hypot(b[0] - q[0], b[2] - q[2]) > .3 || Math.hypot(q[0] - p[0], q[2] - p[2]) < .3 }, [p])
  if (!ok) trapped++
}
console.log('hug-and-return traps', trapped)

// 3 · soak: 30 visitors x 90 s, a new heading every 1-4 s, a lock check every 5 s (pressing on, moved < .3 m)
const soak = await page.evaluate(([s0]) => { const A = window.__app, w = A.walk; let locks = 0; const cells = new Set()
  for (let v = 0; v < 30; v++){ w.p.set(...s0); w.vel.set(0, 0, 0); w.trail = []; w.stuckT = 0
    let next = 0, check = 5, last = w.p.clone()
    for (let t = 0; t < 90; t += 1/30){
      if (t >= next){ w.yaw = Math.random()*Math.PI*2; w.keys = { w:true, shift:Math.random() < .3 }; next = t + 1 + Math.random()*3 }
      A.walkMove(1/30); cells.add(`${Math.round(w.p.x)},${Math.round(w.p.z)}`)
      if (t >= check){ if (w.p.distanceTo(last) < .3) locks++; last.copy(w.p); check += 5 } } }
  w.keys = {}; return { locks, cells:cells.size } }, [spawn])
console.log('soak lock checkpoints', soak.locks, 'cells explored', soak.cells)   // target: 0 locks; compare cells across versions

await browser.close()
process.exit(trapped || soak.locks ? 1 : 0)
