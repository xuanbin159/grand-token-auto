// Tiny headless-Chrome driver (CDP over WebSocket) + static http server for asset checks.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function serve(root, port) {
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/`); break; } catch { await sleep(150); } }
  return { url: `http://127.0.0.1:${port}`, close: () => p.kill('SIGKILL') };
}

export async function withChrome({ port = 9602, size = '1280,800', gpu = false } = {}, fn) {
  const prof = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'gta-assets-cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    ...(gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--ignore-gpu-blocklist', `--window-size=${size}`, 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map(), logs = [];
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  try {
    let target;
    for (let k = 0; k < 80 && !target; k++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find((t) => t.type === 'page'); } catch { } await sleep(250); }
    if (!target) throw new Error('chrome did not start');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
      if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      if (d.method === 'Runtime.exceptionThrown') { const e = d.params.exceptionDetails; logs.push('[exception] ' + (e.exception?.description || e.text)); }
    });
    await send('Runtime.enable'); await send('Page.enable');
    const [sw, sh] = size.split(',').map(Number); await send('Emulation.setDeviceMetricsOverride', { width: sw, height: sh, deviceScaleFactor: 1, mobile: false });
    const page = {
      logs,
      async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
      async goto(url, readyExpr = 'window.READY', timeoutS = 120) {
        await send('Page.navigate', { url }); const t0 = Date.now();
        while (Date.now() - t0 < timeoutS * 1000) { await sleep(300); try { if (await page.eval(`!!(${readyExpr})`)) return Date.now() - t0; } catch { } }
        throw new Error('page not ready: ' + url);
      },
      async shot(path) { const r = await send('Page.captureScreenshot', { format: path.endsWith('.jpg') ? 'jpeg' : 'png', quality: 85 }); writeFileSync(path, Buffer.from(r.data, 'base64')); return path; },
    };
    return await fn(page);
  } finally {
    try { ws && ws.close(); } catch { }
    chrome.kill('SIGKILL'); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch { }
  }
}
