// The fighter seat: into one of the hangar's fighters, launched down the lane, flown, and back aboard (fighter.mjs
// flies her, approach.mjs is the lane home, cockpit.mjs her screens). Here: getting in and out, her keys, and her
// instruments each frame (the HUD and the screens, the prompt, and the panel from the chase view).

import * as THREE from 'three';

const PROMPTS = {
  launch: { key: '', label: 'Launching: the lane runs you out through the bay' },
  landing: { key: '', label: 'Flight control has you: bringing you in' },
  turn: { key: '', label: 'On the pad: turning you round for the next launch' },
  wrecked: { key: '', label: 'She is breaking up' }
};
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const FOE = {}; // what the fighter's sight shows of the contact she has selected (weapons/fighter-guns.mjs `foe`)
const MARKS = []; // the other contacts (`foeMarks`)
const RESCUE = {}; // the rescue craft on her way (rescue.mjs `mark`)
/** Low enough on the drive's propellant or the jets' gas to want a rescue craft: under a fifth of either. */
const low = (fl) => fl.prop.main < fl.S.tank.main * 0.2 || fl.prop.rcs < fl.S.tank.rcs * 0.2;
const range = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`);

/** How a landing you flew yourself went: speed and how far off the line when flight control caught you. */
function grade(l) {
  const word = l.speed < 6 && l.off < 1.5 ? 'Textbook.' : l.speed < 9 && l.off < 3 ? 'Good landing.' : 'Firm, but down.';
  return `Landed: ${l.speed.toFixed(1)} m/s, ${l.off.toFixed(1)} m off the line. ${word}`;
}

export class FighterSeat {
  constructor(G) {
    this.G = G;
  }

  /** Into fighter `i`: her lane, her screens, and flight control opens the bay for a pilot in a seat. */
  board(i) {
    const { fighter, approach, cockpit, setMode, doors } = this.G;
    fighter.board(i);
    approach.setPad(fighter.home.pos.z, fighter.out);
    cockpit.attach(fighter.obj);
    setMode('fighter');
    doors.setBay(1);
  }

  /** Out of her on the pad, beside her: in the airless hangar, at her grab frame on the end of her spur of the gangway,
   *  facing her (the Floater takes the frame's bar for you). */
  leave() {
    const { fighter, cockpit, setMode, walk, deckOf } = this.G;
    cockpit.detach();
    const s = fighter.leave();
    setMode('walk');
    walk.goDeck(deckOf('hangar') ?? 3, s.x, s.z, s.yaw);
  }

  key(code) {
    const { fighter, body, doors } = this.G;
    if (code === 'KeyV') fighter.view = fighter.view === 'cockpit' ? 'chase' : 'cockpit';
    else if (code === 'KeyM') fighter.toggleMouse();
    else if (code === 'KeyT') fighter.debugRefill();
    else if (code === 'KeyX' && fighter.flying) this.G.guns.nextFoe(); // the next contact on her sight
    else if (code === 'KeyQ' && fighter.flying) this.G.guns.fireMissile(); // a heat-seeker off the rail
    else if (code === 'KeyG' && fighter.flying) this.G.guns.dropFlares(); // a pair of flares
    else if (code === 'Digit1' && fighter.flying) this.G.rescue?.call('tanker'); // run dry: the tanker comes to you
    else if (code === 'Digit2' && fighter.flying) this.G.rescue?.call('tug'); // or the tug tows you home
    else if (code === 'KeyE') {
      if (fighter.phase === 'seated') this.G.fadeThen(() => this.leave());
      else if (fighter.canLand(body.vel) && !fighter.towed) {
        doors.setBay(1);
        fighter.land();
      }
    }
  }

  /** The camera and her instruments. */
  frame(dt) {
    this.G.fighter.placeCamera(this.G.camera, dt);
    this.instruments(dt);
  }

  instruments(dt) {
    const { L, C, fighter, hud, body, approach, cockpit, guns, camera, doors, blenderFighters } = this.G;
    const ph = fighter.phase;
    hud.mode(fighter.flying ? 'fighter' : 'pad');
    // From the cockpit the HUD and the screens carry it all; from behind her, the panel at the side does.
    hud.helmEl.hidden = !(fighter.flying && (fighter.view === 'chase' || !blenderFighters));
    const fl = fighter.flight;
    hud.where(fighter.flying ? `Fighter · ${fl.assistOn ? 'attitude hold: the mouse moves the aim' : 'hold off: your hand on the valves'} · mouse ${fighter.mouseMode}` : ph === 'landing' ? 'Fighter · on approach' : ph === 'wrecked' ? 'Fighter · breaking up' : 'Fighter · in the hangar');
    if (ph === 'seated') hud.use(fighter.refuelT > 0 ? { key: '', label: 'The deck crew are topping up your tanks' } : !fl.online ? { key: '', label: 'The drive is spinning up' } : doors.open ? { key: 'W', label: 'Launch (hold)' } : { key: '', label: 'Flight control is opening the bay doors' });
    else if (ph === 'flying') hud.use(this.G.rescue?.prompt() ?? (fighter.canLand(body.vel) && !approach.state.inLane ? { label: 'Hand over: flight control brings you in' } : low(fl) ? { key: '1 / 2', label: `${fl.dryMain ? 'Fuel dry' : 'Fuel low'}: 1 calls the tanker, 2 a tug to tow you home` } : null));
    else if (ph === 'turn' && fighter.lastLanding?.manual) hud.use({ key: '', label: grade(fighter.lastLanding) });
    else hud.use(PROMPTS[ph] ?? null);
    const lane = approach.state;
    const gate = fighter.gateWorld(_p);
    const rel = _f.copy(fighter.body.vel).sub(body.vel);
    const to = gate.clone().sub(fighter.obj.getWorldPosition(new THREE.Vector3()));
    const dist = to.length();
    const closing = dist > 0.1 ? rel.dot(to) / dist : 0;
    if (fighter.flying) hud.helm(fl, { dist, closing, ref: body.vel });
    if (!fighter.obj) return cockpit.hide();
    // Where to fly: down the lane once you are on it, to its far ring until then.
    const entry = approach.pointAt(approach.len);
    const entryDist = entry.distanceTo(fighter.obj.getWorldPosition(new THREE.Vector3()));
    const aim = lane.inLane ? { point: approach.pointAt(Math.max(0, lane.along - 80)), label: `BAY ${range(dist)}` } : { point: entry, label: `LANE ${range(entryDist)}` };
    cockpit.frame(dt, {
      fighter, carrier: body, C, lane, approach, camera, aim, bayDist: dist, closing, entryDist,
      cockpit: fighter.view === 'cockpit', bayOpen: doors.open, pad: fighter.index + 1,
      foe: fighter.flying ? guns.foe(FOE) : null, marks: fighter.flying ? guns.foeMarks(MARKS) : null, rounds: guns.rounds, roundsMax: L.weapons.fighter?.rounds,
      missiles: guns.rails, flares: guns.myFlares, lock: fighter.flying ? guns.lock : null, lockName: guns.lockName(), seeing: guns.seeing, warn: fighter.flying ? guns.warn : null,
      hull: guns.fhull != null ? guns.fhull / L.weapons.fighter.hull : 1,
      rescue: fighter.flying ? this.G.rescue?.mark(RESCUE) : null
    });
  }
}
