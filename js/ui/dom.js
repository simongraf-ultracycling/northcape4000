// Kleine DOM-Helfer. Inhalte immer als Text einsetzen (nie innerHTML mit Daten),
// damit später auch fremde Texte (z.B. aus Mails) sicher angezeigt werden.

// h('button', { class: 'btn', onClick: fn, type: 'button' }, 'Text', kindElement)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

// Inhalt ersetzen; vorher den Fokus darin lösen (sonst löst das Entfernen
// eines bearbeiteten Feldes "change"/"blur" mitten im Ersetzen aus)
export function replaceContent(el, ...children) {
  if (el.contains(document.activeElement)) document.activeElement.blur();
  el.replaceChildren();
  append(el, children);
  return el;
}

// SVG-Symbol aus js/ui/icons.js
export function icon(svgMarkup, className = '') {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup.trim(); // nur feste, eigene SVG-Texte
  const svg = template.content.firstElementChild;
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

// Grosse Schalter-Zeile: die ganze Zeile ist tippbar.
export function switchRow({ label, sub, checked = false, disabled = false, variant = '', onChange }) {
  const input = h('input', { type: 'checkbox', class: `switch ${variant}`, role: 'switch', checked, disabled });
  input.addEventListener('change', () => onChange?.(input.checked, input));
  const row = h('label', { class: 'row' }, h('span', { class: 'row-text' }, h('span', { class: 'row-label', text: label }), sub && h('span', { class: 'row-sub', text: sub })), input);
  return { row, input };
}

// Anzeige-Zeile Schlüssel/Wert; set(text, klasse, zusatzzeile)
export function kv(key, value = '–') {
  const valueEl = h('span', { class: 'kv-value', text: value });
  const row = h('div', { class: 'kv' }, h('span', { class: 'kv-key', text: key }), valueEl);
  const set = (text, cls = '', sub = '') => {
    valueEl.className = `kv-value ${cls}`;
    valueEl.replaceChildren(text, ...(sub ? [h('span', { class: 'kv-sub', text: sub })] : []));
  };
  return { row, set };
}

export function button(text, { variant = '', block = false, onClick, iconSvg, type = 'button', disabled = false } = {}) {
  return h('button', { type, class: ['btn', variant && `btn-${variant}`, block && 'btn-block'].filter(Boolean).join(' '), onClick, disabled }, iconSvg && icon(iconSvg), text);
}

// Zweistufiger Knopf (z.B. Löschen)
export function confirmButton(label, confirmLabel, onConfirm, variant = 'danger') {
  const btn = button(label, { variant, block: true });
  let armed = false;
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.textContent = confirmLabel;
      setTimeout(() => {
        armed = false;
        btn.textContent = label;
      }, 4000);
      return;
    }
    onConfirm();
  });
  return btn;
}

export function sectionTitle(text) {
  return h('h2', { class: 'section-title', text });
}
