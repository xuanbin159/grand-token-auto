"""OpenStreetMap(北京二环一带)→ 游戏地图数据 assets/beijing_map.json

坐标:原点 = 中轴线 × 长安街(lon 116.3910, lat 39.9063);x 向东,z 向南,单位 = 游戏米。
二环以内按 1/4 压缩,二环外按 1/6 压缩。压缩对 x、z 分开做分段线性,
所以正南正北、正东正西的路压缩后依然横平竖直。

输入(data/osm/,由 scripts/map/fetch_osm.sh + data/osm/q_*.ql 从 Overpass 下载,不进 git):
  roads.json water.json rel.json rail.json bld.json lm.json
输出:assets/beijing_map.json(整数坐标,单位 0.1 游戏米)
地图数据 © OpenStreetMap 贡献者,ODbL 1.0。

用法: python3 scripts/map/build_map.py [data/osm] [assets/beijing_map.json]
"""
import json, math, re, sys, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'data' / 'osm'
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'assets' / 'beijing_map.json'

LON0, LAT0 = 116.3910, 39.9063          # 中轴线 × 长安街
MX, MZ = 85522.0, 111033.0              # 每度经 / 纬对应的米(北纬 39.9°)
BOX = dict(w=-3848.0, e=3677.0, s=-4253.0, n=4519.0)   # 二环(米,相对原点)
S_IN, S_OUT = 1 / 4, 1 / 6
CLIP = dict(lon0=116.3315, lon1=116.4495, lat0=39.8570, lat1=39.9585)   # 取数范围:二环外约 1.2 km


def comp(v, lo, hi):
    if v < lo:
        return lo * S_IN + (v - lo) * S_OUT
    if v > hi:
        return hi * S_IN + (v - hi) * S_OUT
    return v * S_IN


def game(lon, lat):
    e, n = (lon - LON0) * MX, (lat - LAT0) * MZ
    return (comp(e, BOX['w'], BOX['e']), -comp(n, BOX['s'], BOX['n']))


def inside_ring_real(lon, lat):
    e, n = (lon - LON0) * MX, (lat - LAT0) * MZ
    return BOX['w'] < e < BOX['e'] and BOX['s'] < n < BOX['n']


GX0, GZ1 = game(CLIP['lon0'], CLIP['lat0'])
GX1, GZ0 = game(CLIP['lon1'], CLIP['lat1'])
BOUNDS = (GX0, GZ0, GX1, GZ1)


def inb(p, m=0.0):
    return BOUNDS[0] - m <= p[0] <= BOUNDS[2] + m and BOUNDS[1] - m <= p[1] <= BOUNDS[3] + m


def q(v):
    return int(round(v * 10))


def flat(pts):
    return [c for p in pts for c in (q(p[0]), q(p[1]))]


def rdp(pts, eps):
    if len(pts) < 3:
        return pts[:]
    a, b = pts[0], pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz)
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        d = abs(dx * (a[1] - p[1]) - dz * (a[0] - p[0])) / L if L > 1e-9 else math.hypot(p[0] - a[0], p[1] - a[1])
        if d > best:
            best, bi = d, i
    if best > eps:
        return rdp(pts[:bi + 1], eps)[:-1] + rdp(pts[bi:], eps)
    return [a, b]


def ring_area(r):
    return 0.5 * sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))


def clip_ring(ring):
    """Sutherland–Hodgman against the map rectangle."""
    x0, z0, x1, z1 = BOUNDS
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            cur, prev = pts[i], pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(inter(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(inter(prev, cur))
        return out
    def ix(xv):
        return lambda a, b: (xv, a[1] + (b[1] - a[1]) * (xv - a[0]) / (b[0] - a[0]))
    def iz(zv):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zv - a[1]) / (b[1] - a[1]), zv)
    pts = ring
    for inside, inter in [(lambda p: p[0] >= x0, ix(x0)), (lambda p: p[0] <= x1, ix(x1)), (lambda p: p[1] >= z0, iz(z0)), (lambda p: p[1] <= z1, iz(z1))]:
        if not pts:
            break
        pts = clip(pts, inside, inter)
    return pts


def poly_out(rings, eps=0.3, min_area=6.0):
    """rings[0] = outer (CCW in x/z → we don't care), rest = holes; clipped + simplified; None if too small."""
    out = []
    for k, r in enumerate(rings):
        r = clip_ring(r)
        if len(r) < 3:
            if k == 0:
                return None
            continue
        rs = rdp(r + [r[0]], eps)[:-1]
        if len(rs) < 3 or abs(ring_area(rs)) < (min_area if k == 0 else 2.0):
            if k == 0:
                return None
            continue
        out.append(flat(rs))
    return out


def assemble_rings(ways):
    """Join member way polylines (lists of (lon,lat)) into closed rings."""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop()
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur[:-1])
    return rings


def geom(e):
    return [(p['lon'], p['lat']) for p in (e.get('geometry') or []) if p]


def load(name):
    p = SRC / name
    return json.load(open(p))['elements'] if p.exists() else []


# ---------------------------------------------------------------- roads
HUTONG_NAME = re.compile(r'胡同|[一二三四五六七八九十]条$|巷|夹道|斜街|湾$|里$|门楼')
MAJOR = {'motorway': 1, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4}
WIDE_NAMES = {'东长安街', '西长安街', '建国门内大街', '复兴门内大街', '建国门外大街', '复兴门外大街'}


def road_class(t, mid):
    hw = t.get('highway', '')
    name = t.get('name', '')
    if hw in MAJOR:
        if name in ('西二环', '北二环', '东二环', '南二环'):
            return 0
        if name in WIDE_NAMES:
            return 1
        return MAJOR[hw]
    if hw == 'pedestrian':
        return 7
    inside = inside_ring_real(*mid)
    if hw in ('residential', 'unclassified', 'living_street', 'service'):
        if inside and (not name or HUTONG_NAME.search(name) or hw in ('living_street', 'service')):
            return 6
        return 5
    return None


def build_roads():
    ways = []
    for e in load('roads.json'):
        t = e['tags']
        if t.get('tunnel') in ('yes', 'building_passage') or t.get('area') == 'yes' or t.get('highway', '').endswith('_link'):
            continue
        g = geom(e)
        if len(g) < 2:
            continue
        mid = g[len(g) // 2]
        cls = road_class(t, mid)
        if cls is None:
            continue
        ways.append((cls, t.get('name', ''), 1 if t.get('oneway') in ('yes', '1', 'true') else (-1 if t.get('oneway') == '-1' else 0), g))
    # junctions = coordinates used by 2+ ways or way ends
    use = collections.Counter()
    for _, _, _, g in ways:
        for p in set(g):
            use[p] += 1
        use[g[0]] += 1
        use[g[-1]] += 1
    names = []
    name_idx = {}
    def nid(n):
        if n not in name_idx:
            name_idx[n] = len(names)
            names.append(n)
        return name_idx[n]
    nid('')
    node_key = {}
    nodes = []
    def node(p):
        if p not in node_key:
            node_key[p] = len(nodes)
            nodes.append(game(*p))
        return node_key[p]
    edges = []
    for cls, name, ow, g in ways:
        if ow == -1:
            g = g[::-1]
            ow = 1
        start = 0
        for i in range(1, len(g)):
            if use[g[i]] >= 2 or i == len(g) - 1:
                chain = g[start:i + 1]
                pts = [game(*p) for p in chain]
                if any(inb(p, 20) for p in pts):
                    edges.append([node(chain[0]), node(chain[-1]), cls, nid(name), ow, pts])
                start = i
    # merge junction nodes that ended up within 1.6 m of each other after compression
    parent = list(range(len(nodes)))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    grid = collections.defaultdict(list)
    used_nodes = sorted({e[0] for e in edges} | {e[1] for e in edges})
    for i in used_nodes:
        x, z = nodes[i]
        grid[(int(x // 2), int(z // 2))].append(i)
    for (gx, gz), lst in grid.items():
        for i in lst:
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for j in grid.get((gx + dx, gz + dz), []):
                        if j > i and math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]) < 1.6:
                            parent[find(j)] = find(i)
    groups = collections.defaultdict(list)
    for i in used_nodes:
        groups[find(i)].append(i)
    rep = {}
    new_nodes = []
    for root, members in groups.items():
        x = sum(nodes[m][0] for m in members) / len(members)
        z = sum(nodes[m][1] for m in members) / len(members)
        k = len(new_nodes)
        new_nodes.append((x, z))
        for m in members:
            rep[m] = k
    out_edges, seen = [], set()
    for a, b, cls, nm, ow, pts in edges:
        a2, b2 = rep[a], rep[b]
        pts = [new_nodes[a2]] + pts[1:-1] + [new_nodes[b2]]
        pts = rdp(pts, 0.35)
        L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
        if a2 == b2 and L < 8:
            continue
        if L < 0.8:
            continue
        key = (min(a2, b2), max(a2, b2), cls, round(L))
        if key in seen:
            continue
        seen.add(key)
        out_edges.append([a2, b2, cls, nm, ow, flat(pts[1:-1])])
    # drop nodes no longer referenced
    ref = sorted({e[0] for e in out_edges} | {e[1] for e in out_edges})
    remap = {o: i for i, o in enumerate(ref)}
    for e in out_edges:
        e[0], e[1] = remap[e[0]], remap[e[1]]
    return flat([new_nodes[i] for i in ref]), out_edges, names


# ---------------------------------------------------------------- water, green, landmarks
def underground(t):
    """culverted / covered channels (前三门护城河 …) run under the streets: no open water in the game"""
    try:
        layer = int(t.get('layer', '0'))
    except ValueError:
        layer = 0
    return t.get('tunnel') in ('culvert', 'yes') or t.get('covered') == 'yes' or layer < 0


def build_areas():
    water, green, rivers = [], [], []
    GREEN = {'park': 'park', 'garden': 'park', 'grass': 'grass', 'forest': 'forest', 'recreation_ground': 'park', 'village_green': 'grass',
             'cemetery': 'forest', 'pitch': 'pitch', 'stadium': 'stadium', 'sports_centre': 'pitch'}
    def green_type(t):
        return GREEN.get(t.get('leisure')) or GREEN.get(t.get('landuse'))
    for e in load('water.json'):
        if e['type'] != 'way':
            continue
        t = e['tags']
        g = geom(e)
        if len(g) < 3:
            continue
        closed = g[0] == g[-1]
        if t.get('natural') == 'water' or t.get('landuse') in ('reservoir', 'basin'):
            if closed:
                p = poly_out([[game(*c) for c in g[:-1]]])
                if p:
                    water.append(p)
        elif t.get('waterway'):
            if underground(t):
                continue
            pts = [game(*c) for c in g]
            if any(inb(p) for p in pts):
                w = {'river': 7.0, 'canal': 5.0, 'moat': 5.0}.get(t['waterway'], 3.0)
                rivers.append([q(w)] + flat(rdp(pts, 0.4)))
        else:
            gt = green_type(t)
            if gt and closed:
                p = poly_out([[game(*c) for c in g[:-1]]], min_area=20)
                if p:
                    green.append([gt, t.get('name', '')] + [p])
    for e in load('rel.json'):
        t = e['tags']
        members = e.get('members', [])
        outers = [[(p['lon'], p['lat']) for p in m['geometry']] for m in members if m.get('role') in ('outer', '') and m.get('geometry')]
        inners = [[(p['lon'], p['lat']) for p in m['geometry']] for m in members if m.get('role') == 'inner' and m.get('geometry')]
        is_water = t.get('natural') == 'water'
        gt = green_type(t)
        if t.get('waterway') and not is_water:
            if underground(t):
                continue
            for w in outers:
                pts = [game(*c) for c in w]
                if any(inb(p) for p in pts):
                    rivers.append([q(6.0)] + flat(rdp(pts, 0.4)))
            continue
        if not (is_water or gt):
            continue
        orings = assemble_rings(outers)
        irings = assemble_rings(inners)
        for o in orings:
            og = [game(*c) for c in o]
            holes = [[game(*c) for c in r] for r in irings if point_in(game(*r[0]), og)]
            p = poly_out([og] + holes, min_area=6 if is_water else 20)
            if p:
                (water.append(p) if is_water else green.append([gt, t.get('name', '')] + [p]))
    return water, green, rivers


def point_in(p, ring):
    x, z = p
    c = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, zi = ring[i]
        xj, zj = ring[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            c = not c
        j = i
    return c


LM_WAYS = {  # OSM way id → key (hand-picked: the famous ones, not the many small 钟楼/鼓楼 in temples)
    638156366: 'wumen', 638741722: 'shenwumen', 40343947: 'donghuamen', 40343948: 'xihuamen', 638308745: 'taihemen',
    638449347: 'taihedian', 638473398: 'baohedian', 638981317: 'qianqinggong', 638981229: 'jiaotaidian', 639012193: 'kunninggong',
    26390235: 'wanchunting', 561193504: 'baita', 9487828: 'qionghuadao', 267371087: 'gulou', 425993664: 'zhonglou',
    25109960: 'zhengyangmen', 439956436: 'jianlou', 228041535: 'yongdingmen', 43921139: 'qiniandian', 237696580: 'yuanqiu',
    43921121: 'huangqiongyu', 4974233: 'nctpa', 24825312: 'yonghegong', 26514871: 'gongwangfu', 26514845: 'deshengmen',
    488647832: 'jiaolou', 365351685: 'zhongnanhai', 255625137: 'xinhuamen', 25109939: 'taimiao', 25109930: 'shejitan',
    131710744: 'meishuguan', 191693413: 'gongti', 78050667: 'ditan', 123893918: 'ritan',
}
LM_RELS = {9511883: 'gugong', 941596: 'square', 7033336: 'bjstation', 8848388: 'dahuitang', 8607825: 'museum', 8848142: 'jiniantang',
           8847697: 'tiananmen', 8847722: 'monument', 8854349: 'zhonghedian', 9054319: 'taimiao_park', 9054321: 'zhongshan'}


def build_landmarks():
    lm = {}
    for e in load('lm.json'):
        if e['type'] == 'way' and e['id'] in LM_WAYS:
            g = [game(*c) for c in geom(e)]
            if g:
                lm[LM_WAYS[e['id']]] = flat(rdp(g, 0.2))
    for e in load('rel.json'):
        if e['id'] in LM_RELS:
            outers = [[(p['lon'], p['lat']) for p in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            rings = assemble_rings(outers)
            if rings:
                big = max(rings, key=lambda r: abs(ring_area([game(*c) for c in r])))
                lm[LM_RELS[e['id']]] = flat(rdp([game(*c) for c in big], 0.2))
    return lm


# ---------------------------------------------------------------- subway, rail, building hints, the ring
def build_transit():
    stations, lines, rail = [], collections.defaultdict(list), []
    els = load('rail.json')
    for e in els:
        t = e['tags']
        if e['type'] == 'way' and t.get('railway') == 'subway':
            ref = t.get('name', '') + ' ' + t.get('ref', '') + ' ' + t.get('line', '')
            m = re.search(r'(\d+)号线', ref)
            if m:
                lines[int(m.group(1))].append([game(*c) for c in geom(e)])
        elif e['type'] == 'way' and t.get('railway') == 'rail' and t.get('service') not in ('yard', 'siding', 'spur'):
            pts = [game(*c) for c in geom(e)]
            if sum(1 for p in pts if inb(p)) >= 2:
                rail.append(flat(rdp(pts, 0.5)))
    seen = set()
    for e in els:
        t = e['tags']
        if e['type'] == 'node' and (t.get('station') == 'subway' or t.get('railway') == 'station') and t.get('name'):
            p = game(e['lon'], e['lat'])
            if not inb(p) or t['name'] in seen:
                continue
            seen.add(t['name'])
            near = sorted({ln for ln, segs in lines.items() for seg in segs for s in seg if math.hypot(s[0] - p[0], s[1] - p[1]) < 30})
            stations.append([t['name'], q(p[0]), q(p[1]), near, 1 if t.get('station') == 'subway' else 0])
    return stations, rail


def build_hints(cell=32.0):
    x0, z0, x1, z1 = BOUNDS
    w, h = int(math.ceil((x1 - x0) / cell)), int(math.ceil((z1 - z0) / cell))
    cnt = [0] * (w * h)
    lev_sum = [0.0] * (w * h)
    lev_n = [0] * (w * h)
    lev_max = [0] * (w * h)
    DEF = {'apartments': 9, 'residential': 5, 'commercial': 6, 'office': 12, 'retail': 3, 'hotel': 10, 'hospital': 6, 'school': 4,
           'university': 5, 'house': 1, 'bungalow': 1, 'roof': 1, 'temple': 1, 'transportation': 3}
    for e in load('bld.json'):
        c = e.get('center')
        if not c:
            continue
        p = game(c['lon'], c['lat'])
        if not inb(p):
            continue
        i, j = int((p[0] - x0) / cell), int((p[1] - z0) / cell)
        if not (0 <= i < w and 0 <= j < h):
            continue
        k = j * w + i
        cnt[k] += 1
        t = e['tags']
        lv = None
        try:
            if 'building:levels' in t:
                lv = float(re.findall(r'[\d.]+', t['building:levels'])[0])
            elif 'height' in t:
                lv = float(re.findall(r'[\d.]+', t['height'])[0]) / 3.2
        except (IndexError, ValueError):
            lv = None
        if lv is None:
            lv = DEF.get(t.get('building'))
        if lv:
            lev_sum[k] += lv
            lev_n[k] += 1
            lev_max[k] = max(lev_max[k], int(lv))
    avg = [int(round(lev_sum[k] / lev_n[k])) if lev_n[k] else 0 for k in range(w * h)]
    return {'cell': cell, 'w': w, 'h': h, 'count': cnt, 'avg': avg, 'max': lev_max}


def build_ring():
    """二环主路中线:四条名字各取一条方向,按角度排序成环(给轻轨、雷达用)。"""
    pts = []
    for e in load('ring2.json'):
        t = e['tags']
        if t.get('highway') == 'trunk' and t.get('name') in ('西二环', '北二环', '东二环', '南二环'):
            pts += [game(*c) for c in geom(e)]
    if not pts:
        return []
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    bins = {}
    for p in pts:
        a = math.atan2(p[1] - cz, p[0] - cx)
        k = int((a + math.pi) / (2 * math.pi) * 360) % 360
        r = math.hypot(p[0] - cx, p[1] - cz)
        bins.setdefault(k, []).append((r, p))
    ring = []
    for k in sorted(bins):
        lst = sorted(bins[k])
        r, p = lst[len(lst) // 2]
        ring.append(p)
    ring = rdp(ring + [ring[0]], 1.5)[:-1]
    return flat(ring)


def main():
    nodes, edges, names = build_roads()
    water, green, rivers = build_areas()
    lm = build_landmarks()
    stations, rail = build_transit()
    hints = build_hints()
    ring = build_ring()
    data = {
        'v': 1, 'unit': 0.1, 'attribution': '地图数据 © OpenStreetMap 贡献者 (ODbL)',
        'proj': {'lon0': LON0, 'lat0': LAT0, 'mx': MX, 'mz': MZ, 'box': BOX, 's_in': S_IN, 's_out': S_OUT},
        'bounds': [q(v) for v in BOUNDS], 'ring2': ring,
        'nodes': nodes, 'edges': edges, 'names': names,
        'water': water, 'rivers': rivers, 'green': green, 'lm': lm,
        'stations': stations, 'rail': rail, 'hint': hints,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    cls = collections.Counter(e[2] for e in edges)
    print(f'bounds {[round(v) for v in BOUNDS]}  size {round(BOUNDS[2] - BOUNDS[0])}x{round(BOUNDS[3] - BOUNDS[1])}')
    print(f'nodes {len(nodes) // 2}  edges {len(edges)} {dict(sorted(cls.items()))}  names {len(names)}')
    print(f'water {len(water)}  rivers {len(rivers)}  green {len(green)}  landmarks {len(lm)}  stations {len(stations)}  rail {len(rail)}  ring {len(ring) // 2}')
    print(f'wrote {OUT} {OUT.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
