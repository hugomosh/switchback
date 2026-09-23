"""Locate the eight printed boards on a booklet spread."""
import numpy as np
from PIL import Image

def load(page, width=3000):
    im = Image.open(f'pages/full-{page:02d}.jpg').convert('RGB')
    im = im.resize((width, int(im.height * width / im.width)), Image.LANCZOS)
    return im

def board_mask(a):
    """Boards are dark and desaturated; the paper halves are bright and saturated."""
    mx = a.max(axis=2).astype(np.int16)
    mn = a.min(axis=2).astype(np.int16)
    return (mx < 150) & ((mx - mn) < 70)

def components(mask, min_area):
    """Flood-fill connected components without scipy."""
    h, w = mask.shape
    labels = np.zeros((h, w), np.int32)
    out = []
    nxt = 0
    stack = []
    for sy in range(h):
        row = mask[sy]
        for sx in range(w):
            if not row[sx] or labels[sy, sx]:
                continue
            nxt += 1
            stack.append((sy, sx))
            labels[sy, sx] = nxt
            pix = []
            while stack:
                y, x = stack.pop()
                pix.append((y, x))
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx_ = y+dy, x+dx
                    if 0 <= ny < h and 0 <= nx_ < w and mask[ny, nx_] and not labels[ny, nx_]:
                        labels[ny, nx_] = nxt
                        stack.append((ny, nx_))
            if len(pix) >= min_area:
                ys = np.array([p[0] for p in pix]); xs = np.array([p[1] for p in pix])
                out.append(dict(area=len(pix), y0=ys.min(), y1=ys.max(), x0=xs.min(), x1=xs.max()))
    return out

if __name__ == '__main__':
    import sys
    page = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    im = load(page)
    a = np.asarray(im)
    small = np.asarray(im.resize((im.width//6, im.height//6), Image.BILINEAR))
    m = board_mask(small)
    comps = components(m, min_area=800)
    comps.sort(key=lambda c: -c['area'])
    print(f'page {page}: image {im.size}, candidates {len(comps)}')
    for c in comps[:12]:
        w = c['x1']-c['x0']+1; h = c['y1']-c['y0']+1
        print(f"  area={c['area']:6d} box=({c['x0']},{c['y0']})-({c['x1']},{c['y1']}) {w}x{h} ar={w/h:.2f}")
