# Round 16 checks: a town that lives without you (roadmap phase 4)

Checks done by hand in a browser over HTTP, using the hooks on `window.__life`, as in [r16-phase3.md](r16-phase3.md).
The browser pane that ran them was hidden, so its animation frames were held back. The checks called `advance(minutes)`
(which runs `townTick`, and so town life and the town coming to you) and played town days with `playTownDay(day)`.
Town life is off on a test URL unless `?townlife=1`.

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
