import * as THREE from 'three';
import { angleDiff, clamp, damp, dampAngle } from '../core/math';
import type { Rect } from '../world/collision';

// A "player-centred" third-person camera for rooms that were laid out for fixed shots.
// It hangs behind the investigator on a loose string (dragged when he walks away, pushed back when he
// walks towards it), drifts behind him while he moves, and never ends up inside walls, ceilings or big
// machinery: it ray-casts against the room and looks around for open space when it is boxed in.

const DIST_MIN = 1.9;
const DIST_MAX = 3.3;
const HEAD_Y = 1.45;
const LOOK_Y = 1.15;
const TOP_Y = 2.6;
const MARGIN = 0.28;

/** A wall line on the floor plan: [x0, z0, x1, z1]. */
export type WallLine = readonly [number, number, number, number];

/**
 * Horizontal distance from (px, pz) along the unit direction (dx, dz) to the first wall line, or to the
 * edge of the room bounds when the point is inside them. Infinity when nothing is in the way.
 */
export function rayToWalls(px: number, pz: number, dx: number, dz: number, walls: ReadonlyArray<WallLine>, bounds: Rect | null): number {
  let best = Infinity;
  for (const [ax, az, bx, bz] of walls) {
    const ex = bx - ax;
    const ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue; // parallel
    const wx = ax - px;
    const wz = az - pz;
    const t = (wx * ez - wz * ex) / den;
    const s = (wx * dz - wz * dx) / den;
    if (t >= 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  if (bounds && px > bounds.minX && px < bounds.maxX && pz > bounds.minZ && pz < bounds.maxZ) {
    if (dx > 1e-9) best = Math.min(best, (bounds.maxX - px) / dx);
    else if (dx < -1e-9) best = Math.min(best, (bounds.minX - px) / dx);
    if (dz > 1e-9) best = Math.min(best, (bounds.maxZ - pz) / dz);
    else if (dz < -1e-9) best = Math.min(best, (bounds.minZ - pz) / dz);
  }
  return best;
}

export class FollowCam {
  readonly pos = new THREE.Vector3();
  /** Horizontal distance actually achieved this frame (small = squeezed against something). */
  reach = DIST_MAX;
  private orbit = 0;
  private dist = 2.8;
  private want = new THREE.Vector3();
  private ready = false;
  /**
   * Where the camera would like to be: behind him while he walks, otherwise wherever it last settled.
   * The open-space search scores against this, so a camera boxed in while he stands still cannot creep
   * round step by step (each step re-anchored on the last) into a corner or in front of him.
   */
  private anchor = 0;
  /** Orbit angle being swung to after a "camera behind me" request. */
  private swing: number | null = null;
  private swingT = 0;
  private targets: THREE.Object3D[] = [];
  private walls: ReadonlyArray<WallLine> = [];
  private bounds: Rect | null = null;
  private ray = new THREE.Raycaster();
  private o = new THREE.Vector3();
  private d = new THREE.Vector3();
  private look = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  /**
   * Collect what the camera must not pass through: the room's wall lines and doorways (any height — the
   * camera never leaves the room, even over a bulwark), plus ceilings and big props it must not clip
   * (lamps and clutter are ignored).
   */
  setRoom(root: THREE.Object3D, walls: ReadonlyArray<WallLine> = [], bounds: Rect | null = null, proxies: ReadonlyArray<THREE.Object3D> = []): void {
    this.targets = [...proxies];
    this.walls = walls;
    this.bounds = bounds;
    root.updateMatrixWorld(true);
    const scale = new THREE.Vector3();
    root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      // Merged static meshes are represented by their un-merged proxies (much cheaper to ray-cast).
      if (!m.isMesh || obj.userData.noCam || (obj.userData.merged && proxies.length)) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.some((x) => x.transparent)) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.getWorldScale(scale);
      const r = (m.geometry.boundingSphere?.radius ?? 0) * Math.max(scale.x, scale.y, scale.z);
      if (r >= 0.45) this.targets.push(m);
    });
    this.ready = false;
  }

  /** Put the camera straight behind the player on the next update. */
  snap(heading: number): void {
    this.orbit = heading + Math.PI;
    this.anchor = this.orbit;
    this.dist = 2.9;
    this.swing = null;
    this.ready = false;
  }

  /** Swing (not cut) round to behind the player. */
  recenter(heading: number): void {
    if (!this.ready) return this.snap(heading);
    this.swing = heading + Math.PI;
    this.anchor = this.swing;
    this.swingT = 0.9; // gives up if a wall keeps it from getting there
  }

  private cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
    this.ray.set(origin, dir);
    this.ray.near = 0;
    this.ray.far = far;
    const hits = this.ray.intersectObjects(this.targets, false);
    return hits.length ? hits[0].distance : Infinity;
  }

  /** Free horizontal distance from the player towards orbit angle `a` (camera at height y). */
  private free(px: number, pz: number, a: number, dist: number, y: number): number {
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    let room = rayToWalls(px, pz, sx, sz, this.walls, this.bounds);
    this.o.set(px, HEAD_Y, pz);
    this.d.set(sx * dist, y - HEAD_Y, sz * dist);
    const len = this.d.length();
    this.d.divideScalar(len);
    const hit = this.cast(this.o, this.d, len + MARGIN);
    if (hit !== Infinity) room = Math.min(room, (hit / len) * dist); // along-ray -> horizontal distance
    return Math.min(room, dist + MARGIN);
  }

  update(cam: THREE.PerspectiveCamera, dt: number, px: number, pz: number, heading: number, moving: boolean): void {
    // Ceiling above the player limits how high the camera may sit.
    this.o.set(px, 0.8, pz);
    const ceil = 0.8 + this.cast(this.o, this.up, 30);
    const camY = Math.min(TOP_Y, ceil - 0.25);
    const fresh = !this.ready;
    if (this.ready) {
      // String: the previous wished-for spot stays put unless it is now too far or too close.
      const dx = this.want.x - px;
      const dz = this.want.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) this.orbit = Math.atan2(dx, dz);
      this.dist = clamp(d, DIST_MIN, DIST_MAX);
    }
    if (this.swing !== null) {
      this.orbit = dampAngle(this.orbit, this.swing, 7, dt);
      this.swingT -= dt;
      if (this.swingT <= 0 || Math.abs(angleDiff(this.orbit, this.swing)) < 0.03) this.swing = null;
    } else if (moving) {
      // Drift round behind him — but not when he walks straight at the camera: swinging 180 degrees
      // would whip the view around (and flip which way "left" is); the string just backs off instead.
      const behind = heading + Math.PI;
      const off = Math.abs(angleDiff(this.orbit, behind));
      const k = off < 2.1 ? 1 : Math.max(0, 1 - (off - 2.1) / 0.7);
      this.orbit = dampAngle(this.orbit, behind, 0.9 * k, dt);
      // Walking at the camera: no preference to swing round, just keep clear where it is.
      this.anchor = k > 0.5 ? behind : this.orbit;
    }
    const ideal = this.anchor;
    // Boxed in? Look around the ideal angle for a direction with room. Straying from it costs, and
    // swinging past his side costs much more: a camera in front of him (back to a wall, say, just through
    // a door) would have him walk towards it seeing only where he came from.
    let room = this.free(px, pz, this.orbit, this.dist, camY);
    if (room < this.dist - 0.05) {
      const cost = (a: number) => {
        const turn = Math.abs(angleDiff(ideal, a));
        return turn * 0.4 + Math.max(0, turn - 1.4) * 1.2;
      };
      // Room is worth little past a couple of metres, but closer than ~1.2 m the view is poor (his back
      // fills the screen or he has to be hidden), so short distances are penalised hard.
      const worth = (d: number) => Math.min(d, this.dist) - Math.max(0, 1.2 - d) * 1.5;
      let best = this.orbit;
      let bestScore = worth(room) - cost(this.orbit) + 0.1; // a little loyalty: no dithering
      for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.7, -2.7]) {
        const a = ideal + off;
        const score = worth(this.free(px, pz, a, this.dist, camY)) - cost(a);
        if (score > bestScore + 0.05) {
          best = a;
          bestScore = score;
        }
      }
      if (fresh) this.orbit = best;
      else {
        // Swing over at a steady pace rather than whipping round.
        const step = angleDiff(this.orbit, best) * (1 - Math.exp(-5 * dt));
        this.orbit += clamp(step, -3 * dt, 3 * dt);
      }
      room = this.free(px, pz, this.orbit, this.dist, camY);
    }
    this.want.set(px + Math.sin(this.orbit) * this.dist, camY, pz + Math.cos(this.orbit) * this.dist);
    const reach = clamp(room - MARGIN, 0.25, this.dist);
    this.reach = reach;
    // Squeezed: rise and look down over the shoulder instead of staring into the back of the head.
    const rise = clamp((1.6 - reach) * 0.55, 0, Math.max(0, ceil - 0.18 - camY));
    const tx = px + Math.sin(this.orbit) * reach;
    const ty = camY + rise;
    const tz = pz + Math.cos(this.orbit) * reach;
    // Look a little ahead of the investigator so you see where he is going.
    const lx = px + Math.sin(heading) * 0.6;
    const lz = pz + Math.cos(heading) * 0.6;
    if (fresh) {
      this.pos.set(tx, ty, tz);
      this.look.set(lx, LOOK_Y, lz);
      this.ready = true;
    } else {
      // Pull in fast (never show the far side of a wall), ease back out slowly.
      const nowD = Math.hypot(this.pos.x - px, this.pos.z - pz);
      const rate = reach < nowD ? 28 : 7;
      this.pos.x = damp(this.pos.x, tx, rate, dt);
      this.pos.y = damp(this.pos.y, ty, rate, dt);
      this.pos.z = damp(this.pos.z, tz, rate, dt);
      // Smooth the aim point so turning on the spot does not jerk the whole view.
      this.look.x = damp(this.look.x, lx, 6, dt);
      this.look.y = LOOK_Y;
      this.look.z = damp(this.look.z, lz, 6, dt);
    }
    // Whatever the smoothing did (swinging round a corner cuts across it), the camera itself must stay on
    // the player's side of every wall line.
    const hx = this.pos.x - px;
    const hz = this.pos.z - pz;
    const hd = Math.hypot(hx, hz);
    if (hd > 1e-4) {
      const lim = Math.max(0.05, rayToWalls(px, pz, hx / hd, hz / hd, this.walls, this.bounds) - MARGIN);
      if (hd > lim) {
        this.pos.x = px + (hx * lim) / hd;
        this.pos.z = pz + (hz * lim) / hd;
      }
      this.reach = Math.min(this.reach, Math.min(hd, lim));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
  }
}
