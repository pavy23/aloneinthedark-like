import type { GameAPI, RoomDef } from '../types';
import { M } from '../../render/materials';
import { quad } from '../../render/geo';
import * as P from '../props';
import * as P3 from '../props3';
import * as P5 from '../props5';
import { look, rect } from './common';
import { SEATS, runHearing, withPellEp } from '../../game/epilogue';

const H = 3.6;

async function takeTheStand(g: GameAPI): Promise<void> {
  if (g.flag('ep.done')) {
    await g.say('위원회는 판정을 마쳤다.');
    return;
  }
  g.player.face(0, 7);
  await runHearing(g);
}

// The committee room of the Gravesend Marine Insurance Syndicate, London: x -5..5, z 0..8, the door in the
// south wall. The committee's long table across the north end (the chairman in the middle, the solicitor
// to his left as you face them), the witness table in front of it, the clerk with his cable instruments by
// the east wall, tall windows on the west wall.
export const inquiry: RoomDef = {
  id: 'inquiry',
  name: '그레이브센드 해상보험조합 위원회실',
  fog: { color: 0x0a0907, density: 0.05 },
  hemi: { sky: 0x8a8a84, ground: 0x2a2018, intensity: 1.15 },
  grade: { saturation: 0.78, tint: 0xfff4e6 },
  ambience: 'interior',
  surface: 'wood',
  bounds: rect(-5, 0, 5, 8),
  spawns: {
    door: { x: -3.5, z: 0.75, h: 0.3 },
  },
  cameras: [
    { id: 'hall', pos: [-4.4, 2.8, 0.45], look: [1.2, 1.0, 6.2], fov: 60, zones: [rect(-5, 2.2, 5, 8)] },
    { id: 'door', pos: [4.0, 2.7, 7.5], look: [-1.6, 0.9, 0.8], fov: 60, zones: [rect(-5, 0, 5, 2.6)] },
  ],
  build(b, g) {
    const pell = withPellEp(g);
    b.floor(-5, 0, 5, 8, M.woodLight);
    b.ceiling(-5, 0, 5, 8, H, M.plaster);
    // Panelled walls: dark wainscot below, plaster above.
    for (const [x0, z0, x1, z1, gaps] of [
      [-5, 0, 5, 0, [{ at: 1.5, w: 1.0, h: 2.2 }]],
      [-5, 8, 5, 8, []],
      [-5, 0, -5, 8, []],
      [5, 0, 5, 8, []],
    ] as const) {
      b.wall(x0, z0, x1, z1, { h: H, mat: M.plaster, gaps: [...gaps] });
      b.wall(x0, z0, x1, z1, { h: 1.15, mat: M.woodDark, t: 0.2, gaps: [...gaps], collide: false });
    }
    b.add(P.shipDoor(0.95, 2.15, M.woodDark), -3.5, 0, 0.02, 0);
    for (const z of [2.2, 4.6, 7.0]) b.add(P5.sashWindow(1.1, 2.0), -4.94, 0.95, z, Math.PI / 2);

    // The committee and their table.
    b.add(P5.committeeTable(5.6, 1.0), 0, 0, 6.3, Math.PI);
    b.footprint(0, 6.3, 5.7, 1.1);
    b.add(P5.seatedFigure({ coat: 0x22222a, trousers: 0x1c1c22, hair: 0x9a948a, tie: 0x3a1a1a }), SEATS.chair.x, 0, SEATS.chair.z, Math.PI, { dynamic: true, name: 'chairman' });
    b.add(P5.seatedFigure({ coat: 0x2a2620, trousers: 0x201c18, hair: 0x2a2018, tie: 0x1a2a3a }), SEATS.solicitor.x, 0, SEATS.solicitor.z, Math.PI, { dynamic: true, name: 'solicitor' });
    b.add(P5.seatedFigure({ coat: 0x262a2e, trousers: 0x1e2226, hair: 0x6a5a48, tie: 0x2a2a1a }), -1.8, 0, 7.1, Math.PI, { dynamic: true, name: 'underwriter' });
    b.footprint(0, 7.15, 5.4, 0.7);
    for (const x of [-3.4, 3.4]) {
      b.add(P.bookshelf(1.3, 2.4, 0.36), x, 0, 7.78, Math.PI);
      b.footprint(x, 7.78, 1.35, 0.4);
    }
    b.add(P.photoFrame(M.photoPortrait), 0, 2.55, 7.96, Math.PI, { scale: 2.2 });
    b.add(P3.wallClock(), 1.5, 2.6, 0.12, 0);

    // The witness table, the dossier on it.
    b.box(0, 0, 3.75, 1.3, 0.78, 0.6, M.wood, { collide: true });
    b.add(P.bookItem(M.leather), -0.25, 0.78, 3.7, 0.3);
    quad(b.staticRoot, M.paperBlank, 0.25, 0.785, 3.75, 0.3, 0.4, 0.1, -Math.PI / 2);

    // The clerk, with a siphon recorder and key on the line to the company's cable office.
    b.box(4.35, 0, 3.6, 0.9, 0.76, 1.6, M.woodDark, { collide: true });
    b.add(P3.siphonRecorder(), 4.4, 0.76, 3.3, -Math.PI / 2);
    b.add(P3.cableKey(), 4.3, 0.76, 4.0, -Math.PI / 2);
    b.add(P5.seatedFigure({ coat: 0x3a3630, trousers: 0x2a2620, hair: 0x4a3a28, arms: 'table' }), SEATS.clerk.x - 0.15, 0, SEATS.clerk.z, -Math.PI / 2, { dynamic: true, name: 'clerk' });
    b.circle(SEATS.clerk.x - 0.15, SEATS.clerk.z, 0.4);
    P.wire(b.staticRoot, [4.6, 0.9, 3.0], [4.95, 0.3, 2.2]);

    // Public benches by the door.
    for (const z of [1.2, 2.2]) {
      b.box(2.4, 0, z, 2.2, 0.45, 0.4, M.woodDark, { collide: true });
      b.box(2.4, 0.45, z + 0.22, 2.2, 0.5, 0.06, M.woodDark);
    }

    // Grey June daylight from the windows; the lamps over the table.
    for (const z of [2.2, 4.6, 7.0]) b.light({ x: -4.2, y: 2.3, z, color: 0xdfe4ea, intensity: 5, distance: 7.5 });
    b.add(P.cageLamp('epLamp1', true), -1.2, H, 6.0, 0);
    b.add(P.cageLamp('epLamp2', true), 1.2, H, 6.0, 0);
    b.light({ x: 0, y: 3.0, z: 6.0, color: 0xffd9a0, intensity: 7, distance: 8, needsPower: true });

    // ---- interactions
    b.interact({
      id: 'stand',
      x: 0,
      z: 3.2,
      r: 1.2,
      label: g.flag('ep.started') ? '증인석 (심문 계속)' : '증인석',
      verb: '증언하기',
      onAction: (gg) => takeTheStand(gg),
      // Opening the dossier from the inventory at the stand does the same.
      onItem: async (gg, item) => {
        if (item !== 'dossier') return false;
        await takeTheStand(gg);
        return true;
      },
    });
    b.interact({
      id: 'door',
      x: -3.5,
      z: 0.5,
      r: 1.2,
      label: '문',
      onAction: async (gg) => {
        gg.sfx('locked');
        await gg.say(gg.flag('ep.done') ? '판정이 났다. 이제 나가도 된다 — 서기가 문을 열어 줄 것이다.' : '수위가 문 앞에 서 있다. "심문이 끝나기 전에는 나가실 수 없습니다, 선생님."');
      },
    });
    look(b, 'chairman', 0, 5.6, '몰리 의장', ['그레이브센드 해상보험조합의 수석 인수인 에드거 몰리. 서른 해 동안 배와 화물의 운을 숫자로 바꿔 온 사람이다.'], 1.3);
    look(b, 'solicitor', 1.8, 5.6, '빙엄 변호사', ['조합의 변호사 사이러스 빙엄. 서류를 넘기는 손이 빠르다. 그의 일은 조합이 돈을 내지 않아도 되는 이유를 찾는 것이다.'], 1.3);
    look(b, 'clerk', SEATS.clerk.x - 0.9, SEATS.clerk.z, '서기', [
      pell
        ? '서기 앞의 사이펀 기록계는 회사의 케이블 사무소로 이어져 있다. 벨 코브에서 온 펠의 진술서도 이 선으로 왔다.'
        : '서기 앞의 사이펀 기록계는 회사의 케이블 사무소로 이어져 있다. 잉크 선은 조용하다.',
    ], 1.2);
    look(b, 'windows', -4.3, 4.6, '창문', ['창밖으로 6월의 런던이 시끄럽다. 마차와 자동차, 신문팔이. 바다는 멀다.'], 1.3);
    look(b, 'portrait', 0, 7.2, '초상화', ['조합 창립자의 초상화. 그 아래 놋쇠 명판: "QUOD DEUS AVERTAT" — 신께서 막아 주시기를.'], 1.0);
  },
  onEnter(g) {
    if (!g.flag('ep.arrived')) {
      g.setFlag('ep.arrived');
      void g.run(async () => {
        await g.wait(0.7);
        await g.say('위원회실. 기다란 탁자 뒤에 위원 셋이 앉아 있다. 가운데의 백발이 의장 몰리다.', '몰리 의장: "조사관, 증인석으로 오시오. 탈라사호 건을 시작하겠소."');
        g.note('증인석으로');
      });
    }
  },
};
