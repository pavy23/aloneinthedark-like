import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import { M } from '../../render/materials';
import { part } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';

async function smash(gg: GameAPI): Promise<void> {
  gg.setFlag('glassBroken');
  gg.player.pose('reach');
  gg.sfx('glass');
  const gl = gg.room.get('fireCab')?.getObjectByName('glass');
  if (gl) gl.visible = false;
  await gg.say('유리가 요란하게 깨졌다. 그 소리가 통로 끝까지 울려 퍼진다.');
}

// Officers' alleyway. Main run x -8..6, z -1..1; west lobby x -8..-5, z -2..2; east vestibule x 6..9, z -3..1.
export const corridor: RoomDef = {
  id: 'corridor',
  name: '사관 통로',
  fog: { color: 0x050505, density: 0.1 },
  hemi: { sky: 0x48484a, ground: 0x16120e, intensity: 0.85 },
  grade: { saturation: 0.8, tint: 0xfff4e0 },
  ambience: 'interior',
  surface: 'lino',
  bounds: rect(-8, -3, 9, 2),
  spawns: {
    fromBridge: { x: -6.3, z: 1.2, h: Math.PI },
    fromDeck: { x: -7.3, z: 0, h: Math.PI / 2 },
    fromCabin: { x: -3.2, z: 0.3, h: Math.PI },
    fromRadio: { x: 2.6, z: 0.3, h: Math.PI },
    fromEngine: { x: 7.5, z: -2.2, h: 0 },
  },
  cameras: [
    { id: 'lobby', pos: [-5.15, 2.2, -1.75], look: [-7.7, 0.7, 0.9], fov: 60, zones: [rect(-8, -2, -4.9, 2)] },
    { id: 'west', pos: [1.8, 2.15, -0.8], look: [-6, 0.8, 0.3], fov: 50, track: 0.25, zones: [rect(-5.3, -1.1, 0.6, 1.1)] },
    { id: 'east', pos: [-2.4, 2.15, 0.8], look: [6, 0.8, -0.4], fov: 50, track: 0.25, zones: [rect(0.1, -1.1, 6.3, 1.1)] },
    { id: 'vestibule', pos: [6.25, 2.2, 0.8], look: [8.3, 0.6, -2.2], fov: 62, zones: [rect(5.9, -3, 9, 1.1)] },
  ],
  build(b, g) {
    const H = 2.4;
    b.floor(-8, -1, 6, 1, M.linoleum);
    b.floor(-8, -2, -5, 2, M.linoleum);
    b.floor(6, -3, 9, 1, M.linoleum);
    b.ceiling(-8, -3, 9, 2, H, M.paintDirty);
    const wall = M.paint;
    // Lobby walls (west end)
    b.wall(-8, -2, -8, 2, { h: H, mat: wall, gaps: [{ at: 2, w: 0.9, h: 1.95 }] }); // deck door
    b.wall(-8, 2, -5, 2, { h: H, mat: wall, gaps: [{ at: 1.7, w: 1.1, h: 2.3 }] }); // stairs up
    b.wall(-8, -2, -5, -2, { h: H, mat: wall });
    b.wall(-5, 2, -5, 1, { h: H, mat: wall });
    b.wall(-5, -2, -5, -1, { h: H, mat: wall });
    // Main run
    b.wall(-5, 1, 6, 1, { h: H, mat: wall, gaps: [{ at: 1.8, w: 0.9, h: 1.95 }, { at: 7.6, w: 0.9, h: 1.95 }] });
    b.wall(-5, -1, 6, -1, { h: H, mat: wall });
    // Vestibule
    b.wall(6, 1, 9, 1, { h: H, mat: wall });
    b.wall(9, -3, 9, 1, { h: H, mat: wall });
    b.wall(6, -3, 9, -3, { h: H, mat: wall, gaps: [{ at: 1.5, w: 0.9, h: 1.95 }] });
    b.wall(6, -3, 6, -1, { h: H, mat: wall });
    // Wainscot rail and handrail along the run
    b.box(-1.5, 0.9, 0.93, 13, 0.05, 0.06, M.woodDark);
    b.box(-1.5, 0.9, -0.93, 13, 0.05, 0.06, M.woodDark);
    // Doors (visual)
    b.add(P.shipDoor(0.8, 1.9, M.woodDark), -3.2, 0, 1.0, Math.PI);
    b.add(P.shipDoor(0.8, 1.9, M.woodDark), 2.6, 0, 1.0, Math.PI);
    b.add(P.shipDoor(0.8, 1.9, M.steelDark), 7.5, 0, -3.0, 0);
    b.add(P.shipDoor(0.8, 1.9, M.steelDark), -8.0, 0, 0, Math.PI / 2);
    // Brass door plates
    b.box(-3.2, 2.02, 0.9, 0.36, 0.1, 0.02, M.brass);
    b.box(2.6, 2.02, 0.9, 0.36, 0.1, 0.02, M.brass);
    // Stairs going up into the dark towards the wheelhouse
    const st = P.stairs(1.0, 2.3, 1.6, 8, M.woodDark);
    b.add(st, -6.3, 0, 2.0, Math.PI);
    b.box(-6.3, 2.4, 3.2, 1.2, 0.1, 2.4, M.black);
    b.box(-6.3, 0, 3.7, 1.2, 2.4, 0.1, M.black);
    b.col.addRect({ minX: -7, minZ: 2.0, maxX: -5.6, maxZ: 2.3 });
    // Photographs of the keel laying and the launch.
    b.add(P.photoFrame(M.photoKeel), -1.25, 1.75, 0.91, Math.PI);
    b.add(P.photoFrame(M.photoLaunch), -0.55, 1.75, 0.91, Math.PI);
    // Fire station cabinet with the axe (dynamic: glass breaks, axe disappears).
    const cab = P.fireCabinet();
    b.add(cab, 0.3, 0.8, -0.95, 0, { dynamic: true, name: 'fireCab' });
    const glass = cab.getObjectByName('glass');
    const axe = cab.getObjectByName('axe');
    if (glass) glass.visible = !g.flag('glassBroken');
    if (axe) axe.visible = !g.flag('got:axe');
    // Benches and clutter in the vestibule
    b.box(8.55, 0, -1.5, 0.7, 0.45, 1.8, M.woodDark, { collide: true });
    b.add(P.porthole(0.2), 8.9, 1.55, -1.0, -Math.PI / 2);
    b.add(P.porthole(0.2), 8.9, 1.55, 0.2, -Math.PI / 2);
    b.add(P.lifebuoy(), 8.9, 1.5, -2.3, -Math.PI / 2);
    // The barricade the last men built against the deck door.
    const barricade = new THREE.Group();
    const wardrobe = part(barricade, M.woodDark, 0, 0, 0, 0.9, 1.7, 1.4);
    void wardrobe;
    part(barricade, M.wood, 0, 0.05, 0.705, 0.8, 1.6, 0.02);
    part(barricade, M.brass, 0.46, 0.9, 0.2, 0.02, 0.12, 0.05);
    const chairOnTop = P.chair(M.wood, true);
    chairOnTop.position.set(0, 1.7, 0);
    barricade.add(chairOnTop);
    b.pushable(
      {
        id: 'barricade',
        object: barricade,
        w: 0.9,
        d: 1.4,
        step: 1.4,
        limit: rect(-7.9, -2.0, -6.8, 2.0),
        onMoved: async (gg, _x, z) => {
          if (z < -0.8) {
            gg.setFlag('barricadeMoved');
            await gg.say('옷장을 밀어내자 갑판으로 나가는 문이 드러났다. 이제 갑판과 오갈 수 있다.');
          }
        },
      },
      -7.35,
      0.25,
    );
    // Footprints from the engine room door, along the alleyway.
    b.add(
      P.footprints([
        [7.5, -2.6],
        [7.2, -0.6],
        [4.5, 0.2],
        [1.0, 0.1],
      ]),
      0,
      0,
      0,
      0,
    );
    b.add(P.puddle(0.5), 7.4, 0.012, -2.4, 0);

    // Lamps (dead until the dynamo runs) and moonlight from the vestibule portholes.
    for (const [x, z] of [
      [-6.5, 0],
      [-1.2, 0],
      [3.9, 0],
      [7.5, -1],
    ] as const) {
      b.add(P.cageLamp(`bulb${x}`, true), x, H, z, 0, { dynamic: true });
    }
    b.light({ x: 8.3, y: 1.6, z: -0.5, color: 0x7a8fa0, intensity: 6, distance: 8 });
    b.light({ x: -6.5, y: 2.1, z: 0, color: 0xffd6a0, intensity: 9, distance: 8, needsPower: true, flicker: 0.1 });
    b.light({ x: -1.2, y: 2.1, z: 0, color: 0xffd6a0, intensity: 9, distance: 8, needsPower: true });
    b.light({ x: 3.9, y: 2.1, z: 0, color: 0xffd6a0, intensity: 9, distance: 8, needsPower: true, flicker: 0.25 });
    b.light({ x: 7.5, y: 2.1, z: -1, color: 0xffd6a0, intensity: 8, distance: 7, needsPower: true });

    // ---- interactions
    exit(b, { id: 'stairsUp', x: -6.3, z: 1.6, label: '계단 (선교로)', to: 'bridge', spawn: 'fromCorridor', sfx: 'ladder' });
    exit(b, {
      id: 'deckDoor',
      x: -7.6,
      z: 0,
      label: '문 (갑판으로)',
      to: 'deck',
      spawn: 'fromCorridor',
      locked: (gg) => (gg.flag('barricadeMoved') ? null : ['커다란 옷장이 문을 막고 있다. 의자까지 얹어 두었다.', '안에 있던 사람들이 밖의 무언가를 막으려 한 것이다. 옷장을 밀어서 치워야 한다.']),
    });
    exit(b, {
      id: 'cabinDoor',
      x: -3.2,
      z: 0.55,
      label: '선장실 문',
      to: 'cabin',
      spawn: 'fromCorridor',
      locked: (gg) => (gg.flag('cabinUnlocked') ? null : '잠겨 있다. 황동 명패에 "MASTER"라고 새겨져 있다.'),
      unlockWith: 'cabinKey',
      unlockFlag: 'cabinUnlocked',
      unlockText: '선장실 열쇠를 꽂아 돌린다. 딸깍 — 문이 열렸다.',
    });
    exit(b, { id: 'radioDoor', x: 2.6, z: 0.55, label: '무선실 문', to: 'radio', spawn: 'fromCorridor' });
    exit(b, { id: 'engineDoor', x: 7.5, z: -2.55, label: '기관실 문', to: 'engine', spawn: 'fromCorridor', sfx: 'door' });
    look(b, 'photos', -0.9, 0.45, '액자 두 개', [
      '빛바랜 사진 두 장이 나란히 걸려 있다.',
      '왼쪽: 텅 빈 선대 위에 용골 하나만 놓여 있다. 아래 글씨 — "C.S. THALASSA · 용골 거치 · 1911년 3월 14일 · 던마로 조선소, 글래스고"',
      '오른쪽: 선체가 진수대를 미끄러져 강물로 들어가고 있다. 아래 글씨 — "진수 · 1911년 9월 2일"',
    ]);
    b.interact({
      id: 'fireCab',
      x: 0.3,
      z: -0.45,
      r: 1.0,
      label: '소화 설비함',
      onAction: async (gg) => {
        if (!gg.flag('glassBroken')) {
          await gg.say('소화 설비함 유리 너머로 도끼가 보인다. "비상시 유리를 깨시오."');
          if (gg.hasItem('crowbar')) {
            const c = await gg.ask('쇠지렛대로 유리를 깰까?', [{ label: '깬다' }, { label: '그만둔다' }]);
            if (c === 0) await smash(gg);
            return;
          }
          await gg.say('유리가 두껍다. 맨손으로는 무리다. 단단한 것으로 내리치거나 발로 차야겠다. (F 키: 발차기)');
          return;
        }
        if (!gg.flag('got:axe')) {
          gg.setFlag('got:axe');
          const a = gg.room.get('fireCab')?.getObjectByName('axe');
          if (a) a.visible = false;
          await gg.giveItem('axe');
          await gg.say('소방 도끼를 꺼냈다. 무게가 손에 든든하다. (소지품에서 "손에 들기"로 장비)');
          return;
        }
        await gg.say('깨진 유리 조각만 남은 빈 설비함.');
      },
      onItem: async (gg, item) => {
        if (gg.flag('glassBroken')) return false;
        if (item === 'crowbar' || item === 'axe' || item === '@attack') {
          await smash(gg);
          return true;
        }
        return false;
      },
    });
    pickup(b, g, { item: 'letter', x: 8.55, y: 0.46, z: -1.2, ry: 0.3, label: '편지' });

    // ---- scripted: once power is back, something comes up from below.
    b.trigger({
      id: 'lightsOnAmbush',
      rect: rect(-5, -1.1, 4, 1.1),
      once: true,
      enabled: (gg) => gg.hasPower() && !gg.flag('idolBurned'),
      onEnter: async (gg) => {
        gg.sfx('creak', { volume: 1.2 });
        await gg.wait(0.4);
        gg.spawnCreature({ id: 'corr1', x: 7.5, z: -2.3, h: 0, hp: 3, entrance: 'none', speed: 1.2, delay: 0.3 });
        gg.sfx('growl', { volume: 1 });
        await gg.say('통로 끝, 기관실 쪽에서 젖은 발소리가 다가온다.');
      },
    });
  },
  onEnter(g) {
    if (g.hasPower() && g.flag('trig:corridor:lightsOnAmbush') && !g.flag('dead:corr1')) {
      // Still prowling: appear at whichever end of the alleyway is farthest from where we came in.
      const spots: Array<[number, number]> = [
        [7.5, -2.3],
        [-6.2, 1.3],
        [-1.0, 0.0],
      ];
      const [x, z] = spots.reduce((best, p) => (Math.hypot(p[0] - g.player.x, p[1] - g.player.z) > Math.hypot(best[0] - g.player.x, best[1] - g.player.z) ? p : best));
      g.spawnCreature({ id: 'corr1', x, z, h: 0, hp: 3, entrance: 'none', speed: 1.2, delay: 1.0 });
    }
  },
};
