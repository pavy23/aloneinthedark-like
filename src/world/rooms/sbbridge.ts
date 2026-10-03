import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import * as P from '../props';
import * as P4 from '../props4';
import { exit, look, rect } from './common';

// Over the chart table: the chart with the cable's line, the run to be laid off across it.
const CHART_CAM: CameraDef = { id: 'chartClose', pos: [-2.6, 2.3, -0.4], look: [-3.8, 0.8, -2.0], fov: 52, zones: [], hidePlayer: true };

const pad3 = (n: number) => String(Math.round(n) % 360).padStart(3, '0');

async function talkCaptain(g: GameAPI): Promise<void> {
  if (!g.flag('a4.captainMet')) {
    g.setFlag('a4.captainMet');
    await g.say(
      '레니 선장. 타륜을 잡은 채 고개만 돌린다. 눈가가 검게 꺼져 있다.',
      '"탈라사호의 조사관이시군. 회사가 당신 말을 귀담아들으라더군. …케이블선을 서른 해 탔소. 귀담아들을 일이 이런 일일 줄은 몰랐지."',
      '"자리는 잡았소. 고장점에서 벨 코브 쪽으로 1해리 남짓. 케이블은 해도에 064도로 누워 있소. 직각으로 끌면 334도요."',
      '"침로는 이등항해사 몫이었소. 이제 당신이 봐 주시오. 어제 오후 기관을 세우고 표류한 기록이 해도대에 있소."',
    );
    g.note('해도대에서 침로를 잡는다');
    return;
  }
  if (g.flag('a4.rootUp') && !g.flag('a4.done')) {
    await g.say('"갑판에서 무슨 일이오!" 선장은 타륜에서 손을 떼지 않는다. "배를 바람에 세워 둬야 하오. 나는 여기를 못 비우오. 가시오, 어서!"');
    return;
  }
  if (!g.flag('a4.runSet')) {
    await g.say('"해도대에서 침로를 잡아 주시오. 그래플은 이미 바닥에 내려가 있소."');
    return;
  }
  if (!g.flag('a4.hooked')) {
    const h = g.num('a4.heading');
    await g.say(`"${pad3(h)}도로 끌고 있소. 극미속이오. 장력계는 갑판장과 당신 몫이오."`);
    return;
  }
  if (!g.flag('a4.buoyed')) {
    await g.say('"물었다니 다행이오. 끝을 부표에 달고 나면, 남은 건 고장 난 끝이오."', '"회사는 상한 구간에서 올라오는 건 배에 두지 말라고 했소. 무슨 뜻인지 나는 묻지 않았소."');
    return;
  }
  await g.say('"부표는 봤소. 붉은 게 잘 보이는군." 선장이 창밖을 본다. "…이제 고장 난 끝이오."');
}

async function useChart(g: GameAPI): Promise<void> {
  if (!g.flag('a4.chartSeen')) {
    g.setFlag('a4.chartSeen');
    await g.say(
      '해도 위에 케이블의 선이 붉게 그어져 있다. 고장점에 X, 그 1해리 앞에 연필 동그라미.',
      '여백에 이등항해사의 글씨: "4월 18일 오후, 기관 정지 두 시간. 표류 100° 쪽으로 1해리 — 조류 0.5노트."',
    );
  }
  g.setFlag('a4.chartDone', false);
  g.cutTo(CHART_CAM);
  await g.openPanel('chart');
  g.cutTo(null);
  if (!g.flag('a4.chartDone')) return;
  g.setFlag('a4.chartDone', false);
  const h = g.num('a4.heading');
  g.sfx('tick', { volume: 0.8 });
  await g.say(
    h === 334 ? '"해도 그대로군. 334도." 선장이 고개를 끄덕이고 기관 전령기를 극미속에 놓는다.' : `"${pad3(h)}도라." 선장이 해도를 한 번 내려다보고는 타륜을 돌린다. "극미속."`,
    '선수에서 갑판장이 손을 들어 답한다. 그래플 로프가 쉬브 위에서 팽팽해진다.',
  );
  g.note('갑판의 장력계로');
}

// Wheelhouse: x -5..5, z -2.6..2.6, windows forward (+Z). Chart table aft to port, the door to the bridge wing
// and the ladder down to the fore deck to starboard.
export const sbbridge: RoomDef = {
  id: 'sbbridge',
  name: '세인트 브렌던호 선교',
  fog: { color: 0x1a1e22, density: 0.06 },
  hemi: { sky: 0x8a96a2, ground: 0x24201a, intensity: 1.2 },
  grade: { saturation: 0.7, tint: 0xf0f0ec },
  ambience: 'bridge',
  surface: 'wood',
  bounds: rect(-5, -2.6, 5, 2.6),
  spawns: {
    fromDeck: { x: 4.1, z: 0.6, h: -Math.PI / 2 },
  },
  cameras: [
    { id: 'aftPort', pos: [-4.55, 2.45, -2.3], look: [1.6, 0.9, 1.6], fov: 56, zones: [rect(-5, -2.6, 0.6, 2.6)] },
    { id: 'fwdStbd', pos: [4.55, 2.45, 2.3], look: [-2.2, 0.8, -1.4], fov: 56, zones: [rect(0.2, -2.6, 5, 2.6)] },
  ],
  build(b) {
    const H = 2.7;
    b.floor(-5, -2.6, 5, 2.6, M.wood);
    b.ceiling(-5, -2.6, 5, 2.6, H, M.paintDirty);
    b.wall(-5, 2.6, 5, 2.6, { h: 1.0, mat: M.woodDark, t: 0.18 });
    b.wall(-5, 2.6, 5, 2.6, { h: 0.55, mat: M.woodDark, t: 0.18, y: 2.15, collide: false });
    for (let i = 0; i < 6; i++) {
      const x = -4.1 + i * 1.64;
      b.box(x, 1.0, 2.62, 1.3, 1.15, 0.04, M.windowFog);
      b.box(x + 0.82, 1.0, 2.6, 0.12, 1.15, 0.16, M.woodDark);
    }
    b.box(-4.92, 1.0, 2.6, 0.12, 1.15, 0.16, M.woodDark);
    b.wall(-5, -2.6, -5, 2.6, { h: H, mat: M.woodDark, t: 0.18 });
    b.wall(5, -2.6, 5, 2.6, { h: H, mat: M.woodDark, t: 0.18, gaps: [{ at: 3.2, w: 0.9, h: 1.95 }] });
    b.wall(-5, -2.6, 5, -2.6, { h: H, mat: M.paintDirty, t: 0.18 });
    for (const z of [-1.2, 0.8]) b.add(P.porthole(0.18), -4.9, 1.55, z, Math.PI / 2);
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 5.0, 0, 0.6, -Math.PI / 2);

    // Helm, binnacle, engine telegraphs, speaking tubes, the chart table.
    b.add(P.helm(), 0, 0, 1.45, Math.PI, { dynamic: true });
    b.footprint(0, 1.45, 0.5, 0.5);
    b.add(P.binnacle(), 0, 0, 2.15, 0);
    b.circle(0, 2.15, 0.3);
    b.add(P.telegraph('sbTelePort'), -1.35, 0, 2.05, Math.PI / 2, { dynamic: true });
    b.add(P.telegraph('sbTeleStbd'), 1.35, 0, 2.05, -Math.PI / 2, { dynamic: true });
    b.circle(-1.35, 2.05, 0.3);
    b.circle(1.35, 2.05, 0.3);
    for (const x of [-2.6, -2.35]) b.add(P.speakingTube(), x, 0.2, 2.5, Math.PI);
    b.add(P.chartTable(), -3.75, 0, -1.9, 0);
    b.footprint(-3.75, -1.9, 1.5, 0.9);
    b.add(P.cageLamp('sbChartLamp', true), -3.75, H, -1.6, 0);
    b.add(P.cageLamp('sbHelmLamp', true), 0, H, 0.6, 0);
    const clock = new THREE.Group();
    clock.add(P.gauge(0.16));
    b.add(clock, -1.2, 1.9, -2.49, 0);
    b.add(P.gauge(0.12), -0.6, 1.85, -2.49, 0);

    // Captain Rennie at the wheel, keeping her head to the swell.
    b.add(P4.crewman({ coat: 0x1e2430, trousers: 0x1c1e22, hair: 0x9a948a, cap: 0xd8d4c8 }), 0, 0, 0.85, 0, { dynamic: true, name: 'captain' });
    b.circle(0, 0.85, 0.35);

    // Grey morning through the windows; the ship's own lamps over the chart and the helm.
    b.light({ x: 0, y: 2.0, z: 1.9, color: 0xb8c4d0, intensity: 8, distance: 9 });
    b.light({ x: -3.75, y: 2.3, z: -1.6, color: 0xffd9a0, intensity: 9, distance: 8, needsPower: true });
    b.light({ x: 0, y: 2.3, z: 0.6, color: 0xffd9a0, intensity: 6, distance: 8, needsPower: true });

    // ---- interactions
    exit(b, { id: 'deckDoor', x: 4.6, z: 0.6, label: '문 (갑판으로)', to: 'sbdeck', spawn: 'fromBridge', sfx: 'ladder' });
    b.interact({ id: 'chart', x: -3.75, z: -1.25, r: 1.2, label: '해도대', onAction: (gg) => useChart(gg) });
    b.interact({ id: 'captain', x: 0, z: 0.85, r: 1.3, label: '선장', verb: '말 걸기', onAction: (gg) => talkCaptain(gg) });
    look(b, 'telegraph', 1.2, 1.4, '기관 전령기', (gg) =>
      gg.flag('a4.runSet') && !gg.flag('a4.hooked') ? ['전령기는 "극미속 전진(DEAD SLOW AHEAD)"에 놓여 있다.'] : ['전령기는 "정지(STOP)"에 놓여 있다.'],
    );
    look(b, 'binnacle', 0.7, 1.9, '나침반', ['배는 너울을 비스듬히 받으며 거의 서 있다. 나침반 바늘이 가늘게 떤다.', '탈라사호의 나침반처럼 아래를 향해 기울지는 않았다. 아직은.'], 0.9);
    look(b, 'windows', -1.8, 2.0, '창문', (gg) =>
      gg.flag('a4.buoyed')
        ? ['좌현 앞쪽, 납빛 바다 위에 붉은 부표가 까딱인다.', '그 아래 2천 길 바닥에, 벨 코브로 이어진 성한 끝이 누워 있다.']
        : ['창밖은 납빛 바다. 뱃머리의 쉬브 너머로 그래플 로프가 물속으로 비스듬히 들어간다.'],
    );
  },
};
