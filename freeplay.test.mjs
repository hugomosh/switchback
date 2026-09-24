import assert from 'node:assert/strict';
import test from 'node:test';
import { makeState, tilt, stateKey, provisionalStart, slide } from './engine.mjs';
import { createWorld, step, settle, trySlide, jammedRows, toState, atRest } from './freeplay.mjs';

let seed = 5;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
function randomBoard() {
  const cells = Array.from({ length: 32 }, (_, i) => (i < 12 ? 1 : i < 24 ? 2 : 0));
  for (let i = 31; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return makeState(cells, Array.from({ length: 8 }, () => (rnd() < 0.5 ? 1 : 0)));
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
  const s = slide(provisionalStart(), 2);   // opens a channel from row 3 into row 4
  const world = createWorld(s);
  settle(world, 0.01);
  assert.equal(stateKey(toState(world)), stateKey(s));
});

test('a marble caught between rows jams both bars, and the board has no engine position', () => {
  const s = slide(provisionalStart(), 2);
  assert.notEqual(stateKey(tilt(s, 'down')), stateKey(s), 'something does fall here');
  const world = createWorld(s);
  let t = 0;
  while (jammedRows(world).size === 0 && t < 2) { step(world, 1 / 240, 1.2); t += 1 / 240; }
  step(world, 1 / 240, 1.2);   // well past the snap distance
  const jammed = jammedRows(world);
  assert.ok(jammed.size >= 2);
  const row = [...jammed][0];
  assert.equal(trySlide(world, row), false, 'a straddled bar will not move');
  assert.equal(toState(world), null);
  assert.equal(atRest(world), false);
});

test('a bar slides freely at rest, carrying its marbles, and the engine agrees', () => {
  const s = randomBoard();
  const world = createWorld(s);
  for (const row of [0, 3, 3, 7, 5]) {
    assert.equal(trySlide(world, row), true);
  }
  let expected = s;
  for (const row of [0, 3, 3, 7, 5]) expected = slide(expected, row);
  assert.equal(stateKey(toState(world)), stateKey(expected));
});
