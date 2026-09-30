import type { Input } from '../core/Input';
import type { AudioSystem } from '../audio/Audio';
import { button, h } from './dom';

export interface Modal {
  el: HTMLElement;
  update?(dt: number, input: Input): void;
  onClose?(): void;
  /** Keep the game world simulating underneath (animated puzzle panels). */
  live?: boolean;
  /** Cancel / menu key closes it. Default true. */
  cancelable?: boolean;
  nav?: FocusNav;
}

/** Keyboard / gamepad focus navigation over the [data-nav] buttons of a container. */
export class FocusNav {
  items: HTMLElement[] = [];
  index = 0;
  constructor(
    private container: HTMLElement,
    private audio: AudioSystem | null,
    private opts: { onCancel?: () => void; grid?: boolean } = {},
  ) {
    this.refresh();
    container.addEventListener('mouseover', (e) => {
      const t = (e.target as HTMLElement).closest('[data-nav]') as HTMLElement | null;
      if (!t) return;
      const i = this.items.indexOf(t);
      if (i >= 0 && i !== this.index) {
        this.index = i;
        this.paint();
      }
    });
  }

  refresh(keepIndex = true): void {
    const prev = this.items[this.index];
    this.items = Array.from(this.container.querySelectorAll<HTMLElement>('[data-nav]')).filter((b) => !(b as HTMLButtonElement).disabled && b.offsetParent !== null);
    const i = keepIndex && prev ? this.items.indexOf(prev) : -1;
    this.index = i >= 0 ? i : Math.min(this.index, Math.max(0, this.items.length - 1));
    this.paint();
  }

  focus(el: HTMLElement): void {
    const i = this.items.indexOf(el);
    if (i >= 0) {
      this.index = i;
      this.paint();
    }
  }

  private paint(): void {
    this.items.forEach((b, i) => b.classList.toggle('focus', i === this.index));
    const cur = this.items[this.index];
    if (cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' });
  }

  private move(d: number): void {
    if (this.items.length === 0) return;
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.audio?.sfx('ui-move');
    this.paint();
  }

  update(input: Input): void {
    if (input.justPressed('up') || (this.opts.grid && input.justPressed('left'))) {
      input.consume('up');
      this.move(-1);
    }
    if (input.justPressed('down') || (this.opts.grid && input.justPressed('right'))) {
      input.consume('down');
      this.move(1);
    }
    if (input.justPressed('action')) {
      input.consume('action');
      const cur = this.items[this.index];
      if (cur) cur.click();
    }
    if (this.opts.onCancel && (input.justPressed('cancel') || input.justPressed('menu') || input.justPressed('inventory'))) {
      input.consume('cancel');
      input.consume('menu');
      input.consume('inventory');
      this.opts.onCancel();
    }
  }
}

export class UI {
  readonly hud: HTMLElement;
  readonly modalLayer: HTMLElement;
  private captionEl: HTMLElement;
  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private msgEl: HTMLElement;
  private msgText: HTMLElement;
  private msgMore: HTMLElement;
  private msgChoices: HTMLElement;
  private stack: Modal[] = [];
  private msgQueue: string[] = [];
  private msgResolve: (() => void) | null = null;
  private typing = { full: '', shown: 0, done: true };
  private choiceNav: FocusNav | null = null;
  private choiceResolve: ((i: number) => void) | null = null;
  private toastTimer = 0;
  private captionTimer = 0;
  textSpeed = 42;

  constructor(
    hud: HTMLElement,
    modalLayer: HTMLElement,
    private audio: AudioSystem,
  ) {
    this.hud = hud;
    this.modalLayer = modalLayer;
    this.captionEl = h('div', { class: 'caption' });
    this.hintEl = h('div', { class: 'hint' });
    this.toastEl = h('div', { class: 'toast' });
    this.msgText = h('div', { class: 'text' });
    this.msgMore = h('div', { class: 'more', text: '▼' });
    this.msgChoices = h('div', { class: 'choices' });
    this.msgEl = h('div', { class: 'msg', hidden: true, role: 'dialog', 'aria-live': 'polite' }, this.msgText, this.msgChoices, this.msgMore);
    this.msgEl.addEventListener('click', () => {
      if (!this.choiceResolve) this.advance();
    });
    hud.append(this.captionEl, this.hintEl, this.toastEl, this.msgEl);
  }

  /** True while anything that should pause the game world is open. */
  get blocking(): boolean {
    if (!this.msgEl.hidden) return true;
    return this.stack.some((m) => !m.live);
  }

  get anyOpen(): boolean {
    return !this.msgEl.hidden || this.stack.length > 0;
  }

  get top(): Modal | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(m: Modal): Modal {
    this.modalLayer.append(m.el);
    this.stack.push(m);
    m.nav?.refresh(false);
    return m;
  }

  pop(m?: Modal): void {
    const target = m ?? this.top;
    if (!target) return;
    const i = this.stack.indexOf(target);
    if (i < 0) return;
    this.stack.splice(i, 1);
    target.el.remove();
    target.onClose?.();
  }

  closeAll(): void {
    while (this.stack.length) this.pop();
    this.clearMessages();
  }

  /** Drop any queued dialogue (resolving waiting scripts) — used when loading or leaving to the title. */
  clearMessages(): void {
    this.msgQueue = [];
    if (this.choiceResolve) this.finishChoice(-1);
    if (!this.msgEl.hidden || this.msgResolve) {
      this.msgEl.hidden = true;
      const r = this.msgResolve;
      this.msgResolve = null;
      r?.();
    }
  }

  // ---------- Message box ----------

  say(lines: string[]): Promise<void> {
    return new Promise((resolve) => {
      this.msgQueue.push(...lines.filter((l) => l.length > 0));
      const prev = this.msgResolve;
      this.msgResolve = () => {
        prev?.();
        resolve();
      };
      if (this.msgEl.hidden) this.nextLine();
    });
  }

  private nextLine(): void {
    const line = this.msgQueue.shift();
    if (line === undefined) {
      this.msgEl.hidden = true;
      const r = this.msgResolve;
      this.msgResolve = null;
      r?.();
      return;
    }
    this.msgEl.hidden = false;
    this.msgChoices.replaceChildren();
    this.typing = { full: line, shown: 0, done: false };
    this.msgText.textContent = '';
    this.msgMore.hidden = true;
  }

  private advance(): void {
    if (this.msgEl.hidden) return;
    if (!this.typing.done) {
      this.typing.shown = this.typing.full.length;
      return;
    }
    this.audio.sfx('ui-move');
    this.nextLine();
  }

  ask(text: string, options: Array<{ label: string; disabled?: boolean }>): Promise<number> {
    return new Promise((resolve) => {
      this.msgEl.hidden = false;
      this.typing = { full: text, shown: text.length, done: true };
      this.msgText.textContent = text;
      this.msgMore.hidden = true;
      this.msgChoices.replaceChildren(
        ...options.map((o, i) =>
          button(
            o.label,
            () => {
              this.audio.sfx('ui-ok');
              this.finishChoice(i);
            },
            { disabled: o.disabled },
          ),
        ),
      );
      this.choiceResolve = resolve;
      this.choiceNav = new FocusNav(this.msgChoices, this.audio, { grid: true, onCancel: () => this.finishChoice(options.length - 1) });
    });
  }

  private finishChoice(i: number): void {
    const r = this.choiceResolve;
    this.choiceResolve = null;
    this.choiceNav = null;
    this.msgChoices.replaceChildren();
    this.msgEl.hidden = true;
    r?.(i);
  }

  // ---------- Small HUD elements ----------

  note(text: string, seconds = 2.6): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  caption(name: string, sub: string): void {
    this.captionEl.replaceChildren(document.createTextNode(name), h('small', { text: sub }));
    this.captionEl.classList.add('show');
    this.captionTimer = 2.8;
  }

  hint(label: string | null, verb = '조사'): void {
    if (!label) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.replaceChildren(h('b', { text: verb }), document.createTextNode(label));
    this.hintEl.classList.add('show');
  }

  update(dt: number, input: Input): void {
    // Typewriter
    if (!this.msgEl.hidden && !this.typing.done) {
      this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + dt * this.textSpeed);
      this.msgText.textContent = this.typing.full.slice(0, Math.floor(this.typing.shown));
      if (this.typing.shown >= this.typing.full.length) {
        this.typing.done = true;
        this.msgText.textContent = this.typing.full;
        this.msgMore.hidden = false;
      }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.captionTimer > 0) {
      this.captionTimer -= dt;
      if (this.captionTimer <= 0) this.captionEl.classList.remove('show');
    }
    // Input routing: choice > message > top modal.
    if (this.choiceNav) {
      this.choiceNav.update(input);
      input.consumeAll();
      return;
    }
    if (!this.msgEl.hidden) {
      if (input.justPressed('action') || input.justPressed('cancel')) {
        input.consumeAll();
        this.advance();
      }
      input.consumeAll();
      return;
    }
    const top = this.top;
    if (top) {
      if (top.update) top.update(dt, input);
      else if (top.nav) top.nav.update(input);
      if (top.cancelable !== false && this.top === top && (input.justPressed('cancel') || input.justPressed('menu'))) {
        this.audio.sfx('ui-back');
        this.pop(top);
      }
      input.consumeAll();
    }
  }

  setBaseSize(px: number): void {
    this.hud.style.setProperty('--fs', `${px}px`);
  }
}
