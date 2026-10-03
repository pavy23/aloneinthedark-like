import type { Game } from '../game/Game';
import { DOCS } from '../game/content';
import { FocusNav } from './UI';
import { button, h } from './dom';

export function openDoc(g: Game, id: string): Promise<void> {
  const doc = DOCS[id];
  if (!doc) return Promise.resolve();
  return new Promise((resolve) => {
    let page = 0;
    const body = h('div', { class: 'body' });
    const count = h('span');
    const prev = button('◂ 앞장', () => turn(-1));
    const next = button('뒷장 ▸', () => turn(1));
    const close = button('닫기', () => g.ui.pop(modal));
    const pager = h('div', { class: 'pager' }, prev, count, h('div', { class: 'row' }, next, close));
    // (Prefixed: a bare style name such as 'log' would pick up the puzzle panels' dark .log box.)
    const paper = h('article', { class: `doc doc-${doc.style}`, role: 'document' }, h('h3', { text: doc.title }), body, pager);
    const wrap = h('div', { class: 'modal' }, paper);
    const nav = new FocusNav(pager, g.audio);
    const render = () => {
      body.textContent = doc.pages[page];
      count.textContent = `${page + 1} / ${doc.pages.length}`;
      prev.disabled = page === 0;
      next.disabled = page === doc.pages.length - 1;
      nav.refresh();
      const target = next.disabled ? close : next;
      nav.focus(target);
      paper.scrollTop = 0;
    };
    const turn = (d: number) => {
      const np = Math.max(0, Math.min(doc.pages.length - 1, page + d));
      if (np !== page) {
        page = np;
        g.audio.sfx('doc');
        render();
      }
    };
    const modal = g.ui.push({
      el: wrap,
      nav,
      update: (_dt, input) => {
        if (input.justPressed('left')) {
          input.consume('left');
          turn(-1);
        } else if (input.justPressed('right')) {
          input.consume('right');
          turn(1);
        } else nav.update(input);
      },
      onClose: () => resolve(),
    });
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) g.ui.pop(modal);
    });
    render();
  });
}
