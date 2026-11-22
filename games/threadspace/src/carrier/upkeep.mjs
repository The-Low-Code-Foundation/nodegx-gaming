// A carried ship's upkeep on her cradle (design/ROADMAP.md, phase 13: "maintenance on your own cutter in the hangar").
// What a sortie did to her is kept in the voyage between pages (`ships[key].hurt`, src/core/voyage.mjs): the health of
// each hurt compartment, her reaction mass, the rounds in her turrets, and which compartments were ever hurt (their
// scars). While she is on her cradle the host's hangar crew mend her, refuel her and rearm her, and she is not cleared
// to launch until her power and her drive work and she has reaction mass to fly on (`held()`).
//
// Two sides, one class:
//   - aboard her (her own page, `live`: { ship, plant, guns }): the record is her real state, read at load (`apply`)
//     and written back every few seconds and when the page goes; the crew work only while `berth.phase` is berthed.
//   - from the host (berths.mjs, no `live`): the record is the state. `UpkeepLook` shows it on her: a scorch on her
//     skin over each hurt compartment, turning to a welded plate as it is mended (the plate stays), the welders'
//     sparks where the crew are working, and a board at her platform. You can help: E at the board with a tool kit.
//
// Order and thresholds come from her layout's `integrity.mend` (`order`, `works`): first every system up to working,
// in order, then everything whole. Rates: `UPKEEP`.
//
// A wreck (`rebuilt` in the voyage, collide.mjs) comes back to her cradle as a hull to rebuild: every compartment at
// `UPKEEP.wreck`, her tanks and magazines empty.

import * as THREE from 'three';
import { loadVoyage, setHurt } from '../core/voyage.mjs';
import { weldTick } from './hitfx.mjs';

export const UPKEEP = {
  rate: 0.8, // health a second the hangar crew put back into the compartment they are on
  you: 1.4, // and you, with a tool kit
  fuel: 0.006, // of a full load of reaction mass a second (about three minutes from dry)
  rearm: 0.8, // rounds a second into each turret's magazine
  low: 0.25, // under this share of reaction mass she is not cleared to launch
  save: 4, // seconds between writes to the voyage
  wreck: 8 // a rebuilt wreck's compartments start at this health
};

const NAMES = {
  drive: 'main drive', reactor: 'reactor', power: 'switchgear', 'life-support': 'life support', turret: 'turret barbette',
  magazine: 'magazine', pdc: 'point defence magazine', heat: 'heat sinks', sensors: 'sensors', tanks: 'tank', repair: 'drone rack'
};

/** The voyage's record of the ship in berth `key`, made whole if there is none, a wreck made a rebuild. */
export function hurtOf(key, L) {
  const e = loadVoyage().ships[key];
  if (e?.rebuilt) {
    const nodes = {};
    for (const c of L.compartments) nodes[c.id] = UPKEEP.wreck;
    const rec = { nodes, prop: 0, stock: (L.weapons?.turrets ?? []).map(() => 0), scars: L.compartments.map((c) => c.id), rebuild: true };
    setHurt(key, rec, { rebuilt: false });
    return rec;
  }
  return e?.hurt ? structuredClone(e.hurt) : null;
}

export class Upkeep {
  /** `L`: her layout. `key`: her berth's key in the voyage. `live`: { ship, plant, guns } aboard her, else null. `say`:
   *  a line to the player. */
  constructor({ L, key, live = null, say = () => {} }) {
    this.L = L;
    this.key = key;
    this.live = live;
    this.say = say;
    const M = L.integrity?.mend ?? {};
    this.order = M.order ?? [...new Set(L.compartments.map((c) => c.system))];
    this.works = M.works ?? {};
    this.full = L.weapons?.gun?.stock ?? 0;
    this.rec = hurtOf(key, L) ?? { nodes: {}, prop: 1, stock: (L.weapons?.turrets ?? []).map(() => this.full), scars: [] };
    this.rec.scars ??= [];
    this.saveT = UPKEEP.save;
    this.job = null; // what the crew are on now: { kind, id, label, pct }
    this.youOn = false;
    if (live) {
      this.apply();
      addEventListener('pagehide', () => this.save());
    }
  }

  // --- her state: the live ship's aboard her, the record's from the host ---

  hp(id) {
    return this.live ? (this.live.ship.node(id)?.health ?? 100) : (this.rec.nodes[id] ?? 100);
  }

  setHp(id, h) {
    if (this.live) {
      const n = this.live.ship.node(id);
      if (n) n.health = h;
    } else if (h >= 99.5) delete this.rec.nodes[id];
    else this.rec.nodes[id] = h;
  }

  prop() {
    const P = this.live?.plant;
    return P ? P.prop / P.prop0 : this.rec.prop;
  }

  setProp(k) {
    const P = this.live?.plant;
    if (P) P.prop = Math.min(1, k) * P.prop0;
    else this.rec.prop = Math.min(1, k);
  }

  stock(i) {
    return this.live ? (this.live.guns.turrets[i]?.stock ?? this.full) : (this.rec.stock[i] ?? this.full);
  }

  setStock(i, n) {
    if (this.live) {
      const t = this.live.guns.turrets[i];
      if (t) t.stock = n;
    } else this.rec.stock[i] = n;
  }

  /** Aboard her: the record onto the ship as she loads. */
  apply() {
    for (const [id, h] of Object.entries(this.rec.nodes)) this.setHp(id, h);
    this.setProp(this.rec.prop ?? 1);
    for (const [i, n] of (this.rec.stock ?? []).entries()) this.setStock(i, n);
  }

  /** Her state into the voyage. */
  save() {
    const nodes = {};
    for (const c of this.L.compartments) {
      const h = this.hp(c.id);
      if (h < 99.5) {
        nodes[c.id] = Math.round(h * 10) / 10;
        if (!this.rec.scars.includes(c.id)) this.rec.scars.push(c.id);
      }
    }
    this.rec.nodes = nodes;
    this.rec.prop = Math.round(this.prop() * 1000) / 1000;
    this.rec.stock = (this.L.weapons?.turrets ?? []).map((_, i) => Math.floor(this.stock(i)));
    if (!Object.keys(nodes).length) delete this.rec.rebuild;
    // Only what changed, and nothing for a ship that has never been touched (no damage, full, no scars).
    const json = JSON.stringify(this.rec);
    if (json === this.saved) return;
    const untouched = !Object.keys(nodes).length && this.rec.prop >= 1 && this.rec.stock.every((n) => n >= this.full) && !this.rec.scars.length;
    if (untouched && this.saved === undefined && !loadVoyage().ships[this.key]?.hurt) return;
    this.saved = json;
    setHurt(this.key, this.rec);
  }

  nameOf(id) {
    const c = this.L.compartments.find((x) => x.id === id);
    return !c ? id : c.access === 'walk' ? c.name.toLowerCase() : NAMES[c.system] ?? c.name.toLowerCase();
  }

  /** The compartments to mend, most urgent first: everything up to working (`works`, 60 if not named) in `order`, then
   *  everything whole. */
  hurt() {
    const out = [];
    for (const c of this.L.compartments) {
      const h = this.hp(c.id);
      if (h >= 99.5) continue;
      const works = this.works[c.system] ?? 60;
      const rank = this.order.indexOf(c.system);
      out.push({ id: c.id, sys: c.system, h, tier: h < works ? 0 : 1, rank: rank < 0 ? 99 : rank, works });
    }
    return out.sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.h - b.h);
  }

  /** Why she may not launch yet, or null. */
  held() {
    for (const sys of ['reactor', 'power', 'drive']) {
      const bad = this.hurt().find((x) => x.sys === sys && x.tier === 0);
      if (bad) return `The hangar crew have her ${this.nameOf(bad.id)} at ${Math.round(bad.h)}%: she is cleared at ${bad.works}.`;
    }
    if (this.prop() < UPKEEP.low) return `She is refuelling: reaction mass ${Math.round(this.prop() * 100)}%, cleared at ${Math.round(UPKEEP.low * 100)}.`;
    return null;
  }

  /** Each frame. `working`: she is on her cradle (the crew can get at her). `you`: you are working with them. */
  frame(dt, { working = true, you = false } = {}) {
    this.youOn = false;
    if (working) {
      // The crew on the most urgent compartment, with you if you are helping.
      const top = this.hurt()[0];
      this.job = top ? { kind: 'mend', id: top.id, label: this.nameOf(top.id), pct: Math.round(top.h) } : null;
      if (top) {
        const h = Math.min(100, top.h + (UPKEEP.rate + (you ? UPKEEP.you : 0)) * dt);
        this.youOn = you;
        this.setHp(top.id, h);
        if (h >= 99.5) this.say(`Hangar crew: her ${this.nameOf(top.id)} is mended.`);
      }
      // The fuel line and the ammunition hoist, at the same time.
      if (this.prop() < 1) this.setProp(this.prop() + UPKEEP.fuel * dt);
      for (let i = 0; i < (this.L.weapons?.turrets ?? []).length; i++) {
        const s = this.stock(i);
        if (s < this.full) this.setStock(i, Math.min(this.full, s + UPKEEP.rearm * dt));
      }
    } else this.job = null;
    if ((this.saveT -= dt) <= 0) (this.saveT = UPKEEP.save), this.save();
  }

  /** The board's lines: [text, colour]. */
  rows() {
    const out = [], hurt = this.hurt();
    for (const x of hurt.slice(0, 4)) out.push([`${this.nameOf(x.id)} ${Math.round(x.h)}%${this.job?.id === x.id ? ' · mending' : ''}`, x.tier ? '#ffc850' : '#ff6a4a']);
    if (hurt.length > 4) out.push([`and ${hurt.length - 4} more`, '#9aa4b0']);
    const p = this.prop();
    out.push([`reaction mass ${Math.round(p * 100)}%${p < 1 ? ' · refuelling' : ''}`, p < UPKEEP.low ? '#ff6a4a' : p < 1 ? '#ffc850' : '#7dffb0']);
    for (let i = 0; i < (this.L.weapons?.turrets ?? []).length; i++) {
      const s = Math.floor(this.stock(i));
      out.push([`turret ${s} / ${this.full}${s < this.full ? ' · rearming' : ''}`, s < this.full ? '#ffc850' : '#7dffb0']);
    }
    return out;
  }
}

// --- how she looks on her cradle, from the host -------------------------------------------------------------------

let SCORCH = null, PLATE = null;

function texture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function materials() {
  if (SCORCH) return;
  // A scorch: soot, dark at the middle and ragged at the edge, a torn hole in it.
  SCORCH = new THREE.MeshStandardMaterial({
    map: texture((g) => {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 40;
        const grd = g.createRadialGradient(64 + Math.cos(a) * r * 0.5, 64 + Math.sin(a) * r * 0.5, 0, 64, 64, 30 + Math.random() * 30);
        grd.addColorStop(0, 'rgba(10,8,6,0.55)');
        grd.addColorStop(1, 'rgba(10,8,6,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
      }
      g.fillStyle = 'rgba(0,0,0,0.95)';
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, r = 10 + Math.random() * 9;
        g[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      g.fill();
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, roughness: 0.95, metalness: 0
  });
  // A plate welded over it: bare metal, a bead round the edge, bolt heads.
  PLATE = new THREE.MeshStandardMaterial({
    map: texture((g) => {
      g.fillStyle = '#8a9096';
      g.fillRect(18, 18, 92, 92);
      g.strokeStyle = '#4a4440';
      g.lineWidth = 6;
      g.strokeRect(18, 18, 92, 92);
      g.fillStyle = '#c8ccd0';
      for (const [x, y] of [[28, 28], [100, 28], [28, 100], [100, 100]]) g.fillRect(x - 3, y - 3, 6, 6);
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, roughness: 0.6, metalness: 0.2
  });
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Her upkeep seen: on the berthed ship `P` (berths.mjs), standing in the host's hangar interior `I`. */
export class UpkeepLook {
  constructor({ G, P, I, upkeep, board }) {
    materials();
    this.G = G;
    this.P = P;
    this.I = I;
    this.U = upkeep;
    this.marks = new Map(); // compartment id → { mesh, p, n } (in her layout frame, P.frame)
    this.acc = {};
    this.boardT = 0;
    // The board at her platform: `board` = { at: [x, y, z], yaw } in the hangar's frame.
    const c = (this.canvas = document.createElement('canvas'));
    c.width = 512;
    c.height = 320;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.board.position.set(...board.at);
    this.board.rotation.y = board.yaw;
    I.group.add(this.board);
    this.draw();
    for (const id of upkeep.rec.scars) this.mark(id);
  }

  /** Where a hit on compartment `id` shows on her skin: from her nearest side in toward its middle, onto her hull. */
  mark(id) {
    if (this.marks.has(id)) return this.marks.get(id);
    const P = this.P, L = P.L, c = L.compartments.find((x) => x.id === id), E = L.envelope;
    if (!c || !E) return null;
    const deck = c.deck != null ? L.decks.find((d) => d.id === c.deck) : null;
    const mid = new THREE.Vector3((c.x[0] + c.x[1]) / 2, c.y ? (c.y[0] + c.y[1]) / 2 : (deck?.floor ?? 0) + 1.2, (c.z[0] + c.z[1]) / 2);
    // The nearest side of her envelope (beam or deck: her ends are her drive and her bow).
    const sides = [[0, 1, E.max[0] - mid.x], [0, -1, mid.x - E.min[0]], [1, 1, E.max[1] - mid.y], [1, -1, mid.y - E.min[1]]].sort((a, b) => a[2] - b[2]);
    P.obj.updateWorldMatrix(true, true); // her cradle's group too: at build it has not been drawn yet
    // Her skin: what is drawn (the raycaster does not care what is hidden: her decks and machinery are), opaque.
    const shown = (o) => { for (; o && o !== P.obj; o = o.parent) if (!o.visible) return false; return true; };
    // From the nearest side in; a side whose ray finds no skin (a gap in her plating, a fitting) gives way to the next.
    let h = null, k = 0, s = 1, gap = 0;
    for ([k, s, gap] of sides) {
      _d.set(0, 0, 0).setComponent(k, -s);
      _o.copy(mid).setComponent(k, mid.getComponent(k) + s * (gap + 3));
      const ray = new THREE.Raycaster(P.frame.localToWorld(_o.clone()), _d.clone().transformDirection(P.frame.matrixWorld), 0, gap + 6);
      h = ray.intersectObject(P.obj, true).find((x) => x.object.isMesh && x.face && !x.object.material?.transparent && shown(x.object));
      if (h) break;
    }
    if (!h) [k, s, gap] = sides[0];
    const p = h ? P.frame.worldToLocal(h.point.clone()) : mid.clone().setComponent(k, mid.getComponent(k) + s * gap);
    const n = h ? h.face.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(P.frame.matrixWorld.clone().invert()) : new THREE.Vector3().setComponent(k, s);
    // Her skin faces out: a face hit from behind (a single-sided panel's back) still marks the outside.
    if (n.getComponent(k) * s < 0) n.negate();
    const size = 1.1 + Math.min(0.8, Math.cbrt(Math.abs((c.x[1] - c.x[0]) * (c.z[1] - c.z[0]))) * 0.4);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), SCORCH);
    mesh.position.copy(p).addScaledVector(n, 0.07); // proud of her panel seams and fittings
    mesh.quaternion.copy(_q.setFromUnitVectors(_n.set(0, 0, 1), n));
    mesh.rotateZ(Math.random() * Math.PI);
    mesh.renderOrder = 3;
    P.frame.add(mesh);
    const m = { mesh, p, n };
    this.marks.set(id, m);
    return m;
  }

  draw() {
    const g = this.canvas.getContext('2d'), U = this.U, held = U.held();
    g.fillStyle = '#0c1014';
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = held ? '#e0402a' : '#3fbf7f';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 314);
    g.font = '600 26px ui-monospace, Menlo, monospace';
    g.fillStyle = '#e8edf2';
    g.fillText(`${(this.P.L.name ?? 'CUTTER').toUpperCase()} · UPKEEP`, 18, 40);
    g.font = '22px ui-monospace, Menlo, monospace';
    let y = 80;
    for (const [t, col] of U.rows()) {
      g.fillStyle = col;
      g.fillText(t, 18, y);
      y += 30;
    }
    g.font = '600 24px ui-monospace, Menlo, monospace';
    g.fillStyle = held ? '#ff6a4a' : '#7dffb0';
    g.fillText(held ? 'NOT CLEARED TO LAUNCH' : 'CLEARED TO LAUNCH', 18, 300);
    this.tex.needsUpdate = true;
  }

  /** Each frame: the scorches turning to plates as they are mended, the welders' sparks, the board. */
  frame(dt) {
    const U = this.U;
    for (const [id, m] of this.marks) {
      const h = U.hp(id), works = U.works[this.P.L.compartments.find((c) => c.id === id)?.system] ?? 60;
      m.mesh.material = h >= works ? PLATE : SCORCH;
    }
    for (const id of Object.keys(U.rec.nodes)) this.mark(id);
    const job = U.job && this.marks.get(U.job.id);
    if (job && this.I.group.visible) {
      const B = this.G.C.blazes?.in(this.P.frame);
      if (B) weldTick(B, _o.copy(job.p).addScaledVector(job.n, 0.15), job.n, dt, false, this.acc);
    }
    if ((this.boardT -= dt) <= 0) (this.boardT = 0.5), this.draw();
  }
}
