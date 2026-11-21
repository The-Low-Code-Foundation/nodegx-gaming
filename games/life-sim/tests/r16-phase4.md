# Round 16 checks: a town that lives without you (roadmap phase 4)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase3.md](r16-phase3.md).
The browser pane that ran them was hidden, so its animation frames were held back. The checks called `advance(minutes)`
(which runs `townTick`, and so town life and the town coming to you) and played town days with `playTownDay(day)`.
Town life is off on a test URL unless `?townlife=1`.

## Town life (4.1)

| How | Expect |
|---|---|
| `?seed=5&flatmate=7&townlife=1&town=1`, a week (`advance(1440)` × 7) | day 4: Gus (sharing no. 4) gets a place of his own at no. 3; day 6: Eva and Jules sweethearts, Dora moves to no. 5 (traits lazy/grumpy/joker, dream "A big family"); no. 8 still for sale |
| the same with `&town=2` | a different week: Bea moves in on day 8, nothing else (that town's dice); no. 5 and no. 8 still for sale |
| the street after the week | each house's name board says who lives there now ("3 · Gus's house"); the For sale board only on the houses still for sale |
| a house the town changed, visited | built again as lived in, a bed for the newcomer (`housePlace('s1')`: "Bea's house", Bea's bed) |
| 40–60 town days in a row (node and the page) | weddings ("together at no. N"), babies (named, on the town card and the door), houses going back on the market when someone moves in with a partner; always one house left for sale |
| the same URL without `?townlife` | nothing changes over 3 days (`townLife.day` stays null, no news) |
| a newcomer, in a game with dreams (`/`, Carry on) | the news toast; each household Sim who isn't shy gets the wish "Say hello to the new neighbour"; going round to their house makes it come true (+40) |

## The notice board (4.2)

| How | Expect |
|---|---|
| the street after a week | the board by the bus stop, its name board "📰 Notice board · 3 new" in red |
| a click on the board | "The Primrose Street notice board": the week's news, newest first, the new ones in bold; the name board then says "Notice board" |

## The town comes to you (4.3)

| How | Expect |
|---|---|
| a Saturday visit to Ivan (cheerful, shy, neat), six game hours | Ivan comes over with a joke once (shy: rarely) |
| Friday's party, the household there | Bea comes over for a chat with Hugo |
| `pickReach`, 3,000 rolls each (node) | a romantic with a romance married to someone else, or with no romance: never a flirt; a grumpy stranger teases about one time in six |

## Save v6

| How | Expect |
|---|---|
| a week with `&save=1`, then `/` and "Carry on" | the same people in the same houses, the same three news items (3 new), Dora's house, dream and traits, Eva and Jules's romance (65); the next day is played as day 9 |
| a v5 save (no town houses, homes or town life), "Carry on" | the town as made (Gus and Flo at no. 9 again), town life starts that day (no days played behind you), written back as v6 |

## Performance (4.4)

Measured on the Mac (Apple Silicon, Chrome in the app's browser pane, canvas 1024 × 768, pixel ratio 1) with
`?seed=5&flatmate=7&townlife=1&town=1` after 30 town days (7 people in town, 2 town babies). One frame = every Sim in
view updated (`sim.update`), the scene drawn, and `gl.finish()` (so the GPU's time counts). 150 frames each, median and
90th centile. The house is a Friday party's (`h2`/`s2`), the camera where the page puts it.

| Sims drawn in the house | frame (median) | frame (90%) | `sim.update` for all | draw calls | triangles |
|---|---|---|---|---|---|
| 2 (the household) | 1.6 ms | 1.8 ms | 0.1 ms | 290 | 159,000 |
| 4 | 1.7 ms | 1.8 ms | 0.1 ms | 296 | 176,000 |
| 7 (a party: household, the hosts, guests) | 1.9 ms | 2.3 ms | 0.2 ms | 305 | 199,000 |
| 10 (everyone in town, no limit) | 2.1 ms | 2.4 ms | 0.3 ms | 313 | 224,000 |
| the flat, nobody in it | 1.4 ms | 1.7 ms | – | 265 | 108,000 |

Each Sim drawn: about **0.06 ms** a frame on the Mac, **3 draw calls** and **8,000 triangles**; the house itself (walls,
furniture, party decorations) is most of the frame.

The daily town tick (`playTownDay`, 60 days in a row, 6–8 people): median under 0.1 ms, 95% 0.2 ms, the slowest 0.9 ms
(the day a newcomer is made: their Life; the body is a clone, `folk.body` about 1 ms, made after the tick). The save
with 60 days of town life is 7.3 kB (the news is capped at 12 items).

**The limit:** `DRAWN.most = 10` (townlife.mjs): no more than ten Sims in one place at once. At a party the extra guests
stay data only; friends invited round to yours wait at the door (they come in when someone leaves, or not at all).
Checked: with `DRAWN.most = 5`, the Friday party held 5 (household 2, hosts, guests) for an hour; with 10, it held 8
(household 2, hosts 2, the party's 4 guests). There are only twelve people, so ten is everyone but a nanny and one more.

**To measure on the Surface** (it can't be reached from this Mac):

1. Open `/?seed=5&flatmate=7&townlife=1&town=1` on the tablet, in Edge, full screen.
2. In the console (or a bookmarklet), run the script below. It plays 30 town days, sends both Sims to Friday's party,
   then times 150 frames with every person in town at the party, then with one fewer each time down to two.
3. Note the median and 90% frame time for 10, 7 and 2 Sims, and the canvas size it prints.
4. If 10 Sims take more than about 12 ms a frame (under 60 fps with room for the rest of the frame), lower `DRAWN.most`
   to 8 (a party still has the household, two hosts and four guests); if 7 Sims take more than 12 ms, tell me.
5. Also note how long the page takes to load and whether the street (which draws every house front) is smooth to walk.

```js
const L = window.__life; await L.neighboursLoaded;
L.townLife.day = 0; for (let d = 1; d <= 30; d++) L.playTownDay(d); await new Promise((r) => setTimeout(r, 3000));
L.minutes = (Math.floor(L.minutes / 1440) + 7 - (Math.floor(L.minutes / 1440) % 7) + 4) * 1440 + 19 * 60 + 30; L.advance(1);
const host = L.partyToday(); for (const l of L.lives) { L.select(l); await L.goVisit(host); } L.advance(40);
const p = L.places[host], scene = p.group.parent, gl = L.renderer.getContext(); L.setView(p);
for (const l of L.npcs().filter((l) => !(l.present && l.place === p))) { l.queue = []; l.present = true; l.arrive(p); l.sim.position.copy(p.freeSpot(L.npcs().indexOf(l) + 1)); }
const run = () => { const t = []; for (let k = 0; k < 150; k++) { const a = performance.now(); for (const l of L.everyone) if (l.present) l.sim.update(1 / 60, []); for (const l of L.everyone) l.sim.group.visible = l.present && l.place === p; L.renderer.render(scene, L.camera); gl.finish(); t.push(performance.now() - a); } t.sort((a, b) => a - b); return { sims: L.everyone.filter((l) => l.present && l.place === p).length, med: t[75].toFixed(1), p90: t[135].toFixed(1) }; };
const out = [run()]; const order = L.everyone.filter((l) => l.present && l.place === p && !L.lives.includes(l));
while (order.length) { order.pop().present = false; out.push(run()); }
console.table(out); console.log('canvas', L.renderer.domElement.width, L.renderer.domElement.height, 'pixel ratio', L.renderer.getPixelRatio());
```

## Not checked this round

- The Surface tablet (to be run there with the script above).
- A long game played for real over weeks, without calling the hooks by hand.
- A house the town changes while someone from the household is in it (deferred until they leave: `stale`; at 03:00 it
  should not happen).
- A window's evening glow on the street after a house changes (it stays as built until the game is loaded again).
- An NPC who moved in with the household (Ask to move in) leaving their house: it goes on the market the next night
  (by the rule; not played).
- A flirt from the town, played (the rule was checked with `pickReach`, not in a game with a romance).
- The town coming to you at the park or at work (checked at a visit and a party).
