// Act 2 puzzle logic ("Beneath the Forecastle"). Pure functions (no DOM, no three.js) so they can be
// unit tested.

// ---------------------------------------------------------------- Knocking on the chain-locker doors

/** Behind one door is the wireless operator; behind the other, the thing that learned to copy our signals. */
export type DoorVoice = 'mimic' | 'pell';

/**
 * What comes back through a door after you knock `sent` (Morse letters, e.g. 'SOS'). The thing can only
 * repeat what it hears. A wireless operator acknowledges instead: "R" (received), or "K" (go ahead) when
 * the knock itself was an R — so his answer is never an echo.
 */
export function knockReply(voice: DoorVoice, sent: string): string {
  if (voice === 'mimic') return sent;
  return sent === 'R' ? 'K' : 'R';
}

export function isEcho(sent: string, reply: string): boolean {
  return sent.length > 0 && sent === reply;
}

// ---------------------------------------------------------------- Wheatstone bridge in the testing room

/** Ratio-arm settings of the bridge: the reading is the decade-box value times this factor. */
export const BRIDGE_RATIOS = [0.01, 0.1, 1] as const;
export type BridgeRatio = (typeof BRIDGE_RATIOS)[number];

/**
 * Galvanometer sensitivity with its shunts in: the 1/999, 1/99 and 1/9 shunts pass 1/1000, 1/100 and 1/10 of
 * the current through the instrument; 1 = no shunt, full sensitivity.
 */
export const SHUNTS = [0.001, 0.01, 0.1, 1] as const;
export type Shunt = (typeof SHUNTS)[number];

/** Four decade dials (thousands, hundreds, tens, units) of the resistance box. */
export function decadeValue(d: readonly number[]): number {
  return d.reduce((acc, v) => acc * 10 + Math.max(0, Math.min(9, Math.round(v))), 0);
}

export function bridgeReading(dials: readonly number[], ratio: number): number {
  return decadeValue(dials) * ratio;
}

/** How hard the unshunted mirror galvanometer swings for a given relative imbalance. */
const GALVO_GAIN = 150;

/**
 * Position of the light spot on the scale, -1 (hard left) … +1 (hard right). Left means the box is set too
 * low, right too high. Shunting the galvanometer divides its sensitivity, so a coarse balance is found with
 * the shunt in and the last digit with it out.
 */
export function galvanometerSpot(trueOhms: number, readingOhms: number, shunt: number): number {
  if (!Number.isFinite(trueOhms)) return -1; // open circuit: no box setting is ever high enough
  const rel = (readingOhms - trueOhms) / trueOhms;
  return Math.tanh(GALVO_GAIN * shunt * rel);
}

/** The finest ratio arms that still let the four dials reach `ohms`, so that every decade of the box counts. */
export function finestRatio(ohms: number): number | null {
  for (const r of BRIDGE_RATIOS) if (ohms / r <= 9999.5) return r;
  return null;
}

export type BalanceVerdict = 'balanced' | 'off' | 'shunted' | 'coarse';

/**
 * Can this balance be written down? The spot must sit on zero to within 0.2 % (or within the box's last
 * step, where that is coarser), with the shunt out, and with the ratio arms chosen so that all four dials
 * count: a balance on coarser arms is a rougher number.
 */
export function balanceVerdict(trueOhms: number, readingOhms: number, ratio: number, shunt: number): BalanceVerdict {
  if (!Number.isFinite(trueOhms)) return 'off';
  const tol = Math.max(0.002 * trueOhms, 0.6 * ratio);
  if (Math.abs(readingOhms - trueOhms) > tol) return 'off';
  if (shunt !== 1) return 'shunted';
  if (ratio !== finestRatio(trueOhms)) return 'coarse';
  return 'balanced';
}

/**
 * Copper resistance of the cable's core per nautical mile. A 300 lb/nm core (as in the 1866 Atlantic cable)
 * measured 4.272 Ω per knot at 24 °C; copper loses about 0.39 % per °C, so on the sea bed at ~3 °C it is
 * about 3.9 Ω (see DESIGN.md, sources).
 */
export const CORE_OHMS_PER_NM = 3.9;

/** The end that runs back to the shore station: its far end is earthed through the station's instruments. */
export const SHORE_END_NM = 1037;

/**
 * Where the thing is on its cable (nautical miles below the bow), `seconds` of play after it started to
 * climb: about half a mile an hour, slow enough to balance the bridge on (one step of the finest arms takes
 * it ~17 s) and fast enough to show between two readings a minute apart. It never quite arrives.
 */
export function thingDistance(seconds: number): number {
  return Math.max(0.3, 2.1 - 0.00015 * Math.max(0, seconds));
}

/**
 * For a "dead earth" (a clean break with the copper in the sea) the conductor resistance up to the break is
 * what the bridge measures, so the distance is that resistance divided by the core's resistance per mile.
 */
export function faultDistance(ohms: number, ohmsPerNm: number): number {
  return ohms / ohmsPerNm;
}

// ---------------------------------------------------------------- Engine-room valve chest (draining tank No.2)

export interface ValveChest {
  /** Suction side */
  sea: boolean;
  tank1: boolean;
  tank2: boolean;
  bilge: boolean;
  /** Discharge side */
  overboard: boolean;
  fill2: boolean;
  /** General-service pump */
  pump: boolean;
}

export type ValveKey = keyof ValveChest;

export function newValveChest(): ValveChest {
  return { sea: false, tank1: false, tank2: false, bilge: false, overboard: false, fill2: false, pump: false };
}

export type PumpOutcome = 'idle' | 'dry' | 'deadhead' | 'drain' | 'slow' | 'fill' | 'flood' | 'circulate' | 'other';

/**
 * What the pump does to tank No.2 with the valves as set. Level rate is in "tank fractions per second":
 * negative drains it, positive floods it.
 *
 * The tank lies below the waterline, so an open sea valve and an open line to the tank let the sea in even
 * with the pump stopped (ballast lines have no non-return valves — they must work both ways).
 */
export function pumpOutcome(v: ValveChest): { outcome: PumpOutcome; rate: number } {
  const seaToTank = v.sea && (v.tank2 || v.fill2);
  if (!v.pump) return seaToTank ? { outcome: 'flood', rate: 0.02 } : { outcome: 'idle', rate: 0 };
  const suctions = [v.sea, v.tank1, v.tank2, v.bilge].filter(Boolean).length;
  const discharges = [v.overboard, v.fill2].filter(Boolean).length;
  if (suctions === 0) return { outcome: 'dry', rate: 0 };
  if (discharges === 0) return { outcome: 'deadhead', rate: 0 };
  if (v.fill2 && (v.sea || v.tank1 || v.bilge)) return { outcome: 'fill', rate: 0.05 };
  if (v.tank2 && v.fill2 && !v.overboard) return { outcome: 'circulate', rate: 0 };
  if (v.tank2 && v.overboard) {
    // With the sea valve open too, the pump mostly draws the sea (and the sea backs into the tank).
    if (v.sea) return { outcome: 'slow', rate: 0.004 };
    // Other suctions open at the same time share the pump.
    const shared = 1 / (1 + (v.tank1 ? 1 : 0) + (v.bilge ? 1 : 0));
    return { outcome: 'drain', rate: -0.06 * shared };
  }
  return { outcome: 'other', rate: v.sea && v.fill2 ? 0.02 : 0 };
}

export function stepTankLevel(level: number, v: ValveChest, dt: number): number {
  return Math.max(0, Math.min(1, level + pumpOutcome(v).rate * dt));
}

export const TANK2_DRAINED = 0.12;

// ---------------------------------------------------------------- Cable engine: letting the cable go

export type Side = 'port' | 'stbd';

export interface CableEngine {
  /** The captain's locking pin through the brake gear (padlocked). */
  pinned: boolean;
  clutch: Record<Side, boolean>;
  brake: Record<Side, boolean>;
  /** Cables that have run out over the bow. */
  gone: Record<Side, boolean>;
}

export type CableAction = 'unpin' | `clutch-${Side}` | `brake-${Side}`;

export type CableEvent =
  | 'need-key'
  | 'unpinned'
  | 'pinned'
  | 'declutched'
  | 'clutched'
  | 'dragged'
  | 'run-out'
  | 'already'
  | 'gone';

export function newCableEngine(): CableEngine {
  return { pinned: true, clutch: { port: true, stbd: true }, brake: { port: true, stbd: true }, gone: { port: false, stbd: false } };
}

/**
 * Releasing a cable: unlock the pin, take the drum out of gear, then lift the brake. Lifting the brake with
 * the drum still in gear lets the cable drag the engine round backwards — steam gear wrecked, cable still
 * held.
 */
export function cableAction(s: CableEngine, a: CableAction, hasKey: boolean): { s: CableEngine; ev: CableEvent } {
  if (a === 'unpin') {
    if (!s.pinned) return { s, ev: 'already' };
    if (!hasKey) return { s, ev: 'need-key' };
    return { s: { ...s, pinned: false }, ev: 'unpinned' };
  }
  const side = a.endsWith('port') ? 'port' : 'stbd';
  if (s.gone[side]) return { s, ev: 'gone' };
  if (a.startsWith('clutch')) {
    if (s.pinned) return { s, ev: 'pinned' };
    const engaged = !s.clutch[side];
    return { s: { ...s, clutch: { ...s.clutch, [side]: engaged } }, ev: engaged ? 'clutched' : 'declutched' };
  }
  // brake
  if (s.pinned) return { s, ev: 'pinned' };
  if (!s.brake[side]) return { s, ev: 'already' };
  if (s.clutch[side]) return { s, ev: 'dragged' };
  return {
    s: { ...s, brake: { ...s.brake, [side]: false }, gone: { ...s.gone, [side]: true } },
    ev: 'run-out',
  };
}
