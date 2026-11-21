# Round 16 checks: more ways to live (roadmap phase 5)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase4.md](r16-phase4.md).
The browser pane was hidden, so the checks played time with `advance(minutes)` and filled needs by hand where a long
action was being timed. Skills, earning, the new careers and pets are off on a test URL unless `?skills=1`.

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
| the phone's jobs, with the vet | four jobs; kennel helper at the Happy Paws vet's (55 a day, 09:00–15:00, Tue–Sat) |
| take the vet job | the vet's is built (21 things: four stations, two kennels, the exam table with the dog on it, two cats in the kennels, a fridge, a sink, three chairs) |
| Monday | at home all day |
| Tuesday | leaves at 08:30, at the vet's at 08:35 |
| each station (the reception desk, the exam table, the animal atlas, the care cards) | its card has the vet's name and job ("Weigh the animals and work out how much food they need."), the subjects maths, science, geography, English |
| 12 right answers | +60 coins, charm +2.4 (0.2 an answer), the promotion bar at 73.5% |
| the vet's with free will on, to 15:00 | between questions the vet sees to the patients at the kennels (6 times), with a snack and a phone call between |
| 15:00 | home at 15:09, +55 pay, promoted to vet nurse |
| a look at the room (a still rendered from the page) | the dog standing on the exam table along its length, the cats side on in the kennels, the four signs, the tiles behind the table |
| a plain test URL | the phone's jobs: the office only |

## Save v7

| How | Expect |
|---|---|
| `&save=1`: a painting to sell, the vegetables at 34%, today's odd job, skills, the easel and planter, a café job; then `/` and "Carry on" | all of it as it was |
| the same save loaded on a Tuesday, Wednesday next | the café is built as the game loads; the cook leaves at 10:30 |
| a v6 save (no side earnings, no new skills, an office job) | loads; side earnings start empty; written back as v7 |
| `&save=1&skills=1`: a dog adopted and named Toffee, its hunger set to 33; then `/` and "Carry on" | one pet: the dog Toffee, hunger 32 (a little time passed), its basket at (1.4, 1.2), drawn and walking |
| that save made v6 again (no `pets`, no `side`, the basket taken out of the furniture), planted from the start screen | loads with no pet and no basket; written back as v7 with `pets: []` |
| `&save=1&skills=1`: the vet job and a cat; then `/` and "Carry on" | the vet's is built as the game loads (21 things); the cat is home |

## Performance

Mac (Apple Silicon, the app's browser pane, canvas 1024 × 768, pixel ratio 1), one frame = the household's
`sim.update`, the scene drawn and `gl.finish()`, 150 frames, median and 90th centile.

| Where | frame (median) | frame (90%) | draw calls | triangles |
|---|---|---|---|---|
| the flat | 2.1 ms | 2.5 ms | 273 | 125,600 |
| the flat with the easel, keyboard, planter and workbench | 2.1 ms | 2.4 ms | 307 | 126,700 |
| the café (two Sims) | 0.9 ms | 1.5 ms | 197 | 25,300 |
| the office, for comparison | 1.1 ms | 1.3 ms | 287 | 66,400 |
| the flat (5.4, again, as the base for the next row) | 2.2 ms | 2.8 ms | 272 | 125,600 |
| the flat with a cat and its basket (the pet walking: its mixer and `drawPets` in the frame) | 2.3 ms | 2.6 ms | 288 | 127,500 |
| the vet's (nobody there) | 2.1 ms | 2.5 ms | 207 | 15,300 |

The four new things are made in code, their boxes merged into one mesh per material (before merging they cost 98 draw
calls; now 34). The café costs less than the office. A pet costs 16 draw calls and 1,900 triangles (the model, its
basket and bowl, its sulk bubble hidden). The vet's patients are drawn as furniture (instanced, no animation).

## Pets (5.4)

The cat and the dog are Quaternius's (Animal Pack Vol.2, the OpenGameArt page, CC0 as stated there when published in
2017, downloaded 2026-11-21), converted to GLB with Blender (the Diffuse shader swapped for Principled so the colours
come through), 141 KB and 122 KB, clips Idle and Walking. Only those two are in `assets/animals/`.

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&skills=1&events=1&event=cat&freewill=0` | the stray cat's card: "Keep it" enabled; chosen: the result text, the catCuddle moodlet, a basket placed at (1.4, 1.2), the naming card |
| named Mimi, "Welcome home" | toast "Mimi is home!", the tally counts `pet`, the happyPet moodlet |
| the naming card | "What will Ada & Hugo call it?" (was "Ada, Hugo" before a fix) |
| the cat in the room | walks the floor grid facing the way it goes |
| the phone's "Adopt a pet" | the shelter card: a cat and a dog, 40 🪙 each; the dog adopted (fee paid), named Scout |
| with a pet, the phone again | "Adopt a pet" hidden in the Sim's own menu; `offerWhy` says "You have a pet already" |
| the basket's menu | Feed the pet, Play with the pet, Stroke the pet, Move it |
| hunger 10 and play 15, free will on, 120 min | the Sims stroke, feed and play with the pet unasked; its needs reach 91 / 94 / 99 |
| a pet left alone 30 game hours (node) | its needs reach 0; it says "Mimi is hungry" once and sulks; nothing else happens to it |
| the basket's "Move it", placed at (-1, -1) | a new basket item; the pet's (`pet.bed`, the click box), still drawn; one basket in the furniture. Before a fix the pet stayed with the old basket and vanished |
| the flat extended with a cat (`extendHome`, the furniture placed again) | the basket in the new home, the pet with it, drawn, at its basket; a basket is never boxed (as a cot) |
| a plain test URL with the cat event | "Keep it (when pets come)" greyed; no basket offers, no "Adopt a pet" |

## Not checked this round

- The Surface tablet.
- Rain greying "Play for tips" (a test URL has no weather; it uses the same `off` list as feeding the ducks).
- A long game played for real, without the hooks (how often free will paints, plays or tends without a wish).
- The workout and charm wishes coming up and coming true in a real game (they use the same `did` path as the others).
- Two planters (they share one crop, by design).
- The pet seen moving on screen for a long while (the pane was hidden: its walk was checked by its position and facing,
  not watched), and the dog's walk speed against the Sims'. Its walking to the basket while someone sees to it, and
  lying there at night, are in the code (`drawPets`) but were not checked.
- Buying a house in the town with a pet (the same `rehome` as extending, which was checked).
- The vet's with Sims in it for the frame cost (measured empty), and on the Surface.
