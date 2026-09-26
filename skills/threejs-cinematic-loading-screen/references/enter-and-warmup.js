// End of build(): warm up shaders behind the curtain, then arm the gate. The entering tap is the audio gesture.
// Adapt: goView(name, instant), frame(t) (your named render-loop body), controls, startTour, music.start, and the
// list of views that compile programs the opening view doesn't (underwater, night, interiors…).
export function progress(pct, caption){
  document.querySelector('#bar i').style.width = pct + '%'
  const cap = document.getElementById('loadCap'); if (!caption || cap.textContent === caption) return
  cap.classList.add('swap'); setTimeout(() => { cap.textContent = caption; cap.classList.remove('swap') }, 400)
}

export function finishLoading({ goView, frame, controls, startTour, music, warmViews = ['underwater'] }){
  const q = new URLSearchParams(location.search)
  // one frame from each view that uses different programs; measured: first dive 163 ms cold → 10 ms warmed
  if (!q.has('nowarm')) for (const v of warmViews){ goView(v, true); frame(performance.now()); frame(performance.now()) }
  goView('reference', true); frame(performance.now())       // the opening view = the still's camera; orbit starts only on enter
  progress(100)

  const L = document.getElementById('loading')
  setTimeout(() => L.classList.add('ready'), 500)           // bar fades, still fades to the live scene, "tap to enter" appears
  const wantTour = q.has('tour'), silent = q.has('silent')
  if (wantTour) L.querySelector('.enter span').textContent = 'tap to start the tour'
  if (silent) L.querySelector('.enter small')?.remove()     // no "sound on" promise in capture runs

  const enter = () => {
    if (!L.classList.contains('ready')) return
    L.classList.add('leave'); document.body.classList.remove('loading'); removeEventListener('keydown', enter)
    if (!silent) music.start()                              // inside a user gesture: the AudioContext may start
    if (wantTour) startTour(); else controls.autoRotate = true
    setTimeout(() => { L.remove(); window.__stopLoadFx && window.__stopLoadFx() }, 1500)
  }
  L.addEventListener('pointerdown', enter); addEventListener('keydown', enter)
}

// Capturing public/loading.jpg from the live scene (run once in the console / automation):
//   frame(performance.now()); renderer.domElement.toBlob(b => fetch('http://localhost:{{port}}/upload', { method:'POST', body:b }), 'image/png')
// toBlob must run in the SAME task as frame(): the drawing buffer is cleared before the next frame.
// Then: sips -Z 1600 shot.png --setProperty format jpeg --setProperty formatOptions 68 --out public/loading.jpg   (~500 KB)
