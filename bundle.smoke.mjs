/** Verifies the built single-file app behaves like the module version. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(fs.readFileSync('./switchback.html', 'utf8'), {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { document, Event } = dom.window;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const click = (n) => n.dispatchEvent(new Event('click'));

assert.equal($$('nav button').length, 6);
assert.equal($$('.hole').length, 32);
assert.equal($$('.marble.m1').length, 12);
assert.equal($$('.marble.m2').length, 12);
assert.equal($$('.gates').length, 7);

click($$('.slider-btn')[0]);
assert.equal($$('.gates')[0].querySelectorAll('b').length, 4, 'sliding row 1 opens four gates');
click($$('.slider-btn')[2]);
click($('.tilts button:last-child'));
assert.equal($$('.marble.m1').length + $$('.marble.m2').length, 24, 'marbles conserved');

dom.window.location.hash = '#/patterns';
dom.window.dispatchEvent(new Event('hashchange'));
assert.equal($$('.pattern').length, 53, 'patterns view renders in the bundle');

dom.window.location.hash = '#/analyze';
dom.window.dispatchEvent(new Event('hashchange'));
assert.equal($$('.field input').length, 4, 'analysis view renders in the bundle');

dom.window.location.hash = '#/3d';
dom.window.dispatchEvent(new Event('hashchange'));
assert.equal($$('.rows3d button').length, 8, '3D view renders in the bundle');
dom.window.location.hash = '#/play';
dom.window.dispatchEvent(new Event('hashchange'));

console.log('Bundle smoke test: all checks passed');
