import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { rod } from '../../render/geo';
import * as P from '../props';
import { exit, look, rect } from './common';

const BOILER_X = [-2.4, 2.4];

function furnaceCam(bx: number): CameraDef {
  return { id: 'sbFurnace', pos: [bx + 2.3, 1.6, 1.2], look: [bx, 1.0, 4.3], fov: 50, zones: [] };
}

/** The heart goes into the St Brendan's fire: the end of the fourth act, and of the game. */
async function burnHeart(g: GameAPI, bx: number): Promise<void> {
  g.cutTo(furnaceCam(bx));
  g.player.face(bx, 4.2);
  await g.say('화실 문을 연다. 열기가 얼굴을 후려친다.', '손안의 심장이 빨리, 더 빨리 뛴다. 탈라사호의 돌이 그랬던 것처럼. 놓아 달라는 듯이.');
  g.player.pose('reach');
  g.sfx('furnace', { volume: 1.2 });
  await g.wait(0.5);
  g.takeItem('heart');
  g.setFlag('a4.done');
  g.sfx('burn', { volume: 1.3 });
  g.flash(0xbfe0ff, 0.95);
  g.shake(0.4, 3.0);
  g.killAllCreatures();
  await g.wait(2.0);
  g.cutTo(null);
  await g.say('심장이 불 속에서 갈라지며 길고 높은 소리를 냈다. 점도 선도 아닌, 끊기지 않는 하나의 소리.', '…그리고 소리가 멎었다.');
  await g.wait(0.6);
  await g.nextAct();
}

// Stokehold: x -5..5, z 0..7.6. Two Scotch boilers against the forward bulkhead, firing aft; the ladder up to
// the deckhouse in the after starboard corner; the bunker and a heap of coal to port.
export const sbstoke: RoomDef = {
  id: 'sbstoke',
  name: '세인트 브렌던호 화실',
  fog: { color: 0x060403, density: 0.075 },
  hemi: { sky: 0x5a4a3c, ground: 0x1a120c, intensity: 1.0 },
  grade: { saturation: 0.9, tint: 0xfff0dc },
  ambience: 'engine',
  surface: 'grate',
  bounds: rect(-5, 0, 5, 7.6),
  spawns: { fromDeck: { x: 3.7, z: 1.0, h: -Math.PI / 2 } },
  fireZones: [
    [BOILER_X[0], 3.25, 1.55],
    [BOILER_X[1], 3.25, 1.55],
  ],
  cameras: [
    { id: 'ladder', pos: [4.5, 3.6, 0.35], look: [-1.2, 1.0, 4.6], fov: 60, zones: [rect(-1.0, 0, 5, 7.6)] },
    { id: 'port', pos: [-4.5, 3.6, 0.35], look: [1.4, 1.0, 4.6], fov: 60, zones: [rect(-5, 0, -0.6, 7.6)] },
  ],
  build(b) {
    const H = 5.2;
    b.floor(-5, 0, 5, 7.6, M.chequer);
    b.ceiling(-5, 0, 5, 7.6, H, M.steelDark);
    b.wall(-5, 0, 5, 0, { h: H, mat: M.steelGreen });
    b.wall(-5, 7.6, 5, 7.6, { h: H, mat: M.steelDark });
    b.wall(-5, 0, -5, 7.6, { h: H, mat: M.steelGreen });
    b.wall(5, 0, 5, 7.6, { h: H, mat: M.steelGreen });

    for (const [i, x] of BOILER_X.entries()) {
      b.add(P.scotchBoiler(`sb${i}`), x, 0, 4.2, Math.PI, { dynamic: true });
      b.footprint(x, 5.85, 3.4, 3.3);
      b.light({ x, y: 1.1, z: 3.3, color: 0xff7a2e, intensity: 16, distance: 11, flicker: 0.6 });
    }
    // Steam mains up to the deck machinery.
    for (const x of BOILER_X) rod(b.staticRoot, M.rust, { x, y: 3.55, z: 5.5 }, { x, y: 4.8, z: 5.5 }, 0.12);
    rod(b.staticRoot, M.rust, { x: -2.4, y: 4.8, z: 5.5 }, { x: 2.4, y: 4.8, z: 5.5 }, 0.13);
    rod(b.staticRoot, M.rust, { x: 0, y: 4.8, z: 5.5 }, { x: 0, y: 4.8, z: 0.2 }, 0.11);
    // Bunker door and coal to port, ash buckets, the ladder up.
    b.add(P.shipDoor(0.7, 1.6, M.rust), -4.96, 0, 2.0, Math.PI / 2);
    b.add(P.coalHeap(1.0), -4.0, 0, 1.2, 0);
    b.circle(-4.0, 1.2, 0.9);
    b.add(P.barrel(0.28, 0.7), 1.0, 0, 0.5, 0);
    b.circle(1.0, 0.5, 0.3);
    b.add(P.ladder(5.2, 0.55), 4.4, 0, 0.12, 0);
    b.add(P.cageLamp('sbStokeLamp', true), 3.6, H, 1.0, 0);
    b.light({ x: 3.6, y: 4.6, z: 1.0, color: 0xffd9a0, intensity: 5, distance: 7, needsPower: true });

    // ---- interactions
    exit(b, { id: 'ladder', x: 4.3, z: 0.55, label: '사다리 (갑판으로)', to: 'sbdeck', spawn: 'fromStoke', sfx: 'ladder' });
    for (const x of BOILER_X) {
      b.interact({
        id: `furnace${x < 0 ? 'P' : 'S'}`,
        x,
        z: 3.4,
        r: 1.4,
        label: '보일러 화실',
        onAction: async (gg) => {
          if (gg.hasItem('heart')) {
            await burnHeart(gg, x);
            return;
          }
          await gg.say(
            '스카치 보일러의 화실 문 틈으로 붉은 불빛이 샌다. 권양기와 기관에 대는 증기다.',
            gg.flag('a4.rootUp') ? '불이다. 탈라사호에서도, 벨 코브에서도, 놈들은 불을 싫어했다.' : '화부들은 교대하러 올라갔다. 삽 하나가 석탄 더미에 꽂혀 있다.',
          );
        },
        onItem: async (gg, item) => {
          if (item !== 'heart') return false;
          await burnHeart(gg, x);
          return true;
        },
      });
    }
    look(b, 'coal', -3.4, 1.6, '석탄 더미', ['벙커에서 퍼 온 석탄 더미. 웨일스 탄이다. 연기가 적다.'], 1.3);
  },
  onEnter(g) {
    if (g.hasItem('heart') && !g.flag('a4.done')) {
      g.spawnCreature({ id: 'a4s1', x: -4.55, z: 6.9, h: Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.2, delay: 1.8 });
      if (!g.flag('a4.stokeHeart')) {
        g.setFlag('a4.stokeHeart');
        void (async () => {
          await g.wait(0.6);
          await g.say('화실은 비어 있다. 보일러 화실 문 틈의 붉은 빛. 그리고 벙커 쪽 어둠에서, 물 떨어지는 소리.');
        })();
      }
    }
  },
};
