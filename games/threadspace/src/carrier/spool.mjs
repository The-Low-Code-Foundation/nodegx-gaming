// A main drive's turbopump spooling: the "event" of lighting the drive, shared by the fighter (flight-audio.mjs) and
// the ship you are aboard (ambience.mjs, from drive.mjs). Synthesised on the page's AudioContext (sfx.mjs), no files.
//
// `spin` (0 to 1) is the pump's speed. It climbs toward what the drive asks (`frame(dt, target)`) over `up` seconds
// and falls over `down` (slower, and slower still as it winds out). What you hear:
//   whine  a turbine whine (three partials through a band) whose pitch rises from `lo` to `hi` Hz with the spin;
//   wub    a deep tone (`wubF` Hz) whose loudness throbs, "wub… wub… wub-wub-wub", the throb's rate rising from
//          `wubLo` to `wubHi` Hz with the spin, so it speeds up as she spools and slows as she winds down.
// Both are loudest while the spin is changing and settle to `run` of that once it is steady: the spin-up is an event,
// then it sits under the running drive. With `thump`, lighting (`lit` turning true) adds an ignition thump and a roar
// swelling in; cutting it a valve's clunk. `fail()` is a try that does not catch: the pump kicks,
// stutters and dies (the drive is offline).

export const SPOOL = {
  /** The ship's drive heard through her structure (ambience.mjs). */
  ship: { lo: 150, hi: 980, up: 2.6, down: 5.5, wubLo: 0.9, wubHi: 9, wubF: [30, 52], whine: 0.05, wub: 0.32, run: 0.3, level: 1, thump: 0.5 },
  /** The fighter's drive in the helmet (flight-audio.mjs: its own engine already roars; this is the pump). */
  fighter: { lo: 240, hi: 1500, up: 1.2, down: 3, wubLo: 1.4, wubHi: 12, wubF: [36, 60], whine: 0.07, wub: 0.28, run: 0.25, level: 1, thump: 0 }
};

/** The ship's main drive burning, heard through her structure (ambience.mjs): the fighter's own engine (dsp.js
 *  `engine`, flight-audio.mjs) made bigger, so it is deeper and heavier, the same voice an octave and more down.
 *  `size` over 1 drops every pitch in it (dsp.js `sizeK`: 1 is the fighter's, 1.15 a little over an octave lower);
 *  `gain` is its loudness at the helm with the drive flat out, before the room. */
export const SHIP_BURN = { size: 1.15, whine: 0.1, harmony: 0.55, grit: 0.35, hull: 0.95, wub: 0.25, gain: 1.4 };

const dspLoads = new WeakMap();
/** Loads the sound engine's worklets (dsp.js) on `ctx`, once however often it is asked: the fighter's sound and the
 *  ship's drive share them. Resolves true when they are ready. */
export function loadDsp(ctx) {
  if (!dspLoads.has(ctx))
    dspLoads.set(ctx, ctx.audioWorklet.addModule(new URL('./dsp.js', import.meta.url)).then(() => true, (e) => (console.warn('Sound: the sound engine did not load', e), false)));
  return dspLoads.get(ctx);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;

export class Spool {
  /** `ctx` an AudioContext, `out` where it goes, `noise` a noise buffer (sfx.mjs), `opts` a `SPOOL` entry. */
  constructor(ctx, out, noise, opts = SPOOL.ship) {
    this.ctx = ctx;
    this.noise = noise;
    this.o = { ...opts };
    this.spin = 0;
    this.change = 0; // how fast the spin is moving, 0 to 1 (1: as fast as it spools up)
    this.lit = false;
    this.failT = 0;
    const C = ctx;
    this.out = C.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);
    // The throb: a slow oscillator, shaped so it is mostly off with a round swell each beat.
    this.lfo = C.createOscillator();
    this.lfo.frequency.value = this.o.wubLo;
    const shape = C.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.pow((i / 255), 2.2); // input -1..1 → 0..1, peaky
    shape.curve = curve;
    this.lfo.connect(shape);
    // The wub: a deep triangle, its loudness the throb.
    this.wubOsc = C.createOscillator();
    this.wubOsc.type = 'triangle';
    this.wubOsc.frequency.value = this.o.wubF[0];
    const wubLp = C.createBiquadFilter();
    wubLp.type = 'lowpass';
    wubLp.frequency.value = 240;
    this.wubAm = C.createGain();
    this.wubAm.gain.value = 0;
    shape.connect(this.wubAm.gain);
    this.wubG = C.createGain();
    this.wubG.gain.value = 0;
    this.wubOsc.connect(wubLp).connect(this.wubAm).connect(this.wubG).connect(this.out);
    // The whine: three partials through a band, wobbling a little with the throb (the rotor's imbalance).
    this.whineBp = C.createBiquadFilter();
    this.whineBp.type = 'bandpass';
    this.whineBp.Q.value = 1.6;
    this.whineBp.frequency.value = this.o.lo * 2;
    const whineLp = C.createBiquadFilter();
    whineLp.type = 'lowpass';
    whineLp.frequency.value = 3800;
    this.whineAm = C.createGain();
    this.whineAm.gain.value = 0.75;
    const wob = C.createGain();
    wob.gain.value = 0.35;
    shape.connect(wob).connect(this.whineAm.gain);
    this.whineG = C.createGain();
    this.whineG.gain.value = 0;
    this.partials = [[1, 'sawtooth', 0.5], [2.01, 'sine', 0.6], [3.03, 'triangle', 0.25]].map(([k, type, a]) => {
      const o = C.createOscillator(), g = C.createGain();
      o.type = type;
      o.frequency.value = this.o.lo * k;
      g.gain.value = a;
      o.connect(g).connect(this.whineBp);
      o.start();
      return { o, k };
    });
    this.whineBp.connect(whineLp).connect(this.whineAm).connect(this.whineG).connect(this.out);
    this.lfo.start();
    this.wubOsc.start();
  }

  /** Each frame: `target` the spin the drive asks (0 off, about 0.75 lit, 1 flat out); `level` 0 to 1 how much of it
   *  reaches you (where you are, the air); `lit` whether the drive is burning (its edges are the thump and the clunk). */
  frame(dt, target, level = 1, lit = target > 0.5) {
    const o = this.o, C = this.ctx, t = C.currentTime;
    if (this.failT > 0) {
      // A try that does not catch: the pump kicks to a third, stutters, and dies.
      this.failT -= dt;
      target = this.failT > 0.35 ? 0.3 * (Math.sin(this.failT * 38) > -0.3 ? 1 : 0.55) : 0;
    }
    target = clamp(target, 0, 1);
    if (o.thump && lit && !this.lit) this.light(level);
    if (o.thump && !lit && this.lit) this.clunk(level);
    this.lit = lit;
    const was = this.spin;
    if (target > this.spin) this.spin = Math.min(target, this.spin + dt / o.up);
    else this.spin = Math.max(target, this.spin - (dt / o.down) * (0.3 + this.spin));
    const rate = Math.abs(this.spin - was) / Math.max(dt, 1e-4) * o.up; // 1 while spooling up flat out
    this.change += (clamp(rate * 1.4, 0, 1) - this.change) * (1 - Math.exp(-dt / 0.25));
    const s = this.spin, live = clamp(s * 4, 0, 1);
    const swell = o.run + (1 - o.run) * this.change;
    const k = (n) => (n < 1e-4 ? 0 : n);
    this.out.gain.setTargetAtTime(k(o.level * level), t, 0.08);
    const f = lerp(o.lo, o.hi, Math.pow(s, 1.3));
    for (const p of this.partials) p.o.frequency.setTargetAtTime(f * p.k, t, 0.04);
    this.whineBp.frequency.setTargetAtTime(f * 2, t, 0.05);
    this.whineG.gain.setTargetAtTime(k(o.whine * live * swell), t, 0.05);
    this.lfo.frequency.setTargetAtTime(lerp(o.wubLo, o.wubHi, s), t, 0.05);
    this.wubOsc.frequency.setTargetAtTime(lerp(o.wubF[0], o.wubF[1], s), t, 0.05);
    this.wubG.gain.setTargetAtTime(k(o.wub * clamp(s * 3, 0, 1) * swell), t, 0.06);
  }

  /** Silent and stopped at once (you climbed out). */
  reset() {
    const t = this.ctx.currentTime;
    this.spin = this.change = this.failT = 0;
    this.lit = false;
    for (const g of [this.whineG, this.wubG]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  /** The drive was asked for and cannot light: the pump kicks and dies. */
  fail() {
    if (this.failT <= 0) this.failT = 1.1;
  }

  /** Ignition: a low thump falling away, and a roar of noise swelling in under the spool. */
  light(level) {
    const C = this.ctx, t = C.currentTime, v = this.o.thump * level;
    if (v < 0.01) return;
    const o = C.createOscillator(), g = C.createGain();
    o.frequency.setValueAtTime(85, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 1.2);
    if (!this.noise) return;
    const s = C.createBufferSource(), lp = C.createBiquadFilter(), n = C.createGain();
    s.buffer = this.noise;
    s.loop = true;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(90, t);
    lp.frequency.exponentialRampToValueAtTime(520, t + 1.4);
    lp.frequency.exponentialRampToValueAtTime(160, t + 3.2);
    n.gain.setValueAtTime(0.0001, t);
    n.gain.exponentialRampToValueAtTime(0.35 * v, t + 0.9);
    n.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    s.connect(lp).connect(n).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + 3.5);
  }

  /** Cutoff: the propellant valves shutting, a short dull clunk. */
  clunk(level) {
    const C = this.ctx, t = C.currentTime, v = this.o.thump * level;
    if (v < 0.01 || !this.noise) return;
    const s = C.createBufferSource(), lp = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.noise;
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    lp.Q.value = 3;
    g.gain.setValueAtTime(0.4 * v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(lp).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.5, 0.25);
  }

  /** For tests and the console. */
  info() {
    return { spin: +this.spin.toFixed(3), change: +this.change.toFixed(3), whine: +this.whineG.gain.value.toFixed(4), wub: +this.wubG.gain.value.toFixed(4), throb: +this.lfo.frequency.value.toFixed(2), pitch: +this.partials[0].o.frequency.value.toFixed(1), out: +this.out.gain.value.toFixed(3) };
  }
}
