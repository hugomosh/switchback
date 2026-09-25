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
 *
 * Bars take time to move, as real ones do, and that is what makes the physical
 * tricks possible: slide a bar while marbles are streaming through it and it
 * catches whichever one is in it at that moment, leaving the rest behind.
 *
 *  - A bar's position is continuous, from 0 (rest) to 1 (pushed one column).
 *    It moves toward its target at a finite speed, or follows a finger.
 *  - A marble sitting in a bar's hole rides along with the bar.
 *  - Marbles cross between two rows only through holes that line up exactly:
 *    both bars must be settled, not part-way. A marble can never be inside a
 *    block, because it can only enter a row where a hole is.
 *  - A bar cannot move while a marble lies across one of its edges — the
 *    marble is in two bars at once and physically locks them together.
 *
 * Pure: no rendering, no DOM, no time source. The 3D view drives it.
 */
import { EMPTY, makeState, columnOf } from './engine.mjs';

/** Rows per second squared, with the tray standing on its edge. */
export const GRAVITY = 55;
/** How far off a hole's centre a marble still counts as sitting in it. */
export const SNAP = 0.02;
/** Columns per second: a tapped bar crosses in about a seventh of a second. */
export const BAR_SPEED = 7;
/** A bar held this close to an end stop clicks into it, as the real detent does. */
const DETENT = 0.04;
/** A marble at rest stays put below this share of full gravity (rolling friction). */
const STICTION = 0.03;
/** Velocity lost per second to rolling resistance. */
const DAMPING = 0.6;

/** Build a world from an engine state: every marble sits in its hole, at rest. */
export function createWorld(state) {
  const { rows, slots } = state.board;
  const marbles = [];
  state.cells.forEach((value, i) => {
    if (value === EMPTY) return;
    const row = Math.floor(i / slots);
    const slot = i % slots;
    marbles.push({ id: marbles.length, value, x: columnOf(row, slot, state.shifts[row]), y: row, v: 0 });
  });
  return {
    rows, slots, board: state.board,
    bar: [...state.shifts],          // where each bar actually is
    target: [...state.shifts],       // where it is heading
    marbles,
  };
}

/** A deep copy, for undo. */
export function cloneWorld(world) {
  return {
    ...world,
    bar: [...world.bar],
    target: [...world.target],
    marbles: world.marbles.map((m) => ({ ...m })),
  };
}

/** The bar's shift if it is at an end stop, or null while it is part-way across. */
function settled(world, row) {
  const b = world.bar[row];
  return b === 0 || b === 1 ? b : null;
}

/** True if `row` has a hole in `column` that a marble could pass through. */
function openAt(world, row, column) {
  if (row < 0 || row >= world.rows) return false;
  const shift = settled(world, row);
  if (shift === null) return false;
  const twice = column - (row % 2) - shift;
  return twice >= 0 && twice % 2 === 0 && twice / 2 < world.slots;
}

const seatedIn = (m, row) => Math.abs(m.y - row) <= SNAP;

/**
 * The run of rows a marble can travel along: every consecutive row, from the
 * one it is in, whose hole lies in the same column. A marble whose own bar is
 * moving cannot leave it.
 */
function range(world, m) {
  let lo = Math.floor(m.y + 1e-9);
  let hi = Math.ceil(m.y - 1e-9);
  const column = Math.round(m.x);
  if (Math.abs(m.x - column) > 1e-6 || !openAt(world, lo, column) || !openAt(world, hi, column)) {
    return [m.y, m.y];
  }
  while (openAt(world, lo - 1, column)) lo--;
  while (openAt(world, hi + 1, column)) hi++;
  return [lo, hi];
}

/** True when a marble lies across the boundary between `row` and a neighbour. */
function straddles(m, row) {
  const d = Math.abs(m.y - row);
  return d > SNAP && d < 1 - SNAP;
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

const jammed = (world, row) => world.marbles.some((m) => straddles(m, row));

/**
 * Push a bar to its other end stop. Refused, returning false, while a marble
 * locks it. The bar then travels there over the next few steps.
 */
export function trySlide(world, row) {
  if (jammed(world, row)) return false;
  world.target[row] = Math.round(world.target[row]) === 0 ? 1 : 0;
  return true;
}

/**
 * Hold a bar part-way, as a finger does: `position` from 0 to 1. Returns false
 * if the bar is locked by a marble. Call `releaseBar` when the finger lifts.
 */
export function holdBar(world, row, position) {
  if (jammed(world, row)) return false;
  let p = Math.max(0, Math.min(1, position));
  if (p < DETENT) p = 0;
  if (p > 1 - DETENT) p = 1;
  world.target[row] = p;
  return true;
}

/** Let go of a held bar: it springs to whichever end stop is nearer. */
export function releaseBar(world, row) {
  world.target[row] = Math.round(world.bar[row]);
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
  for (let k = 0; k < n; k++) {
    moveBars(world, h);
    moveMarbles(world, h, accel, hold);
  }
}

function moveBars(world, h) {
  for (let row = 0; row < world.rows; row++) {
    const gap = world.target[row] - world.bar[row];
    if (gap === 0 || jammed(world, row)) continue;
    const move = Math.sign(gap) * Math.min(Math.abs(gap), BAR_SPEED * h);
    world.bar[row] += move;
    if (Math.abs(world.target[row] - world.bar[row]) < 1e-9) world.bar[row] = world.target[row];
    // Anything in the bar's holes goes with it, and is caught there.
    for (const m of world.marbles) {
      if (seatedIn(m, row)) { m.x += move; m.y = row; m.v = 0; }
    }
  }
  for (const m of world.marbles) {
    const r = Math.round(m.x);
    if (Math.abs(m.x - r) < 1e-9) m.x = r;
  }
}

function moveMarbles(world, h, accel, hold) {
  for (const m of world.marbles) {
    // The run it may travel, from where it is now, before it moves. Kept for
    // the collision pass: nothing may push a marble outside it.
    [m.lo, m.hi] = range(world, m);
    if (m.v === 0 && Math.abs(accel) <= hold) continue;   // friction holds it
    m.v += accel * h;
    m.v *= Math.exp(-DAMPING * h);
    m.y += m.v * h;
    if (m.y <= m.lo) { m.y = m.lo; if (m.v < 0) m.v = 0; }
    if (m.y >= m.hi) { m.y = m.hi; if (m.v > 0) m.v = 0; }
  }
  // Marbles in one column cannot pass one another. Sweep against the pull, so
  // each marble comes to rest on the one already settled beyond it. A marble
  // still carrying momentum against the pull can run into one that has nowhere
  // to go; then it is the one pushed back, never the other into a block.
  const byColumn = new Map();
  for (const m of world.marbles) {
    const key = Math.round(m.x);
    if (Math.abs(m.x - key) > 1e-6) continue;   // riding a moving bar: no column
    if (!byColumn.has(key)) byColumn.set(key, []);
    byColumn.get(key).push(m);
  }
  for (const list of byColumn.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 2; pass++) {
      if (accel >= 0) {
        for (let i = list.length - 2; i >= 0; i--) separate(list[i], list[i + 1], 1);
      } else {
        for (let i = 1; i < list.length; i++) separate(list[i - 1], list[i], -1);
      }
    }
  }
  for (const m of world.marbles) {
    const r = Math.round(m.y);
    if (m.v === 0 && Math.abs(m.y - r) < 1e-6) m.y = r;
  }
}

/**
 * Keep `upper` and `lower` (upper has the smaller y) a marble apart. `pull` is
 * +1 when gravity points to higher rows: then the upper marble gives way,
 * unless it cannot, and the reverse when it points the other way.
 */
function separate(upper, lower, pull) {
  if (upper.y <= lower.y - 1) return;
  const v = Math.min(upper.v, lower.v) * (pull > 0 ? 1 : 0) + Math.max(upper.v, lower.v) * (pull > 0 ? 0 : 1);
  if (pull > 0) {
    upper.y = lower.y - 1;
    if (upper.y < upper.lo) { upper.y = upper.lo; lower.y = upper.y + 1; }
  } else {
    lower.y = upper.y + 1;
    if (lower.y > lower.hi) { lower.y = lower.hi; upper.y = lower.y - 1; }
  }
  upper.v = lower.v = v;
}

/** True when nothing is moving: no marble rolling, no bar travelling. */
export const atRest = (world) => world.marbles.every((m) => m.v === 0)
  && world.bar.every((b, r) => b === world.target[r]);

/**
 * The engine board this world is showing, or null while any marble is between
 * two rows or any bar is part-way. Pass it to the engine and play on exactly.
 */
export function toState(world) {
  const shifts = [];
  for (let row = 0; row < world.rows; row++) {
    const s = settled(world, row);
    if (s === null) return null;
    shifts.push(s);
  }
  const cells = new Array(world.rows * world.slots).fill(EMPTY);
  for (const m of world.marbles) {
    const row = Math.round(m.y);
    if (Math.abs(m.y - row) > SNAP) return null;
    const twice = Math.round(m.x) - (row % 2) - shifts[row];
    if (twice < 0 || twice % 2) return null;
    cells[row * world.slots + twice / 2] = m.value;
  }
  return makeState(cells, shifts, world.board);
}

/** Let the world run at a fixed angle until everything stops (or `limit` seconds). */
export function settle(world, angle, limit = 10) {
  for (let t = 0; t < limit; t += 1 / 60) {
    step(world, 1 / 60, angle);
    if (atRest(world)) return true;
  }
  return false;
}

/**
 * Gravity along the rows for a tray seen on screen: `gravity` is the pull in
 * screen space (x right, y up, each component the sine of the tilt that way)
 * and `rowAxis` the on-screen direction of increasing row. Returns the tilt
 * angle to feed `step`, so tilting a phone rolls marbles toward whichever edge
 * of the screen went down, however the tray has been turned on screen.
 */
export function tiltAlong(gravity, rowAxis) {
  const len = Math.hypot(rowAxis.x, rowAxis.y) || 1;
  const along = (gravity.x * rowAxis.x + gravity.y * rowAxis.y) / len;
  return Math.asin(Math.max(-1, Math.min(1, along)));
}
