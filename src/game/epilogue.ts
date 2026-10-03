import type { CameraDef } from '../world/cameras';
import type { GameAPI } from '../world/types';
import { POINTS, PELL_WITNESS, dossier, establishes, pointBit, type PointId } from './logic5';

// The epilogue, "The Inquiry": June 1926, the Gravesend Marine Insurance Syndicate's committee room in
// London. The committee hears the Thalassa claim; the investigator answers each point with an exhibit
// from the dossier. Pell, if he came ashore, testifies by cable from Bell Cove.

type Flags = Pick<GameAPI, 'flag' | 'num'>;

/** Flags that open the epilogue. Only whether Pell came ashore carries over. */
export function epilogueFlags(pell: boolean): Record<string, boolean | number> {
  return {
    epilogue: true,
    // The committee room has its electric lamps.
    power: true,
    'ep.pell': pell,
    // The point being heard, and the points established so far (bit mask, see logic5).
    'ep.q': 0,
    'ep.ok': 0,
    'ep.answer': -1,
  };
}

export function withPellEp(g: Flags): boolean {
  return g.flag('ep.pell');
}

/** The exhibits the investigator can put in, in dossier order. */
export function exhibits(g: Flags): string[] {
  return dossier(withPellEp(g));
}

export type Speaker = 'chair' | 'solicitor' | 'clerk';

/** Where each speaker sits (the room uses these; the close-ups frame them from just past the witness table). */
export const SEATS: Record<Speaker, { x: number; z: number }> = {
  chair: { x: 0, z: 7.1 },
  solicitor: { x: 1.8, z: 7.1 },
  clerk: { x: 3.9, z: 3.6 },
};

export const CLOSE_UPS: Record<Speaker, CameraDef> = {
  chair: { id: 'chairClose', pos: [0.4, 1.45, 4.7], look: [0.0, 1.0, 7.1], fov: 44, zones: [] },
  solicitor: { id: 'solicitorClose', pos: [1.05, 1.5, 4.6], look: [1.6, 1.0, 7.1], fov: 46, zones: [] },
  clerk: { id: 'clerkClose', pos: [1.75, 1.45, 3.15], look: [3.8, 1.0, 3.6], fov: 46, zones: [] },
};
/** While the dossier is open (docked right): the committee table to the left of it. */
export const DOSSIER_CAM: CameraDef = { id: 'dossierClose', pos: [1.7, 1.95, 2.3], look: [-1.7, 1.05, 6.6], fov: 52, zones: [] };

export interface Hearing {
  speaker: Speaker;
  /** Short title shown on the dossier panel. */
  title: string;
  question: string;
  /** Read out when an exhibit establishes the point: per exhibit, then the committee's finding. */
  accepted: Record<string, string[]>;
  finding: string[];
  /** After a first wrong exhibit: the chairman points the way. */
  hint: string;
  /** Put in no exhibit, or two wrong ones: what goes in the minutes. */
  unproven: string;
}

export const HEARINGS: Record<PointId, Hearing> = {
  cause: {
    speaker: 'chair',
    title: '근인 — 10월 3일',
    question:
      '몰리 의장: "첫째, 근인이오. 10월 3일, 탈라사호는 대서양 한가운데서 케이블 고장을 고치고 있었소. 그날 무슨 일이 있었는지 기록으로 보여 주시오."',
    accepted: {
      logPage: [
        '빙엄 변호사가 찢겨 나온 항해일지를 소리 내어 읽는다. "03:40, 그래플이 해저 2,300길 부근에서 무언가에 걸림… 04:10, 장력이 설명할 수 없이 오르내림. 마치 저쪽에서 당기는 듯함."',
        '"05:55, 케이블 인양 완료. 절단된 끝부분에 검은 덩어리가 엉겨 붙어 있음."',
      ],
    },
    finding: ['몰리 의장: "바다 밑에서 무언가가 케이블에 붙어 올라왔고, 모든 일이 그날 시작됐군. 그것이 법이 말하는 바다의 위험인지는 마지막에 따지겠소."'],
    hint: '몰리 의장: "날짜를 보시오. 10월 3일 당일의 기록이 있을 거요. 항해일지라든가."',
    unproven: '빙엄 변호사: "기록하시오. 근인은 입증되지 않음."',
  },
  crew: {
    speaker: 'solicitor',
    title: '선원들',
    question:
      '빙엄 변호사: "10월 7일 밤, 갑판장을 비롯한 선원 넷이 1번 구명정을 내려 배를 버렸소. 배가 그 지경이 된 것은 선원들이 달아났기 때문 아니오? 그렇다면 이것은 선원의 비행이오."',
    accepted: {
      captainLog: ['빙엄 변호사가 공식 항해일지를 넘긴다. "10월 5일, 갑판원 오하라, 쿠퍼 탱크 점검 중 실종. 10월 6일, 기관부 셋이 사라짐. 10월 7일, 선원 일부가 1번 구명정을 내려 탈출…"', '몰리 의장이 날짜를 짚는다. "선원들이 떠난 것은 일이 벌어지고 나서였군."'],
      bosunNotes: ['빙엄 변호사가 갑판장의 수첩을 읽는다. "선수 흘수표가 한 뼘 더 잠겼다… 선장은 케이블을 놓지 않겠다고 한다… 오늘 밤 1번 구명정을 내린다."', '몰리 의장: "배가 끌려 들어가는데 선장이 버티니, 그들이 떠난 거군."'],
    },
    finding: ['몰리 의장: "1906년 해상보험법 55조요. 선장이나 선원의 잘못이 끼어들었더라도, 손해의 근인이 보험이 담보한 위험이면 보험자는 책임을 지오. 선원들이 떠난 것이 지급을 막지는 못하오."'],
    hint: '몰리 의장: "선원들이 언제 사라졌고 언제 떠났는지, 그 순서를 보여 주시오."',
    unproven: '빙엄 변호사: "기록하시오. 선원의 비행 여부는 판단하지 않음."',
  },
  flooding: {
    speaker: 'solicitor',
    title: '2번 탱크',
    question:
      '빙엄 변호사: "2번 케이블 탱크는 해수 흡입 밸브가 열린 채 물에 잠겼소. 선장은 그 탱크 바닥에서 죽었고. 선장이 제 손으로 배를 가라앉히려 한 것 아니오? 선주가 시켰을 수도 있고."',
    accepted: {
      haleLetter: [
        '빙엄 변호사가 방수포에 싸여 있던 편지를 펼친다. "탱크의 물을 빼고 사리를 끊을 생각이었소… 누군가 기관실 밸브를 열었소. 물이 다시 차오르고 있소."',
      ],
    },
    finding: ['몰리 의장: "선장은 탱크 바닥에 있었고, 밸브는 다른 누군가가 열었소. 선장의 고의 침수는 아니오."', '빙엄 변호사가 덧붙인다. "그 \'누군가\'의 이름은 기록에 없군요."'],
    hint: '몰리 의장: "그때 선장이 어디에 있었는지 보여 주시오. 선장이 남긴 마지막 글이라도."',
    unproven: '빙엄 변호사: "기록하시오. 고의 침수의 의혹이 남음."',
  },
  authority: {
    speaker: 'solicitor',
    title: '케이블 — 누구의 지시로',
    question:
      '빙엄 변호사: "청구액에서 가장 큰 것은 바다에 놓아 보낸 케이블이오. 조사관, 귀하는 우리 조합 사람이오. 피보험자의 케이블을 누구의 권한으로 놓아 보냈소?"',
    accepted: {
      haleLetter: ['빙엄 변호사가 편지의 마지막 줄을 읽는다. "누구든 이 편지를 읽는 사람에게. 불을 꺼뜨리지 마시오. 그리고 케이블을 놓으시오. — A. H."'],
    },
    finding: ['몰리 의장: "선장의 친필이군. 케이블을 놓은 것이 선장의 지시였다는 것은 인정하겠소."'],
    hint: '몰리 의장: "선장이 케이블에 관해 남긴 말이 있었소?"',
    unproven: '빙엄 변호사: "기록하시오. 조사관이 제 판단으로 피보험자의 재산을 버림."',
  },
  peril: {
    speaker: 'solicitor',
    title: '케이블 — 그 밤의 위험',
    question:
      '빙엄 변호사: "지시가 있었다 칩시다. 그래도 공동해손이 되려면 위험이 실제로 있어야 하오. 그 밤, 배가 정말 위험했소? 증거를 대시오."',
    accepted: {
      bosunNotes: ['빙엄 변호사가 갑판장의 수첩을 읽는다. "선수 흘수표가 어제보다 한 뼘 더 잠겼다. 배는 멈춰 있는데 선수만 자꾸 숙인다. 쉬브 위의 케이블 두 가닥이 맥박처럼 떤다."'],
      baleNote: ['빙엄 변호사가 전기기사 베일의 측정 기록을 읽는다. "고장점 2.9해리… 2.6해리… 2.2해리." 무언가가 케이블을 타고 배 쪽으로 오고 있었다.'],
    },
    finding: [
      '몰리 의장: "위험한 때에, 함께 걸린 재산을 지키려고, 스스로 그리고 합리적으로 한 희생. 1906년 법 66조의 공동해손 행위요. 케이블은 공동해손 희생으로 보겠소."',
    ],
    hint: '몰리 의장: "그 밤 배가 어떤 상태였는지 적어 둔 사람이 있을 거요. 갑판에서든, 시험실에서든."',
    unproven: '빙엄 변호사: "기록하시오. 위험이 실제로 있었는지는 입증되지 않음."',
  },
  credit: {
    speaker: 'chair',
    title: '증언',
    question:
      '몰리 의장: "마지막이오. 젖은 채 걸어 다니는 선원들, 케이블을 타고 오는 것. 이 위원회가 조사관 한 사람의 말만 믿고 그런 것을 의사록에 적을 수는 없소. 귀하 말고 누가 이것을 보았소?"',
    accepted: {
      stationDiary: ['빙엄 변호사가 벨 코브 소장의 일지를 읽는다. "1월 20일. 493해리. 잴 때마다 줄어든다. 하루 13해리 — 무언가 케이블을 타고 이쪽으로 온다."', '탈라사호와 아무 상관 없는 사람이, 넉 달 뒤 대서양 건너편에서 적은 기록이다.'],
      telegram: ['빙엄 변호사가 회사의 전보를 읽는다. "벨 코브의 고장 시험값이 날마다 육지 쪽으로 줄어든다는 보고가 있었으나, 본사는 계기 이상으로 판단하였음."', '"…귀하의 탈라사호 보고서를 끝까지 읽은 사람은 본사에 몇 되지 않음."'],
      workOrder: ['빙엄 변호사가 작업 지시서 아래의 손글씨를 읽다가 입을 다문다. "상한 구간에서 무엇이 올라오든, 배에 두지 말 것. — 기술부장."', '피보험자인 회사의 기술부장이 직접 쓴 글이다.'],
      [PELL_WITNESS]: ['서기가 케이블로 온 진술서를 읽는다. "나 토머스 펠은 C.S. 탈라사호의 통신사로서, 그 배에 남은 마지막 선원이었음을 진술함… 조사관이 위원회에 진술한 것은 모두 내가 보고 들은 그대로임."', '서기: "…진술서 끝에 한 글자가 더 붙어 왔습니다. 점, 선, 점."'],
    },
    finding: ['몰리 의장이 한참 서류를 내려다본다. "…좋소. 조사관의 증언 전문을 의사록에 첨부하겠소."'],
    hint: '몰리 의장: "탈라사호 사람이 아닌 누군가가 남긴 기록이 있소? 벨 코브라든가, 회사라든가."',
    unproven: '빙엄 변호사: "기록하시오. 조사관 개인의 소견."',
  },
};

/** Exhibits that do not answer the point: the solicitor's reply (some records have their own). */
const NOT_THAT: Record<string, string> = {
  commission: '빙엄 변호사: "그건 우리가 귀하에게 보낸 의뢰서요. 우리도 읽었소."',
  grappleCard: '빙엄 변호사: "갑판장 스톤의 그래플 수칙이군요. 훌륭한 수칙이오. 지금 질문과는 상관없지만."',
  codeCard: '빙엄 변호사: "모스 부호표를 내미는군요. 위원회는 부호를 배울 생각이 없소."',
  testManual: '빙엄 변호사: "기술 문서는 기술부에 보내시오."',
  batteryLog: '빙엄 변호사: "축전지 수첩이라. 기술 문서는 기술부에 보내시오."',
  letter: '몰리 의장이 편지를 한참 들여다보다 돌려준다. "…이 아이의 어머니에게는 따로 연락하겠소. 하지만 지금 질문의 답은 아니오."',
  pellLetter: '빙엄 변호사: "사사로운 편지는 증거로 받기 어렵소."',
  bcWire: '빙엄 변호사: "벨 코브의 업무 전보로군요. 지금 질문과는 상관없소."',
};
const NOT_THAT_DEFAULT = ['빙엄 변호사: "그 서류는 이 질문과 상관이 없소."', '빙엄 변호사: "흥미롭군요. 하지만 지금 묻는 것과는 다른 이야기요."', '몰리 의장: "그건 답이 되지 않소."'];

export function notThat(exhibit: string, k: number): string {
  return NOT_THAT[exhibit] ?? NOT_THAT_DEFAULT[k % NOT_THAT_DEFAULT.length];
}

/** The last question: what goes in the minutes as the cause. No exhibit answers it. */
export const LAST_QUESTION = '몰리 의장: "끝으로 하나만 묻겠소. 의사록에 근인을 적어야 하오. 조사관, 그것은 무엇이었소?"';
export const LAST_ANSWERS = ['바다의 위험이었습니다', '살아 있는 것이었습니다. 지금은 불에 탔습니다', '모르겠습니다'];

/** Opening of the hearing, the first time the witness takes the stand. */
async function opening(g: GameAPI): Promise<void> {
  g.cutTo(CLOSE_UPS.chair);
  await g.say(
    '몰리 의장: "앨비언 대서양전신회사가 탈라사호의 선체·장비 보험금을 청구했소. 2번 탱크 침수와 기관 손상, 1번 구명정, 그리고 바다에 놓아 보낸 케이블."',
    '몰리 의장: "우리 조합이 낼 돈인지는 손해의 근인이 보험이 담보한 위험이냐에 달렸소. 질문마다 서류철에서 근거를 내시오. 말만으로는 의사록에 남지 않소."',
  );
  if (withPellEp(g)) {
    g.cutTo(CLOSE_UPS.clerk);
    await g.say('서기: "벨 코브의 토머스 펠 씨가 케이블로 진술서를 보내왔습니다. 서류철에 함께 넣어 두었습니다."');
  }
  g.cutTo(CLOSE_UPS.solicitor);
  await g.say('빙엄 변호사: "조사관은 우리 조합 사람이지만, 오늘은 증인이오. 봐주지 않겠소."');
}

/**
 * The hearing, from the point reached (it can be broken off by closing the dossier and taken up again at
 * the witness stand). Ends with the last question and the committee's ruling.
 */
export async function runHearing(g: GameAPI): Promise<void> {
  if (g.flag('ep.done')) return;
  if (!g.flag('ep.started')) {
    g.setFlag('ep.started');
    await opening(g);
  }
  const list = exhibits(g);
  for (let q = g.num('ep.q'); q < POINTS.length; q++) {
    const point = POINTS[q];
    const h = HEARINGS[point];
    g.cutTo(CLOSE_UPS[h.speaker]);
    await g.say(h.question);
    let misses = 0;
    for (;;) {
      g.setFlag('ep.pick', -2);
      g.cutTo(DOSSIER_CAM);
      await g.openPanel('inquiry');
      const pick = g.num('ep.pick');
      if (pick === -2) {
        const c = await g.ask('심문을 계속할까?', [{ label: '계속한다' }, { label: '잠시 서류를 정리한다' }]);
        if (c === 1) {
          g.cutTo(null);
          g.save(true);
          g.note('증인석에서 심문을 다시 시작한다');
          return;
        }
        continue;
      }
      if (pick === -1) {
        g.cutTo(CLOSE_UPS.solicitor);
        await g.say('나는 서류 없이 답했다. 위원들이 서로 얼굴을 본다.', h.unproven);
        break;
      }
      const ex = list[pick];
      if (ex && establishes(point, ex, withPellEp(g))) {
        g.setFlag('ep.ok', g.num('ep.ok') | pointBit(point));
        g.sfx('doc', { volume: 0.9 });
        g.cutTo(ex === PELL_WITNESS ? CLOSE_UPS.clerk : CLOSE_UPS.solicitor);
        await g.say(...(h.accepted[ex] ?? []));
        g.cutTo(CLOSE_UPS.chair);
        await g.say(...h.finding);
        break;
      }
      misses++;
      g.sfx('locked', { volume: 0.5 });
      g.cutTo(CLOSE_UPS.solicitor);
      if (misses >= 2) {
        await g.say(notThat(ex, misses), h.unproven);
        break;
      }
      await g.say(notThat(ex, misses));
      g.cutTo(CLOSE_UPS.chair);
      await g.say(h.hint);
    }
    g.setFlag('ep.q', q + 1);
    // One room and no door to pass through: the autosave keeps up with the hearing instead.
    g.save(true);
  }
  g.cutTo(CLOSE_UPS.chair);
  const a = await g.ask(LAST_QUESTION, LAST_ANSWERS.map((label) => ({ label })));
  g.setFlag('ep.answer', a);
  g.setFlag('ep.done');
  await g.say('몰리 의장이 펜을 내려놓고, 위원들과 낮은 목소리로 몇 마디를 나눈다.', '몰리 의장: "위원회의 판정을 읽겠소."');
  g.cutTo(null);
  await g.nextAct();
}
