// The one check over the carrier's content: the ship's folder and everything that names something in it.
//
//   node tools/check.mjs            # from this folder; prints what it checked and any problems (exit 1 if any)
//   node tools/check.mjs --quiet    # problems only
//
// Every content tool runs it (`tools/carrier-v2.mjs` after writing the layout, `tools/voices.mjs` before recording),
// and so should every session that changes content. It checks names, not shapes in space: the layout's geometry (no
// overlaps, inside the hull, every room reachable) is `tools/carrier-v2.mjs`'s, which builds it.
//
// What it checks:
// - the ship's folder (ships/carrier/): every file `index.json` names exists and holds exactly the entries it lists;
// - every room the layout names (crew posts, floor lines, switchboards, kit racks, magazines, tanks, the drone bay,
//   railgun rooms, turret barbettes) is a compartment, a drum room or a drum's ring corridor;
// - the career (career.json): each step's `do` is a kind career.mjs runs, its `who` is an officer, its rooms exist,
//   a drill's `kind` is a damage control job, `unlock` and `refuse` name things the game unlocks, each rank's action
//   station names a room or a seat and an officer;
// - the routine (watches.json): its rooms exist, `first` and `you.section` are sections;
// - spots: an officer's post, the start, the resume and your bunk stand inside the room they name;
// - people (content/people/): everyone the career and the routine name has a file, its `id` is its name, its `dept`
//   is a uniform, it has a browser `voice` and a recorded `cast`; a file nobody names is reported, not a problem;
// - the cast: every speaker has a `design`, `gender`, `language` and `style`; every clip in assets/voice/index.json
//   is by a known speaker (lines nobody says any more are `node tools/voices.mjs --prune`'s, and reported).
//
// To check a new kind of content, add a section below that pushes to `problems` (and `notes` for what is only worth
// knowing), and a line to the list above.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadLayout } from '../src/core/ship.mjs';
import { PEOPLE, peopleNamed } from '../src/core/people.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

// What the code knows. Keep these in step with it: the steps career.mjs `check()` runs, what `unlock` and `refuse`
// may name (career.mjs `allows()`), the seats an action station may be (`stations.ranks.*.seat`), the uniforms
// (crew.mjs `UNIFORMS`, less the suit) and the poses (crew.mjs `CLIPS`).
const STEPS = ['talk', 'go', 'read', 'sleep', 'muster', 'rounds', 'drill', 'suit', 'man', 'shoot', 'raid', 'board', 'launch', 'land', 'helm', 'turn', 'transit'];
const UNLOCKS = ['guns', 'raids', 'fighters', 'helm'];
const SEATS = ['gun', 'fighter', 'helm'];
const DEPTS = ['command', 'flight', 'engineering', 'crew'];
const POSES = ['idle', 'walk', 'sitChair', 'workTable', 'talk', 'lookAround'];

/** Checks the ship in `ships/<ship>`. Returns { problems, notes, counts }. */
export async function check({ root = ROOT, ship = 'carrier' } = {}) {
  const problems = [], notes = [], counts = {};
  const path = (p) => `${root}/${p}`;
  const read = async (p) => JSON.parse(readFileSync(p));
  const json = (p) => JSON.parse(readFileSync(path(p)));
  const dir = `ships/${ship}`;

  // ---- the ship's folder ----
  const index = json(`${dir}/index.json`);
  for (const [f, keys] of Object.entries(index.layout)) {
    if (!existsSync(path(`${dir}/${f}.json`))) { problems.push(`${dir}/${f}.json is missing (index.json names it)`); continue; }
    const have = Object.keys(json(`${dir}/${f}.json`));
    for (const k of have) if (!keys.includes(k)) problems.push(`${dir}/${f}.json holds "${k}", which index.json does not list for it`);
    for (const k of keys) if (!have.includes(k)) problems.push(`${dir}/${f}.json has no "${k}" (index.json lists it)`);
  }
  let L;
  try {
    L = await loadLayout(path(dir), read);
  } catch (e) {
    problems.push(String(e.message ?? e));
    return { problems, notes, counts };
  }
  const K = json(`${dir}/career.json`), W = json(`${dir}/watches.json`), V = json(`${dir}/voices.json`);

  // ---- rooms ----
  const rooms = new Map();
  for (const c of L.compartments) rooms.set(c.id, c);
  for (const r of L.drum?.rooms ?? []) rooms.set(r.id, r);
  for (const h of L.drum?.halves ?? []) for (const d of L.drum.decks) rooms.set(`ring-${h.id}-${d.id}`, { id: `ring-${h.id}-${d.id}`, ring: true });
  counts.rooms = rooms.size;
  const room = (where, id) => {
    if (typeof id !== 'string') return problems.push(`${where}: no room given`), null;
    const r = rooms.get(id);
    if (!r) problems.push(`${where} names room "${id}", which the layout does not have`);
    return r ?? null;
  };
  const spot = (where, id, at) => {
    const r = room(where, id);
    if (!r || !at || r.ring || !r.x) return;
    const [x, z] = at, e = 0.05;
    if (x < r.x[0] - e || x > r.x[1] + e || z < r.z[0] - e || z > r.z[1] + e) problems.push(`${where} stands at [${at}], outside ${id} (x ${r.x}, z ${r.z})`);
  };

  // what the layout names
  const W8 = L.weapons ?? {};
  const named = [
    ...(L.stations ?? []).map((s, i) => [`stations[${i}]`, s.room]),
    ...(L.routes?.lines ?? []).map((r) => [`floor line "${r.name}"`, r.to]),
    ...(L.damage?.switchboards ?? []).map((r) => ['damage.switchboards', r]),
    ...Object.entries(L.damage?.kits ?? {}).flatMap(([k, kit]) => (kit.rooms ?? []).map((r) => [`damage.kits.${k}.rooms`, r])),
    ...Object.entries(L.damage?.kinds ?? {}).flatMap(([k, kind]) => (Array.isArray(kind.rooms) ? kind.rooms : []).map((r) => [`damage.kinds.${k}.rooms`, r])),
    ...(W8.turrets ?? []).flatMap((t) => [[`turret ${t.mount} barbette`, t.barbette], [`turret ${t.mount} magazine`, t.magazine]]),
    ...(L.mounts ?? []).filter((m) => m.magazine).map((m) => [`mount ${m.id} magazine`, m.magazine]),
    ...(W8.tubes?.magazine ? [['weapons.tubes.magazine', W8.tubes.magazine]] : []),
    ...['port', 'starboard'].flatMap((k) => (W8.broadside?.[k]?.magazines ?? []).map((m) => [`weapons.broadside.${k}.magazines`, m])),
    ...['port', 'starboard'].filter((k) => W8.railgun?.[k]?.room).map((k) => [`weapons.railgun.${k}.room`, W8.railgun[k].room]),
    ...(L.plant?.propellant?.tanks ?? []).map((t) => ['plant.propellant.tanks', t]),
    ...(L.integrity?.drones?.from ? [['integrity.drones.from', L.integrity.drones.from]] : []),
  ];
  for (const [where, id] of named) room(where, id);
  for (const [i, s] of (L.stations ?? []).entries()) {
    spot(`stations[${i}] (${s.post ?? s.room})`, s.room, s.at);
    if (s.pose && !POSES.includes(s.pose)) problems.push(`stations[${i}] has pose "${s.pose}" (one of ${POSES.join(', ')})`);
    if (s.dept && !DEPTS.includes(s.dept)) problems.push(`stations[${i}] has dept "${s.dept}" (one of ${DEPTS.join(', ')})`);
  }
  for (const t of W8.turrets ?? []) if (!(L.mounts ?? []).some((m) => m.id === t.mount)) problems.push(`turret ${t.mount} has no mount`);

  // ---- the career ----
  const officers = new Set((K.people ?? []).map((p) => p.id));
  const sections = new Set((W.sections ?? []).map((s) => s.id));
  for (const p of K.people ?? []) {
    spot(`career officer ${p.id}`, p.room, p.at);
    if (p.pose && !POSES.includes(p.pose)) problems.push(`career officer ${p.id} has pose "${p.pose}"`);
  }
  if (K.start) spot('career.start', K.start.room, K.start.at);
  if (K.resume) spot('career.resume', K.resume.room, K.resume.at);
  for (const k of Object.keys(K.refuse ?? {})) if (!UNLOCKS.includes(k)) problems.push(`career.refuse.${k}: not something the game unlocks (${UNLOCKS.join(', ')})`);
  (K.steps ?? []).forEach((st, i) => {
    const at = `career step ${i + 1} (${st.do})`;
    if (!STEPS.includes(st.do)) problems.push(`${at}: "${st.do}" is not a step career.mjs runs`);
    if (st.who !== undefined && !officers.has(st.who)) problems.push(`${at}: who "${st.who}" is not an officer in career.people`);
    if (st.do === 'talk' && st.who === undefined) problems.push(`${at}: a talk step needs a who`);
    if (st.room !== undefined) room(at, st.room);
    for (const r of st.rooms ?? []) room(at, r);
    if (st.do === 'drill' && !L.damage?.kinds?.[st.kind]) problems.push(`${at}: drill kind "${st.kind}" is not in damage.kinds`);
    for (const u of st.unlock ?? []) if (!UNLOCKS.includes(u)) problems.push(`${at}: unlock "${u}" is not something the game unlocks`);
    if (['shoot', 'raid'].includes(st.do) && st.from && !['port', 'starboard', 'above', 'below'].includes(st.from)) problems.push(`${at}: from "${st.from}"`);
    if (!st.order) problems.push(`${at}: no order (the duty card's line)`);
  });
  counts.steps = K.steps?.length ?? 0;
  for (const [rank, s] of Object.entries(K.stations?.ranks ?? {})) {
    const at = `career.stations.ranks.${rank}`;
    if (s.room) room(at, s.room);
    else if (!SEATS.includes(s.seat)) problems.push(`${at}: neither a room nor a seat (${SEATS.join(', ')})`);
    if (s.who && !officers.has(s.who)) problems.push(`${at}: who "${s.who}" is not an officer`);
  }

  // ---- the routine ----
  if (W.first && !sections.has(W.first)) problems.push(`watches.first "${W.first}" is not a section`);
  if (W.you) {
    if (!sections.has(W.you.section)) problems.push(`watches.you.section "${W.you.section}" is not a section`);
    spot('watches.you (muster spot)', W.you.muster, W.you.at);
    if (W.you.bunk) spot('watches.you.bunk', W.you.bunk.room, W.you.bunk.at);
  }
  for (const w of W.watches ?? []) for (const t of [w.from, w.to]) if (!/^\d\d:\d\d$/.test(t ?? '')) problems.push(`watch "${w.name}": time "${t}" is not hh:mm`);
  for (const [k, u] of Object.entries(W.drum?.rooms ?? {})) if (!rooms.has(k)) problems.push(`watches.drum.rooms names room "${k}", which the layout does not have`);
  // `uses` and `stations.stay` are kinds of room (a drum room's `use`), not rooms.
  const uses = new Set((L.drum?.rooms ?? []).map((r) => r.use));
  for (const u of Object.keys(W.drum?.uses ?? {})) if (!uses.has(u)) problems.push(`watches.drum.uses.${u}: no drum room has that use (${[...uses].join(', ')})`);
  for (const u of W.drum?.stations?.stay ?? []) if (!uses.has(u)) problems.push(`watches.drum.stations.stay: no drum room has use "${u}"`);

  // ---- people ----
  const ids = peopleNamed(K, W);
  const people = new Map();
  for (const id of ids) {
    const f = `${PEOPLE}/${id}.json`;
    if (!existsSync(path(f))) { problems.push(`${f} is missing (the career or the routine names ${id})`); continue; }
    const p = json(f);
    people.set(id, p);
    if (p.id !== id) problems.push(`${f}: its id is "${p.id}"`);
    if (typeof p.name !== 'string' || !p.name) problems.push(`${f}: no name`);
    if (!DEPTS.includes(p.dept)) problems.push(`${f}: dept "${p.dept}" is not a uniform (${DEPTS.join(', ')})`);
    if (typeof p.voice?.pitch !== 'number' || typeof p.voice?.rate !== 'number') problems.push(`${f}: voice needs a pitch and a rate (the browser's speech)`);
    if (!p.cast) problems.push(`${f}: no cast (the recorded voice: tools/voices.mjs)`);
  }
  const files = existsSync(path(PEOPLE)) ? readdirSync(path(PEOPLE)).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) if (!ids.includes(f.slice(0, -5))) notes.push(`${PEOPLE}/${f}: nobody aboard names this person`);
  counts.people = people.size;

  // ---- the cast ----
  const speakers = { ...Object.fromEntries([...people].map(([id, p]) => [id, p.cast]).filter(([, c]) => c)), ...(V.speakers ?? {}) };
  if (!V.speakers?.ship) problems.push(`${dir}/voices.json: no speakers.ship (the ship's broadcast)`);
  for (const [id, S] of Object.entries(speakers)) for (const k of ['design', 'gender', 'language', 'style']) if (!S?.[k]) problems.push(`speaker ${id}: no ${k} in their cast`);
  for (const id of Object.keys(V.speakers ?? {})) if (people.has(id)) problems.push(`${dir}/voices.json: ${id} is a person; their cast goes in ${PEOPLE}/${id}.json`);
  if (existsSync(path('assets/voice/index.json'))) {
    const lines = Object.keys(json('assets/voice/index.json').lines ?? {});
    const unknown = [...new Set(lines.map((k) => k.split('|')[0]).filter((s) => !speakers[s]))];
    // The archived first carrier's speakers keep their clips (tools/voices.mjs says both carriers' lines).
    const v1 = existsSync(path('archive/carrier-v1/carrier-v1.career.json')) ? new Set(json('archive/carrier-v1/carrier-v1.career.json').people.map((p) => p.id)) : new Set();
    for (const s of unknown) (v1.has(s) ? notes : problems).push(`assets/voice/index.json has clips by "${s}", ${v1.has(s) ? "the archived first carrier's" : 'who is not a speaker'}`);
    counts.clips = lines.length;
  }
  return { problems, notes, counts };
}

// ---- run from the command line ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const quiet = process.argv.includes('--quiet');
  const { problems, notes, counts } = await check();
  if (!quiet) {
    console.log(`Checked ships/carrier: ${counts.rooms} rooms, ${counts.steps} career steps, ${counts.people} people, ${counts.clips ?? 0} recorded clips.`);
    for (const n of notes) console.log(`  note: ${n}`);
  }
  if (problems.length) {
    console.log(`${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else if (!quiet) console.log('No problems.');
}
