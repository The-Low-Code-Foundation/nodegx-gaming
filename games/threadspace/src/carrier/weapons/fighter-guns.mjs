// The fighter's cannon, what her sight shows of the raider (`foe`), and the raider's flak at her. Part of `Weapons`
// (weapons.mjs).

import { THREE, _a, _b, _c, intercept } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const fighterGunParts = {
  // --- the fighter's cannon ------------------------------------------------------------------------------------------

  /** The fighter you fly, and whether its trigger is held (main.mjs, each frame before `frame`). */
  fly(fighter, trigger) {
    this.fighter = fighter;
    this.fighterTrigger = trigger;
  },

  /** Her twin chin cannon (the layout's `weapons.fighter`): fixed along her nose, one barrel then the other, from
   *  a drum of `rounds` that the hangar crew refill whenever she is on her pad. A round keeps her velocity and adds its
   *  own. It does to a raider what `damage` says: a fraction of a turret's shell, many times a second. */
  cannonFrame(dt) {
    const F = this.W.fighter, fi = this.fighter;
    if (!F || !fi) return;
    if (this.rounds == null || !fi.flying) this.rounds = F.rounds; // rearmed on the pad
    if (this.fhull == null || fi.phase === 'seated' || fi.phase === 'parked') (this.fhull = F.hull), (this.crippled = false); // and mended
    this.jolt = Math.max(0, (this.jolt ?? 0) - dt * 3);
    this.cannonT = Math.max(0, (this.cannonT ?? 0) - dt);
    if (!this.fighterTrigger || !fi.flying || this.crippled || this.rounds <= 0 || this.cannonT > 0) return;
    this.cannonT = F.every;
    this.rounds--;
    const w = fi.obj, r = this.rand;
    w.updateWorldMatrix(true, false);
    const i = (this.cannonBarrel = 1 - (this.cannonBarrel ?? 0));
    const muzzles = w.userData.muzzles ?? [];
    const p = w.localToWorld((muzzles[i] ?? new THREE.Vector3(0, -0.8, -5.6)).clone());
    const d = _b.set((r() - 0.5) * 2 * F.spread, (r() - 0.5) * 2 * F.spread, -1).normalize().transformDirection(w.matrixWorld);
    // Each round kicks her back a little (`shellMass` kg at `shell` m/s), so a long burst slows her along her nose.
    if (F.shellMass && fi.body?.mass) fi.body.vel.addScaledVector(d, (-F.shell * F.shellMass) / fi.body.mass);
    this.cannonBlast(p, d);
    const s = this.fire(p, d.multiplyScalar(F.shell).add(fi.body.vel), true, F.range / F.shell, F.damage[0] + r() * (F.damage[1] - F.damage[0]));
    s.you = s.cannon = true;
    s.w = 0.22;
    // Felt through the airframe more than heard: a chug and a shiver in the seat (gunfeel.mjs), or the old knock.
    if (this.feel) this.feel.fighterShot();
    else this.sfx?.play('hit', 30);
  },

  /** The cannon's muzzle at `p` along `d` (world, unit): a flash, a star, and a puff of hot gas (unseeded: looks only). */
  cannonBlast(p, d) {
    this.flash(p, 1.2, '#ffd9a0', 0.06);
    this.flash(_c.copy(p).addScaledVector(d, 0.8), 0.6, '#ffffff', 0.03);
    const G = this.gas, v0 = this.fighter.body.vel;
    for (let i = 0; G && i < 3; i++) {
      const v = _c.copy(d).multiplyScalar(15 + 25 * Math.random()).add(v0);
      v.x += (Math.random() - 0.5) * 12;
      v.y += (Math.random() - 0.5) * 12;
      v.z += (Math.random() - 0.5) * 12;
      G.emit(p, v, 0.25 + 0.3 * Math.random(), 0.2, 1 + Math.random(), 0.3, 0.8, 0);
    }
  },

  /** What her sight can show: every live enemy craft, or the target sled on a drill. */
  contacts() {
    const R = this.raider;
    return R?.target && !R.gone ? [R] : this.foes();
  },

  /** The contact her sight shows: the one picked with X while it lives, else the nearest. */
  selected() {
    const fi = this.fighter, all = this.contacts();
    if (!fi?.obj || !all.length) return null;
    if (this.picked && all.includes(this.picked)) return this.picked;
    this.picked = null;
    let best = null, bd = Infinity;
    for (const F of all) {
      const d = F.obj.position.distanceTo(fi.obj.position);
      if (d < bd) (bd = d), (best = F);
    }
    return best;
  },

  /** X in the fighter: the next contact, nearest first. */
  nextFoe() {
    const fi = this.fighter, all = this.contacts();
    if (!fi?.obj || !all.length) return null;
    all.sort((a, b) => a.obj.position.distanceTo(fi.obj.position) - b.obj.position.distanceTo(fi.obj.position));
    const now = this.selected();
    this.picked = all[(all.indexOf(now) + 1) % all.length];
    return this.picked;
  },

  /** The other contacts, for small brackets on her HUD: `[{ point, label }]`. */
  foeMarks(out = []) {
    out.length = 0;
    const sel = this.selected();
    for (const F of this.contacts()) if (F !== sel) out.push({ point: F.obj.position, label: F.label });
    return out;
  },

  /** What the fighter's sight shows of the contact it has selected: where it is, where to point her nose so her rounds
   *  meet it (null out of range), its name, range and state. Null with nothing out there. */
  foe(out = {}) {
    const F = this.W.fighter, fi = this.fighter;
    const R = this.selected();
    if (!F || !fi?.obj || !R) return null;
    const me = fi.obj.getWorldPosition(_a);
    const r = _b.subVectors(R.obj.position, me);
    const v = R.kind === 'bandit' ? _c.copy(R.body.vel).sub(fi.body.vel) : _c.copy(R.v).add(this.body.vel).sub(fi.body.vel); // its velocity as she sees it
    const range = r.length();
    const tt = range < F.range * 1.5 ? intercept(r, v, F.shell) : null;
    out.point = R.obj.position;
    out.lead = tt != null && tt < F.range / F.shell ? (out.leadV ??= new THREE.Vector3()).copy(me).add(r).addScaledVector(v, tt) : null;
    out.label = R.label;
    out.range = range;
    out.closing = range > 1 ? -r.dot(v) / range : 0;
    out.shield = null; // nobody has shields
    out.hull = R.target ? null : Math.max(0, R.hull) / R.K.hull;
    out.bandit = R.kind === 'bandit';
    out.count = this.contacts().length;
    out.hits = R.target ? R.hits : null;
    return out;
  },

  /** The point defence in a line: guns up, torpedoes inbound. */
  pdLine(red = '#ff5a4a') {
    const up = this.pdcs.filter((g) => g.ok && g.stock > 0).length;
    const inbound = this.torps.filter((t) => !t.dead && t.side === 'theirs').length;
    return [`point defence ${up}/${this.pdcs.length}${inbound ? `  ·  ${inbound} torpedo${inbound > 1 ? 'es' : ''} inbound` : ''}`, inbound || up < this.pdcs.length ? red : '#cfe8ff'];
  }
};
