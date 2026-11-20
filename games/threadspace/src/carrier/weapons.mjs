// The carrier's weapons, her point defence, and the raider that attacks her.
//
// There are no shields, here or on the raider. What keeps a ship alive is what keeps a real warship alive: armour
// (integrity.mjs `armour`: a belt that stops some shells outright), point defence, and hitting the other ship first.
//
// A raid (integrity.mjs `attack`, through `hooks.raid`) is a ship you can see and fight: a Rook corvette comes in from
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
// her head-up display shows of the contact (cockpit.mjs draws it). The raider's turrets fire back at her (`flakShot`):
// her hull is `fhull`, and at nothing she is dead in space and flight control brings her in.
//
// The layout's `weapons` entry has every number. In the console: `__carrier.guns.raid('port')`, `.raider`, `.torps`,
// `.pdcs`, `.turrets`.

import * as THREE from 'three';
import { corvette, fighter as wren, setThrust, metal } from '../ships.mjs';
import { at, box, cyl, glow, clamp, mulberry } from '../util.mjs';
import { hazardMat } from '../decor.mjs';

const DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
// The railguns' and the recoil's own scratch vectors (nothing they call borrows them).
const _r1 = new THREE.Vector3(), _r2 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _k1 = new THREE.Vector3(), _k2 = new THREE.Vector3(), _kq = new THREE.Quaternion();

const SHELL_GEO = new THREE.BoxGeometry(1, 1, 1);
const SHELL_OURS = new THREE.MeshBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const SHELL_THEIRS = new THREE.MeshBasicMaterial({ color: '#ff7048', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const FLASH_GEO = new THREE.SphereGeometry(1, 12, 8);
const SLED = new THREE.MeshBasicMaterial({ color: '#ff7a1a', side: THREE.DoubleSide, toneMapped: false });
const CABLE = new THREE.MeshBasicMaterial({ color: '#8a9098', toneMapped: false });
const BEAM_GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);

/** The shell's direction in the ship's frame for a turret trained `train` and elevated `elev` (radians), standing on
 *  the side `s` (1 on top, -1 underneath): train 0 is toward the bow, elevation is away from the hull. */
function dirOf(train, elev, s, out = new THREE.Vector3()) {
  return out.set(-Math.sin(train) * Math.cos(elev), s * Math.sin(elev), -Math.cos(train) * Math.cos(elev));
}

/** The shortest signed angle from a to b. */
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Time for a shell at `speed` to meet a target `r` away moving at `v` (both relative to the gun), or null. */
function intercept(r, v, speed) {
  const a = v.dot(v) - speed * speed, b = 2 * r.dot(v), c = r.dot(r);
  if (Math.abs(a) < 1e-6) return c > 0 && b < 0 ? -c / b : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  return t > 0 ? t : null;
}

/** Where to point a gun at `speed` so its round meets a target `r` away (relative to the gun) moving at `v` and
 *  accelerating at `a` (both relative): a few rounds of guessing the flight time. Writes the aim direction into `out`
 *  and returns the flight time, or null when the round would never get there. */
function leadAccel(r, v, a, speed, out) {
  let t = r.length() / speed;
  for (let i = 0; i < 5; i++) {
    out.copy(r).addScaledVector(v, t).addScaledVector(a, 0.5 * t * t);
    t = out.length() / speed;
    if (t > 8) return null;
  }
  out.normalize();
  return t;
}

// The point defence's tracers: hundreds of them in the air at once, so one instanced mesh, not a mesh each.
const ROUND_MAX = 900;
const ROUND_OURS = new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const TORP_BODY = new THREE.MeshLambertMaterial({ color: '#5a6068' });
const TORP_NOSE = new THREE.MeshLambertMaterial({ color: '#c8c0a8' });
let FLARE = null;
/** A soft round glow, drawn once: a torpedo's drive seen from kilometres off. */
function flareTex() {
  if (FLARE) return FLARE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(200,220,255,0.8)');
  grad.addColorStop(0.5, 'rgba(120,150,255,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  FLARE = new THREE.CanvasTexture(c);
  return FLARE;
}

/** A torpedo: a slim body with a blunt warhead, and its drive, a hot blue-white star you can see from far off. -z is
 *  its nose. `ours` paints a pale band on it. */
function torpedoMesh(ours) {
  const g = new THREE.Group();
  g.add(at(cyl(0.45, 0.45, 5, TORP_BODY, 8), 0, 0, 0, Math.PI / 2));
  g.add(at(cyl(0.05, 0.45, 1.2, TORP_NOSE, 8), 0, 0, -3.1, -Math.PI / 2));
  if (ours) g.add(at(cyl(0.47, 0.47, 0.4, TORP_NOSE, 8), 0, 0, 0.6, Math.PI / 2));
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex(), color: ours ? '#cfe0ff' : '#ffd0c0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flare.position.z = 3.2;
  flare.scale.setScalar(9);
  g.add(flare);
  g.userData.flare = flare;
  return g;
}

/** A point defence cannon: a turntable on the sponson, a cradle that elevates, and six barrels round an axis that
 *  spin while it fires. Built in code for either hull. `yaw` turns about the mount's up, `gun` elevates; the gun's -z
 *  is the way it fires. */
function pdcMesh(m) {
  const dark = metal('#2c3138'), grey = metal('#6e7782', { metalness: 0.5 });
  const g = new THREE.Group();
  const yaw = new THREE.Group();
  yaw.position.y = 2.0;
  yaw.add(at(cyl(1.7, 1.9, 0.9, grey, 14), 0, 0.2, 0));
  yaw.add(at(box(2.4, 1.6, 0.5, grey), 0, 1.3, 1.0), at(box(2.4, 1.6, 0.5, grey), 0, 1.3, -1.0));
  const gun = new THREE.Group();
  gun.position.y = 1.5;
  gun.add(at(box(1.3, 1.2, 2.2, dark), 0, 0, 0.4));
  const spin = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.add(at(cyl(0.09, 0.09, 3.6, dark, 6), Math.cos(a) * 0.32, Math.sin(a) * 0.32, -2.1, Math.PI / 2));
  }
  spin.add(at(cyl(0.45, 0.45, 0.2, grey, 10), 0, 0, -3.6, Math.PI / 2));
  gun.add(spin);
  yaw.add(gun);
  g.add(yaw);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...m.up));
  g.position.set(...m.at);
  return { g, yaw, gun, spin };
}

/** The gunnery target: a sled of three crossed day-glo panels (a corner reflector, so the directors see it too),
 *  streamed `tow` metres astern of a yellow tug on a cable. The group's origin is the sled; -z is the way it goes. */
function sled(tow) {
  const g = new THREE.Group();
  g.add(box(16, 0.3, 16, SLED), box(0.3, 16, 16, SLED), box(16, 16, 0.3, SLED));
  g.add(at(cyl(0.25, 0.25, tow, CABLE, 5), 0, 0, -tow / 2, Math.PI / 2));
  const tug = wren({ paint: '#e0b020' });
  tug.scale.setScalar(1.6);
  tug.position.z = -tow;
  setThrust(tug, 1);
  g.add(tug);
  g.userData.tug = tug;
  return g;
}

export class Weapons {
  /** `ship` the integrity (holes, health, `inHull`), `body` the carrier's rigid body (her world velocity), `hooks.man(t)`
   *  what the hatch does (main.mjs fades and sits you in turret `t`), `hooks.crippled()` what happens to a fighter
   *  shot dead in space (main.mjs hands her to flight control). */
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
    this.rand = mulberry((seed % 2147483647) + 7);
    this.time = 0;
    this.shells = [];
    this.fx = [];
    this.raider = null;
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
    this.roundMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ROUND_OURS, ROUND_MAX);
    this.roundMesh.frustumCulled = false;
    this.roundMesh.count = 0;
    this.roundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.roundMesh);
    // Torpedoes in flight, either side's; the carrier's own tubes.
    this.torps = [];
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

  /** A point defence cannon on mount `m`: its gun (built in code, so it turns in either hull), the compartment it is
   *  fixed to, and its magazine. */
  makePdc(m) {
    const mesh = pdcMesh(m);
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
      m, ...mesh, node, up, id: m.id, name: m.id.replace(/^pdc-/, '').replace(/-/g, ' '),
      pivot: at0.clone().addScaledVector(up, 3.5), // ship frame: where its rounds come from
      inv: new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0)), // ship frame to the mount's own
      yawA: 0, elev: 0.3, stock: this.W.pdc.stock, coolT: 0, firing: false, target: null, spinV: 0
    };
  }

  // --- the raid ------------------------------------------------------------------------------------------------------

  /** The waypoints of `n` firing passes down the side `from`, `d` metres off, in the ship's frame: in from ahead, bow
   *  to stern and back, then away. */
  passes(from, d, n) {
    const sideways = from === 'port' || from === 'starboard';
    const sign = from === 'port' || from === 'below' ? -1 : 1;
    // A point `out` metres off her side, `z` along her, in the ship's frame.
    const pt = (out, z) => new THREE.Vector3(sideways ? sign * out : 0, sideways ? this.com.y : this.com.y + sign * out, z);
    const wps = [{ p: pt(d + 1800, -2600) }];
    for (let i = 0; i < n; i++) {
      const dz = i % 2 ? -1 : 1; // bow to stern, then back
      wps.push({ p: pt(d, -1000 * dz), fire: true }, { p: pt(d, 1000 * dz), fire: true });
      wps.push({ p: pt(d + 700, 1900 * dz) }, { p: pt(d + 1700, 1700 * dz) }, { p: pt(d + 1200, 1150 * dz) });
    }
    const last = n % 2 ? 1 : -1;
    wps.push({ p: pt(d + 7000, 5000 * last), leave: true });
    return wps;
  }

  /** Puts `obj` at the first waypoint, flying for the second. `K` is its entry in the layout's `weapons` (its speed,
   *  its size, what it carries); `more` is what makes it a raider or a target. */
  contact(obj, K, from, wps, more) {
    obj.traverse((o) => o.isMesh && (o.frustumCulled = false));
    const start = this.C.frame.localToWorld(wps[0].p.clone());
    obj.position.copy(start);
    this.scene.add(obj);
    const fwd = this.C.frame.localToWorld(wps[1].p.clone()).sub(start).normalize();
    this.raider = {
      obj, K, from, sinceHit: 99, rel: fwd.multiplyScalar(K.speed), wps, wi: 0, gunT: 2 + this.rand() * 2,
      jink: new THREE.Vector3(), jinkT: 0, weave: new THREE.Vector3(), v: fwd.clone(), gone: false, dead: false, smokeT: 0, ...more
    };
    return this.raider;
  }

  /** A raider comes in from `from` (port, starboard, above, below) for `passes` firing passes. */
  raid(from = 'port', passes = this.W.raider.passes) {
    if (this.raider && !this.raider.gone) {
      if (!this.raider.target) return this.raider;
      this.endRaid(); // a target still out is cut loose: the real thing has turned up
    }
    const R = this.W.raider;
    const d = R.standoff[0] + this.rand() * (R.standoff[1] - R.standoff[0]);
    const obj = corvette();
    setThrust(obj, 1);
    this.tubeT = this.W.tubes?.first ?? 6; // the CIC needs a firing solution before its first salvo
    for (const b of Object.values(this.broad ?? {})) b.t = Math.max(b.t, this.W.broadside.first ?? 20);
    return this.contact(obj, R, from, this.passes(from, d, passes), {
      label: 'RAIDER', centre: new THREE.Vector3(0, 1, -6), hull: R.hull,
      torpLeft: R.torpedo?.stock ?? 0, torpT: 3 + this.rand() * 3, pdcT: 0, pdcAim: null
    });
  }

  /** A gunnery drill: a tug streams a target sled down the side `from` on straight, steady passes (the layout's
   *  `weapons.target`). Nothing shoots back, the gun crews hold their fire, and every hit on the sled is counted
   *  (`raider.hits`, and `byYou` for your own). `dismiss()` sends the tug home early. */
  drill(from = 'starboard', passes = this.W.target.passes) {
    if (this.raider && !this.raider.gone) return this.raider;
    const T = this.W.target;
    const d = T.standoff[0] + this.rand() * (T.standoff[1] - T.standoff[0]);
    return this.contact(sled(T.tow), T, from, this.passes(from, d, passes), {
      target: true, label: 'TARGET', centre: new THREE.Vector3(), hull: Infinity, shield: 0, hits: 0, strobeT: 0
    });
  }

  /** The contact breaks off now (a target tug sent home once the shoot is done). */
  dismiss() {
    const R = this.raider;
    if (R && !R.gone && !R.dead) R.wi = R.wps.length - 1;
  }

  raiderFrame(dt) {
    const R = this.raider;
    if (!R || R.gone) return;
    const K = R.K;
    if (R.dead) return;
    // Steer for the next waypoint, which is in the carrier's frame (it moves and turns with her).
    const wp = R.wps[R.wi];
    const target = this.C.frame.localToWorld(_a.copy(wp.p));
    const to = _b.subVectors(target, R.obj.position);
    if (to.length() < 160 && R.wi < R.wps.length - 1) R.wi++;
    const want = _c.copy(to).normalize().multiplyScalar(K.speed * (wp.leave ? 1.6 : 1));
    const dv = _d.subVectors(want, R.rel);
    const step = K.accel * dt;
    if (dv.length() > step) dv.setLength(step);
    R.rel.add(dv);
    // Jinking: a sideways push that changes every second or two, so a long shot (seconds in flight) misses and a close
    // one does not.
    if ((R.jinkT -= dt) <= 0) {
      R.jinkT = 1.2 + this.rand() * 1.6;
      R.jink.set(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5);
      R.jink.addScaledVector(R.rel, -R.jink.dot(R.rel) / Math.max(1, R.rel.lengthSq())).setLength(K.jink ?? 0);
      if (R.weave.dot(R.jink) > 0 && this.rand() < 0.6) R.jink.negate(); // weave back and forth, not off in a line
    }
    R.weave.addScaledVector(R.jink, dt).multiplyScalar(1 - Math.min(1, dt * 0.4));
    if (R.weave.length() > 45) R.weave.setLength(45);
    R.v.copy(R.rel).add(R.weave); // its whole velocity past her: what a gun has to lead
    R.obj.position.addScaledVector(R.v, dt).addScaledVector(this.body.vel, dt);
    // Nose along its way past her, banking into the turn.
    _m.lookAt(_a.copy(R.obj.position), _b.copy(R.obj.position).add(R.rel), _c.copy(this.C.obj.up).applyQuaternion(this.C.obj.quaternion));
    _q.setFromRotationMatrix(_m);
    R.obj.quaternion.slerp(_q, Math.min(1, dt * 2.5));
    R.obj.updateMatrixWorld(true);
    R.sinceHit += dt;
    // Its turrets track the carrier.
    const centre = this.C.obj.position;
    for (const t of R.obj.userData.turrets ?? []) {
      t.yaw.worldToLocal(_a.copy(centre));
      t.yaw.rotation.y = Math.atan2(-_a.x, -_a.z) + t.yaw.rotation.y;
      t.pitch.rotation.x = clamp(Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -0.2, 0.8);
    }
    const dist = R.obj.position.distanceTo(centre);
    // Its torpedoes: a salvo every so often while the carrier is in their reach, until it has none left.
    const T = K.torpedo;
    if (T && !R.target && !wp.leave && R.torpLeft > 0 && (R.torpT -= dt) <= 0 && dist > T.range[0] && dist < T.range[1]) {
      R.torpT = T.every * (0.8 + 0.4 * this.rand());
      for (let i = 0; i < Math.min(T.salvo, R.torpLeft); i++) this.launchAtCarrier(R, i);
      R.torpLeft -= Math.min(T.salvo, R.torpLeft);
      if (!this.torpCalled || this.time - this.torpCalled > 12) {
        this.torpCalled = this.time;
        this.dc?.say('Torpedo launch. Torpedoes inbound. Point defence is tracking.', 'Torpedoes inbound: point defence tracking.', 0, 5);
      }
    }
    // Its own point defence against the carrier's torpedoes.
    if (K.pdc) this.raiderPdc(R, dt);
    // Its guns, on a pass.
    R.gunT -= dt;
    if (K.gun && wp.fire && dist < K.gun.range && R.gunT <= 0) {
      R.gunT = K.gun.every[0] + this.rand() * (K.gun.every[1] - K.gun.every[0]);
      this.raiderShot(R);
    }
    // Its turrets turn on a fighter that comes within reach: light, quick shots, led for how she is flying now.
    const fi = this.fighter;
    if (K.flak && fi?.flying && !this.crippled && !wp.leave && (R.flakT = (R.flakT ?? 1.5) - dt) <= 0 && fi.obj.position.distanceTo(R.obj.position) < K.flak.range) {
      R.flakT = K.flak.every[0] + this.rand() * (K.flak.every[1] - K.flak.every[0]);
      this.flakShot(R, fi);
    }
    if (wp.leave && dist > (K.clear ?? 5500)) R.target ? this.endRaid(null, 'The target tug is clear.') : this.endRaid('The raider is breaking off.', 'The raider is breaking off.');
    // A target's strobe, so you can find it against the stars.
    if (R.target && !R.gone && (R.strobeT -= dt) <= 0) {
      R.strobeT = 1.2;
      this.flash(R.obj.position, 7, '#ffffff', 0.12);
    }
    // Burning once its hull is badly hurt.
    if (!R.target && R.hull < K.hull * 0.5 && (R.smokeT -= dt) <= 0) {
      R.smokeT = 0.08;
      _a.set((this.rand() - 0.5) * 16, 4, (this.rand() - 0.2) * 40).applyMatrix4(R.obj.matrixWorld);
      this.flash(_a, 2 + this.rand() * 3, '#ff8a30', 0.5);
    }
  }

  /** One shell from the raider, aimed into a compartment chosen by size, led for how it and the carrier are moving. */
  raiderShot(R) {
    const K = R.K, r = this.rand;
    const n = this.ship.pick();
    const b = n.b;
    _a.set(b.x[0] + (b.x[1] - b.x[0]) * (0.2 + 0.6 * r()), b.y[0] + (b.y[1] - b.y[0]) * (0.2 + 0.6 * r()), b.z[0] + (b.z[1] - b.z[0]) * (0.2 + 0.6 * r()));
    const aim = this.C.frame.localToWorld(_a);
    const turrets = R.obj.userData.turrets ?? [];
    const t = turrets[Math.floor(r() * turrets.length)];
    const muzzle = t ? t.pitch.localToWorld(t.tip.clone()) : R.obj.position.clone();
    // The shell's speed past her is its own plus the raider's: lead so that sum points at the target.
    const u = _b.subVectors(aim, muzzle).normalize();
    const rel = R.v, s = K.gun.shell;
    const ur = u.dot(rel);
    const k = ur + Math.sqrt(Math.max(0, ur * ur - rel.lengthSq() + s * s));
    const dir = _c.copy(u).multiplyScalar(k).sub(rel).divideScalar(s);
    dir.x += (r() - 0.5) * 2 * K.gun.spread;
    dir.y += (r() - 0.5) * 2 * K.gun.spread;
    dir.z += (r() - 0.5) * 2 * K.gun.spread;
    dir.normalize();
    const vel = dir.multiplyScalar(s).add(R.v).add(this.body.vel);
    this.fire(muzzle, vel, false, K.gun.range / s + 1);
    this.flash(muzzle, 2.5, '#ff9a60', 0.15);
    this.sfx?.play('turbolaser', this.ear ? this.ear.distanceTo(muzzle) * 0.6 : 800);
  }

  /** One shot from the raider at the fighter: aimed where she will be if she flies on as she is, so a fighter that
   *  keeps changing her velocity is missed and one that flies straight is not. */
  flakShot(R, fi) {
    const K = R.K.flak, r = this.rand;
    const turrets = R.obj.userData.turrets ?? [];
    const t = turrets[Math.floor(r() * turrets.length)];
    const muzzle = t ? t.pitch.localToWorld(t.tip.clone()) : R.obj.position.clone();
    const own = _a.copy(R.v).add(this.body.vel); // the raider's velocity in the world: its shells keep it
    const to = _b.subVectors(fi.obj.position, muzzle);
    const tt = intercept(to, _c.copy(fi.body.vel).sub(own), K.shell);
    if (tt == null) return;
    const dir = to.addScaledVector(_c, tt).normalize();
    dir.x += (r() - 0.5) * 2 * K.spread;
    dir.y += (r() - 0.5) * 2 * K.spread;
    dir.z += (r() - 0.5) * 2 * K.spread;
    const s = this.fire(muzzle, dir.normalize().multiplyScalar(K.shell).add(own), false, K.range / K.shell + 1, K.damage[0] + r() * (K.damage[1] - K.damage[0]));
    s.flak = true;
    s.w = 0.5;
    this.flash(muzzle, 1.6, '#ff9a60', 0.1);
    this.sfx?.play('turbolaser', this.ear ? this.ear.distanceTo(muzzle) * 0.8 : 900);
  }

  /** The fighter is hit: her hull takes it (the layout's `weapons.fighter.hull`), she is thrown about, and at nothing
   *  she is dead in space: flight control takes her and brings her in (`hooks.crippled`). She is mended on her pad. */
  fighterHit(p, dmg) {
    this.fhull = Math.max(0, this.fhull - dmg);
    this.jolt = 1;
    this.flash(p, 3, '#ffb070', 0.3);
    this.flash(p, 1.5, '#ffffff', 0.1);
    this.sfx?.play('boom', 30, 12);
    if (this.fhull > 0 || this.crippled) return;
    this.crippled = true;
    this.dc?.say('Flight control. You are hit and dead in space. Hands off: we are bringing you in.', 'You are hit and dead in space: flight control is bringing you in.', 0, 8);
    this.hooks.crippled?.();
  }

  endRaid(call, text) {
    const R = this.raider;
    if (!R || R.gone) return;
    R.gone = true;
    if (!R.dead) R.obj.removeFromParent();
    this.ship.raidOver();
    if (call || text) this.dc?.say(call, text, 0, 6);
  }

  /** The raider is hit at `p` (world): its hull takes it, and at nothing it blows up. */
  raiderHit(p, dmg, you = false, small = false) {
    const R = this.raider, K = R.K;
    R.sinceHit = 0;
    if (R.target) {
      // The sled: a hit is a burst on it and a mark on the score. It is not there to be sunk.
      R.hits++;
      this.flash(p, 10, '#ffc070', 0.5);
      this.flash(p, 5, '#ffffff', 0.15);
      this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(p) * 0.5) : 600, 10);
      return;
    }
    R.hull -= dmg;
    if (small) this.flash(p, 1.6, '#ffd090', 0.08); // a point defence round: a spark on its armour
    else {
      this.flash(p, 9, '#ffc070', 0.45);
      this.flash(p, 5, '#ffffff', 0.12);
    }
    if (R.hull > 0) return;
    // Destroyed: a fireball, and the wreck in pieces.
    R.dead = true;
    R.killedByYou = you;
    const c = R.obj.position.clone();
    this.flash(c, 70, '#ffb050', 1.6);
    this.flash(c, 35, '#ffffff', 0.4);
    for (let i = 0; i < 6; i++) this.flash(_a.copy(c).add(new THREE.Vector3((this.rand() - 0.5) * 30, (this.rand() - 0.5) * 16, (this.rand() - 0.5) * 70)), 20 + this.rand() * 20, '#ff7a30', 0.9 + this.rand());
    const wreck = metal('#5a3634', { rough: 0.7 });
    const vel = R.v.clone().add(this.body.vel);
    for (let i = 0; i < 7; i++) {
      const piece = box(4 + this.rand() * 10, 3 + this.rand() * 6, 6 + this.rand() * 18, wreck);
      piece.position.copy(c).add(new THREE.Vector3((this.rand() - 0.5) * 16, (this.rand() - 0.5) * 8, (this.rand() - 0.5) * 60));
      this.scene.add(piece);
      this.fx.push({ kind: 'debris', mesh: piece, t: 0, life: 25, vel: vel.clone().add(new THREE.Vector3((this.rand() - 0.5) * 70, (this.rand() - 0.5) * 70, (this.rand() - 0.5) * 70)), spin: new THREE.Vector3(this.rand() - 0.5, this.rand() - 0.5, this.rand() - 0.5).multiplyScalar(2) });
    }
    R.obj.removeFromParent();
    this.sfx?.play('boom', this.ear ? Math.min(900, this.ear.distanceTo(c) * 0.5) : 600, 60);
    this.endRaid('Splash one. The raider is destroyed. Well done, gunners.', 'Splash one: the raider is destroyed.');
  }

  // --- shells --------------------------------------------------------------------------------------------------------

  fire(p, vel, ours, life, dmg = 0) {
    const mesh = new THREE.Mesh(SHELL_GEO, ours ? SHELL_OURS : SHELL_THEIRS);
    mesh.frustumCulled = false;
    mesh.position.copy(p);
    this.scene.add(mesh);
    const s = { mesh, pos: p.clone(), vel: vel.clone(), life, ours, dmg, inside: false };
    this.shells.push(s);
    return s;
  }

  shellsFrame(dt) {
    const prev = new THREE.Vector3();
    const R = this.raider;
    const centre = this.C.obj.position;
    for (const s of this.shells) {
      prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      // Drawn as a streak along its way past the carrier (you are almost always moving with her).
      _a.subVectors(s.vel, this.body.vel);
      const sp = _a.length();
      s.mesh.position.copy(s.pos);
      s.mesh.quaternion.setFromUnitVectors(Z, _a.normalize());
      const len = Math.min(sp * (s.rail ? 0.012 : 0.03), s.rail ? 110 : 40), w = s.w ?? (s.ours ? 0.7 : 1.1);
      s.mesh.scale.set(w, w, len);
      if (s.ours) {
        if (R && !R.gone && !R.dead && this.hitsRaider(prev, s.pos, _b)) {
          if (s.you) R.byYou = (R.byYou ?? 0) + 1; // your own hits (the career counts them)
          this.raiderHit(_b, s.dmg, s.you);
          s.life = 0;
        } else if (s.cannon && s.pos.distanceTo(centre) < 240 && this.ship.inHull(_b.copy(s.pos).applyMatrix4(this.inv))) {
          // A fighter's round that finds the carrier: stopped by her plating, with a spark to show for it.
          this.flash(s.pos, 1.5, '#ffd090', 0.12);
          s.life = 0;
        } else {
          // A shell or a cannon round that passes close to one of the raider's torpedoes kills it.
          const t = this.torpHit(prev, s.pos, 'theirs', s.cannon ? this.W.fighter.radius ?? 3 : 4);
          if (t) (s.life = 0), this.killTorp(t, s.you ? 'you' : 'gun');
        }
      } else if (s.flak) {
        // A shot at the fighter: a hit if its path this frame passes within her hull's reach.
        const fi = this.fighter;
        if (fi?.flying) {
          const ab = _b.subVectors(s.pos, prev), ap = _c.subVectors(fi.obj.position, prev);
          const k = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
          // She moves too: test against where she was at that moment of the frame.
          ap.addScaledVector(fi.body.vel, -(1 - k) * dt).addScaledVector(ab, -k);
          if (ap.length() < (this.W.raider.flak?.radius ?? 4)) {
            this.fighterHit(_d.copy(prev).addScaledVector(ab, k), s.dmg);
            s.life = 0;
          }
        }
      } else if (prev.distanceTo(centre) < 280 || s.pos.distanceTo(centre) < 280) {
        if (this.hitsCarrier(s, prev, s.pos)) s.life = 0;
      }
    }
    for (const s of this.shells) if (s.life <= 0) s.mesh.removeFromParent();
    this.shells = this.shells.filter((s) => s.life > 0);
  }

  /** Does the segment a→b (world) pass through the raider's ellipsoid? Where, in `out`. */
  hitsRaider(a, b, out) {
    const R = this.raider, size = R.K.size, o = R.centre;
    const inv = _m.copy(R.obj.matrixWorld).invert();
    const A = _c.copy(a).applyMatrix4(inv), B = _d.copy(b).applyMatrix4(inv);
    for (const P of [A, B]) P.set((P.x - o.x) / size[0], (P.y - o.y) / size[1], (P.z - o.z) / size[2]);
    const ab = out.subVectors(B, A);
    const t = clamp(-A.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
    const q = ab.multiplyScalar(t).add(A);
    if (q.length() > 1) return false;
    q.set(q.x * size[0] + o.x, q.y * size[1] + o.y, q.z * size[2] + o.z);
    out.copy(q).applyMatrix4(R.obj.matrixWorld);
    return true;
  }

  /** A raider's shell between a and b (world): through a spread radiator (it wrecks some of it and goes on), and into
   *  the hull (integrity.mjs: the armour first). */
  hitsCarrier(s, a, b) {
    const A = _c.copy(a).applyMatrix4(this.inv), B = _d.copy(b).applyMatrix4(this.inv);
    const n = Math.max(1, Math.ceil(A.distanceTo(B) / 1.2));
    const q = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      q.lerpVectors(A, B, i / n);
      if (!s.radiator && this.plant) {
        const r = this.plant.radiatorAt(q);
        if (r) {
          s.radiator = true;
          this.plant.hitRadiator(r, s.torpedo ? 0.6 : 0.2);
          this.flash(this.C.frame.localToWorld(q.clone()), 4, '#ffb070', 0.3);
        }
      }
      // What it meets: the hull, or in the drum section's open tube the sleeve, a drum or the exposed structure.
      const met = this.ship.meets ? this.ship.meets(q) : this.ship.inHull(q) && { part: 'hull' };
      if (met) {
        if (s.torpedo) this.ship.arrive(q, _a.subVectors(B, A), { ...this.torpHarm(), part: met });
        else this.ship.arrive(q, _a.subVectors(B, A), { shell: true, part: met });
        return true;
      }
    }
    return false;
  }

  /** What a torpedo does when it reaches the hull: integrity.mjs's numbers from the layout's `torpedo`. */
  torpHarm() {
    const T = this.W.torpedo, r = this.rand;
    const pick = (x) => x[0] + r() * (x[1] - x[0]);
    return { pen: pick(T.pen), damage: pick(T.damage), hole: pick(T.hole), torpedo: true };
  }

  flash(p, size, color, life) {
    const m = new THREE.Mesh(FLASH_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.position.copy(p);
    m.frustumCulled = false;
    this.scene.add(m);
    this.fx.push({ kind: 'flash', mesh: m, t: 0, life, size });
  }

  fxFrame(dt) {
    for (const e of this.fx) {
      e.t += dt;
      const k = e.t / e.life;
      if (e.kind === 'flash') {
        e.mesh.scale.setScalar(e.size * (0.4 + 0.8 * Math.sqrt(k)));
        e.mesh.material.opacity = Math.max(0, 1 - k);
      } else if (e.kind === 'debris') {
        e.mesh.position.addScaledVector(e.vel, dt);
        e.mesh.rotation.x += e.spin.x * dt;
        e.mesh.rotation.y += e.spin.y * dt;
        e.mesh.rotation.z += e.spin.z * dt;
      }
      if (k >= 1) {
        e.mesh.removeFromParent();
        if (e.kind === 'flash') e.mesh.material.dispose();
      }
    }
    this.fx = this.fx.filter((e) => e.t < e.life);
  }

  // --- torpedoes -------------------------------------------------------------------------------------------------------

  /** A torpedo into the world at `p` with velocity `v`: `side` 'ours' (the carrier's, after the raider) or 'theirs'
   *  (the raider's, after a point in the carrier, `aim` in the ship's frame). */
  torpedo(p, v, side, aim = null) {
    const obj = torpedoMesh(side === 'ours');
    obj.traverse((o) => (o.frustumCulled = false));
    obj.position.copy(p);
    this.scene.add(obj);
    const t = { obj, pos: p.clone(), prev: p.clone(), vel: v.clone(), side, aim, t: 0, jink: new THREE.Vector3(), jinkT: 0, dead: false, acc: new THREE.Vector3() };
    this.torps.push(t);
    return t;
  }

  /** One of the raider's torpedoes, out of its tube with a push off to the side, after a compartment of the carrier's
   *  chosen by size (a big one is easier to hit). */
  launchAtCarrier(R, i) {
    const T = this.W.torpedo, r = this.rand;
    const n = this.ship.pick(), b = n.b;
    const aim = new THREE.Vector3(b.x[0] + (b.x[1] - b.x[0]) * (0.3 + 0.4 * r()), b.y[0] + (b.y[1] - b.y[0]) * (0.3 + 0.4 * r()), b.z[0] + (b.z[1] - b.z[0]) * (0.3 + 0.4 * r()));
    const side = _a.set(i % 2 ? 1 : -1, 0.3, 0).transformDirection(R.obj.matrixWorld);
    const p = R.obj.localToWorld(new THREE.Vector3(i % 2 ? 3 : -3, 0, 0));
    const v = _b.copy(R.v).add(this.body.vel).addScaledVector(side, T.push);
    this.torpedo(p, v, 'theirs', aim);
    this.sfx?.play('turbolaser', this.ear ? this.ear.distanceTo(p) * 0.5 : 900);
  }

  /** The carrier's tubes: the CIC fires a salvo at a raider in range, every so often, while the magazine holds. */
  tubesFrame(dt) {
    const U = this.W.tubes, R = this.raider;
    if (!U) return;
    this.tubeT -= dt;
    if (!R || R.gone || R.dead || R.target || !this.ship.power || this.tubeStock <= 0 || this.tubeT > 0) return;
    if ((this.ship.node(U.magazine)?.health ?? 100) < 20) return;
    const d = R.obj.position.distanceTo(this.C.obj.position);
    if (d < U.range[0] || d > U.range[1]) return;
    this.tubeT = U.every;
    const dir = _a.set(...U.dir).transformDirection(this.C.frame.matrixWorld);
    for (let i = 0; i < Math.min(U.salvo, this.tubeStock); i++) {
      const p = this.C.frame.localToWorld(new THREE.Vector3(...U.at[i % U.at.length]));
      this.torpedo(p, _b.copy(this.body.vel).addScaledVector(dir, this.W.torpedo.push), 'ours');
      this.flash(p, 4, '#d8e8ff', 0.3);
    }
    this.tubeStock -= Math.min(U.salvo, this.tubeStock);
    this.dc?.say('Tubes one and two, fire. Birds away.', 'The CIC fired a torpedo salvo at the raider.', 0, 4);
  }

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
  }

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
  }

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
    }
    b.next = (b.next + n) % S.at.length;
    b.stock -= n;
    b.t = B.reload;
    this.sfx?.cue('clunk', { vol: 0.6 });
    const side = s.k === 'port' ? 'Port' : 'Starboard';
    this.dc?.say(`${side} broadside, fire. ${n} away.`, `${by === 'helm' ? 'You fired' : 'The CIC fired'} the ${s.k} broadside: ${n} torpedoes, out cold.`, 0, 4);
    return null;
  }

  /** The broadside's reload, and the CIC firing the side that bears when nobody is at the helm to do it. */
  broadsideFrame(dt) {
    if (!this.broad) return;
    for (const b of Object.values(this.broad)) b.t = Math.max(0, b.t - dt);
    if (this.helmFires) return;
    for (const k of ['port', 'starboard']) {
      const s = this.broadsideSide(k);
      if (s?.bears && s.ready) return this.broadsideFire(k, 'cic');
    }
  }

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
  }

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
    this.dc?.say('Torpedo hit on the raider.', 'One of our torpedoes hit the raider.', 0, 4);
  }

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
  }

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

  // --- point defence -------------------------------------------------------------------------------------------------

  /** One tracer (a burst of rounds) from `p` at velocity `v`, world. `side` is whose it is. */
  round(p, v, side, life, dmg = 0) {
    if (this.pdRounds.length >= ROUND_MAX) return;
    this.pdRounds.push({ pos: p.clone(), prev: p.clone(), vel: v.clone(), side, life, dmg });
  }

  /** The carrier's point defence: each gun picks the nearest torpedo inbound (or, with none, the raider when it is
   *  close) inside its arc and reach, slews onto the lead, and fires while it is laid. */
  pdcFrame(dt) {
    const P = this.W.pdc;
    if (!P) return;
    const R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    const hot = this.plant?.hot;
    const cosArc = Math.cos(P.arc * DEG);
    const toShip = _q.copy(this.C.obj.quaternion).invert(); // world to the ship's frame (C.frame only shifts it)
    for (const g of this.pdcs) {
      const mag = this.ship.node(g.m.magazine)?.health ?? 100;
      const health = g.node ? g.node.health : 100;
      g.ok = health >= 25 && mag >= 15 && this.ship.power;
      g.why = !this.ship.power ? 'no power' : health < 25 ? 'wrecked' : mag < 15 ? 'magazine wrecked' : g.stock <= 0 ? 'empty' : hot ? 'heat' : '';
      g.firing = false;
      const pivot = this.C.frame.localToWorld(_a.copy(g.pivot));
      const up = _b.copy(g.up).applyQuaternion(this.C.obj.quaternion);
      // The nearest threat it can bear on.
      let best = null, bd = Infinity;
      if (g.ok) {
        for (const t of this.torps) {
          if (t.dead || t.side !== 'theirs') continue;
          const d = t.pos.distanceTo(pivot);
          if (d < P.range && d < bd && _c.subVectors(t.pos, pivot).normalize().dot(up) > cosArc) (best = t), (bd = d);
        }
        if (!best && raiderLive) {
          const d = R.obj.position.distanceTo(pivot);
          if (d < P.raiderRange && _c.subVectors(R.obj.position, pivot).normalize().dot(up) > cosArc) best = R;
        }
      }
      g.target = best;
      let want = null;
      if (best) {
        const isT = best !== R;
        const r = _c.subVectors(isT ? best.pos : R.obj.position, pivot);
        const v = _d.copy(isT ? best.vel : _e.copy(R.v).add(this.body.vel)).sub(this.body.vel); // its rounds keep her velocity
        const a = isT ? best.acc : _f.set(0, 0, 0);
        if (leadAccel(r, v, a, P.speed, _g) != null) want = _g.clone();
      }
      // Slew the gun toward the lead (or home), at its rate, in the mount's own frame.
      if (want) {
        const local = want.clone().applyQuaternion(toShip).applyQuaternion(g.inv);
        const yaw = Math.atan2(-local.x, -local.z), elev = Math.asin(clamp(local.y, -1, 1));
        const m = P.slew * DEG * dt;
        g.yawA += clamp(turn(g.yawA, yaw), -m, m);
        g.elev += clamp(elev - g.elev, -m, m);
        g.laid = Math.abs(turn(g.yawA, yaw)) < 0.03 && Math.abs(elev - g.elev) < 0.03;
      } else {
        const m = P.slew * DEG * dt * 0.3;
        g.elev += clamp(0.3 - g.elev, -m, m);
        g.laid = false;
      }
      g.yaw.rotation.y = g.yawA;
      g.gun.rotation.x = g.elev;
      g.spinV = Math.max(0, g.spinV - dt * 30);
      g.coolT = Math.max(g.coolT - dt, -1 / P.rate); // idle, it is ready to fire, not owed a backlog of rounds
      if (want && g.laid && g.ok && !hot && g.stock > 0) {
        g.firing = true;
        g.spinV = 60;
        while (g.coolT <= 0) {
          g.coolT += 1 / P.rate;
          g.stock--;
          const d = _c.copy(want);
          d.x += (this.rand() - 0.5) * 2 * P.spread;
          d.y += (this.rand() - 0.5) * 2 * P.spread;
          d.z += (this.rand() - 0.5) * 2 * P.spread;
          d.normalize();
          const muzzle = _d.copy(pivot).addScaledVector(d, 3.6);
          this.round(muzzle, _e.copy(d).multiplyScalar(P.speed).add(this.body.vel), 'ours', P.range / P.speed + 0.3, P.damage);
          this.plant?.addHeat(P.heat);
        }
        if ((g.soundT = (g.soundT ?? 0) - dt) <= 0) (g.soundT = 0.18), this.sfx?.play('hit', this.ear ? Math.min(900, this.ear.distanceTo(pivot) * 0.7) : 600);
      } else g.coolT = Math.max(g.coolT, 0);
      g.spin.rotation.z += g.spinV * dt;
    }
  }

  /** The raider's point defence: its turrets hose the carrier's torpedoes when they come within reach. */
  raiderPdc(R, dt) {
    const P = R.K.pdc;
    const guns = R.obj.userData.turrets ?? [];
    let best = null, bd = Infinity;
    for (const t of this.torps) {
      if (t.dead || t.side !== 'ours') continue;
      const d = t.pos.distanceTo(R.obj.position);
      if (d < P.range && d < bd) (best = t), (bd = d);
    }
    if (!best) return;
    R.pdcT -= dt;
    const own = _a.copy(R.v).add(this.body.vel);
    while (R.pdcT <= 0) {
      R.pdcT += 1 / P.rate;
      const gun = guns[Math.floor(this.rand() * guns.length)];
      const muzzle = gun ? gun.pitch.localToWorld(gun.tip.clone()) : R.obj.position.clone();
      const r = _b.subVectors(best.pos, muzzle), v = _c.subVectors(best.vel, own);
      if (leadAccel(r, v, best.acc, P.speed, _d) == null) continue;
      _d.x += (this.rand() - 0.5) * 2 * P.spread;
      _d.y += (this.rand() - 0.5) * 2 * P.spread;
      _d.z += (this.rand() - 0.5) * 2 * P.spread;
      this.round(muzzle, _e.copy(_d.normalize()).multiplyScalar(P.speed).add(own), 'theirs', P.range / P.speed + 0.3);
    }
  }

  /** Every tracer in the air: what it meets (a torpedo of the other side, or the raider), and drawing them all. */
  roundsFrame(dt) {
    const R = this.raider;
    const raiderLive = R && !R.gone && !R.dead && !R.target;
    const radius = this.W.pdc?.radius ?? 3;
    const M = this.roundMesh;
    let n = 0;
    for (const r of this.pdRounds) {
      r.prev.copy(r.pos);
      r.pos.addScaledVector(r.vel, dt);
      r.life -= dt;
      const t = this.torpHit(r.prev, r.pos, r.side === 'ours' ? 'theirs' : 'ours', radius);
      if (t) {
        this.killTorp(t, r.side === 'ours' ? 'pdc' : 'raider');
        r.life = 0;
      } else if (r.side === 'ours' && raiderLive && r.dmg && r.pos.distanceTo(R.obj.position) < 80 && this.hitsRaider(r.prev, r.pos, _b)) {
        this.raiderHit(_b, r.dmg, false, true);
        r.life = 0;
      }
      if (r.life <= 0) continue;
      // A streak along its way past the carrier.
      _a.subVectors(r.vel, this.body.vel);
      const len = Math.min(_a.length() * 0.025, 26);
      _q.setFromUnitVectors(Z, _a.normalize());
      _m.compose(r.pos, _q, _c.set(0.35, 0.35, len));
      M.setMatrixAt(n++, _m);
    }
    this.pdRounds = this.pdRounds.filter((r) => r.life > 0);
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
  }

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
  }

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
    this.dc?.say(`${side} railgun, fire.`, `${by === 'helm' ? 'You fired' : 'The CIC fired'} the ${s.k} railgun.`, 0, 3);
    return null;
  }

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
    this.flash(p, 14, '#cfe4ff', 0.35);
    this.flash(p, 6, '#ffffff', 0.1);
    this.plant?.addHeat(G.heat);
    this.sfx?.play('boom', 60, 50);
    if (G.slug) this.recoil(p, J);
    else this.ship.shake = Math.max(this.ship.shake, 0.6);
  }

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
  }

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

  // --- recoil --------------------------------------------------------------------------------------------------------

  /** A gun's kick: impulse `J` (world, N·s: the push on the ship, the other way from the shot) at world point `p`. It
   *  changes her velocity and, off her centre of mass, her turn; flight assist then fires her thrusters to take it out.
   *  Aboard you feel it, the harder the heavier the shot and the nearer the gun. */
  recoil(p, J) {
    const B = this.body, j = J.length();
    if (!B?.mass || !(j > 0)) return;
    B.vel.addScaledVector(J, 1 / B.mass);
    const local = this.C.frame.worldToLocal(_k1.copy(p));
    const d = this.ship.you ? local.distanceTo(this.ship.you) : 200;
    const tau = local.sub(this.com).cross(_k2.copy(J).applyQuaternion(this.C.frame.getWorldQuaternion(_kq).invert()));
    B.ang.x += tau.x / B.I.x;
    B.ang.y += tau.y / B.I.y;
    B.ang.z += tau.z / B.I.z;
    this.kicked = (this.kicked ?? 0) + j; // the console's tally (tests)
    this.ship.shake = Math.max(this.ship.shake, Math.min(1, j / 2.8e6) / (1 + d / 25) + j / 1.2e8);
  }

  // --- the turrets ---------------------------------------------------------------------------------------------------

  muzzle(t, i, out) {
    return t.guns.localToWorld(out.set(i ? 1.7 : -1.7, 0, -21.3));
  }

  /** Is this turret's line of fire, as it points now, clear of the ship's own hull? */
  clear(t) {
    const G = this.W.gun;
    const p = this.muzzle(t, 0, _a).applyMatrix4(this.inv);
    const d = dirOf(t.train, t.elev, t.s, _b);
    for (let s = 1; s < G.fouled; s += 3) if (this.ship.inHull(_c.copy(p).addScaledVector(d, s))) return false;
    return true;
  }

  turretsFrame(dt, f, mode) {
    const G = this.W.gun, R = this.raider;
    const target = R && !R.gone && !R.dead && !R.target ? R : null; // a target sled is the trainee's: the crews hold fire
    for (const t of this.turrets) {
      // What the damage does: the barbette's health (and the power) sets how fast it turns, the magazine's whether
      // the hoist runs.
      const bb = this.ship.node(t.spec.barbette)?.health ?? 100;
      const mag = this.ship.node(t.spec.magazine)?.health ?? 100;
      t.rate = clamp((bb - 15) / 45, 0, 1) * (this.ship.power ? 1 : 0.35);
      const hoistOk = bb >= 25 && mag >= 15;
      t.hoist = !hoistOk ? (mag < 15 ? 'stopped: magazine wrecked' : 'stopped: barbette wrecked') : t.stock <= 0 ? 'magazine empty' : t.ready >= G.rack ? 'rack full' : 'running';
      if (hoistOk && t.stock > 0 && t.ready < G.rack && (t.hoistT += dt) >= G.hoist) (t.hoistT = 0), t.ready++, t.stock--;
      const you = this.manned === t && mode === 'gun';
      if (you) {
        // The sight goes where the mouse sends it; the guns follow at their own rate.
        const gain = 0.0022 * (this.fov() / 70);
        t.wantTrain -= f.dx * gain * t.s;
        t.wantElev = clamp(t.wantElev - f.dy * gain, G.elevation[0] * DEG, G.elevation[1] * DEG);
        if (f.keys.has('ArrowLeft')) t.wantTrain += dt * 0.4 * t.s;
        if (f.keys.has('ArrowRight')) t.wantTrain -= dt * 0.4 * t.s;
        if (f.keys.has('ArrowUp')) t.wantElev = Math.min(G.elevation[1] * DEG, t.wantElev + dt * 0.3);
        if (f.keys.has('ArrowDown')) t.wantElev = Math.max(G.elevation[0] * DEG, t.wantElev - dt * 0.3);
        t.wantTrain = Math.atan2(Math.sin(t.wantTrain), Math.cos(t.wantTrain));
      } else if (target) this.crewLay(t, target);
      else t.layed = false;
      // Slew toward the order.
      const dT = turn(t.train, t.wantTrain), dE = t.wantElev - t.elev;
      const mT = G.train * DEG * t.rate * dt, mE = G.elevate * DEG * t.rate * dt;
      t.train += clamp(dT, -mT, mT);
      t.elev += clamp(dE, -mE, mE);
      t.slewing = Math.abs(dT) > mT + 0.002 || Math.abs(dE) > mE + 0.002; // could not catch the order this frame
      t.house.rotation.y = t.train;
      t.guns.rotation.x = t.s * t.elev;
      // Recoil: the guns run back and out again.
      t.recoil = Math.max(0, t.recoil - dt * 2.4);
      const back = _a.set(0, -t.s * Math.sin(t.elev), Math.cos(t.elev)).multiplyScalar(1.1 * Math.sin(Math.min(1, t.recoil) * Math.PI * 0.5));
      t.guns.position.copy(t.home).add(back);
      t.cool[0] -= dt;
      t.cool[1] -= dt;
      t.house.updateMatrixWorld(true);
      const wantsFire = you ? f.trigger : t.layed;
      if (you || wantsFire) t.fouled = !this.clear(t);
      if (wantsFire && !t.fouled && t.ready > 0 && t.cool[t.barrel] <= 0) this.shoot(t, you);
    }
  }

  /** The crew lays the guns on the raider: led for its motion, with the error of laying by hand. */
  crewLay(t, R) {
    const G = this.W.gun;
    const m = this.muzzle(t, 0, _a);
    const r = _b.subVectors(R.obj.position, m);
    const v = _c.copy(R.v); // the shell inherits the carrier's motion; the raider's past her is what counts
    const tt = intercept(r, v, G.shell);
    t.layed = false;
    t.bears = false;
    if (tt == null || r.length() > G.range) return;
    const aim = r.addScaledVector(v, tt).normalize().transformDirection(this.inv);
    const k = this.time * 0.6 + t.phase;
    const errT = G.crewSpread * (Math.sin(k) + 0.5 * Math.sin(k * 2.3)), errE = G.crewSpread * (Math.sin(k * 1.3 + 2) + 0.5 * Math.sin(k * 3.1));
    const train = Math.atan2(-aim.x, -aim.z) + errT;
    const elev = Math.asin(clamp(t.s * aim.y, -1, 1)) + errE;
    if (elev < G.elevation[0] * DEG || elev > G.elevation[1] * DEG) return;
    t.bears = true;
    t.wantTrain = train;
    t.wantElev = elev;
    t.layed = Math.abs(turn(t.train, train)) < 0.02 && Math.abs(t.elev - elev) < 0.02;
  }

  shoot(t, you) {
    const G = this.W.gun, r = this.rand;
    const i = t.barrel;
    const p = this.muzzle(t, i, new THREE.Vector3());
    const d = dirOf(t.train, t.elev, t.s, _b).transformDirection(this.C.frame.matrixWorld);
    d.x += (r() - 0.5) * 2 * G.spread;
    d.y += (r() - 0.5) * 2 * G.spread;
    d.z += (r() - 0.5) * 2 * G.spread;
    d.normalize();
    const dmg = G.damage[0] + r() * (G.damage[1] - G.damage[0]);
    const J = _r3.copy(d).multiplyScalar(-G.shell * (G.shellMass ?? 0)); // before `d` becomes the shell's velocity
    this.fire(p, d.multiplyScalar(G.shell).add(this.body.vel), true, G.range / G.shell, dmg).you = you;
    if (G.shellMass) this.recoil(p, J);
    this.flash(p, 3.5, '#ffd090', 0.12);
    t.cool[i] = you ? G.reload : G.crewReload;
    t.barrel = 1 - i;
    t.ready--;
    t.recoil = 1;
    if (you) this.kick = 1;
    this.sfx?.play('boom', you ? 40 : this.ear ? this.ear.distanceTo(p) : 400, you ? 22 : 14);
  }

  // --- the fighter's cannon ------------------------------------------------------------------------------------------

  /** The fighter you fly, and whether its trigger is held (main.mjs, each frame before `frame`). */
  fly(fighter, trigger) {
    this.fighter = fighter;
    this.fighterTrigger = trigger;
  }

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
    const s = this.fire(p, d.multiplyScalar(F.shell).add(fi.body.vel), true, F.range / F.shell, F.damage[0] + r() * (F.damage[1] - F.damage[0]));
    s.you = s.cannon = true;
    s.w = 0.22;
    this.flash(p, 0.7, '#ffd9a0', 0.05);
    this.sfx?.play('hit', 30); // felt through the airframe more than heard
  }

  /** What the fighter's sight shows of the contact: where it is, where to point her nose so her rounds meet it (null
   *  out of range), its name, range and state. Null with nothing out there. */
  foe(out = {}) {
    const R = this.raider, F = this.W.fighter, fi = this.fighter;
    if (!F || !fi?.obj || !R || R.gone || R.dead) return null;
    const me = fi.obj.getWorldPosition(_a);
    const r = _b.subVectors(R.obj.position, me);
    const v = _c.copy(R.v).add(this.body.vel).sub(fi.body.vel); // its velocity as she sees it
    const range = r.length();
    const tt = range < F.range * 1.5 ? intercept(r, v, F.shell) : null;
    out.point = R.obj.position;
    out.lead = tt != null && tt < F.range / F.shell ? (out.leadV ??= new THREE.Vector3()).copy(me).add(r).addScaledVector(v, tt) : null;
    out.label = R.label;
    out.range = range;
    out.closing = range > 1 ? -r.dot(v) / range : 0;
    out.shield = null; // nobody has shields
    out.hull = R.target ? null : Math.max(0, R.hull) / R.K.hull;
    out.hits = R.target ? R.hits : null;
    return out;
  }

  /** The point defence in a line: guns up, torpedoes inbound. */
  pdLine(red = '#ff5a4a') {
    const up = this.pdcs.filter((g) => g.ok && g.stock > 0).length;
    const inbound = this.torps.filter((t) => !t.dead && t.side === 'theirs').length;
    return [`point defence ${up}/${this.pdcs.length}${inbound ? `  ·  ${inbound} torpedo${inbound > 1 ? 'es' : ''} inbound` : ''}`, inbound || up < this.pdcs.length ? red : '#cfe8ff'];
  }

  // --- you in the turret ---------------------------------------------------------------------------------------------

  man(t) {
    this.manned = t;
    t.wantTrain = t.train;
    t.wantElev = t.elev;
    t.layed = false;
    this.zoom = 0;
  }

  leave() {
    const t = this.manned;
    this.manned = null;
    return t?.spec.from;
  }

  zoomStep(d = 1) {
    this.zoom = (this.zoom + d + 3) % 3;
  }

  fov() {
    return [62, 22, 9][this.zoom];
  }

  /** The gunner's sight: on the cab, looking where the sight is laid. */
  placeCamera(camera, dt) {
    const t = this.manned;
    if (!t) return;
    t.house.localToWorld(camera.position.set(3, t.s * 5.1, -3.4));
    const d = dirOf(t.wantTrain, t.wantElev, t.s, _a).transformDirection(this.C.frame.matrixWorld);
    const up = _b.set(0, t.s, 0).transformDirection(this.C.frame.matrixWorld);
    _m.lookAt(camera.position, _c.copy(camera.position).add(d), up);
    camera.quaternion.setFromRotationMatrix(_m);
    this.kick = Math.max(0, (this.kick ?? 0) - dt * 4);
    if (this.kick > 0.01) camera.rotateX(this.kick * 0.006 * (Math.random() + 0.5));
  }

  where() {
    const t = this.manned;
    if (!t) return '';
    const R = this.raider;
    const state = !R || R.gone ? 'no contacts' : R.dead ? 'target destroyed' : R.target ? `target sled · hits ${R.hits}` : 'raider in range';
    return `${t.name} · ${state}`;
  }

  // --- each frame ----------------------------------------------------------------------------------------------------

  /** After the carrier's matrices are up to date for the frame. `f` is the input frame (yours only in a turret). */
  frame(dt, f, mode, camera) {
    this.time += dt;
    this.mode = mode;
    this.ear = camera?.position;
    this.inv.copy(this.C.frame.matrixWorld).invert();
    if (mode === 'gun' && f.wheel) this.zoomStep(f.wheel > 0 ? -1 : 1);
    this.raiderFrame(dt);
    this.tubesFrame(dt);
    this.broadsideFrame(dt);
    this.torpsFrame(dt);
    this.pdcFrame(dt);
    this.turretsFrame(dt, f, mode);
    this.cannonFrame(dt);
    this.railFrame(dt);
    this.shellsFrame(dt);
    this.roundsFrame(dt);
    this.fxFrame(dt);
    this.hud(mode, camera);
  }

  // --- the sight's markings ------------------------------------------------------------------------------------------

  hud(mode, camera) {
    const cv = this.canvas, g = this.ctx;
    if (!cv || !g) return;
    const show = mode === 'gun' && this.manned;
    if (!show) {
      if (cv.dataset.on) (g.clearRect(0, 0, cv.width, cv.height), delete cv.dataset.on);
      return;
    }
    cv.dataset.on = '1';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) (cv.width = Math.round(w * dpr)), (cv.height = Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t = this.manned, G = this.W.gun, R = this.raider;
    const cx = w / 2, cy = h / 2;
    const green = '#7dffb0', amber = '#ffc24a', red = '#ff5a4a';
    const project = (p) => {
      const v = _d.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) return null;
      v.applyMatrix4(camera.projectionMatrix);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    g.lineWidth = 1.5;
    g.font = '12px ui-monospace, Menlo, monospace';
    // The sight: a cross with a gap, and range ticks.
    g.strokeStyle = 'rgba(180,255,210,0.85)';
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.moveTo(cx + dx * 10, cy + dy * 10), g.lineTo(cx + dx * 46, cy + dy * 46);
    for (let i = 1; i <= 3; i++) g.moveTo(cx - 5, cy + 10 + i * 9), g.lineTo(cx + 5, cy + 10 + i * 9);
    g.stroke();
    // Where the guns point: the circle, green when they are on the sight.
    const gp = project(this.muzzle(t, 0, _a).add(dirOf(t.train, t.elev, t.s, _b).transformDirection(this.C.frame.matrixWorld).multiplyScalar(3000)));
    const on = !t.slewing;
    if (gp) {
      g.strokeStyle = t.fouled ? red : on ? green : amber;
      g.beginPath();
      g.arc(gp.x, gp.y, 13, 0, Math.PI * 2);
      g.stroke();
    }
    // The raider: its bracket, range and bars, and the lead.
    if (R && !R.gone && !R.dead) {
      const K = R.K;
      const rp = project(R.obj.position);
      const range = R.obj.position.distanceTo(camera.position);
      if (rp) {
        g.strokeStyle = red;
        const b = 18;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(rp.x + sx * b, rp.y + sy * (b - 7)), g.lineTo(rp.x + sx * b, rp.y + sy * b), g.lineTo(rp.x + sx * (b - 7), rp.y + sy * b);
        g.stroke();
        g.fillStyle = red;
        g.fillText(`${R.label} ${range < 1000 ? Math.round(range) + ' m' : (range / 1000).toFixed(2) + ' km'}`, rp.x + b + 6, rp.y - 6);
        if (R.target) g.fillText(`HITS ${R.hits}`, rp.x + b + 6, rp.y + 10);
        else bar(g, rp.x + b + 6, rp.y + 4, 70, Math.max(0, R.hull) / K.hull, red, 'HULL');
      } else {
        // Off the sight: an arrow at the edge toward it.
        const v = _d.copy(R.obj.position).applyMatrix4(camera.matrixWorldInverse);
        const a = Math.atan2(-v.y, v.x);
        const ex = cx + Math.cos(a) * (Math.min(w, h) * 0.42), ey = cy + Math.sin(a) * (Math.min(w, h) * 0.42);
        g.fillStyle = red;
        g.beginPath();
        g.moveTo(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
        g.lineTo(ex + Math.cos(a + 2.5) * 10, ey + Math.sin(a + 2.5) * 10);
        g.lineTo(ex + Math.cos(a - 2.5) * 10, ey + Math.sin(a - 2.5) * 10);
        g.fill();
        g.fillText(`${R.label} ${(range / 1000).toFixed(2)} km`, ex - 40, ey + (Math.sin(a) > 0 ? -16 : 24));
      }
      // The lead: where to lay the sight for a shell to meet it.
      const m = this.muzzle(t, 0, new THREE.Vector3());
      const r = _b.subVectors(R.obj.position, m);
      const tt = intercept(r, R.v, G.shell);
      if (tt != null && r.length() < G.range * 1.2) {
        const lp = project(m.add(r.addScaledVector(R.v, tt)));
        if (lp) {
          g.strokeStyle = amber;
          g.beginPath();
          g.moveTo(lp.x, lp.y - 8), g.lineTo(lp.x + 8, lp.y), g.lineTo(lp.x, lp.y + 8), g.lineTo(lp.x - 8, lp.y), g.closePath();
          g.stroke();
        }
      }
    }
    // Torpedoes inbound: a small red diamond on each, with its range. A shell that passes close kills one.
    for (const tp of this.torps) {
      if (tp.dead || tp.side !== 'theirs') continue;
      const p = project(tp.pos);
      if (!p) continue;
      const d = tp.pos.distanceTo(camera.position);
      g.strokeStyle = red;
      g.beginPath();
      g.moveTo(p.x, p.y - 6), g.lineTo(p.x + 6, p.y), g.lineTo(p.x, p.y + 6), g.lineTo(p.x - 6, p.y), g.closePath();
      g.stroke();
      g.fillStyle = red;
      g.fillText(`TORP ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`, p.x + 9, p.y + 4);
    }
    // The gunner's panel.
    const deg = (a) => Math.round(((a / DEG) % 360 + 360) % 360);
    const lines = [
      [`${t.name.toUpperCase()}  ×${[1, 3, 7][this.zoom]}`, '#cfe8ff'],
      [`train ${String(deg(-t.train * t.s)).padStart(3, '0')}°  elev ${Math.round(t.elev / DEG)}°${t.rate < 1 ? (t.rate <= 0 ? '  JAMMED' : `  slow (${Math.round(t.rate * 100)}%)`) : ''}`, t.rate <= 0 ? red : t.rate < 1 ? amber : '#cfe8ff'],
      [`ready ${t.ready}/${G.rack}  magazine ${t.stock}  hoist ${t.hoist}`, t.hoist.startsWith('stopped') ? red : '#cfe8ff'],
      this.pdLine(red)
    ];
    if (this.plant) lines.push([`heat sinks ${Math.round(this.plant.heat * 100)}%${this.plant.hot ? '  FULL: point defence holding' : ''}`, this.plant.hot ? red : this.plant.heat > 0.8 ? amber : '#cfe8ff']);
    if (t.fouled) lines.push(['CUTOUT: line of fire crosses the ship', red]);
    else if (t.ready <= 0) lines.push(['NO ROUNDS READY', red]);
    g.font = '13px ui-monospace, Menlo, monospace';
    lines.forEach(([s, c], i) => {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(14, h - 132 + i * 20 - 14, g.measureText(s).width + 12, 19);
      g.fillStyle = c;
      g.fillText(s, 20, h - 132 + i * 20);
    });
  }
}

function bar(g, x, y, w, k, color, label) {
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x + 32, y, w, 6);
  g.fillStyle = color;
  g.fillRect(x + 32, y, w * clamp(k, 0, 1), 6);
  g.font = '10px ui-monospace, Menlo, monospace';
  g.fillText(label, x, y + 6);
  g.font = '12px ui-monospace, Menlo, monospace';
}
