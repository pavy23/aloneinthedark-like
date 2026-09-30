import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import { part, quad, rod } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';

// Wheelhouse: x -5..5, z -2.6..2.6, windows forward (+Z).
export const bridge: RoomDef = {
  id: 'bridge',
  name: '선교',
  fog: { color: 0x07090a, density: 0.07 },
  hemi: { sky: 0x566878, ground: 0x1a1410, intensity: 1.1 },
  grade: { saturation: 0.75, tint: 0xf0f0ec },
  ambience: 'bridge',
  surface: 'wood',
  bounds: rect(-5, -2.6, 5, 2.6),
  spawns: {
    fromDeck: { x: 4.1, z: 0.6, h: -Math.PI / 2 },
    fromCorridor: { x: 3.6, z: -1.1, h: Math.PI },
  },
  cameras: [
    { id: 'aftPort', pos: [-4.55, 2.45, -2.3], look: [1.6, 0.9, 1.6], fov: 56, zones: [rect(-5, -2.6, 0.6, 2.6)] },
    { id: 'fwdStbd', pos: [4.55, 2.45, 2.3], look: [-2.2, 0.8, -1.4], fov: 56, zones: [rect(0.2, -2.6, 5, 2.6)] },
  ],
  build(b, g) {
    const H = 2.7;
    // Floor with an opening for the stairwell (aft starboard corner).
    b.floor(-5, -1.4, 5, 2.6, M.wood);
    b.floor(-5, -2.6, 3.1, -1.4, M.wood);
    b.floor(4.4, -2.6, 5, -1.4, M.wood);
    b.box(3.75, -1.45, -2.0, 1.3, 0.05, 1.2, M.black);
    b.ceiling(-5, -2.6, 5, 2.6, H, M.paintDirty);
    // Forward wall with a row of windows (lower part solid).
    b.wall(-5, 2.6, 5, 2.6, { h: 1.0, mat: M.woodDark, t: 0.18 });
    b.wall(-5, 2.6, 5, 2.6, { h: 0.55, mat: M.woodDark, t: 0.18, y: 2.15, collide: false });
    for (let i = 0; i < 6; i++) {
      const x = -4.1 + i * 1.64;
      b.box(x, 1.0, 2.62, 1.3, 1.15, 0.04, M.windowFog);
      b.box(x + 0.82, 1.0, 2.6, 0.12, 1.15, 0.16, M.woodDark);
    }
    b.box(-4.92, 1.0, 2.6, 0.12, 1.15, 0.16, M.woodDark);
    // Side and back walls
    b.wall(-5, -2.6, -5, 2.6, { h: H, mat: M.woodDark, t: 0.18 });
    b.wall(5, -2.6, 5, 2.6, { h: H, mat: M.woodDark, t: 0.18, gaps: [{ at: 3.2, w: 0.9, h: 1.95 }] });
    b.wall(-5, -2.6, 5, -2.6, { h: H, mat: M.paintDirty, t: 0.18 });
    for (const z of [-1.2, 0.8]) {
      const ph = P.porthole(0.18);
      b.add(ph, -4.9, 1.55, z, Math.PI / 2);
    }
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 5.0, 0, 0.6, -Math.PI / 2);

    // Stairwell down to the officers' alleyway (aft starboard corner).
    rod(b.staticRoot, M.brass, { x: 3.1, y: 0.95, z: -1.4 }, { x: 4.4, y: 0.95, z: -1.4 }, 0.025);
    rod(b.staticRoot, M.brass, { x: 3.1, y: 0, z: -1.4 }, { x: 3.1, y: 0.95, z: -1.4 }, 0.025);
    rod(b.staticRoot, M.brass, { x: 3.1, y: 0.95, z: -1.4 }, { x: 3.1, y: 0.95, z: -2.5 }, 0.025);
    b.col.addRect({ minX: 3.05, minZ: -1.45, maxX: 4.45, maxZ: -1.36 });
    b.col.addRect({ minX: 3.05, minZ: -2.6, maxX: 3.14, maxZ: -1.4 });
    const st = P.stairs(1.1, -1.2, 1.0, 5);
    b.add(st, 3.75, 0, -1.5, 0);

    // Helm, binnacle, twin engine telegraphs, speaking tubes, chart table.
    b.add(P.helm(), 0, 0, 1.45, Math.PI, { dynamic: true });
    b.footprint(0, 1.45, 0.5, 0.5);
    b.add(P.binnacle(), 0, 0, 2.15, 0);
    b.circle(0, 2.15, 0.3);
    b.add(P.telegraph('telePort'), -1.35, 0, 2.05, Math.PI / 2, { dynamic: true });
    b.add(P.telegraph('teleStbd'), 1.35, 0, 2.05, -Math.PI / 2, { dynamic: true });
    b.circle(-1.35, 2.05, 0.3);
    b.circle(1.35, 2.05, 0.3);
    for (const x of [-2.6, -2.35]) b.add(P.speakingTube(), x, 0.2, 2.5, Math.PI);
    b.add(P.chartTable(), -3.75, 0, -1.9, 0);
    b.footprint(-3.75, -1.9, 1.5, 0.9);
    const lamp = P.cageLamp('bulbChart', true);
    b.add(lamp, -3.75, H, -1.6, 0, { dynamic: true });
    b.add(P.cageLamp('bulbHelm', true), 0, H, 0.6, 0, { dynamic: true });
    b.add(P.coatHook(), -4.88, 0, 0.3, Math.PI / 2);
    // Clock & barometer on the aft bulkhead
    const clock = new THREE.Group();
    const face = P.gauge(0.16);
    clock.add(face);
    b.add(clock, -1.2, 1.9, -2.49, 0);
    const baro = P.gauge(0.12);
    b.add(baro, -0.6, 1.85, -2.49, 0);
    // Log book stand
    const stand = new THREE.Group();
    part(stand, M.wood, 0, 0, 0, 0.5, 1.0, 0.4);
    quad(stand, M.paperBlank, 0, 1.02, 0, 0.42, 0.3, 0, -Math.PI / 2 + 0.25);
    b.add(stand, 1.8, 0, -2.2, 0);
    b.footprint(1.8, -2.2, 0.55, 0.45);

    // Moonlight through the fogged windows; electric lamps need ship's power.
    b.light({ x: 0, y: 2.0, z: 1.9, color: 0x8ba0b4, intensity: 7, distance: 9 });
    b.light({ x: -3.75, y: 2.3, z: -1.6, color: 0xffd9a0, intensity: 9, distance: 8, needsPower: true });
    b.light({ x: 0, y: 2.3, z: 0.6, color: 0xffd9a0, intensity: 8, distance: 8, needsPower: true });

    // ---- interactions
    exit(b, { id: 'deckDoor', x: 4.6, z: 0.6, label: '문 (갑판으로)', to: 'deck', spawn: 'fromBridge', sfx: 'ladder' });
    exit(b, { id: 'stairs', x: 3.75, z: -1.2, label: '계단 (아래 선실로)', to: 'corridor', spawn: 'fromBridge', sfx: 'ladder' });
    b.interact({
      id: 'chart',
      x: -3.75,
      z: -1.3,
      r: 1.2,
      label: '해도대',
      onAction: async (gg) => {
        await gg.say('대서양 중부 해도. 연필로 그어진 항적이 한 점에서 끝나 있고, 그 위에 붉은 X 표시.', '옆에 적힌 글씨: "수심 2,300길. 여기서 무언가가 걸렸다."');
        if (!gg.flag('got:cabinKey')) {
          await gg.say('해도대 서랍을 열어 보니 가죽 꼬리표가 달린 황동 열쇠가 있다.');
          gg.setFlag('got:cabinKey');
          await gg.giveItem('cabinKey');
        }
      },
    });
    look(b, 'helm', 0, 0.9, '타륜', ['타륜이 줄에 묶여 고정되어 있다. 누군가 배를 똑바로 두려고 한 모양이다.', '나침반 바늘이 북쪽을 가리키지 않는다. 바늘은… 아래를 향해 기울어 있다.']);
    look(b, 'telegraph', 1.2, 1.4, '기관 전령기', ['쌍발 추진기용 기관 전령기 두 대. 둘 다 "정지(STOP)"에 놓여 있다.', '누군가 손잡이에 손톱으로 긁은 자국을 남겼다.']);
    look(b, 'tubes', -2.45, 2.0, '전성관', ['기관실로 이어진 전성관. 귀를 대어 보니… 아래에서 불 타는 소리와, 물 떨어지는 소리가 들린다.']);
    look(b, 'windows', -1.8, 2.0, '창문', ['창밖은 온통 안개다. 선수의 돛대 등불만이 흐릿하게 번져 보인다.']);
    look(b, 'logstand', 1.8, -1.6, '항해일지 받침대', ['항해일지를 올려 두는 받침대. 일지는 없다. 몇 장이 뜯겨 나간 흔적만 남아 있다.']);
    b.interact({
      id: 'coat',
      x: -4.4,
      z: 0.3,
      r: 1.0,
      label: '걸려 있는 외투',
      onAction: async (gg) => {
        if (!gg.flag('got:brandy1')) {
          await gg.say('당직 사관의 외투다. 주머니에 무언가 묵직한 것이 들어 있다.');
          gg.setFlag('got:brandy1');
          await gg.giveItem('brandy1');
        } else await gg.say('젖은 모직 냄새가 나는 외투. 주인은 어디로 갔을까.');
      },
    });
    pickup(b, g, { item: 'logPage', x: 0.9, z: 0.1, y: 0.02, ry: 0.4, label: '찢어진 종이' });
  },
  update(g, room, _dt, t) {
    const w = room.get('wheel');
    if (w) w.rotation.z = Math.sin(t * 0.3) * 0.02;
    void g;
  },
};
