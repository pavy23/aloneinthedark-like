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
// The second act.
const act2 = { power: true, idolBurned: true, act2: true, 'a2.t0': 0, 'dead:a2fc1': true, 'dead:a2fc2': true };
await scene('fcsle', 'fcsle', 0.4, 4.4, -1.25, { ...act2, fcsleSeen: true, pellFreed: true, 'a2.pellStbd': false, 'a2.door.port': true }, async () => {
  // A hand-placed shot so that the operator by his locker door is not hidden behind the investigator.
  await page.evaluate(() => window.__btk.game.cutTo({ id: 'x', pos: [1.6, 1.85, 2.3], look: [-1.5, 0.75, 5.4], fov: 60, zones: [] }));
  await page.waitForTimeout(300);
});
await page.setViewportSize({ width: 960, height: 720 }); // room for the docked panel and the instruments
await scene('bridge', 'testroom', -0.2, 2.3, 0, {
  ...act2, testroomSeen: true, 'a2.bridgeIntro': true, 'a2.thingStbd': true, 'a2.leadStbd': true, 'a2.ratio': 0, 'a2.shuntSet': 3,
  'a2.d0': 0, 'a2.d1': 8, 'a2.d2': 1, 'a2.d3': 9, 'a2.rec.stbd.n': 2, 'a2.rec.stbd.first': 2.1, 'a2.rec.stbd.last': 2.1, 'a2.rec.port.n': 1, 'a2.rec.port.first': 1037, 'a2.rec.port.last': 1037,
}, async () => {
  await page.evaluate(() => {
    const g = window.__btk.game;
    g.state.time = g.state.flags['a2.t0'];
    g.cutTo({ id: 'x', pos: [-0.9, 1.75, 2.15], look: [0.35, 0.85, 3.15], fov: 52, zones: [], hidePlayer: true });
    void g.openPanel('bridge');
  });
  await page.waitForTimeout(1200);
});
await page.setViewportSize({ width: 640, height: 480 });
await scene('tank2', 'tank2', 2.55, -0.55, -Math.PI / 2 - 0.25, { ...act2, tank2Seen: true, tank2Drained: true, tank2Open: true }, async () => {
  // Close enough to the cone: the master gets up.
  await page.waitForTimeout(2600);
}, 'follow');
// The third act.
const act3 = { act3: true, 'a3.pell': true, 'a3.t0': 0, 'a3.seed': 1234, 'a3.combo': 472, 'sw.recorder': true, 'sw.condenser': true, 'sw.protector': true, 'a3.arrived': true, 'a3.opsSeen': true, 'a3.beachSeen': true, 'a3.limbSeen': true };
await scene('station', 'station', 0.6, -3.6, 0.12, act3, undefined, 'follow');
await page.setViewportSize({ width: 960, height: 720 });
await scene('tape', 'opsroom', 0.6, 4.4, 0, { ...act3, 'a3.tapeSeen': true, 'a3.clerkUp': true, 'dead:a3clerk': true, 'a3.tapeMemo': true }, async () => {
  await page.evaluate(() => {
    window.__btk.give('codeCard');
    void window.__btk.game.openPanel('tape');
  });
  await page.waitForTimeout(500);
  // Wind the tape on to the figures.
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(3400);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(400);
});
await page.setViewportSize({ width: 640, height: 480 });
// Along the shore from the west, so the hut does not hide what comes up where the cable goes into the sea.
await scene('beach', 'beach', -3.4, 5.2, 1.24, { ...act3, 'a3.pellReady': true, 'a3.handle': true }, async () => {
  await page.evaluate(() => window.__btk.game.cutTo({ id: 'x', pos: [-4.4, 1.9, 2.9], look: [2.6, 2.6, 7.1], fov: 58, zones: [] }));
  await page.waitForTimeout(3600);
}, 'follow');
await browser.close();
server.kill();
