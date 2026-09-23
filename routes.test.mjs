import assert from 'node:assert/strict';
import test from 'node:test';
import { makeState, applyMove, stateKey, census } from './engine.mjs';
import { BOOKLET_PATTERNS, compare } from './patterns.mjs';
import { distance } from './solver.mjs';
import { HAND_PLAYED } from './routes.mjs';

function replay(code) {
  const [boardPart, movePart] = code.split('~');
  const [cells, shifts] = boardPart.split('|');
  let state = makeState([...cells].map(Number), [...shifts].map(Number));
  const states = [state];
  for (const ch of movePart ?? '') {
    const move = ch >= '1' && ch <= '8'
      ? { type: 'slide', row: Number(ch) - 1 }
      : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' };
    state = applyMove(state, move);
    states.push(state);
  }
  return states;
}

for (const route of HAND_PLAYED) {
  test(`a real playthrough reproduces move for move: ${route.name}`, () => {
    // The engine's whole gravity model is on trial here. This route was played
    // on the physical puzzle; if a change makes it land anywhere else, the
    // change is wrong.
    const states = replay(route.code);
    const target = BOOKLET_PATTERNS[route.target - 1].state;
    const end = states[states.length - 1];
    assert.equal(compare(end, target).solved, true,
      `the route should end on pattern ${route.target}`);
    assert.deepEqual(census(end), { orange: 12, green: 12, empty: 8 });
  });

  test(`the route wastes no moves: ${route.name}`, () => {
    const states = replay(route.code);
    for (let i = 1; i < states.length; i++) {
      assert.notEqual(stateKey(states[i]), stateKey(states[i - 1]),
        `move ${i} changed nothing`);
    }
  });

  test(`the route accepts long detours away from the target: ${route.name}`, () => {
    // This is why a distance-guided search cannot follow these routes. The
    // measure is how far above its own best-so-far a route is ever willing to
    // go: that is exactly the amount of worsening a search must tolerate to
    // stay on the path. A beam that prunes anything worse than its best throws
    // the route away long before the payoff.
    const target = BOOKLET_PATTERNS[route.target - 1].state;
    const trail = replay(route.code).map((s) => distance(s, target));
    assert.equal(trail[trail.length - 1], 0);

    let best = Infinity;
    let backtrack = 0;
    for (const d of trail) {
      best = Math.min(best, d);
      backtrack = Math.max(backtrack, d - best);
    }
    assert.ok(backtrack >= 8,
      `expected a detour of at least 8 holes, saw ${backtrack}`);
  });
}
