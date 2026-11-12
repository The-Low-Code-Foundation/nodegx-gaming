# Olive’s Island: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source: one folder per component under
`project/components/<Folder>/<Name>/` (`component.json`, `nodes.json`, `connections.json`), shared script files in
`project/scripts/`, and three node kits in `project/noodl_modules/`. `play/` is the committed web build; do not
hand-edit it, rebuild it.

Work on `project/` through the NodeGX MCP server (`get_component`, `update_component`, `validate_project`,
`render_report`) or in the NodeGX editor. If you edit the JSON by hand, keep the 2-space format and unique node ids,
and validate afterwards.

## The Olive switch (AI off in this edition)

`project/scripts/olive.js`, first lines: `var OLIVE_ON = false;`. Olive's model features only ever worked inside the
NodeGX desktop shell, which answered `POST /__garden/olive` with a small on-device language model. A plain browser has
no such server, so this edition ships with the switch off. Off means:

| Feature | Where it is gated |
|---|---|
| No call to the model at all (blocks, hints, status, "Try Olive") | `Logic/Ask Olive`, `Logic/Olive status`, `Logic/Try Olive`, `Logic/Owl row` (the hint is never sent to be voiced) |
| No "ask Olive" blocks (read, is it a…?, say thanks) and no generic ask block | `Logic/Palette` |
| No "Olive says…" / "Olive read…" conditions in the if/until picker | `Logic/Kit palette` |
| The four requests that need Olive (`mamie-note`, `rock-flower`, `sami-thanks`, `envelopes`) left out | `Data/Requests` (a Function after the Static Data calls `oliveRequests`: any request whose goal or reference program uses an `olive:` block or `olive_` sensor) |
| Echo, the robot that carries Olive's blocks, not shown; no Olive abilities on robot cards | `Logic/Robot cards` (`oliveHidesRobot`, `OLIVE_ROBOTS`) |
| Olive's lessons and "Olive can't do this here yet" on Skills | `Logic/Lesson rows`, `Logic/Olive held` (`show` is false) |
| "Where Olive lives", "What Olive is allowed to do", "Try Olive" on Grown-ups; "Olive lives on this computer" under the owl | the new component `Logic/Olive switch`, wired On → Mounted in `Grown/Olive panel`, `Grown/Rules panel`, `Grown/House panel` (the Try rows) and `Workshop/Play` (`plOwlMeta`) |

Nothing was deleted: setting `OLIVE_ON = true` brings it all back. Four rows of `Data/Words` were reworded for the
browser and would need their desktop wording back: `guTitle` ("Olive, offline"), `guSub` (the owl's hints, "A small
language model, stored on this computer, only puts them into friendly words and writes the islanders’ thank-yous."),
`guD1` ("No account, no internet, no adverts. The game is installed like any other program.") and `guD2` ("Saved on
this computer. …"), with their French. Turn it on only where something answers `/__garden/olive` (the desktop shell's
contract is the request `{ rung, slots, lang }` and the reply `{ ok, text | value }`); without one, the game falls back
to Olive's written answers.

## Component map

Pages: `Pages/Profiles` (the family's kids), `Pages/Island` (the island, the requests, the robots at work, the shop),
`Pages/Workshop` (teach a job: `Workshop/Play`, `Workshop/Pad`, `Workshop/Runner` (the step loop), `Workshop/Win card`),
`Pages/My robot` (`Robot/*`: paint, hats, upgrades, jobs), `Pages/Skills` (`Skills/*`), `Pages/Grown-ups` (`Grown/*`:
save code, 3D or flat).

Parts: `Garden/*` (top bar, tabs, page head), `Island/*` (world, request card, shop), `Profiles/*`.

Logic, each one `Component Inputs` → one Function → `Component Outputs`:
`Logic/Step` (one step of a program), `Logic/Apply delta` (the only thing that changes the world), `Logic/Fold` /
`Logic/Unfold` / `Logic/Find repeat` (folding repetition into loops), `Logic/Choose hint` + `Data/Hints` (the owl),
`Logic/Palette` / `Logic/Kit palette` (the blocks offered: band × request × robot), `Logic/Start world`,
`Logic/Record step` (the pad), `Logic/Goal met`, `Logic/Island world` / `Logic/Island tick` (robots working on the
island), `Logic/Shop rows` / `Logic/Buy`, `Logic/Land *` (her own land), `Logic/App store` (the browser store),
`Logic/Encode save code` / `Logic/Decode save code`, `Logic/Renderer choice` (3D, falling back to flat when WebGL is
missing or slow).

Scripts (`project/scripts/`, reached in a Function as `Scripts.<file>` when the Function lists the file under Uses):
`engine.js` (tiles, steps, sensors, `goalMet`), `island.js` (the island's laps, shells, `JOB_BONUS`), `save.js` (the
saved family, robots), `fold.js`, `requests.js`, `words.js`, `olive.js` (Olive and the switch).

Kits: `garden-kit` (the Blockly block editor and the flat garden), `garden-3d-kit` (the 3D island, three.js),
`game-kit` (faces). `noodl_modules/kit-provenance.json` records that they came from the NodeGX library; this folder
already holds them, so nothing needs resolving.

## Where the content lives

| What | Component | Node |
|---|---|---|
| The islanders' requests (the levels) | `Data/Requests` | Static Data "EDIT — the requests: this list IS the island" (15; 11 shown with Olive off) |
| Every word, EN and FR | `Data/Words` | Static Data "EDIT — every word of the game" |
| The owl's hints | `Data/Hints` | Static Data |
| Robots | `scripts/save.js` and copies in `Logic/Palette`, `Logic/Robot cards`, `Logic/Island choose`, `Logic/Gift line`, `Logic/Job robot` | `ROBOTS` |

A request:

```json
{
  "id": "path-postbox", "islander": "sami", "band": 1, "plot": { "x": 1, "y": 8 }, "tricks": [1],
  "map": ["GGTGGGTG", "GGGGGGGG", "GGGGGGGH", "PPPPPPPP", "GWWGGRGG", "GGGGGTGG"],
  "things": [{ "kind": "postbox", "id": "postbox", "x": 2, "y": 2 },
             { "kind": "letter", "id": "letter", "x": 2, "y": 2, "to": "Sami" },
             { "kind": "door", "id": "door-sami", "x": 7, "y": 3, "owner": "Sami", "count": 0, "capacity": 1 }],
  "robotStart": { "x": 0, "y": 3, "d": 1 },
  "goal": { "name": "job_done" },
  "palette": ["fwd", "left", "right", "pick", "put"],
  "reward": { "kind": "hat", "id": "cap", "from": "sami" },
  "copyKeys": { "title": "rqPathTitle", "blurb": "rqPathBlurb", "line": "rqPathLine", "reward": "hatCap", "gift": "giftCap" },
  "referenceProgram": [{ "id": 1, "t": "fwd" }, "…"],
  "job": { "targets": ["door-sami"], "home": { "x": 0, "y": 3, "d": 1 } }
}
```

`map` is the 8 × 6 plot, one letter per tile: `G` grass, `P` path, `W` water, `R` rock, `T` tree, `H` house, `F`
flower bed, `B` post box, `L` wall (`W R T H L` block the robot). `plot` is where its top-left corner sits on the island. `goal` is
one named check or a list of them, checked by `goalMet` in `scripts/engine.js`: `job_done`, `uses [block, n]`,
`said [n]`, `no_puddle`, `no_bump`, `senses [sensor, n]`, `handled [kind, n]`, `every_tulip_watered`, `thing_at`,
`robot_at`, `facing`, `carrying`, `bowl_has`, `tulips_watered`, `part_done`. `band` is 1 (ages 7–9) or 2 (10–12). `needs` names the robot
kind the job takes (`pip` by default, `cobble`, `pocket`). `referenceProgram` is a known solution in engine form
(`{ id, t, n?, slots?, body?, else? }`).

## How to add a request (a mission)

1. Copy a request of the same band in `Data/Requests` and give it a new `id`.
2. Pick a free 8 × 6 spot on the island for `plot` (look at the other requests' plots; `Logic/Island world` lays them
   out). Draw its `map`, place its `things`, set `robotStart` and `job` (`targets` are thing ids, `home` where the
   robot ends).
3. Set `goal` from the named checks above, `palette` (the blocks offered), `needs` if not Pip, and a `reward`.
4. Add the words its `copyKeys` name to `Data/Words` (EN and FR): title, blurb, the islander's line, reward, gift.
5. Write `referenceProgram`: a program that solves it. Do not use `olive:` blocks unless the edition has Olive on, or
   the request is hidden.
6. Optional extras keyed by request id (each falls back to a default when absent): the line under the Workshop title in
   `SUBS` in `Logic/Request card`, the job card's words in `CARDS` in `Logic/Job card`, bonus shells in `JOB_BONUS` in
   `scripts/island.js`.
7. Validate, rebuild `play/`, and solve it once in the Workshop at its band.

A new goal kind, block or tile means engine code: `goalMet`, the step function and the tile tables in
`scripts/engine.js`, then the block in `garden-kit` and the palette's `META` in `Logic/Palette`.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /olives-island/
```

`--base-url /olives-island/` is required (without it the page is blank at `/olives-island/`). The report must say
`"engine": { "kind": "production" }`; never ship a build made with `--allow-development-engine`. The project uses hash
navigation so every page works on a static host. In the NodeGX editor: Deploy → Self Hosting, base URL
`/olives-island/`.
