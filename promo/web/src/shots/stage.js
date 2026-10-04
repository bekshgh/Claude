import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow } from '../common.js';
import { packHeightMap } from '../build.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, lerp, clamp, mulberry32 } from '../util.js';

// 10.5-12.5s: stage with an orange brick curtain and a tiny cheering crowd. The
// female engineer winks and raises the gold trophy; confetti of round 1x1 plates
// rains down while the camera orbits 90 degrees.
export function buildStage(ctx) {
  const T0 = 10.5, T1 = 12.5;
  const st = makeStage(ctx, {
    fov: 36, groundColor: 0x8a3212, groundRect: [-30, 30, -24, 22], sunRadius: 0.2,
    capacity: { b2x4: 80, b2x2: 40, b1x4: 10, b1x2: 60, b1x1: 40, p2x4: 50, r1x1: 420, r1x1p: 420, p1x1: 90 },
  });
  const B = st.bricks;
  const rand = mulberry32(91);
  const STAGE_TOP = 1.6;

  // ---- stage platform ----
  for (const p of packHeightMap(-11, 11, -5, 4, () => 1, rand)) {
    B.add(p.type, p.z > 2.5 ? PALETTE.rust : rand() < 0.5 ? PALETTE.orange : PALETTE.rust, { pos: [p.x, p.y, p.z], rot: [0, p.rotY, 0] });
  }
  for (let x = -11; x < 11; x += 4) for (const z of [-4, -2, 0, 2]) {
    if (x + 4 > 11) continue;
    B.add('p2x4', z === 2 ? PALETTE.amber : PALETTE.white, { pos: [x + 2, 1.2, z + 1] });
  }
  // ---- folded curtain of round 1x1 bricks + valance ----
  const CURT_H = 13;
  for (let i = 0; i <= 26; i++) {
    const x = -13 + i;
    const z = -6.2 + 0.75 * Math.sin(i * 0.95);
    const shade = (Math.sin(i * 0.95) + 1) / 2;
    const c = shade > 0.55 ? PALETTE.orange : shade > 0.25 ? 0xb4561a : PALETTE.rust;
    for (let k = 0; k < CURT_H; k++) B.add('r1x1', c, { pos: [x, k * 1.2, z] });
  }
  for (let x = -14; x < 14; x += 4) {
    B.add('b2x4', PALETTE.rust, { pos: [x + 2, CURT_H * 1.2, -6.2] });
    B.add('b2x4', PALETTE.amber, { pos: [x + 2, CURT_H * 1.2 + 1.2, -6.2] });
  }

  // ---- tiny cheering crowd (simple faceless brick figures seen from behind) ----
  const crowd = [];
  const crowdCols = [0x5a1e0a, 0x6e2610, 0x7a2a0e, 0x8a3212, PALETTE.rust];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 15; k++) {
      const x = -17 + k * 2.4 + (row % 2) * 1.2 + (rand() - 0.5) * 0.6;
      const z = 7.0 + row * 2.1 + (rand() - 0.5) * 0.5;
      const c = crowdCols[Math.floor(rand() * crowdCols.length)];
      crowd.push({
        x, z, ph: rand() * 6.28, sp: 7 + rand() * 4, up: rand() < 0.75,
        body: B.add('b1x2', c, { pos: [x, 0, z] }),
        head: B.add('r1x1', 0x4a1806, { pos: [x, 1.2, z] }),
        armL: B.add('b1x1', c, { pos: [x - 0.9, 1.0, z] }),
        armR: B.add('b1x1', c, { pos: [x + 0.9, 1.0, z] }),
      });
    }
  }

  // ---- the team on stage ----
  const e2 = addPuppet(st, ctx, 'eng2', { shadowW: 2.6, shadowD: 1.2 });
  e2.root.position.set(0, STAGE_TOP, 0.4);
  e2.groundY = STAGE_TOP;
  const others = [['eng1', -6.6, -0.6], ['eng3', -3.4, -1.9], ['eng4', 3.4, -1.9], ['eng5', 6.6, -0.6]].map(([k, x, z], i) => {
    const p = addPuppet(st, ctx, k, { shadowW: 2.6, shadowD: 1.2 });
    p.root.position.set(x, STAGE_TOP, z);
    p.groundY = STAGE_TOP;
    p.home = [x, STAGE_TOP, z];
    p.i = i;
    return p;
  });
  for (const p of [e2, ...others]) p.set({ rim: 0.95, rimWidth: 7, bottom: 0.2 });
  const trophy = addPuppet(st, ctx, 'trophy', { scale: 1.15, shadow: false, depthPrepass: true });
  trophy.set({ rim: 1.0, rimWidth: 6 });
  const fist = e2.anchor('armL', 64, 252);
  const wink = addGlow(st, { kind: 'star', color: [1.8, 1.5, 1.0], size: 1.6 });
  const tGlints = [0, 1, 2].map(() => addGlow(st, { kind: 'star', color: [1.9, 1.5, 0.8], size: 1.8 }));
  const spot = addGlow(st, { color: [1.2, 0.75, 0.3], size: 16 });

  // ---- confetti: round 1x1 plates ----
  const conf = [];
  const confCols = [PALETTE.yellow, PALETTE.white, PALETTE.amber, PALETTE.orange, PALETTE.yellow, PALETTE.white];
  for (let i = 0; i < 380; i++) {
    const c = confCols[i % confCols.length];
    conf.push({
      item: B.add('r1x1p', c, { pos: [0, -50, 0], emissive: c === PALETTE.white ? 0.0 : 0.05 }),
      x: (rand() - 0.5) * 30, z: -5 + rand() * 10, y0: 16 + rand() * 18, t0: 10.68 + rand() * 0.5,
      vy: 4 + rand() * 4, ax: rand() * 6.28, ay: rand() * 6.28, wx: (rand() - 0.5) * 10, wy: (rand() - 0.5) * 10,
      sway: 0.6 + rand() * 1.2, sp: 1 + rand() * 2,
    });
  }

  const T_WINK = 10.62, T_RAISE = 10.72, T_SPIN0 = 10.8, T_SPIN1 = 11.45;
  const events = [
    { t: 10.5, type: 'flashIn' },
    { t: T_WINK, type: 'ting', id: 'wink' },
    { t: T_RAISE, type: 'swoosh', dur: 0.25, id: 'raise' },
    { t: 10.7, type: 'confetti', dur: 1.8 },
    { t: 10.6, type: 'applause', dur: 1.9 },
    { t: 11.05, type: 'ting', id: 'glint' }, { t: 11.3, type: 'ting', id: 'glint' }, { t: 11.55, type: 'ting', id: 'glint' },
    { t: 12.36, type: 'whoosh', dur: 0.3, id: 'whip-up' },
  ];

  const v = new THREE.Vector3();
  function update(t) {
    // 90-degree orbit around the stage
    const u = ease.inOutSine(seg(t, T0, 12.45));
    const az = THREE.MathUtils.degToRad(-45 + 90 * u);
    const R = 22.5 - 1.5 * u;
    const tilt = ease.inCubic(seg(t, 12.36, 12.5));
    lookAt(st.camera, [Math.sin(az) * R, 3.6 + tilt * 3, Math.cos(az) * R], [0, 4.9 + tilt * 14, 0], 0);
    st.camera.fov = 36;
    st.camera.updateProjectionMatrix();
    st.sky.aimAt(st.camera, 0.08 * Math.sin(az), 0.55);
    st.sky.angRadius = 0.18;
    st.sky.u.uRays.value = 0.12;
    st.sky.u.uRayRot.value = t * 0.2;
    st.lights.aim([0, 3, 0], [Math.sin(az) * 0.6 - 0.4, 0.85, Math.cos(az) * 0.9], [-Math.sin(az) * 0.3, 0.55, -1], 22);
    st.lights.key.intensity = 2.3;
    st.lights.rim.intensity = 3.2;

    // E2: wink sparkle, raise, hold the spinning trophy high
    const raise = ease.outBack(seg(t, T_RAISE, T_RAISE + 0.22), 2.0);
    let [sx, sy] = t < T_RAISE ? [1, 1] : impactSquash(t, T_RAISE + 0.22, 0.12, 5, 7);
    sy *= 1 + 0.05 * raise;
    e2.shape(sx, sy, -3 * raise + 2 * Math.sin((t - T0) * 6));
    e2.root.position.y = STAGE_TOP + 0.35 * Math.sin(seg(t, T_RAISE, T_RAISE + 0.22) * Math.PI);
    e2.rot('armL', lerp(24, 7, raise) + 3 * Math.sin((t - T0) * 9));
    e2.rot('head', -6 * Math.exp(-Math.max(0, t - T_WINK) * 4) * (t > T_WINK ? 1 : 0) + 3 * Math.sin((t - T0) * 7));

    // others cheer: staggered hops, arms swinging
    for (const p of others) {
      const per = 0.42, off = p.i * 0.11;
      const ph = ((t - T0 - off) % per + per) % per / per;
      const hop = t > T0 + off ? Math.sin(ph * Math.PI) : 0;
      p.root.position.set(p.home[0], STAGE_TOP + 0.55 * hop, p.home[2]);
      p.shape(1 - 0.04 * hop, 1 + 0.07 * hop, 4 * Math.sin((t - T0) * 7 + p.i));
      p.rot('head', 7 * Math.sin((t - T0) * 9 + p.i * 2));
      p.rot('armL', -30 * hop - 10);
      p.rot('armR', 40 * hop + 15);
    }

    st.scene.updateMatrixWorld(true);
    finishFrame(st);
    // trophy rides on the raised fist and spins (symmetric cup -> mirrored scaleX reads as rotation)
    fist.getWorldPosition(v);
    const camDir = new THREE.Vector3().subVectors(st.camera.position, v).setY(0).normalize();
    trophy.root.position.set(v.x + camDir.x * 0.25, v.y - 0.05, v.z + camDir.z * 0.25);
    const spinU = ease.outCubic(seg(t, T_SPIN0, T_SPIN1));
    const ang = spinU * Math.PI * 4;
    const appear = ease.outBack(seg(t, 10.5, 10.62), 2.5);
    const cx = Math.cos(ang);
    trophy.shape(Math.sign(cx || 1) * Math.max(Math.abs(cx), 0.06) * appear, appear, 0);
    trophy.set({ glow: 0.25 * Math.pow(Math.max(0, Math.sin(ang * 2)), 6) + 0.05 });
    // sparkles: wink + trophy glints
    const wu = seg(t, T_WINK, T_WINK + 0.32);
    e2.root.updateMatrixWorld(true);
    v.set(-0.62, e2.height * 0.86, 0.3).applyMatrix4(e2.body.matrixWorld);
    setGlow(wink, [v.x, v.y, v.z], wu > 0 && wu < 1 ? Math.sin(wu * Math.PI) * 1.6 : 0, 1.8 * (0.4 + Math.sin(wu * Math.PI)), wu * 2);
    tGlints.forEach((g, i) => {
      const gt = seg(t, 11.02 + i * 0.25, 11.32 + i * 0.25);
      const tp = trophy.root.position;
      const off = [[0.6, 2.0], [-0.55, 1.5], [0.2, 0.8]][i];
      setGlow(g, [tp.x + off[0], tp.y + off[1], tp.z + 0.3], gt > 0 && gt < 1 ? Math.sin(gt * Math.PI) * 1.6 : 0, 2.0 * (0.4 + Math.sin(gt * Math.PI)), gt * 2);
    });
    setGlow(spot, [0, STAGE_TOP + 3.5, -1.5], 0.35 + 0.1 * Math.sin(t * 5), 16);

    // crowd bobbing and waving
    for (const c of crowd) {
      const b = Math.max(0, Math.sin((t - T0) * c.sp + c.ph));
      const y = 0.45 * b;
      B.write(c.body, [c.x, y, c.z], [0, 0, 0]);
      B.write(c.head, [c.x, 1.2 + y, c.z], [0, 0, 0]);
      const wave = Math.sin((t - T0) * c.sp * 1.3 + c.ph);
      const lift = c.up ? 1 : 0.35;
      B.write(c.armL, [c.x - 0.75, 0.95 + y, c.z], [0, 0, (0.45 + 0.3 * wave) * lift + (1 - lift) * 2.6]);
      B.write(c.armR, [c.x + 0.75, 0.95 + y, c.z], [0, 0, -(0.45 - 0.3 * wave) * lift - (1 - lift) * 2.6]);
    }
    // confetti
    for (const c of conf) {
      const d = t - c.t0;
      if (d < 0) {
        B.write(c.item, [0, -50, 0], [0, 0, 0], 0);
        continue;
      }
      const y = c.y0 - c.vy * d - 1.2 * d * d;
      const x = c.x + Math.sin(d * c.sp + c.ax) * c.sway;
      B.write(c.item, [x, y, c.z + Math.cos(d * c.sp + c.ay) * 0.4], [c.ax + d * c.wx, c.ay + d * c.wy, 0], y < -1 ? 0 : 1);
    }
    st.bricks.commit();

    const flashIn = 0.85 * Math.exp(-(t - T0) * 9);
    const focus = st.camera.position.distanceTo(e2.root.position);
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus, aperture: 12, farMax: 9, nearMax: 22 },
      bloom: { threshold: 0.95, strength: 0.36, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.15, density: 0.8, decay: 0.955 },
      final: {
        exposure: 0.96, vignette: 0.42, gain: [1.02, 0.98, 0.94], sat: 1.06,
        flash: flashIn, flashColor: [1.0, 0.86, 0.6], whip: 0.1 * tilt, whipDir: [0, 1],
      },
    };
  }
  return { name: 'stage', t0: T0, t1: T1, update, events, stage: st };
}
