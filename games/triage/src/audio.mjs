// Sounds: recorded samples (tools/fetch-sfx.mjs puts them in assets/sfx/, all CC0) played through WebAudio with
// distance, stereo pan from the camera, a small hospital-corridor reverb and a master compressor. Any sound whose
// samples are missing (the fetch script not run, or still loading) falls back to the old synthesised version, so the
// game works without downloading anything. play(name, pos) ignores names it does not know.

// Round 4 (playtest: "Firing a gun is really loud, it blows your eardrums out, it's not just some little 'pew pew'
// thing, and this cop is doing it in a closed area, even louder"): a shot is played on its own bus, saturated, with a
// crack and a sub-bass boom under the recording and a hard room's slap after it; and it deafens her. Everything else
// (the infected, her steps, the room, the shot's own tail) goes through her ears: a low-pass that drops to a few hundred
// hertz on the bang and opens again over seconds, a duck, and a ringing that builds with every shot in a burst and
// fades slowly. `world.ears` (0..1) is how deafened she is (player.mjs raises it; the drive can read it muted).
// Fear (fear.mjs): the heartbeat's rate and level, her breath; and the building's own sounds, all the time.

// name -> how it plays. gain: base level; range: metres to silence (default 26); wet: reverb send; self: always at
// the player (no distance or pan); gap: least seconds between two plays of this name; voices: most at once;
// chime: also play the synthesised version, softly, as a game cue; rate: random playbackRate spread (default ±6%).
const SFX = {
  shot: { gain: 1.25, range: 70, wet: 0.9, loud: true, rate: 0.04 },
  smg: { gain: 1.05, range: 70, wet: 0.8, loud: true, rate: 0.04 },
  rifle: { gain: 1.3, range: 80, wet: 0.95, loud: true, rate: 0.04 },
  shotgun: { gain: 1.4, range: 80, wet: 1.0, loud: true, rate: 0.04 },
  crack: { gain: 1.0, self: true, wet: 0.5, loud: true },
  boom: { gain: 1.0, self: true, wet: 0.35, loud: true },
  rack: { gain: 0.45, self: true, wet: 0.12 },
  reload: { gain: 0.45, self: true, wet: 0.1 },
  empty: { gain: 0.5, self: true, wet: 0.08 },
  impact: { gain: 0.5, range: 30, wet: 0.3, ricochet: 0.18 },
  flesh: { gain: 0.65, wet: 0.15 },
  headshot: { gain: 0.8, wet: 0.2 },
  swing: { gain: 0.3, self: true, wet: 0.05 },
  stab: { gain: 0.65, wet: 0.12 },
  bat: { gain: 0.8, wet: 0.18 },
  growl: { gain: 0.7, wet: 0.22, gap: 0.25, voices: 4 },
  snarl: { gain: 0.95, range: 34, wet: 0.28, gap: 0.25, voices: 3 },
  moan: { gain: 0.45, wet: 0.3, gap: 0.6, voices: 2 },
  zdeath: { gain: 0.65, wet: 0.22, gap: 0.2, voices: 3 },
  bite: { gain: 0.9, wet: 0.1, gap: 0.2 },
  bang: { gain: 0.8, range: 34, wet: 0.35, gap: 0.12 },
  fall: { gain: 0.6, wet: 0.2, gap: 0.1 },
  crawl: { gain: 0.25, range: 16, wet: 0.15, gap: 0.5, voices: 2 },
  scream: { gain: 0.6, range: 40, wet: 0.35, gap: 0.5, voices: 2 },
  hurt: { gain: 0.6, self: true, wet: 0.08, gap: 0.25 },
  door: { gain: 0.5, wet: 0.2 },
  pickup: { gain: 0.45, self: true, wet: 0.05, chime: 0.45 },
  heal: { gain: 0.45, self: true, wet: 0.05, chime: 0.6 },
  heart: { gain: 0.75, self: true, wet: 0, rate: 0.02, inner: true },
  breathIn: { gain: 0.32, self: true, wet: 0, inner: true },
  breathOut: { gain: 0.3, self: true, wet: 0, inner: true },
  gasp: { gain: 0.6, self: true, wet: 0.05, inner: true },
  sting: { gain: 0.55, self: true, wet: 0.3, gap: 5 },
  zap: { gain: 0.5, range: 22, wet: 0.25, gap: 0.15 },
  drip: { gain: 0.3, range: 20, wet: 0.5, voices: 2 },
  creak: { gain: 0.35, range: 30, wet: 0.5, voices: 1 },
  step: { gain: 0.14, self: true, wet: 0.04, rate: 0.08 },
  win: { gain: 1, self: true, wet: 0.1 },
  // Round 3, the feel of the guns (synthesised, no samples): the thump under every shot, the mechanism, brass on the
  // floor, the magazines, the bolt slap, the hit and kill ticks, the active reload, slamming into cover.
  thump: { gain: 0.9, self: true, wet: 0.05 },
  thumpBig: { gain: 1.0, self: true, wet: 0.08 },
  mech: { gain: 0.5, self: true, wet: 0.04 },
  slide: { gain: 0.6, self: true, wet: 0.05 },
  casing: { gain: 0.5, range: 14, wet: 0.12, voices: 6, rate: 0.12 },
  shellDrop: { gain: 0.6, range: 14, wet: 0.1, voices: 3 },
  magout: { gain: 0.7, self: true, wet: 0.05 },
  magDrop: { gain: 0.7, range: 14, wet: 0.12 },
  magin: { gain: 0.9, self: true, wet: 0.06 },
  grab: { gain: 0.5, self: true, wet: 0.02 },
  slap: { gain: 1.0, self: true, wet: 0.08 },
  load: { gain: 0.7, self: true, wet: 0.05 },
  hitmark: { gain: 0.55, self: true, wet: 0, gap: 0.03 },
  killmark: { gain: 0.8, self: true, wet: 0.05 },
  perfect: { gain: 0.6, self: true, wet: 0.1 },
  fumble: { gain: 0.6, self: true, wet: 0.05 },
  slam: { gain: 0.9, self: true, wet: 0.1 }
};
// The order samples load in: what is heard first and most.
const LOAD_ORDER = ['shot', 'growl', 'snarl', 'flesh', 'impact', 'headshot', 'moan', 'zdeath', 'empty', 'reload', 'smg', 'rifle', 'shotgun', 'rack', 'bite', 'hurt', 'swing', 'stab', 'bat', 'fall', 'bang', 'step'];
const SFX_DIR = 'assets/sfx/';
const MAX_VOICES = 24;
const RANGE = 26;

export class Audio {
  constructor(world) {
    this.world = world;
    this.ctx = null;
    this.muted = new URLSearchParams(location.search).get('mute') === '1';
    this.buffers = {}; // name -> [AudioBuffer]
    this.voices = []; // { src, out, level, end, name }
    this.lastAt = {}; // name -> ctx time of the last play
    this.lastPick = {}; // name -> last variant index
    this.loading = null; // Promise of the sample load (for tests)
  }

  wake() {
    if (this.ctx || this.muted) return;
    try {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      // master: comp -> gain -> out. Everything dry goes to `this.bus`; reverb sends to `this.verb`.
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 8;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.002;
      this.comp.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.comp.connect(this.master).connect(ctx.destination);
      // Her ears: everything she hears from the world goes through them (a low-pass and a duck the shots slam shut).
      this.ear = ctx.createBiquadFilter();
      this.ear.type = 'lowpass';
      this.ear.frequency.value = 20000;
      this.ear.Q.value = 0.4;
      this.duck = ctx.createGain();
      this.ear.connect(this.duck).connect(this.comp);
      this.bus = ctx.createGain();
      this.bus.connect(this.ear);
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.corridor(1.2);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5500;
      const ret = ctx.createGain();
      ret.gain.value = 0.55;
      this.verb.connect(tone).connect(ret).connect(this.ear);
      // The shots: their own bus, driven into a soft clip (a recording overloading), straight to the compressor so the
      // bang itself is never muffled; their echo off the room's hard walls goes through her ears.
      this.loud = ctx.createGain();
      this.loud.gain.value = 1.5;
      const clip = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(2.4 * x) / Math.tanh(2.4);
      }
      clip.curve = curve;
      clip.oversample = '2x';
      this.loud.connect(clip).connect(this.comp);
      this.room = ctx.createConvolver();
      this.room.buffer = this.hardRoom(2.2);
      const roomRet = ctx.createGain();
      roomRet.gain.value = 0.7;
      this.room.connect(roomRet).connect(this.ear);
      // The ringing: two close sines a few hertz apart (a beating whine), in her head, after the compressor.
      this.ring = ctx.createGain();
      this.ring.gain.value = 0;
      for (const f of [3870, 3876, 7760]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = f > 5000 ? 0.25 : 0.5;
        o.connect(g).connect(this.ring);
        o.start();
      }
      this.ring.connect(this.master);
      this.earsAt = 0;
      this.earsWas = 0;
      this.startBed();
      ctx.resume?.();
    } catch {
      this.muted = true;
      this.ctx = null;
      return;
    }
    this.loading = this.load().catch(() => {});
  }

  // A generated impulse response: a tiled corridor — a few early reflections, then a dense tail that darkens.
  corridor(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const pre = Math.floor(0.008 * ctx.sampleRate);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / ctx.sampleRate;
        const a = 0.85 - 0.7 * (i / n); // highs die first
        lp += a * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp((-6.9 * t) / seconds) * 0.7;
      }
      for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [41, 0.22], [58, 0.15]]) {
        const i = Math.floor(((ms + c * 3) / 1000) * ctx.sampleRate);
        if (i < n) d[i] += (Math.random() < 0.5 ? -1 : 1) * g;
      }
    }
    return buf;
  }

  // A hard room (tiled walls, terrazzo, a ceiling of tiles): loud, close slaps off every wall in the first 80 ms, a
  // flutter between the parallel walls, then a long bright tail that darkens.
  hardRoom(seconds) {
    const ctx = this.ctx;
    const n = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const a = 0.95 - 0.8 * (i / n);
        lp += a * (Math.random() * 2 - 1 - lp);
        const swell = Math.min(1, t / 0.012);
        d[i] = lp * Math.exp((-6.9 * t) / seconds) * 0.55 * swell;
      }
      const slaps = [[6, 0.9], [11, 0.75], [17, 0.6], [23, 0.55], [31, 0.45], [38, 0.4], [47, 0.33], [58, 0.28], [71, 0.22], [86, 0.18], [104, 0.13], [125, 0.1]];
      for (const [ms, g] of slaps) {
        const i0 = Math.floor(((ms + c * 1.7 + Math.random() * 1.5) / 1000) * ctx.sampleRate);
        for (let k = 0; k < 40 && i0 + k < n; k++) d[i0 + k] += (Math.random() < 0.5 ? -1 : 1) * g * Math.exp(-k / 6);
      }
    }
    return buf;
  }

  // ---- Her ears (round 4). `hit` 0..1: how hard this shot hit them. Called by player.mjs on every shot, with the
  // value of world.ears after it.
  deafen(ears, hit) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const cut = 260 + 19000 * Math.pow(1 - Math.min(1, ears), 2.6);
    const tau = 0.35 + ears * 1.4;
    for (const [param, low, high] of [[this.ear.frequency, cut, 20000], [this.duck.gain, 1 - 0.62 * Math.min(1, ears), 1]]) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      // The bang first, then the hearing goes.
      param.linearRampToValueAtTime(low, now + 0.03);
      param.setTargetAtTime(high, now + 0.09 + hit * 0.25, tau);
    }
    const ring = this.ring.gain;
    ring.cancelScheduledValues(now);
    ring.setValueAtTime(ring.value, now);
    ring.setTargetAtTime(0.004 + 0.05 * ears * ears, now + 0.06, 0.12);
    ring.setTargetAtTime(0, now + 0.4 + ears * 1.2, 1.2 + ears * 3.5);
  }

  // A shot from her gun: the recording, a crack, a boom; `kind` shot | smg | rifle | shotgun.
  gunshot(kind) {
    this.play(kind);
    this.play('crack', null, { gain: { shotgun: 1.1, rifle: 1.2, smg: 0.7, shot: 0.9 }[kind] ?? 1, kind });
    this.play('boom', null, { gain: { shotgun: 1.25, rifle: 0.9, smg: 0.6, shot: 0.8 }[kind] ?? 1, kind });
  }

  // ---- The building, all the time: a fluorescent hum, the air handling, and now and then something far off (a scream
  // down a corridor, a door hammered, a moan through a wall, a drip, the building settling).
  startBed() {
    const ctx = this.ctx;
    const bed = ctx.createGain();
    bed.gain.value = 0.05;
    bed.connect(this.bus);
    for (const [f, g] of [[100, 0.5], [200, 0.22], [300, 0.12], [120, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = f === 100 ? 'sawtooth' : 'sine';
      o.frequency.value = f + (Math.random() - 0.5) * 0.6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const og = ctx.createGain();
      og.gain.value = g * 0.4;
      o.connect(lp).connect(og).connect(bed);
      o.start();
    }
    const n = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) d[i] = lp += 0.02 * (Math.random() * 2 - 1 - lp);
    const air = ctx.createBufferSource();
    air.buffer = buf;
    air.loop = true;
    const ag = ctx.createGain();
    ag.gain.value = 2.2;
    air.connect(ag).connect(bed);
    air.start();
    this.bed = bed;
    this.farIn = 6;
  }
  // From the game loop: the far-off sounds.
  tick(dt) {
    if (!this.ctx || this.muted) return;
    this.farIn -= dt;
    if (this.farIn > 0) return;
    this.farIn = 5 + Math.random() * 11;
    const p = this.world.player?.pos;
    if (!p) return;
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 14;
    const at = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
    const pick = Math.random();
    const name = pick < 0.16 ? 'scream' : pick < 0.32 ? 'bang' : pick < 0.55 ? 'moan' : pick < 0.75 ? 'drip' : pick < 0.88 ? 'creak' : 'growl';
    this.play(name, name === 'drip' ? { x: p.x + Math.sin(a) * 6, z: p.z + Math.cos(a) * 6 } : at, { gain: name === 'drip' ? 1 : 0.8 });
  }

  // Fetch index.json, then decode its files, most-heard sounds first, a few at a time.
  async load() {
    const res = await fetch(SFX_DIR + 'index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const index = await res.json();
    const names = Object.keys(index).sort((a, b) => rank(a) - rank(b));
    const queue = names.flatMap((name) => (index[name] ?? []).map((file) => ({ name, file })));
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const r = await fetch(SFX_DIR + job.file);
          if (!r.ok) continue;
          const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
          (this.buffers[job.name] ??= []).push(buf);
        } catch {
          // a file that will not load or decode: that sound keeps its other variants, or the synth
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);
  }

  // Where a sound is for the listener: { att 0..1, pan -1..1, d metres }.
  spatial(pos, range) {
    const p = this.world.player?.pos;
    if (!pos || !p) return { att: 1, pan: 0, d: 0 };
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const att = Math.pow(Math.max(0, 1 - d / range), 1.6);
    let fx, fz;
    const cam = this.world.camera;
    if (cam?.getWorldDirection) {
      const v = cam.getWorldDirection(this._dir ?? (this._dir = cam.position.clone()));
      fx = v.x;
      fz = v.z;
    } else {
      const yaw = this.world.player?.camYaw ?? 0; // yaw 0 looks along +Z
      fx = Math.sin(yaw);
      fz = Math.cos(yaw);
    }
    const fl = Math.hypot(fx, fz) || 1;
    // the camera's right is cross(dir, up) = (-dz, 0, dx)
    const rx = -fz / fl, rz = fx / fl;
    const side = d > 0.001 ? (dx * rx + dz * rz) / d : 0;
    return { att, pan: side * Math.min(1, d / 2) * 0.85, d };
  }

  // `opts.gain` scales this one play (the heartbeat's level, a far-off sound); `opts.kind` picks a synth's flavour.
  play(name, pos = null, opts = null) {
    if (!this.ctx || this.muted) return;
    const def = SFX[name];
    if (!def) return;
    try {
      this.playDef(name, opts ? { ...def, gain: def.gain * (opts.gain ?? 1), kind: opts.kind } : def, pos);
    } catch {
      // sound must never break the game
    }
  }

  playDef(name, def, pos) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (def.gap && now - (this.lastAt[name] ?? -1e9) < def.gap) return;
    const range = def.range ?? RANGE;
    const s = def.self ? { att: 1, pan: 0, d: 0 } : this.spatial(pos, range);
    if (s.att <= 0.002) return;
    this.reap(now);
    if (def.voices && this.voices.filter((v) => v.name === name).length >= def.voices) return;
    const level = def.gain * s.att;
    if (this.voices.length >= MAX_VOICES) {
      const quietest = this.voices.reduce((a, b) => (b.level < a.level ? b : a));
      if (quietest.level > level) return;
      this.stop(quietest, now);
    }
    this.lastAt[name] = now;

    // the voice's chain: [source] -> gain -> (lowpass with distance) -> pan -> bus, + reverb send
    const out = ctx.createGain();
    out.gain.value = level;
    let tail = out;
    if (s.d > 3) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200 + 16000 * Math.pow(1 - Math.min(1, s.d / range), 2);
      tail.connect(lp);
      tail = lp;
    }
    if (ctx.createStereoPanner && s.pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = s.pan;
      tail.connect(pn);
      tail = pn;
    }
    // A shot to the loud bus (its echo to the hard room); her heart and breath straight to the compressor, never
    // muffled (they are inside her head); the rest through her ears.
    tail.connect(def.loud ? this.loud : def.inner ? this.comp : this.bus);
    const wet = (def.wet ?? 0.18) * (1 + (0.8 * s.d) / range);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      tail.connect(send).connect(def.loud ? this.room : this.verb);
    }

    const list = this.buffers[name];
    let src = null, end = now + 1;
    if (list?.length) {
      let i = Math.floor(Math.random() * list.length);
      if (list.length > 1 && i === this.lastPick[name]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      this.lastPick[name] = i;
      src = ctx.createBufferSource();
      src.buffer = list[i];
      const spread = def.rate ?? 0.06;
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * spread;
      src.connect(out);
      src.start(now);
      end = now + list[i].duration / src.playbackRate.value + 0.05;
      if (def.chime) this.synth(name, def.chime, out);
    } else {
      end = now + this.synth(name, 1, out, def.kind);
    }
    if (name === 'impact' && Math.random() < def.ricochet) this.ricochet(out);
    const voice = { src, out, level, end, name };
    this.voices.push(voice);
    if (src) src.onended = () => this.disconnect(voice);
  }

  reap(now) {
    this.voices = this.voices.filter((v) => {
      if (v.end > now) return true;
      this.disconnect(v);
      return false;
    });
  }
  stop(v, now) {
    try {
      v.out.gain.setTargetAtTime(0, now, 0.01);
      v.src?.stop(now + 0.06);
    } catch {}
    v.end = now;
    this.voices = this.voices.filter((x) => x !== v);
  }
  disconnect(v) {
    if (v.gone) return;
    v.gone = true;
    setTimeout(() => {
      try {
        v.out.disconnect();
      } catch {}
    }, 2000);
  }

  // ---- The synthesised versions (the fallback before/without samples). Each returns its length in seconds.
  noise(seconds, { gain = 1, filter = null, q = 1, decay = 10, at = 0 } = {}, out) {
    const ctx = this.ctx;
    const n = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / n) * decay);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter;
      f.frequency.value = q;
      node.connect(f);
      node = f;
    }
    node.connect(g).connect(out);
    src.start(ctx.currentTime + at);
  }
  tone(freq, seconds, { type = 'sine', gain = 0.3, slide = 1, attack = 0.005, at = 0 } = {}, out) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + seconds + 0.05);
  }
  // A bullet whining off the wall.
  ricochet(out) {
    const f = 1800 + Math.random() * 1600;
    this.tone(f, 0.32, { type: 'triangle', gain: 0.12, slide: 0.45, attack: 0.004, at: 0.02 }, out);
    this.noise(0.12, { gain: 0.08, filter: 'highpass', q: 3000, decay: 12, at: 0.02 }, out);
  }
  synth(name, k, out, kind = null) {
    const T = (f, s, o) => this.tone(f, s, { ...o, gain: (o?.gain ?? 0.3) * k }, out);
    const N = (s, o) => this.noise(s, { ...o, gain: (o?.gain ?? 1) * k }, out);
    switch (name) {
      case 'shot':
        N(0.25, { gain: 0.9, filter: 'lowpass', q: 2400, decay: 14 });
        T(160, 0.12, { type: 'square', gain: 0.25, slide: 0.3 });
        return 0.3;
      case 'smg':
        N(0.14, { gain: 0.7, filter: 'bandpass', q: 1800, decay: 16 });
        return 0.2;
      case 'rifle':
        N(0.3, { gain: 0.9, filter: 'lowpass', q: 1800, decay: 12 });
        T(120, 0.15, { type: 'square', gain: 0.3, slide: 0.3 });
        return 0.35;
      case 'shotgun':
        N(0.45, { gain: 1.2, filter: 'lowpass', q: 1200, decay: 8 });
        T(80, 0.25, { type: 'sawtooth', gain: 0.4, slide: 0.4 });
        return 0.5;
      case 'rack':
        N(0.05, { gain: 0.4, filter: 'highpass', q: 2000, decay: 10 });
        N(0.06, { gain: 0.45, filter: 'highpass', q: 1500, decay: 10, at: 0.18 });
        return 0.3;
      case 'empty':
        T(900, 0.04, { type: 'square', gain: 0.1 });
        return 0.1;
      case 'reload':
        T(700, 0.05, { type: 'square', gain: 0.12 });
        T(500, 0.05, { type: 'square', gain: 0.12, at: 0.35 });
        return 0.45;
      case 'impact':
        N(0.08, { gain: 0.5, filter: 'bandpass', q: 2500, decay: 12 });
        return 0.12;
      case 'flesh':
        N(0.12, { gain: 0.5, filter: 'lowpass', q: 600, decay: 10 });
        return 0.15;
      case 'headshot':
        N(0.2, { gain: 0.7, filter: 'lowpass', q: 500, decay: 8 });
        T(90, 0.2, { type: 'sine', gain: 0.4, slide: 0.5 });
        return 0.25;
      case 'growl':
        T(110 + Math.random() * 40, 0.8, { type: 'sawtooth', gain: 0.25, slide: 1.6, attack: 0.1 });
        N(0.6, { gain: 0.3, filter: 'lowpass', q: 500, decay: 3 });
        return 0.85;
      case 'snarl':
        T(180 + Math.random() * 60, 0.6, { type: 'sawtooth', gain: 0.3, slide: 1.8, attack: 0.03 });
        N(0.5, { gain: 0.35, filter: 'bandpass', q: 1400, decay: 3 });
        return 0.65;
      case 'moan':
        T(85 + Math.random() * 30, 1.6, { type: 'sawtooth', gain: 0.18, slide: 0.8, attack: 0.3 });
        return 1.7;
      case 'zdeath':
        T(140, 0.7, { type: 'sawtooth', gain: 0.25, slide: 0.4, attack: 0.02 });
        N(0.4, { gain: 0.2, filter: 'lowpass', q: 400, decay: 4 });
        return 0.75;
      case 'bite':
        N(0.18, { gain: 0.5, filter: 'highpass', q: 900, decay: 8 });
        return 0.2;
      case 'hurt':
        T(220, 0.35, { type: 'triangle', gain: 0.35, slide: 0.6 });
        return 0.4;
      case 'bang':
        N(0.2, { gain: 0.8, filter: 'lowpass', q: 300, decay: 10 });
        T(60, 0.25, { type: 'sine', gain: 0.5, slide: 0.7 });
        return 0.3;
      case 'fall':
        N(0.25, { gain: 0.7, filter: 'lowpass', q: 250, decay: 9 });
        T(55, 0.2, { type: 'sine', gain: 0.4, slide: 0.6 });
        return 0.3;
      case 'bat':
        N(0.12, { gain: 0.7, filter: 'lowpass', q: 900, decay: 12 });
        T(90, 0.12, { type: 'sine', gain: 0.4, slide: 0.6 });
        return 0.15;
      case 'crawl':
        N(0.5, { gain: 0.25, filter: 'lowpass', q: 700, decay: 2 });
        return 0.5;
      case 'step':
        N(0.06, { gain: 0.3, filter: 'lowpass', q: 900, decay: 14 });
        return 0.08;
      case 'door':
        T(300, 0.2, { type: 'triangle', gain: 0.2, slide: 0.8 });
        return 0.25;
      case 'scream':
        T(700, 0.9, { type: 'sawtooth', gain: 0.2, slide: 0.5, attack: 0.05 });
        return 0.95;
      case 'pickup':
        T(660, 0.08, { gain: 0.2 });
        T(990, 0.1, { gain: 0.2, at: 0.08 });
        return 0.2;
      case 'heal':
        T(520, 0.3, { gain: 0.2, slide: 1.5 });
        return 0.35;
      case 'swing':
        N(0.15, { gain: 0.3, filter: 'bandpass', q: 1200, decay: 8 });
        return 0.15;
      case 'stab':
        N(0.2, { gain: 0.5, filter: 'highpass', q: 1500, decay: 10 });
        return 0.2;
      case 'heart':
        T(55, 0.12, { type: 'sine', gain: 0.5, slide: 0.8 });
        T(50, 0.1, { type: 'sine', gain: 0.35, slide: 0.8, at: 0.18 });
        return 0.3;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => T(f, 0.3, { gain: 0.2, at: i * 0.15 }));
        return 0.8;
      case 'crack': {
        // The muzzle blast's front: a few milliseconds of everything at once, then a hard edge of highs.
        const big = kind === 'shotgun' || kind === 'rifle';
        N(0.012, { gain: 1.6, decay: 4 });
        N(0.05, { gain: 1.0, filter: 'highpass', q: 1800, decay: 18 });
        N(0.09, { gain: big ? 0.9 : 0.6, filter: 'bandpass', q: big ? 900 : 1300, decay: 12 });
        return 0.12;
      }
      case 'boom': {
        // The chest punch: a sub that drops in pitch, and a low rumble of the room.
        const f0 = kind === 'shotgun' ? 62 : kind === 'rifle' ? 78 : kind === 'smg' ? 95 : 85;
        T(f0, kind === 'shotgun' ? 0.55 : 0.38, { type: 'sine', gain: 0.95, slide: 0.42, attack: 0.002 });
        T(f0 * 1.9, 0.12, { type: 'triangle', gain: 0.35, slide: 0.5, attack: 0.001 });
        N(kind === 'shotgun' ? 0.7 : 0.45, { gain: 1.1, filter: 'lowpass', q: 180, decay: 6 });
        return 0.7;
      }
      case 'breathIn':
        N(0.9, { gain: 0.5, filter: 'bandpass', q: 1300, decay: 1.5 });
        N(0.7, { gain: 0.25, filter: 'bandpass', q: 600, decay: 2 });
        return 0.9;
      case 'breathOut':
        N(0.8, { gain: 0.45, filter: 'bandpass', q: 900, decay: 3 });
        return 0.8;
      case 'gasp':
        N(0.35, { gain: 0.8, filter: 'bandpass', q: 1500, decay: 2 });
        T(380, 0.25, { type: 'sawtooth', gain: 0.05, slide: 1.3, attack: 0.02 });
        N(0.9, { gain: 0.45, filter: 'bandpass', q: 1000, decay: 3, at: 0.35 });
        return 1.3;
      case 'sting':
        // A low dissonant hit and a swell: one of them has seen her.
        [55, 58.3, 82.4, 116.5].forEach((f) => T(f, 1.6, { type: 'sawtooth', gain: 0.12, slide: 0.97, attack: 0.01 }));
        N(1.2, { gain: 0.35, filter: 'lowpass', q: 400, decay: 4 });
        T(1760, 0.9, { type: 'sine', gain: 0.03, slide: 0.94, attack: 0.3 });
        return 1.7;
      case 'zap':
        for (let i = 0; i < 4; i++) N(0.03, { gain: 0.6, filter: 'highpass', q: 2500, decay: 6, at: i * 0.045 + Math.random() * 0.02 });
        T(100, 0.25, { type: 'sawtooth', gain: 0.12, attack: 0.005 });
        return 0.3;
      case 'drip': {
        const f = 900 + Math.random() * 700;
        T(f, 0.08, { type: 'sine', gain: 0.18, slide: 1.8, attack: 0.002 });
        return 0.12;
      }
      case 'creak':
        T(70 + Math.random() * 40, 1.1, { type: 'sawtooth', gain: 0.07, slide: 1.25, attack: 0.25 });
        N(0.9, { gain: 0.12, filter: 'bandpass', q: 300, decay: 2 });
        return 1.2;
      case 'thump':
        T(72, 0.16, { type: 'sine', gain: 0.6, slide: 0.45, attack: 0.002 });
        N(0.06, { gain: 0.55, filter: 'lowpass', q: 320, decay: 18 });
        return 0.2;
      case 'thumpBig':
        T(56, 0.32, { type: 'sine', gain: 0.85, slide: 0.4, attack: 0.002 });
        N(0.14, { gain: 0.9, filter: 'lowpass', q: 240, decay: 10 });
        return 0.35;
      case 'mech':
        N(0.03, { gain: 0.4, filter: 'highpass', q: 3000, decay: 18 });
        T(1700 + Math.random() * 300, 0.02, { type: 'square', gain: 0.05 });
        return 0.05;
      case 'slide':
        N(0.04, { gain: 0.5, filter: 'bandpass', q: 2400, decay: 14 });
        N(0.035, { gain: 0.55, filter: 'highpass', q: 3200, decay: 16, at: 0.055 });
        return 0.1;
      case 'casing': {
        const f = 3600 + Math.random() * 1800;
        T(f, 0.09, { type: 'triangle', gain: 0.07, slide: 0.98 });
        T(f * 1.48, 0.06, { type: 'sine', gain: 0.04, at: 0.008 });
        return 0.1;
      }
      case 'shellDrop':
        N(0.05, { gain: 0.3, filter: 'lowpass', q: 1300, decay: 14 });
        T(820, 0.05, { type: 'triangle', gain: 0.05 });
        return 0.08;
      case 'magout':
        N(0.025, { gain: 0.4, filter: 'highpass', q: 2600, decay: 16 });
        N(0.08, { gain: 0.25, filter: 'bandpass', q: 1300, decay: 8, at: 0.02 });
        return 0.12;
      case 'magDrop':
        N(0.07, { gain: 0.45, filter: 'lowpass', q: 1600, decay: 12 });
        T(560, 0.06, { type: 'triangle', gain: 0.09 });
        N(0.04, { gain: 0.25, filter: 'lowpass', q: 1200, decay: 12, at: 0.09 });
        return 0.16;
      case 'magin':
        N(0.025, { gain: 0.55, filter: 'highpass', q: 2000, decay: 16 });
        T(300, 0.05, { type: 'square', gain: 0.14, slide: 0.7 });
        N(0.03, { gain: 0.5, filter: 'highpass', q: 3000, decay: 16, at: 0.06 });
        return 0.12;
      case 'grab':
        N(0.12, { gain: 0.15, filter: 'bandpass', q: 900, decay: 6 });
        return 0.13;
      case 'slap':
        N(0.04, { gain: 0.65, filter: 'lowpass', q: 2200, decay: 14 });
        T(210, 0.06, { type: 'square', gain: 0.16, slide: 0.6 });
        N(0.03, { gain: 0.45, filter: 'highpass', q: 2600, decay: 16, at: 0.035 });
        return 0.12;
      case 'load':
        N(0.03, { gain: 0.4, filter: 'highpass', q: 1800, decay: 14 });
        T(480, 0.04, { type: 'square', gain: 0.09, at: 0.03 });
        return 0.08;
      case 'hitmark':
        T(2500, 0.035, { type: 'sine', gain: 0.13 });
        return 0.05;
      case 'killmark':
        T(1350, 0.07, { type: 'sine', gain: 0.18 });
        T(2050, 0.07, { type: 'sine', gain: 0.11, at: 0.02 });
        N(0.06, { gain: 0.35, filter: 'lowpass', q: 380, decay: 10 });
        return 0.1;
      case 'perfect':
        T(880, 0.08, { gain: 0.16 });
        T(1320, 0.14, { gain: 0.16, at: 0.06 });
        return 0.22;
      case 'fumble':
        T(200, 0.14, { type: 'square', gain: 0.08, slide: 0.7 });
        N(0.07, { gain: 0.3, filter: 'bandpass', q: 900, decay: 8 });
        return 0.16;
      case 'slam':
        N(0.12, { gain: 0.9, filter: 'lowpass', q: 260, decay: 12 });
        T(62, 0.15, { type: 'sine', gain: 0.6, slide: 0.6 });
        N(0.05, { gain: 0.18, filter: 'highpass', q: 2500, decay: 12, at: 0.02 });
        return 0.18;
    }
    return 0.1;
  }
}

function rank(name) {
  const i = LOAD_ORDER.indexOf(name);
  return i < 0 ? LOAD_ORDER.length : i;
}
