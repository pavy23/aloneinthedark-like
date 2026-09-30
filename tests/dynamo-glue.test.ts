import { describe, expect, it } from 'vitest';
import { getDyn, setDyn } from '../src/game/dynamo';
import { dynamoAction, dynamoTick } from '../src/game/logic';
import type { GameAPI } from '../src/world/types';

/** Just enough of GameAPI for the flag-backed dynamo glue. */
function fakeGame(): GameAPI {
  const flags: Record<string, boolean | number> = {};
  return {
    flag: (n: string) => !!flags[n],
    num: (n: string) => (typeof flags[n] === 'number' ? (flags[n] as number) : flags[n] ? 1 : 0),
    setFlag: (n: string, v: boolean | number = true) => {
      flags[n] = v;
    },
  } as unknown as GameAPI;
}

describe('dynamo state stored in save flags', () => {
  it.each([60, 144, 500, 1000])('warms through and reaches rated speed at %i fps', (fps) => {
    const g = fakeGame();
    const dt = 1 / fps;
    const act = (a: Parameters<typeof dynamoAction>[1]) => setDyn(g, dynamoAction(getDyn(g), a).s);
    const run = (seconds: number) => {
      for (let i = 0; i < seconds * fps; i++) setDyn(g, dynamoTick(getDyn(g), dt).s);
    };
    act('drain-open');
    act('steam-crack');
    run(4.5);
    expect(getDyn(g).warm).toBe(1);
    act('steam-full');
    act('drain-close');
    run(5);
    expect(getDyn(g).rpm).toBeGreaterThanOrEqual(0.9);
    expect(dynamoAction(getDyn(g), 'breaker').ev).toBe('power');
  });
});
