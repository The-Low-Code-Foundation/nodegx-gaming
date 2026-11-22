// The one check over a ship's content: the ship's folder and everything that names something in it.
//
//   node tools/check.mjs            # from this folder; prints what it checked and any problems (exit 1 if any)
//   node tools/check.mjs cutter     # another ship's folder (ships/cutter/); the default is the carrier
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
// - the berths (`berths`, a carrier's hangar): each one's ship has a folder with an `envelope` and a `dock`; her
//   envelope, placed at the berth's `at` and `yaw`, is inside the hangar with `BERTH.clear` metres to its walls, floor
//   and deckhead, to the gangway down the middle, to the other berths and to the fighter pads and their launch runs;
//   the bay door on her side opens at least `BERTH.door` (long, high) in front of her and she goes under its head;
//   her docking port faces the gangway and `port`, `sill`, `skin` and `box` are where her own layout puts them;
// - the career (career.json): each step's `do` is a kind career.mjs runs, its `who` is an officer, its rooms exist,
//   a drill's `kind` is a damage control job, `unlock` and `refuse` name things the game unlocks, each rank's action
//   station names a room or a seat and an officer;
// - the player's career (content/careers/<id>.json, which spans ships; checked whichever ship is asked for): every
//   ship it names has a folder, and a carried one's `page` names a berth of its host that holds her; ranks, quals and
//   unlocks name each other properly and the code knows every unlock; each person has a file, a `ship`, and a spot
//   inside a room of that ship (their own, or the layout station that names them: `stations[].person`); each step
//   names a ship, a kind career.mjs runs and that ship can play (a muster needs her watches.json, a gunnery step a
//   turret and a target sled, a drill one of her own kinds in a room she lists for it, a launch or a pilot's plan a
//   berth), a person who stands aboard that ship, rooms she has, and an order; a `run` is unbroken and on one ship;
//   every line is checked against the glossary;
// - the routine (watches.json): its rooms exist, `first` and `you.section` are sections;
// - spots: an officer's post, the start, the resume and your bunk stand inside the room they name;
// - people (content/people/): everyone the career, the routine and the announcements name has a file, its `id` is
//   its name, its `dept` is a uniform, it has a recorded `cast`; a file nobody names is reported, not a problem;
// - the cast: every speaker has a `design`, `gender`, `language` and `style`; every clip in assets/voice/index.json
//   is by a known speaker (lines nobody says any more are `node tools/voices.mjs --prune`'s, and reported);
// - the announcements (content/announcements/): the index lists exactly the files there; each one's `who` speaks,
//   its `to` names audiences and channels the announcer knows, its slots are the ship's or listed, its `priority` is
//   1 to 5; every call the code makes (`emit('call', { id: '…' })` in src/) has a file, and a file no code calls is
//   reported; the `nets` name rooms; the condition-one call has the warning's seconds among its values;
// - the glossary (content/glossary.json): no spoken line (the career, the pipes, the calls) says a word in `avoid`;
// - how much is recorded: the lines without a clip are reported (they are shown, not spoken).
//
// A ship may have no career.json, watches.json or voices.json (the cutter has none: she runs as free roam, without a
// routine, and the ship's calls show as subtitles). What is not there is not checked, and is noted.
//
// To check a new kind of content, add a section below that pushes to `problems` (and `notes` for what is only worth
// knowing), and a line to the list above.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadLayout } from '../src/core/ship.mjs';
import { PEOPLE, peopleNamed } from '../src/core/people.mjs';
import { CALLS, AUDIENCES, CHANNELS, SHIP_SLOTS, DEPTS as NETS, callLines, expand } from '../src/core/announcer.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

// What the code knows. Keep these in step with it: the steps career.mjs `check()` runs, what `unlock` and `refuse`
// may name (career.mjs `allows()`), the seats an action station may be (`stations.ranks.*.seat`), the uniforms
// (crew.mjs `DEPTS`) and the poses (crew.mjs `CLIPS`).
const STEPS = ['talk', 'go', 'read', 'sleep', 'muster', 'rounds', 'drill', 'suit', 'man', 'shoot', 'raid', 'board', 'launch', 'land', 'helm', 'turn', 'transit'];
const UNLOCKS = ['guns', 'raids', 'fighters', 'helm'];
const SEATS = ['gun', 'fighter', 'helm'];
// The player's career (content/careers/): the kinds it adds, what it may unlock (`career.allows()` is asked for each
// somewhere, or will be: see the file's `unlocks`), a pilot's legs (pilot.mjs) and a capture's grades (recovery.mjs).
const CAREERS = 'content/careers';
const STEPS_SERVICE = [...STEPS, 'pilot', 'obey'];
const UNLOCKS_SERVICE = ['guns', 'helm', 'launch', 'firecontrol', 'fighters', 'raids'];
const LEGS = ['launch', 'goto', 'hold', 'turn', 'recover'];
const GRADES = ['clean', 'fair', 'rough'];
const DEPTS = ['command', 'flight', 'engineering', 'crew'];
const POSES = ['idle', 'walk', 'sitChair', 'workTable', 'talk', 'lookAround'];
// A berthed ship's room: metres clear all round her, the bay door's clear opening in front of her [long, high], and the
// half-width of the gangway down the hangar's middle (sets/hangar.mjs `gangway`).
const BERTH = { clear: 3, door: [44, 11], gangway: 0.8 };

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
  // The optional files: a ship without one is checked as if it were empty.
  const optional = (f) => (existsSync(path(`${dir}/${f}`)) ? json(`${dir}/${f}`) : (notes.push(`${dir}/${f}: none (optional)`), null));
  const K = optional('career.json') ?? {}, W = optional('watches.json') ?? {}, V = optional('voices.json');
  // The ship's own voices (`ai`, `ship`) are the carrier's where a ship has none of her own.
  const VS = V ?? (existsSync(path('ships/carrier/voices.json')) ? json('ships/carrier/voices.json') : {});

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

  // ---- the berths ----
  for (const [i, b] of (L.berths ?? []).entries()) {
    const at = `berths[${i}] (${b.id})`, e = 0.011;
    const hg = L.compartments.find((c) => (c.bayDoors ?? []).some((d) => d.side === b.door));
    if (!hg) { problems.push(`${at}: no hangar has a bay door on side "${b.door}"`); continue; }
    if (!existsSync(path(`ships/${b.ship}/index.json`))) { problems.push(`${at}: its ship "${b.ship}" has no folder ships/${b.ship}/`); continue; }
    const S = await loadLayout(path(`ships/${b.ship}`), read);
    if (!S.envelope || !S.dock) { problems.push(`${at}: ships/${b.ship} has no envelope or dock`); continue; }
    if (![0, Math.PI].some((y) => Math.abs(b.yaw - y) < 1e-3)) { problems.push(`${at}: yaw ${b.yaw} (0, bow forward, or π, bow aft)`); continue; }
    const f = b.yaw ? -1 : 1, E = S.envelope, K = S.dock;
    const span = (k) => [b.at[k] + (k === 1 ? 1 : f) * E.min[k], b.at[k] + (k === 1 ? 1 : f) * E.max[k]].sort((p, q) => p - q);
    const [bx, by, bz] = [span(0), span(1), span(2)];
    const floor = L.decks.find((d) => d.id === hg.deck).floor, head = floor + (hg.h ?? 3);
    const short = (what, d) => { if (d < BERTH.clear - e) problems.push(`${at}: ${Math.round(d * 100) / 100} m to ${what} (${BERTH.clear} m clear wanted)`); };
    short('the hangar\'s port wall', bx[0] - hg.x[0]); short('the hangar\'s starboard wall', hg.x[1] - bx[1]);
    short('the hangar\'s forward bulkhead', bz[0] - hg.z[0]); short('the hangar\'s after bulkhead', hg.z[1] - bz[1]);
    short('the hangar floor', by[0] - floor); short('the deckhead', head - by[1]);
    // the gangway, from the airlock's door down the middle
    const lock = L.doors.find((d) => d.between.includes(hg.id) && d.between.some((id) => rooms.get(id)?.airlock));
    const gx = lock?.at ?? 0;
    short('the gangway', Math.min(Math.abs(bx[0] - gx), Math.abs(bx[1] - gx)) - BERTH.gangway);
    if (bx[0] < gx && bx[1] > gx) problems.push(`${at}: she lies across the gangway`);
    // the fighters on her side and their runs out of the door (a strip as wide as a fighter, from the pad to the wall)
    const fw = (L.fighter?.size?.[0] ?? 3.6) / 2;
    for (const [k, p] of (L.fighters ?? []).entries()) {
      if (Math.sign(p.at[0] - gx) !== Math.sign(b.at[0] - gx)) continue;
      short(`fighter pad ${k + 1} and its launch run`, Math.max(bz[0] - (p.at[1] + fw), p.at[1] - fw - bz[1]));
    }
    for (const o of (L.berths ?? []).filter((o) => o !== b && o.box)) short(`${o.id}`, Math.max(bx[0] - o.box.x[1], o.box.x[0] - bx[1], bz[0] - o.box.z[1], o.box.z[0] - bz[1]));
    // her bay door: a clear opening in front of her, and her way out through it
    const d = hg.bayDoors.find((d) => d.side === b.door), mid = (bz[0] + bz[1]) / 2;
    if ((b.out < 0) !== (b.door === 'w')) problems.push(`${at}: out ${b.out} is not the side of door "${b.door}"`);
    if (Math.sign(b.at[0] - gx) !== Math.sign(b.out)) problems.push(`${at}: she is not on the side of the gangway she leaves by`);
    if (d.from > mid - BERTH.door[0] / 2 + e || d.to < mid + BERTH.door[0] / 2 - e) problems.push(`${at}: the bay door (z ${d.from} to ${d.to}) is not open ${BERTH.door[0]} m in front of her (z ${mid - BERTH.door[0] / 2} to ${mid + BERTH.door[0] / 2})`);
    if (d.height < BERTH.door[1]) problems.push(`${at}: the bay door is ${d.height} m high (${BERTH.door[1]} wanted)`);
    if (by[1] > floor + d.height - 1) problems.push(`${at}: she stands ${by[1] - floor} m high, the door ${d.height}`);
    // her docking port: toward the gangway, and where her own layout puts it
    const port = [b.at[0] + f * K.at[0], b.at[1] + K.at[1], b.at[2] + f * K.at[2]];
    if ((b.port ?? []).length !== 3 || port.some((v, k) => Math.abs(v - b.port[k]) > e)) problems.push(`${at}: port [${b.port}] is not her docking port's place [${port.map((v) => Math.round(v * 1000) / 1000)}]`);
    if (Math.abs(port[0] - gx) > Math.abs(b.at[0] - gx)) problems.push(`${at}: her docking port faces away from the gangway`);
    if (b.sill != null && Math.abs(b.sill - (port[1] - K.h / 2)) > e) problems.push(`${at}: sill ${b.sill} is not her port's sill`);
    if (b.skin != null && Math.abs(b.skin - (b.at[0] + f * K.skin)) > e) problems.push(`${at}: skin ${b.skin} is not her skin at the port`);
    if (b.box && [bx, by, bz].some((r, k) => r.some((v, j) => Math.abs(v - b.box['xyz'[k]][j]) > e))) problems.push(`${at}: box is not her envelope in the berth`);
    const hw = Math.max(...L.hull.main.filter((q) => q.z >= bz[0] - 20 && q.z <= bz[1] + 20).map((q) => q.w), 0) / 2;
    if (!(b.clear >= hw + Math.max(-E.min[0], E.max[0]))) problems.push(`${at}: clear ${b.clear} is not clear of the hull (${hw} m half-width) by her half-beam`);
  }
  counts.berths = L.berths?.length ?? 0;

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

  // ---- the player's career (it spans ships) ----
  const glossary = existsSync(path('content/glossary.json')) ? json('content/glossary.json') : null;
  const careerPeople = new Set(); // everyone a career or a layout station names, for the people section below
  for (const s of L.stations ?? []) if (s.person) careerPeople.add(s.person);
  for (const f of existsSync(path(CAREERS)) ? readdirSync(path(CAREERS)).filter((f) => f.endsWith('.json')) : []) {
    const P = json(`${CAREERS}/${f}`), at0 = `${CAREERS}/${f}`;
    const bad = (m) => problems.push(`${at0}: ${m}`);
    if (P.id !== f.slice(0, -5)) bad(`its id is "${P.id}"`);
    if (!P.about?.draft) notes.push(`${at0}: no about.draft (say whether the words are final)`);
    // its ships: a layout each, with her rooms, and what she can play
    const ships = new Map();
    for (const [id, S] of Object.entries(P.ships ?? {})) {
      if (!existsSync(path(`ships/${id}/index.json`))) { bad(`ships.${id}: no folder ships/${id}/`); continue; }
      const SL = id === ship ? L : await loadLayout(path(`ships/${id}`), read);
      const rs = new Map();
      for (const c of SL.compartments) rs.set(c.id, c);
      for (const r of SL.drum?.rooms ?? []) rs.set(r.id, r);
      ships.set(id, { L: SL, rooms: rs, routine: existsSync(path(`ships/${id}/watches.json`)) ? json(`ships/${id}/watches.json`) : null, carried: !!S.page?.berth });
      if (!S.go) bad(`ships.${id}: no go (the card's line when the order is aboard her)`);
      if (S.page?.berth) {
        const hostDir = `ships/${S.page.host}`;
        const HL = existsSync(path(`${hostDir}/index.json`)) ? (S.page.host === ship ? L : await loadLayout(path(hostDir), read)) : null;
        const b = HL?.berths?.find((x) => x.id === S.page.berth);
        if (!b) bad(`ships.${id}.page: host "${S.page.host}" has no berth "${S.page.berth}"`);
        else if (b.ship !== id) bad(`ships.${id}.page: berth ${b.id} holds "${b.ship}"`);
      }
      const m = /^berth:(.+)$/.exec(S.page?.at ?? '');
      if (m && !SL.berths?.some((x) => x.id === m[1])) bad(`ships.${id}.page.at: she has no berth "${m[1]}"`);
    }
    const inRoom = (where, sid, id, at) => {
      const r = ships.get(sid)?.rooms.get(id);
      if (!r) return bad(`${where} names room "${id}", which ships/${sid} does not have`), null;
      if (at && r.x && (at[0] < r.x[0] - 0.05 || at[0] > r.x[1] + 0.05 || at[1] < r.z[0] - 0.05 || at[1] > r.z[1] + 0.05)) bad(`${where} stands at [${at}], outside ${id} (x ${r.x}, z ${r.z})`);
      return r;
    };
    // ranks, quals, unlocks
    const ranks = (P.ranks ?? []).map((r) => r.name), quals = Object.keys(P.quals ?? {}), unlocks = Object.keys(P.unlocks ?? {});
    if (new Set(ranks).size !== ranks.length) bad('ranks: a name twice');
    for (const r of P.ranks ?? []) {
      for (const n of r.nets ?? []) if (!NETS.includes(n)) bad(`rank "${r.name}": net "${n}" (one of ${NETS.join(', ')})`);
      for (const q of r.needs ?? []) if (!quals.includes(q)) bad(`rank "${r.name}" needs "${q}", which is not in quals`);
    }
    for (const u of unlocks) if (!UNLOCKS_SERVICE.includes(u)) bad(`unlocks.${u}: not something the game keeps shut (${UNLOCKS_SERVICE.join(', ')})`);
    for (const [q, Q] of Object.entries(P.quals ?? {})) {
      if (!ships.has(Q.ship)) bad(`quals.${q}: ship "${Q.ship}"`);
      for (const u of Q.unlock ?? []) if (!unlocks.includes(u)) bad(`quals.${q} unlocks "${u}", which is not in unlocks`);
    }
    for (const [sid, R] of Object.entries(P.refuse ?? {})) {
      if (!ships.has(sid)) bad(`refuse.${sid}: not one of its ships`);
      for (const k of Object.keys(R)) if (!unlocks.includes(k)) bad(`refuse.${sid}.${k}: not in unlocks`);
    }
    // people: a file, a ship, a spot aboard her
    const aboard = new Map(); // ship → the ids who stand on her
    for (const p of P.people ?? []) {
      const at = `person ${p.id} (${p.ship})`;
      careerPeople.add(p.id);
      const S = ships.get(p.ship);
      if (!S) { bad(`${at}: ship "${p.ship}" is not one of its ships`); continue; }
      if (aboard.get(p.ship)?.has(p.id)) bad(`${at}: aboard her twice`);
      aboard.set(p.ship, (aboard.get(p.ship) ?? new Set()).add(p.id));
      const st = p.room ? p : (S.L.stations ?? []).find((x) => x.person === p.id);
      if (!st) bad(`${at}: no room of their own and no station of ships/${p.ship} names them (stations[].person)`);
      else inRoom(at, p.ship, st.room, st.at);
      if (st?.pose && !POSES.includes(st.pose)) bad(`${at}: pose "${st.pose}"`);
      const pf = `${PEOPLE}/${p.id}.json`;
      if (!existsSync(path(pf))) { bad(`${pf} is missing`); continue; }
      const who = json(pf);
      if (who.id !== p.id || !who.name || !DEPTS.includes(who.dept)) bad(`${pf}: needs its id, a name and a dept (${DEPTS.join(', ')})`);
      for (const k of ['design', 'gender', 'language', 'style']) if (!who.cast?.[k]) bad(`${pf}: no cast.${k}`);
      if (who.body && existsSync(path('assets/people/index.json')) && !json('assets/people/index.json').people.some((m) => m.name === who.body)) bad(`${pf}: body "${who.body}" is not a model in assets/people/index.json`);
    }
    // where it starts, and where it is picked up
    if (!ranks.includes(P.start?.rank)) bad(`start.rank "${P.start?.rank}" is not in ranks`);
    if (!ships.has(P.start?.ship)) bad(`start.ship "${P.start?.ship}"`);
    else inRoom('start', P.start.ship, P.start.room, P.start.at);
    for (const sid of ships.keys()) {
      if (!P.resume?.[sid]) bad(`resume.${sid}: none (where a career picked up aboard her starts)`);
      else inRoom(`resume.${sid}`, sid, P.resume[sid].room, P.resume[sid].at);
    }
    // the steps
    const spokenK = [['start.say', P.start?.say], ...Object.entries(P.resume ?? {}).map(([k, v]) => [`resume.${k}.say`, v.say]), ...Object.entries(P.ships ?? {}).flatMap(([k, v]) => [[`ships.${k}.go`, v.go], [`ships.${k}.aboard`, v.aboard]]), ['end.order', P.end?.order]];
    for (const [sid, R] of Object.entries(P.refuse ?? {})) for (const [k, v] of Object.entries(R)) spokenK.push([`refuse.${sid}.${k}`, v]);
    (P.steps ?? []).forEach((st, i) => {
      const at = `step ${i + 1} (${st.do}, ${st.ship})`, S = ships.get(st.ship), SL = S?.L;
      if (!S) return bad(`${at}: ship "${st.ship}" is not one of its ships`);
      if (!STEPS_SERVICE.includes(st.do)) bad(`${at}: "${st.do}" is not a step career.mjs runs`);
      if (!st.order) bad(`${at}: no order (the duty card's line)`);
      if (st.who !== undefined && !aboard.get(st.ship)?.has(st.who)) bad(`${at}: who "${st.who}" does not stand aboard ${st.ship} (people)`);
      if (st.do === 'talk' && st.who === undefined) bad(`${at}: a talk step needs a who`);
      if (st.room !== undefined) inRoom(at, st.ship, st.room);
      for (const r of st.rooms ?? []) inRoom(at, st.ship, r);
      if (['go'].includes(st.do) && !st.room) bad(`${at}: no room`);
      if (st.do === 'rounds' && !st.rooms?.length) bad(`${at}: no rooms`);
      if (st.do === 'drill') {
        const kind = SL.damage?.kinds?.[st.kind];
        if (!kind) bad(`${at}: drill kind "${st.kind}" is not in ships/${st.ship}'s damage.kinds`);
        else if (Array.isArray(kind.rooms) && !kind.rooms.includes(st.room)) bad(`${at}: ${st.room} is not a room ships/${st.ship} lists for a ${st.kind} job (${kind.rooms.join(', ')})`);
      }
      if (['muster', 'sleep', 'read'].includes(st.do) && !S.routine) bad(`${at}: ships/${st.ship} has no watches.json (the routine: the muster, your bunk, the watch bill)`);
      if (st.skipTo && !S.routine) bad(`${at}: skipTo needs a ship with a routine`);
      if (st.skipTo && st.skipTo.before == null && st.skipTo.relieved == null) bad(`${at}: skipTo needs before or relieved (minutes)`);
      if (['man', 'shoot', 'obey', 'raid'].includes(st.do) && !SL.weapons?.turrets?.length) bad(`${at}: ships/${st.ship} has no turret`);
      if (['shoot', 'obey'].includes(st.do)) {
        if (!SL.weapons?.target) bad(`${at}: ships/${st.ship} has no weapons.target (the towed sled)`);
        if (!(st.hits > 0)) bad(`${at}: no hits`);
        if (st.from && !['port', 'starboard', 'above', 'below'].includes(st.from)) bad(`${at}: from "${st.from}"`);
      }
      if (st.do === 'obey' && !(st.hold > 0)) bad(`${at}: no hold (seconds under WEAPONS HOLD)`);
      if (st.do === 'obey' && !st.fail) bad(`${at}: no fail (said when you fire against orders)`);
      if (['board'].includes(st.do) && !SL.fighters?.length) bad(`${at}: ships/${st.ship} has no fighters`);
      if (['launch', 'land'].includes(st.do) && !S.carried && !SL.fighters?.length) bad(`${at}: ships/${st.ship} is not carried in a berth and has no fighters`);
      if (st.do === 'land' && st.grade && !GRADES.includes(st.grade)) bad(`${at}: grade "${st.grade}" (${GRADES.join(', ')})`);
      if (st.do === 'transit' && st.at && !(Array.isArray(st.at) && st.at.length === 3)) bad(`${at}: at is [x, y, z]`);
      if (st.do === 'pilot') {
        if (!S.carried) bad(`${at}: ships/${st.ship} is not carried in a berth (the crew pilot flies a carried ship)`);
        if (!Array.isArray(st.plan) || !st.plan.length) bad(`${at}: no plan`);
        for (const leg of st.plan ?? []) {
          if (!LEGS.includes(leg.do)) bad(`${at}: leg "${leg.do}" (${LEGS.join(', ')})`);
          if (leg.do === 'goto' && !(Array.isArray(leg.at) && leg.at.length === 3)) bad(`${at}: a goto leg needs at [x, y, z]`);
          if (leg.do === 'hold' && !(leg.secs > 0)) bad(`${at}: a hold leg needs secs`);
        }
        if (st.until && !(st.plan ?? []).some((leg) => leg.do === st.until)) bad(`${at}: until "${st.until}" is not a leg of its plan`);
        if (!st.self) bad(`${at}: no self (the card's line when there is no crew pilot and you fly it)`);
      }
      if (st.rank && !ranks.includes(st.rank)) bad(`${at}: rank "${st.rank}" is not in ranks`);
      if (st.qual && !quals.includes(st.qual)) bad(`${at}: qual "${st.qual}" is not in quals`);
      for (const u of st.unlock ?? []) if (!unlocks.includes(u)) bad(`${at}: unlock "${u}" is not in unlocks`);
      if (st.run) {
        const first = P.steps.findIndex((x) => x.run === st.run), last = P.steps.findLastIndex((x) => x.run === st.run);
        if (P.steps.slice(first, last + 1).some((x) => x.run !== st.run || x.ship !== st.ship)) bad(`${at}: run "${st.run}" is broken up, or crosses ships`);
      }
      for (const k of ['say', 'start', 'fail', 'tight', 'short', 'rough', 'self', 'order', 'each']) if (st[k]) spokenK.push([`${at} ${k}`, st[k]]);
      for (const [k, v] of Object.entries(st.adrift ?? {})) spokenK.push([`${at} adrift.${k}`, v]);
      if (st.skipTo?.say) spokenK.push([`${at} skipTo.say`, st.skipTo.say]);
    });
    for (const [where, t] of spokenK) for (const a of (t && glossary?.avoid) || []) if (new RegExp(`\\b${a.not.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) bad(`${where} says "${a.not}" (the glossary says "${a.say}"): ${t}`);
    counts.careers = (counts.careers ?? 0) + 1;
    counts.careerSteps = (counts.careerSteps ?? 0) + (P.steps?.length ?? 0);
  }
  // A layout station that names a person: they have a file.
  for (const [i, s] of (L.stations ?? []).entries()) if (s.person && !existsSync(path(`${PEOPLE}/${s.person}.json`))) problems.push(`stations[${i}] names person "${s.person}", who has no ${PEOPLE}/${s.person}.json`);

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

  // ---- the announcements ----
  let calls = new Map();
  if (!existsSync(path(`${CALLS}/index.json`))) problems.push(`${CALLS}/index.json is missing`);
  else {
    const listed = json(`${CALLS}/index.json`).calls;
    for (const id of listed) {
      if (!existsSync(path(`${CALLS}/${id}.json`))) problems.push(`${CALLS}/${id}.json is missing (its index.json lists it)`);
      else calls.set(id, json(`${CALLS}/${id}.json`));
    }
    for (const f of readdirSync(path(CALLS)).filter((f) => f.endsWith('.json') && f !== 'index.json')) if (!listed.includes(f.slice(0, -5))) problems.push(`${CALLS}/${f} is not in its index.json`);
    for (const [id, A] of calls) {
      const at = `${CALLS}/${id}.json`;
      if (A.id !== id) problems.push(`${at}: its id is "${A.id}"`);
      if (!Array.isArray(A.say) || !A.say.length) problems.push(`${at}: no say (its words, as a list of pieces)`);
      for (const [who, by] of Object.entries(A.to ?? {})) {
        if (!AUDIENCES.includes(who)) problems.push(`${at}: to "${who}" is not an audience (${AUDIENCES.join(', ')})`);
        if (!CHANNELS.includes(by)) problems.push(`${at}: to ${who} by "${by}" is not a channel (${CHANNELS.join(', ')})`);
      }
      if (!A.to || !Object.keys(A.to).length) problems.push(`${at}: to nobody`);
      if (!(A.priority >= 1 && A.priority <= 5)) problems.push(`${at}: priority ${A.priority} (1 to 5)`);
      for (const piece of A.say ?? []) for (const [, k] of piece.matchAll(/\{(\w+)\}/g)) if (!SHIP_SLOTS.includes(k) && !A.slots?.[k]) problems.push(`${at}: slot {${k}} is neither the ship's (${SHIP_SLOTS.join(', ')}) nor in slots`);
    }
    // Every call the code makes has a file, and every file is called.
    const made = new Set();
    const walkSrc = (d) => {
      for (const f of readdirSync(path(d), { withFileTypes: true })) {
        if (f.isDirectory()) walkSrc(`${d}/${f.name}`);
        else if (f.name.endsWith('.mjs')) for (const m of readFileSync(path(`${d}/${f.name}`), 'utf8').matchAll(/emit\('call', \{ id: (?:'([\w-]+)'|([^,}]+))/g)) {
          if (m[1]) made.add(m[1]);
          else for (const q of m[2].matchAll(/'([\w-]+)'/g)) made.add(q[1]); // id: a ? 'x' : 'y'
        }
      }
    };
    walkSrc('src');
    // Calls made by a name the code builds (damage-<kind>, an endRaid's id).
    for (const k of Object.keys(L.damage?.kinds ?? {})) made.add(`damage-${k}`);
    made.add('raider-off').add('splash');
    for (const id of made) if (!calls.has(id) && !/^damage-/.test(id)) problems.push(`the code makes the call "${id}", which has no ${CALLS}/${id}.json`);
    for (const k of Object.keys(L.damage?.kinds ?? {})) if (!calls.has(`damage-${k}`)) problems.push(`damage kind "${k}" has no call: ${CALLS}/damage-${k}.json`);
    for (const id of calls.keys()) if (!made.has(id)) notes.push(`${CALLS}/${id}.json: no code makes this call`);
    const warn = L.integrity?.condition?.warn;
    for (const id of ['condition-one', 'condition-one-hull']) if (warn != null && calls.get(id)?.slots?.warn && !calls.get(id).slots.warn.includes(String(warn))) problems.push(`${CALLS}/${id}.json: integrity.condition.warn is ${warn}, not one of its warn values`);
    for (const [net, list] of Object.entries(V?.nets ?? {})) for (const r of list) room(`voices.json nets.${net}`, r);
    counts.calls = calls.size;
  }

  // ---- the glossary ----
  const G = existsSync(path('content/glossary.json')) ? json('content/glossary.json') : null;
  const spoken = [];
  for (const st of K.steps ?? []) for (const k of ['say', 'start', 'fail']) if (st[k]) spoken.push([`career step (${st.do}) ${k}`, st[k]]);
  for (const st of K.steps ?? []) for (const [k, v] of Object.entries(st.adrift ?? {})) spoken.push([`career muster adrift.${k}`, v]);
  for (const k of ['say', 'closed', 'adrift']) if (K.stations?.[k]) spoken.push([`career.stations.${k}`, K.stations[k]]);
  for (const [k, v] of Object.entries(W.pipes ?? {})) spoken.push([`watches.pipes.${k}`, v]);
  for (const [id, A] of calls) for (const piece of A.say ?? []) for (const t of expand(piece, A.slots)) spoken.push([`${CALLS}/${id}.json`, t]);
  if (G) {
    for (const [where, t] of spoken) for (const a of G.avoid ?? []) if (new RegExp(`\\b${a.not.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(t)) problems.push(`${where} says "${a.not}" (the glossary says "${a.say}"): ${t}`);
  } else problems.push('content/glossary.json is missing');

  // ---- people ----
  const callers = [...new Set([...calls.values()].map((a) => a.who))].filter((id) => !VS.speakers?.[id]);
  const ids = [...new Set([...peopleNamed(K, W), ...callers])];
  const people = new Map();
  for (const id of ids) {
    const f = `${PEOPLE}/${id}.json`;
    if (!existsSync(path(f))) { problems.push(`${f} is missing (the career, the routine or an announcement names ${id})`); continue; }
    const p = json(f);
    people.set(id, p);
    if (p.id !== id) problems.push(`${f}: its id is "${p.id}"`);
    if (typeof p.name !== 'string' || !p.name) problems.push(`${f}: no name`);
    if (!DEPTS.includes(p.dept)) problems.push(`${f}: dept "${p.dept}" is not a uniform (${DEPTS.join(', ')})`);
    if (!p.cast) problems.push(`${f}: no cast (the recorded voice: tools/voices.mjs)`);
  }
  const files = existsSync(path(PEOPLE)) ? readdirSync(path(PEOPLE)).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) if (!ids.includes(f.slice(0, -5)) && !careerPeople.has(f.slice(0, -5))) notes.push(`${PEOPLE}/${f}: nobody aboard names this person`);
  counts.people = people.size;

  // ---- the cast ----
  const speakers = { ...Object.fromEntries([...people].map(([id, p]) => [id, p.cast]).filter(([, c]) => c)), ...(VS.speakers ?? {}) };
  if (V) for (const k of ['ship', 'ai']) if (!V.speakers?.[k]) problems.push(`${dir}/voices.json: no speakers.${k}`);
  for (const [id, S] of Object.entries(speakers)) for (const k of ['design', 'gender', 'language', 'style']) if (!S?.[k]) problems.push(`speaker ${id}: no ${k} in their cast`);
  for (const id of Object.keys(V?.speakers ?? {})) if (people.has(id)) problems.push(`${dir}/voices.json: ${id} is a person; their cast goes in ${PEOPLE}/${id}.json`);
  if (existsSync(path('assets/voice/index.json'))) {
    const lines = Object.keys(json('assets/voice/index.json').lines ?? {});
    const unknown = [...new Set(lines.map((k) => k.split('|')[0]).filter((s) => !speakers[s]))];
    // The archived first carrier's speakers keep their clips (tools/voices.mjs says both carriers' lines).
    const v1 = existsSync(path('archive/carrier-v1/carrier-v1.career.json')) ? new Set(json('archive/carrier-v1/carrier-v1.career.json').people.map((p) => p.id)) : new Set();
    // A ship with no career names no officers: the clips are another ship's people's (content/people/), not hers to check.
    const others = K.people ? new Set() : new Set(files.map((f) => f.slice(0, -5)));
    for (const s of unknown) if (!others.has(s)) (v1.has(s) ? notes : problems).push(`assets/voice/index.json has clips by "${s}", ${v1.has(s) ? "the archived first carrier's" : 'who is not a speaker'}`);
    counts.clips = lines.length;
    // What is said without a clip is shown, not heard.
    const have = new Set(lines);
    const want = callLines(calls, L).map((l) => `${l.speaker}|${l.text}`);
    const missing = [...new Set(want)].filter((k) => !have.has(k));
    if (missing.length) notes.push(`${missing.length} of the calls' ${new Set(want).size} pieces have no clip yet (shown as subtitles, not spoken): node tools/voices.mjs --list`);
  }
  return { problems, notes, counts };
}

// ---- run from the command line ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const quiet = process.argv.includes('--quiet');
  const ship = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'carrier';
  const { problems, notes, counts } = await check({ ship });
  if (!quiet) {
    console.log(`Checked ships/${ship}: ${counts.rooms} rooms, ${counts.berths ? `${counts.berths} berths, ` : ''}${counts.steps} career steps${counts.careers ? ` (and the player's career: ${counts.careerSteps} steps across ships)` : ''}, ${counts.people} people, ${counts.calls ?? 0} announcements, ${counts.clips ?? 0} recorded clips.`);
    for (const n of notes) console.log(`  note: ${n}`);
  }
  if (problems.length) {
    console.log(`${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else if (!quiet) console.log('No problems.');
}
