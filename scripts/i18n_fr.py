"""构建期法语本地化转换器:把 head.html 与拼接后的 game.js 转换为法语版,并注入中/法切换按钮。"""
import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
DATA = json.loads((HERE / 'i18n_fr.json').read_text(encoding='utf-8'))
STRS = DATA['strs']
TPLS = DATA['tpls']
HTML_REPLACE = DATA['html_replace']

TR_PLACE_JS = (
    'const __CHAR_PY=' + json.dumps(DATA['char_py'], ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const __PLACE_EX=' + json.dumps(DATA['place_exact'], ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const __PLACE_RL=' + json.dumps(DATA['place_rules'], ensure_ascii=False, separators=(',', ':')) + ';\n'
    'function __pyWord(s){let o="";for(const c of String(s||""))o+=__CHAR_PY[c]||c;return o?o[0].toUpperCase()+o.slice(1):"";}\n'
    'function __trPlace(s){'
    'if(!s||!/[\\u4e00-\\u9fff]/.test(s))return s;'
    'if(__PLACE_EX[s])return __PLACE_EX[s];'
    'for(const[suf,tpl]of __PLACE_RL)if(s.endsWith(suf)&&s.length>suf.length)return tpl.replace("{0}",__pyWord(s.slice(0,-suf.length)));'
    'return __pyWord(s);}\n'
)


def parse_js(code, i=0, stop_char=None):
    n = len(code)
    tokens = []
    raw_start = i
    depth = 0
    last_sig = ''

    def flush_raw(upto):
        nonlocal raw_start
        if upto > raw_start:
            tokens.append(('raw', code[raw_start:upto]))
        raw_start = upto

    while i < n:
        c = code[i]
        if stop_char == '}' and c == '{':
            depth += 1; last_sig = '{'; i += 1; continue
        if stop_char == '}' and c == '}':
            if depth == 0:
                flush_raw(i); return tokens, i + 1
            depth -= 1; last_sig = '}'; i += 1; continue
        if c == '/' and i + 1 < n and code[i + 1] == '/':
            j = code.find('\n', i + 2); i = n if j < 0 else j + 1; continue
        if c == '/' and i + 1 < n and code[i + 1] == '*':
            j = code.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c == '/' and (not last_sig or last_sig in '({[=,:;!&|?+-*~^%<>/' or last_sig in ('return', 'case', 'typeof', 'void', 'delete', 'in', 'of', 'new')):
            j = i + 1; in_cc = False; ok_re = False
            while j < n:
                rc = code[j]
                if rc == '\\': j += 2
                elif rc == '[': in_cc = True; j += 1
                elif rc == ']': in_cc = False; j += 1
                elif rc == '/' and not in_cc:
                    j += 1
                    while j < n and code[j].isalpha(): j += 1
                    ok_re = True; break
                elif rc == '\n': break
                else: j += 1
            if ok_re: last_sig = '/re/'; i = j; continue
        if c in ("'", '"'):
            flush_raw(i); q = c; j = i + 1
            while j < n:
                if code[j] == '\\': j += 2
                elif code[j] == q: j += 1; break
                else: j += 1
            tokens.append(('str', q, code[i + 1:j - 1]))
            raw_start = j; last_sig = 'str'; i = j; continue
        if c == '`':
            flush_raw(i); j = i + 1; parts = []; exprs = []; cur = []
            while j < n:
                if code[j] == '\\': cur.append(code[j:j + 2]); j += 2
                elif code[j] == '`': parts.append(''.join(cur)); j += 1; break
                elif code[j:j + 2] == '${':
                    parts.append(''.join(cur)); cur = []
                    sub_tokens, j = parse_js(code, j + 2, stop_char='}')
                    exprs.append(sub_tokens)
                else: cur.append(code[j]); j += 1
            tokens.append(('tpl', parts, exprs))
            raw_start = j; last_sig = 'tpl'; i = j; continue
        if not c.isspace():
            if c.isalnum() or c in '_$':
                m = re.match(r'[A-Za-z0-9_$]+', code[i:])
                w = m.group(0); last_sig = w; i += len(w); continue
            else: last_sig = c
        i += 1
    flush_raw(n)
    return tokens, n


def _esc_quote(s, q):
    # Escape unescaped quote q in s
    out = []
    i, n = 0, len(s)
    while i < n:
        if s[i] == '\\' and i + 1 < n:
            out.append(s[i:i + 2]); i += 2
        elif s[i] == q:
            out.append('\\' + q); i += 1
        else:
            out.append(s[i]); i += 1
    return ''.join(out)


def _translate_tokens(tokens):
    out = []
    prev_raw = ''
    for t in tokens:
        if t[0] == 'raw':
            out.append(t[1])
            prev_raw = t[1]
        elif t[0] == 'str':
            q, inner = t[1], t[2]
            # Keep internal OSM map lookup arguments intact
            if re.search(r'\b(?:road|stationXZ)\(\s*$', prev_raw):
                out.append(q + inner + q)
            elif inner in STRS:
                out.append(q + _esc_quote(STRS[inner], q) + q)
            else:
                out.append(q + inner + q)
            prev_raw = ''
        elif t[0] == 'tpl':
            parts, exprs = t[1], t[2]
            tr_exprs = [_translate_tokens(ex) for ex in exprs]
            pattern = ''.join(p + (f'{{{idx}}}' if idx < len(exprs) else '') for idx, p in enumerate(parts))
            if pattern in TPLS:
                fr_pat = TPLS[pattern]
                # Replace {0}, {1}, ... with ${tr_exprs[i]}
                def repl(m):
                    idx = int(m.group(1))
                    return '${' + tr_exprs[idx] + '}' if idx < len(tr_exprs) else m.group(0)
                body = re.sub(r'\{(\d+)\}', repl, fr_pat)
                out.append('`' + body + '`')
            else:
                s = ['`']
                for idx, p in enumerate(parts):
                    s.append(p)
                    if idx < len(tr_exprs):
                        s.append('${' + tr_exprs[idx] + '}')
                s.append('`')
                out.append(''.join(s))
            prev_raw = ''
    return ''.join(out)


def translate_js(js):
    tokens, _ = parse_js(js)
    fr = _translate_tokens(tokens)
    # Fix colon split in 14_ui.js for French equipment descriptions
    fr = fr.replace(".desc.split('：').pop()", ".desc.split(/：|:\\s*/).pop()")
    # Hook dynamic OSM map names in v3 to __trPlace
    fr = fr.replace('return [nm, en];', 'return [__trPlace(nm), en];')
    fr = fr.replace('return [Places.area(x, z),', 'return [__trPlace(Places.area(x, z)),')
    fr = fr.replace("const name = raw.replace(/[(（].*?[)）]/g, '').replace(/站$/, '');",
                    "const name = __trPlace(raw.replace(/[(（].*?[)）]/g, '').replace(/站$/, ''));")
    fr = fr.replace("add(n, [P4[0], P4[1]], tier, 'street'", "add(__trPlace(n), [P4[0], P4[1]], tier, 'street'")
    fr = fr.replace("areaAdd(q.gp.name, q.gp.rings[0]);", "areaAdd(__trPlace(q.gp.name), q.gp.rings[0]);")
    fr = fr.replace("if (!inside && /门$/.test(best.name) && bd > 90 * 90) return best.name + ' Ext.';\n    return best.name;",
                    "if (!inside && /门$/.test(best.name) && bd > 90 * 90) return __trPlace(best.name) + ' Ext.';\n    return __trPlace(best.name);")
    fr = fr.replace("street(x, z) { const n = Roads.nearest(x, z, 24); return n && n.e.name && n.d < n.e.hw + 6 ? n.e.name : ''; }",
                    "street(x, z) { const n = Roads.nearest(x, z, 24); return n && n.e.name && n.d < n.e.hw + 6 ? __trPlace(n.e.name) : ''; }")
    fr = fr.replace("where(x, z) { const n = Roads.nearest(x, z, 40); return n && n.e.name ? n.e.name :",
                    "where(x, z) { const n = Roads.nearest(x, z, 40); return n && n.e.name ? __trPlace(n.e.name) :")
    fr = fr.replace("for (const [n, sx, sz] of ST) { const d = dist2(x, z, sx, sz); if (d < bd) { bd = d; b = n; } } return b;",
                    "for (const [n, sx, sz] of ST) { const d = dist2(x, z, sx, sz); if (d < bd) { bd = d; b = __trPlace(n); } } return b;")
    fr = fr.replace("fitFont(g, n, 224, 36, 900); g.fillText(n, x + 128, y + 30);",
                    "fitFont(g, __trPlace(n), 224, 36, 900); g.fillText(__trPlace(n), x + 128, y + 30);")
    fr = fr.replace("fitFont(g, n, 220, 40, 900); g.fillText(n, x + 128, y + 33);",
                    "fitFont(g, __trPlace(n), 220, 40, 900); g.fillText(__trPlace(n), x + 128, y + 33);")
    return TR_PLACE_JS + fr


def add_lang_switch(head_html, target_href, label):
    h = head_html.replace('#t-face{', '#t-face,#t-lang{')
    btn_t = f'<button id="t-lang" type="button" onclick="location.href=\'{target_href}\'+location.search+location.hash">{label}</button>'
    btn_p = f'<button id="p-lang" type="button" onclick="location.href=\'{target_href}\'+location.search+location.hash">{label}</button>'
    h = re.sub(r'(<button id="t-face"[^>]*>.*?</button>)', r'\1\n      ' + btn_t, h, count=1)
    h = re.sub(r'(<button id="p-restart"[^>]*>.*?</button>)', r'\1' + btn_p, h, count=1)
    return h


def translate_html(head_html, zh_href='index.html'):
    h = head_html
    for a, b in HTML_REPLACE:
        h = h.replace(a, b)
    return add_lang_switch(h, zh_href, '中文')
