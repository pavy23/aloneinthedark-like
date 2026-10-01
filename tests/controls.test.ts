import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEADZONE, MoveLatch, basisFromView, toWorld, type StickInput } from '../src/game/controls';
import { FollowCam, rayToWalls, type WallLine } from '../src/game/FollowCam';

const digital = (x: number, y: number, sig: string): StickInput => ({ x, y, analog: false, sig });
const analog = (x: number, y: number): StickInput => ({ x, y, analog: true, sig: '' });

describe('screen-relative basis', () => {
  it('maps stick up to the view direction and stick right to screen right', () => {
    // three.js cameras look down their local -Z; a camera looking along world -Z has +X on its right.
    const b = basisFromView(0, -5);
    expect(toWorld(b, 0, 1)).toEqual({ x: 0, z: -1 });
    const right = toWorld(b, 1, 0);
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.z).toBeCloseTo(0, 9);
    // Turned round (looking along +Z), screen right is world -X.
    expect(toWorld(basisFromView(0, 1), 1, 0).x).toBeCloseTo(-1, 9);
  });

  it('normalises diagonals', () => {
    const w = toWorld(basisFromView(1, 0), 1, 1);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(1, 9);
  });

  it('falls back to a heading when the camera looks straight down', () => {
    const b = basisFromView(0, 0, Math.PI / 2);
    expect(b.fx).toBeCloseTo(1, 9);
    expect(b.fz).toBeCloseTo(0, 9);
  });
});

describe('MoveLatch', () => {
  const camA = basisFromView(0, -1); // right = +X
  const camB = basisFromView(1, 0); // a fixed-camera cut: now right = +Z

  it('reports nothing inside the dead zone', () => {
    const l = new MoveLatch();
    expect(l.resolve(analog(DEADZONE * 0.5, 0), camA, true)).toBeNull();
  });

  it('follows the live camera every frame in follow mode', () => {
    const l = new MoveLatch();
    expect(l.resolve(digital(1, 0, '0001'), camA, true)!.x).toBeCloseTo(1, 9);
    expect(l.resolve(digital(1, 0, '0001'), camB, true)!.z).toBeCloseTo(1, 9);
  });

  it('keeps a held direction through a camera cut until the keys change', () => {
    const l = new MoveLatch();
    const before = l.resolve(digital(1, 0, '0001'), camA, false)!;
    const held = l.resolve(digital(1, 0, '0001'), camB, false)!; // camera cut, same keys
    expect(held.x).toBeCloseTo(before.x, 9);
    expect(held.z).toBeCloseTo(before.z, 9);
    const changed = l.resolve(digital(0.7071, 0.7071, '1001'), camB, false)!; // now also pressing up
    const expected = toWorld(camB, 0.7071, 0.7071);
    expect(changed.x).toBeCloseTo(expected.x, 6);
    expect(changed.z).toBeCloseTo(expected.z, 6);
  });

  it('re-reads the camera after letting go', () => {
    const l = new MoveLatch();
    l.resolve(digital(1, 0, '0001'), camA, false);
    expect(l.resolve(digital(0, 0, '0000'), camB, false)).toBeNull();
    expect(l.resolve(digital(1, 0, '0001'), camB, false)!.z).toBeCloseTo(1, 9);
  });

  it('holds through small analog wobbles but not a real change of direction', () => {
    const l = new MoveLatch();
    l.resolve(analog(1, 0), camA, false);
    const wobble = l.resolve(analog(Math.cos(0.3), Math.sin(0.3)), camB, false)!;
    const expected = toWorld(camA, Math.cos(0.3), Math.sin(0.3));
    expect(wobble.x).toBeCloseTo(expected.x, 9);
    expect(wobble.z).toBeCloseTo(expected.z, 9);
    const turned = l.resolve(analog(0, 1), camB, false)!;
    expect(turned.x).toBeCloseTo(1, 9); // camB forward
    expect(turned.mag).toBeCloseTo(1, 9);
  });
});

describe('follow camera wall rays', () => {
  const box = { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };

  it('stops at the room bounds from inside', () => {
    expect(rayToWalls(0, 0, 1, 0, [], box)).toBeCloseTo(2, 9);
    expect(rayToWalls(1, 0, -1, 0, [], box)).toBeCloseTo(3, 9);
    const d = Math.SQRT1_2;
    expect(rayToWalls(0, 0, d, d, [], box)).toBeCloseTo(2 * Math.SQRT2, 9);
  });

  it('ignores the bounds when standing outside them', () => {
    expect(rayToWalls(5, 0, 1, 0, [], box)).toBe(Infinity);
  });

  it('hits the nearest wall line in front, including doorway lines', () => {
    const walls: WallLine[] = [
      [1, -1, 1, 1],
      [0.5, -1, 0.5, 1],
      [-1, -1, -1, 1], // behind
      [0, 1.5, 3, 1.5], // parallel to the ray
    ];
    expect(rayToWalls(0, 0, 1, 0, walls, null)).toBeCloseTo(0.5, 9);
    expect(rayToWalls(0, 0, 0, 1, walls, null)).toBeCloseTo(1.5, 9);
    expect(rayToWalls(0, 0, 1, 0, [[0, 1.5, 3, 1.5]], null)).toBe(Infinity);
    expect(rayToWalls(0, 0, 1, 0, [[1, 0.2, 1, 1]], null)).toBe(Infinity); // misses the segment
  });
});

describe('follow camera placement', () => {
  // A 4 m square room: wall lines on every side, bounds to match.
  const walls: WallLine[] = [
    [-2, -2, 2, -2],
    [2, -2, 2, 2],
    [2, 2, -2, 2],
    [-2, 2, -2, -2],
  ];
  const bounds = { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };
  const setup = () => {
    const fc = new FollowCam();
    fc.setRoom(new THREE.Group(), walls, bounds);
    return { fc, cam: new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 90) };
  };

  it('backed against a wall, looks from the side rather than through the wall or from in front', () => {
    const { fc, cam } = setup();
    fc.snap(0); // facing +Z with the wall 0.6 m behind
    fc.update(cam, 1 / 60, 0, -1.4, 0, false);
    const p = cam.position;
    expect(p.z).toBeGreaterThan(-2);
    expect(Math.abs(p.x)).toBeLessThan(2);
    expect(Math.abs(p.x)).toBeGreaterThan(1.2); // off to one side...
    expect(p.z).toBeLessThan(-1); // ...not out in front of him
    expect(fc.reach).toBeGreaterThan(0.55);
  });

  it('settles behind him once he walks away from the wall', () => {
    const { fc, cam } = setup();
    fc.snap(0);
    let z = -1.4;
    for (let i = 0; i < 150; i++) {
      z += 1.4 / 60;
      if (z > 1.2) z = 1.2;
      fc.update(cam, 1 / 60, 0, z, 0, true);
    }
    expect(cam.position.z).toBeLessThan(z - 1.2);
    expect(Math.abs(cam.position.x)).toBeLessThan(1);
    expect(cam.position.z).toBeGreaterThan(-2);
  });
});

describe('follow camera at rest', () => {
  it('backed against a door, it settles beside him: not jammed behind him, not creeping round in front', () => {
    // The corridor vestibule: 3 x 4 m, entered from the engine room with his back 0.8 m from the wall.
    // Wall lines are drawn where the ray casts in the real room find surfaces: the inner faces of the
    // 16 cm walls, and the engine-room door leaf behind him.
    const walls: WallLine[] = [
      [6, -2.95, 9, -2.95],
      [8.92, -3, 8.92, 1],
      [9, 0.92, 6, 0.92],
      [6.08, 1, 6.08, -3],
    ];
    const fc = new FollowCam();
    fc.setRoom(new THREE.Group(), walls, { minX: 6, minZ: -3, maxX: 9, maxZ: 1 });
    const cam = new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 90);
    fc.snap(0);
    for (let i = 0; i < 300; i++) fc.update(cam, 1 / 60, 7.5, -2.2, 0, false);
    expect(cam.position.z).toBeLessThan(-2.2 + 0.4); // not in front of him...
    expect(fc.reach).toBeGreaterThan(0.9); // ...and far enough to see him
  });
});
