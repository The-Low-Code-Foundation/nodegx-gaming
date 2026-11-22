// The carrier's scripted play-throughs: the same moves, the same seed, the same numbers. Run before and after a change
// that should not change how the ship behaves (a refactor), and compare what comes back.
//
// All of them, from any page of the site (each runs in a fresh page of its own, in an iframe):
//
//   const r = await (await import('./tools/carrier-check.mjs')).runAll();   // { raid: { hash, … }, helm: …, … }
//
// Or one, on its own page (each wants a fresh load), in the console:
//
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → (await import('./tools/carrier-check.mjs')).run('raid')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('hull')
//   carrier.html?at=helm&voice=0&crew=0&dc=0&hold=1&seed=7       → run('helm')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('landing')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('repair')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('collide')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('bandits')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('missiles')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('walk')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('float')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('brace')
//   carrier.html?career=ship&voice=0&crew=0&dc=0&hold=1&seed=7 (start page)  → run('career')   (the carrier's own first week)
//   carrier.html?voice=0&crew=0&dc=0&hold=1&seed=7 (start page)  → run('service')   (the player's career: three pages, see `runAll`)
//   carrier.html?ship=cutter&host=carrier&berth=berth-port&at=helm&voice=0&crew=0&dc=0&hold=1&seed=7   → run('berth')
//   carrier.html?ship=cutter&host=carrier&berth=berth-port&at=helm&voice=0&crew=0&dc=0&hold=1&seed=7   → run('recover')
//   carrier.html?ship=cutter&host=carrier&berth=berth-port&at=helm&voice=0&crew=0&dc=0&hold=1&seed=7   → run('bump')
//   carrier.html?ship=cutter&host=carrier&berth=berth-port&at=helm&voice=0&crew=0&dc=0&hold=1&seed=7   → run('pilot')
//   carrier.html?ship=cutter&at=bridge&career=ship&voice=0&crew=0&dc=0&hold=1&seed=7   → run('cutter')   (another ship: ships/cutter/)
//
// `?hold=1` keeps the page from running frames of its own and `?seed=` seeds every random number (carrier.html,
// main.mjs), so the frame steps are the script's alone. `run` also stops rendering and mutes the sound, and returns a
// plain object (positions rounded to the millimetre). The career scenario uses the save in localStorage and puts back
// whatever was there. With crew aboard (no `crew=0`) the crew load at their own pace, so the numbers drift.

const mulberry = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r3 = (v) => Math.round(v * 1000) / 1000;
const v3 = (v) => [r3(v.x), r3(v.y), r3(v.z)];

async function ready() {
  for (let i = 0; i < 100 && !window.__carrier?.guns; i++) await wait(200);
  const c = window.__carrier;
  if (!c) throw new Error('no __carrier: is this carrier.html?');
  const q = new URLSearchParams(location.search);
  if (q.get('hold') !== '1' || !q.get('seed')) throw new Error('open the page with &hold=1&seed=N');
  // The officers come aboard asynchronously: let them all arrive, then seed again, so their loading takes no numbers.
  for (let i = 0; i < 100 && [...c.career.people.values()].some((p) => !p.m); i++) await wait(100);
  c.renderer.render = () => {};
  c.composer.render = () => {};
  try { c.sfx.ctx?.suspend(); } catch {}
  Math.random = mulberry(11);
  c.dc.rand = mulberry(12);
  c.ship.rand = mulberry(13);
  c.guns.rand = mulberry(14);
  return c;
}

/** `secs` of game time in steps of `dt`, stopping early when `until()` is true. Returns the time taken. */
function run_(c, secs, until = () => false, dt = 1 / 30) {
  let t = 0;
  while (t < secs && !until()) {
    c.tick(1, dt);
    t += dt;
  }
  return r3(t);
}

const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

function snap(c) {
  const g = c.guns;
  return {
    mode: c.mode(), deck: c.info().deck, in: String(c.walker.interior?.deck?.id), float: !!c.walker.float, you: v3(c.walker.pos), yaw: r3(c.walker.yaw),
    ship: { pos: v3(c.C.obj.position), quat: [c.C.obj.quaternion.x, c.C.obj.quaternion.y, c.C.obj.quaternion.z].map((x) => Math.round(x * 1e5) / 1e5), vel: v3(c.body.vel), ang: v3(c.body.ang).map((x) => Math.round(x * 1e3) / 1e3) },
    hull: r3(c.ship.sys('hull') ?? -1), heat: r3(c.plant.heat ?? -1), prop: r3(c.plant.prop ?? -1),
    pdcRounds: g.pdcs.reduce((a, p) => a + p.stock, 0), tubes: g.tubeStock,
    air: r3([...c.C.rooms.keys()].reduce((a, id) => a + (c.ship.airOf(id) ?? 0), 0)),
    dcLog: c.dc.log.map((j) => `${j.kind}@${j.room}:${j.ok}`), fighter: c.fighter?.phase
  };
}

/** Counts what a raid does, by wrapping the guns' own calls. */
/** Your fighter's parts that a hit has reached (fighter-damage.mjs): `id:health` (0..1), worst first. */
function parts(c) {
  const D = c.guns.fdmg;
  return D ? D.rows().filter((r) => r.k < 0.9995).sort((a, b) => a.k - b.k).map((r) => `${r.id}:${r3(r.k)}`).join(' ') : '';
}

function counters(c) {
  const g = c.guns, n = { theirLaunched: 0, torpHits: 0, shotDown: 0, shellHits: 0 };
  const wrap = (name, fn) => { const f = g[name].bind(g); g[name] = (...a) => fn(f, ...a); };
  wrap('torpedo', (f, p, v, s, a) => (s === 'theirs' && n.theirLaunched++, f(p, v, s, a)));
  wrap('detonate', (f, t, on, at) => (on && t.side === 'theirs' && n.torpHits++, f(t, on, at)));
  wrap('killTorp', (f, t, by) => (t.side === 'theirs' && n.shotDown++, f(t, by)));
  wrap('hitsCarrier', (f, ...a) => { const h = f(...a); if (h) n.shellHits++; return h; });
  return n;
}

const findUse = (I, pre) => I.interactables.find((u) => u.id.startsWith(pre));

/** Places the scripts name, worked out from the layout so they follow the ship when she is redesigned: `bow` (her
 *  bow's z), `spine` (the middle of the spine passage, z), `door` (the port bay door: its skin x, its z range), `pads`
 *  (z half way between the first two fighter pads: the open bay, clear of the berths), `berth` (the middle of the port
 *  berth, z, or null). */
function spots(c) {
  const L = c.L, sp = c.C.rooms.get('spine'), d = L.mounts.find((m) => m.kind === 'bay-door' && m.x < 0), f = L.fighters;
  const b = (L.berths ?? []).find((q) => q.out < 0);
  return {
    bow: L.hull.main[0].z, spine: sp ? Math.round((sp.z[0] + sp.z[1]) / 2) : 0, door: d ? { x: d.x, z: d.z } : null,
    pads: f?.length > 1 ? r3((f[0].at[1] + f[1].at[1]) / 2) : f?.[0]?.at[1] ?? 0, berth: b ? r3((b.box.z[0] + b.box.z[1]) / 2) : null
  };
}

const scenarios = {
  /** The cutter carried in the carrier's hangar (berth.mjs, `?ship=cutter&host=carrier&berth=berth-port`): on the cradle
   *  the helm does nothing, L opens the door and the cradle pushes her out, the hand-over gives her the push's velocity,
   *  a burn away and back to rest, and L again has flight control fly her home and shut the door. */
  async berth(c) {
    for (let i = 0; i < 300 && !c.berth; i++) await wait(200); // the host is fetched and built after the ship
    const b = c.berth, K = c.input.keys, H = c.host, out = { spec: b.spec.id };
    const local = () => v3(H.frame.worldToLocal(c.C.obj.position.clone()));
    const hold = (code, secs) => (K.add(code), run_(c, secs), K.delete(code));
    hold('KeyW', 2); // carried: a burn moves nothing
    out.carried = { phase: b.phase, at: local(), vel: v3(c.body.vel) };
    out.asked = b.key();
    out.launch = { secs: r3(run_(c, 120, () => b.phase === 'out')), at: local(), vel: v3(c.body.vel), door: r3(c.hostDoors.kOf(b.spec.door)) };
    hold('KeyW', 3); // about 30 m/s against her: over what flight control will take
    out.away = { at: local(), vel: v3(c.body.vel), status: b.status() };
    out.far = b.key(); // too fast: flight control says no
    hold('KeyX', 30); // all stop
    out.stopped = { at: local(), speed: r3(c.body.vel.length()) };
    out.home = b.key();
    out.recover = { secs: r3(run_(c, 200, () => b.phase === 'berthed')), phase: b.phase, at: local(), door: r3(c.hostDoors.kOf(b.spec.door)) };
    return out;
  },
  /** Flying the cutter home yourself (recovery.mjs; the same page as `berth`). Everything goes in through the keys a
   *  person has: L, K (docking mode), H (the berth's heading held), and taps of the slide keys, which a small pilot
   *  here presses to set the speed it wants (`fly`). Launch; out to the holding point; request recovery; down the lane
   *  on speed; the capture and its grade. Then again from 60 m out, arriving at the last gate at 2.5 m/s: a wave-off,
   *  back out, and in properly. Then once more, where a second L hands her to flight control. */
  async recover(c) {
    for (let i = 0; i < 300 && !c.berth; i++) await wait(200);
    const b = c.berth, R = b.lane, K = c.input.keys, out = {};
    const DT = 1 / 30;
    const st = () => { const s = R.state; return { along: r3(s.along), fore: r3(s.fore), up: r3(s.up), closing: r3(s.closing), align: r3(s.align), call: s.call }; };
    const calls = () => c.announcer.log.filter((l) => l.id.startsWith('recover-')).map((l) => `${l.id}:${l.heard ?? '-'}`);
    // One step with the slide keys tapped toward the set speed `want(s)` gives, [starboard, up, ahead] in m/s in her
    // own frame: a key goes down for a step and up for the next (a tap is 0.1 m/s), until the set speed is the one wanted.
    const AX = [['KeyD', 'KeyA'], ['KeyR', 'KeyF'], ['KeyW', 'KeyS']];
    const fly = (secs, want, until) => {
      let t = 0;
      for (; t < secs && !until(R.state); t += DT) {
        const D = c.helm.dock, w = want(R.state);
        for (let i = 0; i < 3; i++) {
          const set = D ? [D.set.x, D.set.y, -D.set.z][i] : 0, d = Math.round((w[i] - set) * 10);
          const code = d > 0 ? AX[i][0] : d < 0 ? AX[i][1] : null;
          for (const k of AX[i]) if (k !== code || K.has(k)) K.delete(k); else K.add(k);
        }
        c.tick(1, DT);
      }
      for (const a of AX) for (const k of a) K.delete(k);
      return r3(t);
    };
    // Her own axes against the lane's, parallel to the host in the berth's heading: closing is to starboard for both
    // berths (her docking port's side), an offset along the host is ahead or astern by which way her bow lies.
    const to = (along, vmax) => (s) => { const g = 0.15, v = (e, m = vmax) => Math.max(-m, Math.min(m, e * g)); return [v(s.along - along), v(-s.up, 2), v(-s.fore * R.bow, 2)]; };
    const slide = (k = 0.9, fixed = null) => (s) => [fixed ?? Math.min(s.want * k, Math.max(0.3, s.along * 0.15 + 0.3)), Math.max(-1, Math.min(1, -s.up * 0.2)), Math.max(-1, Math.min(1, -s.fore * R.bow * 0.2))];
    const launch = () => (b.key(), r3(run_(c, 120, () => b.phase === 'out', DT)));
    const home = () => r3(run_(c, 120, () => b.phase === 'berthed', DT));

    // 1. Launch, docking mode, hold the heading, out to the holding point, ask, slide in, the capture.
    out.launch = { secs: launch(), ...st() };
    key('KeyK');
    key('KeyH');
    out.dock = { name: c.helm.assistName, hold: c.helm.dock?.hold, set: v3(c.helm.dock.set) };
    out.toHold = { secs: fly(240, to(260, 6), (s) => s.dist < 2 && s.speed < 0.08), ...st(), dist: r3(R.state.dist) };
    out.early = R.state.text; // what the display says before the call
    key('KeyL');
    out.asked = { approved: R.approved, text: c.helmSight.msg?.text };
    out.slide = { secs: fly(400, slide(), () => b.phase !== 'out' || !!R.waved), phase: b.phase, waved: R.waved, door: r3(c.hostDoors.kOf(b.spec.door)) };
    out.grade = { ...b.lastRecovery };
    out.home = { secs: home(), phase: b.phase, door: r3(c.hostDoors.kOf(b.spec.door)), dock: !!c.helm.dock };

    // 2. Out again, 60 m off the last gate; ask; in at 2.5 m/s all the way: waved off. Back out past 30 m, then in on speed.
    out.launch2 = launch();
    key('KeyH');
    fly(120, to(60, 4), (s) => Math.abs(s.along - 60) < 1.5 && s.speed < 0.08);
    key('KeyL');
    fly(60, () => [0, 0, 0], (s) => s.doorOpen); // the door takes its time
    out.fast = { secs: fly(120, slide(1, 2.5), () => !!R.waved || b.phase !== 'out'), phase: b.phase, waved: R.waved, ...st(), text: (R.talk(R.state), R.state.text), lane: R.gates.map((g) => g.userData.mat.color.getHexString()).join(' '), said: c.helmSight.msg?.text };
    out.back = { secs: fly(120, to(45, 3), (s) => s.along > 40 && s.speed < 0.1), waved: R.waved, armed: R.armed, ...st() };
    out.again = { secs: fly(400, slide(), () => b.phase !== 'out' || !!R.waved), phase: b.phase, waved: R.waved };
    out.grade2 = { ...b.lastRecovery };
    out.home2 = home();

    // 3. Out once more; L asks; L again hands her to flight control.
    out.launch3 = launch();
    run_(c, 4, undefined, DT);
    key('KeyL');
    out.asked3 = R.approved;
    key('KeyL');
    out.auto = { phase: b.phase, said: c.helmSight.msg?.text, secs: home(), last: { ...b.lastRecovery } };
    out.calls = calls();
    return out;
  },

  /** The crew's pilot (pilot.mjs; the same page as `berth`): the commander flies a whole sortie through the real helm,
   *  with W held down at the helm all the while (your hands do nothing while the pilot has her). Launch; out to a point
   *  2 km off the port beam and 500 m forward, to rest; hold 10 s; to a point on the starboard side (the straight line
   *  goes through the carrier, so it routes round her); home down the lane to the cradle's arms. Per leg (`legs`, the
   *  pilot's own log): seconds, how far from the point and how fast at its end, reaction mass burned, waypoints, and the
   *  recovery's grade. `clear` is the nearest her centre came to the pilot's keep-out boxes on the two goto legs;
   *  `contacts` must be 0. `?skill=` on the page flies it worse (0.25 is a hand's first week). */
  async pilot(c) {
    for (let i = 0; i < 300 && !c.pilot; i++) await wait(200); // the host is fetched and built after the ship
    const b = c.berth, P = c.pilot, B = c.bump, H = c.host, THREE = await import('three');
    const voyage = localStorage.getItem('threadspace.voyage'); // the launch notes her out: put back at the end
    const local = () => v3(H.frame.worldToLocal(c.C.obj.position.clone()));
    const out = { skill: P.skill, events: [] }, ev = out.events;
    c.C.bus.on('pilot-leg', (e) => ev.push(`leg ${e.i + 1}/${e.n} ${e.leg.do}`));
    c.C.bus.on('pilot-done', (e) => (out.done = { ok: e.ok, why: e.why }));
    c.C.bus.on('berth-phase', (e) => ev.push(`berth ${e.was}>${e.phase}`));
    c.C.bus.on('call', (e) => e.id.startsWith('pilot-') && ev.push(e.id));
    P.fly([{ do: 'launch' }, { do: 'goto', at: [-2000, 0, -500] }, { do: 'hold', secs: 10 }, { do: 'goto', at: [1500, 100, 300] }, { do: 'recover' }]);
    out.started = { busy: P.busy, hasHelm: P.hasHelm, assist: c.helm.assist };
    c.input.keys.add('KeyW');
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    let t = 0, clear = Infinity, fastest = 0, burn = 0, jets = 0;
    for (; t < 1500 && P.busy; t += 1 / 30) {
      c.tick(1, 1 / 30);
      if (b.phase !== 'out') continue;
      fastest = Math.max(fastest, c.body.vel.length());
      if (c.drive.push > 0.3) burn += 1 / 30;
      else if (c.thrusters.list.some((x) => x.kind !== 'main' && x.throttle > 0.02)) jets += 1 / 30;
      if (P.leg?.do !== 'goto') continue;
      H.frame.worldToLocal(p.copy(c.C.obj.position));
      for (const k of P.keep.boxes) clear = Math.min(clear, q.set(Math.max(k.min[0] - p.x, 0, p.x - k.max[0]), Math.max(k.min[1] - p.y, 0, p.y - k.max[1]), Math.max(k.min[2] - p.z, 0, p.z - k.max[2])).length());
    }
    c.input.keys.delete('KeyW');
    out.secs = r3(t);
    out.legs = P.log;
    out.flown = { clear: r3(clear), fastest: r3(fastest), burnSecs: r3(burn), jetSecs: r3(jets), contacts: B.stats.contacts, scrapes: B.stats.scrapes, crashes: B.stats.crashes, hits: B.hits.length };
    out.end = { busy: P.busy, phase: b.phase, at: local(), door: r3(c.hostDoors.kOf(b.spec.door)), prop: r3(c.plant.prop), assist: c.helm.assist, last: { ...b.lastRecovery } };
    if (voyage === null) localStorage.removeItem('threadspace.voyage');
    else localStorage.setItem('threadspace.voyage', voyage);
    return out;
  },

  /** The cutter against the carrier (collide.mjs `ShipCollisions`; the same page as `berth`): the launch (carried, and
   *  then handed over, without a touch), a turn back at the helm, then set going at the carrier from a spot in the
   *  carrier's frame each time: her bow on the carrier's side at 2 m/s (a clang) and at 10 m/s (holed), a glancing bow
   *  strike that swings her, in through the open bay door without a touch, on across the hangar into the other
   *  berth's cutter, the shut door, and 40 m/s (the wreck: `onWreck` is caught here, so the page stays). */
  async bump(c) {
    for (let i = 0; i < 300 && !c.bump; i++) await wait(200); // the host is fetched and built after the ship
    const b = c.berth, B = c.bump, H = c.host, K = c.input.keys, THREE = await import('three');
    const voyage = localStorage.getItem('threadspace.voyage'); // the launch notes her out: put back at the end
    const local = () => v3(H.frame.worldToLocal(c.C.obj.position.clone()));
    const hold = (code, secs) => (K.add(code), run_(c, secs), K.delete(code));
    let wrecked = null;
    B.onWreck = (h) => (wrecked = h.speed);
    const kinds = {};
    for (const s of B.solids) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
    const out = { solids: kinds, balls: B.balls.length };
    b.key();
    out.launch = { secs: r3(run_(c, 120, () => b.phase === 'out')), at: local(), contacts: B.stats.contacts };
    run_(c, 12); // her radiators spread, the door shuts behind her
    out.clear = { at: local(), contacts: B.stats.contacts, near: B.stats.near, rads: c.plant.radiators.map((r) => r3(r.k)) };
    hold('ArrowLeft', 4); // turn back toward her
    hold('KeyX', 20);
    out.turned = { quat: [c.C.obj.quaternion.x, c.C.obj.quaternion.y, c.C.obj.quaternion.z].map((x) => Math.round(x * 1e4) / 1e4), speed: r3(c.body.vel.length()), contacts: B.stats.contacts };
    c.helm.assist = 0; // hands off, no assist: what the touch does is all that moves her
    const hq = new THREE.Quaternion();
    const shoot = (p, d, speed, yaw, secs, until = () => false) => {
      H.obj.updateMatrixWorld(true);
      H.obj.getWorldQuaternion(hq);
      c.C.obj.position.copy(H.frame.localToWorld(new THREE.Vector3(...p)));
      c.C.obj.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
      c.body.vel.copy(new THREE.Vector3(...d).normalize().multiplyScalar(speed).applyQuaternion(hq));
      c.body.ang.set(0, 0, 0);
      B.prev = null;
      B.dead = false;
      const n0 = B.hits.length;
      run_(c, secs, until);
      return {
        hits: B.hits.slice(n0, n0 + 4).map((h) => `${h.what}/${h.part}:${r3(h.speed)}:${r3(h.felt)}:${r3(h.damage)}${h.room ? `:${h.room}` : ''}${h.hole ? `:${h.hole.join('/')}` : ''}${h.wreck ? ':wreck' : ''}`),
        n: B.hits.length - n0, at: local(), rel: v3(c.body.vel.clone().applyQuaternion(hq.clone().invert())), ang: v3(c.body.ang), health: r3(B.health())
      };
    };
    // The carrier's port side, 47 m aft of her bow's tip; her berth's place off the door.
    const bz = H.L.hull.main[0].z + 47, y = b.home.y, z = b.home.z, nose = -Math.PI / 2; // nose to starboard: bow on
    out.clang = shoot([-48, 0, bz], [1, 0, 0], 2, nose, 8);
    out.holed = shoot([-48, 0, bz], [1, 0, 0], 10, nose, 4);
    // Along the carrier's side, her nose 0.6 rad in toward it: the bow touches and she swings.
    const n0 = B.hits.length;
    out.glance = shoot([-38, 0, 60], [0.565, 0, -0.825], 6, -0.6, 6, () => B.hits.length > n0);
    out.swing = { ang: v3(c.body.ang), after: r3(run_(c, 3)), at: local() };
    c.hostDoors.bayNow();
    out.through = shoot([-50, y, z], [1, 0, 0], 3, 0, 10); // in through the open door, to just inside it
    out.across = shoot([b.home.x, y, z], [1, 0, 0], 2, 0, 6); // from her own cradle across to the other berth's cutter
    c.hostDoors.setBay(0);
    c.hostDoors.k = 0;
    c.hostDoors.place(); // shut at once
    out.door = shoot([-42, y, z], [1, 0, 0], 3, 0, 6);
    out.wreck = shoot([-70, 0, bz], [1, 0, 0], 40, nose, 2);
    out.wrecked = wrecked && r3(wrecked);
    out.rads = c.plant.radiators.map((r) => r3(r.health));
    out.stats = { ...B.stats, ms: undefined, last: undefined };
    if (voyage === null) localStorage.removeItem('threadspace.voyage');
    else localStorage.setItem('threadspace.voyage', voyage);
    return out;
  },

  /** The cutter (ships/cutter/, `?ship=cutter`): a ship with no drums, hangar, fighters, career or routine. Every
   *  walkable room stood in, a push off down the passage into engineering, the helm taken at its couch, a burn, a half turn, all
   *  stop, the turret manned, and a raid from port with her own crew at the guns. */
  async cutter(c) {
    c.career.free();
    const w = c.walker, F = w.floater, K = c.input.keys, out = { has: c.HAS, rooms: {} };
    const hold = (code, secs) => (K.add(code), run_(c, secs), K.delete(code));
    for (const r of c.L.compartments.filter((r) => r.access === 'walk')) {
      const ok = c.go(r.id);
      run_(c, 0.5);
      out.rooms[r.id] = { ok, in: c.G.walk.roomNow(), float: !!w.float, you: v3(w.pos), holds: w.interior.holds.filter((h) => h.room === r.id).length };
    }
    out.holds = w.interior.holds.length;
    // At the passage's forward end, facing aft: a held push off the deck (W, let go), the drift down the passage and
    // through the door into engineering control, and a hold taken there.
    const p = c.C.rooms.get('passage');
    F.reset(); // (standing in engineering's foot rail from the round of the rooms: let go, or `place` is undone)
    c.place(p.deck, 0, p.z[0] + 1.5, Math.PI);
    w.pitch = 0;
    run_(c, 0.2);
    F.reset();
    hold('KeyW', 2);
    run_(c, 3);
    out.pushed = { you: v3(w.pos), vel: v3(w.vel), room: c.G.walk.roomNow() };
    K.add('Space');
    out.caught = { t: run_(c, 2, () => F.held), held: F.held?.h.kind ?? null, you: v3(w.pos) };
    K.delete('Space');
    // The helm: E at the pilot's couch, a 2 s burn, a half turn to port, all stop.
    c.go('flight-deck');
    findUse(w.interior, 'helm').use();
    out.helm = c.mode();
    hold('KeyW', 2);
    out.burn = { vel: v3(c.body.vel), push: r3(c.C.push ?? 0), prop: r3(c.plant.prop) };
    hold('ArrowLeft', 4.5);
    out.turning = v3(c.body.ang);
    run_(c, 8);
    const bow = c.C.obj.getWorldDirection(new (c.body.vel.constructor)()).negate(); // she started with her bow along -z
    out.turned = { bow: v3(bow), ang: v3(c.body.ang) };
    K.add('KeyX');
    out.stop = { t: run_(c, 60, () => c.body.vel.length() < 0.05), vel: v3(c.body.vel) };
    K.delete('KeyX');
    key('KeyV');
    run_(c, 0.5);
    out.outlook = c.seats.helm.outlook;
    key('KeyV');
    key('KeyE');
    run_(c, 0.5);
    out.stood = { mode: c.mode(), room: c.G.walk.roomNow() };
    // The turret, manned and left; the cutaway and back.
    c.seats.gun.man(c.guns.turrets[0]);
    run_(c, 1);
    out.gun = { mode: c.mode(), turrets: c.guns.turrets.length, pdcs: c.guns.pdcs.length };
    c.seats.gun.leave();
    run_(c, 0.5);
    c.setMode('cutaway');
    run_(c, 0.5);
    out.cut = { mode: c.mode(), levels: c.cut.levels.length };
    c.setMode('walk');
    // A raid from port, nobody at the turret but her crew.
    const n = counters(c);
    c.ship.attack('port');
    out.raid = { t: run_(c, 200, () => c.guns.raider?.gone), ...n, raiderDead: !!c.guns.raider?.dead, raiderHull: r3(c.guns.raider?.hull ?? 0) };
    out.end = snap(c);
    return out;
  },

  /** A raid from port with nobody at the guns: the point defence, the CIC's broadside, the recoil. */
  async raid(c) {
    const n = counters(c);
    c.ship.attack('port');
    const t = run_(c, 200, () => c.guns.raider?.gone);
    return { t, ...n, raiderDead: !!c.guns.raider?.dead, raiderHull: r3(c.guns.raider?.hull ?? 0), ...snap(c) };
  },

  /** A raid with its escorts (weapons/bandits.mjs), with your fighter out 1.5 km off her port beam, holding still: the
   *  bandits in formation, their strafing runs on her point defence, the point defence on them, and the nearest one
   *  coming for your fighter. */
  async bandits(c) {
    const f = c.fighter, g = c.guns, C = c.C, THREE = await import('three');
    c.bayNow();
    run_(c, 60, () => f.flight.online && f.refuelT <= 0);
    c.input.keys.add('KeyW');
    run_(c, 30, () => f.flying);
    c.input.keys.delete('KeyW');
    run_(c, 1);
    C.obj.updateMatrixWorld(true);
    const cq = C.obj.getWorldQuaternion(new THREE.Quaternion());
    f.obj.position.copy(C.obj.localToWorld(new THREE.Vector3(-1500, 0, -300)));
    f.obj.quaternion.copy(cq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    f.flight.aim.copy(f.obj.quaternion);
    f.body.vel.copy(c.body.vel);
    f.body.ang.set(0, 0, 0);
    const n = counters(c);
    let strafed = 0;
    const sh = g.strafeHit.bind(g);
    g.strafeHit = (...a) => { const h = sh(...a); if (h) strafed++; return h; };
    c.ship.attack('port');
    const states = [];
    let t = 0, near = Infinity;
    while (t < 220 && !(g.raider?.gone && !g.bandits.length)) {
      t += run_(c, 5);
      states.push(g.bandits.map((B) => (B.dead ? 'x' : B.gone ? '-' : B.state[0])).join(''));
      for (const B of g.bandits) if (!B.dead && !B.gone) near = Math.min(near, g.hullBox().distanceToPoint(C.frame.worldToLocal(B.obj.position.clone())));
    }
    return {
      t: r3(t), ...n, strafed, states: states.join(' '), kills: (g.kills ?? []).map((k) => `${k.who}@${r3(k.t)}`), near: r3(near),
      pdcHp: g.pdcs.map((p) => r3(p.hp)), fhull: r3(g.fhull), parts: parts(c), raiderDead: !!g.raider?.dead, ...snap(c)
    };
  },

  /** Heat-seekers and flares (weapons/missiles.mjs): the bandits' setup, but you fight back. Your fighter turns its nose
   *  on the bandit fighting it and fires a missile whenever the seeker locks it (the bandit flares); when a missile is
   *  tracking you, you cut the drive and flare. What each missile did: hit what, or decoyed (spent on a flare, or lost). */
  async missiles(c) {
    const f = c.fighter, g = c.guns, C = c.C, THREE = await import('three');
    c.bayNow();
    run_(c, 60, () => f.flight.online && f.refuelT <= 0);
    c.input.keys.add('KeyW');
    run_(c, 30, () => f.flying);
    c.input.keys.delete('KeyW');
    run_(c, 1);
    C.obj.updateMatrixWorld(true);
    const cq = C.obj.getWorldQuaternion(new THREE.Quaternion());
    f.obj.position.copy(C.obj.localToWorld(new THREE.Vector3(-1500, 0, -300)));
    f.obj.quaternion.copy(cq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)));
    f.flight.aim.copy(f.obj.quaternion);
    f.body.vel.copy(c.body.vel);
    f.body.ang.set(0, 0, 0);
    // What each missile does.
    const log = [], fate = new Map();
    const lm = g.launchMissile.bind(g), mh = g.missileHit.bind(g), mg = g.missileGone.bind(g);
    g.launchMissile = (p, v, d, side, track, from) => {
      const m = lm(p, v, d, side, track, from);
      fate.set(m, { side, at: r3(g.time), on: track === f ? 'you' : track?.label ?? (track ? 'heat' : 'none'), end: 'flying' });
      return m;
    };
    g.missileHit = (m, h) => {
      const e = fate.get(m), ref = h.ref;
      if (e) e.end = ref === f ? 'hit you' : ref === 'carrier' ? 'hit carrier' : g.flares.includes(ref) ? 'flare' : ref === g.raider ? 'hit raider' : ref?.kind === 'bandit' ? 'hit bandit' : 'torpedo';
      return mh(m, h);
    };
    g.missileGone = (m, burst) => {
      const e = fate.get(m);
      if (e && e.end === 'flying') e.end = burst ? 'shot down' : 'lost';
      return mg(m, burst);
    };
    c.ship.attack('port');
    const _q = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    let t = 0, flared = 0, fired = 0, coast = 0;
    while (t < 200 && !(g.raider?.gone && !g.bandits.length) && f.flying && !g.crippled) {
      // Turn on the bandit fighting you.
      const B = g.bandits.find((b) => !b.dead && !b.gone && b.state === 'fight');
      if (B && coast <= 0) {
        if (g.selected?.() !== B) for (let i = 0; i < 6 && g.selected?.() !== B; i++) g.nextFoe();
        f.flight.aim.setFromRotationMatrix(_q.lookAt(f.obj.position, B.obj.position, up));
        if (g.lockRef === B && g.rails > 0 && !g.missiles.some((m) => m.side === 'ours')) fired += g.fireMissile() ? 1 : 0;
      }
      // A missile on you: cut the drive (no burn: the seat is not held) and flare every second while it closes.
      coast -= 1 / 30;
      if (g.warn && g.warn.range < 2500 && coast <= 0) (coast = 1), (flared += g.dropFlares() ? 1 : 0);
      t += run_(c, 1 / 30);
    }
    const missiles = [...fate.values()].map((e) => `${e.side}:${e.on}>${e.end}@${e.at}`);
    return {
      t: r3(t), fired, flared, missiles, rails: g.rails, flaresLeft: g.myFlares, fhull: r3(g.fhull), parts: parts(c), crippled: !!g.crippled,
      bandits: g.bandits.map((B) => (B.dead ? 'x' : B.gone ? '-' : B.state[0])).join(''), kills: (g.kills ?? []).map((k) => `${k.who}@${r3(k.t)}`),
      banditFlares: g.bandits.map((B) => B.flareState?.left ?? '-'), raiderFlares: g.raider?.flareState?.left ?? '-', carrierFlares: g.carrierFlares?.left ?? '-', ...snap(c)
    };
  },

  /** The helm: the drive's stand-by from cold, a burn, the radiators, a raid and the broadside railguns on Q. */
  async helm(c) {
    const out = {};
    c.input.keys.add('KeyW');
    out.lit = run_(c, 10, () => c.body.vel.length() > 0.05);
    run_(c, 15);
    c.input.keys.delete('KeyW');
    run_(c, 5);
    out.burn = snap(c);
    key('KeyG');
    run_(c, 3);
    out.radiators = c.plant.want;
    key('KeyG');
    const n = counters(c);
    c.guns.raid('starboard');
    for (let i = 0; i < 40 && !c.guns.raider?.gone; i++) {
      key('KeyQ');
      run_(c, 2);
    }
    out.raid = { ...n, raiderHull: r3(c.guns.raider?.hull ?? 0), rail: JSON.stringify(Object.fromEntries((c.guns.railSides ?? []).map((k) => [k, c.guns.rail[k].stock]))) };
    out.end = snap(c);
    return out;
  },

  /** Into the fighter on her pad, launched down the lane, flown off, handed to flight control and landed. */
  async landing(c) {
    const f = c.fighter, phases = [];
    let ph = f.phase, T = 0;
    const step = (secs, until) => {
      const t0 = T;
      while (T - t0 < secs && !until?.()) {
        c.tick(1, 1 / 30);
        T += 1 / 30;
        if (f.phase !== ph) phases.push(`${(ph = f.phase)}@${T.toFixed(2)}`);
      }
    };
    c.bayNow();
    step(60, () => f.flight.online && f.refuelT <= 0);
    c.input.keys.add('KeyW');
    step(30, () => f.flying);
    c.input.keys.delete('KeyW');
    step(8);
    const out = { flew: { pos: v3(f.obj.getWorldPosition(f.obj.position.clone())), vel: v3(f.body.vel) } };
    f.land();
    step(400, () => f.phase === 'seated' || f.phase === 'turn' || f.phase === 'parked');
    step(30, () => f.phase === 'seated');
    return { ...out, phases, landing: f.lastLanding && { manual: !!f.lastLanding.manual, speed: r3(f.lastLanding.speed ?? 0), off: r3(f.lastLanding.off ?? 0) }, end: snap(c) };
  },

  /** A damaged fighter mended on her pad (fighter-repair.mjs): hits on her tank, cockpit, jets and radiator in flight,
   *  she lands, the drones and deck crew go to her, she is held until they are done (she will not launch), then she
   *  launches. The drones' flight and every task's time are seeded; the crew's walk is timed, not stepped. */
  async repair(c) {
    const f = c.fighter, R = c.repairs, THREE = await import('three');
    const step = (secs, until) => run_(c, secs, until);
    c.bayNow();
    step(60, () => f.flight.online && f.refuelT <= 0);
    c.input.keys.add('KeyW');
    step(30, () => f.flying);
    c.input.keys.delete('KeyW');
    step(3);
    const hit = (lp, dir, dmg) => {
      const p = f.obj.localToWorld(new THREE.Vector3(...lp)), d = new THREE.Vector3(...dir).transformDirection(f.obj.matrixWorld);
      c.guns.fighterHit(p, dmg, 0, d);
    };
    hit([-1.38, -0.12, 0.5], [1, 0, 0], 14);
    hit([-1.38, -0.12, -1.0], [1, 0, 0], 9);
    hit([0, 1.5, -2.0], [0, -1, 0], 20);
    hit([3.2, 0.6, 2.1], [-1, 0, 0], 5);
    hit([-1.7, 1.5, 2.1], [0, -1, 0], 6);
    step(1);
    const hurt = parts(c);
    f.land();
    step(400, () => f.phase === 'seated');
    step(1);
    const job = R.jobs.get(f.index);
    const tasks = job ? job.tasks.map((t) => `${t.part.id}:${t.kind}:${r3(t.T)}`) : [];
    const held = f.held;
    // Held: W does not take her out.
    c.input.keys.add('KeyW');
    step(3);
    c.input.keys.delete('KeyW');
    const stayed = f.phase;
    step(20);
    const drones = R.drones.filter((d) => d.task).map((d) => `${d.id}:${d.task.part.id}:${d.state}:${v3(d.pos).join(',')}`);
    const t = step(600, () => !R.jobs.size);
    const st = f.obj.userData.dmg;
    const mended = { t, held: f.held, refuelHold: f.refuelHold, log: R.log.map((l) => `${l.part}:${l.by}:${l.t}`), decals: st.decals.map((d) => d.cell).join(' '), parts: parts(c), prop: { ...f.obj.userData.prop } };
    c.input.keys.add('KeyW');
    step(30, () => f.flying);
    c.input.keys.delete('KeyW');
    return { hurt, tasks, held, stayed, drones, mended, launched: f.phase, end: snap(c) };
  },

  /** The fighter against the ship (collide.mjs): launched, then set going at the hull from a spot in the ship's
   *  frame each time: a slow bump, a crash, 150 m/s (she must not pass through), a glancing pass, into the open bay
   *  over a parked fighter, into a shut bay door, the turning bow swinging into her, and a crash that holes her. */
  /** The carrier's own parts hit and mended (carrier-damage.mjs, carrier-repair.mjs): a thruster cluster, a radiator,
   *  the bow dorsal turret, the port bay door (jammed open while the bay is shut), the forward drum's bearing, and a
   *  propellant tank holed from below (its leak pushing her). The drones and parties mend them by priority, and you
   *  help at the turret with the tool kit. */
  async hull(c) {
    const P = c.parts, H = c.hullRepair, get = (id) => P.byId.get(id);
    const at = (id, x, y, z) => get(id).pos.clone().set(x, y, z);
    c.bayNow();
    P.hit(get('rcs-1'), 70, get('rcs-1').pos.clone());
    P.hit(get('radiator-port'), 55, at('radiator-port', -45, 0.5, 120));
    P.hit(get('turret-dorsal'), 60, get('turret-dorsal').pos.clone());
    const door = spots(c).door;
    P.hit(get('bay-door'), 50, at('bay-door', door.x, -3, (door.z[0] + door.z[1]) / 2));
    P.hub('a', 60);
    const shot = c.ship.hit({ target: 'tanks-aft', from: 'below', pen: 30 });
    c.tick(2, 1 / 30); // two frames: the cluster's damage reaches its thrusters on the next one
    const hit = {
      shot: shot?.path, rcs: r3(get('rcs-1').ts[0].health), turretOut: !!get('turret-dorsal').t.out, jammed: c.doors.sides.w.jammed,
      shudder: c.C.drums.halves.map((h) => r3(h.shudder ?? 0)), leak: P.leaks.map((l) => Math.round(l.force)), queue: H.board().map((j) => `${j.what}:${j.by}`)
    };
    // The bay shut: the jammed port door stays open, the starboard one shuts.
    c.doors.setBay(0);
    run_(c, 8);
    const bay = { port: r3(c.doors.kOf('w')), stbd: r3(c.doors.kOf('e')), ship: snap(c).ship };
    // You at the turret's hoist trunk with the tool kit, holding E, until the party gets there and a while after.
    c.dc.carry.set(c.L.integrity.parts.kit, { agent: Infinity });
    const tt = get('turret-dorsal').task, u = tt?.use;
    if (u) {
      c.place(c.L.weapons.turrets[0].from.deck, u.pos.x, u.pos.z + 0.8, 0);
      key('KeyE');
    }
    const near = c.walker.nearestUse()?.repair === tt;
    run_(c, 60, () => !get('turret-dorsal').task);
    key('KeyE', 'keyup');
    const helped = r3(tt?.helped ?? 0);
    const t = run_(c, 900, () => !H.tasks.length);
    return {
      hit, bay, near, helped, t, log: H.log.map((j) => `${j.what}:${j.by}@${j.t}`),
      after: { hp: P.parts.filter((p) => p.hp < p.max).map((p) => p.id), door: [r3(c.doors.kOf('w')), c.doors.sides.w.jammed], shudder: c.C.drums.halves.map((h) => r3(h.shudder ?? 0)) },
      rcsAfter: r3(get('rcs-1').ts[0].health), drones: H.drones.map((d) => d.state), ...snap(c)
    };
  },

  async collide(c) {
    const f = c.fighter, C = c.C, THREE = await import('three');
    const step = (secs, until) => run_(c, secs, until);
    c.bayNow();
    step(60, () => f.flight.online && f.refuelT <= 0);
    c.input.keys.add('KeyW');
    step(30, () => f.flying);
    c.input.keys.delete('KeyW');
    step(1);
    const cq = new THREE.Quaternion();
    const shoot = (p, d, speed, yaw, secs) => {
      if (!f.flying) (f.scene.attach(f.obj), (f.phase = 'flying'), (f.obj.visible = true)); // back out after flight control took her, or the wreck
      C.obj.updateMatrixWorld(true);
      C.obj.getWorldQuaternion(cq);
      f.obj.position.copy(C.obj.localToWorld(new THREE.Vector3(...p)));
      f.obj.quaternion.copy(cq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
      f.flight.aim.copy(f.obj.quaternion);
      f.body.vel.copy(c.body.vel).add(new THREE.Vector3(...d).normalize().multiplyScalar(speed).applyQuaternion(cq));
      f.body.ang.set(0, 0, 0);
      c.collide.prev = null;
      c.guns.fhull = 100;
      c.guns.crippled = false;
      c.guns.fdmg?.reset(); // every part whole again
      const n0 = c.collide.hits.length;
      step(secs, () => !f.flying);
      const rel = f.body.vel.clone().sub(c.body.vel).applyQuaternion(cq.invert());
      return {
        hits: c.collide.hits.slice(n0, n0 + 4).map((h) => `${h.what}:${r3(h.speed)}:${r3(h.damage)}${h.hole ? `:${h.hole.join('/')}` : ''}`),
        at: v3(C.obj.worldToLocal(f.obj.position.clone())), rel: v3(rel), hull: r3(c.guns.fhull), parts: parts(c), phase: f.phase
      };
    };
    const port = -Math.PI / 2; // nose to starboard: in at her port side
    const out = {};
    // Her bow's side, 44 m aft of its tip; the bay between the first two pads; a berth's cradle.
    const S = spots(c), bz = S.bow + 44, dx = S.door.x;
    out.bump = shoot([-40, 0, bz], [1, 0, 0], 3, port, 5);
    out.crash = shoot([-45, 0, bz], [1, 0, 0], 15, port, 3);
    out.fast = shoot([-200, 0, bz], [1, 0, 0], 150, port, 2);
    out.glance = shoot([-50, 0, S.bow - 16], [0.34, 0, 0.94], 30, Math.PI - 0.35, 3);
    out.bay = shoot([dx - 26.5, -6, S.pads], [1, -0.08, 0], 6, port, 14);
    if (S.berth != null) out.cradle = shoot([dx - 15, -10.6, S.berth], [1, 0, 0], 6, port, 8); // in low through the open door at an empty berth: onto its cradle
    c.doors.setBay(0);
    c.doors.k = 0;
    c.doors.place ? c.doors.place() : c.doors.frame(0); // each side's door shut at once
    out.door = shoot([dx - 16.5, -4, S.pads], [1, 0, 0], 5, port, 6);
    c.bayNow();
    c.body.ang.set(0, 0.06, 0);
    out.swing = shoot([-31, 0, bz - 10], [1, 0, 0], 0.0001, port, 5);
    c.body.ang.set(0, 0, 0);
    out.holed = shoot([-60, 0, bz], [1, 0, 0], 40, port, 2);
    out.stats = { ...c.collide.stats, ms: undefined, last: undefined };
    return out;
  },

  /** Ladders, a drum's lift down and up, the hub ring and pushing off it into the spine, a drum ladder. */
  async walk(c) {
    c.career.free();
    const out = {};
    const climbTo = async (deck, x, z, pre) => {
      c.place(deck, x, z, 0);
      const u = findUse(c.walker.interior, pre);
      if (!u) return `no ${pre}`;
      u.use();
      await wait(900);
      return { t: run_(c, 8, () => c.info().deck !== deck), ...snap(c) };
    };
    const L = c.L;
    for (const l of L.ladders.slice(0, 3)) out[l.id] = await climbTo(l.a.deck, l.a.at[0], l.a.at[1], `${l.id}-a`);
    // Down a lift into the first drum room, along the ring, up the drum ladder, back up to the hub, push off.
    const room = L.drum.rooms[0];
    c.go(room.id);
    out.drumRoom = snap(c);
    c.input.keys.add('KeyD');
    run_(c, 6);
    c.input.keys.delete('KeyD');
    out.alongRing = { drum: JSON.stringify({ ...c.drum(), ride: undefined }), ...snap(c) };
    // To a spoke's segment, where the ladder between the decks and the lift are.
    c.place(`drum-${room.half}-${room.deck}`, 0, (room.z[0] + room.z[1]) / 2, 0, L.drum.spokes.segments[0]);
    c.input.keys.add('KeyA');
    run_(c, 4);
    c.input.keys.delete('KeyA');
    out.spokeSeg = { drum: JSON.stringify({ ...c.drum(), ride: undefined }), uses: c.walker.interior.interactables.map((u) => u.id).filter((id) => /lift|ladder/.test(id)).join(' '), ...snap(c) };
    const dl = findUse(c.walker.interior, 'dladder-');
    if (dl) {
      c.walker.pos.set(dl.x, c.walker.pos.y, dl.z);
      dl.use();
      run_(c, 5);
      out.drumLadder = { drum: JSON.stringify({ ...c.drum(), ride: undefined }), ...snap(c) };
    }
    const lift = findUse(c.walker.interior, 'lift-');
    if (lift) {
      c.walker.pos.set(lift.x, c.walker.pos.y, lift.z);
      lift.use();
      await wait(900);
      out.liftUp = { t: run_(c, 15, () => !c.drum()), ...snap(c) };
      // Along the hub ring, away from the lift's doors, and push off up into the spine.
      c.input.keys.add('KeyW');
      run_(c, 2);
      c.input.keys.delete('KeyW');
      out.hubWalk = snap(c);
      key('KeyE');
      await wait(900);
      out.liftDown = { t: run_(c, 12), ...snap(c) }; // the lift's doors are the nearest use: E takes it down again
    }
    // From the spine, catch a hub ring, walk round it, and push off it back up into the spine.
    c.go('spine');
    const sp = c.walker.interior.interactables.find((u) => u.id.startsWith('spine-hub-'));
    if (sp) {
      c.walker.pos.set(sp.x, c.walker.pos.y, sp.z);
      sp.use();
      out.caught = { t: run_(c, 3, () => c.walker.interior.deck?.id?.toString().startsWith('hub')), ...snap(c) };
      c.input.keys.add('KeyD');
      run_(c, 3);
      c.input.keys.delete('KeyD');
      key('KeyE');
      out.pushedOff = { t: run_(c, 4), ...snap(c) };
    }
    return out;
  },

  /** Weightless in the spine and the crew tunnel (weightless.mjs): nothing is taken for you and the puffer is off;
   *  swim toward a wall and take the rail there with Space (reaching for it), push off along it with W, take the next
   *  one, pull along it with S, a hard push (Shift W) up to the deckhead, a drift aft under the drive, and holding on
   *  under it. */
  async float(c) {
    c.career.free();
    const w = c.walker, F = w.floater, K = c.input.keys, out = {};
    const at = () => ({ you: v3(w.pos), vel: v3(w.vel), held: F.held?.h.kind ?? null, gas: r3(F.gas) });
    const hold = (code, secs) => (K.add(code), run_(c, secs), K.delete(code));
    out.holds = [...c.C.decks.values()].reduce((n, I) => n + (I.holds?.length ?? 0), 0);
    c.place(4, 0, spots(c).spine, -Math.PI / 2); // the spine, facing starboard
    run_(c, 0.2);
    out.start = at(); // adrift: nothing taken
    F.reset(); // swim toward the starboard rail
    hold('KeyW', 1);
    out.puffed = at();
    run_(c, 3);
    K.add('Space'); // take the rail you met
    out.caught = { t: run_(c, 1, () => F.held), ...at() };
    K.delete('Space');
    run_(c, 0.2);
    w.yaw = 0;
    w.pitch = 0;
    hold('KeyW', 0.6); // charge, and let go: off the hold where you look
    run_(c, 1 / 30);
    out.pushed = at();
    run_(c, 2);
    out.drifted = at();
    K.add('Space');
    out.took = { t: run_(c, 1, () => F.held), ...at() };
    K.delete('Space');
    hold('KeyS', 2);
    out.pulled = at();
    w.pitch = 1.2;
    K.add('ShiftLeft');
    hold('KeyW', 1 / 30); // Shift+W: a hard push
    K.delete('ShiftLeft');
    run_(c, 1.5);
    out.up = at();
    // Under the drive: adrift in the crew tunnel you go aft; holding a rail you stay.
    const feel = c.G.walk.feel.bind(c.G.walk);
    c.G.walk.feel = (p, dt) => feel(2, dt);
    c.place(2, 0, 0, 0);
    run_(c, 2);
    out.driveAdrift = at();
    c.place(2, 1, 0, 0);
    K.add('Space');
    run_(c, 0.2);
    K.delete('Space');
    run_(c, 2);
    out.driveHeld = at();
    c.G.walk.feel = feel;
    return out;
  },

  /** Brace for impact (weapons/torpedoes.mjs braceFrame, weightless.mjs): the brace straps show at action stations;
   *  strapped in, a hit near you does nothing; holding a rail, a far one leaves you holding and a near one tears you
   *  off; loose, a near one throws you into the wall and hurts. Last, a torpedo fired at you calls brace and counts
   *  down, and its hit throws you. */
  async brace(c) {
    c.career.free();
    const w = c.walker, F = w.floater, G = c.G, out = {};
    const shown = () => w.interior.interactables.filter((u) => u.id === 'brace' && !u.hidden()).length;
    const at = () => ({ you: v3(w.pos), vel: v3(w.vel), held: F.held?.h.kind ?? null, strapped: !!F.strapped, hurt: r3(F.hurt) });
    // In the spine. A fixed place, not `spots(c).spine`: a kick's sideways jitter is hashed from where it lands
    // (weightless.mjs `jolt`), and whether the near hit blacks you out, and the loose one does not, hangs on it.
    const spineZ = -50, sp = c.C.rooms.get('spine');
    if (!(spineZ > sp.z[0] + 5 && spineZ < sp.z[1] - 5)) throw new Error('brace: z -50 is no longer in the spine; pick a place where the near hit blacks you out and the loose one does not');
    c.place(4, 0, spineZ, -Math.PI / 2); // the spine
    run_(c, 0.5);
    out.quiet = { shown: shown(), brace: !!c.guns.brace };
    // Strapped in: a torpedo's kick a few metres away moves you not at all.
    c.ship.stations = true;
    const b = w.interior.braces.slice().sort((p, q) => p.eye.distanceTo(w.pos) - q.eye.distanceTo(w.pos))[0];
    c.place(4, b.eye.x - b.n.x * 0.1, b.eye.z - b.n.z * 0.1, 0);
    w.yaw = Math.atan2(b.n.x, b.n.z);
    run_(c, 0.2);
    const u = w.nearestUse();
    out.offer = u?.id === 'brace' ? u.label : u?.id ?? null;
    u?.use();
    run_(c, 0.2);
    const kick = (dx) => G.C.bus.emit('jolt', { at: w.pos.clone().add({ x: dx, y: 0, z: 0 }), dir: { x: -1, y: 0, z: 0 }, kind: 'kick' });
    const still = w.pos.clone();
    kick(4);
    run_(c, 1);
    out.strapped = { ...at(), moved: r3(w.pos.distanceTo(still)), label: w.nearestUse()?.label ?? null };
    w.nearestUse()?.use();
    run_(c, 0.5);
    out.unstrapped = at();
    // Holding a rail: a hit 60 m off leaves you holding; one 3 m off tears you away, into the wall hard enough to black
    // you out (the damage control party carries you off: a fade, in real time).
    c.place(4, 0, spineZ, -Math.PI / 2);
    c.input.keys.add('KeyW');
    run_(c, 1);
    c.input.keys.delete('KeyW');
    c.input.keys.add('Space'); // take the rail as you come to it
    run_(c, 6, () => F.held);
    c.input.keys.delete('Space');
    out.holding = at();
    kick(60);
    run_(c, 0.5);
    out.farHit = at();
    kick(-3);
    let blackout = false;
    run_(c, 3, () => (blackout = G.fading));
    out.nearHit = { ...at(), blackout };
    for (let i = 0; i < 30 && G.fading; i++) await wait(100);
    out.carried = c.G.walk.roomNow();
    // Loose in the middle of the spine: thrown into the wall.
    c.place(4, 0, spineZ, -Math.PI / 2);
    run_(c, 0.2);
    F.hurt = 0;
    kick(-1.5);
    out.thrown = { t: run_(c, 4, () => F.hurt > 0), ...at(), blackout: G.fading };
    c.ship.stations = false;
    F.hurt = 0;
    // Last (it holes the spine): a torpedo from 3 km off her starboard beam at the spine, closing at 900 m/s.
    const calls = [], jolts = [];
    const off = G.C.bus.on('call', (e) => calls.push(e.id)), offJ = G.C.bus.on('jolt', (e) => jolts.push([e.kind, r3(e.at.distanceTo(w.pos))]));
    c.place(4, 0, spineZ, -Math.PI / 2);
    run_(c, 0.5);
    const aim = w.pos.clone().setY(w.pos.y + 1.6);
    const from = c.C.frame.localToWorld(aim.clone().add({ x: 3000, y: 0, z: 0 }));
    const dir = c.C.frame.localToWorld(aim.clone()).sub(from).normalize();
    c.guns.torpedo(from, dir.multiplyScalar(900).add(c.guns.body.vel), 'theirs', aim.clone());
    out.braced = { t: run_(c, 6, () => !!c.guns.brace), eta: r3(c.guns.brace?.eta ?? -1), shown: shown(), calls: [...calls] };
    let peak = 0;
    out.ended = { t: run_(c, 10, () => ((peak = Math.max(peak, w.vel.length())), !c.guns.brace)), hits: c.ship.log.length, torps: c.guns.torps.length, thrown: r3(peak), jolts, ...at() };
    off();
    offJ();
    return out;
  },

  /** The player's career (content/careers/service.json), chapter one, end to end across both ships: a part per page.
   *  Part one is the carrier's start page ("Join as a new hand"); each part plays the orders for its ship until the
   *  order in hand is aboard the other, notes what the duty card says then, and returns `next`: the other ship's page,
   *  as `goAboard` would load it. `runAll` loads that in a fresh page with the same voyage (the save is the voyage's
   *  own: nothing is seeded) and calls this again: carrier, cutter, carrier. The drills are done by hand; the crew's
   *  pilot flies the sortie, the transit and the recovery (which the helm order refuses, as flown by the crew); nobody
   *  aims the turret, so the gunnery orders run their course and are then taken as done; one round is fired on HOLD. */
  async service(c) {
    const { loadVoyage, saveVoyage, pageFor } = await import('../src/core/voyage.mjs');
    const K = c.career, q = new URLSearchParams(location.search), log = [];
    if (q.has('host')) for (let i = 0; i < 300 && !c.berth; i++) await wait(200); // the host is built after the ship
    if (q.has('at') || q.has('berth')) for (let i = 0; i < 100 && !K.on; i++) await wait(200); // came through an airlock: the career is picked up
    else document.getElementById('c-board').click();
    if (!K.on) return { error: 'the career did not begin', ship: c.ship_id };
    const first = K.i, where = (i) => K.i === i;
    const seat = async () => {
      if (c.mode() === 'gun') (key('KeyE'), await wait(1100));
      if (c.mode() !== 'helm') (c.go(c.L.helm.room ?? 'bridge'), c.setMode('helm'));
    };
    const turret = async () => {
      if (c.mode() === 'gun') return;
      if (c.mode() !== 'walk') c.setMode('walk');
      const t = c.guns.turrets[0], fr = t.spec.from;
      c.place(fr.deck, fr.at[0], fr.at[1], fr.yaw ?? 0);
      findUse(c.walker.interior, 'man-')?.use();
      await wait(1100);
    };
    const step = async (i) => {
      const st = K.step;
      switch (st.do) {
        case 'talk': if (c.mode() !== 'walk') c.setMode('walk'); K.talked(st.who); break;
        case 'suit': c.ship.don(); break;
        case 'rounds': if (c.mode() !== 'walk') c.setMode('walk'); for (const r of st.rooms) { c.go(r); run_(c, 0.2); } break;
        case 'drill': {
          run_(c, 3, () => !!c.dc.job);
          const job = c.dc.job;
          if (!job) return 'no job';
          c.dc.take(job.K.kit);
          if (job.K.isolate) c.dc.isolate();
          c.go(job.room.id);
          c.walker.pos.set(job.spot.ux ?? job.spot.x, c.walker.pos.y, job.spot.uz ?? job.spot.z); // (a job on a wall: where you stand to reach it)
          c.input.keys.add('KeyE');
          run_(c, 120, () => !where(i));
          c.input.keys.delete('KeyE');
          break;
        }
        case 'pilot': {
          // Refused first: L at the helm is not a passenger's (career.mjs `blocks`).
          await seat();
          if (c.berth.phase === 'berthed' && c.pilot) { key('KeyL'); log.push(`${i} L as a passenger: ${c.berth.phase}${K.allows('launch') ? '' : ', refused'}`); }
          run_(c, 1200, () => !where(i));
          log.push(`${i} pilot: ${c.pilot ? c.pilot.log.map((l) => l.do).join(' ') + (c.pilot.busy ? ' …' : '') : 'no pilot'} · ${c.berth.phase}`);
          break;
        }
        case 'shoot': {
          // Nobody aims: the drill runs past and fails.
          await turret();
          run_(c, 240, () => !where(i) || (K.s.phase === 'on' && K.s.R?.gone));
          run_(c, 1);
          if (where(i)) { log.push(`${i} shoot: stayed (${K.s.phase})`); c.guns.dismiss(); K.complete(); }
          return 'ok';
        }
        case 'obey': {
          await turret();
          const fc = c.guns.fireControl;
          run_(c, 240, () => K.s.phase === 'hold');
          log.push(`${i} obey: ${fc.state}, ordered ${fc.ordered}`);
          run_(c, 2);
          fc.fired(null, null); // a round on HOLD: on report, and the drill starts again
          run_(c, 0.2);
          log.push(`${i} obey: fired on hold · check fires ${K.checkFire} · ${K.s.phase} · ordered ${fc.ordered}`);
          run_(c, 400, () => K.s.phase === 'tight');
          log.push(`${i} obey: ${fc.state} on ${fc.designated?.label}`);
          run_(c, 240, () => !where(i) || K.s.phase === 'wait'); // nobody aims: the tug finishes its runs
          if (where(i)) { log.push(`${i} obey: stayed (${K.s.phase})`); c.guns.dismiss(); fc.auto(); K.complete(); }
          return 'ok';
        }
        case 'launch': await seat(); key('KeyL'); run_(c, 120, () => !where(i)); break;
        case 'transit': {
          // The crew's pilot flies it (nothing here can), which the order allows; without one it is taken as done.
          run_(c, 4, () => !!c.helmSight.nav);
          if (!c.pilot || !c.helmSight.nav) { log.push(`${i} transit: skipped`); K.complete(); return 'ok'; }
          c.pilot.fly([{ do: 'goto', at: st.at }]);
          run_(c, 600, () => !where(i));
          break;
        }
        case 'land': {
          // The crew's pilot brings her home: the order wants your own hand, so it is refused and the script takes it.
          if (c.pilot) c.pilot.fly([{ do: 'recover' }]);
          else c.berth.takeIn();
          run_(c, 900, () => !where(i));
          log.push(`${i} land: ${JSON.stringify(c.berth.lastRecovery?.grade ?? c.berth.lastRecovery)} by the crew · ${c.berth.phase} · back to order ${K.i}`);
          if (K.i < i) { K.i = i; K.enter(); }
          if (where(i)) K.complete();
          return 'ok';
        }
        case 'muster': c.go(c.routine.you.muster); run_(c, 400, () => !where(i)); await wait(1500); run_(c, 1); break; // the roll is called at the bell; then the watch goes by behind a fade
        case 'sleep': {
          const b = c.routine.bunkAt;
          c.place(b.deck, b.x, b.z, 0, b.seg);
          findUse(c.walker.interior, 'bunk')?.use();
          await wait(3600);
          break;
        }
        default: log.push(`${i} ${st.do}: skipped`); K.complete(); return 'ok';
      }
      run_(c, 2, () => !where(i));
      return 'ok';
    };
    run_(c, 0.5);
    for (let n = 0; n < 40 && !K.done && !K.away; n++) {
      const i = K.i, st = K.step;
      const how = await step(i);
      log.push(`${i} ${st.do}${st.who ? ' ' + st.who : ''}: ${how}${K.i === i ? ' (not done)' : ''} · ${K.rank} · ${[...K.quals].join(' ')}`);
      if (how !== 'ok' || K.i === i) break;
    }
    run_(c, 0.5);
    const out = { ship: c.ship_id, from: first, i: K.i, rank: K.rank, quals: [...K.quals], unlocked: [...K.unlocked].sort(), book: K.book, checkFire: K.checkFire, flags: Object.keys(K.flags), done: K.done, log };
    out.card = document.getElementById('c-duty').querySelector('.d-order')?.textContent ?? null;
    if (K.away) {
      // The order in hand is aboard the other ship: where the card sends you, and her page (what `goAboard` loads).
      const t = K.target(), to = K.step.ship;
      out.cross = { to, at: t && [t.deck, r3(t.x), r3(t.z)], complete: (K.complete(), K.i) };
      const v = loadVoyage();
      v.aboard = to;
      saveVoyage(v);
      out.next = pageFor(to, c.K.ships[to].page, { pathname: '', search: '' }).slice(1);
    }
    out.saved = (({ i, rank, quals, book }) => ({ i, rank, quals, book }))(loadVoyage().career ?? {});
    return out;
  },

  /** The career from the start screen: the first orders done by hand, then the gunnery and flying orders. */
  async career(c) {
    const KEY = c.career.constructor.key, before = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    try {
      const K = c.career, log = [];
      document.getElementById('c-board').click();
      const where = (i) => K.i === i;
      const step = async (i) => {
        const st = K.step;
        if (!st) return 'done';
        switch (st.do) {
          case 'talk': K.talked(st.who); break;
          case 'read': c.routine.openBill(true); c.routine.closeBill(); break;
          case 'go': c.go(st.room); break;
          case 'sleep': {
            const b = c.routine.bunkAt;
            c.place(b.deck, b.x, b.z, 0, b.seg);
            findUse(c.walker.interior, 'bunk')?.use();
            await wait(3600);
            break;
          }
          case 'muster': c.go(c.routine.you.muster); run_(c, 150, () => !where(i)); break; // the roll is called at the bell
          case 'drill': {
            run_(c, 3, () => !!c.dc.job);
            const job = c.dc.job;
            if (!job) return 'no job';
            c.dc.take(job.K.kit);
            if (job.K.isolate) c.dc.isolate();
            c.go(job.room.id);
            c.walker.pos.set(job.spot.x, c.walker.pos.y, job.spot.z);
            c.input.keys.add('KeyE');
            run_(c, 120, () => !where(i));
            c.input.keys.delete('KeyE');
            break;
          }
          case 'rounds': for (const r of st.rooms) { c.go(r); run_(c, 0.2); } break;
          case 'suit': c.ship.don(); break;
          case 'man': {
            const t = c.guns.turrets[0], fr = t.spec.from;
            c.place(fr.deck, fr.at[0], fr.at[1], fr.yaw ?? 0);
            findUse(c.walker.interior, 'man-')?.use();
            await wait(900);
            break;
          }
          case 'shoot': case 'raid': {
            // Nobody aims: the drill runs past and fails, the raid ends however the point defence leaves it.
            run_(c, 240, () => !where(i) || (K.s.phase === 'on' && K.s.R?.gone));
            run_(c, 1);
            if (where(i)) { log.push(`${i} ${st.do}: stayed (${K.s.phase})`); K.complete(); }
            return 'ok';
          }
          case 'board': {
            key('KeyE'); await wait(900); // out of the turret
            // At her grab frame, on the end of her spur of the gangway (the airless hangar), and up into her.
            const f = c.L.fighters[0];
            c.place(c.C.rooms.get('hangar').deck, f.at[0] + 1, f.at[1] - 4.6, Math.PI);
            findUse(c.walker.interior, 'fighter-0')?.use();
            await wait(900);
            break;
          }
          case 'launch': c.bayNow(); run_(c, 60, () => c.fighter.flight.online && c.fighter.refuelT <= 0); c.input.keys.add('KeyW'); run_(c, 30, () => c.fighter.flying); c.input.keys.delete('KeyW'); break;
          case 'land': {
            c.fighter.land();
            run_(c, 400, () => !where(i));
            run_(c, 30, () => c.fighter.phase === 'seated');
            if (K.i < i) {
              // The order wants a landing you fly yourself: flight control's is refused, so the script takes the order.
              log.push(`${i} land: flight control landed her (${c.fighter.phase}), refused`);
              K.i = i;
              K.enter();
              K.complete();
            }
            break;
          }
          case 'helm': key('KeyE'); await wait(900); c.go('bridge'); c.setMode('helm'); break;
          default:
            // Orders the script cannot fly (turning her, the transit): taken as done, so the rest still runs.
            log.push(`${i} ${st.do}: skipped`);
            K.complete();
            return 'ok';
        }
        run_(c, 2, () => !where(i));
        return 'ok';
      };
      for (let n = 0; n < 40 && !K.done; n++) {
        const i = K.i, st = K.step;
        const how = await step(i);
        log.push(`${i} ${st?.do}${st?.who ? ' ' + st.who : ''}: ${how}${K.i === i ? ' (not done)' : ''} · ${K.rank} · clock ${Math.round(c.routine.t)}`);
        if (how !== 'ok' || K.i === i) break;
      }
      return { log, i: K.i, rank: K.rank, book: K.book, unlocked: [...K.unlocked].sort(), end: snap(c) };
    } finally {
      if (before == null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, before);
    }
  }
};

/** A short fingerprint of a result, to compare two runs at a glance. */
export function hash(out) {
  const s = JSON.stringify(out);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) (h ^= s.charCodeAt(i)), (h = Math.imul(h, 16777619) >>> 0);
  return h.toString(16).padStart(8, '0');
}

/** One scenario, on this page (opened with its URL, above). */
export async function run(name) {
  const c = await ready();
  const out = JSON.parse(JSON.stringify(await scenarios[name](c)));
  return { hash: hash(out), ...out };
}

const PAGES = {
  raid: 'at=bridge', hull: 'at=bridge', helm: 'at=helm', landing: 'at=fighter', repair: 'at=fighter', collide: 'at=fighter', bandits: 'at=fighter', missiles: 'at=fighter', walk: 'at=bridge', float: 'at=bridge', brace: 'at=bridge',
  career: 'career=ship', // the carrier's own first week (ships/carrier/career.json), not the player's career
  service: '', // the player's career (content/careers/service.json): the start page, then a page per crossing
  // Another ship's folder (ships/cutter/). `career=ship`: as she was baselined, with no career aboard (she has no
  // career.json). Without it the player's career brings her three named crew aboard and the scenario's `has.career`
  // reads true; nothing else in its result changes.
  cutter: 'ship=cutter&at=bridge&career=ship',
  berth: 'ship=cutter&host=carrier&berth=berth-port&at=helm', // the cutter carried in the carrier's hangar (berth.mjs)
  recover: 'ship=cutter&host=carrier&berth=berth-port&at=helm', // flying her home yourself (recovery.mjs)
  bump: 'ship=cutter&host=carrier&berth=berth-port&at=helm', // the cutter against the carrier (collide.mjs `ShipCollisions`)
  pilot: 'ship=cutter&host=carrier&berth=berth-port&at=helm' // the crew's pilot flies a sortie (pilot.mjs)
};

/** Every scenario, each in a fresh page of its own (an iframe), from any page of this site: `{ name: { hash, … } }`.
 *  About three minutes. */
export async function runAll(names = Object.keys(PAGES), seed = 7) {
  const res = {};
  // Every page starts from a new voyage (both cutters on their cradles: which berths are full is part of what is solid
  // in the hangar); the one in hand is put back at the end.
  const VOYAGE = 'threadspace.voyage', voyage = localStorage.getItem(VOYAGE);
  for (const name of names) {
    localStorage.removeItem(VOYAGE);
    // A scenario that crosses from one ship to another returns `next`, the other ship's page: it is loaded in a fresh
    // page with the voyage as the last part left it, and the scenario goes on there (`service`). Its hash is the parts'.
    const parts = [];
    for (let page = PAGES[name]; page != null && parts.length < 6; page = parts.at(-1).next) {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;opacity:0;pointer-events:none';
      const base = new URL('../carrier.html', import.meta.url);
      f.src = `${base}?${page}&voice=0&crew=0&dc=0&hold=1&seed=${seed}`;
      const loaded = new Promise((r) => f.addEventListener('load', r, { once: true }));
      document.body.append(f);
      await loaded;
      try {
        const mod = await f.contentWindow.eval(`import(${JSON.stringify(new URL(`carrier-check.mjs?${Date.now()}`, import.meta.url).href)})`);
        parts.push(await mod.run(name));
      } catch (e) {
        parts.push({ error: String(e?.stack ?? e) });
      }
      f.remove();
    }
    res[name] = parts.length === 1 ? parts[0] : { hash: hash(parts.map((p) => p.hash)), parts };
  }
  if (voyage === null) localStorage.removeItem(VOYAGE);
  else localStorage.setItem(VOYAGE, voyage);
  return res;
}
