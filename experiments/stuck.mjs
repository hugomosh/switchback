/** Reproduce where the solver stalls on the still-stuck edges, and describe the difference. */
import fs from 'node:fs';
import { EMPTY, stateKey } from '../engine.mjs';
import { patternByNumber } from '../patterns.mjs';
import { solve } from '../solver.mjs';
import { buildPerimeter } from '../perimeter.mjs';

const name = (v) => ['void', 'purple', 'cyan'][v];
const out = {};
for (const [a, b] of [[6, 7], [7, 8], [9, 10]]) {
  const target = patternByNumber(b).state;
  const r = await solve(patternByNumber(a).state, target, {
    perimeter: buildPerimeter(target, { depth: 9, maxStates: 200_000 }), maxStates: 250_000, restarts: 2,
  });
  const stuck = r.states[r.states.length - 1];
  const diff = [];
  for (let i = 0; i < 32; i++) {
    if (stuck.cells[i] !== target.cells[i]) {
      diff.push(`row ${Math.floor(i / 4) + 1} slot ${i % 4}: ${name(stuck.cells[i])} (want ${name(target.cells[i])})`);
    }
  }
  console.log(`${a}>${b}  solved=${r.solved}  ${diff.length} holes differ, sliders ${stuck.shifts.join('')}`);
  for (const d of diff) console.log('    ' + d);
  out[`${a}>${b}`] = { cells: stuck.cells, shifts: stuck.shifts };
}
fs.writeFileSync('results/stuck.json', JSON.stringify(out));
