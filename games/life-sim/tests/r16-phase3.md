# Round 16 checks: things happen (roadmap phase 3)

Done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-variety.md](r16-variety.md) and
[r16-phase2.md](r16-phase2.md). The pane was hidden, so its animation frames were held back. The checks called
`advance(minutes)` and then `eventsTick()`, `weatherTick()`, `checkGoals()` and `wantsTick()` by hand. To force the
dice, `Math.random` was swapped for a fixed value only while a choice was clicked.

## The deck (3.1)

| How | Expect |
|---|---|
| `?seed=5&event=cake&start=11:00` | once the neighbours are in: the cake card, "Knock knock! It's <neighbour> at the door", three choices |
| "Come in for a cup of tea" | the result, "🍰 Cake! · 🤝 <name> +9"; friendship +9, hunger up, the guest comes in at once |
| `?seed=5&flatmate=7&events=1&start=07:00`, 8 days, first open choice each time | about 2.5 a day (20 in 8 days, 1 to 4 a day), never two within 2.5 hours, from 08:00 to 22:00 |
| any test URL without `?events`/`?event` | no events, the deck never moves |

## The first 25 (3.2)

| How | Expect |
|---|---|
| every choice of every event, dice forced good and bad | 84 outcomes, each with its words and what it did (coins, moodlet, friendship), no errors |
| a power cut | "Watch TV" greyed with "⚡ Power cut"; free will skips the TV and the oven; 90 minutes later "💡 The power is back on" |
| a birthday, "I'll be there!" | that house's party is tonight's (`partyToday`), and `invited` |
| the cat | "Keep it" greyed "(when pets come)" |
| the loo, the tap, the power cut, the spider | not again for 6, 5, 5 and 3 days |

## Calls and knocks (3.3)

| How | Expect |
|---|---|
| 400 rolls of "a call from a friend", everyone at friendship 30 | the shy or grumpy ones about a fifth as often as the chatty or cheerful ones |
| the same with one shy friend at 80 | twice as often as before |
| someone sweet on you (romance 30) rings, "Yes" | a date planned with them, the to-do list says go to the park |
| "Come in!" (hello) | they come in at once as a guest |
| "I'll come and help" | to their house (counted `go.house`); a picnic then sends them to the park (`go.park`) |
| a colleague on a weekday | doesn't knock or ask you round (`free`) |

## Weather (3.4)

| How | Expect |
|---|---|
| `?seed=5&weather=rain`, at the park | 🌧️ by the clock; no ducks on the pond; feed the ducks and the bench greyed "🌧️ Too wet today"; "Splash in the puddles" on the lawn, and free will takes it; rain falls |
| `?seed=5&weather=snow`, at the park | snow falls and lies; the flowers "❄️ Under the snow"; "Build a snowman" on the lawn; built, a snowman stands where they built it, and the "Built a snowman" moodlet |
| wishes, `?goals=1` | rain: no ducks wish, puddles 2; snow: no ducks or flowers, snowman 4 |
| `?seed=5` (no weather) | no weather icon, ducks there, only "Dance" on the lawn: as before |
| draw time at the park, 1024×768, 12 runs each, medians | none 1.9 ms, rain 1.9 ms, snow 2.5 ms, but repeat runs moved by ±0.5 ms (one run had snow falling alone slower than snow with the sheet); +1 draw call for rain, +2 for snow |

## Two towns (3.1–3.3)

| How | Expect |
|---|---|
| `?seed=5&town=42&flatmate=7&events=1&goals=1&traits=chatty,joker,cheerful`, 3 days, park 10:00 to 15:00 | Kingfisher Way: burnt toast, a compliment, calls and a visit from cheerful Flo, a cat, the loo, ice cream |
| `?seed=5&town=7&…&traits=bookworm,shy,messy`, the same | coins for the ducks, a power cut, a raffle, a spider, chatty Ivan's cat, birthday and gossip |

## Save v5

| How | Expect |
|---|---|
| a new game from `/`, 3 days, a power cut, a birthday party said yes to, snow; save; "Carry on" | the deck (what came up when, tonight's party, the power cut) and the snow, the moodlets, coins and points the same; written as v5 |
| a v4 save (no deck, no weather), "Carry on" | a fresh deck (the first event a few hours later), the day's weather rolled, written back as v5 |
| the promotion toast | "Ada is promoted to Team leader! 160 🪙 a day" (was "is now a …"); a new job: "has a new job: Trainee!" |

## Not checked this round

- The Surface tablet, with rain or snow (the draw cost above is the Mac's).
- Playing many days for real, without calling the update functions by hand. The day's weather was only seen rolling sun (four days running, which is
  plausible at 60%); rain and snow were forced.
- A guest from an event at a party at home, and a birthday party followed all the way through the evening.
- Events while the second household member is the one you look after, or with a baby at home.
- The look of rain and snow from the street, and at night.
