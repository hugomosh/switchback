/**
 * Solve view — find a route from one board to another and walk through it.
 *
 * The search is a beam search, so it finds a route rather than the shortest
 * one, and on hard pairs it can fail. Both facts are stated in the readout
 * instead of being hidden: a plan that stops short is shown as partial, and
 * the board never claims a target it has not reached.
 */

import { applyMove } from './engine.mjs';
import { boardElement } from './board.mjs';
import { ALL_PATTERNS, compare, patternByNumber } from './patterns.mjs';
import { solve, distance } from './solver.mjs';
import { app, board, resetTo, update } from './store.mjs';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const state = {
  fromNumber: 1,
  toNumber: 2,
  useCurrent: false,
  shortPlans: false,
  result: null,
  step: 0,
  running: false,
  progress: null,
};

const patternFor = (number) => patternByNumber(number).state;
const startState = () => (state.useCurrent ? board() : patternFor(state.fromNumber));

function picker(label, key, rerender, extra) {
  const wrap = el('label');
  wrap.appendChild(el('span', '', label));
  const select = el('select');
  if (extra) {
    const option = el('option', '', extra.label);
    option.value = extra.value;
    select.appendChild(option);
  }
  for (const p of ALL_PATTERNS) {
    const option = el('option', '', p.number === 0 ? 'Opening board' : `Pattern ${p.number}`);
    option.value = String(p.number);
    select.appendChild(option);
  }
  select.value = key === 'from' && state.useCurrent ? 'current' : String(state[key + 'Number']);
  select.addEventListener('change', () => {
    if (select.value === 'current') {
      state.useCurrent = true;
    } else {
      if (key === 'from') state.useCurrent = false;
      state[key + 'Number'] = Number(select.value);
    }
    state.result = null;
    state.step = 0;
    rerender();
  });
  wrap.appendChild(select);
  return wrap;
}

function run(rerender) {
  state.running = true;
  state.result = null;
  state.progress = null;
  rerender();
  const from = startState();
  const to = patternFor(state.toNumber);
  const began = Date.now();
  solve(from, to, {
    switches: state.shortPlans,
    breathe: () => new Promise((resolve) => setTimeout(resolve, 0)),
    onProgress: (p) => { state.progress = { ...p, seconds: (Date.now() - began) / 1000 }; },
  }).then((result) => {
    result.seconds = (Date.now() - began) / 1000;
    state.result = result;
    state.step = 0;
    state.running = false;
    rerender();
  });
}

export function render(rerender) {
  const view = el('div', 'view');
  const from = startState();
  const to = patternFor(state.toNumber);

  const picks = el('div', 'picker');
  picks.append(
    picker('From', 'from', rerender, { label: 'Current board', value: 'current' }),
    picker('To', 'to', rerender),
  );
  view.appendChild(picks);

  const shown = state.result && state.result.states.length
    ? state.result.states[Math.min(state.step, state.result.states.length - 1)]
    : from;
  view.appendChild(boardElement(shown, {
    showShelters: false,
    wrongCells: compare(shown, to).wrongCells,
  }));
  view.appendChild(el('p', 'note',
    'Red rings mark marbles not yet in their target column. '
    + `${distance(from, to)} holes differ at the start.`));

  const go = el('button', 'primary', state.running ? 'Searching…' : 'Find a route');
  go.disabled = state.running;
  go.addEventListener('click', () => run(rerender));
  view.appendChild(go);

  const mode = el('div', 'minor');
  const toggle = el('button', state.shortPlans ? 'on' : '', 'Prefer short plans');
  toggle.disabled = state.running;
  toggle.addEventListener('click', () => { state.shortPlans = !state.shortPlans; state.result = null; rerender(); });
  mode.appendChild(toggle);
  view.appendChild(mode);
  view.appendChild(el('p', 'note', state.shortPlans
    ? 'Searching in switches: twenty-odd move plans when it works, but it finds a route less often.'
    : 'Searching single moves: long plans, but the better chance of finding one.'));

  if (state.running && state.progress) {
    view.appendChild(el('p', 'note',
      `pass ${state.progress.attempt + 1} · ${state.progress.explored.toLocaleString()} positions · `
      + `${state.progress.seconds.toFixed(0)}s · closest so far ${state.progress.best} holes off`));
  }

  if (state.result) {
    const r = state.result;
    const plan = el('div', 'plan');
    plan.appendChild(el('p', 'note', r.solved
      ? `Route found: ${r.moves.length} moves in ${r.seconds.toFixed(0)}s, `
        + `${r.explored.toLocaleString()} positions searched. `
        + 'Beam search, so this is a route rather than the shortest one.'
      : `No route found — ${r.reason}. The moves below are as far as it got.`));

    if (r.moves.length) {
      const controls = el('div', 'minor');
      const back = el('button', '', 'Back');
      const next = el('button', '', 'Step');
      const end = el('button', '', 'To end');
      back.disabled = state.step === 0;
      next.disabled = state.step >= r.moves.length;
      back.addEventListener('click', () => { state.step--; rerender(); });
      next.addEventListener('click', () => { state.step++; rerender(); });
      end.addEventListener('click', () => { state.step = r.moves.length; rerender(); });
      controls.append(back, next, end,
        (() => {
          const load = el('button', '', 'Send to board');
          load.addEventListener('click', () => resetTo(shown, 'loaded from the solver'));
          return load;
        })());
      plan.appendChild(controls);
      plan.appendChild(el('p', 'note', `move ${state.step} of ${r.moves.length}`));

      const list = el('ol');
      r.labels.forEach((label, i) => {
        const item = el('li', i === state.step - 1 ? 'now' : '', label);
        list.appendChild(item);
      });
      plan.appendChild(list);
    }
    view.appendChild(plan);
  }

  return view;
}
