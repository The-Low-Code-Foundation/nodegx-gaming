# Life Sim roadmap: core gameplay variety (round 16 onwards)

The goal, from the brief: more variables and more variety, so each player has a more unique experience. Today the game
is linear and predictable, and the next restart should feel different from the last.

## Why it is linear today

- The town is a fixed table. It always has the same 7 houses, the same colleagues (`2,3,8,9`) and the same
  `START_MONEY` of 100.
- Every Sim is the same underneath. Free will scores offers by needs alone.
- There is one career, nothing happens unprompted, parties fall on fixed days, and once you're married with a baby and
  a job there is nothing left to aim for.

The rules still hold: content is data tables, `life.mjs` runs them, words go in `strings.mjs`, and things that are
only looked at go in `dressing.mjs`. Nothing harms a Sim, there is no ageing or death, and everything stays PG.

Sizes: **S** is a few hours, **M** is about half a day, **L** is a day or more.

## Phase 1: a different start every game (the restart target)

| # | Size | Task |
|---|---|---|
| 1.1 | S | **A town seed.** Rolled at New Game and saved. It has its own random-number generator, separate from the game's dice, so `?seed=` still repeats a game exactly (`?town=` picks a town by hand). |
| 1.2 | M | **The town made from the seed.** It decides which houses are for sale and their prices (within today's range), who lives where, each house's look, which of the 12 people are colleagues and which are neighbours, and the street's name (from a list). `HOUSES` becomes a recipe, not a fixed list, and the street layout follows it. |
| 1.3 | M | **Start scenarios** on the start screen, or "surprise me": alone with savings; flat-sharing with a friend; just moved in with a sweetheart; broke but with a great job offer; inherited a big empty house. Each one sets the money, the home, the household and the bonds at the start. |
| 1.4 | L | **Personality traits**, 3 per Sim from a list of 14: cheerful, grumpy, foodie, lazy, sporty, bookworm, chatty, shy, romantic, joker, neat, messy, night owl, clumsy. They are data. Each one changes how fast needs fall, how free will scores offers and the odds in social interactions, and adds moodlets of its own. |
| 1.5 | S | **Traits on screen.** On the make-your-Sim screen you pick 3 or roll them. Every other Sim gets random ones. Traits show on the friends card. |
| 1.6 | S | **Likes and dislikes**: a favourite food, colour and activity. A chat or a gift about one of them goes better. |
| 1.7 | S | **Save format v3**, with v2 saves still loading and being upgraded. Plus a check list for the round (the old `tools/drive.mjs` + `tests/*.json` live only in the parked OpenNoodl copy). |

## Phase 2: something to aim for

| # | Size | Task |
|---|---|---|
| 2.1 | L | **Life goals**, chosen at the start: big family, top of the career, dream house, most popular, master chef, artist. Each is a chain of 4–6 steps, with rewards along the way. |
| 2.2 | M | **Wants**: three small wishes that keep changing, driven by traits, the goal and what is going on. Each one is worth happy points. |
| 2.3 | M | **What happy points buy**: things, a trait, lasting bonuses. |
| 2.4 | S | **A "Life story" panel**: the big moments so far. |

## Phase 3: things happen

| # | Size | Task |
|---|---|---|
| 3.1 | L | **An event deck** as data, weighted by traits, place, time and goal. Most events are cards with 2–3 choices and a dice roll. |
| 3.2 | M | **The first ~25 events**: loo breaks, burnt toast, a power cut, a neighbour bringing cake, coins found in the park, a stray cat at the door, invitations to a birthday, a wedding, a talent show. |
| 3.3 | M | **Other Sims phoning and knocking.** |
| 3.4 | M | **Daily weather** that changes what is on offer. |

## Phase 4: a town that lives without you

| # | Size | Task |
|---|---|---|
| 4.1 | L | **A daily town-life tick**, data only. Other Sims make friends, fall in love, marry, have babies and move house. New people arrive, and houses go on and off the market. |
| 4.2 | S | **A notice board or newspaper** on the street. |
| 4.3 | M | **Other Sims start interactions with you**, by trait. |
| 4.4 | S | **Measure on the Surface tablet first.** |

## Phase 5: more ways to live

| # | Size | Task |
|---|---|---|
| 5.1 | L | **Skills from objects**: cooking, fitness, painting, music, gardening, handiness, charm. |
| 5.2 | M | **Earning from skills.** |
| 5.3 | L | **2–3 new careers** (café chef, vet, scientist), each with its own stations and school-year questions. |
| 5.4 | M | **Pets** (this needs CC0 animal models). |

## Phase 6: the calendar

Seasons, birthdays with cake (no ageing), town events, and weekends that feel different.

## Open questions

Each one has a default, so none of them blocks phase 1.

- **Should events ever go wrong?** Default: mild hassle only.
- **Pets?** Default: yes, in phase 5.
- **Is the trait list right?** Default: the 14 above.
- **Should a life goal finish?** Default: it ends in a celebration, and then you can pick another.

## Progress

- Phase 1: built on branch `life-sim-variety` (one commit per task; 1.1 and 1.2 share one), checked in the browser.
  The checks are listed in [tests/r16-variety.md](tests/r16-variety.md).
- Phase 2: built on branch `life-sim-goals`, cut from `life-sim-variety` (one commit per task, then save v4 and the
  checks), checked in the browser. Five dreams can be chosen; the artist waits for phase 5 (painting), and the master
  chef counts meals cooked until cooking is a skill. The checks are listed in [tests/r16-phase2.md](tests/r16-phase2.md).
- Phase 3: built on branch `life-sim-events`, cut from `life-sim-goals` (one commit per task, then save v5 and the
  checks), checked in the browser. 36 events (25 for 3.2, 7 calls and knocks for 3.3, 4 for the weather). Events go
  wrong only as a mild hassle (the roadmap's default). Adopting the stray cat waits for pets (phase 5); fixing the loo
  is dice on traits until there is a handiness skill (phase 5); snow is just rare until the seasons (phase 6). The
  checks are listed in [tests/r16-phase3.md](tests/r16-phase3.md).
- Phase 4: built on branch `life-sim-town-life`, cut from `life-sim-events` (one commit per task, then the checks),
  checked in the browser on the Mac. The town's day is played out at 03:00 as data; newcomers get a body (hidden until
  met, like the neighbours) when they move in, and nobody else is added. Save v6 (4.1). 4.4 was measured on the Mac
  only: ten Sims at a party take a frame from 1.6 to 2.1 ms, and `DRAWN.most` is 10 until the Surface is measured
  with the script in [tests/r16-phase4.md](tests/r16-phase4.md), where the checks are listed too.
- Phase 5: built on branch `life-sim-skills`, cut from `life-sim-town-life` (one commit per task), checked in the
  browser on the Mac. 5.1, 5.2 and two careers of 5.3 are done: the café chef (a new café) and the scientist (in the
  office building). The artist dream is back. Save v7 (with 5.2). Not done: the vet and pets (5.4): there is no animal
  model in the project, and one would have to be downloaded. The checks are listed in
  [tests/r16-phase5.md](tests/r16-phase5.md).
