import assert from 'node:assert/strict';
import test from 'node:test';
import { makeState, applyMove, legalMoves, stateKey, tilt, EMPTY } from './engine.mjs';
import { BOOKLET_PATTERNS } from './patterns.mjs';
import { predecessors, tiltPredecessors } from './predecessors.mjs';

const pattern = (n) => BOOKLET_PATTERNS[n - 1].state;

function scrambled(seed, steps) {
  let s = pattern(1);
  let n = seed;
  const rnd = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < steps; i++) {
    const ms = legalMoves(s);
    s = applyMove(s, ms[Math.floor(rnd() * ms.length)]);
  }
  return s;
}

test('every predecessor really does move onto the position', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const target = scrambled(seed, 25);
    for (const { state, move } of predecessors(target)) {
      assert.equal(stateKey(applyMove(state, move)), stateKey(target));
    }
  }
});

test('the position a move came from is always among its predecessors', () => {
  // The completeness check: take a real position, make a real move, and the
  // position we left must show up when we ask what could have led here. Only
  // meaningful when the list was not cut off by its cap.
  let checked = 0;
  for (const seed of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    const before = scrambled(seed, 6);
    for (const move of legalMoves(before)) {
      const after = applyMove(before, move);
      if (stateKey(after) === stateKey(before)) continue;
      const list = predecessors(after, 50000);
      if (list.truncated) continue;
      checked++;
      const found = list.some((p) =>
        stateKey(p.state) === stateKey(before)
        && p.move.type === move.type && p.move.row === move.row && p.move.direction === move.direction);
      assert.ok(found, `seed ${seed}: ${JSON.stringify(move)} not recovered`);
    }
  }
  assert.ok(checked > 30, `too few untruncated cases to mean anything (${checked})`);
});

test('a printed target has no tilt predecessors, only slides', () => {
  // Every target has its sliders at rest, where no channel is open anywhere, so
  // backward search starts from a branching factor of exactly eight.
  for (const n of [1, 2, 17, 52]) {
    const list = predecessors(pattern(n));
    assert.equal(list.length, 8, `pattern ${n}`);
    assert.ok(list.every((p) => p.move.type === 'slide'));
  }
});

test('a position that is not at rest has no tilt predecessor', () => {
  // With every channel open, marbles hanging in mid-air cannot be the result
  // of a tilt down.
  const floating = makeState(
    [1, 0, 0, 0, ...new Array(28).fill(0)], [1, 0, 1, 0, 1, 0, 1, 0]);
  assert.notEqual(stateKey(tilt(floating, 'down')), stateKey(floating));
  assert.deepEqual(tiltPredecessors(floating, 'down'), []);
});
