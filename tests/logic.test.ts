import { describe, expect, it } from 'vitest';
import {
  checkSafe,
  classifyPress,
  decodeLetter,
  dynamoAction,
  dynamoTick,
  encodeText,
  endsWithSOS,
  isDistressWavelength,
  newDynamo,
  wavelengthForKc,
  WARM_SECONDS,
  type DynamoState,
} from '../src/game/logic';
import { selectCamera, type CameraDef } from '../src/world/cameras';
import { NavGrid } from '../src/world/nav';
import { CollisionWorld } from '../src/world/collision';
import { parseState, newState } from '../src/game/state';
import { josa } from '../src/core/josa';
import { angleDiff, wrapAngle } from '../src/core/math';

describe('radio puzzle', () => {
  it('500 kc corresponds to the 600 m distress wave (λ = c / f)', () => {
    expect(wavelengthForKc(500)).toBe(600);
    expect(isDistressWavelength(600)).toBe(true);
    expect(isDistressWavelength(610)).toBe(false);
  });

  it('decodes Morse letters and recognises SOS', () => {
    expect(encodeText('SOS')).toEqual(['...', '---', '...']);
    expect(encodeText('SOS').map(decodeLetter).join('')).toBe('SOS');
    expect(decodeLetter('.-.-.-')).toBe('?');
    expect(endsWithSOS('XXSOS')).toBe(true);
    expect(endsWithSOS('SOSX')).toBe(false);
    expect(classifyPress(0.08)).toBe('.');
    expect(classifyPress(0.4)).toBe('-');
  });
});

describe('safe puzzle', () => {
  it('opens on the keel-laying date, not on the launch date', () => {
    expect(checkSafe([11, 3, 14])).toBe(true);
    expect(checkSafe([11, 9, 2])).toBe(false);
  });
});

describe('dynamo start-up procedure', () => {
  const run = (s: DynamoState, seconds: number) => {
    let st = s;
    for (let t = 0; t < seconds; t += 0.05) st = dynamoTick(st, 0.05).s;
    return st;
  };

  it('water-hammers when steam is admitted with the drains shut', () => {
    const r = dynamoAction(newDynamo(), 'steam-crack');
    expect(r.ev).toBe('hammer');
    expect(r.s.steam).toBe(0);
    expect(r.s.hammers).toBe(1);
  });

  it('water-hammers when the valve is thrown wide on a cold line', () => {
    const s = dynamoAction(newDynamo(), 'drain-open').s;
    expect(dynamoAction(s, 'steam-full').ev).toBe('hammer');
  });

  it('warns instead of hammering when opening fully while still warming through', () => {
    let s = dynamoAction(newDynamo(), 'drain-open').s;
    s = dynamoAction(s, 'steam-crack').s;
    expect(dynamoAction(s, 'steam-full').ev).toBe('not-warm');
  });

  it('follows the textbook sequence to rated speed and closes the breaker', () => {
    let s = dynamoAction(newDynamo(), 'drain-open').s;
    const crack = dynamoAction(s, 'steam-crack');
    expect(crack.ev).toBe('warming');
    s = run(crack.s, WARM_SECONDS + 0.2);
    expect(s.warm).toBe(1);
    s = dynamoAction(s, 'steam-full').s;
    s = dynamoAction(s, 'drain-close').s;
    expect(dynamoAction(s, 'breaker').ev).toBe('trip'); // too early
    s = run(s, 5);
    expect(s.rpm).toBeGreaterThanOrEqual(0.9);
    const on = dynamoAction(s, 'breaker');
    expect(on.ev).toBe('power');
    expect(on.s.breaker).toBe(true);
    expect(on.s.hammers).toBe(0);
  });

  it('cannot reach rated speed with the drains left open', () => {
    let s = dynamoAction(newDynamo(), 'drain-open').s;
    s = dynamoAction(s, 'steam-crack').s;
    s = run(s, WARM_SECONDS + 0.5);
    s = dynamoAction(s, 'steam-full').s;
    s = run(s, 8);
    expect(s.rpm).toBeLessThan(0.9);
  });
});

describe('fixed cameras', () => {
  const cams: CameraDef[] = [
    { id: 'a', pos: [0, 0, 0], look: [0, 0, 1], zones: [{ minX: 0, minZ: 0, maxX: 5, maxZ: 5 }] },
    { id: 'b', pos: [0, 0, 0], look: [0, 0, 1], zones: [{ minX: 4, minZ: 0, maxX: 10, maxZ: 5 }] },
  ];

  it('keeps the current shot inside overlapping zones (hysteresis)', () => {
    expect(selectCamera(cams, -1, 1, 1)).toBe(0);
    expect(selectCamera(cams, 0, 4.5, 1)).toBe(0);
    expect(selectCamera(cams, 1, 4.5, 1)).toBe(1);
    expect(selectCamera(cams, 0, 6, 1)).toBe(1);
  });

  it('keeps the last shot when the player is outside every zone', () => {
    expect(selectCamera(cams, 1, 50, 50)).toBe(1);
  });
});

describe('navigation grid', () => {
  it('routes around a wall', () => {
    const w = new CollisionWorld();
    w.addRect({ minX: -0.1, minZ: -3, maxX: 0.1, maxZ: 2 });
    const nav = NavGrid.build(w, { minX: -4, minZ: -4, maxX: 4, maxZ: 4 }, 0.25, 0.3);
    const path = nav.findPath({ x: -2, z: 0 }, { x: 2, z: 0 });
    expect(path).not.toBeNull();
    const pts = path!;
    expect(pts[pts.length - 1]).toEqual({ x: 2, z: 0 });
    // Every leg must be walkable on the grid, and the route has to go around the wall's north end.
    let prev = { x: -2, z: 0 };
    for (const p of pts) {
      expect(nav.clearLine(prev, p)).toBe(true);
      prev = p;
    }
    expect(Math.max(...pts.map((p) => p.z))).toBeGreaterThan(2);
  });
});

describe('save data', () => {
  it('round-trips a fresh state and rejects garbage', () => {
    const s = newState();
    s.flags.power = true;
    s.push['corridor:barricade'] = [-7.35, -1.15];
    const back = parseState(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(parseState({ v: 2 })).toBeNull();
    expect(parseState({ ...s, room: 'moon' })).toBeNull();
    expect(parseState('nope')).toBeNull();
  });

  it('sanitises bad fields instead of crashing', () => {
    const s = parseState({ ...newState(), hp: 999, equipped: 'axe', inv: ['lantern', 3], flags: { a: 'x', b: true } })!;
    expect(s.hp).toBe(6);
    expect(s.equipped).toBeNull();
    expect(s.inv).toEqual(['lantern']);
    expect(s.flags).toEqual({ b: true });
  });
});

describe('helpers', () => {
  it('attaches the right Korean particle', () => {
    expect(josa('소방 도끼', '을/를')).toBe('소방 도끼를');
    expect(josa('수밀문 개폐 핸들', '을/를')).toBe('수밀문 개폐 핸들을');
    expect(josa('선장실 열쇠', '이/가')).toBe('선장실 열쇠가');
    expect(josa('검은 돌', '으로/로')).toBe('검은 돌로');
    expect(josa('기관실', '으로/로')).toBe('기관실로');
    expect(josa('갑판', '으로/로')).toBe('갑판으로');
  });

  it('wraps angles', () => {
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5, 6);
    expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5, 6);
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6);
  });
});
