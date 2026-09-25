/**
 * Play view — the faithful board. The only inputs are eight sliders and a
 * tilt direction; there is deliberately no way to touch an individual marble.
 */

import { resolve, slide, stateKey, census, provisionalStart } from './engine.mjs';
import { boardElement } from './board.mjs';
import { app, board, moveCount, lastMove, canUndo, commit, undo, note, resetTo, replayCode, load, update } from './store.mjs';
import { compare } from './patterns.mjs';

let armed = false;   // the reset button is waiting for confirmation


const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function button(label, onClick, className = '') {
  const node = el('button', className, label);
  node.addEventListener('click', onClick);
  return node;
}

// --- motion ----------------------------------------------------------------
// The view is rebuilt from scratch on every change, so nothing transitions on
// its own. The distances are worked out from the board instead of measured
// before and after: a tilt never changes a marble's column, so a marble only
// ever moves straight up or down, and a slide only ever moves a bar sideways
// by one column.
//
// Marbles snap to the middle of a well rather than settling on a floor, which
// is not how gravity works but is how this board reads.

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const EASE = 'cubic-bezier(0.22, 0.78, 0.28, 1)';

/** Distance from one row to the next, including any gap between rows. */
function rowPitch() {
  const bars = document.querySelectorAll('.tray .bar[data-row]');
  if (bars.length < 2) return 0;
  return bars[1].getBoundingClientRect().top - bars[0].getBoundingClientRect().top;
}

/** Width of one column: a well is exactly one column wide. */
function columnWidth() {
  const well = document.querySelector('.tray .hole');
  return well ? well.getBoundingClientRect().width : 0;
}

function play(element, from, duration) {
  if (!element || !element.animate) return;
  element.animate([{ transform: from }, { transform: 'none' }], { duration, easing: EASE });
}

/** Each marble drifts from the row it left to the centre of the well it landed in. */
function animateTilt(moved, slots) {
  if (reducedMotion() || !moved.length) return;
  const pitch = rowPitch();
  if (!pitch) return;
  for (const { from, to } of moved) {
    const dy = (Math.floor(from / slots) - Math.floor(to / slots)) * pitch;
    if (!dy) continue;
    play(document.querySelector(`.tray .hole[data-cell="${to}"] > .marble`),
      `translateY(${dy}px)`, 320);
  }
}

/** The bar carries its four marbles across as one piece. */
function animateSlide(row, columns) {
  if (reducedMotion()) return;
  const bar = document.querySelector(`.tray .bar[data-row="${row}"]`);
  const width = columnWidth();
  if (!bar || !width || !bar.animate) return;
  const settled = bar.style.transform;
  bar.animate(
    [{ transform: `${settled} translateX(${-columns * width}px)` }, { transform: settled }],
    { duration: 220, easing: EASE },
  );
}

function doTilt(direction) {
  const before = board();
  const { state: after, moved } = resolve(before, direction);
  if (stateKey(after) === stateKey(before)) {
    note(`tilt ${direction} — nothing could move`);
    return;
  }
  commit(after, `tilt ${direction}`, { type: 'tilt', direction });
  animateTilt(moved, before.board.slots);
}

function doSlide(row) {
  const before = board();
  const columns = before.shifts[row] === 0 ? 1 : -1;
  commit(slide(before, row), `slide row ${row + 1}`, { type: 'slide', row });
  animateSlide(row, columns);
}

export function render() {
  const view = el('div', 'view');
  const current = board();

  const match = app.target ? compare(current, app.target.state) : null;

  view.appendChild(boardElement(current, {
    onSlide: doSlide,
    showShelters: app.showShelters,
    wrongCells: match ? match.wrongCells : null,
  }));

  const tilts = el('div', 'tilts');
  // No neutral button: a level tray does nothing, so it was never a move.
  tilts.append(
    button('Tilt up', () => doTilt('up')),
    button('Tilt down', () => doTilt('down')),
  );
  view.appendChild(tilts);

  view.appendChild(el('p', 'note',
    'Tilting resolves every open channel at once. Teal marks show where a marble '
    + 'can cross between rows; a ringed marble is sheltered, and no tilt can shift it.'));

  const minor = el('div', 'minor');
  const undoBtn = button('Undo', undo);
  undoBtn.disabled = !canUndo();
  minor.append(
    undoBtn,
    button(app.showShelters ? 'Hide shelters' : 'Show shelters',
      () => update((s) => { s.showShelters = !s.showShelters; })),
    button('Capture as pattern', () => update((s) => {
      s.captured.push({
        name: `Captured ${s.captured.length + 1}`,
        note: `After ${moveCount()} moves.`,
        state: current,
      });
    })),
  );
  view.appendChild(minor);

  // Reset sits apart from Undo, asks before it fires, and is itself undoable.
  const danger = el('div', 'minor danger');
  if (armed) {
    const confirm = button('Confirm reset', () => {
      armed = false;
      resetTo(provisionalStart(), 'reset the board');
    }, 'warn');
    const cancel = button('Cancel', () => { armed = false; update(() => {}); });
    danger.append(confirm, cancel);
  } else {
    danger.appendChild(button('Reset board', () => { armed = true; update(() => {}); }));
  }
  view.appendChild(danger);

  // --- readout -------------------------------------------------------------
  const readout = el('div', 'readout');
  const list = el('dl');
  const counts = census(current);
  const rows = [
    ['Moves', String(moveCount())],
    ['Last move', lastMove()],
    ['Marbles', `${counts.orange} orange, ${counts.green} green, ${counts.empty} empty`],
  ];

  if (match) {
    rows.push(['Target', app.target.name]);
    rows.push(['Progress', match.solved
      ? 'Solved'
      : `${match.missing} marble${match.missing === 1 ? '' : 's'} still out of place`]);
  }

  for (const [term, value] of rows) {
    list.append(el('dt', '', term), el('dd', '', value));
  }
  readout.appendChild(list);

  const code = el('div', 'code');
  const input = el('input');
  input.value = replayCode();
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Replay code');
  const error = el('div', 'err');
  code.append(input,
    button('Copy', () => {
      input.select();
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(() => {});
      note('replay code copied');
    }),
    button('Load', () => {
      try {
        load(input.value, current.board);
      } catch (e) {
        error.textContent = e.message;
      }
    }));
  readout.append(code, error);
  readout.appendChild(el('p', 'note',
    'That code is the whole game — the starting board, then every move. Paste one in to '
    + 'replay it. Keyboard: 1–8 slide a row, arrows tilt, U undoes.'));
  view.appendChild(readout);

  // The target, small and last, so the board you are playing keeps the screen.
  if (app.target) {
    const peek = el('div', 'target-peek');
    const head = el('div', 'minor');
    head.appendChild(button(app.showTarget ? 'Hide target' : `Show target — ${app.target.name}`,
      () => update((s) => { s.showTarget = !s.showTarget; })));
    peek.appendChild(head);
    if (app.showTarget) {
      peek.appendChild(boardElement(app.target.state, { showGates: false, scale: 16 }));
      peek.appendChild(el('p', 'note', `Target: ${app.target.name}. Red rings on your board mark marbles still out of place.`));
    }
    view.appendChild(peek);
  }

  return view;
}

export function keydown(event) {
  if (event.target instanceof HTMLInputElement) return;
  if (event.key >= '1' && event.key <= '8') {
    doSlide(Number(event.key) - 1);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    doTilt('down');
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    doTilt('up');
  } else if (event.key.toLowerCase() === 'u') {
    undo();
  }
}
