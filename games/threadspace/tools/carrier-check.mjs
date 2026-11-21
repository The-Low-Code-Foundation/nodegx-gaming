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
//   carrier.html?at=helm&voice=0&crew=0&dc=0&hold=1&seed=7       → run('helm')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('landing')
//   carrier.html?at=fighter&voice=0&crew=0&dc=0&hold=1&seed=7    → run('collide')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('walk')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('float')
//   carrier.html?at=bridge&voice=0&crew=0&dc=0&hold=1&seed=7     → run('brace')
//   carrier.html?voice=0&crew=0&dc=0&hold=1&seed=7 (start page)  → run('career')
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
    dcLog: c.dc.log.map((j) => `${j.kind}@${j.room}:${j.ok}`), fighter: c.fighter.phase
  };
}

/** Counts what a raid does, by wrapping the guns' own calls. */
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

const scenarios = {
  /** A raid from port with nobody at the guns: the point defence, the CIC's broadside, the recoil. */
  async raid(c) {
    const n = counters(c);
    c.ship.attack('port');
    const t = run_(c, 200, () => c.guns.raider?.gone);
    return { t, ...n, raiderDead: !!c.guns.raider?.dead, raiderHull: r3(c.guns.raider?.hull ?? 0), ...snap(c) };
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

  /** The fighter against the ship (collide.mjs): launched, then set going at the hull from a spot in the ship's
   *  frame each time: a slow bump, a crash, 150 m/s (she must not pass through), a glancing pass, into the open bay
   *  over a parked fighter, into a shut bay door, the turning bow swinging into her, and a crash that holes her. */
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
      if (!f.flying) (f.scene.attach(f.obj), (f.phase = 'flying')); // back out after flight control took her
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
      const n0 = c.collide.hits.length;
      step(secs, () => !f.flying);
      const rel = f.body.vel.clone().sub(c.body.vel).applyQuaternion(cq.invert());
      return {
        hits: c.collide.hits.slice(n0, n0 + 4).map((h) => `${h.what}:${r3(h.speed)}:${r3(h.damage)}${h.hole ? `:${h.hole.join('/')}` : ''}`),
        at: v3(C.obj.worldToLocal(f.obj.position.clone())), rel: v3(rel), hull: r3(c.guns.fhull), phase: f.phase
      };
    };
    const port = -Math.PI / 2; // nose to starboard: in at her port side
    const out = {};
    out.bump = shoot([-40, 0, -100], [1, 0, 0], 3, port, 5);
    out.crash = shoot([-45, 0, -100], [1, 0, 0], 15, port, 3);
    out.fast = shoot([-200, 0, -100], [1, 0, 0], 150, port, 2);
    out.glance = shoot([-50, 0, -160], [0.34, 0, 0.94], 30, Math.PI - 0.35, 3);
    out.bay = shoot([-50, -6, 33], [1, -0.08, 0], 6, port, 14);
    c.doors.setBay(0);
    c.doors.k = 0;
    c.doors.frame(0);
    out.door = shoot([-40, -4, 33], [1, 0, 0], 5, port, 6);
    c.bayNow();
    c.body.ang.set(0, 0.06, 0);
    out.swing = shoot([-31, 0, -110], [1, 0, 0], 0.0001, port, 5);
    c.body.ang.set(0, 0, 0);
    out.holed = shoot([-60, 0, -100], [1, 0, 0], 40, port, 2);
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

  /** Weightless in the spine and the crew tunnel (weightless.mjs): puff to a wall and take the rail there, push off
   *  along it, take the next one, pull along it, a hard push up to the deckhead, a drift aft under the drive, and
   *  holding on under it. */
  async float(c) {
    c.career.free();
    const w = c.walker, F = w.floater, K = c.input.keys, out = {};
    const at = () => ({ you: v3(w.pos), vel: v3(w.vel), held: F.held?.h.kind ?? null, gas: r3(F.gas) });
    const hold = (code, secs) => (K.add(code), run_(c, secs), K.delete(code));
    out.holds = [...c.C.decks.values()].reduce((n, I) => n + (I.holds?.length ?? 0), 0);
    c.place(4, 0, -50, -Math.PI / 2); // the spine, facing starboard
    run_(c, 0.2);
    out.start = at(); // the deck handle under you, taken
    F.reset(); // let go, and puff toward the starboard rail
    hold('KeyW', 1);
    out.puffed = at();
    out.caught = { t: run_(c, 5, () => F.held), ...at() };
    w.yaw = 0;
    w.pitch = 0;
    hold('KeyW', 1);
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
    hold('KeyW', 1 / 30);
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
    c.place(4, 0, -50, -Math.PI / 2); // the spine
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
    c.place(4, 0, -50, -Math.PI / 2);
    c.input.keys.add('KeyW');
    run_(c, 1);
    c.input.keys.delete('KeyW');
    run_(c, 6, () => F.held);
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
    c.place(4, 0, -50, -Math.PI / 2);
    run_(c, 0.2);
    F.hurt = 0;
    kick(-1.5);
    out.thrown = { t: run_(c, 4, () => F.hurt > 0), ...at(), blackout: G.fading };
    c.ship.stations = false;
    F.hurt = 0;
    // Last (it holes the spine): a torpedo from 3 km off her starboard beam at the spine, closing at 900 m/s.
    const calls = [], jolts = [];
    const off = G.C.bus.on('call', (e) => calls.push(e.id)), offJ = G.C.bus.on('jolt', (e) => jolts.push([e.kind, r3(e.at.distanceTo(w.pos))]));
    c.place(4, 0, -50, -Math.PI / 2);
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
  raid: 'at=bridge', helm: 'at=helm', landing: 'at=fighter', collide: 'at=fighter', walk: 'at=bridge', float: 'at=bridge', brace: 'at=bridge', career: ''
};

/** Every scenario, each in a fresh page of its own (an iframe), from any page of this site: `{ name: { hash, … } }`.
 *  About two minutes. */
export async function runAll(names = Object.keys(PAGES), seed = 7) {
  const res = {};
  for (const name of names) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px;opacity:0;pointer-events:none';
    const base = new URL('../carrier.html', import.meta.url);
    f.src = `${base}?${PAGES[name]}&voice=0&crew=0&dc=0&hold=1&seed=${seed}`;
    const loaded = new Promise((r) => f.addEventListener('load', r, { once: true }));
    document.body.append(f);
    await loaded;
    try {
      const mod = await f.contentWindow.eval(`import(${JSON.stringify(new URL(`carrier-check.mjs?${Date.now()}`, import.meta.url).href)})`);
      res[name] = await mod.run(name);
    } catch (e) {
      res[name] = { error: String(e?.stack ?? e) };
    }
    f.remove();
  }
  return res;
}
