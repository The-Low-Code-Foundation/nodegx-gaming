# Lab Rat

Kestrel Deep Research Annex, Sublevel C, 02:47. You analyse materials on the night shift, and something has come
through from the Fold. You start with a pipe wrench. Get to the east freight lift.

A first-person shooter where the creatures are an ecology, not a list of enemies, and learning how they behave is
how you win:

- **Skitters** are blind and hunt by sound. Sprinting and gunfire carry; crouching is nearly silent; a thrown can
  pulls them away. They chatter just before they leap.
- **Tenders** drift from crystal to crystal, tending them. They are not hostile, and Skitters will not cross their
  light. Hurt one and it screams, and everything nearby comes running.
- **Bulwarks** have armoured fronts and charge blind. Dodge so it hits something solid, then go for the soft back.

Every behaviour you witness goes into your **field notes** (Tab). The end card shows how many of the ten observations
you made. One level, 5 to 10 minutes, with checkpoints and instant retries. Sounds and textures are generated in the
browser; the creatures are 3D models by other artists (see `CREDITS.md`).

## Controls

WASD move · mouse look · Shift sprint (loud) · C crouch (quiet) · Space jump · left mouse swing or fire · R reload ·
1 wrench, 2 SMG, 3 crystal shard (or the mouse wheel) · E use, pick up, or tell a survivor to wait or follow ·
G throw a can · F torch · Tab field notes · Esc pause. Click to start; the mouse is captured. Headphones help.

URL switches: `?god=1` (no damage), `?nobloom=1` (no glow pass, for slow machines), `?at=garden` or `?at=bay` (start
further in).

## State

A complete test level from the first prototype rounds: the loop, the three species, a survivor who follows you, a
squad of soldiers at the end, and the notebook. Not done: a second level, real people models (the humans are still
simple shapes), recorded sounds.

## Run it locally

ES modules need a server (opening `index.html` from disk will not work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

`studio.html` shows every procedural model on a turntable (`?m=skitter&a=windup&dark=1`).

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/lab-rat my-game
```

`CLAUDE.md` is the map for an AI coder (how to add a room, a pickup, a creature or a field note). `CREDITS.md` lists
every model and its licence; the Skitter model is CC BY-SA, so a changed copy of it must stay CC BY-SA.
