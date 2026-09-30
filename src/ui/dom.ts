type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

/** Minimal hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function button(label: string, onClick: () => void, attrs: Attrs = {}): HTMLButtonElement {
  const b = h('button', { class: 'btn', type: 'button', 'data-nav': '1', ...attrs });
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    // Keyboard/gamepad navigation is handled by FocusNav; leaving DOM focus here would let Enter
    // re-trigger this button through the browser's default action.
    b.blur();
    if (!b.disabled) onClick();
  });
  return b;
}
