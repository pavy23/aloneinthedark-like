// Unified input: keyboard, gamepad and on-screen touch controls all feed the same virtual buttons.

export type Btn = 'up' | 'down' | 'left' | 'right' | 'run' | 'action' | 'attack' | 'inventory' | 'menu' | 'cancel';

const KEYMAP: Record<string, Btn[]> = {
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ShiftLeft: ['run'],
  ShiftRight: ['run'],
  Space: ['action'],
  KeyE: ['action'],
  Enter: ['action'],
  NumpadEnter: ['action'],
  KeyF: ['attack'],
  KeyJ: ['attack'],
  ControlLeft: ['attack'],
  KeyI: ['inventory'],
  Tab: ['inventory'],
  Escape: ['menu', 'cancel'],
  KeyP: ['menu'],
  Backspace: ['cancel'],
  KeyX: ['cancel'],
};

const ALL: Btn[] = ['up', 'down', 'left', 'right', 'run', 'action', 'attack', 'inventory', 'menu', 'cancel'];

export class Input {
  private keys = new Set<Btn>();
  private touch = new Set<Btn>();
  private pad = new Set<Btn>();
  private now = new Set<Btn>();
  private prev = new Set<Btn>();
  private consumed = new Set<Btn>();
  /** Presses that happened since the last frame (so a tap shorter than one frame still registers). */
  private tapped = new Set<Btn>();
  /** Last physical key pressed (for text-like panels). */
  lastKey: string | null = null;
  /** Timestamps of the last "up" presses, for the original's double-tap-to-run. */
  private upTapTimes: number[] = [];
  doubleTapRun = false;
  usingTouch = false;
  usingPad = false;
  private keyCounts = new Map<string, Btn[]>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      const btns = KEYMAP[e.code];
      if (btns) {
        // Stop the page scrolling / tabbing away while playing.
        if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Tab' || e.code === 'Backspace') {
          const tag = (e.target as HTMLElement | null)?.tagName;
          if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
        }
        if (!e.repeat) {
          this.keyCounts.set(e.code, btns);
          for (const b of btns) {
            this.keys.add(b);
            this.tapped.add(b);
          }
          this.lastKey = e.code;
        }
      }
      this.usingTouch = false;
    });
    target.addEventListener('keyup', (e) => {
      const btns = KEYMAP[e.code];
      if (!btns) return;
      this.keyCounts.delete(e.code);
      // Only release a button when no other held key maps to it.
      for (const b of btns) {
        let still = false;
        for (const other of this.keyCounts.values()) if (other.includes(b)) still = true;
        if (!still) this.keys.delete(b);
      }
    });
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.keyCounts.clear();
      this.touch.clear();
    });
  }

  setTouch(b: Btn, down: boolean): void {
    this.usingTouch = true;
    if (down) {
      this.touch.add(b);
      this.tapped.add(b);
    } else this.touch.delete(b);
  }

  clearTouch(): void {
    this.touch.clear();
  }

  private pollPad(): void {
    this.pad.clear();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (b(12) || ay < -0.45) this.pad.add('up');
      if (b(13) || ay > 0.45) this.pad.add('down');
      if (b(14) || ax < -0.45) this.pad.add('left');
      if (b(15) || ax > 0.45) this.pad.add('right');
      if (b(0)) this.pad.add('action');
      if (b(1)) {
        this.pad.add('run');
        this.pad.add('cancel');
      }
      if (b(2) || b(7)) this.pad.add('attack');
      if (b(3)) this.pad.add('inventory');
      if (b(9)) this.pad.add('menu');
      if (this.pad.size > 0) this.usingPad = true;
    }
  }

  /** Call once at the start of every frame. */
  beginFrame(timeSec: number): void {
    this.pollPad();
    this.prev = this.now;
    this.now = new Set<Btn>();
    for (const b of ALL) if (this.keys.has(b) || this.touch.has(b) || this.pad.has(b) || this.tapped.has(b)) this.now.add(b);
    this.tapped.clear();
    this.consumed.clear();
    if (this.justPressed('up')) {
      this.upTapTimes.push(timeSec);
      if (this.upTapTimes.length > 2) this.upTapTimes.shift();
      if (this.upTapTimes.length === 2 && this.upTapTimes[1] - this.upTapTimes[0] < 0.32) this.doubleTapRun = true;
    }
    if (!this.now.has('up')) this.doubleTapRun = false;
  }

  isDown(b: Btn): boolean {
    return this.now.has(b);
  }

  justPressed(b: Btn): boolean {
    return this.now.has(b) && !this.prev.has(b) && !this.consumed.has(b);
  }

  /** Mark a press as handled so nothing else reacts to it this frame. */
  consume(b: Btn): void {
    this.consumed.add(b);
  }

  consumeAll(): void {
    for (const b of ALL) this.consumed.add(b);
  }

  running(): boolean {
    return this.isDown('run') || this.doubleTapRun;
  }
}
