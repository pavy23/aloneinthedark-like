// Pure puzzle logic (no DOM, no three.js) so it can be unit tested.

// ---------------------------------------------------------------- Morse

export const MORSE: Record<string, string> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I',
  '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
  '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y', '--..': 'Z',
};

export function decodeLetter(code: string): string {
  return MORSE[code] ?? '?';
}

export function encodeText(text: string): string[] {
  const rev: Record<string, string> = {};
  for (const [k, v] of Object.entries(MORSE)) rev[v] = k;
  return text
    .toUpperCase()
    .split('')
    .map((c) => rev[c] ?? '');
}

/** Classify a key-down duration as dot or dash (a dash is nominally 3 dots long). */
export function classifyPress(seconds: number, threshold = 0.22): '.' | '-' {
  return seconds < threshold ? '.' : '-';
}

// ---------------------------------------------------------------- Radio

/** λ (m) = c / f. With c ≈ 300,000 km/s and f in kilocycles: λ = 300,000 / f(kc). */
export function wavelengthForKc(kc: number): number {
  return 300000 / kc;
}

export const DISTRESS_KC = 500;

export function isDistressWavelength(m: number): boolean {
  return Math.abs(m - wavelengthForKc(DISTRESS_KC)) < 0.5;
}

export function endsWithSOS(decoded: string): boolean {
  return decoded.replace(/[^A-Z?]/g, '').endsWith('SOS');
}

// ---------------------------------------------------------------- Safe

/** The combination is the keel-laying date: 1911-03-14 -> 11-03-14 (year, month, day). */
export const SAFE_COMBINATION: [number, number, number] = [11, 3, 14];

export function checkSafe(dials: readonly number[]): boolean {
  return dials.length === 3 && dials.every((v, i) => v === SAFE_COMBINATION[i]);
}

// ---------------------------------------------------------------- Dynamo (steam-driven generator)

export interface DynamoState {
  drain: boolean;
  /** 0 = closed, 1 = cracked open (warming through), 2 = fully open. */
  steam: 0 | 1 | 2;
  /** 0..1 progress of clearing condensate / warming the line. */
  warm: number;
  /** 0..1 fraction of rated speed. */
  rpm: number;
  breaker: boolean;
  hammers: number;
}

export type DynamoAction = 'drain-open' | 'drain-close' | 'steam-crack' | 'steam-full' | 'steam-close' | 'breaker';

export type DynamoEvent = 'hammer' | 'warming' | 'warmed' | 'not-warm' | 'spinning' | 'rated' | 'power' | 'trip' | 'nothing' | 'already';

export function newDynamo(): DynamoState {
  return { drain: false, steam: 0, warm: 0, rpm: 0, breaker: false, hammers: 0 };
}

export const WARM_SECONDS = 4;
export const RATED_MIN = 0.9;

function hammer(s: DynamoState): DynamoState {
  // The slug of water slams through the pipe; the valve is shut again and the line cools a little.
  return { ...s, steam: 0, warm: Math.max(0, s.warm - 0.5), hammers: s.hammers + 1 };
}

export function dynamoAction(s: DynamoState, a: DynamoAction): { s: DynamoState; ev: DynamoEvent } {
  if (s.breaker && a !== 'breaker') return { s, ev: 'already' };
  switch (a) {
    case 'drain-open':
      return s.drain ? { s, ev: 'already' } : { s: { ...s, drain: true }, ev: 'nothing' };
    case 'drain-close':
      if (!s.drain) return { s, ev: 'already' };
      if (s.steam > 0 && s.warm < 1) return { s: hammer({ ...s, drain: false }), ev: 'hammer' };
      return { s: { ...s, drain: false }, ev: s.steam === 2 ? 'spinning' : 'nothing' };
    case 'steam-crack':
      if (s.steam !== 0) return { s, ev: 'already' };
      if (!s.drain && s.warm < 1) return { s: hammer(s), ev: 'hammer' };
      return { s: { ...s, steam: 1 }, ev: s.warm < 1 ? 'warming' : 'nothing' };
    case 'steam-full':
      if (s.steam === 2) return { s, ev: 'already' };
      if (s.warm < 1) return s.drain && s.steam === 1 ? { s, ev: 'not-warm' } : { s: hammer(s), ev: 'hammer' };
      return { s: { ...s, steam: 2 }, ev: s.drain ? 'nothing' : 'spinning' };
    case 'steam-close':
      return s.steam === 0 ? { s, ev: 'already' } : { s: { ...s, steam: 0 }, ev: 'nothing' };
    case 'breaker':
      if (s.breaker) return { s, ev: 'already' };
      if (s.rpm >= RATED_MIN && s.steam === 2) return { s: { ...s, breaker: true }, ev: 'power' };
      return { s, ev: 'trip' };
  }
}

/** Advance the simulation. Returns an event when something noteworthy happens this tick. */
export function dynamoTick(s: DynamoState, dt: number): { s: DynamoState; ev: DynamoEvent | null } {
  let ev: DynamoEvent | null = null;
  let warm = s.warm;
  if (s.steam >= 1 && s.drain && warm < 1) {
    warm = Math.min(1, warm + dt / WARM_SECONDS);
    if (warm >= 1) ev = 'warmed';
  }
  let target = 0;
  if (s.steam === 2) target = s.drain ? 0.55 : 1;
  else if (s.steam === 1 && warm >= 1) target = 0.2;
  const rate = target > s.rpm ? 0.28 : 0.35;
  let rpm = s.rpm + Math.sign(target - s.rpm) * Math.min(Math.abs(target - s.rpm), rate * dt);
  if (s.breaker) rpm = Math.max(rpm, 0.97);
  if (s.rpm < RATED_MIN && rpm >= RATED_MIN && !s.breaker) ev = 'rated';
  return { s: { ...s, warm, rpm }, ev };
}
