import * as THREE from 'three';
import { RetroRenderer } from '../render/RetroRenderer';
import { Input } from '../core/Input';
import { AudioSystem } from '../audio/Audio';
import { UI } from '../ui/UI';
import { Player, PLAYER_RADIUS } from '../entities/Player';
import { Creature, CREATURE_RADIUS } from '../entities/Creature';
import { selectCamera, type CameraDef } from '../world/cameras';
import { distToRect, pointInRect, type Circle } from '../world/collision';
import { M } from '../render/materials';
import { angleDiff, clamp, damp, headingToDir, lerp, noise1 } from '../core/math';
import { josa } from '../core/josa';
import { buildRoom, LightPool, type PushState, type RoomInstance } from './World';
import { disposeTree } from '../world/RoomBuilder';
import { ITEMS } from './content';
import { MAX_HP, formatTime, latestSave, newState, parseState, readSettings, readSlot, writeSettings, writeSlot, type GameState, type Settings, type SlotId } from './state';
import { ROOMS } from '../world/rooms';
import type { ChoiceOption, CreatureSpawn, GameAPI, Interactable, RoomId } from '../world/types';
import { openInventory } from '../ui/Inventory';
import { openDoc } from '../ui/DocReader';
import { openSafePanel, openDynamoPanel, openRadioPanel } from '../ui/panels';
import * as Screens from '../ui/screens';
import { TouchControls } from '../ui/Touch';

type Mode = 'boot' | 'title' | 'play' | 'ending';

interface Wait {
  t: number;
  resolve: () => void;
}

export class Game implements GameAPI {
  readonly app: HTMLElement;
  readonly stage: HTMLElement;
  readonly renderer: RetroRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.05, 90);
  readonly input: Input;
  readonly audio = new AudioSystem();
  readonly ui: UI;
  readonly lights: LightPool;
  readonly pl = new Player();
  readonly touch: TouchControls;
  settings: Settings;
  state: GameState = newState();
  mode: Mode = 'boot';
  current: RoomInstance | null = null;
  creatures: Creature[] = [];
  camIndex = -1;
  camOverride: CameraDef | null = null;
  private lookTarget = new THREE.Vector3();
  private busyCount = 0;
  private waits: Wait[] = [];
  private shakeAmt = 0;
  private shakeT = 0;
  private flashAmt = 0;
  private last = 0;
  private realTime = 0;
  private gameTime = 0;
  private transitioning = false;
  private dead = false;
  private titleT = 0;
  private hintOn = true;
  private heartbeat = 0;
  private visitedCaption = new Set<string>();

  constructor(app: HTMLElement) {
    this.app = app;
    this.settings = readSettings();
    this.stage = document.createElement('div');
    this.stage.id = 'stage';
    const hud = document.createElement('div');
    hud.id = 'hud';
    const modal = document.createElement('div');
    modal.id = 'modal';
    const touchEl = document.createElement('div');
    touchEl.id = 'touch';
    app.append(this.stage, touchEl, modal);
    this.renderer = new RetroRenderer(this.stage);
    this.stage.append(hud);
    this.input = new Input(window);
    this.ui = new UI(hud, modal, this.audio);
    this.touch = new TouchControls(touchEl, this.input, () => this.layout());
    this.lights = new LightPool(this.scene, 6);
    this.scene.add(this.pl.object);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.08);
    this.scene.background = new THREE.Color(0x000000);
    this.pl.onFootstep = () => this.footstep();
    this.pl.onAttackSwing = () => this.audio.sfx('swing');
    this.pl.onAttackHit = (w) => this.attackHit(w.damage, w.range);
    this.applySettings(this.settings);
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 200));
    // Unlock audio on the first gesture anywhere.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock, { once: false });
    this.layout();
    (window as unknown as { __btk: unknown }).__btk = this.debugApi();
  }

  // ------------------------------------------------------------------ lifecycle

  /** Boot to the title screen, or straight back into a game (e.g. after a live page update). */
  start(resume?: unknown): void {
    const s = resume ? parseState(resume) : null;
    if (s) void this.loadState(s);
    else this.showTitle();
    requestAnimationFrame((t) => {
      this.last = t;
      requestAnimationFrame(this.frame);
    });
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.step(dt);
  };

  /** One fixed update + render. Exposed for automated tests (deterministic stepping). */
  step(dt: number): void {
    this.realTime += dt;
    this.input.beginFrame(this.realTime);
    this.ui.update(dt, this.input);
    const blocked = this.ui.blocking;
    if (this.mode === 'play' && this.current) {
      if (!blocked) this.simulate(dt);
      else this.cosmetic(dt);
    } else if (this.mode === 'title' && this.current) {
      this.titleCamera(dt);
      this.cosmetic(dt);
    }
    if (!blocked) this.tickWaits(dt);
    this.fx(dt);
    this.touch.suppress(this.mode !== 'play');
    this.audio.update(dt, this.mode === 'play' && !this.dead ? this.heartbeat : 0);
    this.renderer.render(this.scene, this.camera, this.realTime);
  }

  private tickWaits(dt: number): void {
    if (this.waits.length === 0) return;
    const done: Wait[] = [];
    for (const w of this.waits) {
      w.t -= dt;
      if (w.t <= 0) done.push(w);
    }
    if (done.length) {
      this.waits = this.waits.filter((w) => w.t > 0);
      for (const w of done) w.resolve();
    }
  }

  layout(): void {
    // #app is inset by the device safe areas, so measure it rather than the window.
    const W = this.app.clientWidth || window.innerWidth;
    const H = this.app.clientHeight || window.innerHeight;
    const touchOn = this.touch.visible;
    let fw: number;
    let fh: number;
    let top: number;
    let left: number;
    if (touchOn && H > W) {
      // Portrait phone: game frame on top, controls underneath.
      fw = W;
      fh = Math.round((W * 3) / 4);
      if (fh > H * 0.62) {
        fh = Math.round(H * 0.62);
        fw = Math.round((fh * 4) / 3);
      }
      left = Math.round((W - fw) / 2);
      top = Math.max(0, Math.round(Math.min(H * 0.08, (H - fh) * 0.25)));
    } else {
      fw = W;
      fh = (W * 3) / 4;
      if (fh > H) {
        fh = H;
        fw = (H * 4) / 3;
      }
      fw = Math.floor(fw);
      fh = Math.floor(fh);
      left = Math.floor((W - fw) / 2);
      top = Math.floor((H - fh) / 2);
    }
    Object.assign(this.stage.style, { left: `${left}px`, top: `${top}px`, width: `${fw}px`, height: `${fh}px` });
    this.renderer.layout(fw, fh);
    this.ui.setBaseSize(Math.max(12, Math.min(26, fh * 0.042)));
    this.touch.layout(W, H, { left, top, width: fw, height: fh });
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.renderer.applySettings({ height: s.res, levels: s.levels, dither: s.dither });
    this.audio.setVolume(s.volume);
    this.audio.setMusicVolume(s.music);
    this.ui.textSpeed = s.textSpeed;
    this.hintOn = s.hints;
    this.touch.setMode(s.touch);
    writeSettings(s);
    this.layout();
  }

  // ------------------------------------------------------------------ title / new game / load

  showTitle(): void {
    this.mode = 'title';
    this.ui.closeAll();
    this.clearCreatures();
    this.busyCount = 0;
    this.waits = [];
    this.dead = false;
    this.state = newState();
    this.loadRoom('deck');
    this.pl.object.visible = false;
    this.renderer.fade = 0;
    this.audio.setDanger(false);
    this.audio.setDynamo(false);
    this.audio.setAmbience('title');
    Screens.openTitle(this);
  }

  async newGame(): Promise<void> {
    this.audio.unlock();
    this.ui.closeAll();
    this.state = newState();
    this.visitedCaption.clear();
    await Screens.playIntro(this);
    this.mode = 'play';
    this.pl.object.visible = true;
    this.dead = false;
    await this.enterRoom('deck', 'start', true);
    void this.run(async () => {
      this.audio.sfx('foghorn', { volume: 0.7 });
      await this.wait(0.6);
      const how = this.touch.visible
        ? '(왼쪽 스틱으로 회전·전진, 끝까지 밀면 달리기. "조사" 버튼으로 살펴보고, "소지품"에서 물건을 쓴다.)'
        : '(방향키로 회전·전진, Shift 또는 ↑ 두 번으로 달리기. Space로 조사, I로 소지품, Esc로 저장·설정.)';
      await this.say('마그누스호의 보트가 안개 속으로 멀어진다. 노 젓는 소리마저 곧 삼켜졌다.', '갑판에는 아무도 없다. 선교 창문 너머로도 불빛 하나 보이지 않는다.', how);
    });
  }

  async loadGame(slot: SlotId): Promise<boolean> {
    const s = readSlot(slot);
    if (!s) return false;
    await this.loadState(s);
    return true;
  }

  async loadState(s: GameState): Promise<void> {
    this.audio.unlock();
    this.ui.closeAll();
    this.state = s;
    this.mode = 'play';
    this.dead = false;
    this.busyCount = 0;
    this.waits = [];
    this.pl.object.visible = true;
    this.pl.setWeapon(s.equipped, s.equipped ? (ITEMS[s.equipped]?.weapon ?? null) : null);
    await this.enterRoom(s.room, s.spawn, true, { x: s.x, z: s.z, h: s.h });
  }

  /** Current progress, for the host page's live-update hook. */
  snapshot(): GameState | null {
    return this.mode === 'play' && !this.dead ? JSON.parse(JSON.stringify(this.state)) : null;
  }

  async continueLatest(): Promise<void> {
    const l = latestSave();
    if (l) await this.loadGame(l.slot);
  }

  // ------------------------------------------------------------------ rooms

  private clearCreatures(): void {
    for (const c of this.creatures) {
      c.object.removeFromParent();
      disposeTree(c.object);
    }
    this.creatures = [];
    this.audio.setDanger(false);
  }

  private loadRoom(id: RoomId): void {
    if (this.current) this.current.dispose();
    this.clearCreatures();
    const def = ROOMS[id];
    const saved: Record<string, [number, number]> = {};
    for (const [k, v] of Object.entries(this.state.push)) if (k.startsWith(`${id}:`)) saved[k.slice(id.length + 1)] = v;
    this.current = buildRoom(def, this, saved);
    this.scene.add(this.current.root);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(def.fog.color);
    fog.density = def.fog.density;
    (this.scene.background as THREE.Color).setHex(def.fog.color);
    this.lights.configure(this.current, this.hasPower(), M.bulbOn.m, M.bulbOff.m);
    this.renderer.setGrade(def.grade?.saturation ?? 0.82, def.grade?.tint ?? 0xfff7e6);
    this.camIndex = -1;
    this.camOverride = null;
  }

  /** Build a room, place the player and kick off the room's entry script (not awaited). */
  private async enterRoom(id: RoomId, spawn: string | null, fromLoad: boolean, pos?: { x: number; z: number; h: number }): Promise<void> {
    this.loadRoom(id);
    const def = ROOMS[id];
    const sp = (spawn && def.spawns[spawn]) || Object.values(def.spawns)[0];
    if (pos) this.pl.place(pos.x, pos.z, pos.h);
    else this.pl.place(sp.x, sp.z, sp.h);
    this.state.room = id;
    this.state.spawn = spawn;
    this.state.x = this.pl.x;
    this.state.z = this.pl.z;
    this.state.h = this.pl.heading;
    this.pl.setState('idle');
    this.updateCamera(0, true);
    this.audio.setAmbience(def.ambience);
    this.audio.setDynamo(this.hasPower(), id === 'engine' ? 1 : 0.0001);
    if (!this.visitedCaption.has(id) || fromLoad) {
      this.visitedCaption.add(id);
      this.ui.caption(def.name, captionSub(id));
    }
    this.save(true);
    const onEnter = def.onEnter;
    if (onEnter) void this.run(async () => onEnter(this, this.current!, spawn ?? ''));
  }

  async goto(room: RoomId, spawn: string, sfx: 'door' | 'hatch' | 'ladder' | 'none' = 'door'): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;
    this.busyCount++;
    this.pl.frozen = true;
    try {
      if (sfx !== 'none') this.audio.sfx(sfx);
      await this.fadeTo(1, 0.45);
      await this.enterRoom(room, spawn, false);
      await this.fadeTo(0, 0.45);
    } finally {
      this.busyCount = Math.max(0, this.busyCount - 1);
      this.pl.frozen = this.busyCount > 0;
      this.transitioning = false;
    }
  }

  private fadeTo(target: number, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const from = this.renderer.fade;
      let t = 0;
      const tick = () => {
        t += 1 / 60;
        const k = clamp(t / seconds, 0, 1);
        this.renderer.fade = lerp(from, target, k);
        if (k >= 1) resolve();
        else setTimeout(tick, 1000 / 60);
      };
      tick();
    });
  }

  // ------------------------------------------------------------------ simulation

  get busy(): boolean {
    return this.busyCount > 0 || this.transitioning;
  }

  private simulate(dt: number): void {
    const room = this.current!;
    this.gameTime += dt;
    this.state.time += dt;
    const inp = this.input;
    if (!this.busy && !this.dead) {
      if (inp.justPressed('menu')) {
        inp.consume('menu');
        Screens.openPause(this);
        return;
      }
      if (inp.justPressed('inventory')) {
        inp.consume('inventory');
        openInventory(this);
        return;
      }
      if (inp.justPressed('attack')) {
        inp.consume('attack');
        this.pl.attack();
      }
      if (inp.justPressed('action') && !this.pl.busyAnim) {
        inp.consume('action');
        this.doAction();
      }
    }
    this.pl.frozen = this.busy || this.dead;
    const others = this.creatures.filter((c) => c.active).map((c) => c.circle());
    this.pl.update(dt, this.busy || this.dead ? null : inp, room.col, others, this.gameTime);
    this.updatePushables(dt);
    this.updateCreatures(dt);
    if (!this.busy && !this.dead) this.checkTriggers();
    this.updateCamera(dt, false);
    this.updateHint();
    this.lights.update(this.gameTime);
    room.def.update?.(this, room, dt, this.gameTime);
    this.state.x = this.pl.x;
    this.state.z = this.pl.z;
    this.state.h = this.pl.heading;
    const hpRatio = this.state.hp / MAX_HP;
    this.heartbeat = hpRatio <= 0.34 ? 1 : hpRatio <= 0.5 ? 0.4 : 0;
    this.renderer.pulse = this.heartbeat > 0 ? (0.5 + 0.5 * Math.sin(this.realTime * 7)) * 0.35 * this.heartbeat : 0;
  }

  /** Visual-only updates while the world is paused by a dialog. */
  private cosmetic(dt: number): void {
    const room = this.current;
    if (!room) return;
    this.lights.update(this.realTime);
    this.pl.lanternLight.intensity = this.pl.lanternBase * this.pl.lanternLevel * (0.9 + noise1(this.realTime * 9, 1) * 0.1);
    if (this.mode === 'title') room.def.update?.(this, room, dt, this.realTime);
  }

  private titleCamera(dt: number): void {
    this.titleT += dt;
    const t = this.titleT * 0.035;
    this.camera.position.set(-3.2 + Math.sin(t) * 2.2, 2.6 + Math.sin(t * 0.7) * 0.4, 11.5 - Math.cos(t) * 0.8);
    this.camera.fov = 50;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0.8, 3.4, -6);
    this.lights.update(this.realTime);
  }

  private updateCamera(dt: number, snap: boolean): void {
    const room = this.current;
    if (!room) return;
    let c: CameraDef;
    if (this.camOverride) {
      c = this.camOverride;
    } else {
      const cams = room.def.cameras;
      const idx = selectCamera(cams, this.camIndex, this.pl.x, this.pl.z);
      if (idx !== this.camIndex) {
        this.camIndex = idx;
        snap = true;
      }
      c = cams[idx];
    }
    const sx = this.shakeAmt > 0 ? (noise1(this.realTime * 40, 7) - 0.5) * this.shakeAmt : 0;
    const sy = this.shakeAmt > 0 ? (noise1(this.realTime * 40, 9) - 0.5) * this.shakeAmt : 0;
    this.camera.position.set(c.pos[0] + sx, c.pos[1] + sy, c.pos[2]);
    const fov = c.fov ?? 50;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const tr = c.track ?? 0;
    const tx = lerp(c.look[0], this.pl.x, tr);
    const ty = lerp(c.look[1], 1.1, tr);
    const tz = lerp(c.look[2], this.pl.z, tr);
    if (snap) this.lookTarget.set(tx, ty, tz);
    else {
      this.lookTarget.x = damp(this.lookTarget.x, tx, 4, dt);
      this.lookTarget.y = damp(this.lookTarget.y, ty, 4, dt);
      this.lookTarget.z = damp(this.lookTarget.z, tz, 4, dt);
    }
    this.camera.lookAt(this.lookTarget);
  }

  private fx(dt: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    if (this.flashAmt > 0) {
      this.flashAmt = Math.max(0, this.flashAmt - dt * 1.6);
      this.renderer.flash = this.flashAmt;
    }
  }

  private footstep(): void {
    const surf = this.current?.def.surface ?? 'metal';
    this.audio.sfx(`step-${surf}`, { volume: this.pl.state === 'run' ? 1 : 0.7 });
  }

  // ------------------------------------------------------------------ interaction

  findInteractable(): Interactable | null {
    const room = this.current;
    if (!room) return null;
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of room.interactables) {
      if (it.enabled && !it.enabled(this)) continue;
      const d = Math.hypot(it.x - this.pl.x, it.z - this.pl.z);
      if (d > (it.r ?? 1.3)) continue;
      const a = this.pl.angleTo(it.x, it.z);
      if (a > (it.cone ?? 1.3) && d > 0.35) continue;
      const score = d + a * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  private findPushable(): { p: PushState; ax: number; az: number } | null {
    const room = this.current;
    if (!room) return null;
    const f = headingToDir(this.pl.heading);
    const ax = Math.abs(f.x) > Math.abs(f.z) ? Math.sign(f.x) : 0;
    const az = ax === 0 ? Math.sign(f.z) : 0;
    // Only when facing along an axis (within ~35 degrees).
    const axisHeading = Math.atan2(ax, az);
    if (Math.abs(angleDiff(this.pl.heading, axisHeading)) > 0.62) return null;
    for (const p of room.pushables) {
      const rect = { minX: p.x - p.def.w / 2, minZ: p.z - p.def.d / 2, maxX: p.x + p.def.w / 2, maxZ: p.z + p.def.d / 2 };
      const d = distToRect(this.pl.x, this.pl.z, rect);
      if (d > PLAYER_RADIUS + 0.35) continue;
      const probe = this.pl.front(PLAYER_RADIUS + 0.3);
      if (!pointInRect(probe.x, probe.z, { minX: rect.minX - 0.05, minZ: rect.minZ - 0.05, maxX: rect.maxX + 0.05, maxZ: rect.maxZ + 0.05 })) continue;
      return { p, ax, az };
    }
    return null;
  }

  private doAction(): void {
    const push = this.findPushable();
    if (push) {
      this.tryPush(push.p, push.ax, push.az);
      return;
    }
    const it = this.findInteractable();
    if (it) {
      this.pl.face(it.x, it.z);
      void this.run(async () => it.onAction(this));
    }
  }

  private tryPush(p: PushState, ax: number, az: number): void {
    const room = this.current!;
    const nx = p.x + ax * p.def.step;
    const nz = p.z + az * p.def.step;
    const rect = { minX: nx - p.def.w / 2, minZ: nz - p.def.d / 2, maxX: nx + p.def.w / 2, maxZ: nz + p.def.d / 2 };
    const lim = p.def.limit;
    const inLimit = !lim || (rect.minX >= lim.minX - 1e-6 && rect.maxX <= lim.maxX + 1e-6 && rect.minZ >= lim.minZ - 1e-6 && rect.maxZ <= lim.maxZ + 1e-6);
    const avoid = this.creatures.filter((c) => c.active).map((c) => c.circle());
    if (!inLimit || !room.col.rectFree(rect, `push:${p.def.id}`, avoid)) {
      this.audio.sfx('push', { volume: 0.4 });
      void this.run(async () => {
        this.pl.setState('push');
        await this.wait(0.4);
        this.pl.setState('idle');
        await this.say('꿈쩍도 하지 않는다. 그쪽으로는 더 밀 수 없다.');
      });
      return;
    }
    void this.run(async () => {
      p.fx = p.x;
      p.fz = p.z;
      p.x = nx;
      p.z = nz;
      p.t = 0;
      room.syncPushCollider(p);
      p.def.object.position.x = p.fx;
      p.def.object.position.z = p.fz;
      this.audio.sfx('push');
      this.pl.setState('push');
      const startX = this.pl.x;
      const startZ = this.pl.z;
      const dur = 0.9;
      let t = 0;
      while (t < dur) {
        await this.wait(1 / 60);
        t += 1 / 60;
        const k = clamp(t / dur, 0, 1);
        this.pl.x = startX + ax * p.def.step * k * 0.85;
        this.pl.z = startZ + az * p.def.step * k * 0.85;
      }
      this.pl.setState('idle');
      this.state.push[`${room.def.id}:${p.def.id}`] = [p.x, p.z];
      room.nav = room.buildNav();
      p.def.onMoved?.(this, p.x, p.z);
    });
  }

  private updatePushables(dt: number): void {
    for (const p of this.current!.pushables) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 0.9);
      p.def.object.position.x = lerp(p.fx, p.x, p.t);
      p.def.object.position.z = lerp(p.fz, p.z, p.t);
    }
  }

  private checkTriggers(): void {
    const room = this.current!;
    for (const t of room.triggers) {
      if (t.once && this.flag(`trig:${room.def.id}:${t.id}`)) continue;
      if (t.enabled && !t.enabled(this)) continue;
      if (!pointInRect(this.pl.x, this.pl.z, t.rect)) continue;
      if (t.once) this.setFlag(`trig:${room.def.id}:${t.id}`);
      void this.run(async () => t.onEnter(this));
      return;
    }
  }

  private updateHint(): void {
    if (!this.hintOn || this.busy || this.dead) {
      this.ui.hint(null);
      return;
    }
    const push = this.findPushable();
    if (push) {
      this.ui.hint(' 밀기', '▸');
      return;
    }
    const it = this.findInteractable();
    this.ui.hint(it ? it.label : null, it?.verb ?? '조사');
  }

  /** Using an inventory item: on the thing in front of us first, then on ourselves. */
  async useItem(id: string): Promise<void> {
    const item = ITEMS[id];
    if (!item) return;
    await this.run(async () => {
      const it = this.findInteractable();
      if (it?.onItem) {
        this.pl.face(it.x, it.z);
        const used = await it.onItem(this, id);
        if (used) return;
      }
      if (item.kind === 'heal') {
        if (this.state.hp >= MAX_HP) {
          await this.say('지금은 마실 필요가 없다. 아껴 두자.');
          return;
        }
        this.state.hp = Math.min(MAX_HP, this.state.hp + 3);
        this.takeItem(id);
        this.audio.sfx('pickup', { volume: 0.6 });
        await this.say('브랜디를 한 모금 들이켰다. 목구멍이 타들어 가고, 떨리던 손이 조금 진정된다.');
        return;
      }
      if (item.kind === 'weapon') {
        this.equip(this.state.equipped === id ? null : id);
        await this.say(this.state.equipped === id ? `${josa(item.name, '을/를')} 손에 쥐었다. (F 키로 공격)` : `${josa(item.name, '을/를')} 집어넣었다.`);
        return;
      }
      if (item.kind === 'doc' && item.doc) {
        await this.readDoc(item.doc);
        return;
      }
      await this.say(it ? '여기에는 쓸 수 없을 것 같다.' : '무엇에 써야 할지 모르겠다. 쓸 곳 앞에서 다시 꺼내 보자.');
    });
  }

  equip(id: string | null): void {
    this.state.equipped = id;
    this.pl.setWeapon(id, id ? (ITEMS[id]?.weapon ?? null) : null);
  }

  // ------------------------------------------------------------------ combat

  private attackHit(damage: number, range: number): void {
    let hit = false;
    for (const c of this.creatures) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - this.pl.x, c.z - this.pl.z);
      if (d > range + CREATURE_RADIUS) continue;
      if (this.pl.angleTo(c.x, c.z) > 1.0) continue;
      if (c.damage(damage, this.pl.x, this.pl.z)) {
        hit = true;
        this.audio.sfx('hit-flesh');
        this.shake(0.05, 0.15);
        if (!c.alive) this.audio.sfx('creature-die');
      }
    }
    if (!hit) {
      const it = this.findInteractable();
      if (it?.onItem) {
        const fn = it.onItem;
        void this.run(async () => {
          await fn(this, '@attack');
        });
      }
    }
  }

  private creatureStrike(c: Creature): void {
    if (this.dead || !c.active) return;
    const d = Math.hypot(c.x - this.pl.x, c.z - this.pl.z);
    const a = Math.abs(angleDiff(c.heading, Math.atan2(this.pl.x - c.x, this.pl.z - c.z)));
    if (d > 1.3 || a > 1.1) return;
    this.state.hp -= 1;
    this.pl.hurt(c.x, c.z);
    this.audio.sfx('hurt');
    this.flash(0x8a0000, 0.55);
    this.shake(0.12, 0.3);
    if (this.state.hp <= 0) {
      this.state.hp = 0;
      void this.playerDeath();
    }
  }

  private async playerDeath(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    this.state.deaths += 1;
    this.pl.die();
    this.audio.sfx('stinger');
    this.audio.setDanger(false);
    await this.wait(2.4);
    await this.fadeTo(1, 1.2);
    Screens.openGameOver(this);
  }

  async retryFromDeath(): Promise<void> {
    const deaths = this.state.deaths;
    const l = latestSave();
    if (l) {
      await this.loadGame(l.slot);
      this.state.deaths = Math.max(this.state.deaths, deaths);
      // A second wind, so an autosave taken on the brink can't trap you in a death loop.
      this.state.hp = Math.max(this.state.hp, 3);
    } else {
      this.showTitle();
    }
    await this.fadeTo(0, 0.6);
  }

  private updateCreatures(dt: number): void {
    const room = this.current!;
    const fire: Circle[] = (room.def.fireZones ?? []).map(([x, z, r]) => ({ x, z, r }));
    let hunting = false;
    for (const c of this.creatures) {
      if (c.state === 'gone') continue;
      const others: Circle[] = [...fire, ...(this.dead ? [] : [this.pl.circle()])];
      for (const o of this.creatures) if (o !== c && o.active) others.push(o.circle());
      c.update(dt, this.pl.x, this.pl.z, !this.dead, room.col, room.nav, others, this.gameTime);
      if (c.active) hunting = true;
    }
    this.audio.setDanger(hunting && !this.dead);
  }

  // ------------------------------------------------------------------ GameAPI

  get time(): number {
    return this.gameTime;
  }

  get room(): RoomInstance {
    return this.current!;
  }

  get player() {
    const pl = this.pl;
    return {
      get x() {
        return pl.x;
      },
      get z() {
        return pl.z;
      },
      get heading() {
        return pl.heading;
      },
      face: (x: number, z: number) => pl.face(x, z),
      pose: (p: 'reach' | 'crouch' | 'none') => pl.pose(p),
    };
  }

  flag(name: string): boolean {
    return !!this.state.flags[name];
  }

  num(name: string): number {
    const v = this.state.flags[name];
    return typeof v === 'number' ? v : v ? 1 : 0;
  }

  setFlag(name: string, v: boolean | number = true): void {
    this.state.flags[name] = v;
  }

  hasItem(id: string): boolean {
    return this.state.inv.includes(id);
  }

  async giveItem(id: string, opts: { silent?: boolean } = {}): Promise<void> {
    if (this.hasItem(id)) return;
    this.state.inv.push(id);
    this.audio.sfx('pickup');
    if (!opts.silent) {
      this.pl.pose('crouch');
      await this.wait(0.35);
      this.ui.note(`${josa(ITEMS[id]?.name ?? id, '을/를')} 얻었다`);
    }
  }

  takeItem(id: string): void {
    this.state.inv = this.state.inv.filter((i) => i !== id);
    if (this.state.equipped === id) this.equip(null);
  }

  equipped(): string | null {
    return this.state.equipped;
  }

  say(...lines: string[]): Promise<void> {
    return this.ui.say(lines);
  }

  ask(text: string, options: ChoiceOption[]): Promise<number> {
    return this.ui.ask(text, options);
  }

  async readDoc(id: string): Promise<void> {
    if (!this.state.docs.includes(id)) this.state.docs.push(id);
    this.audio.sfx('doc');
    await openDoc(this, id);
  }

  sfx(name: string, opts: { volume?: number; x?: number; z?: number } = {}): void {
    let v = opts.volume ?? 1;
    if (opts.x !== undefined && opts.z !== undefined) {
      const d = Math.hypot(opts.x - this.pl.x, opts.z - this.pl.z);
      v *= clamp(1.4 / (0.6 + d * 0.35), 0.15, 1);
    }
    this.audio.sfx(name, { volume: v });
  }

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.waits.push({ t: seconds, resolve }));
  }

  async openPanel(kind: 'safe' | 'dynamo' | 'radio'): Promise<void> {
    if (kind === 'safe') await openSafePanel(this);
    else if (kind === 'dynamo') await openDynamoPanel(this);
    else await openRadioPanel(this);
  }

  cutTo(cam: CameraDef | null): void {
    this.camOverride = cam;
    this.updateCamera(0, true);
  }

  shake(amount: number, seconds = 0.4): void {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeT = Math.max(this.shakeT, seconds);
  }

  flash(color: number, amount: number): void {
    (this.renderer.post.uniforms.uFlashColor.value as THREE.Color).setHex(color);
    this.flashAmt = Math.max(this.flashAmt, amount);
    this.renderer.flash = this.flashAmt;
  }

  spawnCreature(s: CreatureSpawn): void {
    if (this.flag(`dead:${s.id}`) || this.flag('idolBurned')) return;
    if (this.creatures.some((c) => c.id === s.id && c.state !== 'gone')) return;
    const c = new Creature(s.id, s.x, s.z, s.h ?? 0, s.hp ?? 3, s.entrance ?? 'none', s.speed ?? 1.15, s.delay ?? 0, {
      onStrike: (cr) => this.creatureStrike(cr),
      onGrowl: (cr) => this.sfx('growl', { x: cr.x, z: cr.z }),
      onStep: (cr) => this.sfx('creature-step', { x: cr.x, z: cr.z, volume: 0.8 }),
      onDead: (cr) => {
        this.setFlag(`dead:${cr.id}`);
        cr.object.removeFromParent();
        disposeTree(cr.object);
      },
    });
    this.creatures.push(c);
    this.scene.add(c.object);
    if (s.entrance === 'rise') this.sfx('splash', { x: s.x, z: s.z });
  }

  creaturesAlive(): number {
    return this.creatures.filter((c) => c.alive).length;
  }

  killAllCreatures(): void {
    for (const c of this.creatures) if (c.alive) c.kill();
  }

  save(auto = false): void {
    this.state.x = this.pl.x;
    this.state.z = this.pl.z;
    this.state.h = this.pl.heading;
    this.state.savedAt = Date.now();
    if (!auto) this.state.saves += 1;
    writeSlot(auto ? 'auto' : 'manual', this.state);
  }

  async ending(): Promise<void> {
    if (this.mode === 'ending') return;
    this.mode = 'ending';
    this.clearCreatures();
    await Screens.playEnding(this);
  }

  hasPower(): boolean {
    return this.flag('power');
  }

  refreshLights(): void {
    if (!this.current) return;
    this.lights.configure(this.current, this.hasPower(), M.bulbOn.m, M.bulbOff.m);
  }

  note(text: string): void {
    this.ui.note(text);
  }

  /** Run a script with player control locked. */
  async run(fn: () => void | Promise<void>): Promise<void> {
    this.busyCount++;
    this.pl.frozen = true;
    try {
      await fn();
    } catch (e) {
      console.error(e);
    } finally {
      this.busyCount = Math.max(0, this.busyCount - 1);
      this.pl.frozen = this.busyCount > 0;
    }
  }

  playTimeText(): string {
    return formatTime(this.state.time);
  }

  // ------------------------------------------------------------------ test hooks

  private debugApi() {
    return {
      game: this,
      step: (n = 1, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) this.step(dt);
      },
      state: () => this.state,
      teleport: async (room: RoomId, x: number, z: number, h = 0) => {
        await this.enterRoom(room, Object.keys(ROOMS[room].spawns)[0], false);
        this.pl.place(x, z, h);
        this.renderer.fade = 0;
        this.updateCamera(0, true);
      },
      play: async (room: RoomId, x?: number, z?: number, h = 0) => {
        this.ui.closeAll();
        this.mode = 'play';
        this.dead = false;
        this.busyCount = 0;
        this.waits = [];
        this.pl.object.visible = true;
        await this.enterRoom(room, Object.keys(ROOMS[room].spawns)[0], false);
        if (x !== undefined && z !== undefined) this.pl.place(x, z, h);
        this.renderer.fade = 0;
        this.camOverride = null;
        this.camIndex = -1;
        this.updateCamera(0, true);
      },
      setFlags: (f: Record<string, boolean | number>) => {
        Object.assign(this.state.flags, f);
        this.refreshLights();
      },
      give: (id: string) => {
        if (!this.state.inv.includes(id)) this.state.inv.push(id);
      },
      release: () => {
        this.camOverride = null;
        this.updateCamera(0, true);
      },
      camera: (i: number) => {
        this.camOverride = this.current!.def.cameras[i] ?? null;
        this.updateCamera(0, true);
      },
      info: () => ({
        mode: this.mode,
        room: this.current?.def.id,
        cam: this.camIndex,
        x: this.pl.x,
        z: this.pl.z,
        h: this.pl.heading,
        hp: this.state.hp,
        busy: this.busy,
        ui: this.ui.anyOpen,
        creatures: this.creatures.map((c) => ({ id: c.id, state: c.state, x: c.x, z: c.z, hp: c.hp })),
        hint: this.findInteractable()?.id ?? null,
        inv: [...this.state.inv],
        flags: { ...this.state.flags },
      }),
    };
  }
}

function captionSub(id: RoomId): string {
  switch (id) {
    case 'deck':
      return 'FORE DECK';
    case 'bridge':
      return 'WHEELHOUSE';
    case 'corridor':
      return 'OFFICERS’ ALLEYWAY';
    case 'cabin':
      return 'MASTER’S CABIN';
    case 'radio':
      return 'WIRELESS ROOM';
    case 'engine':
      return 'ENGINE ROOM';
    case 'hold':
      return 'CABLE TANK No.1';
  }
}
