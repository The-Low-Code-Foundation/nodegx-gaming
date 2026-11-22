// Collisions: what you fly against a ship, without a physics engine. The ships already fly Newton's way (newton.mjs,
// flight.mjs); this sits beside them and only answers "did she touch something, and what happens then".
//
// Three parts:
//
//   Solids          what is solid about one built ship (`buildCarrier`'s object), each thing in its own frame.
//   Collider        a flown body (an object, a `Rigid`, a few balls in its frame) against a `Solids`: the sweep and the
//                   impulse. Two kinds of it:
//   Collisions      the fighter you fly against the ship she belongs to;
//   ShipCollisions  the ship you fly (the cutter) against her host (the carrier).
//
// What is solid (`Solids.build()`):
// - every opaque mesh of the ship's outside (`C.exterior` if main.mjs has gathered it, else everything on her frame
//   but her decks, drums, machinery and overlay: hull.glb's hull, fittings, island, spine and struts, turrets and
//   their guns, the radiators), each with a bounding volume tree over its own triangles (three-mesh-bvh, vendored in
//   vendor/three-mesh-bvh/). Glows, plumes, the approach lane's rings and anything hidden are left out. Each mesh is
//   tested in its own frame as it stands this frame, so whatever moves (the ship, a turret training, a radiator
//   folding, a bay door's panel) is solid where it is and carries what hits it along;
// - the hangar, from inside: its floor, deckhead, end walls and side walls, with the bay door's opening in each side
//   wall as far as the doors are open (the leaves rise into the headroom, so the opening grows from the floor up), and
//   the berths' cradles as boxes;
// - the fighters parked on their pads, each as a few balls;
// - the ships on her cradles (`addShip()`): their own outside meshes, as above.
//
// What hits: the flown body as balls (the fighter: the layout's `fighter.collide.spheres`; a ship: `shipBalls()`, from
// her hull sections, her mounts and her envelope). Each frame every ball is swept from where it was to where it is,
// relative to each solid, in steps no longer than half its radius, so at 150 m/s (2.5 m a frame) a fighter cannot
// pass through a 1 m plate between two frames.
//
// What happens (`resolve()`): she is put back where the ball first touched, then given an impulse at that point,
// along the surface's normal (restitution `bounce`) and against her slide along it (friction `scrape.mu`). The impulse
// is applied off her centre of mass, so a hit on the nose spins her. Everything is measured against the surface she
// hit, so a slow bump into a carrier coming the other way at 20 m/s is a 20 m/s crash. The other ship takes nothing
// yet (`pushBack`, a hook for when she does: the carrier is 800 times a cutter's mass).
//
// The fighter (`Collisions.contact()`): coming in slower than `scrape.speed` it is only a scrape: sparks and a shudder.
// Faster, her hull (`guns.fhull`, weapons/raid.mjs `fighterHit`; a crash that finishes her wrecks her) takes
// `damage.k × (speed − scrape.speed)²`, and from `hole.speed` up she holes the compartment she hit as well
// (integrity.mjs `arrive`, a short, shallow strike).
//
// The ship (`ShipCollisions.contact()`, numbers in `SHIP_COLLIDE`): see there.
//
// Not solid yet: the drums (inside the sleeve, which is solid; a ship small enough can fly in at the sleeve's open
// ends), the hangar's gangway and pads, the airlock's door.
// `__carrier.collide` (the fighter's) and `__carrier.bump` (the ship's) have `stats` (contacts, the last one) and
// `hits` (a log).

import * as THREE from 'three';
import { MeshBVH } from '../../vendor/three-mesh-bvh/index.module.js';
import { clamp } from '../util.mjs';
import { cradleBox } from './sets/hangar.mjs';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _hit = {};
const _box = new THREE.Box3();
const _seg = new THREE.Line3();
const ZERO = new THREE.Vector3();

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

/** A built ship's outside: `top`, the object her meshes' visibility is judged up to, and `roots`, what to walk. The
 *  ship you are aboard has it gathered in `C.exterior` (main.mjs); any other ship (a host, a berthed ship) is
 *  everything on her frame but her decks, drums, machinery and the cutaway's overlay. */
function outsideOf(C) {
  if (C.exterior) return { top: C.exterior, roots: [C.exterior] };
  const inside = new Set([C.machinery, C.overlay, C.drums?.group, ...[...C.decks.values()].map((I) => I.group)]);
  return { top: C.frame, roots: C.frame.children.filter((o) => !inside.has(o)) };
}

// --- what is solid about a ship --------------------------------------------------------------------------------------

export class Solids {
  /** `C` a built ship (layout.mjs `buildCarrier`), `doors` her Doors (how open the bay is; none: open). `scaled`: take
   *  each mesh's own scale into account (a small ship's turret is a big one scaled down); the fighter against her own
   *  carrier leaves it out, as it always has. */
  constructor(C, { doors = null, scaled = false } = {}) {
    this.C = C;
    this.doors = doors;
    this.scaled = scaled;
    this.list = [];
    // A parked fighter's balls: her layout's own.
    this.parkBalls = (C.L.fighter?.collide?.spheres ?? []).map(([x, y, z, r]) => ({ at: new THREE.Vector3(x, y, z), r }));
    this.parkReach = Math.max(0, ...this.parkBalls.map((b) => b.at.length() + b.r));
    this.build();
  }

  build() {
    const C = this.C;
    C.obj.updateMatrixWorld(true);
    this.tris = Math.round(this.meshes(C, (o) => this.list.push(this.meshSolid(o))));
    // The hangar from inside, and the fighters parked in it.
    const hg = C.rooms.get('hangar');
    if (hg) this.list.push(this.hangarSolid(hg));
    for (const [i, w] of (C.fighters ?? []).entries()) this.list.push(this.parkedSolid(w, i));
    // The whole ship's reach, from her centre: nothing to test while what flies is farther out than this.
    const box = new THREE.Box3(), inv = C.obj.matrixWorld.clone().invert();
    for (const s of this.list) {
      if (s.kind !== 'mesh') continue;
      const g = s.obj.geometry;
      g.computeBoundingBox();
      box.union(_box.copy(g.boundingBox).applyMatrix4(_m.multiplyMatrices(inv, s.obj.matrixWorld)));
    }
    this.box = box; // in her own frame (`C.obj`)
    this.centre = box.getCenter(new THREE.Vector3());
    this.radius = box.getSize(new THREE.Vector3()).length() / 2;
  }

  /** Every solid mesh of ship `P`'s outside, each given a tree over its triangles and handed to `each`. Returns the
   *  number of triangles. */
  meshes(P, each) {
    const { top, roots } = outsideOf(P);
    let tris = 0;
    for (const root of roots) {
      root.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !shown(o, top) || !solidMaterial(o.material)) return;
        for (let p = o; p; p = p.parent) if (p.name === 'approach-lane') return;
        const g = o.geometry;
        if (!g?.attributes.position) return;
        // `indirect` leaves the geometry's own index alone (it is drawn as it is).
        g.boundsTree ??= new MeshBVH(g, { indirect: true });
        g.computeBoundingSphere();
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        each(o);
      });
    }
    return tris;
  }

  /** A mesh of the outside: its triangles' tree, tested in its own frame. */
  meshSolid(mesh) {
    const g = mesh.geometry, bvh = g.boundsTree, bs = g.boundingSphere;
    return {
      kind: 'mesh', obj: mesh, name: mesh.parent?.name || mesh.name, hull: true, scale: this.scaled ? mesh.getWorldScale(_a).x || 1 : 1,
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
    // The berths' cradles (sets/hangar.mjs `cradle`): the carriage under a berthed ship, a box each.
    const cradles = (C.L.berths ?? []).filter((b) => b.box).map((b) => cradleBox(b, y0));
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
      kind: 'hangar', obj: I.group, name: 'hangar', hull: true, scale: 1,
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
        for (const k of cradles) {
          const qx = clamp(p.x, k.x[0], k.x[1]), qy = clamp(p.y, k.y[0], k.y[1]), qz = clamp(p.z, k.z[0], k.z[1]);
          const dx = p.x - qx, dy = p.y - qy, dz = p.z - qz, d = Math.hypot(dx, dy, dz);
          if (d >= r) continue;
          if (d > 1e-4) offer(d, qx, qy, qz, dx / d, dy / d, dz / d);
          else offer(0, p.x, k.y[1], p.z, 0, 1, 0); // inside it: out through its top
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
    const balls = this.parkBalls, reach = this.parkReach;
    return {
      kind: 'parked', obj: w, name: `fighter ${i + 1}`, index: i, hull: false, scale: 1,
      prev: new THREE.Matrix4(), inv: new THREE.Matrix4(),
      bound: (p0, p1, r) => segDist(_a.set(0, 0, 0), p0, p1) < reach + r,
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

  /** A ship on one of this ship's cradles (berths.mjs, berthed.mjs): `P` a built ship already standing in the hangar's
   *  group. Her outside's meshes become solids, each in its own frame (so her scale, and a turret's, are taken into
   *  account). Hitting her does not hole this ship. Returns how many meshes. */
  addShip(P, name = 'berthed ship') {
    P.obj.updateWorldMatrix(true, true);
    const n0 = this.list.length;
    this.meshes(P, (o) => {
      const s = this.meshSolid(o);
      Object.assign(s, { kind: 'berthed', name, hull: false, scale: o.getWorldScale(_a).x || 1 });
      s.prev.copy(o.matrixWorld);
      this.list.push(s);
    });
    return this.list.length - n0;
  }
}

// --- a flown body against a ship's solids ----------------------------------------------------------------------------

class Collider {
  /** `shape` the Solids she can hit, `spec` her numbers (`bounce`, `scrape.speed`, `scrape.mu`, and what the kind of
   *  collider reads), `balls` [{ at, r }] in her own frame. A subclass gives `obj` (her object: its position and
   *  quaternion are the world's), `body` (her Rigid), and `contact()`. */
  constructor(shape, spec, balls) {
    this.shape = shape;
    this.solids = shape.list;
    this.S = spec;
    this.balls = balls;
    this.reach = Math.max(...balls.map((b) => b.at.length() + b.r)); // her whole size, from her centre
    this.time = 0;
    this.prev = null; // her pose last frame: { pos, quat }
    this.stats = { contacts: 0, scrapes: 0, crashes: 0, last: null, ms: 0 };
    this.hits = [];
    this.sparkT = 0;
    this.sayT = 0;
  }

  /** A solid she cannot hit (herself, parked). */
  skip() {
    return false;
  }

  /** She has been thrown by a touch: whatever holds her attitude takes hold again from where she is. */
  thrown() {}

  /** Where she and every solid stand, for the next frame's sweep. */
  record() {
    const w = this.obj;
    for (const s of this.solids) s.prev.copy(s.obj.matrixWorld);
    this.prev ??= { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.prev.pos.copy(w.position);
    this.prev.quat.copy(w.quaternion);
  }

  /** Each ball from where it was to where it is, against each solid in its own frame: the first touch, if any, is
   *  resolved. Returns whether she touched. */
  sweep(dt) {
    const w = this.obj;
    let first = null;
    const out = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0 };
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), q = new THREE.Vector3();
    const c0 = new THREE.Vector3(), c1 = new THREE.Vector3();
    for (const s of this.solids) {
      if (this.skip(s)) continue; // herself
      s.inv.copy(s.obj.matrixWorld).invert();
      _m.copy(s.prev).invert();
      const sc = s.scale;
      // Her centre in this solid's frame, then and now: a quick test of her whole size first.
      c0.copy(this.prev.pos).applyMatrix4(_m);
      c1.copy(w.position).applyMatrix4(s.inv);
      if (!s.bound(c0, c1, this.reach / sc)) continue;
      for (const b of this.balls) {
        if (b.off) continue; // a folded radiator's
        const r = b.r / sc;
        p0.copy(b.at).applyQuaternion(this.prev.quat).add(this.prev.pos).applyMatrix4(_m);
        p1.copy(b.at).applyQuaternion(w.quaternion).add(w.position).applyMatrix4(s.inv);
        if (!s.bound(p0, p1, r)) continue;
        const n = clamp(Math.ceil(p0.distanceTo(p1) / (r * 0.5)), 1, 32);
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          if (first && f > first.f) break;
          q.lerpVectors(p0, p1, f);
          if (!s.closest(q, r, out)) continue;
          const dist = out.dist * sc;
          if (!first || f < first.f || (f === first.f && dist < first.dist)) {
            first ??= { point: new THREE.Vector3(), normal: new THREE.Vector3(), q: new THREE.Vector3() };
            Object.assign(first, { f, s, b, dist });
            first.point.copy(out.point);
            first.normal.copy(out.normal);
            first.q.copy(q);
          }
          break;
        }
      }
    }
    if (first) this.resolve(first, dt);
    return !!first;
  }

  /** She touched `c.s` with ball `c.b`: back to the touch, the impulse, and what it did to her and to the ship. */
  resolve(c, dt) {
    const w = this.obj, body = this.body, S = this.S, s = c.s;
    const M = s.obj.matrixWorld;
    // The touch in the world, as the solid stands now; the normal out of the surface towards her.
    const P = c.point.clone().applyMatrix4(M);
    const N = c.normal.clone().transformDirection(M);
    // The surface's own velocity there: where that point of it was last frame, and where it is now.
    const Vs = P.clone().sub(c.point.clone().applyMatrix4(s.prev)).divideScalar(dt);
    // Back to where the ball touched (relative to the solid now), and a hair off it.
    const ballW = c.point.clone().addScaledVector(c.normal, (c.b.r + 0.02) / s.scale).applyMatrix4(M); // its centre on touching
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
    let meff = body.mass; // how much of her is behind the point struck, along the normal
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
      const kN = k(N);
      meff = 1 / kN;
      const jn = (-(1 + e) * vn) / kN;
      const J = N.clone().multiplyScalar(jn);
      // Friction against her slide along the surface.
      const vt = vRel.clone().addScaledVector(N, -vn);
      const vts = vt.length();
      if (vts > 1e-3) {
        const T = vt.divideScalar(vts);
        J.addScaledVector(T, -Math.min(S.scrape.mu * jn, vts / k(T)));
      }
      // A part of her that gives way (a spread radiator: `soft`, the share of the impulse it can carry) crumples
      // above a scrape instead of stopping her.
      if (c.b.soft && speed >= S.scrape.speed) J.multiplyScalar(c.b.soft);
      // What she hit takes the same impulse the other way: nothing yet (the carrier is 800 times a cutter's mass).
      this.pushBack?.(c, P, J);
      body.vel.addScaledVector(J, 1 / m);
      const Jb = J.applyQuaternion(_qi);
      const dL = rb.clone().cross(Jb);
      body.ang.x += dL.x / I.x;
      body.ang.y += dL.y / I.y;
      body.ang.z += dL.z / I.z;
      // The attitude hold had her nose where it was: let it take hold again from where she has been thrown.
      this.thrown();
    }
    this.contact(c, P, N, speed, meff, vRel);
  }

  log(hit) {
    this.stats.last = hit;
    this.hits.push(hit);
    if (this.hits.length > 50) this.hits.shift();
  }

  /** Timers that run whether or not she is out (main.mjs calls it every frame). */
  tick(dt) {
    this.time += dt;
    this.sparkT -= dt;
    this.sayT -= dt;
  }
}

// --- the fighter against her own ship --------------------------------------------------------------------------------

export class Collisions extends Collider {
  /** `C` the built carrier, `fighter` the Fighter, `guns` the Weapons (her hull, flashes, sound), `ship` the
   *  Integrity (compartment hits), `doors` the Doors (how open the bay is), `spec` the layout's `fighter.collide`. */
  constructor(C, { fighter, guns, ship, doors, spec }) {
    super(new Solids(C, { doors }), spec, spec.spheres.map(([x, y, z, r]) => ({ at: new THREE.Vector3(x, y, z), r })));
    this.C = C;
    this.doors = doors;
    this.fighter = fighter;
    this.guns = guns;
    this.ship = ship;
  }

  get obj() {
    return this.fighter.obj; // her parent is the scene: her position and quaternion are the world's
  }

  get body() {
    return this.fighter.body;
  }

  skip(s) {
    return s.kind === 'parked' && s.index === this.fighter.index;
  }

  thrown() {
    this.fighter.flight.aim.copy(this.fighter.obj.quaternion);
  }

  /** After everything has moved and the carrier's matrices are up to date (main.mjs, after `C.obj.updateMatrixWorld`). */
  frame(dt) {
    const fi = this.fighter;
    if (!fi.flying || !fi.obj || dt <= 0) return void (this.prev = null);
    const t0 = performance.now();
    const pos = fi.obj.position;
    const near = _a.copy(this.shape.centre).applyMatrix4(this.C.obj.matrixWorld).distanceTo(pos) < this.shape.radius + this.reach + 60;
    if (near && this.prev) this.sweep(dt);
    this.record();
    this.stats.ms = performance.now() - t0;
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
        guns.dc?.say(null, `You hit ${c.s.kind === 'parked' ? 'a parked fighter' : c.s.kind === 'berthed' ? `the ${c.s.name}` : 'the ship'} at ${Math.round(speed)} m/s. Hull ${Math.round(guns.fhull)}%.`, 0, 4);
        this.sayT = 3;
      }
    }
    this.log(hit);
    this.C.bus?.emit('fighter-contact', hit);
  }
}

// --- the ship you fly against her host -------------------------------------------------------------------------------

/** A ship's numbers against another ship, unless her layout has its own (`collide`). Speeds are the closing speed at
 *  the point struck, scaled by how much of her mass is behind it (`felt`, below): beam on, all of her; a glancing touch
 *  of her bow, a third of it. */
export const SHIP_COLLIDE = {
  touch: 0.05, // m/s: slower than this she is resting on it, and nothing is told
  bounce: 0.15, // restitution above `scrape.speed` (below it, 0.1): steel on steel, most of it lost
  scrape: { speed: 4, mu: 0.35 }, // under this a touch is a clang: sparks, the sound through her frames, a shake. `mu`: sliding friction
  dent: 14, // health the compartment behind the contact loses just under `hole.speed` (none at `scrape.speed`, by the square between)
  hole: { speed: 8, pen: 2, damage: 22, area: 0.1 }, // from this speed she is holed behind the contact: metres in (× speed), health and hole area (× speed²)
  radiator: 0.3, // health a spread radiator loses at `scrape.speed`, and that much again for each `scrape.speed` over
  wreck: { speed: 30, health: 0.3 }, // from this speed she breaks up; or when a crash leaves her whole hull's health under this
  range: 40 // metres off the host's box, beyond her own reach, inside which the sweep runs at all
};

/** The hull section of `list` (a layout's `hull.main`) at z. */
function sectionAt(list, z) {
  if (z <= list[0].z) return list[0];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (z > b.z) continue;
    const t = b.z > a.z ? (z - a.z) / (b.z - a.z) : 1;
    return { z, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t, y: a.y + (b.y - a.y) * t, c: a.c ?? b.c };
  }
  return list[list.length - 1];
}

/** A small ship as balls, in her own frame (`C.obj`: her centre of mass), from her layout: rows of balls across each
 *  section of her hull every 3 m or so, their surfaces on her skin (so her sides, keel and top touch where they are),
 *  a small ball in each corner of the section (her bilges and shoulders), her ends, what her envelope has beyond her
 *  hull's ends (the drive's bell), each turret and close-in gun, and each radiator as two rows of small balls (`rad`:
 *  its mount's id; `ShipCollisions.pose()` runs them in and out with it; `soft`: it crumples above a scrape, carrying
 *  only that share of the impulse). Each has a `name` for the log. */
export function shipBalls(L) {
  const main = L.hull.main, com = L.com ?? [0, 0, 0], balls = [];
  const z0 = main[0].z, z1 = main[main.length - 1].z, len = z1 - z0;
  const add = (x, y, z, r, name, more) => balls.push({ at: new THREE.Vector3(x - com[0], y - com[1], z - com[2]), r, name, ...more });
  const row = (z, s, r, name) => {
    const wide = s.w >= s.h, span = (wide ? s.w : s.h) / 2 - r;
    const n = span > 0.2 ? Math.max(2, Math.ceil((2 * span) / (1.3 * r)) + 1) : 1;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? -span + (2 * span * i) / (n - 1) : 0;
      add(wide ? u : 0, s.y + (wide ? 0 : u), z, r, name);
    }
  };
  const n = Math.max(2, Math.ceil(len / 3));
  for (let i = 0; i < n; i++) {
    const z = z0 + ((i + 0.5) * len) / n, s = sectionAt(main, z), r = Math.min(s.w, s.h) / 2;
    row(z, s, r, 'hull');
    const rc = Math.min(1, r * 0.4);
    if (!s.c && s.w / 2 - rc > 0.5) for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(sx * (s.w / 2 - rc), s.y + sy * (s.h / 2 - rc), z, rc, 'hull');
  }
  for (const [s, dir] of [[main[0], 1], [main[main.length - 1], -1]]) {
    const r = Math.min(s.w, s.h) / 2;
    row(s.z + dir * r, s, r, dir > 0 ? 'bow' : 'stern');
  }
  const E = L.envelope;
  if (E && E.max[2] > z1 + 0.6) {
    const r = (E.max[2] - z1) / 2 + 0.4;
    add(0, main[main.length - 1].y, E.max[2] - r, r, 'stern');
  }
  if (E && E.min[2] < z0 - 0.6) {
    const r = (z0 - E.min[2]) / 2 + 0.4;
    add(0, main[0].y, E.min[2] + r, r, 'bow');
  }
  for (const m of L.mounts ?? []) {
    if (m.kind === 'turret' || m.kind === 'pdc') {
      const r = m.kind === 'turret' ? clamp(5.5 * (m.scale ?? 1), 0.6, 6) : clamp(2.5 * (m.scale ?? 1), 0.4, 2.5);
      const up = m.up ?? [0, 1, 0], k = m.kind === 'turret' ? 0.8 * r : 0;
      add(m.at[0] + up[0] * k, m.at[1] + up[1] * k, m.at[2] + up[2] * k, r, m.id);
    } else if (m.kind === 'radiator' && Array.isArray(m.x) && Array.isArray(m.z)) {
      const [xa, xb] = m.x, hinge = Math.abs(xa) < Math.abs(xb) ? xa : xb, tip = hinge === xa ? xb : xa;
      for (const u of [0.5, 0.9]) for (const v of [0.08, 0.5, 0.92]) {
        add(hinge + (tip - hinge) * u, m.y, m.z[0] + (m.z[1] - m.z[0]) * v, 0.5, m.id, { rad: m.id, soft: 0.15, hinge: hinge - com[0], out: hinge + (tip - hinge) * u - com[0] });
      }
    }
  }
  return balls;
}

export class ShipCollisions extends Collider {
  /** `C`, `body`: the ship you are aboard and her Rigid. `host`: the other ship (built, in the world), `hostDoors` her
   *  Doors. `berth`: the Berth, if she is carried in one (while `berth.carried` she is on rails, and nothing here
   *  runs). `ship` her Integrity, `guns` her Weapons (flashes, sparks), `plant` her Plant (radiators), `feel` the Feel
   *  (sound and sway through her structure), `say(text, secs)` a line for whoever is flying, `hostName` what to call the
   *  host in it, `onWreck(hit)` what happens when a crash finishes her (main.mjs: the white-out and the sick bay). */
  constructor({ C, body, host, hostDoors = null, berth = null, ship, guns, plant = null, feel = null, say = () => {}, hostName = 'the ship', onWreck = null }) {
    super(new Solids(host, { doors: hostDoors, scaled: true }), { ...SHIP_COLLIDE, ...(C.L.collide ?? {}) }, shipBalls(C.L));
    Object.assign(this, { C, rigid: body, host, berth, ship, guns, plant, feel, say, hostName, onWreck });
    this.dead = false; // wrecked: nothing more is tested
    this.clangT = 0;
    this.passes = 3; // touches resolved in one frame (she is long: her bow and her quarter can both be on the wall)
    this.stats.near = false;
    this.half = { z0: C.L.hull.main[0].z, z1: C.L.hull.main[C.L.hull.main.length - 1].z };
  }

  get obj() {
    return this.C.obj; // her parent is the scene, and its origin her centre of mass
  }

  get body() {
    return this.rigid;
  }

  /** Whether she is a body the collider answers for: not while her berth carries her, not once she is wrecked. */
  get live() {
    return !this.dead && !this.berth?.carried;
  }

  /** Her radiators' balls where the radiators are: run in with them, and gone when they are folded. */
  pose() {
    const rads = this.plant?.radiators;
    for (const b of this.balls) {
      if (!b.rad) continue;
      const r = rads?.find((x) => x.m.id === b.rad), k = r ? r.k : 1;
      b.off = k < 0.3 || (r && r.health <= 0.05); // folded, or crumpled
      b.at.x = b.hinge + (b.out - b.hinge) * k;
    }
  }

  /** After everything has moved and her matrices are up to date (main.mjs, after `C.obj.updateMatrixWorld`). */
  frame(dt) {
    const st = this.stats;
    if (!this.live || dt <= 0) {
      this.prev = null;
      st.near = false;
      st.ms = 0;
      return;
    }
    const t0 = performance.now();
    const w = this.obj, H = this.host, shape = this.shape, margin = this.reach + this.S.range;
    // Far from her host: nothing at all. First by her centre against the host's ball, then against her box.
    let near = _a.copy(shape.centre).applyMatrix4(H.obj.matrixWorld).distanceTo(w.position) < shape.radius + margin;
    if (near) near = shape.box.distanceToPoint(_a.copy(w.position).applyMatrix4(_mi.copy(H.obj.matrixWorld).invert())) < margin;
    st.near = near;
    if (!near) this.prev = null;
    else {
      this.pose();
      if (this.prev) for (let i = 0; i < this.passes && this.live; i++) if (!this.sweep(dt)) break;
      this.record();
    }
    st.ms = performance.now() - t0;
  }

  tick(dt) {
    super.tick(dt);
    this.clangT -= dt;
  }

  /** The part of her a point of her hull (her layout's frame) is: for the log and the line. */
  partOf(p, ball) {
    if (ball.rad) return `${p.x < 0 ? 'port' : 'starboard'} radiator`;
    if (ball.name === 'bow' || ball.name === 'stern') return ball.name;
    const { z0, z1 } = this.half, k = (p.z - z0) / (z1 - z0);
    if (k < 0.18) return 'bow';
    if (k > 0.85) return 'stern';
    const s = sectionAt(this.C.L.hull.main, p.z);
    if (Math.abs(p.y - s.y) / s.h > Math.abs(p.x) / s.w) return p.y > s.y ? 'upper hull' : 'keel';
    return p.x < 0 ? 'port side' : 'starboard side';
  }

  /** Her whole hull's health, 0 to 1: every compartment, by its volume. */
  health() {
    let v = 0, h = 0;
    for (const n of this.ship.nodes.values()) (v += n.vol), (h += n.vol * n.health);
    return v ? h / v / 100 : 1;
  }

  /** The compartment nearest a point of her hull (her frame), and the point of it nearest. */
  nearest(p, out = new THREE.Vector3()) {
    let best = null, bd = Infinity;
    for (const n of this.ship.nodes.values()) {
      const b = n.b;
      if (!b) continue;
      const d = Math.hypot(p.x - clamp(p.x, b.x[0], b.x[1]), p.y - clamp(p.y, b.y[0], b.y[1]), p.z - clamp(p.z, b.z[0], b.z[1]));
      if (d < bd) (bd = d), (best = n);
    }
    if (best) out.set(clamp(p.x, best.b.x[0], best.b.x[1]), clamp(p.y, best.b.y[0], best.b.y[1]), clamp(p.z, best.b.z[0], best.b.z[1]));
    return best;
  }

  /** What the integrity does at a hit also shoves her body as a shell would (`knock`); the collision has already
   *  given her the real impulse, so that is held off while `fn` runs. */
  quiet(fn) {
    const ship = this.ship, knock = ship.knock;
    ship.knock = null;
    try {
      return fn();
    } finally {
      ship.knock = knock;
    }
  }

  /** The sound of it through her own structure, and the room swaying: `k` 0 to 1 and over, `d` metres from you. */
  clang(k, d, slide = 0) {
    const f = this.feel;
    if (!f) return;
    const near = 1 / (1 + d / 25), v = clamp(k, 0.05, 1.6) * (0.35 + 0.65 * near);
    f.thump(0.5 * v, 9, 3.2, 0.4);
    f.thump(0.25 * v, 21, 7, 0.1);
    const o = f.out;
    if (!o) return;
    const t = f.sfx.ctx.currentTime;
    f.tone(o, t, 'sine', 74, 40, 0.5, 0.5 * v);
    f.ring(o, t, [58, 93, 141, 207, 316, 471], 1.2 + k, 0.09 * v);
    f.noise(o, t, 'bandpass', 900, 260, 0.18, 0.3 * v);
    if (slide > 0.5) f.noise(o, t + 0.03, 'bandpass', 420, 150, 0.5 + 0.1 * slide, clamp(0.08 * slide, 0, 0.45) * v); // plating dragged along plating
    if (k > 0.8) f.groan(o, t + 0.15, 31, 2.2, 0.12 * v);
  }

  /** What a touch did. `speed` is the closing speed at the point; what she feels of it is `speed × √(meff / mass)`:
   *  under `scrape.speed` a clang (sparks, the sound, a shake), over it a dent in the compartment behind the contact
   *  (or a spread radiator bent), from `hole.speed` that compartment holed through her Integrity (the road a shell's
   *  hit takes: `arrive`, in her frame, the hole and the reach growing with the speed), and from `wreck.speed`, or
   *  when it leaves her hull under `wreck.health`, the end of her (`onWreck`). */
  contact(c, P, N, speed, meff, vRel) {
    const S = this.S, st = this.stats, C = this.C, ship = this.ship, guns = this.guns;
    if (!(speed > S.touch)) return;
    st.contacts++;
    // What she feels of it: all of it on a radiator (it is the panel that takes it), else by the mass behind the point.
    const v = c.b.rad ? speed : speed * Math.sqrt(clamp(meff / this.rigid.mass, 0, 1));
    const inv = _mi.copy(C.frame.matrixWorld).invert();
    const entry = P.clone().applyMatrix4(inv); // on her hull, in her layout's frame
    const into = N.clone().transformDirection(inv); // out of what she hit, into her
    const d = (ship.you ?? ZERO).distanceTo(entry);
    const slide = _n.copy(vRel).addScaledVector(N, -vRel.dot(N)); // her slide along the surface
    const sliding = slide.length();
    const part = this.partOf(entry, c.b);
    const hit = { t: +this.time.toFixed(2), what: c.s.name, kind: c.s.kind, part, speed: +speed.toFixed(2), felt: +v.toFixed(2), damage: 0, hole: null };
    // Sparks thrown off the surface and along her slide (looks: the guns' own flash and spark pools).
    const sparks = (size) => guns?.impact?.(P, _b.copy(N).multiplyScalar(-0.7).addScaledVector(slide, sliding > 0.2 ? -1 / sliding : 0), size, '#ffc080');
    if (v < S.scrape.speed) {
      st.scrapes++;
      const k = v / S.scrape.speed;
      if ((speed > 0.4 || sliding > 1.5) && this.sparkT <= 0) {
        sparks(clamp(0.15 + 0.5 * k + 0.03 * sliding, 0.15, 0.9));
        this.sparkT = 0.12;
      }
      if (this.clangT <= 0) {
        this.clang(clamp(k, 0.15, 1), d, sliding);
        this.clangT = 0.3;
      }
      ship.shake = Math.max(ship.shake, (0.25 + 0.9 * k) / (1 + d / 40));
      if (this.sayT <= 0 && speed > 0.5) {
        this.say(`Contact: her ${part} on ${this.hostName}, ${speed.toFixed(1)} m/s.`, 3);
        this.sayT = 3;
      }
    } else {
      st.crashes++;
      sparks(clamp(0.5 + v / 12, 0.6, 3));
      this.clang(clamp(v / S.scrape.speed, 1, 1.6), d, sliding);
      ship.lurch = { dir: into.clone(), size: clamp(v / 12, 0.3, 1.8), t: 0 };
      ship.shake = Math.max(ship.shake, clamp(v / 6, 0.8, 3));
      const rad = c.b.rad && this.plant?.radiators.find((r) => r.m.id === c.b.rad);
      let did;
      if (rad) {
        // A spread radiator took it: bent, and shedding less; wrecked, it is no longer in the way.
        const dmg = clamp((S.radiator * speed) / S.scrape.speed, 0, 1);
        this.plant.hitRadiator(rad, dmg);
        hit.damage = +(dmg * 100).toFixed(1);
        hit.radiator = rad.m.id;
        did = `${part} bent`;
      } else if (v < S.hole.speed) {
        // A dent: the compartment behind the contact is hurt, not holed.
        const n = this.nearest(entry), k = (v - S.scrape.speed) / (S.hole.speed - S.scrape.speed);
        const dmg = S.dent * k * k;
        if (n) ship.hurt(n, dmg);
        hit.damage = +dmg.toFixed(1);
        hit.room = n?.c.id ?? null;
        this.quiet(() => ship.impact(entry, into, 'glance'));
        did = n ? `plating buckled at ${n.c.name.toLowerCase()}` : 'plating buckled';
      } else {
        // Holed: a strike from the contact inwards, toward the nearest compartment if the surface's normal finds none.
        // Her ends and fittings stand off her compartments (her bow's 4 m of plating): the strike reaches through
        // that (`crumple`) and then `pen` into what is behind.
        const k = v / S.hole.speed, crumple = 6;
        let pen = clamp(S.hole.pen * k, 2, 16), dir = into, gap = -1;
        for (let s = 0; s <= crumple && gap < 0; s += 0.4) if (ship.compartmentAt(_a.copy(entry).addScaledVector(into, s))) gap = s;
        if (gap < 0 && this.nearest(entry, _c) && (gap = _c.distanceTo(entry)) > 1e-3) dir = _c.sub(entry).normalize().clone();
        pen += Math.max(0, gap);
        const dmg = Math.min(100, S.hole.damage * k * k);
        const res = this.quiet(() => ship.arrive(entry, dir, { pen, damage: dmg, hole: Math.min(2.5, S.hole.area * k * k) }));
        hit.damage = +dmg.toFixed(1);
        hit.hole = res?.path?.map((n) => (typeof n === 'string' ? n : n?.c?.id)).filter(Boolean) ?? [];
        if (v >= 2 * S.hole.speed) ship.parts?.blast?.(entry); // her outside parts near it, if she has any
        did = hit.hole.length ? 'hull breached' : 'hull torn';
        C.bus?.emit('call', { id: 'collision', part: `${part[0].toUpperCase()}${part.slice(1)}.` });
      }
      hit.health = +this.health().toFixed(3);
      if (v >= S.wreck.speed || hit.health < S.wreck.health) this.wreck(hit, P);
      else if (this.sayT <= 0) {
        guns?.dc?.say(null, `Collision: her ${part} struck ${this.hostName} at ${Math.round(speed)} m/s, ${did}.`, 0, 5);
        this.sayT = 2;
      }
    }
    this.log(hit);
    C.bus?.emit('ship-contact', hit);
  }

  /** A crash that finished her: the flash, the blast through her, and `onWreck` (the page's to end). */
  wreck(hit, P) {
    if (this.dead) return;
    this.dead = true;
    hit.wreck = true;
    const guns = this.guns;
    guns?.flash?.(P, 34, '#ffb050', 1.2);
    guns?.flash?.(P, 16, '#ffffff', 0.3);
    guns?.sfx?.play('boom', 20, 40);
    this.feel?.blast(0);
    this.ship.shake = Math.max(this.ship.shake, 3);
    this.C.bus?.emit('ship-wrecked', hit);
    this.onWreck?.(hit);
  }
}
