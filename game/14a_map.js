/* ============================================================
   map: the base map painted once from the OSM vectors (roads by
   class, water, parks, plazas, landmark outlines, the 二环), the
   radar that turns with the camera, the big map (pause screen +
   地图 tab: drag, pinch / wheel zoom, tap = waypoint), the GPS
   (A* on the road graph: one-ways when driving, hutongs on foot)
   and the place names for the GTA-style corner caption
   ============================================================ */
const MAPC = {
  bg: '#15181d', land: '#2c3137', old: '#35312c', ground: '#3d312b', plaza: '#46433e', square: '#514d47',
  park: '#2b4530', grass: '#304838', forest: '#253d2a', pitch: '#33503a', stadium: '#39434e', water: '#2e5b82',
  rail: '#596069', bld: 'rgba(255,255,255,.075)', casing: '#111317',
  // road fill per class: 二环 · trunk · primary · secondary · tertiary · residential · hutong · pedestrian
  road: ['#e9ba4b', '#dde0e4', '#bfc4cb', '#a3a9b1', '#8d939b', '#737982', '#5b5751', '#67625a'],
  gold: '#c99b3b', blue: '#4b6fbb', marble: '#d5cfc1', civic: '#58606a', gate: '#8f5a3b', wall: '#9b3f2e', white: '#e6e2d8',
  route: '#c46bff', mission: '#ffd23f',
};
// walled grounds (painted under the parks) and single buildings (painted over the city blocks)
const LM_GROUND = ['gugong', 'taimiao_park', 'zhongshan', 'shejitan', 'taimiao', 'gongwangfu', 'yonghegong'];
const LM_HALL = {
  wumen: 'gold', taihemen: 'gold', taihedian: 'gold', zhonghedian: 'gold', baohedian: 'gold', qianqinggong: 'gold', jiaotaidian: 'gold', kunninggong: 'gold',
  shenwumen: 'gold', tiananmen: 'gold', donghuamen: 'gold', xihuamen: 'gold', xinhuamen: 'gold', wanchunting: 'gold',
  zhengyangmen: 'gate', jianlou: 'gate', deshengmen: 'gate', yongdingmen: 'gate', jiaolou: 'gate', gulou: 'gate', zhonglou: 'gate',
  qiniandian: 'blue', huangqiongyu: 'blue', yuanqiu: 'marble', monument: 'marble', baita: 'white',
  museum: 'civic', dahuitang: 'civic', nctpa: 'civic', bjstation: 'civic', meishuguan: 'civic', gongti: 'civic', jiniantang: 'civic',
};
// the doors you can walk into: [glyph, colour]
const MAP_ICON = {
  home: ['府', '#d7263d'], snack: ['吃', '#ea580c'], electronics: ['卡', '#0891b2'], clothes: ['衣', '#b4402f'], dept: ['百', '#a16207'], antique: ['古', '#7c2d12'],
  shoes: ['鞋', '#92400e'], pharmacy: ['药', '#15803d'], duck: ['鸭', '#b91c1c'], teahouse: ['茶', '#0f766e'], hardware: ['砖', '#57534e'], gym: ['健', '#c2410c'],
  lab: ['X', '#10b981'], dojo: ['道', '#7c2d12'], arkham: ['阿', '#4d7c0f'],
};
const mapDoorOk = (d) => MAP_ICON[d.interior] && !d.locked && !(d.interior === 'dojo' && Story.flags.dojoBurnt);
const fmtDist = (m) => (m < 950 ? Math.max(10, Math.round(m / 10) * 10) + ' 米' : (m / 1000).toFixed(1) + ' 公里');

/* ---------------- the painted base map: a detail level (radar, zoomed-in big map) + an overview ---------------- */
const MapGfx = {
  E: null, lv: null, ms: 0,
  ready() { if (!this.lv) this.build(); return this.lv; },
  build() {
    const B = W.bounds, m = 40, t0 = performance.now();
    this.E = { x0: B.x0 - m, z0: B.z0 - m, x1: B.x1 + m, z1: B.z1 + m };
    // phones: 0.75 px/m keeps the detail canvas ~3.6 Mpx; the overview has exaggerated road widths for the zoomed-out map
    this.lv = [this.paint(LOWQ ? 0.75 : 1, false), this.paint(0.3, true)];
    this.ms = Math.round(performance.now() - t0);
  },
  paint(k, over) {
    const E = this.E, C = MAPC, px = 1 / k, c = mkCanvas(Math.ceil((E.x1 - E.x0) * k), Math.ceil((E.z1 - E.z0) * k)), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, -E.x0 * k, -E.z0 * k); // draw in world metres
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = (rings) => { g.beginPath(); for (const r of rings) { for (let i = 0; i < r.length; i++) i ? g.lineTo(r[i][0], r[i][1]) : g.moveTo(r[i][0], r[i][1]); g.closePath(); } };
    const fill = (rings, col) => { if (!rings || !rings[0]) return; path(rings); g.fillStyle = col; g.fill('evenodd'); };
    const line = (pts) => { for (let i = 0; i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); };
    g.fillStyle = C.land; g.fillRect(E.x0, E.z0, E.x1 - E.x0, E.z1 - E.z0);
    if (W.ringPoly) fill([W.ringPoly], C.old);
    for (const key of LM_GROUND) { const p = lmPts(key); if (p) fill([p], C.ground); }
    const zn = lmPts('zhongnanhai'); if (zn) fill([zn], C.grass); // gardens round the lakes
    for (const gp of W.greenPolys || []) fill(gp.rings, C[gp.type] || C.park);
    for (const r of W.plazaPolys || []) fill(r, C.plaza);
    const sq = lmPts('square'); if (sq) fill([sq], C.square);
    // water: lakes, moats, rivers, the 金水河 channels
    g.fillStyle = C.water; g.strokeStyle = C.water;
    for (const wv of W.water) if (!wv.line) { path(wv); g.fill('evenodd'); }
    for (const wv of W.water) if (wv.line) { g.lineWidth = Math.max(wv.w, 1.5 * px); g.beginPath(); line(wv.line); g.stroke(); }
    for (const d of W.decoWater || []) g.fillRect(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0);
    // every building footprint, a touch lighter than the ground under it (walls come out as thin lines)
    if (!over) {
      g.beginPath();
      for (const s of W.solids) {
        if (s.kind === 'pillar' || s.kind === 'hq' || (s.h || 0) < 2) continue;
        if (s.obb) { const ax = s.ux * s.hx, az = s.uz * s.hx, bx = -s.uz * s.hz, bz = s.ux * s.hz; g.moveTo(s.cx - ax - bx, s.cz - az - bz); g.lineTo(s.cx + ax - bx, s.cz + az - bz); g.lineTo(s.cx + ax + bx, s.cz + az + bz); g.lineTo(s.cx - ax + bx, s.cz - az + bz); g.closePath(); }
        else g.rect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0);
      }
      g.fillStyle = C.bld; g.fill();
    }
    const gg = lmPts('gugong'); if (gg) { path([gg]); g.lineWidth = Math.max(3, 1.4 * px); g.strokeStyle = C.wall; g.stroke(); }
    for (const key in LM_HALL) { const p = lmPts(key); if (p) fill([p], C[LM_HALL[key]]); }
    // railways
    g.strokeStyle = C.rail; g.lineWidth = Math.max(1.2, px); g.setLineDash([6, 4]); g.beginPath();
    for (const f of MAPD.raw.rail || []) line(MAPD.pts(f));
    g.stroke(); g.setLineDash([]);
    // streets: hutongs and walks, then every casing, then the fills from small to big so junctions stay clean
    const byCls = [[], [], [], [], [], [], [], []];
    for (const e of Roads.edges) byCls[e.cls].push(e);
    const minPx = over ? [2.8, 2.4, 1.9, 1.5, 1.2, 0.9, 0.6, 0.6] : [2.4, 2.2, 1.8, 1.5, 1.3, 1.1, 0.9, 0.9];
    const wid = (e) => Math.max(e.w * (over ? 1.25 : 1), minPx[e.cls] * px);
    const stroke = (list, extra, col) => {
      const groups = new Map();
      for (const e of list) { const lw = wid(e) + extra; let a = groups.get(lw); if (!a) groups.set(lw, a = []); a.push(e); }
      g.strokeStyle = col;
      for (const [lw, es] of groups) { g.lineWidth = lw; g.beginPath(); for (const e of es) line(e.pts); g.stroke(); }
    };
    stroke(byCls[6], 0, C.road[6]); stroke(byCls[7], 0, C.road[7]);
    for (let q = 5; q >= 0; q--) stroke(byCls[q], (over ? 1.2 : 1.6) * px, C.casing);
    for (let q = 5; q >= 0; q--) stroke(byCls[q], 0, C.road[q]);
    return { c, k };
  },
  // draw the part of level L covering [x0,x1]×[z0,z1] (world) under the caller's world-space transform
  blit(g, L, x0, z0, x1, z1) {
    const { c, k } = this.ready()[L], E = this.E;
    x0 = Math.max(x0, E.x0); z0 = Math.max(z0, E.z0); x1 = Math.min(x1, E.x1); z1 = Math.min(z1, E.z1);
    if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
    const sx = (x0 - E.x0) * k, sy = (z0 - E.z0) * k, sw = Math.min(c.width - sx, (x1 - x0) * k), sh = Math.min(c.height - sy, (z1 - z0) * k);
    if (sw >= 1 && sh >= 1) g.drawImage(c, sx, sy, sw, sh, x0, z0, sw / k, sh / k);
  },
};

/* ---------------- small cached sprites for the blips (no text shaping per frame) ---------------- */
const MapIcons = {
  cache: new Map(),
  get(key, size, paint) {
    size = Math.max(4, Math.round(size));
    const id = key + '|' + size; let c = this.cache.get(id);
    if (!c) { c = mkCanvas(size, size); paint(c.getContext('2d'), size); this.cache.set(id, c); }
    return c;
  },
  put(g, x, y, key, size, paint) { const c = this.get(key, size, paint); g.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); },
  // round badge: dark rim, white ring, coloured disc, white glyph
  badge(ch, col, sq = false) {
    return (g, s) => {
      const r = s / 2, R = r - 0.5;
      const shape = (rr) => { g.beginPath(); if (sq) { const a = r - rr, w = rr * 2, q = rr * 0.35; g.moveTo(a + q, a); g.arcTo(a + w, a, a + w, a + w, q); g.arcTo(a + w, a + w, a, a + w, q); g.arcTo(a, a + w, a, a, q); g.arcTo(a, a, a + w, a, q); g.closePath(); } else g.arc(r, r, rr, 0, TAU); };
      shape(R); g.fillStyle = 'rgba(8,10,13,.85)'; g.fill();
      shape(R - s * 0.07); g.fillStyle = '#fff'; g.fill();
      shape(R - s * 0.14); g.fillStyle = col; g.fill();
      if (ch) { g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${Math.round(s * (ch.length > 1 ? 0.36 : 0.5))}px ${FONT_CN}`; g.fillText(ch, r, r + s * 0.04); }
    };
  },
  dot(col, ring = '#fff') { return (g, s) => { const r = s / 2; g.beginPath(); g.arc(r, r, r - 0.5, 0, TAU); g.fillStyle = 'rgba(8,10,13,.8)'; g.fill(); g.beginPath(); g.arc(r, r, r - s * 0.16, 0, TAU); g.fillStyle = ring; g.fill(); g.beginPath(); g.arc(r, r, r - s * 0.28, 0, TAU); g.fillStyle = col; g.fill(); }; },
  // 地铁: a white ring on the line colour, like the station signs
  metro(col) { return (g, s) => { const r = s / 2; g.beginPath(); g.arc(r, r, r - 0.5, 0, TAU); g.fillStyle = 'rgba(8,10,13,.8)'; g.fill(); g.beginPath(); g.arc(r, r, r * 0.78, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(1, s * 0.12); g.strokeStyle = '#fff'; g.beginPath(); g.arc(r, r, r * 0.36, 0, TAU); g.stroke(); }; },
  cam() { return (g, s) => { const r = s / 2; g.beginPath(); g.arc(r, r, r - 0.5, 0, TAU); g.fillStyle = 'rgba(8,10,13,.75)'; g.fill(); g.beginPath(); g.arc(r, r, r * 0.45, 0, TAU); g.fillStyle = '#ff5a5f'; g.fill(); }; },
  // the waypoint: a purple map pin
  pin(col) {
    return (g, s) => {
      const r = s * 0.3, cx = s / 2, cy = s * 0.36;
      g.beginPath(); g.moveTo(cx, s - 1); g.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = Math.max(1.5, s * 0.07); g.strokeStyle = 'rgba(8,10,13,.9)'; g.stroke();
      g.beginPath(); g.arc(cx, cy, r * 0.4, 0, TAU); g.fillStyle = '#fff'; g.fill();
    };
  },
  north() { return (g, s) => { const r = s / 2; g.beginPath(); g.arc(r, r, r - 0.5, 0, TAU); g.fillStyle = '#0d0f13'; g.fill(); g.lineWidth = Math.max(1, s * 0.08); g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke(); g.fillStyle = '#fff'; g.font = `800 ${Math.round(s * 0.6)}px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', r, r + s * 0.04); }; },
};
// player arrow (points up at angle 0), shared by the radar and the big map
function mapArrow(g, x, y, ang, sz) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * 0.72, sz * 0.8); g.lineTo(0, sz * 0.42); g.lineTo(-sz * 0.72, sz * 0.8); g.closePath();
  g.lineJoin = 'round'; g.lineWidth = sz * 0.3; g.strokeStyle = 'rgba(8,10,13,.9)'; g.stroke(); g.fillStyle = '#fff'; g.fill();
  g.restore();
}
function mapTarget(tgt) {
  if (!tgt) return null;
  return tgt.kind === 'hq' ? '#ffd23f' : tgt.kind === 'enemy' ? '#ff4d5a' : tgt.kind === 'token' ? '#fff3b0' : tgt.color || '#ffd23f';
}

/* ---------------- names: map labels, the area / street under a point ---------------- */
const LSTYLE = { // weight, css px, colour
  big: [900, 15, '#ffe8a8'], place: [800, 12.5, '#f2eee6'], water: [700, 12, '#a6d4ff'], home: [900, 12, '#ffb3bd'], hq: [800, 11, '#d7defc'],
  metro: [700, 10, '#cfe0ff'], shop: [700, 10, '#ffe2ae'], street: [600, 10.5, '#dfe3e8'], ring: [900, 11, '#ffe39a'],
};
const MapLabels = {
  list: [], areas: [], built: false,
  build() {
    if (this.built) return; this.built = true;
    const L = this.list, B = W.bounds, inB = (x, z) => x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
    const add = (t, p, tier, st = 'place', o) => { if (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && inB(p[0], p[1])) L.push(Object.assign({ t, x: p[0], z: p[1], tier, st, ang: 0 }, o)); };
    const lm = (k) => { const b = lmBox(k); return b && [b.cx, b.cz]; };
    const areaOf = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
    const greens = (W.greenPolys || []).filter((gp) => gp.rings[0] && gp.rings[0].length > 2).map((gp) => ({ gp, a: areaOf(gp.rings[0]), b: ringBox(gp.rings[0]) }));
    const green = (re) => { let best = null; for (const q of greens) if (re.test(q.gp.name) && (!best || q.a > best.a)) best = q; return best && [best.b.cx, best.b.cz]; };
    const byName = new Map();
    for (const e of Roads.edges) if (e.name) { let a = byName.get(e.name); if (!a) byName.set(e.name, a = []); a.push(e); }
    const P4 = [0, 0, 0, 1];
    const road = (n) => { const es = byName.get(n); if (!es) return null; let b = es[0]; for (const e of es) if (e.len > b.len) b = e; Roads.at(b, b.len / 2, P4); return [P4[0], P4[1]]; };
    const door = (id) => { const d = W.doors.find((q) => q.id === id); return d && [d.x, d.z]; };
    const mid = (a, b) => (a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a || b);
    const geo = (lon, lat) => geoToGame(lon, lat); // WGS84 (what OSM uses)
    // tier 0: what everybody knows (until = hide once zoomed past that tier, a closer name takes over)
    add('故宫', lm('gugong'), 0, 'big');
    add('天安门广场', lm('square'), 0);
    add('天坛', green(/^天坛公园$/) || lm('qiniandian'), 0, 'big');
    add('北海', green(/^北海公园$/), 0);
    add('景山', green(/^景山公园$/), 0);
    const hh = geo(116.3800, 39.9406), qh = geo(116.3873, 39.9361);
    add('什刹海', mid(hh, qh), 0, 'water', { until: 0 });
    add('钟鼓楼', mid(lm('gulou'), lm('zhonglou')), 0, 'place', { until: 1 });
    add('雍和宫', lm('yonghegong'), 0);
    add('前门', lm('jianlou'), 0, 'place', { oy: 12 });
    add('北京站', lm('bjstation'), 0);
    if (W.towerPos) add('国贸 CBD', [W.towerPos.x, W.towerPos.z], 0, 'place', { oy: -22 });
    add('王府井', door('dept'), 0, 'place', { oy: -18 });
    add('西单', door('clothes'), 0, 'place', { oy: -18 });
    add('Token 王府', door('home'), 0, 'home', { oy: -18 });
    add('长 安 街', road('西长安街'), 0, 'place', { until: 1 });
    // tier 1
    add('后海', hh, 1, 'water'); add('前海', qh, 1, 'water'); add('西海', geo(116.3728, 39.9461), 1, 'water');
    add('天安门', lm('tiananmen'), 1, 'place', { oy: -12 });
    add('中南海', lm('zhongnanhai'), 1, 'water');
    add('人民大会堂', lm('dahuitang'), 1); add('国家博物馆', lm('museum'), 1); add('国家大剧院', lm('nctpa'), 1);
    add('太庙', lm('taimiao'), 1); add('中山公园', lm('zhongshan'), 1);
    add('地坛', green(/^地坛公园$/) || lm('ditan'), 1); add('日坛', green(/^日坛公园$/) || lm('ritan'), 1); add('月坛', green(/^月坛公园$/), 1);
    add('陶然亭', green(/^陶然亭公园$/), 1, 'water'); add('龙潭湖', green(/^龙潭公园$/), 1, 'water'); add('大观园', green(/大观园/), 1);
    add('工体', lm('gongti'), 1); add('美术馆', lm('meishuguan'), 1); add('德胜门', lm('deshengmen'), 1, 'place', { oy: 12 });
    add('永定门', lm('yongdingmen'), 1, 'place', { oy: 12 }); add('东南角楼', lm('jiaolou'), 1, 'place', { oy: 12 });
    add('南锣鼓巷', road('南锣鼓巷') || geo(116.3968, 39.9356), 1);
    add('簋街', road('东直门内大街') || geo(116.4188, 39.9396), 1, 'place', { oy: -12 });
    add('三里屯', road('三里屯路') || geo(116.4488, 39.9321), 1);
    add('大栅栏', door('shoes'), 1, 'place', { oy: -16 }); add('琉璃厂', door('antique'), 1, 'place', { oy: -16 }); add('天桥', door('teahouse'), 1, 'place', { oy: -16 });
    add('鼓楼', lm('gulou'), 2, 'place', { oy: 10 }); add('钟楼', lm('zhonglou'), 2, 'place', { oy: -10 }); add('祈年殿', lm('qiniandian'), 2, 'place', { oy: 11 });
    for (const h of W.hqs) add(h.name, [h.cx, h.cz], 1, 'hq', { oy: 20, hq: h });
    for (const s of W.stations || []) add(s.name, [s.x, s.z], 2, 'metro', { oy: 12 });
    for (const d of W.doors) if (MAP_ICON[d.interior] && d.id !== 'home') add(d.name, [d.x, d.z], 2, 'shop', { oy: 16, door: d });
    // the 二环 by side, lying along the road
    const R = W.ringPoly;
    if (R && R.length > 8) {
      const ends = [['北二环', (p) => -p[1]], ['南二环', (p) => p[1]], ['东二环', (p) => p[0]], ['西二环', (p) => -p[0]]];
      for (const [t, f] of ends) {
        let bi = 0; for (let i = 1; i < R.length; i++) if (f(R[i]) > f(R[bi])) bi = i;
        const a = R[(bi + R.length - 3) % R.length], b = R[(bi + 3) % R.length];
        add(t, R[bi], 0, 'ring', { ang: Math.atan2(b[1] - a[1], b[0] - a[0]), road: true, len: 1e9 });
      }
    }
    // street names along the roads: the big roads from tier 2, the rest when zoomed right in
    for (const [n, es] of byName) {
      const cls = Math.min(...es.map((e) => e.cls)), tier = cls <= 2 ? 2 : cls <= 4 ? 3 : 4, spots = [];
      es.sort((a, b) => b.len - a.len);
      for (const e of es) {
        if (e.len < 26 || spots.length >= (cls <= 2 ? 8 : 3)) continue;
        Roads.at(e, e.len / 2, P4);
        if (spots.some((p) => hyp(p[0] - P4[0], p[1] - P4[1]) < 260)) continue;
        spots.push([P4[0], P4[1]]);
        add(n, [P4[0], P4[1]], tier, 'street', { ang: Math.atan2(P4[3], P4[2]), road: true, len: e.len });
      }
    }
    L.sort((a, b) => a.tier - b.tier);
    // areas for the corner caption: landmark grounds, then the named parks (big ones first)
    const areaAdd = (n, ring) => { if (ring && ring.length > 2) this.areas.push({ n, r: ring, b: ringBox(ring) }); };
    areaAdd('故宫', lmPts('gugong')); areaAdd('天安门广场', lmPts('square')); areaAdd('中南海', lmPts('zhongnanhai'));
    areaAdd('太庙', lmPts('taimiao_park')); areaAdd('中山公园', lmPts('zhongshan')); areaAdd('Token 王府', lmPts('gongwangfu')); areaAdd('雍和宫', lmPts('yonghegong'));
    for (const q of greens.filter((q) => (q.gp.type === 'park' || q.gp.type === 'forest') && q.a > 5000 && q.gp.name && !/[a-zA-Z]|操场|学校|小学|中学|大学|单位|小区/.test(q.gp.name)).sort((a, b) => b.a - a.a)) areaAdd(q.gp.name, q.gp.rings[0]);
  },
  // the neighbourhood: a landmark / park you're in, else the nearest subway station (城门 outside the ring: 东直门外)
  area(x, z) {
    this.build();
    for (const a of this.areas) if (x >= a.b.x0 && x <= a.b.x1 && z >= a.b.z0 && z <= a.b.z1 && pointInRing(x, z, a.r)) return a.n;
    let best = null, bd = Infinity;
    for (const s of Places.st) { const d = dist2(x, z, s.x, s.z); if (d < bd) { bd = d; best = s; } }
    const inside = !W.ringPoly || pointInRing(x, z, W.ringPoly);
    if (!best || bd > 650 * 650) return inside ? '二环里' : '二环外';
    if (!inside && /门$/.test(best.name) && bd > 90 * 90) return best.name + '外';
    return best.name;
  },
  street(x, z) { const n = Roads.nearest(x, z, 24); return n && n.e.name && n.d < n.e.hw + 6 ? n.e.name : ''; },
};

/* ---------------- GPS: A* over Roads, GTA-style (big roads preferred when driving) ---------------- */
const GPSHeap = {
  n: 0, id: new Int32Array(4096), key: new Float64Array(4096),
  push(i, k) {
    if (this.n >= this.id.length) { const I = new Int32Array(this.id.length * 2), K = new Float64Array(this.id.length * 2); I.set(this.id); K.set(this.key); this.id = I; this.key = K; }
    const I = this.id, K = this.key; let j = this.n++;
    while (j > 0) { const p = (j - 1) >> 1; if (K[p] <= k) break; I[j] = I[p]; K[j] = K[p]; j = p; }
    I[j] = i; K[j] = k;
  },
  pop() {
    const I = this.id, K = this.key, top = I[0], n = --this.n;
    if (n > 0) {
      const li = I[n], lk = K[n]; let j = 0;
      for (;;) { let c = 2 * j + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= lk) break; I[j] = I[c]; K[j] = K[c]; j = c; }
      I[j] = li; K[j] = lk;
    }
    return top;
  },
};
const GPS = {
  wp: null, route: null, drive: false, col: MAPC.mission, t: 0, planT: -99, dx: 0, dz: 0, seg: 0, left: 0, ms: 0, run: 0, g: null,
  setWaypoint(x, z) {
    if (x === null || x === undefined) { this.wp = null; this.route = null; this.planT = -99; return; }
    const B = W.bounds;
    this.wp = { x: clamp(x, B.x0 + 4, B.x1 - 4), z: clamp(z, B.z0 + 4, B.z1 - 4), kind: 'wp', color: MAPC.route };
    this.route = null; this.planT = -99;
  },
  // what the route leads to: your waypoint first (like GTA), else the mission blip
  dest(tgt) { return this.wp || (tgt && tgt.kind !== 'token' ? tgt : null); },
  update(tgt, rdt) {
    this.t += rdt;
    const P = Player;
    if (this.wp && !Interiors.cur && hyp(this.wp.x - P.pos.x, this.wp.z - P.pos.z) < 18) { this.wp = null; this.route = null; UI.toast('到地儿了 · 导航结束', 1.8); Sfx.click(); }
    const d = this.dest(tgt);
    if (!d || Interiors.cur || P.mode === 'dead' || Cutscene.active) { this.route = null; return; }
    this.col = d === this.wp ? MAPC.route : mapTarget(d);
    if (hyp(d.x - P.pos.x, d.z - P.pos.z) < 26) { this.route = null; return; }
    const drive = (P.mode === 'car' && !(P.car && P.car.k && P.car.k.bike)) || P.mode === 'truck';
    const since = this.t - this.planT;
    let need = !this.route ? since > 2 : drive !== this.drive;
    if (this.route && !need) {
      const on = this.track();
      if (!on && since > 0.8) need = true; // took a wrong turn: recalculate
      else if (hyp(d.x - this.dx, d.z - this.dz) > 25 && since > 1.2) need = true; // the target moved
    }
    if (need) this.plan(P.pos.x, P.pos.z, d, drive);
  },
  plan(x, z, d, drive) {
    const t0 = performance.now();
    this.planT = this.t; this.dx = d.x; this.dz = d.z; this.drive = drive;
    let pts = this.astar(x, z, d.x, d.z, drive);
    if (!pts && drive) pts = this.astar(x, z, d.x, d.z, false); // boxed in by one-ways: the walking net always connects
    this.ms = performance.now() - t0;
    if (!pts) { this.route = null; return; }
    const n = pts.length, xs = new Float32Array(n), zs = new Float32Array(n), cum = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = pts[i][0]; zs[i] = pts[i][1]; if (i) cum[i] = cum[i - 1] + hyp(xs[i] - xs[i - 1], zs[i] - zs[i - 1]); }
    this.route = { n, xs, zs, cum }; this.seg = 0; this.track();
  },
  // snap the player onto the route; false when they've wandered off it
  track() {
    const R = this.route, x = Player.pos.x, z = Player.pos.z;
    let best = -1, bd = Infinity, bt = 0;
    const i1 = Math.min(R.n - 2, this.seg + 40);
    for (let i = Math.max(0, this.seg - 2); i <= i1; i++) {
      const ax = R.xs[i], az = R.zs[i], dx = R.xs[i + 1] - ax, dz = R.zs[i + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
      if (d2 < bd) { bd = d2; best = i; bt = t; }
    }
    if (best < 0) return false;
    this.seg = best;
    this.left = R.cum[R.n - 1] - (R.cum[best] + (R.cum[best + 1] - R.cum[best]) * bt);
    return bd < (this.drive ? 24 * 24 : 16 * 16);
  },
  // the remaining route as a world-space path (from where the player is now)
  path(g) {
    const R = this.route; if (!R) return;
    g.beginPath(); g.moveTo(Player.pos.x, Player.pos.z);
    for (let i = this.seg + 1; i < R.n; i++) g.lineTo(R.xs[i], R.zs[i]);
  },
  // A* from (x0,z0) to (x1,z1): driving keeps to one-ways and off hutongs / walks, walking goes anywhere
  astar(x0, z0, x1, z1, drive) {
    const RD = Roads, N = RD.nodes.length, S = N, T = N + 1;
    if (!this.g || this.g.length < N + 2) { this.g = new Float64Array(N + 2); this.st = new Uint32Array(N + 2); this.cl = new Uint32Array(N + 2); this.pn = new Int32Array(N + 2); this.pe = new Int32Array(N + 2); }
    const ok = drive ? (e) => e.cls < 6 : null;
    const a = RD.nearest(x0, z0, 90, ok) || RD.nearest(x0, z0, 300, ok), b = RD.nearest(x1, z1, 250, ok) || RD.nearest(x1, z1, 700, ok);
    if (!a || !b) return null;
    const run = ++this.run, g = this.g, st = this.st, cl = this.cl, pn = this.pn, pe = this.pe, H = GPSHeap, nodes = RD.nodes;
    const wt = (e) => (!drive ? 1 : e.cls <= 2 ? 1 : e.cls === 3 ? 1.12 : e.cls === 4 ? 1.28 : 1.7);
    const hx = b.x, hz = b.z;
    H.n = 0;
    const visit = (n, cost, from, eid) => {
      if (st[n] === run && cost >= g[n]) return;
      st[n] = run; g[n] = cost; pn[n] = from; pe[n] = eid;
      H.push(n, cost + (n < N ? hyp(nodes[n].x - hx, nodes[n].z - hz) : 0));
    };
    const ea = a.e, eb = b.e, oneA = drive && ea.oneway, oneB = drive && eb.oneway;
    st[S] = run; g[S] = 0;
    visit(ea.b, (ea.len - a.s) * wt(ea), S, ea.id);
    if (!oneA) visit(ea.a, a.s * wt(ea), S, ea.id);
    if (ea === eb && (b.s >= a.s || !oneA)) visit(T, Math.abs(b.s - a.s) * wt(ea), S, ea.id);
    let pops = 0;
    while (H.n) {
      const n = H.pop();
      if (cl[n] === run) continue;
      cl[n] = run;
      if (n === T || ++pops > 40000) break;
      const gn = g[n];
      if (n === eb.a) visit(T, gn + b.s * wt(eb), n, eb.id);
      if (n === eb.b && !oneB) visit(T, gn + (eb.len - b.s) * wt(eb), n, eb.id);
      for (const e of nodes[n].edges) {
        if (ok && !ok(e)) continue;
        let m;
        if (e.a === n) m = e.b; else if (drive && e.oneway) continue; else m = e.a;
        if (m === n || cl[m] === run) continue;
        visit(m, gn + e.len * wt(e), n, e.id);
      }
    }
    if (cl[T] !== run) return null;
    const seq = [];
    for (let n = T; n !== S; n = pn[n]) seq.push(n);
    const pts = [[x0, z0]], P4 = [0, 0, 0, 1], used = this.used = [];
    let from = S;
    for (let i = seq.length - 1; i >= 0; i--) {
      const to = seq[i], e = RD.edges[pe[to]];
      used.push([e.id, from, to]); // (kept for the dev checks: which way each edge was taken)
      const s0 = from === S ? a.s : from === e.a ? 0 : e.len, s1 = to === T ? b.s : to === e.a ? 0 : e.len;
      Roads.at(e, s0, P4); pts.push([P4[0], P4[1]]);
      const cum = e.cum, ep = e.pts;
      if (s1 > s0) { for (let k = 1; k < ep.length - 1; k++) if (cum[k] > s0 && cum[k] < s1) pts.push(ep[k]); }
      else for (let k = ep.length - 2; k >= 1; k--) if (cum[k] < s0 && cum[k] > s1) pts.push(ep[k]);
      Roads.at(e, s1, P4); pts.push([P4[0], P4[1]]);
      from = to;
    }
    pts.push([x1, z1]);
    return pts;
  },
};

/* ---------------- the radar: turns with the camera (Cam.yaw), zooms out with speed, north on the rim ---------------- */
const Radar = {
  range: 115, ms: 0, T: [1, 0, 0, 1, 0, 0],
  draw(cv, g, dpr, tgt) {
    const t0 = performance.now();
    const S = cv.width, R = S / 2, rim = 4 * dpr, r = R - rim, P = Player;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    if (Interiors.cur) {
      g.fillStyle = '#1b1f27'; g.beginPath(); g.arc(R, R, r, 0, TAU); g.fill();
      g.fillStyle = '#cbd5e1'; g.font = `800 ${Math.round(S * 0.1)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('室内', R, R);
      this.rim(g, S, R, rim, dpr, 0, -1); return;
    }
    const car = P.mode === 'car' || P.mode === 'truck', sp = car ? Math.abs(P.speed || 0) : 0;
    const want = car ? 145 + clamp(sp * 3.4, 0, 115) : P.mode === 'robot' ? 150 : 110;
    this.range += (want - this.range) * 0.06;
    const range = this.range, k = r / range, px = P.pos.x, pz = P.pos.z;
    const yaw = Number.isFinite(Cam.yaw) ? Cam.yaw : Math.PI, fx = Math.sin(yaw), fz = Math.cos(yaw);
    // world → radar: the camera's ground forward points up
    const a = -fz * k, b = -fx * k, c = fx * k, d = -fz * k, e = R - a * px - c * pz, f = R - b * px - d * pz;
    const SX = (x, z) => a * x + c * z + e, SY = (x, z) => b * x + d * z + f;
    g.save();
    g.beginPath(); g.arc(R, R, r, 0, TAU); g.clip();
    g.fillStyle = MAPC.bg; g.fillRect(0, 0, S, S);
    g.setTransform(a, b, c, d, e, f);
    const ext = range * 1.02;
    MapGfx.blit(g, 0, px - ext, pz - ext, px + ext, pz + ext);
    for (const h of W.hqs) { // 百模帮 turf
      if (h.dead || Math.abs(h.cx - px) > ext + 80 || Math.abs(h.cz - pz) > ext + 80) continue;
      g.fillStyle = h.c1 + '30'; g.beginPath(); g.arc(h.cx, h.cz, 70, 0, TAU); g.fill();
    }
    if (GPS.route) {
      g.lineCap = 'round'; g.lineJoin = 'round'; GPS.path(g);
      g.lineWidth = (7 * dpr) / k; g.strokeStyle = 'rgba(8,10,13,.8)'; g.stroke();
      g.lineWidth = (4.2 * dpr) / k; g.strokeStyle = GPS.col; g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const R2 = (range * 1.06) ** 2, near = (x, z) => (x - px) * (x - px) + (z - pz) * (z - pz) < R2, lim = r - 8 * dpr;
    const edge = (x, y) => { const dx = x - R, dy = y - R, dl = Math.hypot(dx, dy); if (dl > lim) { x = R + (dx / dl) * lim; y = R + (dy / dl) * lim; } this._x = x; this._y = y; };
    // subway stations, 电子眼 (only up close), shops
    for (const s of W.stations || []) if (near(s.x, s.z)) MapIcons.put(g, SX(s.x, s.z), SY(s.x, s.z), 'm' + (s.lines && s.lines[0]), 11 * dpr, MapIcons.metro(bjLineColor(s.lines)));
    const cams = typeof BJRules !== 'undefined' && BJRules.cams;
    if (cams && range < 170) for (const q of cams) if (near(q.x, q.z)) MapIcons.put(g, SX(q.x, q.z), SY(q.x, q.z), 'cam', 7 * dpr, MapIcons.cam());
    for (const dr of W.doors) { if (!mapDoorOk(dr) || !near(dr.x, dr.z)) continue; const ic = MAP_ICON[dr.interior]; MapIcons.put(g, SX(dr.x, dr.z), SY(dr.x, dr.z), 'd' + dr.interior, 16 * dpr, MapIcons.badge(ic[0], ic[1])); }
    if (W.garage && near(W.garage.x, W.garage.z)) MapIcons.put(g, SX(W.garage.x, W.garage.z), SY(W.garage.x, W.garage.z), 'garage', 16 * dpr, MapIcons.badge('喷', '#0f766e'));
    if (W.towerPos && near(W.towerPos.x, W.towerPos.z)) MapIcons.put(g, SX(W.towerPos.x, W.towerPos.z), SY(W.towerPos.x, W.towerPos.z), 'tower', 16 * dpr, MapIcons.badge('塔', '#b8860b'));
    for (const h of W.hqs) { if (!near(h.cx, h.cz)) continue; MapIcons.put(g, SX(h.cx, h.cz), SY(h.cx, h.cz), 'hq' + h.id + h.dead, 17 * dpr, MapIcons.badge(h.dead ? '✓' : h.short.slice(0, 1), h.dead ? '#2f7d4a' : h.c1, true)); }
    // tokens, enemies, the 法务 cars, the monorail
    g.fillStyle = '#ffd75e'; const tk = 1.9 * dpr;
    for (const t of Tokens.items) { if (!t.alive || !near(t.x, t.z)) continue; g.fillRect(SX(t.x, t.z) - tk / 2, SY(t.x, t.z) - tk / 2, tk, tk); }
    g.fillStyle = '#ff4d5a';
    for (const en of Enemies.list) { if (en.dead || !near(en.pos.x, en.pos.z)) continue; g.beginPath(); g.arc(SX(en.pos.x, en.pos.z), SY(en.pos.x, en.pos.z), 2.8 * dpr, 0, TAU); g.fill(); }
    const blink = Math.floor(G.time * 6) % 2;
    for (const cc of Cars.list) { if (cc.state !== 'legal' || cc.removed || !near(cc.pos.x, cc.pos.z)) continue; g.fillStyle = blink ? '#ff3344' : '#3a7bff'; g.beginPath(); g.arc(SX(cc.pos.x, cc.pos.z), SY(cc.pos.x, cc.pos.z), 3.6 * dpr, 0, TAU); g.fill(); }
    if (Monorail.pts.length) { const [tx, tz] = Monorail.carPos(1); if (near(tx, tz)) { g.fillStyle = Story.trainFight ? '#ff5a2a' : '#f5f5f5'; g.fillRect(SX(tx, tz) - 3 * dpr, SY(tx, tz) - 3 * dpr, 6 * dpr, 6 * dpr); } }
    // mission givers, the objective and your waypoint stick to the rim when they're off the radar
    for (const m of Story.available()) { const w = m.where(), gv = GIVERS[m.giver]; edge(SX(w.x, w.z), SY(w.x, w.z)); MapIcons.put(g, this._x, this._y, 'gv' + m.giver, 17 * dpr, MapIcons.badge(gv.letter, gv.color)); }
    if (tgt && tgt.kind !== 'marker') {
      edge(SX(tgt.x, tgt.z), SY(tgt.x, tgt.z));
      const pulse = (4.2 + Math.sin(G.time * 8) * 1.3) * dpr;
      g.fillStyle = mapTarget(tgt); g.strokeStyle = 'rgba(8,10,13,.9)'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(this._x, this._y, pulse, 0, TAU); g.fill(); g.stroke();
    } else if (tgt) {
      edge(SX(tgt.x, tgt.z), SY(tgt.x, tgt.z));
      const x = this._x, y = this._y, s = 6.5 * dpr;
      g.fillStyle = tgt.color || '#ffd23f'; g.strokeStyle = 'rgba(8,10,13,.9)'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.8, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.8, y); g.closePath(); g.fill(); g.stroke();
    }
    if (GPS.wp) { edge(SX(GPS.wp.x, GPS.wp.z), SY(GPS.wp.x, GPS.wp.z)); MapIcons.put(g, this._x, this._y - 6 * dpr, 'wp', 20 * dpr, MapIcons.pin(MAPC.route)); }
    mapArrow(g, R, R, yaw - P.heading, 8 * dpr);
    // a soft inner shade towards the rim (cached per size)
    if (!this.vig || this.vigS !== S) { this.vigS = S; this.vig = g.createRadialGradient(R, R, r * 0.62, R, R, r); this.vig.addColorStop(0, 'rgba(0,0,0,0)'); this.vig.addColorStop(1, 'rgba(0,0,0,.38)'); }
    g.fillStyle = this.vig; g.fillRect(0, 0, S, S);
    g.restore();
    this.rim(g, S, R, rim, dpr, -fx, fz);
    if (GPS.route && GPS.left > 30) this.pill(g, R, S - (R < 70 * dpr ? 10 : 13) * dpr, fmtDist(GPS.left), dpr);
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
  },
  rim(g, S, R, rim, dpr, nx, nz) {
    g.lineWidth = rim; g.strokeStyle = 'rgba(10,12,15,.92)'; g.beginPath(); g.arc(R, R, R - rim / 2, 0, TAU); g.stroke();
    g.lineWidth = Math.max(1, 1.1 * dpr); g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(R, R, R - rim, 0, TAU); g.stroke();
    const nr = R - 8.5 * dpr; MapIcons.put(g, R + nx * nr, R + nz * nr, 'north', 15 * dpr, MapIcons.north());
  },
  pill(g, x, y, t, dpr) {
    const k = x < 70 * dpr ? 0.82 : 1; // small phone radars get a smaller pill
    g.font = `700 ${Math.round(10.5 * k * dpr)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(t).width + 12 * k * dpr, h = 16 * k * dpr, r = h / 2, x0 = x - w / 2, x1 = x + w / 2, y0 = y - r;
    g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.arc(x1 - r, y, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x0 + r, y0 + h); g.arc(x0 + r, y, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
    g.fillStyle = 'rgba(10,12,15,.9)'; g.fill(); g.lineWidth = Math.max(1, dpr); g.strokeStyle = GPS.col; g.stroke();
    g.fillStyle = '#fff'; g.fillText(t, x, y + 0.5 * dpr);
  },
};
function bjLineColor(ls) { const l = ls && ls[0]; return (typeof METRO_LINE_COLS !== 'undefined' && METRO_LINE_COLS[l]) || '#2563eb'; }

/* ---------------- the big map (pause screen / 地图 tab): drag, pinch, wheel, tap = waypoint ---------------- */
const BigMap = {
  host: null, cv: null, g: null, dpr: 1, cx: 0, cz: 0, s: 0.3, zoom: 1.7, fit: 0.3, raf: 0, dirty: true, last: 0, ptrs: new Map(), drag: null, hover: null, ro: null, ms: 0,
  mount(host) {
    if (!host) return;
    this.unmount();
    MapGfx.ready(); MapLabels.build();
    this.host = host;
    host.innerHTML = `<canvas class="bm-cv"></canvas>
      <div class="bm-tools"><button type="button" data-a="in" aria-label="放大">＋</button><button type="button" data-a="out" aria-label="缩小">－</button><button type="button" data-a="me">我在哪</button><button type="button" data-a="clr" class="bm-clr" hidden>取消导航</button></div>
      <div class="bm-where"></div>
      <div class="bm-tip">${IS_TOUCH ? '点一下地图设导航点 · 拖动 · 双指缩放' : '点一下设导航点（再点它取消）· 拖动平移 · 滚轮缩放'}</div>`;
    this.cv = host.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.where = host.querySelector('.bm-where'); this.clr = host.querySelector('.bm-clr');
    host.querySelector('.bm-tools').addEventListener('click', (e) => {
      const a = e.target.dataset && e.target.dataset.a; if (!a) return;
      Sfx.click();
      if (a === 'in' || a === 'out') this.zoomAt(this.cv.width / 2, this.cv.height / 2, a === 'in' ? 1.6 : 1 / 1.6);
      else if (a === 'me') this.center();
      else if (a === 'clr') { GPS.setWaypoint(null); GPS.update(UI.lastTgt, 0); this.dirty = true; }
    });
    this.bind();
    this.size(); this.center();
    if (window.ResizeObserver) { this.ro = new ResizeObserver(() => { if (this.cv) { this.size(); this.clampView(); this.dirty = true; } }); this.ro.observe(host); }
    const step = (t) => {
      if (!this.cv) return;
      this.raf = requestAnimationFrame(step);
      if (this.dirty || t - this.last > 125) { this.dirty = false; this.last = t; guard('BigMap.draw', () => this.draw()); }
    };
    this.raf = requestAnimationFrame(step);
  },
  unmount() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    if (this.host && this.host.id === 'pause-map') this.host.innerHTML = '';
    this.host = null; this.cv = null; this.g = null; this.ptrs.clear(); this.drag = null;
  },
  size() {
    const r = this.cv.getBoundingClientRect(), dpr = this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.max(16, Math.round(r.width * dpr)); this.cv.height = Math.max(16, Math.round(r.height * dpr));
    const E = MapGfx.E; this.fit = Math.min(this.cv.width / (E.x1 - E.x0), this.cv.height / (E.z1 - E.z0));
    this.s = clamp(this.fit * this.zoom, this.fit * 0.9, 3.2 * dpr);
  },
  center() {
    const P = Player, back = Interiors.cur && Interiors.back;
    this.cx = back ? back.x : P.pos.x; this.cz = back ? back.z : P.pos.z; this.clampView(); this.dirty = true;
  },
  // keep the map filling the view (centred when it's smaller than the view)
  clampView() {
    const E = MapGfx.E, hw = this.cv.width / 2 / this.s, hh = this.cv.height / 2 / this.s;
    this.cx = E.x1 - E.x0 > 2 * hw ? clamp(this.cx, E.x0 + hw, E.x1 - hw) : (E.x0 + E.x1) / 2;
    this.cz = E.z1 - E.z0 > 2 * hh ? clamp(this.cz, E.z0 + hh, E.z1 - hh) : (E.z0 + E.z1) / 2;
  },
  toWorld(x, y) { return [(x - this.cv.width / 2) / this.s + this.cx, (y - this.cv.height / 2) / this.s + this.cz]; },
  zoomAt(x, y, f) {
    const [wx, wz] = this.toWorld(x, y);
    this.s = clamp(this.s * f, this.fit * 0.9, 3.2 * this.dpr); this.zoom = this.s / this.fit;
    this.cx = wx - (x - this.cv.width / 2) / this.s; this.cz = wz - (y - this.cv.height / 2) / this.s;
    this.clampView(); this.dirty = true;
  },
  bind() {
    const cv = this.cv, at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * this.dpr, (e.clientY - b.top) * this.dpr]; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.host.classList.add('used');
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      this.ptrs.set(e.pointerId, at(e));
      if (this.ptrs.size === 2) {
        const [p, q] = [...this.ptrs.values()], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        this.drag = { pinch: true, d: Math.max(10, hyp(p[0] - q[0], p[1] - q[1])), s: this.s, w: this.toWorld(mx, my) };
      } else if (this.ptrs.size === 1) this.drag = { id: e.pointerId, p: at(e), cx: this.cx, cz: this.cz, t: performance.now(), moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      const p = at(e);
      if (!this.ptrs.has(e.pointerId)) { this.hover = this.toWorld(p[0], p[1]); this.dirty = true; return; }
      this.ptrs.set(e.pointerId, p);
      const D = this.drag; if (!D) return;
      if (D.pinch) {
        if (this.ptrs.size < 2) return;
        const [a, b] = [...this.ptrs.values()], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        this.s = clamp((D.s * hyp(a[0] - b[0], a[1] - b[1])) / D.d, this.fit * 0.9, 3.2 * this.dpr); this.zoom = this.s / this.fit;
        this.cx = D.w[0] - (mx - cv.width / 2) / this.s; this.cz = D.w[1] - (my - cv.height / 2) / this.s;
      } else if (e.pointerId === D.id) {
        const dx = p[0] - D.p[0], dy = p[1] - D.p[1];
        if (!D.moved && hyp(dx, dy) > 7 * this.dpr) D.moved = true;
        if (D.moved) { this.cx = D.cx - dx / this.s; this.cz = D.cz - dy / this.s; }
      }
      this.clampView(); this.dirty = true;
    });
    const up = (e) => {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.ptrs.get(e.pointerId); this.ptrs.delete(e.pointerId);
      const D = this.drag;
      if (D && !D.pinch && e.pointerId === D.id && !D.moved && e.type === 'pointerup' && performance.now() - D.t < 600) this.tap(p[0], p[1]);
      if (D && D.pinch && this.ptrs.size === 1) { const [id, q] = [...this.ptrs.entries()][0]; this.drag = { id, p: q, cx: this.cx, cz: this.cz, t: 0, moved: true }; }
      else if (!this.ptrs.size) this.drag = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = at(e); this.zoomAt(p[0], p[1], Math.exp(-clamp(e.deltaY, -300, 300) * 0.0018)); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  // tap: set the waypoint there; tap the waypoint again to drop it
  tap(x, y) {
    const wp = GPS.wp;
    if (wp) { const sx = (wp.x - this.cx) * this.s + this.cv.width / 2, sy = (wp.z - this.cz) * this.s + this.cv.height / 2; if (hyp(sx - x, sy - y - 8 * this.dpr) < 26 * this.dpr) { GPS.setWaypoint(null); GPS.update(UI.lastTgt, 0); Sfx.click(); this.dirty = true; return; } }
    const [wx, wz] = this.toWorld(x, y), B = W.bounds;
    if (wx < B.x0 || wx > B.x1 || wz < B.z0 || wz > B.z1) return;
    GPS.setWaypoint(wx, wz); GPS.update(UI.lastTgt, 0); Sfx.click(); this.dirty = true; // the world is frozen here: route it right away
    UI.toast('导航点：' + MapLabels.area(wx, wz) + (MapLabels.street(wx, wz) ? ' · ' + MapLabels.street(wx, wz) : ''), 1.8);
  },
  draw() {
    const t0 = performance.now(), g = this.g, cv = this.cv, Wd = cv.width, Hd = cv.height, dpr = this.dpr, s = this.s, cs = s / dpr, P = Player;
    const e = Wd / 2 - this.cx * s, f = Hd / 2 - this.cz * s, X = (x) => x * s + e, Y = (z) => z * s + f;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = MAPC.bg; g.fillRect(0, 0, Wd, Hd);
    g.setTransform(s, 0, 0, s, e, f);
    const vx0 = -e / s, vz0 = -f / s, vx1 = (Wd - e) / s, vz1 = (Hd - f) / s;
    MapGfx.blit(g, s >= MapGfx.lv[0].k * 0.55 ? 0 : 1, vx0, vz0, vx1, vz1);
    const B = W.bounds; g.lineWidth = dpr / s; g.strokeStyle = 'rgba(255,255,255,.14)'; g.strokeRect(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (Monorail.pts.length) { // the 上下文轻轨 over the 二环
      g.setLineDash([(6 * dpr) / s, (5 * dpr) / s]); g.lineWidth = (1.8 * dpr) / s; g.strokeStyle = 'rgba(255,221,120,.8)';
      g.beginPath(); Monorail.pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.stroke(); g.setLineDash([]);
    }
    for (const h of W.hqs) if (!h.dead) { g.fillStyle = h.c1 + '2e'; g.strokeStyle = h.c1 + 'aa'; g.lineWidth = (1.5 * dpr) / s; g.beginPath(); g.arc(h.cx, h.cz, 70, 0, TAU); g.fill(); g.stroke(); }
    if (GPS.route) {
      GPS.path(g);
      g.lineWidth = Math.max(7 * dpr, 9 * s) / s; g.strokeStyle = 'rgba(8,10,13,.8)'; g.stroke();
      g.lineWidth = Math.max(4 * dpr, 5.5 * s) / s; g.strokeStyle = GPS.col; g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.labels(g, X, Y, cs, dpr, Wd, Hd);
    // blips
    const on = (x, y, m = 20) => x > -m && y > -m && x < Wd + m && y < Hd + m;
    if (cs >= 0.3) for (const st of W.stations || []) { const x = X(st.x), y = Y(st.z); if (on(x, y)) MapIcons.put(g, x, y, 'm' + (st.lines && st.lines[0]), (cs >= 0.8 ? 12 : 9) * dpr, MapIcons.metro(bjLineColor(st.lines))); }
    const cams = typeof BJRules !== 'undefined' && BJRules.cams;
    if (cams && cs >= 0.9) for (const q of cams) { const x = X(q.x), y = Y(q.z); if (on(x, y)) MapIcons.put(g, x, y, 'cam', 7 * dpr, MapIcons.cam()); }
    const bs = (cs >= 0.5 ? 18 : 15) * dpr;
    for (const dr of W.doors) { if (!mapDoorOk(dr)) continue; const ic = MAP_ICON[dr.interior], x = X(dr.x), y = Y(dr.z); if (on(x, y)) MapIcons.put(g, x, y, 'd' + dr.interior, bs, MapIcons.badge(ic[0], ic[1])); }
    if (W.garage) MapIcons.put(g, X(W.garage.x), Y(W.garage.z), 'garage', bs, MapIcons.badge('喷', '#0f766e'));
    if (W.towerPos) MapIcons.put(g, X(W.towerPos.x), Y(W.towerPos.z), 'tower', bs, MapIcons.badge('塔', '#b8860b'));
    for (const h of W.hqs) MapIcons.put(g, X(h.cx), Y(h.cz), 'hq' + h.id + h.dead, bs * 1.1, MapIcons.badge(h.dead ? '✓' : h.short.slice(0, 1), h.dead ? '#2f7d4a' : h.c1, true));
    const blink = Math.floor(G.time * 6) % 2;
    g.fillStyle = '#ff4d5a'; for (const en of Enemies.list) { if (en.dead) continue; g.beginPath(); g.arc(X(en.pos.x), Y(en.pos.z), 3 * dpr, 0, TAU); g.fill(); }
    for (const cc of Cars.list) { if (cc.state !== 'legal' || cc.removed) continue; g.fillStyle = blink ? '#ff3344' : '#3a7bff'; g.beginPath(); g.arc(X(cc.pos.x), Y(cc.pos.z), 3.6 * dpr, 0, TAU); g.fill(); }
    if (Monorail.pts.length) { const [tx, tz] = Monorail.carPos(1); g.fillStyle = Story.trainFight ? '#ff5a2a' : '#f5f5f5'; g.fillRect(X(tx) - 3.5 * dpr, Y(tz) - 3.5 * dpr, 7 * dpr, 7 * dpr); }
    for (const m of Story.available()) { const w = m.where(), gv = GIVERS[m.giver]; MapIcons.put(g, X(w.x), Y(w.z), 'gv' + m.giver, 20 * dpr, MapIcons.badge(gv.letter, gv.color)); }
    const tgt = UI.lastTgt;
    if (tgt) {
      const x = X(tgt.x), y = Y(tgt.z), pulse = (6 + Math.sin(performance.now() / 160) * 1.6) * dpr;
      g.fillStyle = mapTarget(tgt); g.strokeStyle = 'rgba(8,10,13,.9)'; g.lineWidth = 2 * dpr;
      g.beginPath(); if (tgt.kind === 'marker') { g.moveTo(x, y - pulse * 1.2); g.lineTo(x + pulse, y); g.lineTo(x, y + pulse * 1.2); g.lineTo(x - pulse, y); g.closePath(); } else g.arc(x, y, pulse, 0, TAU);
      g.fill(); g.stroke();
    }
    if (GPS.wp) MapIcons.put(g, X(GPS.wp.x), Y(GPS.wp.z) - 10 * dpr, 'wp', 26 * dpr, MapIcons.pin(MAPC.route));
    const back = Interiors.cur && Interiors.back, ppx = X(back ? back.x : P.pos.x), ppy = Y(back ? back.z : P.pos.z);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(ppx, ppy, (13 + Math.sin(performance.now() / 220) * 2) * dpr, 0, TAU); g.fill();
    mapArrow(g, ppx, ppy, Math.PI - P.heading, 9 * dpr);
    this.chrome(g, Wd, Hd, dpr, s);
    g.font = `600 ${Math.round(9 * dpr)}px ${FONT_CN}`; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(255,255,255,.45)'; g.fillText('地图数据 © OpenStreetMap 贡献者', Wd - 6 * dpr, Hd - 4 * dpr);
    // what's under the pointer (desktop) or where you are
    const hw = this.hover || [back ? back.x : P.pos.x, back ? back.z : P.pos.z], st = MapLabels.street(hw[0], hw[1]);
    const txt = (this.hover ? '' : '你在：') + MapLabels.area(hw[0], hw[1]) + (st ? ' · ' + st : '') + (GPS.route ? `　导航 ${fmtDist(GPS.left)}` : '');
    if (this.whereT !== txt) { this.whereT = txt; this.where.textContent = txt; }
    if (this.clr.hidden !== !GPS.wp) this.clr.hidden = !GPS.wp;
    this.ms = performance.now() - t0;
  },
  // scale bar + compass
  chrome(g, Wd, Hd, dpr, s) {
    const want = 110 * dpr / s, steps = [50, 100, 200, 250, 500, 1000, 2000];
    let m = steps[0]; for (const q of steps) if (q <= want) m = q;
    const L = m * s, x = 14 * dpr, y = Hd - 16 * dpr;
    g.strokeStyle = 'rgba(8,10,13,.85)'; g.lineWidth = 5 * dpr; g.beginPath(); g.moveTo(x, y - 5 * dpr); g.lineTo(x, y); g.lineTo(x + L, y); g.lineTo(x + L, y - 5 * dpr); g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.stroke();
    this.text(g, m >= 1000 ? m / 1000 + ' 公里' : m + ' 米', x + L / 2, y - 10 * dpr, 700, 11, '#fff', dpr);
    MapIcons.put(g, Wd - 20 * dpr, 20 * dpr, 'north', 22 * dpr, MapIcons.north());
  },
  text(g, t, x, y, wgt, sz, col, dpr) {
    g.font = `${wgt} ${Math.round(sz * dpr)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 3.2 * dpr; g.strokeStyle = 'rgba(10,12,15,.88)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y);
  },
  // place names with a simple greedy declutter (the list is sorted by importance)
  labels(g, X, Y, cs, dpr, Wd, Hd) {
    const tierMax = cs >= 2.4 ? 4 : cs >= 1.3 ? 3 : cs >= 0.75 ? 2 : cs >= 0.36 ? 1 : 0, boxes = this._boxes || (this._boxes = []);
    boxes.length = 0;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const L of MapLabels.list) {
      if (L.tier > tierMax) break;
      if (L.until !== undefined && tierMax > L.until) continue;
      if (L.st === 'shop' && L.door && !mapDoorOk(L.door)) continue;
      const x = X(L.x), y = Y(L.z) + (L.oy || 0) * dpr;
      if (x < -120 || y < -40 || x > Wd + 120 || y > Hd + 40) continue;
      const sty = LSTYLE[L.st], sz = sty[1] * (L.tier === 0 && cs >= 0.75 ? 1.15 : 1), px = Math.round(sz * dpr);
      g.font = `${sty[0]} ${px}px ${FONT_CN}`;
      if (!L.wr) L.wr = g.measureText(L.t).width / px;
      const w = L.wr * px, h = px * 1.3;
      if (L.road && w > L.len * cs * dpr * 1.1) continue; // longer than its bit of road
      let ang = L.ang; if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang)), bw = (w * ca + h * sa) / 2 + 2 * dpr, bh = (w * sa + h * ca) / 2 + 1 * dpr;
      let hit = false;
      for (let i = 0; i < boxes.length; i += 4) if (Math.abs(boxes[i] - x) < boxes[i + 2] + bw && Math.abs(boxes[i + 1] - y) < boxes[i + 3] + bh) { hit = true; break; }
      if (hit) continue;
      boxes.push(x, y, bw, bh);
      g.lineWidth = 3.2 * dpr; g.strokeStyle = 'rgba(10,12,15,.86)'; g.fillStyle = L.hq && L.hq.dead ? '#86efac' : sty[2];
      if (ang) { g.save(); g.translate(x, y); g.rotate(ang); g.strokeText(L.t, 0, 0); g.fillText(L.t, 0, 0); g.restore(); }
      else { g.strokeText(L.t, x, y); g.fillText(L.t, x, y); }
    }
  },
};
