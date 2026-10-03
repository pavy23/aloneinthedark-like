import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Mat } from '../render/materials';
import { boxGeo, mesh } from '../render/geo';
import { CollisionWorld } from './collision';
import type { Interactable, LightSpec, PushableDef, RoomBuilderAPI, Trigger } from './types';

export interface Gap {
  /** Distance along the wall from its start point to the centre of the opening. */
  at: number;
  w: number;
  /** Opening height (default: full height, i.e. no lintel). */
  h?: number;
  /**
   * Walk-through opening. By default openings are doorways you *use* (a scripted room change), so they
   * still block movement; only set this for real passages.
   */
  open?: boolean;
}

export interface WallOpts {
  h: number;
  mat: Mat;
  t?: number;
  gaps?: Gap[];
  collide?: boolean;
  y?: number;
  tag?: string;
}

const HALF_PI = Math.PI / 2;

function isAxisAligned(ry: number): boolean {
  const k = ry / HALF_PI;
  return Math.abs(k - Math.round(k)) < 1e-4;
}

/**
 * Collects geometry, colliders, interactables and lights for one room, then merges all static meshes by
 * material so a room costs a few dozen draw calls instead of hundreds.
 */
export class RoomBuilder implements RoomBuilderAPI {
  readonly root = new THREE.Group();
  readonly staticRoot = new THREE.Group();
  readonly col = new CollisionWorld();
  named = new Map<string, THREE.Object3D>();
  interactables: Interactable[] = [];
  triggers: Trigger[] = [];
  lights: LightSpec[] = [];
  pushables: Array<{ def: PushableDef; x: number; z: number }> = [];
  /**
   * Wall lines the follow camera may not cross, whatever their height: room boundaries (bulwarks and the
   * wheelhouse window band included) and doorways. Only `open` gaps let the camera through.
   */
  camWalls: Array<[number, number, number, number]> = [];
  /**
   * Un-merged stand-ins for the big static meshes (never rendered). The follow camera ray-casts these:
   * each one is culled by its own bounding sphere, whereas a merged room mesh spans the whole room and
   * would make every ray test every triangle.
   */
  camProxies: THREE.Mesh[] = [];

  constructor() {
    this.staticRoot.name = 'static';
    this.root.add(this.staticRoot);
  }

  /** Place an object. Static objects get merged; dynamic ones stay addressable (and animatable) by name. */
  add<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, ry = 0, opts: { dynamic?: boolean; name?: string; scale?: number } = {}): T {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    if (opts.scale) obj.scale.setScalar(opts.scale);
    if (opts.name) obj.name = opts.name;
    (opts.dynamic ? this.root : this.staticRoot).add(obj);
    if (opts.dynamic) {
      obj.traverse((o) => {
        if (o.name) this.named.set(o.name, o);
      });
    }
    return obj;
  }

  /** Axis-aligned or rotated rectangular footprint collider centred at (x,z). */
  footprint(x: number, z: number, w: number, d: number, ry = 0, tag?: string): void {
    if (isAxisAligned(ry)) {
      const swap = Math.round(ry / HALF_PI) % 2 !== 0;
      const ww = swap ? d : w;
      const dd = swap ? w : d;
      this.col.addRect({ minX: x - ww / 2, minZ: z - dd / 2, maxX: x + ww / 2, maxZ: z + dd / 2 }, tag);
      return;
    }
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    const corners: Array<[number, number]> = [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
    this.col.addPolyline(corners, true, tag);
  }

  circle(x: number, z: number, r: number, tag?: string): void {
    this.col.addCircle(x, z, r, tag);
  }

  seg(ax: number, az: number, bx: number, bz: number, tag?: string): void {
    this.col.addSegment(ax, az, bx, bz, tag);
  }

  /** Simple textured box with its bottom at y. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: Mat, opts: { ry?: number; collide?: boolean | string; dynamic?: boolean; name?: string } = {}): THREE.Mesh {
    const m = mesh(boxGeo(w, h, d, mat.tile), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = opts.ry ?? 0;
    if (opts.name) m.name = opts.name;
    (opts.dynamic ? this.root : this.staticRoot).add(m);
    if (opts.dynamic && opts.name) this.named.set(opts.name, m);
    if (opts.collide) this.footprint(x, z, w, d, opts.ry ?? 0, typeof opts.collide === 'string' ? opts.collide : undefined);
    return m;
  }

  floor(x0: number, z0: number, x1: number, z1: number, mat: Mat, y = 0): THREE.Mesh {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    return this.box((x0 + x1) / 2, y - 0.1, (z0 + z1) / 2, w, 0.1, d, mat);
  }

  ceiling(x0: number, z0: number, x1: number, z1: number, y: number, mat: Mat): THREE.Mesh {
    const w = Math.abs(x1 - x0);
    const d = Math.abs(z1 - z0);
    return this.box((x0 + x1) / 2, y, (z0 + z1) / 2, w, 0.12, d, mat);
  }

  /** A straight wall from (x0,z0) to (x1,z1) with optional door/window openings. */
  wall(x0: number, z0: number, x1: number, z1: number, o: WallOpts): void {
    const t = o.t ?? 0.16;
    const y = o.y ?? 0;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) return;
    const ux = dx / L;
    const uz = dz / L;
    const ry = Math.atan2(-uz, ux);
    const pieces: Array<[number, number, number, number]> = []; // [from, to, yBottom, height]
    const gaps = [...(o.gaps ?? [])].sort((a, b) => a.at - b.at);
    let cursor = 0;
    for (const g of gaps) {
      const a = Math.max(0, g.at - g.w / 2);
      const b = Math.min(L, g.at + g.w / 2);
      if (a > cursor) pieces.push([cursor, a, 0, o.h]);
      if (g.h !== undefined && g.h < o.h) pieces.push([a, b, g.h, o.h - g.h]);
      // Doorways are used, not walked through: keep them solid for collision.
      if (o.collide !== false && !g.open) {
        const mid = (a + b) / 2;
        const cx = x0 + ux * mid;
        const cz = z0 + uz * mid;
        if (isAxisAligned(ry)) this.footprint(cx, cz, b - a, t, ry, o.tag);
        else this.col.addSegment(x0 + ux * a, z0 + uz * a, x0 + ux * b, z0 + uz * b, o.tag);
      }
      cursor = b;
    }
    if (cursor < L) pieces.push([cursor, L, 0, o.h]);
    if (o.collide !== false && y <= 0) {
      let from = 0;
      for (const g of gaps) {
        if (!g.open) continue;
        const a = Math.max(0, g.at - g.w / 2);
        if (a > from) this.camWalls.push([x0 + ux * from, z0 + uz * from, x0 + ux * a, z0 + uz * a]);
        from = Math.max(from, Math.min(L, g.at + g.w / 2));
      }
      if (from < L) this.camWalls.push([x0 + ux * from, z0 + uz * from, x1, z1]);
    }
    for (const [a, b, yb, hh] of pieces) {
      const len = b - a;
      if (len < 1e-4) continue;
      const mid = (a + b) / 2;
      const cx = x0 + ux * mid;
      const cz = z0 + uz * mid;
      const m = mesh(boxGeo(len, hh, t, o.mat.tile), o.mat);
      m.position.set(cx, y + yb + hh / 2, cz);
      m.rotation.y = ry;
      this.staticRoot.add(m);
      const solid = yb < 0.5; // lintels above doorways do not block walking
      if (o.collide !== false && solid) {
        if (isAxisAligned(ry)) this.footprint(cx, cz, len, t, ry, o.tag);
        else this.col.addSegment(x0 + ux * a, z0 + uz * a, x0 + ux * b, z0 + uz * b, o.tag);
      }
    }
  }

  interact(i: Interactable): void {
    this.interactables.push(i);
  }

  trigger(t: Trigger): void {
    this.triggers.push(t);
  }

  light(l: LightSpec): void {
    this.lights.push(l);
  }

  pushable(p: PushableDef, x: number, z: number): void {
    p.object.position.x = x;
    p.object.position.z = z;
    if (!p.object.parent) this.root.add(p.object);
    this.pushables.push({ def: p, x, z });
  }

  /** Merge every static mesh by material. */
  finalize(): void {
    this.staticRoot.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const keep: THREE.Object3D[] = [];
    this.staticRoot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material)) {
        keep.push(m);
        return;
      }
      if (!m.userData.noCam && !m.material.transparent) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        if ((m.geometry.boundingSphere?.radius ?? 0) * m.matrixWorld.getMaxScaleOnAxis() >= 0.45) {
          const p = new THREE.Mesh(m.geometry, m.material);
          p.matrixAutoUpdate = false;
          p.matrixWorld.copy(m.matrixWorld);
          this.camProxies.push(p);
        }
      }
      let g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      const count = g.getAttribute('position').count;
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      g.clearGroups();
      const list = byMat.get(m.material) ?? [];
      list.push(g);
      byMat.set(m.material, list);
      m.geometry.dispose();
    });
    this.staticRoot.clear();
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat);
      mm.userData.merged = true;
      mm.matrixAutoUpdate = false;
      mm.updateMatrix();
      this.staticRoot.add(mm);
    }
    for (const k of keep) this.staticRoot.add(k);
  }
}

/** Dispose GPU resources below an object. Cached palette materials (userData.shared) are kept. */
export function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh | THREE.Points;
    if (!(m as THREE.Mesh).isMesh && !(m as THREE.Points).isPoints) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat || mat.userData.shared) continue;
      // Textures drawn for one object only (lettering) go with it.
      const map = (mat as THREE.MeshLambertMaterial).map;
      if (map?.userData.owned) map.dispose();
      mat.dispose();
    }
  });
}
