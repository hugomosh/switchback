#!/usr/bin/env node
/**
 * Solve a set of pattern-to-pattern edges and store them as a sparse matrix.
 *
 *   node sweep.mjs                    the cycle 0 -> 1 -> ... -> 52 -> 0
 *   node sweep.mjs --edges 3>7,7>3    specific edges
 *   node sweep.mjs --retry            re-run edges that previously failed
 *   node sweep.mjs --for 250          stop starting new edges after 250s
 *
 * Results live in results/solutions.json, keyed "from>to", so the full 53 x 53
 * matrix can be filled in over many runs without anything being redone.
 *
 * Every stored solution is replayed through the engine before it is written.
 * A plan that does not land on its target is never recorded as solved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { applyMove } from './engine.mjs';
import { ALL_PATTERNS, patternByNumber, compare } from './patterns.mjs';
import { solve } from './solver.mjs';
import { HAND_PLAYED } from './routes.mjs';
import { removeLoops } from './shorten.mjs';
import { buildPerimeter } from './perimeter.mjs';

const FILE = 'results/solutions.json';
const SOLVER = { beamWidth: 900, maxStates: 250_000, restarts: 2, maxDepth: 400 };

// --- the replay alphabet the app already uses: slides 1-8, tilts U and D ----
const encode = (moves) => moves
  .map((m) => (m.type === 'slide' ? String(m.row + 1) : m.direction === 'up' ? 'U' : 'D'))
  .join('');
const decode = (text) => [...text].map((ch) => (ch >= '1' && ch <= '8'
  ? { type: 'slide', row: Number(ch) - 1 }
  : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' }));

export const edgeKey = (from, to) => `${from}>${to}`;

export function load() {
  if (!fs.existsSync(FILE)) {
    return { version: 1, solver: SOLVER, edges: {} };
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

/** Write via a temporary file, so an interrupted run never leaves half a file. */
export function save(store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
  fs.renameSync(tmp, FILE);
}

/**
 * A target is sealed when no tilt, under any slider setting, can produce its
 * marble arrangement: its backward region never grows past its own 256 slider
 * settings. Nothing with a different arrangement can ever reach it, so edges
 * into it are recorded as impossible instead of being searched.
 */
const sealedCache = new Map();
export function isSealed(n) {
  if (!sealedCache.has(n)) {
    const p = buildPerimeter(patternByNumber(n).state, { depth: 12, maxStates: 3000 });
    sealedCache.set(n, p.size <= 256);
  }
  return sealedCache.get(n);
}

/** Positions near each target with known routes, built once per target. */
const perimeterCache = new Map();
function perimeterFor(n) {
  if (!perimeterCache.has(n)) {
    perimeterCache.set(n, buildPerimeter(patternByNumber(n).state, { depth: 9, maxStates: 200_000 }));
  }
  return perimeterCache.get(n);
}

/** Strip loops from a stored route; returns the shorter move string. */
function tighten(from, moves) {
  return encode(removeLoops(patternByNumber(from).state, decode(moves)));
}

/** True only if the moves carry `from` exactly onto `to`. */
export function verify(from, to, moves) {
  let state = patternByNumber(from).state;
  for (const move of decode(moves)) state = applyMove(state, move);
  return compare(state, patternByNumber(to).state).solved;
}

function cycle() {
  const numbers = ALL_PATTERNS.map((p) => p.number);
  return numbers.map((n, i) => [n, numbers[(i + 1) % numbers.length]]);
}

/** Hand-played routes that start exactly on a pattern become matrix entries too. */
function seedHandRoutes(store) {
  for (const route of HAND_PLAYED) {
    const [boardPart, moves] = route.code.split('~');
    const start = ALL_PATTERNS.find((p) =>
      p.state.cells.join('') + '|' + p.state.shifts.join('') === boardPart);
    if (!start) continue;                         // began mid-game, not on a pattern
    const key = edgeKey(start.number, route.target);
    const tight = tighten(start.number, moves);
    if (store.edges[key]?.solved && store.edges[key].length <= tight.length) continue;
    if (!verify(start.number, route.target, tight)) {
      throw new Error(`hand route ${route.name} does not replay to its target`);
    }
    store.edges[key] = {
      from: start.number, to: route.target, solved: true,
      length: tight.length, rawLength: moves.length, moves: tight,
      source: 'hand', note: route.name,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const retry = args.includes('--retry');
  // Stop starting new edges after this many seconds, so a run can be split
  // across several invocations. Results are saved per edge, so nothing is lost.
  const forSeconds = args.includes('--for') ? Number(args[args.indexOf('--for') + 1]) : Infinity;
  const startedAt = Date.now();
  const edgeArg = args[args.indexOf('--edges') + 1];
  const edges = args.includes('--edges')
    ? edgeArg.split(',').map((e) => e.split('>').map(Number))
    : cycle();

  const store = load();
  store.solver = { ...SOLVER, perimeter: { depth: 9, maxStates: 200000 } };
  store.sealed = ALL_PATTERNS.map((p) => p.number).filter((n) => isSealed(n));
  seedHandRoutes(store);
  save(store);

  const todo = edges.filter(([a, b]) => {
    const existing = store.edges[edgeKey(a, b)];
    return !existing || (retry && !existing.solved);
  });
  console.log(`${edges.length} edges requested, ${todo.length} to solve`);

  for (const [from, to] of todo) {
    if ((Date.now() - startedAt) / 1000 > forSeconds) {
      console.log('time budget reached; run again to continue');
      break;
    }
    const began = Date.now();
    const key0 = edgeKey(from, to);
    if (from !== to && isSealed(to)) {
      store.edges[key0] = { from, to, solved: false, impossible: true, source: 'proof',
        reason: `no tilt can produce pattern ${to}; only its own slider settings reach it` };
      save(store);
      console.log(`${key0.padEnd(6)} impossible — pattern ${to} is sealed`);
      continue;
    }
    const result = await solve(patternByNumber(from).state, patternByNumber(to).state,
      { ...SOLVER, perimeter: perimeterFor(to) });
    const seconds = Math.round((Date.now() - began) / 100) / 10;
    const key = edgeKey(from, to);

    if (result.solved) {
      const raw = encode(result.moves);
      const moves = tighten(from, raw);
      if (!verify(from, to, moves)) throw new Error(`${key}: plan failed to replay`);
      store.edges[key] = { from, to, solved: true, length: moves.length, rawLength: raw.length,
                           moves, explored: result.explored, seconds, source: 'solver' };
    } else {
      store.edges[key] = { from, to, solved: false, best: result.best,
                           explored: result.explored, seconds, source: 'solver' };
    }
    save(store);
    console.log(`${key.padEnd(6)} ${result.solved ? `solved in ${result.moves.length}` : `stuck at ${result.best}`}  (${seconds}s)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('sweep.mjs')) main();
