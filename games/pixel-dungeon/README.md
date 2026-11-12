# Pixel Dungeon

A small turn-based dungeon. Walk with the arrow keys (or WASD), collect the coins, find the way out, and watch what
follows you: the creatures only move when you do. Three hearts; five rooms. Dying drops your coins and restarts the
room, not the game.

It is also a NodeGX lesson: every rule is a node you can open and follow, and the rooms are a list of text grids.

## Play it

Online: <https://games.nodegx.io/pixel-dungeon/>

Locally: `play/` is built to live at `/pixel-dungeon/`, so serve it there:

```bash
mkdir -p /tmp/pd-site && ln -sfn "$PWD/play" /tmp/pd-site/pixel-dungeon
python3 -m http.server 8000 --directory /tmp/pd-site
# open http://localhost:8000/pixel-dungeon/
```

Controls: arrow keys or WASD (held keys repeat). Needs a keyboard.

## It is a NodeGX project

`project/` is the game, made of NodeGX nodes; `play/` is its web build. Open `project/` in NodeGX
(<https://nodegx.io>), or point an AI coder that has the NodeGX MCP server at `project/`.

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/pixel-dungeon my-game
```

## Make your own rooms

Open `Pages/Play` and find the node "EDIT — the five rooms — this list IS the game". Each room is a name and a 12 × 9
text grid: `#` wall, `.` floor, `c` coin, `E` a creature, `@` start, `>` the way out. Add an entry and it is the next
room. No code.

Credits and licences: [CREDITS.md](CREDITS.md).
