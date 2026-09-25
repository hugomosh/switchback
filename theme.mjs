/**
 * The appearance menu: light or dark, which marble colours, and the look of
 * the flat board. One place for everything visual, reachable from every tab.
 *
 * Choices live in the store (app.theme, app.palette, app.look) so every view
 * reads them the same way, and are remembered in this browser between visits.
 */
import { app, update } from './store.mjs';

export const THEMES = [
  { id: 'auto', label: 'Auto', note: 'Follows your system' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** The two retail editions. Swatches are the marbles' own colours. */
export const PALETTES = [
  { id: '1993', label: 'Purple & teal', edition: '1993 edition', swatches: ['#7a5fd0', '#3fcab4'] },
  { id: '1998', label: 'Orange & green', edition: '1998 edition', swatches: ['#f2994a', '#6fbf73'] },
];

/** Looks for the flat board, to compare side by side rather than guess at. */
export const LOOKS = [
  { id: 'tray', label: 'Tray', note: 'Rows flush together, bars running edge to edge.' },
  { id: 'spaced', label: 'Spaced', note: 'A gap between rows, so open channels are easy to read.' },
  { id: 'ink', label: 'Ink', note: 'Dark board, flat marbles — closest to the printed patterns.' },
  { id: 'paper', label: 'Paper', note: 'Pale and low contrast, like the booklet page.' },
];

const KEY = 'switchback.appearance';

/** Read saved choices into the store. Storage can be missing or blocked. */
export function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (THEMES.some((t) => t.id === saved.theme)) app.theme = saved.theme;
    if (PALETTES.some((p) => p.id === saved.palette)) app.palette = saved.palette;
    if (LOOKS.some((l) => l.id === saved.look)) app.look = saved.look;
  } catch { /* nothing saved, or no storage: keep the defaults */ }
}

function savePrefs() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: app.theme, palette: app.palette, look: app.look }));
  } catch { /* private window or blocked storage: the choice still applies now */ }
}

function choose(mutate) {
  update(mutate);
  savePrefs();
}

let open = false;
let listening = false;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG = 'http://www.w3.org/2000/svg';
function icon(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const paths = {
    // Half-filled circle: the appearance menu itself.
    menu: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 3v18a9 9 0 0 0 0-18z'],
    auto: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', 'M12 4v16a8 8 0 0 0 0-16z'],
    light: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
      'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
    dark: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  }[kind];
  paths.forEach((d, i) => {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    const filled = (kind === 'menu' || kind === 'auto') && i === 1;
    p.setAttribute('fill', filled || kind === 'dark' ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', kind === 'light' ? '1.8' : '1.6');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
  });
  return svg;
}

function option(className, selected, onPick, ...children) {
  const b = el('button', `${className}${selected ? ' on' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-pressed', String(selected));
  b.append(...children);
  b.addEventListener('click', (e) => { e.stopPropagation(); onPick(); });
  return b;
}

function section(title, ...content) {
  const s = el('section', 'theme-section');
  s.append(el('h4', '', title), ...content);
  return s;
}

function popover(rerender) {
  const pop = el('div', 'theme-pop');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Appearance');
  pop.addEventListener('click', (e) => e.stopPropagation());

  const themes = el('div', 'theme-seg');
  for (const t of THEMES) {
    themes.appendChild(option('theme-opt', app.theme === t.id,
      () => choose((s) => { s.theme = t.id; }), icon(t.id), el('span', '', t.label)));
  }

  const palettes = el('div', 'theme-palettes');
  for (const p of PALETTES) {
    const dots = el('span', 'theme-dots');
    for (const colour of p.swatches) {
      const dot = el('i');
      dot.style.background = colour;
      dots.appendChild(dot);
    }
    const text = el('span', 'theme-palette-text');
    text.append(el('b', '', p.label), el('small', '', p.edition));
    palettes.appendChild(option('theme-palette', app.palette === p.id,
      () => choose((s) => { s.palette = p.id; }), dots, text));
  }

  const looks = el('div', 'theme-looks');
  for (const l of LOOKS) {
    const b = option('theme-look', app.look === l.id, () => choose((s) => { s.look = l.id; }), el('span', '', l.label));
    b.title = l.note;
    looks.appendChild(b);
  }
  const current = LOOKS.find((l) => l.id === app.look);

  pop.append(
    section('Appearance', themes),
    section('Marbles', palettes),
    section('Flat board', looks, el('p', 'theme-note', current ? current.note : '')),
  );
  return pop;
}

/** The header button and, while open, its menu. */
export function themeMenu(rerender) {
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    document.addEventListener('click', () => { if (open) { open = false; rerender(); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) { open = false; rerender(); }
    });
  }
  const wrap = el('div', 'theme-menu');
  const trigger = el('button', 'theme-btn');
  trigger.type = 'button';
  trigger.title = 'Appearance';
  trigger.setAttribute('aria-label', 'Appearance');
  trigger.setAttribute('aria-expanded', String(open));
  trigger.appendChild(icon('menu'));
  trigger.addEventListener('click', (e) => { e.stopPropagation(); open = !open; rerender(); });
  wrap.appendChild(trigger);
  if (open) wrap.appendChild(popover(rerender));
  return wrap;
}
