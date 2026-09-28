// Poly Haven CC0 street props / interior furniture: glTF 1k -> decimated (meshoptimizer), quantized + EXT_meshopt_compression,
// WebP textures. All variant nodes of each kit are kept (e.g. fire_hydrant / fire_hydrant_aged): pick by node name.
// Needs GLTFLoader.setMeshoptDecoder(MeshoptDecoder) at runtime. Never run this on VRMs (drops VRM extensions).
//   node scripts/assets/process_props.mjs [--raw DIR] [--set props|furniture] [--only key]
// props -> assets/runtime/props (sources/props.tsv), furniture -> assets/runtime/furniture (sources/furniture.tsv)
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, textureCompress, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { PROPS, FURNITURE } from './lib/props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SET = opt('set', 'props'), LIST = SET === 'furniture' ? FURNITURE : PROPS;
const RAW = opt('raw', process.env.GTA_RAW || join(REPO, 'assets/_raw')), OUT = join(REPO, 'assets/runtime', SET);
const only = opt('only', '') ? opt('only').split(',') : null;
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const triCount = (doc) => doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

const stats = {};
for (const p of LIST) {
  if (only && !only.includes(p.key)) continue;
  const doc = await io.read(join(RAW, SET, p.key, `${p.key}_1k.gltf`)), before = triCount(doc);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: p.ratio, error: p.error ?? 0.004, lockBorder: false }), dedup(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [p.tex, p.tex], quality: 86 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = join(OUT, p.key + '.glb'); await io.write(out, doc);
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh()).map((n) => n.getName());
  stats[p.key] = { trisBefore: before, tris: triCount(doc), bytes: statSync(out).size, tex: p.tex, nodes };
  console.log(p.key.padEnd(28), JSON.stringify({ ...stats[p.key], nodes: nodes.length }));
}
if (!only) writeFileSync(join(HERE, `data/${SET}.json`), JSON.stringify(stats, null, 1) + '\n');
