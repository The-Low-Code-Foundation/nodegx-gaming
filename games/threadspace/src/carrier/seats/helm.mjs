// The helm seat: flying the whole ship from her bridge, or from behind her (V). Her keys at the helm (the broadside
// on a click, the broadside railgun on Q, the radiators on G, the nav plot on N), and the camera: the helm's own eye
// pressed back into the seat as the drive lights, or a chase view lagging behind and above her.

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class HelmSeat {
  constructor(G) {
    this.G = G;
    this.outlook = 'bridge'; // 'bridge' or 'chase'
    this.chasePos = new THREE.Vector3();
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
  frame(dt, drive) {
    const { L, C, camera, hud, helm, ship, plant } = this.G;
    const hurt = (ship.power ? '' : ' · emergency power') + (ship.driveFactor < 0.99 ? ` · main drive ${Math.round(ship.driveFactor * 100)}%` : '') + (plant.hot ? ' · HEAT: drive held back' : plant.prop <= 0 ? ' · no reaction mass' : '');
    hud.where(`At the helm · ${this.outlook === 'bridge' ? (L.helm.room ? 'view from the seat' : 'bridge view') : 'outside view'}${this.G.pilot?.hasHelm ? ` · ${this.G.pilot.who} has the helm` : ''}${this.G.berth?.status() ? ` · ${this.G.berth.status()}` : ''}${hurt}`);
    hud.use(null);
    hud.helm(helm);
    if (this.outlook === 'bridge') {
      camera.position.set(...L.helm.eye);
      camera.position.z += drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.05; // pressed back into the seat as she lights
      C.frame.localToWorld(camera.position);
      camera.quaternion.copy(C.obj.getWorldQuaternion(_q));
      if (drive.lurch > 0) camera.rotateX(drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.025);
    } else {
      // Behind and above her, a little lagging, looking past her toward where she points.
      // (The distances are the carrier's, 288 m long, scaled to the ship's length.)
      const k = L.length / 288;
      const want = C.obj.localToWorld(_v.set(0, 150 * k, 620 * k));
      if (this.chasePos.lengthSq() === 0) this.chasePos.copy(want);
      this.chasePos.lerp(want, Math.min(1, dt * 3));
      camera.position.copy(this.chasePos);
      camera.up.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
      camera.lookAt(C.obj.localToWorld(_v.set(0, 0, -180 * k)));
    }
  }

  /** At the frame's end: the chase view starts again from behind her next time. */
  after() {
    if (this.G.mode() !== 'helm' || this.outlook === 'bridge') this.chasePos.set(0, 0, 0);
  }
}
