// Headless smoke test: load dist/grand-token-auto.html in headless Chrome, collect console errors,
// optionally start a new game, run a JS snippet, tick the sim and save screenshots.
//
//   node scripts/dev/smoke.mjs [--html dist/grand-token-auto.html] [--begin] [--ticks 300]
//        [--eval "GTA.Player.pos.toArray()"] [--shot out.png] [--mobile] [--port 9333] [--wait 25] [--size 640,400]
// Speed: SwiftShader is slow (~0.7 s per rendered frame at 1280x800). For simulation-only checks use
//   --eval "GTA.DEV.noRender=true; GTA.tick(600); GTA.DEV.noRender=false; ..." and a small --size.
//
// Several agents can run this at once: give each its own --port.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2), mobile0 = () => argv.includes('--mobile'), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; }, flag = (k) => argv.includes('--' + k);
const html = resolve(opt('html', 'dist/grand-token-auto.html'));
const port = +opt('port', 9300 + Math.floor(Math.random() * 600));
const size = opt('size', mobile0() ? '412,860' : '1280,800'), waitS = +opt('wait', 25), ticks = +opt('ticks', 0), shot = opt('shot', ''), evalSrc = opt('eval', ''), mobile = flag('mobile');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = mkdtempSync(join(tmpdir(), 'gta-smoke-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
  `--window-size=${size}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(), logs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function main() {
  let target;
  for (let k = 0; k < 60 && !target; k++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find((t) => t.type === 'page'); } catch { } await sleep(250); }
  if (!target) throw new Error('chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
    if (d.method === 'Runtime.consoleAPICalled') { const t = d.params.type; if (t === 'error' || t === 'warning' || t === 'log') logs.push(`[${t}] ` + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ')); }
    if (d.method === 'Runtime.exceptionThrown') { const e = d.params.exceptionDetails; logs.push('[exception] ' + (e.exception?.description || e.text) + (e.url ? ` @${e.lineNumber}:${e.columnNumber}` : '')); }
  });
  await send('Runtime.enable'); await send('Page.enable');
  if (mobile) { const [sw, sh] = size.split(',').map(Number); await send('Emulation.setDeviceMetricsOverride', { width: sw, height: sh, deviceScaleFactor: 2, mobile: true, screenOrientation: sw > sh ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } }); }
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const t0 = Date.now();
  await send('Page.navigate', { url: 'file://' + html });
  let ready = false;
  while (Date.now() - t0 < waitS * 1000) { await sleep(500); if (await ev('!!window.GTA')) { ready = true; break; } }
  const out = { ready, bootMs: Date.now() - t0 };
  if (ready && flag('begin')) {
    await ev('GTA.pump(true); GTA.begin(null); 1'); await sleep(2600);
    if (ticks) out.tick = await ev(`(()=>{const t=performance.now(); GTA.tick(${ticks}); return Math.round(performance.now()-t)+'ms for ${ticks} ticks'})()`);
  }
  if (ready && evalSrc) out.eval = await ev(evalSrc);
  if (ready) out.stats = await ev('(()=>{const r=GTA.renderer.info; return {calls:r.render.calls, tris:r.render.triangles, geos:r.memory.geometries, tex:r.memory.textures, pos:GTA.Player.pos.toArray().map(v=>+v.toFixed(1)), mode:GTA.Player.mode, cars:GTA.Cars.list.length, peds:GTA.Peds.list?GTA.Peds.list.length:-1}})()');
  if (shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(shot, Buffer.from(r.data, 'base64')); out.shot = shot; }
  out.logs = logs.slice(0, 60);
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.log(JSON.stringify({ fatal: String(e), logs })); }).finally(() => { try { ws && ws.close(); } catch { } chrome.kill('SIGKILL'); setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch { } process.exit(0); }, 300); });
