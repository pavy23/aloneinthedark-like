import type { Game } from '../game/Game';
import type { Modal } from './UI';
import type { Btn } from '../core/Input';
import { button, h } from './dom';
import { encodeText } from '../game/logic';
import { CORE_OHMS_PER_NM } from '../game/logic2';
import {
  CURRENT,
  DEAD_SLOW,
  FAULT_NM,
  HEAVE,
  ROCK_WIDTH,
  ROUTE_BEARING,
  RUN_SECONDS,
  bowLift,
  cableRise,
  crossingAngle,
  endOhms,
  endReply,
  grappleStop,
  grappleStrain,
  heaveStep,
  heaveTension,
  norm360,
  runParts,
  runVerdict,
  trackMadeGood,
  type EndId,
  type GrappleResult,
  type HeaveSpeed,
  type HeaveState,
} from '../game/logic4';
import { GRAPPLE_RESULTS, currentRun, deckGauge, theGoodEnd, withPell4 } from '../game/act4';

const dotDash = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−');
const pad3 = (deg: number) => String(Math.round(norm360(deg)) % 360).padStart(3, '0');
const RAD = Math.PI / 180;

/** Unit vector on the canvas for a true bearing (north up, east right). */
const dir = (bearing: number): [number, number] => [Math.sin(bearing * RAD), -Math.cos(bearing * RAD)];

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, head = 7): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.4) * head, y1 - Math.sin(a - 0.4) * head);
  ctx.lineTo(x1 - Math.cos(a + 0.4) * head, y1 - Math.sin(a + 0.4) * head);
  ctx.closePath();
  ctx.fill();
}

// ------------------------------------------------------------------ The chart: laying off the grappling run

export function openChartPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let heading = norm360(Math.round(g.num('a4.heading')));
    let repeat = 0;
    const canvas = h('canvas', { width: 440, height: 300, class: 'chart-plot' }) as HTMLCanvasElement;
    const read = h('div', { class: 'coil-status' });
    const card = g.hasItem('grappleCard');
    const log = h('div', {
      class: 'log',
      text: `선장: "해도로는 334도가 케이블과 직각이오. 그래플을 끌 때는 극미속, 물을 헤치고 ${DEAD_SLOW}노트요."${card ? '\n(갑판장의 수칙: 뱃머리가 가리키는 쪽과 배가 실제로 지나가는 쪽은 다르다.)' : ''}`,
    });
    const setHeading = (d: number) => {
      heading = norm360(heading + d);
      g.audio.sfx('safe-click', { volume: 0.5 });
      paint();
    };
    const commit = () => {
      g.setFlag('a4.heading', heading);
      g.setFlag('a4.runSet');
      g.setFlag('a4.chartDone');
      g.audio.sfx('ui-ok');
      g.ui.pop(modal);
    };
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W * 0.56;
      const cy = H * 0.5;
      ctx.fillStyle = '#e6dcc0';
      ctx.fillRect(0, 0, W, H);
      // Graticule
      ctx.strokeStyle = 'rgba(90,110,120,0.25)';
      ctx.lineWidth = 1;
      for (let x = 20; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 10; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // The cable's line
      const [ux, uy] = dir(ROUTE_BEARING);
      ctx.strokeStyle = '#2a2016';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - ux * 500, cy - uy * 500);
      ctx.lineTo(cx + ux * 500, cy + uy * 500);
      ctx.stroke();
      ctx.fillStyle = '#2a2016';
      ctx.font = '12px serif';
      ctx.textAlign = 'left';
      const cableLabel = `케이블 ${pad3(ROUTE_BEARING)}°–${pad3(ROUTE_BEARING + 180)}°`;
      ctx.fillText(cableLabel, Math.min(W - ctx.measureText(cableLabel).width - 8, cx + ux * 90 + 6), cy + uy * 90 + 18);
      // The run: the track made good across the cable, and the ship crabbing along it on her heading.
      const t = trackMadeGood(heading);
      const [tx, ty] = dir(t.course);
      ctx.strokeStyle = '#8a1a14';
      ctx.fillStyle = '#8a1a14';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(cx - tx * 130, cy - ty * 130);
      ctx.lineTo(cx + tx * 110, cy + ty * 110);
      ctx.stroke();
      ctx.setLineDash([]);
      arrow(ctx, cx + tx * 110, cy + ty * 110, cx + tx * 130, cy + ty * 130, 9);
      ctx.fillText('항적', cx + tx * 136 - 10, cy + ty * 136 + 4);
      // Ship: a small hull outline pointing along her heading.
      ctx.save();
      ctx.translate(cx - tx * 70, cy - ty * 70);
      ctx.rotate(heading * RAD);
      ctx.fillStyle = '#3a4a52';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(6, -6, 5, 10);
      ctx.lineTo(-5, 10);
      ctx.quadraticCurveTo(-6, -6, 0, -16);
      ctx.fill();
      ctx.restore();
      // Compass rose
      const rx = W - 34;
      const ry = 34;
      ctx.strokeStyle = '#5a4a2a';
      ctx.fillStyle = '#5a4a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, ry, 22, 0, Math.PI * 2);
      ctx.stroke();
      arrow(ctx, rx, ry + 14, rx, ry - 18, 6);
      ctx.font = 'bold 11px serif';
      ctx.textAlign = 'center';
      ctx.fillText('N', rx, ry - 25 < 8 ? 9 : ry - 25);
      // Inset: the current triangle as the navigator draws it.
      const ix = 10;
      const iy = H - 130;
      ctx.fillStyle = 'rgba(240,232,206,0.92)';
      ctx.fillRect(ix, iy, 132, 120);
      ctx.strokeStyle = '#5a4a2a';
      ctx.strokeRect(ix, iy, 132, 120);
      const S = 46;
      const ox = ix + 66;
      const oy = iy + 64;
      const [hx, hy] = dir(heading);
      const [kx, ky] = dir(CURRENT.set);
      const hX = ox + hx * DEAD_SLOW * S;
      const hY = oy + hy * DEAD_SLOW * S;
      const cX = hX + kx * CURRENT.rate * S;
      const cY = hY + ky * CURRENT.rate * S;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a4a6a';
      ctx.fillStyle = '#2a4a6a';
      arrow(ctx, ox, oy, hX, hY, 6);
      ctx.strokeStyle = '#2a6a3a';
      ctx.fillStyle = '#2a6a3a';
      arrow(ctx, hX, hY, cX, cY, 6);
      ctx.strokeStyle = '#8a1a14';
      ctx.fillStyle = '#8a1a14';
      arrow(ctx, ox, oy, cX, cY, 6);
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2a4a6a';
      ctx.fillText('침로', ix + 6, iy + 13);
      ctx.fillStyle = '#2a6a3a';
      ctx.fillText('조류', ix + 48, iy + 13);
      ctx.fillStyle = '#8a1a14';
      ctx.fillText('항적', ix + 90, iy + 13);
    };
    const paint = () => {
      const t = trackMadeGood(heading);
      read.replaceChildren(
        h('div', { text: `침로 (뱃머리): ${pad3(heading)}° · 극미속 ${DEAD_SLOW.toFixed(1)}노트` }),
        h('div', { text: `조류: ${pad3(CURRENT.set)}° 쪽으로 ${CURRENT.rate.toFixed(1)}노트 (어제 정선 중 표류 기록)` }),
        h('div', { text: `실제 항적: ${pad3(t.course)}° · 대지 속력 ${t.speed.toFixed(2)}노트` }),
        h('div', { text: `항적이 케이블과 이루는 각: ${Math.round(crossingAngle(t.course))}°` }),
      );
      draw();
    };
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'WHEELHOUSE · 해도대' }),
      h('h2', { text: '그래플 끌 침로' }),
      h('p', { class: 'muted', text: '← → 1° · ↑ ↓ 5° · Space 이 침로로 끈다 · Esc 물러나기' }),
      canvas,
      read,
      h(
        'div',
        { class: 'row' },
        button('−5°', () => setHeading(-5)),
        button('−1°', () => setHeading(-1)),
        button('+1°', () => setHeading(1)),
        button('+5°', () => setHeading(5)),
        button('이 침로로 끈다', commit),
        button('물러나기', () => g.ui.pop(modal)),
      ),
      log,
    );
    const wrap = h('div', { class: 'modal' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      update: (dt, input) => {
        const keys: Array<[Btn, number]> = [
          ['left', -1],
          ['right', 1],
          ['down', -5],
          ['up', 5],
        ];
        let held = 0;
        for (const [k, d] of keys) {
          if (input.justPressed(k)) {
            setHeading(d);
            repeat = -0.35;
          } else if (input.isDown(k)) held = d;
        }
        if (held) {
          repeat += dt;
          if (repeat > 0.08) {
            repeat = 0;
            setHeading(held);
          }
        }
        if (input.justPressed('action')) {
          input.consume('action');
          commit();
        }
      },
      onClose: () => resolve(),
    });
    paint();
  });
}

// ------------------------------------------------------------------ The dynamometer during a run

/** A grappling run as the bosun watches it on the dynamometer: two or three hours, told in eighty seconds. */
export function openGrapplePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const run = currentRun(g);
    const bites = runVerdict(g.num('a4.heading')) === 'ok';
    const first = g.num('a4.attempt') === 0;
    let p = 0;
    let t = 0;
    let done = false;
    let closed = false;
    let strain = 3;
    let saidRock = false;
    let saidRise = false;
    const trace: Array<[number, number]> = [];
    const canvas = h('canvas', { width: 440, height: 190, class: 'tape-strip strain-plot' }) as HTMLCanvasElement;
    const readEl = h('div', { class: 'bridge-read' });
    const log = h('div', { class: 'log', text: '그래플이 바닥에 닿았다. 기관 극미속 전진. 장력계 바늘이 3톤 언저리에서 흔들린다.' });
    const finish = (r: GrappleResult) => {
      if (done) return;
      done = true;
      g.setFlag('a4.result', GRAPPLE_RESULTS.indexOf(r));
      stopBtn.disabled = true;
      g.audio.sfx(r === 'parted' ? 'cable-run' : 'tick', { volume: 0.9 });
      log.textContent = r === 'parted' ? '바늘이 눈금 끝까지 치솟았다가 —' : '"기관 정지!" 갑판장이 선교에 손을 흔든다. 그래플 로프를 감기 시작한다.';
      window.setTimeout(() => {
        if (!closed) g.ui.pop(modal);
      }, 1100);
    };
    const stopBtn = button('기관 정지 — 감아올려라', () => finish(grappleStop(run, p, bites))) as HTMLButtonElement;
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      const y = (s: number) => H - 18 - ((s - 2) / 5) * (H - 34);
      ctx.fillStyle = '#e9e1c8';
      ctx.fillRect(0, 0, W, H);
      // Where the chart puts the cable: the bosun's pencilled band.
      ctx.fillStyle = 'rgba(140,110,60,0.16)';
      ctx.fillRect(0.42 * W, 0, 0.18 * W, H);
      ctx.fillStyle = '#6a5a3a';
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.fillText('해도상 케이블 선', 0.51 * W, 12);
      // Ton lines
      ctx.textAlign = 'left';
      for (let s = 2; s <= 7; s++) {
        ctx.strokeStyle = s === 3 ? 'rgba(60,40,20,0.45)' : 'rgba(60,40,20,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y(s));
        ctx.lineTo(W, y(s));
        ctx.stroke();
        ctx.fillStyle = '#5a4a2a';
        ctx.fillText(`${s}톤`, 4, y(s) - 2);
      }
      // The pen's trace
      ctx.strokeStyle = '#1f2a4a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      trace.forEach(([pp, s], i) => {
        const x = pp * W;
        if (i === 0) ctx.moveTo(x, y(s));
        else ctx.lineTo(x, y(s));
      });
      ctx.stroke();
      // The pen
      ctx.fillStyle = '#8a1a14';
      ctx.beginPath();
      ctx.arc(p * W, y(strain), 3.5, 0, Math.PI * 2);
      ctx.fill();
    };
    const paint = () => {
      const mins = Math.round(p * 150);
      readEl.textContent = `장력 ${strain.toFixed(1)}톤 · 경과 ${Math.floor(mins / 60)}시간 ${String(mins % 60).padStart(2, '0')}분`;
    };
    const panel = h(
      'div',
      { class: 'panel bridge' },
      h('div', { class: 'eyebrow', text: `FORE DECK · 다이나모미터 — ${g.num('a4.attempt') + 1}번째 끌기` }),
      h('h2', { text: '그래플 끌기' }),
      h('p', { class: 'muted', text: 'Space 기관 정지 (감아올리기) · Esc 그만두기 — 두세 시간의 끌기를 기록지 한 장으로 본다' }),
      canvas,
      readEl,
      h('div', { class: 'row' }, stopBtn, button('그만두기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        if (!done) {
          t += dt;
          p = Math.min(1, p + dt / RUN_SECONDS);
          strain = grappleStrain(run, p, t, bites);
          trace.push([p, strain]);
          deckGauge.driven = true;
          deckGauge.strain = strain;
          deckGauge.turn += dt * 0.25;
          // The bosun reads the first run aloud.
          if (first && !saidRock && run.rocks.some((r) => p > r + ROCK_WIDTH && p < r + ROCK_WIDTH * 3)) {
            saidRock = true;
            log.textContent = '갑판장: "방금 그건 바위요. 확 튀었다가 떨어지잖소. 케이블은 그렇게 안 하오."';
          }
          if (first && bites && !saidRise && cableRise(run, p) > 0.45) {
            saidRise = true;
            log.textContent = '갑판장: "…오르오. 꾸준히. 아직이오 — 바닥에서 띄워야 하오."';
          }
          if (runParts(run, p, bites)) finish('parted');
          else if (p >= 1) finish(grappleStop(run, 1, bites));
        }
        if (input.justPressed('action')) {
          input.consume('action');
          if (!done) finish(grappleStop(run, p, bites));
        }
        draw();
        paint();
      },
      onClose: () => {
        closed = true;
        deckGauge.driven = false;
        if (!done) g.setFlag('a4.result', -1);
        resolve();
      },
    });
    draw();
    paint();
  });
}

// ------------------------------------------------------------------ Heaving up the bight

const SPEED_LABEL = ['정지', '천천히', '반속'] as const;
const DEPTH_FATHOMS = 2100;

export function openHeavePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let s: HeaveState = { progress: g.num('a4.heaveP'), over: 0, parted: false };
    let speed: HeaveSpeed = 0;
    // The swell's clock starts with the bow going down into a trough: a few seconds to take in the panel.
    let t = HEAVE.period / 2;
    let done = false;
    let closed = false;
    let crest = false;
    const canvas = h('canvas', { width: 440, height: 170, class: 'tape-strip heave-plot' }) as HTMLCanvasElement;
    const readEl = h('div', { class: 'bridge-read' });
    const log = h('div', { class: 'log', text: '권양기 증기 밸브에 손을 얹는다. 쉬브 너머로 그래플 로프가 바다 속까지 팽팽하다.' });
    const speedBtns = SPEED_LABEL.map((label, i) => button(label, () => setSpeed(i as HeaveSpeed)) as HTMLButtonElement);
    const setSpeed = (v: HeaveSpeed) => {
      if (done || v === speed) return;
      speed = v;
      g.audio.sfx('valve', { volume: 0.5 });
      paintBtns();
    };
    const paintBtns = () => speedBtns.forEach((b, i) => b.classList.toggle('on', i === speed));
    const finish = (parted: boolean) => {
      if (done) return;
      done = true;
      g.setFlag('a4.heaveResult', parted ? 2 : 1);
      g.setFlag('a4.heaveP', parted ? 0 : 1);
      speedBtns.forEach((b) => (b.disabled = true));
      log.textContent = parted ? '바늘이 눈금 끝을 쳤다 —' : '그래플이 쉬브 아래까지 올라왔다. 갈고리에 케이블의 바이트가 걸려 있다!';
      window.setTimeout(() => {
        if (!closed) g.ui.pop(modal);
      }, 1100);
    };
    const tension = () => heaveTension(speed, t, s.progress);
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = '#1a2026';
      ctx.fillRect(0, 0, W, H);
      // The swell coming down on the bow: the sea surface over the next period, the bow at the left.
      const seaY = 92;
      const bowX = 70;
      ctx.fillStyle = '#2c3a44';
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= 290; x += 4) {
        const tau = ((x - bowX) / 220) * HEAVE.period;
        const phase = Math.sin((2 * Math.PI * (t + tau)) / HEAVE.period);
        ctx.lineTo(x, seaY - phase * 14);
      }
      ctx.lineTo(290, H);
      ctx.closePath();
      ctx.fill();
      // Next crest marker
      const ph = ((t % HEAVE.period) + HEAVE.period) % HEAVE.period;
      let toCrest = HEAVE.period / 4 - ph;
      if (toCrest < 0) toCrest += HEAVE.period;
      const crestX = bowX + (toCrest / HEAVE.period) * 220;
      ctx.fillStyle = '#c8b890';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      if (crestX < 280) ctx.fillText('▼ 너울', crestX, seaY - 22);
      // The bow, pitched up by the swell under it.
      const lift = bowLift(t);
      ctx.save();
      ctx.translate(bowX, seaY - 4 - lift * 10);
      ctx.rotate(-lift * 0.14);
      ctx.fillStyle = '#0e0e0e';
      ctx.beginPath();
      ctx.moveTo(-80, 6);
      ctx.lineTo(18, 6);
      ctx.lineTo(30, -26);
      ctx.lineTo(-80, -26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c605e';
      ctx.beginPath();
      ctx.arc(30, -26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // The rope down to the bight
      ctx.strokeStyle = '#8a7650';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bowX + 30, seaY - 30 - lift * 14);
      ctx.lineTo(bowX + 44, H);
      ctx.stroke();
      // Tension dial (0..8 t), red above six.
      const dx = 365;
      const dy = 104;
      const R = 58;
      const ang = (v: number) => Math.PI + (Math.min(8, Math.max(0, v)) / 8) * Math.PI;
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#3a3a34';
      ctx.beginPath();
      ctx.arc(dx, dy, R, Math.PI, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = '#8a1a14';
      ctx.beginPath();
      ctx.arc(dx, dy, R, ang(6), 2 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#c8c0a8';
      ctx.font = '10px sans-serif';
      for (let v = 0; v <= 8; v += 2) {
        const a = ang(v);
        ctx.fillText(String(v), dx + Math.cos(a) * (R - 16), dy + Math.sin(a) * (R - 16) + 4);
      }
      const tv = tension();
      const a = ang(tv);
      ctx.strokeStyle = tv > HEAVE.limit ? '#ff5a3a' : '#f3e3b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx + Math.cos(a) * (R - 4), dy + Math.sin(a) * (R - 4));
      ctx.stroke();
      ctx.fillStyle = '#c8c0a8';
      ctx.fillText('톤', dx, dy + 18);
      // Fathoms to go
      ctx.fillStyle = '#3a3a34';
      ctx.fillRect(10, H - 12, 270, 6);
      ctx.fillStyle = '#c8b890';
      ctx.fillRect(10, H - 12, 270 * s.progress, 6);
    };
    const paint = () => {
      const left = Math.round(((1 - s.progress) * DEPTH_FATHOMS) / 10) * 10;
      readEl.textContent = `장력 ${tension().toFixed(1)}톤 · 권양 ${SPEED_LABEL[speed]} · 남은 로프 ${left.toLocaleString('en-US')}길`;
    };
    const panel = h(
      'div',
      { class: 'panel bridge' },
      h('div', { class: 'eyebrow', text: 'FORE DECK · 권양기' }),
      h('h2', { text: '감아올리기' }),
      h('p', { class: 'muted', text: '↑ → 빠르게 · ↓ ← 느리게 · Space 정지 · Esc 손 떼기 — 6톤을 넘기지 말 것' }),
      canvas,
      readEl,
      h('div', { class: 'row' }, ...speedBtns, button('손 떼기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        if (!done) {
          t += dt;
          s = heaveStep(s, speed, t, dt);
          // (Read by the automated playthrough, which eases off the way a careful hand would.)
          canvas.dataset.t = t.toFixed(3);
          canvas.dataset.p = s.progress.toFixed(4);
          const tv = tension();
          deckGauge.driven = true;
          deckGauge.strain = tv;
          deckGauge.turn += dt * HEAVE.rates[speed] * 40;
          const lift = bowLift(t);
          if (lift > 0.92 && !crest) {
            crest = true;
            g.sfx('creak', { volume: 0.6 + lift * 0.3 });
          } else if (lift < 0.5) crest = false;
          if (tv > HEAVE.limit && !s.parted) log.textContent = '쉬브가 비명을 지른다! 늦춰라!';
          if (s.parted) finish(true);
          else if (s.progress >= 1) finish(false);
        }
        if (input.justPressed('up') || input.justPressed('right')) setSpeed(Math.min(2, speed + 1) as HeaveSpeed);
        if (input.justPressed('down') || input.justPressed('left')) setSpeed(Math.max(0, speed - 1) as HeaveSpeed);
        if (input.justPressed('action')) {
          input.consume('action');
          setSpeed(0);
        }
        draw();
        paint();
      },
      onClose: () => {
        closed = true;
        deckGauge.driven = false;
        if (!done) {
          g.setFlag('a4.heaveP', s.progress);
          g.setFlag('a4.heaveResult', 0);
        }
        resolve();
      },
    });
    paintBtns();
    draw();
    paint();
  });
}

// ------------------------------------------------------------------ The two cut ends

const ENDS: EndId[] = ['A', 'B'];

export function openEndsPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const good = theGoodEnd(g);
    const pell = withPell4(g);
    let sel: EndId = 'A';
    let busy = false;
    let closed = false;
    const cols = new Map<EndId, HTMLElement>();
    const status = h('div', { class: 'hut-status' });
    const log = h('div', { class: 'log hut-log', text: '시험실 단자반에 두 끝이 물려 있다. 꼬리표 A, B. 로스가 브리지 상자 앞에 앉는다.' });
    const ohms = (e: EndId) => endOhms(e, good, CORE_OHMS_PER_NM);
    const measured = (e: EndId) => g.flag(`a4.ohms${e}`);
    const called = (e: EndId) => g.flag(`a4.call${e}`);
    const addLine = (line: string) => {
      log.textContent = `${log.textContent}\n${line}`.split('\n').slice(-9).join('\n');
    };
    const play = async (code: string, vol: number) => {
      for (const sym of code) {
        if (closed) return;
        g.audio.sfx(sym === '.' ? 'morse-dot' : 'morse-dash', { volume: vol });
        await g.wait(sym === '.' ? 0.16 : 0.34);
      }
      await g.wait(0.3);
    };
    const setBusy = (b: boolean) => {
      busy = b;
      status.dataset.busy = b ? '1' : '0';
      status.textContent = b ? '로스가 시험하는 중…' : `선택: ${sel} 끝`;
      for (const btn of actBtns) btn.disabled = b;
    };
    const paint = () => {
      for (const e of ENDS) {
        const col = cols.get(e)!;
        col.classList.toggle('focus', e === sel);
        const reply = g.flag(`a4.call${e}`) ? endReply(e, good, 'BC', pell) : '';
        col.replaceChildren(
          h('div', { class: 'no', text: `${e} 끝` }),
          h('div', { text: measured(e) ? `${ohms(e) < 100 ? ohms(e).toFixed(1) : Math.round(ohms(e)).toLocaleString('en-US')} Ω` : '저항 —' }),
          h('div', { text: called(e) ? `응답: ${reply}` : '호출 —' }),
        );
      }
      if (!busy) status.textContent = `선택: ${sel} 끝`;
    };
    const measure = async () => {
      if (busy) return;
      const e = sel;
      setBusy(true);
      g.audio.sfx('galvo');
      const wobble = e !== good;
      deckGauge.driven = true;
      for (let i = 0; i < 36 && !closed; i++) {
        deckGauge.spot = Math.sin(i * 0.5) * 0.22 * (1 - i / 36) + (wobble ? Math.sin(i * 1.7) * 0.03 : 0);
        await g.wait(1 / 30);
      }
      deckGauge.driven = false;
      if (closed) return;
      g.setFlag(`a4.ohms${e}`);
      const r = ohms(e);
      if (e === good) addLine(`로스: "${Math.round(r).toLocaleString('en-US')}옴. 1해리에 ${CORE_OHMS_PER_NM}옴이니 — ${(r / CORE_OHMS_PER_NM).toFixed(0)}해리. 멀리까지 성하게 이어져 있소."`);
      else addLine(`로스: "${r.toFixed(1)}옴… 광점이 맥박처럼 떨리는군. ${(r / CORE_OHMS_PER_NM).toFixed(1)}해리 앞에서 땅에 닿았소."`);
      setBusy(false);
      paint();
    };
    const call = async () => {
      if (busy) return;
      const e = sel;
      setBusy(true);
      addLine(`${e} 끝으로 보냄: BC`);
      for (const code of encodeText('BC')) await play(code, 0.8);
      await g.wait(1.0);
      const reply = endReply(e, good, 'BC', pell);
      const parts = e === good ? [reply] : [reply.slice(0, -2), 'R'];
      for (const [i, part] of parts.entries()) {
        if (closed) return;
        if (i > 0) await g.wait(1.6);
        for (const code of encodeText(part)) await play(code, e === good ? 0.9 : 0.7);
        addLine(`${e} 끝에서: ${part}  ${encodeText(part).map(dotDash).join(' ')}`);
      }
      if (closed) return;
      g.setFlag(`a4.call${e}`);
      if (e === good) addLine(pell ? 'R, 그리고 TP. 펠의 손이다. 마지막 획을 길게 끄는 버릇까지.' : 'R BC. 벨 코브다. 새 야간 근무자의 손.');
      else addLine('로스가 키에서 손을 뗐다. "우리가 보낸 걸 뒤집어 보냈소. 그리고… R."');
      setBusy(false);
      paint();
    };
    const buoy = () => {
      if (busy) return;
      const e = sel;
      if (!measured(e) && !called(e)) {
        g.audio.sfx('locked');
        addLine('로스: "재 보지도 않고 봉하자는 거요? 저항부터 재 봅시다."');
        return;
      }
      if (e !== good) {
        g.audio.sfx('locked');
        addLine(
          measured(e)
            ? `로스: "그 끝은 ${FAULT_NM}해리 앞에서 땅에 닿소. 고장 난 끝이오. 부표에 달 것은 육지국까지 성한 끝이오."`
            : '로스: "대답이 이상하오. 그 끝은 저항부터 재 봅시다."',
        );
        return;
      }
      g.setFlag('a4.buoyPick', e === 'A' ? 1 : 2);
      g.audio.sfx('ui-ok');
      g.ui.pop(modal);
    };
    const select = (e: EndId) => {
      if (busy || e === sel) return;
      sel = e;
      g.audio.sfx('ui-move');
      paint();
    };
    const grid = h(
      'div',
      { class: 'rack-grid ends-grid' },
      ...ENDS.map((e) => {
        const col = h('button', { class: 'btn cell', type: 'button' });
        col.addEventListener('click', () => select(e));
        cols.set(e, col);
        return col;
      }),
    );
    const actBtns = [button('저항 재기', () => void measure()), button('BC 부르기', () => void call()), button('이 끝을 부표에', buoy)] as HTMLButtonElement[];
    const panel = h(
      'div',
      { class: 'panel bridge' },
      h('div', { class: 'eyebrow', text: 'TESTING ROOM · 잘라 낸 두 끝' }),
      h('h2', { text: '어느 끝이 벨 코브인가' }),
      h('p', { class: 'muted', text: '← → 끝 선택 · Space 저항 재기 · F BC 부르기 · Tab 부표에 달기 · Esc 물러나기' }),
      grid,
      status,
      h('div', { class: 'row' }, ...actBtns, button('물러나기', () => g.ui.pop(modal))),
      log,
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (_dt, input) => {
        if (input.justPressed('left')) select('A');
        if (input.justPressed('right')) select('B');
        if (input.justPressed('action')) {
          input.consume('action');
          void measure();
        }
        if (input.justPressed('attack')) {
          input.consume('attack');
          void call();
        }
        if (input.justPressed('inventory')) {
          input.consume('inventory');
          buoy();
        }
      },
      onClose: () => {
        closed = true;
        deckGauge.driven = false;
        resolve();
      },
    });
    setBusy(false);
    paint();
  });
}
