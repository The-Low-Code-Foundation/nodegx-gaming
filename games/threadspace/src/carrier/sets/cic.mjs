// The combat information centre, built as a set (sets.mjs `SETS`).

import * as THREE from 'three';
import { box, at, glow } from '../../util.mjs';
import { P, G, couch, desk, place } from './parts.mjs';
import { poster, wallScreen } from './paper.mjs';

export function cic(C, I, c) {
  const [x1, x2] = c.x, [z1, z2] = c.z, y = I.floorY;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  // The plot: a dark table with a lit chart in its top, and the picture standing over it (setsFrame turns it).
  const tx = cx + 0.6, tw = 2.6, td = 5.4;
  place(I, G(at(box(tw, 0.86, td, P.dark), 0, 0.43, 0), at(box(tw + 0.16, 0.06, td + 0.16, P.black), 0, 0.89, 0)), tx, cz);
  const chart = C.atlas.plane(tw - 0.2, td - 0.2, (g, pw, ph) => {
    g.fillStyle = '#031018';
    g.fillRect(0, 0, pw, ph);
    g.strokeStyle = 'rgba(80,170,255,0.35)';
    g.lineWidth = 1;
    for (let x = 0; x < pw; x += pw / 10) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, ph), g.stroke());
    for (let yy = 0; yy < ph; yy += pw / 10) (g.beginPath(), g.moveTo(0, yy), g.lineTo(pw, yy), g.stroke());
    g.strokeStyle = 'rgba(120,200,255,0.8)';
    g.lineWidth = 2;
    for (const k of [0.15, 0.3, 0.45]) (g.beginPath(), g.arc(pw / 2, ph / 2, pw * k, 0, Math.PI * 2), g.stroke());
    g.fillStyle = '#ff6a50';
    for (const [u, v] of [[0.2, 0.15], [0.8, 0.3], [0.7, 0.8]]) g.fillRect(u * pw - 4, v * ph - 4, 8, 8);
    g.fillStyle = '#39d27a';
    g.fillRect(pw / 2 - 5, ph / 2 - 10, 10, 20);
  }, 90);
  I.group.add(at(chart, tx, y + 0.925, cz, -Math.PI / 2, 0, 0));
  const holo = new THREE.Group();
  holo.userData.live = true;
  const lm = new THREE.LineBasicMaterial({ color: '#4fb8ff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  holo.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.9, 1)), lm));
  const ring = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TorusGeometry(1.1, 0.002, 2, 48)), lm);
  ring.rotation.x = Math.PI / 2;
  holo.add(ring);
  const dot = (color, x, yy, z, s = 0.06) => holo.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(s), glow(color)), x, yy, z));
  dot('#39d27a', 0, 0, 0, 0.09);
  dot('#ff6a50', 0.7, 0.3, -0.4);
  dot('#ff6a50', -0.5, -0.2, 0.6);
  dot('#ffb347', 0.2, 0.6, 0.5, 0.05);
  holo.position.set(tx, y + 1.85, cz);
  I.group.add(holo);
  (C.anim ??= []).push((dt) => (holo.rotation.y += dt * 0.15));
  // Consoles round the walls with couches, clear of the doors and the plotter's place.
  place(I, desk(2.0, '#58b0ff', ['radar', 'target']), x1 + 0.5, z1 + 2.2, { ry: Math.PI / 2 });
  place(I, couch(P.pad, { low: true }), x1 + 1.45, z1 + 2.2, { ry: Math.PI / 2 });
  place(I, desk(2.0, '#58b0ff', ['nav', 'status']), x1 + 0.5, z2 - 2.2, { ry: Math.PI / 2 });
  place(I, couch(P.pad, { low: true }), x1 + 1.45, z2 - 2.2, { ry: Math.PI / 2 });
  place(I, desk(1.8, '#ff6a50', ['target', 'status']), x2 - 0.5, z1 + 2.6, { ry: -Math.PI / 2 });
  place(I, desk(1.8, '#ffb347', ['status', 'radar']), x2 - 0.5, z2 - 2.0, { ry: -Math.PI / 2 });
  // The forward bulkhead: the tactical picture, beside the door.
  wallScreen(I, 'radar', x1 + 1.9, 1.9, z1 + 0.14, 0, '#58b0ff', 2.6, 1.4);
  I.group.add(at(box(2.8, 1.6, 0.06, P.black), x1 + 1.9, y + 1.9, z1 + 0.11));
  for (const z of [cz - 2.5, cz + 2.5]) wallScreen(I, 'map', x1 + 0.15, 2.2, z, Math.PI / 2, '#58b0ff', 1.6, 0.6);
  poster(C, I, 'loose', 0.8, 0.5, x2 - 0.12, 1.7, cz - 1.6, -Math.PI / 2);
}
