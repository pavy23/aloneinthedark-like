// Regenerate the screenshots used in README.md (docs/images). Usage: npm run build && node scripts/readme-shots.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const port = 6500 + Math.floor(Math.random() * 300);
const server = spawn('node', ['scripts/serve.mjs', 'dist', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!window.__btk);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'docs/images/title.png' });

const scene = async (file, room, x, z, h, flags = {}, extra) => {
  await page.evaluate(([r, x, z, h, f]) => {
    localStorage.clear();
    window.__btk.game.state.flags = {};
    window.__btk.setFlags(f);
    return window.__btk.play(r, x, z, h);
  }, [room, x, z, h, flags]);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__btk.game.ui.clearMessages());
    await page.waitForTimeout(160);
  }
  if (extra) await extra();
  await page.screenshot({ path: `docs/images/${file}.png` });
};
await scene('deck', 'deck', -0.6, -8.2, Math.PI * 0.9);
await scene('corridor', 'corridor', -1.9, 0.1, -Math.PI / 2, { power: true, 'trig:corridor:lightsOnAmbush': true, 'dead:corr1': true });
await scene('engine', 'engine', -1.8, 2.7, Math.PI * 0.8);
await scene('hold', 'hold', 2.2, 0, -Math.PI / 2, { holdSeen: true });
await scene('dynamo', 'engine', 4.3, 1.4, Math.PI / 2, { engineSeen: true }, async () => {
  await page.evaluate(() => {
    const g = window.__btk.game;
    g.cutTo({ id: 'x', pos: [3.0, 2.3, 1.2], look: [5.7, 1.0, -1.0], fov: 55, zones: [] });
    void g.openPanel('dynamo');
  });
  await page.waitForTimeout(400);
});
await browser.close();
server.kill();
