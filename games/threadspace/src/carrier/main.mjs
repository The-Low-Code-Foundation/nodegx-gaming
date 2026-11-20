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
import { CarrierHud, KEYS } from './hud.mjs';
import { tickCrew } from './crew.mjs';
import { Hands } from './hands.mjs';
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
import { hubRing, hubPlace, hubBelow, wrap } from './hub.mjs';
import { box, at, mat } from '../util.mjs';
import { FrameBudget } from './budget.mjs';

// The spin-drum carrier (design/CARRIER-REBUILD.md). The first carrier (400 m, three decks, gravity only while her
// drive burns) is archived in archive/carrier-v1/, with how to bring it back; the code paths for a layout without drums
// or with a railgun are still here.
const L = await (await fetch('ships/carrier.layout.json')).json();
// The ship's career and routine (the rooms and the spots in them are hers).
const K = await (await fetch('ships/carrier.career.json')).json(); // your first week aboard (career.mjs)
const W = await (await fetch('ships/carrier.watches.json')).json(); // the ship's routine: clock, watches, muster (watch.mjs)
const q = new URLSearchParams(location.search);
if (L.weapons.railgun && !L.weapons.railgun.port) {
  // A ship with a railgun along her keel (the archived first carrier) aims it by turning the whole ship.
  document.getElementById('c-railkey')?.remove();
  KEYS.helm = KEYS.helm.replace(' · <b>railgun</b> Q', '');
  document.getElementById('c-arm').textContent = 'a railgun you aim by turning the whole ship';
  document.getElementById('c-armkey').textContent = 'railgun';
  KEYS.helm = KEYS.helm.replace('<b>broadside</b> click', '<b>railgun</b> click');
}

const canvas = document.getElementById('view');
const fadeEl = document.getElementById('fade');
// Depth over 0.2 m to 20 km: a reversed depth buffer where the browser has EXT_clip_control (it keeps the GPU's early
// depth test: a third of the frame aboard, measured), else a logarithmic one (`?depth=log` forces it).
const REV = new URLSearchParams(location.search).get('depth') !== 'log' && !!document.createElement('canvas').getContext('webgl2')?.getExtension('EXT_clip_control');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: !REV, reversedDepthBuffer: REV });
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
// What is outside the ship (design/CARRIER-POLISH.md, "Frame rate"): the station, the raider, the torpedoes and
// shells, the gas. With `C.exterior` (her hull and everything on it, gathered below) it is drawn only when you can see
// out: not from a drum, a lift, the hub, a ladder or a windowless room.
const world = new THREE.Group();
world.name = 'outside-world';
scene.add(world);
world.add(dock);

let mode = 'walk';
let helmView = 'bridge';
let deckNow = L.spawn.deck;
let drumNow = null; // the drum segment you stand in (the spin-drum carrier): { I, g, hid, did, seg }
let ride = null; // a lift car on its way up or down a spoke
let hubNow = null; // the hub ring you walk in (hub.mjs): { hub }
let swing = null; // between the spine and a hub ring: catching it ('catch') or pushing off it ('push')
let climb = null; // on a ladder between two decks, climbing (drawn, not a fade)
let catwalk = null; // on the hangar's catwalk (`C.catwalks`, sets.mjs): which length
let fading = false;
let bayK = 0, bayWant = 0;

const hooks = {
  ladder: (l, end) => {
    if (!ship.hatchOpen(l)) return dc.say(null, "The hatch won't open: the compartment on the other side has lost its air.");
    startClimb(l, end);
  },
  // The career keeps the helm and the fighters shut until you have earned them (career.mjs).
  helm: () => (career.allows('helm') ? setMode('helm') : career.refuse('helm')),
  bay: () => setBay(bayWant ? 0 : 1),
  fighter: (i) => (career.allows('fighters') ? fadeThen(() => boardFighter(i)) : career.refuse('fighters')),
  // A vac suit is put on, not carried (integrity.mjs `don`); the rest are kits you carry to a job (damage.mjs).
  kit: (k) => (L.damage.kits[k]?.worn ? ship.don() : dc.take(k)),
  // The drums (drum.mjs): a lift down a spoke from the spine, back up to the hub, the ladder between the decks.
  drum: (kind, a) => {
    if (kind === 'ladder') startDrumClimb(a);
    else if (kind === 'catch') startSwing('catch', hubRing(C, a.half));
    else if (hubNow) startRide(kind, a); // from the hub ring you step into the car
    else fadeThen(() => startRide(kind, a));
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
const blenderHull = q.get('hull') !== 'code' && (await loadHull(C)); // ?hull=code shows the lofted hull instead
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
const gas = new Gas(world, 2600);
const carrierGas = new Gas(world, 4000);
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
const seed = +q.get('seed') || undefined; // ?seed=N: repeatable runs (carrier.html, tools/carrier-check.mjs)
const dc = new DamageControl(C, { sfx, auto: false, voices, seed });
const autoRaids = q.get('dc') !== '0';
const ship = new Integrity(C, {
  dc, sfx, thrusters: thrusterList, auto: autoRaids, seed,
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
const guns = new Weapons(C, world, {
  ship, body, sfx, dc, seed,
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
    L.weapons.railgun && !guns.railSides
      ? ['Railgun', ship.power && !plant.hot ? 1 : 0.3, `${guns.rail.stock} slugs · ${guns.rail.charge >= 1 ? 'charged' : `${Math.round(guns.rail.charge * 100)}%`}`]
      : ['Broadside', Math.min(...['port', 'starboard'].map((k) => (guns.broadsideSide(k).fed ? 1 : 0.2))), ['port', 'starboard'].map((k) => `${k} ${guns.broad[k].stock}${guns.broad[k].t > 0 ? ' (reloading)' : ''}`).join(' · ')],
    ...(guns.railSides
      ? [['Railguns', Math.min(...guns.railSides.map((k) => { const r = guns.railSide(k, null); return r.ok ? (ship.power && !plant.hot ? 1 : 0.3) : 0.2; })), guns.railSides.map((k) => `${k} ${guns.rail[k].stock}${guns.rail[k].charge < 1 ? ` (${Math.round(guns.rail[k].charge * 100)}%)` : ''}`).join(' · ')]]
      : []),
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
// The off-watch hands in the drums (hands.mjs): in the rooms by the routine, at the lifts at the change of watch, up
// the spokes at action stations. Only round you, and only out of your sight.
const hands = C.drums && W.drum && q.get('crew') !== '0' ? new Hands(C, W.drum, { routine, ship, sfx, camera }) : null;

function manTurret(t) {
  guns.man(t);
  setMode('gun');
}
dc.onEnd = (job, ok) => {
  if (ok) ship.mended(job.room.id);
  career.jobEnded(job, ok);
};

const walker = new Walker(C.decks.get(deckNow));
// The hangar catwalk's rungs: up from the floor at each end of a length, and down again from its top.
for (const run of C.catwalks ?? []) {
  const I = C.decks.get(run.deck);
  for (const z of run.rungs) {
    I.use('catwalk-up', 'Climb the rungs to the catwalk', run.wall - 0.7, z, () => startRungs(run, z, true), { r: 1.8 });
    I.use('catwalk-down', 'Climb down to the hangar floor', run.wall - 0.7, z, () => startRungs(run, z, false), { r: 1.8, y: run.y + 1.2 });
  }
}
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
  else if (mode === 'walk' && code === 'KeyE' && (swing || climb)) return;
  else if (mode === 'walk' && code === 'KeyE') {
    const u = walker.nearestUse();
    if (u) u.use();
    else if (hubNow) startSwing('push', hubNow.hub); // nothing to use in the hub ring: push off up into the spine
  }
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
  else if (mode === 'helm' && code === 'KeyQ' && guns.railSides && !fading) {
    // The broadside railgun on the side facing the raider (weapons.mjs `railFire`).
    const why = guns.railFire();
    helmSight.say(why ? `Railgun: ${why}.` : 'RAILGUN: FIRE', why ? 2.5 : 1);
  }
};

/** Whether you can see out of the ship from where you are: from any seat but walking; walking, only from a room with
 *  windows, the open hangar and its airlock, or with the cutaway's view. Not from a drum, a lift, the hub or a ladder. */
function seesOut() {
  if (mode !== 'walk') return true;
  if (drumNow || hubNow || swing || climb || ride) return false;
  const r = roomAt(C, deckNow, walker.pos.x, walker.pos.z);
  return !r || !!(r.windows?.length || r.bay || r.vacuum || r.airlock);
}

/** Whether fixed deck `id` is drawn while you walk: the one you are on, out of a drum and a hub ring; while you drop
 *  through the spine's hatch it goes as you leave it, and pushing off the hub it comes as you reach it; climbing, the
 *  deck you are climbing to as well. */
function fixedShown(id) {
  if (drumNow) return false;
  if (climb?.kind === 'fixed' && id === climb.to.deck) return true;
  if (swing) return id === deckNow && (swing.kind === 'catch' ? swing.u === undefined || swing.u < 0.35 : swing.u > 0.6);
  return !hubNow && id === deckNow;
}

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
  leaveHub();
  catwalk = null;
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
  leaveHub();
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
  hands?.boardRide(ride); // at the change of watch, one or two ride with you
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
  hands?.endRide(ride, drumNow.I, ride.spot.landing);
  if (ride.dir === 'down') {
    ride.car.removeFromParent();
    const s = ride.spot.landing;
    ride = null;
    enterDrum(drumNow.hid, drumNow.did, drumNow.seg, s.x, s.z, Math.PI / 2);
    sfx.cue('servo', { dur: 1.2 });
  } else {
    // Up at the hub: the doors open on the hub ring (hub.mjs), facing into it.
    const hub = hubRing(C, ride.half), c = hub.cars.find((x) => x.seg === ride.seg && x.deck === ride.deck) ?? hub.cars[0];
    ride.car.removeFromParent();
    ride = null;
    enterHub(hub, c.s, c.out, c.yaw);
    sfx.cue('servo', { dur: 1.2 });
  }
}

// --- the hub rings (hub.mjs): catching one from the spine, walking it, pushing off it ---------------------------------

/** Stands you in `hub` at arc length `s`, `z` along the ship. */
function enterHub(hub, s, z, yaw = walker.yaw) {
  leaveHub();
  drumNow = null;
  hubNow = { hub };
  hub.node.visible = true;
  walker.interior = hub.I;
  walker.float = false;
  walker.pos.set(wrap(hub, s), -hub.R, z);
  walker.yaw = yaw;
  walker.speed = 2.2; // a tenth of a g: long, slow lopes
}

function leaveHub() {
  if (!hubNow) return;
  hubNow.hub.node.visible = false;
  hubNow = null;
  walker.speed = 4.6;
}

const _tgt = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

/** Between the spine and a hub ring, 1.4 s, the camera carried from where you are to where you will be. Catching: you
 *  drop through the hatch and grab the handhold passing under it, and are jerked up to the ring's speed. Pushing off:
 *  you float up through the seal and the ring turns away under you. */
function startSwing(kind, hub) {
  const sp = C.rooms.get('spine');
  swing = { kind, hub, t: 0, dur: 1.4, fromPos: camera.position.clone(), fromQuat: camera.quaternion.clone(), yaw: walker.yaw, sp };
  if (kind === 'catch') {
    swing.s = hubBelow(hub) + hub.dir * 0.4; // the handhold coming under you
    swing.z = Math.min(hub.z[1] - 2.6, Math.max(hub.z[0] + 2.6, walker.pos.z));
    hub.node.visible = true;
    sfx.cue('clunk', { vol: 0.4 });
  } else {
    swing.z = (hub.h.corridor[0] + hub.h.corridor[1]) / 2;
    sfx.cue('servo', { dur: 0.6 });
  }
}

function swingFrame(dt) {
  const w = swing, hub = w.hub;
  w.t += dt;
  const u = Math.min(1, w.t / w.dur), e = u * u * (3 - 2 * u);
  w.u = u;
  if (w.kind === 'catch') {
    // Where you will stand in the ring: the handhold you caught, carried round with it.
    drumCameraTo(hub, w.s, w.z);
  } else {
    // Where you will float in the spine, in the fixed hull.
    const I = C.decks.get(w.sp.deck);
    _tgt.position.set((w.sp.x[0] + w.sp.x[1]) / 2, I.floorY + 1.6, w.z);
    C.frame.localToWorld(_tgt.position);
    _tgt.quaternion.copy(C.obj.getWorldQuaternion(_q)).multiply(walker.quat(_q2));
  }
  camera.position.lerpVectors(w.fromPos, _tgt.position, e);
  camera.quaternion.slerpQuaternions(w.fromQuat, _tgt.quaternion, e);
  if (w.kind === 'catch' && u > 0.55 && u < 0.8) camera.rotateZ((Math.random() - 0.5) * 0.04); // the jerk as your arm takes it
  if (u < 1) return;
  swing = null;
  if (w.kind === 'catch') {
    enterHub(hub, w.s, w.z, w.yaw);
    hud.flash?.('Caught: you are turning with the hub ring');
  } else {
    hub.node.visible = false;
    goDeck(w.sp.deck, (w.sp.x[0] + w.sp.x[1]) / 2, w.z, walker.yaw);
    walker.vel.set(hub.dir * 1.2, 0, 0); // still carrying a little of the ring's way: you drift across the spine
  }
}

/** The camera's pose standing at (s, z) in a hub ring, into `_tgt`. */
function drumCameraTo(hub, s, z) {
  const g = hubPlace(hub, s);
  drumCamera(_tgt, g, 0, -hub.R, z, 1.6, 0, walker.quat(_q2));
}

// --- ladders, climbed: the camera goes up or down them (no fade) -------------------------------------------------------

/** Up or down a fixed-hull ladder `l` from its `end`: hand over hand through the trunk between the decks. Weightless
 *  (the spin-drum carrier's fixed hull) it is quick; the first carrier's decks have weight, so it is a climb. */
function startClimb(l, end) {
  const from = l[end], to = l[end === 'a' ? 'b' : 'a'];
  const I0 = C.decks.get(from.deck), I1 = C.decks.get(to.deck);
  const y0 = I0.floorY, y1 = I1.floorY, rise = Math.abs(y1 - y0);
  const yaw = from.yaw ?? 0, [x, z] = from.at;
  const trunk = ladderTrunk(Math.min(y0, y1), Math.max(y0, y1) + 3);
  trunk.position.set(x, 0, z);
  trunk.rotation.y = yaw;
  C.frame.add(trunk);
  const anchor = new THREE.Object3D();
  C.frame.add(anchor);
  const lamp = { anchor, color: new THREE.Color('#fff1d6'), intensity: 4, distance: 6, decay: 1.6 };
  const speed = SPIN ? 2.4 : 1.1; // m/s: hand over hand weightless, or a real climb
  climb = { kind: 'fixed', to, t: 0, dur: 0.5 + Math.min(3.5, rise / speed), // a long trunk goes quicker than life: no more than 4 s
     y0, y1, x0: walker.pos.x, z0: walker.pos.z, x: x + Math.sin(yaw) * 0.7, z: z + Math.cos(yaw) * 0.7, yaw, trunk, anchor, lit: { lights: [lamp] }, I1, lids: C.hatchLids?.get(l.id) ?? [] };
  for (const lid of climb.lids) lid.want = 1; // the hatches open (layout.mjs `hatches`), and shut behind you
  sfx.cue('clunk', { vol: 0.3 });
}

/** A ladder's trunk from `lo` to `hi` (its own frame: the ladder at the origin, climbed from +z): the walls round it,
 *  the rails and rungs all the way, and a glowing strip every 3 m. */
function ladderTrunk(lo, hi, [wlo, whi] = [lo, hi]) {
  const trunk = new THREE.Group(), wall = mat('#3a4048'), rail = mat('#8f7f4a');
  for (const [w, d, ox, oz] of [[0.08, 1.6, -0.8, 0], [0.08, 1.6, 0.8, 0], [1.6, 0.08, 0, -0.55], [1.6, 0.08, 0, 1.1]]) trunk.add(at(box(w, whi - wlo, d, wall), ox, (whi + wlo) / 2, oz));
  for (const sx of [-0.35, 0.35]) trunk.add(at(box(0.06, hi - lo, 0.06, rail), sx, (hi + lo) / 2, 0));
  for (let y = lo + 0.3; y < hi; y += 0.3) trunk.add(at(box(0.7, 0.04, 0.06, rail), 0, y, 0));
  for (let y = lo + 2; y < hi; y += 3) trunk.add(at(box(0.5, 0.05, 0.05, glow3('#fff1d6')), 0.75, y, 0.3));
  return trunk;
}

/** Up or down the rungs at `z`, between the hangar floor and the catwalk length `run`. */
function startRungs(run, z, up) {
  const floor = C.decks.get(run.deck).floorY, rise = run.y - floor;
  climb = { kind: 'rungs', run, up, t: 0, dur: 0.5 + rise / (SPIN ? 2.4 : 1.1), y0: walker.pos.y, y1: up ? run.y : floor,
    x0: walker.pos.x, z0: walker.pos.z, x: run.wall - 0.6, z, yaw: -Math.PI / 2 }; // face the wall and its rungs
  sfx.cue('clunk', { vol: 0.3 });
}

/** On the catwalk: kept on its floor, inside its rail and its ends. */
function catwalkFrame() {
  const r = catwalk;
  walker.pos.x = Math.min(r.x[1] - 0.3, Math.max(r.x[0] + 0.3, walker.pos.x));
  walker.pos.z = Math.min(r.z[1] - 0.3, Math.max(r.z[0] + 0.3, walker.pos.z));
  walker.pos.y = r.y;
}

/** Between a drum's two decks at a spoke's ladder: a real climb, three metres at nearly a g. */
function startDrumClimb(a) {
  const s = drumSpots(C, a.half).ladder, from = drumNow, other = drumDeck(C, a.half, a.deck);
  const target = drumWindow(C, a.half, a.deck, a.seg); // built; shown with the one you are on while you climb
  drumWindow(C, from.hid, from.did, from.seg);
  target.g.visible = true;
  // The trunk through the structure between the decks (walls only there, so it is not a black band as you pass it),
  // and the rungs all the way. The ladder is climbed from -z.
  const y0 = walker.pos.y, y1 = -other.dk.floorR, lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const lower = y0 < y1 ? drumDeck(C, from.hid, from.did).dk : other.dk;
  const trunk = ladderTrunk(lo + 0.3, hi - 0.05, [lo + lower.h - 0.1, hi + 0.1]);
  trunk.position.set(s.x, 0, s.z);
  trunk.rotation.y = Math.PI;
  from.g.add(trunk);
  climb = { kind: 'drum', a, from, target, trunk, t: 0, dur: 3.2, y0: walker.pos.y, y1: -other.dk.floorR, x0: walker.pos.x, z0: walker.pos.z, x: s.x, z: s.z - 0.7, yaw: Math.PI, // the ladder is against the aft wall: face it
    lids: C.drumLids?.get(`${a.half}|${a.seg}`) ?? [] };
  for (const lid of climb.lids) lid.want = 1; // both decks' hatches open (drum.mjs `spokeFoot`), and shut behind you
  sfx.cue('clunk', { vol: 0.3 });
}

function climbFrame(dt) {
  const c = climb;
  c.t += dt;
  const u = Math.min(1, c.t / c.dur);
  // Onto the ladder in the first 0.4 s, then up or down it, a pull at a time.
  const k = Math.min(1, c.t / 0.4), m = Math.max(0, (c.t - 0.4) / (c.dur - 0.4));
  walker.pos.x = c.x0 + (c.x - c.x0) * k;
  walker.pos.z = c.z0 + (c.z - c.z0) * k;
  const pulls = Math.abs(c.y1 - c.y0) / 0.6;
  const e = m - Math.sin(m * pulls * 2 * Math.PI) / (pulls * 2 * Math.PI); // each pull quick, then a pause
  walker.pos.y = c.y0 + (c.y1 - c.y0) * Math.min(1, Math.max(0, e));
  let d = c.yaw - walker.yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  walker.yaw += d * Math.min(1, dt * 6);
  // Look the way you climb, up or down the ladder, and level again as you step off.
  const look = (c.y1 > c.y0 ? 0.55 : -0.55) * Math.sin(Math.PI * Math.min(1, u * 1.1));
  walker.pitch += (look - walker.pitch) * Math.min(1, dt * 4);
  walker.bob = 0;
  if (c.anchor) c.anchor.position.set(walker.pos.x, walker.pos.y + 2.2, walker.pos.z);
  if (u < 1) return;
  climb = null;
  if (c.kind === 'rungs') {
    // Off the top, a step along the catwalk from the gap; off the bottom, a step back from the wall.
    const r = c.run, inward = c.z < (r.z[0] + r.z[1]) / 2 ? 1 : -1;
    catwalk = c.up ? r : null;
    walker.pos.set(c.up ? r.wall - 0.7 : r.wall - 1.3, c.y1, c.up ? c.z + inward * 1.1 : c.z);
  } else if (c.kind === 'fixed') {
    c.trunk.removeFromParent();
    c.anchor.removeFromParent();
    for (const lid of c.lids) lid.want = 0;
    const off = c.to.at;
    goDeck(c.to.deck, off[0] + Math.sin(c.yaw) * 0.9, off[1] + Math.cos(c.yaw) * 0.9, walker.yaw);
  } else {
    c.trunk.removeFromParent();
    for (const lid of c.lids) lid.want = 0;
    const s = drumSpots(C, c.a.half).ladder;
    enterDrum(c.a.half, c.a.deck, c.a.seg, s.x, s.z - 1.1, walker.yaw);
  }
}
const glow3 = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });

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
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
let last = performance.now(), time = 0, avgDt = 1 / 60, saveT = 15;
let burnTilt = 0, burnCallT = 0, burning = false;
// Feeling the drive on the spin-drum carrier (design/CARRIER-POLISH.md): the stand-by before a burn from cold (`warn`:
// seconds into the countdown, `cold`: seconds since the drive last burned), the lurch at the helm, and where you were
// last frame (for the Coriolis nudge walking round a drum).
const SPIN = !!L.drum, WARN = 3, COLD = 20;
const drive = { cold: COLD + 1, warn: 0, lurch: 0 };
let lastX = null;
helmSight.lightDelay = () => (SPIN && drive.cold > COLD ? WARN : 0);

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
const budget = new FrameBudget(renderer, composer, bloom, resize, { fixed: +q.get('pr') || null });

function frame() {
  const now = performance.now();
  budget.frame((now - last) / 1000);
  tick(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

/** One step of everything, then a render. The page calls it every animation frame; `__carrier.tick()` can call it by
 *  hand (a hidden tab gets no animation frames). */
const ambLast = {}; // where you were last frame: your boots in the suit's room tone (ambience.mjs)
function tick(dt) {
  time += dt;
  avgDt += (dt - avgDt) * 0.05;
  const f = input.frame();

  // Weightless rooms (`float` in the layout: the spin-drum carrier's spine, crew tunnel and trunks): hand over hand.
  if (mode === 'walk') walker.float = !drumNow && !hubNow && !climb && !!roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.float;
  if (mode === 'walk') walker.frame(f, dt, { canMove: !fading && !routine.billOpen && !ride && !swing && !climb });
  if (mode === 'walk' && drumNow && !ride && !climb) drumStep();
  if (hubNow) walker.pos.x = wrap(hubNow.hub, walker.pos.x);
  if (ride) rideFrame(dt);
  if (climb) climbFrame(dt);
  if (catwalk && mode === 'walk' && !climb) catwalkFrame();
  // From cold the main drive is held until the stand-by has been called and counted down (the spin-drum carrier).
  const held = SPIN && drive.cold > COLD && drive.warn < WARN;
  if (held) for (const t of thrusterList) if (t.kind === 'main') t.health = 0;
  helm.frame(mode === 'helm' ? f : IDLE, dt, mode === 'helm');
  if (held && helm.u[2] < -0.05) {
    if (drive.warn === 0) dc.say('Stand by for main drive. All hands, take hold.', `Stand by for main drive: lighting in ${WARN} s. In the weightless spaces, take hold.`, 0, 4);
    drive.warn += dt;
    if (mode === 'helm') helmSight.say(`MAIN DRIVE LIGHTING · ${Math.max(1, Math.ceil(WARN - drive.warn))}`, 0.25);
  } else if (held) drive.warn = 0; // let go of it before it lit: called off
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
  // A click at the helm: the railgun (the first carrier), or the broadside that bears (the spin-drum carrier, which has
  // no spinal gun). With you at the helm, the CIC leaves the broadside to you.
  guns.helmFires = mode === 'helm';
  if (mode === 'helm' && f.clicked && !fading) {
    const spinal = L.weapons.railgun && !guns.railSides;
    const why = spinal ? guns.railFire() : guns.broadsideFire();
    if (why) helmSight.say(`${spinal ? 'Railgun' : 'Broadside'}: ${why}.`, 2.5);
  }
  // The ladders' hatch lids (layout.mjs `hatches`): open in a third of a second, shut in half.
  for (const lid of C.lids ?? []) {
    if (lid.k === lid.want) continue;
    lid.k = lid.want > lid.k ? Math.min(1, lid.k + dt / 0.35) : Math.max(0, lid.k - dt / 0.5);
    lid.mesh.position.copy(lid.home).addScaledVector(lid.travel, lid.k);
  }
  // The boarding tubes (layout.mjs `boardingTubes`): yours telescopes up to the roof once her drive is up, and comes
  // down again when she is back on her pad and you are out of her.
  for (const [i, b] of (C.boardTubes ?? []).entries()) {
    if (!b) continue;
    const want = i === fighter.index && (fighter.phase !== 'seated' || fighter.flight.online) ? 1 : 0;
    if (b.k === want) continue;
    b.k = want > b.k ? Math.min(1, b.k + dt / 2) : Math.max(0, b.k - dt / 2);
    b.t.scale.y = 1 - 0.88 * b.k;
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
    I.group.visible = mode === 'cutaway' || (mode === 'walk' && fixedShown(id)) || (mode === 'helm' && helmView === 'bridge' && id === BRIDGE_DECK) || (mode === 'fighter' && id === HANGAR_DECK);
  }
  // Only what you can see from here: the outside when you can see out, the machinery behind the fixed hull's windows
  // only from the fixed hull.
  const out = seesOut();
  C.exterior.visible = out;
  world.visible = out;
  C.machinery.visible = (mode !== 'helm' || helmView === 'bridge') && !(mode === 'walk' && (drumNow || hubNow || swing || ride));
  // The drums: their blocks through the cutaway, their outside through the sleeve's open ends when you can see out,
  // and the segments round you while you walk in one.
  if (C.drums) {
    C.drums.group.visible = mode === 'cutaway' || out || (mode === 'walk' && !!(drumNow || hubNow || swing)); // `out`: through the sleeve's open ends
    for (const h of C.drums.halves) (h.blocks.visible = mode === 'cutaway'), (h.segs.visible = mode === 'walk' && !!drumNow), (h.outside.visible = out && mode !== 'cutaway');
  }
  drumsFrame(C, dt);
  // A drum deck is drawn while you walk in it (and only the segments round you: the rest are hidden, and so is whoever
  // stands in them).
  const drawnDeck = (d) => (C.isDrum(d) ? mode === 'walk' && drumNow?.I.deck.id === d : C.decks.get(d).group.visible);
  tickCrew(crew, dt, drawnDeck);
  if (hands) tickCrew(hands.crew, dt, drawnDeck);
  career.tickPeople(dt, (p) => drawnDeck(p.deck) && (!C.isDrum(p.deck) || p.I.group.visible));

  // The main drive's push (m/s²), for the tilt you feel aboard and the call when she starts a burn.
  let push = 0;
  for (const t of thrusterList) if (t.kind === 'main') push += t.force * t.throttle * (t.health ?? 1);
  push /= body.mass;
  burnTilt += (Math.atan(push / 9.81) - burnTilt) * Math.min(1, dt * 1.5);
  burnCallT -= dt;
  if (push > 0.6 && !burning && burnCallT <= 0) {
    burnCallT = 40;
    if (SPIN) dc.say('Main drive burning. Weightless spaces, hold on.', `Main drive burning: ${(push / 9.81).toFixed(2)} g toward the stern. In the spine and the tunnel you go aft unless you hold on.`, 0, 5);
    else dc.say('Main drive burning. Hold on to something.', `Main drive burning: ${(push / 9.81).toFixed(2)} g toward the stern.`, 0, 4);
  }
  if (push > 0.3 && !burning) drive.lurch = 1; // lighting: a shove back into the seat
  drive.lurch = Math.max(0, drive.lurch - dt / 1.6);
  burning = push > 0.3 ? true : push < 0.1 ? false : burning;
  if (push > 0.05) (drive.cold = 0), (drive.warn = 0);
  else drive.cold += dt;
  // What the drive's push does to you (the spin-drum carrier; the first carrier keeps its tilt, below). It carries you
  // aft along the floor: walking toward the bow is slower, floating you go aft until you hold on.
  walker.shove.set(0, 0, SPIN && mode === 'walk' ? push : 0);
  // Walking round a drum, spinward you are heavier and antispinward lighter (2ωv against the spin's ω²r): a nudge.
  if (SPIN && mode === 'walk' && hubNow && dt > 0) {
    // In the hub ring Coriolis is strong (2ωv against a tenth of a g): spinward you are much heavier.
    const hub = hubNow.hub, vx = lastX?.hub === hub ? (walker.pos.x - lastX.x) / dt : 0;
    walker.heavy = 0.35 * (1 + Math.max(-0.6, Math.min(0.6, (2 * vx * hub.dir) / (hub.omega * hub.R))));
  } else if (SPIN && mode === 'walk' && drumNow && !ride && dt > 0) {
    const { dk, h } = drumDeck(C, drumNow.hid, drumNow.did), omega = (h.rpm * 2 * Math.PI) / 60;
    const vx = lastX?.seg === drumNow.seg ? (walker.pos.x - lastX.x) / dt : 0;
    walker.heavy = 1 + Math.max(-0.2, Math.min(0.2, (2 * vx * h.dir) / (omega * dk.floorR)));
  } else walker.heavy = 1;
  lastX = drumNow ? { x: walker.pos.x, seg: drumNow.seg } : hubNow ? { x: walker.pos.x, hub: hubNow.hub } : null;

  if (mode === 'walk' && swing) {
    swingFrame(dt);
    hud.where(swing ? (swing.kind === 'catch' ? `Catching the ${swing.hub.h.name.toLowerCase()}'s hub ring` : 'Pushing off up into the spine') : '');
    hud.use(null);
  } else if (mode === 'walk' && hubNow) {
    const hub = hubNow.hub, eyeH = walker.eye(_v).y - walker.pos.y;
    drumCamera(camera, hubPlace(hub, walker.pos.x), 0, walker.pos.y, walker.pos.z, eyeH, 0, walker.quat(_q));
    const tilt = Math.min(0.5, Math.atan(push / (hub.g * 9.81)));
    if (tilt > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(hub.you.getWorldQuaternion(_q2)), -tilt));
    hud.where(`${hub.h.name}, hub ring · ${hub.g.toFixed(2)} g · the floor turns round the spine at ${(hub.omega * hub.R).toFixed(1)} m/s${push > 0.3 ? ' · drive burning: down leans hard aft' : ''}`);
    const u = fading ? null : walker.nearestUse();
    hud.use(u ?? (fading ? null : { key: 'E', label: 'Push off up through the seal into the spine' }));
  } else if (mode === 'walk' && drumNow) {
    const { dk, h } = drumDeck(C, drumNow.hid, drumNow.did);
    if (ride) drumCamera(camera, drumNow.g, ride.spot.lift.x, -ride.r, ride.spot.lift.z, 1.6, ride.lean, walker.quat(_q));
    else placeInDrum(C, camera, walker, drumNow);
    // Under the main drive, down leans aft by atan(drive / spin g): about 8° on a deck at full drive, far more in a lift
    // near the hub, where the spin's pull is weak. The deck seems to slope up toward the bow.
    const gs = 9.81 * (ride ? (ride.omega * ride.omega * ride.r) / 9.81 : dk.g);
    const tilt = Math.min(0.5, Math.atan(push / Math.max(0.5, gs)));
    if (tilt > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(drumNow.g.getWorldQuaternion(_q2)), -tilt));
    const r = drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z);
    const g = ride ? (ride.omega * ride.omega * ride.r) / 9.81 : dk.g;
    hud.where(climb
      ? `Climbing the ladder ${climb.y1 > climb.y0 ? 'up' : 'down'} to the ${drumDeck(C, climb.a.half, climb.a.deck).dk.name.toLowerCase()}`
      : ride
      ? `In a lift, ${ride.dir === 'down' ? 'down to' : 'up from'} the ${h.name.toLowerCase()}, ${dk.name.toLowerCase()} · ${Math.round(ride.r)} m from the axis · ${g.toFixed(2)} g${Math.abs(ride.lean) > 0.05 ? ' · the car leans on its rails' : ''}`
      : `${h.name}, ${dk.name.toLowerCase()} · ${r.system === 'corridor' ? 'ring corridor' : r.name} · segment ${drumNow.seg} of ${L.drum.sides} · ${g.toFixed(2)} g${push > 0.3 ? ` · drive burning: down leans ${Math.round((tilt * 180) / Math.PI)}° aft` : ''}`);
    hud.use(fading || ride || climb ? null : walker.nearestUse());
    drumNow.I.tick(dt);
  } else if (mode === 'walk') {
    walker.placeCamera(camera, C.frame);
    // Under the main drive the plating holds you to the deck, but the push still comes through it: what you feel as
    // down leans toward the stern, so the decks seem to slope up toward the bow (the first carrier, whose decks have a
    // weight of their own in the game). The spin-drum carrier's fixed hull is weightless: grip shoes hold your feet and
    // the push is the only weight there is, so you brace into it, a lean of a few degrees, not a slope.
    const lean = SPIN ? burnTilt * 0.35 : burnTilt;
    if (lean > 0.002) camera.quaternion.premultiply(_q.setFromAxisAngle(_v.set(1, 0, 0).applyQuaternion(C.obj.quaternion), -lean));
    const I = C.decks.get(deckNow);
    const r = roomAt(C, deckNow, walker.pos.x, walker.pos.z);
    if (climb?.kind === 'rungs') hud.where(`Climbing the rungs ${climb.up ? 'up to the catwalk' : 'down to the hangar floor'}`);
    else if (climb?.kind === 'fixed') hud.where(`Climbing ${climb.y1 > climb.y0 ? 'up' : 'down'} to the ${C.decks.get(climb.to.deck).deck.name.toLowerCase()}${SPIN ? ', hand over hand' : ''}`);
    else hud.where(`${I.deck.name}${r ? ' · ' + r.name : ''}${catwalk ? ', on the catwalk' : ''}${r?.float ? ' · weightless (W pulls you along, Shift kicks off)' : ''} · frame ${frameOf(L, walker.pos.z)}, ${sideOf(walker.pos.x)}${push > 0.3 ? ` · drive burning, ${(push / 9.81).toFixed(2)} g aft${SPIN && r?.float ? ': hold on (W)' : ''}` : ''}`);
    hud.use(fading || climb ? null : walker.nearestUse());
    C.decks.get(deckNow).tick(dt);
  } else if (mode === 'helm') {
    const hurt = (ship.power ? '' : ' · emergency power') + (ship.driveFactor < 0.99 ? ` · main drive ${Math.round(ship.driveFactor * 100)}%` : '') + (plant.hot ? ' · HEAT: drive held back' : plant.prop <= 0 ? ' · no reaction mass' : '');
    hud.where(`At the helm · ${helmView === 'bridge' ? 'bridge view' : 'outside view'}${hurt}`);
    hud.use(null);
    hud.helm(helm);
    if (helmView === 'bridge') {
      camera.position.set(...L.helm.eye);
      camera.position.z += drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.05; // pressed back into the seat as she lights
      C.frame.localToWorld(camera.position);
      camera.quaternion.copy(C.obj.getWorldQuaternion(_q));
      if (drive.lurch > 0) camera.rotateX(drive.lurch * Math.sin(drive.lurch * Math.PI) * 0.025);
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
  const roomNow = mode !== 'walk' || hubNow || swing ? null : drumNow ? (ride ? null : drumRoomAt(C, drumNow.hid, drumNow.did, drumNow.seg, walker.pos.x, walker.pos.z)?.id) : roomAt(C, deckNow, walker.pos.x, walker.pos.z)?.id;
  const placeNow = drumNow ? drumNow.I.deck.id : hubNow ? hubNow.hub.I.deck.id : deckNow; // the deck you are on, a drum deck's key in a drum
  const hearRoom = roomNow ?? (mode === 'helm' ? 'bridge' : null);
  ambience.frame(dt, {
    room: hearRoom ? C.rooms.get(hearRoom) : null, air: hearRoom ? ship.airOf(hearRoom) / L.integrity.air.nominal : 1, power: ship.power,
    drive: Math.min(1, push / 15), inside: mode !== 'fighter' && mode !== 'cutaway',
    suit: mode === 'walk' && ship.helmet, moved: mode === 'walk' ? Math.min(0.5, Math.hypot(walker.pos.x - (ambLast.x ?? walker.pos.x), walker.pos.z - (ambLast.z ?? walker.pos.z))) : 0 // the suit's room tone (ambience.mjs); a jump is not a step
  });
  ambLast.x = walker.pos.x;
  ambLast.z = walker.pos.z;
  routine.rankName = career.on ? career.rank : null;
  routine.frame(dt, { mode, deck: placeNow, seg: drumNow?.seg, room: roomNow, x: walker.pos.x, z: walker.pos.z });
  hands?.frame(dt, { mode, drum: drumNow, ride, room: roomNow, x: walker.pos.x, z: walker.pos.z });
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
  const lit = [...C.decks.values()].filter((I) => I.group.visible).concat(mode === 'walk' && drumNow ? C.drums.shown : [], mode === 'walk' && (hubNow || swing) ? [(hubNow?.hub ?? swing.hub).lit] : [], climb?.lit ? [climb.lit] : []);
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
  C, L, K, W, crew, routine, hands, body, helm, thrusters, walker, renderer, camera, cut, fighter, dc, ship, guns, plant, helmSight, sfx, approach, cockpit, career, voices,
  gas, carrierGas, flightAudio, composer, bloom, ABOARD, ambience, input,
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
  budget,
  info: () => ({ pr: budget.pr, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: +(avgDt * 1000).toFixed(1), mode, deck: drumNow ? `${drumNow.I.deck.id}:${drumNow.seg}` : deckNow, fighter: fighter.phase })
};

// The ship's outside: everything on her frame but the decks, the drums, the machinery (seen through windows) and the
// cutaway's overlay. Gathered once all of it is built; things added to the frame later (a ladder's trunk) stay out.
C.exterior = new THREE.Group();
C.exterior.name = 'exterior';
for (const o of [...C.frame.children]) if (![C.machinery, C.overlay, C.drums?.group, ...[...C.decks.values()].map((I) => I.group)].includes(o)) C.exterior.add(o);
C.frame.add(C.exterior);

// ?hold=1: no frames until a script steps them with `__carrier.tick()` (tools/carrier-check.mjs).
if (q.get('hold') !== '1') frame();
