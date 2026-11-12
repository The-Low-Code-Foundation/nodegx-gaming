# Star Class: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source: one folder per component under
`project/components/<Folder>/<Name>/` (`component.json`, `nodes.json`, `connections.json`). `play/` is its committed web
build; do not hand-edit it, rebuild it.

Star Class is **an edition of Rocket School** (`../rocket-school/`): the same 120 components with a different school
in them. Everything in Rocket School's CLAUDE.md about the component map and the generators holds here; this file
says what is different and how to make another edition.

Work on `project/` through the NodeGX MCP server (`get_component`, `update_component`, `validate_project`,
`render_report`) or in the NodeGX editor. If you edit the JSON by hand, keep the 2-space format and unique node ids,
and validate afterwards.

## Component map (short)

- Pages: `Pages/Profiles` (make a player, pick a class P1–JSS3), `Pages/Home`, `Pages/Race`, `Pages/Merge`,
  `Pages/Hunt`, `Pages/Monster`, `Pages/Hangar`, `Pages/Moon`, `Pages/Expedition`, `Pages/School`, `Pages/Lists`.
- Game parts: `Race/*`, `Merge/*`, `Hunt/*`, `Monster/*`, `Hangar/*`, `Moon/*`, `Trip/*`, `School/*`, shared `Game/*`.
- Logic: `Logic/*`, one Function each. `Logic/Pick next question` holds `generate()` and every question generator
  (Rocket School's plus `countObjects`, `morePile`, `matchNumeral`, `missingNumber`, `oddOne`, `qrSeries`, `indices`,
  `eqTwoStep`, `areaRectTri`, `volumeCuboid`, `dirAddSub`, `dirMulDiv`). `Logic/Grade answer` moves the rating and
  decides the class jump (`jumpTo`). `Logic/App store` is the browser store (key `star-class`).

## Where the content lives

| What | Component | Node |
|---|---|---|
| Every skill (the curriculum) | `Data/Curriculum` | Static Data "EDIT — the skills — this list IS the school" (154 rows) |
| The explainer cards | `Data/Teach cards` | Static Data (22) |
| Every word on screen | `Data/Words` | Static Data (EN and FR; only EN is shown) |
| The hangar shelf | `Data/Hangar` | Static Data |
| Subjects and topics | `Logic/Focus choices`, `Logic/School view`, `Logic/School act` | `SUBJECTS`, `TOPICS` |
| Classes and their starting ratings | `Logic/Focus choices`, `Logic/Resolve focus` and the other `Logic/` scripts that name a class | `LEVELS = ["P1", … "JSS3"]`, `LEVEL_BASE` |
| Default skin tones | `Logic/Create profile` | `SKIN_DEFAULT = ["t3","t4","t5"]` |

A skill entry looks exactly like Rocket School's, with this edition's class in `level` (`"level": "P4"`). A fact bank
is `generator: "list"` with `params.items` of `{ q, a, note }`, each in `{ en, fr }`.

## How to add a question set

1. Add an entry to `Data/Curriculum` (copy one from the same subject). For facts, `"generator": "list"`,
   `"answer": "options"`, four or more items (the wrong buttons are the other items' answers).
2. A new topic: add it to `TOPICS` in `Logic/Focus choices`, `Logic/School view` and `Logic/School act`.
   Star Class's own topics start with `sc-` (`sc-life`, `sc-health`, `sc-geo-africa`, `sc-verbal`, `sc-quant` …).
3. A new subject: add it to `SUBJECTS` in `Logic/Focus choices`.
4. A generated kind: a `myKindQ(p, lang)` function and its `case` in `generate()` in `Logic/Pick next question`.
5. Validate, rebuild `play/`, play the skill once at the class it is for.

## How this edition was made, and how to make another

An AI coder took Rocket School's components and changed only this list, counting every replacement so nothing was
missed, then wrote the result through the NodeGX plan door:

| What | Where it changed |
|---|---|
| Class names `CE2 CM1 CM2 6e` → `P1…JSS3` (P3–P6 are Rocket School's four) | every skill's `level`; `LEVELS`/`LEVEL_BASE` in the `Logic/` scripts; the new-player form's default |
| Start two classes below the one picked; up after 5 right in a row, down after 3 misses | `Logic/Grade answer` (new `jumpTo` output), `Race/Round`, a jump card in `Game/Feedback banner` |
| Number Hunt by class; pictures for P1–P2 | `Logic/New hunt`, `Logic/Build number hunt`, `Hunt/Play` |
| Subjects: typing and history out; Science, Reasoning, Geography in; English vocabulary filed under French | `Data/Curriculum`, `SUBJECTS`, `TOPICS` |
| Money: € → ₦ (English) and FCFA (French), scaled to real prices | the proportion skill, its worked line, its teach card |
| English only on screen | language switch nodes removed from `Game/Header` and `Profiles/New player form` |
| Bigger glyphs when an answer button is a pile of things | one Function added to `Game/Option button` |
| Darker skin tones by default | `SKIN_DEFAULT` in `Logic/Create profile` |
| Name, page titles, store key | `Data/Words`, `nodegx.project.json`, `Logic/App store` |

For your own edition: copy this folder (or Rocket School), rewrite `Data/Curriculum` for your classes, search every
`Logic/` script for the old class names and replace them all, set `SUBJECTS`/`TOPICS`, change the money in the
skills that use it, and give the store a new key in `Logic/App store` so two editions can share a browser. Diff your
copy against the original to check you changed what you meant to and nothing else.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /star-class/
```

`--base-url /star-class/` is required (without it the page is blank at `/star-class/`). The report must say
`"engine": { "kind": "production" }`; never ship a build made with `--allow-development-engine`. The project uses hash
navigation so every page works on a static host. In the NodeGX editor: Deploy → Self Hosting, base URL `/star-class/`.
