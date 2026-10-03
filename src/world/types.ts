import type * as THREE from 'three';
import type { CameraDef } from './cameras';
import type { CollisionWorld, Rect } from './collision';
import type { NavGrid } from './nav';
import type { RoomBuilder } from './RoomBuilder';

export type RoomId =
  | 'deck'
  | 'bridge'
  | 'corridor'
  | 'cabin'
  | 'radio'
  | 'engine'
  | 'hold'
  | 'fcsle'
  | 'testroom'
  | 'tank2'
  // Act 3: the cable landing station at Bell Cove
  | 'station'
  | 'opsroom'
  | 'battery'
  | 'beach'
  // Act 4: the repair ship St Brendan over the cable's grave
  | 'sbdeck'
  | 'sbbridge'
  | 'sbtest'
  | 'sbstoke'
  // Epilogue: the underwriters' committee room in London
  | 'inquiry';

export type AmbienceId = 'deck' | 'interior' | 'engine' | 'hold' | 'bridge' | 'snow' | 'shore' | 'station' | 'none';
export type Surface = 'metal' | 'wood' | 'grate' | 'lino' | 'snow' | 'shingle';

export interface Spawn {
  x: number;
  z: number;
  /** Heading in radians (0 faces +Z, PI/2 faces +X). */
  h: number;
}

/** Something the player can examine or use an item on by facing it and pressing the action key. */
export interface Interactable {
  id: string;
  x: number;
  z: number;
  /** Reach distance from the player's centre to the anchor. Default 1.2 m. */
  r?: number;
  /** Max angle between facing and the anchor (radians). Default ~75 degrees. */
  cone?: number;
  /** Short name shown in the hint bubble. */
  label: string;
  /** Verb shown in the hint bubble (default: 조사). */
  verb?: string;
  enabled?: (g: GameAPI) => boolean;
  onAction: (g: GameAPI) => void | Promise<void>;
  /** Using an inventory item here. Return true when the item did something. */
  onItem?: (g: GameAPI, itemId: string) => boolean | Promise<boolean>;
}

/** Floor zone that fires a script when the player walks in. */
export interface Trigger {
  id: string;
  rect: Rect;
  /** Fire only once per playthrough (remembered in the save). */
  once?: boolean;
  enabled?: (g: GameAPI) => boolean;
  onEnter: (g: GameAPI) => void | Promise<void>;
}

export interface PushableDef {
  id: string;
  object: THREE.Object3D;
  /** Footprint size on the floor. */
  w: number;
  d: number;
  /** Distance moved per push. */
  step: number;
  /** Optional clamp of where it can go. */
  limit?: Rect;
  onMoved?: (g: GameAPI, x: number, z: number) => void;
}

export interface LightSpec {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  /** 0 = steady; >0 = flicker amount. */
  flicker?: number;
  /** Only lit when the ship has power again. */
  needsPower?: boolean;
  name?: string;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  outdoor?: boolean;
  fog: { color: number; density: number };
  hemi: { sky: number; ground: number; intensity: number };
  moon?: { color: number; intensity: number; dir: [number, number, number] };
  /** Post-process colour grade. */
  grade?: { saturation: number; tint: number };
  ambience: AmbienceId;
  surface: Surface;
  bounds: Rect;
  spawns: Record<string, Spawn>;
  cameras: CameraDef[];
  /** Circles creatures refuse to enter (the glow in front of lit furnaces). [x, z, r] */
  fireZones?: Array<[number, number, number]>;
  build(b: RoomBuilder, g: GameAPI): void;
  onEnter?(g: GameAPI, room: RoomInstanceAPI, fromSpawn: string): void | Promise<void>;
  update?(g: GameAPI, room: RoomInstanceAPI, dt: number, t: number): void;
}

/** What room scripts can do while building (implemented by RoomBuilder). */
export interface RoomBuilderAPI {
  readonly root: THREE.Group;
  readonly col: CollisionWorld;
  named: Map<string, THREE.Object3D>;
  interact(i: Interactable): void;
  trigger(t: Trigger): void;
  light(l: LightSpec): void;
  pushable(p: PushableDef, x: number, z: number): void;
}

export interface RoomInstanceAPI {
  readonly def: RoomDef;
  readonly root: THREE.Group;
  readonly col: CollisionWorld;
  readonly nav: NavGrid;
  get<T extends THREE.Object3D = THREE.Object3D>(name: string): T | undefined;
  interactables: Interactable[];
  /** Live light specs; changing a spec's intensity takes effect on the next frame. */
  lights: LightSpec[];
}

export interface CreatureSpawn {
  id: string;
  x: number;
  z: number;
  h?: number;
  hp?: number;
  /** 'rise' plays an emerge animation (from water / floor) first. */
  entrance?: 'rise' | 'none';
  speed?: number;
  delay?: number;
  /** 'captain' is the drowned master in tank No.2 (bigger, tougher, hits harder); 'limb' is what comes
   * out of the sea at the cable hut (rooted to the spot, long reach, cannot be killed by a blade). */
  variant?: 'crew' | 'captain' | 'limb';
  /** Hit points taken from the player per blow (default 1). */
  strength?: number;
}

export interface ChoiceOption {
  label: string;
  disabled?: boolean;
}

export type PanelKind =
  | 'safe'
  | 'dynamo'
  | 'radio'
  | 'bridge'
  | 'valves'
  | 'cableEngine'
  // Act 3
  | 'tape'
  | 'combo'
  | 'rack'
  | 'switches'
  | 'bridge3'
  | 'coil'
  | 'hutKey'
  // Act 4
  | 'chart'
  | 'grapple'
  | 'heave'
  | 'ends'
  // Epilogue
  | 'inquiry';

/** The surface area room scripts use to drive the game. Implemented by Game. */
export interface GameAPI {
  /** Seconds since this page started (animation clock). */
  readonly time: number;
  /** Play time of this game, saved with it (use for anything that must survive a save and reload). */
  readonly playTime: number;
  flag(name: string): boolean;
  num(name: string): number;
  setFlag(name: string, v?: boolean | number): void;
  hasItem(id: string): boolean;
  giveItem(id: string, opts?: { silent?: boolean }): Promise<void>;
  takeItem(id: string): void;
  equipped(): string | null;
  say(...lines: string[]): Promise<void>;
  ask(text: string, options: ChoiceOption[]): Promise<number>;
  readDoc(id: string): Promise<void>;
  goto(room: RoomId, spawn: string, sfx?: 'door' | 'hatch' | 'ladder' | 'none'): Promise<void>;
  sfx(name: string, opts?: { volume?: number; x?: number; z?: number }): void;
  wait(seconds: number): Promise<void>;
  openPanel(kind: PanelKind): Promise<void>;
  cutTo(cam: CameraDef | null): void;
  shake(amount: number, seconds?: number): void;
  flash(color: number, amount: number): void;
  spawnCreature(s: CreatureSpawn): void;
  creaturesAlive(): number;
  killAllCreatures(): void;
  player: { x: number; z: number; heading: number; face(x: number, z: number): void; pose(p: 'reach' | 'crouch' | 'none'): void };
  room: RoomInstanceAPI;
  save(auto?: boolean): void;
  ending(): Promise<void>;
  hasPower(): boolean;
  refreshLights(): void;
  note(text: string): void;
  /** Big chapter caption (like a room caption, but for acts). */
  chapter(title: string, sub: string): void;
  /** End the current act: its closing scene, then the next act begins (or the game ends). */
  nextAct(): Promise<void>;
  /** A script is running (player control locked) or a room transition is under way. */
  readonly busy: boolean;
  /** Run a script with player control locked. */
  run(fn: () => void | Promise<void>): Promise<void>;
}
