"""Faceted river stone as a signed-distance field, shrink-wrapped, painted into COLOR_0 (RGB paint, A = 1 - moss).
Trimmed from a working headless-Blender script (Blender 5.x, numpy). Run: blender -b -P rock-sdf.py
Adapt: SPEC (all lengths are fractions of `size` so a variant rescales without retuning), the colours,
the output path, and the decimate target (~2.4k tris when instanced ~800x). Z up, base on the ground.
Kept: ellipsoid + low-frequency lumps, broad worn facets whose edges a smooth-max rounds, a flattened
underside, granite knobbles worn smooth on the facets, curvature/AO paint, lichen, a soft moss cap in alpha.
Dropped for brevity: strata, cracks, split boulders, dished tops (same pattern: extra terms in body())."""
import math, random
import numpy as np
import bpy, bmesh

SPEC = dict(size=.62, seed=23, half=(.5, .42, .32), lobe=.03, facets=(6, (.10, .21), .055), knob=(.022, .16), floor=.5, moss=.32, lichen=.8)
TOP, FLANK = np.array((.36, .31, .235)), np.array((.135, .16, .195))   # linear: warm sunlit top, cool blue-grey flank

def smin(a, b, k): h = np.clip(.5 + .5*(b - a)/k, 0, 1); return b + (a - b)*h - k*h*(1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

class Noise:
    """3D value noise; each fbm octave randomly rotated so the lattice never shows."""
    def __init__(s, seed):
        r = np.random.RandomState(seed); s.P = np.concatenate([r.permutation(256)]*2); s.V = r.uniform(-1, 1, 512)
        s.R = [np.linalg.qr(r.normal(size=(3, 3)))[0] for _ in range(6)]; s.off = r.uniform(0, 97, (6, 3))
    def __call__(s, p):
        i = np.floor(p).astype(np.int64); f = p - i; u = f*f*(3 - 2*f); i &= 255; P, V = s.P, s.V
        X, Y, Z = i[:, 0], i[:, 1], i[:, 2]
        h = lambda dx, dy, dz: V[P[P[P[X + dx] + Y + dy] + Z + dz]]
        ux, uy, uz = u[:, 0], u[:, 1], u[:, 2]
        x00 = h(0,0,0) + (h(1,0,0) - h(0,0,0))*ux; x10 = h(0,1,0) + (h(1,1,0) - h(0,1,0))*ux
        x01 = h(0,0,1) + (h(1,0,1) - h(0,0,1))*ux; x11 = h(0,1,1) + (h(1,1,1) - h(0,1,1))*ux
        y0 = x00 + (x10 - x00)*uy; y1 = x01 + (x11 - x01)*uy
        return y0 + (y1 - y0)*uz
    def fbm(s, p, octaves=3):
        t, a, norm = 0., 1., 0.
        for o in range(octaves): t = t + a*s((p*(2.03**o)) @ s.R[o] + s.off[o]); norm += a; a *= .5
        return t/norm*1.6

def ell_sdf(p, r):
    k0 = np.linalg.norm(p/r, axis=1); k1 = np.linalg.norm(p/(r*r), axis=1); return k0*(k0 - 1)/np.maximum(k1, 1e-9)
def unit(a, el): return np.array([math.cos(a)*math.cos(el), math.sin(a)*math.cos(el), math.sin(el)])

class Stone:
    def __init__(s, sp):
        s.sp = sp; S = s.S = sp['size']; s.h = np.array(sp['half'])*S; s.N = Noise(sp['seed']); rng = random.Random(sp['seed'])
        count, cut, s.fk = sp['facets']; az0 = rng.uniform(0, 6.283); s.planes = []
        for i in range(count):
            n = unit(rng.uniform(0, 6.283), rng.uniform(1.1, 1.42)) if i == 0 else unit(az0 + 6.283*i/count + rng.uniform(-.35, .35), rng.uniform(-.2, .7))
            s.planes.append((n, np.linalg.norm(n*s.h)*(1 - rng.uniform(*cut))))   # the worn top first, then flanks spread round
        s.zb = -sp['floor']*s.h[2]                                                  # flattened underside, sat in the gravel
    def field(s, p):
        sp, S = s.sp, s.S
        d = ell_sdf(p, s.h) - sp['lobe']*S*s.N.fbm(p/(.45*S) + 11., 2)             # ellipsoid + low-frequency lumps
        facet = np.zeros(len(p))
        for n, off in s.planes:                                                     # broad facets, edges rounded by smax
            pl = p @ n - off; d = smax(d, pl, s.fk*S); facet = np.maximum(facet, np.clip(1 + pl/(.05*S), 0, 1))
        d = smax(d, s.zb - p[:, 2], .05*S)
        a, wl = sp['knob']; return d - a*S*(1 - .85*facet)*s.N.fbm(p/(wl*S) + 17., 3)   # knobbles, worn smooth on facets

def project(f, X, eps, maxstep):
    f0 = f(X); g = np.stack([(f(X + e*eps) - f0)/eps for e in np.eye(3)], 1)
    st = (f0/np.maximum((g*g).sum(1), 1e-12))[:, None]*g
    L = np.linalg.norm(st, axis=1, keepdims=True); st *= np.minimum(1, maxstep/np.maximum(L, 1e-12)); return X - st

def shrinkwrap(f, c, radii, S, subdiv=6):
    """Ray-march an icosphere fan outward to the first surface crossing, bisect, then relax + Newton-project 3x."""
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1)
    U = np.array([v.co[:] for v in bm.verts]); F = np.array([[v.index for v in fc.verts] for fc in bm.faces]); bm.free()
    D = U*radii; n = len(U); T = 1.8; steps = 44; tl = np.zeros(n); th = np.full(n, T); found = np.zeros(n, bool)
    for i in range(1, steps + 1):
        idx = np.where(~found)[0]
        if not len(idx): break
        t = T*i/steps; out = f(c + D[idx]*t) > 0; hit = idx[out]; th[hit] = t; tl[hit] = T*(i - 1)/steps; found[hit] = True
    for _ in range(18): tm = (tl + th)/2; out = f(c + D*tm[:, None]) > 0; th = np.where(out, tm, th); tl = np.where(out, tl, tm)
    X = c + D*th[:, None]
    E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1), axis=0)
    deg = np.bincount(E.ravel(), minlength=n)[:, None]
    for _ in range(3):
        avg = np.zeros_like(X); np.add.at(avg, E[:, 0], X[E[:, 1]]); np.add.at(avg, E[:, 1], X[E[:, 0]]); X = X + .5*(avg/deg - X)
        for _ in range(3): X = project(f, X, .002*S, .02*S)
    return X, F

def paint(me, stone):
    n = len(me.vertices); S = stone.S; sp = stone.sp
    co = np.empty(n*3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nor = np.empty(n*3); me.vertex_normals.foreach_get('vector', nor); nor = nor.reshape(-1, 3)
    E = np.empty(len(me.edges)*2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    deg = np.maximum(np.bincount(E.ravel(), minlength=n), 1)
    def nbsum(a): o = np.zeros_like(a); np.add.at(o, E[:, 0], a[E[:, 1]]); np.add.at(o, E[:, 1], a[E[:, 0]]); return o
    el = np.linalg.norm(co[E[:, 0]] - co[E[:, 1]], axis=1); el = (np.bincount(E[:, 0], el, n) + np.bincount(E[:, 1], el, n))/deg
    curv = ((co - nbsum(co)/deg[:, None])*nor).sum(1)/np.maximum(el, 1e-5)          # >0 convex edge, <0 crevice
    for _ in range(2): curv = (curv + nbsum(curv))/(1 + deg)                          # smoothed twice: reads as wear
    k = np.clip(curv*3., -1, 1); cvx = np.maximum(k, 0); ccv = np.maximum(-k, 0)
    occ, wsum = np.zeros(n), 0.                                                       # AO sampled from the field
    for i, t in enumerate((.012, .025, .045, .07, .1)):
        t *= S**.5*1.1; w = .75**i; occ += w*np.clip((t - stone.field(co + nor*t))/t, 0, 1); wsum += w
    ao = 1 - np.clip(occ/wsum*1.6, 0, 1)
    N, N2, N3 = Noise(1), Noise(2), Noise(3); nz = nor[:, 2]; h = (co[:, 2] - co[:, 2].min())/max(np.ptp(co[:, 2]), 1e-5)
    up = np.clip(.5 + .6*nz, 0, 1)[:, None]
    c = FLANK + (TOP - FLANK)*up                                                      # warm top, cool flanks
    c = c*(.82 + .36*N.fbm(co/.18, 2))[:, None]
    c = c*(1 + .24*cvx - .5*ccv)[:, None]; c = c + (np.array([.44, .42, .37]) - c)*(.18*cvx)[:, None]   # pale worn edges, dark crevices
    c = c*(.42 + .58*ao)[:, None]*(.55 + .45*np.minimum(1, h*2.2))[:, None]          # AO, darker foot
    lich = np.maximum(0, N2.fbm(co/.05, 2)*N3.fbm(co/.12, 2) - .1)*6.*sp['lichen']*np.clip(up[:, 0]*1.3 - .1, 0, 1)*(h > .3)
    c = c + (np.array([.50, .52, .40]) - c)*np.minimum(.75, lich)[:, None]
    m = np.zeros(n)
    if sp['moss'] > 0:                                                                # soft cap, thicker in hollows, wandering edge
        edge = .78 - .5*sp['moss'] + .22*N3.fbm(co/.08, 2) + .1*N.fbm(co/.03, 2)
        m = np.minimum(1, np.clip((nz - edge)*4, 0, 1)*np.clip((h - .3)*4, 0, 1)*(1 + .6*ccv))
        c = c + (np.array([.10, .20, .03]) - c)*m[:, None]
    cols = np.concatenate([np.clip(c, 0, 1), (1 - m)[:, None]], 1)                   # ALPHA = 1 - moss
    cols = (cols*2 + nbsum(cols))/(2 + deg)[:, None]
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); attr.data.foreach_set('color', cols.ravel())
    me.color_attributes.active_color = attr

stone = Stone(SPEC)
X, F = shrinkwrap(stone.field, np.array([0, 0, (stone.zb + stone.h[2])*.25]), stone.h*1., stone.S)
me = bpy.data.meshes.new('Rock'); me.from_pydata(X.tolist(), [], F.tolist()); me.update()
ob = bpy.data.objects.new('Rock', me); bpy.context.scene.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob
mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = 2400/len(F); bpy.ops.object.modifier_apply(modifier='dec')
paint(ob.data, stone)                                           # paint after decimation so every vertex has colour
ob.location.z = -X[:, 2].min()                                  # base on Z = 0
mat = bpy.data.materials.new('Rock'); ob.data.materials.append(mat)
# ACTIVE keeps the alpha: the default ('MATERIAL') drops it and COLOR_0 comes out VEC3. Check the GLB JSON afterwards.
bpy.ops.export_scene.gltf(filepath='rock.glb', export_format='GLB', export_vertex_color='ACTIVE', export_apply=True)
