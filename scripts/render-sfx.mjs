// Render one of the game's synthesised sound effects to a WAV file, a few takes in a row, and print how it
// measures (level, and the pitch of its first 150 ms). The game's own synthesis code makes the sound, on an
// offline audio context. Usage: npm run build && node scripts/render-sfx.mjs drip [takes] [out.wav]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const name = process.argv[2] ?? 'drip';
const takes = Number(process.argv[3] ?? 5);
const out = process.argv[4] ?? `.shots/audio/${name}.wav`;
const port = 6200 + Math.floor(Math.random() * 300);
const server = spawn('node', ['scripts/serve.mjs', process.env.E2E_ROOT ?? 'dist', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!window.__btk);

// Each take 1.3 s long (the reverb tail included), one after another.
const parts = [];
let rate = 44100;
for (let i = 0; i < takes; i++) {
  const r = await page.evaluate((n) => window.__btk.renderSfx(n, 1.3), name);
  rate = r.rate;
  parts.push(r.channels);
}
await browser.close();
server.kill();

const len = parts.reduce((a, p) => a + p[0].length, 0);
const L = new Float32Array(len);
const R = new Float32Array(len);
let o = 0;
for (const [l, r] of parts) {
  L.set(l, o);
  R.set(r, o);
  o += l.length;
}

// What it measures: the first take's peak and RMS, and its pitch every 10 ms over the first 150 ms (from
// zero crossings; good enough to tell a rising chirp from a falling one).
const first = parts[0][0];
let peak = 0;
let sum = 0;
for (const v of first) {
  peak = Math.max(peak, Math.abs(v));
  sum += v * v;
}
const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
const start = first.findIndex((v) => Math.abs(v) > peak * 0.05);
const pitch = [];
const win = Math.round(rate * 0.01);
for (let w = 0; w < 15; w++) {
  let n = 0;
  const a = start + w * win;
  for (let i = a + 1; i < a + win && i < first.length; i++) if (first[i - 1] < 0 !== first[i] < 0) n++;
  pitch.push(Math.round(n / 2 / 0.01));
}
console.log(`${name}: peak ${db(peak)} dBFS, RMS (1.3 s) ${db(Math.sqrt(sum / first.length))} dBFS`);
console.log(`pitch every 10 ms from onset (Hz): ${pitch.join(' ')}`);

// 16-bit stereo PCM.
const data = Buffer.alloc(len * 4);
for (let i = 0; i < len; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), i * 4 + 2);
}
const head = Buffer.alloc(44);
head.write('RIFF', 0);
head.writeUInt32LE(36 + data.length, 4);
head.write('WAVE', 8);
head.write('fmt ', 12);
head.writeUInt32LE(16, 16);
head.writeUInt16LE(1, 20);
head.writeUInt16LE(2, 22);
head.writeUInt32LE(rate, 24);
head.writeUInt32LE(rate * 4, 28);
head.writeUInt16LE(4, 32);
head.writeUInt16LE(16, 34);
head.write('data', 36);
head.writeUInt32LE(data.length, 40);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([head, data]));
console.log(`wrote ${out} (${takes} takes, ${(len / rate).toFixed(1)} s)`);
