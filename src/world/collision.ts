// 2D collision on the XZ ground plane. The whole game is "2.5D" in the Alone in the Dark sense:
// characters live on a floor, so walls, furniture and machinery are rectangles, circles or line
// segments seen from above. This keeps collision exact, cheap and easy to unit test.

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface Tagged {
  tag?: string;
  /** Disabled colliders are kept (so they can be re-enabled) but ignored. */
  enabled?: boolean;
}

export type RectCollider = Rect & Tagged;
export type CircleCollider = Circle & Tagged;
export type SegmentCollider = Segment & Tagged;

export function rectFromCenter(x: number, z: number, w: number, d: number): Rect {
  return { minX: x - w / 2, minZ: z - d / 2, maxX: x + w / 2, maxZ: z + d / 2 };
}

export function pointInRect(x: number, z: number, r: Rect): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

export function rectsOverlap(a: Rect, b: Rect, eps = 1e-6): boolean {
  return a.minX < b.maxX - eps && a.maxX > b.minX + eps && a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;
}

/** Distance from a point to a rectangle (0 when inside). */
export function distToRect(x: number, z: number, r: Rect): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

export function closestPointOnSegment(px: number, pz: number, s: Segment): { x: number; z: number; t: number } {
  const vx = s.bx - s.ax;
  const vz = s.bz - s.az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? ((px - s.ax) * vx + (pz - s.az) * vz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: s.ax + vx * t, z: s.az + vz * t, t };
}

/** Push a circle out of a rectangle. Returns the correction vector or null when not touching. */
export function circleRectPush(cx: number, cz: number, r: number, rect: Rect): { x: number; z: number } | null {
  const qx = cx < rect.minX ? rect.minX : cx > rect.maxX ? rect.maxX : cx;
  const qz = cz < rect.minZ ? rect.minZ : cz > rect.maxZ ? rect.maxZ : cz;
  const dx = cx - qx;
  const dz = cz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    return { x: dx * k, z: dz * k };
  }
  // Centre is inside the rectangle: leave through the nearest edge.
  const left = cx - rect.minX;
  const right = rect.maxX - cx;
  const down = cz - rect.minZ;
  const up = rect.maxZ - cz;
  const m = Math.min(left, right, down, up);
  if (m === left) return { x: -(left + r), z: 0 };
  if (m === right) return { x: right + r, z: 0 };
  if (m === down) return { x: 0, z: -(down + r) };
  return { x: 0, z: up + r };
}

export function circleCirclePush(cx: number, cz: number, r: number, o: Circle): { x: number; z: number } | null {
  const dx = cx - o.x;
  const dz = cz - o.z;
  const rr = r + o.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr) return null;
  if (d2 < 1e-12) return { x: rr, z: 0 };
  const d = Math.sqrt(d2);
  const k = (rr - d) / d;
  return { x: dx * k, z: dz * k };
}

export function circleSegmentPush(cx: number, cz: number, r: number, s: Segment): { x: number; z: number } | null {
  const q = closestPointOnSegment(cx, cz, s);
  const dx = cx - q.x;
  const dz = cz - q.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 < 1e-12) {
    // Exactly on the line: push along the segment normal.
    const vx = s.bx - s.ax;
    const vz = s.bz - s.az;
    const len = Math.hypot(vx, vz) || 1;
    return { x: (-vz / len) * r, z: (vx / len) * r };
  }
  const d = Math.sqrt(d2);
  const k = (r - d) / d;
  return { x: dx * k, z: dz * k };
}

/** Do segments p1-p2 and q1-q2 intersect? */
export function segmentsIntersect(p1x: number, p1z: number, p2x: number, p2z: number, s: Segment): boolean {
  const d1x = p2x - p1x;
  const d1z = p2z - p1z;
  const d2x = s.bx - s.ax;
  const d2z = s.bz - s.az;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((s.ax - p1x) * d2z - (s.az - p1z) * d2x) / den;
  const u = ((s.ax - p1x) * d1z - (s.az - p1z) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Liang–Barsky style segment vs rectangle test. */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, ax - r.minX) && clip(dx, r.maxX - ax) && clip(-dz, az - r.minZ) && clip(dz, r.maxZ - az) && t0 <= t1
  );
}

export class CollisionWorld {
  rects: RectCollider[] = [];
  circles: CircleCollider[] = [];
  segments: SegmentCollider[] = [];

  clear(): void {
    this.rects.length = 0;
    this.circles.length = 0;
    this.segments.length = 0;
  }

  addRect(r: Rect, tag?: string): RectCollider {
    const c: RectCollider = { ...r, tag, enabled: true };
    this.rects.push(c);
    return c;
  }

  addCircle(x: number, z: number, r: number, tag?: string): CircleCollider {
    const c: CircleCollider = { x, z, r, tag, enabled: true };
    this.circles.push(c);
    return c;
  }

  addSegment(ax: number, az: number, bx: number, bz: number, tag?: string): SegmentCollider {
    const c: SegmentCollider = { ax, az, bx, bz, tag, enabled: true };
    this.segments.push(c);
    return c;
  }

  /** Closed polyline helper (e.g. a curved bulwark or a ring-shaped tank rim). */
  addPolyline(points: Array<[number, number]>, closed = false, tag?: string): void {
    const n = points.length;
    for (let i = 0; i < n - 1 + (closed ? 1 : 0); i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      this.addSegment(a[0], a[1], b[0], b[1], tag);
    }
  }

  setEnabled(tag: string, enabled: boolean): void {
    for (const c of this.rects) if (c.tag === tag) c.enabled = enabled;
    for (const c of this.circles) if (c.tag === tag) c.enabled = enabled;
    for (const c of this.segments) if (c.tag === tag) c.enabled = enabled;
  }

  removeTag(tag: string): void {
    this.rects = this.rects.filter((c) => c.tag !== tag);
    this.circles = this.circles.filter((c) => c.tag !== tag);
    this.segments = this.segments.filter((c) => c.tag !== tag);
  }

  /**
   * Resolve a circle against every collider. `extra` lets callers add dynamic circles (other characters).
   * Returns the corrected position and whether anything was hit.
   */
  resolveCircle(
    x: number,
    z: number,
    r: number,
    ignoreTag?: string,
    extra?: ReadonlyArray<Circle>,
  ): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const c of this.rects) {
        if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
        const p = circleRectPush(x, z, r, c);
        if (p) {
          x += p.x;
          z += p.z;
          moved = hit = true;
        }
      }
      for (const c of this.circles) {
        if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
        const p = circleCirclePush(x, z, r, c);
        if (p) {
          x += p.x;
          z += p.z;
          moved = hit = true;
        }
      }
      for (const c of this.segments) {
        if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
        const p = circleSegmentPush(x, z, r, c);
        if (p) {
          x += p.x;
          z += p.z;
          moved = hit = true;
        }
      }
      if (extra) {
        for (const c of extra) {
          const p = circleCirclePush(x, z, r, c);
          if (p) {
            x += p.x;
            z += p.z;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return { x, z, hit };
  }

  /** Move a circle from (x,z) by (dx,dz) with sub-stepping so fast movement cannot tunnel through thin walls. */
  moveCircle(
    x: number,
    z: number,
    dx: number,
    dz: number,
    r: number,
    ignoreTag?: string,
    extra?: ReadonlyArray<Circle>,
  ): { x: number; z: number; hit: boolean } {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.05));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      const res = this.resolveCircle(x + dx / steps, z + dz / steps, r, ignoreTag, extra);
      x = res.x;
      z = res.z;
      hit = hit || res.hit;
    }
    return { x, z, hit };
  }

  /** Is a rectangle free of static colliders (used by pushable crates)? */
  rectFree(rect: Rect, ignoreTag?: string, circlesToAvoid?: ReadonlyArray<Circle>): boolean {
    for (const c of this.rects) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (rectsOverlap(rect, c)) return false;
    }
    for (const c of this.circles) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (circleRectPush(c.x, c.z, c.r, rect)) return false;
    }
    for (const c of this.segments) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (segmentHitsRect(c.ax, c.az, c.bx, c.bz, rect)) return false;
    }
    if (circlesToAvoid) {
      for (const c of circlesToAvoid) if (circleRectPush(c.x, c.z, c.r, rect)) return false;
    }
    return true;
  }

  /** Line of sight on the floor plane (rectangles and segments block). */
  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    for (const c of this.rects) {
      if (c.enabled === false) continue;
      if (segmentHitsRect(ax, az, bx, bz, c)) return false;
    }
    for (const s of this.segments) {
      if (s.enabled === false) continue;
      if (segmentsIntersect(ax, az, bx, bz, s)) return false;
    }
    return true;
  }

  /** Is a point (with a clearance radius) free? */
  pointFree(x: number, z: number, r: number, ignoreTag?: string): boolean {
    for (const c of this.rects) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (circleRectPush(x, z, r, c)) return false;
    }
    for (const c of this.circles) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (circleCirclePush(x, z, r, c)) return false;
    }
    for (const c of this.segments) {
      if (c.enabled === false || (ignoreTag && c.tag === ignoreTag)) continue;
      if (circleSegmentPush(x, z, r, c)) return false;
    }
    return true;
  }
}
