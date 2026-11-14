// Copied from the Fighter Sound Lab (2026-11-14, the signed-off version). Loaded as an AudioWorklet module by
// flight-audio.mjs; it has no imports and runs on the audio thread.
//
// Fighter Sound Lab: the sound engine. Every sound is computed here, sample by sample, from what the ship is doing
// this instant (drive power, spool, strain, which valves are open, the load on the airframe). No sound files.
//
// Building blocks: noise, state-variable filters for shaping it, and modal resonators (a struck or rubbed piece of
// metal is a handful of decaying sine modes at inharmonic frequencies). Jitter everywhere: real machines never hold a
// pitch or a level exactly, and that wobble is most of what separates a machine from a synthesiser.

const SR = sampleRate;
const TAU = Math.PI * 2;
let seed = 0x2f6b9a1d;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296) * 2 - 1; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const soft = (x) => Math.tanh(x);

/** A decaying sine mode: a two-pole resonator with about unity gain at its peak. */
class Mode {
  constructor(f, t60, amp = 1) { this.y1 = 0; this.y2 = 0; this.set(f, t60, amp); }
  set(f, t60, amp = 1) {
    f = Math.min(f, SR * 0.45);
    const r = Math.exp(-6.91 / (t60 * SR)), w = (TAU * f) / SR;
    this.a1 = 2 * r * Math.cos(w); this.a2 = -r * r; this.b = (1 - r * r) * Math.sin(w) * amp;
  }
  tick(x) { const y = this.b * x + this.a1 * this.y1 + this.a2 * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
class Bank {
  constructor(spec) { this.modes = spec.map(([f, t, a]) => new Mode(f, t, a ?? 1)); }
  tick(x) { let s = 0; for (const m of this.modes) s += m.tick(x); return s; }
}
/** Topology-preserving state-variable filter. `set` once per block, `run` per sample. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.set(1000, 0.7); }
  set(f, q) { const g = Math.tan((Math.PI * clamp(f, 10, SR * 0.45)) / SR); this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
  run(x) {
    const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2; return v1;
  }
}
/** Slow random wander, smoothed: -1..1, changing at about `hz`. */
class Wander {
  constructor(hz) { this.a = 1 - Math.exp((-TAU * hz) / SR); this.y = 0; this.z = 0; }
  tick() { this.z += (rnd() * 1.7 - this.z) * this.a; this.y += (this.z - this.y) * this.a; return this.y; }
}
const smooth = (cur, target, ms) => cur + (target - cur) * (1 - Math.exp(-1 / ((ms / 1000) * SR)));
/** The same, applied once per 128-sample block. */
const smoothB = (cur, target, ms) => cur + (target - cur) * (1 - Math.exp(-128 / ((ms / 1000) * SR)));

// ---------------------------------------------------------------------------------------------------------------
// The main drive
// ---------------------------------------------------------------------------------------------------------------
const INHARM = [1, 2.76, 4.07, 5.4, 6.83, 8.93];
const HARM = [1, 2, 3, 4, 5, 6];
const FIFTHS = [1, 1.5, 2, 3, 4, 6];

class Engine extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { power: 0, spool: 0, strain: 0, online: 0, prime: 0, primeMs: 1500, size: 0.5, whine: 0.55, harmony: 0.9, grit: 0.6, hull: 0.7, wub: 0.7, level: 1 };
    this.s = { ...this.p };
    this.port.onmessage = (e) => Object.assign(this.p, e.data);
    this.ph = new Float64Array(6); this.shaft = 0; this.sub = 0;
    this.shim = HARM.map(() => new Wander(9)); this.jit = new Wander(3); this.jitF = new Wander(40); this.rum = new Wander(14);
    this.roar = new SVF(); this.throat = new SVF(); this.crk = new SVF();
    this.hullBank = null; this.hullSize = -1;
    this.crackleAmp = 0;
    this.wubPh = 0; this.wubTone = 0; this.wubW = new Wander(0.6);
  }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    const P = this.p, S = this.s;
    for (const k in P) S[k] = smoothB(S[k], P[k], k === 'prime' ? P.primeMs : k === 'spool' || k === 'power' ? 25 : 60);
    const sizeK = 1.7 - S.size * 1.2; // big ship = low
    if (Math.abs(this.hullSize - S.size) > 0.02 || !this.hullBank) {
      this.hullSize = S.size;
      this.hullBank = new Bank([[52, 0.55], [83, 0.5, 0.8], [129, 0.4, 0.7], [197, 0.32, 0.5], [306, 0.24, 0.4], [471, 0.18, 0.3]].map(([f, t, a]) => [f * sizeK, t, a]));
    }
    // prime: the power-up spins the turbopump with the drive unlit, so you hear the engine's own wub come up and settle
    const pr = S.prime, on = Math.max(S.online, Math.min(1, pr * 4)), pw = S.power, sp = Math.max(S.spool, pr * 0.8), spR = S.spool, st = S.strain;
    // ratios: inharmonic metal (0) -> harmonic (0.5) -> fifths (1)
    const h = S.harmony, ratios = HARM.map((_, i) => (h < 0.5 ? lerp(INHARM[i], HARM[i], h * 2) : lerp(HARM[i], FIFTHS[i], (h - 0.5) * 2)));
    const shaftHz = lerp(14, 78, sp) * sizeK, bladeHz = shaftHz * 11;
    this.roar.set((70 + 2400 * Math.pow(pw, 1.3)) * sizeK, 0.6);
    this.throat.set((260 + 900 * spR) * sizeK, 2.2);
    this.crk.set(2600 + 1800 * pw, 3);
    const toneG = S.whine * Math.min(1, sp * 1.6) * (1 + 1.6 * st) * 0.16; // no turbine turning, no whine
    const roarG = 0.012 + 0.15 * spR + 1.05 * pw;
    const subG = 0.03 + 0.12 * sp + 0.55 * pw;
    const crackRate = (1.5 + 70 * pw * S.grit) / SR;
    // The wub: a deep tone that throbs, slow when the turbopump is just turning, faster as it spins up.
    const wubHz = lerp(1.4, 5.2, sp), wubF = lerp(36, 56, sp) * (1.25 - 0.45 * S.size);
    const wubK = Math.max(S.wub, 0.9 * Math.min(1, pr * 2));
    const wubG = wubK * Math.min(1, sp * 2.5) * (0.55 + 0.45 * pw), wubD = wubK * Math.min(1, sp * 2);
    for (let i = 0; i < L.length; i++) {
      const jit = 1 + (this.jit.tick() * 0.006 + this.jitF.tick() * 0.0025) * (0.4 + S.grit);
      this.shaft += (TAU * shaftHz * jit) / SR; if (this.shaft > TAU) this.shaft -= TAU;
      let tone = 0;
      for (let k = 0; k < 6; k++) {
        this.ph[k] += (TAU * bladeHz * ratios[k] * jit) / SR; if (this.ph[k] > TAU) this.ph[k] -= TAU;
        tone += Math.sin(this.ph[k]) * (1 / Math.pow(k + 1, 1.05)) * (1 + 0.45 * S.grit * this.shim[k].tick());
      }
      tone *= (1 + 0.22 * Math.sin(this.shaft)) * toneG; // rotor imbalance: the wub at shaft speed
      const rum = this.rum.tick();
      this.wubPh += (TAU * wubHz * (1 + 0.15 * this.wubW.tick())) / SR; if (this.wubPh > TAU) this.wubPh -= TAU;
      const sh = Math.pow(0.5 + 0.5 * Math.sin(this.wubPh), 1.6);
      this.wubTone += (TAU * wubF * jit) / SR; if (this.wubTone > TAU) this.wubTone -= TAU;
      const wub = soft(2.4 * Math.sin(this.wubTone)) * sh * wubG * 0.5;
      const n = rnd();
      this.roar.run(n); this.throat.run(n);
      const roar = (this.roar.lp * 1.6 + this.throat.bp * 0.35 * (0.3 + st)) * roarG * (1 + 0.8 * S.grit * rum) * (1 - 0.5 * wubD * (1 - sh));
      // crackle: sparse grains of combustion
      let crack = 0;
      if (Math.random() < crackRate * (1 + 3 * st)) this.crackleAmp = (0.4 + Math.random()) * pw;
      if (this.crackleAmp > 0.001) { crack = this.crk.run(rnd() * this.crackleAmp); this.crackleAmp *= 0.996; }
      this.sub += (TAU * (24 + 18 * sp) * sizeK) / SR;
      const sub = Math.sin(this.sub) * subG * (1 + 0.35 * rum) * (1 - 0.6 * wubD * (1 - sh));
      const hull = this.hullBank.tick(roar * 0.5 + crack * 2 + tone * 0.3 + wub * 0.6) * S.hull * 1.4;
      let y = (tone + roar + crack * 0.6 + sub + hull + wub) * on * S.level;
      y = soft(y * 0.9) * 0.62;
      L[i] = y; R[i] = y;
    }
    return true;
  }
}
registerProcessor('engine', Engine);

// ---------------------------------------------------------------------------------------------------------------
// Manoeuvring jets: one voice per cluster. A valve opens (a pop through the block, a thump through the frame), gas
// rushes out (turbulent noise, brightest at the first overpressure), the valve shuts (a tick).
// ---------------------------------------------------------------------------------------------------------------
class Jets extends AudioWorkletProcessor {
  constructor() {
    super();
    this.d = { tone: 1, release: 30, thump: 0.5, pop: 1, level: 1 };
    this.v = [0, 1, 2, 3].map(() => ({ p: 0, open: 0, pan: 0, env: 0, over: 0, svf: new SVF(), hp: new SVF(), lo: new SVF(), turb: new Wander(45), pop: new Bank([[1850, 0.025], [3230, 0.02, 0.8], [5170, 0.012, 0.6]]), thump: new Bank([[96, 0.09], [151, 0.07, 0.6]]), popX: 0, thumpX: 0, tickX: 0 }));
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.design) Object.assign(this.d, m.design);
      if (m.v) m.v.forEach((x, i) => { const v = this.v[i]; if (!v) return; if (x.open && !v.open) { v.popX = 1; v.thumpX = 1; v.over = 1; } if (!x.open && v.open) v.tickX = 0.35; v.open = x.open; v.p = x.p; v.pan = x.pan; });
    };
  }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    const d = this.d, rel = Math.exp(-1 / ((d.release / 1000) * SR)), att = Math.exp(-1 / (0.002 * SR)), od = Math.exp(-1 / (0.025 * SR));
    for (const v of this.v) { const f = (2000 + 2400 * v.p) * d.tone; v.svf.set(f, 0.8); v.hp.set(f * 0.45, 0.7); v.lo.set(220 * d.tone + 90, 0.9); v.gl = Math.cos((v.pan + 1) * Math.PI / 4); v.gr = Math.sin((v.pan + 1) * Math.PI / 4); }
    for (let i = 0; i < L.length; i++) {
      let l = 0, r = 0;
      for (const v of this.v) {
        const target = v.open ? v.p : 0;
        v.env = target > v.env ? target + (v.env - target) * att : target + (v.env - target) * rel;
        v.over *= od;
        const turb = v.turb.tick();
        let gas = 0;
        if (v.env > 0.0005 || v.over > 0.001) {
          const n = rnd() * (1 + 0.5 * turb);
          v.svf.run(n); v.hp.run(n); v.lo.run(n);
          const air = Math.min(1, d.tone * d.tone); // hiss fades out as the pitch drops: what is left is the gas body
          gas = (v.svf.bp * 0.9 * (0.35 + 0.65 * air) + v.hp.hp * 0.35 * air + v.lo.lp * 0.9 * (1 - 0.6 * air)) * (v.env * 0.55 + v.over * 0.8 * v.p);
        }
        let x = 0;
        if (v.popX > 0.001 || v.tickX > 0.001) { x = (v.popX + v.tickX) * rnd(); v.popX *= 0.6; v.tickX *= 0.5; }
        const pop = v.pop.tick(x) * 0.9 * d.pop;
        const th = v.thump.tick(v.thumpX > 0.001 ? v.thumpX * rnd() : 0) * 3.5 * d.thump * (0.4 + v.p); v.thumpX *= 0.8;
        const s = (gas + pop) * d.level;
        l += s * v.gl + th * 0.7; r += s * v.gr + th * 0.7;
      }
      L[i] = soft(l * 0.9); R[i] = soft(r * 0.9);
    }
    return true;
  }
}
registerProcessor('jets', Jets);

// ---------------------------------------------------------------------------------------------------------------
// The body: the airframe under load (creaks, clanks, rattles), the servos, the beam, the pilot's breathing, and the
// one-off machine sounds (relays, pumps, igniters, the guns) sent as events.
// ---------------------------------------------------------------------------------------------------------------
const BANKS = {
  relay: [[2380, 0.03], [3910, 0.025, 0.7], [6120, 0.015, 0.5], [455, 0.05, 0.6]],
  switch: [[3100, 0.012], [5400, 0.008, 0.6], [820, 0.02, 0.4]],
  hull: [[46, 0.45], [69, 0.38, 0.9], [103, 0.3, 0.7], [151, 0.22, 0.5], [229, 0.15, 0.32], [347, 0.1, 0.2]],
  gun: [[742, 0.11], [1183, 0.09, 0.8], [1894, 0.07, 0.6], [2651, 0.05, 0.5], [3907, 0.04, 0.35]],
  casing: [[1870, 0.05], [2930, 0.04, 0.7], [4410, 0.03, 0.5]],
  spark: [[5230, 0.01], [7410, 0.008, 0.7], [9100, 0.006, 0.5]],
  valve: [[1450, 0.02], [2900, 0.015, 0.5]],
  // the structure settling: a deep plate ping with a long tail, far from you
  settle: [[44, 0.8], [67, 0.65, 0.85], [98, 0.5, 0.6], [143, 0.38, 0.4], [209, 0.26, 0.22]],
};
// How long each kind of strike excites its bank (per-sample decay of the noise burst), and how loud the bank is.
const EXDEC = { relay: 0.9, switch: 0.85, hull: 0.997, gun: 0.97, casing: 0.8, spark: 0.6, valve: 0.95, settle: 0.99 };
// Gains measured offline (tools/h4.mjs): creak peak ~0.25 at load 0.7, rattle ~0.1, a full wub ~0.3, a rumble ~0.2, the bed rms ~0.008.
const CREAKG = 20, RATG = 9, WUBG = 0.3, RUMG = 2, BEDG = 0.5;
const BANKGAIN = { relay: 14, switch: 14, hull: 48, gun: 18, casing: 12, spark: 6, valve: 10, settle: 200 };
const mkSlip = (secs, rate, amp) => ({ left: secs * SR, len: secs * SR, rate, drift: (Math.random() - 0.5) * 2, next: 0, amp, pan: (Math.random() - 0.5) * 1.2, w: new Wander(3 + Math.random() * 4) });
class Body extends AudioWorkletProcessor {
  constructor() {
    super();
    this.p = { load: 0, vib: 0, servo: 0, beam: 0, breath: 0, creak: 1, rattle: 1, level: 1, online: 0, bed: 0 };
    this.s = { ...this.p };
    this.banks = Object.fromEntries(Object.entries(BANKS).map(([k, v]) => [k, new Bank(v)]));
    this.ex = Object.fromEntries(Object.keys(BANKS).map((k) => [k, 0]));
    // Creaks are the hull groaning: friction stick-slip so fast the slips fuse into a rough, wavering low tone, swelling
    // in and out, through a dense set of heavily damped modes. Slow slips into long-ringing modes sounded like bongos.
    this.panel = new Bank([[38, 0.16], [53, 0.14, 0.9], [71, 0.13, 0.85], [94, 0.11, 0.75], [126, 0.1, 0.6], [167, 0.08, 0.5], [221, 0.07, 0.38], [298, 0.05, 0.25], [395, 0.04, 0.16]]);
    this.slipF = new SVF(); this.slipF.set(260, 0.6);
    // Rattles: loose fittings chattering, dull and short (no ring: ringing modes up there were the frying pan).
    this.rat = new Bank([[150, 0.018], [212, 0.016, 0.85], [297, 0.013, 0.6], [433, 0.01, 0.35]]);
    this.ratF = new SVF(); this.ratF.set(700, 0.6);
    this.wubs = []; this.rumbles = []; this.rumF = new SVF(); this.rumF.set(85, 0.8); this.bedF = new SVF(); this.bedF.set(60, 0.7); this.bedW = new Wander(0.25);
    this.slip = null; this.slipEx = 0; this.lastLoad = 0;
    this.blast = 0; this.blastF = new SVF(); this.blastF.set(1600, 0.6);
    this.hums = []; this.beeps = []; this.pumps = [];
    // servo
    this.svPh = 0; this.svF = new SVF(); this.svMesh = 0;
    // beam
    this.bm = { charge: 0, on: 0, tail: 0, ph: 0, ph2: 0, arc: new Bank([[3300, 0.01], [5600, 0.008, 0.7], [7900, 0.006, 0.5]]), whine: new Mode(600, 0.08), hiss: new SVF(), am: new Wander(25) };
    this.bm.hiss.set(5200, 1.2);
    // breath
    this.br = { t: 0, period: 4, f1: new SVF(), f2: new SVF(), f3: new SVF(), stress: 0 };
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.set) Object.assign(this.p, m.set);
      if (m.hit) this.ex[m.hit] += m.amp ?? 1;
      if (m.blast) { this.blast = Math.max(this.blast, m.blast); this.ex.hull += m.blast * 0.8; }
      if (m.hum) this.hums.push({ t: 0, len: m.hum, amp: m.amp ?? 1, f: m.f ?? 100, ph: 0 });
      if (m.beep) this.beeps.push({ t: 0, len: m.len ?? 0.07, f: m.beep, ph: 0, amp: m.amp ?? 1, spk: new Mode(2600, 0.01) });
      if (m.wub) this.wubs.push({ t: 0, len: m.wub, f: m.f ?? 45, r0: m.r0 ?? 1.5, r1: m.r1 ?? 6, amp: m.amp ?? 1, ph: 0, lph: 0 });
      if (m.rumble) this.rumbles.push({ t: 0, len: m.rumble, amp: m.amp ?? 1 });
      if (m.groan) this.slip = mkSlip(m.len ?? 1, m.rate ?? 25 + Math.random() * 30, m.groan);
      if (m.pump) this.pumps.push({ t: 0, len: m.pump, f: new SVF(), am: new Wander(7), amp: m.amp ?? 1 });
    };
  }
  process(_, outputs) {
    const out = outputs[0], L = out[0], R = out[1] || out[0];
    const P = this.p, S = this.s;
    for (const k in P) S[k] = smoothB(S[k], P[k], 40);
    const N = L.length, dt = 1 / SR;
    // a sudden jump in load is a clank through the frame
    const dLoad = S.load - this.lastLoad; this.lastLoad = S.load;
    if (dLoad > 0.05) this.ex.hull += Math.min(1, dLoad * 6) * S.creak;
    // breath set-up for this block
    const br = this.br; br.stress = smoothB(br.stress, S.load, 1500);
    br.period = lerp(4.3, 1.5, clamp(br.stress * 1.3, 0, 1));
    br.f1.set(lerp(650, 900, br.stress), 2.2); br.f2.set(1750, 2.5); br.f3.set(lerp(420, 380, br.stress), 1.5);
    this.svF.set(400 + 1800 * S.servo, 3);
    const bm = this.bm;
    for (let i = 0; i < N; i++) {
      let y = 0, l = 0, r = 0;
      // creaks: stick-slip events, more and stronger with load
      if (!this.slip && Math.random() < (S.load * S.load * 4.5 * S.creak) / SR) this.slip = mkSlip(0.5 + Math.random() * 1.6, 22 + Math.random() * 45, (0.3 + Math.random() * 0.7) * S.load);
      let ex = 0;
      if (this.slip) {
        const sl = this.slip;
        const q = 1 - sl.left / sl.len, env = Math.pow(Math.sin(Math.PI * q), 1.4); // swell in, swell out
        if (--sl.next <= 0) { this.slipEx = sl.amp * env * (0.6 + 0.8 * Math.random()); sl.next = (SR / (sl.rate * (1 + 0.5 * sl.w.tick()))) * (0.75 + Math.random() * 0.5); sl.rate *= 1 + sl.drift * 0.0015; }
        if (--sl.left <= 0) this.slip = null;
      }
      if (this.slipEx > 1e-4) { ex = this.slipEx * rnd(); this.slipEx *= 0.985; }
      const cr = this.panel.tick((this.slipF.run(ex), this.slipF.lp)) * CREAKG;
      const sp = this.slip ? this.slip.pan : 0;
      l += cr * (1 - sp) * 0.5; r += cr * (1 + sp) * 0.5;
      // rattles: loose fittings buzzing with the drive
      if (S.vib > 0.2 && Math.random() < (S.vib - 0.2) * 160 * S.rattle / SR) this.ex.rattle = (this.ex.rattle || 0) + 0.12 * S.vib * (0.4 + Math.random());
      const rx = this.ex.rattle || 0; this.ex.rattle = rx * 0.9;
      y += this.rat.tick((this.ratF.run(rx * rnd()), this.ratF.lp)) * RATG;
      // event banks
      for (const k in this.banks) { const e = this.ex[k]; const x = e > 1e-4 ? e * rnd() : 0; this.ex[k] = e * EXDEC[k]; y += this.banks[k].tick(x) * BANKGAIN[k]; }
      // gun blast
      if (this.blast > 1e-3) { const b = soft(this.blastF.run(rnd() * this.blast * 3) * 2) * 0.7; y += b; this.blast *= 0.9988; }
      // servo: a geared motor, pitch with how hard the stick is moving
      if (S.servo > 0.01) {
        const f = 160 + 780 * S.servo; this.svPh += (TAU * f) / SR; if (this.svPh > TAU) this.svPh -= TAU;
        this.svMesh += (TAU * f * 0.27) / SR;
        let saw = 0; for (let k = 1; k <= 6; k++) saw += Math.sin(this.svPh * k) / k;
        const sv = (saw * (0.7 + 0.3 * Math.sin(this.svMesh)) + this.svF.run(rnd()) * 0.6) * Math.pow(S.servo, 0.8) * 0.05;
        y += sv;
      }
      // beam: charge, hold, tail
      if (S.beam > 0.5 || bm.charge > 0 || bm.tail > 0.001) {
        if (S.beam > 0.5) { bm.charge = Math.min(1, bm.charge + dt / 0.28); bm.tail = 1; } else { bm.charge = Math.max(0, bm.charge - dt / 0.12); bm.tail *= 0.99995; }
        const am = bm.am.tick();
        if (bm.charge < 1 && S.beam > 0.5) { bm.whine.set(500 + 2600 * bm.charge * bm.charge, 0.06); y += bm.whine.tick(rnd()) * 0.5 * bm.charge; }
        if (bm.charge >= 1) {
          bm.ph += (TAU * 100) / SR; bm.ph2 += (TAU * 150.4) / SR;
          const hum = soft(3 * Math.sin(bm.ph)) * 0.6 + soft(2 * Math.sin(bm.ph2)) * 0.3;
          const arc = bm.arc.tick(Math.random() < 140 / SR ? rnd() * 2 : 0) * 1.2;
          y += (hum * (0.8 + 0.4 * am) * 0.18 + arc * 0.5 + bm.hiss.run(rnd()) * 0.04);
        } else if (S.beam <= 0.5) {
          y += bm.hiss.run(rnd()) * 0.12 * bm.tail; // coolant venting after the shot
        }
      }
      // wubs: a deep tone throbbing, its throb speeding up (power coming up, a pump far below you)
      for (let j = this.wubs.length - 1; j >= 0; j--) {
        const w = this.wubs[j]; w.t += dt; const q = Math.min(1, w.t / w.len);
        w.lph += (TAU * lerp(w.r0, w.r1, q)) / SR; w.ph += (TAU * w.f * (1 + 0.006 * Math.sin(w.lph * 0.37))) / SR;
        const sh = Math.pow(0.5 + 0.5 * Math.sin(w.lph), 1.6), e = Math.pow(Math.sin(Math.PI * q), 0.7);
        y += soft(2.2 * Math.sin(w.ph)) * sh * e * w.amp * WUBG;
        if (w.t > w.len) this.wubs.splice(j, 1);
      }
      // rumbles: the structure moving, a long low swell of noise
      if (this.rumbles.length) {
        let a = 0;
        for (let j = this.rumbles.length - 1; j >= 0; j--) { const ru = this.rumbles[j]; ru.t += dt; a += Math.sin(Math.PI * Math.min(1, ru.t / ru.len)) * ru.amp; if (ru.t > ru.len) this.rumbles.splice(j, 1); }
        this.rumF.run(rnd()); y += this.rumF.lp * a * RUMG;
      }
      // the bed: the ship never quite silent, a deep slow breathing of the structure
      if (S.bed > 0.01) { this.bedF.run(rnd()); y += this.bedF.lp * (0.6 + 0.4 * this.bedW.tick()) * S.bed * BEDG; }
      // relays, beeps, hums, pumps
      for (let j = this.hums.length - 1; j >= 0; j--) { const hm = this.hums[j]; hm.t += dt; hm.ph += (TAU * hm.f) / SR; const e = Math.sin(Math.PI * Math.min(1, hm.t / hm.len)); y += (soft(2.5 * Math.sin(hm.ph)) + 0.4 * Math.sin(hm.ph * 3.01)) * e * 0.03 * hm.amp; if (hm.t > hm.len) this.hums.splice(j, 1); }
      for (let j = this.beeps.length - 1; j >= 0; j--) { const b = this.beeps[j]; b.t += dt; b.ph += (TAU * b.f) / SR; let sq = 0; for (let k = 1; k <= 7; k += 2) sq += Math.sin(b.ph * k) / k; const e = b.t < 0.004 ? b.t / 0.004 : Math.max(0, 1 - (b.t - b.len) / 0.01); y += (sq * 0.6 + b.spk.tick(sq) * 0.8) * e * 0.012 * b.amp; if (b.t > b.len + 0.012) this.beeps.splice(j, 1); }
      for (let j = this.pumps.length - 1; j >= 0; j--) { const pu = this.pumps[j]; pu.t += dt; if (i === 0) pu.f.set(260 + 160 * pu.am.y, 1.8); const e = Math.min(1, pu.t / 0.2) * Math.min(1, (pu.len - pu.t) / 0.3); const g = 0.5 + 0.5 * Math.sin(TAU * 6.5 * pu.t + pu.am.tick() * 2); y += pu.f.run(rnd()) * e * g * 0.35 * pu.amp; if (pu.t > pu.len) this.pumps.splice(j, 1); }
      // breathing in the mask
      if (S.breath > 0.01) {
        br.t += dt;
        const T = br.period, ph = br.t / T;
        if (ph >= 1) { br.t = 0; this.ex.valve += 0.5; }
        let b = 0;
        const n = rnd();
        if (ph < 0.32) { // inhale: demand valve hiss and the throat
          const e = Math.sin(Math.PI * ph / 0.32) ** 2;
          b = (br.f1.run(n) * 0.8 + br.f2.run(n) * 0.5) * e * (0.6 + 0.9 * br.stress);
          if (br.stress > 0.6) b += n * e * 0.08 * (br.stress - 0.6); // pressure breathing forces air in
        } else if (ph > 0.42 && ph < 0.86) { // exhale through the valve
          const q = (ph - 0.42) / 0.44, e = Math.sin(Math.PI * q) ** 1.5;
          b = br.f3.run(n) * e * 0.75 * (1 + 0.3 * Math.sin(TAU * 31 * br.t));
          if (br.stress > 0.7 && q < 0.15) b += br.f1.run(n) * (0.15 - q) * 6 * (br.stress - 0.7); // the strain's grunt
        }
        y += b * 0.32 * S.breath;
      }
      const o = y * S.level;
      L[i] = soft((o + l) * 0.9); R[i] = soft((o + r) * 0.9);
    }
    return true;
  }
}
registerProcessor('body', Body);
