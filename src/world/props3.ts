import * as THREE from 'three';
import { M, type Mat } from '../render/materials';
import { cyl, mesh, part, partC, quad, ring, rod } from '../render/geo';
import { HumanRig } from '../entities/Rig';

// Act 3 props: the cable landing station at Bell Cove, Newfoundland, in winter. Same conventions as
// props.ts: each builder returns a Group whose origin is the centre of its footprint on the floor, front +Z.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- weather and ground

/** Falling snow: a box of flakes around the origin. Animate with stepSnow(). */
export function snowfall(count: number, w: number, h: number, d: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * w;
    pos[i * 3 + 1] = Math.random() * h;
    pos[i * 3 + 2] = (Math.random() - 0.5) * d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Constant-size flakes: with distance attenuation a flake brushing the lens would fill the screen.
  const mat = new THREE.PointsMaterial({ color: 0xe8eef4, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false });
  const p = new THREE.Points(geo, mat);
  p.userData.box = { w, h, d };
  p.frustumCulled = false;
  return p;
}

/** Drift the flakes down and with the wind, wrapping them round the box. */
export function stepSnow(p: THREE.Points, dt: number, t: number, wind = 0.6): void {
  const { w, h, d } = p.userData.box as { w: number; h: number; d: number };
  const a = p.geometry.getAttribute('position') as THREE.BufferAttribute;
  const arr = a.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const k = i * 0.37;
    arr[i] += (wind + Math.sin(t * 0.7 + k) * 0.25) * dt;
    arr[i + 1] -= (0.55 + (k % 1) * 0.35) * dt;
    arr[i + 2] += Math.cos(t * 0.5 + k) * 0.15 * dt;
    if (arr[i + 1] < 0) arr[i + 1] += h;
    if (arr[i] > w / 2) arr[i] -= w;
    if (arr[i] < -w / 2) arr[i] += w;
    if (arr[i + 2] > d / 2) arr[i + 2] -= d;
    if (arr[i + 2] < -d / 2) arr[i + 2] += d;
  }
  a.needsUpdate = true;
}

/** A wind-shaped drift: a squashed dome of snow. */
export function snowDrift(w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const m = mesh(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.snow);
  m.scale.set(w, h * 2, d);
  g.add(m);
  return g;
}

export function rock(r = 0.6, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(r, 0);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
    const f = 0.8 + (k - Math.floor(k)) * 0.35;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.7, p.getZ(i) * f);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, M.concrete);
  m.position.y = r * 0.35;
  g.add(m);
  // A cap of snow on top.
  const cap = mesh(new THREE.SphereGeometry(r * 0.7, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), M.snow);
  cap.scale.y = 0.35;
  cap.position.y = r * 0.65;
  g.add(cap);
  return g;
}

export function iceFloe(w = 1.2, d = 0.8): THREE.Group {
  const g = new THREE.Group();
  partC(g, M.ice, 0, 0.04, 0, w, 0.12, d, 0, 0.3, 0.04);
  return g;
}

// ---------------------------------------------------------------- the station grounds

/** Telegraph pole with a cross-arm and glass insulators (named ins0..ins3 for wiring). Height ~6 m. */
export function telegraphPole(h = 5.6): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.woodDark, 0, h / 2, 0, 0.11, h, 'y', 7, 0.08);
  part(g, M.woodDark, 0, h - 0.5, 0, 1.4, 0.1, 0.1);
  for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.4;
    cyl(g, M.jarGlass, x, h - 0.32, 0, 0.04, 0.1, 'y', 6);
    const ins = new THREE.Object3D();
    ins.name = `ins${i}`;
    ins.position.set(x, h - 0.27, 0);
    g.add(ins);
  }
  // A drift of snow round its foot.
  const foot = mesh(new THREE.SphereGeometry(0.35, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), M.snow);
  foot.scale.y = 0.4;
  g.add(foot);
  return g;
}

/** A sagging wire between two points (a few straight segments). */
export function sagWire(parent: THREE.Object3D, a: THREE.Vector3Like, b: THREE.Vector3Like, sag = 0.35, mat: Mat = M.iron): void {
  const n = 6;
  let prev = V(a.x, a.y, a.z);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t);
    rod(parent, mat, prev, p, 0.008, 3);
    prev = p;
  }
}

/** Gable roof over a w x d footprint, eaves at y=0, ridge along X. */
export function gableRoof(w: number, d: number, rise: number, mat: Mat = M.roofTar): THREE.Group {
  const g = new THREE.Group();
  const slope = Math.hypot(d / 2 + 0.3, rise);
  const ang = Math.atan2(rise, d / 2 + 0.3);
  for (const s of [-1, 1]) {
    const m = partC(g, mat, 0, rise / 2, (s * (d / 2 + 0.3)) / 2, w + 0.5, 0.08, slope, s * ang, 0, 0);
    m.rotation.x = -s * ang;
  }
  // Snow along the ridge and the slopes.
  for (const s of [-1, 1]) {
    const sn = partC(g, M.snow, 0, rise / 2 + 0.06, (s * (d / 2 + 0.3)) / 2, w + 0.45, 0.06, slope * 0.9, 0, 0, 0);
    sn.rotation.x = -s * ang;
  }
  // Gable ends (triangles).
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.ShapeGeometry(tri), M.clapboard);
    e.rotation.y = Math.PI / 2;
    e.position.x = (s * w) / 2;
    e.scale.x = s;
    (e.material as THREE.Material).side = THREE.DoubleSide;
    g.add(e);
  }
  return g;
}

/** Window with frame, glazing bars and a sill; `lit` glows warm from inside. Facing +Z. */
export function houseWindow(w = 0.8, h = 1.1, lit = false): THREE.Group {
  const g = new THREE.Group();
  part(g, lit ? M.windowLit : M.windowDark, 0, 0, 0, w, h, 0.02);
  part(g, M.paint, 0, -0.06, 0.02, w + 0.16, 0.06, 0.12);
  part(g, M.paint, 0, h, 0.01, w + 0.12, 0.06, 0.06);
  for (const x of [-w / 2 - 0.03, w / 2 + 0.03]) part(g, M.paint, x, 0, 0.01, 0.06, h, 0.06);
  part(g, M.paint, 0, 0, 0.015, 0.03, h, 0.03);
  part(g, M.paint, 0, h / 2, 0.015, w, 0.03, 0.03);
  part(g, M.snow, 0, -0.01, 0.06, w + 0.12, 0.04, 0.1);
  return g;
}

export function sleigh(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.45, 0.45]) {
    part(g, M.ironLight, x, 0, 0, 0.05, 0.05, 2.2);
    rod(g, M.ironLight, V(x, 0.03, 1.1), V(x, 0.35, 1.3), 0.025, 4);
    for (const z of [-0.8, 0, 0.8]) rod(g, M.woodDark, V(x, 0.05, z), V(x, 0.35, z), 0.03, 4);
  }
  part(g, M.wood, 0, 0.35, 0, 1.0, 0.06, 1.9);
  part(g, M.wood, 0, 0.41, -0.85, 1.0, 0.45, 0.06);
  part(g, M.blanket, 0, 0.41, -0.2, 0.9, 0.08, 0.9);
  // Shafts for the horse, empty, lying in the snow.
  for (const x of [-0.35, 0.35]) rod(g, M.woodDark, V(x, 0.3, 1.0), V(x * 1.4, 0.05, 2.6), 0.03, 4);
  part(g, M.snow, 0, 0.47, 0.3, 0.9, 0.05, 0.8);
  return g;
}

export function woodpile(): THREE.Group {
  const g = new THREE.Group();
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 6 - (row % 2); i++) {
      const x = -0.75 + i * 0.3 + (row % 2) * 0.15;
      cyl(g, M.woodLight, x, 0.13 + row * 0.24, 0, 0.12, 0.9, 'z', 6);
    }
  part(g, M.snow, 0, 0.98, 0, 1.8, 0.08, 0.95);
  return g;
}

/** A chopping block; the axe stands in it unless `empty`. */
export function choppingBlock(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.woodLight, 0, 0.25, 0, 0.26, 0.5, 'y', 8);
  part(g, M.snow, 0, 0.5, 0, 0.36, 0.04, 0.36);
  return g;
}

/** Splitting axe (the pickup model): plain steel head, no paint. */
export function woodAxeItem(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.woodLight, V(-0.45, 0, 0), V(0.38, 0, 0), 0.022, 6);
  partC(g, M.ironLight, 0.36, 0.06, 0, 0.1, 0.16, 0.035);
  partC(g, M.iron, 0.36, -0.05, 0, 0.07, 0.08, 0.04);
  return g;
}

export function fenceRun(len: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) part(g, M.woodDark, -len / 2 + (i * len) / n, 0, 0, 0.1, 1.1, 0.1);
  for (const y of [0.45, 0.9]) part(g, M.woodDark, 0, y, 0, len, 0.08, 0.04);
  part(g, M.snow, 0, 0.98, 0, len, 0.04, 0.08);
  return g;
}

/** Iron post with an oil lantern (lit). */
export function lampPost(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.iron, 0, 1.2, 0, 0.05, 2.4, 'y', 6);
  rod(g, M.iron, V(0, 2.3, 0), V(0.35, 2.3, 0), 0.02, 4);
  const glass = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.24, 6), M.lanternGlass);
  glass.position.set(0.35, 2.08, 0);
  glass.name = 'flame';
  g.add(glass);
  part(g, M.iron, 0.35, 2.2, 0, 0.2, 0.04, 0.2);
  return g;
}

// ---------------------------------------------------------------- operating room

/**
 * Siphon recorder (after Thomson, 1867): the coil and magnets in a brass frame on a mahogany base, the
 * glass siphon dipping in its ink pot, and the paper tape running off its roll past the pen. Named parts:
 * 'roll' (turns while running), 'siphon'.
 */
export function siphonRecorder(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, 0, 0.7, 0.08, 0.42);
  // Magnet frame
  for (const x of [-0.16, 0.0]) part(g, M.iron, x, 0.08, -0.08, 0.1, 0.32, 0.22);
  part(g, M.brass, -0.08, 0.4, -0.08, 0.34, 0.05, 0.24);
  cyl(g, M.copper, -0.08, 0.22, 0.04, 0.05, 0.1, 'z', 10);
  // Ink pot and the hair-thin glass siphon
  cyl(g, M.black, 0.14, 0.13, -0.05, 0.05, 0.1, 'y', 8);
  const siphon = rod(g, M.jarGlass, V(0.14, 0.2, -0.05), V(0.18, 0.28, 0.1), 0.005, 3);
  siphon.name = 'siphon';
  // Tape roll and the strip of tape running past the pen to the front
  const roll = cyl(g, M.paperBlank, 0.24, 0.24, -0.1, 0.07, 0.06, 'z', 12);
  roll.name = 'roll';
  const strip = quad(g, M.tape, 0.1, 0.09, 0.18, 0.56, 0.06, 0, -Math.PI / 2);
  strip.position.y = 0.085;
  // Clockwork drive
  part(g, M.brass, 0.27, 0.08, 0.1, 0.12, 0.12, 0.12);
  return g;
}

/** Three-position cable key (dot to one side, dash to the other). */
export function cableKey(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, 0, 0.28, 0.04, 0.2);
  for (const x of [-0.06, 0.06]) {
    part(g, M.brass, x, 0.04, 0, 0.03, 0.03, 0.16);
    cyl(g, M.black, x, 0.1, 0.07, 0.022, 0.03, 'y', 8);
  }
  return g;
}

export function wallClock(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.woodDark, 0, 0, 0, 0.2, 0.06, 'z', 14);
  const face = mesh(new THREE.CircleGeometry(0.17, 14), M.paperBlank);
  face.position.z = 0.035;
  g.add(face);
  const hour = new THREE.Group();
  hour.name = 'hourHand';
  partC(hour, M.black, 0, 0.05, 0, 0.012, 0.1, 0.004);
  hour.position.z = 0.04;
  g.add(hour);
  const min = new THREE.Group();
  min.name = 'minuteHand';
  partC(min, M.black, 0, 0.07, 0, 0.008, 0.14, 0.004);
  min.position.z = 0.042;
  g.add(min);
  return g;
}

export function tapeRolls(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, 0, 0.7, 0.04, 0.12);
  for (let i = 0; i < 4; i++) cyl(g, M.paperBlank, -0.24 + i * 0.16, 0.1, 0, 0.06, 0.04, 'z', 10);
  return g;
}

// ---------------------------------------------------------------- testing and battery room

/**
 * Line switchboard on slate: five knife switches in a row (named sw0..sw4, their handles swing about X
 * when thrown), the cable lead coming up from the floor, the signalling condenser box and the lightning
 * protector (spark-gap plates) on the panel. Origin at its foot, facing +Z.
 */
export function lineSwitchboard(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.slate, 0, 0.6, 0, 1.9, 1.3, 0.05);
  part(g, M.woodDark, 0, 0.55, 0.01, 2.0, 0.05, 0.08);
  part(g, M.woodDark, 0, 1.9, 0.01, 2.0, 0.05, 0.08);
  for (let i = 0; i < 5; i++) {
    const x = -0.72 + i * 0.36;
    // Jaws and pivot
    part(g, M.brass, x, 1.0, 0.03, 0.08, 0.06, 0.04);
    part(g, M.brass, x, 1.38, 0.03, 0.08, 0.06, 0.04);
    const sw = new THREE.Group();
    sw.name = `sw${i}`;
    sw.position.set(x, 1.03, 0.07);
    partC(sw, M.copper, 0, 0.18, 0, 0.03, 0.36, 0.02);
    partC(sw, M.black, 0, 0.38, 0.02, 0.04, 0.08, 0.05);
    g.add(sw);
    part(g, M.ceramic, x, 0.82, 0.03, 0.22, 0.06, 0.01);
  }
  // Lightning protector: two notched plates with a gap, top left
  part(g, M.brass, -0.62, 1.62, 0.03, 0.18, 0.12, 0.02);
  part(g, M.brass, -0.62, 1.76, 0.03, 0.18, 0.08, 0.02);
  // Condenser box, top right
  part(g, M.woodDark, 0.6, 1.55, 0.04, 0.42, 0.28, 0.14);
  part(g, M.ceramic, 0.6, 1.62, 0.115, 0.3, 0.08, 0.01);
  // The cable comes up through the floor in its lead sheath
  rod(g, M.cable, V(0.0, 0, 0.12), V(0.0, 0.62, 0.06), 0.04, 6);
  return g;
}

/**
 * A large induction coil on a wooden trolley: the long black secondary, brass end plates, the discharger
 * rods on top (named 'gap'), the hammer interrupter at one end. Front +Z, length along X.
 */
export function inductionCoil(): THREE.Group {
  const g = new THREE.Group();
  // Trolley
  part(g, M.woodDark, 0, 0.32, 0, 1.4, 0.06, 0.6);
  for (const [x, z] of [
    [-0.6, -0.24],
    [0.6, -0.24],
    [-0.6, 0.24],
    [0.6, 0.24],
  ]) {
    rod(g, M.woodDark, V(x, 0.08, z), V(x, 0.32, z), 0.03, 4);
    cyl(g, M.iron, x, 0.08, z, 0.08, 0.04, 'x', 10);
  }
  // Base board and the coil itself
  part(g, M.woodDark, 0, 0.38, 0, 1.25, 0.08, 0.45);
  cyl(g, M.black, 0, 0.66, 0, 0.2, 1.0, 'x', 14);
  for (const x of [-0.52, 0.52]) cyl(g, M.brass, x, 0.66, 0, 0.23, 0.04, 'x', 14);
  // Discharger: two rods on pillars with balls, the spark gap between them
  for (const s of [-1, 1]) {
    cyl(g, M.black, s * 0.4, 0.98, 0, 0.025, 0.2, 'y', 6);
    rod(g, M.brass, V(s * 0.4, 1.1, 0), V(s * 0.08, 1.1, 0), 0.012, 4);
    const ball = mesh(new THREE.SphereGeometry(0.03, 8, 6), M.brass);
    ball.position.set(s * 0.06, 1.1, 0);
    g.add(ball);
  }
  const gap = new THREE.Object3D();
  gap.name = 'gap';
  gap.position.set(0, 1.1, 0);
  g.add(gap);
  // Interrupter (hammer and anvil) at the end, primary terminals
  part(g, M.iron, 0.64, 0.46, 0, 0.08, 0.16, 0.08);
  part(g, M.brass, 0.64, 0.62, 0.04, 0.03, 0.12, 0.03);
  for (const z of [-0.15, 0.15]) cyl(g, M.brass, -0.58, 0.48, z, 0.02, 0.04, 'y', 6);
  return g;
}

/**
 * Two-tier rack of sixteen lead-acid cells in glass jars (cell0..cell15, eight per shelf). Front +Z,
 * length along X. Each jar has a brass lug ('lugN') that is shown when the cell is in the series string.
 */
export function batteryRack(): THREE.Group {
  const g = new THREE.Group();
  for (const y of [0.0, 0.6]) part(g, M.woodDark, 0, y + 0.3, 0, 2.6, 0.05, 0.45);
  for (const x of [-1.25, 0, 1.25]) part(g, M.woodDark, x, 0, 0, 0.06, 0.95, 0.45);
  for (let i = 0; i < 16; i++) {
    const tier = i < 8 ? 0 : 1;
    const x = -1.05 + (i % 8) * 0.3;
    const y = 0.35 + tier * 0.6;
    const cell = new THREE.Group();
    cell.name = `cell${i}`;
    cell.position.set(x, y, 0);
    cyl(cell, M.jarGlass, 0, 0.12, 0, 0.1, 0.24, 'y', 8);
    cyl(cell, M.acid, 0, 0.09, 0, 0.088, 0.17, 'y', 8);
    for (const dz of [-0.04, 0.04]) part(cell, M.leadPlate, 0, 0.02, dz, 0.14, 0.2, 0.012);
    part(cell, M.woodDark, 0, 0.24, 0, 0.18, 0.02, 0.16);
    const lug = new THREE.Group();
    lug.name = `lug${i}`;
    part(lug, M.brass, 0.1, 0.26, 0, 0.12, 0.012, 0.03);
    lug.visible = false;
    cell.add(lug);
    g.add(cell);
  }
  return g;
}

export function hydrometerItem(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.jarGlass, V(-0.2, 0.03, 0), V(0.18, 0.03, 0), 0.02, 6);
  const bulb = mesh(new THREE.SphereGeometry(0.045, 8, 6), M.rubber);
  bulb.position.set(0.22, 0.04, 0);
  bulb.scale.set(1.4, 1, 1);
  g.add(bulb);
  rod(g, M.rubber, V(-0.2, 0.03, 0), V(-0.26, 0.03, 0), 0.008, 4);
  return g;
}

export function candleItem(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodLight, 0, 0, 0, 0.18, 0.06, 0.1);
  for (let i = 0; i < 3; i++) cyl(g, M.ceramic, -0.05 + i * 0.05, 0.08, 0, 0.012, 0.13, 'z', 6);
  return g;
}

/** Tall store cabinet, door leaf 'leaf' hinged on the left, padlocked hasp. Front +Z. */
export function storeCabinet(open = false): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, -0.02, 1.3, 2.0, 0.66);
  const leaf = new THREE.Group();
  leaf.name = 'leaf';
  part(leaf, M.wood, 0.6, 0.05, 0, 1.2, 1.9, 0.05);
  part(leaf, M.brass, 1.1, 1.0, 0.04, 0.05, 0.14, 0.03);
  if (!open) {
    const lock = new THREE.Group();
    lock.name = 'padlock';
    part(lock, M.brass, 0, 0, 0, 0.09, 0.1, 0.04);
    ring(lock, M.ironLight, 0, 0.12, 0, 0.03, 0.008, 8);
    lock.position.set(1.16, 0.88, 0.07);
    leaf.add(lock);
  }
  leaf.position.set(-0.6, 0, 0.32);
  if (open) leaf.rotation.y = -1.6;
  g.add(leaf);
  return g;
}

// ---------------------------------------------------------------- the beach

/**
 * The cable hut at the head of the beach: a small concrete house where the shore end comes in and is
 * joined to the land line. Doorway in the +Z face, terminal board on the back wall (named 'terminal').
 * About 2.6 x 2.2 m.
 */
export function cableHut(): THREE.Group {
  const g = new THREE.Group();
  const W = 2.6;
  const D = 2.2;
  const H = 2.2;
  part(g, M.concrete, 0, 0, -D / 2 + 0.1, W, H, 0.2);
  part(g, M.concrete, -W / 2 + 0.1, 0, 0, 0.2, H, D);
  part(g, M.concrete, W / 2 - 0.1, 0, 0, 0.2, H, D);
  part(g, M.concrete, -0.85, 0, D / 2 - 0.1, 0.9, H, 0.2);
  part(g, M.concrete, 0.85, 0, D / 2 - 0.1, 0.9, H, 0.2);
  part(g, M.concrete, 0, 1.9, D / 2 - 0.1, 0.8, 0.3, 0.2);
  part(g, M.concrete, 0, H, 0, W + 0.2, 0.16, D + 0.2);
  part(g, M.snow, 0, H + 0.16, 0, W + 0.1, 0.08, D + 0.1);
  // Terminal board on the back wall: the heavy shore end comes up out of the floor, the land line goes out
  // through the wall to the poles.
  const term = new THREE.Group();
  term.name = 'terminal';
  part(term, M.woodDark, 0, 0.9, 0, 1.0, 0.7, 0.05);
  for (let i = 0; i < 3; i++) cyl(term, M.brass, -0.3 + i * 0.3, 1.25, 0.05, 0.035, 0.06, 'z', 6);
  rod(term, M.cable, V(-0.3, 0, 0.15), V(-0.3, 1.2, 0.06), 0.06, 6);
  rod(term, M.iron, V(0.3, 1.25, 0.06), V(0.3, 1.9, -0.05), 0.012, 4);
  term.position.set(0, 0, -D / 2 + 0.22);
  g.add(term);
  // The land-line key on a shelf by the door.
  part(g, M.woodDark, 0.85, 0.95, 0.35, 0.5, 0.04, 0.3);
  const key = new THREE.Group();
  key.name = 'hutKey';
  part(key, M.woodDark, 0, 0, 0, 0.2, 0.03, 0.12);
  part(key, M.brass, 0, 0.03, 0, 0.03, 0.02, 0.1);
  cyl(key, M.black, 0, 0.07, 0.04, 0.018, 0.02, 'y', 6);
  key.position.set(0.85, 0.99, 0.35);
  g.add(key);
  return g;
}

/** Shore-end cable: thick and heavily armoured, along the given points (x, y, z). */
export function shoreCable(points: Array<[number, number, number]>): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az] = points[i];
    const [bx, by, bz] = points[i + 1];
    rod(g, M.cable, V(ax, ay, az), V(bx, by, bz), 0.075, 7);
  }
  return g;
}

export function dory(): THREE.Group {
  const g = new THREE.Group();
  // Upturned: hull planks as a long tapered box, keel on top.
  const hull = partC(g, M.clapboardRed, 0, 0.32, 0, 1.2, 0.5, 3.6);
  hull.scale.set(1, 1, 1);
  partC(g, M.clapboardRed, 0, 0.32, 1.9, 0.6, 0.45, 0.3);
  partC(g, M.clapboardRed, 0, 0.32, -1.9, 0.6, 0.45, 0.3);
  part(g, M.woodDark, 0, 0.57, 0, 0.08, 0.06, 4.0);
  part(g, M.snow, 0, 0.58, 0, 1.1, 0.06, 3.2);
  return g;
}

// ---------------------------------------------------------------- people and things

/** Pell, four months on: no splint now, a stick to lean on, the station's clerk's sleeve garters. Seated. */
export function operator(): THREE.Group {
  const g = new THREE.Group();
  const rig = new HumanRig({
    colors: {
      coat: 0x4a4038,
      coatDark: 0x2a241e,
      trousers: 0x2e2a24,
      shoes: 0x1a140e,
      skin: 0xc4a88c,
      shirt: 0xc8c0aa,
      hair: 0x3a2818,
      eyes: 0x1a1612,
    },
    bulk: 0.95,
    torso: 0.55,
  });
  rig.setPose({
    spine: [-0.1, 0, 0],
    neck: [0.15, 0, 0],
    thighL: [-1.5, 0, 0.08],
    kneeL: [1.5, 0, 0],
    thighR: [-1.45, 0, -0.08],
    kneeR: [1.4, 0, 0],
    shoulderL: [-0.4, 0, 0.2],
    elbowL: [-1.1, 0, 0],
    shoulderR: [-0.6, 0, -0.2],
    elbowR: [-0.8, 0, 0],
  });
  rig.root.position.y = -0.82 + 0.46;
  g.add(rig.root);
  // The crate he sits on and his stick.
  part(g, M.woodLight, 0, 0, -0.05, 0.5, 0.42, 0.45);
  rod(g, M.woodDark, V(0.32, 0, 0.3), V(0.28, 0.9, 0.18), 0.018, 4);
  return g;
}

/**
 * What comes out of the sea at the cable hut: a single limb as thick as a man, rooted in the surf, made of
 * the same black, glistening stuff the cable's gutta-percha is. Segments named seg0..segN-1 bend in sequence.
 */
export function limb(segments = 11): { root: THREE.Group; segs: THREE.Group[] } {
  const root = new THREE.Group();
  const segs: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  for (let i = 0; i < segments; i++) {
    const r0 = 0.32 * (1 - i / (segments + 2)) + 0.05;
    const r1 = 0.32 * (1 - (i + 1) / (segments + 2)) + 0.05;
    const len = 0.42;
    const seg = new THREE.Group();
    seg.name = `seg${i}`;
    const body = mesh(new THREE.CylinderGeometry(r1, r0, len, 8), M.flesh);
    body.position.y = len / 2;
    seg.add(body);
    // Pale suckers on the inner face and barnacle-like knots.
    for (let k = 0; k < 2; k++) {
      const s = mesh(new THREE.SphereGeometry(r1 * 0.32, 5, 4), M.fleshPale);
      s.position.set(0, len * (0.3 + k * 0.4), r0 * 0.85);
      s.scale.z = 0.4;
      seg.add(s);
    }
    if (i % 3 === 1) {
      const knot = mesh(new THREE.DodecahedronGeometry(r1 * 0.35, 0), M.concrete);
      knot.position.set(r0 * 0.8, len * 0.5, 0);
      seg.add(knot);
    }
    seg.position.y = parent === root ? 0 : len;
    parent.add(seg);
    segs.push(seg);
    parent = seg;
  }
  // A strand of cable wound round it, as if it had come up the cable and wears it.
  const tip = mesh(new THREE.ConeGeometry(0.06, 0.3, 6), M.flesh);
  tip.position.y = 0.42 + 0.15;
  segs[segs.length - 1].add(tip);
  return { root, segs };
}

/** The removable handle of a knife switch: ebony grip, brass blade. */
export function switchHandleItem(): THREE.Group {
  const g = new THREE.Group();
  partC(g, M.black, 0, 0.03, -0.06, 0.05, 0.05, 0.12);
  partC(g, M.brass, 0, 0.02, 0.08, 0.03, 0.012, 0.18);
  return g;
}

/** The superintendent, slumped against the hut wall, rimed with frost. Not one of the risen. */
export function frozenBody(): THREE.Group {
  const g = new THREE.Group();
  const rig = new HumanRig({
    colors: {
      coat: 0x3a3226,
      coatDark: 0x221c14,
      trousers: 0x2a2620,
      shoes: 0x14100c,
      skin: 0x9aa4a0,
      shirt: 0xa8a49a,
      hair: 0xb8b8b0,
      eyes: 0x404844,
    },
    bulk: 1.1,
    torso: 0.6,
  });
  rig.setPose({
    spine: [-0.35, 0, 0.1],
    neck: [0.9, -0.3, 0.1],
    thighL: [-1.45, 0, 0.25],
    kneeL: [0.3, 0, 0],
    thighR: [-1.4, 0, -0.2],
    kneeR: [0.5, 0, 0],
    shoulderL: [0.2, 0, 0.35],
    elbowL: [-0.2, 0, 0],
    shoulderR: [-0.9, 0, -0.3],
    elbowR: [-1.2, 0, 0],
  });
  rig.root.position.y = -0.86;
  g.add(rig.root);
  // Frost on his shoulders and a drift against his legs.
  part(g, M.snow, 0, 0.62, -0.1, 0.5, 0.04, 0.25);
  const drift = mesh(new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.snow);
  drift.scale.set(1.2, 0.4, 1);
  drift.position.set(0, 0, 0.35);
  g.add(drift);
  return g;
}

/** Panelled wooden house door in its frame; the leaf ('leaf') is hinged on the left. Front +Z. */
export function houseDoor(w = 0.9, h = 2.0, mat: Mat = M.woodDark, open = false): THREE.Group {
  const g = new THREE.Group();
  part(g, M.paint, -w / 2 - 0.05, 0, 0, 0.1, h + 0.1, 0.2);
  part(g, M.paint, w / 2 + 0.05, 0, 0, 0.1, h + 0.1, 0.2);
  part(g, M.paint, 0, h, 0, w + 0.2, 0.1, 0.2);
  const leaf = new THREE.Group();
  leaf.name = 'leaf';
  part(leaf, mat, w / 2, 0, 0, w, h, 0.05);
  for (const y of [0.35, 1.15]) part(leaf, M.wood, w / 2, y, 0.03, w * 0.7, 0.55, 0.02);
  cyl(leaf, M.brass, w - 0.1, h * 0.48, 0.05, 0.03, 0.04, 'z', 8);
  leaf.position.set(-w / 2, 0, 0.04);
  if (open) leaf.rotation.y = -1.3;
  g.add(leaf);
  return g;
}

/** A painted board with lettering (drawn into its own texture, so it goes with the room). */
export function letteredBoard(lines: string[], w: number, h: number, colors = { bg: '#e8e0c8', ink: '#2a2418' }): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, -0.02, w + 0.12, h + 0.12, 0.05);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.max(64, Math.round((512 * h) / w));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = colors.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = c.height / (lines.length + 0.6);
  lines.forEach((l, i) => {
    ctx.font = `bold ${Math.round(lh * (i === 0 ? 0.62 : 0.48))}px serif`;
    ctx.fillText(l, c.width / 2, lh * (i + 0.8));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.owned = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.set(0, h / 2 + 0.06, 0.012);
  g.add(m);
  return g;
}

/** The night clerk, slumped forward over the recorder table on his chair. Front +Z (towards the table). */
export function slumpedClerk(): THREE.Group {
  const g = new THREE.Group();
  const rig = new HumanRig({
    colors: {
      coat: 0x6a6656,
      coatDark: 0x3a382e,
      trousers: 0x2a2a26,
      shoes: 0x16120e,
      skin: 0x8e9c90,
      shirt: 0xb8b4a4,
      hair: 0x2a2018,
      eyes: 0x30382e,
    },
    bulk: 0.95,
    torso: 0.55,
    seaweed: true,
  });
  rig.setPose({
    spine: [0.75, 0, 0],
    neck: [0.5, 0.3, 0],
    thighL: [-1.5, 0, 0.1],
    kneeL: [1.45, 0, 0],
    thighR: [-1.5, 0, -0.1],
    kneeR: [1.5, 0, 0],
    shoulderL: [-1.6, 0, 0.3],
    elbowL: [-0.5, 0, 0],
    shoulderR: [-1.5, 0, -0.35],
    elbowR: [-0.6, 0, 0],
  });
  rig.root.position.y = -0.82 + 0.46;
  g.add(rig.root);
  return g;
}
