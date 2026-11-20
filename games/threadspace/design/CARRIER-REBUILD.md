# Rebuilding the carrier as the spin-drum design

The plan for turning `carrier.html` from today's 400 m flip-and-burn carrier into the twin-drum carrier in
[`carrier-v2.design.json`](carrier-v2.design.json) (see [`SHIP-DESIGN.md`](SHIP-DESIGN.md)). Written November 2026,
before any of the work started.

## How big it is

The carrier's code is about 12,000 lines (16,000 with its data and tools). Roughly a third of it changes:

- **Data only:** compartments, doors, stations, the career, the watches, the point defence, tube and railgun mounts,
  the plant's tanks, floor lines, damage kits.
- **New engine work:** walking in a spinning drum and floating in the weightless hull; rooms set round a ring; doors
  where two ring segments meet; the cutaway's levels; shells meeting a spinning drum (integrity); wayfinding's
  directions; turrets that are not on top or bottom; the bay, approach lane and landing path on both sides; the hull
  in code and in Blender.
- **About 20 places in code name a room or a deck** (career, watch, damage, integrity, cutaway, ambience, sets, main),
  and 15 of the 73 recorded voice lines name a place. Those lines must be recorded again (`tools/voices.mjs`, with a
  key in the environment).

Bow and stern can mostly reuse today's rooms and code; the drum and the hangar are the new parts.

## The trick that keeps it affordable

The design's drum is 40 flat-floored rooms round each ring, not curved floors. So each of the 40 segments can be an
ordinary `Interior` of box rooms in **its own frame**, turned 9° from its neighbour, with all 40 hung on one drum node
that spins. Everything that works on flat x/z boxes today (rooms, fits, sets, lights, collisions, `roomAt`) works
unchanged inside a segment. The new code is only:

- the walker changing frame as it crosses from one segment to the next (the floor tips 9°, which the design says you
  feel as a slight lean at a room's edge);
- the joins: an opening between two segments' corridor ends instead of a door between facing walls;
- spinning the drum node, and the hub ring, spokes, lifts and ladder up to the spine.

Only the segments near you need to be built and drawn; the rest can be baked and culled.

## Phases (each ends playable)

1. **Data first. Done (19 November 2026).** `node tools/carrier-v2.mjs` builds `ships/carrier-v2.layout.json` from
   the design: the drum's 320 rooms from the designer's own room plan (in `drum.rooms`, each in its segment's frame),
   the weightless hull's 44 walkable rooms and 42 sealed compartments, doors, ladders, 10 turrets, 18 point defence
   guns, 6 bow and 16 broadside tubes, 12 fighter pads, radiators, both bay doors; the fighter, weapons' numbers,
   integrity, plant and damage control carried over from today's layout. It checks for overlaps, anything through the
   hull or into a drum, rooms with no way in, and names that don't resolve. Rooms the career, watch bill and kits use
   keep today's ids (bridge, cic, medbay, mess, quarters-a/c, gym, ship-office, repair-mid…), so they all resolve; the
   spots inside those rooms are phase 5. `node tools/carrier-space.mjs ships/carrier-v2.layout.json` maps it.
   The game still plays `ships/carrier.layout.json` (v1), untouched. Phase 2 makes `carrier.html` read v2, and at
   that point v1 is kept as `ships/carrier-v1.layout.json`.
   - Found: the fixed hull is 62% accounted for (v1: 82%). The space under the hangar roof, around the trunks and in
     the stern's upper corners is still empty: fill it in phase 3.
   - Found: the bridge tower (eye 28 m up) can't see forward past the drum sleeve (68 m radius). It sees aft and to the
     sides; forward is cameras. Raise the tower, or accept it.
2. **The hull from outside. Done (19 November 2026).** `carrier.html?ship=v2` plays the new layout; plain
   `carrier.html` is still today's carrier, unchanged (checked: hull, bay, fighters, crew).
   - `tools/blender/carrier_v2_build.py` builds `assets/carrier/hull-v2.glb` (about 30,000 triangles): bow, the
     octagonal armoured sleeve with its rings, the hangar with launch doors cut through both sides, the stern with
     its tower, side bridge windows, radiators and three drive bells; ten three-barrelled turrets, 18 point defence
     sponsons, bow and broadside tube doors. Today's `carrier_build.py` and `hull.glb` are untouched.
   - The page no longer assumes today's ship: armour bands, bridge shutters, radiator trim, the ship's inertia, the
     bay doors (any number, all moved together), the hangar's lanes and crates, and the `?at=` starts all come from the
     layout.
   - `src/carrier/drum.mjs` builds the drums for the cutaway: each half spinning its own way, the 320 rooms coloured by
     use (as in the designer), ring corridors, belt, inner wall, end walls, spokes and hub. Seen only through the cut.
   - In v2 the career is off (free roam only) until phase 5 moves its people.
   - Found: all ten turrets train and lay on a raider and take it from 320 to 20 hull in about 30 s. Today's raid is
     tuned for two turrets, so phase 6 rebalances it.
   - Found: the railgun's muzzle now leaves through the new bow, but the design has `spinal: false`. Keep the helm's
     railgun, or take it out?
   - Still to do: the sleeve's flat end faces show the hull's panel pattern as a fan; the fighters' launch and landing
     still run along -x with today's hull extents (phase 6).
3. **The weightless hull. Done (19 November 2026).** From the bridge, down the tower ladder, along the engineering
   passage into the crew tunnel, and down a boarding tube into a fighter's seat, without a suit; climbing out brings you
   back up the tube.
   - The fixed hull is now 75% accounted for (was 62%; today's ship 82%): tanks, stores and machinery against the skin
     in the bow, girders under the tunnel deck, door housings over the launch doors, bulkhead tanks at both ends of the
     hangar, air trunking beside the tunnel deck's rooms, bilge tanks under the plant and the drive, and three more rooms
     aft on the tunnel deck (stores, washroom, aircrew rest). 47 walkable rooms, 84 sealed.
   - The hangar is airless (`vacuum: true`): `integrity.mjs` keeps it at 0 kPa, counts it open to space (no refill, and
     a door left open onto it vents the room behind), never lights it as a breach, and starts any door onto it shut.
   - The hangar airlock (`airlock: true`, under the forward trunk): E at its outer door cycles it. Shut, it dogs the
     ladder's hatch, pumps the lock down (25 kPa a second) and opens the door, only in a vac suit; open, it shuts the
     door, fills the lock and opens the hatch. Suits are in the spine 5 m away and in the tunnel's rooms. In the hangar
     the helmet closes and you breathe the suit's bottles. `?ship=v2&at=hangar` starts you suited.
   - Boarding tubes (`fighters[i].boarding`): a hatch in the tunnel's deck over each fighter (port and starboard side by
     side), and a tube from the hangar's roof to her canopy. E boards her; E on the pad brings you back to the hatch.
   - Floating (`float: true` on the spine, crew tunnel, forward trunk and keel passages): the walker's float mode (walk.mjs
     `floatFrame`): W/A/S/D pull you hand over hand toward 1.5 m/s and brake a drift the other way, Shift kicks off at
     3.5 m/s and you coast past the holds, a wall stops the drift into it; no step bob, a slow rise and fall and a slight
     roll. The where-line says "weightless". Everywhere else, grip shoes: walking as today.
   - Found: the browser pane pauses the frame loop when hidden; drive tests with `__carrier.tick(n, 1/30)`.
   - Still to do: the hangar's own lanes, crates and fighters' ladders still assume you walk the floor (phase 6 makes
     the hangar a vacuum workplace: deck crews in suits); ladders between decks still fade, with no climbing drawn.
4. **The drum. Done (19 November 2026).** From the spine, a lift down a spoke to either deck of either drum, a lap of
   the ring (all 40 segments, back where you started), the ladder between the decks, and the lift back up to the spine.
   - `src/carrier/drum.mjs` `segment()` builds a segment the first time you come near: an ordinary `Interior` in its own
     frame (a group turned to its angle on the spinning half), with its two rooms from `drum.rooms`, its piece of ring
     corridor (open at both ends), doorways with the room's name over them, a plate saying where you are
     ("FORWARD DRUM · OUTER DECK · 12"), and at a spoke the lift against the corridor's fore wall and the ladder against
     its aft wall. `drumWindow()` shows the two segments either side of yours and hides the rest; a new segment takes
     under 20 ms to build. All 160 per drum are kept once built.
   - Walking round: segment k's floor edge at x = +hw is segment k+1's at x = -hw, so `main.mjs` (`drumStep`) moves you
     into the next frame there, keeping where you face. `placeInDrum()` leans the view across the last 0.9 m before
     an edge, half the 9° step at the edge itself, so the crease is a slight lean and nothing jumps. Looking along the
     corridor, the floor rises ahead of you.
   - The lifts: call points on the spine's walls at each drum (one per deck). The ride takes 9 s, easing in and out,
     with the weight building from 0.10 g to 0.97 g on the where-line. The car leans on its rails as it speeds up and
     slows down (Coriolis, 2ωv against the spin's ω²r, at most 0.3 rad: faked, as decision 3 says). It has a glazed
     door, its own lamp from the light pool, and a lit shaft built for the ride. Up from a deck, you come out into the
     weightless spine.
   - The drum's rooms are furnished by kind (`fit`). Today's sets for the mess, galley, sick bay and quarters were
     drawn for bigger rooms and stood through a 9 m drum room's walls, so the drum doesn't use them yet: phase 5. (Done:
     `drumSet`.)
     (`sets.mjs` `dressRoom` no longer fails when a room's preferred services wall isn't one of its long walls.)
   - The drum rooms have no air or health yet (integrity treats you as in good air there); that's phase 5 too, with
     the people. (Done: see phase 5.)
   - `__carrier.go('mess')` (any drum room id) stands you in it; `__carrier.drum()` says where you are.
   - Not done: the hub ring as a place you walk (the lift's call point is in the spine, so "catching the ring" is the
     fade); Coriolis while walking (decision 3's nudge of the bob spinward and antispinward); the far segments of the ring
     as you look along it are dark past the nearest lamps.
5. **The ship working again. Done (20 November 2026).** The spin-drum carrier is now the game: `ships/carrier.*.json`
   and `assets/carrier/hull.glb` are v2, and the first carrier is kept as `ships/carrier-v1.*.json` and
   `assets/carrier/hull-v1.glb`, played by `carrier.html?ship=v1` (and `carrier_build.py` writes `hull-v1.glb`).
   The whole career plays through on v2, from the shuttle to the helm.
   - Places in a drum: every drum room and each deck's ring corridor (`ring-<half>-<deck>`) is in `C.rooms` with a
     deck key (`drum-a-o`), `seg`, and x/z in its segment's frame. `drum.mjs` `places()` gives `C.interiorOf(room,
     seg)`, `C.doorOf`, `C.toShip` (a segment point in the ship's frame, as the drum stands now), `C.drumAt(p)` (the
     place at a ship point) and `C.drumRoomAt`. `goDeck()` and `__carrier.place(deck, x, z, yaw, seg)` take drum keys.
   - The career and the watch bill (`ships/carrier.career.json`, `.watches.json`, made from v1's by moving every spot
     and rewriting the lines that name places): you come up a boarding tube into the crew tunnel; the coxswain is in the
     ship's office in the after drum; the watch bill hangs on the ring wall beside its doorway; your bunk is in quarters
     C; Blue watch musters at the midships repair locker off the crew tunnel. The duty card's hint names the drum, the
     deck, the segment you want and the one you are in. The gold marker in the cutaway turns with the drum.
   - Damage control: an extinguisher cabinet on every other segment of each ring corridor, the other lockers every
     fifth; a drum job's code is `<half><deck>-<seg>-<frame>` and its marker turns with the drum.
   - Integrity: each drum room and ring corridor is an air node with no box (`drum: true`); a room shares air with its
     ring through its open doorway (`drumLinks`), and a ring is all forty segments' worth of air, so a holed cabin drains
     its ring slowly. A shell's path finds drum rooms through `C.drumAt` (the partition walls between segments are
     nothing). Alarms light the room in every built segment; the air gauge, blacking out and the rescue work in the drum
     (the party carries you to the nearest room round the ring). Drones seal drum holes. The hole's red marker turns
     with the drum; the drone flies to where the hole was struck, not where it has turned to.
   - Sets: the bridge and engine control are laid out from the layout's helm and station spots, not v1's numbers; the
     drum's quarters, mess, galley and sick bay have sets of their own sized to a 9 m room (`sets.mjs` `drumSet`).
   - Floor lines: Bridge, Hangar tunnel, Engineering, Drums (purple, to the spine and its lifts).
   - Voice lines to record again (`node tools/voices.mjs --list`, which now lists both carriers' lines so `--prune`
     keeps v1's clips): the coxswain's welcome (step 0), the damage control officer's fire drill, electrical fault and
     "damage control ticket" (steps 5, 7, 11), the gunnery officer's sled briefing (step 12), flight's "every gunner
     gets a go" (step 18), the officer of the watch's helm order ("three hundred metres", step 23), and Leading Hand
     Lund's seven wake-up calls (the muster is now "the midships repair locker"). Until then the browser speaks them.
     The ship's fixed calls (condition one, heat, torpedoes) were never recorded for either carrier.
   - Not done: the helm still has v1's railgun (the design has `spinal: false`); raids, drills and landing still use v1's
     sides and lanes (phase 6); a drum room has no hole drawn in its wall (you can't patch it yourself).
6. **Flying and fighting. Done (20 November 2026).**
   - Either side: a fighter launches the way her nose points across the ship (`fighter.out`, -1 port, +1 starboard,
     from her pad's yaw) and comes home on that side: the gate, the approach lane's rings (`approach.setPad(z, out)`),
     the lane's along/closing/nose, flight control's path, the catch, and the turn on the pad all follow it. The six
     port pads use the port doors and lane, the six starboard pads the starboard ones.
   - The layout's `fighter.launch.clear`, `launch.wings` and `landing.gate[0]` are now distances out from the centre
     line (the sign is ignored, so v1's negative numbers still work). `tools/carrier-v2.mjs` sets them from the hull's
     width along the hangar: wings spread 2 m outside the hull, hand-over 12 m out, the gate 28 m out and 4 m over the
     hangar floor (v2: 25.5, 35.5, [51.5, -8]).
   - Flight control's path round the hull (`fighter.mjs` `land()`) reads the hull's lofts (`hullSpan()`: the widest
     and tallest the hull is between where you are and your pad, the tower included) instead of v1's fixed numbers, so
     it goes over or under the drum sleeve, or out past the bow or stern. Tested from both sides, above, below, ahead
     and astern: no path enters the hull or the drum except the run in through the bay door.
   - Turrets: all ten of v2's stand on top or underneath, which `weapons.mjs` already aims (it mirrors the ventral ones),
     so no change was needed. A turret on the ship's side would need a mount frame in the aiming maths and in both
     Blender scripts; `tools/carrier-v2.mjs` now refuses one rather than let it aim wrongly.
   - Raids: v2's crews killed a v1 raider (hull 320) in about 25 s, inside its first pass. Its raider is now hull 800:
     55 to 66 s from any side, against v1's 59 to 67 s, with about as many hits on the carrier. Drills run as before
     (the sled keeps 600 m off).
   - Still open: the railgun at the helm (the design has `spinal: false`); the hangar's own fittings (lanes, crates,
     ladders) still assume you walk its floor; a drone flies to where a drum hole was struck, not where it has turned to.

## Decisions (taken 19 November 2026: the recommended ones)

1. **Replace or alongside?** Recommended: replace in place, so `carrier.html` stays the page the game's title button
   opens, with v1's layout kept as a file to read.
2. **Moving in the weightless hull.** Recommended: grip shoes in the fixed-hull rooms (bow, stern, bridge: today's
   walking, no gravity drawn), and real floating along handhold lines only in the spine, the crew tunnel and the hub.
   The alternative, floating everywhere, is a bigger change to every room.
3. **Coriolis.** Recommended: feel it, cheaply: the lift car sways sideways near the hub, and walking spinward or
   antispinward nudges the view's bob. Not real physics.
4. **How many drum rooms are walkable.** The plan has 320. Recommended: all of them generated from data, with the
   spare ones as stores and empty cabins, built only near you.
