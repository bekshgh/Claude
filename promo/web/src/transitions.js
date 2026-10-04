import * as THREE from 'three';
import { BrickSet } from './bricks.js';
import { PALETTE, mulberry32, ease, clamp } from './util.js';
import { W, H } from './common.js';

// Brick-mosaic wipes rendered as an overlay after DOF. Studs face the camera.
const GW = 36, GH = 21; // grid in studs (slightly larger than the frame)

function packMosaic(rand) {
  const occ = Array.from({ length: GH }, () => new Array(GW).fill(false));
  const pieces = [];
  const shapes = [
    ['b2x4', 4, 2], ['b2x4', 2, 4], ['b2x2', 2, 2], ['b1x4', 4, 1], ['b1x4', 1, 4], ['b1x2', 2, 1], ['b1x2', 1, 2],
  ];
  const fits = (x, y, w, h) => {
    if (x + w > GW || y + h > GH) return false;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (occ[y + j][x + i]) return false;
    return true;
  };
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      if (occ[y][x]) continue;
      const order = shapes.slice().sort(() => rand() - 0.5);
      order.sort((a, b) => b[1] * b[2] - a[1] * a[2] + (rand() - 0.5) * 6);
      let placed = null;
      for (const s of order) if (fits(x, y, s[1], s[2])) { placed = s; break; }
      if (!placed) placed = ['b1x1', 1, 1];
      const [type, w, h] = placed;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) occ[y + j][x + i] = true;
      const r = rand();
      const color = r < 0.3 ? PALETTE.amber : r < 0.55 ? PALETTE.orange : r < 0.74 ? PALETTE.rust : r < 0.9 ? PALETTE.white : PALETTE.yellow;
      pieces.push({ type, w, h, cx: x + w / 2 - GW / 2, cy: y + h / 2 - GH / 2, rotZ: w >= h ? 0 : Math.PI / 2, color });
    }
  }
  return pieces;
}

export class BrickWipes {
  constructor(ctx, specs) {
    this.scene = new THREE.Scene();
    this.scene.environment = ctx.envMap;
    const hemi = new THREE.HemisphereLight(0xffe0b0, 0x5a1e0a, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(-12, 16, 30);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb04a, 1.4);
    rim.position.set(14, -10, 12);
    this.scene.add(rim);
    const fov = 28;
    this.camera = new THREE.PerspectiveCamera(fov, W / H, 1, 400);
    const D = (18.2 / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    this.camera.position.set(0, 0, D + 1.2);
    this.camera.lookAt(0, 0, 0);
    this.visible = false;
    this.wipes = specs.map((spec, k) => {
      const rand = mulberry32(100 + k * 17);
      const pieces = packMosaic(rand);
      const caps = {};
      for (const p of pieces) caps[p.type] = (caps[p.type] || 0) + 1;
      const set = new BrickSet(ctx.plastic, caps, { castShadow: false, receiveShadow: false });
      set.group.visible = false;
      this.scene.add(set.group);
      for (const p of pieces) {
        // order value s in [0,1] by pattern
        const nx = (p.cx + GW / 2) / GW, ny = (p.cy + GH / 2) / GH;
        let s;
        if (spec.pattern === 'ltr') s = nx;
        else if (spec.pattern === 'diag') s = (nx + (1 - ny)) / 2;
        else if (spec.pattern === 'rtl') s = 1 - nx;
        else s = Math.min(1, Math.hypot(nx - 0.5, (ny - 0.5) * (H / W)) / 0.58);
        p.s = clamp(s + (rand() - 0.5) * 0.08, 0, 1);
        p.jit = rand();
        p.spin = (rand() - 0.5) * 2;
        p.item = set.add(p.type, p.color, { pos: [p.cx, p.cy, 0], rot: [Math.PI / 2, 0, p.rotZ, 'ZXY'] });
      }
      return { spec, set, pieces };
    });
  }

  // Pieces land between tc-0.17 and tc-0.01, leave between tc+0.01 and tc+0.24.
  events() {
    const ev = [];
    for (const w of this.wipes) {
      const tc = w.spec.t;
      ev.push({ t: tc - 0.2, type: 'whoosh', dur: 0.45, id: 'wipe' });
      const lands = w.pieces.map((p) => this.landTime(tc, p)).sort((a, b) => a - b);
      for (const t of lands) ev.push({ t, type: 'snap', soft: true, id: 'wipe' });
      ev.push({ t: tc + 0.02, type: 'pop', id: 'wipe' });
    }
    return ev;
  }

  landTime(tc, p) {
    return tc - 0.17 + p.s * 0.12 + p.jit * 0.02 + 0.03;
  }

  // returns true if the screen is fully covered at time t (for scene switching checks)
  update(t) {
    let any = false;
    for (const w of this.wipes) {
      const tc = w.spec.t;
      const active = t > tc - 0.22 && t < tc + 0.32;
      w.set.group.visible = active;
      if (!active) continue;
      any = true;
      const dirX = w.spec.pattern === 'rtl' ? -1 : 1;
      for (const p of w.pieces) {
        const tl = this.landTime(tc, p);
        const tIn = tl - 0.07;
        const tOut = tc + 0.012 + p.s * 0.13 + p.jit * 0.025;
        let z = 0, sc = 1, rx = Math.PI / 2, ry = 0, rz = p.rotZ, x = p.cx, y = p.cy;
        if (t < tIn) {
          sc = 0;
        } else if (t < tl) {
          const u = (t - tIn) / (tl - tIn);
          const e = ease.inQuad(u);
          z = 9 * (1 - e);
          rz += p.spin * 0.45 * (1 - e);
          x -= dirX * 1.6 * (1 - e);
        } else if (t < tOut) {
          const d = t - tl;
          const sq = Math.exp(-d * 30) * Math.cos(d * 70);
          sc = [1 + 0.1 * sq, 1 + 0.1 * sq, 1 - 0.3 * sq];
        } else {
          const u = clamp((t - tOut) / 0.12);
          const e = ease.inCubic(u);
          z = 14 * e;
          x += dirX * 9 * e + p.spin * 2 * e;
          y += (p.cy * 0.35 + 2.5) * e;
          rx += p.spin * 2.2 * e;
          ry += p.spin * 1.5 * e;
          sc = 1 - 0.6 * e;
          if (u >= 1) sc = 0;
        }
        w.set.write(p.item, [x, y, z], [rx, ry, rz, 'ZXY'], sc);
      }
      w.set.commit();
    }
    this.visible = any;
    return any;
  }
}
