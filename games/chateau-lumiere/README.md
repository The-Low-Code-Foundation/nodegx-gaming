# Château Lumière

A junior sorceress inherits a haunted fairy-tale château and wins it back, room by room. Each room is dark, dusty and
full of cursed creatures. In a fight, her spell is a question: a right answer casts it, a wrong one (or running out
of time) lets the creature strike. Win a room and it lights up, the creature turns back into what it was before the
curse (a silk butterfly, a hearth fairy, a storybook), and there is a surprise inside: a wardrobe of dresses, a chef
who bakes magic cakes, a stronger staff, a piano to learn, a ball to dance at.

The questions are school work the player picks on the title screen: a school year (French years CP to 5e, roughly
ages 6 to 12), a subject (maths, science, geography, French, English, history, or a mix) and a topic (times tables,
fractions, capitals…).

Made with three.js and an anime heroine (pixiv's VRM sample). Everything else is drawn in code.

## Play it

At https://games.nodegx.io/chateau-lumiere/, or on your own machine:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/chateau-lumiere my-game
cd my-game
npx serve .            # or: python3 -m http.server 8000
```

Then open the address it prints. (Opening `index.html` straight from the disk will not work: the game is ES modules,
which browsers only load through a server.)

## Controls

- **Tap or click the floor** to walk there (far away: she runs). **Drag** to turn the camera.
- Or **arrow keys / WASD** to jog, **Shift** to sprint, **Q / E** to turn.
- Walk up to a door: a card shows the room, its stars and what a wrong answer costs in there. **Enter** or **Space**
  presses its button.
- In a fight: **Magic** (answer a question), **Items** (potions and cakes, free), **Run away**.
- **Escape** or **☰** pauses: change the questions, the thinking time (or no clock), sound and picture quality.

Progress is saved in the browser. "Start a new château…" in the pause menu wipes it.

## What is in it

- **The Grand Hall** and three rooms: the Dressing Room ★, the Kitchen ★★, the Library ★★★★.
- **The Swan Wing**, opened by a key from the Library: the Music Room ★★★, the Tea Room ★★★★ and the Ballroom ★★★★★.
- **Five mini-games** unlocked by won rooms: dress-up, cake and biscuit baking, Hoot's library books (a question at the
  end of each), the piano (reading notes on a stave), and a rhythm dance at the ball.
- Deeper rooms hit harder. Clearing the easy rooms first (a cloak, a better staff) is how you survive the deep ones.

## State

Plays end to end; best on a desktop or a recent tablet (it is a 3D game; there is a low-quality setting for slow
machines). English only. See `CLAUDE.md` for how to add rooms or change the questions.

Assets and their licences: `CREDITS.md`.
