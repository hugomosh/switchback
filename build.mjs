#!/usr/bin/env node
/**
 * Build a single self-contained HTML file from the module sources.
 *
 * The modules stay the source of truth — this bundles them, it does not
 * reimplement anything. Run it after any change to the engine or the views:
 *
 *   node build.mjs
 *
 * Output: switchback.html, openable straight from disk with no server.
 */
import { build } from 'esbuild';
import fs from 'node:fs/promises';

const OUT = 'switchback.html';

const { outputFiles } = await build({
  entryPoints: ['app.mjs'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  write: false,
  legalComments: 'none',
});
const script = outputFiles[0].text;

const shell = await fs.readFile('index.html', 'utf8');
const inlined = shell.replace(
  /<script type="module" src="\.\/app\.mjs"><\/script>/,
  `<script>\n${script}</script>`,
);

if (inlined === shell) {
  console.error('Could not find the module script tag in index.html — build aborted.');
  process.exit(1);
}

await fs.writeFile(OUT, inlined);
const kb = (Buffer.byteLength(inlined) / 1024).toFixed(1);
console.log(`Wrote ${OUT} (${kb} kB, no external requests)`);
