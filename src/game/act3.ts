import type { GameAPI } from '../world/types';
import {
  CELLS_NEEDED,
  COIL_RECHARGE,
  fireResult,
  rackGravities,
  stringStatus,
  switchboardAsFound,
  type FireResult,
  type StringStatus,
  type Switchboard,
  type SwitchKey,
} from './logic3';

// The third act, "Landfall": the cable landing station at Bell Cove, Newfoundland, February 1926.

type Flags = Pick<GameAPI, 'flag' | 'num'>;

export const SWITCH_KEYS: SwitchKey[] = ['recorder', 'condenser', 'protector', 'bridge', 'coil'];
export const SWITCH_LABEL: Record<SwitchKey, string> = {
  recorder: '① 송수신 (사이펀 기록계)',
  condenser: '② 신호 축전기',
  protector: '③ 피뢰기',
  bridge: '④ 시험 (휘트스톤 브리지)',
  coil: '⑤ 고압 (유도 코일)',
};

/**
 * Flags that open the third act. The rack's cells and the store's number are decided per playthrough.
 * Everything from the first two acts is left behind except whether Pell came off the ship with you.
 */
export function act3Flags(pell: boolean, rnd: () => number = Math.random): Record<string, boolean | number> {
  const f: Record<string, boolean | number> = {
    act3: true,
    'a3.pell': pell,
    'a3.seed': 1 + Math.floor(rnd() * 2147483000),
    'a3.combo': Math.floor(rnd() * 1000),
  };
  const sw = switchboardAsFound();
  for (const k of SWITCH_KEYS) f[`sw.${k}`] = sw[k];
  return f;
}

/** Pell came ashore with you in the autumn and has been the station's night operator since. */
export function withPell(g: Flags): boolean {
  return g.flag('a3.pell');
}

// ---------------------------------------------------------------- persisted puzzle state (flags)

export function getSwitchboard(g: Flags): Switchboard {
  const s = switchboardAsFound();
  for (const k of SWITCH_KEYS) s[k] = g.flag(`sw.${k}`);
  return s;
}

export function setSwitch(g: Pick<GameAPI, 'setFlag'>, k: SwitchKey, on: boolean): void {
  g.setFlag(`sw.${k}`, on);
  // Anything touched after Pell checked the board has to be checked again.
  g.setFlag('a3.pellReady', false);
}

export function rackSgs(g: Flags): number[] {
  return rackGravities(g.num('a3.seed'));
}

const bits = (mask: number): number[] => Array.from({ length: 16 }, (_, i) => i).filter((i) => (mask >> i) & 1);

/** Cells strapped into the series string. */
export function cellsInString(g: Flags): number[] {
  return bits(g.num('a3.cells'));
}

/** Cells whose acid has been drawn up into the hydrometer. */
export function cellsRead(g: Flags): number[] {
  return bits(g.num('a3.sgRead'));
}

export function toggleCell(g: GameAPI, i: number): void {
  g.setFlag('a3.cells', g.num('a3.cells') ^ (1 << i));
  g.setFlag('a3.pellReady', false);
}

export function markRead(g: GameAPI, i: number): void {
  g.setFlag('a3.sgRead', g.num('a3.sgRead') | (1 << i));
}

export function battery(g: Flags): StringStatus {
  return stringStatus(cellsInString(g), rackSgs(g));
}

/** Seconds until the coil can fire again (0 = ready). */
export function coilWait(g: Pick<GameAPI, 'num' | 'playTime'>): number {
  return Math.max(0, g.num('a3.coilReadyAt') - g.playTime);
}

/** Seconds left on the candle, or 0 when no candle is burning. */
export function candleLeft(g: Pick<GameAPI, 'num' | 'playTime'>): number {
  const at = g.num('a3.timerAt');
  return at > 0 ? Math.max(0, at - g.playTime) : 0;
}

/** Something is set to fire the coil: Pell waiting for the hut's signal, or a candle burning. */
export function armed(g: Flags): boolean {
  return g.flag('a3.pellReady') || g.num('a3.timerAt') > 0;
}

/** The thing is up out of the surf at the hut — the one time a discharge down the cable can reach it. */
export function limbUp(g: GameAPI): boolean {
  return g.room.def.id === 'beach' && g.flag('a3.limbUp');
}

// ---------------------------------------------------------------- Pell checks the board

/** What Pell finds wrong before he will sit at the coil (null = nothing; he is ready). */
export function pellObjection(g: Flags): string | null {
  if (!g.flag('a3.handle')) return '"⑤번 손잡이가 없으면 코일을 회선에 물릴 수가 없소. 소장님이 창고에 넣고 잠갔소."';
  const b = battery(g);
  if (b.count !== CELLS_NEEDED) return `"축전지가 ${b.count}개요. 열두 개를 직렬로 묶어야 24볼트가 나오오."`;
  if (b.weak > 0) return '"약한 셀이 섞였소. 하나라도 약하면 단속기가 서지 않소. 비중계로 하나씩 다시 재 보시오."';
  if (!g.flag('a3.measured')) return '"쏘기 전에 놈이 어디 있는지부터 재야 하오. 브리지로."';
  const r = fireResult(getSwitchboard(g), true);
  if (r === 'arc') return null;
  return {
    'no-coil': '"⑤번이 떨어져 있소. 코일이 회선에 물려 있지 않소."',
    weak: '"축전지가 약하오."',
    protector: '"피뢰기 ③을 떼시오. 그대로 두면 고압이 방전 간극으로 다 땅에 빠지오."',
    condenser: '"축전기 ②를 빼시오. 고압이 축전기를 뚫고 말 거요."',
    recorder: '"기록계 ①을 떼시오. 기록계 코일이 고압을 다 먹고 타 버리오."',
    bridge: '"브리지 ④를 떼시오. 검류계가 타 버리오."',
  }[r];
}

// ---------------------------------------------------------------- firing the coil

/** What happened, told from the coil (in the battery room) and from anywhere else. */
const NEAR: Record<Exclude<FireResult, 'arc'>, string[]> = {
  'no-coil': ['단속기가 요란하게 떨고, 코일 위의 방전 간극에서 하얀 불꽃이 탁탁 튄다.', '불꽃은 거기서 끝이다. ⑤번이 회선에 물려 있지 않다.'],
  weak: ['단속기가 몇 번 떨다가 맥없이 멎는다. 방전 간극에는 불꽃 하나 튀지 않는다.', '축전지가 약하다. 약한 셀이 섞였거나, 개수가 모자라다.'],
  protector: ['전환반 위쪽 피뢰기에서 퍼런 불꽃이 터진다. 방전이 간극을 건너 땅으로 빠져나갔다.', '피뢰기가 회선에 물려 있는 한, 고압은 케이블로 가지 않는다.'],
  condenser: ['신호 축전기 상자 안에서 둔탁하게 무언가 터진다. 매캐한 연기가 새어 나온다.', '고압이 축전기를 뚫었다. 축전기를 회선에서 빼야 했다.'],
  recorder: ['통신실 쪽에서 무언가 타닥 타는 소리. 기록계의 가는 코일이 고압을 받아 버렸다.', '기록계를 회선에서 떼어야 했다.'],
  bridge: ['시험대의 검류계 거울이 홱 돌아가 멈춘다. 브리지가 방전을 받아 버렸다.', '브리지를 회선에서 떼어야 했다.'],
};

/**
 * Fire the coil into the line: 'pell' on the hut's signal, 'candle' when the cord burns through, 'hand'
 * from the coil itself. Anything left on the line takes the discharge; with the line clear it runs down
 * the cable to the fault — and only does any good if the thing is up out of the surf at that moment.
 */
export async function fireCoil(g: GameAPI, by: 'pell' | 'candle' | 'hand'): Promise<FireResult> {
  const r = fireResult(getSwitchboard(g), battery(g).ready);
  g.setFlag('a3.coilReadyAt', g.playTime + COIL_RECHARGE);
  g.setFlag('a3.shots', g.num('a3.shots') + 1);
  if (by === 'pell') g.setFlag('a3.pellReady', false);
  const here = g.room.def.id;
  if (r === 'arc' && limbUp(g)) {
    await landfall(g);
    return r;
  }
  if (here === 'battery') {
    g.sfx(r === 'weak' ? 'coil' : 'arc', { volume: r === 'weak' ? 0.6 : 1 });
    if (r !== 'weak') g.flash(0xbcd8ff, 0.45);
    const gap = g.room.get('coilSpark');
    if (gap && r !== 'weak') {
      gap.visible = true;
      void g.wait(0.25).then(() => (gap.visible = false));
    }
    await g.say(
      ...(r === 'arc'
        ? [
            '단속기가 비명처럼 울고, 회선으로 무언가 빠져나가는 것이 느껴진다. 전환반의 칼날 스위치들이 한꺼번에 웅 떤다.',
            '…그런데 아무 일도 일어나지 않는다. 고장점은 아직 바다 밑에 있다. 그것이 뭍에 올라와 있을 때 쏘아야 한다.',
          ]
        : NEAR[r]),
    );
    if (r === 'recorder') g.setFlag('a3.recorderBurnt');
    return r;
  }
  if (here === 'beach') {
    g.sfx('coil', { volume: 0.35 });
    await g.say(
      '등 뒤, 역 쪽에서 희미하게 단속기 우는 소리가 들렸다.',
      r === 'arc' ? '…오두막은 조용하다. 바다 밑의 그것은 아직 솟아오르지 않았다.' : '…오두막의 단자반은 조용하다. 방전이 이 회선까지 오지 않았다.',
    );
    if (r === 'recorder') g.setFlag('a3.recorderBurnt');
    return r;
  }
  g.sfx('coil', { volume: 0.25 });
  g.note(by === 'candle' ? '어디선가 단속기가 울었다 — 양초가 끈을 태웠다' : '단속기가 울었다');
  if (r === 'recorder') g.setFlag('a3.recorderBurnt');
  return r;
}

/** The discharge reaches the thing at the shore end. */
async function landfall(g: GameAPI): Promise<void> {
  g.setFlag('a3.done');
  g.setFlag('a3.limbUp', false);
  g.setFlag('a3.timerAt', 0);
  g.sfx('arc', { volume: 1.4 });
  g.flash(0xd8ecff, 1);
  g.shake(0.45, 3.2);
  const line = g.room.get('arcLine');
  if (line) line.visible = true;
  g.killAllCreatures();
  await g.wait(1.6);
  if (line) line.visible = false;
  await g.say(
    '오두막에서 바다 쪽으로, 케이블을 따라 퍼런 불꽃이 달려 나간다.',
    '그것이 불꽃에 휘감겨 몸을 비튼다. 비명 대신 길고 높은 신호음이 해변을 가른다. 점도 선도 아닌, 끊기지 않는 하나의 소리.',
    '검은 것이 숯처럼 갈라지며 파도 속으로 무너져 내렸다. 바다에서 올라오던 것들도 하나둘 쓰러진다.',
  );
  await g.wait(0.8);
  await g.nextAct();
}

/** Per-frame upkeep of the act: the candle burning down in the battery room. */
export function tickAct3(g: GameAPI): void {
  if (!g.flag('act3') || g.flag('a3.done')) return;
  const at = g.num('a3.timerAt');
  if (at > 0 && g.playTime >= at && !g.busy) {
    g.setFlag('a3.timerAt', 0);
    g.setFlag('a3.candleBurnt', true);
    void g.run(async () => {
      await fireCoil(g, 'candle');
    });
  }
}
