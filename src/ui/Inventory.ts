import * as THREE from 'three';
import type { Game } from '../game/Game';
import { ITEMS, condition } from '../game/content';
import { MAX_HP } from '../game/state';
import { FocusNav, type Modal } from './UI';
import { button, h } from './dom';

// A small second renderer shows the selected item as a slowly turning low-poly model,
// the way early-90s adventures presented objects in their inventory screens.
let preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; holder: THREE.Group } | null = null;

function getPreview() {
  if (preview) return preview;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(200, 150, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070605);
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.01, 20);
  camera.position.set(0, 0.35, 1.3);
  camera.lookAt(0, 0.05, 0);
  const key = new THREE.DirectionalLight(0xffe2b0, 2.2);
  key.position.set(1, 2, 2);
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0x8090a0, 0x201810, 0.9));
  const holder = new THREE.Group();
  scene.add(holder);
  preview = { renderer, scene, camera, holder };
  return preview;
}

function showModel(id: string): void {
  const p = getPreview();
  p.holder.clear();
  const def = ITEMS[id];
  if (!def) return;
  const m = def.model();
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 0.6 / Math.max(0.05, size.x, size.y, size.z);
  m.position.sub(center.multiplyScalar(s));
  m.scale.setScalar(s);
  const pivot = new THREE.Group();
  pivot.add(m);
  pivot.rotation.x = 0.25;
  p.holder.add(pivot);
}

function drawEcg(ctx: CanvasRenderingContext2D, t: number, tone: 'fine' | 'caution' | 'danger'): void {
  const w = ctx.canvas.width;
  const hh = ctx.canvas.height;
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, w, hh);
  ctx.strokeStyle = tone === 'fine' ? '#6f9a86' : tone === 'caution' ? '#cf9434' : '#c23a24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const period = tone === 'danger' ? 45 : tone === 'caution' ? 60 : 75;
  for (let x = 0; x <= w; x++) {
    const ph = (x + t * 60) % period;
    let y = hh / 2;
    if (ph > 20 && ph < 24) y -= (ph - 20) * 3;
    else if (ph >= 24 && ph < 28) y += (ph - 24) * 6 - 12;
    else if (ph >= 28 && ph < 31) y -= (31 - ph) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function openInventory(g: Game): Modal {
  g.audio.sfx('ui-ok');
  const p = getPreview();
  const view = p.renderer.domElement;
  const nameEl = h('h2');
  const descEl = h('p', { class: 'desc' });
  const actions = h('div', { class: 'row' });
  const list = h('div', { class: 'list', role: 'listbox', 'aria-label': '소지품 목록' });
  const ecg = h('canvas', { width: 150, height: 36 }) as HTMLCanvasElement;
  const ectx = ecg.getContext('2d')!;
  const cond = condition(g.state.hp, MAX_HP);
  const condEl = h('span', { class: `cond ${cond.tone}`, text: cond.label });
  const status = h('div', { class: 'status' }, h('span', { class: 'muted', text: '상태' }), ecg, condEl);
  const equipEl = h('p', { class: 'muted' });
  const panel = h(
    'div',
    { class: 'panel' },
    h('div', { class: 'eyebrow', text: 'INVENTORY · 소지품' }),
    h('div', { class: 'inv' }, h('div', {}, status, equipEl, list), h('div', { class: 'view' }, view, nameEl, descEl, actions)),
  );
  const wrap = h('div', { class: 'modal' }, panel);
  let items = [...g.state.inv];
  let index = 0;
  let mode: 'list' | 'actions' = 'list';
  let spin = 0;
  const actionsNav = new FocusNav(actions, g.audio, { grid: true, onCancel: () => setMode('list') });

  const tag = (id: string) => {
    const k = ITEMS[id]?.kind;
    if (id === g.state.equipped) return '장비 중';
    return k === 'doc' ? '문서' : k === 'weapon' ? '무기' : k === 'heal' ? '회복' : k === 'key' ? '열쇠' : k === 'quest' ? '???' : '도구';
  };

  const renderList = () => {
    items = [...g.state.inv];
    list.replaceChildren(
      ...items.map((id, i) => {
        const b = button(
          '',
          () => {
            index = i;
            select();
            setMode('actions');
          },
          { role: 'option' },
        );
        b.append(h('span', { text: ITEMS[id]?.name ?? id }), h('span', { class: 'tag', text: tag(id) }));
        b.addEventListener('mouseenter', () => {
          if (mode === 'list') {
            index = i;
            select();
          }
        });
        return b;
      }),
    );
    equipEl.textContent = g.state.equipped ? `손에 든 것: ${ITEMS[g.state.equipped].name}` : '손에 든 것: 없음 (맨손 — 발차기)';
  };

  const select = () => {
    index = Math.max(0, Math.min(items.length - 1, index));
    const id = items[index];
    Array.from(list.children).forEach((c, i) => c.classList.toggle('focus', i === index && mode === 'list'));
    (list.children[index] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    if (!id) return;
    const def = ITEMS[id];
    nameEl.textContent = def.name;
    descEl.textContent = def.desc;
    showModel(id);
    const acts: HTMLButtonElement[] = [];
    const close = () => g.ui.pop(modal);
    if (def.kind === 'doc') acts.push(button('읽기', () => void g.readDoc(def.doc!)));
    if (def.kind === 'weapon')
      acts.push(
        button(g.state.equipped === id ? '집어넣기' : '손에 들기', () => {
          g.equip(g.state.equipped === id ? null : id);
          g.audio.sfx('ui-ok');
          renderList();
          select();
          setMode('list');
        }),
      );
    if (def.kind === 'heal')
      acts.push(
        button('마시기', () => {
          close();
          void g.useItem(id);
        }),
      );
    if (def.kind === 'key' || def.kind === 'quest' || def.kind === 'weapon')
      acts.push(
        button('사용', () => {
          close();
          void g.useItem(id);
        }),
      );
    if (def.kind === 'light') acts.push(button('살펴보기', () => void g.say('랜턴 불꽃이 흔들린다. 등유는 아직 충분하다.')));
    acts.push(button('돌아가기', () => setMode('list')));
    actions.replaceChildren(...acts);
    actionsNav.refresh(false);
  };

  const setMode = (m: 'list' | 'actions') => {
    mode = m;
    actions.classList.toggle('active', m === 'actions');
    if (m === 'actions') {
      actionsNav.refresh(false);
      Array.from(list.children).forEach((c) => c.classList.remove('focus'));
    } else {
      Array.from(actions.children).forEach((c) => c.classList.remove('focus'));
      select();
    }
  };

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    spin += 0.016;
    p.holder.rotation.y = spin;
    p.renderer.render(p.scene, p.camera);
    drawEcg(ectx, spin, cond.tone);
  };

  const modal: Modal = g.ui.push({
    el: wrap,
    cancelable: false,
    update: (_dt, input) => {
      if (mode === 'list') {
        if (input.justPressed('up')) {
          index = (index - 1 + items.length) % items.length;
          g.audio.sfx('ui-move');
          select();
        } else if (input.justPressed('down')) {
          index = (index + 1) % items.length;
          g.audio.sfx('ui-move');
          select();
        } else if (input.justPressed('action')) {
          input.consume('action');
          g.audio.sfx('ui-ok');
          setMode('actions');
        } else if (input.justPressed('cancel') || input.justPressed('inventory') || input.justPressed('menu')) {
          g.audio.sfx('ui-back');
          g.ui.pop(modal);
        }
      } else {
        actionsNav.update(input);
      }
    },
    onClose: () => cancelAnimationFrame(raf),
  });
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) g.ui.pop(modal);
  });
  renderList();
  select();
  loop();
  return modal;
}
