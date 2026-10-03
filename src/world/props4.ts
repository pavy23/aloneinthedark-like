import * as THREE from 'three';
import { M, flat } from '../render/materials';
import { cyl, mesh, part, partC, ring, rod } from '../render/geo';
import { HumanRig, type Pose } from '../entities/Rig';

// Act 4 props: the repair ship St Brendan. Same conventions as props.ts: each builder returns a Group whose
// origin is the centre of its footprint on the floor, front +Z.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Crewman {
  coat: number;
  trousers: number;
  hair: number;
  cap?: number;
  pose?: Pose;
}

/** A standing (or posed) crewman for the NPCs: the captain, the bosun, the electrician. */
export function crewman(c: Crewman): THREE.Group {
  const g = new THREE.Group();
  const rig = new HumanRig({
    colors: {
      coat: c.coat,
      coatDark: new THREE.Color(c.coat).multiplyScalar(0.6).getHex(),
      trousers: c.trousers,
      shoes: 0x14100c,
      skin: 0xc4a88c,
      shirt: 0xc8c0aa,
      hair: c.hair,
      eyes: 0x1a1612,
    },
    bulk: 1.05,
    torso: 0.58,
  });
  if (c.pose) rig.setPose(c.pose);
  rig.root.position.y = 0;
  g.add(rig.root);
  if (c.cap !== undefined) {
    // A peaked cap on the head joint, so it follows the pose.
    const crown = mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.07, 10), flat(c.cap));
    crown.position.set(0, 0.25, 0);
    rig.head.add(crown);
    const peak = mesh(new THREE.BoxGeometry(0.17, 0.012, 0.08), flat(0x121212));
    peak.position.set(0, 0.225, 0.11);
    peak.rotation.x = 0.15;
    rig.head.add(peak);
  }
  return g;
}

/** Mark buoy: a riveted can buoy with a staff and flag, as it stands on deck before it goes over. */
export function markBuoy(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.redPaint, 0, 0.55, 0, 0.55, 1.1, 'y', 12);
  const top = mesh(new THREE.ConeGeometry(0.55, 0.45, 12), M.redPaint);
  top.position.y = 1.32;
  g.add(top);
  for (const y of [0.15, 0.95]) ring(g, M.iron, 0, y, 0, 0.56, 0.025, 12).rotation.x = Math.PI / 2;
  rod(g, M.woodDark, V(0, 1.5, 0), V(0, 2.9, 0), 0.03, 5);
  const flag = mesh(new THREE.PlaneGeometry(0.4, 0.28), M.black);
  flag.position.set(0.2, 2.7, 0);
  (flag.material as THREE.Material).side = THREE.DoubleSide;
  flag.name = 'flag';
  g.add(flag);
  // Cradle
  for (const x of [-0.45, 0.45]) part(g, M.woodDark, x, 0, 0, 0.12, 0.3, 1.2);
  return g;
}

/** Mushroom anchor (for buoy moorings): a cast dish on a shank, lying on its side. */
export function mushroomAnchor(): THREE.Group {
  const g = new THREE.Group();
  const dish = mesh(new THREE.SphereGeometry(0.42, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.3), M.iron);
  dish.rotation.x = Math.PI;
  dish.position.y = 0.42;
  g.add(dish);
  rod(g, M.iron, V(0, 0.32, 0), V(0, 1.1, 0), 0.06, 6);
  ring(g, M.ironLight, 0, 1.18, 0, 0.09, 0.025, 8);
  g.rotation.z = 1.25;
  g.position.y = 0;
  return g;
}

/** A flake of chain or rope coiled on deck. */
export function coil(r = 0.6, turns = 5, mat = M.rope, thick = 0.035): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < turns; i++) {
    const t = ring(g, mat, 0, 0.04 + i * thick * 1.6, 0, r - i * 0.03, thick, 14);
    t.rotation.x = Math.PI / 2;
  }
  return g;
}

/**
 * Bow sheaves of a cable ship: three sheaves side by side in a cast frame projecting over the stem. Named
 * 'sheave0'..'sheave2' (they turn when the cable or grapnel rope runs).
 */
export function bowSheaves(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.steelDark, 0, 0, -0.4, 2.6, 1.1, 1.2);
  for (const x of [-1.25, 1.25]) part(g, M.steelDark, x, 1.1, 0.15, 0.12, 1.3, 1.6);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    s.name = `sheave${i}`;
    cyl(s, M.ironLight, 0, 0, 0, 0.62, 0.22, 'x', 16);
    cyl(s, M.iron, 0, 0, 0, 0.22, 0.26, 'x', 10);
    s.position.set(-0.8 + i * 0.8, 1.75, 0.5);
    g.add(s);
  }
  rod(g, M.steelDark, V(-1.3, 1.75, 0.5), V(1.3, 1.75, 0.5), 0.07, 8);
  return g;
}

/** Dynamometer: the cable or grapnel rope runs under a weighted sheave; a dial shows the strain. */
export function dynamometer(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.steelDark, 0, 0, 0, 0.9, 0.6, 0.9);
  cyl(g, M.ironLight, 0, 0.95, 0, 0.42, 0.18, 'x', 14);
  for (const x of [-0.35, 0.35]) part(g, M.steelDark, x, 0.6, 0, 0.08, 0.8, 0.2);
  // Dial on a post at the side, facing aft (-Z)
  rod(g, M.iron, V(0.65, 0, -0.2), V(0.65, 1.3, -0.2), 0.04, 6);
  cyl(g, M.brass, 0.65, 1.42, -0.2, 0.2, 0.05, 'z', 16);
  const face = mesh(new THREE.CircleGeometry(0.17, 16), M.paperBlank);
  face.position.set(0.65, 1.42, -0.23);
  face.rotation.y = Math.PI;
  g.add(face);
  const needle = new THREE.Group();
  needle.name = 'needle';
  partC(needle, M.black, 0, 0.07, 0, 0.012, 0.14, 0.004);
  needle.position.set(0.65, 1.42, -0.235);
  needle.rotation.y = Math.PI;
  g.add(needle);
  return g;
}

/**
 * The root, as it comes over the bow on the cable: a knot of black, wet limbs round a darker core, hung with
 * the cable it has wrapped itself in. The heart sits in its after face, towards whoever comes at it from the
 * deck. Named 'heartCore' and 'heartGlow' (hidden once the heart is cut out).
 */
export function rootMass(): THREE.Group {
  const g = new THREE.Group();
  const core = mesh(new THREE.DodecahedronGeometry(0.6, 0), M.flesh);
  core.scale.set(1.35, 0.95, 1.15);
  core.position.y = 0.58;
  g.add(core);
  // Limbs splayed over the deck, each bent at a knuckle and thinning to the tip.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.2;
    const reach = 1.15 + (i % 3) * 0.3;
    const root = V(Math.cos(a) * 0.5, 0.55 + (i % 2) * 0.15, Math.sin(a) * 0.45);
    const knee = V(Math.cos(a) * reach * 0.62, 0.62 + (i % 3) * 0.12, Math.sin(a) * reach * 0.55);
    const tip = V(Math.cos(a + 0.25) * reach, 0.04, Math.sin(a + 0.25) * reach * 0.9);
    rod(g, M.flesh, root, knee, 0.11 - (i % 3) * 0.015, 6);
    rod(g, M.flesh, knee, tip, 0.07 - (i % 3) * 0.01, 5);
  }
  // The cable it came up on, wound round and round it.
  for (let i = 0; i < 3; i++) {
    const c = ring(g, M.cable, 0, 0.45 + i * 0.2, 0, 0.82 - i * 0.1, 0.045, 16);
    c.rotation.x = Math.PI / 2 + (i - 1) * 0.35;
  }
  const heart = mesh(new THREE.DodecahedronGeometry(0.24, 0), M.idol);
  heart.name = 'heartCore';
  heart.position.set(0, 0.72, -0.5);
  g.add(heart);
  const glow = mesh(new THREE.SphereGeometry(0.09, 6, 4), M.idolGlow);
  glow.name = 'heartGlow';
  glow.position.set(0, 0.76, -0.7);
  g.add(glow);
  return g;
}

/** Two cut cable ends brought up to the testing-room terminals, tagged A and B. */
export function cutEnds(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, tag] of [
    [-0.25, M.paperBlank],
    [0.25, M.paper],
  ] as const) {
    rod(g, M.cable, V(x, 0, 0.2), V(x, 1.0, 0.05), 0.045, 6);
    part(g, tag, x, 1.0, 0.08, 0.12, 0.08, 0.01);
  }
  return g;
}
