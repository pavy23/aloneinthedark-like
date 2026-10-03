// Headless screenshot tour: title screen + every fixed camera of every room, then the follow camera at
// every spawn point (doorways are where a follow camera most easily ends up outside the room).
// Usage: node scripts/shots.mjs [room[,room…]]   (ACT=2, ACT=3, ACT=4 or ACT=5 (the epilogue) sets that act's state first)
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

const setCamera = (camera) =>
  page.evaluate((camera) => {
    const g = window.__btk.game;
    g.applySettings({ ...g.settings, camera });
  }, camera);
const ALL_ROOMS = ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold', 'fcsle', 'testroom', 'tank2', 'station', 'opsroom', 'battery', 'beach', 'sbdeck', 'sbbridge', 'sbtest', 'sbstoke', 'inquiry'];
const rooms = ALL_ROOMS.filter((r) => !filter || filter.split(',').includes(r));
// ACT=2 shows every room as it is in the second act (power on, the stone burned, tank No.2 drained).
if (process.env.ACT === '2')
  await page.evaluate(() =>
    window.__btk.setFlags({ power: true, idolBurned: true, act2: true, 'a2.t0': 0, tank2Drained: true, tank2Open: true, 'vc.level': 0 }),
  );
// ACT=3 (PELL=1 for the operator's version): Bell Cove as found.
if (process.env.ACT === '3')
  await page.evaluate((pell) => {
    const b = window.__btk;
    b.game.state.flags = {};
    b.setFlags({ act3: true, 'a3.pell': pell, 'a3.t0': 0, 'a3.seed': 1234, 'a3.combo': 472, 'sw.recorder': true, 'sw.condenser': true, 'sw.protector': true });
  }, process.env.PELL === '1');
// ACT=4 (STAGE=root for the finale, with the root up over the bow): the St Brendan.
if (process.env.ACT === '4')
  await page.evaluate((root) => {
    const b = window.__btk;
    b.game.state.flags = {};
    const f = { act4: true, power: true, 'a4.pell': false, 'a4.t0': 0, 'a4.seed': 1234, 'a4.attempt': 0, 'a4.heading': 334 };
    if (root) Object.assign(f, { 'a4.bosunMet': true, 'a4.runSet': true, 'a4.hooked': true, 'a4.raised': true, 'a4.cut': true, 'a4.buoyed': true, 'a4.pickup': true, 'a4.rootUp': true });
    b.setFlags(f);
  }, process.env.STAGE === 'root');
// ACT=5: the committee room in London (PELL=1: Pell's statement in the dossier).
if (process.env.ACT === '5')
  await page.evaluate((pell) => {
    const b = window.__btk;
    b.game.state.flags = {};
    b.setFlags({ epilogue: true, power: true, 'ep.pell': pell, 'ep.q': 0, 'ep.ok': 0, 'ep.answer': -1, 'ep.arrived': true });
  }, process.env.PELL === '1');
await setCamera('fixed');
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
await setCamera('follow');
for (const room of rooms) {
  await page.evaluate((r) => window.__btk.play(r), room);
  await page.waitForTimeout(300);
  const spawns = await page.evaluate(() => Object.entries(window.__btk.game.current.def.spawns));
  for (const [id, sp] of spawns) {
    await page.evaluate(([x, z, h]) => {
      const b = window.__btk;
      b.game.pl.place(x, z, h);
      b.game.followSnap = true;
      b.game.ui.closeAll();
      b.release();
    }, [sp.x, sp.z, sp.h]);
    await page.waitForTimeout(250);
    const reach = await page.evaluate(() => window.__btk.game.follow.reach);
    await page.screenshot({ path: `.shots/follow-${room}-${id}.png` });
    console.log(`${room}/${id}: follow camera ${reach.toFixed(2)} m away`);
  }
}
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.kill();
