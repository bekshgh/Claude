import * as THREE from 'three';
import { SkyAndSun, LightRig, baseplate } from './world.js';
import { BrickSet } from './bricks.js';
import { Puppet, contactShadow } from './puppet.js';
import { PALETTE } from './util.js';

export const W = 1920;
export const H = 1080;

export function makeStage(ctx, opts = {}) {
  const scene = new THREE.Scene();
  const sky = new SkyAndSun(scene, { angRadius: opts.sunRadius ?? 0.2 });
  const lights = new LightRig(scene, ctx.envMap);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, W / H, 0.5, 1500);
  let ground = null;
  if (opts.ground !== false) {
    const [x0, x1, z0, z1] = opts.groundRect ?? [-30, 30, -24, 14];
    ground = baseplate(scene, { color: opts.groundColor ?? PALETTE.rust, x0, x1, z0, z1 });
  }
  const bricks = new BrickSet(ctx.plastic, opts.capacity ?? { b2x4: 200, b2x2: 120, b1x4: 60, b1x2: 80, b1x1: 80 });
  scene.add(bricks.group);
  return { scene, sky, lights, camera, bricks, ground, puppets: [], shadows: [], glows: [] };
}

const _texCache = {};
function glowTex(kind) {
  if (_texCache[kind]) return _texCache[kind];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'star') {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 60);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[128, 7], [7, 128], [62, 4], [4, 62]]) {
      const lg = g.createRadialGradient(128, 128, 0, 128, 128, Math.max(w, h));
      lg.addColorStop(0, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.save();
      g.translate(128, 128);
      if (w === 62 || h === 62) g.rotate(Math.PI / 4);
      g.beginPath();
      g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  } else {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  _texCache[kind] = t;
  return t;
}

// Additive camera-facing glow / star sparkle. Colour can exceed 1 to feed bloom.
export function addGlow(stage, { kind = 'glow', color = [1, 0.8, 0.4], size = 1, depthTest = true } = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTex(kind), transparent: true, depthWrite: false, depthTest,
      blending: THREE.AdditiveBlending, color: new THREE.Color(...color),
    })
  );
  m.scale.setScalar(size);
  m.renderOrder = 900;
  m.frustumCulled = false;
  m.userData.base = color.slice();
  m.userData.size = size;
  stage.scene.add(m);
  stage.glows.push(m);
  return m;
}

export function setGlow(m, pos, intensity = 1, size = null, rot = 0) {
  m.position.set(...pos);
  const b = m.userData.base;
  m.material.color.setRGB(b[0] * intensity, b[1] * intensity, b[2] * intensity);
  m.visible = intensity > 0.001;
  if (size !== null) m.scale.setScalar(size);
  m.userData.rot = rot;
}

export function addPuppet(stage, ctx, key, opts = {}) {
  const entry = ctx.rig.chars[key] || ctx.rig.props[key];
  const p = new Puppet(entry, ctx.textures, { name: key, ...opts });
  stage.scene.add(p.root);
  stage.puppets.push(p);
  if (opts.shadow !== false) {
    const s = contactShadow(opts.shadowW ?? 2.8, opts.shadowD ?? 1.3, opts.shadowOpacity ?? 0.5);
    stage.scene.add(s);
    p.contact = s;
  }
  return p;
}

// Per-frame bookkeeping: billboards, rim direction, draw order, sky placement.
export function finishFrame(stage) {
  const cam = stage.camera;
  cam.updateMatrixWorld();
  stage.sky.update(cam);
  const sunP = stage.sky.worldPoint(cam);
  const list = stage.puppets.filter((p) => p.root.visible);
  for (const p of list) {
    p.face(cam, sunP, p.extraYaw || 0);
    if (p.contact) {
      p.contact.visible = p.root.visible && p.contactVisible !== false;
      const lift = Math.max(0, p.root.position.y - (p.groundY ?? 0));
      p.contact.position.set(p.root.position.x, (p.groundY ?? 0) + 0.012, p.root.position.z + 0.15);
      const k = Math.max(0, 1 - lift / 3.5);
      p.contact.material.opacity = (p.contactOpacity ?? 0.5) * k;
      const sc = 1 + lift * 0.15;
      p.contact.scale.set(sc, sc, 1);
    }
  }
  const camPos = cam.position;
  list
    .map((p) => [p, p.root.position.distanceToSquared(camPos)])
    .sort((a, b) => b[1] - a[1])
    .forEach(([p], i) => p.setRenderOrder(100 + i * 10));
  for (const g of stage.glows) {
    g.quaternion.copy(cam.quaternion);
    if (g.userData.rot) g.rotateZ(g.userData.rot);
  }
  stage.bricks.commit();
}

export function lookAt(camera, pos, target, roll = 0) {
  camera.position.set(...pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(...target);
  if (roll) camera.rotateZ(roll);
  camera.updateMatrixWorld();
}

// Fix the sun's world direction as seen from a reference camera at (sx, sy) NDC.
const _refCam = new THREE.PerspectiveCamera(35, W / H, 0.5, 1500);
export function aimSunFrom(stage, pos, target, fov, sx, sy) {
  lookAt(_refCam, pos, target, 0);
  _refCam.fov = fov;
  _refCam.updateProjectionMatrix();
  stage.sky.aimAt(_refCam, sx, sy);
}

// Screen-space (0..1) position of a world point.
export function toScreen(camera, p) {
  const v = new THREE.Vector3(...p).project(camera);
  return [v.x * 0.5 + 0.5, v.y * 0.5 + 0.5];
}
