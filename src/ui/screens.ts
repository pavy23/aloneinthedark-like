import type { Game } from '../game/Game';
import { latestSave, readSlot, formatTime, type Settings, type SlotId } from '../game/state';
import { ROOMS } from '../world/rooms';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';

// ------------------------------------------------------------------ Title

export function openTitle(g: Game): Modal {
  const has = latestSave() !== null;
  const menu = h(
    'div',
    { class: 'menu' },
    button('새로 시작', async () => {
      if (has) {
        const ok = await confirmBox(g, '저장된 기록이 있습니다. 새로 시작하면 처음 문을 지날 때 자동 기록이 새 게임으로 바뀝니다(수동 기록은 남습니다). 새로 시작할까요?');
        if (!ok) return;
      }
      g.ui.pop(modal);
      void g.newGame();
    }),
    button('이어하기', () => {
      g.ui.pop(modal);
      void g.continueLatest();
    }, { disabled: !has }),
    button('조작법', () => openHelp(g)),
    button('설정', () => openSettings(g)),
  );
  const el = h(
    'div',
    { class: 'title' },
    h(
      'div',
      { class: 'mark' },
      h('h1', { text: '용골 아래' }),
      h('div', { class: 'en', text: 'BENEATH THE KEEL' }),
      h('div', { class: 'sub', text: '북대서양 · 1925년 10월' }),
    ),
    menu,
    h('div', { class: 'foot', text: '3D 3인칭 탐험·퍼즐 어드벤처 · 모든 그래픽과 사운드는 코드로 생성 · 키보드 / 게임패드 / 터치' }),
  );
  const nav = new FocusNav(menu, g.audio);
  let t = 0;
  const modal = g.ui.push({
    el,
    nav,
    cancelable: false,
    // Ignore input for a moment so a key held from the previous screen can't start a new game.
    update: (dt, input) => {
      t += dt;
      if (t < 0.8) return;
      nav.update(input);
    },
  });
  return modal;
}

// ------------------------------------------------------------------ Narrative screens

function story(g: Game, dateLine: string, lines: string[], opts: { finalButtons?: Array<[string, () => void]>; bg?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    const lineEls = lines.map((l) => h('p', { class: 'line', text: l }));
    const skip = h('div', { class: 'skip', text: '계속하려면 Space · 클릭 · 탭' });
    const buttons = h('div', { class: 'row', style: 'justify-content:center' });
    const box = h('div', { class: 'story' }, h('div', { class: 'date', text: dateLine }), ...lineEls, skip, buttons);
    const el = h('div', { class: 'modal', style: `background:${opts.bg ?? 'rgba(0,0,0,0.94)'}` }, box);
    let shown = 0;
    let t = 0;
    let finished = false;
    let sinceFinish = 0;
    const nav = new FocusNav(buttons, g.audio);
    const showNext = () => {
      if (shown < lineEls.length) {
        lineEls[shown].classList.add('show');
        shown++;
        t = 0;
        if (shown === lineEls.length) finish();
      }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const l of lineEls) l.classList.add('show');
      shown = lineEls.length;
      if (opts.finalButtons) {
        skip.hidden = true;
        buttons.replaceChildren(...opts.finalButtons.map(([label, fn]) => button(label, fn)));
        nav.refresh(false);
      }
    };
    const advance = () => {
      if (!finished) {
        if (shown < lineEls.length) showNext();
        return;
      }
      if (!opts.finalButtons) close();
    };
    const close = () => {
      g.ui.pop(modal);
    };
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.btn')) return;
      advance();
    });
    const modal: Modal = g.ui.push({
      el,
      cancelable: false,
      update: (dt, input) => {
        t += dt;
        if (!finished && t > 1.6) showNext();
        if (finished && opts.finalButtons) {
          sinceFinish += dt;
          if (sinceFinish > 1.0) nav.update(input);
          return;
        }
        if (input.justPressed('action') || input.justPressed('cancel')) {
          input.consumeAll();
          advance();
        }
      },
      onClose: () => resolve(),
    });
    showNext();
  });
}

export async function playIntro(g: Game): Promise<void> {
  g.audio.setAmbience('title');
  await story(g, '1925년 10월 11일 · 뉴펀들랜드 남동쪽 해상', [
    '해저케이블 수리선 탈라사호가 교신을 끊은 지 여드레.',
    '구난선 마그누스호가 안개 속에서 그 배를 찾아냈다. 불빛 하나 없이, 사람 하나 없이 떠다니는 배를.',
    '보험조합의 조사관인 나는 작은 보트로 홀로 그 배에 올랐다.',
    '보트가 떠나자 안개가 모든 것을 삼켰다. 남은 것은 파도 소리와, 발밑 어딘가에서 들려오는 소리뿐이었다.',
    '세 번, 쉬고, 세 번.',
  ]);
}

export async function playEnding(g: Game): Promise<void> {
  g.audio.setDanger(false);
  g.audio.setAmbience('title');
  const st = g.state;
  const withPell = g.flag('pellCarried');
  const lines = withPell
    ? [
        '나는 펠을 업고 줄사다리를 내려갔다. 보트에 앉자마자 그는 정신을 잃었다. 잠든 얼굴로도 손가락만은 쉬지 않고 무언가를 두드리고 있었다.',
        '보고서에는 두 사람의 증언이 실렸다. 아무도 믿지 않았지만, 누구도 반박하지 못했다.',
        '펠은 다시는 배를 타지 않았다. 다만 해마다 10월이면 해안 무선국 수신기 앞에 밤새 앉아 있다고 한다. 공전 잡음 속에서 누군가 그를 흉내 내지 않는지 들으며.',
        '— 엔딩 2 · 두 사람의 증언 —',
      ]
    : [
        '줄사다리를 내려가기 직전, 선수 쪽에서 두드리는 소리가 들렸다. 세 번, 쉬고, 세 번.',
        '나는 돌아보지 않았다.',
        '보고서에는 "생존자 없음"이라고 적었다. 그 두드림이 사람의 것이었는지 흉내였는지, 나는 끝내 확인하지 않았다.',
        '— 엔딩 1 · 홀로 내려가다 —',
      ];
  await story(
    g,
    '1925년 10월 12일 · 새벽',
    [
      '그 밤의 나머지는 길고 조용했다. 배는 더 이상 끌려가지 않았고, 어디서도 두드리는 소리는 들리지 않았다.',
      '동틀 무렵, 안개를 가르며 마그누스호의 기적이 울렸다.',
      ...lines,
      `플레이 시간 ${formatTime(st.time)} · 기록 ${st.saves}회 · 죽음 ${st.deaths}회 · 읽은 문서 ${st.docs.length}편`,
    ],
    { finalButtons: [['타이틀로', () => g.showTitle()]], bg: 'rgba(8,10,12,0.96)' },
  );
}

export function openGameOver(g: Game): void {
  const el = h(
    'div',
    { class: 'modal', style: 'background:rgba(0,0,0,0.9)' },
    h(
      'div',
      { class: 'story gameover' },
      h('h2', { text: '익사' }),
      h('p', { text: '차갑고 무거운 손들이 나를 붙잡았다.\n바다 냄새가 폐 속까지 차올랐다.' }),
      h('div', { class: 'row', style: 'justify-content:center' }),
    ),
  );
  const row = el.querySelector('.row') as HTMLElement;
  row.append(
    button('마지막 기록에서 다시', () => {
      g.ui.pop(modal);
      void g.retryFromDeath();
    }),
    button('타이틀로', () => {
      g.ui.pop(modal);
      g.showTitle();
    }),
  );
  const nav = new FocusNav(row, g.audio);
  const modal = g.ui.push({ el, nav, cancelable: false });
}

// ------------------------------------------------------------------ Pause, save, load

export function openPause(g: Game): void {
  g.audio.sfx('ui-ok');
  const msg = h('p', { class: 'muted', text: `플레이 시간 ${g.playTimeText()} · ${ROOMS[g.state.room].name}` });
  const list = h(
    'div',
    { class: 'menu', style: 'display:flex;flex-direction:column;gap:6px' },
    button('계속하기', () => g.ui.pop(modal)),
    button('기록하기', () => {
      g.save(false);
      g.audio.sfx('ui-ok');
      msg.textContent = `기록했다. (${new Date().toLocaleTimeString('ko-KR')})`;
    }),
    button('불러오기', () => openLoad(g)),
    button('조작법', () => openHelp(g)),
    button('설정', () => openSettings(g)),
    button('타이틀로', async () => {
      const ok = await confirmBox(g, '저장하지 않은 진행은 사라집니다. 타이틀로 돌아갈까요?');
      if (ok) g.showTitle();
    }),
  );
  const panel = h('div', { class: 'panel', style: 'width:min(420px,100%)' }, h('div', { class: 'eyebrow', text: 'PAUSED · 일시정지' }), h('h2', { text: '항해일지를 덮고 숨을 고른다' }), msg, list);
  const el = h('div', { class: 'modal' }, panel);
  const nav = new FocusNav(list, g.audio);
  const modal = g.ui.push({ el, nav });
}

function confirmBox(g: Game, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const row = h(
      'div',
      { class: 'row' },
      button('예', () => {
        result = true;
        g.ui.pop(modal);
      }),
      button('아니오', () => g.ui.pop(modal)),
    );
    const el = h('div', { class: 'modal' }, h('div', { class: 'panel', style: 'width:min(420px,100%)' }, h('p', { text }), row));
    const nav = new FocusNav(row, g.audio, { grid: true });
    const modal = g.ui.push({ el, nav, onClose: () => resolve(result) });
  });
}

function slotLine(slot: SlotId): string {
  const s = readSlot(slot);
  if (!s) return '비어 있음';
  const when = s.savedAt ? new Date(s.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return `${ROOMS[s.room].name} · ${formatTime(s.time)} · ${when}`;
}

export function openLoad(g: Game): void {
  const mk = (slot: SlotId, label: string) => {
    const b = button(`${label} — ${slotLine(slot)}`, async () => {
      if (!readSlot(slot)) return;
      g.ui.closeAll();
      await g.loadGame(slot);
    });
    b.disabled = !readSlot(slot);
    return b;
  };
  const list = h('div', { style: 'display:flex;flex-direction:column;gap:6px' }, mk('manual', '수동 기록'), mk('auto', '자동 기록'), button('돌아가기', () => g.ui.pop(modal)));
  const el = h('div', { class: 'modal' }, h('div', { class: 'panel', style: 'width:min(560px,100%)' }, h('div', { class: 'eyebrow', text: 'LOAD · 불러오기' }), h('p', { class: 'muted', text: '문을 지날 때마다 자동으로 기록됩니다.' }), list));
  const nav = new FocusNav(list, g.audio);
  const modal = g.ui.push({ el, nav });
}

// ------------------------------------------------------------------ Settings & help

export function openSettings(g: Game): void {
  const s: Settings = { ...g.settings };
  const rows = h('div', { class: 'kv' });
  const apply = () => {
    g.applySettings({ ...s });
    render();
  };
  const cycle = <T,>(label: string, values: T[], cur: () => T, set: (v: T) => void, fmt: (v: T) => string) => {
    const b = button(fmt(cur()), () => {
      const i = values.indexOf(cur());
      set(values[(i + 1) % values.length]);
      g.audio.sfx('ui-move');
      apply();
    });
    rows.append(h('span', { text: label }), b);
  };
  const render = () => {
    rows.replaceChildren();
    cycle('조작 방식', ['direct', 'tank'] as Array<'direct' | 'tank'>, () => s.controls, (v) => (s.controls = v), (v) => (v === 'direct' ? '누른 방향으로 이동 (기본)' : '탱크 조작 (1992 원작)'));
    cycle('카메라', ['follow', 'fixed'] as Array<'follow' | 'fixed'>, () => s.camera, (v) => (s.camera = v), (v) => (v === 'follow' ? '플레이어 추적 (기본)' : '고정 카메라 (원작)'));
    cycle('해상도', [240, 360, 480] as const as unknown as Array<240 | 360 | 480>, () => s.res, (v) => (s.res = v), (v) => `${(v * 4) / 3}×${v}${v === 240 ? ' (1992)' : ''}`);
    cycle('디더링', [true, false], () => s.dither, (v) => (s.dither = v), (v) => (v ? '켬' : '끔'));
    cycle('색 단계', [8, 12, 20, 32, 64], () => s.levels, (v) => (s.levels = v), (v) => `${v}단계${v <= 8 ? ' (EGA 느낌)' : v <= 12 ? ' (VGA 느낌)' : ''}`);
    cycle('효과음', [0, 0.25, 0.5, 0.8, 1], () => s.volume, (v) => (s.volume = v), (v) => `${Math.round(v * 100)}%`);
    cycle('음악', [0, 0.35, 0.7, 1], () => s.music, (v) => (s.music = v), (v) => `${Math.round(v * 100)}%`);
    cycle('조사 힌트', [true, false], () => s.hints, (v) => (s.hints = v), (v) => (v ? '표시' : '숨김 (원작처럼)'));
    cycle('글자 속도', [24, 42, 80, 400], () => s.textSpeed, (v) => (s.textSpeed = v), (v) => (v >= 400 ? '즉시' : v >= 80 ? '빠름' : v >= 42 ? '보통' : '느림'));
    cycle('터치 조작', ['auto', 'on', 'off'] as Array<'auto' | 'on' | 'off'>, () => s.touch, (v) => (s.touch = v), (v) => (v === 'auto' ? '자동' : v === 'on' ? '항상 표시' : '숨김'));
    nav.refresh();
  };
  const back = button('닫기', () => g.ui.pop(modal));
  const panel = h('div', { class: 'panel', style: 'width:min(520px,100%)' }, h('div', { class: 'eyebrow', text: 'SETTINGS · 설정' }), rows, h('div', { class: 'row' }, back));
  const el = h('div', { class: 'modal' }, panel);
  const nav = new FocusNav(panel, g.audio);
  const modal = g.ui.push({ el, nav });
  render();
}

export function openHelp(g: Game): void {
  const kv = (k: string, v: string) => h('div', {}, h('span', { text: v }), h('kbd', { text: k }));
  const panel = h(
    'div',
    { class: 'panel' },
    h('div', { class: 'eyebrow', text: 'CONTROLS · 조작법' }),
    ...(g.settings.controls === 'direct'
      ? [
          h('h2', { text: '누른 방향으로 걷기' }),
          h('p', { class: 'muted', text: '방향키·스틱을 화면에서 가고 싶은 쪽으로 누르면 그쪽으로 돌아서 걷습니다. 방향키를 누르고 있는 동안에는 카메라가 돌거나 바뀌어도 걷던 방향이 그대로 유지됩니다.' }),
        ]
      : [
          h('h2', { text: '탱크 조작 — 1992년 원작 방식' }),
          h('p', { class: 'muted', text: '↑는 캐릭터가 바라보는 방향으로 전진, ←→는 제자리 회전입니다. 카메라가 바뀌어도 조작 방향은 바뀌지 않습니다.' }),
        ]),
    h(
      'div',
      { class: 'help-grid' },
      ...(g.settings.controls === 'direct'
        ? [kv('방향키 / WASD / 스틱', '누른 방향으로 이동'), kv('Shift · 스틱 끝까지', '달리기')]
        : [kv('↑ / W', '전진'), kv('↓ / S', '후진'), kv('← → / A D', '제자리 회전'), kv('Shift · ↑ 두 번', '달리기'), kv('↓ + Shift', '뒤로 돌기')]),
      ...(g.settings.camera === 'follow' ? [kv('C / Q', '카메라를 등 뒤로')] : []),
      kv('Space / E / Enter', '조사 · 열기 · 줍기 · 밀기'),
      kv('F / J / Ctrl', '공격 (든 무기, 없으면 발차기)'),
      kv('I / Tab', '소지품 · 상태'),
      kv('Esc / P', '일시정지 · 저장 · 설정'),
      kv('게임패드', 'A 조사 · X 공격 · Y 소지품 · B 달리기 · RB 카메라'),
    ),
    h('p', { class: 'muted', text: '설정에서 조작 방식(누른 방향 / 탱크)과 카메라(플레이어 추적 / 고정)를 바꿀 수 있습니다. 물건을 쓰려면 그 앞에 서서 소지품에서 "사용"을 고르세요. 문을 지날 때마다 자동 기록됩니다.' }),
    h('div', { class: 'row' }, button('닫기', () => g.ui.pop(modal))),
  );
  const el = h('div', { class: 'modal' }, panel);
  const nav = new FocusNav(panel, g.audio);
  const modal = g.ui.push({ el, nav });
}
