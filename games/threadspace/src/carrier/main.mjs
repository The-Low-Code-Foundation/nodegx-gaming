// The carrier prototype (carrier.html): a ship you walk around inside, fly from her bridge with real inertia, and
// look into through a cutaway, and a fighter you launch from her hangar (fighter.mjs). Five seats, each a module in
// seats/: walking (first person, walk.mjs), the helm (helm.mjs), the fighter (fighter.mjs), a gun turret (gun.mjs,
// weapons.mjs), and the cutaway (cutaway.mjs). This file makes everything, wires it up, and runs the frame (`tick`).
//
// The ship keeps flying whatever seat you are in: walk away from the helm with her turning and she goes on turning
// (with flight assist on, the helm's assist brings her to rest on her own). Inside, you never feel it: the decks are
// in her frame (layout.mjs), and the world goes past the windows and the open bay.
//
// How the systems talk: what happened goes on the ship's bus (`C.bus`, src/core/events.mjs); what a use of something
// asks for (a ladder, the helm, a hatch) goes through `hooks`, below. `G` is the game in hand, which the seats read.
//
//   ?ship=<id>   the ship to run: the folder ships/<id>/ (default `carrier`). Everything on the page comes from it, and
//   each system runs by what her layout has (no drums, no hangar, no fighters, no career: see "what she has", below)
//   ?host=<id>   a second ship built beside her, 400 m off the port beam, seen from outside only (no systems)
//   ?at=bridge|helm|hangar|engineering|mess|fighter|gun|gun-ventral   start there   ?view=cutaway   start in the cutaway
//   ?debug=1   T in a fighter refills her tanks anywhere (normally they are topped up on the pad after a landing)
//   ?seed=N&hold=1   repeatable runs for tools/carrier-check.mjs (no frames until a script steps them)
//   __carrier in the console: the ship, the helm, the walker, the fighter, go(roomId), info() (draw calls, triangles,
//   frame time)

import * as THREE from 'three';
import { Input } from '../input.mjs';
import { Walker } from '../controllers/walk.mjs';
import { station } from '../scenery.mjs';
import { buildCarrier, loadHull, machineryFrame } from './layout.mjs';
import { drumsFrame } from './drum.mjs';
import { setsFrame, lookOf } from './sets.mjs';
import { Ambience } from './ambience.mjs';
import { Rigid, Thrusters, Helm, thrustersFromLayout, buildThrusterMeshes, updatePlumes } from './newton.mjs';
import { Cutaway } from './cutaway.mjs';
import { CarrierHud, KEYS } from './hud.mjs';
import { tickCrew } from './crew.mjs';
import { crewBrace, crewJolt } from './floating.mjs';
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
import { Feel } from './gunfeel.mjs';
import { Gas } from './gas.mjs';
import { Blazes } from './blaze.mjs';
import { FlightAudio } from './flight-audio.mjs';
import { Career } from './career.mjs';
import { Routine, NoRoutine, fmt } from './watch.mjs';
import { Voices } from './voice.mjs';
import { Bus } from '../core/events.mjs';
import { View } from './render.mjs';
import { Drive } from './drive.mjs';
import { Doors } from './doors.mjs';
import { Berth, standIn } from './berth.mjs';
import { Berths, berthKey } from './berths.mjs';
import { setShip, goAboard } from '../core/voyage.mjs';
import { Collisions } from './collide.mjs';
import { FighterDamage } from './fighter-damage.mjs';
import { Repairs } from './fighter-repair.mjs';
import { CarrierDamage } from './carrier-damage.mjs';
import { HullRepair } from './carrier-repair.mjs';
import { Rescue } from './rescue.mjs';
import { loadLayout, fetchJson } from '../core/ship.mjs';
import { loadPeople, peopleNamed, joinPeople } from '../core/people.mjs';
import { Announcer, loadCalls, DEPTS } from '../core/announcer.mjs';
import { WalkSeat } from './seats/walk.mjs';
import { Floater } from './weightless.mjs';
import { HelmSeat } from './seats/helm.mjs';
import { FighterSeat } from './seats/fighter.mjs';
import { GunSeat } from './seats/gun.mjs';
import { CutawaySeat } from './seats/cutaway.mjs';

// The spin-drum carrier (design/CARRIER-REBUILD.md). The first carrier (400 m, three decks, gravity only while her
// drive burns) is archived in archive/carrier-v1/, with how to bring it back; the code paths for a layout without drums
// or with a railgun are still here.
// A ship is a folder (src/core/ship.mjs): her layout in parts, joined here, and beside it her career and routine (the
// rooms and the spots in them are hers).
const q = new URLSearchParams(location.search);
const idOf = (v, d = null) => (/^[a-z0-9-]+$/.test(v ?? '') ? v : d);
const SHIP_ID = idOf(q.get('ship'), 'carrier');
const SHIP = `ships/${SHIP_ID}`;
const L = await loadLayout(SHIP, fetchJson);
// A ship may have none of these three (the cutter has none): `null`, and what reads them is made without them, below.
const optional = (f) => fetchJson(`${SHIP}/${f}`).catch(() => null);
const K = await optional('career.json'); // your first week aboard (career.mjs); without it she is free roam only
const W = await optional('watches.json'); // the ship's routine: clock, watches, muster (watch.mjs)
// The officers and leading hands are people (content/people/): the ship's files say where they stand, and their own
// files who they are.
joinPeople(K ?? {}, W ?? {}, await loadPeople(peopleNamed(K ?? {}, W ?? {}), fetchJson));
// The ship's calls (content/announcements/, src/core/announcer.mjs), who speaks for her (voices.json), and the people
// who speak on her broadcast without standing a post (the captain, the engineer officer, the medical officer).
// Without one, the two voices that are not people (the ship's automated voice and the bridge's talker) keep their
// names for the subtitles, and no department has a net of its own.
const V = (await optional('voices.json')) ?? { speakers: { ship: { label: 'Bridge', tannoy: true }, ai: { label: 'Ship', tannoy: true } }, nets: {} };
const CALLS = await loadCalls(fetchJson);
const callers = await loadPeople([...new Set([...CALLS.values()].map((a) => a.who))].filter((id) => !V.speakers[id]), fetchJson);
// What she has. Each system below is made, or left out, by these: never by the ship's name.
const HAS = {
  drums: !!L.drum,
  fighters: !!(L.fighter && L.fighters?.length), // a hangar's fighters, and all that flies and mends them
  broadside: !!L.weapons.broadside,
  railguns: !!L.weapons.railgun?.port,
  spinal: !!(L.weapons.railgun && !L.weapons.railgun.port),
  career: !!K,
  routine: !!W
};
// The room the helm is in: the layout's `helm.room`, or the carrier's bridge.
const HELM_ROOM = L.helm.room ?? 'bridge';
if (HAS.spinal) {
  // A ship with a railgun along her keel (the archived first carrier) aims it by turning the whole ship.
  document.getElementById('c-railkey')?.remove();
  KEYS.helm = KEYS.helm.replace(' · <b>railgun</b> Q', '');
  document.getElementById('c-arm').textContent = 'a railgun you aim by turning the whole ship';
  document.getElementById('c-armkey').textContent = 'railgun';
  KEYS.helm = KEYS.helm.replace('<b>broadside</b> click', '<b>railgun</b> click');
}
// The page's words for what she lacks: the keys line, and the start screen (its drums, fighters and career).
if (!HAS.railguns) KEYS.helm = KEYS.helm.replace(' · <b>railgun</b> Q', '');
if (!HAS.broadside && !HAS.spinal) KEYS.helm = KEYS.helm.replace(' · <b>broadside</b> click', '');
if (!HAS.routine) for (const k of ['walk', 'float']) KEYS[k] = KEYS[k].replace(' · <b>watch bill</b> B', '');
if (!HAS.railguns) document.getElementById('c-railkey')?.remove();
if (!HAS.broadside && !HAS.spinal) {
  document.getElementById('c-armclick')?.remove();
  document.getElementById('c-arm').textContent = 'a turret and torpedo tubes';
}
for (const el of document.querySelectorAll('[data-has]')) if (!el.dataset.has.split(' ').every((k) => HAS[k])) el.remove();
for (const el of document.querySelectorAll('[data-lacks]')) if (el.dataset.lacks.split(' ').some((k) => HAS[k])) el.remove();
if (q.has('ship')) {
  // Another ship than the page's own: her name on the start screen and the tab.
  document.getElementById('c-name').textContent = L.name.toUpperCase();
  document.title = `ThreadSpace ${L.name}`;
}

const canvas = document.getElementById('view');
const fadeEl = document.getElementById('fade');
const view = new View(canvas, q);
const { renderer, scene, camera, composer, bloom, lightPool, hemi, space, ABOARD, budget } = view;

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
let modeBefore = 'walk';
let fading = false;
/** The game in hand: what the seats (seats/) and the drive read. Filled in as things are made. */
const G = { L, q, camera, SPIN: !!L.drum, mode: () => mode, setMode, fadeThen, get fading() { return fading; } };

// What the layout's uses ask for (layout.mjs, drum.mjs, hub.mjs): E on a ladder, the helm, the bay switch, a fighter,
// a kit locker, the drums' lifts and ladders.
const hooks = {
  ladder: (l, end) => walk.ladder(l, end),
  // The career keeps the helm and the fighters shut until you have earned them (career.mjs).
  helm: () => (career.allows('helm') ? setMode('helm') : career.refuse('helm')),
  bay: () => doors.setBay(doors.want ? 0 : 1),
  fighter: (i) => (career.allows('fighters') ? fadeThen(() => fighterSeat.board(i)) : career.refuse('fighters')),
  // Suit bottles go into your suit, not your hands (integrity.mjs `don`); the rest are kits you carry to a job (damage.mjs).
  kit: (k) => (L.damage.kits[k]?.worn ? ship.don() : dc.take(k)),
  drum: (kind, a) => walk.drum(kind, a),
  // The lockers by each drum's lift (drum.mjs `suitLockers`): into or out of your duty suit.
  change: () => ship.change(),
  suited: () => ship.suit
};

const C = buildCarrier(L, hooks);
C.bus = new Bus(); // what the systems say to each other (src/core/events.mjs)
scene.add(C.obj);
const thrusterList = thrustersFromLayout(L);
buildThrusterMeshes(C.frame, thrusterList);
// Her hull as built in Blender, assets/<ship id>/hull.glb; with no file (or ?hull=code) the lofted hull shows.
const blenderHull = q.get('hull') !== 'code' && (await loadHull(C, `assets/${SHIP_ID}/hull.glb`));
// The fighters as built in Blender (fighter-model.mjs), with their cockpits; ?fighter=code keeps the code-built Wrens.
const blenderFighters = HAS.fighters && q.get('fighter') !== 'code' && (await loadFighterModel());
if (blenderFighters) swapFighters(C);
// Her inertia as a box the size of her hull.
const body = new Rigid({ mass: L.mass, size: [Math.max(...L.hull.main.map((s) => s.w)), Math.max(...L.hull.main.map((s) => s.h)), L.length] });
const deckOf = (id) => C.rooms.get(id)?.deck;
const BRIDGE_DECK = deckOf(HELM_ROOM), HANGAR_DECK = deckOf('hangar');
const thrusters = new Thrusters(thrusterList, body);
const helm = new Helm(C.obj, body, thrusters);
const doors = new Doors(C); // the bay doors, the hatch lids
// Gas in vacuum (gas.mjs): what the fighter's drive and jets throw out, and the carrier's own, each in its own pool.
const gas = new Gas(world, 2600);
const carrierGas = new Gas(world, 4000);
// Fire, smoke, sparks and spray (blaze.mjs): damage's particles, one pool per frame they are drawn in (hitfx.mjs).
const blazes = (C.blazes = new Blazes(C));
// The fighter's sound: live DSP worklets fed from her flight (flight-audio.mjs), on the page's AudioContext.
const sfx = new Sfx();
const flightAudio = new FlightAudio(sfx);
const ambience = new Ambience(sfx); // the ship's own sound: air, hum, rumble, the hull creaking (ambience.mjs)
// The fighter you fly, the lane she lands down and her cockpit: only a ship with fighters in a hangar has them
// (`fighter` is null without, and so is everything made for her below: her damage, the rescue craft, the repairs, her
// seat, the collisions).
const fighter = HAS.fighters ? new Fighter(C, scene, { gas, audio: flightAudio, debug: q.get('debug') === '1' }) : null;
const approach = fighter && new Approach(C); // the lane of rings you fly back aboard down
const cockpit = fighter && new Cockpit(document.getElementById('c-fhud'));

// Damage control: fires, faults and leaks called out over the speakers (damage.mjs), started by hits. The ship's
// integrity (integrity.mjs): each compartment's air and health, the raids whose shells hole her, the pressure doors and
// the repair drones. ?dc=0 means no raids (a drill can still be called from the damage control centre); ?voice=0 keeps
// everyone quiet: the speakers keep to alarms, and nobody speaks.
// The voices (voice.mjs): recorded clips (assets/voice/); a line with none is not spoken.
const voices = new Voices({ on: q.get('voice') !== '0' });
const seed = +q.get('seed') || undefined; // ?seed=N: repeatable runs (carrier.html, tools/carrier-check.mjs)
const dc = new DamageControl(C, { sfx, auto: false, seed });
const autoRaids = q.get('dc') !== '0';
const ship = new Integrity(C, {
  dc, sfx, thrusters: thrusterList, auto: autoRaids, seed,
  hooks: {
    // Blacked out: carried into `room`, coming round on its floor.
    rescue: (room, done) => fadeThen(() => {
      setMode('walk');
      walk.goDeck(room.deck, (room.x[0] + room.x[1]) / 2, (room.z[0] + room.z[1]) / 2, walker.yaw, room.seg);
      done();
    })
  }
});
dc.airOf = (id) => ship.airOf(id);
dc.draftOf = (id, p, out) => ship.draftAt(id, p, out); // a fire leans on the draft to a hole
// The guns, the point defence, the torpedoes, the railgun and the raider (weapons.mjs). The hatches to the turrets sit
// you in one.
const guns = new Weapons(C, world, {
  ship, body, sfx, dc, seed,
  hooks: {
    man: (t) => (career.allows('guns') ? fadeThen(() => gunSeat.man(t)) : career.refuse('guns'))
  }
});
// How her guns and the hits on her are heard and felt aboard: through the structure, and as the room swaying
// (gunfeel.mjs); and a hit's shove on her body (weapons/projectiles.mjs `struck`). `ship.aboard`: set each frame.
const feel = new Feel(sfx);
guns.feel = ship.feel = feel;
guns.gas = carrierGas;
// Where a hit on your fighter lands and what it does (fighter-damage.mjs): her parts, the damage drawn on her, the
// cockpit's damage page and tones. `guns.fhull` is what is left of them all.
guns.fdmg = fighter && L.fighter.damage ? new FighterDamage(C, fighter, { gas, blazes, sfx, hull: L.weapons.fighter?.hull ?? 100, say: (t) => dc.say(null, t, 0, 4) }) : null;
ship.knock = (p, dir, kind) => guns.struck(p, dir, kind);
// A torpedo hit's streaking debris, in the world (weapons/tracers.mjs), on top of integrity.mjs's fireball and dust in
// her own frame. No ring: there is no air out there to carry a shock. A shell's own spatter is already drawn where it
// met the plating (projectiles.mjs).
ship.sparks = (p, out, kind) => {
  if (kind !== 'kick') return;
  const P = C.frame.localToWorld(p.clone()), O = out.clone().transformDirection(C.frame.matrixWorld);
  guns.impact(P, O.negate(), 3, '#ffb060');
};
// The weightless crew brace at the call and take a hit's kick (floating.mjs).
C.bus.on('brace', (e) => crewBrace(e.on));
C.bus.on('jolt', crewJolt);
// Shot dead in space: hands off, and the tug goes out to bring her in (rescue.mjs `disabled`), not flight control's
// carry from wherever she is. Flight control takes her only at the gate, off the tug's bar.
C.bus.on('fighter-down', () => {
  fighter.disabled = true;
  rescue.disabled();
});
// A crash that finishes her: she breaks up (weapons/raid.mjs `fighterHit`), you see the fireball for a moment (fighter.mjs
// `WRECK_T`), then come round in the sick bay, hurt; the spare airframe is on her pad under her number (fighter.mjs `salvage`).
let wreckedAt = 0; // the speed of the crash that wrecked her
C.bus.on('fighter-wrecked', (e) => (wreckedAt = e.speed));
C.bus.on('fighter-wreck-over', () => fadeThen(() => {
  cockpit.detach();
  const wreck = fighter.obj;
  const pad = fighter.salvage();
  if (wreck) guns.fdmg?.scrap(wreck); // a spare airframe: whole and unmarked, not a repair job
  setMode('walk');
  const sick = [...C.rooms.values()].find((r) => r.system === 'medical') ?? C.rooms.get('hangar');
  walk.goDeck(sick.deck, (sick.x[0] + sick.x[1]) / 2, (sick.z[0] + sick.z[1]) / 2, walker.yaw, sick.seg);
  if (walker.floater) walker.floater.hurt = Math.max(walker.floater.hurt, 0.5);
  dc.say(null, `You hit the carrier at ${Math.round(wreckedAt)} m/s and she broke up. The crash and rescue team cut you out of what was left: you are in the ${sick.name.toLowerCase()}, bruised. The spare airframe is on pad ${pad + 1}.`, 0, 9);
}));
// Her heat and her reaction mass (plant.mjs): the guns put heat in, the radiators take it out, the drive burns
// propellant. The status board in the cutaway shows them with the guns.
const plant = new Plant(C, { ship, thrusters: thrusterList, dc, sfx });
guns.plant = plant;
ship.status = () => {
  // Each kind of point defence its own row: guns in action, and the rounds left in their magazines.
  const kind = (type) => {
    const gs = guns.pdcs.filter((g) => g.type === type);
    const up = gs.filter((g) => g.ok && g.stock > 0).length;
    const full = gs.length * ((type === 'flak' ? L.weapons.flak : L.weapons.pdc)?.stock ?? 1);
    return { n: gs.length, text: `${up}/${gs.length} guns · ${Math.round((gs.reduce((a, g) => a + g.stock, 0) / Math.max(1, full)) * 100)}% rounds` };
  };
  const close = kind('close'), flak = kind('flak');
  return [
    ['Close-in guns', ship.sys('pdc'), close.text],
    ...(flak.n ? [['Flak', ship.sys('pdc'), flak.text]] : []),
    ['Torpedo tubes', (ship.node(L.weapons.tubes?.magazine)?.health ?? 100) / 100, `${guns.tubeStock} torpedoes`],
    ...(HAS.spinal
      ? [['Railgun', ship.power && !plant.hot ? 1 : 0.3, `${guns.rail.stock} slugs · ${guns.rail.charge >= 1 ? 'charged' : `${Math.round(guns.rail.charge * 100)}%`}`]]
      : HAS.broadside
        ? [['Broadside', Math.min(...['port', 'starboard'].map((k) => (guns.broadsideSide(k).fed ? 1 : 0.2))), ['port', 'starboard'].map((k) => `${k} ${guns.broad[k].stock}${guns.broad[k].t > 0 ? ' (reloading)' : ''}`).join(' · ')]]
        : []),
    ...(guns.railSides
      ? [['Railguns', Math.min(...guns.railSides.map((k) => { const r = guns.railSide(k, null); return r.ok ? (ship.power && !plant.hot ? 1 : 0.3) : 0.2; })), guns.railSides.map((k) => `${k} ${guns.rail[k].stock}${guns.rail[k].charge < 1 ? ` (${Math.round(guns.rail[k].charge * 100)}%)` : ''}`).join(' · ')]]
      : []),
    ...plant.rows(),
    ...(parts ? parts.rows() : []),
    ...(hullRepair ? hullRepair.rows() : [])
  ];
};
// The helm's sight (helmsight.mjs): the railgun's pip, the nav plot, the heat and the Δv, over the view from the helm.
const helmSight = new HelmSight(C, { body, helm, thrusters: thrusterList, rcs: thrusters, guns, plant, ship, dc });
// The career: orders from the officers, drills, promotions, and the ship opening up as you earn it. Free roam (any
// `?at=` or `?view=`, or the start screen's button) has everything open.
// A ship with no career.json gets an empty one (`Career.none`): no officers, no orders, everything open.
if (SHIP_ID !== 'carrier') Career.key = `threadspace.${SHIP_ID}.career`; // each ship's career saves under its own key
const career = new Career(C, K ?? Career.none, { dc, ship, guns, fighter, obj: C.obj, body, sfx, voices });

// The ship's routine (watch.mjs): the clock and the bells, the watches, the crew at their posts by watch, the watch
// bill, your bunk and your section's muster. ?crew=0 leaves the crew ashore (the officers still come aboard).
// A ship with no watches.json has only a clock (`NoRoutine`): her crew are at their posts all the time.
const routine = W ? new Routine(C, W, { sfx, crew: q.get('crew') !== '0', ship, dc }) : new NoRoutine(C, { crew: q.get('crew') !== '0' });
const crew = routine.crew;
career.routine = routine;
career.nav = helmSight; // the transit step's waypoint
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
const hands = C.drums && W?.drum && q.get('crew') !== '0' ? new Hands(C, W.drum, { routine, ship, sfx, camera }) : null;

// The announcer (src/core/announcer.mjs): every call the ship makes, said to whoever it is for, by the tannoy, their
// headset or the cockpit radio, with a subtitle (#c-sub). Who you are is your rank's nets (free roam: every net) and
// the seat you are in.
const speakers = Object.fromEntries([...Object.entries(V.speakers), ...[...callers.values(), ...(K?.people ?? []), ...(W?.sections ?? []).map((s) => s.leader)].map((p) => [p.id, { label: p.name }])]);
const announcer = new Announcer(C, CALLS, {
  voices, sfx, speakers, nets: V.nets, el: document.getElementById('c-sub'),
  airOf: (id) => ship.airOf(id), unsafe: L.integrity.air.unsafe
});
const SEAT_NET = { helm: 'bridge', gun: 'gunners', fighter: 'flight' };
announcer.you = () => {
  const depts = new Set(career.on ? K?.stations?.ranks?.[career.rank]?.depts ?? [] : DEPTS);
  if (SEAT_NET[mode]) depts.add(SEAT_NET[mode]);
  const room = mode === 'walk' ? walk.roomNow() : mode === 'helm' ? HELM_ROOM : null;
  return { mode, room, sealed: !!ship.helmet, depts };
};

const walker = new Walker(C.decks.get(L.spawn.deck));
const input = new Input(canvas);
const cut = new Cutaway(C, camera, canvas, document.getElementById('c-labels'));
const hud = new CarrierHud(cut);
hud.onLevel = (i) => cut.setLevel(i);
const drive = new Drive({ thrusters: thrusterList, body, dc, helmSight, spin: G.SPIN }); // what the drive's push feels like aboard
helmSight.lightDelay = () => drive.delay();

Object.assign(G, {
  C, walker, input, hud, cut, sfx, dc, ship, guns, plant, helm, helmSight, body, fighter, approach, cockpit, career, routine,
  hands, doors, drive, deckOf, blenderFighters, helmDeck: BRIDGE_DECK
});
const walk = (G.walk = new WalkSeat(G));
const rescue = (G.rescue = fighter && new Rescue(G)); // the tanker and the tug, called from the cockpit (rescue.mjs)
// A damaged fighter on her pad is mended by drones and the deck crew, and held until she is (fighter-repair.mjs).
const repairs = (G.repairs = guns.fdmg && L.fighter.repair ? new Repairs(G, { crew: q.get('crew') !== '0' }) : null);
// The carrier's own outside parts and what a hit on each does, and the drones and parties that mend her (ROADMAP phase
// 9 session 4: carrier-damage.mjs, carrier-repair.mjs).
Object.assign(G, { thrusterList, carrierGas });
const parts = (G.parts = ship.parts = L.integrity.parts ? new CarrierDamage(G) : null);
const hullRepair = (G.repair = ship.repair = parts ? new HullRepair(G, { crew: q.get('crew') !== '0' }) : null);
walker.floater = new Floater(G); // weightless: the handholds, pushing off, drifting, the puffer (weightless.mjs)
const helmSeat = new HelmSeat(G);
const fighterSeat = fighter && new FighterSeat(G);
const gunSeat = new GunSeat(G);
const cutSeat = new CutawaySeat(G);
const seats = { walk, helm: helmSeat, ...(fighterSeat ? { fighter: fighterSeat } : {}), gun: gunSeat, cutaway: cutSeat };
walk.goDeck(L.spawn.deck, L.spawn.at[0], L.spawn.at[1], L.spawn.yaw);

input.onAction = (code) => {
  if (fading) return;
  if (code === 'Tab') return setMode(mode === 'cutaway' ? modeBefore : 'cutaway');
  if (mode === 'cutaway') return cutSeat.key(code);
  if (routine.billOpen) {
    // The watch bill is up: E or B puts it away.
    if (code === 'KeyE' || code === 'KeyB') routine.closeBill();
    return;
  }
  seats[mode].key(code);
};

/** Whether you can see out of the ship from where you are: from any seat but walking; walking, see `walk.seesOut`. */
function seesOut() {
  return mode !== 'walk' || walk.seesOut();
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
let last = performance.now(), time = 0, avgDt = 1 / 60, saveT = 15;
let collide = null; // made once the ship's outside is gathered, at the end of this file
let host = null; // ?host=<id>: a second ship beside her, made at the end of this file
let berth = null; // ?berth=<id>: she is carried in that berth of the host's hangar (berth.mjs), made with the host
let hostDoors = null, hostHangar = null; // the host's bay doors, worked from here, and her hangar deck, drawn round you

function frame() {
  const now = performance.now();
  budget.frame((now - last) / 1000);
  tick(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

/** One step of everything, then a render. The page calls it every animation frame; `__carrier.tick()` can call it by
 *  hand (a hidden tab gets no animation frames). The order matters (tools/carrier-check.mjs checks it holds): you move,
 *  the ship's systems step, the doors, the guns, then what is drawn, the seat's camera, the sound, the routine, the
 *  lights and the render. */
const ambLast = {}; // where you were last frame: your boots in the suit's room tone (ambience.mjs)
const _lurch = new THREE.Vector3();
function tick(dt) {
  time += dt;
  avgDt += (dt - avgDt) * 0.05;
  const f = input.frame();

  walk.move(f, dt);
  drive.hold();
  // Carried in a berth, her place is her host's to give (berth.mjs): the helm's hands do nothing until the hand-over.
  if (berth?.carried) {
    thrusters.allocate(new Array(6).fill(0));
    berth.frame(dt);
  } else helm.frame(mode === 'helm' ? f : IDLE, dt, mode === 'helm');
  hostDoors?.frame(dt);
  drive.standBy(dt, helm, mode === 'helm');
  if (fighter) {
    const padSide = L.fighters[fighter.index]?.side; // she goes out and comes in on her pad's side: that door
    fighter.frame(mode === 'fighter' ? f : IDLE, dt, mode === 'fighter', { carrier: body, bayOpen: doors.openOn(padSide) });
    rescue.frame(dt); // a tanker or a tug out to her: after she has moved, so the tow bar holds her where it is
    // The approach lane: lit while you are out in her, and flight control catches you at its end.
    const lane = approach.frame(dt, fighter, body, mode !== 'walk' && (fighter.flying || fighter.phase === 'landing'));
    if (mode === 'fighter' && fighter.flying && lane.call === 'catch' && doors.openOn(padSide)) fighter.capture(lane);
  }
  updatePlumes(thrusterList, time, carrierGas, dt);
  carrierGas.stepTick();
  gas.frame(dt, time);
  carrierGas.frame(dt, time);
  blazes.frame(dt);
  if (fighter) {
    flightAudio.setActive(mode === 'fighter' && fighter.aboard);
    flightAudio.frame(fighter.flight);
  }
  machineryFrame(C, time, { power: ship.power, reactor: ship.sys('reactor') });
  setsFrame(C, dt, time);
  ship.auto = autoRaids && career.allows('raids'); // raiders come by themselves once you are a gunner
  dc.frame(dt, f, walker, mode);
  ship.frame(dt, f, walker, mode);
  plant.frame(dt, { stations: ship.stations }); // after integrity has set the thrusters' health: heat and tanks cap the drive
  parts?.frame(dt); // what each hurt part does (next frame's thrusters, turrets, doors, drums), and a holed tank's push
  helmSeat.fire(f);
  doors.frame(dt);
  C.obj.updateMatrixWorld(true);
  collide?.tick(dt);
  collide?.frame(dt); // the fighter against the ship: after everything has moved, before her guns fire
  if (fighter) guns.fly(fighter, mode === 'fighter' && !fading && f.trigger); // her cannon: the mouse button, out in space
  guns.frame(dt, mode === 'gun' ? f : IDLE, mode, camera);
  guns.fdmg?.frame(dt, { cockpit: mode === 'fighter' && !fading }); // her damage seen and heard: looks only
  repairs?.frame(dt, f, walker, mode); // the repair crews on the damaged fighters' pads; holds the one you are in
  hullRepair?.frame(dt, f, walker, mode); // the drones and damage control parties mending her, by priority

  // Which decks are drawn: the one you stand on; the bridge from the helm; none from the chase view; the hangar deck
  // from a fighter (you are in it, or you can see into it through the open bay); all in the cutaway.
  const bridgeView = mode === 'helm' && helmSeat.outlook === 'bridge';
  for (const [id, I] of C.decks) {
    I.group.visible = mode === 'cutaway' || (mode === 'walk' && walk.fixedShown(id)) || (bridgeView && id === BRIDGE_DECK) || (mode === 'fighter' && id === HANGAR_DECK);
  }
  // Only what you can see from here: the outside when you can see out, the machinery behind the fixed hull's windows
  // only from the fixed hull.
  const out = seesOut();
  const { drumNow, hubNow, swing, ride } = walk;
  C.exterior.visible = out;
  world.visible = out;
  C.machinery.visible = (mode !== 'helm' || helmSeat.outlook === 'bridge') && !(mode === 'walk' && (drumNow || hubNow || swing || ride));
  // The drums: their blocks through the cutaway, their outside through the sleeve's open ends when you can see out,
  // and the segments round you while you walk in one.
  if (C.drums) {
    C.drums.group.visible = mode === 'cutaway' || out || (mode === 'walk' && !!(drumNow || hubNow || swing)); // `out`: through the sleeve's open ends
    for (const h of C.drums.halves) (h.blocks.visible = mode === 'cutaway'), (h.segs.visible = mode === 'walk' && !!drumNow), (h.outside.visible = out && mode !== 'cutaway');
  }
  drumsFrame(C, dt);
  if (host) {
    // The cutaway's planes are on materials both ships share (util.mjs `mat`), and would cut her too: not drawn there.
    host.obj.visible = mode !== 'cutaway';
    drumsFrame(host, dt);
    // Her hangar is drawn while you are in it or near enough to see in through an open door.
    if (hostHangar) hostHangar.group.visible = !!berth && (berth.carried || camera.position.distanceToSquared(host.obj.position) < 1500 ** 2);
  }
  // A drum deck is drawn while you walk in it (and only the segments round you: the rest are hidden, and so is whoever
  // stands in them).
  const drawnDeck = (d) => (C.isDrum(d) ? mode === 'walk' && walk.drumNow?.I.deck.id === d : C.decks.get(d).group.visible);
  tickCrew(crew, dt, drawnDeck);
  if (hands) tickCrew(hands.crew, dt, drawnDeck);
  if (repairs) tickCrew(repairs.crew, dt, drawnDeck);
  if (hullRepair) tickCrew(hullRepair.crew, dt, drawnDeck);
  career.tickPeople(dt, (p) => drawnDeck(p.deck) && (!C.isDrum(p.deck) || p.I.group.visible));

  // The main drive's push, what it does to you, and the seat's camera and HUD.
  const push = drive.frame(dt);
  C.push = push; // the gimballed couches swing round for a burn (floating.mjs `gimbal`)
  walk.feel(push, dt);
  seats[mode].frame(dt, drive);
  walker.floater.tick(dt, mode); // an injury healing, and the brace countdown (weightless.mjs)
  // A hit shakes you, the harder the nearer it struck (aboard only: from outside you see it instead).
  if (ship.shake > 0.01 && (mode === 'walk' || mode === 'gun' || bridgeView)) {
    const s = ship.shake;
    camera.position.x += (Math.random() - 0.5) * s * 0.12;
    camera.position.y += (Math.random() - 0.5) * s * 0.12;
    camera.rotateZ((Math.random() - 0.5) * s * 0.02);
  }
  // A torpedo hit's lurch (integrity.mjs `impact`): the room jumps along the blast and rings back, so the view jumps
  // the other way. Loose and weightless, the Floater throws you for real as well (weightless.mjs `jolt`).
  // A sharp jump that rings at 2 Hz, then the slow sway of the whole hull taking it, at half a hertz.
  const lurch = ship.lurch;
  if (lurch && (lurch.t += dt) < 3) {
    if (mode === 'walk' || mode === 'gun' || bridgeView) {
      const t = lurch.t;
      const k = lurch.size * (0.32 * Math.exp(-t * 3) * Math.cos(t * 13) + 0.18 * Math.exp(-t * 1.1) * Math.sin(t * 3.2));
      camera.position.addScaledVector(_lurch.copy(lurch.dir).transformDirection(C.frame.matrixWorld), -k);
      camera.rotateX(k * 0.12);
      camera.rotateZ(lurch.size * 0.025 * Math.exp(-t * 1.1) * Math.sin(t * 2.6));
    }
  } else if (lurch) ship.lurch = null;
  // Her guns and the hits, through the structure (gunfeel.mjs); in the cockpit, your own cannon's shiver.
  ship.aboard = mode === 'walk' || mode === 'gun' || mode === 'helm';
  feel.frame(dt, camera, mode === 'walk' || mode === 'gun' || bridgeView ? 'aboard' : mode === 'fighter' && fighter?.view === 'cockpit' ? 'cockpit' : null);
  // A hit on your fighter throws you about in the seat.
  if (mode === 'fighter' && guns.jolt > 0.01) {
    camera.rotateZ((Math.random() - 0.5) * guns.jolt * 0.05);
    camera.rotateX((Math.random() - 0.5) * guns.jolt * 0.03);
  }
  const roomNow = mode !== 'walk' ? null : walk.roomNow();
  const placeNow = walk.placeNow();
  const hearRoom = roomNow ?? (mode === 'helm' ? HELM_ROOM : null);
  ambience.frame(dt, {
    room: hearRoom ? C.rooms.get(hearRoom) : null, air: hearRoom ? ship.airOf(hearRoom) / L.integrity.air.nominal : 1, power: ship.power,
    drive: Math.min(1, push / 15), inside: mode !== 'fighter' && mode !== 'cutaway',
    suit: mode === 'walk' && ship.helmet, moved: mode === 'walk' ? Math.min(0.5, Math.hypot(walker.pos.x - (ambLast.x ?? walker.pos.x), walker.pos.z - (ambLast.z ?? walker.pos.z))) : 0 // the suit's room tone (ambience.mjs); a jump is not a step
  });
  ambLast.x = walker.pos.x;
  ambLast.z = walker.pos.z;
  routine.rankName = career.on ? career.rank : null;
  routine.frame(dt, { mode, deck: placeNow, seg: walk.drumNow?.seg, room: roomNow, x: walker.pos.x, z: walker.pos.z });
  hands?.frame(dt, { mode, drum: walk.drumNow, ride: walk.ride, room: roomNow, x: walker.pos.x, z: walker.pos.z });
  if (mode !== 'walk') routine.closeBill();
  career.frame(dt, { mode, deck: placeNow, seg: walk.drumNow?.seg, room: roomNow });
  announcer.frame(dt);
  // The clock is kept with the career, now and then as well as at each order.
  if (career.on && (saveT -= dt) <= 0) (saveT = 15), career.save();
  helmSeat.after();
  if (mode !== 'cutaway' && !(mode === 'helm' && helmSeat.outlook === 'chase') && !(mode === 'fighter' && fighter.view === 'chase')) camera.up.set(0, 1, 0);
  if (fighter) {
    if (mode !== 'fighter') cockpit.hide();
    fighter.gl.draw(mode === 'fighter' && fighter.view === 'cockpit');
  }
  helmSight.frame(dt, fading ? null : mode, camera);
  // A little wider from the cockpit, so the panel's screens are in view.
  const fov = mode === 'gun' ? guns.fov() : mode === 'fighter' && fighter.view === 'cockpit' ? 76 : 70;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // The lighting for where you are (render.mjs), the lamps round you, night in the passages, and the render.
  const inside = mode === 'walk' || mode === 'gun' || bridgeView;
  view.light({ mode, dark: mode === 'walk' && !ship.power, inside, look: mode === 'walk' && roomNow ? lookOf(C.rooms.get(roomNow)) : null });
  space.frame(camera, dt);
  const lit = [...C.decks.values()].filter((I) => I.group.visible).concat(walk.lit(), hostHangar?.group.visible ? [hostHangar] : []);
  lightPool.update(camera.position, mode === 'cutaway' ? [] : lit);
  routine.light(lightPool, hemi, { mode, room: roomNow }); // night: red lighting in the passages
  gas.setView(camera, renderer.domElement.height);
  carrierGas.setView(camera, renderer.domElement.height);
  blazes.setView(camera, renderer.domElement.height);
  view.draw({ mode, inside });
}

hud.mode(mode);

// --- start ---------------------------------------------------------------------------------------------------------

const centre = (id, yaw = 0) => { const c = C.rooms.get(id); return c?.deck && [c.deck, (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, yaw]; };
const AT = L.version === 2
  ? { bridge: centre(HELM_ROOM), hangar: centre('hangar', Math.PI / 2), engineering: centre('eng-control', Math.PI) ?? centre([...C.rooms.values()].find((c) => c.system === 'engineering' && c.access === 'walk')?.id, Math.PI), tunnel: centre('tunnel') }
  : { bridge: [1, 0, -140, 0], hangar: [3, -2, 0, Math.PI / 2], engineering: [3, 0, 134, Math.PI], mess: [2, 0, -70, -Math.PI / 2] };
if (q.get('at') === 'helm') {
  walk.goDeck(BRIDGE_DECK, L.helm.at[0], L.version === 2 ? L.helm.at[1] : -144.6, 0);
  setMode('helm');
} else if (q.get('at') === 'fighter' && fighter) {
  walk.goDeck(HANGAR_DECK, ...(L.version === 2 ? AT.hangar.slice(1) : [-2, 0, Math.PI / 2]));
  fighterSeat.board(1);
} else if ((q.get('at') === 'gun' || q.get('at') === 'gun-ventral') && guns.turrets[q.get('at') === 'gun' ? 0 : 1]) {
  const t = guns.turrets[q.get('at') === 'gun' ? 0 : 1];
  walk.goDeck(t.spec.from.deck, t.spec.from.at[0], t.spec.from.at[1], t.spec.from.yaw);
  gunSeat.man(t);
} else if (AT[q.get('at')]) {
  walk.goDeck(...AT[q.get('at')]);
  if (C.rooms.get('hangar')?.vacuum && q.get('at') === 'hangar') ship.don(); // the hangar is airless: start suited
}
if (q.get('view') === 'cutaway') setMode('cutaway');

const startEl = document.getElementById('c-start');

const boardBtn = document.getElementById('c-board');
const againBtn = document.getElementById('c-again');
const saved = K && Career.saved(K);
if (!K) boardBtn.hidden = true; // no career aboard her: free roam only
if (saved?.i) {
  boardBtn.textContent = `Carry on as ${saved.rank.toLowerCase()}`;
  againBtn.hidden = false;
}
/** Off the start screen: into the career (fresh or carried on), or free roam. */
function go(how) {
  startEl.hidden = true;
  sfx.start(); // sound needs a click to start
  if (fighter) flightAudio.init();
  ambience.start();
  if (how === 'free') career.free();
  else {
    const at = career.begin(how === 'fresh');
    walk.goDeck(at.deck, at.x, at.z, at.yaw, at.seg);
  }
  if (mode !== 'cutaway') input.lock();
}
boardBtn.addEventListener('click', () => go('carry-on'));
againBtn.addEventListener('click', () => go('fresh'));
document.getElementById('c-free').addEventListener('click', () => go('free'));
if (q.has('at') || q.has('view') || q.has('berth')) startEl.hidden = true; // `berth`: you came through her docking port
// Started without the start screen (?at=, ?view=): sound starts with the first click or key.
const wake = () => {
  sfx.start();
  if (fighter) flightAudio.init();
  ambience.start();
};
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });

window.__carrier = {
  ship_id: SHIP_ID, HAS, world, C, L, K, W, crew, routine, hands, body, helm, thrusters, walker, renderer, camera, cut, fighter, dc, ship, guns, plant, helmSight, sfx, approach, cockpit, career, voices, announcer,
  gas, carrierGas, blazes, feel, flightAudio, composer, bloom, ABOARD, ambience, input, G, seats, drive, doors, rescue, repairs, parts, hullRepair,
  mode: () => mode,
  tick: (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) tick(dt);
    return window.__carrier.info();
  },
  view: (v) => (helmSeat.outlook = v),
  /** Opens the bay doors at once (the doors normally take six seconds). */
  bayNow: () => doors.bayNow(),
  setMode,
  /** Stands you at (x, z) on a deck (a drum deck's key and segment, drum.mjs), walking. */
  place(deck, x, z, yaw = walker.yaw, seg = 0) {
    setMode('walk');
    walk.goDeck(deck, x, z, yaw, seg);
  },
  drum: () => walk.drumNow && { half: walk.drumNow.hid, deck: walk.drumNow.did, seg: walk.drumNow.seg, built: C.drums.built.size, ride: walk.ride },
  go(roomId) {
    const d = L.drum?.rooms.find((r) => r.id === roomId); // a drum room: stand in it
    if (d) {
      setMode('walk');
      walk.enterDrum(d.half, d.deck, d.seg, (d.x[0] + d.x[1]) / 2, (d.z[0] + d.z[1]) / 2);
      return true;
    }
    const c = C.rooms.get(roomId);
    if (!c || c.access !== 'walk') return false;
    setMode('walk');
    walk.goDeck(c.deck, (c.x[0] + c.x[1]) / 2, (c.z[0] + c.z[1]) / 2, walker.yaw);
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
  info: () => ({ pr: budget.pr, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs: +(avgDt * 1000).toFixed(1), mode, deck: walk.drumNow ? `${walk.drumNow.I.deck.id}:${walk.drumNow.seg}` : walk.deckNow, fighter: fighter?.phase })
};

// The ship's outside: everything on her frame but the decks, the drums, the machinery (seen through windows) and the
// cutaway's overlay. Gathered once all of it is built; things added to the frame later (a ladder's trunk) stay out.
C.exterior = new THREE.Group();
C.exterior.name = 'exterior';
for (const o of [...C.frame.children]) if (![C.machinery, C.overlay, C.drums?.group, ...[...C.decks.values()].map((I) => I.group)].includes(o)) C.exterior.add(o);
C.frame.add(C.exterior);
// What the fighter can hit (collide.mjs): the outside's meshes, the hangar from inside, the parked fighters.
if (fighter) collide = new Collisions(C, { fighter, guns, ship, doors, spec: L.fighter.collide });
window.__carrier.collide = collide;

// The ships she carries, on their cradles in her hangar (berths.mjs): E at one's docking port takes you aboard her.
// `?at=berth:<id>` is how you arrive from one: by her port, on the platform at the end of her spur, suited.
const berths = (G.berths = L.berths?.length ? await new Berths(G, SHIP_ID, { code: q.get('hull') === 'code' }).build() : null);
window.__carrier.berths = berths;
if (q.get('at')?.startsWith('berth:')) {
  const a = berths?.arrival(q.get('at').slice(6));
  if (a) {
    walk.goDeck(a.deck, a.x, a.z, a.yaw);
    if (a.y !== undefined) walker.pos.y = a.y;
    walker.floater?.reset?.();
    ship.don();
    career.free();
  }
}

// ?host=<id>: a second ship beside her (a debug flag: the proof that `buildCarrier` builds two layouts in one page).
// Built with no hooks and no systems, standing in the world 400 m off the port beam where she starts, and drawn from
// outside only: her hull and outside fittings, her drums as seen through the sleeve's ends (turning), her decks,
// machinery and cutaway overlay hidden. Her point defence guns are not there: those are made by `Weapons`, not the build.
const HOST_ID = idOf(q.get('host'));
if (HOST_ID) {
  const HL = await loadLayout(`ships/${HOST_ID}`, fetchJson);
  const H = (host = buildCarrier(HL));
  buildThrusterMeshes(H.frame, thrustersFromLayout(HL));
  if (q.get('hull') !== 'code') await loadHull(H, `assets/${HOST_ID}/hull.glb`);
  for (const I of H.decks.values()) I.group.visible = false;
  H.machinery.visible = false;
  for (const h of H.drums?.halves ?? []) h.blocks.visible = h.segs.visible = false;
  C.obj.updateMatrixWorld(true);
  H.obj.position.copy(C.obj.localToWorld(new THREE.Vector3(-400, 0, 0)));
  H.obj.quaternion.copy(C.obj.quaternion);
  world.add(H.obj);
  window.__carrier.host = H;
  // ?berth=<id>: she starts carried in that berth of the host's hangar (berth.mjs), the hangar drawn round her and the
  // host's bay doors worked from here. `?berth=1` takes the first berth; a host with a hangar but no `berths` in her
  // layout gets a stand-in.
  const want = q.get('berth');
  const spec = want && (HL.berths?.find((b) => b.id === want) ?? HL.berths?.[0] ?? standIn(HL, L));
  if (spec) {
    hostHangar = H.decks.get(H.rooms.get('hangar').deck);
    hostHangar.group.visible = true;
    hostDoors = new Doors(H);
    berth = G.berth = new Berth({
      C, body, H, hostDoors, spec,
      say: (t, secs) => helmSight.say(t, secs),
      // Where she is, for the next page: in her berth, or out.
      onChange: (phase) => (phase === 'berthed' ? setShip(berthKey(HOST_ID, spec.id), { ship: SHIP_ID }) : phase === 'out' ? setShip(berthKey(HOST_ID, spec.id), { ship: SHIP_ID, out: true }) : null)
    });
    helm.ref = berth.hostVel; // speeds at the helm are against her mothership
    KEYS.helm = KEYS.helm.replace(' · <b>view</b> V', ' · <b>launch / come aboard</b> L · <b>view</b> V');
    // Her docking port (the layout's `dock`): on the cradle, it is the way back aboard the host.
    const dk = L.dock, lock = dk && C.rooms.get(dk.room);
    if (lock) {
      const u = C.decks.get(lock.deck).use('dock', '', dk.at[0] - (dk.out?.[0] ?? 0) * 0.6, dk.at[2], () => {
        if (berth.phase !== 'berthed') return dc.say(null, 'The docking port stays shut: she is not on her cradle.', 0, 3);
        fadeThen(() => goAboard(HOST_ID, { at: `berth:${spec.id}` }));
      }, { r: 1.8 });
      Object.defineProperty(u, 'label', { get: () => (berth.phase === 'berthed' ? `Go aboard the ${HL.name?.toLowerCase().includes('carrier') ? 'carrier' : HL.name}` : 'Docking port: shut') });
    }
    // Come aboard through the port (no `?at=`): you start in her airlock.
    if (lock && !q.has('at')) {
      walk.goDeck(lock.deck, (lock.x[0] + lock.x[1]) / 2, (lock.z[0] + lock.z[1]) / 2, Math.PI / 2);
      walker.floater?.reset?.();
      career.free();
    }
    window.__carrier.berth = berth;
    window.__carrier.hostDoors = hostDoors;
  }
}

// ?hold=1: no frames until a script steps them with `__carrier.tick()` (tools/carrier-check.mjs).
if (q.get('hold') !== '1') frame();
