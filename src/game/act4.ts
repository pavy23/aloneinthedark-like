import type { GameAPI } from '../world/types';
import { ROOT_HITS, goodEnd, grappleRun, type EndId, type GrappleResult, type GrappleRun } from './logic4';

// The fourth act, "The Grapnel": April 1926, the repair ship St Brendan over the cable's grave. The cable
// is grappled, cut and tested; the good end is buoyed; the bad end is picked up towards the fault, and the
// root comes up with it. Its heart goes into the ship's furnace.

type Flags = Pick<GameAPI, 'flag' | 'num'>;

/** Show or hide a named object of the room the player is in (the deck is rebuilt from flags on entry). */
function show(g: GameAPI, name: string, on: boolean): void {
  const o = g.room.get(name);
  if (o) o.visible = on;
}

/** Rename something the player can use in the room they are in (as the work moves on). */
function relabel(g: GameAPI, id: string, label: string): void {
  const it = g.room.interactables.find((i) => i.id === id);
  if (it) it.label = label;
}

/** Flags that open the fourth act. Only whether Pell came ashore carries over. */
export function act4Flags(pell: boolean, time: number, rnd: () => number = Math.random): Record<string, boolean | number> {
  return {
    act4: true,
    // A working ship: her dynamo runs, her lamps are lit.
    power: true,
    'a4.pell': pell,
    'a4.t0': time,
    'a4.seed': 1 + Math.floor(rnd() * 2147483000),
    'a4.attempt': 0,
    // The heading as the captain left it: square to the cable on the chart, which is not the same thing.
    'a4.heading': 334,
  };
}

export function withPell4(g: Flags): boolean {
  return g.flag('a4.pell');
}

export function currentRun(g: Flags): GrappleRun {
  return grappleRun(g.num('a4.seed'), g.num('a4.attempt'));
}

export function theGoodEnd(g: Flags): EndId {
  return goodEnd(g.num('a4.seed'));
}

/**
 * What the instruments show while a live panel drives them (the dynamometer's needle and the bow sheaves on
 * deck, the galvanometer's spot in the testing room). The panel sets `driven`; otherwise the room shows its
 * own idle state.
 */
export const deckGauge = { driven: false, strain: 0, turn: 0, spot: 0 };

export const GRAPPLE_RESULTS: GrappleResult[] = ['hooked', 'early', 'rock', 'parted', 'nothing', 'skid'];

/** What the bosun has to say about a run that did not end with the cable in the grapnel. */
const MISSED: Record<Exclude<GrappleResult, 'hooked'>, string[]> = {
  early: [
    '감아올리는 도중 장력계 바늘이 뚝 떨어졌다. 케이블이 그래플에서 미끄러져 빠졌다.',
    '갑판장: "너무 일찍 세웠소. 물었다 싶으면 몇 분 더 끌어서 바닥에서 띄워야 하오."',
  ],
  rock: [
    '두 시간 만에 올라온 그래플의 갈고리 하나가 엿가락처럼 휘어 있다. 바위였다.',
    '갑판장: "바늘이 확 튀었다 떨어지면 바위요. 케이블은 꾸준히 오르오."',
  ],
  parted: [
    '바늘이 끝까지 치솟았다가 맥없이 떨어졌다. 2천 길 아래에서 케이블이 그래플에 걸린 채 끊어졌다.',
    '갑판장: "너무 오래 끌었소. 바이트가 바닥에서 떴으면 곧바로 기관을 세워야 하오."',
  ],
  nothing: [
    '빈 그래플이 올라왔다. 갈고리마다 회색 진흙만 묻어 있다.',
    '갑판장: "아무것도 안 물었는데 세웠소. 바늘을 보시오."',
  ],
  skid: [
    '빈 그래플이 올라왔다. 갈고리 하나에 케이블 외장의 타르가 긁힌 자국만 남아 있다.',
    '갑판장: "케이블 위를 미끄러져 넘어갔소. 바늘이 잠깐 들렸다 말았잖소. 비스듬히 지났거나, 땅 위로 너무 빨리 갔소."',
    '갑판장: "선교에 가서 침로를 다시 보시오. 뱃머리 방향이 아니라, 배가 실제로 지나가는 길이 케이블과 직각이어야 하오."',
  ],
};

/** After a run: the grapnel is hove up (hours pass on the panel's word) and the run starts again. */
export async function afterGrapple(g: GameAPI, r: GrappleResult): Promise<void> {
  if (r === 'hooked') {
    g.setFlag('a4.hooked');
    g.sfx('creak', { volume: 1.1 });
    await g.say('기관 정지. 장력계 바늘이 내려오지 않고 꾸준히 버틴다.', '갑판장: "물었소. 이제 감아올립시다. 너울을 보면서."');
    return;
  }
  g.setFlag('a4.attempt', g.num('a4.attempt') + 1);
  g.sfx('chain', { volume: 0.8 });
  await g.say(...MISSED[r]);
  if (r === 'rock' && !g.flag('a4.handOnGrapnel')) {
    g.setFlag('a4.handOnGrapnel');
    g.sfx('stinger', { volume: 0.6 });
    await g.say('휜 갈고리 끝에, 진흙과 함께 무언가 걸려 올라왔다. 하얗게 불은 사람의 손가락이다.', '아무도 그것에 대해 말하지 않았다. 갑판장이 말없이 그것을 바다에 던졌다.');
  }
  g.note('다시 그래플을 내린다');
}

/** After the heave: the bight at the bow, or parted on the way up. */
export async function afterHeave(g: GameAPI, parted: boolean): Promise<void> {
  if (parted) {
    g.setFlag('a4.hooked', false);
    g.setFlag('a4.attempt', g.num('a4.attempt') + 1);
    g.sfx('cable-run', { volume: 1.1 });
    g.shake(0.25, 1.2);
    await g.say('뱃머리가 너울에 들리는 순간 장력계 바늘이 눈금 끝을 쳤다. 쉬브 너머에서 무언가 끊어지는 소리.', '갑판장: "바이트가 끊어졌소. 처음부터 다시요. 뱃머리가 들릴 때는 늦추라고 했잖소!"');
    g.note('다시 그래플을 내린다');
    return;
  }
  g.setFlag('a4.raised');
  show(g, 'bight', true);
  relabel(g, 'sheaves', '쉬브의 바이트');
  g.sfx('chain', { volume: 1.0 });
  await g.say(
    '케이블의 바이트가 쉬브 위로 올라왔다. 2천 길 바닥에서 반년을 누워 있던 케이블이다. 외장에 검은 것이 들러붙어 있다.',
    '선원들이 사슬과 밧줄로 바이트를 붙잡아 맨다. 전기기사가 쇠톱을 들고 기다린다.',
  );
}

/** Cut the bight: two ends to the testing room. */
export async function cutTheBight(g: GameAPI): Promise<void> {
  g.setFlag('a4.cut');
  g.sfx('knife', { volume: 1.0 });
  await g.wait(0.6);
  show(g, 'rope', false);
  show(g, 'bight', false);
  show(g, 'leads', true);
  relabel(g, 'sheaves', '선수 쉬브');
  await g.say(
    '전기기사 로스가 바이트를 잘랐다. 두 끝에 A, B 꼬리표를 달고 시험실 단자반으로 끌어간다.',
    '로스: "한쪽은 벨 코브로, 한쪽은 고장점을 지나 캐리긴으로 가오. 어느 쪽이 어느 쪽인지는 재 봐야 알지."',
  );
  g.note('시험실에서 두 끝을 시험한다');
}

/** The chosen end is sealed and goes over the side on the mark buoy. */
export async function buoyTheEnd(g: GameAPI, end: EndId): Promise<void> {
  g.setFlag('a4.buoyed');
  g.setFlag('a4.buoyEnd', end === 'A' ? 1 : 2);
  show(g, 'buoy', false);
  show(g, 'mushroom', false);
  show(g, 'buoyAfloat', true);
  g.room.col.removeTag('buoy');
  g.sfx('chain', { volume: 1.0 });
  await g.say(
    `${end} 끝을 봉해 표지 부표에 단다. 버섯 닻이 사슬을 끌며 물속으로 떨어지고, 붉은 부표가 너울 위에 뜬다.`,
    '이제 남은 끝을 감아올린다. 고장점까지, 0.8해리.',
  );
  g.note('갑판의 권양기에서 고장 난 끝을 감아올린다');
}

/** The bad end comes in over the bow, and at the fault the root comes up with it. */
export async function pickUpToTheRoot(g: GameAPI): Promise<void> {
  g.setFlag('a4.pickup');
  show(g, 'leads', false);
  show(g, 'cable', true);
  g.sfx('cable-run', { volume: 1.0 });
  const drum = g.room.get('pgear')?.getObjectByName('drum');
  for (let i = 0; i < 60; i++) {
    if (drum) drum.rotation.x -= 0.18;
    await g.wait(1 / 30);
  }
  await g.say('고장 난 끝을 드럼에 감는다. 케이블이 쉬브를 넘어 한 길씩 올라온다. 외장마다 검은 점액이 엉겨 있다.', '0.5해리. 0.7해리. 장력계 바늘이 이상하게 떤다. 맥박처럼.');
  g.sfx('tentacle', { volume: 1.3 });
  g.shake(0.35, 2.4);
  g.setFlag('a4.rootUp');
  const root = g.room.get('root');
  if (root) root.visible = true;
  g.room.col.addCircle(ROOT_AT.x, ROOT_AT.z, ROOT_AT.r, 'root');
  spawnRootLimbs(g, 'rise');
  await g.wait(1.0);
  const bosun = g.room.get('bosun');
  if (bosun) bosun.visible = false;
  g.room.col.removeTag('bosun');
  await g.say(
    '쉬브 너머로 그것이 올라왔다. 케이블을 칭칭 감은 검은 덩어리. 그 둘레로 팔들이 뱃전을 붙잡는다.',
    '갑판장이 쉬브 옆에서 무언가에 끌려 뱃전 너머로 사라졌다. 비명 소리조차 없었다.',
    '덩어리 한가운데에서 검은 것이 뛴다. 탈라사호의 돌과 같은 것. 저것을 도려내 불에 넣어야 한다.',
    '팔들은 뱃전에 뿌리를 박은 채 움직이지 않는다. 다만 닿는 데까지는 내리친다. 내리치기 전에 몸을 뒤로 젖힌다.',
  );
  spawnDeckDrowned(g, 1.5);
  await g.say('양쪽 뱃전 너머로 젖은 손들이 올라온다. 그 가운데 하나는 이등항해사의 외투를 입고 있다.');
  g.note('도끼로 뿌리의 심장을 도려낸다');
}

/** Where the root lies on the fore deck once it is up, and the reach of its collider. */
export const ROOT_AT = { x: 0, z: 10.4, r: 0.85 } as const;

/**
 * The two limbs that come over the bow rails with the root: they never leave it, and no blade kills them.
 * Where you stand to cut at the root they reach you; one step aft of it they do not, so someone who
 * watches them rear back can step out of the way and go in again.
 */
export function spawnRootLimbs(g: GameAPI, entrance: 'rise' | 'none'): void {
  g.spawnCreature({ id: 'a4limb1', x: -2.4, z: 10.9, h: Math.PI, hp: 99, entrance, variant: 'limb', strength: 1, speed: 0 });
  g.spawnCreature({ id: 'a4limb2', x: 2.5, z: 10.8, h: Math.PI, hp: 99, entrance, variant: 'limb', strength: 1, speed: 0 });
}

/** What climbs over the rail after it. One of them wears the second officer's coat. */
export function spawnDeckDrowned(g: GameAPI, delay: number): void {
  g.spawnCreature({ id: 'a4d1', x: -4.8, z: 6.0, h: Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.15, delay });
  g.spawnCreature({ id: 'a4d2', x: 4.8, z: 4.0, h: -Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.1, delay: delay + 4.5 });
}

/** One blow of the axe into the root. Returns true when the heart is out. */
export async function chopTheRoot(g: GameAPI): Promise<boolean> {
  const hits = g.num('a4.heartHits') + 1;
  g.setFlag('a4.heartHits', hits);
  g.sfx('hit-flesh', { volume: 1.1 });
  g.shake(0.08, 0.3);
  if (hits < ROOT_HITS) {
    if (hits === 1) await g.say('도끼날이 검은 살에 박힌다. 덩어리 전체가 움찔하며 바다 쪽으로 몸을 비튼다.');
    return false;
  }
  const core = g.room.get('root')?.getObjectByName('heartCore');
  const glow = g.room.get('root')?.getObjectByName('heartGlow');
  if (core) core.visible = false;
  if (glow) glow.visible = false;
  g.setFlag('got:heart');
  await g.giveItem('heart');
  g.sfx('stinger', { volume: 1.0 });
  await g.say('마지막 도끼질에 검은 심장이 덩어리에서 떨어져 나왔다. 손안에서 뛴다. 차갑고, 무겁고, 살아 있다.', '화실이다. 이 배의 화실.');
  g.note('검은 심장을 화실로');
  return true;
}
