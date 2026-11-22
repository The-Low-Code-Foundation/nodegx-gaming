// Mending her systems: the hands you put on repairs (crew-orders.mjs), and you, put back the health a hit took from
// her compartments, so a wrecked drive, reactor or switchgear comes back and she is not left adrift. The layout's
// `integrity.mend` turns it on (the cutter has it; the carrier mends by her damage control jobs and her parties,
// carrier-repair.mjs, and has none).
//
// What there is to do (`jobs()`), most urgent first:
//   - the damage control job in hand (a fire, a fault, a leak: damage.mjs), which a hand works with `dc.help()`;
//   - each compartment of a system in `order` that is under `below` health: first every one under the health at which
//     its system works again (`works`, by system; 60 for one not named), in `order`, then the rest back to whole, in
//     `order`, the worst first within a system. So power and the drive come back before anything is made whole. A
//     sealed compartment is worked from the walkable room nearest it on her deck (`at` overrides by id).
//
// A hand takes the most urgent job no other hand has (or shares the last one), spends `travel` seconds getting to it,
// then puts back `rate` health a second (a damage control job: `dc` of your pace). You: a use in each room that has
// work ("Hold E: mend the main drive"), with the tool kit (`kit`), at `you` health a second, alongside any hand.
//
// `integrity.mend`: { rate, you, travel, dc, below, kit, order: [system…], works: { system: health }, at: { id: room } }.

import { clamp } from '../util.mjs';

const NAMES = {
  drive: 'main drive', reactor: 'reactor', power: 'switchgear', 'life-support': 'life support', turret: 'turret barbette',
  magazine: 'magazine', pdc: 'point defence magazine', heat: 'heat sinks', sensors: 'sensors', tanks: 'tank', repair: 'drone rack'
};

export class Mend {
  /** `G`: the game in hand (main.mjs): `C`, `L`, `ship` (integrity.mjs), `dc` (damage.mjs), `walker`. */
  constructor(G) {
    this.G = G;
    this.C = G.C;
    this.M = { rate: 1.2, you: 1.4, travel: 10, dc: 0.8, below: 99.5, kit: 'toolkit', order: [], at: {}, ...G.L.integrity.mend };
    this.hands = new Map(); // crew id → { who, job (key), t (seconds still to get there) }
    this.log = []; // { what, by, t }: each compartment brought back whole
    this.time = 0;
    this.working = false; // you, this frame
    // Where each compartment is worked from: itself if you can walk in it, else the nearest walkable room on her deck.
    this.from = new Map();
    const walk = [...this.C.rooms.values()].filter((c) => c.access === 'walk' && c.deck != null);
    const gap = (a, b, k) => Math.max(0, a[k][0] - b[k][1], b[k][0] - a[k][1]);
    for (const c of this.C.rooms.values()) {
      if (!this.M.order.includes(c.system)) continue;
      const at = this.M.at[c.id] ?? (c.access === 'walk' ? c.id : walk.reduce((best, w) => (Math.hypot(gap(c, w, 'x'), gap(c, w, 'z')) < Math.hypot(gap(c, best, 'x'), gap(c, best, 'z')) ? w : best), walk[0])?.id);
      if (at) this.from.set(c.id, at);
    }
    // Your uses: one in each room that work is done from, offered while there is work there.
    this.uses = new Map();
    for (const id of new Set(this.from.values())) {
      const c = this.C.rooms.get(id), I = this.C.interiorOf(c);
      const u = I.use(`mend-${id}`, '', (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, () => this.press(id), { r: Math.max(2.5, Math.min(c.x[1] - c.x[0], c.z[1] - c.z[0]) * 0.6) });
      u.hidden = () => !this.top(id);
      this.uses.set(id, u);
    }
  }

  /** The health of compartment `id` (0 to 100). */
  health(id) {
    return this.G.ship.node(id)?.health ?? 100;
  }

  /** What there is to do, most urgent first: `{ key, kind: 'dc' | 'node', id, label, pct, room }`. */
  jobs() {
    const out = [], dc = this.G.dc?.job;
    if (dc) out.push({ key: 'dc', kind: 'dc', id: dc.room.id, room: dc.room.id, label: `${dc.kind === 'fire' ? 'the fire' : dc.kind === 'leak' ? 'the leak' : 'the fault'} in the ${dc.room.name.toLowerCase()}`, pct: Math.round((100 * dc.progress) / Math.max(1e-6, this.G.dc.need(dc))) });
    const nodes = [...this.from.keys()].filter((id) => this.health(id) < this.M.below);
    const sys = (id) => this.C.rooms.get(id).system, rank = (id) => this.M.order.indexOf(sys(id));
    const tier = (id) => (this.health(id) < (this.M.works?.[sys(id)] ?? 60) ? 0 : 1);
    nodes.sort((a, b) => tier(a) - tier(b) || rank(a) - rank(b) || this.health(a) - this.health(b));
    for (const id of nodes) out.push({ key: `node:${id}`, kind: 'node', id, room: this.from.get(id), label: this.nameOf(id), pct: Math.round(this.health(id)) });
    return out;
  }

  nameOf(id) {
    const c = this.C.rooms.get(id);
    return c.access === 'walk' ? c.name.toLowerCase() : NAMES[c.system] ?? c.name.toLowerCase();
  }

  /** The most urgent compartment worked from room `room`, or null. */
  top(room) {
    return this.jobs().find((j) => j.kind === 'node' && j.room === room) ?? null;
  }

  /** E at a room's use: says what is missing (holding E does the work, `frame`). */
  press(room) {
    const dc = this.G.dc, kit = this.M.kit;
    if (kit && dc && !dc.carry.has(kit)) dc.say(null, `You need ${dc.D.kits[kit]?.name ?? 'a tool kit'} to mend it. ${dc.whereKit(kit)}`);
  }

  /** Each frame. `crew`: the hands on repairs, `[{ id, who }]` (crew-orders.mjs). `f`, `walker`, `mode`: yours. */
  frame(dt, crew, f, walker, mode) {
    this.time += dt;
    const jobs = this.jobs();
    // The hands: each to the most urgent job no other hand has, or the first if every one is taken.
    const taken = new Set();
    for (const [id, h] of this.hands) if (!crew.some((c) => c.id === id)) this.hands.delete(id);
    for (const c of crew) {
      let h = this.hands.get(c.id);
      const at = h ? jobs.findIndex((j) => j.key === h.job) : -1;
      // Still on it, unless something more urgent has come up that nobody has (a damage control job is seen through).
      const better = at > 0 && jobs[at].kind !== 'dc' && jobs.findIndex((x) => !taken.has(x.key)) < at;
      if (at < 0 || better) {
        const j = jobs.find((x) => !taken.has(x.key)) ?? jobs[0];
        if (!j) {
          if (h) this.hands.delete(c.id);
          continue;
        }
        h = { who: c.who, job: j.key, t: h ? this.M.travel * 0.5 : this.M.travel };
        this.hands.set(c.id, h);
      }
      taken.add(h.job);
      if ((h.t -= dt) > 0) continue;
      const j = jobs.find((x) => x.key === h.job);
      if (j.kind === 'dc') this.G.dc.help(dt, this.M.dc, h.who);
      else this.add(j.id, this.M.rate * dt, h.who);
    }
    // You, holding E at a room's use with the kit.
    this.working = false;
    for (const [room, u] of this.uses) {
      const j = this.top(room);
      if (!j) continue;
      const kit = !this.M.kit || this.G.dc?.carry.has(this.M.kit);
      const here = mode === 'walk' && walker.nearestUse() === u;
      const on = here && kit && f.keys.has('KeyE');
      if (on) (this.working = true), this.add(j.id, this.M.you * dt, 'you');
      const hand = [...this.hands.values()].find((h) => h.job === j.key && h.t <= 0);
      u.label = !kit ? `The ${j.label} needs mending (${j.pct}%): you need ${this.G.dc?.D.kits[this.M.kit]?.name ?? 'a tool kit'}` : on ? `Mending the ${j.label}: ${j.pct}%` : `Hold E: mend the ${j.label} (${j.pct}%)${hand ? `, with ${hand.who}` : ''}`;
      u.key = on ? '' : 'E';
    }
  }

  /** Puts `hp` health back into compartment `id`, by `by`. */
  add(id, hp, by) {
    const n = this.G.ship.node(id);
    if (!n) return;
    const was = n.health;
    n.health = clamp(n.health + hp, 0, 100);
    if (was < this.M.below && n.health >= this.M.below) {
      this.log.push({ what: id, by, t: Math.round(this.time) });
      this.G.dc?.say(null, `The ${this.nameOf(id)} is mended${by === 'you' ? '' : `: ${by}`}.`, 0, 4);
    }
  }

  /** What hand `id` is doing, for the crew's line: `{ label, pct, going }` or null. */
  doing(id) {
    const h = this.hands.get(id);
    if (!h) return null;
    const j = this.jobs().find((x) => x.key === h.job);
    return j ? { label: j.label, pct: j.pct, going: h.t > 0 } : null;
  }
}
