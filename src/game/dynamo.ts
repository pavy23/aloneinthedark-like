import type { GameAPI } from '../world/types';
import { newDynamo, type DynamoEvent, type DynamoState } from './logic';

// Glue between the pure dynamo simulation and the save-game flags.

export function getDyn(g: GameAPI): DynamoState {
  const d = newDynamo();
  d.drain = g.flag('dyn.drain');
  d.steam = Math.max(0, Math.min(2, g.num('dyn.steam'))) as 0 | 1 | 2;
  d.warm = g.num('dyn.warm');
  d.rpm = g.num('dyn.rpm');
  d.breaker = g.flag('power');
  d.hammers = g.num('dyn.hammers');
  return d;
}

export function setDyn(g: GameAPI, s: DynamoState): void {
  g.setFlag('dyn.drain', s.drain);
  g.setFlag('dyn.steam', s.steam);
  // Full precision on purpose: rounding here would swallow the tiny per-frame increments of a
  // 500 Hz+ display and the line would never warm through.
  g.setFlag('dyn.warm', s.warm);
  g.setFlag('dyn.rpm', s.rpm);
  g.setFlag('dyn.hammers', s.hammers);
}

type Listener = (ev: DynamoEvent) => void;
const listeners = new Set<Listener>();

export function onDynamo(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDynamo(ev: DynamoEvent): void {
  for (const l of listeners) l(ev);
}

export function hasDynamoListeners(): boolean {
  return listeners.size > 0;
}

export const DYN_TEXT: Record<DynamoEvent, string> = {
  hammer: '쾅! 배관 속에서 쇳덩이가 부딪치는 듯한 굉음 — 워터해머다. 반사적으로 밸브를 도로 잠갔다.',
  warming: '증기가 관 속으로 스며든다. 드레인에서 뜨거운 물과 증기가 섞여 쏟아진다.',
  warmed: '드레인에서 이제 물 없이 마른 증기만 뿜어져 나온다. 관이 충분히 데워졌다.',
  'not-warm': '아직 드레인에서 물이 섞여 나온다. 관이 다 데워질 때까지 기다리자.',
  spinning: '엔진이 쿨럭이며 돌기 시작한다. 플라이휠이 속도를 올린다.',
  rated: '회전계 바늘이 초록 칸에 들어와 멈췄다. 정격 회전이다.',
  power: '주차단기를 넣었다. 둔탁한 소리와 함께 전등들이 깜빡이며 살아난다.',
  trip: '딸깍! 차단기가 튕겨 나왔다. 회전이 아직 부족하다.',
  nothing: '',
  already: '이미 그렇게 되어 있다.',
};
