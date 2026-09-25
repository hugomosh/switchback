import assert from 'node:assert/strict';
import test from 'node:test';
import { makeState, tilt, stateKey, provisionalStart, slide } from './engine.mjs';
import {
  createWorld, step, settle, trySlide, holdBar, releaseBar, jammedRows, toState, atRest,
  cloneWorld, tiltAlong, SNAP,
} from './freeplay.mjs';

let seed = 5;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function randomBoard() {
  const cells = Array.from({ length: 32 }, (_, i) => (i < 12 ? 1 : i < 24 ? 2 : 0));
  for (let i = 31; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return makeState(cells, Array.from({ length: 8 }, () => (rnd() < 0.5 ? 1 : 0)));
}

/** Every row a marble overlaps must have a hole exactly where the marble is. */
function assertNoMarbleInABlock(world, context) {
  for (const m of world.marbles) {
    const rows = new Set([Math.floor(m.y + 1e-9), Math.ceil(m.y - 1e-9)]);
    for (const row of rows) {
      if (Math.abs(m.y - row) >= 1 - SNAP) continue;       // barely touching
      const offset = m.x - world.bar[row] - (row % 2);        // hole centres sit at even offsets
      const slot = Math.round(offset / 2);
      assert.ok(Math.abs(offset - 2 * slot) < 1e-6 && slot >= 0 && slot < 4,
        `${context}: marble at x=${m.x.toFixed(3)} y=${m.y.toFixed(3)} is inside a block of row ${row + 1}`);
    }
  }
}

test('a world at rest reads back as the board it was built from', () => {
  const s = randomBoard();
  assert.equal(stateKey(toState(createWorld(s))), stateKey(s));
});

test('with real gravity, a tilt comes to rest exactly where the engine puts it', () => {
  for (let n = 0; n < 300; n++) {
    const s = randomBoard();
    for (const [direction, angle] of [['down', 0.9], ['up', -0.9]]) {
      const world = createWorld(s);
      assert.ok(settle(world, angle), 'everything stops');
      assert.equal(stateKey(toState(world)), stateKey(tilt(s, direction)), `${stateKey(s)} ${direction}`);
    }
  }
});

test('a gentle tilt is held by friction', () => {
  const s = slide(provisionalStart(), 2);
  const world = createWorld(s);
  settle(world, 0.01);
  assert.equal(stateKey(toState(world)), stateKey(s));
});

test('no marble ever enters a block, whatever is done to the bars mid-fall', () => {
  for (let game = 0; game < 40; game++) {
    const world = createWorld(randomBoard());
    let angle = 0;
    const held = new Set();
    for (let t = 0; t < 900; t++) {
      const r = rnd();
      if (r < 0.02) angle = (rnd() * 2 - 1) * 1.2;
      else if (r < 0.05) trySlide(world, Math.floor(rnd() * 8));
      else if (r < 0.07) { const row = Math.floor(rnd() * 8); if (holdBar(world, row, rnd())) held.add(row); }
      else if (r < 0.09 && held.size) { const row = [...held][0]; releaseBar(world, row); held.delete(row); }
      step(world, 1 / 60, angle);
      assertNoMarbleInABlock(world, `game ${game}, step ${t}`);
    }
  }
});

test('a marble caught between rows jams both bars, and the board has no engine position', () => {
  const s = slide(provisionalStart(), 2);
  const world = createWorld(s);
  let t = 0;
  while (jammedRows(world).size === 0 && t < 2) { step(world, 1 / 240, 1.2); t += 1 / 240; }
  step(world, 1 / 240, 1.2);
  const jammed = jammedRows(world);
  assert.ok(jammed.size >= 2);
  const row = [...jammed][0];
  assert.equal(trySlide(world, row), false, 'a straddled bar will not move');
  assert.equal(holdBar(world, row, 0.5), false, 'nor can it be pushed part-way');
  assert.equal(toState(world), null);
  assert.equal(atRest(world), false);
});

test('bars take time to cross, carry their marbles, and end where the engine says', () => {
  const s = randomBoard();
  const world = createWorld(s);
  for (const row of [0, 3, 7, 5]) assert.equal(trySlide(world, row), true);
  step(world, 1 / 60, 0);
  assert.equal(toState(world), null, 'part-way across, it is not a board position yet');
  assert.ok(settle(world, 0));
  let expected = s;
  for (const row of [0, 3, 7, 5]) expected = slide(expected, row);
  assert.equal(stateKey(toState(world)), stateKey(expected));
});

test('the physical trick: close a bar mid-stream and it keeps some marbles back', () => {
  // Open row 3 onto row 4 and tip the tray: row 2 and row 3 empty downwards
  // together in the engine. Here, slide bar 3 shut as soon as it is free.
  const s = slide(provisionalStart(), 2);
  const engine = stateKey(tilt(s, 'down'));
  const world = createWorld(s);
  let closed = false;
  for (let t = 0; t < 600; t++) {
    step(world, 1 / 240, 1.2);
    if (!closed && world.marbles.some((m) => m.y > 3) && !jammedRows(world).has(2)) {
      closed = trySlide(world, 2);
    }
  }
  assert.ok(closed, 'the bar found a moment to close');
  assert.ok(settle(world, 1.2));
  const result = toState(world);
  assert.ok(result, 'it comes to rest as a real board');
  assert.notEqual(stateKey(result), engine, 'and not the one a plain tilt gives');
});

test('undo snapshots are independent copies', () => {
  const world = createWorld(randomBoard());
  const copy = cloneWorld(world);
  trySlide(world, 0);
  settle(world, 0.9);
  assert.notEqual(stateKey(toState(world)), stateKey(toState(copy)));
});

test('tilt follows the screen: turn the tray round and the same phone tilt reverses', () => {
  const screenDown = { x: 0, y: -0.5 };                 // bottom edge of the phone lowered
  assert.ok(tiltAlong(screenDown, { x: 0, y: -1 }) > 0, 'rows run down the screen: rolls toward row 8');
  assert.ok(tiltAlong(screenDown, { x: 0, y: 1 }) < 0, 'viewed from the far side: rolls toward row 1');
  assert.equal(tiltAlong({ x: 0.5, y: 0 }, { x: 0, y: -1 }), 0, 'sideways tilt does nothing to rows running up and down');
});
