import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import { mesh, part, ring, rod } from '../../render/geo';
import * as P from '../props';
import { look, rect } from './common';

const TANK_R = 5.0;
const RIM_R = 5.28;
const WATER_Y = -0.7;
const PLANK_HALF = 0.33;

// No.1 cable tank: x -7.5..7.5, z -7.5..7.5. A flooded circular tank fills the middle; a plank leads
// from the east rim to the central cone, where the thing that came up with the cable waits.
export const hold: RoomDef = {
  id: 'hold',
  name: '1번 케이블 탱크',
  fog: { color: 0x020405, density: 0.075 },
  hemi: { sky: 0x4e6c66, ground: 0x121818, intensity: 1.6 },
  grade: { saturation: 0.72, tint: 0xe6f2ea },
  ambience: 'hold',
  surface: 'metal',
  bounds: rect(-7.5, -7.5, 7.5, 7.5),
  spawns: { fromEngine: { x: 6.6, z: -3.5, h: -Math.PI / 2 } },
  cameras: [
    { id: 'entry', pos: [-6.9, 4.4, 6.9], look: [3.6, 0.3, -2.8], fov: 52, zones: [rect(4.2, -7.5, 7.5, 0.6)] },
    { id: 'plank', pos: [6.9, 2.3, 2.2], look: [0.2, 0.9, -0.4], fov: 52, zones: [rect(0.4, -0.5, 5.35, 0.5)], priority: 3 },
    { id: 'north', pos: [6.9, 4.4, -6.9], look: [-2.2, 0.2, 3.4], fov: 54, zones: [rect(-7.5, 0.3, 7.5, 7.5)] },
    { id: 'west', pos: [6.9, 4.4, 6.9], look: [-3.4, 0.2, -2.2], fov: 54, zones: [rect(-7.5, -7.5, -0.2, 0.9)] },
    { id: 'south', pos: [-6.9, 4.4, 6.9], look: [1.2, 0.2, -4.6], fov: 54, zones: [rect(-0.8, -7.5, 4.6, -3.4)] },
  ],
  build(b, g) {
    const H = 5.2;
    // Walkway floor: a ring around the tank opening (outer part hidden behind the walls).
    const fl = new THREE.RingGeometry(TANK_R + 0.05, 11, 40, 1);
    const uv = fl.getAttribute('uv') as THREE.BufferAttribute;
    const pos = fl.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
    const floor = mesh(fl, M.chequer);
    floor.rotation.x = -Math.PI / 2;
    b.staticRoot.add(floor);
    b.ceiling(-7.5, -7.5, 7.5, 7.5, H, M.steelDark);
    b.wall(-7.5, -7.5, 7.5, -7.5, { h: H, mat: M.steel });
    b.wall(-7.5, 7.5, 7.5, 7.5, { h: H, mat: M.steel });
    b.wall(-7.5, -7.5, -7.5, 7.5, { h: H, mat: M.steel });
    b.wall(7.5, -7.5, 7.5, 7.5, { h: H, mat: M.steel, gaps: [{ at: 4.0, w: 1.0, h: 1.95 }] });
    b.box(7.44, 1.95, -3.5, 0.2, 2.0, 1.3, M.steelDark);
    const openLeaf = new THREE.Group();
    part(openLeaf, M.steelDark, 0, 0, 0, 0.12, 1.95, 1.05);
    b.add(openLeaf, 7.44, 1.9, -3.5, 0);

    // The tank itself
    const tank = P.cableTank(TANK_R, WATER_Y);
    b.add(tank, 0, 0, 0, 0, { dynamic: true, name: 'tank' });
    // Rim collider with a gap where the plank crosses.
    const gapA = Math.asin(PLANK_HALF / RIM_R) + 0.01;
    const pts: Array<[number, number]> = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = gapA + (i / N) * (Math.PI * 2 - 2 * gapA);
      pts.push([Math.cos(a) * RIM_R, Math.sin(a) * RIM_R]);
    }
    b.col.addPolyline(pts, false);
    // Plank from the rim to the cone, with its edges as colliders.
    b.box(3.0, 0.02, 0, 4.7, 0.06, PLANK_HALF * 2, M.woodLight);
    for (const s of [-1, 1]) {
      b.seg(0.75, s * PLANK_HALF, RIM_R + 0.02, s * PLANK_HALF);
      b.box(3.0, 0.08, s * (PLANK_HALF - 0.03), 4.7, 0.04, 0.05, M.woodDark);
    }
    b.circle(0, 0, 0.62);
    // Cable coils & nest at the top of the cone, and the idol.
    const nest = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const t = ring(nest, M.cable, 0, 1.15 + i * 0.08, 0, 0.42 - i * 0.05, 0.07, 12);
      t.rotation.x = Math.PI / 2 + (i % 2 ? 0.2 : -0.15);
    }
    b.add(nest, 0, 0, 0, 0);
    if (!g.flag('got:idol')) {
      const idol = P.idol();
      b.add(idol, 0, 1.15, 0, 0.6, { dynamic: true, name: 'idol' });
    }
    // Cables snaking up out of the water onto the cone.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      rod(b.staticRoot, M.cable, { x: Math.cos(a) * 3.5, y: WATER_Y, z: Math.sin(a) * 3.5 }, { x: Math.cos(a) * 0.5, y: 1.2, z: Math.sin(a) * 0.5 }, 0.06, 5);
    }

    // Hold clutter: spare cable coils, a mark buoy, crates, the ladder to the sealed hatch.
    const coil = (x: number, z: number, n = 5) => {
      const gg = new THREE.Group();
      for (let i = 0; i < n; i++) ring(gg, M.cable, 0, 0.1 + i * 0.13, 0, 0.7, 0.08, 14).rotation.x = Math.PI / 2;
      b.add(gg, x, 0, z, 0);
      b.circle(x, z, 0.8);
    };
    coil(-6.2, -6.2);
    coil(-6.3, 6.1, 4);
    const buoy = new THREE.Group();
    const sphere = mesh(new THREE.SphereGeometry(0.6, 10, 7), M.redPaint);
    sphere.position.y = 0.65;
    buoy.add(sphere);
    rod(buoy, M.ironLight, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 2.8, z: 0 }, 0.04, 5);
    part(buoy, M.ceramic, 0.25, 2.3, 0, 0.5, 0.35, 0.02);
    b.add(buoy, 6.2, 0, 6.2, 0);
    b.circle(6.2, 6.2, 0.65);
    b.add(P.crate(1.1, 1.0, 1.1), 6.3, 0, -6.4, 0.1);
    b.footprint(6.3, -6.4, 1.2, 1.2);
    b.add(P.crate(0.8, 0.7, 0.8), 6.25, 1.0, -6.35, -0.2);
    b.add(P.crate(0.9, 0.8, 0.9), -6.4, 0, 0.4, 0);
    b.footprint(-6.4, 0.4, 1.0, 1.0);
    b.add(P.ladder(5.0, 0.55), -7.3, 0, -2.4, Math.PI / 2);
    b.add(P.grapnel(), 0.8, 0.05, -6.9, 0);
    b.circle(0.8, -6.9, 0.5);
    b.add(P.puddle(0.6), 5.8, 0.012, 0.6, 0);
    b.add(P.puddle(0.45), -3.8, 0.012, 5.2, 0);

    // Lighting: the thing's sick green glow; dim hold lamps if the ship has power.
    b.add(P.cageLamp('bulbH1', true), -5.6, H, -5.6, 0, { dynamic: true });
    b.add(P.cageLamp('bulbH2', true), 5.6, H, 5.6, 0, { dynamic: true });
    if (!g.flag('got:idol')) b.light({ x: 0, y: 1.9, z: 0, color: 0x58d898, intensity: 16, distance: 15, flicker: 0.5, name: 'idolLight' });
    // The flooded tank itself gives off a faint phosphorescence (stronger once the thing is disturbed).
    b.light({ x: 0, y: 0.1, z: 0, color: 0x2f9a74, intensity: g.flag('got:idol') ? 14 : 5, distance: 14, flicker: 0.7, name: 'tankGlow' });
    b.light({ x: -5.6, y: 4.6, z: -5.6, color: 0xffd6a0, intensity: 12, distance: 11, needsPower: true, flicker: 0.2 });
    b.light({ x: 5.6, y: 4.6, z: 5.6, color: 0xffd6a0, intensity: 12, distance: 11, needsPower: true, flicker: 0.3 });

    // ---- interactions
    b.interact({
      id: 'door',
      x: 7.0,
      z: -3.5,
      r: 1.1,
      label: '수밀문 (기관실로)',
      onAction: async (gg) => {
        await gg.goto('engine', 'fromHold', 'hatch');
      },
    });
    b.interact({
      id: 'idol',
      x: 0.75,
      z: 0,
      r: 1.05,
      cone: 1.6,
      label: '검은 돌',
      enabled: (gg) => !gg.flag('got:idol'),
      onAction: async (gg) => {
        gg.player.face(0, 0);
        await gg.say('원뿔 꼭대기, 케이블 뭉치 속에 검은 돌이 박혀 있다. 케이블이 돌을 감싼 것이 아니다. 돌에서 케이블이… 자라나 있다.', '희미한 초록빛이 돌의 틈새에서 맥박 치듯 새어 나온다.');
        const choice = await gg.ask('돌을 떼어낼까?', [{ label: '떼어낸다' }, { label: '그만둔다' }]);
        if (choice !== 0) return;
        gg.player.pose('reach');
        await gg.wait(0.5);
        gg.setFlag('got:idol');
        const idol = gg.room.get('idol');
        if (idol) idol.visible = false;
        await gg.giveItem('idol', { silent: true });
        gg.sfx('stinger', { volume: 1 });
        gg.shake(0.2, 2.5);
        gg.flash(0x3a8a60, 0.4);
        for (const l of gg.room.lights) {
          if (l.name === 'idolLight') l.intensity = 2;
          if (l.name === 'tankGlow') l.intensity = 14;
        }
        await gg.say('돌을 떼어내는 순간, 탱크의 물이 끓어오르듯 들끓기 시작했다!', '물속에서 무언가들이 일어선다. 여기서 나가야 한다. 불 곁으로!');
        gg.spawnCreature({ id: 'hold1', x: -4.6, z: 4.3, h: Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.2 });
        gg.spawnCreature({ id: 'hold2', x: -2.6, z: -5.9, h: 0, hp: 3, entrance: 'rise', speed: 1.15, delay: 0.8 });
        gg.spawnCreature({ id: 'hold3', x: 5.6, z: 4.9, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.25, delay: 2.4 });
      },
    });
    look(b, 'tank', 5.9, 1.9, '케이블 탱크', ['지름 10미터의 원형 탱크. 인양한 케이블을 사려 두는 곳이다. 거터퍼카 피복이 마르지 않도록 물을 채워 둔다.', '검은 수면 아래, 사려진 케이블이 희미하게 보인다. 그리고 그 사이로… 창백한 무언가가.'], 1.3);
    look(b, 'buoy', 5.5, 5.5, '표지 부표', ['케이블 끝을 표시해 두는 부표. 깃대에 탈라사호의 이름이 적힌 헝겊이 걸려 있다.'], 1.2);
    look(b, 'ladder', -6.7, -2.4, '사다리', ['갑판의 해치로 올라가는 사다리. 위는 밖에서 사슬로 봉해져 있다.'], 1.1);
  },
  onEnter(g) {
    if (!g.flag('holdSeen')) {
      g.setFlag('holdSeen');
      void (async () => {
        await g.wait(0.7);
        g.sfx('knock3', { volume: 1.3 });
        await g.say('거대한 원형 탱크가 물을 가득 머금고 있다. 한가운데 원뿔 꼭대기에서 초록빛이 희미하게 맥동한다.', '탱크 위로 판자 하나가 원뿔까지 걸쳐 있다.');
      })();
    }
    if (g.flag('got:idol') && !g.flag('idolBurned')) {
      g.spawnCreature({ id: 'hold1', x: -4.6, z: 4.3, h: Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.2 });
      g.spawnCreature({ id: 'hold2', x: -2.6, z: -5.9, h: 0, hp: 3, entrance: 'rise', speed: 1.15, delay: 0.8 });
    }
  },
  update(g, room, _dt, t) {
    const tank = room.get('tank');
    const water = tank?.getObjectByName('tankWater');
    const agitated = g.flag('got:idol') && !g.flag('idolBurned');
    if (water) {
      water.position.y = WATER_Y + Math.sin(t * (agitated ? 7 : 0.8)) * (agitated ? 0.05 : 0.015);
      const m = (water as THREE.Mesh).material as THREE.MeshLambertMaterial;
      if (m.map) {
        m.map.offset.x = (t * (agitated ? 0.08 : 0.01)) % 1;
        m.map.offset.y = (t * (agitated ? 0.05 : 0.004)) % 1;
      }
    }
    const idol = room.get('idol');
    if (idol) {
      idol.rotation.y += 0.004;
      idol.position.y = 1.15 + Math.sin(t * 1.3) * 0.02;
    }
  },
};
