// The sets' palette (`P`) and their shared parts: couches, desks, racks, lockers, mess tables, shelves, and `place`.

import * as THREE from 'three';
import { box, cyl, at, mat, glow, mulberry } from '../../util.mjs';
import { screen } from '../../decor.mjs';

// --- the palette and the parts ---------------------------------------------------------------------------------------

export const P = {
  steel: mat('#5b626c'), dark: mat('#2a2f36'), black: mat('#15181d'), grey: mat('#7a828c'), light: mat('#a4abb3'),
  stainless: mat('#98a0a8'), stainlessDk: mat('#6f7882'), white: mat('#dde2e8'), sheet: mat('#c9c4b6'),
  pad: mat('#3b4654'), padLight: mat('#55606e'), blanket: mat('#4d6a86'), blanket2: mat('#6a5a3e'), pillow: mat('#d0d4d6'),
  curtain: mat('#2a3c4e'), red: mat('#a8322c'), yellow: mat('#d8a530'), green: mat('#3f8a4a'), blue: mat('#3a6ea8'),
  orange: mat('#c8662a'), brown: mat('#7a5a3a'), teal: mat('#3f8f8a'), rubber: mat('#202328'), cable: mat('#1c1e22'),
  cableG: mat('#4a5058'), cableO: mat('#b8642a'), crate: mat('#6a6248'), olive: mat('#4f5a46'), table: mat('#454d57'),
  tableTop: mat('#4e5661'), laminate: mat('#5b4535'), chrome: mat('#c8ced4')
};
export const G = (...parts) => {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
};
/** A horizontal cylinder along x (`ax` 'x') or z. */
export const rod = (r, len, m, ax = 'x', seg = 8) => {
  const c = cyl(r, r, len, m, seg);
  if (ax === 'x') c.rotation.z = Math.PI / 2;
  else c.rotation.x = Math.PI / 2;
  return G(c); // in a group of its own, so `at` can place it without undoing the turn
};

/** An acceleration couch: a gimballed shell on a post, padded, its front toward -z like `Interior.seat`, the seat at
 *  the same height so a seated crew member sits in it. */
export function couch(color = P.pad, { low = false } = {}) {
  const g = new THREE.Group();
  g.add(at(cyl(0.16, 0.24, 0.08, P.dark, 10), 0, 0.04, 0));
  g.add(at(cyl(0.07, 0.07, 0.3, P.steel, 8), 0, 0.2, 0));
  g.add(at(box(0.5, 0.06, 0.12, P.steel), 0, 0.34, 0)); // the gimbal yoke
  g.add(at(box(0.66, 0.1, 0.62, P.dark), 0, 0.4, 0));
  g.add(at(box(0.58, 0.08, 0.56, color), 0, 0.48, -0.01));
  const back = new THREE.Group();
  back.position.set(0, 0.44, 0.3);
  back.rotation.x = 0.22;
  const bh = low ? 0.55 : 0.98;
  back.add(at(box(0.66, bh, 0.1, P.dark), 0, bh / 2, 0.05));
  back.add(at(box(0.56, bh - 0.08, 0.08, color), 0, bh / 2, -0.02));
  for (const s of [-1, 1]) back.add(at(box(0.08, bh * 0.7, 0.16, color), s * 0.3, bh * 0.45, -0.06)); // side bolsters
  if (!low) back.add(at(box(0.4, 0.2, 0.12, color), 0, bh + 0.1, -0.01), at(box(0.06, 0.24, 0.16, P.dark), -0.24, bh + 0.08, 0), at(box(0.06, 0.24, 0.16, P.dark), 0.24, bh + 0.08, 0));
  g.add(back);
  for (const s of [-1, 1]) {
    g.add(at(box(0.08, 0.06, 0.5, P.dark), s * 0.36, 0.66, 0.02));
    g.add(at(box(0.06, 0.18, 0.06, P.dark), s * 0.36, 0.56, 0.22));
  }
  g.add(at(box(0.07, 0.015, 0.12, glow('#3a8ad0', 0.9)), 0.36, 0.7, -0.12)); // the armrest's pad
  // the harness: two straps over the back
  for (const s of [-0.12, 0.12]) g.add(at(box(0.05, 0.6, 0.012, P.black), s, 0.95, 0.27, 0.22, 0, 0));
  return g;
}

/** A console desk: a sloped key panel and two or three screens on a bezel, a lit edge, a recess for knees. Whoever uses
 *  it stands or sits on its +z side (like `Interior.console`). */
export function desk(w = 2.2, color = '#58b0ff', kinds = ['status', 'nav'], { low = false } = {}) {
  const g = new THREE.Group();
  g.add(at(box(w, 0.72, 0.42, P.dark), 0, 0.36, -0.2));
  g.add(at(box(w, 0.06, 0.08, P.black), 0, 0.03, 0.06)); // toe kick
  g.add(at(box(w + 0.04, 0.05, 0.62, mat('#2b3442')), 0, 0.75, -0.04, 0.12, 0, 0)); // the key panel, sloped toward you
  g.add(at(box(w - 0.3, 0.012, 0.22, glow('#14263a')), 0, 0.79, 0.02, 0.12, 0, 0));
  const r = mulberry(Math.round(w * 100) + color.length);
  for (let i = 0; i < Math.floor(w * 5); i++) {
    const c = r() < 0.15 ? '#ffb347' : r() < 0.3 ? '#39d27a' : color;
    g.add(at(box(0.05, 0.012, 0.04, glow(c, 0.9)), -w / 2 + 0.2 + r() * (w - 0.4), 0.8, -0.05 + r() * 0.12, 0.12, 0, 0));
  }
  g.add(at(box(w, 0.025, 0.025, glow(color, 0.8)), 0, 0.77, 0.27));
  // the screens on a bezel (`low`: laid back and lower, to keep a view over them, as at the helm)
  const n = kinds.length, sw = Math.min(0.9, (w - 0.2) / n - 0.06);
  const sy = low ? 0.98 : 1.15, tilt = low ? -0.75 : -0.2, sh = low ? 0.36 : 0.46;
  g.add(at(box(w - 0.1, sh + 0.16, 0.08, P.black), 0, sy - 0.01, -0.34, tilt, 0, 0));
  kinds.forEach((k, i) => {
    const x = -((n - 1) / 2) * (sw + 0.06) + i * (sw + 0.06);
    g.add(at(screen(k, color, sw, sh), x, sy, -0.29, tilt, 0, 0));
  });
  g.add(at(box(w - 0.1, 0.04, 0.12, P.dark), 0, sy + sh / 2 + 0.08 * (low ? 0.5 : 1), -0.38, tilt, 0, 0));
  return g;
}

/** Three berths stacked, a frame round them, each with its mattress, blanket and pillow, a reading lamp and a curtain
 *  drawn part way. Long along x, open toward +z. `seed` picks how each is left. */
export function rack(seed, { levels = 3 } = {}) {
  const r = mulberry(seed);
  const g = new THREE.Group();
  const L = 2.1, D = 0.86, top = 2.3;
  for (const s of [-1, 1]) g.add(at(box(0.06, top, D, P.steel), s * (L / 2 + 0.03), top / 2, 0)); // end panels
  g.add(at(box(L + 0.12, 0.05, D, P.steel), 0, top, 0));
  g.add(at(box(L, top - 0.1, 0.03, P.grey), 0, top / 2, -D / 2 + 0.015)); // the back
  const ys = levels === 3 ? [0.22, 0.95, 1.62] : [0.3, 1.25];
  ys.forEach((y, i) => {
    g.add(at(box(L, 0.06, D, P.dark), 0, y, 0)); // the pan
    g.add(at(box(L - 0.06, 0.12, D - 0.06, P.sheet), 0, y + 0.09, 0)); // mattress
    const made = r() < 0.6;
    const blk = r() < 0.5 ? P.blanket : P.blanket2;
    g.add(at(box(made ? L * 0.7 : L * 0.45, 0.04, D - 0.04, blk), made ? 0.28 : 0.4 + r() * 0.1, y + 0.17, made ? 0 : 0.08 * (r() - 0.5), 0, made ? 0 : (r() - 0.5) * 0.4, 0));
    g.add(at(box(0.4, 0.09, 0.5, P.pillow), -L / 2 + 0.28, y + 0.19, -0.05));
    g.add(at(box(L, 0.03, 0.03, P.steel), 0, y + 0.3, D / 2 - 0.02)); // the rail
    g.add(at(box(0.16, 0.05, 0.08, glow(r() < 0.5 ? '#ffe2b0' : '#3a3428')), -L / 2 + 0.1, y + (i === ys.length - 1 ? top - y - 0.1 : ys[i + 1] - y - 0.12), -D / 2 + 0.1));
    g.add(at(box(0.4, 0.22, 0.06, P.dark), L / 2 - 0.3, y + 0.42, -D / 2 + 0.06)); // a shelf box
    // the curtain: a sheet hanging from the next berth's pan, pulled part way across
    const shut = r();
    if (shut > 0.25) {
      const cw = L * Math.min(0.95, shut);
      const hh = (i === ys.length - 1 ? top : ys[i + 1]) - y - 0.1;
      g.add(at(box(cw, hh, 0.02, P.curtain), -L / 2 + cw / 2, y + 0.06 + hh / 2, D / 2 + 0.01));
    }
  });
  g.add(at(box(L + 0.12, 0.03, 0.03, P.grey), 0, top - 0.05, D / 2 + 0.03)); // the curtain track
  return g;
}

/** A tall double locker with vents, handles and a name card. Front toward +z. */
export function locker(w = 0.6) {
  const g = new THREE.Group();
  g.add(at(box(w, 1.95, 0.5, mat('#4a5a6e')), 0, 0.975, 0));
  g.add(at(box(0.012, 1.85, 0.01, P.black), 0, 0.98, 0.255));
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) g.add(at(box(w * 0.3, 0.02, 0.01, P.black), s * w * 0.24, 1.72 - k * 0.05, 0.255));
    g.add(at(box(0.02, 0.18, 0.03, P.chrome), s * 0.05, 1.0, 0.27));
    g.add(at(box(w * 0.28, 0.06, 0.01, P.sheet), s * w * 0.24, 1.45, 0.256));
  }
  return g;
}

/** A mess table bolted to the deck with stools either side: `n` a side, long along x. `top` is the tabletop's material. */
export function messTable(len, n, { stoolMat = P.steel, top = P.tableTop } = {}) {
  const g = new THREE.Group();
  g.add(at(box(len, 0.05, 0.9, top), 0, 0.74, 0));
  g.add(at(box(len, 0.04, 0.03, P.stainlessDk), 0, 0.775, 0.44), at(box(len, 0.04, 0.03, P.stainlessDk), 0, 0.775, -0.44)); // the fiddle
  g.add(at(box(len - 0.3, 0.06, 0.4, P.table), 0, 0.68, 0));
  for (const s of [-1, 1]) g.add(at(cyl(0.06, 0.08, 0.7, P.dark, 8), s * (len / 2 - 0.5), 0.35, 0), at(box(0.5, 0.03, 0.5, P.dark), s * (len / 2 - 0.5), 0.015, 0));
  g.userData.spots = []; // where someone sits (hands.mjs): each stool, facing the table
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n;
    g.add(at(cyl(0.035, 0.035, 0.44, P.dark, 6), x, 0.22, side * 0.72));
    g.add(at(cyl(0.19, 0.19, 0.06, stoolMat, 12), x, 0.46, side * 0.72));
    g.userData.spots.push({ x, z: side * 0.72, yaw: side > 0 ? 0 : Math.PI, pose: 'sitChair' });
  }
  // what is on it: a cruet, a stack of trays, mugs
  g.add(at(box(0.22, 0.12, 0.12, P.dark), 0, 0.83, 0));
  g.add(at(cyl(0.025, 0.025, 0.14, P.red, 6), -0.05, 0.84, 0), at(cyl(0.025, 0.025, 0.14, P.white, 6), 0.05, 0.84, 0));
  return g;
}

/** A rack of shelves with gear on it. Long along x, front +z. */
export function shelfRack(seed, w = 1.9, items = [P.crate, P.olive, P.brown, P.white]) {
  const r = mulberry(seed);
  const g = new THREE.Group();
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) for (const z of [-0.25, 0.25]) g.add(at(box(0.04, 2.1, 0.04, P.steel), x, 1.05, z));
  for (const y of [0.1, 0.8, 1.45, 2.05]) {
    g.add(at(box(w, 0.03, 0.56, P.steel), 0, y, 0));
    if (y > 2) continue;
    let x = -w / 2 + 0.1;
    while (x < w / 2 - 0.25) {
      const bw = 0.2 + r() * 0.45, bh = 0.15 + r() * 0.4;
      if (x + bw > w / 2 - 0.08) break;
      if (r() < 0.85) g.add(at(box(bw, bh, 0.3 + r() * 0.18, items[Math.floor(r() * items.length)]), x + bw / 2, y + 0.015 + bh / 2, 0));
      x += bw + 0.04;
    }
    g.add(at(box(w, 0.02, 0.02, P.yellow), 0, y + 0.2, 0.27)); // the fiddle bar that keeps it on the shelf under thrust
  }
  return g;
}

/** `Interior.prop` with the turn as its own argument: place(I, mesh, x, z, ry, opts), or place(I, mesh, x, z, opts). */
export const place = (I, mesh, x, z, ry = 0, opts = {}) => {
  if (typeof ry === 'object') (opts = ry), (ry = opts.ry ?? 0);
  return I.prop(mesh, x, z, { ...opts, ry });
};
