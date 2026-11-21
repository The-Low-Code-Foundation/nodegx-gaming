// The carrier's outside parts and what a hit on each does (design/ROADMAP.md phase 9, session 4). The rooms inside
// already take hits (integrity.mjs: air, health, holes); this is the machinery on and in her skin that a shell can
// meet first, each with its own health and its own consequence:
//
//   radiator   the two hinged panels aft (plant.mjs `radiators`): holed, she sheds heat more slowly, and a holed panel
//              weeps coolant. Its health is plant.mjs's `health`, read and written through `hp`.
//   rcs        each of the eight manoeuvring clusters (three thrusters, one per axis): it pushes at what its health
//              allows (`t.dmg`, read by integrity.mjs `systems`), so a hit cluster leaves her slower to turn one way.
//   turret     each gun turret's house and guns: under `out` it cannot turn, hoist or fire (weapons/turrets.mjs).
//   pdc        each point defence and flak mount: its health is the gun's own `hp` (weapons.mjs), under 25 out.
//   door       each hangar bay door: under `jam` it stops where it is, open or shut (doors.mjs `jam`), and a fighter
//              cannot get out or in on that side until it is freed.
//   bearing    each drum's bearing at its hub: hit through the hub ring, the drum shudders as it turns (drum.mjs
//              `drumsFrame` wobbles it; you feel it in that drum).
//
// And the tanks: a holed propellant tank vents to space until the hole is sealed (plant.mjs drains it), and the gas out
// of the hole pushes her, at the hole, so she turns and drifts unless the helm's assist spends the thrusters holding her
// (`leakPush`).
//
// What is mended, by whom and in what order is carrier-repair.mjs. Every number is the layout's `integrity.parts`.
// Hits are seeded physics (the ship's `rand`); what is seen (sparks, coolant, gas, scorch) is Math.random with its own
// scratch.

import * as THREE from 'three';
import { zapTick, jetTick } from './hitfx.mjs';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = Math.random;
// Physics scratch.
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _F = new THREE.Vector3(), _T = new THREE.Vector3();
const _q = new THREE.Quaternion();
// Looks scratch: never handed on.
const _vp = new THREE.Vector3(), _vn = new THREE.Vector3(), _vw = new THREE.Vector3(), _vd = new THREE.Vector3();

const SCORCH = new THREE.MeshBasicMaterial({ color: '#0c0b0a', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const PLATE = new THREE.MeshLambertMaterial({ color: '#5d6168', polygonOffset: true, polygonOffsetFactor: -6 });
const SCORCH_GEO = new THREE.CircleGeometry(1, 9);
const PLATE_GEO = new THREE.BoxGeometry(1, 1, 0.06);

/** The names of the eight manoeuvring clusters, in the layout's order (bow, stern for each corner). */
function rcsName(at, com) {
  const end = at.z < com.z ? 'Bow' : 'Stern';
  return `${end} ${at.x < 0 ? 'port' : 'starboard'} ${at.y > 0 ? 'upper' : 'lower'} thrusters`;
}

export class CarrierDamage {
  /** `G` the game in hand (main.mjs): `C`, `ship` (integrity), `plant`, `guns`, `doors`, `body`, `thrusters` (the
   *  carrier's thruster list), `dc`, `sfx`, `carrierGas`. */
  constructor(G) {
    this.G = G;
    const C = (this.C = G.C), L = C.L;
    this.P = L.integrity.parts;
    this.ship = G.ship;
    this.time = 0;
    this.log = []; // what was hit: { id, by, hp, t } (tests and the console)
    this.marks = new THREE.Group(); // scorch and plates on her skin, in the ship's frame
    this.marks.name = 'hull-marks';
    C.frame.add(this.marks);
    const K = this.P.kinds, com = new THREE.Vector3(...L.com);
    const parts = (this.parts = []);
    // The radiators: plant.mjs's own, their health its `health` (0 to 1).
    for (const r of G.plant?.radiators ?? []) {
      const b = r.box, side = r.m.id.endsWith('port') ? 'port' : 'starboard';
      parts.push({
        id: r.m.id, kind: 'radiator', name: `${side[0].toUpperCase() + side.slice(1)} radiator`, side, r, max: 100,
        get hp() { return r.health * 100; }, set hp(v) { r.health = clamp(v / 100, 0, 1); },
        pos: new THREE.Vector3((b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, (b.z[0] + b.z[1]) / 2),
        out: new THREE.Vector3(0, 1, 0) // worked from above
      });
    }
    // The manoeuvring clusters: the three thrusters of each layout `rcs` entry.
    L.thrusters.rcs.forEach((q, i) => {
      const at = new THREE.Vector3(...q.at);
      const ts = (G.thrusterList ?? []).filter((t) => t.kind === 'rcs' && t.pos.clone().add(com).distanceTo(at) < 0.01);
      const p = { id: `rcs-${i}`, kind: 'rcs', name: rcsName(at, com), ts, hp: 100, max: 100, pos: at, r: K.rcs.r, out: new THREE.Vector3(at.x, at.y, 0).normalize() };
      for (const t of ts) t.dmg = 1;
      parts.push(p);
    });
    // The turrets and the point defence: weapons.mjs's own.
    for (const t of G.guns?.turrets ?? []) {
      const m = L.mounts.find((x) => x.id === t.spec.mount);
      if (!m) continue;
      const p = { id: m.id, kind: 'turret', name: t.spec.name, t, hp: 100, max: 100, pos: new THREE.Vector3(...m.at), r: K.turret.r, out: new THREE.Vector3(...m.up) };
      t.part = p;
      parts.push(p);
    }
    for (const g of G.guns?.pdcs ?? []) {
      parts.push({
        id: g.m.id, kind: 'pdc', name: `${g.type === 'flak' ? 'Flak gun' : 'Point defence'} ${g.name}`, g, max: 100,
        get hp() { return g.hp; }, set hp(v) { g.hp = clamp(v, 0, 100); },
        pos: g.pivot.clone(), r: K.pdc.r, out: g.up.clone()
      });
    }
    // The bay doors: each a slab of the hangar's wall.
    for (const m of L.mounts.filter((x) => x.kind === 'bay-door')) {
      const side = m.x < 0 ? 'w' : 'e';
      parts.push({
        id: m.id, kind: 'door', name: `${side === 'w' ? 'Port' : 'Starboard'} bay door`, side, hp: 100, max: 100,
        box: { x: [m.x - 1.5, m.x + 1.5], y: m.y, z: m.z }, pos: new THREE.Vector3(m.x, (m.y[0] + m.y[1]) / 2, (m.z[0] + m.z[1]) / 2),
        out: new THREE.Vector3(Math.sign(m.x), 0, 0), jammed: false
      });
    }
    // The drums' bearings, at each hub.
    for (const h of L.drum?.halves ?? []) {
      const zc = (h.corridor[0] + h.corridor[1]) / 2;
      parts.push({ id: `bearing-${h.id}`, kind: 'bearing', name: `${h.name}'s bearing`, half: h.id, hp: 100, max: 100, pos: new THREE.Vector3(0, 0, zc), out: new THREE.Vector3(0, 1, 0) });
    }
    this.byId = new Map(parts.map((p) => [p.id, p]));
    for (const p of parts) (p.spots = []), (p.acc = {});
    this.outside = parts.filter((p) => p.kind === 'rcs' || p.kind === 'turret' || p.kind === 'pdc');
    this.leaks = []; // the tanks' open holes to space this frame, and their push (`leakPush`)
  }

  // --- hits (seeded) ---------------------------------------------------------------------------------------------------

  /** The part a shell at `q` (ship frame) has met, if any: a turret, a point defence mount or a thruster cluster
   *  standing proud of her skin (each a ball `r` round it), or a spread radiator. */
  at(q) {
    for (const p of this.outside) if (q.distanceToSquared(p.pos) <= p.r * p.r) return p;
    const r = this.G.plant?.radiatorAt(q);
    return r ? this.byId.get(r.m.id) : null;
  }

  /** The bay door a point on the hangar's wall is in, if any. */
  doorAt(q) {
    for (const p of this.parts) {
      if (p.kind !== 'door') continue;
      const b = p.box;
      if (q.x >= b.x[0] && q.x <= b.x[1] && q.y >= b.y[0] && q.y <= b.y[1] && q.z >= b.z[0] && q.z <= b.z[1]) return p;
    }
    return null;
  }

  /** Where part `id` was struck, when something else took its health (weapons/bandits.mjs `strafeHit`). */
  spot(id, q) {
    const p = this.byId.get(id);
    if (!p) return;
    p.spots.push(q.clone());
    if (p.spots.length > 4) p.spots.shift();
  }

  /** A shell's worth of damage from the layout (`shell`), seeded. */
  shellHp(k = 1) {
    const S = this.P.shell, r = this.ship.rand;
    return (S[0] + r() * (S[1] - S[0])) * k;
  }

  /** Part `p` takes `hp` at `q` (ship frame, where it was struck) from `dir` (the way the round was going), `by` what. */
  hit(p, hp, q, dir = null, by = 'shell') {
    const K = this.P.kinds[p.kind], was = p.hp;
    p.hp = Math.max(0, was - hp);
    if (q) {
      p.spots.push(q.clone());
      if (p.spots.length > 4) p.spots.shift();
    }
    this.log.push({ id: p.id, by, hp: Math.round(p.hp * 10) / 10, t: Math.round(this.time * 100) / 100 });
    this.G.repair?.hurt(p, was);
    if (q && (p.kind === 'radiator' || p.kind === 'door')) this.scorch(q, p.kind === 'radiator' ? p.out : p.out, 0.6 + hp / 60);
    const say = (text, secs = 5) => this.G.dc?.say(null, text, 0, secs);
    const bus = this.C.bus;
    if (p.kind === 'rcs' && was > K.full && p.hp <= K.full) bus?.emit('call', { id: 'thrusters-damaged', what: p.name.toLowerCase() }), say(`${p.name} damaged: she turns more slowly against them.`);
    else if (p.kind === 'turret' && was >= K.out && p.hp < K.out) bus?.emit('call', { id: 'turret-down', what: p.name }), say(`${p.name} is out of action.`);
    else if (p.kind === 'door' && was >= K.jam && p.hp < K.jam) {
      p.jammed = true;
      const doors = this.G.doors;
      doors?.jam(p.side, true);
      const k = doors?.kOf(p.side) ?? 0;
      bus?.emit('call', { id: 'bay-jammed', side: p.side === 'w' ? 'port' : 'starboard', how: k > 0.95 ? 'open' : k < 0.05 ? 'shut' : 'part open' });
      say(`${p.name} jammed ${k > 0.95 ? 'open' : k < 0.05 ? 'shut' : 'part open'}. Nothing launches or lands on that side until it is freed.`, 7);
    } else if (p.kind === 'bearing' && was >= K.shudder && p.hp < K.shudder) bus?.emit('call', { id: 'bearing-damaged', what: p.name.replace(/'s bearing$/, '').toLowerCase() }), say(`${p.name} damaged: the drum is shuddering.`, 6);
    // The radiator's call is plant.mjs's (at 40% health).
    if (p.kind === 'radiator' && was > 40 && p.hp <= 40) {
      bus?.emit('call', { id: 'radiator-damaged', side: p.side });
      say(`${p.name} damaged: she sheds heat more slowly.`);
    }
    return p;
  }

  /** A torpedo's blast at `q` (ship frame): every part within the layout's `torpedo.r`, the more the nearer. */
  blast(q) {
    const T = this.P.torpedo, r = this.ship.rand;
    for (const p of this.parts) {
      if (p.kind === 'bearing') continue;
      const d = p.kind === 'door' ? Math.max(0, Math.abs(q.z - p.pos.z) - (p.box.z[1] - p.box.z[0]) / 2) + Math.abs(q.x - p.pos.x) + Math.max(0, Math.abs(q.y - p.pos.y) - 9) : q.distanceTo(p.pos);
      if (d > T.r) continue;
      const hp = (T.hp[0] + r() * (T.hp[1] - T.hp[0])) * (1 - d / T.r);
      if (hp > 1) this.hit(p, hp, _a.copy(q).lerp(p.pos, 0.5), null, 'torpedo');
    }
  }

  /** A shell through a hub ring's armour (integrity.mjs `structureHit`): its drum's bearing takes a share. */
  hub(half, damage) {
    const p = this.byId.get(`bearing-${half}`);
    if (p) this.hit(p, damage * this.P.structure, null, null, 'hub');
  }

  // --- what the damage does, every frame ---------------------------------------------------------------------------------

  /** After integrity.mjs and plant.mjs have stepped (main.mjs): each part's consequence, the tanks' push, the looks. */
  frame(dt, { you = null, mode = 'walk' } = {}) {
    this.time += dt;
    const K = this.P.kinds;
    for (const p of this.parts) {
      if (p.kind === 'rcs') {
        const k = clamp((p.hp - K.rcs.off) / (K.rcs.full - K.rcs.off), 0, 1);
        for (const t of p.ts) t.dmg = k;
      } else if (p.kind === 'turret') p.t.out = p.hp < K.turret.out;
      else if (p.kind === 'door' && p.jammed && p.hp >= K.door.jam) {
        p.jammed = false;
        this.G.doors?.jam(p.side, false);
        this.C.bus?.emit('call', { id: 'bay-clear', side: p.side === 'w' ? 'port' : 'starboard' });
        this.G.dc?.say(null, `${p.name} freed: it answers the switch again.`, 0, 5);
      } else if (p.kind === 'bearing') {
        const hv = this.C.drums?.halves.find((h) => h.id === p.half);
        if (hv) hv.shudder = clamp((K.bearing.shudder - p.hp) / K.bearing.shudder, 0, 1);
      }
    }
    this.leakPush(dt);
    this.looks(dt, you, mode);
  }

  /** The gas out of each open hole in a propellant tank pushes her (at the hole, into the ship: the gas goes out), at
   *  the tank's share of plant.mjs's leak shared over its holes, leaving at `leak.ve`. Straight onto her body: the helm's
   *  assist (newton.mjs) sees her turning and drifting and spends the thrusters against it. */
  leakPush(dt) {
    const pl = this.G.plant, body = this.G.body, L = this.C.L;
    this.leaks.length = 0;
    if (!pl || !body || pl.prop <= 0) return;
    const ve = this.P.leak.ve, com = _c.set(...L.com);
    for (const k of pl.tanks) {
      const n = this.ship.node(k.id);
      const open = n?.holes.filter((h) => !h.sealed && !h.to) ?? [];
      if (!open.length) continue;
      const mdot = (pl.prop0 * k.share * pl.P.propellant.leak) / open.length; // kg/s out of each hole
      for (const h of open) {
        const at = h.hull ?? h.at;
        _F.copy(h.normal).multiplyScalar(mdot * ve); // ship frame: the push is into her, the gas going out
        _T.subVectors(at, com).cross(_F); // ship frame torque
        body.ang.x += (_T.x / body.I.x) * dt;
        body.ang.y += (_T.y / body.I.y) * dt;
        body.ang.z += (_T.z / body.I.z) * dt;
        _q.copy(this.C.obj.quaternion);
        body.vel.addScaledVector(_a.copy(_F).applyQuaternion(_q), dt / body.mass);
        this.leaks.push({ h, at, force: mdot * ve });
      }
    }
  }

  // --- what you see (Math.random) ----------------------------------------------------------------------------------------

  /** A scorch on her skin at `q` facing `n` (ship frame), `s` m across. */
  scorch(q, n, s) {
    const m = new THREE.Mesh(SCORCH_GEO, SCORCH);
    m.scale.setScalar(s * (0.8 + 0.4 * R()));
    m.position.copy(q).addScaledVector(n, 0.08);
    m.lookAt(_vw.copy(m.position).add(n));
    m.rotateZ(R() * 6.28);
    this.marks.add(m);
    return m;
  }

  /** A plate welded over a hole in her skin at `q` facing `n` (carrier-repair.mjs, when a drone has sealed it). */
  plate(q, n, s) {
    const m = new THREE.Mesh(PLATE_GEO, PLATE);
    m.scale.set(s, s, 1);
    m.position.copy(q).addScaledVector(n, 0.1);
    m.lookAt(_vw.copy(m.position).add(n));
    m.rotateZ(R() * 0.6);
    this.marks.add(m);
    return m;
  }

  looks(dt, you, mode) {
    const C = this.C;
    if (!C.exterior?.visible) return;
    const B = C.blazes?.in(C.frame, { clipPlanes: null, near: [1.5, 9] });
    const gas = this.G.carrierGas;
    if (!B) return;
    for (const p of this.parts) {
      const hurt = 1 - p.hp / p.max;
      if (hurt < 0.3 || !p.spots.length || p.kind === 'bearing') continue;
      const q = p.spots[(p.acc.i = ((p.acc.i ?? 0) + 1) % p.spots.length)];
      // A badly hit part throws sparks now and then; a holed radiator weeps coolant from each hole while spread.
      zapTick(B, q, p.out, dt * hurt, false);
      if (p.kind === 'radiator' && p.r.k > 0.3) for (const s of p.spots) jetTick(B, s, _vd.copy(p.out).negate().add(_vn.set(R() - 0.5, 0, R() - 0.5)).normalize(), dt / p.spots.length, false, 0.6 * hurt, (p.acc.jet ??= {}));
    }
    // Propellant out of a holed tank: a frosty jet in the world, off the hole.
    if (gas) for (const l of this.leaks) {
      const pw = C.frame.localToWorld(_vp.copy(l.at));
      const dw = _vd.copy(l.h.normal).negate().transformDirection(C.frame.matrixWorld);
      gas.nozzle(`tank-leak-${this.leaks.indexOf(l)}`, pw, dw, 0.7, dt, { s: 1.6 });
    }
  }

  /** Rows for the status board (integrity.mjs `status`): the parts that are hurt. */
  rows() {
    const K = this.P.kinds, rows = [];
    const of = (kind) => this.parts.filter((p) => p.kind === kind);
    const rcs = of('rcs'), hurt = rcs.filter((p) => p.hp < 99);
    rows.push(['Thrusters', rcs.reduce((s, p) => s + p.hp, 0) / (100 * Math.max(1, rcs.length)), hurt.length ? `${hurt.length} cluster${hurt.length > 1 ? 's' : ''} hit` : 'all well']);
    const tur = of('turret'), out = tur.filter((p) => p.hp < K.turret.out);
    rows.push(['Turrets', tur.reduce((s, p) => s + p.hp, 0) / (100 * Math.max(1, tur.length)), out.length ? `${out.length} out of action` : `${tur.length} in action`]);
    for (const p of of('door')) if (p.hp < 99) rows.push([p.name, p.hp / 100, p.jammed ? 'JAMMED' : 'damaged']);
    for (const p of of('bearing')) if (p.hp < 99) rows.push([p.name, p.hp / 100, p.hp < K.bearing.shudder ? 'shuddering' : 'damaged']);
    return rows;
  }
}

/** The way out of her skin at `q` (ship frame) on a boxy hull: the face of the loft section nearest it. */
export function skinNormal(L, q, out) {
  const list = L.hull.main;
  let s = null;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (q.z < a.z || q.z > b.z) continue;
    const k = (q.z - a.z) / Math.max(1e-6, b.z - a.z);
    s = { w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k, y: a.y + (b.y - a.y) * k };
    break;
  }
  if (!s) return out.set(0, 0, Math.sign(q.z) || 1);
  return Math.abs(q.x) / (s.w / 2) >= Math.abs(q.y - s.y) / (s.h / 2) ? out.set(Math.sign(q.x) || 1, 0, 0) : out.set(0, Math.sign(q.y - s.y) || 1, 0);
}
