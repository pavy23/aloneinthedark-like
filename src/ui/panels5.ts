import type { Game } from '../game/Game';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';
import { DOCS } from '../game/content';
import { DOSSIER_GROUPS, PELL_WITNESS, POINTS } from '../game/logic5';
import { HEARINGS, exhibits } from '../game/epilogue';

// ------------------------------------------------------------------ The dossier at the witness stand

/** Which shelf of the dossier a record sits on. */
function groupOf(id: string): string {
  if (id === PELL_WITNESS) return '증인';
  const gr = DOSSIER_GROUPS.find((x) => x.docs.includes(id));
  return gr ? gr.title : DOSSIER_GROUPS[DOSSIER_GROUPS.length - 1].title;
}

/**
 * The point in hand, and the dossier to answer it from. Choosing an exhibit (or none) closes the panel and
 * leaves the choice in 'ep.pick' (an index into the dossier, -1 for no exhibit; -2 if simply closed).
 */
export function openInquiryPanel(g: Game): Promise<void> {
  return new Promise((resolve) => {
    const q = Math.min(POINTS.length - 1, g.num('ep.q'));
    const hearing = HEARINGS[POINTS[q]];
    const list = exhibits(g);
    let sel = -1;
    const preview = h('div', { class: 'log dossier-preview', text: '서류철에서 증거로 낼 기록을 고른다. 고른 기록은 읽어 볼 수도 있다.' });
    const present = () => {
      if (sel < 0) return;
      g.setFlag('ep.pick', sel);
      g.audio.sfx('doc');
      g.ui.pop(modal);
    };
    const read = () => {
      if (sel < 0) return;
      void g.readDoc(list[sel]).then(() => paint());
    };
    const presentBtn = button('이 기록을 낸다', present) as HTMLButtonElement;
    const readBtn = button('읽어 보기', read) as HTMLButtonElement;
    const rows: HTMLButtonElement[] = [];
    const paint = () => {
      rows.forEach((r, i) => {
        r.classList.toggle('on', i === sel);
        const id = list[i];
        const seen = id === PELL_WITNESS || g.state.docs.includes(id);
        r.querySelector('.read')!.textContent = seen ? '읽음' : '';
      });
      presentBtn.disabled = sel < 0;
      readBtn.disabled = sel < 0;
      if (sel >= 0) {
        const doc = DOCS[list[sel]];
        const first = (doc?.pages[0] ?? '').replace(/\s+/g, ' ').trim();
        preview.textContent = `${doc?.title ?? list[sel]}\n${first.length > 150 ? `${first.slice(0, 150)}…` : first}`;
      }
      nav.refresh();
    };
    const listEl = h('div', { class: 'dossier-list' });
    let lastGroup = '';
    list.forEach((id, i) => {
      const grp = groupOf(id);
      if (grp !== lastGroup) {
        listEl.append(h('div', { class: 'grp', text: grp }));
        lastGroup = grp;
      }
      const r = button('', () => {
        sel = i;
        g.audio.sfx('ui-move');
        paint();
      }) as HTMLButtonElement;
      r.append(h('span', { text: DOCS[id]?.title ?? id }), h('span', { class: 'read' }));
      rows.push(r);
      listEl.append(r);
    });
    const panel = h(
      'div',
      { class: 'panel inquiry' },
      h('div', { class: 'eyebrow', text: `THE INQUIRY · 쟁점 ${q + 1} / ${POINTS.length}` }),
      h('h2', { text: hearing.title }),
      h('p', { class: 'inquiry-q', text: hearing.question }),
      h('p', { class: 'muted', text: '↑↓ 고르기 · Space 누르기 · F 읽어 보기 · Tab 이 기록을 낸다 · Esc 물러나기' }),
      listEl,
      preview,
      h('div', { class: 'row' }, presentBtn, readBtn, button('증거 없이 답한다', () => {
        g.setFlag('ep.pick', -1);
        g.ui.pop(modal);
      }), button('물러나기', () => g.ui.pop(modal))),
    );
    const wrap = h('div', { class: 'modal clear dock' }, panel);
    const nav = new FocusNav(panel, g.audio);
    const modal: Modal = g.ui.push({
      el: wrap,
      live: true,
      nav,
      update: (_dt, input) => {
        if (input.justPressed('attack')) {
          input.consume('attack');
          read();
          return;
        }
        if (input.justPressed('inventory')) {
          input.consume('inventory');
          present();
          return;
        }
        nav.update(input);
      },
      onClose: () => resolve(),
    });
    paint();
  });
}
