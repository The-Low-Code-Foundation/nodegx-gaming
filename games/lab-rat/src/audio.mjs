// Every sound is synthesised here (WebAudio): no files. Sounds with a position go through an HRTF panner; everything
// also feeds a small generated reverb so the corridors sound like concrete. The PA is the browser's own voice.
export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.voices = 0;
  }
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    // reverb: decaying noise
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.32;
    this.verb.connect(this.verbGain).connect(this.master);
    // white noise to cut sounds from
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }
  get t() {
    return this.ctx.currentTime;
  }
  setListener(pos, fwd) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.t;
      L.positionX.setTargetAtTime(pos.x, t, 0.02);
      L.positionY.setTargetAtTime(pos.y, t, 0.02);
      L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }
  /** An output for one sound: a gain, then a panner when it has a position, then the mix and the reverb. */
  out(pos, vol = 1, verb = 1, dur = 2) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    let tail = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2.2;
      p.maxDistance = 80;
      p.rolloffFactor = 1.15;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y ?? 1;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y ?? 1, pos.z);
      g.connect(p);
      tail = p;
    }
    tail.connect(this.master);
    if (verb > 0) {
      const s = ctx.createGain();
      s.gain.value = verb;
      tail.connect(s).connect(this.verb);
    }
    this.voices++;
    setTimeout(() => {
      this.voices--;
      try {
        tail.disconnect();
      } catch {}
    }, (dur + 0.5) * 1000);
    return g;
  }
  osc(type, f0, f1, t0, dur, dest, gain = 1, a = 0.005, curve = 'exp') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }
  noise(t0, dur, dest, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, gain = 1, a = 0.002 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }
  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.voices > 48) return;
    const t = this.t, j = () => 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'shot': {
        const o = this.out(pos, 0.55 * vol, 0.5, 0.6);
        this.noise(t, 0.09, o, { f0: 2400 * j(), f1: 900, q: 0.7, gain: 1.4 });
        this.noise(t, 0.22, o, { type: 'lowpass', f0: 1400, f1: 200, gain: 0.7 });
        this.osc('sine', 140 * j(), 45, t, 0.14, o, 1.2);
        this.osc('square', 1900 * j(), 1200, t, 0.02, o, 0.15);
        break;
      }
      case 'empty': {
        const o = this.out(pos, 0.3 * vol, 0.1, 0.2);
        this.osc('square', 2600, 2000, t, 0.03, o, 0.3);
        break;
      }
      case 'reload1':
      case 'reload2':
      case 'reload3': {
        const o = this.out(pos, 0.35 * vol, 0.15, 0.4);
        const f = { reload1: 900, reload2: 1500, reload3: 600 }[name];
        this.noise(t, 0.05, o, { f0: f * 2, q: 3, gain: 1 });
        this.osc('square', f, f * 0.7, t, 0.04, o, 0.25);
        this.osc('triangle', f * 2.7, f * 2, t + 0.02, 0.08, o, 0.2);
        break;
      }
      case 'step': {
        const o = this.out(pos, 0.16 * vol, 0.15, 0.2);
        this.noise(t, 0.07, o, { type: 'lowpass', f0: 500 * j(), f1: 200, gain: 1 });
        this.noise(t, 0.03, o, { f0: 2400 * j(), q: 1.5, gain: 0.25 });
        break;
      }
      case 'swing': {
        const o = this.out(pos, 0.3 * vol, 0.1, 0.3);
        this.noise(t, 0.2, o, { f0: 380, f1: 1600, q: 2, gain: 0.9, a: 0.06 });
        break;
      }
      case 'thunk': {
        const o = this.out(pos, 0.7 * vol, 0.3, 0.4);
        this.osc('sine', 170 * j(), 60, t, 0.16, o, 1.2);
        this.noise(t, 0.12, o, { type: 'lowpass', f0: 900, f1: 200, gain: 0.9 });
        break;
      }
      case 'clank': {
        const o = this.out(pos, 0.45 * vol, 0.6, 0.8);
        for (const f of [610, 1370, 2240, 3400]) this.osc('sine', f * j(), f * 0.98, t, 0.5 + Math.random() * 0.3, o, 0.3);
        this.noise(t, 0.04, o, { f0: 3000, q: 1, gain: 0.8 });
        break;
      }
      case 'ricochet': {
        const o = this.out(pos, 0.4 * vol, 0.5, 0.5);
        this.osc('sine', 3600 * j(), 1300, t, 0.26, o, 0.35);
        this.noise(t, 0.05, o, { f0: 4000, q: 2, gain: 0.8 });
        break;
      }
      case 'impact': {
        const o = this.out(pos, 0.3 * vol, 0.4, 0.3);
        this.noise(t, 0.06, o, { f0: 1400 * j(), q: 1, gain: 1 });
        break;
      }
      case 'splat': {
        const o = this.out(pos, 0.45 * vol, 0.3, 0.3);
        this.noise(t, 0.12, o, { type: 'lowpass', f0: 1200, f1: 300, gain: 1 });
        this.osc('sine', 260 * j(), 90, t, 0.1, o, 0.6);
        break;
      }
      case 'chitter': {
        const o = this.out(pos, 0.38 * vol, 0.35, 0.8);
        let tt = t;
        const n = 6 + Math.floor(Math.random() * 6), base = 2600 + Math.random() * 1400;
        for (let i = 0; i < n; i++) {
          this.osc('square', base * j(), base * 0.8, tt, 0.025, o, 0.12);
          this.noise(tt, 0.03, o, { f0: base * 1.4, q: 6, gain: 0.5 });
          tt += 0.03 + Math.random() * 0.04;
        }
        break;
      }
      case 'screech': {
        const o = this.out(pos, 0.55 * vol, 0.4, 0.6);
        const ctx = this.ctx;
        const s = ctx.createOscillator();
        s.type = 'sawtooth';
        s.frequency.setValueAtTime(900 * j(), t);
        s.frequency.linearRampToValueAtTime(1700, t + 0.12);
        s.frequency.exponentialRampToValueAtTime(600, t + 0.38);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800;
        f.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        s.connect(f).connect(g).connect(o);
        s.start(t);
        s.stop(t + 0.45);
        break;
      }
      case 'skdie': {
        const o = this.out(pos, 0.5 * vol, 0.3, 0.7);
        this.osc('sawtooth', 700 * j(), 120, t, 0.45, o, 0.25);
        this.noise(t, 0.3, o, { type: 'lowpass', f0: 1600, f1: 200, gain: 0.9 });
        break;
      }
      case 'roar': {
        const o = this.out(pos, 0.9 * vol, 0.6, 1.8);
        const ctx = this.ctx;
        const ws = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = i / 128 - 1;
          curve[i] = Math.tanh(x * 4);
        }
        ws.curve = curve;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(900, t);
        f.frequency.exponentialRampToValueAtTime(300, t + 1.3);
        ws.connect(f).connect(o);
        for (const base of [68, 71.5, 103]) this.osc('sawtooth', base * j(), base * 0.7, t, 1.4, ws, 0.35, 0.12, 'lin');
        this.noise(t, 1.2, o, { type: 'lowpass', f0: 600, f1: 150, gain: 0.5, a: 0.1 });
        break;
      }
      case 'snort': {
        const o = this.out(pos, 0.5 * vol, 0.3, 0.6);
        this.noise(t, 0.4, o, { type: 'lowpass', f0: 500, f1: 180, gain: 0.8, a: 0.05 });
        this.osc('sawtooth', 60, 50, t, 0.35, o, 0.2, 0.05);
        break;
      }
      case 'stomp': {
        const o = this.out(pos, 0.7 * vol, 0.3, 0.4);
        this.osc('sine', 70 * j(), 35, t, 0.22, o, 1);
        this.noise(t, 0.12, o, { type: 'lowpass', f0: 300, gain: 0.6 });
        break;
      }
      case 'boom': {
        const o = this.out(pos, 1.0 * vol, 0.8, 1.2);
        this.osc('sine', 60, 28, t, 0.7, o, 1.4);
        this.noise(t, 0.6, o, { type: 'lowpass', f0: 700, f1: 80, gain: 1 });
        for (const f of [420, 960]) this.osc('sine', f, f * 0.97, t, 0.6, o, 0.15);
        break;
      }
      case 'explode': {
        const o = this.out(pos, 1.3 * vol, 1, 2.6);
        this.noise(t, 1.8, o, { type: 'lowpass', f0: 4000, f1: 90, gain: 1.6, a: 0.003 });
        this.osc('sine', 70, 24, t, 1.6, o, 1.6);
        this.noise(t, 0.08, o, { f0: 2000, q: 0.5, gain: 1.2 });
        break;
      }
      case 'hiss': {
        const o = this.out(pos, 0.5 * vol, 0.2, 1.4);
        this.noise(t, 1.2, o, { type: 'highpass', f0: 3000, gain: 0.7, a: 0.02 });
        break;
      }
      case 'chime': {
        const o = this.out(pos, 0.35 * vol, 1, 3);
        for (const f of [880, 1318, 1760, 2637]) this.osc('sine', f * (0.99 + Math.random() * 0.02), f, t + Math.random() * 0.2, 2.2, o, 0.18, 0.25);
        break;
      }
      case 'rifle': {
        // heavier and drier than the SMG, with a crack on top
        const o = this.out(pos, 0.7 * vol, 0.7, 0.8);
        this.noise(t, 0.06, o, { type: 'highpass', f0: 3000 * j(), f1: 1800, q: 0.5, gain: 1.2 });
        this.noise(t, 0.3, o, { type: 'lowpass', f0: 1100, f1: 120, gain: 1.0 });
        this.osc('sine', 95 * j(), 38, t, 0.2, o, 1.4);
        break;
      }
      case 'whizz': {
        const o = this.out(pos, 0.45 * vol, 0.2, 0.4);
        this.noise(t, 0.16, o, { type: 'bandpass', f0: 4200 * j(), f1: 1500, q: 3, gain: 1.3, a: 0.03 });
        break;
      }
      case 'oof': {
        const o = this.out(pos, 0.6 * vol, 0.4, 0.6);
        this.osc('sawtooth', 210 * j(), 130, t, 0.22, o, 0.25, 0.01);
        this.noise(t, 0.2, o, { type: 'bandpass', f0: 700, f1: 400, q: 2, gain: 0.5 });
        break;
      }
      case 'whimper': {
        // a held breath let out: a thin, wavering tone
        const o = this.out(pos, 0.4 * vol, 0.5, 1.2);
        const f = 420 * j();
        this.osc('triangle', f, f * 0.8, t, 0.5, o, 0.18, 0.05, 'lin');
        this.osc('triangle', f * 0.95, f * 0.7, t + 0.45, 0.6, o, 0.14, 0.05, 'lin');
        this.noise(t, 0.9, o, { type: 'bandpass', f0: 1600, f1: 900, q: 1.5, gain: 0.15, a: 0.1 });
        break;
      }
      case 'radio': {
        const o = this.out(pos, 0.35 * vol, 0.2, 0.5);
        this.noise(t, 0.12, o, { type: 'bandpass', f0: 2400, q: 1.2, gain: 1 });
        this.osc('square', 1400, 1400, t + 0.02, 0.05, o, 0.15);
        break;
      }
      case 'song': {
        // the crystals: a slow swell of a low cluster, with the hold's chord shifting under it
        const o = this.out(pos, 0.8 * vol, 1.2, 6);
        for (const f of [55, 82.4, 110.3, 164.8, 246.9, 329.2]) {
          const ctx = this.ctx;
          const s = ctx.createOscillator();
          s.type = f < 100 ? 'sine' : 'triangle';
          s.frequency.setValueAtTime(f * 0.985, t);
          s.frequency.linearRampToValueAtTime(f, t + 1.5);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(f < 100 ? 0.3 : 0.08, t + 1.2);
          g.gain.linearRampToValueAtTime(f < 100 ? 0.25 : 0.05, t + 3.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
          s.connect(g).connect(o);
          s.start(t);
          s.stop(t + 5.6);
        }
        for (const f of [1318, 1975, 2637]) this.osc('sine', f, f, t + 0.6 + Math.random() * 0.8, 3.5, o, 0.05, 0.5);
        break;
      }
      case 'scream': {
        const o = this.out(pos, 0.9 * vol, 1, 2.2);
        const ctx = this.ctx;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9;
        const lg = ctx.createGain();
        lg.gain.value = 60;
        lfo.connect(lg);
        for (const f of [620, 930, 1240]) {
          const s = ctx.createOscillator();
          s.type = 'sawtooth';
          s.frequency.setValueAtTime(f, t);
          s.frequency.linearRampToValueAtTime(f * 1.4, t + 0.5);
          s.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.6);
          lg.connect(s.frequency);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.08);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = f * 1.5;
          bp.Q.value = 1.5;
          s.connect(bp).connect(g).connect(o);
          s.start(t);
          s.stop(t + 1.8);
        }
        lfo.start(t);
        lfo.stop(t + 1.8);
        break;
      }
      case 'door': {
        const o = this.out(pos, 0.45 * vol, 0.3, 1);
        this.noise(t, 0.6, o, { f0: 300, f1: 900, q: 1, gain: 0.6, a: 0.05 });
        this.osc('sawtooth', 90, 130, t, 0.6, o, 0.08, 0.05);
        this.osc('sine', 120, 40, t + 0.6, 0.15, o, 0.6);
        break;
      }
      case 'gate': {
        const o = this.out(pos, 0.9 * vol, 0.7, 4);
        this.osc('sawtooth', 42, 48, t, 3.6, o, 0.25, 0.2, 'lin');
        this.noise(t, 3.6, o, { f0: 200, f1: 500, q: 0.8, gain: 0.7, a: 0.3 });
        this.osc('sine', 80, 30, t + 3.5, 0.5, o, 1.2);
        break;
      }
      case 'pickup': {
        const o = this.out(null, 0.25 * vol, 0.2, 0.4);
        this.osc('triangle', 660, 660, t, 0.08, o, 0.5);
        this.osc('triangle', 990, 990, t + 0.07, 0.14, o, 0.5);
        break;
      }
      case 'gun': {
        const o = this.out(null, 0.4 * vol, 0.2, 0.6);
        this.play('reload2');
        this.osc('triangle', 440, 440, t, 0.1, o, 0.4);
        this.osc('triangle', 660, 660, t + 0.1, 0.1, o, 0.4);
        this.osc('triangle', 880, 880, t + 0.2, 0.25, o, 0.4);
        break;
      }
      case 'heal': {
        const o = this.out(null, 0.3 * vol, 0.3, 0.8);
        for (let i = 0; i < 4; i++) this.osc('sine', 520 * Math.pow(1.26, i), 520 * Math.pow(1.26, i), t + i * 0.07, 0.25, o, 0.35);
        break;
      }
      case 'hurt': {
        const o = this.out(null, 0.5 * vol, 0.1, 0.4);
        this.noise(t, 0.18, o, { type: 'lowpass', f0: 500, f1: 120, gain: 1 });
        this.osc('sine', 110, 60, t, 0.2, o, 0.7);
        break;
      }
      case 'note': {
        const o = this.out(null, 0.32 * vol, 0.1, 1);
        let tt = t;
        for (let i = 0; i < 7; i++) {
          this.noise(tt, 0.06 + Math.random() * 0.05, o, { f0: 3500 + Math.random() * 2000, q: 2, gain: 0.5, a: 0.01 });
          tt += 0.07 + Math.random() * 0.04;
        }
        break;
      }
      case 'pa': {
        const o = this.out(null, 0.32 * vol, 0.8, 2);
        this.osc('sine', 784, 784, t, 0.7, o, 0.4, 0.01);
        this.osc('sine', 622, 622, t + 0.45, 1.0, o, 0.4, 0.01);
        break;
      }
      case 'vend': {
        const o = this.out(pos, 0.6 * vol, 0.4, 1);
        this.osc('sawtooth', 60, 60, t, 0.5, o, 0.1, 0.02, 'lin');
        this.osc('sine', 150, 60, t + 0.55, 0.2, o, 0.9);
        this.noise(t + 0.55, 0.15, o, { f0: 1800, q: 1, gain: 0.5 });
        break;
      }
      case 'can': {
        const o = this.out(pos, 0.4 * vol, 0.4, 0.6);
        for (const f of [2550, 3720, 5130]) this.osc('sine', f * j(), f, t, 0.18, o, 0.25);
        this.noise(t, 0.03, o, { f0: 5000, q: 1, gain: 0.6 });
        break;
      }
      case 'throw': {
        const o = this.out(null, 0.2 * vol, 0.1, 0.3);
        this.noise(t, 0.15, o, { f0: 500, f1: 1400, q: 2, gain: 0.6, a: 0.04 });
        break;
      }
      case 'pop': {
        const o = this.out(pos, 0.6 * vol, 0.5, 0.8);
        this.noise(t, 0.05, o, { type: 'highpass', f0: 2500, gain: 1.2 });
        for (let i = 0; i < 6; i++) this.osc('sine', 3000 + Math.random() * 4000, 3000, t + 0.04 + Math.random() * 0.25, 0.08, o, 0.12);
        break;
      }
      case 'spark': {
        const o = this.out(pos, 0.3 * vol, 0.2, 0.4);
        for (let i = 0; i < 5; i++) this.noise(t + Math.random() * 0.2, 0.02, o, { type: 'highpass', f0: 4000, gain: 0.7 });
        break;
      }
      case 'thud': {
        const o = this.out(pos, 0.5 * vol, 0.3, 0.4);
        this.osc('sine', 120, 50, t, 0.18, o, 0.9);
        this.noise(t, 0.08, o, { type: 'lowpass', f0: 600, gain: 0.5 });
        break;
      }
      case 'vent': {
        const o = this.out(pos, 0.7 * vol, 0.5, 0.8);
        this.noise(t, 0.08, o, { f0: 900, q: 0.8, gain: 1.2 });
        for (const f of [430, 1120, 1890]) this.osc('sine', f, f * 0.95, t, 0.5, o, 0.2);
        break;
      }
      case 'lever': {
        const o = this.out(pos, 0.6 * vol, 0.4, 1);
        this.osc('square', 300, 150, t, 0.12, o, 0.2);
        this.osc('sine', 90, 50, t + 0.1, 0.3, o, 0.9);
        this.osc('sawtooth', 55, 60, t + 0.3, 1.5, o, 0.12, 0.3, 'lin');
        break;
      }
      case 'button': {
        const o = this.out(pos, 0.4 * vol, 0.2, 0.4);
        this.osc('square', 1200, 1200, t, 0.06, o, 0.2);
        this.osc('square', 1600, 1600, t + 0.08, 0.08, o, 0.2);
        break;
      }
      case 'denied': {
        const o = this.out(pos, 0.35 * vol, 0.2, 0.5);
        this.osc('square', 220, 220, t, 0.14, o, 0.25);
        this.osc('square', 180, 180, t + 0.16, 0.2, o, 0.25);
        break;
      }
      case 'groan': {
        const o = this.out(pos, 0.35 * vol, 1, 3);
        const f = 140 + Math.random() * 80;
        this.osc('sawtooth', f, f * 0.6, t, 2.2, o, 0.06, 0.6, 'lin');
        this.noise(t, 2.2, o, { f0: f * 3, f1: f * 2, q: 12, gain: 0.5, a: 0.5 });
        break;
      }
      case 'ding': {
        const o = this.out(pos, 0.5 * vol, 0.8, 2);
        this.osc('sine', 1046, 1046, t, 1.6, o, 0.4);
        break;
      }
    }
  }
  startAmbience() {
    const ctx = this.ctx, t = this.t;
    // the building's hum: two detuned lows and moving air
    const hum = ctx.createGain();
    hum.gain.value = 0.06;
    hum.connect(this.master);
    for (const f of [49, 49.4, 98.3]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f > 60 ? 0.25 : 0.5;
      o.connect(g).connect(hum);
      o.start(t);
    }
    const air = ctx.createBufferSource();
    air.buffer = this.noiseBuf;
    air.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'bandpass';
    af.frequency.value = 380;
    af.Q.value = 0.6;
    const ag = ctx.createGain();
    ag.gain.value = 0.05;
    air.connect(af).connect(ag).connect(this.master);
    air.start(t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 140;
    lfo.connect(lg).connect(af.frequency);
    lfo.start(t);
    // the hold's eerie chord, faded in by setZone
    this.alien = ctx.createGain();
    this.alien.gain.value = 0;
    this.alien.connect(this.master);
    this.alien.connect(this.verb);
    for (const f of [110, 164.8, 207.6, 329.6]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const v = ctx.createOscillator();
      v.frequency.value = 0.15 + Math.random() * 0.2;
      const vg = ctx.createGain();
      vg.gain.value = f * 0.006;
      v.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(this.alien);
      o.start(t);
      v.start(t);
    }
    // the bay's electrical buzz
    this.buzz = ctx.createGain();
    this.buzz.gain.value = 0;
    this.buzz.connect(this.master);
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = 60;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 260;
    b.connect(bf).connect(this.buzz);
    b.start(t);
    // the alarm, a two-tone, gated by setAlarm
    this.alarm = ctx.createGain();
    this.alarm.gain.value = 0;
    this.alarm.connect(this.master);
    this.alarm.connect(this.verb);
    const ao = ctx.createOscillator();
    ao.type = 'square';
    const alf = ctx.createBiquadFilter();
    alf.type = 'lowpass';
    alf.frequency.value = 1100;
    ao.connect(alf).connect(this.alarm);
    ao.start(t);
    const step = () => {
      if (!this.ctx) return;
      const now = this.t;
      for (let i = 0; i < 8; i++) ao.frequency.setValueAtTime(i % 2 ? 440 : 554, now + i * 0.55);
      setTimeout(step, 4400);
    };
    step();
  }
  setZone(zone, dt) {
    if (!this.ctx) return;
    const t = this.t;
    this.alien.gain.setTargetAtTime(zone === 'garden' ? 0.05 : zone === 'corrB' ? 0.012 : 0, t, 1.5);
    this.buzz.gain.setTargetAtTime(zone === 'bay' || zone === 'lift' ? 0.025 : 0, t, 1.0);
  }
  setAlarm(level) {
    if (!this.ctx) return;
    this.alarm.gain.setTargetAtTime(level * 0.035, this.t, 0.5);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.t, 0.05);
  }
  suspend(on) {
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
    if (window.speechSynthesis) on ? speechSynthesis.pause() : speechSynthesis.resume();
  }
  /** The PA: a chime, then the line spoken in the browser's voice (when it has one). Returns the line's length (s). */
  pa(text) {
    this.play('pa');
    this.speak(text, 'pa', false, 1100);
    return 1.2 + text.length * 0.07;
  }
  /**
   * A line in the browser's own voice, a different one per speaker: the PA, Okafor, the Sweep's radio. A bark (a short
   * shout in a fight) is dropped rather than queued when someone is already speaking, so the voices never fall behind
   * what is happening. Returns the line's length (s).
   */
  speak(text, who = 'pa', bark = false, delay = 0) {
    const dur = 1.0 + text.length * 0.065;
    const V = {
      pa: { names: /Daniel|Karen|Google UK English Male/, rate: 0.88, pitch: 0.82, vol: 0.75 },
      okafor: { names: /Moira|Tessa|Samantha|Google UK English Female|Karen/, rate: 1.06, pitch: 1.05, vol: 0.9 },
      sweep: { names: /Fred|Ralph|Rishi|Aaron|Alex|Google US English/, rate: 1.15, pitch: 0.55, vol: 0.8 }
    }[who] ?? { names: /./, rate: 1, pitch: 1, vol: 0.8 };
    if (who === 'sweep') this.play('radio');
    try {
      if (!window.speechSynthesis) return dur;
      if (bark && (speechSynthesis.speaking || speechSynthesis.pending)) return dur;
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const pick = voices.find((v) => V.names.test(v.name)) ?? voices.find((v) => v.lang?.startsWith('en'));
      if (pick) u.voice = pick;
      u.rate = V.rate;
      u.pitch = V.pitch;
      u.volume = V.vol * this.volume;
      if (delay) setTimeout(() => speechSynthesis.speak(u), delay);
      else speechSynthesis.speak(u);
    } catch {}
    return dur;
  }
}
