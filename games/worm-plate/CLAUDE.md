# The Worm Plate: notes for an AI coder

A single page in plain browser scripts: no modules, no build, no dependencies. `index.html` holds the styles (light
and dark themes as CSS variables on `:root`) and the DOM (the tab bar, the `#plate` canvas, `#plateCtl` buttons,
`#legend`, `#brain`, `#notes`), then loads four scripts in order. Edit a file, refresh.

This is a toy (readiness C): five tabs to watch and poke, no goal, no score. Turning it into a game means adding a goal
and a loop first; Squirm (`games/squirm` in the same repository) is one way that was done.

## Run it

```bash
npx serve .        # or python3 -m http.server; opening index.html from disk works too
```

`index.html#3` opens tab 3. `localStorage` keys: `worm-plate-level` (last tab), `worm-plate-stance-<n>` (debate answers).

## Code map

| file | what it is |
|---|---|
| `src/engine.js` | `window.WormEngine`: `Connectome` (names, `rowT`/`rowW` adjacency, `clone`, `addSynapse`, `addNeuron`, `cutOutputs`) and `Brain` (`tick`: Busbice's rule, a cell sums weighted input and fires its whole row past 30, then resets; muscles never fire; left/right muscle sums give `speed` and `turn`), plus the stimulus sets Busbice used. Plain ES5. |
| `src/gloss.js` | `window.WormGloss.words(name)`: a cell name in plain words, by class prefix. |
| `src/connectome.js` | `window.CONNECTOME = { neurons, muscles, table }`. Data; regenerate with `tools/extract.py`, never hand-edit. |
| `src/app.js` | Everything on the page. Helpers at the top (`rr`, `ri`, `dist`, `clearPlate`, `drawWorm`, `button`, `readout`), then one object per tab: `L1` (Braitenberg vehicle), `L2` (touch circuit), `L3` (the full 302, with `Worm302`, `makeCellGrid`, `paintCells`, slow-mo controls), `L4` (evolution plate: `reset`, `spawn`, `mutate`, `learn`, `stepPlate`, `promote`, `drawChart`), `L5` (the debate: `LENSES`, `LENS_TEXT`, `STANCES`, `renderLenses`). At the bottom, `levels`, `show(n)` and the frame `loop`. |
| `tools/extract.py` | Rebuilds the connectome JSON from Busbice's `connectome.py` (download it into an empty folder first): `python3 -I tools/extract.py connectome.py connectome.json`, then wrap it as `src/connectome.js`. |

## The tab contract

A tab is an object with:

- `name`
- `enter()`: fill `ctlEl` (buttons under the dish), `legendEl`, `brainEl` (the right panel) and `notesEl` (the text
  under the bench); reset its own state
- `tick()`: one simulation step (called every frame from `loop`, more often in fast-forward)
- `draw()`: paint the dish on `ctx` (call `clearPlate()` first; the dish is centred at `CX, CY` with radius `PR`)
- `click(x, y)`: a click on the dish, in canvas pixels
- optional `brainDraw()` for a live brain panel

Colours come from CSS variables, read into `T` by `readTokens()` (`T.food`, `T.harm`, `T.patch`, `T.fire`…), so both
themes work.

## How to add things

### A tab

1. In `src/app.js`, write `var L6 = { name: 'my tab', enter: function () {…}, tick: function () {…}, draw: function () {…}, click: function (x, y) {} };`
   before the `/* the bench */` section. Copy `L1` for the smallest working example.
2. Add it to `levels`: `var levels = { 1: L1, …, 5: L5, 6: L6 }`.
3. Add a tab button in `index.html` inside `<nav class="levels">`: `<button role="tab" data-level="6" aria-selected="false">6 · My tab<small>subtitle</small></button>`.
4. The saved-tab and `#hash` checks at the bottom of `app.js` accept 1 to 5; raise the 5.
5. If the debate should cover it, add a `6:` entry to `LENS_TEXT` and a column in `L5.enter`'s table.

### A mutation on the evolution plate

`L4.mutate(child)` picks a kind by `rnd()` bands (weight change, new synapse, new cell, learning rate). Add a band,
change `child.conn` (a `Connectome`), set `text` for the worm's mutation list, and set `structural = true` if it should
start a new coloured lineage.

### A stimulus

Senses reach the brain as cell names stimulated before `brain.tick()`; see `Worm302` (food smell fires the eight
chemosensory cells, a nose touch fires ten, the toxic patch fires ASH). Add a thing to `env` in `L4.reset`, draw it in
`L4.draw`, and stimulate the matching cells in the worm's step.

## Known limits

- `Connectome.addNeuron` appends the new cell after the muscles, and `Brain.tick` only lets cells below `neuronCount`
  fire, so a cell added by the "new cell" mutation never fires (in effect it cuts the synapse it was spliced into).
  Squirm's copy of `engine.js` fixes this by recording where the muscles end; port that fix if you build on tab 4.
- The full table does not make a worm steer to food or back away from a nose touch on its own. The page says so; keep
  it honest.
