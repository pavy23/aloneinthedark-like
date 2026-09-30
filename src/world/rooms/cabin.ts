import * as THREE from 'three';
import type { RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { part, quad } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';

const SAFE_CAM: CameraDef = { id: 'safeClose', pos: [1.05, 1.25, 3.25], look: [2.55, 0.45, 3.95], fov: 42, zones: [] };

// Master's cabin: x -3..3, z 0..4.4; door on the south wall at x=0.
export const cabin: RoomDef = {
  id: 'cabin',
  name: '선장실',
  fog: { color: 0x050404, density: 0.09 },
  hemi: { sky: 0x4c4840, ground: 0x16120e, intensity: 0.95 },
  grade: { saturation: 0.85, tint: 0xfff0dc },
  ambience: 'interior',
  surface: 'wood',
  bounds: rect(-3, 0, 3, 4.4),
  spawns: { fromCorridor: { x: 0, z: 0.7, h: 0 } },
  cameras: [
    { id: 'door', pos: [2.65, 2.3, 0.25], look: [-1.4, 0.75, 3.2], fov: 58, zones: [rect(-3, 0, 3, 2.5)] },
    { id: 'desk', pos: [-2.65, 2.3, 4.15], look: [1.4, 0.7, 1.0], fov: 58, zones: [rect(-3, 2.2, 3, 4.4)] },
  ],
  build(b, g) {
    const H = 2.4;
    b.floor(-3, 0, 3, 4.4, M.wood);
    b.ceiling(-3, 0, 3, 4.4, H, M.paintDirty);
    b.wall(-3, 0, 3, 0, { h: H, mat: M.woodDark, gaps: [{ at: 3, w: 0.9, h: 1.95 }] });
    b.wall(-3, 4.4, 3, 4.4, { h: H, mat: M.woodDark });
    b.wall(-3, 0, -3, 4.4, { h: H, mat: M.woodDark });
    b.wall(3, 0, 3, 4.4, { h: H, mat: M.woodDark });
    b.add(P.shipDoor(0.8, 1.9, M.woodDark, true), 0, 0, 0, 0);
    const rug = quad(b.staticRoot, M.rug, -0.2, 0.012, 2.2, 2.6, 1.8, 0, -Math.PI / 2);
    void rug;
    for (const x of [-0.6, 1.1]) b.add(P.porthole(0.2), x, 1.55, 4.3, Math.PI);

    // Desk against the north bulkhead, with the diary and a framed portrait.
    b.add(P.desk(1.5, 0.7), -1.7, 0, 3.95, Math.PI);
    b.footprint(-1.7, 3.95, 1.55, 0.75);
    b.add(P.chair(M.wood), -1.7, 0, 3.2, Math.PI);
    b.circle(-1.7, 3.2, 0.25);
    const frame = P.photoFrame(M.photoPortrait);
    frame.scale.setScalar(0.5);
    b.add(frame, -2.2, 0.95, 4.05, Math.PI + 0.3);
    const lampBase = new THREE.Group();
    part(lampBase, M.brass, 0, 0, 0, 0.14, 0.04, 0.14);
    part(lampBase, M.brass, 0, 0.04, 0, 0.03, 0.35, 0.03);
    part(lampBase, M.greenCloth, 0, 0.36, 0.06, 0.3, 0.1, 0.16);
    b.add(lampBase, -1.1, 0.77, 4.05, 0);
    b.add(P.cageLamp('bulbDesk', false), -1.1, 1.12, 4.08, Math.PI, { dynamic: true });

    // Bunk along the east bulkhead, bookshelf west, wash stand by the door.
    b.add(P.bunk(2.0, 0.85, false), 2.5, 0, 2.35, 0);
    b.footprint(2.5, 2.35, 0.9, 2.05);
    b.add(P.bookshelf(1.1, 1.8, 0.34), -2.8, 0, 1.6, Math.PI / 2);
    b.footprint(-2.8, 1.6, 0.36, 1.12, 0);
    const wash = new THREE.Group();
    part(wash, M.wood, 0, 0, 0, 0.6, 0.8, 0.45);
    part(wash, M.marble, 0, 0.8, 0, 0.62, 0.04, 0.47);
    part(wash, M.ceramic, 0, 0.84, 0, 0.36, 0.1, 0.3);
    b.add(wash, -2.62, 0, 0.45, Math.PI / 2);
    b.footprint(-2.62, 0.45, 0.47, 0.62);
    b.add(P.coatHook(), 2.95, 0, 0.6, -Math.PI / 2);

    // The safe in the north-east corner, facing into the room.
    const sf = P.safe();
    b.add(sf, 2.55, 0, 3.95, -Math.PI / 2, { dynamic: true, name: 'safe' });
    b.footprint(2.55, 3.95, 0.66, 0.76);
    const door = sf.getObjectByName('safeDoor');
    if (door && g.flag('safeOpen')) door.rotation.y = -1.9;
    const inside = new THREE.Group();
    inside.name = 'safeInside';
    part(inside, M.greenCloth, -0.1, 0.12, -0.05, 0.18, 0.05, 0.24);
    part(inside, M.ironLight, 0.12, 0.12, -0.05, 0.05, 0.05, 0.3);
    inside.visible = !g.flag('got:captainLog');
    sf.add(inside);
    b.named.set('safeInside', inside);

    b.add(P.cageLamp('bulbCabin', true), 0, H, 2.2, 0, { dynamic: true });
    b.light({ x: 0.3, y: 1.6, z: 3.9, color: 0x7c91a6, intensity: 5, distance: 7 });
    b.light({ x: -1.1, y: 1.2, z: 3.8, color: 0xffcf88, intensity: 7, distance: 6, needsPower: true });
    b.light({ x: 0, y: 2.2, z: 2.2, color: 0xffd9a0, intensity: 7, distance: 8, needsPower: true });

    // ---- interactions
    exit(b, { id: 'door', x: 0, z: 0.35, label: '문 (통로로)', to: 'corridor', spawn: 'fromCabin' });
    pickup(b, g, { item: 'diary', x: -1.55, y: 0.78, z: 3.9, ry: 0.2, label: '가죽 일기장', r: 1.3 });
    look(b, 'portrait', -2.2, 3.4, '사진 액자', ['단정한 여인의 사진. 뒷면에 "마거릿, 1919"라고 적혀 있다.'], 1.1);
    look(b, 'shelf', -2.3, 1.6, '책장', ['항해술 교본, 케이블 수리 편람, 로이드 선급 규칙집. 그리고 해양 설화집 한 권이 거꾸로 꽂혀 있다.', '설화집의 접힌 페이지: "깊은 곳의 것은 불을 두려워한다. 그것은 차가움 속에서만 자란다."']);
    look(b, 'bunk', 2.0, 2.3, '침대', ['선장의 침대. 한 번도 누운 흔적이 없다. 베개 밑에 권총집이 있지만, 권총은 없다.']);
    b.interact({
      id: 'wash',
      x: -2.2,
      z: 0.45,
      r: 1.0,
      label: '세면대',
      onAction: async (gg) => {
        if (!gg.flag('got:brandy2')) {
          await gg.say('세면대 선반에 은빛 술병이 놓여 있다. 선장의 것이리라.');
          gg.setFlag('got:brandy2');
          await gg.giveItem('brandy2');
        } else await gg.say('물이 반쯤 찬 세면기. 수면에 내 얼굴이 비친다. 이틀은 못 잔 얼굴이다.');
      },
    });
    b.interact({
      id: 'safe',
      x: 2.05,
      z: 3.95,
      r: 1.15,
      label: '금고',
      onAction: async (gg) => {
        if (!gg.flag('safeOpen')) {
          await gg.say('무쇠 금고. 세 개의 다이얼이 달린 번호 자물쇠다.');
          gg.player.face(2.55, 3.95);
          gg.cutTo(SAFE_CAM);
          await gg.openPanel('safe');
          gg.cutTo(null);
          if (!gg.flag('safeOpen')) return;
          const d = gg.room.get('safe')?.getObjectByName('safeDoor');
          for (let i = 0; i <= 20; i++) {
            if (d) d.rotation.y = -1.9 * (i / 20);
            await gg.wait(1 / 40);
          }
        }
        if (!gg.flag('got:captainLog')) {
          gg.setFlag('got:captainLog');
          gg.setFlag('got:crank');
          const inside = gg.room.get('safeInside');
          if (inside) inside.visible = false;
          gg.player.pose('crouch');
          await gg.giveItem('crank', { silent: true });
          await gg.giveItem('captainLog', { silent: true });
          await gg.say('금고 안에는 초록 천으로 장정한 공식 항해일지와, T자형 쇠 핸들이 들어 있었다.', '공식 항해일지와 수밀문 개폐 핸들을 얻었다.');
          await gg.readDoc('captainLog');
          return;
        }
        await gg.say('금고는 비어 있다.');
      },
    });
  },
};
