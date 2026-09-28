// Play every baked VRMA on a VRM in headless Chrome: contact sheets (5 time samples, front + side),
// ground contact and locomotion stride speed (for playback-rate sync, written to anim_metrics.json).
//   node scripts/assets/check_anims.mjs [--vrm hairsample_male] [--only walk,run] [--port 9602]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, withChrome } from './lib/cdp.mjs';
import { CLIPS } from './lib/clips.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = process.env.GTA_RAW || join(REPO, 'assets/_raw'), OUT = opt('out', join(RAW, 'check_anims')); mkdirSync(OUT, { recursive: true });
const vrmKey = opt('vrm', 'hairsample_male'), only = opt('only', '') ? opt('only').split(',') : null, port = +opt('port', 9602);
const srv = await serve(REPO, port + 10000), metrics = {};
try {
  await withChrome({ port, size: '800,400' }, async (page) => {
    await page.goto(`${srv.url}/scripts/assets/viewer/index.html?vrm=../../../assets/runtime/chars/${vrmKey}.vrm`);
    for (const c of CLIPS) {
      if (c.alias || (only && !only.includes(c.key))) continue;
      const info = await page.eval(`V.loadAnim('../../../assets/runtime/anims/${c.key}.vrma')`);
      const d = info.duration, ts = [0, 0.2, 0.4, 0.6, 0.8].map((f) => +(f * d).toFixed(3));
      await page.eval(`V.sheet(${JSON.stringify(ts)}, ['front','side'])`);
      await page.shot(join(OUT, c.key + '.jpg'));
      const f = await page.eval(`V.feet(${d}, 120)`); // [t, Lx,Ly,Lz, Rx,Ry,Rz, hx,hy,hz]
      const minY = Math.min(...f.map((r) => Math.min(r[2], r[5]))), hipsY = await page.eval('V.S.vrm.humanoid.normalizedRestPose.hips.position[1]');
      const r = { dur: d, tracks: info.tracks, footMin: +minY.toFixed(3), footMinAvg: +(f.reduce((s, r) => s + Math.min(r[2], r[5]), 0) / f.length).toFixed(3) };
      if (c.tags?.includes('move') && c.loop) {
        // ground speed = slope of the foot's horizontal position over its (cyclic) contact phase:
        // the contiguous frames where the foot is in the lowest quarter of its height range
        const axis = /strafe/.test(c.key) ? 0 : 2, sp = [], N = f.length - 1;
        for (const [o, yi] of [[1, 2], [4, 5]]) {
          const ys = f.slice(0, N).map((r) => r[yi]), lo = Math.min(...ys), hi = Math.max(...ys), th = lo + 0.25 * (hi - lo);
          const i0 = ys.indexOf(lo); let a = i0, b = i0;
          while (ys[(a - 1 + N) % N] < th && (i0 - a) < N) a--;
          while (ys[(b + 1) % N] < th && (b - i0) < N) b++;
          const pts = []; for (let i = a; i <= b; i++) { const r = f[(i + N) % N], t = r[0] + Math.floor(i / N) * f[N][0]; pts.push([t, r[o + axis]]); }
          if (pts.length >= 3) { const mt = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length; let num = 0, den = 0; for (const [t, z] of pts) { num += (t - mt) * (z - mz); den += (t - mt) ** 2; } sp.push(-num / den); }
        }
        const med = sp.length ? sp.reduce((s, v) => s + v, 0) / sp.length : 0;
        r.speed = +med.toFixed(3); r.speedPerHipsY = +(med / hipsY).toFixed(3); // m/s at this VRM's size, and per metre of hips height
      }
      metrics[c.key] = r; console.log(c.key.padEnd(16), JSON.stringify(r));
    }
    const errs = await page.eval('V.S.errors'); if (errs.length || page.logs.length) console.log('errors:', errs, page.logs.slice(0, 20));
  });
} finally { srv.close(); }
writeFileSync(join(RAW, `anim_metrics_${vrmKey}.json`), JSON.stringify(metrics, null, 1));
if (!only && vrmKey === 'hairsample_male') writeFileSync(join(HERE, 'data/anim_metrics.json'), JSON.stringify(metrics, null, 1) + '\n');
