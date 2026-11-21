// The carrier's weapons, her point defence, and the raider that attacks her.
//
// There are no shields, here or on the raider. What keeps a ship alive is what keeps a real warship alive: armour
// (integrity.mjs `armour`: a belt that stops some shells outright), point defence, and hitting the other ship first.
//
// A raid (integrity.mjs `attack`, which says `raid` on the bus) is a ship you can see and fight: a Rook corvette comes in from
// one side and makes firing passes down it, bow to stern and back, then breaks off. Everything it does is real in the
// same sense the damage is:
//
// - Its shells are projectiles. Each one flies from its turret on a lead worked out for the carrier's motion, and
//   wherever its path meets the hull (the layout's loft sections, `integrity.inHull`) it goes through the ship as any
//   other hit does (`integrity.arrive`: armour, holes, air, health, the jobs it starts, the call). A shell through a
//   spread radiator wrecks some of it instead (plant.mjs).
// - Its torpedoes are rockets: they burn at `torpedo.accel` toward a point in the carrier, steering by proportional
//   navigation, and weave in their last stretch. One that reaches the hull goes off deep inside her.
// - The carrier's point defence cannons (the layout's `pdc` mounts) are the answer to torpedoes: rotary guns the
//   fire-control computer slews onto the nearest torpedo, leading it for its acceleration, and hoses with tracers. A
//   tracer that passes close enough kills it. With nothing inbound they take the raider when it comes close. They run
//   on main power, from their magazines, and hold fire when the heat sinks are full.
// - Her own torpedo tubes, fired by the CIC at a raider in range, and the raider's own point defence against them.
// - Her two heavy turrets fire shells at the raider's hull (and at a torpedo, if you are quick). Each turret is the
//   gunhouse in hull.glb named for its mount, and its guns (`<id>-guns`): it trains and elevates at its own slow
//   rate, from a ready rack the hoist fills from its magazine. A wrecked barbette slows and then jams the turret; a
//   wrecked magazine stops the hoist; on emergency power it turns at a crawl. The firing cutout stops a shot whose line
//   of fire crosses the ship's own hull.
// - Her railguns. The spin-drum carrier has two, one firing out of each hangar wall on the beam (`railgun.port` and
//   `.starboard`): fixed, so the helmsman aims one by turning her side onto the raider and fires it (Q), and with
//   nobody at the helm the CIC fires a side as the raider crosses its line (`railSide`, `railFrame`). The first carrier
//   had one along her keel, fired with a click, aimed by pointing the whole ship (`railAim()` is that sight).
// - Every gun kicks (`recoil`): a shot's momentum, the other way, goes into the ship's body at the gun, so a broadside
//   railgun shoves her sideways and flight assist fires her thrusters to take it out; aboard you feel it.
//
// You can man either turret from its hatch (`turrets[].from`). Your sight moves as fast as the mouse; the guns follow
// at the turret's rate, and the circle on the sight is where they actually point. The diamond is where to aim to hit
// the raider, given how it is moving. The turret you are not in is fired by its crew, less well (`crewSpread`).
//
// A gunnery drill (`drill`) puts a towed target sled in the raider's place: same passes, flown straight and steady,
// nothing fired either way but your own shells, and each hit counted.
//
// The fighter you fly has a twin cannon (`fly`, `cannonFrame`): its rounds are shells like any other, and `foe()` is what
// her head-up display shows of the contact she has selected (X picks the next; cockpit.mjs draws it, and `foeMarks()`
// the rest). The raider's turrets fire back at her (`flakShot`): her hull is `fhull`, and at nothing she is dead in
// space and flight control brings her in.
//
// Heat-seekers and flares (weapons/missiles.mjs): your fighter's missiles (Q) and flares (G), the bandits' missiles
// at her, and every ship's flares against them.
//
// The raider brings escorts (weapons/bandits.mjs): enemy fighters flown on the same `Flight` as yours by an AI pilot,
// which strafe her point defence guns and go for your fighter. `foes()` is every live enemy craft; `foeHit()` hits one.
//
// The layout's `weapons` entry has every number. In the console: `__carrier.guns.raid('port')`, `.raider`, `.torps`,
// `.pdcs`, `.turrets`.

import { THREE, metal, at, box, glow, clamp, mulberry, hazardMat, ROUND_MAX, pdcMesh, flakMesh } from './weapons/shared.mjs';
import { raidParts } from './weapons/raid.mjs';
import { projectileParts } from './weapons/projectiles.mjs';
import { torpedoParts } from './weapons/torpedoes.mjs';
import { broadsideParts } from './weapons/broadside.mjs';
import { pdcParts } from './weapons/pdc.mjs';
import { railgunParts } from './weapons/railgun.mjs';
import { turretParts } from './weapons/turrets.mjs';
import { fighterGunParts } from './weapons/fighter-guns.mjs';
import { banditParts } from './weapons/bandits.mjs';
import { missileParts } from './weapons/missiles.mjs';
import { tracerParts, Streaks, STREAK_GEO, streakMaterial } from './weapons/tracers.mjs';

export class Weapons {
  /** `ship` the integrity (holes, health, `inHull`), `body` the carrier's rigid body (her world velocity), `hooks.man(t)`
   *  what the hatch does (main.mjs fades and sits you in turret `t`). A raid is sent when the integrity says `raid`;
   *  a fighter shot dead in space says `fighter-down` (main.mjs hands her to flight control). */
  constructor(C, scene, { ship, body, sfx, dc, hooks = {}, seed = Date.now() } = {}) {
    this.C = C;
    this.L = C.L;
    this.W = C.L.weapons;
    this.scene = scene;
    this.ship = ship;
    this.body = body;
    this.sfx = sfx;
    this.dc = dc;
    this.hooks = hooks;
    C.bus?.on('raid', ({ from, escorts }) => this.raid(from, undefined, escorts)); // action stations for a raider (integrity.mjs `attack`)
    this.rand = mulberry((seed % 2147483647) + 7);
    this.time = 0;
    this.shells = [];
    this.fx = [];
    this.raider = null;
    this.bandits = []; // the raider's escort fighters (weapons/bandits.mjs)
    this.missiles = []; // heat-seekers in flight, either side's (weapons/missiles.mjs)
    this.flares = []; // flares burning, anyone's
    this.log = []; // torpedoes shot down: { t, kill (whose), by }
    this.manned = null;
    this.zoom = 0;
    this.inv = new THREE.Matrix4();
    this.com = new THREE.Vector3(...this.L.com);
    this.plant = null; // plant.mjs: the heat the guns make goes into its sinks; full sinks hold the PDCs and the railgun
    // The point defence: a gun on each `pdc` mount, fixed to the compartment nearest it (its health is the gun's).
    this.pdcs = this.L.mounts.filter((m) => m.kind === 'pdc').map((m) => this.makePdc(m));
    // Their tracers, and the raider's: one pool, drawn as one instanced mesh.
    this.pdRounds = []; // point defence rounds in flight (`this.rounds` is the fighter's ammunition)
    // Each a tracer streak turned to the camera (weapons/tracers.mjs), tinted by kind.
    this.roundMesh = new THREE.InstancedMesh(STREAK_GEO, streakMaterial(), ROUND_MAX);
    this.roundMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ROUND_MAX * 3), 3);
    this.roundMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.roundMesh.frustumCulled = false;
    this.roundMesh.count = 0;
    this.roundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.roundMesh);
    // Every other streak: the shells and the sparks (weapons/tracers.mjs).
    this.streaks = new Streaks(scene);
    this.sparks = [];
    // Torpedoes in flight, either side's; the carrier's own tubes.
    this.torps = [];
    this.brace = null; // { eta }: a torpedo is seconds out (braceFrame, weapons/torpedoes.mjs)
    this.tubeStock = this.W.tubes?.stock ?? 0;
    this.tubeT = 6;
    // The railgun: its capacitors (0 to 1) and its slugs; one of each per gun where there is one a side.
    const RG = this.W.railgun;
    this.railSides = RG?.port ? ['port', 'starboard'] : null;
    this.rail = this.railSides
      ? Object.fromEntries(this.railSides.map((k) => [k, { k, charge: 1, stock: RG[k].stock ?? RG.stock, flash: 0 }]))
      : { charge: 1, stock: RG?.stock ?? 0, flash: 0 };
    // The broadside (the spin-drum carrier): the hangar walls' tubes, each side its own stock and reload (`broadside`).
    const B = this.W.broadside;
    this.broad = B ? Object.fromEntries(['port', 'starboard'].map((k) => [k, { side: k, stock: B[k].stock ?? B.stock, t: 0, next: 0 }])) : null;
    this.helmFires = false; // main.mjs: with you at the helm, the CIC leaves the broadside to you
    this.turrets = this.W.turrets.map((spec) => this.makeTurret(spec)).filter(Boolean);
    this.hatches();
    this.canvas = document.getElementById('c-ghud');
    this.ctx = this.canvas?.getContext('2d');
  }

  // --- building ------------------------------------------------------------------------------------------------------

  makeTurret(spec) {
    const m = this.L.mounts.find((x) => x.id === spec.mount);
    if (!m) return null;
    // hull.glb's gunhouse if it loaded, the code-built one if not (?hull=code).
    const find = (name) => {
      let hit = null;
      for (const root of [this.C.blender, this.C.outside]) {
        if (!root) continue;
        root.traverse((o) => {
          if (!hit && o.name === name) hit = o;
        });
        if (hit) break;
      }
      return hit;
    };
    const house = find(m.id), guns = find(`${m.id}-guns`);
    if (!house || !guns) return null;
    if (guns.parent !== house) house.attach(guns); // the guns train with the gunhouse
    const s = Math.sign(m.up[1]) || 1;
    const G = this.W.gun;
    return {
      spec, m, house, guns, s, name: spec.name,
      home: guns.position.clone(),
      train: 0, elev: 0, wantTrain: 0, wantElev: 0,
      cool: [0, 0], barrel: 0, recoil: 0,
      ready: G.rack, stock: G.stock, hoistT: 0,
      phase: this.rand() * 10, fouled: false, rate: 1, hoist: 'running', bears: false
    };
  }

  /** The hatch you man each turret from: a hazard-striped frame where the trunk comes up, and E. */
  hatches() {
    for (const t of this.turrets) {
      const f = t.spec.from, I = this.C.decks.get(f.deck);
      if (!I) continue;
      const room = this.L.compartments.find((c) => c.access === 'walk' && c.deck === f.deck && f.at[0] >= c.x[0] && f.at[0] <= c.x[1] && f.at[1] >= c.z[0] && f.at[1] <= c.z[1]);
      const [x, z] = f.at;
      if (t.s < 0) {
        // A hatch in the floor, the trunk going down to the turret.
        I.group.add(at(box(1.6, 0.05, 1.6, hazardMat()), x, I.floorY + 0.03, z));
        I.group.add(at(box(1.1, 0.06, 1.1, metal('#4a525c')), x, I.floorY + 0.05, z));
      } else if (room) {
        // A hatch in the wall it stands at: the trunk going up beside the barbette.
        const wall = [[Math.abs(x - room.x[0]), 'w'], [Math.abs(x - room.x[1]), 'e'], [Math.abs(z - room.z[0]), 'n'], [Math.abs(z - room.z[1]), 's']].sort((a, b) => a[0] - b[0])[0][1];
        const wx = wall === 'w' ? room.x[0] + 0.12 : wall === 'e' ? room.x[1] - 0.12 : x;
        const wz = wall === 'n' ? room.z[0] + 0.12 : wall === 's' ? room.z[1] - 0.12 : z;
        const along = wall === 'n' || wall === 's';
        I.group.add(at(box(along ? 1.5 : 0.08, 2.2, along ? 0.08 : 1.5, hazardMat()), wx, I.floorY + 1.1, wz));
        I.group.add(at(box(along ? 1.1 : 0.1, 1.9, along ? 0.1 : 1.1, metal('#4a525c')), wx, I.floorY + 1.0, wz));
        I.group.add(at(box(along ? 0.3 : 0.12, 0.12, along ? 0.12 : 0.3, glow('#ff4a3a')), wx, I.floorY + 2.3, wz));
      }
      I.use(`man-${t.m.id}`, f.label ?? `Man the ${t.name.toLowerCase()}`, x, z, () => this.hooks.man?.(t), { r: 2.2 });
    }
  }

  /** A point defence gun on mount `m`: a close-in gun, or a flak gun when the mount says `gun: 'flak'` (its numbers
   *  are then the layout's `weapons.flak`); its gun (built in code, so it turns in either hull), the compartment it is
   *  fixed to, and its magazine. */
  makePdc(m) {
    const flak = m.gun === 'flak' && this.W.flak;
    const mesh = flak ? flakMesh(m) : pdcMesh(m);
    if (m.scale) mesh.g.scale.setScalar(m.scale); // a smaller ship's mount (the layout's `scale`): the same gun, drawn smaller
    this.C.frame.add(mesh.g);
    const at0 = new THREE.Vector3(...m.at);
    let node = null, bd = Infinity;
    for (const n of this.ship.nodes.values()) {
      if (!n.b) continue; // a drum room (integrity.mjs `buildDrum`): nothing is fixed to a spinning drum
      const q = new THREE.Vector3(clamp(at0.x, n.b.x[0], n.b.x[1]), clamp(at0.y, n.b.y[0], n.b.y[1]), clamp(at0.z, n.b.z[0], n.b.z[1]));
      const d = q.distanceTo(at0);
      if (d < bd) (bd = d), (node = n);
    }
    const up = new THREE.Vector3(...m.up);
    return {
      m, ...mesh, node, up, id: m.id, type: flak ? 'flak' : 'close',
      name: flak ? m.id.replace(/^flak-h-/, '').replace('d', 'dorsal ').replace('v', 'ventral ') : m.id.replace(/^pdc-/, '').replace(/-/g, ' '),
      pivot: at0.clone().addScaledVector(up, (flak ? 3.3 : 3.5) * (m.scale ?? 1)), // ship frame: where its rounds come from
      inv: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)), // ship frame to the mount's own
      yawA: 0, elev: 0.3, stock: (flak || this.W.pdc).stock, coolT: 0, barrel: 0, runT: [9, 9], firing: false, target: null, spinV: 0,
      hp: 100 // the gun itself: a bandit's rounds shoot it up (weapons/bandits.mjs `strafeHit`); under 25 it is out of action
    };
  }

  // --- each frame ----------------------------------------------------------------------------------------------------

  /** After the carrier's matrices are up to date for the frame. `f` is the input frame (yours only in a turret). */
  frame(dt, f, mode, camera) {
    this.time += dt;
    this.mode = mode;
    this.ear = camera?.position;
    this.inv.copy(this.C.frame.matrixWorld).invert();
    if (mode === 'gun' && f.wheel) this.zoomStep(f.wheel > 0 ? -1 : 1);
    // What the layout's `weapons` has runs: a ship with no fighters (`this.fighter`, set by `fly`), no bandits
    // (`bandit`) or no heat-seekers (`missile`) skips their frames.
    const W = this.W, fi = !!this.fighter;
    this.raiderFrame(dt);
    if (W.bandit) this.banditsFrame(dt);
    this.tubesFrame(dt);
    this.broadsideFrame(dt);
    this.torpsFrame(dt);
    this.braceFrame(dt);
    this.pdcFrame(dt);
    this.turretsFrame(dt, f, mode);
    if (fi) this.cannonFrame(dt);
    if (fi && W.missile) this.railsFrame(dt);
    if (W.missile) this.missilesFrame(dt), this.flareAI(dt), this.flaresFrame(dt);
    if (W.railgun) this.railFrame(dt);
    this.shellsFrame(dt);
    this.roundsFrame(dt);
    this.fxFrame(dt);
    this.hud(mode, camera);
  }

}

// The rest of `Weapons` lives in weapons/, a file per kind of gun (design/ROADMAP.md, phase 2). Each is a set of
// methods mixed in here, so `this` is the one `Weapons` everywhere and the methods call each other as before.
Object.assign(Weapons.prototype, raidParts, projectileParts, torpedoParts, broadsideParts, pdcParts, railgunParts, turretParts, fighterGunParts, banditParts, missileParts, tracerParts);
