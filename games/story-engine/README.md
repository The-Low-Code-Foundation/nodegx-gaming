# Story Engine

A branching story you read in the browser: every choice takes you somewhere, some choices hand you something, and some
only appear once you are carrying it. It ships with a short mystery in a lighthouse, seven passages long.

The point is that you write your own. Press **Write your own story**, paste a story in the box, press **Read this
story**, and it plays at once. If something is wrong (a choice that goes nowhere, a passage without an id) it says
which passage and what is missing.

## Play it

Online: <https://games.nodegx.io/story-engine/> (the story editor is at `#/remix`)

Locally: `play/` is built to live at `/story-engine/`, so serve it there:

```bash
mkdir -p /tmp/se-site && ln -sfn "$PWD/play" /tmp/se-site/story-engine
python3 -m http.server 8000 --directory /tmp/se-site
# open http://localhost:8000/story-engine/
```

Controls: click or tap a choice. Works on any device.

## It is a NodeGX project

`project/` is the game, made of NodeGX nodes; `play/` is its web build. Open `project/` in NodeGX
(<https://nodegx.io>), or point an AI coder that has the NodeGX MCP server at `project/`.

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/story-engine my-game
```

## Write a story

A story is a JSON list of passages: `{ "id", "title", "text", "choices": [{ "label", "goto", "gives"?, "requires"? }] }`.
`goto` names another passage, `gives` hands the reader a thing, `requires` hides a choice until they carry it, and a
passage with no choices is an ending. Paste one on the remix page, or replace the list in `Story/Source` to ship it.

Credits and licences: [CREDITS.md](CREDITS.md).
