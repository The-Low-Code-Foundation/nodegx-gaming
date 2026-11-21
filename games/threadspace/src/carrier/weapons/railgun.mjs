// The railguns: on v2 one out of each hangar wall at her centre of mass, aimed by turning the ship; on v1 one along
// the keel. Charging, bearing, firing, the slug. Part of `Weapons` (weapons.mjs).

import { THREE, at, DEG, _a, _b, _r1, _r2, _r3, _kq, turn, intercept } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const railgunParts = {
  // --- the railgun -----------------------------------------------------------------------------------------------------

  /** One broadside railgun as it stands: its capacitors and slugs, whether it can fire, and where its slug would pass
   *  the raider (null when it is behind the gun or out of range): `miss` metres off where the raider will be when the
   *  slug gets there, that as angles off the beam (`ahead` and `high`, degrees, in the ship's frame), and `bears` when
   *  the slug would go through its hull (inside `window` of the ellipsoid shells hit). */
  railSide(k, R = this.raider) {
    const G = this.W.railgun, g = G[k], S = this.rail[k];
    const ok = (this.ship.node(g.room)?.health ?? 100) >= 20;
    const out = { k, charge: S.charge, stock: S.stock, ok, ready: ok && S.charge >= 1 && S.stock > 0 && this.ship.power && !this.plant?.hot, miss: null, range: null, bears: false };
    if (!R || R.gone || R.dead || R.target) return out;
    const p = this.C.frame.localToWorld(_r1.set(...g.muzzle));
    const lead = _r2.subVectors(R.obj.position, p);
    const tt = intercept(lead, R.v, G.speed); // the slug keeps her velocity: only the raider's past her counts
    if (tt == null) return out;
    lead.addScaledVector(R.v, tt);
    const d = _r3.set(...g.dir).transformDirection(this.C.frame.matrixWorld);
    const along = lead.dot(d);
    if (along <= 0 || along > G.range) return out;
    out.range = lead.length();
    // The angles, in the ship's frame, before `lead` becomes the miss.
    const l = _r1.copy(lead).applyQuaternion(this.C.frame.getWorldQuaternion(_kq).invert());
    out.ahead = Math.atan2(-l.z, Math.abs(l.x)) / DEG;
    out.high = Math.atan2(l.y, Math.abs(l.x)) / DEG;
    // The miss: from the raider to the slug's line, then in the raider's own frame against the ellipsoid shells hit.
    const m = lead.addScaledVector(d, -along).negate();
    out.miss = m.length();
    const size = R.K.size;
    m.applyQuaternion(R.obj.getWorldQuaternion(_kq).invert());
    out.bears = Math.hypot(m.x / size[0], m.y / size[1], m.z / size[2]) < G.window;
    return out;
  },

  /** Fires a railgun: on the spin-drum carrier side `k`'s (or, from the helm, the side facing the raider), on the first
   *  carrier the one along her keel. Returns why not, or null. From the helm or the CIC (`by`). */
  railFire(k = null, by = 'helm') {
    const G = this.W.railgun;
    if (!G) return 'no railgun';
    if (!this.railSides) {
      const S = this.rail;
      const why = S.stock <= 0 ? 'no slugs' : !this.ship.power ? 'no power' : this.plant?.hot ? 'heat sinks full' : S.charge < 1 ? 'charging' : null;
      if (why) return why;
      this.railShot(G.muzzle, [0, 0, -1], S, true);
      return null;
    }
    let s;
    if (k) s = this.railSide(k);
    else {
      // The helm's: the side that bears, else the side the raider is on (the helmsman's call to fire it).
      const sides = this.railSides.map((x) => this.railSide(x));
      s = sides.find((x) => x.bears) ?? sides.find((x) => x.miss != null);
      if (!s) return this.raider && !this.raider.gone && !this.raider.dead && !this.raider.target ? 'nothing on either beam: turn her side onto the raider' : 'no target';
    }
    const S = this.rail[s.k];
    if (!s.ok) return `${s.k} railgun wrecked`;
    if (S.stock <= 0) return `${s.k} railgun: no slugs`;
    if (!this.ship.power) return 'no power';
    if (this.plant?.hot) return 'heat sinks full';
    if (S.charge < 1) return `${s.k} railgun charging`;
    this.railShot(G[s.k].muzzle, G[s.k].dir, S, by === 'helm');
    const side = s.k === 'port' ? 'Port' : 'Starboard';
    this.C.bus?.emit('call', { id: 'railgun', Side: side });
    this.dc?.say(null, `${by === 'helm' ? 'You fired' : 'The CIC fired'} the ${s.k} railgun.`, 0, 3);
    return null;
  },

  /** One slug out of muzzle `at` along `dir` (both ship frame), from capacitors and stock `S`; its kick goes into her. */
  railShot(at, dir, S, you) {
    const G = this.W.railgun, r = this.rand;
    S.charge = 0;
    S.stock--;
    S.flash = 1;
    const p = this.C.frame.localToWorld(new THREE.Vector3(...at));
    const d = _r1.set(dir[0] + (r() - 0.5) * 2 * G.spread, dir[1] + (r() - 0.5) * 2 * G.spread, dir[2] + (r() - 0.5) * 2 * G.spread).normalize().transformDirection(this.C.frame.matrixWorld);
    const J = _r3.copy(d).multiplyScalar(-G.speed * (G.slug ?? 0));
    const s = this.fire(p, _r2.copy(d).multiplyScalar(G.speed).add(this.body.vel), true, G.range / G.speed, G.damage[0] + r() * (G.damage[1] - G.damage[0]));
    s.rail = true;
    s.you = you;
    s.w = 1.4;
    this.flash(p, 18, '#cfe4ff', 0.45);
    this.flash(p, 7, '#ffffff', 0.12);
    this.blast(p, _r2.copy(d), 1.6, '#cfe4ff'); // the sabot and the rails' plasma thrown out ahead of her
    this.plant?.addHeat(G.heat);
    this.sfx?.play('boom', this.ship.aboard ? 160 : this.ear ? this.ear.distanceTo(p) : 60, 50);
    if (G.slug) this.recoil(p, J, 'rail');
    else (this.ship.shake = Math.max(this.ship.shake, 0.6)), this.feel?.gun('rail', 0, 100, this.ship.aboard !== false);
  },

  /** The capacitors charging, and the CIC firing a broadside railgun as the raider crosses its line when nobody is at
   *  the helm to do it. */
  railFrame(dt) {
    const G = this.W.railgun;
    if (!G) return;
    for (const S of this.railSides ? this.railSides.map((k) => this.rail[k]) : [this.rail]) {
      if (this.ship.power && !this.plant?.hot) S.charge = Math.min(1, S.charge + dt / G.charge);
      S.flash = Math.max(0, S.flash - dt * 2);
    }
    if (!this.railSides || this.helmFires) return;
    for (const k of this.railSides) {
      const s = this.railSide(k);
      if (s.bears && s.ready) return this.railFire(k, 'cic');
    }
  },

  /** What the first carrier's railgun sight shows: the charge, the slugs, and the raider with where to point her nose
   *  so a slug meets it (the lead, a world point), or null with nothing out there. */
  railAim(out = {}) {
    const G = this.W.railgun, S = this.rail, R = this.raider;
    out.charge = S.charge;
    out.stock = S.stock;
    out.ready = S.charge >= 1 && S.stock > 0 && this.ship.power && !this.plant?.hot;
    out.target = null;
    if (!G || !R || R.gone || R.dead) return out;
    const p = this.C.frame.localToWorld(_a.set(...G.muzzle));
    const r = _b.subVectors(R.obj.position, p);
    const tt = intercept(r, R.v, G.speed); // the slug keeps her velocity: only the raider's past her counts
    out.target = R.obj.position;
    out.label = R.label;
    out.range = r.length();
    out.lead = tt != null ? (out.leadV ??= new THREE.Vector3()).copy(p).add(r.addScaledVector(R.v, tt)) : null;
    out.hull = R.target ? null : Math.max(0, R.hull) / R.K.hull;
    return out;
  }
};
