import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { makeState, tilt } from './engine.mjs';
import { SEALED } from './solutions.mjs';
import { ALL_PATTERNS } from './patterns.mjs';

const hasCompiler = (() => { try { execFileSync('cc', ['--version']); return true; } catch { return false; } })();

test('the C tilt used by the occupancy tools agrees with the engine', { skip: !hasCompiler && 'no C compiler' }, () => {
  fs.mkdirSync('occupancy/build', { recursive: true });
  execFileSync('cc', ['-O2', '-o', 'occupancy/build/tiltcheck', 'occupancy/tiltcheck.c']);
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cases = [];
  for (let n = 0; n < 5000; n++) {
    // Distinct labels, so the check covers where each marble lands, not just the holes.
    const cells = Array.from({ length: 32 }, (_, i) => (i < 24 ? 1 + (i % 9) : 0));
    for (let i = 31; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    cases.push({ cells, shifts: Array.from({ length: 8 }, () => (rnd() < 0.5 ? 1 : 0)), dir: rnd() < 0.5 ? 'up' : 'down' });
  }
  const input = cases.map((c) => `${c.cells.join('')} ${c.shifts.join('')} ${c.dir}`).join('\n');
  const out = execFileSync('occupancy/build/tiltcheck', { input }).toString().trim().split('\n');
  cases.forEach((c, i) => {
    assert.equal(out[i], tilt(makeState(c.cells, c.shifts), c.dir).cells.join(''));
  });
});

test('every reachable target has a full colour orbit on record', () => {
  const store = JSON.parse(fs.readFileSync('results/solutions.json', 'utf8'));
  for (const { number } of ALL_PATTERNS) {
    if (SEALED.includes(number)) continue;
    const orbit = store.orbits?.[number];
    assert.ok(orbit, `no orbit recorded for pattern ${number}`);
    assert.equal(orbit.reached, 2704156, `pattern ${number}`);
    assert.equal(orbit.total, 2704156);
  }
});
