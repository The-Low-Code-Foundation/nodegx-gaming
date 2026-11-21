# Château Lumière: notes for an AI coder

A 3D (three.js) third-person game: walk a château, open a door, fight its cursed creatures in a turn-based battle where
every spell is a school question, win the room, unlock its reward. Static: no build, no npm.

## Run it

```bash
npx serve .          # or python3 -m http.server 8000
```

Open the printed address. `file://` will not work (ES modules). There is no test suite in this folder; check a change
by playing it. `node --check src/<file>.mjs` catches syntax errors. Add `?mute=1` to the URL to start silent. The save
is `localStorage['lumiere.save.v1']`; clear it (or "Start a new château…" in the pause menu) to replay from the start.

## Code map

| File | What it does |
|---|---|
| `index.html` | The page: every overlay (title, HUD, battle menu, question card, wardrobe, bake, books, piano, dance) as plain HTML, and the import map (`./vendor/...`). The round 3 mini-games build their own panel in JS. `style.css?v=…`: bump it when the CSS changes a lot, so browsers drop the old copy. |
| `style.css` | All the UI styling. |
| `src/main.mjs` | The game: the save (`freshSave`, `loadSave`, `persist`), places (`placeFor`, `setPlace`, `enter`, `backToHub`), walking and the camera (`moveHero`, `collide`, `updateCamera`), door cards (`nearby`, `dangerLine`), fights (`startBattle`), rewards (`reward`), the title and pause menu, the mini-game launchers (`openWardrobe`, `openBake`, `openBooks`, `openPiano`, `openDance`, and `playMini()` for the round 3 ones: `openToys`, `openPaint`, `openStars`, `openFlowers`, `openPony`), the staircase walk (`climb(up)`), the frame loop. It imports `upstairs.mjs` and `grounds.mjs` only for what they register. |
| `src/data.mjs` | **The rules as data**: starting stats, `DEPTHS` (how hard each depth hits), `ROOMS`, `HUBS`, `HUB_LINKS` (which hall door leads to which hub, and which won room opens it), `REWARDS`, `CREATURE_NAMES`, `FREED`, `ITEMS`, `WARDROBE`, `TIMERS`. `stats(save)` adds up what the won rooms give. |
| `src/castle.mjs` | Builds every place in code: `buildHall` (with the Grand Staircase and the front doors), `buildGallery`, `buildRoom(id, spec)` from `ROOM_SPECS[id]` (size, wall/floor textures, windows, sconces, battle positions, `furnish` function, or `outdoor(ctx)` for a room with no walls), `makeHub(...)` for a new hub, and one `furnishX` function per room. `buildPlace(id)` is the entry point. Other files add places with `addPlaces({ id: builder })` and rooms with `addRooms({ id: spec })`, using the helpers in `kit`. |
| `src/upstairs.mjs` | Round 3, the first floor: `buildLanding` (the Starlit Landing, its stairwell going down) and the Nursery, the Painting Studio and the Royal Bedchamber (`furnishNursery`, `furnishStudio`, `furnishBedchamber`). |
| `src/grounds.mjs` | Round 3, outside: sky, grass, hedges, fountain (`outdoors()`), `buildGarden` (the Gardens hub, in front of the château), the Rose Garden and the Stables, the flower bed (`flowerBed`, `SEEDS`). |
| `src/toys.mjs`, `src/paint.mjs`, `src/stars.mjs`, `src/flowers.mjs`, `src/pony.mjs` | The round 3 mini-games: pairs (`DECKS`), colouring by number or by sums (`PICTURES`), joining stars by counting in 1s–10s (`SKIES`), finishing a flower pattern then a times-table sum (`BEDS`), grooming the pegasus (`PONY_OPTIONS`). Each is `open(api)` → a Promise, and sets `window.__game.mini` to a handle for testing. |
| `src/creatures.mjs` | The creatures, drawn in code: classes `Moth`, `Soot`, `Grimoire` (`MAKERS`), recoloured `VARIANTS`, and `makeCreature(kind)`. Each has `wake()`, `hurt()`, `attack(target)`, `free()`, `update(dt)`. |
| `src/battle.mjs` | The turn-based fight: command window, question card with a clock, damage, knock-out, win. Calls `ask()` / `record()` from `src/school/school.mjs`. |
| `src/hero.mjs` | The heroine: loads `assets/vrm/sample-slim.vrm`, retargets Quaternius's animations onto it (`src/retarget.mjs`), dresses her (`wear`, `dye`), the cape cloth. |
| `src/school/school.mjs` | **The question picker**: `SKILLS`, `TOPICS`, `YEARS`, `topicsFor(subject, year)`, `ask({subject, topic, year})` returns `{ prompt, choices, answer, explain }`. |
| `src/school/rocket.mjs` | Generated question bank + engine (from the Rocket School template): 129 skills. Treat it as read-only data; add new skills in your own file (below). |
| `src/school/france.mjs` | Hand-written geography banks (France, Europe, the world): the simplest example of a question bank. |
| `src/school/stem.mjs`, `strings.mjs` | Little science/lab questions, generated from numbers. |
| `src/books.mjs` | Archivist Hoot's bookshelf: `BOOKS`, each `{ id, title, colour, ink, pages: [html…], ask: { q, options, a } }`. |
| `src/piano.mjs` | The piano mini-game: `KEYS`, `SONGS`. |
| `src/dance.mjs` | The rhythm dance: `LANES`, `DANCES`. |
| `src/cake.mjs`, `src/biscuit.mjs` | The bakes (3D cake/biscuits built from the options picked). Options are `CAKE_OPTIONS` / `BISCUIT_OPTIONS`. |
| `src/friends.mjs` | The castle characters (chefs, Hoot, Fig, Madame Lune, Captain Buttons, the Diary, Basile the gnome, Étoile the pegasus), drawn in code. |
| `src/exterior.mjs` | The château outside, on the title screen. |
| `src/fx.mjs`, `src/look.mjs`, `src/face.mjs`, `src/audio.mjs` | Spell effects, post-processing and quality, the heroine's face, synthesised sound (no audio files). |

## Readiness: B

The numbers and the room list are data (`src/data.mjs`) and the questions are data (`src/school/`). But a room's 3D
look is a function (in `src/castle.mjs`, `src/upstairs.mjs` or `src/grounds.mjs`), and each hub's doors are placed by
hand next to it, so a new room needs code in two places. If you plan many rooms, first turn `ROOM_SPECS` + the
`doorSpots` objects into one data table.

Four hubs: the Grand Hall, the Swan Gallery (through the wing door, once the Library is won), the Starlit Landing (up
the staircase, once the Ballroom is won) and the Gardens (through the front doors, open from the start).

## How to add a room

Example: a Greenhouse off the Swan Gallery, with two creatures.

1. **The rules**: in `src/data.mjs`, add to `ROOMS`:
   ```js
   { id: 'greenhouse', hub: 'gallery', name: 'The Greenhouse', depth: 3, creatures: ['nibble', 'offkey'],
     blurb: 'Glass, ivy, and something rustling in the orchids.', reward: 'seeds' }
   ```
   `hub` is `'hall'` (the default), `'gallery'`, `'landing'` or `'garden'`. `depth` 1–5 picks the hit/health row in `DEPTHS`; `hp` overrides the
   creatures' health.
2. **The reward**: add `seeds` to `REWARDS` in the same file: `{ title, text, gives: { maxHp: 30 } , item?, opens?, icon }`.
   `gives` can carry `ward`, `power`, `maxHp`, `maxMp` (see `stats()`). `opens` names a mini-game key; leave it out
   for a reward that is only stats.
3. **The creatures' names**: every id in `creatures` needs a line in `CREATURE_NAMES` and `FREED` (`src/data.mjs`).
4. **The room's look**: in `src/castle.mjs` (or, for an upstairs or outdoor room, in `src/upstairs.mjs` / `src/grounds.mjs`, registered with `addRooms`), write `function furnishGreenhouse({ scene, mood, M, blockers, updates, W, D, H })`
   (copy `furnishTea` as a start; push `{ x, z, r }` circles into `blockers` for things she must walk round; return a
   `feature` `{ kind, x, z }` if the room has something to use once won). Then add `greenhouse` to `ROOM_SPECS`, copying
   `tearoom`'s entry: change `W/D/H`, `shell` (floor/wall textures `parquet()`, `tiles()`, `marble()`, `damask(ink, light, key)`),
   `windows`, `sconces`, `battle` (`hero: [x, z]`, one `foes` entry per creature, `camera`, `look`) and `furnish: furnishGreenhouse`.
5. **The door**: in `buildGallery()` (`src/castle.mjs`), add `greenhouse: { x, z, ry }` to `doorSpots` on a free wall.
   For a Hall room, the `doorSpots` in `buildHall()`; for the Landing or the Gardens, `buildLanding()` / `buildGarden()`. The id must equal the room id: `nearby()` in `src/main.mjs` looks
   the door up with `roomById(d.id)`.
6. **The hub text**: the `LINKS` map in `src/main.mjs` holds the card text for the wing door and the staircase (it names
   the rooms behind them); update it. Every hub and its rooms are preloaded on the loading screen, so nothing else to do.
   A whole new hub: a builder registered with `addPlaces` (copy `buildLanding`, using `kit.makeHub`), its name in
   `HUBS`, how to reach it in `HUB_LINKS`, and its exit line in `EXITS` (`main.mjs`).
7. **A mini-game for it** (optional): copy `src/flowers.mjs` (a side panel on the right, `open(api)` returning a Promise).
   Launch it with `playMini(Module, extra, [x, z, face, camera, look])` in `src/main.mjs`, add an entry in the `OPEN` map in
   `reward()` and a `f.kind === '…'` branch in `nearby()`. The panel covers the right of the screen, so the `furnish`
   function's feature carries a `view: [camera, look]` that puts the heroine and her friend in the left part.
8. Play: clear the save, win your room, check the door card, the fight positions and the bright version.

## How to add a creature

- **A recolour** (cheapest): add to `VARIANTS` in `src/creatures.mjs`: `thorn: { base: 'moth', tint: 0x2f8a3a, amount: 0.7, scale: 1.2 }`,
  then its `CREATURE_NAMES` / `FREED` lines in `src/data.mjs`.
- **A new kind**: write a class with the same methods as `Moth` (`group`, `wake`, `hurt`, `attack`, `free`, `update`),
  add it to `MAKERS`.

## How to change the questions (the curriculum)

Every fight question comes from `ask()` in `src/school/school.mjs`, which draws from `SKILLS`. A skill is
`{ id, year, subject, topic, generator, params, name, strategy, diff? }`; `year` is one of `YEARS`
(`CP, CE1, CE2, CM1, CM2, 6e, 5e`: French school years, about ages 6 to 12); a year asks its own skills and those of
the two years before.

**Only the times tables, say 6 to 9:** in `school.mjs`, filter the list:
```js
export const SKILLS = [...ROCKET_SKILLS, ...FRANCE_SKILLS, ...LAB].filter((s) => s.topic === 'tables' && s.params.table >= 6);
```
and set `DEFAULT_YEAR` / the title's default subject (`freshSave()` in `main.mjs`: `chooser: { year, subject: 'maths', topic: 'tables' }`).
The engine's `table` generator takes `params: { table, min, max, bothWays }`, so a 12 times table is one more skill:
`{ id: 'table-12', year: 'CM1', subject: 'maths', topic: 'tables', generator: 'table', params: { table: 12, min: 1, max: 12, bothWays: true }, diff: 0.6, name: '12 times table', strategy: '12 × n is 10 × n plus 2 × n.' }`.

**A new subject or your own question set** (spelling, Spanish, dinosaurs…): copy `src/school/france.mjs`. Write items
with its `item(q, a, wrongOptions, note)` helper, export `MY_SKILLS` made with its `bank(...)` helper and `MY_TOPICS`,
then in `school.mjs` spread them into `SKILLS` and `TOPICS`. A new subject id also goes in `SUBJECTS` and in the
`NAMES` map of `chooser()` in `main.mjs` (its button label). The `list` generator asks four-choice questions from the
items and asks the ones not yet answered right more often.

**Other years or another country's school system:** change `YEARS` in `src/school/rocket.mjs` (and `stem.mjs`) and the
`year` of each skill; `DEFAULT_YEAR` in `school.mjs`.

**Questions that are not school work at all:** `ask()` only has to return `{ skill: { id }, prompt, choices, answer }`
(`answer` = index into `choices`, `explain` optional), so you can replace its body with anything.

Hoot's books (`BOOKS` in `src/books.mjs`) carry one question each in `ask`; add a book by adding an entry.

## Things to know

- Text is English, written into the code and `index.html` (no i18n layer).
- The heroine model is pixiv's VRM sample; any VRM 1.0 model can replace `assets/vrm/sample-slim.vrm` if its licence
  allows. The animations are retargeted by bone name (`src/retarget.mjs`).
- No server calls. The only network use is the Google Fonts stylesheet in `index.html`; offline it falls back to system fonts.
- Test handles: `window.__game` (`enter(id)`, `climb(up)`, `answer(right)` in a fight, `mini` while a mini-game is open).
  URL switches: `?fresh=1` (a new game, nothing read from or written to the save), `?won=dressing,kitchen` (rooms already won), `?at=landing` (start there),
  `?mute=1`, `?timer=off`, `?quality=low`.
- Comments in the code mention "rounds" and "the life sim": the game was built in rounds inside the NodeGX repo, where
  it shared the heroine with another prototype. Nothing depends on that.
