// Records the carrier's spoken lines with Gemini TTS, into assets/voice/.
//
//   GEMINI_API_KEY=... node tools/voices.mjs              # from this folder: record what is missing or changed
//   node tools/voices.mjs --list                          # every line, and which have a clip (no key needed)
//   GEMINI_API_KEY=... node tools/voices.mjs --only dc    # one speaker (any id in ships/carrier.voices.json)
//   GEMINI_API_KEY=... node tools/voices.mjs --limit 10   # at most 10 requests this run
//   node tools/voices.mjs --prune                         # delete clips for lines the game no longer says
//   GEMINI_API_KEY=... node tools/voices.mjs --design     # make the saved voices that are missing (see below)
//   GEMINI_API_KEY=... node tools/voices.mjs --sample <dir>   # one audition line per speaker, as mp3s in <dir>
//
// Each speaker is a voice designed from a description (`design` in ships/carrier.voices.json) and saved in the Google
// project behind the key (Gemini's Voices API, POST /v1beta/voices); its id is written back as `voiceId`. Every line
// is then spoken in that saved voice (the Interactions API), with the speaker's short `style` as the acting note.
// Saved voices belong to one Google project and expire a year after their last use: with another key, or after a long
// gap, run --design again (it makes a new voice from the same description; it will sound a little different, so record
// the lines again too). Change a `design` and clear its `voiceId` to make it anew.
//
// The game never calls Gemini: it plays these files, and a line with no clip is spoken by the browser's own speech
// (src/carrier/voice.mjs). So the key is only needed here, and only in the environment; never write it into a file.
//
// Every line the game can say with fixed words is worked out from the data (both carriers': ships/carrier.* and the
// first one's, ships/carrier-v1.*): the officers' orders in ships/carrier.career.json, the leading hand and the pipes in ships/carrier.watches.json, and the ship's calls listed
// in ships/carrier.voices.json (which also holds who speaks in which voice). Lines with a place or a frame number in
// them (a fire's call-out, a hull breach) are not recorded; the browser speaks those.
//
// The index (assets/voice/index.json) keeps, per line, the hash of what it was recorded from (model, saved voice,
// style, words). Change a speaker's direction or a line's words and that clip is recorded again on the next run.
//
// Rates: requests are spaced 7 s apart (the TTS models have allowed about 10 a minute), and the run stops cleanly at
// the day's quota; run it again tomorrow and it carries on.
// It needs ffmpeg on the PATH (PCM to mp3, trims the silence, levels it, and puts the ship's broadcasts through a
// speaker).

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(here(p)));
const V = json('ships/carrier.voices.json');
const OUT = here('assets/voice/');
const INDEX = here('assets/voice/index.json');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const only = opt('--only');
const limit = Number(opt('--limit') ?? Infinity);

// --- every fixed line, in the order to record them (the career first: it is what a new player hears) ---

const lines = [];
const add = (speaker, text) => {
  if (!text || !V.speakers[speaker]) return;
  if (!lines.some((l) => l.speaker === speaker && l.text === text)) lines.push({ speaker, text });
};

// Both carriers' lines: today's (ships/carrier.*) and the first one's (archived: archive/carrier-v1/), so --prune keeps
// the first carrier's clips for when it comes back. Lines both say are recorded once.
for (const dir of ['ships/carrier', 'archive/carrier-v1/carrier-v1']) {
const K = json(`${dir}.career.json`);
const W = json(`${dir}.watches.json`);
const L = json(`${dir}.layout.json`);

// The officers: what each says when you report, and when you come back too soon.
for (const st of K.steps) if (st.do === 'talk') add(st.who, st.say);
for (const p of K.people) add(p.id, 'You have your orders.'), add(p.id, 'Carry on.');

// Your leading hand: the shake, the roll at the muster (and the career's words after it), and being adrift.
const mine = W.sections.find((s) => s.id === W.you.section);
const hhmm = (t) => t.replace(':', '').replace(/^24/, '00');
const muster = L.compartments.find((c) => c.id === W.you.muster).name.toLowerCase();
const fill = (text, section, watch) =>
  text
    .replaceAll('{section}', section.name)
    .replaceAll('{watch}', watch.name.toLowerCase())
    .replaceAll('{time}', hhmm(watch.from))
    .replaceAll('{muster}', muster);
const leader = mine.leader.id;
for (const w of W.watches) add(leader, fill(W.pipes.shake, mine, w));
add(leader, fill(W.pipes.present, mine, W.watches[0]));
add(leader, fill(W.pipes.adrift, mine, W.watches[0]));
for (const st of K.steps) if (st.do === 'muster') add(leader, st.say), add(leader, st.adrift?.call), add(leader, st.adrift?.say);

// The ship's broadcast: the bridge in the career, the fixed calls, then the pipes.
for (const st of K.steps) add('ship', st.start);
for (const t of V.ship) add('ship', t);
add('ship', W.pipes.down);
add('ship', W.pipes.call);
for (const s of W.sections) for (const w of W.watches) add('ship', fill(W.pipes.change, s, w));
}

// --- how a line is said ---

/** The words as the model should say them: "0400" as "oh four hundred", "(amidships)" as ", amidships". */
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one',
  'twenty-two', 'twenty-three'];
function speakable(text) {
  return text
    .replace(/\b([01]\d|2[0-3])([0-5]\d)\b/g, (_, h, m) => {
      const H = Number(h), M = Number(m);
      const hour = H === 0 ? 'zero' : H < 10 ? `oh ${NUM[H]}` : NUM[H];
      if (M === 0) return H === 0 ? 'midnight' : `${hour} hundred`;
      return `${hour} ${M < 10 ? `oh ${NUM[M]}` : M < 20 ? NUM[M] : ['', '', 'twenty', 'thirty', 'forty', 'fifty'][Math.floor(M / 10)] + (M % 10 ? `-${NUM[M % 10]}` : '')}`;
    })
    .replace(/\s*\(([^)]+)\)/g, ', $1');
}

const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.2,areverse';
const LEVEL = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const TANNOY = 'highpass=f=320,lowpass=f=3600,acompressor=threshold=-20dB:ratio=4:attack=5:release=80,aecho=0.85:0.5:38|83:0.22|0.1';
const filter = (S) => [TRIM, S.tannoy ? TANNOY : null, LEVEL].filter(Boolean).join(',');
const hash = (S, text) => createHash('sha1').update(JSON.stringify([V.model, S.voiceId, S.style, speakable(text), filter(S)])).digest('hex').slice(0, 10);
const keyOf = (l) => `${l.speaker}|${l.text}`;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36).replace(/-$/, '');

// --- the index ---

const index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX)) : { lines: {} };
const save = () => {
  const sorted = Object.fromEntries(lines.filter((l) => index.lines[keyOf(l)]).map((l) => [keyOf(l), index.lines[keyOf(l)]]));
  for (const [k, v] of Object.entries(index.lines)) if (!(k in sorted)) sorted[k] = v; // stale ones stay until --prune
  writeFileSync(INDEX, JSON.stringify({
    about: 'Made by tools/voices.mjs (Gemini TTS). Keyed "<speaker>|<the exact line>"; src/carrier/voice.mjs plays the file for a line it finds here.',
    model: V.model,
    lines: sorted,
  }, null, 1) + '\n');
};

const fresh = (l) => {
  const e = index.lines[keyOf(l)];
  return e && e.hash === hash(V.speakers[l.speaker], l.text) && existsSync(new URL(e.file, OUT));
};

if (flag('--list')) {
  for (const l of lines) console.log(`${fresh(l) ? '✓' : ' '} ${l.speaker.padEnd(6)} ${l.text}`);
  const n = lines.filter(fresh).length;
  console.log(`\n${n} of ${lines.length} lines recorded.`);
  process.exit(0);
}

if (flag('--prune')) {
  const want = new Set(lines.map(keyOf));
  for (const [k, e] of Object.entries(index.lines)) if (!want.has(k)) (delete index.lines[k]), console.log('dropped', k);
  const used = new Set(Object.values(index.lines).map((e) => e.file));
  for (const f of readdirSync(OUT)) if (f.endsWith('.mp3') && !used.has(f)) unlinkSync(new URL(f, OUT)), console.log('deleted', f);
  save();
  process.exit(0);
}

// --- recording ---

const KEY = process.env.GEMINI_API_KEY ?? process.env.GEMINI_KEY;
if (!KEY) {
  console.error('Set GEMINI_API_KEY in the environment (a Google AI Studio key). Never write it into a file here.');
  process.exit(1);
}
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.error('ffmpeg is needed on the PATH.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const API = 'https://generativelanguage.googleapis.com/v1beta';
const SPACING = 7000;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class DayQuota extends Error {}

/** A POST to the Gemini API, paced and retried on rate limits and hiccups; the parsed answer. */
async function call(path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(Math.max(0, last + SPACING - Date.now()));
    last = Date.now();
    let res;
    try {
      res = await fetch(`${API}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      });
    } catch (e) {
      console.log(`    ${e.name}: retrying`);
      continue;
    }
    const text = await res.text();
    if (res.status === 429 || res.status >= 500) {
      if (/PerDay/i.test(text)) throw new DayQuota();
      const hint = text.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
      const wait = Math.min(hint ? Number(hint[1]) + 2 : 20 * (attempt + 1), 300);
      console.log(`    HTTP ${res.status}: waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
    return JSON.parse(text);
  }
  throw new Error('gave up after 6 tries');
}

/** Makes the saved voice for `id` from its description; writes its id into ships/carrier.voices.json. Returns its
 *  preview (WAV bytes). */
async function design(id) {
  const S = V.speakers[id];
  const j = await call('voices', {
    store: true,
    voice: { model: V.model, type: 'prompted', display_name: `ThreadSpace carrier: ${id}`, gender: S.gender, language_code: S.language, prompted: { input: S.design } },
  });
  S.voiceId = j.id;
  writeFileSync(here('ships/carrier.voices.json'), JSON.stringify(V, null, 2) + '\n');
  return j.sample_audio?.data ? Buffer.from(j.sample_audio.data, 'base64') : null;
}

/** `text` in `S`'s saved voice: WAV bytes. */
async function tts(S, text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const j = await call('interactions', {
      model: V.model,
      input: [{ type: 'user_input', content: [{ type: 'text', text: speakable(text), annotations: [{ type: 'speech_metadata', style: S.style }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: S.voiceId }] },
    });
    const audio = (j.steps ?? []).flatMap((s) => s.content ?? []).find((c) => c.type === 'audio');
    if (audio?.data) return Buffer.from(audio.data, 'base64');
    console.log('    no audio in the answer: retrying');
  }
  throw new Error('no audio after 3 tries');
}

/** WAV bytes to an mp3 at `file` (a path): trimmed, levelled, through the tannoy for the ship. Its length in s. */
function encode(wav, S, file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'pipe:0',
    '-af', filter(S), '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', file], { input: wav });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(Number(String(probe.stdout).trim()) * 100) / 100;
}

const wanted = [...new Set(lines.map((l) => l.speaker))].filter((id) => !only || id === only);
const designOnly = flag('--design'), sampleDir = opt('--sample');
try {
  for (const id of wanted) {
    if (V.speakers[id].voiceId) continue;
    console.log(`designing ${id}: ${V.speakers[id].design}`);
    const preview = await design(id);
    console.log(`    → ${V.speakers[id].voiceId}`);
    if (preview && sampleDir) mkdirSync(sampleDir, { recursive: true }), encode(preview, { ...V.speakers[id], tannoy: false }, resolve(sampleDir, `${id}-preview.mp3`));
  }
} catch (e) {
  if (e instanceof DayQuota) console.log("The day's quota is spent."), process.exit(0);
  throw e;
}
if (designOnly) process.exit(0);
if (sampleDir) {
  mkdirSync(sampleDir, { recursive: true });
  for (const id of wanted) {
    const S = V.speakers[id];
    if (!S.sample) continue;
    console.log(`sample ${id}: ${S.sample.slice(0, 70)}…`);
    const secs = encode(await tts(S, S.sample), S, resolve(sampleDir, `${id}-line.mp3`));
    console.log(`    → ${id}-line.mp3 (${secs}s)`);
  }
  process.exit(0);
}

const todo = lines.filter((l) => !fresh(l) && (!only || l.speaker === only));
console.log(`${lines.length} lines, ${lines.length - lines.filter((l) => !fresh(l)).length} recorded, ${todo.length} to record${only ? ` for ${only}` : ''}.`);
let made = 0;
for (const l of todo) {
  if (made >= limit) break;
  const S = V.speakers[l.speaker];
  const h = hash(S, l.text);
  const file = `${l.speaker}-${slug(l.text)}-${h.slice(0, 6)}.mp3`;
  process.stdout.write(`${l.speaker.padEnd(6)} ${l.text.slice(0, 70)}${l.text.length > 70 ? '…' : ''}\n`);
  try {
    const secs = encode(await tts(S, l.text), S, new URL(file, OUT).pathname);
    const old = index.lines[keyOf(l)];
    if (old && old.file !== file && existsSync(new URL(old.file, OUT))) unlinkSync(new URL(old.file, OUT));
    index.lines[keyOf(l)] = { file, hash: h, voice: S.voiceId, secs };
    save();
    made++;
    console.log(`    → ${file} (${secs}s)`);
  } catch (e) {
    if (e instanceof DayQuota) {
      console.log('\nThe day\'s TTS quota is spent. Run this again tomorrow: it carries on where it stopped.');
      break;
    }
    console.log(`    failed: ${e.message}`);
  }
}
save();
console.log(`\nRecorded ${made}. ${lines.filter(fresh).length} of ${lines.length} lines now have a clip.`);
