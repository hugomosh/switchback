/**
 * Target patterns from the Switchback challenge booklet, and how a board is
 * judged against one.
 *
 * MATCHING HAPPENS IN COLUMN SPACE, NOT SLOT SPACE.
 *
 * A booklet pattern is a picture of the physical board, so what it fixes is
 * where each marble sits across the 9-column face — not which hole index of
 * its slider it occupies. Two boards with identical slot contents but
 * different slider positions look nothing alike in the hand, and only one of
 * them matches the printed picture.
 *
 * This also resolves the slider question: a row's slider position is implied
 * by its marbles. A type-A row at rest shows marbles in even columns and in
 * odd columns when shifted, so any row holding at least one marble has its
 * slider pinned by the picture. A row with no marbles leaves its slider free,
 * which is correct — you cannot see where an empty slider sits.
 */

import { EMPTY, makeState, stateKey, columnOf, provisionalStart } from './engine.mjs';
import { BOOKLET } from './booklet.mjs';

const ROWS = 8;
const SLOTS = 4;

/** Purple and cyan in the booklet; 1 and 2 in the engine. */
export const PURPLE = 1;
export const CYAN = 2;

/** Decode an engine board code into a state. */
function decode(code) {
  const [cells, shifts] = code.split('|');
  return makeState([...cells].map(Number), [...shifts].map(Number));
}

/** The booklet's 52 challenges, in printed order. */
export const BOOKLET_PATTERNS = BOOKLET.map(({ number, code }) => ({
  number,
  state: decode(code),
}));

/**
 * Pattern 0: the board the app opens on. It is not one of the 52 — the booklet
 * describes its contents as additional to the four patterns printed on the
 * frame — but it is where every game here starts, so it is listed first.
 */
export const OPENING_PATTERN = {
  number: 0,
  name: 'Opening board',
  state: provisionalStart(),
};

/** Everything that can be picked as a target or a starting board, in order. */
export const ALL_PATTERNS = [OPENING_PATTERN, ...BOOKLET_PATTERNS];

export const patternByNumber = (n) => ALL_PATTERNS.find((p) => p.number === n);

/**
 * Filter patterns by a comma-separated list. Each item can be a number ("4"),
 * a range ("12-15"), or a board code — either the 32 hole digits alone or with
 * the "|" and slider digits — which matches by marble arrangement. Blank shows
 * everything; items that match nothing are returned so the view can say so.
 */
export function filterPatterns(text) {
  const items = String(text).split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) return { patterns: ALL_PATTERNS, unmatched: [] };
  const wanted = new Set();
  const unmatched = [];
  for (const item of items) {
    const range = item.match(/^(\d+)\s*-\s*(\d+)$/);
    if (/^\d{1,2}$/.test(item)) {
      const p = patternByNumber(Number(item));
      if (p) wanted.add(p); else unmatched.push(item);
    } else if (range) {
      const [lo, hi] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      const hits = ALL_PATTERNS.filter((p) => p.number >= lo && p.number <= hi);
      if (hits.length) hits.forEach((p) => wanted.add(p)); else unmatched.push(item);
    } else if (/^[012]{32}(\|[01]{8})?$/.test(item)) {
      const cells = item.slice(0, 32);
      const hits = ALL_PATTERNS.filter((p) => p.state.cells.join('') === cells);
      if (hits.length) hits.forEach((p) => wanted.add(p)); else unmatched.push(item);
    } else {
      unmatched.push(item);
    }
  }
  return { patterns: ALL_PATTERNS.filter((p) => wanted.has(p)), unmatched };
}

/**
 * Where each marble sits on the 9-column face, per row.
 * Returns an array of Maps from column to marble value.
 */
export function marbleMap(state) {
  const out = [];
  for (let row = 0; row < state.board.rows; row++) {
    const line = new Map();
    for (let slot = 0; slot < state.board.slots; slot++) {
      const value = state.cells[row * state.board.slots + slot];
      if (value !== EMPTY) line.set(columnOf(row, slot, state.shifts[row]), value);
    }
    out.push(line);
  }
  return out;
}

/**
 * Compare a board against a target as the eye would: marble by marble across
 * the board face. `wrongCells` indexes into `current.cells`, for highlighting.
 */
export function compare(current, target) {
  const mine = marbleMap(current);
  const theirs = marbleMap(target);
  const wrongCells = new Set();
  let missing = 0;

  for (let row = 0; row < current.board.rows; row++) {
    for (let slot = 0; slot < current.board.slots; slot++) {
      const index = row * current.board.slots + slot;
      const value = current.cells[index];
      if (value === EMPTY) continue;
      const column = columnOf(row, slot, current.shifts[row]);
      if (theirs[row].get(column) !== value) wrongCells.add(index);
    }
    for (const [column, value] of theirs[row]) {
      if (mine[row].get(column) !== value) missing++;
    }
  }
  return { wrongCells, misplaced: wrongCells.size, missing, solved: missing === 0 };
}

export const patternCode = (pattern) => stateKey(pattern.state);
