import * as THREE from 'three';
import { RoomBuilder, disposeTree } from '../world/RoomBuilder';
import { NavGrid } from '../world/nav';
import { CREATURE_RADIUS } from '../entities/Creature';
import { noise1 } from '../core/math';
import type { CollisionWorld } from '../world/collision';
import type { GameAPI, Interactable, LightSpec, PushableDef, RoomDef, RoomInstanceAPI, Trigger } from '../world/types';

export interface PushState {
  def: PushableDef;
  x: number;
  z: number;
  /** Animation from (fx,fz) to (x,z). */
  fx: number;
  fz: number;
  t: number;
}

export class RoomInstance implements RoomInstanceAPI {
  readonly def: RoomDef;
  readonly root: THREE.Group;
  readonly col: CollisionWorld;
  nav: NavGrid;
  interactables: Interactable[];
  triggers: Trigger[];
  lights: LightSpec[];
  pushables: PushState[];
  private named: Map<string, THREE.Object3D>;

  constructor(def: RoomDef, b: RoomBuilder) {
    this.def = def;
    this.root = b.root;
    this.col = b.col;
    this.interactables = b.interactables;
    this.triggers = b.triggers;
    this.lights = b.lights;
    this.named = b.named;
    this.pushables = b.pushables.map((p) => ({ def: p.def, x: p.x, z: p.z, fx: p.x, fz: p.z, t: 1 }));
    for (const p of this.pushables) this.syncPushCollider(p);
    this.nav = this.buildNav();
  }

  get<T extends THREE.Object3D = THREE.Object3D>(name: string): T | undefined {
    return this.named.get(name) as T | undefined;
  }

  buildNav(): NavGrid {
    return NavGrid.build(this.col, this.def.bounds, 0.25, CREATURE_RADIUS * 0.9);
  }

  syncPushCollider(p: PushState): void {
    const tag = `push:${p.def.id}`;
    this.col.removeTag(tag);
    this.col.addRect({ minX: p.x - p.def.w / 2, minZ: p.z - p.def.d / 2, maxX: p.x + p.def.w / 2, maxZ: p.z + p.def.d / 2 }, tag);
    p.def.object.position.x = p.x;
    p.def.object.position.z = p.z;
  }

  dispose(): void {
    disposeTree(this.root);
    this.root.removeFromParent();
  }
}

export function buildRoom(def: RoomDef, g: GameAPI, pushSaved: Record<string, [number, number]>): RoomInstance {
  const b = new RoomBuilder();
  def.build(b, g);
  for (const p of b.pushables) {
    const s = pushSaved[p.def.id];
    if (s) {
      p.x = s[0];
      p.z = s[1];
      p.def.object.position.x = s[0];
      p.def.object.position.z = s[1];
    }
  }
  b.finalize();
  return new RoomInstance(def, b);
}

/**
 * A fixed pool of lights reused by every room. Keeping the light count constant means three.js never
 * has to recompile shaders when the player walks through a door.
 */
export class LightPool {
  readonly points: THREE.PointLight[] = [];
  readonly hemi = new THREE.HemisphereLight(0x404a50, 0x100c08, 0.4);
  readonly moon = new THREE.DirectionalLight(0x8aa0b8, 0);
  private specs: Array<LightSpec | null> = [];
  private bulbs: THREE.Mesh[] = [];
  private bulbOn: THREE.Material | null = null;
  private bulbOff: THREE.Material | null = null;
  powerFlicker = 0;

  constructor(scene: THREE.Scene, count = 6) {
    scene.add(this.hemi);
    scene.add(this.moon);
    scene.add(this.moon.target);
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.7);
      scene.add(l);
      this.points.push(l);
      this.specs.push(null);
    }
  }

  configure(room: RoomInstance, power: boolean, bulbOn: THREE.Material, bulbOff: THREE.Material): void {
    const d = room.def;
    this.hemi.color.setHex(d.hemi.sky);
    this.hemi.groundColor.setHex(d.hemi.ground);
    this.hemi.intensity = d.hemi.intensity;
    if (d.moon) {
      this.moon.color.setHex(d.moon.color);
      this.moon.intensity = d.moon.intensity;
      this.moon.position.set(d.moon.dir[0], d.moon.dir[1], d.moon.dir[2]).multiplyScalar(20);
    } else {
      this.moon.intensity = 0;
    }
    this.bulbOn = bulbOn;
    this.bulbOff = bulbOff;
    this.bulbs = [];
    room.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.bulb) this.bulbs.push(o as THREE.Mesh);
    });
    const lit = room.lights.filter((l) => !l.needsPower || power);
    for (let i = 0; i < this.points.length; i++) {
      const s = lit[i] ?? null;
      this.specs[i] = s;
      const p = this.points[i];
      if (s) {
        p.position.set(s.x, s.y, s.z);
        p.color.setHex(s.color);
        p.distance = s.distance;
        p.intensity = s.intensity;
      } else {
        p.intensity = 0;
      }
    }
    for (const b of this.bulbs) b.material = power ? bulbOn : bulbOff;
  }

  update(time: number): void {
    for (let i = 0; i < this.points.length; i++) {
      const s = this.specs[i];
      if (!s) continue;
      let k = 1;
      if (s.flicker) k = 1 - s.flicker * 0.5 + noise1(time * 7 + i * 13.1, i) * s.flicker;
      if (s.needsPower && this.powerFlicker > 0) k *= noise1(time * 30 + i, 5) > 0.5 ? 1 : 0.1;
      this.points[i].intensity = s.intensity * k;
    }
    if (this.powerFlicker > 0 && this.bulbOn && this.bulbOff) {
      const on = noise1(time * 30, 5) > 0.5;
      for (const b of this.bulbs) b.material = on ? this.bulbOn : this.bulbOff;
    }
  }
}
