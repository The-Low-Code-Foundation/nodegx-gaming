// The helm seat: flying the whole ship from her bridge, or from behind her (V). Her keys at the helm (the broadside
// on a click, the broadside railgun on Q, the radiators on G, the nav plot on N), and the camera: the helm's own eye
// pressed back into the seat as the drive lights, or an outside view lagging behind and above her, which the right
// mouse button turns round her (right button and wheel: nearer or further), and T keeps on the contact: from behind
// her on its line, so both are in view.

import * as THREE from 'three';
import { clamp } from '../../util.mjs';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The outside view of a small ship (under 100 m): `dist` her lengths off, `pitch` radians above her, `look` her
 *  lengths ahead of her centre it looks at. A big ship's are the carrier's, scaled to her length. */
const CHASE = { dist: 1.3, pitch: 0.3, look: 0.15, lag: 6 };

export class HelmSeat {
  constructor(G) {
    this.G = G;
    this.outlook = 'bridge'; // 'bridge' or 'chase'
    this.chasePos = new THREE.Vector3();
    this.orbit = { yaw: 0, pitch: null, zoom: 1, track: false }; // the outside view, as you have turned it
  }

  /** Stands you up from the helm, a step behind the seat. */
  leave() {
    const { L, setMode, walk } = this.G;
    setMode('walk');
    walk.goDeck(this.G.helmDeck ?? 1, L.helm.at[0], L.helm.at[1] + 1.4, 0);
  }

  key(code) {
    const { guns, plant, helmSight, pilot } = this.G;
    // The crew's pilot has her (pilot.mjs): the keys that fly her and talk to flight control are not yours.
    if (pilot?.hasHelm && (code === 'KeyL' || code === 'KeyK' || code === 'KeyH')) return helmSight.say(`${pilot.who} has the helm. J takes her back.`, 2.5);
    if (code === 'KeyE') this.leave();
    else if (code === 'KeyV') this.outlook = this.outlook === 'bridge' ? 'chase' : 'bridge';
    else if (code === 'KeyT' && this.outlook === 'chase') {
      this.orbit.track = !this.orbit.track;
      this.orbit.yaw = 0;
      this.orbit.pitch = null;
      helmSight.say(this.orbit.track ? 'View: from behind her, on the contact.' : 'View: behind her.', 2);
    }
    else if (code === 'KeyG') helmSight.say(plant.toggleRadiators());
    else if (code === 'KeyN') helmSight.toggleNav();
    else if (code === 'KeyL') this.G.berth?.key(); // carried in a berth, or out from one (berth.mjs)
    else if (code === 'KeyK') this.G.berth?.lane?.toggleDock(); // docking mode, out from a berth (recovery.mjs)
    else if (code === 'KeyH') this.G.berth?.lane?.toggleHold(); // and its hold on the berth's heading
    else if (code === 'KeyJ') pilot?.key(); // the crew's pilot flies a circuit, or gives her back (pilot.mjs)
    else if (code === 'KeyQ' && guns.railSides && !this.G.fading) {
      // The broadside railgun on the side facing the raider (weapons.mjs `railFire`).
      const why = guns.railFire();
      helmSight.say(why ? `Railgun: ${why}.` : 'RAILGUN: FIRE', why ? 2.5 : 1);
    }
  }

  /** A click at the helm: the railgun (the first carrier), or the broadside that bears (the spin-drum carrier, which
   *  has no spinal gun). With you at the helm, the CIC leaves the broadside to you. */
  fire(f) {
    const { L, guns, helmSight, mode } = this.G, here = mode() === 'helm';
    guns.helmFires = here;
    if (here && f.clicked && !this.G.fading) {
      const spinal = L.weapons.railgun && !guns.railSides;
      if (!spinal && !guns.broad) return; // a ship with neither a spinal gun nor a broadside: the click fires nothing
      const why = spinal ? guns.railFire() : guns.broadsideFire();
      if (why) helmSight.say(`${spinal ? 'Railgun' : 'Broadside'}: ${why}.`, 2.5);
    }
  }

  /** The camera and the HUD at the helm. `drive`: drive.mjs (the lurch as she lights). */
  frame(dt, drive, f) {
    const { L, C, camera, hud, helm, ship, plant } = this.G;
    const hurt = (ship.power ? '' : ' · emergency power') + (ship.driveFactor < 0.99 ? ` · main drive ${Math.round(ship.driveFactor * 100)}%` : '') + (plant.hot ? ' · HEAT: drive held back' : plant.prop <= 0 ? ' · no reaction mass' : '');
    hud.where(`At the helm · ${this.outlook === 'bridge' ? (L.helm.room ? 'view from the seat' : 'bridge view') : `outside view${this.orbit.track ? ' on the contact' : ''} (right-drag turns it, with the wheel: nearer; T: on the contact)`}${this.G.pilot?.hasHelm ? ` · ${this.G.pilot.who} has the helm` : ''}${this.G.berth?.status() ? ` · ${this.G.berth.status()}` : ''}${hurt}`);
    hud.use(null);
    hud.helm(helm);
    if (this.outlook === 'bridge') {
      camera.position.set(...L.helm.eye);
      camera.position.z += drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.05; // pressed back into the seat as she lights
      C.frame.localToWorld(camera.position);
      camera.quaternion.copy(C.obj.getWorldQuaternion(_q));
      if (drive.lurch > 0) camera.rotateX(drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.025);
    } else {
      // Behind and above her, a little lagging, looking past her toward where she points. For a big ship the distances
      // are the carrier's, 288 m long, scaled to her length; a small one is seen closer (`CHASE`). The right mouse
      // button turns the view round her, and with the wheel brings it nearer or further.
      const O = this.orbit, k = L.length / 288, big = L.length >= 100;
      const d0 = big ? Math.hypot(150, 620) * k : L.length * CHASE.dist, p0 = big ? Math.atan2(150, 620) : CHASE.pitch;
      if (f) {
        O.yaw -= (f.odx ?? 0) * 0.005;
        O.pitch = clamp((O.pitch ?? p0) + (f.ody ?? 0) * 0.005, -1.45, 1.45);
        O.zoom = clamp(O.zoom * 1.15 ** (f.owheel ?? 0), 0.3, 6);
      }
      const pitch = O.pitch ?? p0, dist = d0 * O.zoom;
      const R = this.G.guns?.raider, track = O.track && R && !R.gone && !R.dead;
      let want, look;
      if (track) {
        // From behind her on the line from the contact through her, turned as you have turned it: both in view.
        const up = _w.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
        const back = _v.copy(C.obj.position).sub(R.obj.position).normalize();
        back.applyAxisAngle(up, O.yaw);
        const side = new THREE.Vector3().crossVectors(back, up).normalize();
        back.applyAxisAngle(side, -pitch);
        want = back.multiplyScalar(dist).add(C.obj.position);
        look = _w.copy(R.obj.position).sub(C.obj.position).setLength(dist * 0.5).add(C.obj.position);
      } else {
        want = C.obj.localToWorld(_v.set(Math.sin(O.yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(O.yaw) * Math.cos(pitch) * dist));
        look = C.obj.localToWorld(_w.set(0, 0, big ? -180 * k : -L.length * CHASE.look));
      }
      if (this.chasePos.lengthSq() === 0) this.chasePos.copy(want);
      this.chasePos.lerp(want, Math.min(1, dt * (big ? 3 : CHASE.lag)));
      camera.position.copy(this.chasePos);
      camera.up.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
      camera.lookAt(look);
    }
  }

  /** At the frame's end: the chase view starts again from behind her next time. */
  after() {
    if (this.G.mode() !== 'helm' || this.outlook === 'bridge') this.chasePos.set(0, 0, 0);
  }
}
