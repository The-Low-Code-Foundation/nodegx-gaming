# Triage

Northgate General Hospital, 03:10. Something got loose on the wards an hour ago, and you, an off-duty police officer
with your sidearm, are on the floor where it started. People are hiding in locked rooms. Open their doors, get them
to the stairs, and get out yourself if you can.

A third-person, over-the-shoulder shooter in the spirit of the old survival-horror games, in three.js with realistic
3D people (Microsoft Rocketbox). Only a headshot kills. Legs slow the infected down; a gunshot brings the near ones
running; swing doors and curtains hide you and them. A bite starts an infection clock. Contains guns, blood and zombies.

## Controls

| | |
|---|---|
| Move | W A S D · Shift sprint · C crouch · T torch · V swap shoulder |
| Cover | Q against a wall, pillar, counter, bed or trolley · A/D slide along it · at a corner you look round it · aim to lean out or pop up |
| Hide | E under a desk or a bed; right mouse holds your breath |
| Fight | right mouse aim · left mouse fire · R reload · F knife or swing · 1 pistol · 2 long gun · 3 melee · 4 knife |
| Save | E opens a locked door, picks a thing up, or knifes one from behind while crouched |
| See | the radar (top left) · M the whole floor · Esc or P pause and settings |

Click to start; the mouse is captured (Esc frees it).

## Modes

- `index.html`: the floor. Reach the stairs to see your tally and spend points on skills; "Next floor" plays the same
  plan with more infected.
- `index.html?sandbox=1`: one room, the infected keep coming through the doors, bites do no harm. Practise cover and
  shooting; the ` key opens a tuning panel (deafening, muzzle flash and more).
- `guns-view.html` and `people-view.html`: viewers for modders (the weapon models and the cast), see `CLAUDE.md`.

## State

A prototype that plays end to end on one floor, built over four rounds of play-testing. Not done: more floors, a
proper bite animation, ragdolls, strafing clips, gamepad, phones. Shadows are off for speed.

## Run it locally

ES modules need a server (opening `index.html` from disk will not work):

```bash
npx serve .            # or: python3 -m http.server 8000
```

## Make it yours

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/triage my-game
```

`CLAUDE.md` is the map for an AI coder (how to draw a new floor, add a weapon or a pickup). `CREDITS.md` lists every
model, clip, texture and sound and its licence.
