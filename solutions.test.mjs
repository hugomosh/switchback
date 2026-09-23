import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMove } from './engine.mjs';
import { patternByNumber, compare, ALL_PATTERNS } from './patterns.mjs';
import { SOLUTIONS } from './solutions.mjs';

const decode = (text) => [...text].map((ch) => (ch >= '1' && ch <= '8'
  ? { type: 'slide', row: Number(ch) - 1 }
  : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' }));

test('every stored solution replays onto its target', () => {
  for (const e of SOLUTIONS.filter((x) => x.solved)) {
    const end = decode(e.moves).reduce(applyMove, patternByNumber(e.from).state);
    assert.equal(compare(end, patternByNumber(e.to).state).solved, true, `${e.from}>${e.to}`);
    assert.equal(e.length, e.moves.length, `${e.from}>${e.to} length matches its moves`);
  }
});

test('the full cycle through every pattern has been attempted', () => {
  const numbers = ALL_PATTERNS.map((p) => p.number);
  for (let i = 0; i < numbers.length; i++) {
    const from = numbers[i];
    const to = numbers[(i + 1) % numbers.length];
    assert.ok(SOLUTIONS.some((e) => e.from === from && e.to === to), `missing ${from}>${to}`);
  }
});

test('an unsolved edge records how close the search got', () => {
  for (const e of SOLUTIONS.filter((x) => !x.solved && !x.impossible)) {
    assert.ok(Number.isInteger(e.best) && e.best > 0, `${e.from}>${e.to}`);
  }
});

test('an impossible edge says why, and points at a sealed pattern', async () => {
  const { SEALED } = await import('./solutions.mjs');
  const impossible = SOLUTIONS.filter((x) => x.impossible);
  assert.ok(impossible.length >= 2);
  for (const e of impossible) {
    assert.ok(SEALED.includes(e.to), `${e.from}>${e.to} is not into a sealed pattern`);
    assert.match(e.reason, /no tilt can produce/);
  }
});
