# Round 16 checks: something to aim for (roadmap phase 2)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-variety.md](r16-variety.md).
The browser pane that ran them was hidden, so its animation frames were held back. The checks called
`checkGoals()` and `wantsTick()` by hand after each `advance(minutes)`.

## Dreams (2.1)

| How | Expect |
|---|---|
| `?seed=5&story=broke&goal=career` | the career dream starts at step 3: the first three steps tick off quietly, with no points |
| `promote()` | +150 happy points, a toast and the next step |
| promoted to boss | "dream come true": +1000, the "Dream come true" moodlet, a card to pick the next dream (career not on it) |
| `?seed=5&goal=chef`, one meal cooked | step 1 done (`tally.cook` 1) |
| New game from `/` | story card, then "What does <name> dream of?"; the flatmate gets one rolled |
| any test URL without `?goal`/`?goals=1` | no dreams panel, no wishes, no points (as before) |
| the artist | not offered (`later: 5`) |

## Wishes (2.2)

| How | Expect |
|---|---|
| two Sims, foodie+lazy+neat with chef and chatty+joker+romantic with popular, a game day each | the first rolls cook, pizza, TV and nap kinds of wish; the second rolls party, chat, joke and visit kinds |
| `weightOf` for the same two | foodie/chef: cook highest (7.2); chatty/popular: party highest (9) |
| a wish done (e.g. chat) | its points, the "Wish came true" moodlet, a toast, a new wish in its place |
| ✖ on a wish | another one, never the same |
| no telescope / no sweetheart / no job | no stargazing, kissing or work wishes |

## Happy points (2.3)

| How | Expect |
|---|---|
| 2000 points, buy Iron bladder | bladder falls 8.25 an hour, not 11; the button then says "Got it ✓" |
| buy a telescope | it is in the boxes, ready to put out |
| buy a new trait, lazy → sporty | the list leaves out messy (the opposite of neat) and the ones they have |
| not enough points | the button is faded |

## Life story (2.4)

| How | Expect |
|---|---|
| 📖 Life story | the start, each dream, its steps, a job, a promotion, falling in love, newest first |

## Save v4 (2.1–2.4)

| How | Expect |
|---|---|
| a new game played for half a day, a perk bought, save, "Carry on" | the same dream and step, wishes, points, perks, traits, tally and diary for both Sims; written as v4 |
| the same again | the diary does not grow (no repeated milestones on load) |
| a v3 save (no dream, wishes, points, tally, perks or diary), "Carry on" | traits kept; "Pick a dream" button; three new wishes; 0 points; the diary's one entry is "before this story"; written back as v4 |
| "Pick a dream" from that save | the dream picker; the dream starts, and the diary gets it |

## Not checked this round

- The tablet (Surface).
- A long play over many days, without calling the hooks by hand.
- Buying every kind of reward by clicking (the perk, telescope and trait swap were bought through the hook and the card).
- The family dream's wedding and baby steps, and the dream house's mansion step, played for real.
- A neighbour who moves in getting dreams and wishes.
- A v1 or v2 save upgraded straight to v4.
