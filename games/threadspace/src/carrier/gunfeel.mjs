// How the guns and the hits feel aboard: what you hear through the structure and how the ship moves under you.
//
// A gun on a warship is not heard through the air (there is none outside): it comes to you through the frames, as a
// deep thump, a crack, and the hull ringing after it, longer and lower the bigger the gun. `Feel` makes those sounds
// live on the game's audio context (sfx.mjs `ctx`, its noise buffer and output; nothing downloaded), through its own
// compressor so a broadside does not clip, and keeps the thumps the camera plays: a low sway that rings down, not a
// random jitter, so a shot reads as the ship moving and not the screen shaking.
//
// `gun(kind, impulse, d)`: a shot from one of hers, `d` metres from you (ship frame). Kinds: `cannon` (a turret's
// round), `rail` (a railgun slug: the whole hull rings), `tube` (a cold torpedo launch), `pdc` (a burst of point
// defence), `flak` (a flak gun's shell: a short, sharp version of the cannon). `blast(d)`: a torpedo's warhead going off in her. `fighterShot()`: a round from your fighter's cannon,
// heard and felt through her airframe. `railOff()`: a missile kicked off her rail. `ignite(v, near)`: a rocket motor
// lighting (a missile's or a torpedo's), by loudness `v`; `near` within a few tens of metres. `frame(dt, camera, how)` moves the camera: `how` is 'aboard' (walking, at a
// gun, on the bridge), 'cockpit' or null (outside: you see it instead, and hear it by distance through sfx.mjs).
// Numbers are `FEEL`.

import * as THREE from 'three';

export const FEEL = {
  cannon: { size: 0.55, near: 30, felt: 0.35, vol: 0.55 }, // thump size near the gun, metres it falls off over, the least felt anywhere aboard, loudness
  rail: { size: 1.5, near: 45, felt: 0.9, vol: 0.8 },
  tube: { size: 0.4, near: 25, felt: 0.15, vol: 0.45 },
  pdc: { size: 0.12, near: 15, felt: 0, vol: 0.3 },
  flak: { size: 0.3, near: 20, felt: 0.04, vol: 0.4 }, // a flak gun's round: a short, sharp thump, lighter than a turret's
  blast: { size: 2.4, near: 60, felt: 1.1, vol: 1 },
  sway: 0.06, // m of camera movement per unit of thump
  roll: 0.012, // radians of roll per unit
  fighter: { kick: 0.35, vol: 0.32 } // your fighter's cannon: the airframe's buzz per round, and its loudness
};

const _up = new THREE.Vector3(), _side = new THREE.Vector3();

export class Feel {
  /** `sfx` the game's sound (sfx.mjs). */
  constructor(sfx) {
    this.sfx = sfx;
    this.thumps = []; // { t, size, freq, decay, ph, roll }
    this.buzz = 0; // the fighter's cannon: high-frequency shiver while it fires
  }

  /** The chain everything here plays into: a compressor into the game's output. Made on first use. */
  get out() {
    const S = this.sfx;
    if (!S?.on || !S.ctx || S.ctx.state !== 'running' || !S.out) return null;
    if (!this.bus || this.bus.context !== S.ctx) {
      this.bus = S.ctx.createDynamicsCompressor();
      this.bus.threshold.value = -14;
      this.bus.knee.value = 8;
      this.bus.ratio.value = 6;
      this.bus.attack.value = 0.003;
      this.bus.release.value = 0.25;
      this.bus.connect(S.out);
    }
    return this.bus;
  }

  /** A thump through the structure: the camera rings `size` at `freq` Hz, dying at `decay` per second. */
  thump(size, freq = 6, decay = 2.4, roll = 1) {
    if (!(size > 0.02)) return;
    this.thumps.push({ t: 0, size, freq, decay, roll, ph: Math.random() * Math.PI * 2 });
    if (this.thumps.length > 12) this.thumps.shift();
  }

  /** One of her guns firing, `d` m from you aboard (`aboard` false: you are outside, and it is not felt). */
  gun(kind, impulse, d, aboard = true) {
    const K = FEEL[kind];
    if (!K) return;
    const near = 1 / (1 + d / K.near);
    if (aboard) {
      const size = K.felt * 0.5 + K.size * near;
      if (kind === 'rail') (this.thump(size, 4.5, 1.6, 1.4), this.thump(size * 0.5, 13, 4, 0.3));
      else if (kind === 'cannon') (this.thump(size, 7, 2.6, 1), this.thump(size * 0.35, 16, 6, 0.2));
      else if (kind === 'tube') this.thump(size, 5, 3, 0.4);
      else if (kind === 'flak') this.thump(size, 11, 4, 0.3);
      else this.thump(size, 22, 8, 0.1);
      const v = K.vol * (0.35 + 0.65 * near);
      if (kind === 'cannon') this.cannon(v, near);
      else if (kind === 'rail') this.rail(v, near);
      else if (kind === 'tube') this.tube(v, near);
      else if (kind === 'pdc') this.pdc(v * near);
      else if (kind === 'flak') this.cannon(v * 0.6, near);
    }
  }

  /** A torpedo's warhead in her, `d` m from you. */
  blast(d) {
    const K = FEEL.blast, near = 1 / (1 + d / K.near);
    const size = K.felt + K.size * near;
    this.thump(size, 3, 1.1, 2);
    this.thump(size * 0.6, 9, 3, 0.5);
    this.thump(size * 0.3, 1.4, 0.7, 2.5); // the slow roll of the whole ship
    this.boom(K.vol * (0.5 + 0.5 * near), near);
  }

  /** A round from your fighter's cannon: a short chug through the airframe, and a shiver in the seat. */
  fighterShot() {
    this.buzz = Math.min(1, this.buzz + FEEL.fighter.kick);
    const o = this.out;
    if (!o) return;
    const ctx = this.sfx.ctx, t = ctx.currentTime, v = FEEL.fighter.vol;
    this.tone(o, t, 'sine', 130, 48, 0.07, v);
    this.tone(o, t, 'triangle', 260, 90, 0.04, v * 0.25);
    this.noise(o, t, 'lowpass', 2200, 500, 0.05, v * 0.4);
  }

  /** A missile kicked off her rail: the ejector's clunk through the airframe and a hard shove in the seat. */
  railOff() {
    this.buzz = Math.min(1, this.buzz + 0.9);
    const o = this.out;
    if (!o) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'sine', 95, 38, 0.22, 0.7);
    this.noise(o, t, 'bandpass', 700, 260, 0.14, 0.45);
    this.ring(o, t + 0.01, [151, 233, 347], 0.5, 0.05);
  }

  /** A rocket motor lighting, heard (a missile's or torpedo's: there is no air, so only close by or through what it
   *  is fixed to, which `v` already accounts for): a hard bang and the motor's roar rising and tearing away. */
  ignite(v, near) {
    const o = this.out;
    if (!o || v < 0.03) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'sine', 70, 30, 0.35, v * 0.8);
    this.noise(o, t, 'lowpass', near ? 4200 : 1600, 300, 0.2, v * 0.5);
    this.noise(o, t + 0.02, 'bandpass', 380, 1400, 1.3, v * 0.35); // the roar, climbing away from you
    if (near) this.buzz = Math.min(1, this.buzz + 0.5);
  }

  /** The camera, this frame. */
  frame(dt, camera, how) {
    this.buzz = Math.max(0, this.buzz - dt * 5);
    let y = 0, x = 0, r = 0, p = 0;
    for (const T of this.thumps) {
      T.t += dt;
      const k = T.size * Math.exp(-T.t * T.decay) * Math.sin(T.t * T.freq * Math.PI * 2 + T.ph);
      y += k;
      x += k * 0.4 * Math.cos(T.ph);
      r += k * T.roll;
      p += k * 0.5;
    }
    this.thumps = this.thumps.filter((T) => T.size * Math.exp(-T.t * T.decay) > 0.01);
    if (!how) return;
    if (how === 'cockpit') {
      if (this.buzz > 0.01) {
        camera.rotateX((Math.random() - 0.5) * this.buzz * 0.006);
        camera.rotateY((Math.random() - 0.5) * this.buzz * 0.004);
      }
      return;
    }
    if (!y && !r) return;
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    _side.set(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(_up, y * FEEL.sway).addScaledVector(_side, x * FEEL.sway);
    camera.rotateZ(r * FEEL.roll);
    camera.rotateX(p * FEEL.roll * 0.5);
  }

  // --- the sounds ----------------------------------------------------------------------------------------------------

  /** A turret's round: the deep thump, the crack (sharper the nearer), the breech, and the hull ringing after it. */
  cannon(v, near) {
    const o = this.out;
    if (!o) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'sine', 62, 26, 0.55, v * 1.1);
    this.noise(o, t, 'lowpass', 600 + 3400 * near, 140, 0.5, v * (0.25 + 0.55 * near));
    this.ring(o, t, [71, 113, 162, 239, 331], 1.6, v * 0.11);
    this.noise(o, t + 0.55, 'bandpass', 900, 500, 0.12, v * 0.12 * near); // the breech closing on the next round
  }

  /** A railgun slug: an electric snap, a crack, a sub-bass punch, and the whole hull ringing long and low. */
  rail(v, near) {
    const o = this.out;
    if (!o) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'square', 2600, 70, 0.14, v * 0.12);
    this.noise(o, t, 'highpass', 2200, 1200, 0.09, v * (0.2 + 0.4 * near));
    this.tone(o, t, 'sine', 48, 19, 0.9, v * 1.3);
    this.noise(o, t, 'lowpass', 1200, 60, 1.1, v * 0.45);
    this.ring(o, t, [39, 61, 94, 129, 183, 257, 344], 3.4, v * 0.12);
    this.groan(o, t + 0.15, 36, 2.6, v * 0.1);
  }

  /** A torpedo pushed out cold: a pneumatic punch, the rush of gas, a clunk. */
  tube(v, near) {
    const o = this.out;
    if (!o) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'sine', 80, 34, 0.4, v * 0.9);
    this.noise(o, t, 'bandpass', 500, 180, 0.7, v * 0.5);
    this.ring(o, t, [88, 141, 207], 0.9, v * 0.06);
    this.noise(o, t + 0.35, 'bandpass', 1100, 400, 0.1, v * 0.25 * (0.4 + near));
  }

  /** A short burst from a point defence gun near you: a saw-toothed growl through the deck. */
  pdc(v) {
    const o = this.out;
    if (!o || v < 0.02) return;
    const ctx = this.sfx.ctx, t = ctx.currentTime;
    const s = ctx.createOscillator();
    s.type = 'sawtooth';
    s.frequency.value = 52;
    const am = ctx.createOscillator();
    am.frequency.value = 26; // the gun's rate
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.35, t + 0.01);
    g.gain.setValueAtTime(v * 0.35, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    am.connect(depth).connect(g.gain);
    s.connect(f).connect(g).connect(o);
    s.start(t);
    am.start(t);
    s.stop(t + 0.26);
    am.stop(t + 0.26);
  }

  /** A warhead in her: a huge low punch, the rumble, the structure groaning and ringing. */
  boom(v, near) {
    const o = this.out;
    if (!o) return;
    const t = this.sfx.ctx.currentTime;
    this.tone(o, t, 'sine', 40, 14, 1.4, v * 1.4);
    this.noise(o, t, 'lowpass', 900 + 1800 * near, 50, 2.4, v * 0.7);
    this.ring(o, t, [33, 52, 77, 109, 151, 214, 297], 4.2, v * 0.1);
    this.groan(o, t + 0.3, 29, 3.5, v * 0.16);
    this.noise(o, t + 0.05, 'highpass', 3000, 1500, 0.25, v * 0.2 * near); // things coming loose
  }

  // --- building blocks -------------------------------------------------------------------------------------------------

  /** A tone sliding from `f0` to `f1` Hz over `dur`, dying away. */
  tone(o, t, type, f0, f1, dur, v) {
    const ctx = this.sfx.ctx, s = ctx.createOscillator(), g = ctx.createGain();
    s.type = type;
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(g).connect(o);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** Noise through a filter of `type` sweeping from `f0` to `f1` Hz over `dur`, dying away. */
  noise(o, t, type, f0, f1, dur, v) {
    const ctx = this.sfx.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.sfx.noise;
    s.loop = true;
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (type === 'bandpass') f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(o);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  }

  /** The hull ringing: a few inharmonic partials, each a little detuned and dying over `dur` (the high ones sooner). */
  ring(o, t, freqs, dur, v) {
    const ctx = this.sfx.ctx;
    freqs.forEach((hz, i) => {
      const s = ctx.createOscillator(), g = ctx.createGain();
      s.frequency.value = hz * (0.97 + Math.random() * 0.06);
      s.detune.setValueAtTime(0, t);
      s.detune.linearRampToValueAtTime(-25, t + dur); // a struck plate sags a little in pitch as it dies
      const d = dur / (1 + i * 0.25);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v / (1 + i * 0.35), t + 0.01 + i * 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(g).connect(o);
      s.start(t);
      s.stop(t + d + 0.02);
    });
  }

  /** The structure groaning: a low buzz, wavering, swelling and dying over `dur`. */
  groan(o, t, hz, dur, v) {
    const ctx = this.sfx.ctx, s = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.type = 'sawtooth';
    s.frequency.value = hz;
    lfo.frequency.value = 3.3;
    depth.gain.value = hz * 0.08;
    lfo.connect(depth).connect(s.frequency);
    f.type = 'lowpass';
    f.frequency.value = 240;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(o);
    s.start(t);
    lfo.start(t);
    s.stop(t + dur + 0.02);
    lfo.stop(t + dur + 0.02);
  }
}
