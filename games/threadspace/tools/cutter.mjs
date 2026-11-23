// Builds the cutter's layout, the files in ships/cutter/ that its index.json names. The cutter is the first medium
// ship: a 3–4 crew craft the carrier keeps in her hangar and sends out. Working name; the story will name her.
//
//   node tools/cutter.mjs            # from this folder; writes the layout and prints its checks
//   node tools/cutter.mjs --check    # checks only, writes nothing
//
// There is no designer file: she is written out below. The parts of the layout that are not about where things are
// (the weapons' numbers, integrity, the plant, damage control) start from the carrier's (ships/carrier/, read with
// `loadLayout`) and are scaled to her size, each with a line saying how. She has no drums, no hangar, no fighters, no
// broadside, railguns or flak, and no career or watch bill of her own: the engine runs what a layout has. (The
// player's career, content/careers/, has steps aboard her; her speakers and nets are ships/cutter/voices.json, kept by
// hand beside the files this tool writes.)
//
// Frame: metres, x starboard, y up, -z the bow, as every ship here. Her axis is x = 0, y = 0; the hull runs from
// z = -17 (bow) to z = +17 (the drive's bulkhead), and the drive's bell stands 2.3 m aft of that.
//
// The envelope she has to keep, radiators folded, to fit a carrier's hangar and go out of a bay door:
// at most 38 m long, 11 m beam, 8 m high. `envelope` below is worked out from the hull and everything on it, and the
// checks fail if it is over.
//
// Mass: 420 t loaded. Her hull encloses about 1,500 m³. 120 t is reaction mass (the keel and wing tanks, about
// 150 m³ of water at these numbers); 110 t structure and armour (a 34 m hull's skin and frames at about 180 kg a
// square metre of skin); 80 t the reactor, drive and heat sinks; 40 t guns, torpedoes and ammunition; 70 t everything
// else (life support, the fit-out, stores, four people). That is 0.28 t per cubic metre of hull: light for a ship,
// about right for a spacecraft that is mostly rooms, tanks and machinery with a thin belt.
//
// Thrust: one main drive of 4.2 MN, which is 10 m/s² on 420 t (1 g), 14 m/s² with the tanks dry. Eight manoeuvring
// clusters of 135 kN a nozzle: about 0.15 rad/s² in yaw, so a 180° turn takes about 9 s flat out (speed up for half of
// it, slow down for the rest), where the carrier takes most of a minute.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadLayout, splitLayout } from '../src/core/ship.mjs';
import { check } from './check.mjs';

const here = (p) => new URL('../' + p, import.meta.url);
const CHECK_ONLY = process.argv.includes('--check');
const read = async (p) => JSON.parse(readFileSync(p));
const carrier = await loadLayout(here('ships/carrier').pathname, read);
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

const MASS = 420e3; // kg, loaded (see the top of this file)
const PROP = 120e3; // kg of it reaction mass
const SKIN = 0.3; // the hull's own frames and plating, in from the skin
const Z0 = -17, Z1 = 17;
const MAST_TOP = 4.55; // m above her axis: the masthead light

// ---- the hull ----
// One loft of chamfered sections (`c` defaults to 0.32 of the smaller half-size). No island.
const hull = {
  main: [
    { z: Z0, w: 3.6, h: 2.6, y: 0 },
    { z: -13, w: 8.4, h: 5.0, y: 0 },
    { z: -9, w: 10, h: 5.8, y: 0 },
    { z: 13, w: 10, h: 5.8, y: 0 },
    { z: Z1, w: 7.6, h: 4.8, y: 0 },
  ],
};

/** The loft's half-sizes and chamfer at `z`, `inset` metres in from the skin. */
function sectionAt(z, inset = SKIN) {
  const S = hull.main;
  if (z < S[0].z || z > S[S.length - 1].z) return null;
  let i = 0;
  while (S[i + 1].z < z) i++;
  const t = (z - S[i].z) / (S[i + 1].z - S[i].z || 1);
  const lerp = (k, d = 0) => (S[i][k] ?? d) + ((S[i + 1][k] ?? d) - (S[i][k] ?? d)) * t;
  const a = lerp('w') / 2 - inset, b = lerp('h') / 2 - inset;
  return { a, b, c: Math.min(a, b) * lerp('c', 0.32) };
}
function inHull(x, y, z, inset) {
  const s = sectionAt(z, inset);
  if (!s) return false;
  const px = Math.abs(x), py = Math.abs(y);
  return px <= s.a && py <= s.b && px + py <= s.a + s.b - s.c;
}

// ---- the deck ----
// One deck. Nothing has weight aboard her unless the drive burns; "down" is the ship's -y, so a 1 g burn puts your
// feet on the after bulkhead, not the deck: the couches are for that.
const FLOOR = -1.5, ROOM_H = 3;
const decks = [{ id: 1, name: 'Main deck', floor: FLOOR }];
const comps = [];
/** A walkable room: weightless (`float`, weightless.mjs), like the carrier's fixed hull. */
const W = (id, name, system, x, z, more = {}) => comps.push({ id, name, deck: 1, access: 'walk', system, x, z, float: true, ...more });
/** A sealed compartment (machinery, tanks, magazines). */
const X = (id, name, system, x, y, z, more = {}) => comps.push({ id, name, access: 'sealed', system, x, y, z, ...more });

// Bow to stern. The flight deck in the nose, its windows forward; a passage down the middle with the crew's spaces
// either side; engineering control aft, its window onto the reactor; then the reactor, the drive, and tanks round them.
W('flight-deck', 'Flight deck', 'bridge', [-2.4, 2.4], [-12.6, -8.2], {
  windows: [{ side: 'n', from: -2.1, to: 2.1, sill: 0.95, head: 2.35 }],
});
W('passage', 'Passage', 'corridor', [-0.9, 0.9], [-7.8, 5.0]);
// Port of the passage
W('crew-space', 'Crew space', 'quarters', [-4.4, -1.3], [-7.8, -1.8]);
W('head', 'Head', 'water', [-4.4, -1.3], [-1.4, 0.8]);
X('life-support', 'Life support', 'life-support', [-4.4, -1.3], [FLOOR, FLOOR + ROOM_H], [1.2, 5.0]);
// Starboard of the passage
W('mess-nook', 'Galley and mess', 'mess', [1.3, 4.4], [-7.8, -4.6]);
// Her docking and boarding port: the airlock's outer door is in its starboard wall (`dock`, below).
W('airlock', 'Airlock', 'corridor', [1.3, 4.4], [-4.2, -1.6], { airlock: true });
W('ops-locker', 'Damage control locker', 'damage', [1.3, 4.4], [-1.2, 2.4]);
X('switchgear', 'Switchgear', 'power', [1.3, 4.4], [FLOOR, FLOOR + ROOM_H], [2.8, 5.0]);
// Aft
W('eng-room', 'Engineering control', 'engineering', [-3.2, 3.2], [5.4, 8.6], {
  windows: [{ side: 's', from: -2.2, to: 2.2, sill: 1.0, head: 2.3 }],
});
X('reactor', 'Fusion reactor', 'reactor', [-2.6, 2.6], [-2.5, 2.5], [9.0, 12.2]);
X('drive', 'Main drive machinery', 'drive', [-2.2, 2.2], [-2.0, 2.0], [12.6, 16.4]);
X('tank-port', 'Wing tank, port', 'tanks', [-4.5, -3.0], [-1.8, 1.8], [9.0, 12.9]);
X('tank-stbd', 'Wing tank, starboard', 'tanks', [3.0, 4.5], [-1.8, 1.8], [9.0, 12.9]);
// Under the deck: the keel tanks. Over it: the turret's barbette and magazine, the point defence magazine, the repair
// drones' rack, the heat sinks. In the nose, either side of the flight deck: the torpedo tubes, two a side; under it, the forward sensors.
X('tank-keel', 'Keel tank, forward', 'tanks', [-3.4, 3.4], [-2.55, -1.65], [-7.8, 0.2]);
X('tank-keel-aft', 'Keel tank, aft', 'tanks', [-3.4, 3.4], [-2.55, -1.65], [0.6, 8.6]);
X('pdc-mag', 'Point defence magazine', 'pdc', [-2.4, 2.4], [1.65, 2.5], [-7.8, -6.3]);
X('barbette', 'Turret barbette', 'turret', [-1.4, 1.4], [1.65, 2.6], [-5.9, -3.0]);
X('magazine', 'Turret magazine', 'magazine', [-2.6, 2.6], [1.65, 2.55], [-2.6, 1.1]);
X('drone-rack', 'Repair drone rack', 'repair', [-1.6, 1.6], [1.65, 2.55], [1.5, 3.0]);
X('heatsink', 'Heat sinks', 'heat', [-3.2, 3.2], [1.65, 2.55], [3.4, 8.6]);
X('tubes-port', 'Torpedo tubes, port', 'magazine', [-3.9, -2.8], [-1.2, 1.2], [-12.4, -8.2]);
X('tubes-stbd', 'Torpedo tubes, starboard', 'magazine', [2.8, 3.9], [-1.2, 1.2], [-12.4, -8.2]);
X('sensor-nose', 'Forward sensors', 'sensors', [-1.6, 1.6], [-2.05, -1.65], [-12.6, -8.4]);

// Doors: each room onto the passage, at the middle of the wall they share; the flight deck and engineering end on.
const doors = [];
{
  const p = comps.find((c) => c.id === 'passage');
  for (const r of comps.filter((c) => c.access === 'walk' && c !== p)) {
    const side = r.x[0] >= p.x[1] || r.x[1] <= p.x[0];
    doors.push({ between: ['passage', r.id], at: side ? r1((Math.max(r.z[0], p.z[0]) + Math.min(r.z[1], p.z[1])) / 2) : 0, w: 1.2 });
  }
}
// Where another ship or a hangar's gangway meets her: the airlock's outer door, in the wall named, at this z, its sill
// on the deck. (The game does not open it yet: berthing and boarding are the next piece of work.)
const dock = {
  about: 'Her docking and boarding port: the outer door of `room` (the airlock), in its `side` wall (e: starboard), centred at `at` [x, y, z] in the ship\'s frame (y is the middle of the door), `w` wide and `h` high, facing `out`. The skin there is at x = `skin`.',
  room: 'airlock', side: 'e', at: [4.4, FLOOR + 1.05, -2.9], w: 1.2, h: 2.1, out: [1, 0, 0], skin: 5,
};

// ---- thrusters ----
// One main drive: 1 g loaded. `r` is the radius of the bell's mouth; the bell stands 1.8 r aft of the hull.
// Eight clusters on the hull's shoulders, four forward and four aft, drawn at `rcsScale` of the carrier's.
const thrusters = {
  main: [{ at: [0, 0, Z1], r: 1.3, force: Math.round((MASS * 10) / 1e5) * 1e5 }],
  rcsForce: 135e3,
  rcsScale: 0.3,
  rcs: [[-1, 1], [1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy]) => [{ at: [sx * 4.6, sy * 2.35, -9] }, { at: [sx * 4.6, sy * 2.35, 13] }]),
};

// ---- mounts ----
// The carrier's turret and point defence guns are drawn from one model each; `scale` draws them at a cutter's size
// (the turret at 0.15: a low twin mount, 1.2 m across with 3.2 m barrels, the size of a patrol boat's remote weapon
// station; point defence guns at 0.28). Her Blender hull (tools/blender/cutter_build.py) builds its turret in the same
// units and scales it by the same number, so the game's points on a turret (muzzles, the sight) land on either.
const mounts = [
  { id: 'turret-dorsal', kind: 'turret', at: [0, 2.9, -4.45], up: [0, 1, 0], scale: 0.15 },
  // The two close-in guns on the lower shoulders, each covering its own beam and everything below her; the turret has
  // what is above.
  { id: 'pdc-port', kind: 'pdc', gun: 'close', at: [-4.5, -2.45, 3], up: [-0.7071, -0.7071, 0], magazine: 'pdc-mag', scale: 0.28 },
  { id: 'pdc-stbd', kind: 'pdc', gun: 'close', at: [4.5, -2.45, 3], up: [0.7071, -0.7071, 0], magazine: 'pdc-mag', scale: 0.28 },
  // Two radiators aft, 4.5 m out from her sides when spread; folded (`fold`) they run in flat against the hull.
  { id: 'radiator-port', kind: 'radiator', x: [-9.5, -5], y: 0.4, z: [6.5, 12.5], fold: true },
  { id: 'radiator-stbd', kind: 'radiator', x: [5, 9.5], y: 0.4, z: [6.5, 12.5], fold: true },
];

// ---- weapons: the carrier's numbers, scaled ----
const weapons = structuredClone(carrier.weapons);
// What she does not carry: no broadside, railguns or flak; no fighters, so no cannon of theirs or heat-seekers;
// and no bandits come with her raider (they fly on the layout's `fighter`, which she does not have).
for (const k of ['broadside', 'railgun', 'flak', 'bandit', 'fighter', 'missile', 'heat']) delete weapons[k];
// Her flares (weapons/missiles.mjs `shipFlares`): M at the helm throws a salvo, half out of each side; with nobody of
// yours at the helm her crew throw one at a torpedo in its last stretch, every `crewEvery` s. A torpedo in its last
// stretch that sees a flare by her judges it once: `lure` of the time it takes it for her and goes for it instead.
{
  const { eject, life } = weapons.flares;
  const about = 'Her flares (weapons/missiles.mjs `shipFlares`, `torpLure`). Each is thrown out at `eject` m/s on top of her velocity and burns for `life` s at `ship.heat`, fading. M at the helm throws `ship.salvo` (half from each side), not more often than every `ship.every` s, from `ship.count` (full again when the page loads: the voyage save does not keep them yet); with nobody of yours at the helm her crew throw a salvo at a torpedo in its last stretch (`torpedo.terminal` m) every `ship.crewEvery` s. Such a torpedo judges each flare it sees near her once: `ship.lure` of the time it takes the flare for her, goes for it and is spent on it.';
  weapons.flares = { about, eject, life, ship: { count: 32, salvo: 4, every: 1.5, crewEvery: 3.5, heat: 600, lure: 0.18 } };
}
weapons.about = 'The cutter\'s guns, from the carrier\'s `weapons` (ships/carrier/weapons.json, whose `about` says what each number is) scaled by tools/cutter.mjs: one dorsal turret (`turrets`, `gun`), two close-in point defence guns (`pdc`), four forward torpedo tubes (`tubes`, `torpedo`), flares (`flares.ship`), the raider that comes for her (`raider`), the gunnery target (`target`) and brace for impact (`brace`). No broadside, railgun, flak, bandits or fighters.';
weapons.turrets = [
  // Manned from a hatch in the passage's deckhead, under the barbette.
  { mount: 'turret-dorsal', name: 'Dorsal turret', barbette: 'barbette', magazine: 'magazine', from: { deck: 1, at: [-0.5, -4.45], yaw: 1.5708, label: 'Up into the dorsal turret' } },
];
// The gun: a twin where the carrier's turrets are triples; a 5 kg round where hers is a tonne (so a shot kicks her
// 1.7 cm/s, about what the carrier's kick her); a smaller ready rack and magazine. Its rates, speeds and damage stay.
weapons.gun = { ...weapons.gun, barrels: 2, shellMass: 5, rack: 16, stock: 160, calibreNote: '3.2 m barrels, a low twin mount.' };
// Point defence: two guns for the carrier's six; each mount's magazine a little over a third of hers.
weapons.pdc = { ...weapons.pdc, stock: 1200 };
// Torpedoes: she carries eight for her four tubes (the carrier 24 for six), fired in pairs. A torpedo's reach into a
// hull is scaled to her beam (10 m for the carrier's 44 m): 0.23 of [30, 55].
weapons.tubes = { ...weapons.tubes, magazine: 'tubes-port', stock: 8, salvo: 2, at: [[-3.1, 0.5, -12.6], [-3.6, -0.5, -12.6], [3.1, 0.5, -12.6], [3.6, -0.5, -12.6]], dir: [0, 0, -1] };
weapons.torpedo = { ...weapons.torpedo, pen: [7, 13] };
// The raider: the same corvette, a ship of about her own size. One turret meets it where the carrier has ten, so its
// hull is the carrier's raider's (940) over eight.
// `fixed`: her passes are laid in a frame that follows the cutter's place but keeps the attitude she had when the raid
// began. The carrier barely turns in a fight, so for her the raider's passes can turn with her; the cutter rolls to
// bring her one turret to bear, and passes that rolled with her would keep a raider from below under her for good.
weapons.raider = { ...weapons.raider, hull: 120, fixed: true };

// ---- integrity ----
const integrity = structuredClone(carrier.integrity);
// A shell's reach, scaled to her beam as the torpedo's is: 0.23 of [8, 34]. The belt: a quarter of the carrier's (it
// stops fewer shells and takes less off the ones it does not).
integrity.shell = { ...integrity.shell, pen: [2, 8] };
integrity.armour = { stop: 0.15, pen: 1.5 };
delete integrity.condition.drums;
// Two repair drones from the rack over the passage (the carrier has four, and a drone bay). The carrier's outside parts
// and damage control parties (`parts`: carrier-damage.mjs, carrier-repair.mjs) are not fitted: a hit on her still holes
// compartments and hurts the systems in them, and the drones still seal the holes.
integrity.drones = { ...integrity.drones, from: 'drone-rack', count: 2, speed: 6 };
delete integrity.parts;
// Her crew mend what a hit wrecked (src/carrier/mend.mjs): without it a drive compartment shot below a fifth of its
// health leaves her adrift for good. A hand puts back `rate` health a second (a drive shot to nothing is back to full
// push, 70, in about a minute), you `you` with the tool kit, after `travel` seconds getting there; at a damage control
// job a hand works at `dc` of your pace. `order` is which systems come first: the reactor and the switchgear before the
// drive, which has no power without them.
integrity.mend = {
  about: 'Mending her systems (src/carrier/mend.mjs): hands on repairs (crew-orders.mjs) and you put back the health hits took from the compartments of each system in `order` (most urgent first, the worst first within one), working a sealed one from the nearest walkable room (`at` overrides by compartment id). `rate`: health a second per hand; `you`: yours, holding E with `kit`; `travel`: seconds for a hand to get to the work; `dc`: a hand\'s pace at a damage control job, of yours; `below`: health under which a compartment needs mending; `works`: by system, the health at which it works again (60 for one not named): every compartment is brought up to that, in `order`, before any is made whole.',
  rate: 1.2, you: 1.4, travel: 10, dc: 0.8, below: 99.5, kit: 'toolkit',
  // The health at which each system works again (integrity.mjs `systems`): the reactor and switchgear carry power from
  // 35 (`power.below`), the drive gives full push from 70. Everything is brought up to that before anything is whole.
  works: { reactor: 45, power: 45, drive: 70 },
  order: ['reactor', 'power', 'drive', 'life-support', 'turret', 'magazine', 'pdc', 'heat', 'sensors', 'repair', 'tanks'],
  at: {}
};

// ---- the plant ----
const plant = structuredClone(carrier.plant);
// Reaction mass by her own sums (the top of this file); the carrier's exhaust velocity. Heat is counted in shares of
// the sinks, so its rates carry over; her small panels spread in 6 s where the carrier's take 14.
plant.propellant = { ...plant.propellant, mass: PROP, tanks: ['tank-keel', 'tank-keel-aft', 'tank-port', 'tank-stbd'] };
plant.heat = { ...plant.heat, deploy: 6 };

// ---- damage control ----
const damage = structuredClone(carrier.damage);
// Every kit is kept in the damage control locker; a fault is isolated in engineering control. Her rooms are too small
// for the carrier's rules ("any room of 30 m²", "any passage over 14 m"), so each kind of job names its rooms.
damage.switchboards = ['eng-room'];
for (const k of ['patch', 'toolkit', 'suit']) damage.kits[k].rooms = ['ops-locker'];
damage.kinds.fire.rooms = ['crew-space', 'mess-nook', 'eng-room', 'flight-deck'];
damage.kinds.electrical.rooms = ['eng-room', 'flight-deck', 'ops-locker'];
damage.kinds.leak.rooms = ['passage', 'eng-room'];

// ---- crew ----
// Three couches on the flight deck: the pilot's (yours: `helm`), the gunner's to starboard of it, the commander's
// behind. The posts below are the other three of her four: the commander (who is also her pilot), the gunner, the
// engineer. `person` names who holds the post (content/people/<id>.json): the player's career (content/careers/)
// brings them aboard there, by name, to give you your orders; with no career in the page a nameless hand has it.
const helm = { room: 'flight-deck', at: [0, -10.6], eye: [0, FLOOR + 1.3, -10.75] };
const couches = { pilot: [0, -10.6], gunner: [1.5, -10.2], commander: [-1.4, -9.2] };
const stations = [
  { room: 'flight-deck', at: couches.commander, yaw: 0, pose: 'sitChair', dept: 'command', post: 'Commander', person: 'cutter-cdr', watch: 'on' },
  { room: 'flight-deck', at: couches.gunner, yaw: 0, pose: 'sitChair', dept: 'crew', post: 'Gunner', person: 'cutter-gunner', watch: 'on' },
  { room: 'eng-room', at: [0, 7.1], yaw: 3.14159, pose: 'workTable', dept: 'engineering', post: 'Engineer', person: 'cutter-eng', watch: 'on' },
];
const routes = { about: carrier.routes.about, lines: [{ name: 'Flight deck', to: 'flight-deck', color: '#58b0ff' }, { name: 'Engineering', to: 'eng-room', color: '#ff9a30' }, { name: 'Airlock', to: 'airlock', color: '#e8d84a' }] };

// The centre of mass: the heavy things are aft (reactor, drive, wing tanks), so a little aft of the middle.
const com = [0, 0, 2.5];

const L = {
  about: 'The cutter as data, built by tools/cutter.mjs: the first medium ship, a 3–4 crew craft a carrier keeps in her hangar. Metres, the ship\'s frame (x starboard, y up, -z the bow). One weightless deck, no drums, hangar or fighters. `envelope` is her outside with the radiators folded (what has to fit a hangar and a bay door), `dock` her boarding port, `couches` the flight deck\'s three seats. The entries the carrier\'s layout also has mean what they mean there (CLAUDE.md, "What the layout holds").',
  name: 'Cutter', class: 'medium', version: 2, length: Z1 - Z0, mass: MASS, com,
  sections: [{ id: 'bow', type: 'bow', z: [Z0, -8], w: 10, h: 5.8, mass: 90e3 }, { id: 'midships', type: 'midships', z: [-8, 5.2], w: 10, h: 5.8, mass: 130e3 }, { id: 'stern', type: 'stern', z: [5.2, Z1], w: 10, h: 5.8, mass: 200e3 }],
  decks, hull, compartments: comps, doors, ladders: [],
  helm, couches, dock, spawn: { deck: 1, at: [0, -2.9], yaw: 0 },
  thrusters, mounts,
  stations, routes, damage, weapons, integrity, plant,
};

// Her outside, radiators folded: the hull, the drive's bell, the turret (its model is 6.6 m tall and 32 m long over the
// barrels trained forward, at `scale`), the point defence guns (3.9 m off their mount at `scale`, along `up`), the
// manoeuvring clusters (a block 1.6 m across at `rcsScale`), the folded radiators (0.25 m proud of the skin) and the
// mast on her back (`MAST_TOP`: the tallest thing on her; tools/blender/cutter_build.py keeps everything it adds, the
// mast, antennas, sponsons and collar, inside this envelope and fails if it does not). The carrier's berths are cut to
// these numbers (tools/carrier-v2.mjs), so a change here means regenerating her too.
{
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const grow = (p) => p.forEach((v, i) => ((lo[i] = Math.min(lo[i], v)), (hi[i] = Math.max(hi[i], v))));
  for (const s of hull.main) grow([-s.w / 2, -s.h / 2, s.z]), grow([s.w / 2, s.h / 2, s.z]);
  for (const t of thrusters.main) grow([t.at[0], t.at[1], t.at[2] + t.r * 1.8]);
  for (const m of mounts) {
    const k = m.scale ?? 1;
    if (m.kind === 'turret') grow([m.at[0], m.at[1] + m.up[1] * 6.6 * k, m.at[2] - 27.5 * k]), grow([m.at[0] - 4.5 * k, m.at[1], m.at[2] + 5.5 * k]), grow([m.at[0] + 4.5 * k, m.at[1], m.at[2]]);
    if (m.kind === 'pdc') grow(m.at.map((v, i) => v + m.up[i] * 3.9 * k)), grow([m.at[0], m.at[1], m.at[2] - 3.9 * k]);
    if (m.kind === 'radiator') grow([Math.sign(m.x[0]) * (Math.min(...m.x.map(Math.abs)) + 0.25), m.y, m.z[0]]);
  }
  grow([0, MAST_TOP, 6]);
  for (const c of thrusters.rcs) grow(c.at.map((v, i) => v + Math.sign(v - com[i]) * 0.8 * thrusters.rcsScale * (i < 2 ? 1 : 0)));
  L.envelope = { about: 'Her outside with the radiators folded and the guns trained fore and aft, in the ship\'s frame: `min` and `max` corners, and `size` [beam, height, length].', min: lo.map(r1), max: hi.map(r1), size: hi.map((v, i) => r1(v - lo[i])) };
}

// ---- checks ----
const problems = [];
const [beam, height, length] = L.envelope.size;
if (length > 38 || beam > 11 || height > 8) problems.push(`envelope ${beam} × ${height} × ${length} m is over 11 × 8 × 38`);
const ids = new Set();
for (const c of comps) { if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`); ids.add(c.id); }
const walkIds = new Set(comps.filter((c) => c.access === 'walk').map((c) => c.id));
const yOf = (c) => c.y ?? [FLOOR, FLOOR + (c.h ?? ROOM_H)];
for (let i = 0; i < comps.length; i++) for (let k = i + 1; k < comps.length; k++) {
  const a = comps[i], b = comps[k], o = (p, q) => Math.min(p[1], q[1]) - Math.max(p[0], q[0]);
  if (o(a.x, b.x) > 0.01 && o(yOf(a), yOf(b)) > 0.01 && o(a.z, b.z) > 0.01) problems.push(`${a.id} overlaps ${b.id}`);
}
for (const c of comps) {
  let out = false;
  for (const x of c.x) for (const y of yOf(c)) for (const z of c.z) if (!out && !inHull(x, y, z)) (out = true), problems.push(`${c.id} pokes through the hull at (${x}, ${y}, ${z})`);
}
for (const d of doors) for (const r of d.between) if (!walkIds.has(r)) problems.push(`door to unknown room ${r}`);
const roomAt = ([x, z]) => comps.find((c) => c.access === 'walk' && x >= c.x[0] && x <= c.x[1] && z >= c.z[0] && z <= c.z[1]);
for (const c of comps.filter((c) => c.access === 'walk')) {
  if (!doors.some((d) => d.between.includes(c.id))) problems.push(`${c.id} has no door`);
  if (!c.float) problems.push(`${c.id} is not weightless`);
}
for (const t of weapons.turrets) if (!roomAt(t.from.at)) problems.push(`${t.name}'s hatch is not in a room`);
if (!roomAt(L.spawn.at)) problems.push('spawn is not in a room');
if (roomAt(helm.at)?.id !== helm.room) problems.push('the helm is not on the flight deck');
for (const [k, at] of Object.entries(couches)) if (roomAt(at)?.id !== helm.room) problems.push(`the ${k}'s couch is not on the flight deck`);
if (roomAt([dock.at[0] - 0.1, dock.at[2]])?.id !== dock.room) problems.push('the dock port is not in the airlock\'s wall');
for (const m of mounts) if (m.kind === 'turret' && !(m.up[0] === 0 && m.up[2] === 0 && Math.abs(m.up[1]) === 1)) problems.push(`${m.id}: a turret must stand on top or underneath`);
for (const m of mounts.filter((m) => m.at)) if (!inHull(m.at[0] * 0.97, m.at[1] * 0.97, m.at[2], -0.3) || inHull(m.at[0] * 1.12, m.at[1] * 1.12, m.at[2], 0)) problems.push(`mount ${m.id} is not on the hull's skin`);
for (const c of thrusters.rcs) if (!inHull(c.at[0] * 0.97, c.at[1] * 0.97, c.at[2], -0.3)) problems.push(`manoeuvring cluster at ${c.at} is off the hull`);

// What she can do, for the record (the helm's own sums are newton.mjs's: `__carrier.thrusters.cap`).
// Yaw as the helm allocates it: of each cluster's nozzles, the outboard one of the four clusters that turn her the way
// asked and the fore-and-aft one of four, each throttled by its lever arm over the longest.
const Iy = (MASS * (10 ** 2 + (Z1 - Z0) ** 2)) / 12;
const arms = thrusters.rcs.flatMap((c) => [Math.abs(c.at[2] - com[2]), Math.abs(c.at[0])]);
const alpha = (thrusters.rcsForce * arms.reduce((a, r) => a + (r * r) / Math.max(...arms), 0)) / 2 / Iy;
console.log(`${L.name}: ${Z1 - Z0} m hull, envelope ${beam} × ${height} × ${length} m (beam × height × length, radiators folded), ${MASS / 1000} t (${PROP / 1000} t reaction mass), centre of mass z ${com[2]}`);
console.log(`Main drive ${thrusters.main[0].force / 1e6} MN: ${r1(thrusters.main[0].force / MASS)} m/s² loaded, ${r1(thrusters.main[0].force / (MASS - PROP))} dry; Δv ${Math.round(plant.propellant.isp * 9.81 * Math.log(MASS / (MASS - PROP)) / 1000)} km/s`);
console.log(`Manoeuvring: ${thrusters.rcs.length} clusters of ${thrusters.rcsForce / 1000} kN a nozzle; yaw about ${r3(alpha)} rad/s², a 180° turn in about ${r1(2 * Math.sqrt(Math.PI / alpha))} s`);
console.log(`${comps.filter((c) => c.access === 'walk').length} walkable rooms, ${comps.filter((c) => c.access === 'sealed').length} sealed, ${doors.length} doors; ${mounts.filter((m) => m.kind === 'turret').length} turret, ${mounts.filter((m) => m.kind === 'pdc').length} point defence, ${weapons.tubes.at.length} tubes, ${mounts.filter((m) => m.kind === 'radiator').length} radiators`);
{
  const vol = comps.reduce((a, c) => { const y = yOf(c); return a + (c.x[1] - c.x[0]) * (y[1] - y[0]) * (c.z[1] - c.z[0]); }, 0);
  console.log(`Compartments account for ${Math.round(vol)} m³`);
}

const index = {
  about: 'The cutter: the first medium ship. Her layout is split into the files named in `layout` (each holds the top-level entries listed), joined at load in this order (src/core/ship.mjs `loadLayout`). tools/cutter.mjs writes them and this file: do not edit them by hand. She has no career, watch bill or voices of her own (career.json, watches.json, voices.json are optional).',
  layout: {
    ship: ['about', 'name', 'class', 'version', 'length', 'mass', 'com', 'envelope', 'sections', 'hull', 'helm', 'couches', 'dock', 'spawn', 'thrusters'],
    decks: ['decks', 'compartments', 'doors', 'ladders'],
    mounts: ['mounts'],
    stations: ['stations', 'routes'],
    damage: ['damage'],
    weapons: ['weapons'],
    integrity: ['integrity'],
    plant: ['plant'],
  },
};

if (problems.length) { console.log(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}`); process.exitCode = 1; }
else console.log('\nChecks: inside the envelope, no overlaps, everything inside the hull, every room has a door, every mount on the skin.');
if (!CHECK_ONLY && !problems.length) {
  mkdirSync(here('ships/cutter'), { recursive: true });
  const files = splitLayout(L, index);
  writeFileSync(here('ships/cutter/index.json'), JSON.stringify(index, null, 1) + '\n');
  for (const [f, part] of Object.entries(files)) writeFileSync(here(`ships/cutter/${f}.json`), JSON.stringify(part, null, 1) + '\n');
  console.log(`Wrote ships/cutter/: index.json, ${Object.keys(files).map((f) => f + '.json').join(', ')}`);
}
{
  const { problems: content } = await check({ ship: 'cutter' });
  if (content.length) {
    console.log(`\ntools/check.mjs: ${content.length} problem${content.length > 1 ? 's' : ''}${CHECK_ONLY ? ' (in the layout on disk; this run wrote nothing)' : ''}:\n  ${content.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('tools/check.mjs: no problems.');
}
