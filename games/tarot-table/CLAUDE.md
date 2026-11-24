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
  `pick` (the picker, or "Draw one for me"), `show` (the card, the upside-down switch, the meaning) and `done` (the
  summary). "Where we are in the spread" and "The card on the table" are pure Functions; "Keep this card" and
  "Draw one for me" write the `read*` variables.
- `Pages/Deck`: how the deck works, then any card both ways up, or a random one.
- `Cards/Picker`: suit tabs, then a grid of that suit's cards; sends `picked` with `cardId`. Used by both pages; the
  variable `pickSuit` is shared on purpose.
- `Cards/Face` (the drawn card; it turns 180° when reversed), `Cards/Meaning` (heading, keywords, meaning, question),
  `Cards/Chip`, `Cards/Suit tab`, `Reading/Summary row`, `Home/Spread card`: the parts.
- `Data/Cards`, `Data/Suits`, `Data/Spreads`: the content, as Static Data lists.

## Where the content lives

| What | Component | Node |
|---|---|---|
| The 78 cards: name, keywords, `up`/`askUp`, `rev`/`askRev` | `Data/Cards` | Static Data "EDIT: the 78 cards (this list IS the deck)" |
| The spreads and their positions (`name`, `lead`, `index`) | `Data/Spreads` | Static Data "EDIT: the spreads and their positions" |
| The suit tabs and what each suit is about | `Data/Suits` | Static Data "EDIT: the suits" |

Card ids are `major-00` to `major-21` and `<suit>-01` to `<suit>-14` (Ace to King). The two random draws build the
id list from that rule, so keep it if you add cards.

## How to add a spread

1. In `Data/Spreads`, add `{ "id": "…", "name": "…", "count": "4 cards", "blurb": "…", "positions": [{ "name": "…", "lead": "…", "index": 0 }, …] }`.
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
