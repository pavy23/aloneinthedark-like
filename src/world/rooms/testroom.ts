import * as THREE from 'three';
import type { RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { part, quad } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';
import { SIDE_KO, thingSide } from '../../game/act2';
import { SHORE_END_NM } from '../../game/logic2';

// Over his left shoulder: the galvanometer and its scale stay in view to the left of the docked panel.
const BRIDGE_CAM: CameraDef = { id: 'bridgeClose', pos: [-0.9, 1.75, 2.15], look: [0.35, 0.85, 3.15], fov: 52, zones: [], hidePlayer: true };

// Cable testing room off the officers' alleyway: x -2..2, z 0..3.6; door in the south wall at x=0.
// The delicate mirror galvanometer is kept amidships, where the ship moves least.
export const testroom: RoomDef = {
  id: 'testroom',
  name: '케이블 시험실',
  fog: { color: 0x050505, density: 0.1 },
  hemi: { sky: 0x4a4844, ground: 0x15130f, intensity: 0.9 },
  grade: { saturation: 0.8, tint: 0xfff2e0 },
  ambience: 'interior',
  surface: 'lino',
  bounds: rect(-2, 0, 2, 3.6),
  spawns: { fromCorridor: { x: 0, z: 0.7, h: 0 } },
  cameras: [
    { id: 'door', pos: [-1.8, 2.2, 0.22], look: [0.8, 0.75, 3.1], fov: 62, zones: [rect(-2, 0, 2, 3.6)] },
  ],
  build(b, g) {
    const H = 2.4;
    b.floor(-2, 0, 2, 3.6, M.linoleum);
    b.ceiling(-2, 0, 2, 3.6, H, M.paintDirty);
    b.wall(-2, 0, 2, 0, { h: H, mat: M.paint, gaps: [{ at: 2, w: 0.9, h: 1.95 }] });
    b.wall(-2, 3.6, 2, 3.6, { h: H, mat: M.paint });
    b.wall(-2, 0, -2, 3.6, { h: H, mat: M.paint });
    b.wall(2, 0, 2, 3.6, { h: H, mat: M.paint });
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 0, 0, 0, 0);

    // Test bench along the far bulkhead: bridge, galvanometer with lamp and scale, the cells.
    b.add(P.table(2.8, 0.75, 0.76, M.woodDark), 0, 0, 3.15, 0);
    b.footprint(0, 3.15, 2.85, 0.8);
    b.add(P.bridgeBox(), -0.35, 0.76, 3.1, 0, { dynamic: true, name: 'bridgeBox' });
    b.add(P.galvanometer(), 0.85, 0.76, 3.1, 0, { dynamic: true, name: 'galvo' });
    b.add(P.batteryBox(), -1.15, 0.76, 3.2, 0);
    // Wires from the cells and the terminal board to the bridge.
    const wires = new THREE.Group();
    for (const [a, c] of [
      [
        [-1.0, 0.95, 3.2],
        [-0.6, 0.9, 3.05],
      ],
      [
        [-0.1, 0.9, 3.05],
        [0.75, 0.88, 2.9],
      ],
      [
        [1.95, 1.2, 2.0],
        [0.0, 0.9, 3.2],
      ],
    ] as const)
      P.wire(wires, a, c);
    b.add(wires, 0, 0, 0, 0);
    // Terminal board with the two cable ends brought up from the tanks.
    b.add(P.terminalBoard(), 1.97, 0, 2.0, -Math.PI / 2);
    // Electrician's desk with his papers.
    b.add(P.desk(1.1, 0.6), -1.68, 0, 1.6, Math.PI / 2);
    b.footprint(-1.68, 1.6, 0.62, 1.12);
    b.add(P.chair(M.wood), -1.0, 0, 1.6, -Math.PI / 2);
    b.circle(-1.0, 1.6, 0.25);
    b.add(P.chair(M.wood, true), 1.25, 0, 1.05, 0.7);
    b.circle(1.25, 1.05, 0.3);
    // Cable samples on a shelf, a coat on its hook.
    const shelf = new THREE.Group();
    part(shelf, M.woodDark, 0, 1.55, 0, 1.1, 0.04, 0.25);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), M.cable.m);
      s.rotation.z = Math.PI / 2;
      s.position.set(-0.35 + i * 0.24, 1.62, 0);
      shelf.add(s);
    }
    b.add(shelf, 1.7, 0, 0.9, -Math.PI / 2);
    b.add(P.coatHook(), -1.95, 0, 3.0, Math.PI / 2);
    quad(b.staticRoot, M.paperBlank, 1.1, 1.7, 3.58, 0.5, 0.36, Math.PI);

    // Lights: the desk lamp, the galvanometer's own little lamp.
    b.add(P.cageLamp('bulbT1', true), 0, H, 1.9, 0, { dynamic: true });
    b.light({ x: 0, y: 2.0, z: 1.9, color: 0xffd6a0, intensity: 8, distance: 7, needsPower: true, flicker: 0.15 });
    b.light({ x: 0.85, y: 1.1, z: 2.8, color: 0xfff0c8, intensity: 2.5, distance: 2.5 });

    // ---- interactions
    exit(b, { id: 'door', x: 0, z: 0.45, label: '문 (사관 통로로)', to: 'corridor', spawn: 'fromTestroom' });
    b.interact({
      id: 'bridge',
      x: -0.2,
      z: 2.55,
      r: 1.15,
      label: '휘트스톤 브리지',
      onAction: async (gg) => {
        if (!gg.hasPower()) {
          await gg.say('검류계의 램프가 꺼져 있다. 광점이 보이지 않으면 측정할 수 없다.');
          return;
        }
        if (!gg.flag('a2.bridgeIntro')) {
          gg.setFlag('a2.bridgeIntro');
          await gg.say(
            '브리지 상자의 다이얼 네 개, 비율 마개, 검류계 분류기. 벽 단자반에서 내려온 선이 상자에 물려 있다.',
            '검류계 램프가 켜지자 눈금판 위에 작은 광점이 떠오른다.',
          );
        }
        gg.cutTo(BRIDGE_CAM);
        await gg.openPanel('bridge');
        gg.cutTo(null);
        if (gg.flag('a2.measured') && !gg.flag('a2.concluded')) {
          gg.setFlag('a2.concluded');
          const s = thingSide(gg);
          const tag = (x: 'port' | 'stbd') => (x === 'port' ? 'B — 좌현' : 'C — 우현');
          await gg.say(
            `기록을 다시 본다. ${tag(s === 'port' ? 'stbd' : 'port')} 끝은 ${SHORE_END_NM.toLocaleString('en-US')}해리 너머 육지국까지 멀쩡히 이어져 있다.`,
            `${tag(s)} 끝은 2해리 남짓에서 끊겨 있다. 그리고 그 끊긴 자리가, 재는 동안에도 배 쪽으로 다가왔다.`,
            `그것은 ${SIDE_KO[s]} 케이블을 타고 올라오고 있다. 권양기에서 ${SIDE_KO[s]} 드럼을 놓아 보내야 한다.`,
            '펠의 말로는, 고정핀 자물쇠 열쇠는 선장이 목에 걸고 다녔다. 그리고 선장은 2번 탱크로 내려갔다.',
          );
          gg.note(`측정 결과: ${SIDE_KO[s]} 케이블`);
        }
      },
    });
    look(b, 'terminals', 1.5, 2.0, '단자반', [
      '케이블 끝을 시험실까지 끌어올려 물려 두는 단자반.',
      '꼬리표 두 개: "B — 좌현 쉬브", "C — 우현 쉬브". 선수에 걸린 케이블의 두 끝이다.',
    ], 1.1);
    look(b, 'galvo', 0.85, 2.6, '미러 검류계', ['톰슨식 미러 검류계. 실에 매단 작은 거울이 램프 빛을 눈금판으로 되쏜다.', '아주 작은 전류에도 광점이 움직인다. 그래서 흔들림이 가장 적은 배 한가운데에 둔다.'], 1.0);
    pickup(b, g, { item: 'testManual', x: -1.65, y: 0.77, z: 1.95, ry: 0.2, label: '측정 요령 카드', r: 1.2 });
    pickup(b, g, { item: 'baleNote', x: -1.7, y: 0.77, z: 1.3, ry: -0.3, label: '측정 기록', r: 1.2 });
  },
  onEnter(g) {
    if (!g.flag('testroomSeen')) {
      g.setFlag('testroomSeen');
      void (async () => {
        await g.wait(0.6);
        await g.say('케이블 시험실. 측정 기구들이 작업대 위에 가지런히 놓여 있다. 의자 하나만 넘어져 있다.', '공기에서 오존 냄새가 난다. 누군가 여기서 오래, 아주 오래 무언가를 쟀다.');
      })();
    }
  },
  update(g, room, _dt, t) {
    // The spot wanders a little even untouched; the panel drives it when open.
    const spot = room.get('spot');
    if (spot && !g.flag('a2.panelOpen')) spot.position.x = Math.sin(t * 0.7) * 0.02;
  },
};
