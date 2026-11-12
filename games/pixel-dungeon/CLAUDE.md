# Pixel Dungeon: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source (one folder per component under `project/components/`);
`play/` is the committed web build. Do not hand-edit `play/`, rebuild it. Work through the NodeGX MCP server
(`get_component`, `update_component`, `validate_project`, `render_report`) or the NodeGX editor; if you edit JSON by
hand keep the 2-space format and unique node ids, and validate.

## Component map

- `Pages/Play`: the whole game: the rooms (Static Data), the state, the four moves, the board, the win and lose checks.
- `Game/Move`: the rule for one step, written once and placed four times (up, down, left, right) with `dx`/`dy`.
- `Game/Row`, `Game/Cell`: the board, two repeaters (rows, then cells); `Game/Cell` colours a tile with a `States` node.
- `Game/Hud`, `Game/Stat`: hearts, coins, room. `Game/KeyCap`, `Game/Teach`: the key legend.
- `App`: the router and the look.
- `noodl_modules/keyboard-shortcuts`: reads the keys. Never delete it: without it the board never answers a key.

Every decision (wall, coin, way out, caught, out of hearts, last room) is a `Condition` node; the `Function` nodes only
answer questions and transform lists.

## Where the content lives

| What | Component | Node |
|---|---|---|
| The rooms (the levels) | `Pages/Play` | Static Data "EDIT — the five rooms — this list IS the game" (5) |
| What each kind of tile looks like | `Pages/Play` | Static Data "EDIT — what each kind of tile looks like" (6) |

## How to add a level

1. In `Pages/Play`, add `{ "name": "…", "grid": "############\n#@...c.....#\n…" }` to the rooms list.
2. 12 columns × 9 rows, one string with `\n` between rows; keep a `#` border; exactly one `@` and at least one `>`.
   `c` coins, `E` creatures that step when you step.
3. Validate, rebuild `play/`, walk it once.

New tile kinds mean a new row in the tile list plus a state in `Game/Cell` and the checks in `Game/Move`.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /pixel-dungeon/
```

`--base-url /pixel-dungeon/` is required (without it the page is blank there). The report must say
`"engine": { "kind": "production" }`; never ship `--allow-development-engine`. Hash navigation is on, for static hosts.
