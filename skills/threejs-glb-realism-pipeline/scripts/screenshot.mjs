#!/usr/bin/env node
// Serve the realism viewer and capture fixed camera views with headless Chromium.
//
// Usage:
//   node screenshot.mjs --root . --model realism/build/scene.opt.glb --out realism/shots/iter-1 \
//        [--hdri hdri/warehouse.hdr] [--params "exposure=1.1&weather=0.6"] \
//        [--views eye,aisle] [--size 1600x900] [--serve] [--port 8765]
//
// --serve only starts the server and prints the interactive URL (GUI panel enabled).
// Paths for --model / --hdri are relative to --root.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const root = path.resolve(args.root || '.');
const viewerDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'viewer');
const port = parseInt(args.port || '8765', 10);
const [W, H] = String(args.size || '1600x900').split('x').map(Number);
if (!args.model) { console.error('--model is required'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream', '.wasm': 'application/wasm' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const base = url.startsWith('/__viewer/') ? viewerDir : root;
  const rel = url.startsWith('/__viewer/') ? url.slice('/__viewer/'.length) : url.slice(1);
  const file = path.resolve(base, rel || 'index.html');
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const qs = new URLSearchParams(String(args.params === true ? '' : args.params || ''));
qs.set('model', '/' + path.relative(root, path.resolve(root, args.model)).split(path.sep).join('/'));
if (args.hdri) qs.set('hdri', '/' + path.relative(root, path.resolve(root, args.hdri)).split(path.sep).join('/'));
const baseUrl = `http://127.0.0.1:${port}/__viewer/index.html?${qs}`;

if (args.serve) {
  console.log(`Viewer: ${baseUrl}\nCtrl+C to stop.`);
} else {
  const { chromium } = await import('playwright');
  const out = path.resolve(args.out || 'realism/shots/latest');
  fs.mkdirSync(out, { recursive: true });

  const attempts = [
    ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'],
    ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  ];
  let ok = false;
  for (const flags of attempts) {
    const browser = await chromium.launch({ args: flags });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    try {
      await page.goto(baseUrl + '&shot=1', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
      const err = await page.evaluate(() => window.__error);
      if (err) throw new Error(err);
      const info = await page.evaluate(() => window.__info);
      const wanted = args.views && args.views !== true ? String(args.views).split(',') : info.views;
      // Detect a blank frame (failed WebGL) before trusting the screenshots.
      const blank = await page.evaluate(() => {
        const c = document.querySelector('canvas'); const t = document.createElement('canvas'); t.width = 32; t.height = 32;
        const x = t.getContext('2d'); x.drawImage(c, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data;
        let mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; mn = Math.min(mn, v); mx = Math.max(mx, v); }
        return mx - mn < 6;
      });
      if (blank) throw new Error('blank frame (WebGL likely unavailable with these flags)');
      for (const v of wanted) {
        await page.evaluate((name) => window.__setView(name), v);
        const file = path.join(out, `${v}.png`);
        await page.locator('canvas').screenshot({ path: file });
        console.log('saved', file);
      }
      fs.writeFileSync(path.join(out, 'params.txt'), `${baseUrl}\nflags: ${flags.join(' ')}\ninfo: ${JSON.stringify(info)}\n`);
      ok = true;
    } catch (e) {
      console.warn(`Attempt with ${flags.join(' ')} failed: ${e.message}`);
      if (logs.length) console.warn(logs.slice(-15).join('\n'));
    }
    await browser.close();
    if (ok) break;
  }
  server.close();
  if (!ok) { console.error('Screenshots failed. Check that the model path is correct and that the CDN (cdn.jsdelivr.net) is reachable.'); process.exit(1); }
}
