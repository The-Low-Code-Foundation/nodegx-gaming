# Builds the carrier's fighter, outside and in, from the layout's `fighter` entry (ships/carrier/fighter.json).
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
#   legs             your legs, boots and kneeboard: drawn only from the seat, so a parked fighter's seat is empty
#   mfd_l, mfd_c, mfd_r   the cockpit screens (UV-mapped quads; the game draws on them)
#   hud              the head-up display's glass
#   strobe           the anti-collision light, blinked by the game
#   eye, nozzle, decal_l, decal_r, muzzle_l, muzzle_r   empties: the pilot's eye, the drive's mouth, where the side
#                    number goes, the cannon muzzles
# Not looked up, but there: `cockpit` (the tub, panel, consoles, stick, throttle and pedals) and
# `cockpit-labels` (its placards and lit legends, on one texture this script draws: see label_atlas()).
import sys, os, json, math, random

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shipkit as K
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = os.path.dirname(os.path.dirname(HERE))
F = json.load(open(os.path.join(ROOT, 'ships', 'carrier', 'fighter.json')))['fighter']
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
    # The cockpit: grey-green panels, black padding and knobs, bright metal levers, red guards. Labels and the lit
    # legends share one texture, drawn by `label_atlas()` (Placard, LampLegend).
    'tub': K.material('Tub', '#3a423d', 0.2, 0.7),
    'tubDark': K.material('TubDark', '#242927', 0.2, 0.75),
    'seat': K.material('Seat', '#2b2f35', 0.2, 0.7),
    'cushion': K.material('Cushion', '#46503f', 0.0, 0.9),
    'harness': K.material('Harness', '#b8963a', 0.0, 0.8),
    'panel': K.material('Panel', '#2b322e', 0.2, 0.7),
    'panelLt': K.material('PanelLight', '#3a433d', 0.2, 0.7),
    'pad': K.material('Pad', '#1d201f', 0.0, 0.95),
    'switch': K.material('Switch', '#b9bdc0', 0.5, 0.35),
    'knob': K.material('Knob', '#121314', 0.1, 0.5),
    'guard': K.material('Guard', '#b3261c', 0.1, 0.5),
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


def quad(name, c, u, v, mat, uv=(0, 0, 1, 1)):
    """A one-sided UV-mapped rectangle: centre `c`, half-extents along `u` (across, left to right as seen) and `v` (up),
    all game-frame vectors. It faces u × v. `uv` is the texture's rectangle (u0, v0, u1, v1) on it, or None for none."""
    c, u, v = Vector(c), Vector(u), Vector(v)
    bm = bmesh.new()
    layer = bm.loops.layers.uv.new('UVMap') if uv else None
    pts = [c - u - v, c + u - v, c + u + v, c - u + v]
    vs = [bm.verts.new(K.B(*p)) for p in pts]
    f = bm.faces.new(vs)
    if uv:
        u0, v0, u1, v1 = uv
        for loop, t in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
            loop[layer].uv = t
    return K._object(bm, name, [mat])


def smooth(ob):
    """Smooth-shaded (the legs: round things, not machined ones)."""
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


G2B = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # the game frame to Blender's, as K.B


def obox(name, c, ax, ay, size, mat, bevel=0.0):
    """A box at game point `c`, turned so its own x lies along `ax` and its y along `ay` (game vectors; `ay` is squared
    up to `ax`). `size` is (along ax, along ay, along ax × ay)."""
    ob = K.box(name, (0, 0, 0), size, mat, bevel)
    ax = Vector(ax).normalized()
    ay = Vector(ay)
    ay = (ay - ay.dot(ax) * ax).normalized()
    az = ax.cross(ay)
    R = G2B @ Matrix((ax, ay, az)).transposed() @ G2B.inverted()
    ob.data.transform(Matrix.Translation(K.B(*c)) @ R.to_4x4())
    return ob


class Surf:
    """A flat surface to fit things to: origin `o`, `ax` across it (left to right as the pilot reads it), `ay` up it (the
    top of a label); `an` = ax × ay comes out of it, toward the pilot."""
    def __init__(self, o, ax, ay):
        self.o = Vector(o)
        self.ax = Vector(ax).normalized()
        ay = Vector(ay)
        self.ay = (ay - ay.dot(self.ax) * self.ax).normalized()
        self.an = self.ax.cross(self.ay)

    def p(self, x, y, out=0.0):
        return tuple(self.o + self.ax * x + self.ay * y + self.an * out)

    def box(self, name, x, y, w, d, h, mat, out=0.0, bevel=0.0):
        """A box standing on the surface: `w` across, `d` up it, `h` out of it, its base `out` off the surface."""
        return obox(name, self.p(x, y, out + h / 2), self.ax, self.ay, (w, d, h), mat, bevel)

    def mark(self, name, x, y, w, d, mat, out=0.0):
        """A flat rectangle on the surface (a fastener's head, a painted mark): two triangles."""
        return quad(name, self.p(x, y, out), self.ax * (w / 2), self.ay * (d / 2), mat, None)


# --- labels: every placard and lit legend in the cockpit is a quad on one texture, drawn here -----------------------------

LABEL_STYLE = {  # text colour, background (the surface it sits on, so only the letters show), material
    'panel': ('#dde2da', '#2b322e', 'placard'),   # on Panel
    'plate': ('#dde2da', '#3a433d', 'placard'),   # on PanelLight
    'wall': ('#c9cec6', '#3a423d', 'placard'),    # on Tub
    'tile': ('#5e6460', '#0d0e0f', 'placard'),    # an annunciator that is out
    'green': ('#5dff9a', '#000000', 'legend'),    # lit
    'amber': ('#ffb43a', '#000000', 'legend'),
    'warn': ('#151515', '#d8b030', 'placard'),    # on Hazard
    'paper': ('#2a2c30', '#e4e0d4', 'placard'),
    'pad': ('#8d938d', '#1d201f', 'placard'),     # on Pad
}
LABELS = []  # (text, style, centre, ax, ay, line height, widest)


def placard(text, style, c, ax, ay, h=0.013, maxw=None):
    """A label at game point `c`, reading along `ax`, its top toward `ay`; `h` the height of one line of it (the capitals
    are about half that). Drawn once every label is known (`labels()`)."""
    LABELS.append((text, style, c, Vector(ax), Vector(ay), h, maxw))


def label_atlas():
    """Draws every label's text into one image (white-on-panel placards and lit legends alike), with Workbench from text
    objects, and returns {(text, style): (u0, v0, u1, v1, width px, height px)} and the image."""
    import tempfile
    sc = bpy.context.scene
    was = [o for o in sc.objects if not o.hide_render]
    for o in was:
        o.hide_render = True
    PX, RH, PAD, FS = 100, 48, 8, 0.36  # pixels per Blender unit, a line's cell height, padding, font size (caps ~25 px)
    W = 1024
    keys = list(dict.fromkeys((t, s) for t, s, *_ in LABELS))
    temp, cells = [], {}
    dg = None
    texts = {}
    for k in keys:
        cu = bpy.data.curves.new('label', 'FONT')
        cu.body = k[0]
        cu.size = FS
        cu.space_line = 1.05
        ob = bpy.data.objects.new('label', cu)
        ob.scale.x = 0.84  # condensed, as cockpit lettering is
        sc.collection.objects.link(ob)
        temp.append(ob)
        texts[k] = ob
    dg = bpy.context.evaluated_depsgraph_get()
    cap = None
    x = y = rowh = 0
    for k, ob in texts.items():
        bb = [ob.matrix_world @ Vector(v) for v in ob.evaluated_get(dg).bound_box]
        x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
        y0, y1 = min(v.y for v in bb), max(v.y for v in bb)
        w = int((x1 - x0) * PX) + 2 * PAD
        h = RH if '\n' not in k[0] else int((y1 - y0) * PX) + RH - 25
        if '\n' not in k[0]:
            y0 = y1 - 0.249 * ob.scale.y * FS / 0.36  # the capitals' height: centred on them, so Q and J sit level
        if x + w > W:
            x, y, rowh = 0, y + rowh + 2, 0
        cells[k] = (x, y, w, h, (x0 + x1) / 2, (y0 + y1) / 2)
        x += w + 2
        rowh = max(rowh, h)
    H = (y + rowh + 31) // 32 * 32
    lin = lambda hx: tuple(K._lin(int(hx[i:i + 2], 16)) for i in (1, 3, 5)) + (1,)
    for k, (cx, cy, w, h, mx, my) in cells.items():
        fg, bg, _ = LABEL_STYLE[k[1]]
        ob = texts[k]
        # Centre the text in its cell (Blender y up, the image's top row at y = H).
        ob.location.x += (cx + w / 2) / PX - mx
        ob.location.y += (H - cy - h / 2) / PX - my
        ob.location.z = 0.01
        ob.color = lin(fg)
        bm = bmesh.new()
        vs = [bm.verts.new(((cx + a) / PX, (H - cy - b) / PX, 0)) for a, b in ((0, h), (w, h), (w, 0), (0, 0))]
        bm.faces.new(vs)
        me = bpy.data.meshes.new('cell')
        bm.to_mesh(me)
        bm.free()
        cell = bpy.data.objects.new('cell', me)
        cell.color = lin(bg)
        sc.collection.objects.link(cell)
        temp.append(cell)
    cam = bpy.data.objects.new('atlas-cam', bpy.data.cameras.new('atlas-cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(W, H) / PX
    cam.location = (W / 2 / PX, H / 2 / PX, 5)
    sc.collection.objects.link(cam)
    temp.append(cam)
    sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'OBJECT'
    sc.display.render_aa = '16'
    sc.view_settings.view_transform = 'Standard'
    sc.render.dither_intensity = 0
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.compression = 100
    path = os.path.join(tempfile.mkdtemp(), 'cockpit_labels.png')
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    img.name = 'cockpit_labels'
    img.pack()
    os.remove(path)
    for o in temp:
        bpy.data.objects.remove(o)
    for o in was:
        o.hide_render = False
    sc.camera = None
    uv = {k: (cx / W, 1 - (cy + h) / H, (cx + w) / W, 1 - cy / H, w, h) for k, (cx, cy, w, h, _, _) in cells.items()}
    return uv, img, RH


def label_material(name, img, emit=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    uvn = nt.nodes.new('ShaderNodeUVMap')  # named, so the exporter ties the texture to the quads' UVs
    uvn.uv_map = 'UVMap'
    nt.links.new(uvn.outputs['UV'], t.inputs['Vector'])
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.2
    b.inputs['Roughness'].default_value = 0.7
    if emit:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    return m


def labels():
    """Every placard() as a quad on the label texture."""
    uv, img, RH = label_atlas()
    mats = {'placard': label_material('Placard', img), 'legend': label_material('LampLegend', img, emit=1.6)}
    out = []
    for i, (text, style, c, ax, ay, h, maxw) in enumerate(LABELS):
        u0, v0, u1, v1, w, hp = uv[(text, style)]
        k = h / RH  # metres a pixel
        if maxw and w * k > maxw:
            k = maxw / w
        out.append(quad(f'label-{i}', c, ax.normalized() * (w * k / 2), ay.normalized() * (hp * k / 2), mats[LABEL_STYLE[style][2]], (u0, v0, u1, v1)))
    return out


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
def frame_strip(name, a, b, width, depth, mat=M['frame']):
    """A flat frame member under the glass from a to b: `depth` deep into the canopy, `width` across."""
    a, b = Vector(a), Vector(b)
    m = (a + b) / 2
    inward = Vector((0, SILL, m.z)) - m
    ax = b - a
    ay = (inward - inward.dot(ax.normalized()) * ax.normalized()).normalized()
    return obox(name, m + ay * (depth / 2 - 0.006), ax, ay, (ax.length + depth * 0.8, depth, width), mat)
for i, c in enumerate(CAN[1:5]):  # the windscreen bow (broad, as it carries the most), two hoops, the aft bow
    ring = can_ring(*c)
    for j, (a, b) in enumerate(zip(ring, ring[1:])):
        cframe.append(frame_strip(f'bow-{i}-{j}', a, b, 0.07 if i == 0 else 0.045, 0.04 if i == 0 else 0.03))
for k in (2, 4):  # two longerons along the top facets, where the panes meet
    pts = [can_ring(*c)[k] for c in CAN[1:5]]
    for j, (a, b) in enumerate(zip(pts, pts[1:])):
        cframe.append(frame_strip(f'longeron-{k}-{j}', a, b, 0.035, 0.025))
# A grab handle inside each windscreen post, for getting in and for holding on under g.
ws = can_ring(*CAN[1])
for s, (a, b) in ((1, (ws[0], ws[1])), (-1, (ws[6], ws[5]))):
    a, b = Vector(a), Vector(b)
    p0, p1 = a + (b - a) * 0.25, a + (b - a) * 0.85
    inn = (Vector((0, SILL + 0.1, a.z)) - (p0 + p1) / 2).normalized()
    h0, h1 = p0 + inn * 0.075 + Vector((0, 0, 0.03)), p1 + inn * 0.075 + Vector((0, 0, 0.03))
    cframe.append(K.cyl(f'grab-{s}', tuple(h0), tuple(h1), 0.011, 0.011, M['frame'], segs=8))
    for e, h in ((p0, h0), (p1, h1)):
        cframe.append(K.cyl(f'grab-leg-{s}-{e.y:.2f}', tuple(e), tuple(h), 0.009, 0.009, M['frame'], segs=6))
for s in (-1, 1):  # the sill rails
    pts = [(s * c[1], c[2] + 0.01, c[0]) for c in CAN]
    for a, b in zip(pts, pts[1:]):
        cframe.append(K.cyl(f'sill-{s}-{a}', a, b, 0.04, 0.04, M['frame'], segs=6))
canopy = K.join([glass] + cframe, 'canopy')
origin_at(canopy, (0, SILL, 1.16))

# --- the cockpit ---------------------------------------------------------------------------------------------------------
#
# From the seat (the eye at EYE, looking 7° down): the main panel and its three screens under a padded glare shield, the
# caution strip along the panel's top, the head-up display's glass on two thin posts, side consoles of switches, knobs and
# guarded switches with their placards, the throttle on the left, the stick between your knees, your own legs, and the
# canopy's frame round it all. The view ahead over the glare shield stays clear.

EYE = (0, 1.02, -0.32)
ck = []
FLOOR, FRONT, BACK, HALF = -0.3, -1.8, 0.72, 0.58
WALL = HALF - 0.015  # the tub's inner face
ck.append(K.box('tub-floor', (0, FLOOR, (FRONT + BACK) / 2), (2 * HALF, 0.04, BACK - FRONT), M['tubDark']))
for s in (-1, 1):
    ck.append(K.box(f'tub-side-{s}', (s * HALF, (FLOOR + SILL) / 2, (FRONT + BACK) / 2), (0.03, SILL - FLOOR, BACK - FRONT), M['tub']))
    ck.append(K.box(f'tub-sill-{s}', (s * (HALF - 0.02), SILL - 0.03, (FRONT + BACK) / 2), (0.1, 0.04, BACK - FRONT), M['tubDark']))
    # A padded roll along the sill (your elbow), and the canopy's latch hooks.
    ck.append(K.cyl(f'sill-pad-{s}', (s * 0.52, SILL - 0.04, -1.0), (s * 0.52, SILL - 0.04, 0.6), 0.016, 0.016, M['pad'], segs=8))
    for z in (-0.95, -0.35, 0.25):
        ck.append(K.box(f'latch-{s}-{z}', (s * 0.585, SILL - 0.004, z), (0.03, 0.02, 0.05), M['trim']))
ck.append(K.box('tub-back', (0, (FLOOR + SILL) / 2, BACK), (2 * HALF, SILL - FLOOR, 0.03), M['tub']))
ck.append(K.box('tub-front', (0, 0.1, FRONT), (2 * HALF, 0.8, 0.03), M['tub']))


def plate(S, name, x, y, w, d, title=None, mat=M['panelLt']):
    """A raised sub-panel on surface S, held by four fasteners, its title along its top edge. Returns its own surface,
    centred on it."""
    ck.append(S.box(name, x, y, w, d, 0.008, mat))
    for i, (a, b) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        ck.append(S.mark(f'{name}-dzus-{i}', x + a * (w / 2 - 0.009), y + b * (d / 2 - 0.009), 0.006, 0.006, M['bezel'], out=0.0085))
    if title:
        placard(title, 'plate' if mat == M['panelLt'] else 'panel', S.p(x, y + d / 2 - 0.017, 0.0085), S.ax, S.ay, 0.013, maxw=w - 0.04)
    return Surf(S.p(x, y, 0.008), S.ax, S.ay)


def toggle(P, name, x, y, label=None, style='plate'):
    ck.append(P.box(f'{name}-nut', x, y, 0.011, 0.011, 0.004, M['switch']))
    ck.append(K.cyl(f'{name}-lever', P.p(x, y, 0.003), P.p(x, y + 0.008, 0.026), 0.0032, 0.0024, M['switch'], segs=5))
    if label:
        placard(label, style, P.p(x, y - 0.019, 0.0005), P.ax, P.ay, 0.011, maxw=0.05)


def knob(P, name, x, y, r=0.011, label=None, style='plate'):
    ck.append(K.cyl(f'{name}-skirt', P.p(x, y, 0), P.p(x, y, 0.004), r + 0.005, r + 0.005, M['bezel'], segs=8))
    ck.append(K.cyl(f'{name}-body', P.p(x, y, 0.004), P.p(x, y, 0.018), r, r * 0.88, M['knob'], segs=8))
    ck.append(P.mark(f'{name}-mark', x, y + r * 0.45, 0.0025, r * 0.85, M['switch'], out=0.0182))
    if label:
        placard(label, style, P.p(x, y - r - 0.015, 0.0005), P.ax, P.ay, 0.011, maxw=0.05)


def guarded(P, name, x, y, label=None, up=False, mat=M['guard'], style='plate'):
    """A switch under a hinged cover: shut (a coloured block over it) or flipped up behind it."""
    toggle(P, name, x, y, label, style)
    if up:
        ck.append(obox(f'{name}-guard', P.p(x, y + 0.017, 0.017), P.ax, P.an, (0.028, 0.034, 0.004), mat))
        for a in (-1, 1):
            ck.append(P.box(f'{name}-hinge-{a}', x + a * 0.012, y + 0.016, 0.004, 0.008, 0.006, M['bezel']))
    else:
        ck.append(P.box(f'{name}-guard', x, y + 0.003, 0.028, 0.036, 0.03, mat))


def lamp(P, name, x, y, mat, label=None, style='plate'):
    ck.append(P.box(f'{name}-rim', x, y, 0.016, 0.016, 0.003, M['bezel']))
    ck.append(P.box(name, x, y, 0.011, 0.011, 0.005, mat))
    if label:
        placard(label, style, P.p(x, y - 0.017, 0.0005), P.ax, P.ay, 0.011, maxw=0.05)


def dial(P, name, x, y, r, horizon=False):
    """A round standby instrument: a bezel ring, a black face, its marks, and a needle or a horizon bar."""
    ck.append(K.cyl(f'{name}-rim', P.p(x, y, 0), P.p(x, y, 0.012), r + 0.007, r + 0.007, M['bezel'], segs=16))
    ck.append(K.cyl(f'{name}-face', P.p(x, y, 0.012), P.p(x, y, 0.0135), r, r, M['knob'], segs=16))
    for i in range(8):
        a = i * math.pi / 4
        rad = P.ax * math.cos(a) + P.ay * math.sin(a)
        tan = P.an.cross(rad)
        ck.append(quad(f'{name}-tick-{i}', P.p(x + math.cos(a) * r * 0.82, y + math.sin(a) * r * 0.82, 0.0138), rad * (r * 0.14), tan * 0.0014, M['switch'], None))
    if horizon:
        ck.append(P.mark(f'{name}-bar', x, y - r * 0.08, r * 1.5, 0.003, M['switch'], out=0.0138))
        ck.append(P.mark(f'{name}-ac', x, y, r * 0.5, 0.004, M['lampA'], out=0.0141))
    else:
        rad = P.ax * math.cos(1.1) + P.ay * math.sin(1.1)
        ck.append(quad(f'{name}-needle', P.p(x + math.cos(1.1) * r * 0.4, y + math.sin(1.1) * r * 0.4, 0.0138), rad * (r * 0.4), P.an.cross(rad) * 0.0018, M['switch'], None))
    ck.append(K.cyl(f'{name}-set', P.p(x - r * 0.95, y - r * 0.95, 0), P.p(x - r * 0.95, y - r * 0.95, 0.014), 0.007, 0.007, M['knob'], segs=8))


# The instrument panel: a slab tilted back toward the pilot, the width of the tub.
PZ, PY = -1.0, 0.6  # the panel face's centre, about 0.7 m from the pilot's eyes
tilt = math.radians(22)
v = (0, math.cos(tilt), -math.sin(tilt))  # up the face, leaning away from the pilot
n = (0, math.sin(tilt), math.cos(tilt))   # out of the face, toward the pilot
FACE = Surf((0, PY, PZ), (1, 0, 0), v)
def on_face(x, y, out=0.0):
    return FACE.p(x, y, out)
ck.append(slab('panel-face', [[on_face(-WALL, -0.24, 0), on_face(WALL, -0.24, 0), on_face(WALL, 0.26, 0), on_face(-WALL, 0.26, 0)],
                               [on_face(-WALL, -0.24, -0.25), on_face(WALL, -0.24, -0.25), on_face(WALL, 0.26, -0.25), on_face(-WALL, 0.26, -0.25)]], M['panel']))

# The glare shield: from a padded roll over the top of the panel forward to the foot of the windscreen, matt black, so
# nothing shines in the glass.
gtop = on_face(0, 0.26, 0.02)
GR = -1.06
ck.append(slab('glare', [[(-WALL, 0.815, GR), (WALL, 0.815, GR), (WALL, 0.865, GR), (-WALL, 0.865, GR)],
                         [(-0.6, 0.86, -1.83), (0.6, 0.86, -1.83), (0.6, 0.9, -1.83), (-0.6, 0.9, -1.83)]], M['glare']))
ck.append(K.cyl('glare-pad', (-WALL + 0.005, 0.84, GR + 0.004), (WALL - 0.005, 0.84, GR + 0.004), 0.028, 0.028, M['pad'], segs=10))
# The windscreen's demist vent along the far edge of the glare shield.
gs = Surf((0, 0.9, -1.77), (1, 0, 0), (0, 0.05, -1))
ck.append(gs.box('demist', 0, 0, 0.9, 0.05, 0.006, M['bezel']))
ck.append(gs.box('demist-slot', 0, 0, 0.86, 0.026, 0.007, M['knob']))

# The head-up display: its projector sunk in the glare shield, the combiner glass on two thin posts and nothing else, so
# it does not box in the view.
HUDY, HUDZ = gtop[1] + 0.15, gtop[2] - 0.1
ck.append(obox('hud-projector', (0, 0.852, HUDZ + 0.01), (1, 0, 0), (0, 1, 0), (0.26, 0.04, 0.15), M['glare']))
ck.append(obox('hud-lens', (0, 0.8735, HUDZ + 0.01), (1, 0, 0), (0, 1, 0), (0.2, 0.004, 0.1), M['sensor']))
for s in (-1, 1):
    ck.append(K.cyl(f'hud-post-{s}', (s * 0.188, 0.866, HUDZ + 0.03), (s * 0.188, HUDY + 0.118, HUDZ - 0.024), 0.0055, 0.0045, M['bezel'], segs=6))
hud = quad('hud', (0, HUDY, HUDZ), (0.18, 0, 0), (0, 0.12, -0.025), M['hudGlass'])
empty('hud-centre', (0, HUDY, HUDZ))

# The caution strip along the top of the panel, under the glare shield: master caution and master warning at its ends,
# annunciators (most out, the ones that say all is well lit green), and the up-front display in the middle.
CY = 0.168
for x, w, text, style in ((-0.505, 0.07, 'MASTER\nCAUTION', 'tile'), (-0.43, 0.054, 'FUEL LO', 'tile'), (-0.37, 0.054, 'RCS LO', 'tile'),
                          (-0.31, 0.054, 'HOT', 'tile'), (-0.25, 0.054, 'CABIN P', 'tile'), (-0.19, 0.054, 'O2 LO', 'tile'),
                          (0.19, 0.054, 'DATA LINK', 'green'), (0.25, 0.054, 'IFF', 'green'), (0.31, 0.054, 'DRIVE', 'green'),
                          (0.37, 0.054, 'G LIM', 'tile'), (0.43, 0.054, 'FIRE', 'tile'), (0.505, 0.07, 'MASTER\nWARNING', 'tile')):
    big = w > 0.06
    ck.append(FACE.box(f'tile-{x}', x, CY, w, 0.034 if big else 0.03, 0.008 if big else 0.006, M['knob']))
    if big:  # the master lights' rims: amber for caution, red for warning
        ck.append(FACE.box(f'tile-rim-{x}', x, CY, w + 0.008, 0.042, 0.004, M['hazard'] if x < 0 else M['guard']))
    placard(text, style, FACE.p(x, CY, 0.0085 if big else 0.0065), FACE.ax, FACE.ay, 0.0105, maxw=w - 0.01)
ck.append(FACE.box('ufc', 0, CY, 0.25, 0.038, 0.008, M['knob']))
placard('CVS-1   NAV   CH 02', 'green', FACE.p(0, CY, 0.0085), FACE.ax, FACE.ay, 0.017, maxw=0.23)

# Three screens with their bezels, the left and right ones turned a little toward the pilot. Each bezel stands proud of
# its glass, with a row of push buttons along every side and the brightness and contrast rockers at its top corners.
screens = []
for name, x, yaw, mat in (('mfd_l', -0.31, 0.25, M['screenL']), ('mfd_c', 0.0, 0.0, M['screenC']), ('mfd_r', 0.31, -0.25, M['screenR'])):
    out = 0.012 + 0.11 * abs(math.sin(yaw))  # a turned screen stands off the face, so its back edge stays clear of it
    c = on_face(x, -0.02, out)
    uu = (math.cos(yaw) * 0.1, 0, math.sin(yaw) * 0.1)
    vv = (0, v[1] * 0.1, v[2] * 0.1)
    screens.append(quad(name, c, uu, vv, mat))
    S = Surf(c, uu, vv)
    ck.append(S.box(f'{name}-body', 0, 0, 0.29, 0.29, out + 0.045, M['bezel'], out=-(out + 0.047)))
    E, Wd = 0.1245, 0.041  # the lip round the glass: its centre line, its width (inner edge 4 mm clear of the screen)
    for i, (bx, by, bw, bd) in enumerate(((0, E, 0.29, Wd), (0, -E, 0.29, Wd), (E, 0, Wd, 0.208), (-E, 0, Wd, 0.208))):
        ck.append(S.box(f'{name}-lip-{i}', bx, by, bw, bd, 0.005, M['bezel'], out=-0.002))
    for k in range(5):
        for sd in (-1, 1):
            ck.append(S.box(f'{name}-osb-{k}-{sd}', sd * E, -0.08 + k * 0.04, 0.016, 0.018, 0.006, M['button'], out=0.003))
    for k in range(4):
        for sd in (-1, 1):
            ck.append(S.box(f'{name}-osbh-{k}-{sd}', -0.06 + k * 0.04, sd * E, 0.018, 0.016, 0.006, M['button'], out=0.003))
    for sd in (-1, 1):
        ck.append(S.box(f'{name}-rocker-{sd}', sd * E, E, 0.024, 0.012, 0.007, M['knob'], out=0.003))

# A row of lamps along the bottom of the panel.
for k, (mat, text) in enumerate(((M['lampG'], 'GEN'), (M['lampA'], 'PUMP'), (M['button'], 'BUS'), (M['lampG'], 'COOL'), (M['button'], 'RAD'),
                                 (M['lampR'], 'HOT'), (M['button'], 'ECS'), (M['lampG'], 'LINK'), (M['lampA'], 'MAG'))):
    x = -0.32 + k * 0.08
    ck.append(FACE.box(f'lamp-{k}', x, -0.188, 0.022, 0.012, 0.006, mat))
    placard(text, 'panel', FACE.p(x, -0.207, 0.0008), FACE.ax, FACE.ay, 0.0095)

# The panel's outer columns: the g meter and the gear handle on the left, the standby horizon, the clock and the screens'
# switches on the right.
P = plate(FACE, 'col-l', -0.512, -0.04, 0.096, 0.36)
dial(P, 'g-meter', 0, 0.115, 0.03)
placard('G', 'plate', P.p(0, 0.067, 0.0005), P.ax, P.ay, 0.011)
ck.append(P.box('gear-slot', 0, -0.02, 0.016, 0.09, 0.004, M['knob']))
gb, gt = Vector(P.p(0, -0.04, 0.004)), Vector(P.p(0, -0.025, 0.06))
ck.append(K.cyl('gear-lever', tuple(gb), tuple(gt), 0.005, 0.005, M['switch'], segs=6))
ck.append(K.cyl('gear-wheel', tuple(gt - P.ax * 0.009), tuple(gt + P.ax * 0.009), 0.018, 0.018, M['switch'], segs=12))
placard('GEAR', 'plate', P.p(0, -0.085, 0.0005), P.ax, P.ay, 0.012)
toggle(P, 'magclamp', 0, -0.135, 'MAG LOCK')
P = plate(FACE, 'col-r', 0.512, -0.04, 0.096, 0.36)
dial(P, 'stby-adi', 0, 0.115, 0.032, horizon=True)
placard('STBY', 'plate', P.p(0, 0.067, 0.0005), P.ax, P.ay, 0.011)
ck.append(P.box('clock', 0, 0.03, 0.074, 0.026, 0.004, M['knob']))
placard('T+ 00:42', 'green', P.p(0, 0.03, 0.0045), P.ax, P.ay, 0.014, maxw=0.066)
toggle(P, 'hud-pwr', -0.022, -0.04, 'HUD')
toggle(P, 'mfd-pwr', 0.022, -0.04, 'MFD')
knob(P, 'brt', 0, -0.115, 0.012, 'BRT')

# The pedestal under the panel, between your shins.
ck.append(K.box('pedestal', (0, (FLOOR + 0.37) / 2, -1.02), (0.15, 0.37 - FLOOR, 0.17), M['panel']))
PD = Surf((0, 0, -0.934), (1, 0, 0), (0, 1, 0))
knob(PD, 'decoy', 0, 0.28, 0.013, 'DECOY', 'panel')
toggle(PD, 'flare', 0, 0.19, 'FLARE', 'panel')

# The side consoles: elbow height, a padded roll along the inboard edge, the top tiled with sub-panels.
CT = 0.40
for s in (-1, 1):
    ck.append(K.box(f'console-{s}', (s * (0.33 + WALL) / 2, (FLOOR + CT) / 2, -0.24), (WALL - 0.33, CT - FLOOR, 1.24), M['panel']))
    ck.append(K.cyl(f'console-pad-{s}', (s * 0.338, CT - 0.004, -0.86), (s * 0.338, CT - 0.004, 0.38), 0.017, 0.017, M['pad'], segs=8))
def console(s, z0, z1, name, title):
    S = Surf((s * 0.4475, CT, 0), (1, 0, 0), (0, 0, -1))
    return plate(S, name, 0, -(z0 + z1) / 2, 0.21, z1 - z0 - 0.006, title)

# Left: lights, the throttle, fuel and jets, the radio.
P = console(-1, -0.86, -0.64, 'c-lights', 'LIGHTS')
knob(P, 'flood', -0.06, 0.035, label='FLOOD')
knob(P, 'inst', -0.01, 0.035, label='INST')
toggle(P, 'nav', 0.04, 0.035, 'NAV')
toggle(P, 'strobe-sw', 0.08, 0.035, 'STROBE')
toggle(P, 'dome', -0.06, -0.045, 'DOME')
toggle(P, 'form', -0.02, -0.045, 'FORM')
knob(P, 'panel-lt', 0.05, -0.045, label='PANEL')
P = console(-1, -0.64, -0.2, 'c-drive', 'DRIVE')
guarded(P, 'drive-arm', -0.055, 0.13, 'ARM', up=True)
toggle(P, 'main', -0.055, 0.06, 'MAIN')
toggle(P, 'pump', -0.055, 0.0, 'PUMP')
toggle(P, 'ign', -0.055, -0.06, 'IGN')
knob(P, 'trim', -0.055, -0.13, 0.01, 'TRIM')
# The throttle: a quadrant along the inboard edge, the lever in its slot, the grip with its thumb buttons.
ck.append(P.box('throttle-box', 0.05, 0, 0.085, 0.36, 0.045, M['panel'], bevel=0.006))
ck.append(P.box('throttle-slot', 0.05, 0, 0.014, 0.3, 0.002, M['knob'], out=0.045))
for yy, text in ((-0.155, 'OFF'), (-0.06, 'IDLE'), (0.06, 'FULL'), (0.155, 'HARD')):
    ck.append(P.box(f'detent-{text}', 0.05, yy, 0.03, 0.003, 0.001, M['switch'], out=0.045))
    placard(text, 'plate', P.p(-0.012, yy, 0.0005), P.ax, P.ay, 0.009)
ck.append(K.cyl('throttle-arm', P.p(0.05, -0.01, 0.045), P.p(0.066, -0.004, 0.11), 0.009, 0.008, M['switch'], segs=8))
tg = Vector(P.p(0.07, 0.0, 0.14))
ck.append(obox('throttle-grip', tuple(tg), P.ax, P.an, (0.055, 0.07, 0.105), M['knob'], bevel=0.014))
ck.append(K.cyl('throttle-hat', tuple(tg + P.an * 0.034 + P.ay * 0.03), tuple(tg + P.an * 0.044 + P.ay * 0.03), 0.007, 0.006, M['switch'], segs=8))
ck.append(K.cyl('throttle-btn', tuple(tg + P.ax * 0.026), tuple(tg + P.ax * 0.033), 0.007, 0.007, M['guard'], segs=8))
ck.append(K.cyl('throttle-btn2', tuple(tg + P.ax * 0.026 + P.ay * 0.03 + P.an * 0.01), tuple(tg + P.ax * 0.032 + P.ay * 0.03 + P.an * 0.01), 0.005, 0.005, M['switch'], segs=6))
P = console(-1, -0.2, 0.08, 'c-fuel', 'FUEL / RCS')
for i, t in enumerate(('RCS A', 'RCS B', 'XFEED')):
    toggle(P, f'fuel-a-{i}', -0.06 + i * 0.06, 0.055, t)
for i, t in enumerate(('TANK L', 'TANK R', 'VENT')):
    toggle(P, f'fuel-b-{i}', -0.06 + i * 0.06, -0.02, t)
knob(P, 'bal', -0.04, -0.09, 0.011, 'BAL')
lamp(P, 'fuel-low', 0.04, -0.09, M['lampA'], 'LOW')
P = console(-1, 0.08, 0.38, 'c-comm', 'COMM')
ck.append(P.box('comm-lcd', 0, 0.065, 0.13, 0.03, 0.004, M['knob']))
placard('CH 02  CVS-1', 'green', P.p(0, 0.065, 0.0045), P.ax, P.ay, 0.015, maxw=0.12)
for i, t in enumerate(('VOL', 'CHAN', 'SQL')):
    knob(P, f'comm-{i}', -0.06 + i * 0.06, -0.01, 0.011, t)
toggle(P, 'mic', -0.04, -0.09, 'MIC')
toggle(P, 'xmit', 0.04, -0.09, 'XMIT')

# Right: sensors, armament, air and oxygen, power.
P = console(1, -0.86, -0.6, 'c-sens', 'SENSORS')
knob(P, 'gain', -0.06, 0.04, label='GAIN')
knob(P, 'range', 0.0, 0.04, label='RANGE')
toggle(P, 'radar', 0.06, 0.04, 'RADAR')
toggle(P, 'lidar', -0.06, -0.05, 'LIDAR')
toggle(P, 'ir', 0.0, -0.05, 'IR')
lamp(P, 'link-l', 0.06, -0.05, M['lampG'], 'LINK')
P = console(1, -0.6, -0.3, 'c-arm', 'ARMAMENT')
guarded(P, 'master-arm', -0.055, 0.035, 'MASTER ARM', up=True, mat=M['hazard'])
toggle(P, 'gun-sw', 0.015, 0.035, 'GUN')
toggle(P, 'msl-sw', 0.065, 0.035, 'MSL')
knob(P, 'mode', -0.055, -0.06, 0.012, 'MODE')
guarded(P, 'jett', 0.015, -0.06, 'JETT')
lamp(P, 'arm-l', 0.07, -0.06, M['lampA'], 'ARM')
P = console(1, -0.3, 0.02, 'c-ecs', 'ECS / O2')
knob(P, 'temp', -0.06, 0.06, label='TEMP')
knob(P, 'flow', 0.0, 0.06, label='FLOW')
toggle(P, 'defog', 0.06, 0.06, 'DEFOG')
toggle(P, 'o2', -0.06, -0.03, 'O2')
toggle(P, 'suit-sw', -0.02, -0.03, 'SUIT')
toggle(P, 'vent', 0.02, -0.03, 'VENT')
lamp(P, 'o2-ok', 0.065, -0.03, M['lampG'], 'O2 OK')
toggle(P, 'press', -0.04, -0.1, 'PRESS')
toggle(P, 'dump', 0.04, -0.1, 'DUMP')
P = console(1, 0.02, 0.38, 'c-pwr', 'POWER')
for i, t in enumerate(('BATT', 'GEN 1', 'GEN 2', 'BUS TIE')):
    toggle(P, f'pwr-{i}', -0.066 + i * 0.044, 0.08, t)
for i, m in enumerate((M['lampG'], M['lampG'], M['lampG'], M['button'])):
    lamp(P, f'pwr-lamp-{i}', -0.066 + i * 0.044, 0.025, m)
guarded(P, 'emer-pwr', -0.04, -0.07, 'EMER PWR')
knob(P, 'inv', 0.05, -0.07, 0.011, 'INV')

# The walls above the consoles. Left: the canopy's lever and its jettison handle, a grab rail, quilted padding. Right: the
# circuit breakers, the data case, a grab rail, padding.
LW = Surf((-WALL, 0, 0), (0, 0, -1), (0, 1, 0))
RW = Surf((WALL, 0, 0), (0, 0, 1), (0, 1, 0))
P = plate(LW, 'canopy-panel', 0.71, 0.62, 0.25, 0.24, 'CANOPY')
ck.append(P.box('jett-base', 0.05, 0.0, 0.06, 0.03, 0.01, M['knob']))
ck.append(K.cyl('jett-stem', P.p(0.05, 0.0, 0.01), P.p(0.05, 0.0, 0.035), 0.006, 0.006, M['knob'], segs=6))
for i in range(6):
    ck.append(P.box(f'jett-bar-{i}', 0.02 + i * 0.012, 0.0, 0.012, 0.016, 0.013, M['hazard'] if i % 2 == 0 else M['knob'], out=0.033))
placard('CANOPY JETT', 'warn', P.p(0.05, -0.04, 0.0005), P.ax, P.ay, 0.014)
lb, lt = P.p(-0.065, -0.06, 0.0), P.p(-0.065, 0.04, 0.05)
ck.append(P.box('canopy-lever-slot', -0.065, -0.01, 0.014, 0.13, 0.004, M['knob']))
ck.append(K.cyl('canopy-lever', lb, lt, 0.006, 0.006, M['switch'], segs=6))
ck.append(K.cyl('canopy-knob', lt, tuple(Vector(lt) + P.an * 0.02), 0.015, 0.013, M['knob'], segs=10))
placard('OPEN', 'plate', P.p(-0.065, 0.085, 0.0005), P.ax, P.ay, 0.011)
placard('CLOSE', 'plate', P.p(-0.065, -0.095, 0.0005), P.ax, P.ay, 0.011)
P = plate(RW, 'cb-panel', -0.66, 0.63, 0.32, 0.24, 'CIRCUIT BREAKERS')
for r_ in range(3):
    for i in range(8):
        x, y = -0.13 + i * 0.037, 0.04 - r_ * 0.05
        popped = (r_, i) == (1, 5)
        ck.append(K.cyl(f'cb-{r_}-{i}', P.p(x, y, 0), P.p(x, y, 0.018 if popped else 0.011), 0.0055, 0.0055, M['knob'], segs=6))
        if popped:  # one out, its white collar showing
            ck.append(K.cyl(f'cb-collar-{r_}-{i}', P.p(x, y, 0.0), P.p(x, y, 0.009), 0.006, 0.006, M['switch'], segs=6))
ck.append(RW.box('data-case', -0.27, 0.57, 0.26, 0.19, 0.04, M['pad']))
ck.append(RW.box('data-flap', -0.27, 0.66, 0.27, 0.06, 0.046, M['pad']))
ck.append(RW.box('data-tab', -0.27, 0.64, 0.03, 0.035, 0.05, M['harness']))
placard('CHECKLIST', 'pad', RW.p(-0.27, 0.54, 0.0405), RW.ax, RW.ay, 0.016)
for S, z0, z1 in ((LW, 0.45, 0.06), (RW, -0.43, -0.07)):  # grab rails (wall x runs along -z on the left, +z on the right)
    a, b = S.p(z0, 0.765, 0.04), S.p(z1, 0.765, 0.04)
    ck.append(K.cyl(f'rail-{z0}', a, b, 0.011, 0.011, M['knob'], segs=8))
    for e in (z0, z1):
        ck.append(K.cyl(f'rail-leg-{z0}-{e}', S.p(e, 0.765, 0), S.p(e, 0.765, 0.04), 0.009, 0.009, M['knob'], segs=6))
for S, xs in ((LW, [0.4 - i * 0.106 for i in range(7)]), (RW, [0.04 + i * 0.106 for i in range(3)])):
    for i, x in enumerate(xs):
        for j in range(3):
            ck.append(S.box(f'quilt-{S.an.x}-{i}-{j}', x, 0.49 + j * 0.08, 0.1, 0.074, 0.016, M['cushion']))

# The seat: pan, back, headrest, the harness, and the yellow-and-black ejection handles (between the knees and at its
# sides).
SZ = 0.2
ck.append(K.box('seat-pan', (0, 0.02, SZ - 0.25), (0.48, 0.12, 0.5), M['seat'], bevel=0.02))
ck.append(K.box('seat-cushion', (0, 0.1, SZ - 0.25), (0.42, 0.05, 0.44), M['cushion']))
ck.append(slab('seat-back', [[(-0.24, 0.05, SZ + 0.02), (0.24, 0.05, SZ + 0.02), (0.24, 0.05, SZ + 0.14), (-0.24, 0.05, SZ + 0.14)],
                              [(-0.24, 0.88, SZ + 0.18), (0.24, 0.88, SZ + 0.18), (0.24, 0.88, SZ + 0.3), (-0.24, 0.88, SZ + 0.3)]], M['seat']))
ck.append(K.box('headrest', (0, 1.0, SZ + 0.24), (0.3, 0.26, 0.14), M['seat'], bevel=0.03))
for i in range(8):
    ck.append(K.box(f'eject-{i}', (-0.07 + i * 0.02, 0.075, SZ - 0.52), (0.02, 0.024, 0.024), M['hazard'] if i % 2 == 0 else M['dark']))
for s in (-1, 1):
    ck.append(K.box(f'seat-rail-{s}', (s * 0.27, 0.45, SZ + 0.2), (0.04, 0.9, 0.06), M['trim']))
    ck.append(K.box(f'strap-{s}', (s * 0.12, 0.7, SZ + 0.05), (0.05, 0.4, 0.02), M['harness']))
    for i in range(6):
        ck.append(K.box(f'eject-side-{s}-{i}', (s * 0.262, 0.12, SZ - 0.46 + i * 0.026), (0.024, 0.024, 0.026), M['hazard'] if i % 2 == 0 else M['dark']))

# Your legs, in the flight suit, boots on the pedals; a kneeboard strapped to the left thigh. Their own object, `legs`,
# which the game draws only when you are in the seat: a parked fighter's seat is empty. (There is no outside pilot.)
lg = []
LEG_LABELS = set()  # indices into LABELS that ride on the legs (the kneeboard's card)
for s in (-1, 1):
    hip, knee, ankle = Vector((s * 0.11, 0.21, 0.06)), Vector((s * 0.15, 0.36, -0.56)), Vector((s * 0.2, -0.06, -1.1))
    lg.append(smooth(K.cyl(f'thigh-{s}', tuple(hip), tuple(knee), 0.088, 0.066, M['suit'], segs=10, cap=False)))
    lg.append(smooth(solid(K.lathe(f'knee-{s}', [(0, 0.03), (0.2, 0.058), (0.5, 0.07), (0.8, 0.058), (1, 0.03)], tuple(knee - Vector((0.07, 0, 0))), tuple(knee + Vector((0.07, 0, 0))), M['suit'], segs=10), 0.004)))
    lg.append(smooth(K.cyl(f'shin-{s}', tuple(knee), tuple(ankle), 0.064, 0.05, M['suit'], segs=10, cap=False)))
    up = Vector((0, 1, 0.3)).normalized()
    bc = ankle + Vector((0, -0.05, -0.08))
    lg.append(obox(f'boot-{s}', tuple(bc), (1, 0, 0), up, (0.1, 0.11, 0.28), M['pad'], bevel=0.018))
    lg.append(K.cyl(f'cuff-{s}', tuple(ankle + Vector((0, -0.02, 0))), tuple(ankle + Vector((0, 0.06, -0.02))), 0.058, 0.056, M['pad'], segs=10))
    ck.append(obox(f'pedal-{s}', tuple(bc - up * 0.064), (1, 0, 0), up, (0.12, 0.014, 0.3), M['trim']))
    if s < 0:
        d = (knee - hip).normalized()
        ay = (d - d.dot(Vector((1, 0, 0))) * Vector((1, 0, 0))).normalized()
        nrm = Vector((1, 0, 0)).cross(ay)
        t = 0.6
        c = hip + (knee - hip) * t + nrm * (0.088 + (0.066 - 0.088) * t + 0.004)
        lg.append(obox('kneeboard', tuple(c), (1, 0, 0), ay, (0.13, 0.18, 0.006), M['knob']))
        lg.append(obox('kneeboard-clip', tuple(c + ay * 0.082 + nrm * 0.005), (1, 0, 0), ay, (0.06, 0.016, 0.008), M['switch']))
        LEG_LABELS.add(len(LABELS))
        placard('CVS-1 RECOVERY\nCASE I    CH 02\nLANE 4 M/S  4 KM\nJOKER 30  BINGO 15', 'paper', tuple(c + nrm * 0.0032 - ay * 0.012), (1, 0, 0), ay, 0.02, maxw=0.115)
        for k_, tt in enumerate((0.42, 0.8)):
            p = hip + (knee - hip) * tt
            r_ = 0.088 + (0.066 - 0.088) * tt + 0.003
            lg.append(K.cyl(f'kb-strap-{k_}', tuple(p - d * 0.012), tuple(p + d * 0.012), r_, r_, M['knob'], segs=10))

# The stick between your knees: a rubber boot, the shaft, and a grip with its hat switch, trigger and red button.
ck.append(K.cyl('stick-boot-0', (0, FLOOR + 0.02, -0.6), (0, FLOOR + 0.07, -0.6), 0.085, 0.065, M['pad'], segs=10))
ck.append(K.cyl('stick-boot-1', (0, FLOOR + 0.07, -0.6), (0, FLOOR + 0.12, -0.596), 0.065, 0.045, M['pad'], segs=10))
ck.append(K.cyl('stick-boot-2', (0, FLOOR + 0.12, -0.596), (0, FLOOR + 0.18, -0.59), 0.045, 0.026, M['pad'], segs=10))
ck.append(K.cyl('stick', (0, FLOOR + 0.1, -0.596), (0, 0.345, -0.53), 0.015, 0.013, M['trim'], segs=8))
sy = Vector((0, 1, 0.25)).normalized()
sg = Vector((0, 0.405, -0.515))
ck.append(obox('stick-grip', tuple(sg), (1, 0, 0), sy, (0.042, 0.13, 0.05), M['knob'], bevel=0.012))
ck.append(K.cyl('stick-hat', tuple(sg + sy * 0.064 + Vector((0, 0, 0.008))), tuple(sg + sy * 0.074 + Vector((0, 0, 0.008))), 0.007, 0.006, M['switch'], segs=8))
ck.append(K.cyl('stick-pickle', tuple(sg + sy * 0.058 + Vector((-0.012, 0, -0.016))), tuple(sg + sy * 0.068 + Vector((-0.012, 0, -0.016))), 0.006, 0.006, M['guard'], segs=8))
ck.append(obox('stick-trigger', tuple(sg + sy * 0.03 + Vector((0, 0, -0.032))), (1, 0, 0), sy, (0.012, 0.03, 0.012), M['switch']))

cockpit = K.join(ck, 'cockpit')
lab = labels()
cockpit_labels = K.join([o for i, o in enumerate(lab) if i not in LEG_LABELS], 'cockpit-labels')
legs = K.join(lg + [lab[i] for i in sorted(LEG_LABELS)], 'legs')


empty('eye', EYE)
for s, nm in ((-1, 'decal_l'), (1, 'decal_r')):
    empty(nm, (s * 0.99, 0.0, -2.9))

body = K.join(parts, 'body')
kb = K.export(OUT, blend)
print(f'fighter.glb: {kb} KB')
