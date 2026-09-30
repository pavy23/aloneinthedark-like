import { describe, expect, it } from 'vitest';
import { CollisionWorld, circleRectPush, circleSegmentPush, distToRect, rectFromCenter, segmentHitsRect, segmentsIntersect } from '../src/world/collision';

describe('circle vs rectangle', () => {
  const r = rectFromCenter(0, 0, 2, 2);

  it('ignores circles that do not touch', () => {
    expect(circleRectPush(3, 0, 0.5, r)).toBeNull();
  });

  it('pushes a touching circle out along the separating axis', () => {
    const p = circleRectPush(1.3, 0, 0.5, r)!;
    expect(p.x).toBeCloseTo(0.2, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('handles a centre inside the rectangle by leaving through the nearest edge', () => {
    const p = circleRectPush(0.8, 0.1, 0.3, r)!;
    expect(p.x).toBeCloseTo(0.2 + 0.3, 6);
    expect(p.z).toBe(0);
  });

  it('measures distance to a rectangle', () => {
    expect(distToRect(0, 0, r)).toBe(0);
    expect(distToRect(4, 0, r)).toBe(3);
    expect(distToRect(4, 5, r)).toBeCloseTo(5, 6);
  });
});

describe('segments', () => {
  it('pushes a circle off a diagonal wall', () => {
    const p = circleSegmentPush(0.1, 0, 0.3, { ax: -1, az: -1, bx: 1, bz: 1 })!;
    // Closest point on the line y=x from (0.1,0) is (0.05,0.05); distance ~0.0707
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.3 - Math.hypot(0.05, 0.05), 6);
  });

  it('detects segment intersections and segment/rect hits', () => {
    expect(segmentsIntersect(-1, 0, 1, 0, { ax: 0, az: -1, bx: 0, bz: 1 })).toBe(true);
    expect(segmentsIntersect(-1, 2, 1, 2, { ax: 0, az: -1, bx: 0, bz: 1 })).toBe(false);
    const r = rectFromCenter(0, 0, 1, 1);
    expect(segmentHitsRect(-2, 0, 2, 0, r)).toBe(true);
    expect(segmentHitsRect(-2, 2, 2, 2, r)).toBe(false);
  });
});

describe('CollisionWorld', () => {
  it('stops a fast-moving circle at a thin wall instead of tunnelling through', () => {
    const w = new CollisionWorld();
    w.addRect({ minX: 1, minZ: -5, maxX: 1.1, maxZ: 5 });
    const res = w.moveCircle(0, 0, 3, 0, 0.28);
    expect(res.hit).toBe(true);
    expect(res.x).toBeLessThanOrEqual(1 - 0.28 + 1e-6);
  });

  it('slides along walls when moving diagonally', () => {
    const w = new CollisionWorld();
    w.addRect({ minX: -5, minZ: 1, maxX: 5, maxZ: 1.2 });
    const res = w.moveCircle(0, 0, 1, 1, 0.3);
    expect(res.z).toBeCloseTo(0.7, 3);
    expect(res.x).toBeCloseTo(1, 3);
  });

  it('can disable colliders by tag (e.g. a door that opened)', () => {
    const w = new CollisionWorld();
    w.addRect({ minX: 1, minZ: -1, maxX: 1.2, maxZ: 1 }, 'door');
    expect(w.pointFree(1.1, 0, 0.2)).toBe(false);
    w.setEnabled('door', false);
    expect(w.pointFree(1.1, 0, 0.2)).toBe(true);
  });

  it('checks free space for pushables and line of sight', () => {
    const w = new CollisionWorld();
    w.addRect({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 });
    expect(w.rectFree(rectFromCenter(3, 3, 1, 1))).toBe(true);
    expect(w.rectFree(rectFromCenter(1.2, 0.5, 1, 1))).toBe(false);
    expect(w.lineOfSight(-1, 0.5, 2, 0.5)).toBe(false);
    expect(w.lineOfSight(-1, 2, 2, 2)).toBe(true);
  });
});
