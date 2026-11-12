# The Worm Plate

A worm lives on an agar plate. Its brain is the panel on the right, drawn cell by cell and lit as it fires. Five tabs,
each a different brain or question:

1. **Two cells**: a Braitenberg vehicle. Two light sensors, two motors, and four ways to wire them that look like fear,
   aggression, love and curiosity. Click the dish to add lights.
2. **Touch circuit**: the worm's touch-withdrawal reflex, eight real cell classes after Chalfie's 1985 experiments. Tap
   its head or tail; cut cells and see which reflex stops.
3. **The full 302**: the real *C. elegans* wiring (300 neurons, 3,689 connections, as Busbice ran it on a Lego robot in
   2014). Drop food, watch which cells fire, slow it down to one tick a second.
4. **Evolution plate**: 36 worms with that brain, a toxic patch, food that regrows, an optional predator. Worms that eat
   breed; children mutate; a structural mutation starts a new coloured lineage, and the chart shows which ones take over.
   Learning and the mutation rate can be switched.
5. **The debate**: four ways of looking at each tab (the lab, the armchair, one philosopher's paradigm, the
   supernatural) and your own answer, tab by tab, to "is anyone home?".

It is a simulation to watch and poke, not a game: there is no score and no end.

## Controls

Mouse only: the tabs along the top, the buttons under the dish, clicks on the dish. Works on a tablet.

## State

All five tabs work. Your debate answers and the last tab you opened are kept in this browser only.

## Run it locally

```bash
npx serve .            # or: python3 -m http.server 8000
```

Plain scripts with no modules, so opening `index.html` from disk also works. `index.html#4` opens tab 4.

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/worm-plate my-plate
```

`CLAUDE.md` is the map for an AI coder. The game Squirm (`games/squirm` in the same repository) grew from this page.
