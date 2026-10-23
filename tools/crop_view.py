import sys
from collections import deque
import numpy as np
from PIL import Image

src, name, x0, x1, y0, y1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
a = np.array(Image.open(src).convert('RGB')).astype(int)[y0:y1, x0:x1]
h, w, _ = a.shape
passable = ((a.max(2) - a.min(2)) <= 8) & (a.mean(2) > 90)

def flood(start, ok):
    seen = np.zeros((h, w), bool)
    q = deque(start)
    while q:
        y, x = q.popleft()
        if seen[y, x] or not ok[y, x]:
            continue
        seen[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx]:
                q.append((ny, nx))
    return seen

border = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
bg = flood(border, passable)
fg = ~bg

# keep only the largest connected component (drops neighbouring figures and line fragments)
lab = np.zeros((h, w), int)
best, best_n, cur = 0, 0, 0
for y in range(h):
    for x in range(w):
        if fg[y, x] and not lab[y, x]:
            cur += 1
            comp = flood([(y, x)], fg & (lab == 0))
            lab[comp] = cur
            n = comp.sum()
            if n > best_n:
                best, best_n = cur, n
keep = lab == best

ys, xs = np.where(keep)
pad = 40
cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
rgba = np.zeros((h, w, 4), np.uint8)
rgba[..., :3] = a.astype(np.uint8)
rgba[..., 3] = np.where(keep, 255, 0)
rgba[~keep, :3] = 255
rgba = rgba[cy0:cy1, cx0:cx1]
H, W = rgba.shape[:2]
out = np.zeros((H + 2 * pad, W + 2 * pad, 4), np.uint8)
out[..., :3] = 255
out[pad:pad + H, pad:pad + W] = rgba
Image.fromarray(out, 'RGBA').save(f'{name}_clean_transparent.png')
Image.fromarray(out[..., :3]).save(f'{name}_clean.png')
print(name, out.shape, 'touches crop edge:', cy0 == 0, cy1 == h, cx0 == 0, cx1 == w)
