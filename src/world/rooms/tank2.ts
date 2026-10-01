import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import { mesh, ring, rod } from '../../render/geo';
import * as P from '../props';
import { look, rect } from './common';

const R = 5.2;
const H = 3.4;
const SEGS = 20;
const CONE = { x: 0, z: 0, r: 0.95 };

// Cable tank No.2, pumped out: you stand on the bottom of the tank itself. A ring of steel wall, the cone in
// the middle, the cable flaked round it in wet coils, and one bight of it rising taut through the hatch to
// the cable engine on deck. The master came down here to saw through it.
export const tank2: RoomDef = {
  id: 'tank2',
  name: '2번 케이블 탱크',
  fog: { color: 0x020404, density: 0.09 },
  hemi: { sky: 0x3c5a54, ground: 0x0e1414, intensity: 1.6 },
  grade: { saturation: 0.7, tint: 0xe2f0e8 },
  ambience: 'hold',
  surface: 'metal',
  bounds: rect(-R, -R, R, R),
  spawns: { fromHold: { x: 4.3, z: 0, h: -Math.PI / 2 } },
  cameras: [
    // From the tank wall, off to one side of the cone, so the cone never stands between camera and player.
    { id: 'east', pos: [1.2, 3.0, -4.85], look: [3.0, 0.4, 1.6], fov: 64, zones: [rect(0.3, -R, R, R)] },
    { id: 'west', pos: [-1.2, 3.0, 4.85], look: [-3.0, 0.4, -1.6], fov: 64, zones: [rect(-R, -R, 0.3, R)] },
  ],
  build(b, g) {
    // Tank bottom with a skin of black water.
    const floor = mesh(new THREE.CircleGeometry(R + 0.2, 32), M.rust);
    floor.rotation.x = -Math.PI / 2;
    b.staticRoot.add(floor);
    const slick = mesh(new THREE.CircleGeometry(R - 0.1, 32), M.water);
    slick.rotation.x = -Math.PI / 2;
    slick.position.y = 0.03;
    slick.name = 'slick';
    b.add(slick, 0, 0.03, 0, 0, { dynamic: true, name: 'slick' });
    slick.rotation.x = -Math.PI / 2;
    // The tank wall as a ring of plates (also the walls the camera keeps inside).
    for (let i = 0; i < SEGS; i++) {
      const a0 = (i / SEGS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGS) * Math.PI * 2;
      b.wall(Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R, { h: H, mat: M.steel, t: 0.14 });
    }
    // Deckhead with the hatch the cable rises through.
    b.ceiling(-R, -R, R, R, H, M.steelDark);
    const hatchHole = mesh(new THREE.PlaneGeometry(1.8, 1.8), M.void);
    hatchHole.rotation.x = Math.PI / 2;
    hatchHole.position.set(0, H - 0.01, 3.0);
    b.staticRoot.add(hatchHole);
    // Crinoline frame under the deckhead (the cage that guides the cable out of the tank).
    const crin = new THREE.Group();
    ring(crin, M.ironLight, 0, H - 0.5, 0, 2.6, 0.04, 20).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rod(crin, M.ironLight, { x: Math.cos(a) * 2.6, y: H - 0.5, z: Math.sin(a) * 2.6 }, { x: Math.cos(a) * 4.8, y: H - 0.05, z: Math.sin(a) * 4.8 }, 0.035, 4);
    }
    b.add(crin, 0, 0, 0, 0);
    // Cone and the flaked cable round it.
    const cone = mesh(new THREE.CylinderGeometry(0.4, CONE.r, 2.4, 14), M.steelDark);
    cone.position.y = 1.2;
    b.staticRoot.add(cone);
    b.circle(CONE.x, CONE.z, CONE.r + 0.05);
    for (let k = 0; k < 6; k++) {
      const rr = 1.35 + k * 0.42;
      for (let layer = 0; layer < 2; layer++) {
        const t = ring(b.staticRoot, M.cable, 0, 0.09 + layer * 0.13, 0, rr + layer * 0.05, 0.07, 28);
        t.rotation.x = Math.PI / 2;
      }
    }
    // The bight that leads up to the drum: taut, trembling.
    const bight = new THREE.Group();
    rod(bight, M.cable, { x: 1.6, y: 0.25, z: 1.4 }, { x: 0.3, y: H + 0.4, z: 3.0 }, 0.07, 6);
    b.add(bight, 0, 0, 0, 0, { dynamic: true, name: 'bight' });
    // Ladder down from the manhole by the door to tank No.1.
    b.add(P.ladder(H, 0.5), R - 0.12, 0, 0, -Math.PI / 2);
    // The master: slumped against the cone, his cap beside him, until we come near.
    if (!g.flag('a2.captainRose')) {
      const body = P.drownedMaster();
      b.add(body, 0, 0, -1.25, Math.PI, { dynamic: true, name: 'master' });
    }
    // His hacksaw, blade snapped, and the key he tied to the cone ladder.
    const saw = new THREE.Group();
    rod(saw, M.ironLight, { x: -0.25, y: 0.03, z: 0 }, { x: 0.25, y: 0.03, z: 0 }, 0.01, 4);
    rod(saw, M.woodDark, { x: 0.25, y: 0.03, z: 0 }, { x: 0.38, y: 0.03, z: 0.08 }, 0.02, 4);
    b.add(saw, -1.2, 0.04, -1.6, 0.7);
    if (!g.flag('got:brakeKey')) {
      const key = P.bigKeyItem();
      key.name = 'keyOnCone';
      b.add(key, 0.45, 1.05, -0.85, 0.3, { dynamic: true });
    }

    // Light: the drowned green glow from the coils, a lamp swinging in the hatch.
    b.light({ x: 0, y: 0.3, z: 0, color: 0x2f9a74, intensity: 10, distance: 12, flicker: 0.6 });
    b.add(P.cageLamp('bulbK1', true), 0.4, H, 2.6, 0, { dynamic: true, name: 'hatchLamp' });
    b.light({ x: 0.4, y: H - 0.5, z: 2.6, color: 0xffd6a0, intensity: 7, distance: 9, needsPower: true, flicker: 0.4 });
    b.light({ x: 4.0, y: 2.6, z: 0, color: 0x7f98a8, intensity: 5, distance: 7 });
    b.light({ x: -3.2, y: 2.4, z: -2.4, color: 0x5f8078, intensity: 3, distance: 6 });

    // ---- interactions
    b.interact({
      id: 'ladder',
      x: R - 0.6,
      z: 0,
      r: 1.2,
      label: '사다리 (1번 탱크로)',
      verb: '오르내리기',
      onAction: async (gg) => {
        await gg.goto('hold', 'fromTank2', 'ladder');
      },
    });
    b.interact({
      id: 'brakeKey',
      x: 0.75,
      z: -1.0,
      r: 1.2,
      cone: 1.6,
      label: '원뿔 사다리에 묶인 꾸러미',
      enabled: (gg) => !gg.flag('got:brakeKey'),
      onAction: async (gg) => {
        gg.player.pose('reach');
        await gg.wait(0.4);
        gg.setFlag('got:brakeKey');
        const k = gg.room.get('keyOnCone');
        if (k) k.visible = false;
        await gg.say('원뿔 사다리 가로대에 방수포 꾸러미가 끈으로 묶여 있다. 물에 빠져도 잃어버리지 않도록 단단히.', '안에는 묵직한 열쇠와, 접힌 편지 한 장.');
        await gg.giveItem('brakeKey');
        await gg.giveItem('haleLetter', { silent: true });
        await gg.readDoc('haleLetter');
      },
    });
    look(b, 'coils', -3.0, 1.6, '케이블 사리', ['원뿔을 감고 겹겹이 사려진 케이블. 거터퍼카 피복이 검게 번들거린다.', '사리 사이사이에 작은 게와 따개비가… 아니, 따개비가 아니다. 이빨이다.'], 1.4);
    look(b, 'bight', 1.2, 1.9, '위로 뻗은 케이블', ['사리에서 한 가닥이 해치를 지나 갑판의 권양기로 곧게 올라간다.', '손을 대자 케이블이 윙윙 울린다. 저 위, 저 바깥, 저 아래에서 무언가 당기고 있다.'], 1.2);
    look(b, 'saw', -1.2, -1.6, '부러진 쇠톱', ['날이 두 동강 난 쇠톱. 케이블의 강철 외장선에 이가 몽땅 나가 있다.', '선장은 이걸로 케이블을 끊으려 했다.'], 1.0);
  },
  onEnter(g) {
    if (!g.flag('tank2Seen')) {
      g.setFlag('tank2Seen');
      void (async () => {
        await g.wait(0.7);
        await g.say(
          '2번 케이블 탱크. 물이 빠진 바닥에 검은 물이 얕게 깔려 있다.',
          '원뿔 아래, 누군가 등을 기대고 앉아 있다. 금줄 두른 모자가 옆에 떨어져 있다.',
          '…헤일 선장이다.',
        );
      })();
    }
  },
  update(g, room, _dt, t) {
    const bight = room.get('bight');
    if (bight) bight.position.x = Math.sin(t * 13) * 0.006;
    const lamp = room.get('hatchLamp');
    if (lamp) lamp.rotation.z = Math.sin(t * 0.8) * 0.12;
    // Coming near the cone wakes him.
    if (!g.flag('a2.captainRose')) {
      const d = Math.hypot(g.player.x - 0, g.player.z - -1.25);
      if (d < 3.0) {
        g.setFlag('a2.captainRose');
        const body = room.get('master');
        if (body) body.visible = false;
        g.sfx('stinger', { volume: 1 });
        g.shake(0.12, 1.2);
        g.spawnCreature({ id: 'a2captain', x: 0, z: -1.7, h: Math.PI, hp: 6, entrance: 'rise', speed: 1.0, variant: 'captain', strength: 2 });
        g.note('헤일 선장이… 일어선다');
      }
    }
  },
};
