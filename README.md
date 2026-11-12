# NodeGX Games

Free browser games from [NodeGX](https://nodegx.io), made by [The Low Code Foundation](https://nodegx.io/foundation/).
Play them at **https://games.nodegx.io**, then clone one and build your own.

## Clone one game

Every game folder stands on its own. This copies just one, without the rest of the repo:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/threadspace my-space-game
cd my-space-game
npx serve .
```

Then open the folder with Claude Code (or any AI coder). Each game has a `CLAUDE.md` that maps the code and says,
step by step, how to add a level.

## What's here

Games are sorted as **educational** or **casual**, and each has a readiness letter:

- **A, build levels today**: levels and content are data files.
- **B, playable**: plays end to end; levels live in code, so make a level format first.
- **C, prototype**: a slice or a toy; finish the game loop first.

Most games are plain HTML and JavaScript modules with their libraries vendored: no install, no build step.
A few are **NodeGX projects**: `project/` opens in the NodeGX editor and `play/` is the web build.

## Working on the repo

- `games/<slug>/`: one folder per game. The contract is in [CLAUDE.md](CLAUDE.md).
- `site/`: the gallery. `node site/build.mjs` writes `_site/`; GitHub Actions publishes it on every push to `main`.

## Licence

Code: GPL-3.0 ([LICENSE](LICENSE)), the same licence as NodeGX. Assets keep their own licences, listed in each game's `CREDITS.md` (many are CC0, CC BY or MIT).
