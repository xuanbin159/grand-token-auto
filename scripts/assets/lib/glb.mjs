// Minimal GLB reader/writer that keeps every JSON extension untouched (VRM / VRMC_* survive).
// Buffer data is held per bufferView, so views can be replaced, dropped and re-packed freely.
import { readFileSync, writeFileSync } from 'node:fs';

export function readGLB(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + path);
  let off = 12, json = null, bin = Buffer.alloc(0);
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4), chunk = b.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  // detach bufferView bytes (buffer 0 = BIN chunk)
  const views = (json.bufferViews || []).map((bv) => Buffer.from(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)));
  return { json, views };
}

const pad4 = (n) => (n + 3) & ~3;

export function writeGLB(path, { json, views }) {
  // re-pack views into one buffer (4-byte aligned)
  let size = 0; const offs = views.map((v) => { const o = size; size = pad4(size + v.length); return o; });
  const bin = Buffer.alloc(size);
  views.forEach((v, i) => { v.copy(bin, offs[i]); const bv = json.bufferViews[i]; bv.buffer = 0; bv.byteOffset = offs[i]; bv.byteLength = v.length; });
  json.buffers = [{ byteLength: size }];
  const jb = Buffer.from(JSON.stringify(json), 'utf8'), jl = pad4(jb.length);
  const out = Buffer.alloc(12 + 8 + jl + (size ? 8 + size : 0));
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jl, 12); out.writeUInt32LE(0x4e4f534a, 16); jb.copy(out, 20); out.fill(0x20, 20 + jb.length, 20 + jl);
  if (size) { out.writeUInt32LE(size, 20 + jl); out.writeUInt32LE(0x004e4942, 24 + jl); bin.copy(out, 28 + jl); }
  writeFileSync(path, out);
  return out.length;
}

// Typed view of an accessor (tightly packed views only; VRoid/Blender exports have no byteStride).
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function accessorArray(g, ai) {
  const a = g.json.accessors[ai], v = g.views[a.bufferView], T = CT[a.componentType];
  const bv = g.json.bufferViews[a.bufferView];
  if (bv.byteStride && bv.byteStride !== T.BYTES_PER_ELEMENT * NC[a.type]) throw new Error('strided accessor ' + ai);
  const n = a.count * NC[a.type], start = a.byteOffset || 0;
  const copy = Buffer.from(v.subarray(start, start + n * T.BYTES_PER_ELEMENT));
  return new T(copy.buffer, copy.byteOffset, n);
}
export const itemSize = (a) => NC[a.type];

// Add an accessor with its own bufferView; returns accessor index.
export function addAccessor(g, arr, type, extra = {}) {
  const ct = Object.entries(CT).find(([, T]) => arr instanceof T)[0];
  const bvi = g.json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: arr.byteLength, ...(extra.target ? { target: extra.target } : {}) }) - 1;
  g.views.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  const acc = { bufferView: bvi, componentType: +ct, count: arr.length / NC[type], type };
  if (extra.minmax) { const k = NC[type]; acc.min = []; acc.max = []; for (let c = 0; c < k; c++) { let lo = Infinity, hi = -Infinity; for (let i = c; i < arr.length; i += k) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } acc.min.push(lo); acc.max.push(hi); } }
  return g.json.accessors.push(acc) - 1;
}

// Drop accessors / bufferViews nothing references any more and renumber. Only core glTF refs
// (meshes, skins, animations, images) point at accessors/views; extensions here never do.
export function compact(g) {
  const j = g.json, usedA = new Set();
  for (const m of j.meshes || []) for (const p of m.primitives) {
    Object.values(p.attributes).forEach((a) => usedA.add(a)); if (p.indices != null) usedA.add(p.indices);
    for (const t of p.targets || []) Object.values(t).forEach((a) => usedA.add(a));
  }
  for (const s of j.skins || []) if (s.inverseBindMatrices != null) usedA.add(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { usedA.add(s.input); usedA.add(s.output); }
  const amap = new Map(), acc = [];
  (j.accessors || []).forEach((a, i) => { if (usedA.has(i)) { amap.set(i, acc.length); acc.push(a); } });
  const remapA = (i) => amap.get(i);
  for (const m of j.meshes || []) for (const p of m.primitives) {
    for (const k in p.attributes) p.attributes[k] = remapA(p.attributes[k]);
    if (p.indices != null) p.indices = remapA(p.indices);
    for (const t of p.targets || []) for (const k in t) t[k] = remapA(t[k]);
  }
  for (const s of j.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = remapA(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { s.input = remapA(s.input); s.output = remapA(s.output); }
  j.accessors = acc;
  const usedV = new Set(acc.map((a) => a.bufferView).filter((v) => v != null));
  for (const im of j.images || []) if (im.bufferView != null) usedV.add(im.bufferView);
  const vmap = new Map(), bvs = [], views = [];
  j.bufferViews.forEach((bv, i) => { if (usedV.has(i)) { vmap.set(i, bvs.length); bvs.push(bv); views.push(g.views[i]); } });
  for (const a of acc) if (a.bufferView != null) a.bufferView = vmap.get(a.bufferView);
  for (const im of j.images || []) if (im.bufferView != null) im.bufferView = vmap.get(im.bufferView);
  j.bufferViews = bvs; g.views = views;
  return g;
}

export function triCount(j) {
  let t = 0; for (const m of j.meshes || []) for (const p of m.primitives) if ((p.mode ?? 4) === 4) t += (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3;
  return t;
}
