"""Clean the face skin in the colour texture.

Inputs: tex/basecolor.png (original), tex/basecolor_fixed.png (graded + projected
details), render/bk/bake_face.png (UV-space masks: R eye, G mouth, B blush, A face).
"""
import numpy as np
from PIL import Image, ImageFilter

SKIN = np.array([252, 228, 219], float)
BLUSH = np.array([248, 178, 178], float)

orig = np.asarray(Image.open('tex/basecolor.png').convert('RGB'), float)
cur = np.asarray(Image.open('tex/basecolor_fixed.png').convert('RGB'), float)
bk = np.asarray(Image.open('render/bk/bake_face.png'), float) / 255
face, eye, mouth, blush = bk[..., 3], bk[..., 0], bk[..., 1], bk[..., 2]
r, g, b = orig[..., 0], orig[..., 1], orig[..., 2]
mx, mn, mean = orig.max(-1), orig.min(-1), orig.mean(-1)

skinlike = (r > 140) & (r - b > 12) & (r >= g)
hair = (b - r > 25) & (b > 60)

# 1) everywhere: the global grade cooled skin towards grey-blue; give skin texels back their warmth
w_skin = np.asarray(Image.fromarray((skinlike * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)), float) / 255
out = cur * (1 - w_skin[..., None]) + orig * w_skin[..., None]

# 2) face: repaint skin, grey smudges and dark scribbles with clean skin + blush; keep eyes, mouth, hair
dark_or_grey = (mx - mn < 40) & (mean < 215)
cand = (face > 0.5) & (eye < 0.5) & (mouth < 0.5) & ~hair & (skinlike | dark_or_grey)
w = np.asarray(Image.fromarray((cand * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), float) / 255
w = np.minimum(w, (face > 0.5) * (1 - mouth))
# UV gutters: texels just outside the face islands still get sampled at island edges
# (seams, mip levels) and kept their old light/dark colours. Paint them too.
near = np.asarray(Image.fromarray((cand * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)), float) / 255
gutter = (near > 0.5) & (face < 0.5)
w = np.maximum(w, gutter.astype(float))
bl = np.where(face > 0.5, blush, 0)[..., None] * 0.55
paint = SKIN * (1 - bl) + BLUSH * bl
out = out * (1 - w[..., None]) + paint * w[..., None]
# 3) redrawn eyes on top
ey = np.asarray(Image.open('render/bk/bake_eyes.png'), float)
ea = ey[..., 3:4] / 255
out = out * (1 - ea) + ey[..., :3] * ea
# fill the UV gutters around eye islands with the nearest eye colour so seams don't show
from scipy import ndimage
eyem = ea[..., 0] > 0.5
near_eye = ndimage.binary_dilation(eyem, iterations=5)
gut = near_eye & ~eyem & (face < 0.5)
_, (iy, ix) = ndimage.distance_transform_edt(~eyem, return_indices=True)
out[gut] = out[iy[gut], ix[gut]]
print('eye gutter texels', int(gut.sum()))
print('eye texels', int((ea[..., 0] > 0.5).sum()))
print('face texels repainted', int(cand.sum()), '| skin texels re-warmed', int(skinlike.sum()))
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('tex/basecolor_face.png')
