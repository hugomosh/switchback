"""
Transcribe the 52 Switchback booklet patterns from the scanned spreads.

Approach: the printed artwork is identical in all 52 illustrations, so board
outlines are found by their dark silhouette, marbles by their colour, and the
hole lattice is fitted per board from the marbles themselves. Every pattern is
then validated against the rules of the physical board, so a misread is
reported rather than silently emitted.
"""
import json
import sys
import numpy as np
from PIL import Image
from detect_boards import load, board_mask, components

PURPLE, CYAN = 1, 2
ROWS, SLOTS = 8, 4

# Lattice as fractions of the rotated board crop, calibrated on pattern 1.
CAL = None


def find_boards(page_im):
    small = np.asarray(page_im.resize((page_im.width // 6, page_im.height // 6), Image.BILINEAR))
    comps = components(board_mask(small), 800)
    comps.sort(key=lambda c: -c['area'])
    comps = comps[:8]
    comps.sort(key=lambda c: c['y0'])
    out = []
    for pair in range(0, len(comps), 2):
        row = sorted(comps[pair:pair + 2], key=lambda c: c['x0'])
        out.append(row)
    return out


def crop_board(page_im, c, scale=6):
    box = (c['x0'] * scale, c['y0'] * scale, c['x1'] * scale, c['y1'] * scale)
    return page_im.crop(box).rotate(-90, expand=True)


def board_roi(a, shrink=3):
    """
    The board's own silhouette, marbles included.

    Colour thresholds alone cannot separate a lilac marble from the lilac paper
    the booklet is printed on, so everything is masked to the inside of the
    board first. The brown board material is found as the largest dark region,
    then its holes are filled — the holes are exactly the marbles.
    """
    small = a[::shrink, ::shrink]
    mx = small.max(axis=2).astype(np.int16)
    mn = small.min(axis=2).astype(np.int16)
    dark = (mx < 150) & ((mx - mn) < 70)

    h, w = dark.shape
    best, seen = None, np.zeros((h, w), bool)
    for sy in range(h):
        for sx in range(w):
            if not dark[sy, sx] or seen[sy, sx]:
                continue
            stack, pix = [(sy, sx)], []
            seen[sy, sx] = True
            while stack:
                y, x = stack.pop()
                pix.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if best is None or len(pix) > len(best):
                best = pix
    mask = np.zeros((h, w), bool)
    for y, x in best:
        mask[y, x] = True

    outside = np.zeros((h, w), bool)          # flood the background from the border
    stack = [(y, x) for y in (0, h - 1) for x in range(w) if not mask[y, x]]
    stack += [(y, x) for x in (0, w - 1) for y in range(h) if not mask[y, x]]
    for p in stack:
        outside[p] = True
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                stack.append((ny, nx))
    filled = mask | ~outside
    return np.repeat(np.repeat(filled, shrink, axis=0), shrink, axis=1)[:a.shape[0], :a.shape[1]]


def find_marbles(crop, cut_scale=0.40):
    """
    Marble centroids and colours, in board-crop pixels.

    Scores are chroma along two axes rather than fixed RGB cutoffs, and the
    threshold is set per board — the illustrations vary in exposure between the
    teal and lilac halves of each spread.
    """
    a = np.asarray(crop).astype(np.int16)
    roi = board_roi(a)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    purple_score = (r + b) / 2.0 - g
    cyan_score = (g + b) / 2.0 - r
    strength = np.maximum(purple_score, cyan_score)
    inside = strength[roi]
    if inside.size == 0:
        return []
    cut = max(9.0, cut_scale * float(np.percentile(inside, 99.5)))
    hit = roi & (strength > cut)

    masks = {PURPLE: hit & (purple_score >= cyan_score),
             CYAN: hit & (cyan_score > purple_score)}
    total = crop.width * crop.height
    pts = []
    for value, m in masks.items():
        for c in components(m, int(total * 0.0010)):
            if c['area'] > total * 0.009:
                continue
            pts.append(((c['x0'] + c['x1']) / 2.0, (c['y0'] + c['y1']) / 2.0, value, c['area']))
    if pts:
        median = float(np.median([p[3] for p in pts]))
        pts = [p for p in pts if 0.45 * median <= p[3] <= 2.0 * median]
    return [(x, y, v) for x, y, v, _ in pts]


def lattice_from(cal, size):
    """Affine lattice: [x, y] = M . [column, row] + t, in crop pixels."""
    w, h = size
    M = np.array([[cal['xc'] * w, cal['xr'] * w],
                  [cal['yc'] * h, cal['yr'] * h]])
    t = np.array([cal['x0'] * w, cal['y0'] * h])
    return M, t


def fit_lattice(pts, size, cal, tolerance=0.34):
    """
    Assign each marble a (row, column). The template gives a starting lattice;
    it is then refitted to this board's own marbles so that the small rotation
    and scale differences between printed illustrations are absorbed.
    """
    if not pts:
        return []
    M, t = lattice_from(cal, size)
    xy = np.array([[p[0], p[1]] for p in pts], float)
    assign = None
    for _ in range(4):
        ij = np.linalg.solve(M, (xy - t).T).T        # continuous (column, row)
        grid = np.round(ij)
        residual = np.abs(ij - grid).max(axis=1)
        keep = residual < tolerance
        if keep.sum() < 4:
            break
        A = np.hstack([grid[keep], np.ones((int(keep.sum()), 1))])
        sol, *_ = np.linalg.lstsq(A, xy[keep], rcond=None)
        M = sol[:2].T
        t = sol[2]
        assign = [(int(r), int(c), pts[k][2])
                  for k, (c, r) in enumerate(grid) if keep[k]]
    return assign or []


def to_state(assign):
    """Turn (row, column, colour) marbles into engine cells + slider bits."""
    cells = [0] * (ROWS * SLOTS)
    shifts = [0] * ROWS
    problems = []
    byrow = {}
    for row, col, value in assign:
        byrow.setdefault(row, []).append((col, value))

    for row in range(ROWS):
        entries = byrow.get(row, [])
        if not entries:
            continue
        offset = row % 2                      # type A rows are even, type B odd
        parities = {(col - offset) % 2 for col, _ in entries}
        if len(parities) != 1:
            problems.append(f'row {row + 1}: marbles straddle two slider positions')
            continue
        shift = parities.pop()
        shifts[row] = shift
        for col, value in entries:
            slot = (col - offset - shift) // 2
            if not 0 <= slot < SLOTS:
                problems.append(f'row {row + 1}: column {col} is off the track')
                continue
            index = row * SLOTS + slot
            if cells[index]:
                problems.append(f'row {row + 1}: two marbles in one hole')
            cells[index] = value
    return cells, shifts, problems


def validate(cells, shifts):
    problems = []
    counts = {PURPLE: 0, CYAN: 0, 0: 0}
    for c in cells:
        counts[c] = counts.get(c, 0) + 1
    if counts[PURPLE] != 12 or counts[CYAN] != 12:
        problems.append(f'{counts[PURPLE]} purple, {counts[CYAN]} cyan (expected 12 and 12)')
    for row in range(ROWS):
        n = sum(1 for s in range(SLOTS) if cells[row * SLOTS + s])
        if n > SLOTS:
            problems.append(f'row {row + 1} holds {n} marbles')
    return problems


def code(cells, shifts):
    return ''.join(str(c) for c in cells) + '|' + ''.join(str(s) for s in shifts)


def extract_page(page, cal, want=8):
    page_im = load(page)
    grid = find_boards(page_im)
    out = []
    for row_index, pair in enumerate(grid):
        half, in_half = divmod(row_index, 2)
        for col_index, comp in enumerate(pair):
            if len(out) >= want:
                break
            number = (page - 3) * 8 + 1 + 4 * half + 2 * (1 - col_index) + in_half
            crop = crop_board(page_im, comp)
            best = None
            # Exposure varies between the teal and lilac halves of a spread, so
            # sweep the colour cutoff and keep the first reading that satisfies
            # the rules of the physical board. Validation is the oracle here.
            for cut_scale in (0.40, 0.32, 0.25, 0.50, 0.20):
                pts = find_marbles(crop, cut_scale)
                assign = fit_lattice(pts, crop.size, cal)
                cells, shifts, p1 = to_state(assign)
                problems = p1 + validate(cells, shifts)
                record = dict(number=number, marbles=len(pts), cut=cut_scale, cells=cells,
                              shifts=shifts, code=code(cells, shifts), problems=problems)
                if not problems:
                    best = record
                    break
                if best is None or len(problems) < len(best['problems']):
                    best = record
            out.append(best)
    out.sort(key=lambda d: d['number'])
    return out
