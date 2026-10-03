import { describe, expect, it } from 'vitest';
import {
  CELLS_NEEDED,
  bridgeView,
  cellCharged,
  comboDigits,
  decodeCable,
  encodeCable,
  HUT_NM,
  fireResult,
  hutSignal,
  nightTape,
  storeMessage,
  tryCombo,
  landfallDistance,
  layoutTape,
  mirrorCode,
  mirrorDigit,
  rackGravities,
  readMirrored,
  readTape,
  stringStatus,
  switchboardAsFound,
  type Switchboard,
} from '../src/game/logic3';

describe('cable code on the siphon recorder', () => {
  it('encodes letters and numerals, and reads them back off the tape', () => {
    expect(encodeCable('SOS 4')).toEqual(['...', '---', '...', '', '....-']);
    expect(decodeCable('--...')).toBe('7');
    for (const text of ['CG TO BC R', 'STORE 472 KEEP', 'FAULT NEAR SHORE 0']) {
      expect(readTape(layoutTape(text).marks)).toBe(text);
    }
  });

  it('reads a message that came back with its polarity reversed as nonsense with shifted numerals', () => {
    expect(mirrorCode('.-..')).toBe('-.--');
    expect(readMirrored('SOS')).toBe('OSO');
    expect(readMirrored('472')).toBe('927');
    // Mirroring twice gives the original back, and the tape layout agrees with the text function.
    const back = readTape(layoutTape('STORE 472', true).marks);
    expect(back).toBe(readMirrored('STORE 472'));
    expect(back).toBe('OESKT 927');
    // Reading it mirrored again recovers the message…
    expect(readMirrored(back)).toBe('STORE 472');
    // …but some letters have no mirror image in the code at all (C = −·−· gives ·−·−): they read as '?'.
    expect(readMirrored('COIL')).toBe('?SMY');
    for (let d = 0; d <= 9; d++) {
      expect(readMirrored(String(d))).toBe(String(mirrorDigit(d)));
      expect(mirrorDigit(mirrorDigit(d))).toBe(d);
      expect(mirrorDigit(d)).not.toBe(d);
    }
  });

  it('keeps dots and dashes the same length: pauses alone separate letters and words', () => {
    const { marks } = layoutTape('E T');
    expect(marks.map((m) => m.dir)).toEqual([1, -1]);
    expect(marks[1].at - marks[0].at - 1).toBeGreaterThanOrEqual(6);
    expect(comboDigits(472)).toEqual([4, 7, 2]);
    expect(comboDigits(7)).toEqual([0, 0, 7]);
  });
});

describe('the night tape and the store', () => {
  it('holds the reversed echo of the store message, then the knock the right way up', () => {
    expect(storeMessage(472)).toBe('CG STORE 472 RK');
    const read = readTape(nightTape(472).marks);
    // C has no reversed image (it reads as '?'): a sign the whole message came back reversed.
    expect(read).toBe('?U OESKT 927 KR S S');
    expect(readMirrored(storeMessage(472))).toBe('?U OESKT 927 KR');
    expect(readTape(nightTape(5).marks).startsWith('?U OESKT 550 KR')).toBe(true);
  });

  it('opens only for the number that was sent, not for the number the echo reads', () => {
    expect(tryCombo([4, 7, 2], 472)).toBe('open');
    expect(tryCombo([9, 2, 7], 472)).toBe('mirrored');
    expect(tryCombo([4, 7, 3], 472)).toBe('wrong');
    expect(tryCombo([0, 0, 5], 5)).toBe('open');
    expect(tryCombo([5, 5, 0], 5)).toBe('mirrored');
  });
});

describe('accumulators', () => {
  it('has exactly twelve charged cells on every rack', () => {
    for (let seed = 1; seed < 60; seed++) {
      const sgs = rackGravities(seed);
      expect(sgs).toHaveLength(16);
      expect(sgs.filter(cellCharged)).toHaveLength(CELLS_NEEDED);
      for (const sg of sgs) {
        expect(sg).toBeGreaterThan(1.1);
        expect(sg).toBeLessThan(1.29);
      }
    }
  });

  it('is ready only with the twelve charged cells in series', () => {
    const sgs = rackGravities(7);
    const good = sgs.map((sg, i) => (cellCharged(sg) ? i : -1)).filter((i) => i >= 0);
    const bad = sgs.map((sg, i) => (cellCharged(sg) ? -1 : i)).filter((i) => i >= 0);
    expect(stringStatus(good, sgs).ready).toBe(true);
    expect(stringStatus(good.slice(1), sgs)).toMatchObject({ count: 11, ready: false });
    expect(stringStatus([...good.slice(1), bad[0]], sgs)).toMatchObject({ count: 12, weak: 1, ready: false });
  });
});

describe('the line switchboard', () => {
  const sw = (o: Partial<Switchboard>): Switchboard => ({ ...switchboardAsFound(), ...o });

  it('lets the bridge see the cable only with the condenser bypassed', () => {
    expect(bridgeView(sw({}))).toBe('none');
    expect(bridgeView(sw({ bridge: true }))).toBe('open');
    expect(bridgeView(sw({ bridge: true, condenser: false }))).toBe('line');
  });

  it('only fires into the cable with everything else off the line', () => {
    const clear = { recorder: false, condenser: false, protector: false, bridge: false, coil: true };
    expect(fireResult(clear, true)).toBe('arc');
    expect(fireResult(clear, false)).toBe('weak');
    expect(fireResult({ ...clear, coil: false }, true)).toBe('no-coil');
    expect(fireResult({ ...clear, protector: true }, true)).toBe('protector');
    expect(fireResult({ ...clear, condenser: true }, true)).toBe('condenser');
    expect(fireResult({ ...clear, recorder: true }, true)).toBe('recorder');
    expect(fireResult({ ...clear, bridge: true }, true)).toBe('bridge');
    expect(fireResult({ ...switchboardAsFound(), coil: true }, true)).not.toBe('arc');
  });
});

describe('landfall', () => {
  it('closes on the shore but never quite arrives', () => {
    expect(landfallDistance(0)).toBeCloseTo(0.34, 6);
    expect(landfallDistance(600)).toBeLessThan(landfallDistance(0));
    expect(landfallDistance(1e9)).toBeGreaterThan(HUT_NM);
  });

  it('fires only for whoever answers K with R', () => {
    let s = hutSignal('idle', 'SOS');
    expect(s.stage).toBe('idle');
    expect(s.heard).toEqual([{ from: 'thing', text: 'SOS' }]);
    s = hutSignal('idle', 'R');
    expect(s.stage).toBe('asked');
    expect(s.heard.map((h) => `${h.from}:${h.text}`)).toEqual(['thing:R', 'pell:K', 'thing:K']);
    // Copying the question back is what the thing does.
    expect(hutSignal('asked', 'K').stage).toBe('asked');
    const fire = hutSignal('asked', 'R');
    expect(fire.stage).toBe('fire');
    expect(fire.heard.at(-1)).toEqual({ from: 'pell', text: 'R' });
    expect(hutSignal('fire', 'R').heard).toEqual([]);
  });
});
