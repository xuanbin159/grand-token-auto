// Headless check of the environment set: every PBR material on a rounded box under a runtime HDRI
// (desktop + phone tier), and every tree / prop GLB (meshopt + WebP) loaded with GLTFLoader.
//   node scripts/assets/check_models.mjs [--port 9602]
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, withChrome } from './lib/cdp.mjs';
import { TREES } from './lib/trees.mjs';
import { PROPS } from './lib/props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = process.env.GTA_RAW || join(REPO, 'assets/_raw'), OUT = join(RAW, 'check_models'), port = +opt('port', 9602);
mkdirSync(OUT, { recursive: true });
const srv = await serve(REPO, port + 10000), page0 = `${srv.url}/scripts/assets/viewer/materials.html`;
try {
  await withChrome({ port, size: '1400,900' }, async (page) => {
    for (const [hdri, tier] of [['kloofendal_48d_partly_cloudy_puresky_1k', ''], ['kloppenheim_06_puresky_2k', ''], ['zhengyang_gate_1k', 'lo']]) {
      await page.goto(`${page0}?hdri=${hdri}&grid=1&tier=${tier}`);
      console.log('grid', hdri, tier || 'desktop', 'errors', await page.eval('M.errors'));
      await page.shot(join(OUT, `materials_${tier || 'desktop'}_${hdri}.jpg`));
    }
    for (const [dir, list] of [['trees', TREES], ['props', PROPS]]) for (const it of list) {
      await page.goto(`${page0}?hdri=kloofendal_48d_partly_cloudy_puresky_1k`);
      const r = await page.eval(`M.prop('../../../assets/runtime/${dir}/${it.key}.glb')`);
      console.log(dir, it.key, JSON.stringify(r), 'errors', await page.eval('M.errors'));
      await page.shot(join(OUT, `${dir}_${it.key}.jpg`));
    }
    if (page.logs.length) console.log('console:', page.logs.slice(0, 20));
  });
} finally { srv.close(); }
