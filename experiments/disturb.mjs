/**
 * How much must be disturbed to make a fix?
 *
 * Breadth-first over board contents only: sliders can be set freely between
 * tilts, since slides never move a marble within its row, so a node is just
 * which hole holds what. Every tilt under every slider setting is an edge. The
 * search is only allowed through boards that differ from the starting board in
 * at most k holes — the answer is the smallest k at which the target appears.
 */
import { makeState, resolve, stateKey } from '../engine.mjs';
import { patternByNumber } from '../patterns.mjs';

const settings = [];
for (let m = 0; m < 256; m++) settings.push([...Array(8)].map((_, r) => (m >> r) & 1));
const REST = [0, 0, 0, 0, 0, 0, 0, 0];
const hamming = (a, b) => { let n = 0; for (let i = 0; i < 32; i++) if (a[i] !== b[i]) n++; return n; };

export function minimalDisturbance(startCells, targetCells, { kMax = 10, capPerK = 25000, budgetMs = 250000 } = {}) {
  const t0 = Date.now();
  const goal = targetCells.join('');
  const report = [];
  for (let k = 2; k <= kMax; k += 2) {
    const seen = new Set([startCells.join('')]);
    let frontier = [startCells];
    let found = false, depth = 0, capped = false;
    while (frontier.length && !found && !capped) {
      depth++;
      const next = [];
      for (const cells of frontier) {
        for (const shifts of settings) {
          for (const d of ['up', 'down']) {
            const { state, moved } = resolve(makeState([...cells], shifts), d);
            if (!moved.length) continue;
            const key = state.cells.join('');
            if (seen.has(key)) continue;
            if (hamming(state.cells, startCells) > k) continue;
            seen.add(key);
            if (key === goal) { found = true; break; }
            next.push(state.cells);
            if (seen.size >= capPerK) { capped = true; break; }
          }
          if (found || capped) break;
        }
        if (found || capped) break;
        if (Date.now() - t0 > budgetMs) { capped = true; break; }
      }
      frontier = next;
    }
    report.push({ k, found, tilts: found ? depth : null, explored: seen.size, complete: !capped && !found });
    if (found || Date.now() - t0 > budgetMs) break;
  }
  return report;
}

if (process.argv[1] && process.argv[1].endsWith('disturb.mjs')) {
  const start = [...'22011021211202000120211212111022'].map(Number);
  const target = [...patternByNumber(10).state.cells];
  for (const r of minimalDisturbance(start, target)) {
    console.log(`at most ${String(r.k).padStart(2)} holes disturbed: ` + (r.found
      ? `FIX FOUND — ${r.tilts} tilts`
      : `no fix; ${r.explored.toLocaleString()} boards${r.complete ? ', search COMPLETE — proven none at this size' : ', search capped'}`));
  }
}
