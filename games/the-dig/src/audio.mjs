// The sounds. The guns, the blasts and the creatures are recordings (public/sfx, all CC0: CREDITS.md there says whose);
// the rest is made up on the spot with WebAudio: picks on rock, the hook, the portal, the chimes, and the low hum that
// grows as you near a room someone planted for you. Everything goes through one cave reverb (round 5: the old
// feedback echo repeated every shot and growl until it got on the play-tester's nerves).
let ctx = null, master = null, verb = null, hum = null, humGain = null;
let muted = new URLSearchParams(location.search).has('mute');
const samples = new Map(); // name → AudioBuffer, filled in the background once the sound is unlocked

const SAMPLES = [
  'shot-1', 'shot-2', 'shot-3', 'shot-heavy', 'shot-light', 'shotgun', 'boom-0', 'boom-1', 'boom-2', 'boom-3', 'boom-4',
  'boom-big', 'laser', 'zap', 'launch', 'roar-01', 'roar-02', 'grunt-01', 'grunt-02', 'grunt-03', 'grunt-04', 'hurt-03',
  'hurt-04', 'hurt-05', 'howl', 'weird-01', 'weird-05', 'bug-01', 'bug-02', 'bug-04', 'monster-04', 'monster-07',
  'scream-02', 'brute-roar'
];

// A cave's reverb, made rather than recorded: a few early reflections off near walls, then a tail of noise that dies
// away over about two seconds and loses its top as it goes (rock swallows the highs first). No repeats, so nothing
// echoes back at you.
function caveImpulse(secs = 2.2) {
  const rate = ctx.sampleRate, n = Math.floor(rate * secs);
  const buf = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      // The one-pole low-pass closes as the tail goes on.
      const k = 0.55 * Math.exp(-t * 2.2) + 0.04;
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * Math.exp(-t * 3.1) * (t < 0.012 ? t / 0.012 : 1);
    }
    for (const [t, g] of [[0.011, 0.5], [0.019, 0.35], [0.031, 0.3], [0.047, 0.22], [0.066, 0.16]]) d[Math.floor((t + ch * 0.003) * rate)] += g * (Math.random() < 0.5 ? -1 : 1);
  }
  return buf;
}

export function unlockAudio() {
  if (ctx || muted) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.7;
    // A gentle limiter, so a nuke and three crawlers at once never clip.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -6;
    limit.ratio.value = 8;
    master.connect(limit);
    limit.connect(ctx.destination);
    verb = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.buffer = caveImpulse();
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 3800;
    const back = ctx.createGain();
    back.gain.value = 0.6;
    verb.connect(conv);
    conv.connect(dark);
    dark.connect(back);
    back.connect(master);
    // The hum: two detuned low sines, silent until a room is near.
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);
    for (const f of [55, 55.7, 110.3]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(humGain);
      o.start();
    }
    hum = true;
    loadSamples();
  } catch {
    ctx = null;
  }
}

function loadSamples() {
  for (const name of SAMPLES)
    fetch(`assets/sfx/${name}.wav`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      // The callback form too: older Safari's decodeAudioData returns nothing.
      .then((ab) => ab && new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)))
      .then((buf) => buf && samples.set(name, buf))
      .catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.7;
}
export const isMuted = () => muted;
export const samplesLoaded = () => samples.size;

function noise(dur) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  return s;
}

// A sound's level and how much of it goes to the reverb.
function out(node, gain, wet) {
  const g = ctx.createGain();
  g.gain.value = gain;
  node.connect(g);
  g.connect(master);
  if (wet) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w);
    w.connect(verb);
  }
  return g;
}

function env(node, gain, a, d, { wet = 0.15 } = {}) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  node.connect(g);
  out(g, 1, wet);
  return t + a + d;
}

function filtered(src, type, freq, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f);
  return f;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A recording: false if it has not loaded (yet), so the caller can fall back to a made-up sound.
function play(name, { gain = 1, rate = 1, wet = 0.25, lp = 0, delay = 0 } = {}) {
  const buf = samples.get(name);
  if (!buf) return false;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = rate;
  out(lp ? filtered(s, 'lowpass', lp) : s, gain, wet);
  s.start(ctx.currentTime + delay);
  return true;
}

// The multitool's body under every shot: a low thump you feel more than hear, and the action cycling just after.
function thump(weight = 1) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(36, ctx.currentTime + 0.14);
  env(o, 0.55 * weight, 0.002, 0.16, { wet: 0.05 });
  o.start();
  o.stop(ctx.currentTime + 0.2);
  const n = noise(0.04);
  const f = filtered(n, 'bandpass', 3200, 3);
  const g = ctx.createGain();
  g.gain.value = 0.09;
  f.connect(g);
  g.connect(master);
  n.start(ctx.currentTime + 0.07);
}

// What each creature sounds like: a few recordings each, played a little higher or lower so no two are the same.
const VOICES = {
  crawler: { growl: ['roar-01', 'roar-02', 'grunt-02', 'grunt-03'], hurt: ['hurt-03', 'hurt-04', 'hurt-05'], rate: [0.95, 1.2] },
  stalker: { growl: ['howl', 'weird-01', 'weird-05'], hurt: ['hurt-04', 'hurt-05'], rate: [0.72, 0.88] },
  ghoul: { growl: ['grunt-01', 'grunt-04', 'roar-02'], hurt: ['hurt-03', 'grunt-02'], rate: [0.62, 0.74] },
  archer: { growl: ['weird-01', 'weird-05', 'grunt-04'], hurt: ['hurt-05', 'hurt-04'], rate: [1.15, 1.35] },
  bug: { growl: ['bug-01', 'bug-02', 'bug-04'], hurt: ['bug-04'], rate: [1, 1.3] },
  beast: { growl: ['roar-01', 'grunt-03', 'howl'], hurt: ['hurt-03'], rate: [1.05, 1.25] },
  brute: { growl: ['monster-04', 'monster-07'], hurt: ['monster-07', 'grunt-01'], roar: ['brute-roar'], rate: [0.8, 0.95] }
};

export const sfx = {
  dig(hard = 0.7) {
    if (!ctx || muted) return;
    const n = noise(0.08);
    env(filtered(n, 'bandpass', 900 + 900 * hard, 2), 0.25, 0.003, 0.07, { wet: 0.05 });
    n.start();
  },
  break() {
    if (!ctx || muted) return;
    const n = noise(0.25);
    env(filtered(n, 'lowpass', 1200), 0.5, 0.005, 0.22, { wet: 0.1 });
    n.start();
  },
  place() {
    if (!ctx || muted) return;
    const n = noise(0.1);
    env(filtered(n, 'lowpass', 500), 0.45, 0.004, 0.09, { wet: 0.05 });
    n.start();
  },
  torch() {
    if (!ctx || muted) return;
    const n = noise(0.5);
    env(filtered(n, 'highpass', 2500), 0.12, 0.05, 0.4, { wet: 0 });
    n.start();
  },
  // A thrown torch going end over end.
  whoosh() {
    if (!ctx || muted) return;
    const n = noise(0.35);
    const f = filtered(n, 'bandpass', 700, 2);
    f.frequency.setValueAtTime(500, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.3);
    env(f, 0.14, 0.04, 0.28, { wet: 0.05 });
    n.start();
  },
  step() {
    if (!ctx || muted) return;
    const n = noise(0.06);
    env(filtered(n, 'lowpass', 380), 0.18, 0.002, 0.05, { wet: 0.02 });
    n.start();
  },
  // The multitool. kind: 'standard' (a rifle's crack, one of three), 'heavy' (the special rounds), 'shotgun'.
  gun(kind = 'standard') {
    if (!ctx || muted) return;
    const name = kind === 'shotgun' ? 'shotgun' : kind === 'heavy' ? 'shot-heavy' : pick(['shot-1', 'shot-2', 'shot-3']);
    const ok = play(name, { gain: kind === 'standard' ? 0.95 : 1.05, rate: 0.95 + Math.random() * 0.08, wet: 0.32 });
    thump(kind === 'standard' ? 1 : 1.3);
    if (ok) return;
    const n = noise(0.4);
    env(filtered(n, 'lowpass', 4200), 0.8, 0.001, 0.25, { wet: 0.3 });
    n.start();
  },
  bolt() {
    if (!ctx || muted) return;
    for (const dt of [0, 0.18]) {
      const n = noise(0.05);
      const f = filtered(n, 'bandpass', 2600, 4);
      const g = ctx.createGain();
      g.gain.value = 0.3;
      f.connect(g);
      g.connect(master);
      n.start(ctx.currentTime + dt);
    }
  },
  draw() {
    if (!ctx || muted) return;
    const n = noise(0.5);
    env(filtered(n, 'bandpass', 600, 6), 0.08, 0.3, 0.2, { wet: 0 });
    n.start();
  },
  // A bowstring (the hook's throw, and an archer's shot, quieter the further off).
  bow(dist = 0) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.15);
    env(filtered(o, 'lowpass', 900), Math.max(0.05, 0.35 - dist * 0.01), 0.002, 0.2, { wet: 0.12 });
    o.start();
    o.stop(ctx.currentTime + 0.25);
  },
  thunk() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(180, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
    env(o, 0.35, 0.002, 0.12, { wet: 0.1 });
    o.start();
    o.stop(ctx.currentTime + 0.2);
  },
  // A creature's voice: what (growl, hurt, die, roar), muffled and quieter the further off it is.
  creature(kind, what = 'growl', dist = 10) {
    if (!ctx || muted) return;
    const v = VOICES[kind];
    const names = v && (v[what] ?? (what === 'die' ? v.hurt : v.growl));
    const [r0, r1] = v?.rate ?? [1, 1];
    const rate = (r0 + Math.random() * (r1 - r0)) * (what === 'die' ? 0.85 : 1);
    const gain = Math.max(0.04, (what === 'roar' ? 1.1 : 0.85) - dist * 0.02);
    if (names && play(pick(names), { gain, rate, wet: 0.2 + Math.min(0.35, dist / 50), lp: 700 + 14000 / (1 + dist / 5) })) return;
    if (what === 'growl') this.growl(dist);
  },
  // The made-up growl: the robots' (and anyone's while the recordings load).
  growl(dist = 10) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 60 + Math.random() * 30;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18 + Math.random() * 10;
    const lg = ctx.createGain();
    lg.gain.value = 25;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const g = Math.max(0.03, 0.4 - dist * 0.012);
    env(filtered(o, 'lowpass', 500), g, 0.1, 0.6, { wet: 0.3 });
    o.start();
    lfo.start();
    o.stop(ctx.currentTime + 0.8);
    lfo.stop(ctx.currentTime + 0.8);
  },
  hit() {
    if (!ctx || muted) return;
    const n = noise(0.12);
    env(filtered(n, 'bandpass', 400, 1), 0.5, 0.002, 0.1, { wet: 0.1 });
    n.start();
  },
  hurt() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(260, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);
    env(filtered(o, 'lowpass', 1200), 0.2, 0.002, 0.16, { wet: 0 });
    o.start();
    o.stop(ctx.currentTime + 0.2);
  },
  chime() {
    if (!ctx || muted) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g);
      out(g, 1, 0.35);
      o.start(t);
      o.stop(t + 1);
    });
  },
  portal() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 1.2);
    env(o, 0.3, 0.2, 1.1, { wet: 0.4 });
    o.start();
    o.stop(ctx.currentTime + 1.5);
  },
  soft() {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.frequency.value = 660;
    env(o, 0.08, 0.01, 0.4, { wet: 0.1 });
    o.start();
    o.stop(ctx.currentTime + 0.5);
  },
  // The special ammo's sounds.
  launch() {
    if (!ctx || muted) return;
    thump(1.2);
    if (play('launch', { gain: 0.6, rate: 0.75 + Math.random() * 0.1, wet: 0.25 })) return;
    const n = noise(0.6);
    env(filtered(n, 'bandpass', 700, 0.8), 0.5, 0.01, 0.5, { wet: 0.25 });
    n.start();
  },
  laser() {
    if (!ctx || muted) return;
    if (play('laser', { gain: 0.6, rate: 0.95 + Math.random() * 0.1, wet: 0.2 })) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1800, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.18);
    env(filtered(o, 'lowpass', 3000), 0.18, 0.002, 0.2, { wet: 0.2 });
    o.start();
    o.stop(ctx.currentTime + 0.25);
  },
  zap() {
    if (!ctx || muted) return;
    if (play('zap', { gain: 0.5, rate: 0.9 + Math.random() * 0.3, wet: 0.2 })) return;
    const n = noise(0.3);
    env(filtered(n, 'highpass', 3000), 0.3, 0.002, 0.25, { wet: 0.2 });
    n.start();
  },
  freeze() {
    if (!ctx || muted) return;
    [1760, 2349, 2637].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      env(o, 0.05, 0.005 + i * 0.03, 0.4, { wet: 0.25 });
      o.start();
      o.stop(ctx.currentTime + 0.6);
    });
  },
  drill() {
    if (!ctx || muted) return;
    const n = noise(0.7);
    env(filtered(n, 'bandpass', 220, 1.5), 0.7, 0.02, 0.6, { wet: 0.25 });
    n.start();
  },
  boom(r = 3) {
    if (!ctx || muted) return;
    const big = Math.min(1, r / 9);
    const ok = play(pick(['boom-0', 'boom-1', 'boom-2', 'boom-3', 'boom-4']), { gain: 0.9 + big * 0.3, rate: 1 - big * 0.25, wet: 0.35 + big * 0.2 });
    if (r >= 5) play('boom-big', { gain: 0.7 + big * 0.4, rate: 1 - big * 0.2, wet: 0.4 });
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.6 + big);
    env(o, 0.8, 0.005, 0.6 + big, { wet: 0.2 });
    o.start();
    o.stop(ctx.currentTime + 2 + big);
    if (ok) return;
    const n = noise(1.5 + big * 2);
    env(filtered(n, 'lowpass', 900 - big * 500), 1.0 + big * 0.6, 0.004, 0.8 + big * 2, { wet: 0.4 });
    n.start();
  },
  thunder() {
    if (!ctx || muted) return;
    if (play('boom-big', { gain: 0.7, rate: 1.2 + Math.random() * 0.2, wet: 0.45 })) return;
    const n = noise(1.6);
    env(filtered(n, 'lowpass', 1600), 0.9, 0.003, 1.4, { wet: 0.45 });
    n.start();
  },
  // A brute's step: a low thump, louder the nearer it is.
  thud(dist = 20) {
    if (!ctx || muted) return;
    const g = Math.max(0, 0.6 - dist * 0.012);
    if (g <= 0.01) return;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.18);
    env(o, g, 0.004, 0.25, { wet: 0.25 });
    o.start();
    o.stop(ctx.currentTime + 0.3);
  },
  // The pulse going out (round 7). The play-tester, after the first try (a plain "booo"): "more like a 'warummmm' sound like
  // in Elite Dangerous when you do a scanner wave pulse thing". pulseVoice below makes it.
  pulse() {
    if (!ctx || muted) return;
    const dry = ctx.createGain();
    dry.gain.value = 1;
    out(dry, 1, 0.5);
    pulseVoice(ctx, dry, ctx.currentTime);
  },
  // While the pulse is held and charging: a whine that climbs. Returns a stop for when it is let go.
  pulseCharge(secs = 0.9) {
    if (!ctx || muted) return () => {};
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(520, t + secs);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(65, t);
    o2.frequency.exponentialRampToValueAtTime(130, t + secs);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + secs);
    o.connect(g);
    o2.connect(g);
    out(g, 1, 0.2);
    o.start(t);
    o2.start(t);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + 0.08);
      o.stop(n + 0.1);
      o2.stop(n + 0.1);
    };
  },
  // The cutter at work: a buzz with a crackle in it, brighter on harder rock.
  cut(hard = 0.7) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140 + hard * 60, t);
    o.frequency.linearRampToValueAtTime(150 + hard * 70, t + 0.25);
    env(filtered(o, 'bandpass', 900 + hard * 700, 1.5), 0.09, 0.01, 0.24, { wet: 0.05 });
    o.start(t);
    o.stop(t + 0.3);
    const n = noise(0.2);
    env(filtered(n, 'highpass', 2500, 0.7), 0.05 + hard * 0.04, 0.005, 0.15, { wet: 0.05 });
    n.start(t);
  },
  // The cutter's voice while it cuts (cutterVoice below). Returns { set(hard), stop() }.
  cutter(hard = 0.7) {
    if (!ctx || muted) return { set() {}, stop() {} };
    const dest = ctx.createGain();
    out(dest, 1, 0.05);
    return cutterVoice(ctx, dest, hard);
  },
  // An echo coming back from a hollow: panned to where it is (-1 left … 1 right), later and softer the farther it
  // is. Worked stone rings like a bowl; a plain cave thuds; water and lava answer low and soft.
  echo(kind, delay, pan, dist) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const gain = Math.max(0.025, 0.2 / (1 + dist / 9));
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const dest = ctx.createGain();
    dest.gain.value = 1;
    if (p) {
      p.pan.value = Math.max(-1, Math.min(1, pan));
      dest.connect(p);
      out(p, 1, 0.35);
    } else out(dest, 1, 0.35);
    const shape = (node, g, a, d) => {
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(g, t + a);
      e.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
      node.connect(e);
      e.connect(dest);
      return t + a + d;
    };
    if (kind === 'built' || kind === 'task') {
      // A bowl: a fundamental and two inharmonic partials, a long ring.
      for (const [f, g, d] of [[kind === 'task' ? 528 : 660, 1, 1.6], [kind === 'task' ? 1350 : 1690, 0.35, 1.0], [2410, 0.15, 0.6]]) {
        const o = ctx.createOscillator();
        o.frequency.value = f * (0.98 + Math.random() * 0.04);
        const end = shape(o, gain * g, 0.004, d);
        o.start(t);
        o.stop(end + 0.05);
      }
    } else {
      // A thud: a short burst of low noise (water and lava lower and softer).
      const n = noise(0.35);
      const lp = filtered(n, 'lowpass', kind === 'hollow' ? 260 : 150, 0.8);
      const end = shape(lp, gain * (kind === 'hollow' ? 1.3 : 0.9), 0.006, 0.28);
      n.start(t);
      n.stop(end + 0.05);
    }
  },
  // Something new in the pack.
  discover() {
    if (!ctx || muted) return;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.8);
    });
  }
};

// 0 (nothing near) … 1 (standing in the room). Round 5 took it to under a third of round 1's level: inside a room it
// was "a bit loud".
export const HUM_MAX = 0.065;
export function setHum(level) {
  if (!hum || muted) return;
  humGain.gain.setTargetAtTime(Math.min(HUM_MAX, level * HUM_MAX), ctx.currentTime, 0.4);
}

// The pulse's voice (round 7), into any audio context (the drive renders it offline to look at its shape):
// "warummm". A low sawtooth hum, three voices a few cents apart with an octave over them, through a resonant low-pass
// that opens fast (the "wa") and closes slowly (the "rummm"), its pitch lifting a little then sinking, a throb coming in
// as it closes, a sub under it all, and a breath of filtered noise that sweeps with the filter: the wave going out.
export function pulseVoice(c, dest, t0) {
  const END = 2.9;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.5, t0 + 0.06);
  amp.gain.exponentialRampToValueAtTime(0.42, t0 + 0.7);
  // The "mmm" holds while the filter closes, then lets go (an exponential fade from 0.7 s left it at 3 % by 1.5 s).
  amp.gain.linearRampToValueAtTime(0.34, t0 + 1.7);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + END);
  // The throb: a 6.5 Hz tremolo that grows in as the filter closes.
  const trem = c.createGain();
  trem.gain.value = 1;
  const lfo = c.createOscillator();
  lfo.frequency.value = 6.5;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t0);
  depth.gain.linearRampToValueAtTime(0.32, t0 + 1.0);
  lfo.connect(depth);
  depth.connect(trem.gain);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 7;
  lp.frequency.setValueAtTime(140, t0);
  lp.frequency.exponentialRampToValueAtTime(1600, t0 + 0.28);
  lp.frequency.exponentialRampToValueAtTime(240, t0 + 2.4);
  lp.connect(trem);
  trem.connect(amp);
  amp.connect(dest);
  const voices = [];
  for (const [type, mul, cents, g] of [['sawtooth', 1, -9, 0.5], ['sawtooth', 1, 8, 0.5], ['sawtooth', 1, 0, 0.45], ['square', 2, 3, 0.18]]) {
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = cents;
    o.frequency.setValueAtTime(46 * mul, t0);
    o.frequency.exponentialRampToValueAtTime(58 * mul, t0 + 0.18);
    o.frequency.exponentialRampToValueAtTime(43 * mul, t0 + END);
    const vg = c.createGain();
    vg.gain.value = g;
    o.connect(vg);
    vg.connect(lp);
    voices.push(o);
  }
  // The sub, felt more than heard.
  const sub = c.createOscillator();
  sub.frequency.setValueAtTime(52, t0);
  sub.frequency.exponentialRampToValueAtTime(40, t0 + 2.2);
  const sg = c.createGain();
  sg.gain.setValueAtTime(0.0001, t0);
  sg.gain.exponentialRampToValueAtTime(0.4, t0 + 0.05);
  sg.gain.linearRampToValueAtTime(0.26, t0 + 1.5);
  sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
  sub.connect(sg);
  sg.connect(dest);
  // The breath of the wave going out.
  const len = Math.floor(c.sampleRate * END);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const nz = c.createBufferSource();
  nz.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.3);
  bp.frequency.exponentialRampToValueAtTime(500, t0 + 2.2);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.07, t0 + 0.1);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
  nz.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  for (const o of [...voices, sub, lfo]) {
    o.start(t0);
    o.stop(t0 + END + 0.05);
  }
  nz.start(t0);
  return t0 + END;
}

// The cutter's voice. Round 8 asked for "a buzzing fizzing laser"; then "something about the frequency … annoying
// my ears"; then "I think it's the humming that hurts my ears". Every version until then stood on a sustained buzz
// (96 Hz saws and their harmonics, a 50 Hz flutter): a held tone is what wears on an ear over minutes of digging. So
// no oscillator at all now: a soft breathing hiss of noise with sparse spark crackles in it (rendered once into a
// looping buffer), banded 350 Hz – 2.6 kHz, nothing under 250 Hz to hum and little in 2–5 kHz to sting. Harder rock,
// a little brighter and louder. On any audio context (the drive renders it offline to measure it).
const CUT_LOOP = { sr: 0, data: null };
function cutterLoop(sr) {
  if (CUT_LOOP.sr === sr) return CUT_LOOP.data;
  const n = Math.floor(sr * 4);
  const d = new Float32Array(n);
  // The hiss, breathing: its level wanders between 0.55 and 1 every 80 ms or so, smoothly.
  const step = Math.floor(sr * 0.08);
  const pts = Array.from({ length: Math.ceil(n / step) + 2 }, () => 0.55 + Math.random() * 0.45);
  pts[pts.length - 1] = pts[0]; // loops without a seam in the level
  for (let i = 0; i < n; i++) {
    const k = i / step, j = Math.floor(k), f = k - j;
    const lvl = pts[j] + (pts[(j + 1) % pts.length] - pts[j]) * (0.5 - Math.cos(f * Math.PI) / 2);
    d[i] = (Math.random() * 2 - 1) * 0.32 * lvl;
  }
  // The sparks: about 28 a second, each a few milliseconds of noise dying away.
  for (let t = Math.random() * 0.03; t < 3.99; t += -Math.log(1 - Math.random()) / 28) {
    const i0 = Math.floor(t * sr), len = Math.floor(sr * (0.0015 + Math.random() * 0.0035)), amp = 0.35 + Math.random() * 0.5;
    for (let i = 0; i < len && i0 + i < n; i++) d[i0 + i] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * i) / len);
  }
  Object.assign(CUT_LOOP, { sr, data: d });
  return d;
}
export function cutterVoice(c, dest, hard = 0.7, t = c.currentTime) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 4), c.sampleRate);
  buf.getChannelData(0).set(cutterLoop(c.sampleRate));
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = Math.random() * 3; // each cut starts somewhere new in the loop
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 350;
  hp.Q.value = 0.7;
  // Two low-passes in a row: a steep fall above them, so the hiss stays out of 2–5 kHz.
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500 + hard * 400;
  lp.Q.value = 0.6;
  const lp2 = c.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 1900;
  lp2.Q.value = 0.5;
  const main = c.createGain();
  const level = (h) => 0.22 + h * 0.1;
  main.gain.setValueAtTime(0.0001, t);
  main.gain.exponentialRampToValueAtTime(level(hard), t + 0.05);
  src.connect(hp);
  hp.connect(lp);
  lp.connect(lp2);
  lp2.connect(main);
  main.connect(dest);
  src.start(t, src.loopStart);
  let stopped = false;
  return {
    set(h) {
      if (stopped) return;
      lp.frequency.setTargetAtTime(1500 + h * 400, c.currentTime, 0.08);
      main.gain.setTargetAtTime(level(h), c.currentTime, 0.08);
    },
    stop(at = c.currentTime) {
      if (stopped) return;
      stopped = true;
      main.gain.cancelScheduledValues(at);
      main.gain.setValueAtTime(Math.max(0.0001, main.gain.value), at);
      main.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      src.stop(at + 0.12);
    }
  };
}
