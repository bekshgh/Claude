// Helpers that turn voxel footprints into real brick placements.
import { BRICK_H } from './bricks.js';

const SHAPES = [
  // [type, lenX, lenZ]
  ['b2x4', 4, 2], ['b2x4r', 2, 4], ['b2x2', 2, 2], ['b1x4', 4, 1], ['b1x4r', 1, 4],
  ['b1x2', 2, 1], ['b1x2r', 1, 2], ['b1x1', 1, 1],
];

// Pack one course (set of occupied integer cells "x,z") with bricks.
// parity alternates orientation preference so courses interlock.
export function packCourse(cells, parity, rand = Math.random, prefer = null) {
  const occ = new Set(cells);
  const out = [];
  const keys = [...occ].map((k) => k.split(',').map(Number));
  keys.sort((a, b) => (parity % 2 ? a[0] - b[0] || a[1] - b[1] : a[1] - b[1] || a[0] - b[0]));
  const order = parity % 2
    ? ['b2x4r', 'b2x4', 'b2x2', 'b1x4r', 'b1x4', 'b1x2r', 'b1x2', 'b1x1']
    : ['b2x4', 'b2x4r', 'b2x2', 'b1x4', 'b1x4r', 'b1x2', 'b1x2r', 'b1x1'];
  const shapes = Object.fromEntries(SHAPES.map((s) => [s[0], s]));
  for (const [x, z] of keys) {
    if (!occ.has(`${x},${z}`)) continue;
    let placed = false;
    const tryOrder = prefer ? prefer : order;
    for (const name of tryOrder) {
      const [, lx, lz] = shapes[name];
      if (rand() < 0.18 && name.startsWith('b2x4')) continue; // variety
      let ok = true;
      for (let i = 0; i < lx && ok; i++) for (let j = 0; j < lz && ok; j++) if (!occ.has(`${x + i},${z + j}`)) ok = false;
      if (!ok) continue;
      for (let i = 0; i < lx; i++) for (let j = 0; j < lz; j++) occ.delete(`${x + i},${z + j}`);
      const rotated = name.endsWith('r');
      out.push({ type: rotated ? name.slice(0, -1) : name, x: x + lx / 2, z: z + lz / 2, rotY: rotated ? Math.PI / 2 : 0 });
      placed = true;
      break;
    }
    if (!placed) {
      occ.delete(`${x},${z}`);
      out.push({ type: 'b1x1', x: x + 0.5, z: z + 0.5, rotY: 0 });
    }
  }
  return out;
}

// Height map (in brick courses) -> placements with y.
// heightAt(x, z) returns integer number of courses at cell (x,z).
export function packHeightMap(x0, x1, z0, z1, heightAt, rand, y0 = 0) {
  let maxH = 0;
  for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) maxH = Math.max(maxH, heightAt(x, z));
  const all = [];
  for (let k = 0; k < maxH; k++) {
    const cells = [];
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) if (heightAt(x, z) > k) cells.push(`${x},${z}`);
    for (const p of packCourse(cells, k, rand)) all.push({ ...p, y: y0 + k * BRICK_H, course: k });
  }
  return all;
}

// Vertical wall in the x-y plane (depth d studs) from a 2D mask(x, row) -> placements.
export function packWall(cols, rows, mask, depth, rand, z = 0) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let x = 0;
    const offset = r % 2;
    while (x < cols) {
      if (!mask(x, r)) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < cols && mask(x + len, r) && len < 4) len++;
      if (len === 3) len = 2;
      if (offset && len === 4 && x === 0) len = 2;
      if (len === 4 && rand() < 0.3) len = 2;
      const type = depth === 2 ? (len === 4 ? 'b2x4' : len === 2 ? 'b2x2' : 'b1x1') : len === 4 ? 'b1x4' : len === 2 ? 'b1x2' : 'b1x1';
      if (depth === 2 && len === 1) {
        out.push({ type: 'b1x1', x: x + 0.5, z: z - 0.5, y: r * BRICK_H, row: r });
        out.push({ type: 'b1x1', x: x + 0.5, z: z + 0.5, y: r * BRICK_H, row: r });
      } else {
        out.push({ type, x: x + len / 2, z, y: r * BRICK_H, row: r });
      }
      x += len;
    }
  }
  return out;
}
