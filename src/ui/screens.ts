import type { Game } from '../game/Game';
import { latestSave, readProgress, readSlot, formatTime, type Settings, type SlotId } from '../game/state';
import { ROOMS } from '../world/rooms';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';
import { established, verdict } from '../game/logic5';

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
    ...(readProgress().act >= 2 ? [button('막 선택', () => openChapters(g, modal))] : []),
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

/** Start from the beginning of any act this browser has already reached. */
function openChapters(g: Game, title: Modal): void {
  const p = readProgress();
  const start = async (act: number) => {
    if (latestSave()) {
      const ok = await confirmBox(g, '막을 골라 시작하면 처음 문을 지날 때 자동 기록이 새 진행으로 바뀝니다(수동 기록은 남습니다). 시작할까요?');
      if (!ok) return;
    }
    g.ui.pop(modal);
    g.ui.pop(title);
    void g.startChapter(act, p.pell);
  };
  const acts: Array<[number, string, string]> = [
    [1, '1막 · 용골 아래', '1925년 10월 · 탈라사호'],
    [2, '2막 · 선수창 아래', '같은 밤 · 선수'],
    [3, '3막 · 뭍으로', '1926년 2월 · 벨 코브 양륙국'],
    [4, '4막 · 갈고리', '1926년 4월 · 수리선 세인트 브렌던호'],
    [5, '에필로그 · 조사위원회', '1926년 6월 · 런던'],
  ];
  const list = h(
    'div',
    { class: 'menu', style: 'display:flex;flex-direction:column;gap:6px' },
    ...acts.map(([n, name, when]) => button(`${name} — ${when}`, () => void start(n), { disabled: n > p.act })),
    button('돌아가기', () => g.ui.pop(modal)),
  );
  const note = p.act >= 3 ? `3막부터는 2막 끝의 선택을 따릅니다: ${p.pell ? '펠과 함께 내려왔다' : '혼자 내려왔다'}.` : '도달한 막부터 다시 시작할 수 있습니다.';
  const el = h('div', { class: 'modal' }, h('div', { class: 'panel', style: 'width:min(520px,100%)' }, h('div', { class: 'eyebrow', text: 'CHAPTERS · 막 선택' }), h('p', { class: 'muted', text: note }), list));
  const nav = new FocusNav(list, g.audio);
  const modal = g.ui.push({ el, nav });
}

// ------------------------------------------------------------------ Narrative screens

function story(g: Game, dateLine: string, lines: string[], opts: { finalButtons?: Array<[string, () => void]>; bg?: string; compact?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    const lineEls = lines.map((l) => h('p', { class: 'line', text: l }));
    const skip = h('div', { class: 'skip', text: '계속하려면 Space · 클릭 · 탭' });
    const buttons = h('div', { class: 'row', style: 'justify-content:center' });
    const box = h('div', { class: opts.compact ? 'story compact' : 'story' }, h('div', { class: 'date', text: dateLine }), ...lineEls, skip, buttons);
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

/** The end of the second act: the boat, the report, what became of Pell. Then the third act begins. */
export async function playInterlude(g: Game, withPell: boolean): Promise<void> {
  g.audio.setDanger(false);
  g.audio.setAmbience('title');
  const lines = withPell
    ? [
        '나는 펠을 업고 줄사다리를 내려갔다. 보트에 앉자마자 그는 정신을 잃었다. 잠든 얼굴로도 손가락만은 쉬지 않고 무언가를 두드리고 있었다.',
        '보고서에는 두 사람의 증언이 실렸다. 아무도 믿지 않았지만, 누구도 반박하지 못했다.',
        '펠은 다시는 배를 타지 않겠다고 했다. 다리가 낫자 그는 뭍의 케이블국에 자리를 구했다. 바다 위가 아니라, 바다를 건너온 신호를 듣는 자리를.',
      ]
    : [
        '줄사다리를 내려가기 직전, 선수 쪽에서 두드리는 소리가 들렸다. 세 번, 쉬고, 세 번.',
        '나는 돌아보지 않았다.',
        '보고서에는 "생존자 없음"이라고 적었다. 그 두드림이 사람의 것이었는지 흉내였는지, 나는 끝내 확인하지 않았다.',
      ];
  await story(
    g,
    '1925년 10월 12일 · 새벽',
    [
      '그 밤의 나머지는 길고 조용했다. 배는 더 이상 끌려가지 않았고, 어디서도 두드리는 소리는 들리지 않았다.',
      '동틀 무렵, 안개를 가르며 마그누스호의 기적이 울렸다.',
      ...lines,
      '탈라사호가 놓아 보낸 케이블의 끝은 깊은 바다 밑으로 가라앉았다. 그것을 쥔 채로.',
      '— 2막 끝 —',
    ],
    { bg: 'rgba(8,10,12,0.96)' },
  );
}

/** The third act's opening: four months later, a telegram, a sleigh, a dark station in the snow. */
export async function playLandfallIntro(g: Game, withPell: boolean): Promise<void> {
  g.audio.setAmbience('snow');
  await story(
    g,
    '1926년 2월 27일 · 뉴펀들랜드, 트리니티만',
    [
      '탈라사호의 밤으로부터 넉 달.',
      '12월, 회사의 수리선이 가라앉은 케이블 끝을 건져 새 케이블을 이었다. 회선은 다시 대서양을 건너 신호를 실어 날랐다.',
      '그리고 2월, 런던에서 전보가 왔다. 벨 코브 양륙국이 교신을 끊었다고. 마지막 전문은 단 한 줄이었다. IT COMES ASHORE — 그것이 뭍으로 온다.',
      withPell
        ? '전문 끝에는 서명이 있었다. TP — 벨 코브의 야간 통신사, 토머스 펠.'
        : '캐리긴국의 기록지에는 그 전문 뒤로 한 줄이 더 찍혀 있었다고 한다. 세 번, 쉬고, 세 번. 탈라사호의 선원 거주구에 두고 온 그 소리다.',
      '썰매꾼은 역 마당 앞에서 말을 돌렸다. 저 집에는 들어가지 않겠다고 했다.',
      '눈이 내린다. 바다 쪽에서, 무언가 아주 무거운 것이 자갈을 끄는 소리가 들린다.',
    ],
    { bg: 'rgba(6,8,12,0.96)' },
  );
}

/** The morning after Bell Cove: what the fire took, what it did not. Then the fourth act begins. */
export async function playLandfallEnd(g: Game, withPell: boolean): Promise<void> {
  g.audio.setDanger(false);
  g.audio.setAmbience('title');
  await story(
    g,
    '1926년 2월 28일 · 벨 코브',
    [
      '날이 밝자 해변에는 검게 그을린 케이블과, 사람 키만 한 숯덩이 같은 것이 남아 있었다. 썰물이 그것을 데려갔다.',
      ...(withPell
        ? [
            '펠은 그날 아침 캐리긴에 전문을 보냈다. BELL COVE RESUMES. 캐리긴은 곧바로 R로 답했다.',
            '…조금 뒤, 같은 R이 한 번 더 찍혔다. 메아리처럼. 펠은 기록지를 오래 들여다보다가, 말없이 찢어 난로에 넣었다.',
          ]
        : [
            '나는 서툰 손으로 캐리긴에 전문을 보냈다. BELL COVE RESUMES. 캐리긴은 R로 답했다.',
            '…조금 뒤, 기록지에 한 줄이 더 찍혔다. 세 번, 쉬고, 세 번.',
          ]),
      '불꽃이 태운 것은 그것의 손 하나였다. 케이블 저편, 탈라사호가 케이블을 놓아 보낸 바다 밑 어딘가에 그것의 뿌리가 남아 있다.',
      '회사는 봄에 수리선을 보내 그 구간을 끌어올리기로 했다. 나는 그 배에 타겠다고 했다.',
      '— 3막 끝 —',
    ],
    { bg: 'rgba(8,10,12,0.96)' },
  );
}

/** The fourth act's opening: the St Brendan on station over the cable's grave. */
export async function playHookIntro(g: Game, withPell: boolean): Promise<void> {
  g.audio.setAmbience('deck');
  await story(
    g,
    '1926년 4월 19일 · 북대서양, 벨 코브 기점 1,036해리',
    [
      '3월 내내 벨 코브와 캐리긴은 같은 곳을 가리켰다. 벨 코브 기점 1,036해리. 탈라사호가 케이블을 놓아 보낸 바로 그 자리. 절연은 날마다 떨어졌다.',
      '회사는 수리선 세인트 브렌던호를 보냈다. 탈라사호 이야기를 들은 선원 절반이 배에서 내렸다. 나는 탔다.',
      withPell
        ? '펠은 오지 않았다. 다시는 바다에 나가지 않겠다는 약속을 지키겠다고 했다. 대신 벨 코브의 회선 끝에 앉아 있겠다고 했다.'
        : '벨 코브에는 새 야간 근무자가 왔다. 그 사람은 내 손을 모른다. 나도 그 사람의 손을 모른다.',
      '사흘째 밤, 배가 자리에 닿았다. 그리고 이등항해사가 사라졌다. 갑판에는 뱃전에서 시작된 젖은 발자국만 남았다.',
    ],
    { bg: 'rgba(8,10,12,0.96)' },
  );
}

/** The last ending: the heart in the fire, the cable made good, and who is left to answer. */
export async function playEnding(g: Game): Promise<void> {
  g.audio.setDanger(false);
  g.audio.setAmbience('title');
  const st = g.state;
  const stats = `플레이 시간 ${formatTime(st.time)} · 기록 ${st.saves}회 · 죽음 ${st.deaths}회 · 읽은 문서 ${st.docs.length}편`;
  const withPell = g.flag('a4.pell');
  await story(
    g,
    '1926년 4월 20일 · 세인트 브렌던호',
    [
      '불길이 화실 문틈으로 퍼렇게 새어 나왔다. 배 전체가 한 번, 길게 떨었다. 그리고 바다가 조용해졌다.',
      '그날 저녁 로스가 새 케이블을 이어 부표의 끝까지 가져갔다. 마무리 접속이 끝나자 그는 시험 키를 내게 내밀었다.',
      ...(withPell
        ? [
            '나는 R을 쳤다. 벨 코브에서 곧바로 답이 왔다. R. 그리고 TP.',
            '…그 뒤로는 아무것도 오지 않았다. 메아리도, 세 번 쉬고 세 번도. 펠이 한 번 더 쳤다. 이번에는 웃는 것 같았다.',
            '6월, 런던의 보험조합 조사위원회가 나를 불렀다. 증인은 둘이었다. 나와, 바다를 건너온 신호를 듣는 사람.',
            '— 엔딩 · 두 사람의 증언 —',
          ]
        : [
            '나는 R을 쳤다. 벨 코브의 새 근무자가 답했다. R BC.',
            '…그 뒤로는 아무것도 오지 않았다. 나는 오래 키 앞에 앉아 있었다. 탈라사호의 선원 거주구에 두고 온 그 두드림이, 이번에는 대답해 주기를 바라면서.',
            '6월, 런던의 보험조합 조사위원회가 나를 불렀다. 증인은 나 하나였다.',
            '— 엔딩 · 홀로 돌아오다 —',
          ]),
      stats,
    ],
    {
      finalButtons: [
        ['에필로그 · 조사위원회로', () => void g.continueToEpilogue()],
        ['타이틀로', () => g.showTitle()],
      ],
      bg: 'rgba(8,10,12,0.96)',
    },
  );
}

/** The epilogue's opening: London, June 1926. */
export async function playInquiryIntro(g: Game, withPell: boolean): Promise<void> {
  g.audio.setAmbience('interior');
  await story(
    g,
    '1926년 6월 14일 · 런던',
    [
      '세인트 브렌던호가 돌아오고 한 달 뒤, 그레이브센드 해상보험조합에서 편지가 왔다. 탈라사호의 보험금 청구를 심리하는 위원회를 연다고.',
      '증인은 조합의 조사관. 나다.',
      withPell
        ? '펠은 오지 않았다. 다시는 바다를 건너지 않겠다는 맹세를 지켜, 대신 벨 코브에서 케이블로 진술서를 보내왔다.'
        : '펠은 탈라사호에 두고 왔다. 내 말을 대신 증언해 줄 사람은 없다.',
      '서류철에는 탈라사호에서 세인트 브렌던호까지, 반년 동안 모은 기록이 들어 있다. 항해일지, 일기, 편지, 전보. 그 가운데 무엇을 내밀지는 내가 정한다.',
    ],
    { bg: 'rgba(10,9,8,0.96)' },
  );
}

/** The committee's ruling, point by point, and how the investigator answered the last question. */
export async function playVerdict(g: Game): Promise<void> {
  g.audio.setDanger(false);
  g.audio.setAmbience('title');
  const st = g.state;
  const mask = g.num('ep.ok');
  const ok = established(mask);
  const v = verdict(mask);
  const withPell = g.flag('ep.pell');
  const answer = Math.max(0, g.num('ep.answer'));
  const stats = `플레이 시간 ${formatTime(st.time)} · 기록 ${st.saves}회 · 죽음 ${st.deaths}회 · 읽은 문서 ${st.docs.length}편`;
  const ruling = [
    ok.has('cause') ? '근인 — 수심 2,300길에서 그래플에 걸려 올라온 것. 바다의 우연한 사고로 본다.' : '근인 — 입증되지 않았다.',
    ok.has('crew') ? '선원 — 선원들은 손해가 시작된 뒤에 떠났다. 지급을 막지 않는다.' : '선원 — 비행 여부는 판단하지 않는다.',
    ok.has('flooding') ? '2번 탱크 — 선장이 연 것이 아니다.' : '2번 탱크 — 고의 침수의 의혹이 남는다.',
    v.cable
      ? '케이블 — 선장의 지시로, 위험한 때에, 배를 지키려고 놓아 보냈다. 공동해손 희생으로 인정한다.'
      : ok.has('authority') && ok.has('peril')
        ? // The sacrifice is made out, but the insurer answers for it only against a peril insured against (s.66(6)).
          '케이블 — 희생은 인정하나, 피하려던 위험이 보험이 담보한 위험인지는 입증되지 않았다.'
        : '케이블 — 공동해손으로 볼 근거가 모자란다.',
    v.testimony ? '증언 — 전문을 의사록에 첨부한다.' : '증언 — 조사관 개인의 소견으로만 남긴다.',
  ].join('\n');
  const payment =
    v.payment === 'full'
      ? '보험금은 전액 지급한다.'
      : v.payment === 'part'
        ? v.hull
          ? '보험금은 선체와 기관의 손해만 지급한다. 케이블은 지급하지 않는다.'
          : '보험금은 공동해손으로 인정한 케이블만 지급한다.'
        : '보험금은 근인이 입증될 때까지 지급을 보류한다.';
  const said = [
    '나는 바다의 위험이었다고 답했다. 의장은 고개를 끄덕이고 의사록에 적었다. 우연한 해난. 법이 아는 말 가운데 그것에 가장 가까운 말이었다.',
    v.testimony
      ? '나는 그것이 살아 있었다고, 그리고 지금은 불에 탔다고 답했다. 의장은 한참 펜을 들고 있다가, 증언 전문을 봉인해 의사록과 함께 금고에 넣으라고 일렀다.'
      : '나는 그것이 살아 있었다고, 그리고 지금은 불에 탔다고 답했다. 서기는 그 말을 적지 않았다.',
    '나는 모른다고 답했다. 그것이 진실이었다. 의장은 펜을 내려놓았다.',
  ][Math.min(2, answer)];
  await story(
    g,
    '1926년 6월 14일 · 런던, 그레이브센드 해상보험조합',
    [
      `몰리 의장이 판정문을 읽었다. 인정된 쟁점 ${v.score} / 6.`,
      ruling,
      payment,
      said,
      withPell
        ? '그날 저녁 회사의 케이블 사무소에 들러 벨 코브를 불렀다. R. 곧바로 답이 왔다. R, 그리고 TP. 메아리는 오지 않았다.'
        : '건물을 나서자 6월의 런던은 시끄러웠다. 나는 한참 서서 들었다. 세 번, 쉬고, 세 번은 — 오지 않았다.',
      `— 에필로그 · ${['우연한 해난', v.testimony ? '봉인된 증언' : '적히지 않은 증언', '모른다는 대답'][Math.min(2, answer)]} —`,
      stats,
    ],
    // The ruling is long: set close, so that it fits on one screen.
    { finalButtons: [['타이틀로', () => g.showTitle()]], bg: 'rgba(10,9,8,0.96)', compact: true },
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
