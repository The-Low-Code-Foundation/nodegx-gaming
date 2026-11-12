# The Castle Holds (Le Château Tient)

A 3D tower defence for one or two players taking turns on the same screen, in French or English. Monsters come out of
the forest along winding paths towards your castle. You do not aim: you **program** your defenders. Each one has a
board of cards you wire together, like "An enemy arrives" → "Is it big?" → yes: Crossbow, no: Arrow. Then you launch
the wave and watch your boards fire.

If the castle holds, the part under construction gets built and new weapons unlock. If three monsters reach the gate,
the construction collapses and you try the stage again. With two players, each guards her own defenders and both must
hold.

Between waves: dress your defender (hair, clothes, hats, armour, a rabbit to ride, later a unicorn), build houses and
farms in the village, recruit villagers as new defenders, add platforms and spikes, and set up a catapult or a cannon.
The castle itself has a board too (raise the drawbridge, ring the bell, send the medics).

## How to play

1. Choose one or two players and type names (or leave them blank).
2. Dress your defender.
3. Read the wave that is coming, then wire each defender's board. Stages 1 to 3 come with a ready-made board and tips.
4. **Ready!**, then **Launch the wave!** Use ⏩ to speed it up.

## Controls

- Mouse or touch for everything: tap a socket then another to tie a string, tap a string to cut it.
- Camera: the view buttons at the top (or keys 1 2 3 4), drag to move, pinch or wheel to zoom, tap a defender to stand
  behind her, ◀ ▶ for the next one.
- In the villager view: arrows, WASD or ZQSD walk her around the village; N picks the next villager.
- The **FR / EN** button switches the language.

## State

Plays end to end; the game saves to this browser after each wave. Balance has had little play: later stages may be
too easy or too hard. Built for a laptop first; it also runs on a tablet.

## Run it locally

The game is one HTML file with three.js vendored next to it. It is an ES module, so serve the folder:

```bash
npx serve .            # or: python3 -m http.server 8000
```

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/the-castle-holds my-game
```

`CLAUDE.md` is the map for an AI coder: where the monsters, weapons, conditions and waves live and how to add one.
