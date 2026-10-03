import * as THREE from 'three';
import { rng } from '../core/math';

// Every texture in the game is painted procedurally on a <canvas> at load time. No image assets are
// shipped, the repository stays tiny and the look stays consistent (small, hard-edged, VGA-like).

type Rand = () => number;
type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, r: Rand) => void;

const cache = new Map<string, THREE.CanvasTexture>();

function make(key: string, w: number, h: number, seed: number, draw: Draw): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, w, h, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.name = key;
  cache.set(key, t);
  return t;
}

/** Per-pixel brightness noise. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rand, amount: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rand, n: number, colors: string[], alpha: number, maxR: number): void {
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * (0.4 + r() * 0.6);
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const x = r() * w;
    const y = r() * h;
    const rad = 1 + r() * maxR;
    // Draw wrapped so the texture tiles seamlessly.
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rad, rad * (0.5 + r() * 0.8), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx: CanvasRenderingContext2D, w: number, h: number, r: Rand, n: number, color: string, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * w);
    const y0 = Math.floor(r() * h);
    const len = 4 + Math.floor(r() * h * 0.5);
    for (let k = 0; k < len; k++) {
      ctx.globalAlpha = alpha * (1 - k / len);
      ctx.fillStyle = color;
      ctx.fillRect(x + (r() < 0.15 ? (r() < 0.5 ? -1 : 1) : 0), (y0 + k) % h, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x, y + 1, 2, 1);
  ctx.fillRect(x + 1, y, 1, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, 1, 1);
}

export const Tex = {
  /** Painted steel plating with seams, rivets and rust bleeding from the rivets. Tile = 2 m. */
  steel(base = '#56605a', seed = 11): THREE.CanvasTexture {
    return make(`steel-${base}-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 26, ['#000000', '#ffffff'], 0.06, 7);
      grain(ctx, w, h, r, 14);
      // Plate seams (edges) — dark line with a lighter lap edge.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, h - 1, w, 1);
      ctx.fillRect(w - 1, 0, 1, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, h - 2, w, 1);
      for (let x = 3; x < w; x += 6) rivet(ctx, x, h - 4);
      for (let y = 3; y < h - 4; y += 6) rivet(ctx, w - 4, y);
      streaks(ctx, w, h, r, 10, '#6b3a1c', 0.45);
      blotches(ctx, w, h, r, 6, ['#7a4020', '#4a2410'], 0.35, 3);
    });
  },

  /** White/cream painted steel for the accommodation and the superstructure. */
  paint(base = '#b8b09a', seed = 21): THREE.CanvasTexture {
    return make(`paint-${base}-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 30, ['#6b6450', '#ffffff', '#8a8068'], 0.07, 8);
      grain(ctx, w, h, r, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, h - 1, w, 1);
      for (let x = 4; x < w; x += 8) rivet(ctx, x, h - 4);
      streaks(ctx, w, h, r, 8, '#7a4a28', 0.35);
    });
  },

  /** Teak deck planking with black caulked seams. Planks run along V. Tile = 1 m. */
  deck(seed = 31): THREE.CanvasTexture {
    return make(`deck-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      const pw = 8;
      for (let x = 0; x < w; x += pw) {
        const tone = 88 + Math.floor(r() * 26);
        ctx.fillStyle = `rgb(${tone},${Math.floor(tone * 0.78)},${Math.floor(tone * 0.55)})`;
        ctx.fillRect(x, 0, pw, h);
        // grain
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = `rgba(40,24,10,${0.12 + r() * 0.15})`;
          ctx.fillRect(x + 1 + Math.floor(r() * (pw - 2)), Math.floor(r() * h), 1, 4 + Math.floor(r() * 18));
        }
        // butt joint
        const by = Math.floor(r() * h);
        ctx.fillStyle = 'rgba(10,6,2,0.8)';
        ctx.fillRect(x, by, pw, 1);
        ctx.fillStyle = '#120c06';
        ctx.fillRect(x, 0, 1, h);
      }
      grain(ctx, w, h, r, 16);
      blotches(ctx, w, h, r, 8, ['#1d2a24', '#000000'], 0.18, 6); // damp
    });
  },

  /** Dark mahogany panelling. Tile = 1 m. */
  wood(seed = 41, base = [92, 46, 26]): THREE.CanvasTexture {
    return make(`wood-${seed}-${base.join(',')}`, 64, 64, seed, (ctx, w, h, r) => {
      const [br, bg, bb] = base;
      for (let x = 0; x < w; x += 16) {
        const k = 0.85 + r() * 0.3;
        ctx.fillStyle = `rgb(${Math.floor(br * k)},${Math.floor(bg * k)},${Math.floor(bb * k)})`;
        ctx.fillRect(x, 0, 16, h);
        for (let g = 0; g < 5; g++) {
          const gx = x + 2 + Math.floor(r() * 12);
          const ph = r() * 6;
          ctx.fillStyle = 'rgba(20,8,2,0.35)';
          for (let y = 0; y < h; y++) ctx.fillRect(gx + Math.round(Math.sin(y * 0.15 + ph) * 1.2), y, 1, 1);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, 0, 1, h);
        ctx.fillStyle = 'rgba(255,220,180,0.12)';
        ctx.fillRect(x + 1, 0, 1, h);
      }
      grain(ctx, w, h, r, 12);
    });
  },

  /** Engine-room chequer plate (raised diamond bars). Tile = 1 m. */
  chequer(seed = 51): THREE.CanvasTexture {
    return make(`chequer-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#4d4f4c';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, r, 12);
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          const flip = ((x + y) / 8) % 2 === 0;
          for (let k = 0; k < 4; k++) {
            const px = x + 2 + k;
            const py = flip ? y + 2 + k : y + 5 - k;
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(px, py, 1, 1);
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(px, py + 1, 1, 1);
          }
        }
      }
      blotches(ctx, w, h, r, 10, ['#1a1208', '#000000'], 0.25, 6); // oil stains
    });
  },

  /** Worn chequered linoleum for corridors. Tile = 1 m (4x4 squares). */
  linoleum(seed = 61): THREE.CanvasTexture {
    return make(`lino-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#5a2a22' : '#8a7454';
          ctx.fillRect(x * 16, y * 16, 16, 16);
        }
      }
      blotches(ctx, w, h, r, 40, ['#2a1a10', '#000000', '#b0a080'], 0.1, 6);
      grain(ctx, w, h, r, 18);
    });
  },

  rust(seed = 71): THREE.CanvasTexture {
    return make(`rust-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#6a3a1e';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 60, ['#8a4a20', '#3a1e0e', '#a0602a', '#2a2a26'], 0.35, 6);
      grain(ctx, w, h, r, 26);
    });
  },

  /** Tarred canvas (hatch covers). Tile = 1 m. */
  tarp(seed = 81): THREE.CanvasTexture {
    return make(`tarp-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#3c3f2c';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, 0, 1, h);
      }
      blotches(ctx, w, h, r, 16, ['#1c1e14', '#56583e'], 0.25, 8);
      grain(ctx, w, h, r, 14);
    });
  },

  /** Armoured submarine cable: dark tar with helical wire strands. Tile = 0.5 m. */
  cable(seed = 91): THREE.CanvasTexture {
    return make(`cable-${seed}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#16140f';
      ctx.fillRect(0, 0, w, h);
      for (let k = -h; k < w; k += 4) {
        ctx.strokeStyle = 'rgba(120,110,90,0.55)';
        ctx.beginPath();
        ctx.moveTo(k, h);
        ctx.lineTo(k + h, 0);
        ctx.stroke();
      }
      blotches(ctx, w, h, r, 10, ['#2c3a2a', '#000000'], 0.4, 4); // marine growth
      grain(ctx, w, h, r, 20);
    });
  },

  water(seed = 101): THREE.CanvasTexture {
    return make(`water-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#060c0e';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(120,150,150,${0.05 + r() * 0.16})`;
        const x = Math.floor(r() * w);
        const y = Math.floor(r() * h);
        ctx.fillRect(x, y, 2 + Math.floor(r() * 7), 1);
      }
      grain(ctx, w, h, r, 6);
    });
  },

  sea(seed = 103): THREE.CanvasTexture {
    return make(`sea-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#0d1a20';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(150,180,190,${0.04 + r() * 0.12})`;
        ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 3 + Math.floor(r() * 10), 1);
      }
      grain(ctx, w, h, r, 8);
    });
  },

  marble(seed = 111): THREE.CanvasTexture {
    return make(`marble-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#b7b4aa';
      ctx.fillRect(0, 0, w, h);
      for (let v = 0; v < 5; v++) {
        let x = r() * w;
        let y = 0;
        ctx.fillStyle = 'rgba(60,60,60,0.35)';
        while (y < h) {
          ctx.fillRect(Math.floor(x) % w, y, 1, 1);
          x += (r() - 0.5) * 2.5;
          y += 1;
        }
      }
      grain(ctx, w, h, r, 10);
    });
  },

  coal(seed = 121): THREE.CanvasTexture {
    return make(`coal-${seed}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#0c0c0c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = r() < 0.5 ? '#262626' : '#3a3a40';
        ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
      }
    });
  },

  rug(seed = 131): THREE.CanvasTexture {
    return make(`rug-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#5a1414';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#b08840';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      ctx.strokeStyle = '#1a2440';
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#b08840';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillRect(-2, -18, 4, 12);
        ctx.restore();
      }
      ctx.fillStyle = '#1a2440';
      ctx.fillRect(w / 2 - 5, h / 2 - 5, 10, 10);
      grain(ctx, w, h, r, 20);
    });
  },

  blanket(seed = 141): THREE.CanvasTexture {
    return make(`blanket-${seed}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#4a4a44';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a2a26';
      ctx.fillRect(0, 4, w, 2);
      ctx.fillRect(0, h - 6, w, 2);
      grain(ctx, w, h, r, 22);
    });
  },

  books(seed = 151): THREE.CanvasTexture {
    return make(`books-${seed}`, 64, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#140c06';
      ctx.fillRect(0, 0, w, h);
      let x = 0;
      const cols = ['#5a1a14', '#1e3a24', '#2a2a4a', '#6a5020', '#3a2010', '#4a4a3a'];
      while (x < w) {
        const bw = 2 + Math.floor(r() * 4);
        const bh = h - 2 - Math.floor(r() * 8);
        ctx.fillStyle = cols[Math.floor(r() * cols.length)];
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.fillStyle = 'rgba(200,170,90,0.5)';
        ctx.fillRect(x, h - bh + 3, bw, 1);
        x += bw + (r() < 0.1 ? 2 : 0);
      }
      grain(ctx, w, h, r, 14);
    });
  },

  paper(seed = 161, lines = true): THREE.CanvasTexture {
    return make(`paper-${seed}-${lines}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#cfc4a4';
      ctx.fillRect(0, 0, w, h);
      if (lines) {
        for (let y = 5; y < h - 3; y += 3) {
          ctx.fillStyle = 'rgba(40,30,20,0.55)';
          ctx.fillRect(4, y, 6 + Math.floor(r() * (w - 12)), 1);
        }
      }
      grain(ctx, w, h, r, 16);
    });
  },

  /** Nautical chart: pale paper, a coastline, a rhumb grid and a pencilled track ending in a cross. */
  chart(seed = 171): THREE.CanvasTexture {
    return make(`chart-${seed}`, 64, 48, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#c9c2a2';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(60,80,110,0.35)';
      for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 1, h);
      for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = '#9a9068';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let y = 0; y <= h; y += 4) ctx.lineTo(10 + Math.sin(y * 0.4) * 4 + r() * 3, y);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.strokeStyle = '#2a2a2a';
      ctx.beginPath();
      ctx.moveTo(14, 36);
      ctx.lineTo(30, 26);
      ctx.lineTo(44, 22);
      ctx.stroke();
      ctx.strokeStyle = '#7a1010';
      ctx.beginPath();
      ctx.moveTo(42, 20);
      ctx.lineTo(48, 26);
      ctx.moveTo(48, 20);
      ctx.lineTo(42, 26);
      ctx.stroke();
      grain(ctx, w, h, r, 12);
    });
  },

  /** Tiny sepia photographs used for the keel-laying / launching frames. */
  photo(kind: 'keel' | 'launch' | 'portrait', seed = 181): THREE.CanvasTexture {
    return make(`photo-${kind}-${seed}`, 32, 24, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#a58c64';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4a3a24';
      if (kind === 'keel') {
        // Keel blocks and a single long keel plate on the berth, gantry frames behind.
        for (let x = 3; x < w - 2; x += 5) ctx.fillRect(x, 4, 1, 14);
        ctx.fillRect(2, 4, w - 4, 1);
        ctx.fillStyle = '#2a2014';
        ctx.fillRect(3, 17, w - 6, 2);
        for (let x = 5; x < w - 4; x += 4) ctx.fillRect(x, 19, 2, 2);
        ctx.fillStyle = '#3a2c1c';
        for (let i = 0; i < 5; i++) ctx.fillRect(6 + i * 4, 14, 1, 3);
      } else if (kind === 'launch') {
        // A hull sliding stern-first down the ways, with crowd and water.
        ctx.fillStyle = '#2a2014';
        ctx.beginPath();
        ctx.moveTo(3, 10);
        ctx.lineTo(27, 7);
        ctx.lineTo(29, 13);
        ctx.lineTo(5, 16);
        ctx.fill();
        ctx.fillRect(12, 4, 2, 4);
        ctx.fillStyle = '#6a5a44';
        ctx.fillRect(0, 18, w, 6);
        ctx.fillStyle = '#2a2014';
        for (let x = 1; x < w; x += 2) ctx.fillRect(x, 19 + Math.floor(r() * 2), 1, 2);
      } else {
        ctx.fillStyle = '#3a2c1c';
        ctx.beginPath();
        ctx.ellipse(16, 10, 5, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(9, 16, 14, 8);
      }
      grain(ctx, w, h, r, 22);
      ctx.strokeStyle = '#e8dcc0';
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });
  },

  /** Round instrument face with tick marks (pressure / rpm gauges, compass card). */
  gauge(seed = 191): THREE.CanvasTexture {
    return make(`gauge-${seed}`, 32, 32, seed, (ctx, w, h) => {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d8d0b8';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#222';
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(a) * 9, h / 2 + Math.sin(a) * 9);
        ctx.lineTo(w / 2 + Math.cos(a) * 13, h / 2 + Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.fillStyle = '#8a1010';
      ctx.fillRect(w / 2 + 6, h / 2 - 10, 4, 2);
    });
  },

  /** Stone of the "thing" pulled up with the cable: black, wet, with a faint growth pattern. */
  idol(seed = 201): THREE.CanvasTexture {
    return make(`idol-${seed}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#0a0d0c';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = `rgba(80,140,110,${0.2 + r() * 0.3})`;
        ctx.beginPath();
        const x = r() * w;
        const y = r() * h;
        ctx.arc(x, y, 2 + r() * 5, r() * 6, r() * 6 + 2);
        ctx.stroke();
      }
      grain(ctx, w, h, r, 14);
    });
  },

  morseChart(seed = 211): THREE.CanvasTexture {
    return make(`morse-${seed}`, 32, 40, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#d2c8a8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#222';
      for (let y = 3; y < h - 2; y += 3) {
        ctx.fillRect(3, y, 2, 1);
        let x = 7;
        const n = 1 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) {
          const dash = r() < 0.5;
          ctx.fillRect(x, y, dash ? 3 : 1, 1);
          x += dash ? 4 : 2;
        }
        ctx.fillRect(18, y, 2, 1);
        x = 22;
        for (let k = 0; k < 2; k++) {
          ctx.fillRect(x, y, 2, 1);
          x += 3;
        }
      }
    });
  },
};

// ------------------------------------------------------------------ Act 3: Bell Cove, Newfoundland, in winter

export const Tex3 = {
  /** Wind-packed snow: blue-white with drift ripples and faint sastrugi. Tile = 3 m. */
  snow(seed = 301): THREE.CanvasTexture {
    return make(`snow-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#c9d2d8';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 30, ['#e8eef2', '#aab6c0', '#ffffff'], 0.25, 9);
      // Drift ripples running across the wind.
      for (let y = 2; y < h; y += 5 + Math.floor(r() * 3)) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#8c9aa6';
        for (let x = 0; x < w; x++) if (Math.sin((x + y * 0.7) * 0.3) > 0.55) ctx.fillRect(x, (y + Math.round(Math.sin(x * 0.2) * 1.5) + h) % h, 1, 1);
      }
      ctx.globalAlpha = 1;
      grain(ctx, w, h, r, 10);
    });
  },

  /** Painted clapboard siding (Newfoundland outport style), the paint flaking. Boards run along U. Tile = 2 m. */
  clapboard(base = '#c8bfa8', seed = 311): THREE.CanvasTexture {
    return make(`clap-${base}-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 6) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, y + 5, w, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(0, y, w, 1);
      }
      blotches(ctx, w, h, r, 14, ['#6e6658', '#4a4438'], 0.35, 3);
      streaks(ctx, w, h, r, 6, '#5a4a38', 0.3);
      grain(ctx, w, h, r, 12);
    });
  },

  /** Distempered plaster wall: cream, damp-stained, a few hairline cracks. Tile = 2 m. */
  plaster(base = '#cfc6ac', seed = 341): THREE.CanvasTexture {
    return make(`plaster-${base}-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 22, ['#a89e84', '#e0d8c0', '#8c826a'], 0.12, 10);
      ctx.strokeStyle = 'rgba(70,60,44,0.22)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        let x = r() * w;
        let y = r() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (r() - 0.5) * 8;
          y += 2 + r() * 4;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      streaks(ctx, w, h, r, 5, '#6a5a40', 0.18);
      grain(ctx, w, h, r, 8);
    });
  },

  /** Beach shingle: rounded grey pebbles with snow in the hollows. Tile = 1.5 m. */
  shingle(seed = 321): THREE.CanvasTexture {
    return make(`shingle-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#4a4c4a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        const t = 70 + Math.floor(r() * 70);
        ctx.fillStyle = `rgb(${t},${t},${Math.floor(t * 0.96)})`;
        const x = r() * w;
        const y = r() * h;
        const rad = 1 + r() * 2.6;
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            ctx.beginPath();
            ctx.ellipse(x + ox, y + oy, rad, rad * 0.75, r() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
      }
      blotches(ctx, w, h, r, 16, ['#d8e0e4', '#c0cad0'], 0.55, 4);
      grain(ctx, w, h, r, 14);
    });
  },

  /** Cast concrete with shuttering lines and salt stains. Tile = 2 m. */
  concrete(seed = 331): THREE.CanvasTexture {
    return make(`concrete-${seed}`, 64, 64, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#7c7a72';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 40, ['#5c5a52', '#9a988e', '#d0d4cc'], 0.18, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 1);
      streaks(ctx, w, h, r, 8, '#3c3a34', 0.3);
      grain(ctx, w, h, r, 16);
    });
  },

  /** Black slate switchboard panel. */
  slate(seed = 341): THREE.CanvasTexture {
    return make(`slate-${seed}`, 32, 32, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#1c1f22';
      ctx.fillRect(0, 0, w, h);
      blotches(ctx, w, h, r, 10, ['#2c3034', '#121416'], 0.4, 5);
      grain(ctx, w, h, r, 8);
    });
  },

  /** A length of siphon-recorder tape with an ink trace (decoration only). */
  tape(seed = 351): THREE.CanvasTexture {
    return make(`tape-${seed}`, 64, 8, seed, (ctx, w, h, r) => {
      ctx.fillStyle = '#d8ceb0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#28305a';
      let y = 4;
      for (let x = 0; x < w; x++) {
        if (r() < 0.12) y = r() < 0.5 ? 2 : 6;
        else if (r() < 0.2) y = 4;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  },
};

/** Fixed-size unit for texture tiling (metres per texture repeat) for each texture family. */
export const TILE = {
  steel: 2,
  paint: 2,
  deck: 1,
  wood: 1,
  chequer: 1,
  linoleum: 1,
  rust: 1.5,
  tarp: 1,
  cable: 0.5,
  water: 3,
  sea: 6,
  marble: 1,
  coal: 0.6,
  rug: 2,
  blanket: 1,
  snow: 3,
  plaster: 2,
  clapboard: 2,
  shingle: 1.5,
  concrete: 2,
} as const;
