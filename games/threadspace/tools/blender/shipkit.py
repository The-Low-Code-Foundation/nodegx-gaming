# shipkit: helpers for building ship hulls and fittings in Blender, headless, from the game's own numbers.
#   import shipkit as K   (after sys.path.insert(0, <this folder>))
#
# Coordinates: every function here takes points in the GAME's frame (three.js: x starboard, y up, -z the bow), the
# frame the layout file uses. K.B(x, y, z) turns one into Blender's (x, -z, y); the glTF exporter's +Y-up turns it back,
# so a point in the layout lands at the same point in the game.
#
#   K.reset()                                     an empty scene
#   K.material(name, '#rrggbb', metal, rough, emit=None)   one-sided (back faces culled in the game)
#   K.loft(name, sections, mats, panel=8, relief=..., seed=1, caps=True)  the octagon loft ships.mjs uses, plated
#   K.box(name, centre, size, mat, bevel=0.0)    centre (x, y, z), size (w along x, h along y, d along z)
#   K.cyl(name, a, b, r1, r2, mat, segs=16)      a cylinder (or cone) from point a to point b
#   K.lathe(name, profile, a, b, mat, segs=24)   a surface of revolution: profile [(t 0..1 along a→b, radius)]
#   K.plane(name, centre, size, normal, mat)      a one-sided rectangle facing `normal` ('x', '-x', 'y', '-y', 'z', '-z')
#   K.cut(target, cutter)                         boolean difference, applied, cutter deleted
#   K.join(objs, name)                            one object
#   K.export(path)                                every object to a GLB
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def B(x, y, z):
    return Vector((x, -z, y))


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hexcol, metal=0.4, rough=0.55, emit=None, strength=2.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    rgb = [_lin(int(hexcol[i:i + 2], 16)) for i in (1, 3, 5)]
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        e = [_lin(int(emit[i:i + 2], 16)) for i in (1, 3, 5)]
        bsdf.inputs['Emission Color'].default_value = (*e, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m


def _object(bm, name, mats):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def _ring(s, counts):
    """An octagon section (ships.mjs `loft`) as points in the game frame, each of its 8 sides split into counts[k]."""
    a, b = s['w'] / 2, s['h'] / 2
    c = min(a, b) * s.get('c', 0.32)
    x, y = s.get('x', 0), s.get('y', 0)
    corners = [(a, b - c), (a - c, b), (-(a - c), b), (-a, b - c), (-a, -(b - c)), (-(a - c), -b), (a - c, -b), (a, -(b - c))]
    pts = []
    for k in range(8):
        p, q = corners[k], corners[(k + 1) % 8]
        n = counts[k]
        for i in range(n):
            t = i / n
            pts.append((x + p[0] + (q[0] - p[0]) * t, y + p[1] + (q[1] - p[1]) * t, s['z']))
    return pts


def _lerp_section(s0, s1, t):
    out = {}
    for k in ('z', 'w', 'h', 'y', 'x', 'c'):
        a, b = s0.get(k, 0 if k in ('x', 'y') else 0.32), s1.get(k, 0 if k in ('x', 'y') else 0.32)
        out[k] = a + (b - a) * t
    return out


def loft(name, sections, mats, panel=8.0, relief=0.45, seed=1, keep=None, caps=True, inset=0.45, depths=(0.3, -0.25, 0.5, -0.4),
         min_area=6, pick=None):
    """A plated hull: the octagon loft, cut into panels about `panel` metres square, a share (`relief`) of them inset and
    raised or sunk, each panel in one of `mats` (a few shades, so the plating reads). `keep(centre)` → False leaves a
    panel flat (round windows and openings). `caps=False` leaves the ends open: a band round a hull, not a slab through it.
    For a small ship, scale the plating down: `inset` (the seam), `depths` (how far a panel is raised or sunk) and
    `min_area` (smaller panels stay flat). `pick(centre, rnd)` → a material index chooses each panel's paint (two-tone)."""
    rnd = random.Random(seed)
    counts = [1] * 8
    for s in sections:
        a, b = s['w'] / 2, s['h'] / 2
        c = min(a, b) * s.get('c', 0.32)
        lens = [math.hypot(c, c), 2 * (a - c), math.hypot(c, c), 2 * (b - c)] * 2
        counts = [max(counts[k], max(1, round(lens[k] / panel))) for k in range(8)]
    rings_s = []
    for i in range(len(sections) - 1):
        s0, s1 = sections[i], sections[i + 1]
        n = max(1, round((s1['z'] - s0['z']) / panel))
        for j in range(n):
            rings_s.append(_lerp_section(s0, s1, j / n))
    rings_s.append(sections[-1])
    bm = bmesh.new()
    rings = [[bm.verts.new(B(*p)) for p in _ring(s, counts)] for s in rings_s]
    faces = []
    for i in range(len(rings) - 1):
        A, Bb = rings[i], rings[i + 1]
        n = len(A)
        for j in range(n):
            faces.append(bm.faces.new((A[j], A[(j + 1) % n], Bb[(j + 1) % n], Bb[j])))
    caps = [bm.faces.new(rings[0]), bm.faces.new(list(reversed(rings[-1])))] if caps else []
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in faces:
        f.material_index = pick(f.calc_center_median(), rnd) if pick else rnd.randrange(len(mats))
    chosen = [f for f in faces if rnd.random() < relief and (keep is None or keep(f.calc_center_median()))]
    for f in chosen:
        if f.calc_area() < min_area:
            continue
        bmesh.ops.inset_individual(bm, faces=[f], thickness=inset, depth=rnd.choice(depths))
    for f in caps:
        f.material_index = 0
    return _object(bm, name, mats)


def box(name, centre, size, mat, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    w, h, d = size
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    bmesh.ops.translate(bm, vec=B(*centre), verts=bm.verts)
    ob = _object(bm, name, [mat])
    if bevel:
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.limit_method = 'ANGLE'
        apply(ob)
    return ob


def cyl(name, a, b, r1, r2, mat, segs=16, cap=True):
    A, Bv = B(*a), B(*b)
    axis = Bv - A
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=axis.length)
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((A + Bv) / 2) @ rot, verts=bm.verts)
    return _object(bm, name, [mat])


def lathe(name, profile, a, b, mat, segs=24):
    """A bell, a dome, a dish: `profile` is [(t, r)] with t from 0 (at a) to 1 (at b). Open at both ends."""
    A, Bv = B(*a), B(*b)
    axis = Bv - A
    rot = Vector((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bm = bmesh.new()
    rings = []
    for t, r in profile:
        ring = []
        for i in range(segs):
            th = 2 * math.pi * i / segs
            ring.append(bm.verts.new(Vector((math.cos(th) * r, math.sin(th) * r, t * axis.length))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(A) @ rot, verts=bm.verts)
    return _object(bm, name, [mat])


def plane(name, centre, size, normal, mat):
    """A one-sided rectangle: `size` (u, v) across the plane, facing `normal` in the game frame."""
    u, v = size[0] / 2, size[1] / 2
    corners = {
        '-z': [(-u, -v, 0), (u, -v, 0), (u, v, 0), (-u, v, 0)],
        'z': [(u, -v, 0), (-u, -v, 0), (-u, v, 0), (u, v, 0)],
        'x': [(0, -v, -u), (0, -v, u), (0, v, u), (0, v, -u)],
        '-x': [(0, -v, u), (0, -v, -u), (0, v, -u), (0, v, u)],
        'y': [(-u, 0, -v), (-u, 0, v), (u, 0, v), (u, 0, -v)],
        '-y': [(-u, 0, v), (-u, 0, -v), (u, 0, -v), (u, 0, v)],
    }[normal]
    bm = bmesh.new()
    vs = [bm.verts.new(B(centre[0] + x, centre[1] + y, centre[2] + z)) for x, y, z in reversed(corners)]  # wound to face `normal`
    f = bm.faces.new(vs)
    ob = _object(bm, name, [mat])
    return ob


def apply(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def cut(target, cutter):
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    apply(target)
    bpy.data.objects.remove(cutter)


def join(objs, name):
    objs = [o for o in objs if o]
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def export(path, blend=None):
    if blend:
        os.makedirs(os.path.dirname(os.path.abspath(blend)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True,
                              export_animations=False, export_materials='EXPORT', use_selection=False)
    return os.path.getsize(path) // 1024
