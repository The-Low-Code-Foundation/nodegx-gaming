# Olive’s Island

A coding game for 7 to 12 year olds, in English and French. The islanders need a hand: water Mamie Rose's tulips,
carry Sami's letter, fill Biscuit the cat's bowl, lay stones on the path. The player drives a small robot by hand,
watches each step appear as a block (real [Blockly](https://developers.google.com/blockly) blocks), and lets the game
fold the repetition into a loop. Then the robot is put to work: it runs its program on the island, over and over, and
earns shells for the shop, where the player buys land, buildings and animals that need robots of their own.

Nothing is timed, scored or streaked; the reward is a hat or a sticker. Olive is the helper owl: when a run goes wrong
she gives a hint, chosen by the game's own rules.

- **Island**: the 3D island (a flat garden on computers that cannot draw 3D, or draw it too slowly), the islanders'
  requests, the robots at work.
- **Workshop**: teach the robot a job: drive it with the pad, see the blocks, fold, run, predict.
- **My robots**: paint, hats, upgrades, and which job each robot does.
- **Skills**: the tricks the robot has learned (move, repeat, until, if, when, tricks of its own).
- **Grown-ups**: the save code, and 3D or flat.
- Two age bands: 7–9 (pictures, fewer blocks) and 10–12 (conditions, counts, variables).

There is no account and no backend. Each child has her own island, saved in the browser (localStorage, key
`bot-garden`); the save code moves the whole family to another computer.

## About Olive's AI (switched off here)

The original game also ran a small language model (on the computer, inside the NodeGX desktop app) so Olive could
read notes, answer "is it a flower?", write thank-yous and say her hints in her own words, plus a page of lessons about
what such a model can and cannot do. **This browser edition has all of that switched off**: no model, no network call,
no button that needs one. Four requests that only work with Olive's reading (and Echo, the robot that carries those
blocks) are hidden. The switch is one line, `OLIVE_ON` in `project/scripts/olive.js`; CLAUDE.md says what it turns on.

## Play it

Online: <https://games.nodegx.io/olives-island/>

Locally: `play/` is built to live at `/olives-island/`, so serve it there:

```bash
mkdir -p /tmp/oi-site && ln -sfn "$PWD/play" /tmp/oi-site/olives-island
python3 -m http.server 8000 --directory /tmp/oi-site
# open http://localhost:8000/olives-island/
```

Controls: mouse or touch (tap a block to add it, drag to move it; drag the island to look around, pinch or wheel to
zoom). Best on a laptop or tablet.

## It is a NodeGX project

`project/` is the game, made of NodeGX nodes, three node kits and a few shared script files. `play/` is its web build.
To change it, open `project/` in NodeGX (<https://nodegx.io>), or point an AI coder that has the NodeGX MCP server at
`project/`.

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/olives-island my-game
```

## State

Plays end to end with 11 requests (15 with Olive switched on), three robots (four with Olive), the shop, land,
buildings and animals, in two languages and two age bands. A request is data: one JSON entry (its plot's map, the
things on it, the goal as named checks, the blocks offered, the reward) and its words. A few optional per-request
extras (a hint line, a job card, bonus shells) live in small lookup tables in the logic; CLAUDE.md lists them.

Credits and licences: [CREDITS.md](CREDITS.md).
