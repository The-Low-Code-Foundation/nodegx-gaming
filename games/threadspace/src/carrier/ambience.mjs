// The ship's own sound, under everything else: what you would really hear inside her. The machinery's low hum (the
// pumps, the fans, the reactor's plant, louder and a little higher while the main drive burns), the rumble coming up
// through the frames, the electrics' hum and a transformer's buzz, the crew talking somewhere beyond the bulkheads,
// the consoles' soft chirps that say all is well (and harder, lower tones when it is not), the ventilation as a soft
// breath rather than a hiss, and now and then the hull ticking and creaking as she works. Synthesised on the page's
// AudioContext (sfx.mjs), except the voices: the crew's murmur is their own recorded lines (assets/voice/), cut into
// fragments and played through a low-pass and a short reverb, so it is people talking two compartments away, never
// words you can follow.
//
// How much of each you hear is the room's: `PROFILE` per kind of room (sets.mjs `lookKey`; `ROOMS` overrides by id),
// louder machinery in engineering, more voices in the mess and the bridge, more consoles where people work them. It
// all goes with the air: in a room pumped down to vacuum you hear nothing of the ship but what comes through your
// boots, and with the helmet closed no voices. On emergency power the electrics and the ventilation stop. The consoles
// turn urgent (`alert`) at general quarters, on emergency power, in thin air, or when a vital system is badly hurt.
//
// The main drive's turbopumps spooling up and down (spool.mjs, from drive.mjs `spool()`) are heard here too: through
// the structure, so a little even in vacuum, fainter on a big ship.
//
// With your helmet closed (the airless hangar, condition one) the room tone is your suit: its fans, your own breathing
// in the helmet, and your boots through the deck as you walk (`suit`).
//
// Out in the deep (deep.mjs sets `deep`, 0 to 1) the crew's murmur drops away: people go quiet out there. The deep and
// the ship's own life (aboard.mjs) play a few sounds through here too: grit striking the hull (`ping`), the plating
// ticking as the sun's heat moves over it (`tick`), the frames groaning as the drive takes up the load (`groan`), and
// flight control's voice coming through static at long range (`radioStatic`).

import { lookKey } from './sets.mjs';
import { Spool, SPOOL, SHIP_BURN, loadDsp } from './spool.mjs';

/** Levels per kind of room: air (ventilation), hum (electrics), rumble (through the structure), mach (the machinery's
 *  hum), crew (voices beyond the bulkheads), beeps (consoles). */
const PROFILE = {
  corridor: { air: 0.35, hum: 0.25, rumble: 0.35, mach: 0.3, crew: 0.35, beeps: 0.25 },
  ring: { air: 0.35, hum: 0.25, rumble: 0.35, mach: 0.25, crew: 0.55, beeps: 0.2 },
  quarters: { air: 0.25, hum: 0.1, rumble: 0.25, mach: 0.2, crew: 0.15, beeps: 0.1 },
  command: { air: 0.25, hum: 0.45, rumble: 0.2, mach: 0.2, crew: 0.8, beeps: 1 },
  mess: { air: 0.35, hum: 0.2, rumble: 0.3, mach: 0.25, crew: 1, beeps: 0.2 },
  galley: { air: 0.45, hum: 0.35, rumble: 0.3, mach: 0.3, crew: 0.7, beeps: 0.3 },
  medical: { air: 0.3, hum: 0.35, rumble: 0.2, mach: 0.2, crew: 0.4, beeps: 0.8 },
  work: { air: 0.35, hum: 0.55, rumble: 0.6, mach: 0.7, crew: 0.45, beeps: 0.6 },
  welfare: { air: 0.3, hum: 0.2, rumble: 0.3, mach: 0.25, crew: 0.7, beeps: 0.15 },
  hangar: { air: 0.15, hum: 0.2, rumble: 0.75, mach: 0.6, crew: 0.3, beeps: 0.2 }
};
const ROOMS = {
  'eng-control': { air: 0.3, hum: 0.65, rumble: 1, mach: 1, crew: 0.5, beeps: 0.8 },
  'eng-passage': { air: 0.35, hum: 0.5, rumble: 0.9, mach: 0.9, crew: 0.3, beeps: 0.3 },
  'eng-room': { air: 0.3, hum: 0.6, rumble: 1, mach: 1, crew: 0.35, beeps: 0.7 } // the cutter's, against her drive
};
/** The whole bed's loudness, before sfx.mjs's own master. Room tone should be felt more than heard. */
const LEVEL = 0.22;
/** Each layer's loudness within the bed (times the room's `PROFILE` level). */
const MIX = { air: 0.025, hum: 0.05, buzz: 0.012, mach: 0.035, machDrive: 0.05, chatter: 0.9, beep: 0.12, alert: 0.16 };
/** The crew's murmur: the low-pass that makes words into voices (Hz), and the gaps between fragments (s, at a room's
 *  `crew` of 1; quieter rooms wait longer), and the chance one is answered at once. */
const CHATTER = { lowpass: 420, gap: [2.5, 8], reply: 0.45, len: [1.4, 4], cache: 30 };
/** Speakers never used for the murmur: the ship's voices, the radio, and the officers on the broadcast. */
const CHATTER_SKIP = new Set(['ai', 'ship', 'flight', 'captain', 'engineer']);
/** Lines left out: anything that is an order to you or an alarm, even as a fragment. */
const CHATTER_OUT = /^(you |apprentice)|adrift|on report|battle station|casualty|carry on|your orders/i;
/** The consoles: seconds between chirps at a room's `beeps` of 1, normally and when something is wrong. */
const BEEPS = { gap: [4, 14], alertGap: [2, 5] };
/** A ship heavier than this (kg) is big: her drive is far from most of her rooms, and heard fainter. */
const BIG = 5e6;

const VOICE = new URL('../../assets/voice/', import.meta.url);
const R = Math.random;
const between = ([a, b]) => a + R() * (b - a);

export class Ambience {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = false;
    this.next = 6; // seconds to the first creak
    this.chatT = 4; // to the first voices
    this.beepT = 3; // to the first chirp
    this.alertT = 0; // to the next look at whether something is wrong
    this.alert = false;
    this.pool = []; // the crew's clips: { file, secs }
    this.buffers = new Map(); // file → decoded AudioBuffer
    this.loading = false;
    this.levels = {};
    this.deep = 0;
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
    const osc = (f, type = 'sine') => {
      const o = C.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.start();
      return o;
    };
    const gain = (v = 0) => {
      const g = C.createGain();
      g.gain.value = v;
      return g;
    };
    // Air: the ventilation as a soft breath, low down (it was a hiss): noise under 600 Hz.
    this.air = gain();
    noise().connect(filt('lowpass', 600, 0.5)).connect(filt('highpass', 90)).connect(this.air).connect(this.out);
    // Rumble: noise down where you feel it, slowly swelling.
    this.rumble = gain();
    noise().connect(filt('lowpass', 90, 0.9)).connect(filt('lowpass', 140)).connect(this.rumble).connect(this.out);
    const swell = osc(0.07);
    swell.connect(gain(0.1)).connect(this.rumble.gain);
    // The machinery: the plant's pumps and fans as a low chord, two of them a little apart so it beats; a slow sway.
    this.mach = gain();
    this.machLp = filt('lowpass', 320, 0.8);
    this.machLp.connect(this.mach).connect(this.out);
    this.machOsc = [[43.6, 0.5, 'triangle'], [44.05, 0.35, 'sine'], [87.3, 0.28, 'triangle'], [131.2, 0.12, 'sine'], [174.5, 0.05, 'sine']].map(([f, a, type]) => {
      const o = osc(f, type);
      o.connect(gain(a)).connect(this.machLp);
      return { o, f };
    });
    const sway = osc(0.11);
    sway.connect(gain(0.15)).connect(this.mach.gain);
    // Hum: the mains and its harmonics, beating a little.
    this.hum = gain();
    const humLp = filt('lowpass', 900);
    humLp.connect(this.hum).connect(this.out);
    for (const [f, a] of [[60, 0.5], [120, 0.3], [180.4, 0.12], [240.3, 0.06]]) osc(f).connect(gain(a)).connect(humLp);
    // A transformer's buzz: the mains' second harmonic, rich and edgy, banded high and quiet, wandering in loudness.
    this.buzz = gain();
    osc(120, 'sawtooth').connect(filt('bandpass', 1650, 2.2)).connect(filt('lowpass', 3200)).connect(this.buzz).connect(this.out);
    this.buzzK = 1;
    // The crew's murmur: their clips through a low-pass (the words gone, the voices left) and a short room.
    this.chatIn = gain(1);
    const chatHp = filt('highpass', 140);
    this.chatIn.connect(filt('lowpass', CHATTER.lowpass, 0.7)).connect(filt('lowpass', 900)).connect(chatHp);
    this.chat = gain();
    chatHp.connect(gain(0.55)).connect(this.chat);
    const room = C.createConvolver();
    room.buffer = this.ir(1.4, 3);
    chatHp.connect(room).connect(gain(0.6)).connect(this.chat);
    this.chat.connect(this.out);
    // The consoles: their chirps go straight into the bed.
    this.beeps = gain(1);
    this.beeps.connect(filt('lowpass', 4200)).connect(this.out);
    // The main drive's turbopumps (spool.mjs), heard through the structure.
    this.spool = new Spool(C, this.sfx.out, this.sfx.noise, SPOOL.ship);
    // The main drive burning: the fighter's engine voice (dsp.js), bigger and deeper (spool.mjs `SHIP_BURN`), fed from
    // the pumps' spin and the drive's push each frame. Not part of the quiet bed: it goes straight out, past `LEVEL`.
    this.burn = C.createGain();
    this.burn.gain.value = 0;
    this.burn.connect(this.sfx.out);
    loadDsp(C).then((ok) => {
      if (!ok) return;
      this.burnNode = new AudioWorkletNode(C, 'engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const { gain, ...set } = SHIP_BURN;
      this.burnNode.port.postMessage({ ...set, online: 1, power: 0, spool: 0, strain: 0 });
      this.burnNode.connect(filt('lowpass', 2400)).connect(this.burn);
    });
    // The suit: its fans (a steady low whirr) and your breathing (noise shaped like breath, in and out, each frame).
    this.fans = gain();
    noise().connect(filt('bandpass', 260, 1.4)).connect(filt('lowpass', 700)).connect(this.fans).connect(this.out);
    osc(118).connect(gain(0.15)).connect(this.fans);
    this.breath = gain();
    this.breathF = filt('bandpass', 1100, 0.9);
    noise().connect(this.breathF).connect(filt('highpass', 300)).connect(this.breath).connect(this.out);
    this.cycle = Math.random() * 4;
    this.stride = 0;
    this.loadVoices();
  }

  /** The crew's clips the murmur can use (people's lines, none of the ship's voices; not an order to you). */
  loadVoices() {
    fetch(new URL('index.json', VOICE))
      .then((r) => (r.ok ? r.json() : { lines: {} }))
      .then((j) => {
        for (const [key, e] of Object.entries(j.lines ?? {})) {
          const bar = key.indexOf('|'), who = key.slice(0, bar), text = key.slice(bar + 1);
          if (CHATTER_SKIP.has(who) || CHATTER_OUT.test(text) || !(e.secs > 1.5)) continue;
          this.pool.push({ file: new URL(e.file, VOICE).href, secs: e.secs });
        }
      })
      .catch(() => {});
  }

  /** A short room for the voices: noise decaying as (1 - t)^decay. */
  ir(secs, decay) {
    const C = this.C, n = Math.floor(C.sampleRate * secs), b = C.createBuffer(2, n, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * 0.5;
    }
    return b;
  }

  /** Each frame. `room` is a compartment (or null), `air` its pressure (0 to 1 of normal), `power` the lighting bus,
   *  `drive` the main drive's push (0 to 1), `inside` whether you are aboard at all (not in a fighter), `suit` your
   *  helmet closed, `moved` metres walked this frame, `engine` drive.mjs's `Drive` (its turbopumps, and how hard it
   *  burns), `ship` integrity.mjs (general quarters and the systems, for the consoles' tone). */
  frame(dt, { room, air = 1, power = true, drive = 0, inside = true, suit = false, moved = 0, engine = null, ship = null }) {
    if (!this.on) return;
    const C = this.C, t = C.currentTime;
    this.suitFrame(dt, suit && inside, moved);
    const p = (room && (ROOMS[room.id] ?? PROFILE[lookKey(room)])) ?? PROFILE.corridor;
    const k = inside ? Math.max(0, Math.min(1, air)) ** 1.5 : 0;
    const on = power ? 1 : 0;
    const burn = engine ? (engine.push > 0.05 ? 0.4 + 0.6 * engine.frac : 0) : drive;
    const set = (g, v, tau = 0.6) => g.gain.setTargetAtTime(v, t, tau);
    set(this.out, LEVEL * (inside ? 1 : 0));
    set(this.air, p.air * MIX.air * k * on);
    set(this.hum, p.hum * MIX.hum * k * (power ? 1 : 0.15));
    if (R() < dt * 0.6) this.buzzK = 0.4 + R() * 0.9; // the buzz comes and goes as loads switch
    set(this.buzz, p.hum * MIX.buzz * this.buzzK * k * on, 1.2);
    // The machinery and the rumble come through the deck, so a little of them is left even in vacuum.
    const deck = (0.25 + 0.75 * k) * (inside ? 1 : 0);
    set(this.mach, p.mach * (MIX.mach * (power ? 1 : 0.4) + MIX.machDrive * burn) * deck);
    for (const m of this.machOsc) m.o.frequency.setTargetAtTime(m.f * (1 + 0.06 * burn), t, 1.5);
    set(this.rumble, p.rumble * (0.9 + drive * 1.6) * deck);
    // The turbopumps: as loud as the room is near the machinery, fainter on a big ship, less without air.
    if (engine) {
      const sp = engine.spool();
      const big = (engine.body?.mass ?? 0) > BIG ? 0.55 : 1;
      this.spool.frame(dt, sp.target, (0.35 + 0.65 * p.rumble) * (0.4 + 0.6 * k) * big * (inside ? 1 : 0), sp.lit);
      // The burn itself: the engine's roar opening with the push, its turbine at the pumps' spin; heard everywhere
      // aboard (louder toward the machinery), a little even in vacuum through the deck.
      if (this.burnNode) {
        const s = this.spool.spin, pw = sp.lit ? 0.45 + 0.55 * engine.frac : 0;
        this.burnNode.port.postMessage({ power: pw, spool: s, strain: sp.lit ? 0.15 * engine.frac : 0 });
        const near = (0.6 + 0.4 * p.rumble) * (0.35 + 0.65 * k) * big * (inside ? 1 : 0);
        set(this.burn, SHIP_BURN.gain * near * Math.min(1, s * 2.5), 0.15);
      }
    } else if (this.burnNode) set(this.burn, 0, 0.3);
    // Something wrong, for the consoles' tone: looked at twice a second.
    if ((this.alertT -= dt) <= 0) {
      this.alertT = 0.5;
      const sys = ship?.sys ? Math.min(...['reactor', 'power', 'drive', 'life-support'].map((s) => ship.sys(s))) : 1;
      this.alert = !!ship && (!!ship.stations || !ship.power || sys < 0.6) || air < 0.8;
    }
    // The crew talking, beyond the bulkheads: none without air or with your helmet closed.
    const talk = inside && !suit ? p.crew * k * (1 - 0.7 * this.deep) : 0;
    set(this.chat, talk * MIX.chatter, 0.4);
    if (talk > 0.03 && (this.chatT -= dt) <= 0) this.chatter(p.crew);
    // The consoles: soft chirps, or harder lower tones when something is wrong.
    const bk = inside ? p.beeps * k * (suit ? 0.3 : 1) : 0;
    if (bk > 0.02 && (this.beepT -= dt) <= 0) {
      this.beepT = between(this.alert ? BEEPS.alertGap : BEEPS.gap) / (this.alert ? 1 : 0.3 + p.beeps);
      this.alert ? this.warn(bk) : this.chirp(bk);
    }
    if (inside && (this.next -= dt) <= 0) {
      this.next = 7 + Math.random() * 18;
      this.creak(p.rumble * (0.3 + 0.7 * k));
    }
    this.levels = { room: room?.id ?? null, k: +k.toFixed(2), talk: +talk.toFixed(2), beeps: +bk.toFixed(2), alert: this.alert, burn: +burn.toFixed(2) };
  }

  /** A fragment of someone talking, somewhere: a clip from the pool, from a point in it, for a second or four, a little
   *  faster or slower than it was said (so the same few voices are many), off to one side. Often answered. */
  chatter(crew) {
    this.chatT = between(CHATTER.gap) / (0.3 + crew);
    const c = this.pool[Math.floor(R() * this.pool.length)];
    if (!c) return;
    let buf = this.buffers.get(c.file);
    if (!buf) {
      // Not decoded yet: fetch it for later, and talk with one that is (the first few seconds are quiet).
      this.fetchClip(c.file);
      const have = [...this.buffers.values()];
      buf = have[Math.floor(R() * have.length)];
      if (!buf) return;
    }
    const C = this.C, t = C.currentTime, len = between(CHATTER.len), rate = 0.9 + R() * 0.16;
    const from = Math.max(0, R() * (buf.duration - len * rate));
    const s = C.createBufferSource(), g = C.createGain(), pan = C.createStereoPanner();
    s.buffer = buf;
    s.playbackRate.value = rate;
    pan.pan.value = R() * 1.6 - 0.8;
    const v = 0.45 + R() * 0.55;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.2);
    g.gain.setValueAtTime(v, t + len - 0.3);
    g.gain.linearRampToValueAtTime(0, t + len);
    s.connect(g).connect(pan).connect(this.chatIn);
    s.start(t, from, len * rate + 0.05);
    if (R() < CHATTER.reply) this.chatT = len + 0.3 + R() * 0.9; // someone answers
  }

  /** Decodes one clip into the cache (one at a time; the oldest goes past `CHATTER.cache`). */
  fetchClip(file) {
    if (this.loading) return;
    this.loading = true;
    if (!this.buffers.size) this.chatT = 0.5;
    fetch(file)
      .then((r) => r.arrayBuffer())
      .then((b) => this.C.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(file, buf);
        if (this.buffers.size > CHATTER.cache) this.buffers.delete(this.buffers.keys().next().value);
      })
      .catch(() => {})
      .finally(() => (this.loading = false));
  }

  /** A console saying all is well: a soft chirp, a blip, or a little trill, high and quiet. */
  chirp(level) {
    const f = [1318.5, 1568, 1760, 2093][Math.floor(R() * 4)], r = R(), v = MIX.beep * level;
    const notes = r < 0.4 ? [[f, 0], [f * 1.335, 0.07]] : r < 0.7 ? [[f, 0]] : [[f, 0], [f * 1.125, 0.05], [f * 1.26, 0.1]];
    const pan = R() * 1.4 - 0.7;
    for (const [hz, at] of notes) this.tone(hz, at, 0.04, v, 'sine', pan);
  }

  /** A console saying something is wrong: lower, harder tones, falling, twice; or three quick pulses. */
  warn(level) {
    const v = MIX.alert * level, pan = R() * 1.2 - 0.6;
    if (R() < 0.6) for (const at of [0, 0.38]) this.tone(784, at, 0.11, v, 'square', pan), this.tone(587, at + 0.15, 0.11, v, 'square', pan);
    else for (const at of [0, 0.12, 0.24]) this.tone(1046.5, at, 0.06, v * 0.8, 'square', pan);
  }

  tone(hz, at, len, v, type, pan) {
    const C = this.C, t = C.currentTime + at, o = C.createOscillator(), g = C.createGain(), p = C.createStereoPanner();
    o.type = type;
    o.frequency.value = hz;
    p.pan.value = pan;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.setValueAtTime(v, t + len - 0.015);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g).connect(p).connect(this.beeps);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  /** Your suit, while the helmet is closed (`on`): the fans; a breath every 4 s or so, in through the nose and out
   *  longer (faster when you hurry); and a boot through the deck every 0.75 m you walk (`moved`, metres this frame). */
  suitFrame(dt, on, moved) {
    const t = this.C.currentTime;
    this.fans.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.4);
    if (!on) {
      this.breath.gain.setTargetAtTime(0, t, 0.2);
      return;
    }
    const pace = moved / Math.max(dt, 1e-3) > 2.5 ? 1.6 : 1; // running: quicker breaths
    this.cycle = (this.cycle + dt * pace) % 4.2;
    const c = this.cycle, inhale = c < 1.4, exhale = c >= 1.6 && c < 3.6;
    const level = inhale ? Math.sin((c / 1.4) * Math.PI) * 0.05 : exhale ? Math.sin(((c - 1.6) / 2) * Math.PI) * 0.07 : 0;
    this.breath.gain.setTargetAtTime(level, t, 0.08);
    this.breathF.frequency.setTargetAtTime(inhale ? 1500 : 900, t, 0.2);
    if ((this.stride += moved) > 0.75) {
      this.stride = 0;
      this.boot();
    }
  }

  /** One boot on the deck, heard through the suit: a dull thud. */
  boot() {
    const C = this.C, t = C.currentTime, g = C.createGain(), o = C.createOscillator();
    o.frequency.setValueAtTime(95 + Math.random() * 20, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** The hull working: a low groan that bends in pitch, or a single tick of metal. */
  creak(level) {
    if (Math.random() < 0.55) this.groan(level);
    else this.tick(level);
  }

  /** The frames taking up a load: a low groan that bends in pitch, about a second and a half. */
  groan(level, { f = 40 + Math.random() * 50, len = 1.4 } = {}) {
    if (!this.on) return;
    const C = this.C, t = C.currentTime, g = C.createGain();
    g.connect(this.out);
    const o = C.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * (0.7 + Math.random() * 0.6), t + len);
    const lp = C.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05 * level, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.2);
    o.connect(lp).connect(g);
    o.start(t);
    o.stop(t + len + 0.3);
  }

  /** One tick of metal: the plating moving a hair as it heats or cools. `hz`: how high (smaller plates ring higher). */
  tick(level, { hz = 1400 + Math.random() * 1800, at = 0 } = {}) {
    if (!this.on) return;
    const C = this.C, t = C.currentTime + at, g = C.createGain();
    const s = C.createBufferSource();
    s.buffer = this.sfx.noise;
    const bp = C.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = hz;
    bp.Q.value = 12;
    const p = C.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    g.gain.setValueAtTime(0, C.currentTime);
    g.gain.setValueAtTime(0.18 * level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    s.connect(bp).connect(g).connect(p).connect(this.out);
    s.start(t, Math.random() * 0.5, 0.3);
  }

  /** A grain of grit striking the hull at orbital speed: a hard, bright crack through the whole structure, ringing
   *  for a moment, from one side. Loud for what it is: it is the only thing out here that touches her. */
  ping() {
    if (!this.on) return;
    const C = this.C, t = C.currentTime, pan = C.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.sfx.out);
    // The crack: a click of noise, wide open.
    const s = C.createBufferSource(), gs = C.createGain(), hp = C.createBiquadFilter();
    s.buffer = this.sfx.noise;
    hp.type = 'highpass';
    hp.frequency.value = 900;
    gs.gain.setValueAtTime(0.5, t);
    gs.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(hp).connect(gs).connect(pan);
    s.start(t, Math.random(), 0.08);
    // The ring of the plate: two inharmonic partials dying away.
    for (const [hz, v, len] of [[2350 + Math.random() * 400, 0.09, 0.9], [3710 + Math.random() * 500, 0.05, 0.6], [910 + Math.random() * 120, 0.06, 1.4]]) {
      const o = C.createOscillator(), g = C.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }

  /** A voice from home at long range: a squelch as the carrier keys up, `secs` of hiss and crackle under the words,
   *  and a squelch as it drops. `k`: how far out, 0 to 1 (louder static, more crackle). */
  radioStatic(secs, k) {
    if (!this.on) return;
    const C = this.C, t = C.currentTime, v = 0.025 + 0.09 * k;
    const s = C.createBufferSource(), bp = C.createBiquadFilter(), g = C.createGain();
    s.buffer = this.sfx.noise;
    s.loop = true;
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.5;
    s.connect(bp).connect(g).connect(this.sfx.out);
    g.gain.setValueAtTime(0, t);
    // The squelch opening: a burst, then the hiss under the voice, crackling: the deeper, the more it drops out.
    g.gain.linearRampToValueAtTime(v * 3, t + 0.01);
    g.gain.setValueAtTime(v, t + 0.14);
    for (let a = 0.2; a < secs; a += 0.04 + Math.random() * 0.08) g.gain.setValueAtTime(Math.random() < 0.15 + 0.35 * k ? v * (1.5 + Math.random() * 2) : v * (0.6 + Math.random() * 0.5), t + a);
    g.gain.setValueAtTime(v * 3, t + secs);
    g.gain.linearRampToValueAtTime(0, t + secs + 0.16);
    s.start(t, Math.random());
    s.stop(t + secs + 0.2);
  }

  /** What is playing, for tests and the console: each layer's gain, the room's levels, the turbopumps. */
  info() {
    if (!this.on) return { on: false };
    const g = (n) => +n.gain.value.toFixed(4);
    return { ...this.levels, out: g(this.out), air: g(this.air), hum: g(this.hum), buzz: g(this.buzz), mach: g(this.mach), rumble: g(this.rumble), chat: g(this.chat), pool: this.pool.length, cached: this.buffers.size, spool: this.spool.info() };
  }
}
