import type * as THREE from 'three';
import type { RoomBuilder } from '../RoomBuilder';
import type { GameAPI, Interactable, RoomId } from '../types';
import type { Rect } from '../collision';
import { ITEMS } from '../../game/content';

/** A door (or ladder/stairs) the player uses with the action key. */
export function exit(
  b: RoomBuilder,
  o: {
    id: string;
    x: number;
    z: number;
    label: string;
    to: RoomId;
    spawn: string;
    sfx?: 'door' | 'hatch' | 'ladder' | 'none';
    r?: number;
    /** Return a message to block the exit, or null to allow. */
    locked?: (g: GameAPI) => string | string[] | null;
    onItem?: Interactable['onItem'];
    /** Item that unlocks this exit; used automatically when carried (and via the inventory). */
    unlockWith?: string;
    unlockFlag?: string;
    unlockText?: string;
  },
): void {
  const unlock = async (g: GameAPI): Promise<void> => {
    g.setFlag(o.unlockFlag!);
    g.sfx('unlock');
    await g.say(o.unlockText ?? '열렸다.');
  };
  b.interact({
    id: o.id,
    x: o.x,
    z: o.z,
    r: o.r ?? 1.35,
    label: o.label,
    verb: o.sfx === 'ladder' ? '오르내리기' : '이동',
    onAction: async (g) => {
      if (o.unlockWith && o.unlockFlag && !g.flag(o.unlockFlag) && g.hasItem(o.unlockWith)) {
        await unlock(g);
        return;
      }
      const lock = o.locked?.(g);
      if (lock) {
        g.sfx('locked');
        await g.say(...(Array.isArray(lock) ? lock : [lock]));
        return;
      }
      await g.goto(o.to, o.spawn, o.sfx ?? 'door');
    },
    onItem:
      o.onItem ??
      (o.unlockWith
        ? async (g, item) => {
            if (item !== o.unlockWith || g.flag(o.unlockFlag!)) return false;
            await unlock(g);
            return true;
          }
        : undefined),
  });
}

/** An item lying in the world. Disappears once taken (remembered by flag `got:<item>`). */
export function pickup(
  b: RoomBuilder,
  g: GameAPI,
  o: { item: string; x: number; y?: number; z: number; ry?: number; model?: THREE.Object3D; label?: string; text?: string[]; read?: boolean; r?: number },
): void {
  if (g.flag(`got:${o.item}`)) return;
  const def = ITEMS[o.item];
  const obj = o.model ?? def.model();
  const name = `pickup:${o.item}`;
  obj.name = name;
  b.add(obj, o.x, o.y ?? 0.02, o.z, o.ry ?? 0, { dynamic: true });
  b.interact({
    id: name,
    x: o.x,
    z: o.z,
    r: o.r ?? 1.3,
    label: o.label ?? def.name,
    verb: '줍기',
    enabled: (gg) => !gg.flag(`got:${o.item}`),
    onAction: async (gg) => {
      if (o.text) await gg.say(...o.text);
      gg.setFlag(`got:${o.item}`);
      const m = gg.room.get(name);
      if (m) m.visible = false;
      await gg.giveItem(o.item);
      if (def.kind === 'doc' && def.doc && o.read !== false) await gg.readDoc(def.doc);
    },
  });
}

/** Something to look at. Lines can depend on state. */
export function look(b: RoomBuilder, id: string, x: number, z: number, label: string, lines: string[] | ((g: GameAPI) => string[]), r = 1.2): void {
  b.interact({
    id,
    x,
    z,
    r,
    label,
    onAction: async (g) => {
      const ls = typeof lines === 'function' ? lines(g) : lines;
      await g.say(...ls);
    },
  });
}

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX, minZ, maxX, maxZ };
}
