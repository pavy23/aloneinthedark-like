import * as THREE from 'three';
import type { GameAPI, RoomDef } from '../types';
import type { CameraDef } from '../cameras';
import { M } from '../../render/materials';
import { mesh, rod } from '../../render/geo';
import * as P from '../props';
import * as P4 from '../props4';
import { exit, look, rect } from './common';
import {
  GRAPPLE_RESULTS,
  ROOT_AT,
  afterGrapple,
  afterHeave,
  chopTheRoot,
  cutTheBight,
  deckGauge,
  pickUpToTheRoot,
  spawnDeckDrowned,
  spawnRootLimbs,
} from '../../game/act4';
import { BASE_STRAIN, HEAVE, bowLift, swellStrain } from '../../game/logic4';

const OUTLINE: Array<[number, number]> = [
  [-6, -9],
  [-6, 5],
  [-1.5, 13],
  [1.5, 13],
  [6, 5],
  [6, -9],
];

// Over his shoulder: the dynamometer's dial in front, the bow sheaves beyond (the panel docks to the right).
const DYN_CAM: CameraDef = { id: 'dynClose', pos: [-1.5, 2.1, 5.0], look: [0.5, 1.3, 8.6], fov: 55, zones: [], hidePlayer: true };
// From behind the picking-up gear: the drum, the dynamometer and the bow, the swell lifting it.
const HEAVE_CAM: CameraDef = { id: 'heaveClose', pos: [1.9, 2.8, 0.4], look: [-0.2, 1.3, 9.5], fov: 55, zones: [], hidePlayer: true };

const AXES = ['shipAxe', 'axe'];

/** A run of rods through the points (rope, cable). */
function line(parent: THREE.Object3D, mat: typeof M.rope, pts: Array<[number, number, number]>, r: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay, az] = pts[i];
    const [bx, by, bz] = pts[i + 1];
    rod(parent, mat, { x: ax, y: ay, z: az }, { x: bx, y: by, z: bz }, r, 6);
  }
}

/** The bosun, as long as he is on deck: what he has to say depends on how far the work has got. */
async function talkBosun(g: GameAPI): Promise<void> {
  if (!g.flag('a4.bosunMet')) {
    g.setFlag('a4.bosunMet');
    await g.say(
      '갑판장 스톤. 굵은 팔뚝에 기름때가 절은 사내다. 쉬브 쪽을 한 번 보고, 나를 한 번 본다.',
      '"조사관님이시구려. 탈라사호에 탔던 분. …이등항해사 일은 들으셨소? 새벽 당직이었소. 발자국은 뱃전에서 끝났소."',
      '"선장은 해도대 앞에서 꼼짝을 안 하오. 침로가 잡히면 그래플을 끌겠소. 끄는 건 우리가 하고, 장력계는 조사관님이 보시오. 회사에서 그러라 했소."',
      '"이건 내 수칙이오. 읽어 두시오."',
    );
    g.setFlag('got:grappleCard');
    await g.giveItem('grappleCard');
    await g.readDoc('grappleCard');
    g.note('선교에서 그래플 끌 침로를 잡는다');
    return;
  }
  if (!g.flag('a4.runSet')) await g.say('"선교 해도대에서 침로를 잡아 주시오. 그래플은 바닥에 내려가 있소."');
  else if (!g.flag('a4.hooked'))
    await g.say(
      g.num('a4.attempt') > 0 ? '"다시 끌겠소. 장력계 앞으로 오시오."' : '"침로가 잡혔소. 장력계 앞으로 오시오. 끌기 시작하겠소."',
      '"바위는 확 튀고, 케이블은 꾸준히 오르오. 물었다 싶으면 조금 더 끌어서 바닥에서 띄우고 — 그다음에 세우시오."',
    );
  else if (!g.flag('a4.raised')) await g.say('"물었소. 권양기로 감으시오. 뱃머리가 너울에 들릴 때는 늦추고, 내려앉을 때 감고. 6톤이오. 6톤을 넘기면 끊어지오."');
  else if (!g.flag('a4.cut')) await g.say('"바이트가 올라왔소! 쉬브 앞에서 로스한테 자르라고 하시오."');
  else if (!g.flag('a4.buoyed')) await g.say('"두 끝은 시험실로 끌어 놨소. 어느 쪽이 벨 코브로 가는지 재 보시오. 성한 끝은 부표에 다오."');
  else
    await g.say(
      '"부표는 내렸소. 이제 고장 난 끝을 권양기로 감아올리면 되오."',
      '"…솔직히 말하면, 저 끝은 감고 싶지 않소. 아까부터 장력계 바늘이 맥박처럼 뛰오."',
    );
}

/** The dynamometer: a grappling run, read off its dial. */
async function useDynamometer(g: GameAPI): Promise<void> {
  if (!g.flag('a4.bosunMet')) {
    await talkBosun(g);
    return;
  }
  if (!g.flag('a4.runSet')) {
    await g.say('그래플 로프는 바닥까지 늘어져 있다. 바늘은 거의 움직이지 않는다.', '배가 움직여야 그래플이 끌린다. 선교에서 침로를 잡아야 한다.');
    return;
  }
  if (g.flag('a4.hooked')) {
    await g.say(g.flag('a4.raised') ? '바늘은 바이트의 무게에 버티고 있다.' : '바늘이 4톤 언저리에서 버틴다. 케이블이 그래플에 걸려 있다. 권양기로 감아올려야 한다.');
    return;
  }
  g.sfx('chain', { volume: 0.7 });
  g.cutTo(DYN_CAM);
  await g.openPanel('grapple');
  g.cutTo(null);
  const r = g.num('a4.result');
  g.setFlag('a4.result', -1);
  if (r < 0) {
    g.setFlag('a4.attempt', g.num('a4.attempt') + 1);
    await g.say('갑판장: "그만두겠소? 그래플을 올렸다가 처음부터 다시 끌겠소."');
    return;
  }
  await afterGrapple(g, GRAPPLE_RESULTS[r]);
}

/** The picking-up gear: heave up the bight, or later the bad end. */
async function usePickingUpGear(g: GameAPI): Promise<void> {
  if (g.flag('a4.hooked') && !g.flag('a4.raised')) {
    g.cutTo(HEAVE_CAM);
    await g.openPanel('heave');
    g.cutTo(null);
    const r = g.num('a4.heaveResult');
    g.setFlag('a4.heaveResult', 0);
    if (r === 1) await afterHeave(g, false);
    else if (r === 2) await afterHeave(g, true);
    else if (g.num('a4.heaveP') > 0) await g.say('밸브를 잠갔다. 바이트는 아직 바다 속에 매달려 있다.');
    return;
  }
  if (g.flag('a4.buoyed') && !g.flag('a4.pickup')) {
    await pickUpToTheRoot(g);
    return;
  }
  if (g.flag('a4.pickup')) {
    await g.say('드럼에 감긴 케이블이 검은 점액에 번들거린다. 아직도 미세하게 떨린다.');
    return;
  }
  if (g.flag('a4.cut')) {
    await g.say('두 끝을 시험해서 성한 끝을 부표에 단 다음에야, 고장 난 끝을 감을 수 있다.');
    return;
  }
  await g.say(
    '케이블 권양기. 증기 기관 두 대가 큰 드럼을 돌린다. 지금은 그래플 로프가 감겨 있다.',
    g.flag('a4.runSet') ? '그래플이 케이블을 물어야 감아올릴 수 있다. 장력계를 봐야 한다.' : '먼저 그래플을 끌어야 한다.',
  );
}

async function useBight(g: GameAPI): Promise<void> {
  if (g.flag('a4.raised') && !g.flag('a4.cut')) {
    const c = await g.ask('그래플 갈고리에 케이블의 바이트가 걸려 있다. 로스가 쇠톱을 들고 기다린다.', [{ label: '자르라고 한다' }, { label: '아직' }]);
    if (c !== 0) return;
    await cutTheBight(g);
    return;
  }
  if (g.flag('a4.rootUp')) {
    await g.say('쉬브 너머로 케이블이 바다 속까지 팽팽하다. 검은 것이 그 위를 덮고 있다.');
    return;
  }
  await g.say(
    '선수의 쉬브 세 개. 케이블선의 뱃머리는 이 쉬브들 때문에 부리처럼 튀어나와 있다.',
    g.flag('a4.cut') ? '잘린 두 끝은 갑판을 따라 시험실로 끌려갔다.' : '가운데 쉬브에 그래플 로프가 걸려 바다 속으로 내려간다.',
  );
}

async function useRoot(g: GameAPI, item: string): Promise<boolean> {
  if (!g.flag('a4.rootUp') || g.flag('got:heart')) return false;
  if (item === '@attack') {
    if (!AXES.includes(g.equipped() ?? '')) {
      await g.say('맨손으로는 어림도 없다. 도끼가 있어야 한다.', g.hasItem('shipAxe') ? '(소지품에서 소방 도끼를 손에 든다.)' : '갑판실 앞 소화 설비함에 소방 도끼가 걸려 있었다.');
      return true;
    }
    await chopTheRoot(g);
    return true;
  }
  // Anything else (the axe from the inventory included: it is taken in hand as usual).
  return false;
}

// The repair ship's fore deck at first light: x -6..6, z -9..13, bow at +Z. The deckhouse front (testing room,
// stokehold companion, ladder to the wheelhouse) across the after end; the mast, the picking-up gear, the
// dynamometer and the bow sheaves on the centreline; the mark buoy and its mushroom anchor to port; the
// grapnel rope and a spare grapnel to starboard.
export const sbdeck: RoomDef = {
  id: 'sbdeck',
  name: '세인트 브렌던호 선수 갑판',
  outdoor: true,
  fog: { color: 0x4e5862, density: 0.034 },
  hemi: { sky: 0x8692a0, ground: 0x2a2724, intensity: 1.75 },
  moon: { color: 0xd8d0c0, intensity: 1.9, dir: [0.35, 0.55, 0.75] },
  grade: { saturation: 0.62, tint: 0xeef0f2 },
  ambience: 'deck',
  surface: 'wood',
  bounds: rect(-6.5, -9.5, 6.5, 13.5),
  spawns: {
    start: { x: -1.6, z: -6.6, h: 0.3 },
    fromTest: { x: -3.4, z: -8.0, h: 0 },
    fromStoke: { x: 2.2, z: -8.0, h: 0 },
    fromBridge: { x: 4.8, z: -8.0, h: 0 },
  },
  cameras: [
    { id: 'house', pos: [0.9, 4.6, -1.4], look: [-0.6, 1.3, -9.0], fov: 56, zones: [rect(-6.5, -9.5, 6.5, -3.6)] },
    { id: 'waistPort', pos: [3.6, 4.8, -8.4], look: [-3.4, 0.4, 1.6], fov: 52, zones: [rect(-6.5, -4.0, 0.0, 5.4)] },
    { id: 'waistStbd', pos: [-3.6, 4.8, -8.4], look: [3.4, 0.4, 1.6], fov: 52, zones: [rect(0.0, -4.0, 6.5, 5.4)] },
    { id: 'gear', pos: [-4.6, 3.2, 2.0], look: [0.6, 1.0, 8.4], fov: 54, zones: [rect(-6.5, 5.0, 6.5, 8.8)] },
    { id: 'bow', pos: [3.4, 5.6, 4.6], look: [-0.3, 0.8, 11.0], fov: 52, zones: [rect(-6.5, 8.4, 6.5, 13.5)] },
  ],
  build(b, g) {
    const shape = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
    const deckMesh = mesh(new THREE.ShapeGeometry(shape), M.deck);
    deckMesh.rotation.x = -Math.PI / 2;
    b.staticRoot.add(deckMesh);
    for (let i = 0; i < OUTLINE.length - 1; i++) {
      const [x0, z0] = OUTLINE[i];
      const [x1, z1] = OUTLINE[i + 1];
      b.wall(x0, z0, x1, z1, { h: 1.05, mat: M.paint, t: 0.14 });
      b.wall(x0, z0, x1, z1, { h: 0.08, mat: M.woodLight, t: 0.24, y: 1.05, collide: false });
      const ox = x0 < 0 || x1 < 0 ? -0.1 : 0.1;
      b.wall(x0 + ox, z0, x1 + ox, z1, { h: 2.7, mat: M.hull, t: 0.1, y: -2.7, collide: false });
    }
    for (let z = -8; z <= 4; z += 1.5) {
      b.box(-5.86, 0, z, 0.1, 1.0, 0.1, M.paint);
      b.box(5.86, 0, z, 0.1, 1.0, 0.1, M.paint);
    }

    // Sea
    const sea = mesh(new THREE.PlaneGeometry(160, 160, 1, 1), M.sea);
    const uv = sea.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 26, uv.getY(i) * 26);
    b.add(sea, 0, -2.6, 0, 0, { dynamic: true, name: 'sea' });
    sea.rotation.x = -Math.PI / 2;

    // Deckhouse front, wheelhouse above, the buff funnel beyond.
    b.wall(-6, -9, 6, -9, { h: 3.0, mat: M.paint, t: 0.2, gaps: [{ at: 2.6, w: 0.9, h: 1.95 }, { at: 8.2, w: 0.9, h: 1.95 }] });
    b.box(0, 0, -11.1, 12, 3.0, 4, M.paint);
    b.add(P.shipDoor(0.8, 1.9, M.steelDark), -3.4, 0, -8.96, 0);
    b.add(P.shipDoor(0.8, 1.9, M.steelDark, true), 2.2, 0, -8.96, 0);
    for (const x of [-5.0, -1.9, 4.0]) {
      b.box(x, 1.2, -8.88, 0.8, 0.6, 0.04, M.windowFog);
      b.box(x, 1.12, -8.86, 0.9, 0.08, 0.06, M.brass);
    }
    b.box(0, 3.0, -9.6, 13.4, 0.12, 1.4, M.steelDark);
    b.box(0, 3.1, -12.2, 10, 2.6, 5.2, M.paint);
    for (let i = 0; i < 7; i++) b.box(-3.9 + i * 1.3, 4.0, -9.58, 1.0, 1.0, 0.05, M.windowFog);
    b.box(0, 5.7, -12.2, 10.6, 0.12, 5.8, M.steelDark);
    rod(b.staticRoot, M.paint, { x: -6.6, y: 4.1, z: -8.95 }, { x: 6.6, y: 4.1, z: -8.95 }, 0.03);
    const funnel = new THREE.Group();
    const stack = mesh(new THREE.CylinderGeometry(1.3, 1.3, 7, 12), M.paintDirty);
    stack.position.y = 3.5;
    funnel.add(stack);
    const top = mesh(new THREE.CylinderGeometry(1.33, 1.33, 1.2, 12), M.black);
    top.position.y = 6.6;
    funnel.add(top);
    funnel.rotation.x = -0.1;
    b.add(funnel, 0, 5.2, -17.5, 0);
    b.add(P.ladder(3.2, 0.55), 4.8, 0, -8.8, 0);
    // Fire cabinet with the ship's axe (taken: the glass broken, the hooks empty).
    const cab = P.fireCabinet();
    b.add(cab, -0.9, 0.55, -8.88, 0, { dynamic: true, name: 'fireCab' });
    const axeHook = cab.getObjectByName('axe');
    if (axeHook) axeHook.visible = !g.flag('got:shipAxe');

    // Mast, picking-up gear (driven from aft), dynamometer, bow sheaves.
    b.add(P.mast(12), 0, 0, 0.6, 0);
    b.circle(0, 0.6, 0.45);
    b.add(P.cableEngine(), 0, 0, 3.6, Math.PI, { dynamic: true, name: 'pgear' });
    b.footprint(0, 3.6, 3.0, 2.1);
    b.add(P4.dynamometer(), 0, 0, 7.4, 0, { dynamic: true, name: 'dyn' });
    b.footprint(0, 7.4, 0.95, 0.95);
    b.add(P4.bowSheaves(), 0, 0, 11.9, 0, { dynamic: true, name: 'sheaves' });
    b.footprint(0, 11.875, 2.7, 1.95);

    // The grapnel rope over the gear, the dynamometer and the middle sheave, down into the sea.
    const rope = new THREE.Group();
    line(rope, M.rope, [[0, 1.85, 3.4], [0, 0.6, 7.4], [0, 2.37, 12.4], [0, 1.9, 13.0], [0, -2.6, 14.6], [0, -9, 17]], 0.035);
    rope.visible = !g.flag('a4.cut');
    b.add(rope, 0, 0, 0, 0, { dynamic: true, name: 'rope' });
    // The bight in the grapnel, hanging under the bow once it is up.
    const bight = new THREE.Group();
    const hook = P.grapnel();
    hook.position.set(0, 0.6, 13.0);
    hook.rotation.x = Math.PI / 2;
    bight.add(hook);
    for (const s of [-1, 1]) line(bight, M.cable, [[s * 0.25, 1.0, 13.0], [s * 0.6, -2.6, 14.2], [s * 1.4, -9, 16.5]], 0.06);
    bight.visible = g.flag('a4.raised') && !g.flag('a4.cut');
    b.add(bight, 0, 0, 0, 0, { dynamic: true, name: 'bight' });
    // The two cut ends, led aft along the deck to the testing room.
    const leads = new THREE.Group();
    for (const dx of [0, 0.14]) line(leads, M.cable, [[-0.5 - dx, 0.05, 11.0], [-2.6 - dx, 0.05, 8.2], [-3.0 - dx, 0.05, 0], [-3.3 - dx, 0.05, -8.5]], 0.05);
    leads.visible = g.flag('a4.cut') && !g.flag('a4.pickup');
    b.add(leads, 0, 0, 0, 0, { dynamic: true, name: 'leads' });
    // The bad end coming in over the bow to the drum.
    const cable = new THREE.Group();
    line(cable, M.cable, [[0, 1.85, 3.4], [0, 0.6, 7.4], [0, 2.37, 12.4], [0, 1.9, 13.0], [0, -2.6, 14.6], [0, -9, 17]], 0.06);
    cable.visible = g.flag('a4.pickup');
    b.add(cable, 0, 0, 0, 0, { dynamic: true, name: 'cable' });

    // The root, once it has come up.
    const root = P4.rootMass();
    root.visible = g.flag('a4.rootUp');
    b.add(root, ROOT_AT.x, 0, ROOT_AT.z, 0, { dynamic: true, name: 'root' });
    for (const n of ['heartCore', 'heartGlow']) {
      const o = root.getObjectByName(n);
      if (o) o.visible = !g.flag('got:heart');
    }
    if (g.flag('a4.rootUp')) b.circle(ROOT_AT.x, ROOT_AT.z, ROOT_AT.r, 'root');

    // Mark buoy and its mushroom anchor to port; over the side once the good end is on it.
    const buoyed = g.flag('a4.buoyed');
    const buoy = P4.markBuoy();
    buoy.visible = !buoyed;
    b.add(buoy, -4.5, 0, -1.0, 0.4, { dynamic: true, name: 'buoy' });
    if (!buoyed) b.circle(-4.5, -1.0, 0.65, 'buoy');
    const anchor = P4.mushroomAnchor();
    anchor.visible = !buoyed;
    b.add(anchor, -4.6, 0, 1.4, 0.3, { dynamic: true, name: 'mushroom' });
    if (!buoyed) b.circle(-4.6, 1.4, 0.5, 'buoy');
    b.add(P4.coil(0.42, 4, M.iron, 0.045), -3.7, 0, 1.9, 0);
    const afloat = P4.markBuoy();
    afloat.visible = buoyed;
    b.add(afloat, -9.5, -2.9, 17, 0.2, { dynamic: true, name: 'buoyAfloat' });

    // Grapnel rope flaked down to starboard, a spare grapnel.
    b.add(P4.coil(0.75, 6, M.rope, 0.045), 4.3, 0, -1.2, 0);
    b.circle(4.3, -1.2, 0.8);
    b.add(P.grapnel(), 4.4, 0.05, 1.6, 0.5);
    b.circle(4.4, 1.6, 0.55);
    b.add(P.bollard(), -5.2, 0, -5.6, Math.PI / 2);
    b.footprint(-5.2, -5.6, 0.4, 0.9);
    b.add(P.bollard(), 5.2, 0, -5.6, Math.PI / 2);
    b.footprint(5.2, -5.6, 0.4, 0.9);
    b.add(P.ventilator(2.2, 0.28), -4.6, 0, -7.6, 0.3);
    b.circle(-4.6, -7.6, 0.4);
    b.add(P.lifebuoy(), 5.9, 0.78, -3.0, -Math.PI / 2);

    // The second officer's footprints, from the starboard rail inboard — and back.
    b.add(
      P.footprints([
        [5.6, -4.6],
        [4.3, -4.1],
        [3.2, -3.4],
      ]),
      0,
      0,
      0,
      0,
    );

    // The bosun at the dynamometer (gone over the side once the root comes up).
    if (!g.flag('a4.rootUp')) {
      b.add(P4.crewman({ coat: 0x2a3440, trousers: 0x23262a, hair: 0x5a4a3a, cap: 0x1c2026 }), 1.5, 0, 6.5, -Math.PI / 2, { dynamic: true, name: 'bosun' });
      b.circle(1.5, 6.5, 0.35, 'bosun');
    }

    // Lights: the mast's cargo lamp, the working lamp over the bow, the deckhouse door lamp.
    b.light({ x: 0, y: 6.6, z: 0.9, color: 0xffd4a6, intensity: 12, distance: 16 });
    b.light({ x: 0, y: 4.0, z: 9.6, color: 0xffc890, intensity: 10, distance: 12, flicker: 0.1 });
    b.light({ x: -1.0, y: 2.6, z: -8.4, color: 0xffd9a0, intensity: 6, distance: 8, needsPower: true });
    // The root's own sick glow, once it is up (the heart beating in it).
    b.light({ x: ROOT_AT.x, y: 1.4, z: ROOT_AT.z - 1.2, color: 0x6adfa0, intensity: 0, distance: 7, flicker: 0.2, name: 'rootGlow' });
    b.add(P.cageLamp('sbDoorLamp', false), -1.0, 2.5, -8.98, 0);

    // ---- interactions
    exit(b, { id: 'testDoor', x: -3.4, z: -8.5, label: '문 (시험실로)', to: 'sbtest', spawn: 'fromDeck' });
    exit(b, { id: 'stokeDoor', x: 2.2, z: -8.5, label: '승강구 (화실로)', to: 'sbstoke', spawn: 'fromDeck', sfx: 'ladder' });
    exit(b, { id: 'ladder', x: 4.8, z: -8.4, label: '사다리 (선교로)', to: 'sbbridge', spawn: 'fromDeck', sfx: 'ladder' });
    b.interact({
      id: 'fireCab',
      x: -0.9,
      z: -8.4,
      r: 1.2,
      label: '소화 설비함',
      enabled: (gg) => !gg.flag('got:shipAxe'),
      onAction: async (gg) => {
        await gg.say('붉은 소화 설비함. 유리 너머에 소방 도끼가 걸려 있다. 날이 새것처럼 반짝인다.');
        gg.sfx('glass', { volume: 0.8 });
        const cabObj = gg.room.get('fireCab');
        const hookObj = cabObj?.getObjectByName('axe');
        if (hookObj) hookObj.visible = false;
        gg.setFlag('got:shipAxe');
        await gg.giveItem('shipAxe');
      },
    });
    b.interact({ id: 'dyn', x: 0, z: 6.6, r: 1.3, label: '다이나모미터 (장력계)', onAction: (gg) => useDynamometer(gg) });
    b.interact({ id: 'pgear', x: 0, z: 2.1, r: 1.3, label: '케이블 권양기', onAction: (gg) => usePickingUpGear(gg) });
    b.interact({
      id: 'sheaves',
      x: 0,
      z: 10.7,
      r: 1.5,
      label: g.flag('a4.raised') && !g.flag('a4.cut') ? '쉬브의 바이트' : '선수 쉬브',
      enabled: (gg) => !gg.flag('a4.rootUp'),
      onAction: (gg) => useBight(gg),
    });
    b.interact({
      id: 'root',
      x: ROOT_AT.x,
      z: ROOT_AT.z,
      // Close enough to cut at it is inside the limbs' reach; a step back is out of it.
      r: 1.6,
      label: '뿌리',
      enabled: (gg) => gg.flag('a4.rootUp') && !gg.flag('got:heart'),
      onAction: async (gg) => {
        await gg.say(
          '케이블을 칭칭 감은 검은 덩어리. 한가운데에서 검은 돌 같은 것이 느리게 뛴다.',
          AXES.includes(gg.equipped() ?? '') ? '도끼로 저것을 도려내야 한다. (공격 키로 내려친다)' : gg.hasItem('shipAxe') ? '도끼를 손에 들어야 한다.' : '맨손으로는 안 된다. 갑판실 앞 소화 설비함에 소방 도끼가 있었다.',
        );
      },
      onItem: (gg, item) => useRoot(gg, item),
    });
    b.interact({ id: 'bosun', x: 1.5, z: 6.5, r: 1.3, label: '갑판장', verb: '말 걸기', enabled: (gg) => !gg.flag('a4.rootUp'), onAction: (gg) => talkBosun(gg) });
    look(b, 'buoyLook', -4.5, -1.0, '표지 부표', (gg) =>
      gg.flag('a4.buoyed')
        ? ['부표는 바다에 있다.']
        : ['붉게 칠한 깡통 부표. 성한 끝을 봉해서 여기에 매달고, 버섯 닻으로 바닥에 묶어 둔다.', '새 케이블을 이어 올 때까지, 이것이 1,035해리 저편 벨 코브와 이 바다를 잇는 유일한 표지다.'],
    );
    look(b, 'anchor', -4.6, 1.4, '버섯 닻', ['접시를 엎어 놓은 모양의 무쇠 닻. 진흙 바닥에 박혀 부표를 붙잡는다.'], 1.0);
    look(b, 'grapnelSpare', 4.4, 1.6, '예비 그래플', ['갈고리 다섯 개짜리 그래플. 끝마다 줄로 갈아 날을 세워 두었다.', '"케이블은 물고, 바위는 놓을 것." 손잡이에 누군가 칼로 새겨 놓았다.']);
    look(b, 'ropeCoil', 4.3, -1.2, '그래플 로프', ['감아 둔 그래플 로프. 강철선을 꼰 것이다. 2천 길이 넘는 바다를 내려간다.']);
    look(b, 'prints', 3.9, -3.9, '젖은 발자국', [
      '우현 뱃전에서 안쪽으로 세 걸음. 맨발이다. 그리고 거기서 끝난다.',
      '아니다 — 끝나는 게 아니다. 발자국 위에 다른 발자국이 겹쳐 있다. 뱃전 쪽으로, 되돌아가는.',
    ]);
    look(b, 'mast', 0, 0.6, '앞돛대', ['돛대 중간의 작업등이 갑판을 비춘다. 새벽인데도 하늘은 납빛이다.'], 1.0);
  },
  onEnter(g) {
    if (!g.flag('a4.deckIntro')) {
      g.setFlag('a4.deckIntro');
      void g.run(async () => {
        await g.wait(0.8);
        g.sfx('creak', { volume: 0.8 });
        await g.say(
          '세인트 브렌던호의 선수 갑판. 납빛 새벽이다. 쉬브 위로 그래플 로프가 바다 속까지 늘어져 있다.',
          '장력계 옆에서 갑판장이 손짓한다.',
        );
        g.note('갑판장에게 말을 건다');
      });
    }
    if (g.flag('a4.rootUp') && !g.flag('a4.done')) {
      spawnRootLimbs(g, 'none');
      spawnDeckDrowned(g, 2.5);
    }
  },
  update(g, room, _dt, t) {
    const sea = room.get<THREE.Mesh>('sea');
    if (sea) {
      const m = sea.material as THREE.MeshLambertMaterial;
      if (m.map) {
        m.map.offset.x = (t * 0.004) % 1;
        m.map.offset.y = (t * 0.011) % 1;
      }
      sea.position.y = -2.6 + Math.sin(t * 0.6) * 0.1;
    }
    const afloat = room.get('buoyAfloat');
    if (afloat) {
      afloat.position.y = -2.9 + Math.sin(t * 0.9) * 0.15;
      afloat.rotation.z = Math.sin(t * 0.7) * 0.12;
    }
    // The dynamometer's needle: driven by a live panel, or showing what hangs on the rope.
    let strain = 0.5;
    if (deckGauge.driven) strain = deckGauge.strain;
    else if (g.flag('a4.rootUp')) strain = 4.4 + Math.max(0, Math.sin(t * 5.2)) * 1.6;
    else if (g.flag('a4.pickup')) strain = 3.2 + Math.sin(t * 1.3) * 0.4;
    else if (g.flag('a4.raised')) strain = 2.6 + Math.sin(t * 0.9) * 0.2;
    else if (g.flag('a4.hooked')) strain = HEAVE.base + HEAVE.swell * bowLift(t);
    else if (g.flag('a4.runSet')) strain = BASE_STRAIN + swellStrain(t);
    const needle = room.get('needle');
    if (needle) needle.rotation.z = 2.3 - (Math.min(8, strain) / 8) * 4.6;
    for (let i = 0; i < 3; i++) {
      const s = room.get(`sheave${i}`);
      if (s) s.rotation.x = deckGauge.turn * (i === 1 ? 1 : 0.2);
    }
    const drum = room.get('pgear')?.getObjectByName('drum');
    if (drum && deckGauge.driven) drum.rotation.x = -deckGauge.turn * 0.8;
    // The heart, beating in the root.
    const beat = Math.max(0, Math.sin(t * 5.2));
    const glow = room.get('heartGlow');
    if (glow && glow.visible) glow.scale.setScalar(1 + beat * 0.8);
    const glowLight = room.lights.find((l) => l.name === 'rootGlow');
    if (glowLight) glowLight.intensity = g.flag('a4.rootUp') && !g.flag('a4.done') ? (g.flag('got:heart') ? 2.5 : 5 + beat * 6) : 0;
    const root = room.get('root');
    if (root && root.visible) root.rotation.y = Math.sin(t * 0.8) * 0.06;
  },
};
