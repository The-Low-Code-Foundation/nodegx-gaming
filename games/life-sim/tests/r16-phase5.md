# Round 16 checks: more ways to live (roadmap phase 5)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase4.md](r16-phase4.md).
The browser pane was hidden, so the checks played time with `advance(minutes)` and filled needs by hand where a long
action was being timed. Skills, earning and the new careers are off on a test URL unless `?skills=1`.

## Skills from objects (5.1)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&skills=1&traits=sporty,neat,cheerful&traits2=lazy,foodie,shy&freewill=0`, each Sim works out once on the rug (30 min) | fitness 1.5 (sporty ×1.5) and 0.6 (lazy ×0.6) |
| each cooks once (30 min) | cooking 1.0 (neat) and 1.4 (foodie ×1.4) |
| the easel, keyboard, planter and workbench bought and placed (`placeExtra(spotFor(shopItem(id), …))`), each used once | painting 1.5, music 1.41 (cheerful ×1.2), gardening 1.2 (neat ×1.2), handiness 1.41 (neat ×1.25); the skills panel shows each from its first point |
| the tally | `workout`, `cook`, `paint`… and `levelUp` (the "Get better at something" wish) |
| the loo / tap / printer "fix it" odds (`chanceOf`, node) | neat: 0.60 at handiness 0, 0.81 at 3, 0.95 at 6 (capped); clumsy: 0.30, 0.51, 0.72 |
| the master chef's steps (`stepsDone`, node) | a meal cooked and cooking 3: 2 steps; cooking 8, the big oven and a party: all 6 |
| a plain test URL (`?seed=5&flatmate=7`) | the tables free will reads (offers, interactions, shop, careers, the old wishes) are the same as phase 4's (node, against commit af6505c); the only differences are behind the switch (the new wishes need skills, a workout pumps up a sporty Sim, the fixes' handiness field) |

Two runs of the same seeded URL in the browser drift apart once the real frame loop runs (phase 4's code too), so a
day's log can't be compared run against run; the tables were compared instead.

## Earning from skills (5.2)

| How | Expect |
|---|---|
| the easel, before painting | "Sell your paintings online" greyed: "No paintings yet" |
| two paintings (painting level 1, then 2), then sell | 7 + 10 = 17 coins; the pile empties; the tally counts `paintingSold` twice |
| the planter, tended twice on day 1 | grown 40% once (the second tend that day adds nothing); "Pick and sell" greyed "Not ripe yet" |
| tended on days 2 and 3 | 86%, then ripe (a toast); picked and sold for 22 coins at gardening level 3; back to 0 |
| the park, music level 1 | "Play for tips" greyed "Needs music level 2" |
| music level 3, an hour | +11 coins; cut short after half an hour, the share played (+6) |
| the notice board, handiness 0 | today's odd job ("Cleo needs a hand: a shelf to put up. Pays 27 🪙"), the button greyed "Needs handiness level 2" |
| handiness 2, "Send Ada to help" | Ada goes round to Cleo's, does the job (90 min), +27 coins, friendship +6; the button then says "Done today" |
| the artist dream (node) | offered only with skills on; 2 paintings sold and painting 3: 3 steps; 10 sold and painting 8: all 6 |

Pay next to the office (60 to 280 coins a day, plus about 5 to 15 a right answer): a painting 4 + 3 a level (an hour's
work), vegetables 10 + 4 a level every two or three days, busking 2 + 3 a level an hour, an odd job 15 + 6 a level, once
a day.

## New careers (5.3)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&skills=1&freewill=0`, the phone's jobs | three jobs: the office, kitchen helper at the Corner Café (50 a day, 11:00–17:00, Wed–Sun), lab assistant at the Bright Sparks lab (55, 10:00–16:00, Mon–Fri); without `?skills=1` only the office |
| take the café job | the café is built (22 things: four stations, three tables, a fridge, a sink) |
| Tuesday | at home all day |
| Wednesday | leaves at 10:30, at the café and working at 10:34 |
| each station (the till, the big oven, the spice shelf, the menu board) | its card has the café's name and job ("Add up the bills and give the change."), and three questions from the school year's bank in maths, science, geography, English |
| 12 right answers | +60 coins, cooking +3.6 (0.3 an answer), the promotion bar at 80% |
| 17:00 | home, +50 pay, promoted to junior cook |
| the café with free will on | between questions the cook serves the tables (7 times in a day) |
| the scientist | at the office at 10:30 on Monday, a desk of their own, the stations maths, science, geography and history only |

The vet is not built: it needs pets (5.4).

## Save v7

| How | Expect |
|---|---|
| `&save=1`: a painting to sell, the vegetables at 34%, today's odd job, skills, the easel and planter, a café job; then `/` and "Carry on" | all of it as it was |
| the same save loaded on a Tuesday, Wednesday next | the café is built as the game loads; the cook leaves at 10:30 |
| a v6 save (no side earnings, no new skills, an office job) | loads; side earnings start empty; written back as v7 |

## Performance

Mac (Apple Silicon, the app's browser pane, canvas 1024 × 768, pixel ratio 1), one frame = the household's
`sim.update`, the scene drawn and `gl.finish()`, 150 frames, median and 90th centile.

| Where | frame (median) | frame (90%) | draw calls | triangles |
|---|---|---|---|---|
| the flat | 2.1 ms | 2.5 ms | 273 | 125,600 |
| the flat with the easel, keyboard, planter and workbench | 2.1 ms | 2.4 ms | 307 | 126,700 |
| the café (two Sims) | 0.9 ms | 1.5 ms | 197 | 25,300 |
| the office, for comparison | 1.1 ms | 1.3 ms | 287 | 66,400 |

The four new things are made in code, their boxes merged into one mesh per material (before merging they cost 98 draw
calls; now 34). The café costs less than the office.

## Pets (5.4): not built

There are no animal models in `assets/` (CREDITS.md lists furniture, scenery and people; the ducks are made in code).
A model would have to be downloaded, so this waits for a yes: see the phase 5 report.

## Not checked this round

- The Surface tablet.
- Rain greying "Play for tips" (a test URL has no weather; it uses the same `off` list as feeding the ducks).
- A long game played for real, without the hooks (how often free will paints, plays or tends without a wish).
- The workout and charm wishes coming up and coming true in a real game (they use the same `did` path as the others).
- Two planters (they share one crop, by design).
