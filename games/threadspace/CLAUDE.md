# ThreadSpace: notes for an AI coder

A three.js space game in plain ES modules. No build step, no npm install: `index.html` loads `src/main.mjs` through an
import map that points `three` at `./vendor/three/three.module.js` and `three/addons/` at `./vendor/three-addons/`.
`shipyard.html` is a second page (the ship editor) that loads `src/shipyard.mjs`.

## Run it

```bash
npx serve .                 # or python3 -m http.server 8000; a file:// open will not work (ES modules)
```

- `?mission=<seed>` starts a drop-in mission directly (same seed, same mission).
- `?cine=0` skips the animations between seats (airlock, bay launch, landing).
- `?design=default` ignores any saved Kestrel design.
- `?llm=on` lets a local model voice the drop-in mission's other captains. Off by default. It needs
  `node tools/llm-server.mjs` (serves this folder and passes `/api/llm` to Ollama on 127.0.0.1:11434) and the model
  `gemma4:e4b-it-qat` pulled in Ollama (`?model=<tag>` picks another). Any plain static server plays the whole game with
  scripted voices; never make the game depend on the model.
- In the browser console, `__game` is the running game and `__game.debug` has shortcuts (`go('station')`,
  `credits(5000)`, `killHostiles()`, `phase('helm')`).

Every page carries `<html data-static>`: saves, shipyard designs and the "wire" (`net.mjs`) live in `localStorage`.

## Code map (`src/`)

| file | what it is |
|---|---|
| `main.mjs` | Entry: makes the `Game`, wires the title buttons, reads `?mission=` / `?llm=`, the `__game.debug` shortcuts. |
| `game.mjs` | The game: state, the seats (`setPhase`), the frame loop, docking, jumping, missions (`offers`, `accept`, `progress`, `checkMissions`, `turnIn`), trade, the yard, crew, fleet, save/load. The biggest file. |
| `data.mjs` | **The universe as data**: `FACTIONS`, `GOODS`, `STATIONS`, `SECTORS`, `SHIPS`, `UPGRADES`, `PAINTS`, `STATS`, `POSTS`, `CREW`, `HIRE`, `MISSIONS`, `FLEET_JOBS`. Start here. |
| `world.mjs` | `Entity` (anything with a place, a hull and a side) and `World.load(sectorId)`, which lays a sector out from `SECTORS`. |
| `mission.mjs` | Drop-in missions: `rollMission(seed)` deals the sheet (plain data), `Mission` runs the rules, the clock, the endings and the score. One template: the standoff. |
| `comms.mjs` | The other captains' voices: `Voices` (the optional local model) and `LINES`, the scripted lines per party and move. |
| `panel.mjs` | The right-hand panel: one method per tab (`tab_trade`, `contacts`, `threadMap`…). Reads state, calls the game's verbs, never touches three.js. |
| `hud.mjs` | The 2D canvas over the view: brackets, target card, bars. |
| `command.mjs` | The paused command map (Tab). |
| `orders.mjs` | Plans of chained orders for your ships, with a weapons stance per step. |
| `ai.mjs` | Pirates, turrets, the hauler, your crew at the helm and turret, fleet ships. |
| `combat.mjs` | Bolts, bursts, hit tests. |
| `ships.mjs` | Every hull except the Kestrel: `fighter` (Wren and Rook raider), `corvette`, `freighter`, `gate`, `pod`, plus the shape helpers (`loft`, `wing`, `engine`, `windows`). |
| `models/model.mjs` | What a "model" is: named parts plus settings (type, default, range, unit), and the helpers `resolve`, `changesOf`, `legal`. |
| `models/kestrel.mjs` | The Kestrel as a model: `model` (28 parts, 79 settings), `build(values)`, `checks()`. The game and the shipyard both call `build`. |
| `models/designs.mjs` | Loads the saved Kestrel design once at start (`saved.kestrel`). |
| `models/store.mjs` | Where designs live: `localStorage` first, then `ships/<id>.json`. |
| `shipyard.mjs` | The ship editor, built only from `model.settings` / `model.parts`. Save, undo, handles, cutaway, checks, Download. |
| `interiors.mjs` | Walkable rooms: the Kestrel's decks, the station concourse, the pirate corvette and the hauler. |
| `decor.mjs` | Wall, deck and console textures, signs, and `bake` (merges a room's still meshes). |
| `scenery.mjs` | Stations, asteroid fields (`PALETTES` per sector), the derelict Meridian. |
| `space.mjs` | The sky: `SKIES` per sector (nebula colours, sun), stars. |
| `people.mjs` | Blocky people, poses, the rifle and the first-person viewmodel. |
| `cinematics.mjs`, `sequence.mjs` | The animations between seats (airlock, bay launch, landing) and the timeline that runs them. |
| `lights.mjs` | A fixed pool of point lights shared by the rooms. |
| `sfx.mjs` | Synthesised sound effects (Web Audio, no files). |
| `input.mjs` | Keys and mouse. |
| `net.mjs` | The "wire" (news, sector claims), kept in `localStorage`; the seam for asynchronous multiplayer. |
| `util.mjs` | Maths, seeded random (`mulberry`), small DOM helper `el`. |
| `controllers/` | One per seat: `walk` (with a weightless `float` mode: momentum, hand over hand, Shift kicks off), `fly` (helm, Wren, autopilot), `turret`, `eva` (space walk), `board` (boarding firefight). |

`ships/kestrel.json` is the Kestrel's shipped design (only the values that differ from the model's defaults).
`tools/llm-server.mjs` is the optional AI-voice server.

## How to add things

### A mission offer at a station (data only)

The kinds that already have rules are `bounty`, `courier`, `salvage`, `capture`, `raid`. A new offer of one of those
kinds is one entry in `MISSIONS` in `src/data.mjs`. The key's trailing digits are dropped to get the kind, so
`courier3` is a courier:

```js
courier3: { title: 'Courier: parts to Haven', giver: 'guild', at: 'hollow', to: 'haven', cargo: { parts: 3 },
            reward: 800, standing: { guild: 4 }, blurb: 'Three crates of parts, delivered intact.' },
```

`at` is where the board offers it (a `STATIONS` id), `to` where a courier ends, `sector` where a bounty counts kills,
`count` how many, `standing` the change per faction when it is turned in.

### A new mission kind (code)

1. Add the offer to `MISSIONS` in `src/data.mjs` with a new key, e.g. `escort`.
2. In `src/game.mjs`, teach the four places that switch on `m.tpl.kind`:
   `progress(kind, e)` (count something as it happens) or `checkMissions()` (test a condition each frame),
   `missionTargets()` (what to mark on the HUD), and `missionStatus(m)` (the line on the Missions tab).
3. If it needs a once-only flag (like `salvageDone`), set it in `turnIn(m)` and filter it in `offers()`.
4. Spawn whatever it needs in `World.load` (`src/world.mjs`), gated on a sector flag or the active mission.

### A sector (mostly data)

1. `SECTORS` in `src/data.mjs`: id, name, `seed`, `threads` (and add this id to the `threads` of each neighbour, so the
   gate exists from both sides), `station` (a `STATIONS` id or `null`), `pirates`, `asteroids`, and the flags
   `derelict` / `corvette` / `freighter`.
2. A station, if any: an entry in `STATIONS` (faction, prices, what it sells, greeting).
3. `src/panel.mjs` `threadMap()`: add the sector's `[x, y]` to `pos`, or the Nav tab's map throws.
4. Optional look: a sky in `SKIES` (`src/space.mjs`) and a rock palette in `PALETTES` (`src/scenery.mjs`); both fall
   back to Haven's.

### Crew, goods, upgrades (data only)

- A hire: an entry in `HIRE` (`stats` 1–10 for `pilot`, `gunnery`, `engineering`, `combat`; `cost`; `at` station; `look`).
- Goods: `GOODS`, then a price factor in each station's `prices` and its `sells` list.
- An upgrade: `UPGRADES` with an `apply(ship)` that changes a ship stat (`shieldsMax`, `speedMax`, `turretDamage`…).

### A drop-in mission template (code)

`rollMission(seed)` in `src/mission.mjs` returns `template: 'standoff'`; the `Mission` class hard-codes its three
parties (`rook`, `master`, `concord`) and their moves. To add a second template:

1. Split `rollMission` into one roller per template and pick by seed (`const r = mulberry(seed …)`).
2. Lift the party sheet (who wants what, which moves are open) out of `Mission` into data the template declares.
3. Add the scripted lines for each new party and move to `LINES` in `src/comms.mjs`; the script must cover every move,
   because the model is off by default.
4. Spawn the template's ships in `Game.startMission` (`src/game.mjs`).

### A ship

- A new enemy or traffic hull: a builder in `src/ships.mjs` (copy `freighter()`: lofted sections, `engine`, `windows`),
  a class in `SHIPS` (`src/data.mjs`: hull, shields, speed range, turn, radius, `half` extents), a spawn in
  `World.load`, and a brain in `src/ai.mjs`.
- A new setting on the Kestrel: one entry in `model.settings` in `src/models/kestrel.mjs` (type, default, min, max,
  group, the `parts` it shapes), then read it in `build(v)`. The shipyard panel picks it up by itself.
- A second editable ship (e.g. the Wren as a model): copy `models/kestrel.mjs`'s shape (`model`, `build`, `checks`),
  load it in `models/designs.mjs`, and give the shipyard a model picker (it currently imports the Kestrel directly).

## Designing ships (`design/`)

`design/ship-designer.html` is the ship designer: a ship as sections bow to stern, with spin gravity, mass, crew and rooms,
getting about, armour and recoil worked out live. `design/SHIP-DESIGN.md` is what we learned (spin rules, protecting a
drum, rooms and crew, lifts and ladders, recoil, torpedoes) and how to use and extend the tool; read it before designing
a ship. `design/carrier-v2.design.json` is the chosen spin-gravity carrier, and `design/CARRIER-REBUILD.md` the plan for
building it into `carrier.html`. The designer is a tool for us, not part of the game: nothing in `src/` loads it.

`design/OPENING.md` is the next piece after the rebuild, as tasks: the game opening on a station dock, the carrier
hiring you, and the ship's consoles (navigation, sensors, comms, tactical, operations, engineering, flight control)
that you learn aboard and use later on your own ship.

`node tools/carrier-v2.mjs` builds the carrier's layout, `ships/carrier.layout.json`, from that design (the drum's
rooms come from the designer's own room plan) and checks it: no overlaps, nothing through the hull or into a drum,
every room reachable, every id the career and watch bill name resolves. Don't edit that file by hand; change the design
or the generator and run it again. `src/carrier/drum.mjs` builds the spinning drums, and
`blender -b --factory-startup --python tools/blender/carrier_v2_build.py` the hull, `assets/carrier/hull.glb`.

The first carrier (400 m, three decks, gravity only under thrust) is kept: `carrier.html?ship=v1` plays
`ships/carrier-v1.layout.json`, `.career.json` and `.watches.json`, with `assets/carrier/hull-v1.glb` (from
`tools/blender/carrier_build.py`). Code that knows about drums falls back to the plain decks when a layout has none, so
both play.

**Places in a drum.** A drum room or a deck's ring corridor (`ring-<half>-<deck>`, e.g. `ring-a-o`) is in `C.rooms` like
any room, but its `deck` is a drum key (`drum-a-o`: half a, outer deck), it has `seg` (which of the 40 segments) and
its x/z are in that segment's own frame. Anything that names a spot in one (the career's `people`, `start`, `resume`,
the watch bill's `bunk`) gives `room` and `seg` as well as `at`. Use `C.interiorOf(room, seg)` for its Interior,
`C.toShip(deck, seg, x, y, z)` for where it is in the ship right now (it turns), `C.drumAt(p)` for the drum place at
a ship point, `C.deckName(deck)` for "Forward drum, outer deck". `__carrier.place('drum-a-o', x, z, yaw, seg)`
stands you there. The drums are air nodes too (`integrity.mjs` `buildDrum`): see `design/CARRIER-REBUILD.md` phase 5.

The new carrier's fixed hull is weightless. Its layout adds four things the game reads: `vacuum: true` on a compartment
(the hangar: always 0 kPa, open to space, `integrity.mjs`), `airlock: true` (the hangar airlock: E at its door onto the
vacuum cycles it, `cycle()` and `airlockFrame()`, suit required), `float: true` (the spine, the crew tunnel, the trunks:
`main.mjs` sets `walker.float`, and `walk.mjs` `floatFrame()` moves you hand over hand, Shift to kick off), and
`fighters[i].boarding` (`{from, at}`: a boarding tube's hatch in that room, built by `boardingTubes()` in
`layout.mjs`; E there boards her, and climbing out brings you back to it). The first carrier's layout has none of them.

## The carrier prototype (`carrier.html`)

This page is separate from the main game: it imports `interiors.mjs`, `ships.mjs`, `walk.mjs`, `space.mjs`,
`lights.mjs` and `input.mjs`, but `game.mjs` knows nothing about it. One file is the ship:
**`ships/carrier.layout.json`**. The game and the Blender script both read it, in metres, in the ship's frame
(x starboard, y up, -z the bow, the same as every other ship here).

| file | what it is |
|---|---|
| `ships/carrier.layout.json` | Everything listed below. |
| `src/carrier/main.mjs` | Entry point. Renderer, the five seats (walk, helm, fighter, gun, cutaway), the frame (`tick`), ladders and fades, the bay doors, the fighter's instruments and screen markers (`fighterHud`), and `?ship=v1` (the first carrier) / `?at=` (`fighter` starts you in one, `gun` / `gun-ventral` in a turret) / `?view=` / `?hull=code` / `?crew=0` / `?dc=0` (no raids) / `?voice=0`. Also the plant's frame after the ship's, the railgun on a click at the helm, G (radiators) and N (nav plot) there, the burn tilt (walking under the main drive, the view leans toward the stern by atan(a / g), and the ship calls the burn). Aboard (walking, at a gun, or at the helm on the bridge) the frame goes through the same bloom and tone mapping as the fighter, set by `ABOARD` (fill, sun, exposure, bloom); a room's look can set its own `fill` and `sun`. `?post=0` renders aboard without it, for a slow machine. The debug handle is `__carrier`: `ABOARD`, `ambience`, `go(roomId)`, `place(deck, x, z, yaw, seg)`, `drum()`, `tick(n)`, `info()`, `bayNow()`, `fighter`, `dc`, `ship`, `guns`, `plant`, `helmSight`. |
| `ships/carrier.career.json` | The career, as data: where a new hand starts, the officers (`people`), what is refused until unlocked (`refuse`), and the orders (`steps`). Its `about` says what each field is. |
| `src/carrier/career.mjs` | `Career`: your first week aboard. Puts the officers at their posts (with a "Talk to" use each), runs the steps in order (`check()`: talk, go, read, sleep, muster, rounds, drill, suit, man, shoot, raid, board, launch, land, helm, turn, transit), promotes you and unlocks parts of the ship (`allows()`, `refuse()`), draws the duty card (`#c-duty`), the gold chevron over the officer you want and the gold marker in the cutaway, and saves progress in localStorage (`begin()`, `free()`) with the ship's clock and the times you were adrift (`book`). A save made against a different number of steps is not picked up again. `main.mjs` gates the helm, the fighters and the turret hatches on it, and raids come by themselves only once `raids` is unlocked. `__carrier.career`: `i` (the step), `complete()`, `talked(id)`. |
| `ships/carrier.watches.json` | The ship's routine, as data: the clock's `rate` and start, the seven `watches`, the three watch `sections` (and which keeps day 1's middle watch, `first`), your line on the bill (`you`: section, part of ship, muster room and spot, bunk, `shake`), the `muster` (when the section falls in, where they stand, the way they march off), `night`, and the `pipes` (the words). Its `about` says what each field is. |
| `src/carrier/watch.mjs` | `Routine`: the ship's clock (`t`, ship seconds from day 1 00:00; `rate` of them a real second), the watch and section at any time (`watchAt`, `nextOwn`, `onWatch`), the bell each half hour (`bells()`, the last dog watch's 1-2-3-8) and the pipes at the change of watch and at night, the crew at their posts by watch (`wanted()`, `man()`: a face changes only out of your sight, `seen()`), the muster (`fallIn()`, the roll at the bell, `onMuster`, the march off), the watch bill's board and panel (`board()`, `openBill()`), your bunk (`bunk()`, `cantSleep()`, `sleep()`), the clock in the top right (`#c-clock`), and night lighting (`light()`, after `LightPool.update`). `__carrier.routine`; `__carrier.time('17:45')` sets the clock. |
| `src/carrier/voice.mjs` | `Voices`: everyone who speaks aloud. `say(speaker, text, {delay, pitch, rate, clipOnly})` plays the recorded clip for that exact line (`assets/voice/index.json`, keyed `speaker|line`), or a run of clips when the line is several recorded lines end to end (the muster's roll and the order after it), else the browser's own speech (a local English voice; `pitch` / `rate` are for that). The ship's broadcast (`ship`) queues; a person's new line cuts off their last. `clipOnly` says nothing without a clip (the pipes). `?voice=0` turns it all off. `__carrier.voices`. |
| `ships/carrier.voices.json` | The cast: per speaker (officer ids from the career, leading-hand ids from the watches, `ship`) the saved Gemini voice (`voiceId`), the description it was designed from (`design`, `gender`, `language`), the short acting note sent with each line (`style`), `tannoy` (through a speaker), `sample` (the audition line); and `ship`, the broadcast's fixed calls that live in code. |
| `tools/voices.mjs` | Records the lines with Gemini TTS into `assets/voice/` (see "Voices" below). |
| `src/carrier/layout.mjs` | `buildCarrier(L, hooks)`. One `Interior` per deck; rooms, doors between facing walls, windows, ladders; `furnish()` per room id, or `fit()` by the room's `fit` kind; a sign over every door; `machine()` per system for sealed spaces, with work lamps on their deckheads; `lightViewed()`, real lights in the sealed spaces a walkable room's window looks into, and `machineryFrame()`, the reactor's plasma and those lights following the power; outside fittings (each turret's gunhouse and guns are named nodes); the cutaway overlay. `loadHull()` swaps the lofted hull for `assets/carrier/hull.glb`. |
| `src/carrier/sets.mjs` | The rooms dressed as places. `roomSurfaces(c)`: the walls, deck and deckhead per kind of room (`LOOK`, picked by `lookKey(c)`: by system, `ROOM` overrides by id), five wall finishes and three decks drawn on canvases, tinted, with grime low down. `roomLights(I, c)`: the lamps, coloured and as bright as the look's `k`; `LAMPS` puts them over what a room is for. `dressRoom()`: in every room that is not a passage or the hangar, a frame up the long walls every 3 m (never across a door, a window or anything `mark()`ed on a wall), the cable tray and pipes along the deckhead (`SERVICES` picks the wall, `null` for none), and lit coves. `SETS`: the rooms built as sets of their own (bridge, CIC with its turning plot, mess, galley, quarters, sick bay, engineering control); `dressHangar()` adds to the hangar. Posters and notices (`POSTERS`, `poster()`) are drawn on one lit atlas, `C.paper`. Parts other code can use: `desk`, `couch`, `messTable`, `locker`, `rack`, `shelfRack`, and the palette `P`. Things that move go in `C.anim`, run by `setsFrame()`. |
| `src/carrier/ambience.mjs` | `Ambience`: the ship's room tone, synthesised. Air handlers' hiss, the electrical hum, the rumble through the frames (louder with the main drive), and the hull creaking now and then. `PROFILE` per look (`ROOMS` overrides by id) sets how much of each; air pressure, emergency power and being out of the ship turn it down. `LEVEL` is the whole bed's loudness. `__carrier.ambience`. |
| `src/carrier/wayfinding.mjs` | Finding your way, all worked out from the layout. `plan(C)` finds the doors and ladders out of every room and, per route, the shortest walk (Dijkstra) out of each room toward it: walking through a room that is not a passage costs extra, and so does breaking the one-way rule (forward and up on the starboard passage, aft and down on the port one). `dressDeck()` dresses each passage: the floor lines with arrows (paint worn nearly to the deck's grey, in a band along one wall; `paint()`), the hanging signs, the frame plates, the "you are here" deck plans, the one-way stencils in the cross passages (`oneWay()`), and the pipes overhead. `frameOf(L, z)` is the frame number: metres aft of the bow. |
| `src/carrier/damage.mjs` | Damage control jobs. `dressKits()` (build time) puts the red extinguisher cabinets and yellow repair lockers along the passages and the racks of kit in the rooms that keep it. `DamageControl` (run time) runs a fire, an electrical fault or a coolant leak that a hit started (`queue`, from `integrity.mjs`; one at a time, the rest wait their turn), calls it out (klaxon or chimes, then the ship's voice through `voice.mjs`), and runs the job: the kit you carry, the switchboard isolation, hold E to fix, the job getting worse, the job card (`#c-job`) and the red marker in the cutaway. `__carrier.dc.raise('fire', 'gym')` starts one now. |
| `src/carrier/integrity.mjs` | The ship's integrity (a raid hands over to `weapons.mjs` through `hooks.raid`; its shells come back in through `arrive(entry, dir)`, and it calls `raidOver()` when the raider is gone): every compartment's air (kPa) and health. `hit({target, from, pen, damage, hole})` fires a shell along a straight line through the hull (`aim`, then `strike`): the first compartment is holed to space, each after it to the one before, and each loses health (less for a big space). Then, each frame: air through holes and open doors, pressure doors (`links`) that shut on falling air and at action stations, ladder hatches, life support refilling what is no longer open to space (`zone`), the repair drones, the systems' health feeding the thrusters (`t.health`), the power and the air refill, the wind and your breathing (`you3`), blacking out (`rescue`), the cutaway's tints and its status board (`#c-ship`; `status` is where `main.mjs` adds the guns' and the plant's rows). The armour belt (`integrity.armour`): a gun shell is stopped by it some of the time (`glance()`) and loses `pen` when not; a torpedo goes through it. Condition one (`setCondition()`, called by `attack()`): the ship calls it, waits `condition.warn` seconds, then pumps every walkable room down to `condition.to` kPa, so a hole cannot blow anyone out; `standDown()` repressurises. Your vac suit (`don()`, from a VAC SUITS locker: `damage.kits.suit`, `worn: true`): the helmet closes itself on thin air or venting (`#c-helmet`, the visor), and you breathe `suit.air` seconds of bottles; blacking out at condition one, the damage control party suits you up where you lie. `attack(from)` is a raid. `__carrier.ship` in the console: `hit({target: 'mess', from: 'starboard'})`, `attack('port')`, `node('mess')`, `standDown()`. |
| `src/carrier/weapons.mjs` | `Weapons`: the raider and everything that shoots. No shields, here or on the raider. `raid(from)` sends a Rook corvette (from `ships.mjs`) on firing passes down that side, steering for waypoints in the carrier's frame; its shells are projectiles, led for her motion, that meet her radiators or her hull (`hitsCarrier`, then `integrity.arrive`), and it fires torpedo salvos (`launchAtCarrier`) at a compartment. Torpedoes (`torpedo()`, `torpsFrame()`): proportional navigation (N = 3) at `torpedo.accel` for `burn` seconds, a weave across the line of sight from `terminal` metres in that steadies at `settle`, a hit through the armour (`torpHarm`). Ours come from the tubes (`tubesFrame`: the CIC fires a salvo every `tubes.every` seconds once it has a solution, `tubes.first`). The point defence (`pdcFrame`): six automatic gatlings (`pdc` mounts), each takes the nearest enemy torpedo inside `pdc.range` that its arc bears on (the raider only with no torpedo up, inside `raiderRange`), slews at `slew`, leads it with its acceleration (`leadAccel`) and fires `rate` rounds a second as long as its magazine compartment, its own compartment and the heat allow; the rounds are an InstancedMesh pool (`roundsFrame`). The raider has its own (`raiderPdc`) against our torpedoes. The railgun (`railFire()` on a click at the helm, `railFrame()` the capacitors, `railAim()` the lead the helm's sight draws): it lies along the keel, so you aim it by turning the ship. Every gun puts heat into the plant (`plant.addHeat`). The turrets: the gunhouse and guns found by name in hull.glb (or the code-built ones), trained and elevated at their rates, the ready rack and the hoist, the firing cutout (`clear`), crew laying (`crewLay`, led with an error), and you in one (`man`, `placeCamera`, the sight's markings on `#c-ghud`, with torpedo diamonds and the point defence and heat lines). `drill(from)` is the gunnery target instead of a raider: a sled towed by a tug (`sled()`), on the same passes (`passes()`), kept in the same `raider` slot with `target: true` (no guns, hits counted in `hits`; the crews hold fire). The fighter's cannon is here too: `fly(fighter, trigger)` each frame from `main.mjs`, `cannonFrame()` fires it, `foe()` is what her sight shows (`cockpit.mjs` draws it). The raider fires back at her (`flakShot()`): `fighterHit()` takes it off `fhull`, and at nothing `hooks.crippled` (`main.mjs`) hands her to flight control. `log` records each torpedo killed and by what. `__carrier.guns`: `raid('port')`, `drill('starboard')`, `dismiss()`, `raider`, `torps`, `pdcs`, `rail`, `tubeStock`, `turrets`, `rounds` (the fighter's). |
| `src/carrier/plant.mjs` | `Plant`: her heat and her reaction mass. `heat` (0 to 1, how full the heat sinks are) rises with the reactor, the main drive and every gun (`addHeat`) and falls through the radiators (the hinged `radiator-port` / `radiator-stbd` objects in hull.glb, telescoped in and out by `scale.x`), more the hotter the sinks and the more they are spread and unhurt. At action stations they fold (`foldAtStations`) unless you set them by hand (`toggleRadiators()`, G at the helm), and a hit on a spread radiator (`radiatorAt`, `hitRadiator`) hurts it. At `limit` the point defence and the railgun hold their fire and the main drive is held to `throttle` (it clamps each main thruster's `health` after integrity has set it). Reaction mass: `prop` burned by the main drive at `isp`, leaking from a holed tank compartment; `dv()` is the rocket equation. The fins and the heat sinks' bands glow with the heat (`HEAT_GLOW` in layout.mjs). `rows()` for the status board. |
| `src/carrier/helmsight.mjs` | `HelmSight`: drawn over the helm's view on `#c-hhud`. The railgun's boresight ring and charge, the raider's bracket and the lead diamond (put the ring on the diamond and click), torpedo diamonds, prograde and retrograde, and the nav plot (`toggleNav()`, N): a waypoint off the bow, its range and closing speed, and the distance to stop: the turn onto retrograde first (`turnTime()`, from the thrusters' real turning rate; she coasts all through it), then the burn at full drive (`mainAcc()`). It calls FLIP AND BURN when that reaches the range, BRAKING once the nose is round, OVERSHOOTING when it is too late; inside 2 km and under 20 m/s it is `arrivals` + 1 and `onArrive` (the career's `transit` step reads `arrivals`). Also the heat, radiators, Δv and point defence lines, and `say()` messages. |
| `src/carrier/gload.mjs` | `GLoad`: what g does to a fighter pilot. Past `tolerate` g the strain builds (slower on the couch's juice, which runs out), the view greys from the edges (`#c-gveil`, only from the cockpit), and at full strain she blacks out: `fighter.mjs` gives her no hands until she comes round. Hard burn (Shift with W) runs the drive past its rating (`flight.mjs` `boostK`, up to `fighter.g.boost`). The cockpit HUD shows HARD BURN, JUICE and the strain. |
| `src/carrier/newton.mjs` | `Rigid` (mass, box inertia, velocity, spin), `Thrusters` (each one pushes from where it sits; `allocate` fires the ones that help), `Helm` (the carrier's controls and flight assist: OFF / ROT / FULL, X for all stop; `ref` is the velocity it counts as rest, `tau` how hard it assists and the fastest turn it allows; the fighter flies on flight.mjs instead), plumes (`updatePlumes(list, time, gas, dt)`: the short cone at the nozzle, and with `gas` (gas.mjs) the exhaust thrown out). |
| `src/carrier/flight.mjs` | `Flight`: how a fighter flies, ported from the Fighter Sound Lab. Newton only: no drag, no top speed, no drift kill. The main drive burns only while `ctl.burn` is held (`drive()`: lights at `rampFrom`, ramps to full, cuts on release; `power`, `spool`, `strain` feed the sound). Thirteen nozzles in four blocks (`noz`), each a valve open or shut with a timer (`openFor`, `valves()`; opposed pairs cancel, a dry tank shuts them all). `hold(axis)` is the attitude hold: pop, coast, pop to the `aim`, reaction wheels trimming the last 2°. Finite `prop` (main, rcs) burned through `isp`. It flies from a control frame (`controls()`: burn, retro, slide, turn, mouse, stick, or `aim` for an AI), so an AI pilot flies the same ship. `carried()` is a step while flight control or the launch lane moves her. Every number is the layout's `fighter.flight`. |
| `src/carrier/gas.mjs` | `Gas`: gas in vacuum, one particle pool of shader wisps (warped-noise filaments), additive, no drag, white to blue to violet as it cools, `emit()` and `nozzle()` (the carrier's thrusters, through `updatePlumes`). `DriveFx`: a fighter's drive and jets seen: the flame mesh, core and halo sprites, the gas poured out of the flame, a glint at each valve and a frosty burst per pop. Keep its shaders NaN-safe (no `pow` of a negative base, `1 - u` clamped, no normalize of a zero vector): one NaN pixel under the bloom blacks out the frame. |
| `src/carrier/flight-audio.mjs`, `dsp.js` | `FlightAudio`: the fighter's sound, all live DSP, no files. `dsp.js` holds three AudioWorklet processors (copied from the lab as is): `engine` (the drive, its wub, and `prime`, the unlit spin-up that is the power-up), `jets` (one voice per block), `body` (the airframe's groans and chatter, the cockpit's bed and events; breathing is off and stays off). Fed each frame from the `Flight`; events for ignition, cutoff and cooling ticks, the refuelling pump, and the "Alive" ambience. Through the helmet chain (low shelf, 190 Hz peak, a short metallic room). It shares `sfx.ctx`. The settings at the top of the file are the lab's signed-off defaults. |
| `src/carrier/fighter.mjs` | `Fighter`: one of the hangar's fighters, flown. `board(i)` (the drive spins up for 3 s; each fighter keeps her own tanks in `userData.prop`), `launch()` (the lift and the run down the lane, in the carrier's frame), `handOver()` (into the world with the carrier's velocity, plus her spin, plus the run), free flight on her `Flight` (`flight`, keys to a control frame in `controls()`, `toggleMouse()` for M), `canLand()` / `land()` (flight control's path round the hull to the pad, clearing the hull's lofts: `hullSpan()`). She launches and lands on her pad's side (`out`, -1 port, +1 starboard, from the pad's yaw); `fighter.launch.clear`, `launch.wings` and `landing.gate[0]` are distances out from the centre line, the pad turning her round and the tanks topped up (`refuelT`), `leave()`, and the cockpit or chase camera. `debugRefill()` is T, only with `?debug=1`. Her drive and jets are drawn by `fx` (gas.mjs `DriveFx`) and heard through `audio` (flight-audio.mjs). |
| `src/carrier/fighter-model.mjs` | `loadFighterModel()` loads `assets/carrier/fighter.glb`; `swapFighters(C)` puts a copy on every hangar pad in place of the code-built Wrens, each with its side number. At load the model's dark `CanopyGlass` is swapped for real glass (its flat bottom cap dropped, or it is a band across the view from the seat) and `HudGlass` for a near-invisible additive combiner. A copy carries what `fighter.mjs` and `ships.mjs` expect (`canopyHinge`, `wingFolds`, `plumes` and `halos` (empty), `eye`, `nozzle`), plus `gear` (`setGear`), `strobe`, `screens` and `hud`. `?fighter=code` keeps the old Wrens. |
| `src/carrier/approach.mjs` | `Approach`: the lane of light rings off the bay, on the line through your pad and on its side (`setPad(z, out)`), in the carrier's frame. `frame()` works out `state` (metres out, metres off the line, closing speed, the speed wanted there, and the `call`: `lane`, `line`, `slow`, `fast`, `good` or `catch`) and colours the next ring. On `catch`, `main.mjs` calls `fighter.capture()`. |
| `src/carrier/cockpit.mjs` | `Cockpit`: the three screens drawn onto the model's screen quads (THR thrusters, NAV plot, APP approach) and the HUD canvas over the view (`#c-fhud`): nose, pitch ladder and course against the carrier's deck, speed, the fuel and jet gas left (amber under 15%, red when dry, and a centred RCS DRY / FUEL DRY warning), range and closing, the hold and g, the drive's bar, the lane's needles and call, and the markers (prograde, retrograde, the aim's amber diamond, where to fly). From the chase view, only the markers and the call. |
| `src/carrier/cutaway.mjs` | Orbit camera. The clipping planes are in the ship's frame and follow her as she turns. The levels are the whole ship, one per deck, and lengthwise. |
| `src/carrier/hud.mjs` | Where you are, the use prompt, the helm instruments, the cutaway legend. |
| `src/carrier/crew.mjs` | `crewMember(name, dept)` (Rocketbox person in a uniform recolour, with an `AnimationMixer`), `placeCrew(C, station, k)` (the cast's `k`th person at a post), `removeCrew(m)`, `boardCrew(C)` (everyone at once, without the routine), `tickCrew` (a route with `once` stops at its end). The routine (`watch.mjs`) decides who stands where. |
| `src/carrier/mocap.mjs`, `wardrobe.mjs` | Copied from the Life Sim game: Rocketbox clips fitted to a person without retargeting, and the shader that recolours their clothes. |
| `src/carrier/drum.mjs` | The drums (v2 only). `buildDrums(C)`: each half a group spinning its own way; under it `blocks` (the cutaway's view: one InstancedMesh of rooms coloured by use, corridors, belt, spokes, hub) and `segs`, the walkable segments. `segment(C, half, deck, seg)` builds one as an ordinary `Interior` in its own turned frame (rooms by `fit`, ring corridor, doorways and signs, at a spoke the lift and the ladder); `drumWindow()` shows the ones near you; `placeInDrum()` puts the camera there, leaning across the crease between segments; `liftCar()` / `liftShaft()` for a ride; `drumsFrame(C, dt)` turns them. `main.mjs` holds where you are (`drumNow`), steps you into the next segment at a floor's edge (`drumStep`), and runs the lifts (`startRide`, `rideFrame`) and the ladders through `hooks.drum`. |
| `tools/blender/carrier_v2_build.py` | The spin-drum carrier's hull and fittings from `ships/carrier.layout.json`, written to `assets/carrier/hull.glb`. |
| `tools/blender/shipkit.py`, `carrier_build.py` | The first carrier's hull and fittings from `ships/carrier-v1.layout.json`, written to `assets/carrier/hull-v1.glb` (`?ship=v1`). |
| `tools/blender/fighter_build.py` | The fighter, outside and in, built in Blender from the layout's `fighter` entry, written to `assets/carrier/fighter.glb`. |
| `tools/carrier-v2.mjs` | `node tools/carrier-v2.mjs`: builds and checks `ships/carrier.layout.json`, the spin-drum carrier, from `design/carrier-v2.design.json` (`--check` writes nothing). See "Designing ships". |
| `tools/carrier-space.mjs` | `node tools/carrier-space.mjs [layout]` (default `ships/carrier.layout.json`): how much of the hull the compartments account for, a top-down map of the empty space per height band, and any compartments that overlap or poke through the hull. |

Every sign aboard is drawn on a shared `SignAtlas` (`src/decor.mjs`, `C.atlas`), so a deck's fifty signs bake into a mesh or two instead of fifty draw calls. Use `C.atlas.plane(w, h, draw)` for a new sign, not `I.sign()`.

What the layout holds:

- `decks`: id, name, floor height.
- `compartments`: id, name, deck, system, `access` (`walk` or `sealed`), box `x` and `z` (and `y` for sealed), and optionally `h`, `windows`, `bay` and `fit` (the furniture kind, below).
- `doors`: `{between: [a, b], at, w}`.
- `ladders`: `a` and `b`, each a deck, a spot and a facing.
- `helm` and `spawn`.
- `thrusters`: `main` and `rcs`.
- `mounts`: turrets, point defence guns (`pdc`, each with its `magazine` compartment), radiators, the bay door.
- `fighters`: where each one sits in the hangar.
- `fighter`: how one flies.
  - Mass, box size, and its own `thrusters` (in the fighter's frame).
  - `flight`: how she really flies (flight.mjs): `hold` (the drive's ramp, the aim's lead and mouse sensitivity, the turn rates, the smallest pop and the beat between pops), `inertia` and `com`, `nozzle` (the drive's mouth), `tank` and `isp`, `force` per nozzle kind, the four jet `blocks`, the `nozzles`, `alloc` (which nozzles make each command each way) and `opposed`. Its `about` says what each is. `thrusters` still places the Blender model's quads and gives the main drive's force.
  - `launch`: `lift`, `accel`, and `clear` (the x where you get the controls).
  - `landing`: `range` and `speed` (the limits for E), `gate` (the x and y off the bay where the lane ends), `lane` (how far out its rings run), `ring` (their radius) and `catch` (how close in metres along, how far off the line sideways and up, and how slow flight control catches a fighter you fly in yourself).
- `stations`: the crew posts, and who keeps them: `post` (its name on the watch bill) and `watch` (`on`: kept every watch by the section on watch; `day`: 0800–1700; `off`: an off-watch hand, within `hours`).
- `routes.lines`: the coloured floor lines. Each is `{name, to, color}`, where `to` is a room id.
- `integrity`: what hits do: air, holes, shells, drones, power, raids, and the jobs hits start. See "Tune the damage" below.
- `weapons`: the turrets (and the hatch each is manned from), the guns, the point defence, torpedoes and tubes, the railgun, the raider, the fighter's cannon. See "Tune the fighting" below.
- `plant`: heat (what puts it in, what the radiators take out, the limit) and propellant (mass, `isp`, the tank compartments, the leak rate). See plant.mjs above.
- `integrity` also holds `armour`, `condition` (condition one's warning, how fast it pumps down and to what, how fast it repressurises) and `suit` (seconds of air, the low warning).
- `fighter.g`: hard burn and g-LOC (gload.mjs).
- `damage`: the damage control jobs. `first` and `between` (seconds of walking before the first job and between jobs, only when `DamageControl` is made with `auto: true`; the carrier makes its jobs from hits instead), `kits`, `switchboards` (rooms where an electrical fault is isolated) and `kinds`. See "Add a damage control job" below.

### How the main deck is laid out

Deck 2 follows how a warship is planned, not a single long corridor:

- Two fore-and-aft passages, port (`p1`…`p7`, x -5.6 to -4.0) and starboard (`s1`…`s7`, x 4.0 to 5.6), with a centre block of rooms between them and the outboard rooms beyond.
- Transverse pressure bulkheads at z -108, -76, -46, -12, 22, 56, 84 and 112 split the deck into seven zones. Each passage segment ends at a bulkhead with a pressure door into the next one.
- A cross passage (`x2`, `x3`, `x5`, `x6`) in most zones joins the two sides, with the one-way stencils.
- Each zone groups rooms that work together. From forward: command (CIC deep in the hull, comms, wardroom); berthing (quarters beside the washrooms and laundry); messing (galley between the messes, its stores and scullery); flight and medical (hangar trunk and ladder, damage control, aircrew, medbay); security and welfare (armoury beside the brig); workshops; and engineering support aft. Each zone has a repair locker.

A new room belongs in the zone it works with, opening off that zone's passage or cross passage, never through a bulkhead.

### Add an order to the career (data only)

The career is `ships/carrier.career.json`. Steps run in order; each waits for one thing (`do`):

```json
{ "do": "talk", "who": "dc", "order": "Report back to Chief Okoro", "rank": "Crewman", "unlock": ["guns"],
  "say": "That's your damage control ticket. You're a crewman now." },
{ "do": "drill", "kind": "leak", "room": "galley", "order": "Patch the drill leak in the galley",
  "say": "Patched. Back to the chief.", "fail": "Lost it. Again." }
```

- `do`: `talk` (use officer `who`), `go` (stand in `room`), `read` (the watch bill on its board), `sleep` (turn in at your bunk; done at once if you are already called for your watch), `muster` (be in your muster room when the roll is called; adrift, the card sends you there late with `adrift.order`, and `adrift.call` / `adrift.say` are what the leading hand says), `rounds` (stand in each of `rooms`), `drill` (a damage control job of `kind` in `room`, done when you finish it; lost, and it runs again), `man` (sit in a turret), `shoot` (the gunnery drill: a tug tows the target sled down the side `from` once you are in a turret; done at `hits` hits of your own, and the tug comes round again if it finishes its runs first), `raid` (a raider `from` a side, `wait` seconds after you are in a turret and any target tug is clear; you must hit it `hits` times yourself, or kill it), `board`, `launch`, `land` (with `manual: true`, flying down the lane, not handed to flight control; handed over, you go back to `launch`), `helm`, `turn` (`deg`, then stop her turning).
- `order` is the card's line. `say` is what is said when the step is done (for `talk`, what the officer tells you, spoken in their `voice`); `start` is said when a raid begins; `fail` when a step goes wrong.
- `rank` and `unlock` take effect when the step is done. `unlock` is any of `guns`, `raids`, `fighters`, `helm`; until then, `refuse` says why not.
- A new officer is an entry in `people`: `id`, `name`, `room`, `at` [x, z], `yaw`, `pose`, `dept`, `voice` {pitch, rate}. Stand them clear of furniture, and check with `__carrier.go('<room>')`.
- Adding or removing a step changes the steps' count, so saved careers start again (`Career.saved(K)`).
- A new kind of step is a `case` in `check()` in `career.mjs`, and its place in `target()` (where the card and the markers point). If it needs a seat, add it to `BACK`, so a career picked up again backs up to the step that seats you.

Try it from the console: `__carrier.career.complete()` does the order in hand; `localStorage.removeItem('threadspace.carrier.career')` forgets the career.

### Voices (recorded with Gemini TTS)

The game plays mp3s; it never calls an AI service. `tools/voices.mjs` works out every line with fixed words from the
data (each `talk` step's `say` in the career; "You have your orders." and "Carry on." for each officer; your leading
hand's shake for each watch, the roll, and the muster step's words; each step's `start`; the pipes; the `ship` list in
`ships/carrier.voices.json`) and records what is missing or changed:

```bash
node tools/voices.mjs --list                          # every line, ✓ where there is a clip; needs no key
GEMINI_API_KEY=... node tools/voices.mjs              # record the rest (7 s apart; stops cleanly at the day's quota)
GEMINI_API_KEY=... node tools/voices.mjs --only dc    # one speaker; --limit 5 caps the requests
GEMINI_API_KEY=... node tools/voices.mjs --design     # make the saved voices that have no voiceId yet
GEMINI_API_KEY=... node tools/voices.mjs --sample out # one audition line (and Google's preview) per speaker, into out/
node tools/voices.mjs --prune                         # delete clips of lines the game no longer says
```

Each speaker is a voice designed in Gemini 3.8 Flash TTS from a 1–2 sentence description (`design`: age, gender,
timbre, accent; permanent traits only) and saved in the Google project behind the key (`POST /v1beta/voices`); every
line is spoken in it through the Interactions API with the speaker's `style` as the acting note. The crew come from
all over: an Irish coxswain, a Nigerian damage control chief, a South African gunnery officer, an Australian pilot, a
Texan officer of the watch, a Glaswegian leading hand, a Canadian voice on the broadcast. Keep that mix in new casting.

- The key goes in the environment only, never in a file in this repo. It needs `ffmpeg` (trims, levels, makes the
  tannoy sound, encodes 48 kb/s mono mp3).
- Change a line in the career or the watches, or a speaker's direction, and the next run records that line again
  (the index keeps a hash of what each clip was made from). Until it does, the browser speaks the new words.
- A new spoken line in code: say it through `voices.say(speaker, text)` (the ship: `dc.say(call, text)`), and if its
  words are fixed, add it to `ship` in `ships/carrier.voices.json` (or derive it in `tools/voices.mjs`) and record it.
- A new speaker: an entry in `speakers` keyed by the officer's or leading hand's `id`, with `design`, `gender`,
  `language` (BCP-47, e.g. `en-IE`), `style` and a `sample` line; then `--design --sample out`, listen, and record. Cast
  to their body: officers are dealt from `assets/people/index.json` in turn after the posts
  (`crewMember(stations + k)`), so check whether the model is a woman or a man.
- Saved voices live in one Google project and expire a year after their last use. With another key (a clone of this
  repo), clear the `voiceId`s and run `--design`: the same descriptions make new voices, close but not identical, so
  record every line again to keep each character consistent. To change a voice, edit its `design`, clear its
  `voiceId`, `--design`, and record its lines again (its hash changes, so a plain run does that).
- Calls with a place or a number in them (a job's call-out, a hull breach) are not recorded: there are too many.
- Time words: the tool says `0400` as "oh four hundred" and drops brackets from room names (`speakable()`).
- Listen to new clips. A clip that sounds wrong: delete its entry in `assets/voice/index.json` and run again (each
  take differs). Stage directions belong in `style`, never in a line's words: the model may speak them.

### Change the ship's routine (data only)

Everything is in `ships/carrier.watches.json`:

- **How fast the day goes:** `clock.rate` (ship seconds a real second; 30 makes a day 48 minutes). `clock.start` is when a new hand comes aboard.
- **A different rota:** `watches` (any number, each `from`/`to` as hh:mm; a day's count that is not a multiple of the sections' count moves the rota round each day) and `sections` (each with its colour and leading hand).
- **Your own line:** `you.section`, `you.part`, `you.muster` and `you.at` (where you are shown to stand), `you.bunk`, and `you.shake` (minutes before your watch you are called).
- **The muster:** `muster.early` and `muster.late` (minutes either side of the bell), `hands`, their `line` and `face`, the `leader` spot, and `out`, the way they march off (door, then passage). Stand them clear of furniture and check from inside the room: `__carrier.time('03:50', 2)` and `__carrier.go('repair-mid')`.
- **Who is at a post when:** a station's `watch` and `hours` in the layout. Faces change only out of your sight (28 m, or another deck).
- **Night:** `night.from`, `night.to` and its `color`.

Try it from the console: `__carrier.time('17:55')`, `__carrier.routine.watchAt()`, `__carrier.routine.openBill()`.

### Add a compartment

1. Add an entry to `compartments` with a unique `id`, a `deck`, a `system` (a key of `SYSTEMS` in `layout.mjs`, or add one there with its colour and label) and its box.
   - A walkable room must touch the room it opens onto: walls within 1.5 m of each other.
2. Add a `doors` entry: `{"between": ["corridor-id", "new-id"], "at": <x or z along the shared wall>, "w": 1.6}`.
3. Furniture: give it a `fit`, one of `tables`, `cabins`, `washroom`, `shelves`, `workshop`, `gym`, `laundry`, `cells`, `office`, `machines`, `lockers` or `briefing`.
   - The fit lays itself out from the wall with the door in it, and keeps 2 m inside the door clear.
   - For a one-off room, build it as a set in `sets.mjs` instead (see "Dress a room" below).
   - A sealed compartment's machinery is `machine()`, chosen by `system`. Unknown systems get racks of cabinets.
4. Check the space: `node tools/carrier-space.mjs` must report no overlaps and nothing through the hull. Its map shows what is still empty.
5. Open `carrier.html?view=cutaway` and step through the decks (1 2 3, M) to check it, then walk to it with `__carrier.go('<id>')`.

The sign over its door, its place on the deck plans, and any floor line that passes it come from the layout by themselves.

### Dress a room (sets.mjs)

Every room already gets its look, lamps, frames, deckhead services and coves from `sets.mjs`. To change how a kind of room looks, or to build one room as a set:

- **A room's look:** add its id to `ROOM` with a key of `LOOK`, or add a look: `wall` (`panel`, `padded`, `bare`, `tile`), `floor` (`plate`, `tread`, `nonskid`), the colours, `lamp` (the lamps' colour), `k` (how bright), `cove` (a colour, or `null` for none), and optionally `fill` and `sun`. Give a new look a `PROFILE` in `ambience.mjs` too, so it has a sound.
- **A set:** write `function myRoom(C, I, c, hooks, open)` and add it to `SETS` under the room's id. `c.x` and `c.z` are the room's box, and `I.floorY` is its deck. Put things in with `place(I, mesh, x, z, ry)` (at a turn of 0, a desk's user is on its +z side and a couch's sitter faces -z, so a couch at ry 0 sits on the +z side of a desk). Use the parts (`desk`, `couch`, `messTable`, `locker`, `rack`, `shelfRack`, `box`/`cyl` on the palette `P`). For a screen on a wall use `wallScreen()`, and for a sign `poster()`; both `mark()` the wall so no frame stands across them. If the room's deckhead runs should be somewhere else or nowhere, add it to `SERVICES`. To put its lamps over the furniture, add it to `LAMPS`.
- **A poster:** add a drawing to `POSTERS`, as `kind(g, w, h, opts)` on a canvas (use `text()`, which shrinks a line to fit), then `poster(C, I, 'kind', w, h, x, y, z, ry)`.
- **Something that moves:** push a `(dt, t) => {}` onto `C.anim` (`(C.anim ??= []).push(...)`), as the CIC's plot does.

Keep a set to boxes and cylinders on `P` and the shared materials, so the room still bakes into a few meshes. Check it with `__carrier.go('<id>')` and `__carrier.info()` (draw calls, triangles).

### Add a floor line

Add `{ "name": "Armoury", "to": "armoury", "color": "#ff6a50" }` to `routes.lines`.

- The line runs down every passage, on its own lane, with arrows toward the way out to that room.
- It turns off through the door on the way, and ends in a ring at a ladder when the way is up or down.
- The hanging signs and the deck plans' key pick it up.
- The lines sit in a band 0.085 m apart along one wall of each passage (`LANE` in `wayfinding.mjs`), so ten fit in a 1.6 m passage and still leave the middle bare. The paint is deliberately faint (`paint()`): it is there for someone looking for it.

### Add a damage control job

Everything is in the layout's `damage` entry. A kind of job is:

```json
"flood": { "name": "Flooding", "call": "Flooding, flooding, flooding.", "kit": "pump", "work": 8, "lost": 120, "rooms": ["laundry", "washrooms"] }
```

- `name` is on the job card; `call` is the first thing the speakers say, before the place ("…in the laundry. Main deck, frame 227, port.").
- `kit` is a key of `kits`: you must carry it to do the work. `work` is the seconds of holding E.
- `rooms` is a list of room ids, or `"rooms"` (any furnished walk room of 30 m² or more) or `"passages"` (any passage longer than 14 m).
- How it gets worse, any of:
  - `grows` and `lost`: every `grows` seconds you are not working on it, it gets a size bigger (more work); at size `lost` it is lost. (Fire.)
  - `lost` alone: lost after that many seconds. (Leak.)
  - `isolate`, `becomes` and `after`: it must be isolated at a switchboard before you can work on it, and if it is not isolated within `after` seconds it becomes a `becomes` job in the same room. (Electrical.)

A kit is `{ name, label, color }` plus where it is kept:

- `lockers`: the label on a passage locker. The first kit with lockers gets a small cabinet every 30 m; the others a cupboard every 60 m.
- `rooms`: room ids that get a rack of it just inside the door.
- `kept`: how the job card and messages say where to find it.
- `agent`: seconds of use before it is empty (an extinguisher); without it, a kit lasts. A patch kit is used up by the job it fixes (`end()` in `damage.mjs`).

A new kind needs its look in `damage.mjs`: where it goes (`floorSpot`, `wallSpot` or `leakSpot` in `raise()`), its effects (`effects()` and `animate()`) and its words (`VERB` and `OUT`). Try it with `__carrier.dc.raise('flood', 'laundry')`.

### Tune the damage

Everything is in the layout's `integrity` entry; its `about` says what each number is. The ones you will want:

- **How fast a room vents:** `hole.flow` (m/s through a hole to space) and `shell.hole` (the hole sizes a shell makes, m²). A room's air falls as `area × flow / volume` of itself a second: a 0.2 m² hole empties a 300 m³ cabin in about ten seconds, the hangar in ten minutes.
- **How deep a shell goes, and how much it wrecks:** `shell.pen` (metres) and `shell.damage`. Most of the walkable decks sit inside a belt of tanks, berthing and machinery, so short `pen` keeps hits in the outer spaces.
- **How often raids come:** `attack.first` and `attack.between` (seconds), `attack.hits`, and `attack.stand` (seconds after the last hit before the doors may open again).
- **How long you last without air:** `air.faint` (kPa) and `air.blackout` (seconds).
- **Repairs:** `drones` (how many, how fast, how long a seal takes) and `patch.work`.
- **What a hit starts:** `jobs` gives the chance of a fire, an electrical fault or a coolant leak in the walkable room a hit hurt most.

What a system does when it is hurt is in `systems()` in `integrity.mjs`: the reactor (with the `power` switchboards) below `power.below` cuts the main drive and the lights; the drive's health scales the main thrust; each manoeuvring cluster follows the compartment it is fixed to; life support sets how fast air comes back; the drone bay below 40% sends no drones. A new effect goes there: read `this.sys('<system>')` (0 to 1).

Try it from the console:

```js
__carrier.ship.hit({ target: 'cic', from: 'port', pen: 12 })   // a shell into the CIC: it vents, its door shuts
__carrier.ship.attack('starboard')                              // a raid now
__carrier.ship.node('cic')                                      // its air, health and holes
```

The pressure doors are made from the layout's `doors` (one leaf each, sliding into the gap between the rooms), so a new door needs nothing more. A new compartment is a volume of air and a target as soon as it is in `compartments`.

### Tune the fighting

Everything is in the layout's `weapons` entry (and heat in `plant`); its `about` says what each number is. There are no shields. The ones you will want:

- **How hard a raid is:** the raider's `hull` and `passes`, its `gun.every` (seconds between shots) and `gun.range`, its `torpedo` (`salvo`, `every`, `range`, `stock`), its `pdc` against our torpedoes (`range`, `rate`, `spread`), and `jink` (its evasive weave).
- **Torpedoes:** `torpedo`: `accel` and `burn` (how fast and for how long they push), `jink` and `terminal` (the weave in the last stretch) and `settle` (where it steadies so the guidance can put it back on the aim: without it, a weaving torpedo weaves past), `pen`, `damage` and `hole` against the carrier, `raiderDamage` against the raider. `tubes`: `first` (seconds into a raid before the CIC's first salvo), `every`, `salvo`, `stock`, `range`.
- **Point defence:** `pdc`: `range` (against torpedoes), `raiderRange`, `arc` (degrees off the mount's `up` it can bear), `slew`, `rate`, `spread`, `speed`, `stock`, `heat` per round, and `damage` (per round, against the raider's armour: small on purpose, or the PDCs win every raid before a gunner gets a shot). As tuned, the PDCs kill about two torpedoes in three; a salvo fired from long range, fast, is the one that gets through.
- **The railgun:** `railgun`: `speed`, `spread`, `charge` (seconds to fill the capacitors), `heat` per slug, `damage`, `range`, `stock`, `muzzle`.
- **Heat:** `plant.heat`: `base` and `drive` (heat in per second idle and at full drive), `reject` (what spread radiators take out at full sinks), `folded` (what folded ones still shed), `deploy` (seconds to spread or fold), `warn`, `limit`, `throttle`. As tuned, a raid with the radiators folded puts 0.3 to 0.6 into the sinks: two raids back to back and you are spreading them in a fight.
- **How well the crews shoot:** `gun.crewSpread` (radians off; 0.02 is about 12 m at 600 m) and `gun.crewReload`. As tuned, a raid lasts about a minute: the crews' shells do most of the work, the torpedoes some, the PDCs a little.
- **Balance it fast:** stub the render and run raids in the console, out of the turret (a turret you sit in is not crewed): `__carrier.renderer.render = () => {}`, then `ship.attack(side)` and `__carrier.tick(30, 1/30)` in a loop until `guns.raider.gone`. `guns.log` counts the torpedoes killed and by what; wrap `ship.arrive` to count hits on the hull, and `guns.raiderHit` to see what did the damage.
- **The gunnery drill:** `target`: the sled's `speed`, `standoff` and `passes`, `tow` (metres of cable), and `size` (the ellipsoid a shell must pass through to score; the sled is drawn 16 m across).
- **The fighter's cannon:** `fighter`: `every` (seconds between rounds), `shell` (m/s on top of her own velocity), `spread`, `range`, `rounds` in the drum, and `damage` per round. Her `hull` is what the raider's `flak` takes off (`raider.flak`: `range`, `every`, `shell`, `spread`, `damage`, `radius`).
- **How the turret feels:** `gun.train` and `gun.elevate` (degrees a second), `gun.reload`, `gun.shell` (muzzle speed; the lead grows as it drops), `gun.rack` and `gun.hoist`.
- **Condition one:** `integrity.condition`: `warn` (seconds between the call and the venting), `pump` (kPa a second), `to`, `repress`. As tuned, the ship is airless about 30 s into a raid.

A second turret is a `turret` mount in `mounts` (rebuild the hull so it has a gunhouse), plus an entry in `weapons.turrets` with its barbette and magazine compartments and the hatch it is manned from. Another point defence gun is a `pdc` mount (with its `magazine`); rebuild the hull for its sponson. A new kind of enemy is a builder in `ships.mjs`, then `raid()` in `weapons.mjs` (the waypoints of its passes, which are in the carrier's frame) and `raiderShot()`.

Try it from the console:

```js
__carrier.ship.attack('starboard')   // a raid with action stations and condition one
__carrier.guns.raid('starboard')     // a raider now, without them
__carrier.guns.drill('starboard')    // the target tug and its sled instead; guns.dismiss() sends it home
__carrier.guns.raider                // its hull, the waypoint it is on (wi), torpLeft
__carrier.guns.torps                 // torpedoes in flight (side 'ours' or 'theirs')
__carrier.guns.log                   // each torpedo killed, when and by what
__carrier.plant.heat = 0.95          // nearly at the heat limit; plant.toggleRadiators()
__carrier.helmSight.toggleNav()      // a waypoint for a flip-and-burn transit
__carrier.ship.don(); __carrier.ship.setCondition()   // suit up and vent the ship, as a drill
```

Start in the dorsal turret with `carrier.html?at=gun` (`?at=gun-ventral` for the other). In a fighter (`?at=fighter`), the mouse button fires her cannon once she is out; `__carrier.guns.fhull` is her hull.

### Add a crew station

Add an entry to `stations`:

```json
{ "room": "medbay", "at": [x, z], "yaw": 0, "pose": "workTable", "dept": "crew" }
```

- `pose` is one of `idle`, `walk`, `sitChair`, `workTable`, `talk` or `lookAround`.
- `dept` is `command`, `flight`, `engineering` or `crew`; it picks the uniform colours, `UNIFORMS` in `crew.mjs`.
- `yaw` 0 faces the bow.
- `"route": [[x, z], [x, z]]` makes them walk back and forth instead.
- People are dealt from `assets/people/index.json` in turn.
- A seated person needs a chair under them (`I.seat`). Use `{ low: true }` so they still show from behind.

### Add a thruster

- `thrusters.main` entries are `{at, r, force}` (newtons) and push toward the bow.
- Each `thrusters.rcs` entry is a cluster of three nozzles at `at`, pointing out along x, y and z away from the centre of mass, each at `rcsForce`.
- The helm's capability readout and the allocation pick new thrusters up by themselves. Rebuild the hull (below) so the Blender nozzles match.

### Change how the fighter flies

Everything is in the layout's `fighter` entry; nothing in the code needs to change.

The rules were settled in the Fighter Sound Lab and are the point of the fighter: keep them. Real Newtonian flight even when it is hard to fly; the main drive only while W is held; small, finite jets (turning is pop, coast, pop; stopping is flip and burn); nothing that kills drift. Any AI fighter flies the same `Flight` (set `ctl.aim` and `ctl.burn`).

- **Harder or softer drive:** `thrusters.main[0].force` (newtons; 3.6e5 on 12 t is 3 g), `flight.hold.rampFrom` and `rampRate`.
- **The jets:** `flight.force` per kind (30 kN a nozzle: a pair slides her at 5 m/s²), and where they sit (`blocks`, `nozzles`). Keep the bow and stern blocks at the centre of mass's height, or a slide also rolls her.
- **Turning:** `flight.hold.wmax` (the cruise turn rate per axis), `sens` (the mouse), `minPop` and `gap`.
- **How long a sortie lasts:** `flight.tank` and `flight.isp`.
- Check it in the console: `__carrier.fighter.flight.cap` is what each command can do flat out each way (m/s², rad/s²); `flight.prop` the tanks.

- **Easier or harder to land:** `landing.catch` and `wantAt()` in `approach.mjs` (the speed the lane asks for: 4 m/s at the gate, rising 0.09 m/s a metre out, up to 40).

Start in a fighter with `carrier.html?at=fighter`. Add `&debug=1` and T refills her tanks in flight (without it, only landing does). From the console, `__carrier.bayNow()` opens the bay at once and `__carrier.fighter.launch()` launches.

### Change the fighter's look or cockpit

```bash
blender -b --factory-startup --python tools/blender/fighter_build.py     # from this folder; about 8 s
```

The script reads the layout's `fighter` entry: the manoeuvring blocks sit at its `rcs` clusters, and the bell at its main drive. Then it writes `assets/carrier/fighter.glb`.

The game finds these parts by name, so keep the names when you change them:

- `canopy`: its origin is the hinge, and rotating it about x opens it.
- `wing_l` and `wing_r`: the radiator panels (she has no wings: in space, the drive's waste heat has to be radiated away). Their origin is the fold hinge, and rotating them about z folds them up for the hangar.
- `gear`, `pilot` (hidden from the cockpit camera) and `strobe`. The `pilot` is the torso, arms and helmet only: the legs are part of `cockpit`, so you see them from the seat. Do not give `pilot` legs again, or they double up from outside.
- `mfd_l`, `mfd_c` and `mfd_r`: UV-mapped quads that `cockpit.mjs` draws on. Their bezels stand 5 mm proud of the glass with a 4 mm gap round it; keep anything you add in front of the panel off the screens.
- `hud`: the head-up display's glass. It stands on two thin posts over a projector sunk in the glare shield, with no frame round it, so it does not box in the view. `fighter-model.mjs` swaps its material for a faint additive tint (`COMBINER`).
- Empties: `eye`, `nozzle`, `decal_l`, `decal_r`, and `muzzle_l` / `muzzle_r` (where the guns fire from).

How she is laid out, so a change keeps it believable: a pressure capsule for the pilot at the front (sensors in the nose, the cockpit tub, then life support and avionics behind the seat), a service body behind it, two propellant tanks slung alongside on saddles with the missiles on their rails, the main drive's bell on a gimbal at the back, manoeuvring quads on outrigger arms at the corners, and the radiator panels on top. The canopy is a thin faceted glass shell (`solid(..., 0.012)`) whose sill sits on the coaming rails at shoulder height, so the pilot sits in the tub with the glass over them, not inside a glass shape.

A few more things to know:

- Make an open surface (a lathe's bell or dome) solid with `solid()`. The game culls back faces, so a one-sided bell shows only its far half.
- A new screen: add a quad and a `Screen…` material in the script, add its name to `makeFighter()`'s list, and add a draw method in `cockpit.mjs`.
- The side number on the nose is drawn in code (`numberMaterial` in `fighter-model.mjs`).
- The cockpit is `cockpit` (one mesh, no texture) and `cockpit-labels` (every placard and lit legend, quads on one texture). The script fits parts to a flat surface with `Surf` (`.box()`, `.mark()`) and the helpers `plate()`, `toggle()`, `knob()`, `guarded()`, `lamp()`, `dial()`; `obox()` is a box turned to any two axes. Lay out a new console panel with those rather than raw coordinates.
- A label: `placard(text, style, centre, across, up, line_height)`. Styles are in `LABEL_STYLE`: each has a background that matches the surface it sits on (`panel`, `plate`, `wall`, `pad`, `paper`), or is a legend (`tile` out, `green` / `amber` lit). `label_atlas()` draws every label's text into one image with Workbench while the script runs (a render, so the build needs a GPU-capable Blender), packs it into the GLB, and deletes the scratch file. Labels go on `Placard`, lit ones on `LampLegend`, which, like every `Lamp…` material, the game draws without tone mapping.
- Keep the cockpit's colours to the small palette at the top of the script (`Panel`, `PanelLight`, `Tub`, `Pad`, `Knob`, `Switch`, `Guard`, `Hazard`, the `Lamp…` lights): each new material is another draw call on every fighter in the hangar.
- The camera's near plane is 0.2 m: nothing within 20 cm of `eye` is drawn.

### Rebuild the hull in Blender

```bash
blender -b --factory-startup --python tools/blender/carrier_build.py     # from this folder; about 2 s
```

The script reads the layout and writes `assets/carrier/hull.glb`.

- `?hull=code` shows the game's own lofted hull instead.
- The game hides its own outside fittings when the GLB loads, and caps metalness at 0.2, because there is no environment map.
- Keep anything that crosses the inside of the hull open-ended: a capped loft is a solid slab across the decks. Use `K.loft(..., caps=False)`.
- Each turret's gunhouse is its own object named for its mount (`turret-dorsal`), its origin on the turret's axis, and its barrels another (`turret-dorsal-guns`), its origin on the trunnions. `weapons.mjs` finds them by those names to train and elevate them; everything else is joined into `fittings`.
- The bay is a boolean cut into the closed hull, which leaves a face across the back of the opening. The script deletes it, so you can see into the hangar from outside. If you move the bay, check from outside that it isn't a wall again.

The deck interiors and the machinery are still built in code from the layout. Only the hull and its fittings come from Blender.

## Rules this game keeps

- The panel never touches three.js; the 3D side never builds DOM for the panel. Verbs on `Game` are the seam.
- A scripted line exists for everything an AI voice can say. Keep the AI optional and off by default.
- Point lights come from the fixed pool in `lights.mjs`; adding a light recompiles every material.
