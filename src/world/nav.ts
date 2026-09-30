import type { CollisionWorld, Rect } from './collision';

export interface P2 {
  x: number;
  z: number;
}

/** Binary min-heap keyed by f-score. */
class Heap {
  private items: number[] = [];
  private scores: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, score: number): void {
    this.items.push(item);
    this.scores.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && this.scores[l] < this.scores[m]) m = l;
        if (r < n && this.scores[r] < this.scores[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

/** Occupancy grid + A* used by creatures to hunt the player around furniture. */
export class NavGrid {
  readonly w: number;
  readonly h: number;
  readonly blocked: Uint8Array;

  constructor(
    readonly bounds: Rect,
    readonly cell: number,
  ) {
    this.w = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
    this.h = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
    this.blocked = new Uint8Array(this.w * this.h);
  }

  static build(world: CollisionWorld, bounds: Rect, cell: number, radius: number, ignoreTag?: string): NavGrid {
    const g = new NavGrid(bounds, cell);
    for (let j = 0; j < g.h; j++) {
      for (let i = 0; i < g.w; i++) {
        const c = g.center(i, j);
        g.blocked[j * g.w + i] = world.pointFree(c.x, c.z, radius, ignoreTag) ? 0 : 1;
      }
    }
    return g;
  }

  center(i: number, j: number): P2 {
    return { x: this.bounds.minX + (i + 0.5) * this.cell, z: this.bounds.minZ + (j + 0.5) * this.cell };
  }

  cellOf(x: number, z: number): [number, number] {
    const i = Math.floor((x - this.bounds.minX) / this.cell);
    const j = Math.floor((z - this.bounds.minZ) / this.cell);
    return [Math.min(this.w - 1, Math.max(0, i)), Math.min(this.h - 1, Math.max(0, j))];
  }

  isBlocked(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return true;
    return this.blocked[j * this.w + i] === 1;
  }

  /** Nearest free cell by expanding rings (used when a start/goal sits in a wall's clearance band). */
  nearestFree(i: number, j: number, maxRing = 6): [number, number] | null {
    if (!this.isBlocked(i, j)) return [i, j];
    for (let r = 1; r <= maxRing; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.isBlocked(i + di, j + dj)) {
            const d = di * di + dj * dj;
            if (d < bestD) {
              bestD = d;
              best = [i + di, j + dj];
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Is the straight grid line between two points free of blocked cells? */
  clearLine(a: P2, b: P2): boolean {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const [i, j] = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (this.isBlocked(i, j)) return false;
    }
    return true;
  }

  /** 8-connected A* (no corner cutting) followed by line-of-sight smoothing. */
  findPath(from: P2, to: P2): P2[] | null {
    const s0 = this.cellOf(from.x, from.z);
    const g0 = this.cellOf(to.x, to.z);
    const s = this.nearestFree(s0[0], s0[1]);
    const g = this.nearestFree(g0[0], g0[1]);
    if (!s || !g) return null;
    const W = this.w;
    const start = s[1] * W + s[0];
    const goal = g[1] * W + g[0];
    const n = this.w * this.h;
    const gScore = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new Heap();
    const hfn = (idx: number) => {
      const dx = Math.abs((idx % W) - g[0]);
      const dz = Math.abs(Math.floor(idx / W) - g[1]);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    gScore[start] = 0;
    heap.push(start, hfn(start));
    let found = false;
    let guard = 0;
    while (heap.size > 0 && guard++ < n * 4) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W;
      const cj = Math.floor(cur / W);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (this.isBlocked(ni, nj)) continue;
          if (di !== 0 && dj !== 0 && (this.isBlocked(ci + di, cj) || this.isBlocked(ci, cj + dj))) continue;
          const nIdx = nj * W + ni;
          if (closed[nIdx]) continue;
          const cost = gScore[cur] + (di !== 0 && dj !== 0 ? Math.SQRT2 : 1);
          if (cost < gScore[nIdx]) {
            gScore[nIdx] = cost;
            came[nIdx] = cur;
            heap.push(nIdx, cost + hfn(nIdx));
          }
        }
      }
    }
    if (!found) return null;
    const cells: P2[] = [];
    for (let c = goal; c !== -1; c = came[c]) cells.push(this.center(c % W, Math.floor(c / W)));
    cells.reverse();
    // Replace the goal cell centre by the real goal when it is reachable in a straight line.
    if (cells.length > 0 && this.clearLine(cells[cells.length - 1], to)) cells[cells.length - 1] = { x: to.x, z: to.z };
    // Greedy string pulling.
    const out: P2[] = [];
    let anchor: P2 = from;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.clearLine(anchor, cells[m])) {
          far = m;
          break;
        }
      }
      out.push(cells[far]);
      anchor = cells[far];
      k = far + 1;
    }
    return out;
  }
}
