// The helm's sight: what the helmsman sees drawn over the view from the bridge (or from behind her). Three things, all
// worked out from the physics, none of it a cheat:
//
// - The railgun. It lies along the keel and fires where the ship points, so the sight is a ring dead ahead (the
//   boresight) and a diamond where the raider will be when a slug gets there (weapons.mjs `railAim`). Turn the whole
//   ship until the ring sits on the diamond, and click. The bar under it is the capacitors charging.
// - The nav plot (N). A waypoint 15 km off, off the bow, at rest. Getting there is the oldest problem in space
//   travel: burn toward it, then turn her round and burn the other way to stop. The plot shows the range, how fast you
//   are closing, and how far it would take to stop: the turn first (a 400 m ship takes the best part of a minute to
//   turn end for end, and coasts on all that time), then the burn at full drive. When that reaches the range, it calls
//   FLIP AND BURN.
//   The circle is where you are going (prograde), the crossed circle where you have come from (retrograde): to stop,
//   put the nose on the crossed circle and burn.
// - The plant: the heat in the sinks, the radiators, the reaction mass left (as Δv), and torpedoes in flight.
//
// It draws on its own canvas (`#c-hhud`) and changes nothing; `toggleNav()` and `say()` are its only verbs.

import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const GREEN = '#7dffb0', AMBER = '#ffc24a', RED = '#ff5a4a', BLUE = '#8fc4ff', TEXT = '#cfe8ff';
const km = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(d < 10000 ? 2 : 1)} km`);

export class HelmSight {
  constructor(C, { body, helm, thrusters, rcs, guns, plant, ship, dc }) {
    Object.assign(this, { C, body, helm, thrusters, rcs, guns, plant, ship, dc });
    this.canvas = document.getElementById('c-hhud');
    this.g = this.canvas?.getContext('2d');
    this.nav = null; // { at: world point, name, t }
    this.msg = null;
    this.arrivals = 0;
    this.onArrive = null; // the career's hook
    this.aim = {};
  }

  /** N at the helm: lay a waypoint (15 km out, 40° off the bow, at rest), or clear it. */
  toggleNav(dist = 15000, off = 40) {
    if (this.nav) {
      this.nav = null;
      return this.say('Nav plot cleared.');
    }
    const q = this.C.obj.quaternion;
    const side = Math.random() < 0.5 ? -1 : 1;
    const dir = _a.set(Math.sin((side * off * Math.PI) / 180), 0.15, -Math.cos((off * Math.PI) / 180)).normalize().applyQuaternion(q);
    const names = ['TANGO', 'SIERRA', 'ROMEO', 'KILO', 'VICTOR'];
    this.nav = { at: this.C.obj.position.clone().addScaledVector(dir, dist), name: names[this.arrivals % names.length], t: 0, flipCalled: false };
    this.say(`Waypoint ${this.nav.name} laid in: ${km(dist)}. Burn, flip, and burn to stop on it.`);
    this.dc?.say(`Navigator. Waypoint ${this.nav.name} laid in.`, null, 0);
  }

  say(text, secs = 4) {
    this.msg = { text, t: secs };
    return text;
  }

  /** How long she takes to turn through `angle` (radians), flat out on her manoeuvring thrusters and stopping the turn
   *  at the end (half the way speeding the turn up, half slowing it down), with a little slack for a human hand. */
  turnTime(angle) {
    const a = Math.max(1e-5, Math.min(this.rcs?.capOf(3, 1) ?? 0.004, this.rcs?.capOf(4, 1) ?? 0.004));
    return 1.25 * 2 * Math.sqrt(Math.max(0, angle) / a);
  }

  /** The most she can push toward her bow now, m/s² (the main drive as it is: hurt, hot or dry). */
  mainAcc() {
    let a = 0;
    for (const t of this.thrusters) if (t.kind === 'main') a += t.force * (t.health ?? 1);
    return a / this.body.mass;
  }

  frame(dt, mode, camera) {
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;
    this.navFrame(dt);
    const cv = this.canvas, g = this.g;
    if (!cv || !g) return;
    if (mode !== 'helm') {
      if (cv.dataset.on) (g.clearRect(0, 0, cv.width, cv.height), delete cv.dataset.on);
      return;
    }
    cv.dataset.on = '1';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) (cv.width = Math.round(w * dpr)), (cv.height = Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.lineWidth = 1.5;
    g.font = '12px ui-monospace, Menlo, monospace';
    g.textAlign = 'left';
    const project = (p) => {
      const v = _c.copy(p).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -1) return null;
      v.applyMatrix4(camera.projectionMatrix);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    };
    const q = this.C.obj.quaternion, pos = this.C.obj.position;
    // The railgun's boresight: a point 20 km down the keel's line.
    const bore = project(_a.set(0, 0, -20000).applyQuaternion(q).add(pos));
    const R = this.guns.railAim(this.aim);
    if (bore) {
      g.strokeStyle = R.ready ? GREEN : AMBER;
      g.beginPath();
      g.arc(bore.x, bore.y, 16, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.moveTo(bore.x + dx * 22, bore.y + dy * 22), g.lineTo(bore.x + dx * 30, bore.y + dy * 30);
      g.stroke();
      // The capacitors.
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(bore.x - 30, bore.y + 36, 60, 5);
      g.fillStyle = R.ready ? GREEN : AMBER;
      g.fillRect(bore.x - 30, bore.y + 36, 60 * R.charge, 5);
      g.textAlign = 'center';
      g.fillText(R.stock <= 0 ? 'NO SLUGS' : R.ready ? `RAILGUN READY · ${R.stock}` : this.plant?.hot ? 'RAILGUN: HEAT' : !this.ship.power ? 'RAILGUN: NO POWER' : `CHARGING · ${R.stock}`, bore.x, bore.y + 54);
      g.textAlign = 'left';
    }
    // The raider, and where to point her.
    if (R.target) {
      const p = project(R.target);
      if (p) {
        g.strokeStyle = RED;
        const b = 16;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(p.x + sx * b, p.y + sy * (b - 6)), g.lineTo(p.x + sx * b, p.y + sy * b), g.lineTo(p.x + sx * (b - 6), p.y + sy * b);
        g.stroke();
        g.fillStyle = RED;
        const label = `${R.label} ${km(R.range)}${R.hull != null ? ` · hull ${Math.round(R.hull * 100)}%` : ''}`;
        const lw = g.measureText(label).width;
        g.fillText(label, Math.max(8, Math.min(w - lw - 8, p.x + b + 6)), Math.max(16, Math.min(h - 8, p.y - 4)));
      }
      const l = R.lead && project(R.lead);
      if (l) {
        g.strokeStyle = AMBER;
        g.beginPath();
        g.moveTo(l.x, l.y - 9), g.lineTo(l.x + 9, l.y), g.lineTo(l.x, l.y + 9), g.lineTo(l.x - 9, l.y), g.closePath();
        g.stroke();
        if (bore && Math.hypot(l.x - bore.x, l.y - bore.y) < 14) {
          g.fillStyle = GREEN;
          g.textAlign = 'center';
          g.fillText('ON', bore.x, bore.y - 22);
          g.textAlign = 'left';
        }
      }
    }
    // Torpedoes in flight: theirs red, ours blue.
    for (const t of this.guns.torps) {
      if (t.dead) continue;
      const p = project(t.pos);
      if (!p) continue;
      g.strokeStyle = g.fillStyle = t.side === 'theirs' ? RED : BLUE;
      g.beginPath();
      g.moveTo(p.x, p.y - 5), g.lineTo(p.x + 5, p.y), g.lineTo(p.x, p.y + 5), g.lineTo(p.x - 5, p.y), g.closePath();
      g.stroke();
    }
    // Prograde and retrograde, against rest.
    const v = _b.copy(this.body.vel).sub(this.helm.ref);
    const speed = v.length();
    if (speed > 1) {
      const pro = project(_a.copy(v).normalize().multiplyScalar(30000).add(pos));
      if (pro) {
        g.strokeStyle = GREEN;
        g.beginPath();
        g.arc(pro.x, pro.y, 8, 0, Math.PI * 2);
        g.moveTo(pro.x + 8, pro.y), g.lineTo(pro.x + 16, pro.y);
        g.moveTo(pro.x - 8, pro.y), g.lineTo(pro.x - 16, pro.y);
        g.moveTo(pro.x, pro.y - 8), g.lineTo(pro.x, pro.y - 14);
        g.stroke();
      }
      const retro = project(_a.copy(v).normalize().multiplyScalar(-30000).add(pos));
      if (retro) {
        g.strokeStyle = AMBER;
        g.beginPath();
        g.arc(retro.x, retro.y, 8, 0, Math.PI * 2);
        g.moveTo(retro.x - 5.6, retro.y - 5.6), g.lineTo(retro.x + 5.6, retro.y + 5.6);
        g.moveTo(retro.x + 5.6, retro.y - 5.6), g.lineTo(retro.x - 5.6, retro.y + 5.6);
        g.stroke();
      }
    }
    // The nav plot.
    const N = this.nav;
    let panel = [];
    if (N) {
      const p = project(N.at);
      if (p) {
        g.strokeStyle = g.fillStyle = BLUE;
        g.beginPath();
        g.moveTo(p.x, p.y - 12), g.lineTo(p.x + 12, p.y), g.lineTo(p.x, p.y + 12), g.lineTo(p.x - 12, p.y), g.closePath();
        g.moveTo(p.x, p.y - 4), g.lineTo(p.x, p.y + 4);
        g.stroke();
        g.fillText(`${N.name} ${km(N.range)}`, p.x + 16, p.y + 4);
      } else {
        // Behind or off the view: an arrow at the edge.
        const vv = _a.copy(N.at).applyMatrix4(camera.matrixWorldInverse);
        const ang = Math.atan2(-vv.y, vv.x);
        const ex = w / 2 + Math.cos(ang) * Math.min(w, h) * 0.42, ey = h / 2 + Math.sin(ang) * Math.min(w, h) * 0.42;
        g.fillStyle = BLUE;
        g.beginPath();
        g.moveTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14);
        g.lineTo(ex + Math.cos(ang + 2.5) * 10, ey + Math.sin(ang + 2.5) * 10);
        g.lineTo(ex + Math.cos(ang - 2.5) * 10, ey + Math.sin(ang - 2.5) * 10);
        g.fill();
        g.fillText(`${N.name} ${km(N.range)}`, ex - 40, ey + (Math.sin(ang) > 0 ? -16 : 24));
      }
      const t = N.closing > 0.5 ? N.range / N.closing : null;
      panel = [
        [`NAV ${N.name}  ${km(N.range)}  closing ${N.closing.toFixed(0)} m/s`, BLUE],
        [`to stop: ${N.turn > 3 ? `turn ${Math.round(N.turn)} s, then ` : ''}burn, ${km(N.stop)} in all${t ? `  ·  there in ${Math.round(t)} s at this speed` : ''}`, N.call === 'flip' ? AMBER : TEXT]
      ];
      if (N.call === 'flip' && Math.floor(performance.now() / 400) % 2 === 0) {
        g.font = '600 15px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.fillStyle = AMBER;
        g.fillText('FLIP AND BURN: nose onto ⊗, then hold W', w / 2, h * 0.24);
        g.textAlign = 'left';
        g.font = '12px ui-monospace, Menlo, monospace';
      } else if (N.call === 'brake') {
        g.font = '600 14px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.fillStyle = GREEN;
        g.fillText('BRAKING: keep the drive burning', w / 2, h * 0.24);
        g.textAlign = 'left';
        g.font = '12px ui-monospace, Menlo, monospace';
      } else if (N.call === 'over') {
        g.font = '600 14px ui-monospace, Menlo, monospace';
        g.textAlign = 'center';
        g.fillStyle = RED;
        g.fillText('OVERSHOOTING: you cannot stop in time', w / 2, h * 0.24);
        g.textAlign = 'left';
        g.font = '12px ui-monospace, Menlo, monospace';
      }
    }
    // The plant, and the panel.
    const P = this.plant;
    if (P) {
      const rad = P.radiators.reduce((s, r) => s + r.k, 0) / Math.max(1, P.radiators.length);
      panel.push([`heat ${Math.round(P.heat * 100)}%${P.hot ? '  FULL' : ''}  ·  radiators ${rad > 0.95 ? 'spread' : rad < 0.05 ? 'folded' : 'moving'} (G)`, P.hot ? RED : P.heat > 0.8 ? AMBER : TEXT]);
      panel.push([`reaction mass ${Math.round((P.prop / P.prop0) * 100)}%  ·  Δv ${(P.dv() / 1000).toFixed(1)} km/s${P.leaking ? '  LEAKING' : ''}`, P.leaking ? RED : TEXT]);
    }
    panel.push(this.guns.pdLine(RED));
    g.font = '12px ui-monospace, Menlo, monospace';
    const x0 = w - 18;
    g.textAlign = 'right';
    panel.forEach(([s, col], i) => {
      const y = h - 70 - (panel.length - 1 - i) * 18;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = g.measureText(s).width;
      g.fillRect(x0 - tw - 6, y - 13, tw + 12, 17);
      g.fillStyle = col;
      g.fillText(s, x0, y);
    });
    g.textAlign = 'left';
    if (this.msg) {
      g.font = '13px ui-monospace, Menlo, monospace';
      g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = g.measureText(this.msg.text).width;
      g.fillRect(w / 2 - tw / 2 - 8, h * 0.7 - 15, tw + 16, 21);
      g.fillStyle = TEXT;
      g.fillText(this.msg.text, w / 2, h * 0.7);
      g.textAlign = 'left';
    }
  }

  /** The waypoint's numbers, every frame (whether you are at the helm or not): range, closing speed, the distance to
   *  stop, the call, and arriving. */
  navFrame(dt) {
    const N = this.nav;
    if (!N) return;
    N.t += dt;
    const to = _a.subVectors(N.at, this.C.obj.position);
    N.range = to.length();
    const v = _b.copy(this.body.vel).sub(this.helm.ref);
    N.closing = N.range > 1 ? v.dot(to) / N.range : 0;
    const a = Math.max(0.05, this.mainAcc());
    // To stop: turn the nose onto retrograde (coasting all the while), then burn.
    const fwd = _c.set(0, 0, -1).applyQuaternion(this.C.obj.quaternion);
    const off = N.closing > 0.5 ? Math.acos(Math.max(-1, Math.min(1, -fwd.dot(to) / N.range))) : 0;
    N.turn = this.turnTime(off);
    N.stop = N.closing > 0 ? N.closing * N.turn + (N.closing * N.closing) / (2 * a) : 0;
    const was = N.call;
    N.call = N.closing > 3 && N.stop > N.range * 1.05 + 500 ? 'over' : N.closing > 3 && N.stop > N.range * 0.92 ? (off < 0.2 ? 'brake' : 'flip') : 'cruise';
    if (N.call === 'flip' && was !== 'flip' && !N.flipCalled) {
      N.flipCalled = true;
      this.dc?.say('Navigator. Turnover. Flip and burn.', null, 0);
    }
    if (N.range < 2000 && v.length() < 20) {
      this.arrivals++;
      this.say(`On station at ${N.name}: ${km(N.range)} off, ${v.length().toFixed(1)} m/s. Well flown.`, 6);
      this.dc?.say(`Navigator. On station at waypoint ${N.name}.`, null, 0);
      const done = N;
      this.nav = null;
      this.onArrive?.(done);
    }
  }
}
