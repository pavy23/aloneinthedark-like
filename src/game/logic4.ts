// Act 4 puzzle logic ("The Grapnel", the repair ship over the cable's grave). Pure functions (no DOM, no
// three.js) so they can be unit tested.

import { MORSE } from './logic';
import { mirrorCode } from './logic3';

// ---------------------------------------------------------------- The grappling run on the chart

/** The cable's line at the site, degrees true (from the route chart; game value). */
export const ROUTE_BEARING = 64;
/** The set and rate of the surface current, as the ship drifted while stopped (toward, knots; game value). */
export const CURRENT = { set: 100, rate: 0.5 } as const;
/** Speed through the water at "dead slow" with the grapnel down (knots; game value). */
export const DEAD_SLOW = 0.8;
/** The run must cross the cable within this many degrees of a right angle. */
export const SQUARE_TOLERANCE = 6;
/** Speed over the ground above which a grapnel skips over the cable instead of biting (knots; game value). */
export const MAX_GRAPPLE_SOG = 0.6;

const RAD = Math.PI / 180;

export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** The ship's track over the ground: its own way through the water plus the current. */
export function trackMadeGood(heading: number, speed: number = DEAD_SLOW, current: { set: number; rate: number } = CURRENT): { course: number; speed: number } {
  const x = Math.sin(heading * RAD) * speed + Math.sin(current.set * RAD) * current.rate;
  const y = Math.cos(heading * RAD) * speed + Math.cos(current.set * RAD) * current.rate;
  return { course: norm360(Math.atan2(x, y) / RAD), speed: Math.hypot(x, y) };
}

/** Angle (0..90°) between the track and the cable's line. */
export function crossingAngle(course: number, route: number = ROUTE_BEARING): number {
  const d = Math.abs(norm360(course - route) % 180);
  return d > 90 ? 180 - d : d;
}

export type RunVerdict = 'ok' | 'oblique' | 'fast';

/** Will a run on this heading do? It must cross square to the cable, and slowly over the ground. */
export function runVerdict(heading: number): RunVerdict {
  const t = trackMadeGood(heading);
  if (Math.abs(crossingAngle(t.course) - 90) > SQUARE_TOLERANCE) return 'oblique';
  if (t.speed > MAX_GRAPPLE_SOG) return 'fast';
  return 'ok';
}

// ---------------------------------------------------------------- The dynamometer during the run

/** Seconds a run takes on the panel (the real thing took hours: the panel is the bosun's compressed view). */
export const RUN_SECONDS = 80;
/** Resting strain on the grapnel rope with the grapnel on the bottom (tons; game value). */
export const BASE_STRAIN = 3;
/** How fast the strain climbs once the cable is in the grapnel (tons per second of run). */
export const HOOK_RAMP = 0.11;
/** Rise in strain at which the bight is off the bottom and will stay in the grapnel. */
export const LIFT_RISE = 0.8;
/** Rise at which, steaming on, the cable parts at the grapnel. */
export const PART_RISE = 2.4;
/** A rock: the grapnel snags and jumps free, a sharp spike this high and this wide (progress units). */
export const ROCK_SPIKE = 2.6;
export const ROCK_WIDTH = 0.015;

export interface GrappleRun {
  /** Where along the run (0..1) the grapnel meets the cable. */
  cableAt: number;
  /** Where it snags on rocks. */
  rocks: number[];
}

function rng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The bottom along one run: a rock or two before the cable, sometimes one after (fixed by seed and attempt). */
export function grappleRun(seed: number, attempt: number): GrappleRun {
  const r = rng(seed * 31 + attempt * 977 + 7);
  for (let i = 0; i < 3; i++) r();
  const cableAt = 0.45 + r() * 0.12;
  const rocks = [0.14 + r() * 0.1];
  if (r() < 0.7) rocks.push(rocks[0] + 0.1 + r() * (cableAt - rocks[0] - 0.16));
  if (r() < 0.4) rocks.push(cableAt + 0.3 + r() * 0.1);
  return { cableAt, rocks: rocks.map((p) => Math.round(p * 1000) / 1000) };
}

/** The swell working on the rope, independent of the bottom (tons). */
export function swellStrain(t: number): number {
  return 0.3 * Math.sin((2 * Math.PI * t) / 7.5) + 0.08 * Math.sin(t * 5.1);
}

/** Rise in strain from the cable in the grapnel at progress p. */
export function cableRise(run: GrappleRun, p: number): number {
  return Math.max(0, (p - run.cableAt) * RUN_SECONDS * HOOK_RAMP);
}

/** On a run that will not do (oblique, or too fast over the ground) the grapnel skids over the cable: a brief bump. */
export const SKID_RISE = 1.0;
export const SKID_WIDTH = 0.025;

export function skidRise(run: GrappleRun, p: number): number {
  const d = Math.abs(p - run.cableAt);
  return d < SKID_WIDTH ? SKID_RISE * (1 - d / SKID_WIDTH) : 0;
}

/**
 * Strain on the dynamometer at progress p (time t drives the swell). `bites` is false on a run that will not
 * do: the cable only shows as the bump of the grapnel skidding over it.
 */
export function grappleStrain(run: GrappleRun, p: number, t: number, bites = true): number {
  let s = BASE_STRAIN + swellStrain(t) + (bites ? cableRise(run, p) : skidRise(run, p));
  for (const rock of run.rocks) {
    const d = Math.abs(p - rock);
    if (d < ROCK_WIDTH) s += ROCK_SPIKE * (1 - d / ROCK_WIDTH);
  }
  return s;
}

export type GrappleResult = 'hooked' | 'early' | 'rock' | 'parted' | 'nothing' | 'skid';

/** Steaming on to p: has the cable parted at the grapnel? */
export function runParts(run: GrappleRun, p: number, bites = true): boolean {
  return bites && cableRise(run, p) >= PART_RISE;
}

/**
 * Stopping the engines at progress p and heaving in. Right: after an unmistakable, steady rise, steamed on
 * a little to lift the bight off the bottom. Too soon and it slips out on the way up; on a rock's spike the
 * grapnel comes up empty; too late and it has parted. On a run that will not do, the grapnel only skids
 * over the cable ('skid': stopped on the bump, or the run went past the cable without a bite).
 */
export function grappleStop(run: GrappleRun, p: number, bites = true): GrappleResult {
  if (!bites) {
    if (skidRise(run, p) > 0 || p >= 1) return 'skid';
    if (run.rocks.some((r) => Math.abs(p - r) <= ROCK_WIDTH * 1.4)) return 'rock';
    return 'nothing';
  }
  const rise = cableRise(run, p);
  if (rise >= PART_RISE) return 'parted';
  if (rise >= LIFT_RISE) return 'hooked';
  if (rise > 0) return 'early';
  if (run.rocks.some((r) => Math.abs(p - r) <= ROCK_WIDTH * 1.4)) return 'rock';
  return 'nothing';
}

// ---------------------------------------------------------------- Heaving up the bight

export const HEAVE = {
  /** Strain with the bight hanging from the bow at the start of the heave (tons). */
  base: 4.2,
  /** Snatch as the bow lifts on a swell (tons, at the crest). */
  swell: 1.2,
  /** Added strain per notch of heaving speed. */
  perSpeed: 0.8,
  /** The bight parts above this. */
  limit: 6.1,
  /** Progress per second at stop, slow, half. */
  rates: [0, 0.012, 0.024] as const,
  /** Seconds between swells. */
  period: 7,
  /** Seconds above the limit before it goes. */
  grace: 0.35,
} as const;

export type HeaveSpeed = 0 | 1 | 2;

/** Bow lifting (0..1, 1 at the crest of a swell) at time t. */
export function bowLift(t: number): number {
  return Math.max(0, Math.sin((2 * Math.PI * t) / HEAVE.period));
}

/** Strain at the bow while heaving: less as the bight comes up, more as the bow lifts and the drum turns faster. */
export function heaveTension(speed: HeaveSpeed, t: number, progress: number): number {
  return HEAVE.base * (1 - 0.35 * Math.min(1, progress)) + HEAVE.swell * bowLift(t) + HEAVE.perSpeed * speed;
}

export interface HeaveState {
  progress: number;
  over: number;
  parted: boolean;
}

export function heaveStep(s: HeaveState, speed: HeaveSpeed, t: number, dt: number): HeaveState {
  if (s.parted || s.progress >= 1) return s;
  const tension = heaveTension(speed, t, s.progress);
  const over = tension > HEAVE.limit ? s.over + dt : 0;
  if (over > HEAVE.grace) return { progress: s.progress, over, parted: true };
  return { progress: Math.min(1, s.progress + HEAVE.rates[speed] * dt), over, parted: false };
}

// ---------------------------------------------------------------- The two cut ends

export type EndId = 'A' | 'B';

/** Where the fault lies, in nautical miles of cable from Bell Cove (the work order's figure; game value). */
export const FAULT_FROM_SHORE = 1036.2;
/** From the cut to the fault along the bad end: the cable is grappled short of the fault, on the Bell Cove side. */
export const FAULT_NM = 0.8;
/** From the cut back to Bell Cove along the good end. */
export const SHORE_NM = FAULT_FROM_SHORE - FAULT_NM;

/** Which of the two cut ends runs back to Bell Cove (the other runs on through the fault). */
export function goodEnd(seed: number): EndId {
  const r = rng(seed * 13 + 5);
  // (The first draws of this generator from a small seed are all tiny: throw a few away.)
  for (let i = 0; i < 4; i++) r();
  return r() < 0.5 ? 'A' : 'B';
}

const ENCODE: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/**
 * What comes back after calling down an end. Bell Cove answers along the good end ("R", and Pell signs
 * himself); along the bad end the thing at the fault sends the call straight back with its polarity reversed
 * — and then the one word it learned at Bell Cove, "R".
 */
export function endReply(end: EndId, good: EndId, sent: string, pell: boolean): string {
  if (end === good) return pell ? 'R TP' : 'R BC';
  const echo = sent
    .toUpperCase()
    .split('')
    .map((c) => (c === ' ' ? ' ' : (MORSE[mirrorCode(ENCODE[c] ?? '')] ?? '?')))
    .join('');
  return `${echo} R`;
}

/** Copper resistance of an end on the bridge: the long run to the shore station, or a dead earth close by. */
export function endOhms(end: EndId, good: EndId, ohmsPerNm: number): number {
  return ohmsPerNm * (end === good ? SHORE_NM : FAULT_NM);
}

// ---------------------------------------------------------------- The root

/** Blows with the axe to cut the black heart out of the root on the bow. */
export const ROOT_HITS = 4;
