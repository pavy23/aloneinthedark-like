// Act 3 puzzle logic ("Landfall", the cable landing station). Pure functions (no DOM, no three.js) so they
// can be unit tested.

import { MORSE } from './logic';

// ---------------------------------------------------------------- Cable code on the siphon recorder

/** International Morse numerals (five elements each). */
export const DIGITS: Record<string, string> = {
  '.----': '1',
  '..---': '2',
  '...--': '3',
  '....-': '4',
  '.....': '5',
  '-....': '6',
  '--...': '7',
  '---..': '8',
  '----.': '9',
  '-----': '0',
};

/** Letters and numerals as the cable clerks read them (code -> character). */
export const CABLE_CODE: Record<string, string> = { ...MORSE, ...DIGITS };

const ENCODE: Record<string, string> = Object.fromEntries(Object.entries(CABLE_CODE).map(([k, v]) => [v, k]));

/** One code per character; a space stays an empty string (a word gap). Unknown characters are dropped. */
export function encodeCable(text: string): string[] {
  return text
    .toUpperCase()
    .split('')
    .filter((c) => c === ' ' || ENCODE[c] !== undefined)
    .map((c) => (c === ' ' ? '' : ENCODE[c]));
}

export function decodeCable(code: string): string {
  return CABLE_CODE[code] ?? '?';
}

/**
 * Cable code is sent as current reversals: one polarity swings the siphon up (a dot), the other down (a
 * dash). A signal that comes back with its polarity reversed therefore reads with every dot and dash
 * swapped.
 */
export function mirrorCode(code: string): string {
  return code.replace(/[.-]/g, (c) => (c === '.' ? '-' : '.'));
}

/** What a clerk reads off the tape if the message arrived with its polarity reversed. */
export function readMirrored(text: string): string {
  return encodeCable(text)
    .map((c) => (c === '' ? ' ' : decodeCable(mirrorCode(c))))
    .join('');
}

/** A numeral sent with reversed polarity reads as another numeral, five away (1↔6, 2↔7, … 5↔0). */
export function mirrorDigit(d: number): number {
  return (d + 5) % 10;
}

/** Dot and dash are the same length on a cable; letters and words are told apart by the pauses. */
export const TAPE_UNITS = { element: 1, elementGap: 1, letterGap: 3, wordGap: 6 } as const;

export interface TapeMark {
  /** Position along the tape, in element units from the start of the message. */
  at: number;
  /** +1 the siphon swings up (dot), -1 down (dash). */
  dir: 1 | -1;
}

/** Where the pen swings for a message: one mark per element, laid out with the cable's spacing. */
export function layoutTape(text: string, mirrored = false): { marks: TapeMark[]; length: number } {
  const marks: TapeMark[] = [];
  let at = 0;
  const codes = encodeCable(text);
  codes.forEach((code, i) => {
    if (code === '') {
      at += TAPE_UNITS.wordGap - TAPE_UNITS.letterGap;
      return;
    }
    const c = mirrored ? mirrorCode(code) : code;
    for (let k = 0; k < c.length; k++) {
      marks.push({ at, dir: c[k] === '.' ? 1 : -1 });
      at += TAPE_UNITS.element + (k < c.length - 1 ? TAPE_UNITS.elementGap : 0);
    }
    if (i < codes.length - 1) at += TAPE_UNITS.letterGap;
  });
  return { marks, length: at };
}

/** Read marks back into text the way a clerk does: up = dot, down = dash, pauses split letters and words. */
export function readTape(marks: readonly TapeMark[]): string {
  let out = '';
  let code = '';
  for (let i = 0; i < marks.length; i++) {
    code += marks[i].dir === 1 ? '.' : '-';
    const next = marks[i + 1];
    const gap = next ? next.at - marks[i].at - TAPE_UNITS.element : Infinity;
    if (gap > TAPE_UNITS.elementGap) {
      out += decodeCable(code);
      code = '';
      if (gap >= TAPE_UNITS.wordGap && next) out += ' ';
    }
  }
  return out;
}

// ---------------------------------------------------------------- The store's combination lock

export function comboDigits(combo: number): [number, number, number] {
  const c = Math.max(0, Math.min(999, Math.round(combo)));
  return [Math.floor(c / 100), Math.floor(c / 10) % 10, c % 10];
}

export function comboText(combo: number): string {
  return comboDigits(combo).join('');
}

/** The superintendent's message to Carrigeen with the store's combination ("to CG: store nnn, RK"). */
export function storeMessage(combo: number): string {
  return `CG STORE ${comboText(combo)} RK`;
}

/**
 * The tape left in the recorder: the reversed echo of that message (the thing replaying it), a long pause,
 * and then the thing's own knock, three and three, the right way up.
 */
export function nightTape(combo: number): { marks: TapeMark[]; length: number } {
  const echo = layoutTape(storeMessage(combo), true);
  const knock = layoutTape('S S');
  const off = echo.length + TAPE_UNITS.wordGap * 3;
  return { marks: [...echo.marks, ...knock.marks.map((m) => ({ at: m.at + off, dir: m.dir }))], length: off + knock.length };
}

export type ComboTry = 'open' | 'mirrored' | 'wrong';

/** Trying the lock: the right number, the number as the reversed echo reads, or just wrong. */
export function tryCombo(dials: readonly number[], combo: number): ComboTry {
  const want = comboDigits(combo);
  if (dials.length === 3 && dials.every((d, i) => d === want[i])) return 'open';
  if (dials.length === 3 && dials.every((d, i) => d === mirrorDigit(want[i]))) return 'mirrored';
  return 'wrong';
}

// ---------------------------------------------------------------- Accumulators for the induction coil

/** Cells the coil needs in series (the plate on the coil asks for 24 volts; lead cells give about 2 each). */
export const CELLS_NEEDED = 12;
/** Specific gravity of the acid a cell must show to count as charged. */
export const CHARGED_SG = 1.25;

export function cellCharged(sg: number): boolean {
  return sg >= CHARGED_SG;
}

export interface StringStatus {
  count: number;
  weak: number;
  ready: boolean;
}

export function stringStatus(selected: readonly number[], sgs: readonly number[]): StringStatus {
  const count = selected.length;
  const weak = selected.filter((i) => !cellCharged(sgs[i] ?? 0)).length;
  return { count, weak, ready: count === CELLS_NEEDED && weak === 0 };
}

/** Sixteen cells on the rack: twelve charged, three run down, one dead, in an order fixed by `seed`. */
export function rackGravities(seed: number): number[] {
  let s = Math.floor(seed) % 2147483647 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const sgs = [
    ...Array.from({ length: 12 }, () => 1.255 + Math.floor(rnd() * 31) / 1000),
    ...Array.from({ length: 3 }, () => 1.175 + Math.floor(rnd() * 41) / 1000),
    1.105 + Math.floor(rnd() * 21) / 1000,
  ];
  for (let i = sgs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [sgs[i], sgs[j]] = [sgs[j], sgs[i]];
  }
  return sgs.map((v) => Math.round(v * 1000) / 1000);
}

// ---------------------------------------------------------------- The line switchboard

export interface Switchboard {
  /** Siphon recorder on the line (through the send/receive switch). */
  recorder: boolean;
  /** Signalling condenser in series with the cable (false = bypassed by its link). */
  condenser: boolean;
  /** Lightning protector (spark gaps to earth) on the line. */
  protector: boolean;
  /** Test link to the Wheatstone bridge. */
  bridge: boolean;
  /** The induction coil's secondary on the line. */
  coil: boolean;
}

export type SwitchKey = keyof Switchboard;

/** As the night clerk left it: working the cable, nothing on test. */
export function switchboardAsFound(): Switchboard {
  return { recorder: true, condenser: true, protector: true, bridge: false, coil: false };
}

export type BridgeView = 'none' | 'open' | 'line';

/**
 * What the bridge sees of the cable with the switches as set. The signalling condenser sits in series
 * between the cable and every instrument; it passes no direct current, so left in it makes the line look
 * broken. (Anything else left on the line is a high resistance in parallel with a dead earth of an ohm or
 * so, which does not move the balance.)
 */
export function bridgeView(s: Switchboard): BridgeView {
  if (!s.bridge) return 'none';
  if (s.condenser) return 'open';
  return 'line';
}

export type FireResult = 'arc' | 'no-coil' | 'weak' | 'protector' | 'condenser' | 'recorder' | 'bridge';

/**
 * Firing the coil into the cable. Anything else left on the line takes the discharge instead (and is
 * ruined by it); only with the line clear does it reach the cable.
 */
export function fireResult(s: Switchboard, batteryReady: boolean): FireResult {
  if (!s.coil) return 'no-coil';
  if (!batteryReady) return 'weak';
  if (s.protector) return 'protector';
  if (s.condenser) return 'condenser';
  if (s.recorder) return 'recorder';
  if (s.bridge) return 'bridge';
  return 'arc';
}

/** Seconds the coil needs between shots (the interrupter cools, the cells recover). */
export const COIL_RECHARGE = 12;
/** Seconds the candle takes to burn through the cord that holds the key up. */
export const CANDLE_SECONDS = 70;

// ---------------------------------------------------------------- Landfall: the fault at the shore end

/** Line distance (nautical miles) from the station's switchboard to the cable hut on the beach. */
export const HUT_NM = 0.1;

/**
 * Distance (nautical miles) from the station to the fault, `seconds` of play after the act began: in the
 * shore section, closing on the hut at a few metres a minute, and stopping just off the beach.
 */
export function landfallDistance(seconds: number): number {
  return Math.max(HUT_NM + 0.02, 0.34 - 0.00008 * Math.max(0, seconds));
}

// ---------------------------------------------------------------- The signal from the cable hut

/** Firing by the land line: you send R, Pell asks K, and only someone who answers (not copies) gets R. */
export type HutStage = 'idle' | 'asked' | 'fire';

export interface HutStep {
  stage: HutStage;
  /** Signals that come back over the line, in order, and who sent them. */
  heard: Array<{ from: 'thing' | 'pell'; text: string }>;
}

export function hutSignal(stage: HutStage, sent: string): HutStep {
  if (stage === 'fire') return { stage, heard: [] };
  // The thing is on the line: whatever is sent, it sends straight back.
  const heard: HutStep['heard'] = [{ from: 'thing', text: sent }];
  if (stage === 'idle') {
    if (sent !== 'R') return { stage: 'idle', heard };
    // Two Rs on the wire: one of them is not a man. Pell asks: "go ahead", and the thing copies that too.
    heard.push({ from: 'pell', text: 'K' }, { from: 'thing', text: 'K' });
    return { stage: 'asked', heard };
  }
  // stage 'asked': the answer to K is R. Copying K back is what the thing does.
  if (sent === 'R') {
    heard.push({ from: 'pell', text: 'R' });
    return { stage: 'fire', heard };
  }
  return { stage: 'asked', heard };
}
