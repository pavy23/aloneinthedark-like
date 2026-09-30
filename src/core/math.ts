// Small math helpers shared across the game. Kept dependency-free so they can be unit tested in Node.

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. `rate` is roughly "1/seconds to close most of the gap". */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Wrap an angle to [-PI, PI). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Shortest signed difference b - a between two angles. */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a);
}

export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return current + angleDiff(current, target) * (1 - Math.exp(-rate * dt));
}

/**
 * Heading convention: heading 0 faces +Z, heading PI/2 faces +X.
 * forward = (sin h, cos h) in the XZ plane.
 */
export function headingToDir(h: number): { x: number; z: number } {
  return { x: Math.sin(h), z: Math.cos(h) };
}

export function dirToHeading(x: number, z: number): number {
  return Math.atan2(x, z);
}

/** Deterministic PRNG (mulberry32) so procedural textures look identical on every load. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap 1D value noise in [0,1] for flicker effects. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}
