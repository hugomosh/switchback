"""Render each transcription beside its photograph so readings can be checked by eye."""
import json
from PIL import Image, ImageDraw
from extract import load, find_boards, crop_board, PURPLE, CYAN

COLOURS = {PURPLE: (150, 95, 180), CYAN: (120, 200, 215)}
CELL, PAD = 15, 6

def render(cells, shifts):
    w, h = 9 * CELL + 2 * PAD, 8 * CELL + 2 * PAD
    im = Image.new('RGB', (w, h), (74, 70, 66))
    d = ImageDraw.Draw(im)
    for row in range(8):
        for slot in range(4):
            col = 2 * slot + (row % 2) + shifts[row]
            x, y = PAD + col * CELL, PAD + row * CELL
            value = cells[row * 4 + slot]
            if value:
                d.ellipse([x + 2, y + 2, x + CELL - 2, y + CELL - 2], fill=COLOURS[value])
            else:
                d.ellipse([x + 4, y + 4, x + CELL - 4, y + CELL - 4], fill=(44, 42, 40))
    return im

def sheet(records, pages, out, per_row=6):
    tiles = []
    for r in records:
        page, comp = pages[r['number']]
        photo = crop_board(load(page), comp)
        photo = photo.resize((150, int(150 * photo.height / photo.width)))
        synth = render(r['cells'], r['shifts'])
        synth = synth.resize((150, int(150 * synth.height / synth.width)), Image.NEAREST)
        t = Image.new('RGB', (310, max(photo.height, synth.height) + 18), 'white')
        t.paste(photo, (0, 18)); t.paste(synth, (160, 18))
        ImageDraw.Draw(t).text((4, 4), f"#{r['number']}", fill='black')
        tiles.append(t)
    tw, th = tiles[0].size
    rows = (len(tiles) + per_row - 1) // per_row
    s = Image.new('RGB', (per_row * tw, rows * th), 'white')
    for k, t in enumerate(tiles):
        s.paste(t, ((k % per_row) * tw, (k // per_row) * th))
    s.save(out, quality=90)
    return s.size

if __name__ == '__main__':
    import sys
    records = json.load(open('patterns.json'))
    pages = {}
    for page in range(3, 10):
        grid = find_boards(load(page))
        for row_index, pair in enumerate(grid):
            half, in_half = divmod(row_index, 2)
            for col_index, comp in enumerate(pair):
                n = (page - 3) * 8 + 1 + 4 * half + 2 * (1 - col_index) + in_half
                if n <= 52:
                    pages[n] = (page, comp)
    lo, hi = int(sys.argv[1]), int(sys.argv[2])
    sel = [r for r in records if lo <= r['number'] <= hi]
    print(sheet(sel, pages, f'pages/verify-{lo}-{hi}.jpg'))
