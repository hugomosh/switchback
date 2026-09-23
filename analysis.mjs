/**
 * M5 — reachability analysis over the Switch Back state graph.
 *
 * Pure module: it imports the same engine the UI drives, so there is exactly
 * one implementation of the rules. Runs headlessly in Node and inside the SPA.
 *
 * The full 8x4 board is far too large to enumerate (roughly 10^13 marble
 * arrangements before the 256 slider configurations are counted), so every
 * function here takes whatever board it is handed. Start on a reduced board.
 */

import {
  EMPTY, stateKey, occupancyKey, legalMoves, applyMove, labelMarbles,
} from './engine.mjs';

/**
 * Breadth-first search over the state graph from `start`.
 * Returns the visited map, the search frontier depth, and whether the cap cut
 * the search short — a truncated search proves nothing about unreachability.
 */
export function explore(start, { maxStates = 200_000 } = {}) {
  const seen = new Map();
  const queue = [start];
  seen.set(stateKey(start), { state: start, depth: 0 });
  let head = 0;
  let truncated = false;
  let maxDepth = 0;

  while (head < queue.length && !truncated) {
    const current = queue[head++];
    const depth = seen.get(stateKey(current)).depth;
    for (const move of legalMoves(current)) {
      const next = applyMove(current, move);
      const key = stateKey(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) { truncated = true; break; }
      seen.set(key, { state: next, depth: depth + 1 });
      maxDepth = Math.max(maxDepth, depth + 1);
      queue.push(next);
    }
  }
  return { seen, truncated, states: seen.size, maxDepth };
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

const factorial = (n) => {
  let out = 1n;
  for (let i = 2n; i <= BigInt(n); i++) out *= i;
  return out;
};

/** How many distinct arrangements exist for a given multiset of cell values. */
export function arrangementSpace(state) {
  const counts = new Map();
  for (const c of state.cells) counts.set(c, (counts.get(c) ?? 0) + 1);
  let out = factorial(state.cells.length);
  for (const n of counts.values()) out /= factorial(n);
  return out;
}

/**
 * How much of the arrangement space the search actually touched, ignoring
 * slider positions — an arrangement counts as reached if it appears under any
 * slider configuration.
 */
export function arrangementCoverage(result, start) {
  const reached = new Set();
  for (const { state } of result.seen.values()) reached.add(state.cells.join(','));
  const total = arrangementSpace(start);
  return {
    reached: reached.size,
    total,
    complete: !result.truncated && BigInt(reached.size) === total,
  };
}

// ---------------------------------------------------------------------------
// Permutation structure
// ---------------------------------------------------------------------------

/**
 * Sign of the rearrangement that carries `startLabels` to `labels`, where both
 * list the same marbles in position order. Counted by cycle decomposition:
 * a permutation of n elements in c cycles is a product of n - c transpositions.
 */
export function permutationSign(labels, startLabels) {
  const home = new Map(startLabels.map((label, position) => [label, position]));
  const seen = new Array(labels.length).fill(false);
  let transpositions = 0;
  for (let i = 0; i < labels.length; i++) {
    if (seen[i]) continue;
    let length = 0;
    let j = i;
    while (!seen[j]) { seen[j] = true; j = home.get(labels[j]); length++; }
    transpositions += length - 1;
  }
  return transpositions % 2 === 0 ? 1 : -1;
}

/**
 * Among states that match `start` in both slider positions and occupancy —
 * the ones that differ from it only by a rearrangement of marbles — report
 * which permutations of the labelled marbles are achievable.
 *
 * `start` should be a labelled board (see labelMarbles): with only two colours
 * every permutation within a colour is invisible, which is exactly why a
 * 15-puzzle style parity obstruction cannot survive in the played game.
 */
export function permutationReport(result, start) {
  const home = occupancyKey(start);
  const homeShifts = start.shifts.join('');
  const occupied = start.cells
    .map((c, i) => (c === EMPTY ? -1 : i))
    .filter((i) => i >= 0);
  const startLabels = occupied.map((i) => start.cells[i]);

  let even = 0;
  let odd = 0;
  const transpositions = [];

  for (const { state } of result.seen.values()) {
    if (state.shifts.join('') !== homeShifts) continue;
    if (occupancyKey(state) !== home) continue;
    const labels = occupied.map((i) => state.cells[i]);
    const sign = permutationSign(labels, startLabels);
    if (sign === 1) even++; else odd++;

    const moved = labels.filter((v, k) => v !== startLabels[k]);
    if (moved.length === 2) {
      transpositions.push({ marbles: moved.slice().sort((a, b) => a - b) });
    }
  }

  return {
    even,
    odd,
    parityObstruction: odd === 0 && even > 1,
    transpositions,
    hasTransposition: transpositions.length > 0,
  };
}

/**
 * One-call summary for a reduced board. `start` may be unlabelled; it is
 * labelled internally so permutation structure is visible.
 */
export function analyse(start, options = {}) {
  const labelled = labelMarbles(start);
  const result = explore(labelled, options);
  return {
    states: result.states,
    maxDepth: result.maxDepth,
    truncated: result.truncated,
    coverage: arrangementCoverage(explore(start, options), start),
    permutations: permutationReport(result, labelled),
  };
}
