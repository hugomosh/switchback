/**
 * Switch Back (Binary Arts #6400, 1993) — pure state/move engine.
 *
 * No rendering, no DOM, no I/O. Runs unchanged in Node (headless analysis,
 * M5) and in the browser (M3 UI). Nothing in this file may import a renderer.
 *
 * ---------------------------------------------------------------------------
 * COORDINATE MODEL
 * ---------------------------------------------------------------------------
 * The physical board reads as 9 columns x 8 rows, but only 32 cells are ever
 * active. Those 32 cells are exactly 8 rows x 4 hole-slots, so slot space is
 * the natural state representation and column space is presentation.
 *
 *   column(row, slot) = 2*slot + typeOffset(row) + shift(row)
 *   typeOffset = 0 for type A (even rows), 1 for type B (odd rows)
 *   shift      = 0 at rest, 1 when the slider bar is pushed right one column
 *
 * Consequences that the engine relies on:
 *   - A slide translates a row's four holes as a rigid unit, so a marble's
 *     SLOT index never changes on a slide. Slides cannot permute marbles
 *     within a row; they only rewire which vertical gates are open.
 *   - A tilt moves a marble between rows through a shared column, so a
 *     marble's COLUMN never changes on a tilt.
 *   - Between two vertically adjacent rows there are exactly 0, 3, or 4 gates:
 *       A shifted + B at rest  -> 4 gates, slot j <-> slot j
 *       A at rest + B shifted  -> 3 gates, A's slot j <-> B's slot j-1
 *                                 (A slot 0 = column 0 and B slot 3 = column 8
 *                                  are unconnected: the "edges for shelter")
 *       shifts equal           -> 0 gates
 *     The engine derives this by matching columns rather than hardcoding it,
 *     so the rule and the geometry can't drift apart.
 */

export const EMPTY = 0;
export const ORANGE = 1;
export const GREEN = 2;

export const STANDARD_BOARD = Object.freeze({ rows: 8, slots: 4 });

/** Number of presentation columns for a board. */
export const columnCount = (board) => 2 * board.slots + 1;

/** Type A rows are even (0-indexed); type B rows are odd. */
export const rowType = (row) => (row % 2 === 0 ? 'A' : 'B');

/** Presentation column of a hole, given its row's shift state. */
export const columnOf = (row, slot, shift) => 2 * slot + (row % 2) + shift;

const cellIndex = (board, row, slot) => row * board.slots + slot;

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

/**
 * Build a validated, deeply frozen state. Throws on anything structurally
 * illegal, so an invalid state object cannot exist to be passed around.
 *
 * `cells` is row-major over slots: index = row * slots + slot. A value of 0 is
 * an empty hole; 1 and 2 are the orange and green marbles of the retail
 * puzzle. Higher values are legal and are used by the reachability analysis to
 * give every marble a distinct label; the UI only ever produces 0, 1 and 2.
 * `shifts` is one 0/1 per row.
 */
export function makeState(cells, shifts, board = STANDARD_BOARD) {
  const size = board.rows * board.slots;
  if (!Array.isArray(cells) || cells.length !== size) {
    throw new Error(`cells must have length ${size}, got ${cells?.length}`);
  }
  if (!Array.isArray(shifts) || shifts.length !== board.rows) {
    throw new Error(`shifts must have length ${board.rows}, got ${shifts?.length}`);
  }
  for (const c of cells) {
    if (!Number.isInteger(c) || c < 0) {
      throw new Error(`illegal cell value: ${c}`);
    }
  }
  for (const s of shifts) {
    if (s !== 0 && s !== 1) throw new Error(`illegal shift value: ${s}`);
  }
  return Object.freeze({
    board: Object.freeze({ ...board }),
    cells: Object.freeze([...cells]),
    shifts: Object.freeze([...shifts]),
  });
}

export const cellAt = (state, row, slot) =>
  state.cells[cellIndex(state.board, row, slot)];

/** Canonical string key for BFS/DFS visited sets (M5). */
export const stateKey = (state) => state.cells.join('') + '|' + state.shifts.join('');

/** Marble counts, for invariant checks. */
export function census(state) {
  let orange = 0, green = 0, empty = 0;
  for (const c of state.cells) {
    if (c === ORANGE) orange++;
    else if (c === GREEN) green++;
    else if (c === EMPTY) empty++;
  }
  return { orange, green, empty };
}

/** Occupancy pattern only: which holes hold something, ignoring which marble. */
export const occupancyKey = (state) =>
  state.cells.map((c) => (c === EMPTY ? '0' : '1')).join('') + '|' + state.shifts.join('');

/** Replace every marble with a distinct label, for labelled-permutation analysis. */
export function labelMarbles(state) {
  let next = 1;
  const cells = state.cells.map((c) => (c === EMPTY ? EMPTY : next++));
  return makeState(cells, [...state.shifts], state.board);
}

/** True for the retail puzzle: 12 orange, 12 green, 8 empty on an 8x4 board. */
export function isStandardPuzzle(state) {
  const { orange, green, empty } = census(state);
  return state.board.rows === 8 && state.board.slots === 4 &&
    orange === 12 && green === 12 && empty === 8;
}

/**
 * PROVISIONAL start state: 12 orange in rows 0-2, 12 green in rows 5-7,
 * rows 3-4 empty, all sliders at rest. Replace once the booklet is scanned —
 * the real start is whatever the four frame-printed patterns imply.
 */
export function provisionalStart() {
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let slot = 0; slot < 4; slot++) {
      cells.push(row <= 2 ? ORANGE : row >= 5 ? GREEN : EMPTY);
    }
  }
  return makeState(cells, [0, 0, 0, 0, 0, 0, 0, 0]);
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * Gate map from `fromRow` to `toRow` (which must be vertically adjacent).
 * Returns an array of length `slots`: for each slot in `fromRow`, the slot in
 * `toRow` sharing its column, or -1 if that hole has no partner (a shelter).
 */
export function gateMap(state, fromRow, toRow) {
  const { board } = state;
  const out = new Array(board.slots).fill(-1);
  if (toRow < 0 || toRow >= board.rows) return out;
  if (Math.abs(toRow - fromRow) !== 1) {
    throw new Error('gateMap requires vertically adjacent rows');
  }
  for (let j = 0; j < board.slots; j++) {
    const col = columnOf(fromRow, j, state.shifts[fromRow]);
    for (let k = 0; k < board.slots; k++) {
      if (columnOf(toRow, k, state.shifts[toRow]) === col) {
        out[j] = k;
        break;
      }
    }
  }
  return out;
}

/** Open gate count between a row and the one below it. Always 0, 3, or 4. */
export const openGateCount = (state, row) =>
  gateMap(state, row, row + 1).filter((k) => k >= 0).length;

/**
 * A hole is sheltered when no tilt can move whatever sits in it: it has no
 * partner above and none below. This is the "use the edges for shelter"
 * mechanic from the instructions, and it is the player's only way to hold a
 * marble still through a gravity resolution.
 */
export function isSheltered(state, row, slot) {
  const up = gateMap(state, row, row - 1)[slot];
  const down = gateMap(state, row, row + 1)[slot];
  return up < 0 && down < 0;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * Slide a row's bar. Always legal: the bar carries its own four holes and
 * their contents as a rigid unit, so there is nothing external to collide
 * with. Marble slot indices are unchanged; only the row's shift flips.
 *
 * `to` may be given explicitly (0 = rest, 1 = shifted); omitted, it toggles.
 */
export function slide(state, row, to) {
  if (!Number.isInteger(row) || row < 0 || row >= state.board.rows) {
    throw new Error(`no such row: ${row}`);
  }
  const next = to === undefined ? 1 - state.shifts[row] : to;
  if (next !== 0 && next !== 1) throw new Error(`illegal shift target: ${to}`);
  const shifts = [...state.shifts];
  shifts[row] = next;
  return makeState([...state.cells], shifts, state.board);
}

/**
 * Tilt the whole tray. Gravity resolves on every open channel at once: each
 * marble falls as far as consecutive open-gate + empty cells allow, stopping
 * at a closed gate, an occupied cell, or the board edge. There is no way to
 * nominate which marble moves — that is the whole difficulty of the puzzle.
 *
 * `direction` is 'up' (toward row 0), 'down' (toward the last row), or
 * 'neutral' (a true no-op, returning the same state object).
 *
 * Resolution is order-independent: each target hole is fed by at most one
 * source hole, so no two marbles ever contend for the same cell. Processing
 * rows from the far end inward lets every cascade settle in a single pass.
 */
/**
 * Tilt, and report which marble ended up where.
 *
 * Returns the new state plus one entry per marble that moved, as flat cell
 * indices. The renderer needs this to animate a marble from where it was to
 * where it landed; deriving it in the UI would mean a second copy of the
 * gravity rules, which is exactly what this module exists to prevent.
 */
export function resolve(state, direction) {
  if (direction === 'neutral') return { state, moved: [] };
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`illegal tilt direction: ${direction}`);
  }
  const { board } = state;
  const origin = state.cells.map((_, i) => i);   // where the marble in cell i started
  const down = direction === 'down';
  const step = down ? 1 : -1;
  const cells = [...state.cells];

  const order = [];
  if (down) for (let r = board.rows - 2; r >= 0; r--) order.push(r);
  else for (let r = 1; r < board.rows; r++) order.push(r);

  for (const startRow of order) {
    for (let startSlot = 0; startSlot < board.slots; startSlot++) {
      let row = startRow, slot = startSlot;
      if (cells[cellIndex(board, row, slot)] === EMPTY) continue;
      for (;;) {
        const nextRow = row + step;
        if (nextRow < 0 || nextRow >= board.rows) break;
        const nextSlot = gateMap(state, row, nextRow)[slot];
        if (nextSlot < 0) break;
        const from = cellIndex(board, row, slot);
        const to = cellIndex(board, nextRow, nextSlot);
        if (cells[to] !== EMPTY) break;
        cells[to] = cells[from];
        cells[from] = EMPTY;
        origin[to] = origin[from];
        origin[from] = -1;
        row = nextRow;
        slot = nextSlot;
      }
    }
  }
  const moved = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY && origin[i] !== i) moved.push({ from: origin[i], to: i });
  }
  return { state: makeState(cells, [...state.shifts], board), moved };
}

/** The tilt itself, for callers that do not need to know what moved. */
export function tilt(state, direction) {
  return resolve(state, direction).state;
}

// ---------------------------------------------------------------------------
// Move enumeration (generators for M5)
// ---------------------------------------------------------------------------

/** Every move available from a state. Slides are always legal; neutral is omitted. */
export function legalMoves(state) {
  const moves = [];
  for (let row = 0; row < state.board.rows; row++) moves.push({ type: 'slide', row });
  moves.push({ type: 'tilt', direction: 'up' });
  moves.push({ type: 'tilt', direction: 'down' });
  return moves;
}

export function applyMove(state, move) {
  if (move.type === 'slide') return slide(state, move.row, move.to);
  if (move.type === 'tilt') return tilt(state, move.direction);
  throw new Error(`unknown move type: ${move.type}`);
}

// ---------------------------------------------------------------------------
// Presentation projection (data only — the UI reads this, the engine doesn't)
// ---------------------------------------------------------------------------

/**
 * Project slot space onto the 9-wide column grid for rendering.
 * Returns rows x columns of either null (inactive frame) or
 * { slot, value } for an active hole.
 */
export function columnGrid(state) {
  const width = columnCount(state.board);
  const grid = [];
  for (let row = 0; row < state.board.rows; row++) {
    const line = new Array(width).fill(null);
    for (let slot = 0; slot < state.board.slots; slot++) {
      const col = columnOf(row, slot, state.shifts[row]);
      line[col] = { slot, value: cellAt(state, row, slot) };
    }
    grid.push(line);
  }
  return grid;
}
