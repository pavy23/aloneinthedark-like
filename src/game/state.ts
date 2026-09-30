import type { RoomId } from '../world/types';

export const MAX_HP = 6;
const SAVE_KEYS = { auto: 'btk.save.auto.v1', manual: 'btk.save.manual.v1' } as const;
const SETTINGS_KEY = 'btk.settings.v1';
export type SlotId = keyof typeof SAVE_KEYS;

export interface GameState {
  v: 1;
  room: RoomId;
  spawn: string | null;
  x: number;
  z: number;
  h: number;
  hp: number;
  inv: string[];
  equipped: string | null;
  flags: Record<string, boolean | number>;
  docs: string[];
  push: Record<string, [number, number]>;
  time: number;
  saves: number;
  deaths: number;
  savedAt: number;
}

export function newState(): GameState {
  return {
    v: 1,
    room: 'deck',
    spawn: 'start',
    x: 0,
    z: 0,
    h: 0,
    hp: MAX_HP,
    inv: ['lantern', 'commission'],
    equipped: null,
    flags: {},
    docs: [],
    push: {},
    time: 0,
    saves: 0,
    deaths: 0,
    savedAt: 0,
  };
}

const ROOMS: RoomId[] = ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold'];

/** Validate untrusted JSON (localStorage can hold anything) into a GameState or null. */
export function parseState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.room !== 'string' || !ROOMS.includes(o.room as RoomId)) return null;
  const num = (k: string, d: number) => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : d);
  const inv = Array.isArray(o.inv) ? (o.inv as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const docs = Array.isArray(o.docs) ? (o.docs as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const flags: Record<string, boolean | number> = {};
  if (o.flags && typeof o.flags === 'object') {
    for (const [k, v] of Object.entries(o.flags as Record<string, unknown>)) {
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) flags[k] = v;
    }
  }
  const push: Record<string, [number, number]> = {};
  if (o.push && typeof o.push === 'object') {
    for (const [k, v] of Object.entries(o.push as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) push[k] = [v[0] as number, v[1] as number];
    }
  }
  return {
    v: 1,
    room: o.room as RoomId,
    spawn: typeof o.spawn === 'string' ? o.spawn : null,
    x: num('x', 0),
    z: num('z', 0),
    h: num('h', 0),
    hp: Math.max(1, Math.min(MAX_HP, Math.round(num('hp', MAX_HP)))),
    inv,
    equipped: typeof o.equipped === 'string' && inv.includes(o.equipped) ? o.equipped : null,
    flags,
    docs,
    push,
    time: num('time', 0),
    saves: num('saves', 0),
    deaths: num('deaths', 0),
    savedAt: num('savedAt', 0),
  };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSlot(slot: SlotId): GameState | null {
  try {
    const s = storage()?.getItem(SAVE_KEYS[slot]);
    return s ? parseState(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function writeSlot(slot: SlotId, st: GameState): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(SAVE_KEYS[slot], JSON.stringify(st));
    return true;
  } catch {
    return false;
  }
}

/** Most recent of the auto and manual slots. */
export function latestSave(): { slot: SlotId; state: GameState } | null {
  const a = readSlot('auto');
  const m = readSlot('manual');
  if (a && m) return a.savedAt >= m.savedAt ? { slot: 'auto', state: a } : { slot: 'manual', state: m };
  if (a) return { slot: 'auto', state: a };
  if (m) return { slot: 'manual', state: m };
  return null;
}

export interface Settings {
  res: 240 | 360 | 480;
  dither: boolean;
  levels: number;
  volume: number;
  music: number;
  hints: boolean;
  textSpeed: number;
  touch: 'auto' | 'on' | 'off';
}

export const DEFAULT_SETTINGS: Settings = { res: 240, dither: true, levels: 20, volume: 0.8, music: 0.7, hints: true, textSpeed: 42, touch: 'auto' };

export function readSettings(): Settings {
  try {
    const s = storage()?.getItem(SETTINGS_KEY);
    if (!s) return { ...DEFAULT_SETTINGS };
    const o = JSON.parse(s) as Partial<Settings>;
    const out = { ...DEFAULT_SETTINGS, ...o };
    if (![240, 360, 480].includes(out.res)) out.res = 240;
    out.levels = Math.max(6, Math.min(64, Number(out.levels) || 20));
    out.volume = Math.max(0, Math.min(1, Number(out.volume)));
    out.music = Math.max(0, Math.min(1, Number(out.music)));
    if (!['auto', 'on', 'off'].includes(out.touch)) out.touch = 'auto';
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(s: Settings): void {
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode, sandbox) — settings just won't persist */
  }
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh > 0 ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}
