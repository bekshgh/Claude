import * as THREE from 'three';
import { PALETTE } from './util.js';

export const col = (hex) => new THREE.Color(hex);

// Warm studio environment: gradient dome + softboxes -> PMREM for glossy plastic.
export function makeEnvMap(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 top = vec3(0.95, 0.62, 0.30);
          vec3 hor = vec3(0.80, 0.30, 0.07);
          vec3 low = vec3(0.16, 0.035, 0.012);
          vec3 c = mix(hor, top, smoothstep(0.0, 0.8, d.y));
          c = mix(c, low, smoothstep(0.0, -0.35, d.y));
          gl_FragColor = vec4(c * 0.55, 1.0);
        }`,
    })
  );
  s.add(dome);
  const box = (w, h, color, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  box(26, 16, 0xfff1de, 4.0, [-18, 28, 26]); // key softbox, top front-left
  box(36, 8, 0xffa040, 3.2, [0, 9, -40]); // warm back strip (sun side)
  box(10, 26, 0xffe2c0, 1.6, [36, 8, 12]); // side strip right
  box(18, 6, 0xffd090, 1.2, [0, 40, 0]); // top
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(s, 0.015);
  pmrem.dispose();
  return rt.texture;
}

const skyVert = `varying vec3 vDir;
void main(){ vDir = (modelMatrix * vec4(position, 0.0)).xyz; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const skyFrag = `
uniform vec3 uSunDir;
uniform vec3 uNear;
uniform vec3 uMid;
uniform vec3 uFar;
uniform vec3 uLow;
uniform float uExposure;
uniform float uGlow;
uniform float uSpread;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float ang = acos(clamp(dot(d, normalize(uSunDir)), -1.0, 1.0));
  float a = ang / uSpread;
  vec3 c = mix(uNear, uMid, smoothstep(0.0, 0.85, a));
  c = mix(c, uFar, smoothstep(0.55, 1.9, a));
  c = mix(c, uLow, smoothstep(-0.02, -0.45, d.y));
  c += uNear * uGlow * exp(-a * a * 5.0);
  gl_FragColor = vec4(c * uExposure, 1.0);
}`;

const sunVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const sunFrag = `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uIntensity;
uniform float uHalo;
uniform float uRays;
uniform float uRayRot;
uniform float uRayLen;
uniform float uRing;
uniform float uRingR;
uniform float uDisc;
varying vec2 vUv;
const float OUT = 3.2; // plane half-size in disc radii
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec2 p = (vUv * 2.0 - 1.0) * OUT;
  float r = length(p);
  float disc = 1.0 - smoothstep(0.988, 1.0, r);
  vec3 c = mix(uCore, uEdge, smoothstep(0.15, 1.0, r * r)) * disc * uDisc;
  float outside = max(r - 1.0, 0.0);
  c += uEdge * uHalo * (exp(-outside * 4.0) * 0.8 + exp(-outside * 1.4) * 0.2) * (1.0 - disc);
  // stylised sun rays: alternating long/short spokes
  float ang = atan(p.y, p.x) + uRayRot;
  float n = 18.0;
  float s = fract(ang / 6.2831853 * n);
  float idx = floor(ang / 6.2831853 * n);
  float w = smoothstep(0.5, 0.0, abs(s - 0.5) * 2.0 - 0.0);
  float spoke = pow(clamp(1.0 - abs(s - 0.5) * 2.0, 0.0, 1.0), 6.0);
  float len = mix(0.55, 1.0, step(0.5, fract(idx * 0.5))) * uRayLen;
  float radial = smoothstep(1.0, 1.08, r) * (1.0 - smoothstep(1.0 + len * 0.6, 1.0 + len, r));
  c += uEdge * spoke * radial * uRays;
  // expanding shock ring
  c += uCore * uRing * exp(-pow((r - uRingR) * 9.0, 2.0));
  gl_FragColor = vec4(c * uIntensity, 1.0);
}`;

export class SkyAndSun {
  constructor(scene, opts = {}) {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uSunDir: { value: new THREE.Vector3(0, 0.2, -1) },
          uNear: { value: col(0xe8962c) },
          uMid: { value: col(PALETTE.orange) },
          uFar: { value: col(0x7c2a0e) },
          uLow: { value: col(0x5a1e0a) },
          uExposure: { value: 1 },
          uGlow: { value: 0.18 },
          uSpread: { value: 0.75 },
        },
        vertexShader: skyVert,
        fragmentShader: skyFrag,
      })
    );
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCore: { value: col(0xffe9a8) },
          uEdge: { value: col(0xffa531) },
          uIntensity: { value: 1.0 },
          uHalo: { value: 0.35 },
          uRays: { value: 0.0 },
          uRayRot: { value: 0 },
          uRayLen: { value: 1.2 },
          uRing: { value: 0 },
          uRingR: { value: 1.5 },
          uDisc: { value: 1 },
        },
        vertexShader: sunVert,
        fragmentShader: sunFrag,
      })
    );
    this.sun.renderOrder = -90;
    this.sun.frustumCulled = false;
    scene.add(this.sun);
    this.dist = 700;
    this.angRadius = opts.angRadius ?? 0.18; // radians
    this.dir = new THREE.Vector3(0, 0.2, -1).normalize();
    this.scale = 1;
  }

  get u() {
    return this.sun.material.uniforms;
  }
  get su() {
    return this.sky.material.uniforms;
  }

  // Place sun so it appears at normalized screen position (sx, sy in [-1,1]) for this camera.
  aimAt(camera, sx, sy) {
    camera.updateMatrixWorld();
    const v = new THREE.Vector3(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();
    this.dir.copy(v);
  }

  update(camera) {
    const pos = camera.position.clone().addScaledVector(this.dir, this.dist);
    this.sun.position.copy(pos);
    this.sun.quaternion.copy(camera.quaternion);
    const R = Math.tan(this.angRadius) * this.dist * this.scale;
    this.sun.scale.set(R * 3.2, R * 3.2, 1);
    this.sky.position.copy(camera.position);
    this.su.uSunDir.value.copy(this.dir);
  }

  // world-space point usable for rim-light direction / ray center
  worldPoint(camera) {
    return camera.position.clone().addScaledVector(this.dir, this.dist);
  }

  screenPos(camera) {
    const p = this.worldPoint(camera).project(camera);
    return [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5];
  }
}

export class LightRig {
  constructor(scene, envMap) {
    this.hemi = new THREE.HemisphereLight(0xffd6a0, 0x6b2410, 0.55);
    scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    scene.add(this.key);
    scene.add(this.key.target);
    this.rim = new THREE.DirectionalLight(0xffb04a, 2.6);
    scene.add(this.rim);
    scene.add(this.rim.target);
    scene.environment = envMap;
    scene.environmentIntensity = 1.0;
  }

  // keyFrom/rimFrom: directions (pointing from target toward light)
  aim(target, keyFrom, rimFrom, box = 20) {
    const t = new THREE.Vector3(...target);
    this.key.target.position.copy(t);
    this.key.position.copy(t).addScaledVector(new THREE.Vector3(...keyFrom).normalize(), 60);
    this.rim.target.position.copy(t);
    this.rim.position.copy(t).addScaledVector(new THREE.Vector3(...rimFrom).normalize(), 60);
    const c = this.key.shadow.camera;
    c.left = -box;
    c.right = box;
    c.top = box;
    c.bottom = -box;
    c.near = 1;
    c.far = 140;
    c.updateProjectionMatrix();
  }
}

export function groundMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.18, envMapIntensity: 0.45,
  });
}

// Flat baseplate with instanced studs over a footprint.
export function baseplate(scene, { color, x0, x1, z0, z1, y = 0, studSeg = 12, size = 600 }) {
  const mat = groundMaterial(color);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.receiveShadow = true;
  scene.add(plane);
  const r = 0.3, h = 0.18, b = 0.04;
  const pts = [
    new THREE.Vector2(0, h), new THREE.Vector2(r - b, h), new THREE.Vector2(r - b * 0.29, h - b * 0.29),
    new THREE.Vector2(r, h - b), new THREE.Vector2(r, 0),
  ];
  const sg = new THREE.LatheGeometry(pts, studSeg);
  const nx = Math.round(x1 - x0), nz = Math.round(z1 - z0);
  const inst = new THREE.InstancedMesh(sg, mat, nx * nz);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      m.makeTranslation(x0 + i + 0.5, y, z0 + j + 0.5);
      inst.setMatrixAt(k++, m);
    }
  }
  inst.receiveShadow = true;
  inst.castShadow = false;
  scene.add(inst);
  return { plane, studs: inst, mat };
}
