"""把 game/*.js + head.html + assets 构建成一个游戏文件夹(默认 dist/),用 http 打开 index.html 就能玩:

  dist/index.html        页面骨架(game/head.html),内嵌资源清单 ASSET_FILES,脚本 defer 加载
  dist/sw.js             service worker:带 ?v= 哈希的文件先查缓存,其余先走网络
  dist/vendor.js         three r186 + GLTF/KTX2/VRM/后处理(vendor/dist/vendor.js,esbuild 打的 IIFE)
  dist/game.js           game/*.js 按文件名顺序拼成一个 IIFE(发布目录 dist/ 默认用 esbuild 压缩,--no-min 不压缩)
  dist/libs/             KTX2(basis)与 draco 解码器
  dist/assets/map.js     地图数据 MAP_DATA(assets/beijing_map.json)
  dist/assets/face.webp  主角头像、bust.webp 半身像
  dist/assets/runtime/   运行时资源(assets/runtime/**,同步拷贝)+ files.json 清单

用法:  python3 scripts/build.py              # 构建 + 语法检查(有 node 时)
       python3 scripts/build.py --out DIR    # 输出到别的文件夹;--out X.html 则把入口页写成 X.html,其余文件放它旁边
       python3 scripts/build.py --min / --no-min   # 压缩 game.js(默认:只有 dist/ 压缩,调试用的 --out 输出保留原样,报错行号可读)
本地试玩: python3 -m http.server -d dist 8000,然后打开 http://localhost:8000/(直接双击 index.html 不行:浏览器不让 file:// 读资源)
"""
import datetime, hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME, ASSETS, DIST, VENDOR = ROOT / 'game', ROOT / 'assets', ROOT / 'dist', ROOT / 'vendor'
_out = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]).resolve() if '--out' in sys.argv else DIST
OUT, PAGE = (_out.parent, _out.name) if _out.suffix == '.html' else (_out, 'index.html')
MINIFY = '--no-min' not in sys.argv and ('--min' in sys.argv or OUT == DIST)


# the service worker (dist/sw.js): runtime assets, vendor.js, game.js and map.js carry a content hash (?v=), so a cached copy
# is always right: cache-first. index.html and everything unversioned: network-first, the cache only when offline.
# After a load the page sends { keep: [urls] } (the current build's versioned files) and older copies are dropped.
SW_JS = '''// Grand Token Auto: 四九城 service worker (build %VER%)
const C = 'gta-files';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  e.respondWith(u.searchParams.has('v') ? cacheFirst(r) : netFirst(r));
});
async function cacheFirst(r) {
  const c = await caches.open(C), hit = await c.match(r);
  if (hit) return hit;
  const res = await fetch(r);
  if (res.status === 200) c.put(r, res.clone()).catch(() => {});
  return res;
}
async function netFirst(r) {
  const c = await caches.open(C);
  try {
    const res = await fetch(r);
    if (res.status === 200) c.put(r, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(r);
    if (hit) return hit;
    throw err;
  }
}
self.addEventListener('message', (e) => {
  const keep = e.data && e.data.keep;
  if (!Array.isArray(keep)) return;
  e.waitUntil((async () => {
    const k = new Set(keep), c = await caches.open(C);
    for (const req of await c.keys()) if (new URL(req.url).searchParams.has('v') && !k.has(req.url)) await c.delete(req);
  })());
});
'''


def vendor():
    """vendor/dist/vendor.js is committed; rebuild it only when node_modules is there and the entry / lock file is newer."""
    vj, nm = VENDOR / 'dist' / 'vendor.js', ROOT / 'node_modules' / 'three'
    srcs = [VENDOR / 'entry.js', VENDOR / 'build.mjs', ROOT / 'package-lock.json']
    if nm.exists() and (not vj.exists() or max(s.stat().st_mtime for s in srcs if s.exists()) > vj.stat().st_mtime):
        r = subprocess.run(['node', str(VENDOR / 'build.mjs')], capture_output=True, text=True)
        if r.returncode:
            sys.exit('vendor build failed:\n' + r.stdout + r.stderr)
    if not vj.exists():
        sys.exit('vendor/dist/vendor.js missing: run `npm install && node vendor/build.mjs`')
    return vj


def minify(game):
    """esbuild --minify (node_modules/.bin/esbuild; skipped without it): ~130 KB less gzip before the title boots. Property names
    stay (window.GTA.*), function names too (--keep-names: the Hooks guard labels read fn.name); UTF-8 kept as is (Chinese text)."""
    esb = ROOT / 'node_modules' / '.bin' / 'esbuild'
    if not esb.exists():
        return game, False
    # (--format=iife: keep-names' little helper lands inside the wrapper, not on window)
    r = subprocess.run([str(esb), '--minify', '--keep-names', '--charset=utf8', '--legal-comments=none', '--loader=js', '--format=iife'], input=game, capture_output=True, text=True)
    if r.returncode:
        sys.exit('minify failed:\n' + r.stderr)
    return r.stdout, True


def sync(src, dst):
    """copy src → dst when missing or changed (size / mtime); returns True if copied"""
    if dst.exists() and dst.stat().st_size == src.stat().st_size and dst.stat().st_mtime >= src.stat().st_mtime:
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return True


def sync_tree(src, dst):
    """mirror a directory (skips dotfiles), deleting files that no longer exist in src; returns {relpath: size}"""
    files = {}
    if src.exists():
        for p in sorted(src.rglob('*')):
            rel = p.relative_to(src)
            if p.is_file() and not any(part.startswith('.') for part in rel.parts):
                sync(p, dst / rel); files[rel.as_posix()] = p.stat().st_size
    if dst.exists():
        for p in sorted(dst.rglob('*'), reverse=True):
            rel = p.relative_to(dst).as_posix()
            if p.is_file() and rel not in files and rel != 'files.json':
                p.unlink()
            elif p.is_dir() and not any(p.iterdir()):
                p.rmdir()
    return files


def short_hash(*blobs):
    h = hashlib.sha1()
    for b in blobs:
        h.update(b if isinstance(b, bytes) else b.encode())
    return h.hexdigest()[:10]


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    head = (GAME / 'head.html').read_text()
    # modules are concatenated in file-name order into one IIFE (every top-level const / function is shared)
    js = '\n'.join((GAME / f).read_text() for f in sorted(os.listdir(GAME)) if f.endswith('.js'))
    game = '(function(){\n' + js + '\n})();\n'
    if MINIFY:
        game, _ = minify(game)
    (OUT / 'game.js').write_text(game)
    vj = vendor()
    sync(vj, OUT / 'vendor.js')
    if (VENDOR / 'dist' / 'THIRD_PARTY.txt').exists():
        sync(VENDOR / 'dist' / 'THIRD_PARTY.txt', OUT / 'THIRD_PARTY.txt')
    for p in (VENDOR / 'dist' / 'libs').rglob('*'):
        if p.is_file():
            sync(p, OUT / 'libs' / p.relative_to(VENDOR / 'dist' / 'libs'))
    # map data: a classic script declaring MAP_DATA (04_world.js reads it while the game script evaluates)
    mp = ASSETS / 'beijing_map.json'
    mj = OUT / 'assets' / 'map.js'; mj.parent.mkdir(parents=True, exist_ok=True)
    mtxt = 'const MAP_DATA=' + mp.read_text().strip() + ';\n'
    if not mj.exists() or mj.read_text() != mtxt:
        mj.write_text(mtxt)
    for f in ('face.webp', 'bust.webp'):
        sync(ASSETS / f, OUT / 'assets' / f)
    if (ASSETS / 'ATTRIBUTION.md').exists():
        sync(ASSETS / 'ATTRIBUTION.md', OUT / 'assets' / 'ATTRIBUTION.md')
    # runtime assets (models, textures, HDRIs, animations): mirrored, plus a manifest so the game only asks for files that exist
    files = sync_tree(ASSETS / 'runtime', OUT / 'assets' / 'runtime')
    # per-file content hash: the loader asks for url?v=hash, so an updated model is never served from a stale cache
    vers = {f: short_hash((ASSETS / 'runtime' / f).read_bytes())[:8] for f in files}
    man = json.dumps({'files': files, 'v': vers}, ensure_ascii=False, separators=(',', ':'))
    (OUT / 'assets' / 'runtime').mkdir(parents=True, exist_ok=True)
    (OUT / 'assets' / 'runtime' / 'files.json').write_text(man)
    # cache-busting query strings: a new build is never served from a stale browser / Pages cache
    v = lambda p: short_hash(p.read_bytes())
    ver = short_hash(game, man)
    split = head.index('<canvas id="gta-canvas"')
    # service worker: versioned files (?v=hash) cache-first, the rest network-first (a new build is picked up at once)
    (OUT / 'sw.js').write_text(SW_JS.replace('%VER%', ver))
    # the scripts are deferred (the title card paints at once, they download in parallel); the file list is inlined (no extra
    # round trip before the first asset request); the service worker registers straight away (http(s) only; ?nosw skips it)
    boot = ('<script>const FACE_DATA="assets/face.webp",BUST_DATA="assets/bust.webp",BUILD_VER="' + ver + '",ASSET_FILES=' + man + ';'
            'if("serviceWorker"in navigator&&/^https?:$/.test(location.protocol)&&!/[?&]nosw\\b/.test(location.search))navigator.serviceWorker.register("sw.js").catch(function(){});</script>\n')
    scripts = ('<script defer src="vendor.js?v=' + v(OUT / 'vendor.js') + '"></script>\n'
               '<script defer src="assets/map.js?v=' + v(mj) + '"></script>\n'
               '<script defer src="game.js?v=' + v(OUT / 'game.js') + '"></script>\n')
    full = '<!doctype html>\n<html lang="zh-CN">\n<head>\n' + head[:split] + boot + scripts + '</head>\n<body>\n' + head[split:] + '\n</body>\n</html>\n'
    (OUT / PAGE).write_text(full)
    size = sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file())
    return js, size, len(files)


def syntax_check(js):
    """node --check on the concatenated game code (skipped when node is missing)."""
    try:
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
            f.write('const MAP_DATA={};(function(){\n' + js + '\n})();\n')
        r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True)
        os.unlink(f.name)
    except FileNotFoundError:
        return 'skipped (no node)'
    if r.returncode:
        sys.exit('syntax error:\n' + r.stderr)
    return 'ok'


if __name__ == '__main__':
    js, size, nfiles = build()
    chk = syntax_check(js)
    line = f'built {OUT / PAGE}: folder {size // 1024} KB (game js {len(js) // 1024} KB, {nfiles} runtime assets), syntax {chk}'
    print(line)
