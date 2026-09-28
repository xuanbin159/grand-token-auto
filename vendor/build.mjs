// Bundle vendor/entry.js into vendor/dist/vendor.js (one minified classic IIFE) and copy the runtime decoders
// (basis transcoder for KTX2, draco) into vendor/dist/libs/. The output is committed, so scripts/build.py works
// on machines without node_modules; re-run after changing versions:  npm install && node vendor/build.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'vendor', 'dist');
mkdirSync(join(out, 'libs'), { recursive: true });
await build({
  entryPoints: [join(root, 'vendor', 'entry.js')], bundle: true, format: 'iife', minify: true, target: 'es2022',
  outfile: join(out, 'vendor.js'), legalComments: 'eof', logLevel: 'warning', // import.meta.url (KTX2Loader's default decoder path) has no value in an IIFE: resolve against the page instead
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.url': '__vendorBase' },
  banner: { js: 'var __vendorBase = typeof document !== "undefined" && document.baseURI || "http://localhost/";' },
});
const jsm = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');
for (const f of ['basis/basis_transcoder.js', 'basis/basis_transcoder.wasm', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js']) {
  mkdirSync(dirname(join(out, 'libs', f)), { recursive: true }); cpSync(join(jsm, f), join(out, 'libs', f));
}
// licences of everything shipped in vendor.js / libs/ (the build copies this next to index.html)
const nm = join(root, 'node_modules'), pkgs = [['three', 'three/LICENSE'], ['@pixiv/three-vrm (+ core, materials-mtoon, springbone, node-constraint, …)', '@pixiv/three-vrm/LICENSE'],
  ['@pixiv/three-vrm-animation', '@pixiv/three-vrm-animation/LICENSE'], ['postprocessing', 'postprocessing/LICENSE.md'], ['n8ao', 'n8ao/LICENSE']];
const ver = (n) => { try { return JSON.parse(readFileSync(join(nm, n.split(' ')[0], 'package.json'), 'utf8')).version; } catch { return '?'; } };
let txt = 'Third-party software in this game folder (vendor.js, libs/)\n\n';
for (const [n, f] of pkgs) txt += '='.repeat(72) + `\n${n} ${ver(n)}\n` + '='.repeat(72) + '\n' + readFileSync(join(nm, f), 'utf8').trim() + '\n\n';
txt += '='.repeat(72) + '\nlibs/basis: Basis Universal transcoder (Binomial LLC), Apache License 2.0 — https://github.com/BinomialLLC/basis_universal\n' +
  'libs/draco: Draco 3D decoder (Google), Apache License 2.0 — https://github.com/google/draco\n' +
  'Full Apache-2.0 text: https://www.apache.org/licenses/LICENSE-2.0\n';
writeFileSync(join(out, 'THIRD_PARTY.txt'), txt);
console.log(`vendor.js ${(statSync(join(out, 'vendor.js')).size / 1024) | 0} KB`);
