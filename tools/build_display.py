"""Rebuild the display GLB from raw geometry + a given base colour texture."""
import subprocess, sys
import trimesh
from PIL import Image

tex, out = sys.argv[1], sys.argv[2]
s = trimesh.load('dl/raw.glb')
g = list(s.geometry.values())[0]
mat = trimesh.visual.material.PBRMaterial(name='whale_maid', baseColorTexture=Image.open(tex),
                                          metallicFactor=0.0, roughnessFactor=0.6)
g.visual = trimesh.visual.TextureVisuals(uv=g.visual.uv, material=mat)
s.export('render/_display_full.glb')
subprocess.run(['python3', 'swap_jpeg.py', 'render/_display_full.glb', 'render/_display_jpg.glb', '88'], check=True)
subprocess.run(['npx', 'gltfpack', '-i', '_display_jpg.glb', '-o', out.replace('render/', ''), '-si', '0.3', '-cc'],
               cwd='render', check=True)
