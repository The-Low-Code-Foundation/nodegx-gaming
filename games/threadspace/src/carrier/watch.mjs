// The ship's routine, from `ships/carrier/watches.json`: the ship's clock, the watches and the three watch sections
// that keep them in turn, the bell every half hour, the watch bill on its board outside the ship's office, your bunk
// (turn in, and you are shaken for your next watch), the muster of your section at the change of its watch, and night.
//
// The crew follow the clock. A post kept every watch (`watch: "on"` in the layout's `stations`) is manned by whichever
// section has the watch, so the face at it changes at the change of watch; a day worker's post (`"day"`) is manned
// 0800 to 1700; an off-watch spot (`"off"`, the mess, the gym, the rec room) has someone in it within its `hours`.
// Nobody changes in front of you: a post you can see waits until you have walked on.
//
// From 2200 to 0600 the passages are in red lighting, the way a warship darkens ship at night.

import * as THREE from 'three';
import { placeCrew, removeCrew } from './crew.mjs';

const DAY = 86400;
const HALF = 1800;
const SEEN = 28; // metres: a post this close to you, on your deck, does not change in front of you
const _c = new THREE.Color();

export const hm = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 3600 + m * 60;
};
/** Ship's time as the navy writes it: 1342. */
export const fmt = (t) => {
  const s = ((t % DAY) + DAY) % DAY;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const inHours = (s, [a, b]) => (a <= b ? s >= a && s < b : s >= a || s < b);

export class Routine {
  /** `W` the routine file. `ctx`: `sfx`, `crew` (false: nobody aboard but the officers), `ship` (integrity: action
   *  stations), `dc` (damage control: a job in hand). Set `tell(who, text, secs)` to say things to you, `onRead` (the
   *  watch bill read), `onTurnIn(go)` (your bunk used: call `go()` to sleep), `onMuster(present)` (the roll called). */
  constructor(C, W, { sfx, crew = true, ship, dc }) {
    Object.assign(this, { C, L: C.L, W, sfx, ship, dc });
    this.rate = W.clock.rate;
    this.t = (W.clock.start[0] - 1) * DAY + hm(W.clock.start[1]);
    this.watches = W.watches.map((w) => ({ ...w, a: hm(w.from), b: w.to === '24:00' ? DAY : hm(w.to) }));
    this.sections = W.sections;
    this.first = W.sections.findIndex((s) => s.id === W.first);
    this.you = W.you;
    this.mine = W.sections.find((s) => s.id === W.you.section);
    this.nightHours = [hm(W.night.from), hm(W.night.to)];
    this.nightColor = new THREE.Color(W.night.color);
    this.tell = () => {};
    this.onRead = this.onTurnIn = this.onMuster = null;
    this.read = false;
    this.posts = crew ? this.L.stations.map((s, k) => ({ s, k, cur: undefined, m: null })) : [];
    this.crew = []; // the live crew members, for tickCrew
    this.muster = null;
    this.mustered = -1; // the last watch (its number) whose muster is over
    this.check = 0;
    this.el = { clock: document.getElementById('c-clock'), pipe: document.getElementById('c-pipe'), bill: document.getElementById('c-bill') };
    this.pipeT = 0;
    this.sync();
    this.board();
    this.bunk();
  }

  // --- the clock ---

  /** The watch at ship time `t`: { n (counted from day 1's middle watch), w (the watch), start, end, section }. */
  watchAt(t = this.t) {
    const day = Math.floor(t / DAY), s = t - day * DAY;
    const i = this.watches.findIndex((w) => s >= w.a && s < w.b);
    return this.nth(day * this.watches.length + i);
  }

  nth(n) {
    const per = this.watches.length;
    const day = Math.floor(n / per), w = this.watches[n - day * per];
    return { n, w, start: day * DAY + w.a, end: day * DAY + w.b, section: this.sections[(this.first + n) % this.sections.length] };
  }

  /** Your section's next watch starting after `t`. */
  nextOwn(t = this.t) {
    for (let n = this.watchAt(t).n; ; n++) {
      const x = this.nth(n);
      if (x.section === this.mine && x.start > t) return x;
    }
  }

  /** Your section has been called for its next watch (and is not on it yet): too late to turn in. */
  get calledSoon() {
    return !this.onWatch && this.nextOwn().start - this.you.shake * 60 <= this.t;
  }

  get onWatch() {
    return this.watchAt().section === this.mine;
  }

  get night() {
    return inHours(this.t % DAY, this.nightHours);
  }

  /** How many bells: one at half past the start of a watch, eight at its end; the last dog watch strikes 1, 2, 3, 8. */
  bells(t = this.t) {
    const s = (Math.floor(t / HALF) * HALF) % DAY;
    if (s > hm('18:00') && s < hm('20:00')) return (s - hm('18:00')) / HALF;
    return (s / HALF) % 8 || 8;
  }

  /** Puts the clock at `t` without striking or piping what was skipped. */
  setTime(t) {
    this.t = t;
    this.sync();
  }

  sync() {
    this.half = Math.floor(this.t / HALF);
    this.n = this.watchAt().n;
    this.wasNight = this.night;
    this.check = 0;
  }

  /** `{section} has the {watch} watch…`, filled in. */
  fill(text, x = this.nextOwn()) {
    return text
      .replaceAll('{section}', x.section.name)
      .replaceAll('{watch}', x.w.name.toLowerCase())
      .replaceAll('{time}', fmt(x.start))
      .replaceAll('{muster}', this.C.rooms.get(this.you.muster).name.toLowerCase());
  }

  // --- each frame ---

  /** `you`: { mode, deck, room, x, z } (where you stand when walking). */
  frame(dt, you) {
    this.t += dt * this.rate;
    this.you3 = you;
    const P = this.W.pipes;
    // The bell, each half hour.
    const half = Math.floor(this.t / HALF);
    if (half !== this.half) {
      this.half = half;
      this.sfx?.cue('bell', { n: this.bells(), vol: 0.8 });
    }
    // The change of watch.
    const now = this.watchAt();
    if (now.n !== this.n) {
      this.n = now.n;
      this.pipe(this.fill(P.change, now));
    }
    if (this.night !== this.wasNight) {
      this.wasNight = this.night;
      this.pipe(this.night ? P.down : P.call);
    }
    this.musterFrame(you, dt);
    if ((this.check -= dt) <= 0) {
      this.check = 0.5;
      for (const p of this.posts) this.man(p, you);
    }
    if (this.pipeT > 0 && (this.pipeT -= dt) <= 0) this.el.pipe.hidden = true;
    this.clock(you.mode);
  }

  /** A pipe over the speakers: the call, and its words on the strip under the clock. */
  pipe(text, secs = 7) {
    this.sfx?.cue('pipe', { vol: 0.8 });
    this.C.bus?.emit('call', { id: 'pipe', line: text }); // after the call (content/announcements/pipe.json)
    this.el.pipe.textContent = text;
    this.el.pipe.hidden = false;
    this.pipeT = secs;
  }

  /** Words on the strip under the clock, without the pipe (free roam has no duty card to put them on). */
  note(text, secs = 6) {
    this.el.pipe.textContent = text;
    this.el.pipe.hidden = false;
    this.pipeT = secs;
  }

  /** Whether something at (x, z) on `deck` is in your sight (and so must not change in front of you). */
  seen(deck, x, z, you = this.you3) {
    if (!you) return false;
    if (you.mode === 'helm') return deck === 1;
    if (you.mode !== 'walk' || deck !== you.deck) return false;
    return Math.hypot(x - you.x, z - you.z) < SEEN;
  }

  // --- the crew at their posts ---

  /** Who should be at post `p` now: an index into the cast, or null for nobody. */
  wanted(p) {
    const s = this.t % DAY, si = this.sections.indexOf(this.watchAt().section);
    if (p.s.watch === 'day') return inHours(s, [hm('08:00'), hm('17:00')]) ? p.k : null;
    if (p.s.watch === 'off') return !p.s.hours || inHours(s, p.s.hours.map(hm)) ? p.k + 2 * si + 1 : null;
    return p.k + 2 * si; // kept every watch: the section on watch
  }

  man(p, you) {
    const want = this.wanted(p);
    if (want === p.cur) return;
    if (p.cur !== undefined && p.m && this.seen(p.m.deck, p.s.at[0], p.s.at[1], you)) return;
    p.cur = want;
    if (p.m) this.drop(p.m), (p.m = null);
    if (want === null) return;
    placeCrew(this.C, p.s, want).then(
      (m) => {
        if (p.cur !== want || p.m) return removeCrew(m);
        p.m = m;
        this.crew.push(m);
      },
      () => {}
    );
  }

  drop(m) {
    removeCrew(m);
    const i = this.crew.indexOf(m);
    if (i >= 0) this.crew.splice(i, 1);
  }

  // --- the muster ---

  musterFrame(you, dt) {
    const M = this.W.muster, early = M.early * 60, late = M.late * 60;
    let m = this.muster;
    if (!m) {
      const x = this.nextOwn(this.t - late);
      if (x.n > this.mustered && this.t >= x.start - early && this.t < x.start + late) m = this.muster = this.fallIn(x);
      else return;
    }
    if (m.phase === 'in' && this.t >= m.x.start) {
      // The roll: you are there if you stand in the room.
      m.phase = 'called';
      const present = you.mode === 'walk' && you.room === this.you.muster;
      const line = this.fill(present ? this.W.pipes.present : this.W.pipes.adrift, m.x);
      // The career may have more to add (your next order); if it says it, it says this too.
      if (!this.onMuster?.(present, this.mine.leader, line)) this.tell(this.mine.leader, line, 7);
    }
    for (const f of m.figs) {
      if (f.m?.arrived && f.face !== undefined) f.m.root.rotation.y = f.face;
      // Walking in, they file in one behind another.
      if (f.m && f.walk && !f.started && (f.wait -= dt) <= 0) (f.started = true), (f.m.root.visible = true), (f.m.route = f.walk), f.m.play('walk');
    }
    if (m.phase === 'called' && this.t >= m.x.start + late) {
      // Fall out: they march off along `out`, and leave once you are not looking.
      m.phase = 'out';
      const room = this.C.rooms.get(this.you.muster);
      const y = this.C.interiorOf(room).floorY;
      for (const f of m.figs) {
        if (!f.m) continue;
        f.face = undefined;
        f.m.route = [f.m.root.position.clone(), ...M.out.map(([x, z]) => new THREE.Vector3(x, y, z))];
        f.m.leg = 1;
        f.m.once = true;
        f.m.arrived = false;
        f.m.play('walk');
      }
    }
    if (m.phase === 'out') {
      for (const f of m.figs) {
        if (f.m && (f.m.arrived || this.t > m.x.start + late * 4) && !this.seen(f.m.deck, f.m.root.position.x, f.m.root.position.z)) this.drop(f.m), (f.m = null), (f.gone = true);
      }
      if (m.figs.every((f) => f.gone || f.failed)) (this.mustered = m.x.n), (this.muster = null);
    }
  }

  /** Your section falls in at the muster station: the hands in a line, the leading hand before them. If you are there
   *  to see it they walk in from the passage; otherwise they are simply there. */
  fallIn(x) {
    const M = this.W.muster, room = this.C.rooms.get(this.you.muster);
    const si = this.sections.indexOf(this.mine);
    const walkIn = this.seen(room.deck, M.line[0][0], M.line[0][1]);
    const y = this.C.interiorOf(room).floorY;
    const spots = [...M.line.slice(0, M.hands).map((at) => ({ at, yaw: M.face })), { at: M.leader.at, yaw: M.leader.yaw }];
    const m = { x, phase: 'in', figs: [] };
    spots.forEach((sp, j) => {
      const f = { face: sp.yaw, wait: walkIn ? 0.01 + j * 1.3 : 0 };
      m.figs.push(f);
      const from = walkIn ? M.out[M.out.length - 1] : sp.at;
      placeCrew(this.C, { room: room.id, at: from, yaw: sp.yaw, pose: 'idle', dept: j === spots.length - 1 ? this.mine.leader.dept : 'crew' }, si * 7 + j + 3).then(
        (fig) => {
          if (this.muster !== m || m.phase === 'out') return removeCrew(fig), (f.failed = true);
          f.m = fig;
          this.crew.push(fig);
          if (walkIn) {
            f.walk = [...M.out.slice().reverse(), sp.at].map(([a, b]) => new THREE.Vector3(a, y, b));
            fig.route = null;
            fig.leg = 1;
            fig.once = true;
            fig.root.visible = false;
            fig.play('idle');
          } else fig.arrived = true;
        },
        () => (f.failed = true)
      );
    });
    return m;
  }

  // --- the board, the bunk, the bill ---

  /** The watch bill's board, on the passage wall outside the ship's office, with a "Read the watch bill" use. */
  board() {
    const office = this.C.rooms.get('ship-office');
    if (!office) return;
    const I = this.C.interiorOf(office);
    // On the wall of the passage the office opens onto, beside its door. In a drum (drum.mjs) that is the ring
    // corridor's wall, beside the room's doorway, in the room's segment's frame; elsewhere the side passage's wall.
    let x, z, yaw, off;
    if (office.drum) {
      const ring = this.C.rooms.get(`ring-${office.half}-${office.ring}`), fore = office.row === 'fore';
      const cx = (office.x[0] + office.x[1]) / 2;
      (x = cx + (fore ? -2.2 : 2.2)), (z = fore ? ring.z[0] + 0.13 : ring.z[1] - 0.13), (yaw = fore ? 0 : Math.PI), (off = [0, fore ? -0.03 : 0.03]);
      this.boardAt = { deck: office.deck, seg: office.seg, x, z: z + (fore ? 0.8 : -0.8) };
    } else {
      const door = this.L.doors.find((d) => d.between.includes('ship-office'));
      const P = this.C.rooms.get(door.between.find((r) => r !== 'ship-office'));
      (x = P.x[1] - 0.13), (z = door.at - 2.4), (yaw = -Math.PI / 2), (off = [0.03, 0]); // the wall's panels stand 0.13 m into the passage
      this.boardAt = { deck: office.deck, x: x - 0.8, z };
    }
    const cols = this.sections.map((s) => s.color);
    const face = this.C.atlas.plane(1.1, 0.8, (g, pw, ph) => {
      g.fillStyle = '#3a3226';
      g.fillRect(0, 0, pw, ph);
      g.fillStyle = '#e9e4d6';
      g.fillRect(pw * 0.06, ph * 0.08, pw * 0.88, ph * 0.84);
      g.fillStyle = '#1a1a1a';
      g.font = `700 ${Math.round(ph * 0.1)}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'center';
      g.fillText('WATCH BILL', pw / 2, ph * 0.22);
      for (let r = 0; r < 7; r++) {
        const yy = ph * (0.32 + r * 0.075);
        g.fillStyle = '#9a968c';
        g.fillRect(pw * 0.12, yy, pw * 0.36, ph * 0.025);
        for (let c = 0; c < 2; c++) {
          g.fillStyle = cols[(r + c) % cols.length];
          g.fillRect(pw * (0.56 + c * 0.17), yy - ph * 0.01, pw * 0.13, ph * 0.045);
          g.strokeStyle = '#55524a';
          g.lineWidth = 1.5;
          g.strokeRect(pw * (0.56 + c * 0.17), yy - ph * 0.01, pw * 0.13, ph * 0.045);
        }
      }
    }, 300);
    face.position.set(x, I.floorY + 1.55, z);
    face.rotation.y = yaw;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.8 }));
    frame.position.set(x + off[0], I.floorY + 1.55, z + off[1]);
    frame.rotation.y = yaw + Math.PI / 2;
    I.group.add(face, frame);
    const ux = office.drum ? x : x - 0.3, uz = office.drum ? z + Math.cos(yaw) * 0.3 : z; // a step out from the board
    I.use('watch-bill', 'Read the watch bill', ux, uz, () => this.openBill(true), { r: 2 });
  }

  /** Your bunk: turn in, and be shaken for your watch. */
  bunk() {
    const b = this.you.bunk, room = this.C.rooms.get(b.room);
    if (!room) return;
    const I = this.C.interiorOf(room, b.seg ?? room.seg);
    this.bunkAt = { deck: room.deck, seg: b.seg ?? room.seg, x: b.at[0], z: b.at[1] };
    I.use('bunk', 'Turn in: you are called for your watch', b.at[0], b.at[1], () => {
      const why = this.cantSleep();
      if (why) return this.tell(null, why, 6);
      this.onTurnIn?.(() => this.sleep());
    }, { r: 1.6 });
  }

  /** Why you cannot turn in now, or null. */
  cantSleep() {
    if (this.ship?.stations) return 'Not at action stations.';
    if (this.dc?.job) return 'Not with a damage control job on.';
    if (this.onWatch) return `${this.mine.name} has the watch. Nobody turns in on watch.`;
    const x = this.nextOwn();
    if (x.start - this.you.shake * 60 <= this.t) return `${this.mine.name} is called at ${fmt(x.start - this.you.shake * 60)}: no time to turn in.`;
    return null;
  }

  /** Asleep until you are shaken, `shake` minutes before your section's next watch. */
  sleep() {
    const x = this.nextOwn();
    this.setTime(x.start - this.you.shake * 60);
    // The posts change while you sleep: put everyone where the new time wants them, out of sight or not.
    for (const p of this.posts) this.man(p, null);
    this.tell(this.mine.leader, this.fill(this.W.pipes.shake, x), 9);
    return x;
  }

  /** The watch bill on the screen: today's and tomorrow's watches, who keeps them, the posts, and your line. `you`:
   *  { rank }. Opened from the board (`fromBoard`), or with B once you have read it. */
  openBill(fromBoard = false) {
    if (fromBoard && !this.read) (this.read = true), this.onRead?.();
    const el = this.el.bill;
    if (!el) return;
    const day = Math.floor(this.t / DAY), per = this.watches.length, now = this.watchAt().n;
    const cell = (n) => {
      const x = this.nth(n);
      return `<td class="${n === now ? 'now' : ''}${x.section === this.mine ? ' mine' : ''}" style="--c:${x.section.color}">${x.section.name.replace(' watch', '')}</td>`;
    };
    const rows = this.watches.map((w, i) => `<tr><th>${w.name}</th><td class="h">${w.from.replace(':', '')}–${w.to.replace(':', '')}</td>${cell(day * per + i)}${cell((day + 1) * per + i)}</tr>`).join('');
    const posts = (kind) => [...new Set(this.L.stations.filter((s) => s.watch === kind && s.post).map((s) => `${s.post} <i>${this.C.rooms.get(s.room)?.name ?? s.room}</i>`))].join(' · ');
    const x = this.nextOwn();
    const muster = this.C.rooms.get(this.you.muster)?.name ?? this.you.muster;
    el.innerHTML = `<div class="b-head"><b>WATCH BILL</b><span>${this.L.name ?? 'Carrier'} · day ${day + 1} · ${fmt(this.t)}</span></div>
      <table><tr><th></th><th></th><th>Today</th><th>Tomorrow</th></tr>${rows}</table>
      <div class="b-sec"><b>Kept every watch</b> ${posts('on')}</div>
      <div class="b-sec"><b>Day workers, 0800–1700</b> ${posts('day')}</div>
      <div class="b-you" style="--c:${this.mine.color}"><b>${this.rankName ?? 'You'}</b> · ${this.mine.name} · ${this.you.part} · muster at the ${muster.toLowerCase()} at the change of watch · mustered by ${this.mine.leader.name}<br>
        ${this.onWatch ? `On watch until ${fmt(this.watchAt().end)}.` : `Next on: the ${x.w.name.toLowerCase()} watch at ${fmt(x.start)}.`} Turned in, you are called ${this.you.shake} minutes before.</div>
      <div class="b-close">E or B to put it away</div>`;
    el.hidden = false;
  }

  closeBill() {
    if (this.el.bill) this.el.bill.hidden = true;
  }

  get billOpen() {
    return this.el.bill && !this.el.bill.hidden;
  }

  // --- what you see of it ---

  /** "Blue watch · on watch until 2000" or "Blue watch · off · on at 1800, the last dog". */
  yourLine() {
    if (this.onWatch) return `${this.mine.name} · on watch until ${fmt(this.watchAt().end)}`;
    const x = this.nextOwn();
    return `${this.mine.name} · off · on at ${fmt(x.start)}, the ${x.w.name.toLowerCase()}`;
  }

  clock(mode) {
    const el = this.el.clock;
    if (!el) return;
    el.hidden = mode === 'fighter' || mode === 'gun';
    const now = this.watchAt();
    const b = this.bells();
    const html = `<b>${fmt(this.t)}</b> ${now.w.name.toLowerCase()} watch · ${NUM[b]} bell${b > 1 ? 's' : ''} · <i style="--c:${now.section.color}">${now.section.name}</i>${this.night ? ' · night' : ''}`;
    if (html !== this.clockHtml) (el.innerHTML = html), (this.clockHtml = html);
  }

  /** Night lighting: the pool's lamps in the passages go a dim red, and so does the fill while you stand in one. Call
   *  after `LightPool.update`. */
  light(pool, hemi, you) {
    this.hemiBase ??= hemi.color.clone();
    hemi.color.copy(this.hemiBase);
    if (!this.night || you.mode !== 'walk') return;
    for (const l of pool.lights) {
      const s = l.userData.spec;
      if (!s?.room || this.C.rooms.get(s.room)?.system !== 'corridor') continue;
      l.color.lerp(this.nightColor, 0.9);
      l.intensity *= 0.45;
    }
    if (this.C.rooms.get(you.room)?.system === 'corridor') {
      hemi.color.copy(_c.copy(this.hemiBase).lerp(this.nightColor, 0.7));
      hemi.intensity *= 0.4;
    }
  }
}
