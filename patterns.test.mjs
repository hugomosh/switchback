import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY, slide, census, columnOf } from './engine.mjs';
import { BOOKLET_PATTERNS, ALL_PATTERNS, OPENING_PATTERN, patternByNumber, filterPatterns, compare, marbleMap } from './patterns.mjs';

const pattern1 = BOOKLET_PATTERNS[0].state;

test('the booklet has all 52 challenges, numbered in order', () => {
  assert.equal(BOOKLET_PATTERNS.length, 52);
  assert.deepEqual(BOOKLET_PATTERNS.map((p) => p.number), [...Array(52).keys()].map((n) => n + 1));
});

test('every booklet pattern is a legal board', () => {
  for (const { number, state } of BOOKLET_PATTERNS) {
    assert.deepEqual(census(state), { orange: 12, green: 12, empty: 8 },
      `pattern ${number} does not hold 12 of each colour and 8 voids`);
    for (let row = 0; row < 8; row++) {
      const n = state.cells.slice(row * 4, row * 4 + 4).filter((c) => c !== EMPTY).length;
      assert.ok(n <= 4, `pattern ${number} row ${row + 1} holds ${n} marbles`);
    }
  }
});

test('every booklet pattern is drawn with its sliders at rest', () => {
  // A printed target only pins the slider of a row that holds a marble, and in
  // all 52 those rows sit at rest — so a solved board is always the frozen,
  // zero-gate configuration.
  for (const { number, state } of BOOKLET_PATTERNS) {
    assert.deepEqual(state.shifts, [0, 0, 0, 0, 0, 0, 0, 0], `pattern ${number}`);
  }
});

test('no two booklet patterns are the same board', () => {
  const seen = new Set(BOOKLET_PATTERNS.map((p) => p.state.cells.join('')));
  assert.equal(seen.size, 52);
});

test('a board matches itself', () => {
  const result = compare(pattern1, pattern1);
  assert.equal(result.solved, true);
  assert.equal(result.missing, 0);
  assert.equal(result.wrongCells.size, 0);
});

test('sliding a row that holds marbles breaks the match', () => {
  // The cells are untouched — only the slider moved. In slot space this would
  // still look identical, which is exactly the bug this guards against.
  const slid = slide(pattern1, 0);
  assert.deepEqual(slid.cells, pattern1.cells);
  const result = compare(slid, pattern1);
  assert.equal(result.solved, false);
  assert.equal(result.missing, 4, 'all four marbles of row 1 are now in the wrong columns');
  assert.equal(result.wrongCells.size, 4);
});

test('sliding an empty row does not break the match', () => {
  // Rows 4 and 5 of pattern 1 are void, so their sliders are invisible.
  for (const row of [3, 4]) {
    assert.equal(compare(slide(pattern1, row), pattern1).solved, true);
  }
});

test('the marble map places each row on the nine-column face', () => {
  const map = marbleMap(pattern1);
  assert.deepEqual([...map[0].keys()], [0, 2, 4, 6], 'type A row at rest sits on even columns');
  assert.deepEqual([...map[1].keys()], [1, 3, 5, 7], 'type B row at rest sits on odd columns');
  assert.equal(map[3].size, 0, 'the void rows hold nothing');
});

test('a slider position is pinned by any marble in its row', () => {
  const shifted = slide(pattern1, 1);
  assert.deepEqual([...marbleMap(shifted)[1].keys()], [2, 4, 6, 8]);
});

test('pattern 0 is the opening board, listed ahead of the booklet', () => {
  assert.equal(OPENING_PATTERN.number, 0);
  assert.equal(ALL_PATTERNS[0], OPENING_PATTERN);
  assert.equal(ALL_PATTERNS.length, 53);
  assert.deepEqual(census(OPENING_PATTERN.state), { orange: 12, green: 12, empty: 8 });
  assert.equal(patternByNumber(0), OPENING_PATTERN);
  assert.equal(patternByNumber(4), BOOKLET_PATTERNS[3]);
  assert.equal(patternByNumber(99), undefined);
});

test('the opening board is not one of the 52', () => {
  const opening = OPENING_PATTERN.state.cells.join('');
  assert.ok(!BOOKLET_PATTERNS.some((p) => p.state.cells.join('') === opening));
});

test('the pattern filter takes numbers, ranges and board codes', () => {
  const nums = (text) => filterPatterns(text).patterns.map((p) => p.number);
  assert.deepEqual(nums('4'), [4]);
  assert.deepEqual(nums('1, 4, 12-15'), [1, 4, 12, 13, 14, 15]);
  assert.deepEqual(nums('15-12'), [12, 13, 14, 15], 'a backwards range still works');
  assert.deepEqual(nums(''), ALL_PATTERNS.map((p) => p.number));
  const code = patternByNumber(7).state.cells.join('');
  assert.deepEqual(nums(code), [7]);
  assert.deepEqual(nums(code + '|00000000'), [7]);
  assert.deepEqual(filterPatterns('0, 99, abc').unmatched, ['99', 'abc']);
});
