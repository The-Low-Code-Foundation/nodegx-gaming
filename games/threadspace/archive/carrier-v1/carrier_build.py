# Builds the first carrier's outside from the layout it walks: carrier-v1.layout.json beside this file (archived: see README.md here). The hull follows the
# layout's loft sections, plated in panels; the port side has a real bay opening over the hangar; the fittings (turrets,
# point defence sponsons, radiators (each its own object, hinged, so the game folds them), drive bells, manoeuvring-thruster clusters, armour belts, bridge windows, masts
# and navigation lights) sit at the layout's mounts. The machinery inside stays the game's (layout.mjs) for now.
#
#   blender -b --factory-startup --python archive/carrier-v1/carrier_build.py       (from the threadspace folder)
#   blender -b --factory-startup --python archive/carrier-v1/carrier_build.py -- --blend /tmp/carrier.blend
#
# Output: hull-v1.glb beside this file. The game loads it if it is there and falls back to its own lofted hull if not.
# Change the ship's shape in the layout, then run this again.
import sys, os, json, math, random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))  # shipkit.py
import shipkit as K

L = json.load(open(os.path.join(HERE, 'carrier-v1.layout.json')))
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
blend = args[args.index('--blend') + 1] if '--blend' in args else None
OUT = os.path.join(HERE, 'hull-v1.glb')

K.reset()
rnd = random.Random(11)
M = {
    'hull': K.material('Hull', '#9aa3ad', 0.45, 0.5),
    'hullB': K.material('HullB', '#8a939d', 0.45, 0.55),
    'hullC': K.material('HullC', '#a9b1ba', 0.4, 0.5),
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

bay = next(m for m in L['mounts'] if m['kind'] == 'bay-door')
turrets = [m for m in L['mounts'] if m['kind'] == 'turret']


def game(v):
    """A Blender point back in the game frame."""
    return (v.x, v.z, -v.y)


def keep_main(c):
    x, y, z = game(c)
    if x < -26 and bay['z'][0] - 6 <= z <= bay['z'][1] + 6 and bay['y'][0] - 6 <= y <= bay['y'][1] + 6:
        return False  # flat round the bay's mouth
    for t in turrets:
        if math.hypot(x - t['at'][0], z - t['at'][2]) < 9 and abs(y - t['at'][1]) < 3:
            return False  # flat under each turret's ring
    return True


# --- the hull --------------------------------------------------------------------------------------------------------
hull = K.loft('hull', L['hull']['main'], [M['hull'], M['hullB'], M['hullC']], panel=8, relief=0.5, seed=7, keep=keep_main)
# The bay: a real opening in the port side, as deep as the armour, to the hangar's own wall (x = -31).
cutter = K.box('bay-cut', (-35.5, sum(bay['y']) / 2, sum(bay['z']) / 2), (9, bay['y'][1] - bay['y'][0], bay['z'][1] - bay['z'][0]), M['dark'])
mod = hull.modifiers.new('cut', 'BOOLEAN')
mod.operation = 'DIFFERENCE'
mod.solver = 'EXACT'
mod.object = cutter
try:
    mod.material_mode = 'TRANSFER'
except Exception:
    pass
K.apply(hull)
bpy_data = __import__('bpy').data
bpy_data.objects.remove(cutter)
# The cut ends inside the closed hull, so it leaves a face across the back of the pocket (x = -31, facing out). From
# inside the hangar it is culled and you see out; from outside it is a wall over the open bay. Take it away.
import bmesh  # noqa: E402
from mathutils import Matrix  # noqa: E402
bm = bmesh.new()
bm.from_mesh(hull.data)
back = []
for f in bm.faces:
    x, y, z = game(f.calc_center_median())
    if abs(x + 31) < 0.3 and f.normal.x < -0.9 and bay['y'][0] - 0.1 <= y <= bay['y'][1] + 0.1 and bay['z'][0] - 0.1 <= z <= bay['z'][1] + 0.1:
        back.append(f)
bmesh.ops.delete(bm, geom=back, context='FACES')
bm.to_mesh(hull.data)
bm.free()
print(f'bay: removed {len(back)} faces across the back of the opening')

island = K.loft('island', L['hull']['island'], [M['island'], M['hullB']], panel=6, relief=0.35, seed=3,
                keep=lambda c: game(c)[2] > -140)

parts = []
# Armour belts: raised bands round the hull every 40 m (not across the bay).
secs = L['hull']['main']


def section_at(z):
    for a, b in zip(secs, secs[1:]):
        if a['z'] <= z <= b['z']:
            t = (z - a['z']) / (b['z'] - a['z'])
            return {k: a.get(k, 0) + (b.get(k, 0) - a.get(k, 0)) * t for k in ('w', 'h', 'y')}
    return None


for z in range(-140, 151, 40):
    if bay['z'][0] - 4 <= z <= bay['z'][1] + 4:
        continue
    s = section_at(z)
    band = [dict(z=z - 0.7, w=s['w'] + 0.8, h=s['h'] + 0.8, y=s['y']), dict(z=z + 0.7, w=s['w'] + 0.8, h=s['h'] + 0.8, y=s['y'])]
    parts.append(K.loft(f'belt{z}', band, [M['belt']], panel=100, relief=0, caps=False))

# The bay's mouth: a hazard-striped frame on the hull round the opening, lamps either side.
y0, y1 = bay['y']
z0, z1 = bay['z']
for z in (z0 - 0.6, z1 + 0.6):
    parts.append(K.box('bay-jamb', (-34.4, (y0 + y1) / 2, z), (1.2, y1 - y0 + 2.4, 1.2), M['hazard']))
for y in (y0 - 0.6, y1 + 0.6):
    parts.append(K.box('bay-sill', (-34.4, y, (z0 + z1) / 2), (1.2, 1.2, z1 - z0 + 2.4), M['hazard']))
for z in (z0 - 2.5, z1 + 2.5):
    parts.append(K.box('bay-lamp', (-34.5, y1 + 1.5, z), (0.6, 0.6, 0.6), M['white']))

# Bridge windows in the island's front face, with mullions and armoured shutters above and below.
win_y = (13.45, 16.3)
parts.append(K.plane('bridge-glass', (0, sum(win_y) / 2, -151.06), (15.2, win_y[1] - win_y[0]), '-z', M['glass']))
for i in range(6):
    parts.append(K.box('mullion', (-7.6 + 15.2 * i / 5, sum(win_y) / 2, -151.25), (0.25, win_y[1] - win_y[0], 0.4), M['trim']))
parts.append(K.box('shutter-top', (0, win_y[1] + 0.7, -151.5), (17.4, 1.2, 1.0), M['armour'], bevel=0.15))
parts.append(K.box('shutter-low', (0, win_y[0] - 0.5, -151.5), (17.4, 0.8, 1.0), M['armour'], bevel=0.15))

# Masts and sensors on the island; domes along the spine.
parts.append(K.cyl('mast', (0, 19.5, -118), (0, 34, -118), 0.5, 0.25, M['trim'], 8))
for y, w in ((25, 8), (30, 5)):
    parts.append(K.box('yard', (0, y, -118), (w, 0.3, 0.3), M['trim']))
parts.append(K.box('mast-light', (0, 34.4, -118), (0.5, 0.5, 0.5), M['red']))
parts.append(K.lathe('dish', [(0, 0.2), (0.3, 1.6), (0.7, 2.6), (1, 3.0)], (5, 21, -108), (5.5, 22.2, -106.4), M['hull'], 18))
for z in (-60, 0, 80, 120):
    parts.append(K.lathe('dome', [(0, 2.2), (0.4, 2.0), (0.75, 1.4), (1, 0.1)], (8, 10, z), (8, 12.4, z), M['hullC'], 16))

# Greebles: equipment boxes and vents on the top and the flanks, seeded so the ship is the same every build.
for i in range(70):
    z = rnd.uniform(-170, 165)
    if -152 < z < -88 or any(abs(z - t['at'][2]) < 12 for t in turrets):
        continue
    s = section_at(z)
    if not s:
        continue
    top = s['y'] + s['h'] / 2
    half = s['w'] / 2 - min(s['w'], s['h']) / 2 * 0.32 - 2
    x = rnd.uniform(-half, half)
    w, d, h = rnd.uniform(1.5, 5), rnd.uniform(2, 9), rnd.uniform(0.6, 2.2)
    parts.append(K.box('greeble', (x, top + h / 2 - 0.1, z), (w, h, d), rnd.choice([M['trim'], M['hullB'], M['dark']]), bevel=0.12))
for i in range(40):
    z = rnd.uniform(-140, 150)
    if bay['z'][0] - 8 < z < bay['z'][1] + 8:
        continue
    side = rnd.choice((-1, 1))
    y = rnd.uniform(-16, 2)
    parts.append(K.box('vent', (side * 34.3, y, z), (0.8, rnd.uniform(1, 3), rnd.uniform(3, 8)), M['dark'], bevel=0.1))

# --- turrets: a gunhouse on a barbette, like a battleship's, with a small gunner's cab --------------------------------
# The barbette is part of the fittings; the gunhouse turns and the guns elevate, so each is its own object the game
# finds by name: the mount's id, `turret-dorsal` (origin on the turret's axis at the barbette's ring; rotating it about
# the mount's up axis trains it), and `<id>-guns` (origin on the trunnions; rotating it about x elevates the barrels).
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
    for bx in (-1.7, 1.7):
        guns.append(K.cyl('barrel', (x + bx, y + s * 3.9, z - 6.5), (x + bx, y + s * 3.9, z - 26), 0.75, 0.55, M['dark'], 12))
        guns.append(K.cyl('brake', (x + bx, y + s * 3.9, z - 25.5), (x + bx, y + s * 3.9, z - 27.5), 0.8, 0.8, M['dark'], 12))
        guns.append(K.cyl('mantlet', (x + bx, y + s * 3.9, z - 6.2), (x + bx, y + s * 3.9, z - 8), 1.3, 1.0, M['armour'], 12))
    turret_parts.append(origin_at(K.join(house, t['id']), (x, y + s * 2.2, z)))
    turret_parts.append(origin_at(K.join(guns, t['id'] + '-guns'), (x, y + s * 3.9, z - 6.2)))

# --- point defence: an armoured sponson on each `pdc` mount; the rotary gun on it is the game's (weapons.mjs) ----------
for e in (m for m in L['mounts'] if m['kind'] == 'pdc'):
    x, y, z = e['at']
    u = e['up']
    a = (x - u[0] * 0.6, y - u[1] * 0.6, z - u[2] * 0.6)
    b = (x + u[0] * 1.6, y + u[1] * 1.6, z + u[2] * 1.6)
    parts.append(K.cyl('pdc-sponson', a, b, 2.9, 2.2, M['armour'], 14))
    parts.append(K.cyl('pdc-ring', b, (b[0] + u[0] * 0.3, b[1] + u[1] * 0.3, b[2] + u[2] * 0.3), 2.3, 2.3, M['dark'], 14))

# --- the railgun's muzzle: the slug leaves through the bow, down the keel ------------------------------------------
rg = L['weapons'].get('railgun')
if rg:
    mx, my, mz = rg['muzzle']
    parts.append(K.box('railgun-housing', (mx, my, mz + 14), (5, 4, 30), M['armour'], bevel=0.3))
    parts.append(K.cyl('railgun-muzzle', (mx, my, mz + 1.5), (mx, my, mz - 0.4), 1.6, 1.4, M['dark'], 16))
    parts.append(K.cyl('railgun-bore', (mx, my, mz - 0.38), (mx, my, mz - 0.45), 0.7, 0.7, M['throat'], 12))

# --- radiators: wide panels edge-on to the sides, ribbed, glowing as the ship runs hot ------------------------------
# Each is its own object named for its mount (`radiator-port`), origin on its hinge at the spar, so the game folds it
# up against the hull (rotation about z) and sets its glow (the `RadiatorHot` material) from the heat in the sinks.
radiator_parts = []
for r in (m for m in L['mounts'] if m['kind'] == 'radiator'):
    a, b = r['x']
    zz0, zz1 = r['z']
    s = 1 if a > 0 else -1
    panel = [K.box('radiator', ((a + b) / 2, r['y'], (zz0 + zz1) / 2), (abs(b - a), 0.4, zz1 - zz0), M['radiator'])]
    for z in range(int(zz0) + 2, int(zz1), 3):
        panel.append(K.box('fin', ((a + b) / 2, r['y'], z), (abs(b - a) - 1, 0.7, 0.35), M['hot']))
    panel.append(K.box('radiator-edge', (b if s > 0 else a, r['y'], (zz0 + zz1) / 2), (0.8, 1.0, zz1 - zz0), M['trim']))
    tip = b if s > 0 else a
    panel.append(K.box('nav', (tip, r['y'] + 0.8, (zz0 + zz1) / 2), (0.7, 0.7, 0.7), M['green'] if s > 0 else M['red']))
    radiator_parts.append(origin_at(K.join(panel, r['id']), (s * 36.5, r['y'], (zz0 + zz1) / 2)))
    parts.append(K.box('radiator-spar', (s * 36.5, r['y'], (zz0 + zz1) / 2), (5, 2.4, zz1 - zz0 + 2), M['trim'], bevel=0.3))
parts.append(K.box('nav-bow', (0, -6, -200.4), (0.8, 0.8, 0.8), M['white']))

# --- main drives: four bells in a thrust frame ----------------------------------------------------------------------
for d in L['thrusters']['main']:
    x, y, z = d['at']
    r = d['r']
    prof = [(t / 8, r * (0.5 + 0.5 * (t / 8) ** 0.7)) for t in range(9)]
    parts.append(K.lathe('bell', prof, (x, y, z), (x, y, z + r * 1.9), M['bell'], 28))
    parts.append(K.cyl('throat', (x, y, z - 0.6), (x, y, z + 0.4), r * 0.55, r * 0.5, M['throat'], 20))
    parts.append(K.cyl('collar', (x, y, z - 1.5), (x, y, z + 0.3), r * 0.75, r * 0.65, M['dark'], 20))
parts.append(K.box('thrust-frame', (0, -7, 185.2), (48, 26, 2.4), M['trim'], bevel=0.4))

# --- manoeuvring-thruster clusters: a block, three nozzles (out, up or down, fore or aft) ------------------------------
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
print(f'carrier hull: {OUT} {kb} KB, about {tris} triangles')
