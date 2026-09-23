/**
 * The perimeter of a target: every position within a few moves of it, found by
 * searching backwards, with the route from each one to the target.
 *
 * The forward search reliably gets close to a target and then stalls — most
 * often exactly one marble short. The region near a target is also exactly
 * where backward search is cheap: a target has its sliders at rest, so no
 * channel is open and it has only eight predecessors. Building that region
 * backwards and letting the forward search stop the moment it touches it turns
 * "one marble short" into a finished route.
 */
import { stateKey, slide, EMPTY } from './engine.mjs';
import { predecessors } from './predecessors.mjs';

/**
 * Rows with no marbles have an invisible slider, so a target is really a family
 * of positions differing only in those sliders. All of them are goals.
 */
function goalVariants(target) {
  const empty = [];
  for (let row = 0; row < target.board.rows; row++) {
    const from = row * target.board.slots;
    if (target.cells.slice(from, from + target.board.slots).every((c) => c === EMPTY)) empty.push(row);
  }
  const out = [];
  for (let mask = 0; mask < (1 << empty.length); mask++) {
    let s = target;
    empty.forEach((row, i) => { if (mask & (1 << i)) s = slide(s, row); });
    out.push(s);
  }
  return out;
}

/**
 * @returns {{ map: Map<string, {move, next}|null>, depth: number, size: number,
 *            levels: number[], truncated: boolean, complete: boolean }}
 *   map[key] is null for a goal, otherwise the forward move to take and the key
 *   of the position it leads to, one step closer to the target.
 */
export function buildPerimeter(target, { depth = 6, maxStates = 400_000, fanout = 3000 } = {}) {
  const map = new Map();
  let frontier = [];
  for (const g of goalVariants(target)) {
    const key = stateKey(g);
    if (!map.has(key)) { map.set(key, null); frontier.push(g); }
  }
  const levels = [map.size];
  let reached = 0;
  let truncated = false;   // did any predecessor list hit its cap?
  for (let d = 1; d <= depth && frontier.length && map.size < maxStates; d++) {
    const next = [];
    for (const state of frontier) {
      const toKey = stateKey(state);
      const preds = predecessors(state, fanout);
      if (preds.truncated) truncated = true;
      for (const { state: prev, move } of preds) {
        const key = stateKey(prev);
        if (map.has(key)) continue;
        map.set(key, { move, next: toKey });
        next.push(prev);
        if (map.size >= maxStates) break;
      }
      if (map.size >= maxStates) break;
    }
    frontier = next;
    levels.push(next.length);
    reached = d;
  }
  // Complete means the search ran dry on its own: nothing was cut off by a cap,
  // so the map is every position from which the target can be reached at all.
  const complete = frontier.length === 0 && !truncated && map.size < maxStates;
  return { map, depth: reached, size: map.size, levels, truncated, complete };
}

/** The forward moves from a perimeter position to the target. */
export function routeToGoal(perimeter, key) {
  const moves = [];
  let entry = perimeter.map.get(key);
  while (entry) {
    moves.push(entry.move);
    entry = perimeter.map.get(entry.next);
  }
  return moves;
}
