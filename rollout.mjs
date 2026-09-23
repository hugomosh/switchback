/**
 * Rollout search: judge a plan by where it ends up, not by every step.
 *
 * A beam scores each move, so any sequence whose first move looks bad is pruned
 * before its payoff appears. The hand-played route in routes.mjs starts by
 * making the board nine holes worse and only pays off four hundred moves later.
 *
 * Here the unit is a whole sequence: sample many random walks, score only the
 * endpoint, commit the best one. Intermediate states are never judged, so a
 * plan is free to tear the board apart on the way.
 */
import { legalMoves, applyMove, stateKey } from './engine.mjs';
import { distance, misaligned } from './solver.mjs';

export function rolloutSearch(start, target, {
  rollouts = 400, walk = 30, budgetMs = 60000, seed = 9, patience = 40,
} = {}) {
  let n = seed >>> 0;
  const rnd = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const score = (s) => distance(s, target) * 4 + misaligned(s, target);

  let state = start;
  let moves = [];
  let best = score(start);
  let stale = 0;
  const t0 = Date.now();
  let iterations = 0;

  while (Date.now() - t0 < budgetMs) {
    iterations++;
    let winner = null;
    for (let r = 0; r < rollouts; r++) {
      let s = state;
      const path = [];
      const length = 4 + Math.floor(rnd() * walk);
      for (let i = 0; i < length; i++) {
        const options = legalMoves(s);
        const move = options[Math.floor(rnd() * options.length)];
        const next = applyMove(s, move);
        if (stateKey(next) === stateKey(s)) continue;   // a tilt that moved nothing
        path.push(move);
        s = next;
        if (score(s) === 0) return { solved: true, moves: [...moves, ...path], iterations, ms: Date.now() - t0 };
      }
      const value = score(s);
      if (!winner || value < winner.value) winner = { value, state: s, path };
    }
    if (!winner) break;

    // Accept an improvement; when stuck, accept the best sample anyway and
    // let the walk carry the position somewhere else entirely.
    if (winner.value < best || stale >= patience) {
      if (winner.value < best) { best = winner.value; stale = 0; } else { stale = 0; }
      state = winner.state;
      moves = [...moves, ...winner.path];
    } else {
      stale++;
    }
  }
  return { solved: false, best: Math.floor(best / 4), iterations, ms: Date.now() - t0 };
}
