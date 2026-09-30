import * as THREE from 'three';
import type { RoomDef } from '../types';
import { M } from '../../render/materials';
import { cyl, mesh, part, rod, ring } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';

const OUTLINE: Array<[number, number]> = [
  [-6, -12],
  [-6, 5],
  [-1.2, 13],
  [1.2, 13],
  [6, 5],
  [6, -12],
];

export const deck: RoomDef = {
  id: 'deck',
  name: '선수 갑판',
  outdoor: true,
  fog: { color: 0x27313a, density: 0.042 },
  hemi: { sky: 0x62768a, ground: 0x1a1816, intensity: 1.5 },
  moon: { color: 0xa8bcd0, intensity: 1.7, dir: [-0.5, 1, 0.35] },
  grade: { saturation: 0.7, tint: 0xe8eef2 },
  ambience: 'deck',
  surface: 'wood',
  bounds: rect(-6.5, -12.5, 6.5, 13.5),
  spawns: {
    start: { x: -5.1, z: -1.2, h: Math.PI / 2 },
    fromBridge: { x: 4.4, z: -10.9, h: 0 },
    fromCorridor: { x: -2, z: -10.9, h: 0 },
  },
  cameras: [
    // Establishing shot of the midship house with the dark wheelhouse above.
    { id: 'house', pos: [0.6, 5.2, 1.5], look: [-0.4, 1.8, -11], fov: 52, zones: [rect(-6.5, -12.5, 6.5, -4.6)] },
    { id: 'port', pos: [4.6, 5.0, -8.6], look: [-3.6, 0.4, 0.8], fov: 50, zones: [rect(-6.5, -5.0, 0.2, 3.6)] },
    { id: 'starboard', pos: [-4.7, 5.0, -8.8], look: [3.4, 0.4, 1.0], fov: 50, zones: [rect(-0.2, -5.0, 6.5, 3.6)] },
    { id: 'machinery', pos: [-4.4, 2.3, 1.6], look: [0.6, 1.4, 9.4], fov: 52, zones: [rect(-6.5, 3.2, 6.5, 9.6)] },
    { id: 'bow', pos: [2.9, 5.4, 5.2], look: [-0.2, 0.8, 12.4], fov: 50, zones: [rect(-6.5, 9.2, 6.5, 13.5)] },
  ],
  build(b, g) {
    // Deck planking (shape on XZ; ShapeGeometry UVs are the shape coords, i.e. world metres).
    const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
    const deckMesh = mesh(new THREE.ShapeGeometry(shape), M.deck);
    deckMesh.rotation.x = -Math.PI / 2;
    b.staticRoot.add(deckMesh);

    // Bulwarks with a timber rail, and the black hull below them.
    for (let i = 0; i < OUTLINE.length - 1; i++) {
      const [x0, z0] = OUTLINE[i];
      const [x1, z1] = OUTLINE[i + 1];
      b.wall(x0, z0, x1, z1, { h: 1.05, mat: M.paintDirty, t: 0.14 });
      b.wall(x0, z0, x1, z1, { h: 0.08, mat: M.woodLight, t: 0.24, y: 1.05, collide: false });
      const ox = x0 < 0 || x1 < 0 ? -0.1 : 0.1;
      b.wall(x0 + ox, z0, x1 + ox, z1, { h: 2.7, mat: M.hull, t: 0.1, y: -2.7, collide: false });
    }
    // Bulwark stanchions
    for (let z = -11; z <= 4; z += 1.5) {
      b.box(-5.86, 0, z, 0.1, 1.0, 0.1, M.paintDirty);
      b.box(5.86, 0, z, 0.1, 1.0, 0.1, M.paintDirty);
    }

    // Sea
    const sea = mesh(new THREE.PlaneGeometry(160, 160, 1, 1), M.sea);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2.6;
    sea.name = 'sea';
    const uv = sea.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 26, uv.getY(i) * 26);
    b.add(sea, 0, -2.6, 0, 0, { dynamic: true, name: 'sea' });
    sea.rotation.x = -Math.PI / 2;

    // Midship house front, wheelhouse above, funnel beyond.
    b.wall(-6, -12, 6, -12, { h: 3.0, mat: M.paint, t: 0.2, gaps: [{ at: 4, w: 0.9, h: 1.95 }] });
    b.box(0, 0, -14.1, 12, 3.0, 4, M.paint);
    for (const x of [-4.4, 1.2, 2.8]) {
      b.box(x, 1.2, -11.88, 0.9, 0.7, 0.04, M.windowDark);
      b.box(x, 1.12, -11.86, 1.0, 0.08, 0.06, M.brass);
    }
    b.add(P.shipDoor(0.8, 1.9, M.steelDark), -2, 0, -11.96, 0);
    b.box(0, 3.0, -12.6, 13.4, 0.12, 1.4, M.steelDark); // bridge deck overhang / wings
    b.box(0, 3.1, -15.2, 10, 2.6, 5.2, M.paint); // wheelhouse block
    for (let i = 0; i < 7; i++) b.box(-3.9 + i * 1.3, 4.0, -12.58, 1.0, 1.0, 0.05, M.windowFog);
    b.box(0, 5.7, -15.2, 10.6, 0.12, 5.8, M.steelDark);
    for (const s of [-1, 1]) {
      // wing railings
      rod(b.staticRoot, M.paint, { x: s * 6.6, y: 4.1, z: -11.95 }, { x: s * 5.1, y: 4.1, z: -11.95 }, 0.03);
      rod(b.staticRoot, M.paint, { x: s * 6.6, y: 3.12, z: -11.95 }, { x: s * 6.6, y: 4.1, z: -11.95 }, 0.03);
    }
    rod(b.staticRoot, M.paint, { x: -5.1, y: 4.1, z: -11.95 }, { x: 3.9, y: 4.1, z: -11.95 }, 0.03);
    const funnel = new THREE.Group();
    cyl(funnel, M.black, 0, 4, 0, 1.4, 8, 'y', 12);
    cyl(funnel, M.redPaint, 0, 6.8, 0, 1.43, 0.8, 'y', 12);
    funnel.rotation.x = -0.12;
    b.add(funnel, 0, 5.2, -20.5, 0);
    // Ladder from the deck to the bridge wing
    b.add(P.ladder(3.2, 0.55), 4.4, 0, -11.8, 0);

    // Cable tank hatch (collides), foremast, cable engine, dynamometer, bow sheaves.
    b.add(P.hatch(4, 4, 0.75), 0, 0, 0, 0);
    b.footprint(0, 0, 4.2, 4.2);
    b.add(P.mast(13), 0, 0, 3.2, 0);
    b.circle(0, 3.2, 0.45);
    b.add(P.cableEngine(), 0, 0, 7.0, 0, { dynamic: true, name: 'cableEngine' });
    b.footprint(0, 7.0, 3.0, 2.1);
    const dyn = new THREE.Group();
    part(dyn, M.steelDark, 0, 0, 0, 0.7, 0.5, 0.6);
    ring(dyn, M.ironLight, 0, 0.85, 0, 0.35, 0.05, 12).rotation.y = Math.PI / 2;
    const face = P.gauge(0.14, 'tension');
    face.position.set(0.37, 0.8, 0);
    face.rotation.y = Math.PI / 2;
    dyn.add(face);
    b.add(dyn, 0, 0, 9.8, 0, { dynamic: true });
    b.footprint(0, 9.8, 0.8, 0.8);
    const sheaves = new THREE.Group();
    for (const s of [-1, 1]) {
      const sh = P.sheave(0.85, 0.28);
      sh.position.set(s * 0.42, 0, 0);
      sheaves.add(sh);
      part(sheaves, M.steelDark, s * 0.78, -2.2, 0, 0.14, 2.3, 0.5);
    }
    part(sheaves, M.steelDark, 0, -2.2, -0.9, 1.9, 0.9, 0.5);
    b.add(sheaves, 0, 2.2, 12.9, 0, { dynamic: true, name: 'sheaves' });
    b.footprint(0, 12.5, 2.2, 1.2);
    // The cable: drum -> dynamometer -> over the sheave -> down into the sea.
    const cable = new THREE.Group();
    cable.name = 'cable';
    const pts = [
      { x: 0, y: 1.9, z: 7.4 },
      { x: 0, y: 0.95, z: 9.8 },
      { x: 0, y: 3.05, z: 12.8 },
      { x: 0, y: 2.6, z: 13.8 },
      { x: 0, y: -2.6, z: 15.8 },
      { x: 0, y: -9, z: 18 },
    ];
    for (let i = 0; i < pts.length - 1; i++) rod(cable, M.cable, pts[i], pts[i + 1], 0.07, 6);
    b.add(cable, 0, 0, 0, 0, { dynamic: true, name: 'cable' });
    b.add(P.grapnel(), 2.2, 0.05, 10.4, 0.6);
    b.circle(2.2, 10.4, 0.55);

    // Deck furniture
    b.add(P.ventilator(2.4, 0.3), -4, 0, -9.4, 0.3);
    b.circle(-4, -9.4, 0.4);
    b.add(P.ventilator(2.2, 0.28), 4.6, 0, -8.2, -0.4);
    b.circle(4.6, -8.2, 0.4);
    for (const [x, z] of [
      [-5.2, 7.4],
      [5.2, 7.4],
      [-5.2, -5.2],
      [5.2, -5.4],
    ]) {
      b.add(P.bollard(), x, 0, z, Math.PI / 2);
      b.footprint(x, z, 0.4, 0.9);
    }
    b.add(P.davit(), -5.65, 0, -7.2, -Math.PI / 2, { dynamic: true, name: 'davit1' });
    b.add(P.davit(), -5.65, 0, -3.4, -Math.PI / 2, { dynamic: true, name: 'davit2' });
    b.circle(-5.65, -7.2, 0.25);
    b.circle(-5.65, -3.4, 0.25);
    b.box(-5.2, 0, -5.3, 0.5, 0.35, 3.0, M.woodDark, { collide: true }); // boat chocks (empty)
    const buoy = P.lifebuoy();
    b.add(buoy, 5.9, 0.78, 0.8, -Math.PI / 2);
    b.add(P.barrel(), 3.4, 0, -10.6, 0);
    b.add(P.barrel(), 4.05, 0, -10.95, 0);
    b.circle(3.4, -10.6, 0.32);
    b.circle(4.05, -10.95, 0.32);
    b.add(P.crate(1.0, 0.9, 0.9), -4.6, 0, -10.9, 0.1);
    b.footprint(-4.6, -10.9, 1.1, 1.0);
    b.add(P.crate(0.7, 0.6, 0.7), -4.5, 0.9, -10.9, -0.3);

    // Jacob's ladder over the port bulwark (how I came aboard).
    const jl = new THREE.Group();
    rod(jl, M.rope, { x: 0, y: 1.1, z: -0.25 }, { x: -0.25, y: -2.6, z: -0.25 }, 0.02, 4);
    rod(jl, M.rope, { x: 0, y: 1.1, z: 0.25 }, { x: -0.25, y: -2.6, z: 0.25 }, 0.02, 4);
    for (let i = 0; i < 9; i++) {
      const y = 0.9 - i * 0.4;
      const x = -((1.1 - y) / 3.7) * 0.25;
      rod(jl, M.woodLight, { x, y, z: -0.25 }, { x, y, z: 0.25 }, 0.02, 4);
    }
    b.add(jl, -6.12, 0, -1.2, 0);

    // Wet bare footprints climbing over the starboard rail and stopping at the hatch.
    b.add(
      P.footprints([
        [5.7, 3.4],
        [4.0, 2.9],
        [2.4, 2.4],
      ]),
      0,
      0,
      0,
      0,
    );

    // Lights (oil masthead lamp keeps burning — someone has kept it lit).
    b.light({ x: 0, y: 6.1, z: 3.45, color: 0xffb266, intensity: 16, distance: 16, flicker: 0.35 });
    b.light({ x: 0, y: 4.2, z: -11.2, color: 0x7f98a8, intensity: 6, distance: 11 });

    // ---- interactions
    exit(b, {
      id: 'ladder',
      x: 4.4,
      z: -11.4,
      label: '사다리 (선교로)',
      to: 'bridge',
      spawn: 'fromDeck',
      sfx: 'ladder',
    });
    exit(b, {
      id: 'houseDoor',
      x: -2,
      z: -11.5,
      label: '선실 입구',
      to: 'corridor',
      spawn: 'fromDeck',
      locked: (gg) =>
        gg.flag('barricadeMoved') ? null : ['손잡이는 돌아가는데, 문이 꿈쩍도 하지 않는다.', '안쪽에서 무언가 무거운 것이 문을 막고 있다. 누군가 안에서 문을 막아 둔 것이다.'],
      onItem: async (gg, item) => {
        if (item === 'crowbar' || item === 'axe') {
          await gg.say('문틈에 쇠를 끼워 비틀어 봤지만 소용이 없다. 안쪽을 막은 무게가 너무 크다. 다른 길을 찾아야 한다.');
          return true;
        }
        return false;
      },
    });
    b.interact({
      id: 'hatch',
      x: 0,
      z: 0,
      r: 3.0,
      cone: 0.9,
      label: '선수 해치',
      onAction: async (gg) => {
        await gg.say(
          '1번 케이블 탱크의 해치. 방수포 위로 굵은 사슬이 몇 겹이나 감겨 있고, 커다란 자물쇠가 채워져 있다.',
          '방수포 위에 분필로 휘갈긴 글씨가 있다.\n"불을 꺼뜨리지 마라."',
          '안쪽에서 물이 출렁이는 소리가 들린다.',
        );
      },
      onItem: async (gg, item) => {
        if (item === 'crowbar' || item === 'axe') {
          await gg.say('사슬이 팔뚝만큼 굵다. 이걸로는 어림도 없다. 게다가… 이 해치를 봉한 사람들은 이유가 있었을 것이다.');
          return true;
        }
        return false;
      },
    });
    look(b, 'cableEngine', 0, 5.6, '케이블 권양기', [
      '케이블을 끌어올리는 권양기. 드럼에 젖은 케이블이 감겨 있고, 따개비 같은 것이 군데군데 붙어 있다.',
      '증기관은 차갑게 식어 있다. 브레이크가 걸린 채다.',
    ]);
    look(b, 'dynamometer', 0, 9.0, '다이나모미터', ['케이블 장력을 재는 계기. 바늘이 눈금 끝에 걸린 채 가늘게 떨고 있다.', '배는 멈춰 있다. 그런데도 케이블은 무언가에 끌려가고 있다.']);
    look(b, 'sheaves', 0, 11.6, '선수 쉬브', [
      '케이블이 선수 쉬브를 넘어 검은 바다 속으로 곧게 뻗어 있다.',
      '손을 대 보니 팽팽하다. 아주 느리게, 규칙적으로 떨린다. 마치 맥박처럼.',
    ]);
    look(b, 'grapnel', 2.2, 10.4, '그래플', ['해저의 케이블을 걸어 올리는 갈고리. 끝마다 검은 점액 같은 것이 말라붙어 있다.', '냄새가… 바다 냄새가 아니다. 더 오래되고, 더 깊은 냄새다.']);
    look(b, 'davits', -5.3, -5.3, '빈 대빗', ['구명정 한 척이 사라졌다. 늘어진 줄이 바람에 흔들린다.', '누군가 몹시 서둘러 내린 흔적이다. 받침목이 부서져 있다.']);
    look(b, 'jacob', -5.5, -1.2, '줄사다리', ['타고 올라온 줄사다리. 아래에는 검은 바다뿐, 보트는 이미 보이지 않는다.']);
    look(b, 'prints', 3.6, 2.8, '젖은 발자국', ['우현 난간 너머에서부터 이어진 젖은 발자국. 맨발이다.', '바다에서 기어 올라온 누군가의 발자국이, 해치 앞에서 끊겨 있다.']);
    look(b, 'mast', 0, 3.2, '앞돛대', ['돛대 중간의 등불이 아직 타고 있다. 기름 등이다.', '여드레 동안 사람 없이 떠돌던 배에서, 누가 이 불을 지켰을까.'], 1.0);
    look(b, 'vent', -4, -9.4, '통풍통', ['아래 선실로 공기를 보내는 통풍통. 안에서 차가운 바람이 올라온다. 쇠 긁는 소리 같은 것도.']);
    pickup(b, g, {
      item: 'crowbar',
      x: -1.9,
      z: 8.3,
      y: 0.03,
      ry: 0.7,
      label: '쇠지렛대',
      text: ['권양기 옆에 쇠지렛대가 떨어져 있다. 드럼에 끼인 무언가를 떼어내려 했던 모양이다.'],
    });

    // ---- scripted moments
    b.trigger({
      id: 'hatchKnock',
      rect: rect(-3.4, -3.4, 3.4, 3.4),
      once: true,
      onEnter: async (gg) => {
        gg.sfx('knock3', { volume: 1.2 });
        gg.shake(0.03, 1.2);
        await gg.wait(1.2);
        await gg.say('해치 아래에서… 무언가 두드린다.', '세 번. 쉬고. 세 번.');
      },
    });
    b.trigger({
      id: 'bow',
      rect: rect(-3, 10.6, 3, 13.5),
      once: true,
      onEnter: async (gg) => {
        gg.sfx('creak', { volume: 1.2 });
        gg.shake(0.06, 1.5);
        await gg.wait(0.6);
        gg.sfx('stinger', { volume: 0.6 });
        await gg.say('케이블이 한 번 크게 요동쳤다. 쉬브가 삐걱이며 반 바퀴 돌아간다.', '바다 밑의 무언가가, 배를 조금 더 끌어당겼다.');
      },
    });
  },
  update(g, room, dt, t) {
    const sea = room.get<THREE.Mesh>('sea');
    if (sea) {
      const m = sea.material as THREE.MeshLambertMaterial;
      if (m.map) {
        m.map.offset.x = (t * 0.004) % 1;
        m.map.offset.y = (t * 0.011) % 1;
      }
      sea.position.y = -2.6 + Math.sin(t * 0.6) * 0.08;
    }
    const f1 = room.get('davit1')?.getObjectByName('fall');
    const f2 = room.get('davit2')?.getObjectByName('fall');
    if (f1) f1.rotation.z = Math.sin(t * 1.1) * 0.12;
    if (f2) f2.rotation.z = Math.sin(t * 0.9 + 1) * 0.14;
    const cable = room.get('cable');
    if (cable) cable.position.x = Math.sin(t * 2.3) * 0.01;
    const needle = room.get('tension');
    if (needle) needle.rotation.z = -2.1 + Math.sin(t * 9) * 0.05;
    void g;
    void dt;
  },
};
