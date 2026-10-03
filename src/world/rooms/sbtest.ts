import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { part, quad } from '../../render/geo';
import * as P from '../props';
import * as P3 from '../props3';
import * as P4 from '../props4';
import { exit, look, pickup, rect } from './common';
import { buoyTheEnd, deckGauge, withPell4 } from '../../game/act4';

// Over his left shoulder: the galvanometer's scale and the terminal board stay in view beside the docked panel.
const ENDS_CAM: CameraDef = { id: 'endsClose', pos: [-1.0, 1.8, 1.7], look: [0.9, 0.9, 3.3], fov: 54, zones: [], hidePlayer: true };

async function talkRoss(g: GameAPI): Promise<void> {
  if (!g.flag('a4.rossMet')) {
    g.setFlag('a4.rossMet');
    await g.say(
      '전기기사 로스. 안경 너머로 눈을 가늘게 뜨고 브리지 상자의 다이얼을 만지작거린다.',
      '"탈라사호의 베일 기록은 나도 읽었소. 고장점이 움직인다고 쓴 사람. 회사는 그 사람이 미쳤다고 했지."',
      '"케이블이 올라오면 바이트를 잘라 두 끝을 여기로 끌어오겠소. 한쪽은 벨 코브로, 한쪽은 고장점을 지나 캐리긴으로 가오."',
      `"어느 쪽이 어느 쪽인지는 재 봐야 아오. 저항을 재고, 불러 보고. ${withPell4(g) ? '벨 코브에는 펠이라는 사람이 앉아 있다면서요.' : '벨 코브에는 새 근무자가 앉아 있소.'}"`,
    );
    return;
  }
  if (!g.flag('a4.cut')) {
    await g.say('"바이트가 올라오면 부르시오. 쇠톱은 갈아 놨소."');
    return;
  }
  if (!g.flag('a4.buoyed')) {
    await g.say('"두 끝이 다 물려 있소. 저항부터 재 봅시다. 1해리에 3.9옴이오."', '"성한 끝은 육지국까지 천 해리가 넘소. 고장 난 끝은… 고장점에서 바다에 닿겠지."');
    return;
  }
  if (!g.flag('a4.done'))
    await g.say('"성한 끝은 부표에 매달려 있소. 고장 난 끝이 올라오면, 상한 구간을 잘라 내고 새 케이블을 잇겠소."', '"…올라오기만 하면."');
  else await g.say('"이을 준비는 끝났소. 당신이 시험 키를 쳐 주시오. 처음 신호는 당신 몫이오."');
}

async function useEnds(g: GameAPI): Promise<void> {
  if (!g.flag('a4.cut')) {
    await g.say('단자반은 비어 있다. 케이블의 바이트를 끌어올려 잘라야, 두 끝을 여기에 물릴 수 있다.');
    return;
  }
  if (g.flag('a4.buoyed')) {
    await g.say(`${g.num('a4.buoyEnd') === 1 ? 'A' : 'B'} 끝은 봉해서 부표에 달았다. 남은 끝의 꼬리표가 단자반 아래에서 가늘게 떤다.`);
    return;
  }
  g.setFlag('a4.buoyPick', 0);
  g.cutTo(ENDS_CAM);
  await g.openPanel('ends');
  g.cutTo(null);
  const pick = g.num('a4.buoyPick');
  if (!pick) return;
  g.setFlag('a4.buoyPick', 0);
  await g.say('로스가 고개를 끄덕인다. "봉해서 부표에 달라고 갑판에 이르겠소."');
  await buoyTheEnd(g, pick === 1 ? 'A' : 'B');
}

// Testing room in the deckhouse: x -2.5..2.5, z 0..4, door in the south wall at x=0. The bench along the
// north bulkhead (bridge, galvanometer, test key), the terminal board on the east bulkhead, a desk to the west.
export const sbtest: RoomDef = {
  id: 'sbtest',
  name: '세인트 브렌던호 시험실',
  fog: { color: 0x050505, density: 0.09 },
  hemi: { sky: 0x4a4844, ground: 0x15130f, intensity: 0.95 },
  grade: { saturation: 0.8, tint: 0xfff2e0 },
  ambience: 'interior',
  surface: 'lino',
  bounds: rect(-2.5, 0, 2.5, 4),
  spawns: { fromDeck: { x: 0, z: 0.7, h: 0 } },
  cameras: [{ id: 'door', pos: [-2.25, 2.25, 0.25], look: [0.9, 0.75, 3.4], fov: 62, zones: [rect(-2.5, 0, 2.5, 4)] }],
  build(b, g) {
    const H = 2.4;
    b.floor(-2.5, 0, 2.5, 4, M.linoleum);
    b.ceiling(-2.5, 0, 2.5, 4, H, M.paintDirty);
    b.wall(-2.5, 0, 2.5, 0, { h: H, mat: M.paint, gaps: [{ at: 2.5, w: 0.9, h: 1.95 }] });
    b.wall(-2.5, 4, 2.5, 4, { h: H, mat: M.paint });
    b.wall(-2.5, 0, -2.5, 4, { h: H, mat: M.paint });
    b.wall(2.5, 0, 2.5, 4, { h: H, mat: M.paint });
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 0, 0, 0, 0);
    for (const z of [1.2, 2.8]) b.add(P.porthole(0.16), -2.45, 1.5, z, Math.PI / 2);

    // The bench: bridge, galvanometer, cells and the test key.
    b.add(P.table(3.2, 0.75, 0.76, M.woodDark), 0, 0, 3.55, 0);
    b.footprint(0, 3.55, 3.25, 0.8);
    b.add(P.bridgeBox(), -0.6, 0.76, 3.5, 0, { dynamic: true, name: 'bridgeBox' });
    b.add(P.galvanometer(), 0.75, 0.76, 3.5, 0, { dynamic: true, name: 'galvo' });
    b.add(P.batteryBox(), -1.45, 0.76, 3.6, 0);
    b.add(P3.cableKey(), 0.0, 0.76, 3.3, 0);
    const wires = new THREE.Group();
    P.wire(wires, [-1.3, 0.95, 3.6], [-0.9, 0.9, 3.45]);
    P.wire(wires, [-0.3, 0.9, 3.45], [0.65, 0.88, 3.3]);
    P.wire(wires, [2.4, 1.2, 2.2], [0.0, 0.9, 3.6]);
    b.add(wires, 0, 0, 0, 0);
    // Terminal board on the east bulkhead, and the two cut ends brought up to it.
    b.add(P.terminalBoard(), 2.47, 0, 2.2, -Math.PI / 2);
    const ends = P4.cutEnds();
    ends.visible = g.flag('a4.cut');
    b.add(ends, 2.2, 0, 2.2, -Math.PI / 2, { dynamic: true, name: 'cutEnds' });
    // Ross's desk, his chair, a coat on its hook.
    b.add(P.desk(1.1, 0.6), -2.15, 0, 1.6, Math.PI / 2);
    b.footprint(-2.15, 1.6, 0.62, 1.12);
    b.add(P.chair(M.wood), -1.5, 0, 1.6, -Math.PI / 2);
    b.circle(-1.5, 1.6, 0.25);
    b.add(P.coatHook(), 2.45, 0, 0.7, -Math.PI / 2);
    quad(b.staticRoot, M.paperBlank, -0.9, 1.7, 3.98, 0.6, 0.4, Math.PI);
    const shelf = new THREE.Group();
    part(shelf, M.woodDark, 0, 1.55, 0, 1.1, 0.04, 0.25);
    b.add(shelf, 1.2, 0, 3.86, 0);

    // Ross by the bench, turned to the door.
    b.add(P4.crewman({ coat: 0x4a4238, trousers: 0x2e2a24, hair: 0x6a4a2a }), -1.35, 0, 2.85, Math.PI - 0.6, { dynamic: true, name: 'ross' });
    b.circle(-1.35, 2.85, 0.35);

    b.add(P.cageLamp('sbTestLamp', true), 0, H, 1.4, 0);
    b.light({ x: 0, y: 2.0, z: 1.4, color: 0xffd6a0, intensity: 8, distance: 7, needsPower: true, flicker: 0.1 });
    b.light({ x: 0.75, y: 1.1, z: 3.2, color: 0xfff0c8, intensity: 2.5, distance: 2.5 });

    // ---- interactions
    exit(b, { id: 'door', x: 0, z: 0.45, label: '문 (갑판으로)', to: 'sbdeck', spawn: 'fromTest' });
    b.interact({ id: 'ends', x: 0.6, z: 2.75, r: 1.3, label: g.flag('a4.cut') ? '시험대 (두 끝)' : '시험대', onAction: (gg) => useEnds(gg) });
    b.interact({ id: 'ross', x: -1.35, z: 2.85, r: 1.3, label: '전기기사 로스', verb: '말 걸기', onAction: (gg) => talkRoss(gg) });
    look(b, 'terminals', 2.0, 2.2, '단자반', (gg) =>
      gg.flag('a4.cut')
        ? ['두 끝이 단자에 물려 있다. 꼬리표 A, B.', '구리 심선 둘레의 거타퍼차가 반년 동안 2천 길 바닥의 냉기를 머금어 차갑다.']
        : ['빈 단자반. 케이블의 끝을 물릴 놋쇠 단자 여덟 개.'],
    1.1);
    look(b, 'galvoLook', 0.75, 2.9, '미러 검류계', ['톰슨식 미러 검류계. 탈라사호에 있던 것과 같은 모델이다.', '광점이 눈금판 가운데에서 가만히 떨고 있다.'], 1.0);
    pickup(b, g, { item: 'brandy4', x: -2.1, y: 0.77, z: 1.25, ry: 0.3, label: '브랜디 플라스크', r: 1.2 });
  },
  onEnter(g) {
    if (!g.flag('a4.testSeen')) {
      g.setFlag('a4.testSeen');
      void g.run(async () => {
        await g.wait(0.5);
        await talkRoss(g);
      });
    } else if (g.flag('a4.cut') && !g.flag('a4.endsSeen')) {
      g.setFlag('a4.endsSeen');
      void g.run(async () => {
        await g.wait(0.5);
        await g.say('단자반에 두 끝이 물려 있다. 로스가 브리지 상자 앞에 앉아 기다린다.');
      });
    }
  },
  update(g, room, _dt, t) {
    // The spot wanders a little even untouched; the panel drives it while Ross balances the bridge.
    const spot = room.get('spot');
    if (spot) spot.position.x = deckGauge.driven ? deckGauge.spot : Math.sin(t * 0.7) * 0.02 + (g.flag('a4.cut') && !g.flag('a4.buoyed') ? Math.sin(t * 5.2) * 0.004 : 0);
  },
};
