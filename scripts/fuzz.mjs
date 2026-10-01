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
];
// Every combination of control scheme and camera gets some rooms.
const schemes = [
  ['direct', 'follow'],
  ['tank', 'fixed'],
  ['direct', 'fixed'],
  ['tank', 'follow'],
];
let stuck = 0;
for (const [ri, room] of ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold'].entries()) {
  const flags = flagSets[Math.floor(rnd() * flagSets.length)];
  const [controls, camera] = schemes[ri % schemes.length];
  await page.evaluate(([r, f, controls, camera]) => {
    const b = window.__btk;
    b.game.applySettings({ ...b.game.settings, controls, camera });
    b.game.state.flags = { ...f };
    for (const i of ['crowbar', 'axe', 'cabinKey', 'crank', 'brandy1', 'idol']) if (Math.random() < 0.5) b.give(i);
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
