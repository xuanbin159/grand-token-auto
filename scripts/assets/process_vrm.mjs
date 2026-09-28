// VRM (0.x) optimiser that never touches the VRM extension data:
//  - merges primitives that share vertex data + material (VRoid hair: ~100 draws -> 1-3)
//  - strips the embedded thumbnail (-> 64 px), resizes textures and re-encodes them as WebP
//    inside the GLB (EXT_texture_webp; GLTFLoader handles it natively)
//  - phone tier (lo/): 512 px textures, 256 px normal maps, no morph-target normals
//  - geometry meshopt-coded last (lib/meshopt.mjs, lossless EXT_meshopt_compression: ~2x smaller; .vrm isn't gzipped on Pages)
// Geometry, skins, nodes, materials, VRM humanoid / spring bones / blend shapes stay byte-identical (the meshopt coding is lossless).
//   node scripts/assets/process_vrm.mjs [--raw DIR] [--only key,key]
import sharp from 'sharp';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB, writeGLB, accessorArray, addAccessor, compact, triCount } from './lib/glb.mjs';
import { meshoptGLB } from './lib/meshopt.mjs';
import { CHARS } from './lib/catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = opt('raw', process.env.GTA_RAW || join(REPO, 'assets/_raw')), OUT = join(REPO, 'assets/runtime/chars');
const only = opt('only', '') ? opt('only').split(',') : null;
const TIERS = [
  { dir: OUT, max: 1024, nrm: 512, morphNormals: true, q: 90 },
  { dir: join(OUT, 'lo'), max: 512, nrm: 256, morphNormals: false, q: 86 },
];

function mergePrimitives(g) {
  let before = 0, after = 0;
  for (const m of g.json.meshes) {
    before += m.primitives.length;
    const groups = new Map();
    for (const p of m.primitives) {
      const k = JSON.stringify([p.attributes, p.targets || [], p.material, p.mode ?? 4]);
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p);
    }
    const prims = [];
    for (const list of groups.values()) {
      const p0 = list[0];
      if (list.length > 1 && list.every((p) => p.indices != null)) {
        const parts = list.map((p) => accessorArray(g, p.indices)), n = parts.reduce((s, a) => s + a.length, 0);
        const vcount = g.json.accessors[p0.attributes.POSITION].count;
        const idx = vcount > 65535 ? new Uint32Array(n) : new Uint16Array(n);
        let o = 0; for (const a of parts) { idx.set(a, o); o += a.length; }
        p0.indices = addAccessor(g, idx, 'SCALAR', { target: 34963 });
      }
      prims.push(p0);
    }
    m.primitives = prims; after += prims.length;
  }
  return { before, after };
}

// Keep only morph targets a blend-shape group uses (+ a 'ko' custom group: iris + highlight hidden).
// VRoid faces carry ~55 morphs, the VRM expressions use ~15: saves ~1.5 MB per model.
const KEEP_EXTRA = /Fcl_EYE_Iris_Hide$|Fcl_EYE_Highlight_Hide$/;
function pruneMorphs(g) {
  const j = g.json, groups = j.extensions.VRM.blendShapeMaster.blendShapeGroups;
  let before = 0, after = 0;
  j.meshes.forEach((m, mi) => {
    const n = m.primitives[0].targets?.length || 0; if (!n) return;
    before += n;
    const names = m.extras?.targetNames || m.primitives[0].extras?.targetNames || [];
    const keep = new Set(groups.flatMap((gr) => (gr.binds || []).filter((b) => b.mesh === mi).map((b) => b.index)));
    names.forEach((nm, i) => { if (KEEP_EXTRA.test(nm)) keep.add(i); });
    const order = [...keep].filter((i) => i < n).sort((a, b) => a - b), map = new Map(order.map((o, i) => [o, i]));
    for (const p of m.primitives) {
      p.targets = order.map((i) => p.targets[i]);
      if (p.extras?.targetNames) p.extras.targetNames = order.map((i) => p.extras.targetNames[i]);
    }
    if (m.extras?.targetNames) m.extras.targetNames = order.map((i) => m.extras.targetNames[i]);
    if (m.weights) m.weights = order.map((i) => m.weights[i]);
    for (const gr of groups) for (const b of gr.binds || []) if (b.mesh === mi) b.index = map.get(b.index);
    const ko = names.map((nm, i) => [nm, i]).filter(([nm]) => KEEP_EXTRA.test(nm)).map(([, i]) => ({ mesh: mi, index: map.get(i), weight: 100 }));
    if (ko.length === 2 && !groups.some((gr) => gr.name === 'ko')) groups.push({ name: 'ko', presetName: 'unknown', binds: ko, materialValues: [], isBinary: true });
    after += order.length;
  });
  return { before, after };
}

function stripMorphNormals(g) {
  for (const m of g.json.meshes) for (const p of m.primitives) if (p.targets) p.targets = p.targets.map(({ NORMAL, TANGENT, ...rest }) => rest);
}

// classify images: normal maps (MToon _BumpMap / normalTexture), thumbnail, colour
function imageRoles(j) {
  const role = new Map(), texImg = (t) => j.textures[t]?.source;
  const vrm = j.extensions?.VRM;
  for (const mp of vrm?.materialProperties || []) for (const [k, t] of Object.entries(mp.textureProperties || {})) if (k === '_BumpMap') role.set(texImg(t), 'normal');
  for (const mt of j.materials || []) if (mt.normalTexture) role.set(texImg(mt.normalTexture.index), 'normal');
  if (vrm?.meta?.texture != null && vrm.meta.texture >= 0) role.set(texImg(vrm.meta.texture), 'thumb');
  j.images.forEach((im, i) => { if (!role.has(i)) role.set(i, /_nml$/i.test(im.name || '') ? 'normal' : 'color'); });
  return role;
}

async function encodeImages(g, tier) {
  const j = g.json, roles = imageRoles(j), stats = { color: 0, normal: 0, thumb: 0 };
  // an image shared between roles keeps the colour treatment
  await Promise.all(j.images.map(async (im, i) => {
    const src = g.views[im.bufferView], role = roles.get(i);
    const img = sharp(src), meta = await img.metadata(), st = await img.stats();
    const max = role === 'thumb' ? 64 : role === 'normal' ? tier.nrm : tier.max;
    let p = sharp(src).resize({ width: Math.min(meta.width, max), height: Math.min(meta.height, max), fit: 'inside', kernel: 'lanczos3' });
    if (st.isOpaque || role === 'normal') p = p.removeAlpha();
    const out = await p.webp({ quality: role === 'normal' ? 92 : tier.q, alphaQuality: 100, smartSubsample: true, effort: 6 }).toBuffer();
    g.views[im.bufferView] = out; im.mimeType = 'image/webp'; stats[role] += out.length;
  }));
  for (const t of j.textures) { t.extensions = { ...(t.extensions || {}), EXT_texture_webp: { source: t.source } }; }
  j.extensionsUsed = [...new Set([...(j.extensionsUsed || []), 'EXT_texture_webp'])];
  return stats;
}

const report = [];
for (const c of CHARS) {
  if (only && !only.includes(c.key)) continue;
  const src = join(RAW, 'vrm', c.file);
  for (const tier of TIERS) {
    const g = readGLB(src), rawSize = statSync(src).size;
    const prims = mergePrimitives(g), morphs = pruneMorphs(g);
    if (!tier.morphNormals) stripMorphNormals(g);
    const tex = await encodeImages(g, tier);
    compact(g);
    const vrm = g.json.extensions.VRM;
    vrm.meta.title = vrm.meta.title || c.name;
    mkdirSync(tier.dir, { recursive: true });
    const out = join(tier.dir, c.key + '.vrm');
    let size = writeGLB(out, g); const mo = await meshoptGLB(readGLB(out)); if (mo) { writeFileSync(out, mo); size = mo.length; }
    report.push({ key: c.key, tier: tier.max, rawMB: +(rawSize / 1e6).toFixed(2), MB: +(size / 1e6).toFixed(2), tris: triCount(g.json), materials: g.json.materials.length,
      prims: `${prims.before}->${prims.after}`, morphTargets: `${morphs.before}->${morphs.after}`, springGroups: vrm.secondaryAnimation?.boneGroups?.length || 0, texKB: Object.fromEntries(Object.entries(tex).map(([k, v]) => [k, Math.round(v / 1024)])) });
    console.log(JSON.stringify(report.at(-1)));
  }
}
if (!only) writeFileSync(join(HERE, 'data/vrm_stats.json'), JSON.stringify(report, null, 1) + '\n');
