import * as THREE from 'three';
import { makeStage, addPuppet, finishFrame, lookAt, addGlow, setGlow, aimSunFrom } from '../common.js';
import { packHeightMap } from '../build.js';
import { PALETTE, ease, seg, track, impactSquash, wobble, lerp, clamp, mulberry32 } from '../util.js';

const screenFrag = /* glsl */ `
uniform float uOn;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 uv = vUv;
  // background: deep amber with a soft vignette
  vec3 bg = mix(vec3(0.22, 0.07, 0.015), vec3(0.45, 0.16, 0.03), smoothstep(1.2, 0.0, length(uv - vec2(0.45, 0.6))));
  // rows of brick-like code bars scrolling upward (no glyphs, just rounded bars)
  float rows = 13.0;
  float y = uv.y * rows + uTime * 5.0;
  float row = floor(y);
  float fy = fract(y) - 0.5;
  float indent = floor(hash(vec2(row, 3.0)) * 4.0) * 0.06;
  float x = uv.x - 0.08 - indent;
  vec3 col = bg;
  float cursor = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float len = 0.06 + hash(vec2(row, fk)) * 0.16;
    float gap = 0.03;
    float start = cursor;
    cursor += len + gap;
    float on = step(hash(vec2(row, fk + 9.0)), 0.82) * step(cursor, 0.85);
    vec2 p = vec2(x - start - len * 0.5, fy * 0.08);
    float d = rbox(p, vec2(len * 0.5, 0.022), 0.02);
    float m = (1.0 - smoothstep(0.0, 0.006, d)) * on;
    float h = hash(vec2(row, fk + 4.0));
    vec3 c = h < 0.4 ? vec3(1.0, 0.62, 0.12) : h < 0.75 ? vec3(1.0, 0.85, 0.35) : vec3(1.0, 0.96, 0.85);
    col = mix(col, c * 1.6, m);
  }
  // caret blink
  float scan = 0.06 * sin(uv.y * 400.0);
  col += vec3(0.4, 0.15, 0.02) * scan;
  gl_FragColor = vec4(col * uOn, 1.0);
}`;

// 6.0-7.5s: code & IoT. The glasses engineer's laptop flips open, the screen
// lights up, the circuit board blinks and lines of tiny bricks stream like data.
export function buildCode(ctx) {
  const T0 = 6.0, T1 = 7.5;
  const st = makeStage(ctx, {
    fov: 34, groundColor: 0x9a3a16, groundRect: [-30, 30, -24, 16], sunRadius: 0.19,
    capacity: {},
  });
  const B = st.bricks;
  const rand = mulberry32(51);

  // ---- tall brick desk: 2 brick courses + 2 plate courses (top at 3.2) ----
  const DX0 = -8, DX1 = 8, DZ0 = -2, DZ1 = 2, DESK_TOP = 2.8;
  const deskCols = [[PALETTE.rust, PALETTE.orange], [PALETTE.orange, PALETTE.amber]];
  for (const p of packHeightMap(DX0, DX1, DZ0, DZ1, () => 2, rand)) {
    const cs = deskCols[p.course];
    B.add(p.type, cs[Math.floor(rand() * 2)], { pos: [p.x, p.y, p.z], rot: [0, p.rotY, 0] });
  }
  for (let x = DX0; x < DX1; x += 4) {
    for (const z of [-1, 1]) {
      B.add('p2x4', PALETTE.white, { pos: [x + 2, 2.4, z] });
    }
  }

  // ---- 3D laptop built from the prop's rectified textures ----
  const T = ctx.rig.props.laptop;
  const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2a2a, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const deckMat = new THREE.MeshPhysicalMaterial({ map: ctx.textures[T.deck], roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.15 });
  const frontMat = new THREE.MeshPhysicalMaterial({ map: ctx.textures[T.front], roughness: 0.4, clearcoat: 0.5 });
  const screenMat = new THREE.MeshPhysicalMaterial({ map: ctx.textures[T.screen], roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
  const LW = 3.6, LD = 2.5, LB = 0.24, LH = 2.65, LT = 0.13;
  const laptop = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(LW, LB, LD), [darkMat, darkMat, deckMat, darkMat, frontMat, darkMat]);
  base.position.y = LB / 2;
  const hinge = new THREE.Group();
  hinge.position.set(0, LB, -LD / 2 + 0.05);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(LW, LH, LT), [darkMat, darkMat, darkMat, darkMat, screenMat, darkMat]);
  lid.position.set(0, LH / 2, 0);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uOn: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: screenFrag,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(LW * 0.86, LH * 0.8), glowMat);
  glow.position.set(-0.01, LH / 2 + 0.03, LT / 2 + 0.006);
  lid.add(glow);
  hinge.add(lid);
  laptop.add(base, hinge);
  for (const m of [base, lid]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  laptop.position.set(-2.9, DESK_TOP, 0.2);
  laptop.rotation.y = 0.22;
  st.scene.add(laptop);
  const screenLight = new THREE.PointLight(0xffa040, 0, 14, 1.6);
  screenLight.position.set(-2.9, DESK_TOP + 1.6, 1.8);
  st.scene.add(screenLight);

  // ---- engineer with glasses behind the desk ----
  const e4 = addPuppet(st, ctx, 'eng4', { shadow: false });
  e4.root.position.set(1.7, 0, -3.0);
  e4.set({ rim: 0.85, rimWidth: 7, bottom: 0.0 });

  // ---- circuit board on the desk, LEDs blink ----
  const board = addPuppet(st, ctx, 'circuit_board', { scale: 0.8, shadow: false });
  board.root.position.set(2.75, DESK_TOP + 0.4, 1.0);
  board.groundY = DESK_TOP + 0.4;
  board.set({ rim: 0.6, rimWidth: 5 });
  B.add('p1x2', PALETTE.white, { pos: [2.75, DESK_TOP, 1.0] });
  const ledPx = [[44, 84], [52, 114], [100, 40], [154, 204], [170, 204], [226, 116], [184, 40], [86, 240]];
  const leds = ledPx.map(([x, y]) => ({ a: board.anchor('main', x, y), g: addGlow(st, { color: [1.9, 1.3, 0.45], size: 0.55 }) }));

  // ---- data streams: lines of tiny glowing tiles ----
  const streams = [];
  const lines = [
    { y: 5.9, z: -5.0, v: 9, n: 18 }, { y: 4.9, z: -6.2, v: -7, n: 18 }, { y: 6.9, z: -7.5, v: 11, n: 16 },
    { y: 7.8, z: -9.5, v: -9, n: 16 }, { y: 3.9, z: -8.5, v: 13, n: 16 },
  ];
  lines.forEach((L, li) => {
    const pieces = [];
    let x = 0;
    for (let i = 0; i < L.n; i++) {
      const ty = rand() < 0.5 ? 't1x1' : 't1x2';
      const c = [PALETTE.yellow, PALETTE.white, PALETTE.amber][Math.floor(rand() * 3)];
      x += (ty === 't1x2' ? 2 : 1) + 0.4 + (rand() < 0.3 ? 2.5 : 0);
      pieces.push({ item: B.add(ty, c, { pos: [0, 0, 0], rot: [Math.PI / 2, 0, 0, 'XYZ'], emissive: 0.9 }), off: x });
    }
    streams.push({ ...L, pieces, span: x + 6, li });
  });

  const T_OPEN = 6.12, T_OPENED = 6.42, T_ON = 6.45;
  const events = [
    { t: T_OPEN, type: 'lid', id: 'laptop' },
    { t: T_OPENED, type: 'snap', id: 'laptop' },
    { t: T_ON, type: 'powerOn', id: 'laptop' },
    { t: 6.55, type: 'data', dur: 0.9, id: 'stream' },
  ];
  for (let i = 0; i < 8; i++) events.push({ t: 6.6 + i * 0.125, type: 'blip', id: 'led', pitch: i % 4 });

  const camPos = track([[6.0, [-3.6, 5.2, 7.8]], [6.4, [-3.2, 5.0, 8.6], ease.outQuad], [7.5, [-0.2, 4.15, 15.5], ease.inOutCubic]]);
  const camTgt = track([[6.0, [-3.0, 3.5, 0.6]], [6.4, [-2.8, 3.9, 0.4]], [7.5, [0.2, 4.0, -1.0], ease.inOutCubic]]);
  const fovT = track([[6.0, 34], [7.5, 32]]);
  const focusT = track([[6.0, 0], [6.55, 0], [6.95, 1, ease.inOutCubic]]);
  const v = new THREE.Vector3();

  function update(t) {
    const zoomOut = ease.inExpo(seg(t, 7.36, 7.5));
    lookAt(st.camera, camPos(t), camTgt(t), 0.03 * Math.sin((t - T0) * 1.3));
    st.camera.fov = fovT(t) - 10 * zoomOut;
    st.camera.updateProjectionMatrix();
    aimSunFrom(st, [-0.2, 4.15, 15.5], [0.2, 4.0, -1.0], 32, 0.42, 0.48);
    st.sky.angRadius = 0.2;
    st.sky.u.uRays.value = 0.1;
    st.sky.u.uRayRot.value = t * 0.12;

    // lid: closed -> open with overshoot
    const u = seg(t, T_OPEN, T_OPENED);
    hinge.rotation.x = lerp(Math.PI / 2, -0.2, ease.outBack(u, 1.6));
    const on = t < T_ON ? 0 : clamp((t - T_ON) / 0.12) * (0.85 + 0.15 * Math.sin(t * 60));
    glowMat.uniforms.uOn.value = on;
    glowMat.uniforms.uTime.value = t - T_ON;
    screenLight.intensity = 22 * on;

    // engineer: surprised hop when the lid snaps, then happy nods
    let [sx, sy] = t >= T_OPENED ? impactSquash(t, T_OPENED + 0.18, 0.16, 5, 8) : [1, 1];
    const hopU = seg(t, T_OPENED, T_OPENED + 0.18);
    e4.root.position.y = t >= T_OPENED && t < T_OPENED + 0.18 ? 0.4 * Math.sin(hopU * Math.PI) : 0;
    e4.shape(sx, sy, 0);
    e4.rot('head', 5 * Math.sin((t - T0) * 7.5) * clamp((t - 6.5) * 3, 0, 1) - 4);
    e4.set({ glow: 0.12 * on, glowColor: [1.0, 0.55, 0.15] });

    // data streams flow once the screen is on (revealed from the laptop outward)
    const reveal = seg(t, 6.5, 7.0);
    for (const s of streams) {
      for (const p of s.pieces) {
        let x = ((p.off + s.v * (t - T0) * 1.0) % s.span + s.span) % s.span - s.span / 2;
        const vis = reveal > 0 && Math.abs(x - -2.9) < reveal * 30 ? 1 : 0;
        B.write(p.item, [x, s.y, s.z], [Math.PI / 2, 0, 0, 'XYZ'], vis * 0.55, 0.16 * vis);
      }
    }

    // board LEDs: chasing warm blinks on 16ths
    st.scene.updateMatrixWorld(true);
    finishFrame(st);
    leds.forEach((L, i) => {
      L.a.getWorldPosition(v);
      const step = Math.floor((t - 6.5) * 8);
      const blink = t > 6.5 ? ((step + i * 3) % 5 < 2 ? 1 : 0.15) : t > T_ON ? 0.1 : 0;
      setGlow(L.g, [v.x, v.y, v.z + 0.05], blink * 1.2, 0.5 + 0.25 * blink);
    });

    st.lights.aim([-1, 3.5, 0], [-0.5, 0.8, 0.9], [0.4, 0.45, -1], 16);
    st.lights.key.intensity = 2.2;
    st.lights.rim.intensity = 3.0;
    finishFrame(st);
    const nearF = st.camera.position.distanceTo(new THREE.Vector3(-2.9, DESK_TOP + 1, 0.2));
    const farF = st.camera.position.distanceTo(new THREE.Vector3(1.7, 4.3, -3.0));
    return {
      scene: st.scene, camera: st.camera,
      dof: { focus: lerp(nearF, farF, focusT(t)), aperture: 13, farMax: 10, nearMax: 22 },
      bloom: { threshold: 0.95, strength: 0.38, knee: 0.45 },
      rays: { pos: st.sky.screenPos(st.camera), strength: 0.13, density: 0.8, decay: 0.955 },
      final: { zoomBlur: 0.16 * zoomOut, exposure: 0.96, vignette: 0.42, gain: [1.02, 0.98, 0.94], sat: 1.06 },
    };
  }
  return { name: 'code', t0: T0, t1: T1, update, events, stage: st };
}
