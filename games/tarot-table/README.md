# Tarot Table

A companion for a real tarot deck, made for the table. Pick a spread and the app shows its layout as places on a
table, from one card to the ten of the Celtic Cross. Lay your real card in the glowing place, then tap it in: suit,
then card. The app tells you what the card is about in that position and gives you a question to ask the person. Lay
it upside down and the meaning changes with it. "More about this card" goes deeper: what the picture shows, why the
card means what it does, how it can show up in love, work or inside you, the card as a person, and more questions to
try. At the end you get the whole table, each card read the way it lies, and the reading read all together: the
story in order, what stands out across the cards, the pairs of places to compare, and your question asked again.

Nobody at the table needs to know tarot. The cards don't predict anything here; they give people something to talk
about.

No deck to hand? The app can draw for you. The deck page explains how the 78 cards work and lets you look any of them
up.

## Play it

Online: <https://games.nodegx.io/tarot-table/>

On a phone, open it and add it to the home screen (Safari: Share, then Add to Home Screen; Chrome: the menu, then
Install app). It opens full screen and works offline after the first visit.

Locally: `play/` is built to live at `/tarot-table/`, so serve it there:

```bash
mkdir -p /tmp/tt-site && ln -sfn "$PWD/play" /tmp/tt-site/tarot-table
python3 -m http.server 8000 --directory /tmp/tt-site
# open http://localhost:8000/tarot-table/
```

## It is a NodeGX project

`project/` is the app, made of NodeGX nodes; `play/` is its web build. Open `project/` in NodeGX
(<https://nodegx.io>), or point an AI coder that has the NodeGX MCP server at `project/`.

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/tarot-table my-tarot
```

## Make it your own

Every word a card says is in `Data/Cards`, in the node "EDIT: the 78 cards (this list IS the deck)". Rewrite them in
your own voice, or in another language. The spreads are in `Data/Spreads`: add one and it appears on the home page,
with its own layout on the table (each position has an `x` and `y`), and its `together` list says which places to
compare at the end.

The card pictures are `project/cards/<card id>.svg`, drawn by `node tools/draw-cards.mjs`. Change the drawing code,
or drop in your own picture for any card under the same file name.

Credits and licences: [CREDITS.md](CREDITS.md).
