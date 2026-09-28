/* ============================================================
   landmarks & story places on the real map:
   故宫 (hall positions from OSM), 天安门 + 广场 + 正阳门 / 箭楼,
   景山, 北海白塔, 钟鼓楼, 天坛, 雍和宫, 国家大剧院, 北京站,
   德胜门, 东南角楼, 永定门, 太庙 / 社稷坛, 美术馆, 工体 …
   plus the game's places: Token 王府 (恭王府), the 老字号 and
   malls you can walk into, the 百模帮 HQs, the dojo, the lab,
   阿卡姆, the compute tower, the PR garage.
   ============================================================ */
function geoToGame(lon, lat) {
  const P = MAPD.raw.proj, B = P.box;
  const comp = (v, lo, hi) => (v < lo ? lo * P.s_in + (v - lo) * P.s_out : v > hi ? hi * P.s_in + (v - hi) * P.s_out : v * P.s_in);
  return [comp((lon - P.lon0) * P.mx, B.w, B.e), -comp((lat - P.lat0) * P.mz, B.s, B.n)];
}
const lmPts = (key) => (MAPD.raw.lm[key] ? MAPD.pts(MAPD.raw.lm[key]) : null);
function lmBox(key) {
  const p = lmPts(key); if (!p) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, pts: p };
}
const greenByName = (re) => (W.greenPolys || []).filter((g) => re.test(g.name));
function ringBox(r) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; }
const rectRing = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// a round steel bollard: post, domed cap, a red reflective band
const BOLLARD = [new THREE.CylinderGeometry(0.14, 0.15, 0.86, 12), new THREE.SphereGeometry(0.14, 12, 6, 0, TAU, 0, Math.PI / 2), new THREE.CylinderGeometry(0.152, 0.152, 0.12, 12)];
function reserveRect(x0, z0, x1, z1, k = GK.RESV) { Grid.poly([rectRing(x0, z0, x1, z1)], (i) => { if (Grid.kind[i] !== GK.WATER && Grid.kind[i] !== GK.ROAD) Grid.kind[i] = k; }); }
function reserveRing(ring, k = GK.RESV) { Grid.poly([ring], (i) => { if (Grid.kind[i] !== GK.WATER && Grid.kind[i] !== GK.ROAD) Grid.kind[i] = k; }); }

// lawn for the hills (uv = metres / k): the grass photo set, the old canvas where it's missing. The set is a dry, straw-coloured
// lawn: tinted to a summer green (untinted a whole hill of it read as a sand dune), big soft patches, bare soil on the steeper bits
function hillMat(k) {
  const m = PBR.mat('grass', { tile: 2.6 / k, color: 0xa4e0a0 }) || new THREE.MeshLambertMaterial({ map: TEX.grass, color: 0xa8c888 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', ['#include <map_fragment>',
      '{ vec2 hp = vGtaW.xz * 0.06, hi = floor(hp), hf = fract(hp); hf = hf * hf * (3.0 - 2.0 * hf); vec2 hk = vec2(12.99, 78.23);',
      '  float hn = mix(mix(fract(sin(dot(hi, hk)) * 43758.5), fract(sin(dot(hi + vec2(1.0, 0.0), hk)) * 43758.5), hf.x), mix(fract(sin(dot(hi + vec2(0.0, 1.0), hk)) * 43758.5), fract(sin(dot(hi + 1.0, hk)) * 43758.5), hf.x), hf.y);',
      '  diffuseColor.rgb *= mix(vec3(0.82, 0.9, 0.8), vec3(1.02, 1.04, 0.9), hn);',
      '  float hs = (1.0 - smoothstep(0.86, 0.97, vGtaUp)) * smoothstep(0.55, 0.75, hn);', // worn soil where it is steep
      '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.52, 0.4) * (0.85 + 0.3 * hn), hs * 0.7); }'].join('\n'));
  };
  m.customProgramCacheKey = () => 'hill';
  return m;
}
// GeoAcc accumulator → a group of meshes (for things built in local space and placed with a rotation)
function accGroup(A) {
  const g = new THREE.Group();
  for (const [k, mk] of ACC_MATS) if (!A[k].empty) { const mesh = new THREE.Mesh(A[k].geo(), BJ.mats[mk]); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  A.shops.forEach((a, k) => { if (!a.empty) { const mesh = new THREE.Mesh(a.geo(), BJ.oldShopMats[k]); mesh.castShadow = true; g.add(mesh); } });
  return g;
}
// a solid given in a group's local frame (rot = group.rotation.y)
function localSolid(cx, cz, rot, lx0, lz0, lx1, lz1, h, kind = 'bld', extra = {}) {
  const mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2, c = Math.cos(rot), s = Math.sin(rot);
  const wx = cx + mx * c + mz * s, wz = cz - mx * s + mz * c;
  return addSolid(null, Object.assign({ cx: wx, cz: wz, hx: (lx1 - lx0) / 2, hz: (lz1 - lz0) / 2, rot: -rot, h, kind }, extra));
}
// a wall with a tiled coping following any polyline (segments are rotated boxes)
function wallAlong(A, pts, h, t, tile = 'yellow', mat = 'red', closed = true, gaps = []) {
  const n = pts.length, solids = [];
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const a = pts[k], b = pts[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz * t / 2, nz = ux * t / 2;
    // cut gates
    let spans = [[0, L]];
    for (const g of gaps) {
      const px = g[0] - a[0], pz = g[1] - a[1], s = px * ux + pz * uz, off = Math.abs(-px * uz + pz * ux);
      if (off > 3 || s < -g[2] || s > L + g[2]) continue;
      spans = spans.flatMap(([s0, s1]) => (s1 <= s - g[2] || s0 >= s + g[2] ? [[s0, s1]] : [[s0, Math.max(s0, s - g[2])], [Math.min(s1, s + g[2]), s1]].filter(([p, q]) => q - p > 0.3)));
    }
    for (const [s0, s1] of spans) {
      const P = (s, side, y) => [a[0] + ux * s + nx * side, y, a[1] + uz * s + nz * side];
      const y0 = 0.3, y1 = 0.3 + h, yr = y1 + 0.5, L2 = s1 - s0;
      const uv = (s, y) => [s, y];
      A[mat].quad(P(s0, 1, y0), P(s1, 1, y0), P(s1, 1, y1), P(s0, 1, y1), uv(s0, y0), uv(s1, y0), uv(s1, y1), uv(s0, y1));
      A[mat].quad(P(s1, -1, y0), P(s0, -1, y0), P(s0, -1, y1), P(s1, -1, y1), uv(s1, y0), uv(s0, y0), uv(s0, y1), uv(s1, y1));
      A[mat].quad(P(s0, -1, y0), P(s0, 1, y0), P(s0, 1, y1), P(s0, -1, y1), [0, y0], [t, y0], [t, y1], [0, y1]);
      A[mat].quad(P(s1, 1, y0), P(s1, -1, y0), P(s1, -1, y1), P(s1, 1, y1), [0, y0], [t, y0], [t, y1], [0, y1]);
      // 下碱: a grey brick plinth a little proud of the plaster (red walls)
      if (mat === 'red' && h > 2) {
        const k = 1 + 0.16 / t, yb = y0 + Math.min(1.1, h * 0.16), Q = (s, side, y) => [a[0] + ux * s + nx * side * k, y, a[1] + uz * s + nz * side * k];
        A.grey.quad(Q(s0, 1, y0 - 0.3), Q(s1, 1, y0 - 0.3), Q(s1, 1, yb), Q(s0, 1, yb), [s0, 0], [s1, 0], [s1, yb], [s0, yb]);
        A.grey.quad(Q(s1, -1, y0 - 0.3), Q(s0, -1, y0 - 0.3), Q(s0, -1, yb), Q(s1, -1, yb), [s1, 0], [s0, 0], [s0, yb], [s1, yb]);
        A.grey.quad(Q(s0, 1, yb), Q(s1, 1, yb), P(s1, 1, yb), P(s0, 1, yb), [s0, 0], [s1, 0], [s1, 0.08], [s0, 0.08]);
        A.grey.quad(Q(s1, -1, yb), Q(s0, -1, yb), P(s0, -1, yb), P(s1, -1, yb), [s1, 0], [s0, 0], [s0, 0.08], [s1, 0.08]);
      }
      const E = (s, side) => [a[0] + ux * s + nx * side * 1.8, y1, a[1] + uz * s + nz * side * 1.8], R = (s) => [a[0] + ux * s, yr, a[1] + uz * s];
      A[tile].quad(E(s0, 1), E(s1, 1), R(s1), R(s0), [s0, 0], [s1, 0], [s1, 0.9], [s0, 0.9]);
      A[tile].quad(E(s1, -1), E(s0, -1), R(s0), R(s1), [s1, 0], [s0, 0], [s0, 0.9], [s1, 0.9]);
      // the coping's eave: 瓦当 fascia + soffit back to the wall face, both sides
      for (const sd of [1, -1]) eaveBand(A, (u) => E(s0 + L2 * u, sd), (u) => P(s0 + L2 * u, sd, y1 - 0.02), 1, 0.2);
      const cx = a[0] + ux * (s0 + s1) / 2, cz = a[1] + uz * (s0 + s1) / 2;
      solids.push(addSolid(null, { cx, cz, hx: L2 / 2, hz: t / 2 + 0.1, rot: Math.atan2(uz, ux), h: h + 0.8, kind: 'bld' }));
      Grid.obb(cx, cz, L2 / 2, t / 2 + 0.4, ux, uz, (i) => { if (Grid.kind[i] !== GK.ROAD && Grid.kind[i] !== GK.WATER) Grid.kind[i] = GK.BLD; });
    }
  }
  return solids;
}

// the 百模帮 branches — all in the new-money districts outside the ring (+ one in 金融街)
const HQ_DEFS = [
  { id: 'kwen', name: 'Kwen 办公', short: 'Kwen', sub: 'KWEN · 望京', i: 7, j: 0, c1: '#5b3df5', c2: '#a06bff', glass: 0x8f7dff, enemy: 'qbot', hp: 4200, h: 48, bonus: 'punch',
    alert: '嘛呢？检测到异常调用，正扩容呢！', news: 'Kwen 办公宣布服务暂时下线：“您容我再想想……”' },
  { id: 'doubao', name: '逗包办公', short: '逗包', sub: 'DOUBAO · 大钟寺', i: 3, j: 0, c1: '#1e6bff', c2: '#35c2ff', glass: 0x6fb3ff, enemy: 'bun', hp: 4200, h: 44, bonus: 'kick',
    alert: '我在呢～哎哎哎，您这是要干嘛？', news: '逗包办公回应：“我在呢……得，这回我真不在了”' },
  { id: 'qcc', name: '起查查', short: '查查', sub: 'QICHACHA · 国贸', i: 9, j: 5, c1: '#0b57d0', c2: '#2f8cff', glass: 0x5b8fe8, enemy: 'cha', hp: 4200, h: 42,
    alert: '发现高风险行为！您这是犯哪门子轴呢？', news: '起查查查询结果：本楼风险等级——塌了' },
  { id: 'tyc', name: '添眼查', short: '天眼', sub: 'TIANYANCHA · 金融街', i: 1, j: 4, c1: '#0d5cff', c2: '#00b2ff', glass: 0x58a6ff, enemy: 'cha', hp: 3600, h: 40,
    alert: '天眼已锁定！瞅你呢！', news: '添眼查：天眼……闭上了' },
  { id: 'kimmy', name: 'Kimmy', short: 'Kimmy', sub: 'MOONSPOT · 中关村', i: 0, j: 1, c1: '#15161a', c2: '#4a4d57', glass: 0x9aa0ad, enemy: 'kefu', hp: 3600, h: 46,
    alert: '您这上下文有点儿长啊……', news: 'Kimmy：长文本也救不了这栋楼' },
  { id: 'wenxin', name: '闻心一言', short: '闻心', sub: 'EARNIE · 西二旗', i: 0, j: 0, c1: '#2b3bea', c2: '#7c5cff', glass: 0x7d86ff, enemy: 'kefu', hp: 3600, h: 42,
    alert: '一言不合就动手？您局气点儿！', news: '闻心一言：一言难尽' },
  { id: 'yuanbao', name: '疼讯元宝', short: '元宝', sub: 'YUANBAO · 望京', i: 8, j: 0, c1: '#07a857', c2: '#3fd68f', glass: 0x5fd39a, enemy: 'kefu', hp: 3600, h: 40,
    alert: '元宝护体！甭想动我！', news: '疼讯元宝：元宝撒了一地，捡去吧您呐' },
  { id: 'deepseep', name: 'DeepSeep', short: 'DeepSeep', sub: 'DEEPSEEP · 海淀', i: 0, j: 2, c1: '#3d5afe', c2: '#6f86ff', glass: 0x7e93ff, enemy: 'kefu', hp: 3600, h: 44,
    alert: '深度思考中……您稍候着', news: 'DeepSeep：深度求锁……深度求饶' },
  { id: 'zhipu', name: '智普轻言', short: '智普', sub: 'ZHIPU · 五道口', i: 2, j: 0, c1: '#1f4dff', c2: '#12c3c3', glass: 0x5cc9d6, enemy: 'kefu', hp: 3600, h: 40,
    alert: '轻言提醒：请文明交流，别介！', news: '智普轻言：无言以对' },
];
const SHOP_SIGNS = {
  electronics: ['海量电子城', '#111827', '#22d3ee'], clothes: ['西单袖水服装城', '#b4402f', '#fde68a'], dept: ['王府景百货大楼', '#7c2d12', '#fbbf24'],
  gym: ['东单体育馆', '#7c2d12', '#fdba74'], lab: ['Kodex 应用科学部', '#0b0d10', '#35d49a'],
};
const OLD_SIGNS = {
  snack: '护锅寺小吃', antique: '琉璃厂 · 容错斋', shoes: '内联胜布鞋', pharmacy: '同 Token 堂', duck: '权重德烤鸭', teahouse: '天桥 · 得云社', hardware: '老王五金',
};

function plaqueTex(t) {
  const c = mkCanvas(512, 112), g = c.getContext('2d');
  rrect(g, 4, 4, 504, 104, 10); g.fillStyle = '#16120e'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#c9a23e'; g.stroke();
  g.fillStyle = '#f0c75a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 460, 70, 900); g.fillText(t, 256, 60);
  return tex(c);
}

/* ---------------- site finders ---------------- */
// a lot of w×d fronting a street near (ax,az): { cx, cz, ux, uz, rot, fx, fz, ox, oz, e }
function frontSite(ax, az, w, d, o = {}) {
  const P = [0, 0, 0, 1], cand = [], maxR = o.maxR || 140, seen = new Set();
  for (let gx = Math.floor((ax - maxR) / Roads.cell); gx <= Math.floor((ax + maxR) / Roads.cell); gx++)
    for (let gz = Math.floor((az - maxR) / Roads.cell); gz <= Math.floor((az + maxR) / Roads.cell); gz++) {
      const l = Roads.hash.get(gx * 100003 + gz); if (!l) continue;
      for (const code of l) {
        const e = Roads.edges[(code / 4096) | 0];
        if (seen.has(e.id) || (o.cls && !o.cls(e))) continue; seen.add(e.id);
        for (let s = Math.min(w / 2 + 1, e.len / 2); s <= e.len - Math.min(w / 2 + 1, e.len / 2); s += 2.5) {
          Roads.at(e, s, P); const dd = hyp(P[0] - ax, P[1] - az);
          if (dd < maxR) for (const side of [1, -1]) cand.push({ e, s, side, dd });
        }
      }
    }
  cand.sort((p, q) => p.dd - q.dd);
  for (const c of cand.slice(0, 1600)) {
    const e = c.e; Roads.at(e, c.s, P);
    const nx = -P[3] * c.side, nz = P[2] * c.side, set = e.hw + e.C.walk + 0.2;
    const cx = P[0] + nx * (set + d / 2), cz = P[1] + nz * (set + d / 2), ux = -nz, uz = nx;
    if (!Grid.obbFree(cx, cz, w / 2 + 0.5, d / 2 + 0.5, ux, uz, 1 << GK.FREE)) continue;
    Grid.setObb(cx, cz, w / 2, d / 2, ux, uz, GK.BLD);
    const rot = Math.atan2(-uz, ux);
    return { cx, cz, ux, uz, rot, fx: P[0] + nx * set, fz: P[1] + nz * set, ox: -nx, oz: -nz, e };
  }
  return null;
}
// an axis-aligned free square near (ax,az), preferring spots close to a street
function freeSite(ax, az, w, d, maxR = 220) {
  for (let r = 0; r <= maxR; r += 6) {
    const n = Math.max(1, Math.round((TAU * r) / 8));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r;
      if (!Grid.obbFree(x, z, w / 2 + 1, d / 2 + 1, 1, 0, 1 << GK.FREE | 1 << GK.PARK)) continue;
      const near = Roads.nearest(x, z, Math.max(w, d) / 2 + 26, (e) => e.cls <= 5);
      if (!near) continue;
      Grid.setObb(x, z, w / 2, d / 2, 1, 0, GK.BLD);
      return { cx: x, cz: z };
    }
  }
  return null;
}

/* ---------------- the places ---------------- */
const SPOTS = { // real positions (lon, lat) of the story places, shops and HQs
  snack: [116.3745, 39.9366], electronics: [116.3690, 39.9412], clothes: [116.3738, 39.9102], dept: [116.4106, 39.9138],
  antique: [116.3870, 39.8962], shoes: [116.3932, 39.8958], pharmacy: [116.3944, 39.8956], duck: [116.3925, 39.8950],
  teahouse: [116.3927, 39.8850], hardware: [116.4168, 39.9290], gym: [116.4196, 39.9061], garage: [116.4318, 39.9236],
  lab: [116.4412, 39.9418], arkham: [116.4098, 39.9540], dojo: [116.3405, 39.9010], tower: [116.4436, 39.9085],
};
const HQ_SPOTS = {
  kwen: [116.4360, 39.9445, '东直门'], doubao: [116.3515, 39.9430, '西直门'], qcc: [116.4410, 39.9048, '建国门外'], tyc: [116.3600, 39.9152, '金融街'],
  kimmy: [116.3730, 39.9535, '德胜门外'], wenxin: [116.3440, 39.9235, '阜成门外'], yuanbao: [116.4425, 39.9255, '朝阳门外'],
  deepseep: [116.3445, 39.8905, '广安门'], zhipu: [116.3985, 39.8605, '永定门外'],
};

const Landmarks = {
  sites: {},
  reserve() {
    // 故宫: the whole compound; the stone courts get plaza paving
    const gg = lmBox('gugong');
    if (gg) { reserveRect(gg.x0 - 1, gg.z0 - 1, gg.x1 + 1, gg.z1 + 1); W.plazaPolys.push([rectRing(gg.x0 + 2.5, gg.z0 + 2.5, gg.x1 - 2.5, gg.z1 - 2.5)]); }
    const sq = lmPts('square'); if (sq) { reserveRing(sq, GK.PLAZA); W.plazaPolys.push([sq]); }
    const ta = lmBox('tiananmen'); if (ta) { reserveRect(ta.x0 - 18, ta.z0 - 6, ta.x1 + 18, ta.z1 + 18); W.plazaPolys.push([rectRing(ta.x0 - 18, ta.z0 - 6, ta.x1 + 18, ta.z1 + 14)]); }
    // 端门 courtyard: the paved strip between 天安门 and 午门 (no houses on the imperial axis)
    const wm0 = lmBox('wumen');
    if (ta && gg && wm0) { const ax = wm0.cx; reserveRect(ax - 24, gg.z1 - 2, ax + 24, ta.z0 - 4); W.plazaPolys.push([rectRing(ax - 22, gg.z1, ax + 22, ta.z0 - 4)]); W.duanmen = { x: ax, z0: gg.z1, z1: ta.z0 - 4 }; }
    for (const k of ['zhengyangmen', 'jianlou', 'yongdingmen', 'deshengmen', 'jiaolou', 'bjstation', 'meishuguan', 'gongti', 'taimiao', 'shejitan', 'ditan', 'ritan', 'dahuitang', 'museum']) {
      const b = lmBox(k); if (!b) continue;
      const m = k === 'bjstation' ? 14 : k === 'jiaolou' ? 10 : 6;
      reserveRect(b.x0 - m, b.z0 - m, b.x1 + m, b.z1 + m);
    }
    // 太庙 (劳动人民文化宫) / 社稷坛 (中山公园): old cypress groves on grass inside the red walls, not a paved lot
    for (const [k, name] of [['taimiao', '太庙'], ['shejitan', '社稷坛']]) {
      const b = lmBox(k); if (!b) continue;
      const r = rectRing(b.x0 + 2, b.z0 + 2, b.x1 - 2, b.z1 - 2); W.greenPolys.push({ type: 'park', name, rings: [r] });
      Grid.poly([r], (i) => { if (Grid.kind[i] === GK.RESV) Grid.kind[i] = GK.PARK; });
    }
    const qm = lmBox('zhengyangmen'), jl = lmBox('jianlou');
    if (qm && jl) W.plazaPolys.push([rectRing(Math.min(qm.x0, jl.x0) - 10, qm.z0 - 8, Math.max(qm.x1, jl.x1) + 10, jl.z1 + 6)]);
    const bs = lmBox('bjstation'); if (bs) W.plazaPolys.push([rectRing(bs.x0 - 10, bs.z1, bs.x1 + 10, bs.z1 + 22)]);
    const zn = lmPts('zhongnanhai'); if (zn) reserveRing(zn);
    const gl = lmBox('gulou'), zl = lmBox('zhonglou');
    if (gl && zl) { reserveRect(Math.min(gl.x0, zl.x0) - 10, zl.z0 - 10, Math.max(gl.x1, zl.x1) + 10, gl.z1 + 10, GK.PLAZA); W.plazaPolys.push([rectRing(Math.min(gl.x0, zl.x0) - 10, zl.z0 - 10, Math.max(gl.x1, zl.x1) + 10, gl.z1 + 10)]); }
    const yh = lmBox('yonghegong'); if (yh) { reserveRect(yh.x0, yh.z0, yh.x1, yh.z1); W.plazaPolys.push([rectRing(yh.x0 + 2, yh.z0 + 2, yh.x1 - 2, yh.z1 - 2)]); }
    const gw = lmBox('gongwangfu'); if (gw) reserveRect(gw.x0, gw.z0, gw.x1, gw.z1);
    const nt = lmBox('nctpa'); if (nt) reserveRect(nt.x0 - 12, nt.z0 - 12, nt.x1 + 12, nt.z1 + 12);
    const qh = lmBox('qionghuadao'); if (qh) reserveRing(qh.pts);
  },
  build() {
    this.build0();
    for (const d of W.doors) if (d.o) d.heading = Math.atan2(d.o[0], d.o[1]); // heading = facing out to the street
  },
  build0() {
    this.palace();
    this.tiananmen();
    this.square();
    this.qianmen();
    this.jingshan();
    this.beihai();
    this.gulou();
    this.tiantan();
    this.yonghegong();
    this.nctpa();
    this.zhongnanhai();
    this.misc();
    this.home();
    this.places();
    this.hqs();
  },
  palace() { // 故宫, halls at their real positions (scaled up 1.6×: the map is squeezed, the buildings aren't)
    const gg = lmBox('gugong'); if (!gg) return;
    const A = acc3(), props = [];
    const X0 = gg.x0 + 3, X1 = gg.x1 - 3, Z0 = gg.z0 + 3, Z1 = gg.z1 - 3, wh = 7;
    const wm = lmBox('wumen'), sw = lmBox('shenwumen'), dh = lmBox('donghuamen'), xh = lmBox('xihuamen');
    const gaps = [];
    if (sw) gaps.push([sw.cx, Z0, 5]); if (dh) gaps.push([X1, dh.cz, 4]); if (xh) gaps.push([X0, xh.cz, 4]);
    wallAlong(A, [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]], wh, 2.2, 'yellow', 'red', true, gaps.concat(wm ? [[wm.cx, Z1, 26]] : []));
    // 角楼
    for (const [tx, tz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
      boxW(A.red, tx - 3.4, 0.3 + wh, tz - 3.4, tx + 3.4, 0.3 + wh + 3.4, tz + 3.4, 3);
      gableRoof(A.yellow, tx, tz, 8, 4.2, 0.3 + wh + 3.4, 2.1, 0, 0.7); gableRoof(A.yellow, tx, tz, 8, 4.2, 0.3 + wh + 3.4, 2.1, 1, 0.7);
      pyramidRoof(A.yellow, tx, tz, 3, 0.3 + wh + 5, 2.2, 0.5); props.push(gpart(new THREE.SphereGeometry(0.45, 8, 6), 0xd4a017, tx, 0.3 + wh + 7.4, tz));
    }
    // 午门: U-shaped gate with the main hall on top and pavilions on the wings
    if (wm) {
      const cx = wm.cx, mz = Z1, ww = Math.max(40, wm.w), gy = 8.5;
      boxW(A.red, cx - ww / 2, 0.3, mz - 6, cx - 3, gy, mz + 2, 3); boxW(A.red, cx + 3, 0.3, mz - 6, cx + ww / 2, gy, mz + 2, 3);
      archTop(A.red, cx, mz - 6, mz + 2, 4.8, gy, 6); // the centre passage: a round-headed barrel vault
      hall(A, props, cx, mz - 2, 26, 6.5, gy, 5.2, { double: true });
      addSolid(null, { x0: cx - ww / 2, x1: cx - 3, z0: mz - 6, z1: mz + 2, h: 20, kind: 'bld' }); addSolid(null, { x0: cx + 3, x1: cx + ww / 2, z0: mz - 6, z1: mz + 2, h: 20, kind: 'bld' });
      for (const s of [-1, 1]) {
        boxW(A.red, cx + s * (ww / 2 - 4) - 4, 0.3, mz + 2, cx + s * (ww / 2 - 4) + 4, gy, mz + 22, 3);
        addSolid(null, { x0: cx + s * (ww / 2 - 4) - 4, x1: cx + s * (ww / 2 - 4) + 4, z0: mz + 2, z1: mz + 22, h: 14, kind: 'bld' });
        hall(A, props, cx + s * (ww / 2 - 4), mz + 4.5, 7, 5, gy, 3.4, {}); hall(A, props, cx + s * (ww / 2 - 4), mz + 19, 7, 5, gy, 3.4, {});
      }
    }
    if (sw) { // 神武门
      const cx = sw.cx;
      boxW(A.red, cx - 13, 0.3, Z0 - 4, cx - 3, 8, Z0 + 4, 3); boxW(A.red, cx + 3, 0.3, Z0 - 4, cx + 13, 8, Z0 + 4, 3); boxW(A.red, cx - 3, 5.3, Z0 - 4, cx + 3, 8, Z0 + 4, 3, 'nst');
      for (const z of [Z0 - 4.03, Z0 + 4.03]) props.push(gpart(new THREE.CylinderGeometry(3, 3, 0.06, 20, 1, false, -Math.PI / 2, Math.PI), 0x2a1512, cx, 5.3, z, -Math.PI / 2, 0, 0, 1, 1, 0.65));
      hall(A, props, cx, Z0, 20, 5.5, 8, 4.4, { double: true });
      addSolid(null, { x0: cx - 13, x1: cx - 3, z0: Z0 - 4, z1: Z0 + 4, h: 18, kind: 'bld' }); addSolid(null, { x0: cx + 3, x1: cx + 13, z0: Z0 - 4, z1: Z0 + 4, h: 18, kind: 'bld' });
    }
    for (const g of [dh, xh]) { if (!g) continue; const gx = g === dh ? X1 : X0; boxW(A.red, gx - 4, 0.3, g.cz - 7, gx + 4, 6.5, g.cz - 2.4, 3); boxW(A.red, gx - 4, 0.3, g.cz + 2.4, gx + 4, 6.5, g.cz + 7, 3); boxW(A.red, gx - 4, 4.5, g.cz - 2.4, gx + 4, 6.5, g.cz + 2.4, 3, 'ewt'); hall(A, props, gx, g.cz, 7, 12, 6.5, 3.4, { gable: true }); }
    // the outer court, 金水河 and 太和门
    const th = lmBox('taihemen'), td = lmBox('taihedian'), zh = lmBox('zhonghedian'), bh = lmBox('baohedian'), qq = lmBox('qianqinggong'), jt = lmBox('jiaotaidian'), kn = lmBox('kunninggong');
    const ax = td ? td.cx : (X0 + X1) / 2;
    if (th) {
      const ty = terrace(A, th.cx, th.cz, 32, 12, 1, 1.4, 0);
      hall(A, props, th.cx, th.cz, 26, 8, ty, 5.4, { double: true, rh: 3 });
      addSolid(null, { x0: th.cx - 13, x1: th.cx + 13, z0: th.cz - 4, z1: th.cz + 4, h: 16, kind: 'bld' });
      const wz = th.cz + 16;
      addWater({ x0: th.cx - 26, x1: th.cx + 26, z0: wz - 1, z1: wz + 1.2, deco: true, bridges: [-2, -1, 0, 1, 2].map((k) => [th.cx + k * 4.2, 2.4]) });
      for (let k = -2; k <= 2; k++) props.push(box(th.cx + k * 4.2, 0.55, wz, 2.4, 0.4, 3.4, 0xeceae4));
      W.decoMoat = { x0: th.cx - 26, x1: th.cx + 26, z0: wz - 1, z1: wz + 1.2 };
    }
    // 三台 under 太和殿 / 中和殿 / 保和殿
    if (td && bh) {
      const tz = (td.cz + bh.cz) / 2, tl = Math.abs(bh.cz - td.cz) + 28;
      const ty = terrace(A, ax, tz, 48, tl, 3, 0.9, 2.2);
      hall(A, props, ax, td.cz, 30, 15, ty, 7.6, { double: true, rh: 4.8 });
      addSolid(null, { x0: ax - 15, x1: ax + 15, z0: td.cz - 7.5, z1: td.cz + 7.5, h: 26, kind: 'bld' });
      if (zh) { hall(A, props, ax, zh.cz, 8.5, 8.5, ty, 5, { rh: 3.4 }); props.push(gpart(new THREE.SphereGeometry(0.55, 10, 8), 0xe8b422, ax, ty + 8.6, zh.cz)); addSolid(null, { x0: ax - 4.3, x1: ax + 4.3, z0: zh.cz - 4.3, z1: zh.cz + 4.3, h: 16, kind: 'bld' }); }
      hall(A, props, ax, bh.cz, 24, 11, ty, 6, { double: true, rh: 3.6 });
      addSolid(null, { x0: ax - 12, x1: ax + 12, z0: bh.cz - 5.5, z1: bh.cz + 5.5, h: 20, kind: 'bld' });
      for (let k = -11; k <= 11; k++) props.push(box(ax + k * 2.05, ty + 0.35, tz + tl / 2 - 5.2, 0.2, 0.7, 0.2, 0xf2f0ea), box(ax + k * 2.05, ty + 0.35, tz - tl / 2 + 5.2, 0.2, 0.7, 0.2, 0xf2f0ea));
      W.landmarks.palace = { x: ax, z: td.cz, top: ty + 20 };
    }
    // inner court 乾清宫 / 交泰殿 / 坤宁宫, then 御花园
    if (qq && kn) {
      const iz = (qq.cz + kn.cz) / 2, iy = terrace(A, ax, iz, 30, Math.abs(kn.cz - qq.cz) + 16, 1, 1.2, 0);
      hall(A, props, ax, qq.cz, 21, 10, iy, 5.6, { double: true, rh: 3.2 }); addSolid(null, { x0: ax - 10.5, x1: ax + 10.5, z0: qq.cz - 5, z1: qq.cz + 5, h: 18, kind: 'bld' });
      if (jt) { hall(A, props, ax, jt.cz, 7, 7, iy, 4.2, { rh: 2.8 }); props.push(gpart(new THREE.SphereGeometry(0.45, 10, 8), 0xe8b422, ax, iy + 7.3, jt.cz)); }
      hall(A, props, ax, kn.cz, 19, 9, iy, 5, { rh: 3 }); addSolid(null, { x0: ax - 9.5, x1: ax + 9.5, z0: kn.cz - 4.5, z1: kn.cz + 4.5, h: 14, kind: 'bld' });
      for (let k = 0; k < 16; k++) newProp(ax + rand(-22, 22), rand(Z0 + 6, kn.cz - 10), rand(0.7, 1.05), 'cypress');
    }
    // east & west: rows of yellow-roofed courtyards (东六宫 / 西六宫) behind red walls
    for (const s of [-1, 1]) {
      const sx0 = s < 0 ? X0 + 8 : ax + 30, sx1 = s < 0 ? ax - 30 : X1 - 8;
      if (sx1 - sx0 < 16) continue;
      for (const q of palaceWall(A, s < 0 ? ax - 27 : ax + 27, Z0 + 12, s < 0 ? ax - 27 : ax + 27, (th ? th.cz : Z1) - 14, 5, 1.1, td ? [[td.cz - 4, td.cz + 4]] : [])) addSolid(null, Object.assign(q, { h: 6, kind: 'bld' }));
      // 东六宫 / 西六宫: a row of walled courtyards, each a main hall across the back, two side halls (配殿) facing the court,
      // a front wall with a small tiled gate (the rows used to be one long hall and one long wall: barracks from the hill)
      const wall = (x0, z0, x1, z1) => { boxW(A.red, x0, 0.3, z0, x1, 4.2, z1, 3, 'nsew'); const ax2 = x1 - x0 > z1 - z0; gableRoof(A.yellow, (x0 + x1) / 2, (z0 + z1) / 2, ax2 ? x1 - x0 : z1 - z0, ax2 ? z1 - z0 : x1 - x0, 4.2, 0.4, ax2 ? 0 : 1, 0.2); addSolid(null, { x0, x1, z0, z1, h: 5, kind: 'bld' }); };
      for (let zz = Z0 + 14; zz < (th ? th.cz : Z1) - 26; zz += 17) {
        const n = Math.max(1, Math.round((sx1 - sx0) / 30)), cw = (sx1 - sx0) / n;
        for (let i = 0; i < n; i++) {
          const c0 = sx0 + i * cw, c1 = c0 + cw, cxh = (c0 + c1) / 2, hw = Math.min(17, cw * 0.56), pr = i % 3 === 1;
          hall(A, props, cxh, zz + 3.6, hw, 6, 0.3, pr ? 4.4 : 3.8, { gable: !pr, rh: pr ? 2.4 : 2.1 });
          addSolid(null, { x0: cxh - hw / 2, x1: cxh + hw / 2, z0: zz + 0.6, z1: zz + 6.6, h: 8, kind: 'bld' });
          for (const sd of [-1, 1]) { // 配殿: ridge along z, lattice toward the court
            const x = sd < 0 ? c0 + 2.7 : c1 - 2.7;
            boxW(A.red, x - 1.8, 0.3, zz + 7.3, x + 1.8, 3.3, zz + 11.3, 3, 'nsew'); latticeFace(A.lattice, sd < 0 ? 'e' : 'w', x - 1.83, 0.5, zz + 7.6, x + 1.83, 3.1, zz + 11.0);
            gableRoof(A.yellow, x, zz + 9.3, 4, 3.6, 3.3, 1.4, 1, 0.45);
            addSolid(null, { x0: x - 1.8, x1: x + 1.8, z0: zz + 7.3, z1: zz + 11.3, h: 6, kind: 'bld' });
          }
          // front wall with a gate: two piers, a little tiled roof over the opening
          wall(c0 + 0.4, zz + 12, cxh - 1.7, zz + 12.8); wall(cxh + 1.7, zz + 12, c1 - 0.4, zz + 12.8);
          boxW(A.red, cxh - 2.2, 0.3, zz + 11.9, cxh - 1.6, 3.9, zz + 12.9, 2); boxW(A.red, cxh + 1.6, 0.3, zz + 11.9, cxh + 2.2, 3.9, zz + 12.9, 2);
          gableRoof(A.yellow, cxh, zz + 12.4, 4.6, 1.6, 3.9, 0.85, 0, 0.4);
          if (i > 0) wall(c0 - 0.4, zz + 0.5, c0 + 0.4, zz + 12);
          if (Math.random() < 0.8) newProp(cxh + rand(-2.5, 2.5) + (Math.random() < 0.5 ? -4 : 4), zz + 9.2, rand(0.7, 0.95), Math.random() < 0.6 ? 'cypress' : 'tree');
        }
      }
    }
    flushAcc(A); Build.props.push(...props);
  },
  // a red gate base (城台) with a real barrel-vaulted walk-through centre arch; the side arches are shader portals (a lit passage
  // seen through each, not a black cut-out). Returns the top height.
  gateWall(A, props, cx, cz, w, d, h, aw = 3.6, ah = 6.2, sides = [-2, -1, 1, 2], pitch = 7) {
    const z0 = cz - d / 2, z1 = cz + d / 2;
    boxW(A.red, cx - w / 2, 0.3, z0, cx - aw / 2, h, z1, 3); boxW(A.red, cx + aw / 2, 0.3, z0, cx + w / 2, h, z1, 3);
    archTop(A.red, cx, z0, z1, 0.3 + ah, h, aw);
    for (const k of sides) for (const sd of [-1, 1]) Portals.add(cx + k * pitch, 0.3, cz + sd * d / 2, 0, sd, aw * 0.72, ah * 0.82, d, 1, 0x8e3226);
    // 须弥座: a white marble plinth between the arches, a marble cornice under the parapet (the big red faces get a base and a top line)
    const cuts = [[cx - aw / 2 - 0.12, cx + aw / 2 + 0.12], ...sides.map((k) => [cx + k * pitch - aw * 0.36 - 0.12, cx + k * pitch + aw * 0.36 + 0.12])].sort((a, b) => a[0] - b[0]);
    let px = cx - w / 2 - 0.22;
    for (const [c0, c1] of cuts.concat([[cx + w / 2 + 0.22, 1e9]])) { if (c0 - px > 0.2) { boxW(A.marble, px, 0.3, z0 - 0.22, c0, 1.35, z0 + 0.3, 2, 'nst'); boxW(A.marble, px, 0.3, z1 - 0.3, c0, 1.35, z1 + 0.22, 2, 'nst'); } px = c1; }
    boxW(A.marble, cx - w / 2 - 0.22, 0.3, z0 - 0.22, cx - w / 2 + 0.3, 1.35, z1 + 0.22, 2, 'ewt'); boxW(A.marble, cx + w / 2 - 0.3, 0.3, z0 - 0.22, cx + w / 2 + 0.22, 1.35, z1 + 0.22, 2, 'ewt');
    boxW(A.marble, cx - w / 2 - 0.14, h - 0.55, z0 - 0.14, cx + w / 2 + 0.14, h - 0.12, z1 + 0.14, 2, 'nsew');
    addSolid(null, { x0: cx - w / 2, x1: cx - aw / 2, z0, z1, h: h + 14, kind: 'bld' }); addSolid(null, { x0: cx + aw / 2, x1: cx + w / 2, z0, z1, h: h + 14, kind: 'bld' });
    return h;
  },
  tiananmen() {
    const t = lmBox('tiananmen'); if (!t) return;
    const A = acc3(), props = [], cx = t.cx, cz = t.cz, w = Math.max(40, t.w + 8), d = 14, gy = 11;
    this.gateWall(A, props, cx, cz, w, d, gy);
    hall(A, props, cx, cz, w - 8, d - 5, gy, 6, { double: true, rh: 4 });
    balustrade(A, cx - w / 2 + 0.35, cz - d / 2 + 0.35, cx + w / 2 - 0.35, cz + d / 2 - 0.35, gy, 0); // the rostrum's 汉白玉 railing
    { // eight big red lanterns hung across the front colonnade
      const hw = w - 8, nb = Math.max(2, Math.round((hw - 0.8) / 3.8)), bay = (hw - 0.8) / nb, x0 = cx - hw / 2 + 0.4, zf = cz + (d - 5) / 2 + 0.25, k0 = Math.max(0, Math.floor((nb - 8) / 2));
      for (let k = k0; k < Math.min(nb, k0 + 8); k++) BJB.lanterns.push([x0 + bay * (k + 0.5), gy + 3.4, zf, 2.4]);
    }
    // 金水桥 and a pair of 华表
    const wz = cz + d / 2 + 7;
    addWater({ x0: cx - w / 2 - 12, x1: cx + w / 2 + 12, z0: wz - 1.2, z1: wz + 1.2, deco: true, bridges: [-2, -1, 0, 1, 2].map((k) => [cx + k * 6.5, 3.2]) });
    for (let k = -2; k <= 2; k++) props.push(box(cx + k * 6.5, 0.6, wz, 3.2, 0.4, 3.8, 0xeceae4));
    // 华表: an octagonal two-step plinth, the column, the 云板 and a round cap with the 犼 squatting on top
    for (const s of [-1, 1]) {
      const x = cx + s * 14, z = wz + 5, M = 0xeceae4;
      props.push(gpart(new THREE.CylinderGeometry(1.5, 1.6, 0.6, 8), 0xdcd8cf, x, 0.6, z), gpart(new THREE.CylinderGeometry(1.05, 1.15, 0.45, 8), M, x, 1.12, z),
        gpart(new THREE.CylinderGeometry(0.5, 0.6, 9, 12), M, x, 4.8, z), box(x, 9.1, z, 2.6, 0.4, 0.6, M), gpart(new THREE.CylinderGeometry(0.85, 0.7, 0.32, 14), M, x, 9.5, z),
        gpart(new THREE.SphereGeometry(0.34, 12, 9), M, x, 9.95, z, 0, 0, 0, 0.9, 1.15, 1.2), gpart(new THREE.SphereGeometry(0.2, 10, 8), M, x, 10.28, z + 0.22));
    }
    // 端门: a smaller twin of 天安门 halfway to 午门, with the long 朝房 along both sides of the courtyard
    const dm = W.duanmen;
    if (dm) {
      const dz = (dm.z0 + dm.z1) / 2, dw = 34, dd = 11, dy = 9;
      this.gateWall(A, props, dm.x, dz, dw, dd, dy, 3.4, 5.6, [-1, 1], 7);
      hall(A, props, dm.x, dz, dw - 7, dd - 4, dy, 5, { double: true, rh: 3.4, north: true });
      for (const sd of [-1, 1]) for (const [z0, z1] of [[dm.z0 + 8, dz - dd / 2 - 4], [dz + dd / 2 + 4, dm.z1 - 4]]) {
        if (z1 - z0 < 8) continue;
        const x = dm.x + sd * 20; boxW(A.red, x - 2.4, 0.3, z0, x + 2.4, 4, z1, 3, 'nsew'); latticeFace(A.lattice, sd < 0 ? 'e' : 'w', x - 2.43, 0.3, z0 + 0.6, x + 2.43, 3.7, z1 - 0.6);
        gableRoof(A.roof, x, (z0 + z1) / 2, z1 - z0, 4.8, 4, 1.8, 1, 0.5);
        addSolid(null, { x0: x - 2.4, x1: x + 2.4, z0, z1, h: 6, kind: 'bld' });
      }
      for (let z = dm.z0 + 6; z < dm.z1 - 4; z += 14) for (const sd of [-1, 1]) newProp(dm.x + sd * 15.5, z, rand(0.8, 1), 'cypress');
    }
    flushAcc(A); Build.props.push(...props);
    W.landmarks.tiananmen = { x: cx, z: cz };
  },
  square() { // 广场: open stone paving, flag, flower beds, lamps; 大会堂 and 博物馆 as colonnaded blocks
    const sq = lmBox('square'); if (!sq) return;
    const props = [], cx = sq.cx;
    // the flagpole on a marble terrace with a balustrade (the steps face the square)
    { const FA = acc3(); terrace(FA, cx, sq.z0 + 16, 8, 8, 1, 1.0, 0); flushAcc(FA); }
    props.push(gpart(new THREE.CylinderGeometry(0.22, 0.3, 30, 12), 0xd9dcde, cx, 15.9, sq.z0 + 16), gpart(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 12), 0xc9c4b8, cx, 1.55, sq.z0 + 16));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3), new THREE.MeshLambertMaterial({ color: 0xd52b1e, side: THREE.DoubleSide }));
    flag.position.set(cx + 2.4, 28.2, sq.z0 + 16); scene.add(flag); W.flag = flag;
    // 国庆 flower beds: a granite rim, stepped rings of red / yellow / pink flowers, a 花篮 on top, loose flower clumps round the edge
    const FL = [0xff4048, 0xffcc30, 0xff70b0, 0xff8a2a, 0xffffff, 0xe8203a];
    for (const k of [0.35, 0.62]) {
      const z = sq.z0 + sq.d * k;
      props.push(gpart(new THREE.CylinderGeometry(7.4, 7.6, 0.7, 28), 0xd9d4c8, cx, 0.35, z), gpart(new THREE.CylinderGeometry(7.0, 7.0, 0.72, 28), 0x4f7a36, cx, 0.38, z),
        gpart(new THREE.CylinderGeometry(5.9, 6.6, 0.6, 28), 0xd8323a, cx, 0.95, z), gpart(new THREE.CylinderGeometry(4.5, 5.3, 0.6, 24), 0xf2c230, cx, 1.5, z),
        gpart(new THREE.CylinderGeometry(3.0, 3.9, 0.6, 20), 0xe0508f, cx, 2.05, z), gpart(new THREE.CylinderGeometry(1.8, 2.4, 0.5, 16), 0x4f7a36, cx, 2.55, z),
        gpart(new THREE.CylinderGeometry(1.9, 0.9, 2.2, 14), 0xc8102e, cx, 3.9, z), gpart(new THREE.TorusGeometry(1.9, 0.12, 5, 20), 0xe0b64a, cx, 5.0, z, Math.PI / 2),
        gpart(new THREE.IcosahedronGeometry(1.6, 1), 0xf2c230, cx, 5.4, z, 0, 0, 0, 1, 0.55, 1));
      // flower cards over each ring's top (tinted like the ring), a loose mixed border round the rim
      // ring: [inner r, top r, bottom r, top y, slope height, tint, count]; cards follow the flat top and the slope
      for (const [ri, rt, rb, yt, hh, col, n] of [[6.6, 7.0, 7.0, 0.74, 0, -1, 130], [5.3, 5.9, 6.6, 1.25, 0.6, 0xff3a3a, 220], [3.9, 4.5, 5.3, 1.8, 0.6, 0xffc830, 170], [2.4, 3.0, 3.9, 2.35, 0.6, 0xff70b0, 120], [0.9, 1.8, 2.4, 2.8, 0.5, 0xfff4e8, 50]])
        for (let i = 0; i < n; i++) {
          const a = rand(TAU), r = Math.sqrt(rand(ri * ri, rb * rb)), y = r <= rt || rb <= rt ? yt : yt - (r - rt) / (rb - rt) * hh;
          BJB.flowers.push({ x: cx + Math.cos(a) * r, y: y - 0.05, z: z + Math.sin(a) * r, ry: rand(TAU), s: rand(0.75, 1.15), c: col < 0 ? pick(FL) : col });
        }
      addSolid(null, { x0: cx - 7, x1: cx + 7, z0: z - 7, z1: z + 7, h: 2, kind: 'bld' });
    }
    // the 长安街 side: a row of white bollards with red bands (pedestrians through, cars not)
    for (let x = sq.x0 + 2, bz = sq.z0 + 1.4; x <= sq.x1 - 2; x += 2.6) {
      const k = Grid.at(x, bz), ns = Roads.nearest(x, bz, 16, (e) => e.C.traffic && Math.abs(e.pts[e.pts.length - 1][1] - e.pts[0][1]) > Math.abs(e.pts[e.pts.length - 1][0] - e.pts[0][0]));
      if (k === GK.ROAD || k === GK.ALLEY || (ns && ns.d < ns.e.hw + 2.5)) continue; // not across the side roads
      props.push(gpart(BOLLARD[0], 0xf2f1ec, x, 0.43, bz), gpart(BOLLARD[1], 0xf2f1ec, x, 0.86, bz), gpart(BOLLARD[2], 0xc8102e, x, 0.66, bz));
      addSolid(null, { x0: x - 0.15, x1: x + 0.15, z0: bz - 0.15, z1: bz + 0.15, h: 1.1, kind: 'pillar' });
    }
    for (let z = sq.z0 + 10; z < sq.z1 - 6; z += 24) for (const s of [-1, 1]) { const it = newProp(cx + s * (sq.w / 2 - 6), z, 1, 'lamp'); it.ry = s > 0 ? -Math.PI / 2 : Math.PI / 2; it.hua = true; } // 华灯
    for (const k of ['dahuitang', 'museum']) {
      const b = lmBox(k); if (!b) continue;
      const A = acc3(), face = k === 'dahuitang' ? 'e' : 'w', h = 15;
      boxW(A.white, b.x0, 0.3, b.z0, b.x1, h, b.z1, 3);
      const fx = face === 'e' ? b.x1 : b.x0;
      for (let z = b.z0 + 4; z < b.z1 - 3; z += 3.2) props.push(gpart(new THREE.CylinderGeometry(0.55, 0.6, h - 2, 10), 0xe9e4d6, fx + (face === 'e' ? 1.4 : -1.4), (h - 2) / 2 + 0.3, z));
      props.push(box(fx + (face === 'e' ? 1.4 : -1.4), h - 0.6, (b.z0 + b.z1) / 2, 2, 1.2, b.d - 4, 0xd9d2c0), box((b.x0 + b.x1) / 2, h + 0.5, (b.z0 + b.z1) / 2, b.w, 1, b.d, 0xcfc8b6));
      addSolid(null, { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: h + 1, kind: 'bld' });
      flushAcc(A);
    }
    Build.props.push(...props);
  },
  qianmen() { // 正阳门 + 箭楼, the old front gate of the city
    const g = lmBox('zhengyangmen'), j = lmBox('jianlou');
    const A = acc3(), props = [];
    if (g) {
      gateBase(A, props, g.cx, g.cz, 36, 11, 9, true, 'grey');
      addSolid(null, { x0: g.cx - 18, x1: g.cx - 2.4, z0: g.cz - 5.5, z1: g.cz + 5.5, h: 30, kind: 'bld' }); addSolid(null, { x0: g.cx + 2.4, x1: g.cx + 18, z0: g.cz - 5.5, z1: g.cz + 5.5, h: 30, kind: 'bld' });
      hall(A, props, g.cx, g.cz, 28, 8.5, 9.3, 5, { roof: 'roof', north: true });
      boxW(A.red, g.cx - 12, 15.8, g.cz - 3.4, g.cx + 12, 19.8, g.cz + 3.4, 3, 'nsew'); latticeFace(A.lattice, 's', g.cx - 11.5, 15.8, g.cz - 3.4, g.cx + 11.5, 19.6, g.cz + 3.43);
      hipRoof(A.roof, g.cx, g.cz, 26, 8.4, 19.8, 4.2, 0, 1.4);
      W.landmarks.qianmen = { x: g.cx, z: g.cz };
    }
    if (j) { // 箭楼: grey brick, rows of arrow windows
      gateBase(A, props, j.cx, j.cz, 34, 12, 10, true, 'grey', 4);
      // a stone string course on the base and a crenellated parapet (垛口) round the terrace
      boxW(A.marble, j.cx - 17.12, 10.0, j.cz - 6.12, j.cx + 17.12, 10.3, j.cz + 6.12, 2, 'nsew');
      for (const [x0, z0, x1, z1] of [[j.cx - 17, j.cz + 5.6, j.cx + 17, j.cz + 6], [j.cx - 17, j.cz - 6, j.cx + 17, j.cz - 5.6], [j.cx - 17, j.cz - 5.6, j.cx - 16.6, j.cz + 5.6], [j.cx + 16.6, j.cz - 5.6, j.cx + 17, j.cz + 5.6]]) {
        boxW(A.grey, x0, 10.3, z0, x1, 10.9, z1, 2, 'nsewt');
        const L = Math.max(x1 - x0, z1 - z0), ax = x1 - x0 > z1 - z0;
        for (let t = 0.3; t < L - 0.5; t += 1.3) boxW(A.grey, ax ? x0 + t : x0, 10.9, ax ? z0 : z0 + t, ax ? x0 + t + 0.75 : x1, 11.5, ax ? z1 : z0 + t + 0.75, 2, 'nsewt');
      }
      boxW(A.grey, j.cx - 15, 10.3, j.cz - 5, j.cx + 15, 17.3, j.cz + 5, 2.5);
      // arrow windows (箭窗): a deep dark embrasure each, a pale stone sill and lintel
      for (let row = 0; row < 4; row++) for (let k = 0; k < 12; k++) {
        const x = j.cx - 12.93 + k * 2.35, y = 10.95 + row * 1.5;
        Portals.add(x, y, j.cz + 5, 0, 1, 0.56, 0.62, 1.6, 0, 0x8d9095, true);
        props.push(box(x, y - 0.06, j.cz + 5.07, 0.84, 0.12, 0.16, 0xc9c4b8), box(x, y + 0.68, j.cz + 5.04, 0.74, 0.1, 0.1, 0xb9b4a8));
      }
      hipRoof(A.roof, j.cx, j.cz, 31, 11, 17.3, 4.4, 0, 1.3);
      addSolid(null, { x0: j.cx - 17, x1: j.cx - 2, z0: j.cz - 6, z1: j.cz + 6, h: 24, kind: 'bld' }); addSolid(null, { x0: j.cx + 2, x1: j.cx + 17, z0: j.cz - 6, z1: j.cz + 6, h: 24, kind: 'bld' });
    }
    flushAcc(A); Build.props.push(...props);
    // the story's square: in front of the 箭楼 (a golden Token coin on a plinth, where 杜卡德 calls you)
    const px = j ? j.cx - 22 : 0, pz = j ? j.cz - 12 : 220;
    const ped = new THREE.Mesh(mergeParts([gpart(new THREE.CylinderGeometry(3.4, 3.8, 0.9, 20), 0xa89a86, 0, 0.75, 0), gpart(new THREE.CylinderGeometry(1.2, 1.5, 2.8, 12), 0x8d8272, 0, 2.6, 0)]), MAT.vc);
    ped.position.set(px, 0, pz); ped.castShadow = true; ped.receiveShadow = true; scene.add(ped);
    const coin = new THREE.Mesh(coinGeometry(), MAT.coin); coin.scale.setScalar(2.8); coin.position.set(px, 7, pz); coin.castShadow = true; scene.add(coin);
    W.monument = coin; W.plaza = { x: px + 6, z: pz + 5 };
    addSolid(null, { x0: px - 3.6, x1: px + 3.6, z0: pz - 3.6, z1: pz + 3.6, h: 9, kind: 'monument' });
    W.gordonAt = { x: px - 10, z: pz + 6 };
  },
  jingshan() {
    const w = lmBox('wanchunting'); if (!w) return;
    const park = greenByName(/景山/)[0], pb = park ? ringBox(park.rings[0]) : { x0: w.cx - 60, x1: w.cx + 60, z0: w.cz - 50, z1: w.cz + 50, w: 120, d: 100 };
    const A = acc3(), props = [], cx = w.cx, cz = w.cz;
    const hill = { x: cx, z: cz, rx: Math.min(70, pb.w / 2 - 8), rz: Math.min(34, pb.d / 2 - 10), h: 14 };
    W.hills.push(hill);
    const g = new THREE.PlaneGeometry(hill.rx * 2 + 2, hill.rz * 2 + 2, 56, 28); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, hillH(hill, x, z) + 0.3 + 0.01, z); uv.setXY(i, x / 6, z / 6); }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, hillMat(6)); mesh.receiveShadow = true; scene.add(mesh);
    reserveRect(cx - hill.rx, cz - hill.rz, cx + hill.rx, cz + hill.rz, GK.PARK);
    for (let k = 0; k < 90; k++) { const a = rand(TAU), rr = Math.sqrt(Math.random()) * 0.92; const x = cx + Math.cos(a) * hill.rx * rr, z = cz + Math.sin(a) * hill.rz * rr; if (Math.abs(x - cx) < 6 && Math.abs(z - cz) < 6) continue; if (Math.abs(x - cx) < 14 && z > cz + 2 && z < cz + 30) continue; newProp(x, z, rand(0.7, 1.05), 'cypress'); }
    const pav = (x, s, tiers, roof) => {
      const y = hillH(hill, x, cz) + 0.3;
      for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.push(box(x + ax * s * 0.42, y + 1.6, cz + az * s * 0.42, 0.3, 3.2, 0.3, 0x9b2d24));
      pyramidRoof(A[roof], x, cz, s, y + 3.2, s * 0.35, 0.6);
      if (tiers > 1) { boxW(A.red, x - s * 0.3, y + 3.2 + s * 0.2, cz - s * 0.3, x + s * 0.3, y + 3.2 + s * 0.38, cz + s * 0.3, 2, 'nsew'); pyramidRoof(A[roof], x, cz, s * 0.62, y + 3.2 + s * 0.38, s * 0.42, 0.5); }
      props.push(gpart(new THREE.SphereGeometry(0.3, 8, 6), 0xe8b422, x, y + 3.2 + s * (tiers > 1 ? 0.82 : 0.37), cz));
      W.platforms.push({ x0: x - s * 0.5, x1: x + s * 0.5, z0: cz - s * 0.5, z1: cz + s * 0.5, h: y + 0.25 });
    };
    const sp = hill.rx * 0.34;
    pav(cx, 7, 2, 'yellow'); pav(cx - sp, 4.4, 1, 'green'); pav(cx + sp, 4.4, 1, 'green'); pav(cx - sp * 1.9, 3.4, 1, 'blue'); pav(cx + sp * 1.9, 3.4, 1, 'blue');
    W.landmarks.jingshan = { x: cx, z: cz, y: hill.h + 0.3 };
    if (park) wallAlong(A, park.rings[0], 3.2, 0.9, 'yellow', 'red', true, [[cx, pb.z1, 4]]);
    flushAcc(A); Build.props.push(...props);
  },
  beihai() { // 琼华岛 hill + 白塔 + 永安桥
    const q = lmBox('qionghuadao'), bt = lmBox('baita'); if (!q) return;
    const A = acc3(), props = [], ix = bt ? bt.cx : q.cx, iz = bt ? bt.cz : q.cz;
    const hl = { x: q.cx, z: q.cz, rx: q.w / 2, rz: q.d / 2, h: 9 }; W.hills.push(hl);
    const g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2);
    const gp = g.attributes.position, guv = g.attributes.uv;
    for (let i = 0; i < gp.count; i++) { const x = q.cx + gp.getX(i) * (hl.rx + 0.8), z = q.cz + gp.getZ(i) * (hl.rz + 0.8); gp.setXYZ(i, x, hillH(hl, x, z) + 0.36, z); guv.setXY(i, x / 5, z / 5); }
    g.computeVertexNormals();
    const isl = new THREE.Mesh(g, hillMat(5)); isl.receiveShadow = true; scene.add(isl);
    // pines / 国槐 over the island, the 永安桥 axis (the view up to the 白塔) kept open; 太湖石 rockeries among them
    for (let k = 0, n = 0; k < 200 && n < 72; k++) {
      const a = rand(TAU), rr = Math.sqrt(Math.random()) * 0.86, x = q.cx + Math.cos(a) * hl.rx * rr, z = q.cz + Math.sin(a) * hl.rz * rr;
      if (Math.abs(x - ix) < 7 && Math.abs(z - iz) < 7) continue; // the 白塔 terrace
      if (Math.abs(x - q.cx) < 9 && z > iz) continue;              // the axis from the bridge
      newProp(x, z, rand(0.6, 0.95), Math.random() < 0.6 ? 'cypress' : 'tree'); n++;
    }
    const rock = new THREE.IcosahedronGeometry(1, 1); // (smooth-shaded lumps, squashed per stone: not faceted gems)
    for (let k = 0; k < 26; k++) {
      const a = rand(TAU), rr = rand(0.25, 0.9), x = q.cx + Math.cos(a) * hl.rx * rr, z = q.cz + Math.sin(a) * hl.rz * rr, y = hillH(hl, x, z) + 0.3;
      if (Math.abs(x - ix) < 6 && Math.abs(z - iz) < 6) continue;
      for (let j = 0; j < 3; j++) props.push(gpart(rock, j ? 0xa8a39a : 0xbab5ab, x + rand(-0.8, 0.8), y + rand(0.1, 0.5), z + rand(-0.8, 0.8), rand(TAU), rand(TAU), rand(TAU), rand(0.45, 1.0), rand(0.6, 1.3), rand(0.45, 0.9)));
    }
    const by = hillH(hl, ix, iz) + 0.3;
    boxW(A.white, ix - 4.2, by, iz - 4.2, ix + 4.2, by + 2.6, iz + 4.2, 2);
    const white = 0xf4f2ec;
    props.push(gpart(new THREE.CylinderGeometry(3.7, 3.9, 1.2, 20), white, ix, by + 3.2, iz), gpart(new THREE.SphereGeometry(3.8, 20, 14, 0, TAU, 0, Math.PI * 0.62), white, ix, by + 3.8, iz, 0, 0, 0, 1, 1.2, 1));
    props.push(box(ix, by + 5.3, iz + 3.7, 1.6, 2.2, 0.25, 0xb91c1c), gpart(new THREE.CylinderGeometry(1.2, 1.6, 1.4, 16), white, ix, by + 8.9, iz));
    props.push(gpart(new THREE.CylinderGeometry(0.42, 1.2, 5.4, 16), white, ix, by + 12.3, iz));
    for (let k = 0; k < 6; k++) props.push(gpart(new THREE.CylinderGeometry(1.15 - k * 0.12, 1.15 - k * 0.12, 0.14, 16), 0xd8d4c8, ix, by + 10.1 + k * 0.75, iz));
    props.push(gpart(new THREE.CylinderGeometry(1.9, 1.6, 0.35, 16), 0xc9a23e, ix, by + 15, iz), gpart(new THREE.SphereGeometry(0.5, 10, 8), 0xe8b422, ix, by + 15.7, iz));
    addSolid(null, { x0: ix - 4.2, x1: ix + 4.2, z0: iz - 4.2, z1: iz + 4.2, h: 18, kind: 'bld' });
    W.landmarks.beihai = { x: ix, z: iz, top: by + 16 };
    // 永安桥: from the island's south shore straight south until dry land
    let z = q.z1 - 2; while (z < q.z1 + 90 && wetAt(q.cx, z + 1)) z += 1;
    if (z > q.z1) {
      boxW(A.marble, q.cx - 2.2, 0.3, q.z1 - 4, q.cx + 2.2, 1.1, z + 2, 2);
      props.push(box(q.cx - 2.1, 1.5, (q.z1 - 4 + z + 2) / 2, 0.2, 0.8, z + 6 - q.z1, 0xeceae4), box(q.cx + 2.1, 1.5, (q.z1 - 4 + z + 2) / 2, 0.2, 0.8, z + 6 - q.z1, 0xeceae4));
      Grid.poly([rectRing(q.cx - 2.2, q.z1 - 4, q.cx + 2.2, z + 2)], (i) => { Grid.kind[i] = GK.RESV; });
      W.platforms.push({ x0: q.cx - 2.2, x1: q.cx + 2.2, z0: q.z1 - 4, z1: z + 2, h: 1.1 });
    }
    flushAcc(A); Build.props.push(...props);
  },
  gulou() { // 鼓楼 + 钟楼
    const gl = lmBox('gulou'), zl = lmBox('zhonglou');
    const A = acc3(), props = [];
    if (gl) {
      const cx = gl.cx, dz = gl.cz;
      boxW(A.red, cx - 14, 0.3, dz - 8, cx + 14, 9.3, dz + 8, 3);
      for (const k of [-7, 0, 7]) for (const sd of [-1, 1]) Portals.add(cx + k, 0.3, dz + sd * 8, 0, sd, 3, 4.6, 16, 1, 0x8e3226); // the three 券洞 through the base
      addSolid(null, { x0: cx - 14, x1: cx + 14, z0: dz - 8, z1: dz + 8, h: 24, kind: 'bld' });
      hall(A, props, cx, dz, 22, 11, 9.3, 4.2, { roof: 'roof', north: true });
      boxW(A.red, cx - 10, 15.3, dz - 4.6, cx + 10, 18.8, dz + 4.6, 3, 'nsew'); latticeFace(A.lattice, 's', cx - 9.5, 15.3, dz - 4.6, cx + 9.5, 18.6, dz + 4.63);
      hipRoof(A.roof, cx, dz, 20, 9.2, 18.8, 3.8, 0, 1.4);
      W.landmarks.gulou = { x: cx, z: dz };
    }
    if (zl) {
      const cx = zl.cx, bz = zl.cz;
      boxW(A.grey, cx - 8, 0.3, bz - 8, cx + 8, 9.3, bz + 8, 2.5); for (const sd of [-1, 1]) Portals.add(cx, 0.3, bz + sd * 8, 0, sd, 3.2, 4.5, 16, 1, 0x8d9095);
      boxW(A.grey, cx - 6, 9.3, bz - 6, cx + 6, 15.3, bz + 6, 2.5); for (const sd of [-1, 1]) Portals.add(cx, 10.5, bz + sd * 6, 0, sd, 2, 2.6, 2.4, 0, 0x8d9095);
      hipRoof(A.roof, cx, bz, 12.8, 12.8, 15.3, 1.4, 0, 1.1); boxW(A.grey, cx - 4.2, 16.3, bz - 4.2, cx + 4.2, 17.6, bz + 4.2, 2, 'nsew'); hipRoof(A.roof, cx, bz, 9.4, 9.4, 17.6, 3.4, 0, 1);
      addSolid(null, { x0: cx - 8, x1: cx + 8, z0: bz - 8, z1: bz + 8, h: 22, kind: 'bld' });
    }
    flushAcc(A); Build.props.push(...props);
  },
  tiantan() { // 天坛: outer wall along the park, 祈年殿, 丹陛桥, 皇穹宇 + 回音壁, 圜丘
    const qn = lmBox('qiniandian'), hq = lmBox('huangqiongyu'), yq = lmBox('yuanqiu'); if (!qn) return;
    const A = acc3(), props = [];
    const park = greenByName(/^天坛公园$/)[0];
    if (park) wallAlong(A, park.rings[0], 3.4, 1, 'green', 'red', true, []);
    const cx = qn.cx, qz = qn.cz;
    for (const q of [...palaceWall(A, cx - 24, qz - 24, cx + 24, qz - 24, 3.6, 0.9), ...palaceWall(A, cx - 24, qz + 24, cx + 24, qz + 24, 3.6, 0.9, [[cx - 3.5, cx + 3.5]]),
      ...palaceWall(A, cx - 24, qz - 24, cx - 24, qz + 24, 3.6, 0.9), ...palaceWall(A, cx + 24, qz - 24, cx + 24, qz + 24, 3.6, 0.9)]) addSolid(null, Object.assign(q, { h: 4.5, kind: 'bld' }));
    reserveRect(cx - 25, qz - 25, cx + 25, qz + 25, GK.PLAZA); W.plazaPolys.push([rectRing(cx - 23.5, qz - 23.5, cx + 23.5, qz + 23.5)]);
    const ty = roundTerrace(A, cx, qz, 16, 3, 0.9, 2.2);
    cylW(A.red, cx, qz, 7.2, ty, ty + 6, 26, 2); latticeRound(A.lattice, cx, qz, 7.25, ty, ty + 5.6);
    // (each upper drum starts at the eave below it: the cone under it is lower than its foot, which left a slot of sky)
    roundRoof(A.blue, cx, qz, 8.6, ty + 6, 1.4, 30, 1.2, 7.2);
    cylW(A.red, cx, qz, 6, ty + 6, ty + 8.8, 26, 2); roundRoof(A.blue, cx, qz, 7.2, ty + 8.8, 1.3, 30, 1.0, 6);
    cylW(A.red, cx, qz, 4.9, ty + 8.8, ty + 11.6, 26, 2); roundRoof(A.blue, cx, qz, 5.8, ty + 11.6, 4.4, 30, 0.9, 4.9);
    props.push(gpart(new THREE.SphereGeometry(0.8, 12, 10), 0xe8b422, cx, ty + 16.5, qz));
    addSolid(null, { x0: cx - 7.2, x1: cx + 7.2, z0: qz - 7.2, z1: qz + 7.2, h: 28, kind: 'bld' });
    W.landmarks.tiantan = { x: cx, z: qz };
    if (hq) {
      const hz = hq.cz, hx = hq.cx;
      // 丹陛桥: a raised walkway down the axis
      boxW(A.marble, cx - 3.4, 0.3, qz + 25, cx + 3.4, 1.5, hz - 11, 2.5);
      W.platforms.push({ x0: cx - 3.4, x1: cx + 3.4, z0: qz + 25, z1: hz - 11, h: 1.5 });
      reserveRect(cx - 4, qz + 25, cx + 4, hz - 11, GK.PLAZA); W.plazaPolys.push([rectRing(cx - 3.4, qz + 25, cx + 3.4, hz - 11)]);
      const hy = roundTerrace(A, hx, hz, 6.2, 1, 0.9, 0);
      cylW(A.red, hx, hz, 4.1, hy, hy + 3.8, 22, 2); latticeRound(A.lattice, hx, hz, 4.15, hy, hy + 3.4); roundRoof(A.blue, hx, hz, 5, hy + 3.8, 3.4, 26, 0.9, 4.1);
      props.push(gpart(new THREE.SphereGeometry(0.45, 10, 8), 0xe8b422, hx, hy + 7.4, hz));
      addSolid(null, { x0: hx - 4.1, x1: hx + 4.1, z0: hz - 4.1, z1: hz + 4.1, h: 11, kind: 'bld' });
      for (const [u0, u1] of [[-Math.PI / 2 + 0.3, Math.PI / 2 - 0.3], [Math.PI / 2 + 0.3, Math.PI * 1.5 - 0.3]])
        for (const q of arcWall(A, hx, hz, 11, u0, u1, 3.4, 0.8, 22, 'blue')) addSolid(null, Object.assign(q, { h: 3.8, kind: 'bld' }));
      reserveRect(hx - 12, hz - 12, hx + 12, hz + 12, GK.PLAZA); W.plazaPolys.push([Array.from({ length: 24 }, (_, k) => [hx + Math.cos(k / 24 * TAU) * 11, hz + Math.sin(k / 24 * TAU) * 11])]);
    }
    if (yq) {
      roundTerrace(A, yq.cx, yq.cz, 12, 3, 0.9, 2.6);
      for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; props.push(box(yq.cx + Math.cos(a) * 11.8, 1.55, yq.cz + Math.sin(a) * 11.8, 0.22, 0.6, 0.22, 0xf2f0ea)); }
      reserveRect(yq.cx - 13, yq.cz - 13, yq.cx + 13, yq.cz + 13, GK.PLAZA); W.plazaPolys.push([Array.from({ length: 28 }, (_, k) => [yq.cx + Math.cos(k / 28 * TAU) * 13, yq.cz + Math.sin(k / 28 * TAU) * 13])]);
    }
    flushAcc(A); Build.props.push(...props);
  },
  yonghegong() { // 雍和宫: halls one after another up the N-S axis, 牌楼 at the gate, incense smoke
    const y = lmBox('yonghegong'); if (!y) return;
    const A = acc3(), props = [], cx = y.cx;
    for (const q of wallAlong(A, rectRing(y.x0 + 1, y.z0 + 1, y.x1 - 1, y.z1 - 1), 3.6, 0.9, 'yellow', 'red', true, [[cx, y.z1 - 1, 3]])) void q;
    const n = Math.max(3, Math.floor((y.d - 16) / 17));
    for (let k = 0; k < n; k++) {
      const hz = y.z1 - 14 - k * ((y.d - 22) / Math.max(1, n - 1)), hw = Math.min(y.w - 5, 20 - (k % 2) * 3);
      hall(A, props, cx, hz, hw, 7, 0.3 + (k === n - 1 ? 0.8 : 0.3), 4 + (k === n - 1 ? 1.2 : 0), { double: k === n - 1 || k === 2, roof: 'yellow' });
      addSolid(null, { x0: cx - hw / 2, x1: cx + hw / 2, z0: hz - 3.5, z1: hz + 3.5, h: 12, kind: 'bld' });
      BJB.incense.push([cx, hz + 6]);
    }
    for (const s of [-1, 0, 1]) props.push(box(cx + s * 3.3, 2.6, y.z1 + 3, 0.55, 4.6, 0.55, 0x9b2d24));
    gableRoof(A.yellow, cx, y.z1 + 3, 8.4, 1.3, 4.9, 1, 0, 0.5);
    flushAcc(A); Build.props.push(...props);
  },
  nctpa() { // 国家大剧院: the titanium "egg" in a reflecting pool
    const n = lmBox('nctpa'); if (!n) return;
    const rx = n.w / 2, rz = n.d / 2;
    addWater({ ellipse: true, x: n.cx, z: n.cz, rx: rx + 9, rz: rz + 9 });
    addDry({ ellipse: true, x: n.cx, z: n.cz, rx: rx + 0.5, rz: rz + 0.5 });
    // a causeway from the south
    Grid.poly([rectRing(n.cx - 2.5, n.cz + rz - 2, n.cx + 2.5, n.cz + rz + 12)], (i) => { if (Grid.kind[i] === GK.WATER) Grid.kind[i] = GK.RESV; });
    const shell = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.75, roughness: 0.28 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2633, metalness: 0.4, roughness: 0.12, emissive: 0xffc070, emissiveIntensity: 0 });
    W.extraGlow.push(glass);
    const eg = new THREE.SphereGeometry(1, 48, 24, 0, TAU, 0, Math.PI / 2); eg.scale(rx, 13, rz);
    const egg = new THREE.Mesh(eg, shell); egg.position.set(n.cx, 0.3, n.cz); egg.castShadow = true; egg.receiveShadow = true; scene.add(egg);
    const cg = new THREE.SphereGeometry(1.004, 24, 20, -0.35, 0.7, 0.05, Math.PI / 2 - 0.05); cg.scale(rx, 13, rz);
    const cut = new THREE.Mesh(cg, glass); cut.position.copy(egg.position); cut.rotation.y = Math.PI / 2; scene.add(cut);
    W.nctpaGlass = glass;
    addSolid(null, { x0: n.cx - rx * 0.86, x1: n.cx + rx * 0.86, z0: n.cz - rz * 0.86, z1: n.cz + rz * 0.86, h: 13, kind: 'bld' });
    reserveRect(n.x0 - 12, n.z0 - 12, n.x1 + 12, n.z1 + 12);
  },
  zhongnanhai() { // just a long red wall with trees behind; nothing to see here
    const z = lmPts('zhongnanhai'); if (!z) return;
    const A = acc3();
    const xm = lmBox('xinhuamen');
    wallAlong(A, z, 4.6, 1.1, 'yellow', 'red', true, []);
    if (xm) { hall(A, [], xm.cx, xm.cz - 3, 12, 5, 0.3, 5, { double: true }); addSolid(null, { x0: xm.cx - 6, x1: xm.cx + 6, z0: xm.cz - 5.5, z1: xm.cz - 0.5, h: 12, kind: 'bld' }); }
    flushAcc(A);
    const b = ringBox(z);
    for (let k = 0; k < 220; k++) { const x = rand(b.x0, b.x1), zz = rand(b.z0, b.z1); if (Grid.at(x, zz) === GK.RESV && pointInRing(x, zz, z)) newProp(x, zz, rand(0.8, 1.2), Math.random() < 0.3 ? 'cypress' : 'tree'); }
  },
  misc() {
    const A = acc3(), props = [];
    const ds = lmBox('deshengmen'); if (ds) this.fortress(A, props, ds.cx, ds.cz, 32, 13);
    const jl = lmBox('jiaolou');
    if (jl) { this.fortress(A, props, jl.cx, jl.cz, 22, 16); boxW(A.grey, jl.cx - 160, 0.3, jl.cz - 5, jl.cx - 11, 9.3, jl.cz + 3, 2.5); addSolid(null, { x0: jl.cx - 160, x1: jl.cx - 11, z0: jl.cz - 5, z1: jl.cz + 3, h: 10, kind: 'bld' }); for (let s = 0; s < 148; s += 2) props.push(box(jl.cx - 159 + s, 9.9, jl.cz - 4.7, 1, 1.2, 0.6, 0x8d9095)); }
    const yd = lmBox('yongdingmen');
    if (yd) { gateBase(A, props, yd.cx, yd.cz, 30, 10, 8, true, 'grey'); addSolid(null, { x0: yd.cx - 15, x1: yd.cx - 2.4, z0: yd.cz - 5, z1: yd.cz + 5, h: 20, kind: 'bld' }); addSolid(null, { x0: yd.cx + 2.4, x1: yd.cx + 15, z0: yd.cz - 5, z1: yd.cz + 5, h: 20, kind: 'bld' }); hall(A, props, yd.cx, yd.cz, 24, 7.4, 8.3, 4.4, { roof: 'roof', double: true }); }
    const bs = lmBox('bjstation');
    if (bs) { // 北京站: long hall, twin clock towers with green roofs
      const cx = bs.cx, z0 = bs.z0, z1 = bs.z1;
      boxW(A.white, bs.x0, 0.3, z0, bs.x1, 10.3, z1, 3); latticeFace(A.lattice, 's', bs.x0 + 1, 0.3, z0, bs.x1 - 1, 7.3, z1 + 0.03);
      hipRoof(A.green, cx, (z0 + z1) / 2, bs.w, bs.d, 10.3, 2.6, 0, 0.7);
      boxW(A.white, cx - 9, 10.3, z1 - 9, cx + 9, 15.3, z1 - 1, 3, 'nsew'); hipRoof(A.green, cx, z1 - 5, 18, 8, 15.3, 3, 0, 0.9);
      for (const s of [-1, 1]) { const tx = cx + s * 17; boxW(A.white, tx - 2.8, 10.3, z1 - 5, tx + 2.8, 20.3, z1 + 0.8, 3, 'nsew'); props.push(gpart(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20), 0xf8f6f0, tx, 17.5, z1 + 0.9, Math.PI / 2, 0, 0), box(tx, 17.7, z1 + 1.02, 0.14, 1.1, 0.05, 0x111111)); pyramidRoof(A.green, tx, z1 - 2, 6, 20.3, 4, 0.8); props.push(gpart(new THREE.SphereGeometry(0.45, 8, 6), 0xe8b422, tx, 24.6, z1 - 2)); }
      addSolid(null, { x0: bs.x0, x1: bs.x1, z0: z0, z1: z1 + 1, h: 22, kind: 'bld' });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshBasicMaterial({ map: plateTex('北 京 站', '#b91c1c', '#ffd23f'), transparent: true }));
      sign.position.set(cx, 13, z1 + 0.06); scene.add(sign); W.neonMats.push(sign.material);
    }
    const ms = lmBox('meishuguan');
    if (ms) { boxW(A.white, ms.x0 + 2, 0.3, ms.z0 + 2, ms.x1 - 2, 9.3, ms.z1 - 2, 3); hipRoof(A.yellow, ms.cx, ms.cz, ms.w - 2, ms.d - 2, 9.3, 3, 0, 0.9); boxW(A.white, ms.cx - 5, 9.3, ms.cz - 5, ms.cx + 5, 13.3, ms.cz + 5, 3, 'nsew'); pyramidRoof(A.yellow, ms.cx, ms.cz, 10, 13.3, 3.6, 0.8); addSolid(null, { x0: ms.x0 + 2, x1: ms.x1 - 2, z0: ms.z0 + 2, z1: ms.z1 - 2, h: 14, kind: 'bld' }); }
    for (const k of ['taimiao', 'shejitan']) {
      const b = lmBox(k); if (!b) continue;
      const cx = b.cx, cz = b.cz;
      if (k === 'taimiao') { const ty = terrace(A, cx, cz, 34, 16, 2, 0.9, 1.5); hall(A, props, cx, cz, 30, 12, ty, 6, { double: true, rh: 3.6 }); addSolid(null, { x0: cx - 15, x1: cx + 15, z0: cz - 6, z1: cz + 6, h: 20, kind: 'bld' }); }
      else { const ty = terrace(A, cx, cz + 10, 16, 16, 3, 0.5, 1); void ty; hall(A, props, cx, cz - 16, 18, 8, 0.3, 4.6, {}); addSolid(null, { x0: cx - 9, x1: cx + 9, z0: cz - 20, z1: cz - 12, h: 10, kind: 'bld' }); }
      wallAlong(A, rectRing(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1), 3.4, 0.8, 'yellow', 'red', true, [[cx, b.z1 - 1, 3]]);
    }
    const gt = lmBox('gongti');
    if (gt) { // 工人体育场: an oval bowl
      const cx = gt.cx, cz = gt.cz, rx = gt.w / 2, rz = gt.d / 2;
      props.push(gpart(new THREE.CylinderGeometry(1, 1.1, 12, 40, 1, true), 0xd8d4cc, cx, 6.3, cz, 0, 0, 0, rx, 1, rz), gpart(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), 0xb4202a, cx, 11.8, cz, 0, 0, 0, rx - 0.4, 1, rz - 0.4));
      addSolid(null, { x0: cx - rx, x1: cx + rx, z0: cz - rz, z1: cz + rz, h: 12, kind: 'bld' });
    }
    for (const k of ['ditan', 'ritan']) { const b = lmBox(k); if (!b) continue; const cx = b.cx, cz = b.cz; terrace(A, cx, cz, 18, 18, 2, 0.8, 2); wallAlong(A, rectRing(cx - 14, cz - 14, cx + 14, cz + 14), 1.4, 0.6, 'yellow', 'red', true, [[cx, cz + 14, 2.4]]); }
    flushAcc(A); Build.props.push(...props);
  },
  fortress(A, props, cx, cz, w, d) { // 箭楼-style brick fortress with rows of arrow windows
    boxW(A.grey, cx - w / 2, 0.3, cz - d / 2, cx + w / 2, 11.3, cz + d / 2, 2.5);
    boxW(A.grey, cx - w / 2 + 1, 11.3, cz - d / 2 + 1, cx + w / 2 - 1, 17.3, cz + d / 2 - 1, 2.5);
    for (let row = 0; row < 4; row++) for (let k = 0; k < Math.floor(w / 2.3); k++) props.push(box(cx - w / 2 + 2 + k * 2.3, 12 + row * 1.4, cz + d / 2 - 0.98, 0.6, 0.6, 0.06, 0x16120e));
    hipRoof(A.roof, cx, cz, w + 0.5, d + 0.5, 17.3, 4.4, 0, 1.3);
    addSolid(null, { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: 23, kind: 'bld' });
  },
  // Token 王府 = 恭王府: an axis-aligned mansion, the gate on the side nearest a street; its own meshes so the betrayal can burn it
  // the OSM 恭王府 box swallows the bend of 柳荫街: take the largest clear axis-aligned rect around it
  // (streets keep a sidewalk + a strip in front of the gate), hand the rest of the box back to the city
  fitLot(g, pad = 14, minW = 34, maxW = 62) {
    const S = 2, X0 = g.x0 - pad, Z0 = g.z0 - pad, nx = Math.ceil((g.w + 2 * pad) / S), nz = Math.ceil((g.d + 2 * pad) / S), bad = new Uint8Array(nx * nz), P = [0, 0, 0, 0];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = Grid.at(X0 + (i + 0.5) * S, Z0 + (j + 0.5) * S); if (k !== GK.FREE && k !== GK.RESV && k !== GK.WALK) bad[j * nx + i] = 1; }
    const X1 = X0 + nx * S, Z1 = Z0 + nz * S, near = [];
    for (const e of Roads.edges) {
      const r = e.hw + (e.C.traffic ? Math.max(e.C.walk, 2) + 2.5 : 0.8);
      if (!e.pts.some((p) => p[0] > X0 - r - 60 && p[0] < X1 + r + 60 && p[1] > Z0 - r - 60 && p[1] < Z1 + r + 60)) continue;
      near.push(e);
      for (let s = 0; s <= e.len; s += 1) {
        Roads.at(e, s, P); if (P[0] < X0 - r || P[0] > X1 + r || P[1] < Z0 - r || P[1] > Z1 + r) continue;
        const i0 = Math.max(0, Math.floor((P[0] - r - X0) / S)), i1 = Math.min(nx - 1, Math.floor((P[0] + r - X0) / S)), j0 = Math.max(0, Math.floor((P[1] - r - Z0) / S)), j1 = Math.min(nz - 1, Math.floor((P[1] + r - Z0) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = X0 + (i + 0.5) * S - P[0], dz = Z0 + (j + 0.5) * S - P[1]; if (dx * dx + dz * dz < (r + S * 0.71) ** 2) bad[j * nx + i] = 1; }
      }
    }
    const W1 = nx + 1, ps = new Uint16Array(W1 * (nz + 1)); // prefix sums of blocked cells
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) ps[(j + 1) * W1 + i + 1] = bad[j * nx + i] + ps[j * W1 + i + 1] + ps[(j + 1) * W1 + i] - ps[j * W1 + i];
    const mn = Math.ceil(minW / S), mx = Math.floor(maxW / S);
    let best = null, bs = 0;
    for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0 + mn; i1 <= Math.min(nx, i0 + mx); i1++) {
      const x0 = X0 + i0 * S, x1 = X0 + i1 * S, ox = Math.max(0, Math.min(x1, g.x1) - Math.max(x0, g.x0));
      for (let j0 = 0; j0 < nz; j0++) for (let j1 = j0 + mn; j1 <= Math.min(nz, j0 + mx + 4); j1++) {
        if (ps[j1 * W1 + i1] - ps[j0 * W1 + i1] - ps[j1 * W1 + i0] + ps[j0 * W1 + i0]) break; // taller only gets worse
        const z0 = Z0 + j0 * S, z1 = Z0 + j1 * S, oz = Math.max(0, Math.min(z1, g.z1) - Math.max(z0, g.z0)), a = (x1 - x0) * (z1 - z0);
        const sc = ox * oz + 0.3 * (a - ox * oz); // stay on the real site, spill over a little if that buys room
        if (sc > bs) { bs = sc; best = { x0, x1, z0, z1 }; }
      }
    }
    if (!best) return g;
    const f = Object.assign(best, { cx: (best.x0 + best.x1) / 2, cz: (best.z0 + best.z1) / 2, w: best.x1 - best.x0, d: best.z1 - best.z0 });
    // give the left-over strip back: houses may build there, the sidewalks / lanes the reserve ate come back
    Grid.poly([rectRing(g.x0, g.z0, g.x1, g.z1)], (i) => { if (Grid.kind[i] === GK.RESV) Grid.kind[i] = GK.FREE; });
    reserveRect(f.x0, f.z0, f.x1, f.z1);
    for (const e of near) {
      const k = e.cls >= 6 ? GK.ALLEY : GK.ROAD;
      for (let i = 0; i < e.pts.length - 1; i++) {
        const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1];
        Grid.capsule(ax, az, bx, bz, e.hw, (c) => { if (Grid.kind[c] === GK.FREE) Grid.kind[c] = k; });
        if (e.C.walk > 0.5) Grid.capsule(ax, az, bx, bz, e.hw + e.C.walk, (c) => { if (Grid.kind[c] === GK.FREE) Grid.kind[c] = GK.WALK; });
      }
    }
    return f;
  },
  home() {
    const g0 = lmBox('gongwangfu'), g = g0 && this.fitLot(g0);
    if (!g) { // no 恭王府 in the data: spawn on the nearest street to where it should be
      const [hx, hz] = geoToGame(116.3862, 39.9366), n = Roads.nearest(hx, hz, 200, (e) => e.cls <= 5);
      const [x, z] = n ? [n.x, n.z] : [0, 60];
      W.spawn.set(x, 0, z); W.respawn.set(x, 0, z); addDoor('home', 'home', 'Token 王府', x, z, 0).o = [0, 1];
      W.special.home = { x0: x - 10, x1: x + 10, z0: z - 30, z1: z, front: { x, z, ox: 0, oz: 1, w: 20 }, h: 10 };
      return;
    }
    // which side faces a street?
    const sides = [['s', g.cx, g.z1 + 6], ['n', g.cx, g.z0 - 6], ['e', g.x1 + 6, g.cz], ['w', g.x0 - 6, g.cz]].map(([k, x, z]) => { const n = Roads.nearest(x, z, 60, (e) => e.cls <= 5), h = Roads.nearest(x, z, 60, (e) => e.cls <= 6); return { k, d: Math.min(n ? n.d : 99, h ? h.d + 12 : 99) }; }).sort((a, b) => a.d - b.d); // a gate on a street you can drive to
    const face = sides[0].k, rot = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[face];
    const along = face === 's' || face === 'n' ? g.w : g.d, deep = face === 's' || face === 'n' ? g.d : g.w;
    const w = Math.min(along - 2, 60), d = Math.min(deep - 2, 70), A = acc3(), props = [], x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const cz0 = 0;
    const walls = [...palaceWall(A, x0, z0, x1, z0, 3.6, 0.9), ...palaceWall(A, x0, z0, x0, z1, 3.6, 0.9), ...palaceWall(A, x1, z0, x1, z1, 3.6, 0.9), ...palaceWall(A, x0, z1, x1, z1, 3.6, 0.9, [[-4, 4]])];
    hall(A, props, 0, z0 + 10, Math.min(30, w - 8), 8, 1.1, 4.6, { roof: 'green', double: true, rh: 2.6 }); boxW(A.marble, -Math.min(16, w / 2 - 3), 0.3, z0 + 5, Math.min(16, w / 2 - 3), 1.1, z0 + 15, 2);
    hall(A, props, 0, cz0 + 2, Math.min(24, w - 10), 7, 0.3, 4, { roof: 'roof' });
    for (const s of [-1, 1]) hall(A, props, s * (w / 2 - 6), cz0 + 2, 5, Math.min(18, d / 3), 0.3, 3.4, { roof: 'roof', gable: true });
    // 王府大门: a three-bay gatehouse on a stone base, lacquered columns, 彩画, the vermilion doors with gold studs
    boxW(A.marble, -5, 0.3, z1 - 3.4, 5, 0.75, z1 + 0.8, 2); for (let k = 0; k < 3; k++) boxW(A.marble, -2, 0.3, z1 + 0.8 + (2 - k) * 0.35, 2, 0.3 + 0.15 * (k + 1), z1 + 0.8 + (3 - k) * 0.35, 2, 'sewt');
    hallBody(A, -4.5, z1 - 3.1, 4.5, z1 + 0.5, 0.75, 4.6, { bays: 3 });
    hipRoof(A.green, 0, z1 - 1.3, 9, 3.6, 5.35, 2.2, 0, 1.1, 0.55);
    props.push(box(0, 2.35, z1 - 0.15, 2.3, 3.2, 0.08, 0x9b1c14), box(0, 2.35, z1 - 0.1, 0.05, 3.2, 0.04, 0x5a120c));
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) for (const sx of [-1, 1]) props.push(box(sx * (0.25 + c * 0.32), 1.25 + r * 0.55, z1 - 0.09, 0.09, 0.09, 0.06, 0xe0b040));
    // 石狮: a lion on a carved plinth each side
    for (const s of [-1, 1]) {
      const x = s * 3.4, z = z1 + 2.2, st = 0xb4afa4, dk = 0x8f8a80;
      // a seated 蹲狮: haunches, a raised chest on straight forelegs, the curly mane behind a square-muzzled head; the male's paw on a 绣球
      const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h), md = 0x9d978b;
      props.push(box(x, 0.45, z, 1.1, 0.9, 1.5, dk), box(x, 0.95, z, 1.25, 0.12, 1.65, st), box(x, 1.03, z, 1.0, 0.06, 1.35, md),
        gpart(S(0.42), st, x, 1.4, z - 0.2, 0, 0, 0, 0.95, 0.85, 1.2), gpart(S(0.36), st, x, 1.72, z + 0.1, -0.35, 0, 0, 0.9, 1.25, 0.8),
        gpart(new THREE.CylinderGeometry(0.085, 0.1, 0.62, 10), st, x - 0.17, 1.35, z + 0.34), gpart(new THREE.CylinderGeometry(0.085, 0.1, 0.62, 10), st, x + 0.17, 1.35, z + 0.34),
        gpart(S(0.11, 10, 8), st, x - 0.17, 1.1, z + 0.42, 0, 0, 0, 1, 0.7, 1.3), gpart(S(0.11, 10, 8), st, x + 0.17, 1.1, z + 0.42, 0, 0, 0, 1, 0.7, 1.3),
        gpart(new THREE.IcosahedronGeometry(0.42, 1), md, x, 2.12, z + 0.02, 0.3, 0.4, 0, 1, 1.05, 0.8), gpart(S(0.33), st, x, 2.18, z + 0.24),
        gpart(S(0.17, 12, 8), st, x, 2.07, z + 0.5, 0, 0, 0, 1.25, 0.85, 1), gpart(S(0.05, 8, 6), 0x3a342c, x - 0.12, 2.26, z + 0.52), gpart(S(0.05, 8, 6), 0x3a342c, x + 0.12, 2.26, z + 0.52));
      for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.4; props.push(gpart(S(0.085, 8, 6), md, x + Math.sin(a) * 0.3, 2.44 + Math.cos(a) * 0.06, z + 0.14 - Math.abs(a) * 0.08)); }
      props.push(s > 0 ? gpart(S(0.17, 12, 10), 0x8f8a80, x + 0.2, 1.17, z + 0.52) : gpart(S(0.13, 10, 8), st, x + 0.22, 1.15, z + 0.5, 0, 0, 0, 0.9, 0.8, 1.2));
    }
    const grp = accGroup(A);
    const pm = new THREE.Mesh(mergeParts(props), MAT.vc); pm.castShadow = true; grp.add(pm);
    grp.position.set(g.cx, 0, g.cz); grp.rotation.y = rot; scene.add(grp);
    const mats = []; grp.traverse((o) => { if (o.material && !mats.includes(o.material)) mats.push(o.material); });
    for (const q of walls) localSolid(g.cx, g.cz, rot, q.x0, q.z0, q.x1, q.z1, 4.6);
    localSolid(g.cx, g.cz, rot, -15, z0 + 5, 15, z0 + 15, 10); localSolid(g.cx, g.cz, rot, -12, cz0 - 1.5, 12, cz0 + 5.5, 8);
    const c = Math.cos(rot), sn = Math.sin(rot), L = (lx, lz) => [g.cx + lx * c + lz * sn, g.cz - lx * sn + lz * c];
    const [dx, dz] = L(0, z1 + 2.6), [ox, oz] = [sn, c];
    const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('Token 王府', 'HOME · 存档点', '#8a1c14', '#d4a017'), transparent: true }));
    W.neonMats.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat); const [sx, sz] = L(0, z1 + 0.5); sign.position.set(sx, 6.6, sz); sign.rotation.y = rot; scene.add(sign);
    for (let k = 0; k < 8; k++) { const [tx, tz] = L(rand(x0 + 4, x1 - 4), rand(z0 + 17, z1 - 8)); newProp(tx, tz, rand(0.8, 1.1), 'tree'); }
    const [f0x, f0z] = L(-w / 2, z1), [f1x, f1z] = L(w / 2, z1), cn = [L(x0, z0), L(x1, z0), L(x1, z1), L(x0, z1)];
    // world AABB of the compound (x0..z1) + the street front: gate centre, outward normal o, width
    W.special.home = { x0: Math.min(...cn.map((p) => p[0])), x1: Math.max(...cn.map((p) => p[0])), z0: Math.min(...cn.map((p) => p[1])), z1: Math.max(...cn.map((p) => p[1])),
      front: { x: (f0x + f1x) / 2, z: (f0z + f1z) / 2, ox, oz, w }, rot, mesh: grp, mats, sign, h: 10 };
    addDoor('home', 'home', 'Token 王府', dx, dz, rot).o = [ox, oz];
    // keep the forecourt open: no house takes the strip between the gate and the street
    Grid.poly([[L(-8, z1 + 0.6), L(8, z1 + 0.6), L(8, z1 + 18), L(-8, z1 + 18)]], (i) => { const k = Grid.kind[i]; if (k === GK.FREE || k === GK.RESV) Grid.kind[i] = GK.PLAZA; });
    // spawn on the sidewalk / street in front of the gate, a step to the side of the door marker
    const street = Roads.nearest(dx + ox * 6, dz + oz * 6, 40, (e) => e.cls <= 6), sp = [dx + ox * 4 + 2 * c, dz + oz * 4 - 2 * sn];
    if (street && hyp(street.x - sp[0], street.z - sp[1]) > street.e.hw + 6) { sp[0] = street.x - ox * (street.e.hw + 1.5); sp[1] = street.z - oz * (street.e.hw + 1.5); }
    W.respawn.set(dx + ox * 3, 0, dz + oz * 3); W.spawn.set(sp[0], 0, sp[1]);
  },
  places() {
    const S = {};
    for (const [k, [lon, lat]] of Object.entries(SPOTS)) S[k] = geoToGame(lon, lat);
    // malls & modern fronts
    for (const k of ['electronics', 'clothes', 'dept', 'gym', 'lab']) {
      const [ax, az] = S[k], site = frontSite(ax, az, 22, 16, { cls: (e) => e.cls <= 5 });
      if (!site) continue;
      const [label, c1, c2] = SHOP_SIGNS[k], h = k === 'lab' ? 16 : 12;
      const fac = Render.cutout(makeFacade(pick(FACADES))); W.extraFacades.push(fac);
      const grp = new THREE.Group(); grp.position.set(site.cx, 0, site.cz); grp.rotation.y = site.rot; scene.add(grp);
      const mesh = new THREE.Mesh(buildingGeo(22, h, 16), [fac, MAT.roof]); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
      const smat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex(label, '', c1, c2), transparent: true })); W.neonMats.push(smat);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), smat); sign.position.set(0, Math.min(h - 1.8, 9), 8.2); grp.add(sign);
      const can = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 2.6), new THREE.MeshLambertMaterial({ color: parseInt(c1.slice(1), 16) })); can.position.set(0, 4.2, 9.2); grp.add(can);
      const s = addSolid(null, { cx: site.cx, cz: site.cz, hx: 11, hz: 8, rot: -site.rot, h: h + 0.3, kind: 'special', mesh, sign });
      W.special[k] = s;
      const dx = site.fx + site.ox * -1.3, dz = site.fz + site.oz * -1.3;
      addDoor(k, k, label, site.fx + site.ox * 1.2, site.fz + site.oz * 1.2, 0).o = [site.ox, site.oz]; void dx; void dz;
      this.sites[k] = site;
    }
    // 老字号 fronts with plaques
    for (const k of ['snack', 'antique', 'shoes', 'pharmacy', 'duck', 'teahouse', 'hardware']) {
      const [ax, az] = S[k], site = frontSite(ax, az, 11, 11, { cls: (e) => e.cls !== 0 });
      if (!site) continue;
      const A = acc3(), props = [], x0 = -5.5, x1 = 5.5, z0 = -5.5, z1 = 5.5, h = 6.4;
      boxW(A.brick, x0, 0.3, z0, x1, 0.3 + h, z1, 2, 'new');
      latticeFace(A.lattice, 's', x0 + 0.2, 3.8, z0, x1 - 0.2, 0.3 + h - 0.1, z1 + 0.02);
      props.push(box(0, 1.9, z1 + 0.05, x1 - x0 - 0.4, 3.2, 0.1, 0x5a3420), box(0, 1.6, z1 + 0.08, 2.4, 2.8, 0.06, 0x17120e));
      for (const x of [x0 + 0.3, 0, x1 - 0.3]) props.push(box(x, 3.3, z1 + 0.25, 0.36, 6, 0.36, 0x9b2d24));
      hipRoof(A.roof, 0, 0, x1 - x0, z1 - z0, 0.3 + h, 2.6, 0, 0.9);
      const grp = accGroup(A); const pm = new THREE.Mesh(mergeParts(props), MAT.vc); pm.castShadow = true; grp.add(pm);
      grp.position.set(site.cx, 0, site.cz); grp.rotation.y = site.rot; scene.add(grp);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.6), new THREE.MeshBasicMaterial({ map: plaqueTex(OLD_SIGNS[k]), transparent: true }));
      plate.position.set(0, 3.55, z1 + 0.16); grp.add(plate); W.neonMats.push(plate.material);
      const c = Math.cos(site.rot), sn = Math.sin(site.rot);
      for (const s of [-1, 1]) BJB.lanterns.push([site.cx + s * 4 * c + (z1 + 0.6) * sn, 0.3 + h - 0.8, site.cz - s * 4 * sn + (z1 + 0.6) * c]);
      addSolid(null, { cx: site.cx, cz: site.cz, hx: 5.5, hz: 5.5, rot: -site.rot, h: h + 3, kind: 'bld' });
      addDoor(k, k, OLD_SIGNS[k], site.fx + site.ox * 1.2, site.fz + site.oz * 1.2, 0).o = [site.ox, site.oz];
      this.sites[k] = site;
    }
    // 舆情公关中心: drive in to wash your wanted level
    {
      const [ax, az] = S.garage, site = frontSite(ax, az, 22, 16, { cls: (e) => e.cls <= 4 });
      if (site) {
        const grp = new THREE.Group(); grp.position.set(site.cx, 0, site.cz); grp.rotation.y = site.rot; scene.add(grp);
        const fac = Render.cutout(makeFacade(FACADES[6])); W.extraFacades.push(fac);
        const mesh = new THREE.Mesh(buildingGeo(22, 9, 16), [fac, MAT.roof]); mesh.castShadow = true; grp.add(mesh);
        const smat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('舆情公关中心', '', '#0f766e', '#5eead4'), transparent: true })); W.neonMats.push(smat);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), smat); sign.position.set(0, 7, 8.2); grp.add(sign);
        const door = new THREE.Mesh(mergeParts([box(0, 3.2, 8.12, 10, 6, 0.3, 0x2b2f36), ...[0, 1, 2, 3, 4, 5].map((k) => box(0, 0.8 + k, 8.3, 9.6, 0.12, 0.1, 0x9aa3ad))]), MAT.vc); grp.add(door);
        const s = addSolid(null, { cx: site.cx, cz: site.cz, hx: 11, hz: 8, rot: -site.rot, h: 9.3, kind: 'special', mesh });
        W.garage = { x: site.fx + site.ox * 3.5, z: site.fz + site.oz * 3.5, solid: s };
      }
    }
    // the dojo: a three-tier temple in a grove at the western edge (西山 is just beyond)
    {
      const [ax, az] = S.dojo, site = frontSite(ax, az, 30, 30, { cls: (e) => e.cls <= 5, maxR: 300 }) || frontSite(ax, az, 24, 24, { cls: (e) => e.cls <= 6, maxR: 400 });
      if (site) {
        const cx = site.cx, cz = site.cz, wood = 0x6b3a22, roofC = 0x2a2f38, gold = 0xe0a040, orange = 0xe8845a;
        const parts = [box(0, 0.6, 0, 16, 1.2, 16, 0x8a8278)];
        for (let t = 0; t < 3; t++) {
          const s = 12 - t * 3.2, y = 1.2 + t * 5.2;
          parts.push(box(0, y + 2, 0, s, 4, s, wood), gpart(new THREE.ConeGeometry(s * 0.95, 2.2, 4), roofC, 0, y + 5, 0, 0, Math.PI / 4, 0));
          for (const [lx, lz] of [[-1, 1], [1, 1]]) parts.push(box(lx * (s / 2 - 0.6), y + 3.2, lz * (s / 2 + 0.3), 0.7, 0.9, 0.7, orange));
        }
        parts.push(box(0, 18.4, 0, 0.4, 3, 0.4, gold), box(0, 3, 6.2, 3.2, 3.6, 0.3, 0x1b1410));
        const mesh = new THREE.Mesh(mergeParts(parts), MAT.vc); mesh.position.set(cx, 0.3, cz); mesh.rotation.y = site.rot; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
        W.special.dojo = addSolid(null, { cx, cz, hx: 8, hz: 8, rot: -site.rot, h: 19, kind: 'special', mesh });
        // a stone path from the sidewalk to the door, trees on both sides
        const dx = cx + site.ox * 9.4, dz = cz + site.oz * 9.4;
        addDoor('dojo', 'dojo', '影之 Agent 联盟道场', cx + site.ox * 9.4, cz + site.oz * 9.4, 0).o = [site.ox, site.oz]; // at the foot of the steps, not out on the pavement
        Build.props.push(box((dx + site.fx) / 2, 0.05, (dz + site.fz) / 2, 3, 0.1, hyp(site.fx - dx, site.fz - dz) + 1, 0x9a948a, site.rot));
        W.dojoPos = new V3(cx, 0, cz);
        for (let k = 0; k < 80; k++) {
          const a = rand(TAU), r = rand(10, 34), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, kd = Grid.at(x, z);
          const lx = (x - cx) * site.ux + (z - cz) * site.uz, lz = (x - cx) * site.ox + (z - cz) * site.oz, inLot = Math.abs(lx) < 14.5 && Math.abs(lz) < 14.5;
          if (!(kd === GK.FREE || kd === GK.PARK || kd === GK.BLD && inLot && (Math.abs(lx) > 9.5 || Math.abs(lz) > 9.5)) || (Math.abs(lx) < 3.5 && lz > 0)) continue;
          Grid.capsule(x, z, x + 0.01, z, 1, (i) => { if (Grid.kind[i] === GK.FREE) Grid.kind[i] = GK.PARK; }); newProp(x, z, rand(0.8, 1.2), 'cypress');
        }
        this.sites.dojo = site;
      }
    }
    // 阿卡姆标注中心 (north, 安定门外)
    {
      const [ax, az] = S.arkham, site = frontSite(ax, az, 34, 26, { cls: (e) => e.cls <= 5, maxR: 300 });
      if (site) {
        const cx = site.cx, cz = site.cz, stone = 0x4a4f58, dark = 0x2b2e35, green = 0x9fe870;
        const parts = [box(0, 5, 0, 30, 10, 18, stone)];
        for (const sx of [-1, 1]) { parts.push(box(sx * 13, 9, 0, 6, 18, 8, dark)); parts.push(gpart(new THREE.ConeGeometry(4.6, 7, 4), 0x1c1e24, sx * 13, 21.5, 0, 0, Math.PI / 4, 0)); }
        parts.push(gpart(new THREE.ConeGeometry(9, 6, 4), 0x1c1e24, 0, 13, 0, 0, Math.PI / 4, 0));
        for (let k = -3; k <= 3; k++) parts.push(box(k * 3.6, 6.5, 9.05, 1.4, 2.6, 0.1, green));
        parts.push(box(0, 2.4, 9.1, 4, 4.4, 0.2, 0x111111));
        const grp = new THREE.Group(); grp.position.set(cx, 0.3, cz); grp.rotation.y = site.rot; scene.add(grp);
        const mesh = new THREE.Mesh(mergeParts(parts), MAT.vc); mesh.position.z = -2; mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh);
        W.special.arkham = addSolid(null, { cx: cx - site.ox * 2, cz: cz - site.oz * 2, hx: 16, hz: 9.5, rot: -site.rot, h: 22, kind: 'special', mesh });
        const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('阿卡姆标注中心', 'ARKHAM LABELING · 安定门外', '#1f2a12', '#4d7c0f'), transparent: true }));
        W.neonMats.push(signMat);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), signMat); sign.position.set(0, 11.7, 7.3); sign.rotation.x = -0.3; grp.add(sign);
        addDoor('arkham', 'arkham', '阿卡姆标注中心', cx + site.ox * 8.7, cz + site.oz * 8.7, 0).o = [site.ox, site.oz]; // facade at 7.5 m (mesh set back 2)
        Build.props.push(box(cx + site.ox * 10, 0.05, cz + site.oz * 10, 4, 0.1, 6.5, 0x5b5f66, site.rot));
        this.sites.arkham = site;
      }
    }
    // 中央算力塔 (建国门外, where 长安街 heads off to the CBD)
    {
      const [ax, az] = S.tower, site = frontSite(ax, az, 26, 26, { cls: (e) => e.cls <= 3, maxR: 260 }) || frontSite(ax, az, 26, 26, { cls: (e) => e.cls <= 5, maxR: 300 });
      if (site) { this.tower(site.cx, site.cz, site.rot); this.sites.tower = site; }
    }
  },
  tower(cx, cz, rot = 0) { // 中国尊-shaped: wide base, pinched waist, flared crown
    // lathe uv: u 0..6 round the ~65 m waist, v in 16 m units → ~1.7 m × 3.2 m panes
    const fac = Render.cutout(PBR.glass({ color: 0xd8e4f2, emissive: 0xffd08a, ei: 0.5, rx: 1.6, ry: 0.5 }) || new THREE.MeshStandardMaterial({ color: 0xa9bdd6, map: TEX.curtain, emissive: 0xffc940, emissiveMap: TEX.curtainE, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.14 }));
    W.towerMat = fac; W.extraFacades.push(fac); // lit offices follow the time of day
    const pts = []; const H = 120;
    for (let k = 0; k <= 12; k++) { const t = k / 12, w = 11.5 - 3.2 * Math.sin(t * Math.PI) + (t > 0.9 ? (t - 0.9) * 14 : 0); pts.push(new THREE.Vector2(w, t * H)); }
    const g = new THREE.LatheGeometry(pts, 4, Math.PI / 4);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * H / 16);
    const mesh = new THREE.Mesh(g, fac); mesh.position.set(cx, 0.3, cz); mesh.castShadow = true; scene.add(mesh);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 18), Render.cutout(new THREE.MeshBasicMaterial({ color: 0xffc940 }))); crown.position.set(cx, H + 0.3, cz); scene.add(crown); W.neonMats.push(crown.material);
    Build.props.push(box(cx, H + 11, cz, 0.6, 20, 0.6, 0x8a929c));
    Build.reds.push(box(cx, H + 21.5, cz, 1.2, 1.2, 1.2, 0xffffff));
    W.special.tower = addSolid(null, { x0: cx - 11, x1: cx + 11, z0: cz - 11, z1: cz + 11, h: H, kind: 'special', mesh });
    const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('中央算力塔', 'CENTRAL COMPUTE · 建国门外', '#7a5a10', '#ffc940'), transparent: true })); W.neonMats.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), signMat); sign.position.set(cx + Math.sin(rot) * 11.4, 18, cz + Math.cos(rot) * 11.4); sign.rotation.y = rot; scene.add(sign);
    W.towerPos = new V3(cx, 0, cz); W.towerFront = { x: cx + Math.sin(rot) * 16, z: cz + Math.cos(rot) * 16, ox: Math.sin(rot), oz: Math.cos(rot) };
  },
  hqs() {
    for (const def of HQ_DEFS) {
      const sp = HQ_SPOTS[def.id]; if (!sp) continue;
      const [ax, az] = geoToGame(sp[0], sp[1]), site = frontSite(ax, az, 32, 34, { cls: (e) => e.cls <= 4, maxR: 280 }) || frontSite(ax, az, 32, 34, { cls: (e) => e.cls <= 5, maxR: 380 });
      if (!site) continue;
      def.sub = def.sub.replace(/·.*$/, '· ' + sp[2]);
      // the tower sits 2 m back so the canopy / entrance deck lands on the lot, facing the street
      const hq = new HQ(def, site.cx - site.ox * 1, site.cz - site.oz * 1, site.rot);
      W.hqs.push(hq); this.sites['hq_' + def.id] = site;
    }
  },
};

/* ---------------- 地铁: an entrance kiosk on the sidewalk at every subway station ----------------
   W.stations = [{ name, x, z, lines, door: { x, z, o: [ox, oz] }, kiosk: { cx, cz, rot } }]
   door = the open end of the kiosk (stand there to go down), o points out of it along the sidewalk. */
const METRO_LINE_COLS = { 1: '#c23a30', 2: '#006098', 4: '#008e9c', 5: '#a6217f', 6: '#d29700', 7: '#f6c582', 8: '#009b6b', 10: '#0092c7', 13: '#f9e700', 14: '#d4a7a2', 16: '#76a32e', 19: '#d6abc1' };
function metroAtlas(stations) {
  const c = mkCanvas(2048, 1024), g = c.getContext('2d');
  stations.forEach((st, i) => {
    const x = (i % 8) * 256, y = Math.floor(i / 8) * 64;
    g.fillStyle = '#0b2e6b'; g.fillRect(x, y, 256, 64); g.fillStyle = '#e8eef8'; g.fillRect(x, y + 58, 256, 6);
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitFont(g, st.name, 150, 34, 900); g.fillText(st.name, x + 12, y + 30);
    let lx = x + 244; for (const l of st.lines.slice(0, 3).reverse()) { g.fillStyle = METRO_LINE_COLS[l] || '#888'; rrect(g, lx - 28, y + 14, 28, 30, 5); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 20px sans-serif'; g.fillText(String(l), lx - 14, y + 30); lx -= 32; }
  });
  // the logo (a blue roundel with a white "G / D"), bottom-right 128 x 128
  const ox = 1984, oy = 960, r = 60;
  g.fillStyle = '#0a58ca'; g.beginPath(); g.arc(ox, oy, r, 0, TAU); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 13; g.beginPath(); g.arc(ox, oy, r * 0.62, -0.35 * Math.PI, 1.62 * Math.PI); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(ox - 4, oy - 7, r * 0.62 + 10, 14); g.fillRect(ox - 7, oy - r * 0.62 - 6, 14, r * 0.62 + 6);
  return tex(c);
}
const Metro = {
  build() {
    W.stations = [];
    const P = [0, 0, 0, 1], L = 4.6, D = 2.3, H = 2.7, list = [];
    const seen = new Set();
    for (const [raw, qx, qz, lines, sub] of MAPD.raw.stations) {
      const name = raw.replace(/[(（].*?[)）]/g, '').replace(/站$/, '');
      if (!sub || seen.has(name)) continue; seen.add(name);
      const x = qx * MAPD.k, z = qz * MAPD.k, site = this.site(x, z, L, D, P);
      if (site) list.push({ name, x, z, lines: lines.slice(), ...site });
    }
    const atlas = metroAtlas(list), quads = [];
    list.forEach((st, i) => {
      const { cx, cz, tx, tz, nx, nz, rot } = st, u0 = (i % 8) / 8, v1 = 1 - Math.floor(i / 8) / 16, pl = { u0, u1: u0 + 0.125, v0: v1 - 1 / 16, v1 };
      const lp = (a, b, y) => [cx + tx * a + nx * b, y, cz + tz * a + nz * b]; // a along the street, b away from it
      const parts = [box(cx, 0.13, cz, L + 0.4, 0.26, D + 0.4, 0xb9b6ae, rot)]; // curb
      for (const b of [-1, 1]) { // long sides: a solid dado + glass above
        const [px, , pz] = lp(0, b * (D / 2 - 0.06), 0);
        parts.push(box(px, 0.75, pz, L, 1.0, 0.12, 0xd4d8dc, rot), box(px, 1.9, pz, L, 1.3, 0.08, 0x86b4d4, rot));
      }
      { const [px, , pz] = lp(-L / 2 + 0.06, 0, 0); parts.push(box(px, H / 2 + 0.2, pz, 0.12, H, D, 0xd4d8dc, rot)); } // closed back end
      { const [px, , pz] = lp(0, 0, 0); parts.push(box(px, H + 0.86, pz, L + 0.7, 0.16, D + 0.7, 0x3a424c, rot), box(px, H + 0.36, pz, L + 0.3, 0.84, D + 0.3, 0x0b2e6b, rot), box(px, 0.27, pz, L - 0.3, 0.02, D - 0.3, 0x1b1e23, rot)); }
      for (let k = 0; k < 4; k++) { const [px, , pz] = lp(L / 2 - 0.6 - k * 0.55, 0, 0); parts.push(box(px, 0.2 - k * 0.12, pz, 0.5, 0.06, D - 0.4, 0x6b6f75, rot)); } // stairs going down
      // the pylon at the open end with the roundel on top
      const [yx, , yz] = lp(L / 2 + 0.5, D / 2 + 0.1, 0);
      parts.push(box(yx, 1.7, yz, 0.22, 3.4, 0.22, 0x8a9199, rot), box(yx, 3.55, yz, 0.16, 0.95, 0.95, 0x0a58ca, rot));
      Build.props.push(...parts);
      // name plates on both long fascias + the roundel both sides of the pylon
      for (const b of [-1, 1]) {
        const [px, , pz] = lp(0, b * (D / 2 + 0.17), 0), ry = Math.atan2(nx * b, nz * b);
        quads.push({ x: px, y: H + 0.36, z: pz, ry, w: 3.3, h: 0.78, ...pl });
        const [qx, , qz] = lp(L / 2 + 0.5, D / 2 + 0.1, 0), ry2 = Math.atan2(tx * b, tz * b);
        quads.push({ x: qx + tx * b * 0.09, y: 3.55, z: qz + tz * b * 0.09, ry: ry2, w: 0.82, h: 0.82, u0: 1920 / 2048, u1: 1, v0: 0, v1: 0.125 });
      }
      addSolid(null, { cx, cz, hx: L / 2, hz: D / 2, rot: -rot, h: H + 0.5, kind: 'bld' });
      const [dx, , dz] = lp(L / 2 + 1.1, 0, 0);
      W.stations.push({ name: st.name, x: st.x, z: st.z, lines: st.lines, door: { x: dx, z: dz, o: [tx, tz] }, kiosk: { cx, cz, rot } });
    });
    if (quads.length) {
      const mat = Render.cutout(new THREE.MeshBasicMaterial({ map: atlas })); W.neonMats.push(mat);
      quadsPerChunk(quads, mat, 400);
    }
  },
  // a free stretch of sidewalk near (x, z): kiosk centre, street tangent t, outward normal n, rot (object +x → t)
  site(x, z, L, D, P) {
    const edges = [], seen = new Set();
    for (let r = 12; r <= 96 && edges.length < 6; r += 12) {
      for (let k = 0; k < 12; k++) {
        const n = Roads.nearest(x + Math.cos(k / 12 * TAU) * r * 0.5, z + Math.sin(k / 12 * TAU) * r * 0.5, r, (e) => e.cls <= 4 && e.len > 14);
        if (n && !seen.has(n.e.id)) { seen.add(n.e.id); edges.push(n); }
      }
    }
    edges.sort((a, b) => a.e.cls - b.e.cls || a.d - b.d);
    const okK = (1 << GK.WALK) | (1 << GK.FREE) | (1 << GK.PLAZA) | (1 << GK.PARK);
    for (const n of edges) for (const ds of [0, 7, -7, 14, -14, 22, -22, 30, -30]) for (const side of [1, -1]) {
      const e = n.e, s = n.s + ds; if (s < 8 || s > e.len - 8) continue;
      Roads.at(e, s, P);
      const tx = P[2], tz = P[3], nx = -tz * side, nz = tx * side, off = e.hw + Math.max(e.C.walk * 0.55, D / 2 + 0.4);
      const cx = P[0] + nx * off, cz = P[1] + nz * off;
      if (!Grid.obbFree(cx, cz, L / 2 + 0.4, D / 2 + 0.2, tx, tz, okK)) continue;
      if ([[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([a, b]) => Ground.roadSdf(cx + tx * a * L / 2 + nx * b * D / 2, cz + tz * a * L / 2 + nz * b * D / 2) < 0.35)) continue;
      if (W.doors.some((d) => dist2(d.x, d.z, cx, cz) < 10 * 10) || W.stations.some((q) => dist2(q.kiosk.cx, q.kiosk.cz, cx, cz) < 12 * 12)) continue;
      Grid.setObb(cx, cz, L / 2 + 0.3, D / 2 + 0.2, tx, tz, GK.BLD);
      return { cx, cz, tx, tz, nx, nz, rot: Math.atan2(-tz, tx) };
    }
    return null;
  },
};
