# ThreadSpace carrier: what comes next

Written 20 November 2026, after the spin-drum rebuild ([`CARRIER-REBUILD.md`](CARRIER-REBUILD.md)) and the polish
pass ([`CARRIER-POLISH.md`](CARRIER-POLISH.md), commit `e521d64`), both done. It merges fourteen points of play-test
feedback with what was already open, into phases that each end playable. Each phase says what it fixes (feedback
numbers in brackets), where the work is, and what is still to decide.

Already done by the polish pass, so not repeated below: the railgun off and the broadside torpedo tubes firing from
the helm; drift aft under thrust in the weightless spaces and the drive's stand-by call; the hub ring; climbs drawn
up every ladder (no fades); the frame budget (`budget.mjs`); off-watch hands in the drums (`hands.mjs`); the airless
hangar dressed for no weight (nets, tethers, handrails, grab frames) with suited deck crews; damage in the drums; the
bridge's forward windows; the walkable catwalk; the first carrier archived in `archive/carrier-v1/`.

## Where things stand

- The carrier is about 12,000 lines in 29 modules under `src/carrier/`, plus 170 KB of `ships/carrier.layout.json`.
  The main game (`game.mjs`, `data.mjs`, sectors, stations, the Kestrel) is a separate page and knows nothing of the
  carrier.
- Already open before this feedback: the hand play-through of the first week; a second week of career; more kinds of
  enemy (`weapons.raider` is one ship, not a list); voice lines that name v1's places, plus the ship's fixed calls
  (condition one, heat, torpedoes), which were never recorded; the naval slang in the lines; a dozen rooms still on
  generic furniture; the ship has no name.
- Planned but not started: [`OPENING.md`](OPENING.md), the dock-hand opening (the station shift, the carrier coming
  in, the hiring conversation) and the ship's consoles (navigation, tactical, sensors, comms, operations, engineering,
  flight control). Where it fits is under "The opening" below.

## What the feedback found in the code

| # | Point | Cause, as the code stands |
|---|---|---|
| 1 | W in mid-air is odd | `walk.mjs` `floatFrame`: W/A/S/D pull you along at 1.5 m/s wherever you are. There are no handholds. |
| 2 | Space shows through the ring ahead | `drum.mjs` `drumWindow(…, n = 2)` draws two segments either side. The polish pass judged the deckhead cut the view at a segment and a half, but from a 1.7 m eye on the 63.5 m outer deck under a 3 m deckhead the floor stays in sight for about 32 m, three segments of 10 m. Standing near a segment's far edge, two is not enough. |
| 4 | Ladders clip through decks | The climbs are drawn now (`startClimb`, `climbFrame` in `main.mjs`), and that is where the clipping shows: the camera passes through the deck and deckhead on the way. |
| 5 | Zero-g rooms have chairs | Only five rooms float (spine, fwd-trunk, tunnel, keel, keel-aft), and the hangar is dressed for no weight. The other 42 rooms in the fixed hull are grip-shoe rooms furnished like rooms with gravity. |
| 6 | Crew walk through zero-g | `crew.mjs` has six clips (idle, walk, sit, work, talk, look round) and no floating clip. |
| 7 | Crew in jeans and T-shirts, suits from lockers | The crew are Rocketbox people recoloured (`wardrobe.mjs`); only the hangar's deck crews wear a suit (`crewMember(…, {suit})`: a recolour, helmet, neck ring, pack). The vac suit is a locker item (`damage.kits.suit`). |
| 8 | Launch tubes, bay doors | `layout.mjs` bay door slabs rise by `height - 0.4`, so 0.4 m of door stays across the top of the opening. Boarding is a tube from the hangar roof. |
| 9 | Too many point defence guns | 18 identical PDCs (3 km range, 22 rounds a second each), plus 10 three-gun turrets. |
| 10 | The ship doesn't kick when firing | Turret barrels run back (`weapons.mjs` recoil) and your camera kicks when you are the gunner. Nothing pushes the ship's `Rigid`, and the railgun, the one gun big enough to see, was taken off. |
| 11 | Fighter missiles | The fighter has a cannon only. |
| 12 | Robotic voice, too many calls | Every unrecorded line falls back to `speechSynthesis`, and the ship's fixed calls were never recorded, so a raid is all browser voice. Every call goes to everyone, wherever you are. |
| 13 | Talk to anyone | Only the career's officers have a "Talk to" use, and it just ticks the step. |
| 14 | Fighter clips through carrier | No collision at all. Flight control's path avoids the hull (`hullSpan`), but free flight passes through it. |

## Phase 1. Quick fixes (one session)

Small, and none depend on the rest.

- **[2] Draw distance in the drum.** `drumWindow` n from 2 to 4, checked by looking along the ring from a segment's
  edge on both decks. Measure the frame against the budget (`budget.mjs`): segments build in under 20 ms.
- **[8] Bay doors fully open.** The slab rises its full height plus a margin into the deck above; check the hull.glb's
  door cut matches; check the launch run clears both.
- **[4] Climbs that stay inside the trunk.** Find where the drawn climb's camera crosses a deck or deckhead (the
  hatch's opening, the eye's height at each end, the near plane) and keep it inside the trunk all the way.
- **[10] The ship feels her guns.** Every shot pushes the ship's `Rigid` at the mount (`newton.mjs` already takes a
  force at a point). Honest scale: a turret round barely moves a ship this size, so aboard that is a shudder through
  the frames and a creak (`ambience.mjs`), stronger near the mount. The railgun is the one you see from outside: a
  real jolt and a slow turn the helm has to catch.
- **The broadside railguns** (decision 4): one fixed gun in each hangar wall at the centre of mass, beside the
  broadside tubes, in `tools/carrier-v2.mjs` and the Blender hull. The helm already fires the broadside that bears
  (`broadsidePlot`); the railgun joins it there. Their recoil is the big kick above.
- **[9] First cut of the guns.** 18 PDCs down to about 8, and the raid rebalanced with the headless sims. The proper
  split into kinds is phase 6.

**Done, 20 November 2026** (CLAUDE.md has the details). Where it went differently from the plan above:

- Draw distance: `drumWindow` builds four segments either side; the gap in the ring at three is gone.
- Bay doors: the slab could not rise its full height into the deck above (the hangar roof is in the way), so each door
  is now leaves that stack upward under the roof. The fighters' pads were partly outside the door span (two of six a
  side launched into the wall); all twelve now sit in front of their door. The boarding tube telescopes up into the
  roof once her drive is up.
- Climbs: the clipping was solid deck and deckhead slabs over every ladder, plus the dark hatch boxes. Every ladder
  now goes through a real hole in each deck it passes, with a hazard-striped lid that slides open for the climb (fixed
  hull and drums both).
- Recoil: every turret round and slug pushes her `Rigid` at the gun. A turret round moves her about 4.5 mm/s, a
  slug 6 cm/s, and a raid's turret fire leaves her drifting about half a metre a second. The railguns sit at her
  centre of mass (decision 4), so a slug pushes her sideways without turning her: the "slow turn the helm has to
  catch" does not happen. The default assist (ROT) leaves the drift; FULL or all stop takes it out. Aboard it is a
  shake by impulse and distance; the creak in `ambience.mjs` is not done.
- Broadside railguns: one out of each hangar wall (20 slugs a side, 2 t at 9 km/s), Q at the helm, drawn on the
  broadside plot. A raider makes its passes 10 to 30 degrees above or below her beam, so a fixed gun bears only when
  the helm rolls her onto it; the plot says how far off the line the raider is and which way to roll. The CIC fires a
  side that bears with nobody at the helm, which in practice it almost never does: the railguns are the helmsman's.
- PDCs: eight (three down each side, one on top, one underneath). In the headless raids eight unchanged guns shot down
  about three torpedoes in five where eighteen shot down four in five. At 26 rounds a second (was 22) with a 4 m burst
  (was 3) the eight are back to about three in four (18 of 24), raids still last about a minute, and they make about
  half the heat.

## Phase 2. Structure (one or two sessions, no new features) [3]

See "How a game this size is organised" below. This comes before people, voices and missions, because those are the
three that would otherwise end up wired into `main.mjs`.

- An **event bus** (`src/core/events.mjs`): systems say what happened (`hit`, `fire`, `breach`, `condition`, `launch`,
  `talk`) and whoever cares listens. Today `main.mjs` and the `hooks` object wire every system to every other.
- **Seats out of `main.mjs`**: walk, helm, fighter, gun, cutaway each become a module with `enter`, `frame`, `leave`.
  `main.mjs` goes back to making things and running the loop.
- **`weapons.mjs` (70 KB) and `sets.mjs` (76 KB) split** by what they are: `weapons/` (projectiles, pdc, torpedo,
  railgun, turret, raider, fighter-guns), `sets/` (one file per room set, shared parts in one).
- **`carrier.layout.json` split** into a folder (`ships/carrier/`: decks and compartments, drum, mounts, weapons,
  integrity, plant, fighter, stations), joined at load. The Blender scripts and `tools/carrier-v2.mjs` read the same.
- **Content folders**: `content/people/`, `content/dialogue/`, `content/missions/`, `content/announcements/`, each one
  file per thing, with one validator (`tools/check.mjs`) that every content tool and every session runs.
- Done when the career, a raid, a drill and a landing all behave exactly as before (the sims and the scripted
  play-throughs say so).

**First half done, 20 November 2026** (CLAUDE.md has the details):

- **The check came first.** `tools/carrier-check.mjs` plays a raid, the helm (a burn, the radiators, a raid with the
  railguns), a launch and landing, the ladders, drums and lifts, and all 28 orders of the first week, with every random
  number seeded (`?seed=N`) and no frames but the script's (`?hold=1`). Two runs agree to the millimetre, so each step
  below was checked by comparing fingerprints: all five were the same after every step. The drill is covered inside
  the career (its `shoot` order); the scripts cannot aim, so they see it run its course, not hits.
- **The event bus** (`src/core/events.mjs`, `C.bus`): `job`, `job-end`, `raid`, `condition`, `hit`, `breach`, `fire`,
  `fighter-down`, `launch`, `landed`, `talk`. Three callbacks became events (`dc.onEnd`, `hooks.raid`,
  `hooks.crippled`); the rest are said with nobody listening yet, ready for the announcer (phase 3) and missions
  (phase 8). Requests that want an answer (`hooks.rescue`, the layout's uses, `routine.onMuster`) stay hooks.
- **Seats out of `main.mjs`** (`src/carrier/seats/`: walk, helm, fighter, gun, cutaway, each with `key` and `frame`),
  with `drive.mjs`, `doors.mjs` and `render.mjs` beside them. `main.mjs` went from about 1,160 lines to 470.
- **`weapons.mjs` and `sets.mjs` split** into `weapons/` (eight files mixed into the class) and `sets/` (fourteen),
  with the old file left as the front door so nothing that imports them changed.

Still to do in this phase: the layout split into `ships/carrier/`, and the content folders with `tools/check.mjs`.
The seats are named for the carrier still (`C`, `L`); they take any ship's layout, which decision 1 wants.

## Phase 3. Announcements and voices (one session) [12]

- **Who hears what.** Every call gets an audience and a channel. Audience: `all`, a zone, a department, flight,
  gunners, the drums. Channel: the tannoy (heard only in rooms with a speaker, and in your helmet when sealed), your
  headset, the cockpit radio. A fire in the gym reaches the gym's zone, damage control, and the bridge; not a pilot
  outside.
- **Say it once.** A problem is called when it starts and when it changes (spreading, under control, out), not on
  every tick. Priorities, so "brace for impact" cuts across "fire in the galley". The alarm sound itself is local: you
  hear the klaxon near the compartment, not everywhere.
- **No browser voice.** Every line the game can say is recorded, or is shown as a subtitle with no sound. The fallback
  goes.
- **The cast.** Today's seven voices stay. Add:
  - **the ship** (automated, the "AI voice"): alarms, pressure, fire detection, heat, torpedo warnings, lifts,
    airlocks, the brace countdown. One clean, calm voice, so it never sounds like a person;
  - **the captain or officer of the watch on the main broadcast**: action stations, condition one, stand down;
  - **medical**: casualties, and the sick bay's own calls;
  - **engineering officer**: reactor, drive, heat (Lund stays a leading hand).
  That is eleven, and covers every call that exists today. Generic crew for conversations come in phase 7.
- Rewrite the existing lines with the joint-service glossary (decision 3), then record with `tools/voices.mjs`.

## Phase 4. Living weightless (three or four sessions) [1, 5, 6, and the brace in 5]

- **Handholds.** Rails and handles generated on every wall, deck and deckhead of a weightless room, from the layout,
  denser at doors and work stations. Movement: within reach of a hold (about 1 m) you can grab it (it holds you still)
  and **push off with W along where you look**, harder the longer you hold; then you drift, unable to change course,
  until you reach the next hold or a wall (a soft stop, a catch). A, S, D pull you along the hold you have. Shift is a
  hard push. The suit's cold-gas puffer is the only way to stop in open space, and it is limited.
- **Every room outside the drums floats** (decision 2): about 47 rooms. No chairs, crash couches facing the bow,
  foot rails at stations, everything netted or strapped, lamps all round not only above, and the stern wall as the
  floor when she burns. Rebuild the sets (bridge, CIC, engineering control) for it first, then the generic fits. Split
  it over two sessions: the movement and the handholds first, then the rooms.
- **Brace for impact.** When a torpedo is inbound and the point defence isn't going to stop it, the ship counts down.
  Brace straps every few metres along weightless walls; hold E near one to strap in. A hit jolts the ship (`Rigid`, as in
  phase 1); anyone not strapped or holding on keeps going and hits the wall, hurt by the speed. The crew strap in too.
- **The crew float.** New clips: drifting, hand over hand along a rail, push-off, catch, strapped in. Rocketbox has none,
  so they are keyed in Blender on the Rocketbox rig (Lab Rat's `tools/blender/rocketbox_anim.py` already does this).
  Crew routes through weightless spaces follow the rails, off the floor.

## Phase 5. Suits, uniforms and the hangar (two sessions, art heavy) [7, 8]

- **The duty suit is what you wear.** Outside the drums everyone wears a fitted pressure suit as working uniform:
  collar ring, a hood or half helmet folded at the neck that leaves your view clear, and a visor that snaps shut on
  falling pressure (the game already closes a helmet by itself: `#c-helmet`). No more "go and get your suit".
- **Off duty in the drums.** Lockers at each drum's lift: you change there, out of the suit into the off-duty uniform,
  and back on the way out. A pipe for action stations sends everyone in the drums to their lockers first. The crew do
  the same: they wear the suit outside the drums and the uniform in them, swapped out of your sight the way faces are
  swapped today.
- **Four outfits**: duty suit and off-duty uniform, each for men and women. The uniform can start from Lab Rat's
  Rocketbox military people (`games/lab-rat/assets/people/`, check their licence). The suit is a recolour of a
  Rocketbox body plus hard parts on the bones (collar, chest pack, boots, gloves, folded helmet), built in Blender.
- **The heavy suit** stays, for EVA and long hangar work only.
- **[8] Gangways, not tubes.** The hangar is airless and, outside the drums, weightless. A gangway from the hangar
  airlock along the pads: a lattice with handrails and a tether line, visor down. You pull yourself along it to your
  fighter and into her seat, and the deck crew are there in heavy suits. This closes the open hangar item from the rebuild.

## Phase 6. Collisions (one or two sessions) [14]

No physics engine. The ship already has its own Newtonian code (`newton.mjs`, `flight.mjs`); collisions fit beside it.

- **What is solid.** The carrier as a few hundred boxes and cylinders from the layout and the hull's lofts (the same
  data `hullSpan` uses), plus the drums as two cylinders that turn. For exact contact near the hull, a bounding volume
  tree over hull.glb's triangles (`three-mesh-bvh`, MIT, vendored).
- **What hits.** The fighter as three or four spheres, swept along its path each step (at 150 m/s it moves 2.5 m a
  frame).
- **What happens.** Contact pushes her out and back with some bounce and scrape, spins her by where she hit, and
  damages her by the speed of impact (`fhull`) and, hard enough, the compartment she hit (`integrity.hit`, low
  penetration). Gentle contacts in the bay are a scrape, not a crash.
- Later the same code does ship against ship, debris, and you against the hangar in a suit.

## Phase 7. Fighting from the cockpit (two sessions) [9, 11]

- **Enemies become a list**, and the first new kind is an enemy fighter, flown by the same `Flight` with an AI frame
  (`flight.mjs` already takes `aim`). Escorts with the corvette.
- **Point defence in kinds.** Close-in guns (small, fast rounds, short range, for torpedoes and missiles); flak
  (bigger, slower rounds, longer range, for fighters); the turrets for ships and stations. Counts from the sims: enough
  to stop a salvo some of the time, not all of the time.
- **[11] Heat-seeking missiles** on the fighter: a seeker that looks for hot things (drive plumes, unfolded radiators,
  hot sinks: the plant's heat is already modelled), a lock tone and a lock box on the HUD, the torpedoes' guidance
  scaled down, and the enemy's point defence and decoys against them. Four on the rails, reloaded on the pad.

## Phase 8. Talking to people (three or more sessions) [13]

- **The story first, by Gemini, with you as editor.** A story bible before any dialogue: the ship's name and history,
  the captain and officers, the factions (the main game's `FACTIONS` are a start), the main arc, a few side arcs, what
  each department's crew care about. A tool (`tools/story.mjs`) sends Gemini the bible plus the dialogue format and
  writes files into `content/dialogue/`; the validator checks every reference (people, rooms, missions, flags).
  Authoring only: the game itself never calls a model.
- **The format.** One file per person or conversation: lines, your three or four answers, and per answer a condition
  (rank, flags, missions done, watch, place) and an effect (set a flag, start or advance a mission, unlock lore, change
  standing). Kinds of answer, as you described: small talk, a way into a side job, lore, and the main story.
- **The talking.** Look at someone and press E: they turn to you, the camera eases in, the options come up. Their jaw
  moves with the recorded line (driven by its loudness through an analyser, so it works on every clip), with a few
  head turns and gestures from the talk clip.
- **Missions.** The career's steps become one mission system (steps, triggers, rewards) that the career, side jobs and
  the main story all use, so a conversation can start one.
- **Voices for everyone.** Named characters get their own voice; the rest of the crew share a pool of about twenty
  designed voices. Every line is recorded by `tools/voices.mjs` before it ships.

## The opening ([`OPENING.md`](OPENING.md))

Its tasks keep their order and slot in like this:

- **The console framework and the consoles** (its tasks 1 to 3) come after phase 2: a console is a panel over a small
  interface to the ship's systems, which is what phase 2's split gives. Navigation first, as it says. The consoles can
  go between the other phases, one per session.
- **Tactical** wants phase 7's point defence kinds and enemy list, so it comes after phase 7.
- **The dock, the arrival and the hiring** (its tasks 4 to 6) come after phase 8's dialogue engine: the coxswain's
  hiring conversation is the first conversation written in the new format, and its "honest, keen, cheeky" answers
  are the first flags the dialogue sets. The dock crew wear the duty suits from phase 5.
- Its open question "which station": Haven Station from the main game, since the player's road runs from the carrier
  to other ships and a captaincy there (decision 1).

## Running alongside

- The **story bible** can start now, in Gemini, while phases 1 to 4 are built.
- The **outfits** (phase 5 art) can be built in Blender alongside phases 3 and 4.
- Your **hand play-through** of the first week is still the check on the career before it gets a second week, which
  waits for the mission system in phase 8.

## How a game this size is organised [3]

Not one giant file, and ThreadSpace isn't one now: the carrier is 29 modules and its content is data. What keeps a game
like this going as it grows is a few habits that most large games share, whatever the engine:

1. **Content is data, one file per thing.** A ship, a sector, a station, a mission, a person, a conversation, a weapon
   is a file in a folder, never code. Code is the machinery that runs any of them. The carrier already does this for
   the ship, the career, the watches and the voices; the work is to keep doing it and to split the one 170 KB file.
2. **Systems that don't know each other.** Each system (integrity, weapons, plant, voices, crew, missions) owns its
   state and talks through events. Damage doesn't call the voice system; it says "fire in the gym" and the announcer
   decides who hears it. This is what stops `main.mjs` from becoming the giant file.
3. **Places load and unload.** A ship's interior, a station, a sector is a scene built when you go there and dropped
   when you leave. The drum already does it per segment.
4. **One validator over all content.** When the content is a few hundred files written by people and models, a tool
   that checks every reference is what keeps it from rotting. `tools/carrier-v2.mjs` already does it for the ship.
5. **Each system testable on its own.** The headless sims that balanced the raids are the pattern: run a system with no
   screen, check the numbers.

Larger studios often go further with an entity-component system (every object a bag of components, systems running
over them). That pays off with thousands of similar objects. Here it would mean rewriting working code for little
gain, so it isn't recommended; the events and the folders above get most of the benefit.

## Decisions (20 November 2026)

1. **The carrier is the first few levels, not the whole game.** For now `carrier.html` is the test bed. In the medium
   term the carrier is the opening chapters; then the player leaves her and takes jobs on other ships; in the long
   term they buy a ship and become a captain (the main game's Kestrel, sectors and stations are where that ends up).
   What this changes:
   - Phase 2 names things for **a ship**, not the carrier: the interior, the crew, the routine, the announcer and the
     consoles take any ship's layout, so the second ship is a new layout folder, not a copy of the code.
   - The save is the player (rank, qualifications, flags, standing, money) plus the ship they are aboard, so it
     survives changing ships.
   - The career becomes chapters on the mission system (phase 8): the carrier's first week is chapter one or two.
   - The consoles (OPENING.md) are the same ones you use as a captain later, as that file already says.
2. **The whole fixed hull floats.** No grip shoes, no gravity cheat: only the drums have weight. The bridge, CIC,
   engineering control, the bow and stern rooms all become weightless spaces like the spine. The navy builds them as
   a big, expensive warship would, cutting comfort wherever a cheaper fix still works:
   - no real floors: bare structure and gratings, handrails and handhold grids on every surface, foot rails at every
     work station, colour-coded walls and lit stripes so you know which way is "up" by convention;
   - **the drive is the only weight**, and it points aft: under thrust the stern wall is the floor. So crash couches
     face the bow with their backs aft, consoles are laid out to be used from a couch or a foot rail, and anything not
     strapped slides aft when she burns (the burn tilt goes, and real drift under thrust replaces it);
   - stowage everywhere: nets, straps, Velcro, lockers with latches, sleeping bags in the stern quarters, a toilet
     with suction;
   - the crew's posts in these rooms become strapped-in or foot-railed poses, and their routes follow the rails.
   This makes phase 4 bigger: it is now every room outside the drums (about 47), and the walk controller has only two
   modes, floating and the drums.
3. **The slang is real modern military, joint service.** Not pirate, not Royal Navy folk speech. The ship carries every
   branch (naval crew, aircrew, marines), so the words are the joint ones in use today, for example: general quarters,
   "set condition one", "now hear this", "away the damage control party", reveille and taps (not "wakey wakey" and
   "pipe down"), late for muster (not "adrift"), and the aircrew's brevity words on the radio: bogey, bandit, "Fox two"
   for a heat-seeker away, splash, bingo fuel, Winchester, "brace, brace, brace". A glossary file
   (`content/glossary.json`) holds them: the voice script and every line Gemini writes are checked against it. Phase 3
   rewrites the existing lines with it before recording.
4. **The railgun comes back, as a broadside (confirmed).** The polish pass took the keel railgun off and made the
   broadside torpedo tubes in the hangar walls fire from the helm. That stays, and **two fixed railguns** join it, one
   firing out of each hangar wall, set at the ship's centre of mass along her length and height so the recoil pushes
   her sideways without spinning her. You aim by turning her side onto the target, as the broadside already does.
   Their recoil is the big visible kick from phase 1.
5. **The ship's name**: still open. It carries her history, so it goes in the story bible (phase 8) with Gemini.
