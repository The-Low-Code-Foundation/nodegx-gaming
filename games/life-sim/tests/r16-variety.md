# Round 16 checks: a different start every game (roadmap phase 1)

The old automated checks (`tools/drive.mjs` and `tests/*.json`) live only in the parked OpenNoodl copy of the game,
not in this repo. These are the round's checks as a list, done by hand in a browser over HTTP (not `file://`), with
the hooks on `window.__life`. Serve the folder (`python3 -m http.server`) and open the URLs below.

## Town (1.1, 1.2)

| URL | Expect |
|---|---|
| `?seed=5&start=10:00` | `__life.town.seed` 0, street "Sunny Lane", houses as in rounds 14–15 (s1 no. 2 at 500, s2 no. 4 at 1000, s3 no. 6 at 2000) |
| `?seed=5&town=42` | street "Kingfisher Way"; s1 no. 8 at 550, s2 no. 5 at 1100, s3 no. 3 at 2300; two colleagues share h1 |
| the same URL again | the same town, the same colleagues in the same houses (the town's dice) |
| `?seed=5&town=42`, street view | fronts in number order, names and prices on the boards, For sale boards say the street's name |
| New game twice (from `/`) | two different seeds, saved as `town.seed`; "Carry on" brings back the same town |

## Starts (1.3)

| URL | Expect |
|---|---|
| `?seed=5&story=savings` | alone, 600 coins, toast "has the flat to themselves" |
| `?seed=5&story=friend` | flatmate, friendship 45, 150 coins |
| `?seed=5&town=7&story=sweetheart` | flatmate, friendship 55, romance 60 (Sweethearts), 200 coins |
| `?seed=5&story=broke` | alone, 15 coins, an office job at level 2 (Team member) from day one |
| `?seed=5&town=42&story=inherit` | home is the town's biggest house for sale (s3, size 4), 60 coins, only the basics in it |
| New game from `/` | after making the Sim, the "How does your life begin?" card; 🎲 picks one |

## Traits (1.4, 1.5)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&traits=foodie,lazy,joker&traits2=sporty,neat,bookworm` | `lives[0].traits` and `lives[1].traits` as given; colleagues have three each |
| `life.score()` with needs `{hunger 60, energy 60, bladder 80, hygiene 60, fun 40, social 60}` | no traits: joke, chat, phone, dance; sporty: dance first; lazy: TV second; foodie: cook second |
| an hour's `tick` at 10:00 | foodie: hunger falls 10.8 (not 9); night owl at 23:00: energy 2.3, at 08:00: 6.3 (not 4.5) |
| moodlets | cheerful: "Sunny side up"; grumpy with fun under 45: "Grumbly"; messy with hygiene 10: no "Stinky"; foodie after eating: "Yum!" |
| make-your-Sim screen | Personality row, three rolled; a click takes one off or puts one on; an opposite is faded |
| Who lives here, friends | the Sim's traits under Who lives here; each friend's traits on their row |

## Likes (1.6)

| How | Expect |
|---|---|
| a present to a friend (friendship 30) | 15 coins paid; friendship +18; their "My favourite!" moodlet; toast "loves the present: …" |
| "Talk about favourite things" with someone who loves the same colour | friendship +15; both "Kindred spirits" |
| friends card | favourites for the household and for friends (25+); "get to be friends to find out" for others |

## Save (1.7)

| How | Expect |
|---|---|
| a v2 save (no traits, likes, story, town seed) then "Carry on" | the classic Sunny Lane; three traits and likes each; written back as v3 |
| "Carry on" again | the same traits and likes for the household and the colleagues |

## Not checked this round

- The tablet (Surface) with a seeded town and traits.
- A long run to see whether traits make days look different over a week of play.
- A married couple from an old save upgraded to v3.
