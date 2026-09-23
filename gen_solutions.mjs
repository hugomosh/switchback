#!/usr/bin/env node
/**
 * Emit solutions.mjs from results/solutions.json, so the app can load the
 * matrix as an ordinary module (and the single-file bundle can inline it).
 * Regenerate with: node gen_solutions.mjs
 */
import fs from 'node:fs';

const store = JSON.parse(fs.readFileSync('results/solutions.json', 'utf8'));
const edges = Object.values(store.edges)
  .sort((a, b) => a.from - b.from || a.to - b.to)
  .map((e) => {
    const keep = { from: e.from, to: e.to, solved: e.solved, source: e.source };
    if (e.impossible) Object.assign(keep, { impossible: true, reason: e.reason });
    if (e.solved) Object.assign(keep, { length: e.length, moves: e.moves });
    else if (!e.impossible) keep.best = e.best;
    if (e.note) keep.note = e.note;
    return keep;
  });

const out = `/**
 * Pattern-to-pattern solutions, as a sparse matrix keyed "from>to".
 *
 * GENERATED FILE — produced by gen_solutions.mjs from results/solutions.json,
 * which sweep.mjs writes. Every solved entry was replayed through the engine
 * and landed on its target before it was stored. Moves use the replay alphabet:
 * slides 1-8, tilts U and D.
 *
 * Solver settings for these runs: ${JSON.stringify(store.solver)}
 */

/**
 * Patterns no other marble arrangement can reach. Proved by searching backwards:
 * their backward region is exactly their own 256 slider settings.
 */
export const SEALED = ${JSON.stringify(store.sealed ?? [])};

export const SOLUTIONS = ${JSON.stringify(edges, null, 1)};

export const solutionFor = (from, to) =>
  SOLUTIONS.find((e) => e.from === from && e.to === to);
`;
fs.writeFileSync('solutions.mjs', out);
const solved = edges.filter((e) => e.solved).length;
console.log(`solutions.mjs: ${edges.length} edges, ${solved} solved`);
