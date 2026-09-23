import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY, ORANGE, GREEN, STANDARD_BOARD,
  makeState, cellAt, stateKey, census, isStandardPuzzle, provisionalStart,
  columnOf, rowType, gateMap, openGateCount, isSheltered,
  slide, tilt, legalMoves, applyMove, columnGrid,
} from './engine.mjs';

/** Board with everything empty and the given shifts, for hand-worked cases. */
const blank = (shifts, board = STANDARD_BOARD) =>
  makeState(new Array(board.rows * board.slots).fill(EMPTY), shifts, board);

/** Return a copy of `state` with one cell set. */
const withMarble = (state, row, slot, value) => {
  const cells = [...state.cells];
  cells[row * state.board.slots + slot] = value;
  return makeState(cells, [...state.shifts], state.board);
};

const ALIGNED = [1, 0, 1, 0, 1, 0, 1, 0]; // every A shifted, every B at rest: all gates open
const ALL_REST = [0, 0, 0, 0, 0, 0, 0, 0];

// --- geometry ---------------------------------------------------------------

test('active columns match the confirmed geometry', () => {
  const cols = (row, shift) => [0, 1, 2, 3].map((j) => columnOf(row, j, shift));
  assert.equal(rowType(0), 'A');
  assert.equal(rowType(1), 'B');
  assert.deepEqual(cols(0, 0), [0, 2, 4, 6]); // type A at rest
  assert.deepEqual(cols(0, 1), [1, 3, 5, 7]); // type A shifted
  assert.deepEqual(cols(1, 0), [1, 3, 5, 7]); // type B at rest
  assert.deepEqual(cols(1, 1), [2, 4, 6, 8]); // type B shifted
});

test('adjacent rows share exactly 0, 3, or 4 columns', () => {
  assert.equal(openGateCount(blank([0, 0, ...ALL_REST.slice(2)]), 0), 0);
  assert.equal(openGateCount(blank([1, 1, 0, 0, 0, 0, 0, 0]), 0), 0);
  assert.equal(openGateCount(blank([1, 0, 0, 0, 0, 0, 0, 0]), 0), 4);
  assert.equal(openGateCount(blank([0, 1, 0, 0, 0, 0, 0, 0]), 0), 3);
});

test('A shifted over B at rest aligns slot-for-slot', () => {
  assert.deepEqual(gateMap(blank([1, 0, 0, 0, 0, 0, 0, 0]), 0, 1), [0, 1, 2, 3]);
});

test('A at rest over B shifted offsets by one and strands both edges', () => {
  const s = blank([0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(gateMap(s, 0, 1), [-1, 0, 1, 2]); // A slot 0 (column 0) has no partner
  assert.deepEqual(gateMap(s, 1, 0), [1, 2, 3, -1]); // B slot 3 (column 8) has no partner
});

test('gates only ever connect holes in the same column', () => {
  for (const a of [0, 1]) for (const b of [0, 1]) {
    const s = blank([a, b, 0, 0, 0, 0, 0, 0]);
    gateMap(s, 0, 1).forEach((k, j) => {
      if (k >= 0) assert.equal(columnOf(0, j, a), columnOf(1, k, b));
    });
  }
});

test('edges give shelter: a marble at column 0 cannot be moved by any tilt', () => {
  // Row 0 at rest puts slot 0 at column 0; row 1 shifted strands it.
  const s = blank([0, 1, 0, 0, 0, 0, 0, 0]);
  assert.equal(isSheltered(s, 0, 0), true);
  const parked = withMarble(s, 0, 0, ORANGE);
  assert.equal(cellAt(tilt(parked, 'down'), 0, 0), ORANGE);
  assert.equal(cellAt(tilt(parked, 'up'), 0, 0), ORANGE);
});

// --- slides -----------------------------------------------------------------

test('a slide toggles one shift and moves no marble between slots', () => {
  const before = provisionalStart();
  const after = slide(before, 3);
  assert.deepEqual(after.cells, before.cells);
  assert.deepEqual(after.shifts, [0, 0, 0, 1, 0, 0, 0, 0]);
  assert.deepEqual(slide(after, 3).shifts, before.shifts);
});

test('a slide is legal regardless of neighbouring rows', () => {
  let s = provisionalStart();
  for (let row = 0; row < 8; row++) s = slide(s, row);
  assert.deepEqual(s.shifts, [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(census(s), census(provisionalStart()));
});

test('a slide changes a marble\'s column but never its row', () => {
  const s = withMarble(blank(ALL_REST), 0, 2, GREEN);
  assert.equal(columnOf(0, 2, s.shifts[0]), 4);
  const after = slide(s, 0);
  assert.equal(cellAt(after, 0, 2), GREEN);
  assert.equal(columnOf(0, 2, after.shifts[0]), 5);
});

// --- tilts ------------------------------------------------------------------

test('neutral tilt is a true no-op', () => {
  const s = provisionalStart();
  assert.equal(tilt(s, 'neutral'), s);
});

test('a lone marble falls the full height when every gate is aligned', () => {
  const s = withMarble(blank(ALIGNED), 0, 1, ORANGE);
  const after = tilt(s, 'down');
  assert.equal(cellAt(after, 7, 1), ORANGE);
  assert.equal(cellAt(after, 0, 1), EMPTY);
  assert.equal(cellAt(tilt(after, 'up'), 0, 1), ORANGE);
});

test('a closed gate stops the fall where it is', () => {
  // Rows 0-3 aligned, then row 3 and row 4 share no column.
  const s = withMarble(blank([1, 0, 1, 0, 0, 0, 1, 0]), 0, 2, ORANGE);
  assert.equal(openGateCount(s, 3), 0);
  assert.equal(cellAt(tilt(s, 'down'), 3, 2), ORANGE);
});

test('marbles never stack: a fall stops on an occupied cell', () => {
  let s = blank(ALIGNED);
  s = withMarble(s, 7, 0, GREEN);
  s = withMarble(s, 0, 0, ORANGE);
  const after = tilt(s, 'down');
  assert.equal(cellAt(after, 7, 0), GREEN);
  assert.equal(cellAt(after, 6, 0), ORANGE);
});

test('gravity resolves every open channel at once, not one chosen marble', () => {
  let s = blank(ALIGNED);
  s = withMarble(s, 0, 0, ORANGE);
  s = withMarble(s, 2, 1, GREEN);
  s = withMarble(s, 1, 3, ORANGE);
  const after = tilt(s, 'down');
  assert.equal(cellAt(after, 7, 0), ORANGE);
  assert.equal(cellAt(after, 7, 1), GREEN);
  assert.equal(cellAt(after, 7, 3), ORANGE);
});

test('a column of marbles packs against the floor without reordering', () => {
  let s = blank(ALIGNED);
  s = withMarble(s, 0, 2, ORANGE);
  s = withMarble(s, 3, 2, GREEN);
  s = withMarble(s, 5, 2, ORANGE);
  const after = tilt(s, 'down');
  assert.equal(cellAt(after, 5, 2), ORANGE); // top marble of the three
  assert.equal(cellAt(after, 6, 2), GREEN);
  assert.equal(cellAt(after, 7, 2), ORANGE);
});

test('the offset gate routes a marble sideways one slot per row', () => {
  // Row 0 at rest over row 1 shifted: A slot j feeds B slot j-1.
  // Row 2 also shifted, so row 1 -> row 2 is closed and the drop is one step.
  const s = withMarble(blank([0, 1, 1, 0, 0, 0, 0, 0]), 0, 3, ORANGE);
  assert.equal(openGateCount(s, 1), 0);
  const after = tilt(s, 'down');
  assert.equal(cellAt(after, 1, 2), ORANGE);
  assert.equal(columnOf(0, 3, 0), columnOf(1, 2, 1)); // same column throughout
});

test('tilting twice in the same direction changes nothing the second time', () => {
  const once = tilt(provisionalStart(), 'down');
  assert.equal(stateKey(tilt(once, 'down')), stateKey(once));
});

test('tilts and slides conserve marbles', () => {
  let s = provisionalStart();
  const start = census(s);
  for (const move of [
    { type: 'slide', row: 0 }, { type: 'tilt', direction: 'down' },
    { type: 'slide', row: 5 }, { type: 'tilt', direction: 'up' },
    { type: 'slide', row: 2 }, { type: 'tilt', direction: 'down' },
  ]) {
    s = applyMove(s, move);
    assert.deepEqual(census(s), start);
  }
});

// --- structure --------------------------------------------------------------

test('illegal states cannot be constructed', () => {
  assert.throws(() => makeState([ORANGE], ALL_REST));
  assert.throws(() => makeState(new Array(32).fill(EMPTY), [0, 0]));
  assert.throws(() => makeState(new Array(32).fill(-1), ALL_REST));
  assert.throws(() => makeState(new Array(32).fill(1.5), ALL_REST));
  assert.throws(() => makeState(new Array(32).fill(EMPTY), new Array(8).fill(2)));
});

test('states are frozen against mutation', () => {
  const s = provisionalStart();
  assert.throws(() => { s.cells[0] = GREEN; });
  assert.throws(() => { s.shifts[0] = 1; });
});

test('the provisional start is a well-formed retail puzzle', () => {
  const s = provisionalStart();
  assert.equal(isStandardPuzzle(s), true);
  assert.deepEqual(census(s), { orange: 12, green: 12, empty: 8 });
});

test('ten moves are available from any state', () => {
  assert.equal(legalMoves(provisionalStart()).length, 10);
});

test('the column projection lays 4 holes into a 9-wide row', () => {
  const grid = columnGrid(provisionalStart());
  assert.equal(grid[0].length, 9);
  assert.deepEqual(grid[0].map((c) => (c ? c.slot : null)), [0, null, 1, null, 2, null, 3, null, null]);
  assert.deepEqual(grid[1].map((c) => (c ? c.slot : null)), [null, 0, null, 1, null, 2, null, 3, null]);
});

test('the engine runs on a reduced board for M5 analysis', () => {
  const small = { rows: 4, slots: 2 };
  const s = makeState([ORANGE, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], [1, 0, 1, 0], small);
  assert.equal(cellAt(tilt(s, 'down'), 3, 0), ORANGE);
});

test('a tilt reports which marble landed where', async () => {
  const { resolve } = await import('./engine.mjs');
  const s = withMarble(withMarble(blank(ALIGNED), 0, 1, ORANGE), 3, 2, GREEN);
  const { state, moved } = resolve(s, 'down');
  assert.equal(cellAt(state, 7, 1), ORANGE);
  assert.equal(cellAt(state, 7, 2), GREEN);
  assert.deepEqual(moved.sort((a, b) => a.from - b.from), [
    { from: 0 * 4 + 1, to: 7 * 4 + 1 },
    { from: 3 * 4 + 2, to: 7 * 4 + 2 },
  ]);
});

test('a marble that could not move is not reported as moving', async () => {
  const { resolve } = await import('./engine.mjs');
  const parked = withMarble(blank([0, 1, 0, 0, 0, 0, 0, 0]), 0, 0, ORANGE);
  assert.deepEqual(resolve(parked, 'down').moved, []);
  assert.deepEqual(resolve(parked, 'neutral').moved, []);
});
