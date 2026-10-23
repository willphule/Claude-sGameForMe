// All sound is synthesised live with the Web Audio API — no audio files.
//
// Music is one piece played by two "bands" at once: a glassy, underwater one for NOW and a
// warm music-box one (with a ticking clock) for THEN. Turning the watch crossfades between
// them, so the song never restarts.
import { NOW, THEN } from './level.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function load(key) { try { return localStorage.getItem(key); } catch { return null; } }
function save(key, v) { try { localStorage.setItem(key, v); } catch { /* storage unavailable */ } }

// Chord progression: Dm – Bb – F – C, two bars each.
const PROG = [
  { root: 38, tones: [62, 65, 69, 72, 74] },
  { root: 34, tones: [58, 62, 65, 70, 74] },
  { root: 41, tones: [60, 65, 69, 72, 77] },
  { root: 36, tones: [60, 64, 67, 72, 76] },
];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];
const MELODY = [ // sparse tune over the top, one slot per beat (null = rest)
  74, null, 72, 69, null, null, 67, 69, 70, null, 69, 65, null, null, 62, null,
  65, null, 67, 69, null, 72, 74, null, 72, null, 69, 67, null, null, 64, null,
];
const BPM = 72;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = load('drownedbell-muted') === '1';
    this.era = NOW;
    this.underwater = false;
    this.ducked = false;
    this.ambientTimer = 0;
  }

  // Browsers only allow audio after a key press or tap.
  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());

    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(c.destination);

    // Everything passes through a low-pass filter that closes when you're underwater.
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.muffle.connect(this.master);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.8);
    this.reverbOut = c.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.muffle);

    this.sfx = this.bus(0.9, this.muffle);
    this.sfxVerb = this.bus(0.25, this.reverb);
    this.sfx.connect(this.sfxVerb);

    this.music = this.bus(0.32, this.muffle);
    this.musicVerb = this.bus(0.6, this.reverb);
    this.music.connect(this.musicVerb);
    this.musicEra = [this.bus(1, this.music), this.bus(0, this.music)];
    this.eraLevel = [1, 1.6]; // the music-box band is naturally quieter

    // Echo for the NOW band's glass notes
    const delay = c.createDelay(2);
    delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = this.bus(0.38, delay);
    delay.connect(fb);
    delay.connect(this.musicEra[NOW]);
    this.glassEcho = this.bus(1, this.musicEra[NOW]); // dry signal...
    this.glassEcho.connect(this.bus(0.5, delay));      // ...plus an echo

    this.amb = this.bus(0.9, this.muffle);
    this.ambEra = [this.bus(1, this.amb), this.bus(0, this.amb)];

    this.noise = this.makeNoise(3);
    this.startAmbience();
    this.setEra(this.era, true);

    this.step = 0;
    this.nextNote = c.currentTime + 0.3;
    this.scheduler = setInterval(() => this.schedule(), 25);
  }

  bus(gain, dest) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (dest) g.connect(dest);
    return g;
  }

  makeNoise(seconds) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeImpulse(seconds) {
    const c = this.ctx;
    const len = c.sampleRate * seconds;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  // ---------- building blocks ----------

  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.2, attack = 0.005, when = 0, dest = this.sfx, curve = 'exp' }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  hiss({ dur = 0.2, vol = 0.2, type = 'bandpass', f0 = 1000, f1 = null, q = 1, attack = 0.005, when = 0, dest = this.sfx }) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.05);
  }

  // A struck bell: inharmonic partials, each fading at its own speed.
  bellTone(freq, { dur = 3, vol = 0.2, when = 0, dest = this.sfx } = {}) {
    const partials = [[0.5, 0.5, 1], [1, 1, 0.8], [1.183, 0.6, 0.55], [1.506, 0.5, 0.45], [2, 0.45, 0.35], [2.514, 0.3, 0.25], [2.662, 0.25, 0.2], [3.011, 0.2, 0.15]];
    for (const [ratio, amp, life] of partials) {
      this.tone({ f0: freq * ratio, dur: dur * life, vol: vol * amp, attack: 0.004, when, dest });
    }
  }

  // ---------- sound effects ----------

  play(name, arg) {
    if (!this.ctx || this.muted) return;
    const fx = SFX[name];
    if (fx) fx(this, arg);
  }

  // ---------- era, water, volume ----------

  setEra(era, instant = false) {
    this.era = era;
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = instant ? 0.001 : 0.18;
    for (const e of [NOW, THEN]) {
      this.musicEra[e].gain.setTargetAtTime(e === era ? this.eraLevel[e] : 0, t, k);
      this.ambEra[e].gain.setTargetAtTime(e === era ? 1 : 0, t, k);
    }
  }

  setUnderwater(on) {
    if (on === this.underwater) return;
    this.underwater = on;
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, on ? 0.04 : 0.12);
  }

  duck(on) {
    if (on === this.ducked || !this.ctx) return;
    this.ducked = on;
    this.music.gain.setTargetAtTime(on ? 0.1 : 0.32, this.ctx.currentTime, 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    save('drownedbell-muted', this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---------- ambience ----------

  startAmbience() {
    const c = this.ctx;
    const loop = (filterType, freq, q, gain, dest) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = this.bus(gain, dest);
      s.connect(f).connect(g);
      s.start();
      return g;
    };
    // NOW: deep underwater hum that slowly swells
    const hum = loop('lowpass', 220, 0.7, 0.16, this.ambEra[NOW]);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoAmt = this.bus(0.07, hum.gain);
    lfo.connect(lfoAmt);
    lfo.start();
    // THEN: rain — a bright hiss plus a softer body
    loop('bandpass', 3200, 0.5, 0.06, this.ambEra[THEN]);
    loop('lowpass', 700, 0.5, 0.05, this.ambEra[THEN]);
  }

  // Called every frame: occasional drips, bubbles and creaks.
  tick(dt) {
    if (!this.ctx || this.muted) return;
    this.ambientTimer -= dt;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 0.6 + Math.random() * 2.2;
    if (this.era === NOW) {
      const f = 900 + Math.random() * 900;
      if (Math.random() < 0.6) this.tone({ f0: f, f1: f * 1.6, dur: 0.07, vol: 0.05, dest: this.ambEra[NOW] }); // drip
      else for (let i = 0; i < 3; i++) this.tone({ f0: 400 + Math.random() * 500, f1: 900, dur: 0.05, vol: 0.025, when: i * 0.06, dest: this.ambEra[NOW] });
    } else if (Math.random() < 0.35) {
      // a creak of old timber in the wind
      this.tone({ type: 'sawtooth', f0: 90 + Math.random() * 40, f1: 70, dur: 0.5, vol: 0.02, attack: 0.15, dest: this.ambEra[THEN] });
    }
  }

  thunder(delay = 0.6) {
    if (!this.ctx || this.muted) return;
    this.hiss({ type: 'lowpass', f0: 400, f1: 60, dur: 3.2, vol: 0.5, attack: 0.08, when: delay, dest: this.ambEra[THEN] });
    this.hiss({ type: 'lowpass', f0: 160, f1: 50, dur: 2.2, vol: 0.4, attack: 0.3, when: delay + 0.3, dest: this.ambEra[THEN] });
  }

  // ---------- music ----------

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const eighth = 60 / BPM / 2;
    if (this.nextNote < c.currentTime - 0.2) this.nextNote = c.currentTime + 0.05;
    while (this.nextNote < c.currentTime + 0.15) {
      this.playStep(this.step, this.nextNote - c.currentTime);
      this.nextNote += eighth;
      this.step = (this.step + 1) % (PROG.length * 16);
    }
  }

  playStep(step, when) {
    const chord = PROG[Math.floor(step / 16)];
    const inChord = step % 16;
    const eighth = 60 / BPM / 2;
    const NOWB = this.musicEra[NOW], THENB = this.musicEra[THEN];

    if (inChord === 0) {
      // pads
      for (const n of chord.tones.slice(0, 3)) {
        this.tone({ type: 'triangle', f0: midi(n - 12), dur: eighth * 16, vol: 0.035, attack: 1.8, when, dest: NOWB });
        this.tone({ type: 'sawtooth', f0: midi(n - 12) * 1.003, dur: eighth * 16, vol: 0.012, attack: 1.2, when, dest: THENB });
      }
    }
    if (inChord % 8 === 0) {
      // bass
      this.tone({ f0: midi(chord.root), dur: eighth * 7, vol: 0.12, attack: 0.08, when, dest: NOWB });
      this.tone({ type: 'triangle', f0: midi(chord.root), dur: eighth * 4, vol: 0.14, attack: 0.01, when, dest: THENB });
    }
    // arpeggio — glass in NOW, music box in THEN
    if (Math.random() < 0.8) {
      const n = chord.tones[ARP[step % 8]];
      this.tone({ f0: midi(n), dur: 0.9, vol: 0.035, attack: 0.01, when, dest: this.glassEcho });
      this.tone({ type: 'triangle', f0: midi(n + 12), dur: 0.55, vol: 0.04, attack: 0.003, when, dest: THENB });
      this.tone({ f0: midi(n + 24), dur: 0.2, vol: 0.012, attack: 0.002, when, dest: THENB });
    }
    // melody, every other bar-pair
    if (step % 2 === 0) {
      const m = MELODY[(step / 2) % MELODY.length];
      if (m && Math.floor(step / 64) % 2 === 1) {
        this.tone({ f0: midi(m), dur: 1.6, vol: 0.05, attack: 0.04, when, dest: NOWB });
        this.tone({ type: 'triangle', f0: midi(m + 12), dur: 0.9, vol: 0.05, attack: 0.004, when, dest: THENB });
      }
    }
    // the clock in THEN: tick ... tock
    if (step % 2 === 0) {
      const tock = step % 4 === 2;
      this.hiss({ type: 'bandpass', f0: tock ? 2200 : 3400, q: 8, dur: 0.035, vol: 0.06, attack: 0.001, when, dest: THENB });
    }
  }
}

// Each sound effect: (sound, argument) => void
const SFX = {
  jump: (s) => {
    s.tone({ type: 'square', f0: 280, f1: 560, dur: 0.09, vol: 0.035 });
    s.tone({ type: 'triangle', f0: 280, f1: 620, dur: 0.13, vol: 0.12 });
  },
  land: (s, impact = 1) => {
    const v = Math.min(1, impact);
    s.hiss({ type: 'lowpass', f0: 500, f1: 120, dur: 0.1, vol: 0.18 * v });
    s.tone({ f0: 130, f1: 55, dur: 0.1, vol: 0.18 * v });
  },
  step: (s, alt) => {
    s.hiss({ type: 'bandpass', f0: alt ? 1700 : 2100, q: 1.5, dur: 0.04, vol: 0.05 });
    s.tone({ f0: alt ? 110 : 125, f1: 70, dur: 0.05, vol: 0.05 });
  },
  stroke: (s) => {
    s.hiss({ type: 'bandpass', f0: 700, f1: 300, q: 0.8, dur: 0.3, vol: 0.18, attack: 0.05 });
    for (let i = 0; i < 3; i++) {
      const f = 500 + Math.random() * 600;
      s.tone({ f0: f, f1: f * 1.9, dur: 0.05, vol: 0.04, when: 0.05 + i * 0.05 });
    }
  },
  splash: (s, big = 1) => {
    s.hiss({ type: 'bandpass', f0: 2500, f1: 500, q: 0.7, dur: 0.4, vol: 0.28 * big, attack: 0.004 });
    s.hiss({ type: 'lowpass', f0: 600, f1: 150, dur: 0.25, vol: 0.2 * big });
  },
  shift: (s, to) => {
    const up = to === THEN;
    s.hiss({ type: 'bandpass', f0: up ? 300 : 3000, f1: up ? 3000 : 300, q: 1.2, dur: 0.5, vol: 0.4, attack: 0.08 });
    s.tone({ f0: up ? 70 : 140, f1: up ? 140 : 70, dur: 0.45, vol: 0.12, attack: 0.05 });
    const notes = up ? [62, 69, 74, 81] : [81, 74, 69, 65];
    notes.forEach((n, i) => s.tone({ type: up ? 'triangle' : 'sine', f0: midi(n), dur: 0.9, vol: 0.1, when: 0.04 + i * 0.05, dest: s.sfxVerb }));
    s.hiss({ type: 'highpass', f0: 4000, dur: 0.015, vol: 0.12, attack: 0.001 });
    s.hiss({ type: 'highpass', f0: 3000, dur: 0.015, vol: 0.1, attack: 0.001, when: 0.13 });
  },
  blocked: (s) => {
    s.tone({ type: 'square', f0: 110, dur: 0.16, vol: 0.06 });
    s.tone({ type: 'square', f0: 104, dur: 0.16, vol: 0.06 });
  },
  hurt: (s) => {
    s.tone({ type: 'sawtooth', f0: 520, f1: 120, dur: 0.25, vol: 0.12 });
    s.hiss({ type: 'lowpass', f0: 1500, f1: 300, dur: 0.15, vol: 0.2 });
  },
  die: (s) => {
    s.tone({ type: 'triangle', f0: 330, f1: 50, dur: 1.2, vol: 0.2, attack: 0.02 });
    for (let i = 0; i < 8; i++) s.tone({ f0: 300 + Math.random() * 700, f1: 1400, dur: 0.06, vol: 0.04, when: 0.1 + i * 0.07 });
  },
  stomp: (s) => {
    s.tone({ type: 'square', f0: 900, f1: 200, dur: 0.1, vol: 0.07 });
    s.hiss({ type: 'highpass', f0: 2500, dur: 0.08, vol: 0.18, attack: 0.001 });
    s.tone({ f0: 1400, f1: 2600, dur: 0.18, vol: 0.05, when: 0.05 }); // sprung spring
    for (let i = 0; i < 4; i++) s.tone({ type: 'triangle', f0: 1800 + Math.random() * 1500, dur: 0.06, vol: 0.03, when: 0.08 + i * 0.05 });
  },
  note: (s) => {
    s.hiss({ type: 'highpass', f0: 3000, dur: 0.12, vol: 0.07, attack: 0.02 });
    s.hiss({ type: 'highpass', f0: 3500, dur: 0.1, vol: 0.05, attack: 0.02, when: 0.12 });
    [65, 69, 72, 76].forEach((n, i) => s.tone({ f0: midi(n + 12), dur: 1.2, vol: 0.06, when: 0.05 + i * 0.08, dest: s.sfxVerb }));
  },
  checkpoint: (s) => {
    s.hiss({ type: 'lowpass', f0: 300, f1: 2000, dur: 0.35, vol: 0.12, attack: 0.15 });
    s.bellTone(midi(74), { dur: 2.5, vol: 0.13, when: 0.15 });
  },
  valve: (s) => {
    for (let i = 0; i < 10; i++) s.hiss({ type: 'bandpass', f0: 2600, q: 6, dur: 0.02, vol: 0.18, attack: 0.001, when: i * 0.09 });
    s.tone({ type: 'sawtooth', f0: 62, f1: 38, dur: 2.6, vol: 0.12, attack: 0.3, when: 0.8 });
    s.hiss({ type: 'lowpass', f0: 160, dur: 2.8, vol: 0.4, attack: 0.5, when: 0.8 });
    s.hiss({ type: 'bandpass', f0: 500, f1: 1200, q: 0.6, dur: 3, vol: 0.12, attack: 1.2, when: 1.2 }); // rushing water
  },
  rusted: (s) => {
    s.tone({ type: 'square', f0: 95, f1: 80, dur: 0.1, vol: 0.06 });
    s.hiss({ type: 'lowpass', f0: 900, dur: 0.08, vol: 0.15 });
  },
  bell: (s) => {
    s.bellTone(midi(50), { dur: 8, vol: 0.32, dest: s.sfxVerb });
    s.bellTone(midi(50), { dur: 6, vol: 0.2 });
    s.bellTone(midi(57), { dur: 5, vol: 0.08, when: 1.6, dest: s.sfxVerb });
  },
  start: (s) => {
    s.bellTone(midi(74), { dur: 2.5, vol: 0.08, dest: s.sfxVerb });
    s.bellTone(midi(81), { dur: 2, vol: 0.05, when: 0.15, dest: s.sfxVerb });
  },
  ui: (s) => s.tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.08, vol: 0.06 }),
};
