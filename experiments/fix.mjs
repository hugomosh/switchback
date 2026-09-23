/**
 * Look for the sequence that fixes a stalled board: rest to rest, every other
 * hole restored. Two switches forward from the stalled board, checked against
 * the target's perimeter built backwards, reaches roughly two switches plus ten
 * single moves from the target.
 */
import fs from 'node:fs';
import { makeState, stateKey } from '../engine.mjs';
import { patternByNumber } from '../patterns.mjs';
import { distance, switchList, applySwitch, switchPrimitives } from '../solver.mjs';
import { buildPerimeter, routeToGoal } from '../perimeter.mjs';

const stuck = JSON.parse(fs.readFileSync('results/stuck.json', 'utf8'));
const list = switchList(8);
const found = {};

for (const [edge, s] of Object.entries(stuck)) {
  const to = Number(edge.split('>')[1]);
  const target = patternByNumber(to).state;
  const start = makeState(s.cells, s.shifts);
  const t0 = Date.now();
  const per = buildPerimeter(target, { depth: 10, maxStates: 450_000 });

  let hit = null;
  let best = distance(start, target);
  const level1 = [];
  outer:
  for (const [a, da] of list) {
    const x = applySwitch(start, a, da);
    best = Math.min(best, distance(x, target));
    if (per.map.has(stateKey(x))) { hit = { steps: [[a, da]], key: stateKey(x) }; break; }
    level1.push([x, [a, da]]);
  }
  if (!hit) {
    for (const [x, first] of level1) {
      for (const [b, db] of list) {
        const y = applySwitch(x, b, db);
        const d = distance(y, target);
        if (d < best) best = d;
        if (per.map.has(stateKey(y))) { hit = { steps: [first, [b, db]], key: stateKey(y) }; break; }
      }
      if (hit) break;
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (hit) {
    const moves = [...hit.steps.flatMap(([m, d]) => switchPrimitives(m, d, 8)), ...routeToGoal(per, hit.key)];
    found[edge] = moves;
    console.log(`${edge.padEnd(6)} FIXED — ${hit.steps.length} switch(es) then ${routeToGoal(per, hit.key).length} moves back to the target: ${moves.length} moves  (${secs}s, perimeter ${per.size.toLocaleString()})`);
  } else {
    console.log(`${edge.padEnd(6)} no fix within 2 switches + ${per.depth} moves; closest ${best}  (${secs}s, perimeter ${per.size.toLocaleString()})`);
  }
}
fs.writeFileSync('results/fixes.json', JSON.stringify(found));
