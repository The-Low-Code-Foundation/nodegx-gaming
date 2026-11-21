# Life Sim: notes for an AI coder

A Sims-like life game in plain ES modules and three.js. No build step, no `npm install`: `index.html` loads
`src/game/page.mjs` through an import map that points `three`, `three/addons/` and `@pixiv/three-vrm` at `vendor/`.
Serve the folder (`npx serve .` or `python3 -m http.server`) and open it; `file://` will not work.

## How it is built

The rule the code keeps: **anything a player can buy, do, say or read is a data table; `life.mjs` runs it; the page
draws it.** Strings live in `strings.mjs`; things that are only looked at (wallpaper, garden, sky, ducks) are made in
`dressing.mjs` and never go on the walk grid.

Time: one game minute a second at speed 1 (`SPEEDS` in `life.mjs`). Every need number is per game hour.

## Code map

`src/` (engine and places):

- `characters.mjs`: loads the twelve Rocketbox people (`assets/people/index.json`) and the animation library
  (`assets/anim/`), normalises them to one rig and height; `loadTemplate`, `CANDIDATES`. The `vrm` candidate is a
  leftover from the character tests: its model is not shipped and the game never loads it (it uses `rocketbox`).
- `retarget.mjs`: maps any rig's bones onto one set of slots and bakes Quaternius's animation clips onto it.
- `mocap.mjs`: Rocketbox's own motion-capture clips (`assets/anims/index.json`), women's `f_` and men's `m_`.
- `face.mjs`: moods on the face, blinking, a talking mouth (Rocketbox's ARKit face shapes).
- `wardrobe.mjs`: body weight and height morphs, hair colour, clothes colours, borrowing another person's hair or
  outfit; reads `wardrobe/catalogue.json` (which outfits and hairstyles fit whom).
- `sim.mjs`: one Sim's body: animation mixer, walking an A* path, using a thing, the shadow blob.
- `world.mjs`: the places (`PLACES`: `lifeHome`, `lifeOffice`, `lifePark`, `lifeHouse`, `lifeStreet` (Sunny Lane); `home`, `park`, `office` are the
  older test versions `lifeHome` and friends build on), the made-in-code models (`MADE`: fridge, TV, telescope, cot,
  camp bed), `furnish` (loads, fits and instances models), the walk grid (`makeGrid`), `houseFurniture` (a town
  house's layout), `STATIONS` (the office's work stations).
- `dressing.mjs`: everything only looked at: painted floor and wall textures, the sky and the sun, windows, the
  garden and street, party decorations (`partyDecor`), the pond and its ducks, lamp glow, Sunny Lane's house fronts
  (`dressStreet`: name boards, For sale boards and party balloons the page shows and hides), the weather (`weatherLook`:
  rain and snow; `greySky`; a `snowman`).

`src/game/` (the game):

- `page.mjs`: the page. Builds the places, loads people, runs the main loop, and draws every panel and card: the
  start screen, the shop, the town card, friends, work-station questions, the baby, moving furniture, saving. Large
  (about 2,000 lines); search it by the data name you are working on.
- `life.mjs`: `Life`, one Sim's mind: needs over time, moodlets, the to-do list, free will (scores every offer by
  what it gives), interactions with another Sim, going to work, emergencies.
- `needs.mjs`: `NEEDS`, `MOODLETS`, `EMOTIONS`, `moodOf`.
- `actions.mjs`: `OFFERS`: what each thing offers, keyed by model name (or `use.offers`). The field list is at the
  top of the file.
- `social.mjs`: `INTERACTIONS` (chat, joke, hug, flirt, ask on a date, marry, have a baby, tease…), `FRIENDSHIP` and
  `ROMANCE` levels, the bonds between Sims.
- `work.mjs`: `CAREERS` (days, hours, pay per level, days to promotion), `TASK` (questions per station visit).
- `school/school.mjs`: the work-station questions by school year, subject and topic; `school/rocket.mjs` is a
  generated question bank (maths, French, English, history, science); `school/france.mjs` the geography banks;
  `stem.mjs` the older promotion questions.
- `shop.mjs`: `SHOP`, everything that can be bought (field list at the top), `kindOf`, `FLAT_FURNITURE`.
- `town.mjs`: `SIZES` (home sizes), `EXTENSION` prices, `makeTown(seed)` (round 16: fills `HOUSES`,
  `COLLEAGUE_HOUSES`, `NEIGHBOURS` and `TOWN` from `RECIPE`; seed 0 is the classic Sunny Lane), `PARTY` timetable,
  `streetLayout()` (where each house's front stands on the street, by number).
- `starts.mjs`: `STARTS`, the ways a new life begins (round 16).
- `traits.mjs`: `TRAITS`, 14 personality traits, three a Sim, and what Life asks of them (round 16).
- `likes.mjs`: `LIKES`, favourite food, colour and activity and one dislike (round 16).
- `goals.mjs`: `GOALS`, the life goals (dreams), each a chain of steps tested on a Sim's facts (round 16, phase 2).
- `wants.mjs`: `WANTS`, the small wishes on screen and how likely each is for a Sim (`weightOf`, `rollWant`).
- `rewards.mjs`: `REWARDS`, what happy points buy: perks (`traits.mjs` `PERKS`), things for the home, a new trait.
- `events.mjs`: `EVENTS`, the things that happen (cards with choices and dice), and `DECK`, how often (round 16, phase 3).
- `weather.mjs`: `WEATHER`, the day's sun, rain or snow and what each takes off the menu (its look is dressing.mjs's).
- `townlife.mjs`: the town lives without you (round 16, phase 4): `TOWNLIFE` (how often things happen), `dayOfTown`
  (one town day as data), `REACH` (the town's people starting things with you), `DRAWN` (how many Sims in one place).
- `skills.mjs`: the skills from objects (round 16, phase 5): `SKILLS` (cooking, fitness, painting, music, gardening,
  handiness, charm), the gains added to things already in the game and the new things to do (`addSkills`), and
  `EARNING` (paintings, vegetables, busking, odd jobs). How fast a trait learns each is `traits.mjs` `skills`.
- `pets.mjs`: a cat or a dog (round 16, phase 5.4): `PETS` (model, size, names), `PET_NEEDS` (hunger, play, love),
  `PET_OFFERS` at the basket (feed, play, stroke) and the phone (adopt), `addPets`, and `Pet` (its needs; it sulks,
  never comes to harm). The models are `assets/animals/` (CREDITS.md).
- `baby.mjs`, `childcare.mjs`: the baby's needs and names; the nanny and the nursery.
- `create.mjs`, `looks.mjs`: make-your-Sim screen; a Sim's look as data and how it is dressed.
- `props.mjs`: what is in a Sim's hands or on the table, the eating motion, wedding clothes.
- `save.mjs`: the save in `localStorage` (`lifesim.save.v1` key, format v7 since round 16 phase 5; a v1 to v6 save
  from an earlier round still loads and is upgraded: the classic town, traits and likes rolled for everyone, no dream
  yet (a "Pick a dream" button), new wishes, 0 happy points, a life story that starts with "before this story", a fresh
  event deck and the day's weather rolled; the town as made, and town life starting that day; no side earnings).
- `strings.mjs`: every word, by key (`t('need.hunger')`). English only; a language is a new table with the same keys.

Other files: `index.html` (the HUD's empty panels), `style.css` + `life.css`, `assets/` (models and clips, see
CREDITS.md), `wardrobe/catalogue.json`, `vendor/` (three.js r186 build and the addons it imports, three-vrm).

URL switches (top of `page.mjs`): `?seed=5` (repeatable dice; starts straight in and does not save), `?freewill=0`,
`?person=0…11`, `?flatmate=0…11|none`, `?colleagues=2,3,8,9|none`, `?start=10:00`, `?speed=0…3`, `?year=CE2`,
`?menu` (the start screen and saving on a test URL). Round 16: `?town=N` (the town's seed; test URLs get the classic
town, 0), `?story=savings|friend|sweetheart|broke|inherit` (how the life begins), `?traits=a,b,c` and `?traits2=`
(the household's traits; a test's URL gives the household no traits and no likes otherwise, so seeded free will
chooses as it did before round 16). Phase 2: `?goal=id` and `?goal2=id` (the household's dreams), `?goals=1` (dreams,
wishes and happy points on a test URL; a test URL has none otherwise). Phase 3: `?events=1` (things happen on a test URL),
`?event=id` (that event at once, then the deck as usual), `?weather=sun|rain|snow` (that weather, all game; a test URL
has sunshine otherwise, and no weather icon). Phase 4: `?townlife=1` (the town lives, and its people come to you, on a
test URL; the notice board is always on the street, and says town life is off otherwise). Phase 5: `?skills=1` (skills,
earning from them, the four new things to buy, the café chef and scientist, and the artist dream on a test URL).

## How to add a thing to buy

1. If it is a new model: put a GLB in `assets/furniture/` (Quaternius's CC0 packs fit the style). Models are
   fitted to a real height by `fit`, so scale does not matter.
2. Add an entry to `SHOP` in `src/game/shop.mjs`:
   `{ id: 'armchair', kind: 'sit', icon: '🪑', price: 60, model: 'Armchair', fit: 0.9, use: { act: 'sit', label: 'Sit', offers: 'Couch_Medium1' }, beauty: 1 }`.
   `offers` borrows the offers of an existing thing; use `{ decor: true }` for something only looked at.
3. Add its words to the `en` table in `src/game/strings.mjs`: `'shop.armchair': 'An armchair'` and
   `'shop.armchair.does': 'Somewhere comfy to sit'`.
4. Reload: it is in the shop's tab named by `kind`.

## How to add an activity (something a thing lets a Sim do)

1. In `src/game/actions.mjs`, add an offer to the thing's list in `OFFERS` (keyed by model name, or by the
   `use.offers` name its shop entry gives): e.g. under `Bookshelf`,
   `{ id: 'study', act: 'interact', minutes: 45, gives: { fun: -10 }, skill: { science: 1.5 }, hand: 'book' }`.
   `gives` is need points per game hour; free will picks offers by `gives`. Every field is documented at the top.
2. Add `'action.study': 'Study hard'` to `strings.mjs`.
3. A new thing with its own offers needs `use.offers: '<its key>'` in its `SHOP` entry.

## How to add a conversation or romance step

Add an entry to `INTERACTIONS` in `src/game/social.mjs` (copy `compliment` or `hug`): `friendship` / `romance` it
adds, `chance` it goes well, `lock` (the bond level it needs), `free` (whether free will may choose it), `clip` and
`react` (animations from `assets/anims/index.json`, prefixed `mc_`). Add its strings to `strings.mjs`:
`'action.<id>'` (the button), `'react.<id>.ok'` / `'react.<id>.fail'` (what the other says) and `'ui.fail.<id>'`
(search `compliment` there to see the set).

## A double bed

The shop's `bigBed` has `use.double`: `furnish` (`world.mjs`) gives it a second side (`twinOf`), an item of its own in
the place's list (`side: true`, `twin` pointing at each other) with its own spot, its own half of the mattress and its own
owner, drawn and moved as one bed. A couple who live together (married or in love) are given a side each by
`shareBeds` in `page.mjs`; free will leaves the other side of anyone else's bed alone and sleeps in its own bed when it
is there (`score` in `life.mjs`). The save counts a double bed once (`sleepers()`) and marks the second side `side: 1`.
Any other bed with `double: true` in its `use` works the same way.

## Sunny Lane, the street

The houses' fronts stand in a row on the street (`lifeStreet`), the flat's block first, by number. Going from home to a
house, from one house to another, or from home to the park and back is along the street: the page's `via` tells
`Life.travel` to come out onto the street at the door they left by, walk to the other door, and go in (one to-do item
throughout). The street's `doorTo(to)` and `doorFor(fromPlace)` say which door: your home's front (`homeState.id`), a
house's, or the bus stop (the park). The office is still straight there and back by bus. Clicking a house's door, its
front or its name board opens `openDoorMenu` in `page.mjs` (knock, go to the party or gatecrash it, look round, buy, go
in, the town map), even while the one you look after is indoors: they walk out to it. The places bar's 🗺️ opens the
old town card (extensions, a party at home).

## Every game its own town and its own people (round 16)

The roadmap is [ROADMAP.md](ROADMAP.md); phase 1 is built. A new game rolls a town seed (`rollTown`, saved as
`town.seed`). `makeTown(seed)` builds the town from `RECIPE` with the town's own dice (`seeded`), never the game's, so
`?seed=` still repeats a game: the street's name (`town.street.N` in strings), house numbers, sizes, looks (brick or
render, roof), sale prices and names, who shares a house, how many neighbours. Colleagues, neighbours and their traits
and likes come from `townDice(seed, salt)`, so a town's people are the same people each time. The street is built
after the start screen (it is the town's). Then `STARTS` (starts.mjs) sets money, home, flatmate, bond and job.

Traits (`traits.mjs`) are data that Life reads in five places: `tick` (need decay, by time of day too), the moodlet
list (a trait's own `always` moodlet, `ignores`), `complete` (`after` moodlets), `score` (`likes`, `social`) and
`begin` (`chance`, `received`). Likes (`likes.mjs`) add `keenOn` to `score`, and the `talkLikes` and `gift`
interactions (social.mjs `likes`) end in `Life.likeOutcome`. An interaction may now have a `cost`.

To add a trait: an entry in `TRAITS` (fields at the top of the file), `trait.<id>` and `trait.<id>.does` in strings,
and any moodlet it adds in `needs.mjs` `MOODLETS` (with `trait: true` for an always-on one) and its strings.

## Dreams, wishes and happy points (round 16, phase 2)

A Sim has a dream (`life.goal = { id, step }`, goals.mjs), chosen on the start screen after the story card, or rolled.
`page.mjs` `factsOf(l)` gathers what the steps test (friends, romance, job level, the home, `life.tally`); `checkGoals`
runs in the UI tick and pays `STEP_POINTS` per step and `GOAL_POINTS` at the end, with a celebration card and a choice
of the next dream (`openGoalPicker`). A goal set when the steps are already true (`quiet`) ticks them off without
points. Phase 5 adds skills: the artist waits for it (`later: 5`), and the chef's steps count meals cooked.

`Life.count(id)` keeps the tally and tells the page (`wished`), which pays a wish that comes true. What is counted:
an offer's id when it finishes, an interaction's id when it goes well, `go.park|office|street|home|house`, `party`,
`hostParty`, `buy`, `promoted`. Wishes (`life.wants`, three) are rolled with `Math.random`, never the seeded dice, by
`weightOf`: the want's `base`, ×traits, ×goal, ×3 for a loved activity, ×0.1 for the disliked one, more when its need
is low, 0 when its `when` says not now; one lasts a game day (`WANT_LASTS`). ✖ swaps one.

Happy points (`life.points`) are each Sim's own. The 🎁 card lists `REWARDS`: a perk (same fields as a trait; Life's
`kit` is traits plus perks), a thing put in storage, or a trait swap. The 📖 card is `diary` (saved, last 300 entries),
written by `milestone()`: the `MILESTONES` table turns toasts (a job, a promotion, a wedding, a baby, a bond level…)
into entries, and goals, rewards, moves and parties add their own.

To add a dream: an entry in `GOALS` and its strings (`goal.<id>`, `.does`, `.<step>`). A wish: an entry in `WANTS`
whose `did` is something counted, and `want.<id>`. A reward: an entry in `REWARDS` (and a perk in `PERKS`), and its
strings. Checks: [tests/r16-phase2.md](tests/r16-phase2.md).

## Things happen: events and weather (round 16, phase 3)

`EVENTS` (events.mjs) is data; the page's `eventsTick` (in the UI tick) looks at the deck every `DECK.every` game minutes
in the day and now and then picks one for the Sim you look after, weighted by where they are, the hour, the weekday, the
weather, their traits, their dream, a favourite activity, and who in the town it could be about (`who`: `eventPeople`
lists the town's people with their bond and traits; `keen` events come up more when the people are chatty and close).
Never while a card is open, at a work station, asleep or travelling. `openEvent` shows the card; `outcomeOf` rolls the
dice (`chance`, plus the traits' `+p`); `eventOutcome` puts the outcome into what the game already has: needs,
moodlets, `befriend` (the bond, and the level toast), coins, happy points, `count` (wishes and dreams), the life story,
`inviteOver` (a guest at the door), `deck.party` (a birthday party is tonight's party, and you're asked), `planDate`, a
power cut (`deck.powerOff`: POWER_CUT's offers greyed and skipped), a trip (`go`). The deck is saved.

The weather (weather.mjs) is rolled each morning (`weatherNow`, saved as `{ day, id }`). `offerWhy` greys an offer in
the menus with why (the weather's `off`, a power cut) and Life's `offerOk` keeps free will off it; an offer with a
`weather` field (actions.mjs: the snowman, the puddles) is only there in that weather. Wishes skip what is off (`off` in
`wantCtx`). The look (dressing.mjs `weatherLook`, `greySky`, `snowman`) is one draw call of points for rain or snow,
moved in the vertex shader, and one unshadowed sheet of snow; outdoors only.

To add an event: an entry in `EVENTS` (fields at the top of the file), and its strings: `event.<id>`, `.text`, and for
each choice `.<choice>` and `.<choice>.good|bad|done` (`.diary` if an outcome has `diary`). New moodlets go in needs.mjs.
Checks: [tests/r16-phase3.md](tests/r16-phase3.md).

## A town that lives without you (round 16, phase 4)

Once a game day at 03:00 (`TOWNLIFE.at`), `townLifeTick` (in `townTick`) plays the town's day out as data with
`dayOfTown` (townlife.mjs): pairs of the town's people (`npcs()`, never the household) spend time together by chance
(more if they live or work together), and their bond grows by how well they get on (`getOn`: traits and likes); two
Friends who are both free can fall in love (`falls`: romantic, shy…); in love and good friends, they marry and live
together; a married couple has babies (data: `townLife.babies`, shown on the town card and the door, not drawn); a
family moves to a bigger house, someone sharing gets a place of their own; an empty house goes on the market; and
someone new (one of the twelve not yet in town) moves into a house for sale, with rolled traits, likes and a dream.
The dice are `townDice(seed, 7000 + day)`. Rules that keep it fair: nobody falls for someone with a romance with the
household, the household's home and any house one of them is in are never touched, `keepForSale` houses always stay
on the market, and someone in view (`present`) never moves. The page then makes it true: `dropHouse` (a house's inside
is built again next visit, with beds for whoever lives there; later if someone is in it), `welcome` (the newcomer's
Life and hidden body), `tellNews` (the notice board, a toast, `gladForThem` for a friend's news, the `welcome` wish).
The street's name boards and For sale boards read the houses every UI tick. A window's evening glow is baked into the
street when it is built, so a house that changes keeps its old glow until the game is loaded again.

The notice board (world.mjs `NOTICE_BOARD`, by the bus stop, with a name board saying how much is new) opens
`openNews`. `reachTick` (in `townTick`) lets the town's people start things with the household (`REACH`, `pickReach`).
`DRAWN.most` caps the Sims in one place: a party's extra guests and friends invited round stay data. Save v6 keeps
`town.houses`, `town.homes`, `town.dreams` and `town.life`. Checks and measurements: [tests/r16-phase4.md](tests/r16-phase4.md).

## More ways to live (round 16, phase 5)

Skills (`skills.mjs`) are points, read as levels by life.mjs `SKILL_LEVELS`; an offer's `skill` field gives points a
game hour, times the Sim's traits (`learnOf`: a trait's `skills`). `addSkills` (the page, when `skillsOn`) adds
cooking to the oven, fitness to dancing and stretching, charm to chats, and the new things to do: a workout on the rug,
charm in the drawers' mirror, and the four things to buy (shop.mjs `skills: true`; world.mjs `MADE` EASEL, KEYBOARD,
PLANTER, WORKBENCH, made in code and merged per material). Handiness makes the home fixes likelier (events.mjs
choices' `skill`, `FIXING`). The master chef climbs the cooking skill; the artist (goals.mjs `skills: true`) paints and
sells. Earning (`EARNING`, Life `earn`): a `paint` finished goes on the household's pile (`household.side.paintings`),
sold at the easel; tending the planter grows the crop once a day, picked and sold when ripe; busking in the park pays
by the hour from music level 2; the notice board offers one neighbour's odd job a day (`oddJobToday`), from handiness
level 2: the Sim goes round (`goVisit`) and does `ODD_JOB` there. Why something can't be done is `earnWhy` (greyed).

Careers (work.mjs `CAREERS`) say where they work (`place`, default the office) and at which stations (`stations`, by
school subject; their names `station.<career>.<subject>`). The café (world.mjs `lifeCafe`) is built the first time
someone has that job (`careerPlace`), or as a save with it loads; `goToWork` asks for it (`needPlace`). The scientist
works in the office building. The vet (world.mjs `lifeVet`) is built as the café is; its patients are the pets'
models, only looked at (placed with `furnish` like furniture, so they stand in their rest pose). A right answer also
teaches the career's `learns` (a café chef: cooking; a vet: charm).

Pets (`pets.mjs`) are cared for the way babies are: the basket (shop.mjs `PET_BED`, made in code) carries the pet
(`item.pet`), its offers carry `pet` (need points a game hour) and `petUntil`; Life calls `item.pet.care` while
doing one, and free will scores `item.pet.relief(offer)`. The page (`adoptPet`, `drawPets`, `petsTick`) places the
basket, names the pet on a card, and walks it about the home on the floor grid (a clone of the GLB with its Idle and
Walking clips); it goes to its basket when someone sees to it, and at night. One pet a household (`MAX_PETS`). The
stray cat's "Keep it" (events.mjs `pets: true`) adopts it; the phone's "Adopt a pet" opens the shelter (40 coins).
Save v7 keeps `side` and `pets` (each with its basket's index in the furniture). Checks and measurements:
[tests/r16-phase5.md](tests/r16-phase5.md).

## How to add a house to the street (the nearest thing to a level)

Round 16: `HOUSES` is filled by `makeTown`. The classic town (seed 0) is the `CLASSIC` list; a seeded town follows
`RECIPE` (four lived in, `h1`–`h4`, and three for sale, `s1`–`s3`). To add a house, add it to `CLASSIC` and a branch
to `makeTown`'s seeded half (numbers come from `RECIPE.numbers`; keep the street under `STREET_SIZE.w`).

1. An entry looks like `{ id: 's4', no: 8, kind: 'sale', size: 3, price: 1500, name: 3, look: { feature: 0xe0e8d0, floor: 'carpet', curtains: 0x406080 } }`.
   `size` indexes `SIZES`; `look` is the wall, floor and curtains (`dressing.mjs` `dressHouse`), and on the street
   `brick` and `roof`; `name` is `house.name.N`. Its front goes up by itself (`streetLayout`, in number order;
   `FRONT.widths` says how wide by size).
2. A house for sale stands empty (the household's own furniture moves in when it is bought). A lived-in house is
   furnished by `houseFurniture(w, d, n, seed)` in `src/world.mjs` (called from `page.mjs`); to give a house its own
   layout, add a branch there that returns `{ id, x, z, turn }` entries using `SHOP` ids.
3. A lived-in house needs people: `COLLEAGUE_HOUSES` and `NEIGHBOURS` in `town.mjs` say who lives where, and
   `page.mjs` (search `NEIGHBOURS`) loads them.

## How to add a new place (a shop, a school, a cinema)

This is the code path, not data:

1. Write `async function lifeCinema(group)` in `src/world.mjs` modelled on `lifeHouse` or `office`: `makeWalls`, `furnish(group, [...])`
   with `[model URL, x, z, turn, fit, use]` placements, and return `{ w, d, walls, items, cell, starts, view }`.
   Add it to `PLACES`.
2. In `src/game/page.mjs`, build it beside the others (`buildPlace('lifeCinema')`, near the `const places = …` line),
   add it to `places`, and add a `'place.cinema'` string.
3. Give something a way there: an offer with `act: 'travel', travel: 'cinema'` (see `goPark` in `actions.mjs`).
4. Dressing (textures, outside) goes in `dressing.mjs`, called from your place function.

## How to add a language

Copy the `en` table in `src/game/strings.mjs` to a new key (`fr: { … }`), translate the values, and call
`setLanguage('fr')`. Missing keys fall back to English.

## Assets: how they were made

The shipped assets are converted copies; the raw sources (Rocketbox FBX files and 2048 px TGA textures, about 250 MB)
are not in this folder and are available on request. People: each Rocketbox adult's `_facial` FBX converted to one GLB
with 1024 px JPEG head textures and 512 px body textures. Animations: Rocketbox's motion-capture FBX clips converted to
small GLBs, one per clip and gender, listed in `assets/anims/index.json`. Furniture and scenery: Quaternius GLBs as
published. `wardrobe/catalogue.json` was measured from the twelve people (which hair and outfits can be borrowed
without holes).

## Watch out

- `page.mjs` owns a lot of state at module level (`home`, `furniture`, `places`); swapping homes goes through `rehome`.
- A synthetic click from a test script makes OrbitControls throw (`setPointerCapture`); the game's handler still runs.
- The walk grid is built once per place from its items; something placed later must call the grid update path the
  shop uses (search `place-bar` in `page.mjs`).
