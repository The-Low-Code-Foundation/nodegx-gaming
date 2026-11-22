# ThreadSpace carrier: what comes next

> **21 November 2026: the course changed.** After play-testing, the player no longer serves on the carrier herself
> but on one of the medium ships she carries. Read [The new course](#the-new-course-21-november-2026) at the end of
> this file first: it replaces decision 1 below and sets phases 10 to 16. Phases 1 to 9 are built and stay as the
> record of how the carrier got here.

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

- The carrier is about 12,000 lines in 29 modules under `src/carrier/`, plus 170 KB of `ships/carrier.layout.json` (since split into `ships/carrier/`).
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

**Second half done, 20 November 2026:**

- **The ship is a folder**, `ships/carrier/`: her layout in ten files (`ship`, `decks`, `drum`, `mounts`, `fighter`,
  `stations`, `damage`, `weapons`, `integrity`, `plant`) that `index.json` names, joined at load the same way by the
  game (`src/core/ship.mjs`), the node tools and the Blender scripts (`shipkit.load_layout`), with her career, routine
  and cast beside them. `tools/carrier-v2.mjs` writes the folder; run on the design, it wrote back exactly what was
  split by hand. A second ship is a second folder.
- **People** are the first content folder: `content/people/<id>.json`, one per officer and leading hand (name, uniform,
  browser voice, recorded cast). The ship's files say only where each stands; `src/core/people.mjs` joins them. A
  person can now change ships, as decision 1 wants.
- **`tools/check.mjs`**, the one validator: the ship's folder against its index; every room the layout, the career and
  the routine name; each career step's kind, officer, drill and unlocks; every spot inside its room; every person's
  file; the cast and the clip index. The generator runs it after writing and the voice tool before recording. Broken
  on purpose in a copy (a missing person, an unknown step, an officer outside her room, a stray entry), it caught each.
- The fingerprints were the same after each of these too.

Left for the phases that design their formats: `content/announcements/` (phase 3), `content/dialogue/` and
`content/missions/` (phase 8); `check.mjs` takes a section for each. The seats are named for the carrier still (`C`,
`L`); they take any ship's layout, which decision 1 wants.

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

**Built and recorded, 20 November 2026** (CLAUDE.md has the details):

- **The announcer** (`src/core/announcer.mjs`): a system says `C.bus.emit('call', { id, room, … })` and the call's file
  in `content/announcements/` (42 of them) says who speaks it, its words, who it is for and by what channel, its
  priority, how soon it may be said again, and its alarm. Every `dc.say(call, …)` in the code became one; the card's
  own text stays where it tells you what to do.
- **Who hears what.** Audiences `all`, `you`, `zone` (the bow, either drum, the hangar, the stern), `drums` and the
  departments; channels the tannoy (where there is air, or in a sealed helmet), the headset (your nets, anywhere
  aboard), the radio (the cockpit, flight control). Your nets are your rank's (`depts` in `career.json`), the seat you
  are in, and the room you stand in (`nets` in `voices.json`: on the bridge you hear the bridge's calls). Checked in
  the browser: an apprentice in the mess hears a fire in the gym (same drum); someone in the hangar unsuited hears
  general quarters not at all, suited through the helmet; a pilot hears the radio only.
- **Say it once.** The same words are not said again within `again` seconds; a higher call cuts off a lower one;
  routine calls go stale in the queue after 12 s, damage calls after 40, priority 4 and 5 never. Breaches of the
  airless hangar are not called. The damage alarms are local (`near`): the klaxon is loud in the room, faint in its
  zone, silent elsewhere; general quarters and venting sound everywhere.
- **No browser voice.** It is gone. A line with no clip shows as a subtitle (`#c-sub`, who and how it reached you).
- **The cast** is eleven: the ship's automated voice (`ai`, in `voices.json`) names any room in pieces (hazard, room,
  deck: 126 short clips cover every room, deck and section); the captain, the engineer officer and the medical officer
  are people (`content/people/`), named by role until the story bible names them.
- **The words**: `content/glossary.json`, checked by `tools/check.mjs` on every spoken line. General quarters, man your
  battle stations, secure from general quarters, now relieve the watch, reveille, taps, late for muster, on report.
  The ranks in people's names (Coxswain, Leading Hand) are left for the story bible.
- **Recorded.** All 286 lines have a clip, and the 14 old ones (the shield lines, "action stations", the old pipes)
  are pruned. The four new voices were auditioned: the engineer and medical officer took on the first try; the
  ship's voice was re-directed to a brisk, human pace (Google's preview pace, not slow and mechanical); the captain is
  a woman, Kenyan, in her early fifties, directed as a serving officer on the broadcast, plain and steady (the
  urgency in the words, not the delivery), chosen from three takes after two castings came out sad, then hammy.
  Checked in the browser with the sound off: every call in every one of the 371 rooms the ship can name, with every
  slot value (10,461 in all), finds its clips, and so do the pipes; a raid's calls play in priority order.

## Phase 4. Living weightless (three or four sessions) [1, 5, 6, and the brace in 5]

- **Handholds.** Rails and handles generated on every wall, deck and deckhead of a weightless room, from the layout,
  denser at doors and work stations. Movement: within reach of a hold (about 1 m) you can grab it (it holds you still)
  and **push off with W along where you look**, harder the longer you hold; then you drift, unable to change course,
  until you reach the next hold or a wall (a soft stop, a catch). A, S, D pull you along the hold you have. Shift is a
  hard push. The suit's cold-gas puffer is the only way to stop in open space, and it is limited.
  **Built, 20 November 2026** (`src/carrier/weightless.mjs`): the holds in every `float` room (rails at two heights
  broken at doors, windows and furniture, handles at doors, across the deck and the deckhead, and by each use), and the
  moves above, in three dimensions (up to the deckhead, through a door only below its lintel). Space takes the hold in
  reach or, with none, brakes on the puffer; adrift, WASD puff (12 m/s of gas, topped up wherever there is weight);
  out of gas, in air, you swim very slowly. Holding, the drive's push doesn't move you; adrift, it carries you aft.
  (`?float=all` previewed the whole hull; it is the default now, below.)
- **Every room outside the drums floats** (decision 2): about 47 rooms. No chairs, crash couches facing the bow,
  foot rails at stations, everything netted or strapped, lamps all round not only above, and the stern wall as the
  floor when she burns. Rebuild the sets (bridge, CIC, engineering control) for it first, then the generic fits. Split
  it over two sessions: the movement and the handholds first, then the rooms.

  **Built, 20 November 2026:** every walkable room of the fixed hull floats but the airless hangar (`W()` in
  `tools/carrier-v2.mjs`). Foot rails at every desk, bench, mess table and the CIC's plot, which your feet take as well
  as your hands (you stand upright in one); the fits without chairs or stools (offices stood at, briefing rooms of stand
  bars, sleeping bags strapped to the brig's walls, shelves and crate stacks under cargo nets and straps, workshop tools
  on lanyards, closed hygiene cubicles); a dim lit strip low on every wall. The sets' acceleration couches stay (the
  bridge's face the bow; the CIC's and engineering's are gimballed, but they don't yet swing round for a burn). Not
  done: crew who float (they still stand at their posts, and the crew tunnel's walker walks), couches turning for a
  burn, and anything special about the stern wall under thrust beyond drifting onto it.
- **Brace for impact.** When a torpedo is inbound and the point defence isn't going to stop it, the ship counts down.
  Brace straps every few metres along weightless walls; hold E near one to strap in. A hit jolts the ship (`Rigid`, as in
  phase 1); anyone not strapped or holding on keeps going and hits the wall, hurt by the speed. The crew strap in too.

  **Built, 20 November 2026:** an enemy torpedo that will arrive within 6 s calls "Brace, brace, brace" (priority 5,
  `content/announcements/brace.json`, no clip recorded yet) and counts down on the HUD (`braceFrame`). Brace straps on
  the walls of every weightless room, about every five metres (522 aboard), offered with E only at action stations or
  during a brace. Every hit kicks the structure (`jolt` on the bus): 8 m/s at a torpedo's hit, 2.5 for a shell, halved
  at 25 m. Strapped in, nothing; holding a rail, you keep it below 4.5 m/s (3.5 in a foot rail); loose, you meet the
  wall, and faster than 4.2 m/s it hurts. Two bad knocks, or one from a torpedo a few metres away, black you out and
  the damage control party carries you to the sick bay. The numbers are `weapons.brace`. Not done: the crew strapping
  in (they wait for the floating crew, below), and the recorded clip for the call.
- **The crew float.** New clips: drifting, hand over hand along a rail, push-off, catch, strapped in. Rocketbox has none,
  so they are keyed in Blender on the Rocketbox rig (Lab Rat's `tools/blender/rocketbox_anim.py` already does this).
  Crew routes through weightless spaces follow the rails, off the floor.

  **Built, 21 November 2026** (`src/carrier/floating.mjs`), keyed in code on the Biped rather than in Blender, so a
  pose is a few numbers to tune in the browser. Everyone in a `float` room is weightless: at a console or a post their
  feet are in a foot rail, knees a little bent, over Rocketbox's own upper body (working, talking, looking round:
  `railWork`, `railTalk`, `railLook`) or with the arms floating up in front (`railIdle`); adrift, the neutral body
  posture (`nbp`); on the move, laid head first along the way off the deck, hand over hand, in surges with each pull
  (`floatMove`: the tunnel's rounds, the muster coming in and going); in a couch, as before. At a brace call everyone
  braces (`railBrace` hunched with fists on the console, `floatBrace` tucked at the nearest wall, a traveller stopping
  to get there); a hit jerks them along the blast and they swing back. The CIC's and engineering's gimballed couches
  swing round to face the bow while the drive burns (`gimbal`). Not done: a push-off and catch at each end of a leg
  (they turn on the spot), strapping into the brace straps (they hold on instead), the hangar's suited crews (phase 5),
  and the crew's routes following the rails exactly rather than the route's straight line.

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

  **Built (phase 5's first session):** the outfits, and changing. The four outfits are one base: Rocketbox's two
  soldiers (`assets/people/Military_*.glb`, MIT, slimmed from Lab Rat's copies by `tools/slim-person.py`), whose clothes
  (long sleeves, trousers, boots, gloves) the wardrobe borrows onto each of the six people and recolours (`crew.mjs`
  `OUTFITS`; the wardrobe takes a `plain` lender's clothes per piece of the mesh and flattens its camouflage). The duty
  suit is dark slate with a collar ring banded in the department's colour, the hood and visor rolled behind the neck,
  and a chest flash; its harness and pockets are the soldier's own, which read as a suit's harness. The off-duty
  uniform is a jacket in the department's colour over dark trousers. The heavy suit is the same clothes in white under
  the old helmet and pack. `outfits.html` shows them side by side. Who wears what follows the room (`outfitFor`): duty
  suits in the fixed hull, uniforms in the drums, heavy suits in the hangar; in the drums anyone waiting at a lift,
  riding it or just off it is in a duty suit. You come aboard in yours; the lockers beside each drum lift's doors
  change you (`suitLockers`, `ship.change()`), the lift won't take you up out of it, turning in takes it off, and a
  career picked up again wakes you out of it. The VAC SUITS lockers are SUIT AIR lockers now (fresh bottles), and the
  career's suit order is fresh bottles and a seal check (same step count, so saves carry over).
  Not done: a pipe at action stations that sends the drums' hands to the lockers first (they go up the spokes as
  before, already suited at the lifts), the crew changing in sight at the lockers, the player's own body (first person
  shows none), and Lieutenant Varga's changed order and the brace call recorded (both show as subtitles until
  `tools/voices.mjs --only guns` and `--only ai` are run). The captain's condition-one call still says "don vac suits",
  left as recorded: true for anyone coming up from the drums.
- **[8] Gangways, not tubes.** The hangar is airless and, outside the drums, weightless. A gangway from the hangar
  airlock along the pads: a lattice with handrails and a tether line, visor down. You pull yourself along it to your
  fighter and into her seat, and the deck crew are there in heavy suits. This closes the open hangar item from the rebuild.

  **Built (phase 5's second session):** the hangar floats (`W()` sets `float` on every walkable room now) and the
  boarding tubes are gone: pilots go down the forward trunk to the hangar airlock and through it. From its door a
  lattice gangway runs aft down the hangar's middle on legs, a spur off it to each fighter ending at her grab frame
  (`sets/hangar.mjs` `gangway()`). Its rails and the frame's bars are the hangar's only holds (no `dressHolds` there);
  an orange safety wire runs on hoops over the gangway and out along each spur, and in the hangar you are clipped to it
  (`weightless.mjs` `tether()`: no further than 3.2 m from it, the lanyard drawn from your chest). Climbing out of a
  fighter puts you at her frame. The hangar sentry pulls himself up and down the gangway; the deck crews float in their
  heavy suits. A floor line leads to the hangar airlock. The career's board order and Lieutenant Moss's line say the
  airlock and the gangway (her changed line shows as a subtitle until `tools/voices.mjs --only flight` is run).
  Not done: the deck crew don't come to meet you or clip you on, there is no unclipping to go off the gangway, the
  grating is not solid (you can float through it to the deck), and the walk to the airlock is long (the gangway is
  about 70 m; a hard push crosses it in under 20 s).

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

  **Built (phase 6's first session):** `src/carrier/collide.mjs`. Instead of boxes from the layout, every opaque
  mesh of the ship's outside is solid as it is drawn (about 31,000 triangles in 230 meshes, a bounding volume tree
  each, three-mesh-bvh vendored), each tested in its own frame, so turrets and radiators are solid where they are and
  a moving surface hits with its own speed. The hangar is solid from inside with its bay openings as far as the doors
  are open, and the parked fighters are balls. The fighter is five balls swept every frame. A touch puts her back where
  she touched and gives her an impulse there (bounce, friction, spin from where she hit). Under 4 m/s it is a scrape;
  above, her hull takes 0.2 × (speed − 4)², so about 26 m/s kills her, and from 30 m/s she holes the compartment she
  hit as well. It costs about 0.1–0.2 ms a frame near the ship and nothing farther out. `tools/carrier-check.mjs`
  has a `collide` scenario: a bump, a crash, 150 m/s (no tunnelling), a glancing pass, in through the open bay over a
  parked fighter, a shut bay door, the turning bow swinging into a fighter at rest, and a crash that holes her.
  Not done: the drums (inside the sleeve, which is solid, so out of reach), the gangway, pads and the airlock door as
  solids, a sound of its own for a scrape, and anything but your fighter hitting anything (the raider, torpedoes,
  you in a suit). A crash that kills her hands her to flight control like a flak kill, which is kind.

## Phase 7. Fighting from the cockpit (two sessions) [9, 11]

- **Enemies become a list**, and the first new kind is an enemy fighter, flown by the same `Flight` with an AI frame
  (`flight.mjs` already takes `aim`). Escorts with the corvette.
- **Point defence in kinds.** Close-in guns (small, fast rounds, short range, for torpedoes and missiles); flak
  (bigger, slower rounds, longer range, for fighters); the turrets for ships and stations. Counts from the sims: enough
  to stop a salvo some of the time, not all of the time.
- **[11] Heat-seeking missiles** on the fighter: a seeker that looks for hot things (drive plumes, unfolded radiators,
  hot sinks: the plant's heat is already modelled), a lock tone and a lock box on the HUD, the torpedoes' guidance
  scaled down, and the enemy's point defence and decoys against them. Four on the rails, reloaded on the pad.

  **Built (phase 7's first session):** enemies are a list (`foes()`: the raider and its escorts; your fighter's sight
  shows the one picked with X, or the nearest, and a small bracket on the rest), and the first new kind is the bandit
  (`src/carrier/weapons/bandits.mjs`, numbers in the layout's `weapons.bandit`): two Rook fighters come with every raid,
  each on its own `Flight` with an AI pilot that burns along the change of velocity it wants and otherwise keeps its
  nose on what it is shooting, trimming on the side jets. They hold formation until the raider starts its passes, then
  make gun runs along her side past her point defence guns (a gun shot up below 25 hp is out of action until the drones
  mend it between raids); the nearest to your fighter, and any you hit, fight you instead. They keep clear of her hull,
  and go home on bingo (either tank: the jets' cold gas runs out fast if they jink all the time, which is why their
  jinks are short pops). The point defence takes them when no torpedo is up, with a rougher aim than on a torpedo. As
  tuned, they live about a minute in a raid, one in two is shot down, and one raid in two loses a gun. Three new calls
  (`bandits`, `splash-bandit`, `pdc-down`) are not recorded yet. A `bandits` scenario in `tools/carrier-check.mjs`.
  Not done: point defence in kinds, heat-seekers (the second session); a Blender model of the enemy fighter (it is the
  main game's code-built Rook); bandits colliding with anything; the turrets' crews never lay on a bandit.

  **Built (phase 7's second session):** heat-seekers and flares (`src/carrier/weapons/missiles.mjs`, numbers in the
  layout's `weapons.heat`, `missile` and `flares`). Everything glows by how hot it is (a fighter's hull, more with her
  drive lit; the raider; the carrier most, by her radiators and sink heat; burning torpedoes; flares), and a seeker sees
  I / r² in its cone, with no friend or foe. Your fighter has four on the rails, reloaded on the pad: the seeker looks
  along the nose or at the contact picked with X, the HUD circles what it locks with a tone, Q fires; they fly by
  proportional navigation, then divert jets. The bandits carry two each and fire when their nose seeker locks you: a
  MISSILE warning with range and closing speed, a beeping tone and the `missile-warning` call. Every ship carries flares
  (yours: G, a pair); a flare outshines a coasting fighter, not a burning one, so cut the drive and flare, and a seeker
  sees through one flare in two. The AI ships flare against missiles tracking them (a bandit also cuts its drive). The
  raider's point defence shoots at our missiles, the carrier's at any homing on her. A `missiles` scenario in
  `tools/carrier-check.mjs`. The new call is not recorded yet.
  Not done: point defence in kinds (close-in guns and flak); missiles on the carrier or the raider; the cockpit's own
  missile and flare sounds (it uses the existing ones and a synthesised tone).

  **Built (phase 7's third session, 21 November 2026):** point defence in kinds (`weapons/pdc.mjs`, numbers in the
  layout's `weapons.pdc` and `weapons.flak`, each `pdc` mount's `gun` saying which). Six close-in guns, three down each
  side, are for what homes on her: torpedoes and missiles, out to 1.9 km, 32 tracers a second, a bandit only inside
  400 m and never the raider. Four flak guns, new, two on the hangar's roof and two under it (built in code, `flakMesh`,
  with sponsons in hull.glb), take the bandits first, then a torpedo beyond the close-in guns' reach, then the raider:
  twin barrels firing in turn, shells fused for the meeting the fire control works out, with a proximity fuse, whose
  splinters hit a bandit by chance, the nearer the likelier. The status board and the HUDs show each kind's guns.
  `tools/raid-sim.mjs` is new: many headless raids, averaged, with in-page tweaks to try numbers. As tuned over 20
  raids: four torpedoes in five killed and two salvos in three stopped outright (about one hit a raid, where it was
  one every other raid), three bandits in five shot down (one in three before), nearly all by the flak, and a gun shot
  up every third raid. The turrets stay the guns for ships: their crews still never lay on a bandit, on purpose.
  Not done: missiles on the carrier or the raider; bandits on a turret gunner's sight (it shows the raider and
  torpedoes only); not yet played by hand.

  **Built (21 November 2026, from play-testing):** a rescue craft for a fighter out of gas, and the guns' looks.
  The rescue (`src/carrier/rescue.mjs`, numbers in the layout's `fighter.rescue`): from the cockpit, 1 calls a tanker
  and 2 a tug, launched off your empty pad. Each flies Newtonian (flip and burn on its main drive, trim on jets, a
  braking profile planned at the jets' rate for the last stretch) round the hull, slice by slice, and out to you. The
  tanker holds station above you and runs a hose to your port: it fills both tanks in about ten seconds and goes home.
  The tug couples a tow bar to your nose and tows you to the landing gate, where flight control takes you in. A tow
  bar, not a rope: a rope cannot brake her, so she would overrun the tug into the hull. Call the same one again to
  recall it. Four new flight calls (`rescue-launch`, `-on`, `-done`, `-recall`) wait for `voices.mjs`.
  The guns' looks (`weapons/tracers.mjs`): every round is a streak on one instanced pool (a white-hot head and a
  coloured tail, never thinner than a point of light, so a tracer reads at 3 km). Your fighter's belt is one tracer in
  three. The turrets and the raider's guns fire with a muzzle blast (flash, a ring of gas off the brake, a forward
  cone of burning grains), hits spatter off armour, flak bursts throw splinters, the railgun throws arcs, and kills
  get rings and sparks. Missiles and torpedoes now have tail fins and a flame, light with a flash, a ring, sparks and
  a bang (`ignite`; `Feel.ignite` and `Feel.railOff` in gunfeel.mjs, and the seat jolts when a missile leaves the
  rail), and burn with a trail. Flares have a fierce core in a warm halo that sputters as it burns out, and shed
  glittering sparks. Everything new is looks only (unseeded randoms): the fingerprints do not move for it.
  Then, from the first play: shot dead in space, the tug now comes out by itself (a tug already out carries on and
  brings you in; a tanker out goes home and a tug follows), and a tumbling fighter is grappled and despun on a line
  before the bar goes on (the tug could not catch a spinning one). The tug and the tanker are now working spacecraft
  (`rescue-craft.mjs`): a cab with windows, lights and quads on an open truss, the tug's tow frame and outrigger
  engines, the tanker's foam tank and hose boom. `fighter-down` was reworded and needs recording again.
  Not done: the rescue craft are not solid to your fighter (collide.mjs) and are invulnerable (on purpose, for now);
  the tanker's run not yet played by hand.

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

## Phase 9. Damage you can see, feel and mend (three or four sessions)

From play-testing (21 November 2026): hits should do real damage with real consequences, on the fighter and on the
carrier, without a teardown engine that breaks the models. The rule: **the models stay whole, and damage is drawn on
them and in them** (holes, scorch, fire, venting gas, plates welded over), while what the damage does is modelled:
thrust lost, gas leaking, systems out, rooms losing air. The rescue craft are invulnerable for now.

- **Session 1: hits, fire and mending you can see.**
  - **Hits.** A torpedo on the hull is a fireball out of the plating, a shock of light, glowing debris and a dust
    cloud that hangs, and air venting white out of the hole while the room behind it has any. A shell is the same,
    smaller. Inside, the blast comes in through the hole: a jet of flame, shrapnel and smoke along the way it came,
    and a flash of light in the room.
  - **Fire where it hit.** A fire a hit starts burns at the breach, not at a random spot in the room. Fire is drawn
    as particles: in the fixed hull, which floats, round flames that drift with the air (towards a hole while she
    vents) and smoke that spreads every way; in the drums, which have weight, flames that lick upwards and smoke
    that rolls along the deckhead. A fire in a room that loses its air goes out by itself, as now.
  - **The tools.** The extinguisher throws a cloud of powder at the fire. The patch kit becomes a welder and hull
    plates: a plate goes over the hole and you weld it round, the arc lighting the room blue and sparks showing the
    weld creeping round the seam. A coolant leak is a jet of droplets and vapour off the pipe (no puddles where nothing
    weighs anything), welded shut the same way. An electrical fault throws sparks.
  - The old prototype looks go: the cone flames, the smoke box, the spray cone and the pool.
  **Built (session 1, 21 November 2026):** `blaze.mjs` (fire, smoke, sparks, powder, vapour and droplets, as point
  particles in any frame, with drag towards a draft and rise only where there is weight) and `hitfx.mjs` (the recipes).
  A hull hit is a fireball, debris and a hanging dust cloud outside (the flat ring is gone: no air, no shock), the blast
  comes in through each hole drawn in a room with its light, a hole to space breathes white while its room has air, and
  a fire a hit started burns at the hole. The extinguisher sprays powder from your hands; the patch kit is now a
  welder and hull plates: a plate goes over the hole when you start and the weld bead creeps round it, hot and cooling,
  with the arc's sparks and blue light; a coolant leak is a jet of droplets welded shut; a fault throws sparks. The
  cone flames, the smoke box, the spray cone and the pool are gone. Looks only (Math.random): the seeded randoms are
  untouched.
  Not done: no sound of its own for the welder (it uses the hiss); the mist streaming to a hole is the old one (its
  specks now round); not yet played by hand.
- **Session 2: the fighter takes damage.** Hits land on a part of her (`fighter.json` gets a damage map: drive, each
  jet quad, tanks, wings, cockpit, guns), each with its own health and its own consequence: the drive's thrust down
  or out, a jet quad dead (she yaws or rolls against your stick), a holed tank leaking (gas venting is a small thrust
  of its own, so she starts to turn), the guns jammed, the canopy cracked (the HUD flickers). Drawn on her: scorch and
  holes on the model as decals, sparks, a gas leak. When she is dead in space the tug brings her in (built). The
  cockpit's displays show what is hit.
  **Built (session 2, 21 November 2026):** `fighter-damage.mjs` and the layout's `fighter.damage` (set in
  `tools/carrier-v2.mjs`): eleven parts in her frame (cockpit and canopy, an armoured capsule; the drive; the
  propellant tank to port and the jet gas tank to starboard; the bow, stern and two wingtip jet blocks; two radiators;
  the chin guns), each with its own health, their shares adding up to her hull. Every hit is placed: a shot (the
  raider's flak, a bandit's round) on the first part along its line through her, what it cannot take going on to the
  next; a missile's burst on the part nearest and the rest by share and distance; a crash on the part struck and the
  rest over the whole airframe. `guns.fhull` is the sum; she is dead in space (`fighter-down`, the tug) when the cockpit
  is gone, the sum is gone, or the drive and three jet blocks are out. Through flight.mjs's `harm`: the drive's thrust
  falls with its health and with each lost radiator; a jet block pushes at its health and a dead one leaves her
  turning and sliding crooked when you ask for a turn, the hold fighting it with what is left (the bow block also
  carries the retro jet); a holed tank leaks (up to 30 kg/s of propellant, 12 of jet gas) and the gas out of the hole
  pushes her, so with the hold off she turns (a holed jet gas tank turned her 33° in 5 s), and with it on the hold
  spends gas holding her; hit guns fire one barrel at half the rate, then jam; a cracked canopy flickers the HUD. Seen:
  a small blast at the hit, a scorch, hole or big hole laid onto her model where the hit met it (a grid cast onto the
  mesh, parented to it, so it folds with a radiator), cracks on the canopy's glass from inside, sparks off a badly hit
  part, embers in a fresh hole, a frosty jet and gas streaming off each tank hole. The cockpit: the right screen shows
  DMG (her parts from above by health, and what is wrong) out of the lane or for a few seconds after a hit, dead jets
  red on THR, what is out or leaking on the HUD, caution and warning tones, and a line on the card. Mended on her pad
  (session 3 brings the crews). Looks are Math.random with their own scratch; the hits' placing is seeded physics.
  Fingerprints: raid, helm, landing, walk, float, brace and career unchanged. Bandits moved (the same three flak hits
  at the same moments, but on her parts, a wingtip block taking 4 of a 21-point shell and the rest flying on through,
  so she is dead in space at 50 s, to a second missile's burst on her cockpit, not at 42 s: the fight lasts longer, the
  flak gets a bandit at 71 s and the raid is over at 75 s, not 91, with her waiting for the tug rather than home).
  Missiles moved only in her hull (85.8 to 88.2) and the new `parts` field: every missile's fate and time is the same.
  Collide moved: a crash spreads over her parts and the cockpit is armoured (the 14 m/s crash leaves 85, not 79; the
  glance 61 with her stern jets out, not 47), and with her jets a little weaker the hold's pops fall on other frames, so
  after the crash she misses the second 3 m/s scrape (16 contacts, not 17) and the later cases start a hair apart
  (150 m/s meets the hull at 138.4, not 137.9; the bay a few centimetres off); bump, door, swing and holed end where
  they did. (A crash's shock through her no longer holes a tank: at first a 0.2-point scrape left pinholes leaking
  forever and nudging her.)
  Not done: the warning tones were not heard (tests ran with sound off); the bandits do not take part damage (they keep
  a single hull); not yet played by hand.
- **Session 3: mending fighters in the hangar.** A damaged fighter landed on her pad gets a repair crew: drones from
  the hangar's racks for the outside (plates and welding, as the player's tools), deck crew for the inside, the time
  depending on the damage. The pad's board shows what is being done. You can help: the same tools. A fighter under
  repair cannot launch.
  **Built (session 3, 21 November 2026):** `fighter-repair.mjs` and the layout's `fighter.repair` (set in
  `tools/carrier-v2.mjs`). Damage now belongs to each fighter (`userData.dmg`, as her tanks are): her parts' health,
  holes, leaks and decals stay on her on the pad, and boarding another fighter gives you hers. The instant mend on
  landing is gone. A fighter set down damaged gets a job: a task per damaged part, leaks and the cockpit first, each
  `min + per × health lost + hole × tank holes` seconds. Six drones, racked three to a side in the hangar's walls, do
  the outside: they fly weightless on a braking profile with capped thrust (seeded), up to a lane, along it and down,
  hold off the part clear of the gangway, the boards and every fighter's parts (her radiators folded, coming in from
  the side under an overhang), and fit and weld plates as your welder does (the hole decal becomes a plate, a bead
  creeps round it and cools, sparks, an arc light in bursts). Two suited deck hands do the inside (cockpit and canopy,
  guns, drive): along the gangway and her spur, timed by the way's length, then in a foot restraint at her flank, the
  canopy up, sparks from inside; the holes they back are plated too. Each pad has a board on her spur: each part's
  health, what is being done to it, the time left, and NO LAUNCH UNTIL CLEARED. Her seat refuses the launch and says
  why ("2 jobs left (propellant tank leaking), about 0:56"), and she is not refuelled while a tank leaks; when the job
  is done her tanks are topped up. You can help: hold E at a drone's part with the welder and plates, which doubles
  its rate. A wreck is still salvage, its state scrapped with it.
  Fingerprints: all ten unchanged (an undamaged landing starts no job; the bandits' fighter waits for the tug). A new
  `repair` scenario: five hits in flight, she lands, five tasks (three drones, two crew), W does not take her out,
  mended in 66 s, then she launches (cc5866f3, the same on every run).
  Not done: not yet played by hand; the sound of the work (only the cue when she is cleared); the drones ignore
  each other (they work different parts, and their lanes are stacked); from the next pad's spur end, the boarding
  handle there is nearer than a hole, so you float to the hole to weld it.
- **Session 4: the carrier's physical consequences.** Hits do what they hit: a radiator holed loses heat rejection
  (the plant already models this), a thruster quad hit loses thrust, a tank holed leaks propellant (and the leak
  pushes her), a turret hit is out until mended, a hangar door jammed, a drum bearing hit makes the drum shudder. The
  drones and damage control parties mend them over time, by priority, and you can do any job yourself.
  Scoped: the drones mend what is outside; you and the damage control parties mend what can be reached from inside
  (the bay door from the hangar, a turret from its hoist trunk, a drum bearing from the spine, holes between
  compartments). Going outside in a suit to mend the hull is a later phase.
  **Built (session 4, 21 November 2026):** `carrier-damage.mjs` and `carrier-repair.mjs`, with the layout's
  `integrity.parts` (set in `tools/carrier-v2.mjs`). The carrier has 34 parts: her two radiators, eight thruster
  clusters, ten turrets, ten point defence guns, the two bay doors and the two drum bearings. Shells and strafing
  runs hit a part before the hull behind it (a radiator lets the round through, anything else stops it), and a
  torpedo's warhead hurts every part in its reach. A part's damage does what it should: a cluster thrusts in
  proportion to its health, a turret below 45 is out (its hoist stopped), a hit bay door jams where it stands (that
  side's fighters can neither launch nor land, and the other door still answers the switch), a hit bearing makes its
  drum shudder, and a holed tank leaks propellant through the hole and the leak pushes and turns her (the helm's
  flight assist fights it). New calls: thrusters-damaged, turret-down, turret-back, bay-jammed, bay-clear,
  bearing-damaged. All mending is one queue, ordered by `parts.order`: tanks, breaches, the doors, thrusters,
  bearings, turrets, holes inside, guns, radiators, then hull holes. Four drones from the drone bay fly outside on a
  braking profile, routed round the hull's envelope (wider where the radiators are spread), and weld at a stand-off;
  the old instant drone patch is gone, and the guns no longer mend themselves. Two-person damage control parties go
  to the work from damage control, timed by the length of the way, and work suited in foot restraints. You can do or
  help with any inside job: hold E at it with the tool kit.
  Also fixed: a thruster with no compartment of its own kept its damage after it was mended.
  Fingerprints: brace, career, float, landing, repair and walk unchanged. raid 4e4b91af→0815b51d (only the air
  moved, the holes now sealed on the drones' real timing); bandits 6c1409c6→1f8a8e41 (the strafed gun waits for a
  drone, 87 at the end, not 97); helm de551463→f928afef (the guns the raider hits stay down, so 2 torpedoes shot
  down, not 4, and 4 hit, not 2); missiles f5285102→4b891fab (the bandits' rounds take out her guns, so the bandits
  die at 70 s and 73 s, not 42 s and 57 s, and the fighter takes more); collide 91b34421→e719976c (the check now
  really shuts both doors, so the fighter strikes the outer bay door, named now, not the opening behind it). A new
  `hull` scenario: six hits, the jammed door holds open while the other shuts, the leak pushes her (5.3 MN), you
  help at the turret for 60 s, everything mended by 360 s in queue order (0e76d0c7).
  Not done: not yet played by hand; missiles that hit the carrier don't go through the parts; the drones don't show
  in the cutaway; the six new calls are unrecorded (`node tools/voices.mjs --list`); no spacewalk.

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


## The new course (21 November 2026)

### What play-testing found

The carrier is a good place and a poor game. Three things, in the player's words and in the code:

1. **The ship and the battle run on different clocks.** A raid lasts about a minute. From a drum to a turret is the
   lockers, a nine-second lift, the hub ring, the spine and a hoist trunk. Getting to your station takes longer than
   the fight, so the walk is only ever in the way.
2. **A body with no decisions.** Which side to present, when to fold the radiators, what to mend first, when to
   launch: the ship decides all of it. A junior hand walks, holds E and shoots a turret.
3. **Rank against freedom.** The living-ship fantasy wants you free to go anywhere and use anything. A hand on a
   288 m warship cannot walk into the CIC or take a fighter, and the road to a ship of your own was three chapters
   long.

And one about fighters: flown by Newton they are missile trucks, not dogfighters. The fun there is the sortie (the
burn out, the release at range, point defence, the fuel home, the landing), not a turning fight.

### The canon now

- **The carrier is home port.** She is too big to go on errands. She grows into a proper carrier: six fighters
  where she had twelve, and berths in her hangar for **two medium ships**. She keeps everything built in phases 1 to
  9: the drums, the routine, the watch bill, damage control, her guns.
- **The medium ship is where you serve.** Working name: the **cutter** (`ships/cutter/`), 3 or 4 crew, about 38 m,
  weightless inside, one drive, a turret, point defence, torpedoes, a docking port. The carrier sends her on
  skirmishes, patrols, escorts and boardings. Every station is seconds from every other, and on a crew of four
  everyone does more than one job, so the game can let you touch everything without breaking its own world.
- **You start as her most junior hand**, as today, but the ladder is short: hand, then qualified at each station
  (damage control, the turret, sensors, the helm), then second in command, then **captain of your own sortie**.
- **Between sorties you live aboard the carrier**: your bunk in a drum, a watch to stand, maintenance on the cutter
  in the hangar (the phase 9 repair work, now on your own ship), the mess, the people. The carrier is the town.
- **On the first sorties the captain plans the fight and you follow orders.** Later the paused command map from the
  first ThreadSpace comes back, and you give the orders.
- **The first ThreadSpace's mechanics come over, its models do not.** Threads and their gates, sectors, pirates, the
  approach to another ship, boarding her and fighting her crew, taking her bridge, then claiming or scuttling her.
  All of it re-seated on this engine (Newtonian flight, ships as layout folders, real compartments).
- **Still true from before:** no shields, no gravity plating, real heat and reaction mass, damage to real
  compartments, recorded voices, story and dialogue written by Gemini, slang from the joint-service glossary.

This replaces **decision 1** (the carrier as the first chapters, then other ships, then a captaincy). What it kept
is what made the change cheap: phase 2 already made the ship a folder and the people content.

### How two ships share one engine

The engine runs **the ship you are aboard**: `carrier.html?ship=<id>` builds `ships/<id>/` as `C`, with her own
integrity, plant, weapons, crew and seats. Every other craft is **outside**: a hull in the `world` group with a
`Rigid` of its own and whatever of its systems the scene needs.

- **Going from one ship to the other is a change of scene**, through an airlock: the page loads the other ship
  (`?ship=`), as the roadmap's "places load and unload" has it. Nothing of the ship you left stays in memory but what
  is saved.
- **What is saved is the voyage, not the ship**: who you are (rank, qualifications, flags), which ship you are
  aboard and where, where each ship is (berthed in which berth, or out), each ship's damage and stores, the clock.
  The career's own save becomes part of it.
- **A berthed ship is carried.** While the cutter sits in her berth, her pose is the berth's, in the carrier's
  frame. Launch is the cradle pushing her sideways out of the bay door, then a hand-over with the velocity she
  really has (as `Fighter.handOver` does). Recovery is a lane to a gate off the door and a capture (as
  `Fighter.capture`).
- **Seen from the cutter, the carrier is a second `buildCarrier`** with no hooks and no systems: her hull, her
  outside fittings, the hangar deck you are parked in, her bay doors.

### Phases

Each ends playable. Sizes are sessions of the kind phases 1 to 9 were.

**Phase 10. Any ship (two sessions).** The engine takes a ship folder; systems run by what the layout has; a ship
needs no drums, hangar, fighters, career, routine or cast. `tools/cutter.mjs` writes `ships/cutter/`. Two ships can
be built in one page. **Built** (see "Built so far").

**Phase 11. The bigger carrier (one or two sessions).** The hangar grows to hold six fighters and two cutter berths
(design, `tools/carrier-v2.mjs`, the Blender hull, every scripted check re-baselined). The layout gains `berths`.
**Built** (see "Built so far").

**Phase 12. Berthed, launched, recovered (two sessions).** The voyage save. From the carrier: the cutters parked in
their berths, a gangway spur to each one's port, E to go aboard. From the cutter: the hangar round you, the
airlock back to the carrier, the launch (bay door, cradle, hand-over), the lane home and the capture. The carrier
holds her course while you are out. **First half built** (see "Built so far").

**Phase 13. Serving on the cutter (two or three sessions).** Her crew of three as people at stations (pilot and
commander, gunner, engineer), with voices. The career rewritten for her: first days as her junior hand, then a
qualification per station. Your watch and the maintenance jobs aboard the carrier between sorties. The carrier's
"first week" orders are the quarry for both.

**Phase 14. Sorties (three sessions).** A mission is data (`content/missions/`): a briefing, a place, phases with a
clock, orders given to you by the captain over the announcer, a debrief. **Battles get a clock**: contact is called
minutes out, closing up is the tense part, then several exchanges. First sorties: a patrol that meets a raider, an
escort, a tow. Fighters fly sorties too (strike runs with heat-seekers and torpedoes), not dogfights.

**Phase 15. Threads, pirates and boarding (three or four sessions).** Sectors and gates from the first game's data;
a pirate transport and her crew as new layout folders; the approach and the docking port to port; the boarding
fight inside her real compartments; her bridge; claim (a prize crew flies her home to the carrier) or scuttle.

**Phase 16. Your own sortie (two sessions).** The paused command map over the plot, plans of chained orders for
your crew and your wingmen, and the captain's seat.

**After that:** the first ThreadSpace page (`index.html`, `src/game.mjs` and its friends) is retired to `archive/`
once phase 15 has taken what it needs; the gallery's `play` then points at this game.

### Built so far (21 November 2026)

**Phase 10, any ship.** `carrier.html?ship=<id>` builds `ships/<id>/`; `main.mjs` works out `HAS` from the layout
and the folder and makes each system by it. A ship may leave out drums, hangar, fighters, bay doors, broadside,
railguns, flak, bandits, heat-seekers, `integrity.parts`, and the career, routine and cast files. `tools/cutter.mjs`
writes the cutter: 34 m hull (envelope 10.5 × 7.8 × 36.3 m, radiators folded), 420 t with 120 t of reaction mass, one
4.2 MN drive (10 m/s² loaded), eight jet clusters (a half turn in about 9 s), eight weightless rooms on one deck
(`flight-deck`, `passage`, `crew-space`, `head`, `mess-nook`, `airlock`, `ops-locker`, `eng-room`), sixteen sealed
spaces, a dorsal turret, two close-in guns, four forward tubes, two folding radiators, three crew stations, and
`dock`, her docking port in the starboard wall of the airlock. `?host=<id>` builds a second ship in the page, seen
from outside. Every carrier check was unchanged by it. CLAUDE.md, "Any ship, and going between ships", has the rules
a new ship folder must keep.

**Phase 11, the bigger carrier.** 314 m (was 288), 335,545 t, main drive 0.128 g. The hangar is 38 × 23 × 117 m
inside, one bay door a side 63 m long and 18 m high: the forward 19 m in front of that side's three fighter pads, the
after 44 m in front of its berth. Six fighters. `berths` in the layout (`berth-port`, bow forward; `berth-starboard`,
bow aft, so each cutter's docking port faces the gangway), worked out from the cutter's own folder by the generator
and checked by `tools/check.mjs` (3 m clear all round, a 44 × 11 m door). Each berth has a cradle and a ramp from the
gangway up to a platform at her port. Five new rooms over the berths on the tunnel deck (`boat-crews`, `boat-stores`,
`boat-ops`, `boat-gear`, `boat-shop`). The Blender hull is rebuilt. Raids over 20 seeds: about 0.8 hits a raid (was
1.1), bandits shot down about one in two (was two in three, the flak guns now being further apart), nothing retuned.

**Phase 12, first half.** `src/core/voyage.mjs` (the voyage save and `goAboard`), `src/carrier/berth.mjs` (the
carried ship's side: cradle, door, launch, hand-over, recovery by flight control, L at the helm) and
`src/carrier/berths.mjs` (the carrier's side: each berthed ship built and stood on her cradle, solid to you, E at her
port to go aboard, `?at=berth:<id>` to arrive from her). A `berth` scenario in `tools/carrier-check.mjs` plays the
launch and the recovery.

**After the first play (22 November 2026).** Seven points from the player, all acted on:

- L did nothing at the cutter's helm: the input layer passes only a list of keys as actions, and L was not on it.
- Kit racks stood in the cutter's airlock doorway: in a room too small for them beside its door they now go on the
  wall facing it.
- Coming off a ladder you faced the wall: you now swing to its side nearest the way out and face it.
- Door handholds were on the room's inside wall, good only for pushing back into the room: they are on the door's
  jambs now, free bars you push off either way.
- The ramp up to a cutter's port was awkward: E at its foot hauls you up a guide line, E on the platform takes you
  down. The ramp is still there.
- "A big grey bread bin": the cutter has a Blender hull with some attitude (`tools/blender/cutter_build.py`), and a
  low twin mount for a turret (scale 0.15, was 0.25).
- Turrets from inside (`turret-cab.mjs`), a gunner's sight, and **fire control** (`firecontrol.mjs`): weapons hold,
  tight and free, a designated target, "check fire" when you break it. This is the hook phase 14's captain gives
  orders through.
- Manoeuvring jets and muzzle blasts redrawn as one shader particle system (`puff.mjs`); no library fitted the
  no-build rule well enough to be worth vendoring.

Still to be judged by the player: the new jets and blasts in motion (they were tuned from stills), the turret cab at
a real frame rate (a fast swing shows cab wall until the gunhouse comes round), the cutter's look from the beam
(still a long box: her rooms fix a 34 × 10 × 5.8 m body), and whether sparse holds plus the jamb handles are enough.

**Phase 12, second half (22 November 2026).** Flying her home (`recovery.mjs`: the sideways lane, the docking
display, the capture and its grade, wave-offs, docking mode on K and heading hold on H); the cutter and the carrier
solid to each other (`collide.mjs` `ShipCollisions`: scrapes, dents, holings, a wreck that ends in the carrier's sick
bay), and berthed cutters solid to a flown fighter; the airlock's card over the change of ship. So of the list below,
"Flying her in yourself", "Solids" and "The crossing" are built. What they left: the drums are not solid (a cutter
can fly in at the sleeve's open ends), the host takes no push, a wrecked cutter is "rebuilt" in name only, the
lane reads weakly from the flight-deck seat (the gates are abeam; a side-looking docking camera may be wanted), and
none of it has been flown by hand.

**Left in phase 12:**

- **Flying her in yourself**: a lane to the gate and a capture, as `approach.mjs` and `Fighter.capture` do for a
  fighter. Today only flight control brings her in.
- **Solids**: the cutter passes through the carrier's hull, and a fighter through a berthed cutter (only her cradle
  is solid to it). `collide.mjs` is written round one fighter and one ship; it needs "this body against that ship".
- **The host under way**: the carrier stands still in the world while you are out (`berth.hostVel` is zero). She
  should hold a course, and later fight.
- **The crossing**: going from one ship to the other is a fade and a page load. It wants the airlock cycle on both
  sides and a loading card that looks like one.
- **The other cutter**: both berths hold a cutter, and you can board either; nothing flies the second one.
- **The cradle and the door from outside**: the cradle's arms are not drawn moving; the bay door is one 63 m slab a
  side, where two doors a side would look better (`Doors` and `layout.mjs` key doors by side only).
- **Seen from the cutter, the carrier has no point defence guns** (made by `Weapons`, not the build) and does not
  appear in the cutaway.
- **The career on the carrier still starts you as her hand.** Phase 13 moves it.
- **Balance**: the cutter's weapons, armour and plant are the carrier's scaled, untuned. A raid on her alone swings
  from a 23 s kill to two minutes and five torpedo hits.
- **Looks**: the cutter has no Blender hull (`assets/cutter/hull.glb` would be picked up), the hangar is dim round
  the berths, the cradles are plain.
- **Voices**: five new room names and the earlier unrecorded calls have no clip (`node tools/voices.mjs --list`).

### What comes over from the first ThreadSpace (for phases 15 and 16)

Read from the first game's code on 21 November 2026. "Lift" means the logic can move nearly as it is; "rewrite" means
it leans on the first game's arcade flight (speed set from the throttle, velocity always along the nose, instant
turns) or on its one-of-each singletons.

| What | Where it is | Verdict |
|---|---|---|
| Sectors and threads as data | `data.mjs` `SECTORS`, `STATIONS`; `world.mjs` `World.load` | **Lift the data.** A sector becomes `content/sectors/<id>.json`. `World.load` is a scene builder for the old meshes: rewrite as "what is outside" for this engine. |
| The jump | `game.mjs` `engage`, `canJump`, `jump`, `enterSector` | **Rewrite, small.** It is a fade and a scene change, which is what this engine's change of scene already is. Arrive with a real velocity, not zero. |
| Latching on | `game.mjs` `hackableFromFighter`, `latchFighter`, `board` | **Rewrite.** It copies the target's velocity every frame and zeroes it. Here: match velocity and turn rate at the port (the helm's `ref` already measures speed against another ship), then a rigid dock, port to port. |
| The boarding fight | `controllers/board.mjs` `Boarding` (defenders' sight and hunt, your rifle, your party, 2D push-out, hold E to seize) | **Lift.** Self-contained but for its calls into `game.*`: put those on the bus (`boarded`, `seized`, `boarding-lost`). It walks on the same `Walker` and `Interior` this engine uses. It must learn to fight weightless, or the prize keeps a burn on. |
| The prize's inside | `interiors.mjs` `capitalInterior` (one procedural plan for both ships) | **Replace.** A prize is a layout folder like any ship, so her compartments, air and damage are real. |
| Claim or scuttle | `game.mjs` `captured`, `keepShip`, `sendCrew`, `scuttleShip`; `panel.mjs` `tab_boarding` | **Lift the rules** (a prize needs a crew member sent across; scuttling pays salvage and blows her). The fleet entry becomes part of the voyage save. |
| Missions | `data.mjs` `MISSIONS`; `game.mjs` `offers`, `accept`, `progress`, `checkMissions`, `turnIn` | **Rewrite as phase 14's mission system.** The old kinds are hard-wired to `world.corvette` and `world.freighter` and to global flags. Keep the offers as content. |
| Orders and stances | `orders.mjs` (`MOVES`, `FIRE`, plans of chained steps, `prey`) | **Lift the model** (steps, stances, spared hulls). **Rewrite `drive()`**: every stop distance assumes arcade braking. It needs a flip-and-burn planner; `helmsight.mjs` already does the sums for the nav plot, and the bandits' pilot (`weapons/bandits.mjs`) is a working Newtonian AI to start from. |
| The command map | `command.mjs` (`Command`: orbit camera, verbs per selection, Shift chains, pause) | **Lift.** It reads entities and writes orders; the pause is one flag in the frame. |
| Crew who fly and shoot | `ai.mjs` `AI.crew`, `aimTurret`; `game.mjs` `crewEffect`; `data.mjs` `STATS`, `POSTS` | **Lift the stats-to-numbers idea**; the turret crews here already fire. The helm crew needs the same planner as the orders. |
| Enemy pilots | `ai.mjs` `raider`, `corvette`, `freighter` | **Rewrite** on the bandits' pilot. |

### To decide (the player's call)

- The cutter's real name and class name (story bible, Gemini).
- Whether the second berth holds a second cutter the NPCs fly (a wingman on sorties) from the start, or stands empty.
- Whether the old page stays playable as "ThreadSpace classic" after phase 15, or goes.
