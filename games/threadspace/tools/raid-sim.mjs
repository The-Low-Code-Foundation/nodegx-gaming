// Headless raids for balancing the guns: many raids, each in a fresh page with its own seed, and what they did on
// average. Nobody is at a gun and your fighter stays on its pad, so it is the ship's own defence that is measured.
//
// From any page of the site, in the console:
//
//   const S = await (await import('./tools/raid-sim.mjs')).sims(12);          // 12 raids, port and starboard in turn
//   S.summary                                                                 // the averages; S.runs has each raid
//
// What a raid counts:
// - torpedoes: the raider's launched, shot down (by close-in guns, flak, turrets or anything else) and hits on her;
//   `salvos` groups them by launch (within 2 s), and `stopped` is the salvos none of whose torpedoes hit;
// - bandits: shot down, and by what; point defence guns the bandits shot up;
// - the raid: how long, whether the raider died, the hull left, the heat sinks' highest.
// Same seeds, same numbers (`?hold=1&seed=N`, as tools/carrier-check.mjs).

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;

/** One raid on this page (opened with `carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=N`). */
export async function one(from = 'port', secs = 260) {
  for (let i = 0; i < 100 && !window.__carrier?.guns; i++) await wait(200);
  const c = window.__carrier;
  for (let i = 0; i < 100 && [...c.career.people.values()].some((p) => !p.m); i++) await wait(100);
  c.renderer.render = () => {};
  c.composer.render = () => {};
  try { c.sfx.ctx?.suspend(); } catch {}
  const g = c.guns;
  const n = { launched: 0, hits: 0, by: {}, salvos: [], bandits: 0, banditBy: {}, heat: 0 };
  const wrap = (name, fn) => { const f = g[name].bind(g); g[name] = (...a) => fn(f, ...a); };
  wrap('torpedo', (f, p, v, s, a) => {
    const t = f(p, v, s, a);
    if (s === 'theirs') {
      n.launched++;
      const last = n.salvos.at(-1);
      if (last && g.time - last.t < 2) last.torps.push(t);
      else n.salvos.push({ t: g.time, torps: [t] });
    }
    return t;
  });
  wrap('detonate', (f, t, on, at) => (on && t.side === 'theirs' && (n.hits++, (t.hit = true)), f(t, on, at)));
  wrap('killTorp', (f, t, by) => (t.side === 'theirs' && (n.by[by] = (n.by[by] ?? 0) + 1), f(t, by)));
  wrap('banditHit', (f, B, p, dmg, you, small, by) => {
    const was = B.dead;
    const out = f(B, p, dmg, you, small, by);
    if (!was && B.dead) (n.bandits++, (n.banditBy[by ?? (you ? 'you' : 'other')] = (n.banditBy[by ?? (you ? 'you' : 'other')] ?? 0) + 1));
    return out;
  });
  // What hurt the raider: each frame step that can hit it says who it is while it runs.
  n.raiderBy = {};
  let src = 'other';
  const as = (name, who) => g[name] && wrap(name, (f, ...a) => { const was = src; src = who; try { return f(...a); } finally { src = was; } });
  as('roundsFrame', 'close'); as('flakBurst', 'flak'); as('shellsFrame', 'shells'); as('torpsFrame', 'torpedoes');
  wrap('raiderHit', (f, p, dmg, ...a) => ((n.raiderBy[src] = (n.raiderBy[src] ?? 0) + dmg), f(p, dmg, ...a)));
  c.ship.attack(from);
  const dt = 1 / 30;
  let t = 0;
  while (t < secs && !(g.raider?.gone && !g.bandits.some((B) => !B.dead && !B.gone))) {
    c.tick(1, dt);
    t += dt;
    n.heat = Math.max(n.heat, c.plant.heat ?? 0);
  }
  const salvos = n.salvos.map((s) => s.torps.length);
  return {
    from, t: Math.round(t), launched: n.launched, hits: n.hits, shotDown: n.by, salvos: salvos.length,
    stopped: n.salvos.filter((s) => !s.torps.some((x) => x.hit)).length,
    bandits: n.bandits, banditBy: n.banditBy, gunsShotUp: g.pdcs.filter((p) => p.hp < 25).length,
    raiderBy: Object.fromEntries(Object.entries(n.raiderBy).map(([k, v]) => [k, Math.round(v)])),
    raiderDead: !!g.raider?.dead, raiderHull: Math.round(g.raider?.hull ?? 0), hull: r2(c.ship.sys('hull') ?? 0), heat: r2(n.heat)
  };
}

/** `count` raids, each in a fresh page (an iframe) seeded `seed0 + i`, port and starboard in turn. */
export async function sims(count = 10, seed0 = 100, opts = {}) {
  const runs = [];
  for (let i = 0; i < count; i++) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;opacity:0;pointer-events:none';
    const base = new URL('../carrier.html', import.meta.url);
    f.src = `${base}?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=${seed0 + i}`;
    const loaded = new Promise((r) => f.addEventListener('load', r, { once: true }));
    document.body.append(f);
    await loaded;
    try {
      if (opts.tweak) f.contentWindow.__tweak = opts.tweak;
      const mod = await f.contentWindow.eval(`import(${JSON.stringify(new URL(`raid-sim.mjs?${Date.now()}`, import.meta.url).href)})`);
      for (let k = 0; k < 100 && !f.contentWindow.__carrier?.guns; k++) await wait(200);
      if (opts.tweak) opts.tweak(f.contentWindow.__carrier);
      runs.push(await mod.one(i % 2 ? 'starboard' : 'port'));
    } catch (e) {
      runs.push({ error: String(e?.stack ?? e) });
    }
    f.remove();
    window.__sims = { done: runs.length, of: count, runs };
  }
  const ok = runs.filter((r) => !r.error);
  const sum = (k) => ok.reduce((a, r) => a + (r[k] ?? 0), 0);
  const by = {}, bb = {}, rb = {};
  for (const r of ok) {
    for (const [k, v] of Object.entries(r.raiderBy ?? {})) rb[k] = (rb[k] ?? 0) + Math.round(v / ok.length);
    for (const [k, v] of Object.entries(r.shotDown)) by[k] = (by[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.banditBy)) bb[k] = (bb[k] ?? 0) + v;
  }
  const L = sum('launched');
  const summary = {
    raids: ok.length,
    torpedoes: L, torpedoKill: r2((L - sum('hits')) / Math.max(1, L)), hitsPerRaid: r2(sum('hits') / ok.length),
    shotDownBy: by, salvosStopped: r2(sum('stopped') / Math.max(1, sum('salvos'))),
    banditsDown: r2(sum('bandits') / Math.max(1, ok.length * 2)), banditsBy: bb, gunsShotUpPerRaid: r2(sum('gunsShotUp') / ok.length),
    raidSecs: Math.round(sum('t') / ok.length), raiderKilled: r2(ok.filter((r) => r.raiderDead).length / ok.length), raiderDamageBy: rb,
    hullLeft: r2(sum('hull') / ok.length), heatMax: r2(Math.max(...ok.map((r) => r.heat)))
  };
  window.__sims = { done: runs.length, of: count, runs, summary };
  return { summary, runs };
}
