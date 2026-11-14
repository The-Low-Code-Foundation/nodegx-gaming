// The cutaway: the ship seen from outside with its top sliced off at a deck, or split down its length, every
// compartment coloured by what it is for, the sealed machinery spaces shown, and a pin where you are standing.
//
// The cut is a clipping plane in the SHIP's frame, moved into the world every frame from the ship's own matrix, so it
// stays on the deck while the ship turns and flies. (The shipyard's cut is a fixed world plane, which only works for a
// ship parked level at the origin.) Each of the ship's materials carries the planes from the start; "no cut" moves
// them a kilometre away rather than taking them off, so no material ever recompiles.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SYSTEMS } from './layout.mjs';

const FAR = 1e6;
const _p = new THREE.Vector3();

export class Cutaway {
  constructor(C, camera, canvas, labelsEl) {
    this.C = C;
    this.camera = camera;
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.maxDistance = 1600;
    this.controls.minDistance = 20;
    this.levels = [
      { id: 'full', name: 'Whole ship' },
      ...C.L.decks.map((d) => ({ id: `deck-${d.id}`, name: d.name, cut: d.floor + 2.6, deck: d.id })),
      { id: 'section', name: 'Lengthwise section', section: true }
    ];
    this.level = 1;
    this.localH = new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR);
    this.localS = new THREE.Plane(new THREE.Vector3(-1, 0, 0), FAR);
    this.planes = [new THREE.Plane(), new THREE.Plane()];
    C.clipPlanes = this.planes; // for what comes aboard later (crew.mjs)
    const seen = new Set();
    C.obj.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (seen.has(m) || m.userData.uncut) continue; // `uncut`: drawn whole through the cut (damage.mjs's marker)
        seen.add(m);
        m.clippingPlanes = this.planes;
      }
    });
    this.updatePlanes();
    // The labels: one tag per compartment, shown for the compartments the cut passes through.
    this.labelsEl = labelsEl;
    this.tags = C.labels.map((l) => {
      const el = document.createElement('div');
      el.className = 'c-tag' + (l.c.access === 'sealed' ? ' sealed' : '');
      el.textContent = l.c.name;
      el.style.setProperty('--c', colourOf(l.c));
      labelsEl.appendChild(el);
      return { ...l, el };
    });
    this.pin = makePin();
    C.frame.add(this.pin);
    this.pin.visible = false;
    this.on = false;
  }

  enter() {
    const C = this.C;
    this.on = true;
    C.obj.updateMatrixWorld(true);
    const at = C.obj.getWorldPosition(new THREE.Vector3());
    this.last = at.clone();
    // Start above the starboard quarter, looking down at the ship.
    const off = new THREE.Vector3(170, 210, 170).applyQuaternion(C.obj.quaternion);
    this.camera.position.copy(at).add(off);
    this.camera.up.set(0, 1, 0).applyQuaternion(C.obj.quaternion);
    this.controls.target.copy(at);
    this.controls.enabled = true;
    this.controls.update();
    for (const m of C.hull) (m.material.side = THREE.DoubleSide), (m.material.needsUpdate = true);
    C.overlay.visible = true;
    this.labelsEl.hidden = false;
    this.pin.visible = true;
    this.setLevel(this.level);
  }

  exit() {
    this.on = false;
    this.controls.enabled = false;
    this.localH.constant = this.localS.constant = FAR;
    this.updatePlanes();
    for (const m of this.C.hull) (m.material.side = THREE.FrontSide), (m.material.needsUpdate = true);
    this.C.overlay.visible = false;
    this.labelsEl.hidden = true;
    this.pin.visible = false;
    this.camera.up.set(0, 1, 0);
  }

  setLevel(i) {
    this.level = Math.max(0, Math.min(this.levels.length - 1, i));
    const lv = this.levels[this.level];
    this.localH.constant = lv.cut ?? FAR;
    this.localS.constant = lv.section ? 0 : FAR;
    this.updatePlanes();
    return lv;
  }

  updatePlanes() {
    const f = this.C.frame;
    f.updateMatrixWorld(true);
    this.planes[0].copy(this.localH).applyMatrix4(f.matrixWorld);
    this.planes[1].copy(this.localS).applyMatrix4(f.matrixWorld);
  }

  /** Follows the ship (the camera and its target move with her, so she stays where you put her), re-cuts, re-labels.
   *  `you` is where you stand, in the ship's frame. */
  frame(dt, you) {
    const C = this.C;
    C.obj.updateMatrixWorld(true);
    const at = C.obj.getWorldPosition(_p);
    const d = at.clone().sub(this.last);
    this.camera.position.add(d);
    this.controls.target.add(d);
    this.last.copy(at);
    this.controls.update();
    this.updatePlanes();
    if (you) this.pin.position.copy(you);
    this.pin.rotation.y += dt * 1.5;
    // The pin keeps the same size on screen however far out you zoom.
    this.pin.scale.setScalar(Math.max(1, this.camera.position.distanceTo(this.controls.target) / 70));
    this.camera.updateMatrixWorld();
    const lv = this.levels[this.level];
    const w = this.labelsEl.clientWidth, h = this.labelsEl.clientHeight;
    for (const t of this.tags) {
      let show = false;
      if (lv.cut !== undefined) show = t.y0 <= lv.cut && t.y1 >= lv.cut - 0.5;
      else if (lv.section) show = t.c.access === 'sealed' || t.c.system === 'hangar' || t.c.id === 'bridge' || t.c.id === 'eng-control';
      if (show) {
        _p.copy(t.at);
        if (lv.section) _p.x = Math.min(_p.x, 0);
        C.frame.localToWorld(_p).project(this.camera);
        show = _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
        if (show) t.el.style.transform = `translate(${((_p.x + 1) / 2) * w}px, ${((1 - _p.y) / 2) * h}px) translate(-50%, -50%)`;
      }
      t.el.hidden = !show;
    }
  }
}

function colourOf(c) {
  return SYSTEMS[c.system]?.[0] ?? '#ffffff';
}

/** "You are here": a glowing pin standing on the deck, tall enough to see from a kilometre off. */
function makePin() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.5, 4), m);
  cone.rotation.x = Math.PI;
  cone.position.y = 5;
  g.add(cone);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), m);
  stem.position.y = 1.6;
  g.add(stem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 20), m);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.1;
  g.add(ring);
  return g;
}
