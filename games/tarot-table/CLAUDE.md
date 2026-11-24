# Tarot Table: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source (one folder per component under `project/components/`);
`play/` is the committed web build plus the PWA layer. Do not hand-edit `play/`, rebuild it. Work through the NodeGX
MCP server (`get_component`, `update_component`, `validate_project`, `render_report`, `drive_page`) or the NodeGX
editor; if you edit JSON by hand keep the 2-space format and unique node ids, and validate.

## What it is for

A phone companion for a physical Rider-Waite-style deck. The person draws a real card and taps it in; the app gives
the meaning in that position and a question to ask. The voice is warm and plain: every meaning ends in a question,
never a prediction. Reversed (upside-down) cards are always offered. Nothing is saved between readings, by choice.

## Component map

- `Pages/Home`: what it is, how to ask a question, the spreads (a Repeater over `Data/Spreads`), the way to the deck.
  Tapping a spread sets `readSpread`, resets the reading and goes to `Pages/Reading`.
- `Pages/Reading`: one position at a time. Three steps, chosen by a States node on the variable `readPhase`:
  `pick` (the table with the next place glowing, then the picker or "Draw one for me"), `show` (the table, the card,
  the upside-down switch, the meaning) and `done` (the whole table, then a summary row per card). "Where we are in the
  spread", "The card on the table" and "Lay out the table" are pure Functions; "Keep this card", "Draw one for me" and
  "Go to the tapped place" write the `read*` variables. `readDrawn` holds one `{ step, cardId, reversed }` per place
  filled, so cards can go down in any order: tapping a place on the table goes to it, and "Next card" moves to the
  next empty place.
- `Pages/Deck`: how the deck works, then any card both ways up, or a random one.
- `Cards/Picker`: suit tabs, then a grid of that suit's cards; sends `picked` with `cardId`. Used by both pages; the
  variable `pickSuit` is shared on purpose.
- `Reading/Table` lays out one `Reading/Slot` per position (absolute, placed by Pos X/Y, turned by Rotation). A slot
  is `empty` (dashed, its number), `here` (glowing), `herecard` (glowing, with the card being looked at) or `filled`.
- `Cards/Face` (the drawn card's picture; it turns 180° when reversed), `Cards/Meaning` (heading, keywords, meaning,
  question), `Cards/Chip` (a mini card: picture and name), `Cards/Suit tab`, `Reading/Summary row`,
  `Home/Spread card`: the parts.
- `Data/Cards`, `Data/Suits`, `Data/Spreads`: the content, as Static Data lists.

## Where the content lives

| What | Component | Node |
|---|---|---|
| The 78 cards: name, keywords, `up`/`askUp`, `rev`/`askRev` | `Data/Cards` | Static Data "EDIT: the 78 cards (this list IS the deck)" |
| The spreads and their positions (`name`, `lead`, `index`, and `x`, `y`, `turn` for the table) | `Data/Spreads` | Static Data "EDIT: the spreads and their positions" |
| The suit tabs and what each suit is about | `Data/Suits` | Static Data "EDIT: the suits" |

| The card pictures | `project/cards/<card id>.svg` | drawn by `node tools/draw-cards.mjs` (it reads the names from `Data/Cards`) |

Card ids are `major-00` to `major-21` and `<suit>-01` to `<suit>-14` (Ace to King). The two random draws build the
id list from that rule, so keep it if you add cards. The app asks for `cards/<id>.svg`, so a card's picture can be
replaced by any portrait image (about 7 by 12) saved under that name; `tools/draw-cards.mjs` overwrites all 78.

## How to add a spread

1. In `Data/Spreads`, add `{ "id": "…", "name": "…", "count": "4 cards", "blurb": "…", "positions": [{ "name": "…", "lead": "…", "index": 0, "x": 0, "y": 0 }, …] }`.
   `x` and `y` put the card's middle on the table, in card widths (a card is 1 wide and 1.7 tall; 1.2 apart leaves a
   gap). `"turn": 90` lays a card sideways. The table scales the whole layout to fit, so only the proportions matter.
2. Validate, rebuild `play/`, and walk one reading of it.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /tarot-table/
node pwa/install.mjs play
```

`--base-url /tarot-table/` is required (without it the page is blank there). The report must say
`"engine": { "kind": "production" }`. `pwa/install.mjs` must run after every build: it copies the manifest and icons,
adds the install tags to `index.html`, and writes `sw.js`, which keeps the build's files for offline use under a
cache named after the build's hash. Hash navigation is on, for static hosts.
