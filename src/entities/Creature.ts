import * as THREE from 'three';
import { HumanRig, gaitPose, type Pose } from './Rig';
import { M } from '../render/materials';
import { angleDiff, clamp, dampAngle, noise1 } from '../core/math';
import type { CollisionWorld, Circle } from '../world/collision';
import type { NavGrid, P2 } from '../world/nav';
import { limb as limbModel } from '../world/props3';

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
    readonly variant: 'crew' | 'captain' | 'limb' = 'crew',
    /** Hit points a blow takes from the player. */
    readonly strength = 1,
  ) {
    this.x = x;
    this.z = z;
    this.heading = h;
    this.hp = hp;
    this.speed = speed;
    this.delay = delay;
    this.state = entrance === 'rise' ? 'rising' : 'hunt';
    this.rig =
      variant === 'captain'
        ? new HumanRig({
            // The master in his reefer jacket and cap, a week under water.
            colors: {
              coat: 0x18203a,
              coatDark: 0x0c1020,
              trousers: 0x161b2c,
              shoes: 0x0c0c0a,
              skin: 0x8c9a86,
              shirt: 0xb8b8a8,
              hat: 0x10162a,
              hatBand: 0xa8904a,
              hair: 0x9a9a92,
              accent: 0xb89a48,
              eyes: 0xd8f0c0,
            },
            scale: 1.07,
            bulk: 1.26,
            upperArm: 0.4,
            forearm: 0.42,
            handSize: 1.5,
            headSize: 0.21,
            torso: 0.62,
            hat: true,
            coatSkirt: true,
            seaweed: true,
          })
        : new HumanRig({
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
    if (variant === 'limb') {
      // Not a man at all: the human rig stays hidden and the limb takes its place.
      this.rig.root.visible = false;
      const l = limbModel();
      this.limbRoot = l.root;
      this.limbSegs = l.segs;
      this.object.add(l.root);
      if (this.state === 'rising') l.root.position.y = -4.5;
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M.shadow.m);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.016;
    this.object.add(this.shadow);
    if (this.state === 'rising') this.rig.body.position.y = -2.0;
    this.sync();
  }

  /** How far its blows reach. */
  get reach(): number {
    return this.variant === 'limb' ? 3.3 : 1.3;
  }

  get alive(): boolean {
    return this.state !== 'dying' && this.state !== 'gone';
  }

  get active(): boolean {
    return this.alive && this.state !== 'rising';
  }

  circle(): Circle {
    return { x: this.x, z: this.z, r: this.variant === 'limb' ? 0.5 : CREATURE_RADIUS };
  }

  private set(s: CreatureState): void {
    this.state = s;
    this.stateTime = 0;
  }

  damage(amount: number, fromX: number, fromZ: number): boolean {
    if (!this.active) return false;
    if (this.variant === 'limb') {
      // An axe bites into it and it does not care: it only flinches.
      this.hp = Math.max(1, this.hp - amount);
      if (this.state !== 'windup' && this.state !== 'strike') this.set('hurt');
      return true;
    }
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
    if (this.variant === 'limb') {
      this.stateTime += dt;
      this.updateLimb(dt, px, pz, playerAlive, time);
      return;
    }
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

  private limbRoot: THREE.Group | null = null;
  private limbSegs: THREE.Group[] = [];
  private limbCurl = 0;

  /**
   * The limb never moves from where it comes up. It sways, turns towards the player, rears back and slams
   * down on anyone within reach; blades only make it flinch. Only kill() (the arc) ends it.
   */
  private updateLimb(dt: number, px: number, pz: number, playerAlive: boolean, time: number): void {
    const root = this.limbRoot!;
    const dx = px - this.x;
    const dz = pz - this.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    // Target curl: + bends towards the player, - rears back.
    let curl = 0.06;
    let speed = 4;
    switch (this.state) {
      case 'rising': {
        const t = clamp(this.stateTime / 2.2, 0, 1);
        root.position.y = -4.5 * (1 - t) * (1 - t);
        curl = 0.2 * (1 - t);
        if (t >= 1) this.set('hunt');
        break;
      }
      case 'hunt':
        this.heading = dampAngle(this.heading, toPlayer, 1.6, dt);
        curl = 0.05 + Math.sin(time * 0.9 + this.seed) * 0.04;
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = 4 + Math.random() * 4;
          this.ev.onGrowl(this);
        }
        // It sways a while between blows: someone watching it can slip past in the gap.
        if (playerAlive && dist < this.reach && this.stateTime > 1.4 && Math.abs(angleDiff(this.heading, toPlayer)) < 0.6) this.set('windup');
        break;
      case 'windup':
        this.heading = dampAngle(this.heading, toPlayer, 3, dt);
        curl = -0.2;
        speed = 6;
        if (this.stateTime > 0.85) {
          this.set('strike');
          this.ev.onStrike(this);
        }
        break;
      case 'strike':
        curl = 0.32;
        speed = 22;
        if (this.stateTime > 0.3) this.set('recover');
        break;
      case 'recover':
        curl = 0.18;
        speed = 3;
        if (this.stateTime > 1.0) this.set('hunt');
        break;
      case 'hurt':
        curl = -0.12;
        speed = 14;
        if (this.stateTime > 0.5) this.set('hunt');
        break;
      case 'dying': {
        const t = clamp(this.stateTime / 2.8, 0, 1);
        curl = 0.12 + Math.sin(this.stateTime * 18) * 0.15 * (1 - t);
        root.position.y = -4.8 * Math.max(0, t - 0.35) * 1.5;
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
    this.limbCurl += (curl - this.limbCurl) * Math.min(1, speed * dt);
    this.limbSegs.forEach((s, i) => {
      const wave = Math.sin(time * 1.7 - i * 0.55 + this.seed) * 0.1 * (this.state === 'dying' ? 2 : 1);
      s.rotation.x = this.limbCurl * (0.6 + i * 0.08) + wave;
      s.rotation.z = Math.sin(time * 1.1 - i * 0.4) * 0.05;
    });
    this.shadow.visible = false;
    this.sync();
  }

  private sync(): void {
    this.object.position.set(this.x, 0, this.z);
    this.object.rotation.y = this.heading;
  }
}
