import { describe, expect, it } from 'vitest';
import {
  BASE_STRAIN,
  FAULT_NM,
  HEAVE,
  LIFT_RISE,
  MAX_GRAPPLE_SOG,
  PART_RISE,
  ROUTE_BEARING,
  SHORE_NM,
  crossingAngle,
  endOhms,
  endReply,
  goodEnd,
  grappleRun,
  grappleStop,
  grappleStrain,
  heaveStep,
  heaveTension,
  runParts,
  runVerdict,
  trackMadeGood,
  type HeaveSpeed,
  type HeaveState,
} from '../src/game/logic4';

describe('the grappling run', () => {
  it('adds the current to the way through the water', () => {
    const still = trackMadeGood(0, 0.8, { set: 0, rate: 0 });
    expect(still.course).toBeCloseTo(0, 6);
    expect(still.speed).toBeCloseTo(0.8, 6);
    const t = trackMadeGood(90, 1, { set: 0, rate: 1 });
    expect(t.course).toBeCloseTo(45, 6);
    expect(t.speed).toBeCloseTo(Math.SQRT2, 6);
  });

  it('measures the crossing angle against the cable whichever way the run goes', () => {
    expect(crossingAngle(ROUTE_BEARING + 90)).toBeCloseTo(90, 6);
    expect(crossingAngle(ROUTE_BEARING - 90)).toBeCloseTo(90, 6);
    expect(crossingAngle(ROUTE_BEARING + 180)).toBeCloseTo(0, 6);
    expect(crossingAngle(ROUTE_BEARING + 30)).toBeCloseTo(30, 6);
  });

  it('accepts only headings that make good a slow track square across the cable', () => {
    const ok: number[] = [];
    for (let h = 0; h < 360; h++) if (runVerdict(h) === 'ok') ok.push(h);
    // Heading straight across the cable is not enough: the current sets the ship off the square.
    expect(runVerdict(ROUTE_BEARING + 270)).not.toBe('ok');
    expect(runVerdict(ROUTE_BEARING + 90)).not.toBe('ok');
    // There is a window of headings that works, all on the up-current run.
    expect(ok.length).toBeGreaterThan(3);
    for (const h of ok) {
      const t = trackMadeGood(h);
      expect(t.speed).toBeLessThanOrEqual(MAX_GRAPPLE_SOG);
      expect(Math.abs(crossingAngle(t.course) - 90)).toBeLessThanOrEqual(6);
    }
    expect(ok.every((h) => h > 290 && h < 320)).toBe(true);
    // The down-current run crosses square too, but too fast to bite.
    const across = [...Array(360).keys()].filter((h) => Math.abs(crossingAngle(trackMadeGood(h).course) - 90) <= 6);
    expect(across.some((h) => runVerdict(h) === 'fast')).toBe(true);
  });
});

describe('reading the dynamometer', () => {
  it('lays rocks before the cable and keeps the cable in the middle of the run', () => {
    for (let seed = 1; seed < 40; seed++)
      for (let a = 0; a < 4; a++) {
        const run = grappleRun(seed, a);
        expect(run.cableAt).toBeGreaterThanOrEqual(0.45);
        expect(run.cableAt).toBeLessThanOrEqual(0.57);
        expect(run.rocks[0]).toBeLessThan(run.cableAt - 0.05);
        for (const r of run.rocks) expect(Math.abs(r - run.cableAt)).toBeGreaterThan(0.05);
      }
  });

  it('shows a rock as a sudden spike and the cable as a steady climb', () => {
    const run = grappleRun(3, 0);
    const rock = run.rocks[0];
    const at = (p: number) => grappleStrain(run, p, 0) - BASE_STRAIN;
    expect(at(rock)).toBeGreaterThan(2);
    expect(at(rock + 0.03)).toBeLessThan(0.5);
    expect(at(run.cableAt)).toBeLessThan(0.5);
    expect(at(run.cableAt + 0.1)).toBeGreaterThan(at(run.cableAt + 0.05));
    expect(at(run.cableAt + 0.15)).toBeGreaterThan(at(run.cableAt + 0.1));
  });

  it('wants the engines stopped after the rise, not on it, and not too late', () => {
    const run = grappleRun(5, 1);
    const p = (rise: number) => run.cableAt + rise / (80 * 0.11);
    expect(grappleStop(run, run.rocks[0])).toBe('rock');
    let clear = run.rocks[0] + 0.03;
    while (run.rocks.some((r) => Math.abs(clear - r) < 0.03)) clear += 0.005;
    expect(clear).toBeLessThan(run.cableAt);
    expect(grappleStop(run, clear)).toBe('nothing');
    expect(grappleStop(run, p(LIFT_RISE / 2))).toBe('early');
    expect(grappleStop(run, p(LIFT_RISE + 0.1))).toBe('hooked');
    expect(grappleStop(run, p(PART_RISE + 0.1))).toBe('parted');
    expect(runParts(run, p(PART_RISE - 0.1))).toBe(false);
    expect(runParts(run, p(PART_RISE + 0.01))).toBe(true);
    // The window between lifting the bight and parting it is several seconds of panel time.
    expect((PART_RISE - LIFT_RISE) / 0.11).toBeGreaterThan(10);
  });

  it('only shows a skid on a run that will not do', () => {
    const run = grappleRun(7, 2);
    expect(grappleStrain(run, run.cableAt, 0, false) - grappleStrain(run, run.cableAt + 0.2, 0, false)).toBeGreaterThan(0.9);
    expect(grappleStop(run, run.cableAt, false)).toBe('skid');
    expect(grappleStop(run, 1, false)).toBe('skid');
    expect(grappleStop(run, run.cableAt + 0.15, false)).not.toBe('hooked');
    for (let p = 0; p <= 1; p += 0.01) expect(runParts(run, p, false)).toBe(false);
  });
});

describe('heaving up', () => {
  const play = (choose: (t: number, s: HeaveState) => HeaveSpeed) => {
    let s: HeaveState = { progress: 0, over: 0, parted: false };
    let t = 0;
    while (t < 400 && !s.parted && s.progress < 1) {
      s = heaveStep(s, choose(t, s), t, 1 / 30);
      t += 1 / 30;
    }
    return { s, t };
  };

  it('parts the bight if you heave fast through the swell', () => {
    expect(play(() => 2).s.parted).toBe(true);
    expect(play(() => 1).s.parted).toBe(true);
  });

  it('brings it up if you ease off as the bow lifts', () => {
    const r = play((t, s) => {
      const k = [0, 1, 2].filter((v) => heaveTension(v as HeaveSpeed, t + 0.4, s.progress) < HEAVE.limit - 0.05);
      return (k.length ? Math.max(...k) : 0) as HeaveSpeed;
    });
    expect(r.s.parted).toBe(false);
    expect(r.s.progress).toBe(1);
    expect(r.t).toBeLessThan(120);
  });
});

describe('the cut ends', () => {
  it('answers from Bell Cove on the good end and echoes reversed on the bad', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const good = goodEnd(seed);
      const bad = good === 'A' ? 'B' : 'A';
      expect(endReply(good, good, 'BC', true)).toBe('R TP');
      expect(endReply(good, good, 'BC', false)).toBe('R BC');
      // B (−···) reversed is ·−−− (J); C (−·−·) has no reversed letter. Then the thing's one word.
      expect(endReply(bad, good, 'BC', true)).toBe('J? R');
      expect(endReply(bad, good, 'SOS', false)).toBe('OSO R');
      expect(SHORE_NM + FAULT_NM).toBeCloseTo(1036.2, 6);
      expect(endOhms(good, good, 3.9)).toBeCloseTo(3.9 * SHORE_NM, 6);
      expect(endOhms(bad, good, 3.9)).toBeCloseTo(3.9 * FAULT_NM, 6);
    }
    const ends = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(goodEnd));
    expect(ends.size).toBe(2);
  });
});
