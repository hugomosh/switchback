/**
 * "How to play": the rules in plain words, with three small diagrams of the
 * one idea everything depends on — when two rows' holes line up.
 *
 * The diagrams are drawn from the engine's own geometry (columnOf), so they
 * cannot drift from the rules the game actually plays by. Shared by the Play
 * and 3D tabs, each adding a short section on its own controls. Whether it is
 * open is remembered, so it stays out of the way once read.
 */
import { columnOf } from './engine.mjs';

const KEY = 'switchback.howto';
const openState = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
})();

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function para(...parts) {
  const p = el('p');
  for (const part of parts) p.append(typeof part === 'string' ? part : part);
  return p;
}
const strong = (text) => el('strong', '', text);

function list(items) {
  const ul = el('ul');
  for (const item of items) {
    const li = el('li');
    li.append(...(Array.isArray(item) ? item : [item]));
    ul.appendChild(li);
  }
  return ul;
}

/**
 * Two adjacent rows (an even row over an odd one) at the given slider
 * positions. Holes, the bar between them, a marker where two holes line up,
 * and a marble in each top hole that has a way down.
 */
function rows(topShift, bottomShift, caption) {
  const fig = el('figure', 'howto-fig');
  const grid = el('div', 'howto-grid');
  const holes = (row, shift) => new Set([0, 1, 2, 3].map((slot) => columnOf(row, slot, shift)));
  const top = holes(0, topShift);
  const bottom = holes(1, bottomShift);
  const drawRow = (set, marbles) => {
    for (let c = 0; c < 9; c++) {
      const cell = el('i', set.has(c) ? 'hw' : 'hb');
      if (marbles && set.has(c)) cell.appendChild(el('b', bottom.has(c) ? 'hm go' : 'hm'));
      grid.appendChild(cell);
    }
  };
  drawRow(top, true);
  for (let c = 0; c < 9; c++) grid.appendChild(el('i', top.has(c) && bottom.has(c) ? 'hg open' : 'hg'));
  drawRow(bottom, false);
  fig.append(grid, el('figcaption', '', caption));
  return fig;
}

function rules() {
  const box = el('div', 'howto-body');
  box.append(
    para('The tray has ', strong('eight rows'), '. Each row is a sliding bar with ',
      strong('four holes'), '. 24 marbles — 12 of each colour — sit in 24 of the 32 holes, so 8 are always empty. ',
      'The aim is to copy one of the booklet\'s patterns, marble for marble.'),
    el('h4', '', 'There are only two moves'),
    list([
      [strong('Slide a bar'), ' one column left or right. The bar carries its four holes and their marbles with it, so a slide never changes what a row holds — only which holes line up with the rows above and below.'],
      [strong('Tilt the tray'), ' toward the top or the bottom. Every marble that can fall, falls — as far as it can, all at once. You never get to pick one marble.'],
    ]),
    el('h4', '', 'A marble can only drop where two holes line up'),
    para('Bars are offset like bricks, so neighbouring holes normally miss each other. What you control is the offset:'),
  );
  const figs = el('div', 'howto-figs');
  figs.append(
    rows(0, 0, 'Both bars at rest: no holes line up. Nothing can pass.'),
    rows(1, 0, 'Slide the top bar: all four holes line up.'),
    rows(0, 1, 'Slide the lower bar instead: three line up, and the two end holes have no partner.'),
  );
  box.append(figs,
    para('A marble in an end hole with no partner above or below is ', strong('sheltered'),
      ': no tilt can move it. The box calls this "using the edges for shelter", and it is the only way to hold a marble still while others fall.'),
    el('h4', '', 'Playing a pattern'),
    list([
      ['Pick a target on the ', strong('Patterns'), ' tab. Every booklet pattern has all sliders at rest, so a finished board is always one where nothing can move.'],
      ['The classic manoeuvre is a ', strong('switch'), ': slide a few bars, tilt, and slide them back. The marbles you meant to move have moved, and everything else is locked again.'],
      ['Patterns 2 and 5 cannot be reached from any other board under these rules — only started from. The README has the proof.'],
    ]),
  );
  return box;
}

const PLAY = () => {
  const box = el('div', 'howto-body');
  box.append(el('h4', '', 'On this board'), list([
    [strong('Click a row'), ' to slide its bar, or use the numbered buttons beside it; ▸ means that bar is pushed across. ', strong('Tilt up'), ' and ', strong('Tilt down'), ' tip the tray.'],
    ['Teal marks between rows show where holes line up right now — where a marble could cross.'],
    ['A slightly darker well is a shelter. With a target chosen, a red ring marks a marble that is not where the pattern wants it.'],
    ['Undo walks back one move. The replay code under the board is the whole game: copy it to share, paste one in and press Load to replay it.'],
    ['Keyboard: 1–8 slide, ↑ and ↓ tilt, U undoes. Colours and board look are in the ◐ menu at the top.'],
  ]));
  return box;
};

const THREE_D = () => {
  const box = el('div', 'howto-body');
  box.append(el('h4', '', 'In 3D'), list([
    ['The tray lies on a table, row 1 furthest away. ', strong('Drag'), ' to turn it, scroll or pinch to zoom, double-click to reset the view. ',
      strong('Tap a bar'), ' to slide it, or drag it sideways.'],
    [strong('Strict'), ' plays by the rules above, exactly as the Play tab does and on the same game: same moves, undo and replay code. A tilt tips the tray and the marbles fall.'],
    [strong('Free'), ' is the real object instead. Gravity is continuous: hold the tray at any angle with the slider, a held arrow key or your phone\'s tilt, and marbles roll, stack and can stop between rows. Bars take time to move and can be held part-way, so you can shut one while marbles stream through and keep the rest back. A bar with a marble half inside it will not budge.'],
    ['Arrow keys and phone tilt pull toward that edge of your screen, however the tray is turned. With the phone, tap ', strong('Level'), ' while holding it comfortably.'],
    ['When free play comes to rest with every marble in a hole, it is an ordinary board again: copy its code, or carry on from it in strict mode.'],
  ]));
  return box;
};

/** The collapsible explainer for a tab: 'play' or '3d'. */
export function howTo(kind) {
  const details = el('details', 'howto');
  details.open = openState[kind] ?? true;
  const summary = el('summary');
  summary.append(el('span', 'howto-title', 'How to play'), el('span', 'howto-hint', 'the rules in two minutes'));
  details.append(summary, rules(), kind === '3d' ? THREE_D() : PLAY());
  details.addEventListener('toggle', () => {
    openState[kind] = details.open;
    try { localStorage.setItem(KEY, JSON.stringify(openState)); } catch { /* not remembered, still works */ }
  });
  return details;
}
