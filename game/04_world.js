/* ============================================================
   world: 老北京 on a grid — 二环 ring road, 胡同 blocks inside,
   landmarks spanning merged blocks (their inner streets closed),
   海淀 / 朝阳 towers outside with the 百模帮 HQs, lakes, hills,
   knockable props, tokens, collisions
   ============================================================ */
const W = {
  blocks: [], solids: [], hqs: [], lampList: [], treeList: [], palmList: [], cypressList: [],
  lampMesh: null, lampHeadMesh: null, lampPoolMesh: null, treeMesh: null, palmMesh: null, cypressMesh: null,
  sun: null, hemi: null, sunDir: new V3(0.3, 0.8, 0.4), neonMats: [], extraFacades: [], extraGlow: [], doors: [], special: {}, redLights: null,
  spawn: new V3(), respawn: new V3(), garage: null, wheel: null,
  merged: [], platforms: [], hills: [], water: [], waterSolid: [], dry: [], landmarks: {}, plaza: null, gordonAt: null,
};

/* ---------------- the plan ---------------- */
// i = column (west → east), j = row (north → south). Old city = i,j in 1..8 inside the 二环 (roads 1 and 9)
const MERGES = [
  { i0: 4, j0: 3, i1: 5, j1: 4, type: 'palace' }, { i0: 4, j0: 2, i1: 5, j1: 2, type: 'jingshan' }, { i0: 4, j0: 1, i1: 5, j1: 1, type: 'gulou' },
  { i0: 4, j0: 5, i1: 5, j1: 5, type: 'qianmen' }, { i0: 6, j0: 7, i1: 7, j1: 8, type: 'tiantan' }, { i0: 2, j0: 1, i1: 3, j1: 1, type: 'houhai' },
  { i0: 3, j0: 2, i1: 3, j1: 3, type: 'beihai' }, { i0: 4, j0: 0, i1: 5, j1: 0, type: 'olympic' }, { i0: 4, j0: 9, i1: 5, j1: 9, type: 'yongdingmen' },
];
const SPECIAL = {
  '2,2': 'home', '6,2': 'snack', '1,0': 'electronics', '2,5': 'clothes', '6,4': 'dept', '3,6': 'antique', '4,6': 'dashilar', '5,6': 'duck',
  '3,7': 'teahouse', '2,6': 'hardware', '6,5': 'gym', '0,3': 'lab', '6,6': 'garage', '0,4': 'dojo', '6,0': 'arkham', '9,4': 'tower',
  '7,1': 'yonghegong', '8,2': 'guijie', '7,6': 'bjstation', '8,6': 'jiaolou', '1,1': 'deshengmen', '2,8': 'lakepark', '3,8': 'park', '8,7': 'lakepark',
  '0,5': 'forest', '9,0': '798', '9,2': 'wheelpark', '9,3': 'sanlitun',
  '8,1': 'modern', '8,3': 'modern', '8,4': 'modern', '8,5': 'modern', '1,5': 'tall', '2,4': 'modern', '7,4': 'modern', '0,6': 'xizhan',
};
const BJ_DIST = {
  '0,0': ['西二旗', 'XIERQI'], '1,0': ['中关村', 'ZHONGGUANCUN'], '2,0': ['五道口', 'WUDAOKOU'], '3,0': ['大钟寺', 'DAZHONGSI'], '4,0': ['奥林匹克公园', 'OLYMPIC PARK'], '5,0': ['奥林匹克公园', 'OLYMPIC PARK'],
  '6,0': ['北苑', 'BEIYUAN'], '7,0': ['望京', 'WANGJING'], '8,0': ['望京', 'WANGJING'], '9,0': ['798 艺术区', '798 ART ZONE'],
  '0,1': ['中关村', 'ZHONGGUANCUN'], '0,2': ['海淀黄庄', 'HAIDIAN'], '0,3': ['中关村南大街', 'ZGC SOUTH'], '0,4': ['西山', 'WESTERN HILLS'], '0,5': ['西山', 'WESTERN HILLS'],
  '0,6': ['北京西站', 'BEIJING WEST'], '0,7': ['丰台', 'FENGTAI'], '0,8': ['丰台', 'FENGTAI'], '0,9': ['丰台', 'FENGTAI'],
  '9,1': ['三元桥', 'SANYUANQIAO'], '9,2': ['朝阳公园', 'CHAOYANG PARK'], '9,3': ['三里屯', 'SANLITUN'], '9,4': ['国贸 CBD', 'GUOMAO CBD'], '9,5': ['国贸 CBD', 'GUOMAO CBD'],
  '9,6': ['建外大街', 'JIANWAI'], '9,7': ['潘家园', 'PANJIAYUAN'], '9,8': ['劲松', 'JINSONG'], '9,9': ['十里河', 'SHILIHE'],
  '1,9': ['右安门外', 'YOUANMENWAI'], '2,9': ['大观园', 'DAGUANYUAN'], '3,9': ['南苑', 'NANYUAN'], '4,9': ['永定门', 'YONGDINGMEN'], '5,9': ['永定门', 'YONGDINGMEN'],
  '6,9': ['木樨园', 'MUXIYUAN'], '7,9': ['大红门', 'DAHONGMEN'], '8,9': ['亦庄', 'YIZHUANG'],
  '1,1': ['德胜门', 'DESHENGMEN'], '2,1': ['什刹海', 'SHICHAHAI'], '3,1': ['什刹海', 'SHICHAHAI'], '4,1': ['钟鼓楼', 'DRUM & BELL TOWERS'], '5,1': ['钟鼓楼', 'DRUM & BELL TOWERS'],
  '6,1': ['北锣鼓巷', 'BEILUOGUXIANG'], '7,1': ['雍和宫', 'LAMA TEMPLE'], '8,1': ['东直门', 'DONGZHIMEN'],
  '1,2': ['新街口', 'XINJIEKOU'], '2,2': ['恭王府', 'PRINCE GONG MANSION'], '3,2': ['北海', 'BEIHAI'], '3,3': ['北海', 'BEIHAI'], '4,2': ['景山', 'JINGSHAN'], '5,2': ['景山', 'JINGSHAN'],
  '6,2': ['南锣鼓巷', 'NANLUOGUXIANG'], '7,2': ['东四', 'DONGSI'], '8,2': ['簋街', 'GUI STREET'],
  '1,3': ['西四', 'XISI'], '2,3': ['西四', 'XISI'], '4,3': ['故宫', 'FORBIDDEN CITY'], '5,3': ['故宫', 'FORBIDDEN CITY'], '4,4': ['故宫', 'FORBIDDEN CITY'], '5,4': ['故宫', 'FORBIDDEN CITY'],
  '6,3': ['隆福寺', 'LONGFUSI'], '7,3': ['东四', 'DONGSI'], '8,3': ['朝阳门', 'CHAOYANGMEN'],
  '1,4': ['金融街', 'FINANCIAL STREET'], '2,4': ['西单', 'XIDAN'], '3,4': ['南长街', 'NANCHANG ST'], '6,4': ['王府井', 'WANGFUJING'], '7,4': ['东单', 'DONGDAN'], '8,4': ['建国门', 'JIANGUOMEN'],
  '1,5': ['金融街', 'FINANCIAL STREET'], '2,5': ['西单', 'XIDAN'], '3,5': ['宣武门', 'XUANWUMEN'], '4,5': ['前门', 'QIANMEN'], '5,5': ['前门', 'QIANMEN'],
  '6,5': ['东单', 'DONGDAN'], '7,5': ['崇文门', 'CHONGWENMEN'], '8,5': ['建国门', 'JIANGUOMEN'],
  '1,6': ['广安门', 'GUANGANMEN'], '2,6': ['菜市口', 'CAISHIKOU'], '3,6': ['琉璃厂', 'LIULICHANG'], '4,6': ['大栅栏', 'DASHILAR'], '5,6': ['前门大街', 'QIANMEN STREET'],
  '6,6': ['崇文门', 'CHONGWENMEN'], '7,6': ['北京站', 'BEIJING STATION'], '8,6': ['东便门', 'DONGBIANMEN'],
  '1,7': ['牛街', 'NIUJIE'], '2,7': ['陶然亭', 'TAORANTING'], '3,7': ['天桥', 'TIANQIAO'], '4,7': ['珠市口', 'ZHUSHIKOU'], '5,7': ['珠市口', 'ZHUSHIKOU'],
  '6,7': ['天坛', 'TEMPLE OF HEAVEN'], '7,7': ['天坛', 'TEMPLE OF HEAVEN'], '6,8': ['天坛', 'TEMPLE OF HEAVEN'], '7,8': ['天坛', 'TEMPLE OF HEAVEN'], '8,7': ['龙潭湖', 'LONGTAN LAKE'],
  '1,8': ['右安门', 'YOUANMEN'], '2,8': ['陶然亭公园', 'TAORANTING PARK'], '3,8': ['先农坛', 'XIANNONGTAN'], '4,8': ['永定门内', 'YONGDINGMENNEI'], '5,8': ['永定门内', 'YONGDINGMENNEI'], '8,8': ['左安门', 'ZUOANMEN'],
};
const inOldCity = (i, j) => i >= RING_LO && i < RING_HI && j >= RING_LO && j < RING_HI;
function districtAt(x, z) {
  if (Math.abs(Math.abs(x) - Math.abs(roadC(RING_LO))) < RW / 2 + 1 && Math.abs(z) < -roadC(RING_LO) + RW) return ['二环路', '2ND RING ROAD'];
  if (Math.abs(Math.abs(z) - Math.abs(roadC(RING_LO))) < RW / 2 + 1 && Math.abs(x) < -roadC(RING_LO) + RW) return ['二环路', '2ND RING ROAD'];
  if (Math.abs(z) < RW / 2 + 1 && Math.abs(x) < -roadC(RING_LO)) return ['长安街', 'CHANG\'AN AVENUE'];
  const i = clamp(Math.floor((x + HALF) / PITCH), 0, NB - 1), j = clamp(Math.floor((z + HALF) / PITCH), 0, NB - 1);
  return BJ_DIST[i + ',' + j] || (inOldCity(i, j) ? ['胡同', 'HUTONG'] : ['城外', 'OUTSKIRTS']);
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

const blockRect = (i, j) => ({ x0: roadC(i) + RW / 2, x1: roadC(i + 1) - RW / 2, z0: roadC(j) + RW / 2, z1: roadC(j + 1) - RW / 2 });
function blockAt(i, j) { return i >= 0 && j >= 0 && i < NB && j < NB ? W.blocks[i * NB + j] : null; }
function groundH(x, z) {
  if (x <= -HALF || x >= HALF || z <= -HALF || z >= HALF) return 0;
  let h = -1;
  for (const m of W.merged) if (x > m.x0 && x < m.x1 && z > m.z0 && z < m.z1) { h = 0.3; break; }
  if (h < 0) {
    const lx = x + HALF - Math.floor((x + HALF) / PITCH) * PITCH, lz = z + HALF - Math.floor((z + HALF) / PITCH) * PITCH;
    h = lx > RW / 2 && lx < PITCH - RW / 2 && lz > RW / 2 && lz < PITCH - RW / 2 ? 0.3 : 0;
  }
  for (const p of W.platforms) if (p.circle ? (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r : x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = Math.max(h, p.h);
  for (const hl of W.hills) { const v = hillH(hl, x, z); if (v > 0) h = Math.max(h, 0.3 + v); }
  return h;
}

/* ---- road graph with closed segments (streets swallowed by landmarks) ---- */
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
const rightOf = (d) => [-DIRS[d][1], DIRS[d][0]];
const validNode = (i, j) => i >= 0 && j >= 0 && i <= NB && j <= NB;
const SEG_LEN = PITCH - RW;
const CLOSED = new Set();
const edgeKey = (i, j, d) => (d === 1 ? 'h' + i + ',' + j : d === 3 ? 'h' + (i - 1) + ',' + j : d === 2 ? 'v' + i + ',' + j : 'v' + i + ',' + (j - 1));
function edgeOpen(i, j, d) { const ni = i + DIRS[d][0], nj = j + DIRS[d][1]; return validNode(i, j) && validNode(ni, nj) && !CLOSED.has(edgeKey(i, j, d)); }
function nodeLive(i, j) { for (let d = 0; d < 4; d++) if (edgeOpen(i, j, d)) return true; return false; }
function closeInternal(i0, j0, i1, j1) {
  for (let i = i0 + 1; i <= i1; i++) for (let j = j0; j <= j1; j++) CLOSED.add('v' + i + ',' + j);
  for (let j = j0 + 1; j <= j1; j++) for (let i = i0; i <= i1; i++) CLOSED.add('h' + i + ',' + j);
}
function segStart(ni, nj, d) {
  const [dx, dz] = DIRS[d], [rx, rz] = rightOf(d);
  return [roadC(ni) + dx * RW / 2 + rx * LANE, roadC(nj) + dz * RW / 2 + rz * LANE];
}
function randomRoadSpot(fx, fz, minD, maxD, tries = 40) {
  for (let k = 0; k < tries; k++) {
    const ni = randi(0, NB), nj = randi(0, NB), d = randi(0, 3);
    if (!edgeOpen(ni, nj, d)) continue;
    const s = rand(4, SEG_LEN - 4);
    const [sx, sz] = segStart(ni, nj, d);
    const x = sx + DIRS[d][0] * s, z = sz + DIRS[d][1] * s;
    const dd = hyp(x - fx, z - fz);
    if (dd >= minD && dd <= maxD) return { ni, nj, d, s, x, z };
  }
  return null;
}

/* ---- collisions (XZ plane, AABB solids + lakes) ---- */
function collideCircle(pos, r) {
  let hit = null;
  const i0 = Math.max(0, Math.floor((pos.x - r + HALF) / PITCH)), i1 = Math.min(NB - 1, Math.floor((pos.x + r + HALF) / PITCH));
  const j0 = Math.max(0, Math.floor((pos.z - r + HALF) / PITCH)), j1 = Math.min(NB - 1, Math.floor((pos.z + r + HALF) / PITCH));
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const b = W.blocks[i * NB + j];
    for (const s of b.solids) {
      if (!s.solid) continue;
      const cx = clamp(pos.x, s.x0, s.x1), cz = clamp(pos.z, s.z0, s.z1);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d; dx /= d; dz /= d;
        pos.x += dx * push; pos.z += dz * push; hit = { b: s, nx: dx, nz: dz };
      } else {
        const pl = pos.x - s.x0, pr = s.x1 - pos.x, pt = pos.z - s.z0, pb = s.z1 - pos.z, m = Math.min(pl, pr, pt, pb);
        if (m === pl) { pos.x = s.x0 - r; hit = { b: s, nx: -1, nz: 0 }; }
        else if (m === pr) { pos.x = s.x1 + r; hit = { b: s, nx: 1, nz: 0 }; }
        else if (m === pt) { pos.z = s.z0 - r; hit = { b: s, nx: 0, nz: -1 }; }
        else { pos.z = s.z1 + r; hit = { b: s, nx: 0, nz: 1 }; }
      }
    }
  }
  const wh = pushOutOfWater(pos); if (wh) hit = hit || wh;
  if (pos.x < -BOUND + r) { pos.x = -BOUND + r; hit = hit || { b: null, nx: 1, nz: 0 }; }
  if (pos.x > BOUND - r) { pos.x = BOUND - r; hit = hit || { b: null, nx: -1, nz: 0 }; }
  if (pos.z < -BOUND + r) { pos.z = -BOUND + r; hit = hit || { b: null, nx: 0, nz: 1 }; }
  if (pos.z > BOUND - r) { pos.z = BOUND - r; hit = hit || { b: null, nx: 0, nz: -1 }; }
  return hit;
}
function collideWorld(pos, r) { return Interiors.cur ? Interiors.collide(pos, r) : collideCircle(pos, r); }
function solidsNear(x, z, r) {
  const out = [];
  if (Interiors.cur) return out;
  const seen = new Set();
  const i0 = Math.max(0, Math.floor((x - r + HALF) / PITCH)), i1 = Math.min(NB - 1, Math.floor((x + r + HALF) / PITCH));
  const j0 = Math.max(0, Math.floor((z - r + HALF) / PITCH)), j1 = Math.min(NB - 1, Math.floor((z + r + HALF) / PITCH));
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const s of W.blocks[i * NB + j].solids) if (s.solid && !seen.has(s)) { seen.add(s); out.push(s); }
  return out;
}
function rayAABB2(ox, oz, dx, dz, s, maxT) {
  let t0 = 0, t1 = maxT;
  if (Math.abs(dx) < 1e-9) { if (ox < s.x0 || ox > s.x1) return -1; }
  else { let a = (s.x0 - ox) / dx, b = (s.x1 - ox) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < s.z0 || oz > s.z1) return -1; }
  else { let a = (s.z0 - oz) / dz, b = (s.z1 - oz) / dz; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
  return t0;
}
function segAABB3(p, q, s) {
  let t0 = 0, t1 = 1;
  const lo = [s.x0, 0, s.z0], hi = [s.x1, s.h, s.z1], o = [p.x, p.y, p.z], d = [q.x - p.x, q.y - p.y, q.z - p.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
// a solid is filed under every block its footprint touches (landmarks span merged blocks)
function addSolid(blk, s) {
  s.solid = true; W.solids.push(s);
  const i0 = clamp(Math.floor((s.x0 + HALF) / PITCH), 0, NB - 1), i1 = clamp(Math.floor((s.x1 + HALF) / PITCH), 0, NB - 1);
  const j0 = clamp(Math.floor((s.z0 + HALF) / PITCH), 0, NB - 1), j1 = clamp(Math.floor((s.z1 + HALF) / PITCH), 0, NB - 1);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) W.blocks[i * NB + j].solids.push(s);
  return s;
}
function blockOf(x, z) { return blockAt(clamp(Math.floor((x + HALF) / PITCH), 0, NB - 1), clamp(Math.floor((z + HALF) / PITCH), 0, NB - 1)); }

/* ---- merged static geometry, bucketed per material and per 2x2-block chunk so the frustum can skip it ---- */
const Build = {
  buckets: new Map(), props: [], ads: [], reds: [],
  chunk(x, z) { return Math.floor((x + HALF) / (PITCH * 2)) + ':' + Math.floor((z + HALF) / (PITCH * 2)); },
  add(mat, geo) {
    const p = geo.attributes.position, key = this.chunk(p.getX(0), p.getZ(0));
    if (!this.buckets.has(mat)) this.buckets.set(mat, new Map());
    const m = this.buckets.get(mat); if (!m.has(key)) m.set(key, []); m.get(key).push(geo);
  },
  // storefront band: u follows the length (16u per repeat), v spans the band once
  band(w, h, d, x, y, z, mat) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) { const len = f < 2 ? d : w; for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * len / 16, uv.getY(i)); } }
    const ia = g.index.array, sides = [];
    for (const f of [0, 1, 4, 5]) for (let k = 0; k < 6; k++) sides.push(ia[f * 6 + k]);
    g.setIndex(sides); g.translate(x, y + h / 2, z);
    this.add(mat, g);
  },
  building(x0, z0, x1, z1, h, fac, opts = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const base = 0.3, bandH = opts.noShop ? 0 : 4.2;
    if (bandH) this.band(w + 0.3, bandH, d + 0.3, cx, base, cz, opts.shopMat || pick(MAT.shops));
    const tiers = h > 30 && Math.random() < 0.5 && w > 14 && d > 14 ? 2 : 1;
    const h1 = tiers === 2 ? Math.round(h * rand(0.55, 0.7) / 4) * 4 : h;
    let [s, t] = sideGeo(w, h1 - bandH, d, cx, base + bandH, cz, 16, 0.02);
    this.add(fac, s); this.add(MAT.roof, t);
    let top = base + h1, rw = w, rd = d;
    if (tiers === 2) {
      rw = w - 6; rd = d - 6;
      [s, t] = sideGeo(rw, h - h1, rd, cx, top, cz, 16);
      this.add(fac, s); this.add(MAT.roof, t);
      top = base + h;
    }
    if (!opts.bare) this.roofStuff(cx, cz, rw, rd, top, h);
    return top;
  },
  roofStuff(cx, cz, w, d, top, h) {
    const n = randi(0, 3);
    for (let k = 0; k < n; k++) {
      const bx = cx + rand(-w * 0.3, w * 0.3), bz = cz + rand(-d * 0.3, d * 0.3);
      if (Math.random() < 0.35) { this.props.push(gpart(ROOF_TANK, 0x8f969e, bx, top + 1.3, bz)); this.props.push(box(bx, top + 2.7, bz, 0.4, 0.4, 0.4, 0x6c737c)); }
      else this.props.push(box(bx, top + 0.6, bz, rand(1.6, 3.2), 1.2, rand(1.6, 3.2), pick([0xb4b8bd, 0x9aa1a8, 0xcfd3d6])));
    }
    if (h > 36 && Math.random() < 0.6) {
      const ax = cx + rand(-w * 0.2, w * 0.2), az = cz + rand(-d * 0.2, d * 0.2);
      this.props.push(box(ax, top + 4, az, 0.3, 8, 0.3, 0x6c737c));
      this.reds.push(box(ax, top + 8.2, az, 0.7, 0.7, 0.7, 0xffffff));
    }
    if (h > 18 && h < 40 && Math.random() < 0.22 && w > 12) {
      const ad = randi(0, ADS.length - 1), bw = Math.min(16, w - 2), bh = bw / 2;
      const g = new THREE.PlaneGeometry(bw, bh);
      const uv = g.attributes.uv, u0 = (ad % 2) * 0.5, v0 = 1 - (Math.floor(ad / 2) + 1) * 0.25;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.25);
      g.rotateX(-0.55); g.translate(cx, top + 2.2 + bh / 2, cz + d * 0.3);
      this.ads.push(g);
      this.props.push(box(cx - bw * 0.35, top + 1.6, cz + d * 0.3 - 0.8, 0.3, 3.2, 0.3, 0x3a3f47), box(cx + bw * 0.35, top + 1.6, cz + d * 0.3 - 0.8, 0.3, 3.2, 0.3, 0x3a3f47));
    }
  },
  finish() {
    for (const [mat, chunks] of this.buckets) for (const geos of chunks.values()) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    // vertex-coloured props, chunked too
    const pc = new Map();
    for (const p of this.props) { const e = p.m.elements, key = this.chunk(e[12], e[14]); if (!pc.has(key)) pc.set(key, []); pc.get(key).push(p); }
    for (const parts of pc.values()) { const m = new THREE.Mesh(mergeParts(parts), MAT.bldProps); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    if (this.ads.length) { const m = new THREE.Mesh(mergeGeos(this.ads), MAT.ads); scene.add(m); }
    if (this.reds.length) { W.redLights = new THREE.Mesh(mergeParts(this.reds), MAT.redBlink); scene.add(W.redLights); }
    this.buckets.clear(); this.props = []; this.ads = []; this.reds = [];
  },
};
const ROOF_TANK = new THREE.CylinderGeometry(1.2, 1.2, 2.6, 10);
// 国槐: round crowns in layered greens
const TREE_GEO_PARTS = () => [
  box(0, 1.2, 0, 0.34, 2.4, 0.34, 0x5a4030),
  gpart(new THREE.IcosahedronGeometry(1.7, 0), 0x3f7f3a, 0, 3.3, 0, 0.3, 0.2, 0, 1, 0.82, 1),
  gpart(new THREE.IcosahedronGeometry(1.25, 0), 0x4f9446, 0.8, 3.9, 0.3, 0.5, 0.6, 0.2, 1, 0.85, 1),
  gpart(new THREE.IcosahedronGeometry(1.15, 0), 0x356d33, -0.7, 3.8, -0.4, 0.1, 1.1, 0.3, 1, 0.85, 1),
];
// 柏树: tall dark cypress
function cypressGeo() { return mergeParts([box(0, 0.8, 0, 0.3, 1.6, 0.3, 0x4a3426), gpart(new THREE.ConeGeometry(1.15, 4.2, 7), 0x264d2c, 0, 3.4, 0), gpart(new THREE.ConeGeometry(0.85, 2.6, 7), 0x2e5a33, 0, 5.4, 0)]); }
// 柳树: willow — a trunk and a curtain of drooping strands (uses the old palm slot)
function palmGeo() { // 垂柳: a tall trunk, a loose crown and long hanging strands
  const parts = [box(0, 2.0, 0, 0.42, 4.0, 0.42, 0x5a4636), gpart(_BOX, 0x5a4636, 0.5, 3.9, 0.2, 0, 0, -0.5, 0.22, 1.6, 0.22), gpart(_BOX, 0x5a4636, -0.45, 3.8, -0.25, 0, 0, 0.55, 0.2, 1.4, 0.2)];
  for (const [x, y, z, r, c] of [[0, 4.9, 0, 1.5, 0x6b8f3a], [0.9, 4.5, 0.4, 1.1, 0x7da446], [-0.8, 4.6, -0.3, 1.15, 0x74983f]]) parts.push(gpart(new THREE.SphereGeometry(r, 7, 4), c, x, y, z, 0, 0, 0, 1, 0.62, 1));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU + rand(-0.12, 0.12), r = rand(1.5, 2.3), L = rand(2.6, 3.6);
    parts.push(gpart(_BOX, k % 2 ? 0x9cc65a : 0x84ad4c, Math.cos(a) * r, 4.6 - L / 2, Math.sin(a) * r, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12, 0.2, L, 0.2));
  }
  return mergeParts(parts);
}
function chunkInstances(list, layers, h) {
  const groups = new Map();
  for (const it of list) { const k = Build.chunk(it.x, it.z); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const items of groups.values()) {
    let cx = 0, cz = 0; for (const it of items) { cx += it.x; cz += it.z; } cx /= items.length; cz /= items.length;
    let r = 0; for (const it of items) r = Math.max(r, Math.hypot(it.x - cx, it.z - cz));
    for (const [geo, mat, key, shadow] of layers) {
      const g = geo.clone(); g.boundingSphere = new THREE.Sphere(new V3(cx, h / 2, cz), r + h + 3);
      const m = new THREE.InstancedMesh(g, mat, items.length); m.castShadow = shadow; scene.add(m);
      items.forEach((it, k) => { it[key] = m; it.ci = k; });
    }
  }
}
function newProp(x, z, sc, kind, blk) {
  const list = kind === 'palm' ? W.palmList : kind === 'cypress' ? W.cypressList : W.treeList;
  const it = { x, z, ry: rand(TAU), sc, state: 0, t: 0, ax: 0, az: 0, idx: list.length, kind };
  if (blk) (kind === 'palm' ? blk.palms : blk.trees).push(it);
  return it;
}

/* ---------------- block generators ---------------- */
function genModernBlock(b, style = 'mid') {
  const r = b.rect, inset = 3.2;
  const x0 = r.x0 + inset, x1 = r.x1 - inset, z0 = r.z0 + inset, z1 = r.z1 - inset;
  const w = x1 - x0, d = z1 - z0;
  const sx = x0 + w * rand(0.4, 0.6), sz = z0 + d * rand(0.4, 0.6);
  const pat = style === 'tall' ? pick(['one', 'two', 'two']) : pick(['one', 'two', 'two', 'three', 'four', 'four']);
  const lots = [];
  if (pat === 'one') lots.push([x0, z0, x1, z1]);
  else if (pat === 'two') { if (Math.random() < 0.5) lots.push([x0, z0, sx, z1], [sx, z0, x1, z1]); else lots.push([x0, z0, x1, sz], [x0, sz, x1, z1]); }
  else if (pat === 'three') lots.push([x0, z0, sx, z1], [sx, z0, x1, sz], [sx, sz, x1, z1]);
  else lots.push([x0, z0, sx, sz], [sx, z0, x1, sz], [x0, sz, sx, z1], [sx, sz, x1, z1]);
  for (const [a, c, e, f] of lots) {
    const m = rand(0.8, 2.0);
    const bx0 = a + m, bz0 = c + m, bx1 = e - m, bz1 = f - m;
    if (bx1 - bx0 < 6 || bz1 - bz0 < 6) continue;
    let h = style === 'tall' ? rand(34, 70) : style === 'res' ? rand(22, 40) : style === 'low' ? rand(8, 16) : rand(12, 32);
    if ((bx1 - bx0) * (bz1 - bz0) > 900 && style !== 'tall') h *= 0.75;
    h = Math.max(8, Math.round(h / 4) * 4);
    Build.building(bx0, bz0, bx1, bz1, h, pick(MAT.facades));
    addSolid(b, { x0: bx0, z0: bz0, x1: bx1, z1: bz1, h: h + 0.3, kind: 'bld' });
  }
}
function genPark(b, treeSpots, o = {}) {
  const r = o.rect || b.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (o.lake) {
    const rx = (r.x1 - r.x0) / 2 - 8, rz = (r.z1 - r.z0) / 2 - 9;
    addWater({ ellipse: true, x: cx + rand(-2, 2), z: cz + rand(-2, 2), rx, rz });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; W.palmList.push(newProp(cx + Math.cos(a) * (rx + 2.4), cz + Math.sin(a) * (rz + 2.4), rand(0.85, 1.1), 'palm', b)); }
  }
  const n = o.n || 26;
  for (let k = 0; k < n; k++) {
    const x = rand(r.x0 + 4, r.x1 - 4), z = rand(r.z0 + 4, r.z1 - 4);
    if (o.lake && (((x - cx) / ((r.x1 - r.x0) / 2 - 5)) ** 2 + ((z - cz) / ((r.z1 - r.z0) / 2 - 6)) ** 2) < 1) continue;
    if (o.clear && hyp(x - cx, z - cz) < o.clear) continue;
    if (o.cypress) BJB.cypress.push([b, x, z, rand(0.8, 1.2)]); else treeSpots.push([b, x, z, rand(0.8, 1.35)]);
  }
}
function genPlaza(b, at) {
  const cx = at ? at.x : (b.rect.x0 + b.rect.x1) / 2, cz = at ? at.z : (b.rect.z0 + b.rect.z1) / 2;
  const ped = new THREE.Mesh(mergeParts([
    gpart(new THREE.CylinderGeometry(4.2, 4.6, 1.0, 20), 0xa89a86, 0, 0.8, 0),
    gpart(new THREE.CylinderGeometry(1.4, 1.8, 3.2, 12), 0x8d8272, 0, 2.9, 0),
  ]), MAT.vc);
  ped.position.set(cx, 0, cz); ped.castShadow = true; ped.receiveShadow = true; scene.add(ped);
  const coin = new THREE.Mesh(coinGeometry(), MAT.coin);
  coin.scale.set(3.4, 3.4, 3.4); coin.position.set(cx, 8.2, cz); coin.castShadow = true; scene.add(coin);
  W.monument = coin; W.plaza = { x: cx - 8, z: cz + 6 };
  addSolid(b, { x0: cx - 4.4, x1: cx + 4.4, z0: cz - 4.4, z1: cz + 4.4, h: 11, kind: 'monument' });
}
// a special (non-merged) building so story beats can burn / relight it
function specialBuilding(b, x0, z0, x1, z1, h, fac, signText, c1, c2) {
  if (fac.emissiveMap && !W.extraFacades.includes(fac)) W.extraFacades.push(fac);
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const mesh = new THREE.Mesh(buildingGeo(w, h, d), [fac, MAT.roof]);
  mesh.position.set(cx, 0.3, cz); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  let sign = null;
  if (signText) {
    const mat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex(signText, '', c1, c2), transparent: true }));
    W.neonMats.push(mat);
    sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 2, 20), Math.min(w - 2, 20) / 4), mat);
    sign.position.set(cx, Math.min(h - 1.6, 9), z1 + 0.18); scene.add(sign);
  }
  return addSolid(b, { x0, z0, x1, z1, h: h + 0.3, kind: 'special', mesh, sign });
}
function addDoor(id, interior, name, x, z, heading = 0) { const d = { id, interior, name, x, z, heading }; W.doors.push(d); return d; }
// fill a rect with a row (or two) of courtyards
function fillCourts(b, rect) {
  const A = acc3(), props = [], d = rect.z1 - rect.z0;
  if (d > 24) {
    const mid = rect.z0 + (d - 3.2) / 2;
    const n = Math.max(1, Math.round((rect.x1 - rect.x0) / 13)), cw = (rect.x1 - rect.x0) / n;
    for (let k = 0; k < n; k++) { siheyuan(A, rect.x0 + k * cw + 0.1, rect.z0, rect.x0 + (k + 1) * cw - 0.1, mid, 's', b, props); siheyuan(A, rect.x0 + k * cw + 0.1, mid + 3.2, rect.x0 + (k + 1) * cw - 0.1, rect.z1, 'n', b, props); }
  } else if (d > 7) {
    const n = Math.max(1, Math.round((rect.x1 - rect.x0) / 13)), cw = (rect.x1 - rect.x0) / n;
    for (let k = 0; k < n; k++) siheyuan(A, rect.x0 + k * cw + 0.1, rect.z0, rect.x0 + (k + 1) * cw - 0.1, rect.z1, 's', b, props);
  }
  flushAcc(A); Build.props.push(...props);
}
// modern shop / mall with a canopy, door on the south side, offices behind
function genShop(b, kind) {
  const r = b.rect, [label, c1, c2] = SHOP_SIGNS[kind];
  const fac = Render.cutout(makeFacade(pick(FACADES)));
  W.extraFacades.push(fac);
  const x0 = r.x0 + 6, x1 = r.x1 - 6, z0 = r.z1 - 20, z1 = r.z1 - 3.4;
  const s = specialBuilding(b, x0, z0, x1, z1, kind === 'lab' ? 16 : 12, fac, label, c1, c2);
  W.special[kind] = s;
  Build.props.push(box((x0 + x1) / 2, 4.2, z1 + 1.2, 8, 0.35, 2.6, parseInt(c1.slice(1), 16)));
  addDoor(kind, kind, label, (x0 + x1) / 2, z1 + 2.2, 0);
  Build.building(r.x0 + 4, r.z0 + 4, r.x1 - 4, z0 - 3, randi(4, 7) * 4, pick(MAT.facades));
  addSolid(b, { x0: r.x0 + 4, z0: r.z0 + 4, x1: r.x1 - 4, z1: z0 - 3, h: 24, kind: 'bld' });
}
// 老字号 shop: a two-storey traditional front with a big plaque and lanterns, door facing south
function oldShop(A, props, b, kind, x0, x1, z0, z1, doorId) {
  const cx = (x0 + x1) / 2, h = 6.2;
  boxW(A.brick, x0, 0.3, z0, x1, 0.3 + h, z1, 2, 'new');
  latticeFace(A.lattice, 's', x0 + 0.2, 3.6, z0, x1 - 0.2, 0.3 + h - 0.1, z1 + 0.02);
  props.push(box(cx, 1.8, z1 + 0.05, x1 - x0 - 0.4, 3.0, 0.1, 0x5a3420)); // shop front boarding
  props.push(box(cx, 1.5, z1 + 0.08, 2.4, 2.6, 0.06, 0x17120e)); // doorway
  hipRoof(A.roof, cx, (z0 + z1) / 2, x1 - x0, z1 - z0, 0.3 + h, 2.4, 0, 0.9);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(8, x1 - x0 - 2), 1.6), new THREE.MeshBasicMaterial({ map: plaqueTex(OLD_SIGNS[doorId || kind]), transparent: true }));
  plate.position.set(cx, 3.45, z1 + 0.14); scene.add(plate); W.neonMats.push(plate.material);
  for (const s of [-1, 1]) BJB.lanterns.push([cx + s * (x1 - x0) * 0.36, 0.3 + h - 0.8, z1 + 0.6]);
  addSolid(b, { x0, z0, x1, z1, h: h + 3, kind: 'bld' });
  addDoor(doorId || kind, doorId || kind, OLD_SIGNS[doorId || kind], cx, z1 + 2.2, 0);
}
function plaqueTex(t) {
  const c = mkCanvas(512, 112), g = c.getContext('2d');
  rrect(g, 4, 4, 504, 104, 10); g.fillStyle = '#16120e'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#c9a23e'; g.stroke();
  g.fillStyle = '#f0c75a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 460, 70, 900); g.fillText(t, 256, 60);
  return tex(c);
}
function genOldShopBlock(b, kinds) {
  const r = b.rect, A = acc3(), props = [];
  const z0 = r.z1 - 16, z1 = r.z1 - 3.2;
  if (kinds.length === 1) oldShop(A, props, b, kinds[0], r.x0 + 6, r.x1 - 6, z0, z1);
  else { const mx = (r.x0 + r.x1) / 2; oldShop(A, props, b, kinds[0], r.x0 + 2.6, mx - 1, z0, z1, kinds[0]); oldShop(A, props, b, kinds[1], mx + 1, r.x1 - 2.6, z0, z1, kinds[1]); }
  flushAcc(A); Build.props.push(...props);
  fillCourts(b, { x0: r.x0 + 2.2, x1: r.x1 - 2.2, z0: r.z0 + 2.2, z1: z0 - 3.2 });
}
// Token 王府: the hero's mansion — its own meshes so the betrayal can burn it
function genHome(b) {
  const r = b.rect, A = acc3(), props = [], cx = (r.x0 + r.x1) / 2;
  const x0 = r.x0 + 4, x1 = r.x1 - 4, z0 = r.z0 + 4, z1 = r.z1 - 5;
  const q = [...palaceWall(A, x0, z0, x1, z0, 3.4, 0.8), ...palaceWall(A, x0, z0, x0, z1, 3.4, 0.8), ...palaceWall(A, x1, z0, x1, z1, 3.4, 0.8), ...palaceWall(A, x0, z1, x1, z1, 3.4, 0.8, [[cx - 3.5, cx + 3.5]])];
  for (const s of q) addSolid(b, Object.assign(s, { h: 4, kind: 'bld' }));
  hall(A, props, cx, z0 + 7, 26, 7, 0.3 + 0.8, 4.2, { roof: 'green', double: true, rh: 2.4 }); boxW(A.marble, cx - 14, 0.3, z0 + 2.6, cx + 14, 1.1, z0 + 11.4, 2);
  hall(A, props, cx, (z0 + z1) / 2 + 3, 20, 6, 0.3, 3.8, { roof: 'roof' });
  hall(A, props, x0 + 5, (z0 + z1) / 2 + 3, 4.5, 12, 0.3, 3.2, { roof: 'roof', gable: true }); hall(A, props, x1 - 5, (z0 + z1) / 2 + 3, 4.5, 12, 0.3, 3.2, { roof: 'roof', gable: true });
  // grand gate
  boxW(A.red, cx - 3.5, 0.3, z1 - 2.8, cx + 3.5, 4.8, z1 + 0.4, 2, 'nsew'); hipRoof(A.green, cx, z1 - 1.2, 8, 4, 4.8, 1.8, 0, 0.7);
  props.push(box(cx, 2.1, z1 + 0.45, 3.2, 3.6, 0.1, 0x9b1c14), box(cx - 1.9, 0.55, z1 + 1.1, 0.8, 1.1, 0.8, 0xb8b4aa), box(cx + 1.9, 0.55, z1 + 1.1, 0.8, 1.1, 0.8, 0xb8b4aa));
  for (const s of [-1, 1]) props.push(gpart(new THREE.SphereGeometry(0.45, 8, 6), 0x9a968e, cx + s * 1.9, 1.5, z1 + 1.1));
  for (let k = 0; k < 6; k++) BJB.trees.push([b, rand(x0 + 3, x1 - 3), rand(z0 + 13, z1 - 10), rand(0.8, 1.1)]);
  addSolid(b, { x0: cx - 13, x1: cx + 13, z0: z0 + 3, z1: z0 + 11, h: 10, kind: 'bld' }); addSolid(b, { x0: cx - 10, x1: cx + 10, z0: (z0 + z1) / 2, z1: (z0 + z1) / 2 + 6, h: 8, kind: 'bld' });
  // build these as a separate group (burnable) instead of the shared buckets
  const grp = new THREE.Group(); scene.add(grp);
  const M = BJ.mats, pairs = [['brick', M.brick], ['roof', M.roofGrey], ['lattice', M.lattice], ['red', M.redWall], ['green', M.roofGreen], ['marble', M.marble]];
  const mats = [];
  for (const [k, m] of pairs) if (!A[k].empty) { const mm = m.clone(); if (m.onBeforeCompile) { mm.onBeforeCompile = m.onBeforeCompile; mm.customProgramCacheKey = m.customProgramCacheKey; } mats.push(mm); const mesh = new THREE.Mesh(A[k].geo(), mm); mesh.castShadow = true; mesh.receiveShadow = true; grp.add(mesh); }
  const pm = new THREE.Mesh(mergeParts(props), MAT.vc); pm.castShadow = true; grp.add(pm);
  const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('Token 王府', 'HOME · 存档点', '#8a1c14', '#d4a017'), transparent: true }));
  W.neonMats.push(signMat);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), signMat); sign.position.set(cx, 6.2, z1 + 0.3); scene.add(sign);
  W.special.home = { x0, x1, z0, z1, mesh: grp, mats, sign, h: 10 };
  addDoor('home', 'home', 'Token 王府', cx, z1 + 2.4, 0);
  W.respawn.set(cx, 0, z1 + 5.2); W.spawn.set(cx + 2, 0, z1 + 6);
}
function genDojo(b, treeSpots) { // 西山 temple of the 影之 Agent 联盟
  genPark(b, treeSpots, { clear: 16, cypress: true, n: 30 });
  const r = b.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const wood = 0x6b3a22, roofC = 0x2a2f38, gold = 0xe0a040, orange = 0xe8845a;
  const parts = [box(0, 0.6, 0, 16, 1.2, 16, 0x8a8278)];
  for (let t = 0; t < 3; t++) {
    const s = 12 - t * 3.2, y = 1.2 + t * 5.2;
    parts.push(box(0, y + 2, 0, s, 4, s, wood));
    parts.push(gpart(new THREE.ConeGeometry(s * 0.95, 2.2, 4), roofC, 0, y + 5, 0, 0, Math.PI / 4, 0));
    for (const [lx, lz] of [[-1, 1], [1, 1]]) parts.push(box(lx * (s / 2 - 0.6), y + 3.2, lz * (s / 2 + 0.3), 0.7, 0.9, 0.7, orange));
  }
  parts.push(box(0, 18.4, 0, 0.4, 3, 0.4, gold), box(0, 3, 6.2, 3.2, 3.6, 0.3, 0x1b1410));
  const mesh = new THREE.Mesh(mergeParts(parts), MAT.vc); mesh.position.set(cx, 0.3, cz); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  W.special.dojo = addSolid(b, { x0: cx - 8, x1: cx + 8, z0: cz - 8, z1: cz + 8, h: 19, kind: 'special', mesh });
  addDoor('dojo', 'dojo', '影之 Agent 联盟道场', cx, cz + 9.4, 0);
  W.dojoPos = new V3(cx, 0, cz);
}
function genArkham(b) {
  const r = b.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const stone = 0x4a4f58, dark = 0x2b2e35, green = 0x9fe870;
  const parts = [box(0, 5, 0, 30, 10, 18, stone)];
  for (const sx of [-1, 1]) { parts.push(box(sx * 13, 9, 0, 6, 18, 8, dark)); parts.push(gpart(new THREE.ConeGeometry(4.6, 7, 4), 0x1c1e24, sx * 13, 21.5, 0, 0, Math.PI / 4, 0)); }
  parts.push(gpart(new THREE.ConeGeometry(9, 6, 4), 0x1c1e24, 0, 13, 0, 0, Math.PI / 4, 0));
  for (let k = -3; k <= 3; k++) parts.push(box(k * 3.6, 6.5, 9.05, 1.4, 2.6, 0.1, green));
  parts.push(box(0, 2.4, 9.1, 4, 4.4, 0.2, 0x111111));
  for (let k = -9; k <= 9; k++) parts.push(box(k * 2.2, 1.2, 20, 0.2, 2.4, 0.2, 0x222222));
  parts.push(box(0, 2.3, 20, 40, 0.15, 0.15, 0x222222));
  const mesh = new THREE.Mesh(mergeParts(parts), MAT.vc); mesh.position.set(cx, 0.3, cz - 4); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  W.special.arkham = addSolid(b, { x0: cx - 16, x1: cx + 16, z0: cz - 13, z1: cz + 5, h: 22, kind: 'special', mesh });
  const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('阿卡姆标注中心', 'ARKHAM LABELING · 北苑', '#1f2a12', '#4d7c0f'), transparent: true }));
  W.neonMats.push(signMat);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), signMat); sign.position.set(cx, 12, cz + 5.3); sign.rotation.x = -0.3; scene.add(sign);
  addDoor('arkham', 'arkham', '阿卡姆标注中心', cx, cz + 6.6, 0);
}
function genGarage(b) {
  const r = b.rect, x0 = r.x0 + 8, x1 = r.x1 - 8, z0 = r.z1 - 18, z1 = r.z1 - 3.4, cx = (x0 + x1) / 2;
  const s = specialBuilding(b, x0, z0, x1, z1, 9, Render.cutout(makeFacade(FACADES[6])), '舆情公关中心', '#0f766e', '#5eead4');
  Build.props.push(box(cx, 3.2, z1 + 0.12, 10, 6, 0.3, 0x2b2f36));
  for (let k = 0; k < 6; k++) Build.props.push(box(cx, 0.8 + k, z1 + 0.3, 9.6, 0.12, 0.1, 0x9aa3ad));
  W.garage = { x: cx, z: r.z1 + 4.5, solid: s };
  fillCourts(b, { x0: r.x0 + 2.2, x1: r.x1 - 2.2, z0: r.z0 + 2.2, z1: z0 - 3 });
}
function genLamps(rect, blk) {
  const r = rect, ins = 0.9;
  const edges = [
    [r.x0, r.z0 + ins, r.x1, r.z0 + ins, Math.PI],
    [r.x1 - ins, r.z0, r.x1 - ins, r.z1, Math.PI / 2],
    [r.x0, r.z1 - ins, r.x1, r.z1 - ins, 0],
    [r.x0 + ins, r.z0, r.x0 + ins, r.z1, -Math.PI / 2],
  ];
  for (const [ax, az, bx, bz, ry] of edges) {
    const len = hyp(bx - ax, bz - az);
    for (let s = 7; s <= len - 7; s += 15) {
      const t = s / len, x = lerp(ax, bx, t), z = lerp(az, bz, t);
      // keep doorways and the gates on the central axis (神武门, 午门, 前门…) clear
      if (W.doors.some((d) => dist2(x, z, d.x, d.z) < 6.5 * 6.5) || (blk.m && Math.abs(x) < 9)) continue;
      // every other slot on the sidewalk gets a 国槐 instead of a lamp
      if (Math.floor(s / 15) % 2 === 1) { const it = newProp(x + (ry === Math.PI / 2 ? -0.6 : ry === -Math.PI / 2 ? 0.6 : 0), z + (ry === 0 ? -0.6 : ry === Math.PI ? 0.6 : 0), rand(0.75, 0.95), 'tree', blk); W.treeList.push(it); continue; }
      const it = { x, z, ry, sc: 1, state: 0, t: 0, ax: 0, az: 0, idx: W.lampList.length, kind: 'lamp' };
      W.lampList.push(it); blk.lamps.push(it);
    }
  }
}

// ---- AI product HQ (destructible) ----
class HQ {
  constructor(def, blk) {
    Object.assign(this, def);
    this.blk = blk;
    const r = blk.rect;
    this.cx = (r.x0 + r.x1) / 2; this.cz = (r.z0 + r.z1) / 2;
    this.maxHp = def.hp || 1200; this.hp = this.maxHp;
    this.alerted = false; this.dead = false; this.gone = false; this.collapseT = -1;
    this.spawnT = 1.5; this.shake = 0; this.flash = 0; this.smokeT = 0; this.beaconT = 0;
    this.H = def.h || 42;
    const g = new THREE.Group(); g.position.set(this.cx, 0.3, this.cz); scene.add(g); this.group = g;
    this.baseColor = new THREE.Color(def.glass);
    this.towerMat = Render.cutout(new THREE.MeshPhongMaterial({ color: this.baseColor.clone(), map: TEX.curtain, emissive: new THREE.Color(def.c1), emissiveMap: TEX.curtainE, emissiveIntensity: 0.4, shininess: 60, specular: 0x8fa8ff }));
    const podMat = Render.cutout(new THREE.MeshLambertMaterial({ color: 0xf1ede6, map: MAT.facades[1].map }));
    const crownMat = Render.cutout(new THREE.MeshLambertMaterial({ color: new THREE.Color(def.c1), emissive: new THREE.Color(def.c1), emissiveIntensity: 0.5 }));
    const pod = new THREE.Mesh(buildingGeo(36, 7, 36), [podMat, MAT.roof]);
    const tower = new THREE.Mesh(buildingGeo(24, this.H, 22), [this.towerMat, MAT.roof]); tower.position.y = 7;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(25, 2.6, 23), crownMat); crown.position.y = 7 + this.H - 1.2;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 3), crownMat); canopy.position.set(0, 4.2, 19.2);
    for (const m of [pod, tower, crown, canopy]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const signT = signTex(def.name, def.sub, def.c1, def.c2);
    this.signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signT, transparent: true, side: THREE.DoubleSide }));
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), this.signMat);
    this.sign.position.set(0, 7 + this.H + 4.6, 4); this.sign.rotation.x = -0.62; g.add(this.sign);
    const posts = new THREE.Mesh(mergeParts([box(-9, 0, 0, 0.6, 5, 0.6, 0x2b2f36), box(9, 0, 0, 0.6, 5, 0.6, 0x2b2f36)]), MAT.vc);
    posts.position.set(0, 7 + this.H + 2.3, 5); g.add(posts);
    this.deckMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signT, transparent: true }));
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), this.deckMat);
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, 7.06, 14.6); g.add(deck);
    this.beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), Render.cutout(new THREE.MeshBasicMaterial({ color: 0xff3344 })));
    this.beacon.position.set(-9, 7 + this.H + 1.2, -8); g.add(this.beacon);
    this.solid = addSolid(blk, { x0: this.cx - 18, x1: this.cx + 18, z0: this.cz - 18, z1: this.cz + 18, h: this.H + 7.3, kind: 'hq', hq: this });
    this.minions = 0;
  }
  get ratio() { return this.hp / this.maxHp; }
  damage(amount, px, pz, kind, bonus) {
    if (this.dead) return 0;
    if (!this.alerted) {
      this.alerted = true; this.spawnT = 0.8;
      Bubble.at(this.cx, this.H + 14, this.cz, this.alert, 3.4, 'hq');
      Sfx.alert();
    }
    this.hp -= amount; this.flash = 0.12; this.shake = Math.min(1.4, this.shake + amount / 70);
    G.addMoney(amount * 180 * RPG.m.valuation); G.crime(0.016); RPG.charge(amount);
    const y = rand(2, 8);
    FX.chunks(px, y, pz, Math.min(14, 3 + (amount / 12) | 0), [0xdfe6ee, this.glass, 0x9aa3ad]);
    FX.glassBits(px, y + 2, pz, 6, this.glass);
    if (Math.random() < 0.3) Tokens.burst(px, pz, 1, 50000, 3);
    const txt = '-' + Math.round(amount) + (bonus ? ' ' + bonus : '');
    Floaters.add(px, y + 4, pz, txt, bonus ? 'fl-bonus' : 'fl-dmg');
    if (this.hp <= 0) this.destroy();
    return amount;
  }
  destroy() {
    this.dead = true; this.hp = 0; this.solid.solid = false; this.collapseT = 0;
    FX.boom(this.cx, 10, this.cz + 10, 3.2, false);
    FX.boom(this.cx + rand(-8, 8), this.H * 0.7, this.cz + rand(-6, 6), 2.4, false);
    Sfx.boom(true); Sfx.crumble(); Sfx.glass();
    G.slow(0.32, 1.5); Cam.shake(2.4);
    Enemies.killOwnedBy(this);
    if (Tokens.enabled) { Tokens.burst(this.cx, this.cz + 22, 14, 50000, 10); Tokens.burst(this.cx, this.cz + 22, 3, 250000, 12); }
    const wp = new V3(); this.sign.getWorldPosition(wp);
    this.group.remove(this.sign); scene.add(this.sign); this.sign.position.copy(wp);
    this.fallSign = { t: 0, from: wp.clone(), to: new V3(this.cx + rand(-6, 6), 0.45, this.cz + 25), r0: this.sign.rotation.x, spin: rand(-0.4, 0.4) };
    G.onHQDestroyed(this);
  }
  // instantly show as rubble (loading a save)
  wreck() {
    this.dead = true; this.hp = 0; this.solid.solid = false; this.collapseT = 99;
    this.group.remove(this.sign); scene.add(this.sign); this.sign.position.set(this.cx + 3, 0.45, this.cz + 25); this.sign.rotation.set(-Math.PI / 2, 0.2, 0);
    this.updateCollapse(0);
  }
  update(dt, pd) {
    if (this.fallSign) {
      const f = this.fallSign; f.t += dt; const u = Math.min(1, f.t / 1.8), e = easeIn(u);
      this.sign.position.set(lerp(f.from.x, f.to.x, u), lerp(f.from.y, f.to.y, e) + Math.sin(u * Math.PI) * 6, lerp(f.from.z, f.to.z, u));
      this.sign.rotation.set(lerp(f.r0, -Math.PI / 2, e), f.spin * u, 0);
      if (u >= 1) { this.fallSign = null; FX.dust(f.to.x, f.to.z, 10, 5); Sfx.thud(); }
    }
    if (this.gone) return;
    if (this.collapseT >= 0) { this.updateCollapse(dt); return; }
    this.shake = Math.max(0, this.shake - dt * 3); this.flash = Math.max(0, this.flash - dt);
    const s = this.shake * 0.45;
    this.group.position.set(this.cx + rand(-s, s), 0.3, this.cz + rand(-s, s));
    const ratio = this.ratio;
    this.towerMat.color.copy(this.baseColor).multiplyScalar(0.4 + 0.6 * ratio);
    this.towerMat.emissiveIntensity = 0.35 + DayNight.night * 0.9 + this.flash * 7;
    this.beaconT += dt; this.beacon.visible = (this.beaconT % 1.2) < 0.6;
    if (ratio < 0.3) this.signMat.opacity = Math.random() < 0.08 ? 0.3 : 1;
    if (ratio < 0.7 && pd < 150) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = ratio < 0.35 ? 0.06 : 0.16;
        FX.smoke(this.cx + rand(-11, 11), 7 + this.H * rand(0.6, 1), this.cz + rand(-10, 10), 1);
        if (ratio < 0.35) FX.fire(this.cx + rand(-12, 12), 7 + this.H * rand(0.2, 0.95), this.cz + 11.2, 1);
      }
    }
    if (this.alerted && pd < 120) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 3.0; if (this.minions < 5 && Enemies.list.length < 26) Enemies.spawn(this.enemy, this); }
    }
  }
  updateCollapse(dt) {
    this.collapseT += dt;
    const T = 3.0, u = Math.min(1, this.collapseT / T);
    this.group.position.set(this.cx + Math.sin(this.collapseT * 31) * 0.4 * (1 - u), 0.3 - easeIn(u) * (this.H + 10), this.cz);
    this.group.rotation.z = Math.sin(this.collapseT * 6) * 0.03 * (1 - u);
    this.group.rotation.x = u * 0.07;
    if (u < 0.9) {
      for (let k = 0, n = perSec(120, dt); k < n; k++) { const a = rand(TAU), rr = rand(18, 24); FX.dust(this.cx + Math.cos(a) * rr, this.cz + Math.sin(a) * rr, 1, rand(5, 9)); }
      if (Math.random() < dt * 30) FX.chunks(this.cx + rand(-12, 12), Math.max(3, 7 + this.H + this.group.position.y), this.cz + rand(-11, 11), 2, [0xcfd6de, this.glass, 0x8a8f96]);
    }
    if (u >= 1) {
      this.gone = true; this.group.visible = false;
      const parts = [];
      for (let k = 0; k < 26; k++) {
        const w = rand(3, 8), h = rand(1, 4), d = rand(3, 8);
        parts.push({ geo: _BOX, c: pick([0x8d9196, 0x70757b, 0xa7abb0, this.glass]), m: MX(rand(-14, 14), h / 2, rand(-14, 14), rand(-0.3, 0.3), rand(TAU), rand(-0.3, 0.3), w, h, d) });
      }
      const rub = new THREE.Mesh(mergeParts(parts), MAT.vc); rub.position.set(this.cx, 0.3, this.cz); rub.castShadow = true; rub.receiveShadow = true; scene.add(rub);
      const nf = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), new THREE.MeshBasicMaterial({ map: TEX.notFound, transparent: true }));
      nf.position.set(this.cx + 6, 6.2, this.cz + 12); nf.rotation.x = -0.5; scene.add(nf);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), MAT.vc); post.position.set(this.cx + 6, 2.8, this.cz + 11.6); scene.add(post);
    }
  }
}

/* ---- the 上下文轻轨: an elevated loop over the 二环 ---- */
const Monorail = {
  pts: [], cum: [], L: 0, train: [], s: 0, speed: 15, y: 10.2, hijacked: false, cars: 4,
  build() {
    const A = roadC(RING_LO), B = roadC(RING_HI), R = 24;
    const path = [];
    const arc = (cx, cz, a0, a1) => { for (let k = 0; k <= 10; k++) { const a = lerp(a0, a1, k / 10); path.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); } };
    path.push([A + R, A]); path.push([B - R, A]); arc(B - R, A + R, -Math.PI / 2, 0);
    path.push([B, B - R]); arc(B - R, B - R, 0, Math.PI / 2);
    path.push([A + R, B]); arc(A + R, B - R, Math.PI / 2, Math.PI);
    path.push([A, A + R]); arc(A + R, A + R, Math.PI, Math.PI * 1.5);
    const raw = path; let L = 0; const cum = [0];
    for (let k = 1; k < raw.length; k++) { L += hyp(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]); cum.push(L); }
    L += hyp(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]);
    this.pts = raw; this.cum = cum; this.L = L;
    const parts = [], beam = [];
    for (let s = 0; s < L; s += 26) {
      const [x, z] = this.at(s);
      let nearNode = false;
      for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB; j++) if (Math.abs(x - roadC(i)) < 9 && Math.abs(z - roadC(j)) < 9) nearNode = true;
      if (nearNode) continue;
      parts.push(box(x, this.y / 2 - 0.4, z, 1.5, this.y - 0.8, 1.5, 0x9aa1aa));
      parts.push(box(x, this.y - 1.2, z, 3.2, 0.8, 3.2, 0x7d848d));
      const b = blockOf(x, z); if (b) addSolid(b, { x0: x - 0.9, x1: x + 0.9, z0: z - 0.9, z1: z + 0.9, h: this.y, kind: 'pillar' });
    }
    for (let s = 0; s < L; s += 4) {
      const [x, z] = this.at(s), [x2, z2] = this.at(s + 4);
      const len = hyp(x2 - x, z2 - z) + 0.1, a = Math.atan2(x2 - x, z2 - z);
      beam.push(box((x + x2) / 2, this.y - 0.2, (z + z2) / 2, 2.6, 1.0, len, (Math.floor(s / 4) % 2) ? 0xc9ced6 : 0xbfc5ce, a));
      beam.push(box((x + x2) / 2, this.y + 0.35, (z + z2) / 2, 0.5, 0.15, len, 0xffc940, a));
    }
    const m1 = new THREE.Mesh(mergeParts(parts), MAT.vc); m1.castShadow = true; m1.receiveShadow = true; scene.add(m1);
    const m2 = new THREE.Mesh(mergeParts(beam), MAT.vc); m2.castShadow = true; scene.add(m2);
    // 国贸 station next to the compute tower (east side of the ring)
    const tz = W.towerPos ? W.towerPos.z : -29;
    const st = new THREE.Mesh(mergeParts([box(0, 0, 0, 6, 0.6, 30, 0xd9d4c8), box(2.8, 3, 0, 0.3, 0.3, 30, 0xffc940), box(2.8, 1.6, -14, 0.3, 3, 0.3, 0x8a929c), box(2.8, 1.6, 14, 0.3, 3, 0.3, 0x8a929c)]), MAT.vc);
    st.position.set(B + 3.6, this.y - 0.5, tz); scene.add(st);
    this.stationS = this.nearestS(B, tz);
    this.carMat = MAT.vc;
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xffc940 });
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x223044 }); this._winDay = new THREE.Color(0x223044); this._winNight = new THREE.Color(0xd9b98a);
    for (let k = 0; k < this.cars; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(mergeParts([
        box(0, 1.7, 0, 3.2, 3.2, 10, 0xeef1f5), box(0, 3.4, 0, 2.6, 0.3, 9.4, 0xd5dbe3),
        ...(k === 0 ? [box(0, 1.6, 5.4, 3.0, 2.6, 1.2, 0xeef1f5)] : []),
      ]), this.carMat);
      const wins = new THREE.Mesh(mergeParts([
        box(1.62, 2.2, 0, 0.05, 1.1, 8.4, 0xffffff), box(-1.62, 2.2, 0, 0.05, 1.1, 8.4, 0xffffff),
        ...(k === 0 ? [box(0, 2.3, 5.97, 2.4, 1.0, 0.1, 0xffffff)] : []),
      ]), this.winMat);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.35, 9.6), this.stripeMat); stripe.position.y = 1.2;
      body.castShadow = true; g.add(body, wins, stripe); scene.add(g);
      this.train.push({ g, body, stripe });
    }
    this.s = rand(this.L);
  },
  at(s) {
    const L = this.L, pts = this.pts, cum = this.cum;
    s = ((s % L) + L) % L;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = pts[lo], b = pts[(lo + 1) % pts.length], segL = (lo + 1 < cum.length ? cum[lo + 1] : L) - cum[lo];
    const t = segL > 0 ? (s - cum[lo]) / segL : 0;
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  },
  nearestS(x, z) { let best = 0, bd = Infinity; for (let s = 0; s < this.L; s += 2) { const [px, pz] = this.at(s); const d = dist2(px, pz, x, z); if (d < bd) { bd = d; best = s; } } return best; },
  carPos(k) { return this.at(this.s - k * 11); },
  update(dt) {
    if (!this.frozen) this.s = (this.s + this.speed * dt) % this.L;
    for (let k = 0; k < this.train.length; k++) {
      const c = this.train[k], s = this.s - k * 11;
      const [x, z] = this.at(s), [x2, z2] = this.at(s + 1);
      c.g.position.set(x, this.y + 0.4, z); c.g.rotation.set(0, Math.atan2(x2 - x, z2 - z), 0);
    }
    this.winMat.color.copy(this._winDay).lerp(this._winNight, DayNight.night);
    if (!Interiors.cur) { const [tx, tz] = this.carPos(1); Sfx.hum(clamp(1 - hyp(tx - Player.pos.x, tz - Player.pos.z) / 60, 0, 1)); }
  },
  hijack(on) { this.hijacked = on; this.stripeMat.color.set(on ? 0xff5a2a : 0xffc940); },
};

function buildWorld() {
  scene.background = new THREE.Color(0x161c30);
  scene.fog = new THREE.Fog(0xd9b59d, 130, 340);
  W.hemi = new THREE.HemisphereLight(0xc4dbff, 0x7a6450, 0.62); scene.add(W.hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 0.8);
  sun.castShadow = true;
  const sm = LOWQ ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0007; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  bjMaterials();

  // ground: fields beyond the city, asphalt under the grid
  const grass = new THREE.Mesh(flatPlane(1800, 1800, 0, -0.06, 0, 225, 225), new THREE.MeshLambertMaterial({ map: TEX.grass, color: 0xc9d6a8 }));
  grass.receiveShadow = true; scene.add(grass);
  const asph = new THREE.Mesh(flatPlane(2 * CITY + 16, 2 * CITY + 16, 0, 0, 0, (2 * CITY) / 12, (2 * CITY) / 12), new THREE.MeshLambertMaterial({ map: TEX.asphalt }));
  asph.receiveShadow = true; scene.add(asph);

  // blocks + merged landmark areas
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const def = HQ_DEFS.find((d) => d.i === i && d.j === j);
    const type = def ? 'hq' : SPECIAL[i + ',' + j] || (inOldCity(i, j) ? 'hutong' : 'outer');
    W.blocks[i * NB + j] = { i, j, rect: blockRect(i, j), solids: [], lamps: [], trees: [], palms: [], type, def };
  }
  for (const m of MERGES) {
    closeInternal(m.i0, m.j0, m.i1, m.j1);
    const a = blockRect(m.i0, m.j0), b = blockRect(m.i1, m.j1);
    const rec = Object.assign({}, m, { x0: a.x0, z0: a.z0, x1: b.x1, z1: b.z1, blk: blockAt(m.i0, m.j0) });
    W.merged.push(rec);
    for (let i = m.i0; i <= m.i1; i++) for (let j = m.j0; j <= m.j1; j++) { const bk = blockAt(i, j); bk.type = 'merged'; bk.m = rec; }
    rec.blk.type = m.type;
  }
  // roads: one strip per open segment, an intersection square per live node
  const roads = [], inters = [];
  for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB; j++) {
    if (edgeOpen(i, j, 1)) roads.push(flatPlane(SEG_LEN, RW, roadC(i) + PITCH / 2, 0.02, roadC(j), SEG_LEN / 16, 1, 0));
    if (edgeOpen(i, j, 2)) roads.push(flatPlane(RW, SEG_LEN, roadC(i), 0.02, roadC(j) + PITCH / 2, 1, SEG_LEN / 16));
    if (nodeLive(i, j)) inters.push(flatPlane(RW, RW, roadC(i), 0.035, roadC(j), 1, 1));
  }
  // E-W strips need the texture turned: rotate their uv
  for (const g of roads) { const bb = new THREE.Box3().setFromBufferAttribute(g.attributes.position); if (bb.max.x - bb.min.x > bb.max.z - bb.min.z) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, v, u); } } }
  const roadMesh = new THREE.Mesh(mergeGeos(roads), new THREE.MeshLambertMaterial({ map: TEX.road })); roadMesh.receiveShadow = true; scene.add(roadMesh);
  const interMesh = new THREE.Mesh(mergeGeos(inters), new THREE.MeshLambertMaterial({ map: TEX.inter })); interMesh.receiveShadow = true; scene.add(interMesh);

  const walkGeos = [], pavingGeos = [], stoneGeos = [], grassGeos = [], plazaGeos = [], treeSpots = [];
  const base = (r, list, rep = 4) => { const w = r.x1 - r.x0, d = r.z1 - r.z0; const bg = new THREE.BoxGeometry(w, 0.3, d); scaleBoxUV(bg, () => [w / rep, d / rep]); bg.translate((r.x0 + r.x1) / 2, 0.15, (r.z0 + r.z1) / 2); list.push(bg); };
  // tower first: the ring's 国贸 station wants its position
  const towerB = W.blocks.find((b) => b.type === 'tower'); if (towerB) genCBDTower(towerB);
  for (const b of W.blocks) {
    const r = b.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, t = b.type;
    if (t === 'merged') continue;
    const m = b.m;
    if (m) {
      // landmark areas
      const gen = { palace: genPalace, jingshan: genJingshan, gulou: genGulou, qianmen: genQianmen, tiantan: genTiantan, houhai: genHouhai, beihai: genBeihai, olympic: genOlympic, yongdingmen: genYongdingmen }[m.type];
      gen(m);
      const rr = { x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1 };
      if (m.ground === 'grass') { base(rr, walkGeos); grassGeos.push(flatPlane(rr.x1 - rr.x0 - 3, rr.z1 - rr.z0 - 3, (rr.x0 + rr.x1) / 2, 0.31, (rr.z0 + rr.z1) / 2, (rr.x1 - rr.x0) / 8, (rr.z1 - rr.z0) / 8)); }
      else if (m.type === 'palace' || m.type === 'qianmen' || m.type === 'olympic') base(rr, stoneGeos, 5);
      else if (m.type === 'gulou' || m.type === 'houhai') base(rr, pavingGeos, 3);
      else { base(rr, walkGeos); if (m.type === 'jingshan' || m.type === 'beihai') grassGeos.push(flatPlane(rr.x1 - rr.x0 - 4, rr.z1 - rr.z0 - 4, (rr.x0 + rr.x1) / 2, 0.305, (rr.z0 + rr.z1) / 2, (rr.x1 - rr.x0) / 8, (rr.z1 - rr.z0) / 8)); }
      genLamps(rr, b);
      continue;
    }
    const old = inOldCity(b.i, b.j);
    base(r, old && t !== 'modern' && t !== 'tall' && t !== 'hq' ? pavingGeos : walkGeos, old ? 3 : 4);
    const park = t === 'park' || t === 'lakepark' || t === 'forest' || t === 'dojo' || t === 'wheelpark';
    if (park || t === 'arkham') grassGeos.push(flatPlane(BLK - 5, BLK - 5, cx, 0.31, cz, (BLK - 5) / 8, (BLK - 5) / 8));
    if (t === 'park') genPark(b, treeSpots, { cypress: b.i === 3 && b.j === 8 });
    else if (t === 'lakepark') genPark(b, treeSpots, { lake: true, n: 18 });
    else if (t === 'forest') genPark(b, treeSpots, { cypress: true, n: 40 });
    else if (t === 'wheelpark') { genPark(b, treeSpots, { n: 14, clear: 16 }); buildWheel(cx, cz); }
    else if (t === 'dojo') genDojo(b, treeSpots);
    else if (t === 'arkham') genArkham(b);
    else if (t === 'home') genHome(b);
    else if (t === 'hq') W.hqs.push(new HQ(b.def, b));
    else if (SHOP_SIGNS[t]) genShop(b, t);
    else if (t === 'snack' || t === 'antique' || t === 'duck' || t === 'teahouse' || t === 'hardware') genOldShopBlock(b, [t]);
    else if (t === 'dashilar') genOldShopBlock(b, ['shoes', 'pharmacy']);
    else if (t === 'garage') genGarage(b);
    else if (t === 'tower') { /* built above */ }
    else if (t === 'yonghegong') genYonghegong(b);
    else if (t === 'bjstation') genBJStation(b);
    else if (t === 'jiaolou') { genCornerTower(b, { x: r.x1 - 13, z: r.z0 + 9, w: 20, d: 12, wall: [r.x0 + 2, r.z0 + 4, r.x1 - 24, r.z0 + 10] }); genPark(b, treeSpots, { rect: { x0: r.x0, x1: r.x1, z0: r.z0 + 16, z1: r.z1 }, n: 10 }); }
    else if (t === 'deshengmen') { genCornerTower(b, { x: cx, z: r.z0 + 9, w: 20, d: 11 }); fillCourts(b, { x0: r.x0 + 2.2, x1: r.x1 - 2.2, z0: r.z0 + 17, z1: r.z1 - 2.2 }); }
    else if (t === 'guijie') { genHutong(b, { shops: true }); for (let k = 0; k < 16; k++) BJB.lanterns.push([r.x0 + 3 + k * 2.6, 3.4, r.z1 - 0.6]); }
    else if (t === '798') gen798(b);
    else if (t === 'sanlitun') { genModernBlock(b, 'low'); for (let k = 0; k < 4; k++) BJB.neonBoxes.push({ x: rand(r.x0 + 6, r.x1 - 6), y: rand(5, 9), z: r.z1 - 3.1, w: 6, mat: barNeonMat() }); }
    else if (t === 'xizhan') genXizhan(b);
    else if (t === 'hutong') genHutong(b);
    else if (t === 'tall') genModernBlock(b, 'tall');
    else if (t === 'modern') genModernBlock(b, 'mid');
    else genModernBlock(b, b.i === 9 && (b.j === 4 || b.j === 5 || b.j === 6) ? 'tall' : b.j === 9 || b.i === 0 && b.j >= 7 ? 'res' : 'mid');
    genLamps(r, b);
  }
  const addBase = (geos, mat) => { if (geos.length) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.receiveShadow = true; scene.add(m); } };
  addBase(walkGeos, new THREE.MeshLambertMaterial({ map: TEX.walk })); addBase(pavingGeos, MAT.paving); addBase(stoneGeos, MAT.stonePave);
  addBase(grassGeos, new THREE.MeshLambertMaterial({ map: TEX.grass }));
  Monorail.build();
  finishBeijing();
  Build.finish();
  Water.build();

  // lamps (pole + glowing head + pool of light) and trees, instanced per 2x2-block chunk so the camera and the
  // shadow pass only draw what's around you
  const poolG = new THREE.PlaneGeometry(1, 1); poolG.rotateX(-Math.PI / 2);
  chunkInstances(W.lampList, [
    [mergeParts([box(0, 0.2, 0, 0.45, 0.4, 0.45, 0x2b2f36), box(0, 2.7, 0, 0.18, 5.2, 0.18, 0x3a3f47), box(0, 5.2, 0.6, 0.14, 0.14, 1.3, 0x3a3f47)]), MAT.vc, 'cm', true],
    [new THREE.BoxGeometry(0.55, 0.18, 0.6).translate(0, 5.08, 1.2), MAT.lampHead, 'hm', false], [poolG, MAT.lampPool, 'pm', false]], 7);
  for (const [b, x, z, s] of [...treeSpots, ...BJB.trees]) { const it = newProp(x, z, s, 'tree', b); W.treeList.push(it); }
  for (const [b, x, z, s] of BJB.cypress) { const it = newProp(x, z, s, 'cypress', b); W.cypressList.push(it); }
  chunkInstances(W.treeList, [[mergeParts(TREE_GEO_PARTS()), MAT.vc, 'cm', true]], 6);
  chunkInstances(W.palmList, [[palmGeo(), MAT.vc, 'cm', true]], 7);
  chunkInstances(W.cypressList, [[cypressGeo(), MAT.vc, 'cm', true]], 8);
  for (const list of [W.lampList, W.treeList, W.palmList, W.cypressList]) for (const it of list) Props.writeMatrix(it);
  // city edge: low wall + tree ring + far-off 西山
  const wall = [], L = 2 * BOUND + 2;
  wall.push(box(0, 0.7, -BOUND - 0.6, L, 1.4, 1.2, 0x9c968c), box(0, 0.7, BOUND + 0.6, L, 1.4, 1.2, 0x9c968c));
  wall.push(box(-BOUND - 0.6, 0.7, 0, 1.2, 1.4, L, 0x9c968c), box(BOUND + 0.6, 0.7, 0, 1.2, 1.4, L, 0x9c968c));
  const wm = new THREE.Mesh(mergeParts(wall), MAT.vc); wm.castShadow = true; wm.receiveShadow = true; scene.add(wm);
  const ring = [];
  for (let k = 0; k < 200; k++) {
    const side = k % 4, t = rand(-BOUND - 30, BOUND + 30), o = BOUND + rand(6, 34);
    ring.push(side === 0 ? [t, -o] : side === 1 ? [o, t] : side === 2 ? [t, o] : [-o, t]);
  }
  const ringMesh = new THREE.InstancedMesh(mergeParts(TREE_GEO_PARTS()), MAT.vc, ring.length);
  const m4 = new THREE.Matrix4();
  ring.forEach(([x, z], k) => { const s = rand(1, 1.8); m4.compose(new V3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, rand(TAU)), new V3(s, s, s)); ringMesh.setMatrixAt(k, m4); });
  ringMesh.frustumCulled = false; scene.add(ringMesh);
  const hills = [];
  for (let k = 0; k < 9; k++) hills.push(gpart(new THREE.ConeGeometry(rand(60, 110), rand(40, 80), 7), pick([0x55705a, 0x4d6a54, 0x5f7a60]), -BOUND - 150 - rand(0, 120), 0, -260 + k * 70 + rand(-20, 20), 0, rand(TAU), 0));
  const hm = new THREE.Mesh(mergeParts(hills), MAT.vc); hm.position.y = 20; scene.add(hm);
}
function genXizhan(b) { // 北京西站: a giant gate building with a pavilion on the top
  const A = acc3(), props = [], r = b.rect, cx = (r.x0 + r.x1) / 2, z0 = r.z0 + 8, z1 = r.z1 - 10;
  boxW(A.white, r.x0 + 3, 0.3, z0, cx - 7, 16.3, z1, 3); boxW(A.white, cx + 7, 0.3, z0, r.x1 - 3, 16.3, z1, 3);
  boxW(A.white, cx - 7, 12.3, z0, cx + 7, 20.3, z1, 3);
  latticeFace(A.lattice, 's', r.x0 + 4, 2, z0, cx - 8, 14, z1 + 0.02); latticeFace(A.lattice, 's', cx + 8, 2, z0, r.x1 - 4, 14, z1 + 0.02);
  hall(A, props, cx, (z0 + z1) / 2, 14, 10, 20.3, 4.4, { roof: 'green', double: true });
  addSolid(b, { x0: r.x0 + 3, x1: r.x1 - 3, z0: z0, z1: z1, h: 30, kind: 'bld' });
  flushAcc(A); Build.props.push(...props);
}
function buildWheel(x, z) { // 朝阳公园摩天轮
  const wg = new THREE.Group(); wg.position.set(x, 21, z); scene.add(wg);
  const rot = new THREE.Group(); wg.add(rot);
  const R = 17, wparts = [];
  for (const dz of [-1.1, 1.1]) wparts.push(gpart(new THREE.TorusGeometry(R, 0.28, 6, 48), 0xe5e7eb, 0, 0, dz));
  for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; wparts.push({ geo: _BOX, c: 0xd1d5db, m: MX(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a + Math.PI / 2, 0.22, R, 0.22) }); }
  wparts.push(gpart(new THREE.CylinderGeometry(1.2, 1.2, 3, 12), 0x9ca3af, 0, 0, 0, Math.PI / 2, 0, 0));
  rot.add(new THREE.Mesh(mergeParts(wparts), MAT.vc));
  const lights = [];
  for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; lights.push(box(Math.cos(a) * R, Math.sin(a) * R, 1.3, 0.5, 0.5, 0.3, 0xffffff)); }
  const lm = new THREE.MeshBasicMaterial({ vertexColors: true }); W.neonMats.push(lm);
  rot.add(new THREE.Mesh(mergeParts(lights), lm));
  const cabins = [];
  for (let k = 0; k < 12; k++) {
    const c = new THREE.Mesh(mergeParts([box(0, -1.6, 0, 2.2, 2.0, 2.0, pick([0xef4444, 0xf59e0b, 0x3b82f6, 0x10b981, 0xa855f7])), box(0, -0.3, 0, 0.15, 1.2, 0.15, 0x6b7280)]), MAT.vc);
    rot.add(c); cabins.push({ c, a: (k / 12) * TAU });
  }
  const legs = new THREE.Mesh(mergeParts([
    gpart(_BOX, 0x9ca3af, -5.5, -10.5, 0, 0, 0, -0.28, 0.6, 23, 0.6), gpart(_BOX, 0x9ca3af, 5.5, -10.5, 0, 0, 0, 0.28, 0.6, 23, 0.6),
    gpart(_BOX, 0x9ca3af, -5.5, -10.5, -2.2, 0, 0, -0.28, 0.6, 23, 0.6), gpart(_BOX, 0x9ca3af, 5.5, -10.5, -2.2, 0, 0, 0.28, 0.6, 23, 0.6),
  ]), MAT.vc);
  legs.castShadow = true; wg.add(legs);
  W.wheel = { g: wg, rot, cabins, R };
  const b = blockOf(x, z); addSolid(b, { x0: x - 7, x1: x + 7, z0: z - 3.5, z1: z + 1.5, h: 40, kind: 'bld' });
}

/* ---- knockable street props (lamps / 国槐 / 柳树 / 柏树) ---- */
const Props = {
  falling: [],
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _q2: new THREE.Quaternion(), _v: new V3(), _s: new V3(), _ax: new V3(),
  meshOf(it) { return it.cm; },
  writeMatrix(it) {
    const ang = it.state === 0 ? 0 : Math.min(1, it.t) * 1.45;
    this._q.setFromAxisAngle(UP, it.ry);
    if (ang > 0) { this._ax.set(it.az, 0, -it.ax); this._q2.setFromAxisAngle(this._ax, ang); this._q.premultiply(this._q2); }
    this._m.compose(this._v.set(it.x, groundH(it.x, it.z), it.z), this._q, this._s.set(it.sc, it.sc, it.sc));
    if (!it.cm) return;
    it.cm.setMatrixAt(it.ci, this._m);
    if (it.kind === 'lamp') {
      it.hm.setMatrixAt(it.ci, this._m);
      const s = it.state === 0 ? 11 : 0, fx = Math.sin(it.ry) * 2.2, fz = Math.cos(it.ry) * 2.2;
      this._q.identity();
      this._m.compose(this._v.set(it.x + fx, 0.06, it.z + fz), this._q, this._s.set(s, 1, s));
      it.pm.setMatrixAt(it.ci, this._m);
    }
  },
  knock(it, fx, fz) {
    if (it.state !== 0) return false;
    const l = hyp(fx, fz) || 1;
    it.ax = fx / l; it.az = fz / l; it.state = 1; it.t = 0;
    this.falling.push(it);
    if (it.kind === 'lamp') { FX.sparks(it.x, 4, it.z, 8); if (Math.random() < 0.5) Sfx.clang(); }
    else FX.leaves(it.x, 3.5, it.z, 10);
    return true;
  },
  knockAround(x, z, r, fx, fz, dirX, dirZ) {
    if (Interiors.cur) return 0;
    const i0 = Math.max(0, Math.floor((x - r - 2 + HALF) / PITCH)), i1 = Math.min(NB - 1, Math.floor((x + r + 2 + HALF) / PITCH));
    const j0 = Math.max(0, Math.floor((z - r - 2 + HALF) / PITCH)), j1 = Math.min(NB - 1, Math.floor((z + r + 12 + HALF) / PITCH));
    let n = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const b = W.blocks[i * NB + j];
      for (const list of [b.lamps, b.trees, b.palms]) for (const it of list) {
        if (it.state !== 0) continue;
        if (dist2(x, z, it.x, it.z) < r * r) {
          const dx = dirX !== undefined ? dirX : it.x - fx, dz = dirZ !== undefined ? dirZ : it.z - fz;
          if (this.knock(it, dx, dz)) n++;
        }
      }
    }
    return n;
  },
  update(dt) {
    const dirty = new Set();
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const it = this.falling[k];
      it.t += dt * (it.kind === 'lamp' ? 3 : 2.2);
      if (it.t >= 1) { it.t = 1; it.state = 2; this.falling.splice(k, 1); }
      this.writeMatrix(it); dirty.add(it.cm); if (it.hm) { dirty.add(it.hm); dirty.add(it.pm); }
    }
    for (const m of dirty) if (m) m.instanceMatrix.needsUpdate = true;
    if (W.redLights) W.redLights.visible = (G.time % 1.6) < 0.8;
    if (W.wheel) {
      const w = W.wheel; w.rot.rotation.z += dt * 0.12;
      for (const c of w.cabins) { const a = c.a; c.c.position.set(Math.cos(a) * w.R, Math.sin(a) * w.R, 0); c.c.rotation.z = -w.rot.rotation.z; }
    }
    if (W.boats) W.boats.position.y = Math.sin(G.time * 1.3) * 0.06;
  },
};

/* ---- Tokens: the gold coins everybody fights over ---- */
const Tokens = {
  MAX: 560, items: [], free: [], mesh: null, alive: 0, combo: 0, comboT: 0, refillT: 0, dirtyAny: false, enabled: true,
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _p: new V3(), _s: new V3(), ZERO: new THREE.Matrix4().makeScale(0, 0, 0),
  init() {
    this.mesh = new THREE.InstancedMesh(coinGeometry(), MAT.coin, this.MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.MAX; i++) { this.mesh.setMatrixAt(i, this.ZERO); this.items.push({ i, alive: false }); this.free.push(this.MAX - 1 - i); }
    scene.add(this.mesh);
  },
  add(x, z, val = 50000, o = {}) {
    if (!this.free.length) return null;
    const t = this.items[this.free.pop()];
    Object.assign(t, { alive: true, x, z, y: o.y ?? 1.5, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, air: !!o.air, val, big: val >= 200000, ph: rand(TAU), age: 0, dirty: true, tag: o.tag || null });
    this.alive++;
    return t;
  },
  remove(t) { t.alive = false; this.mesh.setMatrixAt(t.i, this.ZERO); this.free.push(t.i); this.alive--; this.dirtyAny = true; },
  clearAll(tag) { for (const t of this.items) if (t.alive && (!tag || t.tag === tag)) this.remove(t); },
  burst(x, z, n, val = 50000, y = 4) {
    for (let k = 0; k < n; k++) { const a = rand(TAU), s = rand(3, 11); this.add(x, z, val, { y, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(8, 15), air: true }); }
  },
  line(ax, az, bx, bz, n, val = 50000) { for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); this.add(lerp(ax, bx, t), lerp(az, bz, t), val); } },
  roadLine(spot, n) {
    const [dx, dz] = DIRS[spot.d], [rx, rz] = rightOf(spot.d);
    const s = Math.min(spot.s, SEG_LEN - n * 3.2);
    const [sx, sz] = segStart(spot.ni, spot.nj, spot.d);
    const bx = sx - rx * LANE + dx * s, bz = sz - rz * LANE + dz * s, off = pick([-LANE, 0, LANE]);
    for (let k = 0; k < n; k++) this.add(bx + dx * k * 3.2 + rx * off, bz + dz * k * 3.2 + rz * off);
  },
  seed() {
    const pc = W.plaza ? { x: W.plaza.x + 8, z: W.plaza.z - 6 } : { x: 0, z: 20 };
    for (let a = 0; a < 12; a++) { const ang = (a / 12) * TAU; this.add(pc.x + Math.cos(ang) * 10.5, pc.z + Math.sin(ang) * 10.5); }
    // a line of tokens down 长安街 and along the axis south of 前门
    this.line(-120, 0, -12, 0, 12); this.line(12, 0, 120, 0, 12);
    for (let k = 0; k < 40; k++) { const s = randomRoadSpot(0, 0, 60, 420); if (s) this.roadLine(s, randi(3, 6)); }
  },
  collect(t) {
    const val = Math.round(t.val * RPG.m.tokenValue);
    this.remove(t);
    this.combo++; this.comboT = 0.9;
    if (t.big) Sfx.bigCoin(); else Sfx.coin(this.combo);
    Player.addTokens(val);
    Floaters.add(t.x, 3.2, t.z, '+' + fmtTok(val), t.big ? 'fl-tok big' : 'fl-tok');
    FX.sparkle(t.x, t.y + 0.4, t.z, t.big ? 14 : 6);
    G.stats.tokens += val; RPG.gainXP(Math.max(1, Math.round(val / 50000)));
  },
  update(dt) {
    const p = Player.pos, pr = Player.pickupR(), mr = Player.magnetR(), can = Player.canPickup() && !Interiors.cur;
    const cx = Cam.target.x, cz = Cam.target.z;
    for (const t of this.items) {
      if (!t.alive) continue;
      t.age += dt; t.ph += dt * 3.2;
      if (t.air) {
        t.vy -= 30 * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
        if (t.y <= 1.5 && t.vy < 0) { t.y = 1.5; t.air = false; }
        t.x = clamp(t.x, -BOUND + 2, BOUND - 2); t.z = clamp(t.z, -BOUND + 2, BOUND - 2);
      }
      if (can && !t.air && t.age > 0.4) {
        const dx = p.x - t.x, dz = p.z - t.z, d2 = dx * dx + dz * dz;
        if (d2 < mr * mr) { const d = Math.sqrt(d2) || 1, s = Math.min(d, (16 + (mr - d) * 4) * dt); t.x += (dx / d) * s; t.z += (dz / d) * s; }
        if (d2 < pr * pr) { this.collect(t); continue; }
      }
      if ((Math.abs(t.x - cx) > 120 || Math.abs(t.z - cz) > 120) && !t.dirty) continue;
      const s = t.big ? 1.8 : 1;
      this._q.setFromAxisAngle(UP, t.ph);
      this._p.set(t.x, t.y + Math.sin(t.ph * 0.7) * 0.25 + groundH(t.x, t.z), t.z);
      this._m.compose(this._p, this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(t.i, this._m); t.dirty = false; this.dirtyAny = true;
    }
    if (this.dirtyAny) { this.mesh.instanceMatrix.needsUpdate = true; this.dirtyAny = false; }
    let top = 0; for (let k = this.MAX - 1; k >= 0; k--) if (this.items[k].alive) { top = k + 1; break; }
    this.mesh.count = top;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.refillT -= dt;
    if (this.refillT <= 0 && this.enabled && !Interiors.cur) {
      this.refillT = 1.2;
      if (this.alive < 190) { const s = randomRoadSpot(p.x, p.z, 45, 150); if (s) this.roadLine(s, randi(3, 6)); }
    }
  },
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.items) { if (!t.alive || t.air) continue; const d = dist2(x, z, t.x, t.z); if (d < bd) { bd = d; best = t; } }
    return best;
  },
};
