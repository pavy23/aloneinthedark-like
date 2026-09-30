import * as THREE from 'three';
import { flat } from '../render/materials';
import { damp } from '../core/math';

// A tiny hierarchical humanoid built from flat-shaded boxes, animated procedurally. The 1992 original
// used exactly this kind of untextured polygon figure over its painted rooms.

export type Joint =
  | 'hips'
  | 'spine'
  | 'neck'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'thighL'
  | 'thighR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR';

export type Pose = Partial<Record<Joint, [number, number, number]>>;

export interface RigColors {
  coat: number;
  coatDark: number;
  trousers: number;
  shoes: number;
  skin: number;
  shirt: number;
  hat?: number;
  hatBand?: number;
  hair: number;
  accent?: number;
  eyes?: number;
}

export interface RigSpec {
  colors: RigColors;
  /** Overall scale multiplier. */
  scale?: number;
  hipY?: number;
  thigh?: number;
  shin?: number;
  torso?: number;
  shoulderW?: number;
  upperArm?: number;
  forearm?: number;
  handSize?: number;
  headSize?: number;
  hat?: boolean;
  coatSkirt?: boolean;
  /** Extra girth for bloated figures. */
  bulk?: number;
  seaweed?: boolean;
}

function box(parent: THREE.Object3D, color: number, x: number, y: number, z: number, w: number, h: number, d: number, emissive = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color, emissive));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export class HumanRig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly joints = {} as Record<Joint, THREE.Group>;
  readonly handL = new THREE.Group();
  readonly handR = new THREE.Group();
  readonly head = new THREE.Group();
  readonly hipY: number;
  private skirt: THREE.Group | null = null;

  constructor(spec: RigSpec) {
    const c = spec.colors;
    const bulk = spec.bulk ?? 1;
    const hipY = spec.hipY ?? 0.93;
    const thigh = spec.thigh ?? 0.44;
    const shin = spec.shin ?? 0.44;
    const torso = spec.torso ?? 0.56;
    const shoulderW = spec.shoulderW ?? 0.42;
    const upperArm = spec.upperArm ?? 0.3;
    const forearm = spec.forearm ?? 0.28;
    const hs = spec.headSize ?? 0.2;
    this.hipY = hipY;
    this.root.add(this.body);
    const mk = (name: Joint, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };

    const hips = mk('hips', this.body, 0, hipY, 0);
    box(hips, c.trousers, 0, -0.04, 0, 0.34 * bulk, 0.18, 0.2 * bulk);

    // Legs
    for (const side of [-1, 1] as const) {
      const L = side < 0 ? 'L' : 'R';
      const t = mk(`thigh${L}` as Joint, hips, side * 0.1, -0.08, 0);
      box(t, c.trousers, 0, -thigh / 2, 0, 0.15 * bulk, thigh, 0.16 * bulk);
      if (spec.coatSkirt) box(t, c.coat, 0, -thigh * 0.42, 0.005, 0.19 * bulk, thigh * 0.85, 0.2 * bulk);
      const k = mk(`knee${L}` as Joint, t, 0, -thigh, 0);
      box(k, c.trousers, 0, -shin / 2, 0, 0.13 * bulk, shin, 0.14 * bulk);
      const a = mk(`ankle${L}` as Joint, k, 0, -shin, 0);
      box(a, c.shoes, 0, -0.035, 0.05, 0.11, 0.07, 0.26);
    }

    // Torso
    const spine = mk('spine', hips, 0, 0.04, 0);
    box(spine, c.coat, 0, torso / 2, 0, shoulderW * bulk, torso, 0.25 * bulk);
    box(spine, c.coatDark, 0, torso * 0.2, 0.001, shoulderW * bulk + 0.01, 0.05, 0.25 * bulk + 0.01); // belt
    box(spine, c.shirt, 0, torso - 0.07, 0.1 * bulk, 0.12, 0.12, 0.06); // collar/shirt
    if (c.accent !== undefined) box(spine, c.accent, 0, torso - 0.18, 0.125 * bulk, 0.05, 0.16, 0.02); // tie
    if (spec.coatSkirt) {
      this.skirt = new THREE.Group();
      this.skirt.position.set(0, 0.02, -0.02);
      box(this.skirt, c.coat, 0, -0.26, -0.08, shoulderW * bulk, 0.5, 0.08);
      hips.add(this.skirt);
    }
    if (spec.seaweed) {
      for (let i = 0; i < 7; i++) {
        const strand = box(spine, 0x2c3a1a, -0.18 + i * 0.06, torso * 0.3 - (i % 3) * 0.08, 0.13 * bulk, 0.03, 0.3 + (i % 2) * 0.15, 0.02);
        strand.rotation.z = (i % 2 ? 1 : -1) * 0.15;
      }
    }

    const neck = mk('neck', spine, 0, torso, 0);
    box(neck, c.skin, 0, 0.04, 0, 0.09, 0.08, 0.09);
    neck.add(this.head);
    this.head.position.set(0, 0.08, 0);
    box(this.head, c.skin, 0, hs * 0.55, 0.01, hs * 0.85, hs * 1.15, hs);
    box(this.head, c.hair, 0, hs * 0.72, -0.03, hs * 0.9, hs * 0.75, hs * 0.85); // hair at back/top
    box(this.head, c.skin, 0, hs * 0.45, hs * 0.52, hs * 0.14, hs * 0.2, hs * 0.12); // nose
    if (c.eyes !== undefined) {
      box(this.head, c.eyes, -hs * 0.2, hs * 0.66, hs * 0.51, hs * 0.14, hs * 0.08, 0.01, c.eyes);
      box(this.head, c.eyes, hs * 0.2, hs * 0.66, hs * 0.51, hs * 0.14, hs * 0.08, 0.01, c.eyes);
    } else {
      box(this.head, 0x1a1410, -hs * 0.2, hs * 0.66, hs * 0.505, hs * 0.12, hs * 0.05, 0.01);
      box(this.head, 0x1a1410, hs * 0.2, hs * 0.66, hs * 0.505, hs * 0.12, hs * 0.05, 0.01);
    }
    if (spec.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.95, hs * 0.95, 0.02, 10), flat(c.hat ?? 0x33291e));
      brim.position.set(0, hs * 1.12, 0.01);
      brim.rotation.x = -0.08;
      this.head.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.5, hs * 0.58, hs * 0.55, 8), flat(c.hat ?? 0x33291e));
      crown.position.set(0, hs * 1.38, 0);
      this.head.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.59, hs * 0.59, 0.035, 8), flat(c.hatBand ?? 0x151210));
      band.position.set(0, hs * 1.17, 0);
      this.head.add(band);
    }

    // Arms
    for (const side of [-1, 1] as const) {
      const L = side < 0 ? 'L' : 'R';
      const s = mk(`shoulder${L}` as Joint, spine, side * (shoulderW * bulk * 0.5 + 0.05), torso - 0.06, 0);
      box(s, c.coat, 0, -upperArm / 2, 0, 0.12 * bulk, upperArm + 0.04, 0.13 * bulk);
      const e = mk(`elbow${L}` as Joint, s, 0, -upperArm, 0);
      box(e, c.coat, 0, -forearm / 2, 0, 0.1 * bulk, forearm, 0.11 * bulk);
      const hand = side < 0 ? this.handL : this.handR;
      hand.position.set(0, -forearm - 0.03, 0);
      e.add(hand);
      box(hand, c.skin, 0, -0.02, 0, 0.08 * (spec.handSize ?? 1), 0.1 * (spec.handSize ?? 1), 0.07 * (spec.handSize ?? 1));
    }

    const s = spec.scale ?? 1;
    this.root.scale.setScalar(s);
  }

  /** Damp every joint toward a target pose (unspecified joints return to rest). */
  applyPose(p: Pose, rate: number, dt: number): void {
    for (const k of Object.keys(this.joints) as Joint[]) {
      const j = this.joints[k];
      const t = p[k] ?? [0, 0, 0];
      j.rotation.x = damp(j.rotation.x, t[0], rate, dt);
      j.rotation.y = damp(j.rotation.y, t[1], rate, dt);
      j.rotation.z = damp(j.rotation.z, t[2], rate, dt);
    }
    if (this.skirt) {
      const avg = (this.joints.thighL.rotation.x + this.joints.thighR.rotation.x) * 0.5;
      this.skirt.rotation.x = Math.max(0, -avg) * 0.3 + Math.max(0, avg) * 0.6 + 0.04;
    }
  }

  /** Snap to a pose without blending (used for death/cutscene holds). */
  setPose(p: Pose): void {
    for (const k of Object.keys(this.joints) as Joint[]) {
      const t = p[k] ?? [0, 0, 0];
      this.joints[k].rotation.set(t[0], t[1], t[2]);
    }
  }
}

/** Procedural gait. phase in radians; amount 0..1 (walk) up to ~1.6 (run). */
export function gaitPose(phase: number, amount: number, back = false): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const a = amount;
  const dir = back ? -1 : 1;
  const legSwing = 0.55 * a * dir;
  const armSwing = 0.45 * a * dir;
  return {
    hips: [0, s * 0.08 * a, 0],
    spine: [0.06 * a + (a > 1.2 ? 0.18 : 0), -s * 0.1 * a, 0],
    thighL: [-s * legSwing, 0, 0],
    thighR: [s * legSwing, 0, 0],
    kneeL: [Math.max(0, c) * 0.9 * a + 0.05, 0, 0],
    kneeR: [Math.max(0, -c) * 0.9 * a + 0.05, 0, 0],
    ankleL: [-s * 0.2 * a, 0, 0],
    ankleR: [s * 0.2 * a, 0, 0],
    shoulderL: [s * armSwing, 0, 0.08],
    shoulderR: [-s * armSwing, 0, -0.08],
    elbowL: [-0.3 - (a > 1.2 ? 0.9 : 0), 0, 0],
    elbowR: [-0.25 - Math.max(0, -s) * 0.3 * a - (a > 1.2 ? 0.9 : 0), 0, 0],
    neck: [-0.04 * a, s * 0.05 * a, 0],
  };
}
