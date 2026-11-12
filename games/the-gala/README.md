# Le Gala de danse

You run a small dance school, and tonight is the gala: every class dances one number on a big stage, in front of
every parent. A Sims-like 3D school, from the car park to the dressing room to the stage.

You prepare the evening in a side sheet, one tab per problem: the **running order** (the little ones must finish by
20:45, the hall closes at 21:00, hair and costume changes take time), each class's **formation and dance** (spacing on
the stage, counts that must fill the music exactly), **costumes**, the **dressing room** (place furniture: mirrors for
hair, seats, a rail, a fan…), the **snacks** (kcal and juice for everyone), and from season 2 the **car park** (bays,
gate rate, arrival times). Then you watch the evening happen. Nothing is marked right or wrong: the little ones fall
asleep, a dancer's hands touch her neighbour's, the cake runs out before the seniors get any. "Pourquoi ?" shows the sum.

The dress rehearsal is free, as often as you like; the gala night counts. Each gala earns stars for the shop (new
costumes, furniture, a bigger stage) between seasons. Four seasons: the first gala, the car park, the teens arrive
(hip-hop), the mums want to dance.

Aimed at ages 10 to 13 (French collège maths: durations, proportions, multiplication, area and spacing). French by
default, English with one button.

## Play it

At https://games.nodegx.io/the-gala/, or on your own machine:

```bash
npx tiged The-Low-Code-Foundation/nodegx-gaming/games/the-gala my-gala
cd my-gala
npx serve .            # or: python3 -m http.server 8000
```

Then open the address it prints. (Opening `index.html` from the disk will not work: ES modules need a server.)

## Controls

- The side sheet: tap the tabs, drag the programme cards to reorder, drag a dancer’s dot on the stage plan to move her.
- The 3D view: drag to pan, wheel or pinch to zoom, **Q / E** to turn, arrow keys to pan, **R** to rotate a piece of
  furniture you are placing.
- 🔊 sound on/off, **EN / FR** language.

Progress is saved in the browser.

## State

Plays end to end, four seasons and a free season after. Engine tests: `node --test tests/*.test.mjs` (Node 20+).
See `CLAUDE.md` to add dances, costumes, furniture or a whole new challenge. Credits: `CREDITS.md`.
