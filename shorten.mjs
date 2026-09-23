/**
 * Remove loops from a route.
 *
 * If a route visits the same position twice, everything between the two visits
 * accomplished nothing, and cutting it out leaves a route that is strictly
 * shorter and still lands in the same place. This is not optimisation — it
 * cannot find a better route — but every move it removes is provably wasted.
 */
import { applyMove, stateKey } from './engine.mjs';

export function removeLoops(start, moves) {
  const path = [];                          // moves kept so far
  const index = new Map([[stateKey(start), 0]]);   // position -> path length on arrival
  const trail = [stateKey(start)];          // positions along the kept path
  let state = start;
  for (const move of moves) {
    state = applyMove(state, move);
    const key = stateKey(state);
    if (index.has(key)) {
      // Back to a position already on the path: drop the loop.
      const keep = index.get(key);
      for (let i = keep + 1; i < trail.length; i++) index.delete(trail[i]);
      path.length = keep;
      trail.length = keep + 1;
    } else {
      path.push(move);
      trail.push(key);
      index.set(key, path.length);
    }
  }
  return path;
}
