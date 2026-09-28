// Load-time benchmark: serves the game folder like GitHub Pages (gzip for text, ETag / 304, max-age=600), opens it in
// headless Chrome on the real GPU (Metal on a Mac; --swiftshader for the software one), presses 新游戏 as soon as it is
// enabled and reports when things happened and how many bytes had arrived by then.
//
//   node scripts/dev/loadtime.mjs [--html dist] [--port 9444] [--net 50] [--revisit] [--stream] [--profile top.txt] [--mobile]
//     --net Mbps     throttle the download (plus 30 ms latency); default unthrottled (a local server)
//     --revisit      after the first visit, load the page again (HTTP cache + service worker) and measure that too
//     --stream       after playable, wait for the background stream to finish (Assets.stream) and report long frames meanwhile
//     --profile F    CPU profile of the first visit: top self / total times written to F
//     --nocache      the server sends no-store (no HTTP cache; the service worker still caches)
//     --eval JS      evaluated at the end of each visit (result in the output)
//     --noclick      stay on the title: wait until its world is live (shaders warm), then stop (with --shot: a picture of it)
//     --shot F       screenshot at the end of each visit (F.png, F_revisit.png)
//     --query Q      appended to the page URL (e.g. nosw: no service worker; the network throttle doesn't reach a worker's fetches)
//     --cold         salt every shader so neither Chrome's nor the OS's (Metal) shader cache can serve it: a first-ever visit
// Times are ms from navigation start: fcp, title (title screen interactive), ready (新游戏 enabled), playable (first
// gameplay frame after pressing it), stream (every streamed asset in). Bytes are what came over the wire by then.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, statSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename, extname, sep } from 'node:path';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; }, flag = (k) => argv.includes('--' + k);
const html0 = resolve(opt('html', 'dist'));
const isDir = (() => { try { return statSync(html0).isDirectory(); } catch { return false; } })();
const root = isDir ? html0 : dirname(html0), page = isDir ? 'index.html' : basename(html0);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.vrm': 'model/gltf-binary',
  '.vrma': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const GZ = /\.(html|js|json|md|txt|svg|hdr|bin)$/i, gzc = new Map(), nocache = flag('nocache');
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = resolve(root, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  let st = null; try { st = f.startsWith(root + sep) || f === root ? statSync(f) : null; } catch { }
  if (!st || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
  const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
  const h = { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': nocache ? 'no-store' : 'max-age=600', etag };
  if (!nocache && req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
  let body = readFileSync(f);
  if (GZ.test(f) && /gzip/.test(req.headers['accept-encoding'] || '')) {
    const k = f + etag; if (!gzc.has(k)) gzc.set(k, gzipSync(body, { level: 6 }));
    body = gzc.get(k); h['content-encoding'] = 'gzip';
  }
  h['content-length'] = body.length; res.writeHead(200, h); res.end(body);
});
const httpPort = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const port = +opt('port', 9400 + Math.floor(Math.random() * 500)), mobile = flag('mobile'), size = opt('size', mobile ? '412,860' : '1280,800');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = mkdtempSync(join(tmpdir(), 'gta-load-'));
const gl = flag('swiftshader') ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu'];
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  ...gl, '--ignore-gpu-blocklist', '--mute-audio', `--window-size=${size}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), logs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
// page-side probes: a big resource-timing buffer, long tasks, and a timestamp for the first frame after G.started
const PROBE = `performance.setResourceTimingBufferSize(5000); window.__lt = { long: [] };
${flag('cold') ? `(() => { const salt = String(Math.random()).slice(2, 12), P = WebGL2RenderingContext.prototype, ss = P.shaderSource;
  P.shaderSource = function (sh, src) { return ss.call(this, sh, /gtaSalt/.test(src) ? src : src.replace(/void\\s+main\\s*\\(\\s*\\)\\s*\\{/, 'float gtaSaltV = 0.' + salt + '; void gtaSaltF() { gtaSaltV += 1.0; }\\nvoid main() {\\n  gtaSaltF();')); }; })();` : ''}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __lt.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}`;
const SNAP = `(() => { const r = performance.getEntriesByType('resource'), m = {}; for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('gta:')) m[e.name.slice(4)] = Math.round(e.startTime);
  const p = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
  return { marks: m, fcp: p ? Math.round(p.startTime) : null, res: r.map((e) => [e.name.replace(location.origin + '/', '').replace(/\\?v=.*/, ''), Math.round(e.responseEnd), e.transferSize, e.encodedBodySize, e.decodedBodySize]),
    long: __lt.long, build: window.GTA && GTA.W ? GTA.W.buildMs : null, boot: window.GTA && GTA.Assets && GTA.Assets.stats ? GTA.Assets.stats : null }; })()`;
async function visit(label, profile) {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  if (profile) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 500 }); await send('Profiler.start'); }
  const t0 = Date.now();
  await send('Page.navigate', { url: `http://127.0.0.1:${httpPort}/${page}${opt('query', '') ? '?' + opt('query', '') : ''}` });
  const out = { label }; let ready = false, clicked = 0;
  while (Date.now() - t0 < 240000) {
    await sleep(50);
    const s = await ev(`(() => { const b = document.getElementById('t-new'); return b ? (b.disabled ? 0 : 1) + (window.GTA && GTA.G && GTA.G.started && document.getElementById('loading').hidden ? 2 : 0) : -1; })()`);
    if (flag('noclick')) { if (s >= 1 && await ev(`!!(window.GTA && GTA.Warm && GTA.Warm.live && GTA.Warm.done)`)) { await sleep(2500); break; } continue; }
    if (s >= 1 && !clicked) { clicked = Date.now() - t0; await ev(`performance.mark('gta:click'); document.getElementById('t-new').click(); 1`); }
    if (s >= 2) { ready = true; break; }
  }
  // first gameplay frame: the loading screen has gone and a frame was drawn
  if (ready) await ev(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { performance.mark('gta:playable'); r(1); })))`);
  if (profile) {
    const { profile: P } = await send('Profiler.stop');
    writeFileSync(profile, summarize(P));
  }
  if (ready && flag('stream')) {
    const tS = Date.now();
    while (Date.now() - tS < 120000) { await sleep(250); if (await ev(`!!(GTA.Assets && GTA.Assets.idle && GTA.Assets.idle())`)) break; }
    await ev(`performance.mark('gta:stream'); 1`);
    await sleep(1500);
    out.fps = await ev(`new Promise((r) => { let n = 0; const t = performance.now(), f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else r(+(n * 1000 / (performance.now() - t)).toFixed(1)); }; requestAnimationFrame(f); })`);
  }
  if (opt('eval', '')) out.eval = await ev(opt('eval', ''));
  if (opt('shot', '')) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt('shot', '').replace(/(\.png)?$/, label === 'first' ? '.png' : '_' + label + '.png'), Buffer.from(r.data, 'base64')); }
  const S = await ev(SNAP);
  if (typeof S === 'string') { out.error = S; return out; }
  const mb = (b) => +(b / 1048576).toFixed(2), upto = (t) => { let w = 0, b = 0, n = 0; for (const [, end, tr, enc] of S.res) if (end <= t) { w += tr; b += enc; n++; } return { n, wireMB: mb(w), bodyMB: mb(b) }; };
  if (S.marks.ready === undefined && S.marks.click !== undefined) S.marks.ready = S.marks.click;
  out.fcp = S.fcp; out.marks = S.marks; out.worldMs = S.build; out.assets = S.boot;
  for (const k of ['title', 'ready', 'playable', 'stream']) if (S.marks[k] !== undefined) out['bytes@' + k] = upto(S.marks[k]);
  const pl = S.marks.playable || 1e12, after = S.long.filter(([t]) => t > pl);
  out.longBeforePlayable = { n: S.long.length - after.length, maxMs: Math.max(0, ...S.long.filter(([t]) => t <= pl).map((x) => x[1])), sumMs: S.long.filter(([t]) => t <= pl).reduce((a, x) => a + x[1], 0) };
  out.longAfterPlayable = { n: after.length, maxMs: Math.max(0, ...after.map((x) => x[1])), sumMs: after.reduce((a, x) => a + x[1], 0), top: after.sort((a, b) => b[1] - a[1]).slice(0, 6) };
  // biggest files before 'ready'
  out.bigBeforeReady = S.res.filter(([, end]) => end <= (S.marks.ready || 1e12)).sort((a, b) => b[3] - a[3]).slice(0, 8).map(([n, , , enc]) => n + ' ' + mb(enc) + 'MB');
  return out;
}
// CPU profile → top functions by self time and by total (inclusive, recursion counted once)
function summarize(P) {
  const nodes = new Map(P.nodes.map((n) => [n.id, n])), self = new Map(), dt = P.timeDeltas, parent = new Map();
  for (const n of P.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const cnt = new Map(); P.samples.forEach((s, i) => cnt.set(s, (cnt.get(s) || 0) + (dt[i] || 0) / 1000));
  const name = (n) => (n.callFrame.functionName || '(anon)') + ' ' + basename(n.callFrame.url.split('?')[0]) + ':' + (n.callFrame.lineNumber + 1);
  const tot = new Map();
  for (const [idn, ms] of cnt) {
    const n = nodes.get(idn); self.set(name(n), (self.get(name(n)) || 0) + ms);
    const seen = new Set(); for (let k = idn; k !== undefined; k = parent.get(k)) { const nm = name(nodes.get(k)); if (!seen.has(nm)) { seen.add(nm); tot.set(nm, (tot.get(nm) || 0) + ms); } }
  }
  const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => v.toFixed(0).padStart(7) + ' ms  ' + k).join('\n');
  return '== self ==\n' + fmt(self) + '\n\n== total ==\n' + fmt(tot) + '\n';
}
async function main() {
  let target;
  for (let k = 0; k < 60 && !target; k++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { } await sleep(250); }
  if (!target) throw new Error('chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
    if (d.method === 'Runtime.consoleAPICalled') { const t = d.params.type; if (t === 'error' || t === 'warning' || t === 'log') logs.push(`[${t}] ` + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)); }
    if (d.method === 'Runtime.exceptionThrown') { const e = d.params.exceptionDetails; logs.push('[exception] ' + (e.exception?.description || e.text)); }
  });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  if (mobile) { const [sw, sh] = size.split(',').map(Number); await send('Emulation.setDeviceMetricsOverride', { width: sw, height: sh, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  const net = +opt('net', 0);
  if (net) await send('Network.emulateNetworkConditions', { offline: false, latency: 30, downloadThroughput: net * 125000, uploadThroughput: 20 * 125000 });
  const res = [await visit('first', opt('profile', ''))];
  if (flag('revisit')) { await sleep(3000); res.push(await visit('revisit', '')); }
  console.log(JSON.stringify({ net: net ? net + ' Mbps' : 'local', gpu: await ev(`(() => { const g = GTA.renderer.getContext(), e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })()`), runs: res, logs: logs.filter((l) => !/^\[log\] \[(world|assets|boot)\]/.test(l) || flag('verbose')).slice(0, 40), info: logs.filter((l) => /^\[log\] \[(world|assets|boot)\]/.test(l)).slice(0, 12) }, null, 1));
}
main().catch((e) => { console.log(JSON.stringify({ fatal: String(e && e.stack || e), logs })); }).finally(() => { try { ws && ws.close(); } catch { } chrome.kill('SIGKILL'); server.close(); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } process.exit(0); }, 300); });
