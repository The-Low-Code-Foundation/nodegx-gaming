# Finishing the spin-drum carrier

The plan for closing what [`CARRIER-REBUILD.md`](CARRIER-REBUILD.md) left open, so the twin-drum carrier feels
finished. Written 20 November 2026, before any of the work, on branch `threadspace-carrier-polish` (from the
rebuild's commit `ca06381`). The first carrier (`carrier.html?ship=v1`) must keep working after every phase. Each
phase is tested in the browser on both `carrier.html` and `carrier.html?ship=v1`.
(After phase 7 the first carrier was archived, at Richard's word: see 8.)

## Decisions (taken 20 November 2026: the recommended one each time)

1. **The railgun.** The helm still fires v1's railgun. That gun runs the length of the keel, 6.4 m below the axis.
   On v2 that line passes through both drums' spoke space (from the hub at 6 m out to the inner wall at 57.5 m), so it
   can't be the same gun. It could only be a spinal mount inside the 72 m bow.
   - **Recommended: take it off v2** (v1 keeps it). At the helm in a fight your job becomes fighting the ship: turn her
     so a broadside bears and the armoured sleeve faces the raider. The helm's sight shows each side's broadside arc and
     the raider's bearing, and a click fires the broadside that bears (see 3). The design stays `spinal: false`.
   - Or: keep it as a bow spinal gun (about 60 m, inside the bow). Set `spinal: true` and its mass in the design, and
     move the muzzle and the sight's numbers to suit.
2. **Condition one in the drums.** Today condition one pumps the air out of every crew space, all 320 drum rooms
   included.
   - **Recommended: the drums stay pressurised** behind their sleeve, gap and water belt. At action stations the
     off-watch hands go up the spokes to their stations in the fixed hull, which vents as now. The sick bay and damage
     control stay in the drums, suited with helmets open. A holed drum room still vents, with its ring. The design's
     4.6 minutes is squeezed to about a minute of game time, so the drum empties inside a raid. Set by a layout flag
     (`integrity.condition.drums: false`); v1 has no drums, so nothing changes for it.
   - Or: vent the drums with the rest.
3. **The broadside tubes.** The layout has 16 in the hangar walls (`weapons.broadside`), and nothing fires them.
   - **Recommended: make them fire.** They launch cold sideways and the torpedo lights its motor clear of the hull. Each
     side is fed from its own two ordnance rooms (a wrecked magazine stops that side). The CIC fires a salvo from a side
     that bears, on a timer like the bow tubes. From the helm you fire it yourself (decision 1). The raid is rebalanced
     so the extra torpedoes don't end it in the first pass.
   - Or: drop them from the layout and the hull.
4. **A warning before a burn** (this one is new, from working out "Feeling the drive" below).
   - **Recommended: on v2, the main drive lights 3 s after you ask for it at the helm**, with the ship calling "Stand
     by for main drive" and the helm showing DRIVE LIGHTING 3·2·1. Only from cold, meaning the drive has been off for
     more than 20 s, so a burn already going, or one you stop and restart, answers at once. The transit step's
     flip-and-burn plot counts the 3 s. v1 is unchanged.
   - Or: keep the call as she lights, as now.

## What a burn should feel like (my working, for decision 4 and phase 2)

The main drive gives her 0.14 g toward the bow, so everything aboard feels pushed toward the stern.

- **In a drum** (0.97 g of spin): down leans aft by atan(0.14 / 0.97), about 8°. This is exactly v1's tilt, but today
  `main.mjs` only applies it in the fixed hull, so the drums don't feel it at all. Add it in the drum, and make walking
  toward the bow a little slower and toward the stern a little quicker.
- **The fixed hull, in grip shoes** (no other weight): your feet are held, but your body is pushed aft at 0.14 g along
  the deck. The view leans a few degrees as you brace, not v1's atan(a / g), and walking bow-ward is slower. There is no
  "slope", because there is no other down to compare it with.
- **The floating spaces** (spine, crew tunnel, trunks): nothing holds you, so a burn carries you aft at 1.4 m/s² until
  you grab on. Hand over hand (2.5 m/s² of grip) holds you and lets you pull forward slowly. Coast and you slide aft to
  the next bulkhead. "Hold on to something" becomes real.
- **In a lift car**: its lean adds the aft tilt.
- **At the helm**: a lurch back into the seat at ignition that eases off, and the rumble.
- **The call** on v2: "Main drive burning. Weightless spaces, hold on." It comes after the stand-by warning, and its
  shown text gives the g. v1 keeps its own call and tilt.

## Phases (each ends playable on both ships)

1. **Fighting the ship.** The railgun and the broadside tubes, as decided. `weapons.mjs` gets the broadside salvo
   (`broadsideFrame`, its magazines, the side that bears); `helmsight.mjs` gets the broadside arcs and the fire click on
   v2; the status board's railgun row becomes a broadside row; the start screen's helm keys and the design file are
   updated. The raid is rebalanced with the console harness (`__carrier.tick` with the render stubbed), from all four
   sides.
   **Done.** `tools/carrier-v2.mjs` deletes v2's railgun and gives `weapons.broadside` its numbers (16 a side, salvos of
   4, 30 s reload, 50° off the beam, 300 m to 9 km, out cold at 14 m/s and lit 2 s later). `weapons.mjs`
   `broadsideSide`, `broadsideFire`, `broadsideFrame`, `broadsideAim`; the helm's plot is `helmsight.mjs`
   `broadsidePlot`. The CIC fires when nobody is at the helm. The start screen and the keys say "broadside" on v2 and
   "railgun" on v1.
   - Found: the broadside's minimum range first copied the bow tubes' 1200 m, but the raider makes its passes 480 to
     760 m off, so nothing ever bore. Now 300 m.
   - Balance: from the port beam, a raid took 60 to 66 s without the broadside and 42 to 55 s with it (one or two
     salvos). The raider is now hull 940 (was 800): 56 s. From above and below the broadside never bears.
   - Found, not fixed: a raid from starboard ends in about 25 s with or without the broadside (the turrets' crews kill it
     on its first pass). That was true before this work.
2. **Feeling the drive.** The tilt and the walking in each kind of space as worked out above; the stand-by warning and
   the new call (decision 4). In `main.mjs` and `walk.mjs`.
   **Done.** Checked: from cold, W at the helm says the stand-by and counts down 3 s before the drive lights; a restart a
   second later lights at once. In the spine you drift aft (2.4 m/s after 2 s of burn) and the where-line says "hold on
   (W)". In a drum the view leans 8.0° aft at full drive, and the where-line says so. `walk.mjs` has `shove` (the push
   along the floor) and `heavy` (the Coriolis nudge, phase 3's, done here as it is the same code).
3. **Getting about.**
   - **The hub ring as a place.** Each half gets a third ring, the hub (floor 6.4 m from the axis, 12 flat-floored
     segments, 0.09 g, moving at about 2.3 m/s), built with the drum's own segment code. The lift cars wait in it at
     the six spokes. In the spine at each drum, a slot shows the ring turning past. Hold E to catch a handhold: a jolt,
     and you are in the ring's frame. Walk to a lift and ride down (the ride from the hub as today). Coming back, a lift
     up brings you out into the hub ring, and anywhere along it E pushes you off up through the seal into the spine,
     drifting. The fade there goes.
   - **A Coriolis nudge** walking in a drum: spinward you are about 11% heavier (a shorter, heavier step), antispinward
     lighter (decision 3 of the rebuild: the bob, not real physics).
   - **Climbing drawn.** Between fixed-hull decks the camera goes up or down the ladder through the hatch, rungs and the
     trunk going by, hand over hand at weightless speed; between the drum's decks a real 3 m climb at about 1 g. The
     fade goes.
   - **The far ring corridor lit.** Lamp strips that glow on their own, and a little fill, so the stretch past the
     nearest pooled lamps reads as lit. Shown a few more segments either side, if the frame time allows it.

   **Done**, with these changes from the plan:
   - The hub ring is one curved room (`src/carrier/hub.mjs`), not 12 segments. The ring is too tight for flat
     segments, since a lift car would straddle several. Its floor is 6.9 m out, at 0.11 g, moving at 2.7 m/s. You walk
     it in your own coordinates (x is the arc length round the floor) and `hubPlace()` turns that into the camera's frame.
   - Getting in and out:
     - Catching it is E at a hatch in the spine's floor (the old "lift down" spot), with the ring's handholds running
       past under it. A 1.4 s swing carries you down into the ring with a jerk as your arm takes it. Nothing to hold,
       so a press, not a hold.
     - Each spoke has two lift cars in the ring: the outer deck's on the fore wall and the inner deck's on the aft wall.
     - A ride up lets you out into the ring, clear of the car.
     - E anywhere else in the ring pushes you off up into the spine, still drifting with some of the ring's way.
     - No fades remain between the spine, the hub and the drums.
   - Walking the ring is slow (2.2 m/s: a tenth of a g). The Coriolis nudge there is strong (`walker.heavy`, 0.35 ±60%).
   - Ladders are climbed, drawn, with no fade:
     - A trunk is built round the ladder for the climb, with rails, rungs and a lamp. You look up or down it.
     - On v2's weightless fixed hull you go hand over hand at 2.4 m/s; on v1 you climb at 1.1 m/s. Either way a climb
       takes no more than 4 s: v1's decks are 13 m apart, and a true 12 s climb at every deck change dragged.
     - Between a drum's decks the climb is 3.2 s up its own ladder, with a trunk drawn through the gap.
   - Seen from the ring corridor, the deckhead cuts the view off about a segment and a half up the curve. So the window
     stays at two segments each way. The work went into lighting:
     - The corridor's lamps have `weight: 0.4`, so they beat nearer room lamps behind walls for the light pool.
     - Lamp strips glow along both walls.
     - The ring corridors have their own look, `ring`, with fill 0.62.
   - Fixed: the step's bob ran the wrong way with `heavy`. Heavier is now a quicker, shorter step.
3½. **Frame rate** (added 20 November 2026: frames were crashing in the drum mess).
   Measured first, at a pixel ratio of 2. The cost was pixels, not objects. A drum mess drew about 160 draw calls and
   68k triangles, yet took 31 ms a frame:
   - 15 ms of it was the 4× MSAA on the composer's half-float target;
   - most of the rest was the logarithmic depth buffer, which turns off the GPU's early depth test, and the bloom;
   - hiding the whole hull saved nothing on the GPU.

   **Done:**
   - `src/carrier/budget.mjs` `FrameBudget`:
     - no MSAA at a pixel ratio of 1.5 or more;
     - bloom from half the size;
     - the pixel ratio follows the real frame time: a step down below 45 fps, back up after a while at the display's
       rate, between 1 and 2 on a Retina screen. `?pr=` fixes it.
   - A reversed depth buffer where the browser has `EXT_clip_control`, else the logarithmic one (`?depth=log`).
   - What you can see from here (`seesOut()` in `main.mjs`): the ship's outside is drawn only when you can see out.
     That is her hull and everything on her frame but the decks, drums and machinery (`C.exterior`), plus the station,
     the raider, the shells and the gas (`world`). It is not drawn from a drum, a lift, the hub, a ladder or a room
     without windows. The machinery behind the fixed hull's windows is drawn only from the fixed hull.
   - Result, drum mess at a ratio of 2: 31 ms → 9.7 ms (19k triangles drawn). Bridge: 18 → 10.7 ms. Checked: the
     bridge looks the same, the cutaway and the fighter's cockpit draw right at range, and v1 plays.

   Not done (for when a scene needs it):
   - Splitting a fixed deck's baked meshes by zone, so only the rooms near you draw.
   - Culling the crew's skinned meshes (`frustumCulled` is off on them).
   - A cheaper raid scene (the gas is additive overdraw).

4. **A ship that's lived in.**
   - Off-watch hands in the drum rooms by the watch routine. Eating in the messes at meal hours, in the galley, in the
     gym, at the workshop benches and in the wardrooms. In the berths: drawn curtains and reading lamps, with a few
     awake. Some walk the ring corridor. They're placed only in the segments you can see, and only out of your sight,
     as the posts already are. The routine data says how many and when (`watches.json`, a new `drum` entry).
   - **The change of watch:** hands walk to the spoke lifts and wait at the doors, and a car takes them. If you ride
     at the change, one or two ride with you.
   - **Action stations:** the drum's hands go up the spokes and the drums empty (decision 2). The duty card says
     "Action stations: close up at …", with your station by rank (damage control party: the midships repair locker;
     gunner: your turret; and so on). Late, and you are adrift in the book, as at a muster.

   **Done**, with these changes from the plan:
   - `src/carrier/hands.mjs` `Hands` runs the drums' off-watch hands, from `drum` in `ships/carrier/watches.json`.
     That entry gives each kind of room its numbers by the hour (`uses`), the ring corridor's walkers (`ring`), the change
     (`change`) and action stations (`stations`).
     - **The budget:** `max: 12` hands drawn at once, nearest rooms first. A reserve is kept back for the ring walkers and,
       before a change, the lift queues.
     - **Where people go:** seats and work spots come from the sets themselves (`userData.spots` on the mess tables, the
       galley line, the workshop bench, the sick bay desk), and everyone else stands on a free-floor grid
       (`freeSpots()` in `drum.mjs`, clear of furniture and the doorway).
     - **Which hands are in a room:** each room's people are seeded from its id and the half hour, so a room you come
       back to holds the same hands.
     - **Out of sight:** a room changes only when you can't see into it. The test is in camera space, because the
       reversed depth buffer makes `Vector3.project`'s depth useless.
   - **The change:** 12 minutes before it, up to three hands queue in a line across each shown spoke's lift doors. The car
     takes them from the change on, then calls every 18 to 26 s, and lets one or two walkers out. Riding at the change,
     one or two ride with you; going down, they walk off with you.
   - **Action stations:** people you can see get up and walk out to the ring, then to the lifts, at a hurry. The rest
     are gone. Only the sick bay keeps its medic.
     - The duty card names your station by rank (`stations` in each career: the midships repair locker, the dorsal
       turret, a fighter, the helm). It counts down `close` (75 s) and then puts you adrift in the book, with the
       station's officer saying so. Closed up, it says so and holds there until the stand down.
     - It works on v1 too: its career has the same block.
   - **Condition one:** `integrity.condition.drums: false` (`tools/carrier-v2.mjs`). The drums and their ring corridors
     keep their air, and so the helmet stays open in them. The calls say "Venting the fixed hull".
   - **Each ship saves its own career** (`Career.key`). Before, a v2 career was picked up by v1, since both have 28
     steps.
   - **Measured** (v2, drum mess at 12:15, pixel ratio 2): 141 draw calls, 76k triangles, 4.6 ms on the GPU with 7 hands
     drawn against 3.3 ms without, so about 0.18 ms a hand. They are skinned and not frustum culled, so a hand in a shown
     segment costs that even behind you. 60 fps held.
   - **Checked:**
     - the mess's five hands seated at 12:15;
     - the queue of three at 19:46, then the car, the queue gone and two walkers out at 20:01;
     - a rider in the car;
     - action stations emptying the mess;
     - the card's countdown, then adrift and closed up, on both ships;
     - the mess at 101 kPa while the bridge vented.
   - **To record** (until then the browser speaks them):
     - condition one's two new calls, now in `ship` in `ships/carrier/voices.json` (`node tools/voices.mjs --list`
       shows them unrecorded);
     - the stations' `closed` and `adrift` lines. They name the station (`{at}`), so `tools/voices.mjs` doesn't derive
       them yet. That is five ranks across three places and two lines, for the officers `dc`, `guns`, `flight` and
       `ootw`.
4½. **The open drum section** (added 20 November 2026, asked for during phase 4). The drum section should look as the
   designer draws it: the sleeve an open-ended tube, not closed at its ends, so from the bridge tower you see in past the
   spokes and hub rings turning, along the spine to the bow.
   - The sleeve's flat end faces go; the bow's after face and the hangar's forward face are their own bulkheads. The
     sleeve gets an inside surface, its own thickness at the ends, and its heavy rings.
   - The drum drawn from outside (`drum.mjs`), turning with each half: the ring's end walls and inner wall, the six
     spokes (lift tubes) from the hub ring out to the inner wall, the hub ring.
   - Heavily armoured, exposed structure: the spine between the bow and the hangar, the hub rings and spokes, and at each
     end a fixed frame of struts that ties the sleeve to the bow and the hangar (the sleeve can't float). Shells can reach
     them through the open ends at an angle: weak points, but not that weak (their own `integrity.armour` numbers).

   **Done**, with these changes from the plan:
   - The numbers are in the layout: `drum.structure` (from `tools/carrier-v2.mjs`). It holds:
     - the sleeve's thickness and its end rings;
     - the spine's armoured tube (r 3.6 m, from the bow's after bulkhead to the hangar's forward one);
     - the hub ring's armoured drum (r 7.9 m, 9 m long);
     - the spokes (4.2 × 3.2 m);
     - sixteen struts, eight at each end, from the end ring's corners to the bow and the hangar 16 m away.
     The hull, the drum's outside and the hits all read them.
   - **The hull** (`carrier_v2_build.py`, `hull.glb` rebuilt) is three lofts joined:
     - the bow, capped aft: its after bulkhead;
     - the sleeve, an open tube with its inside surface turned inward and a frame round the inside every 2.75 m;
     - the hangar and stern, capped forward.
     A heavy octagonal ring stands just off each end of the sleeve. The struts run from it, and the spine runs in
     three armoured lengths between the hub rings.
   - **The drum seen from outside** (`drumOutside()` in `drum.mjs`), turning with its half and drawn only when you can
     see out:
     - the end walls, with a lamp in every segment;
     - the inner wall and the belt;
     - each spoke's two lift tubes, with lit slits so you see them turn, its ladder tube and an armoured web;
     - the hub ring's armoured drum.
     Four merged meshes a half, so 8 draw calls.
   - **The hits.** Since the sleeve is open, a shell no longer meets a solid box there. `integrity.meets(p)` says what it
     does meet: the hull, the sleeve, a drum, or the spine, a hub, a spoke or a strut. `weapons.mjs` `hitsCarrier`
     uses it, so a shell can fly in at an end, past the spokes.
     - The exposed structure has `integrity.armour.structure`: 70% stopped, and 3 m of reach lost when not.
     - Through it, the spine is holed and vents. A hub or a spoke is holed into its drum's inner ring corridor
       (`structureHit()`). A strut is only hurt metal.
   - **Measured:**
     - Of 300 shells aimed at the spine through the ends, 35° to 70° off the axis: 144 hit the bow or the hangar, 22 the
       sleeve, 20 a drum, 30 the spine, 37 a hub, 25 a spoke, 22 a strut.
     - Of 40 hits each on the structure, 21 to 30 glanced off.
     - Four raids, one from each side, ran without errors, and v1's raids work as before.
   - **Not done:**
     - The bridge looks out through its side windows, and its forward wall is screens. So the view from the bridge to
       the bow is the helm's outside view (V), not through glass.
     - `?hull=code` (the lofted hull in code) still draws the sleeve closed.
5. **The hangar as an airless workplace.** Deck crews in suits (a suit colour and helmet over the uniform, from
   `crew.mjs`) at the fighters and on the lanes. The fittings dressed for no weight and no air: crates under cargo
   nets on the tie-downs, tool chests clamped to the deck, handrail lines along the walkways, tethers. Each fighter's
   boarding ladder becomes a grab-bar frame you pull yourself up ("pull yourself up into the cockpit"). The catwalk is
   reached by its rungs. The room tone in the hangar is your suit (breathing, the fans, your boots through the deck).

   **Done**, with these changes from the plan:
   - **Deck crews:** `placeCrew` puts anyone at a post in a `vacuum` room in a vac suit (`crewMember(k, dept, {suit})`).
     The suit is an off-white recolour, a helmet with a visor, a neck ring and a lamp on the head bone, and a
     life-support pack on the upper spine banded in the department's colour. The hangar now has three deck crew posts
     besides the sentry: two at work beside fighters, one on a launch lane by the port bay door. The sentry's route
     moved to the centre walkway, out of the fighters' tails.
   - **The fittings** (`zeroG()` in `sets.mjs`, airless hangars only):
     - crates under cargo nets strapped to the deck at both ends;
     - a tool chest clamped down by each pad, a tool tethered from it;
     - handrail lines on posts down both sides of the centre walkway, open at each pad, with tether coils hung on them;
     - handholds along both bulkheads.
     `dressHangar()` no longer puts anything on a wall where it is a bay door: the catwalk, the frames and the HANGAR
     poster were across v2's starboard door. v1's chests, hose reels, trolley and tug stay v1's: they were laid out
     for its hangar, and on v2 they stood outside the room.
   - **The ladders:** each fighter's boarding spot has a frame of grab bars (`grabFrame()` in `layout.mjs`), and E there
     says "Pull yourself up into the cockpit". The catwalk's lengths have rungs up the wall at each end. These are
     dressing: the catwalk is still not walkable (it never was).
   - **The sound:** the suit is the room tone whenever your helmet is closed, not only in the hangar
     (`suitFrame()` in `ambience.mjs`): a fan whirr, a breath in and out every 4 s or so (quicker when you run) and a
     boot on the deck every 0.75 m you walk.
   - **Checked:**
     - suited crew in the hangar, with helmet and pack in place;
     - the frames, chests, nets, handrails and rungs in v2's hangar;
     - v1's hangar unchanged, its crew in uniform;
     - the suit's sound rendered offline, without playing aloud: twice the vacuum's rumble level, and 10 boots for
       8.4 m walked.
6. **Damage in the drums.**
   - A drum hole drawn in the room's own segment, on the wall the shell came through. It vents with the mist and the
     wind, and you can patch it yourself with a patch kit, as in the fixed hull.
   - Drones fly to where the hole has turned to, following it as the drum spins.
   - Fires and electrical faults come up in drum rooms after hits (today's `consequences()` already picks the room;
     check the jobs' spots, switchboards and kit work in a segment).

   **Done**, with these changes from the plan:
   - **Where a drum hole is:** `makeHole` calls `drumHole()` for a drum node. That works out the segment (the room's
     own, or for a ring corridor the one the shell came in at, from its angle round the drum), and keeps the hole's
     point and normal in that segment's own frame (`h.drum`). Segments are built as you walk to them, so the hole is
     drawn when its segment is (`holeFrame`). A hole that was sealed before you got there shows as patched
     (`patchLook()`, which `seal()` now calls too).
   - **The hole turns:** `holeNow(h)` is where a drum hole is now, in the ship's frame. The drones fly to it (1.5 m in
     from the drum's skin) and keep following it as the drum turns; the cutaway's hole marker uses it too. The wind in
     a drum room pulls you toward the hole along the corridor's floor, through the segments' wrap.
   - **Found and fixed:** `structureHit()` passed the shell's direction to `makeHole` the wrong way round, so a hole
     from a hit on the hub or a spoke faced into the ring rather than out.
   - **Fires and electrical faults:** they needed nothing new. `consequences()` picks the drum room, and the job's spot,
     its switchboard and the kit all work in a segment.
   - **Checked** (v2, with `__carrier.tick` because the pane was hidden):
     - a hole in the mess floor, drawn at the right place in its segment, with the mist and the patch prompt; patched
       with a kit, and logged "by you";
     - a ring corridor hole two segments away: the wind moved you 1.02 m toward it, and the drone tracked it round;
     - a fire in the drum gym, put out ("Fire out in 0:04");
     - an electrical fault in the drum stores, isolated at the switchboard and repaired ("Fault repaired in 0:10");
     - a segment built after its hole was sealed shows the patch, and no mist;
     - v1: a hole in the mess drawn with its mist, sealed by a drone and shown patched, during a raid, with no console
       errors.
7. **The look and the words.**
   - The drum sleeve's flat end faces get a radial panel pattern instead of the fan (`carrier_v2_build.py`, then a
     rebuild of `hull.glb`). *Overtaken by phase 4½: the sleeve no longer has end faces.*
   - The README's carrier bullets that still describe v1, rewritten: the three decks and their passages, the one-way
     rule, "80% of the hull", "Feeling the drive", the 400 m railgun line. Also `game.json`, the start screen
     (`carrier.html`) and `CLAUDE.md`.
   - Where the career hands over to [`OPENING.md`](OPENING.md), noted.
   - Last, the whole career played through to Helmsman on v2, and v1 loaded and played.

   **Done**, with these changes from the plan:
   - **The README.** The three decks and the one-way rule were already only in the line about the first carrier, so
     they stay there. Rewritten for v2:
     - "No wasted space": 75% of the fixed hull, measured with `tools/carrier-space.mjs` (v1's 82%);
     - the turrets: ten, with where their hatches are;
     - eighteen point defence guns, the bow tubes and the broadside tubes;
     - the railgun bullet became "A broadside you aim with the ship", with v1's railgun in brackets;
     - "Feeling the drive": v2's stand-by and push in each kind of space, and v1's slope in brackets;
     - twelve fighters, launched from the door on their side;
     - three main drives;
     - fourteen crew at their posts, and the drum hands;
     - the damage call's example, now a real v2 call: "Fire in the galley. Forward drum, outer deck, frame 91,
       segment 17.";
     - the cutaway's keys: 1 is the whole ship and 2 on are the decks. This was wrong for v1 too.
   - **Found: v2's heat-full call named the railgun.** `plant.mjs` now says "Point defence holding fire" on a ship with
     no railgun. The broadside launches cold and makes no heat, so full sinks don't stop it.
   - **The career.** `start.say` now says to catch the hub ring at the hatch in the spine, then take a lift down. The
     gunnery officer's suit line said the ship pumps "her air out". It now says the fixed hull, and that the drums keep
     theirs.
   - **`game.json`:** `buildYourOwn` names the carrier's career, watch bill and layout generator. The tagline is about
     the main game and stays.
   - **`CLAUDE.md`:**
     - "How the main deck is laid out" is marked as v1's;
     - "Add a compartment" says v2's rooms go through the generator;
     - the cutaway keys are corrected.
   - **The start screen:** v1 already had its own text (`main.mjs`, `c-about`) and its railgun line (`c-arm`), so
     nothing changed there.
   - **The hand-over to [`OPENING.md`](OPENING.md):** noted there as "The seam". The dock scene ends on the career's
     `start` spot and calls `career.begin(true)`. Saves are per ship and per number of steps, and nothing comes after
     Helmsman yet.
   - **Checked:**
     - v2, a fresh save: all 28 orders run through `__carrier.career.complete()`, Apprentice to Helmsman through every
       rank, with everything unlocked and the save kept. Then the helm, and a raid from port, with no console errors.
     - v1: its own start text and railgun line. Its career ran to Helmsman on its own save, without touching v2's. Then
       its helm, and a raid from starboard, with no errors.
     - `node site/build.mjs` passes.
   - **Not checked:** each order played by hand. `complete()` skips what each order waits for. The orders were played
     by hand in earlier phases, but not all again after this one.

8. **What was left, finished** (asked for after phase 7).
   - **`?hull=code` opens the drum section.** `buildHull()` in `layout.mjs` lofts the bow and the stern on their own,
     capped, and the sleeve as an open band: outside, inside (`turnFaces()` turns a loft's faces inward) and a flat ring
     at each end. Checked: from behind, the drum's end wall and spokes show through the sleeve.
   - **The bridge looks forward.** The tower's front is now a sheer face over a low nose: a new island section in
     `tools/carrier-v2.mjs`, 0.2 m ahead of the full-height one. The bridge has forward windows (`side: 'n'`, 18 m wide,
     sill 1.0 m). `carrier_v2_build.py` puts glass, mullions and armoured shutters on that face, and the masts are now
     placed from the full-height sections (they used to be placed by section number). `hull.glb` was rebuilt: 25,700
     triangles, 1,396 KB.
     - Checked: from the helm's bridge view you look over the hangar's back, through the open sleeve, at the spokes'
       lit lift tubes turning. This is the view through the section from the bridge to the bow that was asked for in
       phase 4½.
   - **The catwalk is walkable.** `sets.mjs` records each length of the hangar catwalk (`C.catwalks`) and puts rungs at
     both ends on either ship. `main.mjs` adds the uses: "Climb the rungs to the catwalk" and, at the top, "Climb down
     to the hangar floor". `startRungs()` is the climb, drawn like a ladder's. `catwalkFrame()` keeps you on its floor,
     inside its rail and its ends, and the where-line says "on the catwalk".
     - Checked, suited: up the rungs to 6.2 m; held at the rail and at the length's end; down again at the far end.
     - Found while testing: without a suit you black out in the airless hangar and are dragged to the airlock. That is
       correct.
   - **The first carrier is archived** in `archive/carrier-v1/`: her layout, career, watch bill, `hull-v1.glb` and
     `carrier_build.py`, with a README on what each is and how to bring her back.
     - `?ship=v1` is gone, and `carrier.html` always plays the spin-drum carrier.
     - `tools/carrier-v2.mjs` and `tools/voices.mjs` read her files from the archive. The generator's numbers start
       from her layout, and `--prune` keeps her clips.
     - The code paths for a layout without drums, or with a railgun, are kept.
     - The README, `CLAUDE.md` and `CREDITS.md` no longer describe her, except to say where she is. Her main-deck notes
       moved to the archive's README.
     - Checked: the career to Helmsman, a raid from starboard, no console errors and no missing files, and
       `node site/build.mjs` passes.

## Not in this plan

- Recording voice lines. Lines that change are listed for `tools/voices.mjs`; until then the browser speaks them.
- The opening (`OPENING.md`): the station dock and the consoles.
- Pressure doors round the ring corridor, so a holed room drains only its stretch of ring: the ring stays one air
  node.
- The spoke's ladder tube (the 55 m backup climb to the hub): the lifts only.
- Copying the game into any other app; pushing or opening a PR.
