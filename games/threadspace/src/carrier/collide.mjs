// Collisions: the fighter you fly against the carrier, without a physics engine. The ship already flies Newton's way
// (newton.mjs, flight.mjs); this sits beside them and only answers "did she touch something, and what happens then".
//
// What is solid (`build()`):
// - every opaque mesh of the carrier's outside (`C.exterior`: hull.glb's hull, fittings, island, spine and struts,
//   turrets and their guns, the radiators), each with a bounding volume tree over its own triangles (three-mesh-bvh,
//   vendored in vendor/three-mesh-bvh/). Glows, plumes, the approach lane's rings and anything hidden are left out.
//   Each mesh is tested in its own frame as it stands this frame, so whatever moves (the ship, a turret training, a
//   radiator folding) is solid where it is and carries the fighter with it when it hits her;
// - the hangar, from inside: its floor, deckhead, end walls and side walls, with the bay door's opening in each side
//   wall as far as the doors are open (the leaves rise into the headroom, so the opening grows from the floor up);
// - the fighters parked on their pads, each as a few balls.
//
// What hits: the fighter as a few balls along her (the layout's `fighter.collide.spheres`, in her own frame). Each
// frame every ball is swept from where it was to where it is, relative to each solid, in steps no longer than half its
// radius, so at 150 m/s (2.5 m a frame) she cannot pass through a 1 m plate between two frames.
//
// What happens (`resolve()`): she is put back where the ball first touched, then given an impulse at that point,
// along the surface's normal (restitution `bounce`) and against her slide along it (friction `scrape`). The impulse is
// applied off her centre of mass, so a hit on the nose spins her. Coming in slower than `scrape.speed` it is only a
// scrape: sparks and a shudder. Faster, her hull (`guns.fhull`, weapons/raid.mjs `fighterHit`; a crash that finishes her wrecks her) takes
// `damage.k × (speed − scrape.speed)²`, and from `hole.speed` up she holes the compartment she hit as well
// (integrity.mjs `arrive`, a short, shallow strike). Everything is measured against the surface she hit, so a slow
// bump into a carrier coming the other way at 20 m/s is a 20 m/s crash.
//
// Later, the same code does ship against ship, debris, and you against the hangar in a suit: give `Collisions` a body
// and its balls.
//
// Not solid yet: the drums (inside the sleeve, which is solid), the hangar's gangway and pads, the airlock's door.
// `__carrier.collide` has `stats` (contacts, the last one) and `hits` (a log).

import * as THREE from 'three';
import { MeshBVH } from '../../vendor/three-mesh-bvh/index.module.js';
import { clamp } from '../util.mjs';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _hit = {};
const _box = new THREE.Box3();
const _seg = new THREE.Line3();

/** Distance from `p` to the segment a–b. */
function segDist(p, a, b) {
  _seg.set(a, b);
  return _seg.closestPointToPoint(p, true, _d).distanceTo(p);
}

/** Whether the mesh and all its parents up to (not including) `root` are visible. */
function shown(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/** An opaque, lit surface: not a glow, a plume, a beam or glass. */
function solidMaterial(m) {
  const list = Array.isArray(m) ? m : [m];
  return list.some((x) => x && !x.transparent && !x.isMeshBasicMaterial && x.blending !== THREE.AdditiveBlending);
}

export class Collisions {
  /** `C` the built carrier, `fighter` the Fighter, `guns` the Weapons (her hull, flashes, sound), `ship` the
   *  Integrity (compartment hits), `doors` the Doors (how open the bay is), `spec` the layout's `fighter.collide`. */
  constructor(C, { fighter, guns, ship, doors, spec }) {
    this.C = C;
    this.doors = doors;
    this.time = 0;
    this.fighter = fighter;
    this.guns = guns;
    this.ship = ship;
    this.S = spec;
    this.balls = spec.spheres.map(([x, y, z, r]) => ({ at: new THREE.Vector3(x, y, z), r }));
    this.reach = Math.max(...this.balls.map((b) => b.at.length() + b.r)); // her whole size, from her centre
    this.solids = [];
    this.prev = null; // her pose last frame: { pos, quat }
    this.stats = { contacts: 0, scrapes: 0, crashes: 0, last: null, ms: 0 };
    this.hits = [];
    this.sparkT = 0;
    this.sayT = 0;
    this.build();
  }

  // --- what is solid -----------------------------------------------------------------------------------------------

  build() {
    const C = this.C;
    C.obj.updateMatrixWorld(true);
    let tris = 0;
    C.exterior.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !shown(o, C.exterior) || !solidMaterial(o.material)) return;
      for (let p = o; p; p = p.parent) if (p.name === 'approach-lane') return;
      const g = o.geometry;
      if (!g?.attributes.position) return;
      // `indirect` leaves the geometry's own index alone (it is drawn as it is).
      g.boundsTree ??= new MeshBVH(g, { indirect: true });
      g.computeBoundingSphere();
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      this.solids.push(this.meshSolid(o));
    });
    // The hangar from inside, and the fighters parked in it.
    const hg = C.rooms.get('hangar');
    if (hg) this.solids.push(this.hangarSolid(hg));
    for (const [i, w] of C.fighters.entries()) this.solids.push(this.parkedSolid(w, i));
    this.tris = Math.round(tris);
    // The whole carrier's reach, from her centre: nothing to test while the fighter is farther out than this.
    const box = new THREE.Box3(), inv = C.obj.matrixWorld.clone().invert();
    for (const s of this.solids) {
      if (s.kind !== 'mesh') continue;
      const g = s.obj.geometry;
      g.computeBoundingBox();
      box.union(_box.copy(g.boundingBox).applyMatrix4(_m.multiplyMatrices(inv, s.obj.matrixWorld)));
    }
    this.centre = box.getCenter(new THREE.Vector3());
    this.radius = box.getSize(new THREE.Vector3()).length() / 2;
  }

  /** A mesh of the outside: its triangles' tree, tested in its own frame. */
  meshSolid(mesh) {
    const g = mesh.geometry, bvh = g.boundsTree, bs = g.boundingSphere;
    return {
      kind: 'mesh', obj: mesh, name: mesh.parent?.name || mesh.name, hull: true,
      prev: new THREE.Matrix4(), inv: new THREE.Matrix4(),
      bound: (p0, p1, r) => segDist(bs.center, p0, p1) < bs.radius + r,
      closest(p, r, out) {
        const h = bvh.closestPointToPoint(p, _hit, 0, r);
        if (!h || h.distance >= r) return false;
        out.point.copy(h.point);
        out.dist = h.distance;
        if (h.distance > 1e-4) out.normal.subVectors(p, h.point).divideScalar(h.distance);
        else {
          // Dead on the surface: the face's own normal, turned to the side she came from.
          const pos = g.attributes.position, idx = bvh.geometry.index, f = h.faceIndex;
          const i0 = idx ? idx.getX(3 * f) : 3 * f, i1 = idx ? idx.getX(3 * f + 1) : 3 * f + 1, i2 = idx ? idx.getX(3 * f + 2) : 3 * f + 2;
          _a.fromBufferAttribute(pos, i0);
          _b.fromBufferAttribute(pos, i1).sub(_a);
          _c.fromBufferAttribute(pos, i2).sub(_a);
          out.normal.crossVectors(_b, _c).normalize();
        }
        return true;
      }
    };
  }

  /** The hangar, a hollow box in its deck's frame: solid from inside, bar its bay doors' openings as far as they are
   *  open, and its side walls solid from either face (the bay's throat runs out through the hull from them). */
  hangarSolid(c) {
    const C = this.C, I = C.decks.get(c.deck);
    const y0 = I.floorY, y1 = I.floorY + (c.h ?? 3), [x0, x1] = c.x, [z0, z1] = c.z;
    const bays = (c.bayDoors ?? []).map((d) => ({ x: d.side === 'w' ? x0 : x1, z0: d.from, z1: d.to, h: d.height, side: d.side }));
    const doors = (side) => (this.doors?.kOf ? this.doors.kOf(side) : this.doors?.k ?? 1); // each side's own (one may be jammed)
    const best = { d: Infinity };
    const offer = (d, px, py, pz, nx, ny, nz) => {
      if (d >= best.d) return;
      best.d = d;
      best.p.set(px, py, pz);
      best.n.set(nx, ny, nz);
    };
    best.p = new THREE.Vector3();
    best.n = new THREE.Vector3();
    return {
      kind: 'hangar', obj: I.group, name: 'hangar', hull: true,
      prev: new THREE.Matrix4(), inv: new THREE.Matrix4(),
      bound: (p0, p1, r) => {
        const lo = (a, b) => Math.min(a, b) - r, hi = (a, b) => Math.max(a, b) + r;
        return hi(p0.x, p1.x) > x0 - 8 && lo(p0.x, p1.x) < x1 + 8 && hi(p0.y, p1.y) > y0 && lo(p0.y, p1.y) < y1 && hi(p0.z, p1.z) > z0 && lo(p0.z, p1.z) < z1;
      },
      closest(p, r, out) {
        best.d = Infinity;
        const inX = p.x > x0 && p.x < x1, inY = p.y > y0 - r && p.y < y1 + r, inZ = p.z > z0 - r && p.z < z1 + r;
        if (inX && inY && inZ) {
          // Floor, deckhead and end walls, from inside.
          offer(p.y - y0, p.x, y0, p.z, 0, 1, 0);
          offer(y1 - p.y, p.x, y1, p.z, 0, -1, 0);
          offer(p.z - z0, p.x, p.y, z0, 0, 0, 1);
          offer(z1 - p.z, p.x, p.y, z1, 0, 0, -1);
        }
        // The side walls, either face, with the bay openings.
        if (p.y > y0 - r && p.y < y1 + r && p.z > z0 - r && p.z < z1 + r) {
          for (const wx of [x0, x1]) {
            const dx = p.x - wx;
            if (Math.abs(dx) >= r) continue;
            const bay = bays.find((b) => b.x === wx);
            const top = bay ? y0 + bay.h * doors(bay.side) : y0; // the opening: from the floor up to the leaves' lower edge
            const inHole = bay && p.z > bay.z0 && p.z < bay.z1 && p.y < top;
            const s = dx >= 0 ? 1 : -1;
            if (!inHole) offer(Math.abs(dx), wx, p.y, p.z, s, 0, 0);
            else {
              // In the opening: the nearest of its jambs and its lintel (its sill is the floor).
              const ez = p.z - bay.z0 < bay.z1 - p.z ? bay.z0 : bay.z1;
              let d = Math.hypot(dx, p.z - ez);
              if (d > 1e-4) offer(d, wx, p.y, ez, dx / d, 0, (p.z - ez) / d);
              if (top < y1) {
                d = Math.hypot(dx, top - p.y);
                if (d > 1e-4) offer(d, wx, top, p.z, dx / d, (p.y - top) / d, 0);
              }
            }
          }
        }
        if (!(best.d < r)) return false;
        out.point.copy(best.p);
        out.normal.copy(best.n);
        out.dist = Math.max(0, best.d);
        return true;
      }
    };
  }

  /** A fighter parked on her pad (not the one you are flying): her balls, in her own frame. */
  parkedSolid(w, i) {
    const balls = this.balls;
    return {
      kind: 'parked', obj: w, name: `fighter ${i + 1}`, index: i, hull: false,
      prev: new THREE.Matrix4(), inv: new THREE.Matrix4(),
      bound: (p0, p1, r) => segDist(_a.set(0, 0, 0), p0, p1) < this.reach + r,
      closest(p, r, out) {
        let best = Infinity;
        for (const b of balls) {
          const d = p.distanceTo(b.at) - b.r;
          if (d < best && d < r) {
            best = d;
            out.normal.subVectors(p, b.at).normalize();
            out.point.copy(b.at).addScaledVector(out.normal, b.r);
          }
        }
        if (best === Infinity) return false;
        out.dist = Math.max(0, best);
        return true;
      }
    };
  }

  // --- the frame ---------------------------------------------------------------------------------------------------

  /** After everything has moved and the carrier's matrices are up to date (main.mjs, after `C.obj.updateMatrixWorld`). */
  frame(dt) {
    const fi = this.fighter;
    if (!fi.flying || !fi.obj || dt <= 0) return void (this.prev = null);
    const t0 = performance.now();
    const w = fi.obj;
    const pos = w.position, quat = w.quaternion; // her parent is the scene: these are the world's
    const near = _a.copy(this.centre).applyMatrix4(this.C.obj.matrixWorld).distanceTo(pos) < this.radius + this.reach + 60;
    if (near && this.prev) this.sweep(dt);
    for (const s of this.solids) s.prev.copy(s.obj.matrixWorld);
    this.prev ??= { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.prev.pos.copy(w.position);
    this.prev.quat.copy(w.quaternion);
    this.stats.ms = performance.now() - t0;
  }

  /** Each ball from where it was to where it is, against each solid in its own frame: the first touch, if any. */
  sweep(dt) {
    const fi = this.fighter, w = fi.obj;
    let first = null;
    const out = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0 };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Vector3();
    const c0 = new THREE.Vector3(), c1 = new THREE.Vector3();
    for (const s of this.solids) {
      if (s.kind === 'parked' && s.index === fi.index) continue; // herself
      s.inv.copy(s.obj.matrixWorld).invert();
      _m.copy(s.prev).invert();
      // Her centre in this solid's frame, then and now: a quick test of her whole size first.
      c0.copy(this.prev.pos).applyMatrix4(_m);
      c1.copy(w.position).applyMatrix4(s.inv);
      if (!s.bound(c0, c1, this.reach)) continue;
      for (const b of this.balls) {
        p0.copy(b.at).applyQuaternion(this.prev.quat).add(this.prev.pos).applyMatrix4(_m);
        p1.copy(b.at).applyQuaternion(w.quaternion).add(w.position).applyMatrix4(s.inv);
        if (!s.bound(p0, p1, b.r)) continue;
        const n = clamp(Math.ceil(p0.distanceTo(p1) / (b.r * 0.5)), 1, 32);
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          if (first && f > first.f) break;
          q.lerpVectors(p0, p1, f);
          if (!s.closest(q, b.r, out)) continue;
          if (!first || f < first.f || (f === first.f && out.dist < first.dist)) {
            first ??= { point: new THREE.Vector3(), normal: new THREE.Vector3(), q: new THREE.Vector3() };
            Object.assign(first, { f, s, b, dist: out.dist });
            first.point.copy(out.point);
            first.normal.copy(out.normal);
            first.q.copy(q);
          }
          break;
        }
      }
    }
    if (first) this.resolve(first, dt);
  }

  /** She touched `c.s` with ball `c.b`: back to the touch, the impulse, and what it did to her and to the ship. */
  resolve(c, dt) {
    const fi = this.fighter, w = fi.obj, body = fi.body, S = this.S, s = c.s;
    const M = s.obj.matrixWorld;
    // The touch in the world, as the solid stands now; the normal out of the surface towards her.
    const P = c.point.clone().applyMatrix4(M);
    const N = c.normal.clone().transformDirection(M);
    // The surface's own velocity there: where that point of it was last frame, and where it is now.
    const Vs = P.clone().sub(c.point.clone().applyMatrix4(s.prev)).divideScalar(dt);
    // Back to where the ball touched (relative to the solid now), and a hair off it.
    const ballW = c.point.clone().addScaledVector(c.normal, c.b.r + 0.02).applyMatrix4(M); // its centre on touching
    const off = c.b.at.clone().applyQuaternion(w.quaternion);
    w.position.copy(ballW).sub(off);
    // Her velocity at the touch, against the surface's.
    const r = P.clone().sub(w.position); // from her centre of mass to the touch
    _q.copy(w.quaternion);
    _qi.copy(_q).invert();
    const omega = body.ang.clone().applyQuaternion(_q); // her spin in the world
    const vRel = body.vel.clone().add(omega.clone().cross(r)).sub(Vs);
    const vn = vRel.dot(N);
    const speed = Math.max(0, -vn);
    if (vn < 0) {
      const I = body.I, m = body.mass;
      const rb = r.clone().applyQuaternion(_qi);
      // How hard she is to move at that point along direction d (world): 1/m + d·((I⁻¹(r×d))×r), in her frame.
      const k = (d) => {
        const db = d.clone().applyQuaternion(_qi);
        const t = rb.clone().cross(db);
        t.set(t.x / I.x, t.y / I.y, t.z / I.z);
        return 1 / m + t.cross(rb).dot(db);
      };
      const e = speed < S.scrape.speed ? 0.1 : S.bounce;
      const jn = (-(1 + e) * vn) / k(N);
      const J = N.clone().multiplyScalar(jn);
      // Friction against her slide along the surface.
      const vt = vRel.clone().addScaledVector(N, -vn);
      const vts = vt.length();
      if (vts > 1e-3) {
        const T = vt.divideScalar(vts);
        J.addScaledVector(T, -Math.min(S.scrape.mu * jn, vts / k(T)));
      }
      body.vel.addScaledVector(J, 1 / m);
      const Jb = J.applyQuaternion(_qi);
      const dL = rb.clone().cross(Jb);
      body.ang.x += dL.x / I.x;
      body.ang.y += dL.y / I.y;
      body.ang.z += dL.z / I.z;
      // The attitude hold had her nose where it was: let it take hold again from where she has been thrown.
      fi.flight.aim.copy(w.quaternion);
    }
    this.contact(c, P, N, speed);
  }

  /** What a touch at `speed` did: a scrape, or a crash that hurts her and maybe the ship. */
  contact(c, P, N, speed) {
    const S = this.S, guns = this.guns, st = this.stats;
    st.contacts++;
    const hit = { t: +this.time.toFixed(2), what: c.s.name, kind: c.s.kind, speed: +speed.toFixed(2), damage: 0, hole: null };
    if (speed < S.scrape.speed) {
      st.scrapes++;
      if (speed > 0.4 && this.sparkT <= 0) {
        guns.flash?.(P, 0.6 + speed * 0.3, '#ffc080', 0.08);
        this.sparkT = 0.15;
      }
      guns.jolt = Math.max(guns.jolt ?? 0, clamp(speed / S.scrape.speed, 0.1, 0.5));
    } else {
      st.crashes++;
      const dmg = S.damage.k * (speed - S.scrape.speed) ** 2;
      hit.damage = +dmg.toFixed(1);
      if (guns.fhull != null) guns.fighterHit(P, dmg, speed, N); // N: out of the surface, into her
      // Hard enough, she holes the compartment she hit (a short, shallow strike; in the ship's frame).
      if (c.s.hull && speed >= S.hole.speed && this.ship) {
        const inv = this.C.obj.matrixWorld.clone().invert();
        const entry = P.clone().applyMatrix4(inv);
        const dir = N.clone().negate().transformDirection(inv);
        const k = speed / S.hole.speed;
        const res = this.ship.arrive(entry, dir, { pen: clamp(S.hole.pen * k, 1, 6), damage: S.hole.damage * k, hole: S.hole.area * k });
        hit.hole = res?.path?.map((n) => (typeof n === 'string' ? n : n?.c?.id)).filter(Boolean) ?? [];
      }
      if (this.sayT <= 0 && guns.fhull > 0) {
        guns.dc?.say(null, `You hit ${c.s.kind === 'parked' ? 'a parked fighter' : 'the ship'} at ${Math.round(speed)} m/s. Hull ${Math.round(guns.fhull)}%.`, 0, 4);
        this.sayT = 3;
      }
    }
    st.last = hit;
    this.hits.push(hit);
    if (this.hits.length > 50) this.hits.shift();
    this.C.bus?.emit('fighter-contact', hit);
  }

  /** Timers that run whether or not she is out (main.mjs calls it every frame). */
  tick(dt) {
    this.time += dt;
    this.sparkT -= dt;
    this.sayT -= dt;
  }
}
