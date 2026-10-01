import type { Game } from '../game/Game';
import { checkSafe, classifyPress, decodeLetter, dynamoAction, endsWithSOS, encodeText, isDistressWavelength, RATED_MIN, type DynamoAction } from '../game/logic';
import { DYN_TEXT, emitDynamo, getDyn, onDynamo, setDyn } from '../game/dynamo';
import { FocusNav, type Modal } from './UI';
import { dawnComes, readyForEnding } from '../game/act2';
import { button, h } from './dom';

// ------------------------------------------------------------------ Safe

export function openSafePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const vals = [0, 0, 0];
    let sel = 0;
    const valEls: HTMLElement[] = [];
    const dialEls: HTMLElement[] = [];
    const msg = h('p', { class: 'log', text: '다이얼 세 개. 번호를 맞추고 손잡이를 돌린다.' });
    const setVal = (i: number, d: number) => {
      vals[i] = (vals[i] + d + 100) % 100;
      valEls[i].textContent = String(vals[i]).padStart(2, '0');
      g.audio.sfx('safe-click');
    };
    const paint = () => dialEls.forEach((d, i) => d.classList.toggle('focus', i === sel));
    const labels = ['첫째', '둘째', '셋째'];
    const dials = h(
      'div',
      { class: 'dials' },
      ...labels.map((lab, i) => {
        const v = h('div', { class: 'val', text: '00' });
        valEls.push(v);
        const d = h(
          'div',
          { class: 'dial' },
          h('label', { text: lab }),
          button('▲', () => {
            sel = i;
            paint();
            setVal(i, 1);
          }),
          v,
          button('▼', () => {
            sel = i;
            paint();
            setVal(i, -1);
          }),
        );
        dialEls.push(d);
        return d;
      }),
    );
    let done = false;
    const tryOpen = () => {
      if (done) return;
      if (checkSafe(vals)) {
        done = true;
        g.audio.sfx('safe-open');
        g.setFlag('safeOpen');
        msg.textContent = '철컥. 무거운 빗장이 풀렸다.';
        setTimeout(() => g.ui.pop(modal), 700);
      } else {
        g.audio.sfx('locked');
        msg.textContent = '딸깍… 손잡이가 돌아가지 않는다. 번호가 틀렸다.';
      }
    };
    const tryBtn = button('손잡이 돌리기', tryOpen);
    const leave = button('물러나기', () => g.ui.pop(modal));
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'MASTER’S SAFE · 선장실 금고' }),
      h('h2', { text: '세 자리 다이얼 자물쇠' }),
      h('p', { class: 'muted', text: '← → 다이얼 선택 · ↑ ↓ 숫자 조정 · Space 손잡이 · Esc 물러나기' }),
      dials,
      msg,
      h('div', { class: 'row' }, tryBtn, leave),
    );
    const wrap = h('div', { class: 'modal' }, panel);
    let repeat = 0;
    const modal: Modal = g.ui.push({
      el: wrap,
      update: (dt, input) => {
        if (input.justPressed('left')) {
          sel = (sel + 2) % 3;
          g.audio.sfx('ui-move');
          paint();
        }
        if (input.justPressed('right')) {
          sel = (sel + 1) % 3;
          g.audio.sfx('ui-move');
          paint();
        }
        const up = input.isDown('up');
        const dn = input.isDown('down');
        if (input.justPressed('up')) {
          setVal(sel, 1);
          repeat = -0.35;
        } else if (input.justPressed('down')) {
          setVal(sel, -1);
          repeat = -0.35;
        } else if (up || dn) {
          repeat += dt;
          if (repeat > 0.06) {
            repeat = 0;
            setVal(sel, up ? 1 : -1);
          }
        }
        if (input.justPressed('action')) {
          input.consume('action');
          tryOpen();
        }
      },
      onClose: () => resolve(),
    });
    paint();
  });
}

// ------------------------------------------------------------------ Dynamo

function drawGauge(ctx: CanvasRenderingContext2D, value: number, label: string, unit: string, green?: [number, number], max = 1): void {
  const w = ctx.canvas.width;
  const c = w / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.fillStyle = '#1b1712';
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8ceb2';
  ctx.beginPath();
  ctx.arc(c, c, c - 9, 0, Math.PI * 2);
  ctx.fill();
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  if (green) {
    ctx.strokeStyle = '#4f8a5a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(c, c, c - 18, a0 + (green[0] / max) * span, a0 + (green[1] / max) * span);
    ctx.stroke();
  }
  ctx.strokeStyle = '#2a2016';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) {
    const a = a0 + (i / 10) * span;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
    ctx.lineTo(c + Math.cos(a) * (c - (i % 5 === 0 ? 24 : 18)), c + Math.sin(a) * (c - (i % 5 === 0 ? 24 : 18)));
    ctx.stroke();
  }
  ctx.fillStyle = '#2a2016';
  ctx.font = `bold ${Math.round(w * 0.085)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, c, c + c * 0.42);
  ctx.font = `${Math.round(w * 0.07)}px serif`;
  ctx.fillText(unit, c, c + c * 0.6);
  const a = a0 + Math.max(0, Math.min(1, value / max)) * span;
  ctx.strokeStyle = '#8a1a10';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(a) * (c - 20), c + Math.sin(a) * (c - 20));
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, Math.PI * 2);
  ctx.fill();
}

export async function powerOn(g: Game): Promise<void> {
  g.setFlag('power');
  g.audio.sfx('breaker');
  g.audio.sfx('lights');
  g.lights.powerFlicker = 1;
  g.refreshLights();
  g.audio.setDynamo(true, g.state.room === 'engine' ? 1 : 0.0001);
  await g.wait(1.4);
  g.lights.powerFlicker = 0;
  g.refreshLights();
}

export function openDynamoPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const cv = () => h('canvas', { width: 124, height: 124 }) as HTMLCanvasElement;
    const pC = cv();
    const rC = cv();
    const drainState = h('span', { class: 'state-pill' });
    const steamState = h('span', { class: 'state-pill' });
    const breakerState = h('span', { class: 'state-pill' });
    const log = h('div', { class: 'log', text: '기관장의 수첩에 적힌 순서를 떠올린다.' });
    const act = (a: DynamoAction) => {
      const before = getDyn(g);
      const r = dynamoAction(before, a);
      setDyn(g, r.s);
      if (a.startsWith('drain') || a.startsWith('steam')) g.audio.sfx('valve');
      if (r.ev === 'hammer') {
        g.audio.sfx('waterhammer');
        g.shake(0.25, 0.6);
        g.flash(0xffffff, 0.25);
      }
      if (r.ev === 'warming') g.audio.sfx('steam');
      if (r.ev === 'spinning') g.audio.sfx('dynamo');
      if (r.ev === 'trip') g.audio.sfx('trip');
      if (r.ev === 'power') void powerOn(g);
      if (r.ev && r.ev !== 'nothing') log.textContent = DYN_TEXT[r.ev];
      emitDynamo(r.ev);
      render();
    };
    const controls = h(
      'div',
      { class: 'controls' },
      button('드레인 밸브 열기', () => act('drain-open')),
      button('드레인 밸브 닫기', () => act('drain-close')),
      button('주증기 밸브 ¼ 열기', () => act('steam-crack')),
      button('주증기 밸브 완전히 열기', () => act('steam-full')),
      button('주증기 밸브 잠그기', () => act('steam-close')),
      button('주차단기 넣기', () => act('breaker')),
    );
    const leave = button('물러나기', () => g.ui.pop(modal));
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'DYNAMO · 발전기와 배전반' }),
      h('h2', { text: '증기 발전기 기동' }),
      h('div', { class: 'gauges' }, pC, rC),
      h('p', {}, '드레인', drainState, ' 주증기', steamState, ' 주차단기', breakerState),
      controls,
      log,
      h('div', { class: 'row' }, leave),
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio, { grid: true });
    const render = () => {
      const s = getDyn(g);
      drawGauge(pC.getContext('2d')!, 0.68, '보일러 압력', 'lb/in²');
      drawGauge(rC.getContext('2d')!, s.rpm, '회전수', 'r.p.m.', [RATED_MIN, 1.05], 1.2);
      drainState.textContent = s.drain ? (s.steam > 0 ? (s.warm >= 1 ? '열림 · 마른 증기' : '열림 · 물 섞임') : '열림') : '닫힘';
      drainState.className = `state-pill ${s.drain ? 'on' : 'off'}`;
      steamState.textContent = s.steam === 0 ? '닫힘' : s.steam === 1 ? '¼ 열림' : '완전 열림';
      steamState.className = `state-pill ${s.steam ? 'on' : 'off'}`;
      breakerState.textContent = s.breaker ? '투입' : '개방';
      breakerState.className = `state-pill ${s.breaker ? 'on' : 'off'}`;
    };
    const off = onDynamo((ev) => {
      if (ev === 'warmed' || ev === 'rated') log.textContent = DYN_TEXT[ev];
    });
    let t = 0;
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      nav,
      update: (dt, input) => {
        t += dt;
        if (t > 0.1) {
          t = 0;
          render();
        }
        nav.update(input);
      },
      onClose: () => {
        off();
        resolve();
      },
    });
    render();
  });
}

// ------------------------------------------------------------------ Wireless

export function openRadioPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let wave = g.num('radio.wave') || 1800;
    let letter = '';
    let text = '';
    let downAt = -1;
    let idle = 0;
    let clock = 0;
    let replying = false;
    let failures = g.num('radio.fail');
    let closed = false;
    const waveEl = h('div', { class: 'val' });
    const cur = h('div', { class: 'morse-out' });
    const out = h('div', { class: 'morse-out' });
    const log = h('div', { class: 'log', text: g.flag('sosSent') ? '마그누스호가 응답했다. 새벽까지 버티면 된다.' : '수화기에서 공전 잡음이 끓는다.' });
    const setWave = (w: number) => {
      wave = Math.max(300, Math.min(2500, w));
      g.setFlag('radio.wave', wave);
      waveEl.textContent = `${wave.toLocaleString('en-US')} m`;
      g.audio.sfx('safe-click');
    };
    const pushSym = (sym: '.' | '-') => {
      if (replying) return;
      letter += sym;
      idle = 0;
      g.audio.sfx(sym === '.' ? 'morse-dot' : 'morse-dash');
      const gap = g.room.get('spark');
      if (gap) {
        gap.visible = true;
        setTimeout(() => (gap.visible = false), sym === '.' ? 90 : 250);
      }
      paint();
    };
    const commit = () => {
      if (!letter) return;
      text += decodeLetter(letter);
      letter = '';
      paint();
      if (endsWithSOS(text)) void transmitted();
    };
    const clear = () => {
      letter = '';
      text = '';
      paint();
    };
    const paint = () => {
      cur.textContent = letter.replace(/\./g, '·').replace(/-/g, '−') || ' ';
      out.textContent = text.split('').join(' ') || ' ';
    };
    const transmitted = async () => {
      replying = true;
      if (!isDistressWavelength(wave)) {
        failures += 1;
        g.setFlag('radio.fail', failures);
        log.textContent = '신호를 보냈다. …응답이 없다. 이 파장에서는 아무도 듣고 있지 않은 것 같다.';
        if (failures >= 2) log.textContent += '\n(의뢰서에 마그누스호가 청취하는 주파수가 적혀 있었다. 다이얼은 미터 단위다.)';
        g.audio.sfx('static');
        text = '';
        paint();
        replying = false;
        return;
      }
      log.textContent = '신호를 보냈다. 수화기에 귀를 기울인다…';
      await g.wait(1.6);
      // The Magnus answers: "R" (received) twice.
      for (const code of [...encodeText('RR'), ...encodeText('K')]) {
        for (const s of code) {
          g.audio.sfx(s === '.' ? 'morse-dot' : 'morse-dash');
          await g.wait(s === '.' ? 0.16 : 0.34);
        }
        await g.wait(0.3);
      }
      g.setFlag('sosSent');
      log.textContent = '응답이다! "R R — 탈라사, 위치 확인. 안개 걷히는 대로 새벽에 접근. 불을 지켜라 — 마그누스."';
      replying = false;
      g.note('마그누스호에 조난 신호가 전달되었다');
      // The wireless room script checks for the ending when the panel closes; if the player already
      // walked away from the set while the reply was coming in, finish from here.
      if (closed && readyForEnding(g)) {
        await g.say('수화기 너머로 마그누스호의 응답이 들려왔다.');
        await dawnComes(g);
      }
    };
    const key = h('button', { class: 'btn morse-key', type: 'button', text: '전건 (누르고 있기)' }) as HTMLButtonElement;
    let source: 'kbd' | 'ptr' | null = null;
    const press = (src: 'kbd' | 'ptr') => {
      if (downAt >= 0 || replying) return;
      downAt = clock;
      source = src;
      key.classList.add('down');
    };
    const release = () => {
      if (downAt >= 0) {
        pushSym(classifyPress(clock - downAt));
        downAt = -1;
      }
      source = null;
      key.classList.remove('down');
    };
    key.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      key.setPointerCapture(e.pointerId);
      press('ptr');
    });
    key.addEventListener('pointerup', () => source === 'ptr' && release());
    key.addEventListener('pointercancel', () => source === 'ptr' && release());
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'WIRELESS · 불꽃 송신기' }),
      h('h2', { text: '무선 전신' }),
      h('p', { class: 'muted', text: 'Space 누르고 있기: 전건 (짧게 ·, 길게 −) · ←→ 파장 ±10 · ↑↓ ±100 · F 지우기 · Esc 물러나기' }),
      h(
        'div',
        { class: 'radio-wave' },
        button('−100', () => setWave(wave - 100)),
        button('−10', () => setWave(wave - 10)),
        waveEl,
        button('+10', () => setWave(wave + 10)),
        button('+100', () => setWave(wave + 100)),
      ),
      h('div', { class: 'plate-note', text: '명판: 파장(m) × 주파수(kc) = 300,000' }),
      cur,
      out,
      key,
      h('div', { class: 'row' }, button('· 단점', () => pushSym('.')), button('− 장점', () => pushSym('-')), button('글자 확정', commit), button('지우기', clear), button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        clock += dt;
        if (input.justPressed('left')) setWave(wave - 10);
        if (input.justPressed('right')) setWave(wave + 10);
        if (input.justPressed('up')) setWave(wave + 100);
        if (input.justPressed('down')) setWave(wave - 100);
        if (input.justPressed('attack')) clear();
        if (input.justPressed('action')) press('kbd');
        if (source === 'kbd' && !input.isDown('action')) release();
        if (downAt < 0 && letter) {
          idle += dt;
          if (idle > 0.9) commit();
        }
      },
      onClose: () => {
        closed = true;
        resolve();
      },
    });
    setWave(wave);
    paint();
  });
}
