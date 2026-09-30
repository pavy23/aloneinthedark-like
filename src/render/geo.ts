import * as THREE from 'three';
import type { Mat } from './materials';

/** Scale the UVs of a BoxGeometry so textures keep a constant real-world size on every face. */
export function scaleBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Face order in three.js BoxGeometry: +x, -x, +y, -y, +z, -z; 4 vertices each (1 segment).
  const dims: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
}

export function boxGeo(w: number, h: number, d: number, tile = 1): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleBoxUVs(g, w, h, d, tile);
  return g;
}

export function cylGeo(rTop: number, rBot: number, h: number, seg = 10, tile = 1, open = false): THREE.CylinderGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const circ = Math.PI * 2 * Math.max(rTop, rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * h) / tile);
  uv.needsUpdate = true;
  return g;
}

export function mesh(geo: THREE.BufferGeometry, mat: Mat | THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, (mat as Mat).m ?? (mat as THREE.Material));
  return m;
}

/** Add a box to a group with its *bottom* at y (convenient for things standing on a floor). */
export function part(
  parent: THREE.Object3D,
  mat: Mat,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = mesh(boxGeo(w, h, d, mat.tile), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** Add a box centred at (x,y,z). */
export function partC(
  parent: THREE.Object3D,
  mat: Mat,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = mesh(boxGeo(w, h, d, mat.tile), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** Cylinder centred at (x,y,z); axis 'y' (vertical), 'x' or 'z' (lying down). */
export function cyl(
  parent: THREE.Object3D,
  mat: Mat,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  axis: 'x' | 'y' | 'z' = 'y',
  seg = 10,
  rTop?: number,
): THREE.Mesh {
  const m = mesh(cylGeo(rTop ?? r, r, h, seg, mat.tile), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  parent.add(m);
  return m;
}

/** Cylinder from point a to point b (pipes, rods, ropes). */
export function rod(parent: THREE.Object3D, mat: Mat, a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, seg = 6): THREE.Mesh {
  const va = new THREE.Vector3(a.x, a.y, a.z);
  const vb = new THREE.Vector3(b.x, b.y, b.z);
  const len = va.distanceTo(vb);
  const m = mesh(cylGeo(r, r, len, seg, mat.tile), mat);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  parent.add(m);
  return m;
}

/** Torus (valve hand-wheels, lifebuoys, sheaves). */
export function ring(parent: THREE.Object3D, mat: Mat, x: number, y: number, z: number, r: number, tube: number, seg = 12): THREE.Mesh {
  const m = mesh(new THREE.TorusGeometry(r, tube, 4, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Flat quad facing +Z (rotate as needed); for pictures, papers, charts. */
export function quad(parent: THREE.Object3D, mat: Mat, x: number, y: number, z: number, w: number, h: number, ry = 0, rx = 0): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0, 'YXZ');
  parent.add(m);
  return m;
}
