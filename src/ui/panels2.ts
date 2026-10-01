import type { Game } from '../game/Game';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';
import {
  BRIDGE_RATIOS,
  CORE_OHMS_PER_NM,
  SHORE_END_NM,
  SHUNTS,
  balanceVerdict,
  bridgeReading,
  cableAction,
  faultDistance,
  galvanometerSpot,
  pumpOutcome,
  type CableAction,
  type PumpOutcome,
  type Side,
  type ValveChest,
} from '../game/logic2';
import { SIDE_KO, cableRunOut, getCableEngine, getValves, setCableEngine, setValves, tankLevel, thingNow, thingSide } from '../game/act2';

const fmtOhm = (r: number) => (r < 100 ? r.toFixed(2) : r.toLocaleString('en-US', { maximumFractionDigits: 0 }));
const fmtNm = (d: number) => (d < 100 ? d.toFixed(3) : d.toLocaleString('en-US', { maximumFractionDigits: 0 }));

// ------------------------------------------------------------------ Wheatstone bridge

/** Ratio arms Q/P of the bridge for each multiplier. */
const RATIO_ARMS = ['10 : 1000', '100 : 1000', '1000 : 1000'];

/** True resistance on a lead right now: the thing's dead earth climbing, or the sound end to the shore station. */
function leadOhms(g: Game, side: Side): number {
  return CORE_OHMS_PER_NM * (thingSide(g) === side ? thingNow(g) : SHORE_END_NM);
}

export function openBridgePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    let side: Side = g.flag('a2.leadStbd') ? 'stbd' : 'port';
    let ratioI = Math.min(2, g.num('a2.ratio'));
    let shuntI = g.num('a2.shuntSet');
    const dials = [0, 1, 2, 3].map((i) => g.num(`a2.d${i}`));
    let sel = 0;
    let spot = 0;
    let vel = 0;
    let repeat = 0;
    const canvas = h('canvas', { width: 420, height: 70, class: 'galvo-scale' }) as HTMLCanvasElement;
    const valEls: HTMLElement[] = [];
    const dialEls: HTMLElement[] = [];
    const leadBtns: Record<Side, HTMLButtonElement> = {
      port: button('B · 좌현 끝', () => setLead('port')) as HTMLButtonElement,
      stbd: button('C · 우현 끝', () => setLead('stbd')) as HTMLButtonElement,
    };
    const ratioBtn = button('', () => cycleRatio()) as HTMLButtonElement;
    const shuntBtn = button('', () => cycleShunt()) as HTMLButtonElement;
    const readEl = h('div', { class: 'bridge-read' });
    const log = h('div', { class: 'log', text: '단자반에서 케이블 끝을 고르고, 광점이 눈금 한가운데 멈추도록 다이얼을 맞춘다.' });
    const recs = h('div', { class: 'log bridge-recs' });

    const save = () => {
      g.setFlag('a2.leadStbd', side === 'stbd');
      g.setFlag('a2.ratio', ratioI);
      g.setFlag('a2.shuntSet', shuntI);
      dials.forEach((v, i) => g.setFlag(`a2.d${i}`, v));
    };
    const reading = () => bridgeReading(dials, BRIDGE_RATIOS[ratioI]);
    const paint = () => {
      dialEls.forEach((d, i) => d.classList.toggle('focus', i === sel));
      valEls.forEach((v, i) => (v.textContent = String(dials[i])));
      (['port', 'stbd'] as Side[]).forEach((s) => leadBtns[s].classList.toggle('on', s === side));
      ratioBtn.textContent = `비율 팔 ${RATIO_ARMS[ratioI]} (×${BRIDGE_RATIOS[ratioI]})`;
      const sh = SHUNTS[shuntI];
      shuntBtn.textContent = sh === 1 ? '분류기 없음 (최대 감도)' : `분류기 1/${Math.round(1 / sh) - 1}`;
      readEl.textContent = `다이얼 ${dials.join('')} × ${BRIDGE_RATIOS[ratioI]} = ${fmtOhm(reading())} Ω`;
      paintRecs();
      save();
    };
    const setLead = (s: Side) => {
      side = s;
      g.audio.sfx('safe-click');
      paint();
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
    const paintRecs = () => {
      const lines: string[] = [];
      for (const s of ['port', 'stbd'] as Side[]) {
        const n = g.num(`a2.rec.${s}.n`);
        if (!n) continue;
        const first = g.num(`a2.rec.${s}.first`);
        const last = g.num(`a2.rec.${s}.last`);
        const tag = s === 'port' ? 'B 좌현' : 'C 우현';
        lines.push(n > 1 && last !== first ? `${tag}: ${fmtNm(first)} → ${fmtNm(last)} 해리` : `${tag}: ${fmtNm(last)} 해리`);
      }
      recs.textContent = lines.length ? `측정 기록\n${lines.join('\n')}` : '측정 기록 없음';
    };
    const record = () => {
      const truth = leadOhms(g, side);
      const r = reading();
      const verdict = balanceVerdict(truth, r, BRIDGE_RATIOS[ratioI], SHUNTS[shuntI]);
      if (verdict !== 'balanced') {
        g.audio.sfx('locked');
        log.textContent =
          verdict === 'shunted'
            ? '광점은 영점 근처다. 하지만 분류기를 끼운 채로는 마지막 자리를 믿을 수 없다. 분류기를 빼고 다시 맞춘다.'
            : verdict === 'coarse'
              ? '광점은 영점에 있다. 하지만 다이얼 앞자리가 놀고 있다. 비율 팔을 낮춰 네 자리를 다 써야 제대로 된 값이 나온다.'
              : Math.abs(spot) > 0.5
                ? '광점이 눈금 끝에 붙어 있다. 아직 멀었다.'
                : '광점이 영점에서 조금 비켜나 있다. 다이얼을 더 맞춰야 한다.';
        return;
      }
      g.audio.sfx('ui-ok');
      const d = faultDistance(r, CORE_OHMS_PER_NM);
      const n = g.num(`a2.rec.${side}.n`);
      const prev = g.num(`a2.rec.${side}.last`);
      g.setFlag(`a2.rec.${side}.n`, n + 1);
      if (!n) g.setFlag(`a2.rec.${side}.first`, d);
      g.setFlag(`a2.rec.${side}.last`, d);
      const tag = side === 'port' ? 'B(좌현)' : 'C(우현)';
      if (d > 500) {
        log.textContent = `${tag} 균형 — ${fmtOhm(r)} Ω, ${fmtNm(d)}해리. 육지국까지 이어진 건전한 케이블이다. 끝에서 접지된 계기까지의 저항일 뿐.`;
      } else if (n && Math.abs(d - prev) > 0.001) {
        log.textContent = `${tag} 균형 — ${fmtOhm(r)} Ω, ${fmtNm(d)}해리.\n${d < prev ? '…방금 전보다 줄었다. 고장점이 배 쪽으로 다가온다.' : '…방금 전과 다르다. 고장점이 움직이고 있다.'}`;
        g.setFlag('a2.moving', true);
      } else {
        log.textContent = `${tag} 균형 — ${fmtOhm(r)} Ω, 고장점까지 ${fmtNm(d)}해리. 완전 단선: 심선이 그 자리에서 바다에 닿아 있다.`;
      }
      const other: Side = side === 'port' ? 'stbd' : 'port';
      if (!g.flag('a2.measured') && g.flag('a2.moving') && g.num(`a2.rec.${other}.n`) > 0) {
        g.setFlag('a2.measured');
        const ts = thingSide(g);
        log.textContent += `\n\n두 끝을 다 쟀다. 고장점이 움직이는 것은 ${ts === 'port' ? 'B — 좌현' : 'C — 우현'} 끝이다. 그것은 ${SIDE_KO[ts]} 케이블을 타고 올라오고 있다.`;
        g.audio.sfx('stinger', { volume: 0.5 });
      }
      paint();
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
      h('div', { class: 'eyebrow', text: 'TESTING ROOM · 휘트스톤 브리지와 미러 검류계' }),
      h('h2', { text: '고장점 측정' }),
      h('p', { class: 'muted', text: '←→ 자리 · ↑↓ 값 · Shift/Tab 비율 팔 · F 분류기 · C 케이블 끝 · Space 기록 · Esc 물러나기 (패드: Y 비율 · X 분류기 · RB 끝 · A 기록 · B 물러나기)' }),
      h('div', { class: 'row' }, leadBtns.port, leadBtns.stbd, ratioBtn, shuntBtn),
      canvas,
      dialBox,
      readEl,
      h('div', { class: 'row' }, button('측정 기록', record), button('물러나기', () => g.ui.pop(modal))),
      log,
      recs,
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
    g.setFlag('a2.panelOpen', true);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      update: (dt, input) => {
        // A damped mirror: the spot swings towards the deflection and settles.
        const target = galvanometerSpot(leadOhms(g, side), reading(), SHUNTS[shuntI]);
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
        // Shift (or Tab / pad Y) changes the ratio arms. The pad's B is both "run" and "back": there it backs out.
        if (input.justPressed('run') && !input.justPressed('cancel')) cycleRatio();
        if (input.justPressed('inventory')) {
          input.consume('inventory');
          cycleRatio();
        }
        if (input.justPressed('attack')) {
          input.consume('attack');
          cycleShunt();
        }
        if (input.justPressed('camera')) {
          input.consume('camera');
          setLead(side === 'port' ? 'stbd' : 'port');
        }
        if (input.justPressed('action')) {
          input.consume('action');
          record();
        }
      },
      onClose: () => {
        g.setFlag('a2.panelOpen', false);
        resolve();
      },
    });
    paint();
    draw();
  });
}

// ------------------------------------------------------------------ Valve chest

const VALVE_ROWS: Array<{ key: keyof ValveChest; label: string }> = [
  { key: 'sea', label: '① 해수 흡입 (씨 체스트)' },
  { key: 'tank1', label: '② 1번 탱크 흡입' },
  { key: 'tank2', label: '③ 2번 탱크 흡입' },
  { key: 'bilge', label: '④ 기관실 빌지 흡입' },
  { key: 'overboard', label: '⑤ 선외 배출' },
  { key: 'fill2', label: '⑥ 2번 탱크 주수' },
];

export const PUMP_TEXT: Record<PumpOutcome, string> = {
  idle: '펌프가 서 있다.',
  flood: '밸브 상자 안에서 물 흐르는 소리가 난다. 바닷물이 2번 탱크로 흘러든다!',
  dry: '펌프가 헛돈다. 흡입 밸브가 모두 닫혀 있다.',
  deadhead: '펌프가 헐떡이고 압력계 바늘이 치솟는다. 배출 밸브가 닫혀 있다!',
  drain: '펌프가 규칙적으로 숨을 쉰다. 측심관의 수위가 내려간다.',
  slow: '펌프는 도는데 수위가 그대로다. 열린 해수 밸브로 바다를 퍼 올리고 있을 뿐이다.',
  fill: '2번 탱크 쪽 배관으로 물이 쏟아져 들어간다. 탱크를 채우고 있다!',
  circulate: '탱크에서 빤 물이 도로 탱크로 들어간다. 제자리걸음이다.',
  other: '펌프가 무언가를 퍼내고 있지만, 2번 탱크와는 상관없다.',
};

export function openValvePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const pills = new Map<keyof ValveChest, HTMLElement>();
    const status = h('div', { class: 'log' });
    const level = h('div', { class: 'tank-level' }, h('div', { class: 'fill' }));
    const levelText = h('div', { class: 'muted' });
    const toggle = (k: keyof ValveChest) => {
      const v = getValves(g);
      v[k] = !v[k];
      setValves(g, v);
      g.audio.sfx(k === 'pump' ? (v.pump ? 'pump' : 'valve') : 'valve');
      render();
    };
    const rows = VALVE_ROWS.map(({ key, label }) => {
      const pill = h('span', { class: 'state-pill' });
      pills.set(key, pill);
      const b = button(label, () => toggle(key));
      b.append(pill);
      return b;
    });
    const pumpPill = h('span', { class: 'state-pill' });
    pills.set('pump', pumpPill);
    const pumpBtn = button('잡용 펌프 ', () => toggle('pump'));
    pumpBtn.append(pumpPill);
    const leave = button('물러나기', () => g.ui.pop(modal));
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'ENGINE ROOM · 빌지·밸러스트 밸브 상자' }),
      h('h2', { text: '2번 탱크 배수' }),
      h('div', { class: 'controls' }, ...rows, pumpBtn),
      h('p', {}, '2번 탱크 측심'),
      level,
      levelText,
      status,
      h('div', { class: 'row' }, leave),
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio, { grid: true });
    const render = () => {
      const v = getValves(g);
      for (const [k, el] of pills) {
        const on = v[k];
        el.textContent = k === 'pump' ? (on ? '운전' : '정지') : on ? '열림' : '닫힘';
        el.className = `state-pill ${on ? 'on' : 'off'}`;
      }
      const lv = tankLevel(g);
      (level.firstChild as HTMLElement).style.width = `${Math.round(lv * 100)}%`;
      levelText.textContent = g.flag('tank2Drained') ? '측심관: 바닥이 드러났다. 탱크가 비었다.' : `측심관 수심 ${(lv * 3.2).toFixed(1)} m / 3.2 m`;
      status.textContent = g.flag('tank2Drained') ? '2번 탱크가 비었다. 이제 수밀문을 열 수 있다.' : PUMP_TEXT[pumpOutcome(v).outcome];
    };
    let t = 0;
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      nav,
      update: (dt, input) => {
        t += dt;
        if (t > 0.15) {
          t = 0;
          render();
        }
        nav.update(input);
      },
      onClose: () => resolve(),
    });
    render();
  });
}

// ------------------------------------------------------------------ Cable engine

const CABLE_TEXT: Record<string, string> = {
  'need-key': '고정핀마다 맹꽁이자물쇠가 채워져 있다. 열쇠가 있어야 한다.',
  unpinned: '자물쇠가 열렸다. 고정핀을 뽑아 갑판에 내던진다. 이제 레버가 움직인다.',
  pinned: '고정핀이 박혀 있어 레버가 꿈쩍도 하지 않는다.',
  declutched: '클러치 레버를 당긴다. 드럼이 기관에서 떨어져 나와 헐겁게 흔들린다.',
  clutched: '드럼을 다시 기어에 물렸다.',
  dragged: '브레이크를 들자 드럼이 기관째 끌려 돈다! 증기 실린더가 비명을 지른다. 황급히 브레이크를 다시 건다.',
  already: '이미 그렇게 되어 있다.',
  gone: '그쪽 드럼은 비었다. 케이블은 이미 바다로 빠져나갔다.',
};

export function openCablePanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const log = h('div', { class: 'log', text: '고정핀, 클러치, 브레이크. 순서를 틀리면 케이블이 기관째 끌고 간다.' });
    const pinPill = h('span', { class: 'state-pill' });
    const pills: Record<Side, { clutch: HTMLElement; brake: HTMLElement }> = {
      port: { clutch: h('span', { class: 'state-pill' }), brake: h('span', { class: 'state-pill' }) },
      stbd: { clutch: h('span', { class: 'state-pill' }), brake: h('span', { class: 'state-pill' }) },
    };
    let closing = false;
    const act = (a: CableAction) => {
      if (closing) return;
      const r = cableAction(getCableEngine(g), a, g.hasItem('brakeKey'));
      // He will not let a cable go without knowing which one the thing is on.
      if ((r.ev === 'run-out' || r.ev === 'dragged') && !g.flag('a2.measured')) {
        g.audio.sfx('locked');
        log.textContent = '브레이크 레버에 손을 얹었다가 멈춘다. 어느 쪽 케이블에 그것이 매달려 있는지 모른다. 잘못 풀면 남은 한 가닥에 배 전체가 매달린다.';
        return;
      }
      setCableEngine(g, r.s);
      if (r.ev === 'unpinned') g.audio.sfx('unlock');
      else if (r.ev === 'declutched' || r.ev === 'clutched') g.audio.sfx('push', { volume: 0.6 });
      else if (r.ev === 'dragged') {
        g.audio.sfx('waterhammer');
        g.shake(0.3, 0.8);
        g.flash(0xffffff, 0.2);
      } else if (r.ev === 'need-key' || r.ev === 'pinned') g.audio.sfx('locked');
      if (r.ev === 'run-out') {
        closing = true;
        const side: Side = a.endsWith('port') ? 'port' : 'stbd';
        g.ui.pop(modal);
        void g.run(() => cableRunOut(g, side));
        return;
      }
      log.textContent = CABLE_TEXT[r.ev] ?? '';
      render();
    };
    const sideRow = (s: Side) =>
      h(
        'div',
        { class: 'controls' },
        button(`${SIDE_KO[s]} 클러치`, () => act(`clutch-${s}`)),
        button(`${SIDE_KO[s]} 브레이크 풀기`, () => act(`brake-${s}`)),
      );
    const panel = h(
      'div',
      { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'PICKING-UP GEAR · 케이블 권양기' }),
      h('h2', { text: '케이블 놓아 보내기' }),
      h('p', {}, '고정핀', pinPill),
      h('div', { class: 'controls' }, button('고정핀 자물쇠 열기', () => act('unpin'))),
      h('p', {}, '좌현 드럼 — 기어', pills.port.clutch, ' 브레이크', pills.port.brake),
      sideRow('port'),
      h('p', {}, '우현 드럼 — 기어', pills.stbd.clutch, ' 브레이크', pills.stbd.brake),
      sideRow('stbd'),
      log,
      h('div', { class: 'row' }, button('물러나기', () => g.ui.pop(modal))),
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio, { grid: true });
    const render = () => {
      const s = getCableEngine(g);
      pinPill.textContent = s.pinned ? '잠김' : '풀림';
      pinPill.className = `state-pill ${s.pinned ? 'off' : 'on'}`;
      for (const side of ['port', 'stbd'] as Side[]) {
        const p = pills[side];
        p.clutch.textContent = s.gone[side] ? '—' : s.clutch[side] ? '물림' : '분리';
        p.clutch.className = `state-pill ${s.clutch[side] ? 'off' : 'on'}`;
        p.brake.textContent = s.gone[side] ? '케이블 없음' : s.brake[side] ? '걸림' : '풀림';
        p.brake.className = `state-pill ${s.brake[side] ? 'off' : 'on'}`;
      }
    };
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
