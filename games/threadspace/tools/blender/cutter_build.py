# Builds the cutter's outside from her layout, ships/cutter/ (made by tools/cutter.mjs).
#
# She is a 34 m armed boat a carrier keeps in her hangar: a patrol boat's attitude on a spacecraft's facts. Nothing on
# her pretends there is air. What shapes her:
#   - a low raked prow (the "jaw": forward sensors and the keel tank's nose), the flight deck's canopy band set back
#     above it, between the two torpedo cheeks (two tube doors each), a visor over the glass;
#   - a faceted hull: a flat top, sloped upper sides, a vertical belt, sloped lower sides, a flat keel, so every room and
#     tank of the layout is inside it, narrower amidships than at the engine block, where the radiators run out;
#   - a low twin gun on a ring on her back (`turret-dorsal`), two close-in guns on sponsons on the lower shoulders (the
#     guns themselves are the game's), eight manoeuvring quads on stub pylons, the docking collar to starboard;
#   - a dorsal spine with the heat sinks' louvres, a mast and an antenna farm;
#   - one main bell on a thrust frame behind a heat shield, four verniers round it (only the main bell pushes: the
#     layout has one drive).
# Paint: light grey over a dark underside, a slanted orange-and-white stripe forward (a cutter's mark), the hull number,
# hazard stripes at the port and the radiator slots, a shark's mouth on the bow, a tally to port.
#
#   blender -b --factory-startup --python tools/blender/cutter_build.py            (from the threadspace folder)
#   blender -b --factory-startup --python tools/blender/cutter_build.py -- --blend /tmp/cutter.blend
#   ... -- --where    also prints which part reaches furthest each way (when the envelope check fails)
#
# Output: assets/cutter/hull.glb, which carrier.html?ship=cutter loads (layout.mjs `loadHull`; without it she wears the
# lofted hull). The game finds these nodes by name, as it does the carrier's:
#   hull                       the plated hull (the cutaway opens it)
#   turret-dorsal              the gunhouse: origin on the turret's axis at the ring, scaled by the mount's `scale`, so
#                              the game's own points on a turret (muzzles, the sight) land on this one
#   turret-dorsal-guns         the cradle and barrels: origin on the trunnions
#   radiator-port / -stbd      the panels: origin on the edge against the hull; the game runs them in by `scale.x`
#                              (they are exported run in: a berthed ship has no plant to fold them)
#   fittings                   everything else
# Materials the game looks for: `RadiatorHot` (the glow), any name with `Glass` (keeps its metalness).
# Everything stays inside the layout's `envelope` (checked at the end, radiators run in): a berth is cut to it.
import sys, os, math, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shipkit as K
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(HERE))
L = K.load_layout(os.path.join(ROOT, 'ships', 'cutter'))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
blend = args[args.index('--blend') + 1] if '--blend' in args else None
OUT = os.path.join(ROOT, 'assets', 'cutter', 'hull.glb')
NUMBER = '07'  # her hull number

K.reset()
rnd = random.Random(7)
M = {
    'paint': K.material('Paint', '#b9bdc0', 0.15, 0.55),
    'paintB': K.material('PaintB', '#a4a9ad', 0.15, 0.6),
    'engine': K.material('PaintEngine', '#7b828a', 0.2, 0.55),
    'under': K.material('Under', '#4d5560', 0.2, 0.6),
    'underB': K.material('UnderB', '#424a55', 0.2, 0.6),
    'accent': K.material('Accent', '#e2561d', 0.05, 0.55),
    'white': K.material('Marking', '#eceae4', 0.05, 0.6),
    'mark': K.material('MarkingDark', '#1f2329', 0.1, 0.6),
    'seam': K.material('Seam', '#23272d', 0.2, 0.7),
    'trim': K.material('Trim', '#363c46', 0.2, 0.5),
    'dark': K.material('Dark', '#191c21', 0.2, 0.6),
    'metal': K.material('Metal', '#8a9098', 0.2, 0.4),
    'scorch': K.material('Scorch', '#4a4744', 0.2, 0.65),
    'hazard': K.material('Hazard', '#d8b030', 0.1, 0.6),
    'glass': K.material('Glass', '#0d1b2b', 0.9, 0.12, emit='#16344e', strength=1.6),
    'lit': K.material('WindowLit', '#ffd9a0', 0.0, 0.5, emit='#ffcf8a', strength=2.5),
    'dock': K.material('DockLit', '#9fe8ff', 0.0, 0.5, emit='#7fe0ff', strength=2.2),
    'radiator': K.material('Radiator', '#3a2e2a', 0.2, 0.7),
    'hot': K.material('RadiatorHot', '#5a1e10', 0.0, 0.8, emit='#7a2a18', strength=3),
    'tank': K.material('Tank', '#d6d4cc', 0.1, 0.5),
    'bell': K.material('Bell', '#565c66', 0.2, 0.4),
    'throat': K.material('Throat', '#7ab8ff', 0.0, 0.5, emit='#7ab8ff', strength=4),
    'red': K.material('NavRed', '#ff3020', 0.0, 0.5, emit='#ff3020', strength=3.5),
    'green': K.material('NavGreen', '#30ff60', 0.0, 0.5, emit='#30ff60', strength=3.5),
    'navwhite': K.material('NavWhite', '#ffffff', 0.0, 0.5, emit='#ffffff', strength=3),
}

mounts = {m['id']: m for m in L['mounts']}
room = {c['id']: c for c in L['compartments']}
FLOOR = L['decks'][0]['floor']
COM = L['com']
G2B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # the game frame to Blender's, as K.B


def game(v):
    return (v.x, v.z, -v.y)


def lerp(a, b, t):
    return a + (b - a) * t


def vlerp(p, q, t):
    return tuple(lerp(a, b, t) for a, b in zip(p, q))


def origin_at(ob, p):
    """Moves an object's origin to game point `p` without moving its geometry (a hinge)."""
    o = K.B(*p)
    ob.data.transform(Matrix.Translation(-o))
    ob.location = o
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def solid(ob, t=0.03):
    """Gives an open surface (a bell) a thickness: the game culls back faces, so a one-sided bell shows half."""
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = t
    mod.offset = 0
    K.apply(ob)
    return ob


def obox(name, c, ax, ay, size, mat, bevel=0.0):
    """A box at game point `c`, its own x along `ax` and its y along `ay` (game vectors). `size` is along (ax, ay, ax × ay)."""
    ob = K.box(name, (0, 0, 0), size, mat, bevel)
    ax = Vector(ax).normalized()
    ay = Vector(ay)
    ay = (ay - ay.dot(ax) * ax).normalized()
    az = ax.cross(ay)
    R = G2B @ Matrix((ax, ay, az)).transposed() @ G2B.inverted()
    ob.data.transform(Matrix.Translation(K.B(*c)) @ R.to_4x4())
    return ob


def poly(name, pts, mat, out=None):
    """A one-sided flat face through game points `pts`, turned to face `out` (a game vector) if given."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(K.B(*p)) for p in pts])
    bm.normal_update()
    if out is not None and f.normal.dot(K.B(*out)) < 0:
        bmesh.ops.reverse_faces(bm, faces=[f])
    return K._object(bm, name, [mat])


def slab(name, rings, mat, caps=True):
    """A loft between rings of game points (each ring the same length, in order round the section), one material."""
    bm = bmesh.new()
    R = [[bm.verts.new(K.B(*p)) for p in ring] for ring in rings]
    n = len(R[0])
    for i in range(len(R) - 1):
        for j in range(n):
            bm.faces.new((R[i][j], R[i][(j + 1) % n], R[i + 1][(j + 1) % n], R[i + 1][j]))
    if caps:
        bm.faces.new(R[0])
        bm.faces.new(list(reversed(R[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return K._object(bm, name, [mat])


def plated(name, rings, mats, paint, seam, caps=(True, True), cap_mat=0, flat=None, thickness=0.03, depths=(0.02, 0.02, 0.035, -0.015)):
    """A plated loft: rings of game points, each quad between them a panel. `paint(i, j, centre)` → its material index
    (i the ring step, j the place round the ring, centre in the game frame). Every panel is inset `thickness` and raised
    or sunk a little, the rim in `seam`: dark lines between the plates. `flat(i, j)` → True leaves a panel plain."""
    bm = bmesh.new()
    R = [[bm.verts.new(K.B(*p)) for p in ring] for ring in rings]
    n = len(R[0])
    quads = []
    for i in range(len(R) - 1):
        for j in range(n):
            quads.append((i, j, bm.faces.new((R[i][j], R[i][(j + 1) % n], R[i + 1][(j + 1) % n], R[i + 1][j]))))
    ends = []
    if caps[0]:
        ends.append(bm.faces.new(R[0]))
    if caps[1]:
        ends.append(bm.faces.new(list(reversed(R[-1]))))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in ends:
        f.material_index = cap_mat
    for i, j, f in quads:
        f.material_index = paint(i, j, game(f.calc_center_median()))
    for i, j, f in quads:
        if f.calc_area() < 0.35 or (flat and flat(i, j)):
            continue
        rim = bmesh.ops.inset_individual(bm, faces=[f], thickness=thickness, depth=rnd.choice(depths))['faces']
        for r in rim:
            if r is not f:
                r.material_index = seam
    return K._object(bm, name, mats)


def text(name, s, origin, u, v, height, mat, bold=0.012, proud=0.045):
    """Flat lettering: `s` set from `origin` along `u` (reading direction), `v` up, both game vectors; it faces u × v and
    stands `proud` of the surface. Geometry, not a texture: it stays sharp at any range."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = s
    cu.size = 1.0
    cu.offset = bold
    cu.resolution_u = 2
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    u, v = Vector(u).normalized(), Vector(v).normalized()
    n = u.cross(v)
    o = Vector(origin) + n * proud
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    for vert in bm.verts:
        p = o + u * (vert.co.x * height) + v * (vert.co.y * height)
        vert.co = K.B(*p)
    bm.normal_update()
    flip = [f for f in bm.faces if f.normal.dot(K.B(*n)) < 0]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)
    return K._object(bm, name, [mat])


def stripes(name, a, b, v, out, n, mats=None, slant=0.5, proud=0.045):
    """Hazard stripes: a band from game point `a` to `b`, `v` (a game vector, its length the band's width) across it,
    facing `out`: `n` slanted bars, alternately `mats`."""
    mats = mats or (M['hazard'], M['dark'])
    a, b, v, out = Vector(a), Vector(b), Vector(v), Vector(out).normalized()
    a, b = a + out * proud, b + out * proud
    d = (b - a) / n
    obs = []
    for i in range(n):
        p0, p1 = a + d * i, a + d * (i + 1)
        q0, q1 = p0 + v + d * slant, p1 + v + d * slant
        if i == n - 1:
            q1 = p1 + v
        obs.append(poly(name, [tuple(p0), tuple(p1), tuple(q1), tuple(q0)], mats[i % 2], tuple(out)))
    return obs


def rail(name, a, b, out, h=0.16, r=0.022, posts=3, mat=None):
    """A handrail from game point `a` to `b`, standing `h` off the surface along `out`."""
    mat = mat or M['metal']
    a, b, out = Vector(a), Vector(b), Vector(out).normalized()
    obs = [K.cyl(name, tuple(a + out * h), tuple(b + out * h), r, r, mat, 4, cap=False)]
    for i in range(posts):
        p = a + (b - a) * (i / (posts - 1))
        obs.append(K.cyl(name, tuple(p), tuple(p + out * h), r, r, mat, 4, cap=False))
    return obs


def hatch(name, c, ax, ay, w, h, mat=None, frame=None):
    """A hatch on a surface: a frame and a plate, `ax` across and `ay` up it (game vectors), facing ax × ay."""
    n = Vector(ax).normalized().cross(Vector(ay).normalized())
    c = Vector(c)
    return [obox(name, tuple(c + n * 0.02), ax, ay, (w, h, 0.05), frame or M['seam']),
            obox(name, tuple(c + n * 0.04), ax, ay, (w - 0.1, h - 0.1, 0.05), mat or M['paintB'], bevel=0.012)]


parts = []  # → `fittings`
hull_parts = []  # → `hull`

# --- the hull's lines --------------------------------------------------------------------------------------------------
# Stations along her: z, the top's height and half-width, the belt's half-width and its upper and lower edges, the
# keel's half-width and the bottom. Between them she is straight. The layout's compartments decide the least she can be
# (rooms to x 4.4 and y ±1.5; the wing tanks 4.5 × 1.8 aft; magazines and heat sinks to y 2.6; keel tanks to -2.55).
ST = [
    # z      top   tw    bw    bu     bl    kw    bot
    (-13.0, 1.80, 2.5, 4.35, 1.35, -1.35, 3.0, -2.70),
    (-8.4, 2.90, 3.0, 4.72, 1.70, -1.70, 3.6, -2.90),
    (5.0, 2.90, 3.0, 4.72, 1.70, -1.70, 3.6, -2.90),
    (5.5, 2.90, 3.3, 5.00, 1.70, -1.70, 3.6, -2.90),
    (13.0, 2.90, 3.3, 5.00, 1.70, -1.70, 3.6, -2.90),
]
Z_BOW, Z_BLOCK = ST[0][0], ST[-1][0]  # the hull proper ends at the engine block's after bulkhead; the trunk carries on
Z_STERN = L['thrusters']['main'][0]['at'][2]  # the drive's bulkhead
STRAKE = 0.3  # the dark strake along the top of the belt


def at_z(z):
    """The hull's lines at z: dict(top, tw, bw, bu, bl, kw, bot)."""
    z = min(max(z, Z_BOW), Z_BLOCK)
    for a, b in zip(ST, ST[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return dict(zip(('top', 'tw', 'bw', 'bu', 'bl', 'kw', 'bot'), (lerp(a[k], b[k], t) for k in range(1, 8))))


# The bow's face is raked: its top is aft of its foot.
RAKE = 0.19


def face_z(y, proud=0.0):
    return Z_BOW + 0.05 - RAKE * (ST[0][1] - y) - proud


# Round the section, starboard side, top centre to keel centre: 11 panels a side.
KINDS = ['top', 'top', 'slope', 'slope', 'strake', 'belt', 'belt', 'low', 'low', 'keel', 'keel']


def half(z, raked=False):
    s = at_z(z)
    pts = [(0, s['top']), (s['tw'] * 0.5, s['top']), (s['tw'], s['top']),
           ((s['tw'] + s['bw']) / 2, (s['top'] + s['bu']) / 2), (s['bw'], s['bu']),
           (s['bw'], s['bu'] - STRAKE), (s['bw'], (s['bu'] - STRAKE + s['bl']) / 2), (s['bw'], s['bl']),
           ((s['bw'] + s['kw']) / 2, (s['bl'] + s['bot']) / 2), (s['kw'], s['bot']), (s['kw'] * 0.5, s['bot']), (0, s['bot'])]
    return [(x, y, face_z(y) if raked else z) for x, y in pts]


def ring(z, raked=False):
    h = half(z, raked)
    return h + [(-x, y, zz) for x, y, zz in reversed(h[1:-1])]


def kind(j):
    return KINDS[j] if j < 11 else KINDS[21 - j]


ZS = [Z_BOW, -11.5, -10.0, -8.4, -6.9, -5.4, -3.9, -2.4, -0.9, 0.6, 2.1, 3.6, 5.0, 5.5, 7.0, 8.5, 10.0, 11.5, Z_BLOCK]
HULL_MATS = [M['paint'], M['paintB'], M['under'], M['underB'], M['trim'], M['dark'], M['seam'], M['engine'], M['scorch']]
P_PAINT, P_PAINTB, P_UNDER, P_UNDERB, P_TRIM, P_DARK, P_SEAM, P_ENGINE, P_SCORCH = range(9)


def hull_paint(i, j, c):
    k, z = kind(j), c[2]
    if k == 'strake':
        return P_TRIM
    if k in ('low', 'keel'):
        return P_UNDERB if rnd.random() < 0.3 else P_UNDER
    if k == 'top' and z < -10.0:
        return P_DARK  # the anti-glare panel ahead of nothing: she has no windscreen up here, but every boat has one
    if z > 5.2:
        return P_ENGINE if k == 'belt' or rnd.random() < 0.75 else P_PAINTB
    return P_PAINTB if rnd.random() < 0.28 else P_PAINT


hull_parts.append(plated('hull-main', [ring(z, raked=(z == Z_BOW)) for z in ZS], HULL_MATS, hull_paint, P_SEAM,
                         cap_mat=P_TRIM, flat=lambda i, j: kind(j) == 'strake'))

# The drive trunk: the narrow after body round the drive machinery, from the engine block's bulkhead to the heat shield.
TRUNK = [(2.0, 2.35), (2.6, 1.75), (2.6, -1.75), (2.0, -2.35), (-2.0, -2.35), (-2.6, -1.75), (-2.6, 1.75), (-2.0, 2.35)]
TZ = [Z_BLOCK - 0.3, 14.3, 15.6, Z_STERN]
hull_parts.append(plated('trunk', [[(x, y, z) for x, y in TRUNK] for z in TZ], [M['engine'], M['scorch'], M['seam'], M['trim']],
                         lambda i, j, c: 1 if i == 2 else (3 if j in (3, 7) and i == 0 else 0), 2, caps=(False, True), cap_mat=1))

# --- the jaw: the low prow under and ahead of the canopy --------------------------------------------------------------
# z, half-width at the chine, the foredeck's height, the chine's, the bottom's. Its top stays under the helm's line of
# sight over the window sill, so the view forward is clear.
JAW = [
    (-17.0, 0.40, -1.50, -1.66, -1.90),
    (-16.0, 1.75, -1.33, -1.58, -2.12),
    (-15.0, 2.90, -1.16, -1.50, -2.34),
    (-14.0, 3.80, -0.98, -1.42, -2.56),
    (-13.3, 4.33, -0.86, -1.36, -2.72),
    (-12.3, 4.00, -0.90, -1.40, -2.55),
]


def jaw_at(z):
    for a, b in zip(JAW, JAW[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return [lerp(a[k], b[k], t) for k in range(1, 5)]


def jaw_ring(row):
    z, w, top, mid, bot = row
    h = [(0, top), (w * 0.55, top), (w, mid), (w * 0.6, bot), (0, bot)]
    return [(x, y, z) for x, y in h] + [(-x, y, z) for x, y in reversed(h[1:-1])]


JAW_MATS = [M['paintB'], M['under'], M['seam'], M['trim']]


def jaw_paint(i, j, c):
    return 0 if j in (0, 7) else (3 if j in (1, 6) else 1)  # the foredeck light, its bevel dark trim, the rest underside


hull_parts.append(plated('jaw', [jaw_ring(r) for r in JAW], JAW_MATS, jaw_paint, 2, cap_mat=1, caps=(True, False), thickness=0.025, depths=(0.015, 0.02)))

# --- the bow's face: the canopy band, the visor, the torpedo cheeks ---------------------------------------------------
fd = room['flight-deck']
win = fd['windows'][0]
WY0, WY1 = FLOOR + win['sill'], FLOOR + win['head']
WX = win['to']
# The frame, then five panes on it. All one-sided, facing forward: from the helm's couch there is nothing in the way.
parts.append(poly('canopy-frame', [(-WX - 0.22, WY0 - 0.16, face_z(WY0 - 0.16, 0.02)), (WX + 0.22, WY0 - 0.16, face_z(WY0 - 0.16, 0.02)),
                                   (WX + 0.22, WY1 + 0.16, face_z(WY1 + 0.16, 0.02)), (-WX - 0.22, WY1 + 0.16, face_z(WY1 + 0.16, 0.02))], M['dark'], (0, 0, -1)))
PANES = 5
pw = (2 * WX + 0.1) / PANES
for i in range(PANES):
    x0, x1 = -WX - 0.05 + pw * i + 0.045, -WX - 0.05 + pw * (i + 1) - 0.045
    parts.append(poly('canopy-glass', [(x0, WY0, face_z(WY0, 0.04)), (x1, WY0, face_z(WY0, 0.04)), (x1, WY1, face_z(WY1, 0.04)), (x0, WY1, face_z(WY1, 0.04))], M['glass'], (0, 0, -1)))
# The visor over the glass: above the window's head as seen from the couch.
parts.append(K.box('visor', (0, 1.4, face_z(1.4) - 0.16), (2 * WX + 0.9, 0.2, 0.34), M['trim'], bevel=0.04))
for sx in (-1, 1):
    parts.append(K.box('lamp-housing', (sx * 1.55, 1.62, face_z(1.62) - 0.03), (0.5, 0.2, 0.12), M['dark'], bevel=0.02))
    parts.append(poly('landing-lamp', [(sx * 1.55 - 0.19, 1.56, face_z(1.62) - 0.1), (sx * 1.55 + 0.19, 1.56, face_z(1.62) - 0.1),
                                       (sx * 1.55 + 0.19, 1.68, face_z(1.62) - 0.1), (sx * 1.55 - 0.19, 1.68, face_z(1.62) - 0.1)], M['navwhite'], (0, 0, -1)))

# The cheeks: the torpedo tubes' housings either side of the canopy, their doors in the raked fronts.
tubes = L['weapons']['tubes']['at']
CH_Y0, CH_Y1 = -0.92, 1.3
for s in (1, -1):
    sec = [(2.72, CH_Y0), (4.52, CH_Y0), (4.52, 0.92), (4.12, CH_Y1), (2.72, CH_Y1)]
    front = [(s * x, y, face_z(y, 0.5)) for x, y in sec]
    back = [(s * (x if x < 3 else x - 0.25), y, -11.0) for x, y in sec]
    ob = slab('cheek', [front, back], M['trim'], caps=True)
    parts.append(ob)
    parts.append(poly('cheek-face', [(s * 2.8, CH_Y0 + 0.08, face_z(CH_Y0 + 0.08, 0.52)), (s * 4.44, CH_Y0 + 0.08, face_z(CH_Y0 + 0.08, 0.52)),
                                     (s * 4.44, 0.9, face_z(0.9, 0.52)), (s * 4.08, CH_Y1 - 0.08, face_z(CH_Y1 - 0.08, 0.52)), (s * 2.8, CH_Y1 - 0.08, face_z(CH_Y1 - 0.08, 0.52))], M['dark'], (0, 0, -1)))
    # The shark's mouth, on the belt abaft the cheek: dark inside, white teeth along both lips, an eye over it.
    bp = lambda z, y, pr=0.045: (s * (at_z(z)['bw'] + pr), y, z)
    MZ0, MZ1 = -12.35, -8.75
    up_y = lambda z: lerp(0.82, -0.22, (z - MZ0) / (MZ1 - MZ0))
    lo_y = lambda z: lerp(-1.18, -0.22, (z - MZ0) / (MZ1 - MZ0))
    parts.append(poly('mouth', [bp(MZ0, up_y(MZ0)), bp(MZ0, lo_y(MZ0)), bp(MZ1, -0.22)], M['mark'], (s, 0, 0)))
    parts.append(poly('mouth-tongue', [bp(MZ0, -0.05, 0.055), bp(MZ0, -0.62, 0.055), bp(-10.2, -0.26, 0.055)], M['accent'], (s, 0, 0)))
    nt = 7
    for i in range(nt):
        za, zb = lerp(MZ0, MZ1 - 0.5, i / nt), lerp(MZ0, MZ1 - 0.5, (i + 0.9) / nt)
        zm, k_ = (za + zb) / 2, 1 - 0.75 * i / nt
        parts.append(poly('tooth', [bp(za, up_y(za), 0.065), bp(zb, up_y(zb), 0.065), bp(zm, up_y(zm) - 0.42 * k_, 0.065)], M['white'], (s, 0, 0)))
        parts.append(poly('tooth', [bp(za, lo_y(za), 0.065), bp(zb, lo_y(zb), 0.065), bp(zm, lo_y(zm) + 0.42 * k_, 0.065)], M['white'], (s, 0, 0)))
    parts.append(poly('eye', [bp(-10.75, 0.86), bp(-10.2, 0.72), bp(-10.2, 0.98)], M['white'], (s, 0, 0)))
    parts.append(poly('eye', [bp(-10.42, 0.78, 0.06), bp(-10.2, 0.72, 0.06), bp(-10.2, 0.98, 0.06), bp(-10.42, 0.92, 0.06)], M['mark'], (s, 0, 0)))
    for x, y, z in tubes:
        if x * s < 0:
            continue
        zf = face_z(y, 0.5)
        # flat, facing forward only: nothing of them shows from the flight deck
        disc = lambda r, pr: [(x + math.cos(a * math.pi / 8) * r, y + math.sin(a * math.pi / 8) * r, face_z(y + math.sin(a * math.pi / 8) * r, 0.5 + pr)) for a in range(16)]
        parts.append(poly('tube-ring', disc(0.41, 0.03), M['hazard'], (0, 0, -1)))
        parts.append(poly('tube-door', disc(0.32, 0.045), M['dark'], (0, 0, -1)))
        parts.append(poly('tube-hinge', [(x - 0.1, y + 0.3, zf - 0.06), (x + 0.1, y + 0.3, zf - 0.06), (x + 0.1, y + 0.42, zf - 0.04), (x - 0.1, y + 0.42, zf - 0.04)], M['metal'], (0, 0, -1)))
    # the navigation light on each cheek's shoulder
    parts.append(K.box('nav-housing', (s * 4.53, 1.0, -12.4), (0.1, 0.22, 0.5), M['dark'], bevel=0.02))
    parts.append(K.box('nav', (s * 4.57, 1.0, -12.4), (0.08, 0.12, 0.32), M['green'] if s > 0 else M['red']))

# Under the jaw: the forward sensors' blister.
parts.append(smooth(K.lathe('chin-sensor', [(0, 0.5), (0.5, 0.44), (0.85, 0.26), (1, 0.02)], (0, -2.52, -13.6), (0, -3.02, -13.6), M['dark'], 12)))
parts.append(K.cyl('chin-ring', (0, -2.6, -13.6), (0, -2.74, -13.6), 0.58, 0.54, M['metal'], 12))

# --- the top ----------------------------------------------------------------------------------------------------------
TOP = 2.9
# The glacis from the visor up to the top: two sensor blisters and the escape hatch.
def glacis_y(z):
    return at_z(z)['top']


for sx in (-1, 1):
    z = -10.6
    parts.append(smooth(K.lathe('blister', [(0, 0.36), (0.45, 0.33), (0.8, 0.2), (1, 0.02)], (sx * 1.7, glacis_y(z) - 0.03, z), (sx * 1.7, glacis_y(z) + 0.3, z), M['dark'], 10)))
    parts.append(K.cyl('blister-ring', (sx * 1.7, glacis_y(z) - 0.03, z), (sx * 1.7, glacis_y(z) + 0.07, z), 0.44, 0.42, M['metal'], 10))
gn = Vector((0, 4.6, -1.1)).normalized()  # the glacis' normal
parts.append(text('number-top', NUMBER, (-0.98, glacis_y(-10.25), -10.25), (1, 0, 0), (0, -1.1, -4.6), 1.55, M['white'], bold=0.02))
parts += hatch('escape-hatch', (0, TOP, -2.45), (1, 0, 0), (0, 0, -1), 0.9, 0.9, M['paint'])
for sx in (-1, 1):
    parts += rail('rail', (sx * 2.5, glacis_y(-12.3) + 0.0, -12.3), (sx * 2.85, glacis_y(-9.0), -9.0), tuple(gn), posts=4)

# The point defence magazine's loading hatch, forward of the turret.
parts += hatch('pdc-hatch', (1.5, TOP, -7.0), (1, 0, 0), (0, 0, -1), 1.3, 0.9, M['paintB'])
parts += hatch('pdc-hatch', (-1.5, TOP, -7.0), (1, 0, 0), (0, 0, -1), 1.3, 0.9, M['paintB'])
parts += stripes('hatch-stripe', (-2.2, TOP, -6.42), (2.2, TOP, -6.42), (0, 0, 0.12), (0, 1, 0), 22)

# --- the dorsal turret: a low twin mount on a ring ----------------------------------------------------------------------
# Built in the units of the game's own turret (layout.mjs `turret`) and scaled by the mount's `scale`, so the points the
# game takes on a turret land on this one: the gunhouse's origin 2.2 up the axis, the trunnions at (0, 1.7, -6.2) from
# it, the muzzles 21.3 ahead of the trunnions and 1.7 either side, the sight's eye near (3, 5.1, -3.4).
turret_objs = []
for t in (m for m in L['mounts'] if m['kind'] == 'turret'):
    k = t.get('scale', 1)
    x, y, z = t['at']
    sgn = 1 if t['up'][1] > 0 else -1
    # on the hull: the ring, its deck plate, the hazard marks of the guns' sweep
    parts.append(smooth(K.cyl('turret-ring', (x, y - sgn * 0.05, z), (x, y + sgn * 2.2 * k, z), 6.3 * k, 5.9 * k, M['trim'], 20)))
    parts.append(K.cyl('turret-deck', (x, y, z), (x, y + sgn * 0.035, z), 9.6 * k, 9.6 * k, M['under'], 8))
    n_ = 36
    for a in range(n_):
        t0, t1 = a * 2 * math.pi / n_, (a + 1) * 2 * math.pi / n_
        ri, ro = 10.2 * k, 11.3 * k
        parts.append(poly('sweep-mark', [(x + math.sin(t) * r_, y + sgn * 0.045, z + math.cos(t) * r_) for t, r_ in ((t0, ri), (t1, ri), (t1, ro), (t0, ro))], M['hazard'] if a % 2 else M['dark'], (0, sgn, 0)))
    for a in range(8):
        th = a * math.pi / 4 + math.pi / 8
        parts.append(K.box('ring-bolt', (x + math.sin(th) * 8.3 * k, y + sgn * 0.06, z + math.cos(th) * 8.3 * k), (0.12, 0.06, 0.12), M['metal']))
    house = [
        smooth(K.cyl('turntable', (0, 0, 0), (0, sgn * 0.5, 0), 5.5, 5.5, M['dark'], 18)),
        K.box('gunhouse', (0, sgn * 1.95, 1.0), (6.4, 2.9, 8.6), M['paintB'], bevel=0.7),
        obox('gunhouse-glacis', (0, sgn * 1.75, -3.9), (1, 0, 0), (0, 1, -0.55), (5.6, 2.9, 2.2), M['paintB'], bevel=0.3),
        K.box('trunnion', (-3.7, sgn * 1.7, -5.2), (1.5, 2.6, 4.6), M['trim'], bevel=0.3),
        K.box('trunnion', (3.7, sgn * 1.7, -5.2), (1.5, 2.6, 4.6), M['trim'], bevel=0.3),
        K.box('feed', (0, sgn * 1.5, 5.6), (4.6, 2.0, 1.4), M['trim'], bevel=0.25),
        K.box('sight', (3.0, sgn * 3.75, -0.6), (1.5, 1.0, 2.4), M['trim'], bevel=0.2),
        K.plane('sight-glass', (3.0, sgn * 3.78, -1.83), (1.0, 0.6), '-z', M['glass']),
        K.box('vent', (-1.4, sgn * 3.45, 2.0), (2.2, 0.16, 2.6), M['dark']),
        K.cyl('whip', (-2.6, sgn * 3.3, 4.4), (-2.6, sgn * 7.2, 5.2), 0.08, 0.04, M['dark'], 4),
        K.box('stripe', (0, sgn * 3.42, -1.6), (6.0, 0.06, 0.7), M['accent']),
    ]
    guns = [K.box('cradle', (0, sgn * 1.7, -6.5), (5.6, 1.5, 2.8), M['dark'], bevel=0.25)]
    for bx in (-1.7, 1.7):
        guns.append(smooth(K.cyl('barrel', (bx, sgn * 1.7, -6.2), (bx, sgn * 1.7, -27.5), 0.42, 0.34, M['dark'], 8)))
        guns.append(smooth(K.cyl('sleeve', (bx, sgn * 1.7, -7.6), (bx, sgn * 1.7, -14.5), 0.66, 0.6, M['trim'], 8)))
        guns.append(smooth(K.cyl('brake', (bx, sgn * 1.7, -25.6), (bx, sgn * 1.7, -27.5), 0.6, 0.6, M['metal'], 8)))
    h = K.join(house, t['id'])
    g = origin_at(K.join(guns, t['id'] + '-guns'), (0, sgn * 1.7, -6.2))
    # into place: the gunhouse's origin on the axis at the ring; the guns' on the trunnions; both at the mount's scale
    h.location = K.B(x, y + sgn * 2.2 * k, z)
    g.location = K.B(x, y + sgn * (2.2 + 1.7) * k, z - 6.2 * k)
    h.scale = g.scale = (k, k, k)
    turret_objs += [h, g]

# --- the spine: heat sinks under louvres, the mast, the antenna farm ---------------------------------------------------
SP0, SP1 = -1.6, 12.4
sp = lambda z, w, y: [(-w, TOP - 0.05, z), (-w * 0.72, y, z), (w * 0.72, y, z), (w, TOP - 0.05, z)]
parts.append(slab('spine', [sp(SP0, 0.9, TOP + 0.02), sp(SP0 + 0.9, 1.0, TOP + 0.34), sp(SP1 - 1.2, 1.0, TOP + 0.34), sp(SP1, 0.8, TOP + 0.02)], M['engine']))
for z in [0.2 + 1.15 * i for i in range(10)]:
    parts.append(K.box('spine-vent', (0, TOP + 0.35, z), (1.0, 0.04, 0.5), M['dark']))
    parts.append(K.box('spine-rib', (0, TOP + 0.2, z + 0.55), (2.04, 0.34, 0.08), M['trim']))
# the heat sinks' louvres either side of the spine
hs = room['heatsink']
for sx in (-1, 1):
    z0, z1 = hs['z'][0] + 0.3, hs['z'][1] - 0.3
    parts.append(K.box('louvre-bed', (sx * 2.05, TOP + 0.02, (z0 + z1) / 2), (1.5, 0.05, z1 - z0), M['dark']))
    n = 9
    for i in range(n):
        z = lerp(z0 + 0.25, z1 - 0.25, i / (n - 1))
        parts.append(obox('louvre', (sx * 2.05, TOP + 0.09, z), (1, 0, 0), (0, 1, 0.5), (1.4, 0.03, 0.34), M['metal']))
    parts.append(K.box('louvre-frame', (sx * 2.84, TOP + 0.05, (z0 + z1) / 2), (0.08, 0.12, z1 - z0 + 0.1), M['trim']))
    parts.append(K.box('louvre-frame', (sx * 1.26, TOP + 0.05, (z0 + z1) / 2), (0.08, 0.12, z1 - z0 + 0.1), M['trim']))
# the mast, on the spine: a radar bar, a yard with two whips, the masthead light
MZ = 5.7
ENV_TOP = L['envelope']['max'][1]
parts.append(K.cyl('mast', (0, TOP + 0.3, MZ), (0, ENV_TOP - 0.42, MZ + 0.35), 0.13, 0.07, M['trim'], 6))
parts.append(K.cyl('mast-stay', (0, TOP + 0.3, MZ + 1.1), (0, ENV_TOP - 0.75, MZ + 0.32), 0.035, 0.035, M['metal'], 4, cap=False))
parts.append(K.box('radar', (0, ENV_TOP - 0.36, MZ + 0.35), (1.5, 0.16, 0.26), M['paint'], bevel=0.03))
parts.append(K.box('yard', (0, ENV_TOP - 0.78, MZ + 0.3), (2.2, 0.06, 0.06), M['trim']))
for sx in (-1, 1):
    parts.append(K.cyl('yard-whip', (sx * 1.05, ENV_TOP - 0.78, MZ + 0.3), (sx * 1.05, ENV_TOP - 0.12, MZ + 0.5), 0.02, 0.012, M['dark'], 4))
    parts.append(K.box('yard-pod', (sx * 0.6, ENV_TOP - 0.86, MZ + 0.3), (0.16, 0.14, 0.3), M['dark']))
parts.append(K.box('masthead', (0, ENV_TOP - 0.2, MZ + 0.35), (0.12, 0.14, 0.12), M['navwhite']))
# the antenna farm, between the turret and the spine's louvres: a dish, a dome, whips, boxes
AZ = 1.3
parts.append(K.cyl('dish-post', (-2.0, TOP, AZ), (-2.0, TOP + 0.55, AZ), 0.07, 0.06, M['trim'], 6))
parts.append(solid(smooth(K.lathe('dish', [(0, 0.05), (0.35, 0.3), (0.75, 0.5), (1, 0.58)], (-2.0, TOP + 0.5, AZ), (-2.28, TOP + 0.74, AZ - 0.2), M['paint'], 12)), 0.02))
parts.append(smooth(K.lathe('satcom', [(0, 0.34), (0.5, 0.33), (0.85, 0.2), (1, 0.02)], (2.0, TOP + 0.12, AZ - 0.2), (2.0, TOP + 0.62, AZ - 0.2), M['paint'], 10)))
parts.append(K.cyl('satcom-base', (2.0, TOP, AZ - 0.2), (2.0, TOP + 0.13, AZ - 0.2), 0.4, 0.38, M['trim'], 10))
for (wx, wz, wh, lean) in ((-2.5, -0.6, 1.5, -0.25), (2.55, 1.6, 1.3, 0.2), (-1.2, -2.4, 0.9, 0.0), (1.5, -2.2, 1.1, 0.1), (2.4, -0.9, 0.7, 0.0)):
    parts.append(K.box('whip-base', (wx, TOP + 0.05, wz), (0.14, 0.1, 0.14), M['dark']))
    parts.append(K.cyl('whip', (wx, TOP + 0.1, wz), (wx + lean, min(TOP + wh, ENV_TOP - 0.06), wz + 0.25), 0.018, 0.008, M['dark'], 4))
parts.append(K.box('comms-box', (-1.9, TOP + 0.13, -1.6), (0.9, 0.26, 0.7), M['engine'], bevel=0.04))
parts.append(K.box('comms-box', (1.3, TOP + 0.1, 0.9), (0.6, 0.2, 0.9), M['trim'], bevel=0.04))
parts.append(K.box('ecm', (-2.3, TOP + 0.16, 2.6), (0.5, 0.32, 1.1), M['dark'], bevel=0.06))
# the repair drones' rack: two hatches on the top, forward of the louvres
dr = room['drone-rack']
for sx in (-1, 1):
    parts += hatch('drone-hatch', (sx * 2.1, TOP, sum(dr['z']) / 2 - 0.1), (1, 0, 0), (0, 0, -1), 1.0, 1.0, M['paintB'])

# --- the sides ---------------------------------------------------------------------------------------------------------
BW = ST[1][3]  # the belt amidships
BU, BL = ST[1][4], ST[1][5]
slope_n = lambda s: Vector((s * (TOP - BU), ST[1][3] - ST[1][2], 0)).normalized()  # the upper slope's normal
slope_v = lambda s: Vector((s * (ST[1][2] - ST[1][3]), TOP - BU, 0)).normalized()  # up it


def slope_pt(s, z, t):
    """On the upper slope amidships: t 0 at the belt's top, 1 at the top's edge."""
    return Vector((s * lerp(BW, ST[1][2], t), lerp(BU, TOP, t), z))


def low_pt(s, z, t):
    """On the lower slope amidships: t 0 at the belt's foot, 1 at the keel's edge."""
    return Vector((s * lerp(BW, ST[1][6], t), lerp(BL, ST[1][7], t), z))


low_n = lambda s: Vector((s * (BL - ST[1][7]), -(BW - ST[1][6]), 0)).normalized()

# The cutter's stripe: a wide orange bar and a narrow white one, slanted, across the belt and up the slope, each side.
STRIPE_Z, SLANT = -7.4, 0.42
for s in (1, -1):
    out = (s, 0, 0)
    y0, y1 = BL + 0.04, BU - STRAKE - 0.02
    for z_off, w, mat in ((0.0, 1.05, M['accent']), (1.25, 0.26, M['white']), (1.62, 0.14, M['accent'])):
        za = STRIPE_Z + z_off
        b0, b1 = za - SLANT * (y0 - BL), za - SLANT * (y1 - BL)
        parts.append(poly('stripe', [(s * (BW + 0.045), y0, b0), (s * (BW + 0.045), y0, b0 + w), (s * (BW + 0.045), y1, b1 + w), (s * (BW + 0.045), y1, b1)], mat, out))
        # up the slope, the same slant carried on (by height)
        n = slope_n(s) * 0.045
        c0, c1 = za - SLANT * (BU - BL), za - SLANT * (TOP - BL)
        p = [slope_pt(s, c0, 0.03) + n, slope_pt(s, c0 + w, 0.03) + n, slope_pt(s, c1 + w, 0.97) + n, slope_pt(s, c1, 0.97) + n]
        parts.append(poly('stripe', [tuple(q) for q in p], mat, tuple(slope_n(s))))
    # Her number, on the belt abaft the port: it reads toward the bow to starboard, toward the stern to port.
    parts.append(text('number', NUMBER, (s * BW, 0.12, 3.75 if s > 0 else 1.75), (0, 0, -s), (0, 1, 0), 1.6, M['mark'], bold=0.02))
# The stripe carried over her back, on the glacis.
for z_off, w, mat in ((0.0, 1.05, M['accent']), (1.25, 0.26, M['white']), (1.62, 0.14, M['accent'])):
    za = STRIPE_Z + z_off - SLANT * (TOP - BL)
    zb = min(za + w, -8.42)
    tw_ = lambda z: at_z(z)['tw'] - 0.03
    parts.append(poly('stripe', [(-tw_(za), glacis_y(za) + 0.045, za), (tw_(za), glacis_y(za) + 0.045, za), (tw_(zb), glacis_y(zb) + 0.045, zb), (-tw_(zb), glacis_y(zb) + 0.045, zb)], mat, (0, 1, 0)))

# Armour over the lower belt amidships: slabs standing off the hull, a gap between each; none where the port is.
SLAB_Y0, SLAB_Y1, SLAB_T = BL + 0.08, -0.32, 0.17
slabs = {1: [(-1.2, 0.78), (0.86, 2.84), (2.92, 4.9)], -1: [(-5.3, -3.3), (-3.22, -1.22), (-1.14, 0.86), (0.94, 2.86), (2.94, 4.9)]}
for s, runs in slabs.items():
    for i, (z0, z1) in enumerate(runs):
        parts.append(K.box('belt-armour', (s * (BW + SLAB_T / 2 + 0.01), (SLAB_Y0 + SLAB_Y1) / 2, (z0 + z1) / 2), (SLAB_T, SLAB_Y1 - SLAB_Y0, z1 - z0), M['paintB'] if i % 2 else M['paint'], bevel=0.045))
        for z in (z0 + 0.2, z1 - 0.2):
            for y in (SLAB_Y0 + 0.18, SLAB_Y1 - 0.18):
                parts.append(K.box('armour-bolt', (s * (BW + SLAB_T + 0.02), y, z), (0.04, 0.09, 0.09), M['seam']))

# Lit ports in the belt: the crew space to port, the galley and mess to starboard.
ports = [(-1, z) for z in (-5.0, -4.0, -3.0, -2.2)] + [(1, z) for z in (-5.35, -4.75)]
for s, z in ports:
    parts.append(K.box('port-frame', (s * (BW + 0.02), 0.45, z), (0.08, 0.34, 0.66), M['dark'], bevel=0.02))
    parts.append(K.plane('port', (s * (BW + 0.065), 0.45, z), (0.5, 0.2), 'x' if s > 0 else '-x', M['lit']))

# Handrails along the upper slopes, hatches and boxes on them.
for s in (1, -1):
    n = slope_n(s)
    for z0, z1 in ((-6.2, -3.4), (-1.8, 1.0), (2.2, 4.6)):
        parts += rail('rail', tuple(slope_pt(s, z0, 0.82)), tuple(slope_pt(s, z1, 0.82)), tuple(n))
    parts += hatch('slope-hatch', tuple(slope_pt(s, 0.2 if s > 0 else -2.4, 0.42)), (0, 0, -s), tuple(slope_v(s)), 1.0, 0.8, M['paintB'])
    parts.append(obox('slope-box', tuple(slope_pt(s, 3.4 if s > 0 else 1.6, 0.35) + n * 0.1), (0, 0, 1), tuple(slope_v(s)), (1.3, 0.5, 0.22), M['trim'], bevel=0.04))
    # pipes along the foot of the belt
    for y, r in ((SLAB_Y1 + 0.12, 0.06), (SLAB_Y1 + 0.27, 0.04)):
        parts.append(K.cyl('pipe', (s * (BW + 0.06), y, -1.2 if s > 0 else -5.3), (s * (BW + 0.06), y, 4.95), r, r, M['metal'], 5, cap=False))
    for z in ((-0.8, 0.9, 2.6, 4.3) if s > 0 else (-4.6, -2.6, -0.6, 1.4, 3.4)):
        parts.append(K.box('pipe-clamp', (s * (BW + 0.06), SLAB_Y1 + 0.19, z), (0.18, 0.34, 0.1), M['trim']))
    # boxes and a hatch on the lower slope
    ln = low_n(s)
    lv = Vector((s * (BW - ST[1][6]), BL - ST[1][7], 0)).normalized()
    parts.append(obox('low-box', tuple(low_pt(s, -5.5, 0.45) + ln * 0.1), (0, 0, 1), tuple(lv), (2.2, 0.7, 0.22), M['underB'], bevel=0.05))
    parts.append(obox('low-box', tuple(low_pt(s, -0.9, 0.5) + ln * 0.08), (0, 0, 1), tuple(lv), (1.2, 0.9, 0.18), M['trim'], bevel=0.05))
    parts += hatch('low-hatch', tuple(low_pt(s, 7.4, 0.5)), (0, 0, s), tuple(lv), 1.4, 0.8, M['under'])

# The tally, under the canopy to port: four raiders.
for i in range(4):
    zc = -5.9 + i * 0.42
    xb = -(at_z(zc)['bw'] + 0.05)
    parts.append(poly('tally', [(xb, 0.95, zc + 0.15), (xb, 0.95, zc - 0.15), (xb, 1.21, zc)], M['accent'], (-1, 0, 0)))

# --- the docking port: a collar on the starboard side at the layout's `dock` ---------------------------------------------
D = L['dock']
dx, dy, dz = D['skin'], D['at'][1], D['at'][2]
dw, dh = D['w'], D['h']
sgn = 1 if D['out'][0] > 0 else -1
depth = dx - BW
parts.append(K.box('dock-collar', (sgn * (BW + depth / 2 - 0.02), dy, dz), (depth, dh + 0.7, dw + 0.7), M['trim'], bevel=0.08))
parts.append(K.box('dock-door', (sgn * (dx - 0.01), dy, dz), (0.06, dh, dw), M['dark']))
parts.append(K.box('dock-door-leaf', (sgn * (dx + 0.0), dy, dz), (0.06, dh - 0.16, dw - 0.16), M['paintB'], bevel=0.015))
parts.append(K.plane('dock-window', (sgn * (dx + 0.035), dy + 0.45, dz), (0.3, 0.3), 'x' if sgn > 0 else '-x', M['lit']))
# the lit ring: four bars round the door
for (cy, cz, h, w) in ((dy + dh / 2 + 0.17, dz, 0.07, dw + 0.3), (dy - dh / 2 - 0.17, dz, 0.07, dw + 0.3), (dy, dz - dw / 2 - 0.17, dh + 0.3, 0.07), (dy, dz + dw / 2 + 0.17, dh + 0.3, 0.07)):
    parts.append(K.box('dock-ring', (sgn * (dx - 0.0), cy, cz), (0.05, h, w), M['dock']))
# hazard stripes fore and aft of the collar, on the belt
for z0, z1 in ((dz - dw / 2 - 0.95, dz - dw / 2 - 0.45), (dz + dw / 2 + 0.45, dz + dw / 2 + 0.95)):
    parts += stripes('dock-stripe', (sgn * BW, dy - dh / 2 - 0.2, z0), (sgn * BW, dy + dh / 2 + 0.2, z0), (0, 0, z1 - z0), (sgn, 0, 0), 9, slant=0.0)
# latches and a guide light
for cy in (dy + dh / 2 + 0.05, dy - dh / 2 - 0.05):
    for cz in (dz - dw / 2 - 0.05, dz + dw / 2 + 0.05):
        parts.append(K.box('dock-latch', (sgn * (dx - 0.01), cy, cz), (0.08, 0.16, 0.16), M['metal']))
parts += rail('dock-rail', (sgn * BW, dy + dh / 2 + 0.55, dz - 0.9), (sgn * BW, dy + dh / 2 + 0.55, dz + 0.9), (sgn, 0, 0), h=0.2)

# --- point defence sponsons on the lower shoulders (the guns are the game's) -------------------------------------------
for e in (m for m in L['mounts'] if m['kind'] == 'pdc'):
    k = e.get('scale', 1)
    p, u = Vector(e['at']), Vector(e['up'])
    parts.append(smooth(K.cyl('pdc-sponson', tuple(p - u * 0.85), tuple(p + u * 1.4 * k), 3.4 * k, 2.1 * k, M['under'], 12)))
    parts.append(smooth(K.cyl('pdc-ring', tuple(p + u * 1.4 * k), tuple(p + u * 1.7 * k), 1.95 * k, 1.95 * k, M['dark'], 12)))
    s = 1 if p.x > 0 else -1
    # the fairing fore and aft of it, and the ammunition feed's trunk up the lower slope
    for dzz, ln_ in ((-1.0, 1.5), (1.0, 1.5)):
        parts.append(obox('pdc-fairing', tuple(p - u * 0.42 + Vector((0, 0, dzz * 0.9))), (0, 0, 1), tuple(Vector((s * 0.7071, 0.7071, 0)) if False else (-s * u.y, s * u.x, 0)), (ln_, 1.3, 0.75), M['under'], bevel=0.2))

# --- the keel: a strake under her, the cradle pads -----------------------------------------------------------------------
ENV_BOT = L['envelope']['min'][1]
kb = max(ENV_BOT + 0.05, -3.12)
ks = lambda z, w, y: [(-w, -2.86, z), (-w * 0.6, y, z), (w * 0.6, y, z), (w, -2.86, z)]
parts.append(slab('keel', [ks(-10.5, 0.5, -2.9), ks(-9.0, 0.9, kb), ks(9.5, 0.9, kb), ks(11.5, 0.5, -2.9)][::-1], M['underB']))
for z in (-6.5, -1.0, 4.5, 8.5):
    for sx in (-1, 1):
        parts.append(K.box('cradle-pad', (sx * 2.6, -2.93, z), (1.0, 0.1, 1.4), M['metal'], bevel=0.03))
        parts += stripes('pad-stripe', (sx * 2.6 - 0.5, -2.9, z + 0.95), (sx * 2.6 + 0.5, -2.9, z + 0.95), (0, 0, -0.14), (0, -1, 0), 6, proud=0.03)

# --- the engine block: radiators, the manoeuvring quads -----------------------------------------------------------------
radiator_objs = []
RUN_IN = 0.06  # plant.mjs: a panel run right in is this much of its span
for r in (m for m in L['mounts'] if m['kind'] == 'radiator'):
    a, b = r['x']
    z0, z1 = r['z']
    s = 1 if a + b > 0 else -1
    inb, outb = (a, b) if s > 0 else (b, a)
    span, zm, y = abs(b - a), (z0 + z1) / 2, r['y']
    panel = [K.box('radiator', ((a + b) / 2, y, zm), (span, 0.07, z1 - z0), M['radiator'])]
    # ribs across the panel (they keep their look as it runs in), hot lines between them, a frame, the tip light
    n = 8
    for i in range(n + 1):
        z = lerp(z0 + 0.06, z1 - 0.06, i / n)
        panel.append(K.box('rib', ((a + b) / 2, y, z), (span, 0.15, 0.07), M['trim']))
    for i in range(n):
        z = lerp(z0 + 0.06, z1 - 0.06, (i + 0.5) / n)
        panel.append(K.box('fin', ((a + b) / 2 + s * 0.1, y, z), (span - 0.5, 0.1, 0.2), M['hot']))
    panel.append(K.box('radiator-edge', (outb - s * 0.09, y, zm), (0.18, 0.2, z1 - z0 + 0.1), M['trim']))
    panel.append(K.box('radiator-tip', (outb - s * 0.2, y + 0.13, zm), (0.4, 0.1, 0.7), M['accent']))
    panel.append(K.box('nav', (outb - s * 0.1, y + 0.16, z1 - 0.3), (0.2, 0.14, 0.3), M['green'] if s > 0 else M['red']))
    rad = origin_at(K.join(panel, r['id']), (inb, y, zm))
    rad.scale = (RUN_IN, 1, 1)  # run in, as she lies in a berth; where she has a plant, plant.mjs sets it every frame
    radiator_objs.append(rad)
    # the slot it runs into: a housing on the engine block's side, hazard stripes over and under
    parts.append(K.box('radiator-housing', (inb - s * 0.07, y, zm), (0.5, 0.62, z1 - z0 + 0.7), M['trim'], bevel=0.08))
    parts.append(K.box('radiator-slot', (inb + s * 0.16, y, zm), (0.06, 0.26, z1 - z0 + 0.2), M['dark']))
    for yy in (y + 0.42, y - 0.5):
        parts += stripes('slot-stripe', (inb, yy, z0 - 0.2), (inb, yy, z1 + 0.2), (0, 0.1, 0), (s, 0, 0), 30)
    # coolant mains from the spine's heat sinks down to the housing
    for z in (z0 + 0.5, zm, z1 - 0.5):
        parts.append(K.cyl('coolant-main', (s * 3.3, TOP + 0.02, z), (s * 5.03, 1.72, z), 0.07, 0.07, M['metal'], 5, cap=False))
        parts.append(K.cyl('coolant-main', (s * 5.03, 1.72, z), (s * 5.03, y + 0.3, z), 0.07, 0.07, M['metal'], 5, cap=False))

RS = L['thrusters'].get('rcsScale', 1)
for c in L['thrusters']['rcs']:
    p = Vector(c['at'])
    d = [1 if p[i] > COM[i] else -1 for i in range(3)]
    s_ = at_z(p.z)
    # the pylon: from the hull's slope out to the block
    foot = Vector((d[0] * (s_['bw'] - 0.55), d[1] * (abs(s_['bu']) + 0.25), p.z))
    parts.append(obox('rcs-pylon', tuple((foot + p) / 2), tuple(p - foot), (0, 0, 1), ((p - foot).length + 0.2, 0.5, 0.26), M['trim'], bevel=0.05))
    parts.append(K.box('rcs-block', tuple(p), (1.5 * RS, 1.5 * RS, 1.7 * RS), M['engine'], bevel=0.06))
    for i in range(3):
        dv = Vector((0, 0, 0))
        dv[i] = d[i]
        a_, b_ = p + dv * 0.62 * RS, p + dv * 1.3 * RS
        parts.append(solid(smooth(K.lathe('rcs-nozzle', [(0, 0.3 * RS), (0.5, 0.42 * RS), (1, 0.62 * RS)], tuple(a_), tuple(b_), M['bell'], 8)), 0.012))
        parts.append(K.cyl('rcs-throat', tuple(p + dv * 0.5 * RS), tuple(p + dv * 0.78 * RS), 0.3 * RS, 0.3 * RS, M['dark'], 8))

# The sails: two fixed radiator fins canted out from the engine block's shoulders. They shed the reactor's idle heat with
# the folding panels run in (in a berth, in a fight), and they are the cutter's mark from astern. Their ribs glow with
# the folding radiators' (`RadiatorHot`).
SAIL_TOP = min(ENV_TOP - 0.12, 4.42)
for s in (1, -1):
    root = [Vector((s * 3.1, TOP - 0.15, 6.9)), Vector((s * 3.1, TOP - 0.15, 12.7))]  # leading, trailing
    tip = [Vector((s * 4.72, SAIL_TOP, 10.6)), Vector((s * 4.72, SAIL_TOP, 12.95))]
    span = (tip[0] - root[0])
    nrm = Vector((s * (SAIL_TOP - TOP + 0.15), -(4.72 - 3.1), 0)).normalized()  # outboard and down: the outer face
    def fin(u, v, side=0, th=None):
        """On the fin: u along the chord (0 leading), v up the span (0 root); `side` ±1 the outer or inner face."""
        a, b = root[0].lerp(tip[0], v), root[1].lerp(tip[1], v)
        t = lerp(0.14, 0.05, v) if th is None else th
        return a.lerp(b, u) + nrm * side * t
    rings = []
    for v in (0.0, 0.5, 1.0):
        rings.append([tuple(fin(0, v)), tuple(fin(0.06, v, 1)), tuple(fin(0.97, v, 1)), tuple(fin(1, v)), tuple(fin(0.97, v, -1)), tuple(fin(0.06, v, -1))])
    parts.append(slab('sail', rings, M['engine']))
    for side in (1, -1):
        nn = nrm * side
        q = lambda u, v, pr=0.03: tuple(fin(u, v, side) + nn * pr)
        parts.append(poly('sail-panel', [q(0.1, 0.06), q(0.93, 0.06), q(0.93, 0.8), q(0.1, 0.8)], M['radiator'], tuple(nn)))
        for i in range(6):
            v0 = 0.1 + i * 0.118
            parts.append(poly('sail-fin', [q(0.14, v0, 0.045), q(0.9, v0, 0.045), q(0.9, v0 + 0.05, 0.045), q(0.14, v0 + 0.05, 0.045)], M['hot'], tuple(nn)))
        parts.append(poly('sail-tip', [q(0.02, 0.86), q(0.98, 0.86), q(0.98, 0.97), q(0.02, 0.97)], M['accent'], tuple(nn)))
    parts.append(K.box('sail-light', tuple(fin(1.0, 1.0) + Vector((0, 0.04, 0.02))), (0.1, 0.12, 0.16), M['green'] if s > 0 else M['red']))
    parts.append(obox('sail-root', tuple(fin(0.5, 0.0) + Vector((0, 0.02, 0))), (0, 0, 1), tuple(span), (5.9, 0.3, 0.42), M['trim'], bevel=0.06))

# Engine block detail: access panels, vents and rails on its sides; the after bulkhead; the stern light.
for s in (1, -1):
    parts.append(K.box('block-vent', (s * 5.02, -0.95, 10.2), (0.06, 0.7, 2.6), M['dark']))
    for i in range(6):
        parts.append(K.box('block-slat', (s * 5.05, -0.95, 9.1 + i * 0.44), (0.05, 0.7, 0.07), M['trim']))
    parts.append(K.box('block-panel', (s * 5.02, -0.9, 7.0), (0.06, 0.9, 1.3), M['paintB'], bevel=0.015))
    parts += rail('rail', (s * 5.0, 1.25, 6.0), (s * 5.0, 1.25, 8.0), (s, 0, 0), h=0.14)
parts.append(K.box('stern-light', (0, 2.42, Z_STERN - 0.4), (0.3, 0.12, 0.2), M['navwhite']))
# the after bulkhead, either side of the trunk: grilles and a frame
for s in (1, -1):
    parts.append(K.box('bulkhead-grille', (s * 3.75, 0.9, Z_BLOCK + 0.02), (1.5, 0.9, 0.06), M['dark']))
    for i in range(5):
        parts.append(K.box('grille-slat', (s * 3.75, 0.56 + i * 0.17, Z_BLOCK + 0.05), (1.5, 0.05, 0.06), M['metal']))
parts.append(K.box('bulkhead-frame', (0, 2.6, Z_BLOCK + 0.03), (5.6, 0.22, 0.1), M['trim']))
parts.append(K.box('bulkhead-frame', (0, -2.6, Z_BLOCK + 0.03), (5.6, 0.22, 0.1), M['trim']))

# --- the drive: the trunk's tanks and truss, a heat shield, one main bell and four verniers ------------------------------
# Either side of the trunk: a propellant tank in its saddle, braced back to the heat shield.
for s in (1, -1):
    tx, tz0, tz1, tr = s * 3.78, Z_BLOCK + 0.35, Z_STERN - 0.25, 1.0
    prof = [(0, 0.06), (0.05, 0.5), (0.12, 0.82), (0.22, 1.0), (0.78, 1.0), (0.88, 0.82), (0.95, 0.5), (1, 0.06)]
    parts.append(smooth(K.lathe('tank', [(t, r * tr) for t, r in prof], (tx, 0, tz0), (tx, 0, tz1), M['tank'], 16)))
    for z in (tz0 + 1.0, tz1 - 1.0):
        parts.append(smooth(K.cyl('tank-strap', (tx, 0, z - 0.07), (tx, 0, z + 0.07), tr + 0.03, tr + 0.03, M['trim'], 16, cap=False)))
        parts.append(K.box('tank-saddle', (s * 2.75, 0, z), (0.5, 1.5, 0.3), M['trim'], bevel=0.04))
    parts.append(K.box('tank-band', (tx, 0, (tz0 + tz1) / 2), (0.06, 2 * tr + 0.03, 0.5), M['accent']))
    for sy in (1, -1):
        parts.append(K.cyl('truss', (s * 4.5, sy * 1.5, Z_BLOCK), (s * 2.7, sy * 2.0, Z_STERN + 0.05), 0.06, 0.06, M['metal'], 5, cap=False))
        parts.append(K.cyl('truss', (s * 4.5, sy * 1.5, Z_BLOCK), (s * 2.62, sy * 1.5, Z_BLOCK + 1.6), 0.05, 0.05, M['metal'], 5, cap=False))
        # a pressurant sphere over and under each tank
        parts.append(smooth(K.lathe('sphere', [(0, 0.05), (0.15, 0.3), (0.5, 0.42), (0.85, 0.3), (1, 0.05)], (s * 3.3, sy * 1.55, Z_BLOCK + 0.5), (s * 3.3, sy * 1.55, Z_BLOCK + 1.34), M['metal'], 10)))
        parts.append(K.cyl('feed-line', (s * 3.3, sy * 1.55, Z_BLOCK + 1.3), (s * 2.62, sy * 1.2, Z_BLOCK + 2.6), 0.035, 0.035, M['metal'], 4, cap=False))
# pipes along the trunk's top and bottom
for sx in (-0.9, -0.6, 0.7):
    parts.append(K.cyl('trunk-pipe', (sx, 2.4, Z_BLOCK), (sx, 2.4, Z_STERN - 0.1), 0.05, 0.05, M['metal'], 5, cap=False))
for z in (13.9, 15.2, 16.4):
    parts.append(K.box('trunk-clamp', (-0.1, 2.4, z), (2.0, 0.12, 0.1), M['trim']))

sh = lambda z, g: [(x * g, y * g, z) for x, y in TRUNK]
parts.append(slab('heat-shield', [sh(Z_STERN - 0.12, 1.0), sh(Z_STERN + 0.1, 1.07), sh(Z_STERN + 0.24, 1.07), sh(Z_STERN + 0.3, 0.97)], M['scorch']))
parts.append(slab('shield-plate', [sh(Z_STERN + 0.3, 0.9), sh(Z_STERN + 0.34, 0.86)], M['dark']))
for d in L['thrusters']['main']:
    x, y, z = d['at']
    r = d['r']
    z_mouth = z + r * 1.8  # where the game's plume starts
    z0 = z + 0.42
    n = 9
    prof = [(t / n, r * (0.36 + 0.64 * (t / n) ** 0.62)) for t in range(n + 1)]
    parts.append(solid(smooth(K.lathe('bell', prof, (x, y, z0), (x, y, z_mouth), M['bell'], 24)), 0.05))
    for t in (0.3, 0.55, 0.8):
        rr = r * (0.36 + 0.64 * t ** 0.62)
        zz = lerp(z0, z_mouth, t)
        parts.append(smooth(K.cyl('bell-hoop', (x, y, zz - 0.04), (x, y, zz + 0.04), rr + 0.045, rr + 0.055, M['metal'], 24, cap=False)))
    parts.append(K.plane('throat', (x, y, z0 + 0.25), (r * 0.9, r * 0.9), 'z', M['throat']))
    parts.append(smooth(K.cyl('chamber', (x, y, z + 0.3), (x, y, z0 + 0.3), r * 0.62, r * 0.5, M['metal'], 16)))
    parts.append(K.cyl('gimbal', (x, y, z + 0.3), (x, y, z + 0.5), r * 0.85, r * 0.85, M['trim'], 8))
    # the gimbal's actuators
    for a in range(4):
        th2 = a * math.pi / 2
        cx, cy = math.cos(th2), math.sin(th2)
        parts.append(K.cyl('actuator', (x + cx * 1.7, y + cy * 1.7, z + 0.3), (x + cx * r * 0.74, y + cy * r * 0.74, lerp(z0, z_mouth, 0.42)), 0.05, 0.035, M['trim'], 5, cap=False))
    # the verniers: four small bells at the shield's corners, their mouths short of the main bell's
    for sx in (-1, 1):
        for sy in (-1, 1):
            vx, vy, vr = x + sx * 1.95, y + sy * 1.72, 0.42
            vp = [(t / 5, vr * (0.4 + 0.6 * (t / 5) ** 0.65)) for t in range(6)]
            parts.append(solid(smooth(K.lathe('vernier', vp, (vx, vy, z + 0.5), (vx, vy, z + 1.25), M['bell'], 12)), 0.03))
            parts.append(K.plane('vernier-throat', (vx, vy, z + 0.62), (vr * 0.6, vr * 0.6), 'z', M['throat']))
            parts.append(K.cyl('vernier-base', (vx, vy, z + 0.3), (vx, vy, z + 0.55), vr * 0.6, vr * 0.5, M['metal'], 8))
    # pumps on the shield between the bells
    for (bx, by, w, h) in ((0, 1.85, 1.5, 0.4), (0, -1.85, 1.5, 0.4), (-2.05, 0, 0.5, 1.4), (2.05, 0, 0.5, 1.4)):
        parts.append(K.box('pump', (x + bx, y + by, z + 0.48), (w, h, 0.36), M['trim'], bevel=0.06))

# --- out ----------------------------------------------------------------------------------------------------------------
parts = [p for p in parts if p and len(p.data.polygons)]
if '--where' in args:  # which part reaches furthest each way
    ext = {}
    for o in parts:
        for v in o.data.vertices:
            g = game(o.matrix_world @ v.co)
            for i in range(3):
                for sgn_, key in ((1, 'max'), (-1, 'min')):
                    kk = f'{"xyz"[i]} {key}'
                    if kk not in ext or g[i] * sgn_ > ext[kk][0] * sgn_:
                        ext[kk] = (g[i], o.name)
    for kk, (val, nm) in ext.items():
        print(f'  {kk}: {val:.2f} {nm}')
hull = K.join(hull_parts, 'hull')
fittings = K.join(parts, 'fittings')
objs = [hull, fittings, *turret_objs, *radiator_objs]

# Inside the layout's envelope, radiators run in (the game's 0.06 of their span)?
bpy.context.view_layer.update()
lo, hi = [1e9] * 3, [-1e9] * 3
for o in objs:
    mw = o.matrix_world
    for v in o.data.vertices:
        g = game(mw @ v.co)
        lo = [min(a, b) for a, b in zip(lo, g)]
        hi = [max(a, b) for a, b in zip(hi, g)]
env = L['envelope']
over = [f'{"xyz"[i]} {lo[i]:.2f}..{hi[i]:.2f} (envelope {env["min"][i]}..{env["max"][i]})' for i in range(3) if lo[i] < env['min'][i] - 0.06 or hi[i] > env['max'][i] + 0.06]
print('outside: ' + ', '.join(f'{"xyz"[i]} {lo[i]:.2f}..{hi[i]:.2f}' for i in range(3)))
for o in objs:
    if '--where' in args:
        ys = [game(o.matrix_world @ v.co)[1] for v in o.data.vertices]
        print('  ', o.name, 'y', round(min(ys), 2), round(max(ys), 2), 'loc', tuple(o.location), 'scale', tuple(o.scale))
assert not over, 'outside the layout\'s envelope: ' + '; '.join(over)

kb = K.export(OUT, blend)
tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
print(f'cutter hull: {OUT} {kb} KB, about {tris} triangles, {len(M)} materials')
