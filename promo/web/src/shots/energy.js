import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow, aimSunFrom } from '../common.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, lerp, clamp, BEAT } from '../util.js';

// 4.5-6.0s: energy. Big wind turbine spins fast, a field of solar panels snaps
// up toward the sun, the turbine engineer pumps his fist.
export function buildEnergy(ctx) {
  const T0 = 4.5, T1 = 6.0;
  const st = makeStage(ctx, {
    fov: 38, groundColor: 0xa64418, groundRect: [-34, 34, -30, 14], sunRadius: 0.2,
    capacity: { b2x2: 40, b2x4: 30, b1x2: 30, b1x1: 20, p2x2: 30 },
  });
  const B = st.bricks;

  // ---- solar panels: 3D, face textured with the rectified prop panel ----
  const faceTex = ctx.textures[ctx.rig.props.solar_panel.face];
  const faceMat = new THREE.MeshPhysicalMaterial({
    map: faceTex, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.3,
  });
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0xdedad4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const greyMat = new THREE.MeshPhysicalMaterial({ color: 0x8d8b88, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.15 });
  const PW = 2.7, PH = 3.35, PD = 0.16, POST = 1.9;
  const panelGeo = new THREE.BoxGeometry(PW, PH, PD);
  const panels = [];
  const spots = [];
  for (const [z, xs] of [[-4.5, [-6.5, -3, 0.5, 4, 7.5]], [-10, [-4.8, -1.3, 2.2, 5.7, 9.2]], [-15.5, [-3, 0.5, 4, 7.5, 11]]]) {
    for (const x of xs) spots.push([x, z]);
  }
  spots.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), greyMat);
    base.position.y = 0.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, POST, 20), greyMat);
    post.position.y = 0.4 + POST / 2;
    const hinge = new THREE.Group();
    hinge.position.y = 0.4 + POST;
    const panel = new THREE.Mesh(panelGeo, [frameMat, frameMat, frameMat, frameMat, faceMat, frameMat]);
    panel.position.y = PH * 0.15;
    hinge.add(panel);
    for (const m of [base, post, panel]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    g.add(base, post, hinge);
    st.scene.add(g);
    const tFlip = 4.62 + i * 0.045 + (z < -8 ? 0.05 : 0);
    panels.push({ g, hinge, tFlip, x, z });
  });
  const glints = panels.slice(0, 6).map(() => addGlow(st, { kind: 'star', color: [1.7, 1.35, 0.8], size: 2 }));

  // ---- wind turbines (prop sprite, rotor spins with motion-blur copies) ----
  const big = addPuppet(st, ctx, 'wind_turbine', { scale: 4.3, shadowW: 4, shadowD: 2 });
  big.root.position.set(-11.5, 0, -9);
  big.blurCopies('rotor', [5, 10, 15], [0.45, 0.28, 0.14]);
  const far1 = addPuppet(st, ctx, 'wind_turbine', { scale: 3.0, shadow: false });
  far1.root.position.set(15, 0, -30);
  far1.blurCopies('rotor', [6, 12], [0.4, 0.2]);
  const far2 = addPuppet(st, ctx, 'wind_turbine', { scale: 3.4, shadow: false });
  far2.root.position.set(-27, 0, -34);
  far2.blurCopies('rotor', [6, 12], [0.4, 0.2]);
  for (const p of [big, far1, far2]) p.set({ rim: 0.75, rimWidth: 6, bottom: 0.18 });

  // ---- engineer with turbine, fist pumps ----
  const e3 = addPuppet(st, ctx, 'eng3', { shadowW: 2.8, shadowD: 1.3 });
  e3.root.position.set(6.0, 0, 5.2);
  e3.set({ rim: 0.85, rimWidth: 7, bottom: 0.25 });
  const pumps = [4.75, 5.0, 5.25, 5.5];

  // a few bricks on the ground
  for (const [ty, c, pos, ry] of [
    ['b2x4', PALETTE.amber, [-2.5, 0, 6.5], 0.4], ['b2x2', PALETTE.white, [1.2, 0, 8.2], -0.2],
    ['b1x2', PALETTE.yellow, [11.5, 0, 3], 0.8], ['b2x2', PALETTE.orange, [-7, 0, 3], 0.1],
  ]) B.add(ty, c, { pos, rot: [0, ry, 0] });

  const events = [
    { t: 4.62, type: 'swish', dur: 0.6, id: 'panels' },
    ...spots.map((_, i) => ({ t: panels[i].tFlip + 0.16, type: 'tick', id: 'panel' })),
    ...pumps.map((t) => ({ t, type: 'pump', id: 'e3' })),
  ];

  const camPos = track([[4.5, [-3.5, 2.6, 21]], [6.0, [1.5, 6.4, 18], ease.inOutQuad]]);
  const camTgt = track([[4.5, [-2.5, 4.6, -5]], [6.0, [2.0, 3.6, -3.5], ease.inOutQuad]]);
  const v = new THREE.Vector3();

  function update(t) {
    lookAt(st.camera, camPos(t), camTgt(t), 0.015);
    st.camera.fov = 38 - 3 * ease.inOutQuad(seg(t, T0, T1));
    st.camera.updateProjectionMatrix();
    aimSunFrom(st, camPos(T0), camTgt(T0), 38, 0.18, 0.55);
    st.sky.angRadius = 0.21;
    st.sky.u.uRays.value = 0.14;
    st.sky.u.uRayRot.value = t * 0.15;

    // turbines
    const spin = (t - T0) * 360 * 1.7;
    big.rot('rotor', -spin);
    far1.rot('rotor', -(t - T0) * 360 * 1.2 - 40);
    far2.rot('rotor', -(t - T0) * 360 * 1.35 - 75);

    // panels: start drooping forward, snap up toward the sun with overshoot
    panels.forEach((p, i) => {
      const u = ease.outBack(seg(t, p.tFlip, p.tFlip + 0.32), 2.0);
      p.hinge.rotation.x = lerp(-0.62, 0.92, u);
      p.hinge.rotation.y = lerp(0.0, -0.22, u);
      if (i < glints.length) {
        const gu = seg(t, p.tFlip + 0.22, p.tFlip + 0.55);
        p.hinge.updateMatrixWorld(true);
        v.set(PW * 0.38, PH * 0.55, PD).applyMatrix4(p.hinge.children[0].matrixWorld);
        setGlow(glints[i], [v.x, v.y, v.z], gu > 0 && gu < 1 ? Math.sin(gu * Math.PI) * 1.3 : 0, 2.4 * (0.3 + Math.sin(gu * Math.PI)), gu * 1.2);
      }
    });

    // fist pumps on the beat
    let pump = 0, sx = 1, sy = 1, hop = 0;
    for (const tp of pumps) {
      const d = t - tp;
      if (d > -0.12 && d < 0.25) {
        pump = Math.max(pump, d < 0 ? ease.inQuad((d + 0.12) / 0.12) : Math.exp(-d * 14));
      }
    }
    const last = pumps.filter((tp) => t >= tp).pop();
    if (last !== undefined) [sx, sy] = impactSquash(t, last, 0.14, 5, 9);
    hop = 0.35 * pump;
    e3.root.position.y = 0;
    e3.shape(sx * (1 - 0.03 * pump), sy * (1 + 0.06 * pump), -3 * pump);
    // arm: loaded low before the beat, snaps high on it
    const pre = pumps.reduce((a, tp) => Math.max(a, 1 - Math.abs((t - (tp - 0.08)) / 0.1)), 0);
    e3.rot('armL', 26 * clamp(pre, 0, 1) - 12 * pump);
    e3.rot('armR', 10 + 18 * pump);
    e3.rot('head', -4 + 5 * pump + 2 * Math.sin((t - T0) * 8));
    e3.root.position.y = hop;

    st.lights.aim([0, 2, -4], [-0.35, 0.8, 0.9], [-0.2, 0.45, -1], 30);
    st.lights.key.intensity = 2.3;
    st.lights.rim.intensity = 3.0;
    finishFrame(st);
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: st.camera.position.distanceTo(e3.root.position) * 0.86, aperture: 10, farMax: 9, nearMax: 20 },
      bloom: { threshold: 1.0, strength: 0.32, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.16, density: 0.8, decay: 0.955 },
      final: { exposure: 0.96, vignette: 0.42, gain: [1.02, 0.98, 0.94], sat: 1.06 },
    };
  }
  return { name: 'energy', t0: T0, t1: T1, update, events, stage: st };
}
