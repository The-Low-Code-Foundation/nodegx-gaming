// The broadside: the hangar walls' torpedo tubes, each side its own stock and reload, fired from the helm or by the
// CIC, and the helm's plot of whether the raider bears. Part of `Weapons` (weapons.mjs).

import { THREE, at, clamp, _a, _b, _c, _d, _e, _f, _g, _m, Y, turn } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const broadsideParts = {
  // --- the broadside -------------------------------------------------------------------------------------------------

  /** One side of the broadside as it stands: whether the raider bears on it (within `arc` of the beam, inside
   *  `range`), its torpedoes, its reload, and whether its magazines can feed it. */
  broadsideSide(k, R = this.raider) {
    const B = this.W.broadside, b = this.broad?.[k];
    if (!B || !b) return null;
    const mags = B[k].magazines.map((id) => this.ship.node(id)?.health ?? 100);
    const fed = mags.some((h) => h >= 20);
    let bears = false, off = null, range = null;
    if (R && !R.gone && !R.dead && !R.target) {
      const local = this.C.frame.worldToLocal(_a.copy(R.obj.position)).normalize();
      off = Math.acos(clamp(local.x * B[k].dir[0], -1, 1)); // radians off this side's beam
      range = R.obj.position.distanceTo(this.C.obj.position);
      bears = off < (B.arc * Math.PI) / 180 && range >= B.range[0] && range <= B.range[1];
    }
    return { k, stock: b.stock, reload: b.t > 0 ? b.t / B.reload : 0, fed, bears, off, range, ready: b.t <= 0 && b.stock > 0 && fed && this.ship.power };
  },

  /** What the helm's broadside plot shows (helmsight.mjs): each side, the raider and its bearing in the ship's frame. */
  broadsideAim(out = {}) {
    const R = this.raider;
    out.sides = ['port', 'starboard'].map((k) => this.broadsideSide(k));
    out.target = null;
    out.dir = null;
    out.bears = out.sides.find((s) => s.bears)?.k ?? null;
    out.rails = this.railSides?.map((k) => this.railSide(k)) ?? null;
    out.railBears = out.rails?.find((s) => s.bears)?.k ?? null;
    if (!R || R.gone || R.dead || R.target) return out;
    out.target = R.obj.position;
    out.label = R.label;
    out.range = R.obj.position.distanceTo(this.C.obj.position);
    out.hull = R.hull / R.K.hull;
    out.dir = (out.d ??= new THREE.Vector3()).copy(R.obj.position);
    this.C.frame.worldToLocal(out.dir).normalize();
    return out;
  },

  /** Fires side `k`'s salvo (or the side that bears): returns why not, or null. From the helm (a click) or the CIC. */
  broadsideFire(k = null, by = 'helm') {
    const B = this.W.broadside;
    if (!B) return 'no broadside';
    const sides = ['port', 'starboard'].map((x) => this.broadsideSide(x));
    const s = k ? sides.find((x) => x.k === k) : sides.find((x) => x.bears && x.ready) ?? sides.find((x) => x.bears) ?? sides[0];
    if (!this.raider || this.raider.gone || this.raider.dead || this.raider.target) return 'no target';
    if (!s.bears) return s.range > B.range[1] ? 'out of range' : s.range < B.range[0] ? 'too close' : 'nothing bears: turn her side onto the raider';
    if (!s.fed) return `${s.k} magazines wrecked`;
    if (s.stock <= 0) return `${s.k} tubes empty`;
    if (!this.ship.power) return 'no power';
    if (!s.ready) return `${s.k} tubes reloading`;
    const b = this.broad[s.k], S = B[s.k], n = Math.min(B.salvo, b.stock);
    const dir = _d.set(...S.dir).transformDirection(this.C.frame.matrixWorld);
    for (let i = 0; i < n; i++) {
      const at = S.at[(b.next + i) % S.at.length];
      const p = this.C.frame.localToWorld(new THREE.Vector3(at[0] + S.dir[0] * 1.5, at[1], at[2]));
      // Out cold: pushed clear of the hull, its motor lit `cold` seconds later, well off her side.
      const t = this.torpedo(p, _b.copy(this.body.vel).addScaledVector(dir, B.push), 'ours');
      t.t = -(B.cold ?? 2) - i * 0.15;
      _m.lookAt(p, _c.copy(p).add(dir), Y);
      t.obj.quaternion.setFromRotationMatrix(_m);
      this.flash(p, 3, '#d8e8ff', 0.2);
      // The tube's charge of cold gas blowing out round it: frost, not fire.
      for (let j = 0; this.gas && j < 14; j++) {
        const v = _c.copy(dir).multiplyScalar(8 + 14 * Math.random()).add(this.body.vel);
        v.x += (Math.random() - 0.5) * 10;
        v.y += (Math.random() - 0.5) * 10;
        v.z += (Math.random() - 0.5) * 10;
        this.gas.emit(p, v, 1 + Math.random(), 1, 5 + 4 * Math.random(), 0.2, 0, 1);
      }
    }
    const first = _c.set(...S.at[b.next % S.at.length]); // ship frame
    this.feel?.gun('tube', 0, this.ship.you ? first.distanceTo(this.ship.you) : 200, this.ship.aboard !== false);
    b.next = (b.next + n) % S.at.length;
    b.stock -= n;
    b.t = B.reload;
    this.sfx?.cue('clunk', { vol: 0.6 });
    const side = s.k === 'port' ? 'Port' : 'Starboard';
    this.C.bus?.emit('call', { id: 'broadside', Side: side, n });
    this.dc?.say(null, `${by === 'helm' ? 'You fired' : 'The CIC fired'} the ${s.k} broadside: ${n} torpedoes, out cold.`, 0, 4);
    return null;
  },

  /** The broadside's reload, and the CIC firing the side that bears when nobody is at the helm to do it. */
  broadsideFrame(dt) {
    if (!this.broad) return;
    for (const b of Object.values(this.broad)) b.t = Math.max(0, b.t - dt);
    if (this.helmFires) return;
    for (const k of ['port', 'starboard']) {
      const s = this.broadsideSide(k);
      if (s?.bears && s.ready) return this.broadsideFire(k, 'cic');
    }
  },

  /** Each torpedo: its guidance (proportional navigation on the line to its target, the rest of its thrust down that
   *  line), the weave in its last stretch, its drive, and what it meets. */
  torpsFrame(dt) {
    const T = this.W.torpedo, R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    for (const t of this.torps) {
      if (t.dead) continue;
      t.t += dt;
      t.prev.copy(t.pos);
      // The target: a point in the carrier, or the raider.
      let tp, tv;
      if (t.side === 'theirs') (tp = this.C.frame.localToWorld(_a.copy(t.aim))), (tv = this.body.vel);
      else if (raiderLive) (tp = _a.copy(R.obj.position)), (tv = _d.copy(R.v).add(this.body.vel));
      else tp = null;
      const burning = t.t >= 0 && t.t < T.burn && tp; // a torpedo launched cold coasts first (t.t < 0)
      t.acc.set(0, 0, 0);
      if (burning) {
        const r = _b.subVectors(tp, t.pos), vr = _c.subVectors(tv, t.vel); // the target's place and velocity, from the torpedo
        const dist = r.length();
        const closing = Math.max(30, -r.dot(vr) / Math.max(1, dist));
        const tgo = dist / closing;
        // The miss it would make if nothing changed, and the push that removes it (N = 3), then the rest of the
        // thrust along the line of sight.
        const zem = _e.copy(r).addScaledVector(vr, tgo);
        const cmd = zem.multiplyScalar(3 / Math.max(0.3, tgo * tgo));
        const along = _f.copy(r).normalize();
        cmd.addScaledVector(along, -cmd.dot(along));
        if (cmd.length() > T.accel) cmd.setLength(T.accel);
        cmd.addScaledVector(along, Math.sqrt(Math.max(0, T.accel * T.accel - cmd.lengthSq())));
        // The weave: in its last stretch it throws itself about across the line, so a gun's lead is always behind.
        // It steadies again for the last few hundred metres (`settle`), long enough for the guidance to put it back
        // on the aim point: a torpedo that weaves all the way in weaves past.
        if (dist < T.terminal && dist > (T.settle ?? 500)) {
          if ((t.jinkT -= dt) <= 0) {
            t.jinkT = 0.25 + this.rand() * 0.35;
            t.jink.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5);
            t.jink.addScaledVector(along, -t.jink.dot(along)).setLength(T.jink);
          }
          cmd.add(_g.copy(t.jink).multiplyScalar(clamp((dist - (T.settle ?? 500)) / 400, 0, 1)));
        }
        t.acc.copy(cmd);
        t.vel.addScaledVector(cmd, dt);
        // Nose along the push, so its drive points away from where it is going.
        _m.lookAt(t.pos, _b.copy(t.pos).add(cmd), Y);
        t.obj.quaternion.setFromRotationMatrix(_m);
      }
      t.pos.addScaledVector(t.vel, dt);
      t.obj.position.copy(t.pos);
      const fl = t.obj.userData.flare;
      fl.visible = !!burning;
      fl.scale.setScalar(this.ear ? clamp(this.ear.distanceTo(t.pos) * 0.012, 6, 40) : 9);
      fl.material.opacity = 0.75 + 0.25 * Math.sin(t.t * 40);
      // What it meets.
      if (t.side === 'theirs') {
        if (t.pos.distanceTo(this.C.obj.position) < 300) {
          const s = { torpedo: true };
          if (this.hitsCarrier(s, t.prev, t.pos)) this.detonate(t, true);
        }
      } else if (raiderLive) {
        const r = R.obj.position.distanceTo(t.pos);
        if (r < T.fuse + R.K.size[2] * 0.5 && this.hitsRaider(t.prev, t.pos, _b)) this.detonate(t, false, _b);
        else if (r < T.fuse + 6) this.detonate(t, false, t.pos);
      }
      if (t.t > T.life) this.killTorp(t, null);
    }
    this.torps = this.torps.filter((t) => !t.dead);
  },

  /** A torpedo goes off: on the carrier (integrity has already taken the hit) or on the raider. */
  detonate(t, onCarrier, at = t.pos) {
    t.dead = true;
    t.obj.removeFromParent();
    this.flash(at, 26, '#ffd8a0', 0.9);
    this.flash(at, 12, '#ffffff', 0.25);
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(at) * 0.4) : 500, 60);
    if (onCarrier) return; // integrity.mjs has already taken the hit (and shaken you)
    const D = this.W.torpedo.raiderDamage;
    this.raiderHit(at, D[0] + this.rand() * (D[1] - D[0]));
    this.C.bus?.emit('call', { id: 'torpedo-hit-raider' });
    this.dc?.say(null, 'One of our torpedoes hit the raider.', 0, 4);
  },

  /** A torpedo is shot down (`by` who, for the log and the call) or burns out. */
  killTorp(t, by) {
    if (t.dead) return;
    t.dead = true;
    t.obj.removeFromParent();
    if (!by) return;
    this.flash(t.pos, 9, '#ffc080', 0.5);
    this.flash(t.pos, 4, '#ffffff', 0.12);
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(t.pos) * 0.5) : 600, 14);
    this.log.push({ t: this.time, kill: t.side, by });
    if (t.side === 'theirs' && by === 'you') this.dc?.say(null, 'You shot down a torpedo.', 0, 3);
    else if (t.side === 'theirs') {
      // Killed close in, its flash and bang look like a hit: say it was not one. Far out, nobody aboard would notice.
      const d = Math.round(t.pos.distanceTo(this.C.obj.position));
      if (d < 1500) this.dc?.say(null, `Point defence killed the torpedo ${d} m out. No hit.`, 0, 3);
    }
  },

  /** The first torpedo of `side` whose path this frame passes within `r` of the segment a→b (world). Each torpedo is
   *  tested where it was at the same moment of the frame. */
  torpHit(a, b, side, r) {
    for (const t of this.torps) {
      if (t.dead || t.side !== side) continue;
      // In the torpedo's own moving frame: shift the segment's start by how far it moved this frame.
      const A = _e.copy(a).sub(t.prev).add(t.pos), ab = _f.subVectors(b, A);
      const ap = _g.subVectors(t.pos, A);
      const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
      if (ap.addScaledVector(ab, -k).length() < r) return t;
    }
    return null;
  }
};
