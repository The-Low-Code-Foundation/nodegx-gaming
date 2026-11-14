// The carrier's weapons, her shields, and the raider that attacks her.
//
// A raid (integrity.mjs `attack`, through `hooks.raid`) is now a ship you can see and fight: a Rook corvette comes in
// from one side and makes firing passes down it, bow to stern and back, then breaks off. Everything it does is real in
// the same sense the damage is:
//
// - Its shells are projectiles. Each one flies from its turret on a lead worked out for the carrier's motion, and
//   wherever its path meets the hull (the layout's loft sections, `integrity.inHull`) it goes through the ship as any
//   other hit does (`integrity.arrive`: holes, air, health, the jobs it starts, the call).
// - The carrier's shields are a bubble round her (`shields.radius`). While they hold, a shell bursts on the bubble and
//   takes `absorb` from them. They are as strong as her shield generators are healthy, and they come back by
//   themselves `delay` seconds after the last hit. The raider's disruptor beam drains them from `beam.range`.
// - Her own disruptor emitters (the layout's `emitter` mounts) do the same to the raider's shields when it is within
//   their reach and arc: crew-run, on main power only.
// - Her two heavy turrets fire shells that hit the raider's hull once its shields are down, or take `shieldHit` off
//   them while they are up. Each turret is the gunhouse in hull.glb named for its mount, and its guns (`<id>-guns`):
//   it trains and elevates at its own slow rate, from a ready rack the hoist fills from its magazine. A wrecked
//   barbette slows and then jams the turret; a wrecked magazine stops the hoist; on emergency power it turns at a crawl.
//   The firing cutout stops a shot whose line of fire crosses the ship's own hull.
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
// The layout's `weapons` entry has every number. In the console: `__carrier.guns.raid('port')`, `.raider`,
// `.shield`, `.turrets`.

import * as THREE from 'three';
import { corvette, fighter as wren, setThrust, metal } from '../ships.mjs';
import { at, box, cyl, glow, clamp, mulberry } from '../util.mjs';
import { hazardMat } from '../decor.mjs';

const DEG = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _beam = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

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

/** A shield bubble: the rim glows a little while it is being drained, and a hit sends a ring out from where it struck.
 *  Drawn on a unit sphere scaled to the bubble's half-axes, so `hit()` takes the point in the sphere's own frame. */
function bubble(color) {
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, glow: { value: 0 }, hitDir: { value: new THREE.Vector3(0, 1, 0) }, hitAge: { value: 9 }, hitAmp: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vP = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 color; uniform float glow; uniform vec3 hitDir; uniform float hitAge; uniform float hitAmp;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        #include <logdepthbuf_fragment>
        // No pow() of a negative base (undefined in GLSL: a NaN pixel the bloom would smear over the frame).
        float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 3.0);
        float d = acos(clamp(dot(normalize(vP), hitDir), -1.0, 1.0));
        float fade = 1.0 - smoothstep(0.0, 1.4, hitAge);
        float rx = (d - hitAge * 0.9) / 0.05, sx = d / 0.06;
        float ring = exp(-rx * rx) * hitAmp * fade;
        float spot = exp(-sx * sx) * hitAmp * max(0.0, 1.0 - hitAge * 2.5) * 2.0;
        float a = rim * glow + ring + spot;
        gl_FragColor = vec4(color, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  m.userData.uncut = true; // the cutaway's planes leave it alone
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.userData.uncut = true;
  return mesh;
}

function hitBubble(mesh, localDir, amp = 1) {
  const u = mesh.material.uniforms;
  u.hitDir.value.copy(localDir).normalize();
  u.hitAge.value = 0;
  u.hitAmp.value = amp;
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
    this.manned = null;
    this.zoom = 0;
    this.inv = new THREE.Matrix4();
    // The shields: the bubble round her centre of mass, as strong as her generators.
    const S = this.W.shields;
    this.shield = S.max;
    this.shieldMax = S.max;
    this.sinceHit = 99;
    this.com = new THREE.Vector3(...this.L.com);
    this.radius = new THREE.Vector3(...S.radius);
    this.bubble = bubble('#6aa8ff');
    this.bubble.scale.copy(this.radius);
    C.obj.add(this.bubble); // C.obj's origin is the centre of mass
    this.wasUp = true;
    // The emitters and their beams.
    this.emitters = this.L.mounts.filter((m) => m.kind === 'emitter').map((m) => ({
      m, at: new THREE.Vector3(...m.at).addScaledVector(new THREE.Vector3(...m.up), 4.3), up: new THREE.Vector3(...m.up),
      beam: this.beam('#8fa4ff'), on: false
    }));
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

  beam(color) {
    const m = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.visible = false;
    m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  setBeam(mesh, a, b, width, t) {
    const v = _beam.subVectors(b, a);
    const len = v.length();
    mesh.position.copy(a).addScaledVector(v, 0.5);
    mesh.quaternion.setFromUnitVectors(Y, v.normalize());
    const w = width * (0.75 + 0.25 * Math.sin(t * 43) * Math.sin(t * 17));
    mesh.scale.set(w, len, w);
    mesh.material.opacity = 0.55 + 0.3 * Math.sin(t * 29);
    mesh.visible = true;
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
    const shieldMesh = bubble('#ff7a5a');
    shieldMesh.scale.set(...R.size).multiplyScalar(1.35);
    shieldMesh.position.set(0, 1, -6);
    obj.add(shieldMesh);
    setThrust(obj, 1);
    return this.contact(obj, R, from, this.passes(from, d, passes), {
      label: 'RAIDER', centre: new THREE.Vector3(0, 1, -6), hull: R.hull, shield: R.shields, shieldMesh, beam: this.beam('#ff5a3a')
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
    // Its shields come back when nothing has touched them for a while.
    R.sinceHit += dt;
    if (K.shields && R.sinceHit > 4) R.shield = Math.min(K.shields, R.shield + K.regen * dt);
    // Its turrets track the carrier.
    const centre = this.C.obj.position;
    for (const t of R.obj.userData.turrets ?? []) {
      t.yaw.worldToLocal(_a.copy(centre));
      t.yaw.rotation.y = Math.atan2(-_a.x, -_a.z) + t.yaw.rotation.y;
      t.pitch.rotation.x = clamp(Math.atan2(_a.y, Math.hypot(_a.x, _a.z)), -0.2, 0.8);
    }
    const dist = R.obj.position.distanceTo(centre);
    // Its disruptor on her shields.
    if (K.beam && dist < K.beam.range && this.shield > 0 && !wp.leave) {
      this.shield = Math.max(0, this.shield - K.beam.drain * dt);
      this.sinceHit = 0;
      this.bubble.material.uniforms.glow.value = Math.max(this.bubble.material.uniforms.glow.value, 0.45);
      const p = this.bubblePoint(R.obj.position, _c);
      this.setBeam(R.beam, _d.set(0, 0.5, -50).applyMatrix4(R.obj.matrixWorld), p, 0.8, this.time);
    } else if (R.beam) R.beam.visible = false;
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

  /** Where a line from the bubble's centre toward `p` (world) leaves the bubble, in world. */
  bubblePoint(p, out) {
    const local = _a.copy(p).applyMatrix4(this.inv).sub(this.com);
    const k = 1 / Math.sqrt((local.x / this.radius.x) ** 2 + (local.y / this.radius.y) ** 2 + (local.z / this.radius.z) ** 2);
    local.multiplyScalar(k).add(this.com);
    return this.C.frame.localToWorld(out.copy(local));
  }

  endRaid(call, text) {
    const R = this.raider;
    if (!R || R.gone) return;
    R.gone = true;
    if (R.beam) R.beam.visible = false;
    if (!R.dead) R.obj.removeFromParent();
    this.ship.raidOver();
    if (call || text) this.dc?.say(call, text, 0, 6);
  }

  /** The raider is hit at `p` (world). Shields first; then the hull, and at nothing it blows up. */
  raiderHit(p, dmg, shieldHit, you = false) {
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
    if (R.shield > 0) {
      R.shield = Math.max(0, R.shield - shieldHit);
      const local = R.shieldMesh.worldToLocal(_a.copy(p));
      hitBubble(R.shieldMesh, local, 1.2);
      this.flash(p, 4, '#ffb08a', 0.25);
      if (R.shield <= 0) this.dc?.say("The raider's shields are down.", "The raider's shields are down.", 0, 4);
      return;
    }
    R.hull -= dmg;
    this.flash(p, 9, '#ffc070', 0.45);
    this.flash(p, 5, '#ffffff', 0.12);
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
      const len = Math.min(sp * 0.03, 40), w = s.w ?? (s.ours ? 0.7 : 1.1);
      s.mesh.scale.set(w, w, len);
      if (s.ours) {
        if (R && !R.gone && !R.dead && this.hitsRaider(prev, s.pos, _b)) {
          if (s.you) R.byYou = (R.byYou ?? 0) + 1; // your own hits, shields or hull (the career counts them)
          this.raiderHit(_b, s.dmg, s.shieldHit ?? this.W.gun.shieldHit, s.you);
          s.life = 0;
        } else if (s.cannon && s.pos.distanceTo(centre) < 240 && this.ship.inHull(_b.copy(s.pos).applyMatrix4(this.inv))) {
          // A fighter's round that finds the carrier: stopped by her plating, with a spark to show for it.
          this.flash(s.pos, 1.5, '#ffd090', 0.12);
          s.life = 0;
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

  inBubble(q) {
    return ((q.x - this.com.x) / this.radius.x) ** 2 + ((q.y - this.com.y) / this.radius.y) ** 2 + ((q.z - this.com.z) / this.radius.z) ** 2 <= 1;
  }

  /** A raider's shell between a and b (world): on the bubble if the shields are up, into the hull if not. */
  hitsCarrier(s, a, b) {
    const A = _c.copy(a).applyMatrix4(this.inv), B = _d.copy(b).applyMatrix4(this.inv);
    const n = Math.max(1, Math.ceil(A.distanceTo(B) / 1.2));
    const q = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      q.lerpVectors(A, B, i / n);
      if (!s.inside && this.inBubble(q)) {
        s.inside = true;
        if (this.shield > 0) {
          this.shield = Math.max(0, this.shield - this.W.shields.absorb);
          this.sinceHit = 0;
          hitBubble(this.bubble, _a.copy(q).sub(this.com).divide(this.radius), 1);
          this.flash(this.C.frame.localToWorld(q.clone()), 6, '#9ac4ff', 0.3);
          this.sfx?.play('hit', 20);
          return true;
        }
      }
      if (this.ship.inHull(q)) {
        this.ship.arrive(q, _a.subVectors(B, A));
        return true;
      }
    }
    return false;
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

  // --- the carrier's side ----------------------------------------------------------------------------------------------

  shieldsFrame(dt) {
    const S = this.W.shields;
    // As strong as the generators are healthy; on emergency power, a third of that.
    this.shieldMax = S.max * this.ship.sys('shield') * (this.ship.power ? 1 : 0.35);
    this.sinceHit += dt;
    if (this.sinceHit > S.delay) this.shield += S.regen * (this.shieldMax / S.max) * dt;
    this.shield = Math.min(this.shield, this.shieldMax);
    this.ship.shieldCharge = this.shieldMax > 0 ? this.shield / S.max : 0;
    if (this.wasUp && this.shield <= 0.5) {
      this.wasUp = false;
      this.dc?.say('Shields are down.', 'Shields are down: shells will reach the hull.', 0, 5);
    } else if (!this.wasUp && this.shield > S.max * 0.3) {
      this.wasUp = true;
      this.dc?.say('Shields are back up.', 'Shields are back up.', 0, 4);
    }
    const u = this.bubble.material.uniforms;
    u.hitAge.value += dt;
    u.glow.value = Math.max(0, u.glow.value - dt * 1.5);
    this.bubble.visible = this.mode !== 'cutaway' && (u.glow.value > 0.01 || u.hitAge.value < 1.6);
    const Ru = this.raider?.shieldMesh?.material.uniforms;
    if (Ru) Ru.hitAge.value += dt;
  }

  /** The emitters: each one's crew beams the raider when it is within reach and in front of it. */
  emittersFrame(dt) {
    const R = this.raider;
    const live = R && !R.gone && !R.dead && !R.target && this.ship.power;
    const E = this.W.emitters;
    for (const e of this.emitters) {
      e.on = false;
      if (live) {
        const p = this.C.frame.localToWorld(_a.copy(e.at));
        const to = _b.subVectors(R.obj.position, p);
        const d = to.length();
        const up = _c.copy(e.up).transformDirection(this.C.frame.matrixWorld);
        if (d < E.range && up.dot(to.normalize()) > Math.cos(E.arc * DEG)) {
          e.on = true;
          R.shield = Math.max(0, R.shield - E.drain * dt);
          R.sinceHit = 0;
          this.setBeam(e.beam, p, R.obj.position, 0.55, this.time + e.at.z);
          R.shieldMesh.material.uniforms.glow.value = 0.6;
        }
      }
      e.beam.visible = e.on;
    }
    if (R?.shieldMesh) {
      const u = R.shieldMesh.material.uniforms;
      if (!this.emitters.some((e) => e.on)) u.glow.value = Math.max(0, u.glow.value - dt);
      R.shieldMesh.visible = R.shield > 0 && (u.glow.value > 0.01 || u.hitAge.value < 1.6);
    }
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
    this.fire(p, d.multiplyScalar(G.shell).add(this.body.vel), true, G.range / G.shell, dmg).you = you;
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
   *  own. It does to a raider what `damage` and `shieldHit` say: a fraction of a turret's shell, many times a second. */
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
    s.shieldHit = F.shieldHit;
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
    out.shield = R.K.shields ? R.shield / R.K.shields : null;
    out.hull = R.target ? null : Math.max(0, R.hull) / R.K.hull;
    out.hits = R.target ? R.hits : null;
    return out;
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
    this.emittersFrame(dt);
    this.turretsFrame(dt, f, mode);
    this.cannonFrame(dt);
    this.shellsFrame(dt);
    this.shieldsFrame(dt);
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
        else {
          bar(g, rp.x + b + 6, rp.y + 2, 70, R.shield / K.shields, '#8fb0ff', 'SHD');
          bar(g, rp.x + b + 6, rp.y + 12, 70, Math.max(0, R.hull) / K.hull, red, 'HULL');
        }
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
    // The gunner's panel.
    const deg = (a) => Math.round(((a / DEG) % 360 + 360) % 360);
    const lines = [
      [`${t.name.toUpperCase()}  ×${[1, 3, 7][this.zoom]}`, '#cfe8ff'],
      [`train ${String(deg(-t.train * t.s)).padStart(3, '0')}°  elev ${Math.round(t.elev / DEG)}°${t.rate < 1 ? (t.rate <= 0 ? '  JAMMED' : `  slow (${Math.round(t.rate * 100)}%)`) : ''}`, t.rate <= 0 ? red : t.rate < 1 ? amber : '#cfe8ff'],
      [`ready ${t.ready}/${G.rack}  magazine ${t.stock}  hoist ${t.hoist}`, t.hoist.startsWith('stopped') ? red : '#cfe8ff'],
      [`ship's shields ${Math.round((this.shield / this.W.shields.max) * 100)}%`, this.shield > 1 ? '#8fb0ff' : red]
    ];
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
