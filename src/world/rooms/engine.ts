import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { cyl, part, rod } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';
import { dynamoTick } from '../../game/logic';
import { DYN_TEXT, emitDynamo, getDyn, hasDynamoListeners, setDyn } from '../../game/dynamo';
import { damp } from '../../core/math';

const DYNAMO_CAM: CameraDef = { id: 'dynClose', pos: [3.0, 2.3, 1.2], look: [5.7, 1.0, -1.0], fov: 55, zones: [] };
const FURNACE_CAM: CameraDef = { id: 'furnaceClose', pos: [-0.4, 1.6, 1.4], look: [-3.0, 1.0, 4.3], fov: 50, zones: [] };

const BOILER_X = [-3.2, 2.6];

// Steam puff particles from the dynamo drain.
const puffs: THREE.Mesh[] = [];
let lastHammers = -1;

async function openWt(gg: GameAPI): Promise<void> {
  await gg.say('수밀문 개폐 핸들을 소켓에 끼우고 돌린다. 축이 끼익거리며 돌아가고, 문짝이 한 뼘씩 들려 올라간다.');
  gg.sfx('valve', { volume: 1.2 });
  const leafObj = gg.room.get('wtDoor');
  for (let i = 0; i <= 40; i++) {
    if (leafObj) leafObj.position.y = (i / 40) * 1.9;
    if (i % 10 === 0) gg.sfx('creak', { volume: 0.8 });
    await gg.wait(1 / 30);
  }
  gg.room.col.setEnabled('wtDoor', false);
  gg.setFlag('wtOpen');
  gg.sfx('stinger', { volume: 0.5 });
  await gg.say('문이 열렸다. 차갑고 비린 공기가 흘러나온다. 저 안이 1번 케이블 탱크다.');
}

async function burnIdol(g: GameAPI, bx: number): Promise<void> {
  g.cutTo({ ...FURNACE_CAM, look: [bx, 1.0, 4.3], pos: [bx + 2.4, 1.6, 1.4] });
  g.player.face(bx, 4.2);
  await g.say('화실 문을 연다. 열기가 얼굴을 후려친다.', '손안의 검은 돌이 꿈틀거린다. 놓아 달라는 듯이. 아니면… 데려가 달라는 듯이.');
  g.player.pose('reach');
  g.sfx('furnace', { volume: 1.2 });
  await g.wait(0.5);
  g.takeItem('idol');
  g.setFlag('idolBurned');
  g.sfx('burn', { volume: 1.2 });
  g.flash(0xffe8b0, 0.9);
  g.shake(0.35, 2.5);
  g.killAllCreatures();
  await g.wait(1.8);
  g.cutTo(null);
  await g.say('불 속에서 돌이 갈라지며 비명 같은 소리를 냈다. 배 전체가 한 번 크게 떨렸다.', '…그리고 고요해졌다. 탱크 쪽에서 들려오던 두드림이 멎었다.');
  if (g.flag('sosSent')) await g.ending();
  else await g.say('이제 마그누스호에 이 배의 위치를 알려야 한다. 무선실로 가자.');
}

// Engine room: x -7..7, z -7.5..8. Boilers along the forward bulkhead, engine centre-aft, dynamo starboard.
export const engine: RoomDef = {
  id: 'engine',
  name: '기관실',
  fog: { color: 0x060403, density: 0.07 },
  hemi: { sky: 0x5a4a3c, ground: 0x1a120c, intensity: 1.0 },
  grade: { saturation: 0.9, tint: 0xfff0dc },
  ambience: 'engine',
  surface: 'grate',
  bounds: rect(-7, -7.5, 7, 8),
  spawns: {
    fromCorridor: { x: 6.1, z: -6.3, h: -Math.PI / 2 },
    fromHold: { x: -6.2, z: -3.5, h: Math.PI / 2 },
  },
  fireZones: [
    [BOILER_X[0], 3.25, 1.55],
    [BOILER_X[1], 3.25, 1.55],
  ],
  cameras: [
    { id: 'entry', pos: [6.6, 4.6, -7.2], look: [-0.5, 1.2, 0.5], fov: 56, zones: [rect(2.2, -7.5, 7, -2.4)] },
    { id: 'dynamo', pos: [1.6, 3.5, 2.9], look: [5.6, 0.8, -1.8], fov: 58, zones: [rect(2.2, -2.8, 7, 2.9)] },
    { id: 'stokehold', pos: [-6.5, 3.9, -0.6], look: [1.0, 1.2, 4.6], fov: 58, zones: [rect(-7, 0.6, 7, 4.3)], priority: 1 },
    { id: 'wtdoor', pos: [-1.1, 4.6, 1.3], look: [-6.5, 0.9, -4.0], fov: 56, zones: [rect(-7, -7.5, -1.7, 1.0)] },
    { id: 'aft', pos: [2.9, 3.6, -2.2], look: [-3.5, 0.8, -6.6], fov: 58, zones: [rect(-1.9, -7.5, 2.6, -4.3)] },
    { id: 'engineSide', pos: [1.9, 4.3, -7.2], look: [0.9, 0.8, 0.2], fov: 55, zones: [rect(0.8, -4.5, 2.4, 0.8)] },
  ],
  build(b, g) {
    const H = 6.5;
    b.floor(-7, -7.5, 7, 8, M.chequer);
    b.ceiling(-7, -7.5, 7, 8, H, M.steelDark);
    b.wall(-7, -7.5, 7, -7.5, { h: H, mat: M.steelGreen });
    b.wall(-7, 8, 7, 8, { h: H, mat: M.steelDark });
    b.wall(7, -7.5, 7, 8, { h: H, mat: M.steelGreen });
    b.wall(-7, -7.5, -7, 8, { h: H, mat: M.steelGreen, gaps: [{ at: 4.0, w: 1.0, h: 1.95 }] });

    // Main engine
    b.add(P.tripleExpansion(), -0.5, 0, -2.0, 0, { dynamic: true, name: 'mainEngine' });
    b.footprint(-0.5, -2.0, 2.7, 4.9);
    // Builder's plate on the bedplate
    b.box(0.52, 0.3, -3.2, 0.03, 0.22, 0.5, M.brass);

    // Scotch boilers facing aft, with coal and a shovel.
    for (const [i, x] of BOILER_X.entries()) {
      b.add(P.scotchBoiler(`b${i}`), x, 0, 4.2, Math.PI, { dynamic: true });
      b.footprint(x, 5.85, 3.4, 3.3);
      b.light({ x, y: 1.1, z: 3.3, color: 0xff7a2e, intensity: 16, distance: 11, flicker: 0.6 });
    }
    // Coal bunker bulkheads between and beside the boilers (with bunker doors), closing the stokehold.
    for (const [x0, x1] of [
      [-7, -4.9],
      [-1.5, 0.9],
      [4.3, 7],
    ] as const) {
      b.wall(x0, 4.35, x1, 4.35, { h: 3.6, mat: M.steelDark, t: 0.14 });
    }
    b.add(P.shipDoor(0.7, 1.6, M.rust), -0.3, 0, 4.28, 0);
    b.add(P.shipDoor(0.7, 1.6, M.rust), -5.95, 0, 4.28, 0);
    b.add(P.coalHeap(1.0), -5.8, 0, 2.4, 0);
    b.circle(-5.8, 2.4, 0.9);
    // Steam main from the boilers over to the engine and the dynamo
    for (const x of BOILER_X) rod(b.staticRoot, M.rust, { x, y: 3.55, z: 5.5 }, { x, y: 4.9, z: 5.5 }, 0.12);
    rod(b.staticRoot, M.rust, { x: -3.2, y: 4.9, z: 5.5 }, { x: 2.6, y: 4.9, z: 5.5 }, 0.13);
    rod(b.staticRoot, M.rust, { x: -0.5, y: 4.9, z: 5.5 }, { x: -0.5, y: 4.9, z: -1.2 }, 0.13);
    rod(b.staticRoot, M.rust, { x: 2.6, y: 4.9, z: 5.5 }, { x: 4.85, y: 4.9, z: 5.5 }, 0.09);
    rod(b.staticRoot, M.rust, { x: 4.85, y: 4.9, z: 5.5 }, { x: 4.85, y: 4.9, z: -1.5 }, 0.09);
    rod(b.staticRoot, M.rust, { x: 4.85, y: 4.9, z: -1.5 }, { x: 4.85, y: 4.2, z: -1.5 }, 0.08);
    // Wall pipes
    for (const y of [0.6, 1.0]) rod(b.staticRoot, M.copper, { x: -6.85, y, z: -7.3 }, { x: -6.85, y, z: 7.8 }, 0.05);
    rod(b.staticRoot, M.ironLight, { x: 6.85, y: 3.6, z: -7.3 }, { x: 6.85, y: 3.6, z: 7.8 }, 0.07);

    // Dynamo set and main switchboard (starboard side).
    b.add(P.dynamoSet(), 5.3, 0, -0.8, 0, { dynamic: true, name: 'dynamo' });
    b.footprint(5.3, -0.8, 1.35, 2.7);
    b.add(P.switchboard(), 6.72, 0, 2.2, -Math.PI / 2, { dynamic: true, name: 'switchboard' });
    b.footprint(6.72, 2.2, 1.85, 0.55, -Math.PI / 2);

    // Upper grating along the aft bulkhead (visual)
    b.box(0, 3.0, -6.9, 13.8, 0.06, 1.2, M.chequer);
    for (let x = -6.5; x <= 6.5; x += 1.3) rod(b.staticRoot, M.ironLight, { x, y: 3.0, z: -6.3 }, { x, y: 3.9, z: -6.3 }, 0.025);
    rod(b.staticRoot, M.ironLight, { x: -6.8, y: 3.9, z: -6.3 }, { x: 6.8, y: 3.9, z: -6.3 }, 0.025);

    // Engineer's bench with the notebook; ladder up to the alleyway.
    b.add(P.workbench(), 4.4, 0, -6.95, 0);
    b.footprint(4.4, -6.95, 1.65, 0.75);
    b.add(P.ladder(6.2, 0.55), 6.3, 0, -7.35, 0);
    // Watertight door (vertical sliding, screw-down). The leaf is dynamic so it can rise.
    const leaf = new THREE.Group();
    part(leaf, M.steelDark, 0, 0, 0, 0.12, 1.95, 1.05);
    for (const y of [0.4, 1.0, 1.6]) part(leaf, M.ironLight, 0.07, y, 0, 0.02, 0.08, 1.0);
    const wtOpen = g.flag('wtOpen');
    b.add(leaf, -6.94, wtOpen ? 1.9 : 0, -3.5, 0, { dynamic: true, name: 'wtDoor' });
    if (!wtOpen) b.col.addRect({ minX: -7.1, minZ: -4.05, maxX: -6.85, maxZ: -2.95 }, 'wtDoor');
    b.box(-6.9, 1.95, -3.5, 0.2, 2.0, 1.3, M.steelDark); // housing above the door
    cyl(b.staticRoot, M.iron, -6.82, 1.1, -2.72, 0.06, 0.12, 'x', 6); // spindle socket
    b.box(-6.93, 0.95, -2.72, 0.1, 0.3, 0.2, M.iron);

    // Lamps
    b.add(P.cageLamp('bulbE1', true), -0.5, H, 1.6, 0, { dynamic: true });
    b.add(P.cageLamp('bulbE2', true), 4.4, H - 1.5, -4.0, 0, { dynamic: true });
    b.add(P.cageLamp('bulbE3', false), 6.85, 3.2, 2.2, -Math.PI / 2, { dynamic: true });
    b.light({ x: -0.5, y: 5.6, z: 1.6, color: 0xffd6a0, intensity: 18, distance: 13, needsPower: true });
    b.light({ x: 4.4, y: 4.6, z: -4.0, color: 0xffd6a0, intensity: 12, distance: 10, needsPower: true });
    b.light({ x: 6.2, y: 3.1, z: 2.2, color: 0xffd6a0, intensity: 8, distance: 7, needsPower: true, flicker: 0.15 });

    // Steam puff particles for the drain
    puffs.length = 0;
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xd8dcd8, transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), puffMat);
      m.visible = false;
      m.userData.t = i / 10;
      b.root.add(m);
      puffs.push(m);
    }
    lastHammers = -1;

    // ---- interactions
    exit(b, { id: 'ladderUp', x: 6.2, z: -6.8, label: '사다리 (통로로)', to: 'corridor', spawn: 'fromEngine', sfx: 'ladder' });
    b.interact({
      id: 'wtDoor',
      x: -6.35,
      z: -3.1,
      r: 1.25,
      label: '수밀문',
      onAction: async (gg) => {
        if (gg.flag('wtOpen')) {
          await gg.goto('hold', 'fromEngine', 'hatch');
          return;
        }
        if (gg.hasItem('crank')) {
          await openWt(gg);
          return;
        }
        await gg.say(
          '1번 케이블 탱크로 통하는 나사식 수밀문. 위아래로 여닫는 무거운 철문이다.',
          '문 옆의 축 소켓에 끼우는 개폐 핸들이 빠져 있다. 누군가 일부러 뽑아 간 것이다.',
          '문 너머에서… 물 흐르는 소리가 난다.',
        );
      },
      onItem: async (gg, item) => {
        if (item !== 'crank' || gg.flag('wtOpen')) return false;
        await openWt(gg);
        return true;
      },
    });
    b.interact({
      id: 'dynamo',
      x: 5.0,
      z: 1.0,
      r: 1.6,
      cone: 1.5,
      label: '발전기와 배전반',
      onAction: async (gg) => {
        if (gg.hasPower()) {
          await gg.say('발전기가 고르게 윙윙거린다. 배전반의 전압계 바늘이 110볼트 근처에서 떨고 있다.');
          return;
        }
        if (!gg.flag('dynIntro')) {
          gg.setFlag('dynIntro');
          await gg.say('배의 전등과 무선 송신기에 전기를 대는 증기 발전기. 작은 증기 기관이 직류 발전기를 돌리는 구조다.', '증기관에 주증기 밸브, 아래쪽에 드레인 밸브, 벽에는 대리석 배전반이 있다.');
        }
        gg.cutTo(DYNAMO_CAM);
        await gg.openPanel('dynamo');
        gg.cutTo(null);
      },
    });
    look(b, 'plate', 1.1, -3.2, '조선소 명판', ['주기관 받침대의 황동 명판:', '"DUNMARROW SHIPBUILDING & ENGINEERING CO. LTD. · GLASGOW · YARD No. 214 · 1911"', '배 이름은 없다. 조선소의 명판에는 보통 번호와 해만 새긴다.']);
    look(b, 'engine', 1.1, -0.2, '주기관', ['3단 팽창 증기기관. 고압·중압·저압 실린더 셋이 나란히 서 있다.', '크랭크는 멈춰 있다. 누군가 기관을 세운 뒤 보일러 불만은 꺼뜨리지 않았다.']);
    for (const [i, x] of BOILER_X.entries()) {
      b.interact({
        id: `furnace${i}`,
        x,
        z: 3.4,
        r: 1.4,
        label: '보일러 화실',
        onAction: async (gg) => {
          if (gg.hasItem('idol')) {
            await burnIdol(gg, x);
            return;
          }
          await gg.say(
            '스카치 보일러의 화실 문 틈으로 붉은 불빛이 샌다. 석탄이 벌겋게 타고 있다.',
            gg.flag('got:engineerNotes') ? '"놈들은 불빛을 싫어한다." 기관장의 글이 떠오른다. 이 앞에 있으면 안전할지도 모른다.' : '여드레 동안 사람 없는 배에서, 누군가 계속 석탄을 넣어 왔다.',
          );
        },
        onItem: async (gg, item) => {
          if (item === 'idol') {
            await burnIdol(gg, x);
            return true;
          }
          return false;
        },
      });
    }
    look(b, 'coal', -5.2, 2.4, '석탄 더미', ['벙커에서 퍼 온 석탄 더미. 삽 손잡이가 아직 따뜻하다.'], 1.3);
    pickup(b, g, { item: 'engineerNotes', x: 4.1, y: 0.92, z: -6.85, ry: 0.3, label: '수첩', r: 1.2 });
  },
  onEnter(g) {
    if (!g.flag('engineSeen')) {
      g.setFlag('engineSeen');
      void (async () => {
        await g.wait(0.8);
        await g.say('기관실. 보일러 화실 문 틈으로 붉은 불빛이 새어 나온다.', '불이… 아직 타고 있다.');
      })();
    }
    if (g.hasItem('idol') && !g.flag('dead:eng2')) {
      g.spawnCreature({ id: 'eng2', x: -4.6, z: -6.5, h: 0, hp: 3, entrance: 'rise', speed: 1.25, delay: 2.2 });
    }
    if (g.flag('engAmbush') && !g.flag('dead:eng1')) {
      g.spawnCreature({ id: 'eng1', x: -4.6, z: -5.6, h: 0, hp: 3, entrance: 'rise', speed: 1.1, delay: 1.5 });
    }
  },
  update(g, room, dt, t) {
    // Dynamo simulation keeps running while you walk around the room.
    const r = dynamoTick(getDyn(g), dt);
    setDyn(g, r.s);
    if (r.ev) {
      if (!hasDynamoListeners() && DYN_TEXT[r.ev]) g.note(r.ev === 'warmed' ? '드레인에서 마른 증기가 나온다' : '회전계가 정격에 도달했다');
      emitDynamo(r.ev);
    }
    const s = r.s;
    // Water hammer draws something up from the bilges (once).
    if (lastHammers < 0) lastHammers = s.hammers;
    if (s.hammers > lastHammers) {
      lastHammers = s.hammers;
      if (!g.flag('engAmbush') && !g.flag('idolBurned')) {
        g.setFlag('engAmbush');
        void (async () => {
          await g.wait(2.5);
          g.sfx('stinger', { volume: 0.7 });
          g.spawnCreature({ id: 'eng1', x: -4.6, z: -5.6, h: 0, hp: 3, entrance: 'rise', speed: 1.1 });
          g.note('굉음이 배 밑바닥까지 울렸다… 무언가 그 소리를 들었다');
        })();
      }
    }
    const fly = room.get('flywheel');
    if (fly) fly.rotation.z -= s.rpm * dt * 30;
    const set = (name: string, target: number) => {
      const o = room.get(name);
      if (o) o.rotation.z = damp(o.rotation.z, target, 3, dt);
    };
    set('drainValve', s.drain ? -Math.PI * 3 : 0);
    set('stopValve', s.steam === 0 ? 0 : s.steam === 1 ? -Math.PI * 0.5 : -Math.PI * 4);
    set('rpmNeedle', 2.2 - s.rpm * 3.6);
    set('steamNeedle', 2.2 - 0.68 * 4.4);
    set('voltNeedle', s.breaker ? 2.2 - 0.55 * 4.4 : 2.2);
    set('ampNeedle', s.breaker ? 2.2 - (0.3 + Math.sin(t * 3) * 0.02) * 4.4 : 2.2);
    const br = room.get('breaker');
    if (br) br.rotation.x = damp(br.rotation.x, s.breaker ? 0.2 : -0.9, 8, dt);
    for (const i of [0, 1]) {
      const pg = room.get(`b${i}pressure`);
      if (pg) pg.rotation.z = 2.2 - 0.68 * 4.4 + Math.sin(t * 2 + i) * 0.02;
    }
    // Drain steam puffs
    const outlet = room.get('drainOutlet');
    const blowing = s.drain && s.steam > 0;
    if (outlet) {
      const base = new THREE.Vector3();
      outlet.getWorldPosition(base);
      for (const p of puffs) {
        p.userData.t = (p.userData.t + dt * 1.3) % 1;
        const k = p.userData.t as number;
        p.visible = blowing;
        if (!blowing) continue;
        p.position.set(base.x + Math.sin(k * 9 + p.id) * 0.1 * k, base.y + k * 1.2, base.z + 0.3 + k * 0.5);
        p.scale.setScalar(0.6 + k * 2.2);
        (p.material as THREE.MeshBasicMaterial).opacity = s.warm < 1 ? 0.45 : 0.25;
      }
    }
  },
};
