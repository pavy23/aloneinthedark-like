import type { Game } from '../game/Game';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';
import { decodeLetter, encodeText } from '../game/logic';
import { BRIDGE_RATIOS, CORE_OHMS_PER_NM, SHUNTS, balanceVerdict, bridgeReading, faultDistance, galvanometerSpot } from '../game/logic2';
import {
  CANDLE_SECONDS,
  CELLS_NEEDED,
  HUT_NM,
  TAPE_UNITS,
  bridgeView,
  decodeCable,
  hutSignal,
  nightTape,
  tryCombo,
  type HutStage,
  type SwitchKey,
  type TapeMark,
} from '../game/logic3';
import {
  SWITCH_KEYS,
  SWITCH_LABEL,
  battery,
  candleLeft,
  cellsInString,
  cellsRead,
  coilWait,
  faultNow,
  getSwitchboard,
  markRead,
  rackSgs,
  setSwitch,
  toggleCell,
  withPell,
} from '../game/act3';

const dotDash = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−');

// ------------------------------------------------------------------ The night tape (siphon recorder)

interface TapeGroup {
  from: number;
  to: number;
  code: string;
}

/** Split the marks into letters the way a clerk reads them: pauses longer than an element split letters. */
function groupMarks(marks: readonly TapeMark[]): TapeGroup[] {
  const out: TapeGroup[] = [];
  let cur: TapeGroup | null = null;
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (!cur) cur = { from: m.at, to: m.at + 1, code: '' };
    cur.code += m.dir === 1 ? '.' : '-';
    cur.to = m.at + 1;
    const next = marks[i + 1];
    if (!next || next.at - m.at - TAPE_UNITS.element > TAPE_UNITS.elementGap) {
      out.push(cur);
      cur = null;
    }
  }
  return out;
}

export function openTapePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const tape = nightTape(g.num('a3.combo'));
    const groups = groupMarks(tape.marks);
    const card = g.hasItem('codeCard');
    const VIEW = 30;
    const MARGIN = 4;
    const maxPos = tape.length + MARGIN - VIEW;
    let pos = -MARGIN;
    let reading = card && g.flag('a3.tapeMemo');
    let t = 0;
    const canvas = h('canvas', { width: 480, height: 150, class: 'tape-strip' }) as HTMLCanvasElement;
    const log = h('div', { class: 'log' });
    const memoBtn = button('', () => toggleMemo()) as HTMLButtonElement;
    memoBtn.hidden = !card;
    const scroll = (d: number) => {
      pos = Math.max(-MARGIN, Math.min(maxPos, pos + d));
    };
    const toggleMemo = () => {
      reading = !reading;
      g.setFlag('a3.tapeMemo', reading);
      g.audio.sfx('doc');
      paint();
    };
    const paint = () => {
      memoBtn.textContent = reading ? '판독 메모 지우기' : '판독 메모 (카드대로 읽기)';
      memoBtn.classList.toggle('on', reading);
      const atEnd = pos > tape.length - VIEW * 0.6;
      if (!card) {
        log.textContent = '잉크 선이 가운데에서 위아래로 흔들린 자국들. 판독 요령을 알면 읽을 수 있을 텐데.';
      } else if (!reading) {
        log.textContent = '가운데 선보다 위로 흔들리면 점, 아래로 흔들리면 선. 글자 사이는 조금, 낱말 사이는 길게 쉰다.';
      } else {
        const literal = groups.map((gr) => decodeCable(gr.code)).join('');
        log.textContent = `카드대로 읽으면: ${readLine()}\n${literal.includes('?') ? '부호표에 없는 글자가 섞여 있다. 이대로는 말이 되지 않는다.' : ''}`;
      }
      if (atEnd) log.textContent += `${log.textContent ? '\n' : ''}…맨 끝, 한참 쉰 뒤에 세 번, 쉬고, 세 번.`;
    };
    /** The tape as a clerk writes it down: letters, with spaces at the long pauses. */
    const readLine = (): string => {
      let out = '';
      groups.forEach((gr, i) => {
        if (i > 0 && gr.from - groups[i - 1].to >= TAPE_UNITS.wordGap) out += ' ';
        out += decodeCable(gr.code);
      });
      return out;
    };
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      const u = W / VIEW;
      const mid = 58;
      ctx.fillStyle = '#e6dcc0';
      ctx.fillRect(0, 0, W, H);
      // Paper grain and the printed guide line.
      ctx.strokeStyle = 'rgba(120,100,70,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(W, mid);
      ctx.stroke();
      ctx.fillStyle = 'rgba(90,70,40,0.08)';
      for (let i = 0; i < 40; i++) ctx.fillRect(((i * 97 + Math.floor(pos * u)) % W + W) % W, (i * 37) % H, 2, 1);
      // The siphon's trace: a continuous ink line that swings up for a dot and down for a dash.
      ctx.strokeStyle = '#1f2a4a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const amp = 30;
      const marksIn = tape.marks.filter((m) => m.at + 1 >= pos - 1 && m.at <= pos + VIEW + 1);
      for (let px = 0; px <= W; px += 2) {
        const x = pos + px / u;
        let y = 0;
        for (const m of marksIn) {
          if (x >= m.at && x <= m.at + 1) y += m.dir * Math.sin(((x - m.at) / 1) * Math.PI);
        }
        // The siphon trembles a little even at rest.
        const wobble = Math.sin(x * 9.1) * 0.6 + Math.sin(x * 23.7 + 1) * 0.4;
        const py = mid - y * amp + wobble;
        if (px === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // Reading memo: the clerk's pencilled dots, dashes and letters under each group.
      if (reading) {
        ctx.fillStyle = '#5a3a1a';
        ctx.textAlign = 'center';
        for (const gr of groups) {
          const cx = ((gr.from + gr.to) / 2 - pos) * u;
          if (cx < -40 || cx > W + 40) continue;
          ctx.font = '13px monospace';
          ctx.fillText(dotDash(gr.code), cx, mid + amp + 22);
          ctx.font = 'bold 18px serif';
          ctx.fillText(decodeCable(gr.code), cx, mid + amp + 44);
        }
      }
      // Where we are on the strip.
      ctx.fillStyle = 'rgba(40,30,20,0.25)';
      ctx.fillRect(0, H - 5, W, 5);
      ctx.fillStyle = 'rgba(40,30,20,0.7)';
      const span = tape.length + MARGIN * 2;
      ctx.fillRect(((pos + MARGIN) / span) * W, H - 5, (VIEW / span) * W, 5);
    };
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'OPERATING ROOM · 사이펀 기록계' }),
      h('h2', { text: '2월 21일 밤의 기록지' }),
      h('p', { class: 'muted', text: '← → 기록지 넘기기 · Space 판독 메모 · Esc 물러나기' }),
      canvas,
      h(
        'div',
        { class: 'row' },
        button('◀ 앞으로', () => {
          scroll(-VIEW * 0.5);
          draw();
          paint();
        }),
        button('뒤로 ▶', () => {
          scroll(VIEW * 0.5);
          draw();
          paint();
        }),
        memoBtn,
        button('물러나기', () => g.ui.pop(modal)),
      ),
      log,
    );
    const wrap = h('div', { class: 'modal' }, panel);
    g.setFlag('a3.tapeSeen');
    const modal: Modal = g.ui.push({
      el: wrap,
      update: (dt, input) => {
        t += dt;
        if (input.isDown('left')) scroll(-dt * 16);
        if (input.isDown('right')) scroll(dt * 16);
        if (input.justPressed('action')) {
          input.consume('action');
          if (card) toggleMemo();
        }
        draw();
        if (t > 0.2) {
          t = 0;
          paint();
        }
      },
      onClose: () => resolve(),
    });
    paint();
    draw();
  });
}

// ------------------------------------------------------------------ The store's combination lock

export function openComboPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const vals = [0, 0, 0];
    let sel = 0;
    let repeat = 0;
    let done = false;
    const valEls: HTMLElement[] = [];
    const dialEls: HTMLElement[] = [];
    const msg = h('p', { class: 'log', text: '놋쇠 맹꽁이자물쇠. 숫자 바퀴 세 개.' });
    const setVal = (i: number, d: number) => {
      vals[i] = (vals[i] + d + 10) % 10;
      valEls[i].textContent = String(vals[i]);
      g.audio.sfx('safe-click');
    };
    const paint = () => dialEls.forEach((d, i) => d.classList.toggle('focus', i === sel));
    const dials = h(
      'div',
      { class: 'dials' },
      ...['백', '십', '일'].map((lab, i) => {
        const v = h('div', { class: 'val', text: '0' });
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
    const tryOpen = () => {
      if (done) return;
      const r = tryCombo(vals, g.num('a3.combo'));
      if (r === 'open') {
        done = true;
        g.audio.sfx('unlock');
        g.setFlag('a3.storeOpen');
        msg.textContent = '철컥. 걸쇠가 빠졌다.';
        setTimeout(() => g.ui.pop(modal), 600);
        return;
      }
      const fails = g.num('a3.comboFail') + 1;
      g.setFlag('a3.comboFail', fails);
      if (r === 'mirrored') g.setFlag('a3.comboMirrored');
      g.audio.sfx('locked');
      let text = r === 'mirrored' ? '딸깍… 걸린다. 기록지에 찍힌 숫자 그대로인데.' : '딸깍… 걸린다. 번호가 틀렸다.';
      if (fails >= 2 && (g.flag('a3.comboMirrored') || g.flag('a3.tapeSeen')))
        text += '\n(소장의 일지: 메아리는 점과 선이 뒤집혀 돌아온다. 기록지에 찍힌 것은 소장이 보낸 전문이 아니라 그 메아리다.)';
      if (fails >= 4) text += '\n(판독 요령 카드의 숫자표: 점과 선을 모두 바꾸면 숫자도 다른 숫자가 된다. 1은 6으로, 2는 7로…)';
      msg.textContent = text;
    };
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'BATTERY ROOM · 창고' }),
      h('h2', { text: '세 자리 숫자 자물쇠' }),
      h('p', { class: 'muted', text: '← → 바퀴 선택 · ↑ ↓ 숫자 · Space 당겨 보기 · Esc 물러나기' }),
      dials,
      msg,
      h('div', { class: 'row' }, button('당겨 보기', tryOpen), button('물러나기', () => g.ui.pop(modal))),
    );
    const wrap = h('div', { class: 'modal' }, panel);
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
          if (repeat > 0.12) {
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

// ------------------------------------------------------------------ The battery rack

export function openRackPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const sgs = rackSgs(g);
    let sel = 0;
    const cells: HTMLButtonElement[] = [];
    const status = h('div', { class: 'rack-status' });
    const log = h('div', { class: 'log', text: g.hasItem('hydrometer') ? '셀마다 황산을 빨아올려 뜨개의 눈금을 읽는다. 1.250 이상이 충전 양호.' : '비중계가 없다. 눈으로는 어느 셀이 살아 있는지 알 수 없다.' });
    const syncLugs = () => {
      const on = new Set(cellsInString(g));
      for (let i = 0; i < 16; i++) {
        const lug = g.room.get(`lug${i}`);
        if (lug) lug.visible = on.has(i);
      }
    };
    const paint = () => {
      const on = new Set(cellsInString(g));
      const read = new Set(cellsRead(g));
      cells.forEach((b, i) => {
        b.classList.toggle('focus', i === sel);
        b.classList.toggle('on', on.has(i));
        b.querySelector('.sg')!.textContent = read.has(i) ? sgs[i].toFixed(3) : '—';
        b.querySelector('.mark')!.textContent = on.has(i) ? '● 직렬' : '';
      });
      const n = on.size;
      status.textContent = `직렬 ${n} / ${CELLS_NEEDED}개 · 약 ${n * 2} V`;
      measureBtn.disabled = !g.hasItem('hydrometer');
      toggleBtn.textContent = on.has(sel) ? `${sel + 1}번 셀 빼기` : `${sel + 1}번 셀 넣기`;
    };
    const select = (i: number) => {
      sel = i;
      g.audio.sfx('ui-move');
      paint();
    };
    const measure = () => {
      if (!g.hasItem('hydrometer')) {
        g.audio.sfx('locked');
        log.textContent = '비중계가 없다.';
        return;
      }
      markRead(g, sel);
      g.audio.sfx('hydrometer');
      const sg = sgs[sel];
      log.textContent = `${sel + 1}번 셀 — 비중 ${sg.toFixed(3)}. ${sg >= 1.25 ? '충전 양호.' : sg >= 1.15 ? '충전 부족.' : '방전됐다.'}`;
      paint();
    };
    const toggle = () => {
      const on = cellsInString(g).includes(sel);
      if (!on && cellsInString(g).length >= CELLS_NEEDED) {
        g.audio.sfx('locked');
        log.textContent = '연결띠가 열두 개뿐이다. 다른 셀을 먼저 빼야 한다.';
        return;
      }
      toggleCell(g, sel);
      g.audio.sfx('safe-click');
      syncLugs();
      const b = battery(g);
      log.textContent = on ? `${sel + 1}번 셀을 직렬에서 뺐다.` : `${sel + 1}번 셀에 연결띠를 물렸다.`;
      if (b.count === CELLS_NEEDED) log.textContent += ' 열두 개가 직렬로 이어졌다.';
      paint();
    };
    const grid = h('div', { class: 'rack-grid' });
    // Top shelf (cells 9–16) above the bottom shelf (1–8), as they stand on the rack.
    for (const row of [1, 0]) {
      for (let k = 0; k < 8; k++) {
        const i = row * 8 + k;
        const b = button('', () => select(i)) as HTMLButtonElement;
        b.classList.add('cell');
        b.append(h('span', { class: 'no', text: String(i + 1) }), h('span', { class: 'sg', text: '—' }), h('span', { class: 'mark' }));
        cells[i] = b;
        grid.append(b);
      }
    }
    const measureBtn = button('비중 재기', measure) as HTMLButtonElement;
    const toggleBtn = button('', toggle) as HTMLButtonElement;
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'BATTERY ROOM · 납축전지 16개' }),
      h('h2', { text: '코일용 축전지' }),
      h('p', { class: 'muted', text: '방향키 셀 고르기 · F 비중 재기 · Space 직렬에 넣기/빼기 · Esc 물러나기' }),
      grid,
      status,
      h('div', { class: 'row' }, measureBtn, toggleBtn, button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      update: (_dt, input) => {
        if (input.justPressed('left')) select((sel + 15) % 16);
        if (input.justPressed('right')) select((sel + 1) % 16);
        if (input.justPressed('up') || input.justPressed('down')) select((sel + 8) % 16);
        if (input.justPressed('attack')) {
          input.consume('attack');
          measure();
        }
        if (input.justPressed('action')) {
          input.consume('action');
          toggle();
        }
      },
      onClose: () => resolve(),
    });
    paint();
  });
}

// ------------------------------------------------------------------ The line switchboard

const SWITCH_STATE: Record<SwitchKey, [string, string]> = {
  recorder: ['물림', '뗌'],
  condenser: ['직렬', '우회'],
  protector: ['물림', '뗌'],
  bridge: ['물림', '뗌'],
  coil: ['물림', '뗌'],
};

const SWITCH_TEXT: Record<SwitchKey, [string, string]> = {
  recorder: ['기록계를 회선에 물렸다. 들어오는 신호가 기록지에 찍힌다.', '송수신 스위치를 내렸다. 기록계가 회선에서 떨어졌다.'],
  condenser: ['우회 고리를 뽑았다. 신호 축전기가 다시 회선에 직렬로 들어갔다.', '우회 고리를 꽂았다. 신호 축전기를 건너뛰어 회선이 곧장 이어진다.'],
  protector: ['피뢰기를 회선에 물렸다. 방전 간극이 회선과 땅 사이에 선다.', '피뢰기를 회선에서 뗐다. 이제 벼락이 쳐도 막을 것이 없다.'],
  bridge: ['시험 단자를 물렸다. 브리지가 회선에 이어졌다.', '시험 단자를 뗐다. 브리지가 회선에서 떨어졌다.'],
  coil: ['⑤번 칼날을 밀어 넣었다. 유도 코일의 2차가 회선에 물렸다.', '⑤번을 내렸다. 코일이 회선에서 떨어졌다.'],
};

/** Knife-switch handle angle: closed (up, into the jaws) or thrown (swung down and out). */
export function syncSwitchHandles(g: Game): void {
  const s = getSwitchboard(g);
  SWITCH_KEYS.forEach((k, i) => {
    const sw = g.room.get(`sw${i}`);
    if (!sw) return;
    sw.rotation.x = s[k] ? 0 : 2.2;
    if (k === 'coil') sw.visible = g.flag('a3.handle');
  });
}

export function openSwitchPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const pills = new Map<SwitchKey, HTMLElement>();
    const btns = new Map<SwitchKey, HTMLButtonElement>();
    const log = h('div', { class: 'log', text: '슬레이트 판 위의 칼날 스위치 다섯 개. 놋쇠 명판에 번호가 박혀 있다.' });
    const render = () => {
      const s = getSwitchboard(g);
      for (const k of SWITCH_KEYS) {
        const pill = pills.get(k)!;
        const on = s[k];
        const noHandle = k === 'coil' && !g.flag('a3.handle');
        pill.textContent = noHandle ? '손잡이 없음' : on ? SWITCH_STATE[k][0] : SWITCH_STATE[k][1];
        pill.className = `state-pill ${on && !noHandle ? 'on' : 'off'}`;
        btns.get(k)!.disabled = noHandle;
      }
      syncSwitchHandles(g);
      nav.refresh();
    };
    const toggle = (k: SwitchKey) => {
      if (k === 'coil' && !g.flag('a3.handle')) return;
      const on = !getSwitchboard(g)[k];
      setSwitch(g, k, on);
      g.audio.sfx('breaker');
      log.textContent = SWITCH_TEXT[k][on ? 0 : 1];
      render();
    };
    const rows = SWITCH_KEYS.map((k) => {
      const pill = h('span', { class: 'state-pill' });
      pills.set(k, pill);
      const b = button(SWITCH_LABEL[k], () => toggle(k)) as HTMLButtonElement;
      b.append(pill);
      btns.set(k, b);
      return b;
    });
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'BATTERY ROOM · 회선 전환반' }),
      h('h2', { text: '해저선 칼날 스위치' }),
      h('div', { class: 'controls switch-list' }, ...rows),
      h('div', { class: 'row' }, button('결선도 보기', () => void g.readDoc('switchPlan')), button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio);
    if (g.hasItem('swHandle') && !g.flag('a3.handle')) {
      g.setFlag('a3.handle');
      g.takeItem('swHandle');
      g.audio.sfx('unlock');
      log.textContent = '⑤번 빈자리에 손잡이를 끼워 넣었다. 꼭 맞는다.';
    }
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      nav,
      update: (_dt, input) => nav.update(input),
      onClose: () => resolve(),
    });
    render();
  });
}

// ------------------------------------------------------------------ The bridge, measuring from the shore end

const RATIO_ARMS = ['10 : 1000', '100 : 1000', '1000 : 1000'];

/** What the bridge sees on its unknown arm: the cable to the fault, or (condenser in, test link out) nothing. */
function lineOhms(g: Game): number {
  const v = bridgeView(getSwitchboard(g));
  return v === 'line' ? CORE_OHMS_PER_NM * faultNow(g) : Infinity;
}

export function openBridge3Panel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let ratioI = g.num('a3.ratio');
    let shuntI = g.num('a3.shunt');
    const dials = [0, 1, 2, 3].map((i) => g.num(`a3.d${i}`));
    let sel = 0;
    let spot = 0;
    let vel = 0;
    let repeat = 0;
    const canvas = h('canvas', { width: 420, height: 70, class: 'galvo-scale' }) as HTMLCanvasElement;
    const valEls: HTMLElement[] = [];
    const dialEls: HTMLElement[] = [];
    const ratioBtn = button('', () => cycleRatio()) as HTMLButtonElement;
    const shuntBtn = button('', () => cycleShunt()) as HTMLButtonElement;
    const readEl = h('div', { class: 'bridge-read' });
    const log = h('div', { class: 'log', text: '역의 시험용 브리지. 측정 단자는 회선 전환반의 ④번으로 이어진다.' });
    const reading = () => bridgeReading(dials, BRIDGE_RATIOS[ratioI]);
    const save = () => {
      g.setFlag('a3.ratio', ratioI);
      g.setFlag('a3.shunt', shuntI);
      dials.forEach((v, i) => g.setFlag(`a3.d${i}`, v));
    };
    const paint = () => {
      dialEls.forEach((d, i) => d.classList.toggle('focus', i === sel));
      valEls.forEach((v, i) => (v.textContent = String(dials[i])));
      ratioBtn.textContent = `비율 팔 ${RATIO_ARMS[ratioI]} (×${BRIDGE_RATIOS[ratioI]})`;
      const sh = SHUNTS[shuntI];
      shuntBtn.textContent = sh === 1 ? '분류기 없음 (최대 감도)' : `분류기 1/${Math.round(1 / sh) - 1}`;
      readEl.textContent = `다이얼 ${dials.join('')} × ${BRIDGE_RATIOS[ratioI]} = ${reading().toFixed(2)} Ω`;
      save();
    };
    const cycleRatio = () => {
      ratioI = (ratioI + 1) % BRIDGE_RATIOS.length;
      g.audio.sfx('safe-click');
      paint();
    };
    const cycleShunt = () => {
      shuntI = (shuntI + 1) % SHUNTS.length;
      g.audio.sfx('safe-click');
      paint();
    };
    const setDial = (i: number, d: number) => {
      dials[i] = (dials[i] + d + 10) % 10;
      g.audio.sfx('galvo');
      paint();
    };
    const record = () => {
      const view = bridgeView(getSwitchboard(g));
      if (view === 'none') {
        g.audio.sfx('locked');
        log.textContent = '광점이 눈금 왼쪽 끝에 붙어 있다. 브리지가 회선에 물려 있지 않다 — 전환반의 ④번 시험 단자가 떨어져 있다.';
        return;
      }
      if (view === 'open') {
        g.audio.sfx('locked');
        const n = g.num('a3.openTries') + 1;
        g.setFlag('a3.openTries', n);
        log.textContent = '다이얼을 끝까지 올려도 광점이 왼쪽 끝에서 꼼짝하지 않는다. 회선이 끊긴 것처럼 — 직류가 어딘가에서 막힌다.';
        if (n >= 2) log.textContent += '\n(결선도: 신호 축전기는 직류를 통과시키지 않는다. 저항 시험 때는 ②를 우회할 것.)';
        return;
      }
      const truth = lineOhms(g);
      const r = reading();
      const verdict = balanceVerdict(truth, r, BRIDGE_RATIOS[ratioI], SHUNTS[shuntI]);
      if (verdict !== 'balanced') {
        g.audio.sfx('locked');
        log.textContent =
          verdict === 'shunted'
            ? '광점은 영점 근처다. 하지만 분류기를 끼운 채로는 마지막 자리를 믿을 수 없다. 분류기를 빼고 다시 맞춘다.'
            : verdict === 'coarse'
              ? '광점은 영점에 있다. 하지만 다이얼 자리가 남는다. 비율 팔을 낮춰야 제대로 된 값이 나온다.'
              : Math.abs(spot) > 0.5
                ? '광점이 눈금 끝에 붙어 있다. 아직 멀었다.'
                : '광점이 영점에서 조금 비켜나 있다. 다이얼을 더 맞춰야 한다.';
        return;
      }
      g.audio.sfx('ui-ok');
      const d = faultDistance(r, CORE_OHMS_PER_NM);
      const prev = g.num('a3.recLast');
      const n = g.num('a3.recN');
      g.setFlag('a3.recN', n + 1);
      g.setFlag('a3.recLast', d);
      const beyond = Math.max(0, (d - HUT_NM) * 1852);
      log.textContent = `균형 — ${r.toFixed(2)} Ω. 고장점까지 ${d.toFixed(3)}해리.\n오두막까지가 ${HUT_NM.toFixed(3)}해리이니, 오두막에서 바다 쪽으로 ${Math.round(beyond / 10) * 10}미터 남짓. 해안 구간이다.`;
      if (n > 0 && d < prev - 0.0005) log.textContent += '\n…방금 전보다 줄었다. 다가온다.';
      if (!g.flag('a3.measured')) {
        g.setFlag('a3.measured');
        g.audio.sfx('stinger', { volume: 0.5 });
      }
    };
    const dialBox = h(
      'div',
      { class: 'dials' },
      ...['천', '백', '십', '일'].map((lab, i) => {
        const v = h('div', { class: 'val', text: '0' });
        valEls.push(v);
        const d = h(
          'div',
          { class: 'dial' },
          h('label', { text: lab }),
          button('▲', () => {
            sel = i;
            setDial(i, 1);
          }),
          v,
          button('▼', () => {
            sel = i;
            setDial(i, -1);
          }),
        );
        dialEls.push(d);
        return d;
      }),
    );
    const panel = h(
      'div',
      { class: 'panel bridge' },
      h('div', { class: 'eyebrow', text: 'TESTING BENCH · 휘트스톤 브리지와 미러 검류계' }),
      h('h2', { text: '해안 구간 측정' }),
      h('p', { class: 'muted', text: '←→ 자리 · ↑↓ 값 · Shift/Tab 비율 팔 · F 분류기 · Space 기록 · Esc 물러나기 (패드: Y 비율 · X 분류기 · A 기록 · B 물러나기)' }),
      h('div', { class: 'row' }, ratioBtn, shuntBtn),
      canvas,
      dialBox,
      readEl,
      h('div', { class: 'row' }, button('측정 기록', record), button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const w = canvas.width;
      const ht = canvas.height;
      ctx.fillStyle = '#e9e1c8';
      ctx.fillRect(0, 0, w, ht);
      ctx.strokeStyle = '#2a2016';
      ctx.fillStyle = '#2a2016';
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      for (let i = -10; i <= 10; i++) {
        const x = w / 2 + (i / 10) * (w / 2 - 14);
        ctx.lineWidth = i === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, i % 5 === 0 ? 26 : 18);
        ctx.stroke();
        if (i % 5 === 0) ctx.fillText(String(Math.abs(i * 10)), x, 40);
      }
      const x = w / 2 + spot * (w / 2 - 14);
      const grd = ctx.createRadialGradient(x, 52, 1, x, 52, 13);
      grd.addColorStop(0, 'rgba(255,250,220,1)');
      grd.addColorStop(0.4, 'rgba(255,220,140,0.85)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - 14, 38, 28, 28);
    };
    const roomSpot = g.room.get('spot');
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        const target = galvanometerSpot(lineOhms(g), reading(), SHUNTS[shuntI]);
        vel += (target - spot) * 60 * dt - vel * 9 * dt;
        spot = Math.max(-1.05, Math.min(1.05, spot + vel * dt));
        draw();
        if (roomSpot) roomSpot.position.x = spot * 0.3;
        if (input.justPressed('left')) {
          sel = (sel + 3) % 4;
          g.audio.sfx('ui-move');
          paint();
        }
        if (input.justPressed('right')) {
          sel = (sel + 1) % 4;
          g.audio.sfx('ui-move');
          paint();
        }
        const up = input.isDown('up');
        const dn = input.isDown('down');
        if (input.justPressed('up')) {
          setDial(sel, 1);
          repeat = -0.35;
        } else if (input.justPressed('down')) {
          setDial(sel, -1);
          repeat = -0.35;
        } else if (up || dn) {
          repeat += dt;
          if (repeat > 0.09) {
            repeat = 0;
            setDial(sel, up ? 1 : -1);
          }
        }
        if (input.justPressed('run') && !input.justPressed('cancel')) cycleRatio();
        if (input.justPressed('inventory')) {
          input.consume('inventory');
          cycleRatio();
        }
        if (input.justPressed('attack')) {
          input.consume('attack');
          cycleShunt();
        }
        if (input.justPressed('action')) {
          input.consume('action');
          record();
        }
      },
      onClose: () => resolve(),
    });
    paint();
    draw();
  });
}

// ------------------------------------------------------------------ The induction coil

export function openCoilPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const lines = h('div', { class: 'coil-status' });
    const log = h('div', { class: 'log', text: '단속기의 놋쇠 망치가 철심 끝에 닿아 있다. 1차 스위치를 넣으면 망치가 떨기 시작한다.' });
    const fireBtn = button('1차 스위치 넣기 (지금 쏜다)', () => {
      g.setFlag('a3.fireNow');
      g.ui.pop(modal);
    }) as HTMLButtonElement;
    const candleBtn = button('', () => {
      if (candleLeft(g) > 0) {
        g.setFlag('a3.timerAt', 0);
        g.audio.sfx('ui-back');
        log.textContent = '양초를 불어 껐다. 끈은 반쯤 그을렸다.';
      } else {
        g.setFlag('a3.timerAt', g.playTime + CANDLE_SECONDS);
        g.setFlag('a3.lit', g.num('a3.lit') + 1);
        g.audio.sfx('match');
        log.textContent = `스위치 손잡이를 끈으로 매달아 올리고, 그 끈 밑에 양초를 세워 불을 붙였다. 끈이 타서 끊어지면 손잡이가 떨어지며 스위치가 들어간다. 약 ${CANDLE_SECONDS}초.`;
      }
      paint();
    }) as HTMLButtonElement;
    const paint = () => {
      const b = battery(g);
      const s = getSwitchboard(g);
      const onLine = SWITCH_KEYS.filter((k) => k !== 'coil' && (k === 'condenser' ? s.condenser : s[k])).map((k) => SWITCH_LABEL[k].split(' (')[0]);
      const wait = coilWait(g);
      const left = candleLeft(g);
      lines.replaceChildren(
        h('div', { text: `축전지: 직렬 ${b.count}개 · 약 ${b.count * 2} V` }),
        h('div', { text: `고압 단자 ⑤: ${!g.flag('a3.handle') ? '손잡이 없음' : s.coil ? '회선에 물림' : '떨어져 있음'}` }),
        h('div', { text: `회선에 함께 물린 것: ${onLine.length ? onLine.join(', ') : '없음'}` }),
        h('div', { text: wait > 0 ? `단속기 식는 중… ${Math.ceil(wait)}초` : '단속기: 준비됨' }),
        h('div', { text: left > 0 ? `양초: 타는 중 — 약 ${Math.ceil(left)}초 뒤 스위치가 떨어진다` : g.hasItem('candle') ? '양초: 있음' : '양초: 없음' }),
      );
      fireBtn.disabled = wait > 0;
      candleBtn.textContent = left > 0 ? '양초 끄기' : '양초 타이머 세우기';
      candleBtn.disabled = left <= 0 && (!g.hasItem('candle') || wait > 0);
    };
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'BATTERY ROOM · 유도 코일 (5피트)' }),
      h('h2', { text: '고압 유도 코일' }),
      lines,
      h('div', { class: 'row' }, fireBtn, candleBtn, button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio);
    let t = 0;
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      nav,
      update: (dt, input) => {
        t += dt;
        if (t > 0.25) {
          t = 0;
          paint();
          nav.refresh();
        }
        nav.update(input);
      },
      onClose: () => resolve(),
    });
    paint();
    nav.refresh();
  });
}

// ------------------------------------------------------------------ The land-line key in the cable hut

const HUT_STAGES: HutStage[] = ['idle', 'asked', 'fire'];

export function openHutKeyPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    // Pell only listens on the line once he is sitting at the coil.
    const pellListening = withPell(g) && g.flag('a3.pellReady');
    let stage: HutStage = HUT_STAGES[g.num('a3.hut')] ?? 'idle';
    if (!pellListening) stage = 'idle';
    let letter = '';
    let text = '';
    let downAt = -1;
    let idle = 0;
    let clock = 0;
    let busy = false;
    let closed = false;
    const cur = h('div', { class: 'morse-out' });
    const out = h('div', { class: 'morse-out' });
    const heard = h('div', { class: 'log hut-log', text: '오두막의 육선 키. 역의 회선 전환반으로 이어진다. 누르면 역의 계기가 움직인다 — 듣는 사람이 있다면.' });
    const status = h('div', { class: 'hut-status' });
    /** While signals are coming back down the line, the key is held off (and says so). */
    const setBusy = (b: boolean) => {
      busy = b;
      status.dataset.busy = b ? '1' : '0';
      status.textContent = b ? '수신 중 — 회선에서 들어오는 신호를 듣는다…' : '키를 칠 수 있다.';
      key.disabled = b;
      key.classList.toggle('off', b);
    };
    const play = async (code: string, vol: number) => {
      for (const sym of code) {
        g.audio.sfx(sym === '.' ? 'morse-dot' : 'morse-dash', { volume: vol });
        await g.wait(sym === '.' ? 0.16 : 0.34);
      }
      await g.wait(0.3);
    };
    const addLine = (line: string) => {
      heard.textContent = `${heard.textContent}\n${line}`.split('\n').slice(-8).join('\n');
    };
    const paint = () => {
      cur.textContent = dotDash(letter) || ' ';
      out.textContent = text.split('').join(' ') || ' ';
    };
    const pushSym = (sym: '.' | '-') => {
      if (busy) return;
      letter += sym;
      idle = 0;
      g.audio.sfx(sym === '.' ? 'morse-dot' : 'morse-dash');
      paint();
    };
    const commitLetter = () => {
      if (!letter) return;
      text += decodeLetter(letter);
      letter = '';
      idle = 0;
      paint();
    };
    /** The message is sent once the key has rested a while: then listen. */
    const send = async () => {
      if (!text || busy) return;
      const sent = text.replace(/\?/g, '');
      text = '';
      paint();
      // Nothing that reads as a letter: nothing worth sending.
      if (!sent) return;
      setBusy(true);
      addLine(`보냄: ${sent}`);
      const step = pellListening ? hutSignal(stage, sent) : { stage: 'idle' as HutStage, heard: [{ from: 'thing' as const, text: sent }] };
      await g.wait(0.8);
      for (const m of step.heard) {
        if (closed) break;
        for (const code of encodeText(m.text)) await play(code, m.from === 'pell' ? 0.9 : 0.7);
        addLine(`회선: ${m.text}  ${encodeText(m.text).map(dotDash).join(' ')}`);
        await g.wait(0.4);
      }
      stage = step.stage;
      g.setFlag('a3.hut', HUT_STAGES.indexOf(stage));
      if (!pellListening && !g.flag('a3.hutEcho')) {
        g.setFlag('a3.hutEcho');
        addLine('…내가 친 그대로다. 회선 저편에서 무언가 따라 치고 있다.');
      }
      if (stage === 'fire') {
        addLine('…역 쪽에서 낮게, 단속기가 우는 소리.');
        g.setFlag('a3.fireNow');
        await g.wait(1.2);
        if (!closed) g.ui.pop(modal);
        return;
      }
      setBusy(false);
    };
    const key = h('button', { class: 'btn morse-key', type: 'button', text: '키 (누르고 있기)' }) as HTMLButtonElement;
    let source: 'kbd' | 'ptr' | null = null;
    const press = (src: 'kbd' | 'ptr') => {
      if (downAt >= 0 || busy) return;
      downAt = clock;
      source = src;
      key.classList.add('down');
    };
    const release = () => {
      if (downAt >= 0) {
        pushSym(clock - downAt < 0.22 ? '.' : '-');
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
      h('div', { class: 'eyebrow', text: 'CABLE HUT · 육선 키' }),
      h('h2', { text: '역으로 신호 보내기' }),
      h('p', { class: 'muted', text: 'Space 누르고 있기: 키 (짧게 ·, 길게 −) · 잠시 쉬면 글자, 더 쉬면 전송 · F 지우기 · Esc 물러나기' }),
      cur,
      out,
      key,
      status,
      h(
        'div',
        { class: 'row' },
        button('· 단점', () => pushSym('.')),
        button('− 장점', () => pushSym('-')),
        button('보내기', () => {
          commitLetter();
          void send();
        }),
        button('지우기', () => {
          letter = '';
          text = '';
          paint();
        }),
        button('물러나기', () => g.ui.pop(modal)),
      ),
      heard,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        clock += dt;
        if (input.justPressed('attack')) {
          letter = '';
          text = '';
          paint();
        }
        if (input.justPressed('action')) press('kbd');
        if (source === 'kbd' && !input.isDown('action')) release();
        if (downAt < 0 && (letter || text) && !busy) {
          idle += dt;
          if (letter && idle > 0.9) commitLetter();
          else if (!letter && idle > 1.8) void send();
        }
      },
      onClose: () => {
        closed = true;
        resolve();
      },
    });
    setBusy(false);
    paint();
  });
}
