// An openable book: two hinged halves sharing one spread CanvasTexture, handwriting revealed by a clip rect,
// pagination from JSON, and a real page flip toward the reader. Trimmed from a working three.js r186 scene.
// Adapt: BOOK_W/H (metres), fonts, the doodle, and where the group sits (see orientBook).
import * as THREE from 'three'

export const BOOK_W = .165, BOOK_H = .23, MAX_LINES = 9, WRITE_CPS = 16, FLIP_SECONDS = 1.15
export const PAGE_FONT = '600 58px Caveat, cursive', CITE_FONT = 'italic 500 40px Caveat, cursive', LINE_H = 62*1.25

export function buildOpenBook(renderer){
  const cv = Object.assign(document.createElement('canvas'), { width:1400, height:980 })
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  // map + emissiveMap: the pages stay readable in the shade under the lifted book
  const pageMat = new THREE.MeshStandardMaterial({ map:tex, emissive:0xffffff, emissiveMap:tex, emissiveIntensity:.5, roughness:.9, side:THREE.DoubleSide })
  const coverMat = new THREE.MeshStandardMaterial({ color:0x4c6b43, roughness:.7 }), blockMat = new THREE.MeshStandardMaterial({ color:0xeadfc4, roughness:.95 })
  const half = side => {
    const h = new THREE.Group(), geo = new THREE.PlaneGeometry(BOOK_W, BOOK_H, 16, 1), pos = geo.attributes.position, uv = geo.attributes.uv
    for (let i = 0; i < pos.count; i++){
      const t = pos.getX(i)/BOOK_W + .5, fromSpine = side < 0 ? 1 - t : t
      pos.setZ(i, .016*Math.sin(Math.min(1, fromSpine*1.6)*Math.PI*.5))            // pages bow up out of the gutter
      uv.setX(i, side < 0 ? uv.getX(i)*.5 : .5 + uv.getX(i)*.5)                     // each half reads its half of the spread
    }
    geo.computeVertexNormals()
    const page = new THREE.Mesh(geo, pageMat); page.position.x = side*BOOK_W/2
    const block = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W, BOOK_H*.99, .012), blockMat); block.position.set(side*BOOK_W/2, 0, -.006)
    const cover = new THREE.Mesh(new THREE.BoxGeometry(BOOK_W + .008, BOOK_H + .012, .004), coverMat); cover.position.set(side*(BOOK_W + .008)/2, 0, -.014)
    h.add(page, block, cover); return h
  }
  const left = half(-1), right = half(1), group = new THREE.Group(); group.add(left, right)

  // the flipping leaf: pivot at the spine; front (FrontSide) = page just read, back (BackSide) = next doodle, one canvas (front | back)
  const lcv = Object.assign(document.createElement('canvas'), { width:1400, height:980 })
  const ltex = new THREE.CanvasTexture(lcv); ltex.colorSpace = THREE.SRGBColorSpace
  const leafMat = side => new THREE.MeshStandardMaterial({ map:ltex, emissive:0xffffff, emissiveMap:ltex, emissiveIntensity:.5, roughness:.9, side })
  const leafGeo = back => { const g = new THREE.PlaneGeometry(BOOK_W, BOOK_H, 24, 1), uv = g.attributes.uv
    for (let i = 0; i < uv.count; i++){ const t = uv.getX(i); uv.setX(i, back ? .5 + (1 - t)*.5 : t*.5) }   // BackSide renders mirrored: reverse u
    g.translate(BOOK_W/2, 0, 0); return g }
  const front = new THREE.Mesh(leafGeo(false), leafMat(THREE.FrontSide)), backM = new THREE.Mesh(leafGeo(true), leafMat(THREE.BackSide))
  const pivot = new THREE.Group(); pivot.add(front, backM); pivot.visible = false; group.add(pivot)
  return { group, left, right, ctx:cv.getContext('2d'), tex, leaf:{ pivot, front, back:backM, ctx:lcv.getContext('2d'), tex:ltex },
           pages:[], page:0, write:0, lift:0, open:0 }
}

// Word wrap; a run wider than the page (a URL, or CJK with no spaces) breaks character by character.
export function wrapLine(g, text, maxW){
  const out = []; let cur = ''
  const push = w => { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur){ out.push(cur); cur = w } else cur = t }
  text.split(' ').forEach(w => {
    if (g.measureText(w).width <= maxW) return push(w)
    for (const ch of w){ const t = cur + ch; if (g.measureText(t).width > maxW && cur){ out.push(cur); cur = ch } else cur = t }
  })
  out.push(cur); return out
}
export const pageMaxW = book => book.ctx.canvas.width/2 - 120
export function wrapEntry(book, text){                      // measured exactly as the page paints (the editor reuses this)
  const g = book.ctx; g.font = PAGE_FONT; const lines = []
  String(text ?? '').split(/\n/).forEach(par => lines.push(...wrapLine(g, par, pageMaxW(book)))); return lines
}
// entries [{text, cite} | string] → pages; spill past MAX_LINES, cite on the last page of an entry
export function paginate(book, entries){
  book.pages = []
  for (const e of entries){
    const ent = typeof e === 'string' ? { text:e } : (e || {}), lines = wrapEntry(book, ent.text)
    for (let i = 0; i < Math.max(1, lines.length); i += MAX_LINES)
      book.pages.push({ lines:lines.slice(i, i + MAX_LINES), cite:i + MAX_LINES >= lines.length ? String(ent.cite ?? '') : '' })
  }
  if (!book.pages.length) book.pages.push({ lines:[''], cite:'' })
}

// Handwriting revealed up to `write` (0..1): clip each line at the pen tip (whole glyphs + a fraction of the next one).
export function drawText(g, ox, page, write){
  g.fillStyle = '#26354f'; g.font = PAGE_FONT; g.textBaseline = 'alphabetic'; g.textAlign = 'left'
  const total = page.lines.reduce((n, l) => n + l.length, 0); let chars = write*(total + 8)
  page.lines.forEach((line, i) => {
    const y = 210 + i*LINE_H, x0 = ox + 64, n = Math.min(line.length, chars); chars -= line.length
    if (n <= 0) return
    const whole = Math.floor(n), wPart = g.measureText(line.slice(0, whole)).width
    const next = line[whole] ? g.measureText(line[whole]).width*(n - whole) : 0
    g.save(); g.beginPath(); g.rect(x0 - 10, y - 70, wPart + next + 10, 100); g.clip(); g.fillText(line, x0, y); g.restore()
  })
  if (page.cite){                                            // the attribution fades in last
    g.globalAlpha = THREE.MathUtils.clamp((chars - 2)/6, 0, 1); g.font = CITE_FONT; g.fillStyle = '#5a4630'; g.textAlign = 'right'
    g.fillText(page.cite, ox + 630, 210 + page.lines.length*LINE_H + 40); g.textAlign = 'left'; g.globalAlpha = 1
  }
}

// Distance at which the open spread fills ~85% of the view (both axes).
export function readingDistance(camera){
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2*Math.atan(Math.tan(vf/2)*camera.aspect)
  return Math.max((BOOK_W*2*1.18/2)/Math.tan(hf/2), (BOOK_H*1.18/2)/Math.tan(vf/2))
}

// Per frame: orient for a reader lying down (headDir = toward the top of their head), tent → flat as `open` goes 0 → 1.
export function orientBook(book, home, headDir){
  const down = new THREE.Vector3(0, -1, 0), x = new THREE.Vector3().crossVectors(headDir, down)
  book.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, headDir, down))
  book.group.position.copy(home).add(new THREE.Vector3(0, .03 + book.lift, 0))
  const tent = THREE.MathUtils.degToRad(58), flat = THREE.MathUtils.degToRad(7), a = tent + (flat - tent)*book.open
  book.left.rotation.y = a; book.right.rotation.y = -a
}

// The flip: toward the reader (+z), over the spine, down onto the left half; a bow while it travels.
// Before calling: paint the leaf canvas (front = page just read, back = next doodle), blank the static right page.
export async function flipLeaf(book, tweenP){
  const leaf = book.leaf, a = THREE.MathUtils.degToRad(7)
  const pF = leaf.front.geometry.attributes.position, pB = leaf.back.geometry.attributes.position
  leaf.pivot.visible = true
  await tweenP(FLIP_SECONDS, k => {
    leaf.pivot.rotation.y = -a - (Math.PI - 2*a)*k            // ends at −π + a, coincident with the left half
    const bow = .03*Math.sin(k*Math.PI)
    for (let i = 0; i < pF.count; i++){ const z = bow*Math.sin(pF.getX(i)/BOOK_W*Math.PI); pF.setZ(i, z); pB.setZ(i, z) }
    pF.needsUpdate = pB.needsUpdate = true
  }, t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2)
  leaf.pivot.visible = false
}
