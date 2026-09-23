/**
 * Analysis view — Phase 2 tooling, running the same engine as the play view.
 *
 * The full board is not enumerable, so this works on reduced boards and says
 * so plainly. A capped search proves nothing about what is unreachable, and
 * the readout never claims otherwise.
 */

import { EMPTY, ORANGE, GREEN, makeState } from './engine.mjs';
import { analyse } from './analysis.mjs';
import { boardElement } from './board.mjs';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const config = { rows: 4, slots: 2, orange: 2, green: 2, maxStates: 200_000 };
let report = null;
let running = false;
let elapsed = 0;

function startState() {
  const size = config.rows * config.slots;
  const cells = [
    ...new Array(config.orange).fill(ORANGE),
    ...new Array(config.green).fill(GREEN),
    ...new Array(Math.max(0, size - config.orange - config.green)).fill(EMPTY),
  ];
  return makeState(cells, new Array(config.rows).fill(0), { rows: config.rows, slots: config.slots });
}

function field(label, key, min, max, rerender) {
  const wrap = el('label', 'field');
  wrap.appendChild(el('span', '', label));
  const input = el('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(config[key]);
  input.addEventListener('change', () => {
    config[key] = Math.max(min, Math.min(max, Number(input.value) || min));
    report = null;
    rerender();
  });
  wrap.appendChild(input);
  return wrap;
}

export function render(rerender) {
  const view = el('div', 'view');
  const size = config.rows * config.slots;
  const overfull = config.orange + config.green > size;

  view.appendChild(el('p', 'note',
    'The retail board has roughly 10^13 marble arrangements before slider positions are '
    + 'counted, so it cannot be enumerated. Shrink it until the search finishes, then look '
    + 'for structure that should generalise.'));

  const fields = el('div', 'fields');
  fields.append(
    field('Rows', 'rows', 2, 8, rerender),
    field('Slots', 'slots', 2, 4, rerender),
    field('Orange', 'orange', 0, 16, rerender),
    field('Green', 'green', 0, 16, rerender),
  );
  view.appendChild(fields);

  if (overfull) {
    view.appendChild(el('p', 'err',
      `A ${config.rows}x${config.slots} board has ${size} holes; ${config.orange + config.green} marbles will not fit.`));
    return view;
  }

  const start = startState();
  view.appendChild(boardElement(start, { showGates: true, scale: 22 }));
  view.appendChild(el('p', 'note', 'Search starts from this board with every slider at rest.'));

  const run = el('button', 'primary', running ? 'Searching…' : 'Run search');
  run.disabled = running;
  run.addEventListener('click', () => {
    running = true;
    rerender();
    // yield a frame so the button repaints before the search blocks the thread
    setTimeout(() => {
      const t0 = performance.now();
      report = analyse(start, { maxStates: config.maxStates });
      elapsed = (performance.now() - t0) / 1000;
      running = false;
      rerender();
    }, 20);
  });
  view.appendChild(run);

  if (report) {
    const readout = el('div', 'readout');
    const list = el('dl');
    const rows = [
      ['States reached', report.states.toLocaleString() + (report.truncated ? ' (capped)' : '')],
      ['Search depth', String(report.maxDepth)],
      ['Arrangements', `${report.coverage.reached.toLocaleString()} of ${report.coverage.total}`],
      ['All reachable', report.truncated ? 'unknown, search was capped'
        : report.coverage.complete ? 'yes' : 'no'],
      ['Even rearrangements', report.permutations.even.toLocaleString()],
      ['Odd rearrangements', report.permutations.odd.toLocaleString()],
      ['Parity obstruction', report.truncated ? 'unknown, search was capped'
        : report.permutations.parityObstruction ? 'yes — only even permutations occur' : 'no'],
      ['Bare transposition', report.permutations.hasTransposition ? 'found' : 'none in reach'],
      ['Elapsed', `${elapsed.toFixed(1)}s`],
    ];
    for (const [term, value] of rows) list.append(el('dt', '', term), el('dd', '', value));
    readout.appendChild(list);
    view.appendChild(readout);
  }

  return view;
}
