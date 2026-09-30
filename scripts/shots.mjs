// Headless screenshot tour: title screen + every fixed camera of every room.
// Usage: node scripts/shots.mjs [roomFilter]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const filter = process.argv[2] ?? '';
const port = 4173 + Math.floor(Math.random() * 500);
const server = spawn('node', ['scripts/serve.mjs', 'dist', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
await mkdir('.shots', { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(1500);
if (!filter) await page.screenshot({ path: '.shots/00-title.png' });

const rooms = ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold'].filter((r) => !filter || r === filter);
for (const room of rooms) {
  await page.evaluate((r) => window.__btk.play(r), room);
  await page.waitForTimeout(300);
  const cams = await page.evaluate(() => window.__btk.game.current.def.cameras.map((c) => ({ id: c.id, z: c.zones[0] })));
  for (const [i, c] of cams.entries()) {
    const x = (c.z.minX + c.z.maxX) / 2;
    const z = (c.z.minZ + c.z.maxZ) / 2;
    await page.evaluate(([x, z]) => {
      const b = window.__btk;
      b.game.pl.place(x, z, 0);
      b.game.ui.closeAll();
      b.release();
    }, [x, z]);
    await page.waitForTimeout(250);
    const info = await page.evaluate(() => window.__btk.info());
    await page.screenshot({ path: `.shots/${room}-${i}-${c.id}.png` });
    console.log(`${room}/${c.id}: player (${x.toFixed(1)},${z.toFixed(1)}) -> resolved (${info.x.toFixed(2)},${info.z.toFixed(2)}) cam=${info.cam}`);
  }
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.kill();
