// Meshopt-code the shipped characters and animations in place (lib/meshopt.mjs: lossless EXT_meshopt_compression; files already
// coded are skipped). process_vrm.mjs and bake_anims.mjs do this on their own output; this is for existing files.
//   node scripts/assets/meshopt_vrm.mjs [file.vrm|file.vrma …]     (default: assets/runtime/chars/**/*.vrm + anims/*.vrma)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './lib/glb.mjs';
import { meshoptGLB } from './lib/meshopt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), RT = join(HERE, '../../assets/runtime');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = process.argv.length > 2 ? process.argv.slice(2) : [...walk(join(RT, 'chars')), ...walk(join(RT, 'anims'))].filter((p) => /\.vrma?$/.test(p));
let t0 = 0, t1 = 0;
for (const p of files) {
  const before = statSync(p).size, out = await meshoptGLB(readGLB(p));
  if (!out) { console.log('skip', relative(RT, p)); continue; }
  writeFileSync(p, out); t0 += before; t1 += out.length;
  console.log(relative(RT, p).padEnd(34), (before / 1e6).toFixed(2), '->', (out.length / 1e6).toFixed(2), 'MB');
}
console.log('total', (t0 / 1e6).toFixed(1), '->', (t1 / 1e6).toFixed(1), 'MB');
