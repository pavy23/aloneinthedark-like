import * as THREE from 'three';
import { HumanRig, gaitPose, type Pose } from './Rig';
import { M } from '../render/materials';
import { angleDiff, clamp, headingToDir, noise1, wrapAngle } from '../core/math';
import type { Input } from '../core/Input';
import type { CollisionWorld, Circle } from '../world/collision';
import { crowbarItem } from '../world/props';
import { rod, partC } from '../render/geo';

export type PlayerState = 'idle' | 'walk' | 'run' | 'back' | 'turn' | 'push' | 'reach' | 'crouch' | 'attack' | 'hurt' | 'dead' | 'quickturn';

export interface WeaponSpec {
  id: string;
  damage: number;
  range: number;
  /** Seconds from swing start to the hit frame, and total swing length. */
  hitAt: number;
  duration: number;
}

export const KICK: WeaponSpec = { id: 'kick', damage: 1, range: 1.15, hitAt: 0.28, duration: 0.62 };

const WALK = 1.45;
const RUN = 3.3;
const BACK = 0.95;
export const PLAYER_RADIUS = 0.28;

export class Player {
  readonly rig: HumanRig;
  readonly object = new THREE.Group();
  readonly lantern = new THREE.Group();
  readonly lanternLight: THREE.PointLight;
  private weaponMesh = new THREE.Group();
  private shadow: THREE.Mesh;
  x = 0;
  z = 0;
  heading = 0;
  state: PlayerState = 'idle';
  stateTime = 0;
  private phase = 0;
  private lastStepSign = 0;
  private qtFrom = 0;
  private hitDone = false;
  weapon: WeaponSpec = KICK;
  weaponId: string | null = null;
  frozen = false;
  /** Set by the game while pushing. */
  pushDir = 0;
  blocked = false;
  lanternBase = 7;
  lanternLevel = 1;
  onFootstep: (() => void) | null = null;
  onAttackHit: ((w: WeaponSpec) => void) | null = null;
  onAttackSwing: ((w: WeaponSpec) => void) | null = null;
  private deathT = 0;
  private hurtDir = 0;
  /**
   * 'direct': the game hands us a world-space direction each frame (screen-relative controls) and the
   * investigator turns and walks that way. 'tank': the 1992 scheme (up = forward, left/right = rotate).
   */
  controlMode: 'direct' | 'tank' = 'direct';
  intent: { x: number; z: number; mag: number; run: boolean } | null = null;
  private moveSpeed = 0;

  constructor() {
    this.rig = new HumanRig({
      colors: {
        coat: 0x6e5c3e,
        coatDark: 0x3e3222,
        trousers: 0x2f2d2a,
        shoes: 0x1a1410,
        skin: 0xc9a07c,
        shirt: 0xd6cfbf,
        hat: 0x3a3024,
        hatBand: 0x16120e,
        hair: 0x2a1c12,
        accent: 0x6a1a1a,
      },
      hat: true,
      coatSkirt: true,
    });
    this.object.add(this.rig.root);

    // Hurricane lantern in the left hand.
    const L = this.lantern;
    partC(L, M.iron, 0, -0.08, 0, 0.12, 0.02, 0.12);
    partC(L, M.iron, 0, -0.3, 0, 0.13, 0.03, 0.13);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 6), M.lanternGlass.m);
    glass.position.y = -0.2;
    L.add(glass);
    for (const [x, z] of [
      [0.055, 0.055],
      [-0.055, 0.055],
      [0.055, -0.055],
      [-0.055, -0.055],
    ])
      rod(L, M.iron, { x, y: -0.09, z }, { x, y: -0.29, z }, 0.008, 3);
    rod(L, M.iron, { x: -0.06, y: -0.07, z: 0 }, { x: 0, y: 0.02, z: 0 }, 0.008, 3);
    rod(L, M.iron, { x: 0.06, y: -0.07, z: 0 }, { x: 0, y: 0.02, z: 0 }, 0.008, 3);
    L.position.set(0, -0.04, 0.02);
    this.rig.handL.add(L);
    this.lanternLight = new THREE.PointLight(0xffb060, this.lanternBase, 10, 1.5);
    this.lanternLight.position.set(0, -0.2, 0.05);
    L.add(this.lanternLight);

    this.weaponMesh.position.set(0, -0.05, 0.02);
    this.rig.handR.add(this.weaponMesh);

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), M.shadow.m);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.object.add(this.shadow);
  }

  setWeapon(id: string | null, spec: WeaponSpec | null): void {
    this.weaponId = id;
    this.weapon = spec ?? KICK;
    this.weaponMesh.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.weaponMesh.clear();
    if (!id) return;
    if (id === 'crowbar') {
      const c = crowbarItem();
      c.rotation.set(0, Math.PI / 2, Math.PI / 2);
      c.position.set(0, -0.05, 0.05);
      this.weaponMesh.add(c);
    } else if (id === 'axe') {
      const g = new THREE.Group();
      rod(g, M.woodLight, { x: 0, y: 0.25, z: 0 }, { x: 0, y: -0.55, z: 0 }, 0.022, 5);
      partC(g, M.redPaint, 0.08, -0.5, 0, 0.18, 0.12, 0.03);
      partC(g, M.ironLight, 0.17, -0.5, 0, 0.04, 0.16, 0.03);
      g.rotation.x = Math.PI / 2;
      g.position.set(0, -0.03, 0.1);
      this.weaponMesh.add(g);
    }
  }

  place(x: number, z: number, h: number): void {
    this.x = x;
    this.z = z;
    this.heading = h;
    this.deathT = 0;
    this.state = 'idle';
    this.stateTime = 0;
    this.sync();
  }

  face(x: number, z: number): void {
    this.heading = Math.atan2(x - this.x, z - this.z);
    this.sync();
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  get busyAnim(): boolean {
    return this.state === 'attack' || this.state === 'hurt' || this.state === 'dead' || this.state === 'quickturn' || this.state === 'push';
  }

  setState(s: PlayerState): void {
    if (this.state === s) return;
    if (this.state === 'dead') return; // only place() brings the investigator back
    this.state = s;
    this.stateTime = 0;
    this.hitDone = false;
  }

  hurt(fromX: number, fromZ: number): void {
    if (this.state === 'dead') return;
    this.hurtDir = Math.atan2(this.x - fromX, this.z - fromZ);
    this.setState('hurt');
  }

  die(): void {
    this.setState('dead');
    this.deathT = 0;
  }

  attack(): boolean {
    if (this.busyAnim || this.frozen) return false;
    this.setState('attack');
    this.onAttackSwing?.(this.weapon);
    return true;
  }

  pose(p: 'reach' | 'crouch' | 'none'): void {
    if (p === 'none') this.setState('idle');
    else this.setState(p);
  }

  circle(): Circle {
    return { x: this.x, z: this.z, r: PLAYER_RADIUS };
  }

  update(dt: number, input: Input | null, col: CollisionWorld, others: ReadonlyArray<Circle>, time: number): void {
    this.stateTime += dt;
    let move = 0;
    let turn = 0;
    const controllable = input && !this.frozen && !this.busyAnim && this.state !== 'reach' && this.state !== 'crouch';

    if (controllable && input && this.controlMode === 'direct') {
      const it = this.intent;
      if (it && it.mag > 0.15) {
        const target = Math.atan2(it.x, it.z);
        const diff = angleDiff(this.heading, target);
        const maxTurn = (it.run ? 9 : 11) * dt;
        this.heading = wrapAngle(this.heading + clamp(diff, -maxTurn, maxTurn));
        // Walk only once roughly facing the way we're asked to go (no moonwalking); pivot otherwise.
        const rem = Math.abs(angleDiff(this.heading, target));
        const align = rem < 0.35 ? 1 : rem > 1.6 ? 0 : 1 - (rem - 0.35) / 1.25;
        const strength = Math.min(1, 0.4 + it.mag * 0.75); // analog sticks walk slower near the centre
        move = (it.run ? RUN : WALK) * strength * align;
        this.setState(move > 0.05 ? (it.run ? 'run' : 'walk') : 'turn');
      } else {
        this.setState('idle');
      }
    } else if (controllable && input) {
      if (input.isDown('left')) turn += 1;
      if (input.isDown('right')) turn -= 1;
      const run = input.running();
      if (input.isDown('down') && input.justPressed('run')) {
        // Quick 180° turn (a later genre convention; handy with fixed cameras).
        this.qtFrom = this.heading;
        this.setState('quickturn');
      } else if (input.isDown('up')) {
        move = run ? RUN : WALK;
        this.setState(run ? 'run' : 'walk');
      } else if (input.isDown('down')) {
        move = -BACK;
        this.setState('back');
      } else if (turn !== 0) {
        this.setState('turn');
      } else {
        this.setState('idle');
      }
      const turnSpeed = this.state === 'run' ? 3.3 : this.state === 'back' ? 2.0 : 2.7;
      this.heading = wrapAngle(this.heading + turn * turnSpeed * dt);
    } else if (this.frozen && (this.state === 'walk' || this.state === 'run' || this.state === 'back' || this.state === 'turn')) {
      this.setState('idle');
    }

    if (this.state === 'quickturn') {
      const t = clamp(this.stateTime / 0.32, 0, 1);
      this.heading = wrapAngle(this.qtFrom + Math.PI * t);
      if (t >= 1) this.setState('idle');
    }

    this.moveSpeed = Math.abs(move);
    // Movement with collision.
    this.blocked = false;
    if (move !== 0) {
      const d = headingToDir(this.heading);
      const res = col.moveCircle(this.x, this.z, d.x * move * dt, d.z * move * dt, PLAYER_RADIUS, undefined, others);
      const moved = Math.hypot(res.x - this.x, res.z - this.z);
      this.blocked = moved < Math.abs(move * dt) * 0.35;
      this.x = res.x;
      this.z = res.z;
    } else if (this.state === 'hurt') {
      const k = Math.max(0, 0.35 - this.stateTime) * 3.2;
      const res = col.moveCircle(this.x, this.z, Math.sin(this.hurtDir) * k * dt, Math.cos(this.hurtDir) * k * dt, PLAYER_RADIUS, undefined, others);
      this.x = res.x;
      this.z = res.z;
    } else {
      // Keep resolved even when standing (a creature may have pushed into us).
      const res = col.resolveCircle(this.x, this.z, PLAYER_RADIUS, undefined, others);
      this.x = res.x;
      this.z = res.z;
    }

    // Animation.
    let pose: Pose = {};
    let rate = 12;
    switch (this.state) {
      case 'walk':
      case 'run':
      case 'back': {
        const speed = this.state === 'run' ? 2.3 : this.state === 'walk' ? 1.0 : 0.75;
        // Cadence follows the actual speed (slower when an analog stick is only half pushed).
        const nominal = this.state === 'run' ? RUN : this.state === 'walk' ? WALK : BACK;
        const cadence = clamp(this.moveSpeed / nominal, 0.45, 1.15);
        this.phase += dt * (this.state === 'run' ? 11.5 : 7.2) * cadence * (this.state === 'back' ? -0.8 : 1);
        pose = gaitPose(this.phase, speed, this.state === 'back');
        this.stepEvent();
        break;
      }
      case 'turn':
        this.phase += dt * 6;
        pose = gaitPose(this.phase, 0.35);
        this.stepEvent();
        break;
      case 'quickturn':
        pose = gaitPose(this.phase, 0.6);
        break;
      case 'push': {
        this.phase += dt * 5;
        const g = gaitPose(this.phase, 0.6);
        pose = { ...g, spine: [0.35, 0, 0], shoulderL: [-1.35, 0, 0.1], shoulderR: [-1.35, 0, -0.1], elbowL: [-0.3, 0, 0], elbowR: [-0.3, 0, 0] };
        this.stepEvent();
        break;
      }
      case 'reach':
        pose = { spine: [0.2, 0, 0], shoulderR: [-1.2, 0, -0.1], elbowR: [-0.3, 0, 0], neck: [0.2, 0, 0] };
        if (this.stateTime > 0.55) this.setState('idle');
        break;
      case 'crouch':
        pose = {
          hips: [0, 0, 0],
          spine: [0.55, 0, 0],
          thighL: [-1.3, 0, 0],
          thighR: [-0.5, 0, 0],
          kneeL: [1.4, 0, 0],
          kneeR: [1.9, 0, 0],
          ankleL: [-0.1, 0, 0],
          ankleR: [-0.6, 0, 0],
          shoulderR: [-0.9, 0, -0.1],
          neck: [0.3, 0, 0],
        };
        if (this.stateTime > 0.75) this.setState('idle');
        break;
      case 'attack':
        pose = this.attackPose();
        rate = 18;
        if (!this.hitDone && this.stateTime >= this.weapon.hitAt) {
          this.hitDone = true;
          this.onAttackHit?.(this.weapon);
        }
        if (this.stateTime >= this.weapon.duration) this.setState('idle');
        break;
      case 'hurt':
        pose = { spine: [-0.35, 0, 0], neck: [-0.4, 0, 0], shoulderL: [-0.6, 0, 0.5], shoulderR: [-0.6, 0, -0.5], elbowL: [-1, 0, 0], elbowR: [-1, 0, 0] };
        rate = 20;
        if (this.stateTime > 0.45) this.setState('idle');
        break;
      case 'dead':
        this.deathT += dt;
        pose = {
          spine: [0.4, 0, 0],
          thighL: [-1.2, 0, 0],
          thighR: [-1.1, 0, 0],
          kneeL: [1.6, 0, 0],
          kneeR: [1.5, 0, 0],
          shoulderL: [-0.3, 0, 0.3],
          shoulderR: [-0.3, 0, -0.3],
          neck: [0.4, 0, 0],
        };
        rate = 6;
        break;
      default: {
        // Idle: breathing, lantern held forward, a slow look around.
        const b = Math.sin(time * 1.6);
        pose = { spine: [0.02 + b * 0.015, 0, 0], neck: [0.02, Math.sin(time * 0.4) * 0.25 * noise1(time * 0.2, 3), 0] };
        break;
      }
    }
    // The lantern arm stays raised and steady unless something violent is happening.
    if (this.state !== 'dead' && this.state !== 'hurt' && this.state !== 'push') {
      const sw = (pose.shoulderL?.[0] ?? 0) * 0.25;
      pose.shoulderL = [-0.55 + sw, 0.15, 0.12];
      pose.elbowL = [-0.9, 0, 0];
    }
    this.rig.applyPose(pose, rate, dt);

    // Death: sink to the knees, then fall forward.
    if (this.state === 'dead') {
      const t = clamp(this.deathT / 1.2, 0, 1);
      this.rig.body.position.y = -0.45 * Math.min(1, t * 1.5);
      this.rig.body.rotation.x = t > 0.5 ? (t - 0.5) * 2 * 1.35 : 0;
    } else {
      // Walking bob.
      const bob = this.state === 'walk' || this.state === 'run' ? Math.abs(Math.sin(this.phase)) * (this.state === 'run' ? 0.05 : 0.025) : 0;
      this.rig.body.position.y = this.state === 'crouch' ? -0.35 : bob;
      this.rig.body.rotation.x = 0;
    }

    // Lantern flicker.
    const fl = 0.86 + noise1(time * 9, 1) * 0.1 + noise1(time * 31, 2) * 0.06;
    this.lanternLight.intensity = this.lanternBase * this.lanternLevel * fl;
    this.lantern.rotation.z = Math.sin(time * 3.1 + this.phase * 0.5) * 0.08;
    this.sync();
  }

  private attackPose(): Pose {
    const t = this.stateTime / this.weapon.duration;
    if (this.weapon.id === 'kick') {
      const up = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
      return {
        spine: [-0.15 * up, 0, 0],
        thighR: [-1.4 * up, 0, 0],
        kneeR: [1.2 * (1 - up) + 0.1, 0, 0],
        thighL: [0.1 * up, 0, 0],
        shoulderR: [0.5 * up, 0, -0.3],
        neck: [0.1, 0, 0],
      };
    }
    // Overhead swing: wind up, strike down.
    const wind = t < 0.4 ? t / 0.4 : 0;
    const strike = t >= 0.4 ? Math.min(1, (t - 0.4) / 0.2) : 0;
    const back = t > 0.6 ? (t - 0.6) / 0.4 : 0;
    const shoulder = -2.6 * wind + (-2.6 + 2.2 * strike) * (t >= 0.4 ? 1 : 0) * (1 - back);
    return {
      spine: [-0.15 * wind + 0.35 * strike * (1 - back), 0.3 * wind - 0.2 * strike, 0],
      shoulderR: [shoulder, 0, -0.15],
      elbowR: [-0.8 * wind - 0.2, 0, 0],
      thighL: [-0.3 * strike * (1 - back), 0, 0],
      kneeL: [0.3 * strike * (1 - back), 0, 0],
    };
  }

  private stepEvent(): void {
    const s = Math.sign(Math.sin(this.phase));
    if (s !== 0 && s !== this.lastStepSign) {
      this.lastStepSign = s;
      this.onFootstep?.();
    }
  }

  private sync(): void {
    this.object.position.set(this.x, 0, this.z);
    this.object.rotation.y = this.heading;
  }

  /** Point just in front of the player at chest height (used for interaction probes). */
  front(dist = 0.7): { x: number; z: number } {
    const d = headingToDir(this.heading);
    return { x: this.x + d.x * dist, z: this.z + d.z * dist };
  }

  /** Angle between facing and a target point (radians, absolute). */
  angleTo(x: number, z: number): number {
    return Math.abs(angleDiff(this.heading, Math.atan2(x - this.x, z - this.z)));
  }
}
