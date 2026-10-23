"""Per-region affine registration of the model's front render to the reference art.

Maps reference canvas px -> model front normalised coords, then expresses it as the
`fit` used by bake.html (ref_norm = a*f + b, per axis) for each region.
"""
import json
import numpy as np
from PIL import Image, ImageFilter
from scipy.optimize import minimize
from scipy.ndimage import map_coordinates

REGIONS = {  # reference canvas boxes (x0, y0, x1, y1) in view_front.png px
    'face': (270, 350, 530, 490),
    'chest': (345, 490, 455, 540),
    'apron': (300, 590, 500, 700),
    'skirt': (230, 700, 570, 760),
}

ref = Image.open('view_front.png')
RW, RH = ref.size
model = Image.open('render/bk/front_tex_up.png')
MW, MH = model.size


def edges(img):
    g = img.convert('L').filter(ImageFilter.GaussianBlur(1.2))
    a = np.asarray(g, float)
    gy, gx = np.gradient(a)
    return np.hypot(gx, gy)


Er = edges(ref.convert('RGB'))
Em = edges(model.convert('RGB'))
fit0 = np.load('fit.npy')  # global: ref_norm = a f + b (x), c f + d (y)

out = {}
for name, (x0, y0, x1, y1) in REGIONS.items():
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    tgt = Er[y0:y1, x0:x1].ravel()
    tgt = (tgt - tgt.mean()) / (tgt.std() + 1e-6)

    def sample(p):
        a, b, c, d = p
        fx = (xx / RW - b) / a
        fy = (yy / RH - d) / c
        return map_coordinates(Em, [fy.ravel() * MH, fx.ravel() * MW], order=1, mode='constant')

    def cost(p):
        s = sample(p)
        s = (s - s.mean()) / (s.std() + 1e-6)
        return -np.mean(s * tgt)

    best = None
    # coarse search over translation, then refine all four parameters
    for dx in np.linspace(-0.03, 0.03, 13):
        for dy in np.linspace(-0.03, 0.03, 13):
            p = fit0 + [0, dx, 0, dy]
            c = cost(p)
            if best is None or c < best[0]:
                best = (c, p)
    r = minimize(cost, best[1], method='Nelder-Mead',
                 options={'xatol': 1e-5, 'fatol': 1e-5, 'maxiter': 3000,
                          'initial_simplex': [best[1] + e for e in
                                              np.vstack([np.zeros(4), np.diag([0.02, 0.005, 0.02, 0.005])])]})
    print(f'{name}: NCC global {-cost(fit0):.3f} -> shifted {-best[0]:.3f} -> refined {-r.fun:.3f}')
    out[name] = {'box': [x0, y0, x1, y1], 'fit': r.x.tolist(), 'ncc': float(-r.fun)}

json.dump(out, open('region_fits.json', 'w'), indent=1)
