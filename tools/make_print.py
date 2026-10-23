"""Build the printable white model from the generated GLB.

Steps: orient + scale, weld floating eyebrow, drop hidden loose ring, decimate,
thicken walls thinner than MIN_WALL, add base, boolean-union to one solid, export.
"""
import numpy as np
import pymeshlab
import trimesh
import manifold3d as mf
from scipy import sparse

SRC = 'dl/merged.ply'
FIG_H = 114.0      # figure height in mm (base adds BASE_H)
BASE_D, BASE_H = 90.0, 6.0
MIN_WALL = 1.0     # mm, resin-safe minimum
TARGET_FACES = 900_000

m = trimesh.load(SRC, process=False)
m.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float))
main, ring, brow = sorted(m.split(only_watertight=False), key=lambda c: -len(c.faces))
s = FIG_H / main.extents[1]
for g in (main, brow):
    g.apply_translation(-np.array([0, main.bounds[0][1], 0]))
    g.apply_scale(s)
print('figure extents mm', main.extents.round(1), '| dropped hidden ring', len(ring.faces), 'faces')

# eyebrow floats up to ~1 mm in front of the forehead: sink it 0.4 mm past contact
cp, dist, _ = trimesh.proximity.closest_point(main, brow.vertices)
dirv = (cp - brow.vertices).mean(0)
dirv /= np.linalg.norm(dirv)
brow.apply_translation(dirv * (dist.max() + 0.4))

# decimate (keeps topology, avoids flipping)
ms = pymeshlab.MeshSet()
ms.add_mesh(pymeshlab.Mesh(main.vertices, main.faces))
ms.meshing_decimation_quadric_edge_collapse(targetfacenum=TARGET_FACES, preservetopology=True,
                                            preservenormal=True, qualitythr=0.5, planarquadric=True)
ms.meshing_remove_duplicate_vertices()
ms.meshing_remove_unreferenced_vertices()
cm = ms.current_mesh()
main = trimesh.Trimesh(cm.vertex_matrix(), cm.face_matrix(), process=False)
print('decimated faces', len(main.faces))


def vertex_thickness(mesh):
    n = mesh.vertex_normals
    o = mesh.vertices - n * 1e-3
    loc, ri, _ = mesh.ray.intersects_location(o, -n, multiple_hits=False)
    t = np.full(len(o), 50.0)
    t[ri] = np.linalg.norm(loc - o[ri], axis=1)
    return t


def smooth(mesh, f, iters):
    A =sparse.csr_matrix(trimesh.graph.edges_to_coo(mesh.edges_unique, count=len(mesh.vertices)))
    A = A + A.T
    deg = np.asarray(A.sum(1)).ravel() + 1
    for _ in range(iters):
        f = np.maximum(f, (A @ f + f) / deg)  # spread without shrinking peaks
    return f


def local_taubin(mesh, mask, iters=12, lam=0.5, mu=-0.53):
    """Taubin smoothing applied only to masked vertices (removes folds, keeps volume)."""
    A = sparse.csr_matrix(trimesh.graph.edges_to_coo(mesh.edges_unique, count=len(mesh.vertices)))
    A = (A + A.T).astype(float)
    deg = np.asarray(A.sum(1)).ravel()
    deg[deg == 0] = 1
    v = mesh.vertices.copy()
    w = mask[:, None].astype(float)
    for _ in range(iters):
        for k in (lam, mu):
            lap = (A @ v) / deg[:, None] - v
            v = v + k * lap * w
    mesh.vertices = v


# thicken: push both faces of a thin wall outward so the wall reaches MIN_WALL
A0 = sparse.csr_matrix(trimesh.graph.edges_to_coo(main.edges_unique, count=len(main.vertices)))
A0 = A0 + A0.T
touched = np.zeros(len(main.vertices), bool)
for it in range(3):
    t = vertex_thickness(main)
    push = np.clip((MIN_WALL - t) / 2, 0, MIN_WALL / 2)
    print(f'pass {it}: verts under {MIN_WALL}mm: {(t < MIN_WALL).sum()} ({(t < MIN_WALL).mean() * 100:.1f}%)')
    if (push > 0.02).sum() == 0:
        break
    push = smooth(main, push, 2)
    main.vertices += main.vertex_normals * push[:, None]
    touched |= push > 0.01
# smooth out folds where thin tips were pushed (the touched area plus two rings around it)
ring = touched.astype(float)
for _ in range(2):
    ring = np.maximum(ring, (A0 @ ring > 0).astype(float))
local_taubin(main, ring > 0)


def to_manifold(mesh):
    return mf.Manifold(mf.Mesh(vert_properties=np.asarray(mesh.vertices, np.float32),
                               tri_verts=np.asarray(mesh.faces, np.uint32)))


fig = to_manifold(main)
print('manifold status', fig.status())
brow_m = to_manifold(brow)

# base: centred under the whole footprint (tail reaches far back), feet sink 0.4 mm in
b = main.bounds
cx, cz = (b[0][0] + b[1][0]) / 2, (b[0][2] + b[1][2]) / 2
# slightly tapered disc (1 mm draft) so the top edge is not razor sharp
base = mf.Manifold.cylinder(BASE_H, BASE_D / 2, BASE_D / 2 - 1.0, 256)
base = base.rotate([-90, 0, 0]).translate([cx, -BASE_H + 0.4, cz])

solid = fig + brow_m + base
out = solid.to_mesh()
res = trimesh.Trimesh(out.vert_properties[:, :3], out.tri_verts, process=True)
res.apply_translation([-cx, BASE_H - 0.4, -cz])  # base bottom at y=0, centred on origin
comps = res.split(only_watertight=False)
print('final: faces', len(res.faces), 'watertight', res.is_watertight, 'bodies', len(comps),
      'extents mm', res.extents.round(2), 'volume cm3', round(res.volume / 1000, 1))
# print files use Z-up
res_z = res.copy()
res_z.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float))
res_z.export('out_print/whale_maid_print.stl')
res_z.export('out_print/whale_maid_print.3mf')
res.export('out_print/whale_maid_print_yup.glb')
