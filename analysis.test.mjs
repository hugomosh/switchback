import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY, ORANGE, GREEN, makeState, labelMarbles, occupancyKey } from './engine.mjs';
import { explore, arrangementSpace, permutationSign, analyse } from './analysis.mjs';

const tiny = { rows: 4, slots: 2 };
const tinyStart = () => makeState(
  [ORANGE, ORANGE, GREEN, GREEN, EMPTY, EMPTY, EMPTY, EMPTY],
  [0, 0, 0, 0],
  tiny,
);

test('permutation sign counts cycles, not fixed points', () => {
  assert.equal(permutationSign([1, 2, 3, 4], [1, 2, 3, 4]), 1);
  assert.equal(permutationSign([2, 1, 3, 4], [1, 2, 3, 4]), -1); // one transposition
  assert.equal(permutationSign([2, 1, 4, 3], [1, 2, 3, 4]), 1);  // two transpositions
  assert.equal(permutationSign([2, 3, 1, 4], [1, 2, 3, 4]), 1);  // a 3-cycle is even
  assert.equal(permutationSign([2, 3, 4, 1], [1, 2, 3, 4]), -1); // a 4-cycle is odd
});

test('labelling gives every marble a distinct id and keeps the holes', () => {
  const labelled = labelMarbles(tinyStart());
  assert.equal(occupancyKey(labelled), occupancyKey(tinyStart()));
  const marbles = labelled.cells.filter((c) => c !== EMPTY);
  assert.equal(new Set(marbles).size, marbles.length);
});

test('arrangement space is the multinomial coefficient', () => {
  assert.equal(arrangementSpace(tinyStart()), 420n); // 8! / (2! 2! 4!)
});

test('search from a state includes that state at depth zero', () => {
  const result = explore(tinyStart(), { maxStates: 50 });
  assert.equal(result.seen.size, 50);
  assert.equal(result.truncated, true);
});

test('a capped search reports itself as capped and claims nothing', () => {
  const report = analyse(tinyStart(), { maxStates: 100 });
  assert.equal(report.truncated, true);
  assert.equal(report.coverage.complete, false);
});

test('both parities occur on the reduced board, so no parity obstruction', () => {
  const report = analyse(tinyStart(), { maxStates: 200_000 });
  assert.equal(report.truncated, false);
  assert.ok(report.permutations.even > 0);
  assert.ok(report.permutations.odd > 0);
  assert.equal(report.permutations.parityObstruction, false);
});
