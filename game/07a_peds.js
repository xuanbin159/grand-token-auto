/* ============================================================
   peds v3 · 四九城的路人
   Walkers on the real street graph: both sidewalks of every street
   (hutongs / 步行街: anywhere across), round the corners, wait at the
   zebra for the green man — or don't (中国式过马路). 外卖小哥 on
   e-bikes in the bike lane, and street life near you: 广场舞 / 晨练
   太极, 煎饼果子 & 糖葫芦, 胡同象棋, 遛鸟大爷, 城管 on patrol.
   Rendering: one InstancedMesh per look; legs and arms swing in the
   vertex shader (aLimb per vertex, aPose / aSpread per instance).
   ============================================================ */
const SKINS = [0xf1c9a5, 0xe0ac86, 0xc98e6b, 0xf5d5b8];
const SHIRTS = [0xe63946, 0x457b9d, 0x2a9d8f, 0xf4a261, 0xffffff, 0x222222, 0x8e44ad, 0xf1c40f, 0x16a085, 0xd35400, 0x5c7cfa, 0x9ca3af, 0x7f1d1d];
const PANTS = [0x1d3557, 0x333333, 0x5c4033, 0x6c757d, 0x264653, 0x1f2937, 0x3b4f6b];
const HAIRS = [0x1b1b1b, 0x3b2a20, 0x6b4a2f, 0x111111, 0xb08a58];
const PANIC_LINES = ['变形金刚来了！快跑啊！', '我的妈呀！', '嘛呢这是？！', '快报警！', '拍下来发朋友圈……', '这是 AGI 吗？！', '得，今儿不遛弯儿了！', '撒丫子跑吧！', '哎哟喂！', '我的 KPI 诶！'];
const IDLE_LINES = ['吃了吗您呐？', '今儿个天儿不错', '这 Token 又涨价了', '遛弯儿去喽', '胡同口新开了家咖啡', '卷不动了……', '周报写完了吗？', '这需求很简单，今儿晚上线', '显卡嘛时候到货啊', '嘿，您瞧那楼！', '豆汁儿喝了没？', '这天儿，得来碗炸酱面'];
const HIT_LINES = ['哎哟喂！', '打人啦！', '你丫有病吧！', '我的钱！', '报警！报警！', '嘛呢这是！', '我这老腰诶！', '打人不打脸！', '钱都给你，别打了！', '讹上你了啊！', '光天化日的！'];
const CROSS_LINES = ['凑够一拨儿就走！', '车少，走着！', '红灯？没瞅见', '中国式过马路，懂吗您'];
const RIDER_LINES = ['外卖要超时了！', '让让！让让！', '给个五星好评啊您呐！', '超时扣钱啊哥们儿！', '这单差评我可担不起！'];
const VEND_LINES = {
  jb: ['煎饼果子来一套——', '加俩蛋，多放葱花香菜！', '薄脆还是油条？', '辣酱甜面酱都刷上？', '热乎的煎饼果子嘞——'],
  hulu: ['冰糖葫芦嘞——', '山楂的、山药豆儿的、草莓的！', '又酸又甜的糖葫芦——', '不甜不要钱！'],
};
const CHESS_LINES = ['将！', '马后炮！', '观棋不语真君子！', '悔棋？门儿都没有！', '你这臭棋篓子！', '卒子过河顶大车', '当头炮，把马跳', '哎哟，这步好！'];
const BIRD_LINES = ['瞧我这画眉，叫得多欢！', '遛弯儿，遛鸟儿～', '这百灵，比 AI 唱得好', '今儿个它嗓子亮'];
const CG_LINES = ['站住！占道经营！', '又是你！', '跑什么跑！', '市容市貌懂不懂！'];
const FLEE_LINES = ['城管来了！撤！', '快收摊儿！', '跑啊——', '明儿再来！'];
const DANCE_LINES = ['左三圈右三圈～', '音响开大点儿！', '跟上节奏，老李！', '这曲儿叫《最炫大模型风》', '动起来，都动起来！'];
const TAIJI_LINES = ['气沉丹田……', '揽雀尾——', '白鹤亮翅', '慢，要慢'];

/* ---------------- where people walk ---------------- */
const PED_OK = (1 << GK.WALK) | (1 << GK.FREE) | (1 << GK.PARK) | (1 << GK.PLAZA) | (1 << GK.ALLEY);
const PED_OPEN = (1 << GK.WALK) | (1 << GK.FREE) | (1 << GK.PARK) | (1 << GK.PLAZA); // squares & parks: roam freely
const PED_STEP = 2;
const PED_SHOPF = (e) => e.len > 6 && (e.cls === 7 || pedShop(e) === 2);
const _pp = [0, 0, 0, 1], _pw = [0, 0, 0, 1], _pm = [0, 0, 0, 1];
const pedShop = (e) => e._shop ?? (e._shop = SHOP_STREETS.test(e.name) ? 2 : /大街|前门|大栅栏|南锣|王府井|西单|烟袋|后海|什刹海|步行/.test(e.name) ? 1 : 0);
// how busy a street is: 步行街 and shop streets teem, the 二环 is for cars
const pedWeight = (e) => [0.25, 0.6, 0.9, 1, 1, 0.8, 1.1, 3][e.cls] * [1, 2, 4][pedShop(e)];
const pedOff = (e) => (e.cls >= 6 ? 0 : e.hw + e.C.walk * 0.5);
function pedInSolid(s, x, z, r) {
  if (s.obb) { const dx = x - s.cx, dz = z - s.cz, lx = dx * s.ux + dz * s.uz, lz = -dx * s.uz + dz * s.ux; return Math.abs(lx) < s.hx + r && Math.abs(lz) < s.hz + r; }
  return x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r;
}
let _qx = 0, _qz = 0, _qr = 0, _qin = false;
const _qfn = (s) => { if ((s.h || 0) > 0.7 && pedInSolid(s, _qx, _qz, _qr)) { _qin = true; return false; } };
function pedBlocked(x, z, r = 0.3) { _qx = x; _qz = z; _qr = r; _qin = false; forSolids(x, z, r + 0.5, _qfn); return _qin; }
function pedCellOk(x, z, mask = PED_OK) { return ((mask >> Grid.at(x, z)) & 1) === 1 && !pedBlocked(x, z); }
// walkable samples every ~2 m along each side of an edge, built on first use:
// e.pw[0] = right of a→b, e.pw[1] = left; hutongs / 步行街 only pw[0] (the whole lane)
function pedMask(e) {
  if (e.pw) return e.pw;
  const n = Math.max(1, Math.round(e.len / PED_STEP)), off = pedOff(e);
  e.pw = [null, null]; e.pwN = n;
  for (let k = 0; k < (e.cls >= 6 ? 1 : 2); k++) {
    const sd = k ? -1 : 1, m = new Uint8Array(n); let any = 0;
    for (let i = 0; i < n; i++) {
      Roads.at(e, (i + 0.5) * e.len / n, _pm);
      if (pedCellOk(_pm[0] - _pm[3] * off * sd, _pm[1] + _pm[2] * off * sd)) { m[i] = 1; any++; }
    }
    if (any >= 2) e.pw[k] = m;
  }
  return e.pw;
}
const pedIdx = (e, s) => clamp(Math.floor(s / e.len * e.pwN), 0, e.pwN - 1);
// [x, z, tx, tz] on a walk path (tx, tz = a→b tangent)
function pedPoint(e, k, s, lat, out) {
  Roads.at(e, s, _pp);
  const off = (e.cls >= 6 ? 0 : k ? -pedOff(e) : pedOff(e)) + lat;
  out[0] = _pp[0] - _pp[3] * off; out[1] = _pp[1] + _pp[2] * off; out[2] = _pp[2]; out[3] = _pp[3];
  return out;
}
// junction radius: past it you're on the next sidewalk
function pedNodeR(n) { if (n.pr === undefined) { let r = 0; for (const e of n.edges) r = Math.max(r, e.hw + (e.cls >= 6 ? 0.4 : e.C.walk)); n.pr = r + 2; } return n.pr; }
// where e-bikes stop before a junction
function pedRiderStop(n) { if (n.rs === undefined) { let r = 0; for (const e of n.edges) if (e.C.traffic) r = Math.max(r, e.hw); n.rs = r + 2.5; } return n.rs; }
// e-bikes: the bike lane at the curb (big streets), or the right edge of the carriageway
function riderOff(e, dir, s) { const M = pedMask(e)[dir > 0 ? 0 : 1]; return e.cls <= 4 && M && M[pedIdx(e, s)] ? e.hw + 0.7 : Math.max(e.hw * 0.5, e.hw - 0.9); }
// an actor spot outdoors that isn't inside a building or a lake (interiors live far outside the map and are left alone)
function standableSpot(x, z) {
  const B = W.bounds; if (!Grid.kind || x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return [x, z];
  _qx = x; _qz = z; _qr = 0; _qin = false;
  forSolids(x, z, 1, (s) => { if ((s.h || 0) > 2.2 && pedInSolid(s, x, z, 0)) { _qin = true; return false; } });
  if (!_qin && !wetAt(x, z)) return [x, z];
  const p = new V3(x, 0, z); for (let k = 0; k < 4; k++) collideCircle(p, 0.45);
  return [p.x, p.z];
}

/* ---------------- looks: merged boxes with a limb id per vertex ---------------- */
const PED_BALL = new THREE.SphereGeometry(1, 8, 6), PED_BALL_LO = new THREE.IcosahedronGeometry(1, 0);
const PED_DOME = new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2), PED_CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
// groups: [body, leg -x, leg +x, arm -x, arm +x]
function pedMerge(groups) {
  const gs = groups.map((ps) => (ps.length ? mergeParts(ps) : null));
  let nv = 0, ni = 0; for (const g of gs) if (g) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), limb = new Float32Array(nv), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let vo = 0, io = 0;
  gs.forEach((g, li) => {
    if (!g) return;
    const c = g.attributes.position.count, ia = g.index.array;
    pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); col.set(g.attributes.color.array, vo * 3); limb.fill(li, vo, vo + c);
    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
    vo += c; io += ia.length; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aLimb', new THREE.BufferAttribute(limb, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  return out;
}
// o: shirt pants skin hair hs(hair style) capC shoe sleeve('short'|'long'|'tank') skirt pack phone extra:[[group, parts]]
function pedGeo(o) {
  const G = [[], [], [], [], []], B = G[0], sk = o.skin ?? SKINS[0], sh = o.shirt, pa = o.pants, hair = o.hair ?? 0x1b1b1b;
  const up = o.sleeve === 'tank' ? sk : sh, lo = o.sleeve === 'long' ? sh : sk;
  for (const [li, x] of [[1, -0.16], [2, 0.16]]) G[li].push(box(x, 0.48, 0, 0.25, 0.74, 0.28, o.bare ? sk : pa), box(x, 0.06, 0.05, 0.26, 0.12, 0.38, o.shoe ?? 0x2b2b2b));
  for (const [li, x] of [[3, -0.41], [4, 0.41]]) G[li].push(box(x, 1.33, 0, 0.18, 0.28, 0.21, up), box(x, 1.06, 0, 0.15, 0.3, 0.18, lo), box(x, 0.85, 0.01, 0.14, 0.13, 0.15, sk));
  B.push(box(0, 0.96, 0, 0.58, 0.26, 0.31, o.skirt ?? pa), box(0, 1.27, 0, 0.64, 0.48, 0.34, sh));
  if (o.skirt !== undefined) B.push(box(0, 0.72, 0, 0.62, 0.34, 0.37, o.skirt));
  B.push(box(0, 1.55, 0, 0.17, 0.1, 0.17, sk), Head3D.pedSkull(sk)); // round skull (02c_head3d.js), same size as the old box head
  B.push(box(-0.09, 1.8, 0.19, 0.07, 0.05, 0.02, 0x1b1b1b), box(0.09, 1.8, 0.19, 0.07, 0.05, 0.02, 0x1b1b1b), box(0, 1.69, 0.19, 0.11, 0.03, 0.02, 0x9a4a3a));
  const cap = o.capC ?? 0xd7263d;
  switch (o.hs) {
    case 'short': B.push(box(0, 1.99, -0.01, 0.42, 0.08, 0.41, hair), box(0, 1.86, -0.18, 0.42, 0.28, 0.05, hair), box(-0.2, 1.9, -0.04, 0.03, 0.16, 0.3, hair), box(0.2, 1.9, -0.04, 0.03, 0.16, 0.3, hair)); break;
    case 'buzz': B.push(box(0, 1.985, -0.01, 0.41, 0.05, 0.39, hair)); break;
    case 'long': B.push(box(0, 1.99, -0.01, 0.43, 0.08, 0.41, hair), box(0, 1.68, -0.2, 0.44, 0.62, 0.07, hair), box(-0.21, 1.8, -0.05, 0.04, 0.4, 0.3, hair), box(0.21, 1.8, -0.05, 0.04, 0.4, 0.3, hair)); break;
    case 'bun': B.push(box(0, 1.99, -0.01, 0.43, 0.08, 0.41, hair), box(0, 1.86, -0.19, 0.42, 0.28, 0.05, hair), gpart(PED_BALL, hair, 0, 2.02, -0.2, 0, 0, 0, 0.15, 0.15, 0.15)); break;
    case 'perm': B.push(gpart(PED_BALL, hair, 0, 1.92, -0.03, 0, 0, 0, 0.27, 0.2, 0.26)); break;
    case 'bald': B.push(box(-0.205, 1.8, -0.06, 0.03, 0.14, 0.26, hair), box(0.205, 1.8, -0.06, 0.03, 0.14, 0.26, hair), box(0, 1.8, -0.195, 0.4, 0.14, 0.03, hair)); break;
    case 'cap': B.push(box(0, 2.01, -0.01, 0.44, 0.1, 0.42, cap), box(0, 1.975, 0.27, 0.4, 0.03, 0.2, cap), box(0, 1.86, -0.18, 0.42, 0.22, 0.05, hair)); break;
    case 'helmet': B.push(gpart(PED_DOME, cap, 0, 1.9, 0, 0, 0, 0, 0.26, 0.27, 0.26), box(0, 1.93, 0.2, 0.36, 0.1, 0.1, 0x111111)); break;
    case 'chef': B.push(gpart(PED_CYL, 0xf8fafc, 0, 2.12, 0, 0, 0, 0, 0.21, 0.28, 0.21)); break;
    case 'cg': B.push(box(0, 2.0, -0.01, 0.44, 0.1, 0.43, 0x1c2733), box(0, 2.07, 0.02, 0.47, 0.06, 0.47, 0x1c2733), box(0, 1.975, 0.27, 0.4, 0.03, 0.18, 0x111111), box(0, 2.03, 0.235, 0.1, 0.08, 0.01, 0xe0b64a)); break;
  }
  if (o.pack) B.push(box(0, 1.25, -0.27, 0.5, 0.52, 0.2, o.pack));
  if (o.phone) G[4].push(box(0.41, 0.84, 0.09, 0.08, 0.15, 0.02, 0x111111));
  for (const [gi, parts] of o.extra || []) G[gi].push(...parts);
  return pedMerge(G);
}
// the e-bike (root space; the rider's root sits 0.12 m up on the seat)
function pedBike(c) {
  const g = -0.12, wheel = (z) => gpart(PED_CYL, 0x1b1b1b, 0, g + 0.27, z, 0, 0, Math.PI / 2, 0.27, 0.08, 0.27);
  return [wheel(0.74), wheel(-0.62), box(0, g + 0.36, 0.05, 0.26, 0.2, 1.2, c), box(0, g + 0.62, -0.38, 0.34, 0.36, 0.62, c), box(0, g + 0.86, -0.3, 0.3, 0.09, 0.6, 0x151515),
    box(0, g + 0.8, 0.68, 0.1, 0.9, 0.1, 0x333333), box(0, g + 1.24, 0.62, 0.74, 0.05, 0.05, 0x222222), box(0, g + 1.02, 0.74, 0.2, 0.14, 0.08, 0xfff1b8),
    box(0, g + 0.74, 0.6, 0.66, 0.62, 0.05, 0x3b5b8a), // 挡风被: the quilt every Beijing e-bike wears
    box(0, g + 1.2, -0.72, 0.56, 0.5, 0.5, c), box(0, g + 1.2, -0.975, 0.4, 0.2, 0.01, 0x111111)];
}
function pedHulu() { // 草把子 stuck with 糖葫芦
  const p = [box(0.6, 1.05, 0.18, 0.06, 2.1, 0.06, 0xa77c4a), gpart(PED_CYL, 0xd9b76a, 0.6, 2.0, 0.18, 0, 0, 0, 0.2, 0.55, 0.2)];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, y = 1.84 + (k % 3) * 0.14, ca = Math.cos(a), sa = Math.sin(a);
    for (const r of [0.27, 0.37, 0.47]) p.push(gpart(PED_BALL_LO, 0xc8102e, 0.6 + ca * r, y + (r - 0.27) * 0.3, 0.18 + sa * r, 0, 0, 0, 0.065, 0.065, 0.065));
  }
  return p;
}
function pedCage() { // 鸟笼 with a cloth cover, hanging from the hand
  const x = 0.41, p = [gpart(PED_CYL, 0xc9a36a, x, 0.36, 0.06, 0, 0, 0, 0.2, 0.03, 0.2), gpart(PED_DOME, 0x1e3a8a, x, 0.72, 0.06, 0, 0, 0, 0.21, 0.16, 0.21), box(x, 0.84, 0.06, 0.03, 0.12, 0.03, 0xc9a36a), gpart(PED_BALL, 0xf6d23a, x, 0.48, 0.06, 0, 0, 0, 0.07, 0.07, 0.07)];
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; p.push(box(x + Math.cos(a) * 0.19, 0.54, 0.06 + Math.sin(a) * 0.19, 0.02, 0.36, 0.02, 0xc9a36a)); }
  return p;
}
function pedRandomLook(k) {
  const f = k % 3 === 1;
  return { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick(HAIRS), hs: f ? pick(['long', 'bun', 'long']) : pick(['short', 'short', 'cap', 'buzz']), capC: pick([0xd7263d, 0x1f2937, 0xf5f5f5, 0x2563eb]),
    skirt: f && Math.random() < 0.4 ? pick([0x1f2937, 0x7c3aed, 0xb91c1c, 0x0f766e]) : undefined, sleeve: Math.random() < 0.35 ? 'long' : 'short',
    pack: Math.random() < 0.25 ? pick([0x2d3a4a, 0xb45309, 0x111827]) : 0, phone: Math.random() < 0.5, shoe: pick([0x2b2b2b, 0xf5f5f5, 0x6b4a2f]) };
}
const PED_LOOKS = () => ({
  daye: { shirt: 0xf4f2ec, pants: 0x3b4252, skin: 0xe8b890, hair: 0xbdbdbd, hs: 'bald', sleeve: 'tank', shoe: 0x1b1b1b, extra: [[3, [box(-0.41, 0.8, 0.16, 0.04, 0.34, 0.42, 0xd9c28e)]]] }, // 跨栏背心 + 蒲扇
  dama: { shirt: 0xd7263d, pants: 0x1f2937, skin: 0xf0c8a4, hair: 0x2b1d16, hs: 'perm', sleeve: 'long', extra: [[3, [box(-0.41, 0.78, 0.2, 0.03, 0.36, 0.5, 0xf472b6)]]] },
  dama2: { shirt: 0xec4899, pants: 0x111827, skin: 0xf5d5b8, hair: 0x3b2a20, hs: 'perm', extra: [[4, [box(0.41, 0.78, 0.2, 0.03, 0.36, 0.5, 0xd7263d)]]] },
  dama3: { shirt: 0x7c3aed, pants: 0x1f2937, skin: 0xe0ac86, hair: 0x1b1b1b, hs: 'perm', sleeve: 'long', extra: [[0, [box(0, 1.5, 0.1, 0.5, 0.1, 0.34, 0xef4444)]]] },
  office: { shirt: 0xf8fafc, pants: 0x1f2937, skin: 0xf1c9a5, hair: 0x1b1b1b, hs: 'short', sleeve: 'long', pack: 0x1f2937, phone: true, extra: [[0, [box(0, 1.33, 0.175, 0.14, 0.18, 0.01, 0x2563eb)]]] },
  office2: { shirt: 0xe5e7eb, pants: 0x1f2937, skin: 0xf5d5b8, hair: 0x2b1d16, hs: 'long', skirt: 0x1f2937, sleeve: 'long', phone: true, extra: [[3, [box(-0.5, 0.92, 0, 0.1, 0.26, 0.32, 0x7c2d12)]]] },
  tourist: { shirt: 0x22c55e, pants: 0xe5e7eb, skin: 0xe0ac86, hair: 0x3b2a20, hs: 'cap', capC: 0xd7263d, extra: [[0, [box(0, 1.34, 0.2, 0.22, 0.15, 0.1, 0x111111)]]] },
  guide: { shirt: 0xf97316, pants: 0x1f2937, skin: 0xf1c9a5, hair: 0x1b1b1b, hs: 'cap', capC: 0xfacc15, extra: [[4, [box(0.41, 1.05, 0.12, 0.03, 1.0, 0.03, 0x8a6a44), box(0.41, 1.5, 0.3, 0.02, 0.22, 0.32, 0xfacc15)]]] }, // 导游小旗
  courier: { shirt: 0xc81e28, pants: 0x1f2937, skin: 0xc98e6b, hair: 0x1b1b1b, hs: 'cap', capC: 0xc81e28, sleeve: 'long', extra: [[4, [box(0.55, 1.05, 0, 0.22, 0.32, 0.42, 0xc9a36a)]]] },
  student: { shirt: 0x1e56c8, pants: 0x1e56c8, skin: 0xf5d5b8, hair: 0x111111, hs: 'short', sleeve: 'long', pack: 0x111827, shoe: 0xf5f5f5, extra: [[0, [box(0, 1.27, 0.172, 0.06, 0.46, 0.01, 0xffffff), box(-0.33, 1.27, 0, 0.02, 0.46, 0.2, 0xffffff), box(0.33, 1.27, 0, 0.02, 0.46, 0.2, 0xffffff)]]] },
  bird: { shirt: 0x2b3a67, pants: 0x1b1b1b, skin: 0xe8b890, hair: 0xd1d5db, hs: 'bald', sleeve: 'long', shoe: 0x151515, extra: [[4, pedCage()], [0, [box(0.05, 1.42, 0.172, 0.22, 0.04, 0.01, 0xe8b422), box(0.05, 1.3, 0.172, 0.22, 0.04, 0.01, 0xe8b422), box(0.05, 1.18, 0.172, 0.22, 0.04, 0.01, 0xe8b422)]]] },
  cg: { shirt: 0x1c2733, pants: 0x1c2733, skin: 0xe0ac86, hair: 0x111111, hs: 'cg', sleeve: 'long', shoe: 0x0b0b0b,
    extra: [[3, [box(-0.41, 1.3, 0, 0.19, 0.1, 0.22, 0xd7263d)]], [0, [box(-0.15, 1.38, 0.175, 0.1, 0.12, 0.01, 0xe0b64a), box(0, 1.06, 0, 0.6, 0.06, 0.32, 0x111111), box(0, 1.22, 0.172, 0.64, 0.05, 0.01, 0xd9f99d)]]] },
  jb: { shirt: 0xf8fafc, pants: 0x3f3f46, skin: 0xe0ac86, hair: 0x1b1b1b, hs: 'chef', sleeve: 'long', extra: [[0, [box(0, 1.02, 0.17, 0.52, 0.76, 0.02, 0xb91c1c)]], [4, [box(0.41, 0.7, 0.14, 0.05, 0.3, 0.14, 0x9ca3af)]]] },
  hulu: { shirt: 0x7c2d12, pants: 0x1f2937, skin: 0xc98e6b, hair: 0x6b7280, hs: 'cap', capC: 0x1f2937, sleeve: 'long', extra: [[0, pedHulu()]] },
  taiji: { shirt: 0xf5f5f0, pants: 0xf5f5f0, skin: 0xe8b890, hair: 0xe5e7eb, hs: 'bald', sleeve: 'long', shoe: 0x111111, extra: [[0, [box(0, 1.06, 0, 0.6, 0.06, 0.32, 0x111111), box(0, 1.3, 0.172, 0.05, 0.4, 0.01, 0xd1c7a8)]]] },
  rider: { shirt: 0xf6c21a, pants: 0x1f2937, skin: 0xc98e6b, hair: 0x111111, hs: 'helmet', capC: 0xf6c21a, sleeve: 'long', extra: [[0, pedBike(0xf6c21a)]] },
  rider2: { shirt: 0x1d9bf0, pants: 0x1f2937, skin: 0xe0ac86, hair: 0x111111, hs: 'helmet', capC: 0x1d9bf0, sleeve: 'long', extra: [[0, pedBike(0x1d9bf0)]] },
});
const PED_NCOMMON = LOWQ ? 7 : 14;
// vertex shader: rotate leg / arm vertices about the hip / shoulder
const PED_VS = [
  'attribute float aLimb; attribute vec4 aPose; attribute float aSpread;',
  'mat3 pedRot(out vec3 pv) {',
  '  float ax = 0.0, az = 0.0; pv = vec3(0.0);',
  '  if (aLimb > 0.5) {',
  '    if (aLimb < 1.5) { ax = aPose.x; pv = vec3(0.0, 0.84, 0.0); }',
  '    else if (aLimb < 2.5) { ax = aPose.y; pv = vec3(0.0, 0.84, 0.0); }',
  '    else if (aLimb < 3.5) { ax = aPose.z; az = -aSpread; pv = vec3(-0.36, 1.46, 0.0); }',
  '    else { ax = aPose.w; az = aSpread; pv = vec3(0.36, 1.46, 0.0); }',
  '  }',
  '  float cx = cos(ax), sx = sin(ax), cz = cos(az), sz = sin(az);',
  '  return mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0) * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);',
  '}',
].join('\n');

/* ---------------- one pedestrian ---------------- */
const _cands = Array.from({ length: 48 }, () => ({ e: null, k: 0, s: 0, dir: 1, w: 0, x: 0, z: 0 }));
const _near = { e: null, k: 0, s: 0, dir: 1, x: 0, z: 0 };
class Ped {
  constructor() {
    this.pos = new V3(); this.heading = 0; this.y = 0; this.vy = 0; this.bubbleH = 0.2; this.look = 0; this.active = false; this.removed = true;
    this.state = 'walk'; this.t = 0; this.ph = rand(TAU); this.vx = 0; this.vz = 0; this.fx = 0; this.fz = 0; this.fallA = 0; this.coinT = -99;
    this.e = null; this.k = 0; this.s = 0; this.dir = 1; this.lat = 0; this.speed = 1.4; this.v = 0; this.amp = 0.5; this.mv = 0; this.lpx = 0; this.lpz = 0;
    this.ne = null; this.nk = 0; this.ns = 0; this.nd = 1; this.B = [0, 0]; this.crossT = 0; this.sig = null; this.axis = 0; this.crossRoad = false;
    this.role = null; this.home = null; this.goal = null; this.lead = null; this.bold = false; this.phone = false; this.fan = false; this.carry = false; this.talkT = rand(6, 20);
    this.legL = 0; this.legR = 0; this.armL = 0; this.armR = 0; this.spread = 0; this.rx = 0; this.rz = 0; this.ry = 0; this.bob = 0;
    this.wx = 0; this.wz = 0; this.wr = 8; this.roff = 0; this.boost = 0; this.blocked = false; this.moveT = 0;
  }
  // ---- sidewalk paths ----
  setPath(e, k, s, dir) { this.e = e; this.k = k; this.s = clamp(s, 0, e.len); this.dir = dir; this.state = 'walk'; }
  place() { pedPoint(this.e, this.k, this.s, this.lat, _pw); this.pos.x = _pw[0]; this.pos.z = _pw[1]; this.heading = Math.atan2(_pw[2] * this.dir, _pw[3] * this.dir); this.lpx = this.pos.x; this.lpz = this.pos.z; }
  latFor(e) { return e.cls >= 6 ? rand(-1, 1) * Math.max(0, e.hw - 1) : rand(-1, 1) * Math.min(0.55, e.C.walk * 0.16); }
  walk(dt) {
    const e = this.e, M = pedMask(e)[this.k];
    if (!M) return this.rejoin();
    const s = this.s + this.dir * this.speed * dt, a = s + this.dir * 1.2;
    if (a <= 0 || a >= e.len || !M[pedIdx(e, a)]) {
      const dEnd = this.dir > 0 ? e.len - s : s;
      if (a <= 0 || a >= e.len || dEnd < pedNodeR(Roads.nodes[this.dir > 0 ? e.b : e.a]) + 2 || !this.gapOk(M, a)) { this.s = clamp(s, 0, e.len); return this.endOfRun(); }
    }
    this.s = s;
    pedPoint(e, this.k, s, this.lat, _pw);
    this.pos.x = _pw[0]; this.pos.z = _pw[1];
    Life.push(this.pos, 0.35); collideCircle(this.pos, 0.35);
    this.heading = dampA(this.heading, Math.atan2(_pw[2] * this.dir, _pw[3] * this.dir), 8, dt);
    if (!this.goal && Math.random() < dt * 0.03) { this.state = 'idle'; this.t = rand(1, 3.5); this.phone = Math.random() < 0.45; }
  }
  gapOk(M, s) { // a lamp post, a bus stop, a driveway: walkable again within 6 m?
    for (let d = 2; d <= 6; d += 2) { const q = s + this.dir * d; if (q <= 0 || q >= this.e.len) return false; if (M[pedIdx(this.e, q)]) return true; }
    return false;
  }
  endOfRun() {
    const e = this.e, n = Roads.nodes[this.dir > 0 ? e.b : e.a], dEnd = this.dir > 0 ? e.len - this.s : this.s;
    if (dEnd < pedNodeR(n) + 4) return this.atNode(n);
    // the sidewalk just ends: nip across (small streets) or turn back
    const M2 = e.cls >= 3 && e.cls < 6 && pedMask(e)[1 - this.k];
    if (M2 && M2[pedIdx(e, this.s)] && Math.random() < 0.5) return this.goCross(e, 1 - this.k, this.s, this.dir, null);
    this.dir = -this.dir; this.state = 'idle'; this.t = rand(0.3, 1.2);
  }
  // at a junction: pick the next sidewalk (weighted: busy streets pull, U-turns and long crossings don't)
  atNode(n) {
    let nc = 0, tw = 0;
    for (const e2 of n.edges) {
      if (e2.len < 3) continue;
      const Ms = pedMask(e2), atA = e2.a === n.id, N = e2.pwN, lim = Math.min(N, Math.ceil((pedNodeR(n) + 8) / (e2.len / N)));
      for (let k = 0; k < 2 && nc < _cands.length; k++) {
        const M = Ms[k]; if (!M) continue;
        let i = -1;
        for (let j = 0; j < lim; j++) { const ii = atA ? j : N - 1 - j; if (M[ii]) { i = ii; break; } }
        if (i < 0) continue;
        const s = (i + 0.5) * e2.len / N;
        pedPoint(e2, k, s, 0, _pw);
        const d = hyp(_pw[0] - this.pos.x, _pw[1] - this.pos.z);
        let w = pedWeight(e2) * (d > 26 ? 0.3 : 1);
        if (e2 === this.e) w *= k === this.k ? 0.05 : 0.3;
        if (this.goal) w = 1 / (1 + hyp(_pw[0] - this.goal.x, _pw[1] - this.goal.z) + rand(0, 6)) ** 3;
        const c = _cands[nc++]; c.e = e2; c.k = k; c.s = s; c.dir = atA ? 1 : -1; c.w = w; tw += w;
      }
    }
    if (!nc) { this.dir = -this.dir; this.state = 'idle'; this.t = rand(0.5, 1.5); return; }
    let r = Math.random() * tw, c = _cands[nc - 1];
    for (let i = 0; i < nc; i++) { r -= _cands[i].w; if (r <= 0) { c = _cands[i]; break; } }
    this.goCross(c.e, c.k, c.s, c.dir, n);
  }
  goCross(e, k, s, dir, n) {
    this.lat = this.latFor(e);
    pedPoint(e, k, s, this.lat, _pw);
    this.ne = e; this.nk = k; this.ns = s; this.nd = dir; this.B[0] = _pw[0]; this.B[1] = _pw[1];
    const ax = this.pos.x, az = this.pos.z, bx = _pw[0], bz = _pw[1];
    let road = false;
    for (let t = 0.2; t < 0.9; t += 0.2) if (Grid.at(lerp(ax, bx, t), lerp(az, bz, t)) === GK.ROAD) { road = true; break; }
    this.crossRoad = road; this.t = 0;
    this.sig = road && n ? n.signal || null : null; this.axis = Math.abs(bz - az) > Math.abs(bx - ax) ? 0 : 1;
    this.crossT = hyp(bx - ax, bz - az) / this.speed * 2 + 4;
    if (this.sig && !Signals.green(this.sig, this.axis)) {
      if (!this.bold) { this.state = 'wait'; return; }
      if (Math.random() < 0.3 && dist2(ax, az, Player.pos.x, Player.pos.z) < 30 * 30) Bubble.say(this, pick(CROSS_LINES), 1.8, 'ped');
    }
    this.state = 'cross';
  }
  waitCross(dt) {
    this.t += dt;
    this.heading = dampA(this.heading, Math.atan2(this.B[0] - this.pos.x, this.B[1] - this.pos.z), 5, dt);
    if (Signals.green(this.sig, this.axis) || this.t > 38) this.state = 'cross';
  }
  cross(dt) {
    const dx = this.B[0] - this.pos.x, dz = this.B[1] - this.pos.z, d = hyp(dx, dz);
    this.crossT -= dt;
    if (d < 0.35 || this.crossT < 0) { this.setPath(this.ne, this.nk, this.ns, this.nd); if (d >= 0.35) this.place(); return; }
    const f = Math.min(1, this.speed * (this.crossRoad ? 1.3 : 1) * dt / d);
    this.pos.x += dx * f; this.pos.z += dz * f; Life.push(this.pos, 0.35); collideCircle(this.pos, 0.35);
    this.heading = dampA(this.heading, Math.atan2(dx, dz), 9, dt);
  }
  // ---- squares & parks ----
  wanderAt(x, z, r) { this.wx = x; this.wz = z; this.wr = r; this.pickWander(); }
  pickWander() {
    for (let k = 0; k < 6; k++) {
      const a = rand(TAU), r = rand(2, this.wr), x = this.wx + Math.cos(a) * r, z = this.wz + Math.sin(a) * r;
      if (!pedCellOk(x, z, PED_OPEN | (1 << GK.ALLEY)) || !this.clearLine(x, z)) continue;
      this.B[0] = x; this.B[1] = z; this.state = 'wander'; this.t = hyp(x - this.pos.x, z - this.pos.z) / (this.speed * 0.8) + 3; return;
    }
    this.state = 'widle'; this.t = rand(1.5, 4);
  }
  clearLine(x, z) {
    const ax = this.pos.x, az = this.pos.z, n = Math.ceil(hyp(x - ax, z - az) / 1.5), M = PED_OPEN | (1 << GK.ALLEY);
    for (let i = 1; i < n; i++) if (!((M >> Grid.at(lerp(ax, x, i / n), lerp(az, z, i / n))) & 1)) return false;
    return true;
  }
  wanderMove(dt) {
    const dx = this.B[0] - this.pos.x, dz = this.B[1] - this.pos.z, d = hyp(dx, dz);
    this.t -= dt;
    if (d < 0.4) { this.state = 'widle'; this.t = rand(2, 7); this.phone = Math.random() < 0.3; return; }
    if (this.t < 0) return this.pickWander();
    const f = Math.min(1, this.speed * 0.8 * dt / d);
    this.pos.x += dx * f; this.pos.z += dz * f; Life.push(this.pos, 0.35); collideCircle(this.pos, 0.35);
    this.heading = dampA(this.heading, Math.atan2(dx, dz), 7, dt);
  }
  // ---- 城管 #2 sticks to #1 ----
  follow(dt) {
    const L = this.lead;
    if (!L || !L.active) { this.lead = null; return this.rejoin(); }
    const sh = Math.sin(L.heading), ch = Math.cos(L.heading), tx = L.pos.x - sh * 1.2 - ch * 0.9, tz = L.pos.z - ch * 1.2 + sh * 0.9;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = hyp(dx, dz);
    if (d > 25) { this.pos.set(tx, 0, tz); return; }
    if (d > 0.25) { const f = Math.min(1, Math.min(d * 2.5, L.speed * 1.7) * dt / d); this.pos.x += dx * f; this.pos.z += dz * f; collideCircle(this.pos, 0.35); }
    this.heading = dampA(this.heading, d > 0.5 ? Math.atan2(dx, dz) : L.heading, 8, dt);
  }
  // ---- 外卖小哥 ----
  ride(dt) {
    const e = this.e, dir = this.dir, n = Roads.nodes[dir > 0 ? e.b : e.a];
    if (this.state === 'rwait') {
      this.t += dt;
      if (!n.signal || Signals.green(n.signal, this.axis) || this.t > 45) this.nextEdge(n);
      return this.placeRider(dt);
    }
    this.v = damp(this.v, this.blocked ? 0 : this.speed * (this.boost > 0 ? 1.45 : 1), this.blocked ? 6 : 1.6, dt);
    const s = this.s + dir * this.v * dt, stop = Math.min(e.len * 0.5, pedRiderStop(n));
    if ((dir > 0 ? e.len - s : s) <= stop) {
      this.s = dir > 0 ? e.len - stop : stop;
      if (n.signal) {
        this.axis = Signals.axisOf(e, n);
        if (!Signals.green(n.signal, this.axis)) {
          if (!this.bold) { this.state = 'rwait'; this.t = 0; this.v = 0; return this.placeRider(dt); }
          if (Math.random() < 0.4 && dist2(this.pos.x, this.pos.z, Player.pos.x, Player.pos.z) < 40 * 40) Bubble.say(this, pick(RIDER_LINES), 1.6, 'ped');
        }
      }
      this.nextEdge(n); return this.placeRider(dt);
    }
    this.s = s; this.placeRider(dt);
  }
  nextEdge(n) {
    const e = this.e, dir = this.dir;
    Roads.at(e, dir > 0 ? e.len : 0, _pp); const hx = _pp[2] * dir, hz = _pp[3] * dir;
    let nc = 0, tw = 0;
    for (const e2 of n.edges) {
      if (e2 === e || !e2.C.traffic || e2.len < 6 || (e2.oneway && e2.a !== n.id) || nc >= _cands.length) continue;
      const atA = e2.a === n.id; Roads.at(e2, atA ? Math.min(4, e2.len / 2) : Math.max(0, e2.len - 4), _pp);
      const dx = atA ? _pp[2] : -_pp[2], dz = atA ? _pp[3] : -_pp[3];
      const w = (0.3 + Math.max(0, dx * hx + dz * hz) * 1.6) * (e2.cls === 0 ? 0.3 : 1);
      const c = _cands[nc++]; c.e = e2; c.dir = atA ? 1 : -1; c.w = w; tw += w;
    }
    let e2 = e, d2 = -dir;
    if (nc) { let r = Math.random() * tw; const c0 = _cands[nc - 1]; e2 = c0.e; d2 = c0.dir; for (let i = 0; i < nc; i++) { r -= _cands[i].w; if (r <= 0) { e2 = _cands[i].e; d2 = _cands[i].dir; break; } } }
    const st = Math.min(e2.len * 0.5, pedRiderStop(n)), s2 = d2 > 0 ? st : e2.len - st;
    Roads.at(e2, s2, _pp); const off = riderOff(e2, d2, s2);
    this.ne = e2; this.ns = s2; this.nd = d2; this.B[0] = _pp[0] - d2 * _pp[3] * off; this.B[1] = _pp[1] + d2 * _pp[2] * off;
    this.state = 'rturn'; this.crossT = 10; this.roffT = off;
  }
  rturn(dt) {
    const dx = this.B[0] - this.pos.x, dz = this.B[1] - this.pos.z, d = hyp(dx, dz);
    this.crossT -= dt;
    if (d < 0.6 || this.crossT < 0) { this.e = this.ne; this.s = this.ns; this.dir = this.nd; this.roff = this.roffT; this.state = 'ride'; return; }
    this.v = damp(this.v, this.speed * 0.8, 2, dt);
    const f = Math.min(1, Math.max(2.5, this.v) * dt / d), h0 = this.heading;
    this.pos.x += dx * f; this.pos.z += dz * f; collideCircle(this.pos, 0.5);
    this.heading = dampA(this.heading, Math.atan2(dx, dz), 5, dt);
    this.rz = damp(this.rz, clamp(angDiff(h0, this.heading) / Math.max(dt, 1e-3) * -0.12, -0.35, 0.35), 5, dt);
  }
  placeRider(dt) {
    const e = this.e, dir = this.dir;
    Roads.at(e, this.s, _pp);
    let off = riderOff(e, dir, this.s);
    if (off > e.hw) { // bridge / kiosk ahead: back on the road
      const px = _pp[0], pz = _pp[1], tx = _pp[2], tz = _pp[3];
      if (!pedCellOk(px - dir * tz * off, pz + dir * tx * off, PED_OK | (1 << GK.ROAD)) || riderOff(e, dir, clamp(this.s + dir * 4, 0, e.len)) <= e.hw) off = Math.max(e.hw * 0.5, e.hw - 0.9);
      else { Roads.at(e, clamp(this.s + dir * 4, 0, e.len), _pp); if (!pedCellOk(_pp[0] - dir * _pp[3] * off, _pp[1] + dir * _pp[2] * off, PED_OK | (1 << GK.ROAD))) off = Math.max(e.hw * 0.5, e.hw - 0.9); Roads.at(e, this.s, _pp); }
    }
    this.roff = dt > 0 ? damp(this.roff, off, off < this.roff ? 9 : 3, dt) : off;
    this.pos.x = _pp[0] - dir * _pp[3] * this.roff; this.pos.z = _pp[1] + dir * _pp[2] * this.roff;
    if (wetAt(this.pos.x, this.pos.z)) { this.roff = Math.min(this.roff, 1.2); this.pos.x = _pp[0] - dir * _pp[3] * this.roff; this.pos.z = _pp[1] + dir * _pp[2] * this.roff; } // lakeside road: hug the middle
    collideCircle(this.pos, 0.45); // 鼓楼 sits in the middle of its crossing: ride round it
    const h0 = this.heading; this.heading = dampA(this.heading, Math.atan2(_pp[2] * dir, _pp[3] * dir), 6, dt);
    this.rz = damp(this.rz, clamp(angDiff(h0, this.heading) / Math.max(dt, 1e-3) * -0.12, -0.35, 0.35), 5, dt);
  }
  // ---- after a scare: back to the sidewalk / the lane / your spot ----
  rejoin() {
    this.state = 'return'; this.crossT = 14;
    if (this.home) { this.B[0] = this.home.x; this.B[1] = this.home.z; this.ne = null; return; }
    const r = this.role === 'rider' ? Peds.laneNear(this.pos.x, this.pos.z) : Peds.pathNear(this.pos.x, this.pos.z);
    if (!r) { this.ne = null; this.wanderAt(this.pos.x, this.pos.z, 10); return; }
    this.ne = r.e; this.nk = r.k; this.ns = r.s; this.nd = r.dir; this.B[0] = r.x; this.B[1] = r.z;
  }
  back(dt) {
    const dx = this.B[0] - this.pos.x, dz = this.B[1] - this.pos.z, d = hyp(dx, dz);
    this.crossT -= dt;
    if (d < 0.4 || (this.crossT < 0 && !Peds.seen(this.pos.x, this.pos.z)) || this.crossT < -12) return this.arrive();
    const f = Math.min(1, (this.role === 'rider' ? 5 : 2.4) * dt / d);
    this.pos.x += dx * f; this.pos.z += dz * f; collideCircle(this.pos, 0.35);
    this.heading = dampA(this.heading, Math.atan2(dx, dz), 8, dt);
  }
  arrive() {
    if (this.home) { this.pos.set(this.home.x, 0, this.home.z); this.heading = this.home.h; this.state = this.home.st; return; }
    if (!this.ne) return this.wanderAt(this.pos.x, this.pos.z, 10);
    if (this.role === 'rider') { this.e = this.ne; this.s = this.ns; this.dir = this.nd; this.v = 0; this.roff = riderOff(this.e, this.dir, this.s); this.state = 'ride'; return; }
    this.setPath(this.ne, this.nk, this.ns, this.nd); this.place();
  }
  // ---- reactions (API used by the player / cars) ----
  panic(fx, fz, dur = 3.5) {
    if (this.state === 'dive' || this.state === 'down') return;
    if (this.role === 'rider') { this.boost = dur; return; }
    const wasCalm = this.state !== 'panic';
    this.state = 'panic'; this.t = dur * rand(0.8, 1.2); this.fx = fx; this.fz = fz;
    if (wasCalm && Math.random() < 0.18) Bubble.say(this, this.role === 'vend' ? pick(['我的摊儿！', '钱匣子！钱匣子！', '不卖了不卖了！']) : pick(PANIC_LINES), 1.8, 'ped');
  }
  dive(nx, nz) {
    if (this.state === 'down' || this.state === 'dive') return;
    this.state = 'dive'; this.t = 0.45; this.vx = nx * 10; this.vz = nz * 10;
    if (Math.random() < 0.3) Bubble.say(this, pick(['哎哟！', '会不会开车啊您！', '差点儿交代这儿！', '嘿！长没长眼啊！']), 1.2, 'ped');
  }
  // punched / kicked: fly back, fall, lie there a moment, get up and leg it. Returns true when money comes out.
  hit(kx, kz, strong) {
    const coins = G.time - this.coinT > 2.5 && this.state !== 'down';
    this.state = 'down'; this.t = strong ? rand(2.4, 3.4) : rand(1.6, 2.4); this.vx = kx; this.vz = kz; this.vy = strong ? 7 : 3.5; this.y = Math.max(this.y, 0.05); this.fallA = 0;
    if (coins) { this.coinT = G.time; Bubble.say(this, pick(HIT_LINES), 1.6, 'ped'); Sfx.ouch(); Peds.panicAround(this.pos.x, this.pos.z, 14, 4); }
    return coins;
  }
  tick(dt) {
    switch (this.state) {
      case 'walk': this.walk(dt); break;
      case 'idle': this.t -= dt; if (this.t <= 0) { if (!this.e) { this.rejoin(); break; } this.state = 'walk'; this.phone = false; if (Math.random() < 0.2) this.dir = -this.dir; } break;
      case 'wait': this.waitCross(dt); break;
      case 'cross': this.cross(dt); break;
      case 'ride': case 'rwait': this.ride(dt); break;
      case 'rturn': this.rturn(dt); break;
      case 'wander': this.wanderMove(dt); break;
      case 'widle': this.t -= dt; if (this.t <= 0) this.pickWander(); break;
      case 'follow': this.follow(dt); break;
      case 'return': this.back(dt); break;
      case 'panic': {
        this.t -= dt;
        let dx = this.pos.x - this.fx, dz = this.pos.z - this.fz; const l = hyp(dx, dz) || 1; dx /= l; dz /= l;
        this.pos.x += dx * 6.5 * dt; this.pos.z += dz * 6.5 * dt; collideCircle(this.pos, 0.4);
        this.heading = dampA(this.heading, Math.atan2(dx, dz), 10, dt);
        if (this.t <= 0) this.rejoin();
        break;
      }
      case 'dive': {
        this.t -= dt; this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; collideCircle(this.pos, 0.4);
        if (this.t <= 0) { this.state = 'idle'; if (this.role === 'rider') this.rejoin(); else this.panic(this.pos.x - this.vx, this.pos.z - this.vz, 1.5); }
        break;
      }
      case 'down': {
        this.t -= dt; this.fallA = Math.min(1, this.fallA + dt * 5);
        this.vy -= 26 * dt; this.y = Math.max(0, this.y + this.vy * dt); if (this.y === 0) { this.vy = 0; const f = Math.exp(-5 * dt); this.vx *= f; this.vz *= f; }
        this.pos.x += this.vx * dt; this.pos.z += this.vz * dt; collideCircle(this.pos, 0.4);
        if (this.t <= 0) { this.fallA = 0; this.y = 0; this.state = 'idle'; if (this.role === 'rider') this.rejoin(); else this.panic(Player.pos.x, Player.pos.z, 4); }
        break;
      }
      // 'dance' / 'sit' / 'vend' / 'push': posed and moved by Life
    }
    if (this.boost > 0) this.boost -= dt;
    if (this.moveT > 0) this.moveT -= dt;
    this.pose(dt);
  }
  pose(dt) {
    const x = this.pos.x, z = this.pos.z, st = this.state;
    const mv = dt > 0 ? Math.min(9, hyp(x - this.lpx, z - this.lpz) / dt) : 0; this.lpx = x; this.lpz = z;
    this.mv = dt > 0 ? damp(this.mv, mv, 12, dt) : 0;
    this.ph += dt * this.mv * 4.4;
    if (st === 'dance') { this.ry = groundH(x, z) + this.bob; return; }
    let lL = 0, lR = 0, aL = 0, aR = 0, sp = 0.06, rx = 0, yo = 0, bob = 0, rz = 0;
    if (this.role === 'rider' && st !== 'down' && st !== 'dive') { lL = lR = -0.75; aL = aR = -0.95; sp = 0.12; yo = 0.12; rz = this.rz; }
    else switch (st) {
      case 'down': rx = -1.45 * this.fallA; aL = -2.7; aR = -2.3; sp = 0.8; lL = 0.25; lR = -0.2; yo = this.y + 0.15 * this.fallA; break;
      case 'dive': rx = -1.1; aL = aR = -2.9; lL = 0.35; lR = 0.1; break;
      case 'sit': lL = lR = -1.4; aL = -0.75; aR = this.moveT > 0 ? -1.25 : -0.75; yo = -0.36; break;
      case 'vend': aL = -0.55; aR = this.look === Peds.lookIx.jb ? -1.0 + Math.sin(Peds.clock * 5 + this.ph) * 0.3 : -0.25; break;
      default: {
        const w = Math.sin(this.ph) * Math.min(1.25, this.mv / 1.4) * (st === 'panic' ? 0.85 : this.amp);
        lL = w; lR = -w;
        if (st === 'panic') { aL = -2.5 + w * 0.4; aR = -2.5 - w * 0.4; sp = 0.3; }
        else {
          aL = -w * 0.8; aR = this.carry ? w * 0.2 : w * 0.8;
          if (this.mv < 0.25) { if (this.phone) aR = -1.15; if (this.fan) aL = -1.3 + Math.sin(Peds.clock * 7 + this.ph) * 0.25; }
          rz = Math.sin(this.ph) * 0.025;
        }
        bob = Math.abs(Math.cos(this.ph)) * Math.min(this.mv, 6) * (st === 'panic' ? 0.02 : 0.03);
      }
    }
    this.legL = lL; this.legR = lR; this.armL = aL; this.armR = aR; this.spread = sp; this.rx = rx; this.rz = rz;
    this.ry = groundH(x, z) + yo + bob;
  }
}

/* ---------------- the crowd ---------------- */
const Peds = {
  pool: [], list: [], looks: [], lookIx: {}, mat: null, depth: null, life: null,
  clock: 0, px: 0, pz: 0, pr: 0, shopNear: false, checkT: 0, streamT: 0, carT: 0, lx: 1e9, lz: 1e9, weather: '', cfx: 0, cfz: 1, _cf: new V3(), _o: new THREE.Object3D(),
  cap() { return LOWQ ? 46 : 88; },
  base() { return LOWQ ? 24 : 50; },
  hourK(h) { return h < 5 ? 0.3 : h < 6.5 ? 0.5 : h < 9.5 ? 1 : h < 11.5 ? 0.8 : h < 13.5 ? 0.95 : h < 17 ? 0.8 : h < 20 ? 1 : h < 22.5 ? 0.85 : 0.45; },
  riderN(h) { const n = LOWQ ? 3 : 7; return Math.round(n * (h < 6.5 ? 0.3 : (h > 10.5 && h < 13.5) || (h > 16.5 && h < 20.5) ? 1 : 0.6)); },
  init() {
    this.buildLooks();
    for (let k = 0; k < this.cap(); k++) this.pool.push(new Ped());
    Life.init(); this.life = Life;
    Hooks.on('weather', (d) => { this.weather = String((d && d.kind) || d || ''); });
    this.stream(true); this.draw();
  },
  buildLooks() {
    const base = MAT.vc, prev = base.onBeforeCompile, mat = base.clone();
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      sh.vertexShader = PED_VS + '\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vec3 pedP; mat3 pedR = pedRot(pedP); objectNormal = pedR * objectNormal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = pedP + pedR * (position - pedP);');
    };
    mat.customProgramCacheKey = () => 'ped-anim|' + (base.customProgramCacheKey ? base.customProgramCacheKey() : '');
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (sh) => { sh.vertexShader = PED_VS + '\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 pedP; mat3 pedR = pedRot(pedP); vec3 transformed = pedP + pedR * (position - pedP);'); };
    depth.customProgramCacheKey = () => 'ped-depth';
    this.mat = mat; this.depth = depth;
    const cap = this.cap(), add = (key, o) => {
      const geo = pedGeo(o);
      const pose = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage), spr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aPose', pose); geo.setAttribute('aSpread', spr);
      const m = new THREE.InstancedMesh(geo, mat, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = depth; m.count = 0; m.visible = false; m.name = 'ped:' + key;
      scene.add(m);
      this.lookIx[key] = this.looks.length; this.looks.push({ key, mesh: m, pose, spr, n: 0 });
    };
    for (let k = 0; k < PED_NCOMMON; k++) add('c' + k, pedRandomLook(k));
    const L = PED_LOOKS(); for (const k in L) add(k, L[k]);
    // umbrellas in the rain / snow, face masks in 雾霾 / 沙尘: one instanced mesh each, riding on the ped's matrix
    const acc = (parts) => { const m = new THREE.InstancedMesh(mergeParts(parts), new THREE.MeshLambertMaterial({ vertexColors: true }), cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.count = 0; m.visible = false; scene.add(m); return m; };
    this.umb = acc([gpart(new THREE.ConeGeometry(0.78, 0.34, 8, 1, true), 0xffffff, 0.18, 2.38, 0.14, 0, 0.39, 0), gpart(new THREE.ConeGeometry(0.78, 0.02, 8), 0xdddddd, 0.18, 2.2, 0.14, Math.PI, 0.39, 0), box(0.41, 1.62, 0.3, 0.03, 1.5, 0.03, 0x333333), box(0.41, 0.9, 0.3, 0.05, 0.08, 0.12, 0x333333)]);
    this.umb.material.side = THREE.DoubleSide;
    this.mask = acc([box(0, 1.7, 0.195, 0.3, 0.17, 0.03, 0xf1f5f9), box(-0.19, 1.74, 0.07, 0.02, 0.02, 0.24, 0xf1f5f9), box(0.19, 1.74, 0.07, 0.02, 0.02, 0.24, 0xf1f5f9)]);
    this.umbCols = [0xd7263d, 0x1d4ed8, 0x111827, 0x16a34a, 0xf59e0b, 0x7c3aed, 0xf472b6, 0x0f766e].map((c) => new THREE.Color(c));
  },
  // who walks here (street, hour, neighbourhood)
  pickLook(e, park) {
    const h = DayNight.hour, hut = e ? e.cls >= 6 : !!park, shop = e ? pedShop(e) : 0, rush = (h > 7 && h < 9.5) || (h > 17 && h < 19.5), morn = h > 5.5 && h < 10.5;
    const k = weighted([['c', 7], ['daye', hut ? 2.2 : 0.6], ['dama', hut ? 1.4 : 0.6], ['office', rush ? 3 : 0.8], ['tourist', shop === 2 ? 2.6 : shop ? 0.9 : 0.25], ['guide', shop === 2 ? 0.5 : 0],
      ['courier', 0.4], ['student', rush ? 1.2 : 0.25], ['bird', morn ? (hut ? 2 : 0.7) : 0.12]]);
    return k === 'c' ? 'c' + randi(0, PED_NCOMMON - 1) : k === 'office' ? pick(['office', 'office2']) : k === 'dama' ? pick(['dama', 'dama2', 'dama3']) : k;
  },
  free() { for (const p of this.pool) if (!p.active) return p; return null; },
  // street life: free peds first, then the farthest walkers nobody is watching
  take(n) {
    const out = [];
    for (const p of this.pool) { if (out.length >= n) break; if (!p.active) out.push(p); }
    if (out.length < n) {
      const P = Player.pos, cand = this.list.filter((p) => !p.role && !this.seen(p.pos.x, p.pos.z)).sort((a, b) => dist2(b.pos.x, b.pos.z, P.x, P.z) - dist2(a.pos.x, a.pos.z, P.x, P.z));
      for (const p of cand) { if (out.length >= n) break; this.deactivate(p); out.push(p); }
    }
    return out.length >= n ? out : null;
  },
  activate(p, key) {
    p.look = this.lookIx[key] ?? 0; p.active = true; p.removed = false; p.role = null; p.home = null; p.goal = null; p.lead = null;
    p.state = 'walk'; p.t = 0; p.y = 0; p.vy = 0; p.fallA = 0; p.rx = 0; p.rz = 0; p.boost = 0; p.blocked = false; p.moveT = 0; p.mv = 0; p.bob = 0;
    p.speed = key === 'bird' ? rand(0.6, 0.85) : key === 'daye' || key.startsWith('dama') ? rand(0.9, 1.3) : rand(1.15, 1.7);
    p.amp = rand(0.45, 0.6); p.bold = Math.random() < 0.1; p.phone = false; p.talkT = rand(4, 16); p.crossT = 0;
    p.fan = key === 'daye' || key.startsWith('dama'); p.carry = key === 'bird' || key === 'courier';
    p.umbK = Math.random() < 0.65 && !p.carry ? randi(0, 7) : -1; p.maskOn = Math.random() < 0.7 && key !== 'jb';
    if (!this.list.includes(p)) this.list.push(p);
    return p;
  },
  deactivate(p) { p.active = false; p.removed = true; p.role = null; p.home = null; p.lead = null; p.goal = null; const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1); },
  // is (x, z) on screen-ish? (spawns and recycling stay out of sight)
  seen(x, z) {
    const c = camera.position, dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz;
    if (d2 > 118 * 118) return false; if (d2 < 30 * 30) return true;
    return dx * this.cfx + dz * this.cfz > Math.sqrt(d2) * 0.45;
  },
  // a sidewalk spot: { x, z, h, e, k, s, tx, tz }. o: { flat (ignore street busyness), hide, minWalk, filter, shop }
  randomSpot(x, z, minD = 0, maxD = 50, o = null) {
    const C = _cands; let nc = 0, tw = 0;
    for (let t = 0; t < 36 && nc < (o && o.flat ? 1 : 6); t++) {
      const a = rand(TAU), r = Math.sqrt(rand(minD * minD, maxD * maxD)), qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r;
      const n = Roads.nearest(qx, qz, 30, o && o.filter); if (!n || n.e.len < 6) continue;
      const e = n.e;
      if (o && o.minWalk && (e.cls >= 6 || e.C.walk < o.minWalk)) continue;
      const M = pedMask(e); Roads.at(e, n.s, _pp);
      let k = e.cls >= 6 ? 0 : (qx - _pp[0]) * -_pp[3] + (qz - _pp[1]) * _pp[2] > 0 ? 0 : 1;
      if (!M[k]) k = 1 - k; if (!M[k]) continue;
      const s = clamp(n.s, 1, e.len - 1); if (!M[k][pedIdx(e, s)]) continue;
      pedPoint(e, k, s, 0, _pw);
      const d = hyp(_pw[0] - x, _pw[1] - z);
      if (d < minD || d > maxD || (o && o.hide && this.seen(_pw[0], _pw[1]))) continue;
      const c = C[nc++], w = o && o.flat ? 1 : pedWeight(e) * (o && o.shop ? 1 + pedShop(e) * 3 : 1);
      c.e = e; c.k = k; c.s = s; c.x = _pw[0]; c.z = _pw[1]; c.w = w; c.dir = Math.atan2(_pw[2], _pw[3]); tw += w;
    }
    if (!nc) return null;
    let r = Math.random() * tw, c = C[nc - 1];
    for (let i = 0; i < nc; i++) { r -= C[i].w; if (r <= 0) { c = C[i]; break; } }
    Roads.at(c.e, c.s, _pp);
    return { x: c.x, z: c.z, h: c.dir, e: c.e, k: c.k, s: c.s, tx: _pp[2], tz: _pp[3] };
  },
  // nearest walk path to (x, z) (shared result object)
  pathNear(x, z) {
    const n = Roads.nearest(x, z, 45, (e) => e.len > 4); if (!n) return null;
    const e = n.e, M = pedMask(e); Roads.at(e, n.s, _pp);
    let k = e.cls >= 6 ? 0 : (x - _pp[0]) * -_pp[3] + (z - _pp[1]) * _pp[2] > 0 ? 0 : 1;
    if (!M[k]) k = 1 - k; if (!M[k]) return null;
    const m = M[k], i0 = pedIdx(e, n.s); let i = -1;
    for (let d = 0; d < 24 && i < 0; d++) { if (i0 + d < e.pwN && m[i0 + d]) i = i0 + d; else if (i0 - d >= 0 && m[i0 - d]) i = i0 - d; }
    if (i < 0) return null;
    const s = (i + 0.5) * e.len / e.pwN; pedPoint(e, k, s, 0, _pw);
    const r = _near; r.e = e; r.k = k; r.s = s; r.dir = Math.random() < 0.5 ? 1 : -1; r.x = _pw[0]; r.z = _pw[1]; return r;
  },
  laneNear(x, z) {
    const n = Roads.nearest(x, z, 60, (e) => e.C.traffic && e.len > 8); if (!n) return null;
    const e = n.e; Roads.at(e, n.s, _pp);
    const dir = e.oneway ? 1 : (x - _pp[0]) * -_pp[3] + (z - _pp[1]) * _pp[2] > 0 ? 1 : -1, px = _pp[0], pz = _pp[1], tx = _pp[2], tz = _pp[3], off = riderOff(e, dir, n.s), r = _near;
    r.e = e; r.k = 0; r.s = n.s; r.dir = dir; r.x = px - dir * tz * off; r.z = pz + dir * tx * off; return r;
  },
  spawnWalker(minD, maxD, hide) {
    const p = this.free(); if (!p) return null;
    const P = Player.pos;
    if (Math.random() < 0.18) { // strolling a square or a park
      for (let t = 0; t < 10; t++) {
        const a = rand(TAU), r = rand(Math.max(minD, 6), maxD), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, g = Grid.at(x, z);
        if ((g !== GK.PLAZA && g !== GK.PARK) || !pedCellOk(x, z, PED_OPEN) || (hide && this.seen(x, z))) continue;
        this.activate(p, this.pickLook(null, g === GK.PARK)); p.pos.set(x, 0, z); p.lpx = x; p.lpz = z; p.heading = rand(TAU); p.wanderAt(x, z, 14);
        return p;
      }
    }
    // on a shop street / 步行街 half the crowd lands on the shop streets themselves
    const o = this.shopNear && Math.random() < 0.5 ? { hide, filter: PED_SHOPF } : hide ? { hide: true } : null;
    const sp = this.randomSpot(P.x, P.z, minD, maxD, o) || (o && o.filter ? this.randomSpot(P.x, P.z, minD, maxD, hide ? { hide: true } : null) : null); if (!sp) return null;
    this.activate(p, this.pickLook(sp.e)); p.lat = p.latFor(sp.e); p.setPath(sp.e, sp.k, sp.s, Math.random() < 0.5 ? 1 : -1); p.place();
    return p;
  },
  spawnRider(minD, maxD, hide) {
    const p = this.free(); if (!p) return null;
    const sp = this.randomSpot(Player.pos.x, Player.pos.z, minD, maxD, { flat: true, hide, filter: (e) => e.C.traffic && e.cls >= 1 && e.len > 14 });
    if (!sp) return null;
    const e = sp.e, dir = e.oneway ? 1 : sp.k ? -1 : 1;
    this.activate(p, Math.random() < 0.6 ? 'rider' : 'rider2'); p.role = 'rider';
    p.e = e; p.dir = dir; p.s = clamp(sp.s, 3, e.len - 3); p.speed = rand(6, 8.5); p.v = p.speed; p.bold = Math.random() < 0.3; p.state = 'ride';
    p.roff = riderOff(e, dir, p.s); p.placeRider(0); Roads.at(e, p.s, _pp); p.heading = Math.atan2(_pp[2] * dir, _pp[3] * dir); p.lpx = p.pos.x; p.lpz = p.pos.z;
    return p;
  },
  farthest(fn) { let best = null, bd = -1; const P = Player.pos; for (const p of this.list) if (fn(p)) { const d = dist2(p.pos.x, p.pos.z, P.x, P.z); if (d > bd) { bd = d; best = p; } } return best; },
  // keep a crowd around the player: recycle the far ones, top up out of sight
  stream(force) {
    const P = Player.pos, px = P.x, pz = P.z;
    camera.getWorldDirection(this._cf); const fl = hyp(this._cf.x, this._cf.z) || 1; this.cfx = this._cf.x / fl; this.cfz = this._cf.z / fl;
    const jump = force || dist2(px, pz, this.lx, this.lz) > 120 * 120; this.lx = px; this.lz = pz;
    if (jump) { Life.clear(); for (const p of this.list.slice()) this.deactivate(p); }
    for (let i = this.list.length - 1; i >= 0; i--) { const p = this.list[i]; if (!p.home && dist2(p.pos.x, p.pos.z, px, pz) > 140 * 140) this.deactivate(p); }
    if (typeof Weather !== 'undefined' && Weather.cur) this.weather = Weather.cur;
    const h = DayNight.hour, wk = /rain|snow|sand|storm|dust/.test(this.weather) ? 0.55 : /smog|haze|fog/.test(this.weather) ? 0.85 : 1;
    const ne = Roads.nearest(px, pz, 25); this.shopNear = !!ne && PED_SHOPF(ne.e);
    const boost = this.shopNear ? 1.5 : 1;
    const want = Math.round(this.base() * this.hourK(h) * wk * boost), wr = Math.round(this.riderN(h) * (wk < 1 ? 0.7 : 1));
    let walkers = 0, riders = 0; for (const p of this.list) if (p.role === 'rider') riders++; else if (!p.role) walkers++;
    if (jump) {
      for (let t = 0; t < want * 2 && walkers < want; t++) if (t & 1 ? this.spawnWalker(55, 110, false) : this.spawnWalker(4, 55, false)) walkers++;
      for (let t = 0; t < wr * 2 && riders < wr; t++) if (this.spawnRider(8, 105, false)) riders++;
      return;
    }
    if (walkers < want) { if (this.spawnWalker(55, 112, true)) walkers++; if (walkers < want - 6) this.spawnWalker(55, 112, true); }
    else if (walkers > want + 3) { const p = this.farthest((q) => !q.role && !this.seen(q.pos.x, q.pos.z)); if (p) this.deactivate(p); }
    if (riders < wr) this.spawnRider(45, 112, true);
    else if (riders > wr + 1) { const p = this.farthest((q) => q.role === 'rider' && !this.seen(q.pos.x, q.pos.z)); if (p) this.deactivate(p); }
  },
  // e-bikes brake for cars; people crossing jump out of the way of traffic
  carCheck() {
    const cars = Cars.list; if (!cars || !cars.length) return;
    for (const p of this.list) {
      if (p.role === 'rider' && p.state === 'ride') {
        const hx = Math.sin(p.heading), hz = Math.cos(p.heading); let bl = false;
        for (const c of cars) { if (c.removed) continue; const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z, f = dx * hx + dz * hz; if (f < 0.5 || f > 6.5) continue; if (Math.abs(dx * hz - dz * hx) < 1.6) { bl = true; break; } }
        p.blocked = bl;
      } else if (p.state === 'cross' && p.crossRoad) {
        for (const c of cars) {
          const sp = Math.abs(c.speed || 0); if (c.removed || sp < 4) continue;
          const hx = Math.sin(c.heading), hz = Math.cos(c.heading), dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z, f = dx * hx + dz * hz, lat = dx * hz - dz * hx;
          if (f < 0 || f > 2.5 + sp * 0.4 || Math.abs(lat) > 1.8) continue;
          const sd = lat >= 0 ? 1 : -1; p.dive(hz * sd, -hx * sd); break;
        }
      }
    }
  },
  spawnAt(x, z) {
    let p = this.free();
    if (!p) { p = this.farthest((q) => !q.role); if (!p) return null; this.deactivate(p); }
    this.activate(p, this.pickLook(null)); p.pos.set(x, 0, z); p.lpx = x; p.lpz = z; p.rejoin();
    return p;
  },
  panicAround(x, z, r, dur = 3.5) { for (const p of this.list) if (dist2(p.pos.x, p.pos.z, x, z) < r * r) p.panic(x, z, dur); },
  dodge(x, z, vx, vz, r) {
    const sp = hyp(vx, vz) || 1, ux = vx / sp, uz = vz / sp;
    for (const p of this.list) {
      if (p.state === 'dive' || p.state === 'down') continue;
      const dx = p.pos.x - x, dz = p.pos.z - z;
      const ahead = dx * ux + dz * uz;
      if (ahead < -1 || ahead > r + sp * 0.35) continue;
      const lat = dx * uz - dz * ux;
      if (Math.abs(lat) > r) continue;
      const s = lat >= 0 ? 1 : -1;
      p.dive(uz * s, -ux * s);
    }
  },
  update(dt) {
    if (!this.pool.length) return;
    this.clock += dt; this.checkT -= dt;
    const mech = Player.isMech(), P = Player.pos;
    this.px = P.x; this.pz = P.z; this.pr = Player.mode === 'human' ? 0.6 : 0;
    if (this.checkT <= 0) {
      this.checkT = 0.25;
      if (mech) this.panicAround(P.x, P.z, 26, 3);
      else if (Player.mode === 'human') for (const p of this.list) {
        p.talkT -= 0.25;
        if (p.talkT > 0 || p.role || dist2(p.pos.x, p.pos.z, P.x, P.z) > 100) continue;
        p.talkT = rand(14, 30);
        if (p.state === 'walk' || p.state === 'idle' || p.state === 'widle') {
          if (p.look === this.lookIx.bird) { Bubble.say(p, pick(BIRD_LINES), 2.2, 'ped'); Sfx.blip(3.4); Sfx.blip(3.8); }
          else Bubble.say(p, pick(IDLE_LINES), 2.2, 'ped');
        }
      }
    }
    this.carT -= dt; if (this.carT <= 0) { this.carT = 0.2; this.carCheck(); }
    for (let i = 0; i < this.list.length; i++) this.list[i].tick(dt);
    Life.update(dt);
    this.streamT -= dt; if (this.streamT <= 0) { this.streamT = 0.3; this.stream(false); }
    this.draw();
  },
  draw() {
    const o = this._o, L = this.looks, wx = this.weather, wetW = wx === 'rain' || wx === 'snow', dust = wx === 'smog' || wx === 'sand';
    let nu = 0, nm = 0;
    for (let i = 0; i < L.length; i++) L[i].n = 0;
    for (const p of this.list) {
      const l = L[p.look], i = l.n++;
      const umb = wetW && p.umbK >= 0 && !p.role && p.state !== 'down' && p.state !== 'dive' && p.state !== 'panic';
      if (umb) p.armR = -0.5;
      o.position.set(p.pos.x, p.ry, p.pos.z); o.rotation.set(p.rx, p.heading, p.rz, 'YXZ'); o.updateMatrix();
      l.mesh.setMatrixAt(i, o.matrix);
      const a = l.pose.array, j = i * 4; a[j] = p.legL; a[j + 1] = p.legR; a[j + 2] = p.armL; a[j + 3] = p.armR; l.spr.array[i] = p.spread;
      if (umb) { this.umb.setMatrixAt(nu, o.matrix); this.umb.setColorAt(nu++, this.umbCols[p.umbK]); }
      if (dust && p.maskOn && p.role !== 'rider') this.mask.setMatrixAt(nm++, o.matrix);
    }
    for (const [m, n] of [[this.umb, nu], [this.mask, nm]]) {
      m.count = n; m.visible = n > 0;
      if (n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    for (const l of L) {
      const m = l.mesh; m.count = l.n; m.visible = l.n > 0;
      if (!l.n) continue;
      m.instanceMatrix.updateRange.count = l.n * 16; m.instanceMatrix.needsUpdate = true;
      l.pose.updateRange.count = l.n * 4; l.pose.needsUpdate = true; l.spr.updateRange.count = l.n; l.spr.needsUpdate = true;
    }
  },
};

/* ---------------- street life: little scenes that come and go around the player ---------------- */
function lifeSignTex(big, small, bg, fg) {
  const c = mkCanvas(256, 96), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, 246, 86);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 46px ${FONT_CN}`; g.fillText(big, 128, 40); g.font = `700 18px ${FONT_CN}`; g.fillText(small, 128, 76);
  return tex(c);
}
const Life = {
  vigs: [], obst: [], nextT: 2, rr: 0, props: null,
  init() {
    const cartParts = () => [
      box(0, 0.62, 0, 1.6, 0.7, 0.8, 0xe8e2d4), box(0, 1.0, 0, 1.7, 0.06, 0.86, 0xb8bcc2), gpart(PED_CYL, 0x1b1b1b, -0.35, 1.05, 0, 0, 0, 0, 0.32, 0.05, 0.32),
      box(0.4, 1.28, -0.05, 0.75, 0.5, 0.55, 0xcfe3f0), box(0.4, 1.54, -0.05, 0.78, 0.03, 0.58, 0xb8bcc2),
      gpart(PED_CYL, 0x222222, -0.62, 0.22, 0.42, 0, 0, Math.PI / 2, 0.22, 0.06, 0.22), gpart(PED_CYL, 0x222222, 0.62, 0.22, 0.42, 0, 0, Math.PI / 2, 0.22, 0.06, 0.22), gpart(PED_CYL, 0x222222, 0, 0.22, -0.55, 0, 0, Math.PI / 2, 0.22, 0.06, 0.22),
      box(0, 1.9, 0.3, 0.05, 1.8, 0.05, 0x6b7280), gpart(new THREE.ConeGeometry(1.25, 0.45, 8), 0xd7263d, 0, 2.85, 0.3), // 大遮阳伞
      box(0.55, 1.12, 0.2, 0.3, 0.14, 0.3, 0xf6d23a), box(-0.7, 1.1, 0.25, 0.18, 0.1, 0.18, 0x6b3f20), // eggs, sauce
    ];
    const cart = () => {
      const g = new THREE.Group(), body = new THREE.Mesh(mergeParts(cartParts()), MAT.vc); body.castShadow = true;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshLambertMaterial({ map: this.signTex }));
      sign.position.set(0, 0.62, 0.405); g.add(body, sign); g.visible = false; scene.add(g); return g;
    };
    this.signTex = lifeSignTex('煎饼果子', '加蛋 +1 · 薄脆 · 不要香菜的提前说', '#b91c1c', '#fff4d6');
    const chessParts = [box(0, 0.62, 0, 0.8, 0.05, 0.8, 0xd9b77a), box(0, 0.3, 0, 0.12, 0.6, 0.12, 0x6b4a2f), box(0, 0.646, 0, 0.7, 0.01, 0.02, 0x7a4a26), box(0, 0.646, 0, 0.02, 0.01, 0.7, 0x7a4a26),
      box(0, 0.23, 0.82, 0.36, 0.46, 0.36, 0x8a6a44), box(0, 0.23, -0.82, 0.36, 0.46, 0.36, 0x8a6a44)];
    for (let k = 0; k < 14; k++) chessParts.push(gpart(PED_CYL, k % 2 ? 0xb91c1c : 0x111111, rand(-0.32, 0.32), 0.665, (k % 2 ? 1 : -1) * rand(0.05, 0.33), 0, 0, 0, 0.045, 0.03, 0.045));
    const chess = new THREE.Mesh(mergeParts(chessParts), MAT.vc); chess.castShadow = true; chess.visible = false; scene.add(chess);
    const bx = new THREE.Group(), bxb = new THREE.Mesh(mergeParts([box(0, 0.5, 0, 0.55, 0.8, 0.42, 0x1f2328), gpart(PED_CYL, 0x3a3f47, 0, 0.62, 0.215, Math.PI / 2, 0, 0, 0.17, 0.02, 0.17), gpart(PED_CYL, 0x3a3f47, 0, 0.3, 0.215, Math.PI / 2, 0, 0, 0.1, 0.02, 0.1),
      box(0, 0.95, 0, 0.3, 0.08, 0.06, 0x111111), gpart(PED_CYL, 0x111111, -0.2, 0.08, 0, 0, 0, Math.PI / 2, 0.08, 0.05, 0.08), gpart(PED_CYL, 0x111111, 0.2, 0.08, 0, 0, 0, Math.PI / 2, 0.08, 0.05, 0.08)]), MAT.vc);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3d8b })); led.position.set(0, 0.84, 0.215);
    bxb.castShadow = true; bx.add(bxb, led); bx.visible = false; scene.add(bx); bx.led = led;
    this.props = { cart: [cart(), cart()], chess, box: bx };
  },
  clear() { for (const v of this.vigs.slice()) this.end(v); },
  count(type) { let n = 0; for (const v of this.vigs) if (v.type === type) n++; return n; },
  // soft obstacles (carts, chess tables, the player on foot): people step round them
  push(pos, r) {
    for (const o of this.obst) { const dx = pos.x - o.x, dz = pos.z - o.z, d2 = dx * dx + dz * dz, R = r + o.r; if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d; pos.x += dx * k; pos.z += dz * k; } }
    if (Peds.pr > 0 && pos !== Player.pos) { const dx = pos.x - Peds.px, dz = pos.z - Peds.pz, d2 = dx * dx + dz * dz, R = r + Peds.pr; if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d; pos.x += dx * k; pos.z += dz * k; } }
  },
  end(v) {
    const i = this.vigs.indexOf(v); if (i >= 0) this.vigs.splice(i, 1);
    for (const p of v.peds) if (p.active && p.role && p.role !== 'rider') { if (Peds.seen(p.pos.x, p.pos.z)) { p.role = null; p.home = null; p.goal = null; p.lead = null; p.rejoin(); } else Peds.deactivate(p); }
    if (v.prop) v.prop.visible = false;
    if (v.ob) { const j = this.obst.indexOf(v.ob); if (j >= 0) this.obst.splice(j, 1); }
  },
  update(dt) {
    for (let i = this.vigs.length - 1; i >= 0; i--) { const v = this.vigs[i]; this['tick_' + v.type](v, dt); if (v.dead) this.end(v); }
    this.bump();
    this.nextT -= dt; if (this.nextT <= 0) { this.nextT = 1.1; this.maintain(); }
  },
  maintain() {
    const P = Player.pos, h = DayNight.hour;
    // too far, or past their hours (they pack up once you look away)
    for (const v of this.vigs.slice()) if (dist2(v.x, v.z, P.x, P.z) > 165 * 165 || (!this.open(v.type, h, v) && !Peds.seen(v.x, v.z))) this.end(v);
    if (Interiors.cur || !Grid.kind) return;
    switch ((this.rr = (this.rr + 1) % 5)) {
      case 0: if (!this.count('dance') && this.open('dance', h)) this.spawnDance(h < 12); break;
      case 1: if (this.count('jb') < (LOWQ ? 1 : 2) && this.open('jb', h)) this.spawnVendor('jb'); break;
      case 2: if (!this.count('hulu') && this.open('hulu', h)) this.spawnVendor('hulu'); break;
      case 3: if (!this.count('chess') && this.open('chess', h)) this.spawnChess(); break;
      case 4: if (!this.count('cg') && this.open('cg', h) && Math.random() < 0.35) this.spawnCg(); break;
    }
  },
  // opening hours: 广场舞 after dinner, 太极 at dawn, 煎饼 from breakfast to 夜宵, chess by daylight
  open(type, h, v) {
    const wx = Peds.weather;
    if ((type === 'dance' || type === 'chess') && (wx === 'rain' || wx === 'snow' || wx === 'sand')) return false;
    switch (type) {
      case 'dance': return v ? (v.taiji ? h >= 6 && h < 9.5 : h >= 18.5 && h < 22.8) : (h >= 18.5 && h < 22.5) || (h >= 6 && h < 9);
      case 'jb': return h >= 6 && h < 23.5;
      case 'hulu': return h >= 9 && h < 21.5;
      case 'chess': return h >= 8 && h < 19;
      default: return h >= 9 && h < 20;
    }
  },
  // the player's car / mech smashes stalls; on foot you step round them
  bump() {
    if (!this.obst.length) return;
    const P = Player; let x, z, r, sp;
    if (P.mode === 'car' && P.car) { x = P.car.pos.x; z = P.car.pos.z; r = 2.2; sp = hyp(P.car.vel.x, P.car.vel.z); }
    else if (P.isMech()) { x = P.pos.x; z = P.pos.z; r = 3.2; sp = 9; }
    else { if (P.mode === 'human' && !Interiors.cur) this.push(P.pos, 0.55); return; }
    if (sp < 4) return;
    for (const v of this.vigs) if (v.ob && !v.fly && dist2(x, z, v.ob.x, v.ob.z) < (r + v.ob.r) ** 2) this.wreck(v, x, z, sp);
  },
  wreck(v, x, z, sp) {
    const dx = v.ob.x - x, dz = v.ob.z - z, l = hyp(dx, dz) || 1;
    v.fly = { vx: dx / l * (4 + sp * 0.4), vz: dz / l * (4 + sp * 0.4), vy: 6 + sp * 0.2, w: rand(-6, 6), t: 4 };
    const j = this.obst.indexOf(v.ob); if (j >= 0) this.obst.splice(j, 1); v.ob = null;
    FX.chunks(v.prop.position.x, 1, v.prop.position.z, 10, [0xe8e2d4, 0xd7263d, 0xf6d23a, 0xd9b77a]); Sfx.crash(sp);
    for (const p of v.peds) { if (p.active && p.state !== 'down') p.panic(x, z, 5); }
    const o = v.peds[0]; if (o && o.active) Bubble.say(o, v.type === 'chess' ? '我的棋盘！！' : '我的摊儿！！赔钱！', 2, 'ped');
    G.crime(0.1);
  },
  flyTick(v, dt) {
    const f = v.fly, g = v.prop;
    f.t -= dt; f.vy -= 22 * dt; g.position.x += f.vx * dt; g.position.z += f.vz * dt; g.position.y = Math.max(groundH(g.position.x, g.position.z), g.position.y + f.vy * dt);
    if (g.position.y <= groundH(g.position.x, g.position.z) + 0.01) { f.vx *= 0.9; f.vz *= 0.9; f.w *= 0.9; }
    g.rotation.x += f.w * dt; g.rotation.z += f.w * 0.6 * dt;
    if (f.t <= 0) v.dead = true;
  },

  /* ---- 广场舞 (evening) / 晨练太极 (morning) ---- */
  spawnDance(taiji) {
    const P = Player.pos, n = taiji ? (LOWQ ? 5 : 7) : (LOWQ ? 8 : 12), cols = taiji ? 3 : 4;
    for (let t = 0; t < 30; t++) {
      const a = rand(TAU), r = rand(35, 125), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, g = Grid.at(x, z);
      if ((g !== GK.PLAZA && g !== GK.PARK) || (r < 80 && Peds.seen(x, z))) continue;
      const fh = rand(TAU), fx = Math.sin(fh), fz = Math.cos(fh), rx = -fz, rz = fx, spots = [[x + fx * 2.6, z + fz * 2.6, fh + Math.PI]]; // #0 领舞 faces the crowd
      for (let i = 0; i < n - 1; i++) { const lx = ((i % cols) - (cols - 1) / 2) * 1.8, lz = -Math.floor(i / cols) * 1.8; spots.push([x + rx * lx + fx * lz, z + rz * lx + fz * lz, fh]); }
      const bx = x + fx * 3.8 + rx * 2.2, bz = z + fz * 3.8 + rz * 2.2;
      if (!pedCellOk(bx, bz, PED_OPEN) || !spots.every((s) => pedCellOk(s[0], s[1], PED_OPEN))) continue;
      const ps = Peds.take(n); if (!ps) return;
      const v = { type: 'dance', taiji, x, z, fh, fx, fz, rx, rz, peds: ps, bpm: taiji ? 30 : 122, talkT: 3, noteT: 0, prop: this.props.box };
      ps.forEach((p, i) => {
        Peds.activate(p, taiji ? (i === 0 ? 'taiji' : pick(['taiji', 'taiji', 'daye', 'c' + randi(0, PED_NCOMMON - 1)])) : i % 6 === 5 ? 'daye' : pick(['dama', 'dama2', 'dama3']));
        p.role = 'dance'; p.home = { x: spots[i][0], z: spots[i][1], h: spots[i][2], st: 'dance' }; p.state = 'dance';
        p.pos.set(spots[i][0], 0, spots[i][1]); p.lpx = p.pos.x; p.lpz = p.pos.z; p.heading = spots[i][2];
      });
      const B = v.prop; B.position.set(bx, groundH(bx, bz), bz); B.rotation.set(0, Math.atan2(x - bx, z - bz), 0); B.visible = true;
      this.vigs.push(v); return;
    }
  },
  tick_dance(v, dt) {
    const bt = Peds.clock * v.bpm / 60, mv = Math.floor(bt / 8) % 4, ph = bt * Math.PI, P = Player.pos, near = dist2(v.x, v.z, P.x, P.z) < 45 * 45;
    let alive = 0;
    for (const p of v.peds) {
      if (!p.active || p.role !== 'dance') continue;
      alive++;
      if (p.state !== 'dance') continue;
      const H = p.home, lead = H.h !== v.fh ? -1 : 1;
      let ox = 0, oz = 0, hd = H.h, lL = 0, lR = 0, aL = 0, aR = 0, sp = 0.1, hop = 0;
      if (v.taiji) { const q = bt * 0.5, s = Math.sin(q); aL = -1.25 + s * 0.45; aR = -1.25 - s * 0.45; sp = 0.35 + 0.3 * Math.sin(q * 0.5); hd += Math.sin(q * 0.25) * 0.7; lL = s * 0.18; lR = -lL; ox = Math.sin(q * 0.25) * 0.3; }
      else switch (mv) {
        case 0: { const s = Math.sin(ph); ox = Math.sin(ph * 0.5) * 0.45 * lead; lL = Math.max(0, s) * -0.35; lR = Math.max(0, -s) * -0.35; aL = -1.0 - 0.8 * s; aR = -1.0 + 0.8 * s; sp = 0.35; break; }
        case 1: aL = aR = -2.8 + 0.25 * Math.sin(ph * 2); sp = 0.25 + 0.2 * Math.abs(Math.sin(ph)); hop = Math.abs(Math.sin(ph)) * 0.08; lL = -hop * 2; break;
        case 2: hd += ((bt % 8) / 8) * TAU; sp = 1.3; aL = aR = -0.2 + 0.25 * Math.sin(ph); lL = Math.sin(ph) * 0.3; lR = -lL; break;
        default: { const s = Math.sin(ph); oz = Math.sin(ph * 0.25) * 0.6; lL = 0.45 * s; lR = -lL; aL = -lL * 1.6 - 0.3; aR = lL * 1.6 - 0.3; }
      }
      p.pos.x = H.x + v.rx * ox + v.fx * oz * lead; p.pos.z = H.z + v.rz * ox + v.fz * oz * lead; p.heading = hd;
      p.legL = lL; p.legR = lR; p.armL = aL; p.armR = aR; p.spread = sp; p.bob = hop; p.rx = 0; p.rz = 0;
    }
    if (!alive) { v.dead = true; return; }
    v.prop.led.material.color.setHSL((bt / 8) % 1, 1, 0.55);
    if (near) {
      v.noteT -= dt; if (v.noteT <= 0) { v.noteT = v.taiji ? 1.6 : 0.55; Floaters.add(v.prop.position.x + rand(-0.4, 0.4), 1.6, v.prop.position.z, pick(['♪', '♫', '♬']), 'fl-line', 1.4); }
      v.talkT -= dt; if (v.talkT <= 0) { v.talkT = rand(6, 11); const p = pick(v.peds); if (p.active && p.state === 'dance') Bubble.say(p, pick(v.taiji ? TAIJI_LINES : DANCE_LINES), 2.2, 'ped'); }
    }
  },

  /* ---- 煎饼果子 cart / 糖葫芦 vendor ---- */
  spawnVendor(type) {
    const P = Player.pos, cart = type === 'jb' ? this.props.cart.find((c) => !c.visible) : null;
    if (type === 'jb' && !cart) return;
    for (let t = 0; t < 4; t++) {
      const sp = Peds.randomSpot(P.x, P.z, 40, 115, { hide: true, minWalk: 3, shop: type === 'hulu' });
      if (!sp) continue;
      const sd = sp.k ? -1 : 1, tx = sp.tx, tz = sp.tz, ox = -tz * sd, oz = tx * sd; // (ox, oz): away from the road
      const cx = sp.x + ox * 0.2, cz = sp.z + oz * 0.2, hx = cx + ox * (cart ? 1.05 : 0.3), hz = cz + oz * (cart ? 1.05 : 0.3);
      if (cart && (!pedCellOk(cx + tx * 0.8, cz + tz * 0.8) || !pedCellOk(cx - tx * 0.8, cz - tz * 0.8))) continue;
      if (!pedCellOk(hx, hz)) continue;
      const ps = Peds.take(1); if (!ps) return;
      const p = Peds.activate(ps[0], type), face = Math.atan2(-ox, -oz);
      p.role = 'vend'; p.home = { x: hx, z: hz, h: face, st: 'vend' }; p.state = 'vend'; p.pos.set(hx, 0, hz); p.lpx = hx; p.lpz = hz; p.heading = face;
      const v = { type, peds: [p], x: cx, z: cz, e: sp.e, k: sp.k, s: sp.s, ox, oz, face, st: 'vend', t: 0, soldT: 0, nearT: 0, talkT: rand(2, 5), prop: cart, ob: null };
      if (cart) this.placeCart(v, cx, cz);
      this.vigs.push(v); return;
    }
  },
  placeCart(v, x, z) {
    const c = v.prop; c.position.set(x, groundH(x, z), z); c.rotation.set(0, Math.atan2(-v.ox, -v.oz), 0); c.visible = true; v.x = x; v.z = z;
    if (!v.ob) { v.ob = { x, z, r: 0.85 }; this.obst.push(v.ob); } else { v.ob.x = x; v.ob.z = z; }
  },
  tick_jb(v, dt) { this.tickVend(v, dt); },
  tick_hulu(v, dt) { this.tickVend(v, dt); },
  tickVend(v, dt) {
    if (v.fly) return this.flyTick(v, dt);
    const p = v.peds[0];
    if (!p.active || p.role !== 'vend') { v.dead = true; return; }
    if (v.st === 'flee') return this.fleeTick(v, p, dt);
    if (!v.prop) { v.x = p.pos.x; v.z = p.pos.z; }
    const P = Player, d2 = dist2(P.pos.x, P.pos.z, p.pos.x, p.pos.z);
    v.talkT -= dt;
    if (v.talkT <= 0 && d2 < 24 * 24 && p.state === 'vend') { v.talkT = rand(5, 9); Bubble.say(p, pick(VEND_LINES[v.type]), 2.2, 'ped'); }
    // stand by the stall for a second and you get served
    if (P.mode === 'human' && p.state === 'vend' && d2 < (v.prop ? 3.4 : 2.4) ** 2 && hyp(P.vel.x, P.vel.z) < 1.5) {
      v.nearT += dt;
      if (v.nearT > 1.1 && Peds.clock > v.soldT) { v.soldT = Peds.clock + 40; this.sell(v, p); }
    } else v.nearT = 0;
  },
  sell(v, p) {
    const jb = v.type === 'jb', price = jb ? 8 : 5, heal = jb ? 30 : 15;
    if (Player.hp >= Player.maxHp - 1) { Bubble.say(p, jb ? '吃饱了？下回再来您呐！' : '看看不买也没事儿', 1.8, 'ped'); return; }
    if (G.money < price) { Bubble.say(p, '没钱？先赊着……开玩笑的！', 1.8, 'ped'); return; }
    G.addMoney(-price); Player.hp = Math.min(Player.maxHp, Player.hp + heal);
    Floaters.add(p.pos.x, 3.2, p.pos.z, (jb ? '煎饼果子 · 加俩蛋' : '冰糖葫芦') + '  +' + heal + ' 血  -¥' + price, 'fl-bonus', 1.8);
    Bubble.say(p, jb ? '您拿好，趁热吃！' : '拿好喽，别粘手！', 1.8, 'ped'); Sfx.buy();
  },
  // 城管 in sight: grab the cart and leg it down the sidewalk
  flee(v, fromX, fromZ) {
    const p = v.peds[0]; if (v.st !== 'vend' || p.state !== 'vend' || v.fly || Peds.clock < (v.calmT || 0)) return false;
    Roads.at(v.e, v.s, _pp);
    let fd = (v.x - fromX) * _pp[2] + (v.z - fromZ) * _pp[3] >= 0 ? 1 : -1;
    const M = pedMask(v.e)[v.k], ok = (d) => { const a = v.s + d * 3; return M && a > 0 && a < v.e.len && M[pedIdx(v.e, a)]; };
    if (!ok(fd)) fd = -fd; // cornered: run the other way, past them
    if (!ok(fd)) return false;
    v.st = 'flee'; v.t = rand(6, 8); v.fd = fd; v.calmT = Peds.clock + 25;
    p.state = 'push'; Bubble.say(p, pick(FLEE_LINES), 2, 'ped');
    return true;
  },
  fleeTick(v, p, dt) {
    if (p.state !== 'push') return this.settle(v, p, false); // scared off by something worse: they'll come back to the cart
    const M = pedMask(v.e)[v.k], s = v.s + v.fd * 3.2 * dt, a = s + v.fd * 1.5;
    v.t -= dt;
    const stop = v.t <= 0 || !M || a <= 0 || a >= v.e.len || !M[pedIdx(v.e, a)];
    if (!stop) v.s = s;
    pedPoint(v.e, v.k, v.s, v.k ? -0.2 : 0.2, _pw);
    const tx = _pw[2] * v.fd, tz = _pw[3] * v.fd;
    v.x = _pw[0]; v.z = _pw[1];
    if (v.prop) { v.prop.position.set(v.x, groundH(v.x, v.z), v.z); v.prop.rotation.set(0, Math.atan2(tx, tz) + Math.PI / 2, 0); if (v.ob) { v.ob.x = v.x; v.ob.z = v.z; } }
    p.pos.x = _pw[0] - tx * (v.prop ? 1.3 : 0); p.pos.z = _pw[1] - tz * (v.prop ? 1.3 : 0); p.heading = Math.atan2(tx, tz);
    if (stop) this.settle(v, p, true);
  },
  // set up shop again right here
  settle(v, p, move) {
    const hx = v.x + v.ox * (v.prop ? 1.05 : 0.1), hz = v.z + v.oz * (v.prop ? 1.05 : 0.1);
    if (v.prop) this.placeCart(v, v.x, v.z);
    p.home.x = hx; p.home.z = hz; v.st = 'vend';
    if (move) { p.pos.set(hx, 0, hz); p.heading = v.face; p.state = 'vend'; }
  },

  /* ---- 胡同象棋: two old boys on stools, a couple of kibitzers ---- */
  spawnChess() {
    const P = Player.pos;
    for (let t = 0; t < 6; t++) {
      const sp = Peds.randomSpot(P.x, P.z, 35, 110, { hide: true, flat: true, filter: (e) => e.cls === 6 && e.len > 14 });
      if (!sp) continue;
      const e = sp.e, tx = sp.tx, tz = sp.tz, sd = Math.random() < 0.5 ? 1 : -1, off = Math.max(0.5, e.hw - 0.8);
      const cx = sp.x - tz * off * sd, cz = sp.z + tx * off * sd, ix = tz * sd, iz = -tx * sd; // (ix, iz): toward the lane centre
      const seats = [[cx + tx * 0.82, cz + tz * 0.82, Math.atan2(-tx, -tz), 'sit'], [cx - tx * 0.82, cz - tz * 0.82, Math.atan2(tx, tz), 'sit'],
        [cx + ix * 0.95 + tx * 0.45, cz + iz * 0.95 + tz * 0.45, Math.atan2(-ix, -iz), 'stand'], [cx + ix * 1.0 - tx * 0.5, cz + iz * 1.0 - tz * 0.5, Math.atan2(-ix, -iz), 'stand']];
      const n = LOWQ ? 3 : 4;
      if (!pedCellOk(cx, cz) || !seats.slice(0, n).every((s) => pedCellOk(s[0], s[1]))) continue;
      const ps = Peds.take(n); if (!ps) return;
      ps.forEach((p, i) => {
        const s = seats[i];
        Peds.activate(p, i < 2 ? pick(['daye', 'bird', 'c' + randi(0, PED_NCOMMON - 1)]) : pick(['daye', 'c' + randi(0, PED_NCOMMON - 1), 'dama']));
        p.role = 'chess'; p.home = { x: s[0], z: s[1], h: s[2], st: s[3] }; p.state = s[3]; p.pos.set(s[0], 0, s[1]); p.lpx = s[0]; p.lpz = s[1]; p.heading = s[2]; p.phone = false;
      });
      const c = this.props.chess; c.position.set(cx, groundH(cx, cz), cz); c.rotation.set(0, Math.atan2(tx, tz), 0); c.visible = true;
      const v = { type: 'chess', peds: ps, x: cx, z: cz, prop: c, ob: { x: cx, z: cz, r: 0.6 }, moveT: 2, talkT: 3 };
      this.obst.push(v.ob); this.vigs.push(v); return;
    }
  },
  tick_chess(v, dt) {
    if (v.fly) return this.flyTick(v, dt);
    let alive = 0; for (const p of v.peds) if (p.active && p.role === 'chess') alive++;
    if (!alive) { v.dead = true; return; }
    const d2 = dist2(v.x, v.z, Player.pos.x, Player.pos.z);
    v.moveT -= dt;
    if (v.moveT <= 0) { v.moveT = rand(2, 5); const p = v.peds[randi(0, 1)]; if (p.active && p.state === 'sit') { p.moveT = 0.7; if (d2 < 14 * 14) Sfx.click(); } }
    v.talkT -= dt;
    if (v.talkT <= 0 && d2 < 24 * 24) { v.talkT = rand(5, 9); const p = pick(v.peds); if (p.active && p.role === 'chess' && (p.state === 'sit' || p.state === 'stand')) Bubble.say(p, pick(CHESS_LINES), 2, 'ped'); }
  },

  /* ---- 城管 on patrol, in pairs; they head for the nearest stall ---- */
  spawnCg() {
    const P = Player.pos, vend = this.vigs.find((v) => (v.type === 'jb' || v.type === 'hulu') && v.st === 'vend' && !v.fly);
    const c = vend ? vend.peds[0].pos : P;
    const sp = Peds.randomSpot(c.x, c.z, vend ? 30 : 45, vend ? 70 : 110, { hide: true, minWalk: 2 });
    if (!sp) return;
    const ps = Peds.take(2); if (!ps) return;
    const [L, F] = ps.map((p) => Peds.activate(p, 'cg'));
    L.role = F.role = 'cg'; L.speed = F.speed = 1.3; L.lat = 0; L.bold = F.bold = false;
    const dir = vend ? ((c.x - sp.x) * sp.tx + (c.z - sp.z) * sp.tz >= 0 ? 1 : -1) : Math.random() < 0.5 ? 1 : -1;
    L.setPath(sp.e, sp.k, sp.s, dir); L.place(); L.goal = vend ? c : null;
    F.state = 'follow'; F.lead = L; F.pos.set(L.pos.x - Math.sin(L.heading) * 1.2, 0, L.pos.z - Math.cos(L.heading) * 1.2); F.lpx = F.pos.x; F.lpz = F.pos.z; F.heading = L.heading;
    this.vigs.push({ type: 'cg', peds: [L, F], x: L.pos.x, z: L.pos.z, talkT: 5, life: 150 });
  },
  tick_cg(v, dt) {
    const [L, F] = v.peds;
    if (!L.active || L.role !== 'cg' || (v.life -= dt) <= 0) { v.dead = true; return; }
    if (F.active && F.role === 'cg' && F.state === 'walk') { F.state = 'follow'; F.lead = L; }
    v.x = L.pos.x; v.z = L.pos.z;
    for (const w of this.vigs) {
      if ((w.type !== 'jb' && w.type !== 'hulu') || w.st !== 'vend' || w.fly) continue;
      const q = w.peds[0]; if (!q.active || dist2(q.pos.x, q.pos.z, L.pos.x, L.pos.z) > 15 * 15) continue;
      if (this.flee(w, L.pos.x, L.pos.z)) { Bubble.say(L, pick(CG_LINES), 2, 'ped'); L.goal = null; }
    }
    v.talkT -= dt;
    if (v.talkT <= 0 && dist2(v.x, v.z, Player.pos.x, Player.pos.z) < 20 * 20) { v.talkT = rand(8, 14); Bubble.say(L, pick(['文明城市，人人有责', '巡逻呢，您忙您的', '这车别乱停啊']), 2, 'ped'); }
  },
};
