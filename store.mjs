/**
 * App state for the SPA. Holds the move history, the chosen target pattern and
 * display options; knows nothing about the rules.
 *
 * The current board is mirrored into the URL so a position can be shared or
 * reloaded, which is how M4 validation runs will be recorded.
 */

import { makeState, stateKey, provisionalStart, applyMove } from './engine.mjs';

const listeners = new Set();

export const app = {
  // Each entry carries its own move count, so a reset can sit in the history
  // as an ordinary step: undo walks back past it instead of losing the board.
  history: [{ state: provisionalStart(), label: '—', move: null, moves: 0 }],
  target: null,        // { name, code } or null
  showShelters: true,
  palette: '1993',   // '1993' purple and cyan, '1998' orange and green
  theme: 'auto',     // 'auto' follows the system, or 'light' / 'dark'
  look: 'tray',
  view: 'play',
  showTarget: true,  // the small target preview under the play board      // which tab is showing; views change it to navigate      // see LOOKS in view-play.mjs
  captured: [],        // patterns captured this session
};

const top = () => app.history[app.history.length - 1];
export const board = () => top().state;
export const moveCount = () => top().moves;
export const lastMove = () => top().label;
export const canUndo = () => app.history.length > 1;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(mutate) {
  mutate(app);
  for (const fn of listeners) fn();
}

export function commit(next, label, move = null) {
  update((s) => {
    s.history.push({ state: next, label, move, moves: moveCount() + 1 });
  });
}

// --- replay codes ----------------------------------------------------------
// A game is its starting board plus the moves played: slides are 1-8, tilts are
// U and D. Short enough to paste into a message, and it replays exactly because
// the moves run back through the same engine.

const encodeMove = (m) => (m.type === 'slide' ? String(m.row + 1) : m.direction === 'up' ? 'U' : 'D');

const decodeMove = (ch) => {
  if (ch >= '1' && ch <= '8') return { type: 'slide', row: Number(ch) - 1 };
  if (ch === 'U' || ch === 'D') return { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' };
  throw new Error(`"${ch}" is not a move — moves are 1 to 8 for slides, U and D for tilts.`);
};

/** Index of the position the current run started from (the last reset). */
function runStart() {
  let i = app.history.length - 1;
  while (i > 0 && app.history[i].moves !== 0) i--;
  return i;
}

export function replayCode() {
  const from = runStart();
  const played = app.history.slice(from + 1).filter((e) => e.move);
  const code = stateKey(app.history[from].state);
  return played.length ? `${code}~${played.map((e) => encodeMove(e.move)).join('')}` : code;
}

/** Load a board code or a full replay, rebuilding the history so undo still works. */
export function load(raw, boardShape) {
  const [boardPart, movePart] = String(raw).trim().split('~');
  const start = parseCode(boardPart, boardShape);
  if (!movePart) {
    resetTo(start, 'loaded a board code');
    return { moves: 0 };
  }
  const moves = [...movePart.replace(/\s+/g, '')].map(decodeMove);
  const entries = [{ state: start, label: 'start of replay', move: null, moves: 0 }];
  let state = start;
  moves.forEach((move, i) => {
    state = applyMove(state, move);
    entries.push({ state, label: describeMove(move), move, moves: i + 1 });
  });
  update((s) => { s.history = s.history.concat(entries); });
  return { moves: moves.length };
}

const describeMove = (m) =>
  m.type === 'slide' ? `slide row ${m.row + 1}` : `tilt ${m.direction}`;

/** Re-label the current position without adding a step (for moves that did nothing). */
export function note(label) {
  update(() => { top().label = label; });
}

export function undo() {
  if (app.history.length === 1) return;
  update((s) => { s.history.pop(); });
}

/** Put a new board on the history rather than replacing it, so undo still works. */
export function resetTo(state, label = 'new board') {
  update((s) => {
    s.history.push({ state, label, move: null, moves: 0 });
  });
}

/**
 * Parse a board code of the form `<cell digits>|<shift digits>`.
 * Throws with a message meant to be shown to the person, not logged.
 */
export function parseCode(raw, boardShape) {
  const [cellPart, shiftPart] = String(raw).trim().split('|');
  if (!cellPart || !shiftPart) {
    throw new Error('A board code looks like 32 hole digits, a pipe, then 8 slider digits.');
  }
  const cells = [...cellPart].map(Number);
  const shifts = [...shiftPart].map(Number);
  if (cells.some(Number.isNaN) || shifts.some(Number.isNaN)) {
    throw new Error('Board codes contain digits only.');
  }
  return makeState(cells, shifts, boardShape);
}

export const codeOf = stateKey;
