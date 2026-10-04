import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow, aimSunFrom } from '../common.js';
import { packHeightMap } from '../build.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, lerp, clamp, mulberry32, mix3, noise1, smoothstep } from '../util.js';

// 7.5-10.5s: speed-ramped time-lapse. All five build a brick robot on a long
// workbench while a brick sun and moon swing across the sky three times.
export function buildTimelapse(ctx) {
  const T0 = 7.5, T1 = 10.5;
  const st = makeStage(ctx, {
    fov: 38, groundColor: 0x9a3814, groundRect: [-34, 34, -26, 16], sunRadius: 0.16,
    capacity: { b2x4: 90, b2x2: 50, b1x4: 20, b1x2: 40, b1x1: 30, p2x4: 30, p1x1: 20, r1x1: 20, r1x1p: 200, t1x2: 20, t1x4: 10 },
  });
  const B = st.bricks;
  const rand = mulberry32(77);

  // ---- workbench (top at 2.0) ----
  const BENCH = 2.0;
  for (const p of packHeightMap(-13, 13, -2, 2, () => 1, rand)) {
    B.add(p.type, rand() < 0.5 ? PALETTE.rust : PALETTE.orange, { pos: [p.x, p.y, p.z], rot: [0, p.rotY, 0] });
  }
  for (let x = -13; x < 13; x += 4) {
    for (const z of [-1, 1]) {
      B.add('p2x4', PALETTE.amber, { pos: [x + 2, 1.2, z] });
      B.add('p2x4', PALETTE.white, { pos: [x + 2, 1.6, z] });
    }
  }
  // tools / spare bricks on the bench
  for (const [ty, c, pos, ry] of [
    ['b1x2', PALETTE.yellow, [-8, BENCH, 0.9], 0.3], ['b2x2', PALETTE.white, [8.5, BENCH, 0.8], -0.4],
    ['b1x1', PALETTE.amber, [5.2, BENCH, 1.1], 0], ['b1x4', PALETTE.orange, [-11, BENCH, 0.6], 0.15],
  ]) B.add(ty, c, { pos, rot: [0, ry, 0] });

  // ---- prototype robot: placements in build order ----
  const RX = -1.2, RZ = 0.3;
  const R = (ty, c, x, y, z, rot = [0, 0, 0], extra = {}) => ({ ty, c, pos: [RX + x, BENCH + y, RZ + z], rot, ...extra });
  const wheelRot = [Math.PI / 2, 0, 0, 'XYZ'];
  const proto = [
    R('r1x1', 0x5a1e0a, -1.4, 0.0, -1.55, wheelRot), R('r1x1', 0x5a1e0a, 1.4, 0.0, -1.55, wheelRot),
    R('r1x1', 0x5a1e0a, -1.4, 0.0, 1.95, wheelRot), R('r1x1', 0x5a1e0a, 1.4, 0.0, 1.95, wheelRot),
    R('p2x4', PALETTE.white, 0, 0.5, -1), R('p2x4', PALETTE.white, 0, 0.5, 1),
    R('b2x4', PALETTE.orange, 0, 0.9, -1), R('b2x4', PALETTE.orange, 0, 0.9, 1),
    R('b2x4', PALETTE.amber, -1, 2.1, 0, [0, Math.PI / 2, 0]), R('b2x4', PALETTE.amber, 1, 2.1, 0, [0, Math.PI / 2, 0]),
    R('b1x2', PALETTE.yellow, -2.5, 2.1, 0, [0, Math.PI / 2, 0]), R('b1x2', PALETTE.yellow, 2.5, 2.1, 0, [0, Math.PI / 2, 0]),
    R('p1x1', PALETTE.white, -2.5, 3.3, 0.5), R('p1x1', PALETTE.white, 2.5, 3.3, 0.5),
    R('b2x4', PALETTE.white, 0, 3.3, -1), R('b2x4', PALETTE.yellow, 0, 3.3, 1),
    R('t1x2', PALETTE.yellow, 0, 2.6, 2.02, [Math.PI / 2, 0, 0, 'XYZ'], { glow: 1 }),
    R('p2x4', PALETTE.rust, 0, 4.5, -1), R('p2x4', PALETTE.rust, 0, 4.5, 1),
    R('b2x2', PALETTE.white, 0, 4.9, 0),
    R('r1x1p', PALETTE.yellow, -0.5, 5.9, 1.02, [Math.PI / 2, 0, 0, 'XYZ'], { glow: 1 }),
    R('r1x1p', PALETTE.yellow, 0.5, 5.9, 1.02, [Math.PI / 2, 0, 0, 'XYZ'], { glow: 1 }),
    R('r1x1', PALETTE.rust, 0, 6.1, 0), R('r1x1p', PALETTE.yellow, 0, 7.3, 0, [0, 0, 0], { glow: 1 }),
    R('t1x4', PALETTE.amber, -2.03, 1.3, 0, [0, Math.PI / 2, Math.PI / 2, 'YXZ']),
    R('t1x4', PALETTE.amber, 2.03, 1.3, 0, [0, Math.PI / 2, -Math.PI / 2, 'YXZ']),
  ];
  // speed ramp: piece k snaps at time tk (dense in the middle)
  const N = proto.length;
  const TB0 = 7.72, TB1 = 9.98;
  proto.forEach((p, k) => {
    const u = k / (N - 1);
    // slow-fast-slow mapping
    const w = u < 0.08 ? u / 0.08 * 0.05 : u > 0.94 ? 0.95 + (u - 0.94) / 0.06 * 0.05 : 0.05 + (u - 0.08) / 0.86 * 0.9;
    p.t = TB0 + (TB1 - TB0) * w;
    p.item = B.add(p.ty, p.c, { pos: p.pos, rot: p.rot, scale: 0 });
  });
  const T_DONE = TB1, T_LIGHT = 10.06;

  // ---- brick sun & moon mosaics swinging on a big arc ----
  const sky = new THREE.Group();
  st.scene.add(sky);
  const disc = (r, inside, colFn, emissive) => {
    const items = [];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (!inside(i, j)) continue;
      items.push({ item: B.add('r1x1p', colFn(i, j), { pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0, 'XYZ'], emissive }), i, j });
    }
    return items;
  };
  const sunBits = disc(5, (i, j) => i * i + j * j <= 26, (i, j) => (i * i + j * j < 9 ? PALETTE.yellow : PALETTE.amber), 1.2);
  const moonBits = disc(5, (i, j) => i * i + j * j <= 26 && (i - 2.4) ** 2 + (j - 1.2) ** 2 > 14, () => PALETTE.white, 0.55);
  const SKY_Z = -70, ARC_R = 52, ARC_CY = -30, SKY_SCALE = 1.55;
  const place = (bits, ang, s = SKY_SCALE) => {
    const cx = Math.sin(ang) * ARC_R, cy = ARC_CY + Math.cos(ang) * ARC_R;
    for (const b of bits) B.write(b.item, [cx + b.i * s, cy + b.j * s, SKY_Z], [Math.PI / 2, 0, 0, 'XYZ'], s);
    return [cx, cy];
  };

  // ---- the team behind the bench ----
  const team = [
    ['eng1', -8.9], ['eng2', -5.2], ['eng3', 2.7], ['eng4', 6.1], ['eng5', 9.5],
  ].map(([k, x], i) => {
    const p = addPuppet(st, ctx, k, { shadow: false });
    p.root.position.set(x, 0, -2.7);
    p.homeX = x;
    p.seed = i * 13.7;
    p.set({ rim: 0.85, rimWidth: 7 });
    return p;
  });
  const glints = [0, 1, 2].map(() => addGlow(st, { kind: 'star', color: [1.8, 1.4, 0.8], size: 2.2 }));
  const robotGlow = addGlow(st, { color: [1.6, 0.9, 0.3], size: 9 });

  // time-lapse clock: tau runs fast between 7.85 and 9.85
  const tau = (t) => {
    const a = 7.85, b = 9.85, k = 7.0;
    if (t < a) return t;
    if (t < b) return a + (t - a) * k;
    return a + (b - a) * k + (t - b);
  };

  const events = proto.map((p) => ({ t: p.t, type: 'snap', id: 'proto', fast: true }));
  events.push({ t: 7.8, type: 'rampUp', dur: 0.4 });
  events.push({ t: 9.86, type: 'rampDown', dur: 0.3 });
  events.push({ t: T_LIGHT, type: 'lightUp', id: 'proto' });
  events.push({ t: 10.12, type: 'cheer', id: 'team' });

  const camPos = track([[7.5, [0.4, 5.4, 22.5]], [10.0, [0.2, 5.2, 20.2], ease.inOutQuad], [10.2, [-0.6, 5.6, 17.4], ease.outExpo], [10.5, [-0.8, 5.7, 16.6]]]);
  const camTgt = track([[7.5, [0.4, 4.7, -2]], [10.0, [0.0, 4.8, -1]], [10.2, [-1.0, 5.9, 0]]]);
  const v = new THREE.Vector3();

  function update(t) {
    const T = tau(t);
    lookAt(st.camera, camPos(t), camTgt(t), 0);
    st.camera.fov = 34;
    st.camera.updateProjectionMatrix();

    // day/night: 3 cycles across the shot (in time-lapse clock)
    const TA = tau(7.62), TBb = tau(9.95);
    const cyc = 0.25 + clamp((T - TA) / (TBb - TA)) * 3; // starts and ends at midday
    const ph = cyc % 1;
    const sunAng = -1.25 + ph * 2.5; // rises left, sets right
    const isDay = ph < 0.5;
    const dayAmt = clamp(Math.sin(ph * Math.PI * 2) * 2.5 + 0.5, 0, 1);
    // sun during first half of each cycle, moon during the second half
    const sAng = isDay ? -1.3 + (ph / 0.5) * 2.6 : 3;
    const mAng = !isDay ? -1.3 + ((ph - 0.5) / 0.5) * 2.6 : 3;
    const [scx, scy] = place(sunBits, sAng);
    place(moonBits, mAng);
    const night = 1 - dayAmt;
    // shader sun: only its halo, following the brick sun
    st.sky.dir.set(scx, scy, SKY_Z).sub(st.camera.position).normalize();
    st.sky.u.uDisc.value = 0;
    st.sky.u.uHalo.value = 0.9 * dayAmt * (sAng < 2.5 ? 1 : 0);
    st.sky.u.uRays.value = 0.12 * dayAmt;
    st.sky.angRadius = 0.09;
    st.sky.su.uExposure.value = lerp(0.42, 1.0, dayAmt);
    st.sky.su.uNear.value.setRGB(...mix3([0.42, 0.12, 0.03], [0.81, 0.3, 0.025], dayAmt));
    st.sky.su.uMid.value.setRGB(...mix3([0.25, 0.06, 0.015], [0.53, 0.12, 0.01], dayAmt));
    st.sky.su.uFar.value.setRGB(...mix3([0.11, 0.025, 0.008], [0.2, 0.045, 0.006], dayAmt));
    st.lights.key.intensity = lerp(0.9, 2.2, dayAmt);
    st.lights.rim.intensity = lerp(1.4, 3.0, dayAmt);
    st.lights.hemi.intensity = lerp(0.3, 0.55, dayAmt);
    st.scene.environmentIntensity = lerp(0.55, 1.0, dayAmt);
    st.lights.aim([0, 3, 0], [-0.4, 0.8, 0.9], [Math.sin(sAng < 2.5 ? sAng : mAng) * 0.8, 0.5, -1], 24);

    // prototype bricks snap in from above
    for (const p of proto) {
      const tIn = p.t - 0.06;
      let sc = 0, y = p.pos[1];
      if (t >= tIn) {
        const u = seg(t, tIn, p.t);
        y = p.pos[1] + 1.8 * (1 - ease.inQuad(u));
        sc = t < p.t ? 1 : 1;
        if (t >= p.t) {
          const d = t - p.t;
          const sq = Math.exp(-d * 28) * Math.cos(d * 60);
          sc = [1 + 0.08 * sq, 1 - 0.15 * sq, 1 + 0.08 * sq];
        }
      }
      const lit = p.glow ? clamp((t - T_LIGHT) / 0.1) * (1.4 + 0.25 * Math.sin(t * 30)) : 0;
      B.write(p.item, [p.pos[0], y, p.pos[2]], p.rot, sc, lit);
    }

    // team: stepped time-lapse jitter, then a synced celebration
    // fast but continuous motion (smooth noise in the time-lapse clock): no stepped judder
    const celebrate = seg(t, T_LIGHT, T_LIGHT + 0.3);
    team.forEach((p, i) => {
      const fast = smoothstep(7.72, 7.92, t) * (1 - smoothstep(9.8, 9.98, t));
      const h = (k) => noise1(T * 0.9 + k * 7.3, p.seed + k);
      const jx = fast * h(1) * 0.7;
      let lean = fast * h(2) * 7;
      let [sx, sy] = [1 + fast * h(3) * 0.03, 1 - fast * h(3) * 0.05];
      let y = 0;
      if (t >= T_LIGHT) {
        const hop = seg(t, T_LIGHT + 0.04 + i * 0.03, T_LIGHT + 0.3 + i * 0.03);
        y = 1.1 * Math.sin(hop * Math.PI);
        if (hop >= 1) [sx, sy] = impactSquash(t, T_LIGHT + 0.3 + i * 0.03, 0.25, 5, 8);
        else [sx, sy] = [0.94, 1.08];
        lean = 4 * Math.sin((t - T_LIGHT) * 9 + i);
      }
      p.root.position.set(p.homeX + jx, y, -2.7);
      p.shape(sx, sy, lean);
      p.rot('head', fast * h(4) * 12 + (t >= T_LIGHT ? 8 * Math.sin((t - T_LIGHT) * 10 + i) : 0));
      const armUp = t >= T_LIGHT ? ease.outBack(celebrate) : 0;
      p.rot('armL', fast * h(5) * 28 - 40 * armUp);
      p.rot('armR', fast * h(6) * 28 + 70 * armUp);
      p.set({ glow: 0.1 * clamp((t - T_LIGHT) / 0.1) * Math.exp(-(t - T_LIGHT) * 2) });
    });

    st.scene.updateMatrixWorld(true);
    finishFrame(st);
    // light-up glow + glints around the robot
    const lit = clamp((t - T_LIGHT) / 0.08);
    setGlow(robotGlow, [RX, BENCH + 5.6, RZ + 1.5], lit * (0.22 + 0.3 * Math.exp(-(t - T_LIGHT) * 5)), 8);
    glints.forEach((g, i) => {
      const gt = seg(t, T_LIGHT + 0.05 + i * 0.07, T_LIGHT + 0.35 + i * 0.07);
      const pos = [[RX - 2.4, BENCH + 6.8, RZ + 2], [RX + 2.6, BENCH + 4.6, RZ + 2], [RX + 0.6, BENCH + 8.4, RZ + 1]][i];
      setGlow(g, pos, gt > 0 && gt < 1 ? Math.sin(gt * Math.PI) * 1.5 : 0, 2.6, gt);
    });
    const flash = t >= T_LIGHT ? 0.18 * Math.exp(-(t - T_LIGHT) * 9) : 0;
    const outFlash = ease.inCubic(seg(t, 10.38, 10.5)) * 0.85;
    const zoom = seg(t, 10.0, 10.2);
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: st.camera.position.distanceTo(new THREE.Vector3(-1.5, 4.5, -1)), aperture: 10, farMax: 7, nearMax: 18 },
      bloom: { threshold: 0.95, strength: 0.32 + 0.3 * flash, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.12 * dayAmt, density: 0.8, decay: 0.955 },
      final: {
        exposure: 0.96, vignette: 0.44, gain: [1.02, 0.98, 0.94], sat: 1.06,
        flash: Math.max(flash, outFlash), flashColor: [1.0, 0.86, 0.6],
        zoomBlur: 0.05 * Math.sin(zoom * Math.PI) + 0.14 * (1 - ease.outCubic(seg(t, 7.5, 7.64))),
      },
    };
  }
  return { name: 'timelapse', t0: T0, t1: T1, update, events, stage: st };
}
