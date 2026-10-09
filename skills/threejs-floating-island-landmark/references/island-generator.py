"""TEMPLATE (trimmed): a floating island generator for headless Blender.

Run (cwd = project root):
  blender --background --factory-startup --python blender/craft_island.py

Blender frame: metres, Z up, the entrance faces -Y (it becomes the web model's +Z).
Uses the studio.py helpers from threejs-blender-glb-pipeline (Builder, mat, tube, sphere, export).
ADAPT: the constants, build(), the materials list. Excerpts only - the castle pieces (tower, dome,
arcade, balustrade) follow the same pattern as rock() and sheet() below.
"""
import importlib.util, json, math, random
from pathlib import Path
from mathutils import Vector
spec = importlib.util.spec_from_file_location('studio', Path(__file__).resolve().parent/'studio.py')
studio = importlib.util.module_from_spec(spec); spec.loader.exec_module(studio)

SLUG = 'island'
rng = random.Random(1986)                     # the island's layout stream: every original draw stays on it, in order

# REQUIRED numbers (the web scene reads them through the REPORT line; keep them fixed)
RIM = 28.5
# the underside: wall/ledge pairs give strata steps (r, z), rim at z 0 down to the tip
CONE = [(RIM, 0), (RIM - .6, -2.2), (RIM - 3.2, -3), (RIM - 3.6, -6.5), (RIM - 7, -7.4), (RIM - 7.6, -11.5),
        (RIM - 11.4, -12.6), (RIM - 12.2, -17), (8, -24), (3, -31), (0, -36)]
FALLS = [(237, 3.2, 24), (304, 3.6, 27), (205, 2.4, 22)]       # (degrees round the rim, width, drop)
LOWER_R, LOWER_Z = 27.2, 3

MAIN = studio.Builder(); CUR = [MAIN]; PARTS = []
PLANTS = {'cypress': [], 'shrubs': [], 'ivy': [], 'ferns': [], 'clumps': []}
M = {}
def B(): return CUR[-1]
def ring_pt(r, a, z, c=(0, 0)): return Vector((c[0] + r*math.cos(a), c[1] + r*math.sin(a), z))

def ball(m, c, r, scale=(1, 1, 1), detail=1, jitter=0):
    # NOTE: a jittered sphere draws from the *global* rng once per vertex. Changing `detail` (vertex count) or adding a
    # jittered ball anywhere shifts every later draw - trees, shrubs and roots all move. See own_rng below.
    studio.sphere(B(), M[m], c, r, scale=scale, detail=detail, rng=rng if jitter else None, jitter=jitter)

def own_rng(seed):
    """Run a new builder on its own stream, so the island's seeded layout is unchanged."""
    def wrap(f):
        def g(*a, **k):
            global rng
            saved, rng = rng, random.Random(seed)
            try: return f(*a, **k)
            finally: rng = saved
        return g
    return wrap

class part:
    """Animated pieces (gears, a turning head) in their own node, origin at the pivot: exported as <name>__<material>."""
    def __init__(s, name, origin): s.name = name; s.origin = Vector(origin); s.b = studio.Builder()
    def __enter__(s): CUR.append(s.b); PARTS.append(s); return s
    def __exit__(s, *a): CUR.pop()

def crag(seed, amp):
    """Radial jitter for revolve(): low-frequency lobes plus a per-cell random, so the cone doesn't read as a lathe."""
    t = random.Random(seed); tab = {}
    def f(i, j):
        if (i, j) not in tab: tab[(i, j)] = t.uniform(-1, 1)
        return 1 + amp*(.55*math.sin(j*.9 + i*1.7) + .3*math.sin(j*2.9 - i*.8) + .35*tab[(i, j)])
    return f

def revolve(m, prof, sides=48, center=(0, 0, 0), jitter=None):
    verts, faces = [], []
    for i, (r, z) in enumerate(prof):
        for j in range(sides):
            k = jitter(i, j) if jitter else 1; a = j/sides*math.tau
            verts.append(Vector((center[0] + r*k*math.cos(a), center[1] + r*k*math.sin(a), center[2] + z)))
    for i in range(len(prof) - 1):
        for j in range(sides): a, b = i*sides + j, i*sides + (j + 1) % sides; faces.append((a, b, b + sides, a + sides))
    B().add(M[m], verts, faces)

def spline(pts, per=4):
    """Catmull-Rom through the points: a root or a vine bends instead of kinking."""
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i-1], P[i], P[i+1], P[i+2]
        for j in range(per):
            t = j/per; t2 = t*t; t3 = t2*t
            out.append(.5*((2*p1) + (-p0 + p2)*t + (2*p0 - 5*p1 + 4*p2 - p3)*t2 + (-p0 + 3*p1 - 3*p2 + p3)*t3))
    out.append(pts[-1]); return out

def sheet(p, down, side, w, drop, reach, pieces=3):
    """A waterfall from lip p: strands of uneven width that bulge over the lip, sway as they drop and narrow.
    Its own stream seeded by the lip, so adding a fall never moves the rest of the island."""
    fr = random.Random(int(p.x*97 + p.y*31 + p.z*7) & 0xffff)
    widths = [fr.uniform(.55, 1.3) for _ in range(pieces)]; tot = sum(widths); x = -w/2
    for k in range(pieces):
        ww = w*widths[k]/tot; off = x + ww/2; x += ww; verts, faces, n = [], [], 14
        dd = drop*fr.uniform(.72, 1.); ph = fr.uniform(0, math.tau); amp = fr.uniform(.12, .3)
        for i in range(n + 1):
            s = i/n; bulge = .35*math.sin(min(1, s*4)*math.pi)*(1 - s)
            c = p + side*(off + amp*math.sin(s*math.tau*1.6 + ph)*s) + down*(reach*s**1.6 + bulge) + Vector((0, 0, -dd*s))
            wi = ww*1.05*(1 + .35*s)*(1 - .6*s*s); verts += [c - side*wi/2, c + side*wi/2]
            if i: faces.append((2*i - 2, 2*i - 1, 2*i + 1, 2*i))
        B().add(M['water'], verts, faces)
    for k in range(5):   # a low roll of white water over the lip - never bead-like balls down the sheet
        ball('foam', p + side*(k - 2)*w/5 + down*.12 + Vector((0, 0, -.08)), w/6, scale=(1.3, .8, .32), jitter=.2)

def rock():
    revolve('rock', CONE, sides=64, jitter=crag(7, .09))
    for (r, z) in CONE[1:-3:2]:                               # boulders on the ledges (original layout stream)
        for _ in range(6): ball('rock', ring_pt(r*.98, rng.uniform(0, math.tau), z), rng.uniform(.8, 1.8), scale=(1, 1, .7), jitter=.2)
    for k in range(10):                                       # hanging roots: 6-16 m, away from the axis, smoothed
        a = rng.uniform(0, math.tau); p = ring_pt(RIM*.7, a, -4); L = rng.uniform(6, 16)
        pts = spline([p + Vector((math.cos(a)*.6*t, math.sin(a)*.6*t, -L*t/3)) for t in range(4)])
        studio.tube(B(), M['roots'], pts, [.45*(1 - t/len(pts)) + .05 for t in range(len(pts))], sides=6)

@own_rng(1313)
def crystals():                                               # added later: its own stream, nothing else moves
    for _ in range(14):
        i = rng.randrange(3, len(CONE) - 3); r, z = CONE[i]
        ball('crystal', ring_pt(r*.97, rng.uniform(0, math.tau), z - rng.uniform(.5, 2.5)), rng.uniform(.4, .9), detail=1)

def build():
    for name, col, kw in [('stone', (.78, .74, .66), {}), ('rock', (.42, .37, .31), {}), ('roots', (.3, .24, .17), {}),
                          ('water', (.75, .86, .9), {'alpha': .85}), ('foam', (.95, .97, .98), {}),
                          ('crystal', (.35, .75, 1.), {'emission': 3})]:
        M[name] = studio.mat(f'{SLUG} {name}', col, **kw)    # '<slug> <key>': the web table keys on <key>
    rock(); crystals()
    for deg, w, drop in FALLS:
        a = math.radians(deg)
        sheet(ring_pt(LOWER_R + .25, a, LOWER_Z), Vector((math.cos(a), math.sin(a), 0)), Vector((-math.sin(a), math.cos(a), 0)), w, drop, 3.)
    PLANTS['cypress'].append((Vector((11., 4., 10.)), 6.5))   # sites only: the web grows the foliage
    # ... keep, towers, domes, courtyard, stairs, gears (with part('gear_big', origin): ...)
    MAIN.emit()
    for p in PARTS: p.b.emit()                                # then re-origin each object at p.origin and rename <part>__<material>

studio.clear_scene(); build()
entry = studio.export(SLUG, 'Floating island', '', 'Stylised floating island study', 'public/references/island.png')
P3 = lambda v: [round(v.x, 2), round(v.z, 2), round(-v.y, 2)]   # Blender (x, y, z) -> glTF/three (x, z, -y)
plants = {'cypress': [P3(p) + [round(h, 2)] for p, h in PLANTS['cypress']]}
Path(f'public/models/{SLUG}.plants.json').write_text(json.dumps(plants, separators=(',', ':')) + '\n')
feet = [P3(ring_pt(LOWER_R + 3, math.radians(d), LOWER_Z - dr)) + [w] for d, w, dr in FALLS]
print('REPORT', json.dumps({'rim': RIM, 'fall_feet': feet}))   # the web pastes these; diff plants.json after every run
