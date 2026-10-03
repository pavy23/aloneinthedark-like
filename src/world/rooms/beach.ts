import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import { mesh, rod } from '../../render/geo';
import * as P3 from '../props3';
import { exit, look, rect } from './common';
import { armed, candleLeft, coilWait, fireCoil, withPell } from '../../game/act3';

/** The shore end, from the hut's floor to the sea bed (x, y, z). */
const SHORE_END: Array<[number, number, number]> = [
  [2.4, 0.06, 3.95],
  [2.55, 0.06, 6.0],
  [2.7, -0.1, 7.4],
  [2.9, -1.4, 10],
];

/** Where the limb comes up: where the cable goes into the sea. */
const LIMB_AT = { x: 2.7, z: 7.1 };

// The beach below the station: x -9..9, z -6..7.6, the sea beyond. The cable hut stands at (2, 2.5) with its
// doorway facing the water; the shore end runs from its floor down the shingle and into the sea.
export const beach: RoomDef = {
  id: 'beach',
  name: '해변의 케이블 오두막',
  outdoor: true,
  fog: { color: 0x1a2028, density: 0.055 },
  hemi: { sky: 0x62748c, ground: 0x2a2c30, intensity: 1.4 },
  moon: { color: 0xa0b2cc, intensity: 0.8, dir: [-0.3, 1, 0.5] },
  grade: { saturation: 0.6, tint: 0xe2eaf4 },
  ambience: 'shore',
  surface: 'shingle',
  bounds: rect(-9, -6, 9, 7.6),
  spawns: {
    fromStation: { x: -7.6, z: -2, h: Math.PI / 2 },
  },
  cameras: [
    { id: 'path', pos: [-8.7, 3.6, -5.6], look: [0.5, 0.6, 3.5], fov: 55, zones: [rect(-9, -6, -2, 7.6)] },
    { id: 'hut', pos: [-1.9, 4.4, -5.4], look: [3.0, 0.6, 4.6], fov: 55, zones: [rect(-2.2, -6, 9, 4.0)] },
    { id: 'shore', pos: [8.4, 3.4, 0.6], look: [0.8, 1.0, 6.4], fov: 56, zones: [rect(-2.2, 3.95, 9, 7.6)] },
    { id: 'hutIn', pos: [0.75, 2.25, 1.5], look: [3.0, 0.9, 3.4], fov: 64, zones: [rect(0.45, 1.25, 3.55, 3.75)], priority: 2 },
  ],
  build(b, g) {
    b.floor(-24, -24, 24, 7.7, M.shingle);
    // The sea, and a line of foam where it meets the shingle.
    const sea = mesh(new THREE.PlaneGeometry(120, 80, 1, 1), M.sea);
    const uv = sea.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i) * 14);
    b.add(sea, 0, -0.22, 47.4, 0, { dynamic: true, name: 'sea' });
    sea.rotation.x = -Math.PI / 2;
    b.box(0, -0.2, 7.55, 60, 0.04, 0.35, M.snow);
    for (const [x, z, w, d] of [
      [-3.2, 9.4, 1.2, 0.8],
      [5.2, 11.5, 1.6, 1.0],
      [0.4, 14, 1.0, 0.7],
    ] as const)
      b.add(P3.iceFloe(w, d), x, -0.2, z, x);
    // The cliff behind the beach, rocks, drifts.
    b.box(0, 0, -7.4, 30, 4.2, 2.6, M.concrete);
    b.box(0, 4.2, -7.4, 30, 0.25, 2.8, M.snow);
    for (const [x, z, r, s] of [
      [-7.6, 5.6, 0.8, 4],
      [7.8, 5.9, 0.7, 5],
      [6.6, -4.6, 0.9, 6],
      [-2.2, -5.2, 0.7, 7],
      [8.3, 1.5, 0.6, 8],
    ] as const) {
      b.add(P3.rock(r, s), x, 0, z, s);
      b.circle(x, z, r * 0.9);
    }
    for (const [x, z, w, d, h] of [
      [-6.0, -5.0, 3.0, 1.4, 0.5],
      [3.8, -5.2, 3.4, 1.2, 0.45],
    ] as const)
      b.add(P3.snowDrift(w, d, h), x, 0, z, 0);
    b.seg(-9.5, 7.6, 9.5, 7.6);
    b.seg(-9.5, -6, -9.5, 7.6);
    b.seg(9.5, -6, 9.5, 7.6);
    b.seg(-9.5, -6, 9.5, -6);

    // The cable hut (scaled up a little from the prop) with its walls as colliders.
    b.add(P3.cableHut(), 2, 0, 2.5, 0, { scale: 1.3 });
    b.footprint(2, 1.2, 3.38, 0.26);
    b.footprint(0.44, 2.5, 0.26, 2.86);
    b.footprint(3.56, 2.5, 0.26, 2.86);
    b.footprint(0.895, 3.8, 1.17, 0.26);
    b.footprint(3.105, 3.8, 1.17, 0.26);
    // The superintendent, against the back wall.
    b.add(P3.frozenBody(), 1.0, 0, 1.75, 0.45);
    b.circle(1.0, 1.85, 0.35);
    // The shore end down the shingle into the sea, and the discharge that will run along it.
    b.add(P3.shoreCable(SHORE_END), 0, 0, 0, 0);
    const arc = new THREE.Group();
    for (let i = 0; i < SHORE_END.length - 1; i++) {
      const [ax, ay, az] = SHORE_END[i];
      const [bx, by, bz] = SHORE_END[i + 1];
      rod(arc, M.arc, { x: ax, y: ay + 0.05, z: az }, { x: bx, y: by + 0.05, z: bz }, 0.11, 6);
    }
    arc.visible = false;
    b.add(arc, 0, 0, 0, 0, { dynamic: true, name: 'arcLine' });

    // The land line on its poles, down from the station to the hut's back wall.
    const poles: Array<[number, number]> = [
      [-8.0, -4.6],
      [-3.4, -3.8],
      [-0.9, 0.2],
    ];
    for (const [x, z] of poles) {
      b.add(P3.telegraphPole(5.0), x, 0, z, 0.25);
      b.circle(x, z, 0.2);
    }
    const wires = new THREE.Group();
    const top = (x: number, z: number) => new THREE.Vector3(x - 0.2, 4.73, z);
    P3.sagWire(wires, new THREE.Vector3(-16, 7, -8), top(...poles[0]), 0.6);
    P3.sagWire(wires, top(...poles[0]), top(...poles[1]), 0.5);
    P3.sagWire(wires, top(...poles[1]), top(...poles[2]), 0.45);
    P3.sagWire(wires, top(...poles[2]), new THREE.Vector3(2.0, 2.4, 1.05), 0.3);
    b.add(wires, 0, 0, 0, 0);

    // An upturned dory on the shingle.
    b.add(P3.dory(), -4.6, 0, 4.2, 0.35);
    b.footprint(-4.6, 4.2, 1.3, 3.7, 0.35);

    const snow = P3.snowfall(1200, 24, 8, 18);
    b.add(snow, 0, 0, 1, 0, { dynamic: true, name: 'snow' });

    // Light: a storm lantern left burning in the hut; the rest is the sky. When the thing comes up, the surf
    // round it glows a cold green (the light stays at zero until then).
    b.light({ x: 2.6, y: 1.6, z: 2.2, color: 0xffb066, intensity: 4, distance: 5, flicker: 0.35 });
    b.light({ x: 2.4, y: 1.2, z: 5.6, color: 0x7ab0a8, intensity: 0, distance: 8, flicker: 0.3, name: 'surfGlow' });

    // ---- interactions
    exit(b, { id: 'path', x: -8.3, z: -2, r: 1.4, label: '역으로 올라가는 길', to: 'station', spawn: 'fromBeach', sfx: 'none' });
    b.interact({
      id: 'hutKey',
      x: 3.1,
      z: 2.95,
      r: 1.05,
      cone: 1.6,
      label: '육선 키',
      onAction: async (gg) => {
        if (!gg.flag('a3.hutKeySeen')) {
          gg.setFlag('a3.hutKeySeen');
          await gg.say('선반 위의 육선 키. 역의 회선 전환반까지 곧장 이어진다.', '소장의 마지막 글씨가 떠오른다. 오두막의 키는 ·−· 로 —');
        }
        gg.setFlag('a3.fireNow', false);
        await gg.openPanel('hutKey');
        if (!gg.flag('a3.fireNow')) return;
        gg.setFlag('a3.fireNow', false);
        // Pell fires as soon as the coil will (it may still be cooling from a test).
        const wait = coilWait(gg);
        if (wait > 0) await gg.wait(wait);
        await fireCoil(gg, 'pell');
      },
    });
    look(b, 'terminal', 2.0, 1.6, '단자반', [
      '두꺼운 해저선의 끝이 바닥을 뚫고 올라와 단자반에 물려 있다. 여기서 육선으로 갈아타고 역까지 올라간다.',
      '단자 주위의 콘크리트 바닥이 젖어 있다. 바닷물이 케이블을 타고 올라온 것처럼.',
    ], 1.1);
    look(b, 'body', 1.2, 2.3, '소장의 시신', (gg) => [
      'R. 커크패트릭 소장. 오두막 벽에 기대앉은 채 얼어붙어 있다. 성에가 수염에 하얗게 앉았다.',
      '오른손 검지가 키 쪽으로 뻗어 있다. 마지막까지 무언가를 보내려 했다.',
      ...(withPell(gg) ? ['펠이 들었다는 R은 — 이 손이 보낸 것이 아니었을 것이다. 적어도, 마지막 며칠의 것은.'] : []),
    ], 1.1);
    look(b, 'dory', -4.6, 2.4, '엎어 놓은 도리선', ['겨울 동안 엎어 둔 작은 배. 바닥에 눈이 쌓였다.', '배 밑에서 무언가 긁는 소리가 난 것 같다. …바람 소리다.']);
    look(b, 'landing', 2.55, 5.9, '케이블이 바다로 들어가는 곳', [
      '팔뚝만 한 외장 케이블이 자갈을 가르고 바다로 들어간다. 해안 구간이라 철선 외장이 가장 두껍다.',
      '파도가 케이블을 핥을 때마다, 쇠가 우는 듯한 낮은 소리가 난다.',
    ], 1.3);
  },
  onEnter(g, _room, from) {
    g.setFlag('a3.limbUp', false);
    if (!g.flag('a3.beachSeen')) {
      g.setFlag('a3.beachSeen');
      void (async () => {
        await g.wait(0.6);
        await g.say(
          '해변. 자갈 위로 눈이 얇게 덮였다. 콘크리트 오두막 하나, 거기서 굵은 케이블이 바다로 기어 들어간다.',
          '바다가 이상하게 잔잔하다. 파도가 자갈을 끄는 소리가, 무언가 숨 쉬는 소리처럼 들린다.',
        );
      })();
    }
    if (g.flag('a3.done')) return;
    if (!armed(g)) {
      // Before anything is set to fire, only the drowned come up from the surf.
      g.spawnCreature({ id: 'a3beach0', x: -1.6, z: 7.1, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.05, delay: from === 'fromStation' ? 5 : 2 });
      return;
    }
    // Something is set to fire: it comes up to meet whoever stands at the hut.
    g.setFlag('a3.limbUp', true);
    g.spawnCreature({ id: 'a3limb', x: LIMB_AT.x, z: LIMB_AT.z, h: Math.PI, hp: 99, entrance: 'rise', variant: 'limb', strength: 2, speed: 0 });
    g.spawnCreature({ id: 'a3beach1', x: 0.2, z: 7.2, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.1, delay: 4 });
    g.spawnCreature({ id: 'a3beach2', x: 5.4, z: 7.1, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.05, delay: 14 });
    void (async () => {
      g.sfx('tentacle', { volume: 1.2 });
      g.shake(0.22, 2.4);
      if (!g.flag('a3.limbSeen')) {
        g.setFlag('a3.limbSeen');
        await g.wait(1.6);
        await g.say(
          '바다가 부풀어 오른다. 케이블이 물에 잠기는 자리에서, 검고 번들거리는 것이 솟아오른다.',
          '사람 몸통만 한 굵기의 — 팔. 케이블을 칭칭 감은 채로.',
        );
      }
      if (g.flag('a3.done')) return;
      const left = candleLeft(g);
      if (withPell(g) && g.flag('a3.pellReady')) g.note('오두막의 키로 펠에게 신호를');
      else if (left > 0) g.note(`양초가 끈을 태우기까지 약 ${Math.max(5, Math.round(left / 5) * 5)}초 — 버텨야 한다`);
    })();
  },
  update(g, room, dt, t) {
    const glow = room.lights.find((l) => l.name === 'surfGlow');
    if (glow) {
      const want = g.flag('a3.limbUp') && !g.flag('a3.done') ? 10 : 0;
      glow.intensity += (want - glow.intensity) * Math.min(1, dt * 0.8);
    }
    const sea = room.get<THREE.Mesh>('sea');
    if (sea) {
      const m = sea.material as THREE.MeshLambertMaterial;
      if (m.map) {
        m.map.offset.x = (t * 0.003) % 1;
        m.map.offset.y = (t * 0.008) % 1;
      }
      sea.position.y = -0.22 + Math.sin(t * 0.5) * 0.04;
    }
    const snow = room.get<THREE.Points>('snow');
    if (snow) P3.stepSnow(snow, dt, t, 0.9);
  },
};
