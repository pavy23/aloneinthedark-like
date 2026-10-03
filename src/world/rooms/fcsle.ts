import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import { M } from '../../render/materials';
import { mesh, part } from '../../render/geo';
import * as P from '../props';
import { exit, look, pickup, rect } from './common';
import { SIDE_KO, pellSide } from '../../game/act2';
import { encodeText } from '../../game/logic';
import { isEcho, knockReply } from '../../game/logic2';

type Side = 'port' | 'stbd';

const H = 2.3;
/** Chain-locker doors in the forward bulkhead (port is -X, the bow is +Z). */
const DOOR: Record<Side, { x: number; z: number }> = { port: { x: -1.3, z: 6 }, stbd: { x: 1.3, z: 6 } };
/** Where the operator sits once he is out: against the bulkhead beside his locker door. */
const SEAT: Record<Side, { x: number; z: number }> = { port: { x: -2.0, z: 5.45 }, stbd: { x: 2.0, z: 5.45 } };

const show = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−').split('').join(' ');
const showText = (text: string) => encodeText(text).map(show).join('   ');

/** Knock a message on the door, a dot a knuckle-rap, a dash a scrape; then listen. */
async function knock(g: GameAPI, side: Side, sent: string): Promise<void> {
  for (const code of encodeText(sent)) {
    for (const sym of code) {
      g.sfx(sym === '.' ? 'knock1' : 'scrape', { volume: 0.9 });
      await g.wait(sym === '.' ? 0.22 : 0.5);
    }
    await g.wait(0.35);
  }
  await g.wait(0.9);
  const voice = pellSide(g) === side ? 'pell' : 'mimic';
  const reply = knockReply(voice, sent);
  for (const code of encodeText(reply)) {
    for (const sym of code) {
      g.sfx(sym === '.' ? 'knock1' : 'scrape', { volume: 0.7 });
      await g.wait(sym === '.' ? 0.22 : 0.5);
    }
    await g.wait(0.35);
  }
  g.setFlag(`a2.knock.${side}`, isEcho(sent, reply) ? 1 : 2);
  if (isEcho(sent, reply)) {
    await g.say(`문 너머에서 대답이 돌아온다.\n${showText(reply)}`, '…내가 두드린 그대로다. 박자까지 똑같다.');
  } else {
    await g.say(`문 너머에서 대답이 돌아온다.\n${showText(reply)}`, '내가 친 신호가 아니다. 짧게, 길게, 짧게 — 누군가 알아듣고 답하고 있다.');
  }
}

async function swingOpen(g: GameAPI, side: Side): Promise<void> {
  const door = g.room.get(`lockerDoor_${side}`)?.getObjectByName('leaf');
  g.sfx('door');
  for (let i = 1; i <= 24; i++) {
    if (door) door.rotation.y = -(i / 24) * 1.35;
    await g.wait(1 / 40);
  }
}

async function freePell(g: GameAPI, side: Side): Promise<void> {
  await swingOpen(g, side);
  g.setFlag(`a2.door.${side}`);
  g.setFlag('pellFreed');
  const pell = g.room.get('pell');
  if (pell) pell.visible = true;
  await g.say(
    '사슬 더미 위에 웅크린 남자가 숨을 들이켰다. 담요를 두른 깡마른 남자. 한쪽 다리에 부목을 대고 있다.',
    '"…사람이오? 정말 사람이오?"',
    '"그레이브센드 해상보험조합에서 나온 조사관이오. 마그누스호가 밖에 와 있소."',
    '"펠이오. 통신사 토머스 펠. …놈들인 줄 알았소. 놈들은 흉내를 내요. 우리가 치는 신호를 듣고 그대로 따라 친다오."',
    '"선장님은 케이블을 놓아 주려 했소. 저 아래 그것이 붙들고 있는 게 바로 그 케이블이오. 놓아 주면 끝나오."',
    '"그런데 선장님이 처음에 권양기 브레이크에 고정핀을 박고 자물쇠를 채웠소. 겁먹은 선원들이 멋대로 케이블을 풀지 못하게. 열쇠는 늘 목에 걸고 다니셨지."',
    '"그날 밤 선장님은 2번 탱크로 내려갔소. 사리를 톱으로 끊겠다고. 그런데 누군가 기관실 밸브를 열어 탱크에 바닷물을 채웠소. 선장님은… 올라오지 못했소."',
    '"선수에 걸린 케이블은 두 가닥이오. 좌현 끝과 우현 끝. 놈이 어느 쪽을 타고 있는지는 시험실 브리지로 재 보면 알 거요. 베일 씨가 매일 하던 대로."',
    '"이건 베일 씨 열쇠요. 시험실은 사관 통로에 있소."',
  );
  await g.giveItem('testKey');
  // He crawls out of the locker and sits against the bulkhead, where he stays.
  const seat = SEAT[side];
  if (pell) pell.position.set(seat.x, 0, seat.z);
  g.room.col.addCircle(seat.x, seat.z, 0.38);
  await g.say('펠이 사슬 더미에서 기어 나와 격벽에 등을 기대앉는다.', '"나는 못 걷소. 여기서 기다리겠소. …케이블을 놓거든, 데리러 와 주시오."');
  const it = g.room.interactables.find((i) => i.id === `locker_${side}`);
  if (it) {
    it.label = '통신사 펠';
    it.verb = '말 걸기';
  }
}

async function talkPell(g: GameAPI): Promise<void> {
  if (g.flag('cableFreed')) {
    await g.say('"…들었소. 케이블이 빠져나가는 소리. 배가 몸을 펴는 소리."', '"정말로 끝난 거요? …데려가 주겠소?"');
    g.player.pose('crouch');
    await g.wait(0.5);
    g.setFlag('pellCarried');
    const pell = g.room.get('pell');
    if (pell) pell.visible = false;
    g.player.pose('none');
    await g.say(
      '펠을 등에 업었다. 생각보다 가볍다. 여드레를 굶은 사람의 무게다.',
      g.flag('dawn') ? '"줄사다리까지만 가면 되오." 내 어깨 위에서 그가 중얼거린다.' : '"무선실이오. 마그누스호에 알려야 하오." 내 어깨 위에서 그가 중얼거린다.',
    );
    g.note('펠을 업었다');
    return;
  }
  if (g.hasItem('brakeKey')) {
    await g.say('"선장님 열쇠… 찾았구려." 펠이 눈을 감는다.', '"어서 가시오. 고정핀을 풀고, 드럼을 기어에서 빼고, 그다음에 브레이크요. 순서를 틀리면 케이블이 기관째 끌고 가오."');
    return;
  }
  if (g.flag('a2.measured')) {
    await g.say(
      '"열쇠는 선장님 목에 있소. 2번 탱크요."',
      '"탱크에 물이 차 있으면 문을 못 여오. 기관실 밸브 상자로 물부터 빼야 하오. 해수 밸브를 연 채로 펌프를 돌리면 바다를 퍼 올릴 뿐이오."',
    );
    return;
  }
  await g.say('"시험실은 사관 통로에 있소. 좌현 끝, 우현 끝 — 둘 다 재 보시오. 천 해리 넘게 육지국까지 이어진 쪽은 멀쩡한 거요. 몇 해리 앞에서 끊긴 쪽, 거기에 놈이 붙어 있소."');
}

async function mimicOut(g: GameAPI, side: Side): Promise<void> {
  await swingOpen(g, side);
  g.setFlag(`a2.door.${side}`);
  g.sfx('chain', { volume: 1.2 });
  g.sfx('stinger', { volume: 0.9 });
  g.shake(0.15, 0.8);
  const d = DOOR[side];
  g.spawnCreature({ id: 'a2mimic', x: d.x, z: d.z - 0.75, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.25 });
  await g.say('사슬 더미가 꿈틀거렸다. 쇠사슬 사이로 젖은 팔이 뻗어 나온다!', '…저것이 문 너머에서 내 신호를 따라 친 것이다.');
}

async function lockerDoor(g: GameAPI, side: Side): Promise<void> {
  const isPell = pellSide(g) === side;
  if (g.flag(`a2.door.${side}`)) {
    if (isPell && g.flag('pellCarried')) await g.say('펠이 기대앉아 있던 자리에 젖은 담요만 남아 있다.');
    else if (isPell) await talkPell(g);
    else await g.say('활짝 열린 문 너머로 사슬 더미만 보인다. 바닷물 냄새가 짙다.');
    return;
  }
  const heard = g.num(`a2.knock.${side}`);
  const what = heard === 1 ? '(아까 내 신호를 그대로 따라 쳤다.)' : heard === 2 ? '(아까 다른 신호로 대답했다.)' : '안쪽에서 두드리는 소리가 난다.';
  const c = await g.ask(`${SIDE_KO[side]} 체인 로커의 문. ${what}`, [
    { label: '두드린다:  · · ·  − − −  · · ·  (SOS)' },
    { label: '두드린다:  · − ·  (R — 수신)' },
    { label: '문의 빗장을 벗기고 연다' },
    { label: '그만둔다' },
  ]);
  if (c === 0) await knock(g, side, 'SOS');
  else if (c === 1) await knock(g, side, 'R');
  else if (c === 2) {
    if (isPell) await freePell(g, side);
    else await mimicOut(g, side);
  }
}

// Crew's quarters under the forecastle: x -4.4..4.4 (port -X), z -4..6 (bow +Z), tapering forward. The
// forward bulkhead has the two chain-locker doors; the ladder up to the deck scuttle is aft, starboard.
export const fcsle: RoomDef = {
  id: 'fcsle',
  name: '선원 거주구',
  fog: { color: 0x050403, density: 0.11 },
  hemi: { sky: 0x4a443a, ground: 0x15110c, intensity: 0.9 },
  grade: { saturation: 0.78, tint: 0xfff0d8 },
  ambience: 'interior',
  surface: 'wood',
  bounds: rect(-4.4, -4, 4.4, 6),
  spawns: { fromDeck: { x: 3.3, z: -2.9, h: -0.8 } },
  cameras: [
    { id: 'mess', pos: [4.0, 2.05, -3.75], look: [-1.6, 0.7, 2.6], fov: 62, zones: [rect(-4.4, -4, 4.4, 1.2)] },
    { id: 'bulkhead', pos: [-3.5, 2.05, -0.2], look: [1.3, 0.8, 5.6], fov: 60, zones: [rect(-4.4, 1.0, 4.4, 6)] },
  ],
  build(b, g) {
    // Floor follows the tapering hull.
    const outline: Array<[number, number]> = [
      [-4.4, -4],
      [4.4, -4],
      [4.4, 2.5],
      [2.4, 6],
      [-2.4, 6],
      [-4.4, 2.5],
    ];
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const fl = mesh(new THREE.ShapeGeometry(shape), M.wood);
    fl.rotation.x = -Math.PI / 2;
    b.staticRoot.add(fl);
    b.ceiling(-4.4, -4, 4.4, 7.6, H, M.paintDirty);
    // Deck beams under the deckhead
    for (let z = -3.4; z < 6; z += 1.2) b.box(0, H - 0.16, z, 8.8, 0.16, 0.12, M.steelDark);
    const wall = M.paint;
    b.wall(-4.4, -4, 4.4, -4, { h: H, mat: wall });
    b.wall(-4.4, -4, -4.4, 2.5, { h: H, mat: wall });
    b.wall(4.4, -4, 4.4, 2.5, { h: H, mat: wall });
    b.wall(-4.4, 2.5, -2.4, 6, { h: H, mat: wall });
    b.wall(4.4, 2.5, 2.4, 6, { h: H, mat: wall });
    b.wall(-2.4, 6, 2.4, 6, { h: H, mat: M.steelDark, gaps: [{ at: 1.1, w: 0.72, h: 1.4 }, { at: 3.7, w: 0.72, h: 1.4 }] });
    // The two chain lockers behind the bulkhead (only seen through their doors).
    b.wall(0, 6, 0, 7.4, { h: H, mat: M.steelDark, collide: false });
    b.wall(-2.2, 7.4, 2.2, 7.4, { h: H, mat: M.steelDark, collide: false });
    b.wall(-2.2, 6, -2.2, 7.4, { h: H, mat: M.steelDark, collide: false });
    b.wall(2.2, 6, 2.2, 7.4, { h: H, mat: M.steelDark, collide: false });
    b.floor(-2.2, 6, 2.2, 7.4, M.rust);
    for (const side of ['port', 'stbd'] as Side[]) {
      const d = DOOR[side];
      const open = g.flag(`a2.door.${side}`);
      const door = P.shipDoor(0.72, 1.36, M.steelDark, open);
      b.add(door, d.x, 0, d.z, Math.PI, { dynamic: true, name: `lockerDoor_${side}` });
      b.add(P.chainHeap(0.55), d.x, 0, 6.8, 0);
      b.add(P.chainColumn(H), d.x + (side === 'port' ? -0.35 : 0.35), 0, 7.0, 0);
    }
    // Wireless operator in his locker (hidden until his door opens).
    const pellSideNow = pellSide(g);
    const freed = g.flag('pellFreed');
    const seated = freed && !g.flag('pellCarried');
    const pellAt = freed ? SEAT[pellSideNow] : { x: DOOR[pellSideNow].x, z: 6.55 };
    const pell = P.survivor();
    pell.visible = seated;
    b.add(pell, pellAt.x, 0, pellAt.z, Math.PI, { dynamic: true, name: 'pell' });
    if (seated) b.circle(pellAt.x, pellAt.z, 0.38);
    // Hawse / spurling pipes casing between the doors.
    for (const x of [-0.42, 0.42]) {
      b.add(P.chainColumn(H), x, 0, 5.72, 0);
      b.circle(x, 5.72, 0.2);
    }

    // Bunks along both sides, the mess table between.
    for (const z of [-2.6, -0.4]) {
      b.add(P.bunk(2.0, 0.85, true), -3.92, 0, z, 0);
      b.footprint(-3.92, z, 0.9, 2.05);
    }
    for (const z of [-0.2, 1.6]) {
      b.add(P.bunk(2.0, 0.85, true), 3.92, 0, z, 0);
      b.footprint(3.92, z, 0.9, 2.05);
    }
    b.add(P.table(0.9, 2.2, 0.76, M.woodDark), 0, 0, -1.2, 0);
    b.footprint(0, -1.2, 0.95, 2.25);
    for (const x of [-0.8, 0.8]) {
      b.add(P.bench(2.0), x, 0, -1.2, Math.PI / 2);
      b.footprint(x, -1.2, 0.32, 2.0);
    }
    // Things on the table: tin mugs, cards, a ship's biscuit tin.
    const clutter = new THREE.Group();
    part(clutter, M.ironLight, -0.2, 0.76, -1.6, 0.08, 0.1, 0.08);
    part(clutter, M.ironLight, 0.25, 0.76, -0.5, 0.08, 0.1, 0.08);
    part(clutter, M.paperBlank, 0.1, 0.765, -1.0, 0.25, 0.005, 0.18);
    part(clutter, M.redPaint, -0.1, 0.76, -2.0, 0.22, 0.14, 0.22);
    b.add(clutter, 0, 0, 0, 0);
    // Lockers on the aft bulkhead, sea chests, oilskins, the bogie stove.
    for (let i = 0; i < 4; i++) b.add(P.locker(0.6, 1.85, 0.5, M.steelGreen), -3.1 + i * 0.65, 0, -3.7, 0);
    b.footprint(-2.12, -3.7, 2.62, 0.52);
    b.add(P.crate(0.8, 0.5, 0.5, M.woodDark), -3.0, 0, 1.15, 0.05);
    b.footprint(-3.0, 1.15, 0.85, 0.55);
    b.add(P.crate(0.8, 0.5, 0.5, M.woodDark), 2.85, 0, -2.3, -0.05);
    b.footprint(2.85, -2.3, 0.85, 0.55);
    b.add(P.oilskins(), 4.32, 0, -2.6, -Math.PI / 2);
    b.add(P.oilskins(), 4.32, 0, -1.8, -Math.PI / 2);
    b.add(P.bogieStove(H), -3.2, 0, 2.9, 0.4);
    b.circle(-3.2, 2.9, 0.35);
    // Ladder up to the scuttle on deck.
    b.add(P.ladder(H, 0.5), 3.6, 0, -3.92, 0);
    // Wet footprints from the ladder to the chain lockers; sea water sloshing on the deck planks.
    b.add(
      P.footprints([
        [3.4, -3.2],
        [2.2, -2.0],
        [1.6, 0.8],
        [1.2, 3.4],
        [0.9, 5.2],
      ]),
      0,
      0,
      0,
      0,
    );
    b.add(P.puddle(0.7), 1.4, 0.012, 4.4, 0);
    b.add(P.puddle(0.5), -1.6, 0.012, 1.6, 0);

    // Light: a hurricane lamp hung over the table (someone kept it burning), dim electric lamps.
    const lamp = P.lanternItem();
    lamp.scale.setScalar(1.3);
    b.add(lamp, 0, 1.55, -1.2, 0, { dynamic: true, name: 'messLamp' });
    b.light({ x: 0, y: 1.6, z: -1.2, color: 0xffb066, intensity: 9, distance: 9, flicker: 0.4 });
    b.add(P.cageLamp('bulbF1', true), -2.0, H, 2.6, 0, { dynamic: true });
    b.add(P.cageLamp('bulbF2', true), 2.2, H, -2.6, 0, { dynamic: true });
    b.light({ x: -2.0, y: 1.9, z: 2.6, color: 0xffd6a0, intensity: 7, distance: 8, needsPower: true, flicker: 0.5 });
    b.light({ x: 2.2, y: 1.9, z: -2.6, color: 0xffd6a0, intensity: 6, distance: 8, needsPower: true, flicker: 0.3 });

    // ---- interactions
    exit(b, { id: 'ladder', x: 3.6, z: -3.4, label: '사다리 (갑판으로)', to: 'deck', spawn: 'fromFcsle', sfx: 'ladder' });
    for (const side of ['port', 'stbd'] as Side[]) {
      const d = DOOR[side];
      b.interact({
        id: `locker_${side}`,
        x: d.x,
        z: d.z - 0.35,
        r: 1.3,
        label: g.flag('pellFreed') && !g.flag('pellCarried') && pellSide(g) === side ? '통신사 펠' : `${SIDE_KO[side]} 체인 로커`,
        verb: g.flag('pellFreed') && !g.flag('pellCarried') && pellSide(g) === side ? '말 걸기' : '조사',
        onAction: (gg) => lockerDoor(gg, side),
      });
    }
    pickup(b, g, { item: 'bosunNotes', x: 0.15, y: 0.78, z: -0.9, ry: 0.4, label: '수첩', r: 1.3 });
    b.interact({
      id: 'lockers',
      x: -2.1,
      z: -3.1,
      r: 1.3,
      label: '사물함',
      onAction: async (gg) => {
        if (!gg.flag('got:rum')) {
          gg.setFlag('got:rum');
          await gg.say('선원들의 사물함. 하나씩 열어 본다. 젖은 옷, 사진, 편지 묶음….', '맨 끝 사물함 깊숙이, 양말에 싼 럼 병이 있다.');
          await gg.giveItem('rum');
          return;
        }
        await gg.say('남은 사물함에는 젖은 옷가지뿐이다. 주인들은 돌아오지 않았다. 적어도, 사람의 모습으로는.');
      },
    });
    look(b, 'bunks', -3.2, -1.5, '침상', ['이층 침상. 담요가 물을 머금어 무겁다.', '베개마다 사람 머리 모양으로 젖은 자국이 남아 있다. 누군가 아주 최근까지 여기 누워 있었다.']);
    look(b, 'table', 0.6, -2.4, '식탁', ['먹다 만 비스킷과 엎어진 양철 컵, 카드 패가 그대로 놓여 있다.', '열흘 전 저녁에서 시간이 멈춘 식탁이다.']);
    look(b, 'stove', -2.8, 2.5, '난로', ['작은 무쇠 난로. 아직 온기가 남아 있다.', '누군가 여기서 불을 지켰다. 불 곁은 안전하다는 걸 아는 누군가가.'], 1.1);
    look(b, 'oilskins', 3.8, -2.2, '방수복', ['노란 방수복 두 벌이 못에 걸려 있다. 둘 다 젖어 있다. 안쪽까지.'], 1.1);
    look(b, 'pipes', 0, 5.2, '닻사슬 관', ['갑판의 양묘기에서 내려온 닻사슬이 관을 지나 체인 로커로 떨어진다.', '사슬이 이따금 저 혼자 덜그럭거린다. 배가 앞으로 끌려갈 때마다.'], 1.0);
  },
  onEnter(g) {
    if (!g.flag('fcsleSeen')) {
      g.setFlag('fcsleSeen');
      void (async () => {
        await g.wait(0.8);
        g.sfx('knock3', { volume: 1.0 });
        await g.wait(1.2);
        g.sfx('knock3', { volume: 0.8 });
        await g.say(
          '선원 거주구. 이층 침상 사이로 바닷물 냄새가 짙게 고여 있다.',
          '앞쪽 격벽 너머에서 두드리는 소리가 난다. 세 번, 쉬고, 세 번.',
          '…소리가 두 군데서 난다. 좌현 체인 로커와 우현 체인 로커. 똑같은 박자로.',
        );
      })();
    }
    // The boat's crew who came back.
    g.spawnCreature({ id: 'a2fc1', x: -0.4, z: 0.6, h: Math.PI, hp: 3, entrance: 'rise', speed: 1.15, delay: 2.5 });
    g.spawnCreature({ id: 'a2fc2', x: -3.0, z: 0.2, h: Math.PI / 2, hp: 3, entrance: 'rise', speed: 1.1, delay: 7 });
  },
  update(g, room, dt, t) {
    const lamp = room.get('messLamp');
    if (lamp) {
      lamp.rotation.z = Math.sin(t * 0.9) * 0.08;
      lamp.rotation.x = Math.sin(t * 0.6 + 1) * 0.05;
    }
    // Both lockers keep knocking until the operator is out.
    if (!g.flag('pellFreed')) {
      const k = Math.floor(t / 9);
      const prev = Math.floor((t - dt) / 9);
      if (k !== prev) g.sfx('knock3', { volume: 0.35 });
    }
  },
};
