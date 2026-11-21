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
  (`dressStreet`: name boards, For sale boards and party balloons the page shows and hides).

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
- `town.mjs`: `SIZES` (home sizes), `EXTENSION` prices, `HOUSES` on Sunny Lane, who lives where, `PARTY` timetable,
  `streetLayout()` (where each house's front stands on the street, by number).
- `baby.mjs`, `childcare.mjs`: the baby's needs and names; the nanny and the nursery.
- `create.mjs`, `looks.mjs`: make-your-Sim screen; a Sim's look as data and how it is dressed.
- `props.mjs`: what is in a Sim's hands or on the table, the eating motion, wedding clothes.
- `save.mjs`: the save in `localStorage` (`lifesim.save.v1` key, format v2; a v1 save from an earlier round still
  loads and is upgraded).
- `strings.mjs`: every word, by key (`t('need.hunger')`). English only; a language is a new table with the same keys.

Other files: `index.html` (the HUD's empty panels), `style.css` + `life.css`, `assets/` (models and clips, see
CREDITS.md), `wardrobe/catalogue.json`, `vendor/` (three.js r186 build and the addons it imports, three-vrm).

URL switches (top of `page.mjs`): `?seed=5` (repeatable dice; starts straight in and does not save), `?freewill=0`,
`?person=0…11`, `?flatmate=0…11|none`, `?colleagues=2,3,8,9|none`, `?start=10:00`, `?speed=0…3`, `?year=CE2`,
`?menu` (the start screen and saving on a test URL).

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

## How to add a house to the street (the nearest thing to a level)

1. Add an entry to `HOUSES` in `src/game/town.mjs`: `{ id: 's4', no: 8, kind: 'sale', size: 3, price: 1500, look: { feature: 0xe0e8d0, floor: 'carpet', curtains: 0x406080 } }`.
   `size` indexes `SIZES`; `look` is the wall, floor and curtains (`dressing.mjs` `dressHouse`). Its front goes up on
   Sunny Lane by itself (`streetLayout`, in number order; `FRONT.widths` says how wide by size).
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
