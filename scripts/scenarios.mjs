// Side-path scenarios: water hammer ambush, death -> game over -> retry, manual save/continue, phone layout.
// Usage: npm run build && node scripts/scenarios.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

const port = 5400 + Math.floor(Math.random() * 400);
const server = spawn('node', ['scripts/serve.mjs', process.env.E2E_ROOT ?? 'dist', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
await mkdir('.shots/scen', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed = true;
};

async function open(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, ...opts });
  page.setDefaultTimeout(15000);
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(600);
  return page;
}
const info = (page) => page.evaluate(() => window.__btk.info());

// ---------------------------------------------------------------- 1. water hammer brings a creature up
{
  const page = await open();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => window.__btk.play('engine', 4.3, 1.4, Math.PI / 2));
  await page.evaluate(() => window.__btk.game.save(true)); // as if we had just come through the door
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__btk.game.ui.clearMessages());
  // Admit steam with the drains shut.
  await page.evaluate(() => {
    void window.__btk.game.openPanel('dynamo');
  });
  await page.locator('#modal .btn', { hasText: '주증기 밸브 ¼ 열기' }).click();
  const hammers = (await info(page)).flags['dyn.hammers'];
  check(hammers === 1, `water hammer registered (hammers=${hammers})`);
  await page.locator('#modal .btn', { hasText: '물러나기' }).click();
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.__btk.game.ui.clearMessages());
    await page.waitForTimeout(150);
  }
  const s = await info(page);
  check(s.flags.engAmbush === true && s.creatures.some((c) => c.id === 'eng1'), 'water hammer drew a creature up from the bilge');
  await page.screenshot({ path: '.shots/scen/1-hammer-ambush.png' });

  // ------------------------------------------------------------ 2. let it kill us -> game over -> retry
  await page.evaluate(() => {
    const g = window.__btk.game;
    g.state.hp = 1;
    const c = g.creatures.find((x) => x.id === 'eng1');
    g.pl.place(c.x + 0.9, c.z, -Math.PI / 2);
  });
  await page.waitForSelector('#modal .gameover', { timeout: 20000 });
  check(true, 'player death leads to the game-over screen');
  await page.screenshot({ path: '.shots/scen/2-gameover.png' });
  await page.locator('#modal .btn', { hasText: '마지막 기록에서 다시' }).click();
  await page.waitForFunction(() => window.__btk.info().mode === 'play' && !window.__btk.info().ui, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const r = await info(page);
  check(r.room === 'engine' && r.hp > 0, `retry restores the autosave (room=${r.room}, hp=${r.hp})`);
  check(r.flags['dyn.hammers'] === undefined || r.flags['dyn.hammers'] === 0 || r.flags['dyn.hammers'] === 1, 'retry state is a valid saved state');
  const deaths = await page.evaluate(() => window.__btk.game.state.deaths);
  check(deaths >= 1, `death counter kept (${deaths})`);
  await page.close();
}

// ---------------------------------------------------------------- 3. manual save -> title -> continue
{
  const page = await open();
  await page.evaluate(() => window.__btk.play('cabin', 0.5, 1.5, 0));
  await page.evaluate(() => {
    window.__btk.give('crank');
    window.__btk.setFlags({ safeOpen: true, 'got:crank': true });
  });
  await page.keyboard.press('Escape');
  await page.locator('#modal .btn', { hasText: '기록하기' }).click();
  await page.locator('#modal .btn', { hasText: '타이틀로' }).click();
  await page.locator('#modal .btn', { hasText: '예' }).click();
  await page.waitForTimeout(1200);
  check((await info(page)).mode === 'title', 'returned to title');
  const cont = page.locator('#modal .title .btn', { hasText: '이어하기' });
  check(!(await cont.isDisabled()), 'continue is enabled after saving');
  await cont.click();
  await page.waitForTimeout(1200);
  const s = await info(page);
  check(s.room === 'cabin' && s.inv.includes('crank') && s.flags.safeOpen === true, 'continue restores room, inventory and flags');
  await page.close();
}

// ---------------------------------------------------------------- 4. phone portrait layout with touch controls
{
  const page = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.screenshot({ path: '.shots/scen/4-phone-title.png' });
  await page.evaluate(() => window.__btk.play('corridor', -2.5, 0, Math.PI / 2));
  await page.evaluate(() => window.__btk.game.ui.clearMessages());
  await page.waitForTimeout(500);
  const touchVisible = await page.evaluate(() => !document.getElementById('touch').hidden);
  check(touchVisible, 'touch controls shown on a touch device');
  const before = await info(page);
  // Hold the stick up (forward) for a moment using a real touch-pointer drag.
  const pad = await page.locator('#touch .pad').boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await page.mouse.down();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + 10, { steps: 4 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  const after = await info(page);
  check(after.x - before.x > 0.5, `stick moves the investigator forward (${before.x.toFixed(2)} -> ${after.x.toFixed(2)})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal overflow at phone width');
  await page.screenshot({ path: '.shots/scen/4-phone-play.png' });
  await page.close();
}

// ---------------------------------------------------------------- 5. review regressions
{
  const page = await open();
  // (a) Burn the idol first, then send SOS and walk away from the set while the reply is coming in.
  await page.evaluate(() => window.__btk.play('radio', 0.3, 1.45, 0));
  await page.evaluate(() => {
    window.__btk.setFlags({ power: true, idolBurned: true, radioIntro: true });
    window.__btk.game.ui.clearMessages();
    void window.__btk.game.openPanel('radio');
  });
  await page.waitForSelector('#modal .radio-wave');
  for (let i = 0; i < 12; i++) await page.locator('#modal .btn', { hasText: '−100' }).click();
  for (const [sym, n] of [['· 단점', 3], ['− 장점', 3], ['· 단점', 3]]) {
    for (let i = 0; i < n; i++) await page.locator('#modal .btn', { hasText: sym }).click();
    await page.locator('#modal .btn', { hasText: '글자 확정' }).click();
  }
  await page.keyboard.press('Escape'); // leave during "수화기에 귀를 기울인다…"
  for (let i = 0; i < 40 && (await info(page)).mode !== 'ending'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  check((await info(page)).mode === 'ending', 'SOS sent last (panel closed early) still reaches the ending');

  // (b) Drinking brandy while standing next to scenery works.
  await page.evaluate(() => window.__btk.play('bridge', 0, 0.75, 0));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = window.__btk.game;
    g.ui.clearMessages();
    window.__btk.give('brandy1');
    g.state.hp = 2;
  });
  const hint = (await info(page)).hint;
  await page.evaluate(() => {
    void window.__btk.game.useItem('brandy1');
  });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  const hp = (await info(page)).hp;
  check(hp === 5, `brandy works next to scenery (facing "${hint}", hp 2 -> ${hp})`);

  // (c) The inventory has a visible close button (touch players).
  await page.evaluate(() => window.__btk.game.ui.clearMessages());
  await page.waitForFunction(() => !window.__btk.info().busy && !window.__btk.info().ui).catch(async () => {
    console.log('DEBUG state', JSON.stringify(await info(page)).slice(0, 400));
    console.log('DEBUG stack', await page.evaluate(() => window.__btk.game.ui.stack.map((m) => m.el.className + ':' + m.el.textContent.slice(0, 40))));
    console.log('DEBUG msg', await page.evaluate(() => [window.__btk.game.ui.msgEl.hidden, window.__btk.game.ui.msgText.textContent]));
  });
  await page.keyboard.press('i');
  await page.locator('#modal .inv').waitFor();
  await page.locator('#modal .btn.close').click();
  await page.waitForTimeout(200);
  check((await page.locator('#modal .inv').count()) === 0, 'inventory closes with its 닫기 button');

  // (d) Starting a new game over an existing save asks first.
  await page.evaluate(() => window.__btk.game.save(false));
  await page.evaluate(() => window.__btk.game.showTitle());
  await page.waitForTimeout(1000);
  await page.locator('#modal .title .btn', { hasText: '새로 시작' }).click();
  const asked = await page.locator('#modal .panel', { hasText: '저장된 기록이 있습니다' }).count();
  await page.locator('#modal .btn', { hasText: '아니오' }).click();
  await page.waitForTimeout(200);
  check(asked === 1 && (await info(page)).mode === 'title', 'new game over a save asks for confirmation (and can be declined)');
  await page.close();
}

// ---------------------------------------------------------------- 6. every reachable spot is covered by a camera
{
  const page = await open();
  for (const room of ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold']) {
    await page.evaluate((r) => window.__btk.play(r), room);
    await page.waitForTimeout(150);
    const res = await page.evaluate(() => {
      const room = window.__btk.game.current;
      const b = room.def.bounds;
      const step = 0.2;
      const W = Math.ceil((b.maxX - b.minX) / step);
      const H = Math.ceil((b.maxZ - b.minZ) / step);
      const at = (i, j) => [b.minX + (i + 0.5) * step, b.minZ + (j + 0.5) * step];
      const free = (x, z) => room.col.pointFree(x, z, 0.27);
      const seen = new Uint8Array(W * H);
      const queue = [];
      for (const sp of Object.values(room.def.spawns)) {
        const i = Math.floor((sp.x - b.minX) / step);
        const j = Math.floor((sp.z - b.minZ) / step);
        if (i >= 0 && j >= 0 && i < W && j < H && !seen[j * W + i]) {
          seen[j * W + i] = 1;
          queue.push([i, j]);
        }
      }
      let reach = 0;
      const miss = [];
      const inZone = (x, z) => room.def.cameras.some((c) => c.zones.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ));
      while (queue.length) {
        const [i, j] = queue.pop();
        const [x, z] = at(i, j);
        reach++;
        if (!inZone(x, z)) miss.push([+x.toFixed(1), +z.toFixed(1)]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= W || nj >= H || seen[nj * W + ni]) continue;
          const [nx, nz] = at(ni, nj);
          if (!free(nx, nz) || !free((x + nx) / 2, (z + nz) / 2)) continue;
          seen[nj * W + ni] = 1;
          queue.push([ni, nj]);
        }
      }
      return { reach, miss: miss.length, sample: miss.slice(0, 6) };
    });
    check(res.miss === 0 && res.reach > 50, `${room}: all ${res.reach} reachable cells are covered by a camera${res.miss ? ` (uncovered ${res.miss}: ${JSON.stringify(res.sample)})` : ''}`);
  }
  await page.close();
}

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
server.kill();
process.exit(failed || errors.length ? 1 : 0);
