// Timing, easing and deterministic randomness. Every animated value in the
// film is a pure function of time so frames can be rendered in any order.

export const FPS = 60;
export const DURATION = 15;
export const BPM = 120;
export const BEAT = 60 / BPM;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const seg = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// Damped spring response to an impulse at t=0 (value starts at 1, settles to 0).
export function wobble(dt, freq = 9, damp = 7) {
  if (dt < 0) return 0;
  return Math.exp(-damp * dt) * Math.cos(2 * Math.PI * freq * dt);
}

// Squash & stretch factors for a landing impact at time t0 with strength k.
// Returns [sx, sy] (volume-preserving-ish).
export function impactSquash(t, t0, k = 0.3, freq = 6, damp = 9) {
  const w = wobble(t - t0, freq, damp);
  const sy = 1 - k * w;
  return [1 / Math.sqrt(Math.max(sy, 0.2)), sy];
}

// Keyframe track. keys: [[time, value, easeFnForSegmentEndingHere?], ...]
// value can be a number or an array.
export function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, e] = keys[i];
      if (t <= t1) {
        const [t0, v0] = keys[i - 1];
        const f = (e || ease.inOutCubic)(clamp((t - t0) / (t1 - t0)));
        if (Array.isArray(v0)) return v0.map((a, j) => a + (v1[j] - a) * f);
        return v0 + (v1 - v0) * f;
      }
    }
    return last[1];
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth deterministic 1D noise in [-1, 1].
export function noise1(x, seed = 0) {
  const h = (n) => {
    const s = Math.sin((n + seed * 101.3) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

// Parabolic jump from p0 to p1 (each [x,y,z]) peaking `apex` above the higher end.
export function jumpArc(p0, p1, apex, u) {
  const top = Math.max(p0[1], p1[1]) + apex;
  // solve for a parabola through (0,p0y), (1,p1y) with maximum `top`
  const a = p0[1], b = p1[1];
  // y(u) = a + B u + C u^2 ; choose vertex height = top
  // use quadratic Bezier with control point chosen to hit apex: y_peak ~ (a+b)/4 + c/2
  const c = 2 * top - (a + b) / 2;
  const y = (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;
  return [lerp(p0[0], p1[0], u), y, lerp(p0[2], p1[2], u)];
}

export const PALETTE = {
  amber: 0xd8901c,
  orange: 0xc0601a,
  rust: 0xa84018,
  white: 0xf7f1e8,
  yellow: 0xffc81e,
  darkRust: 0x5a1e0a,
  deepRust: 0x3a1206,
};
