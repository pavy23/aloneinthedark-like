import * as THREE from 'three';
import { M, type Mat } from '../render/materials';
import { cyl, mesh, part, partC, quad, ring, rod } from '../render/geo';

// Prop library. Every builder returns a Group whose origin is the centre of its footprint on the floor,
// with its "front" facing +Z. Rooms rotate/position them and add colliders by footprint.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function crate(w = 0.9, h = 0.8, d = 0.9, mat: Mat = M.woodLight): THREE.Group {
  const g = new THREE.Group();
  part(g, mat, 0, 0, 0, w, h, d);
  const band = M.woodDark;
  part(g, band, 0, 0.05, d / 2 + 0.005, w + 0.01, 0.08, 0.02);
  part(g, band, 0, h - 0.13, d / 2 + 0.005, w + 0.01, 0.08, 0.02);
  part(g, band, 0, 0.05, -d / 2 - 0.005, w + 0.01, 0.08, 0.02);
  part(g, band, 0, h - 0.13, -d / 2 - 0.005, w + 0.01, 0.08, 0.02);
  part(g, band, 0, 0.05, 0, w + 0.01, 0.08, d + 0.01);
  return g;
}

export function barrel(r = 0.3, h = 0.9): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.woodLight, 0, h / 2, 0, r, h, 'y', 10);
  cyl(g, M.iron, 0, h * 0.2, 0, r + 0.015, 0.05, 'y', 10);
  cyl(g, M.iron, 0, h * 0.8, 0, r + 0.015, 0.05, 'y', 10);
  return g;
}

export function locker(w = 0.6, h = 1.85, d = 0.5, mat: Mat = M.steelGreen): THREE.Group {
  const g = new THREE.Group();
  part(g, mat, 0, 0, 0, w, h, d);
  part(g, M.black, 0, 0.1, d / 2 + 0.003, 0.012, h - 0.2, 0.01);
  for (let i = 0; i < 4; i++) part(g, M.black, -w / 4, h - 0.3 - i * 0.05, d / 2 + 0.003, w / 3, 0.015, 0.01);
  for (let i = 0; i < 4; i++) part(g, M.black, w / 4, h - 0.3 - i * 0.05, d / 2 + 0.003, w / 3, 0.015, 0.01);
  part(g, M.brass, 0.04, h * 0.5, d / 2 + 0.01, 0.03, 0.1, 0.03);
  return g;
}

export function table(w = 1.2, d = 0.8, h = 0.76, mat: Mat = M.wood): THREE.Group {
  const g = new THREE.Group();
  part(g, mat, 0, h - 0.05, 0, w, 0.05, d);
  const lx = w / 2 - 0.06;
  const lz = d / 2 - 0.06;
  for (const [x, z] of [
    [lx, lz],
    [-lx, lz],
    [lx, -lz],
    [-lx, -lz],
  ])
    part(g, mat, x, 0, z, 0.06, h - 0.05, 0.06);
  // Fiddle rail (ships' tables have raised edges so things do not slide off).
  part(g, mat, 0, h, d / 2 - 0.015, w, 0.03, 0.02);
  part(g, mat, 0, h, -d / 2 + 0.015, w, 0.03, 0.02);
  return g;
}

export function chair(mat: Mat = M.wood, fallen = false): THREE.Group {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  part(inner, mat, 0, 0.42, 0, 0.44, 0.05, 0.42);
  for (const [x, z] of [
    [0.18, 0.17],
    [-0.18, 0.17],
    [0.18, -0.17],
    [-0.18, -0.17],
  ])
    part(inner, mat, x, 0, z, 0.04, 0.42, 0.04);
  part(inner, mat, 0, 0.47, -0.19, 0.44, 0.45, 0.04);
  if (fallen) {
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(0, 0.22, 0.2);
  }
  g.add(inner);
  return g;
}

export function bunk(len = 2.0, w = 0.85, double = true): THREE.Group {
  const g = new THREE.Group();
  const frame = M.woodDark;
  const levels = double ? [0.35, 1.3] : [0.4];
  for (const y of levels) {
    part(g, frame, 0, y, 0, w, 0.12, len);
    part(g, M.blanket, 0, y + 0.12, 0.08, w - 0.08, 0.12, len - 0.3);
    part(g, M.ceramic, 0, y + 0.12, -len / 2 + 0.2, w - 0.2, 0.1, 0.28);
    part(g, frame, 0, y + 0.12, len / 2 - 0.02, w, 0.18, 0.04);
  }
  const top = double ? 1.55 : 0.7;
  for (const [x, z] of [
    [w / 2 - 0.03, len / 2 - 0.03],
    [-w / 2 + 0.03, len / 2 - 0.03],
    [w / 2 - 0.03, -len / 2 + 0.03],
    [-w / 2 + 0.03, -len / 2 + 0.03],
  ])
    part(g, frame, x, 0, z, 0.06, top, 0.06);
  return g;
}

export function desk(w = 1.4, d = 0.7): THREE.Group {
  const g = new THREE.Group();
  part(g, M.wood, 0, 0.72, 0, w, 0.05, d);
  part(g, M.wood, -w / 2 + 0.22, 0, 0, 0.42, 0.72, d - 0.04);
  part(g, M.wood, w / 2 - 0.05, 0, 0, 0.06, 0.72, d - 0.04);
  for (let i = 0; i < 3; i++) {
    part(g, M.woodDark, -w / 2 + 0.22, 0.08 + i * 0.22, d / 2 - 0.01, 0.38, 0.18, 0.02);
    part(g, M.brass, -w / 2 + 0.22, 0.16 + i * 0.22, d / 2 + 0.005, 0.08, 0.02, 0.02);
  }
  // Green leather writing surface
  part(g, M.greenCloth, 0.1, 0.77, 0, w * 0.6, 0.005, d * 0.6);
  return g;
}

export function bookshelf(w = 1.1, h = 1.8, d = 0.34): THREE.Group {
  const g = new THREE.Group();
  const f = M.woodDark;
  part(g, f, 0, 0, -d / 2 + 0.02, w, h, 0.04);
  part(g, f, -w / 2 + 0.02, 0, 0, 0.04, h, d);
  part(g, f, w / 2 - 0.02, 0, 0, 0.04, h, d);
  const shelves = 4;
  for (let i = 0; i <= shelves; i++) part(g, f, 0, (i * (h - 0.04)) / shelves, 0, w, 0.04, d);
  for (let i = 0; i < shelves; i++) {
    const y = (i * (h - 0.04)) / shelves + 0.04;
    const q = quad(g, M.books, 0, y + 0.19, d / 2 - 0.06, w - 0.1, 0.38);
    q.position.y = y + (h - 0.04) / shelves / 2 - 0.02;
    // Rail so books stay put in a seaway.
    part(g, M.brass, 0, y + 0.12, d / 2 - 0.01, w - 0.08, 0.015, 0.015);
  }
  return g;
}

/** Caged bulkhead light. The bulb is named so the room can switch it with ship power. */
export function cageLamp(name: string, hanging = true): THREE.Group {
  const g = new THREE.Group();
  const bulb = mesh(new THREE.SphereGeometry(0.07, 6, 4), M.bulbOff);
  bulb.name = name;
  bulb.userData.bulb = true;
  if (hanging) {
    rod(g, M.iron, V(0, 0, 0), V(0, -0.25, 0), 0.012, 4);
    bulb.position.set(0, -0.36, 0);
    cyl(g, M.iron, 0, -0.27, 0, 0.09, 0.05, 'y', 8, 0.05);
    ring(g, M.iron, 0, -0.36, 0, 0.09, 0.008, 8).rotation.x = Math.PI / 2;
  } else {
    bulb.position.set(0, 0, 0.1);
    cyl(g, M.iron, 0, 0, 0.02, 0.1, 0.04, 'z', 8);
    ring(g, M.iron, 0, 0, 0.1, 0.09, 0.008, 8);
  }
  g.add(bulb);
  return g;
}

export function porthole(r = 0.2): THREE.Group {
  const g = new THREE.Group();
  ring(g, M.brass, 0, 0, 0.02, r, 0.035, 12);
  const glass = mesh(new THREE.CircleGeometry(r, 12), M.porthole);
  glass.position.z = 0.01;
  g.add(glass);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    partC(g, M.brass, Math.cos(a) * (r + 0.07), Math.sin(a) * (r + 0.07), 0.03, 0.05, 0.05, 0.04);
  }
  return g;
}

/** Ship door with frame, raised sill and dog handles. Origin at the threshold centre, front = +Z. */
export function shipDoor(w = 0.8, h = 1.85, mat: Mat = M.steelDark, open = false): THREE.Group {
  const g = new THREE.Group();
  const frame = M.iron;
  part(g, frame, -w / 2 - 0.06, 0, 0, 0.12, h + 0.12, 0.26);
  part(g, frame, w / 2 + 0.06, 0, 0, 0.12, h + 0.12, 0.26);
  part(g, frame, 0, h, 0, w + 0.24, 0.12, 0.26);
  part(g, frame, 0, 0, 0, w + 0.24, 0.25, 0.26); // sill / coaming
  const leaf = new THREE.Group();
  leaf.name = 'leaf';
  part(leaf, mat, w / 2, 0.25, 0, w, h - 0.25, 0.05);
  // Dogs (the short levers that clamp a watertight door shut)
  for (const [y, side] of [
    [0.55, 1],
    [h - 0.35, 1],
    [0.55, -1],
    [h - 0.35, -1],
  ]) {
    part(leaf, M.ironLight, side > 0 ? w - 0.05 : 0.05, y, 0.05, 0.05, 0.05, 0.06);
  }
  part(leaf, M.brass, w - 0.14, h * 0.52, 0.05, 0.14, 0.03, 0.03);
  leaf.position.set(-w / 2, 0, 0.02);
  if (open) leaf.rotation.y = -1.3;
  g.add(leaf);
  return g;
}

export function ladder(h: number, w = 0.5): THREE.Group {
  const g = new THREE.Group();
  part(g, M.ironLight, -w / 2, 0, 0, 0.05, h, 0.05);
  part(g, M.ironLight, w / 2, 0, 0, 0.05, h, 0.05);
  for (let y = 0.28; y < h; y += 0.3) part(g, M.ironLight, 0, y, 0, w, 0.03, 0.03);
  return g;
}

/** Steep ship's stairs rising along -Z (towards the back), origin at the foot. */
export function stairs(width: number, rise: number, run: number, steps = 8, mat: Mat = M.steelDark): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    part(g, mat, 0, (i * rise) / steps, (-i * run) / steps, width, 0.05, run / steps + 0.03);
  }
  const s1 = V(width / 2, 0, 0);
  const s2 = V(width / 2, rise, -run);
  rod(g, M.iron, s1, s2, 0.03, 4);
  rod(g, M.iron, V(-width / 2, 0, 0), V(-width / 2, rise, -run), 0.03, 4);
  rod(g, M.brass, V(width / 2, 0.9, 0), V(width / 2, rise + 0.9, -run), 0.02, 4);
  rod(g, M.brass, V(-width / 2, 0.9, 0), V(-width / 2, rise + 0.9, -run), 0.02, 4);
  return g;
}

export function valveWheel(r = 0.16, name?: string): THREE.Group {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  ring(wheel, M.redPaint, 0, 0, 0, r, 0.018, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    rod(wheel, M.redPaint, V(0, 0, 0), V(Math.cos(a) * r, Math.sin(a) * r, 0), 0.012, 4);
  }
  cyl(wheel, M.iron, 0, 0, 0, 0.03, 0.05, 'z', 6);
  if (name) wheel.name = name;
  g.add(wheel);
  return g;
}

/** Round dial gauge facing +Z with a named needle pivot. */
export function gauge(r = 0.1, needleName?: string): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.brass, 0, 0, 0, r + 0.015, 0.04, 'z', 12);
  const face = mesh(new THREE.CircleGeometry(r, 12), M.gauge);
  face.position.z = 0.021;
  g.add(face);
  const pivot = new THREE.Group();
  pivot.position.z = 0.025;
  partC(pivot, M.black, 0, r * 0.4, 0, 0.012, r * 0.8, 0.005);
  pivot.rotation.z = 2.2;
  if (needleName) pivot.name = needleName;
  g.add(pivot);
  return g;
}

export function ventilator(h = 2.4, r = 0.28): THREE.Group {
  const g = new THREE.Group();
  const mat = M.paint;
  cyl(g, mat, 0, h / 2, 0, r, h, 'y', 10);
  // Cowl: a short tilted section and a bell mouth facing +Z.
  const elbow = cyl(g, mat, 0, h + 0.18, 0.12, r * 1.05, 0.5, 'y', 10);
  elbow.rotation.x = 0.8;
  const mouth = cyl(g, M.redPaint, 0, h + 0.33, 0.36, r * 1.5, 0.28, 'z', 10, r * 1.2);
  mouth.rotation.x = Math.PI / 2 + 0.15;
  const inner = mesh(new THREE.CircleGeometry(r * 1.35, 10), M.black);
  inner.position.set(0, h + 0.35, 0.5);
  g.add(inner);
  return g;
}

export function bollard(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 0.9, 0.06, 0.4);
  cyl(g, M.iron, -0.25, 0.3, 0, 0.12, 0.5, 'y', 8);
  cyl(g, M.iron, 0.25, 0.3, 0, 0.12, 0.5, 'y', 8);
  cyl(g, M.iron, -0.25, 0.57, 0, 0.16, 0.05, 'y', 8);
  cyl(g, M.iron, 0.25, 0.57, 0, 0.16, 0.05, 'y', 8);
  return g;
}

export function lifebuoy(): THREE.Group {
  const g = new THREE.Group();
  ring(g, M.lifebuoy, 0, 0, 0, 0.3, 0.07, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    partC(g, M.ceramic, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0, 0.1, 0.1, 0.16, 0, 0, a);
  }
  return g;
}

/** Large grooved sheave (the bow sheaves cable ships run cable over). Axis along X. */
export function sheave(r = 0.9, w = 0.3): THREE.Group {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'sheaveWheel';
  cyl(wheel, M.ironLight, 0, 0, 0, r, w * 0.5, 'x', 16);
  const rim1 = ring(wheel, M.iron, w * 0.25, 0, 0, r, 0.06, 16);
  rim1.rotation.y = Math.PI / 2;
  const rim2 = ring(wheel, M.iron, -w * 0.25, 0, 0, r, 0.06, 16);
  rim2.rotation.y = Math.PI / 2;
  cyl(wheel, M.iron, 0, 0, 0, 0.14, w + 0.2, 'x', 8);
  g.add(wheel);
  return g;
}

/** Cable engine: picking-up drum with its small steam engine, gearing and brake. Origin floor centre. */
export function cableEngine(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 3.0, 0.3, 2.0);
  // Drum (axis along X)
  const drum = cyl(g, M.ironLight, 0, 1.1, 0.2, 0.75, 1.6, 'x', 16);
  drum.name = 'drum';
  cyl(g, M.iron, -0.85, 1.1, 0.2, 0.9, 0.08, 'x', 16);
  cyl(g, M.iron, 0.85, 1.1, 0.2, 0.9, 0.08, 'x', 16);
  // Frames
  part(g, M.steelDark, -1.1, 0.3, 0.2, 0.2, 1.3, 1.2);
  part(g, M.steelDark, 1.1, 0.3, 0.2, 0.2, 1.3, 1.2);
  // Big gear on the side
  const gear = cyl(g, M.iron, 1.3, 1.0, 0.2, 0.7, 0.12, 'x', 20);
  gear.name = 'gear';
  // Two small steam cylinders driving it
  cyl(g, M.steelGreen, 1.25, 0.9, -0.75, 0.2, 0.7, 'y', 10);
  cyl(g, M.steelGreen, -1.25, 0.9, -0.75, 0.2, 0.7, 'y', 10);
  part(g, M.steelDark, 0, 0.3, -0.75, 2.6, 0.35, 0.4);
  // Wound cable on the drum
  for (let i = -3; i <= 3; i++) ring(g, M.cable, i * 0.2, 1.1, 0.2, 0.78, 0.07, 14).rotation.y = Math.PI / 2;
  return g;
}

/** A grapnel — the hooked "anchor" dragged along the sea bed to catch a cable. */
export function grapnel(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.ironLight, V(0, 0.1, -0.7), V(0, 0.1, 0.5), 0.05, 6);
  ring(g, M.ironLight, 0, 0.1, -0.78, 0.09, 0.025, 8).rotation.y = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tip = V(Math.cos(a) * 0.32, 0.1 + Math.sin(a) * 0.32, 0.25);
    rod(g, M.ironLight, V(0, 0.1, 0.5), tip, 0.035, 5);
    rod(g, M.ironLight, tip, V(Math.cos(a) * 0.24, 0.1 + Math.sin(a) * 0.24, 0.05), 0.03, 5);
  }
  g.rotation.z = 0.3;
  return g;
}

/** Cargo/cable hatch: coaming with a tarpaulin cover, battens and a chain across. */
export function hatch(w = 3, d = 3, h = 0.75): THREE.Group {
  const g = new THREE.Group();
  part(g, M.steelDark, 0, 0, 0, w, h, d);
  part(g, M.tarp, 0, h, 0, w + 0.08, 0.1, d + 0.08);
  const ridge = part(g, M.tarp, 0, h + 0.05, 0, w, 0.12, 0.6);
  ridge.scale.y = 0.8;
  for (const sx of [-1, 1]) part(g, M.woodDark, (sx * (w + 0.1)) / 2, h - 0.25, 0, 0.06, 0.2, d + 0.05);
  for (const sz of [-1, 1]) part(g, M.woodDark, 0, h - 0.25, (sz * (d + 0.1)) / 2, w + 0.05, 0.2, 0.06);
  // Chain across, padlocked
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const link = ring(g, M.ironLight, -w / 2 + t * w, h + 0.16 + Math.sin(t * Math.PI) * 0.06, 0.3, 0.05, 0.012, 6);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
  }
  part(g, M.brass, 0, h + 0.12, 0.34, 0.12, 0.14, 0.06);
  return g;
}

export function helm(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.wood, 0, 0, 0, 0.36, 0.95, 0.36);
  cyl(g, M.brass, 0, 1.0, 0.2, 0.08, 0.2, 'z', 8);
  const wheel = new THREE.Group();
  wheel.position.set(0, 1.05, 0.32);
  wheel.name = 'wheel';
  ring(wheel, M.wood, 0, 0, 0, 0.45, 0.035, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rod(wheel, M.wood, V(0, 0, 0), V(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0), 0.022, 4);
  }
  cyl(wheel, M.brass, 0, 0, 0, 0.09, 0.08, 'z', 8);
  g.add(wheel);
  return g;
}

/** Engine order telegraph: pedestal, round head with the dial and the lever. */
export function telegraph(name?: string): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.brass, 0, 0.45, 0, 0.08, 0.9, 'y', 8, 0.06);
  cyl(g, M.brass, 0, 0.02, 0, 0.18, 0.05, 'y', 8);
  cyl(g, M.brass, 0, 1.05, 0, 0.24, 0.16, 'z', 14);
  for (const s of [1, -1]) {
    const face = mesh(new THREE.CircleGeometry(0.2, 14), M.gauge);
    face.position.set(0, 1.05, s * 0.081);
    if (s < 0) face.rotation.y = Math.PI;
    g.add(face);
  }
  const lever = new THREE.Group();
  lever.position.set(0, 1.05, 0);
  part(lever, M.brass, 0.2, -0.02, 0, 0.35, 0.04, 0.2);
  part(lever, M.black, 0.4, -0.04, 0, 0.1, 0.08, 0.22);
  lever.rotation.z = 1.2;
  if (name) lever.name = name;
  g.add(lever);
  return g;
}

/** Compass binnacle with its soft-iron corrector spheres. */
export function binnacle(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.wood, 0, 0.55, 0, 0.18, 1.1, 'y', 10, 0.2);
  cyl(g, M.brass, 0, 1.15, 0, 0.22, 0.12, 'y', 10);
  const dome = mesh(new THREE.SphereGeometry(0.22, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  dome.position.y = 1.21;
  g.add(dome);
  for (const s of [-1, 1]) {
    rod(g, M.brass, V(s * 0.2, 1.0, 0), V(s * 0.38, 1.0, 0), 0.02, 4);
    const ball = mesh(new THREE.SphereGeometry(0.1, 8, 6), M.greenCloth);
    ball.position.set(s * 0.44, 1.02, 0);
    g.add(ball);
  }
  return g;
}

export function chartTable(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.wood, 0, 0, 0, 1.4, 0.9, 0.8);
  const top = part(g, M.wood, 0, 0.9, 0, 1.45, 0.05, 0.85);
  top.rotation.x = 0.1;
  const chart = quad(g, M.chart, 0, 0.955, 0.02, 1.1, 0.62, 0, -Math.PI / 2 + 0.1);
  chart.name = 'chart';
  for (let i = 0; i < 3; i++) {
    part(g, M.woodDark, 0, 0.12 + i * 0.25, 0.405, 1.3, 0.2, 0.02);
    part(g, M.brass, 0, 0.2 + i * 0.25, 0.42, 0.14, 0.02, 0.02);
  }
  // Parallel rule and dividers
  part(g, M.black, -0.3, 0.97, 0.1, 0.4, 0.01, 0.05, 0.1, 0.4);
  return g;
}

export function speakingTube(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.brass, V(0, 0, 0), V(0, 1.3, 0), 0.03, 6);
  const bell = cyl(g, M.brass, 0, 1.3, 0.08, 0.07, 0.12, 'z', 8, 0.04);
  bell.rotation.x = Math.PI / 2;
  return g;
}

/** Heavy iron safe. The door is a named group hinged on its left edge. */
export function safe(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 0.7, 0.8, 0.6);
  part(g, M.ironLight, 0, 0, 0, 0.74, 0.08, 0.64);
  const door = new THREE.Group();
  door.name = 'safeDoor';
  door.position.set(-0.3, 0, 0.3);
  part(door, M.steelGreen, 0.3, 0.1, 0.02, 0.6, 0.62, 0.05);
  cyl(door, M.brass, 0.3, 0.52, 0.06, 0.08, 0.04, 'z', 12);
  const dial = new THREE.Group();
  dial.name = 'safeDial';
  dial.position.set(0.3, 0.52, 0.085);
  partC(dial, M.black, 0, 0.05, 0, 0.012, 0.04, 0.01);
  door.add(dial);
  part(door, M.brass, 0.3, 0.26, 0.06, 0.2, 0.03, 0.04);
  g.add(door);
  // Gold leaf lettering band
  part(g, M.brass, 0, 0.72, 0.305, 0.5, 0.02, 0.005);
  return g;
}

/** The wireless bench: receiver and transmitter cabinets, rotary spark gap, Morse key, headphones. */
export function radioSet(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.wood, 0, 0.74, 0, 2.2, 0.06, 0.8);
  part(g, M.wood, -1.0, 0, 0, 0.1, 0.74, 0.75);
  part(g, M.wood, 1.0, 0, 0, 0.1, 0.74, 0.75);
  // Cabinets
  part(g, M.woodDark, -0.55, 0.8, -0.15, 0.8, 0.6, 0.45);
  part(g, M.black, -0.55, 0.85, 0.08, 0.72, 0.5, 0.01);
  part(g, M.woodDark, 0.45, 0.8, -0.15, 0.9, 0.75, 0.45);
  part(g, M.black, 0.45, 0.85, 0.08, 0.82, 0.65, 0.01);
  const dials = [
    [-0.75, 1.2, 'rxDial'],
    [-0.35, 1.2, 'rxDial2'],
    [0.2, 1.35, 'txMeter'],
    [0.62, 1.35, 'waveDial'],
  ] as const;
  for (const [x, y, n] of dials) {
    const d = gauge(0.1, n);
    d.position.set(x, y, 0.1);
    g.add(d);
  }
  for (let i = 0; i < 5; i++) cyl(g, M.black, -0.8 + i * 0.12, 0.98, 0.1, 0.03, 0.04, 'z', 6);
  // Rotary spark gap on top, behind a guard
  const gap = new THREE.Group();
  gap.name = 'sparkGap';
  gap.position.set(0.45, 1.75, -0.15);
  cyl(gap, M.ironLight, 0, 0, 0, 0.18, 0.03, 'z', 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    partC(gap, M.brass, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0, 0.03, 0.03, 0.04, 0, 0, a);
  }
  g.add(gap);
  const spark = mesh(new THREE.SphereGeometry(0.05, 6, 4), M.spark);
  spark.name = 'spark';
  spark.position.set(0.45, 1.95, -0.15);
  spark.visible = false;
  g.add(spark);
  // Morse key
  part(g, M.black, 0.1, 0.8, 0.22, 0.12, 0.03, 0.22);
  const key = part(g, M.brass, 0.1, 0.84, 0.2, 0.03, 0.02, 0.2);
  key.name = 'morseKey';
  cyl(g, M.black, 0.1, 0.88, 0.3, 0.025, 0.02, 'y', 8);
  // Headphones
  ring(g, M.black, -0.3, 0.83, 0.25, 0.1, 0.01, 8).rotation.x = Math.PI / 2;
  cyl(g, M.black, -0.4, 0.8, 0.25, 0.045, 0.03, 'y', 8);
  cyl(g, M.black, -0.2, 0.8, 0.25, 0.045, 0.03, 'y', 8);
  // Accumulators (emergency battery) under the bench
  for (let i = 0; i < 6; i++) {
    part(g, M.porthole, -0.7 + i * 0.25, 0.02, 0.0, 0.18, 0.3, 0.18);
    part(g, M.iron, -0.7 + i * 0.25, 0.32, 0.0, 0.16, 0.04, 0.16);
  }
  return g;
}

/** Scotch marine boiler, front facing +Z, with three glowing furnace mouths named furnace0..2. */
export function scotchBoiler(prefix: string): THREE.Group {
  const g = new THREE.Group();
  const r = 1.6;
  const len = 3.2;
  cyl(g, M.steelDark, 0, r + 0.25, -len / 2, r, len, 'z', 16);
  const front = cyl(g, M.iron, 0, r + 0.25, 0.02, r + 0.03, 0.06, 'z', 16);
  front.name = `${prefix}front`;
  // Lagging bands
  for (let i = 0; i < 4; i++) cyl(g, M.iron, 0, r + 0.25, -0.4 - i * 0.8, r + 0.02, 0.06, 'z', 16);
  // Saddles
  part(g, M.steelDark, 0, 0, -0.6, 2.6, 0.5, 0.4);
  part(g, M.steelDark, 0, 0, -2.6, 2.6, 0.5, 0.4);
  // Furnace mouths with doors
  const xs = [-0.95, 0, 0.95];
  xs.forEach((x, i) => {
    const glow = mesh(new THREE.CircleGeometry(0.34, 10), M.furnace);
    glow.position.set(x, 1.05, 0.06);
    glow.name = `${prefix}glow${i}`;
    g.add(glow);
    const door = new THREE.Group();
    door.name = `${prefix}door${i}`;
    door.position.set(x - 0.3, 1.05, 0.08);
    partC(door, M.ironLight, 0.3, 0, 0.02, 0.62, 0.5, 0.05);
    for (let k = 0; k < 3; k++) partC(door, M.ember, 0.3 - 0.15 + k * 0.15, -0.12, 0.05, 0.08, 0.03, 0.01);
    partC(door, M.brass, 0.52, 0.08, 0.06, 0.12, 0.03, 0.03);
    door.rotation.y = i === 1 ? 0 : 0;
    g.add(door);
  });
  // Smokebox doors & gauge glass
  part(g, M.iron, -0.6, 2.4, 0.06, 0.8, 0.8, 0.05);
  part(g, M.iron, 0.6, 2.4, 0.06, 0.8, 0.8, 0.05);
  const pg = gauge(0.13, `${prefix}pressure`);
  pg.position.set(0, 3.45, 0.1);
  g.add(pg);
  cyl(g, M.porthole, 1.3, 2.9, 0.12, 0.03, 0.6, 'y', 6);
  return g;
}

/**
 * Three-cylinder triple-expansion engine (HP, IP, LP) standing on its columns over the crank pit.
 * Origin at floor centre; crankshaft along Z.
 */
export function tripleExpansion(): THREE.Group {
  const g = new THREE.Group();
  const zs = [-1.3, 0, 1.4];
  const rs = [0.42, 0.62, 0.85];
  part(g, M.iron, 0, 0, 0.05, 2.0, 0.6, 4.6); // bedplate
  // Crank pit rails and columns (A-frames approximated by slanted boxes)
  zs.forEach((z) => {
    for (const s of [-1, 1]) {
      const col = part(g, M.steelGreen, s * 0.75, 0.6, z, 0.16, 2.3, 0.3);
      col.rotation.z = -s * 0.12;
    }
  });
  // Entablature and cylinder block
  part(g, M.steelGreen, 0, 2.85, 0.05, 1.9, 0.25, 4.6);
  zs.forEach((z, i) => {
    cyl(g, M.steelGreen, 0, 3.1 + 0.75, z, rs[i], 1.5, 'y', 14);
    cyl(g, M.iron, 0, 3.1 + 1.52, z, rs[i] + 0.04, 0.06, 'y', 14);
    cyl(g, M.brass, 0, 3.1 + 1.57, z, 0.08, 0.06, 'y', 8);
    // Valve chest
    part(g, M.steelGreen, 0.9, 3.2, z, 0.35, 1.1, Math.min(0.9, rs[i] * 1.4));
  });
  // Crankshaft, cranks and connecting rods (named for animation)
  cyl(g, M.ironLight, 0, 0.85, 0.05, 0.12, 4.4, 'z', 8);
  zs.forEach((z, i) => {
    const crank = new THREE.Group();
    crank.name = `crank${i}`;
    crank.position.set(0, 0.85, z);
    partC(crank, M.ironLight, 0, 0.18, 0, 0.18, 0.5, 0.12);
    crank.rotation.z = (i * Math.PI * 2) / 3;
    g.add(crank);
    const rodMesh = rod(g, M.ironLight, V(0, 1.2, z), V(0, 2.7, z), 0.06, 6);
    rodMesh.name = `conrod${i}`;
    part(g, M.brass, 0, 2.6, z, 0.3, 0.2, 0.2); // crosshead
  });
  // Handrails of the upper platform
  const rail = M.ironLight;
  for (const s of [-1, 1]) {
    rod(g, rail, V(s * 1.3, 3.0, -2.2), V(s * 1.3, 3.0, 2.3), 0.025, 4);
    rod(g, rail, V(s * 1.3, 3.5, -2.2), V(s * 1.3, 3.5, 2.3), 0.025, 4);
    for (let z = -2.2; z <= 2.3; z += 1.5) rod(g, rail, V(s * 1.3, 2.85, z), V(s * 1.3, 3.5, z), 0.025, 4);
  }
  // Reversing gear wheel at the starting platform
  const rev = valveWheel(0.35);
  rev.position.set(1.15, 1.4, 2.35);
  rev.rotation.y = Math.PI / 2;
  g.add(rev);
  return g;
}

/** Steam-engine-driven dynamo set on its bedplate, with drain + stop valves and gauges (named). */
export function dynamoSet(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 1.2, 0.3, 2.6);
  // Vertical enclosed engine
  part(g, M.steelGreen, 0, 0.3, -0.7, 0.8, 0.9, 0.8);
  cyl(g, M.steelGreen, 0, 1.55, -0.7, 0.3, 0.7, 'y', 12);
  cyl(g, M.iron, 0, 1.92, -0.7, 0.33, 0.05, 'y', 12);
  // Flywheel (named for spinning)
  const fly = new THREE.Group();
  fly.name = 'flywheel';
  fly.position.set(0, 0.8, 0.0);
  cyl(fly, M.ironLight, 0, 0, 0, 0.55, 0.14, 'z', 16);
  for (let i = 0; i < 4; i++) partC(fly, M.iron, 0, 0, 0.08, 0.08, 0.9, 0.04, 0, 0, (i * Math.PI) / 4);
  g.add(fly);
  // Dynamo (axis along Z) with brass commutator
  cyl(g, M.steelDark, 0, 0.8, 0.8, 0.45, 0.9, 'z', 14);
  cyl(g, M.copper, 0, 0.8, 1.3, 0.28, 0.14, 'z', 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    part(g, M.black, Math.cos(a) * 0.3, 0.8 + Math.sin(a) * 0.3 - 0.03, 1.3, 0.06, 0.06, 0.08);
  }
  // Steam pipe from overhead, stop valve, then down to the engine; drain valve low.
  rod(g, M.rust, V(-0.45, 4.2, -0.7), V(-0.45, 2.2, -0.7), 0.07, 6);
  rod(g, M.rust, V(-0.45, 1.75, -0.7), V(-0.2, 1.75, -0.7), 0.06, 6);
  const stop = valveWheel(0.18, 'stopValve');
  stop.position.set(-0.62, 1.98, -0.7);
  stop.rotation.y = -Math.PI / 2;
  g.add(stop);
  part(g, M.iron, -0.45, 1.85, -0.7, 0.22, 0.28, 0.22);
  rod(g, M.rust, V(-0.45, 1.75, -0.7), V(-0.45, 0.35, -0.7), 0.035, 6);
  const drain = valveWheel(0.1, 'drainValve');
  drain.position.set(-0.6, 0.55, -0.7);
  drain.rotation.y = -Math.PI / 2;
  g.add(drain);
  const rpm = gauge(0.1, 'rpmNeedle');
  rpm.position.set(0.41, 1.1, -0.45);
  rpm.rotation.y = Math.PI / 2;
  g.add(rpm);
  const press = gauge(0.1, 'steamNeedle');
  press.position.set(-0.45, 2.3, -0.56);
  g.add(press);
  // Steam puff emitter anchor for the drain.
  const puff = new THREE.Object3D();
  puff.name = 'drainOutlet';
  puff.position.set(-0.45, 0.3, -0.45);
  g.add(puff);
  return g;
}

/** Marble main switchboard with knife switches and the main breaker lever (named). */
export function switchboard(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 1.8, 0.2, 0.5);
  part(g, M.marble, 0, 0.2, -0.15, 1.8, 2.0, 0.08);
  for (let i = 0; i < 3; i++) {
    const m = gauge(0.13, i === 0 ? 'voltNeedle' : i === 1 ? 'ampNeedle' : undefined);
    m.position.set(-0.55 + i * 0.55, 1.85, -0.1);
    g.add(m);
  }
  for (let i = 0; i < 5; i++) {
    part(g, M.copper, -0.6 + i * 0.3, 1.05, -0.08, 0.08, 0.3, 0.05);
    part(g, M.black, -0.6 + i * 0.3, 1.25, -0.02, 0.05, 0.05, 0.1);
  }
  const lever = new THREE.Group();
  lever.name = 'breaker';
  lever.position.set(0, 0.6, -0.05);
  partC(lever, M.copper, 0, 0.2, 0.05, 0.14, 0.4, 0.04);
  partC(lever, M.black, 0, 0.42, 0.08, 0.2, 0.06, 0.06);
  lever.rotation.x = -0.9;
  g.add(lever);
  part(g, M.brass, 0, 0.35, -0.1, 0.3, 0.06, 0.03);
  return g;
}

export function workbench(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0.82, 0, 1.6, 0.08, 0.7);
  for (const [x, z] of [
    [0.75, 0.3],
    [-0.75, 0.3],
    [0.75, -0.3],
    [-0.75, -0.3],
  ])
    part(g, M.iron, x, 0, z, 0.07, 0.82, 0.07);
  part(g, M.iron, 0.55, 0.9, 0.2, 0.2, 0.15, 0.15);
  part(g, M.ironLight, -0.4, 0.9, 0.0, 0.35, 0.03, 0.05, 0, 0.4);
  part(g, M.redPaint, -0.1, 0.9, -0.1, 0.4, 0.2, 0.2);
  return g;
}

export function coalHeap(r = 1.1): THREE.Group {
  const g = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(r, r * 0.7, 9, 1), M.coal);
  cone.position.y = r * 0.35;
  cone.rotation.y = 0.3;
  g.add(cone);
  const shovel = new THREE.Group();
  rod(shovel, M.wood, V(0, 0, 0), V(0, 1.1, 0), 0.02, 4);
  partC(shovel, M.ironLight, 0, 0.0, 0.05, 0.26, 0.3, 0.02);
  shovel.position.set(r * 0.7, 0.2, r * 0.5);
  shovel.rotation.set(0.3, 0, -0.5);
  g.add(shovel);
  return g;
}

/**
 * Circular cable tank: steel wall, flooded interior, central cone and flakes of coiled cable.
 * Origin at the tank centre on the walkway floor level (y=0). Water surface at y = waterY.
 */
export function cableTank(r: number, waterY: number): THREE.Group {
  const g = new THREE.Group();
  // Double-sided copies (never mutate the shared palette materials).
  const steel2 = M.steel.m.clone();
  steel2.side = THREE.DoubleSide;
  steel2.userData.shared = false;
  const wall = mesh(new THREE.CylinderGeometry(r, r, 3.2, 28, 1, true), steel2);
  wall.position.y = -1.3;
  g.add(wall);
  const rim = mesh(new THREE.TorusGeometry(r, 0.08, 4, 28), M.iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  g.add(rim);
  // Coamings stand a little above the walkway.
  const dark2 = M.steelDark.m.clone();
  dark2.side = THREE.DoubleSide;
  dark2.userData.shared = false;
  const coam = mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.3, 28, 1, true), dark2);
  coam.position.y = 0.15;
  g.add(coam);
  // Coiled cable "flakes" just below the water.
  for (let k = 0; k < 7; k++) {
    const rr = 1.2 + k * ((r - 1.5) / 6);
    const t = mesh(new THREE.TorusGeometry(rr, 0.1, 4, 26), M.cable);
    t.rotation.x = Math.PI / 2;
    t.position.y = waterY - 0.08 - (k % 2) * 0.05;
    g.add(t);
  }
  const water = mesh(new THREE.CircleGeometry(r - 0.02, 28), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  water.name = 'tankWater';
  g.add(water);
  // Central cone
  const cone = mesh(new THREE.CylinderGeometry(0.35, 0.9, 2.6, 12), M.steelDark);
  cone.position.y = waterY + 0.6;
  g.add(cone);
  return g;
}

/** The thing that came up with the cable: a black, wet, many-lobed stone wrapped in cable. */
export function idol(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.DodecahedronGeometry(0.18, 0), M.idol);
  body.scale.set(1, 1.5, 0.85);
  body.position.y = 0.26;
  g.add(body);
  const head = mesh(new THREE.OctahedronGeometry(0.12, 0), M.idol);
  head.position.y = 0.56;
  head.scale.set(1.1, 0.8, 1);
  g.add(head);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const t = rod(g, M.idol, V(0, 0.4, 0), V(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2), 0.025, 4);
    t.name = `tendril${i}`;
  }
  for (let i = 0; i < 3; i++) {
    const c = ring(g, M.cable, 0, 0.18 + i * 0.12, 0, 0.19 - i * 0.02, 0.025, 10);
    c.rotation.x = Math.PI / 2 + (i - 1) * 0.3;
  }
  const eye = mesh(new THREE.SphereGeometry(0.03, 5, 4), M.idolGlow);
  eye.position.set(0, 0.58, 0.1);
  g.add(eye);
  return g;
}

export function photoFrame(mat: Mat): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, -0.17, 0, 0.44, 0.34, 0.03);
  quad(g, mat, 0, 0, 0.018, 0.36, 0.27);
  return g;
}

/** Wall-mounted fire station cabinet with a glass front and a fire axe (both named). */
export function fireCabinet(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.redPaint, 0, 0, 0, 0.7, 1.1, 0.18);
  part(g, M.black, 0, 0.05, 0.09, 0.62, 1.0, 0.005);
  const glass = mesh(new THREE.PlaneGeometry(0.6, 0.98), new THREE.MeshBasicMaterial({ color: 0x9fb4b8, transparent: true, opacity: 0.25 }));
  glass.position.set(0, 0.55, 0.1);
  glass.name = 'glass';
  g.add(glass);
  const axe = new THREE.Group();
  axe.name = 'axe';
  rod(axe, M.woodLight, V(0, 0.15, 0.06), V(0, 0.95, 0.06), 0.025, 5);
  partC(axe, M.redPaint, 0.08, 0.9, 0.06, 0.2, 0.12, 0.03);
  partC(axe, M.ironLight, 0.17, 0.9, 0.06, 0.04, 0.16, 0.03);
  g.add(axe);
  return g;
}

/** Hanging lifeboat davit (radial type) with the empty falls swinging. */
export function davit(): THREE.Group {
  const g = new THREE.Group();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(V(0, t * 2.8, Math.sin(t * Math.PI * 0.5) * 1.3));
  }
  for (let i = 0; i < pts.length - 1; i++) rod(g, M.paint, pts[i], pts[i + 1], 0.08, 6);
  part(g, M.iron, 0, 0, 0, 0.35, 0.1, 0.35);
  const fall = new THREE.Group();
  fall.name = 'fall';
  fall.position.set(0, 2.75, 1.3);
  rod(fall, M.rope, V(0, 0, 0), V(0, -2.2, 0), 0.02, 4);
  partC(fall, M.ironLight, 0, -2.25, 0, 0.12, 0.18, 0.06);
  g.add(fall);
  return g;
}

export function mast(h = 12): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.woodLight, 0, h / 2, 0, 0.22, h, 'y', 10, 0.14);
  part(g, M.iron, 0, 0, 0, 0.8, 0.2, 0.8);
  // Derrick boom resting
  rod(g, M.woodLight, V(0, 1.2, 0), V(0, 7.5, -2.5), 0.1, 6);
  // Oil-burning masthead lamp: glows whether or not the ship has power.
  const lamp = new THREE.Group();
  part(lamp, M.iron, 0, 0, 0, 0.2, 0.05, 0.2);
  const glass = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.22, 6), M.lanternGlass);
  glass.position.y = 0.16;
  lamp.add(glass);
  part(lamp, M.iron, 0, 0.27, 0, 0.22, 0.05, 0.22);
  lamp.position.set(0, 6.0, 0.25);
  g.add(lamp);
  return g;
}

export function puddle(r = 0.5): THREE.Mesh {
  const m = mesh(new THREE.CircleGeometry(r, 10), M.water);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(1, 0.6, 1);
  return m;
}

/** Wet footprints (a trail of small dark ovals) along a list of floor points. */
export function footprints(points: Array<[number, number]>): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x020404, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const h = Math.atan2(x1 - x0, z1 - z0);
    const steps = Math.floor(Math.hypot(x1 - x0, z1 - z0) / 0.35);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const side = k % 2 ? 0.1 : -0.1;
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), mat);
      m.rotation.set(-Math.PI / 2, 0, h);
      m.scale.set(0.7, 1.6, 1);
      m.position.set(x0 + (x1 - x0) * t + Math.cos(h) * side, 0.012, z0 + (z1 - z0) * t - Math.sin(h) * side);
      g.add(m);
    }
  }
  return g;
}

export function coatHook(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.brass, 0, 1.75, 0, 0.05, 0.05, 0.1);
  const coat = new THREE.Group();
  part(coat, M.black, 0, 0.75, 0.06, 0.45, 1.0, 0.12);
  part(coat, M.black, 0, 1.6, 0.06, 0.32, 0.18, 0.1);
  part(coat, M.brass, 0.1, 1.3, 0.13, 0.03, 0.03, 0.01);
  part(coat, M.brass, 0.1, 1.1, 0.13, 0.03, 0.03, 0.01);
  g.add(coat);
  return g;
}

export function bottle(): THREE.Group {
  const g = new THREE.Group();
  cyl(g, M.porthole, 0, 0.1, 0, 0.04, 0.2, 'y', 6);
  cyl(g, M.porthole, 0, 0.24, 0, 0.015, 0.08, 'y', 5);
  return g;
}

/** Brandy flask — the healing item. */
export function flask(): THREE.Group {
  const g = new THREE.Group();
  const b = part(g, M.brass, 0, 0, 0, 0.12, 0.16, 0.04);
  b.name = 'flaskBody';
  cyl(g, M.ironLight, 0, 0.18, 0, 0.02, 0.04, 'y', 6);
  part(g, M.leather, 0, 0.03, 0, 0.125, 0.08, 0.045);
  return g;
}

export function keyItem(): THREE.Group {
  const g = new THREE.Group();
  ring(g, M.brass, 0, 0.03, 0, 0.03, 0.008, 8).rotation.x = Math.PI / 2;
  part(g, M.brass, 0.07, 0.02, 0, 0.09, 0.015, 0.015);
  part(g, M.brass, 0.1, 0.0, 0, 0.012, 0.03, 0.015);
  part(g, M.brass, 0.085, 0.0, 0, 0.012, 0.025, 0.015);
  return g;
}

export function crowbarItem(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.redPaint, V(-0.35, 0.02, 0), V(0.3, 0.02, 0), 0.015, 5);
  rod(g, M.redPaint, V(0.3, 0.02, 0), V(0.38, 0.08, 0), 0.015, 5);
  rod(g, M.redPaint, V(-0.35, 0.02, 0), V(-0.4, 0.0, 0.03), 0.015, 5);
  return g;
}

export function crankItem(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.ironLight, V(0, 0, 0), V(0, 0, 0.4), 0.02, 6);
  rod(g, M.ironLight, V(-0.15, 0, 0.4), V(0.15, 0, 0.4), 0.02, 6);
  part(g, M.iron, 0, -0.03, -0.02, 0.06, 0.06, 0.06);
  return g;
}

export function paperItem(mat: Mat = M.paper): THREE.Group {
  const g = new THREE.Group();
  quad(g, mat, 0, 0.005, 0, 0.21, 0.28, 0, -Math.PI / 2);
  return g;
}

export function bookItem(mat: Mat = M.leather): THREE.Group {
  const g = new THREE.Group();
  part(g, mat, 0, 0, 0, 0.18, 0.04, 0.25);
  part(g, M.paperBlank, 0.005, 0.005, 0, 0.17, 0.03, 0.24);
  return g;
}

export function lanternItem(): THREE.Group {
  const g = new THREE.Group();
  part(g, M.iron, 0, 0, 0, 0.16, 0.03, 0.16);
  const glass = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 8), M.lanternGlass);
  glass.position.y = 0.13;
  g.add(glass);
  part(g, M.iron, 0, 0.23, 0, 0.14, 0.03, 0.14);
  for (const [x, z] of [
    [0.07, 0.07],
    [-0.07, 0.07],
    [0.07, -0.07],
    [-0.07, -0.07],
  ])
    rod(g, M.iron, V(x, 0.03, z), V(x, 0.23, z), 0.008, 3);
  const handle = ring(g, M.iron, 0, 0.3, 0, 0.08, 0.008, 8);
  handle.rotation.y = Math.PI / 2;
  return g;
}

export function axeItem(): THREE.Group {
  const g = new THREE.Group();
  rod(g, M.woodLight, V(-0.45, 0, 0), V(0.4, 0, 0), 0.022, 6);
  partC(g, M.redPaint, 0.36, 0.08, 0, 0.12, 0.18, 0.03);
  partC(g, M.ironLight, 0.36, 0.2, 0, 0.14, 0.05, 0.032);
  partC(g, M.redPaint, 0.36, -0.07, 0, 0.06, 0.1, 0.03);
  return g;
}
