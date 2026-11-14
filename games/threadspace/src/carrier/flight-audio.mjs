// The fighter's sound, all of it worked out live from her state: no recordings, no oscillator presets. Three
// AudioWorklet processors (dsp.js, from the Fighter Sound Lab) are fed every frame:
//   engine  the main drive: blade-pass partials from a shaft that lags the throttle, a roar that opens with power, the
//           deep "wub", the hull ringing with it. Its `prime` input spins it up unlit: that is the power-up.
//   jets    one voice per jet block (bow, stern, two wings, panned): valve pop, a thump through the frame, cold gas,
//           a tick as the valve shuts. Driven by which nozzles the physics actually opened (flight.mjs).
//   body    the airframe: submarine-deep groans under load, dull chatter, the servos, relays, the cockpit's bed, and
//           the one-off events (ignition sparks, cutoff, cooling ticks, the refuelling pump). No breathing.
// Everything goes through the helmet: a low shelf, a resonant peak near 190 Hz, a short metallic room.
//
// The settings are the lab's final defaults: main drive "Mechanical choir", jets "Cold gas", airframe "Full",
// ambience "Alive", power-up "Spin-up".
//
// It shares the page's AudioContext (sfx.mjs), so the browser's "click first" rule is met by the same click.

const ENGINE = { size: 1, whine: 0.18, harmony: 0.67, grit: 0, hull: 0.74, wub: 0.3 };
const JETS = { tone: 0.62, thump: 0.83, release: 96, pop: 0.51, level: 0.23 };
const AIRFRAME = { creak: 0.8, rattle: 0.5, servo: 0.27 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class FlightAudio {
  /** `sfx` the page's Sfx (its `ctx`, once started, is shared). */
  constructor(sfx) {
    this.sfx = sfx;
    this.ready = false;
    this.loading = null;
    this.active = false; // you are in a fighter: the master is up, the cockpit is alive
    this.timers = [];
    this.pending = false; // a power-up asked for before the worklets were loaded
  }

  /** Loads the worklets once the page's AudioContext is running. Safe to call again. */
  init() {
    if (this.loading) return this.loading;
    const C = this.sfx.ctx;
    if (!C) return Promise.resolve(false);
    this.ctx = C;
    this.loading = (async () => {
      this.out = C.createDynamicsCompressor();
      this.out.threshold.value = -10;
      this.out.ratio.value = 3;
      this.out.attack.value = 0.003;
      this.out.release.value = 0.15;
      this.master = this.gain(0);
      this.out.connect(this.master).connect(C.destination);
      // In the helmet: dry and close, the jets and the frame next to your head, the drive heavy and low.
      this.bus = this.gain(1);
      const helmet = this.gain(1);
      const ls = this.filter('lowshelf', 120, 0.7, 4), pk = this.filter('peaking', 190, 1.6, 2), lp = this.filter('lowpass', 9500, 0.5);
      const room = C.createConvolver();
      room.buffer = this.ir(0.16, 5);
      const wet = this.gain(0.1);
      this.bus.connect(ls).connect(pk).connect(lp).connect(helmet);
      lp.connect(room).connect(wet).connect(helmet);
      helmet.connect(this.out);
      try {
        await C.audioWorklet.addModule(new URL('./dsp.js', import.meta.url));
      } catch (e) {
        console.warn('Fighter sound: the sound engine did not load', e);
        return false;
      }
      const node = (name) => new AudioWorkletNode(C, name, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.engine = node('engine');
      this.jets = node('jets');
      this.body = node('body');
      for (const n of [this.engine, this.jets, this.body]) n.connect(this.bus);
      this.ready = true;
      this.send(this.engine, { ...ENGINE });
      this.send(this.jets, { design: { ...JETS } });
      this.send(this.body, { set: { creak: AIRFRAME.creak, rattle: AIRFRAME.rattle, breath: 0, bed: 0 } });
      this.setActive(this.active, true);
      if (this.pending && this.active) this.powerUp();
      return true;
    })();
    return this.loading;
  }

  gain(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }
  filter(type, f, Q = 1, gain = 0) {
    const b = this.ctx.createBiquadFilter();
    Object.assign(b, { type });
    b.frequency.value = f;
    b.Q.value = Q;
    b.gain.value = gain;
    return b;
  }
  /** A short metallic room: noise decaying as (1 - t)^decay, t from 0 to 1 (never past it). */
  ir(secs, decay) {
    const C = this.ctx, n = Math.floor(C.sampleRate * secs), b = C.createBuffer(2, n, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (1 + 0.6 * Math.sin(i * 0.031 + ch));
    }
    return b;
  }
  send(node, msg) {
    if (this.ready) node.port.postMessage(msg);
  }
  ev(msg) {
    this.send(this.body, msg);
  }
  later(ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  }

  /** In a fighter or not: the sound comes up or goes quiet, and the cockpit's ambience starts or stops. */
  setActive(on, force = false) {
    if (this.active === on && !force) return;
    this.active = on;
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, on ? 0.25 : 0.12);
    this.ambience(on);
    if (!on) {
      for (const t of this.timers) clearTimeout(t);
      this.timers = [];
      this.send(this.engine, { online: 0, prime: 0, power: 0, spool: 0, strain: 0 });
      this.send(this.jets, { v: [0, 1, 2, 3].map(() => ({ open: 0, p: 0, pan: 0 })) });
    }
  }

  /** The power-up, sound only (fighter.mjs keeps the time): the drive's own engine spins up unlit (wum… wum… wum,
   *  faster), and after 3 s it is online and settles to idle. */
  powerUp() {
    if (!this.ready) return void (this.pending = true);
    this.pending = false;
    this.send(this.engine, { online: 0 });
    this.send(this.body, { set: { online: 0 } });
    this.send(this.engine, { prime: 1, primeMs: 1100 });
    this.later(3000, () => {
      this.send(this.engine, { online: 1, prime: 0, primeMs: 1300 });
      this.send(this.body, { set: { online: 1 } });
    });
  }

  /** Shut down (climbing out). */
  powerDown() {
    this.send(this.engine, { online: 0, prime: 0 });
    this.send(this.body, { set: { online: 0 } });
    this.ev({ hit: 'relay', amp: 0.6 });
  }

  /** The drive lights: igniters, the valves slam open, the frame takes the push. */
  ignite() {
    if (!this.ready || !this.active) return;
    for (let i = 0; i < 4; i++) this.later(i * 35, () => this.ev({ hit: 'spark', amp: 0.7 + Math.random() * 0.4 }));
    this.later(150, () => (this.ev({ hit: 'valve', amp: 0.8 }), this.ev({ hit: 'hull', amp: 0.7 })));
  }

  /** The drive cuts: the valves shut, a relay, then the metal ticks as it cools (more after a long burn). */
  cutoff(secs) {
    if (!this.ready || !this.active) return;
    this.ev({ hit: 'valve', amp: 0.9 });
    this.ev({ hit: 'hull', amp: 0.35 });
    this.later(60, () => this.ev({ hit: 'relay', amp: 0.5 }));
    const n = Math.min(14, Math.round(secs * 2));
    for (let i = 0; i < n; i++) this.later(900 + Math.random() * (2500 + secs * 600), () => this.ev({ hit: 'casing', amp: 0.06 + Math.random() * 0.12 }));
  }

  /** The tanks topped up on the pad: a relay, the pump, two beeps. */
  refill() {
    if (!this.ready || !this.active) return;
    this.ev({ hit: 'relay', amp: 0.8 });
    this.later(120, () => this.ev({ pump: 1.4, amp: 0.8 }));
    this.later(1600, () => (this.ev({ beep: 1760, len: 0.05, amp: 0.6 }), this.ev({ beep: 2349, len: 0.05, amp: 0.5 })));
  }

  /** "Alive": never quite silent. A deep bed, and every few seconds the structure settling, a far wub, a chirp. */
  ambience(on) {
    clearTimeout(this.ambT);
    this.send(this.body, { set: { bed: on ? 1 : 0 } });
    if (!on) return;
    const R = Math.random;
    const next = () => {
      this.ambT = setTimeout(() => {
        const r = R();
        if (r < 0.3) this.ev({ groan: 0.25 + R() * 0.6, len: 0.8 + R() * 2, rate: 22 + R() * 40 });
        else if (r < 0.45) this.ev({ hit: 'settle', amp: 0.2 + R() * 0.5 });
        else if (r < 0.58) this.ev({ wub: 2 + R() * 3, f: 38 + R() * 18, r0: 0.8 + R(), r1: 1.5 + R() * 3, amp: 0.35 + R() * 0.4 });
        else if (r < 0.7) this.ev({ rumble: 2 + R() * 4, amp: 0.4 + R() * 0.6 });
        else if (r < 0.82) {
          const f = [1760, 2093, 1568][Math.floor(R() * 3)];
          this.ev({ beep: f, len: 0.04, amp: 0.45 });
          setTimeout(() => this.ev({ beep: f * 1.25, len: 0.04, amp: 0.4 }), 90);
        } else if (r < 0.9) this.ev({ hum: 1.5 + R() * 2, amp: 0.6, f: R() < 0.5 ? 100 : 150 });
        else this.ev({ hit: R() < 0.5 ? 'relay' : 'switch', amp: 0.35 });
        next();
      }, 1200 + R() * 2800);
    };
    next();
  }

  /** Every frame, from the fighter's `Flight`: the drive, the four jet blocks, the body. */
  frame(fl) {
    if (!this.ready || !this.active) return;
    this.send(this.engine, { power: fl.power, spool: fl.spool, strain: fl.strain });
    this.send(this.jets, { v: fl.blockState });
    this.send(this.body, { set: { load: fl.load, vib: fl.vib, servo: clamp(fl.servo * AIRFRAME.servo, 0, 1), beam: 0 } });
  }
}
