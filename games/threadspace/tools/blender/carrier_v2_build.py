# Builds the spin-drum carrier's outside from its layout, ships/carrier.layout.json (made by tools/carrier-v2.mjs):
# the hull lofted from the layout's sections (bow, the fixed armoured sleeve round the drums, the hangar, the stern;
# the sleeve an open tube, so the drums, the spine and the struts that hold it show through its ends: drum.structure),
# the bridge tower, the launch doors cut through both sides of the hangar, and the fittings at the layout's mounts:
# turrets (gunhouse and guns as their own objects, as carrier_build.py makes them, so the game trains them), point
# defence sponsons, the radiators (hinged, their own objects), the drive bells, the manoeuvring clusters, armour belts,
# the bridge's side windows and shutters, masts, sensors and lights. The drums inside are the game's (drum.mjs).
#
#   blender -b --factory-startup --python tools/blender/carrier_v2_build.py            (from the threadspace folder)
#   blender -b --factory-startup --python tools/blender/carrier_v2_build.py -- --blend /tmp/carrier-v2.blend
#
# Output: assets/carrier/hull.glb, which carrier.html loads (and falls back to its lofted hull without).
# The first carrier, archived, is archive/carrier-v1/carrier_build.py → hull-v1.glb there.
import sys, os, json, math, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shipkit as K
import bmesh
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(HERE))
L = json.load(open(os.path.join(ROOT, 'ships', 'carrier.layout.json')))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
blend = args[args.index('--blend') + 1] if '--blend' in args else None
OUT = os.path.join(ROOT, 'assets', 'carrier', 'hull.glb')

K.reset()
rnd = random.Random(23)
M = {
    'hull': K.material('Hull', '#9aa3ad', 0.45, 0.5),
    'hullB': K.material('HullB', '#8a939d', 0.45, 0.55),
    'hullC': K.material('HullC', '#a9b1ba', 0.4, 0.5),
    'sleeve': K.material('Sleeve', '#7d868f', 0.5, 0.5),
    'island': K.material('Island', '#868f99', 0.45, 0.5),
    'dark': K.material('Dark', '#2a2f36', 0.6, 0.55),
    'trim': K.material('Trim', '#3a414d', 0.5, 0.5),
    'belt': K.material('Belt', '#59616b', 0.5, 0.45),
    'armour': K.material('Armour', '#6e7782', 0.5, 0.45),
    'glass': K.material('Glass', '#0e1a2a', 0.9, 0.12, emit='#0a1626', strength=1),
    'radiator': K.material('Radiator', '#3a2e2a', 0.4, 0.7),
    'hot': K.material('RadiatorHot', '#5a1e10', 0.0, 0.8, emit='#7a2a18', strength=3),
    'hazard': K.material('Hazard', '#d8b030', 0.1, 0.6),
    'bell': K.material('Bell', '#2a2e35', 0.75, 0.4),
    'throat': K.material('Throat', '#7ab8ff', 0.0, 0.5, emit='#7ab8ff', strength=6),
    'red': K.material('NavRed', '#ff3020', 0.0, 0.5, emit='#ff3020', strength=8),
    'green': K.material('NavGreen', '#30ff60', 0.0, 0.5, emit='#30ff60', strength=8),
    'white': K.material('NavWhite', '#ffffff', 0.0, 0.5, emit='#ffffff', strength=8),
}

SEC = {s['id']: s for s in L['sections']}
bays = [m for m in L['mounts'] if m['kind'] == 'bay-door']
turrets = [m for m in L['mounts'] if m['kind'] == 'turret']
hangar = next(c for c in L['compartments'] if c['id'] == 'hangar')
secs = L['hull']['main']


def game(v):
    """A Blender point back in the game frame."""
    return (v.x, v.z, -v.y)


def section_at(z):
    for a, b in zip(secs, secs[1:]):
        if a['z'] <= z <= b['z'] and b['z'] - a['z'] > 1:
            t = (z - a['z']) / (b['z'] - a['z'])
            return {k: a.get(k, d) + (b.get(k, d) - a.get(k, d)) * t for k, d in (('w', 0), ('h', 0), ('y', 0), ('c', 0.32))}, a, b
    return None, None, None


def near_bay(x, y, z, pad=6):
    return any(abs(x - b['x']) < 4 and b['z'][0] - pad <= z <= b['z'][1] + pad and b['y'][0] - pad <= y <= b['y'][1] + pad for b in bays)


def keep_main(c):
    x, y, z = game(c)
    if near_bay(x, y, z):
        return False  # flat round the launch doors
    for t in turrets:
        if math.hypot(x - t['at'][0], z - t['at'][2]) < 9 and abs(y - t['at'][1]) < 3:
            return False  # flat under each turret's ring
    return True


# --- the hull --------------------------------------------------------------------------------------------------------
# Three lofts: the bow (capped aft: its after bulkhead), the sleeve round the drums (an open tube), and the hangar and
# stern (capped forward). They are joined into one object, `hull`, at the end of this section. The launch doors are cut
# into the hangar's loft first.
fore_secs, sleeve_secs, aft_secs = secs[:3], secs[3:5], secs[5:]
assert sleeve_secs[0]['w'] > 100 and sleeve_secs[1]['w'] > 100, 'the sleeve is the 4th and 5th hull section'
hull = K.loft('hull', aft_secs, [M['hull'], M['hullB'], M['hullC']], panel=8, relief=0.5, seed=7, keep=keep_main)
# The launch doors: a real opening through each side of the hangar, as deep as the side, to the hangar's own wall.
wall = {'w': hangar['x'][0], 'e': hangar['x'][1]}
for b in bays:
    s = 1 if b['x'] > 0 else -1
    inner = wall['e'] if s > 0 else wall['w']
    depth = abs(b['x']) - abs(inner) + 2
    cutter = K.box('bay-cut', (inner + s * depth / 2, sum(b['y']) / 2, sum(b['z']) / 2), (depth, b['y'][1] - b['y'][0], b['z'][1] - b['z'][0]), M['dark'])
    mod = hull.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    try:
        mod.material_mode = 'TRANSFER'
    except Exception:
        pass
    K.apply(hull)
    __import__('bpy').data.objects.remove(cutter)
# Each cut ends inside the closed hull, leaving a face across the back of the pocket at the hangar's wall, facing out.
# From inside it is culled; from outside it is a wall over the open door. Take them away.
bm = bmesh.new()
bm.from_mesh(hull.data)
back = []
for f in bm.faces:
    x, y, z = game(f.calc_center_median())
    for b in bays:
        s = 1 if b['x'] > 0 else -1
        inner = wall['e'] if s > 0 else wall['w']
        if abs(x - inner) < 0.3 and f.normal.x * s > 0.9 and b['y'][0] - 0.1 <= y <= b['y'][1] + 0.1 and b['z'][0] - 0.1 <= z <= b['z'][1] + 0.1:
            back.append(f)
bmesh.ops.delete(bm, geom=back, context='FACES')
bm.to_mesh(hull.data)
bm.free()
print(f'bays: removed {len(back)} faces across the backs of the openings')

ST = L['drum']['structure']
hull_parts = [hull, K.loft('hull-bow', fore_secs, [M['hull'], M['hullB'], M['hullC']], panel=8, relief=0.5, seed=5, keep=keep_main)]
# The sleeve: its plated outside, and its inside (the same loft `t` in, faces turned inward), open at both ends.
hull_parts.append(K.loft('sleeve-out', sleeve_secs, [M['sleeve'], M['hullB'], M['hull']], panel=8, relief=0.5, seed=11, caps=False))
t = ST['sleeve']['t']
inner_secs = [dict(s, w=s['w'] - 2 * t, h=s['h'] - 2 * t) for s in sleeve_secs]
sl_in = K.loft('sleeve-in', inner_secs, [M['trim']], panel=8, relief=0, caps=False)
bm = bmesh.new()
bm.from_mesh(sl_in.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
if sum(f.normal.dot(f.calc_center_median().normalized()) for f in bm.faces) > 0:  # outward: turn them in
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
bm.to_mesh(sl_in.data)
bm.free()
hull_parts.append(sl_in)


def oct_band(name, z0, z1, w_out, w_in, mat, c=0.586):
    """A thick octagonal ring (a sleeve's frame or end ring): flats `w_out` and `w_in` across, from z0 to z1."""
    bm = bmesh.new()
    counts = [2] * 8
    rings = [[bm.verts.new(K.B(*p)) for p in K._ring({'z': z, 'w': w, 'h': w, 'c': c}, counts)] for z, w in ((z0, w_out), (z1, w_out), (z1, w_in), (z0, w_in))]
    n = len(rings[0])
    for i in range(4):
        A, Bb = rings[i], rings[(i + 1) % 4]
        for j in range(n):
            bm.faces.new((A[j], A[(j + 1) % n], Bb[(j + 1) % n], Bb[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return K._object(bm, name, [mat])


# The end rings: heavy, standing just off each end of the sleeve and lapping the drums' edge, where the struts meet it;
# frames round the inside every few metres, clear of the drums' belt.
R0 = sleeve_secs[0]['w'] / 2
rg = ST['sleeve']['ring']
for z0, z1 in ((sleeve_secs[0]['z'] - rg['len'], sleeve_secs[0]['z']), (sleeve_secs[1]['z'], sleeve_secs[1]['z'] + rg['len'])):
    hull_parts.append(oct_band('sleeve-end', z0, z1, 2 * (R0 + 0.8), 2 * (R0 - rg['depth'] + 0.8), M['armour']))
belt_r = L['drum']['belt']['to']
for i in range(1, 8):
    for h in L['drum']['halves']:
        z = h['z'][0] + (h['z'][1] - h['z'][0]) * i / 8
        hull_parts.append(oct_band('sleeve-frame', z - 0.3, z + 0.3, 2 * (R0 - t + 0.05), 2 * (belt_r + 0.9), M['belt']))
__import__('bpy').context.view_layer.update()  # the bay cutters were deleted: refresh the view layer's list first
hull = K.join(hull_parts, 'hull')

# The exposed structure inside the open section, fixed to the hull: the armoured spine (in three lengths, round the hub
# rings, which turn and are the game's: drum.mjs), its collars at the bulkheads, and the struts from the end rings.
sp = ST['spine']
hubs = sorted((sum(h['corridor']) / 2 for h in L['drum']['halves']))
struct = []
cuts = [sp['z'][0]] + [z for zc in hubs for z in (zc - ST['hub']['len'] / 2 - 0.3, zc + ST['hub']['len'] / 2 + 0.3)] + [sp['z'][1]]
for z0, z1 in zip(cuts[::2], cuts[1::2]):
    struct.append(K.cyl('spine', (0, 0, z0), (0, 0, z1), sp['r'], sp['r'], M['armour'], 16))
    z = z0 + 1.5
    while z < z1 - 1:
        struct.append(K.cyl('spine-band', (0, 0, z - 0.4), (0, 0, z + 0.4), sp['r'] + 0.35, sp['r'] + 0.35, M['belt'], 16))
        z += 4
for z0, z1 in ((cuts[0], cuts[0] + 2.2), (cuts[-1] - 2.2, cuts[-1])):
    struct.append(K.cyl('spine-collar', (0, 0, z0), (0, 0, z1), sp['r'] + 1.6, sp['r'] + 1.6, M['armour'], 16))
for s_ in ST['struts']:
    a, b = s_['a'], s_['b']
    struct.append(K.cyl('strut', a, b, s_['r'], s_['r'], M['armour'], 12))
    for p, q in ((a, b), (b, a)):
        d = [(q[k] - p[k]) for k in range(3)]
        l = math.sqrt(sum(v * v for v in d))
        e = [p[k] + d[k] / l * 1.4 for k in range(3)]
        struct.append(K.cyl('strut-foot', p, e, s_['r'] * 1.7, s_['r'] * 1.3, M['belt'], 12))
hull = K.join([hull] + struct, 'hull')

island = K.loft('island', L['hull']['island'], [M['island'], M['hullB']], panel=6, relief=0.35, seed=3)

parts = []

# Armour belts: raised bands every 40 m where the hull runs straight (not across a launch door), and heavy rings at
# the sleeve's ends and between its two drums.
for z in range(-180, int(secs[-1]['z']), 40):
    s, a, b = section_at(z)
    if not s or a['w'] != b['w'] or a['h'] != b['h'] or any(b0['z'][0] - 4 <= z <= b0['z'][1] + 4 for b0 in bays):
        continue
    band = [dict(z=z - 0.7, w=s['w'] + 0.8, h=s['h'] + 0.8, y=s['y'], c=s['c']), dict(z=z + 0.7, w=s['w'] + 0.8, h=s['h'] + 0.8, y=s['y'], c=s['c'])]
    parts.append(K.loft(f'belt{z}', band, [M['belt']], panel=100, relief=0, caps=False))
da, db = SEC['drum-a'], SEC['drum-b']
for z in (da['z'][1],):  # between the halves (the ends have their own heavy rings, above)
    w = da['w'] + 1.6
    band = [dict(z=z - 1.2, w=w, h=w, y=0, c=0.586), dict(z=z + 1.2, w=w, h=w, y=0, c=0.586)]
    parts.append(K.loft(f'sleeve-ring{int(z)}', band, [M['belt']], panel=100, relief=0, caps=False))

# The launch doors' mouths: hazard-striped frames round each opening, lamps either side.
for b in bays:
    s = 1 if b['x'] > 0 else -1
    x = b['x'] + s * 0.6
    y0, y1 = b['y']
    z0, z1 = b['z']
    for z in (z0 - 0.6, z1 + 0.6):
        parts.append(K.box('bay-jamb', (x, (y0 + y1) / 2, z), (1.2, y1 - y0 + 2.4, 1.2), M['hazard']))
    for y in (y0 - 0.6, y1 + 0.6):
        parts.append(K.box('bay-sill', (x, y, (z0 + z1) / 2), (1.2, 1.2, z1 - z0 + 2.4), M['hazard']))
    for z in (z0 - 2.5, z1 + 2.5):
        parts.append(K.box('bay-lamp', (x + s * 0.1, y1 + 1.5, z), (0.6, 0.6, 0.6), M['white']))

# The bridge's windows: in the tower's sides, with mullions and armoured shutters above and below.
bridge = next(c for c in L['compartments'] if c['id'] == 'bridge')
floor = next(d['floor'] for d in L['decks'] if d['id'] == bridge['deck'])
isl = L['hull']['island']
skin = max(s['w'] for s in isl) / 2 + 0.06
# The forward windows sit in the tower's sheer front face, just proud of where it starts: the section before the first
# full-height one.
full = max(x['h'] for x in isl)
front = isl[next(i for i, x in enumerate(isl) if x['h'] == full) - 1]['z'] - 0.06
for w in bridge.get('windows', []):
    if w['side'] == 'n':
        wy = (floor + w['sill'], floor + w['head'])
        xm, xl = (w['from'] + w['to']) / 2, w['to'] - w['from']
        parts.append(K.plane('bridge-glass', (xm, sum(wy) / 2, front), (xl, wy[1] - wy[0]), '-z', M['glass']))
        for i in range(9):
            parts.append(K.box('mullion', (w['from'] + xl * i / 8, sum(wy) / 2, front - 0.15), (0.25, wy[1] - wy[0], 0.4), M['trim']))
        parts.append(K.box('shutter-top', (xm, wy[1] + 0.7, front - 0.45), (xl + 2.2, 1.2, 1.0), M['armour'], bevel=0.15))
        parts.append(K.box('shutter-low', (xm, wy[0] - 0.5, front - 0.45), (xl + 2.2, 0.8, 1.0), M['armour'], bevel=0.15))
        continue
    s = -1 if w['side'] == 'w' else 1
    wy = (floor + w['sill'], floor + w['head'])
    zm, zl = (w['from'] + w['to']) / 2, w['to'] - w['from']
    parts.append(K.plane('bridge-glass', (s * skin, sum(wy) / 2, zm), (zl, wy[1] - wy[0]), 'x' if s > 0 else '-x', M['glass']))
    for i in range(7):
        parts.append(K.box('mullion', (s * (skin + 0.15), sum(wy) / 2, w['from'] + zl * i / 6), (0.4, wy[1] - wy[0], 0.25), M['trim']))
    parts.append(K.box('shutter-top', (s * (skin + 0.45), wy[1] + 0.7, zm), (1.0, 1.2, zl + 2.2), M['armour'], bevel=0.15))
    parts.append(K.box('shutter-low', (s * (skin + 0.45), wy[0] - 0.5, zm), (1.0, 0.8, zl + 2.2), M['armour'], bevel=0.15))

# Masts and sensors on the tower; domes along the hangar's back and the bow.
top = [x for x in isl if x['h'] == full]  # the tower's full-height length
tz = (top[0]['z'] + top[-1]['z']) / 2
ttop = top[0]['y'] + top[0]['h'] / 2
parts.append(K.cyl('mast', (0, ttop, tz + 6), (0, ttop + 16, tz + 6), 0.5, 0.25, M['trim'], 8))
for y, w in ((ttop + 6, 8), (ttop + 11, 5)):
    parts.append(K.box('yard', (0, y, tz + 6), (w, 0.3, 0.3), M['trim']))
parts.append(K.box('mast-light', (0, ttop + 16.4, tz + 6), (0.5, 0.5, 0.5), M['red']))
parts.append(K.lathe('dish', [(0, 0.2), (0.3, 1.6), (0.7, 2.6), (1, 3.0)], (6, ttop, tz - 4), (6.5, ttop + 1.2, tz - 5.6), M['hull'], 18))
hz, hh = SEC['hangar']['z'], SEC['hangar']['h']
for z in (hz[0] + 6, hz[0] + 82):
    parts.append(K.lathe('dome', [(0, 2.2), (0.4, 2.0), (0.75, 1.4), (1, 0.1)], (8, hh / 2, z), (8, hh / 2 + 2.4, z), M['hullC'], 16))
bz = SEC['bow']['z']
parts.append(K.lathe('dome', [(0, 2.2), (0.4, 2.0), (0.75, 1.4), (1, 0.1)], (-6, 10, bz[0] + 26), (-6, 12.2, bz[0] + 26), M['hullC'], 16))

# Greebles: equipment boxes on the tops and bellies of the bow, hangar and stern (not the sleeve), and vents on the
# flanks, seeded so the ship is the same every build.
mount_z = [m['at'][2] for m in L['mounts'] if m.get('at')]
for i in range(90):
    z = rnd.uniform(secs[0]['z'] + 8, secs[-1]['z'] - 4)
    s, a, b = section_at(z)
    if not s or s['w'] > 100 or any(abs(z - mz) < 10 for mz in mount_z) or isl[0]['z'] - 2 < z < isl[-1]['z'] + 2:
        continue
    up = rnd.choice((1, -1))
    top = s['y'] + up * s['h'] / 2
    half = s['w'] / 2 - min(s['w'], s['h']) / 2 * s['c'] - 2
    x = rnd.uniform(-half, half)
    w, d, h = rnd.uniform(1.5, 5), rnd.uniform(2, 9), rnd.uniform(0.6, 2.2)
    parts.append(K.box('greeble', (x, top + up * (h / 2 - 0.1), z), (w, h, d), rnd.choice([M['trim'], M['hullB'], M['dark']]), bevel=0.12))
for i in range(50):
    z = rnd.uniform(secs[0]['z'] + 20, secs[-1]['z'] - 4)
    s, a, b = section_at(z)
    side = rnd.choice((-1, 1))
    y = rnd.uniform(-s['h'] / 4, s['h'] / 4) if s else 0
    if not s or s['w'] > 100 or near_bay(side * s['w'] / 2, y, z, 8):
        continue
    parts.append(K.box('vent', (side * (s['w'] / 2 + 0.3), y, z), (0.8, rnd.uniform(1, 3), rnd.uniform(3, 8)), M['dark'], bevel=0.1))
# The sleeve: access hatches and handrails round it, so its size reads.
R = da['w'] / 2
for i in range(16):
    a = i / 16 * 2 * math.pi + math.pi / 16
    for z in (da['z'][0] + 11, db['z'][0] + 11):
        x, y = math.sin(a) * (R + 0.2), math.cos(a) * (R + 0.2)
        if abs(y) > R * 0.9 and any(abs(z - t['at'][2]) < 9 for t in turrets):
            continue
        parts.append(K.box('sleeve-hatch', (x, y, z), (3.2 if abs(y) > abs(x) else 0.6, 0.6 if abs(y) > abs(x) else 3.2, 4), M['dark'], bevel=0.1))

# --- turrets: a gunhouse on a barbette, like a battleship's (as carrier_build.py) ------------------------------------
turret_parts = []


def origin_at(ob, p):
    """Moves an object's origin to game point `p` without moving its geometry (a hinge)."""
    o = K.B(*p)
    ob.data.transform(Matrix.Translation(-o))
    ob.location = o
    return ob


for t in turrets:
    x, y, z = t['at']
    s = 1 if t['up'][1] > 0 else -1
    parts.append(K.cyl('barbette', (x, y, z), (x, y + s * 2.2, z), 6.4, 6.0, M['armour'], 24))
    house = [
        K.box('gunhouse', (x, y + s * 4.4, z + 1), (10, 4.4, 12), M['armour'], bevel=0.6),
        K.box('gunhouse-face', (x, y + s * 4.0, z - 5.6), (9, 3.4, 2.2), M['armour'], bevel=0.5),
        K.box('cab', (x + 3, y + s * 7.1, z - 1.5), (2.6, 1.4, 3.2), M['trim'], bevel=0.2),
        K.plane('cab-glass', (x + 3, y + s * 7.2, z - 3.12), (2.2, 0.8), '-z', M['glass']),
    ]
    guns = []
    for bx in (-2.6, 0, 2.6):  # three long barrels, as the design's turrets
        guns.append(K.cyl('barrel', (x + bx, y + s * 3.9, z - 6.5), (x + bx, y + s * 3.9, z - 26), 0.75, 0.55, M['dark'], 12))
        guns.append(K.cyl('brake', (x + bx, y + s * 3.9, z - 25.5), (x + bx, y + s * 3.9, z - 27.5), 0.8, 0.8, M['dark'], 12))
        guns.append(K.cyl('mantlet', (x + bx, y + s * 3.9, z - 6.2), (x + bx, y + s * 3.9, z - 8), 1.2, 0.95, M['armour'], 12))
    turret_parts.append(origin_at(K.join(house, t['id']), (x, y + s * 2.2, z)))
    turret_parts.append(origin_at(K.join(guns, t['id'] + '-guns'), (x, y + s * 3.9, z - 6.2)))

# --- point defence sponsons ------------------------------------------------------------------------------------------
for e in (m for m in L['mounts'] if m['kind'] == 'pdc'):
    x, y, z = e['at']
    u = e['up']
    a = (x - u[0] * 0.6, y - u[1] * 0.6, z - u[2] * 0.6)
    b = (x + u[0] * 1.6, y + u[1] * 1.6, z + u[2] * 1.6)
    parts.append(K.cyl('pdc-sponson', a, b, 2.9, 2.2, M['armour'], 14))
    parts.append(K.cyl('pdc-ring', b, (b[0] + u[0] * 0.3, b[1] + u[1] * 0.3, b[2] + u[2] * 0.3), 2.3, 2.3, M['dark'], 14))

# --- torpedo tube muzzle doors: the bow's forward battery and the hangar's broadside tubes ---------------------------
for x, y, z in L['weapons']['tubes']['at']:
    parts.append(K.cyl('tube-door', (x, y, z + 0.6), (x, y, z - 0.3), 1.1, 1.1, M['dark'], 14))
for side in ('port', 'starboard'):
    bs = L['weapons']['broadside'][side]
    for x, y, z in bs['at']:
        s = bs['dir'][0]
        parts.append(K.cyl('tube-door', (x - s * 0.3, y, z), (x + s * 0.5, y, z), 1.0, 1.0, M['dark'], 14))

# --- the railgun's muzzle --------------------------------------------------------------------------------------------
rg = L['weapons'].get('railgun')
if rg:
    mx, my, mz = rg['muzzle']
    parts.append(K.cyl('railgun-muzzle', (mx, my, mz + 1.5), (mx, my, mz - 0.4), 1.6, 1.4, M['dark'], 16))
    parts.append(K.cyl('railgun-bore', (mx, my, mz - 0.38), (mx, my, mz - 0.45), 0.7, 0.7, M['throat'], 12))

# --- radiators: hinged at the stern's sides, ribbed, glowing as she runs hot ----------------------------------------
radiator_parts = []
for r in (m for m in L['mounts'] if m['kind'] == 'radiator'):
    a, b = r['x']
    zz0, zz1 = r['z']
    s = 1 if a > 0 else -1
    inboard = a if s > 0 else b
    panel = [K.box('radiator', ((a + b) / 2, r['y'], (zz0 + zz1) / 2), (abs(b - a), 0.4, zz1 - zz0), M['radiator'])]
    for z in range(int(zz0) + 2, int(zz1), 3):
        panel.append(K.box('fin', ((a + b) / 2, r['y'], z), (abs(b - a) - 1, 0.7, 0.35), M['hot']))
    panel.append(K.box('radiator-edge', (b if s > 0 else a, r['y'], (zz0 + zz1) / 2), (0.8, 1.0, zz1 - zz0), M['trim']))
    tip = b if s > 0 else a
    panel.append(K.box('nav', (tip, r['y'] + 0.8, (zz0 + zz1) / 2), (0.7, 0.7, 0.7), M['green'] if s > 0 else M['red']))
    hinge = inboard + s * 2.5
    radiator_parts.append(origin_at(K.join(panel, r['id']), (hinge, r['y'], (zz0 + zz1) / 2)))
    parts.append(K.box('radiator-spar', (hinge, r['y'], (zz0 + zz1) / 2), (5, 2.4, zz1 - zz0 + 2), M['trim'], bevel=0.3))
parts.append(K.box('nav-bow', (0, 0, secs[0]['z'] - 0.4), (0.8, 0.8, 0.8), M['white']))

# --- main drives -----------------------------------------------------------------------------------------------------
st = SEC['stern']
for d in L['thrusters']['main']:
    x, y, z = d['at']
    r = d['r']
    prof = [(t / 8, r * (0.5 + 0.5 * (t / 8) ** 0.7)) for t in range(9)]
    parts.append(K.lathe('bell', prof, (x, y, z), (x, y, z + r * 1.9), M['bell'], 28))
    parts.append(K.cyl('throat', (x, y, z - 0.6), (x, y, z + 0.4), r * 0.55, r * 0.5, M['throat'], 20))
    parts.append(K.cyl('collar', (x, y, z - 1.5), (x, y, z + 0.3), r * 0.75, r * 0.65, M['dark'], 20))
parts.append(K.box('thrust-frame', (0, -2, st['z'][1] + 1.2), (st['w'] - 6, st['h'] - 8, 2.4), M['trim'], bevel=0.4))

# --- manoeuvring clusters --------------------------------------------------------------------------------------------
com = L['com']
for c in L['thrusters']['rcs']:
    x, y, z = c['at']
    parts.append(K.box('rcs-block', (x, y, z), (2.6, 2.6, 2.6), M['armour'], bevel=0.25))
    for d in ((1 if x > com[0] else -1, 0, 0), (0, 1 if y > com[1] else -1, 0), (0, 0, 1 if z > com[2] else -1)):
        a = (x + d[0] * 1.2, y + d[1] * 1.2, z + d[2] * 1.2)
        b = (x + d[0] * 2.2, y + d[1] * 2.2, z + d[2] * 2.2)
        parts.append(K.lathe('rcs-nozzle', [(0, 0.3), (0.5, 0.42), (1, 0.6)], a, b, M['bell'], 10))

fittings = K.join(parts, 'fittings')
kb = K.export(OUT, blend)
tris = sum(len(p.vertices) - 2 for o in (hull, island, fittings, *turret_parts, *radiator_parts) for p in o.data.polygons)
print(f'carrier v2 hull: {OUT} {kb} KB, about {tris} triangles')
