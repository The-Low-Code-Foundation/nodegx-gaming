// The carrier prototype (carrier.html): a 400 m ship you walk around inside, fly from her bridge with real inertia,
// and look into through a cutaway, and a fighter you launch from her hangar (fighter.mjs). Four seats: walking (first
// person), the helm, the fighter, a gun turret (weapons.mjs), and the cutaway.
//
// The ship keeps flying whatever seat you are in: walk away from the helm with her turning and she goes on turning
// (with flight assist on, the helm's assist brings her to rest on her own). Inside, you never feel it: the decks are
// in her frame (layout.mjs), and the world goes past the windows and the open bay.
//
//   ?at=bridge|helm|hangar|engineering|mess|fighter|gun|gun-ventral   start there   ?view=cutaway   start in the cutaway
//   ?debug=1   T in a fighter refills her tanks anywhere (normally they are topped up on the pad after a landing)
//   __carrier in the console: the ship, the helm, the walker, the fighter, go(roomId), info() (draw calls, triangles,
//   frame time)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Input } from '../input.mjs';
import { Space } from '../space.mjs';
import { LightPool } from '../lights.mjs';
import { Walker } from '../controllers/walk.mjs';
import { station } from '../scenery.mjs';
import { buildCarrier, roomAt, loadHull, machineryFrame } from './layout.mjs';
import { drumsFrame, drumWindow, drumDeck, drumSpots, drumRoomAt, placeInDrum, drumCamera, liftCar, liftShaft, parseKey } from './drum.mjs';
import { setsFrame, lookOf } from './sets.mjs';
import { Ambience } from './ambience.mjs';
import { frameOf, sideOf } from './wayfinding.mjs';
import { Rigid, Thrusters, Helm, thrustersFromLayout, buildThrusterMeshes, updatePlumes } from './newton.mjs';
import { Cutaway } from './cutaway.mjs';
import { CarrierHud } from './hud.mjs';
import { tickCrew } from './crew.mjs';
import { Fighter } from './fighter.mjs';
import { loadFighterModel, swapFighters } from './fighter-model.mjs';
import { Approach } from './approach.mjs';
import { Cockpit } from './cockpit.mjs';
import { DamageControl } from './damage.mjs';
import { Integrity } from './integrity.mjs';
import { Weapons } from './weapons.mjs';
import { Plant } from './plant.mjs';
import { HelmSight } from './helmsight.mjs';
import { Sfx } from '../sfx.mjs';
import { Gas } from './gas.mjs';
import { FlightAudio } from './flight-audio.mjs';
import { Career } from './career.mjs';
import { Routine, fmt } from './watch.mjs';
import { Voices } from './voice.mjs';

// The spin-drum carrier (design/CARRIER-REBUILD.md). ?ship=v1 is the first carrier, kept: 400 m, three decks, gravity
// only while her drive burns (ships/carrier-v1.*.json, assets/carrier/hull-v1.glb).
const SHIP = new URLSearchParams(location.search).get('ship') === 'v1' ? 'carrier-v1' : 'carrier';
const L = await (await fetch(`ships/${SHIP}.layout.json`)).json();
// Each ship has its own career and routine (the rooms and the spots in them are hers): ships/<ship>.career.json, .watches.json.
const K = await (await fetch(`ships/${SHIP}.career.json`)).json(); // your first week aboard (career.mjs)
const W = await (await fetch(`ships/${SHIP}.watches.json`)).json(); // the ship's routine: clock, watches, muster (watch.mjs)
const q = new URLSearchParams(location.search);

const canvas = document.getElementById('view');
const fadeEl = document.getElementById('fade');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor('#02030a');
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.2, 20000);
/** How it is lit aboard (see the frame's end): the fill and the sun, ACES exposure, and the bloom on lamps and screens.
 *  `__carrier.ABOARD` in the console to tune it live; `?post=0` (or `ABOARD.post = false`) renders aboard without tone
 *  mapping and bloom, for a slow machine. */
const ABOARD = { fill: 0.38, sun: 0.35, exposure: 1.15, bloom: 0.35, threshold: 0.92, post: new URLSearchParams(location.search).get('post') !== '0' };
const hemi = new THREE.HemisphereLight('#9fb4d8', '#1a1410', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
sun.position.set(0.6, 0.8, 0.3);
scene.add(sun);
const lightPool = new LightPool(scene);
// Out in a fighter the view goes through bloom, so the drive's flame and the jets' glints glow. One NaN or Inf pixel
// (a particle past its life, a pow of a negative number) smeared by the bloom blacks out the whole frame, so a scrub
// pass zeroes any such pixel, and caps the rest, before the bloom sees them. Aboard, the plain render is kept.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.); gl_FragColor = min(c, vec4(64.)); }'
}));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const space = new Space(scene, renderer, sun);

// Somewhere to leave from: the station she was docked at, a kilometre off her port bow.
const dock = station({ seed: 3 });
dock.position.set(-900, -80, -1300);
dock.rotation.y = 0.6;
// Its own copies of the shared materials: the cutaway's planes go on the carrier's materials, not the station's.
dock.traverse((o) => {
  if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
});
scene.add(dock);

let mode = 'walk';
let helmView = 'bridge';
let deckNow = L.spawn.deck;
let drumNow = null; // the drum segment you stand in (the spin-drum carrier): { I, g, hid, did, seg }
let ride = null; // a lift car on its way up or down a spoke
let fading = false;
let bayK = 0, bayWant = 0;

const hooks = {
  ladder: (l, end) => {
    if (!ship.hatchOpen(l)) return dc.say(null, "The hatch won't open: the compartment on the other side has lost its air.");
    const to = l[end === 'a' ? 'b' : 'a'];
    fadeThen(() => goDeck(to.deck, to.at[0], to.at[1], to.yaw ?? walker.yaw));
  },
  // The career keeps the helm and the fighters shut until you have earned them (career.mjs).
  helm: () => (career.allows('helm') ? setMode('helm') : career.refuse('helm')),
  bay: () => setBay(bayWant ? 0 : 1),
  fighter: (i) => (career.allows('fighters') ? fadeThen(() => boardFighter(i)) : career.refuse('fighters')),
  // A vac suit is put on, not carried (integrity.mjs `don`); the rest are kits you carry to a job (damage.mjs).
  kit: (k) => (L.damage.kits[k]?.worn ? ship.don() : dc.take(k)),
  // The drums (drum.mjs): a lift down a spoke from the spine, back up to the hub, the ladder between the decks.
  drum: (kind, a) => {
    if (kind === 'ladder') {
      const s = drumSpots(C, a.half).ladder;
      fadeThen(() => enterDrum(a.half, a.deck, a.seg, s.x, s.z - 0.9, walker.yaw));
    } else fadeThen(() => startRide(kind, a));
  }
};

function setBay(v) {
  bayWant = v;
  if (bayUse) bayUse.label = bayWant ? 'Close the bay doors' : 'Open the bay doors';
}

const C = buildCarrier(L, hooks);
scene.add(C.obj);
const thrusterList = thrustersFromLayout(L);
buildThrusterMeshes(C.frame, thrusterList);
const blenderHull = q.get('hull') !== 'code' && (await loadHull(C, SHIP === 'carrier' ? undefined : `assets/carrier/hull-${SHIP.slice(8)}.glb`)); // ?hull=code shows the lofted hull instead
// The fighters as built in Blender (fighter-model.mjs), with their cockpits; ?fighter=code keeps the code-built Wrens.
const blenderFighters = q.get('fighter') !== 'code' && (await loadFighterModel());
if (blenderFighters) swapFighters(C);
// Her inertia as a box the size of her hull.
const body = new Rigid({ mass: L.mass, size: [Math.max(...L.hull.main.map((s) => s.w)), Math.max(...L.hull.main.map((s) => s.h)), L.length] });
const deckOf = (id) => C.rooms.get(id)?.deck;
const BRIDGE_DECK = deckOf('bridge'), HANGAR_DECK = deckOf('hangar');
const thrusters = new Thrusters(thrusterList, body);
const helm = new Helm(C.obj, body, thrusters);
const bayUse = [...C.decks.values()].flatMap((I) => I.interactables).find((u) => u.id === 'bay');
// Gas in vacuum (gas.mjs): what the fighter's drive and jets throw out, and the carrier's own, each in its own pool.
const gas = new Gas(scene, 2600);
const carrierGas = new Gas(scene, 4000);
// The fighter's sound: live DSP worklets fed from her flight (flight-audio.mjs), on the page's AudioContext.
const sfx = new Sfx();
const flightAudio = new FlightAudio(sfx);
const ambience = new Ambience(sfx); // the ship's own sound: air, hum, rumble, the hull creaking (ambience.mjs)
const fighter = new Fighter(C, scene, { gas, audio: flightAudio, debug: q.get('debug') === '1' });
const approach = new Approach(C); // the lane of rings you fly back aboard down
const cockpit = new Cockpit(document.getElementById('c-fhud'));

/** Into fighter `i`: her lane, her screens, and flight control opens the bay for a pilot in a seat. */
function boardFighter(i) {
  fighter.board(i);
  approach.setPad(fighter.home.pos.z, fighter.out);
  cockpit.attach(fighter.obj);
  setMode('fighter');
  setBay(1);
}
// Damage control: fires, faults and leaks called out over the speakers (damage.mjs), started by hits. The ship's
// integrity (integrity.mjs): each compartment's air and health, the raids whose shells hole her, the pressure doors and
// the repair drones. ?dc=0 means no raids (a drill can still be called from the damage control centre); ?voice=0 keeps
// everyone quiet: the speakers keep to alarms, and nobody speaks.
// The voices (voice.mjs): recorded clips where there are some (assets/voice/), the browser's speech for the rest.
const voices = new Voices({ on: q.get('voice') !== '0' });
const dc = new DamageControl(C, { sfx, auto: false, voices });
const autoRaids = q.get('dc') !== '0';
const ship = new Integrity(C, {
  dc, sfx, thrusters: thrusterList, auto: autoRaids,
  hooks: {
    // Blacked out: carried into `room`, coming round on its floor.
    rescue: (room, done) => fadeThen(() => {
      setMode('walk');
      goDeck(room.deck, (room.x[0] + room.x[1]) / 2, (room.z[0] + room.z[1]) / 2, walker.yaw, room.seg);
      done();
    }),
    // A raid is a raider you can see and fight (weapons.mjs).
    raid: (from) => guns.raid(from)
  }
});
dc.airOf = (id) => ship.airOf(id);
// The guns, the point defence, the torpedoes, the railgun and the raider (weapons.mjs). The hatches to the turrets sit
// you in one.
const guns = new Weapons(C, scene, {
  ship, body, sfx, dc,
  hooks: {
    man: (t) => (career.allows('guns') ? fadeThen(() => manTurret(t)) : career.refuse('guns')),
    // A fighter shot dead in space: flight control takes her, from wherever she is, and brings her in.
    crippled: () => {
      setBay(1);
      fighter.land();
    }
  }
});
// Her heat and her reaction mass (plant.mjs): the guns put heat in, the radiators take it out, the drive burns
// propellant. The status board in the cutaway shows them with the guns.
const plant = new Plant(C, { ship, thrusters: thrusterList, dc, sfx });
guns.plant = plant;
ship.status = () => {
  const pdcUp = guns.pdcs.filter((g) => g.ok && g.stock > 0).length;
  const pdcRounds = guns.pdcs.reduce((a, g) => a + g.stock, 0), pdcMax = guns.pdcs.length * (L.weapons.pdc?.stock ?? 1);
  return [
    ['Point defence', ship.sys('pdc'), `${pdcUp}/${guns.pdcs.length} guns · ${Math.round((pdcRounds / Math.max(1, pdcMax)) * 100)}% rounds`],
    ['Torpedo tubes', (ship.node(L.weapons.tubes?.magazine)?.health ?? 100) / 100, `${guns.tubeStock} torpedoes`],
    ['Railgun', ship.power && !plant.hot ? 1 : 0.3, `${guns.rail.stock} slugs · ${guns.rail.charge >= 1 ? 'charged' : `${Math.round(guns.rail.charge * 100)}%`}`],
    ...plant.rows()
  ];
};
// The helm's sight (helmsight.mjs): the railgun's pip, the nav plot, the heat and the Δv, over the view from the helm.
const helmSight = new HelmSight(C, { body, helm, thrusters: thrusterList, rcs: thrusters, guns, plant, ship, dc });
// The career: orders from the officers, drills, promotions, and the ship opening up as you earn it. Free roam (any
// `?at=` or `?view=`, or the start screen's button) has everything open.
const career = new Career(C, K, { dc, ship, guns, fighter, obj: C.obj, body, sfx, voices });

// The ship's routine (watch.mjs): the clock and the bells, the watches, the crew at their posts by watch, the watch
// bill, your bunk and your section's muster. ?crew=0 leaves the crew ashore (the officers still come aboard).
const routine = new Routine(C, W, { sfx, crew: q.get('crew') !== '0', ship, dc });
const crew = routine.crew;
career.routine = routine;
career.nav = helmSight; // the transit step's waypoint
routine.voices = voices;
const sleepEl = document.getElementById('c-sleep');
routine.tell = (who, text, secs = 6) => (career.on ? career.tell(who, text, secs) : routine.note(who ? `${who.name}: ${text}` : text, secs));
routine.onTurnIn = (go) => {
  // Lights out, the hours go by, and someone shakes your bunk.
  fading = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    go();
    sleepEl.textContent = `You sleep. ${fmt(routine.t)}: someone shakes your bunk.`;
    sleepEl.hidden = false;
    setTimeout(() => {
      sleepEl.hidden = true;
      fadeEl.classList.remove('on');
      career.woke();
      if (career.on) career.save();
      setTimeout(() => (fading = false), 300);
    }, 2400);
  }, 500);
};
routine.onMuster = (present, leader, line) => career.musterCalled(present, leader, line);

function manTurret(t) {
  guns.man(t);
  setMode('gun');
}
dc.onEnd = (job, ok) => {
  if (ok) ship.mended(job.room.id);
  career.jobEnded(job, ok);
};

const walker = new Walker(C.decks.get(deckNow));
walker.speed = 4.6;
goDeck(L.spawn.deck, L.spawn.at[0], L.spawn.at[1], L.spawn.yaw);

const input = new Input(canvas);
const cut = new Cutaway(C, camera, canvas, document.getElementById('c-labels'));
const hud = new CarrierHud(cut);
hud.onLevel = (i) => cut.setLevel(i);
let modeBefore = 'walk';

input.onAction = (code) => {
  if (fading) return;
  if (code === 'Tab') return setMode(mode === 'cutaway' ? modeBefore : 'cutaway');
  if (mode === 'cutaway') {
    if (code.startsWith('Digit')) cut.setLevel(Number(code.slice(5)) - 1);
    if (code === 'KeyM') cut.setLevel(cut.levels.length - 1);
    return;
  }
  if (routine.billOpen) {
    // The watch bill is up: E or B puts it away.
    if (code === 'KeyE' || code === 'KeyB') routine.closeBill();
    return;
  }
  if (mode === 'walk' && code === 'KeyB') routine.read || !career.on ? routine.openBill() : routine.tell(null, 'You have not read the watch bill yet: it is on the board outside the ship\'s office.', 5);
  else if (mode === 'walk' && code === 'KeyE') walker.nearestUse()?.use();
  else if (mode === 'fighter' && code === 'KeyV') fighter.view = fighter.view === 'cockpit' ? 'chase' : 'cockpit';
  else if (mode === 'fighter' && code === 'KeyM') fighter.toggleMouse();
  else if (mode === 'fighter' && code === 'KeyT') fighter.debugRefill();
  else if (mode === 'fighter' && code === 'KeyE') {
    if (fighter.phase === 'seated')
      fadeThen(() => {
        cockpit.detach();
        const b = L.fighters[fighter.index]?.boarding; // up her boarding tube, where she has one
        const s = fighter.leave();
        setMode('walk');
        if (b) goDeck(deckOf(b.from), b.at[0], b.at[1], walker.yaw);
        else goDeck(3, s.x, s.z, s.yaw);
      });
    else if (fighter.canLand(body.vel)) {
      setBay(1);
      fighter.land();
    }
  } else if (mode === 'gun' && code === 'KeyE') {
    fadeThen(() => {
      const s = guns.leave();
      setMode('walk');
      goDeck(s.deck, s.at[0], s.at[1], s.yaw ?? walker.yaw);
    });
  } else if (mode === 'gun' && code === 'KeyZ') guns.zoomStep();
  else if (mode === 'helm' && code === 'KeyE') {
    setMode('walk');
    goDeck(1, L.helm.at[0], L.helm.at[1] + 1.4, 0);
  } else if (mode === 'helm' && code === 'KeyV') helmView = helmView === 'bridge' ? 'chase' : 'bridge';
  else if (mode === 'helm' && code === 'KeyG') helmSight.say(plant.toggleRadiators());
  else if (mode === 'helm' && code === 'KeyN') helmSight.toggleNav();
};

function setMode(m) {
  if (m === mode) return;
  if (mode === 'cutaway') cut.exit();
  if (m === 'cutaway') {
    modeBefore = mode;
    input.unlock();
    input.lockAllowed = false;
    cut.enter();
  } else input.lockAllowed = true;
  mode = m;
  hud.mode(m);
}

/** Stands you at (x, z) on deck `id`: a fixed deck's number, or a drum deck's key ("drum-b-i", drum.mjs) with the
 *  segment `seg` whose frame x and z are in. */
function goDeck(id, x, z, yaw, seg = 0) {
  const k = parseKey(id);
  if (k) return enterDrum(k.hid, k.did, seg, x, z, yaw);
  const I = C.decks.get(id);
  drumNow = null;
  deckNow = id;
  walker.interior = I;
  walker.moveTo(new THREE.Vector3(x, I.floorY, z), yaw);
}

// --- the drums (the spin-drum carrier): walking round a ring, and the lifts up and down the spokes (drum.mjs) ---------

/** Stands you in segment `seg` of a half's deck at (x, z) in its frame; builds and shows the segments round it. */
function enterDrum(hid, did, seg, x, z, yaw = walker.yaw) {
  const b = drumWindow(C, hid, did, seg);
  drumNow = b;
  walker.interior = b.I;
  walker.float = false;
  walker.pos.set(x, b.I.floorY, z);
  walker.yaw = yaw;
}

/** Past a segment floor's edge you are on the next segment's floor: the same point, in the next frame. */
function drumStep() {
  const { hw } = drumDeck(C, drumNow.hid, drumNow.did);
  if (Math.abs(walker.pos.x) <= hw) return;
  const k = walker.pos.x > hw ? 1 : -1;
  enterDrum(drumNow.hid, drumNow.did, drumNow.seg + k, walker.pos.x - k * 2 * hw, walker.pos.z);
}

/** Into a lift car: down a spoke from the hub to a deck (`a.seg`, or the first spoke), or up from a deck to the hub. */
function startRide(dir, a) {
  const D = L.drum, { dk, h } = drumDeck(C, a.half, a.deck);
  const seg = a.seg ?? D.spokes.segments[0], spot = drumSpots(C, a.half);
  enterDrum(a.half, a.deck, seg, spot.lift.x, spot.lift.z, Math.PI); // facing the doors
  const car = liftCar(spot.lift), shaft = liftShaft(spot.lift, D.hub.r, dk.floorR - dk.h);
  drumNow.g.add(car, shaft);
  // The car's lamp, from the light pool (lights.mjs) like every other lamp aboard: a spec on the segment's interior.
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 2.2, 0);
  car.add(anchor);
  const lamp = { anchor, color: new THREE.Color('#fff1d6'), intensity: 9, distance: 7, decay: 1.6, weight: 0.01 };
  drumNow.I.lights.push(lamp);
  const omega = (h.rpm * 2 * Math.PI) / 60;
  ride = { dir, half: a.half, deck: a.deck, seg, spot, car, shaft, lamp, I: drumNow.I, t: 0, dur: 9, r0: D.hub.r + 0.4, r1: dk.floorR, omega, spin: h.dir, r: 0, v: 0, lean: 0 };
  rideFrame(0);
  sfx.cue('servo', { dur: 1.2 });
}

/** The car moves along the spoke, easing in and out. Moving out from the axis in a spinning frame, the car's rails push
 *  you sideways (Coriolis, 2ωv): near the hub, where the spin's pull is weak, you feel it as a lean. Faked, cheaply. */
function rideFrame(dt) {
  ride.t += dt;
  const u = Math.min(1, ride.t / ride.dur), sm = u * u * (3 - 2 * u), dsm = (6 * u * (1 - u)) / ride.dur;
  const [ra, rb] = ride.dir === 'down' ? [ride.r0, ride.r1] : [ride.r1, ride.r0];
  ride.r = ra + (rb - ra) * sm;
  ride.v = (rb - ra) * dsm; // outward speed
  const g = ride.omega * ride.omega * ride.r;
  ride.lean = Math.max(-0.3, Math.min(0.3, -Math.atan2(2 * ride.omega * ride.v * ride.spin, Math.max(g, 1.2))));
  ride.car.position.y = -ride.r;
  if (u < 1 || ride.done) return;
  ride.done = true;
  ride.I.lights.splice(ride.I.lights.indexOf(ride.lamp), 1);
  ride.shaft.removeFromParent();
  if (ride.dir === 'down') {
    ride.car.removeFromParent();
    const s = ride.spot.landing;
    ride = null;
    enterDrum(drumNow.hid, drumNow.did, drumNow.seg, s.x, s.z, Math.PI / 2);
    sfx.cue('servo', { dur: 1.2 });
  } else fadeThen(() => {
    const sp = C.rooms.get('spine'), h = L.drum.halves.find((x) => x.id === ride.half);
    const first = L.drum.decks[0].id === ride.deck;
    ride.car.removeFromParent();
    ride = null;
    goDeck(sp.deck, first ? sp.x[0] + 0.7 : sp.x[1] - 0.7, (h.corridor[0] + h.corridor[1]) / 2, walker.yaw);
  });
}

function fadeThen(fn) {
  fading = true;
  fadeEl.classList.add('on');
  setTimeout(() => {
    fn();
    fadeEl.classList.remove('on');
    setTimeout(() => (fading = false), 300);
  }, 380);
}

// --- the frame -------------------------------------------------------------------------------------------------------

const IDLE = { keys: new Set(), dx: 0, dy: 0, wheel: 0, clicked: false, trigger: false };
const chasePos = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
let last = performance.now(), time = 0, avgDt = 1 / 60, saveT = 15;
let burnTilt = 0, burnCallT = 0, burning = false;

function resize() {
  // Never zero: a hidden page measures 0 × 0, and a zero-sized bloom target is an incomplete framebuffer.
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

function frame() {
  const now = performance.now();
  tick(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

/** One step of everything, then a render. The page calls it every animation frame; `__carrier.tick()` can call it by
 *  hand (a hidden tab gets no animation frames). */
function tick(dt) {
  time += dt;
  avgDt += (dt - avgDt) * 0.05;
  const f = input.frame();

  // Weightless rooms (`float` in the layout: the spin-drum carrier's spine, crew tunnel and trunks): hand over hand.
  if (mode === 'walk') walker.float = !drumNow && !!roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.float;
  if (mode === 'walk') walker.frame(f, dt, { canMove: !fading && !routine.billOpen && !ride });
  if (mode === 'walk' && drumNow && !ride) drumStep();
  if (ride) rideFrame(dt);
  helm.frame(mode === 'helm' ? f : IDLE, dt, mode === 'helm');
  fighter.frame(mode === 'fighter' ? f : IDLE, dt, mode === 'fighter', { carrier: body, bayOpen: bayK >= 1 });
  // The approach lane: lit while you are out in her, and flight control catches you at its end.
  const lane = approach.frame(dt, fighter, body, mode !== 'walk' && (fighter.flying || fighter.phase === 'landing'));
  if (mode === 'fighter' && fighter.flying && lane.call === 'catch' && bayK >= 1) fighter.capture(lane);
  updatePlumes(thrusterList, time, carrierGas, dt);
  carrierGas.stepTick();
  gas.frame(dt, time);
  carrierGas.frame(dt, time);
  flightAudio.setActive(mode === 'fighter' && fighter.aboard);
  flightAudio.frame(fighter.flight);
  machineryFrame(C, time, { power: ship.power, reactor: ship.sys('reactor') });
  setsFrame(C, dt, time);
  ship.auto = autoRaids && career.allows('raids'); // raiders come by themselves once you are a gunner
  dc.frame(dt, f, walker, mode);
  ship.frame(dt, f, walker, mode);
  plant.frame(dt, { stations: ship.stations }); // after integrity has set the thrusters' health: heat and tanks cap the drive
  // The railgun: a click at the helm.
  if (mode === 'helm' && f.clicked && !fading) {
    const why = guns.railFire();
    if (why) helmSight.say(`Railgun: ${why}.`, 2);
  }
  if (bayK !== bayWant) {
    bayK = bayWant > bayK ? Math.min(1, bayK + dt / 6) : Math.max(0, bayK - dt / 6);
    C.bayDoor?.set(bayK);
    for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + bayK * p.userData.travel;
  }
  C.obj.updateMatrixWorld(true);
  guns.fly(fighter, mode === 'fighter' && !fading && f.trigger); // her cannon: the mouse button, out in space
  guns.frame(dt, mode === 'gun' ? f : IDLE, mode, camera);

  // Which decks are drawn: the one you stand on; the bridge from the helm; none from the chase view; the hangar deck
  // from a fighter (you are in it, or you can see into it through the open bay); all in the cutaway.
  for (const [id, I] of C.decks) {
    I.group.visible = mode === 'cutaway' || (mode === 'walk' && id === deckNow && !drumNow) || (mode === 'helm' && helmView === 'bridge' && id === BRIDGE_DECK) || (mode === 'fighter' && id === HANGAR_DECK);
  }
  C.machinery.visible = mode !== 'helm' || helmView === 'bridge';
  // The drums: their blocks through the cutaway (inside the fixed sleeve, nothing else sees them), and the segments
  // round you while you walk in one.
  if (C.drums) {
    C.drums.group.visible = mode === 'cutaway' || (mode === 'walk' && !!drumNow);
    for (const h of C.drums.halves) (h.blocks.visible = mode === 'cutaway'), (h.segs.visible = mode === 'walk' && !!drumNow);
  }
  drumsFrame(C, dt);
  // A drum deck is drawn while you walk in it (and only the segments round you: the rest are hidden, and so is whoever
  // stands in them).
  const drawnDeck = (d) => (C.isDrum(d) ? mode === 'walk' && drumNow?.I.deck.id === d : C.decks.get(d).group.visible);
  tickCrew(crew, dt, drawnDeck);
  career.tickPeople(dt, (p) => drawnDeck(p.deck) && (!C.isDrum(p.deck) || p.I.group.visible));

  // The main drive's push (m/s²), for the tilt you feel aboard and the call when she starts a burn.
  let push = 0;
  for (const t of thrusterList) if (t.kind === 'main') push += t.force * t.throttle * (t.health ?? 1);
  push /= body.mass;
  burnTilt += (Math.atan(push / 9.81) - burnTilt) * Math.min(1, dt * 1.5);
  burnCallT -= dt;
  if (push > 0.6 && !burning && burnCallT <= 0) {
    burnCallT = 40;
    dc.say('Main drive burning. Hold on to something.', `Main drive burning: ${(push / 9.81).toFixed(2)} g toward the stern.`, 0, 4);
  }
  burning = push > 0.3 ? true : push < 0.1 ? false : burning;

  if (mode === 'walk' && drumNow) {
    const { dk, h } = drumDeck(C, drumNow.hid, drumNow.did);
    if (ride) drumCamera(camera, drumNow.g, ride.spot.lift.x, -ride.r, ride.spot.lift.z, 1.6, ride.lean, walker.quat(_q));
    else placeInDrum(C, camera, walker, drumNow);
    const r = drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z);
    const g = ride ? (ride.omega * ride.omega * ride.r) / 9.81 : dk.g;
    hud.where(ride
      ? `In a lift, ${ride.dir === 'down' ? 'down to' : 'up from'} the ${h.name.toLowerCase()}, ${dk.name.toLowerCase()} · ${Math.round(ride.r)} m from the axis · ${g.toFixed(2)} g${Math.abs(ride.lean) > 0.05 ? ' · the car leans on its rails' : ''}`
      : `${h.name}, ${dk.name.toLowerCase()} · ${r.system === 'corridor' ? 'ring corridor' : r.name} · segment ${drumNow.seg} of ${L.drum.sides} · ${g.toFixed(2)} g`);
    hud.use(fading || ride ? null : walker.nearestUse());
    drumNow.I.tick(dt);
  } else if (mode === 'walk') {
    walker.placeCamera(camera, C.frame);
    // Under the main drive the plating holds you to the deck, but the push still comes through it: what you feel as
    // down leans toward the stern, so the decks seem to slope up toward the bow.
    if (burnTilt > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(C.obj.quaternion), -burnTilt));
    const I = C.decks.get(deckNow);
    const r = roomAt(C, deckNow, walker.pos.x, walker.pos.z);
    hud.where(`${I.deck.name}${r ? ' · ' + r.name : ''}${r?.float ? ' · weightless (W pulls you along, Shift kicks off)' : ''} · frame ${frameOf(L, walker.pos.z)}, ${sideOf(walker.pos.x)}${push > 0.3 ? ` · drive burning, ${(push / 9.81).toFixed(2)} g aft` : ''}`);
    hud.use(fading ? null : walker.nearestUse());
    C.decks.get(deckNow).tick(dt);
  } else if (mode === 'helm') {
    const hurt = (ship.power ? '' : ' · emergency power') + (ship.driveFactor < 0.99 ? ` · main drive ${Math.round(ship.driveFactor * 100)}%` : '') + (plant.hot ? ' · HEAT: drive held back' : plant.prop <= 0 ? ' · no reaction mass' : '');
    hud.where(`At the helm · ${helmView === 'bridge' ? 'bridge view' : 'outside view'}${hurt}`);
    hud.use(null);
    hud.helm(helm);
    if (helmView === 'bridge') {
      camera.position.set(...L.helm.eye);
      C.frame.localToWorld(camera.position);
      camera.quaternion.copy(C.obj.getWorldQuaternion(_q));
    } else {
      // Behind and above her, a little lagging, looking past her toward where she points.
      const want = C.obj.localToWorld(_v.set(0, 150, 620));
      if (chasePos.lengthSq() === 0) chasePos.copy(want);
      chasePos.lerp(want, Math.min(1, dt * 3));
      camera.position.copy(chasePos);
      camera.up.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
      camera.lookAt(C.obj.localToWorld(_v.set(0, 0, -180)));
    }
  } else if (mode === 'fighter') {
    fighter.placeCamera(camera, dt);
    fighterHud(dt);
  } else if (mode === 'gun') {
    guns.placeCamera(camera, dt);
    hud.where(guns.where());
    hud.use(null);
  } else {
    const you = new THREE.Vector3(walker.pos.x, walker.pos.y, walker.pos.z);
    cut.frame(dt, you);
    dc.markScale = career.markScale = cut.pin.scale.x;
    const lv = cut.levels[cut.level];
    hud.where(`Cutaway · ${lv.name}`);
    hud.use(null);
  }
  // A hit shakes you, the harder the nearer it struck (aboard only: from outside you see it instead).
  if (ship.shake > 0.01 && (mode === 'walk' || mode === 'gun' || (mode === 'helm' && helmView === 'bridge'))) {
    const s = ship.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.12;
    camera.position.y += (Math.random() - 0.5) * s * 0.12;
    camera.rotateZ((Math.random() - 0.5) * s * 0.02);
  }
  // A hit on your fighter throws you about in the seat.
  if (mode === 'fighter' && guns.jolt > 0.01) {
    camera.rotateZ((Math.random() - 0.5) * guns.jolt * 0.05);
    camera.rotateX((Math.random() - 0.5) * guns.jolt * 0.03);
  }
  const roomNow = mode !== 'walk' ? null : drumNow ? (ride ? null : drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z)?.id) : roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.id;
  const placeNow = drumNow ? drumNow.I.deck.id : deckNow; // the deck you are on, a drum deck's key in a drum
  const hearRoom = roomNow ?? (mode === 'helm' ? 'bridge' : null);
  ambience.frame(dt, {
    room: hearRoom ? C.rooms.get(hearRoom) : null, air: hearRoom ? ship.airOf(hearRoom) / L.integrity.air.nominal : 1, power: ship.power,
    drive: Math.min(1, push / 15), inside: mode !== 'fighter' && mode !== 'cutaway'
  });
  routine.rankName = career.on ? career.rank : null;
  routine.frame(dt, { mode, deck: placeNow, seg: drumNow?.seg, room: roomNow, x: walker.pos.x, z: walker.pos.z });
  if (mode !== 'walk') routine.closeBill();
  career.frame(dt, { mode, deck: placeNow, seg: drumNow?.seg, room: roomNow });
  // The clock is kept with the career, now and then as well as at each order.
  if (career.on && (saveT -= dt) <= 0) (saveT = 15), career.save();
  if (mode !== 'helm' || helmView === 'bridge') chasePos.set(0, 0, 0);
  if (mode !== 'cutaway' && !(mode === 'helm' && helmView === 'chase') && !(mode === 'fighter' && fighter.view === 'chase')) camera.up.set(0, 1, 0);
  if (mode !== 'fighter') cockpit.hide();
  fighter.gl.draw(mode === 'fighter' && fighter.view === 'cockpit');
  helmSight.frame(dt, fading ? null : mode, camera);
  // A little wider from the cockpit, so the panel's screens are in view.
  const fov = mode === 'gun' ? guns.fov() : mode === 'fighter' && fighter.view === 'cockpit' ? 76 : 70;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // The fill and the sun stand in for the ship's own lighting aboard: on emergency power they go down with the lamps.
  // Aboard (walking, in a turret, at the helm on the bridge) the ship's own lamps do the lighting: the fill is low and
  // the sun, which has no shadows and so would shine through every wall, is mostly put out, so rooms fall off into
  // their corners instead of all being the same flat grey.
  const dark = mode === 'walk' && !ship.power;
  const inside = mode === 'walk' || mode === 'gun' || (mode === 'helm' && helmView === 'bridge');
  const look = mode === 'walk' && roomNow ? lookOf(C.rooms.get(roomNow)) : null; // some rooms want more fill: the hangar
  hemi.intensity = mode === 'cutaway' ? 1.8 : dark ? 0.12 : inside ? look?.fill ?? ABOARD.fill : 0.9;
  sun.intensity = dark ? 0.15 : inside ? look?.sun ?? ABOARD.sun : 1.6;
  space.frame(camera, dt);
  const lit = [...C.decks.values()].filter((I) => I.group.visible).concat(mode === 'walk' && drumNow ? C.drums.shown : []);
  lightPool.update(camera.position, mode === 'cutaway' ? [] : lit);
  routine.light(lightPool, hemi, { mode, room: roomNow }); // night: red lighting in the passages
  gas.setView(camera, renderer.domElement.height);
  carrierGas.setView(camera, renderer.domElement.height);
  // Out in a fighter, the lab's look: ACES tone mapping (applied by the composer's output pass only) and bloom. Aboard,
  // the same with a softer bloom, so lamps, screens and light strips glow and the lamps' pools roll off instead of
  // clipping to the walls' flat colour.
  if (mode === 'fighter' || (inside && ABOARD.post)) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mode === 'fighter' ? 1.05 : ABOARD.exposure;
    bloom.strength = mode === 'fighter' ? 0.85 : ABOARD.bloom;
    bloom.threshold = mode === 'fighter' ? 0.72 : ABOARD.threshold;
    composer.render();
  } else {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(scene, camera);
  }
}

hud.mode(mode);

const PROMPTS = {
  launch: { key: '', label: 'Launching: the lane runs you out through the bay' },
  landing: { key: '', label: 'Flight control has you: bringing you in' },
  turn: { key: '', label: 'On the pad: turning you round for the next launch' }
};
const _p = new THREE.Vector3();
const _f = new THREE.Vector3();
const FOE = {}; // what the fighter's sight shows of the raider (weapons.mjs `foe`)
const range = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`);

/** How a landing you flew yourself went: speed and how far off the line when flight control caught you. */
function grade(l) {
  const word = l.speed < 6 && l.off < 1.5 ? 'Textbook.' : l.speed < 9 && l.off < 3 ? 'Good landing.' : 'Firm, but down.';
  return `Landed: ${l.speed.toFixed(1)} m/s, ${l.off.toFixed(1)} m off the line. ${word}`;
}

/** The fighter's instruments: the HUD and the screens (cockpit.mjs), the prompt, and the panel from the chase view. */
function fighterHud(dt) {
  const ph = fighter.phase;
  hud.mode(fighter.flying ? 'fighter' : 'pad');
  // From the cockpit the HUD and the screens carry it all; from behind her, the panel at the side does.
  hud.helmEl.hidden = !(fighter.flying && (fighter.view === 'chase' || !blenderFighters));
  const fl = fighter.flight;
  hud.where(fighter.flying ? `Fighter · ${fl.assistOn ? 'attitude hold: the mouse moves the aim' : 'hold off: your hand on the valves'} · mouse ${fighter.mouseMode}` : ph === 'landing' ? 'Fighter · on approach' : 'Fighter · in the hangar');
  if (ph === 'seated') hud.use(fighter.refuelT > 0 ? { key: '', label: 'The deck crew are topping up your tanks' } : !fl.online ? { key: '', label: 'The drive is spinning up' } : bayK >= 1 ? { key: 'W', label: 'Launch (hold)' } : { key: '', label: 'Flight control is opening the bay doors' });
  else if (ph === 'flying') hud.use(fighter.canLand(body.vel) && !approach.state.inLane ? { label: 'Hand over: flight control brings you in' } : null);
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
    cockpit: fighter.view === 'cockpit', bayOpen: bayK >= 1, pad: fighter.index + 1,
    foe: fighter.flying ? guns.foe(FOE) : null, rounds: guns.rounds, roundsMax: L.weapons.fighter?.rounds,
    hull: guns.fhull != null ? guns.fhull / L.weapons.fighter.hull : 1
  });
}

// --- start ---------------------------------------------------------------------------------------------------------

const centre = (id, yaw = 0) => { const c = C.rooms.get(id); return c?.deck && [c.deck, (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, yaw]; };
const AT = L.version === 2
  ? { bridge: centre('bridge'), hangar: centre('hangar', Math.PI / 2), engineering: centre('eng-control', Math.PI), tunnel: centre('tunnel') }
  : { bridge: [1, 0, -140, 0], hangar: [3, -2, 0, Math.PI / 2], engineering: [3, 0, 134, Math.PI], mess: [2, 0, -70, -Math.PI / 2] };
if (q.get('at') === 'helm') {
  goDeck(BRIDGE_DECK, L.helm.at[0], L.version === 2 ? L.helm.at[1] : -144.6, 0);
  setMode('helm');
} else if (q.get('at') === 'fighter') {
  goDeck(HANGAR_DECK, ...(L.version === 2 ? AT.hangar.slice(1) : [-2, 0, Math.PI / 2]));
  boardFighter(1);
} else if (q.get('at') === 'gun' || q.get('at') === 'gun-ventral') {
  const t = guns.turrets[q.get('at') === 'gun' ? 0 : 1];
  goDeck(t.spec.from.deck, t.spec.from.at[0], t.spec.from.at[1], t.spec.from.yaw);
  manTurret(t);
} else if (AT[q.get('at')]) {
  goDeck(...AT[q.get('at')]);
  if (C.rooms.get('hangar')?.vacuum && q.get('at') === 'hangar') ship.don(); // the hangar is airless: start suited
}
if (q.get('view') === 'cutaway') setMode('cutaway');

const startEl = document.getElementById('c-start');
if (SHIP === 'carrier-v1') document.getElementById('c-about').textContent = 'The first carrier, kept for comparison: 400 m, three decks, and gravity only while her drive burns. You come aboard as the most junior hand on her, or roam free.';
const boardBtn = document.getElementById('c-board');
const againBtn = document.getElementById('c-again');
const saved = Career.saved(K);
if (saved?.i) {
  boardBtn.textContent = `Carry on as ${saved.rank.toLowerCase()}`;
  againBtn.hidden = false;
}
/** Off the start screen: into the career (fresh or carried on), or free roam. */
function go(how) {
  startEl.hidden = true;
  sfx.start(); // sound needs a click to start
  flightAudio.init();
  ambience.start();
  if (how === 'free') career.free();
  else {
    const at = career.begin(how === 'fresh');
    goDeck(at.deck, at.x, at.z, at.yaw, at.seg);
  }
  if (mode !== 'cutaway') input.lock();
}
boardBtn.addEventListener('click', () => go('carry-on'));
againBtn.addEventListener('click', () => go('fresh'));
document.getElementById('c-free').addEventListener('click', () => go('free'));
if (q.has('at') || q.has('view')) startEl.hidden = true;
// Started without the start screen (?at=, ?view=): sound starts with the first click or key.
const wake = () => {
  sfx.start();
  flightAudio.init();
  ambience.start();
};
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });

window.__carrier = {
  C, L, K, W, crew, routine, body, helm, thrusters, walker, renderer, camera, cut, fighter, dc, ship, guns, plant, helmSight, sfx, approach, cockpit, career, voices,
  gas, carrierGas, flightAudio, composer, bloom, ABOARD, ambience,
  mode: () => mode,
  tick: (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) tick(dt);
    return window.__carrier.info();
  },
  view: (v) => (helmView = v),
  /** Opens the bay doors at once (the doors normally take six seconds). */
  bayNow() {
    setBay(1);
    bayK = 1;
    C.bayDoor?.set(1);
    for (const p of C.bayPanels ?? []) p.position.y = p.userData.home + p.userData.travel;
  },
  setMode,
  /** Stands you at (x, z) on a deck (a drum deck's key and segment, drum.mjs), walking. */
  place(deck, x, z, yaw = walker.yaw, seg = 0) {
    setMode('walk');
    goDeck(deck, x, z, yaw, seg);
  },
  drum: () => drumNow && { half: drumNow.hid, deck: drumNow.did, seg: drumNow.seg, built: C.drums.built.size, ride },
  go(roomId) {
    const d = L.drum?.rooms.find((r) => r.id === roomId); // a drum room: stand in it
    if (d) {
      setMode('walk');
      enterDrum(d.half, d.deck, d.seg, (d.x[0] + d.x[1]) / 2, (d.z[0] + d.z[1]) / 2);
      return true;
    }
    const c = C.rooms.get(roomId);
    if (!c || c.access !== 'walk') return false;
    setMode('walk');
    goDeck(c.deck, (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, walker.yaw);
    return true;
  },
  /** Sets the ship's clock: `__carrier.time('17:55')` (today), or `time('06:00', 2)` (day 2). */
  time(hhmm, day = Math.floor(routine.t / 86400) + 1) {
    const [h, m] = hhmm.split(':').map(Number);
    routine.setTime((day - 1) * 86400 + h * 3600 + m * 60);
    return fmt(routine.t);
  },
  blenderHull,
  info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: +(avgDt * 1000).toFixed(1), mode, deck: drumNow ? `${drumNow.I.deck.id}:${drumNow.seg}` : deckNow, fighter: fighter.phase })
};

frame();
