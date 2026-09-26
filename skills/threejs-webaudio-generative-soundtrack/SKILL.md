---
name: threejs-webaudio-generative-soundtrack
description: Composes and synthesises an original soundtrack live with the Web Audio API for a three.js / WebGL scene — a gentle 3/4 waltz from [midi, beats] arrays played by a triangle+sine piano with filter envelopes, a detuned-saw string pad and an FM music box, through a generated convolution reverb and compressor, scheduled with a look-ahead timer; plus ambience (brown-noise river through an LFO band-pass, random FM birdsong), a storm thunder rumble, fade in/out, a music toggle, gesture-gated start and an optional audio-file fallback. Use when adding background music, ambient sound, generative/procedural audio, a Ghibli-style or storybook theme, nature ambience, thunder, or a music toggle to a web scene without shipping copyrighted audio.
---

# Generative soundtrack with Web Audio

An original piece (never a copy of a copyrighted theme) synthesised in the browser: a 16-bar waltz in a major key,
piano melody over a bass-and-chord left hand, a soft string pad, and on the repeat an octave-up music box doubling
the melody. Underneath, a looping river and occasional birdsong. Everything starts on the visitor's first gesture,
fades in over 1.5 s, and toggles off with a fade. No audio assets required; an MP3 can replace the synth by setting
one constant.

Stack: plain Web Audio (`AudioContext`, oscillators, `BiquadFilter`, `ConvolverNode`, `DynamicsCompressor`).
Framework-agnostic; it has no three.js dependency beyond living in the same page.

## When to use

- A scene needs mood music and you can't (or shouldn't) ship licensed audio.
- You want ambience that loops forever without an audible seam.
- Weather or events need sound effects synced to visuals (thunder after lightning).

## Paste-ready prompt

> Add a `{{mood, e.g. Ghibli-style}}` theme to `{{entry file}}`. Compose an original piece — never copy a
> copyrighted theme — and synthesise it live with Web Audio, starting on a user click:
> - An original waltz: 3/4 at ~76 bpm, 16 bars in a major key, `[midi, beats]` arrays.
> - Instruments: piano (triangle + sine partial, filter envelope); detuned-saw string pad through a low-pass; FM
>   music box doubling the melody on the repeat.
> - A generated convolution reverb and a compressor.
> - Ambience: a looping brown-noise river through an LFO-breathing band-pass, plus random FM birdsong.
> - A look-ahead scheduler (`setInterval` 120 ms, schedule 0.6 s ahead). Fade in and out. A music toggle.
> - If `{{SONG_URL}}` is set, loop that file instead of the synth (same master gain, same toggle).

## Implementation (`references/generative-waltz.js`)

### Graph
`voices → bus → compressor → master → destination`, plus `bus → convolver (wet .45) → compressor`. Ambience goes
straight to `master`; birds go to the reverb so they sit in the space. `master.gain` starts at 0 and ramps to the
music volume over 1.5 s on start, to 0 over 0.8 s on stop, then `ctx.suspend()`.

### Score
- `BPM = 76`, `BEAT = 60/BPM`, bar = 3 beats. `mtof(m) = 440·2^((m−69)/12)`.
- `MEL[bar] = [[midi, beats], …]` summing to 3 per bar; `CH[bar] = [bass, n1, n2, n3]`.
- Per bar: bass on beat 1 (an octave down + at pitch), chord tones on beats 2 and 3 (the waltz "oom-pah-pah"),
  a pad on the chord an octave down for the whole bar, the melody on top; on the second pass (`floor(step/16) % 2`)
  the music box doubles the melody an octave up. ~35 % of bars schedule a bird call.

### Voices
- **Piano:** triangle at f + sine at 2.002f (gain .25); low-pass 3200 → 900 Hz over the note; gain attack 8 ms,
  decay to 35 % by 350 ms, exponential release to ~0 over dur + 1.2 s.
- **Strings:** two sawtooths per note detuned ±6 cents, low-pass 1100 Hz (Q .4), swell to .018 at 45 % of the bar.
- **Music box:** sine carrier with an FM modulator at 3.5f, index .8f; 5 ms attack, 1.6 s decay.
- **Reverb:** 3.2 s stereo buffer of white noise × `(1 − i/len)^2.6` — no impulse file needed.

### Scheduler
`setInterval(schedule, 120)`; `while (nextT < ctx.currentTime + .6)` schedule one bar at `nextT`, then
`nextT += 3·BEAT`. Timing lives on the audio clock, so a janky render loop never makes the music stutter.

### Ambience
- **River:** 4 s of brown noise (`last = (last + .02·white)/1.02; d = last·3.2`), looped, band-pass 700 Hz Q .5 whose
  frequency an LFO (.09 Hz, ±260 Hz) breathes; gain .11.
- **Birdsong:** 2–5 chirps at 2.6–4.4 kHz, each a 50 ms up-sweep ×1.3–1.8 then down to ×.9, 100 ms envelope.
- **Thunder (weather hook):** 4 s brown noise with a 50 ms attack and `(1 − i/len)^1.6` tail through a 160–280 Hz
  low-pass, gain ∝ storm intensity, started 1.2–3.4 s after the flash. Only once the visitor has let music start,
  and never in `?silent` capture runs.

### Gesture gating
- Browsers only allow sound after a gesture. The music button opens "armed"; the first `pointerdown` / `keydown` /
  `touchstart` anywhere (capture phase, one-shot listeners) starts it. A loading gate's "tap to enter" doubles as
  that gesture (see threejs-cinematic-loading-screen). `?silent` never arms it.
- File fallback: `new Audio(SONG_URL)` with `loop` and `preload:'auto'` starts buffering immediately; route it with
  `ctx.createMediaElementSource(song).connect(master)` so the same fades and toggle apply.

## Pitfalls

- Creating the `AudioContext` before a gesture leaves it `suspended`; always `ctx.resume()` inside the gesture.
- `exponentialRampToValueAtTime` can't reach 0 — ramp to ~.0005–.0008, and stop oscillators after the release.
- Stop every oscillator (`o.stop(t + dur + 1.3)`), or thousands of silent nodes pile up over a long session.
- A thunder context separate from the music should still respect the music toggle and the silent flag.
- Do not transcribe or "almost copy" a famous film theme: write your own melody and chords.

## Verify

- Load, wait: silence. First tap: fade-in within ~1.5 s; toggle off: fade out, context suspends.
- Leave it running 5+ minutes: no drift, no stutter while the scene is under load, no node build-up
  (DevTools → Performance monitor / WebAudio inspector).
- Trigger a storm flash: rumble arrives after a delay, only when music is on.

## Related skills

threejs-cinematic-loading-screen · threejs-webgl-rain-effect (thunder) · threejs-camera-guided-tour (tour starts
music, `?tour&silent`) · threejs-day-cycle-lighting
