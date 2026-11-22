// Fire control: what the ship's gunners are told. Two things, the same for every turret:
//
// - the weapons state: `hold` (do not fire), `tight` (fire only at the designated target) or `free`;
// - the designated target: the contact the captain, or the fire control officer, wants the heavy guns on.
//
// Somebody gives the orders. Until anyone does, the default logic here follows the raid (`auto`, each frame):
//
//   no contact, or the raid over            HOLD, nothing designated
//   a raider (or the drill's target sled)   HOLD while it is being identified (`identify` seconds; `drillIdentify`
//     appears                               for a sled), and while it is beyond `range` (the guns' own by default)
//   identified and in range                 TIGHT, the raider (or the sled) designated
//   torpedoes or bandits inbound            FREE (the raider stays designated); TIGHT again `settle` seconds after
//                                           the last of them is gone
//
// A mission system or an NPC captain drives it instead with `order(state, { by, target })` and `designate(contact,
// { by })`; `auto()` hands it back to the default logic. `ordered` says which is in charge.
//
// On the bus (src/core/events.mjs): `weapons-state` { state, was, by, target } and `designate` { target, kind, was, by }
// every time either changes, whoever is listening. The spoken calls (`weapons-hold`, `weapons-tight`, `weapons-free`,
// `check-fire`; content/announcements/) are made only while you are at a gun: they are the gunners' net talking to
// you, and a ship fighting with nobody in a turret says exactly what she said before.
//
// Who obeys. You may fire as you like: a round fired on HOLD, or on TIGHT at something that is not the designated
// target (more than `cone` degrees off it and off its lead), is rebuked ("Check fire") and counted: `roundsOff` every
// such round, `violations` every incident (a new one after `incident` seconds of behaving), for a career to use. The
// turret crews (weapons/turrets.mjs `turretsFrame`) obey only an order somebody gave (`ordered`): under the default
// logic they fire as they always did, so a fight with nobody giving orders is the fight it was before this file.
//
// Nothing here draws a random number or borrows the weapons' scratch vectors. The numbers are `FIRE_CONTROL`; a
// layout's `weapons.fireControl` overrides any of them. In the console: `__carrier.guns.fireControl`.

import * as THREE from 'three';

export const FIRE_CONTROL = {
  identify: 5, // seconds a new raider is watched before it is called hostile
  drillIdentify: 2, // the same for the drill's target sled
  range: null, // metres: beyond this, hold (null: the guns' own range)
  settle: 3, // seconds after the last torpedo or bandit before FREE goes back to TIGHT
  cone: 12, // degrees off the designated target (and off its lead) that still counts as firing at it
  incident: 5 // seconds without an offending round before the next one is a new violation
};

export const STATES = ['hold', 'tight', 'free'];
export const STATE_NAME = { hold: 'WEAPONS HOLD', tight: 'WEAPONS TIGHT', free: 'WEAPONS FREE' };

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();

/** Where a contact is (world): a raider or bandit has an `obj`, a torpedo or missile a `pos`. */
export const posOf = (ref) => ref?.obj?.position ?? ref?.pos ?? null;

/** Whether a contact is still there to shoot at. */
export const alive = (ref) => !!ref && !ref.gone && !ref.dead;

export class FireControl {
  /** `guns` is the ship's `Weapons` (her raider, torpedoes, bandits, clock and layout). */
  constructor(C, guns) {
    this.C = C;
    this.guns = guns;
    this.K = { ...FIRE_CONTROL, ...(guns.W.fireControl ?? {}) };
    this.state = 'hold';
    this.designated = null; // { ref, kind: 'raider' | 'target' | 'bandit' | 'torpedo' | 'contact', label }
    this.by = 'auto'; // who gave the state: 'auto' (the default logic) or whatever `order` was told
    this.ordered = false; // somebody other than the default logic is giving the orders
    this.violations = 0; // incidents of firing against orders
    this.roundsOff = 0; // every round fired against orders
    this.rebuke = null; // the last one: { t, why: 'hold' | 'tight' }
    this.seen = null; // the contact the default logic is identifying, and for how long
    this.seenT = 0;
    this.quietT = 0;
    this.changedT = -99; // `guns.time` of the last change of state (the sight flashes the new one)
  }

  // --- orders ----------------------------------------------------------------------------------------------------------

  /** An order from the captain, a mission or the fire control officer: the state, and with `target` the contact it
   *  is about. From now on the default logic stands aside (`auto()` brings it back). */
  order(state, { by = 'captain', target } = {}) {
    if (!STATES.includes(state)) throw new Error(`fire control: no weapons state "${state}"`);
    this.ordered = true;
    if (target !== undefined) this.designate(target, { by });
    this.set(state, by);
  }

  /** Designates `ref` (a raider, a bandit, a torpedo: anything with `obj.position` or `pos`), or nothing. `by`
   *  anything but 'auto' is an order, as `order` is. */
  designate(ref, { by = 'captain', kind, label } = {}) {
    if (by !== 'auto') this.ordered = true;
    const was = this.designated;
    if ((was?.ref ?? null) === (ref ?? null)) return;
    const k = kind ?? kindOf(ref, this.guns);
    this.designated = ref ? { ref, kind: k, label: label ?? ref.label ?? k.toUpperCase() } : null;
    this.C.bus?.emit('designate', { target: this.designated?.label ?? null, kind: this.designated?.kind ?? null, ref: ref ?? null, was: was?.label ?? null, by });
  }

  /** Back to the default logic (the raid decides). */
  auto() {
    this.ordered = false;
    this.seen = null;
  }

  set(state, by = 'auto') {
    this.by = by;
    if (state === this.state) return;
    const was = this.state;
    this.state = state;
    this.changedT = this.guns.time;
    this.C.bus?.emit('weapons-state', { state, was, by, target: this.designated?.label ?? null });
    // The gunners' net says it to whoever is at a gun (see the top of this file).
    if (!this.atGun()) return;
    if (state === 'hold') this.C.bus?.emit('call', { id: 'weapons-hold' });
    else if (state === 'tight') this.C.bus?.emit('call', { id: 'weapons-tight' });
    else this.C.bus?.emit('call', { id: 'weapons-free' });
  }

  /** You are in a turret. */
  atGun() {
    return !!this.guns.manned && this.guns.mode === 'gun';
  }

  // --- each frame ------------------------------------------------------------------------------------------------------

  frame(dt) {
    const g = this.guns;
    // A designated contact that is gone is no longer designated, whoever chose it.
    if (this.designated && !alive(this.designated.ref)) this.designate(null, { by: 'auto' });
    if (this.ordered) return;
    const R = g.raider, live = alive(R) ? R : null;
    if (!live) {
      this.seen = null;
      if (this.designated) this.designate(null, { by: 'auto' });
      return this.set('hold');
    }
    if (this.seen !== live) (this.seen = live), (this.seenT = 0), (this.quietT = 0);
    this.seenT += dt;
    const range = live.obj.position.distanceTo(this.C.obj.position);
    const known = this.seenT >= (live.target ? this.K.drillIdentify : this.K.identify) && range <= (this.K.range ?? g.W.gun.range);
    if (!known && this.state === 'hold') return; // still watching it
    if (this.designated?.ref !== live) this.designate(live, { by: 'auto' });
    const inbound = this.inbound();
    if (inbound) this.quietT = 0;
    else this.quietT += dt;
    this.set(inbound || (this.state === 'free' && this.quietT < this.K.settle) ? 'free' : 'tight');
  }

  /** Torpedoes or bandits coming for her. */
  inbound() {
    const g = this.guns;
    for (const tp of g.torps) if (!tp.dead && tp.side === 'theirs') return true;
    for (const B of g.bandits) if (!B.gone && !B.dead) return true;
    return false;
  }

  // --- who may fire ----------------------------------------------------------------------------------------------------

  /** May a turret's crew fire at `target` (the raider is all they ever lay on)? Under the default logic, always. */
  crewsMay(target) {
    if (!this.ordered) return true;
    return this.state === 'free' || (this.state === 'tight' && this.designated?.ref === target);
  }

  /** Would a round along `dir` (world, a unit vector) from `from` be against orders? 'hold', 'tight', or null. */
  against(from, dir) {
    if (this.state === 'hold') return 'hold';
    if (this.state !== 'tight') return null;
    const D = this.designated, p = posOf(D?.ref);
    if (!p) return null; // tight with nothing designated: nothing to hold you to
    const cos = Math.cos(this.K.cone * (Math.PI / 180));
    if (_d.subVectors(p, from).normalize().dot(dir) >= cos) return null;
    // Or on its lead: where it will be when the shell gets there (a raider's `v` is its velocity past her).
    const v = D.ref.v;
    if (v) {
      const tt = _p.subVectors(p, from).length() / this.guns.W.gun.shell;
      if (_d.subVectors(p, from).addScaledVector(_v.copy(v), tt).normalize().dot(dir) >= cos) return null;
    }
    return 'tight';
  }

  /** You fired a round from `from` along `dir` (world). Counts it, and rebukes you, if it was against orders. */
  fired(from, dir) {
    const why = this.against(from, dir);
    if (!why) return null;
    const t = this.guns.time;
    this.roundsOff++;
    const fresh = !this.rebuke || t - this.rebuke.t > this.K.incident;
    this.rebuke = { t, why };
    if (fresh) {
      this.violations++;
      this.C.bus?.emit('call', { id: 'check-fire' });
    }
    return why;
  }
}

function kindOf(ref, guns) {
  if (!ref) return null;
  if (ref === guns.raider) return ref.target ? 'target' : 'raider';
  if (guns.bandits.includes(ref)) return 'bandit';
  if (guns.torps.includes(ref)) return 'torpedo';
  return 'contact';
}
