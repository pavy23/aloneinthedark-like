import type { Btn, Input } from '../core/Input';
import { h } from './dom';

/** On-screen stick + buttons for phones and tablets. Maps onto the same virtual buttons as the keyboard. */
export class TouchControls {
  visible = false;
  private mode: 'auto' | 'on' | 'off' = 'auto';
  private seenTouch = false;
  private pad: HTMLElement;
  private knob: HTMLElement;
  private buttons: Record<string, HTMLElement> = {};
  private padId: number | null = null;
  private runFromStick = false;

  constructor(
    private el: HTMLElement,
    private input: Input,
    private onChange: () => void,
  ) {
    this.knob = h('div', { class: 'knob' });
    this.pad = h('div', { class: 'pad', 'aria-label': '이동 스틱' }, h('div', { class: 'base' }), this.knob);
    el.append(this.pad);
    const mk = (key: string, label: string, btn: Btn, cls = '') => {
      const b = h('div', { class: `tbtn ${cls}`, role: 'button', 'aria-label': label, text: label });
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('down');
        this.input.setTouch(btn, true);
      });
      const up = (e: PointerEvent) => {
        e.preventDefault();
        b.classList.remove('down');
        this.input.setTouch(btn, false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      el.append(b);
      this.buttons[key] = b;
    };
    mk('action', '조사', 'action');
    mk('attack', '공격', 'attack');
    mk('run', '달리기', 'run');
    mk('inv', '소지품', 'inventory', 'small');
    mk('menu', '메뉴', 'menu', 'small');
    mk('cam', '시점', 'camera', 'small');

    this.pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.padId = e.pointerId;
      this.pad.setPointerCapture(e.pointerId);
      this.stick(e);
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.padId) this.stick(e);
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.padId) return;
      this.padId = null;
      this.knob.style.transform = '';
      this.input.setStick(0, 0, false);
      for (const b of ['up', 'down', 'left', 'right'] as Btn[]) this.input.setTouch(b, false);
      if (this.runFromStick) this.input.setTouch('run', false);
      this.runFromStick = false;
    };
    this.pad.addEventListener('pointerup', release);
    this.pad.addEventListener('pointercancel', release);

    window.addEventListener(
      'touchstart',
      () => {
        if (!this.seenTouch) {
          this.seenTouch = true;
          this.refresh();
        }
      },
      { passive: true },
    );
    this.el.hidden = true;
  }

  private stick(e: PointerEvent): void {
    const r = this.pad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    this.knob.style.transform = `translate(${dx * 42}px, ${dy * 42}px)`;
    // Analog vector for screen-relative movement (screen up = into the scene)...
    this.input.setStick(dx, -dy, true);
    // ...and digital directions for tank controls and menu navigation.
    this.input.setTouch('up', dy < -0.35);
    this.input.setTouch('down', dy > 0.45);
    this.input.setTouch('left', dx < -0.4);
    this.input.setTouch('right', dx > 0.4);
    const run = Math.hypot(dx, dy) > 0.95;
    if (run !== this.runFromStick) {
      this.runFromStick = run;
      this.input.setTouch('run', run);
    }
  }

  /** The "put the camera behind me" button only means something with the follow camera. */
  showCameraButton(on: boolean): void {
    this.buttons.cam.style.display = on ? '' : 'none';
  }

  /** Hide the controls temporarily (title screen, cutscenes) without changing the layout. */
  suppress(on: boolean): void {
    this.el.classList.toggle('suppressed', on);
  }

  setMode(m: 'auto' | 'on' | 'off'): void {
    this.mode = m;
    this.refresh();
  }

  private refresh(): void {
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const v = this.mode === 'on' || (this.mode === 'auto' && (coarse || this.seenTouch));
    if (v !== this.visible) {
      this.visible = v;
      this.el.hidden = !v;
      if (!v) this.input.clearTouch();
      this.onChange();
    }
  }

  layout(W: number, H: number, frame: { left: number; top: number; width: number; height: number }): void {
    if (!this.visible) return;
    const place = (el: HTMLElement, x: number, y: number) => {
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    };
    const padSize = 150;
    const portrait = H > W;
    const inset = 16;
    const bottom = H - inset;
    if (portrait) {
      const areaTop = frame.top + frame.height;
      const midY = Math.max(areaTop + padSize / 2 + 20, Math.min(bottom - padSize / 2 - 10, areaTop + (bottom - areaTop) * 0.55));
      place(this.pad, inset + 8, midY - padSize / 2);
      place(this.buttons.action, W - inset - 64 - 8, midY - 70);
      place(this.buttons.attack, W - inset - 64 - 86, midY - 10);
      place(this.buttons.run, W - inset - 64 - 8, midY + 40);
      place(this.buttons.inv, W - inset - 48 - 60, areaTop + 14);
      place(this.buttons.menu, W - inset - 48, areaTop + 14);
      place(this.buttons.cam, W - inset - 48 - 120, areaTop + 14);
    } else {
      place(this.pad, inset + 8, bottom - padSize - 8);
      place(this.buttons.action, W - inset - 64 - 8, bottom - 64 - 86);
      place(this.buttons.attack, W - inset - 64 - 86, bottom - 64 - 16);
      place(this.buttons.run, W - inset - 64 - 8, bottom - 64 - 8 + 4);
      place(this.buttons.inv, W - inset - 48 - 60, inset);
      place(this.buttons.menu, W - inset - 48, inset);
      place(this.buttons.cam, W - inset - 48 - 120, inset);
    }
  }
}
