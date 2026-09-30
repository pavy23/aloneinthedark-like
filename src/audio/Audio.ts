// Fully procedural sound: every effect and ambience is synthesised with the Web Audio API at run time,
// so the game ships without a single audio file.

import type { AmbienceId } from '../world/types';

type Bed = { nodes: AudioNode[]; stop: () => void; gain: GainNode; timers: number[] };

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private verbIn!: GainNode;
  private noise!: AudioBuffer;
  private bed: Bed | null = null;
  private bedId: AmbienceId | 'title' | null = null;
  /** Ambience requested before the first user gesture unlocked audio. */
  private pendingBed: AmbienceId | 'title' | null = null;
  private dangerBed: Bed | null = null;
  private dynamoBed: Bed | null = null;
  private heartbeatT = 0;
  volume = 0.8;
  musicVolume = 0.7;
  enabled = true;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(c.destination);
      this.sfxBus = c.createGain();
      this.ambBus = c.createGain();
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.sfxBus.connect(this.master);
      this.ambBus.connect(this.master);
      this.musicBus.connect(this.master);
      // Metallic hull reverb from a generated impulse response.
      const verb = c.createConvolver();
      verb.buffer = this.impulse(2.6, 2.2);
      this.verbIn = c.createGain();
      this.verbIn.gain.value = 0.35;
      const verbOut = c.createGain();
      verbOut.gain.value = 0.9;
      this.verbIn.connect(verb);
      verb.connect(verbOut);
      verbOut.connect(this.master);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.pendingBed) {
      const id = this.pendingBed;
      this.pendingBed = null;
      this.setAmbience(id);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Sparse early reflections + dense tail: sounds like a steel compartment.
        const early = i < c.sampleRate * 0.08 && Math.random() < 0.02 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * 0.6 + early) * Math.pow(1 - t, decay);
      }
    }
    return b;
  }

  private noiseSrc(loop = true): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  private out(node: AudioNode, wet = 0.4, bus: GainNode = this.sfxBus): void {
    node.connect(bus);
    if (wet > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = wet;
      node.connect(g);
      g.connect(this.verbIn);
    }
  }

  private env(g: GainNode, t0: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  /** Short filtered noise burst. */
  private burst(t0: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, wet = 0.3, attack = 0.004): void {
    const c = this.ctx!;
    const s = this.noiseSrc(false);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t0, attack, peak, dur);
    s.connect(f);
    f.connect(g);
    this.out(g, wet);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + attack + dur + 0.05);
  }

  private tone(t0: number, freq: number, dur: number, type: OscillatorType, peak: number, wet = 0.3, freqEnd?: number, attack = 0.005, bus?: GainNode): OscillatorNode {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = c.createGain();
    this.env(g, t0, attack, peak, dur);
    o.connect(g);
    this.out(g, wet, bus ?? this.sfxBus);
    o.start(t0);
    o.stop(t0 + attack + dur + 0.05);
    return o;
  }

  sfx(name: string, opts: { volume?: number } = {}): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + 0.005;
    const v = opts.volume ?? 1;
    switch (name) {
      case 'step-metal':
        this.burst(t, 0.07, 'bandpass', 1400 + Math.random() * 500, 3, 0.12 * v, 0.35);
        this.tone(t, 180 + Math.random() * 40, 0.08, 'triangle', 0.05 * v, 0.3);
        break;
      case 'step-wood':
        this.burst(t, 0.08, 'lowpass', 700 + Math.random() * 200, 1, 0.16 * v, 0.2);
        break;
      case 'step-grate':
        this.burst(t, 0.05, 'bandpass', 2600, 4, 0.1 * v, 0.4);
        this.burst(t + 0.03, 0.04, 'bandpass', 3100, 5, 0.06 * v, 0.4);
        break;
      case 'step-lino':
        this.burst(t, 0.06, 'lowpass', 900, 1, 0.12 * v, 0.2);
        break;
      case 'creature-step':
        this.burst(t, 0.14, 'lowpass', 380, 1.5, 0.3 * v, 0.3);
        this.burst(t + 0.02, 0.1, 'bandpass', 1800, 2, 0.05 * v, 0.2);
        break;
      case 'door': {
        const c = this.ctx;
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, t);
        for (let i = 0; i < 12; i++) o.frequency.linearRampToValueAtTime(80 + Math.random() * 90, t + 0.05 + i * 0.06);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 6;
        const g = c.createGain();
        this.env(g, t, 0.05, 0.12 * v, 0.7);
        o.connect(f);
        f.connect(g);
        this.out(g, 0.5);
        o.start(t);
        o.stop(t + 0.85);
        this.burst(t + 0.75, 0.25, 'lowpass', 300, 1, 0.5 * v, 0.6);
        this.tone(t + 0.75, 110, 0.4, 'triangle', 0.12 * v, 0.6, 90);
        break;
      }
      case 'hatch':
        this.burst(t, 0.4, 'lowpass', 250, 1, 0.5 * v, 0.6);
        this.tone(t, 70, 0.6, 'sine', 0.25 * v, 0.6, 50);
        break;
      case 'ladder':
        for (let i = 0; i < 4; i++) {
          this.burst(t + i * 0.18, 0.06, 'bandpass', 1800, 6, 0.1 * v, 0.5);
          this.tone(t + i * 0.18, 620 + i * 30, 0.12, 'triangle', 0.03 * v, 0.5);
        }
        break;
      case 'pickup':
        this.tone(t, 660, 0.25, 'sine', 0.08 * v, 0.5);
        this.tone(t + 0.08, 990, 0.35, 'sine', 0.06 * v, 0.5);
        break;
      case 'doc':
        this.burst(t, 0.18, 'highpass', 3000, 0.7, 0.07 * v, 0.1, 0.02);
        this.burst(t + 0.12, 0.12, 'highpass', 4000, 0.7, 0.05 * v, 0.1, 0.02);
        break;
      case 'ui-move':
        this.tone(t, 420, 0.04, 'square', 0.02 * v, 0);
        break;
      case 'ui-ok':
        this.tone(t, 520, 0.06, 'square', 0.03 * v, 0);
        this.tone(t + 0.05, 780, 0.08, 'square', 0.025 * v, 0);
        break;
      case 'ui-back':
        this.tone(t, 380, 0.07, 'square', 0.025 * v, 0, 260);
        break;
      case 'error':
      case 'locked':
        this.burst(t, 0.05, 'bandpass', 900, 3, 0.2 * v, 0.3);
        this.burst(t + 0.09, 0.05, 'bandpass', 800, 3, 0.18 * v, 0.3);
        this.burst(t + 0.18, 0.05, 'bandpass', 950, 3, 0.15 * v, 0.3);
        break;
      case 'unlock':
        this.burst(t, 0.03, 'bandpass', 2400, 5, 0.2 * v, 0.2);
        this.burst(t + 0.12, 0.05, 'bandpass', 1600, 4, 0.25 * v, 0.3);
        break;
      case 'glass':
        for (let i = 0; i < 9; i++) {
          this.tone(t + Math.random() * 0.25, 2500 + Math.random() * 4000, 0.15 + Math.random() * 0.3, 'sine', 0.04 * v, 0.4);
        }
        this.burst(t, 0.3, 'highpass', 2500, 0.8, 0.3 * v, 0.4);
        break;
      case 'swing':
        this.burst(t, 0.22, 'bandpass', 700, 1.2, 0.12 * v, 0.1, 0.08);
        break;
      case 'hit':
        this.burst(t, 0.12, 'lowpass', 500, 1, 0.5 * v, 0.4);
        this.tone(t, 120, 0.15, 'sine', 0.3 * v, 0.3, 60);
        break;
      case 'hit-flesh':
        this.burst(t, 0.18, 'lowpass', 600, 1.2, 0.6 * v, 0.4);
        this.burst(t + 0.02, 0.12, 'bandpass', 1500, 2, 0.15 * v, 0.2);
        this.tone(t, 95, 0.2, 'sine', 0.35 * v, 0.3, 55);
        break;
      case 'hurt':
        this.burst(t, 0.2, 'lowpass', 400, 1, 0.6 * v, 0.3);
        this.tone(t, 160, 0.3, 'sawtooth', 0.08 * v, 0.3, 90);
        break;
      case 'growl': {
        const c = this.ctx;
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(55 + Math.random() * 20, t);
        o.frequency.linearRampToValueAtTime(40 + Math.random() * 10, t + 1.1);
        const lfo = c.createOscillator();
        lfo.frequency.value = 18 + Math.random() * 8;
        const lg = c.createGain();
        lg.gain.value = 18;
        lfo.connect(lg);
        lg.connect(o.frequency);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 500;
        f.Q.value = 2.5;
        const g = c.createGain();
        this.env(g, t, 0.15, 0.22 * v, 1.0);
        o.connect(f);
        f.connect(g);
        this.out(g, 0.6);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1.3);
        lfo.stop(t + 1.3);
        this.burst(t, 1.0, 'bandpass', 900, 1.5, 0.06 * v, 0.5, 0.2);
        break;
      }
      case 'creature-die':
        this.tone(t, 90, 1.6, 'sawtooth', 0.12 * v, 0.6, 30);
        this.burst(t + 0.3, 1.2, 'lowpass', 500, 1, 0.3 * v, 0.6, 0.3);
        break;
      case 'valve':
        this.tone(t, 900, 0.5, 'sawtooth', 0.015 * v, 0.4, 1200, 0.1);
        this.burst(t, 0.5, 'bandpass', 2200, 8, 0.05 * v, 0.4, 0.1);
        break;
      case 'steam':
        this.burst(t, 2.2, 'highpass', 2500, 0.5, 0.25 * v, 0.4, 0.15);
        this.burst(t, 2.0, 'bandpass', 900, 0.8, 0.12 * v, 0.4, 0.2);
        break;
      case 'waterhammer':
        this.burst(t, 0.5, 'lowpass', 900, 0.7, 1.0 * v, 0.9, 0.002);
        for (let i = 0; i < 6; i++) this.tone(t, 220 * (1 + i * 1.37), 1.4, 'sine', 0.06 * v, 0.9);
        this.burst(t + 0.35, 0.3, 'lowpass', 700, 0.7, 0.5 * v, 0.9, 0.002);
        break;
      case 'dynamo': {
        const c = this.ctx;
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(20, t);
        o.frequency.exponentialRampToValueAtTime(140, t + 3.5);
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 700;
        const g = c.createGain();
        this.env(g, t, 1.5, 0.12 * v, 2.5);
        o.connect(f);
        f.connect(g);
        this.out(g, 0.4);
        o.start(t);
        o.stop(t + 4.2);
        break;
      }
      case 'breaker':
        this.burst(t, 0.1, 'lowpass', 1500, 1, 0.8 * v, 0.6, 0.001);
        this.tone(t + 0.05, 100, 0.8, 'square', 0.04 * v, 0.4);
        this.tone(t + 0.05, 50, 0.8, 'square', 0.05 * v, 0.4);
        break;
      case 'trip':
        this.burst(t, 0.06, 'highpass', 2000, 1, 0.6 * v, 0.5, 0.001);
        this.tone(t, 1800, 0.2, 'square', 0.03 * v, 0.4, 300);
        break;
      case 'safe-click':
        this.burst(t, 0.02, 'bandpass', 3500, 8, 0.12 * v, 0.1, 0.001);
        break;
      case 'safe-open':
        this.burst(t, 0.05, 'bandpass', 2000, 4, 0.3 * v, 0.3, 0.001);
        this.tone(t + 0.1, 140, 0.9, 'sawtooth', 0.04 * v, 0.5, 90, 0.2);
        break;
      case 'morse-dot':
        this.tone(t, 700, 0.08, 'sine', 0.12 * v, 0.05, undefined, 0.003);
        this.burst(t, 0.08, 'bandpass', 5000, 3, 0.05 * v, 0.1, 0.001);
        break;
      case 'morse-dash':
        this.tone(t, 700, 0.24, 'sine', 0.12 * v, 0.05, undefined, 0.003);
        this.burst(t, 0.24, 'bandpass', 5000, 3, 0.05 * v, 0.1, 0.001);
        break;
      case 'static':
        this.burst(t, 0.9, 'bandpass', 2400, 0.6, 0.08 * v, 0.1, 0.05);
        break;
      case 'push':
        this.burst(t, 0.75, 'bandpass', 380, 2.5, 0.28 * v, 0.4, 0.1);
        this.tone(t, 70, 0.7, 'sawtooth', 0.03 * v, 0.4, 60, 0.1);
        break;
      case 'furnace':
        this.burst(t, 1.4, 'lowpass', 400, 0.7, 0.8 * v, 0.5, 0.05);
        this.burst(t, 1.0, 'bandpass', 1200, 0.8, 0.2 * v, 0.5, 0.05);
        break;
      case 'burn': {
        this.burst(t, 2.5, 'lowpass', 600, 0.7, 0.9 * v, 0.7, 0.05);
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.2, 400 + i * 170, 2.2, 'sawtooth', 0.05 * v, 0.9, 60);
        break;
      }
      case 'heartbeat':
        this.tone(t, 55, 0.12, 'sine', 0.5 * v, 0.1, 40, 0.01);
        this.tone(t + 0.22, 50, 0.16, 'sine', 0.4 * v, 0.1, 35, 0.01);
        break;
      case 'foghorn':
        this.tone(t, 98, 3.2, 'sawtooth', 0.07 * v, 0.9, 96, 0.4);
        this.tone(t, 147, 3.2, 'sawtooth', 0.04 * v, 0.9, 145, 0.4);
        break;
      case 'stinger':
        for (const f of [110, 116.5, 164.8, 233]) this.tone(t, f, 2.5, 'sawtooth', 0.05 * v, 0.9, f * 0.97, 0.01);
        this.burst(t, 0.6, 'lowpass', 800, 1, 0.4 * v, 0.9, 0.005);
        break;
      case 'knock3':
        for (let i = 0; i < 3; i++) {
          this.burst(t + i * 0.32, 0.12, 'lowpass', 300, 1.2, 0.45 * v, 0.9, 0.002);
          this.tone(t + i * 0.32, 75, 0.25, 'sine', 0.2 * v, 0.9, 60);
        }
        break;
      case 'drip':
        this.tone(t, 1600 + Math.random() * 900, 0.12, 'sine', 0.04 * v, 0.8, 700);
        break;
      case 'creak':
        this.tone(t, 60 + Math.random() * 40, 0.9 + Math.random() * 0.6, 'sawtooth', 0.025 * v, 0.7, 45 + Math.random() * 60, 0.3);
        break;
      case 'lights':
        this.tone(t, 100, 1.2, 'square', 0.03 * v, 0.3, 100, 0.2);
        this.burst(t, 0.06, 'highpass', 3000, 1, 0.2 * v, 0.3, 0.001);
        break;
      case 'splash':
        this.burst(t, 0.9, 'lowpass', 1400, 0.8, 0.6 * v, 0.6, 0.01);
        this.burst(t + 0.1, 1.2, 'bandpass', 600, 1, 0.3 * v, 0.6, 0.1);
        break;
      default:
        break;
    }
  }

  private makeBed(): Bed {
    const g = this.ctx!.createGain();
    g.gain.value = 0.0001;
    g.connect(this.ambBus);
    return { nodes: [], stop: () => undefined, gain: g, timers: [] };
  }

  private loopNoise(bed: Bed, type: BiquadFilterType, freq: number, q: number, level: number, lfoRate = 0, lfoDepth = 0): void {
    const c = this.ctx!;
    const s = this.noiseSrc(true);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = level;
    s.connect(f);
    f.connect(g);
    g.connect(bed.gain);
    s.start();
    bed.nodes.push(s);
    if (lfoRate > 0) {
      const l = c.createOscillator();
      l.frequency.value = lfoRate;
      const lg = c.createGain();
      lg.gain.value = lfoDepth;
      l.connect(lg);
      lg.connect(g.gain);
      l.start();
      bed.nodes.push(l);
    }
  }

  private drone(bed: Bed, freq: number, type: OscillatorType, level: number, detune = 0): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.value = level;
    o.connect(g);
    g.connect(bed.gain);
    o.start();
    bed.nodes.push(o);
  }

  private every(bed: Bed, minS: number, maxS: number, fn: () => void): void {
    const schedule = () => {
      const id = window.setTimeout(
        () => {
          if (this.bed !== bed && this.dangerBed !== bed && this.dynamoBed !== bed) return;
          fn();
          schedule();
        },
        (minS + Math.random() * (maxS - minS)) * 1000,
      );
      bed.timers.push(id);
    };
    schedule();
  }

  private killBed(bed: Bed | null, fade = 1.2): void {
    if (!bed || !this.ctx) return;
    const now = this.ctx.currentTime;
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setValueAtTime(Math.max(0.0001, bed.gain.gain.value), now);
    bed.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
    for (const id of bed.timers) window.clearTimeout(id);
    window.setTimeout(() => {
      for (const n of bed.nodes) {
        try {
          (n as AudioScheduledSourceNode).stop();
        } catch {
          /* already stopped */
        }
        n.disconnect();
      }
      bed.gain.disconnect();
    }, (fade + 0.2) * 1000);
  }

  setAmbience(id: AmbienceId | 'title'): void {
    if (!this.ctx) {
      this.pendingBed = id;
      return;
    }
    if (this.bedId === id) return;
    this.killBed(this.bed);
    this.bedId = id;
    if (id === 'none') {
      this.bed = null;
      return;
    }
    const bed = this.makeBed();
    this.bed = bed;
    const now = this.ctx.currentTime;
    bed.gain.gain.exponentialRampToValueAtTime(1, now + 1.5);
    switch (id) {
      case 'title':
        this.loopNoise(bed, 'lowpass', 420, 0.7, 0.22, 0.08, 0.12);
        this.drone(bed, 55, 'sine', 0.05);
        this.drone(bed, 82.4, 'sine', 0.025, 4);
        this.drone(bed, 130.8, 'triangle', 0.01, -6);
        this.every(bed, 9, 16, () => this.sfx('creak', { volume: 0.7 }));
        this.every(bed, 18, 30, () => this.sfx('foghorn', { volume: 0.5 }));
        break;
      case 'deck':
        this.loopNoise(bed, 'lowpass', 380, 0.7, 0.3, 0.09, 0.2);
        this.loopNoise(bed, 'bandpass', 900, 0.9, 0.05, 0.05, 0.04);
        this.every(bed, 6, 12, () => this.sfx('creak', { volume: 0.8 }));
        this.every(bed, 25, 45, () => this.sfx('foghorn', { volume: 0.35 }));
        break;
      case 'bridge':
        this.loopNoise(bed, 'bandpass', 1300, 3, 0.03, 0.2, 0.02);
        this.loopNoise(bed, 'lowpass', 300, 0.7, 0.08, 0.08, 0.05);
        this.drone(bed, 50, 'sine', 0.02);
        this.every(bed, 5, 10, () => this.sfx('creak', { volume: 0.6 }));
        break;
      case 'interior':
        this.drone(bed, 48, 'sine', 0.04);
        this.drone(bed, 48.6, 'sine', 0.03);
        this.loopNoise(bed, 'lowpass', 140, 0.7, 0.12);
        this.every(bed, 4, 9, () => this.sfx('creak', { volume: 0.7 }));
        this.every(bed, 3, 7, () => this.sfx('drip', { volume: 0.7 }));
        this.every(bed, 30, 55, () => this.sfx('knock3', { volume: 0.5 }));
        break;
      case 'engine':
        this.loopNoise(bed, 'lowpass', 240, 0.8, 0.35, 0.3, 0.06);
        this.loopNoise(bed, 'bandpass', 95, 2, 0.25);
        this.every(bed, 0.3, 1.4, () => this.burstPublic(0.02, 'highpass', 3500, 0.05));
        this.every(bed, 3, 8, () => this.sfx('drip', { volume: 0.6 }));
        break;
      case 'hold':
        this.loopNoise(bed, 'bandpass', 320, 1.5, 0.08, 0.35, 0.06);
        this.drone(bed, 36.7, 'sine', 0.07);
        this.drone(bed, 1175, 'sine', 0.004, 8);
        this.every(bed, 2, 5, () => this.sfx('drip', { volume: 0.9 }));
        this.every(bed, 12, 24, () => this.sfx('knock3', { volume: 0.7 }));
        break;
    }
  }

  private burstPublic(dur: number, type: BiquadFilterType, freq: number, peak: number): void {
    if (!this.ctx) return;
    this.burst(this.ctx.currentTime, dur, type, freq, 1, peak, 0.3);
  }

  /** Pulsing low ostinato while creatures are hunting. */
  setDanger(on: boolean): void {
    if (!this.ctx) return;
    if (on && !this.dangerBed) {
      const bed = this.makeBed();
      this.dangerBed = bed;
      bed.gain.disconnect();
      bed.gain.connect(this.musicBus);
      bed.gain.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 0.8);
      this.drone(bed, 41.2, 'sawtooth', 0.02);
      const pulse = () => {
        if (!this.ctx || this.dangerBed !== bed) return;
        const t = this.ctx.currentTime;
        this.tone(t, 82.4, 0.18, 'square', 0.04, 0.3, 80, 0.005, this.musicBus);
        this.tone(t + 0.28, 77.8, 0.18, 'square', 0.035, 0.3, 76, 0.005, this.musicBus);
      };
      pulse();
      this.every(bed, 0.62, 0.62, pulse);
    } else if (!on && this.dangerBed) {
      this.killBed(this.dangerBed, 2);
      this.dangerBed = null;
    }
  }

  /** Dynamo whine + engine beat once power is restored (only audible in the engine room). */
  setDynamo(on: boolean, level = 1): void {
    if (!this.ctx) return;
    if (on && !this.dynamoBed) {
      const bed = this.makeBed();
      this.dynamoBed = bed;
      this.drone(bed, 140, 'sawtooth', 0.006);
      this.drone(bed, 280, 'sine', 0.01);
      this.loopNoise(bed, 'bandpass', 2000, 6, 0.01);
      this.every(bed, 0.42, 0.42, () => this.burstPublic(0.05, 'lowpass', 200, 0.12 * level));
    } else if (!on && this.dynamoBed) {
      this.killBed(this.dynamoBed, 0.8);
      this.dynamoBed = null;
    }
    if (this.dynamoBed && this.ctx) this.dynamoBed.gain.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, 0.3);
  }

  /** Heartbeat when badly hurt; called every frame with a 0..1 intensity. */
  update(dt: number, heart: number): void {
    if (!this.ctx) return;
    if (heart > 0) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 1.1 - heart * 0.45;
        this.sfx('heartbeat', { volume: 0.5 + heart * 0.6 });
      }
    }
  }
}
