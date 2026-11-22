// The turrets: trained and elevated, their ready racks and hoists, the firing cutout, the crews laying them, you in
// one, and its sight's markings. Part of `Weapons` (weapons.mjs).
//
// Fire control (../firecontrol.mjs, `this.fireControl`, made here on the first frame) says what the gunners are told:
// the weapons state and the designated target. You see both on the sight; a round you fire against them is rebuked
// and counted there. The crews obey it only once somebody has given it an order (`fireControl.ordered`): under its
// default logic they fire as they always have.
//
// You in a turret sit in its cab (../turret-cab.mjs, `this.cab`, made in `man`), at `t.eye` on the gunhouse roof;
// seats/gun.mjs moves you in and out. Unzoomed you see the cab round the vision blocks; zoomed (`fov()`) you are
// looking through the sight's optics, the cab hidden and the view masked to the eyepiece.

import { THREE, clamp, DEG, _a, _b, _c, _d, _m, _r3, dirOf, turn, intercept, sled, bar } from './shared.mjs';
import { FireControl, STATE_NAME, posOf } from '../firecontrol.mjs';
import { TurretCab } from '../turret-cab.mjs';

// The sight's own scratch (looks only: nothing the fight uses borrows these, and they borrow nothing of its).
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3(), _g4 = new THREE.Vector3();
const _gm1 = new THREE.Matrix4(), _gm2 = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler();
const STATE_COL = { hold: '#ff5a4a', tight: '#ffc24a', free: '#7dffb0' };
const km = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`);

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
    // The orders for the frame, and whether the crews are under them (only when somebody gave one: firecontrol.mjs).
    const fc = (this.fireControl ??= this.C.fireControl = new FireControl(this.C, this));
    fc.frame(dt);
    const crewsMay = fc.crewsMay(target);
    // Your cab: there while you are in the turret, seen unless you are looking through the sight's optics.
    if (this.cab) this.cab.show(mode === 'gun' && this.manned === this.cab.t, this.zoom === 0);
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
      } else if (target && !t.unmanned) this.crewLay(t, target); // `unmanned`: nobody on the gun (crew-orders.mjs)
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
      const wantsFire = you ? f.trigger && this.seated !== false : t.layed && crewsMay; // not while you climb in or out
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
    if (you) this.fireControl?.fired(p, d); // against orders? Counted, and "check fire" (firecontrol.mjs)
    const dmg = G.damage[0] + r() * (G.damage[1] - G.damage[0]);
    const J = _r3.copy(d).multiplyScalar(-G.shell * (G.shellMass ?? 0)); // before `d` becomes the shell's velocity
    this.fire(p, d.multiplyScalar(G.shell).add(this.body.vel), true, G.range / G.shell, dmg).you = you;
    if (G.shellMass) this.recoil(p, J, 'cannon');
    this.blast(p, _r3.copy(d).normalize(), Math.cbrt(Math.abs(t.guns.matrixWorld.determinant())) || 1); // by the mount's scale: a small ship's turret is a smaller gun
    t.cool[i] = you ? G.reload : G.crewReload;
    t.barrel = 1 - i;
    t.ready--;
    t.recoilT = 0;
    if (you) this.kick = 1;
    this.sfx?.play('boom', you ? 40 : this.ear ? this.ear.distanceTo(p) : 400, you ? 22 : 14);
  },

  // --- you in the turret ---------------------------------------------------------------------------------------------

  man(t) {
    if (this.cab && this.cab.t !== t) this.cab.show(false);
    this.manned = t;
    t.wantTrain = t.train;
    t.wantElev = t.elev;
    t.layed = false;
    this.zoom = 0;
    this.cab = t.cab ??= new TurretCab(t, this.scene); // its cab, built the first time anyone sits in it
    this.seated = true; // seats/gun.mjs: false while you climb in or out (no firing, no sight)
    this.hudK = 1;
  },

  leave() {
    const t = this.manned;
    this.manned = null;
    this.cab?.show(false);
    return t?.spec.from;
  },

  zoomStep(d = 1) {
    this.zoom = (this.zoom + d + 3) % 3;
  },

  fov() {
    return [62, 22, 9][this.zoom];
  },

  /** The gunner's sight: in the cab (`t.eye`, turret-cab.mjs), looking where the sight is laid. `seatP` and `seatQ`
   *  are that pose before the kick of your own gun (the cab's yoke sits there; the way in ends there). */
  placeCamera(camera, dt) {
    const t = this.manned;
    if (!t) return;
    t.house.localToWorld(t.eye ? camera.position.copy(t.eye) : camera.position.set(3, t.s * 5.1, -3.4));
    const d = dirOf(t.wantTrain, t.wantElev, t.s, _a).transformDirection(this.C.frame.matrixWorld);
    const up = _b.set(0, t.s, 0).transformDirection(this.C.frame.matrixWorld);
    _m.lookAt(camera.position, _c.copy(camera.position).add(d), up);
    camera.quaternion.setFromRotationMatrix(_m);
    (this.seatP ??= new THREE.Vector3()).copy(camera.position);
    (this.seatQ ??= new THREE.Quaternion()).copy(camera.quaternion);
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


  // --- what the gunner is told, and where the guns cannot fire --------------------------------------------------------

  /** Is the line of fire clear of the ship's own hull with the turret trained `train` and elevated `elev`? As
   *  `clear(t)`, for a bearing the guns are not on (the sight's train dial). */
  clearAt(t, train, elev) {
    const G = this.W.gun;
    _gm1.compose(t.house.position, _gq.setFromEuler(_ge.set(0, train, 0)), t.house.scale);
    _gm2.compose(t.home, _gq.setFromEuler(_ge.set(t.s * elev, 0, 0)), t.guns.scale);
    const p = _g1.set(-1.7, 0, -21.3).applyMatrix4(_gm2).applyMatrix4(_gm1).applyMatrix4(t.house.parent.matrixWorld).applyMatrix4(this.inv);
    const d = dirOf(train, elev, t.s, _g2);
    for (let s = 1; s < G.fouled; s += 3) if (this.ship.inHull(_g3.copy(p).addScaledVector(d, s))) return false;
    return true;
  },

  /** The firing cutout all round at the guns' elevation: `t.arcs.blocked[i]` for a train of i × 5 degrees, worked out a
   *  few bearings a frame and again when the elevation has moved 4 degrees. */
  arcsStep(t) {
    const A = (t.arcs ??= { el: null, i: 0, blocked: new Uint8Array(72), done: false });
    const el = Math.round(t.elev / (4 * DEG)) * 4 * DEG;
    if (A.el !== el) (A.el = el), (A.i = 0), (A.done = false);
    if (A.done) return A;
    for (let n = 0; n < 6 && A.i < 72; n++, A.i++) A.blocked[A.i] = this.clearAt(t, A.i * 5 * DEG, el) ? 0 : 1;
    A.done = A.i >= 72;
    return A;
  },

  /** What fire control has told you, with the designated target's range, closing speed and bearing from turret `t`
   *  (`this.gunner`: the sight and the cab's repeater both read it). */
  gunnerInfo(t) {
    const fc = this.fireControl, D = fc?.designated, p = posOf(D?.ref);
    const I = (this.gunner ??= { closing: 0 });
    const dt = this.time - (I.at ?? this.time);
    I.at = this.time;
    I.state = fc?.state ?? 'free';
    I.stateName = STATE_NAME[I.state];
    I.by = fc?.by ?? 'auto';
    I.target = D?.label ?? null;
    I.kind = D?.kind ?? null;
    if (!p) return (I.ref = null), (I.range = null), (I.closing = 0), I;
    const m = t.house.getWorldPosition(_g1);
    const r = p.distanceTo(m);
    if (I.ref === D.ref && dt > 0) I.closing += ((I.range - r) / dt - I.closing) * Math.min(1, dt * 4);
    else if (I.ref !== D.ref) I.closing = 0;
    I.ref = D.ref;
    I.range = r;
    I.rangeText = km(r);
    const d = _g2.subVectors(p, m).transformDirection(this.inv); // in the ship's frame
    I.bearing = Math.round(((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360) % 360; // clockwise from the bow, seen from above
    I.elevation = Math.round(Math.asin(clamp(t.s * d.y, -1, 1)) / DEG); // off the turret's own deck
    return I;
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
    const t = this.manned, G = this.W.gun, R = this.raider, fc = this.fireControl;
    const I = this.gunnerInfo(t);
    const A = this.arcsStep(t);
    const K = this.hudK ?? 1; // seats/gun.mjs: 0 until you reach the sight
    if (K <= 0) return;
    g.globalAlpha = K;
    const cx = w / 2, cy = h / 2;
    const green = '#7dffb0', amber = '#ffc24a', red = '#ff5a4a', pale = '#cfe8ff', mark = '#ffe66b';
    const MONO = 'ui-monospace, Menlo, monospace';
    const project = (p) => {
      const v = _d.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) return null;
      v.applyMatrix4(camera.projectionMatrix);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    /** Text on a dark plate; `align` 'left' (x is its left edge) or 'center'. */
    const plate = (s, x, y, color, { size = 13, bold = false, align = 'left', pad = 6, fill = 'rgba(0,0,0,0.55)' } = {}) => {
      g.font = `${bold ? 'bold ' : ''}${size}px ${MONO}`;
      const tw = g.measureText(s).width, x0 = align === 'center' ? x - tw / 2 : x;
      g.fillStyle = fill;
      g.fillRect(x0 - pad, y - size - 1, tw + pad * 2, size + 7);
      g.fillStyle = color;
      g.fillText(s, x0, y);
      return tw;
    };
    // Through the sight's optics: the eyepiece's field, and nothing of the cab.
    if (this.zoom > 0) {
      const r = Math.min(w, h) * 0.47;
      g.fillStyle = 'rgba(0,0,0,0.9)';
      g.beginPath();
      g.rect(0, 0, w, h);
      g.arc(cx, cy, r, 0, Math.PI * 2, true);
      g.fill('evenodd');
      g.strokeStyle = 'rgba(160,230,190,0.5)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(cx, cy, r - 3, 0, Math.PI * 2);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2, r0 = r - (i % 9 ? 10 : 18);
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0), g.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      }
      g.stroke();
    }
    g.lineWidth = 1.5;
    g.font = `12px ${MONO}`;
    // The sight: a cross with a gap, and range ticks.
    g.strokeStyle = 'rgba(180,255,210,0.85)';
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.moveTo(cx + dx * 10, cy + dy * 10), g.lineTo(cx + dx * 46, cy + dy * 46);
    for (let i = 1; i <= 3; i++) g.moveTo(cx - 5, cy + 10 + i * 9), g.lineTo(cx + 5, cy + 10 + i * 9);
    g.stroke();
    // Where the guns point: the circle, green when they are on the sight, red and crossed when the cutout has them.
    const gp = project(this.muzzle(t, 0, _a).add(dirOf(t.train, t.elev, t.s, _b).transformDirection(this.C.frame.matrixWorld).multiplyScalar(3000)));
    const on = !t.slewing;
    if (gp) {
      g.strokeStyle = t.fouled ? red : on ? green : amber;
      g.beginPath();
      g.arc(gp.x, gp.y, 13, 0, Math.PI * 2);
      if (t.fouled) g.moveTo(gp.x - 9, gp.y - 9), g.lineTo(gp.x + 9, gp.y + 9), g.moveTo(gp.x + 9, gp.y - 9), g.lineTo(gp.x - 9, gp.y + 9);
      g.stroke();
    }
    /** The designated target's box: bigger than a contact's bracket, whole, and labelled. */
    const designate = (p, more = '') => {
      const b = 27;
      g.strokeStyle = mark;
      g.lineWidth = 2;
      g.strokeRect(p.x - b, p.y - b, b * 2, b * 2);
      g.lineWidth = 1.5;
      g.font = `bold 11px ${MONO}`;
      const s = `DESIGNATED${more}`, tw = g.measureText(s).width;
      g.fillStyle = mark;
      g.fillRect(p.x - b - 1, p.y - b - 16, tw + 10, 15);
      g.fillStyle = '#141000';
      g.fillText(s, p.x - b + 4, p.y - b - 5);
      g.font = `12px ${MONO}`;
    };
    /** An arrow at the edge of the sight toward something off it. */
    const edge = (pos, color, label) => {
      const v = _d.copy(pos).applyMatrix4(camera.matrixWorldInverse);
      const a = Math.atan2(-v.y, v.x), rr = Math.min(w, h) * 0.4;
      const ex = cx + Math.cos(a) * rr, ey = cy + Math.sin(a) * rr;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
      g.lineTo(ex + Math.cos(a + 2.5) * 10, ey + Math.sin(a + 2.5) * 10);
      g.lineTo(ex + Math.cos(a - 2.5) * 10, ey + Math.sin(a - 2.5) * 10);
      g.fill();
      g.fillText(label, ex - 40, ey + (Math.sin(a) > 0 ? -16 : 24));
    };
    const desRef = fc?.designated?.ref ?? null;
    // The raider: its bracket, range and bars, and the lead.
    if (R && !R.gone && !R.dead) {
      const KR = R.K;
      const rp = project(R.obj.position);
      const range = R.obj.position.distanceTo(camera.position);
      if (rp) {
        g.strokeStyle = red;
        const b = 18;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(rp.x + sx * b, rp.y + sy * (b - 7)), g.lineTo(rp.x + sx * b, rp.y + sy * b), g.lineTo(rp.x + sx * (b - 7), rp.y + sy * b);
        g.stroke();
        const lx = rp.x + (desRef === R ? 27 : b) + 6;
        g.fillStyle = red;
        g.fillText(`${R.label} ${km(range)}`, lx, rp.y - 6);
        if (R.target) g.fillText(`HITS ${R.hits}`, lx, rp.y + 10);
        else bar(g, lx, rp.y + 4, 70, Math.max(0, R.hull) / KR.hull, red, 'HULL');
        if (desRef === R) designate(rp);
      } else edge(R.obj.position, desRef === R ? mark : red, `${desRef === R ? 'DESIGNATED ' : ''}${R.label} ${km(range)}`);
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
    // Its escorts: a small red triangle on each.
    for (const B of this.bandits) {
      if (B.gone || B.dead) continue;
      const p = project(B.obj.position);
      const d = B.obj.position.distanceTo(camera.position);
      if (!p) {
        if (desRef === B) edge(B.obj.position, mark, `DESIGNATED BANDIT ${km(d)}`);
        continue;
      }
      g.strokeStyle = red;
      g.beginPath();
      g.moveTo(p.x, p.y - 8), g.lineTo(p.x + 7, p.y + 6), g.lineTo(p.x - 7, p.y + 6), g.closePath();
      g.stroke();
      g.fillStyle = red;
      g.fillText(`BANDIT ${km(d)}`, p.x + (desRef === B ? 33 : 11), p.y + 4);
      if (desRef === B) designate(p);
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
      g.fillText(`TORP ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}`, p.x + (desRef === tp ? 33 : 9), p.y + 4);
      if (desRef === tp) designate(p);
    }
    // Anything else somebody designated (a mission's contact).
    if (desRef && desRef !== R && !this.bandits.includes(desRef) && !this.torps.includes(desRef)) {
      const pos = posOf(desRef), p = pos && project(pos);
      if (p) designate(p, ` ${I.target ?? ''}`);
      else if (pos) edge(pos, mark, `DESIGNATED ${I.target ?? ''}`);
    }

    // --- the orders: the weapons state, big, and the designated target under it ---
    const sc = STATE_COL[I.state];
    const since = this.time - (fc?.changedT ?? -99);
    const blink = since < 3 && Math.floor(since * 5) % 2 === 1; // a new state flashes
    g.font = `bold 20px ${MONO}`;
    const bw = Math.max(210, g.measureText(I.stateName).width + 36), by = 52;
    g.fillStyle = blink ? 'rgba(0,0,0,0.7)' : sc;
    g.fillRect(cx - bw / 2, by, bw, 32);
    g.strokeStyle = sc;
    g.lineWidth = 2;
    g.strokeRect(cx - bw / 2, by, bw, 32);
    g.lineWidth = 1.5;
    g.fillStyle = blink ? sc : '#081008';
    g.textAlign = 'center';
    g.fillText(I.stateName, cx, by + 23);
    g.textAlign = 'left';
    const order = I.state === 'hold' ? 'DO NOT FIRE' : I.state === 'tight' ? 'DESIGNATED TARGET ONLY' : 'ENGAGE AT WILL';
    plate(order, cx, by + 50, sc, { size: 11, align: 'center' });
    if (I.target) plate(`DESIGNATED  ${I.target}  ${I.rangeText}  closing ${I.closing >= 0 ? '+' : '-'}${Math.abs(Math.round(I.closing))} m/s  brg ${String(I.bearing).padStart(3, '0')}°  el ${I.elevation >= 0 ? '+' : ''}${I.elevation}°`, cx, by + 70, mark, { size: 12, align: 'center' });
    else plate('NO TARGET DESIGNATED', cx, by + 70, '#8a98a4', { size: 12, align: 'center' });
    const rb = fc?.rebuke;
    if (rb && this.time - rb.t < 3.5 && Math.floor((this.time - rb.t) * 4) % 2 === 0) {
      plate(`CHECK FIRE · CHECK FIRE   ${rb.why === 'hold' ? 'WEAPONS HOLD' : 'NOT THE DESIGNATED TARGET'}`, cx, by + 94, '#fff', { size: 14, bold: true, align: 'center', fill: 'rgba(200,30,20,0.85)' });
    }

    // --- under the sight: what stops the guns ---
    const warn = t.out ? 'TURRET OUT OF ACTION' : t.rate <= 0 ? 'TURRET JAMMED' : t.fouled ? 'CUTOUT · BLOCKED BY OWN SHIP' : t.ready <= 0 ? 'NO ROUNDS READY' : null;
    if (warn) plate(warn, cx, cy + 92, '#fff', { size: 15, bold: true, align: 'center', pad: 10, fill: 'rgba(200,30,20,0.8)' });
    else if (t.slewing) plate('TRAINING', cx, cy + 88, amber, { size: 11, align: 'center' });
    const eLo = G.elevation[0] * DEG, eHi = G.elevation[1] * DEG;
    if (t.wantElev <= eLo + 1e-4 || t.wantElev >= eHi - 1e-4) plate(`ELEVATION LIMIT ${t.wantElev > 0 ? G.elevation[1] : G.elevation[0]}°`, cx, cy + (warn ? 116 : 108), amber, { size: 11, align: 'center' });

    // --- the gunner's panel: the mount, its ammunition, its damage ---
    const deg = (a) => Math.round(((a / DEG) % 360 + 360) % 360) % 360;
    const bb = Math.round(this.ship.node(t.spec.barbette)?.health ?? 100), mag = Math.round(this.ship.node(t.spec.magazine)?.health ?? 100);
    const breech = (i) => (t.cool[i] > 0 ? `load ${t.cool[i].toFixed(1)}s` : 'READY');
    const lines = [
      [`${t.name.toUpperCase()}  ×${[1, 3, 7][this.zoom]}`, pale],
      [`train ${String(deg(-t.train * t.s)).padStart(3, '0')}°  elev ${Math.round(t.elev / DEG)}°${t.rate < 1 ? (t.rate <= 0 ? '  JAMMED' : `  slow (${Math.round(t.rate * 100)}%)`) : ''}`, t.rate <= 0 ? red : t.rate < 1 ? amber : pale],
      [`ready ${t.ready}/${G.rack}  magazine ${t.stock}  hoist ${t.hoist}`, t.hoist.startsWith('stopped') ? red : pale],
      [`breech  ${breech(0)} · ${breech(1)}`, t.ready <= 0 ? red : t.cool[t.barrel] > 0 ? amber : green],
      [`mount ${t.out ? 'OUT OF ACTION' : 'in action'}  barbette ${bb}%  magazine ${mag}%`, t.out || bb < 25 || mag < 15 ? red : bb < 60 || mag < 60 ? amber : pale],
      this.pdLine(red)
    ];
    if (this.plant) lines.push([`heat sinks ${Math.round(this.plant.heat * 100)}%${this.plant.hot ? '  FULL: point defence holding' : ''}`, this.plant.hot ? red : this.plant.heat > 0.8 ? amber : pale]);
    if (fc?.violations) lines.push([`fired against orders: ${fc.violations} (${fc.roundsOff} rounds)`, red]);
    g.font = `13px ${MONO}`;
    lines.forEach(([s, c], i) => {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(14, 62 + i * 20, g.measureText(s).width + 12, 19);
      g.fillStyle = c;
      g.fillText(s, 20, 76 + i * 20);
    });

    // --- the train dial and the elevation scale: where the guns are, where the sight is, where they cannot fire ---
    const dx = w - 70, dy = 118, dr = 42;
    const flip = t.s; // a ventral gunner hangs under her: the dial turns the way his view does
    const ang = (train) => -train * flip - Math.PI / 2; // canvas angle of a train (0 the bow, up the dial)
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.arc(dx, dy, dr + 12, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(180,255,210,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(dx, dy, dr, 0, Math.PI * 2);
    g.stroke();
    // The ship from above, bow up.
    g.fillStyle = 'rgba(180,255,210,0.35)';
    g.beginPath();
    g.moveTo(dx, dy - 20), g.lineTo(dx + 5, dy - 8), g.lineTo(dx + 5, dy + 18), g.lineTo(dx - 5, dy + 18), g.lineTo(dx - 5, dy - 8), g.closePath();
    g.fill();
    // The cutout: red where the line of fire crosses her at this elevation.
    g.strokeStyle = red;
    g.lineWidth = 5;
    for (let i = 0; i < 72; i++) {
      if (!A.blocked[i]) continue;
      const a0 = ang((i - 0.5) * 5 * DEG), a1 = ang((i + 0.5) * 5 * DEG);
      g.beginPath();
      g.arc(dx, dy, dr + 5, Math.min(a0, a1), Math.max(a0, a1));
      g.stroke();
    }
    g.lineWidth = 1;
    const ray = (train, r0, r1, color, wd) => {
      const a = ang(train);
      g.strokeStyle = color;
      g.lineWidth = wd;
      g.beginPath();
      g.moveTo(dx + Math.cos(a) * r0, dy + Math.sin(a) * r0), g.lineTo(dx + Math.cos(a) * r1, dy + Math.sin(a) * r1);
      g.stroke();
    };
    ray(t.wantTrain, 8, dr, 'rgba(207,232,255,0.8)', 1); // the sight
    ray(t.train, 0, dr, t.fouled ? red : on ? green : amber, 3); // the guns
    if (I.range != null) {
      // The designated target's bearing: a mark on the rim.
      const a = (I.bearing * DEG) * flip - Math.PI / 2;
      g.fillStyle = mark;
      g.beginPath();
      g.arc(dx + Math.cos(a) * dr, dy + Math.sin(a) * dr, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.font = `10px ${MONO}`;
    g.fillStyle = pale;
    g.textAlign = 'center';
    g.fillText('BOW', dx, dy - dr - 16);
    g.fillText(flip > 0 ? 'S' : 'P', dx + dr + 20, dy + 3);
    g.fillText(flip > 0 ? 'P' : 'S', dx - dr - 20, dy + 3);
    g.fillStyle = t.fouled ? red : pale;
    g.fillText(t.fouled ? 'TRAIN · CUTOUT' : 'TRAIN', dx, dy + dr + 26);
    g.textAlign = 'left';
    // Elevation: the scale between its stops, the guns' mark and the sight's.
    const ex = w - 26, ey0 = dy + dr + 44, eh = 110;
    const ye = (e) => ey0 + eh - ((e - eLo) / (eHi - eLo)) * eh;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(ex - 62, ey0 - 12, 80, eh + 24);
    g.strokeStyle = 'rgba(180,255,210,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ex, ey0), g.lineTo(ex, ey0 + eh);
    for (let e = 0; e <= G.elevation[1]; e += 20) g.moveTo(ex - 5, ye(e * DEG)), g.lineTo(ex, ye(e * DEG));
    g.moveTo(ex - 9, ey0), g.lineTo(ex + 4, ey0), g.moveTo(ex - 9, ey0 + eh), g.lineTo(ex + 4, ey0 + eh); // the stops
    g.stroke();
    g.fillStyle = pale;
    g.fillText(`${G.elevation[1]}°`, ex - 34, ey0 + 4);
    g.fillText(`${G.elevation[0]}°`, ex - 34, ey0 + eh + 4);
    g.fillText('ELEV', ex - 58, ye((eLo + eHi) / 2) + 3);
    g.fillStyle = t.fouled ? red : on ? green : amber;
    g.beginPath(); // the guns
    g.moveTo(ex - 2, ye(t.elev)), g.lineTo(ex - 12, ye(t.elev) - 5), g.lineTo(ex - 12, ye(t.elev) + 5), g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(207,232,255,0.9)';
    g.beginPath(); // the sight
    g.moveTo(ex + 2, ye(t.wantElev)), g.lineTo(ex + 10, ye(t.wantElev) - 4), g.lineTo(ex + 10, ye(t.wantElev) + 4), g.closePath();
    g.stroke();
    g.lineWidth = 1.5;
    g.font = `12px ${MONO}`;
    g.globalAlpha = 1;
  }
};
