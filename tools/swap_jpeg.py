"""Re-encode every PNG image inside a GLB as JPEG (keeps all other buffer data)."""
import io, json, struct, sys
from PIL import Image

src, dst, quality = sys.argv[1], sys.argv[2], int(sys.argv[3])
raw = open(src, 'rb').read()
jlen = struct.unpack_from('<I', raw, 12)[0]
j = json.loads(raw[20:20 + jlen])
blen = struct.unpack_from('<I', raw, 20 + jlen)[0]
bin_ = raw[28 + jlen:28 + jlen + blen]

img_views = {}
for im in j['images']:
    if 'bufferView' in im:
        bv = j['bufferViews'][im['bufferView']]
        o = bv.get('byteOffset', 0)
        pil = Image.open(io.BytesIO(bin_[o:o + bv['byteLength']])).convert('RGB')
        out = io.BytesIO(); pil.save(out, 'JPEG', quality=quality, optimize=True)
        img_views[im['bufferView']] = out.getvalue()
        im['mimeType'] = 'image/jpeg'

# rebuild the binary chunk view by view, 4-byte aligned
new = bytearray()
for i, bv in enumerate(j['bufferViews']):
    data = img_views.get(i)
    if data is None:
        o = bv.get('byteOffset', 0); data = bin_[o:o + bv['byteLength']]
    while len(new) % 4: new += b'\0'
    bv['byteOffset'] = len(new); bv['byteLength'] = len(data)
    new += data
while len(new) % 4: new += b'\0'
j['buffers'][0]['byteLength'] = len(new)
js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
total = 12 + 8 + len(js) + 8 + len(new)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(new), b'BIN\0')); f.write(new)
print(dst, total)
