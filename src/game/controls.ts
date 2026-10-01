// Screen-relative ("player-centred") movement: the stick or arrow keys point where the character should
// go *as seen on screen*, and the character turns and walks that way. Pure functions so they can be
// unit tested without a browser.

/** Horizontal camera frame: f = into the screen (screen "up"), r = screen right. */
export interface Basis {
  fx: number;
  fz: number;
  rx: number;
  rz: number;
}

export interface StickInput {
  /** Screen-space direction: x = right, y = up (into the scene). Magnitude 0..1. */
  x: number;
  y: number;
  analog: boolean;
  /** Changes whenever the pressed digital keys change (unused for analog input). */
  sig: string;
}

export const DEADZONE = 0.15;

/** Build a basis from the camera's view direction projected on the floor. */
export function basisFromView(dx: number, dz: number, fallback = 0): Basis {
  let l = Math.hypot(dx, dz);
  if (l < 1e-4) {
    // Looking straight down: fall back to a given heading.
    dx = Math.sin(fallback);
    dz = Math.cos(fallback);
    l = 1;
  }
  const fx = dx / l;
  const fz = dz / l;
  // Right of a camera looking along f with +Y up.
  return { fx, fz, rx: -fz, rz: fx };
}

export function toWorld(b: Basis, x: number, y: number): { x: number; z: number } {
  const wx = b.fx * y + b.rx * x;
  const wz = b.fz * y + b.rz * x;
  const l = Math.hypot(wx, wz) || 1;
  return { x: wx / l, z: wz / l };
}

function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Fixed cameras cut while you walk. If directions were re-read from the new camera at the cut, a held
 * "right" could suddenly mean "towards the camera". The latch keeps the basis from the moment the input
 * started until the input itself changes (other keys, the stick turning, or letting go) — the approach
 * later remasters of the genre use for their "alternative" controls.
 */
export class MoveLatch {
  private basis: Basis | null = null;
  private sig = '';
  private angle = 0;

  reset(): void {
    this.basis = null;
  }

  /** Returns the world-space direction and magnitude, or null when the stick is at rest. */
  resolve(inp: StickInput, camera: Basis, live: boolean): { x: number; z: number; mag: number } | null {
    const mag = Math.min(1, Math.hypot(inp.x, inp.y));
    if (mag < DEADZONE) {
      this.basis = null;
      return null;
    }
    const angle = Math.atan2(inp.x, inp.y);
    const changed = inp.analog ? Math.abs(angDiff(this.angle, angle)) > 0.6 : inp.sig !== this.sig;
    if (live || !this.basis || changed) {
      this.basis = camera;
      this.sig = inp.sig;
      this.angle = angle;
    }
    const w = toWorld(this.basis, inp.x, inp.y);
    return { x: w.x, z: w.z, mag };
  }
}
