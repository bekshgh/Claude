import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow, toScreen } from '../common.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, lerp, clamp, mulberry32 } from '../util.js';

// 12.5-15.0s: hundreds of bricks fly in and assemble a huge white-and-amber
// light bulb with a sunburst crown; it switches on, golden light floods the
// world, the engineers cheer in silhouette, calm glowing hold for a logo.
export function buildFinale(ctx) {
  const T0 = 12.5, T1 = 15.0;
  const st = makeStage(ctx, {
    fov: 34, groundColor: 0x7a2a0e, groundRect: [-40, 40, -10, 40], sunRadius: 0.3,
    capacity: { b1x1: 160, b1x2: 200, b1x4: 40, t1x2: 40, b2x4: 12, b2x2: 8 },
  });
  const B = st.bricks;
  const rand = mulberry32(2024);
  const GC = 17; // globe centre row
  const GR = 8.6;

  // ---- bulb mask ----
  const cells = new Map();
  const put = (x, y, kind) => cells.set(`${x},${y}`, { x, y, kind });
  for (let y = 0; y <= 30; y++) {
    for (let x = -10; x <= 10; x++) {
      const d = Math.hypot(x, y - GC);
      if (d <= GR) put(x, y, d > GR - 1.15 ? 'ring' : 'glass');
      else if (y >= 4 && y <= 8 && Math.abs(x) <= 3) put(x, y, y % 2 ? 'threadA' : 'threadB');
      else if (y >= 2 && y <= 3 && Math.abs(x) <= 1) put(x, y, 'tip');
    }
  }
  const fil = [[-2, 10], [-2, 11], [-2, 12], [-2, 13], [2, 10], [2, 11], [2, 12], [2, 13], [-3, 14], [-2, 15], [-1, 14], [0, 15], [1, 14], [2, 15], [3, 14]];
  for (const [x, y] of fil) if (cells.has(`${x},${y}`)) cells.get(`${x},${y}`).kind = 'filament';
  const colorOf = { glass: PALETTE.white, ring: PALETTE.amber, threadA: PALETTE.amber, threadB: PALETTE.orange, tip: PALETTE.rust, filament: PALETTE.yellow };
  // pack each row into runs of equal kind, mostly 1x2 with some 1x1/1x4
  const pieces = [];
  for (let y = 0; y <= 30; y++) {
    let x = -10;
    while (x <= 10) {
      const c = cells.get(`${x},${y}`);
      if (!c) { x++; continue; }
      let run = 1;
      while (run < 4 && cells.get(`${x + run},${y}`)?.kind === c.kind) run++;
      let len = run >= 4 && rand() < 0.25 ? 4 : run >= 2 ? (rand() < 0.82 ? 2 : 1) : 1;
      const type = len === 4 ? 'b1x4' : len === 2 ? 'b1x2' : 'b1x1';
      pieces.push({ type, kind: c.kind, tx: x + (len - 1) / 2, ty: y, rotZ: 0, color: colorOf[c.kind] });
      x += len;
    }
  }
  // sunburst crown: tiles along rays above the globe
  for (let k = 0; k < 9; k++) {
    const th = THREE.MathUtils.degToRad(-72 + 18 * k);
    const n = k % 2 === 0 ? 3 : 2;
    for (let j = 0; j < n; j++) {
      const r = 10.3 + j * 1.6;
      pieces.push({
        type: 't1x2', kind: 'ray', tx: Math.sin(th) * r, ty: GC + Math.cos(th) * r, rotZ: Math.PI / 2 - th,
        color: j === 0 ? PALETTE.yellow : PALETTE.amber,
      });
    }
  }
  const BY = 1.0; // world y of row 0
  pieces.forEach((p) => {
    p.target = [p.tx, BY + p.ty, 0];
    const ang = Math.atan2(p.ty - 14, p.tx) + (rand() - 0.5) * 1.6;
    const dist = 46 + rand() * 30;
    p.from = [p.tx + Math.cos(ang) * dist, BY + p.ty + Math.sin(ang) * dist * 0.7, (rand() - 0.35) * 46];
    const mid = [(p.from[0] + p.target[0]) / 2, (p.from[1] + p.target[1]) / 2, (p.from[2] + p.target[2]) / 2];
    p.ctrl = [mid[0] + (rand() - 0.5) * 22, mid[1] + (rand() - 0.5) * 22, mid[2] + (rand() - 0.5) * 18];
    const order = clamp((p.ty - 1) / 31 * 0.82 + rand() * 0.16 + (p.kind === 'ray' ? 0.12 : 0), 0, 1);
    p.tArr = 12.6 + 0.84 * order;
    p.dur = 0.36 + rand() * 0.14;
    p.spin = [(rand() - 0.5) * 9, (rand() - 0.5) * 9, (rand() - 0.5) * 9];
    p.item = B.add(p.type, p.color, { pos: p.from, rot: [Math.PI / 2, 0, p.rotZ, 'ZXY'], scale: 0 });
  });
  // pedestal under the bulb tip
  B.add('b2x4', PALETTE.rust, { pos: [0, 0, 0], rot: [0, 0, 0] });
  B.add('b2x2', PALETTE.orange, { pos: [0, 1.2, 0], rot: [0, 0, 0] });
  const T_ON = 13.5;

  // ---- engineers in silhouette at the bottom ----
  const team = [['eng1', -9.5, 21], ['eng2', -4.8, 22.5], ['eng3', 0.3, 21.5], ['eng4', 5.0, 22.5], ['eng5', 9.6, 21]].map(([k, x, z], i) => {
    const p = addPuppet(st, ctx, k, { shadow: false });
    p.root.position.set(x, 0, z);
    p.home = [x, 0, z];
    p.i = i;
    return p;
  });
  const bulbLight = new THREE.PointLight(0xffc070, 0, 90, 1.2);
  bulbLight.position.set(0, BY + GC, 4);
  st.scene.add(bulbLight);
  const core = addGlow(st, { color: [1.0, 0.86, 0.6], size: 24, depthTest: false });
  const halo = addGlow(st, { color: [1.0, 0.62, 0.25], size: 50, depthTest: false });

  const events = [
    { t: 12.5, type: 'riser', dur: 1.0 },
    ...pieces.map((p) => ({ t: p.tArr, type: 'snap', id: 'bulb', fast: true })),
    { t: T_ON, type: 'switchOn' },
    { t: T_ON + 0.02, type: 'chime' },
    { t: T_ON + 0.05, type: 'swell', dur: 1.4 },
    { t: 13.62, type: 'cheer', id: 'team' },
    { t: 14.5, type: 'stinger' },
  ];

  const camPos = track([[12.5, [0, 7.6, 66]], [13.45, [0, 7.8, 64], ease.outQuad], [13.6, [0, 7.9, 62.5], ease.outExpo], [15.0, [0, 8.1, 59.5], ease.inOutSine]]);
  const camTgt = track([[12.5, [0, 15.2, 0]], [15.0, [0, 15.4, 0]]]);
  const v = new THREE.Vector3();

  function update(t) {
    const tiltIn = 1 - ease.outCubic(seg(t, 12.5, 12.64));
    const shake = 0.18 * wobble(t - T_ON, 8, 7);
    const cp = camPos(t), ct = camTgt(t);
    lookAt(st.camera, [cp[0], cp[1], cp[2]], [ct[0], ct[1] + tiltIn * 9 + shake, ct[2]], 0);
    st.camera.fov = 34;
    st.camera.updateProjectionMatrix();
    st.sky.dir.set(0, BY + GC, -10).sub(st.camera.position).normalize();

    const on = t < T_ON ? 0 : t < T_ON + 0.05 ? 1 : t < T_ON + 0.09 ? 0.25 : clamp((t - T_ON - 0.09) / 0.1 + 0.5);
    const glowK = on * (1 + 0.8 * Math.exp(-(t - T_ON) * 3));
    // pieces fly in along curved paths, spin settles, snap with squash
    for (const p of pieces) {
      const t0 = p.tArr - p.dur;
      let pos, rot = [Math.PI / 2, 0, p.rotZ, 'ZXY'], sc = 1;
      if (t < t0) { sc = 0; pos = p.from; }
      else if (t < p.tArr) {
        const u = ease.outCubic(seg(t, t0, p.tArr));
        const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        pos = [0, 1, 2].map((i) => a * p.from[i] + b * p.ctrl[i] + c * p.target[i]);
        const r = 1 - u;
        rot = [Math.PI / 2 + p.spin[0] * r, p.spin[1] * r, p.rotZ + p.spin[2] * r, 'ZXY'];
        sc = 0.6 + 0.4 * ease.outCubic(seg(t, t0, t0 + 0.1));
      } else {
        pos = p.target;
        const d = t - p.tArr;
        const sq = Math.exp(-d * 26) * Math.cos(d * 55);
        sc = [1 + 0.12 * sq, 1 + 0.12 * sq, 1 - 0.35 * sq];
      }
      const em = { glass: 0.3, ring: 0.2, filament: 1.1, ray: 0.5, threadA: 0.04, threadB: 0.04, tip: 0.0 }[p.kind] * glowK;
      B.write(p.item, pos, rot, sc, em);
    }

    // golden flood after switch-on
    const flood = ease.outCubic(seg(t, T_ON, T_ON + 0.5));
    const calm = ease.inOutSine(seg(t, 14.1, 14.9));
    st.sky.angRadius = lerp(0.15, 0.17, flood);
    st.sky.u.uDisc.value = 0.85;
    st.sky.u.uIntensity.value = lerp(0.8, 1.0, flood);
    st.sky.u.uHalo.value = lerp(0.3, 0.55, flood);
    st.sky.u.uRays.value = lerp(0.08, 0.6, flood) * (1 - 0.3 * calm);
    st.sky.u.uRayLen.value = lerp(0.8, 2.2, flood);
    st.sky.u.uRayRot.value = 0.4 + (t - T0) * 0.18 + 0.9 * ease.outCubic(seg(t, T_ON, T_ON + 0.9));
    st.sky.su.uExposure.value = lerp(0.85, 1.08, flood);
    st.sky.su.uGlow.value = lerp(0.15, 0.32, flood);
    bulbLight.intensity = 450 * on * (1 + 0.5 * Math.exp(-(t - T_ON) * 3));
    st.lights.aim([0, 8, 0], [-0.3, 0.7, 1], [0, 0.4, -1], 34);
    st.lights.key.intensity = lerp(1.6, 0.6, flood);
    st.lights.rim.intensity = lerp(2.4, 5.0, flood);
    st.lights.hemi.intensity = lerp(0.45, 0.65, flood);

    // engineers: lit figures before switch-on, cheering silhouettes after
    for (const p of team) {
      const st0 = T_ON + 0.08 + p.i * 0.06;
      const per = 0.5;
      const ph = t > st0 ? ((t - st0) % per) / per : 0;
      const hop = t > st0 ? Math.sin(ph * Math.PI) * (1 - 0.6 * calm) : 0;
      p.root.position.set(p.home[0], 0.75 * hop, p.home[2]);
      p.shape(1 - 0.04 * hop, 1 + 0.08 * hop, 5 * Math.sin((t - T0) * 6 + p.i));
      const up = ease.outBack(seg(t, st0, st0 + 0.2));
      p.rot('armL', -45 * up - 15 * hop);
      p.rot('armR', 85 * up + 15 * hop);
      p.rot('head', 8 * Math.sin((t - T0) * 8 + p.i));
      p.set({ sil: lerp(0.25, 0.92, flood), silColor: [0.06, 0.016, 0.006], rim: lerp(0.9, 2.0, flood), rimColor: [1.0, 0.7, 0.3], rimWidth: 9 });
    }

    st.scene.updateMatrixWorld(true);
    finishFrame(st);
    // logo-safe glow over the globe centre: washes brick detail into a clean disc
    setGlow(core, [0, BY + GC, 2], on * (0.22 + 0.38 * calm), 15.5 + 2 * calm);
    setGlow(halo, [0, BY + GC, -2], on * (0.14 + 0.16 * Math.exp(-(t - T_ON) * 2.5)), 40);

    const bulbScr = toScreen(st.camera, [0, BY + GC, 0]);
    const flash = t >= T_ON ? 0.38 * Math.exp(-(t - T_ON) * 7) : 0;
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: st.camera.position.distanceTo(new THREE.Vector3(0, 12, 6)), aperture: 7, farMax: 6, nearMax: 14 },
      bloom: { threshold: 1.0, strength: lerp(0.32, 0.5, flood) - 0.08 * calm, knee: 0.45 },
      rays: { pos: bulbScr, strength: lerp(0.12, 0.48, flood) * (1 - 0.25 * calm), density: 0.92, decay: 0.958, tint: [1.0, 0.78, 0.45] },
      final: {
        exposure: lerp(0.96, 1.0, flood), vignette: lerp(0.42, 0.5, flood), gain: [1.03, 0.98, 0.92], sat: 1.08,
        flash, flashColor: [1.0, 0.85, 0.55], whip: 0.1 * tiltIn, whipDir: [0, 1],
      },
    };
  }
  return { name: 'finale', t0: T0, t1: T1 + 0.001, update, events, stage: st };
}
