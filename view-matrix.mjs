/**
 * Matrix view — every pattern-to-pattern result found so far.
 *
 * Rows are the starting pattern, columns the target. The matrix is settled:
 * every pair is either routed (groupsweep.mjs, sweep.mjs, or by hand) or proved
 * impossible because its target is sealed; see the README. The grid
 * is the overview, and the list underneath is how you open an edge on a phone,
 * since single cells are too small to tap reliably.
 */

import { applyMove } from './engine.mjs';
import { boardElement } from './board.mjs';
import { ALL_PATTERNS, patternByNumber, compare } from './patterns.mjs';
import { SOLUTIONS, SEALED } from './solutions.mjs';
import { resetTo, update } from './store.mjs';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const decode = (text) => [...text].map((ch) => (ch >= '1' && ch <= '8'
  ? { type: 'slide', row: Number(ch) - 1 }
  : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' }));

const describe = (m) => (m.type === 'slide' ? `slide row ${m.row + 1}` : `tilt ${m.direction}`);

const label = (n) => (n === 0 ? 'opening' : `#${n}`);

const state = { selected: null, step: 0 };

function statesOf(edge) {
  let s = patternByNumber(edge.from).state;
  const out = [s];
  for (const move of decode(edge.moves)) { s = applyMove(s, move); out.push(s); }
  return out;
}

function grid(rerender) {
  const n = ALL_PATTERNS.length;
  const byKey = new Map(SOLUTIONS.map((e) => [`${e.from}>${e.to}`, e]));
  const wrap = el('div', 'matrix');
  wrap.style.gridTemplateColumns = `repeat(${n}, var(--mcell))`;
  for (const from of ALL_PATTERNS) {
    for (const to of ALL_PATTERNS) {
      const edge = byKey.get(`${from.number}>${to.number}`);
      const cell = el('button', 'mc');
      if (from.number === to.number) cell.classList.add('self');
      // Every edge into a sealed pattern is impossible, tried or not.
      if (!edge && from.number !== to.number && SEALED.includes(to.number)) {
        cell.classList.add('proven');
        cell.title = `${label(from.number)} → ${label(to.number)}: impossible, pattern ${to.number} is sealed`;
        cell.disabled = true;
        wrap.appendChild(cell);
        continue;
      }
      if (edge) {
        cell.classList.add(edge.solved ? 'ok' : edge.impossible ? 'proven' : 'no');
        if (edge.source === 'hand') cell.classList.add('hand');
        cell.title = `${label(edge.from)} → ${label(edge.to)}: `
          + (edge.solved ? `${edge.length} moves` : edge.impossible ? 'impossible' : `stuck ${edge.best} holes short`);
        if (state.selected === edge) cell.classList.add('picked');
        cell.addEventListener('click', () => { state.selected = edge; state.step = 0; rerender(); });
      } else {
        cell.disabled = true;
      }
      wrap.appendChild(cell);
    }
  }
  return wrap;
}

function detail(edge, rerender) {
  const box = el('div', 'edge-detail');
  box.appendChild(el('h3', '', `${label(edge.from)} → ${label(edge.to)}`));

  if (edge.impossible) {
    box.appendChild(el('p', 'note',
      `Impossible. No tilt, under any slider setting, can produce pattern ${edge.to}: the only `
      + 'positions that reach it are itself with its sliders moved. Proved by searching '
      + 'backwards from it, and checked independently against the engine.'));
    return box;
  }

  if (!edge.solved) {
    box.appendChild(el('p', 'note',
      `No route found yet. The search stopped ${edge.best} hole${edge.best === 1 ? '' : 's'} short. `
      + 'That is evidence, not proof: it may be unreachable, or just hard.'));
    return box;
  }

  const states = statesOf(edge);
  const shown = states[Math.min(state.step, states.length - 1)];
  const target = patternByNumber(edge.to).state;
  box.appendChild(el('p', 'note',
    `${edge.length} moves, ${edge.source === 'hand' ? 'played by hand' : 'found by the solver'}. `
    + 'Not known to be the shortest.'));
  box.appendChild(boardElement(shown, { showShelters: false, wrongCells: compare(shown, target).wrongCells }));

  const controls = el('div', 'minor');
  const back = el('button', '', 'Back');
  const step = el('button', '', 'Step');
  const end = el('button', '', 'To end');
  const play = el('button', 'strong', 'Play from here');
  back.disabled = state.step === 0;
  step.disabled = state.step >= edge.length;
  back.addEventListener('click', () => { state.step--; rerender(); });
  step.addEventListener('click', () => { state.step++; rerender(); });
  end.addEventListener('click', () => { state.step = edge.length; rerender(); });
  play.addEventListener('click', () => {
    resetTo(shown, `${label(edge.from)} → ${label(edge.to)}, move ${state.step}`);
    update((s) => { s.view = 'play'; });
  });
  controls.append(back, step, end, play);
  box.appendChild(controls);

  const moves = decode(edge.moves);
  box.appendChild(el('p', 'note',
    `move ${state.step} of ${edge.length}` + (state.step ? ` — ${describe(moves[state.step - 1])}` : '')));
  return box;
}

export function render(rerender) {
  const view = el('div', 'view');
  const solved = SOLUTIONS.filter((e) => e.solved).length;
  const proven = SOLUTIONS.filter((e) => e.impossible).length;
  const stuck = SOLUTIONS.length - solved - proven;
  const sealedCells = SEALED.length * (ALL_PATTERNS.length - 1);
  const total = ALL_PATTERNS.length * (ALL_PATTERNS.length - 1);

  view.appendChild(el('p', 'note',
    `${solved} routes found` + (stuck ? `, ${stuck} not found yet` : '') + '. '
    + `Patterns ${SEALED.join(' and ')} are sealed — nothing else can reach them — `
    + `which settles ${sealedCells} of the ${total} pairs as impossible; every other pair is solvable. `
    + 'Rows are the starting pattern, columns the target.'));

  const legend = el('div', 'legend');
  for (const [cls, text] of [['ok', 'route found'], ['hand', 'played by hand'], ['no', 'not found yet'], ['proven', 'impossible']]) {
    const item = el('span', 'legend-item');
    item.append(el('i', `mc ${cls === 'hand' ? 'ok hand' : cls}`), document.createTextNode(text));
    legend.appendChild(item);
  }
  view.appendChild(legend);
  view.appendChild(grid(rerender));

  if (state.selected) view.appendChild(detail(state.selected, rerender));

  const list = el('div', 'edge-list');
  for (const edge of SOLUTIONS) {
    const row = el('button', 'edge-row' + (state.selected === edge ? ' picked' : ''));
    row.append(
      el('span', 'edge-name', `${label(edge.from)} → ${label(edge.to)}`),
      el('span', edge.solved ? 'edge-ok' : edge.impossible ? 'edge-proven' : 'edge-no',
        edge.solved ? `${edge.length} moves${edge.source === 'hand' ? ' · hand' : ''}`
          : edge.impossible ? 'impossible' : `stuck at ${edge.best}`),
    );
    row.addEventListener('click', () => { state.selected = edge; state.step = 0; rerender(); });
    list.appendChild(row);
  }
  view.appendChild(list);
  return view;
}
