// Chaos test: random inputs in every room (moving, turning, examining, attacking, opening menus) with
// random game state, looking for exceptions and for the game getting stuck in a "busy" state.
// Usage: npm run build && node scripts/fuzz.mjs [secondsPerRoom]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';

const seconds = Number(process.argv[2] ?? 20);
const port = 7600 + Math.floor(Math.random() * 300);
const server = spawn('node', ['scripts/serve.mjs', process.env.E2E_ROOT ?? 'dist', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!window.__btk);

let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const flagSets = [
  {},
  { power: true },
  { power: true, 'trig:corridor:lightsOnAmbush': true, wtOpen: true },
  { power: true, 'got:idol': true, wtOpen: true, engAmbush: true },
  // The second act, at various points.
  { power: true, idolBurned: true, act2: true, 'a2.t0': 0, 'vc.sea': true, 'vc.tank2': true, 'vc.level': 1 },
  { power: true, idolBurned: true, act2: true, 'a2.t0': 0, pellFreed: true, testUnlocked: true, 'a2.measured': true, tank2Drained: true, tank2Open: true },
];
// The third act (Bell Cove): as found, with Pell sitting at the coil, and alone with the candle burning.
const sw = (o) => ({ 'sw.recorder': true, 'sw.condenser': true, 'sw.protector': true, 'sw.bridge': false, 'sw.coil': false, ...o });
const act3Sets = [
  { act3: true, 'a3.pell': false, 'a3.t0': 0, 'a3.seed': 5, 'a3.combo': 123, ...sw({}) },
  { act3: true, 'a3.pell': true, 'a3.t0': 0, 'a3.seed': 9, 'a3.combo': 808, 'a3.batteryOpen': true, 'a3.pellMet': true, 'a3.handle': true, 'a3.measured': true, 'a3.pellReady': true, ...sw({ 'sw.recorder': false, 'sw.condenser': false, 'sw.protector': false, 'sw.coil': true }) },
  { act3: true, 'a3.pell': false, 'a3.t0': 0, 'a3.seed': 3, 'a3.combo': 51, 'a3.batteryOpen': true, 'a3.handle': true, 'a3.measured': true, 'a3.timerAt': 25, ...sw({ 'sw.coil': true }) },
];
const ACT3_ROOMS = ['station', 'opsroom', 'battery', 'beach'];
// Every combination of control scheme and camera gets some rooms.
const schemes = [
  ['direct', 'follow'],
  ['tank', 'fixed'],
  ['direct', 'fixed'],
  ['tank', 'follow'],
];
let stuck = 0;
for (const [ri, room] of ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold', 'fcsle', 'testroom', 'tank2', ...ACT3_ROOMS].entries()) {
  const sets = ACT3_ROOMS.includes(room) ? act3Sets : flagSets;
  const flags = sets[Math.floor(rnd() * sets.length)];
  const [controls, camera] = schemes[ri % schemes.length];
  await page.evaluate(([r, f, controls, camera]) => {
    const b = window.__btk;
    b.game.applySettings({ ...b.game.settings, controls, camera });
    b.game.state.flags = { ...f };
    b.game.state.time = 0;
    for (const i of ['crowbar', 'axe', 'cabinKey', 'crank', 'brandy1', 'idol', 'testKey', 'brakeKey', 'rum', 'woodAxe', 'hydrometer', 'candle', 'codeCard', 'swHandle', 'rum3', 'brandy3']) if (Math.random() < 0.5) b.give(i);
    return b.play(r);
  }, [room, flags, controls, camera]);
  const t0 = Date.now();
  let busySince = 0;
  const keys = ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'KeyF', 'ShiftLeft', 'KeyI', 'Escape', 'KeyC'];
  while (Date.now() - t0 < seconds * 1000) {
    const k = keys[Math.floor(rnd() * keys.length)];
    const hold = 40 + Math.floor(rnd() * 500);
    await page.keyboard.down(k);
    await page.waitForTimeout(hold);
    await page.keyboard.up(k);
    // Close whatever opened (menus, documents, panels) and advance dialogue now and then.
    if (rnd() < 0.35) await page.keyboard.press('Escape');
    if (rnd() < 0.5) await page.keyboard.press('Space');
    const s = await page.evaluate(() => window.__btk.info());
    if (s.mode !== 'play') {
      // Death -> game over -> retry, or the ending: go back into the room under test.
      await page.evaluate((r) => window.__btk.play(r), room);
      continue;
    }
    if (s.busy && !s.ui) {
      busySince ||= Date.now();
      if (Date.now() - busySince > 12000) {
        stuck++;
        console.log(`STUCK busy in ${room}`, JSON.stringify(s).slice(0, 300));
        await page.evaluate((r) => window.__btk.play(r), room);
        busySince = 0;
      }
    } else busySince = 0;
  }
  const s = await page.evaluate(() => window.__btk.info());
  console.log(`${room.padEnd(9)} ok  ${`${controls}/${camera}`.padEnd(13)} pos=(${s.x.toFixed(1)},${s.z.toFixed(1)}) hp=${s.hp} creatures=${s.creatures.length}`);
}
console.log(errors.length ? `ERRORS:\n${[...new Set(errors)].join('\n')}` : 'no console errors');
console.log(stuck ? `stuck ${stuck} time(s)` : 'never stuck');
await browser.close();
server.kill();
process.exit(errors.length || stuck ? 1 : 0);
