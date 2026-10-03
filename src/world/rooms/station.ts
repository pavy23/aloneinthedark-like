import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import * as P3 from '../props3';
import { exit, look, pickup, rect } from './common';
import { withPell } from '../../game/act3';

// The station yard at Bell Cove, at night, in falling snow: x -10..10, z -9..6. The station house closes the
// yard to the north (its door at x=0), the superintendent's house to the west, the fence and the gate the
// sleigh left by to the south; the path down to the beach leaves to the east, along the telegraph poles.
export const station: RoomDef = {
  id: 'station',
  name: '벨 코브 양륙국 마당',
  outdoor: true,
  fog: { color: 0x1c232c, density: 0.058 },
  hemi: { sky: 0x667890, ground: 0x30343a, intensity: 1.45 },
  moon: { color: 0xa4b4cc, intensity: 0.75, dir: [0.4, 1, -0.3] },
  grade: { saturation: 0.6, tint: 0xe4ecf6 },
  ambience: 'snow',
  surface: 'snow',
  bounds: rect(-10, -9, 10, 6),
  spawns: {
    arrive: { x: -1, z: -7.2, h: 0 },
    fromOps: { x: 0, z: 4.75, h: Math.PI },
    fromBeach: { x: 8.7, z: -1, h: -Math.PI / 2 },
  },
  cameras: [
    { id: 'gate', pos: [5.6, 4.8, -10.8], look: [-2.5, 0.8, 1.2], fov: 55, zones: [rect(-10, -9, 10, -3.4)] },
    { id: 'door', pos: [-5.6, 4.6, -5.8], look: [1.0, 1.1, 5.4], fov: 55, zones: [rect(-10, -3.6, 3.0, 6)] },
    { id: 'east', pos: [-1.2, 4.6, -2.4], look: [8.6, 0.8, 1.2], fov: 55, zones: [rect(2.8, -3.6, 10, 6)] },
  ],
  build(b, g) {
    const pell = withPell(g);
    b.floor(-24, -24, 24, 24, M.snow);

    // ---- the station house (operating room and battery room behind this wall)
    const H = 3.2;
    b.wall(-6.5, 6, 6.5, 6, { h: H, mat: M.clapboard, t: 0.2, gaps: [{ at: 6.5, w: 1.0, h: 2.1 }] });
    b.wall(-6.5, 6, -6.5, 9.6, { h: H, mat: M.clapboard, t: 0.2 });
    b.wall(6.5, 6, 6.5, 9.6, { h: H, mat: M.clapboard, t: 0.2 });
    b.wall(-6.5, 9.6, 6.5, 9.6, { h: H, mat: M.clapboard, t: 0.2 });
    b.add(P3.gableRoof(13, 3.6, 1.7), 0, H, 7.8, 0);
    b.add(P3.houseDoor(0.9, 2.0), 0, 0, 5.9, Math.PI);
    b.box(0, 0, 5.55, 1.7, 0.16, 0.7, M.woodDark);
    b.add(P3.letteredBoard(['ALBION ATLANTIC TELEGRAPH CO.', 'BELL COVE'], 2.6, 0.5), 0, 2.35, 5.88, Math.PI);
    // Operating-room windows west of the door; the battery room's east. A lamp still burns in one of them.
    b.add(P3.houseWindow(0.9, 1.1, false), -3.4, 1.0, 5.88, Math.PI);
    b.add(P3.houseWindow(0.9, 1.1, false), -1.6, 1.0, 5.88, Math.PI);
    b.add(P3.houseWindow(0.9, 1.1, true), 3.4, 1.0, 5.88, Math.PI);
    b.light({ x: 3.4, y: 1.5, z: 5.2, color: 0xffb066, intensity: 4, distance: 6, flicker: 0.25 });
    // Chimney with no smoke.
    b.box(-4.2, H + 0.6, 8.2, 0.5, 1.6, 0.5, M.concrete);

    // ---- the superintendent's house (dark, locked)
    b.wall(-7.2, -4.2, -7.2, 2.2, { h: 2.8, mat: M.clapboardRed, t: 0.2, gaps: [{ at: 3.2, w: 0.95, h: 2.0 }] });
    b.wall(-7.2, -4.2, -11, -4.2, { h: 2.8, mat: M.clapboardRed, t: 0.2 });
    b.wall(-7.2, 2.2, -11, 2.2, { h: 2.8, mat: M.clapboardRed, t: 0.2 });
    b.add(P3.gableRoof(6.4, 3.8, 1.4), -9.1, 2.8, -1.0, Math.PI / 2);
    b.add(P3.houseDoor(0.9, 2.0, M.woodDark), -7.1, 0, -1.0, Math.PI / 2);
    b.add(P3.houseWindow(0.8, 1.0, false), -7.08, 1.0, -3.0, Math.PI / 2);
    b.add(P3.houseWindow(0.8, 1.0, false), -7.08, 1.0, 1.0, Math.PI / 2);

    // ---- yard: woodpile and chopping block by the house wall, sleigh, lamp post, drifts
    b.add(P3.woodpile(), -4.9, 0, 5.3, 0);
    b.footprint(-4.9, 5.3, 1.9, 1.0);
    b.add(P3.choppingBlock(), -3.3, 0, 3.6, 0);
    b.circle(-3.3, 3.6, 0.3);
    b.add(P3.sleigh(), 5.0, 0, -5.4, 0.35);
    b.footprint(5.0, -5.4, 1.1, 2.3, 0.35);
    b.add(P3.lampPost(), 2.2, 0, 2.4, 0, { dynamic: true, name: 'lampPost' });
    b.circle(2.2, 2.4, 0.15);
    b.light({ x: 2.55, y: 2.15, z: 2.4, color: 0xffb46a, intensity: 7, distance: 10, flicker: 0.3 });
    for (const [x, z, w, d, h] of [
      [-8.6, -7.6, 3.2, 1.6, 0.5],
      [8.4, 4.6, 2.4, 1.6, 0.45],
      [2.6, -8.3, 3.0, 1.0, 0.35],
      [-6.0, 4.4, 1.6, 0.9, 0.3],
      [6.0, 5.2, 1.8, 0.9, 0.4],
    ] as const) {
      b.add(P3.snowDrift(w, d, h), x, 0, z, 0);
      b.footprint(x, z, w * 0.8, d * 0.8);
    }
    for (const [x, z, r, s] of [
      [-9.4, -2.4, 0.7, 1],
      [9.3, 5.4, 0.6, 2],
      [-9.6, 4.6, 0.8, 3],
    ] as const) {
      b.add(P3.rock(r, s), x, 0, z, s);
      b.circle(x, z, r * 0.9);
    }

    // ---- fence and gate (south), fence stubs either side of the house (north)
    b.add(P3.fenceRun(7.8), -6.1, 0, -9, 0);
    b.add(P3.fenceRun(9.8), 5.1, 0, -9, 0);
    b.add(P3.fenceRun(3.3), -8.6, 0, 6, 0);
    b.add(P3.fenceRun(3.3), 8.3, 0, 6, 0);
    for (const x of [-2.25, 0.25]) b.box(x, 0, -9, 0.16, 1.5, 0.16, M.woodDark);
    b.seg(-10.5, -9, 10, -9);
    b.seg(-10.5, 6, -6.5, 6);
    b.seg(6.5, 6, 10, 6);
    b.seg(-10.5, -9, -10.5, 6);
    b.seg(10, -9, 10, 6);

    // ---- the telegraph line: from the house's east gable over two poles, east to the beach
    const poles: Array<[number, number]> = [
      [7.4, 3.9],
      [9.3, -3.4],
    ];
    const wires = new THREE.Group();
    const top = (x: number, z: number, i: number) => new THREE.Vector3(x - 0.6 + i * 0.4, 5.33, z);
    for (const [x, z] of poles) {
      b.add(P3.telegraphPole(5.6), x, 0, z, 0.3);
      b.circle(x, z, 0.2);
    }
    for (let i = 0; i < 2; i++) {
      P3.sagWire(wires, new THREE.Vector3(6.6, 2.9 - i * 0.2, 7.2), top(poles[0][0], poles[0][1], i + 1), 0.4);
      P3.sagWire(wires, top(poles[0][0], poles[0][1], i + 1), top(poles[1][0], poles[1][1], i + 1), 0.5);
      P3.sagWire(wires, top(poles[1][0], poles[1][1], i + 1), new THREE.Vector3(16, 4.2, -9), 0.6);
    }
    b.add(wires, 0, 0, 0, 0);

    // Snow, falling (animated).
    const snow = P3.snowfall(1400, 28, 9, 22);
    b.add(snow, 0, 0, -1.5, 0, { dynamic: true, name: 'snow' });

    // ---- interactions
    exit(b, { id: 'stationDoor', x: 0, z: 5.25, label: '역사 문 (통신실로)', to: 'opsroom', spawn: 'fromYard' });
    exit(b, { id: 'beachPath', x: 9.25, z: -1, r: 1.4, label: '해변으로 내려가는 길', to: 'beach', spawn: 'fromStation', sfx: 'none' });
    exit(b, {
      id: 'gate',
      x: -1,
      z: -8.4,
      label: '대문 (마을 길로)',
      to: 'station',
      spawn: 'arrive',
      locked: () => ['썰매는 이미 떠났다. 마을까지는 눈길로 반나절이다.', '지금 돌아갈 수는 없다. 저 안에 무엇이 있는지 봐야 한다.'],
    });
    exit(b, {
      id: 'house',
      x: -6.6,
      z: -1.0,
      label: '소장 관사',
      to: 'station',
      spawn: 'arrive',
      locked: (gg) =>
        gg.flag('got:stationDiary')
          ? ['잠겨 있다. 일지의 주인은 2월 21일 밤 이 문을 나서서 돌아오지 않았다.']
          : ['소장 관사. 문이 잠겨 있다.', '창 너머로 식탁에 접시 두 개가 그대로 놓여 있다. 저녁을 먹다 만 채로.'],
    });
    pickup(b, g, {
      item: 'woodAxe',
      x: -3.3,
      y: 0.52,
      z: 3.6,
      ry: 0.6,
      label: '장작 도끼',
      text: ['도끼날이 모탕에 박힌 채 얼어붙어 있다. 힘껏 비틀어 뽑았다.'],
    });
    look(b, 'woodpile', -4.9, 4.5, '장작더미', ['처마 밑에 가지런히 쌓인 장작. 눈이 두껍게 덮였다.', '며칠째 아무도 장작을 가져가지 않았다. 굴뚝에도 연기가 없다.']);
    look(b, 'sleigh', 5.0, -4.2, '썰매', ['역에서 쓰는 썰매. 끌채가 눈 속에 처박혀 있다.', '말은 없다. 마구간 쪽 발자국은 모두 바깥으로 달아나 있다.']);
    look(b, 'lamp', 2.2, 2.9, '가로등', ['기름 등이 아직 타고 있다. 누군가 채워 둔 것이다. 엿새 넘게 탈 수는 없을 텐데.'], 1.0);
    look(b, 'poles', 8.0, 2.8, '전신주', ['역사에서 나온 전선이 전신주를 타고 해변 쪽으로 내려간다.', '해변의 케이블 오두막까지 이어지는 육선이다. 거기서 해저선과 만난다.'], 1.3);
    look(b, 'litWindow', 3.4, 5.2, pell ? '불 켜진 창' : '창', (gg) =>
      withPell(gg)
        ? ['축전지실 창에 불빛이 있다. 커튼 틈으로 그림자가 한 번 움직였다.']
        : ['축전지실 창에 불빛이 있다. 램프 하나가 타고 있을 뿐, 움직이는 것은 없다.'],
    );
  },
  onEnter(g, _room, from) {
    if (from === 'arrive' && !g.flag('a3.arrived')) {
      g.setFlag('a3.arrived');
      void (async () => {
        await g.wait(0.8);
        await g.say(
          '벨 코브 양륙국. 하얀 판자벽의 단층 역사와 붉은 소장 관사, 그리고 해변으로 내려가는 전신주.',
          '굴뚝에 연기가 없다. 그런데 역사 창문 하나에 불빛이 있다.',
          ...(withPell(g) ? ['펠이 여기 있다면, 저 불빛 아래일 것이다.'] : []),
        );
        g.note('역사로 들어가 보자');
      })();
    }
    // Once the battery room has been opened, one of the station's dead comes up from the beach path.
    if (g.flag('a3.batterySeen') && from !== 'arrive') {
      g.spawnCreature({ id: 'a3yard1', x: 9.2, z: 0.6, h: -Math.PI / 2, hp: 3, speed: 1.1, delay: from === 'fromBeach' ? 4 : 1.5 });
    }
  },
  update(_g, room, dt, t) {
    const snow = room.get<THREE.Points>('snow');
    if (snow) P3.stepSnow(snow, dt, t, 0.7);
    const flame = room.get('lampPost')?.getObjectByName('flame');
    if (flame) flame.scale.y = 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05;
  },
};
