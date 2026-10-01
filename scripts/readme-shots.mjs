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

// camera: 'follow' (the default player-centred camera) or 'fixed' (the original fixed shots).
const scene = async (file, room, x, z, h, flags = {}, extra, camera = 'fixed') => {
  await page.evaluate(([r, x, z, h, f, cam]) => {
    localStorage.clear();
    const g = window.__btk.game;
    g.applySettings({ ...g.settings, camera: cam, controls: cam === 'fixed' ? 'tank' : 'direct' });
    g.state.flags = {};
    window.__btk.setFlags(f);
    return window.__btk.play(r, x, z, h);
  }, [room, x, z, h, flags, camera]);
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__btk.game.ui.clearMessages());
    await page.waitForTimeout(160);
  }
  if (extra) await extra();
  await page.screenshot({ path: `docs/images/${file}.png` });
};
await scene('follow-corridor', 'corridor', -3.6, 0.05, Math.PI / 2, { power: true, 'trig:corridor:lightsOnAmbush': true, 'dead:corr1': true }, undefined, 'follow');
await scene('follow-deck', 'deck', 1.2, -6.4, Math.PI * 0.94, {}, undefined, 'follow');
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
