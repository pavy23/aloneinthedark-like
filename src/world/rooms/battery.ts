import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { cyl, mesh, quad, rod } from '../../render/geo';
import * as P from '../props';
import * as P3 from '../props3';
import { exit, look, pickup, rect } from './common';
import { cellsInString, coilWait, fireCoil, getSwitchboard, pellObjection, SWITCH_KEYS, withPell } from '../../game/act3';
import { CANDLE_SECONDS } from '../../game/logic3';

const H = 2.8;

// Close-ups over his shoulder for the docked panels (the panel sits to the right).
const SWITCH_CAM: CameraDef = { id: 'switchClose', pos: [-1.9, 1.75, 3.6], look: [-0.6, 1.25, 5.9], fov: 55, zones: [], hidePlayer: true };
const BRIDGE_CAM: CameraDef = { id: 'bridgeClose', pos: [-2.6, 1.6, 2.1], look: [-1.3, 0.9, 0.35], fov: 52, zones: [], hidePlayer: true };
const RACK_CAM: CameraDef = { id: 'rackClose', pos: [1.0, 1.7, 1.9], look: [3.6, 0.75, 3.4], fov: 56, zones: [], hidePlayer: true };
const COIL_CAM: CameraDef = { id: 'coilClose', pos: [-1.2, 1.7, 1.0], look: [0.6, 0.8, 2.6], fov: 55, zones: [], hidePlayer: true };

/** Pell's first words once the door is open, and then whatever he can tell from where things stand. */
async function talkPell(g: GameAPI): Promise<void> {
  if (!g.flag('a3.pellMet')) {
    g.setFlag('a3.pellMet');
    await g.say(
      '토머스 펠. 문을 열어 주고는 지팡이에 기대어 상자 위에 도로 주저앉는다. 볼이 움푹 꺼졌지만 눈빛은 그대로다.',
      '"전보를 받고 오셨구려. 캐리긴이 내 전문을 받긴 받았나 보오."',
      '"21일 밤이었소. 소장님이 놈이 어디까지 왔는지 보겠다고 혼자 오두막으로 내려갔소. 돌아오지 않았소."',
      '"그 뒤로 오두막 회선에서 R이 오오. 몇 시간마다. 소장님 손 같기도 하고, 아닌 것 같기도 하오. 대답하면 그대로 따라 치오."',
      '"맥그래스 영감도, 야간 사환 녀석도… 나는 여기 문을 걸어 잠갔소. 그러고 엿새요."',
      '"소장님 계획은 저 코일이었소. 놈이 오두막 앞까지 올라오면 고압을 먹인다고. 그런데 ⑤번 스위치 손잡이를 창고에 넣고 잠갔소. 번호는 소장님 머리와 캐리긴에만 있소."',
      '"통신실 기록지를 보시오. 놈은 우리 전문을 기억했다가 돌려보내오. 뒤집어서. 소장님이 캐리긴에 보낸 그 전문도 돌아왔을 거요."',
      '"나는 이 다리로 오두막까지 못 가오. 조사관님이 오두막에 가고, 내가 여기서 쏘겠소. 준비가 되면 말해 주시오. 내가 전환반을 한 번 더 보겠소."',
    );
    return;
  }
  if (g.flag('a3.pellReady')) {
    await g.say(
      '"코일은 내가 맡았소. 오두막 키로 R을 보내시오."',
      '"놈도 회선에 있으니 R이 두 번 들릴 거요. 그러면 내가 K로 묻겠소. 따라 치지 말고 — R로 답하시오. 그게 사람이오."',
    );
    return;
  }
  const why = pellObjection(g);
  if (why) {
    const hint =
      !g.flag('a3.handle') && !g.flag('a3.storeOpen')
        ? ['"창고 번호요. 기록지에 메아리가 있을 거요. 뒤집혀 찍힌 걸 바로 읽어야 하오. 점은 선으로, 선은 점으로."']
        : [];
    await g.say(why, ...hint);
    return;
  }
  g.setFlag('a3.pellReady');
  g.setFlag('a3.hut', 0);
  g.sfx('breaker');
  await g.say(
    '펠이 전환반의 칼날 스위치를 하나씩 손끝으로 짚어 본다. 축전지의 연결띠도, 브리지 기록도.',
    '"…됐소. 다 맞소." 그가 코일 옆 상자에 앉아 1차 스위치에 손을 얹는다.',
    '"오두막 키로 R을 보내시오. 놈도 회선에 있으니 R이 두 번 들릴 거요. 그러면 내가 K로 묻겠소."',
    '"따라 치지 말고 — R로 답하시오. 놈은 묻는 말을 따라 할 줄밖에 모르오. 그 R이 들리면 쏘겠소."',
  );
  g.note('오두막의 키로 신호를 보내자');
}

async function useCoil(g: GameAPI): Promise<void> {
  if (!g.flag('a3.coilSeen')) {
    g.setFlag('a3.coilSeen');
    await g.say('수레 위에 얹힌 커다란 유도 코일. 검게 옻칠한 2차 코일이 어른 팔 길이보다 길다.', '손잡이에 꼬리표가 매달려 있다.');
    await g.readDoc('coilNote');
  }
  const litBefore = g.num('a3.lit');
  g.setFlag('a3.fireNow', false);
  g.cutTo(COIL_CAM);
  await g.openPanel('coil');
  g.cutTo(null);
  if (g.flag('a3.fireNow')) {
    g.setFlag('a3.fireNow', false);
    if (coilWait(g) > 0) return;
    await fireCoil(g, 'hand');
    return;
  }
  if (g.num('a3.lit') > litBefore && g.num('a3.timerAt') > 0) {
    await g.say(`양초가 끈 밑에서 탄다. 약 ${CANDLE_SECONDS}초.`, '그 안에 오두막까지 가야 한다. 그것이 뭍에 올라와 있을 때 떨어져야 한다.');
    g.note('양초가 탄다 — 오두막으로');
  }
}

// Battery and testing room: x -4..4, z 0..6. Door to the operating room in the west wall (z=3). The line
// switchboard under the north wall, the cells along the east wall, the bridge bench by the south wall, the
// coil on its trolley in the middle, the store cabinet in the north-west corner.
export const battery: RoomDef = {
  id: 'battery',
  name: '축전지·시험실',
  fog: { color: 0x050505, density: 0.085 },
  hemi: { sky: 0x4a4844, ground: 0x15130f, intensity: 0.95 },
  grade: { saturation: 0.8, tint: 0xfff2e0 },
  ambience: 'station',
  surface: 'wood',
  bounds: rect(-4, 0, 4, 6),
  spawns: {
    fromOps: { x: -3.25, z: 3.0, h: Math.PI / 2 },
  },
  cameras: [
    { id: 'door', pos: [-3.7, 2.5, 0.35], look: [1.8, 0.9, 4.6], fov: 62, zones: [rect(-4, 0, 0.6, 6)] },
    { id: 'east', pos: [-1.6, 2.4, 5.65], look: [3.4, 0.8, 1.6], fov: 62, zones: [rect(0.6, 0, 4, 6)] },
  ],
  build(b, g) {
    const pell = withPell(g);
    b.floor(-4, 0, 4, 6, M.deck);
    b.ceiling(-4, 0, 4, 6, H, M.paintDirty);
    b.wall(-4, 0, 4, 0, { h: H, mat: M.plaster });
    b.wall(-4, 6, 4, 6, { h: H, mat: M.plaster });
    b.wall(-4, 0, -4, 6, { h: H, mat: M.plaster, gaps: [{ at: 3, w: 1.0, h: 2.1 }] });
    b.wall(4, 0, 4, 6, { h: H, mat: M.plaster });
    b.add(P3.houseDoor(0.9, 2.0, M.woodDark, true), -3.92, 0, 3.0, Math.PI / 2);
    b.add(P3.houseWindow(0.9, 1.1, false), 1.6, 1.0, 0.1, 0);

    // Line switchboard (north wall) and its wiring plan framed beside it.
    b.add(P3.lineSwitchboard(), -0.8, 0, 5.9, Math.PI, { dynamic: true, name: 'board' });
    b.footprint(-0.8, 5.85, 2.1, 0.35);
    quad(b.staticRoot, M.paperBlank, 1.0, 1.4, 5.92, 0.55, 0.7, Math.PI);
    const spark = mesh(new THREE.SphereGeometry(0.05, 6, 4), M.arc);
    spark.visible = false;

    // The cells along the east wall.
    b.add(P3.batteryRack(), 3.55, 0, 3.0, -Math.PI / 2, { dynamic: true, name: 'rack' });
    b.footprint(3.55, 3.0, 0.5, 2.7);

    // The bridge bench by the south wall.
    b.add(P.table(1.9, 0.7, 0.78, M.woodDark), -1.6, 0, 0.45, 0);
    b.footprint(-1.6, 0.45, 1.95, 0.75);
    b.add(P.bridgeBox(), -2.1, 0.78, 0.45, 0);
    b.add(P.galvanometer(), -0.95, 0.78, 0.55, 0, { dynamic: true, name: 'galvo' });
    b.add(P.batteryBox(), -2.4, 0.78, 0.25, 0);

    // The coil on its trolley, its discharger spark (shown when it fires).
    b.add(P3.inductionCoil(), 0.6, 0, 2.6, 0, { dynamic: true, name: 'coil' });
    b.footprint(0.6, 2.6, 1.45, 0.65);
    spark.position.set(0.6, 1.1, 2.6);
    spark.name = 'coilSpark';
    b.add(spark, 0.6, 1.1, 2.6, 0, { dynamic: true, name: 'coilSpark' });
    // The candle timer: a cord holds the primary switch's handle up; a candle burns under the cord.
    const timer = new THREE.Group();
    cyl(timer, M.ceramic, 0, 0.08, 0, 0.02, 0.16, 'y', 6);
    const flame = mesh(new THREE.ConeGeometry(0.015, 0.05, 5), M.lanternGlass);
    flame.position.y = 0.185;
    flame.name = 'candleFlame';
    timer.add(flame);
    rod(timer, M.rope, { x: 0, y: 0.3, z: 0 }, { x: 0.02, y: 0.62, z: -0.02 }, 0.006, 3);
    timer.visible = g.num('a3.timerAt') > 0;
    b.add(timer, 1.32, 0.38, 2.75, 0, { dynamic: true, name: 'candleRig' });
    const lead = new THREE.Group();
    P.wire(lead, [-0.05, 1.1, 2.6], [-0.7, 1.3, 5.75]);
    P.wire(lead, [1.25, 0.5, 2.6], [3.3, 0.6, 2.4]);
    b.add(lead, 0, 0, 0, 0);

    // The store cabinet in the north-west corner (padlocked until opened).
    b.add(P3.storeCabinet(g.flag('a3.storeOpen')), -3.63, 0, 4.85, Math.PI / 2, { dynamic: true, name: 'storeCab' });
    b.footprint(-3.63, 4.85, 0.68, 1.32);

    // A small table by the rack: the hydrometer and the battery book.
    b.add(P.table(0.9, 0.55, 0.78, M.woodDark), 3.1, 0, 0.45, 0);
    b.footprint(3.1, 0.45, 0.95, 0.6);

    // Pell, on a crate by the coil (only if he came ashore with you).
    if (pell) {
      b.add(P3.operator(), 1.95, 0, 1.0, -0.9, { dynamic: true, name: 'pell' });
      b.circle(1.95, 1.0, 0.4);
      b.add(P.bottle(), 2.5, 0, 0.35, 0);
    } else {
      // Where the night operator held out: an empty biscuit tin, a water can, scratches on the wall.
      b.add(P.crate(0.5, 0.42, 0.45, M.woodLight), 1.95, 0, 1.0, 0.3);
      b.footprint(1.95, 1.0, 0.55, 0.5);
      pickup(b, g, { item: 'brandy3', x: 1.95, y: 0.43, z: 1.0, ry: 0.5, label: '브랜디 플라스크', r: 1.2 });
    }

    // Light: the oil lamp on the bridge bench and one on the small table.
    const lamp = P.lanternItem();
    b.add(lamp, -1.4, 0.78, 0.35, 0);
    b.light({ x: -1.4, y: 1.3, z: 0.7, color: 0xffb066, intensity: 8, distance: 8, flicker: 0.3 });
    b.light({ x: 3.0, y: 1.3, z: 0.7, color: 0xffa860, intensity: 4, distance: 6, flicker: 0.25 });

    // ---- interactions
    exit(b, { id: 'door', x: -3.55, z: 3.0, label: '문 (통신실로)', to: 'opsroom', spawn: 'fromBattery' });
    b.interact({
      id: 'switchboard',
      x: -0.8,
      z: 5.1,
      r: 1.3,
      label: '회선 전환반',
      onAction: async (gg) => {
        if (!gg.flag('a3.boardSeen')) {
          gg.setFlag('a3.boardSeen');
          await gg.say('슬레이트 판에 칼날 스위치 다섯 개. 바닥에서 올라온 해저선이 판 뒤로 물려 있다.', '⑤번 자리만 손잡이가 없다. 칼날이 빠진 빈 턱만 남았다.');
        }
        gg.cutTo(SWITCH_CAM);
        await gg.openPanel('switches');
        gg.cutTo(null);
      },
      onItem: async (gg, item) => {
        if (item !== 'swHandle') return false;
        gg.cutTo(SWITCH_CAM);
        await gg.openPanel('switches');
        gg.cutTo(null);
        return true;
      },
    });
    b.interact({
      id: 'plan',
      x: 1.0,
      z: 5.3,
      r: 1.1,
      label: '결선도',
      onAction: async (gg) => {
        await gg.readDoc('switchPlan');
      },
    });
    b.interact({
      id: 'rack',
      x: 2.9,
      z: 3.0,
      r: 1.3,
      label: '축전지 선반',
      onAction: async (gg) => {
        if (!gg.flag('a3.rackSeen')) {
          gg.setFlag('a3.rackSeen');
          await gg.say('유리 용기에 담긴 납축전지 열여섯 개. 황산 냄새가 코를 찌른다.', '셀 사이를 잇는 연결띠는 열두 개뿐이다. 코일에 물릴 직렬 한 줄 분량.');
        }
        gg.cutTo(RACK_CAM);
        await gg.openPanel('rack');
        gg.cutTo(null);
      },
    });
    b.interact({
      id: 'bridge',
      x: -1.4,
      z: 1.25,
      r: 1.2,
      label: '휘트스톤 브리지',
      onAction: async (gg) => {
        gg.cutTo(BRIDGE_CAM);
        await gg.openPanel('bridge3');
        gg.cutTo(null);
        if (gg.flag('a3.measured') && !gg.flag('a3.measuredSaid')) {
          gg.setFlag('a3.measuredSaid');
          await gg.say(
            '고장점은 오두막 너머, 바다 쪽으로 450미터 남짓. 해안 구간이다. 소장의 일지대로라면, 지난달에는 아직 수백 해리 밖이었다.',
            '소장의 계획대로라면 — 지금이다. 그것이 오두막 앞까지 올라왔을 때 코일을 쏘아야 한다.',
          );
        }
      },
    });
    b.interact({ id: 'coil', x: 0.6, z: 1.75, r: 1.3, label: '유도 코일', onAction: (gg) => useCoil(gg) });
    b.interact({
      id: 'store',
      x: -3.0,
      z: 4.85,
      r: 1.2,
      label: g.flag('a3.storeOpen') ? '창고 (열림)' : '창고',
      onAction: async (gg) => {
        if (gg.flag('a3.storeOpen')) {
          await gg.say(gg.flag('got:swHandle') ? '창고는 비었다. 소장의 예비 램프 심지와 빈 상자뿐이다.' : '창고 안 선반에 흑단 손잡이 하나.');
          if (!gg.flag('got:swHandle')) {
            gg.setFlag('got:swHandle');
            await gg.giveItem('swHandle');
          }
          return;
        }
        if (!gg.flag('a3.storeSeen')) {
          gg.setFlag('a3.storeSeen');
          await gg.say('키 큰 나무 창고. 놋쇠 숫자 자물쇠가 걸려 있다. 바퀴 세 개 — 세 자리 숫자다.');
        }
        await gg.openPanel('combo');
        if (gg.flag('a3.storeOpen')) {
          const cab = gg.room.get('storeCab');
          const leaf = cab?.getObjectByName('leaf');
          const lock = cab?.getObjectByName('padlock');
          if (lock) lock.visible = false;
          gg.sfx('door');
          for (let i = 1; i <= 16; i++) {
            if (leaf) leaf.rotation.y = -(i / 16) * 1.6;
            await gg.wait(1 / 40);
          }
          const it = gg.room.interactables.find((i) => i.id === 'store');
          if (it) it.label = '창고 (열림)';
          gg.setFlag('got:swHandle');
          await gg.say('창고 문이 열렸다. 선반 위에 흑단 손잡이에 놋쇠 날이 달린 물건이 놓여 있다.', '⑤번 스위치의 손잡이다.');
          await gg.giveItem('swHandle');
        }
      },
    });
    if (pell) b.interact({ id: 'pell', x: 1.95, z: 1.0, r: 1.3, label: '펠', verb: '말 걸기', onAction: (gg) => talkPell(gg) });
    else
      look(b, 'scratches', 1.35, 1.05, '상자와 벽', [
        '빈 비스킷 깡통과 물병. 누군가 여기서 며칠을 버텼다.',
        '벽에 손톱으로 긁은 자국이 있다. 점, 선, 점. 점, 선, 점. 점, 선, 점.',
        'R, R, R. 받았다, 받았다, 받았다. …무엇을 받았다는 걸까.',
      ]);
    pickup(b, g, { item: 'hydrometer', x: 2.85, y: 0.79, z: 0.45, ry: 0.4, label: '비중계', r: 1.2 });
    pickup(b, g, { item: 'batteryLog', x: 3.35, y: 0.79, z: 0.5, ry: -0.3, label: '축전지 관리 수첩', r: 1.2 });
    look(b, 'galvoLook', -0.95, 1.2, '미러 검류계', ['톰슨식 미러 검류계. 램프 빛이 거울에 맞아 눈금판으로 되돌아온다.'], 0.9);
  },
  onEnter(g) {
    g.setFlag('a3.batterySeen');
    if (withPell(g) && !g.flag('a3.pellMet')) {
      void g.run(async () => {
        await g.wait(0.5);
        await talkPell(g);
      });
    } else if (!withPell(g) && !g.flag('a3.batteryLook')) {
      g.setFlag('a3.batteryLook');
      void (async () => {
        await g.wait(0.6);
        await g.say('축전지실. 램프 하나가 타고 있다. 황산과 오존 냄새.', '누군가 여기 숨어 있었다. 그리고 — 문을 열어 준 것은 그 누군가가 아니었다.');
      })();
    }
  },
  update(g, room, _dt, t) {
    // Lugs on the cells in the string, switch handles as set.
    const on = new Set(cellsInString(g));
    for (let i = 0; i < 16; i++) {
      const lug = room.get(`lug${i}`);
      if (lug) lug.visible = on.has(i);
    }
    const s = getSwitchboard(g);
    SWITCH_KEYS.forEach((k, i) => {
      const sw = room.get(`sw${i}`);
      if (!sw) return;
      sw.rotation.x = s[k] ? 0 : 2.2;
      if (k === 'coil') sw.visible = g.flag('a3.handle');
    });
    // The candle burning down under its cord.
    const rig = room.get('candleRig');
    if (rig) rig.visible = g.num('a3.timerAt') > 0;
    const flame = room.get('candleFlame');
    if (flame) flame.scale.y = 0.85 + Math.sin(t * 17) * 0.1 + Math.sin(t * 7.1) * 0.08;
  },
};
