# Squirm: notes for an AI coder

A 2D canvas game in plain browser scripts: no modules, no build, no dependencies. `index.html` holds the page (styles,
the DOM for the eyepiece canvas and the right-hand rail) and loads the files in `src/` with ordinary `<script>` tags,
in order. Edit a file, refresh the page.

Every game file is an IIFE that hangs its functions on one shared object, `window.SQ` (called `S` inside each file).
`engine.js` and `gloss.js` expose `window.WormEngine` and `window.WormGloss`; `connectome.js` sets `window.CONNECTOME`.
Order matters: a file may only use what an earlier file defined at load time.

## Run it

```bash
npx serve .          # or python3 -m http.server; opening index.html from disk works too (no modules)
```

Saves live in `localStorage` under `squirm.*` (`S.store.get` / `S.store.set` in `core.js`).

## Code map (`src/`, in load order)

| file | what it is |
|---|---|
| `engine.js` | The connectome engine: `Connectome` (cells, synapses, `addNeuron`, `addSynapse`) and `Brain.tick` (Busbice's rule: a cell sums its input, fires its whole row past 30, resets; muscle sums drive left/right). Patched so added cells fire. |
| `gloss.js` | Cell names in plain words (`WormGloss.words('AVAL')`), by class prefix. |
| `connectome.js` | The data: `window.CONNECTOME = { neurons, muscles, table }`, 300 neurons and 3,689 weighted connections. Do not hand-edit. |
| `core.js` | Maths (`S.rr`, `S.ri`, `S.pick`, `S.dist`), input (`S.tapped('KeyE')`, held keys, mouse), the camera, synthesised sound (`S.sfx`), particles, `S.store`. |
| `creature.js` | The genome and body: **`S.PARTS`** (the part table), `S.PART_ORDER`, `S.makeGenome`, `S.randomGenome`, `S.statsOf` (parts → speed, health, bite…), `S.mutate` (nature's roll), `S.addCell` (a new nerve cell, spliced NEAT-style), `S.Creature` (the crawling body and how each part is drawn). |
| `hud.js` | The rail: specimen label, the brain panel (`S.drawBrain`), firing words, `S.setKeys`, `S.setStagePanel`. |
| `play.js` | What every stage shares: `S.newRun`, steering the player, `S.tickBrain` (what the body senses goes into the brain), biting, `S.checkpoint` (the save). |
| `editor.js` | The egg: spend DNA on parts, shape and colour, then `S.mutate` rolls. |
| `stage1.js` | **The Drop** (×400): `S.stage1`. |
| `stage2.js` | **The Crawl** (×40): `S.stage2`, five species, singing and hunting. |
| `stage3.js` | **The Swarm** (×1): `S.stage3`, two nests, lineages, scent, each creature with its own brain. |
| `main.js` | The frame loop, the title card, the cards between stages (`S.endStage`), `STAGES`, `S.startStage(n)`. |

## The stage contract

A stage is an object on `S` with:

- `id`, `name`, `mag` (the magnification shown on the dial)
- `enter(retry)`: build the world, place `S.player`, call `S.setBrain`, `S.setDial`, `S.setKeys`, build the rail panel
- `update(dt)`: one frame of rules; call `S.endStage({...})` when it is won or lost
- `draw(ctx)`: draw the world (the camera is `S.cam`; `S.toWorld` / screen helpers in `core.js`)
- `act(action, el)`: a click on a `[data-act]` button in the stage panel
- optional `peek()`: a plain summary for debugging in the console

`S.endStage({ eyebrow, title, body, stamp, next: 3 })` shows the card between stages; `next` is the stage the "Zoom out"
button starts. `final: true` ends the run; `retry: n` offers a retry of stage `n`.

## How to add things

### A body part (data, plus how it looks)

1. Add an entry to `S.PARTS` in `src/creature.js`:
   `fins: { name: 'Fins', slot: 'body', cost: 10, max: 2, cell: 'AVBL', desc: 'Faster in water.', latin: 'pinnata' }`.
   `slot` is `head`, `body` or `tail`; `cell` is the sensory or command cell the new nerve cell is spliced after (any
   name in `CONNECTOME.neurons`); `from: 2` hides it until stage 2.
2. Add its key to `S.PART_ORDER` (the editor lists parts in that order).
3. Give it an effect in `S.statsOf` (same file), e.g. `speed: … + k('fins') * 12`.
4. Draw it: add a `case 'fins':` to the part switch in `S.Creature`'s draw code (search `case 'horn':`), on the
   `under` or `over` layer.

### A species in the Crawl

`stage2.js` `st.enter` builds five species from `S.randomGenome` plus one fixed one (`epic`, "The Old One"), with nest
`spots` and temperaments `temps`. To add a sixth, add a spot to `spots`, a temperament, and raise the loop count; the
"settle four of five" rule is counted in the rail panel (search `settled`) and checked in `st.update` (search `doneShown`).

### A mutation

`S.mutate` in `src/creature.js` is a weighted list of `{ w, ok, run }`. Add one: `ok()` says whether it can apply to
this genome, `run()` changes the genome and returns `{ text, tone: 'good' | 'bad' | 'odd' }` for the hatching card.

### A stage

1. Make `src/stage4.js` that sets `S.stage4 = { id: 4, name: 'The Sky', mag: '×0' }` with `enter`, `update`, `draw`,
   `act` as above. Copy `stage1.js` for the skeleton.
2. Add `<script src="src/stage4.js"></script>` to `index.html` after `stage3.js` and before `main.js`.
3. In `src/main.js`, add `4: S.stage4` to `STAGES`.
4. In `src/stage3.js`, where it calls `S.endStage` on a win, set `next: 4` instead of `final: true`, and update the
   title card's ladder in `main.js` `title()`.

## Rules this game keeps

- The brain is real and always on screen. Never claim it does what it does not: in stage 3 the brain's turn output is
  mixed into wandering; hunger, scent and fights choose where a creature goes.
- With nothing to sense the table is silent, so while **B** is on, `S.tickBrain` pulses the food-smell cells on a
  20-step cycle (as Busbice did); the rail says so.
- Plain ES5-friendly JS in `engine.js` (no `Map`, no `for…of`), so it can run in older embedded runtimes.
