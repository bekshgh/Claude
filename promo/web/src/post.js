import * as THREE from 'three';

const quadGeo = new THREE.BufferGeometry();
quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

const fsVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(fragmentShader, uniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: fsVert, fragmentShader, depthTest: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(quadGeo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { mat, scene, u: uniforms };
}

const DEPTH_FN = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uAperture;
uniform float uNearMax;
uniform float uFarMax;
float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
float cocAt(float d){
  float z = linDepth(d);
  float c = uAperture * (z - uFocus) / max(z, 1e-3);
  return clamp(c, -uNearMax, uFarMax);
}`;

const dofBlurFrag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;     // full-res texel size
uniform float uRadius;   // max gather radius in full-res px
varying vec2 vUv;
${DEPTH_FN}
#define NS 56
void main(){
  float cdRaw = texture2D(tDepth, vUv).r;
  float cd = linDepth(cdRaw);
  float cs = abs(cocAt(cdRaw));
  vec3 acc = texture2D(tColor, vUv).rgb;
  float tot = 1.0;
  float maxc = cs;
  for (int i = 0; i < NS; i++) {
    float fi = float(i);
    float ang = fi * 2.39996323;
    float rad = uRadius * sqrt((fi + 0.5) / float(NS));
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * rad * uTexel;
    float sdRaw = texture2D(tDepth, tc).r;
    float sd = linDepth(sdRaw);
    float ss = abs(cocAt(sdRaw));
    if (sd > cd) ss = min(ss, cs * 2.0);
    float m = smoothstep(rad - 1.0, rad + 1.0, ss);
    vec3 sc = texture2D(tColor, tc).rgb;
    acc += mix(acc / tot, sc, m);
    tot += 1.0;
    if (sd < cd && m > 0.5) maxc = max(maxc, ss);
  }
  gl_FragColor = vec4(acc / tot, maxc);
}`;

const dofCompFrag = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBlur;
uniform sampler2D tDepth;
varying vec2 vUv;
${DEPTH_FN}
void main(){
  vec4 sharp = texture2D(tColor, vUv);
  vec4 blur = texture2D(tBlur, vUv);
  float cs = abs(cocAt(texture2D(tDepth, vUv).r));
  float k = smoothstep(0.6, 2.2, max(cs, blur.a));
  gl_FragColor = vec4(mix(sharp.rgb, blur.rgb, k), 1.0);
}`;

const copyFrag = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main(){ gl_FragColor = texture2D(tSrc, vUv); }`;

const brightFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-0.5,-0.5)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 0.5,-0.5)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * contrib, vec3(40.0)), 1.0);
}`;

const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel; // source texel
varying vec2 vUv;
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  gl_FragColor = vec4((a + b + c + d) * 0.125 + e * 0.5, 1.0);
}`;

const upFrag = /* glsl */ `
uniform sampler2D tSrc;   // lower-res level to upsample
uniform sampler2D tBase;  // same-res level to add
uniform vec2 uTexel;      // source texel
uniform float uScatter;
varying vec2 vUv;
void main(){
  vec3 s = vec3(0.0);
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2( 0.0,-1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture2D(tSrc, vUv + uTexel * vec2( 0.0, 1.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  s /= 16.0;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s * uScatter, 1.0);
}`;

const raysFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uLight;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
uniform float uAspect;
varying vec2 vUv;
#define N 48
void main(){
  vec2 delta = (vUv - uLight) * uDensity / float(N);
  vec2 coord = vUv;
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < N; i++) {
    coord -= delta;
    acc += texture2D(tSrc, coord).rgb * illum;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc * uWeight / float(N), 1.0);
}`;

const finalFrag = /* glsl */ `
uniform sampler2D tComp;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRaysTint;
uniform vec2 uWhipDir;
uniform float uWhip;
uniform float uZoomBlur;
uniform vec2 uZoomCenter;
uniform float uExposure;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uGamma;
uniform float uSat;
uniform float uVignette;
uniform vec3 uVigColor;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform vec3 uFadeColor;
uniform float uFade;
uniform float uTime;
uniform vec2 uRes;
uniform float uChroma;
varying vec2 vUv;

vec3 scene(vec2 uv){
  return texture2D(tComp, uv).rgb + texture2D(tBloom, uv).rgb * uBloom + texture2D(tRays, uv).rgb * uRays * uRaysTint;
}
vec3 tonemap(vec3 x){
  float k = 0.80;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
vec3 toSRGB(vec3 c){
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec3 c;
  if (uWhip > 0.0005 || uZoomBlur > 0.0005) {
    c = vec3(0.0);
    for (int i = 0; i < 28; i++) {
      float f = float(i) / 27.0 - 0.5;
      vec2 off = uWhipDir * uWhip * f + (vUv - uZoomCenter) * uZoomBlur * f;
      c += scene(vUv + off);
    }
    c /= 28.0;
  } else if (uChroma > 0.0) {
    vec2 d = (vUv - 0.5) * uChroma;
    c = vec3(scene(vUv + d).r, scene(vUv).g, scene(vUv - d).b);
  } else {
    c = scene(vUv);
  }
  c *= uExposure;
  c = tonemap(c);
  c = max(c * uGain + uLift, 0.0);
  c = pow(c, vec3(1.0 / uGamma));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(1.05, 0.35, length(q));
  c = mix(c * uVigColor, c, mix(1.0, v, uVignette));
  c = mix(c, uFlashColor, clamp(uFlash, 0.0, 1.0));
  c = mix(c, uFadeColor, clamp(uFade, 0.0, 1.0));
  c = toSRGB(c);
  float n = hash(vUv * uRes + fract(uTime * 7.13) * 91.7) + hash(vUv * uRes * 1.37 + fract(uTime * 3.7) * 37.1) - 1.0;
  c += n * (1.6 / 255.0);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer;
    this.W = W;
    this.H = H;
    const hf = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const depthTex = new THREE.DepthTexture(W, H);
    depthTex.type = THREE.UnsignedIntType;
    this.rtMain = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true, depthTexture: depthTex,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.rtHalf = new THREE.WebGLRenderTarget(W / 2, H / 2, hf);
    this.rtComp = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType, samples: 4, depthBuffer: true,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.levels = [];
    let w = W / 2, h = H / 2;
    for (let i = 0; i < 6; i++) {
      this.levels.push({
        down: new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), hf),
        up: new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), hf),
      });
      w /= 2;
      h /= 2;
    }
    this.rtRays = new THREE.WebGLRenderTarget(W / 4, H / 4, hf);
    this.rtRaysSrc = new THREE.WebGLRenderTarget(W / 4, H / 4, hf);

    const dofU = () => ({
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uFocus: { value: 20 }, uAperture: { value: 0 },
      uNearMax: { value: 24 }, uFarMax: { value: 10 },
    });
    this.dofBlur = pass(dofBlurFrag, {
      tColor: { value: this.rtMain.texture }, tDepth: { value: depthTex },
      uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uRadius: { value: 24 }, ...dofU(),
    });
    this.dofComp = pass(dofCompFrag, {
      tColor: { value: this.rtMain.texture }, tBlur: { value: this.rtHalf.texture }, tDepth: { value: depthTex }, ...dofU(),
    });
    this.copy = pass(copyFrag, { tSrc: { value: null } });
    this.bright = pass(brightFrag, {
      tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1 / W, 1 / H) },
      uThreshold: { value: 1.0 }, uKnee: { value: 0.4 },
    });
    this.down = pass(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(upFrag, {
      tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.9 },
    });
    this.rays = pass(raysFrag, {
      tSrc: { value: null }, uLight: { value: new THREE.Vector2(0.5, 0.5) }, uDensity: { value: 0.9 },
      uDecay: { value: 0.965 }, uWeight: { value: 1.0 }, uAspect: { value: W / H },
    });
    this.final = pass(finalFrag, {
      tComp: { value: this.rtComp.texture }, tBloom: { value: this.levels[0].up.texture },
      tRays: { value: this.rtRays.texture }, uBloom: { value: 0.5 }, uRays: { value: 0 },
      uRaysTint: { value: new THREE.Color(1.0, 0.75, 0.4) },
      uWhipDir: { value: new THREE.Vector2(1, 0) }, uWhip: { value: 0 },
      uZoomBlur: { value: 0 }, uZoomCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uExposure: { value: 1 }, uLift: { value: new THREE.Vector3(0, 0, 0) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uGamma: { value: 1 }, uSat: { value: 1 }, uVignette: { value: 0.35 },
      uVigColor: { value: new THREE.Vector3(0.55, 0.3, 0.2) },
      uFlashColor: { value: new THREE.Color(1, 0.9, 0.7) }, uFlash: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) }, uFade: { value: 0 },
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(W, H) }, uChroma: { value: 0 },
    });
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  run(p, rt) {
    this.r.setRenderTarget(rt);
    this.r.render(p.scene, this.fsCam);
  }

  // params: {scene, camera, dof:{focus, aperture, nearMax, farMax, radius}, overlay:{scene,camera}|null,
  //          bloom:{threshold, strength, knee}, rays:{pos:[u,v], strength, density, decay}, final:{...}}
  render(P) {
    const r = this.r;
    r.autoClear = true;
    r.setRenderTarget(this.rtMain);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(P.scene, P.camera);

    const cam = P.camera;
    const dof = P.dof || {};
    for (const p of [this.dofBlur, this.dofComp]) {
      p.u.uNear.value = cam.near;
      p.u.uFar.value = cam.far;
      p.u.uFocus.value = dof.focus ?? 20;
      p.u.uAperture.value = dof.aperture ?? 0;
      p.u.uNearMax.value = dof.nearMax ?? 26;
      p.u.uFarMax.value = dof.farMax ?? 10;
    }
    this.dofBlur.u.uRadius.value = Math.max(dof.nearMax ?? 26, dof.farMax ?? 10) + 1;
    if ((dof.aperture ?? 0) > 0.01) {
      this.run(this.dofBlur, this.rtHalf);
      this.run(this.dofComp, this.rtComp);
    } else {
      this.copy.u.tSrc.value = this.rtMain.texture;
      this.run(this.copy, this.rtComp);
    }

    if (P.overlay && P.overlay.visible) {
      r.setRenderTarget(this.rtComp);
      r.autoClear = false;
      r.clearDepth();
      r.render(P.overlay.scene, P.overlay.camera);
      r.autoClear = true;
    }

    // bloom chain
    const B = P.bloom || {};
    this.bright.u.tSrc.value = this.rtComp.texture;
    this.bright.u.uThreshold.value = B.threshold ?? 1.0;
    this.bright.u.uKnee.value = B.knee ?? 0.5;
    this.run(this.bright, this.levels[0].down);
    for (let i = 1; i < this.levels.length; i++) {
      const src = this.levels[i - 1].down;
      this.down.u.tSrc.value = src.texture;
      this.down.u.uTexel.value.set(1 / src.width, 1 / src.height);
      this.run(this.down, this.levels[i].down);
    }
    const n = this.levels.length;
    this.copy.u.tSrc.value = this.levels[n - 1].down.texture;
    this.run(this.copy, this.levels[n - 1].up);
    for (let i = n - 2; i >= 0; i--) {
      const src = this.levels[i + 1].up;
      this.up.u.tSrc.value = src.texture;
      this.up.u.tBase.value = this.levels[i].down.texture;
      this.up.u.uTexel.value.set(1 / src.width, 1 / src.height);
      this.up.u.uScatter.value = B.scatter ?? 0.85;
      this.run(this.up, this.levels[i].up);
    }

    // god rays from the bright pass (quarter res)
    const R = P.rays || {};
    const raysOn = (R.strength ?? 0) > 0.001;
    if (raysOn) {
      this.copy.u.tSrc.value = this.levels[1].down.texture;
      this.run(this.copy, this.rtRaysSrc);
      this.rays.u.tSrc.value = this.rtRaysSrc.texture;
      this.rays.u.uLight.value.set(R.pos?.[0] ?? 0.5, R.pos?.[1] ?? 0.5);
      this.rays.u.uDensity.value = R.density ?? 0.9;
      this.rays.u.uDecay.value = R.decay ?? 0.965;
      this.rays.u.uWeight.value = R.weight ?? 1.0;
      this.run(this.rays, this.rtRays);
    }

    const F = this.final.u;
    const f = P.final || {};
    F.uBloom.value = B.strength ?? 0.5;
    F.uRays.value = raysOn ? R.strength : 0;
    if (R.tint) F.uRaysTint.value.setRGB(...R.tint);
    F.uWhip.value = f.whip ?? 0;
    F.uWhipDir.value.set(...(f.whipDir ?? [1, 0]));
    F.uZoomBlur.value = f.zoomBlur ?? 0;
    F.uZoomCenter.value.set(...(f.zoomCenter ?? [0.5, 0.5]));
    F.uExposure.value = f.exposure ?? 1;
    F.uLift.value.set(...(f.lift ?? [0, 0, 0]));
    F.uGain.value.set(...(f.gain ?? [1, 1, 1]));
    F.uGamma.value = f.gamma ?? 1;
    F.uSat.value = f.sat ?? 1;
    F.uVignette.value = f.vignette ?? 0.35;
    F.uVigColor.value.set(...(f.vigColor ?? [0.55, 0.3, 0.2]));
    F.uFlash.value = f.flash ?? 0;
    F.uFlashColor.value.setRGB(...(f.flashColor ?? [1, 0.9, 0.7]));
    F.uFade.value = f.fade ?? 0;
    F.uFadeColor.value.setRGB(...(f.fadeColor ?? [0, 0, 0]));
    F.uTime.value = P.time ?? 0;
    F.uChroma.value = f.chroma ?? 0;
    r.setRenderTarget(null);
    r.render(this.final.scene, this.fsCam);
  }
}
