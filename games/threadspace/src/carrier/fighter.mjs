// A fighter from the carrier's hangar, flown: climb in on the hangar floor, the drive spins up, flight control opens
// the bay, W runs you out along the launch lane, and once you are clear of the hull she is yours. In space she flies
// Newton's way and nothing else (flight.mjs, numbers in the layout's `fighter.flight`): hold W to burn the main drive,
// let go and it cuts; small jets in four blocks turn her with pop, coast, pop; nothing slows you down unless you point
// the drive the other way and burn. Speeds are measured against the carrier.
//
// Controls: W burn (hold) · S retro jet · A D slide · R F rise and sink · mouse moves the aim (M: a virtual stick
// instead) · arrows turn · Z C roll · Space attitude hold on and off. The tanks are finite: they are topped up on the
// pad after you land (`?debug=1` adds T to refill them anywhere).
//
// Seen and heard: her drive's flame and gas and the jets' glints and bursts (gas.mjs `DriveFx`), and her sound
// (flight-audio.mjs), all driven from the same `Flight`.
//
// The launch hands over honestly: the velocity you leave with is the carrier's, plus her spin carrying the bay round,
// plus your run down the lane, so a turning carrier flings her fighters. Landing is flight control's guidance: within
// range of the bay and slow enough, E lets it fly you in along a path round the hull, set you on your pad and turn you
// round for the next launch.
//
// Landing yourself: fly down the approach lane (approach.mjs) and through its last ring slowly and on the line, and
// flight control catches you (`capture`) and sets you on your pad, with a grade (`lastLanding`).
//
// Either side: a pad's fighter launches the way her nose points across the ship (`out`, -1 port, +1 starboard), and
// comes home through a gate and a lane on that side. The layout's `fighter.launch.clear` and `fighter.landing.gate[0]`
// are distances out from the ship's centre line (their sign is ignored).
//
// Phases: parked (nobody aboard) · seated (in the hangar) · launch · flying · landing · turn (on the pad).

import * as THREE from 'three';
import { Rigid } from './newton.mjs';
import { GLoad } from './gload.mjs';
import { Flight, controls } from './flight.mjs';
import { DriveFx } from './gas.mjs';
import { foldWings, openCanopy } from '../ships.mjs';
import { setGear } from './fighter-model.mjs';
import { clamp } from '../util.mjs';

const LIFT_T = 1.6; // seconds to rise off the pad
const TURN_T = 2.6; // seconds for the pad to turn her round
const POWER_T = 3; // seconds for the drive to spin up after you climb in (the power-up)
const REFUEL_T = 4; // seconds on the pad to top the tanks up after a landing
const IDLE = { keys: new Set(), dx: 0, dy: 0 };
const smooth = (k) => k * k * (3 - 2 * k);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const EYE_TILT = (7 * Math.PI) / 180;
const _tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -EYE_TILT);

export class Fighter {
  /** `C` the built carrier (layout.mjs), `scene` where she flies once she is out, `gas` where her exhaust goes
   *  (gas.mjs), `audio` her sound (flight-audio.mjs, optional). */
  constructor(C, scene, { gas, audio = null, debug = false } = {}) {
    this.C = C;
    this.scene = scene;
    this.S = C.L.fighter;
    this.deck = C.decks.get(3);
    this.body = new Rigid({ mass: this.S.mass, size: this.S.size });
    this.flight = new Flight(this.S.flight, this.body, this.S.thrusters.main[0].force);
    this.flight.boostSpec = this.S.g ?? null; // hard burn (Shift with W)
    this.gl = new GLoad(this.S.g ?? { tolerate: 99, onset: 0, juiceCut: 1, recover: 1, juice: 0 }); // what the g does to you
    this.fx = new DriveFx(gas, this.flight); // her flame, gas and jets, moved onto whichever fighter you are in
    this.audio = audio;
    this.debug = debug;
    this.flight.on.ignite = () => this.audio?.ignite();
    this.flight.on.cutoff = (secs) => this.audio?.cutoff(secs);
    this.ctl = controls();
    this.mouseMode = 'direct'; // or 'stick' (M)
    this.stick = { x: 0, y: 0 };
    this.spaceWas = false;
    this.powerT = 0;
    this.refuelT = 0;
    this.phase = 'parked';
    this.index = -1;
    this.obj = null;
    this.t = 0;
    this.time = 0;
    this.canopy = 0;
    this.canopyWant = 0;
    this.wings = 1;
    this.wingsWant = 1;
    this.gear = 1;
    this.gearWant = 1;
    this.lastLanding = null;
    this.vLocal = new THREE.Vector3(); // during the launch run: her velocity in the carrier's frame
    this.view = 'cockpit';
    this.chasePos = new THREE.Vector3();
    this.inside = null;
  }

  get aboard() {
    return this.phase !== 'parked';
  }

  /** In free flight, under your hands. */
  get flying() {
    return this.phase === 'flying';
  }

  /** On or over the hangar floor (seated, launching, landing or turning). */
  get inHangar() {
    return this.aboard && this.phase !== 'flying';
  }

  // --- getting in and out ------------------------------------------------------------------------------------------

  board(i) {
    const w = this.C.fighters[i];
    this.index = i;
    this.obj = w;
    this.home = { pos: w.position.clone(), quat: w.quaternion.clone() }; // the pad, in the carrier's frame
    this.out = Math.sign(_v.set(0, 0, -1).applyQuaternion(w.quaternion).x) || -1; // the side she launches to and lands from
    // Each fighter keeps her own tanks: what you leave in her is what the next sortie starts with.
    w.userData.prop ??= { ...this.S.flight.tank };
    this.flight.reset(w, w.userData.prop);
    for (const p of [...(w.userData.plumes ?? []), ...(w.userData.halos ?? [])]) p.visible = false; // the old look
    this.fx.attach(w, w.userData.nozzle ?? null);
    this.powerT = 0;
    this.refuelT = 0;
    this.audio?.powerUp();
    this.phase = 'seated';
    this.canopy = 1;
    this.canopyWant = 0;
    this.wings = w.userData.folded ?? 1;
    this.wingsWant = 1;
    this.gear = this.gearWant = 1;
    this.inside = null;
    this.body.vel.set(0, 0, 0);
    this.body.ang.set(0, 0, 0);
    this.flight.assist = 0; // HOLD
    return w;
  }

  /** Climbs out (only on the pad). Returns where to stand: beside her, in the carrier's frame, and a facing. */
  leave() {
    const w = this.obj;
    this.fx.detach();
    this.audio?.powerDown();
    w.traverse((m) => m.userData.cockpitHidden && (m.visible = true));
    if (w.userData.strobe) w.userData.strobe.visible = false;
    openCanopy(w, 1);
    const spot = { x: this.home.pos.x + 1, z: this.home.pos.z - 4.6, yaw: Math.PI };
    this.phase = 'parked';
    this.index = -1;
    this.obj = null;
    return spot;
  }

  // --- launch and landing --------------------------------------------------------------------------------------------

  launch() {
    if (this.phase !== 'seated') return;
    this.phase = 'launch';
    this.t = 0;
    this.vLocal.set(0, 0, 0);
    this.C.bus?.emit('launch', { pad: this.index });
  }

  /** Whether flight control will take you in now: out, within range of the bay and slow enough relative to her. */
  canLand(carrierVel) {
    if (this.phase !== 'flying') return false;
    const d = this.obj.position.distanceTo(this.gateWorld(_v));
    return d < this.S.landing.range && _w.copy(this.body.vel).sub(carrierVel).length() < this.S.landing.speed;
  }

  /** The point off the bay door that landings come in through, in the world. */
  gateWorld(t = new THREE.Vector3()) {
    const [x, y] = this.S.landing.gate;
    const z = this.home?.pos.z ?? 0;
    return this.C.frame.localToWorld(t.set((this.out ?? -1) * Math.abs(x), y, z));
  }

  /** The hull's half-width and half-height (from the ship's axis) anywhere between z0 and z1, from the layout's lofts:
   *  what a path round her has to clear. Also where she ends, bow and stern. */
  hullSpan(z0, z1) {
    const H = this.C.L.hull;
    let w = 0, h = 0;
    for (const list of [H.main, H.island ?? []]) {
      for (let i = 0; i < list.length; i++) {
        const a = list[i], b = list[i + 1] ?? a;
        if (Math.max(a.z, b.z) < z0 || Math.min(a.z, b.z) > z1) continue;
        for (const s of [a, b]) (w = Math.max(w, s.w / 2)), (h = Math.max(h, Math.abs(s.y ?? 0) + s.h / 2));
      }
    }
    return { w, h, bow: H.main[0].z, stern: H.main.at(-1).z };
  }

  /** Her nose into the hangar, coming in from her side. */
  inbound() {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (this.out ?? -1) * (Math.PI / 2), 0));
  }

  /** Hands her to flight control: back into the carrier's frame and along a path that goes round the hull. */
  land() {
    if (this.phase !== 'flying') return;
    const w = this.obj;
    this.C.obj.updateMatrixWorld(true);
    this.deck.group.attach(w); // keeps where she is; her position is now in the carrier's frame
    const p0 = w.position.clone();
    const pad = this.home.pos;
    const hover = pad.y + this.S.launch.lift;
    const pts = [p0];
    const o = this.out, [gx, gy] = this.S.landing.gate, G = Math.abs(gx);
    // Not yet out on her side, clear of the hull: first get clear of it (out past the bow or stern, or over or under
    // her, as high as the hull is anywhere between here and the pad), then cross to her side.
    const S = this.hullSpan(Math.min(p0.z, pad.z) - 30, Math.max(p0.z, pad.z) + 30);
    if (p0.x * o < S.w + 8) {
      const wide = o * (S.w + 40);
      if (p0.z < S.bow - 15 || p0.z > S.stern + 15) pts.push(new THREE.Vector3(wide, p0.y, p0.z));
      else {
        const yS = p0.y > gy ? Math.max(p0.y, S.h + 16) : Math.min(p0.y, -S.h - 16);
        pts.push(new THREE.Vector3(p0.x, yS, p0.z), new THREE.Vector3(wide, yS, clamp(p0.z, pad.z - 60, pad.z + 60)));
      }
    }
    pts.push(new THREE.Vector3(o * (G + 30), gy, pad.z), new THREE.Vector3(o * G, gy, pad.z), new THREE.Vector3(pad.x + o * 8, hover, pad.z), new THREE.Vector3(pad.x, hover, pad.z));
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.pathT = clamp(this.path.getLength() / 22, 7, 32);
    this.q0 = w.quaternion.clone();
    this.qIn = this.inbound(); // nose into the hangar
    this.ease = 'both';
    this.lastLanding = { manual: false };
    this.phase = 'landing';
    this.t = 0;
    this.body.vel.set(0, 0, 0);
    this.body.ang.set(0, 0, 0);
  }

  /** Flight control catches her at the end of the approach lane (approach.mjs) when you have flown her in yourself:
   *  she carries on in at the speed she came, slowing to a hover over her pad. `lane` is the lane's state, kept as the
   *  landing's grade (`lastLanding`). */
  capture(lane) {
    if (this.phase !== 'flying') return;
    const w = this.obj;
    this.C.obj.updateMatrixWorld(true);
    this.deck.group.attach(w);
    const p0 = w.position.clone();
    const pad = this.home.pos;
    const hover = pad.y + this.S.launch.lift;
    const o = this.out, [gx, gy] = this.S.landing.gate, G = Math.abs(gx);
    const pts = [p0];
    if (p0.x * o > G + 3) pts.push(new THREE.Vector3(o * G, gy, pad.z));
    pts.push(new THREE.Vector3(pad.x + o * 8, hover, pad.z), new THREE.Vector3(pad.x, hover, pad.z));
    this.path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // Eased out only: she enters the path at the speed she had (2·length/time at the start of 1 − (1 − k)²).
    this.pathT = clamp((2 * this.path.getLength()) / Math.max(3, lane.closing), 3, 14);
    this.ease = 'out';
    this.q0 = w.quaternion.clone();
    this.qIn = this.inbound();
    this.lastLanding = { manual: true, speed: lane.closing, off: Math.hypot(lane.side, lane.up) };
    this.phase = 'landing';
    this.t = 0;
    this.body.vel.set(0, 0, 0);
    this.body.ang.set(0, 0, 0);
  }

  /** Out of the bay: from now on she is a body in the world with the velocity she really has. */
  handOver(carrier) {
    const C = this.C, w = this.obj;
    C.obj.updateMatrixWorld(true);
    const cq = C.obj.getWorldQuaternion(new THREE.Quaternion());
    const spin = carrier.ang.clone().applyQuaternion(cq); // the carrier's turn, in the world
    const r = w.getWorldPosition(new THREE.Vector3()).sub(C.obj.getWorldPosition(_v));
    const vel = carrier.vel.clone().add(spin.clone().cross(r)).add(this.vLocal.clone().applyQuaternion(cq));
    this.scene.attach(w);
    this.body.vel.copy(vel);
    this.gearWant = 0;
    this.body.ang.copy(spin.applyQuaternion(_q.copy(w.quaternion).invert())); // she was turning with the carrier
    this.flight.aim.copy(w.quaternion); // the hold takes over where her nose is
    this.flight.popLock.fill(0);
    this.stick.x = this.stick.y = 0;
    this.phase = 'flying';
  }

  // --- the frame -------------------------------------------------------------------------------------------------------

  /** `f` the input frame, `hands` whether you are at her controls, `env` { carrier (its Rigid), bayOpen }. */
  frame(f, dt, hands, env) {
    this.time += dt;
    if (!this.obj) return;
    const w = this.obj;
    this.canopy += clamp(this.canopyWant - this.canopy, -dt / 1.2, dt / 1.2);
    openCanopy(w, this.canopy);
    this.wings += clamp(this.wingsWant - this.wings, -dt / 1.6, dt / 1.6);
    foldWings(w, this.wings);
    // The gear comes up once she is out and down again on the way in; the strobe blinks while she is off the pad.
    this.gear += clamp(this.gearWant - this.gear, -dt / 1.4, dt / 1.4);
    setGear(w, this.gear);
    if (w.userData.strobe) w.userData.strobe.visible = this.phase !== 'seated' && this.time % 1.2 < 0.08;
    const fl = this.flight;

    if (this.phase === 'seated') {
      // The drive spins up (the power-up's sound runs for the same time); after a landing the tanks are topped up.
      this.powerT += dt;
      if (this.powerT >= POWER_T) fl.online = true;
      if (this.refuelT > 0 && (this.refuelT -= dt) <= 0) fl.refill();
      fl.carried(dt);
      if (hands && env.bayOpen && fl.online && f.keys.has('KeyW')) this.launch();
    } else if (this.phase === 'launch') {
      this.t += dt;
      const L = this.S.launch, p0 = this.home.pos;
      const ahead = _w.set(0, 0, -1).applyQuaternion(this.home.quat); // her nose, in the carrier's frame
      if (this.t < LIFT_T) {
        const k = this.t / LIFT_T;
        w.position.set(p0.x, p0.y + L.lift * smooth(k), p0.z);
        fl.carried(dt, { hover: 0.35 });
      } else {
        // The run down the lane is the drive, lit at what the run needs. Held W carries the burn on out of the bay.
        const tt = this.t - LIFT_T;
        w.position.copy(p0).add(_v.set(0, L.lift, 0)).addScaledVector(ahead, 0.5 * L.accel * tt * tt);
        this.vLocal.copy(ahead).multiplyScalar(L.accel * tt);
        fl.carried(dt, { power: L.accel / fl.mainAcc });
      }
      const out = w.position.x * this.out; // how far out on her side
      if (out > (L.wings ?? Math.abs(L.clear) - 10)) this.wingsWant = 0; // spread them once she is through the door
      if (out > Math.abs(L.clear)) this.handOver(env.carrier);
    } else if (this.phase === 'flying') {
      // Blacked out, your hands are off the controls: the drive cuts, and she flies on as she was.
      fl.frame(hands && !this.gl.out ? this.controls(f, dt) : this.controls(IDLE, dt), dt);
    } else if (this.phase === 'landing') {
      this.t += dt;
      const k = Math.min(1, this.t / this.pathT);
      w.position.copy(this.path.getPointAt(this.ease === 'out' ? 1 - (1 - k) ** 2 : smooth(k)));
      w.quaternion.slerpQuaternions(this.q0, this.qIn, smooth(Math.min(1, this.t / (this.pathT * 0.35))));
      if (k > 0.7) this.wingsWant = 1;
      if (k > 0.5) this.gearWant = 1;
      fl.carried(dt, { hover: k > 0.6 ? 0.5 : 0 });
      if (k >= 1) {
        this.phase = 'turn';
        this.t = 0;
      }
    } else if (this.phase === 'turn') {
      this.t += dt;
      const k = Math.min(1, this.t / TURN_T);
      const pad = this.home.pos;
      w.rotation.set(0, this.out * (Math.PI / 2) - this.out * Math.PI * smooth(k), 0); // from nose-in round to nose-out
      w.position.set(pad.x, pad.y + this.S.launch.lift * (1 - smooth(Math.min(1, k * 1.3))), pad.z);
      fl.carried(dt, { hover: k < 0.75 ? 0.5 : 0 });
      if (k >= 1) {
        w.position.copy(pad);
        w.quaternion.copy(this.home.quat);
        this.phase = 'seated';
        // On the pad: the deck crew hook her up and top up both tanks.
        this.refuelT = REFUEL_T;
        this.audio?.refill();
        this.gl.refill();
        this.C.bus?.emit('landed', { pad: this.index, manual: !!this.lastLanding?.manual });
      }
    }
    this.gl.frame(dt, fl.acc, this.phase === 'flying');
    this.fx.frame(w, dt);
  }

  /** The input frame `f` as a control frame for her `Flight` (flight.mjs): the same controls an AI pilot would set. */
  controls(f, dt) {
    const c = this.ctl, k = f.keys;
    const key = (code) => (k.has(code) ? 1 : 0);
    const space = k.has('Space');
    if (space && !this.spaceWas) this.flight.toggleAssist();
    this.spaceWas = space;
    c.burn = k.has('KeyW');
    c.boost = k.has('ShiftLeft') || k.has('ShiftRight');
    c.retro = k.has('KeyS');
    c.slide[0] = key('KeyD') - key('KeyA');
    c.slide[1] = key('KeyR') - key('KeyF');
    c.turn[0] = key('ArrowUp') - key('ArrowDown');
    c.turn[1] = key('ArrowLeft') - key('ArrowRight');
    c.turn[2] = key('KeyZ') - key('KeyC');
    c.mouse.dx = f.dx || 0;
    c.mouse.dy = f.dy || 0;
    if (this.mouseMode === 'stick') {
      // A virtual stick: it stays where you leave it, and the aim keeps moving while it is held over.
      this.stick.x = clamp(this.stick.x + c.mouse.dx * 0.0025, -1, 1);
      this.stick.y = clamp(this.stick.y - c.mouse.dy * 0.0025, -1, 1);
      c.stick = this.stick;
    } else {
      const a = 1 - Math.exp(-dt / 0.07); // shown only: where the hand is
      this.stick.x += (clamp(c.mouse.dx / Math.max(dt, 1e-4) / 650, -1, 1) - this.stick.x) * a;
      this.stick.y += (clamp(-c.mouse.dy / Math.max(dt, 1e-4) / 650, -1, 1) - this.stick.y) * a;
      c.stick = null;
    }
    return c;
  }

  /** M: the mouse moves the aim directly, or is a virtual stick that holds where you leave it. */
  toggleMouse() {
    this.mouseMode = this.mouseMode === 'direct' ? 'stick' : 'direct';
    this.stick.x = this.stick.y = 0;
    return this.mouseMode;
  }

  /** T with `?debug=1`: both tanks full, anywhere. In the game, tanks are filled on the pad after a landing. */
  debugRefill() {
    if (!this.debug || !this.obj) return false;
    this.flight.refill();
    this.audio?.refill();
    return true;
  }

  // --- the view --------------------------------------------------------------------------------------------------------

  /** The cockpit (her nose and canopy hidden, as in the main game) or behind her. */
  placeCamera(cam, dt) {
    const w = this.obj;
    const inside = this.view === 'cockpit';
    if (this.inside !== inside) {
      this.inside = inside;
      w.traverse((m) => m.userData.cockpitHidden && (m.visible = !inside));
      this.chasePos.set(0, 0, 0);
    }
    w.updateWorldMatrix(true, false);
    const q = w.getWorldQuaternion(_q);
    if (inside) {
      cam.position.copy(w.localToWorld(_v.copy(w.userData.eye)));
      // The pilot's eyes rest a little below her nose line, as a real cockpit is designed, so the screens are in view;
      // the HUD marks the nose line itself.
      cam.quaternion.copy(q).multiply(_tilt);
      return;
    }
    const want = w.localToWorld(_v.set(0, 3.4, 17));
    if (this.chasePos.lengthSq() === 0) this.chasePos.copy(want);
    this.chasePos.lerp(want, Math.min(1, dt * 6));
    cam.position.copy(this.chasePos);
    cam.up.set(0, 1, 0).applyQuaternion(q);
    cam.lookAt(w.localToWorld(_v.set(0, 0, -30)));
  }
}
