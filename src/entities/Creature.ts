import * as THREE from 'three';
import { HumanRig, gaitPose, type Pose } from './Rig';
import { M } from '../render/materials';
import { angleDiff, clamp, dampAngle, noise1 } from '../core/math';
import type { CollisionWorld, Circle } from '../world/collision';
import type { NavGrid, P2 } from '../world/nav';

export type CreatureState = 'rising' | 'hunt' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dying' | 'gone';

export const CREATURE_RADIUS = 0.32;

export interface CreatureEvents {
  onStrike: (c: Creature) => void;
  onGrowl: (c: Creature) => void;
  onStep: (c: Creature) => void;
  onDead: (c: Creature) => void;
}

/** A drowned crewman. Slow, relentless, hits hard; finds its way around furniture with A*. */
export class Creature {
  readonly rig: HumanRig;
  readonly object = new THREE.Group();
  x: number;
  z: number;
  heading: number;
  hp: number;
  state: CreatureState;
  stateTime = 0;
  speed: number;
  private phase = Math.random() * 6;
  private path: P2[] | null = null;
  private repathT = 0;
  private growlT = 2 + Math.random() * 3;
  private knockDir = 0;
  private lastStep = 0;
  private delay: number;
  private shadow: THREE.Mesh;
  private seed = Math.random() * 100;

  constructor(
    readonly id: string,
    x: number,
    z: number,
    h: number,
    hp: number,
    entrance: 'rise' | 'none',
    speed: number,
    delay: number,
    private ev: CreatureEvents,
  ) {
    this.x = x;
    this.z = z;
    this.heading = h;
    this.hp = hp;
    this.speed = speed;
    this.delay = delay;
    this.state = entrance === 'rise' ? 'rising' : 'hunt';
    this.rig = new HumanRig({
      colors: {
        coat: 0x1e2a33,
        coatDark: 0x11171c,
        trousers: 0x2a2b26,
        shoes: 0x14140f,
        skin: 0x86927e,
        shirt: 0x3a4a3c,
        hair: 0x1a2218,
        eyes: 0xc8e0b0,
      },
      bulk: 1.18,
      upperArm: 0.38,
      forearm: 0.4,
      handSize: 1.4,
      headSize: 0.21,
      torso: 0.6,
      seaweed: true,
    });
    this.object.add(this.rig.root);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.shadow.m);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.016;
    this.object.add(this.shadow);
    if (this.state === 'rising') this.rig.body.position.y = -2.0;
    this.sync();
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'gone';
  }

  get active(): boolean {
    return this.alive && this.state !== 'rising';
  }

  circle(): Circle {
    return { x: this.x, z: this.z, r: CREATURE_RADIUS };
  }

  private set(s: CreatureState): void {
    this.state = s;
    this.stateTime = 0;
  }

  damage(amount: number, fromX: number, fromZ: number): boolean {
    if (!this.active) return false;
    this.hp -= amount;
    this.knockDir = Math.atan2(this.x - fromX, this.z - fromZ);
    if (this.hp <= 0) {
      this.set('dying');
      return true;
    }
    // Once it has started to swing it does not flinch: trading blows has a price.
    if (this.state !== 'windup' && this.state !== 'strike') this.set('hurt');
    return true;
  }

  kill(): void {
    if (!this.alive) return;
    this.hp = 0;
    this.set('dying');
  }

  update(dt: number, px: number, pz: number, playerAlive: boolean, col: CollisionWorld, nav: NavGrid, others: ReadonlyArray<Circle>, time: number): void {
    if (this.delay > 0) {
      this.delay -= dt;
      this.object.visible = false;
      return;
    }
    this.object.visible = true;
    this.stateTime += dt;
    const dx = px - this.x;
    const dz = pz - this.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let pose: Pose = {};
    let rate = 10;

    switch (this.state) {
      case 'rising': {
        const t = clamp(this.stateTime / 1.8, 0, 1);
        this.rig.body.position.y = -2.0 * (1 - t) * (1 - t);
        this.heading = dampAngle(this.heading, toPlayer, 2, dt);
        pose = { spine: [0.6 * (1 - t), 0, 0], shoulderL: [-2.4 * (1 - t) - 0.4, 0, 0.3], shoulderR: [-2.2 * (1 - t) - 0.4, 0, -0.3], neck: [0.5, 0, 0.3] };
        if (t >= 1) this.set('hunt');
        break;
      }
      case 'hunt': {
        if (!playerAlive) {
          pose = { spine: [0.5, 0, 0], neck: [0.6, 0, 0] };
          break;
        }
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.45;
          this.path = col.lineOfSight(this.x, this.z, px, pz) ? [{ x: px, z: pz }] : nav.findPath({ x: this.x, z: this.z }, { x: px, z: pz });
        }
        let tx = px;
        let tz = pz;
        if (this.path && this.path.length > 0) {
          while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.35) this.path.shift();
          tx = this.path[0].x;
          tz = this.path[0].z;
        }
        const want = Math.atan2(tx - this.x, tz - this.z);
        this.heading = dampAngle(this.heading, want, 4, dt);
        const facingErr = Math.abs(angleDiff(this.heading, want));
        // Lurching gait: speed pulses with each step.
        this.phase += dt * 5.2;
        const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.phase));
        const lunge = dist < 2.4 ? 1.7 : 1;
        const sp = this.speed * pulse * lunge * (facingErr > 1.2 ? 0.2 : 1);
        if (dist > 0.95) {
          const res = col.moveCircle(this.x, this.z, Math.sin(this.heading) * sp * dt, Math.cos(this.heading) * sp * dt, CREATURE_RADIUS, undefined, others);
          this.x = res.x;
          this.z = res.z;
        }
        const g = gaitPose(this.phase, 0.7);
        pose = {
          ...g,
          spine: [0.45, Math.sin(this.phase) * 0.1, 0.12],
          neck: [0.35, 0, 0.35 + noise1(time + this.seed) * 0.2],
          shoulderL: [-1.2 + Math.sin(this.phase) * 0.15, 0, 0.25],
          shoulderR: [-1.0 - Math.sin(this.phase) * 0.15, 0, -0.2],
          elbowL: [-0.3, 0, 0],
          elbowR: [-0.5, 0, 0],
          kneeR: [(g.kneeR?.[0] ?? 0) + 0.25, 0, 0],
        };
        const s = Math.sign(Math.sin(this.phase));
        if (s !== this.lastStep) {
          this.lastStep = s;
          this.ev.onStep(this);
        }
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = 3 + Math.random() * 4;
          this.ev.onGrowl(this);
        }
        if (dist < 1.05 && Math.abs(angleDiff(this.heading, toPlayer)) < 0.8) {
          this.set('windup');
          this.ev.onGrowl(this);
        }
        break;
      }
      case 'windup': {
        this.heading = dampAngle(this.heading, toPlayer, 6, dt);
        const t = clamp(this.stateTime / 0.55, 0, 1);
        pose = { spine: [-0.2 * t, 0, 0], shoulderL: [-2.7 * t, 0, 0.3], shoulderR: [-2.7 * t, 0, -0.3], elbowL: [-0.4, 0, 0], elbowR: [-0.4, 0, 0], neck: [-0.2, 0, 0] };
        rate = 14;
        if (t >= 1) {
          this.set('strike');
          this.ev.onStrike(this);
        }
        break;
      }
      case 'strike': {
        pose = { spine: [0.6, 0, 0], shoulderL: [-0.9, 0, 0.1], shoulderR: [-0.9, 0, -0.1], elbowL: [-0.1, 0, 0], elbowR: [-0.1, 0, 0], neck: [0.3, 0, 0] };
        rate = 22;
        if (this.stateTime > 0.25) this.set('recover');
        break;
      }
      case 'recover':
        pose = { spine: [0.5, 0, 0], shoulderL: [-0.6, 0, 0.2], shoulderR: [-0.6, 0, -0.2], neck: [0.4, 0, 0.3] };
        rate = 6;
        if (this.stateTime > 0.75) this.set('hunt');
        break;
      case 'hurt': {
        const k = Math.max(0, 0.2 - this.stateTime) * 3.0;
        const res = col.moveCircle(this.x, this.z, Math.sin(this.knockDir) * k * dt, Math.cos(this.knockDir) * k * dt, CREATURE_RADIUS, undefined, others);
        this.x = res.x;
        this.z = res.z;
        pose = { spine: [-0.5, 0, 0.2], neck: [-0.6, 0, 0], shoulderL: [-0.3, 0, 0.8], shoulderR: [-0.3, 0, -0.8] };
        rate = 18;
        if (this.stateTime > 0.38) this.set('hunt');
        break;
      }
      case 'dying': {
        const t = clamp(this.stateTime / 2.6, 0, 1);
        pose = { spine: [0.5, 0, 0.3], thighL: [-1.2, 0, 0], thighR: [-1.3, 0, 0], kneeL: [1.8, 0, 0], kneeR: [1.8, 0, 0], neck: [0.8, 0, 0] };
        rate = 5;
        this.rig.body.position.y = -0.4 * Math.min(1, t * 2) - Math.max(0, t - 0.4) * 2.2;
        this.rig.body.rotation.x = Math.min(1, t * 1.6) * 1.2;
        if (t >= 1) {
          this.set('gone');
          this.object.visible = false;
          this.ev.onDead(this);
        }
        break;
      }
      case 'gone':
        return;
    }
    this.rig.applyPose(pose, rate, dt);
    this.shadow.visible = this.state !== 'rising' || this.stateTime > 0.9;
    this.sync();
  }

  private sync(): void {
    this.object.position.set(this.x, 0, this.z);
    this.object.rotation.y = this.heading;
  }
}
