# Slims a Rocketbox person's GLB for the carrier's wardrobe: keeps only the primitives whose material is named in
# --keep (by suffix: body, head, opacity), drops the images nothing then uses, and shrinks the rest with macOS `sips`
# (colour maps to --colour px, normal maps to --normal px, re-encoded as JPEG). Bones, skin and UVs are untouched.
#
#   python3 tools/slim-person.py IN.glb OUT.glb [--keep body,head] [--colour 1024] [--normal 512]
#
# Used for assets/people/Military_*.glb (from Microsoft Rocketbox, MIT, as converted for the Lab Rat game), whose
# helmet, webbing and knife the crew don't wear: the carrier borrows only their clothes (outfits.mjs).

import json, struct, subprocess, sys, tempfile, os, argparse

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--keep', default='body,head,opacity')
ap.add_argument('--colour', type=int, default=1024)
ap.add_argument('--normal', type=int, default=512)
a = ap.parse_args()
keep = a.keep.split(',')

raw = open(a.src, 'rb').read()
jl = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jl])
bin_off = 20 + jl + 8
BIN = raw[bin_off:bin_off + struct.unpack('<I', raw[20 + jl:24 + jl])[0]]

def kept_material(i):
    return any(J['materials'][i].get('name', '').endswith('_' + k) for k in keep)

for m in J['meshes']:
    m['primitives'] = [p for p in m['primitives'] if kept_material(p.get('material', -1))]

# What is still used: materials → textures → images → buffer views; accessors from the primitives and skins.
used_mat = sorted({p['material'] for m in J['meshes'] for p in m['primitives']})
mat_map = {o: n for n, o in enumerate(used_mat)}
J['materials'] = [J['materials'][i] for i in used_mat]
for m in J['meshes']:
    for p in m['primitives']:
        p['material'] = mat_map[p['material']]

def tex_refs(obj, out):
    if isinstance(obj, dict):
        if 'index' in obj and len(obj) <= 3 and isinstance(obj['index'], int):
            out.append(obj)
        for v in obj.values():
            tex_refs(v, out)
    elif isinstance(obj, list):
        for v in obj:
            tex_refs(v, out)
refs = []
tex_refs(J['materials'], refs)
used_tex = sorted({r['index'] for r in refs})
tex_map = {o: n for n, o in enumerate(used_tex)}
for r in refs:
    r['index'] = tex_map[r['index']]
J['textures'] = [J['textures'][i] for i in used_tex]
used_img = sorted({t['source'] for t in J['textures']})
img_map = {o: n for n, o in enumerate(used_img)}
for t in J['textures']:
    t['source'] = img_map[t['source']]
normal_imgs = set()
for m in J['materials']:
    if 'normalTexture' in m:
        normal_imgs.add(J['textures'][m['normalTexture']['index']]['source'])
J['images'] = [J['images'][i] for i in used_img]

acc = set()
for m in J['meshes']:
    for p in m['primitives']:
        acc.update(p['attributes'].values())
        if 'indices' in p: acc.add(p['indices'])
        for t in p.get('targets', []): acc.update(t.values())
for s in J.get('skins', []):
    if 'inverseBindMatrices' in s: acc.add(s['inverseBindMatrices'])
for an in J.get('animations', []):
    for sm in an['samplers']: acc.update([sm['input'], sm['output']])
acc = sorted(acc)
acc_map = {o: n for n, o in enumerate(acc)}
J['accessors'] = [J['accessors'][i] for i in acc]
def remap_acc(d):
    for k in list(d): d[k] = acc_map[d[k]]
for m in J['meshes']:
    for p in m['primitives']:
        remap_acc(p['attributes'])
        if 'indices' in p: p['indices'] = acc_map[p['indices']]
        for t in p.get('targets', []): remap_acc(t)
for s in J.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
for an in J.get('animations', []):
    for sm in an['samplers']: sm['input'], sm['output'] = acc_map[sm['input']], acc_map[sm['output']]

# Rebuild the binary: each surviving accessor's view, then each image (shrunk).
views = J['bufferViews']
out = bytearray(); new_views = []; view_map = {}
def put(data, extra):
    while len(out) % 4: out.append(0)
    v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}; v.update(extra)
    out.extend(data); new_views.append(v); return len(new_views) - 1
for ac in J['accessors']:
    o = ac['bufferView']
    if o not in view_map:
        v = views[o]; s = v.get('byteOffset', 0)
        view_map[o] = put(BIN[s:s + v['byteLength']], {k: v[k] for k in ('byteStride', 'target') if k in v})
    ac['bufferView'] = view_map[o]
tmp = tempfile.mkdtemp()
for n, im in enumerate(J['images']):
    v = views[im['bufferView']]; s = v.get('byteOffset', 0)
    data = BIN[s:s + v['byteLength']]
    size = a.normal if n in normal_imgs else a.colour
    ext = '.png' if im.get('mimeType') == 'image/png' else '.jpg'
    p_in = os.path.join(tmp, f'{n}{ext}'); p_out = os.path.join(tmp, f'{n}-out.jpg')
    open(p_in, 'wb').write(data)
    subprocess.run(['sips', '-Z', str(size), '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', p_in, '--out', p_out], check=True, capture_output=True)
    im['bufferView'] = put(open(p_out, 'rb').read(), {})
    im['mimeType'] = 'image/jpeg'
J['bufferViews'] = new_views
while len(out) % 4: out.append(0)
J['buffers'] = [{'byteLength': len(out)}]

js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(a.dst, 'wb').write(glb)
print(f'{a.src} → {a.dst}: {len(raw)} → {len(glb)} bytes, {len(J["images"])} images, materials {[m["name"] for m in J["materials"]]}')
