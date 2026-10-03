import * as THREE from 'three';
import { M, flat } from '../render/materials';
import { cyl, mesh, part, quad } from '../render/geo';
import { HumanRig } from '../entities/Rig';
import { chair } from './props';

// Epilogue props: the committee room in London. Same conventions as props.ts: each builder returns a Group
// whose origin is the centre of its footprint on the floor, front +Z.

export interface Sitter {
  coat: number;
  trousers: number;
  hair: number;
  /** Tie colour (a dark suit with a white collar otherwise). */
  tie?: number;
  /** 'table': forearms on the table in front; 'lap': hands in the lap. */
  arms?: 'table' | 'lap';
}

/** A man in a dark suit sitting on a chair, facing +Z. */
export function seatedFigure(s: Sitter): THREE.Group {
  const g = new THREE.Group();
  g.add(chair(M.woodDark));
  const rig = new HumanRig({
    colors: {
      coat: s.coat,
      coatDark: new THREE.Color(s.coat).multiplyScalar(0.6).getHex(),
      trousers: s.trousers,
      shoes: 0x0e0c0a,
      skin: 0xc8ae94,
      shirt: 0xe6e2d6,
      hair: s.hair,
      accent: s.tie ?? 0x2a1418,
      eyes: 0x1a1612,
    },
    bulk: 1.0,
    torso: 0.56,
  });
  const onTable = (s.arms ?? 'table') === 'table';
  rig.setPose({
    spine: [onTable ? 0.12 : -0.05, 0, 0],
    neck: [onTable ? -0.1 : 0.1, 0, 0],
    thighL: [-1.5, 0, 0.06],
    kneeL: [1.5, 0, 0],
    thighR: [-1.5, 0, -0.06],
    kneeR: [1.5, 0, 0],
    shoulderL: onTable ? [-1.05, 0, 0.12] : [-0.45, 0, 0.15],
    elbowL: onTable ? [-0.75, 0, 0] : [-1.1, 0, 0],
    shoulderR: onTable ? [-1.05, 0, -0.12] : [-0.45, 0, -0.15],
    elbowR: onTable ? [-0.75, 0, 0] : [-1.1, 0, 0],
  });
  // Hair over the crown, so that it shows from the front (the rig's own hair is at the back).
  const crown = mesh(new THREE.BoxGeometry(0.18, 0.035, 0.2), flat(s.hair));
  crown.position.set(0, 0.235, 0);
  rig.head.add(crown);
  rig.root.position.y = -0.82 + 0.47;
  g.add(rig.root);
  return g;
}

/** A tall sash window in a panelled wall: frame, glazing bars and the grey London light behind. */
export function sashWindow(w = 1.1, h = 2.0): THREE.Group {
  const g = new THREE.Group();
  part(g, M.windowFog, 0, 0, 0, w, h, 0.02);
  part(g, M.paint, 0, -0.08, 0.03, w + 0.2, 0.08, 0.14);
  part(g, M.paint, 0, h, 0.02, w + 0.16, 0.08, 0.08);
  for (const x of [-w / 2 - 0.04, w / 2 + 0.04]) part(g, M.paint, x, 0, 0.02, 0.08, h, 0.08);
  // Meeting rail and glazing bars
  part(g, M.paint, 0, h / 2 - 0.03, 0.03, w, 0.06, 0.05);
  for (const y of [h * 0.25, h * 0.75]) part(g, M.paint, 0, y, 0.03, w, 0.025, 0.03);
  part(g, M.paint, 0, 0, 0.03, 0.025, h, 0.03);
  return g;
}

/** The committee's long table, with green cloth, papers, an ink stand and water carafes. */
export function committeeTable(w = 5.6, d = 1.0): THREE.Group {
  const g = new THREE.Group();
  part(g, M.woodDark, 0, 0, 0, w, 0.74, d);
  part(g, M.greenCloth, 0, 0.74, 0, w + 0.04, 0.03, d + 0.04);
  for (const x of [-1.8, 0, 1.8]) {
    quad(g, M.paperBlank, x + 0.05, 0.776, -0.12, 0.42, 0.3, 0.15, -Math.PI / 2);
    quad(g, M.paper, x - 0.18, 0.778, -0.05, 0.3, 0.22, -0.2, -Math.PI / 2);
  }
  // Ink stand and carafes
  part(g, M.woodDark, 0.6, 0.77, -0.25, 0.3, 0.05, 0.14);
  for (const x of [0.52, 0.68]) cyl(g, M.black, x, 0.85, -0.25, 0.03, 0.08, 'y', 6);
  for (const x of [-0.9, 1.1]) {
    const c = mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.22, 8), M.jarGlass);
    c.position.set(x, 0.885, -0.3);
    g.add(c);
  }
  return g;
}
