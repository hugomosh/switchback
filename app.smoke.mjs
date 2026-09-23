/**
 * Headless smoke test for the SPA shell and its three views.
 * Checks the wiring, not the rules — engine.test.mjs and analysis.test.mjs
 * cover those.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { provisionalStart, stateKey, columnOf, gateMap } from './engine.mjs';

const html = fs.readFileSync('./index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
global.location = dom.window.location;
global.history = dom.window.history;
global.HTMLInputElement = dom.window.HTMLInputElement;

const click = (node) => node.dispatchEvent(new dom.window.Event('click'));
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const goto = async (path) => {
  // Navigate the way a person does: tap the tab.
  const label = { '#/play': 'Play', '#/patterns': 'Patterns', '#/solve': 'Solve', '#/analyze': 'Analysis' }[path];
  const tab = $$('nav button').find((b) => b.textContent === label);
  if (!tab) throw new Error('no tab for ' + path);
  click(tab);
  await new Promise((r) => setTimeout(r, 0));
};

await import('./app.mjs');

// --- shell -----------------------------------------------------------------
assert.equal($$('nav button').length, 5, 'five routes in the nav');
assert.equal($('nav button[aria-current="page"]').textContent, 'Play', 'play is the default route');
assert.equal($$('.row').length, 8);
assert.equal($$('.hole').length, 32);
assert.equal($$('.marble.m1').length, 12);
assert.equal($$('.marble.m2').length, 12);

// --- the board mirrors the engine ------------------------------------------
const barOffsets = () => $$('.bar').map((b) => Number(b.style.transform.match(/\(([-\d]+) \*/)[1]));
// The bar overhangs the tray at both ends, so it starts several columns before
// its first well — no shift may ever leave a bare column at either end.
const LEAD = 3;
assert.deepEqual(
  barOffsets(),
  [...Array(8).keys()].map((r) => columnOf(r, 0, provisionalStart().shifts[r]) - LEAD),
);
for (const bar of $$('.tray .bar')) {
  const span = Number(bar.style.width.match(/\((\d+) \*/)[1]);
  const offset = Number(bar.style.transform.match(/\(([-\d]+) \*/)[1]);
  assert.ok(offset <= 0 && offset + span >= 9, 'a bar must cover every column of its row');
}
const gatesDrawn = () => $$('.gates').map((g) => [...g.children].filter((c) => c.firstChild).length);
assert.deepEqual(gatesDrawn(), [0, 0, 0, 0, 0, 0, 0], 'no channel is open with every slider at rest');

// --- moves and URL sync ----------------------------------------------------
click($$('.slider-btn')[0]);
assert.equal(barOffsets()[0], 1 - LEAD, 'row 1 bar moved one column');
assert.equal(gatesDrawn()[0], 4, 'row 1 now aligns with row 2');
assert.match(dom.window.location.hash, /^#\/play\/\d{32}\|\d{8}$/, 'the board is mirrored into the URL');

const stuck = $$('.readout dd')[0].textContent;
click($('.tilts button:last-child')); // tilt down, nothing can fall yet
assert.equal($$('.readout dd')[0].textContent, stuck, 'a tilt that moves nothing is not a move');

click($$('.slider-btn')[2]);
const beforeTilt = dom.window.location.hash;
click($('.tilts button:last-child'));
assert.notEqual(dom.window.location.hash, beforeTilt, 'the tilt changed the board');
assert.equal($$('.marble.m1').length + $$('.marble.m2').length, 24, 'marbles conserved');

// --- undo ------------------------------------------------------------------
click($$('.minor button')[0]);
assert.equal(dom.window.location.hash, beforeTilt, 'undo restored the previous board');

// --- reset is separated, confirmed, and itself undoable ---------------------
const beforeReset = dom.window.location.hash;
const movesBefore = $$('.readout dd')[0].textContent;
assert.ok(Number(movesBefore) > 0, 'some moves have been made');
const resetRow = $('.minor.danger');
assert.ok(resetRow, 'reset lives in its own group, away from undo');
assert.equal(resetRow.querySelectorAll('button').length, 1);
click(resetRow.querySelector('button'));
assert.equal(dom.window.location.hash, beforeReset, 'one tap only arms it, it does not fire');
const armedRow = $('.minor.danger');
assert.deepEqual([...armedRow.querySelectorAll('button')].map((b) => b.textContent),
  ['Confirm reset', 'Cancel']);
click([...armedRow.querySelectorAll('button')][1]);
assert.equal($('.minor.danger').querySelectorAll('button').length, 1, 'cancel disarms it');
click($('.minor.danger').querySelector('button'));
click([...$('.minor.danger').querySelectorAll('button')][0]);
assert.notEqual(dom.window.location.hash, beforeReset, 'confirming resets the board');
assert.equal($$('.readout dd')[0].textContent, '0', 'the move count starts again');
click($$('.minor button')[0]);
assert.equal(dom.window.location.hash, beforeReset, 'undo brings the board back after a reset');
assert.equal($$('.readout dd')[0].textContent, movesBefore, 'and restores the move count');

// --- patterns --------------------------------------------------------------
await goto('#/patterns');
assert.equal($('nav button[aria-current="page"]').textContent, 'Patterns');
assert.equal($$('.pattern').length, 53, 'the opening board plus all 52 booklet patterns');
assert.equal($$('.pattern .hole').length, 53 * 32, 'each card draws a full board');

const setTarget = $$('.pattern')[1].querySelectorAll('button')[1];
assert.equal(setTarget.textContent, 'Target');
click(setTarget);
assert.ok($('.pattern.chosen'), 'the chosen pattern is marked');

await goto('#/play');
const terms = $$('.readout dt').map((n) => n.textContent);
assert.ok(terms.includes('Target'), 'the play view reports the target');
assert.ok(terms.includes('Progress'));

// --- play from a pattern ----------------------------------------------------
await goto('#/patterns');
const firstCard = $$('.pattern')[0];
assert.equal(firstCard.querySelector('.number').textContent, 'start', 'pattern 0 is the opening board');
const pattern4 = $$('.pattern').find((c) => c.querySelector('.number').textContent === '4');
const playBtn = [...pattern4.querySelectorAll('button')].find((b) => b.textContent === 'Play from here');
assert.ok(playBtn, 'every pattern card offers Play from here');
click(playBtn);
await new Promise((r) => setTimeout(r, 0));
assert.equal($('nav button[aria-current="page"]').textContent, 'Play', 'it switches to the board');
assert.equal($$('.readout dd')[0].textContent, '0', 'the move count starts again');
assert.match($$('.readout dd')[1].textContent, /pattern 4/, 'and says which pattern was loaded');
click($$('.minor button')[0]);   // undo
assert.notEqual($$('.readout dd')[1].textContent, 'loaded pattern 4', 'loading a pattern can be undone');

// --- play view: no neutral, target preview at the bottom -------------------
await goto('#/play');
assert.deepEqual($$('.tilts button').map((b) => b.textContent), ['Tilt up', 'Tilt down'],
  'a level tray is not a move, so there is no neutral button');
{
  await goto('#/patterns');
  const card = $$('.pattern').find((c) => c.querySelector('.number').textContent === '9');
  click([...card.querySelectorAll('button')].find((b) => b.textContent === 'Target'));
  await goto('#/play');
  const peek = $('.target-peek');
  assert.ok(peek, 'with a target set, the play view shows it');
  assert.ok(peek === $('.view').lastElementChild, 'and puts it last, under the game');
  assert.equal(peek.querySelectorAll('.hole').length, 32, 'as a full small board');
  click(peek.querySelector('button'));
  assert.equal($('.target-peek').querySelectorAll('.hole').length, 0, 'it can be hidden');
  assert.match($('.target-peek button').textContent, /Show target/);
  click($('.target-peek button'));

  // Clear the target again so later checks see a single board.
  await goto('#/patterns');
  const chosen = $$('.pattern').find((c) => c.querySelector('.number').textContent === '9');
  click([...chosen.querySelectorAll('button')].find((b) => b.textContent === 'Clear target'));
  await goto('#/play');
  assert.equal($('.target-peek'), null, 'no target, no preview');
}

// --- pattern filter ---------------------------------------------------------
await goto('#/patterns');
{
  const query = $('.filter input');
  assert.ok(query, 'the patterns tab has a filter');
  query.value = '1, 4, 12-15';
  query.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual($$('.pattern .number').map((n) => n.textContent), ['1', '4', '12', '13', '14', '15']);
  $('.filter input').value = '99';
  $('.filter input').dispatchEvent(new dom.window.Event('change'));
  assert.equal($$('.pattern').length, 0);
  assert.match($('.view').textContent, /nothing matched 99/);
  $('.filter input').value = '';
  $('.filter input').dispatchEvent(new dom.window.Event('change'));
  assert.equal($$('.pattern').length, 53, 'clearing the filter shows everything again');
}

// --- readable on a dark background ------------------------------------------
{
  const css = [...document.querySelectorAll('style')].map((n) => n.textContent).join('\n');
  assert.ok(css.includes('prefers-color-scheme: dark'), 'the page needs a dark theme');
  assert.ok(/<meta name="color-scheme" content="light dark">/.test(fs.readFileSync('./index.html', 'utf8')));
  assert.ok(!/background: #fff\b/.test(css), 'surfaces must follow the theme, not hardcode white');
}

// --- matrix ----------------------------------------------------------------
{
  const label = 'Matrix';
  click($$('nav button').find((b) => b.textContent === label));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal($('nav button[aria-current="page"]').textContent, 'Matrix');
  assert.equal($$('.matrix .mc').length, 53 * 53, 'a full 53 by 53 grid');
  const known = $$('.matrix .mc:not(:disabled)');
  assert.ok(known.length >= 50, 'the cycle results are plotted');
  assert.ok($$('.matrix .mc.ok').length >= 1, 'at least one route is shown as found');
  assert.ok($$('.matrix .mc.no').length >= 1, 'and failures are shown too');
  assert.ok($$('.edge-list .edge-row').length >= 50, 'every stored edge is listed');

  // open a solved edge and step through it
  const solvedRow = $$('.edge-row').find((r) => /moves/.test(r.textContent));
  click(solvedRow);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok($('.edge-detail'), 'selecting an edge opens its detail');
  const stepBtn = [...$('.edge-detail').querySelectorAll('button')].find((b) => b.textContent === 'Step');
  click(stepBtn);
  assert.match($('.edge-detail').textContent, /move 1 of/, 'the route can be stepped through');
}

// --- analysis --------------------------------------------------------------
await goto('#/analyze');
assert.equal($('nav button[aria-current="page"]').textContent, 'Analysis');
assert.equal($$('.field input').length, 4, 'board shape is configurable');
assert.equal($$('.row').length, 4, 'the reduced board is previewed');

click($('button.primary'));
await new Promise((r) => setTimeout(r, 4000));
const labels = $$('.readout dt').map((n) => n.textContent);
assert.ok(labels.includes('States reached'), 'the search reported results');
const values = Object.fromEntries($$('.readout dt').map((n, i) => [n.textContent, $$('.readout dd')[i].textContent]));
assert.equal(values['Parity obstruction'], 'no');
assert.equal(values['Bare transposition'], 'found');

// --- palette switching -----------------------------------------------------
await goto('#/play');
const paletteBtn = $$('.minor button').find((b) => /1993|1998/.test(b.textContent));
assert.ok(paletteBtn, 'the palette toggle is present');
assert.equal(document.body.dataset.palette, '1993');
click(paletteBtn);
assert.equal(document.body.dataset.palette, '1998', 'switched to the 1998 edition colours');
assert.equal($$('.marble.m1').length + $$('.marble.m2').length, 24, 'marbles keep their classes');
click($$('.minor button').find((b) => /1993|1998/.test(b.textContent)));
assert.equal(document.body.dataset.palette, '1993');

// --- solve view ------------------------------------------------------------
await goto('#/solve');
assert.equal($('nav button[aria-current="page"]').textContent, 'Solve');
assert.equal($$('.picker select').length, 2, 'a start and a target picker');
assert.equal($$('.picker select')[0].options.length, 54, 'current board, opening board, 52 patterns');
assert.equal($$('.row').length, 8, 'the start board is drawn');

// --- a malformed URL code does not blank the app ---------------------------
dom.window.location.hash = '#/play/garbage';
dom.window.dispatchEvent(new dom.window.Event('hashchange'));
await new Promise((r) => setTimeout(r, 0));
assert.equal($$('.hole').length, 32, 'board survived a bad code in the address bar');

console.log('SPA smoke test: all checks passed');

// --- the board is actually styled ------------------------------------------
// A silent no-op in a stylesheet patch once left the marbles with no rule at
// all, so they rendered as nothing. These assert the rules reach the page.
await goto('#/play');
const sheet = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
for (const rule of ['.marble {', '.marble.m1', '.marble.m2', '.hole {']) {
  assert.ok(sheet.includes(rule), `stylesheet is missing ${rule}`);
}
// Marbles must resolve to a flat colour. They are drawn without a gradient, and
// a gradient-only rule would leave them invisible where a layer fails to parse.
assert.ok(/\.marble \{[^}]*background(-color)?:\s*var\(--tone\)/.test(sheet),
  'marbles need a flat colour');
assert.ok(!sheet.includes('color-mix'), 'color-mix invalidates the whole declaration where unsupported');
assert.equal($$('.tray .hole').length, 32, 'every well is drawn');
assert.equal($$('.tray .hole > .marble').length, 24, 'every marble sits inside a well');
// --- look presets ----------------------------------------------------------
assert.equal(document.body.dataset.look, 'tray');
const lookRow = $('.minor.looks');
assert.ok(lookRow, 'the look switcher is present');
const lookButtons = [...lookRow.querySelectorAll('button')];
assert.deepEqual(lookButtons.map((b) => b.textContent), ['Tray', 'Spaced', 'Ink', 'Paper']);
for (const label of ['Spaced', 'Ink', 'Paper', 'Tray']) {
  click([...$('.minor.looks').querySelectorAll('button')].find((b) => b.textContent === label));
  assert.equal(document.body.dataset.look, label.toLowerCase(), `look ${label}`);
  assert.equal($$('.tray .hole > .marble').length, 24, `marbles survive the ${label} look`);
}
for (const look of ['tray', 'ink', 'paper']) {
  assert.ok(sheet.includes(`body[data-look="${look}"]`), `no rules for the ${look} look`);
}

console.log('board styling and look checks passed');

// --- shelter reads on the well, the ring means position only ---------------
await goto('#/play');
assert.ok(sheet.includes('.hole.shelter'), 'shelter must be a well style');
assert.ok(!sheet.includes('.marble.shelter'), 'the ring is reserved for pattern position');
click($$('.slider-btn')[0]);   // open row 1 against row 2; row 1 slot 0 loses its shelter
const sheltered = $$('.tray .hole.shelter');
assert.ok(sheltered.length > 0, 'some wells should be sheltered');
for (const well of sheltered) {
  assert.ok(well.querySelector('.marble'), 'only occupied wells are marked sheltered');
  assert.ok(!well.querySelector('.marble.shelter'), 'the marble itself carries no shelter class');
}

// --- rows sit flush: the bar fills its row, leaving no sliver --------------
assert.ok(/\.bar \{[^}]*top: 0; height: 100%/.test(sheet),
  'a bar short of its row height reads as a gap even at zero row gap');
console.log('shelter and flush-row checks passed');
