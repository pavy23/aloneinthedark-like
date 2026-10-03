// Side-path scenarios: water hammer ambush, death -> game over -> retry, manual save/continue, phone layout,
// camera coverage, control schemes, and the wrong turns of the second, third and fourth acts.
// Usage: npm run build && node scripts/scenarios.mjs   (SCEN=8,9 runs only those sections)
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
const ONLY = process.env.SCEN ? process.env.SCEN.split(',') : null;
const run = (n) => !ONLY || ONLY.includes(String(n));
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
if (run(1)) {
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
if (run(3)) {
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
if (run(4)) {
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
if (run(5)) {
  const page = await open();
  // (a) Let the cable go first, then send SOS and walk away from the set while the reply is coming in.
  await page.evaluate(() => window.__btk.play('radio', 0.3, 1.45, 0));
  await page.evaluate(() => {
    window.__btk.setFlags({ power: true, idolBurned: true, act2: true, cableFreed: true, radioIntro: true });
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
  for (let i = 0; i < 40 && (await info(page)).flags.dawn !== true; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  check((await info(page)).flags.dawn === true, 'SOS sent last (panel closed early): dawn still comes');
  // Down the Jacob's ladder to the Magnus's boat.
  await page.evaluate(() => window.__btk.play('deck', -4.8, -1.2, -Math.PI / 2));
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__btk.game.ui.clearMessages());
    if (!(await info(page)).busy) break;
    await page.waitForTimeout(100);
  }
  for (let i = 0; i < 40 && (await info(page)).mode !== 'ending'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  check((await info(page)).mode === 'ending', 'the Jacob’s ladder at dawn ends the night');
  const ending = await page.locator('#modal .story').innerText();
  check(ending.includes('2막 끝') && ending.includes('생존자 없음'), 'without Pell the second act closes alone (the interlude)');

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
if (run(6)) {
  const page = await open();
  for (const room of ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold', 'fcsle', 'testroom', 'tank2', 'station', 'opsroom', 'battery', 'beach', 'sbdeck', 'sbbridge', 'sbtest', 'sbstoke']) {
    if (room === 'fcsle') await page.evaluate(() => window.__btk.setFlags({ idolBurned: true, act2: true, pellFreed: true, tank2Drained: true, tank2Open: true }));
    // The St Brendan as she is at the end, the buoy over the side and the root up on the bow.
    if (room === 'sbdeck') await page.evaluate(() => window.__btk.setFlags({ act4: true, power: true, 'a4.seed': 3, 'a4.buoyed': true, 'a4.pickup': true, 'a4.rootUp': true }));
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

// ---------------------------------------------------------------- 7. control schemes and the follow camera
if (run(7)) {
  const page = await open();
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(150);
  };
  const scheme = (controls, camera) =>
    page.evaluate(([controls, camera]) => {
      const g = window.__btk.game;
      g.applySettings({ ...g.settings, controls, camera });
    }, [controls, camera]);
  const place = async (x, z, h) => {
    // Let the room's entry lines finish first (input is ignored while a script is talking).
    for (let i = 0; i < 40; i++) {
      await page.evaluate(() => window.__btk.game.ui.clearMessages());
      const s = await info(page);
      if (!s.busy && !s.ui) break;
      await page.waitForTimeout(100);
    }
    await page.evaluate(([x, z, h]) => {
      const g = window.__btk.game;
      g.pl.place(x, z, h);
      g.followSnap = true;
    }, [x, z, h]);
  };

  // (a) Default: push where you want to go on screen. Facing +Z with the camera behind him,
  //     screen-right is world -X, so holding → walks him off to the -X side.
  await page.evaluate(() => window.__btk.play('deck', 0, -3, 0));
  const defaults = await page.evaluate(() => [window.__btk.game.settings.controls, window.__btk.game.settings.camera]);
  check(defaults[0] === 'direct' && defaults[1] === 'follow', `defaults are screen-relative controls + follow camera (${defaults})`);
  await place(0, -3, 0);
  await page.waitForTimeout(300);
  await hold('ArrowRight', 900);
  let s = await info(page);
  check(s.x < -0.6 && Math.abs(s.z + 3) < 0.6, `→ walks to screen right (x 0 -> ${s.x.toFixed(2)}, z ${s.z.toFixed(2)})`);
  const camBehind = await page.evaluate(() => {
    const g = window.__btk.game;
    const c = g.camera.position;
    return { d: Math.hypot(c.x - g.pl.x, c.z - g.pl.z), vis: g.pl.object.visible };
  });
  check(camBehind.d > 1.5 && camBehind.d < 3.6 && camBehind.vis, `follow camera stays with him (${camBehind.d.toFixed(2)} m, visible ${camBehind.vis})`);

  // (b) The 1992 scheme: ← → turn on the spot, ↑ walks where he faces; the camera uses the fixed shots.
  await scheme('tank', 'fixed');
  await place(0, -3, 0);
  await page.waitForTimeout(300);
  await hold('ArrowRight', 500);
  s = await info(page);
  check(Math.abs(s.x) < 0.05 && Math.abs(s.z + 3) < 0.05 && Math.abs(s.h) > 0.5, `tank: → turns on the spot (h 0 -> ${s.h.toFixed(2)})`);
  const h0 = s.h;
  await hold('ArrowUp', 700);
  s = await info(page);
  const along = (s.x - 0) * Math.sin(h0) + (s.z + 3) * Math.cos(h0);
  check(along > 0.5, `tank: ↑ walks the way he faces (${along.toFixed(2)} m)`);
  const fixed = await page.evaluate(() => {
    const g = window.__btk.game;
    const p = g.camera.position;
    return g.current.def.cameras.some((c) => Math.hypot(c.pos[0] - p.x, c.pos[1] - p.y, c.pos[2] - p.z) < 0.2);
  });
  check(fixed, 'tank: the view is one of the fixed camera shots');
  await scheme('direct', 'follow');

  // (c) Wherever he walks, the follow camera never ends up behind a wall, outside the room or in a doorway.
  await page.evaluate(() => window.__btk.setFlags({ idolBurned: true, act2: true, pellFreed: true, tank2Drained: true, tank2Open: true, 'a2.captainRose': true, 'dead:a2captain': true }));
  for (const room of ['deck', 'bridge', 'corridor', 'cabin', 'radio', 'engine', 'hold', 'fcsle', 'testroom', 'tank2', 'station', 'opsroom', 'battery', 'beach']) {
    await page.evaluate((r) => window.__btk.play(r), room);
    await page.waitForTimeout(150);
    const res = await page.evaluate(async () => {
      const g = window.__btk.game;
      const room = g.current;
      const b = room.def.bounds;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // Only places he can actually walk to (the bounds also cover the void behind the walls).
      const step = 0.25;
      const W = Math.ceil((b.maxX - b.minX) / step);
      const H = Math.ceil((b.maxZ - b.minZ) / step);
      const at = (i, j) => [b.minX + (i + 0.5) * step, b.minZ + (j + 0.5) * step];
      const free = (x, z) => room.col.pointFree(x, z, 0.3);
      const seen = new Uint8Array(W * H);
      const queue = [];
      const cells = [];
      for (const sp of Object.values(room.def.spawns)) {
        const i = Math.floor((sp.x - b.minX) / step);
        const j = Math.floor((sp.z - b.minZ) / step);
        if (i >= 0 && j >= 0 && i < W && j < H && !seen[j * W + i]) {
          seen[j * W + i] = 1;
          queue.push([i, j]);
        }
      }
      while (queue.length) {
        const [i, j] = queue.pop();
        const [x, z] = at(i, j);
        cells.push([x, z]);
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
      const cross = (ax, az, bx, bz, cx, cz, dx, dz) => {
        const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
        if (Math.abs(d) < 1e-12) return false;
        const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
        const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
        return t > 0 && t < 1 && u >= 0 && u <= 1;
      };
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      let frames = 0;
      const bad = [];
      for (let k = 0; k < 10; k++) {
        const [x, z] = cells[Math.floor(rnd() * cells.length)];
        g.ui.clearMessages();
        g.pl.place(x, z, rnd() * Math.PI * 2);
        g.followSnap = true;
        const a = rnd() * Math.PI * 2;
        g.input.setStick(Math.sin(a), Math.cos(a), true);
        for (let f = 0; f < 45; f++) {
          await frame();
          if (g.busy) g.ui.clearMessages();
          if (g.current !== room) break; // walked through a door: done with this sample
          frames++;
          const c = g.camera.position;
          const out = c.x < b.minX || c.x > b.maxX || c.z < b.minZ || c.z > b.maxZ;
          const through = room.camWalls.some((w) => cross(g.pl.x, g.pl.z, c.x, c.z, w[0], w[1], w[2], w[3]));
          if (out || through) bad.push([+g.pl.x.toFixed(2), +g.pl.z.toFixed(2), +c.x.toFixed(2), +c.z.toFixed(2)]);
          if (f === 30) {
            const a2 = rnd() * Math.PI * 2;
            g.input.setStick(Math.sin(a2), Math.cos(a2), true);
          }
        }
        g.input.setStick(0, 0, false);
        if (g.current !== room) break;
      }
      return { frames, bad: bad.length, sample: bad.slice(0, 4) };
    });
    check(res.bad === 0 && res.frames > 100, `${room}: follow camera stayed inside the room for ${res.frames} frames${res.bad ? ` (outside ${res.bad}: ${JSON.stringify(res.sample)})` : ''}`);
  }
  await page.close();
}

// ---------------------------------------------------------------- 8. the second act's wrong turns
if (run(8)) {
  const page = await open();
  await page.evaluate(() => localStorage.clear());
  const settle = async () => {
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.__btk.game.ui.clearMessages());
      const s = await info(page);
      if (!s.busy) return;
      await page.waitForTimeout(100);
    }
  };
  const act2 = { power: true, idolBurned: true, act2: true, 'a2.t0': 0, 'vc.sea': true, 'vc.tank2': true, 'vc.level': 1, fcsleSeen: true, testroomSeen: true, tank2Seen: true, 'a2.deckSeen': true, engineSeen: true };

  // (a) Opening the door that only echoed lets the thing out — and no key.
  await page.evaluate((f) => window.__btk.setFlags({ ...f, 'a2.pellStbd': true }), act2);
  await page.evaluate(() => window.__btk.play('fcsle', -1.3, 5.05, 0));
  await settle();
  await page.evaluate(() => window.__btk.game.clearCreatures());
  await page.keyboard.press('Space');
  await page.locator('#hud .msg .choices .btn', { hasText: '빗장' }).click();
  await page.waitForTimeout(1500);
  let s = await info(page);
  check(s.creatures.some((c) => c.id === 'a2mimic') && !s.inv.includes('testKey') && s.flags['a2.door.port'] === true, 'opening the echoing locker lets the thing out (no key)');
  await page.screenshot({ path: '.shots/scen/8a-mimic.png' });
  await settle();

  // (b0) The bridge panel's keys: Shift / Tab change the ratio arms, F the shunt, Esc backs out.
  await page.evaluate(() => window.__btk.play('testroom', -0.2, 2.3, 0));
  await settle();
  await page.evaluate(() => void window.__btk.game.openPanel('bridge'));
  await page.waitForSelector('#modal .galvo-scale');
  const btnText = (t) => page.locator('#modal .btn', { hasText: t }).first().innerText();
  // (the game reads input on its next frame)
  const key = async (k) => {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
  };
  const r0 = await btnText('비율 팔');
  await key('Shift');
  const r1 = await btnText('비율 팔');
  await key('Tab');
  const r2 = await btnText('비율 팔');
  const s0 = await btnText('분류기');
  await key('f');
  const s1 = await btnText('분류기');
  check(r0 !== r1 && r1 !== r2 && s0 !== s1, `bridge keys: Shift/Tab change the arms (${r0} → ${r1} → ${r2}), F the shunt (${s0} → ${s1})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await page.locator('#modal .galvo-scale').count()) === 0, 'Esc backs out of the bridge');
  await settle();

  // (b) The valve chest: as found it floods; pumping with the sea valve open gets nowhere; no discharge = dead head.
  await page.evaluate(() => window.__btk.play('engine', -3.0, -5.95, Math.PI));
  await settle();
  await page.evaluate(() => {
    window.__btk.game.clearCreatures();
    void window.__btk.game.openPanel('valves');
  });
  await page.waitForSelector('#modal .tank-level');
  const status = () => page.locator('#modal .panel .log').innerText();
  check((await status()).includes('흘러든다'), 'as found: the sea runs into tank No.2');
  await page.locator('#modal .btn', { hasText: '잡용 펌프' }).click();
  await page.waitForTimeout(400);
  check((await status()).includes('헐떡'), 'pump with no discharge open: dead head');
  await page.locator('#modal .btn', { hasText: '⑤ 선외 배출' }).click();
  const lv0 = (await info(page)).flags['vc.level'];
  await page.waitForTimeout(3000);
  const lv1 = (await info(page)).flags['vc.level'];
  check((await status()).includes('바다를 퍼 올리고') && lv1 >= lv0 - 0.001, `sea valve still open: the level does not drop (${lv0.toFixed(3)} -> ${lv1.toFixed(3)})`);
  await page.locator('#modal .btn', { hasText: '① 해수 흡입' }).click();
  await page.waitForTimeout(3000);
  const lv2 = (await info(page)).flags['vc.level'];
  check(lv2 < lv1 - 0.1, `sea valve shut: tank No.2 drains (${lv1.toFixed(3)} -> ${lv2.toFixed(3)})`);
  await page.locator('#modal .btn', { hasText: '물러나기' }).click();

  // (c) The cable engine: not without knowing which cable; then the wrong drum costs dear.
  await page.evaluate(() => {
    window.__btk.give('brakeKey');
    window.__btk.setFlags({ 'a2.thingStbd': true, 'a2.finale': true, sosSent: true });
  });
  await page.evaluate(() => window.__btk.play('deck', 0, 5.05, 0));
  await settle();
  await page.evaluate(() => {
    window.__btk.game.clearCreatures();
    void window.__btk.game.openPanel('cableEngine');
  });
  const btn = (t) => page.locator('#modal .btn', { hasText: t }).first().click();
  const log = () => page.locator('#modal .panel .log').innerText();
  await btn('고정핀 자물쇠 열기');
  await btn('좌현 클러치');
  await btn('좌현 브레이크 풀기');
  check((await log()).includes('모른다') && !(await info(page)).flags['ce.portGone'], 'no cable is let go before the measurement');
  await page.evaluate(() => window.__btk.setFlags({ 'a2.measured': true }));
  await btn('좌현 브레이크 풀기');
  await page.waitForFunction(() => window.__btk.info().flags['ce.portGone'] === true, null, { timeout: 5000 });
  await page.waitForTimeout(3600);
  await settle();
  s = await info(page);
  check(!s.flags.cableFreed && s.mode === 'play', 'the wrong drum runs out but the ship is still held');
  check(s.creatures.some((c) => c.id === 'a2bow4'), 'and more of them come over the bow');
  await page.evaluate(() => {
    window.__btk.game.clearCreatures();
    void window.__btk.game.openPanel('cableEngine');
  });
  await btn('우현 클러치');
  await btn('우현 브레이크 풀기');
  await page.waitForFunction(() => window.__btk.info().flags.cableFreed === true, null, { timeout: 8000 });
  for (let i = 0; i < 40 && (await info(page)).flags.dawn !== true; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  s = await info(page);
  check(s.flags.dawn === true && s.mode === 'play', 'the right drum then frees the ship (SOS already sent: dawn)');
  // (d) Leaving without the operator is a choice you are asked to make.
  await page.evaluate(() => window.__btk.setFlags({ pellFreed: true }));
  await page.evaluate(() => window.__btk.play('deck', -4.8, -1.2, -Math.PI / 2));
  await settle();
  await page.keyboard.press('Space');
  await page.locator('#hud .msg .choices .btn', { hasText: '그만둔다' }).click();
  await page.waitForTimeout(400);
  check((await info(page)).mode === 'play', 'can still go back for Pell');
  await settle();
  await page.keyboard.press('Space');
  await page.locator('#hud .msg .choices .btn', { hasText: '두고 내려간다' }).click();
  for (let i = 0; i < 40 && (await info(page)).mode !== 'ending'; i++) await page.waitForTimeout(200);
  for (let i = 0; i < 20 && !(await page.locator('#modal .story').innerText().catch(() => '')).includes('2막 끝'); i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
  }
  check((await page.locator('#modal .story').innerText()).includes('생존자 없음'), 'leaving him behind: the second act ends alone');
  // On into the third act, alone.
  for (let i = 0; i < 60 && (await info(page)).room !== 'station'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  s = await info(page);
  check(s.room === 'station' && s.mode === 'play' && s.flags.act3 === true && s.flags['a3.pell'] === false, 'the third act follows: Bell Cove, alone');
  const prog = await page.evaluate(() => JSON.parse(localStorage.getItem('btk.progress.v1') ?? '{}'));
  check(prog.act === 3 && prog.pell === false, `progress remembered for the chapter select (${JSON.stringify(prog)})`);
  await page.close();
}
if (run(8)) {
  // (e) The thing's climb runs on play time, so a save and reload does not reset it; (f) a save from
  // before the second act existed opens it.
  const page = await open();
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => window.__btk.play('testroom', 0, 1.0, 0));
  await page.evaluate(() => {
    const g = window.__btk.game;
    window.__btk.setFlags({ power: true, idolBurned: true, act2: true, testroomSeen: true });
    g.state.time = 5000;
    window.__btk.setFlags({ 'a2.t0': 4000 });
    g.save(false);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(600);
  await page.locator('#modal .title .btn', { hasText: '이어하기' }).click();
  await page.waitForTimeout(1500);
  const nm = await page.evaluate(() => {
    const g = window.__btk.game;
    return 2.1 - 0.00015 * (g.playTime - g.state.flags['a2.t0']);
  });
  check(nm < 1.96 && nm > 1.9, `after reload the fault is still ~1.95 nm below the bow (${nm.toFixed(3)})`);
  await page.evaluate(() => {
    const g = window.__btk.game;
    for (const k of Object.keys(g.state.flags)) if (k === 'act2' || k.startsWith('a2.') || k.startsWith('vc.')) delete g.state.flags[k];
    g.save(false);
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(600);
  await page.locator('#modal .title .btn', { hasText: '이어하기' }).click();
  await page.waitForTimeout(1500);
  const f = (await info(page)).flags;
  check(f.act2 === true && f['vc.sea'] === true && typeof f['a2.t0'] === 'number', 'an old save with the stone burned opens the second act');
  await page.close();
}

// ---------------------------------------------------------------- 9. the third act's wrong turns
if (run(9)) {
  const page = await open();
  await page.evaluate(() => localStorage.clear());
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await page.evaluate(() => window.__btk.game.ui.clearMessages());
      const s = await info(page);
      if (!s.busy) return;
      await page.waitForTimeout(100);
    }
  };
  // Advance dialogue, collecting what is said (frames are slow under software GL: wait for it to start).
  const hear = async (ms = 8000) => {
    const seen = [];
    for (let i = 0; i < 30; i++) {
      const s = await info(page);
      if (s.busy || s.ui) break;
      await page.waitForTimeout(100);
    }
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const [open, text] = await page.evaluate(() => [!window.__btk.game.ui.msgEl.hidden, window.__btk.game.ui.msgText.textContent]);
      if (open) {
        if (seen.at(-1) !== text) seen.push(text);
        await page.keyboard.press('Space');
      } else if (!(await info(page)).busy) {
        await page.waitForTimeout(200);
        if (!(await info(page)).busy && !(await page.evaluate(() => !window.__btk.game.ui.msgEl.hidden))) return seen;
      }
      await page.waitForTimeout(120);
    }
    return seen;
  };
  // Use the thing in front of me (through the virtual button, and again if nothing started).
  const use = async () => {
    for (let k = 0; k < 2; k++) {
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__btk.game.input.setTouch('action', true));
      await page.waitForTimeout(120);
      await page.evaluate(() => window.__btk.game.input.setTouch('action', false));
      for (let i = 0; i < 15; i++) {
        const s = await info(page);
        if (s.busy || s.ui) return;
        await page.waitForTimeout(100);
      }
    }
  };
  const act3 = (extra = {}) =>
    page.evaluate((extra) => {
      const g = window.__btk.game;
      g.state.flags = {};
      window.__btk.setFlags({
        act3: true, 'a3.pell': false, 'a3.t0': g.playTime, 'a3.seed': 77, 'a3.combo': 472,
        'sw.recorder': true, 'sw.condenser': true, 'sw.protector': true, 'sw.bridge': false, 'sw.coil': false,
        'a3.batteryOpen': true, 'a3.coilSeen': true, 'a3.batteryLook': true, 'a3.boardSeen': true, 'a3.opsSeen': true, 'a3.beachSeen': true,
        ...extra,
      });
    }, extra);
  const sgs = await page.evaluate(() => {
    const g = window.__btk.game;
    g.state.flags['a3.seed'] = 77;
    return window.__btk.rack();
  });
  const good = sgs.map((v, i) => (v >= 1.25 ? i : -1)).filter((i) => i >= 0);
  const weak = sgs.findIndex((v) => v < 1.25);
  const mask = (cells) => cells.reduce((m, i) => m | (1 << i), 0);

  // (a) The bridge on the line with the condenser still in series reads an open circuit.
  await act3({ 'sw.bridge': true });
  await page.evaluate(() => window.__btk.play('battery', -1.4, 1.35, Math.PI));
  await settle();
  await page.evaluate(() => void window.__btk.game.openPanel('bridge3'));
  await page.waitForSelector('#modal .galvo-scale');
  await page.locator('#modal .btn', { hasText: '측정 기록' }).click();
  await page.waitForTimeout(150);
  await page.locator('#modal .btn', { hasText: '측정 기록' }).click();
  await page.waitForTimeout(150);
  const openLog = await page.locator('#modal .log').first().innerText();
  check(openLog.includes('직류가 어딘가에서 막힌다') && openLog.includes('②를 우회'), 'condenser in series: the bridge reads open, then the plan is recalled');
  check((await info(page)).flags['a3.measured'] !== true, 'no measurement through the condenser');
  await page.keyboard.press('Escape');
  await settle();

  const coilPanel = async () => {
    await use();
    try {
      await page.waitForSelector('#modal .coil-status', { timeout: 6000 });
    } catch (e) {
      console.log('DEBUG coil', JSON.stringify(await page.evaluate(async () => {
        const g = window.__btk.game;
        const t0 = g.realTime;
        await new Promise((r) => setTimeout(r, 300));
        return { dt: g.realTime - t0, busyAnim: g.pl.busyAnim, st: g.pl.state, dead: g.dead, tr: g.transitioning, mode: g.mode, blocking: g.ui.blocking, busyCount: g.busyCount, frozen: g.pl.frozen, hint: g.findInteractable()?.id, active: document.activeElement?.tagName + '.' + document.activeElement?.className, flags: g.state.flags };
      })), errors);
      throw e;
    }
  };
  // (b) Firing with the protector still on the line: the discharge goes to earth.
  await act3({ 'a3.handle': true, 'a3.cells': mask(good), 'a3.measured': true, 'sw.recorder': false, 'sw.condenser': false, 'sw.coil': true });
  await page.evaluate(() => window.__btk.play('battery', 0.6, 1.55, 0));
  await settle();
  await coilPanel();
  await page.locator('#modal .btn', { hasText: '지금 쏜다' }).click();
  let lines = await hear();
  check(lines.some((l) => l.includes('피뢰기에서 퍼런 불꽃')), 'protector left on: the discharge jumps its gap to earth');
  check((await info(page)).flags['a3.done'] !== true && (await info(page)).flags['a3.coilReadyAt'] > 0, 'nothing reached the cable; the coil must cool');
  // (c) …and the coil will not fire again until it has cooled.
  await coilPanel();
  check(await page.locator('#modal .btn', { hasText: '지금 쏜다' }).isDisabled(), 'the switch is held while the interrupter cools');
  await page.keyboard.press('Escape');
  await settle();

  // (d) A weak cell in the string: the interrupter will not stand up.
  await act3({ 'a3.handle': true, 'a3.cells': mask([...good.slice(0, 11), weak]), 'a3.measured': true, 'sw.recorder': false, 'sw.condenser': false, 'sw.protector': false, 'sw.coil': true });
  await page.evaluate(() => window.__btk.play('battery', 0.6, 1.55, 0));
  await settle();
  await coilPanel();
  await page.locator('#modal .btn', { hasText: '지금 쏜다' }).click();
  lines = await hear();
  check(lines.some((l) => l.includes('축전지가 약하다')), 'one weak cell: the coil barely buzzes');
  await settle();

  // (e) Everything right but nothing up at the hut: wasted, told so.
  await act3({ 'a3.handle': true, 'a3.cells': mask(good), 'a3.measured': true, 'sw.recorder': false, 'sw.condenser': false, 'sw.protector': false, 'sw.coil': true });
  await page.evaluate(() => window.__btk.play('battery', 0.6, 1.55, 0));
  await settle();
  await coilPanel();
  await page.locator('#modal .btn', { hasText: '지금 쏜다' }).click();
  lines = await hear();
  check(lines.some((l) => l.includes('뭍에 올라와 있을 때')), 'a clean shot with nothing at the hut is wasted (and says why)');

  // (f) The candle burns through while I am up in the yard: the shot is wasted and the timer clears.
  await act3({ 'a3.handle': true, 'a3.cells': mask(good), 'a3.measured': true, 'sw.recorder': false, 'sw.condenser': false, 'sw.protector': false, 'sw.coil': true, 'a3.arrived': true });
  await page.evaluate(() => window.__btk.play('station', 0, 0, 0));
  await settle();
  await page.evaluate(() => window.__btk.setFlags({ 'a3.timerAt': window.__btk.game.playTime + 1.5 }));
  for (let i = 0; i < 30 && (await info(page)).flags['a3.timerAt'] !== 0; i++) await page.waitForTimeout(200);
  await settle();
  let f = (await info(page)).flags;
  check(f['a3.timerAt'] === 0 && f['a3.shots'] >= 1 && f['a3.done'] !== true, 'the candle fired the coil while I was away: wasted, ready to light again');

  // (g) Alone at the hut, the key only gets my own signal back.
  await act3({});
  await page.evaluate(() => window.__btk.play('beach', 2.55, 2.65, 0.6));
  await settle();
  await page.evaluate(() => window.__btk.game.clearCreatures());
  await page.evaluate(() => void window.__btk.game.openPanel('hutKey'));
  await page.waitForSelector('#modal .hut-log');
  for (const sym of ['· 단점', '− 장점', '· 단점']) await page.locator('#modal .btn', { hasText: sym }).click();
  await page.locator('#modal .btn', { hasText: '보내기' }).click();
  await page.waitForFunction(() => document.querySelector('#modal .hut-log')?.textContent.includes('따라 치고'), null, { timeout: 8000 });
  const hut = await page.locator('#modal .hut-log').innerText();
  check(hut.includes('회선: R') && !hut.includes('회선: K'), 'alone, the hut key only hears its own R come back');
  await page.keyboard.press('Escape');
  await settle();

  // (h) Pell will not sit at the coil while the board is wrong, and says what is wrong.
  await act3({ 'a3.pell': true, 'a3.pellMet': true, 'a3.handle': true, 'a3.cells': mask(good), 'a3.measured': true, 'sw.recorder': false, 'sw.condenser': false, 'sw.coil': true });
  await page.evaluate(() => window.__btk.play('battery', 2.4, 1.85, -2.3));
  await settle();
  await use();
  lines = await hear();
  check(lines.some((l) => l.includes('피뢰기 ③')) && (await info(page)).flags['a3.pellReady'] !== true, `Pell refuses with the protector on, and says so (${lines.at(-1) ?? 'nothing said'})`);
  await page.evaluate(() => window.__btk.setFlags({ 'sw.protector': false }));
  await use();
  lines = await hear();
  check((await info(page)).flags['a3.pellReady'] === true && lines.some((l) => l.includes('R로 답하시오')), 'with the board right Pell sits at the coil and gives the protocol');
  // Touching a switch after that takes him off it again.
  await page.evaluate(() => void window.__btk.game.openPanel('switches'));
  await page.waitForSelector('#modal .switch-list');
  await page.locator('#modal .btn', { hasText: '③ 피뢰기' }).click();
  check((await info(page)).flags['a3.pellReady'] === false, 'changing the board after he checked it un-arms him');
  await page.keyboard.press('Escape');
  await settle();

  // (i) At the battery-room door, copying Pell's K gets silence; SOS gets K again; R opens.
  await act3({ 'a3.pell': true, 'a3.batteryOpen': false });
  await page.evaluate(() => window.__btk.play('opsroom', 3.85, 4.5, Math.PI / 2));
  await settle();
  await page.evaluate(() => window.__btk.game.clearCreatures());
  const door = async (label) => {
    await use();
    for (let i = 0; i < 40 && (await page.locator('#hud .msg .choices .btn').count()) === 0; i++) {
      if (await page.evaluate(() => !window.__btk.game.ui.msgEl.hidden && !window.__btk.game.ui.choiceNav)) await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    await page.locator('#hud .msg .choices .btn', { hasText: label }).click();
    return hear(12000);
  };
  lines = await door('SOS를 친다');
  check(lines.some((l) => l.includes('다시 같은 신호')) && (await info(page)).flags['a3.batteryOpen'] !== true, 'SOS at Pell’s door: he asks again');
  lines = await door('R로 답한다');
  check((await info(page)).flags['a3.batteryOpen'] === true, 'answering R opens Pell’s door');
  await settle();

  // (j) The chapter select offers the acts reached.
  await page.evaluate(() => localStorage.setItem('btk.progress.v1', JSON.stringify({ act: 3, pell: true })));
  await page.reload();
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(900);
  await page.locator('#modal .title .btn', { hasText: '막 선택' }).click();
  await page.waitForSelector('#modal .panel .eyebrow:has-text("CHAPTERS")');
  const third = page.locator('#modal .btn', { hasText: '3막 · 뭍으로' });
  check((await third.count()) === 1 && !(await third.isDisabled()), 'chapter select lists the third act');
  await third.click();
  for (let i = 0; i < 60 && (await info(page)).room !== 'station'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  f = (await info(page)).flags;
  check((await info(page)).room === 'station' && f.act3 === true && f['a3.pell'] === true, 'starting the third act from the title (with Pell, as reached)');
  await page.screenshot({ path: '.shots/scen/9-chapter-act3.png' });
  await page.close();
}

// ---------------------------------------------------------------- 10. the fourth act's wrong turns
if (run(10)) {
  const page = await open();
  await page.evaluate(() => localStorage.clear());
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await page.evaluate(() => window.__btk.game.ui.clearMessages());
      const s = await info(page);
      if (!s.busy) return;
      await page.waitForTimeout(100);
    }
  };
  const hear = async (ms = 8000) => {
    const seen = [];
    for (let i = 0; i < 30; i++) {
      const s = await info(page);
      if (s.busy || s.ui) break;
      await page.waitForTimeout(100);
    }
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const [open, text] = await page.evaluate(() => [!window.__btk.game.ui.msgEl.hidden, window.__btk.game.ui.msgText.textContent]);
      if (open) {
        if (seen.at(-1) !== text) seen.push(text);
        await page.keyboard.press('Space');
      } else if (!(await info(page)).busy) {
        await page.waitForTimeout(200);
        if (!(await info(page)).busy && !(await page.evaluate(() => !window.__btk.game.ui.msgEl.hidden))) return seen;
      }
      await page.waitForTimeout(120);
    }
    return seen;
  };
  const use = async () => {
    for (let k = 0; k < 2; k++) {
      await page.waitForTimeout(250);
      await page.evaluate(() => window.__btk.game.input.setTouch('action', true));
      await page.waitForTimeout(120);
      await page.evaluate(() => window.__btk.game.input.setTouch('action', false));
      for (let i = 0; i < 15; i++) {
        const s = await info(page);
        if (s.busy || s.ui) return;
        await page.waitForTimeout(100);
      }
    }
  };
  const act4 = (extra = {}) =>
    page.evaluate((extra) => {
      const g = window.__btk.game;
      g.state.flags = {};
      window.__btk.setFlags({ act4: true, power: true, 'a4.pell': false, 'a4.t0': 0, 'a4.seed': 4242, 'a4.attempt': 0, 'a4.heading': 334, 'a4.deckIntro': true, 'a4.bosunMet': true, 'a4.testSeen': true, 'a4.rossMet': true, ...extra });
    }, extra);
  // Where the panel's run will meet the bottom (the same layout the game draws).
  const layout = () =>
    page.evaluate(() => {
      const f = window.__btk.game.state.flags;
      let s = Math.floor(Math.abs(f['a4.seed'] * 31 + f['a4.attempt'] * 977 + 7)) % 2147483647 || 1;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 3; i++) r();
      const cableAt = 0.45 + r() * 0.12;
      const rocks = [0.14 + r() * 0.1];
      if (r() < 0.7) rocks.push(rocks[0] + 0.1 + r() * (cableAt - rocks[0] - 0.16));
      return { cableAt, rocks };
    });
  const runFor = async (p) => {
    // The run's clock: p of the way along, at 80 s a run (read off the panel's elapsed time).
    for (let i = 0; i < 1200; i++) {
      const txt = await page.locator('#modal .bridge-read').first().innerText().catch(() => '');
      const m = txt.match(/경과 (\d+)시간 (\d+)분/);
      if (!m) return false;
      if ((Number(m[1]) * 60 + Number(m[2])) / 150 >= p) return true;
      await page.waitForTimeout(50);
    }
    return false;
  };

  // (a) The dynamometer before the run is laid off: nothing to read.
  await act4({});
  await page.evaluate(() => window.__btk.play('sbdeck', 0.25, 5.95, 0));
  await settle();
  let lines = [];
  await use();
  lines = await hear();
  check(lines.some((l) => l.includes('선교에서 침로를 잡아야')), 'the dynamometer before the run: go and set the heading first');

  // (b) Stopping on a rock's spike: an empty, bent grapnel (and, the first time, what is caught on it).
  await act4({ 'a4.runSet': true, 'a4.heading': 304 });
  await page.evaluate(() => window.__btk.play('sbdeck', 0.25, 5.95, 0));
  await settle();
  let lay = await layout();
  await use();
  await page.waitForSelector('#modal canvas.strain-plot');
  check(await runFor(lay.rocks[0]), 'the run reaches the first rock');
  await page.locator('#modal .btn', { hasText: '기관 정지' }).click();
  lines = await hear(12000);
  let f = (await info(page)).flags;
  check(lines.some((l) => l.includes('바위였다')) && lines.some((l) => l.includes('손가락')) && f['a4.attempt'] === 1 && f['a4.hooked'] !== true, `stopped on a rock: a bent grapnel, a finger, and another run (${lines.at(-1) ?? ''})`);

  // (c) The chart's own square (334°): the grapnel skids over the cable.
  await act4({ 'a4.runSet': true, 'a4.heading': 334 });
  await page.evaluate(() => window.__btk.play('sbdeck', 0.25, 5.95, 0));
  await settle();
  lay = await layout();
  await use();
  await page.waitForSelector('#modal canvas.strain-plot');
  check(await runFor(lay.cableAt), 'the run reaches the cable');
  await page.locator('#modal .btn', { hasText: '기관 정지' }).click();
  lines = await hear(12000);
  f = (await info(page)).flags;
  check(lines.some((l) => l.includes('미끄러져 넘어갔소')) && lines.some((l) => l.includes('직각이어야')) && f['a4.hooked'] !== true, 'square on the chart, oblique over the ground: the grapnel skids, and the bosun says why');

  // (d) Heaving at half speed into the swell parts the bight: back to grappling.
  await act4({ 'a4.runSet': true, 'a4.heading': 304, 'a4.hooked': true });
  await page.evaluate(() => window.__btk.play('sbdeck', 0.9, 1.8, -0.84));
  await settle();
  await use();
  await page.waitForSelector('#modal canvas.heave-plot');
  await page.locator('#modal .btn', { hasText: '반속' }).click();
  lines = await hear(15000);
  f = (await info(page)).flags;
  check(lines.some((l) => l.includes('바이트가 끊어졌소')) && f['a4.hooked'] === false && f['a4.attempt'] === 1, 'heaving hard into the swell parts the bight: grapple again');

  // (e) Ross will not seal an end nobody has measured.
  await act4({ 'a4.runSet': true, 'a4.hooked': true, 'a4.raised': true, 'a4.cut': true, 'a4.endsSeen': true });
  await page.evaluate(() => window.__btk.play('sbtest', 0.6, 2.0, 0));
  await settle();
  await use();
  await page.waitForSelector('#modal .ends-grid');
  await page.locator('#modal .btn', { hasText: '이 끝을 부표에' }).click();
  check((await page.locator('#modal .hut-log').innerText()).includes('재 보지도 않고'), 'buoying an end untested: Ross refuses');
  check((await info(page)).flags['a4.buoyed'] !== true, 'nothing buoyed');
  await page.keyboard.press('Escape');
  await settle();

  // (f) The root with bare hands; then a reload with the root up brings the limbs back.
  await act4({ 'a4.runSet': true, 'a4.hooked': true, 'a4.raised': true, 'a4.cut': true, 'a4.buoyed': true, 'a4.pickup': true, 'a4.rootUp': true });
  await page.evaluate(() => window.__btk.play('sbdeck', 0, 8.9, 0));
  await settle();
  await page.evaluate(() => window.__btk.game.clearCreatures());
  await page.evaluate(() => window.__btk.game.equip(null));
  await page.evaluate(() => window.__btk.game.input.setTouch('attack', true));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__btk.game.input.setTouch('attack', false));
  lines = await hear();
  check(lines.some((l) => l.includes('맨손으로는 어림도 없다')), 'the root with bare hands: an axe is needed (and where one is)');
  check((await info(page)).flags['a4.heartHits'] === undefined, 'no blow landed');
  await page.evaluate(() => window.__btk.game.save(false));
  await page.reload();
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(900);
  await page.locator('#modal .title .btn', { hasText: '이어하기' }).click();
  for (let i = 0; i < 40 && (await info(page)).room !== 'sbdeck'; i++) await page.waitForTimeout(200);
  await page.waitForTimeout(2500);
  const st = await info(page);
  check(st.room === 'sbdeck' && st.creatures.filter((c) => c.id.startsWith('a4limb')).length === 2, 'reloading with the root up: the limbs are back on the bow');
  await page.screenshot({ path: '.shots/scen/10-root-reload.png' });

  // (g) The chapter select offers the fourth act once reached.
  await page.evaluate(() => localStorage.setItem('btk.progress.v1', JSON.stringify({ act: 4, pell: true })));
  await page.reload();
  await page.waitForFunction(() => !!window.__btk);
  await page.waitForTimeout(900);
  await page.locator('#modal .title .btn', { hasText: '막 선택' }).click();
  await page.waitForSelector('#modal .panel .eyebrow:has-text("CHAPTERS")');
  const fourth = page.locator('#modal .btn', { hasText: '4막 · 갈고리' });
  check((await fourth.count()) === 1 && !(await fourth.isDisabled()), 'chapter select lists the fourth act');
  await fourth.click();
  for (let i = 0; i < 60 && (await info(page)).room !== 'sbdeck'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
  }
  f = (await info(page)).flags;
  check((await info(page)).room === 'sbdeck' && f.act4 === true && f['a4.pell'] === true && (await info(page)).inv.includes('pellLetter'), 'starting the fourth act from the title (Pell at Bell Cove, his letter in hand)');
  await page.close();
}

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
server.kill();
process.exit(failed || errors.length ? 1 : 0);
