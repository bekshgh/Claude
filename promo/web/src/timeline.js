import { buildIntro } from './shots/intro.js';
import { buildHeroes } from './shots/heroes.js';
import { buildFactory } from './shots/factory.js';
import { buildEnergy } from './shots/energy.js';
import { buildCode } from './shots/code.js';
import { buildTimelapse } from './shots/timelapse.js';
import { buildStage } from './shots/stage.js';
import { buildFinale } from './shots/finale.js';
import { BrickWipes } from './transitions.js';

const BUILDERS = [buildIntro, buildHeroes, buildFactory, buildEnergy, buildCode, buildTimelapse, buildStage, buildFinale];

// Maps global time to the shot that owns it and layers the brick wipes on top.
export function buildShots(ctx, extra = []) {
  const shots = [...BUILDERS, ...extra].map((b) => b(ctx));
  shots.sort((a, b) => a.t0 - b.t0);
  const wipes = new BrickWipes(ctx, [
    { t: 3.0, pattern: 'ltr' },
    { t: 4.5, pattern: 'diag' },
    { t: 6.0, pattern: 'radial' },
  ]);
  const pick = (t) => {
    for (const s of shots) if (t >= s.t0 && t < s.t1) return s;
    return t < shots[0].t0 ? shots[0] : shots[shots.length - 1];
  };
  return {
    shots,
    frame(t) {
      const s = pick(t);
      const P = s.update(t);
      const on = wipes.update(t);
      P.overlay = on ? { scene: wipes.scene, camera: wipes.camera, visible: true } : null;
      return P;
    },
    events() {
      return [...shots.flatMap((s) => s.events || []), ...wipes.events()].sort((a, b) => a.t - b.t);
    },
  };
}
