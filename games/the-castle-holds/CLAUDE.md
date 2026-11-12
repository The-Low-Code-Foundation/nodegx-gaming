# The Castle Holds: notes for an AI coder

One file: `index.html` (about 185 KB) holds the styles, the DOM and one `<script type="module">` that imports three.js
from `./vendor/three/three.module.js` (r186, which loads `three.core.js` beside it). No build, no other dependencies.
Edit the file and refresh. Serve the folder (`npx serve .`); a `file://` open will not load the module.

Identifiers and save data are in French (the game was written French-first): `coureur` = goblin, `costaud` = golem,
`volant` = bat, `fleche` = arrow, `arbalete` = crossbow, `glace` = ice, `bombe` = bomb, `feu` = fire, `oui` / `non` =
yes / no, `vague` = wave, `porte` = gate. Every word a player sees is in `TXT.fr` and `TXT.en`.

Saves: `localStorage['castle-toy-v7']` (`load`, `save`, `normalise`, `fromV3` convert older saves). In the console,
`window.__toy` (end of the script) exposes test hooks such as `setStage(n)` and `S` (the save).

## Code map (inside the script, top to bottom)

| section | what it is |
|---|---|
| `TXT` | All UI text, `fr` and `en`, including node names (`nodes`), their help (`nodeHelp`), enemy names and tips (`advice`), and the castle parts built per stage (`parts`). `t()` returns the current language. |
| Look tables | `HAIRSTYLES`, `HATS`/`HAT_COST`, `ACCS`, `WEAPONS`, `ARMOURS`, `MOUNTS`/`MOUNT_COST`, `CUTS`, `FACES`, `SKINS`, `HAIRS`, `PRESETS`, `randomLook`. |
| **`ENEMY`** | Monster stats: `hp`, `speed`, `pts`, `h`, `fly`, and behaviours `hunt` (leaves the path for a defender), `melee`, `shoot`, `boom`. |
| **`ACTION`** | Weapon stats: `dmg`, `cd`, `range`, `fly` (can it hit flyers), `splash`, `slow`/`dur`. `pierre`/`boulet` are the machines' ammo. |
| Rules constants | `AVATAR_ARMS`, `NODE_UNLOCK` (which weapon unlocks after how many castle parts), `LEAKS` (3 through = lost), `DEF_HP`, `ENGINE_*`, `RECRUIT_COST`, `UP_COST`, `TIERS` and `tierOf` (the castle widens at stages 4 and 8), `PATH_OPEN` (paths open at stages 1, 1, 4, 6). |
| **`waveFor(stage)`** | The waves: a formula, not a list. `5 + stage * 2` monsters, kinds mixed in by stage, an ogre king every 5th stage. |
| `MODELS`, `STAGE_MODEL`, `modelBoard` | Ready-made boards; stages 1–3 open with one filled in. A board is `{ viser, nodes: [{ id, kind: 'sensor'|'cond'|'action', type }], wires: [{ from: [id, port], to: [id, port] }] }`. |
| `CASTLE_SENSORS`, `CASTLE_ACTIONS`, `CASTLE_NEEDS` | The castle's own board (drawbridge, bell, infirmary). |
| `GRID`, `BLOCKS`, `BASE_VILLAGERS` | The village grid and its buildings (`maison`, `ferme`, `atelier`, `pontlevis`, `cloche`, `infirmerie`). |
| `newGame`, `prefill` | A new save; boards pre-filled with advice for the coming wave (`ADVICE_ARMS`). |
| Scene | Materials `M`, `planked`, the paths `P_LEFT`/`P_WEST` → `PATHS` (Catmull-Rom curves), `plantForest`, `showWalls`, `PART_SPEC` and `showConstruction`, `SPOTS` (defence places), `showVillage`, `showBridge`. |
| People | `makeAvatar(look)`, `walkPose`, villagers (`makeVillager`, `stepVillagers`, `stepWalk`). |
| Monsters | **`makeMonster(kind)`** (one `if (kind === …)` branch per monster), `makeEnemy`, `spawn`, `stepEnemy`, `placeEnemy`, `hit`, `explode`, `enemyShoot`. |
| Defence | `fire`, `splash`, `stepShots`, `placeDefenders`, `pickTarget`, `hurtDef`, `faint`, `revive`, **`isTrue`** (the conditions), **`runBoard`** (walks a board's wires for one enemy), the castle's `castleEvent`/`castleAct`. |
| Waves | `startWave`, `stepWave`, `endWave(held)` (points, the part built or collapsed, unlocks, the next stage). |
| Camera | `viewPoints`, `setCamView`, `viewSpec`, `placeCamera`, the view bar. |
| Screens | `showScreen`, the title, dress, plan (the board editor), build, wave and result sheets; `hud()`. |

## How to add things

### A monster

1. Add stats to `ENEMY`: `troll: { hp: 14, speed: 2, pts: 20, color: 0x556b2f, h: 3.4, fly: false }`.
2. Give it a body: a new `if (kind === 'troll') { … }` branch in `makeMonster`, built like the others from `box`/`limb`
   and pushed into `legs`/`arms`/`flash` so it walks and flashes when hit. (Without a branch it gets no body.)
3. Name and help text in both `TXT.fr` and `TXT.en`: `enemies.troll`, `enemyHelp.troll`, `advice.troll`, and an entry in
   `ADVICE_ARMS`.
4. Put it in waves: add a rule in `waveFor` (e.g. `if (stage >= 7 && r === 7) kind = 'troll';`).

### A weapon (an action card)

1. Add to `ACTION`: `eclair: { dmg: 5, cd: 2, range: 12, fly: true }`.
2. Add it to `AVATAR_ARMS` and give it a stage in `NODE_UNLOCK`.
3. Text: `nodes.eclair` and `nodeHelp.eclair` in both languages.
4. If it does something other than damage (like `glace` slows or `alarme` marks), handle its type in `fire`.

### A condition card

1. Add a test to `isTrue`: `blesse: (e) => e.hp < e.hpMax / 2`.
2. Offer it in the plan screen's card list (search `for (const c of ['vole', 'rapide', 'gros', 'proche'`).
3. Text: `nodes.blesse` and `condTip.blesse` in both languages.

### Waves as data (the first job for a level format)

Replace `waveFor(stage)` with a lookup into a table, keeping the formula as the fallback:

```js
const WAVES = { 1: ['coureur', 'coureur', 'coureur', 'coureur', 'coureur', 'coureur', 'coureur'], 2: [ … ] };
function waveFor(stage) { return WAVES[stage] ? [...WAVES[stage]] : formulaWave(stage); }
```

Then move `ENEMY`, `ACTION`, `WAVES` and `BLOCKS` into a `levels.js` module next to `index.html` and import it, so a
person can make levels without opening the engine.

### A building

Add to `BLOCKS` (cost, `once`), a mesh branch in `makeBlock(type)`, and `blocks`/`blockHelp` text in both languages.
If it should unlock a castle action, add it to `CASTLE_NEEDS`.

## Rules this game keeps

- Two players share one screen and must both hold; there is no score against each other.
- Losing costs the part under construction, never the save.
- Every new word goes into both `TXT.fr` and `TXT.en`.
- Defenders have names the players type; default names are empty and fall back to "Player 1" / "Player 2".
