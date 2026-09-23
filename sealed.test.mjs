import assert from 'node:assert/strict';
import test from 'node:test';
import { stateKey, slide, tilt, makeState, EMPTY, columnOf } from './engine.mjs';
import { patternByNumber } from './patterns.mjs';
import { buildPerimeter } from './perimeter.mjs';
import { SEALED } from './solutions.mjs';

test('patterns 2 and 5 are sealed', () => {
  assert.deepEqual(SEALED, [2, 5]);
});

for (const n of [2, 5]) {
  test(`pattern ${n}: its backward region is exactly its own slider settings`, () => {
    const p = buildPerimeter(patternByNumber(n).state, { depth: 12, maxStates: 5000 });
    assert.equal(p.size, 256);
  });

  test(`pattern ${n}: no single displaced marble tilts back onto it`, () => {
    // Independent of the backward search: uses only the engine's own tilt.
    let variants = [patternByNumber(n).state];
    for (let row = 0; row < 8; row++) variants = variants.flatMap((v) => [v, slide(v, row)]);
    const keys = new Set(variants.map(stateKey));
    for (const v of variants) {
      const col = (i) => columnOf(Math.floor(i / 4), i % 4, v.shifts[Math.floor(i / 4)]);
      for (let i = 0; i < 32; i++) {
        if (v.cells[i] === EMPTY) continue;
        for (let j = 0; j < 32; j++) {
          if (v.cells[j] !== EMPTY || col(i) !== col(j)) continue;
          const cells = [...v.cells]; cells[j] = cells[i]; cells[i] = EMPTY;
          for (const d of ['up', 'down']) {
            assert.ok(!keys.has(stateKey(tilt(makeState(cells, [...v.shifts]), d))));
          }
        }
      }
    }
  });
}

test('an ordinary pattern is not sealed', () => {
  const p = buildPerimeter(patternByNumber(4).state, { depth: 12, maxStates: 5000 });
  assert.ok(p.size > 256);
});
