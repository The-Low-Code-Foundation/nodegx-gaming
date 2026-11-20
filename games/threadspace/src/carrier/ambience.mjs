// The ship's own sound, under everything else: the air handlers' hiss, the electrical hum, the rumble of the reactor
// and the drive coming up through the frames, and now and then the hull ticking and creaking as she works. All
// synthesised (no files), on the page's AudioContext (sfx.mjs).
//
// How much of each you hear is the room's: `PROFILE` per kind of room (sets.mjs `lookKey`), louder in engineering and
// the hangar, quietest in the quarters. The drive burning brings the rumble up; on emergency power the hum and the air
// stop; and it all goes with the air: in a room pumped down to vacuum you hear nothing of the ship but what comes
// through your boots.

import { lookKey } from './sets.mjs';

/** Levels per kind of room: air (ventilation), hum (electrics), rumble (machinery through the structure). */
const PROFILE = {
  corridor: { air: 0.5, hum: 0.25, rumble: 0.35 },
  quarters: { air: 0.32, hum: 0.1, rumble: 0.25 },
  command: { air: 0.3, hum: 0.4, rumble: 0.2 },
  mess: { air: 0.55, hum: 0.2, rumble: 0.3 },
  galley: { air: 0.7, hum: 0.35, rumble: 0.3 },
  medical: { air: 0.4, hum: 0.35, rumble: 0.2 },
  work: { air: 0.5, hum: 0.5, rumble: 0.6 },
  welfare: { air: 0.45, hum: 0.2, rumble: 0.3 },
  hangar: { air: 0.25, hum: 0.2, rumble: 0.75 }
};
const ROOMS = { 'eng-control': { air: 0.45, hum: 0.6, rumble: 1 }, 'eng-passage': { air: 0.5, hum: 0.5, rumble: 0.9 } };
/** The whole bed's loudness, before sfx.mjs's own master. Room tone should be felt more than heard. */
const LEVEL = 0.22;

export class Ambience {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = false;
    this.next = 6; // seconds to the first creak
  }

  /** Builds the bed once the page's AudioContext is running (after the first click). */
  start() {
    const C = this.sfx.ctx;
    if (this.on || !C || !this.sfx.out) return;
    this.on = true;
    this.C = C;
    this.out = C.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.sfx.out);
    // Air: noise, banded where an air handler's hiss sits.
    const noise = () => {
      const s = C.createBufferSource();
      s.buffer = this.sfx.noise;
      s.loop = true;
      s.start(0, Math.random());
      return s;
    };
    const filt = (type, f, q = 0.7) => {
      const b = C.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    this.air = C.createGain();
    noise().connect(filt('bandpass', 700, 0.4)).connect(filt('lowpass', 2600)).connect(this.air).connect(this.out);
    // Rumble: noise down where you feel it, slowly swelling.
    this.rumble = C.createGain();
    noise().connect(filt('lowpass', 90, 0.9)).connect(filt('lowpass', 140)).connect(this.rumble).connect(this.out);
    const swell = C.createOscillator();
    swell.frequency.value = 0.07;
    const swellK = C.createGain();
    swellK.gain.value = 0.1;
    swell.connect(swellK).connect(this.rumble.gain);
    swell.start();
    // Hum: the mains and its harmonics, beating a little.
    this.hum = C.createGain();
    const humLp = filt('lowpass', 900);
    humLp.connect(this.hum).connect(this.out);
    for (const [f, a] of [[60, 0.5], [120, 0.3], [180.4, 0.12], [240.3, 0.06]]) {
      const o = C.createOscillator();
      o.frequency.value = f;
      const g = C.createGain();
      g.gain.value = a;
      o.connect(g).connect(humLp);
      o.start();
    }
    for (const g of [this.air, this.rumble, this.hum]) g.gain.value = 0;
  }

  /** Each frame. `room` is a compartment (or null), `air` its pressure (0 to 1 of normal), `power` the lighting bus,
   *  `drive` the main drive's throttle (0 to 1), `inside` whether you are aboard at all (not in a fighter). */
  frame(dt, { room, air = 1, power = true, drive = 0, inside = true }) {
    if (!this.on) return;
    const C = this.C, t = C.currentTime;
    const p = (room && (ROOMS[room.id] ?? PROFILE[lookKey(room)])) ?? PROFILE.corridor;
    const k = inside ? Math.max(0, Math.min(1, air)) ** 1.5 : 0;
    const set = (g, v) => g.gain.setTargetAtTime(v, t, 0.6);
    set(this.out, LEVEL * (inside ? 1 : 0));
    set(this.air, p.air * 0.09 * k * (power ? 1 : 0));
    set(this.hum, p.hum * 0.05 * k * (power ? 1 : 0.15));
    // The rumble comes through the deck, so a little of it is left even in vacuum.
    set(this.rumble, p.rumble * (0.9 + drive * 1.6) * (0.25 + 0.75 * k) * (inside ? 1 : 0));
    if (inside && (this.next -= dt) <= 0) {
      this.next = 7 + Math.random() * 18;
      this.creak(p.rumble * (0.3 + 0.7 * k));
    }
  }

  /** The hull working: a low groan that bends in pitch, or a single tick of metal. */
  creak(level) {
    const C = this.C, t = C.currentTime;
    const g = C.createGain();
    g.connect(this.out);
    if (Math.random() < 0.55) {
      const o = C.createOscillator();
      o.type = 'sawtooth';
      const f = 40 + Math.random() * 50;
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + 1.4);
      const lp = C.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.Q.value = 6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05 * level, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(lp).connect(g);
      o.start(t);
      o.stop(t + 1.7);
    } else {
      const s = C.createBufferSource();
      s.buffer = this.sfx.noise;
      const bp = C.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 1800;
      bp.Q.value = 12;
      g.gain.setValueAtTime(0.18 * level, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      s.connect(bp).connect(g);
      s.start(t, Math.random() * 0.5, 0.3);
    }
  }
}

