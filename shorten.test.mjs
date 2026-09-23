import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMove, stateKey } from './engine.mjs';
import { BOOKLET_PATTERNS, compare } from './patterns.mjs';
import { removeLoops } from './shorten.mjs';
import { HAND_PLAYED } from './routes.mjs';

const slideMove = (row) => ({ type: 'slide', row });
const replay = (start, moves) => moves.reduce(applyMove, start);

test('sliding a row twice is a loop and is removed', () => {
  const start = BOOKLET_PATTERNS[0].state;
  assert.deepEqual(removeLoops(start, [slideMove(2), slideMove(2)]), []);
});

test('a loop in the middle is cut and the rest kept', () => {
  const start = BOOKLET_PATTERNS[0].state;
  const moves = [slideMove(0), slideMove(4), slideMove(4), slideMove(1)];
  const out = removeLoops(start, moves);
  assert.deepEqual(out, [slideMove(0), slideMove(1)]);
  assert.equal(stateKey(replay(start, out)), stateKey(replay(start, moves)));
});

test('a route without loops is left alone', () => {
  const start = BOOKLET_PATTERNS[0].state;
  const moves = [slideMove(0), slideMove(1), slideMove(2)];
  assert.deepEqual(removeLoops(start, moves), moves);
});

test('the hand-played route to pattern 4 gets shorter and still lands', () => {
  const route = HAND_PLAYED.find((r) => r.target === 4);
  const [board, text] = route.code.split('~');
  const [cells, shifts] = board.split('|');
  const { makeState } = { makeState: null };
  return import('./engine.mjs').then(({ makeState: mk }) => {
    const start = mk([...cells].map(Number), [...shifts].map(Number));
    const moves = [...text].map((ch) => (ch >= '1' && ch <= '8'
      ? { type: 'slide', row: Number(ch) - 1 }
      : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' }));
    const out = removeLoops(start, moves);
    assert.ok(out.length < moves.length, 'the route has loops, so it must get shorter');
    assert.equal(compare(replay(start, out), BOOKLET_PATTERNS[3].state).solved, true,
      'and it must still land on pattern 4');
  });
});
