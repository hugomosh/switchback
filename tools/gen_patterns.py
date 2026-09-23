"""Emit booklet.mjs from the transcription. Regenerate with: python3 gen_patterns.py"""
import json
import os

records = sorted(json.load(open('patterns.json')), key=lambda r: r['number'])
lines = [
    '/**',
    ' * The 52 challenge patterns from the Switchback booklet (Binary Arts #6400).',
    ' *',
    ' * GENERATED FILE — do not edit by hand. Produced by gen_patterns.py from the',
    ' * scanned booklet: boards located by their printed silhouette, marbles by',
    ' * colour, hole lattice fitted per board. Every entry satisfies the rules of',
    ' * the physical board (12 marbles of each colour, 8 voids, at most four',
    ' * marbles per row, one slider position per row), and every entry was',
    ' * reproduced identically from two independent rasterisations of the scan.',
    ' *',
    " * Codes are engine board codes: 32 hole digits (0 void, 1 purple, 2 cyan),",
    ' * a pipe, then the eight slider bits.',
    ' *',
    ' * Note: all 52 are drawn with every slider at rest, so a solved board is',
    ' * always the zero-gate configuration in which no tilt can move anything.',
    ' */',
    '',
    'export const BOOKLET = [',
]
for r in records:
    lines.append(f"  {{ number: {r['number']}, code: '{r['code']}' }},")
lines += ['];', '']
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'booklet.mjs'), 'w').write('\n'.join(lines))
print(f'booklet.mjs: {len(records)} patterns')
