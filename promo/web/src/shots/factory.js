import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow, aimSunFrom } from '../common.js';
import { packHeightMap } from '../build.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, mulberry32, lerp, clamp } from '../util.js';

// 3.0-4.5s: factory. Robot arm grabs a brick off a long conveyor and swings it
// across; the blueprint engineer raises his hand in a thumbs-up.
export function buildFactory(ctx) {
  const T0 = 3.0, T1 = 4.5;
  const st = makeStage(ctx, {
    fov: 34, groundColor: 0x9c3a16, groundRect: [-30, 30, -20, 14], sunRadius: 0.2,
    capacity: { b2x4: 140, b2x2: 90, b1x4: 160, b1x2: 120, b1x1: 60, p2x4: 24, p1x4: 30, r1x1: 60, r1x1p: 30 },
  });
  const B = st.bricks;
  const rand = mulberry32(31);

  // ---- conveyor along x ----
  const BELT_Y = 2.4, BELT_Z = 0;
  for (const x of [-15, -9, -3, 3, 9, 15]) {
    B.add('b2x2', PALETTE.rust, { pos: [x, 0, BELT_Z] });
    B.add('b2x2', PALETTE.orange, { pos: [x, 1.2, BELT_Z] });
  }
  for (let x = -18; x < 18; x += 4) {
    B.add('p1x4', PALETTE.white, { pos: [x + 2, BELT_Y, BELT_Z - 1.5] });
    B.add('p1x4', PALETTE.white, { pos: [x + 2, BELT_Y, BELT_Z + 1.5] });
  }
  const belt = [];
  const BELT_SPEED = 4.2, BELT_SPAN = 40;
  for (let i = 0; i < 10; i++) belt.push(B.add('p2x4', 0x7a2a0e, { pos: [0, BELT_Y, BELT_Z] }));
  const rollers = [-18.6, 18.6].map((x) => B.add('r1x1', PALETTE.yellow, { pos: [x, BELT_Y - 0.5, BELT_Z - 1.5], rot: [Math.PI / 2, 0, 0], scale: [1, 2.5, 1] }));
  // cargo riding the belt
  const cargoTypes = ['b2x2', 'b2x4', 'b2x2', 'b1x2', 'b2x2', 'b2x4'];
  const cargoCols = [PALETTE.yellow, PALETTE.white, PALETTE.amber, PALETTE.yellow, PALETTE.white, PALETTE.orange];
  const cargo = cargoTypes.map((ty, i) => ({ item: B.add(ty, cargoCols[i], { pos: [0, 0, 0] }), off: i * (BELT_SPAN / cargoTypes.length) }));
  const beltX = (off, t) => (((off + BELT_SPEED * (t - T0) + 20) % BELT_SPAN) + BELT_SPAN) % BELT_SPAN - 20;

  // ---- drop stack behind-left and pallet ----
  const STACK = [-8.6, 0, -2.6];
  B.add('b2x4', PALETTE.orange, { pos: [STACK[0], 0, STACK[2]] });
  B.add('b2x4', PALETTE.amber, { pos: [STACK[0], 1.2, STACK[2]], rot: [0, Math.PI / 2, 0] });
  B.add('b2x2', PALETTE.white, { pos: [STACK[0], 2.4, STACK[2]] });
  const STACK_TOP = 3.6;

  // ---- factory skyline (perimeter shells) ----
  const buildings = [
    [-30, -14, -36, -28, 6, PALETTE.rust], [-12, 2, -40, -32, 9, PALETTE.orange],
    [4, 18, -35, -27, 5, PALETTE.rust], [20, 32, -38, -30, 7, PALETTE.orange],
  ];
  for (const [x0, x1, z0, z1, h, c] of buildings) {
    const ring = (x, z) => (x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1 ? h : 0);
    for (const p of packHeightMap(x0, x1, z0, z1, ring, rand)) {
      const win = p.z > z1 - 1.6 && p.course % 2 === 1 && p.course < h - 1 && rand() < 0.45;
      B.add(p.type, win ? PALETTE.yellow : (rand() < 0.2 ? PALETTE.amber : c), {
        pos: [p.x, p.y, p.z], rot: [0, p.rotY, 0], emissive: win ? 0.35 : 0,
      });
    }
  }
  const chimneys = [[-17.5, -29.5, 12], [-1.5, -33.5, 15], [25.5, -31.5, 12]];
  for (const [x, z, n] of chimneys) {
    for (let k = 0; k < n; k++) B.add('r1x1', k % 3 === 2 ? PALETTE.white : PALETTE.rust, { pos: [x, k * 1.2, z] });
  }
  const puffs = [];
  chimneys.forEach(([x, z, n], ci) => {
    for (let i = 0; i < 6; i++) puffs.push({ item: B.add('r1x1p', PALETTE.white, { pos: [x, n * 1.2, z] }), x, z, top: n * 1.2, ph: i / 6 + ci * 0.13 });
  });

  // ---- robot arm ----
  const robot = addPuppet(st, ctx, 'robot_arm', { scale: 2.5, shadowW: 5, shadowD: 2.4, shadowOpacity: 0.45 });
  robot.nest('grip', 'chain');
  robot.root.position.set(-3.6, 0, -2.4);
  robot.set({ rim: 0.7, rimWidth: 7, bottom: 0.2 });
  const gripPt = robot.anchor('grip', 412, 352);
  const grabbed = B.add('b2x2', PALETTE.yellow, { pos: [0, 0, 0] });

  // ---- engineer with blueprint ----
  const e1 = addPuppet(st, ctx, 'eng1', { shadowW: 2.8, shadowD: 1.3 });
  e1.root.position.set(8.2, 0, 4.4);
  e1.set({ rim: 0.8, rimWidth: 7, bottom: 0.25 });
  const star = addGlow(st, { kind: 'star', color: [1.6, 1.25, 0.7], size: 2.2 });
  const handPt = e1.anchor('armR', 470, 640);

  // robot keyframes
  const chainA = track([[3.12, 0], [3.3, -15, ease.inOutCubic], [3.46, 8, ease.outBack], [3.78, 8], [3.92, -9, ease.inOutCubic], [4.08, 4, ease.outCubic], [4.42, 0, ease.inOutCubic]]);
  const flip = track([[3.46, 1], [3.8, -1, ease.inOutCubic], [4.1, -1], [4.44, 1, ease.inOutCubic]]);
  const T_GRAB = 3.3, T_REL = 3.92, T_DROP = 4.02;

  const events = [
    { t: T_GRAB, type: 'grab', id: 'robot' },
    { t: 3.48, type: 'servo', dur: 0.32, id: 'robot' },
    { t: T_DROP, type: 'snap', id: 'robot-drop' },
    { t: 4.1, type: 'servo', dur: 0.32, id: 'robot' },
    { t: 3.94, type: 'ding', id: 'thumbs' },
  ];

  const camPos = track([[3.0, [-7.5, 4.6, 17.5]], [4.5, [4.6, 4.1, 16.6], ease.inOutQuad]]);
  const camTgt = track([[3.0, [-2.6, 3.5, -1.2]], [3.7, [1.2, 3.4, 0]], [4.5, [7.4, 3.9, 2.4], ease.inOutQuad]]);
  const fovT = track([[3.0, 35], [3.86, 33], [4.08, 28.5, ease.outExpo], [4.5, 27.5]]);
  const focusT = track([[3.0, 0], [3.7, 0], [3.95, 1, ease.inOutCubic]]);

  const v = new THREE.Vector3();
  function update(t) {
    lookAt(st.camera, camPos(t), camTgt(t), -0.02);
    st.camera.fov = fovT(t);
    st.camera.updateProjectionMatrix();
    aimSunFrom(st, camPos(T0), camTgt(T0), 35, -0.42, 0.5);
    st.sky.angRadius = 0.2;
    st.sky.u.uRays.value = 0.1;
    st.sky.u.uRayRot.value = t * 0.12;

    // belt + cargo
    belt.forEach((it, i) => B.write(it, [beltX(i * 4, t), BELT_Y, BELT_Z]));
    rollers.forEach((r) => B.write(r, r.pos, [Math.PI / 2, (t - T0) * 8, 0, 'XYZ'], [1, 2.5, 1]));
    cargo.forEach((c) => {
      const x = beltX(c.off, t);
      B.write(c.item, [x, BELT_Y + 0.4, BELT_Z - 0.4], c.item.rot);
    });
    // smoke puffs
    for (const p of puffs) {
      const ph = (((t - T0) * 0.9 + p.ph) % 1 + 1) % 1;
      const sc = (0.6 + ph * 2.0) * (1 - ease.inQuad(clamp((ph - 0.7) / 0.3)));
      B.write(p.item, [p.x + ph * 2.5, p.top + ph * 5, p.z], [0.3 * ph, ph * 2, 0], Math.max(sc, 0));
    }

    // robot
    const fl = flip(t);
    robot.shape(Math.sign(fl || 1) * Math.max(Math.abs(fl), 0.03), 1, 0);
    robot.rot('chain', chainA(t));
    robot.rot('grip', -chainA(t) * 0.9);
    st.scene.updateMatrixWorld(true);
    finishFrame(st); // billboard first so the grip anchor is current
    gripPt.getWorldPosition(v);
    // grabbed brick: rides the belt into the gripper, is carried, then dropped on the stack
    const tArrive = T_GRAB;
    if (t < tArrive) {
      const x = v.x - BELT_SPEED * (tArrive - t);
      B.write(grabbed, [x, BELT_Y + 0.4, BELT_Z - 0.6], [0, 0, 0], 1);
    } else if (t < T_REL) {
      const k = ease.outCubic(seg(t, T_GRAB, T_GRAB + 0.14));
      const y = lerp(BELT_Y + 0.4, v.y - 1.15, k);
      const z = lerp(BELT_Z - 0.6, v.z - 0.35, k);
      B.write(grabbed, [v.x, y, z], [0, -0.6 * (1 - fl), 0], 1);
    } else {
      const u = seg(t, T_REL, T_DROP);
      const y0 = v.y - 1.15;
      const y = t < T_DROP ? lerp(y0, STACK_TOP, ease.inQuad(u)) : STACK_TOP;
      const [sx, sy] = t >= T_DROP ? impactSquash(t, T_DROP, 0.25, 6, 10) : [1, 1];
      B.write(grabbed, [STACK[0], y, STACK[2]], [0, 0.2, 0], [sx, sy, sx]);
    }

    // engineer thumbs-up
    const up = ease.outBack(seg(t, 3.9, 4.12), 2.2);
    const settle = t > 4.12 ? wobble(t - 4.12, 2.5, 5) : 0;
    const hopU = seg(t, 3.9, 4.12);
    let [sx, sy] = t < 3.84 ? [1, 1] : t < 3.9 ? [1.06, 0.9] : t < 4.12 ? [0.95, 1.08] : impactSquash(t, 4.12, 0.22, 5, 8);
    e1.root.position.y = t >= 3.9 && t < 4.12 ? 0.75 * Math.sin(hopU * Math.PI) : 0;
    e1.shape(sx, sy, 2 * Math.sin((t - 3) * 5));
    e1.rot('armR', 128 * up + 6 * settle);
    e1.rot('armL', -6 * up + 4 * Math.sin((t - 3) * 7));
    e1.rot('head', 7 * up + 2 * Math.sin((t - 3) * 9));
    st.scene.updateMatrixWorld(true);
    handPt.getWorldPosition(v);
    const sp = seg(t, 3.98, 4.4);
    setGlow(star, [v.x + 0.3, v.y + 0.5, v.z + 0.4], t > 3.98 ? Math.sin(sp * Math.PI) * 1.4 : 0, 2.6 * (0.4 + Math.sin(sp * Math.PI)), sp * 1.5);

    st.lights.aim([0, 3, 0], [-0.5, 0.75, 0.85], [0.35, 0.5, -1], 26);
    st.lights.key.intensity = 2.3;
    st.lights.rim.intensity = 3.0;
    finishFrame(st);

    const nearFocus = st.camera.position.distanceTo(new THREE.Vector3(-1.5, 3.5, -1.5));
    const farFocus = st.camera.position.distanceTo(e1.root.position);
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: lerp(nearFocus, farFocus, focusT(t)), aperture: 12, farMax: 10, nearMax: 20 },
      bloom: { threshold: 1.0, strength: 0.32, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.14, density: 0.8, decay: 0.955 },
      final: { exposure: 0.96, vignette: 0.42, gain: [1.02, 0.98, 0.94], sat: 1.06 },
    };
  }
  return { name: 'factory', t0: T0, t1: T1, update, events, stage: st };
}
