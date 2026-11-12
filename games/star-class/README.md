# Star Class

Maths, English, Science, Reasoning, Geography and French practice for school children from Primary 1 to Junior
Secondary 3 (P1 to JSS3), made for classrooms and homes in sub-Saharan Africa. Make a player, pick a class, and race the
computer to a planet by answering questions.

**Star Class is the worked example of a curriculum swap.** It is [Rocket School](../rocket-school/) (a game built on
the French primary programmes) re-cut for another school system by an AI coder working through NodeGX. The four games,
the learner model, the hangar and the moon are Rocket School's, unchanged. What changed is the school:

- nine classes, P1 to JSS3, instead of four French ones;
- Science, Reasoning (series, odd one out, missing numbers, in the style of entrance exams) and Africa and world
  Geography added; typing and French history removed; P1 and P2 questions that need no reading;
- prices in naira (and CFA francs in the French text), at real prices;
- English on screen (French is taught as a subject);
- a new player's face uses darker skin tones by default.

The class a child picks is a first guess: a new player starts two classes below it, and the race moves them up a class
after five right answers in a row, or down after three misses, with a card saying so.

The games:

- **Rocket Race**: answer right and your rocket flies; one player against the computer, or two taking turns.
- **Make Ten Merge**: slide the tiles; two tiles join only when they make 10, 20, 30…
- **Number Hunt**: tap the numbers that make the target, and find every way. P1 and P2 see pictures, not sentences.
- **Monster Gate**: right answers push the monsters back to their caves.

Stars buy rocket parts in the **Hangar** and look after aliens on the **Moon**. Nothing is downloaded while playing:
no account, no backend, no network. Progress stays in the browser (localStorage, key `star-class`), and every player
has a **save code** to move to another device.

## Play it

Online: <https://games.nodegx.io/star-class/>

Locally: `play/` is built to live at `/star-class/`, so serve it there:

```bash
mkdir -p /tmp/sc-site && ln -sfn "$PWD/play" /tmp/sc-site/star-class
python3 -m http.server 8000 --directory /tmp/sc-site
# open http://localhost:8000/star-class/
```

Controls: mouse or touch everywhere; the keyboard for typed answers and the arrow keys in Make Ten Merge. It is
built to work on a phone at 390 px.

## It is a NodeGX project

`project/` is the game, made entirely of NodeGX nodes. `play/` is its web build. To change it, open `project/` in
NodeGX (<https://nodegx.io>), or point an AI coder that has the NodeGX MCP server at `project/`.

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/star-class my-game
```

To make your own edition for another country, start from this folder or from Rocket School: CLAUDE.md lists exactly
which components carry the classes, the subjects, the money and the name.

## State

Plays end to end. 154 skills: maths 73, French 33, English 16, Science 11, Geography 11, Reasoning 10. Like Rocket
School, the Teach cards page and a Progress page are not built yet.

Credits and licences: [CREDITS.md](CREDITS.md).
