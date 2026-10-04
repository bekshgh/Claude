import * as THREE from 'three';

// World units per 2x-sprite pixel: a minifigure (~900px) is ~5 studs tall.
export const U = 5.0 / 900;

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform vec3 tint;
uniform float exposure;
uniform vec3 rimColor;
uniform float rimStrength;
uniform float rimWidth;
uniform vec2 rimDir;
uniform float sil;
uniform vec3 silColor;
uniform float opacity;
uniform vec3 bottomTint;
uniform float bottomAmt;
uniform vec3 glowColor;
uniform float glowAmt;
uniform float layerBottom;   // uv.y of puppet feet within this layer (for vertical grading)
uniform float layerScaleY;   // layer height / puppet height
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  float a = c.a * opacity;
  if (a < 0.002) discard;
  vec3 col = c.rgb * tint * exposure;
  // height within the whole puppet (0 at feet, 1 at top)
  float hy = clamp(layerBottom + vUv.y * layerScaleY, 0.0, 1.0);
  col *= mix(bottomTint, vec3(1.0), mix(1.0, smoothstep(0.0, 0.45, hy), bottomAmt));
  // rim: edge pixels whose neighbour toward the light is empty
  float a1 = texture2D(map, vUv + rimDir * texel * rimWidth * 0.5).a;
  float a2 = texture2D(map, vUv + rimDir * texel * rimWidth).a;
  float a3 = texture2D(map, vUv + rimDir * texel * rimWidth * 1.8).a;
  float rim = c.a * clamp(1.0 - (a1 * 0.45 + a2 * 0.35 + a3 * 0.2), 0.0, 1.0);
  col = mix(col, silColor, sil);
  col += rimColor * rim * rimStrength;
  col += glowColor * glowAmt;
  gl_FragColor = vec4(col * a, a);
}`;

export function spriteMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      texel: { value: new THREE.Vector2(1 / tex.image.width, 1 / tex.image.height) },
      tint: { value: new THREE.Color(1, 1, 1) },
      exposure: { value: 1.0 },
      rimColor: { value: new THREE.Color(1.0, 0.72, 0.35) },
      rimStrength: { value: 0.0 },
      rimWidth: { value: 6.0 },
      rimDir: { value: new THREE.Vector2(0, 1) },
      sil: { value: 0 },
      silColor: { value: new THREE.Color(0.08, 0.02, 0.01) },
      opacity: { value: 1 },
      bottomTint: { value: new THREE.Color(0.75, 0.62, 0.55) },
      bottomAmt: { value: 0.0 },
      glowColor: { value: new THREE.Color(1, 0.8, 0.4) },
      glowAmt: { value: 0 },
      layerBottom: { value: 0 },
      layerScaleY: { value: 1 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
}

// A layered, rigged sprite standing on the ground at root position.
export class Puppet {
  constructor(entry, textures, { scale = 1, name = '', castShadow = true, depthPrepass = true } = {}) {
    this.entry = entry;
    this.name = name;
    this.u = U * scale;
    this.root = new THREE.Group();
    this.root.name = name;
    this.body = new THREE.Group(); // squash/stretch/lean happen here (anchored at feet)
    this.root.add(this.body);
    this.layers = {};
    this.mats = [];
    const [fx, fy] = entry.feet;
    const order = entry.order || Object.keys(entry.layers);
    const pivots = entry.pivots || {};
    const H = (fy - (entry.top ?? 0)) * this.u; // standing height
    this.height = H;
    order.forEach((lname, li) => {
      const L = entry.layers[lname];
      const tex = textures[L.file];
      const w = L.w * this.u, h = L.h * this.u;
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = spriteMaterial(tex);
      // vertical grading info
      const layerBottomPx = fy - (L.y + L.h); // px above feet of layer bottom
      mat.uniforms.layerBottom.value = (layerBottomPx * this.u) / H;
      mat.uniforms.layerScaleY.value = h / H;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      const pivotPx = pivots[lname] || [L.x + L.w / 2, L.y + L.h / 2];
      const pivot = new THREE.Group();
      pivot.position.set((pivotPx[0] - fx) * this.u, (fy - pivotPx[1]) * this.u, li * 0.004);
      mesh.position.set((L.x + L.w / 2 - pivotPx[0]) * this.u, (pivotPx[1] - (L.y + L.h / 2)) * this.u, 0);
      pivot.add(mesh);
      this.body.add(pivot);
      let depthMesh = null;
      if (depthPrepass) {
        const dmat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, colorWrite: false, side: THREE.DoubleSide });
        depthMesh = new THREE.Mesh(geo, dmat);
        depthMesh.position.copy(mesh.position);
        depthMesh.frustumCulled = false;
        depthMesh.castShadow = castShadow;
        depthMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
          depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide,
        });
        pivot.add(depthMesh);
      }
      this.layers[lname] = { pivot, mesh, depthMesh, mat, baseZ: li * 0.004 };
      this.mats.push(mat);
    });
    this.flipX = 1;
  }

  // Re-parent a layer under another so it inherits its rotation (e.g. gripper under arm).
  nest(child, parent) {
    const c = this.layers[child].pivot, p = this.layers[parent].pivot;
    c.position.sub(p.position);
    p.add(c);
  }

  // An Object3D attached to a layer at a sprite pixel position (2x px), for tracking points.
  anchor(lname, px, py) {
    const L = this.layers[lname];
    const piv = (this.entry.pivots || {})[lname];
    const E = this.entry.layers[lname];
    const o = new THREE.Object3D();
    const base = piv || [E.x + E.w / 2, E.y + E.h / 2];
    // pivot object sits at the pivot pixel; express target relative to it
    o.position.set((px - base[0]) * this.u, (base[1] - py) * this.u, 0.01);
    L.pivot.add(o);
    return o;
  }

  // Trailing copies of a layer for rotational motion blur (offsets in degrees).
  blurCopies(lname, offsets, opacities) {
    const L = this.layers[lname];
    L.copies = offsets.map((off, i) => {
      const g = new THREE.Group();
      g.rotation.z = THREE.MathUtils.degToRad(off);
      const mat = L.mat.clone();
      mat.uniforms.opacity.value = opacities[i];
      const m = new THREE.Mesh(L.mesh.geometry, mat);
      m.position.copy(L.mesh.position);
      m.frustumCulled = false;
      g.add(m);
      L.pivot.add(g);
      this.mats.push(mat);
      mat.userData.baseOpacity = opacities[i];
      return { g, m, mat };
    });
  }

  // Rotate a layer around its pivot (degrees; positive = counter-clockwise on screen).
  rot(lname, deg) {
    const L = this.layers[lname];
    if (L) L.pivot.rotation.z = THREE.MathUtils.degToRad(deg);
  }

  // squash/stretch anchored at the feet, lean (degrees, about the feet) and
  // spin (degrees, about the middle of the figure)
  shape(sx = 1, sy = 1, leanDeg = 0, spinDeg = 0) {
    this.body.scale.set(sx * this.flipX, sy, 1);
    const spin = THREE.MathUtils.degToRad(spinDeg);
    this.body.rotation.z = THREE.MathUtils.degToRad(leanDeg) + spin;
    const h = this.height * 0.5 * sy;
    this.body.position.set(h * Math.sin(spin), h * (1 - Math.cos(spin)), 0);
  }

  set(look) {
    for (const m of this.mats) {
      const u = m.uniforms;
      if (look.tint) u.tint.value.set(...look.tint);
      if (look.exposure !== undefined) u.exposure.value = look.exposure;
      if (look.rim !== undefined) u.rimStrength.value = look.rim;
      if (look.rimColor) u.rimColor.value.set(...look.rimColor);
      if (look.rimWidth !== undefined) u.rimWidth.value = look.rimWidth;
      if (look.sil !== undefined) u.sil.value = look.sil;
      if (look.silColor) u.silColor.value.set(...look.silColor);
      if (look.opacity !== undefined) u.opacity.value = look.opacity * (m.userData.baseOpacity ?? 1);
      if (look.bottom !== undefined) u.bottomAmt.value = look.bottom;
      if (look.bottomTint) u.bottomTint.value.set(...look.bottomTint);
      if (look.glow !== undefined) u.glowAmt.value = look.glow;
      if (look.glowColor) u.glowColor.value.set(...look.glowColor);
    }
    return this;
  }

  // Face the camera around the vertical axis and aim the rim light at a world point.
  face(camera, lightWorld = null, extraYaw = 0) {
    const r = this.root;
    r.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(r.matrixWorld);
    const c = camera.position;
    r.rotation.y = Math.atan2(c.x - p.x, c.z - p.z) + extraYaw;
    if (lightWorld) {
      const sp = p.clone().add(new THREE.Vector3(0, this.height * 0.6, 0)).project(camera);
      const lp = lightWorld.clone().project(camera);
      let dx = (lp.x - sp.x) * camera.aspect, dy = lp.y - sp.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const sgn = Math.sign(this.body.scale.x) || 1;
      // lean/rotation of the body rotates the sprite: counter-rotate the light dir
      const ang = -this.body.rotation.z;
      const rx = dx * Math.cos(ang) - dy * Math.sin(ang);
      const ry = dx * Math.sin(ang) + dy * Math.cos(ang);
      for (const m of this.mats) m.uniforms.rimDir.value.set(rx * sgn, ry);
    }
  }

  setRenderOrder(base) {
    let i = 0;
    for (const L of Object.values(this.layers)) {
      if (L.copies) for (const c of L.copies) c.m.renderOrder = base + i;
      L.mesh.renderOrder = base + i++;
    }
  }

  get visible() {
    return this.root.visible;
  }
  set visible(v) {
    this.root.visible = v;
  }
}

// Soft contact shadow decal under a puppet.
let _shadowTex = null;
function shadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.45, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}

export function contactShadow(w = 2.6, d = 1.4, opacity = 0.55) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(), transparent: true, depthWrite: false, opacity,
      color: 0x2a0800, blending: THREE.NormalBlending,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -5;
  return m;
}
