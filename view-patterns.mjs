/**
 * Patterns view — pick a target to work toward, or paste one in.
 * Thumbnails are read-only boards drawn by the same renderer as the play view.
 */

import { stateKey } from './engine.mjs';
import { boardElement } from './board.mjs';
import { app, board, update, parseCode, resetTo } from './store.mjs';
import { ALL_PATTERNS, BOOKLET_PATTERNS, compare, filterPatterns } from './patterns.mjs';

let filterText = '';   // survives re-renders, not reloads

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function card(pattern) {
  const node = el('div', 'pattern');
  const chosen = app.target && stateKey(app.target.state) === stateKey(pattern.state);
  if (chosen) node.classList.add('chosen');

  node.appendChild(boardElement(pattern.state, { showGates: false, scale: 21 }));

  node.appendChild(el('span', 'number', pattern.number === 0 ? 'start' : String(pattern.number)));

  const meta = el('div', 'pattern-meta');
  const result = compare(board(), pattern.state);
  meta.appendChild(el('p', 'note', result.solved ? 'matches your board' : `${result.missing} away`));

  const label = pattern.name ?? `Pattern ${pattern.number}`;
  const actions = el('div', 'pattern-actions');

  // Put this pattern on the board and go and play from it. Undoable, like any
  // other load: the board you had is still in the history.
  const play = el('button', 'strong', 'Play from here');
  play.addEventListener('click', () => {
    resetTo(pattern.state, `loaded ${label.toLowerCase()}`);
    update((s) => { s.view = 'play'; });
  });

  const pick = el('button', '', chosen ? 'Clear target' : 'Target');
  pick.addEventListener('click', () => update((s) => {
    s.target = chosen ? null : { name: label, state: pattern.state };
  }));
  actions.append(play, pick);
  meta.appendChild(actions);

  node.appendChild(meta);
  return node;
}

export function render(rerender) {
  const view = el('div', 'view');

  view.appendChild(el('p', 'note',
    `The opening board, then all ${BOOKLET_PATTERNS.length} booklet challenges. A board matches when every marble `
    + 'sits in the right column. Every printed target has its sliders at rest, so a '
    + 'solved board is always frozen — no channel is open anywhere.'));

  const filter = el('div', 'filter');
  const query = el('input');
  query.type = 'search';
  query.placeholder = 'Filter: 4, 12-15, or a board code';
  query.value = filterText;
  query.setAttribute('aria-label', 'Filter patterns');
  query.addEventListener('change', () => { filterText = query.value; rerender(); });
  filter.appendChild(query);
  view.appendChild(filter);

  const { patterns, unmatched } = filterPatterns(filterText);
  if (filterText.trim()) {
    view.appendChild(el('p', 'note',
      `${patterns.length} shown` + (unmatched.length ? ` — nothing matched ${unmatched.join(', ')}` : '')));
  }

  const grid = el('div', 'patterns');
  for (const pattern of patterns) grid.appendChild(card(pattern));
  for (const pattern of app.captured) grid.appendChild(card(pattern));
  view.appendChild(grid);

  const adder = el('div', 'code');
  const input = el('input');
  input.placeholder = 'Paste a board code to add it as a target';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Pattern code');
  const error = el('div', 'err');
  const add = el('button', '', 'Add pattern');
  add.addEventListener('click', () => {
    try {
      const state = parseCode(input.value, board().board);
      update((s) => {
        s.captured.push({ name: `Pasted ${s.captured.length + 1}`, note: 'Added from a code.', state });
      });
    } catch (e) {
      error.textContent = e.message;
    }
  });
  adder.append(input, add);
  view.append(adder, error);

  return view;
}
