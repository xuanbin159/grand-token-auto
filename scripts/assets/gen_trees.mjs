// Generate the street / park trees offline with EZ-Tree (MIT) in headless Chrome, then optimise:
//   one GLB per species with nodes lod0 (< 8k tris) and lod1 (1/3 leaf cards, bark simplified to 30%), shared
//   materials, meshopt + quantized geometry, WebP textures (EXT_meshopt_compression: GLTFLoader.setMeshoptDecoder),
//   and a 2x2 impostor atlas (0/45/90/135 deg) for far LOD.
//   node scripts/assets/gen_trees.mjs [--only guohuai] [--preview] [--port 9602]
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplifyPrimitive, meshopt, textureCompress, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { serve, withChrome } from './lib/cdp.mjs';
import { TREES } from './lib/trees.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = process.env.GTA_RAW || join(REPO, 'assets/_raw'), OUT = join(REPO, 'assets/runtime/trees'), TMP = join(RAW, 'trees');
const only = opt('only', '') ? opt('only').split(',') : null, preview = argv.includes('--preview'), port = +opt('port', 9602);
mkdirSync(OUT, { recursive: true }); mkdirSync(TMP, { recursive: true });

await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

async function optimise(src, dst, { barkRatio = 0.3 } = {}) {
  const doc = await io.read(src);
  await doc.transform(weld());
  for (const n of doc.getRoot().listNodes()) { const m = n.getMesh(); if (m) m.setName(n.getName()); } // GLTFExporter leaves mesh names empty
  for (const m of doc.getRoot().listMeshes()) if (m.getName() === 'bark_lod1') for (const p of m.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: barkRatio, error: 0.01 });
  await doc.transform(dedup(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88, slots: /^baseColor/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 86, slots: /^(?!baseColor)/ }),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeGeneric: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(dst, doc);
  return statSync(dst).size;
}
const tris = async (path) => { const d = await io.read(path), t = {}; for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) t[m.getName()] = (t[m.getName()] || 0) + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; return { lod0: t.bark + t.leaves, lod1: t.bark_lod1 + t.leaves_lod1, ...t }; };

const srv = await serve(REPO, port + 10000), stats = {};
try {
  await withChrome({ port, size: '900,700' }, async (page) => {
    await page.goto(`${srv.url}/scripts/assets/viewer/trees.html`);
    for (const t of TREES) {
      if (only && !only.includes(t.key)) continue;
      const info = await page.eval(`T.make(${JSON.stringify(t)})`);
      await page.eval('T.view()'); await page.shot(join(TMP, `${t.key}_preview.jpg`));
      console.log(t.key, JSON.stringify(info));
      if (preview) continue;
      const rawGlb = join(TMP, `${t.key}_raw.glb`), out = join(OUT, `${t.key}.glb`);
      await page.eval(`(window.__t = T.lod1(${t.lod1Keep || 3}, ${t.lod1Grow || 1.45}), 1)`);
      writeFileSync(rawGlb, Buffer.from(await page.eval('T.exportGLB(window.__t)'), 'base64'));
      const imp = await page.eval('T.impostor(1024)');
      await sharp(Buffer.from(imp.png, 'base64')).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(join(OUT, `${t.key}_impostor.webp`));
      const bytes = await optimise(rawGlb, out);
      stats[t.key] = { name: t.name, height: t.height, size: info.size, bytes, tris: await tris(out),
        impostor: { views: [0, 45, 90, 135], grid: '2x2', halfExtent: imp.extent, centerY: imp.centerY, bytes: statSync(join(OUT, `${t.key}_impostor.webp`)).size } };
      console.log('  ->', JSON.stringify(stats[t.key]));
    }
    const errs = await page.eval('T.errors'); if (errs.length || page.logs.length) console.log('errors:', errs, page.logs.slice(0, 10));
  });
} finally { srv.close(); }
if (!preview && !only) writeFileSync(join(HERE, 'data/trees.json'), JSON.stringify(stats, null, 1) + '\n');
