from collections import deque
import numpy as np
from PIL import Image

src = np.array(Image.open('../images/1.webp').convert('RGB')).astype(int)
CW, CH, TOP = 800, 1000, 95  # shared canvas, same scale/vertical position for every view


def figure_mask(x0, x1, y0, y1):
    a = src[y0:y1, x0:x1]
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
    fg = ~flood(border, passable)
    # largest connected component only
    best, left = None, fg.copy()
    while left.any():
        y, x = map(int, np.argwhere(left)[0])
        comp = flood([(y, x)], left)
        left &= ~comp
        if best is None or comp.sum() > best.sum():
            best = comp
    full = np.zeros(src.shape[:2], bool)
    full[y0:y1, x0:x1] = best
    return full


def place(mask, cx, mirror=False):
    out = np.zeros((CH, CW, 4), np.uint8)
    out[..., :3] = 255
    sx0 = cx - CW // 2
    for cy in range(CH):
        sy = TOP + cy
        if not 0 <= sy < src.shape[0]:
            continue
        for ccx in range(CW):
            sx = sx0 + ccx
            if 0 <= sx < src.shape[1] and mask[sy, sx]:
                out[cy, ccx, :3] = src[sy, sx]
                out[cy, ccx, 3] = 255
    if mirror:
        out = out[:, ::-1].copy()
    return out


views = {
    'front': ((118, 770, 110, 1040), 425, False),
    'left': ((770, 1360, 110, 1040), 950, False),
    'right': ((770, 1360, 110, 1040), 950, True),
    'back': ((1310, 1910, 110, 1090), 1592, False),
}
for name, (box, cx, mirror) in views.items():
    img = place(figure_mask(*box), cx, mirror)
    edge = img[..., 3]
    print(name, 'clipped:', bool(edge[0].any() or edge[-1].any() or edge[:, 0].any() or edge[:, -1].any()))
    Image.fromarray(img, 'RGBA').save(f'view_{name}.png')
