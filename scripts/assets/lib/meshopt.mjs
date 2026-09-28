// EXT_meshopt_compression for a GLB held as { json, views } (lib/glb.mjs): lossless, per bufferView.
// Vertex attributes, morph targets, skin matrices and animation curves go through meshopt's ATTRIBUTES codec, triangle
// indices through TRIANGLES; images and anything shared or strided oddly stay as they are, and no JSON extension (VRM /
// VRMC_*) is touched: accessors, meshes and their indices keep their numbers. The coded views move to a fallback buffer
// with no data (extensionsRequired), so the file needs a loader with a meshopt decoder: GLTFLoader.setMeshoptDecoder.
// GitHub Pages serves .vrm / .vrma as octet-stream without gzip, so this is what shrinks them on the wire (~2x).
import { MeshoptEncoder } from 'meshoptimizer';

const EXT = 'EXT_meshopt_compression', NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }, BS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const pad4 = (n) => (n + 3) & ~3;

export const isMeshopt = (json) => (json.extensionsUsed || []).includes(EXT);

// returns a GLB Buffer, or null when the file is already coded or coding wouldn't make it at least 5% smaller (a .vrma is many tiny
// views: the per-view JSON outweighs the gain). The input is left as it was.
export async function meshoptGLB({ json, views }) {
  if (isMeshopt(json)) return null;
  await MeshoptEncoder.ready;
  const before = 28 + pad4(Buffer.byteLength(JSON.stringify(json))) + views.reduce((s, v) => s + pad4(v.length), 0);
  const j = JSON.parse(JSON.stringify(json)), byView = new Map(), idxViews = new Map(), imgViews = new Set((j.images || []).map((im) => im.bufferView).filter((v) => v != null));
  (j.accessors || []).forEach((a, i) => { if (a.bufferView != null) { if (!byView.has(a.bufferView)) byView.set(a.bufferView, []); byView.get(a.bufferView).push(a); } });
  for (const m of j.meshes || []) for (const p of m.primitives) if (p.indices != null) {
    const v = j.accessors[p.indices].bufferView, tri = (p.mode ?? 4) === 4;
    idxViews.set(v, (idxViews.get(v) ?? true) && tri);
  }
  // one coded payload per eligible view
  const coded = views.map((src, vi) => {
    const acc = byView.get(vi), bv = j.bufferViews[vi];
    if (imgViews.has(vi) || !acc || acc.length !== 1) return null;
    const a = acc[0]; if (a.sparse || (a.byteOffset || 0) !== 0) return null;
    const es = NC[a.type] * BS[a.componentType], stride = bv.byteStride || es;
    if (src.length < a.count * stride) return null;
    const data = new Uint8Array(src.buffer, src.byteOffset, a.count * stride).slice();
    try {
      if (idxViews.has(vi)) {
        if (stride !== 2 && stride !== 4) return null;
        const mode = idxViews.get(vi) && a.count % 3 === 0 ? 'TRIANGLES' : 'INDICES';
        return { mode, stride, count: a.count, raw: data.length, enc: MeshoptEncoder.encodeGltfBuffer(data, a.count, stride, mode) };
      }
      if (stride % 4 !== 0 || stride > 256) return null;
      return { mode: 'ATTRIBUTES', stride, count: a.count, raw: data.length, enc: MeshoptEncoder.encodeGltfBuffer(data, a.count, stride, 'ATTRIBUTES') };
    } catch (e) { return null; }
  });
  if (!coded.some(Boolean)) return null;
  // buffer 0 (the BIN chunk): plain views + coded payloads; buffer 1: the fallback, sized for the decoded views, no bytes
  let size = 0, fb = 0; const parts = [];
  views.forEach((v, vi) => {
    const bv = j.bufferViews[vi], c = coded[vi];
    if (!c) { bv.buffer = 0; bv.byteOffset = size; bv.byteLength = v.length; parts.push([size, v]); size = pad4(size + v.length); return; }
    const enc = Buffer.from(c.enc.buffer, c.enc.byteOffset, c.enc.byteLength);
    bv.buffer = 1; bv.byteOffset = fb; bv.byteLength = c.raw; fb = pad4(fb + c.raw);
    bv.extensions = Object.assign({}, bv.extensions, { [EXT]: { buffer: 0, byteOffset: size, byteLength: enc.length, byteStride: c.stride, count: c.count, mode: c.mode } });
    parts.push([size, enc]); size = pad4(size + enc.length);
  });
  j.buffers = [{ byteLength: size }, { byteLength: fb, extensions: { [EXT]: { fallback: true } } }];
  j.extensionsUsed = [...new Set([...(j.extensionsUsed || []), EXT])];
  j.extensionsRequired = [...new Set([...(j.extensionsRequired || []), EXT])];
  const bin = Buffer.alloc(size); for (const [o, v] of parts) v.copy(bin, o);
  const jb = Buffer.from(JSON.stringify(j), 'utf8'), jl = pad4(jb.length), out = Buffer.alloc(12 + 8 + jl + 8 + size);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jl, 12); out.writeUInt32LE(0x4e4f534a, 16); jb.copy(out, 20); out.fill(0x20, 20 + jb.length, 20 + jl);
  out.writeUInt32LE(size, 20 + jl); out.writeUInt32LE(0x004e4942, 24 + jl); bin.copy(out, 28 + jl);
  return out.length < before * 0.95 ? out : null;
}
