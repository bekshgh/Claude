import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt } from '../common.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, clamp, lerp } from '../util.js';

// 0.0-1.5s: sun burst from a dark rust frame, hard hat drops and bounces twice
// on a brick stack, camera punches in, whip-pan out.
export function buildIntro(ctx) {
  const T0 = 0, T1 = 1.5;
  const st = makeStage(ctx, { fov: 32, groundColor: 0x8e3414, groundRect: [-26, 26, -20, 14], sunRadius: 0.19 });
  const B = st.bricks;
  // central stack
  B.add('b2x4', PALETTE.rust, { pos: [0, 0, 0], rot: [0, 0, 0] });
  B.add('b2x4', PALETTE.orange, { pos: [0, 1.2, 0], rot: [0, Math.PI / 2, 0] });
  B.add('b2x2', PALETTE.amber, { pos: [0, 2.4, 0], rot: [0, 0, 0] });
  // scattered bricks for depth
  const scatter = [
    ['b2x4', PALETTE.amber, [-7.5, 0, 3], 0.5], ['b1x2', PALETTE.white, [-5.2, 0, 5.5], -0.3],
    ['b2x2', PALETTE.yellow, [6.5, 0, 4.2], 0.25], ['b2x4', PALETTE.orange, [8.5, 0, -1.5], -0.6],
    ['b2x4', PALETTE.orange, [8.5, 1.2, -1.5], -0.35], ['b1x4', PALETTE.white, [-9, 0, -4], 0.9],
    ['b2x2', PALETTE.rust, [3.5, 0, 9.5], 0.4], ['b1x1', PALETTE.yellow, [-2.5, 0, 9], 0],
    ['b2x4', PALETTE.amber, [-14, 0, -6], 0.2], ['b2x2', PALETTE.white, [13, 0, -7], 0.7],
  ];
  for (const [ty, c, pos, ry] of scatter) B.add(ty, c, { pos, rot: [0, ry, 0] });

  const hat = addPuppet(st, ctx, 'hard_hat', { scale: 1.42, shadowW: 3.0, shadowD: 2.0, shadowOpacity: 0.6 });
  hat.set({ rim: 0.9, rimWidth: 8, bottom: 0.15 });
  const TOP = 3.6 + 0.04;
  hat.groundY = TOP;
  const tFall = 0.40, tI1 = 0.66, tI2 = 0.92, tI3 = 1.08;

  const events = [
    { t: 0.05, type: 'burst', id: 'sun' },
    { t: tFall, type: 'fall', id: 'hat' },
    { t: tI1, type: 'hatHit', strength: 1.0 },
    { t: tI2, type: 'hatHit', strength: 0.65 },
    { t: tI3, type: 'hatHit', strength: 0.35 },
    { t: 1.12, type: 'punch' },
    { t: 1.34, type: 'whoosh', dur: 0.32, id: 'whip1' },
  ];

  const camZ = track([[0, 19.5 + 3.2], [1.12, 19.5, ease.outQuad]]);
  const fovT = track([[1.1, 32], [1.3, 21, ease.outExpo], [1.5, 19, ease.linear]]);

  function hatY(t) {
    if (t < tFall) return 16;
    if (t < tI1) return lerp(15, TOP, ease.inQuad(seg(t, tFall, tI1)));
    if (t < tI2) { const u = seg(t, tI1, tI2); return TOP + 2.3 * 4 * u * (1 - u); }
    if (t < tI3) { const u = seg(t, tI2, tI3); return TOP + 0.75 * 4 * u * (1 - u); }
    return TOP;
  }

  function update(t) {
    // --- sun burst ---
    const burst = seg(t, 0.04, 0.62);
    const sunScale = ease.outElastic(burst) * (t > 0.04 ? 1 : 0);
    const skyExp = lerp(0.14, 1.0, ease.outCubic(seg(t, 0.03, 0.5)));
    st.sky.su.uExposure.value = skyExp;
    st.sky.su.uSpread.value = 0.25 + 0.55 * ease.outCubic(burst);
    st.sky.su.uGlow.value = 0.18 + 0.5 * Math.exp(-Math.max(0, t - 0.08) * 5);
    st.sky.scale = Math.max(0.0001, sunScale);
    const flare = t > 0.05 ? Math.exp(-(t - 0.05) * 3.2) : 0;
    st.sky.u.uIntensity.value = 1.0 + 0.7 * flare;
    st.sky.u.uRays.value = 0.12 + 1.3 * flare;
    st.sky.u.uRayRot.value = 0.3 + t * 0.55;
    st.sky.u.uRayLen.value = 0.5 + 1.3 * ease.outCubic(seg(t, 0.05, 0.5));
    st.sky.u.uRing.value = t > 0.06 ? 0.9 * Math.exp(-(t - 0.06) * 4.5) : 0;
    st.sky.u.uRingR.value = 1.0 + Math.max(0, t - 0.06) * 7.5;
    st.sky.u.uHalo.value = 0.35 + 0.4 * flare;

    // --- hat ---
    const y = hatY(t);
    hat.visible = t >= tFall;
    hat.root.position.set(0, y, 0.95);
    let sx = 1, sy = 1, lean = 0;
    if (t < tI1) {
      const u = seg(t, tFall, tI1);
      sy = 1 + 0.28 * u * u;
      sx = 1 / Math.sqrt(sy);
    } else {
      const imp = (t0, k) => (t >= t0 ? impactSquash(t, t0, k, 6.5, 11) : [1, 1]);
      const a = t < tI2 ? imp(tI1, 0.42) : t < tI3 ? imp(tI2, 0.3) : imp(tI3, 0.2);
      sx = a[0];
      sy = a[1];
      if (t > tI1 && t < tI3) {
        const u = t < tI2 ? seg(t, tI1, tI2) : seg(t, tI2, tI3);
        const air = 4 * u * (1 - u);
        sy *= 1 + 0.08 * air;
        sx /= 1 + 0.04 * air;
      }
      lean = 9 * Math.sin((t - tI1) * 16) * Math.exp(-(t - tI1) * 3.2);
    }
    hat.shape(sx, sy, lean);

    // --- camera ---
    const shake = 0.12 * wobble(t - tI1, 9, 10) + 0.06 * wobble(t - tI2, 9, 12);
    const whipU = ease.inCubic(seg(t, 1.34, 1.5));
    const cz = camZ(t);
    lookAt(st.camera, [0, 5.1, cz], [0 + whipU * 9, 3.7 + shake, 0], 0);
    st.camera.fov = fovT(t);
    st.camera.updateProjectionMatrix();
    st.sky.aimAt(st.camera, 0.0, 0.16);
    if (t > 1.34) {
      // keep the sun where it was before the whip so the pan reads
      const lockCam = st.camera.clone();
      lookAt(lockCam, [0, 5.1, cz], [0, 3.7, 0], 0);
      lockCam.fov = st.camera.fov;
      lockCam.updateProjectionMatrix();
      st.sky.aimAt(lockCam, 0.0, 0.16);
    }

    // --- lights ---
    st.lights.aim([0, 2, 0], [-0.5, 0.8, 0.9], [0.0, 0.45, -1], 16);
    st.lights.key.intensity = lerp(0.25, 2.1, ease.outCubic(seg(t, 0.05, 0.5)));
    st.lights.rim.intensity = lerp(0.3, 3.2, ease.outCubic(seg(t, 0.03, 0.4))) + 2.5 * flare;
    st.lights.hemi.intensity = lerp(0.12, 0.55, ease.outCubic(seg(t, 0.05, 0.5)));
    st.scene.environmentIntensity = lerp(0.15, 1.0, ease.outCubic(seg(t, 0.05, 0.5)));
    hat.set({ exposure: lerp(0.35, 1.0, ease.outCubic(seg(t, 0.05, 0.45))), rim: 0.8 + 1.2 * flare });
    finishFrame(st);

    const flash = t > 0.05 ? 0.3 * Math.exp(-(t - 0.05) * 9) : 0;
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: st.camera.position.distanceTo(new THREE.Vector3(0, 3.5, 0)), aperture: 12, farMax: 8, nearMax: 20 },
      bloom: { threshold: 1.0, strength: 0.3 + 0.35 * flare, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.14 + 0.4 * flare, density: 0.95, decay: 0.962, weight: 1.0 },
      final: {
        whip: 0.11 * whipU, whipDir: [1, 0], exposure: 0.95,
        vignette: lerp(0.75, 0.42, seg(t, 0.0, 0.5)), flash, flashColor: [1.0, 0.82, 0.5],
        gain: [1.02, 0.98, 0.94], sat: 1.06,
      },
    };
  }
  return { name: 'intro', t0: T0, t1: T1, update, events, stage: st };
}
