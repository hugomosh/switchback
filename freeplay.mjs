/**
 * Free play: the board with real gravity instead of the engine's instant tilt.
 *
 * The engine resolves a tilt in one step and only ever shows marbles at rest in
 * a hole. Here the tray can be held at any angle, marbles accelerate, stack on
 * one another and can be caught halfway between two rows. When everything has
 * come to rest in holes, the position is an ordinary engine board again, and
 * tests check that a tilt played this way ends exactly where the engine's does.
 *
 * Geometry is the engine's, in the same units: one row or one column is 1, and
 * a marble is exactly one row tall, so marbles in one column stack a row apart.
 * A marble keeps its column while it moves between rows, as on the tray; the
 * only thing that changes a column is sliding the bar the marble sits in.
 *
 * Pure: no rendering, no DOM, no time source. The 3D view drives it.
 */
import { EMPTY, makeState, columnOf } from './engine.mjs';

/** Rows per second squared, with the tray standing on its edge. */
export const GRAVITY = 55;
/** How far off a hole's centre a marble still counts as sitting in it. */
export const SNAP = 0.02;
/** A marble at rest stays put below this share of full gravity (rolling friction). */
const STICTION = 0.03;
/** Velocity lost per second to rolling resistance. */
const DAMPING = 0.6;

/** Slot of `row` whose hole sits in `column`, or -1. */
function slotIn(world, row, column) {
  if (row < 0 || row >= world.rows) return -1;
  const twice = column - (row % 2) - world.shifts[row];
  if (twice < 0 || twice % 2) return -1;
  const slot = twice / 2;
  return slot < world.slots ? slot : -1;
}

/** Build a world from an engine state: every marble sits in its hole, at rest. */
export function createWorld(state) {
  const { rows, slots } = state.board;
  const marbles = [];
  state.cells.forEach((value, i) => {
    if (value === EMPTY) return;
    const row = Math.floor(i / slots);
    const slot = i % slots;
    marbles.push({ id: marbles.length, value, column: columnOf(row, slot, state.shifts[row]), y: row, v: 0 });
  });
  return { rows, slots, board: state.board, shifts: [...state.shifts], marbles };
}

/**
 * The run of rows a marble can travel along in its column: every consecutive
 * row, from the one it is in, whose hole lies in the same column.
 */
function range(world, m) {
  let lo = Math.floor(m.y + 1e-9);
  let hi = Math.ceil(m.y - 1e-9);
  while (slotIn(world, lo - 1, m.column) >= 0) lo--;
  while (slotIn(world, hi + 1, m.column) >= 0) hi++;
  return [lo, hi];
}

/**
 * Advance the world by `dt` seconds with the tray tilted by `angle` radians.
 * Positive tilts toward the last row (the engine's "down"), negative toward
 * row 0. Substeps keep a fast marble from tunnelling through its neighbour.
 */
export function step(world, dt, angle) {
  const accel = GRAVITY * Math.sin(angle);
  const hold = STICTION * GRAVITY * Math.cos(angle);
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let k = 0; k < n; k++) substep(world, h, accel, hold);
}

function substep(world, h, accel, hold) {
  const byColumn = new Map();
  for (const m of world.marbles) {
    if (m.v === 0 && Math.abs(accel) <= hold) continue;   // friction holds it
    const [lo, hi] = range(world, m);   // from where it is now, before it moves
    m.v += accel * h;
    m.v *= Math.exp(-DAMPING * h);
    m.y += m.v * h;
    if (m.y <= lo) { m.y = lo; if (m.v < 0) m.v = 0; }
    if (m.y >= hi) { m.y = hi; if (m.v > 0) m.v = 0; }
  }
  for (const m of world.marbles) {
    if (!byColumn.has(m.column)) byColumn.set(m.column, []);
    byColumn.get(m.column).push(m);
  }
  // Marbles in one column cannot pass one another. Sweep against the pull, so
  // each marble comes to rest on the one already settled beyond it.
  for (const list of byColumn.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.y - b.y);
    if (accel >= 0) {
      for (let i = list.length - 2; i >= 0; i--) {
        const a = list[i], b = list[i + 1];
        if (a.y > b.y - 1) { a.y = b.y - 1; if (a.v > b.v) a.v = b.v; }
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        const a = list[i], b = list[i - 1];
        if (a.y < b.y + 1) { a.y = b.y + 1; if (a.v < b.v) a.v = b.v; }
      }
    }
  }
  for (const m of world.marbles) {
    const r = Math.round(m.y);
    if (m.v === 0 && Math.abs(m.y - r) < 1e-6) m.y = r;
  }
}

/** True when a marble lies across the boundary between `row` and a neighbour. */
function straddles(m, row) {
  const d = m.y - row;
  return Math.abs(d) > SNAP && Math.abs(d) < 1 - SNAP;
}

/** Rows whose bar cannot move right now, because a marble is half in it. */
export function jammedRows(world) {
  const out = new Set();
  for (const m of world.marbles) {
    const r = Math.floor(m.y);
    if (m.y - r > SNAP && m.y - r < 1 - SNAP) { out.add(r); out.add(r + 1); }
  }
  return out;
}

/**
 * Slide a bar. Refused, returning false, while any marble lies across one of
 * its edges — the real bar is physically blocked. A marble sitting in the bar's
 * hole rides along with it.
 */
export function trySlide(world, row) {
  if (world.marbles.some((m) => straddles(m, row))) return false;
  const dir = world.shifts[row] === 0 ? 1 : -1;
  world.shifts[row] += dir;
  for (const m of world.marbles) {
    if (Math.abs(m.y - row) <= SNAP) { m.y = row; m.column += dir; }
  }
  return true;
}

/** True when nothing is moving. */
export const atRest = (world) => world.marbles.every((m) => m.v === 0);

/**
 * The engine board this world is showing, or null while any marble is
 * between two rows. Pass it to the engine and play on exactly.
 */
export function toState(world) {
  const cells = new Array(world.rows * world.slots).fill(EMPTY);
  for (const m of world.marbles) {
    const row = Math.round(m.y);
    if (Math.abs(m.y - row) > SNAP) return null;
    const slot = slotIn(world, row, m.column);
    if (slot < 0) return null;
    cells[row * world.slots + slot] = m.value;
  }
  return makeState(cells, [...world.shifts], world.board);
}

/** Let the world run at a fixed angle until everything stops (or `limit` seconds). */
export function settle(world, angle, limit = 10) {
  for (let t = 0; t < limit; t += 1 / 60) {
    step(world, 1 / 60, angle);
    if (atRest(world)) return true;
  }
  return false;
}
