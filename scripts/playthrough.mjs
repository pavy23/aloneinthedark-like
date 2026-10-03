// End-to-end playthrough in headless Chromium: plays the whole game from the title screen to the ending
// through the real input path (virtual buttons), the real UI (DOM clicks) and the real puzzles.
// Usage: npm run build && node scripts/playthrough.mjs
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

// Optional: E2E_ROOT=<dir> E2E_PAGE=<file.html> to test another build (e.g. the single-file page).
// E2E_SCHEME=tank plays with the original 1992 scheme (tank controls + fixed cameras) instead of the
// default screen-relative controls with the follow camera.
const root = process.env.E2E_ROOT ?? 'dist';
const pagePath = process.env.E2E_PAGE ?? '';
const scheme = process.env.E2E_SCHEME === 'tank' ? 'tank' : 'direct';
// E2E_FROM=act2 skips the first act (sets its outcome directly) and starts at the furnace with the stone.
// E2E_FROM=act3 starts the third act from its chapter state (E2E_PELL=1: with the operator; default alone),
// E2E_FROM=act4 the fourth (E2E_PELL=1: Pell answers from Bell Cove).
const fromAct2 = process.env.E2E_FROM === 'act2';
const fromAct3 = process.env.E2E_FROM === 'act3';
const fromAct4 = process.env.E2E_FROM === 'act4';
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
await page.evaluate((tank) => {
  const g = window.__btk.game;
  g.applySettings({ ...g.settings, controls: tank ? 'tank' : 'direct', camera: tank ? 'fixed' : 'follow' });
}, scheme === 'tank');
console.log(`control scheme: ${scheme}`);

// In-page test driver: steers the investigator through the same inputs the touch controls use (the
// virtual analog stick for screen-relative controls, the virtual buttons for tank controls).
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
  const release = () => {
    ALL.forEach((b) => g().input.setTouch(b, false));
    g().input.setStick(0, 0, false);
  };
  const direct = () => g().pl.controlMode === 'direct';
  // Screen-relative controls: turn a world direction into the stick deflection that means it on screen.
  const V3 = g().camera.position.constructor;
  const view = new V3();
  const stickToward = (wx, wz, mag) => {
    g().camera.getWorldDirection(view);
    const l = Math.hypot(view.x, view.z) || 1;
    const fx = view.x / l;
    const fz = view.z / l;
    const wl = Math.hypot(wx, wz) || 1;
    // right = (-fz, fx); world = forward * y + right * x
    g().input.setStick(((wx * -fz + wz * fx) / wl) * mag, ((wx * fx + wz * fz) / wl) * mag, true);
  };
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
      if (direct()) {
        // Full deflection runs; slow down for the last stretch so we stop on the spot.
        stickToward(dx, dz, run && d > 2.2 ? 1 : d < 0.5 ? 0.45 : 0.85);
        await frames(1);
        continue;
      }
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
      if (direct()) {
        // A light push towards it: he turns that way (and may shuffle a few centimetres).
        stickToward(x - pl.x, z - pl.z, 0.2);
        await frames(1);
        continue;
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

// Fight whatever is up (faces the nearest creature, swings when in reach, drinks when low).
const fight = async (maxMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await info();
    // The limbs (at the cable hut, over the bow) cannot be cut down; the fight is with whatever walks.
    const alive = st.creatures.filter((c) => c.state !== 'gone' && c.state !== 'dying' && !c.id.includes('limb'));
    if (alive.length === 0) return true;
    if (st.hp <= 3) {
      const heal = st.inv.find((i) => i.startsWith('brandy') || i.startsWith('rum'));
      if (heal)
        await page.evaluate((id) => {
          void window.__btk.game.useItem(id);
        }, heal);
      await T('skip');
    }
    const c = alive.sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
    const d = Math.hypot(c.x - st.x, c.z - st.z);
    // A heavy hitter's raised arms: step back out of reach, then go in while it recovers.
    if (c.strength > 1 && c.state === 'windup' && d < 1.7) {
      const k = 1.3 / Math.max(d, 0.1);
      await T('drive', st.x - (c.x - st.x) * k, st.z - (c.z - st.z) * k, 0.35, 600, false);
      continue;
    }
    await T('face', c.x, c.z, 1500);
    if (d < 1.45 && c.state !== 'rising') await T('press', 'attack');
    else await page.waitForTimeout(80);
    await T('skip', 5);
  }
  return false;
};
// Shared by the third and fourth acts.
const arrive3 = async (room) => {
  // (Whoever is in the room may have something to say straight away: waitIdle pages through it.)
  await page.waitForFunction((r) => window.__btk.info().room === r, room, { timeout: 10000 });
  await waitIdle();
};
const clear3 = async (what) => {
  await page.waitForTimeout(400);
  if ((await info()).creatures.some((c) => c.state !== 'gone' && !c.id.includes('limb'))) await expect(await fight(60000), `won the fight: ${what}`);
  await waitIdle();
};
const go3 = async (pts, fx, fz, room, what) => {
  await expect(await T('path', pts, 0.25), what);
  await T('face', fx, fz);
  await T('act');
  await arrive3(room);
};
const choose = async (label) => {
  for (let i = 0; i < 40 && (await page.locator('#hud .msg .choices .btn').count()) === 0; i++) {
    if (await page.evaluate(() => window.__t.msgOpen() && !window.__btk.game.ui.choiceNav)) await T('press', 'action');
    await page.waitForTimeout(150);
  }
  const btn = page.locator('#hud .msg .choices .btn', { hasText: label }).first();
  if (!(await btn.isVisible())) await fail(`no choice "${label}" offered`);
  await btn.click();
  return T('skip', 600);
};
const actAt = async (pts, fx, fz, what) => {
  await expect(await T('path', pts, 0.2), what);
  await T('face', fx, fz);
  await T('act');
};
const openedPanel = async (sel) => {
  for (let i = 0; i < 60 && (await page.locator(`#modal ${sel}`).count()) === 0; i++) {
    if (await page.evaluate(() => window.__t.msgOpen())) await T('press', 'action');
    if ((await page.locator('#modal .doc').count()) > 0) await closeDoc();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(`#modal ${sel}`, { timeout: 5000 });
};

if (fromAct3) {
  await page.waitForTimeout(800);
  await page.evaluate((p) => void window.__btk.startChapter(3, p), process.env.E2E_PELL === '1');
  await playAct3(process.env.E2E_PELL === '1');
  await finish();
}
if (fromAct4) {
  await page.waitForTimeout(800);
  await page.evaluate((p) => void window.__btk.startChapter(4, p), process.env.E2E_PELL === '1');
  await playAct4(process.env.E2E_PELL === '1');
  await finish();
}

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

if (fromAct2) {
  // The first act's outcome: power on, SOS sent, the stone taken; axe in hand, back in the engine room.
  await page.evaluate(() => {
    const b = window.__btk;
    b.setFlags({
      power: true, barricadeMoved: true, cabinUnlocked: true, safeOpen: true, sosSent: true, wtOpen: true,
      'got:crowbar': true, 'got:axe': true, 'got:idol': true, 'got:brandy1': true, 'got:cabinKey': true,
      'got:logPage': true, 'got:diary': true, 'got:engineerNotes': true, 'got:crank': true, 'got:captainLog': true,
      engineSeen: true, holdSeen: true, axeTaken: true, engAmbush: true,
    });
    for (const id of ['crowbar', 'axe', 'crank', 'captainLog', 'idol', 'brandy1']) b.give(id);
    b.game.state.push['corridor:barricade'] = [-7.35, -1.15];
    b.game.equip('axe');
  });
  await page.evaluate(() => window.__btk.play('engine', -5.0, -1.2, 0));
  await waitIdle();
  log('skipped the first act');
} else {
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

}

// ------------------------------------------------------------------ Burn it: the second act begins
await expect(await T('path', [[-5.0, -1.2], [-3.2, 1.3], [-3.2, 2.6]], 0.3), 'run to the furnace');
await T('face', -3.2, 4.2);
await T('act');
for (let i = 0; i < 80 && (await info()).flags.act2 !== true; i++) await T('skip', 3);
await waitIdle();
s = await info();
await expect(s.mode === 'play' && s.flags.idolBurned === true, 'burning the stone opens the second act instead of ending');
const pellSide = s.flags['a2.pellStbd'] ? 'stbd' : 'port';
const thingSide = s.flags['a2.thingStbd'] ? 'stbd' : 'port';
const KO = { port: '좌현', stbd: '우현' };
log(`ACT II: the operator is behind the ${pellSide} locker, the thing climbs the ${thingSide} cable`);
await shot('act2');

// Room-to-room legs used more than once.
const arrive = async (room) => {
  await page.waitForFunction((r) => window.__btk.info().room === r && !window.__btk.info().busy, room, { timeout: 10000 });
  await waitIdle();
};
const clearRoom = async (what) => {
  await page.waitForTimeout(400);
  if ((await info()).creatures.some((c) => c.state !== 'gone')) await expect(await fight(60000), `won the fight: ${what}`);
  await waitIdle();
};
const go = async (pts, fx, fz, room, what) => {
  await expect(await T('path', pts, 0.25), what);
  await T('face', fx, fz);
  await T('act');
  await arrive(room);
};
const engineToCorridor = (from) =>
  go([...from, [-3.0, -5.9], [1.6, -5.9], [3.3, -5.0], [6.1, -6.3], [6.2, -6.5]], 6.3, -7.4, 'corridor', 'engine room ladder');
const corridorToDeck = (from) => go([...from, [2.0, 0.0], [-6.0, 0.2], [-7.2, 0.0]], -8.5, 0, 'deck', 'corridor to deck door');
const deckToCorridor = (from) => go([...from, [3.4, 3.0], [3.4, -3.0], [2.5, -9.0], [-2.0, -11.0]], -2, -12, 'corridor', 'deck to house door');
const corridorToEngine = (from) => go([...from, [5.0, 0.0], [7.5, -1.2], [7.5, -2.1]], 7.5, -3.2, 'engine', 'corridor to engine door');

// ------------------------------------------------------------------ Act II: up to the bow, down the scuttle
await engineToCorridor([[-3.2, 1.3], [-5.0, -1.2], [-5.9, -3.2]]);
await clearRoom('corridor');
await corridorToDeck([[7.5, -0.4]]);
await clearRoom('fore deck');
s = await info();
await expect(s.flags['a2.deckSeen'] === true, 'second-act deck narration');
await go([[2.5, -9.0], [3.4, -3.0], [3.4, 3.0], [3.0, 5.7]], 3.0, 7.4, 'fcsle', 'down the forecastle scuttle');
log('crew’s quarters reached');
await shot('fcsle');
await clearRoom('crew’s quarters');
log('crew’s quarters clear, hp', (await info()).hp);

// A bottle of rum in the lockers (healing for the fight in tank No.2).
await expect(await T('path', [[2.0, -3.1], [-2.1, -2.85]], 0.25), 'walk to the lockers');
await T('face', -2.1, -3.7);
await T('act');
await waitIdle();
await expect((await info()).inv.includes('rum'), 'got the rum');

// Knock on both chain-locker doors: one only echoes, the other answers.
const lockerX = (side) => (side === 'port' ? -1.3 : 1.3);
const lockerMenu = async (side, label) => {
  // Round the mess table on the port side, then forward to the door.
  const s0 = await info();
  if (s0.z < 0.5) await expect(await T('path', [[-2.0, 0.5]], 0.3), 'past the mess table');
  await expect(await T('drive', lockerX(side), 5.05, 0.2), `walk to the ${side} chain locker`);
  await T('face', lockerX(side), 6.2);
  await T('act');
  for (let i = 0; i < 20 && (await page.locator('#hud .msg .choices .btn').count()) === 0; i++) await page.waitForTimeout(100);
  const btn = page.locator('#hud .msg .choices .btn', { hasText: label }).first();
  if (!(await btn.isVisible())) await fail(`no choice "${label}" offered`);
  await btn.click();
  return T('skip', 600);
};
const mimicSide = pellSide === 'port' ? 'stbd' : 'port';
let heard = await lockerMenu(mimicSide, '(SOS)');
log('knock on the', mimicSide, 'locker:', heard.slice(-1)[0]);
await expect(heard.some((l) => l.includes('그대로다')), 'the thing echoes the knock');
heard = await lockerMenu(pellSide, '(SOS)');
log('knock on the', pellSide, 'locker:', heard.slice(-1)[0]);
await expect(heard.some((l) => l.includes('내가 친 신호가 아니다')), 'the operator answers instead of echoing');
await expect((await info()).flags[`a2.knock.${pellSide}`] === 2 && (await info()).flags[`a2.knock.${mimicSide}`] === 1, 'knocks recorded');
heard = await lockerMenu(pellSide, '빗장');
await waitIdle();
s = await info();
await expect(s.flags.pellFreed === true && s.inv.includes('testKey'), 'freed Pell, got the testing-room key');
log('Pell freed:', heard.find((l) => l.includes('펠이오')) ? 'introduced himself' : '?');
await shot('pell');

// ------------------------------------------------------------------ Testing room: the Wheatstone bridge
await go([[2.2, 0.5], [2.6, -1.0], [3.7, -1.6], [3.65, -3.0]], 3.6, -4.0, 'deck', 'up the ladder to the deck');
await clearRoom('fore deck');
await deckToCorridor([[3.4, 5.0]]);
await clearRoom('corridor');
await expect(await T('path', [[-6.0, 0.2], [-2.6, -0.15]], 0.2), 'walk to the testing-room door');
await T('face', -2.6, -1.0);
await useItem('시험실 열쇠');
await waitIdle();
await expect((await flag('testUnlocked')) === true, 'testing room unlocked with Pell’s key');
await T('act');
await arrive('testroom');
log('testing room reached');
await shot('testroom');
await expect(await T('drive', -0.2, 2.3, 0.2), 'walk to the bridge');
await T('face', -0.35, 3.1);
await T('act');
await T('skip');
await page.waitForSelector('#modal .galvo-scale', { timeout: 6000 });

// Set the bridge for one cable end and record a balance (the test driver knows the true resistance; it
// still has to work the real dials, ratio arms and shunt).
const truth = (side) =>
  page.evaluate((side) => {
    const g = window.__btk.game;
    const f = g.state.flags;
    const climbing = (f['a2.thingStbd'] ? 'stbd' : 'port') === side;
    const nm = climbing ? Math.max(0.3, 2.1 - 0.00015 * Math.max(0, g.playTime - f['a2.t0'])) : 1037;
    return 3.9 * nm;
  }, side);
const panelText = (sel) => page.locator(`#modal ${sel}`).first().innerText();
const cycleTo = async (btnText, want) => {
  for (let i = 0; i < 5; i++) {
    const b = page.locator('#modal .btn', { hasText: btnText }).first();
    if ((await b.innerText()).includes(want)) return;
    await b.click();
  }
  await fail(`could not set ${btnText} to ${want}`);
};
const measure = async (side) => {
  await page.locator('#modal .btn', { hasText: side === 'port' ? 'B · 좌현' : 'C · 우현' }).first().click();
  for (let attempt = 0; attempt < 4; attempt++) {
    const t = await truth(side);
    const ratio = t / 0.01 <= 9999.5 ? 0.01 : t / 0.1 <= 9999.5 ? 0.1 : 1;
    await cycleTo('비율 팔', `(×${ratio})`);
    // Coarse balance with the heaviest shunt in, then the shunt out for the last figure.
    await cycleTo('분류기', '1/999');
    const want = String(Math.round(t / ratio)).padStart(4, '0').split('').map(Number);
    for (let i = 0; i < 4; i++) {
      const cur = Number(await page.locator('#modal .dial .val').nth(i).textContent());
      const up = page.locator('#modal .dial').nth(i).locator('.btn').first();
      for (let k = 0; k < (want[i] - cur + 10) % 10; k++) await up.click({ delay: 0 });
    }
    await cycleTo('분류기', '없음');
    await page.locator('#modal .btn', { hasText: '측정 기록' }).first().click();
    await page.waitForTimeout(150);
    const out = await panelText('.log');
    if (out.includes('균형')) return out;
    log('  (re-balancing:', out.split('\n')[0], ')');
  }
  await fail(`no balance on ${side}`);
};
const otherSide = thingSide === 'port' ? 'stbd' : 'port';
let rec = await measure(thingSide);
log(`${thingSide} end:`, rec.split('\n')[0]);
await expect(rec.includes('고장점까지') && rec.includes('해리'), 'dead earth a couple of miles out on the thing’s cable');
rec = await measure(otherSide);
log(`${otherSide} end:`, rec.split('\n')[0]);
await expect(rec.includes('육지국'), 'the other end runs sound to the shore station');
await expect((await flag('a2.measured')) !== true, 'one reading of each end is not enough');
await shot('bridge-panel');
log('waiting for the fault to move...');
await page.waitForTimeout(40000);
rec = await measure(thingSide);
log(`${thingSide} end again:`, rec.split('\n').slice(0, 2).join(' / '));
await expect(rec.includes('줄었다'), 'the fault has moved towards the ship');
await expect((await flag('a2.measured')) === true, 'measurement concluded');
await expect(rec.includes(`${KO[thingSide]} 케이블을 타고`), 'the panel names the right cable');
await clickBtn('물러나기');
const concl = await T('skip', 200);
await expect(concl.some((l) => l.includes(`${KO[thingSide]} 드럼을 놓아`)), 'conclusion narrated');
await waitIdle();
log('bridge done; records:', (await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(window.__btk.info().flags).filter(([k]) => k.startsWith('a2.rec')))))));

// ------------------------------------------------------------------ Engine room: pump out tank No.2
await go([[0, 0.8]], 0, 0, 'corridor', 'out of the testing room');
await clearRoom('corridor');
await corridorToEngine([[-2.6, 0.1]]);
await clearRoom('engine room');
await expect(await T('path', [[3.3, -5.0], [1.6, -5.9], [-3.0, -5.95]], 0.25), 'walk to the valve chest');
await T('face', -3.4, -7.0);
await T('act');
await T('skip');
await page.waitForSelector('#modal .tank-level', { timeout: 6000 });
await shot('valves');
// As found: sea suction and tank No.2 suction open — the sea runs into the tank. Shut the sea, open
// overboard, start the pump.
await clickBtn('① 해수 흡입');
await clickBtn('⑤ 선외 배출');
await clickBtn('잡용 펌프');
await page.waitForFunction(() => window.__btk.info().flags.tank2Drained === true, null, { timeout: 45000 });
log('tank No.2 drained');
await clickBtn('물러나기');
await waitIdle();

// ------------------------------------------------------------------ Tank No.2: the master, the brake key
await go([[-5.9, -3.2]], -7, -3.5, 'hold', 'through the watertight door');
await clearRoom('hold');
await expect(await T('path', [[6.6, 3.5], [5.0, 5.6], [2.0, 6.35]], 0.25), 'walk round the tank to the No.2 door');
await T('face', 2.0, 7.5);
await T('act');
await waitIdle();
await expect((await flag('tank2Open')) === true, 'tank No.2 door opened');
await T('act');
await arrive('tank2');
log('tank No.2 reached');
await shot('tank2');
await expect(await T('drive', 2.6, -0.7, 0.3), 'approach the cone');
await page.waitForFunction(() => window.__btk.info().creatures.some((c) => c.id === 'a2captain'), null, { timeout: 5000 });
log('the master rises');
await shot('captain');
await expect(await fight(90000), 'put the drowned master down');
s = await info();
log('master down, hp', s.hp);
await expect(await T('drive', 1.75, -1.15, 0.2), 'walk to the cone ladder');
await T('face', 0.45, -0.85);
await T('act');
for (let i = 0; i < 40 && (await page.locator('#modal .doc').count()) === 0; i++) {
  if (await page.evaluate(() => window.__t.msgOpen())) await T('press', 'action');
  await page.waitForTimeout(150);
}
await page.waitForSelector('#modal .doc', { timeout: 8000 });
await shot('hale-letter');
await closeDoc();
await waitIdle();
await expect((await info()).inv.includes('brakeKey'), 'got the brake key');
log('brake key found');

// ------------------------------------------------------------------ The fore deck: let the cable go
await go([[4.2, 0]], 5.2, 0, 'hold', 'up the ladder');
await go([[5.0, 5.6], [6.6, 3.5], [6.6, -2.4], [6.8, -3.4]], 7.5, -3.5, 'engine', 'back to the engine room');
await engineToCorridor([[-5.9, -3.2]]);
await clearRoom('corridor');
await corridorToDeck([[7.5, -0.4]]);
await clearRoom('fore deck');
await expect(await T('path', [[2.5, -9.0], [3.4, -3.0], [3.4, 3.0], [1.4, 4.9], [0, 5.05]], 0.2), 'walk to the cable engine');
await T('face', 0, 7);
await T('act');
await T('skip');
await page.waitForSelector('#modal .btn:has-text("고정핀 자물쇠 열기")', { timeout: 6000 });
await shot('cable-panel');
await clickBtn('고정핀 자물쇠 열기');
// The wrong order first: brake off with the drum still in gear drags the engine round.
await clickBtn(`${KO[thingSide]} 브레이크 풀기`);
await expect((await panelText('.log')).includes('끌려 돈다'), 'brake before clutch drags the engine');
await clickBtn(`${KO[thingSide]} 클러치`);
await clickBtn(`${KO[thingSide]} 브레이크 풀기`);
await page.waitForFunction(() => window.__btk.info().flags.cableFreed === true, null, { timeout: 15000 });
log('cable let go on the', thingSide, 'side');
await shot('cable-gone');
// Dawn: the SOS went out in the first act, so the Magnus's boat is coming. Fetch Pell, then down the
// Jacob's ladder.
for (let i = 0; i < 80 && (await info()).flags.dawn !== true; i++) await T('skip', 3);
await waitIdle();
await expect((await flag('dawn')) === true, 'dawn comes once the cable is free and the SOS sent');
await go([[1.4, 4.9], [3.0, 5.7]], 3.0, 7.4, 'fcsle', 'down the scuttle for Pell');
await expect(await T('path', [[3.65, -3.0], [3.7, -1.6], [2.6, -1.0], [2.2, 0.5], [lockerX(pellSide), 5.05]], 0.25), 'to Pell');
await T('face', lockerX(pellSide), 6.2);
await T('act');
await waitIdle();
await expect((await flag('pellCarried')) === true, 'Pell carried');
log('Pell on my back');
await go([[2.2, 0.5], [2.6, -1.0], [3.7, -1.6], [3.65, -3.0]], 3.6, -4.0, 'deck', 'up to the deck with Pell');
await expect(await T('path', [[1.5, 4.6], [-1.5, 4.6], [-3.5, 3.0], [-4.8, -1.2]], 0.25), 'to the Jacob’s ladder');
await T('face', -6.0, -1.2);
await T('act');
// Down the ladder: the second act ends (the interlude), and the third begins at Bell Cove.
for (let i = 0; i < 60 && (await info()).mode === 'play' && (await info()).room === 'deck'; i++) await T('skip', 3);
await page.waitForSelector('#modal .story', { timeout: 10000 });
await shot('interlude');
const interlude = await page.locator('#modal .story').innerText();
await expect(interlude.includes('2막 끝') && interlude.includes('케이블국'), 'the interlude closes the second act (Pell went to a cable station)');
await playAct3(true);
await finish();

// ------------------------------------------------------------------ Act III: Landfall
async function playAct3(pell) {
  // The interlude and the act's opening are story screens: page through them.
  for (let i = 0; i < 120; i++) {
    const st = await info();
    if (st.mode === 'play' && st.room === 'station') break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await waitIdle();
  let st = await info();
  await expect(st.room === 'station' && st.flags.act3 === true && st.flags['a3.pell'] === pell, 'the third act begins at Bell Cove');
  await expect(st.inv.join() === 'lantern,telegram' && st.hp === 6 && !st.flags.act2, 'a fresh start: lantern, telegram, full health, the ship left behind');
  log(`ACT III (${pell ? 'with Pell' : 'alone'}): store combination ${String(st.flags['a3.combo']).padStart(3, '0')}`);
  await shot('act3-yard');

  // ---- the yard: the splitting axe on the chopping block
  await actAt([[-1, -4.0], [-3.3, 2.7]], -3.3, 3.6, 'walk to the chopping block');
  await waitIdle();
  await expect((await info()).inv.includes('woodAxe'), 'took the wood axe');
  await page.evaluate(() => window.__btk.game.equip('woodAxe'));
  await go3([[-1.5, 3.6], [0, 4.6]], 0, 6, 'opsroom', 'into the station house');
  log('operating room');
  await shot('act3-opsroom');

  // ---- operating room: the diary, the code card, the candle and the rum
  await actAt([[-0.5, 2.0], [-3.3, 3.9]], -4.25, 3.2, 'walk to the desk');
  await page.waitForSelector('#modal .doc', { timeout: 6000 });
  await closeDoc();
  await waitIdle();
  await actAt([[-1.6, 5.15]], -1.6, 6.05, 'walk to the code card');
  await page.waitForSelector('#modal .doc', { timeout: 6000 });
  await closeDoc();
  await waitIdle();
  await actAt([[1.5, 3.2], [3.85, 2.5]], 4.7, 2.25, 'walk to the stove shelf');
  await waitIdle();
  await T('face', 4.7, 2.8);
  await T('act');
  await waitIdle();
  st = await info();
  await expect(['stationDiary', 'codeCard', 'candle', 'rum3'].every((i) => st.inv.includes(i)), 'diary, code card, candle and rum taken');

  // ---- the recorder: read the night tape with the card, and read it the right way up
  await actAt([[0.6, 4.35]], 0.6, 5.45, 'walk to the recorder');
  await openedPanel('canvas.tape-strip');
  await clickBtn('판독 메모');
  const tapeLog = await page.locator('#modal .log').first().innerText();
  const m = tapeLog.match(/카드대로 읽으면: \S+ \S+ (\d)(\d)(\d)/);
  await expect(!!m && tapeLog.includes('부호표에 없는 글자'), `the clerk's literal reading shows a reversed message: ${tapeLog.split('\n')[0]}`);
  const literal = [Number(m[1]), Number(m[2]), Number(m[3])];
  const combo = literal.map((d) => (d + 5) % 10);
  log('tape reads', literal.join(''), '-> reversed back', combo.join(''));
  await expect(combo.join('') === String((await info()).flags['a3.combo']).padStart(3, '0'), 'reading the echo the other way up gives the store number');
  await shot('act3-tape');
  await clickBtn('물러나기');
  await T('skip', 40);
  await page.waitForFunction(() => window.__btk.info().creatures.some((c) => c.id === 'a3clerk'), null, { timeout: 6000 });
  await clear3('the night clerk');
  log('clerk down, hp', (await info()).hp);

  // ---- the battery-room door
  await actAt([[2.6, 3.8], [3.85, 4.5]], 5, 4.5, 'walk to the battery-room door');
  if (pell) {
    const heard = await choose('K를 친다');
    await expect(heard.some((l) => l.includes('따라 쳤다')), 'copying his knock gets no answer');
    await T('act');
    await choose('R로 답한다');
    await arrive3('battery');
    await waitIdle();
    await expect((await info()).flags['a3.pellMet'] === true, 'Pell lets me in and tells what happened');
  } else {
    const heard = await choose('R로 답한다');
    await expect(heard.some((l) => l.includes('내가 친 그대로')), 'whatever is behind the door copies the knock');
    await T('act');
    await choose('문을 연다');
    await clear3('the thing behind the door');
    await go3([[3.0, 3.6], [3.85, 4.5]], 5, 4.5, 'battery', 'through the open door');
  }
  log('battery room');
  await shot('act3-battery');

  // ---- hydrometer and battery book
  await actAt([[-1.0, 3.6], [2.85, 1.3]], 2.85, 0.45, 'walk to the hydrometer');
  await waitIdle();
  await actAt([[3.35, 1.3]], 3.35, 0.5, 'walk to the battery book');
  await page.waitForSelector('#modal .doc', { timeout: 6000 });
  await closeDoc();
  await waitIdle();
  st = await info();
  await expect(['hydrometer', 'batteryLog'].every((i) => st.inv.includes(i)), 'hydrometer and battery book taken');
  if (!pell) {
    // Alone, the night operator's flask is left on his crate.
    await actAt([[1.95, 1.75]], 1.95, 1.0, 'walk to the crate');
    await waitIdle();
    await expect((await info()).inv.includes('brandy3'), 'took the flask');
  }

  // ---- the rack: measure every cell, string the twelve charged ones
  await actAt([[2.65, 3.0]], 3.55, 3.0, 'walk to the rack');
  await openedPanel('.rack-grid');
  const dom = (i) => (i >= 8 ? i - 8 : i + 8);
  const sgs = [];
  for (let i = 0; i < 16; i++) {
    await page.locator('#modal .rack-grid .cell').nth(dom(i)).click();
    await clickBtn('비중 재기');
    sgs.push(Number(await page.locator('#modal .rack-grid .cell').nth(dom(i)).locator('.sg').innerText()));
  }
  const good = sgs.map((v, i) => (v >= 1.25 ? i : -1)).filter((i) => i >= 0);
  log('specific gravities', sgs.map((v) => v.toFixed(3)).join(' '));
  await expect(good.length === 12, 'twelve cells read as charged');
  // A weak cell first, to see it counted (then taken out again).
  const weak = sgs.findIndex((v) => v < 1.25);
  for (const i of [weak, ...good.slice(0, 11)]) {
    await page.locator('#modal .rack-grid .cell').nth(dom(i)).click();
    await clickBtn('셀 넣기');
  }
  await expect((await info()).flags['a3.cells'] > 0, 'cells strapped in');
  await page.locator('#modal .rack-grid .cell').nth(dom(weak)).click();
  await clickBtn('셀 빼기');
  await page.locator('#modal .rack-grid .cell').nth(dom(good[11])).click();
  await clickBtn('셀 넣기');
  await expect((await page.locator('#modal .rack-status').innerText()).startsWith('직렬 12 / 12'), 'twelve in series');
  await shot('act3-rack');
  await clickBtn('물러나기');
  await waitIdle();

  // ---- the store: the echo's number first (it fails), then the number that was sent
  await actAt([[0.5, 4.3], [-2.65, 4.85]], -3.63, 4.85, 'walk to the store');
  await openedPanel('.dials');
  const setDials = async (digits) => {
    for (let k = 0; k < 3; k++) {
      const cur = Number(await page.locator('#modal .dial .val').nth(k).textContent());
      const up = page.locator('#modal .dial').nth(k).locator('.btn').first();
      for (let n = 0; n < (digits[k] - cur + 10) % 10; n++) await up.click({ delay: 0 });
    }
  };
  await setDials(literal);
  await clickBtn('당겨 보기');
  await expect((await page.locator('#modal .log').first().innerText()).includes('그대로인데'), 'the number as the tape reads it does not open the store');
  await setDials(combo);
  await clickBtn('당겨 보기');
  await T('skip', 80);
  await waitIdle();
  await expect((await info()).inv.includes('swHandle') && (await info()).flags['a3.storeOpen'] === true, 'store open, switch handle taken');

  // ---- the switchboard: condenser out, bridge on; measure; then clear the line for the coil
  const board = async (labels) => {
    await actAt([[-0.8, 4.95]], -0.8, 5.9, 'walk to the switchboard');
    await openedPanel('.switch-list');
    for (const l of labels) await clickBtn(l);
    await clickBtn('물러나기');
    await waitIdle();
  };
  await board(['② 신호 축전기', '④ 시험']);
  await expect((await info()).flags['a3.handle'] === true && (await info()).flags['sw.condenser'] === false && (await info()).flags['sw.bridge'] === true, 'handle fitted; condenser bypassed, bridge on');
  await actAt([[-0.6, 3.9], [-1.4, 1.35]], -1.4, 0.45, 'walk to the bridge');
  await openedPanel('.galvo-scale');
  const truth3 = () =>
    page.evaluate(() => {
      const g = window.__btk.game;
      return 3.9 * Math.max(0.12, 0.34 - 0.00008 * Math.max(0, g.playTime - g.state.flags['a3.t0']));
    });
  const cycle3 = async (btnText, want) => {
    for (let i = 0; i < 5; i++) {
      const b = page.locator('#modal .btn', { hasText: btnText }).first();
      if ((await b.innerText()).includes(want)) return;
      await b.click();
    }
    await fail(`could not set ${btnText} to ${want}`);
  };
  let rec = '';
  for (let attempt = 0; attempt < 4 && !rec.includes('균형'); attempt++) {
    await cycle3('비율 팔', '(×0.01)');
    await cycle3('분류기', '1/999');
    const t = await truth3();
    const want = String(Math.round(t / 0.01)).padStart(4, '0').split('').map(Number);
    for (let i = 0; i < 4; i++) {
      const cur = Number(await page.locator('#modal .dial .val').nth(i).textContent());
      const up = page.locator('#modal .dial').nth(i).locator('.btn').first();
      for (let k = 0; k < (want[i] - cur + 10) % 10; k++) await up.click({ delay: 0 });
    }
    await cycle3('분류기', '없음');
    await clickBtn('측정 기록');
    rec = await page.locator('#modal .log').first().innerText();
  }
  log('bridge:', rec.split('\n')[0]);
  await expect(rec.includes('균형') && rec.includes('해안 구간'), 'the fault is in the shore section, off the hut');
  await shot('act3-bridge');
  await clickBtn('물러나기');
  await T('skip', 60);
  await waitIdle();
  await board(['④ 시험', '① 송수신', '③ 피뢰기', '⑤ 고압']);
  st = await info();
  await expect(!st.flags['sw.recorder'] && !st.flags['sw.condenser'] && !st.flags['sw.protector'] && !st.flags['sw.bridge'] && st.flags['sw.coil'] === true, 'the line clear, the coil on it');

  const toBeach = async () => {
    // Round the coil's trolley (west of it), then out of the door.
    await go3([[-0.9, 1.75], [-1.0, 3.6], [-3.3, 3.0]], -4.5, 3.0, 'opsroom', 'back to the operating room');
    await clear3('operating room');
    await go3([[3.0, 3.0], [0, 1.2], [0, 0.85]], 0, -0.5, 'station', 'out to the yard');
  };
  if (pell) {
    await actAt([[2.4, 1.85]], 1.95, 1.0, 'walk to Pell');
    await waitIdle();
    await expect((await info()).flags['a3.pellReady'] === true, 'Pell checks the board and sits at the coil');
    await toBeach();
    await clear3('the yard');
  } else {
    // Clear the yard first, then come back and light the candle.
    await toBeach();
    await clear3('the yard');
    await go3([[0, 4.6]], 0, 6, 'opsroom', 'back in');
    await go3([[2.6, 3.8], [3.85, 4.5]], 5, 4.5, 'battery', 'back to the battery room');
    await actAt([[0.6, 1.55]], 0.6, 2.6, 'walk to the coil');
    await openedPanel('.coil-status');
    await clickBtn('양초 타이머 세우기');
    await clickBtn('물러나기');
    await T('skip', 40);
    await waitIdle();
    await expect((await info()).flags['a3.timerAt'] > 0, 'the candle is burning under the cord');
    log('candle lit');
    await toBeach();
  }
  log('yard clear, hp', (await info()).hp);
  await go3([[3.0, 2.4], [8.6, -1.0]], 10, -1.0, 'beach', 'down to the beach');
  st = await info();
  await expect(pell ? st.flags['a3.pellReady'] === true : st.flags['a3.timerAt'] > 0, `still armed on reaching the beach (candle ${st.flags['a3.timerAt']})`);
  const up = await page
    .waitForFunction(() => window.__btk.info().creatures.some((c) => c.id === 'a3limb') || window.__btk.info().mode === 'ending', null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  await expect(up, 'the limb comes up when I reach the beach armed');
  log('the limb comes up at the hut', pell ? '' : `(candle: ${Math.max(0, (await info()).flags['a3.timerAt'] - (await page.evaluate(() => window.__btk.game.playTime))).toFixed(0)} s left)`);
  await page.waitForTimeout(2500);
  await shot('act3-limb');
  // The drowned come up out of the surf; meet them well away from the limb.
  if ((await info()).mode === 'play') {
    await T('skip', 40);
    await expect(await T('drive', -4.0, 0.5, 0.3), 'stand off from the limb');
    for (let i = 0; i < 40 && (await info()).creatures.filter((c) => c.id.startsWith('a3beach') && c.state !== 'gone').length < 2 && (await info()).mode === 'play'; i++) await page.waitForTimeout(400);
  }
  if ((await info()).mode === 'play') await clear3('the beach');
  if (pell) {
    // Round the hut to its doorway (the limb's reach covers the last steps), in, and key R.
    await expect(await T('path', [[-0.5, 2.4], [-0.45, 4.35], [2.0, 4.45], [2.0, 3.2], [2.55, 2.65]], 0.25), 'into the cable hut');
    await T('face', 3.1, 2.95);
    await T('act');
    await openedPanel('.hut-log');
    const key = async (code) => {
      // The key is held off while signals come back down the line.
      await page.waitForSelector('#modal .hut-status[data-busy="0"]', { timeout: 15000 });
      for (const c of code) await clickBtn(c === '.' ? '· 단점' : '− 장점');
      await clickBtn('보내기');
    };
    await key('.-.');
    await page.waitForFunction(() => (document.querySelector('#modal .hut-log')?.textContent.match(/회선: K/g) ?? []).length >= 2, null, { timeout: 15000 });
    log('R sent: heard', (await page.locator('#modal .hut-log').innerText()).split('\n').filter((l) => l.startsWith('회선')).join(' / '));
    await shot('act3-hutkey');
    await key('.-.');
  }
  for (let i = 0; i < 240 && (await info()).mode === 'play'; i++) {
    if (!pell && (await info()).creatures.some((c) => c.id !== 'a3limb' && c.state !== 'gone' && c.state !== 'dying')) await fight(4000);
    await T('skip', 3);
    await page.waitForTimeout(250);
  }
  st = await info();
  await expect(st.mode === 'ending' && st.flags['a3.done'] === true, 'the discharge reached the thing: the act ends');
  // The third act's closing screen; the fourth act follows it.
  await page.waitForSelector('#modal .story', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await shot('act3-ending');
  const endText = await page.locator('#modal .story').innerText();
  await expect(endText.includes('3막 끝') && endText.includes(pell ? 'BELL COVE RESUMES' : '세 번, 쉬고, 세 번'), 'the third act ending shown');
  log('ACT III ENDING reached. hp', st.hp, 'deaths', (await page.evaluate(() => window.__btk.state().deaths)));
  await playAct4(pell);
}

// ------------------------------------------------------------------ Act IV: The Grapnel
async function playAct4(pell) {
  // The third act's closing screen and the fourth act's opening are story screens: page through them.
  for (let i = 0; i < 160; i++) {
    const st = await info();
    if (st.mode === 'play' && st.room === 'sbdeck') break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  await waitIdle();
  let st = await info();
  await expect(st.room === 'sbdeck' && st.flags.act4 === true && st.flags['a4.pell'] === pell, 'the fourth act begins on the St Brendan');
  await expect(st.inv.join() === `lantern,workOrder,${pell ? 'pellLetter' : 'bcWire'}` && st.hp === 6 && !st.flags.act3, 'a fresh start: lantern, the work order and word from Bell Cove');
  log(`ACT IV (${pell ? 'Pell at Bell Cove' : 'alone'})`);
  await shot('act4-deck');

  // ---- the ship's axe from the fire cabinet, then the bosun at the dynamometer
  await actAt([[-0.9, -7.75]], -0.9, -8.9, 'walk to the fire cabinet');
  await waitIdle();
  await expect((await info()).inv.includes('shipAxe'), 'took the ship’s axe');
  await page.evaluate(() => window.__btk.game.equip('shipAxe'));
  await actAt([[-2.4, -1.6], [-2.4, 5.4], [2.3, 5.5]], 1.5, 6.5, 'walk to the bosun');
  for (let i = 0; i < 80 && (await page.locator('#modal .doc').count()) === 0; i++) {
    if (await page.evaluate(() => window.__t.msgOpen())) await T('press', 'action');
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('#modal .doc', { timeout: 5000 });
  await closeDoc();
  await waitIdle();
  await expect((await info()).inv.includes('grappleCard'), 'the bosun hands over his grappling rules');

  // ---- the wheelhouse: the run laid off on the chart, current and all
  await go3([[2.4, 2.0], [2.4, -4.0], [4.8, -7.6]], 4.8, -9, 'sbbridge', 'up the ladder to the wheelhouse');
  await actAt([[1.0, 0.35]], 0, 0.85, 'walk to the captain');
  await waitIdle();
  await expect((await info()).flags['a4.captainMet'] === true, 'the captain explains the job');
  await actAt([[-1.5, -0.3], [-3.75, -0.45]], -3.75, -1.9, 'walk to the chart table');
  await openedPanel('canvas.chart-plot');
  const chartRead = async () => page.locator('#modal .coil-status').innerText();
  let chart = await chartRead();
  await expect(chart.includes('침로 (뱃머리): 334°') && !/이루는 각: (8[4-9]|9\d)°/.test(chart), `square on the chart is not square over the ground: ${chart.split('\n').slice(2).join(' / ')}`);
  for (let i = 0; i < 6; i++) await clickBtn('−5°');
  chart = await chartRead();
  log('run laid off:', chart.split('\n').join(' / '));
  await expect(/실제 항적: 3[23]\d°/.test(chart) && /이루는 각: (8[4-9]|9\d)°/.test(chart), 'heading 304: the track made good crosses the cable square');
  await shot('act4-chart');
  await clickBtn('이 침로로 끈다');
  await waitIdle();
  st = await info();
  await expect(st.flags['a4.runSet'] === true && st.flags['a4.heading'] === 304, 'the run is set: 304°');
  await go3([[2.5, 0.2], [4.15, 0.6]], 5, 0.6, 'sbdeck', 'down to the deck');

  // ---- the dynamometer: let the rocks go by, stop once the cable has lifted off the bottom
  await actAt([[2.4, -4.0], [2.4, 5.4], [0.25, 5.95]], 0, 7.4, 'walk to the dynamometer');
  await openedPanel('canvas.strain-plot');
  await shot('act4-grapple');
  let above = 0;
  let peak = 0;
  for (let i = 0; i < 1400; i++) {
    const txt = await page.locator('#modal .bridge-read').first().innerText().catch(() => '');
    const m = txt.match(/장력 ([\d.]+)톤/);
    if (!m) break;
    const v = Number(m[1]);
    peak = Math.max(peak, v);
    above = v >= 4.5 ? above + 1 : 0;
    // A rock's spike is gone in a second; the cable holds the needle up.
    if (above >= 20) {
      log('stop the engines at', v, 't (peak so far', peak, 't)');
      await clickBtn('기관 정지');
      break;
    }
    await page.waitForTimeout(100);
  }
  await T('skip', 80);
  await waitIdle();
  st = await info();
  await expect(st.flags['a4.hooked'] === true, `the cable is in the grapnel (attempt ${st.flags['a4.attempt']})`);

  // ---- heave up: ease off as the bow lifts
  await actAt([[2.4, 5.4], [2.4, 1.8], [0.9, 1.8]], 0, 2.6, 'walk to the picking-up gear');
  await openedPanel('canvas.heave-plot');
  const heaveAt = async () => page.evaluate(() => {
    const c = document.querySelector('#modal canvas.heave-plot');
    return c ? { t: Number(c.dataset.t ?? 0), p: Number(c.dataset.p ?? 0) } : null;
  });
  const tension = (v, t, p) => 4.2 * (1 - 0.35 * Math.min(1, p)) + 1.2 * Math.max(0, Math.sin((2 * Math.PI * t) / 7)) + 0.8 * v;
  let cur = -1;
  for (let i = 0; i < 2400; i++) {
    const h = await heaveAt();
    if (!h) break;
    let want = 0;
    for (const v of [2, 1]) {
      let ok = true;
      for (let a = 0; a <= 0.6; a += 0.1) if (tension(v, h.t + a, h.p) > 6.0) ok = false;
      if (ok) {
        want = v;
        break;
      }
    }
    if (want !== cur) {
      await page.locator('#modal .btn', { hasText: ['정지', '천천히', '반속'][want] }).first().click();
      cur = want;
    }
    if (i === 60) await shot('act4-heave');
    await page.waitForTimeout(60);
  }
  await T('skip', 80);
  await waitIdle();
  await expect((await info()).flags['a4.raised'] === true, 'the bight comes up over the bow without parting');

  // ---- cut it; the two ends go to the testing room
  await actAt([[2.4, 2.0], [2.4, 8.6], [0.4, 10.1]], 0, 11.2, 'walk to the bow sheaves');
  await choose('자르라고 한다');
  await waitIdle();
  await expect((await info()).flags['a4.cut'] === true, 'the bight is cut');
  await go3([[2.4, 8.6], [2.4, 5.4], [-2.4, 5.4], [-2.4, -1.6], [-3.4, -7.6]], -3.4, -9, 'sbtest', 'to the testing room');
  await waitIdle();
  await actAt([[-1.6, 1.25]], -2.1, 1.25, 'walk to the desk');
  await waitIdle();
  await expect((await info()).inv.includes('brandy4'), 'took the flask from the desk');

  // ---- the ends: resistance and a call down each, then the good one on the buoy
  await actAt([[0.6, 2.0]], 0.6, 3.5, 'walk to the bench');
  await openedPanel('.ends-grid');
  const idle = () => page.waitForSelector('#modal .hut-status[data-busy="0"]', { timeout: 30000 });
  const col = (i) => page.locator('#modal .ends-grid .cell').nth(i);
  const ohms = [];
  for (const i of [0, 1]) {
    await col(i).click();
    await clickBtn('저항 재기');
    await idle();
    ohms.push(Number((await col(i).innerText()).match(/([\d,.]+) Ω/)[1].replace(/,/g, '')));
  }
  const goodI = ohms[0] > ohms[1] ? 0 : 1;
  const badI = 1 - goodI;
  log('ends:', ohms.map((o, i) => `${'AB'[i]} ${o} Ω`).join(', '), '-> Bell Cove is', 'AB'[goodI]);
  await expect(Math.abs(ohms[goodI] - 3.9 * 1035.4) < 2 && Math.abs(ohms[badI] - 3.9 * 0.8) < 0.1, 'one end runs a thousand miles to Bell Cove, the other earths at the fault');
  for (const i of [badI, goodI]) {
    await col(i).click();
    await clickBtn('BC 부르기');
    await idle();
  }
  const replies = [await col(0).innerText(), await col(1).innerText()];
  log('replies:', replies.map((r) => r.split('\n').pop()).join(' | '));
  await expect(replies[goodI].includes(pell ? '응답: R TP' : '응답: R BC') && replies[badI].includes('응답: J? R'), 'Bell Cove answers on its end; the other sends the call back reversed, and R');
  await shot('act4-ends');
  await col(badI).click();
  await clickBtn('이 끝을 부표에');
  await expect((await page.locator('#modal .hut-log').innerText()).includes('고장 난 끝이오'), 'Ross will not buoy the bad end');
  await col(goodI).click();
  await clickBtn('이 끝을 부표에');
  await T('skip', 80);
  await waitIdle();
  st = await info();
  await expect(st.flags['a4.buoyed'] === true && st.flags['a4.buoyEnd'] === goodI + 1, 'the Bell Cove end is on the buoy');

  // ---- pick up the bad end: the root comes up with it
  await go3([[0, 1.2], [0, 0.85]], 0, -0.5, 'sbdeck', 'back out on deck');
  await actAt([[-2.4, -4.0], [-2.4, 1.8], [-0.9, 1.8]], 0, 2.6, 'walk to the picking-up gear');
  await T('skip', 200);
  for (let i = 0; i < 40 && (await info()).flags['a4.rootUp'] !== true; i++) await T('skip', 20);
  await waitIdle();
  await expect((await info()).flags['a4.rootUp'] === true, 'the root comes up over the bow');
  await page.waitForTimeout(2500);
  await shot('act4-root');
  await clear3('the drowned on deck');
  log('deck clear, hp', (await info()).hp);

  // ---- cut the heart out. The limbs reach the spot you cut from, not the step aft of it: step in to make
  // them rear back, step out while they slam the deck, then go in and cut while they recover.
  const OUT = 8.3;
  const IN = 8.95;
  await expect(await T('path', [[2.4, 2.0], [2.4, 5.4], [0.9, 7.95], [0, OUT]], 0.2), 'up to the root');
  for (let i = 0; i < 1500 && (await info()).flags['got:heart'] !== true; i++) {
    st = await info();
    if (st.mode !== 'play') break;
    if (st.hp <= 3 && st.inv.includes('brandy4')) {
      await page.evaluate(() => void window.__btk.game.useItem('brandy4'));
      await T('skip');
      continue;
    }
    const limbs = st.creatures.filter((c) => c.id.startsWith('a4limb') && c.state !== 'gone');
    const rearing = limbs.some((c) => c.state === 'windup' || c.state === 'strike');
    // Just after a blow: neither can rear back again for a couple of seconds.
    const safe = limbs.every((c) => (c.state === 'recover' && c.t < 0.6) || (c.state === 'hunt' && c.t < 0.3));
    // Both waiting to strike: stepping in now makes them rear back together (and so recover together).
    const ready = limbs.every((c) => c.state === 'hunt' && c.t > 1.5);
    if (rearing) await T('drive', 0, OUT, 0.1, 900, false);
    else if (safe) {
      await T('drive', 0, IN, 0.1, 600, false);
      await T('face', 0, 10.4, 400);
      await T('press', 'attack');
      await page.waitForTimeout(950);
      await T('skip', 6);
      await T('drive', 0, OUT, 0.1, 900, false);
    } else if (ready) await T('drive', 0, IN, 0.1, 600, false);
    else if (st.z > OUT + 0.1) await T('drive', 0, OUT, 0.1, 900, false);
    else await page.waitForTimeout(40);
  }
  await waitIdle();
  st = await info();
  await expect(st.flags['got:heart'] === true && st.inv.includes('heart'), `the heart is cut out (hp ${st.hp})`);
  log('heart out, hp', st.hp);

  // ---- into the fire
  await go3([[0.9, 8.3], [2.4, 5.4], [2.4, -4.0], [2.2, -7.6]], 2.2, -9, 'sbstoke', 'down to the stokehold');
  await actAt([[2.4, 2.3]], 2.4, 4.2, 'walk to the furnace');
  for (let i = 0; i < 120 && (await info()).mode === 'play'; i++) await T('skip', 5);
  st = await info();
  await expect(st.mode === 'ending' && st.flags['a4.done'] === true, 'the heart burned: the end');
  for (let i = 0; i < 30 && (await page.locator('#modal .story .btn', { hasText: '타이틀로' }).count()) === 0; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  await shot('act4-ending');
  const endText = await page.locator('#modal .story').innerText();
  await expect(endText.includes(pell ? '두 사람의 증언' : '홀로 돌아오다') && endText.includes('플레이 시간'), 'the final ending shown');
  log('FINAL ENDING reached. hp', st.hp, 'deaths', (await page.evaluate(() => window.__btk.state().deaths)));
}

async function finish() {
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
  await browser.close();
  server.kill();
  process.exit(errors.length ? 1 : 0);
}
