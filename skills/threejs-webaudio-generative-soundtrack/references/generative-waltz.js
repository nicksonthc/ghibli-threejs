// A live-synthesised original waltz + river and birdsong ambience + a thunder hook. Trimmed from a working scene.
// Adapt: MEL / CH (write YOUR OWN melody and chords — never transcribe a copyrighted theme), BPM, MUSIC_VOLUME,
// SONG_URL ('' = synth), and the storm intensity passed to thunder().
export const SONG_URL = ''            // e.g. 'public/song.mp3' to loop a file instead of the synth
const MUSIC_VOLUME = .5

export const music = (() => {
  let ctx = null, master = null, bus, wet, timer = null, nextT = 0, step = 0, on = false
  const song = SONG_URL ? Object.assign(new Audio(SONG_URL), { loop:true, preload:'auto' }) : null
  const BPM = 76, BEAT = 60/BPM
  const mtof = m => 440*Math.pow(2, (m - 69)/12)
  // 16 bars of 3/4 in F major — [midi, beats], each bar sums to 3
  const MEL = [[[72,1],[69,1],[65,1]],[[67,1.5],[69,.5],[67,1]],[[65,1],[74,1],[72,1]],[[69,2],[65,1]],
               [[70,1],[69,.5],[67,.5],[74,1]],[[72,2],[64,1]],[[65,1],[69,1],[72,1]],[[67,3]],
               [[74,1.5],[76,.5],[77,1]],[[76,2],[72,1]],[[74,1],[72,1],[70,1]],[[69,2],[72,1]],
               [[70,1.5],[69,.5],[67,1]],[[77,1.5],[76,.5],[74,1]],[[72,1],[74,.5],[76,1.5]],[[77,3]]]
  // [bass, chord tones…] per bar
  const CH = [[53,60,65,69],[52,60,64,67],[50,57,62,65],[46,58,62,65],[43,58,62,67],[48,60,64,67],[53,60,65,69],[48,60,64,67],
              [50,57,62,65],[45,57,60,64],[46,58,62,65],[45,60,65,69],[43,58,62,67],[46,58,62,65],[48,60,65,67],[53,60,65,69]]

  function reverb(){                                          // generated impulse: decaying stereo noise, 3.2 s
    const len = ctx.sampleRate*3.2, buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++){ const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1)*Math.pow(1 - i/len, 2.6) }
    const cv = ctx.createConvolver(); cv.buffer = buf; return cv
  }
  function piano(m, t, dur, vel = .22){                       // triangle + sine partial, closing low-pass
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), g2 = ctx.createGain()
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = mtof(m); o2.frequency.value = mtof(m)*2.002; g2.gain.value = .25
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + .008); g.gain.exponentialRampToValueAtTime(vel*.35, t + .35); g.gain.exponentialRampToValueAtTime(.0008, t + dur + 1.2)
    o1.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(bus)
    o1.start(t); o2.start(t); o1.stop(t + dur + 1.3); o2.stop(t + dur + 1.3)
  }
  function strings(ms, t, dur){                               // detuned saws through a soft low-pass
    ms.forEach(m => [-.06, .06].forEach(det => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter()
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det*100
      f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = .4
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.018, t + dur*.45); g.gain.linearRampToValueAtTime(0, t + dur + .4)
      o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + dur + .5) }))
  }
  function bell(m, t){                                        // FM music box
    const o = ctx.createOscillator(), g = ctx.createGain(), o2 = ctx.createOscillator(), g2 = ctx.createGain()
    o.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m)*3.5; g2.gain.value = mtof(m)*.8
    o2.connect(g2).connect(o.frequency)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + .005); g.gain.exponentialRampToValueAtTime(.0005, t + 1.6)
    o.connect(g).connect(bus); o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7)
  }
  function ambience(){                                        // river: brown noise through a breathing band-pass
    const len = ctx.sampleRate*4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let last = 0
    for (let i = 0; i < len; i++){ last = (last + .02*(Math.random()*2 - 1))/1.02; d[i] = last*3.2 }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = .5
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .09; lg.gain.value = 260; lfo.connect(lg).connect(bp.frequency); lfo.start()
    const g = ctx.createGain(); g.gain.value = .11; src.connect(bp).connect(g).connect(master); src.start()
  }
  function bird(t){                                           // 2–5 frequency-swept chirps, into the reverb
    const n = 2 + (Math.random()*4 | 0), base = 2600 + Math.random()*1800
    for (let i = 0; i < n; i++){ const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i*(.09 + Math.random()*.06)
      o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base*(1.3 + Math.random()*.5), s + .05); o.frequency.exponentialRampToValueAtTime(base*.9, s + .09)
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.018, s + .01); g.gain.exponentialRampToValueAtTime(.0003, s + .1)
      o.connect(g).connect(wet); o.start(s); o.stop(s + .12) }
  }
  function schedule(){                                        // look-ahead: always 0.6 s of music queued on the audio clock
    while (nextT < ctx.currentTime + .6){
      const bar = step % 16, pass = Math.floor(step/16) % 2, t = nextT, ch = CH[bar]
      piano(ch[0] - 12, t, BEAT*2.5, .2); piano(ch[0], t, BEAT*2.5, .12)                        // oom
      ch.slice(1).forEach(m => { piano(m, t + BEAT, BEAT*.9, .07); piano(m, t + BEAT*2, BEAT*.9, .06) })   // pah pah
      strings(ch.slice(1).map(m => m - 12), t, BEAT*3)
      let b = 0
      MEL[bar].forEach(([m, len]) => { piano(m, t + b*BEAT, len*BEAT, .19); if (pass) bell(m + 12, t + b*BEAT); b += len })
      if (Math.random() < .35) bird(t + Math.random()*BEAT*3)
      nextT += BEAT*3; step++
    }
  }
  function start(){
    if (!ctx){
      ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination)
      const comp = ctx.createDynamicsCompressor(), wg = ctx.createGain(); bus = ctx.createGain(); wet = reverb(); wg.gain.value = .45
      bus.connect(comp); bus.connect(wet); wet.connect(wg).connect(comp); comp.connect(master)
      ambience()
      if (song) ctx.createMediaElementSource(song).connect(master)
    }
    ctx.resume(); nextT = ctx.currentTime + .1
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(MUSIC_VOLUME, ctx.currentTime + 1.5)
    if (song) song.play().catch(e => console.warn('song did not start:', e.message)); else timer = setInterval(schedule, 120)
    on = true
  }
  function stop(){
    clearInterval(timer); on = false; master.gain.linearRampToValueAtTime(0, ctx.currentTime + .8)
    setTimeout(() => { if (on) return; song && song.pause(); ctx.suspend() }, 900)
  }
  return { start, stop, toggle(){ on ? stop() : start(); return on }, get on(){ return on } }
})()

// Arm on the first gesture anywhere (capture phase, one-shot). ?silent never arms.
export function armOnFirstGesture(onStart = () => {}){
  if (new URLSearchParams(location.search).has('silent')) return
  document.body.classList.add('musicPending')
  ;['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, function arm(){
    removeEventListener(ev, arm, true); if (!music.on){ music.start(); onStart() } document.body.classList.remove('musicPending')
  }, true))
}

// Thunder after a lightning flash: brown noise, long tail, low-passed; only if the visitor let sound start.
let thunderCtx = null
export function thunder(delay, intensity = 1){
  if (!music.on || new URLSearchParams(location.search).has('silent')) return
  try {
    thunderCtx ||= new AudioContext()
    const c = thunderCtx, len = c.sampleRate*4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++){ last = (last + .02*(Math.random()*2 - 1))/1.02; d[i] = last*3.5*Math.pow(1 - i/len, 1.6)*(i < c.sampleRate*.05 ? i/(c.sampleRate*.05) : 1) }
    const src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain()
    src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 160 + Math.random()*120; g.gain.value = .55*intensity
    src.connect(lp).connect(g).connect(c.destination); src.start(c.currentTime + delay)   // call with delay 1.2–3.4 s after the flash
  } catch(e){}
}
