# Rocket School

Maths, French, English, history and typing practice for 8 to 12 year olds, in English or French. Make a player, then
race the computer to a planet by answering questions. Four games share one learner model:

- **Rocket Race**: answer right and your rocket flies; one player against the computer, or two taking turns.
- **Make Ten Merge**: slide the tiles (arrow keys or buttons); two tiles join only when they make 10, 20, 30…
- **Number Hunt**: tap the numbers that make the target, and find every way.
- **Monster Gate**: three monsters walk to your gate; right answers push them back to their caves.

Stars earned in the games buy rocket parts in the **Hangar**, and adopt and look after little aliens on the **Moon**
(with an Expedition and an alien school). The **Lists** page lets a player type their own revision list, one line per
question (`Neanderthals disappear = around -40 000`), and practise it like any other skill.

The game picks the next question for each player (an Elo-style rating per skill, with reviews spaced out over days), so
a child is asked what they get right about three times in four. A wrong answer never scores, however fast.

There is no account and no backend. Profiles and progress stay in the browser (localStorage). Each player has a
**save code** to carry their progress to another computer.

## Play it

Online: <https://games.nodegx.io/rocket-school/>

Locally: `play/` is built to live at `/rocket-school/` on its server (every file it loads starts with that path), so
serve it there:

```bash
mkdir -p /tmp/rs-site && ln -sfn "$PWD/play" /tmp/rs-site/rocket-school
python3 -m http.server 8000 --directory /tmp/rs-site
# open http://localhost:8000/rocket-school/
```

From a clone of the whole repo, `node site/build.mjs && npx serve _site` does the same for every game.

Controls: mouse or touch everywhere; the keyboard for typed answers and the arrow keys in Make Ten Merge.

## It is a NodeGX project

`project/` is the game, made entirely of NodeGX nodes (no hand-written app code outside the graph). `play/` is its web
build. To change the game:

- open `project/` in NodeGX (<https://nodegx.io>), or
- point an AI coder that has the NodeGX MCP server at `project/`.

Take your own copy:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/rocket-school my-game
```

## Changing the curriculum

Rocket School follows the French primary programmes (classes CE2, CM1, CM2 and 6e). Every question the game can ask is
one entry in a single list, so another school's curriculum is a change of data, not of the game.

- **The skills**: component `Data/Curriculum`, the `Static Data` node labelled *"EDIT — the skills — this list IS the
  school"*. 108 skills ship: maths 54, French 22, English 17, typing 8, history 7. One entry is one skill: its class
  (`level`), its `subject` and `topic`, a `generator` and its `params` (or, for a fact bank, `generator: "list"` with
  `{ q, a, note }` items), the answer mode, how fast counts as fluent, and its name and strategy line in EN and FR.
- **The explainers** a wrong answer opens: `Data/Teach cards` (26).
- **Every word of the interface**: `Data/Words` (EN and FR).
- **The class names** (`CE2`, `CM1`, `CM2`, `6e`) and the subject list also appear in the `Logic/` scripts that
  rate, pick and grade (CLAUDE.md lists them).

**[Star Class](../star-class/)** is the worked example. It is this same game re-cut for school children in
sub-Saharan Africa by an AI coder working through NodeGX: classes P1 to JSS3 instead of CE2 to 6e, Science, Reasoning
and Geography added, typing and French history dropped, prices in naira and CFA francs, English only on screen, and
darker skin tones by default. Nothing about the race, the merge, the hunt, the gate, the hangar or the moon changed.
CLAUDE.md lists the differences file by file.

## State

Plays end to end: four games, the hangar, the moon, profiles, save codes, own lists. The Teach cards page and a
Progress page are not built yet (the parts they need are in `Game/` and `Logic/`).

Credits and licences: [CREDITS.md](CREDITS.md).
