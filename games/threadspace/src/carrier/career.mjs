// The career: your first week aboard as the most junior hand on the ship, from `ships/carrier/career.json`. Officers
// stand at their posts (`people`) and give you orders (`steps`), one at a time: report to someone, find a room, put out
// a drill fire, mend a drill fault, man a turret, hit a towed target and then a raider yourself, fly a fighter home down the lane, turn the
// ship at the helm. Each order done can promote you (`rank`) and open a part of the ship to you (`unlock`): the turret
// hatches, the raids, the fighters, the helm. Until then, `allows()` says no and `refuse()` says why.
//
// The duty card (`#c-duty`) carries your rank, the order, where to go (deck, frame, side, and a floor line when one
// runs there), how far along you are, and the last thing you were told. A gold chevron hangs over the officer you are
// to report to, and a gold marker shows the place in the cutaway. Progress is kept in localStorage; a career picked up
// again starts in your bunk, at the order you were on (an order that needs a seat backs up to the one that sits you in it).
//
// Free roam (`free()`) is everything open from the start, as the prototype was before.
//
// Two kinds of career file:
//
// - **The player's career** (`content/careers/<id>.json`, the default: `service`). It spans ships: every step names the
//   `ship` it happens on, every person the ship they stand on. `loadCareer` gives it to a page as seen from the ship
//   that page runs (`K.here`): only her people come aboard. A step for another ship shows on the card as where to go
//   (`ships.<id>.go`) with the marker on the way across (the berth's port, or her own docking port), and completes
//   nothing here. Its save is part of the voyage (src/core/voyage.mjs, `voyage.career`: rank, step, qualifications,
//   unlocks, flags, the book, the clock), written by both pages. Unlocks are per ship (`cutter:helm`): a seat earned
//   on the cutter opens nothing on the carrier. A qualification (`qual` on a step, `quals` in the file) is its own
//   flag, apart from rank, and opens the seats it lists. `arrive()` picks the career up on the far side of an airlock.
// - **A ship's own career** (`ships/<id>/career.json`, with `?career=ship`): the carrier's first week, one ship, saved
//   under its own key (`Career.key`). The scripted `career` check plays it; nothing about it has changed.
//
// Step kinds added for the player's career (the others are in the file's `about`): `pilot` (the crew pilot,
// `G.pilot`, flies `plan`; done when the plan ends, or when a leg of kind `until` begins; with no pilot in the build the card asks
// you to fly it yourself: `self`), `obey` (fire control: a target sled under WEAPONS HOLD for `hold` seconds, then
// TIGHT and `hits` hits; a round against orders goes in the book and the step starts again), and on a carried ship
// `launch` (out of her berth by your own hand), `transit` with `at` (a point in the host's frame) and `land` (a
// capture you flew, graded `grade` or better: `berth.lastRecovery`).

import * as THREE from 'three';
import { crewMember, outfitFor } from './crew.mjs';
import { floatIn, floatStep } from './floating.mjs';
import { frameOf, sideOf } from './wayfinding.mjs';
import { fmt as fmtTime } from './watch.mjs';
import { drumToShip } from './drum.mjs';
import { loadVoyage, saveVoyage, setShip } from '../core/voyage.mjs';

const KEY = 'threadspace.carrier.career'; // the spin-drum carrier's; another ship's career saves under its own (`Career.key`)
const ALL = ['guns', 'raids', 'fighters', 'helm'];
// A step that needs you in a seat, picked up again after a reload, backs up to the step that seats you.
// (The gunnery steps need no backing up: out of the turret, their card sends you back up into it.)
const BACK = { launch: 'board', land: 'board', turn: 'helm', transit: 'helm', muster: 'sleep' };
const GOLD = new THREE.MeshBasicMaterial({ color: '#ffc850', transparent: true, opacity: 0.85, toneMapped: false, depthTest: false });
const CHEVRON = new THREE.MeshBasicMaterial({ color: '#ffc850', toneMapped: false });
const _v = new THREE.Vector3();
export const CAREERS = 'content/careers';
export const SERVICE = 'service'; // the career a page loads unless told otherwise
export const GRADES = ['clean', 'fair', 'rough']; // a capture's grade, best first (recovery.mjs `grade`)

/** The career for the page that runs ship `ship` (her folder `dir`, her layout `L`): with `?career=ship`, her own
 *  `career.json` (or null); otherwise the player's career `?career=<id>` (default `service`) as seen from her, or null
 *  if it does not know her. `read` reads a JSON file. */
export async function loadCareer({ q, ship, dir, L, read }) {
  const want = q.get('career');
  if (want === 'ship') return read(`${dir}/career.json`).catch(() => null);
  const K = await read(`${CAREERS}/${/^[a-z0-9-]+$/.test(want ?? '') ? want : SERVICE}.json`).catch(() => null);
  return K?.ships?.[ship] ? careerFor(K, ship, L) : null;
}

/** The player's career `K` as seen from ship `ship`: `here` set, and only the people who stand aboard her, each at
 *  their spot (their own `room` and `at`, or the layout station that names them: `stations[].person`). */
export function careerFor(K, ship, L) {
  const post = (p) => {
    if (p.room) return p;
    const s = (L.stations ?? []).find((x) => x.person === p.id);
    return s ? { room: s.room, at: s.at, yaw: s.yaw, pose: s.pose, ...p } : p;
  };
  return { ...K, here: ship, people: (K.people ?? []).filter((p) => p.ship === ship).map(post) };
}

export class Career {
  /** `K` the career file. `ctx`: `dc` (damage control: the drills, the speakers), `ship` (integrity: a raid),
   *  `guns` (the raider, and your hits on it), `fighter`, `obj` (the carrier's Object3D, for her heading), `body`
   *  (her rigid body, for her turn rate), `sfx`, `voices` (voice.mjs: who says what aloud). */
  constructor(C, K, { dc, ship, guns, fighter, obj, body, sfx, voices = null, G = null }) {
    Object.assign(this, { C, L: C.L, K, dc, ship, guns, fighter, obj, body, sfx, voices, G });
    this.here = K.here ?? null; // the ship this page runs, when the career is the player's (it spans ships)
    this.voy = !!K.here; // saved in the voyage, unlocks per ship
    this.ALL = this.voy ? Object.keys(K.ships).flatMap((s) => Object.keys(K.unlocks ?? {}).map((u) => `${s}:${u}`)) : ALL;
    this.quals = new Set();
    this.flags = {};
    this.checkFire = 0; // rounds against fire control's orders, as incidents: the other page of the book
    this.skipped = -1; // the step whose `skipTo` has been done
    this.routine = null; // the ship's routine (watch.mjs): the clock, your watch, the muster
    this.on = false;
    this.i = 0;
    this.rank = K.start.rank;
    this.unlocked = new Set(this.ALL);
    this.s = null; // the step in hand's own state
    this.msg = null; // { who, text, t }
    this.el = document.getElementById('c-duty');
    this.markScale = 1;
    this.marker = marker();
    C.overlay.add(this.marker);
    C.bus?.on('job-end', ({ job, ok }) => this.jobEnded(job, ok));
    // The crew pilot (pilot.mjs): which leg she is on, and the end of her plan.
    C.bus?.on('pilot-leg', (e) => this.on && this.step?.do === 'pilot' && this.s?.phase === 'on' && (this.s.leg = e));
    C.bus?.on('pilot-done', (e) => this.on && this.step?.do === 'pilot' && this.s?.phase === 'on' && (e.ok || this.s.onT > 0.5) && (this.s.over = e));
    this.people = new Map();
    this.place();
  }

  // --- the officers ---

  place() {
    const crewCount = this.L.stations.length;
    // A layout station that names a person (`stations[].person`) is theirs: the nameless crew leave it (crew.mjs `boardCrew`).
    this.C.named = new Set(this.K.people.map((p) => p.id));
    this.K.people.forEach((p, k) => {
      const room = this.C.rooms.get(p.room);
      const seg = p.seg ?? room.seg; // a drum room: its segment's Interior, in that segment's frame (drum.mjs)
      const I = this.C.interiorOf(room, seg);
      const who = { ...p, deck: room.deck, seg, I, m: null };
      this.people.set(p.id, who);
      const u = I.use(`talk-${p.id}`, `Talk to ${p.name}`, p.at[0], p.at[1], () => this.talked(p.id), { r: 2.4, y: I.floorY + 1.5 });
      u.hidden = () => !this.on;
      // The chevron over the head of the one you are to report to.
      who.chevron = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), CHEVRON);
      who.chevron.rotation.x = Math.PI;
      who.chevron.position.set(p.at[0], I.floorY + 2.2, p.at[1]);
      who.chevron.visible = false;
      I.group.add(who.chevron);
      crewMember(p.body ?? crewCount + k, p.dept, { outfit: outfitFor(room) }) // the duty suit, or in a drum the uniform; `body`: the same model on every ship
        .then((m) => {
          m.root.position.set(p.at[0], I.floorY, p.at[1]);
          m.root.rotation.y = p.yaw ?? 0;
          I.group.add(m.root);
          if (this.C.clipPlanes) m.root.traverse((o) => o.material && [o.material].flat().forEach((x) => (x.clippingPlanes = this.C.clipPlanes)));
          m.deck = room.deck;
          floatIn(m, room);
          m.play(p.pose ?? 'idle');
          who.m = m;
        })
        .catch((e) => console.warn(`${p.name} could not come aboard`, e));
    });
  }

  /** The officers' clips play where they are being drawn (`drawn(person)`). */
  tickPeople(dt, drawn) {
    for (const p of this.people.values()) if (p.m && drawn(p)) p.m.update(dt), p.m.float && floatStep(p.m, dt);
  }

  // --- starting, saving ---

  /** The saved career, if it was saved against these steps (`K`): a career saved before the steps changed is not
   *  picked up again, as its step number would land on the wrong order. */
  static key = KEY;

  /** The career of a ship that has none (no career.json): nobody to report to, no orders, nothing refused. It is never
   *  begun (`on` stays false), so everything aboard is open, as in free roam. */
  static none = { start: { rank: '' }, people: [], steps: [], refuse: {} };

  static saved(K) {
    if (K?.here) {
      // The player's career: part of the voyage.
      const s = loadVoyage().career;
      return s && s.id === K.id && s.n === K.steps.length ? s : null;
    }
    try {
      const s = JSON.parse(localStorage.getItem(Career.key));
      return s && (!K || s.n === K.steps.length) ? s : null;
    } catch {
      return null;
    }
  }

  static forget() {
    try {
      localStorage.removeItem(Career.key);
    } catch {}
  }

  /** Into the career, fresh or where it was left. Returns where you start: { deck, x, z, yaw }. */
  begin(fresh = false) {
    if (this.voy) return this.beginVoyage(fresh);
    const s = fresh ? null : Career.saved(this.K);
    this.on = true;
    this.i = Math.min(s?.i ?? 0, this.K.steps.length);
    this.rank = s?.rank ?? this.K.start.rank;
    this.book = s?.book ?? 0; // times adrift from muster: your name in the leading hand's book
    this.unlocked = new Set(s?.unlocked ?? []);
    const back = BACK[this.step?.do];
    if (back) while (this.i > 0 && this.step.do !== back) this.i--;
    if (s?.clock != null) this.routine?.setTime(s.clock);
    this.enter();
    if (!s || !this.i) {
      this.tell(null, this.K.start.say, 14);
      const S = this.K.start, sr = S.room && this.C.rooms.get(S.room);
      return { deck: sr ? sr.deck : S.deck, x: S.at[0], z: S.at[1], yaw: S.yaw, seg: S.seg ?? sr?.seg };
    }
    const r = this.C.rooms.get(this.K.resume.room), at = this.K.resume.at;
    this.tell(null, this.K.resume.say, 8);
    if (this.ship && r?.drum) (this.ship.suit = false), (this.ship.helmet = false); // you wake in your bunk, out of your suit
    return { deck: r.deck, x: at ? at[0] : (r.x[0] + r.x[1]) / 2, z: at ? at[1] : (r.z[0] + r.z[1]) / 2, yaw: this.K.resume.yaw ?? 0, seg: r.seg };
  }

  /** The player's career, from the start screen. Fresh, it starts on `start.ship`; carried on, on the ship the voyage
   *  says you are aboard. If that is not this page's ship, returns { aboard, params, line } for `goAboard` and begins
   *  nothing here. Otherwise as `begin`: where you start. */
  beginVoyage(fresh) {
    const K = this.K, v = loadVoyage();
    const s = fresh ? null : Career.saved(K);
    const where = s?.i ? v.aboard : K.start.ship;
    if (where !== this.here && K.ships[where]) {
      if (!s) delete v.career; // a fresh start begins on the other page
      delete v.roam;
      saveVoyage(v);
      // (carried on: aboard her, as her page takes you; fresh: her start screen)
      return { aboard: where, params: s ? K.ships[where].page ?? {} : {}, line: s ? K.ships[where].crossing : undefined };
    }
    this.take(s);
    if (!s || !this.i) {
      this.tell(null, K.start.say, 14);
      const S = K.start, sr = this.C.rooms.get(S.room);
      if (this.ship && sr?.drum) (this.ship.suit = false), (this.ship.helmet = false); // you wake in your bunk, out of your suit
      return { deck: sr.deck, x: S.at[0], z: S.at[1], yaw: S.yaw ?? 0, seg: S.seg ?? sr.seg };
    }
    const R = K.resume[this.here], r = this.C.rooms.get(R.room), at = R.at;
    this.tell(null, R.say, 8);
    if (this.ship && r?.drum) (this.ship.suit = false), (this.ship.helmet = false);
    return { deck: r.deck, x: at ? at[0] : (r.x[0] + r.x[1]) / 2, z: at ? at[1] : (r.z[0] + r.z[1]) / 2, yaw: R.yaw ?? 0, seg: r.seg };
  }

  /** Takes up the player's career from its save `s` (null: from the start) on this ship, where you stand. */
  take(s) {
    const K = this.K;
    this.on = true;
    this.i = Math.min(s?.i ?? 0, K.steps.length);
    this.rank = s?.rank ?? K.start.rank;
    this.book = s?.book?.late ?? 0;
    this.checkFire = s?.book?.checkFire ?? 0;
    this.quals = new Set(s?.quals ?? []);
    this.flags = { ...(s?.flags ?? {}) };
    this.unlocked = new Set(s?.unlocked ?? []);
    this.skipped = s?.skip ?? -1;
    // A run of steps that needs her out of her berth, or you in a seat (`run`), starts again from its first step.
    const run = this.step?.run;
    if (run && this.step.ship === this.here) while (this.i > 0 && K.steps[this.i - 1].run === run) this.i--;
    if (s?.clock != null) this.routine?.setTime(s.clock);
    const v = loadVoyage();
    v.aboard = this.here;
    delete v.roam;
    saveVoyage(v);
    // She is on her cradle whenever her page loads: the voyage may still say she was out when the page was shut.
    const P = K.ships[this.here]?.page;
    if (P?.berth && this.berth?.phase === 'berthed') setShip(`${P.host}/${P.berth}`, { ship: this.here });
    this.enter();
    this.save();
  }

  /** You came aboard through an airlock (main.mjs: the docking port, `?at=berth:<id>`, the sick bay after a wreck):
   *  the player's career goes on where you stand, if the voyage has one in hand; otherwise free roam. */
  arrive() {
    if (!this.voy) return this.free();
    const s = Career.saved(this.K);
    if (!s || loadVoyage().roam) return this.free(false);
    this.take(s);
    const line = this.K.ships[this.here]?.aboard;
    if (line && !this.msg) this.tell(null, line, 6); // (unless the order in hand had something to say: a clock skip)
  }

  /** Free roam: no orders, the whole ship open. (`note`: the voyage remembers it, so the next ship is free roam too.) */
  free(note = true) {
    this.on = false;
    this.unlocked = new Set(this.ALL);
    if (this.el) this.el.hidden = true;
    if (this.voy && note) {
      const v = loadVoyage();
      v.roam = true;
      saveVoyage(v);
    }
  }

  save() {
    if (this.voy) {
      const v = loadVoyage();
      v.career = {
        id: this.K.id, n: this.K.steps.length, i: this.i, rank: this.rank, quals: [...this.quals], unlocked: [...this.unlocked], flags: this.flags,
        book: { late: this.book ?? 0, checkFire: this.checkFire }, clock: this.routine?.t, skip: this.skipped
      };
      return saveVoyage(v);
    }
    try {
      localStorage.setItem(Career.key, JSON.stringify({ i: this.i, n: this.K.steps.length, rank: this.rank, unlocked: [...this.unlocked], clock: this.routine?.t, book: this.book ?? 0 }));
    } catch {}
  }

  get step() {
    return this.K.steps[this.i] ?? null;
  }

  get done() {
    return this.on && this.i >= this.K.steps.length;
  }

  /** The step in hand is for another ship: the card says where to go, and nothing completes here. */
  get away() {
    return this.voy && !!this.step && this.step.ship !== this.here;
  }

  /** The berth this ship is carried in (berth.mjs), and her crew pilot (pilot.mjs): made after the career, so read late. */
  get berth() {
    return this.G?.berth ?? null;
  }

  get pilot() {
    return this.G?.pilot ?? null;
  }

  /** The nets your rank is on (src/core/announcer.mjs): which of the ship's calls reach you over your headset. */
  get nets() {
    return this.K.stations?.ranks?.[this.rank]?.depts ?? this.K.ranks?.find((r) => r.name === this.rank)?.nets ?? [];
  }

  /** An unlock's name in `unlocked`: the player's career keeps them per ship (`cutter:helm`). */
  uk(what, ship = this.here) {
    return this.voy ? `${ship}:${what}` : what;
  }

  allows(what) {
    return this.unlocked.has(this.uk(what));
  }

  refuse(what) {
    this.tell(null, (this.voy ? this.K.refuse?.[this.here] : this.K.refuse)?.[what] ?? 'Not yet.', 6);
    this.sfx?.cue('clunk', { vol: 0.3 });
  }

  /** A key the career keeps from the seat (main.mjs `onAction`): L at the helm of a carried ship, launch and recovery
   *  by your own hand, until you have `launch` (or the order in hand has you fly: a `pilot` step with no pilot). */
  blocks(code, mode) {
    // J (the crew's pilot takes her for a circuit, or gives her back) is not yours either while an order has her flying.
    if (this.on && mode === 'helm' && code === 'KeyJ' && this.pilot && !this.away && this.step?.do === 'pilot') return this.refuse('launch'), true;
    if (!this.on || mode !== 'helm' || code !== 'KeyL' || !this.berth || this.allows('launch')) return false;
    if (!this.away && this.step?.do === 'pilot' && !this.pilot) return false;
    this.refuse('launch');
    return true;
  }

  // --- the steps ---

  /** The step in hand begins. */
  enter() {
    const st = this.step;
    this.s = { t: 0, phase: 'wait' };
    if (!st || this.away) return;
    if (st.skipTo) this.skip(st.skipTo);
    if (st.do === 'land') this.s.seen = this.berth ? this.berth.lastRecovery ?? null : this.fighter.lastLanding;
    if (st.do === 'rounds') this.s.seen = new Set();
    if (st.do === 'suit') this.s.donned = this.ship?.donned ?? 0;
  }

  /** A step's `skipTo`: the ship's clock goes on, once, when the step begins aboard the ship that keeps a routine.
   *  `{ before: m }`: to `m` minutes before your section's next watch. `{ relieved: m }`: on watch, to `m` minutes
   *  after it ends. `say` is told. With the game running it happens behind a fade (`G.fadeThen`). */
  skip(k) {
    const R = this.routine;
    if (!R?.nextOwn || this.skipped === this.i) return;
    this.skipped = this.i;
    const t = k.before != null ? R.nextOwn().start - k.before * 60 : k.relieved != null && R.onWatch ? R.watchAt().end + k.relieved * 60 : null;
    if (t == null || t <= R.t) return;
    const go = () => {
      R.setTime(t);
      if (k.say) this.tell(null, k.say.replaceAll('{time}', fmtTime(t)), 8);
    };
    if (this.live && this.G?.fadeThen) this.G.fadeThen(go);
    else go();
  }

  /** The step in hand is done: its words, its rank and its unlocks, then the next. */
  complete() {
    const st = this.step;
    if (this.away) return; // an order for another ship is not done from here
    if (st.rank) this.rank = st.rank;
    for (const u of st.unlock ?? []) this.unlocked.add(this.uk(u, st.ship));
    if (st.qual) {
      // A qualification: its own flag, and the seats it opens aboard the ship it is for.
      const Q = this.K.quals?.[st.qual];
      this.quals.add(st.qual);
      for (const u of Q?.unlock ?? []) this.unlocked.add(this.uk(u, Q.ship ?? st.ship));
    }
    if (st.flag) this.flags[st.flag] = true;
    if (st.say && st.do !== 'talk') this.tell(null, st.say, 8);
    if (st.rank || st.qual) {
      this.sfx?.cue('chime');
      setTimeout(() => this.sfx?.cue('chime'), 300);
    }
    this.i++;
    if (this.done && !this.voy) this.unlocked = new Set(ALL); // (the player's career has more chapters to come: its seats stay as earned)
    this.save();
    this.enter();
  }

  /** The step went wrong: say so, and back up to step `to` (default: this one again). */
  fail(to = this.i, text = this.step.fail) {
    if (text) this.tell(null, text, 8);
    this.sfx?.cue('klaxon', { n: 1 });
    this.i = to;
    this.enter();
    this.s.t = -5; // a moment before it starts over
  }

  /** You used officer `id`. */
  talked(id) {
    const p = this.people.get(id), st = this.step;
    this.C.bus?.emit('talk', { who: id });
    if (!this.away && st?.do === 'talk' && st.who === id) {
      this.tell(p, st.say, 6 + st.say.split(' ').length / 3.2);
      this.complete();
      return;
    }
    if (this.done) return this.tell(p, 'Carry on.', 4);
    this.tell(p, st ? `You have your orders: ${lower(this.away ? this.K.ships[st.ship].go : st.order)}.` : 'Carry on.', 5, st ? 'You have your orders.' : undefined);
  }

  /** You turned in and were shaken for your watch. */
  woke() {
    if (this.on && this.step?.do === 'sleep') this.complete();
  }

  /** Your section's roll was called by `leader`, who said `line`. Present, the step is done. Adrift, your name goes in
   *  the book and you must report to the muster room late (`adrift`). Returns true: the line was said here, with the
   *  step's own words after it. */
  musterCalled(present, leader, line) {
    const st = this.step;
    if (!this.on || st?.do !== 'muster') return false;
    if (present) this.complete();
    else {
      this.s.adrift = true;
      this.book = (this.book ?? 0) + 1;
      this.sfx?.cue('klaxon', { n: 1, vol: 0.5 });
      this.save();
    }
    this.tell(leader, `${line} ${(present ? st.say : st.adrift?.call) ?? ''}`.trim(), 10);
    return true;
  }

  /** Action stations (the career's `stations`): the card sends you to your station by rank; get there inside `close`
   *  seconds, or your name goes in the book, as at a muster. Not during a `raid` order, which says where to go itself. */
  closeUp(dt, { mode, room }) {
    const S = this.K.stations, on = !!this.ship?.stations && this.step?.do !== 'raid';
    if (!S || !on) return void (this.as = null);
    const line = S.ranks[this.rank] ?? Object.values(S.ranks)[0];
    const fill = (t) => t.replaceAll('{at}', line.at).replaceAll('{rank}', this.rank);
    const who = this.K.people.find((p) => p.id === line.who) ?? null;
    if (!this.as) this.as = { t: 0, line, closed: false, adrift: false };
    const a = this.as;
    a.t += dt;
    const there = line.seat === 'gun' ? mode === 'gun' : line.seat === 'fighter' ? mode === 'fighter' : line.seat === 'helm' ? mode === 'helm' || (mode === 'walk' && room === line.room) : mode === 'walk' && room === line.room;
    if (there && !a.closed) {
      a.closed = true;
      this.sfx?.cue('chime', { vol: 0.4 });
      this.tell(a.adrift ? who : null, fill(S.closed), 5);
    } else if (!there && !a.closed && !a.adrift && a.t > S.close) {
      a.adrift = true;
      this.book = (this.book ?? 0) + 1;
      this.sfx?.cue('klaxon', { n: 1, vol: 0.5 });
      this.tell(who, fill(S.adrift), 9);
      this.save();
    }
  }

  /** Where your action station is, for the card and the markers. */
  stationTarget() {
    const line = this.as.line, f = this.L.weapons.turrets?.[0]?.from;
    const at = (id) => {
      const r = this.C.rooms.get(id);
      return r && { deck: r.deck, seg: r.seg, x: (r.x[0] + r.x[1]) / 2, z: (r.z[0] + r.z[1]) / 2, room: r };
    };
    if (line.seat === 'gun' && f) return { deck: f.deck, x: f.at[0], z: f.at[1], room: null };
    if (line.seat === 'fighter') return this.boardTarget();
    return at(line.room);
  }

  /** Where you board a fighter: the first one's grab frame, where E climbs in (in the airless hangar, at the end of her
   *  spur of the gangway from the airlock). */
  boardTarget() {
    const h = this.C.rooms.get('hangar'), f = this.L.fighters?.[0];
    return h && f ? { deck: h.deck, x: f.at[0] + 1, z: f.at[1] - 4.6, room: h } : null;
  }

  /** A damage control job ended (damage.mjs says `job-end`). */
  jobEnded(job, ok) {
    if (!this.on || job !== this.s?.job) return;
    this.s.job = null;
    if (ok) this.complete();
    else this.fail();
  }

  /** Each frame: `where` is { mode, deck, room } (the room you stand in, walking). */
  frame(dt, where) {
    if (!this.on) return;
    this.deckNow = where.deck;
    this.segNow = where.seg;
    this.live = true; // frames are running: a clock skip from here on is behind a fade
    const st = this.step, s = this.s;
    s && (s.t += dt);
    if (this.msg) this.msg.t -= dt;
    if (st && s.t >= 0 && !this.away) this.check(st, s, where, dt);
    this.closeUp(dt, where);
    this.mark(where);
    this.card(where.mode);
  }

  check(st, s, { mode, room }, dt = 0) {
    switch (st.do) {
      case 'go':
        if (mode === 'walk' && room === st.room) this.complete();
        break;
      case 'sleep':
        // Already called for your watch (or picked up again close to it): you are up anyway.
        if (this.routine?.calledSoon) this.complete();
        break;
      case 'muster':
        if (s.adrift && mode === 'walk' && room === this.routine?.you.muster) {
          this.complete();
          this.tell(this.routine.mine.leader, st.adrift?.say ?? 'Adrift. Carry on.', 9);
        }
        break;
      case 'read':
        if (this.routine?.read) this.complete(); // read on its board (or before you were told to)
        break;
      case 'rounds':
        if (mode === 'walk' && st.rooms.includes(room) && !s.seen.has(room)) {
          s.seen.add(room);
          this.sfx?.cue('chime', { vol: 0.4 });
          if (s.seen.size === st.rooms.length) this.complete();
          else this.tell(null, (st.each ?? '{room}: all correct. {n} to go.').replaceAll('{room}', this.C.rooms.get(room).name).replaceAll('{n}', st.rooms.length - s.seen.size), 4);
        }
        break;
      case 'drill':
        // The chief calls it a moment after you are sent.
        if (!s.job && s.t > 1.5) s.job = this.dc.raise(st.kind, st.room);
        break;
      case 'suit':
        // Fresh bottles and a seal check (integrity.mjs `don`, a SUIT AIR locker), or into your suit at a drum's lift.
        if (this.ship.donned > s.donned) this.complete();
        break;
      case 'man':
        if (mode === 'gun') this.complete();
        break;
      case 'shoot': {
        // The gunnery drill: the tug streams the sled past once you are in the turret; your hits on it are counted.
        const T = this.guns.raider;
        if (s.phase === 'wait') {
          if (mode !== 'gun' || (T && !T.gone)) s.t = 0;
          else if (s.t > 3) {
            if (st.start) this.C.bus?.emit('call', { id: 'bridge-line', line: st.start }), this.dc.say(null, st.start, 0, 7);
            s.R = this.guns.drill(st.from);
            s.phase = 'on';
          }
        } else if ((s.R.byYou ?? 0) >= st.hits) {
          this.guns.dismiss();
          this.complete();
        } else if (s.R.gone) this.fail();
        break;
      }
      case 'raid': {
        if (s.phase === 'wait') {
          const T = this.guns.raider;
          if (mode !== 'gun' || (T?.target && !T.gone)) s.t = 0; // not until the target tug is clear
          else if (s.t > (st.wait ?? 3)) {
            if (st.start) this.C.bus?.emit('call', { id: 'bridge-line', line: st.start });
            this.ship.attack(st.from);
            s.R = this.guns.raider;
            s.phase = 'on';
          }
        } else if (s.R?.gone) {
          const mine = s.R.byYou ?? 0;
          if (mine >= st.hits || s.R.killedByYou) this.complete();
          else this.fail();
        }
        break;
      }
      case 'board':
        if (mode === 'fighter') this.complete();
        break;
      case 'launch':
        // A carried ship: out of her berth by your own hand (L at the helm), not the pilot's.
        if (this.berth ? this.berth.phase === 'out' && !this.pilot?.busy : this.fighter.flying) this.complete();
        break;
      case 'land': {
        if (this.berth) {
          // A carried ship: back on her cradle from a capture you flew, graded `grade` or better.
          const b = this.berth, l = b.lastRecovery;
          if (this.pilot?.hasHelm && b.phase !== 'berthed') s.crew = true; // the crew's pilot flew some of it: not yours
          if (!l || l === s.seen || b.phase !== 'berthed') break;
          const launch = this.K.steps.findLastIndex((x, k) => k < this.i && x.do === 'launch');
          if (!l.manual || s.crew) this.fail(launch);
          else if (GRADES.indexOf(l.grade) > GRADES.indexOf(st.grade ?? 'rough')) this.fail(launch, st.rough ?? st.fail);
          else this.complete();
          break;
        }
        const l = this.fighter.lastLanding;
        if (!l || l === s.seen || this.fighter.phase === 'landing') break;
        if (l.manual || !st.manual) this.complete();
        else this.fail(this.K.steps.findLastIndex((x, k) => k < this.i && x.do === 'launch'));
        break;
      }
      case 'helm':
        if (mode === 'helm') this.complete();
        break;
      case 'turn': {
        const fwd = _v.set(0, 0, -1).applyQuaternion(this.obj.quaternion);
        if (!s.h0) s.h0 = fwd.clone();
        s.deg = (Math.acos(Math.max(-1, Math.min(1, fwd.dot(s.h0)))) * 180) / Math.PI;
        s.rate = (this.body.ang.length() * 180) / Math.PI;
        if (s.deg >= st.deg - 4 && s.rate < 0.2) this.complete();
        break;
      }
      case 'transit': {
        // The navigator lays the waypoint in once you have the helm (helmsight.mjs); arriving on it at rest completes.
        const N = this.nav;
        if (!N) break;
        s.arr0 ??= N.arrivals;
        if (N.arrivals > s.arr0) this.complete();
        else if (st.at) {
          // A point of the career's own, in the host's frame (a carried ship, once she is out): laid in again if cleared.
          const b = this.berth;
          if (!N.nav && mode === 'helm' && s.t > 2 && (!b || b.phase === 'out')) N.layNav(b ? b.H.frame.localToWorld(_v.set(...st.at)) : _v.set(...st.at), st.name);
        } else if (!N.nav && mode === 'helm' && s.t > 2 && !s.laid) {
          s.laid = true;
          N.toggleNav(st.dist ?? 15000, st.off ?? 40);
        }
        break;
      }
      case 'pilot': {
        // The crew pilot flies `plan` (pilot.mjs: `G.pilot.fly`), you strapped in at the helm couch unless `seat: false`.
        // Done when the plan ends well, or when a leg of kind `until` begins (she holds, and the next orders are yours).
        const P = this.pilot, b = this.berth;
        if (!P) {
          // No pilot in this build: the card asks you to fly it (`self`), and L is yours for the step (`blocks`).
          // Out and clear of the bay at rest for a plan that leaves; back on the cradle for one that ends in a recovery.
          if (!b) return void this.complete();
          const home = st.plan.at(-1).do === 'recover';
          if (home ? b.phase === 'berthed' && (s.out || st.plan[0].do !== 'launch') : b.phase === 'out' && this.clearOfBay()) this.complete();
          else if (b.phase === 'out') s.out = true;
          break;
        }
        if (s.phase === 'wait') {
          if (st.seat !== false && mode !== 'helm') s.t = 0;
          else if (s.t > (st.wait ?? 2)) {
            if (st.plan[0].do === 'recover' && b?.phase === 'berthed') return void this.complete(); // she is home already
            if (P.busy) P.abort(); // she was holding for this
            // (picked up with her already out: no launch to fly)
            const who = this.people.get(st.who)?.name;
            s.phase = 'on'; // (before `fly`, which says its first leg at once)
            s.onT = 0;
            P.fly(st.plan.filter((leg, k) => !(k === 0 && leg.do === 'launch' && b?.phase !== 'berthed')).map((leg) => ({ ...leg })), who ? { who } : {});
            if (st.start) this.tell(this.people.get(st.who) ?? null, st.start, 7);
          }
          break;
        }
        s.onT += dt;
        if (s.over) s.over.ok ? this.complete() : this.fail();
        else if (st.until && s.leg?.leg?.do === st.until) this.complete();
        else if (!P.busy && s.onT > 1) this.complete(); // the plan is over and nothing said so
        break;
      }
      case 'obey': {
        // Fire control's orders, on a target sled: HOLD for `hold` seconds with the sled running past, then TIGHT on
        // it and `hits` hits of your own. A round against orders (`fireControl.violations`) goes in the book and the
        // step starts again: nothing else is lost.
        const fc = this.guns.fireControl, T = this.guns.raider, by = st.who ?? 'fire control';
        const who = this.people.get(st.who) ?? null;
        if (s.phase === 'wait') {
          if (mode !== 'gun' || (T && !T.gone)) s.t = 0;
          else if (s.t > 3) {
            s.v0 = fc.violations;
            fc.order('hold', { by, target: null });
            s.R = this.guns.drill(st.from);
            s.h = 0;
            s.phase = 'hold';
            if (st.start) this.tell(who, st.start, 7);
          }
          break;
        }
        if (fc.violations > s.v0) {
          this.checkFire++;
          this.guns.dismiss();
          fc.auto();
          this.fail();
          this.save();
        } else if (s.R.gone) {
          fc.auto();
          this.fail(this.i, st.short ?? st.fail);
        } else if (s.phase === 'hold') {
          if ((s.h += dt) >= (st.hold ?? 10)) {
            s.hits0 = s.R.byYou ?? 0;
            fc.order('tight', { by, target: s.R });
            s.phase = 'tight';
            if (st.tight) this.tell(who, st.tight, 7);
          }
        } else if ((s.R.byYou ?? 0) - s.hits0 >= st.hits) {
          this.guns.dismiss();
          fc.auto();
          this.complete();
        }
        break;
      }
    }
  }

  // --- where the order sends you ---

  /** Where the step in hand sends you: { deck, x, z, room } or null. */
  /** A carried ship is out, clear of the bay and near enough at rest against her host (a `pilot` step you fly yourself). */
  clearOfBay() {
    const b = this.berth;
    return b.C.obj.position.distanceTo(b.gateWorld(_v)) > 150 && _v.copy(this.body.vel).sub(b.hostVel).length() < 1.5;
  }

  /** Where the way to ship `id` is, from here: the berth she lies in (her docking port, on its platform in the
   *  hangar), or this ship's own docking port (the way back aboard her host). */
  crossing(id) {
    const P = this.K.ships[id]?.page ?? {}, room = (r) => this.C.rooms.get(r);
    const b = (this.L.berths ?? []).find((x) => x.id === P.berth);
    if (b) {
      const port = b.port ?? b.at, h = room('hangar');
      return h && { deck: h.deck, x: port[0] - Math.sign(port[0] || b.out || 1) * 1.2, z: port[2], room: null }; // (no room: the side is the berth's, not the hangar's)
    }
    const dk = this.L.dock, lock = dk && room(dk.room);
    return lock ? { deck: lock.deck, x: dk.at[0] - (dk.out?.[0] ?? 0) * 0.6, z: dk.at[2], room: lock } : null;
  }

  target() {
    if (this.as && !this.as.closed) return this.stationTarget();
    const st = this.step;
    if (!st) return null;
    if (this.away) return this.crossing(st.ship);
    const room = (id) => {
      const r = this.C.rooms.get(id);
      return r && { deck: r.deck, seg: r.seg, x: (r.x[0] + r.x[1]) / 2, z: (r.z[0] + r.z[1]) / 2, room: r };
    };
    switch (st.do) {
      case 'talk': {
        const p = this.people.get(st.who);
        return { deck: p.deck, seg: p.seg, x: p.at[0], z: p.at[1], room: this.C.rooms.get(p.room), who: p };
      }
      case 'go':
        return room(st.room);
      case 'read': {
        const b = this.routine?.boardAt;
        return b && { ...b, room: this.C.rooms.get('ship-office') };
      }
      case 'sleep': {
        const b = this.routine?.bunkAt;
        return b && { ...b, room: this.C.rooms.get(this.routine.you.bunk.room) };
      }
      case 'muster': {
        const y = this.routine?.you;
        const r = y && this.C.rooms.get(y.muster);
        return r && { deck: r.deck, seg: r.seg, x: y.at[0], z: y.at[1], room: r };
      }
      case 'rounds':
        return room(st.rooms.find((r) => !this.s?.seen?.has(r)) ?? st.rooms[0]);
      case 'drill':
        return this.s?.job ? null : room(st.room); // once it is called, damage control's own red marker has it
      case 'suit':
        return room(st.room ?? 'damage-control');
      case 'man':
      case 'shoot':
      case 'obey':
      case 'raid': {
        const f = this.L.weapons.turrets[0].from;
        return { deck: f.deck, x: f.at[0], z: f.at[1], room: null };
      }
      case 'board':
        return this.boardTarget();
      case 'launch':
      case 'land':
        if (this.fighter) return room('hangar');
      // (a carried ship is launched and brought home from her own helm)
      case 'pilot':
      case 'helm':
      case 'turn':
      case 'transit': {
        const br = this.C.rooms.get(this.L.helm.room ?? 'bridge');
        return { deck: br.deck, x: this.L.helm.at[0], z: this.L.helm.at[1], room: br };
      }
    }
    return null;
  }

  mark(where) {
    const t = this.target();
    for (const p of this.people.values()) {
      p.chevron.visible = t?.who === p;
      if (p.chevron.visible) p.chevron.position.y = p.I.floorY + 2.2 + 0.04 * Math.sin(performance.now() / 300);
    }
    this.marker.visible = !!t;
    if (!t) return;
    if (this.C.isDrum(t.deck)) drumToShip(this.C, t.deck, t.seg ?? 0, t.x, this.C.interior(t.deck, t.seg ?? 0).floorY, t.z, this.marker.position);
    else this.marker.position.set(t.x, this.C.decks.get(t.deck).floorY, t.z);
    this.marker.scale.setScalar(this.markScale * (1 + 0.2 * Math.sin(performance.now() / 250)));
  }

  /** "Main deck · frame 95 · starboard · follow the blue Bridge line", for the step's target. In a drum: "after drum,
   *  inner deck (a lift down from the spine) · segment 9 (you are in 3) · frame 40". */
  hint(t, deckNow) {
    if (!t) return '';
    const drum = this.C.isDrum, name = this.C.deckName(t.deck).toLowerCase();
    if (drum(t.deck)) {
      const same = t.deck === deckNow, sameHalf = drum(deckNow) && deckNow.split('-')[1] === t.deck.split('-')[1];
      const how = same ? '' : sameHalf ? ' (the ladder at a lift)' : drum(deckNow) ? ' (a lift up to the spine, then down)' : ' (a lift down from the spine)';
      const parts = [`${name}${how}`, `segment ${t.seg}${same && this.segNow !== t.seg ? ` (you are in ${this.segNow})` : ''}`, `frame ${frameOf(this.L, t.z)}`];
      const line = !drum(deckNow) && this.L.routes.lines.find((l) => l.to === 'spine'); // the line to the lifts
      if (line) parts.push(`<i style="--c:${line.color}">follow the ${line.name} line</i>`);
      return parts.join(' · ');
    }
    // The side is the room's (a room across the centreline is on it, wherever in it the officer stands).
    const x = t.room ? (t.room.x[0] < 0 && t.room.x[1] > 0 ? 0 : (t.room.x[0] + t.room.x[1]) / 2) : t.x;
    const floor = (d) => this.L.decks.find((k) => k.id === d)?.floor ?? 0; // up or down by the decks' heights, not their numbers
    const how = t.deck === deckNow ? '' : drum(deckNow) ? ' (a lift up to the spine)' : floor(t.deck) > floor(deckNow) ? ' (up)' : ' (down)';
    const parts = [`${name}${how}`, `frame ${frameOf(this.L, t.z)}`, sideOf(x)];
    const line = t.room && this.L.routes.lines.find((l) => l.to === t.room.id);
    if (line) parts.push(`<i style="--c:${line.color}">follow the ${line.name} line</i>`);
    return parts.join(' · ');
  }

  // --- what you are told, and the card ---

  /** `who` (an officer or a leading hand, or null for the ship) tells you `text`: on the card for `secs`, and spoken
   *  (`spoken`, when the words said are shorter than the card's) if it was recorded. */
  tell(who, text, secs = 6, spoken = text) {
    this.msg = { who: who?.name ?? null, text, t: secs };
    if (who) this.voices?.say(who.id, spoken);
  }

  card(mode) {
    const el = this.el;
    if (!el) return;
    el.hidden = false;
    el.className = mode === 'walk' ? '' : mode === 'cutaway' ? 'low' : 'small';
    const st = this.step, s = this.s;
    let prog = '';
    if (st?.do === 'raid') prog = s.phase === 'wait' ? (mode === 'gun' ? (this.guns.raider?.target && !this.guns.raider.gone ? 'The target tug is hauling off…' : 'Waiting for the raider…') : 'Climb back into the dorsal turret') : `Your hits: ${Math.min(st.hits, s.R?.byYou ?? 0)} of ${st.hits}`;
    if (st?.do === 'shoot') prog = mode !== 'gun' ? 'Climb back into the dorsal turret' : s.phase === 'wait' ? 'Waiting for the target tug…' : `Your hits on the sled: ${Math.min(st.hits, s.R?.byYou ?? 0)} of ${st.hits} · lay the sight on the amber diamond`;
    if (st?.do === 'turn' && s.h0) prog = `Turned ${Math.round(s.deg)}° of ${st.deg}° · turning ${s.rate.toFixed(2)}°/s`;
    if (st?.do === 'drill' && s.job) prog = 'The drill is on: see the job card';
    const away = this.away, b = this.berth;
    if (st?.do === 'obey') prog = mode !== 'gun' ? 'Climb back into the dorsal turret' : s.phase === 'wait' ? 'Waiting for the target tug…' : s.phase === 'hold' ? `WEAPONS HOLD: do not fire · ${Math.max(0, Math.ceil((st.hold ?? 10) - s.h))} s` : `WEAPONS TIGHT on the sled · your hits: ${Math.min(st.hits, (s.R?.byYou ?? 0) - s.hits0)} of ${st.hits}`;
    if (st?.do === 'pilot' && !away) prog = !this.pilot ? b?.status() ?? '' : s.phase === 'wait' ? (st.seat !== false && mode !== 'helm' ? 'Strap in at the pilot\'s couch' : 'Stand by…') : `The commander has the helm${s.leg ? ` · leg ${s.leg.i + 1} of ${s.leg.n}: ${s.leg.leg?.do ?? ''}` : ''}`;
    if ((st?.do === 'launch' || st?.do === 'land') && b && !away) prog = mode === 'helm' ? b.status() ?? '' : 'Take the helm';
    if (this.checkFire && (st?.do === 'obey' || st?.do === 'shoot')) prog += ` · check fires on report: ${this.checkFire}`;
    const R = this.routine?.yourLine ? this.routine : null; // a ship with only a clock (`NoRoutine`) has no watch line
    if (st?.do === 'muster' && R && !s.adrift) {
      const x = R.nextOwn(R.t - R.W.muster.late * 60);
      prog = `Muster at ${fmtTime(x.start)} · now ${fmtTime(R.t)}`;
    }
    if (st?.do === 'sleep' && R) prog = R.cantSleep() ?? `Use your bunk: you are called at ${fmtTime(R.nextOwn().start - R.you.shake * 60)}`;
    if (st?.do === 'rounds') prog = `Rounds: ${s.seen.size} of ${st.rooms.length} checked · ${st.rooms.filter((r) => !s.seen.has(r)).map((r) => this.C.rooms.get(r)?.name.toLowerCase()).join(', ')}`;
    let order = this.done ? this.K.end?.order ?? 'Your first week is done. Answer the klaxon, man a turret, fly.' : away ? this.K.ships[st.ship].go : s?.adrift ? st.adrift?.order ?? st.order : st.do === 'pilot' && !this.pilot ? st.self ?? st.order : st.order;
    if (away) prog = '';
    if (this.as) {
      // Action stations comes before the order in hand.
      const S = this.K.stations, at = this.as.line.at;
      order = this.as.closed ? S.closed.replaceAll('{at}', at) : S.say.replaceAll('{at}', at);
      prog = this.as.closed ? 'Your order resumes at the stand down' : this.as.adrift ? `Adrift: your name is in the book (${this.book})` : `Close up in ${Math.max(0, Math.ceil(S.close - this.as.t))} s`;
    }
    const msg = this.msg && this.msg.t > 0 ? `<div class="d-msg">${this.msg.who ? `<b>${this.msg.who}:</b> ` : ''}${this.msg.text}</div>` : '';
    // Your qualifications, after your rank (the player's career): a rank is a title, a qualification opens a seat.
    const quals = this.voy && this.quals.size ? ` · ${[...this.quals].map((q) => this.K.quals?.[q]?.short ?? q).join(' ')}` : '';
    const html = `<div class="d-rank">${this.rank}<span>${this.done ? this.K.end?.tag ?? 'first week' : `order ${this.i + 1} of ${this.K.steps.length}`}${quals}</span></div>
      ${R ? `<div class="d-watch" style="--c:${R.mine.color}">${R.yourLine()}</div>` : ''}
      <div class="d-order">${order}</div>
      ${mode === 'walk' || mode === 'cutaway' ? `<div class="d-where">${this.hint(this.target(), this.deckNow)}</div>` : ''}
      ${prog ? `<div class="d-prog">${prog}</div>` : ''}${msg}`;
    if (html !== this.lastHtml) (el.innerHTML = html), (this.lastHtml = html);
  }
}

const lower = (s) => s[0].toLowerCase() + s.slice(1);

/** The cutaway's gold marker: a ring on the floor and a beam up out of the hull, like damage control's red one. */
function marker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.4, 6, 28), GOLD);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 6), GOLD);
  beam.position.y = 10;
  g.add(ring, beam);
  g.renderOrder = 5;
  g.visible = false;
  return g;
}
