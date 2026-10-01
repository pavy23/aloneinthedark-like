import type * as THREE from 'three';
import type { WeaponSpec } from '../entities/Player';
import * as P from '../world/props';
import { M } from '../render/materials';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: 'light' | 'doc' | 'weapon' | 'key' | 'heal' | 'quest';
  doc?: string;
  weapon?: WeaponSpec;
  /** What drinking it feels like (healing items). */
  useText?: string;
  model: () => THREE.Object3D;
}

export const ITEMS: Record<string, ItemDef> = {
  lantern: {
    id: 'lantern',
    name: '허리케인 랜턴',
    desc: '등유를 채운 허리케인 랜턴. 이 배에서 내가 가진 유일한 빛이다. 심지는 아직 넉넉하다.',
    kind: 'light',
    model: P.lanternItem,
  },
  commission: {
    id: 'commission',
    name: '조사 의뢰서',
    desc: '그레이브센드 해상보험조합이 보낸 의뢰서. 탈라사호에 관한 지시가 적혀 있다.',
    kind: 'doc',
    doc: 'commission',
    model: () => P.paperItem(M.paper),
  },
  crowbar: {
    id: 'crowbar',
    name: '쇠지렛대',
    desc: '붉게 칠한 무거운 쇠지렛대. 끝이 휘어 있다. 무언가를 비틀어 열거나, 필요하다면 휘두를 수 있다.',
    kind: 'weapon',
    weapon: { id: 'crowbar', damage: 1, range: 1.3, hitAt: 0.33, duration: 0.72 },
    model: P.crowbarItem,
  },
  axe: {
    id: 'axe',
    name: '소방 도끼',
    desc: '소화 설비함에 있던 도끼. 날이 잘 서 있다. 쇠지렛대보다 무겁지만 훨씬 치명적이다.',
    kind: 'weapon',
    weapon: { id: 'axe', damage: 2, range: 1.35, hitAt: 0.42, duration: 0.9 },
    model: P.axeItem,
  },
  cabinKey: {
    id: 'cabinKey',
    name: '선장실 열쇠',
    desc: '황동 열쇠. 가죽 꼬리표에 "MASTER"라고 찍혀 있다.',
    kind: 'key',
    model: P.keyItem,
  },
  crank: {
    id: 'crank',
    name: '수밀문 개폐 핸들',
    desc: 'T자형 쇠 핸들. 끝에 사각 소켓이 있다. 나사식 수밀문의 축을 돌리는 데 쓴다.',
    kind: 'key',
    model: P.crankItem,
  },
  brandy1: {
    id: 'brandy1',
    name: '브랜디 플라스크',
    desc: '가죽을 두른 휴대용 술병. 한 모금이면 떨리는 손이 멎을 것이다. (체력 회복)',
    kind: 'heal',
    model: P.flask,
  },
  brandy2: {
    id: 'brandy2',
    name: '브랜디 플라스크',
    desc: '선장의 것으로 보이는 은빛 술병. 아직 반쯤 남았다. (체력 회복)',
    kind: 'heal',
    model: P.flask,
  },
  idol: {
    id: 'idol',
    name: '검은 돌',
    desc: '케이블에 휘감겨 올라온 검은 돌덩이. 차갑고 축축하며, 손바닥 안에서 아주 느리게 맥박이 뛰는 것 같다.',
    kind: 'quest',
    model: P.idol,
  },
  logPage: { id: 'logPage', name: '찢어진 항해일지', desc: '선교에 떨어져 있던 항해일지 한 장.', kind: 'doc', doc: 'logPage', model: () => P.paperItem(M.paper) },
  diary: { id: 'diary', name: '선장의 일기', desc: '가죽 장정의 개인 일기장. 표지에 A.H.라는 머리글자.', kind: 'doc', doc: 'diary', model: () => P.bookItem(M.leather) },
  captainLog: { id: 'captainLog', name: '공식 항해일지', desc: '선장이 금고에 넣어 둔 공식 항해일지. 보험조합이 찾던 바로 그 기록이다.', kind: 'doc', doc: 'captainLog', model: () => P.bookItem(M.greenCloth) },
  engineerNotes: { id: 'engineerNotes', name: '기관장의 수첩', desc: '기름때 묻은 수첩. 발전기 기동 절차가 적혀 있다.', kind: 'doc', doc: 'engineerNotes', model: () => P.bookItem(M.leather) },
  wirelessLog: { id: 'wirelessLog', name: '무선 통신 일지', desc: '무선실 통신사의 송수신 기록.', kind: 'doc', doc: 'wirelessLog', model: () => P.bookItem(M.woodDark) },
  letter: { id: 'letter', name: '부치지 못한 편지', desc: '갑판원이 쓰다 만 편지.', kind: 'doc', doc: 'letter', model: () => P.paperItem(M.paper) },
  testRecord: { id: 'testRecord', name: '케이블 시험 기록', desc: '전기기사의 절연·도통 시험 기록지.', kind: 'doc', doc: 'testRecord', model: () => P.paperItem(M.paper) },
  // ---- Act 2
  testKey: {
    id: 'testKey',
    name: '시험실 열쇠',
    desc: '"TESTING ROOM · H.B."라고 새긴 놋쇠 꼬리표가 달린 열쇠. 통신사 펠이 건네주었다.',
    kind: 'key',
    model: P.keyItem,
  },
  brakeKey: {
    id: 'brakeKey',
    name: '고정핀 자물쇠 열쇠',
    desc: '헤일 선장의 목에 걸려 있던 묵직한 열쇠. 케이블 권양기 브레이크 고정핀의 자물쇠를 연다.',
    kind: 'key',
    model: P.bigKeyItem,
  },
  rum: {
    id: 'rum',
    name: '럼 병',
    desc: '선원 거주구 사물함 깊숙이 숨겨져 있던 럼. 반쯤 남았다. (체력 회복)',
    kind: 'heal',
    useText: '럼을 한 모금 들이켰다. 독한 술이 식도를 태우며 내려가고, 곱은 손끝에 피가 돈다.',
    model: P.bottle,
  },
  bosunNotes: { id: 'bosunNotes', name: '갑판장의 수첩', desc: '바닷물에 불은 갑판장의 수첩.', kind: 'doc', doc: 'bosunNotes', model: () => P.bookItem(M.leather) },
  testManual: { id: 'testManual', name: '고장점 측정 요령', desc: '시험실 책상에 붙어 있던 측정 요령 카드.', kind: 'doc', doc: 'testManual', model: () => P.paperItem(M.paper) },
  baleNote: { id: 'baleNote', name: '베일의 측정 기록', desc: '전기기사 베일이 마지막으로 남긴 측정 기록.', kind: 'doc', doc: 'baleNote', model: () => P.paperItem(M.paper) },
  haleLetter: { id: 'haleLetter', name: '선장의 마지막 편지', desc: '방수포에 싸인 채 선장의 가슴 주머니에 들어 있던 편지.', kind: 'doc', doc: 'haleLetter', model: () => P.paperItem(M.paper) },
};

export interface DocDef {
  id: string;
  title: string;
  style: 'typed' | 'hand' | 'log' | 'plate';
  pages: string[];
}

export const DOCS: Record<string, DocDef> = {
  commission: {
    id: 'commission',
    title: '그레이브센드 해상보험조합 — 조사 의뢰서',
    style: 'typed',
    pages: [
      `1925년 10월 11일, 핼리팩스 대리점\n\n조사관 귀하\n\n앨비언 대서양전신회사 소속 해저케이블 수리선 C.S. 탈라사(THALASSA)호가 10월 3일 이후 교신이 두절되었습니다. 동선은 대서양 중부의 케이블 고장 구간에서 수리 작업 중이었으며, 본 조합이 선체 및 장비 보험을 인수하고 있습니다.\n\n오늘 새벽 구난선 마그누스(MAGNUS)호가 동선을 발견하였다는 무전이 들어왔습니다. 표류 중이며, 갑판에 사람이 보이지 않는다고 합니다.`,
      `귀하께 다음을 요청합니다.\n\n一. 선박과 선원의 상태를 확인하고 사고 원인을 규명할 것.\n二. 선장의 공식 항해일지를 회수할 것.\n三. 조사 결과를 동선의 무선 설비로 마그누스호에 통보할 것.\n\n※ 마그누스호 무선국은 국제 조난·호출 주파수인 500킬로사이클(kc)을 상시 청취합니다. 호출이 곤란할 경우 조난 신호로 대신해도 무방합니다.\n\n— 그레이브센드 해상보험조합 선박부`,
    ],
  },
  logPage: {
    id: 'logPage',
    title: '항해일지 (찢겨 나온 한 장)',
    style: 'log',
    pages: [
      `10월 3일 (토)\n\n03:40  그래플, 해저 2,300길 부근에서 무언가에 걸림. 권양 개시.\n04:10  다이나모미터 장력이 설명할 수 없이 오르내림. 끌어올리는 속도와 무관하게, 마치 저쪽에서 당기는 듯함.\n05:55  케이블 인양 완료. 절단된 끝부분에 검은 덩어리가 엉겨 붙어 있음. 전기기사 베일 씨가 절연 시험을 위해 그대로 선수 탱크에 사리도록 지시.\n06:20  탱크 주수 완료.\n\n(이하 연필로 급히 덧쓴 글씨)\n탱크 안에서 무언가 물을 휘젓는 소리. 당직자 두 명이 들었다고 함.`,
    ],
  },
  diary: {
    id: 'diary',
    title: '선장 아서 헤일의 개인 일기',
    style: 'hand',
    pages: [
      `9월 27일, 핼리팩스.\n마거릿, 당신의 편지를 받았소. 이번 수리만 끝나면 겨울은 함께 보내겠소. 탈라사도 이제 열네 살 — 나보다 이 배를 더 잘 아는 사람은 없을 거요.\n\n금고 번호를 또 잊을까 걱정하던 당신 말이 생각나 적어 두오. 번호는 이 배가 태어난 날로 해 두었소. 사람들은 배가 물에 처음 닿은 날을 생일이라 하지만, 나는 첫 뼈대가 놓인 날이 진짜라고 믿소.\n해, 달, 날 — 세 숫자. 그날의 사진은 사관 식당 앞 복도에 걸려 있소.`,
      `10월 4일.\n선원들이 탱크 옆을 지나가지 않으려 한다. 밤새 탱크 쪽 격벽에서 두드리는 소리가 났다고 한다. 세 번, 쉬고, 세 번.\n\n10월 6일.\n마거릿. 나는 이 배를 잃고 있소.\n그것이 무엇이든, 우리가 바다 밑에서 꺼내 온 것은 돌이 아니오. 돌은 숨을 쉬지 않소.`,
    ],
  },
  captainLog: {
    id: 'captainLog',
    title: 'C.S. 탈라사 공식 항해일지 — 선장 A. 헤일',
    style: 'log',
    pages: [
      `10월 4일  시험실 보고: 인양 케이블 끝은 어디에도 연결되어 있지 않은데 검류계가 규칙적으로 흔들림. 베일 씨는 "모스 부호처럼 보인다"고 함. 웃어넘겼음.\n\n10월 5일  갑판원 오하라, 쿠퍼 탱크 점검 중 실종. 탱크 수면에 기포만 남음. 선수 해치를 사슬로 봉쇄하고 자물쇠를 채움.\n\n10월 6일  기관부 셋이 사라짐. 누군가 보일러 불을 계속 지피고 있음. 기관장 브로디는 "그것들은 불 앞으로는 오지 못한다"고 주장.`,
      `10월 7일  선원 일부가 1번 구명정을 내려 탈출. 제지하지 못했음.\n저녁, 사라졌던 이들을 보았다. 그들은 젖은 채로 걸어 다닌다. 걸음걸이가 사람의 것이 아니다.\n\n10월 8일  남은 인원은 나와 통신사 펠뿐. 탱크로 통하는 수밀문을 닫고, 개폐 핸들을 이 일지와 함께 금고에 넣는다. 누구도 그 문을 열어서는 안 된다.\n\n그 돌이 무엇이든, 바다로 돌려보내서는 안 된다. 그것은 다시 올라올 것이다. 불이다. 불만이 그것을 끝낼 수 있다.\n\n— 불을 꺼뜨리지 마라.`,
    ],
  },
  engineerNotes: {
    id: 'engineerNotes',
    title: '기관장 A. 브로디의 수첩',
    style: 'hand',
    pages: [
      `발전기(다이나모) 기동 요령 — 신참들 볼 것\n\n1. 드레인 밸브를 연다. 배관 속 응축수부터 빼야 한다.\n2. 주증기 밸브를 조금만 연다(4분의 1 바퀴). 관을 천천히 데운다.\n   ※ 드레인을 닫은 채 증기를 넣으면 워터해머 — 배관이 대포처럼 울린다.\n3. 드레인에서 물 대신 마른 증기만 나오면 주증기 밸브를 끝까지 연다.\n4. 드레인 밸브를 닫는다.\n5. 회전계 바늘이 초록 칸에 들어와 안정되면 배전반 주차단기를 넣는다. 서두르면 차단기가 튄다.`,
      `10월 6일\n놈들은 불빛을 싫어한다. 보일러 앞에 있으면 다가오지 못한다. 그래서 나는 불을 지핀다. 석탄이 떨어질 때까지.\n\n발전기는 세워 두었다. 전등이 켜지면 놈들이 몰려드는 것 같다 — 빛 때문인지, 소리 때문인지 모르겠다.\n\n선장님, 그 돌을 화실에 던져 넣어야 합니다. 탱크까지 갈 수만 있다면.`,
    ],
  },
  wirelessLog: {
    id: 'wirelessLog',
    title: '무선 통신 일지 — 통신사 T. 펠',
    style: 'log',
    pages: [
      `10월 3일 06:40  회사 앞 정시 보고 송신. 수신 확인.\n10월 3일 07:15  이상 공전(空電). 수화기에 규칙적인 긁는 소리 — 모든 파장에서.\n10월 4일          회사 호출에 응답 없음. 우리 송신은 나가는데 아무도 듣지 못하는 것 같다.\n10월 6일          주발전기 정지. 송신기는 발전기 전원 없이는 쓸 수 없음.\n10월 7일          비상 축전지로 조난 신호 시도 — 축전지 이미 방전. 누군가 단자를 바닷물에 적셔 놓았다.`,
      `10월 8일\n발전기만 다시 돌면 된다. 조난 파장에 맞추고 SOS만 치면 누군가는 듣는다.\n다이얼은 파장(미터)으로 매겨져 있다 — 명판의 식을 잊지 말 것.\n\n(끝부분이 번져 읽을 수 없다)`,
    ],
  },
  letter: {
    id: 'letter',
    title: '부치지 못한 편지',
    style: 'hand',
    pages: [
      `어머니께.\n\n배에 이상한 일이 생겼어요. 선수 탱크의 물이 저절로 움직여요. 바람도 없는데 물결이 가운데로, 그 원뿔 쪽으로 모여들어요.\n\n밤마다 누가 제 이름을 불러요. 빌리, 빌리, 하고. 목소리가 쿠퍼 아저씨 같은데, 쿠퍼 아저씨는 이틀 전에 없어졌어요.\n\n저는 불 옆에 있을 거예요. 기관장님이 불 옆은 안전하댔어요. 어머니, 저는`,
    ],
  },
  testRecord: {
    id: 'testRecord',
    title: '케이블 시험 기록 — 전기기사 H. 베일',
    style: 'typed',
    pages: [
      `시험실 기록 / 1925. 10. 4\n\n대상: 인양 케이블 (선수 탱크, 절단단 A)\n방법: 미러 검류계를 사용한 저항(브리지) 시험\n\n절연저항: 측정 불가 — 값이 계속 변동.\n도통: 절단단이 어디에도 접속되어 있지 않음에도 검류계 광점이 주기적으로 편향.\n\n편향 기록(장·단):\n· · ·   — — —   · · ·\n· · ·   — — —   · · ·\n\n소견: 해수 유도전류로 보기 어려움. 규칙성이 지나치게 뚜렷함.\n(여백에 연필로) 이건 우리가 치는 신호다. 누가 밑에서 우리 흉내를 낸다.`,
    ],
  },
  // ---- Act 2
  bosunNotes: {
    id: 'bosunNotes',
    title: '갑판장 J. 도노번의 수첩',
    style: 'hand',
    pages: [
      `10월 6일 저녁\n선수 흘수표가 어제보다 한 뼘 더 잠겼다. 배는 멈춰 있는데 선수만 자꾸 숙인다. 쉬브 위의 케이블 두 가닥이 맥박처럼 떤다.\n\n선장은 케이블을 놓지 않겠다고 한다. 회사 재산이라나. 권양기 브레이크마다 고정핀을 박고 자물쇠를 채웠다. 열쇠는 자기 목에.`,
      `10월 7일\n오늘 밤 1번 구명정을 내린다. 맥컬리, 리드, 해리스, 그리고 나. 펠은 무선을 지키겠다고 남는다. 고집쟁이.\n\n펠에게 일러두었다. 거주구 승강구는 안에서 빗장을 걸 것. 돌아오는 놈이 있으면 — 그게 우리라도 — 열어 주지 마라.\n\n둘이서 신호를 정했다. 진짜 사람은 두드림을 따라 하지 않는다. 대답을 한다.`,
    ],
  },
  testManual: {
    id: 'testManual',
    title: '고장점 측정 요령 — 휘트스톤 브리지 · 미러 검류계',
    style: 'typed',
    pages: [
      `전기기사 H. 베일\n\n1. 단자반에서 시험할 케이블 끝을 고른다.  B — 좌현 쉬브,  C — 우현 쉬브.\n2. 비율 팔을 고른다. 다이얼 네 자리를 다 쓰도록, 값이 넘치지 않는 가장 작은 비율로.\n   수십 Ω 이하는 10 : 1000 (×0.01), 수천 Ω은 1000 : 1000 (×1).\n3. 검류계에 분류기 1/999를 끼우고 다이얼로 광점을 대강 영점에 모은다. 1/99, 1/9로 갈아 끼우며 좁혀 간다.\n4. 분류기를 빼고(최대 감도) 마지막 자리까지 맞춘다. 광점이 영점에서 움직이지 않으면 균형이다.\n   다이얼 값 × 비율 = 측정 저항.\n   (고장점이 움직이는 것 같으면 시간을 두고 다시 잰다.)`,
      `5. 완전 단선 — 끊어진 심선이 그 자리에서 바닷물에 닿아 있을 때:\n   고장점까지의 거리(해리) = 측정 저항 ÷ 해리당 도체 저항\n\n   본선 케이블 심선(구리 300파운드/해리):\n   해리당 4.27 Ω (24 °C) — 해저 수온 약 3 °C에서는 약 3.9 Ω\n\n   ※ 끊어진 구리 끝이 제 저항을 보태므로, 실제 고장점은 계산보다 조금 가깝다.\n6. 끝이 육지국까지 건전하게 이어져 있으면, 끝에서 접지된 육지국 계기까지의 저항이 나온다.`,
    ],
  },
  baleNote: {
    id: 'baleNote',
    title: '베일의 측정 기록',
    style: 'hand',
    pages: [
      `10월 6일  03:10  고장점 2.9해리\n           07:40  2.6해리\n           12:15  2.2해리\n\n고장점은 움직이지 않는다. 고장점은 움직이지 않는다. 고장점은 움직이지 않는다.\n\n10월 7일  2.2해리. 멈췄다. 돌을 탱크에 사려 둔 뒤로 멈췄다. 기다리는 것이다. 돌을. 손가락을 돌려받기를.\n\n(아래, 떨리는 글씨)\n그 돌이 불 속에서 죽으면, 그것이 올라온다. 케이블을 한 칸씩, 한 칸씩.`,
    ],
  },
  pumpPlan: {
    id: 'pumpPlan',
    title: '빌지·밸러스트 밸브 상자 — C.S. 탈라사 기관실',
    style: 'plate',
    pages: [
      `흡입측 (열면 그 구획에서 빤다)\n  ① 해수 흡입 (씨 체스트)\n  ② 1번 탱크 흡입\n  ③ 2번 탱크 흡입\n  ④ 기관실 빌지 흡입\n\n배출측 (열면 그리로 보낸다)\n  ⑤ 선외 배출\n  ⑥ 2번 탱크 주수\n\n잡용 펌프: 증기 복동식.  흡입측 → 펌프 → 배출측\n\n※ 빌지 흡입관에는 나사 내림식 역지 밸브가 있다.\n  탱크 흡입·주수관은 물을 넣고 빼야 하므로 역지 밸브가 없다.\n※ 케이블 탱크는 흘수선 아래에 있다. 해수 흡입과 탱크 쪽 밸브를\n  함께 열어 두면, 펌프가 서 있어도 바닷물이 탱크로 흘러든다.`,
    ],
  },
  haleLetter: {
    id: 'haleLetter',
    title: '선장 아서 헤일의 마지막 편지',
    style: 'hand',
    pages: [
      `마거릿.\n\n탱크의 물을 빼고 사리를 끊을 생각이었소. 톱이 들지 않소. 강철 외장선이 산 것처럼 톱날을 무는구려.\n\n누군가 기관실 밸브를 열었소. 물이 다시 차오르고 있소. 위로 올라갈 수 없을 것 같소.\n\n펠에게 열쇠를 맡겼어야 했소. 회사 재산 따위. 이 배를 바다 밑에 묶어 둔 건 그것이 아니라 내 고집이었소.\n\n누구든 이 편지를 읽는 사람에게. 불을 꺼뜨리지 마시오. 그리고 케이블을 놓으시오.\n\n— A. H.`,
    ],
  },
  morse: {
    id: 'morse',
    title: '국제 모스 부호표 (무선실 벽)',
    style: 'plate',
    pages: [
      `A ·−      B −···    C −·−·    D −··\nE ·       F ··−·    G −−·     H ····\nI ··      J ·−−−    K −·−     L ·−··\nM −−      N −·      O −−−     P ·−−·\nQ −−·−    R ·−·     S ···     T −\nU ··−     V ···−    W ·−−     X −··−\nY −·−−    Z −−··\n\n조난 신호  SOS  · · ·  − − −  · · ·\n(1906년 베를린 국제무선전신협약에서 채택)`,
    ],
  },
};

/** Health bands (the original showed a life gauge; the later genre used Fine / Caution / Danger). */
export function condition(hp: number, max: number): { label: string; tone: 'fine' | 'caution' | 'danger' } {
  const r = hp / max;
  if (r > 0.66) return { label: '양호', tone: 'fine' };
  if (r > 0.34) return { label: '부상', tone: 'caution' };
  return { label: '위독', tone: 'danger' };
}
