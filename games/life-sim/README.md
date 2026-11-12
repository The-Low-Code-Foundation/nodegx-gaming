# Life Sim

A small, friendly life simulator in the browser: make a Sim, move into a flat with a flatmate, and keep everyone
happy. Needs fall (hunger, energy, bladder, hygiene, fun, social), moods follow, and Sims with free will look after
themselves. Get a job at the office and answer a question at each work station to earn coins and a promotion; make
friends, fall in love, get married, have a baby (and find a nanny or a nursery when everyone is at work). Buy
furniture, move it or put it in boxes, extend your home or buy a bigger house on Sunny Lane, and go round to the
neighbours' parties, invited or not.

Realistic 3D people (Microsoft Rocketbox) with motion-captured animation, in three.js. No romance beyond hugs, a kiss on
the cheek and a wedding; nobody ages or dies.

## How to play

- **Click the floor** to walk there. **Click a thing** (the fridge, the bed, the couch, a person) to see what you can
  do with it; what you pick goes on the to-do list at the bottom.
- **Drag** to look around; scroll to zoom. Walls drop when they are in the way.
- The clock (top left) has pause and three speeds. **Buy things** opens the shop.
- The places bar at the top switches between Home, Work, the Park and the Town.
- **Free will** (bottom left) lets your Sim choose for itself when you have nothing planned.
- The game saves in this browser as you play. The start screen offers to carry on or begin again.

The work questions are maths, French, English, science, history and geography, pitched at a school year you choose in
Settings (French school years, CP to 5e: ages 6 to 12).

## State

Playable end to end, built over fourteen rounds of play-testing on a laptop and a tablet. Not done: the tablet needs a measured performance pass for big parties, a double bed for two, inside walls for
bigger houses, a walk-round furniture shop.

## Run it locally

ES modules need a server (opening `index.html` from disk will not work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

Then open the address it prints. Handy URL switches: `?freewill=0` (nobody acts on their own), `?seed=5` (repeatable
dice, starts straight in, no saving), `?start=10:00` (the clock), `?year=CE2` (the question level).

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/life-sim my-game
```

`CLAUDE.md` is the map for an AI coder: where each thing lives and how to add furniture, an activity, a house or a
language. `CREDITS.md` lists every model, animation and library and its licence.
