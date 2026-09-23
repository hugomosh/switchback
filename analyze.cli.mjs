#!/usr/bin/env node
/**
 * Headless entry point for the reachability analysis.
 *
 *   node analyze.cli.mjs --rows 4 --slots 2 --orange 3 --green 3 --max 200000
 *
 * Runs the exact engine the SPA runs. If this and the browser ever disagree,
 * one of them is importing something it shouldn't.
 */
import { EMPTY, ORANGE, GREEN, makeState } from './engine.mjs';
import { analyse } from './analysis.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), Number(process.argv[i + 1]));
}
const rows = args.get('rows') ?? 4;
const slots = args.get('slots') ?? 2;
const orange = args.get('orange') ?? 2;
const green = args.get('green') ?? 2;
const maxStates = args.get('max') ?? 200_000;

const size = rows * slots;
if (orange + green > size) {
  console.error(`A ${rows}x${slots} board has ${size} holes; ${orange + green} marbles will not fit.`);
  process.exit(1);
}

const cells = [
  ...new Array(orange).fill(ORANGE),
  ...new Array(green).fill(GREEN),
  ...new Array(size - orange - green).fill(EMPTY),
];
const start = makeState(cells, new Array(rows).fill(0), { rows, slots });

console.log(`Board ${rows}x${slots} — ${orange} orange, ${green} green, ${size - orange - green} empty`);
const t0 = Date.now();
const report = analyse(start, { maxStates });
const seconds = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`States reached      ${report.states.toLocaleString()}${report.truncated ? ' (capped)' : ''}`);
console.log(`Search depth        ${report.maxDepth}`);
console.log(`Arrangements        ${report.coverage.reached.toLocaleString()} of ${report.coverage.total}`);
console.log(`Every arrangement   ${report.coverage.complete ? 'yes' : report.truncated ? 'unknown (search capped)' : 'no'}`);
console.log(`Even rearrangements ${report.permutations.even.toLocaleString()}`);
console.log(`Odd rearrangements  ${report.permutations.odd.toLocaleString()}`);
console.log(`Parity obstruction  ${report.truncated ? 'unknown (search capped)' : report.permutations.parityObstruction ? 'YES — only even permutations occur' : 'no'}`);
console.log(`Bare transposition  ${report.permutations.hasTransposition ? 'found' : 'none in reach'}`);
console.log(`Elapsed             ${seconds}s`);
