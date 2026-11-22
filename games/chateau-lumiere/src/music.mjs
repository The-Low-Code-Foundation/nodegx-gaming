// The background music player: plays the pieces in src/tunes.mjs with synthesised instruments (Web Audio, no files).
// Each time a section comes round it gets a new arrangement from ARRANGE (another instrument on the tune, the chords
// played another way, a counter-melody, little bell sparkles), the tempo drifts a touch from one play to the next,
// notes are humanised, and there is a pause between pieces. So the same eight bars never come round the same way twice
// in a row.
//
// musicPlayer(ctx, out) → { play(kind), stop() }. `kind` is a key of TUNES ('bright', 'dark') or null for silence.
// Check the tunes add up: `node src/music.mjs check`.
import { TUNES } from './tunes.mjs';

// ---------- Reading the tunes ----------
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9], dim: [0, 3, 6], dim7: [0, 3, 6, 9], sus4: [0, 5, 7]
};
function pitchClass(name) {
  const m = /^([A-G])([b#]?)$/.exec(name);
  if (!m) throw new Error(`note name "${name}"`);
  return (LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}
function parseChord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G][b#]?)(.*)$/.exec(main);
  if (!m || !(m[2] in QUALITY)) throw new Error(`chord "${sym}"`);
  const root = pitchClass(m[1]);
  return { sym, root, bass: slash ? pitchClass(slash) : root, pcs: QUALITY[m[2]].map((i) => (root + i) % 12) };
}
function parseNote(tok) {
  const [name, len] = tok.split(':');
  if (!(+len > 0)) throw new Error(`note "${tok}" has no length`);
  if (name === 'r') return { m: null, len: +len };
  const m = /^([A-G][b#]?)(\d)$/.exec(name);
  if (!m) throw new Error(`note "${tok}"`);
  return { m: 12 * (+m[2] + 1) + pitchClass(m[1]), len: +len };
}
const bars = (s) => s.split('|').map((b) => b.trim()).filter(Boolean).map((b) => b.split(/\s+/));

function compile(piece) {
  const sections = {};
  for (const [key, s] of Object.entries(piece.sections)) {
    const chordBars = bars(s.chords).map((b) => b.map(parseChord));
    const tuneBars = s.tune ? bars(s.tune).map((b) => b.map(parseNote)) : [];
    const half = piece.beats - Math.floor(piece.beats / 2);
    const list = chordBars.map((cs, i) => {
      const chords = cs.length === 1 ? [{ c: cs[0], at: 0, len: piece.beats }] : [{ c: cs[0], at: 0, len: half }, { c: cs[1], at: half, len: piece.beats - half }];
      let at = 0;
      const notes = (tuneBars[i] || []).map((n) => {
        const o = { ...n, at };
        at += n.len;
        return o;
      });
      return { chords, notes, sum: at };
    });
    const ms = list.flatMap((b) => b.notes).filter((n) => n.m != null).map((n) => n.m);
    sections[key] = { bars: list, tuneBars: tuneBars.length, mean: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 76 };
  }
  return { ...piece, compiled: sections };
}

export function checkTunes() {
  const problems = [];
  for (const [kind, list] of Object.entries(TUNES)) {
    for (const p of list) {
      let c;
      try {
        c = compile(p);
      } catch (e) {
        problems.push(`${kind} / ${p.name}: ${e.message}`);
        continue;
      }
      for (const key of p.form) if (!c.compiled[key]) problems.push(`${p.name}: form names section ${key}, which is missing`);
      for (const [key, s] of Object.entries(c.compiled)) {
        if (s.tuneBars && s.tuneBars !== s.bars.length) problems.push(`${p.name} ${key}: ${s.bars.length} bars of chords but ${s.tuneBars} of tune`);
        s.bars.forEach((b, i) => {
          if (s.tuneBars && Math.abs(b.sum - p.beats) > 1e-6) problems.push(`${p.name} ${key} bar ${i + 1}: tune adds up to ${b.sum} beats, not ${p.beats}`);
        });
      }
      for (const a of p.arrs) if (!ARRANGE[a]) problems.push(`${p.name}: no arrangement "${a}"`);
    }
  }
  return problems;
}

// ---------- Instruments ----------
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = Math.random;

// A struck sound (bell, music box, harp): each partial [frequency ×, loudness, ring ×, wave] jumps up and dies away.
function struck(ctx, out, f, t, ring, vel, partials, attack = 0.003) {
  for (const [mult, amp, rr = 1, type = 'sine'] of partials) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * amp, t + attack);
    g.gain.setTargetAtTime(0, t + attack, (ring * rr) / 5);
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.connect(g);
    o.start(t);
    o.stop(t + ring * rr + 0.05);
  }
}
// A held sound (flute, reed, strings): swells in, holds, lets go at the end of `dur`.
function held(ctx, out, f, t, dur, vel, { parts, attack, release = 0.12, vib = 0, cutoff = 0 }) {
  dur = Math.max(dur, attack + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setTargetAtTime(vel * 0.8, t + attack, 0.35);
  g.gain.setTargetAtTime(0, t + dur, release / 3);
  g.connect(out);
  let into = g;
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.5;
    lp.connect(g);
    into = lp;
  }
  const end = t + dur + release * 2 + 0.05;
  let depth = null;
  if (vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8 + rnd() * 0.8;
    depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(vib * f, t + Math.min(0.45, dur * 0.6));
    lfo.connect(depth);
    lfo.start(t);
    lfo.stop(end);
  }
  for (const [mult, amp, type = 'sine', detune = 0] of parts) {
    const pg = ctx.createGain();
    pg.gain.value = amp;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.detune.value = detune;
    if (depth) depth.connect(o.frequency);
    o.connect(pg).connect(into);
    o.start(t);
    o.stop(end);
  }
}

const INST = {
  box: (ctx, out, m, t, dur, vel) => struck(ctx, out, hz(m), t, 1.6, vel, [[1, 1], [3, 0.07, 0.5], [4.2, 0.12, 0.3]]),
  celesta: (ctx, out, m, t, dur, vel) => struck(ctx, out, hz(m), t, 1.9, vel, [[1, 1], [2, 0.22, 0.5], [4, 0.05, 0.25]]),
  glass: (ctx, out, m, t, dur, vel) => struck(ctx, out, hz(m), t, 2.6, vel, [[1, 1], [2.76, 0.22, 0.4], [5.4, 0.06, 0.2]]),
  harp: (ctx, out, m, t, dur, vel) => {
    const f = hz(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(Math.min(f * 8, 12000), t);
    lp.frequency.setTargetAtTime(f * 2, t, 0.25);
    lp.connect(out);
    struck(ctx, lp, f, t, Math.min(1.9, Math.max(0.45, dur * 1.5)), vel, [[1, 1, 1, 'triangle'], [2, 0.3, 0.5]]);
  },
  bass: (ctx, out, m, t, dur, vel) => struck(ctx, out, hz(m), t, Math.min(2.6, Math.max(0.7, dur)), vel, [[1, 1, 1, 'triangle'], [1, 0.7, 1.2]], 0.006),
  pizz: (ctx, out, m, t, dur, vel) => {
    const f = hz(m);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(f * 4, 4000);
    lp.connect(out);
    struck(ctx, lp, f, t, 0.5, vel, [[1, 1, 1, 'triangle'], [1, 0.5, 1.4]], 0.004);
  },
  flute: (ctx, out, m, t, dur, vel) => held(ctx, out, hz(m), t, dur, vel, { parts: [[1, 1], [2, 0.12], [3, 0.04]], attack: 0.07, vib: 0.005 }),
  reed: (ctx, out, m, t, dur, vel) => held(ctx, out, hz(m), t, dur, vel, { parts: [[1, 0.55, 'square'], [1, 0.6]], attack: 0.05, vib: 0.003, cutoff: Math.min(hz(m) * 3, 3000) }),
  strings: (ctx, out, m, t, dur, vel) => held(ctx, out, hz(m), t, dur, vel, { parts: [[1, 0.5, 'sawtooth', -7], [1, 0.5, 'sawtooth', 7]], attack: 0.4, release: 0.5, cutoff: 1300 }),
  shade: (ctx, out, m, t, dur, vel) => held(ctx, out, hz(m), t, dur, vel, { parts: [[1, 0.5, 'sawtooth', -9], [1, 0.5, 'sawtooth', 9]], attack: 0.9, release: 0.9, cutoff: 650 }),
  sub: (ctx, out, m, t, dur, vel) => held(ctx, out, hz(m), t, dur, vel, { parts: [[1, 1]], attack: 0.8, release: 1 })
};
// How loud each instrument is when it carries the tune, and when it holds the counter-melody.
const LEAD = { box: 0.16, celesta: 0.15, glass: 0.13, harp: 0.17, flute: 0.1, reed: 0.085 };
const COUNTER = { flute: 0.05, strings: 0.035, reed: 0.04 };
// Where each lead sounds best (MIDI): the tune is moved by an octave towards it.
const CENTRE = { box: 84, celesta: 81, glass: 81, harp: 76, flute: 77, reed: 70 };

// The arrangements a piece's `arrs` draw from. `acc`: oompah (bass on 1, chords after), arp (rippling eighths),
// pad (held strings), roll (a harp chord spread upwards), drone (low, dark held chord), pizz (plucked bass and chords).
export const ARRANGE = {
  box: { lead: 'box', acc: 'oompah', orn: 0.12, vol: 1 },
  flute: { lead: 'flute', acc: 'arp', sparkle: true, orn: 0.25, vol: 0.95 },
  celesta: { lead: 'celesta', acc: 'pad', counter: 'flute', orn: 0.1, vol: 0.9 },
  harpTune: { lead: 'harp', acc: 'pad', sparkle: true, orn: 0.2, vol: 0.95 },
  strings: { lead: 'flute', acc: 'roll', counter: 'strings', orn: 0.2, vol: 0.95 },
  glass: { lead: 'glass', acc: 'drone', sparkle: true, orn: 0.1, vol: 0.9 },
  reed: { lead: 'reed', acc: 'roll', orn: 0.2, vol: 0.9, dark: true },
  glassPad: { lead: 'glass', acc: 'pizz', counter: 'reed', orn: 0.1, vol: 0.9 },
  reedPizz: { lead: 'reed', acc: 'pizz', sparkle: true, orn: 0.15, vol: 0.9 }
};

const tonesIn = (c, lo, hi) => {
  const out = [];
  for (let m = lo; m <= hi; m++) if (c.pcs.includes(m % 12)) out.push(m);
  return out;
};
const pcIn = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

// ---------- Playing a bar ----------
function playBar(ctx, B, it, t0, st) {
  const { bar, arr, spb, vol, dark } = it;
  const at = (beat) => t0 + beat * spb;
  for (const seg of bar.chords) {
    const c = seg.c, tb = at(seg.at), segDur = seg.len * spb;
    const low = pcIn(c.bass, 38);
    switch (arr.acc) {
      case 'oompah':
        for (let k = 0; k < seg.len; k++) {
          const beat = seg.at + k;
          if (k === 0) INST.bass(ctx, B.bass, low, at(beat), spb * 1.2, 0.12 * vol);
          else if (it.beats === 4 && beat === 2) INST.bass(ctx, B.bass, pcIn((c.root + 7) % 12, 38), at(beat), spb, 0.1 * vol);
          else tonesIn(c, 55, 66).forEach((m) => INST.harp(ctx, B.acc, m, at(beat) + rnd() * 0.01, spb * 0.5, 0.045 * vol));
        }
        break;
      case 'arp': {
        const up = tonesIn(c, 53, 76);
        const seq = [...up, ...up.slice(1, -1).reverse()];
        const start = Math.floor(rnd() * 2) * 2;
        INST.bass(ctx, B.bass, low, tb, segDur, 0.11 * vol);
        for (let k = 0; k < seg.len * 2; k++) INST.harp(ctx, B.acc, seq[(k + start) % seq.length], tb + (k * spb) / 2, spb, (k % 2 ? 0.045 : 0.06) * vol);
        break;
      }
      case 'pad':
        INST.bass(ctx, B.bass, low, tb, segDur, 0.11 * vol);
        tonesIn(c, 52, 64).forEach((m) => INST.strings(ctx, B.acc, m, tb, segDur + 0.1, 0.025 * vol));
        break;
      case 'roll': {
        const tones = [low, ...tonesIn(c, 55, 74)];
        tones.forEach((m, i) => INST.harp(ctx, B.acc, m, tb + i * 0.04, segDur, (i ? 0.045 : 0.08) * vol));
        if (it.beats === 4 && seg.len === 4) tonesIn(c, 60, 72).forEach((m, i) => INST.harp(ctx, B.acc, m, at(seg.at + 2) + i * 0.05, spb * 2, 0.03 * vol));
        if (arr.dark) INST.shade(ctx, B.acc, low + 12, tb, segDur, 0.02 * vol);
        break;
      }
      case 'drone':
        INST.sub(ctx, B.bass, pcIn(c.bass, 33), tb, segDur + 0.2, 0.075 * vol);
        tonesIn(c, 50, 62).forEach((m) => INST.shade(ctx, B.acc, m, tb, segDur + 0.3, 0.026 * vol));
        INST.harp(ctx, B.acc, low + 12, tb, spb, 0.05 * vol);
        break;
      case 'pizz':
        for (let k = 0; k < seg.len; k++) {
          const beat = seg.at + k;
          if (k === 0) INST.pizz(ctx, B.bass, low, at(beat), spb, 0.14 * vol);
          else if (it.beats === 4 && beat === 2) INST.pizz(ctx, B.bass, pcIn((c.root + 7) % 12, 38), at(beat), spb, 0.11 * vol);
          else tonesIn(c, 57, 68).slice(0, 2).forEach((m) => INST.pizz(ctx, B.acc, m, at(beat), spb, 0.05 * vol));
        }
        if (dark && !arr.counter) INST.shade(ctx, B.acc, pcIn(c.root, 45), tb, segDur, 0.022 * vol);
        break;
    }
    // A second line, held, moving to the nearest note of each chord (not the root, if it can help it).
    if (arr.counter && it.tune) {
      let best = null, score = Infinity;
      for (const m of tonesIn(c, 55, 69)) {
        const s = Math.abs(m - st.counter) + (m % 12 === c.root ? 3 : 0);
        if (s < score) (score = s), (best = m);
      }
      st.counter = best;
      INST[arr.counter](ctx, B.counter, best, tb, segDur * 0.98, COUNTER[arr.counter] * vol);
    }
    // Now and then, a bell high above.
    if (arr.sparkle && rnd() < 0.4) {
      const high = tonesIn(c, 84, 96);
      INST[dark ? 'glass' : 'celesta'](ctx, B.sparkle, high[Math.floor(rnd() * high.length)], at(seg.at + Math.floor(rnd() * seg.len) + 0.5), spb, 0.035 * vol);
    }
  }
  // The tune.
  const lead = INST[arr.lead];
  for (const n of bar.notes) {
    if (n.m == null) continue;
    const m = n.m + it.shift, tn = at(n.at) + (rnd() - 0.5) * 0.016, dur = n.len * spb * (arr.lead === 'flute' ? 0.97 : 0.9);
    const vel = LEAD[arr.lead] * vol * (0.9 + rnd() * 0.2) * (n.at === 0 ? 1.08 : 1);
    if (n.len >= 1 && rnd() < arr.orn) {
      const step = it.scale.includes((m + 2) % 12) ? 2 : 1;
      lead(ctx, B.lead, m + step, tn - 0.075, 0.09, vel * 0.55);
    }
    lead(ctx, B.lead, m, tn, dur, vel);
  }
  // A held note gets a little answer of chord notes above it.
  const only = bar.notes.length === 1 && bar.notes[0];
  if (arr.sparkle && only && only.m != null && only.len >= 2) {
    const c = bar.chords[0].c, echo = tonesIn(c, only.m + it.shift + 1, only.m + it.shift + 13).slice(0, 3);
    echo.forEach((m, i) => INST[dark ? 'glass' : 'celesta'](ctx, B.sparkle, m, at(1 + i * 0.5), spb, 0.04 * vol));
  }
  // The very last bar of a piece: one spread chord to end on.
  if (it.last) {
    const c = bar.chords[bar.chords.length - 1].c;
    [pcIn(c.bass, 38), ...tonesIn(c, 53, 79)].forEach((m, i) => INST.harp(ctx, B.acc, m, t0 + i * 0.05, 3, 0.06 * vol));
  }
}

// Lays out one play of a piece: every bar, with the arrangement and speed it gets this time.
function plan(p) {
  const spb0 = 60 / (p.bpm * (0.97 + rnd() * 0.06));
  const items = [], used = {};
  let last = null;
  p.form.forEach((key, fi) => {
    const sec = p.compiled[key];
    let name;
    if (key === 'I' || (key === 'A' && !used.A)) name = p.arrs[0]; // the piece's own sound first
    else {
      const pool = p.arrs.filter((a) => a !== last && a !== used[key]);
      name = pool[Math.floor(rnd() * pool.length)] || p.arrs[0];
    }
    used[key] = last = name;
    const arr = ARRANGE[name];
    const shift = Math.max(-1, Math.min(1, Math.round((CENTRE[arr.lead] - sec.mean) / 12))) * 12;
    const end = fi === p.form.length - 1;
    sec.bars.forEach((bar, i) => {
      const n = sec.bars.length;
      const spb = spb0 * (end && i === n - 1 ? 1.3 : end && i === n - 2 ? 1.12 : 1);
      const phrase = 0.86 + 0.14 * Math.sin((Math.PI * ((i % 4) + 0.5)) / 4);
      items.push({ bar, arr, shift, spb, beats: p.beats, scale: p.scale, dark: !!p.dark, tune: sec.tuneBars > 0, last: end && i === n - 1, vol: arr.vol * phrase * (key === 'I' ? 0.8 : 1) });
    });
  });
  return items;
}

// A long fade-out reverb, made from noise.
function hall(ctx, seconds = 2.8) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function song(ctx, out, kind, realtime) {
  const pieces = COMPILED[kind];
  const voice = ctx.createGain();
  voice.gain.setValueAtTime(0, ctx.currentTime);
  voice.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
  voice.connect(out);
  const bus = (pan) => {
    const g = ctx.createGain();
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(voice);
    } else g.connect(voice);
    return g;
  };
  const B = { lead: bus(0), acc: bus(-0.2), bass: bus(0), counter: bus(0.25), sparkle: bus(0.35) };
  const st = { counter: 62 };
  const queue = [];
  let pi = Math.floor(rnd() * pieces.length), t = ctx.currentTime + 0.15, timer = null, stopped = false;
  const until = (horizon) => {
    while (t < horizon) {
      if (!queue.length) queue.push(...plan(pieces[pi++ % pieces.length]), { gap: 2.5 + rnd() * 2 });
      const it = queue.shift();
      if (it.gap) {
        t += it.gap;
        continue;
      }
      playBar(ctx, B, it, t, st);
      t += it.beats * it.spb;
    }
  };
  const pump = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    if (t < now) t = now + 0.05; // the tab slept: pick up from here rather than rush to catch up
    until(now + 1.5);
    timer = setTimeout(pump, 250);
  };
  if (realtime) pump();
  return {
    kind,
    until,
    stop() {
      stopped = true;
      clearTimeout(timer);
      const now = ctx.currentTime;
      voice.gain.cancelScheduledValues(now);
      voice.gain.setValueAtTime(voice.gain.value, now);
      voice.gain.linearRampToValueAtTime(0, now + 0.8);
      setTimeout(() => voice.disconnect(), 8000);
    }
  };
}

const COMPILED = Object.fromEntries(Object.entries(TUNES).map(([k, list]) => [k, list.map(compile)]));

export function musicPlayer(ctx, out, { realtime = true } = {}) {
  const bus = ctx.createGain();
  bus.gain.value = 0.7;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  comp.connect(out);
  bus.connect(comp);
  const verb = ctx.createConvolver();
  verb.buffer = hall(ctx);
  const send = ctx.createGain();
  send.gain.value = 0.32;
  bus.connect(send).connect(verb).connect(comp);
  let current = null;
  return {
    play(kind) {
      if (current?.kind === kind) return current;
      current?.stop();
      current = kind && COMPILED[kind] ? song(ctx, bus, kind, realtime) : null;
      return current;
    },
    stop() {
      current?.stop();
      current = null;
    }
  };
}

// node src/music.mjs check
if (typeof process !== 'undefined' && process.argv?.[2] === 'check' && import.meta.url.endsWith(process.argv[1]?.split('/').pop())) {
  const problems = checkTunes();
  console.log(problems.length ? problems.join('\n') : `ok: ${Object.values(TUNES).flat().map((p) => p.name).join(', ')}`);
  process.exitCode = problems.length ? 1 : 0;
}
