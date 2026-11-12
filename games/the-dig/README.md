# The Dig

A first-person voxel dig into an infinite deep. You land in a ship on a blocky planet, go out with a cutter, a
multitool, a grappling hook and unlimited flares, and work your way down through caves, shafts, water and lava.
Down there are rooms someone planted for you: read the stone, carve an answer, and a portal wakes to a small world of
its own with treasure to bring home to your trophy case. Deeper still are the ruins of the people who lived in the
rock, with things carved on their walls to read.

Three.js, plain ES modules, no build step.

## Run it

```sh
python3 -m http.server 8000     # in this folder, then open http://127.0.0.1:8000/
# or: npx serve .
```

Opening `index.html` straight from disk will not work: ES modules need a server.

URL switches: `?fresh=1` (a new cave), `?seed=123` (a given cave), `?peaceful=1` (no crawlers), `?mute=1`,
`?dusk=1` (the sky at dusk), `?lite=1` (a short draw distance for slow machines), `?date=2026-11-01` (pretend it is
that day), `?server=1` (talk to a server of your own, see CLAUDE.md).

## Controls

**Keyboard and mouse.** WASD to move, Shift to run, Space to jump. Left mouse cuts (or fires), right mouse places a
flare. 1 to 4 or the wheel picks from the hotbar. R (hold and let go) sends out the pulse, which shows where the
rock is hollow ahead. E uses and reads. C crafts, T opens the trophy case, Esc pauses. The full list is under
Menu → Controls.

**Phone or tablet (landscape).** Left thumb moves, right thumb looks; buttons for jump, the pulse and whatever is in
hand appear on the right. Add it to the home screen for full screen.

## State

Plays end to end: the cave, the ship, crafting, special ammo, the pulse, crawlers, rooms with portals to their own
worlds, treasure, and one sample district of ruins. Your cave, pack, trophies and carved answers are saved in this
browser's local storage; nothing is sent anywhere.

This copy ships two sample rooms and one sample district. The rooms and the districts are JSON files: CLAUDE.md
explains how to plant your own.
