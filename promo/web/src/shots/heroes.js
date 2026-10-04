import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, toScreen } from '../common.js';
import { packHeightMap } from '../build.js';
import { PALETTE, ease, seg, track, impactSquash, jumpArc, mulberry32, wobble, BEAT, lerp, clamp } from '../util.js';

// 1.5-3.0s: the five engineers jump onto wide brick stairs and strike a hero pose.
export function buildHeroes(ctx) {
  const T0 = 1.5, T1 = 3.0;
  const st = makeStage(ctx, { fov: 36, groundColor: PALETTE.rust, groundRect: [-34, 34, -26, 16], sunRadius: 0.21 });
  const rand = mulberry32(7);
  const heightAt = (x, z) => {
    if (x >= -3 && x < 3 && z >= -7 && z < -2) return 3;
    if (x >= -8 && x < 8 && z >= -7 && z < 0) return 2;
    if (x >= -13 && x < 13 && z >= -7 && z < 2) return 1;
    return 0;
  };
  const courseCols = [
    [PALETTE.rust, PALETTE.orange, PALETTE.orange, PALETTE.amber],
    [PALETTE.amber, PALETTE.orange, PALETTE.white, PALETTE.amber],
    [PALETTE.yellow, PALETTE.amber, PALETTE.white, PALETTE.yellow],
  ];
  for (const p of packHeightMap(-13, 13, -7, 2, heightAt, rand)) {
    const cols = courseCols[p.course];
    const c = cols[Math.floor(rand() * cols.length)];
    st.bricks.add(p.type, c, { pos: [p.x, p.y, p.z], rot: [0, p.rotY, 0] });
  }
  // a few loose bricks on the ground for scale and foreground depth
  const loose = [
    ['b2x2', PALETTE.yellow, [-15.5, 0, 4.5], 0.4], ['b1x2', PALETTE.white, [-12, 0, 6], 1.2],
    ['b2x4', PALETTE.amber, [15, 0, 5], -0.3], ['b1x1', PALETTE.orange, [12.5, 0, 6.5], 0.2],
    ['b2x2', PALETTE.orange, [17.5, 0, 2.5], 0.9],
  ];
  for (const [ty, c, pos, ry] of loose) st.bricks.add(ty, c, { pos, rot: [0, ry, 0] });

  const cast = [
    { key: 'eng1', land: [-10, 1.2, 0.6], from: [-15, -8, 5], t0: 1.52, t1: 1.84, apex: 3.2 },
    { key: 'eng5', land: [10, 1.2, 0.6], from: [15, -8, 5], t0: 1.66, t1: 1.98, apex: 3.2 },
    { key: 'eng2', land: [-5.4, 2.4, -1.3], from: [-24, 2, -1], t0: 1.80, t1: 2.14, apex: 3.6 },
    { key: 'eng4', land: [5.4, 2.4, -1.3], from: [24, 2, -1], t0: 1.94, t1: 2.28, apex: 3.6 },
    { key: 'eng3', land: [0, 3.6, -3.3], from: [0, -10, 6], t0: 2.10, t1: 2.50, apex: 5.0, flip: 1 },
  ];
  for (const c of cast) {
    c.p = addPuppet(st, ctx, c.key, { shadowW: 2.6, shadowD: 1.2 });
    c.p.groundY = c.land[1];
    c.p.set({ rim: 0.85, rimWidth: 7, bottom: 0.25 });
  }
  const HOP_T = 2.56, HOP_LAND = 2.74;

  const camPos = track([[1.5, [0, 1.3, 29.5]], [3.0, [0, 1.9, 26.2], ease.outCubic]]);
  const fov = track([[2.48, 36], [2.62, 31.5, ease.outExpo], [3.0, 30.5, ease.outQuad]]);

  const events = [];
  for (const c of cast) {
    events.push({ t: c.t0, type: 'jump', id: c.key });
    events.push({ t: c.t1, type: 'land', id: c.key, heavy: c.key === 'eng3' });
  }
  events.push({ t: HOP_LAND, type: 'land', id: 'all', heavy: true });

  function update(t) {
    // camera: arrives from a whip-pan, low angle, punch-in on the hero beat
    const yawIn = -0.32 * (1 - ease.outCubic(seg(t, 1.5, 1.66)));
    const shake = 0.06 * wobble(t - 2.5, 7, 9) + 0.04 * wobble(t - HOP_LAND, 8, 10);
    const cp = camPos(t);
    const target = [0 + yawIn * 30, 5.3 + shake, 0];
    lookAt(st.camera, cp, target, 0.0);
    st.camera.fov = fov(t);
    st.camera.updateProjectionMatrix();
    st.sky.aimAt(st.camera, 0.0, 0.42);
    st.sky.angRadius = 0.17;

    for (const c of cast) {
      const p = c.p;
      if (t < c.t0) {
        p.visible = false;
        continue;
      }
      p.visible = true;
      let pos, sx = 1, sy = 1, spin = 0, lean = 0, armsUp = 0;
      if (t < c.t1) {
        const u = (t - c.t0) / (c.t1 - c.t0);
        pos = jumpArc(c.from, c.land, c.apex, u);
        const v = Math.abs(1 - 2 * u); // speed proxy: fast at ends, slow at apex
        sy = 1 + 0.24 * v;
        sx = 1 / Math.sqrt(sy);
        spin = c.flip ? -360 * ease.inOutQuad(u) : 0;
        lean = (c.land[0] - c.from[0]) * 0.6 * (1 - u);
        armsUp = 1;
      } else {
        pos = c.land.slice();
        [sx, sy] = impactSquash(t, c.t1, c.key === 'eng3' ? 0.38 : 0.32, 5.5, 8);
        armsUp = Math.max(0, 1 - (t - c.t1) / 0.18);
        // group hero hop
        if (c.key !== 'eng3') {
          if (t >= HOP_T - 0.06 && t < HOP_T) {
            const a = seg(t, HOP_T - 0.06, HOP_T);
            sy *= 1 - 0.18 * Math.sin(a * Math.PI * 0.5);
            sx = 1 / Math.sqrt(sy);
          } else if (t >= HOP_T && t < HOP_LAND) {
            const u = seg(t, HOP_T, HOP_LAND);
            pos[1] += 1.1 * 4 * u * (1 - u);
            sy = 1.12 - 0.12 * u;
            sx = 1 / Math.sqrt(sy);
            armsUp = Math.sin(u * Math.PI);
          } else if (t >= HOP_LAND) {
            [sx, sy] = impactSquash(t, HOP_LAND, 0.28, 5.5, 8);
          }
        }
      }
      p.root.position.set(pos[0], pos[1], pos[2]);
      p.shape(sx, sy, lean, spin);
      // limbs: arms fly up in the air, settle with overshoot; head bobs on the beat
      const settle = t > c.t1 ? wobble(t - c.t1, 3, 6) : 0;
      const beatBob = Math.sin(((t - 1.5) / BEAT) * Math.PI * 2 + c.land[0]) * 3;
      p.rot('head', beatBob * (t > c.t1 ? 1 : 0.3) + settle * 6);
      p.rot('armL', -28 * armsUp + settle * 10);
      p.rot('armR', 28 * armsUp - settle * 10);
      if (c.key === 'eng3') {
        const power = ease.outBack(seg(t, 2.52, 2.7));
        p.rot('armL', -28 * armsUp + settle * 8 - 14 * power);
        p.rot('armR', 28 * armsUp + 34 * power);
      }
    }
    const flash = Math.exp(-Math.max(0, t - 2.5) * 9) * (t >= 2.5 ? 1 : 0);
    st.sky.u.uIntensity.value = 1.0 + 0.35 * flash;
    st.sky.u.uRays.value = 0.1 + 0.2 * flash;
    st.sky.u.uRayRot.value = t * 0.15;
    st.sky.u.uHalo.value = 0.35;
    st.lights.aim([0, 3, -2], [-0.45, 0.75, 0.9], [0.1, 0.5, -1], 24);
    st.lights.key.intensity = 2.3;
    st.lights.rim.intensity = 2.8 + 2 * flash;
    for (const c of cast) c.p.set({ rim: 0.85 + 0.8 * flash });
    finishFrame(st);
    const whip = 0.09 * (1 - ease.outCubic(seg(t, 1.5, 1.64)));
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: st.camera.position.distanceTo(new THREE.Vector3(0, 5, -1.5)), aperture: 13, farMax: 9, nearMax: 22 },
      bloom: { threshold: 1.0, strength: 0.28 + 0.25 * flash, knee: 0.4 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.12 + 0.25 * flash, density: 0.8, decay: 0.955, weight: 1.0 },
      final: { whip, whipDir: [1, 0], exposure: 0.95, vignette: 0.42, gain: [1.02, 0.98, 0.94], sat: 1.06 },
    };
  }
  return { name: 'heroes', t0: T0, t1: T1, update, events, stage: st };
}
