// The way to your order: a gold diamond hanging at the next door, ladder, hatch or lift on the shortest walk to
// where the order in hand sends you (career.mjs `target()`), and at the place itself once you are in its room. When
// it is off the screen, an arrow at the screen's edge points to it, with what it is and how far.
//
// The walk through the fixed hull is wayfinding.mjs's (`toward`: the same costs the floor lines use, so the diamond and
// the lines agree). The drums are a ring: round the ring corridor to the target's segment, through a room's doorway,
// the ladder between the decks or the lift up to the hub at the nearest spoke. From the fixed hull into a drum, the
// way is to the spine and the hatch onto that drum's hub ring. Nothing is shown on a ladder, in a lift or on the hub
// ring (each is a few seconds with one way out), nor away from the walk seat.
//
// `?guide=0` turns it off. `GUIDE` holds the looks.

import * as THREE from 'three';
import { portals, toward } from './wayfinding.mjs';
import { roomAt } from './layout.mjs';
import { parseKey, drumDeck, drumSpots, drumRoomAt } from './drum.mjs';

export const GUIDE = {
  y: 1.45, // how high over the floor the diamond hangs (an eye's height, so you float or walk at it)
  size: 0.16,
  near: 1.6, // metres: at the place itself, closer than this and the diamond goes (you are there)
  edge: 46, // px in from the screen's edge for the arrow
};

const GOLD = new THREE.MeshBasicMaterial({ color: '#ffc640', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
const _v = new THREE.Vector3();

export class Guide {
  constructor(C, walker, { on = true } = {}) {
    this.C = C;
    this.walker = walker;
    this.on = on;
    this.P = portals(C);
    this.routes = new Map(); // target room id → next map
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(GUIDE.size, 0), GOLD);
    this.mesh.scale.y = 1.6;
    this.mesh.renderOrder = 999;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.el = document.createElement('div');
    this.el.id = 'c-guide';
    this.el.innerHTML = '<span class="g-arrow">➤</span><span class="g-text"></span>';
    Object.assign(this.el.style, {
      position: 'fixed', left: '0', top: '0', zIndex: 6, pointerEvents: 'none', display: 'none', alignItems: 'center', gap: '6px',
      font: '600 12px/1.2 system-ui, sans-serif', color: '#ffd36a', textShadow: '0 1px 2px #000, 0 0 6px #000', whiteSpace: 'nowrap',
    });
    this.arrow = this.el.querySelector('.g-arrow');
    this.text = this.el.querySelector('.g-text');
    Object.assign(this.arrow.style, { display: 'inline-block', fontSize: '18px' });
    document.body.appendChild(this.el);
    this.last = null; // the last way point, kept while you stand in a doorway (no room)
  }

  /** Where the next leg goes, from where you are: { I, x, z, label } in that interior's frame, or null. `t` is the
   *  career's target ({ deck, seg, x, z, room }), `walk` the walk seat. */
  next(t, walk) {
    const C = this.C;
    if (!t || walk.hubNow || walk.swing || walk.ride || walk.climb || walk.line) return null;
    const tk = parseKey(t.deck);
    const d = walk.drumNow;
    if (d) return this.inDrum(t, tk, d, walk);
    // The fixed hull.
    const deck = walk.deckNow, I = C.decks.get(deck);
    if (!I) return null;
    const pos = this.walker.pos;
    const here = roomAt(C, deck, pos.x, pos.z);
    if (!here) return this.last?.I === I ? this.last : null; // a doorway: keep the way you were going
    const goal = tk ? C.rooms.get('spine') : t.room ?? roomAt(C, t.deck, t.x, t.z);
    if (!goal) return null;
    if (here.id === goal.id) {
      if (tk) {
        // The spine: the hatch onto this drum's hub ring.
        const h = C.L.drum.halves.find((x) => x.id === tk.hid);
        return { I, x: (goal.x[0] + goal.x[1]) / 2, z: (h.corridor[0] + h.corridor[1]) / 2, label: `Hatch: catch the hub ring down to the ${h.name.toLowerCase()}`, end: false };
      }
      return { I, x: t.x, z: t.z, label: t.who?.name ?? t.label ?? goal.name, end: true };
    }
    let next = this.routes.get(goal.id);
    if (!next) this.routes.set(goal.id, (next = toward(C, this.P, goal.id)));
    const p = next.get(here.id);
    if (!p) return null;
    const to = C.rooms.get(p.to);
    let label;
    if (p.kind === 'ladder') {
      const fl = (k) => C.L.decks.find((x) => x.id === k)?.floor ?? 0;
      label = `Ladder ${fl(p.deck) > fl(deck) ? 'up' : 'down'} to the ${C.deckName(p.deck).toLowerCase()}`;
    } else label = to?.name ?? 'Door';
    return (this.last = { I, x: p.x, z: p.z, label, end: false });
  }

  /** In a drum: to the target's segment round the ring, into its room, or to the spoke for the ladder or the lift. */
  inDrum(t, tk, d, walk) {
    const C = this.C, pos = this.walker.pos, I = d.I;
    const { hw, S } = drumDeck(C, d.hid, d.did);
    const spots = drumSpots(C, d.hid), h = C.L.drum.halves.find((x) => x.id === d.hid);
    const cz = (h.corridor[0] + h.corridor[1]) / 2;
    const here = drumRoomAt(C, d.hid, d.did, d.seg, pos.x, pos.z);
    const inRoom = !!here && !here.id.startsWith('ring-');
    const doorOut = () => ({ I, x: (here.x[0] + here.x[1]) / 2, z: here.row === 'fore' ? here.z[1] : here.z[0], label: 'Ring corridor', end: false });
    const ring = (seg, label) => {
      // Round the ring to segment `seg`, the short way: +x is the next segment up.
      const dk = (((seg - d.seg) % S) + S) % S, k = dk <= S / 2 ? 1 : -1, n = Math.min(dk, S - dk);
      if (!n) return null;
      return { I, x: k * (hw - 0.4), z: cz, label: `${label} · round the ring, ${n} segment${n > 1 ? 's' : ''}`, end: false };
    };
    const sameDeck = tk && tk.hid === d.hid && tk.did === d.did;
    if (sameDeck) {
      const seg = (((t.seg ?? 0) % S) + S) % S;
      const name = t.who?.name ?? t.room?.name ?? 'Your order';
      if (seg === d.seg) {
        const want = t.room && !t.room.id.startsWith('ring-') ? t.room : null;
        if (inRoom && (!want || here.id !== want.id)) return doorOut();
        if (want && (!inRoom || here.id !== want.id)) return { I, x: (want.x[0] + want.x[1]) / 2, z: want.row === 'fore' ? want.z[1] : want.z[0], label: want.name, end: false };
        return { I, x: t.x, z: t.z, label: name, end: true };
      }
      if (inRoom) return doorOut();
      return ring(seg, name);
    }
    // Off this deck: the nearest spoke. The ladder for the other deck of this drum, else the lift up to the hub.
    if (inRoom) return doorOut();
    const spokes = C.L.drum.spokes.segments;
    let best = spokes[0], bd = Infinity;
    for (const s of spokes) {
      const dk = Math.min((((s - d.seg) % S) + S) % S, (((d.seg - s) % S) + S) % S);
      if (dk < bd) (bd = dk), (best = s);
    }
    const ladder = tk && tk.hid === d.hid;
    const what = ladder ? `Ladder to the ${C.deckName(t.deck).split(', ')[1] ?? 'other deck'}` : 'Lift up to the hub';
    if (best !== d.seg) return ring(best, what);
    const at = ladder ? spots.ladder : spots.landing;
    return { I, x: at.x, z: at.z, label: what, end: false };
  }

  /** Each frame: `t` the career's target (or null), `mode`, the walk seat, the camera. */
  frame(t, mode, walk, camera) {
    const w = this.on && mode === 'walk' && t ? this.next(t, walk) : null;
    const pos = this.walker.pos;
    let show = !!w;
    if (w) {
      const dist = Math.hypot(w.x - pos.x, w.z - pos.z);
      if (w.end && dist < GUIDE.near) show = false;
      w.dist = dist;
    }
    if (!show) {
      this.mesh.visible = false;
      this.el.style.display = 'none';
      return;
    }
    if (this.mesh.parent !== w.I.group) w.I.group.add(this.mesh);
    const now = performance.now() / 1000;
    this.mesh.position.set(w.x, w.I.floorY + GUIDE.y + 0.06 * Math.sin(now * 2.4), w.z);
    this.mesh.rotation.y = now * 1.6;
    this.mesh.visible = true;
    // The pointer: on the diamond when it is in view, else at the screen's edge toward it.
    this.mesh.updateWorldMatrix(true, false);
    this.mesh.getWorldPosition(_v);
    _v.project(camera);
    const W = innerWidth, H = innerHeight, m = GUIDE.edge;
    const behind = _v.z > 1;
    let sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
    if (behind) (sx = W - sx), (sy = H - sy);
    const inView = !behind && sx > m && sx < W - m && sy > m && sy < H - m;
    let ang = 0;
    if (!inView) {
      // To the edge along the line from the middle.
      let dx = sx - W / 2, dy = sy - H / 2;
      if (behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
      sx = W / 2 + dx * k;
      sy = H / 2 + dy * k;
      ang = Math.atan2(dy, dx);
    }
    this.el.style.display = 'flex';
    this.arrow.style.display = inView ? 'none' : 'inline-block';
    this.arrow.style.transform = `rotate(${ang}rad)`;
    const txt = `${w.label} · ${Math.round(w.dist)} m`;
    if (this.text.textContent !== txt) this.text.textContent = txt;
    // Keep the label on the screen: right of the point on the left half, left of it on the right half.
    const left = sx > W / 2;
    this.el.style.flexDirection = left ? 'row-reverse' : 'row';
    this.el.style.transform = `translate(${left ? `calc(${sx}px - 100% + 9px)` : `${sx - 9}px`}, ${sy - (inView ? 28 : 9)}px)`;
  }
}

/** Where a kit of `kit` is kept in room `r`: the use nearest the room's middle, or null. */
export function kitIn(C, kit, r) {
  const I = C.interiorOf(r);
  const us = I?.interactables?.filter((u) => u.id.startsWith(`kit-${kit}-${r.id}`)) ?? [];
  if (!us.length) return null;
  const cx = (r.x[0] + r.x[1]) / 2, cz = (r.z[0] + r.z[1]) / 2;
  us.sort((a, b) => Math.hypot(a.pos.x - cx, a.pos.z - cz) - Math.hypot(b.pos.x - cx, b.pos.z - cz));
  return us[0].pos;
}

