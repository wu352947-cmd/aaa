"""Draw clean anime eyes (style of the reference art) into the model's eye sockets.

Output: render/bk/eye_paint.png, RGBA in front-view image space (2x the
1400x2152 front render), alpha = where the eye paint applies.
Socket openings were read off the front recess map (front px, 1x).
"""
import numpy as np
from PIL import Image

S = 2                       # supersample relative to the 1400x2152 front image
W, H = 1400 * S, 2152 * S
EYES = {                    # x0, x1, y0, y1 of the socket opening; which side is the outer corner
    'L': dict(box=(470, 620, 817, 950), outer=-1),
    'R': dict(box=(782, 930, 817, 950), outer=+1),
}

img = np.zeros((H, W, 4), float)


def ss(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


def cover(sd, aa=1.0):
    """Antialiased coverage from a signed distance (negative inside), in output px."""
    return 1 - ss(-aa, aa, sd)


def over(dst, rgb, a):
    a = a[..., None]
    dst[..., :3] = dst[..., :3] * (1 - a) + np.asarray(rgb, float) * a
    dst[..., 3:] = dst[..., 3:] * (1 - a) + a


def rrect(px, py, cx, cy, hw, hh, r):
    qx, qy = np.abs(px - cx) - hw + r, np.abs(py - cy) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def ellipse(px, py, cx, cy, rx, ry):
    # approximate signed distance for an ellipse (good enough for AA edges)
    k = np.hypot((px - cx) / rx, (py - cy) / ry)
    return (k - 1) * min(rx, ry)


for name, e in EYES.items():
    x0, x1, y0, y1 = [v * S for v in e['box']]
    pad = 40 * S
    X0, X1, Y0, Y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
    py, px = np.mgrid[Y0:Y1, X0:X1].astype(float) + 0.5
    tile = np.zeros((Y1 - Y0, X1 - X0, 4))
    cx, cy, hw, hh = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    out = e['outer']

    # eye white, with a soft blue-grey shadow under the upper lash
    eye_sd = rrect(px, py, cx, cy, hw, hh, 44 * S)
    eye = cover(eye_sd, 1.5)
    shade = ss(cy - hh + 45 * S, cy - hh + 5 * S, py) * 0.55
    white = np.stack([250 - 60 * shade, 250 - 45 * shade, 255 - 20 * shade], -1)
    tile[..., :3] = white
    tile[..., 3] = eye

    # iris: vertical gradient navy -> bright blue, dark rim
    icx, icy = cx - out * 3 * S, cy + 8 * S
    irx, iry = hw * 0.8, hh * 1.04
    t = np.clip((py - (icy - iry)) / (2 * iry), 0, 1)[..., None]
    top, mid, bot = np.array([22, 34, 98.]), np.array([40, 88, 186.]), np.array([120, 190, 246.])
    grad = np.where(t < 0.55, top + (mid - top) * (t / 0.55), mid + (bot - mid) * ((t - 0.55) / 0.45))
    i_sd = ellipse(px, py, icx, icy, irx, iry)
    iris_a = cover(i_sd, 1.5) * eye
    over(tile, [18, 26, 74], iris_a)                                    # rim
    inner = cover(ellipse(px, py, icx, icy, irx - 5 * S, iry - 5 * S), 1.5) * eye
    tile[..., :3] = tile[..., :3] * (1 - inner[..., None]) + grad * inner[..., None]

    # pupil and the light glow at the bottom of the iris
    over(tile, [16, 22, 66], cover(ellipse(px, py, icx, icy - 8 * S, irx * 0.42, iry * 0.5), 2) * eye * 0.9)
    glow = cover(ellipse(px, py, icx, icy + iry * 0.55, irx * 0.62, iry * 0.28), 6 * S) * inner
    over(tile, [170, 222, 255], glow * 0.75)
    over(tile, [255, 196, 178], cover(ellipse(px, py, icx + out * irx * 0.1, icy + iry * 0.62, irx * 0.2, iry * 0.1), 3 * S) * inner * 0.7)

    # catchlights (same light direction on both eyes: upper left)
    over(tile, [255, 255, 255], cover(ellipse(px, py, icx - irx * 0.32, icy - iry * 0.42, irx * 0.2, iry * 0.17), 1.5) * eye)
    over(tile, [255, 255, 255], cover(ellipse(px, py, icx + irx * 0.34, icy + iry * 0.12, irx * 0.08, iry * 0.07), 1.2) * eye)

    # upper lash: follows the eye's rounded top edge, thin at the inner corner,
    # thick towards the outer corner, then sweeps up into a wing
    r = 44 * S
    dxc = np.maximum(np.abs(px - cx) - (hw - r), 0)
    edge_y = y0 + r - np.sqrt(np.maximum(r * r - dxc * dxc, 0))      # top contour of the eye
    edge_y = np.where(dxc > r, y0 + r, edge_y)
    v = (px - cx) / hw * out                                          # -1 inner corner .. +1 outer
    thick = S * (7 + 21 * ss(-1.0, 0.35, v))
    lash_sd = np.maximum(edge_y - thick - py, py - (edge_y + 8 * S))
    lash_sd = np.maximum(lash_sd, np.abs(px - cx) - (hw - 2 * S))
    lash = cover(lash_sd, 1.3)
    # eyeliner wrapping down the outer side, tapering out by ~45% of the eye height
    side_t = np.clip((py - y0) / (0.9 * hh), 0, 1)
    ring = cover(np.abs(eye_sd + 2 * S) - 5 * S * (1 - side_t), 1.2)
    lash = np.maximum(lash, ring * ((px - cx) * out > 0.35 * hw) * (side_t < 1) * (py > y0))
    # wing: tapered stroke from the outer top corner, outwards and up
    bx, by = cx + out * (hw - 10 * S), y0 + 6 * S                      # base
    tx, ty = cx + out * (hw + 30 * S), y0 - 22 * S                     # tip
    dx, dy = tx - bx, ty - by
    L2 = dx * dx + dy * dy
    t = np.clip(((px - bx) * dx + (py - by) * dy) / L2, 0, 1)
    dist = np.hypot(px - (bx + t * dx), py - (by + t * dy))
    wing = cover(dist - 13 * S * (1 - t) ** 1.3, 1.3)
    over(tile, [24, 18, 34], np.maximum(lash, wing))

    # lower lid: soft line hugging the bottom of the eye, outer half only
    low = cover(np.abs(eye_sd) - 1.6 * S, 1.0) * (py > cy + 0.55 * hh) * ss(-0.1, 0.5, (px - cx) / hw * out)
    over(tile, [150, 92, 96], low * 0.55)

    img[Y0:Y1, X0:X1] = tile

Image.fromarray(
                np.dstack([np.clip(img[..., :3], 0, 255), np.clip(img[..., 3] * 255, 0, 255)]).astype(np.uint8),
                'RGBA').save('render/bk/eye_paint.png')
print('ok')
