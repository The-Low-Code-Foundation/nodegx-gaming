# Lab Rat: notes for an AI coder

A first-person creature shooter in plain ES modules and three.js. No build step, no `npm install`: `index.html` loads
`src/main.mjs` through an import map that points `three` and `three/addons/` at `vendor/`. Serve the folder
(`npx serve .` or `python3 -m http.server`); `file://` will not work. Everything except the four creature models is
generated at start-up: geometry from primitives, textures on canvases, every sound in WebAudio, the PA voice through
the browser's speech synthesis.

## Code map (`src/`)

- `map.mjs`: **the level as data** (pure, no three.js). A 56 × 28 grid of 2 m cells (`W`, `H`, `S`). `ROOMS` (cell
  rectangles, height, `style`), `DOORS`, `PROPS` (bench, tube, vending, desk, pillar, crate), `PICKUPS` (wrench, smg,
  ammo, can), `USABLES` (terminal, vending, medkit, gatectl, breaker), `CANISTERS`, `CRYSTALS`, `NEST`, `VENTS`,
  `LIGHTS`, `SIGNS`, `OKAFOR`, `GROWN`, `TRAIL`, `SWEEP`, `START`, `AT` (the `?at=` start points); `Level` (the cell
  grid, doors, flow fields for pathfinding); `wallPos`.
- `main.mjs`: the world. Renderer and bloom, input, the loop, noise and hearing (`noise`), hits (`hitscan`,
  `bulletHit`), explosions, pickups (`makePickup`), usables (`use`), doors, crystals, **the scripted beats** (`beats`:
  the PA, the corridor lights popping, the vent ambush, the gate, the breaker and the lift hold-out), checkpoints,
  death and respawn, the end card (`finish`), the field notes (`observe`), the title screen text (`titleScreen`). Per-room
  fog is the `FOG` table at the top; settings are kept in localStorage under `labrat.`.
- `creatures.mjs`: `Creature` (the base: movement over the grid, hit spheres, health), `Skitter` (hunts by sound,
  chatter then leap, drags bodies to the crystals), `Tender` (tends crystals, its light repels Skitters, screams when
  hurt), `Bulwark` (armoured front, blind charge, dazed on impact, soft sac on its back), `Canister` (shoot it: boom).
- `creature-models.mjs`: loads `assets/creatures/*.glb`, clones one per creature, plays its clips (`Anim`).
  `creatureModel(kind)` returns null when a file is missing, and the creature keeps its procedural body.
- `models.mjs`: every procedural model: your hands, the wrench and the SMG, the three species' procedural bodies
  (`buildSkitter`, `buildTender`, `buildBulwark`), the humans (`makeHuman`), crystal and flame textures.
- `humans.mjs`: `Okafor` (a scientist who follows you, warns you, can be downed and helped up) and `Soldier` (the
  squad that comes down the freight lift at the end).
- `player.mjs`: you: movement, footstep noise by speed, crouch, jump, the wrench and the SMG in their own view scene,
  can and shard throwing, health.
- `build.mjs`: turns `map.mjs` into merged meshes with baked corner shading, props, doors, lights (`LightRig`: a pool
  of 10 real lights handed to the nearest sources each frame), signs, crystals, the grown bodies.
- `textures.mjs`: every canvas texture. `audio.mjs`: every synthesised sound, HRTF positioned, with a reverb per room
  zone. `fx.mjs`: particles, decals, tracers, casings, explosions. `hud.mjs`: `NOTES` (the ten field notes), the HUD,
  the terminal, the title, pause, death and end screens.
- `studio.mjs` + `studio.html`: every procedural model on a turntable (`?m=skitter&a=windup&dark=1`). Use it when you
  build or change a model in `models.mjs`.

Other files: `credits.html` (linked from the title screen), `tools/check-map.mjs` (run `node tools/check-map.mjs`:
every room reachable, every pickup, canister, crystal, nest home and vent on a floor a body can reach, every usable on
a real wall; exits non-zero on a failure).

URL switches: `?god=1`, `?nobloom=1`, `?at=garden|bay`, `?nolock=1` (no pointer lock; the game is then on
`window.__lab` for scripting).

## How to add a room

1. In `src/map.mjs`, add to `ROOMS`: `{ id: 'store', name: 'Stores B', x0: 33, y0: 1, x1: 38, y1: 4, h: 3.0, style: 'office' }`
   (cells, inclusive; inside `W` × `H`; `style` is a key of `STYLE` in `build.mjs`: `lab`, `office`, `hold`, `bay`, `lift`, which picks the
   wall and floor textures). Rooms must not overlap; walls are the cells between them.
2. Add a door joining it to a neighbour in `DOORS`: two cells side by side in the wall gap,
   `{ id: 'store', cells: [[35, 5], [36, 5]], h: 3.0 }` (`locked: true` to open it from a script).
3. Light it: an entry in `LIGHTS` (world metres; kinds `steady`, `pulse`, `flicker`, `tube`, `beacon`), and a sign
   in `SIGNS` if you want one.
4. Give it fog in the `FOG` table at the top of `src/main.mjs` (it falls back to the corridor's).
5. Run `node tools/check-map.mjs`, then play it.

## How to add a pickup, a prop or a usable

- Pickup: an entry in `PICKUPS` (`{ id: 'can-store', kind: 'can', p: [70, 0.06, 5] }`; positions in world metres =
  cell × 2). Kinds are drawn in `makePickup` and taken in `updatePickups` (`main.mjs`); a new kind needs a branch in both.
- Prop: an entry in `PROPS` with its cell, solid `box` inside the cell and `top` height. A new kind needs a branch in
  `build.mjs` (search `p.kind === 'crate'`).
- Usable: an entry in `USABLES` with a cell and the wall side (`N`, `S`, `E`, `W`); behaviour in `use()` in `main.mjs`.

## How to add creatures to the level

- More of an existing species: Skitters are spawned in `main.mjs`'s constructor from `NEST.homes`
  (`new Skitter(this, x, z, { leash: 2.2 })`), from `VENTS` during beats (`popVent`), and in waves (`spawnWave`). The
  Tender and the Bulwark are placed there too (`new Bulwark(this, 99, 39.5, Math.PI)`). Add a position to the data
  table or a line beside these.
- A new species:
  1. Body: write `buildMyThing()` in `src/models.mjs` returning a group with named parts (copy `buildSkitter`), and
     check it in `studio.html?m=…` (add it to `MODELS` in `studio.mjs`).
  2. Behaviour: `class MyThing extends Creature` in `src/creatures.mjs`: `update(dt)` with a state machine,
     `hitTest(o, d, max)` for its hit zones, and its reaction to `noise`. Give it one rule a player can learn by watching, a tell before it hurts, and
     a weakness: that is the design of this game.
  3. Optional real model: a rigged GLB in `assets/creatures/`, an entry in `SPEC` in `creature-models.mjs` (`file`,
     `size` as `[axis, metres]`, the `pose` clip to measure, `ground`, `turn`), and an `animateModel(dt)` on the class
     that maps states to clips (see `Skitter.animateModel`).
  4. A field note for it: an entry in `NOTES` in `src/hud.mjs` and `this.world.observe('<note id>')` where the
     behaviour happens.

## How to make a second level

There is no level list yet: `map.mjs` exports one level's constants and `main.mjs` imports them by name, and the
beats in `main.mjs` refer to room ids (`corr`, `sec`, `garden`, `bay`, `lift`). The honest order: move the exports
into one object (`export const LEVELS = { annex: { W, H, ROOMS, … } }`), pass the chosen level to `Level`,
`buildLevel` and the constructor, then move the beats into per-level functions.

## Assets: how they were made

The four creature GLBs come from Sketchfab under CC licences (see `CREDITS.md`). The Roach and the Flesh Blob are as
downloaded (scaled in code). The Opabinia was joined, welded and decimated from 344k to 45k triangles in Blender, then
given a 9-bone rig with keyed swim, tend, scream and death clips; the Arang was given a 15-bone rig with idle, walk,
run, charge, bite, stagger and death clips. The Blender scripts and the original downloads are not in this folder and
are available on request. Do not round-trip a downloaded skinned model through Blender's glTF exporter: its bind pose
comes back metres away from where its animations put it.
