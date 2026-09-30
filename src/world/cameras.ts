import { pointInRect, type Rect } from './collision';

/**
 * A fixed camera "shot". Like the 1992 original, every room is framed by a handful of hand-placed
 * cameras and the view cuts between them as the player walks from one trigger zone to another.
 */
export interface CameraDef {
  id: string;
  pos: [number, number, number];
  look: [number, number, number];
  /** Vertical field of view in degrees. */
  fov?: number;
  /** Trigger zones on the floor plane. The camera is used while the player stands in one of them. */
  zones: Rect[];
  /** 0..1 — how much the camera pans (rotates in place) to follow the player. 0 = locked-off shot. */
  track?: number;
  /** Higher wins when entering overlapping zones. */
  priority?: number;
}

export function inCameraZone(cam: CameraDef, x: number, z: number): boolean {
  for (const r of cam.zones) if (pointInRect(x, z, r)) return true;
  return false;
}

/**
 * Pick the active camera with hysteresis: keep the current shot while the player is still inside any of
 * its zones, so overlapping zones never cause rapid back-and-forth cutting at a boundary.
 */
export function selectCamera(cams: ReadonlyArray<CameraDef>, current: number, x: number, z: number): number {
  if (current >= 0 && current < cams.length && inCameraZone(cams[current], x, z)) return current;
  let best = -1;
  let bestPriority = -Infinity;
  for (let i = 0; i < cams.length; i++) {
    if (!inCameraZone(cams[i], x, z)) continue;
    const p = cams[i].priority ?? 0;
    if (p > bestPriority) {
      best = i;
      bestPriority = p;
    }
  }
  if (best >= 0) return best;
  // Outside every zone (should not happen in a well authored room): keep the current shot.
  return current >= 0 && current < cams.length ? current : 0;
}
