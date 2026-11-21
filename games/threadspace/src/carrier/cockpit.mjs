// The fighter's cockpit instruments: the three screens on her panel and the head-up display.
//
// The screens are canvases drawn onto the model's screen quads (fighter-model.mjs), a few times a second:
//   left    THR   her jets seen from above, each nozzle lit while its valve is open, the drive, the hold, the tanks;
//   centre  NAV   a plot round her, nose up: the carrier's outline, the approach lane and where she is drifting;
//   right   APP   the approach: where she is against the lane's line, her closing speed against the speed it wants.
//
// The HUD is a 2D canvas over the view (#c-fhud), drawn every frame in the HUD's green, as if focused at infinity:
// the nose (the W), the pitch ladder and the course tape against the carrier (her deck is the horizon, her bow 000), speed
// and the tanks on the left, range and closing on the right, the hold, the drive and g at the bottom, and the markers:
// the aim (a diamond: where the attitude hold is taking the nose), where you are going (prograde, a circle), the
// opposite way (retrograde, a crossed circle: point the nose there and burn to stop), and where to fly (the lane, then
// the bay). A dry tank is said plainly in the middle of the view. From the chase view only the markers and the calls.

import * as THREE from 'three';
import { clamp } from '../util.mjs';

const GREEN = '#8dffb4';
const AMBER = '#ffc04a';
const RED = '#ff6050';
const CALL = {
  lane: ['FLY TO THE LANE', GREEN],
  line: ['LINE UP', AMBER],
  slow: ['SLOW DOWN', AMBER],
  fast: ['TOO FAST', RED],
  good: ['ON THE LANE', GREEN],
  catch: ['FLIGHT CONTROL HAS YOU', GREEN]
};
const DEG = 180 / Math.PI;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Cockpit {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.screens = null;
    this.mfdT = 0;
    this.lastVel = new THREE.Vector3();
    this.gLoad = 1;
    this.on = false;
  }

  /** Lights the screens of fighter model `w` (and puts out the last one's). */
  attach(w) {
    if (this.w === w) return;
    this.detach();
    this.w = w;
    const list = w.userData.screens;
    if (!list) return; // the code-built Wren has no cockpit
    this.screens = list.map((mesh) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false; // glTF's UVs run top-down
      const m = mesh.material;
      const was = { map: m.map, emissiveMap: m.emissiveMap, emissive: m.emissive.clone(), color: m.color.clone() };
      Object.assign(m, { map: tex, emissiveMap: tex });
      m.emissive.set('#ffffff');
      m.color.set('#000000');
      m.needsUpdate = true;
      return { c, x: c.getContext('2d'), tex, m, was };
    });
  }

  detach() {
    for (const s of this.screens ?? []) {
      Object.assign(s.m, { map: s.was.map, emissiveMap: s.was.emissiveMap });
      s.m.emissive.copy(s.was.emissive);
      s.m.color.copy(s.was.color);
      s.m.needsUpdate = true;
      s.tex.dispose();
    }
    this.screens = null;
    this.w = null;
  }

  /** Clears the HUD (out of the fighter). */
  hide() {
    if (!this.on) return;
    this.on = false;
    this.g.clearRect(0, 0, this.cv.width, this.cv.height);
  }

  /** One frame. `s`: { fighter, carrier (Rigid), C, lane (approach state), approach, camera, cockpit (bool), aim
   *  ({ world point, label }) }. */
  frame(dt, s) {
    this.on = true;
    const f = s.fighter;
    // Felt acceleration, smoothed: the change in her velocity (the carrier's own push is too small to matter).
    // Only between two frames of free flight: a hand-over (into the world with the carrier's speed) is not a push.
    if (dt > 0 && f.flying && this.wasFlying) {
      const a = _v.copy(f.body.vel).sub(this.lastVel).length() / dt;
      this.gLoad += (a / 9.81 - this.gLoad) * Math.min(1, dt * 4);
    } else if (!f.flying) this.gLoad += (0 - this.gLoad) * Math.min(1, dt * 4);
    this.wasFlying = f.flying;
    this.lastVel.copy(f.body.vel);
    this.drawHud(s);
    this.mfdT -= dt;
    if (this.screens && s.cockpit && this.mfdT <= 0) {
      this.mfdT = 0.12;
      this.thr(this.screens[0], s);
      this.nav(this.screens[1], s);
      this.app(this.screens[2], s);
    }
  }

  // --- the head-up display --------------------------------------------------------------------------------------------

  drawHud(s) {
    const cv = this.cv;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cam = s.camera;
    const f = s.fighter;
    const px = H / 2 / Math.tan((cam.fov * Math.PI) / 360); // pixels per radian at the centre
    const cx = W / 2, cy = H / 2;
    const font = (n, w = 500) => `${w} ${n}px ui-monospace, "SF Mono", Menlo, monospace`;
    g.lineWidth = 1.6;
    g.shadowColor = 'rgba(80, 255, 150, 0.6)';
    g.shadowBlur = 4;
    g.strokeStyle = g.fillStyle = GREEN;
    g.textBaseline = 'middle';

    const rel = _w.copy(f.body.vel).sub(s.carrier.vel);
    const speed = rel.length();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const project = (dir) => {
      const behind = dir.dot(fwd) <= 0;
      const p = cam.position.clone().addScaledVector(dir, 1000).project(cam);
      return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H, behind };
    };
    const lane = s.lane;
    let callAt = [cx, cy + 90];

    if (s.cockpit) {
      const R = Math.min(H * 0.22, W * 0.3); // the HUD's field: about ±13° at the usual view
      // Everything is drawn round her nose line (the camera looks a little below it).
      const nose = new THREE.Vector3(0, 0, -1).applyQuaternion(f.obj.getWorldQuaternion(new THREE.Quaternion()));
      const np = project(nose);
      const cx = np.x, cy = np.y;
      callAt = [cx, cy + R * 0.62];
      // The carrier's frame: her up and her bow, in the world.
      const cq = s.C.frame.getWorldQuaternion(_q);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
      const bow = new THREE.Vector3(0, 0, -1).applyQuaternion(cq);
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const pitch = Math.asin(clamp(nose.dot(up), -1, 1));
      const roll = Math.atan2(up.dot(camRight), up.dot(camUp)); // how far her deck is tipped on the screen

      // The pitch ladder, clipped to the HUD's field.
      g.save();
      g.beginPath();
      g.rect(cx - R - 50, cy - R * 0.85, 2 * R + 100, 1.7 * R);
      g.clip();
      g.translate(cx, cy);
      g.rotate(roll);
      for (let a = -90; a <= 90; a += 10) {
        const y = (pitch - a / DEG) * px;
        if (Math.abs(y) > R * 1.6) continue;
        const half = a === 0 ? R * 0.9 : R * 0.32;
        g.setLineDash(a < 0 ? [8, 6] : []);
        g.beginPath();
        if (a === 0) {
          g.moveTo(-half, y);
          g.lineTo(-R * 0.12, y);
          g.moveTo(R * 0.12, y);
          g.lineTo(half, y);
        } else {
          const tick = a > 0 ? 8 : -8;
          g.moveTo(-half, y + tick);
          g.lineTo(-half, y);
          g.lineTo(-R * 0.1, y);
          g.moveTo(R * 0.1, y);
          g.lineTo(half, y);
          g.lineTo(half, y + tick);
        }
        g.stroke();
        g.setLineDash([]);
        g.font = font(11);
        if (a !== 0) {
          g.textAlign = 'right';
          g.fillText(String(Math.abs(a)), -half - 6, y);
          g.textAlign = 'left';
          g.fillText(String(Math.abs(a)), half + 6, y);
        } else {
          g.textAlign = 'left';
          g.fillText('DECK', half + 6, y);
        }
      }
      g.restore();

      // The nose: a W at the centre.
      g.beginPath();
      g.moveTo(cx - 22, cy);
      g.lineTo(cx - 11, cy);
      g.lineTo(cx - 5, cy + 8);
      g.lineTo(cx, cy);
      g.lineTo(cx + 5, cy + 8);
      g.lineTo(cx + 11, cy);
      g.lineTo(cx + 22, cy);
      g.stroke();

      // The course tape: her nose's bearing from the carrier's bow, round to starboard, in her deck's plane.
      const flat = nose.clone().addScaledVector(up, -nose.dot(up));
      let crs = 0;
      if (flat.lengthSq() > 1e-6) {
        flat.normalize();
        const stb = new THREE.Vector3().crossVectors(bow, up); // her starboard
        crs = (Math.atan2(flat.dot(stb), flat.dot(bow)) * DEG + 360) % 360;
      }
      const ty = cy - R * 0.85 - 18;
      g.save();
      g.beginPath();
      g.rect(cx - R * 0.7, ty - 16, R * 1.4, 34);
      g.clip();
      g.font = font(11);
      g.textAlign = 'center';
      for (let d = Math.floor(crs / 5) * 5 - 40; d <= crs + 40; d += 5) {
        const x = cx + (d - crs) * (R * 0.7 / 35);
        g.beginPath();
        g.moveTo(x, ty + 6);
        g.lineTo(x, ty + (d % 10 === 0 ? -2 : 2));
        g.stroke();
        if (d % 30 === 0) g.fillText(String(((d % 360) + 360) % 360 / 10).padStart(2, '0'), x, ty - 9);
      }
      g.restore();
      g.beginPath();
      g.moveTo(cx, ty + 9);
      g.lineTo(cx - 5, ty + 16);
      g.lineTo(cx + 5, ty + 16);
      g.closePath();
      g.stroke();
      g.font = font(12, 600);
      g.textAlign = 'center';
      g.fillText(String(Math.round(crs) % 360).padStart(3, '0'), cx, ty + 28);

      // Speed on the left; the tanks under it (amber when low, red when dry); what the lane wants when you are on it.
      const lx = cx - R - 26;
      g.textAlign = 'right';
      g.font = font(10);
      g.fillText('SPD', lx, cy - 32);
      box(g, lx - 62, cy - 15, 62, 30);
      g.font = font(17, 600);
      g.fillText(speed < 1000 ? speed.toFixed(0) : (speed / 1000).toFixed(2) + 'k', lx - 6, cy);
      g.font = font(12);
      const fl = f.flight;
      const tank = (k) => fl.prop[k] / fl.S.tank[k];
      g.fillStyle = tankColour(tank('main'));
      g.fillText(`FUEL ${Math.round(tank('main') * 100)}%`, lx, cy + 30);
      g.fillStyle = tankColour(tank('rcs'));
      g.fillText(`RCS ${Math.round(tank('rcs') * 100)}%`, lx, cy + 46);
      g.fillStyle = GREEN;
      if (lane?.inLane) {
        g.fillStyle = lane.closing > lane.want * 1.25 + 2 ? AMBER : GREEN;
        g.fillText(`WANT ${lane.want.toFixed(0)}`, lx, cy + 64);
        g.fillStyle = GREEN;
      }

      // Range and closing to the bay on the right.
      const rx = cx + R + 26;
      g.textAlign = 'left';
      g.font = font(10);
      g.fillText('BAY', rx, cy - 32);
      box(g, rx, cy - 15, 74, 30);
      g.font = font(17, 600);
      g.fillText(range(s.bayDist), rx + 6, cy);
      g.font = font(12);
      g.fillText(`CLS ${s.closing >= 0 ? '+' : ''}${s.closing.toFixed(0)}`, rx, cy + 30);

      // The hold, g and the drive along the bottom.
      const by = cy + R * 0.85 + 20;
      g.font = font(13, 600);
      g.textAlign = 'left';
      const off = !fl.assistOn;
      g.fillStyle = off ? AMBER : GREEN;
      if (!off || performance.now() % 1000 < 650) g.fillText(fl.assistName, cx - R, by);
      g.fillStyle = GREEN;
      g.textAlign = 'right';
      g.fillText(`${this.gLoad.toFixed(1)} G`, cx + R, by);
      box(g, cx - 40, by - 4, 80, 8);
      g.fillRect(cx - 40, by - 4, 80 * fl.power, 8);
      g.font = font(10);
      g.textAlign = 'center';
      g.fillText(fl.burning ? ((fl.boostK ?? 0) > 0.05 ? 'HARD BURN' : 'BURN') : fl.online ? 'DRIVE' : 'COLD', cx, by + 14);
      // What the g is doing to you (gload.mjs): the couch's juice, the strain, blacking out.
      const GL = f.gl;
      if (GL) {
        g.textAlign = 'right';
        g.font = font(10);
        g.fillStyle = GL.juice <= 0 ? RED : GL.juiced ? AMBER : GREEN;
        g.fillText(`JUICE ${Math.round((GL.juice / Math.max(1, GL.S.juice)) * 100)}%`, cx + R, by + 14);
        if (GL.strain > 0.3 || GL.out) {
          g.textAlign = 'center';
          g.font = font(14, 600);
          g.fillStyle = RED;
          if (GL.out || performance.now() % 700 < 450) g.fillText(GL.out ? 'G-LOC' : 'G STRAIN: EASE OFF', cx, cy - R * 0.55);
        }
      }

      // The lane's needles: fly toward them. Off to her right of the line puts the line to her left.
      if (lane?.inLane && lane.nose > 0.3) {
        const k = R / 24; // 24 m from the line is the edge of the field
        const nx = cx + clamp(-lane.side * k, -R, R);
        const ny = cy + clamp(lane.up * k, -R * 0.8, R * 0.8);
        g.strokeStyle = Math.abs(lane.side) < 4 ? GREEN : AMBER;
        g.beginPath();
        g.moveTo(nx, cy - R * 0.5);
        g.lineTo(nx, cy + R * 0.5);
        g.stroke();
        g.strokeStyle = Math.abs(lane.up) < 4 ? GREEN : AMBER;
        g.beginPath();
        g.moveTo(cx - R * 0.5, ny);
        g.lineTo(cx + R * 0.5, ny);
        g.stroke();
        g.strokeStyle = GREEN;
      }
    }

    // The markers: the aim, where you are going, the opposite way, and where to fly.
    const fl = f.flight;
    if (f.flying && fl.assistOn) {
      const a = project(fl.aimDir(new THREE.Vector3()));
      if (!a.behind) {
        g.strokeStyle = AMBER;
        g.beginPath();
        g.moveTo(a.x, a.y - 6);
        g.lineTo(a.x + 6, a.y);
        g.lineTo(a.x, a.y + 6);
        g.lineTo(a.x - 6, a.y);
        g.closePath();
        g.stroke();
        g.strokeStyle = GREEN;
      }
    }
    if (speed > 0.5) {
      const d = rel.clone().normalize();
      const p = project(d);
      if (!p.behind) fpm(g, p.x, p.y, GREEN);
      const r = project(d.negate());
      if (!r.behind) retro(g, r.x, r.y, AMBER);
    }
    // The contact (a raider, or a target sled): its bracket, range and state, and the pip to put her nose on so her
    // rounds meet it. Off the view, a red arrow at the edge.
    if (s.foe) {
      const e = s.foe;
      const p = project(e.point.clone().sub(cam.position).normalize());
      const m = 30;
      g.strokeStyle = g.fillStyle = RED;
      g.shadowColor = 'rgba(255, 90, 70, 0.6)';
      g.font = font(12);
      const rng = e.range < 1000 ? `${Math.round(e.range)} m` : `${(e.range / 1000).toFixed(2)} km`;
      if (p.behind || p.x < m || p.x > W - m || p.y < m || p.y > H - m) {
        let dx = p.x - W / 2, dy = p.y - H / 2;
        if (p.behind) (dx = -dx), (dy = -dy);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
        const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-6), (H / 2 - m) / Math.max(Math.abs(dy), 1e-6));
        const ex = W / 2 + dx * k, ey = H / 2 + dy * k, a = Math.atan2(dy, dx);
        g.save();
        g.translate(ex, ey);
        g.rotate(a);
        g.beginPath();
        g.moveTo(12, 0);
        g.lineTo(-6, -8);
        g.lineTo(-6, 8);
        g.closePath();
        g.fill();
        g.restore();
        g.textAlign = ex > W / 2 ? 'right' : 'left';
        g.fillText(`${e.label} ${rng}`, ex + (ex > W / 2 ? -18 : 18), ey + (ey > H / 2 ? -16 : 16));
      } else {
        const b = 16;
        g.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.moveTo(p.x + sx * b, p.y + sy * (b - 6)), g.lineTo(p.x + sx * b, p.y + sy * b), g.lineTo(p.x + sx * (b - 6), p.y + sy * b);
        g.stroke();
        g.textAlign = 'left';
        g.fillText(`${e.label} ${rng}`, p.x + b + 6, p.y - 8);
        g.fillText(e.hits != null ? `HITS ${e.hits}` : e.shield > 0.01 ? `SHD ${Math.round(e.shield * 100)}%` : `HULL ${Math.round(e.hull * 100)}%`, p.x + b + 6, p.y + 8);
        g.fillText(`${e.closing >= 0 ? 'closing' : 'opening'} ${Math.abs(e.closing).toFixed(0)} m/s`, p.x + b + 6, p.y + 24);
        if (e.count > 1) g.fillText(`X: next of ${e.count}`, p.x + b + 6, p.y + 40);
      }
      if (e.lead) {
        const lp = project(e.lead.clone().sub(cam.position).normalize());
        if (!lp.behind) {
          g.strokeStyle = AMBER;
          g.shadowColor = 'rgba(255, 190, 70, 0.6)';
          g.beginPath();
          g.arc(lp.x, lp.y, 9, 0, Math.PI * 2);
          g.moveTo(lp.x - 3, lp.y), g.lineTo(lp.x + 3, lp.y), g.moveTo(lp.x, lp.y - 3), g.lineTo(lp.x, lp.y + 3);
          g.stroke();
        }
      }
      g.textAlign = 'left';
      g.shadowColor = 'rgba(80, 255, 150, 0.6)';
      g.strokeStyle = g.fillStyle = GREEN;
    }
    // The other contacts: a small red bracket each, its name beside it.
    if (s.marks?.length) {
      g.strokeStyle = g.fillStyle = RED;
      g.shadowColor = 'rgba(255, 90, 70, 0.6)';
      g.font = font(10);
      g.textAlign = 'left';
      for (const k of s.marks) {
        const p = project(k.point.clone().sub(cam.position).normalize());
        if (p.behind || p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
        g.strokeRect(p.x - 6, p.y - 6, 12, 12);
        g.fillText(k.label, p.x + 10, p.y + 4);
      }
      g.shadowColor = 'rgba(80, 255, 150, 0.6)';
      g.strokeStyle = g.fillStyle = GREEN;
    }
    // A rescue craft on her way (rescue.mjs): a cyan ring with her name, range and what she is doing; an arrow at the
    // edge while she is out of view.
    if (s.rescue) {
      const p = project(s.rescue.point.clone().sub(cam.position).normalize());
      const rr = s.rescue.range, rng = rr < 1000 ? `${Math.round(rr)} m` : `${(rr / 1000).toFixed(2)} km`;
      const what = { out: 'INBOUND', dock: 'CLOSING', fuel: 'HOSE ON', tow: 'TOWING', home: 'RTB' }[s.rescue.state] ?? '';
      g.strokeStyle = g.fillStyle = '#7fe8ff';
      g.shadowColor = 'rgba(120, 230, 255, 0.6)';
      g.font = font(11);
      const m = 30;
      if (p.behind || p.x < m || p.x > W - m || p.y < m || p.y > H - m) {
        let dx = p.x - W / 2, dy = p.y - H / 2;
        if (p.behind) (dx = -dx), (dy = -dy);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
        const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-6), (H / 2 - m) / Math.max(Math.abs(dy), 1e-6));
        const ex = W / 2 + dx * k, ey = H / 2 + dy * k;
        g.beginPath();
        g.arc(ex, ey, 7, 0, Math.PI * 2);
        g.stroke();
        g.textAlign = ex > W / 2 ? 'right' : 'left';
        g.fillText(`${s.rescue.label} ${rng}`, ex + (ex > W / 2 ? -14 : 14), ey + 4);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, 11, 0, Math.PI * 2);
        g.moveTo(p.x, p.y - 15), g.lineTo(p.x, p.y - 8), g.moveTo(p.x, p.y + 8), g.lineTo(p.x, p.y + 15);
        g.stroke();
        g.textAlign = 'left';
        g.fillText(`${s.rescue.label} ${rng}`, p.x + 17, p.y - 2);
        g.fillText(what, p.x + 17, p.y + 12);
      }
      g.textAlign = 'left';
      g.shadowColor = 'rgba(80, 255, 150, 0.6)';
      g.strokeStyle = g.fillStyle = GREEN;
    }
    // Her missiles' seeker: a circle round what it has locked (amber, with its name, when that is one of ours, a flare
    // or anything but the enemy: it has no friend or foe), or, searching, how much heat it sees.
    if (f.flying && s.missiles > 0) {
      if (s.lock) {
        const p = project(s.lock.pos.clone().sub(cam.position).normalize());
        if (!p.behind) {
          const foe = s.lock.side === 'theirs';
          g.strokeStyle = g.fillStyle = foe ? RED : AMBER;
          g.shadowColor = foe ? 'rgba(255, 90, 70, 0.6)' : 'rgba(255, 190, 70, 0.6)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(p.x, p.y, 24, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 1.6;
          g.font = font(12, 600);
          g.textAlign = 'center';
          g.fillText(foe ? 'LOCK' : `LOCK ${s.lockName}`, p.x, p.y - 36);
        }
      }
      g.font = font(12);
      g.textAlign = 'left';
      g.fillStyle = s.lock ? (s.lock.side === 'theirs' ? RED : AMBER) : GREEN;
      g.fillText(s.lock ? `SEEKER LOCK  ${s.lockName}` : `SEEKER ${'▮'.repeat(Math.round((s.seeing ?? 0) * 5)).padEnd(5, '·')}`, 24, H - 124);
      g.shadowColor = 'rgba(80, 255, 150, 0.6)';
      g.strokeStyle = g.fillStyle = GREEN;
    }
    if (f.flying && s.missiles != null) {
      g.font = font(13);
      g.textAlign = 'left';
      g.fillStyle = s.missiles > 0 ? GREEN : AMBER;
      g.fillText(`MSL ${s.missiles}   FLR ${s.flares ?? 0}`, 24, H - 104);
      g.fillStyle = GREEN;
    }
    // A missile tracking her: MISSILE, its range and closing speed, flashing, and where it is.
    if (s.warn) {
      const on = (performance.now() / 180) % 2 < 1.3;
      g.strokeStyle = g.fillStyle = RED;
      g.shadowColor = 'rgba(255, 90, 70, 0.8)';
      if (on) {
        g.font = font(22, 700);
        g.textAlign = 'center';
        g.fillText('MISSILE', W / 2, 70);
        g.font = font(12);
        g.fillText(`${Math.round(s.warn.range)} m · closing ${Math.round(s.warn.closing)} m/s · cut drive, flares G`, W / 2, 94);
      }
      const p = project(s.warn.pos.clone().sub(cam.position).normalize());
      const m = 30;
      if (p.behind || p.x < m || p.x > W - m || p.y < m || p.y > H - m) {
        let dx = p.x - W / 2, dy = p.y - H / 2;
        if (p.behind) (dx = -dx), (dy = -dy);
        const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-6), (H / 2 - m) / Math.max(Math.abs(dy), 1e-6));
        g.save();
        g.translate(W / 2 + dx * k, H / 2 + dy * k);
        g.rotate(Math.atan2(dy, dx));
        g.beginPath();
        g.moveTo(16, 0);
        g.lineTo(-8, -11);
        g.lineTo(-8, 11);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.beginPath();
        g.moveTo(p.x, p.y - 12), g.lineTo(p.x + 12, p.y), g.lineTo(p.x, p.y + 12), g.lineTo(p.x - 12, p.y), g.closePath();
        g.stroke();
      }
      g.shadowColor = 'rgba(80, 255, 150, 0.6)';
      g.strokeStyle = g.fillStyle = GREEN;
    }
    // Her cannon's drum, while there is something to shoot at or it is not full.
    if (f.flying && s.rounds != null && (s.foe || s.rounds < s.roundsMax)) {
      g.font = font(13);
      g.textAlign = 'left';
      g.fillStyle = s.rounds > 0 ? GREEN : RED;
      g.fillText(s.rounds > 0 ? `GUN ${s.rounds}` : 'GUN EMPTY', 24, H - 64);
      g.fillStyle = GREEN;
    }
    // Her own hull, once it has been hit.
    if (s.hull != null && s.hull < 1) {
      g.font = font(13);
      g.textAlign = 'left';
      g.fillStyle = s.hull > 0.5 ? AMBER : RED;
      g.fillText(s.hull > 0 ? `HULL ${Math.round(s.hull * 100)}%` : 'DEAD IN SPACE', 24, H - 84);
      g.fillStyle = GREEN;
    }
    if (s.aim) {
      const dir = s.aim.point.clone().sub(cam.position).normalize();
      let p = project(dir);
      const m = 34;
      const out = p.behind || p.x < m || p.x > W - m || p.y < m || p.y > H - m;
      if (out) {
        // Pinned to the edge of the view, pointing the way to turn.
        let dx = p.x - cx, dy = p.y - cy;
        if (p.behind) (dx = -dx), (dy = -dy);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
        const k = Math.min((W / 2 - m) / Math.max(Math.abs(dx), 1e-6), (H / 2 - m) / Math.max(Math.abs(dy), 1e-6));
        p = { x: cx + dx * k, y: cy + dy * k };
        const a = Math.atan2(dy, dx);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(a);
        g.beginPath();
        g.moveTo(12, 0);
        g.lineTo(-6, -8);
        g.lineTo(-6, 8);
        g.closePath();
        g.stroke();
        g.restore();
      } else {
        g.beginPath();
        g.moveTo(p.x, p.y - 10);
        g.lineTo(p.x + 10, p.y);
        g.lineTo(p.x, p.y + 10);
        g.lineTo(p.x - 10, p.y);
        g.closePath();
        g.stroke();
      }
      g.font = font(11);
      g.textAlign = p.x > W - 140 ? 'right' : 'left';
      g.fillText(s.aim.label, p.x + (p.x > W - 140 ? -18 : 18), p.y);
    }
    // A dry tank is said plainly, in the middle of the view.
    if (f.flying) {
      const dry = [fl.dryRcs && 'RCS DRY: THE JETS CANNOT FIRE', fl.dryMain && 'FUEL DRY: THE DRIVE CANNOT LIGHT'].filter(Boolean);
      if (dry.length) {
        g.font = font(13, 600);
        g.textAlign = 'center';
        g.fillStyle = RED;
        dry.forEach((t, i) => g.fillText(t, W / 2, H * 0.3 + i * 18));
        g.font = font(11);
        g.fillStyle = GREEN;
        g.fillText('LAND TO REFUEL' + (f.debug ? ' (T: DEBUG REFILL)' : ''), W / 2, H * 0.3 + dry.length * 18);
      }
    }
    // The call, under the nose.
    if (lane?.inLane && s.fighter.flying) {
      const [text, col] = CALL[lane.call] ?? CALL.lane;
      g.font = font(13, 600);
      g.textAlign = 'center';
      g.fillStyle = col;
      g.fillText(text, ...callAt);
    }
    g.shadowBlur = 0;
  }

  // --- the screens ------------------------------------------------------------------------------------------------------

  /** Left: her jets from above, the drive, the hold and the tanks. */
  thr(S, s) {
    const x = S.x, f = s.fighter;
    screen(x, 'THR');
    const sc = 16, ox = 128, oy = 122; // 16 px a metre, her centre of mass mid-screen
    // Her outline.
    x.strokeStyle = '#3a8a5a';
    x.lineWidth = 1.5;
    x.beginPath();
    for (const [px, pz] of [[0, -6.2], [0.9, -3.6], [1.1, -1], [3.3, 0.4], [5.6, 1.4], [5.6, 2.8], [1.2, 2.8], [1.0, 3.6], [-1.0, 3.6], [-1.2, 2.8], [-5.6, 2.8], [-5.6, 1.4], [-3.3, 0.4], [-1.1, -1], [-0.9, -3.6]]) x.lineTo(ox + px * sc, oy + pz * sc);
    x.closePath();
    x.stroke();
    // Each nozzle, lit while its valve is open; the drive by its power.
    for (const t of f.flight.list) {
      const k = t.throttle;
      const p = t.at;
      const X = ox + p.x * sc, Y = oy + p.z * sc;
      x.fillStyle = k > 0.02 ? `rgba(141, 255, 180, ${0.35 + 0.65 * k})` : '#1f4a30';
      if (t.kind === 'main') {
        x.fillRect(X - 10, Y + 4, 20, 6 + 40 * k);
      } else if (t.dir.y !== 0) {
        x.beginPath();
        x.arc(X + (t.dir.y > 0 ? -4 : 4), Y, 4, 0, Math.PI * 2);
        x.fill();
      } else {
        x.save();
        x.translate(X, Y);
        x.rotate(Math.atan2(t.dir.z, t.dir.x));
        x.beginPath();
        x.moveTo(4, -4);
        x.lineTo(4 + 8 + 14 * k, 0);
        x.lineTo(4, 4);
        x.fill();
        x.restore();
      }
    }
    const fl = f.flight;
    x.fillStyle = fl.assistOn ? GREEN : AMBER;
    x.font = '600 18px ui-monospace, Menlo, monospace';
    x.textAlign = 'left';
    x.fillText(fl.assistName, 10, 218);
    x.textAlign = 'right';
    const fuel = fl.prop.main / fl.S.tank.main, rcsP = fl.prop.rcs / fl.S.tank.rcs;
    x.fillStyle = tankColour(fuel);
    x.fillText(`F ${Math.round(fuel * 100)}`, 170, 218);
    x.fillStyle = tankColour(rcsP);
    x.fillText(`R ${Math.round(rcsP * 100)}`, 246, 218);
    x.fillStyle = GREEN;
    x.font = '14px ui-monospace, Menlo, monospace';
    x.textAlign = 'left';
    const firing = fl.noz.filter((t) => t.open).length;
    x.fillText(`JETS ${firing}/${fl.noz.length}`, 10, 244);
    x.textAlign = 'right';
    x.fillText(`${this.gLoad.toFixed(1)} G`, 246, 244);
    S.tex.needsUpdate = true;
  }

  /** Centre: a plot round her, nose up — the carrier, the lane and where she is drifting. */
  nav(S, s) {
    const x = S.x, f = s.fighter;
    screen(x, 'NAV');
    const w = f.obj;
    const inv = w.matrixWorld.clone().invert();
    const toMe = (p) => _v.copy(p).applyMatrix4(inv); // into her frame: x right, -z ahead
    const C = s.C;
    const dist = toMe(C.frame.getWorldPosition(new THREE.Vector3())).length();
    const ranges = [250, 500, 1000, 2000, 5000, 10000, 20000];
    const rng = ranges.find((r) => r > dist * 1.15 + 120) ?? ranges[ranges.length - 1];
    const sc = 110 / rng, ox = 128, oy = 140;
    const pt = (p) => {
      const q = toMe(p);
      return [ox + q.x * sc, oy + q.z * sc];
    };
    // Range ring.
    x.strokeStyle = '#1f4a30';
    x.lineWidth = 1;
    x.beginPath();
    x.arc(ox, oy, 110, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(ox, oy, 55, 0, Math.PI * 2);
    x.stroke();
    // The carrier's outline (her deck plan) and the bay.
    const half = 34, L = C.L.length / 2;
    x.strokeStyle = GREEN;
    x.lineWidth = 1.5;
    x.beginPath();
    for (const [a, b] of [[-half * 0.3, -L], [half, -L * 0.7], [half, L], [-half, L], [-half, -L * 0.7]]) x.lineTo(...pt(C.frame.localToWorld(new THREE.Vector3(a, 0, b))));
    x.closePath();
    x.stroke();
    // The lane: the line out from the bay, dots at the rings.
    if (s.approach) {
      x.strokeStyle = '#4fd0e0';
      x.setLineDash([4, 4]);
      x.beginPath();
      x.moveTo(...pt(s.approach.pointAt(0)));
      x.lineTo(...pt(s.approach.pointAt(s.approach.len)));
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = '#4fd0e0';
      const [gx, gy] = pt(s.approach.pointAt(0));
      x.fillRect(gx - 3, gy - 3, 6, 6);
    }
    // Her drift over the next ten seconds.
    const rel = new THREE.Vector3().copy(f.body.vel).sub(s.carrier.vel);
    const end = pt(w.getWorldPosition(new THREE.Vector3()).addScaledVector(rel, 10));
    x.strokeStyle = GREEN;
    x.beginPath();
    x.moveTo(ox, oy);
    x.lineTo(...end);
    x.stroke();
    // Her, nose up.
    x.fillStyle = GREEN;
    x.beginPath();
    x.moveTo(ox, oy - 8);
    x.lineTo(ox + 6, oy + 6);
    x.lineTo(ox - 6, oy + 6);
    x.closePath();
    x.fill();
    x.font = '14px ui-monospace, Menlo, monospace';
    x.textAlign = 'right';
    x.fillText(range(rng), 246, 34);
    x.textAlign = 'left';
    x.fillText(`BAY ${range(s.bayDist)}`, 10, 244);
    S.tex.needsUpdate = true;
  }

  /** Right: the approach — her place against the lane's line, closing speed against the speed it wants. */
  app(S, s) {
    const x = S.x, l = s.lane;
    screen(x, 'APP');
    x.font = '14px ui-monospace, Menlo, monospace';
    x.textAlign = 'left';
    if (!l?.inLane) {
      x.fillStyle = GREEN;
      x.fillText('FLIGHT CONTROL', 10, 60);
      x.fillText(`BAY ${s.bayOpen ? 'OPEN' : 'CLOSED'}`, 10, 84);
      x.fillText(`LANE TO PAD ${s.pad}`, 10, 108);
      x.fillStyle = AMBER;
      x.fillText('FLY TO THE FAR RING', 10, 150);
      x.fillText('TURN IN, SLOW DOWN', 10, 172);
      x.fillStyle = GREEN;
      x.fillText(`ENTRY ${range(s.entryDist ?? 0)}`, 10, 214);
      S.tex.needsUpdate = true;
      return;
    }
    // The cross: she is the dot, the line is the centre. 1 px a 0.25 m out to ±20 m.
    const ox = 128, oy = 112, k = 4;
    x.strokeStyle = '#1f4a30';
    x.lineWidth = 1;
    x.strokeRect(ox - 80, oy - 60, 160, 120);
    x.strokeRect(ox - 16, oy - 14, 32, 28); // where flight control will catch you
    x.strokeStyle = GREEN;
    x.beginPath();
    x.moveTo(ox - 80, oy);
    x.lineTo(ox + 80, oy);
    x.moveTo(ox, oy - 60);
    x.lineTo(ox, oy + 60);
    x.stroke();
    const good = Math.abs(l.side) < 4 && Math.abs(l.up) < 4;
    x.fillStyle = good ? GREEN : AMBER;
    x.beginPath();
    x.arc(ox + clamp(l.side * k, -80, 80), oy - clamp(l.up * k, -60, 60), 6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = GREEN;
    x.fillText(`OUT ${range(Math.max(0, l.along))}`, 10, 196);
    const fast = l.closing > l.want * 1.25 + 2;
    x.fillStyle = fast ? AMBER : GREEN;
    x.fillText(`CLS ${l.closing.toFixed(0)} / ${l.want.toFixed(0)}`, 10, 218);
    const [text, col] = CALL[l.call] ?? CALL.lane;
    x.fillStyle = col;
    x.font = '600 14px ui-monospace, Menlo, monospace';
    x.fillText(text.length > 18 ? 'CAUGHT' : text, 10, 244);
    S.tex.needsUpdate = true;
  }
}

function screen(x, title) {
  x.fillStyle = '#04100a';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#1f4a30';
  x.lineWidth = 2;
  x.strokeRect(3, 3, 250, 250);
  x.fillStyle = GREEN;
  x.font = '600 16px ui-monospace, Menlo, monospace';
  x.textAlign = 'left';
  x.textBaseline = 'middle';
  x.fillText(title, 10, 20);
}

function box(g, x, y, w, h) {
  g.strokeRect(x, y, w, h);
}

function range(d) {
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`;
}

/** The flight path marker: a circle with wings and a fin. */
function fpm(g, x, y, col) {
  g.strokeStyle = col;
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.moveTo(x - 7, y);
  g.lineTo(x - 17, y);
  g.moveTo(x + 7, y);
  g.lineTo(x + 17, y);
  g.moveTo(x, y - 7);
  g.lineTo(x, y - 14);
  g.stroke();
  g.strokeStyle = GREEN;
}

/** A tank's gauge colour: green, amber under 15 %, red when dry. */
function tankColour(k) {
  return k <= 0 ? RED : k < 0.15 ? AMBER : GREEN;
}

/** The opposite way: a circle with a cross. */
function retro(g, x, y, col) {
  g.strokeStyle = col;
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.moveTo(x - 5, y - 5);
  g.lineTo(x + 5, y + 5);
  g.moveTo(x + 5, y - 5);
  g.lineTo(x - 5, y + 5);
  g.stroke();
  g.strokeStyle = GREEN;
}
