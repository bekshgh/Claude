import * as THREE from 'three';
import { Post } from './post.js';
import { makeEnvMap } from './world.js';
import { plasticMaterial } from './bricks.js';
import { FPS, DURATION } from './util.js';
import { W, H } from './common.js';
import { buildShots } from './timeline.js';

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: false, stencil: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

let ctx = null;
let timeline = null;
let post = null;

async function loadTextures(files) {
  const loader = new THREE.TextureLoader();
  const out = {};
  await Promise.all(
    [...files].map(
      (f) =>
        new Promise((res, rej) =>
          loader.load(
            '../assets/' + f,
            (t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 8;
              out[f] = t;
              res();
            },
            undefined,
            () => rej(new Error('failed ' + f))
          )
        )
    )
  );
  return out;
}

async function init() {
  const rig = await (await fetch('../assets/rig.json')).json();
  const files = new Set();
  for (const e of [...Object.values(rig.chars), ...Object.values(rig.props)]) {
    if (e.layers) for (const L of Object.values(e.layers)) files.add(L.file);
  }
  files.add(rig.props.solar_panel.face);
  for (const k of ['screen', 'deck', 'front']) files.add(rig.props.laptop[k]);
  const textures = await loadTextures(files);
  const envMap = makeEnvMap(renderer);
  const plastic = plasticMaterial();
  ctx = { renderer, rig, textures, envMap, plastic, W, H };
  timeline = buildShots(ctx);
  post = new Post(renderer, W, H);
  // warm-up compile of every shot so per-frame timing is stable
  window.ready = true;
}

window.renderTime = (t) => {
  const P = timeline.frame(t);
  P.time = t;
  post.render(P);
  return true;
};
window.renderFrame = (i) => window.renderTime(i / FPS);
window.getEvents = () => timeline.events();
window.meta = { W, H, FPS, DURATION };

init().catch((e) => {
  console.error(e);
  window.initError = String(e && e.stack ? e.stack : e);
});
