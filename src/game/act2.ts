import type { GameAPI } from '../world/types';
import { TANK2_DRAINED, newCableEngine, newValveChest, stepTankLevel, thingDistance, type CableEngine, type Side, type ValveChest } from './logic2';

// The second act: burning the stone does not end it. What holds the cable over the bow starts to pull.

/** Flags that open the second act. Which chain locker hides the wireless operator, and which bow cable
 * the thing is climbing, are decided per playthrough. */
export function beginAct2Flags(g: Pick<GameAPI, 'setFlag' | 'playTime'>, rnd: () => number = Math.random): void {
  g.setFlag('act2');
  g.setFlag('a2.pellStbd', rnd() < 0.5);
  g.setFlag('a2.thingStbd', rnd() < 0.5);
  /** When the thing started to climb (play time, so that it survives saving and loading). */
  g.setFlag('a2.t0', g.playTime);
  // Whoever drowned the master left the sea valve and the tank suction open: tank No.2 is flooded.
  g.setFlag('vc.sea', true);
  g.setFlag('vc.tank2', true);
  g.setFlag('vc.level', 1);
}

export function pellSide(g: Pick<GameAPI, 'flag'>): 'port' | 'stbd' {
  return g.flag('a2.pellStbd') ? 'stbd' : 'port';
}

export function thingSide(g: Pick<GameAPI, 'flag'>): 'port' | 'stbd' {
  return g.flag('a2.thingStbd') ? 'stbd' : 'port';
}

export const SIDE_KO = { port: '좌현', stbd: '우현' } as const;

/** The scene in the stokehold right after the stone burns. */
export async function startAct2(g: GameAPI): Promise<void> {
  beginAct2Flags(g);
  g.sfx('creak', { volume: 1.3 });
  g.shake(0.18, 3.0);
  await g.wait(1.2);
  g.sfx('stinger', { volume: 0.8 });
  await g.say(
    '…그런데 고요해지지 않는다. 선수 쪽에서 쇠가 찢어지는 소리가 배를 타고 울려 온다.',
    '바닥이 아주 천천히 기운다. 배가 앞으로, 선수 쪽으로 끌려 내려간다.',
    '케이블이다. 선수에 걸린 케이블을 저 아래의 무언가가 끌어당기고 있다.',
    '돌은 손가락 하나였을 뿐이다. 손가락을 잃은 그것이, 이제 손을 뻗어 온다.',
  );
  g.chapter('2막 · 선수창 아래', 'ACT II · BENEATH THE FORECASTLE');
  await g.wait(1.6);
  g.note('선수로 가 보자');
}

/** Both conditions for the way out: the cable let go and the Magnus called. Then dawn comes, and the boat. */
export function readyForEnding(g: Pick<GameAPI, 'flag'>): boolean {
  return g.flag('cableFreed') && g.flag('sosSent');
}

/** The ship is free and the Magnus knows: day breaks and her boat comes to the Jacob's ladder. */
export async function dawnComes(g: GameAPI): Promise<void> {
  if (g.flag('dawn') || !readyForEnding(g)) return;
  g.setFlag('dawn');
  const ladder = g.room.interactables.find((i) => i.id === 'jacob');
  if (ladder) {
    ladder.label = '줄사다리 (보트로)';
    ladder.verb = '내려가기';
  }
  g.sfx('foghorn', { volume: 1.1 });
  await g.wait(1.4);
  const fetch = g.flag('pellFreed') && !g.flag('pellCarried');
  await g.say(
    '안개 너머에서 길게, 낮게 — 마그누스호의 기적이 울린다. 어느새 동이 트고 있다.',
    fetch
      ? '보트가 오고 있다. 그 전에 선원 거주구의 펠을 데리러 가야 한다. 그리고 내가 타고 올라온 줄사다리로.'
      : '보트가 오고 있다. 내가 타고 올라온 줄사다리로 가자.',
  );
  g.note(fetch ? '펠을 데리고 줄사다리로' : '줄사다리로');
}

// ---------------------------------------------------------------- persisted puzzle state (flags)

const VALVES: Array<keyof ValveChest> = ['sea', 'tank1', 'tank2', 'bilge', 'overboard', 'fill2', 'pump'];

export function getValves(g: Pick<GameAPI, 'flag'>): ValveChest {
  const v = newValveChest();
  for (const k of VALVES) v[k] = g.flag(`vc.${k}`);
  return v;
}

export function setValves(g: Pick<GameAPI, 'setFlag'>, v: ValveChest): void {
  for (const k of VALVES) g.setFlag(`vc.${k}`, v[k]);
}

export function tankLevel(g: Pick<GameAPI, 'flag' | 'num'>): number {
  return g.flag('tank2Drained') ? 0 : g.num('vc.level');
}

export function getCableEngine(g: Pick<GameAPI, 'flag'>): CableEngine {
  const s = newCableEngine();
  s.pinned = !g.flag('ce.unpinned');
  for (const side of ['port', 'stbd'] as Side[]) {
    s.clutch[side] = !g.flag(`ce.${side}Out`);
    s.gone[side] = g.flag(`ce.${side}Gone`);
    s.brake[side] = !s.gone[side];
  }
  return s;
}

export function setCableEngine(g: Pick<GameAPI, 'setFlag'>, s: CableEngine): void {
  g.setFlag('ce.unpinned', !s.pinned);
  for (const side of ['port', 'stbd'] as Side[]) {
    g.setFlag(`ce.${side}Out`, !s.clutch[side]);
    g.setFlag(`ce.${side}Gone`, s.gone[side]);
  }
}

/** Current distance of the thing below the bow (nautical miles). */
export function thingNow(g: Pick<GameAPI, 'num' | 'playTime'>): number {
  return thingDistance(g.playTime - g.num('a2.t0'));
}

// ---------------------------------------------------------------- the finale on the fore deck

/** A drum's brake is off and its cable runs out over the bow. Frees the ship if it was the right one. */
export async function cableRunOut(g: GameAPI, side: Side): Promise<void> {
  const right = thingSide(g) === side;
  g.sfx('cable-run', { volume: 1.3 });
  g.shake(0.35, 3.6);
  const cable = g.room.get(`cable_${side}`);
  const drum = g.room.get('cableEngine')?.getObjectByName('drum');
  for (let i = 0; i < 90; i++) {
    if (drum) drum.rotation.x -= 0.5;
    if (cable) cable.position.x = Math.sin(i * 1.7) * 0.05;
    await g.wait(1 / 30);
  }
  if (cable) cable.visible = false;
  if (!right) {
    g.shake(0.5, 2.2);
    await g.say(
      `${SIDE_KO[side]} 드럼이 미친 듯이 돌며 케이블을 토해 낸다. 탱크에서 사리가 풀려 올라와 쉬브를 넘어 바다로 사라졌다.`,
      '…그런데 배는 여전히 앞으로 끌려간다. 남은 한 가닥에 배 전체가 매달려 크게 기우뚱한다.',
      '그것은 이쪽 케이블에 있지 않았다. 반대쪽이다! 선수 난간 너머로 젖은 손들이 더 올라온다.',
    );
    g.spawnCreature({ id: 'a2bow4', x: -1.2, z: 11.8, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.3, delay: 0.4 });
    g.spawnCreature({ id: 'a2bow5', x: 1.4, z: 12.2, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.3, delay: 2.0 });
    return;
  }
  g.setFlag('cableFreed');
  g.killAllCreatures();
  g.flash(0xffffff, 0.5);
  await g.say(
    `${SIDE_KO[side]} 드럼이 비명을 지르며 돈다. 2번 탱크에서 사리가 한 겹씩 뜯겨 올라와 쉬브를 넘어 바다로 쏟아져 들어간다.`,
    '케이블이 팽팽해지는 소리. 저 아래에서 무언가 마지막으로 잡아당긴다.',
    '…그리고 케이블의 끝이 쉬브를 넘어 어둠 속으로 사라졌다.',
    '선수가 천천히 들려 올라온다. 배가 제 몸을 되찾는 소리가 선체를 따라 길게 울린다.',
    '갑판으로 기어오르던 것들이 하나둘 무너져 내린다. 바다가 그들을 도로 데려간다.',
  );
  if (readyForEnding(g)) await dawnComes(g);
  else await g.say('배는 풀려났다. 이제 마그누스호에 알려야 한다. 무선실로 가자.');
}

/** Advance tank No.2's level (the pump is in the engine room, so this runs while you are there). */
export function tickTank2Level(g: GameAPI, dt: number): void {
  if (!g.flag('act2') || g.flag('tank2Drained')) return;
  const lv = stepTankLevel(g.num('vc.level'), getValves(g), dt);
  g.setFlag('vc.level', lv);
  if (lv <= TANK2_DRAINED) {
    g.setFlag('tank2Drained');
    g.sfx('drip', { volume: 1 });
    g.note('2번 탱크 측심관: 바닥이 드러났다');
  }
}
