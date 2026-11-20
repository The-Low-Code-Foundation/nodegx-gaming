// The career: your first week aboard as the most junior hand on the ship, from `ships/carrier.career.json`. Officers
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

import * as THREE from 'three';
import { crewMember } from './crew.mjs';
import { frameOf, sideOf } from './wayfinding.mjs';
import { fmt as fmtTime } from './watch.mjs';
import { drumToShip } from './drum.mjs';

const KEY = 'threadspace.carrier.career'; // the spin-drum carrier's; another ship's career saves under its own (`Career.key`)
const ALL = ['guns', 'raids', 'fighters', 'helm'];
// A step that needs you in a seat, picked up again after a reload, backs up to the step that seats you.
// (The gunnery steps need no backing up: out of the turret, their card sends you back up into it.)
const BACK = { launch: 'board', land: 'board', turn: 'helm', transit: 'helm', muster: 'sleep' };
const GOLD = new THREE.MeshBasicMaterial({ color: '#ffc850', transparent: true, opacity: 0.85, toneMapped: false, depthTest: false });
const CHEVRON = new THREE.MeshBasicMaterial({ color: '#ffc850', toneMapped: false });
const _v = new THREE.Vector3();

export class Career {
  /** `K` the career file. `ctx`: `dc` (damage control: the drills, the speakers), `ship` (integrity: a raid),
   *  `guns` (the raider, and your hits on it), `fighter`, `obj` (the carrier's Object3D, for her heading), `body`
   *  (her rigid body, for her turn rate), `sfx`, `voices` (voice.mjs: who says what aloud). */
  constructor(C, K, { dc, ship, guns, fighter, obj, body, sfx, voices = null }) {
    Object.assign(this, { C, L: C.L, K, dc, ship, guns, fighter, obj, body, sfx, voices });
    this.routine = null; // the ship's routine (watch.mjs): the clock, your watch, the muster
    this.on = false;
    this.i = 0;
    this.rank = K.start.rank;
    this.unlocked = new Set(ALL);
    this.s = null; // the step in hand's own state
    this.msg = null; // { who, text, t }
    this.el = document.getElementById('c-duty');
    this.markScale = 1;
    this.marker = marker();
    C.overlay.add(this.marker);
    this.people = new Map();
    this.place();
  }

  // --- the officers ---

  place() {
    const crewCount = this.L.stations.length;
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
      crewMember(crewCount + k, p.dept)
        .then((m) => {
          m.root.position.set(p.at[0], I.floorY, p.at[1]);
          m.root.rotation.y = p.yaw ?? 0;
          I.group.add(m.root);
          if (this.C.clipPlanes) m.root.traverse((o) => o.material && [o.material].flat().forEach((x) => (x.clippingPlanes = this.C.clipPlanes)));
          m.deck = room.deck;
          m.play(p.pose ?? 'idle');
          who.m = m;
        })
        .catch((e) => console.warn(`${p.name} could not come aboard`, e));
    });
  }

  /** The officers' clips play where they are being drawn (`drawn(person)`). */
  tickPeople(dt, drawn) {
    for (const p of this.people.values()) if (p.m && drawn(p)) p.m.update(dt);
  }

  // --- starting, saving ---

  /** The saved career, if it was saved against these steps (`K`): a career saved before the steps changed is not
   *  picked up again, as its step number would land on the wrong order. */
  static key = KEY;

  static saved(K) {
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
    return { deck: r.deck, x: at ? at[0] : (r.x[0] + r.x[1]) / 2, z: at ? at[1] : (r.z[0] + r.z[1]) / 2, yaw: this.K.resume.yaw ?? 0, seg: r.seg };
  }

  /** Free roam: no orders, the whole ship open. */
  free() {
    this.on = false;
    this.unlocked = new Set(ALL);
    if (this.el) this.el.hidden = true;
  }

  save() {
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

  allows(what) {
    return this.unlocked.has(what);
  }

  refuse(what) {
    this.tell(null, this.K.refuse[what] ?? 'Not yet.', 6);
    this.sfx?.cue('clunk', { vol: 0.3 });
  }

  // --- the steps ---

  /** The step in hand begins. */
  enter() {
    const st = this.step;
    this.s = { t: 0, phase: 'wait' };
    if (!st) return;
    if (st.do === 'land') this.s.seen = this.fighter.lastLanding;
    if (st.do === 'rounds') this.s.seen = new Set();
  }

  /** The step in hand is done: its words, its rank and its unlocks, then the next. */
  complete() {
    const st = this.step;
    if (st.rank) this.rank = st.rank;
    for (const u of st.unlock ?? []) this.unlocked.add(u);
    if (st.say && st.do !== 'talk') this.tell(null, st.say, 8);
    if (st.rank) {
      this.sfx?.cue('chime');
      setTimeout(() => this.sfx?.cue('chime'), 300);
    }
    this.i++;
    if (this.done) this.unlocked = new Set(ALL);
    this.save();
    this.enter();
  }

  /** The step went wrong: say so, and back up to step `to` (default: this one again). */
  fail(to = this.i) {
    if (this.step.fail) this.tell(null, this.step.fail, 8);
    this.sfx?.cue('klaxon', { n: 1 });
    this.i = to;
    this.enter();
    this.s.t = -5; // a moment before it starts over
  }

  /** You used officer `id`. */
  talked(id) {
    const p = this.people.get(id), st = this.step;
    if (st?.do === 'talk' && st.who === id) {
      this.tell(p, st.say, 6 + st.say.split(' ').length / 3.2);
      this.complete();
      return;
    }
    if (this.done) return this.tell(p, 'Carry on.', 4);
    this.tell(p, st ? `You have your orders: ${lower(st.order)}.` : 'Carry on.', 5, st ? 'You have your orders.' : undefined);
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
    const line = this.as.line, f = this.L.weapons.turrets?.[0]?.from, b = this.L.fighters?.[0]?.boarding;
    const at = (id) => {
      const r = this.C.rooms.get(id);
      return r && { deck: r.deck, seg: r.seg, x: (r.x[0] + r.x[1]) / 2, z: (r.z[0] + r.z[1]) / 2, room: r };
    };
    if (line.seat === 'gun' && f) return { deck: f.deck, x: f.at[0], z: f.at[1], room: null };
    if (line.seat === 'fighter') return b ? { deck: this.C.rooms.get(b.from).deck, x: b.at[0], z: b.at[1], room: this.C.rooms.get(b.from) } : at('hangar');
    return at(line.room);
  }

  /** A damage control job ended (damage.mjs `onEnd`). */
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
    const st = this.step, s = this.s;
    s && (s.t += dt);
    if (this.msg) this.msg.t -= dt;
    if (st && s.t >= 0) this.check(st, s, where, dt);
    this.closeUp(dt, where);
    this.mark(where);
    this.card(where.mode);
  }

  check(st, s, { mode, room }) {
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
          else this.tell(null, `${this.C.rooms.get(room).name}: all correct. ${st.rooms.length - s.seen.size} to go.`, 4);
        }
        break;
      case 'drill':
        // The chief calls it a moment after you are sent.
        if (!s.job && s.t > 1.5) s.job = this.dc.raise(st.kind, st.room);
        break;
      case 'suit':
        if (this.ship.suit) this.complete();
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
            if (st.start) this.dc.say(st.start, st.start, 0, 7);
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
            if (st.start) this.dc.say(st.start, null, 0);
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
        if (this.fighter.flying) this.complete();
        break;
      case 'land': {
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
        else if (!N.nav && mode === 'helm' && s.t > 2 && !s.laid) {
          s.laid = true;
          N.toggleNav(st.dist ?? 15000, st.off ?? 40);
        }
        break;
      }
    }
  }

  // --- where the order sends you ---

  /** Where the step in hand sends you: { deck, x, z, room } or null. */
  target() {
    if (this.as && !this.as.closed) return this.stationTarget();
    const st = this.step;
    if (!st) return null;
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
        return this.ship.suit ? null : room('damage-control');
      case 'man':
      case 'shoot':
      case 'raid': {
        const f = this.L.weapons.turrets[0].from;
        return { deck: f.deck, x: f.at[0], z: f.at[1], room: null };
      }
      case 'board': {
        // Down a boarding tube where the fighters have them (the spin-drum carrier's hangar is airless), else the hangar.
        const b = this.L.fighters?.[0]?.boarding, from = b && this.C.rooms.get(b.from);
        return from ? { deck: from.deck, x: b.at[0], z: b.at[1], room: from } : room('hangar');
      }
      case 'launch':
      case 'land':
        return room('hangar');
      case 'helm':
      case 'turn':
      case 'transit': {
        const br = this.C.rooms.get('bridge');
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
   *  (`spoken`, when the words said are shorter than the card's). */
  tell(who, text, secs = 6, spoken = text) {
    this.msg = { who: who?.name ?? null, text, t: secs };
    if (who) this.voices?.say(who.id, spoken, { pitch: who.voice?.pitch ?? 1, rate: who.voice?.rate ?? 1 });
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
    const R = this.routine;
    if (st?.do === 'muster' && R && !s.adrift) {
      const x = R.nextOwn(R.t - R.W.muster.late * 60);
      prog = `Muster at ${fmtTime(x.start)} · now ${fmtTime(R.t)}`;
    }
    if (st?.do === 'sleep' && R) prog = R.cantSleep() ?? `Use your bunk: you are called at ${fmtTime(R.nextOwn().start - R.you.shake * 60)}`;
    if (st?.do === 'rounds') prog = `Rounds: ${s.seen.size} of ${st.rooms.length} checked · ${st.rooms.filter((r) => !s.seen.has(r)).map((r) => this.C.rooms.get(r)?.name.toLowerCase()).join(', ')}`;
    let order = this.done ? 'Your first week is done. Answer the klaxon, man a turret, fly.' : s?.adrift ? st.adrift?.order ?? st.order : st.order;
    if (this.as) {
      // Action stations comes before the order in hand.
      const S = this.K.stations, at = this.as.line.at;
      order = this.as.closed ? S.closed.replaceAll('{at}', at) : S.say.replaceAll('{at}', at);
      prog = this.as.closed ? 'Your order resumes at the stand down' : this.as.adrift ? `Adrift: your name is in the book (${this.book})` : `Close up in ${Math.max(0, Math.ceil(S.close - this.as.t))} s`;
    }
    const msg = this.msg && this.msg.t > 0 ? `<div class="d-msg">${this.msg.who ? `<b>${this.msg.who}:</b> ` : ''}${this.msg.text}</div>` : '';
    const html = `<div class="d-rank">${this.rank}<span>${this.done ? 'first week' : `order ${this.i + 1} of ${this.K.steps.length}`}</span></div>
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
