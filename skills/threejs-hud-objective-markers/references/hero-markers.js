// Objective markers + fly-to. Trimmed from a working three.js r186 scene.
// Adapt: HEROES (anchor functions, show/hide distances with hysteresis), `blocked()` (loading / tour / reading / flight),
// `setCine` (your camera-owner flag), and the DOM: <button class="hero" id="…"><span class="badge">…</span>
// <span class="txt"><b>label</b><small><span class="dist"></span> <kbd>T</kbd></small></span><span class="chev"></span></button>
import * as THREE from 'three'

const EDGE = [64, 70, 104, 64]                              // insets top, right, bottom, left (px): clear of the HUD dock + wordmark
export function createMarkers({ camera, heroes, blocked }){
  // heroes: { key: { el, point(out) → Vector3|null, showOn:16, hideOn:12, offDist:8 } }
  const S = {}; for (const k in heroes) S[k] = { show:false, x:0, y:0, a:0, edge:false, d:0 }
  const v = new THREE.Vector3(), dir = new THREE.Vector3(); let distT = 0
  return function stepMarkers(dt){
    const W = innerWidth, H = innerHeight, [it, ir, ib, il] = EDGE, cx = W/2, cy = H/2
    camera.getWorldDirection(dir)
    for (const k in heroes){
      const h = heroes[k], s = S[k], el = h.el
      const p = h.point(v); if (!p){ el.classList.remove('show'); continue }
      const d = camera.position.distanceTo(p); s.d = d
      const ahead = p.clone().sub(camera.position).dot(dir) > 0
      const n = p.clone().project(camera), sx = (n.x*.5 + .5)*W, sy = (-n.y*.5 + .5)*H
      const onScreen = ahead && sx > il && sx < W - ir && sy > it && sy < H - ib
      const want = !blocked() && (onScreen ? d > (s.show ? h.hideOn : h.showOn) : d > h.offDist)   // hysteresis
      if (want !== s.show){ s.show = want; el.classList.toggle('show', want); if (want){ s.x = onScreen ? sx : cx; s.y = onScreen ? sy : cy } }
      if (!s.show) continue
      let tx = sx, ty = sy - 18; const edge = !onScreen
      if (edge && ahead){                                   // slide to the inset rectangle along the ray from the centre
        const dx = sx - cx, dy = sy - cy
        const k2 = Math.min((dx > 0 ? W - ir - cx : cx - il)/Math.max(Math.abs(dx), 1e-3), (dy > 0 ? H - ib - cy : cy - it)/Math.max(Math.abs(dy), 1e-3))
        tx = cx + dx*k2; ty = cy + dy*k2; s.a = Math.atan2(dy, dx)
      } else if (edge){                                     // behind the camera: bottom corner on its side (not a mirrored projection)
        const side = Math.sign(p.clone().applyMatrix4(camera.matrixWorldInverse).x) || 1
        tx = side > 0 ? W - ir - 40 : il + 40; ty = H - ib; s.a = side > 0 ? Math.PI*.3 : Math.PI*.7
      }
      if (edge !== s.edge){ s.edge = edge; el.classList.toggle('edge', edge) }   // class changes only on state change
      const e = 1 - Math.exp(-dt*16); s.x += (tx - s.x)*e; s.y += (ty - s.y)*e
      el.style.setProperty('--x', s.x.toFixed(1) + 'px'); el.style.setProperty('--y', s.y.toFixed(1) + 'px'); el.style.setProperty('--a', (s.a*180/Math.PI).toFixed(1) + 'deg')
    }
    if ((distT += dt) > .25){ distT = 0                      // distance text at 4 Hz
      for (const k in heroes){ const q = heroes[k].el.querySelector('.dist'), d = S[k].d; if (q) q.textContent = d < 1000 ? `${Math.round(d)} m` : `${(d/1000).toFixed(1)} km` } }
  }
}

// Fly-to on an arc. dest() is re-evaluated every frame, so a moving target is chased all the way.
export function createFlight({ camera, controls, setCine }){
  let F = null
  controls.addEventListener('start', () => { if (F){ F = null; setCine(false) } })   // the visitor grabbed the camera: yield
  return {
    flyTo(dest, onDone){
      controls.autoRotate = false
      const d = camera.position.distanceTo(dest().pos)
      F = { t:0, dur:THREE.MathUtils.clamp(1.3 + d/70, 1.3, 5), arc:Math.min(38, d*.2), fromPos:camera.position.clone(), fromTgt:controls.target.clone(), dest, onDone }
      setCine('flight')
    },
    step(dt){
      if (!F) return
      F.t = Math.min(1, F.t + dt/F.dur)
      const u = F.t, e = u < .5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3)/2, eg = 1 - Math.pow(1 - Math.min(1, u*1.25), 3)   // gaze turns early
      const { pos, tgt } = F.dest()
      camera.position.lerpVectors(F.fromPos, pos, e); camera.position.y += F.arc*Math.sin(Math.PI*u)
      controls.target.lerpVectors(F.fromTgt, tgt, eg); camera.lookAt(controls.target)
      if (u >= 1){ const done = F.onDone; F = null; setCine(false); controls.update(); done && done() }
    },
    get active(){ return !!F },
  }
}

// Watch-follow across a looping path: whiten into mist just before the wrap, cut, then clear.
// CSS: #mistCut { position:fixed; inset:0; opacity:0; transition:opacity .45s; background:radial-gradient(circle, rgba(236,242,240,.96), rgba(214,226,224,.98)); pointer-events:none }
//      body.mistcut #mistCut { opacity:1 }
export function mistCut(nearLoopEnd, didWrap, cutCameraToStart){
  if (nearLoopEnd) document.body.classList.add('mistcut')
  if (didWrap){ cutCameraToStart(); setTimeout(() => document.body.classList.remove('mistcut'), 350) }
}
