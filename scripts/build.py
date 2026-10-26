"""把 game/*.js + head.html + assets 拼成能直接双击打开的 HTML:dist/grand-token-auto.html 与 dist/grand-token-auto-fr.html
用法: python3 scripts/build.py
"""
import base64, os, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import i18n_fr
GAME, ASSETS, DIST = ROOT / 'game', ROOT / 'assets', ROOT / 'dist'
PP = ['EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'CopyShader.js', 'LuminosityHighPassShader.js', 'UnrealBloomPass.js', 'FXAAShader.js']

head_raw = (GAME / 'head.html').read_text()
head = i18n_fr.add_lang_switch(head_raw, 'grand-token-auto-fr.html', 'Français')
head_fr = i18n_fr.translate_html(head_raw, 'grand-token-auto.html')
three = (ASSETS / 'three.min.js').read_text()
pp = ''.join((ASSETS / 'pp' / f).read_text() + '\n' for f in PP)
b64 = lambda f: base64.b64encode((ASSETS / f).read_bytes()).decode()
js = '\n'.join((GAME / f).read_text() for f in sorted(os.listdir(GAME)) if f.endswith('.js'))
fr_js = i18n_fr.translate_js(js)
split = head.index('<canvas id="gta-canvas"')
split_fr = head_fr.index('<canvas id="gta-canvas"')
common = ('<script>' + three + '</script>\n<script>' + pp + '</script>\n'
          '<script>const FACE_DATA="data:image/webp;base64,' + b64('face.webp') + '";'
          'const BUST_DATA="data:image/webp;base64,' + b64('bust.webp') + '";</script>\n')
scripts = common + '<script>\n(function(){\n' + js + '\n})();\n</script>\n'
scripts_fr = common + '<script>\n(function(){\n' + fr_js + '\n})();\n</script>\n'
full = '<!doctype html>\n<html lang="zh-CN">\n<head>\n' + head[:split] + '</head>\n<body>\n' + head[split:] + '\n' + scripts + '</body>\n</html>\n'
full_fr = '<!doctype html>\n<html lang="fr">\n<head>\n' + head_fr[:split_fr] + '</head>\n<body>\n' + head_fr[split_fr:] + '\n' + scripts_fr + '</body>\n</html>\n'
DIST.mkdir(exist_ok=True)
(DIST / 'grand-token-auto.html').write_text(full)
(DIST / 'grand-token-auto-fr.html').write_text(full_fr)
check = 'skipped (no node)'
try:
    for code in (js, fr_js):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
            f.write('(function(){\n' + code + '\n})();\n')
        r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); os.unlink(f.name)
        if r.returncode:
            sys.exit('syntax error:\n' + r.stderr)
    check = 'ok'
except FileNotFoundError:
    pass
print(f'built dist/grand-token-auto.html + grand-token-auto-fr.html: {len(full) // 1024} KB, syntax {check}')
