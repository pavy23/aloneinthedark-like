import * as THREE from 'three';
import { Tex, TILE } from './textures';

/** A material plus the real-world size (metres) one texture repeat covers, used for UV scaling. */
export interface Mat {
  m: THREE.Material;
  tile: number;
}

const cache = new Map<string, Mat>();

function lambert(key: string, color: THREE.ColorRepresentation, map?: THREE.Texture, tile = 1, extra: THREE.MeshLambertMaterialParameters = {}): Mat {
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshLambertMaterial({ color, map: map ?? null, flatShading: true, ...extra });
  m.name = key;
  m.userData.shared = true;
  const out = { m, tile };
  cache.set(key, out);
  return out;
}

function basic(key: string, color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}): Mat {
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.name = key;
  m.userData.shared = true;
  const out = { m, tile: 1 };
  cache.set(key, out);
  return out;
}

/** The game's material palette. Getters are lazy so textures are only painted when a room needs them. */
export const M = {
  get steel() { return lambert('steel', 0xffffff, Tex.steel('#56605a', 11), TILE.steel); },
  get steelDark() { return lambert('steelDark', 0xffffff, Tex.steel('#3b403c', 12), TILE.steel); },
  get steelGreen() { return lambert('steelGreen', 0xffffff, Tex.steel('#4a5a4e', 13), TILE.steel); },
  get hull() { return lambert('hull', 0xffffff, Tex.steel('#1e1f1f', 14), TILE.steel); },
  get paint() { return lambert('paint', 0xffffff, Tex.paint('#b8b09a', 21), TILE.paint); },
  get paintDirty() { return lambert('paintDirty', 0xffffff, Tex.paint('#8f8872', 22), TILE.paint); },
  get deck() { return lambert('deck', 0xffffff, Tex.deck(31), TILE.deck); },
  get wood() { return lambert('wood', 0xffffff, Tex.wood(41), TILE.wood); },
  get woodLight() { return lambert('woodLight', 0xffffff, Tex.wood(42, [128, 88, 52]), TILE.wood); },
  get woodDark() { return lambert('woodDark', 0xffffff, Tex.wood(43, [58, 32, 20]), TILE.wood); },
  get chequer() { return lambert('chequer', 0xffffff, Tex.chequer(51), TILE.chequer); },
  get linoleum() { return lambert('linoleum', 0xffffff, Tex.linoleum(61), TILE.linoleum); },
  get rust() { return lambert('rust', 0xffffff, Tex.rust(71), TILE.rust); },
  get tarp() { return lambert('tarp', 0xffffff, Tex.tarp(81), TILE.tarp); },
  get cable() { return lambert('cable', 0xffffff, Tex.cable(91), TILE.cable); },
  get water() { return lambert('water', 0xffffff, Tex.water(101), TILE.water); },
  get sea() { return lambert('sea', 0xffffff, Tex.sea(103), TILE.sea); },
  get marble() { return lambert('marble', 0xffffff, Tex.marble(111), TILE.marble); },
  get coal() { return lambert('coal', 0xffffff, Tex.coal(121), TILE.coal); },
  get rug() { return lambert('rug', 0xffffff, Tex.rug(131), TILE.rug); },
  get blanket() { return lambert('blanket', 0xffffff, Tex.blanket(141), TILE.blanket); },
  get books() { return lambert('books', 0xffffff, Tex.books(151), 1); },
  get paper() { return lambert('paper', 0xffffff, Tex.paper(161), 1); },
  get paperBlank() { return lambert('paperBlank', 0xffffff, Tex.paper(162, false), 1); },
  get chart() { return lambert('chart', 0xffffff, Tex.chart(171), 1); },
  get photoKeel() { return lambert('photoKeel', 0xffffff, Tex.photo('keel'), 1); },
  get photoLaunch() { return lambert('photoLaunch', 0xffffff, Tex.photo('launch'), 1); },
  get photoPortrait() { return lambert('photoPortrait', 0xffffff, Tex.photo('portrait'), 1); },
  get gauge() { return lambert('gauge', 0xffffff, Tex.gauge(191), 1); },
  get morse() { return lambert('morse', 0xffffff, Tex.morseChart(211), 1); },
  get idol() { return lambert('idol', 0xffffff, Tex.idol(201), 1, { emissive: 0x0a2418 }); },

  get brass() { return lambert('brass', 0xa8843a); },
  get copper() { return lambert('copper', 0x8a4c2c); },
  get iron() { return lambert('iron', 0x2c2e2e); },
  get ironLight() { return lambert('ironLight', 0x5c605e); },
  get black() { return lambert('black', 0x121212); },
  get rope() { return lambert('rope', 0x8a7650); },
  get redPaint() { return lambert('redPaint', 0x7a1a14); },
  get greenCloth() { return lambert('greenCloth', 0x2a3a2a); },
  get leather() { return lambert('leather', 0x3a2214); },
  get ceramic() { return lambert('ceramic', 0xc8c4b8); },
  get lifebuoy() { return lambert('lifebuoy', 0xb04a2a); },

  // Unlit / emissive surfaces.
  get windowFog() { return basic('windowFog', 0x55636a, { fog: true }); },
  get windowDark() { return basic('windowDark', 0x0b1114, { fog: true }); },
  get porthole() { return basic('porthole', 0x3c5058); },
  get bulbOff() { return lambert('bulbOff', 0x55524a); },
  get bulbOn() { return basic('bulbOn', 0xffe2a6); },
  get furnace() { return basic('furnace', 0xff6a1e); },
  get ember() { return basic('ember', 0xb03a10); },
  get lanternGlass() { return basic('lanternGlass', 0xffd48a); },
  get spark() { return basic('spark', 0xd8e8ff); },
  get idolGlow() { return basic('idolGlow', 0x6adfa0); },
  get eyes() { return basic('eyes', 0xd8e8c0); },
  get void() { return basic('void', 0x000000, { fog: false }); },
  get shadow() {
    const hit = cache.get('shadow');
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    m.userData.shared = true;
    const out = { m, tile: 1 };
    cache.set('shadow', out);
    return out;
  },
};

/** Flat colour materials for characters (the 1992 look: untextured, flat-shaded polygons). */
export function flat(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000): THREE.MeshLambertMaterial {
  const key = `flat-${new THREE.Color(color).getHexString()}-${new THREE.Color(emissive).getHexString()}`;
  const hit = cache.get(key);
  if (hit) return hit.m as THREE.MeshLambertMaterial;
  const m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
  m.name = key;
  m.userData.shared = true;
  cache.set(key, { m, tile: 1 });
  return m;
}
