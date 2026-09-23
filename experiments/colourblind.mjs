/**
 * Colour-blind analysis on boards small enough to enumerate completely.
 *
 * 1. Occupancy graph. A node is which holes are filled; an edge is a tilt under
 *    any slider setting. Slides never change a row's contents, so they are free
 *    moves here and the sliders can be set however you like before each tilt.
 *    Its strongly connected components are the sets of hole patterns that can
 *    all reach one another; the edges between them are one-way doors.
 *
 * 2. Colour test. The same search with coloured marbles. If, inside a
 *    component, every colouring of every hole pattern is reachable, then colour
 *    does not matter there and the puzzle reduces to occupancy.
 *
 * Runs the real engine throughout — nothing here reimplements a rule.
 */
import { makeState, resolve } from '../engine.mjs';

function settingsFor(rows) {
  const out = [];
  for (let m = 0; m < (1 << rows); m++) out.push([...Array(rows)].map((_, r) => (m >> r) & 1));
  return out;
}

/** Every tilt result from `cells`, under every slider setting. */
function successors(cells, board, settings) {
  const out = new Set();
  for (const shifts of settings) {
    for (const d of ['up', 'down']) {
      const { state, moved } = resolve(makeState([...cells], shifts, board), d);
      if (moved.length) out.add(state.cells.join(''));
    }
  }
  return out;
}

function occupancies(size, marbles) {
  const out = [];
  const rec = (i, left, acc) => {
    if (i === size) { if (left === 0) out.push(acc.join('')); return; }
    if (left) rec(i + 1, left - 1, [...acc, 1]);
    if (size - i > left) rec(i + 1, left, [...acc, 0]);
  };
  rec(0, marbles, []);
  return out;
}

/** Tarjan's strongly connected components, iterative. */
function components(nodes, edges) {
  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  let counter = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work = [[root, [...edges.get(root)], 0]];
    index.set(root, counter); low.set(root, counter); counter++;
    stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, succ] = frame;
      if (frame[2] < succ.length) {
        const w = succ[frame[2]++];
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++;
          stack.push(w); onStack.add(w);
          work.push([w, [...edges.get(w)], 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v), index.get(w)));
        }
      } else {
        work.pop();
        if (work.length) {
          const u = work[work.length - 1][0];
          low.set(u, Math.min(low.get(u), low.get(v)));
        }
        if (low.get(v) === index.get(v)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
          out.push(comp);
        }
      }
    }
  }
  return out;
}

export function analyse(rows, slots, purple, cyan) {
  const board = { rows, slots };
  const size = rows * slots;
  const settings = settingsFor(rows);
  const marbles = purple + cyan;

  // --- occupancy graph and its components ---------------------------------
  const nodes = occupancies(size, marbles);
  const edges = new Map();
  for (const occ of nodes) {
    const cells = [...occ].map(Number);
    edges.set(occ, [...successors(cells, board, settings)].filter((k) => k !== occ));
  }
  const comps = components(nodes, edges);
  const compOf = new Map();
  comps.forEach((c, i) => c.forEach((n) => compOf.set(n, i)));
  const incoming = new Array(comps.length).fill(0);
  const outgoing = new Array(comps.length).fill(0);
  for (const [v, ws] of edges) {
    for (const w of ws) {
      if (compOf.get(v) !== compOf.get(w)) { outgoing[compOf.get(v)]++; incoming[compOf.get(w)]++; }
    }
  }
  const sizes = comps.map((c) => c.length).sort((a, b) => b - a);
  const biggest = comps.reduce((a, b) => (b.length > a.length ? b : a));
  const bigIndex = comps.indexOf(biggest);

  // --- colour test inside the biggest component ---------------------------
  // Start from one colouring of one hole pattern in it and search coloured
  // boards. Colour is irrelevant there if every colouring of every hole
  // pattern in the component shows up.
  const startOcc = [...biggest[0]].map(Number);
  let p = purple;
  const startCells = startOcc.map((c) => (c ? (p-- > 0 ? 1 : 2) : 0));
  const seen = new Set([startCells.join('')]);
  const queue = [startCells];
  while (queue.length) {
    const cells = queue.pop();
    for (const key of successors(cells, board, settings)) {
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([...key].map(Number));
    }
  }
  const colourings = binom(marbles, purple);
  const reachedPerOcc = new Map();
  for (const key of seen) {
    const occ = [...key].map((c) => (c === '0' ? 0 : 1)).join('');
    reachedPerOcc.set(occ, (reachedPerOcc.get(occ) ?? 0) + 1);
  }
  let full = 0, partial = 0, missing = 0;
  for (const occ of biggest) {
    const n = reachedPerOcc.get(occ) ?? 0;
    if (n === colourings) full++; else if (n > 0) partial++; else missing++;
  }

  return {
    board: `${rows}x${slots}, ${purple}+${cyan} marbles`,
    patterns: nodes.length,
    components: comps.length,
    sizes: sizes.slice(0, 6),
    sources: comps.filter((_, i) => incoming[i] === 0 && comps.length > 1).length,
    biggest: biggest.length,
    biggestLeaks: outgoing[bigIndex] > 0,
    colourings,
    colourFull: full,
    colourPartial: partial,
    colourMissing: missing,
  };
}

function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }

if (process.argv[1] && process.argv[1].endsWith('colourblind.mjs')) {
  for (const [r, s, a, b] of [[4, 2, 2, 2], [4, 3, 3, 3], [6, 2, 3, 3], [4, 3, 2, 4]]) {
    const t0 = Date.now();
    const x = analyse(r, s, a, b);
    console.log(`\n${x.board} — ${x.patterns} hole patterns  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(`  ${x.components} components; largest sizes ${x.sizes.join(', ')}; ${x.sources} with no way in`);
    console.log(`  biggest component: ${x.biggest} hole patterns${x.biggestLeaks ? ', and it leaks — some moves leave it for good' : ', closed'}`);
    console.log(`  colour inside it: ${x.colourFull} patterns reached in all ${x.colourings} colourings, `
      + `${x.colourPartial} only partly, ${x.colourMissing} not at all`);
  }
}
