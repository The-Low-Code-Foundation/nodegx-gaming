# Le Gala de danse: notes for an AI coder

A maths game shaped like The Sims: the player prepares a dance school's gala night in a side sheet (one tab per
problem), then watches a 3D day play out. The day is computed first by a pure function (`simulate` in
`src/engine.js`), and the 3D view only plays back its schedule. Nothing is graded with a tick: the consequences show
(late finish, sleepy little ones, bumped dancers, no cake left), and "Pourquoi ?" opens the sum.

## Run it

```bash
npx serve .                         # or python3 -m http.server 8000
node --test tests/*.test.mjs        # the engine and music tests, about a second, no browser
```

ES modules + an import map (`three` → `./vendor/three.module.js`). No build, no install. The save is
`localStorage['gala-game-v2']`. `window.__game` in the console exposes the state and helpers
(`simulate`, `setTab`, `beginRun`, `nextSeason`, `fastForward`, `run`, `dancers()`…).

## Code map

| File | What it does |
|---|---|
| `src/data.js` | **Everything the game knows, as rows**: `RULES` (the day's times and constants), `CLASSES` / `CLS`, dancer `NAMES`, `NUMBERS` (each dance: class, bpm, counts, style, mood, theme), `STYLES`, `MOVES`, `OUTFITS`, `HAIRS`, `SHOES`, `ACCS`, `PIECES` (dressing-room furniture and their `fx`), `SNACKS`, `UPGRADES` (the shop), `BACKDROPS`, `PARKING`, `SEASONS` / `seasonRules(season)`, `START`. `applyRows(over)` overlays changed rows. |
| `src/plan.js` | The starting plan: `FORMATIONS`, `ROUTINES`, `COSTUMES` per number, `defaultPlan()`, `defaultSchool()`, and `ARRIVALS` + `addSeasonNumbers()` (which numbers a season adds, and where in the programme). |
| `src/engine.js` | **The day as a pure function.** `simulate({ plan, school, season, mode, seed })` returns verdicts, each dancer's schedule, the points and a trace. Judges: `programme` (running order, hair, changes), `judgeSpacing`, `judgeMusic`, `classState` / `execution` (energy, hunger, nerves, slips), `judgeGouter` (snacks), `judgeParking`, `analyseLoge` (the dressing room). No DOM, no three.js. |
| `src/state.js` | The global `G` and the save (`load`, `save`). |
| `src/ui.js` | The side sheet: `TABS()`, one `paintX` per tab (`paintOrder`, `paintFormation`, `paintGouter`, `paintCostumes`, `paintBuild`, `paintParking`, `paintShop`, `paintNotebook`), the live evening (`paintRunSheet`), the verdict cards, the shop (`buy`), `nextSeason`, `showIntro`. |
| `src/i18n.js` | Every sentence, `TXT.fr` and `TXT.en`; `t()` returns the current language. The default school name is `TXT.*.school`. |
| `src/world.js` | The three.js school, stage, curtains, lights, dressing room, car park, camera. |
| `src/people.js` | The box-people dancers and their costumes. |
| `src/play.js` | Playback: places each dancer from the engine's schedule, the dance moves as poses. |
| `src/tunes.js`, `src/music.js` | Each number's music as notes (`TUNES`, `score(id)`), and the Web Audio player. |
| `tests/` | `engine.test.mjs` (the opening plan is wrong in the intended ways; seasons 1 to 3 can be solved), `music.test.mjs`, `rows.test.mjs` (`applyRows`). |

## Readiness: B

Content is rows (`src/data.js`): add a costume, a move, a piece of furniture, a snack or a shop item and nothing else
changes. A new **dance number** is a few rows across `data.js`, `plan.js` and `tunes.js`. A new **challenge** (a new
kind of problem, as season 2's car park was) is engine code + a tab + sentences, as below. There is no level format:
seasons are `SEASONS` + `seasonRules()` + `ARRIVALS`, in code.

## How to add content (rows only)

- **A costume**: a row in `OUTFITS` (`{ min, price?, fr, en, icon, themes }`; `min` = minutes to change into it,
  `themes` = the numbers it suits). Draw it in `src/people.js` (look for how `'lapin'` or `'tutu'` is built), or it
  falls back to the plain body.
- **A move**: a row in `MOVES` (`c` counts 4 or 8, `d` difficulty 1 to 3, `a` / `b` the level it starts and ends on:
  0 floor, 1 standing, 2 in the air; `dx` / `dz` travel in metres; `st` its styles or `'*'`; `icon`, `fr`, `en`);
  its pose in `src/play.js`.
- **Furniture**: a row in `PIECES` (`{ w, d, wall?, flat?, icon, fx, price?, fr, en }`). `fx` uses the effects the
  engine already reads (`postes`, `rail`, `seats`, `calm`, `shoes`, `screen`, `water`, `fruit`, `fan`, `doudous`,
  `sieste`, `barre`, `clock`, `music`); a new effect needs a line in `classState` / `analyseLoge` in `src/engine.js`.
- **A shop upgrade**: a row in `UPGRADES`; what it does is read by name in the engine (`school.upgrades.<id>`).

## How to add a dance number

1. `NUMBERS` in `src/data.js`: `X1: { cls, bpm, counts, style, mood, theme, fr, en }`. `counts × 60 ÷ bpm` = seconds.
2. `src/plan.js`: its starting formation (`FORMATIONS` is per class), `ROUTINES.X1` (moves + repeats), `COSTUMES.X1`.
   To have it from the start, add its id to `defaultPlan()`'s `numbers` loop and `order`; to have it arrive with a
   season, add it to `ARRIVALS`.
3. `src/tunes.js`: a `TUNES.X1` entry (title, by, lines of notes). `tests/music.test.mjs` checks every number has one
   that fills its counts.
4. `node --test tests/*.test.mjs`, then play a rehearsal.

## How to add a gala challenge (a new season)

Example: season 5, "the tickets" (sell seats at a price so the hall is full and the costumes are paid for).

1. **The rules**: in `src/data.js` add `{ n: 5, icon: '🎟️', adds: ['tickets'] }` to `SEASONS`, `tickets: season >= 5`
   to `seasonRules()`, and the constants in a `TICKETS = { … }` row (add it to `ONE_ROW` so `applyRows` can tune it).
2. **The plan**: the player's choices go in `defaultPlan()` in `src/plan.js` (e.g. `tickets: { price: 5, seats: 120 }`).
   Older saves will not have it: default it where you read it.
3. **The judge**: in `src/engine.js`, write `judgeTickets(plan, school, rules)` returning the numbers and `ok`, like
   `judgeParking`. Call it in `simulate()` next to `judgeParking`, add its effect on the parents (`sat.push([...])`)
   and its points (`pts.push(['tickets', ok ? 10 : 0])`), and return it with the other verdicts.
4. **The tab**: in `src/ui.js`, add `'tickets'` to `TABS()` behind `rules().tickets`, write `paintTickets()` (copy
   `paintParking`), add it to the tab map in `paintSheet()`, and a verdict card where the others are built
   (`card(t().vPark, …)`).
5. **The words**: in `src/i18n.js`, in both `TXT.fr` and `TXT.en`: the tab name in `tabs`, the season intro in
   `intro[5]`, the verdict lines.
6. **The 3D** (optional): show it in `src/world.js` (a ticket booth) and drive it from the schedule in `src/play.js`.
7. **A test**: in `tests/engine.test.mjs`, that the default plan fails it and a solved plan passes.

## How to retarget the maths

The maths lives in the rules' numbers, not in questions: durations and clock times (`RULES`, `programme`), counts
and tempo (`NUMBERS`), spacing in metres (`CLS[*].span`, `judgeSpacing`), kcal and centilitres (`CLS[*].kcal`,
`juice`, `judgeGouter`), rates and areas (`PARKING`, `judgeParking`). For younger players, make the numbers rounder
(bpm 120, counts multiples of 32, spans of 1 m or 2 m) or switch off a judge; for older ones add a cost per thing and
a budget.

## Things to know

- `simulate` must stay pure and deterministic for a given seed: the tests and the "Pourquoi ?" sums rely on it.
- The rehearsal never rolls dice; a try-out and the gala do (`mode`).
- The school's name is the player's (`school.name`, the Build tab); the default comes from `t().school`. The dancers'
  names (`NAMES`) are invented.
- The page loads three fonts from Google Fonts; offline it falls back to system fonts.
