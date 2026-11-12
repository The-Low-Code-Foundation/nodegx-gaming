// Moving a character (a circle on the floor) against the grid: walls, closed doors and cover push it out, so it slides
// along them. Pure maths over map.mjs.
import { CELL, walkable } from './map.mjs';

export function slide(grid, pos, dx, dz, radius) {
  pos.x += dx;
  pos.z += dz;
  for (let pass = 0; pass < 2; pass++) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    for (let z = cz - 1; z <= cz + 1; z++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (walkable(grid, x, z)) continue;
        // Nearest point of the cell box to the circle centre.
        const nx = Math.max(x * CELL, Math.min(pos.x, (x + 1) * CELL)), nz = Math.max(z * CELL, Math.min(pos.z, (z + 1) * CELL));
        const ox = pos.x - nx, oz = pos.z - nz;
        const d = Math.hypot(ox, oz);
        if (d >= radius) continue;
        if (d < 1e-4) {
          // Centre inside the box: push out along the shortest axis.
          const left = pos.x - x * CELL, right = (x + 1) * CELL - pos.x, top = pos.z - z * CELL, bottom = (z + 1) * CELL - pos.z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) pos.x -= left + radius;
          else if (m === right) pos.x += right + radius;
          else if (m === top) pos.z -= top + radius;
          else pos.z += bottom + radius;
        } else {
          pos.x += (ox / d) * (radius - d);
          pos.z += (oz / d) * (radius - d);
        }
      }
  }
}

// Turn an angle towards another, the short way, by at most `max`.
export function turnTo(yaw, target, max) {
  let d = target - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return yaw + Math.max(-max, Math.min(max, d));
}
export const angleDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
