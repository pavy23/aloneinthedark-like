import * as THREE from 'three';
import type { RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { part, quad } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';
import { dawnComes, readyForEnding } from '../../game/act2';

const RADIO_CAM: CameraDef = { id: 'radioClose', pos: [0.3, 1.55, 1.75], look: [0.35, 1.25, 3.35], fov: 50, zones: [] };

// Wireless room: x -2.4..2.4, z 0..3.6; door on the south wall at x=0.
export const radio: RoomDef = {
  id: 'radio',
  name: '무선실',
  fog: { color: 0x040405, density: 0.09 },
  hemi: { sky: 0x464e54, ground: 0x16120e, intensity: 0.9 },
  grade: { saturation: 0.8, tint: 0xf4f0e6 },
  ambience: 'interior',
  surface: 'wood',
  bounds: rect(-2.4, 0, 2.4, 3.6),
  spawns: { fromCorridor: { x: 0, z: 0.7, h: 0 } },
  cameras: [
    { id: 'se', pos: [2.2, 2.25, 0.2], look: [-0.7, 0.9, 2.7], fov: 60, zones: [rect(-0.5, 0, 2.4, 3.6)] },
    { id: 'nw', pos: [-2.2, 2.25, 3.4], look: [1.1, 0.8, 0.9], fov: 60, zones: [rect(-2.4, 0, -0.3, 3.6)] },
  ],
  build(b, g) {
    const H = 2.35;
    b.floor(-2.4, 0, 2.4, 3.6, M.wood);
    b.ceiling(-2.4, 0, 2.4, 3.6, H, M.paintDirty);
    b.wall(-2.4, 0, 2.4, 0, { h: H, mat: M.paint, gaps: [{ at: 2.4, w: 0.9, h: 1.95 }] });
    b.wall(-2.4, 3.6, 2.4, 3.6, { h: H, mat: M.paint });
    b.wall(-2.4, 0, -2.4, 3.6, { h: H, mat: M.paint });
    b.wall(2.4, 0, 2.4, 3.6, { h: H, mat: M.paint });
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 0, 0, 0, 0);

    // The wireless bench along the forward bulkhead (dials face the operator, i.e. -Z).
    const set = P.radioSet();
    b.add(set, 0.3, 0, 3.15, Math.PI, { dynamic: true, name: 'radioSet' });
    b.footprint(0.3, 3.15, 2.25, 0.85);
    // Brass maker's plate with the wavelength formula.
    b.box(0.3, 0.64, 2.73, 0.5, 0.08, 0.02, M.brass);
    b.add(P.chair(M.wood, true), 0.1, 0, 2.1, 0.4);
    b.circle(0.1, 2.25, 0.3);
    // Operator's bunk and a side table with the test record.
    b.add(P.bunk(1.9, 0.75, false), -1.95, 0, 1.3, 0);
    b.footprint(-1.95, 1.3, 0.8, 1.95);
    const side = new THREE.Group();
    part(side, M.wood, 0, 0.66, 0, 0.6, 0.04, 0.45);
    part(side, M.wood, 0, 0, 0, 0.5, 0.66, 0.05);
    b.add(side, 1.95, 0, 0.75, -Math.PI / 2);
    b.footprint(1.95, 0.75, 0.47, 0.62);
    // Morse chart and wall clock on the starboard bulkhead
    quad(b.staticRoot, M.morse, 2.37, 1.45, 2.1, 0.5, 0.62, -Math.PI / 2);
    const clock = P.gauge(0.15);
    b.add(clock, 2.36, 1.95, 1.2, -Math.PI / 2);
    b.add(P.porthole(0.18), -2.35, 1.55, 2.8, Math.PI / 2);
    // Headphones cable dangling etc. are part of the set; lamp over the bench.
    b.add(P.cageLamp('bulbRadio', true), 0.3, H, 2.6, 0, { dynamic: true });
    b.light({ x: -1.9, y: 1.6, z: 2.8, color: 0x7c91a6, intensity: 4.5, distance: 6 });
    b.light({ x: 0.3, y: 2.1, z: 2.6, color: 0xffd9a0, intensity: 8, distance: 7, needsPower: true });

    // ---- interactions
    exit(b, { id: 'door', x: 0, z: 0.35, label: '문 (통로로)', to: 'corridor', spawn: 'fromRadio' });
    b.interact({
      id: 'radio',
      x: 0.3,
      z: 2.35,
      r: 1.25,
      label: '무선 송수신기',
      onAction: async (gg) => {
        if (!gg.hasPower()) {
          await gg.say(
            '불꽃 송신기와 수신기. 계기 바늘이 모두 0에 누워 있다.',
            '송신기 앞의 황동 명판: "파장(m) × 주파수(kc) = 300,000". 다이얼은 주파수가 아니라 파장, 곧 미터로 매겨져 있다.',
            '비상 축전지 단자에 소금기가 하얗게 엉겨 있다. 누군가 바닷물을 부어 버렸다.',
            '배의 발전기가 돌지 않으면 이 기계는 쓸모가 없다.',
          );
          return;
        }
        if (!gg.flag('radioIntro')) {
          gg.setFlag('radioIntro');
          await gg.say('계기에 불이 들어와 있다. 수화기에서 공전 잡음이 끓어오른다. 송신기가 살아났다.');
        }
        gg.cutTo(RADIO_CAM);
        await gg.openPanel('radio');
        gg.cutTo(null);
        if (readyForEnding(gg)) await dawnComes(gg);
      },
    });
    b.interact({
      id: 'morseChart',
      x: 1.9,
      z: 2.1,
      r: 1.0,
      label: '모스 부호표',
      onAction: async (gg) => {
        await gg.readDoc('morse');
      },
    });
    look(b, 'bunk', -1.5, 1.3, '통신사의 침대', ['통신사 펠의 침대. 이불 속에 수화기 한 짝이 들어 있다. 잘 때도 귀에 대고 있었던 모양이다.']);
    pickup(b, g, { item: 'wirelessLog', x: -0.35, y: 0.8, z: 2.95, ry: Math.PI, label: '통신 일지', r: 1.2 });
    pickup(b, g, { item: 'testRecord', x: 1.95, y: 0.71, z: 0.75, ry: 0.5, label: '시험 기록지' });
  },
  update(g, room, _dt, t) {
    const gap = room.get('sparkGap');
    if (gap && g.hasPower()) gap.rotation.z = t * 20;
    const spark = room.get('spark');
    if (spark) {
      // A faint blue flicker whenever the key is pressed (panel toggles spark visibility).
      spark.scale.setScalar(0.8 + Math.random() * 0.6);
    }
  },
};
