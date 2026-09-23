import assert from 'node:assert/strict';
import test from 'node:test';
import { slide, tilt, stateKey, provisionalStart } from './engine.mjs';
import { board, moveCount, commit, undo, resetTo, replayCode, load } from './store.mjs';

const slideMove = (row) => ({ type: 'slide', row });
const tiltMove = (direction) => ({ type: 'tilt', direction });

test('a replay code round-trips the whole game', () => {
  resetTo(provisionalStart(), 'fresh');
  commit(slide(board(), 0), 'slide row 1', slideMove(0));
  commit(slide(board(), 2), 'slide row 3', slideMove(2));
  commit(tilt(board(), 'down'), 'tilt down', tiltMove('down'));
  const code = replayCode();
  const reached = stateKey(board());

  assert.match(code, /^\d{32}\|\d{8}~13D$/, 'slides are row numbers, tilts are U and D');

  resetTo(provisionalStart(), 'fresh');
  const { moves } = load(code, board().board);
  assert.equal(moves, 3);
  assert.equal(stateKey(board()), reached, 'the replay lands on the same board');
  assert.equal(moveCount(), 3);
});

test('a loaded replay can be stepped back through', () => {
  resetTo(provisionalStart(), 'fresh');
  commit(slide(board(), 1), 'slide row 2', slideMove(1));
  const code = replayCode();
  resetTo(provisionalStart(), 'fresh');
  load(code, board().board);
  undo();
  assert.equal(moveCount(), 0, 'undo walks back into the replay');
});

test('a board code with no moves still loads', () => {
  resetTo(provisionalStart(), 'fresh');
  const code = replayCode();
  assert.ok(!code.includes('~'), 'no moves played means no move section');
  assert.equal(load(code, board().board).moves, 0);
});

test('an unknown move character is reported, not swallowed', () => {
  resetTo(provisionalStart(), 'fresh');
  assert.throws(() => load(replayCode() + '~1Z3', board().board), /"Z" is not a move/);
});
