import { describe, expect, it } from 'vitest';
import { ACCEPT, DOSSIER_GROUPS, PELL_WITNESS, POINTS, dossier, established, establishes, pointBit, verdict, type PointId } from '../src/game/logic5';
import { DOCS, ITEMS } from '../src/game/content';

const all = (points: PointId[]) => points.reduce((m, p) => m | pointBit(p), 0);

describe('the dossier', () => {
  it('holds only records the investigator carried away, each once', () => {
    for (const pell of [false, true]) {
      const d = dossier(pell);
      expect(new Set(d).size).toBe(d.length);
      for (const id of d) {
        if (id === PELL_WITNESS) continue;
        expect(DOCS[id], id).toBeDefined();
        expect(ITEMS[id]?.kind, id).toBe('doc');
      }
    }
    expect(dossier(true)).toContain(PELL_WITNESS);
    expect(dossier(true)).toContain('pellLetter');
    expect(dossier(false)).not.toContain(PELL_WITNESS);
    expect(dossier(false)).toContain('bcWire');
    expect(DOSSIER_GROUPS.length).toBe(3);
  });

  it('can settle every point from the dossier, with or without Pell', () => {
    for (const pell of [false, true]) {
      const d = dossier(pell);
      for (const p of POINTS) expect(d.some((ex) => establishes(p, ex, pell)), `${p} ${pell}`).toBe(true);
    }
    for (const p of POINTS) for (const ex of ACCEPT[p]) if (ex !== PELL_WITNESS) expect(dossier(false)).toContain(ex);
  });

  it('only takes the right records', () => {
    expect(establishes('cause', 'logPage', false)).toBe(true);
    expect(establishes('cause', 'captainLog', false)).toBe(false);
    expect(establishes('authority', 'haleLetter', false)).toBe(true);
    expect(establishes('authority', 'commission', true)).toBe(false);
    // Pell's statement only exists when he came ashore.
    expect(establishes('credit', PELL_WITNESS, true)).toBe(true);
    expect(establishes('credit', PELL_WITNESS, false)).toBe(false);
    expect(establishes('cause', PELL_WITNESS, true)).toBe(false);
  });
});

describe('the ruling', () => {
  it('pays in full when everything is shown', () => {
    const v = verdict(all([...POINTS]));
    expect(v).toEqual({ hull: true, cable: true, testimony: true, payment: 'full', score: 6 });
  });

  it('pays nothing until the proximate cause is shown', () => {
    const v = verdict(all(['crew', 'flooding', 'authority', 'peril', 'credit']));
    expect(v.payment).toBe('withheld');
    expect(v.hull).toBe(false);
    expect(v.cable).toBe(false);
    expect(v.testimony).toBe(true);
    expect(v.score).toBe(5);
  });

  it('needs both the order and the peril for the cable, and no wilful flooding for the ship', () => {
    expect(verdict(all(['cause', 'flooding', 'authority'])).payment).toBe('part');
    expect(verdict(all(['cause', 'flooding', 'authority'])).cable).toBe(false);
    expect(verdict(all(['cause', 'authority', 'peril'])).hull).toBe(false);
    expect(verdict(all(['cause', 'authority', 'peril'])).payment).toBe('part');
    // The crew's conduct does not decide payment (s.55(2)(a)); only the score.
    expect(verdict(all(['cause', 'flooding', 'authority', 'peril'])).payment).toBe('full');
  });

  it('round-trips the established points through a bit mask', () => {
    const m = all(['cause', 'peril']);
    expect([...established(m)].sort()).toEqual(['cause', 'peril']);
    expect(established(0).size).toBe(0);
  });
});
