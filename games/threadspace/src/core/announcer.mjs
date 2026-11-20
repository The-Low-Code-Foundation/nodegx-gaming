// The ship's announcer (design/ROADMAP.md, phase 3): every call a ship makes, who hears it, and how.
//
// A system says what happened on the bus as a call: `C.bus.emit('call', { id: 'damage-fire', room: 'gym', … })`. The
// call's file (content/announcements/<id>.json) says who speaks it, its words, who it is for and by what channel, and
// how much it matters. The announcer decides whether it reaches you, where you are and who you are, and if it does it
// plays the recording and puts the words up as a subtitle. A line that was never recorded is a subtitle with no sound:
// the browser never speaks.
//
// An announcement:
//
//   about     what makes the call, and where in the code (for whoever edits it)
//   who       the speaker: `ai` (the ship's automated voice), `ship` (the bridge's talker), or a person's id
//   say       its words, as pieces played one after another. A piece is fixed text, or has `{slot}`s in it:
//             `{room}`, `{deck}` and `{section}` are the ship's words for the call's `room` (recorded one by one, so
//             the ship's voice can name any room), and any other slot is listed in `slots`, every value recorded
//             whole. `slots.<name>` as a string, not a list, means the words are recorded from elsewhere (the
//             career's lines, the watch pipes: tools/voices.mjs) and passed in as they are.
//   show      the subtitle, with the same slots and `{say}` (the words said); without it, the words said. false: no
//             subtitle (the routine puts its pipes on its own strip).
//   to        who it is for, and by what: { audience: channel }. Audiences: `all`; `you` (said to you); `zone` (the
//             part of the ship the call's room is in: the bow, a drum, the hangar, the stern); `drums` (anyone in a
//             drum); a department (`bridge`, `dc`, `engineering`, `flight`, `gunners`, `medical`). Channels: `tannoy`
//             (heard in a room with a speaker and air, or in your helmet when it is sealed), `headset` (your
//             department's net, anywhere aboard), `radio` (the cockpit, and flight control's speakers).
//   priority  1 (routine) to 5 (brace): a call cuts off a lower one that is playing, and the queue goes highest first.
//   delay     seconds after the call before it is said (after its alarm).
//   again     seconds before the same call, with the same words, may be said again (default 8): say it once.
//   alarm     { cue, n, near }: the sound before it (`sfx.cue`). `near`: heard in its room and, fainter, its zone only.
//
// Departments you are in: your rank's (`career.json` `stations.ranks.<rank>.depts`; free roam is in all of them), and
// the seat or room you are in (`nets` in the ship's voices.json: the bridge's rooms are on the bridge's net).

export const CALLS = 'content/announcements';
export const AUDIENCES = ['all', 'you', 'zone', 'drums', 'bridge', 'dc', 'engineering', 'flight', 'gunners', 'medical'];
export const CHANNELS = ['tannoy', 'headset', 'radio'];
export const DEPTS = ['bridge', 'dc', 'engineering', 'flight', 'gunners', 'medical'];
export const SHIP_SLOTS = ['room', 'deck', 'section'];

/** Every announcement in `CALLS`, by the folder's index: a Map by id. `read(path)` reads a JSON file. */
export async function loadCalls(read, dir = CALLS) {
  const ids = (await read(`${dir}/index.json`)).calls;
  const calls = await Promise.all(ids.map((id) => read(`${dir}/${id}.json`)));
  return new Map(calls.map((a) => [a.id, a]));
}

// --- the ship's words for a place (the game and tools/voices.mjs both use these, so a room's piece is found) ---

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** The ship's spoken name of a room: a drum's numbered rooms by their kind ("Marines 3" is "Marines."), a spare as an
 *  empty compartment, a ring corridor as a ring corridor (its drum and deck are the `{deck}` piece). */
export function spokenRoom(room) {
  if (!room?.name) return null;
  if (room.drum && room.seg == null) return 'Ring corridor.';
  let n = room.name.replace(/[’']/g, "'");
  if (room.drum) {
    if (/^spare/i.test(n)) return 'Empty compartment.';
    n = n.replace(/\s+\d+$/, '');
  }
  return `${cap(n)}.`;
}

/** The ship's spoken deck of a room: a fixed deck's name, or a drum's ("Forward drum, outer deck."). */
export function spokenDeck(L, room) {
  if (!room) return null;
  if (room.drum) {
    const h = L.drum?.halves.find((x) => x.id === room.half), d = L.drum?.decks.find((x) => x.id === (room.ring ?? room.deck));
    return h && d ? `${h.name}, ${d.name.toLowerCase()}.` : null;
  }
  const d = L.decks?.find((x) => x.id === room.deck);
  return d ? `${d.name}.` : null;
}

/** The part of the ship a room is in (`L.sections`: the bow, each drum, the hangar, the stern), or null. */
export function sectionOf(L, room) {
  if (!room || !L.sections) return null;
  if (room.drum) return L.sections.find((s) => s.id === `drum-${room.half}`) ?? null;
  if (!room.z) return null;
  const z = (room.z[0] + room.z[1]) / 2;
  return L.sections.find((s) => z >= s.z[0] && z < s.z[1]) ?? null;
}

/** A section's name as said in a sentence ("the bow section", "the forward drum"), and as the ship's piece. */
export function sectionName(L, s) {
  if (!s) return null;
  if (s.type === 'drum') return L.drum?.halves.find((h) => `drum-${h.id}` === s.id)?.name.toLowerCase() ?? s.id;
  return `${s.id} section`;
}
export const spokenSection = (L, s) => (s ? `${cap(sectionName(L, s))}.` : null);

/** Every room the ship's voice can name, with its deck and section pieces: the walkable compartments, the drums'
 *  rooms and their ring corridors. */
export function shipWords(L) {
  const rooms = [...(L.compartments ?? []).filter((c) => c.access === 'walk')];
  for (const r of L.drum?.rooms ?? []) rooms.push({ ...r, drum: true });
  for (const h of L.drum?.halves ?? []) for (const d of L.drum.decks) rooms.push({ id: `ring-${h.id}-${d.id}`, name: 'Ring corridor', drum: true, half: h.id, ring: d.id, seg: null });
  const words = { room: new Set(), deck: new Set(), section: new Set() };
  for (const r of rooms) {
    words.room.add(spokenRoom(r));
    words.deck.add(spokenDeck(L, r));
  }
  for (const s of L.sections ?? []) words.section.add(spokenSection(L, s));
  for (const k of Object.keys(words)) words[k].delete(null);
  return words;
}

/** Every text a piece can be: its slots filled with each of their values in turn. */
export function expand(piece, slots = {}) {
  let out = [piece];
  for (const [name, values] of Object.entries(slots)) {
    if (!Array.isArray(values) || !piece.includes(`{${name}}`)) continue;
    out = out.flatMap((t) => values.map((v) => t.replaceAll(`{${name}}`, v)));
  }
  return out;
}

/** Every line the calls `calls` can say, for the recorder: [{ speaker, text }], one per piece (a piece that is only a
 *  slot recorded from elsewhere is left out). */
export function callLines(calls, L) {
  const words = shipWords(L), out = [];
  for (const A of calls.values()) {
    for (const piece of A.say ?? []) {
      const only = piece.match(/^\{(\w+)\}$/)?.[1];
      if (only && SHIP_SLOTS.includes(only)) for (const w of words[only]) out.push({ speaker: A.who, text: w });
      else if (only && typeof A.slots?.[only] === 'string') continue;
      else for (const t of expand(piece, A.slots)) out.push({ speaker: A.who, text: t });
    }
  }
  return out;
}

// --- the announcer ---

export class Announcer {
  /** `calls`: the announcements (`loadCalls`). `voices`: voice.mjs, which plays the clips. `sfx`: the alarms.
   *  `speakers`: id → { label } for the subtitle. `nets`: dept → the rooms on its net (voices.json). `el`: the
   *  subtitle's element. `airOf(room)` and `unsafe`: a room's air, and below what a speaker in it is not heard. */
  constructor(C, calls, { voices, sfx, speakers = {}, nets = {}, el = null, airOf = () => 100, unsafe = 30 } = {}) {
    this.C = C;
    this.L = C.L;
    this.calls = calls;
    this.voices = voices;
    this.sfx = sfx;
    this.speakers = speakers;
    this.nets = nets;
    this.el = el;
    this.airOf = airOf;
    this.unsafe = unsafe;
    this.now = 0;
    this.queue = [];
    this.playing = null; // { item, handle, end }
    this.said = new Map(); // a call's words → when they were last said
    this.sub = { t: 0 };
    this.log = []; // what was called, and whether it reached you (the last 50)
    /** Where you are and who you are: { mode, room, sealed, depts: Set }. main.mjs sets it. */
    this.you = () => ({ mode: 'walk', room: null, sealed: false, depts: new Set(DEPTS) });
    C.bus?.on('call', (e) => this.call(e.id, e));
  }

  /** The call `id` is made, with `vars` for its slots (`room` a room's id). */
  call(id, vars = {}) {
    const A = this.calls.get(id);
    if (!A) return console.warn(`no announcement "${id}" (${CALLS}/${id}.json)`);
    // The call's place: a room by id, or (`z`, metres along her) only a point along the ship, for its section.
    const room = vars.room ? this.C.rooms.get(vars.room) ?? null : vars.z != null ? { z: [vars.z, vars.z] } : null;
    const words = this.words(A, vars, room);
    const key = `${id}|${words.join(' ')}`;
    const you = this.you();
    // The alarm sounds whether or not the words reach you: it is a sound in the ship.
    if (A.alarm) this.alarm(A.alarm, room, you);
    const by = this.reaches(A, room, you);
    this.log.push({ id, t: this.now, heard: by });
    if (this.log.length > 50) this.log.shift();
    if (!by) return;
    if (this.now - (this.said.get(key) ?? -Infinity) < (A.again ?? 8)) return;
    this.said.set(key, this.now);
    const text = A.show === false ? null : this.fill(A.show ?? '{say}', vars, room, words.join(' '));
    const item = { A, id, words, text, by, pri: A.priority ?? 2, at: this.now + (A.delay ?? 0), made: this.now };
    this.queue.push(item);
    this.queue.sort((a, b) => b.pri - a.pri || a.made - b.made);
  }

  /** The words said, piece by piece. A ship's slot it has no word for is left out. */
  words(A, vars, room) {
    const ship = { room: spokenRoom(room), deck: spokenDeck(this.L, room), section: spokenSection(this.L, sectionOf(this.L, room)) };
    const out = [];
    for (const piece of A.say ?? []) {
      let t = piece, gap = false;
      t = t.replace(/\{(\w+)\}/g, (_, k) => {
        const v = SHIP_SLOTS.includes(k) && !A.slots?.[k] ? ship[k] : vars[k];
        if (v == null) gap = true;
        return v ?? '';
      });
      if (!gap && t.trim()) out.push(t.trim());
    }
    return out;
  }

  /** The subtitle: `show` with its slots, `{say}` the words, and the room and deck by their names. */
  fill(show, vars, room, said) {
    const names = { say: said, room: room?.name?.toLowerCase(), Room: room?.name, deck: room ? this.C.deckName?.(room.deck) : null, section: sectionName(this.L, sectionOf(this.L, room)) };
    return show.replace(/\{(\w+)\}/g, (_, k) => String(names[k] ?? vars[k] ?? '')).replace(/\s+/g, ' ').trim();
  }

  /** The channel the call reaches you by, or null. */
  reaches(A, room, you) {
    for (const [who, by] of Object.entries(A.to ?? {})) if (this.member(who, room, you) && this.carries(by, you)) return by;
    return null;
  }

  member(who, room, you) {
    if (who === 'all' || who === 'you') return true;
    const here = you.room ? this.C.rooms.get(you.room) : null;
    if (who === 'zone') return !!room && !!here && sectionOf(this.L, room)?.id === sectionOf(this.L, here)?.id;
    if (who === 'drums') return !!here?.drum;
    return you.depts.has(who) || (!!you.room && (this.nets[who] ?? []).includes(you.room));
  }

  carries(by, you) {
    const flying = you.mode === 'fighter';
    if (by === 'radio') return flying || ['flight-control', 'flight-ops'].includes(you.room);
    if (flying) return false;
    if (by === 'headset') return true;
    // The tannoy: a speaker in every walkable room and passage, heard where there is air to carry it, or through your
    // helmet's radio when it is sealed. Between rooms (a ladder, a lift, the hub) the trunks have speakers too.
    if (you.sealed || !you.room) return true;
    return this.airOf(you.room) > this.unsafe;
  }

  /** The alarm's sound: everywhere aboard, or (`near`) in its room and fainter in its zone. */
  alarm({ cue, n = 3, near = false, vol = 1 }, room, you) {
    if (!this.sfx || you.mode === 'fighter') return;
    let v = vol;
    if (near) {
      const here = you.room ? this.C.rooms.get(you.room) : null;
      v *= here === room ? 1 : here && room && sectionOf(this.L, here)?.id === sectionOf(this.L, room)?.id ? 0.35 : 0;
    }
    if (you.room && !you.sealed && this.airOf(you.room) <= this.unsafe) v *= 0.15; // through the deck, not the air
    if (v > 0.02) this.sfx.cue(cue, { n, vol: v });
  }

  /** Each frame: the queue, a higher call cutting in, and the subtitle. */
  frame(dt) {
    this.now += dt;
    // Calls that waited too long are old news: routine ones after 12 s, a damage call after 40, and the ones that
    // matter most (priority 4 and 5) never.
    this.queue = this.queue.filter((q) => q.pri >= 4 || this.now - q.at < (q.pri >= 3 ? 40 : 12));
    const next = this.queue.find((q) => q.at <= this.now);
    if (next && (!this.playing || next.pri > this.playing.item.pri)) {
      if (this.playing) this.playing.handle?.stop();
      this.queue.splice(this.queue.indexOf(next), 1);
      this.start(next);
    }
    if (this.playing && this.now >= this.playing.end) this.playing = null;
    if (this.sub.t > 0 && (this.sub.t -= dt) <= 0 && this.el) this.el.hidden = true;
  }

  start(item) {
    const files = this.voices?.piecesOf(item.A.who, item.words);
    // Long enough to read when there is no sound; the clip's end when there is (or this, if it never says).
    const read = 1.2 + (item.text ?? item.words.join(' ')).length * 0.055;
    const playing = { item, handle: null, end: this.now + read };
    if (files && this.voices.on) {
      playing.end = this.now + 60;
      playing.handle = this.voices.play('broadcast', files, () => this.playing === playing && (playing.end = this.now + 0.4));
    }
    this.playing = playing;
    if (item.text && this.el) {
      const S = this.speakers[item.A.who];
      this.el.innerHTML = `<b class="${item.by}">${S?.label ?? item.A.who}</b>${item.text}`;
      this.el.hidden = false;
      this.sub.t = Math.max(read, 3);
    }
  }
}
