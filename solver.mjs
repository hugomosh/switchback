/**
 * Find a sequence of moves carrying one board into another.
 *
 * Pure module: drives the same engine as the UI, so a solution it returns is a
 * solution on the real board. Every result is replayed through the engine
 * before being handed back — a plan that does not reproduce the target is
 * reported as a failure, never as a solution.
 *
 * The state space is far too large to search exhaustively (about 10^13 marble
 * arrangements before slider positions), and tilts are irreversible, which
 * rules out meeting in the middle. This is therefore a beam search: it finds a
 * route, not the shortest one.
 */

import { EMPTY, stateKey, legalMoves, applyMove, slide, tilt, makeState, columnOf } from './engine.mjs';
import { routeToGoal } from './perimeter.mjs';

/**
 * Holes whose contents differ from the target.
 *
 * This is measured in slot space on purpose. A slide carries a row's four
 * holes and their contents sideways as a rigid unit, so it cannot change what
 * a row contains — only tilts can. Contents are therefore the expensive part
 * of the distance, and alignment is nearly free. Scoring in column space
 * instead charges four misplaced marbles for a row that is one slide from
 * correct, which is what made an earlier version of this search stall.
 */
export function distance(state, target) {
  let wrong = 0;
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i] !== target.cells[i]) wrong++;
  }
  return wrong;
}

/**
 * Per-row weights for the search's notion of distance.
 *
 * Not every wrong hole costs the same to fix. A marble in the top row can only
 * leave downwards and one in the bottom row only upwards, so the outer rows are
 * both harder to fill and harder to disturb; the middle rows can be fed from
 * either side and are churned by almost every tilt. Weighting the outer rows
 * more makes the search lock them first and treat breaking them as expensive,
 * the way you would solve this by hand — edges first, middle last.
 */
export function rowWeights(rows, shape = 'edges', strength = 1.4) {
  const middle = (rows - 1) / 2;
  return Array.from({ length: rows }, (_, row) => {
    if (shape === 'flat') return 1;
    if (shape === 'top-down') return 1 + strength * (rows - 1 - row) / (rows - 1);
    if (shape === 'bottom-up') return 1 + strength * row / (rows - 1);
    return 1 + strength * Math.abs(row - middle) / middle;   // 'edges'
  });
}

/** Distance again, but charging each row at its own weight. */
export function weightedDistance(state, target, weights) {
  let total = 0;
  for (let row = 0; row < state.board.rows; row++) {
    const from = row * state.board.slots;
    let wrong = 0;
    for (let slot = 0; slot < state.board.slots; slot++) {
      if (state.cells[from + slot] !== target.cells[from + slot]) wrong++;
    }
    total += wrong * weights[row];
  }
  return total;
}

/** Rows holding marbles whose slider does not match the target's. */
export function misaligned(state, target) {
  let off = 0;
  for (let row = 0; row < state.board.rows; row++) {
    const from = row * state.board.slots;
    const holds = state.cells.slice(from, from + state.board.slots).some((c) => c !== EMPTY);
    if (holds && state.shifts[row] !== target.shifts[row]) off++;
  }
  return off;
}

/**
 * A "switch": slide a set of rows, let gravity resolve once, slide them back.
 *
 * This is the unit of play the instructions describe — "moving all open rows of
 * balls together as you switch your way to a solution" — and it is the right
 * unit for search because every printed target has its sliders at rest. Working
 * in switches keeps the search inside the space the targets live in, and gives
 * plans of twenty-odd moves instead of several hundred.
 */
export function switchMoves(rows) {
  const out = [];
  for (let subset = 1; subset < (1 << rows); subset++) {
    const slides = [];
    for (let row = 0; row < rows; row++) if (subset & (1 << row)) slides.push({ type: 'slide', row });
    for (const direction of ['up', 'down']) {
      out.push([...slides, { type: 'tilt', direction }, ...slides]);
    }
  }
  return out;
}

const applyAll = (state, moves) => moves.reduce(applyMove, state);

/** Every switch, as a (rows bitmask, direction) pair. */
export function switchList(rows) {
  const out = [];
  for (let subset = 1; subset < (1 << rows); subset++) {
    out.push([subset, 'up'], [subset, 'down']);
  }
  return out;
}

/**
 * Apply a switch in three state constructions rather than seventeen.
 * Sliding a row only flips its shift bit, so the slides either side of the
 * tilt collapse into two bulk flips. Identical in result to replaying the
 * primitive moves — asserted in the tests.
 */
export function applySwitch(state, subset, direction) {
  const flip = (s) => makeState(
    [...s.cells],
    s.shifts.map((bit, row) => ((subset >> row) & 1 ? 1 - bit : bit)),
    s.board,
  );
  return flip(tilt(flip(state), direction));
}

/** The primitive moves a switch stands for, for the plan the person reads. */
export function switchPrimitives(subset, direction, rows) {
  const slides = [];
  for (let row = 0; row < rows; row++) if ((subset >> row) & 1) slides.push({ type: 'slide', row });
  return [...slides, { type: 'tilt', direction }, ...slides];
}

/** Bring every slider back to rest, which costs one slide per shifted row. */
function toRest(state) {
  const moves = [];
  let s = state;
  for (let row = 0; row < state.board.rows; row++) {
    if (s.shifts[row]) { moves.push({ type: 'slide', row }); s = slide(s, row); }
  }
  return { state: s, moves };
}

async function switchPass(root, target, { beamWidth, maxDepth, maxStates, jitter, weights, breathe }, rnd) {
  const macros = switchMoves(root.board.rows);
  const seen = new Set([stateKey(root)]);
  let frontier = [{ state: root, from: null, moves: [] }];
  let explored = 1;
  let best = { node: frontier[0], value: distance(root, target) };

  for (let depth = 1; depth <= maxDepth && explored < maxStates; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const macro of macros) {
        const state = applyAll(node.state, macro);
        const key = stateKey(state);
        if (seen.has(key)) continue;
        seen.add(key);
        explored++;
        const child = { state, from: node, moves: macro };
        const value = distance(state, target);
        if (value < best.value) best = { node: child, value };
        if (value === 0) return { goal: child, best, explored };
        next.push({ child, rank: weightedDistance(state, target, weights) + jitter * rnd() });
      }
      if (explored >= maxStates) break;
    }
    if (!next.length) break;
    next.sort((a, b) => a.rank - b.rank);
    frontier = next.slice(0, beamWidth).map((n) => n.child);
    if (breathe) await breathe();
  }
  return { goal: null, best, explored };
}

function traceMoves(node) {
  const moves = [];
  for (let n = node; n && n.moves; n = n.from) moves.unshift(...n.moves);
  return moves;
}

const describe = (move) =>
  move.type === 'slide' ? `slide row ${move.row + 1}` : `tilt ${move.direction}`;

/** Deterministic generator, so a reported solution can always be reproduced. */
function generator(seed) {
  let n = seed >>> 0;
  return () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/**
 * One beam pass from `root`. Returns the goal node if it found one, otherwise
 * the closest node it reached, for the next pass to restart from.
 */
async function beamPass(root, target, { beamWidth, maxDepth, maxStates, jitter, explore, weights, breathe, perimeter }, rnd) {
  // Contents are weighted 4 and alignment 1. The two ranges deliberately overlap:
  // letting alignment outrank a hole keeps the beam varied, and measured better.
  const score = (s) => weightedDistance(s, target, weights) * 4 + misaligned(s, target);
  const seen = new Set([stateKey(root)]);
  let frontier = [{ state: root, from: null, move: null }];
  let explored = 1;
  let best = { node: frontier[0], value: score(root) };

  for (let depth = 1; depth <= maxDepth && explored < maxStates; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const move of legalMoves(node.state)) {
        const state = applyMove(node.state, move);
        const key = stateKey(state);
        if (seen.has(key)) continue;
        seen.add(key);
        explored++;
        const child = { state, from: node, move };
        const value = score(state);
        if (value < best.value) best = { node: child, value };
        if (distance(state, target) === 0 && misaligned(state, target) === 0) return { goal: child, best, explored };
        // Touching the target's perimeter is as good as arriving: the rest of
        // the route is already known, worked out backwards from the target.
        if (perimeter && perimeter.map.has(key)) return { goal: child, best, explored, via: key };
        next.push({ child, rank: value + jitter * rnd() });
      }
      if (explored >= maxStates) break;
    }
    if (!next.length) break;
    next.sort((a, b) => a.rank - b.rank);

    // Part of the beam is kept for positions that score worse. Near the goal
    // every successor scores the same, so a purely greedy beam fills up with
    // one neighbourhood of the plateau and prunes away exactly the moves that
    // escape it — the ones that displace a correctly placed marble to free the
    // hole its neighbour needs. Those have to survive selection to be found.
    const greedy = Math.max(1, Math.round(beamWidth * (1 - explore)));
    const chosen = next.slice(0, greedy);
    const rest = next.slice(greedy);
    const wanted = beamWidth - chosen.length;
    for (let i = 0; i < wanted && rest.length; i++) {
      chosen.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
    }
    frontier = chosen.map((n) => n.child);
    if (breathe && depth % 4 === 0) await breathe();
  }
  return { goal: null, best, explored };
}

/**
 * @returns {{solved: boolean, moves: object[], states: object[], explored: number,
 *            best: number, labels: string[], reason?: string}}
 */
export async function solve(start, target, options = {}) {
  const {
    beamWidth = 900,
    maxDepth = 400,
    maxStates = 900_000,
    restarts = 5,
    jitter = 0.9,
    explore = 0,        // share of the beam reserved for worse-scoring positions
    switchBeam = 250,
    switchDepth = 40,
    weighting = 'flat',
    weightStrength = 1.4,
    switches = false,   // short plans, but measurably worse at finding one at all
    seed = 20260915,
    onProgress = null,
    breathe = null,   // awaited periodically so a browser stays responsive
    perimeter = null, // positions near the target with known routes; see perimeter.mjs
  } = options;

  if (distance(start, target) === 0 && misaligned(start, target) === 0) {
    return { solved: true, moves: [], states: [start], explored: 1, best: 0, labels: [] };
  }

  const weights = rowWeights(start.board.rows, weighting, weightStrength);
  const rnd = generator(seed);
  let root = start;
  let prefix = [];
  let explored = 0;
  let bestSeen = Infinity;

  // Phase one: search in switches, if the target is a rest position (all 52
  // printed ones are). Plans from this phase are short enough to play by hand.
  if (switches && target.shifts.every((s) => s === 0)) {
    const rest = toRest(start);
    const pass = await switchPass(rest.state, target, {
      beamWidth: switchBeam, maxDepth: switchDepth, maxStates, jitter: 0.6, weights, breathe,
    }, rnd);
    explored += pass.explored;
    if (pass.goal) {
      return finish(rest.moves.concat(traceMoves(pass.goal)), explored, start, target);
    }
    bestSeen = Math.min(bestSeen, pass.best.value);
    if (onProgress) onProgress({ attempt: 0, explored, best: bestSeen, phase: 'switches' });
    const reached = traceMoves(pass.best.node);
    if (reached.length) {
      prefix = rest.moves.concat(reached);
      root = pass.best.node.state;
    }
  }

  for (let attempt = 0; attempt <= restarts; attempt++) {
    const pass = await beamPass(root, target, {
      beamWidth, maxDepth, maxStates, breathe, explore, weights, perimeter,
      jitter: attempt === 0 ? 0 : jitter,   // the first pass is greedy, and measured best that way
    }, rnd);
    explored += pass.explored;

    if (pass.goal) {
      const tail = pass.via ? routeToGoal(perimeter, pass.via) : [];
      return finish(prefix.concat(trace(pass.goal).moves, tail), explored, start, target);
    }
    bestSeen = Math.min(bestSeen, Math.floor(pass.best.value / 4));
    if (onProgress) onProgress({ attempt: attempt + 1, explored, best: bestSeen, phase: 'single moves' });

    // Restart from the closest position reached, keeping the moves that got there.
    const reached = trace(pass.best.node);
    if (!reached.moves.length) break;        // the pass made no progress at all
    prefix = prefix.concat(reached.moves);
    root = pass.best.node.state;
  }

  let replay = start;
  const states = [replay];
  for (const move of prefix) { replay = applyMove(replay, move); states.push(replay); }
  return { solved: false, moves: prefix, states, explored, best: bestSeen,
           labels: prefix.map(describe),
           reason: `search stopped ${bestSeen} hole${bestSeen === 1 ? '' : 's'} short of the target` };
}

function trace(node) {
  const moves = [];
  for (let n = node; n && n.move; n = n.from) moves.unshift(n.move);
  return { moves };
}

function finish(moves, explored, start, target) {
  // Replay from scratch: the plan counts as a solution only if the engine agrees.
  let replay = start;
  const states = [replay];
  for (const move of moves) { replay = applyMove(replay, move); states.push(replay); }
  if (distance(replay, target) !== 0 || misaligned(replay, target) !== 0) {
    return { solved: false, moves: [], states: [], explored, best: distance(replay, target),
             labels: [],
             reason: 'the plan did not replay to the target — that is a bug, not a hard puzzle' };
  }
  return { solved: true, moves, states, explored, best: 0, labels: moves.map(describe) };
}
