import { describe, expect, it } from 'vitest';
import {
  TANK2_DRAINED,
  bridgeReading,
  cableAction,
  decadeValue,
  faultDistance,
  balanceVerdict,
  finestRatio,
  galvanometerSpot,
  thingDistance,
  isEcho,
  knockReply,
  newCableEngine,
  newValveChest,
  pumpOutcome,
  stepTankLevel,
  type ValveChest,
} from '../src/game/logic2';

describe('knocking on the chain-locker doors', () => {
  it('the thing can only echo; the operator never does', () => {
    for (const sent of ['SOS', 'R', 'K', 'E', 'TP']) {
      expect(isEcho(sent, knockReply('mimic', sent))).toBe(true);
      expect(isEcho(sent, knockReply('pell', sent))).toBe(false);
    }
    expect(knockReply('pell', 'SOS')).toBe('R');
    expect(knockReply('pell', 'R')).toBe('K');
  });
});

describe('Wheatstone bridge', () => {
  it('reads the decade box times the ratio arms', () => {
    expect(decadeValue([1, 0, 8, 0])).toBe(1080);
    expect(bridgeReading([1, 0, 8, 0], 0.01)).toBeCloseTo(10.8, 9);
    expect(decadeValue([12, -3, 4, 5])).toBe(9045); // dials clamp to 0..9
  });

  it('swings the spot towards the side of the error, less with the shunt in', () => {
    const t = 10.8;
    expect(galvanometerSpot(t, 10.0, 1)).toBeLessThan(-0.8);
    expect(galvanometerSpot(t, 11.6, 1)).toBeGreaterThan(0.8);
    const shunted = Math.abs(galvanometerSpot(t, 11.0, 0.01));
    const open = Math.abs(galvanometerSpot(t, 11.0, 1));
    expect(shunted).toBeLessThan(0.1);
    expect(open).toBeGreaterThan(shunted * 5);
    expect(galvanometerSpot(t, t, 1)).toBeCloseTo(0, 9);
    expect(galvanometerSpot(Infinity, 9999, 1)).toBe(-1);
  });

  it('only counts a balance at full sensitivity, on the finest arms that reach the value', () => {
    const t = 10.8;
    expect(balanceVerdict(t, bridgeReading([1, 0, 8, 0], 0.01), 0.01, 1)).toBe('balanced');
    expect(balanceVerdict(t, bridgeReading([1, 0, 8, 0], 0.01), 0.01, 0.1)).toBe('shunted');
    expect(balanceVerdict(t, bridgeReading([1, 0, 8, 3], 0.01), 0.01, 1)).toBe('off');
    // Right value, but on coarser arms only the last two dials count.
    expect(balanceVerdict(t, bridgeReading([0, 1, 0, 8], 0.1), 0.1, 1)).toBe('coarse');
    expect(balanceVerdict(t, bridgeReading([0, 0, 1, 1], 1), 1, 1)).toBe('coarse');
    expect(balanceVerdict(Infinity, 9999, 1, 1)).toBe('off');
    // The sound end to the shore station needs the 1000 : 1000 arms.
    expect(finestRatio(4044.3)).toBe(1);
    expect(finestRatio(8.19)).toBe(0.01);
    expect(finestRatio(4e6)).toBe(null);
    expect(balanceVerdict(4044.3, 4044, 1, 1)).toBe('balanced');
  });

  it('can always be balanced, however far the thing has climbed', () => {
    // The nearest setting of the finest arms is never more than half a step off: it must always count.
    for (let s = 0; s <= 6 * 3600; s += 7) {
      const t = 3.9 * thingDistance(s);
      const r = finestRatio(t)!;
      const nearest = Math.round(t / r) * r;
      expect(balanceVerdict(t, nearest, r, 1)).toBe('balanced');
    }
  });

  it('shows the climb between two readings a minute apart', () => {
    const a = 3.9 * thingDistance(600);
    const b = 3.9 * thingDistance(660);
    // At least two steps of the finest (×0.01) arms.
    expect(a - b).toBeGreaterThan(0.02);
    // ...but slow enough to balance on: under one step per 10 s.
    expect(3.9 * (thingDistance(0) - thingDistance(10))).toBeLessThan(0.01);
    expect(thingDistance(1e9)).toBeGreaterThan(0.25);
  });

  it('turns the conductor resistance up to a dead earth into a distance', () => {
    expect(faultDistance(10.8, 4.5)).toBeCloseTo(2.4, 9);
  });
});

describe('valve chest', () => {
  const v = (o: Partial<ValveChest>): ValveChest => ({ ...newValveChest(), ...o });

  it('drains tank No.2 only with its suction open to overboard and the sea shut', () => {
    expect(pumpOutcome(v({ pump: true, tank2: true, overboard: true })).outcome).toBe('drain');
    expect(pumpOutcome(v({ pump: true, tank2: true, overboard: true, sea: true })).outcome).toBe('slow');
    expect(pumpOutcome(v({ pump: true, sea: true, fill2: true })).outcome).toBe('fill');
    expect(pumpOutcome(v({ pump: true, tank2: true, fill2: true })).outcome).toBe('circulate');
    expect(pumpOutcome(v({ pump: true, tank2: true })).outcome).toBe('deadhead');
    expect(pumpOutcome(v({ pump: true, overboard: true })).outcome).toBe('dry');
  });

  it('floods the tank through an open sea valve even with the pump stopped', () => {
    expect(pumpOutcome(v({ sea: true, tank2: true })).outcome).toBe('flood');
    expect(pumpOutcome(v({ sea: true })).outcome).toBe('idle');
  });

  it('empties the tank in well under a minute when set right', () => {
    let level = 1;
    let t = 0;
    const set = v({ pump: true, tank2: true, overboard: true });
    while (level > TANK2_DRAINED && t < 120) {
      level = stepTankLevel(level, set, 0.1);
      t += 0.1;
    }
    expect(level).toBeLessThanOrEqual(TANK2_DRAINED);
    expect(t).toBeLessThan(20);
    expect(stepTankLevel(0.5, v({ pump: true, sea: true, fill2: true }), 10)).toBeGreaterThan(0.5);
  });
});

describe('cable engine', () => {
  it('needs the key, then the clutch out, then the brake off', () => {
    let s = newCableEngine();
    expect(cableAction(s, 'unpin', false).ev).toBe('need-key');
    expect(cableAction(s, 'brake-stbd', true).ev).toBe('pinned');
    s = cableAction(s, 'unpin', true).s;
    expect(s.pinned).toBe(false);
    const dragged = cableAction(s, 'brake-stbd', true);
    expect(dragged.ev).toBe('dragged');
    expect(dragged.s.gone.stbd).toBe(false);
    s = cableAction(s, 'clutch-stbd', true).s;
    expect(s.clutch.stbd).toBe(false);
    const run = cableAction(s, 'brake-stbd', true);
    expect(run.ev).toBe('run-out');
    expect(run.s.gone.stbd).toBe(true);
    expect(run.s.gone.port).toBe(false);
    expect(cableAction(run.s, 'brake-stbd', true).ev).toBe('gone');
  });
});
