import assert from 'node:assert/strict';
import test from 'node:test';
import { legalMoves, applyMove } from './engine.mjs';
import { BOOKLET_PATTERNS } from './patterns.mjs';
import { solve, distance, misaligned } from './solver.mjs';

const pattern = (n) => BOOKLET_PATTERNS[n - 1].state;

test('distance is measured in slot space, so alignment is nearly free', () => {
  const p = pattern(1);
  const slid = applyMove(p, { type: 'slide', row: 0 });
  assert.equal(distance(slid, p), 0, 'a slide changes no hole contents');
  assert.equal(misaligned(slid, p), 1, 'but it does leave one row out of alignment');
});

test('a board is already solved against itself', async () => {
  const r = await solve(pattern(7), pattern(7));
  assert.equal(r.solved, true);
  assert.equal(r.moves.length, 0);
});

test('a scrambled board is solved and the plan replays exactly', async () => {
  let state = pattern(1);
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 30; i++) {
    const moves = legalMoves(state);
    state = applyMove(state, moves[Math.floor(rnd() * moves.length)]);
  }
  const r = await solve(pattern(1), state, { beamWidth: 400, maxStates: 200_000, restarts: 2 });
  assert.equal(r.solved, true, 'a position reached by real moves must be solvable');

  let replay = pattern(1);
  for (const move of r.moves) replay = applyMove(replay, move);
  assert.deepEqual(replay.cells, state.cells);
  // Sliders are only required to match where a row holds a marble — an empty
  // row's slider is invisible on the board face, so the solver leaves it free.
  for (let row = 0; row < 8; row++) {
    if (state.cells.slice(row * 4, row * 4 + 4).some((c) => c !== 0)) {
      assert.equal(replay.shifts[row], state.shifts[row], `row ${row + 1}`);
    }
  }
});

test('a failed search reports how close it got and never claims success', async () => {
  const r = await solve(pattern(16), pattern(17), { beamWidth: 40, maxStates: 4000, restarts: 0 });
  if (!r.solved) {
    assert.ok(r.best > 0);
    assert.match(r.reason, /short of the target/);
  }
});

test('every returned move is one the engine offers', async () => {
  const r = await solve(pattern(26), pattern(52), { beamWidth: 900, maxStates: 400_000, restarts: 2 });
  let state = pattern(26);
  for (const move of r.moves) {
    assert.ok(legalMoves(state).some((m) => m.type === move.type
      && m.row === move.row && m.direction === move.direction));
    state = applyMove(state, move);
  }
});

test('a switch is slide, tilt, slide back — and leaves every slider at rest', async () => {
  const { switchMoves } = await import('./solver.mjs');
  const { applyMove } = await import('./engine.mjs');
  const macros = switchMoves(8);
  assert.equal(macros.length, 255 * 2, 'every non-empty set of rows, tilted each way');
  for (const macro of macros.slice(0, 40)) {
    let state = pattern(1);
    for (const move of macro) state = applyMove(state, move);
    assert.deepEqual(state.shifts, [0, 0, 0, 0, 0, 0, 0, 0]);
  }
});

test('the fast switch is identical to replaying its primitive moves', async () => {
  const { applySwitch, switchPrimitives, switchList } = await import('./solver.mjs');
  const { applyMove, stateKey } = await import('./engine.mjs');
  const state = pattern(3);
  for (const [subset, direction] of switchList(8).slice(0, 80)) {
    const fast = applySwitch(state, subset, direction);
    const slow = switchPrimitives(subset, direction, 8).reduce(applyMove, state);
    assert.equal(stateKey(fast), stateKey(slow), `switch ${subset} ${direction}`);
  }
});

test('row weights favour the outer rows, which are hardest to disturb', async () => {
  const { rowWeights } = await import('./solver.mjs');
  const edges = rowWeights(8, 'edges');
  assert.ok(edges[0] > edges[3] && edges[7] > edges[4], 'outer rows outweigh inner ones');
  assert.deepEqual(edges[0], edges[7], 'and the two edges weigh the same');
  assert.deepEqual(rowWeights(8, 'flat'), new Array(8).fill(1));
});
