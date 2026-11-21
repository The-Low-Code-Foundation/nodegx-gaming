// What a hit does to your fighter (design/ROADMAP.md phase 9, session 2). The model stays whole: damage is drawn on her
// and modelled, never torn off.
//
// Her parts are the layout's `fighter.damage.parts` (set in tools/carrier-v2.mjs): the drive, the four jet blocks, the
// propellant tank (port) and the jet gas tank (starboard), the two radiators, the cockpit and canopy, the chin guns, each
// a few boxes, balls or cylinders in her frame with its own health, their shares adding up to her hull
// (`weapons.fighter.hull`). `hit()` (weapons/raid.mjs `fighterHit`, for the raider's flak, the bandits' guns, missiles and
// collide.mjs's crashes) places a hit:
//   a shot     on the first part its line meets in her frame (the nearest part to the line if it meets none), and what
//              that part cannot take goes on along the line, `pass` of it, to the next part;
//   a missile  (`blast`) `blast` of it to the part nearest the burst, the rest (and what that part could not take) to
//              every part by its share, less with distance (`reach`); what a part cannot take of its share is lost;
//   a crash    `crash` of it to the part struck, the rest to every part by its share: the whole airframe takes the shock.
// A part with `armour` takes that fraction of what reaches it (the cockpit: an armoured capsule).
// `total` is what is left of all of them (`guns.fhull`). She is dead in space (`dead`: weapons/raid.mjs says
// `fighter-down` and the tug comes) when her cockpit is gone, the total is gone, or her drive and `dead.jets` of her jet
// blocks are out.
//
// What each does, through flight.mjs's `harm` (seeded physics: nothing here is random): the drive's thrust falls with its
// health (`drive.floor` + health, nothing at 0), each lost radiator takes `radiator.drive` off the drive's full push (the
// waste heat has nowhere to go), a jet block's nozzles push at its health (a dead one leaves her turning and sliding
// crooked when you ask for a turn, and the attitude hold fights it with what is left), and a holed tank leaks
// (`leak[tank].rate` kg/s × the damage, split over its holes), the gas out of each hole a small thrust of its own there,
// draining that tank. The guns (`gunsK`): under `guns.one` one barrel at half the rate, under `guns.jam` none
// (weapons/fighter-guns.mjs). The cockpit under `cockpit.crack`: the canopy is cracked and the HUD flickers (`flicker`,
// cockpit.mjs).
//
// What you see (Math.random only, private scratch vectors: the fingerprints never see it): scorch and holes drawn on her
// as decals where the hit met her model (a small grid laid onto the surface by ray casts against her own meshes, with
// three-mesh-bvh, parented to the mesh it is on, so it folds with a radiator and opens with the canopy; cracks on the
// canopy's glass), a small blast and embers at the hit (blaze.mjs, in her frame), sparks off a badly damaged part, and
// the gas venting out of each hole in a tank (gas.mjs, in the world, with her velocity). The cockpit's right-hand
// screen shows the damage page (cockpit.mjs `dmg`, from `rows()`), and a hit sounds the caution or warning tones.
// `reset()` mends her (on her pad, for now: session 3 brings repair crews).

import * as THREE from 'three';
import { MeshBVH } from '../../vendor/three-mesh-bvh/index.module.js';
import { hullBlast, zapTick } from './hitfx.mjs';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Physics scratch (hit placement).
const _m = new THREE.Matrix4(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
// Looks scratch: never handed on, never shared with the physics.
const _vp = new THREE.Vector3(), _vv = new THREE.Vector3(), _vn = new THREE.Vector3(), _vs = new THREE.Vector3();
const _vu = new THREE.Vector3(), _vw = new THREE.Vector3(), _vm = new THREE.Matrix4(), _vray = new THREE.Ray();
const _vray2 = new THREE.Ray();
const R = Math.random, rnd = (a, b) => a + (b - a) * R();

/** A part's health band: what the cockpit says and colours it. */
export function band(k) {
  return k <= 0 ? 'out' : k < 0.34 ? 'bad' : k < 0.67 ? 'hit' : k < 0.999 ? 'scuffed' : 'ok';
}

// --- shapes in her frame ---------------------------------------------------------------------------------------------

/** Where the ray o + t·d (d unit) first enters shape `s`, as { t, n }, or null. */
function enter(s, o, d) {
  if (s.box) {
    const [cx, cy, cz, hx, hy, hz] = s.box, c = [cx, cy, cz], h = [hx, hy, hz];
    let t0 = -Infinity, t1 = Infinity, ax = 0;
    for (let i = 0; i < 3; i++) {
      const oi = o.getComponent(i) - c[i], di = d.getComponent(i);
      if (Math.abs(di) < 1e-9) {
        if (Math.abs(oi) > h[i]) return null;
        continue;
      }
      let a = (-h[i] - oi) / di, b = (h[i] - oi) / di;
      if (a > b) [a, b] = [b, a];
      if (a > t0) (t0 = a), (ax = i);
      t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
    if (t1 < 0) return null;
    const n = new THREE.Vector3();
    n.setComponent(ax, -Math.sign(d.getComponent(ax)) || 1);
    return { t: Math.max(0, t0), n };
  }
  if (s.ball) {
    const [x, y, z, r] = s.ball;
    const oc = _c.set(o.x - x, o.y - y, o.z - z), b = oc.dot(d), cc = oc.lengthSq() - r * r, disc = b * b - cc;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0 && -b + Math.sqrt(disc) < 0) return null;
    const tt = Math.max(0, t);
    return { t: tt, n: new THREE.Vector3(o.x + d.x * tt - x, o.y + d.y * tt - y, o.z + d.z * tt - z).normalize() };
  }
  if (s.cyl) {
    const [x, y, z0, z1, r] = s.cyl;
    let best = null;
    const ox = o.x - x, oy = o.y - y, a = d.x * d.x + d.y * d.y;
    if (a > 1e-9) {
      const b = ox * d.x + oy * d.y, cc = ox * ox + oy * oy - r * r, disc = b * b - a * cc;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a, zz = o.z + d.z * t;
        if (t >= 0 && zz >= z0 && zz <= z1) best = { t, n: new THREE.Vector3(ox + d.x * t, oy + d.y * t, 0).normalize() };
      }
    }
    if (Math.abs(d.z) > 1e-9) for (const [zc, s] of [[z0, -1], [z1, 1]]) {
      const t = (zc - o.z) / d.z;
      if (t < 0 || (best && t >= best.t)) continue;
      const px = ox + d.x * t, py = oy + d.y * t;
      if (px * px + py * py <= r * r && Math.sign(d.z) === -s) best = { t, n: new THREE.Vector3(0, 0, s) };
    }
    return best;
  }
  return null;
}

/** The point of shape `s` nearest `q` (into `out`) and the way out of it there (into `n`); returns the distance. */
function nearest(s, q, out, n) {
  if (s.box) {
    const [cx, cy, cz, hx, hy, hz] = s.box;
    out.set(clamp(q.x, cx - hx, cx + hx), clamp(q.y, cy - hy, cy + hy), clamp(q.z, cz - hz, cz + hz));
    const d = out.distanceTo(q);
    if (d > 1e-6) n.subVectors(q, out).normalize();
    else {
      // Inside: the nearest face.
      const f = [hx - Math.abs(q.x - cx), hy - Math.abs(q.y - cy), hz - Math.abs(q.z - cz)];
      const i = f.indexOf(Math.min(...f));
      n.set(0, 0, 0).setComponent(i, Math.sign(q.getComponent(i) - [cx, cy, cz][i]) || 1);
      out.setComponent(i, [cx, cy, cz][i] + n.getComponent(i) * [hx, hy, hz][i]);
    }
    return d;
  }
  if (s.ball) {
    const [x, y, z, r] = s.ball;
    n.set(q.x - x, q.y - y, q.z - z);
    const l = n.length();
    if (l < 1e-6) n.set(0, 1, 0);
    else n.divideScalar(l);
    out.set(x, y, z).addScaledVector(n, r);
    return Math.max(0, l - r);
  }
  const [x, y, z0, z1, r] = s.cyl;
  n.set(q.x - x, q.y - y, 0);
  const l = n.length();
  if (l < 1e-6) n.set(1, 0, 0);
  else n.divideScalar(l);
  const zz = clamp(q.z, z0, z1);
  out.set(x + n.x * r, y + n.y * r, zz);
  return Math.hypot(Math.max(0, l - r), q.z - zz);
}

// --- the decals' look ------------------------------------------------------------------------------------------------

let ATLAS = null;
/** One texture, four cells: a scorch, a scorch with a small hole, a big hole with its petals bent out, a crack in glass. */
function atlas() {
  if (ATLAS) return ATLAS;
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S * 2;
  const g = cv.getContext('2d');
  const scorch = (ox, oy, k) => {
    const c = S / 2;
    for (let i = 0; i < 90; i++) {
      const a = R() * Math.PI * 2, r = Math.pow(R(), 0.6) * c * 0.92, s = rnd(6, 30) * k;
      const x = ox + c + Math.cos(a) * r * 0.9, y = oy + c + Math.sin(a) * r * 0.9;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      const al = 0.32 * (1 - r / c);
      gr.addColorStop(0, `rgba(12, 9, 7, ${al})`);
      gr.addColorStop(1, 'rgba(12, 9, 7, 0)');
      g.fillStyle = gr;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    // Streaks thrown out from the middle.
    g.strokeStyle = 'rgba(20, 14, 10, 0.25)';
    for (let i = 0; i < 26; i++) {
      const a = R() * Math.PI * 2, r0 = rnd(0.1, 0.3) * c, r1 = rnd(0.5, 0.95) * c;
      g.lineWidth = rnd(1, 4);
      g.beginPath();
      g.moveTo(ox + c + Math.cos(a) * r0, oy + c + Math.sin(a) * r0);
      g.lineTo(ox + c + Math.cos(a) * r1, oy + c + Math.sin(a) * r1);
      g.stroke();
    }
    const gr = g.createRadialGradient(ox + c, oy + c, 0, ox + c, oy + c, c * 0.75);
    gr.addColorStop(0, 'rgba(8, 6, 5, 0.95)');
    gr.addColorStop(0.5, 'rgba(14, 10, 8, 0.6)');
    gr.addColorStop(1, 'rgba(8, 6, 5, 0)');
    g.fillStyle = gr;
    g.fillRect(ox, oy, S, S);
  };
  const hole = (ox, oy, r) => {
    const c = S / 2, pts = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, rr = r * rnd(0.6, 1.25);
      pts.push([ox + c + Math.cos(a) * rr, oy + c + Math.sin(a) * rr]);
    }
    // Bare metal torn round it, then the dark inside.
    g.fillStyle = 'rgba(120, 116, 108, 0.95)';
    g.beginPath();
    pts.forEach(([x, y], i) => g.lineTo(c + ox + (x - ox - c) * 1.35, c + oy + (y - oy - c) * 1.35));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(3, 3, 4, 1)';
    g.beginPath();
    pts.forEach(([x, y]) => g.lineTo(x, y));
    g.closePath();
    g.fill();
  };
  scorch(0, 0, 1);
  scorch(S, 0, 1);
  hole(S, 0, 18);
  scorch(0, S, 1.3);
  hole(0, S, 38);
  // The glass: a star of cracks and rings round a white bruise.
  const cx = S + S / 2, cy = S + S / 2;
  g.strokeStyle = 'rgba(235, 245, 255, 0.85)';
  for (let i = 0; i < 14; i++) {
    let a = R() * Math.PI * 2, x = cx, y = cy;
    g.lineWidth = rnd(0.8, 2);
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      a += rnd(-0.35, 0.35);
      const l = rnd(8, 20);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    const r = rnd(18, 70);
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2, rr = r * rnd(0.85, 1.15);
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.stroke();
  }
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 16);
  gr.addColorStop(0, 'rgba(240, 248, 255, 0.9)');
  gr.addColorStop(1, 'rgba(240, 248, 255, 0)');
  g.fillStyle = gr;
  g.fillRect(cx - 16, cy - 16, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const skin = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide });
  const glass = new THREE.MeshBasicMaterial({ map: tex, color: '#9aa6b2', transparent: true, depthWrite: false, vertexColors: true, side: THREE.DoubleSide, opacity: 0.5 });
  ATLAS = { tex, skin, glass };
  return ATLAS;
}
const CELL = { scorch: [0, 0], hole: [1, 0], big: [0, 1], crack: [1, 1] };

// --- the damage ------------------------------------------------------------------------------------------------------

export class FighterDamage {
  /** `C` the carrier (its layout's `fighter.damage`), `fighter` the one you fly (fighter.mjs), `gas` her gas (gas.mjs),
   *  `blazes` C.blazes, `sfx` for the tones, `hull` what the parts add up to, `say(text)` the card's line. */
  constructor(C, fighter, { gas = null, blazes = null, sfx = null, hull = 100, say = null } = {}) {
    this.C = C;
    this.fighter = fighter;
    this.gas = gas;
    this.blazes = blazes;
    this.sfx = sfx;
    this.say = say;
    this.S = C.L.fighter.damage;
    this.hull = hull;
    const sum = this.S.parts.reduce((s, p) => s + p.hp, 0);
    this.parts = this.S.parts.map((p) => ({ ...p, max: (p.hp / sum) * hull, hp: (p.hp / sum) * hull, holes: [], at: null, n: null, band: 'ok' }));
    this.by = Object.fromEntries(this.parts.map((p) => [p.id, p]));
    this.com = new THREE.Vector3(...C.L.fighter.flight.com);
    this.harm = { drive: 1, blocks: C.L.fighter.flight.blocks.map(() => 1), leaks: [] };
    this.clean = true;
    this.decals = [];
    this.hits = []; // the last twenty: { part, dmg, kind } (tests and the console)
    this.time = 0;
    this.lastHit = -99;
    this.alarm = null; // the tone playing: { kind, left, t }
    this.remind = 0;
    this.acc = {};
    this.flicker = 0;
  }

  /** What is left of her, all parts together (`guns.fhull`). */
  get total() {
    let s = 0;
    for (const p of this.parts) s += Math.max(0, p.hp);
    return s;
  }

  /** A part's health, 0..1. */
  k(id) {
    const p = this.by[id];
    return p ? Math.max(0, p.hp) / p.max : 1;
  }

  get jetsOut() {
    return this.parts.filter((p) => p.does === 'jets' && p.hp <= 0).length;
  }

  /** Dead in space: no cockpit, nothing left, or no drive and too few jets to steer. */
  get dead() {
    if (this.parts.some((p) => p.does === 'cockpit' && p.hp <= 0)) return true;
    if (this.total <= 1e-6) return true;
    return this.parts.some((p) => p.does === 'drive' && p.hp <= 0) && this.jetsOut >= (this.S.dead?.jets ?? 3);
  }

  /** The guns' health (weapons/fighter-guns.mjs: one barrel, or jammed). */
  get gunsK() {
    const p = this.parts.find((q) => q.does === 'guns');
    return p ? Math.max(0, p.hp) / p.max : 1;
  }

  get cracked() {
    return this.k('cockpit') < (this.S.cockpit?.crack ?? 0.75);
  }

  /** Mended: every part whole, no holes, the decals gone (on her pad). Cheap when she is whole already. */
  reset() {
    if (this.clean) return;
    this.clean = true;
    for (const p of this.parts) (p.hp = p.max), (p.holes = []), (p.at = p.n = null), (p.band = 'ok');
    this.harm.drive = 1;
    this.harm.blocks.fill(1);
    this.harm.leaks = [];
    const fl = this.fighter.flight;
    fl.harm = null;
    fl.harmed();
    for (const d of this.decals) d.mesh.removeFromParent(), d.mesh.geometry.dispose();
    this.decals = [];
    this.alarm = null;
    this.flicker = 0;
  }

  // --- a hit (physics: no randoms) -------------------------------------------------------------------------------------

  /** A hit at world point `pw` doing `dmg`. `dir` (world) the way the shot was going relative to her (a crash: the
   *  surface's normal, into her); `crash` the speed of a crash; `blast` a missile's burst. Returns what it did. */
  hit(pw, dmg, { dir = null, crash = 0, blast = false } = {}) {
    const S = this.S, obj = this.fighter.obj;
    if (!obj || !(dmg > 0)) return null;
    obj.updateWorldMatrix(true, false);
    _m.copy(obj.matrixWorld).invert();
    const p = _p.copy(pw).applyMatrix4(_m);
    const d = _d;
    if (dir && dir.lengthSq() > 1e-12) d.copy(dir).transformDirection(_m);
    else d.copy(this.com).sub(p);
    if (d.lengthSq() < 1e-12) d.set(0, 0, -1);
    d.normalize();
    // Every part the line meets, in order along it.
    const o = _o.copy(p).addScaledVector(d, -12);
    const line = [];
    for (const part of this.parts) {
      let best = null;
      for (const s of part.shapes) {
        const e = enter(s, o, d);
        if (e && e.t <= 24 && (!best || e.t < best.t)) best = e;
      }
      if (best) line.push({ part, t: best.t, n: best.n });
    }
    line.sort((a, b) => a.t - b.t);
    const before = this.parts.map((q) => q.band);
    const got = new Map(); // part → { amt, at, n }
    // A part takes what it can of `amt` (an armoured one, `armour` of it) and gives back what is left over.
    // `holes`: what it takes here can hole a tank (a shot, a burst's splinters; not a crash's shock through her).
    const give = (part, amt, at, n, holes = true) => {
      const arm = part.armour ?? 1, take = Math.min(Math.max(0, part.hp), amt * arm);
      part.hp -= take;
      const g = got.get(part) ?? { amt: 0, holing: 0, at: at.clone(), n: n.clone() };
      g.amt += take;
      if (holes) g.holing += take;
      got.set(part, g);
      return amt - take / arm;
    };
    // The share that lands where it struck: along the line, or (no part on it, or a burst) the part nearest.
    let local = blast ? dmg * S.blast : crash ? dmg * S.crash : dmg;
    let first = null, spill = 0;
    if (line.length && !blast) {
      first = { part: line[0].part, n: line[0].n.clone(), at: _q.copy(o).addScaledVector(d, line[0].t).clone() };
      for (const l of line) {
        if (local < 1e-6) break;
        const at = _q.copy(o).addScaledVector(d, l.t);
        local = give(l.part, local, at, l.n) * S.pass;
      }
    } else {
      // A burst, or a shot that passes within reach of her and meets nothing: the part nearest.
      const q = blast ? p.clone() : o.clone().addScaledVector(d, _c.copy(this.com).sub(o).dot(d));
      let bp = null, bd = Infinity;
      for (const part of this.parts) for (const s of part.shapes) {
        const dd = nearest(s, q, _q, _n);
        if (dd < bd) (bd = dd), (bp = { part, at: _q.clone(), n: _n.clone() });
      }
      if (bp) {
        first = { part: bp.part, n: bp.n, at: bp.at };
        spill = give(bp.part, local, bp.at, bp.n);
      }
    }
    // The rest, over every part: by its share (a crash's shock), and by distance for a burst (with what the part
    // nearest it could not take).
    const rest = blast ? dmg * (1 - S.blast) + spill : crash ? dmg * (1 - S.crash) : 0;
    if (rest > 0) {
      const w = this.parts.map((part) => {
        let dd = Infinity;
        for (const s of part.shapes) dd = Math.min(dd, nearest(s, p, _q, _n));
        return { part, w: part.max * (blast ? Math.max(0, 1 - dd / S.reach) : 1), dd };
      });
      // One pass, by share: what a part cannot take of its share is spent on it (no part takes another's).
      const W = w.reduce((s, x) => s + x.w, 0);
      if (W > 0) for (const x of w) {
        if (!(x.w > 0) || x.part.hp <= 0) continue;
        let at = null, n = null;
        for (const s of x.part.shapes) {
          const dd = nearest(s, p, _q, _n);
          if (dd <= x.dd + 1e-9) (at = _q.clone()), (n = _n.clone());
        }
        give(x.part, (rest * x.w) / W, at ?? p, n ?? _n.set(0, 1, 0), blast);
      }
    }
    // Holes in the tanks, and where each part was last hit.
    for (const [part, g] of got) {
      if (!(g.amt > 0)) continue;
      part.at = g.at;
      part.n = g.n;
      if (part.does === 'tank' && g.holing >= (S.hole ?? 0.5)) {
        const near = part.holes.find((h) => h.at.distanceTo(g.at) < 0.35);
        if (near) near.w += g.holing;
        else part.holes.push({ tank: part.tank, at: g.at.clone(), out: g.n.clone(), w: g.holing, rate: 0, ve: S.leak[part.tank].ve, flow: 0, acc: {} });
      }
    }
    this.clean = false;
    this.apply();
    this.lastHit = this.time;
    const kind = blast ? 'blast' : crash ? 'crash' : 'shot';
    this.hits.push({ part: first?.part.id ?? null, dmg: +dmg.toFixed(2), kind, parts: [...got].map(([q, g]) => `${q.id}:${g.amt.toFixed(1)}`) });
    if (this.hits.length > 20) this.hits.shift();
    this.tell(before);
    // Looks.
    if (first) this.seen(first.part, first.at, first.n, d, dmg, kind);
    return { first: first?.part.id ?? null, got };
  }

  /** The parts' health into flight.mjs's `harm`, and her Flight told. */
  apply() {
    const S = this.S, H = this.harm;
    let drive = 1, lost = 0;
    for (const p of this.parts) {
      const k = Math.max(0, p.hp) / p.max;
      if (p.does === 'drive') drive = k <= 0 ? 0 : Math.min(1, S.drive.floor + k);
      else if (p.does === 'radiator') lost += 1 - k;
      else if (p.does === 'jets') H.blocks[p.block] = k;
      else if (p.does === 'tank') {
        const W = p.holes.reduce((s, h) => s + h.w, 0) || 1;
        for (const h of p.holes) h.rate = S.leak[p.tank].rate * (1 - k) * (h.w / W);
      }
    }
    H.drive = drive * Math.max(0, 1 - S.radiator.drive * lost);
    H.leaks = this.parts.flatMap((p) => p.holes);
    const fl = this.fighter.flight;
    fl.harm = H;
    fl.harmed();
  }

  /** What changed, on the card and in the tones. */
  tell(before) {
    const words = [];
    let worst = 0; // 1 caution, 2 warning
    this.parts.forEach((p, i) => {
      const b = band(Math.max(0, p.hp) / p.max), was = before[i];
      p.band = b;
      const order = ['ok', 'scuffed', 'hit', 'bad', 'out'];
      if (order.indexOf(b) <= order.indexOf(was) || b === 'scuffed') return;
      const k = Math.round((Math.max(0, p.hp) / p.max) * 100);
      const out = b === 'out';
      worst = Math.max(worst, out || p.does === 'tank' || p.does === 'cockpit' ? 2 : 1);
      if (p.does === 'drive') words.push(out ? 'Main drive out.' : `Drive hit: ${Math.round(this.harm.drive * 100)}% thrust.`);
      else if (p.does === 'jets') words.push(out ? `${p.name} out.` : `${p.name} hit: ${k}%.`);
      else if (p.does === 'tank') words.push(out ? `${p.name} gone.` : `${p.name} holed: venting.`);
      else if (p.does === 'radiator') words.push(`${p.name} ${out ? 'gone' : 'hit'}: drive limited.`);
      else if (p.does === 'guns') words.push(this.gunsK < this.S.guns.jam ? 'Guns jammed.' : this.gunsK < this.S.guns.one ? 'Guns hit: one barrel firing.' : 'Guns hit.');
      else if (p.does === 'cockpit') words.push(out ? 'Cockpit destroyed.' : this.cracked ? 'Canopy cracked.' : 'Cockpit hit.');
    });
    if (words.length) this.say?.(words.slice(0, 2).join(' '));
    if (worst) this.sound(worst === 2 ? 'warning' : 'caution');
    else this.sound('tick');
  }

  /** The damage page's rows (cockpit.mjs): each part, its health and what it means. */
  rows() {
    return this.parts.map((p) => {
      const k = Math.max(0, p.hp) / p.max;
      let note = '';
      if (p.does === 'drive') note = k <= 0 ? '' : `${Math.round(this.harm.drive * 100)}% THR`;
      else if (p.does === 'tank') {
        const flow = p.holes.reduce((s, h) => s + (h.flow || 0), 0);
        note = flow > 0.05 ? `LEAK ${flow.toFixed(0)} KG/S` : p.holes.length ? 'HOLED' : '';
      }
      else if (p.does === 'guns') note = this.gunsK < this.S.guns.jam ? 'JAMMED' : this.gunsK < this.S.guns.one ? 'ONE BBL' : '';
      else if (p.does === 'cockpit') note = this.cracked ? 'CRACKED' : '';
      else if (p.does === 'radiator') note = k < 0.999 ? 'HEAT' : '';
      return { id: p.id, short: p.short, name: p.name, does: p.does, k, band: band(k), note, shapes: p.shapes };
    });
  }

  // --- what you see and hear (Math.random only) -----------------------------------------------------------------------

  /** Her meshes a decal can go on (cached on the model). */
  meshes(obj) {
    if (obj.userData.dmgMeshes) return obj.userData.dmgMeshes;
    const list = [];
    obj.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.userData.decal || !m.geometry?.attributes?.position) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (!mat || mat.isShaderMaterial || mat.isSpriteMaterial || mat.name === 'HudGlass') return;
      if (m.userData.cockpitOnly || m.parent?.userData?.cockpitOnly) return;
      list.push(m);
    });
    return (obj.userData.dmgMeshes = list);
  }

  /** The hit seen: a small blast at it in her frame, and a scorch or a hole (or a crack) where it met her model. */
  seen(part, at, n, d, dmg, kind) {
    const obj = this.fighter.obj, B = this.blazes?.in(obj);
    if (B) hullBlast(B, at, n, clamp(dmg / 60, 0.05, 0.35), 0);
    const size = kind === 'blast' ? 1.4 : kind === 'crash' ? clamp(dmg / 30, 0.4, 1.4) : clamp(0.35 + dmg / 30, 0.35, 0.95);
    const cell = kind === 'crash' || dmg < 5 ? 'scorch' : dmg < 16 && kind !== 'blast' ? 'hole' : 'big';
    try {
      this.decal(obj, at, kind === 'blast' ? _vv.copy(n).negate() : d, size, cell);
    } catch (e) {
      console.warn('fighter decal', e);
    }
  }

  /** A decal where the line from `at` (her frame) along `d` (her frame, into her) first meets her model. */
  decal(obj, at, d, size, cell) {
    obj.updateWorldMatrix(true, true);
    const o = obj.localToWorld(_vp.copy(at).addScaledVector(d, -2.5));
    const dw = _vv.copy(d).transformDirection(obj.matrixWorld);
    let best = null;
    for (const mesh of this.meshes(obj)) {
      if (!mesh.visible) continue;
      const g = mesh.geometry;
      g.boundsTree ??= new MeshBVH(g, { indirect: true });
      _vm.copy(mesh.matrixWorld).invert();
      _vray.set(o, dw).applyMatrix4(_vm);
      const h = g.boundsTree.raycastFirst(_vray, THREE.DoubleSide);
      if (!h) continue;
      const dist = _vs.copy(h.point).applyMatrix4(mesh.matrixWorld).distanceTo(o);
      if (dist < 6 && (!best || dist < best.dist)) best = { mesh, h, dist, dir: _vray.direction.clone() };
    }
    if (!best) return;
    const { mesh, h } = best;
    const glass = /Glass/.test(mesh.material?.name ?? '');
    if (glass) (cell = 'crack'), (size = Math.min(size, 0.6));
    // Close to one already there: that one will do.
    for (const e of this.decals) if (e.on === mesh && e.p.distanceTo(h.point) < e.size * 0.35) return;
    const scale = mesh.getWorldScale(_vs).x || 1, s = size / scale; // (after `size` is capped on glass)
    const nrm = h.face.normal.clone();
    if (nrm.dot(best.dir) > 0) nrm.negate();
    _vu.set(0, 1, 0);
    if (Math.abs(nrm.y) > 0.9) _vu.set(1, 0, 0);
    const t1 = _vu.cross(nrm).normalize(), t2 = _vw.crossVectors(nrm, t1);
    const a = R() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const N = 7, pos = [], uv = [], col = [], idx = [];
    const [cu, cv] = CELL[cell];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / (N - 1) - 0.5, v = j / (N - 1) - 0.5;
      const x = (u * ca - v * sa) * s, y = (u * sa + v * ca) * s;
      const q = _vp.copy(h.point).addScaledVector(t1, x).addScaledVector(t2, y);
      // Laid onto her surface: cast back along the normal from just off it.
      _vray2.origin.copy(q).addScaledVector(nrm, 0.25 / scale);
      _vray2.direction.copy(nrm).negate();
      const hh = mesh.geometry.boundsTree.raycastFirst(_vray2, THREE.DoubleSide, 0, 0.6 / scale);
      let alpha = 1;
      if (hh) q.copy(hh.point);
      else alpha = 0;
      q.addScaledVector(nrm, (glass ? 0.004 : 0.008) / scale);
      pos.push(q.x, q.y, q.z);
      uv.push((cu + u + 0.5) * 0.5, 1 - (cv + 0.5 - v) * 0.5);
      const edge = Math.max(Math.abs(u), Math.abs(v)) > 0.49 ? 0 : 1; // the rim fades out
      col.push(1, 1, 1, alpha * edge);
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const k = j * N + i;
      idx.push(k, k + 1, k + N, k + 1, k + N + 1, k + N);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const A = atlas();
    const dm = new THREE.Mesh(geo, glass ? A.glass : A.skin);
    dm.userData.decal = true;
    dm.renderOrder = glass ? 3 : 1;
    dm.frustumCulled = false;
    mesh.add(dm);
    this.decals.push({ mesh: dm, on: mesh, p: h.point.clone(), size: s, t: this.time, at: obj.worldToLocal(h.point.clone().applyMatrix4(mesh.matrixWorld)), n: nrm.clone().transformDirection(mesh.matrixWorld).transformDirection(_vm.copy(obj.matrixWorld).invert()) });
    const max = this.S.decals ?? 28;
    while (this.decals.length > max) {
      const e = this.decals.shift();
      e.mesh.removeFromParent();
      e.mesh.geometry.dispose();
    }
  }

  /** Every frame (main.mjs, after the guns): sparks off a damaged part, embers in a fresh hole, the gas out of each
   *  holed tank, the HUD's flicker and the tones. `cockpit`: you are in her seat. */
  frame(dt, { cockpit = false } = {}) {
    this.time += dt;
    this.inCockpit = cockpit;
    const fi = this.fighter, obj = fi.obj;
    this.flicker = this.clean ? 0 : this.cracked ? clamp((this.S.cockpit.crack - this.k('cockpit')) / this.S.cockpit.crack + 0.25, 0, 1) : 0;
    this.toneFrame(dt);
    if (this.clean || !obj || !fi.aboard) return;
    const B = this.blazes?.in(obj);
    if (B) {
      for (const p of this.parts) {
        if (!p.at) continue;
        const k = Math.max(0, p.hp) / p.max;
        if (k < 0.5 && R() < dt * (0.4 + 1.6 * (1 - k))) zapTick(B, p.at, p.n, 1, false);
      }
      for (const e of this.decals) {
        const age = this.time - e.t;
        if (age < 3 && R() < dt * 6 * (1 - age / 3)) {
          _vv.copy(e.n).multiplyScalar(rnd(0.2, 0.8)).add(_vs.set(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3)));
          B.emit('spark', e.at, _vv, { life: rnd(0.5, 1.4), s0: 0.04, s1: 0.02, heat: rnd(0.5, 0.85), cool: 1.2 });
        }
      }
    }
    // The gas venting from each hole, harder the more it leaks: a frosty haze at the hole in her frame (blaze.mjs), and
    // the gas streaming off it into space with her velocity (gas.mjs).
    if (fi.flying) {
      obj.updateWorldMatrix(true, false);
      for (const h of this.harm.leaks) {
        if (!(h.flow > 0.01)) continue;
        const k = clamp(Math.sqrt(h.flow / 15), 0.15, 1.4);
        if (B) {
          const x = (h.acc.h ?? 0) + 30 * k * dt;
          let n = Math.min(20, Math.floor(x));
          h.acc.h = x - n;
          for (; n > 0; n--) {
            _vv.copy(h.out).multiplyScalar(rnd(3, 9) * k).add(_vs.set(rnd(-0.8, 0.8), rnd(-0.8, 0.8), rnd(-0.8, 0.8)));
            B.emit('vapour', _vp.copy(h.at).addScaledVector(h.out, 0.04), _vv, { life: rnd(0.5, 1.1), s0: 0.05, s1: rnd(0.35, 0.75) * k, heat: 1, k: 0.3, fade: 1.6 });
          }
        }
        if (!this.gas) continue;
        const x = (h.acc.n ?? 0) + 90 * k * dt;
        let n = Math.min(30, Math.floor(x));
        h.acc.n = x - n;
        const p = obj.localToWorld(_vp.copy(h.at).addScaledVector(h.out, 0.05));
        const out = _vn.copy(h.out).transformDirection(obj.matrixWorld);
        for (; n > 0; n--) {
          _vv.copy(out).multiplyScalar(rnd(6, 16) * (0.6 + 0.4 * k)).add(_vs.set(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))).add(fi.body.vel);
          this.gas.emit(p, _vv, rnd(1.2, 2.4), 0.15, rnd(1.5, 3.2) * k, 0.16 + 0.08 * k, 0.5, 1);
        }
      }
    }
  }

  /** A tone: `tick` (a hit, nothing new broken), `caution` (two beeps: something hit), `warning` (a warble, three
   *  times: something out, holed or the cockpit). While something is out or leaking, the caution again every 6 s, three times. */
  sound(kind) {
    if (kind === 'tick') return void this.beep(1700, 0.05, 0.03);
    this.alarm = { kind, n: kind === 'warning' ? 3 : 1, t: 0 };
    this.remind = 3;
    this.remindT = 6;
  }

  toneFrame(dt) {
    const a = this.alarm;
    if (a && (a.t -= dt) <= 0) {
      if (a.kind === 'warning') this.beep(1150, 0.16, 0.05), this.beep(820, 0.16, 0.05, 0.17);
      else this.beep(720, 0.1, 0.04), this.beep(720, 0.1, 0.04, 0.16);
      a.t = 0.45;
      if (--a.n <= 0) this.alarm = null;
    }
    if (this.clean || this.remind <= 0) return;
    const bad = this.harm.leaks.some((h) => h.flow > 0.01) || this.harm.drive <= 0 || this.jetsOut > 0 || this.cracked;
    if (!bad) return;
    if ((this.remindT -= dt) <= 0) (this.remindT = 6), this.remind--, this.beep(720, 0.1, 0.025), this.beep(720, 0.1, 0.025, 0.16);
  }

  /** One short tone in the cockpit, `at` s from now. */
  beep(f, len, v, at = 0) {
    const ctx = this.sfx?.ctx, out = this.sfx?.out;
    if (!ctx || !out || !this.inCockpit || ctx.state !== 'running') return;
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.01);
    g.gain.setValueAtTime(v, t + len - 0.02);
    g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.02);
  }
}
