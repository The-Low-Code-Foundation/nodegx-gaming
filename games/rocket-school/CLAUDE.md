# Rocket School: notes for an AI coder

A NodeGX project (`kind: nodegx`). `project/` is the source: a graph of nodes stored as JSON files, one folder per
component under `project/components/<Folder>/<Name>/` (`component.json`, `nodes.json`, `connections.json`). `play/` is
the committed web build of it. There is no other source: do not hand-edit `play/`, rebuild it.

Work on `project/` through the NodeGX MCP server (`get_component`, `update_component`, `validate_project`,
`render_report`) or in the NodeGX editor. If you edit the JSON by hand, keep the files' format (2-space JSON), keep node
ids unique across the project, and validate afterwards.

## Component map

Pages (each is a `Page` node; the router lists them):

- `Pages/Profiles`: pick or make a player (name, face, class, language).
- `Pages/Home`: the player's day (reviews due, stars) and the four games.
- `Pages/Race`: Rocket Race. `Race/Setup` (what to practise, solo or two players, practice or timed), `Race/Round`
  (one question, its answer pad and verdict), `Race/Play`, `Race/Result`.
- `Pages/Merge`: Make Ten Merge (`Merge/Play`, `Merge/Row`, `Merge/Tile`).
- `Pages/Hunt`: Number Hunt (`Hunt/Play`, `Hunt/Row`, `Hunt/Tile`).
- `Pages/Monster`: Monster Gate (`Monster/Setup`, `Monster/Play`, `Monster/Lane`).
- `Pages/Hangar`: spend stars on rocket parts (`Hangar/*`; the shelf is `Data/Hangar`).
- `Pages/Moon`, `Pages/Expedition`, `Pages/School`: the aliens' moon, a walk on a planet, the alien school (`Moon/*`,
  `Trip/*`, `School/*`).
- `Pages/Lists`: the player's own revision lists (`Lists/Editor`, `Lists/Set row`).

Shared parts: `Game/*` (header, question box, option buttons, feedback banner, keyboard, race track, face, teach
card, focus picker). Logic: `Logic/*`, each one `Component Inputs` → one `JavaScriptFunction` → `Component Outputs`:
`Pick next question` (the question generators live here, in `generate()`), `Grade answer` (the rating, the spacing,
mastery), `Focus choices` / `Resolve focus` (the subject/topic/skill chooser), `Save model` and `Logic/App store`
(the browser store, key `rocket-school`), `Encode save code` / `Decode save code`, the per-game `New …` / `… move` /
`Draw …` / `Finish …` utilities, `Moon act` / `Moon view`, `Trip act` / `Trip view`, `School act` / `School view`.

Library modules in `project/noodl_modules/`: `game-kit` (faces, race track, answer pad, aliens, sounds),
`keyboard-shortcuts` (arrow keys in Merge), two font packs. They ship inside the project; never delete them.

## Where the content lives

| What | Component | Node |
|---|---|---|
| Every skill (the curriculum) | `Data/Curriculum` | Static Data "EDIT — the skills — this list IS the school" (108 rows) |
| The explainer cards | `Data/Teach cards` | Static Data "EDIT — the explainers, one per idea" (26) |
| Every word on screen, EN and FR | `Data/Words` | Static Data "EDIT — every word of the interface" (187) |
| Typing word lists | `Data/Word lists` | Static Data (EN, FR) |
| The hangar shelf | `Data/Hangar` | Static Data (47 parts) |
| Subjects and topics (the chooser) | `Logic/Focus choices`, `Logic/School view`, `Logic/School act` | `SUBJECTS`, `TOPICS` at the top of each script |
| Class names and their starting ratings | `Logic/Focus choices`, `Logic/Resolve focus` and 15 other `Logic/` scripts | `LEVELS`, `LEVEL_BASE` |

A skill entry:

```json
{
  "id": "table-8", "level": "CE2", "subject": "maths", "topic": "tables", "strand": "calc",
  "generator": "table", "params": { "table": 8, "min": 1, "max": 10, "bothWays": true },
  "answer": "typed", "fluentMs": 3500, "diff": 0.6,
  "name": { "en": "8 times table", "fr": "Table de 8" },
  "strategy": { "en": "Times 8 is double, double, double.", "fr": "Fois 8, c’est doubler trois fois." },
  "teach": "tables"
}
```

`generator` is one of the cases of `generate()` in `Logic/Pick next question` (31 of them: `table`, `add`, `bond`,
`fracCompare`, `conjugate`, `list` …). `answer` is `typed` or `options`. `teach` names a card in `Data/Teach cards`.

## How to add a question set

1. **A fact bank** (no code): add an entry to `Data/Curriculum` with `"generator": "list"`, `"answer": "options"` and
   `params.items`, each item `{ "q": {en, fr}, "a": {en, fr}, "note": {en, fr} }`. The wrong buttons are the other
   items' answers, so give at least four items. Use an existing `subject` and `topic`.
2. **A new topic**: add `{ "id", "subject", "name": {en, fr} }` to `TOPICS` in `Logic/Focus choices`,
   `Logic/School view` and `Logic/School act` (the same list in all three).
3. **A new subject**: add `{ "id", "name": {en, fr}, "glyph" }` to `SUBJECTS` in `Logic/Focus choices`.
4. **A generated skill** (numbers made fresh each time): write a `myKindQ(p, lang)` function beside the others in
   `Logic/Pick next question` that returns the same shape they do, add its `case` to `generate()`, then add the skill
   entry. Copy the nearest existing generator.
5. **An explainer**: add a card to `Data/Teach cards` and name its id in the skill's `teach`.
6. Validate the project, rebuild `play/` (below), play the new skill once.

A player can also add their own lists in the game (Lists page) without any of this.

## Changing the curriculum: Star Class is the worked example

`../star-class/` is this game re-cut for another school system. It was made by an AI coder: a script took Rocket
School's components and changed a short, counted list of things, then wrote the result through the same NodeGX plan
door. Diffing the two projects shows 65 files differ, all in `Data/`, `Logic/`, five `Game/`/`Race/`/`Profiles/`
parts, the page titles and the project file. What actually changed:

- **Classes**: `CE2 CM1 CM2 6e` became `P1 P2 P3 P4 P5 P6 JSS1 JSS2 JSS3` everywhere they appear (`LEVELS`,
  `LEVEL_BASE`, every skill's `level`, the new-player form's default). A new player starts two classes below the one
  picked, and the race moves the player up a class after 5 right answers in a row and down after 3 misses, with a card
  on the verdict saying so (new nodes in `Game/Feedback banner`, `Logic/Grade answer`, `Race/Round`).
- **Subjects**: typing and French history dropped; Science, Reasoning (Common Entrance style series, odd one out,
  missing numbers) and Africa/world Geography added; P1–P2 skills that need no reading (count the objects, which pile
  is bigger); JSS maths (indices, two-step equations, area, volume). 108 skills became 154; 26 teach cards became 22.
- **Money**: euro questions became naira in English and CFA francs in French, with prices scaled to real ones.
- **Language**: English only on screen (the language switch nodes were removed from `Game/Header` and the new-player
  form); French stays as a school subject.
- **Faces**: a new face picks among the darker skin tones by default (`SKIN_DEFAULT` in `Logic/Create profile`).
- **Name and store**: "Star Class", storage key `star-class`, so both games can live in one browser.

To make your own edition, do the same: copy this folder, change `Data/Curriculum` and the lists above, search the
`Logic/` scripts for the old class names, and give the store a new key in `Logic/App store`.

## Rebuild `play/`

From this folder, with Node 20+:

```bash
rm -rf play
npx --yes --package @nodegx/preview@0.2.9 nodegx-deploy project play --base-url /rocket-school/
```

`--base-url /rocket-school/` is required: the build loads every file from that path, and without it the page is blank
when served at `/rocket-school/`. The deploy must report `"engine": { "kind": "production" }`; never ship a build made
with `--allow-development-engine`. The project uses hash navigation (`navigationPathType: "hash"` in
`nodegx.project.json`) so every page works on a plain static host. In the NodeGX editor the same build is Deploy →
Self Hosting with base URL `/rocket-school/`.
