# The Dig: notes for an AI coder

A static game: `index.html` loads `src/game.mjs` as an ES module; three.js comes from `vendor/three/` through the
import map in `index.html`. No build step. Serve the folder (`python3 -m http.server`) and open it.

## Code map (`src/`)

| File | What it does |
|---|---|
| `game.mjs` | The loop and the glue: loads the save, today's rooms and the districts, builds the cave, the player, the menu, the stone and the portal, saving. Start here. |
| `world.mjs` | Chunked voxel world: meshing, edits, the block grid. |
| `gen-cave.mjs` | The cave generator: terrain, caves, shafts, water, lava, ores, the ship, lairs, vaults, the small finds, where rooms go (`placeRoom`). |
| `gen-settle.mjs` | The settlement engine: turns a district + a style into ruined rooms, passages and readable spots (anchors). |
| `districts.mjs` | Puts a district file's texts on the anchors the settlement left standing; the secret chamber. |
| `gen-secret.mjs` | Builds the small world behind a room's portal from the room's `world` block. |
| `blocks.mjs` | Block ids and the painted texture atlas. |
| `player.mjs`, `input.mjs` | Movement and physics; keyboard, mouse and the touch controls (stick, look, buttons). |
| `items.mjs`, `weapons.mjs`, `ammo.mjs` | The cutter, multitool, grappling hook, flares; firing; special ammo kinds and odds. |
| `mobs.mjs` | Crawlers, brutes and the rest. |
| `pulse.mjs` | The pulse: the cone that shows hollow rock. |
| `hud.mjs`, `overlay.mjs`, `sky.mjs`, `audio.mjs`, `noise.mjs` | Screens and cards, overlays, the sky, sound (samples in `assets/sfx/` plus synthesised), seeded noise. |

Everything is deterministic from the cave's seed: the same seed and the same data files give the same cave.

## Your data, and where it goes

| File | What it is |
|---|---|
| `sample-plants.json` | Today's rooms (the "plants"). Every player gets them. |
| `districts/index.json` | The district ids to build, oldest first. |
| `districts/<id>.json` | One district each. |
| `districts/styles.json` | The building styles a district can use. |

Saves live in the browser (`localStorage` keys `the-dig-save-v1`, `the-dig-trophies`, `the-dig-pending-answers`).
**After changing a data file, open the game with `?fresh=1`**: a saved cave keeps the rooms and districts it already
placed.

## Add a room (a "plant")

A room is a chamber cut into the rock near where the player starts, with a stone in it. The stone shows the room's
title, instructions and ask; the player carves an answer, and a portal opens to a small world built from `world`.
Add an object to `plants` in `sample-plants.json` (1 to 6 rooms). An invented example:

```json
{
  "id": "lighthouse-keeper",
  "kind": "learn",
  "title": "The light that turns",
  "instructions": "A lighthouse lens bends the lamp's light into one flat beam. Turning the lens is what makes the flash.",
  "ask": "Write one thing you would want to light up, and why.",
  "world": {
    "name": "Foghorn Point",
    "theme": "ruins",
    "sky": "#9ab0c8",
    "ground": "#6a7a5a",
    "accent": "#ffd060",
    "foliage": "#4a6a3a",
    "enemies": "beasts",
    "treasure": [
      { "id": "lens-shard", "name": "Lens shard", "description": "A curved piece of glass that throws rainbows." }
    ],
    "notes": [{ "title": "On the tower door", "text": "Keeper's rule: wind the clockwork at dusk." }]
  }
}
```

Field by field (the limits are the ones the game was written against):

- `id`: lower-case slug (`a-z`, `0-9`, `-`), unique in the file. The answer is stored against it.
- `kind`: `task`, `learn`, `reflect`, `body` or `people`. Only sets the small label over the stone.
- `title` (≤ 70 characters), `instructions` (≤ 700), `ask` (≤ 300): what the stone says.
- `world.name` (≤ 50): the name shown in the portal world.
- `world.theme`: `forest`, `field`, `desert`, `tundra`, `jungle`, `cavern`, `station` or `ruins`.
- `world.sky`, `world.ground`, `world.accent`, `world.foliage`: optional `#rrggbb` colours.
- `world.enemies`: optional, `none` (default), `bugs`, `robots` or `beasts`.
- `world.treasure`: 1 to 4 items, each `id` (slug, unique across rooms and the trophy case), `name` (≤ 40),
  `description` (≤ 200). They go to the trophy case when found.
- `world.notes`: up to 3, each `title` (≤ 60) and `text` (≤ 900), readable in the portal world.
- The file's top-level `note` (≤ 400) is optional.

## Add a district (ruins with texts to read)

1. Write `districts/d002-yourname.json` (id: `d` + three digits + a neutral slug).
2. Add `"d002-yourname"` to `districts` in `districts/index.json`.
3. Open with `?fresh=1`. A district that names a style not in `styles.json`, or that finds no room in the rock, is
   skipped silently.

An invented example:

```json
{
  "v": 1,
  "id": "d002-pumpworks",
  "name": "The Pumpworks",
  "style": "st-01",
  "size": "few",
  "ruin": 0.5,
  "place": { "near": "ship", "dist": [30, 60], "depth": [20, 40] },
  "practices": [],
  "texts": [
    { "id": "door", "kind": "lintel", "body": "Keep the water moving and it keeps you." },
    { "id": "log", "kind": "tablet", "title": "Pump log", "body": "Third pump stopped at the change of shift. We cleared the grate and found it full of pale roots growing up from below, which should not be possible this deep. We cut them back and the pump ran again. Nobody wants the night shift now." }
  ],
  "secret": {
    "id": "spare-room",
    "way": { "kind": "behind", "text": "door" },
    "cache": true,
    "texts": [{ "id": "hidden", "kind": "note", "title": "Under the floor", "body": "If you are reading this, the pumps have stopped. Go up, not down." }]
  },
  "tuning": { "text": "log", "reach": 40 }
}
```

- `v`: 1. `name` (2 to 40): shown over its texts. `style`: an `id` from `styles.json`.
- `size`: `few`, `village` or `town`. `ruin`: 0 to 1, how much of it fell (some pockets always stay whole).
- `place` (optional): `near: "ship"`, `dist` [min, max] blocks out from the ship, `depth` [min, max] blocks down.
- `practices`: a list of strings carried along with the texts; the engine does not read it, `[]` is fine.
- `texts`: each `id` (slug), `kind`, optional `title` (≤ 40), `body`. Kinds and lengths in characters:
  `lintel` 20 to 80 (over a doorway), `mural` 20 to 120, `statue` 20 to 120, `song` 40 to 300, `note` 60 to 400,
  `tablet` 150 to 500, `stone` 200 to 700 (`KINDS` in `src/districts.mjs`). 20 to 40 texts make a full district.
- `secret` (optional): a sealed chamber cut behind the wall that carries the text named in `way.text`; `cache: true`
  puts a cache on its floor; its 1 to 4 `texts` are on a shelf inside.
- `tuning` (optional): reading text `text` raises the pulse's reach to `reach` blocks (30 to 60; it starts at 28).

## Add a style

`districts/styles.json` holds the styles; a district picks one by `id`. Fields: `setting` (`rock-cut`, `cavern`,
`water`, `crystal` or `archive`: the space at the heart), `depth` [min, max], `palette` (`wall`, `floor`, `trim`,
`accent`, `light`: materials), `proportions` (`roomHeight`, `roomWidth`, `passageWidth` as [min, max]; `ceiling`
`flat`, `vault`, `dome` or `stepped`; `doorway`; `pillarEvery`), `spaces` (weights for `home`, `store`, `vent`,
`stair`, `hall`, `cistern`, `shrine`, `workshop`, `refuge`, `library`, `garden`) and `decor` (materials). The
material names are the keys of `materialBlock()` in `src/gen-settle.mjs`.

## An optional server

With `?server=1` the game also calls, relative to the page: `GET api/save`, `POST api/save` (the whole save),
`GET api/today?date=YYYY-MM-DD` (returns `{ date, source: "nightly" | "older", note?, plants: [...] }`, the same
plants format as above, in place of `sample-plants.json`), `GET api/answers` and `POST api/answer`
(`{ date, plantId, title, text }`), `GET api/trophies` and `POST api/trophies` (`{ trophy }`). Without the switch
no request leaves the page and everything stays in the browser. That is how rooms could be written fresh each day,
by hand or by a script you run, from what the player carved: nothing of the kind ships here.
