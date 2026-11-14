# Builds the carrier's fighter, outside and in, from the layout's `fighter` entry (ships/carrier.layout.json).
#
# She is designed for vacuum, not air, so nothing on her is there to fly through an atmosphere. What a one-person
# attack craft has to carry decides her shape:
#   - an armoured crew capsule at the front (the pilot, life support, avionics, the sensors in the nose), the canopy a
#     framed layer of glass over the pilot's head, set into the capsule's top;
#   - two propellant tanks along her flanks, the biggest things on her, close to the centre of mass so she handles the
#     same full or empty;
#   - the service body between them (power, coolant pumps) and the main drive on its gimbal behind;
#   - radiators instead of wings: everything a fighter does makes heat, and in vacuum only radiating sheds it. The two
#     panels fold up against her for stowage and spread out to the sides in flight (the game's `wing_l` / `wing_r`);
#   - a manoeuvring-thruster quad at each `rcs` cluster the physics fires, on outriggers so they have leverage;
#   - twin cannon in a chin fairing on her centreline (recoil through the centre of mass, so firing does not turn her)
#     and missiles on rails under the tanks.
#
#   blender -b --factory-startup --python tools/blender/fighter_build.py            (from the threadspace folder)
#   blender -b --factory-startup --python tools/blender/fighter_build.py -- --blend /tmp/fighter.blend
#
# Output: assets/carrier/fighter.glb. The game (src/carrier/fighter-model.mjs) finds these nodes by name:
#   canopy           the canopy and its frame; origin on the hinge, rotation about x opens it
#   wing_l, wing_r   the radiator panels; origin on the fold hinge, rotation about z folds them up
#   gear             the landing gear, raised into the belly in flight
#   pilot            hidden from the cockpit camera
#   mfd_l, mfd_c, mfd_r   the cockpit screens (UV-mapped quads; the game draws on them)
#   hud              the head-up display's glass
#   strobe           the anti-collision light, blinked by the game
#   eye, nozzle, decal_l, decal_r, muzzle_l, muzzle_r   empties: the pilot's eye, the drive's mouth, where the side
#                    number goes, the cannon muzzles
import sys, os, json, math, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shipkit as K
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(HERE))
F = json.load(open(os.path.join(ROOT, 'ships', 'carrier.layout.json')))['fighter']
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
blend = args[args.index('--blend') + 1] if '--blend' in args else None
OUT = os.path.join(ROOT, 'assets', 'carrier', 'fighter.glb')

K.reset()
M = {
    'paint': K.material('Paint', '#c9c4b6', 0.2, 0.55),
    'paintB': K.material('PaintB', '#bcb7a9', 0.2, 0.6),
    'paintC': K.material('PaintC', '#d4d0c4', 0.2, 0.5),
    'belly': K.material('Belly', '#6f7378', 0.25, 0.6),
    'dark': K.material('Dark', '#2a2f36', 0.4, 0.55),
    'trim': K.material('Trim', '#3a414d', 0.4, 0.5),
    'glass': K.material('CanopyGlass', '#1a2a3a', 0.6, 0.08),
    'frame': K.material('CanopyFrame', '#3a3f46', 0.3, 0.5),
    'bell': K.material('Bell', '#2a2e35', 0.6, 0.4),
    'throat': K.material('Throat', '#3a6cb0', 0.0, 0.5, emit='#58b0ff', strength=1.4),
    'hazard': K.material('Hazard', '#d8b030', 0.1, 0.6),
    'stripe': K.material('Stripe', '#4fd0e0', 0.1, 0.55),
    'radiator': K.material('Radiator', '#4a3a32', 0.3, 0.75),
    'sensor': K.material('Sensor', '#151a20', 0.5, 0.2),
    'red': K.material('NavRed', '#ff3020', 0.0, 0.5, emit='#ff3020', strength=8),
    'green': K.material('NavGreen', '#30ff60', 0.0, 0.5, emit='#30ff60', strength=8),
    'white': K.material('NavWhite', '#ffffff', 0.0, 0.5, emit='#ffffff', strength=8),
    'strobe': K.material('Strobe', '#ffffff', 0.0, 0.5, emit='#ffffff', strength=12),
    'gun': K.material('Gun', '#262a30', 0.6, 0.4),
    # The cockpit.
    'tub': K.material('Tub', '#454b54', 0.2, 0.7),
    'tubDark': K.material('TubDark', '#2c3037', 0.2, 0.75),
    'seat': K.material('Seat', '#2b2f35', 0.2, 0.7),
    'cushion': K.material('Cushion', '#46503f', 0.0, 0.9),
    'harness': K.material('Harness', '#b8963a', 0.0, 0.8),
    'panel': K.material('Panel', '#2a2e33', 0.2, 0.7),
    'glare': K.material('Glare', '#121417', 0.0, 0.95),
    'bezel': K.material('Bezel', '#1c1f23', 0.3, 0.6),
    'button': K.material('Button', '#5a6068', 0.2, 0.6),
    'lampG': K.material('LampGreen', '#40ff80', 0.0, 0.5, emit='#40ff80', strength=1.2),
    'lampA': K.material('LampAmber', '#ffb030', 0.0, 0.5, emit='#ffb030', strength=1.2),
    'lampR': K.material('LampRed', '#ff4030', 0.0, 0.5, emit='#ff4030', strength=1.2),
    'hudGlass': K.material('HudGlass', '#7fffb0', 0.0, 0.1),
    'screenL': K.material('ScreenL', '#0a1a12', 0.0, 0.4, emit='#0a3a20', strength=1),
    'screenC': K.material('ScreenC', '#0a1a12', 0.0, 0.4, emit='#0a3a20', strength=1),
    'screenR': K.material('ScreenR', '#0a1a12', 0.0, 0.4, emit='#0a3a20', strength=1),
    'suit': K.material('FlightSuit', '#4a5546', 0.0, 0.85),
    'helmet': K.material('Helmet', '#d8d6cc', 0.1, 0.4),
    'visor': K.material('Visor', '#2a2410', 0.7, 0.1),
}


def game(v):
    """A Blender point back in the game frame."""
    return (v.x, v.z, -v.y)


def origin_at(ob, p):
    """Moves an object's origin to game point `p` without moving its geometry (a hinge)."""
    o = K.B(*p)
    ob.data.transform(Matrix.Translation(-o))
    ob.location = o
    return ob


def empty(name, p):
    e = bpy.data.objects.new(name, None)
    e.location = K.B(*p)
    bpy.context.collection.objects.link(e)
    return e


def quad(name, c, u, v, mat):
    """A one-sided UV-mapped rectangle: centre `c`, half-extents along `u` (across, left to right as seen) and `v` (up),
    all game-frame vectors. It faces u × v."""
    c, u, v = Vector(c), Vector(u), Vector(v)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    pts = [c - u - v, c + u - v, c + u + v, c - u + v]
    vs = [bm.verts.new(K.B(*p)) for p in pts]
    f = bm.faces.new(vs)
    for loop, t in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = t
    return K._object(bm, name, [mat])


def slab(name, rings, mat, caps=True):
    """A loft between rings of game points (each ring the same length, in order round the section)."""
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


def solid(ob, t=0.02):
    """Gives an open surface (a lathe's bell or dome) a thickness, so it is closed and its faces point the right way
    from inside and out (the game culls back faces)."""
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = t
    mod.offset = 0
    K.apply(ob)
    return ob


def wing_section(x, z_le, chord, thick, y):
    """A wing's cross-section at span station x: a flattened hexagon, leading edge at z_le (forward is -z)."""
    t = thick / 2
    return [(x, y, z_le), (x, y + t, z_le + chord * 0.2), (x, y + t * 0.7, z_le + chord * 0.75), (x, y, z_le + chord),
            (x, y - t * 0.7, z_le + chord * 0.75), (x, y - t, z_le + chord * 0.2)]


# --- the crew capsule and the service body -----------------------------------------------------------------------------

M['tank'] = K.material('Tank', '#b9b4a6', 0.25, 0.5)
M['strap'] = K.material('Strap', '#3a414d', 0.4, 0.5)
M['panelRad'] = K.material('RadiatorPanel', '#30343a', 0.3, 0.6)
M['pipe'] = K.material('RadiatorPipe', '#9a6a40', 0.5, 0.45)
M['missile'] = K.material('Missile', '#e0ddd2', 0.1, 0.5)
M['armour'] = K.material('Armour', '#8d8a80', 0.3, 0.65)

# The capsule: armoured, its top at the canopy sill (y 0.92), sloping down to the sensor nose so the pilot sees over it.
# The service body behind it is narrower: the tanks fill out her flanks there.
FUSE = [
    {'z': -5.45, 'w': 0.55, 'h': 0.5, 'y': -0.12, 'c': 0.45},
    {'z': -4.9, 'w': 1.25, 'h': 1.0, 'y': -0.08, 'c': 0.42},
    {'z': -3.6, 'w': 1.85, 'h': 1.42, 'y': -0.02, 'c': 0.38},
    {'z': -2.0, 'w': 2.1, 'h': 1.8, 'y': 0.03, 'c': 0.34},
    {'z': 0.9, 'w': 2.1, 'h': 1.8, 'y': 0.03, 'c': 0.34},
    {'z': 1.4, 'w': 1.6, 'h': 1.55, 'y': 0.0, 'c': 0.3},
    {'z': 2.95, 'w': 1.6, 'h': 1.5, 'y': 0.0, 'c': 0.3},
    {'z': 3.35, 'w': 1.3, 'h': 1.25, 'y': 0.0, 'c': 0.3},
]
SILL = 0.92
hull = K.loft('fuselage', FUSE, [M['paint'], M['paintB'], M['paintC'], M['belly']], panel=0.85, relief=0.35, seed=4, inset=0.03,
              depths=(0.012, -0.012, 0.02), min_area=0.2, pick=lambda c, r: 3 if game(c)[1] < -0.4 else r.randrange(3))
# The cockpit opening: the canopy closes over it. Down below the tub floor, so there is no lid across it.
K.cut(hull, K.box('cockpit-cut', (0, 0.55, -0.35), (1.22, 1.8, 3.0), M['dark']))
parts = [hull]

# The coaming: a rim round the opening, the canopy's seal sits on it.
for s in (-1, 1):
    parts.append(K.box(f'coaming-{s}', (s * 0.64, SILL - 0.01, -0.35), (0.07, 0.05, 3.0), M['trim']))
parts.append(K.box('coaming-f', (0, SILL - 0.01, -1.86), (1.34, 0.05, 0.06), M['trim']))
# The turtle deck behind the seat: the avionics bay's lid, under the back of the canopy.
parts.append(K.box('turtle', (0, SILL - 0.04, 0.95), (1.2, 0.04, 0.42), M['trim']))
# A band of the squadron colour round the nose.
def oct_ring(sec, grow=0.012):
    return [(x * (1 + grow * 4), sec['y'] + (y - sec['y']) * (1 + grow * 4), z) for (x, y, z) in K._ring(sec, [1] * 8)]
n0 = {'z': -4.55, 'w': 1.42, 'h': 1.12, 'y': -0.06, 'c': 0.41}
n1 = {'z': -4.3, 'w': 1.55, 'h': 1.21, 'y': -0.05, 'c': 0.4}
parts.append(slab('nose-band', [oct_ring(n0), oct_ring(n1)], M['stripe'], caps=False))

# The nose: a dark sensor window over the radar and the optics, a probe, and two blisters for the threat warning.
parts.append(solid(K.lathe('nose-dome', [(0, 0.24), (0.5, 0.2), (1, 0.02)], (0, -0.12, -5.42), (0, -0.12, -5.8), M['sensor'], segs=16), 0.02))
parts.append(K.cyl('probe', (0.36, -0.26, -4.8), (0.36, -0.26, -6.0), 0.02, 0.012, M['dark'], segs=6))
for s in (-1, 1):
    parts.append(solid(K.lathe(f'blister-{s}', [(0, 0.1), (1, 0.01)], (s * 0.62, 0.42, -3.9), (s * 0.7, 0.5, -4.1), M['sensor'], segs=10), 0.01))

# The service body's top: the power plant's housing behind the canopy, louvres over the coolant pumps, an antenna.
parts.append(K.box('power-housing', (0, 0.88, 2.15), (0.9, 0.22, 1.5), M['paintB'], bevel=0.04))
for i in range(5):
    parts.append(K.box(f'louvre-{i}', (0, 1.0, 1.6 + i * 0.26), (0.7, 0.025, 0.1), M['dark']))
parts.append(slab('antenna', [[(0, 0.99, 2.6), (0.02, 0.99, 2.75), (0, 0.99, 2.9), (-0.02, 0.99, 2.75)],
                              [(0, 1.4, 2.85), (0.01, 1.4, 2.9), (0, 1.4, 2.95), (-0.01, 1.4, 2.9)]], M['dark']))

# --- the propellant tanks ------------------------------------------------------------------------------------------------

TX, TY, TR, TZ0, TZ1 = 1.38, -0.12, 0.56, -1.3, 2.9
for s in (-1, 1):
    x = s * TX
    parts.append(K.cyl(f'tank-{s}', (x, TY, TZ0), (x, TY, TZ1), TR, TR, M['tank'], segs=20, cap=False))
    for z, sgn in ((TZ0, -1), (TZ1, 1)):  # hemispherical ends
        prof = [(math.sin(a) * 1.0, math.cos(a) * TR) for a in [i * math.pi / 2 / 6 for i in range(7)]]
        parts.append(solid(K.lathe(f'tank-end-{s}-{sgn}', prof, (x, TY, z), (x, TY, z + sgn * TR), M['tank'], segs=20), 0.01))
    for z in (-0.6, 0.9, 2.3):  # the straps that hold it to the body
        parts.append(K.cyl(f'strap-{s}-{z}', (x, TY, z - 0.06), (x, TY, z + 0.06), TR + 0.025, TR + 0.025, M['strap'], segs=20))
    # Saddles between tank and body, and the feed line aft to the drive.
    for z in (-0.6, 2.3):
        parts.append(K.box(f'saddle-{s}-{z}', (s * 0.9, TY + 0.1, z), (0.36, 0.5, 0.22), M['strap']))
    parts.append(K.cyl(f'feed-{s}', (x - s * 0.25, TY - 0.3, 2.95), (s * 0.45, -0.35, 3.55), 0.06, 0.06, M['trim'], segs=8))
    # A hazard stripe and a fill port.
    parts.append(K.cyl(f'tank-haz-{s}', (x, TY, 1.55), (x, TY, 1.65), TR + 0.012, TR + 0.012, M['hazard'], segs=20))
    parts.append(K.box(f'fill-{s}', (x + s * 0.4, TY + 0.38, 0.2), (0.14, 0.04, 0.14), M['dark']))
    # Two missiles on rails under each tank.
    for k, dx in enumerate((-0.18, 0.18)):
        mx, my = x + dx, TY - TR - 0.16
        parts.append(K.box(f'rail-{s}-{k}', (mx, my + 0.1, 0.6), (0.06, 0.06, 1.8), M['dark']))
        parts.append(K.cyl(f'missile-{s}-{k}', (mx, my, 1.5), (mx, my, -0.25), 0.09, 0.09, M['missile'], segs=10))
        parts.append(K.cyl(f'missile-nose-{s}-{k}', (mx, my, -0.25), (mx, my, -0.5), 0.09, 0.01, M['missile'], segs=10, cap=False))
        for f in (-1, 1):
            parts.append(K.box(f'fin-{s}-{k}-{f}', (mx + f * 0.12, my, 1.35), (0.14, 0.01, 0.22), M['dark']))

# --- the main drive ------------------------------------------------------------------------------------------------------

main = F['thrusters']['main'][0]
mz, mr = main['at'][2], main['r']
# The thrust structure: struts from the service body to the gimbal ring, the drive's push going straight into the body.
for i in range(6):
    a = i * math.pi / 3 + math.pi / 6
    parts.append(K.cyl(f'thrust-strut-{i}', (math.cos(a) * 0.62, math.sin(a) * 0.55, 3.3), (math.cos(a) * mr * 0.8, math.sin(a) * mr * 0.8, mz - 0.55), 0.05, 0.05, M['trim'], segs=6))
parts.append(K.cyl('pump-housing', (0, 0, 3.3), (0, 0, mz - 0.5), 0.36, 0.3, M['dark'], segs=12))
parts.append(solid(K.lathe('bell', [(0, mr * 0.55), (0.3, mr * 0.75), (1, mr * 1.02)], (0, 0, mz - 0.5), (0, 0, mz + 0.6), M['bell'], segs=24), 0.04))
parts.append(K.cyl('gimbal', (0, 0, mz - 0.62), (0, 0, mz - 0.44), mr * 0.68, mr * 0.68, M['trim'], segs=24))
for i in range(4):  # the actuators that swivel the bell
    a = i * math.pi / 2 + math.pi / 4
    parts.append(K.cyl(f'actuator-{i}', (math.cos(a) * 0.5, math.sin(a) * 0.5, 3.35), (math.cos(a) * mr * 0.78, math.sin(a) * mr * 0.78, mz - 0.1), 0.035, 0.035, M['button'], segs=6))
parts.append(K.cyl('throat', (0, 0, mz - 0.2), (0, 0, mz - 0.18), mr * 0.5, mr * 0.5, M['throat'], segs=20))
empty('nozzle', (0, 0, mz + 0.6))

# --- the manoeuvring thrusters: a quad at every cluster, on an outrigger, a nozzle each way the physics fires it ----------

com = F['com']
for i, c in enumerate(F['thrusters']['rcs']):
    x, y, z = c['at']
    rel = [x - com[0], y - com[1], z - com[2]]
    sx, sy, sz = [1 if r >= 0 else -1 for r in rel]
    # The outrigger from the hull (the capsule's flank forward, the service body aft).
    parts.append(K.box(f'rcs-arm-{i}', (sx * 0.72, y, z), (abs(x) * 0.9, 0.12, 0.18), M['trim']))
    parts.append(K.box(f'rcs-{i}', (x - sx * 0.05, y, z), (0.32, 0.3, 0.38), M['dark'], bevel=0.04))
    parts.append(K.box(f'rcs-haz-{i}', (x - sx * 0.05, y + sy * 0.151, z), (0.28, 0.005, 0.34), M['hazard']))
    for d in ((sx, 0, 0), (0, sy, 0), (0, 0, sz)):
        a = (x + d[0] * 0.1, y + d[1] * 0.1, z + d[2] * 0.14)
        b = (x + d[0] * 0.26, y + d[1] * 0.24, z + d[2] * 0.3)
        parts.append(K.cyl(f'rcs-n-{i}-{d}', a, b, 0.04, 0.075, M['bell'], segs=8, cap=False))

# --- the radiators: two panels on hinges along the top of the service body, spread in flight, folded up for stowage ------

HX, HY, HZ0, HZ1, SPAN = 0.8, 0.82, 1.15, 3.05, 2.9
wings = []
for s in (-1, 1):
    parts.append(K.cyl(f'hinge-{s}', (s * HX, HY, HZ0), (s * HX, HY, HZ1), 0.06, 0.06, M['trim'], segs=8))
    rad = []
    x0, x1 = s * (HX + 0.06), s * (HX + SPAN)
    # The panel: a frame round a thin sheet, the coolant pipes across it outboard from the header at the hinge.
    rad.append(K.box(f'rad-sheet-{s}', ((x0 + x1) / 2, HY, (HZ0 + HZ1) / 2), (SPAN - 0.06, 0.03, HZ1 - HZ0 - 0.1), M['panelRad']))
    rad.append(K.box(f'rad-front-{s}', ((x0 + x1) / 2, HY, HZ0), (SPAN - 0.06, 0.06, 0.06), M['trim']))
    rad.append(K.box(f'rad-back-{s}', ((x0 + x1) / 2, HY, HZ1), (SPAN - 0.06, 0.06, 0.06), M['trim']))
    rad.append(K.box(f'rad-tip-{s}', (x1, HY, (HZ0 + HZ1) / 2), (0.08, 0.08, HZ1 - HZ0 + 0.06), M['stripe']))
    rad.append(K.cyl(f'rad-header-{s}', (x0 + s * 0.05, HY, HZ0 + 0.05), (x0 + s * 0.05, HY, HZ1 - 0.05), 0.045, 0.045, M['pipe'], segs=8))
    for k in range(9):
        z = HZ0 + 0.16 + k * (HZ1 - HZ0 - 0.32) / 8
        for side in (1, -1):
            rad.append(K.cyl(f'rad-pipe-{s}-{k}-{side}', (x0 + s * 0.05, HY + side * 0.022, z), (x1 - s * 0.06, HY + side * 0.022, z), 0.014, 0.014, M['pipe'], segs=5, cap=False))
    rad.append(K.box(f'nav-{s}', (x1 + s * 0.05, HY, HZ0 + 0.3), (0.07, 0.07, 0.2), M['green'] if s > 0 else M['red']))
    w = K.join(rad, 'wing_r' if s > 0 else 'wing_l')
    origin_at(w, (s * HX, HY, (HZ0 + HZ1) / 2))
    wings.append(w)

# --- the guns: twin cannon in a chin fairing on the centreline ------------------------------------------------------------

parts.append(slab('gun-fairing', [[(-0.42, -0.62, z), (0.42, -0.62, z), (0.36, -0.98, z), (-0.36, -0.98, z)] for z in (-4.0, -0.4)], M['belly']))
parts.append(slab('gun-fairing-nose', [[(-0.42, -0.62, -4.0), (0.42, -0.62, -4.0), (0.36, -0.98, -4.0), (-0.36, -0.98, -4.0)],
                                       [(-0.2, -0.66, -4.5), (0.2, -0.66, -4.5), (0.16, -0.84, -4.5), (-0.16, -0.84, -4.5)]], M['belly']))
for s, nm in ((-1, 'muzzle_l'), (1, 'muzzle_r')):
    parts.append(K.cyl(f'barrel-{s}', (s * 0.2, -0.78, -4.3), (s * 0.2, -0.78, -5.5), 0.055, 0.045, M['gun'], segs=10))
    parts.append(K.cyl(f'brake-{s}', (s * 0.2, -0.78, -5.35), (s * 0.2, -0.78, -5.55), 0.07, 0.07, M['gun'], segs=10))
    empty(nm, (s * 0.2, -0.78, -5.6))

# The tail light under the drive, and the strobe on the power housing.
parts.append(K.box('nav-tail', (0, -0.72, 3.1), (0.12, 0.06, 0.1), M['white']))
strobe = K.box('strobe', (0, 1.03, 2.75), (0.1, 0.05, 0.14), M['strobe'])

# --- the landing gear ----------------------------------------------------------------------------------------------------

gear = []
for (x, z) in ((0, -3.2), (-1.38, 1.6), (1.38, 1.6)):
    top = -0.62 if z < 0 else -0.62
    gear.append(K.cyl(f'strut-{x}-{z}', (x, top, z), (x, -1.05, z), 0.06, 0.06, M['trim'], segs=8))
    gear.append(K.cyl(f'oleo-{x}-{z}', (x, -0.8, z), (x, -1.0, z), 0.075, 0.075, M['button'], segs=8))
    gear.append(K.box(f'pad-{x}-{z}', (x, -1.1, z), (0.4, 0.08, 0.55), M['dark'], bevel=0.02))
gear_ob = K.join(gear, 'gear')

# --- the canopy: a framed layer of glass over the pilot's head, on a hinge at the back -----------------------------------

CAN = [  # sections: z, half-width at the sill, sill height, crown height. The pilot's helmet tops out at y 1.18.
    (-1.86, 0.62, SILL, SILL + 0.04),
    (-1.25, 0.63, SILL, 1.36),
    (-0.55, 0.63, SILL, 1.47),
    (0.35, 0.62, SILL, 1.45),
    (0.95, 0.52, SILL, 1.2),
    (1.16, 0.4, SILL, SILL + 0.04),
]
def can_ring(z, hw, sill, crown, n=7):
    """Faceted, like a real canopy's panes: six flat facets from sill to sill."""
    pts = []
    for i in range(n):
        a = math.pi * i / (n - 1)  # 0 starboard sill .. pi port sill
        r = 1.0 if i in (0, n - 1) else 1.0
        pts.append((math.cos(a) * hw * r, sill + math.sin(a) * (crown - sill), z))
    return pts

# The glass is a thin closed sheet (solidified), so from outside and from the seat you see its near side only, as glass.
glass = solid(slab('canopy-glass', [can_ring(*c) for c in CAN], M['glass'], caps=False), 0.012)
cframe = []
for i, c in enumerate(CAN[1:5]):  # the windscreen bow, two hoops, the aft bow
    ring = can_ring(*c)
    for a, b in zip(ring, ring[1:]):
        cframe.append(K.cyl(f'bow-{i}-{a}', a, b, 0.03 if i == 0 else 0.022, 0.03 if i == 0 else 0.022, M['frame'], segs=6))
for k in (2, 4):  # two longerons along the top facets, where the panes meet
    pts = [can_ring(*c)[k] for c in CAN[1:5]]
    for a, b in zip(pts, pts[1:]):
        cframe.append(K.cyl(f'longeron-{k}-{a}', a, b, 0.02, 0.02, M['frame'], segs=6))
for s in (-1, 1):  # the sill rails
    pts = [(s * c[1], c[2] + 0.01, c[0]) for c in CAN]
    for a, b in zip(pts, pts[1:]):
        cframe.append(K.cyl(f'sill-{s}-{a}', a, b, 0.04, 0.04, M['frame'], segs=6))
canopy = K.join([glass] + cframe, 'canopy')
origin_at(canopy, (0, SILL, 1.16))

# --- the cockpit ---------------------------------------------------------------------------------------------------------

EYE = (0, 1.02, -0.32)
ck = []
FLOOR, FRONT, BACK, HALF = -0.3, -1.8, 0.72, 0.58
ck.append(K.box('tub-floor', (0, FLOOR, (FRONT + BACK) / 2), (2 * HALF, 0.04, BACK - FRONT), M['tubDark']))
for s in (-1, 1):
    ck.append(K.box(f'tub-side-{s}', (s * HALF, (FLOOR + SILL) / 2, (FRONT + BACK) / 2), (0.03, SILL - FLOOR, BACK - FRONT), M['tub']))
    ck.append(K.box(f'tub-sill-{s}', (s * (HALF - 0.02), SILL - 0.03, (FRONT + BACK) / 2), (0.1, 0.04, BACK - FRONT), M['tubDark']))
ck.append(K.box('tub-back', (0, (FLOOR + SILL) / 2, BACK), (2 * HALF, SILL - FLOOR, 0.03), M['tub']))
ck.append(K.box('tub-front', (0, 0.1, FRONT), (2 * HALF, 0.8, 0.03), M['tub']))

# The instrument panel: a slab tilted back toward the pilot, under a glare shield.
PZ, PY = -1.0, 0.6  # the panel face's centre, about 0.7 m from the pilot's eyes
tilt = math.radians(22)
u = (1, 0, 0)
v = (0, math.cos(tilt), -math.sin(tilt))  # up the face, leaning away from the pilot
n = (0, math.sin(tilt), math.cos(tilt))   # out of the face, toward the pilot
def on_face(x, y, out=0.0):
    return (x, PY + v[1] * y + n[1] * out, PZ + v[2] * y + n[2] * out)
face = slab('panel-face', [[on_face(-0.5, -0.24, 0), on_face(0.5, -0.24, 0), on_face(0.5, 0.26, 0), on_face(-0.5, 0.26, 0)],
                            [on_face(-0.5, -0.24, -0.25), on_face(0.5, -0.24, -0.25), on_face(0.5, 0.26, -0.25), on_face(-0.5, 0.26, -0.25)]], M['panel'])
ck.append(face)
# The glare shield over the panel, and the head-up display's frame on it.
gtop = on_face(0, 0.26, 0.02)
ck.append(slab('glare', [[(-0.52, gtop[1] - 0.04, gtop[2] + 0.02), (0.52, gtop[1] - 0.04, gtop[2] + 0.02), (0.52, gtop[1] + 0.04, gtop[2] + 0.02), (-0.52, gtop[1] + 0.04, gtop[2] + 0.02)],
                         [(-0.52, gtop[1] - 0.06, gtop[2] - 0.38), (0.52, gtop[1] - 0.06, gtop[2] - 0.38), (0.52, gtop[1] + 0.02, gtop[2] - 0.38), (-0.52, gtop[1] + 0.02, gtop[2] - 0.38)]], M['glare']))
HUDY, HUDZ = gtop[1] + 0.15, gtop[2] - 0.1
ck.append(K.box('hud-base', (0, gtop[1] + 0.03, HUDZ - 0.04), (0.38, 0.06, 0.16), M['bezel']))
for s in (-1, 1):
    ck.append(K.box(f'hud-post-{s}', (s * 0.19, HUDY, HUDZ), (0.02, 0.26, 0.02), M['bezel']))
hud = quad('hud', (0, HUDY, HUDZ), (0.18, 0, 0), (0, 0.12, -0.025), M['hudGlass'])
empty('hud-centre', (0, HUDY, HUDZ))

# Three screens with their bezels and buttons, the left and right ones turned a little toward the pilot.
screens = []
for name, x, yaw, mat in (('mfd_l', -0.31, 0.25, M['screenL']), ('mfd_c', 0.0, 0.0, M['screenC']), ('mfd_r', 0.31, -0.25, M['screenR'])):
    out = 0.012 + 0.11 * abs(math.sin(yaw))  # a turned screen stands off the face, so its back edge stays clear of it
    c = on_face(x, -0.02, out)
    uu = (math.cos(yaw) * 0.1, 0, math.sin(yaw) * 0.1)
    vv = (0, v[1] * 0.1, v[2] * 0.1)
    screens.append(quad(name, c, uu, vv, mat))
    b = on_face(x, -0.02, out - 0.006)
    ck.append(quad(f'{name}-bezel', b, (uu[0] * 1.32, 0, uu[2] * 1.32), (0, vv[1] * 1.32, vv[2] * 1.32), M['bezel']))
    for k in range(5):  # buttons down each side of the bezel
        for sd in (-1, 1):
            p = on_face(x + sd * 0.122 * math.cos(yaw), -0.1 + k * 0.04, 0.012)
            ck.append(K.box(f'{name}-btn-{k}-{sd}', (p[0], p[1], p[2] + sd * 0.122 * math.sin(yaw) * 0), (0.018, 0.018, 0.012), M['button']))
# A row of lamps along the bottom of the panel, and two standby dials.
for k in range(9):
    p = on_face(-0.32 + k * 0.08, -0.19, 0.008)
    ck.append(K.box(f'lamp-{k}', p, (0.022, 0.012, 0.008), [M['lampG'], M['lampA'], M['button'], M['lampG'], M['button'], M['lampR'], M['button'], M['lampG'], M['lampA']][k]))
for x in (-0.44, 0.44):
    ck.append(K.cyl(f'dial-{x}', on_face(x, 0.1, 0.0), on_face(x, 0.1, 0.02), 0.045, 0.045, M['bezel'], segs=16))

# The side consoles: switches, a few lamps, the throttle on the left and the stick between the knees.
r = random.Random(7)
for s in (-1, 1):
    x = s * (HALF - 0.12)
    ck.append(K.box(f'console-{s}', (x, 0.28, -0.3), (0.22, 0.12, 1.2), M['panel']))
    for k in range(10):
        z = -0.85 + k * 0.11
        for j in range(3):
            if r.random() < 0.35:
                continue
            ck.append(K.box(f'sw-{s}-{k}-{j}', (x - 0.07 + j * 0.07, 0.35, z), (0.025, 0.03, 0.02), r.choice([M['button'], M['button'], M['lampG'], M['lampA']])))
ck.append(K.cyl('throttle-arm', (-0.42, 0.34, -0.55), (-0.38, 0.5, -0.5), 0.022, 0.022, M['trim'], segs=8))
ck.append(K.box('throttle-grip', (-0.38, 0.53, -0.5), (0.07, 0.09, 0.12), M['dark'], bevel=0.015))
ck.append(K.cyl('stick', (0, FLOOR + 0.02, -0.82), (0, 0.32, -0.74), 0.025, 0.02, M['trim'], segs=8))
ck.append(K.box('stick-grip', (0, 0.38, -0.73), (0.06, 0.13, 0.06), M['dark'], bevel=0.015))
ck.append(K.box('stick-boot', (0, FLOOR + 0.05, -0.82), (0.14, 0.08, 0.14), M['tubDark'], bevel=0.02))
# Rudder pedals under the panel.
for s in (-1, 1):
    ck.append(K.box(f'pedal-{s}', (s * 0.16, FLOOR + 0.15, -1.3), (0.1, 0.2, 0.03), M['trim']))

# The seat: pan, back, headrest, the yellow-and-black ejection handle, and the harness.
SZ = 0.2
ck.append(K.box('seat-pan', (0, 0.02, SZ - 0.25), (0.48, 0.12, 0.5), M['seat'], bevel=0.02))
ck.append(K.box('seat-cushion', (0, 0.1, SZ - 0.25), (0.42, 0.05, 0.44), M['cushion']))
ck.append(slab('seat-back', [[(-0.24, 0.05, SZ + 0.02), (0.24, 0.05, SZ + 0.02), (0.24, 0.05, SZ + 0.14), (-0.24, 0.05, SZ + 0.14)],
                              [(-0.24, 0.88, SZ + 0.18), (0.24, 0.88, SZ + 0.18), (0.24, 0.88, SZ + 0.3), (-0.24, 0.88, SZ + 0.3)]], M['seat']))
ck.append(K.box('headrest', (0, 1.0, SZ + 0.24), (0.3, 0.26, 0.14), M['seat'], bevel=0.03))
ck.append(K.box('eject-a', (0, 0.07, SZ - 0.52), (0.18, 0.03, 0.03), M['hazard']))
ck.append(K.box('eject-b', (0, 0.07, SZ - 0.52), (0.06, 0.031, 0.031), M['dark']))
for s in (-1, 1):
    ck.append(K.box(f'seat-rail-{s}', (s * 0.27, 0.45, SZ + 0.2), (0.04, 0.9, 0.06), M['trim']))
    ck.append(K.box(f'strap-{s}', (s * 0.12, 0.7, SZ + 0.05), (0.05, 0.4, 0.02), M['harness']))
cockpit = K.join(ck, 'cockpit')

# --- the pilot, for the outside view (the cockpit camera does not draw them) -------------------------------------------

pl = []
pl.append(K.box('torso', (0, 0.5, SZ - 0.02), (0.4, 0.55, 0.26), M['suit'], bevel=0.06))
pl.append(K.box('thighs', (0, 0.2, SZ - 0.38), (0.36, 0.16, 0.5), M['suit'], bevel=0.05))
pl.append(K.box('shins', (0, 0.0, SZ - 0.72), (0.32, 0.4, 0.14), M['suit'], bevel=0.04))
for s in (-1, 1):
    pl.append(K.cyl(f'arm-{s}', (s * 0.22, 0.7, SZ), (s * 0.24, 0.42, SZ - 0.3), 0.06, 0.05, M['suit'], segs=8))
    pl.append(K.cyl(f'fore-{s}', (s * 0.24, 0.42, SZ - 0.3), (s * 0.12 if s > 0 else -0.36, 0.42, SZ - 0.6), 0.05, 0.045, M['suit'], segs=8))
pl.append(solid(K.lathe('helmet', [(0, 0.02), (0.12, 0.1), (0.4, 0.15), (0.75, 0.14), (0.92, 0.09), (1, 0.0)], (0, 0.86, -0.2), (0, 1.18, -0.2), M['helmet'], segs=16), 0.02))
pl.append(K.box('visor', (0, 1.0, -0.33), (0.2, 0.09, 0.04), M['visor'], bevel=0.02))
pilot = K.join(pl, 'pilot')

empty('eye', EYE)
for s, nm in ((-1, 'decal_l'), (1, 'decal_r')):
    empty(nm, (s * 0.99, 0.0, -2.9))

body = K.join(parts, 'body')
kb = K.export(OUT, blend)
print(f'fighter.glb: {kb} KB')
