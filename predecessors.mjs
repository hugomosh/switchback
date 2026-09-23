/**
 * Backward moves: every position from which one move reaches a given position.
 *
 * A slide is its own inverse. A tilt is not — many positions fall onto the same
 * result — but that set is small and can be listed. Tilts never change a
 * marble's column, so each column's connected run of cells can be treated on
 * its own: a tilt down packs that run's marbles against the bottom in order,
 * and any placement of the same marbles, in the same order, higher up the run
 * falls onto the same result.
 *
 * This is what makes bidirectional search possible. Every candidate generated
 * here is checked against the engine's own tilt before it is returned, so the
 * rules still live in exactly one place.
 */
import { EMPTY, slide, tilt, stateKey, makeState, columnOf } from './engine.mjs';

/** Each column's runs of vertically connected cells, as flat cell indices, top to bottom. */
function columnRuns(state) {
  const { rows, slots } = state.board;
  const width = 2 * slots + 1;
  const runs = [];
  for (let column = 0; column < width; column++) {
    let run = [];
    for (let row = 0; row < rows; row++) {
      let index = -1;
      for (let slot = 0; slot < slots; slot++) {
        if (columnOf(row, slot, state.shifts[row]) === column) { index = row * slots + slot; break; }
      }
      if (index >= 0) run.push(index);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
}

/** Ways to place `values` in order among `length` cells, as arrays of cell contents. */
function placements(values, length) {
  const out = [];
  const pick = (start, k, acc) => {
    if (k === values.length) {
      const cells = new Array(length).fill(EMPTY);
      acc.forEach((pos, i) => { cells[pos] = values[i]; });
      out.push(cells);
      return;
    }
    for (let p = start; p <= length - (values.length - k); p++) pick(p + 1, k + 1, [...acc, p]);
  };
  pick(0, 0, []);
  return out;
}

/**
 * Every position P (other than `state` itself) with tilt(P, direction) === state.
 * Returns an empty list when `state` could not be the result of that tilt.
 *
 * The set can be enormous: a position packed by a tilt with many channels open
 * has marbles that could have come from almost anywhere, and over a hundred
 * thousand predecessors is ordinary. `limit` caps it, and the returned list is
 * marked `truncated` when the cap was hit. Near a printed target the set is
 * tiny — every target has its sliders at rest, where no channel is open at all.
 */
export function tiltPredecessors(state, direction, limit = 4000) {
  if (stateKey(tilt(state, direction)) !== stateKey(state)) return [];   // not a resting position

  const runs = columnRuns(state).map((run) => (direction === 'down' ? run : [...run].reverse()));
  const options = [];
  for (const run of runs) {
    const values = run.map((i) => state.cells[i]);
    const marbles = values.filter((v) => v !== EMPTY);
    if (marbles.length === 0 || marbles.length === run.length) continue;   // nothing can vary
    options.push({ run, choices: placements(marbles, run.length) });
  }

  const out = [];
  out.truncated = false;
  const build = (k, cells) => {
    if (out.length >= limit) { out.truncated = true; return; }
    if (k === options.length) {
      const candidate = makeState(cells, [...state.shifts], state.board);
      if (stateKey(candidate) === stateKey(state)) return;
      if (stateKey(tilt(candidate, direction)) === stateKey(state)) out.push(candidate);
      return;
    }
    const { run, choices } = options[k];
    for (const choice of choices) {
      const next = cells.slice();
      run.forEach((index, i) => { next[index] = choice[i]; });
      build(k + 1, next);
    }
  };
  build(0, [...state.cells]);
  return out;
}

/**
 * Every (position, move) pair where the move carries the position onto `state`.
 * The move is the forward move, so a path found backwards reads forwards.
 */
export function predecessors(state, limit = 4000) {
  const out = [];
  out.truncated = false;
  for (let row = 0; row < state.board.rows; row++) {
    out.push({ state: slide(state, row), move: { type: 'slide', row } });
  }
  for (const direction of ['down', 'up']) {
    const found = tiltPredecessors(state, direction, limit);
    if (found.truncated) out.truncated = true;
    for (const p of found) out.push({ state: p, move: { type: 'tilt', direction } });
  }
  return out;
}
