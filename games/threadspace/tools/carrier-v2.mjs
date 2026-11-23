// Builds the spin-drum carrier's layout, the files in ships/carrier/ that its index.json names, from her design.
//
//   node tools/carrier-v2.mjs            # from this folder; writes the layout and prints its checks
//   node tools/carrier-v2.mjs --check    # checks only, writes nothing
//
// The design is design/carrier-v2.design.json (made in design/ship-designer.html). The drum's rooms come from the
// designer's own room plan (its `// ==LOGIC==` block, run here), so changing the design and running this again moves
// them. The weightless hull's rooms (bow, spine, hangar, stern, bridge tower) are written out below, sized from the
// design's sections. The parts of today's layout that are not about where things are (the fighter, the weapons'
// numbers, integrity, the plant, damage control) are carried over from the first carrier's, archive/carrier-v1/carrier-v1.layout.json.
//
// Frame: metres, x starboard, y up, -z the bow, as every ship here. The ship's axis (the drums' axis and the spine) is
// x = 0, y = 0, and the ship runs from z = -length/2 (bow) to +length/2.
//
// Drum rooms are not in `compartments`: they are in `drum.rooms`, each in its own segment's frame. Segment k of a
// drum's 40 is turned 2πk/40 about the axis (from straight down, the way the drum spins); in that frame a room is an
// ordinary box: x across the segment, z along the ship, and its deck's floor at y = -floorR (down is out, away from the
// axis). So the game can build a segment's rooms the way it builds a deck today, and spin the lot.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitLayout, loadLayout } from '../src/core/ship.mjs';
import { check } from './check.mjs';

const here = (p) => new URL('../' + p, import.meta.url);
const CHECK_ONLY = process.argv.includes('--check');

// ---- the design, and the designer's own sums ----
const html = readFileSync(here('design/ship-designer.html'), 'utf8');
const logic = html.slice(html.indexOf('// ==LOGIC=='), html.indexOf('// ==/LOGIC=='));
const D = await import('data:text/javascript,' + encodeURIComponent(logic + '\nexport { analyze, drumLayout, USE, capOf };'));
const design = JSON.parse(readFileSync(here('design/carrier-v2.design.json')));
const A = D.analyze(design);
const v1 = JSON.parse(readFileSync(here('archive/carrier-v1/carrier-v1.layout.json'))); // archived, but still the source of these numbers

const T = A.T;
const sec = {}; // each section's z range, by type (drums as drum-a, drum-b)
{
  let z = -T / 2, drums = 0;
  for (const x of A.secs) {
    const id = x.s.type === 'drum' ? `drum-${'ab'[drums++]}` : x.s.type;
    sec[id] = { s: x.s, size: x.size, z: [z, z + x.size.L], mass: Object.values(x.mass).reduce((a, b) => a + b, 0), spin: x.spin, i: x.i };
    z += x.size.L;
  }
}
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
need(sec.bow && sec['drum-a'] && sec['drum-b'] && sec.hangar && sec.stern, 'The generator expects bow, two drums, hangar, stern.');
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

const bow = sec.bow, hgr = sec.hangar, stn = sec.stern, dA = sec['drum-a'], dB = sec['drum-b'];
const SKIN = 1; // the hull's own frames and armour, in from the skin

// ---- the hull ----
// A loft of chamfered sections like today's (`c` is the chamfer as a share of the smaller half-size; 0.586 makes a
// regular octagon, the nearest the loft gets to the drum's round sleeve). Two sections close together make a step.
const sleeveR = dA.size.w / 2; // the fixed armoured sleeve's outer radius
const step = 0.3;
const bs = bow.s;
const hull = {
  main: [
    { z: bow.z[0], w: r1(bs.w * bs.taper), h: r1(bs.h * bs.taper), y: 0 },
    { z: r1(bow.z[0] + bs.L * 0.45), w: r1(bs.w * 0.92), h: r1(bs.h * 0.92), y: 0 },
    { z: bow.z[1] - step, w: bs.w, h: bs.h, y: 0 },
    { z: dA.z[0], w: 2 * sleeveR, h: 2 * sleeveR, y: 0, c: 0.586 },
    { z: dB.z[1], w: 2 * sleeveR, h: 2 * sleeveR, y: 0, c: 0.586 },
    { z: hgr.z[0] + step, w: hgr.s.w, h: hgr.s.h, y: 0 },
    { z: hgr.z[1] - step, w: hgr.s.w, h: hgr.s.h, y: 0 },
    { z: stn.z[0], w: stn.s.w, h: stn.s.h, y: 0 },
    { z: stn.z[1], w: stn.s.w, h: stn.s.h, y: 0 },
  ],
  // The bridge tower on the stern's back, like a star destroyer's. Inside 18..32 m up. Its front is a sheer face (the
  // second and third sections) with the bridge's forward windows in it, over a low nose, so the bridge looks forward
  // over the hangar's back and through the drum section's open sleeve to the bow.
  island: [
    { z: stn.z[0] + 5, w: 16, h: 6, y: 20, c: 0.2 },
    { z: stn.z[0] + 12.8, w: 24, h: 8, y: 21, c: 0.2 },
    { z: stn.z[0] + 13, w: 24, h: 16, y: 25, c: 0.2 },
    { z: stn.z[0] + 35, w: 24, h: 16, y: 25, c: 0.2 },
    { z: stn.z[0] + 43, w: 14, h: 8, y: 22, c: 0.2 },
  ],
};

/** Inside the loft `S` at (x, y, z), `inset` metres in from the skin. */
function inLoft(S, x, y, z, inset = SKIN) {
  if (z < S[0].z || z > S[S.length - 1].z) return false;
  let i = 0;
  while (S[i + 1].z < z) i++;
  const t = (z - S[i].z) / (S[i + 1].z - S[i].z || 1);
  const lerp = (k, d = 0) => (S[i][k] ?? d) + ((S[i + 1][k] ?? d) - (S[i][k] ?? d)) * t;
  const a = lerp('w') / 2 - inset, b = lerp('h') / 2 - inset, cy = lerp('y'), c = Math.min(a, b) * lerp('c', 0.32);
  const px = Math.abs(x), py = Math.abs(y - cy);
  return px <= a && py <= b && px + py <= a + b - c;
}
const inHull = (x, y, z, inset) => inLoft(hull.main, x, y, z, inset) || inLoft(hull.island, x, y, z, inset);

// ---- the weightless hull's decks ----
// Down is the ship's -y, as today; with no spin and no burn the crew wear grip shoes. Floors in metres.
const decks = [
  { id: 1, name: 'Bridge tower', floor: 26 },
  { id: 2, name: 'Crew tunnel deck', floor: 13 },
  { id: 3, name: 'Upper deck', floor: 3 },
  { id: 4, name: 'Spine deck', floor: -1.5 },
  { id: 5, name: 'Lower deck', floor: -6.5 },
  { id: 6, name: 'Hangar floor', floor: -12 },
  { id: 7, name: 'Keel passage deck', floor: -16.4 },
];
const floorOf = Object.fromEntries(decks.map((d) => [d.id, d.floor]));

const comps = [];
/** A walkable room. */
// A walkable room of the fixed hull. Outside the drums there is no weight (ROADMAP decision 2): every one is `float`
// (weightless.mjs), the airless hangar too, which you cross by its gangway (sets/hangar.mjs, phase 5).
const W = (id, name, deck, system, x, z, more = {}) => comps.push({ id, name, deck, access: 'walk', system, x, z, float: true, ...more });
/** A sealed compartment (machinery, tanks, magazines). */
const X = (id, name, system, x, y, z, more = {}) => comps.push({ id, name, access: 'sealed', system, x, y, z, ...more });

// Bow: the forward torpedo battery, the bow turrets, point defence, sensors. Spine passage on deck 4.
{
  const z0 = bow.z[0], z1 = bow.z[1] - 0.2;
  X('tube-nest', 'Forward torpedo tubes', 'magazine', [-9, 9], [-5, 5], [z0 + 3, z0 + 15.6]);
  W('torpedo-room', 'Forward torpedo room', 4, 'magazine', [-10, 10], [z0 + 16, z0 + 29.6], { h: 3.6, fit: 'machines' });
  X('missile-mag', 'Torpedo magazine', 'magazine', [-12, 12], [-8.8, -2], [z0 + 17, z0 + 29.6]);
  W('bow-passage', 'Bow passage', 4, 'corridor', [-1.5, 1.5], [z0 + 30, z1]);
  W('sensor-proc', 'Sensor processing', 4, 'sensors', [-12, -1.9], [z0 + 30, z0 + 41.6], { fit: 'office' });
  W('repair-fwd', 'Forward repair locker', 4, 'damage', [1.9, 12], [z0 + 30, z0 + 41.6], { fit: 'lockers' });
  W('security', 'Security office', 4, 'armoury', [-12, -1.9], [z0 + 42, z0 + 53.6], { fit: 'office' });
  W('fan-fwd', 'Forward fan room', 4, 'life-support', [1.9, 12], [z0 + 42, z0 + 53.6], { fit: 'machines' });
  X('aux-fwd', 'Forward auxiliary machinery', 'aux', [-12, -1.9], [-1.5, 2.3], [z0 + 54, z1]);
  X('stores-fwd', 'Forward stores', 'stores', [1.9, 12], [-1.5, 2.3], [z0 + 54, z1]);
  X('pdc-mag-p', 'Point defence magazine, port', 'pdc', [-20, -12.4], [-6, 2.3], [z0 + 42, z0 + 64]);
  X('pdc-mag-s', 'Point defence magazine, starboard', 'pdc', [12.4, 20], [-6, 2.3], [z0 + 42, z0 + 64]);
  // Deck 3, over the spine
  W('bow-upper', 'Bow upper passage', 3, 'corridor', [-1.5, 1.5], [z0 + 32, z0 + 64]);
  W('sensor-ops', 'Sensor operations', 3, 'sensors', [-10, -1.9], [z0 + 32, z0 + 43.6], { fit: 'office' });
  W('armoury', 'Armoury', 3, 'armoury', [1.9, 10], [z0 + 32, z0 + 43.6], { fit: 'lockers' });
  W('dorsal-access', 'Bow dorsal turret access', 3, 'turret', [1.9, 10], [z0 + 44, z0 + 55.6]);
  W('brig', 'Brig', 3, 'armoury', [-10, -1.9], [z0 + 44, z0 + 55.6], { fit: 'cells' });
  // Deck 5, under it
  W('bow-lower', 'Bow lower passage', 5, 'corridor', [-1.5, 1.5], [z0 + 32, z0 + 64]);
  W('ventral-access', 'Bow ventral turret access', 5, 'turret', [1.9, 10], [z0 + 44, z0 + 55.6]);
  W('ordnance-shop', 'Torpedo workshop', 5, 'magazine', [-10, -1.9], [z0 + 32, z0 + 43.6], { fit: 'workshop' });
  W('cold-stores', 'Cold stores', 5, 'stores', [1.9, 10], [z0 + 32, z0 + 43.6], { fit: 'shelves' });
  // The bow turrets, top and bottom on the centreline (a pair fired together cancels the roll)
  const tz = z0 + 52;
  X('dorsal-barbette', 'Bow dorsal barbette', 'turret', [-4, 4], [7.2, 11.2], [tz - 4, tz + 4]);
  X('magazine', 'Bow dorsal magazine', 'magazine', [-8, 8], [7.2, 11.2], [tz + 4.4, tz + 14]);
  X('ventral-barbette', 'Bow ventral barbette', 'turret', [-4, 4], [-11.2, -7.2], [tz - 4, tz + 4]);
  X('magazine-fwd', 'Bow ventral magazine', 'magazine', [-8, 8], [-11.2, -7.2], [tz + 4.4, tz + 14]);
}

// Through the drums: the fixed spine, on the axis. The hub rings turn round it (in `drum`).
W('spine', 'Spine', 4, 'corridor', [-1.5, 1.5], [dA.z[0] + 0.2, dB.z[1] - 0.2], { float: true });

// Hangar: airless and weightless. The crew tunnel along its roof, the keel passage under its floor, both pressurised.
const hz0 = hgr.z[0], hz1 = hgr.z[1];
// The hangar holds six fighters and two berthed medium ships (ROADMAP phase 11). One long launch door a side: forward,
// `PADS` metres of it for that side's three fighter pads; aft of them, `BERTH` metres in front of that side's berth,
// where a cutter lies fore and aft on her cradle and goes out sideways. The berthed ship is read from her own folder
// (`BERTH_SHIP`), so her envelope and docking port are hers, not numbers copied here.
const BERTH_SHIP = 'cutter';
const cutter = await loadLayout(fileURLToPath(here(`ships/${BERTH_SHIP}`)), async (f) => JSON.parse(readFileSync(f)));
need(cutter.envelope && cutter.dock, `ships/${BERTH_SHIP} has no envelope or dock`);
const HANGAR_X = 19;  // the hangar's half-width inside
const CLEAR = 3;      // metres clear all round a berthed ship
const PADS = 19;      // the door's length in front of a side's fighter pads
const BERTH = Math.max(44, Math.ceil(cutter.envelope.size[2] + 2 * CLEAR + 1)); // and in front of its berth
const doorZ = [hz0 + 42, hz0 + 42 + PADS + BERTH]; // the launch doors, both sides
const DOOR_H = 18;
const hgrZ = [hz0 + 4, doorZ[1] + 16]; // the hangar itself: 38 m forward of the doors (the airlock end), 16 m aft of them
const hTurrets = [hz0 + 20, hz0 + 72, hz0 + 124];
const hx = hgr.s.w / 2; // the hangar section's skin
need(hz1 - hgrZ[1] >= 20 && hz1 - doorZ[1] >= 36, 'The hangar section is too short for its doors, berths and after magazines.');
{
  W('fwd-trunk', 'Forward trunk', 4, 'corridor', [-1.5, 1.5], [hz0 + 0.4, hz0 + 3.6], { float: true });
  // The way into the airless hangar from inside the ship: an airlock under the forward trunk. From its outer door the
  // gangway runs aft down the hangar's middle, a spur off it to each fighter (sets/hangar.mjs).
  W('hangar-lock', 'Hangar airlock', 6, 'corridor', [-3, 3], [hz0 + 0.4, hz0 + 3.6], { h: 3.2, airlock: true });
  W('hangar', 'Hangar', 6, 'hangar', [-HANGAR_X, HANGAR_X], hgrZ, {
    h: 23, vacuum: true,
    bayDoors: [{ side: 'w', from: doorZ[0], to: doorZ[1], height: DOOR_H }, { side: 'e', from: doorZ[0], to: doorZ[1], height: DOOR_H }],
  });
  const ox = [HANGAR_X + 0.4, hx - 1.5]; // the ordnance rooms, between the hangar's wall and the skin
  X('ordnance-p', 'Broadside tubes, port, forward', 'magazine', [-ox[1], -ox[0]], [-12, 11], [hz0 + 4, doorZ[0] - 0.4]);
  X('ordnance-s', 'Broadside tubes, starboard, forward', 'magazine', ox, [-12, 11], [hz0 + 4, doorZ[0] - 0.4]);
  X('ordnance-p-aft', 'Broadside tubes, port, aft', 'magazine', [-ox[1], -ox[0]], [-12, 11], [doorZ[1] + 0.4, hz1 - 2.4]);
  X('ordnance-s-aft', 'Broadside tubes, starboard, aft', 'magazine', ox, [-12, 11], [doorZ[1] + 0.4, hz1 - 2.4]);
  X('aircraft-spares', 'Aircraft and boat spares', 'stores', [-HANGAR_X, -0.4], [-12, -2], [hgrZ[1] + 0.4, hz1 - 2.4]);
  X('fighter-ordnance', 'Fighter and boat ordnance', 'magazine', [0, HANGAR_X], [-12, -2], [hgrZ[1] + 0.4, hz1 - 2.4]);
  X('fighter-fuel', 'Fighter and boat propellant', 'tanks', [-HANGAR_X, HANGAR_X], [-1.6, 10], [hgrZ[1] + 0.4, hz1 - 2.4]);
  // The crew tunnel and the rooms beside it (deck 2). Pilots go from here down the forward trunk to the hangar airlock,
  // and along the gangway to their fighters, in their duty suits.
  W('tunnel', 'Crew tunnel', 2, 'corridor', [-1.5, 1.5], [hz0 + 0.4, hz1 - 0.2], { float: true });
  W('pilots-ready', 'Pilots’ ready room', 2, 'flight', [1.9, 12], [hz0 + 4, hz0 + 15.6], { fit: 'briefing' });
  W('flight-gear', 'Flight gear', 2, 'flight', [1.9, 12], [hz0 + 16, hz0 + 27.6], { fit: 'lockers' });
  W('flight-ops', 'Flight operations', 2, 'flight', [1.9, 12], [hz0 + 28, hz0 + 39.6], { fit: 'office' });
  W('flight-control', 'Flight control', 2, 'flight', [1.9, 12], [hz0 + 40, hz0 + 51.6], { fit: 'office' });
  W('repair-mid', 'Midships repair locker', 2, 'damage', [1.9, 12], [hz0 + 52, hz0 + 63.6], { fit: 'lockers' });
  W('avionics', 'Avionics workshop', 2, 'repair', [1.9, 12], [hz0 + 64, hz0 + 75.6], { fit: 'workshop' });
  W('fan-mid', 'Midships fan room', 2, 'life-support', [1.9, 12], [hz0 + 76, hz0 + 87.6], { fit: 'machines' });
  // Port of the tunnel, between the dorsal barbettes: the aircrew's rooms forward, the boat crews' (the berthed
  // cutters') aft, over their berths.
  W('aircrew', 'Aircrew office', 2, 'flight', [-14, -1.9], [hTurrets[0] + 4.4, hTurrets[0] + 25.6], { fit: 'office' });
  W('flight-equip', 'Flight equipment', 2, 'flight', [-14, -1.9], [hTurrets[0] + 26, hTurrets[1] - 4.4], { fit: 'shelves' });
  W('boat-crews', 'Boat crews’ ready room', 2, 'flight', [-14, -1.9], [hTurrets[1] + 4.4, hTurrets[1] + 25.6], { fit: 'briefing' });
  W('boat-stores', 'Boat stores', 2, 'stores', [-14, -1.9], [hTurrets[1] + 26, hTurrets[2] - 4.4], { fit: 'shelves' });
  // The keel passage under the hangar floor, between the tanks (deck 7)
  W('keel', 'Keel passage', 7, 'corridor', [-1.5, 1.5], [hz0 + 0.4, hz1 - 0.2], { h: 3.2, float: true });
  // Turrets: three on the roof (port of the tunnel) and three under the floor (starboard of the keel)
  hTurrets.forEach((z, i) => {
    X(`barbette-h${i + 1}d`, `Hangar dorsal barbette ${i + 1}`, 'turret', [-14, -6], [12.2, 16.8], [z - 4, z + 4]);
    X(`barbette-h${i + 1}v`, `Hangar ventral barbette ${i + 1}`, 'turret', [6, 14], [-16.8, -12.4], [z - 4, z + 4]);
  });
  // Propellant under the floor: port all along, starboard between the ventral barbettes
  X('hangar-bottom', 'Hangar bottom tanks, port', 'tanks', [-17.5, -1.9], [-16.8, -12.4], [hz0 + 0.4, hz1 - 0.4]);
  [[hz0 + 0.4, hTurrets[0] - 4.4], [hTurrets[0] + 4.4, hTurrets[1] - 4.4], [hTurrets[1] + 4.4, hTurrets[2] - 4.4], [hTurrets[2] + 4.4, hz1 - 0.4]]
    .forEach((z, i) => X(`hangar-bottom-${i + 2}`, `Hangar bottom tanks, starboard ${i + 1}`, 'tanks', [1.9, 17.5], [-16.8, -12.4], z));
  X('pdc-mag-h', 'Point defence magazine, hangar', 'pdc', [-14, -1.9], [12.2, 16.8], [hz0 + 4, hTurrets[0] - 4.4]);
}

// Stern: engines, reactor, radiators, the CIC in the armoured hull, the bridge tower on top.
const sz0 = stn.z[0], sz1 = stn.z[1];
{
  W('eng-passage', 'Engineering passage', 2, 'corridor', [-1.5, 1.5], [sz0 + 0.2, sz0 + 44.6]);
  W('cic', 'Combat information centre', 2, 'bridge', [-14, -1.9], [sz0 + 4, sz0 + 20.6]);
  W('damage-control', 'Damage control centre', 2, 'damage', [-14, -1.9], [sz0 + 21, sz0 + 32.6]);
  W('switchboard', 'Main switchboard', 2, 'power', [-14, -1.9], [sz0 + 33, sz0 + 38.6], { fit: 'machines' });
  W('dc-store', 'Damage control store', 2, 'damage', [-14, -1.9], [sz0 + 39, sz0 + 44.6], { fit: 'shelves' });
  W('flag-plot', 'Flag plot', 2, 'bridge', [1.9, 14], [sz0 + 4, sz0 + 12.6], { fit: 'office' });
  W('comms', 'Communications', 2, 'bridge', [1.9, 14], [sz0 + 13, sz0 + 20.6], { fit: 'office' });
  W('eng-control', 'Engineering control', 2, 'engineering', [1.9, 14], [sz0 + 21, sz0 + 36.6]);
  W('eng-office', 'Engineer’s office', 2, 'engineering', [1.9, 14], [sz0 + 37, sz0 + 44.6], { fit: 'office' });
  // The bridge tower (deck 1)
  W('bridge', 'Bridge', 1, 'bridge', [-10, 10], [sz0 + 13.5, sz0 + 25], {
    h: 3.5,
    windows: [{ side: 'w', from: sz0 + 14, to: sz0 + 24.5, sill: 0.45, head: 3.3 }, { side: 'e', from: sz0 + 14, to: sz0 + 24.5, sill: 0.45, head: 3.3 }, { side: 'n', from: -9, to: 9, sill: 1.0, head: 3.3 }],
  });
  W('tower-passage', 'Tower passage', 1, 'corridor', [-1.5, 1.5], [sz0 + 25.4, sz0 + 34.6]);
  W('nav-office', 'Navigation office', 1, 'bridge', [-10, -1.9], [sz0 + 25.4, sz0 + 34.6], { fit: 'office' });
  W('captains-cabin', 'Captain’s cabin', 1, 'quarters', [1.9, 10], [sz0 + 25.4, sz0 + 34.6], { fit: 'office' });
  // Machinery, sealed
  W('keel-aft', 'Aft keel lobby', 7, 'corridor', [-1.5, 1.5], [sz0 + 0.2, sz0 + 4.6], { h: 3.2, float: true });
  X('barbette-sv', 'Stern ventral barbette', 'turret', [-5, 5], [-16.8, -6], [sz0 + 5, sz0 + 13]);
  X('magazine-sv', 'Stern ventral magazine', 'magazine', [-5, 5], [-16.8, -6], [sz0 + 13.4, sz0 + 18.6]);
  X('tanks-aft', 'Aft tanks, port', 'tanks', [-18, -5.4], [-16.4, -3], [sz0 + 5, sz0 + 18.6]);
  X('tanks-aft-s', 'Aft tanks, starboard', 'tanks', [5.4, 18], [-16.4, -3], [sz0 + 5, sz0 + 18.6]);
  X('drone-bay', 'Repair drone bay', 'repair', [-18, -6.4], [-2.6, 12.2], [sz0 + 5, sz0 + 18.6]);
  X('heatsink-p', 'Heat sinks', 'heat', [-6, 6], [-2.6, 12.2], [sz0 + 5, sz0 + 18.6]);
  X('heatsink-s', 'Heat sinks, starboard', 'heat', [6.4, 18], [-2.6, 12.2], [sz0 + 5, sz0 + 18.6]);
  X('reactor', 'Fusion reactor', 'reactor', [-12, 12], [-14, 8], [sz0 + 19, sz0 + 35]);
  X('power', 'Power plant', 'power', [-22, -12.4], [-10, 8], [sz0 + 19, sz0 + 35]);
  X('life-support', 'Life support', 'life-support', [12.4, 22], [-10, 8], [sz0 + 19, sz0 + 35]);
  X('coolant-header', 'Coolant header', 'cooling', [-18, 18], [8.4, 12.2], [sz0 + 19, sz0 + 44.6]);
  X('drive', 'Main drive machinery', 'drive', [-20, 20], [-14, 8], [sz0 + 35.4, sz1 - 1.4]);
  X('barbette-sd', 'Stern dorsal barbette', 'turret', [-5, 5], [8.4, 16.8], [sz0 + 45, sz1 - 1.4]);
}

// The rest of the fixed hull: a warship has no empty space to spare (`node tools/carrier-space.mjs
// ships/carrier` maps what is left). Tanks and stores against the skin, the machinery that serves the
// rooms beside it, the structure the hangar hangs from.
{
  const z0 = bow.z[0], bz1 = bow.z[1] - 0.2, tz = z0 + 52;
  const both = (id, name, system, x, y, z) => { X(`${id}-p`, `${name}, port`, system, [-x[1], -x[0]], y, z); X(`${id}-s`, `${name}, starboard`, system, x, y, z); };
  // Bow
  X('sensor-array', 'Forward sensor array', 'sensors', [-10, 10], [3.2, 8], [z0 + 16, z0 + 29.6]);
  both('torpedo-wing', 'Torpedo room wing stores', 'stores', [10.4, 15], [-1.5, 3], [z0 + 17, z0 + 29.6]);
  X('sensor-bay', 'Sensor equipment bay', 'sensors', [-10, 10], [7.2, 10], [z0 + 32, tz - 4.4]);
  both('bow-upper-stores', 'Bow upper stores', 'stores', [10.4, 19], [3, 9], [z0 + 32, bz1]);
  both('bow-upper-aft', 'Bow upper machinery', 'aux', [1.9, 10], [3, 6.8], [z0 + 56, bz1]);
  X('bow-bilge', 'Bow lower tanks', 'tanks', [-12, 12], [-10.6, -7], [z0 + 32, tz - 4.4]);
  both('bow-lower-wing', 'Bow lower stores', 'stores', [10.4, 17], [-6.5, -2], [z0 + 32, z0 + 41.6]);
  both('bow-lower-aft', 'Bow lower machinery', 'aux', [1.9, 10], [-6.5, -2.7], [z0 + 56, bz1]);
  X('ventral-wing-p', 'Bow ventral turret wing, port', 'tanks', [-10, -1.9], [-6.5, -2.7], [z0 + 44, z0 + 55.6]);
  // Hangar: the roof girders the crew tunnel deck stands on, the bay door housings over the doors, bulkhead tanks at
  // both ends, air trunking outboard of the tunnel deck's rooms, bilge tanks outboard of the bottom tanks.
  X('hangar-roof', 'Hangar roof girders', 'aux', [-(hx - 2.5), hx - 2.5], [11.4, 12.1], [hz0 + 4, hz1 - 2.4]);
  both('bay-housing', 'Bay door housing', 'aux', [HANGAR_X + 0.4, hx - 1.5], [DOOR_H - 12 + 0.4, 11], [doorZ[0], doorZ[1]]);
  both('hangar-fwd-tanks', 'Forward hangar bulkhead tanks', 'tanks', [3.4, hx - 3.5], [-12, 12.8], [hz0 + 0.4, hz0 + 3.6]);
  both('hangar-aft-tanks', 'Aft hangar bulkhead tanks', 'tanks', [1.9, hx - 3.5], [-12, 12.8], [hz1 - 2.2, hz1 - 0.4]);
  X('tunnel-air-p', 'Tunnel deck air trunking, port', 'life-support', [-18.5, -14.4], [13, 16.8], [hz0 + 4, hz1 - 2.4]);
  X('tunnel-air-s', 'Tunnel deck air trunking, starboard', 'life-support', [12.4, 18.5], [13, 16.8], [hz0 + 4, hz1 - 2.4]);
  both('hangar-bilge', 'Hangar bilge tanks', 'tanks', [17.9, 20.5], [-15, -12.4], [hz0 + 0.4, hz1 - 0.4]);
  hTurrets.forEach((z, i) => X(`hoist-h${i + 1}d`, `Hangar dorsal turret ${i + 1} hoist`, 'turret', [-5.6, -1.9], [12.2, 16.8], [z - 4, z + 4]));
  W('mid-stores', 'Midships stores', 2, 'stores', [1.9, 12], [hz0 + 88, hz0 + 99.6], { fit: 'shelves' });
  // Aft of them, over the berths: the cutters' operations room and their crews' gear, then the washroom and a workshop.
  W('boat-ops', 'Boat operations', 2, 'flight', [1.9, 12], [hz0 + 100, hz0 + 111.6], { fit: 'office' });
  W('boat-gear', 'Boat crews’ gear', 2, 'flight', [1.9, 12], [hz0 + 112, hz0 + 123.6], { fit: 'lockers' });
  W('heads-mid', 'Midships washroom', 2, 'water', [1.9, 12], [hz0 + 124, hz0 + 133.6], { fit: 'washroom' });
  W('boat-shop', 'Boat workshop', 2, 'repair', [1.9, 12], [hz0 + 134, hz1 - 2.6], { fit: 'workshop' });
  W('aircrew-rest', 'Aircrew rest room', 2, 'welfare', [-14, -1.9], [hTurrets[2] + 4.4, hz1 - 2.6], { fit: 'tables' });
  // Stern
  both('stern-fwd-tanks', 'Forward stern tanks', 'tanks', [1.9, 18], [-15, 12.6], [sz0 + 0.4, sz0 + 4.6]);
  both('eng-air', 'Engineering air trunking', 'life-support', [14.4, 18.6], [13, 16.6], [sz0 + 0.2, sz0 + 44.6]);
  both('radiator-root', 'Radiator roots', 'heat', [5.4, 18.8], [8.4, 16.4], [sz0 + 45, sz1 - 1.4]);
  X('reactor-shield', 'Reactor shield tanks', 'tanks', [-12, 12], [-16.6, -14.4], [sz0 + 19, sz0 + 35]);
  both('plant-bilge', 'Plant bilge tanks', 'tanks', [12.4, 18.8], [-16.6, -10.4], [sz0 + 19, sz0 + 35]);
  X('drive-bilge', 'Drive bilge tanks', 'tanks', [-18, 18], [-16.6, -14.4], [sz0 + 35.4, sz1 - 1.4]);
  both('stern-wing', 'Stern wing stores', 'stores', [18.4, 22], [-2.6, 12.2], [sz0 + 5, sz0 + 18.6]);
  both('coolant-wing', 'Coolant wing', 'cooling', [18.4, 22], [8.4, 12.2], [sz0 + 19, sz0 + 44.6]);
}

// Doors between each walkable room and the passage it opens onto (walls within 1.5 m, same deck), at the middle of
// the wall they share. Passages that meet end to end get one too.
const doors = [];
{
  const walk = comps.filter((c) => c.access === 'walk');
  const corridors = walk.filter((c) => c.system === 'corridor');
  const overlap = (a, b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
  for (const r of walk) for (const p of corridors) {
    if (r === p || r.deck !== p.deck) continue;
    if (r.system === 'corridor' && doors.some((d) => d.between.includes(r.id) && d.between.includes(p.id))) continue;
    const ox = overlap(r.x, p.x), oz = overlap(r.z, p.z);
    const gx = Math.min(Math.abs(r.x[0] - p.x[1]), Math.abs(r.x[1] - p.x[0]));
    const gz = Math.min(Math.abs(r.z[0] - p.z[1]), Math.abs(r.z[1] - p.z[0]));
    let at = null;
    if (gx <= 1.5 && oz[1] - oz[0] >= 2) at = (oz[0] + oz[1]) / 2;       // side by side: a door in the long wall
    else if (gz <= 1.5 && ox[1] - ox[0] >= 1.6) at = (ox[0] + ox[1]) / 2; // end on
    if (at === null) continue;
    doors.push({ between: [p.id, r.id], at: r1(at), w: r.system === 'corridor' ? Math.min(1.6, (r.x[1] - r.x[0]) - 0.4) : (r.id === 'hangar' ? 2.4 : 1.4) });
  }
}

// Ladders: trunks between decks (weightless, so a ladder is a line of handholds; the game keeps its fade between decks).
const lad = (id, a, b) => ({ id, a: { deck: a[0], at: a[1], yaw: a[2] ?? 0 }, b: { deck: b[0], at: b[1], yaw: b[2] ?? 0 } });
const ladders = [
  lad('ladder-bow-up', [4, [0, bow.z[0] + 62]], [3, [0, bow.z[0] + 62]]),
  lad('ladder-bow-down', [4, [0, bow.z[0] + 60]], [5, [0, bow.z[0] + 60]]),
  // The forward trunk's three: the one up at the forward end, the two down side by side aft of it, so no two hatches
  // overlap and the way up is a hatch overhead, the ways down two hatches underfoot a metre and a half apart.
  lad('ladder-fwd-trunk', [4, [0, hz0 + 0.9]], [2, [0, hz0 + 0.9]]),
  lad('ladder-hangar-lock', [4, [-0.76, hz0 + 2]], [6, [-0.76, hz0 + 2]]),
  lad('ladder-keel-fwd', [4, [0.76, hz0 + 2]], [7, [0.76, hz0 + 2]]),
  lad('ladder-aft', [7, [0, sz0 + 2.5]], [2, [0, sz0 + 2]]),
  lad('ladder-tower', [2, [0, sz0 + 30]], [1, [0, sz0 + 30]]),
];

// ---- the drums ----
const ds = dA.s, sp = dA.spin, lay = D.drumLayout(ds);
const S = ds.sides, tan = Math.tan(Math.PI / S);
const drumDecks = Array.from({ length: ds.decks }, (_, k) => {
  const floorR = sp.rFloor - k * sp.living / ds.decks, h = sp.living / ds.decks;
  return { id: k === 0 ? 'o' : 'i', name: k === 0 ? 'Outer deck' : 'Inner deck', floorR: r3(floorR), h: r3(h), g: r3(sp.gG * floorR / sp.rFloor) };
});
const spokeSegs = Array.from({ length: lay.spokes }, (_, j) => Math.round((j + 0.5) * S / lay.spokes - 0.5) % S);
const halves = [dA, dB].map((d, i) => {
  const zc = (d.z[0] + d.z[1]) / 2;
  return {
    id: 'ab'[i], name: i ? 'After drum' : 'Forward drum', section: d.i, z: d.z, dir: d.s.dir, rpm: d.s.rpm,
    corridor: [r3(zc + lay.corrZ(0) - ds.corridor / 2), r3(zc + lay.corrZ(0) + ds.corridor / 2)],
    rows: { fore: [r3(zc + lay.z(0) - lay.roomL / 2), r3(zc + lay.z(0) + lay.roomL / 2)], aft: [r3(zc + lay.z(1) - lay.roomL / 2), r3(zc + lay.z(1) + lay.roomL / 2)] },
  };
});

// The rooms, from the designer's plan. A few take the ids today's career, watches and kits already use.
const NAMED = {
  medical: ['medbay'], mess: ['mess', 'senior-mess', 'galley'], wardroom: ['wardroom'], gym: ['gym', 'rec-room', 'training'],
  workshop: ['machine-shop', 'elec-shop', 'pipe-shop', 'eng-workshop'], ops: ['ship-office', 'briefing', 'intelligence'],
  flight: ['aircrew-q'], officers: ['officers'], berths: ['quarters-a', 'quarters-b', 'quarters-c'], marines: ['barracks'],
  stores: ['stores', 'laundry', 'main-stores'], hydro: ['garden'],
};
// The names today's career and kits say ("quarters C", "the ship's office", "the electrical shop"), where the designer's
// label for the use would be the same for all of a kind.
const NAMES = {
  'ship-office': "Ship's office", briefing: 'Briefing room', intelligence: 'Intelligence office', 'quarters-a': 'Quarters A', 'quarters-b': 'Quarters B',
  'quarters-c': 'Quarters C', 'senior-mess': "Senior rates' mess", galley: 'Galley', 'rec-room': 'Rec room', training: 'Training room',
  'machine-shop': 'Machine shop', 'elec-shop': 'Electrical shop', 'pipe-shop': 'Pipe shop', 'eng-workshop': "Engineers' workshop",
  'aircrew-q': 'Aircrew quarters', stores: 'Drum stores', laundry: 'Laundry', 'main-stores': 'Main stores',
};
const SYSTEM = { medical: 'medical', flight: 'flight', ops: 'bridge', mess: 'mess', wardroom: 'mess', officers: 'quarters', berths: 'quarters',
  marines: 'quarters', gym: 'welfare', stores: 'stores', workshop: 'repair', hydro: 'life-support', spare: 'stores' };
const FIT = { flight: 'briefing', ops: 'office', mess: 'tables', wardroom: 'tables', officers: 'cabins', berths: 'cabins', marines: 'cabins',
  gym: 'gym', stores: 'shelves', workshop: 'workshop', hydro: 'shelves', spare: null, medical: null };
const LABEL = { berths: 'Berths', marines: 'Marines', officers: 'Officers', hydro: 'Garden', spare: 'Spare', stores: 'Stores', workshop: 'Workshop',
  mess: 'Mess', gym: 'Gym', ops: 'Office', flight: 'Aircrew', medical: 'Sick bay', wardroom: 'Wardroom' };
const count = {};
const drumRooms = [];
// Name the rooms in a stable order: the forward drum first, outer deck first, round from segment 0, fore row first.
const slots = [...A.plan.slots].sort((a, b) => a.sec - b.sec || a.deck - b.deck || a.side - b.side || a.ring - b.ring);
for (const s of slots) {
  const half = halves.find((h) => h.section === s.sec), dk = drumDecks[s.deck];
  const row = s.ring % 2 ? 'aft' : 'fore';
  const n = (count[s.use] = (count[s.use] ?? 0) + 1);
  const named = NAMED[s.use]?.[n - 1];
  const seg = String(s.side).padStart(2, '0');
  const id = named ?? `${half.id}${dk.id}-${seg}${row[0]}`;
  const ceilR = dk.floorR - dk.h;
  const w = 2 * ceilR * tan - 0.4; // the room's width at its ceiling, less the bulkheads either side
  drumRooms.push({
    id, name: named ? NAMES[named] ?? D.USE[s.use].label : `${LABEL[s.use]} ${n}`, half: half.id, deck: dk.id, seg: s.side, row, use: s.use,
    system: SYSTEM[s.use], ...(FIT[s.use] ? { fit: FIT[s.use] } : {}),
    x: [r3(-w / 2), r3(w / 2)], z: half.rows[row], h: dk.h,
    ...(D.capOf(s.use, s.area) ? { bunks: D.capOf(s.use, s.area) } : {}), g: r3(s.gG),
  });
}
const drum = {
  about: 'The spin drums. Two halves in one fixed armoured sleeve, spinning opposite ways about the ship\'s axis (z). Each half is one ring of `sides` flat-floored segments; segment k is turned 2πk/sides about the axis from straight down. In a segment\'s frame a room is a box like any other: x across, z along the ship, its deck\'s floor at y = -floorR. Each deck has a ring corridor (`corridor`, z) with rooms fore and aft of it (`rows`). The spokes run from the corridors in their segments up to the hub ring, which turns round the fixed spine at `hub.r`. Outside the decks is the belt (water tanks and stores, spinning), then a gap, then the fixed sleeve.',
  sides: S, rpm: ds.rpm, omega: r3(sp.w),
  decks: drumDecks,
  belt: { from: r3(sp.rFloor), to: r3(sp.rOuter), kind: ds.beltKind },
  sleeve: { r: sleeveR, armour: ds.armour, gap: r3(sleeveR - sp.rOuter) },
  innerR: ds.inner,
  hub: { r: 6, spineR: 3, transfer: 'Catch the hub ring at walking pace; a spin-matched car takes stretchers and cargo.' },
  spokes: { segments: spokeSegs, lifts: design.ship.lifts, liftSpeed: design.ship.liftSpeed, carSize: design.ship.carSize, ladder: true },
  halves,
  rooms: drumRooms,
};
// The open drum section (design/CARRIER-POLISH.md, phase 4½). The sleeve is a tube open at both ends, as the designer
// draws it, so its exposed structure can be seen through them, and hit: the spine between the bow and the hangar, the
// hub rings and spokes (turning with their half), and at each end a ring of struts that holds the fixed sleeve to the
// bow and to the hangar. All heavily armoured (`integrity.armour.structure`). carrier_v2_build.py draws the fixed parts
// from these numbers, drum.mjs the turning ones, and integrity.mjs `meets()` is what a shell can hit through the ends.
{
  const struts = [];
  const rim = (sleeveR - 1.2) / Math.cos(Math.PI / 8); // on the sleeve's end ring, at the octagon's corners
  for (const [zEnd, zTo] of [[dA.z[0], bow.z[1] - 16], [dB.z[1], hgr.z[0] + 16]]) {
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) * Math.PI) / 4, cx = Math.cos(a), cy = Math.sin(a);
      let lo = 0, hi = 60; // the body's skin along this angle, at zTo
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (inLoft(hull.main, m * cx, m * cy, zTo, 0.4)) lo = m; else hi = m; }
      struts.push({ a: [r3(rim * cx), r3(rim * cy), zEnd], b: [r3(lo * cx), r3(lo * cy), zTo], r: 1.1 });
    }
  }
  drum.structure = {
    about: 'The open drum section\'s exposed structure, all heavily armoured. `sleeve`: the fixed sleeve\'s thickness (its inside surface is r - t) and the heavy rings at its ends and between the halves (`ring`: their radial depth and length). `spine`: the armoured tube round the spine corridor from the bow\'s after bulkhead to the hangar\'s forward one (`z`). `hub`: the hub ring\'s armoured drum (outer radius, length along the ship), turning with its half. `spoke`: each spoke\'s two lift tubes and ladder tube, `w` across and `d` along the ship, from the hub to the drum\'s inner wall. `struts`: from the sleeve\'s end ring (`a`) to the bow or the hangar (`b`), radius `r`.',
    sleeve: { t: 0.5, ring: { depth: 3.2, len: 2.4 } },
    spine: { r: drum.hub.spineR + 0.6, z: [bow.z[1] - step, hgr.z[0] + step] },
    hub: { r: r3(drum.hub.r + 1.9), len: 9 },
    spoke: { w: 4.2, d: 3.2, tube: 1.1 },
    struts,
  };
}

// ---- mounts ----
const mounts = [];
const turret = (id, at, up) => mounts.push({ id, kind: 'turret', at, up });
turret('turret-dorsal', [0, 12.6, bow.z[0] + 52], [0, 1, 0]);
turret('turret-ventral', [0, -12.6, bow.z[0] + 52], [0, -1, 0]);
hTurrets.forEach((z, i) => { turret(`turret-h${i + 1}d`, [-10, hgr.s.h / 2, z], [0, 1, 0]); turret(`turret-h${i + 1}v`, [10, -hgr.s.h / 2, z], [0, -1, 0]); });
turret('turret-stern-d', [0, stn.s.h / 2, sz1 - 7], [0, 1, 0]);
turret('turret-stern-v', [0, -stn.s.h / 2, sz0 + 9], [0, -1, 0]);
const pdc = (id, at, up, magazine, gun = 'close') => mounts.push({ id, kind: 'pdc', gun, at, up, magazine });
// Point defence in two kinds (design/ROADMAP.md, phase 7), where the first cut had eighteen of one: six close-in guns,
// small fast rounds at short range for torpedoes and missiles, three down each side (bow, hangar, stern); and four flak
// guns, twin guns firing bigger, slower, fused shells out to longer range for fighters (and the raider when no fighter
// is up), two on the hangar's roof and two under it, so they bear on either beam. A raid from one beam meets three
// close-in guns and all four flak guns. `weapons.pdc` and `weapons.flak` below have their numbers.
{
  const zb = bow.z[0];
  pdc('pdc-bow-pf', [-19.5, 0, zb + 22], [-1, 0, 0], 'pdc-mag-p'); pdc('pdc-bow-sf', [19.5, 0, zb + 22], [1, 0, 0], 'pdc-mag-s');
  const hp = (id, at, up, gun) => pdc(id, at, up, 'pdc-mag-h', gun);
  hp('pdc-h-pa', [-hx, -13, hz1 - 10], [-1, 0, 0]); hp('pdc-h-sa', [hx, -13, hz1 - 10], [1, 0, 0]);
  // The flak guns stand half way between the hangar's turrets, on the other side of the centreline from them.
  const fz = [(hTurrets[0] + hTurrets[1]) / 2, (hTurrets[1] + hTurrets[2]) / 2], fy = hgr.s.h / 2;
  hp('flak-h-d1', [10, fy, fz[0]], [0, 1, 0], 'flak'); hp('flak-h-d2', [10, fy, fz[1]], [0, 1, 0], 'flak');
  hp('flak-h-v1', [-10, -fy, fz[0]], [0, -1, 0], 'flak'); hp('flak-h-v2', [-10, -fy, fz[1]], [0, -1, 0], 'flak');
  const sp2 = (id, at, up) => pdc(id, at, up, 'magazine-sv');
  sp2('pdc-s-pf', [-stn.s.w / 2, 8, sz0 + 10], [-1, 0, 0]); sp2('pdc-s-sf', [stn.s.w / 2, 8, sz0 + 10], [1, 0, 0]);
}
mounts.push({ id: 'radiator-port', kind: 'radiator', x: [-(stn.s.w / 2 + stn.s.radSpan), -stn.s.w / 2], y: 0, z: [sz0 + 2, sz0 + 2 + stn.s.radLen] });
mounts.push({ id: 'radiator-stbd', kind: 'radiator', x: [stn.s.w / 2, stn.s.w / 2 + stn.s.radSpan], y: 0, z: [sz0 + 2, sz0 + 2 + stn.s.radLen] });
mounts.push({ id: 'bay-door', kind: 'bay-door', x: -hx, y: [-12, -12 + DOOR_H], z: doorZ });
mounts.push({ id: 'bay-door-s', kind: 'bay-door', x: hx, y: [-12, -12 + DOOR_H], z: doorZ });

// ---- weapons: today's numbers, the new mounts ----
const weapons = structuredClone(v1.weapons);
const hatch = (deck, at, yaw, label) => ({ deck, at, yaw, label });
weapons.turrets = [
  { mount: 'turret-dorsal', name: 'Bow dorsal turret', barbette: 'dorsal-barbette', magazine: 'magazine', from: hatch(3, [3, bow.z[0] + 52], 1.5708, 'Up the hoist trunk to the bow dorsal turret') },
  { mount: 'turret-ventral', name: 'Bow ventral turret', barbette: 'ventral-barbette', magazine: 'magazine-fwd', from: hatch(5, [3, bow.z[0] + 52], 1.5708, 'Down to the bow ventral turret') },
  ...hTurrets.flatMap((z, i) => [
    { mount: `turret-h${i + 1}d`, name: `Hangar dorsal turret ${i + 1}`, barbette: `barbette-h${i + 1}d`, magazine: `barbette-h${i + 1}d`, from: hatch(2, [-1.2, z], -1.5708, `Up to hangar dorsal turret ${i + 1}`) },
    { mount: `turret-h${i + 1}v`, name: `Hangar ventral turret ${i + 1}`, barbette: `barbette-h${i + 1}v`, magazine: `barbette-h${i + 1}v`, from: hatch(7, [1.2, z], 1.5708, `Across to hangar ventral turret ${i + 1}`) },
  ]),
  { mount: 'turret-stern-d', name: 'Stern dorsal turret', barbette: 'barbette-sd', magazine: 'barbette-sd', from: hatch(2, [0, sz0 + 44], 3.14159, 'Up to the stern dorsal turret') },
  { mount: 'turret-stern-v', name: 'Stern ventral turret', barbette: 'barbette-sv', magazine: 'magazine-sv', from: hatch(7, [0, sz0 + 4], 3.14159, 'Down to the stern ventral turret') },
];
// Ten turrets where the first carrier had two: her crews killed v1's raider (hull 320) in about 25 s, inside its first
// pass. A tougher raider makes a raid last about as long as it did (about a minute, two passes): 800, then 940 once
// the broadside fired too (it took about a sixth off a raid from either beam).
weapons.raider.hull = 940;
// Eight point defence guns instead of eighteen (the mounts above): each fires 26 tracers a second where it fired 22, and a
// tracer's burst kills a torpedo within 4 m where it was 3.
weapons.pdc = { ...weapons.pdc, rate: 26, radius: 4 };
// Bandits (ROADMAP phase 7): the raider's escort fighters, weapons/bandits.mjs. The point defence takes one inside
// `fighterRange` once no torpedo is up, and a burst that passes within `radius` of it does `fighterDamage`; a gun the
// bandits shoot up is mended at `repair` hit points a second between raids.
// A fighter is small and jinks, so the fire control's track of one is rougher (`fighterSpread`, radians). As tuned, in
// the headless raids from port the escorts live about a minute (one in two is shot down) and put one gun in two
// raids out of action.
weapons.pdc = { ...weapons.pdc, fighterRange: 1500, fighterDamage: 1.5, fighterSpread: 0.04, repair: 0.5 };
// Point defence in kinds (ROADMAP phase 7). The close-in guns (`pdc`, the mounts with `gun: 'close'`) are for what is
// homing on her: torpedoes and missiles, at short range, with small fast rounds and a high rate. They fire at a bandit
// only when it comes inside `fighterRange`, and never at the raider: that is the turrets' and the flak's work.
// Tuned in the headless raids (tools/raid-sim.mjs): at 40 rounds a second out to 2.2 km they let almost nothing
// through; at 30 out to 1.8 km, one torpedo in four. A close-in gun's tracer does a bandit `fighterDamage` (it was
// 1.5 out to 1.5 km, when they were the only guns on fighters: left there, they shot down more bandits than the flak).
weapons.pdc = { ...weapons.pdc, range: 1900, raiderRange: 0, fighterRange: 400, fighterDamage: 0.6, rate: 32, speed: 1400, stock: 3200, heat: 6e-5 };
// The flak guns (`gun: 'flak'`): twin guns on a slower mount firing fused shells. Each shell is set to burst where the
// fire control says it will meet its target (`fuse` off by up to `fuseErr` of its flight), or sooner when it passes
// within `prox` m of an enemy craft or torpedo (a proximity fuse); its splinters hit what is inside `burst` m,
// with a chance that falls off with distance (a bandit takes `damage` a hit, the raider `raiderDamage`), and kill a
// torpedo inside `torpKill` m. As tuned (tools/raid-sim.mjs, 20 raids from either beam, nobody at a gun): the close-in
// guns kill about four torpedoes in five and stop about two salvos in three outright (one hit a raid on her); the flak
// shoots down three bandits in five, nearly all of them, and the bandits still shoot up a gun every third raid. A
// flak burst doing steady damage by distance gave all or nothing (two bandits dead every raid, or none): splinters
// that hit by chance, each a fixed amount, give the spread between.
weapons.about = weapons.about.replace('`pdc`: the point defence cannons, rotary guns on the layout\'s `pdc` mounts, run by the fire-control computer: each one takes the nearest torpedo (or, with none, the raider inside `raiderRange`)', '`pdc`: the close-in guns, rotary guns on the layout\'s `pdc` mounts with `gun: \'close\'`, run by the fire-control computer: each one takes the nearest torpedo or missile homing on her (or, with none, a bandit inside `fighterRange`, and the raider inside `raiderRange` when that is not 0)');
weapons.flak = {
  about: 'The flak guns (weapons/pdc.mjs, the `pdc` mounts with `gun: \'flak\'`): twin guns firing fused shells, for fighters. Each takes the nearest bandit within `range` and `arc` degrees of where its mount faces; with none, a torpedo between `torpRange` metres (beyond the close-in guns); with neither, the raider inside `raiderRange`. It slews at `slew` degrees a second and fires `rate` shells a second at `speed` m/s, off by `spread` radians, each fused to burst at the predicted meeting, off by up to `fuseErr` of its time of flight, or as it passes within `prox` m of a bandit or torpedo. A burst hits a bandit d m away with a chance of (1 − d / `burst`)², for `damage`, `raiderDamage` to the raider when it is within `burst` m of its hull, and kills a torpedo within `torpKill` m. `stock` shells a mount, `heat` each, `shellMass` kg for the kick.',
  range: 3500, torpRange: [1900, 3500], raiderRange: 2500, arc: 100, slew: 70, rate: 1.5, speed: 750, spread: 0.015,
  fuseErr: 0.15, prox: 3, burst: 20, damage: 12, raiderDamage: 0.15, torpKill: 10, stock: 400, heat: 5e-4, shellMass: 4,
};
weapons.bandit = {
  about: 'The raider\'s escort fighters (weapons/bandits.mjs): Rook fighters flown on the same `Flight` as yours (the layout\'s `fighter`: mass, thrust, tanks, jets) by an AI pilot. `count` come with each raid, in `slots` (metres in the raider\'s frame; a third and fourth go twice as far out). `hull` (the cannon does `fighter.damage` a round) and the hit ellipsoid `size` about `centre`. Once the raider is on its firing passes and the carrier is inside `start` m they strafe her point defence: runs along her side `pass` m out, at `run` m/s past her (closing on the line at up to `close` m/s, `gain` per metre off it), each started `fire` + `lead` m short of the gun, firing from `fire` m, turning for the next `extend` m past the gun; `look` s ahead they keep `clearance` m off her hull. The nearest to your fighter inside `engage` m (and any you have hit) fights you, holding at about `stand` m. With a target in reach it only turns away to burn when its velocity is `shootSlack` m/s off what it wants; less than that its side jets take out. `bingo` (a fraction of either tank, the drive\'s or the jets\') sends one back to the raider; at `clear` m from the carrier, leaving, it is gone. `jink`: inside `near` m of the carrier or your fighter, a `pop` s random pop on the side jets every `every` s (the jets\' tank is small: held, they would empty it in a minute). Shooting, the side jets take out more than `trim` m/s of the velocity it wants across the nose. `gun`: rounds at `shell` m/s on top of its own velocity, one every `every` s in bursts of `burst` s with `pause` s between, `spread` per round and `err` (radians) per burst, gone after `range` m; a round within `radius` m of your fighter does `damage`, within `pdcRadius` m of a point defence gun takes `pdcDamage` off its 100, and through a spread radiator hurts it by `radiator`; the nose must be within `cone` radians of the lead to fire.',
  count: 2,
  hull: 90,
  size: [6, 2, 5.5],
  centre: [0, 0, -1],
  slots: [[-110, 15, 60], [110, -15, 60]],
  start: 4000,
  pass: 350,
  run: 200,
  gain: 0.15,
  close: 220,
  fire: 1500,
  lead: 700,
  extend: 1400,
  look: 5,
  clearance: 120,
  engage: 6000,
  stand: 700,
  shootSlack: 60,
  bingo: 0.2,
  clear: 6000,
  jink: { every: [0.6, 1.6], pop: 0.3, near: 2200 },
  trim: 4,
  gun: { shell: 1100, every: 0.11, burst: [0.6, 1.4], pause: [0.8, 2], spread: 0.004, err: 0.006, range: 1800, radius: 3, damage: [2, 4], pdcRadius: 7, pdcDamage: [10, 16], radiator: 0.01, cone: 0.03 },
  missiles: 2,
  missileFirst: 6,
  missileRange: [600, 3500],
  missileEvery: 8,
};
weapons.bandit.about += ' `missiles`: heat-seekers it carries (the layout\'s `missile`), the first not before `missileFirst` s into its fight, then one every `missileEvery` s at most, fired at your fighter when the seeker on its nose has locked her inside `missileRange` m.';
// Heat-seekers and flares (ROADMAP phase 7, weapons/missiles.mjs). A seeker sees I / r² and locks above `sense`
// (I in these units over r² in km²): a fighter coasting (I 8) only inside about 2.8 km, burning (68) from 8 km; the
// raider from 14 km; the carrier, radiators out, from 25 km or more. A fighter's flare (50) outshines her coasting, not
// burning: cut the drive and flare. A seeker sees through one flare in two (`reject`).
weapons.heat = {
  about: 'How bright each thing is in the infrared, for the heat-seekers (weapons/missiles.mjs heatSources). A fighter (yours or a bandit): `base`, plus `drive` × its main drive\'s power, plus `jets` while any side jet fires. The raider: `base`, plus `drive` while it burns on its passes. The carrier: `base`, plus `radiators` × how far her radiators are spread × (0.3 + the heat in her sinks), plus `drive` × her push. A torpedo while its motor burns: `torpedo`. A seeker sees I / r², r in km.',
  fighter: { base: 8, drive: 60, jets: 3 },
  raider: { base: 40, drive: 160 },
  carrier: { base: 150, radiators: 600, drive: 300 },
  torpedo: 30,
};
weapons.missile = {
  about: 'The fighters\' heat-seeking missiles (weapons/missiles.mjs). `rails` on each fighter, yours reloaded on the pad. On the rail the seeker looks along the nose, or at the selected contact when it is within `offBore` radians of the nose, and locks the brightest thing in a `gate`-radian cone above `sense` (I / r², r in km). Fired (Q), it leaves at `push` m/s down off the rail, lights after `drop` s and burns at `accel` m/s² for `burn` s, steering by proportional navigation; then its divert jets turn it at up to `divert` m/s² until `divertDv` m/s is spent. In flight the seeker keeps to its `gate` round what it tracks, which counts `hold` times as bright as it is; with nothing in the gate it looks over `fov` radians. Each flare it takes for the brightest thing in view it judges once: `reject` of the time it sees it for a flare and looks past it from then on. Armed after `arm` s, it goes off within `fuse` m of anything hot but its launcher (a flare too), and is gone after `life` s. A point defence round (the carrier\'s or the raider\'s) that passes within `hitBy` m of it shoots it down. It does `damage` to a fighter, `ship` × that to the raider, and on the carrier hits like a shell of `carrier.pen` armour, `carrier.damage` to the room and `carrier.hole` to its hull.',
  rails: 4,
  offBore: 0.5,
  gate: 0.07,
  fov: 0.6,
  sense: 1,
  hold: 1.3,
  push: 5,
  drop: 0.3,
  accel: 300,
  burn: 3.5,
  divert: 40,
  divertDv: 150,
  arm: 1,
  reject: 0.5,
  fuse: 8,
  life: 20,
  hitBy: 1,
  damage: [70, 100],
  ship: 1,
  carrier: { pen: 2, damage: 6, hole: 0.03 },
};
weapons.flares = {
  about: 'Flares, on every ship (weapons/missiles.mjs). Each is thrown out at `eject` m/s on top of the ship\'s velocity and burns for `life` s at its kind\'s `heat`, fading. Your fighter drops `fighter.salvo` a press of G, from `fighter.count`, refilled on the pad. The AI ships (`bandit`, `raider`, `carrier`) flare when a missile tracking them is inside `react` m, after `notice` s to see it: `salvo` at a time, one salvo every `every` s, while their `count` lasts; a bandit also cuts its drive for `coast` s.',
  eject: 25,
  life: 4,
  react: 2500,
  notice: [0.5, 1.5],
  coast: 3,
  fighter: { count: 24, salvo: 2, every: 1.2, heat: 50 },
  bandit: { count: 12, salvo: 2, every: 1.2, heat: 50 },
  raider: { count: 40, salvo: 4, every: 0.8, heat: 400 },
  carrier: { count: 120, salvo: 4, every: 0.8, heat: 1500 },
};
weapons.gun = { ...weapons.gun, shellMass: design.ship.shell, barrels: design.ship.barrels, calibreNote: `${design.ship.barrel} m barrels; muzzle speed ${design.ship.vel} m/s in the design (the game's gun.shell is still tuned for play).` };
weapons.tubes = { ...weapons.tubes, magazine: 'missile-mag', at: [-1, 1].flatMap((s) => [[s * 6, 2.5, bow.z[0] + 2], [s * 6, -2.5, bow.z[0] + 2], [s * 2, 0, bow.z[0] + 2]]).slice(0, bs.tubes), dir: [0, 0, -1] };
// No spinal railgun: the design has none (`spinal: false`), and the first carrier's keel line runs through the drums'
// spoke space. Two broadside railguns instead (design/ROADMAP.md, decision 4): one in each ordnance room, firing
// straight out of the hangar wall on the beam, at the height and station of her centre of mass so the kick of a shot
// pushes her sideways without turning her. Their muzzles go in once the centre of mass is known (`railMuzzles` below).
weapons.railgun = {
  ...v1.weapons.railgun,
  about: 'Two fixed railguns, one a side, firing out of the hangar walls along the beam: `port` and `starboard` each have a `muzzle` (ship frame), the `dir` it fires and the `room` it stands in (below 20% health it cannot fire). Each has its own capacitors (`charge` seconds to fill, on main power only) and `stock` slugs. A slug of `slug` kg leaves at `speed` m/s on top of her velocity, off by `spread`; it does `damage` to the raider and is gone after `range` m; each shot puts `heat` into the sinks, and its kick pushes the ship (weapons.mjs `recoil`). The guns cannot train: the helm turns her (and rolls her) until the line of one side runs through where the raider will be, and fires (Q). A side bears when its slug would pass inside `window` of the raider\'s hit ellipsoid (1 is its skin); with nobody at the helm the CIC fires a side that bears, which a raider passing above or below her beam never does.',
  slug: 2000, window: 0.85, stock: 20,
  port: { room: 'ordnance-p', dir: [-1, 0, 0] },
  starboard: { room: 'ordnance-s', dir: [1, 0, 0] },
};
delete weapons.railgun.muzzle;
weapons.about = weapons.about.replace(/`railgun`: the spinal gun.*$/, '`railgun`: the broadside railguns (their own `about`). `broadside`: the torpedo broadside (its own `about`).');
// Brace for impact (design/ROADMAP.md phase 4): the countdown, and what a hit does to the people floating aboard.
weapons.brace = {
  about: 'Brace for impact. When one of the raider\'s torpedoes will arrive within `eta` seconds the ship calls brace and counts down (weapons/torpedoes.mjs braceFrame), and the brace straps on the weightless rooms\' walls show "Strap in"; the countdown stays up `hold` s after the last one. A hit kicks the structure: `kick` m/s at the hit for a torpedo (`shell` for a gun shell, `glance` for one the armour stopped), less with distance (`fade` m halves it). Strapped in, you ride it; a hand on a rail holds below `grip` m/s and your feet in a rail below `feet` m/s; anyone else keeps going. Meeting a wall faster than `hurt` m/s hurts, `per` of an injury for each m/s over; a whole one (1) blacks you out (the damage control party picks you up), and it heals at `heal` a minute.',
  eta: 6, hold: 1.5, kick: 8, shell: 2.5, glance: 1.2, fade: 25, grip: 4.5, feet: 3.5, hurt: 4.2, per: 0.3, heal: 0.15,
};
weapons.broadside = {
  about: 'The hangar walls\' torpedo tubes, launched cold sideways: `per` a side, each side fed from its two ordnance rooms (a side whose magazines are both below 20% health cannot fire). `stock` torpedoes a side; `salvo` per firing; `reload` seconds between a side\'s salvos; `first` seconds into a raid before the first (the CIC\'s solution); `arc` degrees off the beam the raider must be within, and `range` [min, max] m; `push` m/s out of the tube and `cold` seconds before the motor lights. The CIC fires the side that bears; with you at the helm, a click does.',
  per: hgr.s.tubesSide, stock: 16, salvo: 4, reload: 30, first: 20, arc: 50, range: [300, 9000], push: 14, cold: 2,
  port: { magazines: ['ordnance-p', 'ordnance-p-aft'], dir: [-1, 0, 0], at: [] },
  starboard: { magazines: ['ordnance-s', 'ordnance-s-aft'], dir: [1, 0, 0], at: [] },
};
{
  const zs = [hz0 + 8, hz0 + 16, hz0 + 24, hz0 + 32, doorZ[1] + 6, doorZ[1] + 14, doorZ[1] + 22, doorZ[1] + 30].slice(0, hgr.s.tubesSide);
  for (const z of zs) { weapons.broadside.port.at.push([-hgr.s.w / 2, -2, z]); weapons.broadside.starboard.at.push([hgr.s.w / 2, -2, z]); }
}

// ---- fighters: six pads on the hangar floor, three a side, facing their side's door ----
// Every pad stands in front of its door, so each fighter runs straight out through it and comes straight back in: a pad
// beside the door would launch her through the hangar wall. Three a side across the forward `PADS` metres of the door
// is a pad every 6.3 m, a gap of 2.7 m between fighters with their radiators folded. Aft of them the door is the berth's.
const fighters = [];
{
  const per = Math.ceil(hgr.s.fighters / 2), dz = PADS / per, z0 = doorZ[0] + dz / 2;
  for (let i = 0; i < hgr.s.fighters; i++) {
    const port = i < per, k = port ? i : i - per;
    fighters.push({ at: [port ? -9 : 9, z0 + k * dz], yaw: port ? 1.5708 : -1.5708, side: port ? 'port' : 'starboard' });
  }
}

// ---- berths: two medium ships, one each side of the gangway, aft of the fighters ----
// A berthed ship lies along the carrier's axis on a cradle, `CLEAR` metres off the hangar's floor, in the middle of her
// `BERTH` metres of door, and goes out sideways through it. The port one points her bow forward and the starboard one
// aft, so each one's docking port (in her starboard side) faces the gangway. `at` is where her own layout origin sits
// and `port` where her docking port's door centre then is, both in the carrier's frame.
const berths = [];
{
  const E = cutter.envelope, K = cutter.dock, floor = floorOf[6];
  need(K.side === 'e', `The berths expect the ${BERTH_SHIP}'s docking port in her starboard side.`);
  const bz = doorZ[0] + PADS + BERTH / 2; // the middle of the berth's stretch of door
  const mid = (E.min[2] + E.max[2]) / 2, halfBeam = Math.max(-E.min[0], E.max[0]);
  const bx = HANGAR_X - CLEAR - 0.4 - halfBeam; // her centre line: her outboard side `CLEAR` and a bit off the wall
  // The hull's half-width abreast of the berth (the lofts there, as the fighters' launch numbers below)
  const hw = Math.max(...hull.main.filter((q) => q.z >= hgr.z[0] + step && q.z <= hgr.z[1]).map((q) => q.w)) / 2;
  for (const [side, o, yaw] of [['port', -1, 0], ['starboard', 1, 3.14159]]) {
    const f = yaw ? -1 : 1; // her +x and +z in the carrier's frame
    const at = [r3(o * bx), r3(floor + CLEAR - E.min[1]), r3(bz - f * mid)];
    const xs = [at[0] + f * E.min[0], at[0] + f * E.max[0]].sort((a, b) => a - b), zs = [at[2] + f * E.min[2], at[2] + f * E.max[2]].sort((a, b) => a - b);
    berths.push({
      id: `berth-${side}`, ship: BERTH_SHIP, side, door: o < 0 ? 'w' : 'e', at: at.map(r3), yaw, out: o,
      port: [r3(at[0] + f * K.at[0]), r3(at[1] + K.at[1]), r3(at[2] + f * K.at[2])],
      sill: r3(at[1] + K.at[1] - K.h / 2), skin: r3(at[0] + f * K.skin),
      clear: r1(hw + halfBeam + 2 * CLEAR),
      box: { x: xs.map(r3), y: [r3(at[1] + E.min[1]), r3(at[1] + E.max[1])], z: zs.map(r3) },
    });
  }
}
const berthsAbout = 'The hangar\'s berths for medium ships (tools/carrier-v2.mjs; ROADMAP phase 11). Each: `ship` (her folder under ships/), `side` and the bay `door` she leaves by (\'w\' port, \'e\' starboard), `at` [x, y, z] where her own layout origin sits and `yaw` (0: bow forward; π: bow aft), in the carrier\'s frame, `out` (-1 port, +1 starboard: the way her cradle pushes her), `port` (her docking port\'s door centre, carrier\'s frame: the gangway\'s spur ends there), `sill` (that door\'s sill, y) and `skin` (the x of her skin at it), `clear` (metres out from the centreline where her origin is when she is clear of the hull), and `box` (her envelope in the berth, radiators folded: x, y, z ranges).';

// ---- crew posts (the drum's own come with the walking drum) ----
const st = (room, at, yaw, pose, dept, post, watch, more = {}) => ({ room, at, yaw, pose, dept, ...(post ? { post } : {}), watch, ...more });
const stations = [
  st('bridge', [-4, sz0 + 18], 0, 'sitChair', 'command', 'Helmsman', 'on'),
  st('bridge', [4, sz0 + 18], 0, 'sitChair', 'command', 'Sensor watch', 'on'),
  st('bridge', [-1, sz0 + 24.5], 0, 'idle', 'command', 'Quartermaster of the watch', 'on'),
  st('cic', [-8, sz0 + 12], 1.5708, 'workTable', 'command', 'Plotter, CIC', 'on'),
  // The airless hangar's deck crews, suited (crew.mjs puts anyone in a vacuum room in a vac suit) and weightless: the
  // sentry pulling himself up and down the gangway, two at work in the gaps between fighters, one by the port bay door,
  // clear of its lanes.
  st('hangar', [0, hz0 + 40], 0, 'walk', 'flight', 'Hangar sentry', 'on', { route: [[0, hz0 + 8], [0, doorZ[0] + PADS + BERTH / 2 - 8]] }),
  st('hangar', [-5.6, doorZ[0] + 6.33], 3.14159, 'workTable', 'flight', 'Deck crew', 'on'),
  st('hangar', [5.6, doorZ[0] + 12.67], 0, 'workTable', 'flight', 'Deck crew', 'on'),
  st('hangar', [-15, doorZ[0] - 3], 0, 'lookAround', 'flight', 'Deck crew, launch lanes', 'on'),
  st('flight-control', [7, hz0 + 46], -1.5708, 'workTable', 'flight', 'Flight control', 'on'),
  st('eng-control', [3.95, sz0 + 33.5], 3.14159, 'workTable', 'engineering', 'Engineer of the watch', 'on'),
  st('eng-control', [11.95, sz0 + 33.5], 3.14159, 'workTable', 'engineering', 'Reactor operator', 'on'),
  st('damage-control', [-8, sz0 + 26], 1.5708, 'workTable', 'crew', 'Damage control centre', 'on'),
  st('torpedo-room', [4, bow.z[0] + 22], 3.14159, 'workTable', 'crew', 'Torpedo watch', 'on'),
  st('tunnel', [0, hz0 + 20], 0, 'walk', 'crew', 'Rounds', 'on', { route: [[0, hz0 + 6], [0, hz1 - 4]] }),
];

// ---- everything else: carried over, with ids moved where rooms moved ----
const routes = { ...v1.routes, lines: [
  { name: 'Bridge', to: 'bridge', color: '#58b0ff' }, { name: 'Hangar tunnel', to: 'tunnel', color: '#3fe0d0' },
  { name: 'Engineering', to: 'eng-control', color: '#ff9a30' }, { name: 'Hangar airlock', to: 'hangar-lock', color: '#e8d84a' },
  // The mess, the sick bay, the quarters and the offices are in the drums: one line to the spine, whose lifts go down to them.
  { name: 'Drums', to: 'spine', color: '#c08cff' },
] };
const damage = structuredClone(v1.damage);
damage.switchboards = ['switchboard'];
damage.kits.patch.rooms = ['repair-fwd', 'repair-mid', 'dc-store', 'machine-shop'];
// The patch kit is a welder and hull plates (design/ROADMAP.md, phase 9): a plate over a hole, welded round; a clamp
// welded over a split coolant pipe.
Object.assign(damage.kits.patch, { name: 'a welder and hull plates', label: 'Welder' });
damage.kits.toolkit.rooms = ['elec-shop', 'dc-store'];
damage.kits.suit.rooms = ['damage-control', 'flight-gear', 'pilots-ready'];
// Outside the drums everyone wears the duty suit (crew.mjs `OUTFITS.duty`; ROADMAP phase 5), so the hull's suit lockers
// hold fresh air bottles for it (integrity.mjs `don`), and the suits themselves hang in the lockers at the drums' lifts.
Object.assign(damage.kits.suit, { name: 'fresh suit bottles', label: 'Suit bottles', lockers: 'SUIT AIR', kept: 'the grey SUIT AIR lockers in the passages' });
const integrity = structuredClone(v1.integrity);
// Condition one leaves the drums pressurised (design/CARRIER-POLISH.md, decision 2): behind the sleeve, the gap and the
// water belt, their off-watch hands go up the spokes, and the sick bay and damage control stay, suited, helmets open.
integrity.condition.drums = false;
// The open drum section's exposed structure (drum.structure) is heavily armoured: a weak point, but not that weak.
integrity.armour.structure = { stop: 0.7, pen: 3 };
integrity.about = integrity.about.replace('(a torpedo is never stopped).', '(a torpedo is never stopped). `armour.structure`: the same for the open drum section\'s exposed structure (the spine, the hub rings, the spokes and the end struts, `drum.structure`), reached through the sleeve\'s open ends.');
integrity.about = integrity.about.replace('Everyone suits up first.', 'Everyone suits up first. `drums`: false keeps the drums\' rooms and ring corridors pressurised (only the fixed hull is pumped down).');
integrity.about = integrity.about.replace('`suit`: a vac suit (the `suit` kit, worn, not carried) holds', '`suit`: the duty suit everyone wears outside the drums (changed into at the lockers by each drum\'s lift; the `suit` kit is its fresh bottles) holds');
// The carrier's outside parts and how she is mended (src/carrier/carrier-damage.mjs, carrier-repair.mjs; ROADMAP phase
// 9 session 4).
integrity.parts = {
  about: 'The carrier\'s outside parts and how she is mended (src/carrier/carrier-damage.mjs, carrier-repair.mjs). Each kind (`kinds`) has health 100 and is mended `by` the drones (outside) or a damage control party (inside), taking `min` + `per` × what it has lost / 100 seconds. `radiator`: plant.mjs\'s two panels, shedding heat as they are unhurt. `rcs`: each manoeuvring cluster (a ball `r` m round it), pushing nothing under `off` health and all it can from `full`. `turret`: each turret (a ball `r`), out of action under `out`. `pdc`: each point defence and flak mount (a ball `r`; its health is the gun\'s own `hp`), out under `out`. `door`: each bay door, jammed where it stands under `jam`. `bearing`: each drum\'s bearing, hit through its hub ring (`structure` of the shell\'s damage), shuddering under `shudder` (the drum wobbles `wobble` rad at worst). A gun shell takes `shell` health from a part it meets (a radiator 0.6 of that); a torpedo\'s blast every part within `torpedo.r` m, `torpedo.hp` at the blast and less with distance. A holed propellant tank vents its leak (plant.propellant.leak) at `leak.ve` m/s, which pushes her. Jobs are taken in `order` (the worst hit first within a kind): `tank` (a hole in a propellant tank), `breach` (into a room with air), `inside` (between two compartments, a party\'s), `hole` (into a sealed space); the rest are the kinds. `drones`: out of the bay\'s hatch at `exit` (her frame) going `out`, round her `clear` m off her hull and spread radiators, at up to `cruise` m/s and `accel` m/s² (steering time constant `tau`), through each waypoint within `pass` m at `corner` m/s, holding `standoff` m off the work; drawn `scale` times the hangar\'s drones. Their number, bay and seal time are `integrity.drones`. `parties`: `count` of them from the `from` room, timed at `speed` m/s along their way (climbs count 1.5×) after `setup` s. You can do any inside job with the `kit`, adding `help` (a party is 1).',
  kinds: {
    radiator: { by: 'drone', min: 20, per: 140 },
    rcs: { by: 'drone', r: 4.5, off: 15, full: 85, min: 15, per: 110 },
    turret: { by: 'party', r: 6, out: 45, min: 25, per: 150 },
    pdc: { by: 'drone', r: 2.6, out: 25, min: 10, per: 60 },
    door: { by: 'party', jam: 55, min: 30, per: 120 },
    bearing: { by: 'party', shudder: 80, min: 40, per: 200, wobble: 0.004 },
  },
  shell: [20, 45],
  torpedo: { r: 18, hp: [50, 90] },
  structure: 0.8,
  leak: { ve: 450 },
  order: ['tank', 'breach', 'door', 'rcs', 'bearing', 'turret', 'inside', 'pdc', 'radiator', 'hole'],
  kit: 'toolkit',
  help: 1,
  drones: { exit: [-(stn.s.w / 2 + 0.2), 10, sz0 + 12], out: [-1, 0.35, 0], clear: 12, cruise: 12, accel: 3, tau: 0.6, pass: 3, corner: 3, standoff: 3.5, scale: 2.5 },
  parties: { count: 2, from: 'damage-control', speed: 2, setup: 10 },
};
integrity.about = integrity.about.replace('`inside` whether they also seal holes between compartments.', '`inside` is no longer read: a hole between compartments is a damage control party\'s (`parts.parties`); the drones fly out of the bay and round her (`parts.drones`).');
const plant = structuredClone(v1.plant);
plant.propellant.tanks = ['tanks-aft', 'tanks-aft-s', 'hangar-bottom', 'hangar-bottom-2', 'hangar-bottom-3', 'hangar-bottom-4', 'hangar-bottom-5'];

// Mass and centre of mass from the design's sections.
const M = A.M * 1000;
const comZ = A.secs.reduce((a, x, i) => a + sec[Object.keys(sec)[i]].mass * ((sec[Object.keys(sec)[i]].z[0] + sec[Object.keys(sec)[i]].z[1]) / 2), 0) / A.M;
// The broadside railguns' muzzles: just outside the hangar wall, on her centre of mass.
for (const k of ['port', 'starboard']) { const G = weapons.railgun[k]; G.muzzle = [G.dir[0] * (hgr.s.w / 2 + 0.6), 0, r1(comZ)]; }
const thrust = design.ship.thrust * 1e6;
const engines = stn.s.engines;
const thrusters = {
  main: Array.from({ length: engines }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / engines;
    return { at: [r1(Math.cos(a) * 11), r1(Math.sin(a) * 9 - 2), sz1], r: 6, force: thrust };
  }),
  rcsForce: Math.round((v1.thrusters.rcsForce * M) / v1.mass / 1e5) * 1e5,
  rcs: [[-1, 1], [1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy]) => [
    { at: [sx * 19, sy * 8, bow.z[0] + 26] }, { at: [sx * (stn.s.w / 2 - 2), sy * 15, sz1 - 8] },
  ]),
};

// The fighter is v1's, but she launches from and lands into this hangar: on the hangar's floor, out through doors in
// a hull this wide. Distances out from the centre line (the game uses them on whichever side a pad faces): her wings
// spread just outside the hull, she is handed over 12 m out, and the landing gate is 28 m out, 4 m over the floor.
const fighter = structuredClone(v1.fighter);
{
  const hg = comps.find((c) => c.id === 'hangar');
  // The hull's width along the hangar: the loft sections either side of each point of it (the sleeve ends just forward).
  const wAt = (z) => { const i = hull.main.findIndex((s) => s.z >= z); return Math.max(hull.main[Math.max(0, i - 1)].w, hull.main[i].w); };
  const hw = Math.max(...[hg.z[0] + 1, (hg.z[0] + hg.z[1]) / 2, hg.z[1] - 1].map(wAt)) / 2;
  const floor = decks.find((d) => d.id === hg.deck).floor;
  fighter.launch.clear = r1(hw + 12);
  fighter.launch.wings = r1(hw + 2);
  fighter.landing.gate = [r1(hw + 28), floor + 4];
}
// What is solid about her and what a touch does (src/carrier/collide.mjs). `spheres` [x, y, z, r] in her own frame
// (the model is 4 m across, 10.5 m long, nose at -z): nose, capsule, body, drive, and the fin over the body.
// Slower than `scrape.speed` (m/s, against the surface) a touch is a scrape; faster, her hull takes
// `damage.k × (speed − scrape.speed)²` (100 is all of it: about 26 m/s kills her), and from `hole.speed` up she holes
// the compartment she hit (`pen` metres, `damage`, `area` m², each scaled by speed / hole.speed).
fighter.collide = {
  spheres: [[0, 0.3, -4.6, 1.2], [0, 0.6, -2.2, 1.7], [0, 0.6, 0.8, 1.9], [0, 0.4, 3.4, 1.4], [0, 2.6, 1.2, 1.1]],
  bounce: 0.3,
  scrape: { speed: 4, mu: 0.4 },
  damage: { k: 0.2 },
  hole: { speed: 30, pen: 3.5, damage: 20, area: 0.1 },
};
// The rescue craft (src/carrier/rescue.mjs): a tanker or a tug, called from the cockpit (1, 2) to a fighter run dry.
// They launch from her empty pad at `launch` m/s², fly at up to `accel` (4 g: light hulls, full tanks) and `cruise`
// m/s closing, brake with `margin` of their drive (time to flip), trim on `jets` m/s², turn at `turn` rad/s, and steer
// for the velocity they want over `tau` s. They keep `clear` metres off her hull (her lofts, slice by slice: less than the landing gate is out past the hangar). `near` metres out they slow to
// make fast, and they are fast within `dock.dist` m and `dock.speed` m/s. The tanker's `station` (in the fighter's
// frame) is over her spine; its hose runs from `hoseAt` (its frame) to her `port`, fills `flow` kg/s [drive, jets], and
// comes away past `hose` m. The tug's station is a bar's length (`cable`) ahead of her nose; it tows at `tow.accel` up
// to `tow.cruise`, to a point `tow.beyond` m past the landing gate, and swings her nose to the bar at `swing` rad/s, her swing across it damped at `damp` a second.
// Home, each goes in `bay` m along the hangar from her pad (toward `bayMid`, the middle of the fighters' stretch of the
// door: over the next pad, never the berths), from `home` m out past the gate, and is
// stowed `stow` m in from the centre line after `inT` s.
fighter.rescue = {
  launch: 14, accel: 40, cruise: 450, margin: 0.55, jets: 6, turn: 1.8, tau: 0.5, clear: 22, near: 60,
  dock: { dist: 2.5, speed: 1.5 },
  grab: { spin: 0.04, hold: 34, range: 4, despin: 0.35, steady: 0.012 }, // a tumbling fighter: hold off her centre, a line on her, her spin taken off (rad/s, m, rad/s²)
  tow: { accel: 16, cruise: 320, beyond: 40 },
  bay: r3(PADS / 3), bayMid: r3(doorZ[0] + PADS / 2), home: 12, stow: 14, inT: 6,
  kinds: {
    tanker: { station: [0, 8, 0.5], hoseAt: [0, -3.6, 2.2], port: [0, 1.4, 1], flow: [300, 120], hose: 9 },
    tug: { station: [0, 0.6, -42], hoseAt: [0, 0.1, 5.2], port: [0, 0.2, -5.6], cable: 30, swing: 0.8, damp: 1.5 }
  }
};

// Where a hit on her lands and what it does (src/carrier/fighter-damage.mjs, ROADMAP phase 9 session 2). Each part is
// shapes in her own frame (the Blender model's: x starboard, y up, -z the nose; fighter_build.py): `box` [cx, cy, cz,
// hx, hy, hz] (centre and half sizes), `ball` [x, y, z, r], `cyl` [x, y, z0, z1, r] (along z). `hp` is its share of the
// hull (`weapons.fighter.hull`; the shares are scaled to add up to it). `does` is what it is: `drive`, `jets` (with
// `block`, the index of its jet block in `flight.blocks`), `tank` (with `tank`: `main` or `rcs`), `radiator`, `cockpit`,
// `guns`. The port tank holds the drive's propellant, the starboard one the jets' cold gas.
fighter.damage = {
  about: 'Her parts and what a hit on each does (src/carrier/fighter-damage.mjs). `parts`: each `id`, `name` (the cockpit\'s damage page), `short`, `does` (what it is), `hp` (its share of `weapons.fighter.hull`; the shares are scaled to add up to it) and `shapes` in her frame (`box` [cx, cy, cz, hx, hy, hz], `ball` [x, y, z, r], `cyl` [x, y, z0, z1, r] along z). A shot is placed on the first part its line meets (nearest the line if none), and what that part cannot take goes `pass` of it on to the next part along the line. A missile\'s burst gives `blast` of it to the part nearest the burst and the rest (and what that part could not take) to every part by its share and its distance (`reach` m); a crash gives `crash` of it to the part it struck and the rest to every part by its share; what a part cannot take of that share is lost. A part with `armour` takes that fraction of what reaches it (the cockpit is an armoured capsule). `guns.fhull` is the sum of the parts. She is dead in space when the cockpit is gone, the sum is gone, or the drive and `dead.jets` of the jet blocks are out. `drive`: thrust is `floor` + her health of full (nothing at 0). `radiator`: each lost one takes `drive` of the drive\'s full push (no waste heat shed, no full power). `jets`: a block\'s nozzles push at its health, nothing at 0. `tank`: a shot or a burst that does it `hole` or more holes it (a crash\'s shock through her does not; the part it strikes can be holed), and a hole leaks `leak[tank].rate` kg/s × the damage, and the leaking gas pushes her at `leak[tank].ve` m/s out of the hole. `guns`: under `one` one barrel fires at half the rate, under `jam` both are jammed. `cockpit`: under `crack` the canopy is cracked and the HUD flickers. `decals`: at most that many scorch marks and holes drawn on her.',
  pass: 0.5, blast: 0.5, reach: 6, crash: 0.4, hole: 0.5,
  dead: { jets: 3 },
  drive: { floor: 0.15 },
  radiator: { drive: 0.25 },
  leak: { main: { rate: 30, ve: 220 }, rcs: { rate: 12, ve: 300 } },
  guns: { one: 0.6, jam: 0.25 },
  cockpit: { crack: 0.75 },
  decals: 28,
  parts: [
    { id: 'cockpit', name: 'Cockpit and canopy', short: 'CKPT', does: 'cockpit', hp: 26, armour: 0.5, shapes: [{ box: [0, 0.44, -2.3, 0.95, 1.06, 3.5] }] },
    { id: 'drive', name: 'Main drive', short: 'DRIVE', does: 'drive', hp: 18, shapes: [{ box: [0, 0.1, 3.15, 0.8, 0.9, 1.95] }] },
    { id: 'tank-main', name: 'Propellant tank (port)', short: 'FUEL', does: 'tank', tank: 'main', hp: 12, shapes: [{ cyl: [-1.38, -0.12, -1.86, 3.46, 0.56] }] },
    { id: 'tank-rcs', name: 'Jet gas tank (starboard)', short: 'GAS', does: 'tank', tank: 'rcs', hp: 10, shapes: [{ cyl: [1.38, -0.12, -1.86, 3.46, 0.56] }] },
    { id: 'jets-bow', name: 'Bow jets', short: 'J-BOW', does: 'jets', block: 0, hp: 4, shapes: [{ box: [-1.15, 0, -3.4, 0.3, 0.8, 0.35] }, { box: [1.15, 0, -3.4, 0.3, 0.8, 0.35] }] },
    { id: 'jets-stern', name: 'Stern jets', short: 'J-AFT', does: 'jets', block: 1, hp: 4, shapes: [{ box: [-1.15, 0, 3.4, 0.3, 0.8, 0.35] }, { box: [1.15, 0, 3.4, 0.3, 0.8, 0.35] }] },
    { id: 'jets-port', name: 'Port wingtip jets', short: 'J-L', does: 'jets', block: 2, hp: 4, shapes: [{ box: [-3.2, 0.6, 2.1, 0.6, 0.45, 1] }] },
    { id: 'jets-stbd', name: 'Starboard wingtip jets', short: 'J-R', does: 'jets', block: 3, hp: 4, shapes: [{ box: [3.2, 0.6, 2.1, 0.6, 0.45, 1] }] },
    { id: 'rad-port', name: 'Port radiator', short: 'RAD-L', does: 'radiator', hp: 5, shapes: [{ box: [-1.73, 0.82, 2.1, 0.87, 0.16, 1] }] },
    { id: 'rad-stbd', name: 'Starboard radiator', short: 'RAD-R', does: 'radiator', hp: 5, shapes: [{ box: [1.73, 0.82, 2.1, 0.87, 0.16, 1] }] },
    { id: 'guns', name: 'Chin guns', short: 'GUNS', does: 'guns', hp: 8, shapes: [{ box: [0, -0.8, -3.0, 0.45, 0.2, 2.6] }] }
  ]
};

// Mending a damaged fighter on her pad (src/carrier/fighter-repair.mjs, ROADMAP phase 9 session 3). Places are in the
// hangar deck's frame (x starboard, z aft, y up from the hangar floor).
fighter.repair = {
  about: 'Mending a damaged fighter on her pad (src/carrier/fighter-repair.mjs). Each damaged part is one job: `min` s plus `per[does]` s for a part from nothing to whole, times what it has lost, plus `hole` s for each hole in a tank (plated and welded before the rest of the tank\'s work). The deck crew do what is `inside` (in her open frame, from foot restraints by her flank), the drones the rest (plates and welding, outside); each takes the waiting job first in `order`, the most damaged first within a kind. She cannot launch until every job is done. `help` is what your welding adds to a drone job (a drone is 1); you can weld a part within `reach` m of your eye. `drones`: `racks` on the hangar\'s walls (`at` [x, y above the floor, z] the first slot, `n` slots `gap` m apart along z, `into` the way out of the wall), flown weightless and Newtonian: up to the `lane` (m above the floor, over everything) and along it, down to a point `standoff` m off the part, at up to `cruise` m/s and `accel` m/s², steering with time constant `tau`; `radius` is the clearance they keep from the gangway and the fighters. `crew`: their `posts` on the gangway [x, z] where they wait, `speed` (m/s along their way, for the timing: they push off and glide), `setup` s at the job before the work starts, the foot restraint\'s height `h` and how far off her flank they stand (`flank`). `board`: the pad\'s board (width and height, m).',
  min: 6,
  per: { tank: 40, cockpit: 60, drive: 70, jets: 35, guns: 40, radiator: 30 },
  hole: 10,
  inside: ['cockpit', 'guns', 'drive'],
  order: ['tank', 'cockpit', 'drive', 'jets', 'guns', 'radiator'],
  help: 1,
  reach: 2.6,
  drones: {
    racks: [{ at: [-(HANGAR_X - 0.4), 2.4, doorZ[0] - 6], n: 3, into: [1, 0, 0] }, { at: [HANGAR_X - 0.4, 2.4, doorZ[0] - 6], n: 3, into: [-1, 0, 0] }],
    gap: 1.0, lane: 5, cruise: 2.4, accel: 0.8, tau: 0.6, standoff: 1.0, radius: 0.32
  },
  crew: { posts: [[0, doorZ[0] + 3], [0, doorZ[0] + 9.5]], speed: 0.75, setup: 4, h: 1.1, flank: 0.6 },
  board: { w: 1.1, h: 0.78 }
};

const L = {
  about: 'The spin-drum carrier as data, built by tools/carrier-v2.mjs from design/carrier-v2.design.json (see design/SHIP-DESIGN.md and design/CARRIER-REBUILD.md). Metres, the ship\'s frame (x starboard, y up, -z the bow), the ship\'s axis at x = 0, y = 0. `compartments` are the fixed, weightless hull (grip shoes; down is -y); `drum` holds the spinning rooms, each in its own segment\'s frame. Do not edit by hand: change the design or the generator and run it again. The first carrier is archived in archive/carrier-v1/.',
  name: design.name, version: 2, length: T, mass: Math.round(M), com: [0, 0, r1(comZ)],
  sections: Object.entries(sec).map(([id, s]) => ({ id, type: s.s.type, z: s.z.map(r1), w: r1(s.size.w), h: r1(s.size.h), mass: Math.round(s.mass * 1000) })),
  decks, hull, compartments: comps, doors, ladders, drum,
  helm: { at: [0, sz0 + 16], eye: [0, floorOf[1] + 1.75, sz0 + 16.2] },
  spawn: { deck: 2, at: [0, sz0 + 2], yaw: 0 },
  thrusters, mounts, fighters, berthsAbout, berths, fighter,
  stations, routes, damage, weapons, integrity, plant,
};

// ---- checks ----
const problems = [];
// weapons.mjs aims a turret standing on top (up +y) or underneath (up -y) only; one on her side would aim wrongly.
for (const m of mounts) if (m.kind === 'turret' && !(m.up[0] === 0 && m.up[2] === 0 && Math.abs(m.up[1]) === 1)) problems.push(`${m.id}: a turret must stand on top or underneath (up [0, ±1, 0]); weapons.mjs aims no others`);
const ids = new Set();
for (const c of [...comps, ...drumRooms]) { if (ids.has(c.id)) problems.push(`duplicate id ${c.id}`); ids.add(c.id); }
const walkIds = new Set(comps.filter((c) => c.access === 'walk').map((c) => c.id));
const yOf = (c) => c.y ?? [floorOf[c.deck], floorOf[c.deck] + (c.h ?? 3) + 0.8];
// overlaps in the fixed hull
for (let i = 0; i < comps.length; i++) for (let k = i + 1; k < comps.length; k++) {
  const a = comps[i], b = comps[k], ya = a.y ?? [floorOf[a.deck], floorOf[a.deck] + (a.h ?? 3)], yb = b.y ?? [floorOf[b.deck], floorOf[b.deck] + (b.h ?? 3)];
  const o = (p, q) => Math.min(p[1], q[1]) - Math.max(p[0], q[0]);
  if (o(a.x, b.x) > 0.01 && o(ya, yb) > 0.01 && o(a.z, b.z) > 0.01) problems.push(`${a.id} overlaps ${b.id}`);
}
// inside the hull (every corner, deckhead included), and out of the drums' spinning space
const drumSpace = (x, y, z) => halves.some((h) => z > h.z[0] && z < h.z[1]) && Math.hypot(x, y) > drum.hub.spineR;
for (const c of comps) {
  const y = yOf(c);
  for (const x of c.x) for (const yy of y) for (const z of c.z) {
    if (!inHull(x, yy, z)) { problems.push(`${c.id} pokes through the hull at (${x}, ${yy}, ${z})`); break; }
    if (drumSpace(x, yy, z)) { problems.push(`${c.id} is in a drum's spinning space`); break; }
  }
}
// every door's rooms exist and are walkable; every walkable room has a way in
for (const d of doors) for (const r of d.between) if (!walkIds.has(r)) problems.push(`door to unknown room ${r}`);
// ladders land in walkable rooms
const roomAt = (deck, [x, z]) => comps.find((c) => c.access === 'walk' && c.deck === deck && x >= c.x[0] && x <= c.x[1] && z >= c.z[0] && z <= c.z[1]);
for (const c of comps.filter((c) => c.access === 'walk')) if (!doors.some((d) => d.between.includes(c.id)) && !ladders.some((l) => [l.a, l.b].some((e) => roomAt(e.deck, e.at) === c))) problems.push(`${c.id} has no door or ladder`);
for (const l of ladders) for (const e of [l.a, l.b]) if (!roomAt(e.deck, e.at)) problems.push(`${l.id} lands outside a room on deck ${e.deck} at ${e.at}`);
for (const t of weapons.turrets) if (!roomAt(t.from.deck, t.from.at)) problems.push(`${t.name}'s hatch is not in a room`);
if (!roomAt(L.spawn.deck, L.spawn.at)) problems.push('spawn is not in a room');
if (!roomAt(1, L.helm.at)) problems.push('helm is not on the bridge');
// every id the rest of the layout names
const refs = [
  ...stations.map((s) => ['station', s.room]), ...routes.lines.map((r) => ['floor line', r.to]),
  ...damage.switchboards.map((r) => ['switchboard', r]), ...Object.values(damage.kits).flatMap((k) => (k.rooms ?? []).map((r) => ['kit room', r])),
  ...weapons.turrets.flatMap((t) => [['barbette', t.barbette], ['magazine', t.magazine]]),
  ...mounts.filter((m) => m.magazine).map((m) => ['pdc magazine', m.magazine]),
  ['tube magazine', weapons.tubes.magazine], ...weapons.broadside.port.magazines.concat(weapons.broadside.starboard.magazines).map((m) => ['broadside magazine', m]),
  ['railgun room', weapons.railgun.port.room], ['railgun room', weapons.railgun.starboard.room],
  ...plant.propellant.tanks.map((t) => ['tank', t]), ['drone bay', integrity.drones.from],
];
for (const [what, id] of refs) if (!ids.has(id)) problems.push(`${what} names ${id}, which is not a room`);
for (const t of weapons.turrets) if (!mounts.some((m) => m.id === t.mount)) problems.push(`turret ${t.mount} has no mount`);
for (const m of mounts.filter((m) => m.at)) if (!inHull(m.at[0] * 0.98, m.at[1] * 0.98, m.at[2], -0.5)) problems.push(`mount ${m.id} is off the hull`);

// What the career and the watch bill name that this layout does not have.
const named = [];
const walkJson = (o, path) => {
  if (Array.isArray(o)) o.forEach((v, i) => walkJson(v, `${path}[${i}]`));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (['room', 'muster', 'bunk', 'to', 'at'].includes(k) && typeof v === 'string') named.push([path + '.' + k, v]);
    else if (k === 'rooms' && Array.isArray(v)) v.forEach((r) => typeof r === 'string' && named.push([path + '.rooms', r]));
    else walkJson(v, `${path}.${k}`);
  }
};
walkJson(JSON.parse(readFileSync(here('ships/carrier/career.json'))), 'career');
walkJson(JSON.parse(readFileSync(here('ships/carrier/watches.json'))), 'watches');
const missing = [...new Set(named.filter(([, id]) => /^[a-z][a-z0-9-]*$/.test(id) && !ids.has(id)).map(([, id]) => id))];

// ---- report ----
const fixedVol = comps.reduce((a, c) => { const y = c.y ?? [0, c.h ?? 3]; return a + (c.x[1] - c.x[0]) * (y[1] - y[0]) * (c.z[1] - c.z[0]); }, 0);
const uses = drumRooms.reduce((a, r) => ((a[r.use] = (a[r.use] ?? 0) + 1), a), {});
console.log(`${L.name}: ${T} m, ${Math.round(A.M).toLocaleString()} t, centre of mass z ${r1(comZ)}`);
console.log(`Fixed hull: ${comps.filter((c) => c.access === 'walk').length} walkable rooms, ${comps.filter((c) => c.access === 'sealed').length} sealed, ${doors.length} doors, ${ladders.length} ladders, ${Math.round(fixedVol).toLocaleString()} m³`);
console.log(`Drums: ${drumRooms.length} rooms (${Object.entries(uses).map(([u, n]) => `${n} ${u}`).join(', ')}), ${drumRooms.reduce((a, r) => a + (r.bunks ?? 0), 0)} bunks for ${A.plan.crew + A.plan.marines}`);
console.log(`       decks ${drumDecks.map((d) => `${d.name.toLowerCase()} r ${d.floorR} m ${d.g} g`).join(', ')}; spokes at segments ${spokeSegs.join(', ')}`);
console.log(`Mounts: ${mounts.filter((m) => m.kind === 'turret').length} turrets, ${mounts.filter((m) => m.kind === 'pdc').length} point defence, ${weapons.tubes.at.length} bow tubes, ${weapons.broadside.port.at.length * 2} broadside tubes, ${fighters.length} fighter pads, ${berths.length} berths (${BERTH_SHIP})`);
{ const hg = comps.find((c) => c.id === 'hangar'); console.log(`Hangar: ${hg.x[1] - hg.x[0]} × ${hg.h} × ${r1(hg.z[1] - hg.z[0])} m inside (z ${hg.z.map(r1)}); doors z ${doorZ.map(r1)} (${r1(doorZ[1] - doorZ[0])} × ${DOOR_H} m); pads at z ${fighters.slice(0, fighters.length / 2).map((f) => r1(f.at[1]))}; ${berths.map((b) => `${b.id} at ${b.at}, port ${b.port}, clear ${b.clear}`).join('; ')}`); }
if (missing.length) console.log(`\nThe career and the watch bill still name rooms this layout does not have ${missing.join(', ')}`);
else console.log('\nEvery room the career and the watch bill name is here.');
if (problems.length) { console.log(`\n${problems.length} problem${problems.length > 1 ? 's' : ''}:\n  ${problems.join('\n  ')}`); process.exitCode = 1; }
else console.log('\nChecks: no overlaps, everything inside the hull and out of the drums, every room has a door, every name resolves.');
if (!CHECK_ONLY && !problems.length) {
  const index = JSON.parse(readFileSync(here('ships/carrier/index.json')));
  const files = splitLayout(L, index);
  for (const [f, part] of Object.entries(files)) writeFileSync(here(`ships/carrier/${f}.json`), JSON.stringify(part, null, 1) + '\n');
  console.log(`Wrote ships/carrier/: ${Object.keys(files).map((f) => f + '.json').join(', ')}`);
}
// The names the rest of the content gives (the career, the routine, the people, the cast) against what is on disk.
{
  const { problems: content } = await check();
  if (content.length) {
    console.log(`\ntools/check.mjs: ${content.length} problem${content.length > 1 ? 's' : ''}${CHECK_ONLY ? ' (in the layout on disk; this run wrote nothing)' : ''}:\n  ${content.join('\n  ')}`);
    process.exitCode = 1;
  } else console.log('tools/check.mjs: no problems.');
}
