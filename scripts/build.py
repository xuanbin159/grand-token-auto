"""把 game/*.js + head.html + assets 拼成一个能直接双击打开的 HTML:dist/grand-token-auto.html
用法: python3 scripts/build.py
"""
import base64, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
GAME, ASSETS, DIST = ROOT / 'game', ROOT / 'assets', ROOT / 'dist'
PP = ['EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'CopyShader.js', 'LuminosityHighPassShader.js', 'UnrealBloomPass.js', 'FXAAShader.js']

head = (GAME / 'head.html').read_text()
three = (ASSETS / 'three.min.js').read_text()
pp = ''.join((ASSETS / 'pp' / f).read_text() + '\n' for f in PP)
b64 = lambda f: base64.b64encode((ASSETS / f).read_bytes()).decode()
js = '\n'.join((GAME / f).read_text() for f in sorted(os.listdir(GAME)) if f.endswith('.js'))
split = head.index('<canvas id="gta-canvas"')
scripts = ('<script>' + three + '</script>\n<script>' + pp + '</script>\n'
           '<script>const FACE_DATA="data:image/webp;base64,' + b64('face.webp') + '";'
           'const BUST_DATA="data:image/webp;base64,' + b64('bust.webp') + '";</script>\n'
           '<script>\n(function(){\n' + js + '\n})();\n</script>\n')
full = '<!doctype html>\n<html lang="zh-CN">\n<head>\n' + head[:split] + '</head>\n<body>\n' + head[split:] + '\n' + scripts + '</body>\n</html>\n'
DIST.mkdir(exist_ok=True)
(DIST / 'grand-token-auto.html').write_text(full)
check = 'skipped (no node)'
try:
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
        f.write('(function(){\n' + js + '\n})();\n')
    r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); os.unlink(f.name)
    if r.returncode:
        sys.exit('syntax error:\n' + r.stderr)
    check = 'ok'
except FileNotFoundError:
    pass
print(f'built dist/grand-token-auto.html: {len(full) // 1024} KB, syntax {check}')
