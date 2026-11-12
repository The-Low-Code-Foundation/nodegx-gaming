# nodegx-gaming: how this repo works

Free browser games from the NodeGX project (The Low Code Foundation), playable at https://games.nodegx.io and
meant to be **cloned and changed with an AI coder**. Each game is a starting point: build your own levels, swap
the art, change the rules.

## The one rule: every game folder stands alone

`games/<slug>/` must work when it is copied out of this repo on its own:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/<slug> my-game
```

So a game folder never imports from another game folder or from the repo root. Libraries it needs (three.js and
so on) are vendored inside it under `vendor/`, with their licence files. No `npm install`, no build step: plain
ES modules, opened through any static server.

## Two kinds of game

- **`static`**: the folder is the game. `index.html` at the folder root, code in `src/`, assets in `assets/`.
  Run it with `npx serve .` or `python3 -m http.server` in the folder. (A `file://` open will not work: ES modules
  need a server.)
- **`nodegx`**: a NodeGX project. `project/` is the project you open in the NodeGX editor (or drive with the NodeGX
  MCP server); `play/` is its web build, committed, because building needs the NodeGX toolchain. After changing
  `project/`, rebuild `play/` with NodeGX's deploy (see that game's CLAUDE.md).

## What every game folder has

| File | What it is |
|---|---|
| `game.json` | The card on the gallery: title, category, readiness, how to play. Schema below. |
| `README.md` | For a person: what the game is, how to run it, controls, what state it is in. |
| `CLAUDE.md` | For an AI coder: the code map, and **how to add a level / content**, step by step, with the exact files. |
| `CREDITS.md` | Every third-party asset and library, its author, its licence, its source URL. |
| `thumb.jpg` | 640×360 picture for the gallery card, under 150 KB. |

## `game.json`

```json
{
  "slug": "threadspace",
  "title": "ThreadSpace",
  "tagline": "One sentence a stranger understands.",
  "category": "casual",
  "kind": "static",
  "play": "index.html",
  "readiness": "B",
  "readinessNote": "What a person taking it over gets, and what they would build first.",
  "buildYourOwn": "What you can add: levels, ships, rooms…",
  "controls": "Keyboard and mouse",
  "devices": ["desktop"],
  "languages": ["en"],
  "tags": ["3d", "space"],
  "licence": "GPL-3.0 for the code; assets as listed in CREDITS.md"
}
```

`category` is `educational` or `casual`. `play` is the path to the playable page inside the folder (`index.html`
for static games, `play/index.html` for NodeGX ones). `devices` is any of `desktop`, `phone`, `tablet`, `tv`.

Readiness:

- **A**: content is data. You can build levels today without touching the engine.
- **B**: plays end to end, but levels live in code. Expect to make a level format first (CLAUDE.md says where).
- **C**: a slice or a toy. Expect to finish the game loop before building levels.

## What never goes in this repo

This repo is public. Nothing about the people the games were first made for: no names of family members, no
birthdays or birth years, no schools, no towns, no saves, no play-test logs, no answers someone typed. Games say
"mum", "dad", "the player". No API keys, no local paths (`/Users/...`), no AI calls switched on by default: a game
that has an optional AI feature ships with it off and works fully without it.

## Licence

Code is GPL-3.0, the same as NodeGX (root `LICENSE`). Third-party assets keep their own licences; every one is
listed in the game's `CREDITS.md`. An asset whose licence does not allow redistribution never goes in.

## The gallery

`site/build.mjs` reads every `games/*/game.json` and writes `_site/`: the gallery page plus each game's playable
folder at `/<slug>/`. GitHub Actions runs it on every push to `main` and publishes to GitHub Pages
(`games.nodegx.io`). Run it locally:

```bash
node site/build.mjs && npx serve _site
```

## Adding a game

1. Make `games/<slug>/` with the files above. Static and self-contained.
2. `node site/build.mjs` must pass (it checks every `game.json`).
3. Play it from `_site/` before you push.
