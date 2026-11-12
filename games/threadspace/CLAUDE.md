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
| `controllers/` | One per seat: `walk`, `fly` (helm, Wren, autopilot), `turret`, `eva` (space walk), `board` (boarding firefight). |

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

## Rules this game keeps

- The panel never touches three.js; the 3D side never builds DOM for the panel. Verbs on `Game` are the seam.
- A scripted line exists for everything an AI voice can say. Keep the AI optional and off by default.
- Point lights come from the fixed pool in `lights.mjs`; adding a light recompiles every material.
