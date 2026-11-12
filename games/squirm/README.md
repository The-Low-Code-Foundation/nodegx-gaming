# Squirm

A Spore-like game about evolution, with a real nervous system inside. Your creature's brain is the wiring of the
worm *C. elegans*: 300 of its 302 nerve cells and the connections between them, as Timothy Busbice published them in
2014. The brain panel on the right draws every cell, from senses on the left to muscles on the right, lit as it fires.
Press **B** and that brain drives the body.

The game is a microscope. Each stage clicks to a lower magnification:

| stage | magnification | you are | what you do |
|---|---|---|---|
| The Drop | ×400 | one worm in a drop of water | eat bacteria, dodge a predator, grow, lay three eggs |
| The Crawl | ×40 | one creature on leaf litter | charm five species by singing their call back, or hunt them |
| The Swarm | ×1 | a whole species | steer up to 80 young with scent; favour a lineage; outbreed the rival nest |

Between generations you spend DNA on body parts in an editor (jaws, eyespots, cilia, spines, a shell, legs…). Every
part grows a new nerve cell, spliced into the real wiring. Then nature rolls one change you did not choose. By the last
stage you cannot design anything: the young hatch from whoever ate the most, with copying errors.

What the brain does not do: steer you to food. The page says so, and so does this README.

## Controls

| stage | keys |
|---|---|
| The Drop | W A S D or hold the mouse to swim · Space dashes · E lays an egg when you have grown · B lets the brain drive |
| The Crawl | W A S D or hold the mouse · Q sings to the nearest creature · 1–4 sing a note back · Space lunges · E at your nest opens the egg · B |
| The Swarm | click the ground for a "food here" scent · right-click or Shift-click for "danger" · click a creature to see its brain · R war cry · C lays a clutch |

## State

Three stages play end to end with an ending, about 20 minutes. A fourth stage (The Sky) is a card only. Progress saves
to this browser between stages. Desktop only: it needs a keyboard.

## Run it locally

```bash
npx serve .            # or: python3 -m http.server 8000
```

It is plain scripts with no modules, so opening `index.html` straight from disk also works.

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/squirm my-game
```

`CLAUDE.md` is the map for an AI coder: where each stage lives and how to add a body part, a species, a mutation or a
stage. Squirm grew out of The Worm Plate (`games/worm-plate` in the same repository), a simulation of the same connectome.
