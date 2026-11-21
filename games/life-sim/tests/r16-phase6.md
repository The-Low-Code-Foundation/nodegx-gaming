# Round 16 checks: the calendar (roadmap phase 6)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase5.md](r16-phase5.md).
The browser pane was hidden, so the checks set the clock (`minutes`) and called `calendarTick()` or played time with
`advance(minutes)`; stills were drawn with `renderer.render` and shown as images. The calendar is off on a test URL
unless `?calendar=1`, `?season=` or `?date=`.

## Seasons (6.1)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&season=autumn&freewill=0` | the date is autumn day 1; the clock ends "· 🍂 Autumn 1"; the planter's crop is pumpkins |
| the weather rolled 420 times with each season's odds | winter: sun 173, rain 75, snow 172; spring 228/192/0; summer 330/90/0; autumn 214/206/0 |
| the park drawn in each season (`seasonLook`) | spring: fresh green leaves; summer: as before; autumn: orange leaves, yellower grass; winter: grey-blue leaves, frosty grass |
| `?date=7` (spring day 7), then a day on | "🌞 Summer is here!" once; the crop goes from peas to strawberries |
| a plain test URL (`?seed=5&flatmate=7&freewill=0`) | `calendarOn` false, no date in the clock ("Mon · Day 1 · 07:34"), no crop, the old weather and events |
| a frame (150 renders, median / 90th centile), the park | 1.0 / 1.6 ms in winter against 1.7 / 16.6 ms with the calendar off (the pane was hidden: noise); the same draw calls (231 against 234) |

## Birthdays (6.2)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&calendar=1&birthday=today&freewill=0`, three friends (friendship 60, 40, 30) and one not (10), 08:05 | "🎂 It’s Ada’s birthday!", then a present from each of the three, each of a different kind of Ada's likes (a treat, a scarf in her colour, something about her favourite thing to do); the `birthday` and `present` moodlets; the life story |
| "Your Sim" | "Order a birthday cake 25 🪙" and "Have a birthday party" show (not on other days) |
| order the cake | 25 coins; she sits to eat it (a cake with three lit candles on the table); "🎂 Ada blows out the candles. Everyone sings!"; the `birthdayCake` moodlet; `calendar.cake.Ada` is the year; the life story "blew out the candles" |
| the party | the household's party (40 coins), the life story "had a birthday party" |
| `?seed=5&flatmate=7&date=13&townlife=1&freewill=0`, a townsperson's birthday today (Jules), a household friend of theirs | "Happy birthday, Jules! 🎂" on the notice board; the friend is glad for them |
| the make-your-Sim screen: Autumn, then 4 | "🍂 Autumn 4: a day for cake, presents and friends, every game year."; moving in, Gus's birthday is day 17 of the year |

## Town events (6.3)

| How | Expect |
|---|---|
| summer day 3, 08:05 | on the notice board: "The Summer Fair is on Thu, in the park, from 10:00. Everyone welcome!" (once) |
| `?seed=5&flatmate=7&date=13&townlife=1&freewill=0` (summer day 6), 09:40 | three stalls round the plaza under bunting (games, treats, the show) |
| Ada goes to the park at 10:00 | she counts as going (`calendar.events.summerFair.went`), the `townEvent` moodlet; two townspeople (all who were free: the others worked, as `?date=` keeps day 1 a Monday) come, one to watch the show, one to look round a stall |
| Ada enters the painting competition at the show (painting level 10) | first: +60 coins, the rosette moodlet, the life story "came first in the painting competition at the Summer Fair" |
| 18:01 | the stalls and bunting come down; the townspeople leave |
| `?date=26` (winter day 5), 16:10, the street | three stalls on the far pavement under fairy lights, in the snow |

## Weekends (6.4)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&calendar=1&freewill=0`, Ada to bed at 05:00 with energy 70, on a Friday and on a Saturday | Friday: up at 07:40 once rested; Saturday: up at 10:00 (energy 100), the "lie-in" moodlet |
| `leanOf` at 14:00, Friday against Saturday (autumn) | nap 1 → 1.3, tv 1 → 1.2, cook 1.2 → 1.5, read 1.2 → 1.44, study 1 → 0.6 |
| the outing at 11:05 on a Saturday, 40 tries, friends at home | 19 to the park, 15 round to a friend's, 6 stayed in (the data: 45% and 30%) |
| events' weights (node), a Wednesday against a Saturday | the market 0 → 1.6, the kick-about 0 → 1.8, the talent show 0 → 0.9; a knock at the door 1.2 → 2.16 |

## Saving (v8)

| How | Expect |
|---|---|
| a new game (Gus, birthday Autumn 4), the clock moved to autumn day 4, 11:05, saved | the save is v8 with `calendar` (start 0, `day` 17, the bake-off told) and Gus's birthday 17 |
| reloaded, "Carry on" | "Thu · Day 18 · 11:09 · 🌧️ · 🍂 Autumn 4"; the birthday moodlet and wishes kept; no second birthday; the crop pumpkins; the bake-off's stalls up again |
| the same save planted as v7 with no calendar and no birthdays, from the start screen | it loads in spring's first week on its weekday ("Thu · Day 18 · … · 🌸 Spring 4"); Gus's birthday is the town's roll (day 15); it saves as v8 |

## Not checked

- On a tablet: the season looks and the stalls were measured on the Mac only. With the fair up, the park has 277 draw
  calls against 234 (each stall is a few materials); the frame time did not change on the Mac.
- A whole season played at speed in a running game with free will on (the checks set the clock).
- Two household Sims whose birthdays fall on the same day (the cake and the candles are per Sim, so it should work).
