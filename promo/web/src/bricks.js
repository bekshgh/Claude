import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Units: 1 = one stud pitch. A brick is 1.2 tall, a plate 0.4.
export const PLATE_H = 0.4;
export const BRICK_H = 1.2;
export const STUD_R = 0.3;
export const STUD_H = 0.18;
const GAP = 0.022;

function studGeometry(seg = 18) {
  const r = STUD_R, h = STUD_H, b = 0.04;
  const pts = [
    new THREE.Vector2(0.0, h),
    new THREE.Vector2(r - b, h),
    new THREE.Vector2(r - b * 0.29, h - b * 0.29),
    new THREE.Vector2(r, h - b),
    new THREE.Vector2(r, 0.0),
  ];
  return new THREE.LatheGeometry(pts, seg);
}

function finish(parts) {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeBoundingSphere();
  return g;
}

const cache = new Map();

// w x d studs, height in plates. kinds: 'brick' | 'round' | 'tile'
export function brickGeometry(w, d, plates = 3, kind = 'brick', studSeg = 16) {
  const key = `${w}x${d}x${plates}:${kind}:${studSeg}`;
  if (cache.has(key)) return cache.get(key);
  const h = plates * PLATE_H;
  const parts = [];
  if (kind === 'round') {
    const body = new THREE.CylinderGeometry(w / 2 - GAP, w / 2 - GAP, h - GAP, 28, 1);
    body.translate(0, (h - GAP) / 2, 0);
    parts.push(body);
  } else {
    const body = new RoundedBoxGeometry(w - 2 * GAP, h - GAP, d - 2 * GAP, 2, Math.min(0.045, h * 0.2));
    body.translate(0, (h - GAP) / 2, 0);
    parts.push(body);
  }
  if (kind !== 'tile') {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const s = studGeometry(studSeg);
        s.translate(i + 0.5 - w / 2, h - GAP, j + 0.5 - d / 2);
        parts.push(s);
      }
    }
  }
  const g = finish(parts);
  cache.set(key, g);
  return g;
}

export const BRICK_TYPES = {
  b2x4: [4, 2, 3, 'brick'],
  b2x2: [2, 2, 3, 'brick'],
  b1x4: [4, 1, 3, 'brick'],
  b1x2: [2, 1, 3, 'brick'],
  b1x1: [1, 1, 3, 'brick'],
  b1x6: [6, 1, 3, 'brick'],
  b2x6: [6, 2, 3, 'brick'],
  p2x4: [4, 2, 1, 'brick'],
  p2x2: [2, 2, 1, 'brick'],
  p1x2: [2, 1, 1, 'brick'],
  p1x4: [4, 1, 1, 'brick'],
  p1x1: [1, 1, 1, 'brick'],
  r1x1p: [1, 1, 1, 'round'],
  r1x1: [1, 1, 3, 'round'],
  t1x2: [2, 1, 1, 'tile'],
  t1x1: [1, 1, 1, 'tile'],
  t1x4: [4, 1, 1, 'tile'],
};

export function brickSize(type) {
  const [w, d, plates] = BRICK_TYPES[type];
  return [w, plates * PLATE_H, d];
}

// Glossy ABS: base + clearcoat gives the double specular of real toy plastic.
export function plasticMaterial(opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: opts.roughness ?? 0.32,
    metalness: 0,
    clearcoat: opts.clearcoat ?? 1.0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.07,
    envMapIntensity: opts.envMapIntensity ?? 1.0,
    specularIntensity: 0.6,
  });
  m.userData.emissiveBoost = { value: opts.emissiveBoost ?? 4.0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.emissiveBoost = m.userData.emissiveBoost;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float instEmissive;\nvarying float vInstEmissive;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstEmissive = instEmissive;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstEmissive;\nuniform float emissiveBoost;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\ntotalEmissiveRadiance += vColor.rgb * vInstEmissive * emissiveBoost;\n#endif'
      );
  };
  m.customProgramCacheKey = () => 'plastic-inst-emissive';
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// A pool of instanced bricks of many types sharing one material. Instanced
// meshes are created lazily (sized from the bricks actually added) on first write.
export class BrickSet {
  constructor(material, capacities = {}, { castShadow = true, receiveShadow = true } = {}) {
    this.group = new THREE.Group();
    this.meshes = {};
    this.material = material;
    this.extra = capacities || {};
    this.counts = {};
    this.items = [];
    this.opts = { castShadow, receiveShadow };
    this.built = false;
  }

  add(type, color, props = {}) {
    if (!BRICK_TYPES[type]) throw new Error('unknown brick type ' + type);
    if (this.built) throw new Error('BrickSet: add() after build');
    const idx = (this.counts[type] = (this.counts[type] || 0) + 1) - 1;
    const item = {
      type, idx, color,
      pos: props.pos ? props.pos.slice() : [0, 0, 0],
      rot: props.rot ? props.rot.slice() : [0, 0, 0],
      scale: props.scale ?? 1,
      emissive: props.emissive ?? 0,
      data: props.data || {},
    };
    this.items.push(item);
    return item;
  }

  build() {
    if (this.built) return;
    this.built = true;
    for (const [type, n] of Object.entries(this.counts)) {
      const [w, d, plates, kind] = BRICK_TYPES[type];
      const geo = brickGeometry(w, d, plates, kind).clone();
      const em = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
      em.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('instEmissive', em);
      const mesh = new THREE.InstancedMesh(geo, this.material, n);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = this.opts.castShadow;
      mesh.receiveShadow = this.opts.receiveShadow;
      mesh.frustumCulled = false;
      this.meshes[type] = mesh;
      this.group.add(mesh);
    }
    for (const it of this.items) {
      this.meshes[it.type].setColorAt(it.idx, _c.set(it.color));
      this.write(it);
    }
  }

  setColor(item, color) {
    this.build();
    item.color = color;
    this.meshes[item.type].setColorAt(item.idx, _c.set(color));
    this.meshes[item.type].instanceColor.needsUpdate = true;
  }

  write(item, pos = item.pos, rot = item.rot, scale = item.scale, emissive = item.emissive) {
    if (!this.built) this.build();
    const mesh = this.meshes[item.type];
    _p.set(pos[0], pos[1], pos[2]);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], rot[3] || 'YXZ'));
    if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
    else _s.set(scale, scale, scale);
    if (_s.x === 0 && _s.y === 0) _s.set(1e-5, 1e-5, 1e-5);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(item.idx, _m);
    mesh.geometry.attributes.instEmissive.array[item.idx] = emissive;
  }

  commit() {
    if (!this.built) this.build();
    for (const mesh of Object.values(this.meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.geometry.attributes.instEmissive.needsUpdate = true;
    }
  }
}
