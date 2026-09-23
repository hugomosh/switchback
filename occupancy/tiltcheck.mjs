// Cross-checks the C tilt against engine.mjs on random labelled boards.
import { execFileSync } from 'node:child_process';
import { makeState, tilt } from '../engine.mjs';
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const cases = [];
for (let n = 0; n < 20000; n++) {
  const cells = Array.from({ length: 32 }, (_, i) => i < 24 ? 1 + (i % 9) : 0);
  for (let i = 31; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const shifts = Array.from({ length: 8 }, () => (rnd() < 0.5 ? 1 : 0));
  cases.push({ cells, shifts, dir: rnd() < 0.5 ? 'up' : 'down' });
}
const input = cases.map((c) => `${c.cells.join('')} ${c.shifts.join('')} ${c.dir}`).join('\n');
const out = execFileSync(process.argv[2], { input }).toString().trim().split('\n');
let bad = 0;
cases.forEach((c, i) => { if (tilt(makeState(c.cells, c.shifts), c.dir).cells.join('') !== out[i]) bad++; });
console.log(`${cases.length} tilts compared, ${bad} mismatches; ${out.at(-1)}`);
process.exit(bad ? 1 : 0);
