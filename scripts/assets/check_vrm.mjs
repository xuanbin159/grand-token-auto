// Load every processed VRM with three-vrm in headless Chrome: stats + a front/side/back contact sheet.
//   node scripts/assets/check_vrm.mjs [--only key] [--tier lo] [--anim idle] [--out DIR] [--port 9602]
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, withChrome } from './lib/cdp.mjs';
import { CHARS } from './lib/catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const views = opt('views', 'front,side,back').split(','), only = opt('only', '') ? opt('only').split(',') : null, tier = opt('tier', ''), anim = opt('anim', ''), port = +opt('port', 9602);
const OUT = opt('out', join(process.env.GTA_RAW || join(REPO, 'assets/_raw'), 'check')); mkdirSync(OUT, { recursive: true });
const srv = await serve(REPO, port + 10000);
const res = {};
try {
  await withChrome({ port, size: '1200,700' }, async (page) => {
    await page.goto(`${srv.url}/scripts/assets/viewer/index.html`);
    for (const c of CHARS) {
      if (only && !only.includes(c.key)) continue;
      const url = `../../../assets/runtime/chars/${tier ? tier + '/' : ''}${c.key}.vrm`;
      const r = await page.eval(`V.loadVRM(${JSON.stringify(url)})`);
      if (anim) Object.assign(r, await page.eval(`V.loadAnim('../../../assets/runtime/anims/${anim}.vrma')`));
      r.calls = await page.eval(`V.sheet([${anim ? '0.5' : '0'}], ${JSON.stringify(views)})`);
      r.shot = await page.shot(join(OUT, `${c.key}${tier ? '_' + tier : ''}${views.length === 3 ? '' : '_' + views.join('')}.jpg`));
      r.errors = await page.eval('V.S.errors.splice(0)');
      res[c.key] = r; console.log(c.key, JSON.stringify(r));
    }
    if (page.logs.length) console.log('console:', page.logs.slice(0, 20));
  });
} finally { srv.close(); }
