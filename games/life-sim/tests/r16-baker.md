# Round 16 checks: the baker (after phase 6)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase6.md](r16-phase6.md).
The browser pane was hidden, so the checks set the clock (`minutes`) and played time with `advance(minutes)`; stills
were drawn with `renderer.render` and shown as images. The baker is skills-gated, so test URLs need `?skills=1`.

## The career and the bakery

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&skills=1&freewill=0`, the jobs card | "🥖 Apprentice baker (apprenti) at the Boulangerie Belle Croûte (a French bakery)", 50 🪙 a day, 06:00–13:00, Tue–Sat |
| take the job | the bakery is built (`careerPlace('bakery')`); a still shows the "Boulangerie · Pâtisserie" board, the ovens, dough and piping tables, the bread rack, the tart stand, the pastry case and the till; the station signs read Baguettes, Croissants & pains au chocolat, Éclairs, Tartes (fruit tarts), Macarons |
| a frame (150 renders, median / 90th centile), the camera on the place | the bakery 1.5 / 2.0 ms, 216 draw calls, 12.0k triangles; the café 1.0 / 1.9 ms, 185 calls, 14.5k triangles |

## A baker's day

| How | Expect |
|---|---|
| Tuesday 05:25, asleep | Ada wakes at 05:31 (`goToWork`) and is at the bakery at 05:37 |
| the Baguettes station (maths) | "Weigh the dough…"; the topics list "At the bakery" first; bakery questions (trays, batches) for her school year; 2 of 3 right: +10 coins, the bar +12 (cooking helps), `tally.bake` 2, cooking 0.6 |
| the Croissants station (science) | the school's science questions; the bar 95 → 100 |
| 13:04 | she goes home, home at 13:09; 125 → 175 coins (a day's pay, 50) |
| the bar full | promoted to Baker (boulanger), the bar back to 0 |
| home | "🥖 … brought home fresh bread" toast; `household.bread` 2 |
| the fridge with bread | "Fresh bread 🥖" offered; eating it: 2 → 1 loaf, hunger up, the `freshBread` moodlet; not offered with no bread |
| the office's stations | never ask the bakery topic |
| `school/bakery.mjs` in node, 3000 questions over every skill | 0 with a wrong answer, a missing answer among the options, or a repeated option |

## Ties

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&skills=1&date=18&freewill=0` (autumn day 4), the baker, cooking 0, the bake-off at 11:05 | `lastContest` `{ event: 'bakeOff', skill: 'cooking', edge: 2, place: 3 }`: third with no cooking |
| the master chef's first step | "Cook a meal (or bake at the boulangerie)"; a bake counts |
| `?…&calendar=1`, the flatmate's birthday on a Tuesday | the baker comes home at 13:09 with the cake: `diary.cake.bakery`, `calendar.cake.<name>` set, the flatmate's `birthdayCake`; no bread that day |

## Save and reload

| How | Expect |
|---|---|
| a v8 save planted from the start screen (`?menu`): the baker at level 3, bread 3, cooking 2.5, Wednesday 05:00 | "Carry on" shows "Wed · Day 3 · 05:00"; after it: the job (level 3, `broughtDay`), bread 3, cooking 2.5; the bakery rebuilt; the job panel reads "🥖 Pastry chef (pâtissier)"; she leaves for work at 05:35 |
| a plain test URL without `?skills=1` | no baker in the jobs card |

## Not checked

- The Surface tablet (frame cost there).
- The bakery on the street: workplaces (the café, the vet's) are places of their own, not on the street, so the bakery
  is too.
- Every level's promotion (one promotion was played; the others are the same code with the career's numbers).
