// Epilogue logic ("The Inquiry": the underwriters' committee in London, June 1926). Pure functions (no DOM,
// no three.js) so they can be unit tested.
//
// The committee has to decide the Thalassa claim. Each point it raises is settled by an exhibit from the
// investigator's dossier: the right record establishes it, anything else does not. The points follow the
// Marine Insurance Act 1906 as the committee would read it: the proximate cause of the loss (s.55(1)), the
// crew's conduct (s.55(2)(a): the master's or crew's misconduct does not bar a loss proximately caused by
// a peril insured against), and the cable let go as a general average sacrifice (s.66(2)).

export type PointId = 'cause' | 'crew' | 'flooding' | 'authority' | 'peril' | 'credit';

/** The points in the order the committee takes them. */
export const POINTS: readonly PointId[] = ['cause', 'crew', 'flooding', 'authority', 'peril', 'credit'];

/** Pell's sworn statement, cabled from Bell Cove: an exhibit only when he came ashore with you. */
export const PELL_WITNESS = 'pellWitness';

/** The dossier, in the order the records were gathered: the Thalassa, Bell Cove, the St Brendan. */
export const DOSSIER_GROUPS: ReadonlyArray<{ title: string; docs: readonly string[] }> = [
  {
    title: '탈라사호 — 1925년 10월',
    docs: ['commission', 'logPage', 'captainLog', 'diary', 'wirelessLog', 'engineerNotes', 'letter', 'testRecord', 'bosunNotes', 'testManual', 'baleNote', 'haleLetter'],
  },
  { title: '벨 코브 — 1926년 2월', docs: ['telegram', 'stationDiary', 'codeCard', 'batteryLog'] },
  { title: '세인트 브렌던호 — 1926년 4월', docs: ['workOrder', 'grappleCard'] },
];

/** What establishes each point. */
export const ACCEPT: Record<PointId, readonly string[]> = {
  // 3 October: the grapnel fouled something at 2,300 fathoms; it came up on the cable's cut end.
  cause: ['logPage'],
  // The crew went missing on the 5th and 6th; the lifeboat left on the 7th, after the trouble began.
  crew: ['captainLog', 'bosunNotes'],
  // The master was down in tank No.2 when someone else opened the valves.
  flooding: ['haleLetter'],
  // The master's own hand: "let the cable go".
  authority: ['haleLetter'],
  // The peril was real: the bow drawn down by the cable; the fault climbing towards the ship.
  peril: ['bosunNotes', 'baleNote'],
  // Someone other than the investigator saw it: Bell Cove's superintendent, the company itself, or Pell.
  credit: ['stationDiary', 'workOrder', 'telegram', PELL_WITNESS],
};

/** Every exhibit in the dossier (Pell's statement last, when there is one). */
export function dossier(pell: boolean): string[] {
  const docs = DOSSIER_GROUPS.flatMap((gr) => gr.docs);
  docs.push(pell ? 'pellLetter' : 'bcWire');
  if (pell) docs.push(PELL_WITNESS);
  return docs;
}

/** Does this exhibit settle this point? */
export function establishes(point: PointId, exhibit: string, pell: boolean): boolean {
  if (exhibit === PELL_WITNESS && !pell) return false;
  return ACCEPT[point].includes(exhibit);
}

export function pointBit(point: PointId): number {
  return 1 << POINTS.indexOf(point);
}

export function established(mask: number): Set<PointId> {
  return new Set(POINTS.filter((p) => mask & pointBit(p)));
}

export type Payment = 'full' | 'part' | 'withheld';

export interface Verdict {
  /** The Thalassa's own losses (tank, machinery, the lifeboat): the cause shown, and no wilful flooding. */
  hull: boolean;
  /** The cable let go: a general average sacrifice, made on the master's order in time of real peril. */
  cable: boolean;
  /** The testimony goes into the minutes in full (corroborated), or only as the investigator's opinion. */
  testimony: boolean;
  payment: Payment;
  /** How many of the six points were established. */
  score: number;
}

/**
 * The committee's ruling. Nothing is paid until the proximate cause is shown. The ship's own losses also
 * wait on the question of wilful flooding; the cable needs both the order and the peril.
 */
export function verdict(mask: number): Verdict {
  const ok = established(mask);
  const cause = ok.has('cause');
  const hull = cause && ok.has('flooding');
  const cable = cause && ok.has('authority') && ok.has('peril');
  return {
    hull,
    cable,
    testimony: ok.has('credit'),
    payment: hull && cable ? 'full' : hull || cable ? 'part' : 'withheld',
    score: ok.size,
  };
}
