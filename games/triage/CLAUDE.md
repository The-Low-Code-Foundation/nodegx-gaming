# Triage: notes for an AI coder

A third-person hospital shooter in plain ES modules and three.js. No build step, no `npm install`: `index.html` loads
`src/game.mjs` through an import map that points `three` and `three/addons/` at `vendor/`. Serve the folder
(`npx serve .` or `python3 -m http.server`); `file://` will not work.

## Code map (`src/`)

- `game.mjs`: the entry point. Reads the URL (`?floor=`, `?sandbox=1`, `?nozombies=1`, `?lite=1`, `?dtmax=`), builds
  the world from the map, spawns the officer, the infected, the trapped and the pickups from the map's letters, runs
  the loop, takes the input (key bindings near `addEventListener('keydown'`), the settings, skills and tuning kept in
  localStorage (`triage.settings`, `triage.skills`, `triage.tune`), the end of a floor.
- `map.mjs`: **the level format.** `MAP` (the floor) and `SANDBOX` are text grids, one character per 2 m cell, the
  legend at the top of the file; `LIGHTS` / `SANDBOX_LIGHTS` are the ceiling lights that really light; `parse()` turns
  a grid into cells, items, the start, the exit, the locked rooms and the doors; sight lines and breadth-first paths.
- `level.mjs`: `buildLevel(grid, scene)`: walls, floors, ceilings, doors, signs, cover objects, textures (ambientCG),
  lights, blood and damage decals, the sandbox's atmosphere.
- `player.mjs`: the officer: third-person camera, walk/sprint/crouch, cover (tall and low), peeking, hiding under
  desks and beds, aiming, firing, reloading, melee, pickups, health, bites and the infection clock.
- `zombies.mjs`: the infected: sight and hearing, wander, investigate, chase, lunge and bite, hit zones (`PARTS`),
  limping and crawling, breaking locked doors, searching for someone hidden, the twitchy procedural movement (`afflict`).
- `survivors.mjs`: the trapped people in locked rooms and their run to the stairs.
- `weapons.mjs`: **data.** `WEAPONS` (magazine, reserve, fire rate, spread, pellets, noise radius, reload time),
  `PICKUPS` (map letter → what it gives), `SKILLS` (bought between floors).
- `guns.mjs`: the weapon models, built in code from extruded side profiles (`BUILDERS`: pistol, smg, shotgun, rifle,
  bat, knife), with moving parts (slide, magazine, bolt, pump); `buildWeapon`, `buildPickup`, `buildAmmo`.
- `rig.mjs`: the weapon rig after the animation mixer: spine lean, the gun's pose (`HOLD[kind]`: aim, ready, sprint,
  cover), recoil springs, two-hand IK, finger curls. `pose.mjs`: the IK helpers.
- `people.mjs`: loads Rocketbox people (`assets/people/index.json`), bakes Quaternius's animation library onto them
  (`retarget.mjs`), splits clips into upper and lower body (`Animator`). `mocap.mjs`: Rocketbox's own captured clips
  (`assets/anims/index.json`). `face.mjs`: expressions and blinking.
- `move.mjs`: a circle slid against the grid. `fx.mjs`: muzzle flash, tracers, blood, wounds, bullet holes, smoke.
  `atmos.mjs`: dust, the dying light, the sparking panel, ambient sounds. `fear.mjs`: the heartbeat and the vignette.
  `audio.mjs`: WebAudio playback of `assets/sfx/` (index in `assets/sfx/index.json`) with reverb, distance and the
  deafening after a shot; synthesised fallbacks. `radar.mjs`: the radar and the full map (M). `hud.mjs`: the HUD, the
  title, pause, end-of-floor and sandbox panels (all game text is here).
- `guns-view.mjs` + `guns-view.html`: a viewer for the weapon models (`?only=pistol`, `&side=1`, `&markers=1` shows
  the grip, muzzle and support points the rig uses, `&dim=1`). Use it when you change or add a gun in `guns.mjs`.
- `people-view.mjs` + `people-view.html`: the cast in a lit room (`?who=Police_Female_Patrol,Medical_Male_01`,
  `&cam=front|three|back|close|body`, `&expr=happy`, `&clip=idle`). Use it to check a person you add.

## How to add a floor (a level)

1. Draw it in `src/map.mjs` as a new export, using the legend at the top of the file:
   ```js
   export const FLOOR2 = `
   ##########
   #S...D,,R#
   #....L,,,#
   #..Z.#####
   #......E.#
   ##########
   `;
   export const FLOOR2_LIGHTS = [[2, 1], [6, 4]];
   ```
   Rules: walls round the edge, exactly one `S` and one `E`, every `L` door with an `R` behind it, ward rooms in `,`,
   corridors in `.`. Keep it rectangular (short rows are padded with walls). Lights are `[x, z]` cells; only the first
   ten are lit (`level.mjs`), the third one flickers.
2. In `src/game.mjs`, where the grid is made (`grid: sandbox ? … : parse()`), choose by the `floor` number read from
   the URL, e.g. `parse(FLOORS[(floor - 1) % FLOORS.length])`. "Next floor" already reloads with `?floor=n+1`.
3. Lights: `level.mjs` uses `grid.lights ?? LIGHTS`, and treats any grid that carries `lights` as the sandbox (red
   emergency lights on row 0–1, a dying panel). For a floor with its own lights, add a separate field (say
   `grid.floorLights`) and read it in the `// ---- lights` block of `buildLevel`; until then a new floor uses `LIGHTS`.
4. Check by playing `?floor=2`: every door reachable, a body fits each doorway (two-cell corridors are comfortable).

## How to add a pickup

1. Pick an unused letter and add it to `PICKUPS` in `src/weapons.mjs`, e.g. `Q: { kind: 'ammo', ammoType: 'rifle', amount: 20, label: 'Rifle magazine' }`.
2. In `src/map.mjs` `parse()`, add the letter to both letter strings (`'ZzXKTBNCWVPGAMUHYRLJ'` for items and the
   room-floor string inside `fill`), and to the legend comment.
3. In `src/game.mjs`, add the letter to the `'PAGUHMY'` string in the loop that calls `addPickup(PICKUPS[it.type], x, z)`.
   The floor model comes from `buildPickup` / `buildAmmo` in `guns.mjs`.
4. Place it in a map.

## How to add a weapon

1. Numbers: add an entry to `WEAPONS` in `src/weapons.mjs` (`slot`: `pistol`, `long`, `melee`; `ammoType`; `clipName`
   for the animation it borrows).
2. Model: write a builder in `src/guns.mjs` (copy `rifle` or `smg`) and add it to `BUILDERS`; give it the named child
   groups the rig moves (`slide` or `bolt`, `mag`) and the `eject`, `butt`, `magAxis` points.
3. Hold: add `HOLD.<kind>` in `src/rig.mjs` (copy the closest gun) and tune it in `guns-view.html?only=<kind>&markers=1`
   and in the sandbox.
4. A pickup letter for it (above), and sounds: a `<kind>` key in `assets/sfx/index.json` with its files (`audio.mjs`
   falls back to a synthesised shot without one).

## How to add an infected type or a person

People are Rocketbox GLBs listed in `assets/people/index.json`; the infected and the trapped are drawn from the
hospital staff and the adults there. A new person: a GLB converted the
same way (Rocketbox FBX with `_facial` blend shapes → GLB with 1024 px head and 512 px body textures), an entry in
`index.json`, a place in `CAST` near the top of `src/game.mjs` (officer, infected, trapped, fallen), then check it in
`people-view.html?who=<name>`. The infected's speeds and reach are constants at the top of `src/zombies.mjs`; sight
(14 m standing, 7 m crouched) and hearing are in its senses code (search `crouched ? 7 : 14`).

## Assets: how they were made

Shipped assets are converted copies; raw sources (Rocketbox FBX and TGA files, the original sound recordings) are not
in this folder and are available on request. Sounds were cut, trimmed and level-matched to short MP3s, a few variants
per key (`assets/sfx/index.json`). Textures are ambientCG 1K JPEGs. Animations: Rocketbox motion capture converted one
GLB per clip and gender (`assets/anims/`), plus Quaternius's Universal Animation Library (`assets/anim/`) for aiming,
firing, reloading, crouch-walking, hits and a death.

## Watch out

- Only one floor plan exists; the radar, lights and spawn code assume the grid you pass has `lights`.
- `parse()` only recognises the letters in its two strings; a letter missing there is silently floor.
- The hit test is spheres on bones (`PARTS` in `zombies.mjs`), not the mesh; a new body shape may need them moved.
