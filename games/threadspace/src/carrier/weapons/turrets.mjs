// The turrets: trained and elevated, their ready racks and hoists, the firing cutout, the crews laying them, you in
// one, and its sight's markings. Part of `Weapons` (weapons.mjs).

import { THREE, clamp, DEG, _a, _b, _c, _d, _m, _r3, dirOf, turn, intercept, sled, bar } from './shared.mjs';

/** Mixed into `Weapons` (weapons.mjs). */
export const turretParts = {
  // --- the turrets ---------------------------------------------------------------------------------------------------

  muzzle(t, i, out) {
    return t.guns.localToWorld(out.set(i ? 1.7 : -1.7, 0, -21.3));
  },

  /** Is this turret's line of fire, as it points now, clear of the ship's own hull? */
  clear(t) {
    const G = this.W.gun;
    const p = this.muzzle(t, 0, _a).applyMatrix4(this.inv);
    const d = dirOf(t.train, t.elev, t.s, _b);
    for (let s = 1; s < G.fouled; s += 3) if (this.ship.inHull(_c.copy(p).addScaledVector(d, s))) return false;
    return true;
  },

  turretsFrame(dt, f, mode) {
    const G = this.W.gun, R = this.raider;
    const target = R && !R.gone && !R.dead && !R.target ? R : null; // a target sled is the trainee's: the crews hold fire
    for (const t of this.turrets) {
      // What the damage does: the barbette's health (and the power) sets how fast it turns, the magazine's whether
      // the hoist runs.
      const bb = this.ship.node(t.spec.barbette)?.health ?? 100;
      const mag = this.ship.node(t.spec.magazine)?.health ?? 100;
      // A hit on the turret itself (carrier-damage.mjs) puts it out of action until it is mended.
      t.rate = t.out ? 0 : clamp((bb - 15) / 45, 0, 1) * (this.ship.power ? 1 : 0.35);
      const hoistOk = bb >= 25 && mag >= 15 && !t.out;
      t.hoist = !hoistOk ? (t.out ? 'stopped: turret wrecked' : mag < 15 ? 'stopped: magazine wrecked' : 'stopped: barbette wrecked') : t.stock <= 0 ? 'magazine empty' : t.ready >= G.rack ? 'rack full' : 'running';
      if (hoistOk && t.stock > 0 && t.ready < G.rack && (t.hoistT += dt) >= G.hoist) (t.hoistT = 0), t.ready++, t.stock--;
      const you = this.manned === t && mode === 'gun';
      if (you) {
        // The sight goes where the mouse sends it; the guns follow at their own rate.
        const gain = 0.0022 * (this.fov() / 70);
        t.wantTrain -= f.dx * gain * t.s;
        t.wantElev = clamp(t.wantElev - f.dy * gain, G.elevation[0] * DEG, G.elevation[1] * DEG);
        if (f.keys.has('ArrowLeft')) t.wantTrain += dt * 0.4 * t.s;
        if (f.keys.has('ArrowRight')) t.wantTrain -= dt * 0.4 * t.s;
        if (f.keys.has('ArrowUp')) t.wantElev = Math.min(G.elevation[1] * DEG, t.wantElev + dt * 0.3);
        if (f.keys.has('ArrowDown')) t.wantElev = Math.max(G.elevation[0] * DEG, t.wantElev - dt * 0.3);
        t.wantTrain = Math.atan2(Math.sin(t.wantTrain), Math.cos(t.wantTrain));
      } else if (target) this.crewLay(t, target);
      else t.layed = false;
      // Slew toward the order.
      const dT = turn(t.train, t.wantTrain), dE = t.wantElev - t.elev;
      const mT = G.train * DEG * t.rate * dt, mE = G.elevate * DEG * t.rate * dt;
      t.train += clamp(dT, -mT, mT);
      t.elev += clamp(dE, -mE, mE);
      t.slewing = Math.abs(dT) > mT + 0.002 || Math.abs(dE) > mE + 0.002; // could not catch the order this frame
      t.house.rotation.y = t.train;
      t.guns.rotation.x = t.s * t.elev;
      // Recoil: the guns slam back in a twentieth of a second and the recuperator runs them out again over one, the
      // house rocking on its ring with the shock.
      const rt = (t.recoilT = (t.recoilT ?? 9) + dt);
      const run = rt < 0.05 ? rt / 0.05 : Math.exp(-(rt - 0.05) * 3.2) * (1 + (rt - 0.05) * 3.2);
      const back = _a.set(0, -t.s * Math.sin(t.elev), Math.cos(t.elev)).multiplyScalar(1.6 * run);
      t.house.rotation.z = rt < 1.5 ? 0.012 * Math.exp(-rt * 4) * Math.sin(rt * 38) : 0;
      t.guns.position.copy(t.home).add(back);
      t.cool[0] -= dt;
      t.cool[1] -= dt;
      t.house.updateMatrixWorld(true);
      const wantsFire = you ? f.trigger : t.layed;
      if (you || wantsFire) t.fouled = !this.clear(t);
      if (wantsFire && !t.out && !t.fouled && t.ready > 0 && t.cool[t.barrel] <= 0) this.shoot(t, you);
    }
  },

  /** The crew lays the guns on the raider: led for its motion, with the error of laying by hand. */
  crewLay(t, R) {
    const G = this.W.gun;
    const m = this.muzzle(t, 0, _a);
    const r = _b.subVectors(R.obj.position, m);
    const v = _c.copy(R.v); // the shell inherits the carrier's motion; the raider's past her is what counts
    const tt = intercept(r, v, G.shell);
    t.layed = false;
    t.bears = false;
    if (tt == null || r.length() > G.range) return;
    const aim = r.addScaledVector(v, tt).normalize().transformDirection(this.inv);
    const k = this.time * 0.6 + t.phase;
    const errT = G.crewSpread * (Math.sin(k) + 0.5 * Math.sin(k * 2.3)), errE = G.crewSpread * (Math.sin(k * 1.3 + 2) + 0.5 * Math.sin(k * 3.1));
    const train = Math.atan2(-aim.x, -aim.z) + errT;
    const elev = Math.asin(clamp(t.s * aim.y, -1, 1)) + errE;
    if (elev < G.elevation[0] * DEG || elev > G.elevation[1] * DEG) return;
    t.bears = true;
    t.wantTrain = train;
    t.wantElev = elev;
    t.layed = Math.abs(turn(t.train, train)) < 0.02 && Math.abs(t.elev - elev) < 0.02;
  },

  shoot(t, you) {
    const G = this.W.gun, r = this.rand;
    const i = t.barrel;
    const p = this.muzzle(t, i, new THREE.Vector3());
    const d = dirOf(t.train, t.elev, t.s, _b).transformDirection(this.C.frame.matrixWorld);
    d.x += (r() - 0.5) * 2 * G.spread;
    d.y += (r() - 0.5) * 2 * G.spread;
    d.z += (r() - 0.5) * 2 * G.spread;
    d.normalize();
    const dmg = G.damage[0] + r() * (G.damage[1] - G.damage[0]);
    const J = _r3.copy(d).multiplyScalar(-G.shell * (G.shellMass ?? 0)); // before `d` becomes the shell's velocity
    this.fire(p, d.multiplyScalar(G.shell).add(this.body.vel), true, G.range / G.shell, dmg).you = you;
    if (G.shellMass) this.recoil(p, J, 'cannon');
    this.blast(p, _r3.copy(d).normalize(), 1);
    t.cool[i] = you ? G.reload : G.crewReload;
    t.barrel = 1 - i;
    t.ready--;
    t.recoilT = 0;
    if (you) this.kick = 1;
    this.sfx?.play('boom', you ? 40 : this.ear ? this.ear.distanceTo(p) : 400, you ? 22 : 14);
  },

  // --- you in the turret ---------------------------------------------------------------------------------------------

  man(t) {
    this.manned = t;
    t.wantTrain = t.train;
    t.wantElev = t.elev;
    t.layed = false;
    this.zoom = 0;
  },

  leave() {
    const t = this.manned;
    this.manned = null;
    return t?.spec.from;
  },

  zoomStep(d = 1) {
    this.zoom = (this.zoom + d + 3) % 3;
  },

  fov() {
    return [62, 22, 9][this.zoom];
  },

  /** The gunner's sight: on the cab, looking where the sight is laid. */
  placeCamera(camera, dt) {
    const t = this.manned;
    if (!t) return;
    t.house.localToWorld(camera.position.set(3, t.s * 5.1, -3.4));
    const d = dirOf(t.wantTrain, t.wantElev, t.s, _a).transformDirection(this.C.frame.matrixWorld);
    const up = _b.set(0, t.s, 0).transformDirection(this.C.frame.matrixWorld);
    _m.lookAt(camera.position, _c.copy(camera.position).add(d), up);
    camera.quaternion.setFromRotationMatrix(_m);
    // Your gun firing: the sight jumps up and back with the cab, and settles.
    this.kick = Math.max(0, (this.kick ?? 0) - dt * 2.2);
    if (this.kick > 0.01) {
      const k = this.kick * this.kick;
      camera.rotateX(k * 0.03);
      camera.translateZ(k * 0.25);
      camera.rotateZ((Math.random() - 0.5) * k * 0.01);
    }
  },

  where() {
    const t = this.manned;
    if (!t) return '';
    const R = this.raider;
    const state = !R || R.gone ? 'no contacts' : R.dead ? 'target destroyed' : R.target ? `target sled · hits ${R.hits}` : 'raider in range';
    return `${t.name} · ${state}`;
  },

  // --- the sight's markings ------------------------------------------------------------------------------------------

  hud(mode, camera) {
    const cv = this.canvas, g = this.ctx;
    if (!cv || !g) return;
    const show = mode === 'gun' && this.manned;
    if (!show) {
      if (cv.dataset.on) (g.clearRect(0, 0, cv.width, cv.height), delete cv.dataset.on);
      return;
    }
    cv.dataset.on = '1';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) (cv.width = Math.round(w * dpr)), (cv.height = Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t = this.manned, G = this.W.gun, R = this.raider;
    const cx = w / 2, cy = h / 2;
    const green = '#7dffb0', amber = '#ffc24a', red = '#ff5a4a';
    const project = (p) => {
      const v = _d.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) return null;
      v.applyMatrix4(camera.projectionMatrix);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    g.lineWidth = 1.5;
    g.font = '12px ui-monospace, Menlo, monospace';
    // The sight: a cross with a gap, and range ticks.
    g.strokeStyle = 'rgba(180,255,210,0.85)';
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.moveTo(cx + dx * 10, cy + dy * 10), g.lineTo(cx + dx * 46, cy + dy * 46);
    for (let i = 1; i <= 3; i++) g.moveTo(cx - 5, cy + 10 + i * 9), g.lineTo(cx + 5, cy + 10 + i * 9);
    g.stroke();
    // Where the guns point: the circle, green when they are on the sight.
    const gp = project(this.muzzle(t, 0, _a).add(dirOf(t.train, t.elev, t.s, _b).transformDirection(this.C.frame.matrixWorld).multiplyScalar(3000)));
    const on = !t.slewing;
    if (gp) {
      g.strokeStyle = t.fouled ? red : on ? green : amber;
      g.beginPath();
      g.arc(gp.x, gp.y, 13, 0, Math.PI * 2);
      g.stroke();
    }
    // The raider: its bracket, range and bars, and the lead.
    if (R && !R.gone && !R.dead) {
      const K = R.K;
      const rp = project(R.obj.position);
      const range = R.obj.position.distanceTo(camera.position);
      if (rp) {
        g.strokeStyle = red;
        const b = 18;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(rp.x + sx * b, rp.y + sy * (b - 7)), g.lineTo(rp.x + sx * b, rp.y + sy * b), g.lineTo(rp.x + sx * (b - 7), rp.y + sy * b);
        g.stroke();
        g.fillStyle = red;
        g.fillText(`${R.label} ${range < 1000 ? Math.round(range) + ' m' : (range / 1000).toFixed(2) + ' km'}`, rp.x + b + 6, rp.y - 6);
        if (R.target) g.fillText(`HITS ${R.hits}`, rp.x + b + 6, rp.y + 10);
        else bar(g, rp.x + b + 6, rp.y + 4, 70, Math.max(0, R.hull) / K.hull, red, 'HULL');
      } else {
        // Off the sight: an arrow at the edge toward it.
        const v = _d.copy(R.obj.position).applyMatrix4(camera.matrixWorldInverse);
        const a = Math.atan2(-v.y, v.x);
        const ex = cx + Math.cos(a) * (Math.min(w, h) * 0.42), ey = cy + Math.sin(a) * (Math.min(w, h) * 0.42);
        g.fillStyle = red;
        g.beginPath();
        g.moveTo(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
        g.lineTo(ex + Math.cos(a + 2.5) * 10, ey + Math.sin(a + 2.5) * 10);
        g.lineTo(ex + Math.cos(a - 2.5) * 10, ey + Math.sin(a - 2.5) * 10);
        g.fill();
        g.fillText(`${R.label} ${(range / 1000).toFixed(2)} km`, ex - 40, ey + (Math.sin(a) > 0 ? -16 : 24));
      }
      // The lead: where to lay the sight for a shell to meet it.
      const m = this.muzzle(t, 0, new THREE.Vector3());
      const r = _b.subVectors(R.obj.position, m);
      const tt = intercept(r, R.v, G.shell);
      if (tt != null && r.length() < G.range * 1.2) {
        const lp = project(m.add(r.addScaledVector(R.v, tt)));
        if (lp) {
          g.strokeStyle = amber;
          g.beginPath();
          g.moveTo(lp.x, lp.y - 8), g.lineTo(lp.x + 8, lp.y), g.lineTo(lp.x, lp.y + 8), g.lineTo(lp.x - 8, lp.y), g.closePath();
          g.stroke();
        }
      }
    }
    // Torpedoes inbound: a small red diamond on each, with its range. A shell that passes close kills one.
    for (const tp of this.torps) {
      if (tp.dead || tp.side !== 'theirs') continue;
      const p = project(tp.pos);
      if (!p) continue;
      const d = tp.pos.distanceTo(camera.position);
      g.strokeStyle = red;
      g.beginPath();
      g.moveTo(p.x, p.y - 6), g.lineTo(p.x + 6, p.y), g.lineTo(p.x, p.y + 6), g.lineTo(p.x - 6, p.y), g.closePath();
      g.stroke();
      g.fillStyle = red;
      g.fillText(`TORP ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`, p.x + 9, p.y + 4);
    }
    // The gunner's panel.
    const deg = (a) => Math.round(((a / DEG) % 360 + 360) % 360);
    const lines = [
      [`${t.name.toUpperCase()}  ×${[1, 3, 7][this.zoom]}`, '#cfe8ff'],
      [`train ${String(deg(-t.train * t.s)).padStart(3, '0')}°  elev ${Math.round(t.elev / DEG)}°${t.rate < 1 ? (t.rate <= 0 ? '  JAMMED' : `  slow (${Math.round(t.rate * 100)}%)`) : ''}`, t.rate <= 0 ? red : t.rate < 1 ? amber : '#cfe8ff'],
      [`ready ${t.ready}/${G.rack}  magazine ${t.stock}  hoist ${t.hoist}`, t.hoist.startsWith('stopped') ? red : '#cfe8ff'],
      this.pdLine(red)
    ];
    if (this.plant) lines.push([`heat sinks ${Math.round(this.plant.heat * 100)}%${this.plant.hot ? '  FULL: point defence holding' : ''}`, this.plant.hot ? red : this.plant.heat > 0.8 ? amber : '#cfe8ff']);
    if (t.fouled) lines.push(['CUTOUT: line of fire crosses the ship', red]);
    else if (t.ready <= 0) lines.push(['NO ROUNDS READY', red]);
    g.font = '13px ui-monospace, Menlo, monospace';
    lines.forEach(([s, c], i) => {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(14, h - 132 + i * 20 - 14, g.measureText(s).width + 12, 19);
      g.fillStyle = c;
      g.fillText(s, 20, h - 132 + i * 20);
    });
  }
};
