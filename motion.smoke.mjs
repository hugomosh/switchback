/**
 * Proves the board actually asks for animations.
 *
 * jsdom has no layout and no Web Animations, so both are stubbed: rects come
 * from a synthetic grid, and `animate` records what it was asked to play. The
 * point is not to check how it looks — it is to catch the case where the
 * animation code silently never runs, which is exactly what happened before.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const CELL = 35, PITCH = 35;

const html = fs.readFileSync('./index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.history = dom.window.history;
global.HTMLInputElement = dom.window.HTMLInputElement;

const played = [];
const proto = dom.window.Element.prototype;
proto.getBoundingClientRect = function () {
  if (this.dataset && this.dataset.row !== undefined) {
    return { top: Number(this.dataset.row) * PITCH, left: 0, width: CELL * 15, height: CELL };
  }
  if (this.classList && this.classList.contains('hole')) {
    return { top: 0, left: 0, width: CELL, height: CELL };
  }
  return { top: 0, left: 0, width: 0, height: 0 };
};
proto.animate = function (frames, options) {
  played.push({ element: this, frames, options });
  return { finished: Promise.resolve(), cancel() {} };
};

await import('./app.mjs');
const $$ = (s) => [...document.querySelectorAll(s)];
const click = (n) => n.dispatchEvent(new dom.window.Event('click'));

// --- sliding animates the bar sideways -------------------------------------
played.length = 0;
click($$('.slider-btn')[0]);
const slide = played.find((p) => p.element.dataset && p.element.dataset.row === '0');
assert.ok(slide, 'sliding row 1 should animate that row bar');
assert.match(slide.frames[0].transform, new RegExp(`translateX\\(-${CELL}px\\)`),
  'the bar should start one column back from where it lands');
// The bar already carries an inline transform for its slider position, so the
// animation composes onto it rather than replacing it.
assert.equal(slide.frames[1].transform, slide.element.style.transform);
assert.ok(slide.frames[0].transform.startsWith(slide.element.style.transform));

// --- sliding back reverses the direction -----------------------------------
played.length = 0;
click($$('.slider-btn')[0]);
const back = played.find((p) => p.element.dataset && p.element.dataset.row === '0');
assert.match(back.frames[0].transform, new RegExp(`translateX\\(${CELL}px\\)`));

// --- tilting animates each marble that moved, vertically only --------------
click($$('.slider-btn')[0]);   // open row 1 into row 2
click($$('.slider-btn')[2]);   // and row 3 into row 4
played.length = 0;
click($('.tilts button:last-child') ?? $$('.tilts button')[2]);
const marbleMoves = played.filter((p) => p.element.classList.contains('marble'));
assert.ok(marbleMoves.length > 0, 'a tilt that moves marbles must animate them');
for (const move of marbleMoves) {
  assert.match(move.frames[0].transform, /^translateY\(-?\d+px\)$/,
    'a tilt never changes a column, so the marble only moves vertically');
  assert.equal(move.frames[1].transform, 'none', 'and settles in the middle of its well');
  const offset = Number(move.frames[0].transform.match(/-?\d+/)[0]);
  assert.equal(Math.abs(offset) % PITCH, 0, 'the distance should be a whole number of rows');
  assert.notEqual(offset, 0);
}

// --- a marble rising is drawn above the row it climbs out of -------------
// Each bar paints over the rows above it, so a marble moving up would travel
// hidden under the bar below unless its own bar is lifted while it moves.
played.length = 0;
click($$('.tilts button').find((b) => b.textContent === 'Tilt up'));
const rising = played.filter((p) => p.element.classList.contains('marble'));
assert.ok(rising.length > 0, 'tilting back up moves marbles too');
for (const move of rising) {
  assert.ok(Number(move.frames[0].transform.match(/-?\d+/)[0]) > 0, 'they start below where they land');
  assert.equal(move.element.closest('.bar').style.zIndex, '1', 'and their bar sits on top while they move');
}
await Promise.resolve();
await Promise.resolve();
assert.ok(rising.every((m) => m.element.closest('.bar').style.zIndex === ''), 'and drops back afterwards');

function $(sel) { return document.querySelector(sel); }
console.log(`motion checks passed — ${marbleMoves.length} marbles animated on the tilt`);
