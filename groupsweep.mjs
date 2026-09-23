#!/usr/bin/env node
/**
 * Fill the whole pattern matrix with the colour solver (occupancy/groupsolve.c).
 *
 *   node groupsweep.mjs               every target, four at a time
 *   node groupsweep.mjs --to 4,7      only these targets
 *   node groupsweep.mjs --jobs 2      fewer parallel solvers (each needs ~350 MB)
 *
 * For each target it runs one solver process with all 53 starting boards. The
 * solver also reports the size of the colour orbit at the target's hole pattern;
 * a full orbit (all 2,704,156 colourings) is the certificate that colour is no
 * obstacle there. Every route is replayed through the engine and loop-stripped
 * before it is stored, and it only replaces an existing route if it is shorter.
 */
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { ALL_PATTERNS, patternByNumber } from './patterns.mjs';
import { stateKey } from './engine.mjs';
import { removeLoops } from './shorten.mjs';
import { load, save, verify, edgeKey, isSealed } from './sweep.mjs';

const encode = (moves) => moves
  .map((m) => (m.type === 'slide' ? String(m.row + 1) : m.direction === 'up' ? 'U' : 'D'))
  .join('');
const decode = (text) => [...text].map((ch) => (ch >= '1' && ch <= '8'
  ? { type: 'slide', row: Number(ch) - 1 }
  : { type: 'tilt', direction: ch === 'U' ? 'up' : 'down' }));

export function build() {
  const bin = 'occupancy/build/groupsolve';
  const src = 'occupancy/groupsolve.c';
  if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) {
    fs.mkdirSync('occupancy/build', { recursive: true });
    execFileSync('cc', ['-O3', '-march=native', '-o', bin, src]);
  }
  return bin;
}

function run(bin, target) {
  const starts = ALL_PATTERNS.map((p) => stateKey(p.state));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [patternByNumber(target).state.cells.join('')]);
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) return reject(new Error(`solver exited ${code} on target ${target}`));
      const lines = out.trim().split('\n');
      const [, reached, total, loops, farthest] = lines.shift().split(' ').map(Number);
      resolve({ orbit: { reached, total, loops, farthest }, routes: lines });
    });
    child.stdin.end(starts.join('\n') + '\n');
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const jobs = Number(opt('--jobs') ?? Math.min(4, os.cpus().length));
  const numbers = ALL_PATTERNS.map((p) => p.number);
  const targets = (opt('--to')?.split(',').map(Number) ?? numbers).filter((n) => !isSealed(n));
  const bin = build();

  const store = load();
  store.sealed = numbers.filter((n) => isSealed(n));
  store.orbits ??= {};
  let improved = 0, added = 0;

  // Every edge into a sealed pattern is impossible; record them all.
  for (const to of store.sealed) {
    for (const from of numbers) {
      if (from === to || store.edges[edgeKey(from, to)]?.impossible) continue;
      store.edges[edgeKey(from, to)] = { from, to, solved: false, impossible: true, source: 'proof',
        reason: `no tilt can produce pattern ${to}; only its own slider settings reach it` };
    }
  }

  const queue = [...targets];
  const worker = async () => {
    while (queue.length) {
      const to = queue.shift();
      const began = Date.now();
      const { orbit, routes } = await run(bin, to);
      store.orbits[to] = orbit;
      routes.forEach((line, i) => {
        const from = numbers[i];
        if (from === to) return;
        const key = edgeKey(from, to);
        if (line.startsWith('FAIL')) { console.log(`${key} ${line}`); return; }
        const moves = encode(removeLoops(patternByNumber(from).state, decode(line)));
        if (!verify(from, to, moves)) throw new Error(`${key}: group route failed to replay`);
        const old = store.edges[key];
        if (old?.solved && old.length <= moves.length) return;
        if (old?.solved) improved++; else added++;
        store.edges[key] = { from, to, solved: true, length: moves.length, rawLength: line.length,
                             moves, source: 'group' };
      });
      save(store);
      const full = orbit.reached === orbit.total ? 'full orbit' : `orbit ${orbit.reached}/${orbit.total}`;
      console.log(`target ${String(to).padStart(2)}: ${full}, ${orbit.loops} loops  `
        + `(${((Date.now() - began) / 1000).toFixed(0)}s)`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  save(store);
  console.log(`${added} edges newly solved, ${improved} shortened`);
}

if (process.argv[1] && process.argv[1].split('/').pop() === 'groupsweep.mjs') main();
