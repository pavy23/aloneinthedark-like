import type { GameAPI, RoomDef } from '../types';
import { M } from '../../render/materials';
import { quad } from '../../render/geo';
import * as P from '../props';
import * as P3 from '../props3';
import { exit, look, pickup, rect } from './common';
import { withPell } from '../../game/act3';
import { encodeText } from '../../game/logic';

const H = 3.0;
const show = (text: string) => encodeText(text).map((c) => c.replace(/\./g, '·').replace(/-/g, '−')).join('  ');

/** Knock a message on the battery-room door: a dot a knuckle-rap, a dash a scrape. */
async function knockOut(g: GameAPI, text: string, vol = 0.9): Promise<void> {
  for (const code of encodeText(text)) {
    for (const sym of code) {
      g.sfx(sym === '.' ? 'knock1' : 'scrape', { volume: vol });
      await g.wait(sym === '.' ? 0.22 : 0.5);
    }
    await g.wait(0.35);
  }
}

const KNOCKS: Array<{ label: string; text: string }> = [
  { label: 'R로 답한다 (·−·)', text: 'R' },
  { label: 'K를 친다 (−·−)', text: 'K' },
  { label: 'SOS를 친다 (···−−−···)', text: 'SOS' },
];

/** Pell has barred himself in. He asks "K" (go ahead); a man answers "R" (received) — the thing copies. */
async function pellDoor(g: GameAPI): Promise<void> {
  if (!g.flag('a3.doorTried')) {
    g.setFlag('a3.doorTried');
    g.sfx('locked');
    await g.say('축전지실 문. 안쪽에 빗장이 걸려 있다.', '손잡이를 흔들자 안에서 무언가 움직이는 기척이 났다. 그리고 —');
  }
  await g.wait(0.4);
  await knockOut(g, 'K', 0.8);
  await g.say(`안에서 두드린다.\n${show('K')}`);
  const c = await g.ask('어떻게 답할까?', [...KNOCKS.map((k) => ({ label: k.label })), { label: '물러난다' }]);
  if (c >= KNOCKS.length) return;
  const sent = KNOCKS[c].text;
  await knockOut(g, sent);
  await g.wait(0.8);
  if (sent === 'K') {
    g.setFlag('a3.doorCopied');
    await g.say('안이 조용해졌다. 한참을 기다려도 대답이 없다.', '…들은 것을 그대로 따라 쳤다. 그건 놈이 하는 짓이다. 안에 있는 사람은 그걸 안다.');
    return;
  }
  if (sent !== 'R') {
    await g.say('대답 대신, 안에서 다시 같은 신호가 온다. −·−. 계속하라는 — 아니면 누구냐고 묻는 신호.');
    return;
  }
  g.sfx('unlock');
  await g.wait(0.6);
  g.setFlag('a3.batteryOpen');
  await g.say('빗장이 빠지는 소리. 문이 한 뼘 열리고, 램프 불빛 속에 수척한 얼굴이 나타났다.', '"…조사관님? 정말 조사관님이오?"');
  await g.goto('battery', 'fromOps');
}

/** Alone: the thing behind the door copies every knock, and when the door opens it comes out. */
async function mimicDoor(g: GameAPI): Promise<void> {
  if (!g.flag('a3.doorTried')) {
    g.setFlag('a3.doorTried');
    await g.say('축전지실 문. 잠겨 있지 않다.', '손잡이를 잡는 순간, 안에서 두드리는 소리가 났다.');
    await knockOut(g, 'S S', 0.8);
    await g.say(`${show('S')}   ${show('S')}\n세 번, 쉬고, 세 번.`);
  }
  const c = await g.ask('문 너머에 무언가 있다.', [...KNOCKS.map((k) => ({ label: k.label })), { label: '문을 연다' }, { label: '물러난다' }]);
  if (c === KNOCKS.length + 1) return;
  if (c < KNOCKS.length) {
    const sent = KNOCKS[c].text;
    await knockOut(g, sent);
    await g.wait(0.9);
    await knockOut(g, sent, 0.75);
    g.setFlag('a3.mimicHeard');
    await g.say(`문 너머에서 대답이 돌아온다.\n${show(sent)}`, '…내가 친 그대로다. 박자까지 똑같다.');
    return;
  }
  // Open it.
  g.setFlag('a3.batteryOpen');
  const leaf = g.room.get('batteryDoor')?.getObjectByName('leaf');
  g.sfx('door');
  for (let i = 1; i <= 16; i++) {
    if (leaf) leaf.rotation.y = -(i / 16) * 1.3;
    await g.wait(1 / 40);
  }
  g.sfx('stinger', { volume: 0.9 });
  g.shake(0.12, 0.6);
  // In the doorway, an arm's length from me.
  g.spawnCreature({ id: 'a3mimic', x: 4.55, z: 4.5, h: -Math.PI / 2, hp: 3, speed: 1.25 });
  await g.say('문틈으로 젖은 손이 먼저 나왔다. 그다음에 얼굴이.', '역의 제복을 입은 남자. 입술이 움직인다. 소리 없이, 세 번, 쉬고, 세 번.');
}

async function batteryDoor(g: GameAPI): Promise<void> {
  if (g.flag('a3.batteryOpen')) {
    await g.goto('battery', 'fromOps');
    return;
  }
  if (withPell(g)) await pellDoor(g);
  else await mimicDoor(g);
}

// Operating room: x -5..5, z 0..7. Door to the yard in the south wall (x=0), to the battery room in the
// east wall (z=4.5). The recorders on the long table under the north wall, the superintendent's desk west,
// the stove east.
export const opsroom: RoomDef = {
  id: 'opsroom',
  name: '통신실',
  fog: { color: 0x060504, density: 0.075 },
  hemi: { sky: 0x4c4a44, ground: 0x15130f, intensity: 0.9 },
  grade: { saturation: 0.78, tint: 0xfff0dc },
  ambience: 'station',
  surface: 'wood',
  bounds: rect(-5, 0, 5, 7),
  spawns: {
    fromYard: { x: 0, z: 0.8, h: 0 },
    fromBattery: { x: 4.2, z: 4.5, h: -Math.PI / 2 },
  },
  cameras: [
    { id: 'door', pos: [-4.5, 2.6, 0.4], look: [2.0, 0.9, 5.5], fov: 60, zones: [rect(-5, 0, 5, 3.4)] },
    { id: 'table', pos: [4.5, 2.6, 2.5], look: [-2.0, 0.9, 6.2], fov: 62, zones: [rect(-5, 3.2, 5, 7)] },
  ],
  build(b, g) {
    b.floor(-5, 0, 5, 7, M.deck);
    b.ceiling(-5, 0, 5, 7, H, M.paintDirty);
    b.wall(-5, 0, 5, 0, { h: H, mat: M.plaster, gaps: [{ at: 5, w: 1.0, h: 2.1 }] });
    b.wall(-5, 7, 5, 7, { h: H, mat: M.plaster });
    b.wall(-5, 0, -5, 7, { h: H, mat: M.plaster });
    b.wall(5, 0, 5, 7, { h: H, mat: M.plaster, gaps: [{ at: 4.5, w: 1.0, h: 2.1 }] });
    // Varnished wainscot round the walls.
    for (const [x0, z0, x1, z1] of [
      [-5, 0.09, 5, 0.09],
      [-5, 6.91, 5, 6.91],
      [-4.91, 0, -4.91, 7],
      [4.91, 0, 4.91, 7],
    ] as const)
      b.wall(x0, z0, x1, z1, { h: 1.0, mat: M.woodDark, t: 0.03, collide: false });
    b.add(P3.houseDoor(0.9, 2.0), 0, 0, 0.1, 0);
    b.add(P3.houseDoor(0.9, 2.0, M.woodDark, g.flag('a3.batteryOpen')), 4.92, 0, 4.5, -Math.PI / 2, { dynamic: true, name: 'batteryDoor' });
    for (const x of [-3.4, -1.6]) b.add(P3.houseWindow(0.9, 1.1, false), x, 1.0, 0.1, 0);

    // The recorder table under the north wall: two siphon recorders, their keys, rolls of tape.
    b.add(P.table(6.2, 0.9, 0.78, M.woodDark), -0.6, 0, 6.35, 0);
    b.footprint(-0.6, 6.35, 6.25, 0.95);
    b.add(P3.siphonRecorder(), -2.4, 0.78, 6.35, 0);
    b.add(P3.siphonRecorder(), 0.6, 0.78, 6.35, 0, { dynamic: true, name: 'recorder' });
    b.add(P3.cableKey(), -2.4, 0.78, 5.95, 0);
    b.add(P3.cableKey(), 0.6, 0.78, 5.95, 0);
    b.add(P3.tapeRolls(), 2.0, 0.78, 6.6, 0);
    // A long curl of tape run off the live recorder onto the floor.
    for (let i = 0; i < 6; i++) quad(b.staticRoot, M.tape, 0.75 + i * 0.12, 0.012, 5.7 - i * 0.28, 0.06, 0.3, i * 0.4, -Math.PI / 2);
    b.add(P3.wallClock(), 0, 2.25, 6.93, Math.PI, { dynamic: true, name: 'clock' });
    // The night clerk, slumped over the live recorder (until he gets up).
    if (!g.flag('a3.clerkUp')) {
      b.add(P3.slumpedClerk(), 0.6, 0, 5.45, 0, { dynamic: true, name: 'clerk' });
      b.add(P.chair(M.wood), 0.6, 0, 5.4, 0, { dynamic: true, name: 'clerkChair' });
      b.circle(0.6, 5.4, 0.3, 'clerk');
    } else {
      b.add(P.chair(M.wood, true), 0.9, 0, 5.1, 0.8);
    }
    b.add(P.chair(M.wood), -2.4, 0, 5.4, 0);
    b.circle(-2.4, 5.4, 0.25);
    b.add(P.puddle(0.6), 0.2, 0.012, 4.9, 0);

    // The superintendent's desk (west), a bookcase of code books and manuals.
    b.add(P.desk(1.4, 0.7), -4.3, 0, 3.0, Math.PI / 2);
    b.footprint(-4.3, 3.0, 0.72, 1.42);
    b.add(P.chair(M.wood), -3.55, 0, 3.0, -Math.PI / 2);
    b.circle(-3.55, 3.0, 0.25);
    b.add(P.bookshelf(1.1, 1.9, 0.34), -4.8, 0, 5.4, Math.PI / 2);
    b.footprint(-4.8, 5.4, 0.36, 1.12);
    b.add(P.coatHook(), -1.2, 0, 0.12, 0);
    b.add(P.photoFrame(M.photoPortrait), -4.88, 1.6, 1.4, Math.PI / 2);

    // Stove (cold) and the shelf beside it (east).
    b.add(P.bogieStove(H), 3.9, 0, 1.4, 0);
    b.circle(3.9, 1.4, 0.32);
    b.box(4.72, 0.95, 2.5, 0.42, 0.04, 1.0, M.woodDark);
    b.add(P.crate(0.7, 0.5, 0.5, M.woodLight), 4.4, 0, 0.5, 0.1);
    b.footprint(4.4, 0.5, 0.75, 0.55);

    // Light: the oil lamp on the recorder table, still burning; a dim one on the desk.
    const lamp = P.lanternItem();
    b.add(lamp, -1.0, 0.78, 6.25, 0, { dynamic: true, name: 'tableLamp' });
    b.light({ x: -1.0, y: 1.35, z: 6.0, color: 0xffb066, intensity: 9, distance: 9, flicker: 0.3 });
    b.light({ x: -4.2, y: 1.2, z: 3.2, color: 0xffa050, intensity: 2.5, distance: 4, flicker: 0.2 });
    b.light({ x: 0, y: 2.2, z: 0.6, color: 0x6a7c90, intensity: 1.4, distance: 4 });

    // ---- interactions
    exit(b, { id: 'yardDoor', x: 0, z: 0.45, label: '문 (마당으로)', to: 'station', spawn: 'fromOps' });
    b.interact({
      id: 'batteryDoor',
      x: 4.55,
      z: 4.5,
      r: 1.3,
      label: '축전지실 문',
      verb: g.flag('a3.batteryOpen') ? '이동' : '조사',
      onAction: (gg) => batteryDoor(gg),
    });
    b.interact({
      id: 'recorder',
      x: 0.6,
      z: 5.45,
      r: 1.35,
      label: '사이펀 기록계',
      onAction: async (gg) => {
        if (!gg.flag('a3.tapeSeen')) {
          await gg.say(
            '기록계 앞에 남자가 엎드려 있다. 역의 사환이다. 머리카락에서 물이 떨어진다. 이 방에는 물이 없는데.',
            '그의 팔 밑으로 기록지가 길게 풀려 나와 있다. 2월 21일 밤, 마지막 근무분이다.',
          );
        }
        if (gg.flag('a3.recorderBurnt')) {
          await gg.say('기록계의 코일이 타서 시커멓다. 기록지는 그래도 남아 있다.');
        }
        await gg.openPanel('tape');
        if (!gg.flag('a3.clerkUp')) {
          gg.setFlag('a3.clerkUp');
          gg.room.col.removeTag('clerk');
          const clerk = gg.room.get('clerk');
          gg.sfx('creak', { volume: 1.0 });
          await gg.wait(0.8);
          if (clerk) clerk.visible = false;
          const chair = gg.room.get('clerkChair');
          if (chair) {
            chair.rotation.z = 1.45;
            chair.position.x += 0.55;
          }
          gg.sfx('stinger', { volume: 0.9 });
          gg.spawnCreature({ id: 'a3clerk', x: 0.6, z: 5.45, h: Math.PI, hp: 3, speed: 1.1 });
          await gg.say('엎드려 있던 사환이 고개를 들었다.', '눈이 없다. 눈이 있던 자리에서 바닷물이 흘러내린다.');
        }
      },
    });
    look(b, 'spare', -2.4, 5.5, '예비 기록계', ['예비 사이펀 기록계. 잉크병이 말라붙어 있다.', '케이블 하나에 기록계 둘. 하나가 고장 나도 회선이 멈추지 않도록.'], 1.2);
    look(b, 'keys', -1.0, 5.6, '케이블 키', [
      '케이블 키. 오른쪽을 누르면 한 방향, 왼쪽을 누르면 반대 방향으로 전류가 나간다. 점과 선이다.',
      '여기서 보낸 신호는 이 방 기록지에 찍히지 않는다. 찍히는 것은 들어오는 신호뿐이다.',
    ], 1.2);
    look(b, 'clock', 0, 6.4, '벽시계', ['시계는 아직 간다. 세 시 십 분.', '누군가 엿새 동안 태엽을 감았다.'], 1.1);
    look(b, 'stove', 3.6, 1.6, '난로', ['난로가 차갑다. 재에 손을 넣어도 온기가 없다.'], 1.1);
    pickup(b, g, { item: 'stationDiary', x: -4.25, y: 0.76, z: 3.2, ry: 0.3, label: '소장의 일지', r: 1.3 });
    pickup(b, g, { item: 'codeCard', x: -1.6, y: 0.79, z: 6.05, ry: -0.2, label: '판독 요령 카드', r: 1.3 });
    pickup(b, g, { item: 'candle', x: 4.7, y: 0.99, z: 2.25, ry: Math.PI / 2, label: '양초와 성냥', r: 1.2 });
    pickup(b, g, { item: 'rum3', x: 4.7, y: 0.99, z: 2.8, ry: 0.4, label: '럼 병', r: 1.2 });
  },
  onEnter(g, _room, from) {
    if (!g.flag('a3.opsSeen')) {
      g.setFlag('a3.opsSeen');
      void (async () => {
        await g.wait(0.6);
        await g.say(
          '통신실. 기록계 앞 램프 하나가 아직 타고 있다. 기름은 진작 떨어졌어야 했다.',
          '시계가 똑딱인다. 그 밖에는 아무 소리도 없다. 기록계의 사이펀만이 가끔, 저 혼자 떤다.',
        );
      })();
    }
    // The clerk keeps coming back for the recorder until he is put down.
    if (g.flag('a3.clerkUp')) g.spawnCreature({ id: 'a3clerk', x: 0.6, z: 4.9, h: Math.PI, hp: 3, speed: 1.1, delay: from === 'fromYard' ? 2 : 1 });
    // If I left it alive, it is waiting by the stove (away from either door).
    if (g.flag('a3.batteryOpen') && !withPell(g)) g.spawnCreature({ id: 'a3mimic', x: 2.6, z: 2.4, h: Math.PI / 2, hp: 3, speed: 1.25, delay: 1.5 });
  },
  update(g, room, dt, t) {
    // The siphon trembles, and now and then swings hard — something keys the line.
    const rec = room.get('recorder')?.getObjectByName('siphon');
    if (rec) rec.rotation.z = Math.sin(t * 31) * 0.02 + (Math.sin(t * 0.37) > 0.96 ? Math.sin(t * 9) * 0.25 : 0);
    const lamp = room.get('tableLamp');
    if (lamp) lamp.rotation.z = Math.sin(t * 0.8) * 0.01;
    const hand = room.get('clock')?.getObjectByName('minuteHand');
    if (hand) hand.rotation.z = -((t / 60) % 1) * Math.PI * 2 - 1.05;
    const hour = room.get('clock')?.getObjectByName('hourHand');
    if (hour) hour.rotation.z = -Math.PI * 2 * (3.17 / 12);
    // Alone, something behind the battery-room door keeps knocking: three, and three.
    if (!g.flag('a3.batteryOpen') && !withPell(g) && Math.floor(t / 13) !== Math.floor((t - dt) / 13)) g.sfx('knock3', { volume: 0.3 });
  },
};

