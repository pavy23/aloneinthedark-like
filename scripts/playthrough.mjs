// End-to-end playthrough in headless Chromium: plays the whole game from the title screen to the ending
// through the real input path (virtual buttons), the real UI (DOM clicks) and the real puzzles.
// Usage: npm run build && node scripts/playthrough.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// Optional: E2E_ROOT=<dir> E2E_PAGE=<file.html> to test another build (e.g. the single-file page).
const root = process.env.E2E_ROOT ?? 'dist';
const pagePath = process.env.E2E_PAGE ?? '';
const port = 4800 + Math.floor(Math.random() * 500);
const server = spawn('node', ['scripts/serve.mjs', root, String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
await mkdir('.shots/play', { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push(`[console.error] ${t}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let stepNo = 0;
const log = (...a) => console.log(`[${String(++stepNo).padStart(2, '0')}]`, ...a);
const fail = async (msg) => {
  await page.screenshot({ path: '.shots/play/FAIL.png' });
  const info = await page.evaluate(() => window.__btk.info()).catch(() => null);
  console.error('FAIL:', msg, JSON.stringify(info));
  console.error(errors.join('\n'));
  await browser.close();
  server.kill();
  process.exit(1);
};
const expect = async (cond, msg) => {
  if (!cond) await fail(msg);
};
const shot = (name) => page.screenshot({ path: `.shots/play/${String(stepNo).padStart(2, '0')}-${name}.png` });

await page.goto(`http://localhost:${port}/${pagePath}`);
await page.waitForFunction(() => !!window.__btk);

// In-page test driver: steers the investigator with the same virtual buttons the touch controls use.
await page.evaluate(() => {
  const g = () => window.__btk.game;
  const frames = (n) =>
    new Promise((r) => {
      let k = 0;
      const f = () => (++k >= n ? r() : requestAnimationFrame(f));
      requestAnimationFrame(f);
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ALL = ['up', 'down', 'left', 'right', 'run', 'action', 'attack', 'inventory', 'menu', 'cancel'];
  const release = () => ALL.forEach((b) => g().input.setTouch(b, false));
  const press = async (btn, hold = 3) => {
    g().input.setTouch(btn, true);
    await frames(hold);
    g().input.setTouch(btn, false);
    await frames(2);
  };
  const msgOpen = () => !g().ui.msgEl.hidden;
  const modalOpen = () => g().ui.stack.length > 0;
  // Advance dialogue until nothing (but modals) is showing; returns the lines seen.
  const skip = async (max = 80) => {
    const seen = [];
    for (let i = 0; i < max; i++) {
      await frames(2);
      if (msgOpen() && !g().ui.choiceNav) {
        const t = g().ui.msgText.textContent;
        if (seen[seen.length - 1] !== t) seen.push(t);
        await press('action');
        continue;
      }
      if (!g().busy && !msgOpen()) {
        await sleep(120);
        if (!g().busy && !msgOpen()) return seen;
      }
    }
    return seen;
  };
  const drive = async (x, z, tol = 0.22, timeoutMs = 25000, run = true) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      if (msgOpen() && !g().ui.choiceNav) {
        release();
        await press('action');
        continue;
      }
      if (g().busy || modalOpen()) {
        release();
        await frames(2);
        continue;
      }
      const pl = g().pl;
      const dx = x - pl.x;
      const dz = z - pl.z;
      const d = Math.hypot(dx, dz);
      if (d < tol) {
        release();
        await frames(3);
        return true;
      }
      let diff = Math.atan2(dx, dz) - pl.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const inp = g().input;
      inp.setTouch('left', diff > 0.1);
      inp.setTouch('right', diff < -0.1);
      inp.setTouch('up', Math.abs(diff) < 0.45);
      inp.setTouch('run', run && d > 2.2 && Math.abs(diff) < 0.2);
      await frames(1);
    }
    release();
    return false;
  };
  const face = async (x, z, timeoutMs = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const pl = g().pl;
      let diff = Math.atan2(x - pl.x, z - pl.z) - pl.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.06) {
        release();
        await frames(2);
        return true;
      }
      g().input.setTouch('left', diff > 0);
      g().input.setTouch('right', diff < 0);
      await frames(1);
    }
    release();
    return false;
  };
  const path = async (pts, tol) => {
    for (const [x, z] of pts) if (!(await drive(x, z, tol))) return false;
    return true;
  };
  const act = async () => {
    await press('action');
    await frames(4);
  };
  window.__t = { frames, sleep, press, skip, drive, face, path, act, release, msgOpen, modalOpen, info: () => window.__btk.info() };
});

const T = (fn, ...args) => page.evaluate(([f, a]) => window.__t[f](...a), [fn, args]);
const info = () => page.evaluate(() => window.__btk.info());
const flag = async (name) => (await info()).flags[name];
const waitIdle = async () => {
  for (let i = 0; i < 200; i++) {
    const s = await info();
    if (!s.busy && !s.ui) return;
    await T('skip');
  }
};
const clickBtn = async (text, scope = '#modal') => {
  const loc = page.locator(`${scope} .btn`, { hasText: text }).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  await loc.click();
  await page.waitForTimeout(120);
};
const closeDoc = async () => {
  for (let i = 0; i < 10; i++) {
    const n = await page.locator('#modal .doc').count();
    if (n === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
};
const useItem = async (name) => {
  await T('press', 'inventory');
  await page.locator('.inv .list .btn', { hasText: name }).first().click();
  await page.waitForTimeout(100);
  await clickBtn('사용', '.inv .view');
  await page.waitForTimeout(200);
};

// ------------------------------------------------------------------ Title & intro
await page.waitForTimeout(800);
await shot('title');
log('title screen');
await clickBtn('새로 시작');
for (let i = 0; i < 12; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
}
await page.waitForFunction(() => window.__btk.info().mode === 'play' && window.__btk.info().room === 'deck', null, { timeout: 15000 });
await T('skip');
let s = await info();
log('deck start', s.x.toFixed(2), s.z.toFixed(2));
await expect(s.room === 'deck' && Math.abs(s.x + 5.1) < 0.3, 'spawned on deck');
await shot('deck-start');

// ------------------------------------------------------------------ Deck: crowbar, locked door, ladder
await expect(await T('path', [[-4.3, 1.5], [-3.6, 5.0], [-2.9, 8.3]], 0.3), 'walk to crowbar');
await T('face', -1.9, 8.3);
await T('act');
await waitIdle();
s = await info();
log('crowbar', s.inv.includes('crowbar'));
await expect(s.inv.includes('crowbar'), 'picked up crowbar');
await expect(await T('path', [[-3.4, 4.5], [-3.6, -4.0], [-2.0, -11.1]], 0.25), 'walk to house door');
await T('face', -2, -12);
await T('act');
const lines = await T('skip');
log('house door says:', lines[0]);
await expect(lines.some((l) => l.includes('꿈쩍')), 'house door blocked message');
await expect(await T('path', [[1.5, -9.5], [4.4, -10.8]], 0.25), 'walk to ladder');
await T('face', 4.4, -12);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'bridge' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
log('bridge reached');
await shot('bridge');

// ------------------------------------------------------------------ Bridge: key, brandy, log page
await expect(await T('path', [[1.5, 0.3], [-2.0, -0.6], [-3.6, -0.7]], 0.25), 'walk to chart table');
await T('face', -3.75, -1.9);
await T('act');
await waitIdle();
s = await info();
await expect(s.inv.includes('cabinKey'), 'got cabin key from chart table');
log('cabin key ok');
await expect(await T('drive', -4.0, 0.3, 0.25), 'walk to coat');
await T('face', -4.9, 0.3);
await T('act');
await waitIdle();
await expect((await info()).inv.includes('brandy1'), 'got brandy from coat');
await expect(await T('drive', 1.0, 0.7, 0.3), 'walk to log page');
await T('face', 0.9, 0.1);
await T('act');
await page.waitForSelector('#modal .doc', { timeout: 5000 });
await shot('doc-logpage');
await closeDoc();
await waitIdle();
await expect((await info()).inv.includes('logPage'), 'got log page');
log('log page read');
await expect(await T('path', [[2.6, -0.4], [3.75, -0.85]], 0.25), 'walk to stairs');
await T('face', 3.75, -2.0);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'corridor' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
log('corridor reached');

// ------------------------------------------------------------------ Corridor: push barricade, unlock cabin
await expect(await T('drive', -7.35, 1.45, 0.12), 'stand behind barricade');
await T('face', -7.35, -1.0);
await T('act');
await waitIdle();
s = await info();
log('barricade moved?', s.flags.barricadeMoved);
await expect(s.flags.barricadeMoved === true, 'barricade pushed away from deck door');
await shot('barricade');
await expect(await T('path', [[-6.0, 0.2], [-3.2, 0.1]], 0.2), 'walk to cabin door');
await T('face', -3.2, 1.0);
await useItem('선장실 열쇠');
await waitIdle();
await expect((await info()).flags.cabinUnlocked === true, 'cabin door unlocked via inventory');
log('cabin unlocked');
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'cabin' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await expect(await T('drive', -1.05, 3.05, 0.2), 'walk to desk');
await T('face', -1.55, 3.9);
await T('act');
await page.waitForSelector('#modal .doc', { timeout: 5000 });
await shot('doc-diary');
await closeDoc();
await waitIdle();
await expect((await info()).inv.includes('diary'), 'got diary');
log('diary read');
await expect(await T('drive', 0, 0.7, 0.25), 'back to cabin door');
await T('face', 0, -0.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'corridor' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();

// ------------------------------------------------------------------ Corridor -> engine room: notes & dynamo
await expect(await T('path', [[-0.9, 0.0]], 0.25), 'walk to photos');
await T('face', -0.9, 1.0);
await T('act');
const photoLines = await T('skip');
await expect(photoLines.some((l) => l.includes('1911년 3월 14일')), 'photo shows keel laying date');
log('photos ok');
await expect(await T('path', [[5.0, 0.0], [7.5, -1.2], [7.5, -2.1]], 0.2), 'walk to engine door');
await T('face', 7.5, -3.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'engine' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
log('engine room reached');
await shot('engine');
await expect(await T('drive', 4.1, -6.05, 0.2), 'walk to workbench');
await T('face', 4.1, -6.95);
await T('act');
await page.waitForSelector('#modal .doc', { timeout: 5000 });
await closeDoc();
await waitIdle();
await expect((await info()).inv.includes('engineerNotes'), 'got engineer notes');
await expect(await T('path', [[3.3, -3.6], [4.2, 1.5]], 0.25), 'walk to dynamo');
await T('face', 5.6, 1.0);
await T('act');
await T('skip');
await page.waitForSelector('#modal .panel .controls', { timeout: 5000 });
await shot('dynamo-panel');
await clickBtn('드레인 밸브 열기');
await clickBtn('주증기 밸브 ¼ 열기');
await page.waitForTimeout(4800);
await clickBtn('주증기 밸브 완전히 열기');
await clickBtn('드레인 밸브 닫기');
await page.waitForFunction(() => window.__btk.info().flags['dyn.rpm'] >= 0.92, null, { timeout: 12000 });
await clickBtn('주차단기 넣기');
await page.waitForTimeout(1600);
s = await info();
log('power', s.flags.power, 'hammers', s.flags['dyn.hammers']);
await expect(s.flags.power === true && !s.flags['dyn.hammers'], 'dynamo started by the book (no water hammer)');
await shot('power-on');
await clickBtn('물러나기');
await waitIdle();

// ------------------------------------------------------------------ Back up: safe in the cabin
await expect(await T('path', [[3.4, -3.8], [6.1, -6.3], [6.2, -6.5]], 0.3), 'walk to ladder');
await T('face', 6.3, -7.4);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'corridor' && !window.__btk.info().busy, null, { timeout: 8000 });
await T('skip');
// The lights-on ambush may start here; deal with it after the safe (creature is slow).
s = await info();
log('corridor with power; creatures:', JSON.stringify(s.creatures));
await expect(await T('path', [[7.5, -0.4], [2.0, 0.0], [0.3, -0.1]], 0.25), 'walk to fire cabinet');
await T('face', 0.3, -1.0);
await useItem('쇠지렛대');
await waitIdle();
await T('act');
await waitIdle();
s = await info();
await expect(s.inv.includes('axe'), 'got fire axe after breaking the glass');
log('axe ok');
// Equip the axe through the inventory
await T('press', 'inventory');
await page.locator('.inv .list .btn', { hasText: '소방 도끼' }).first().click();
await clickBtn('손에 들기', '.inv .view');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await expect((await page.evaluate(() => window.__btk.game.state.equipped)) === 'axe', 'axe equipped');

// Fight whatever came up from the engine room.
const fight = async (maxMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await info();
    const alive = st.creatures.filter((c) => c.state !== 'gone' && c.state !== 'dying');
    if (alive.length === 0) return true;
    if (st.hp <= 2) {
      const heal = st.inv.find((i) => i.startsWith('brandy'));
      if (heal) await page.evaluate((id) => window.__btk.game.useItem(id), heal);
      await T('skip');
    }
    const c = alive.sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
    await T('face', c.x, c.z, 1500);
    const d = Math.hypot(c.x - st.x, c.z - st.z);
    if (d < 1.45 && c.state !== 'rising') await T('press', 'attack');
    else await page.waitForTimeout(80);
    await T('skip', 5);
  }
  return false;
};
await page.waitForTimeout(1500);
s = await info();
if (s.creatures.length > 0) {
  log('fighting', s.creatures.length, 'creature(s) in corridor');
  await shot('corridor-fight');
  await expect(await fight(), 'won the corridor fight');
  log('corridor fight won, hp', (await info()).hp);
}
await expect(await T('path', [[-2.0, 0.1], [-3.2, 0.2]], 0.25), 'walk to cabin door again');
await T('face', -3.2, 1.0);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'cabin' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await expect(await T('drive', 1.75, 3.7, 0.2), 'walk to safe');
await T('face', 2.55, 3.95);
await T('act');
await T('skip');
await page.waitForSelector('#modal .dials', { timeout: 5000 });
// Wrong combination first (launch date 11-9-2), then the keel laying date 11-3-14.
const dial = async (vals) => {
  for (let i = 0; i < 3; i++) {
    const cur = Number(await page.locator('.dial .val').nth(i).textContent());
    const up = page.locator('.dial').nth(i).locator('.btn').first();
    for (let k = 0; k < (vals[i] - cur + 100) % 100; k++) await up.click({ delay: 0 });
  }
};
await dial([11, 9, 2]);
await clickBtn('손잡이 돌리기');
await expect(!(await flag('safeOpen')), 'launch date must not open the safe');
await dial([11, 3, 14]);
await shot('safe-panel');
await clickBtn('손잡이 돌리기');
await page.waitForTimeout(1000);
await expect((await flag('safeOpen')) === true, 'keel-laying date opens the safe');
for (let i = 0; i < 40 && (await page.locator('#modal .doc').count()) === 0; i++) {
  if (await page.evaluate(() => window.__t.msgOpen())) await T('press', 'action');
  await page.waitForTimeout(150);
}
await page.waitForSelector('#modal .doc', { timeout: 8000 });
await closeDoc();
await waitIdle();
s = await info();
await expect(s.inv.includes('crank') && s.inv.includes('captainLog'), 'got crank + captain log');
log('safe opened');

// ------------------------------------------------------------------ Wireless: 500 kc -> 600 m, SOS
await expect(await T('drive', 0, 0.7, 0.25), 'to cabin door');
await T('face', 0, -0.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'corridor' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
if ((await info()).creatures.some((c) => c.state !== 'gone')) await expect(await fight(), 'fight again');
await expect(await T('path', [[0.5, 0.0], [2.6, 0.1]], 0.2), 'walk to radio door');
await T('face', 2.6, 1.0);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'radio' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await expect(await T('drive', 0.3, 1.45, 0.2), 'walk to radio');
await T('face', 0.3, 3.1);
await T('act');
await T('skip');
await page.waitForSelector('#modal .radio-wave', { timeout: 5000 });
for (let i = 0; i < 12; i++) await clickBtn('−100');
const wave = await page.locator('.radio-wave .val').textContent();
log('wave set to', wave);
await expect(wave.trim() === '600 m', 'wavelength 600 m');
const sym = async (dot, n) => {
  for (let i = 0; i < n; i++) await clickBtn(dot ? '· 단점' : '− 장점');
  await clickBtn('글자 확정');
};
await sym(true, 3);
await sym(false, 3);
await sym(true, 3);
await page.waitForFunction(() => window.__btk.info().flags.sosSent === true, null, { timeout: 15000 });
await shot('radio-sos');
log('SOS acknowledged');
await clickBtn('물러나기');
await waitIdle();

// ------------------------------------------------------------------ Engine room: watertight door
await expect(await T('drive', 0, 0.7, 0.25), 'to radio door');
await T('face', 0, -0.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'corridor' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await expect(await T('path', [[5.0, 0.0], [7.5, -1.2], [7.5, -2.1]], 0.2), 'walk to engine door');
await T('face', 7.5, -3.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'engine' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await expect(await T('path', [[3.3, -5.0], [1.6, -5.9], [-3.0, -5.9], [-5.9, -3.2]], 0.3), 'walk to watertight door');
await T('face', -7, -3.5);
await useItem('수밀문 개폐 핸들');
await waitIdle();
await expect((await flag('wtOpen')) === true, 'watertight door opened with crank');
log('watertight door open');
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'hold' && !window.__btk.info().busy, null, { timeout: 8000 });
await waitIdle();
await shot('hold');

// ------------------------------------------------------------------ Hold: the idol
await expect(await T('path', [[5.9, -1.2], [5.7, 0], [1.45, 0]], 0.15), 'walk the plank');
await T('face', 0, 0);
await T('act');
await page.waitForSelector('#hud .msg .choices .btn', { timeout: 8000 }).catch(async () => {
  await T('skip', 6);
});
for (let i = 0; i < 10 && (await page.locator('#hud .msg .choices .btn').count()) === 0; i++) {
  await T('press', 'action');
  await page.waitForTimeout(150);
}
await page.locator('#hud .msg .choices .btn', { hasText: '떼어낸다' }).click();
await T('skip');
s = await info();
await expect(s.inv.includes('idol') && s.creatures.length >= 2, 'took idol, creatures rising');
log('idol taken; creatures:', s.creatures.length);
await shot('hold-creatures');
await expect(await T('path', [[5.7, 0], [6.2, -2.4], [6.8, -3.4]], 0.3), 'escape to the door');
await T('face', 7.5, -3.5);
await T('act');
await page.waitForFunction(() => window.__btk.info().room === 'engine' && !window.__btk.info().busy, null, { timeout: 8000 });
log('back in engine room, hp', (await info()).hp);

// ------------------------------------------------------------------ Burn it
await expect(await T('path', [[-5.0, -1.2], [-3.2, 1.3], [-3.2, 2.6]], 0.3), 'run to the furnace');
await T('face', -3.2, 4.2);
await T('act');
await page.waitForFunction(() => window.__btk.info().mode === 'ending', null, { timeout: 30000 }).catch(async () => {
  await T('skip');
});
for (let i = 0; i < 60 && (await info()).mode !== 'ending'; i++) await T('skip', 3);
await expect((await info()).mode === 'ending', 'reached the ending');
await page.waitForTimeout(2500);
for (let i = 0; i < 12 && (await page.locator('#modal .story .btn', { hasText: '타이틀로' }).count()) === 0; i++) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
}
await shot('ending');
const endText = await page.locator('#modal .story').innerText();
await expect(endText.includes('끝'), 'ending text shown');
log('ENDING reached. flags:', JSON.stringify((await info()).flags).slice(0, 300));
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
