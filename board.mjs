/**
 * Shared board renderer.
 *
 * Contains no rules. Everything it draws — where a bar sits, which gates are
 * open, which marbles are sheltered — is asked of the engine. If a view needs
 * to know something about the board, it asks the engine too, not this file.
 */

import {
  EMPTY, ORANGE, GREEN,
  columnOf, columnCount, rowType, gateMap, isSheltered, columnGrid,
} from './engine.mjs';

const div = (className) => {
  const node = document.createElement('div');
  if (className) node.className = className;
  return node;
};

/**
 * @param {object} state        engine state
 * @param {object} [options]
 * @param {(row:number)=>void} [options.onSlide]  omit for a read-only board
 * @param {boolean} [options.showGates]
 * @param {boolean} [options.showShelters]
 * @param {number}  [options.scale]   column width in px, for thumbnails
 * @param {Set<number>} [options.wrongCells]  cell indices to mark as misplaced
 */
export function boardElement(state, options = {}) {
  const {
    onSlide = null,
    showGates = true,
    showShelters = false,
    scale = null,
    wrongCells = null,
  } = options;

  const wrap = div('board');
  if (scale) wrap.style.setProperty('--col', `${scale}px`);
  if (!showGates) wrap.classList.add('no-gates');

  if (onSlide) wrap.appendChild(sliderColumn(state, onSlide));
  wrap.appendChild(tray(state, { showGates, showShelters, wrongCells }));
  return wrap;
}

function sliderColumn(state, onSlide) {
  const column = div('sliders');
  for (let row = 0; row < state.board.rows; row++) {
    const shifted = state.shifts[row] === 1;
    const button = document.createElement('button');
    button.className = 'slider-btn';
    button.dataset.shift = String(state.shifts[row]);
    button.textContent = `${row + 1} ${shifted ? '▸' : '◂'}`;
    button.title = `Slide row ${row + 1} ${shifted ? 'back to rest' : 'right one column'}`;
    button.addEventListener('click', () => onSlide(row));
    column.appendChild(button);
  }
  return column;
}

function tray(state, { showGates, showShelters, wrongCells }) {
  const { board } = state;
  const width = columnCount(board);
  // The bar is a long strip that overhangs the tray at both ends, as the real
  // slider does — you push it from outside the frame. It has to overhang far
  // enough that no shift ever leaves a bare column at either end.
  const LEAD = 3;
  const barColumns = 2 * board.slots + 2 * LEAD + 1;
  const grid = columnGrid(state);
  const node = div('tray');

  for (let row = 0; row < board.rows; row++) {
    const rowEl = div('row');
    rowEl.style.width = `calc(${width} * var(--col))`;

    const frame = div('frame');
    frame.style.gridTemplateColumns = `repeat(${width}, var(--col))`;
    for (let c = 0; c < width; c++) frame.appendChild(document.createElement('i'));
    rowEl.appendChild(frame);

    const bar = div('bar');
    bar.dataset.row = String(row);
    bar.style.width = `calc(${barColumns} * var(--col))`;
    bar.style.gridTemplateColumns = `repeat(${barColumns}, var(--col))`;
    bar.style.transform = `translateX(calc(${columnOf(row, 0, state.shifts[row]) - LEAD} * var(--col)))`;

    for (let c = 0; c < barColumns; c++) {
      const cell = div();
      if (c % 2 === LEAD % 2 && c >= LEAD && c < LEAD + 2 * board.slots) {
        const slot = (c - LEAD) / 2;
        const column = columnOf(row, slot, state.shifts[row]);
        const index = row * board.slots + slot;
        const value = grid[row][column].value;
        cell.className = 'hole';
        cell.dataset.cell = String(index);
        cell.title = `row ${row + 1} (type ${rowType(row)}), slot ${slot}, column ${column}`;
        if (value !== EMPTY) {
          // The marble is its own element so it can be animated between wells.
          const marble = div(`marble ${value === ORANGE ? 'm1' : 'm2'}`);
          // Shelter belongs to the well; the ring on a marble means only that
          // the marble is in the wrong place for the target pattern.
          if (showShelters && isSheltered(state, row, slot)) cell.classList.add('shelter');
          if (wrongCells && wrongCells.has(index)) marble.classList.add('wrong');
          cell.appendChild(marble);
        }
      }
      bar.appendChild(cell);
    }
    rowEl.appendChild(bar);
    node.appendChild(rowEl);

    if (row < board.rows - 1) {
      const gates = div('gates');
      gates.style.width = `calc(${width} * var(--col))`;
      gates.style.gridTemplateColumns = `repeat(${width}, var(--col))`;
      const open = new Set(
        gateMap(state, row, row + 1)
          .map((k, j) => (k >= 0 ? columnOf(row, j, state.shifts[row]) : -1))
          .filter((c) => c >= 0),
      );
      for (let c = 0; c < width; c++) {
        const cell = div();
        if (showGates && open.has(c)) cell.appendChild(document.createElement('b'));
        gates.appendChild(cell);
      }
      node.appendChild(gates);
    }
  }
  return node;
}
