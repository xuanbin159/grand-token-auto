/* ============================================================
   老北京 generators: 胡同 blocks of 四合院 + 老字号 shop rows,
   and the landmarks — 故宫, 景山, 钟鼓楼, 前门, 天坛, 什刹海,
   北海白塔, 雍和宫, 北京站, 东南角楼, 德胜门, 奥林匹克公园,
   永定门, CBD 中国尊, 798, 朝阳公园 …
   ============================================================ */
const HUTONG_NAMES = ['帽儿胡同', '菊儿胡同', '雨儿胡同', '东棉花胡同', '北兵马司', '黑芝麻胡同', '沙井胡同', '板厂胡同',
  '史家胡同', '东四三条', '烟袋斜街', '大金丝胡同', '南锣鼓巷', '方家胡同', '炒豆胡同', '小经厂胡同'];
function hutongSignAtlas() {
  const c = mkCanvas(1024, 256), g = c.getContext('2d');
  HUTONG_NAMES.forEach((n, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    rrect(g, x + 4, y + 4, 248, 56, 6); g.fillStyle = '#1d3f8f'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#f5f5f5'; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, n, 220, 34, 900); g.fillText(n, x + 128, y + 34);
  });
  return tex(c);
}
const BJB = { signs: null, bikes: [], signQuads: [], lanterns: [], trees: [], cypress: [], boats: [], neonBoxes: [], incense: [], barMat: null };

/* ---------- small helpers ---------- */
function acc3() { return { brick: new GeoAcc(), roof: new GeoAcc(), lattice: new GeoAcc(), red: new GeoAcc(), yellow: new GeoAcc(), green: new GeoAcc(), blue: new GeoAcc(), white: new GeoAcc(), marble: new GeoAcc(), grey: new GeoAcc(), shops: BJ.oldShopMats.map(() => new GeoAcc()) }; }
function flushAcc(A) {
  const M = BJ.mats;
  const pairs = [['brick', M.brick], ['roof', M.roofGrey], ['lattice', M.lattice], ['red', M.redWall], ['yellow', M.roofYellow], ['green', M.roofGreen], ['blue', M.roofBlue], ['white', M.white], ['marble', M.marble], ['grey', M.greyBrick]];
  for (const [k, m] of pairs) if (!A[k].empty) Build.add(m, A[k].geo());
  A.shops.forEach((a, k) => { if (!a.empty) Build.add(BJ.oldShopMats[k], a.geo()); });
}
// a front panel (single quad) with u-range [u0,u1] of the texture, facing +z (s) / -z (n) / +x (e) / -x (w)
function panel(acc, face, x0, y0, z0, x1, y1, z1, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  if (face === 's') acc.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  else if (face === 'n') acc.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  else if (face === 'e') acc.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
  else acc.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
}
// lattice panel whose u tiles every 4 world units (one bay)
function latticeFace(acc, face, x0, y0, z0, x1, y1, z1) {
  const len = face === 'e' || face === 'w' ? z1 - z0 : x1 - x0, o = (face === 'e' || face === 'w' ? z0 : x0) / 16;
  panel(acc, face, x0, y0, z0, x1, y1, z1, o, o + len / 16, 0, 1);
}
function lantern(parts, x, y, z, s = 1) {
  parts.push(gpart(new THREE.SphereGeometry(0.34 * s, 8, 6), 0xe0301e, x, y, z, 0, 0, 0, 1, 1.15, 1));
  parts.push(box(x, y + 0.42 * s, z, 0.24 * s, 0.1 * s, 0.24 * s, 0xf0c040), box(x, y - 0.44 * s, z, 0.06 * s, 0.24 * s, 0.06 * s, 0xf0c040));
}
function addSign(x, y, z, face, idx) { BJB.signQuads.push({ x, y, z, face, idx: idx ?? randi(0, HUTONG_NAMES.length - 1) }); }
function addBike(x, z, ry) { BJB.bikes.push({ x, z, ry }); }

/* ---------- 四合院 ---------- */
function siheyuan(A, x0, z0, x1, z1, gate, blk, props) {
  const w = x1 - x0, d = z1 - z0, t = 0.35, wh = 2.7, y0 = 0.3;
  const gw = 1.9, gx = gate === 's' ? x1 - 2.8 : x0 + 2.8;
  const zg = gate === 's' ? z1 : z0, zb = gate === 's' ? z0 : z1;
  // outer walls
  boxW(A.brick, x0, y0, z0, x0 + t, y0 + wh, z1);
  boxW(A.brick, x1 - t, y0, z0, x1, y0 + wh, z1);
  if (gate === 's') { boxW(A.brick, x0, y0, z0, x1, y0 + wh, z0 + t); boxW(A.brick, x0, y0, z1 - t, gx - gw / 2, y0 + wh, z1); boxW(A.brick, gx + gw / 2, y0, z1 - t, x1, y0 + wh, z1); }
  else { boxW(A.brick, x0, y0, z1 - t, x1, y0 + wh, z1); boxW(A.brick, x0, y0, z0, gx - gw / 2, y0 + wh, z0 + t); boxW(A.brick, gx + gw / 2, y0, z0, x1, y0 + wh, z0 + t); }
  // wall copings: a thin grey tile ridge on top
  for (const [a, b2, c, e] of [[x0, z0, x0 + t, z1], [x1 - t, z0, x1, z1]]) gableRoof(A.roof, (a + c) / 2, (b2 + e) / 2, e - b2, 0.6, y0 + wh, 0.35, 1, 0.12);
  // 正房 main house (opposite the gate), faces the courtyard
  const mh = 3.1, md = Math.min(3.6, d * 0.34);
  const mz0 = gate === 's' ? z0 + t : z1 - t - md, mz1 = mz0 + md;
  boxW(A.brick, x0 + 0.6, y0, mz0, x1 - 0.6, y0 + mh, mz1, 2, 'nsew');
  latticeFace(A.lattice, gate === 's' ? 's' : 'n', x0 + 0.9, y0, mz0 - 0.02, x1 - 0.9, y0 + mh - 0.1, mz1 + 0.02);
  gableRoof(A.roof, (x0 + x1) / 2, (mz0 + mz1) / 2, w - 1.2, md, y0 + mh, 1.7, 0, 0.5);
  // 倒座房 on the gate side, west of the gate
  const dd = 2.5, dz0 = gate === 's' ? z1 - t - dd : z0 + t, dz1 = dz0 + dd, dxe = gx - gw / 2 - 0.4;
  if (dxe - x0 > 3.5) {
    boxW(A.brick, x0 + 0.6, y0, dz0, dxe, y0 + 2.6, dz1, 2, 'nsew');
    latticeFace(A.lattice, gate === 's' ? 'n' : 's', x0 + 0.9, y0, dz0 - 0.02, dxe - 0.3, y0 + 2.5, dz1 + 0.02);
    gableRoof(A.roof, (x0 + 0.6 + dxe) / 2, (dz0 + dz1) / 2, dxe - x0 - 0.6, dd, y0 + 2.6, 1.3, 0, 0.4);
  }
  // 厢房 side houses when the court is wide enough
  const sy0 = gate === 's' ? mz1 + 0.8 : dz1 + 0.8, sy1 = gate === 's' ? dz0 - 0.8 : mz0 - 0.8;
  if (w >= 11 && sy1 - sy0 > 3.2) {
    const sd = 2.4;
    boxW(A.brick, x0 + t, y0, sy0, x0 + t + sd, y0 + 2.6, sy1, 2, 'nsew'); latticeFace(A.lattice, 'e', x0 + t, y0, sy0 + 0.3, x0 + t + sd + 0.02, y0 + 2.5, sy1 - 0.3);
    gableRoof(A.roof, x0 + t + sd / 2, (sy0 + sy1) / 2, sy1 - sy0, sd, y0 + 2.6, 1.2, 1, 0.4);
    boxW(A.brick, x1 - t - sd, y0, sy0, x1 - t, y0 + 2.6, sy1, 2, 'nsew'); latticeFace(A.lattice, 'w', x1 - t - sd - 0.02, y0, sy0 + 0.3, x1 - t, y0 + 2.5, sy1 - 0.3);
    gableRoof(A.roof, x1 - t - sd / 2, (sy0 + sy1) / 2, sy1 - sy0, sd, y0 + 2.6, 1.2, 1, 0.4);
  }
  // 宅门 gatehouse with red doors, stone 门墩 and a pair of lanterns
  const gz0 = gate === 's' ? z1 - 2.0 : z0, gz1 = gz0 + 2.0, face = gate;
  boxW(A.brick, gx - gw / 2 - 0.5, y0, gz0, gx - gw / 2, y0 + 3.0, gz1, 2, 'nsew'); boxW(A.brick, gx + gw / 2, y0, gz0, gx + gw / 2 + 0.5, y0 + 3.0, gz1, 2, 'nsew');
  gableRoof(A.roof, gx, (gz0 + gz1) / 2, gw + 1.0, 2.0, y0 + 3.0, 1.2, 0, 0.45);
  const fz = face === 's' ? z1 - 0.5 : z0 + 0.5, fo = face === 's' ? 0.06 : -0.06;
  props.push(box(gx - gw / 4, y0 + 1.15, fz, gw / 2 - 0.04, 2.3, 0.12, 0x9b1c14), box(gx + gw / 4, y0 + 1.15, fz, gw / 2 - 0.04, 2.3, 0.12, 0x9b1c14));
  props.push(box(gx, y0 + 2.45, fz + fo, gw + 0.1, 0.25, 0.1, 0x2e5a4a));
  for (const s of [-1, 1]) props.push(box(gx + s * (gw / 2 + 0.28), y0 + 0.25, face === 's' ? z1 + 0.25 : z0 - 0.25, 0.42, 0.5, 0.55, 0x9a9690));
  BJB.lanterns.push([gx - gw / 2 - 0.25, y0 + 2.5, face === 's' ? z1 + 0.35 : z0 - 0.35], [gx + gw / 2 + 0.25, y0 + 2.5, face === 's' ? z1 + 0.35 : z0 - 0.35]);
  // courtyard tree (枣树 / 石榴 / 海棠) — the instanced 国槐 does the job
  if (w > 8) BJB.trees.push([blk, (x0 + x1) / 2 + rand(-1, 1), (sy0 + sy1) / 2 + rand(-0.6, 0.6), rand(0.7, 0.95)]);
  addSolid(blk, { x0, z0, x1, z1, h: 5.2, kind: 'bld' });
}
/* ---------- two-storey 老字号 shop row, front facing `face` ---------- */
function shopRow(A, x0, z0, x1, z1, face, blk, props) {
  const len = x1 - x0, n = Math.max(1, Math.round(len / randi(10, 13)));
  const sw = len / n, y0 = 0.3;
  for (let k = 0; k < n; k++) {
    const a = x0 + k * sw, b2 = a + sw, h = rand(4.9, 5.7);
    boxW(A.brick, a + 0.05, y0, z0, b2 - 0.05, y0 + h, z1, 2, face === 's' ? 'new' : 'sew');
    const m = randi(0, A.shops.length - 1), half = Math.random() < 0.5 ? 0 : 0.5;
    panel(A.shops[m], face, a + 0.1, y0, z0 - 0.03, b2 - 0.1, y0 + h - 0.05, z1 + 0.03, half, half + 0.5, 0, 1);
    gableRoof(A.roof, (a + b2) / 2, (z0 + z1) / 2, sw - 0.1, z1 - z0, y0 + h, 1.7, 0, 0.55);
    const fz = face === 's' ? z1 + 0.5 : z0 - 0.5;
    BJB.lanterns.push([a + sw * 0.22, y0 + h - 0.6, fz], [b2 - sw * 0.22, y0 + h - 0.6, fz]);
    // awning / 幌子 banner
    props.push(box((a + b2) / 2, y0 + 2.75, face === 's' ? z1 + 0.35 : z0 - 0.35, sw - 1.2, 0.12, 0.7, 0x5a3a24));
    if (Math.random() < 0.5) props.push(box(a + 1.1, y0 + 2.0, face === 's' ? z1 + 0.6 : z0 - 0.6, 0.06, 1.6, 0.5, pick([0xc0392b, 0x1f3a93, 0xd4a017])));
    if (Math.random() < 0.35) addBike(a + rand(1, sw - 1), face === 's' ? z1 + 1.2 : z0 - 1.2, face === 's' ? rand(-0.3, 0.3) + Math.PI / 2 : rand(-0.3, 0.3) - Math.PI / 2);
  }
  addSolid(blk, { x0, z0, x1, z1, h: 7.5, kind: 'bld' });
}
/* ---------- a whole 胡同 block ---------- */
function genHutong(b, o = {}) {
  const r = o.rect || b.rect, A = acc3(), props = [];
  const X0 = r.x0 + 2.2, X1 = r.x1 - 2.2, Z0 = r.z0 + 2.2, Z1 = r.z1 - 2.2, H = 3.2;
  const shops = o.shops ?? (Math.random() < 0.8);
  const rows = [];
  let z = Z0;
  if (shops) { rows.push(['shopN', z, z + 6]); z += 6; }
  const nCourt = o.courts || (shops ? 2 : 3), nLanes = shops ? nCourt : nCourt - 1, cd = ((Z1 - Z0) - (shops ? 12 : 0) - H * nLanes) / nCourt;
  // lanes between rows
  const lanes = [];
  if (shops) { lanes.push(z); z += H; }
  for (let k = 0; k < nCourt; k++) {
    rows.push(['court', z, z + cd, k % 2 === 0 ? 's' : 'n']); z += cd;
    if (k < nCourt - 1) { lanes.push(z); z += H; }
  }
  if (shops) { rows.push(['shopS', Z1 - 6, Z1]); }
  for (const row of rows) {
    if (row[0] === 'shopN') shopRow(A, X0, row[1], X1, row[2], 'n', b, props);
    else if (row[0] === 'shopS') shopRow(A, X0, row[1], X1, row[2], 's', b, props);
    else {
      const n = Math.random() < 0.35 ? 2 : 3, cw = (X1 - X0) / n;
      for (let k = 0; k < n; k++) siheyuan(A, X0 + k * cw + 0.1, row[1], X0 + (k + 1) * cw - 0.1, row[2], row[3], b, props);
    }
  }
  // lanes: signs at both mouths, bikes along the walls
  for (const lz of lanes) {
    addSign(X0 - 0.05, 2.3, lz + H / 2, 'w'); addSign(X1 + 0.05, 2.3, lz + H / 2, 'e');
    for (let k = 0; k < 3; k++) if (Math.random() < 0.55) addBike(rand(X0 + 2, X1 - 2), lz + 0.55, rand(-0.2, 0.2));
  }
  flushAcc(A);
  if (props.length) Build.props.push(...props);
  b.lanes = lanes.map((lz) => ({ x0: X0, x1: X1, z0: lz, z1: lz + H }));
}

/* ---------- red palace wall with yellow coping ---------- */
// a smooth curved wall (回音壁, rounded corners): outer + inner faces, a tiled coping, and small colliders along the arc
function arcWall(A, cx, cz, R, a0, a1, h, t, n, tile = 'yellow') {
  const solids = [], y0 = 0.3, y1 = 0.3 + h, ro = R + t / 2, ri = R - t / 2, rc = R + t / 2 + 0.3;
  for (let k = 0; k < n; k++) {
    const u0 = a0 + (a1 - a0) * (k / n), u1 = a0 + (a1 - a0) * ((k + 1) / n);
    const P = (r, a, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    const L = R * Math.abs(u1 - u0), s0 = R * Math.abs(u0 - a0) / 3, s1 = s0 + L / 3;
    A.red.quad(P(ro, u1, y0), P(ro, u0, y0), P(ro, u0, y1), P(ro, u1, y1), [s1, 0], [s0, 0], [s0, h / 3], [s1, h / 3]);
    A.red.quad(P(ri, u0, y0), P(ri, u1, y0), P(ri, u1, y1), P(ri, u0, y1), [s0, 0], [s1, 0], [s1, h / 3], [s0, h / 3]);
    // coping: two tiled slopes meeting at a ridge over the wall's centre line
    const yr = y1 + 0.55;
    A[tile].quad(P(rc, u1, y1), P(rc, u0, y1), P(R, u0, yr), P(R, u1, yr), [s1 * 1.5, 0], [s0 * 1.5, 0], [s0 * 1.5, 0.5], [s1 * 1.5, 0.5]);
    A[tile].quad(P(R - t / 2 - 0.3, u0, y1), P(R - t / 2 - 0.3, u1, y1), P(R, u1, yr), P(R, u0, yr), [s0 * 1.5, 0], [s1 * 1.5, 0], [s1 * 1.5, 0.5], [s0 * 1.5, 0.5]);
    const mx = cx + Math.cos((u0 + u1) / 2) * R, mz = cz + Math.sin((u0 + u1) / 2) * R, e = Math.max(t / 2, L / 2) * 0.75;
    solids.push({ x0: mx - e, x1: mx + e, z0: mz - e, z1: mz + e });
  }
  return solids;
}
function palaceWall(A, x0, z0, x1, z1, h, t = 1.2, gaps = []) {
  // straight segment along x (z0==z1 center line) or z; gaps = [[from,to],...] along the run
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const segs = []; let cur = a0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > cur) segs.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < a1) segs.push([cur, a1]);
  const c = alongX ? z0 : x0;
  for (const [s0, s1] of segs) {
    if (alongX) { boxW(A.red, s0, 0.3, c - t / 2, s1, 0.3 + h, c + t / 2, 3, 'nsew'); gableRoof(A.yellow, (s0 + s1) / 2, c, s1 - s0, t, 0.3 + h, 0.7, 0, 0.35); }
    else { boxW(A.red, c - t / 2, 0.3, s0, c + t / 2, 0.3 + h, s1, 3, 'nsew'); gableRoof(A.yellow, c, (s0 + s1) / 2, s1 - s0, t, 0.3 + h, 0.7, 1, 0.35); }
  }
  return segs.map(([s0, s1]) => (alongX ? { x0: s0, x1: s1, z0: c - t / 2, z1: c + t / 2 } : { x0: c - t / 2, x1: c + t / 2, z0: s0, z1: s1 }));
}
// a classical hall: red columns + lattice, on an optional platform, with a (double) hip roof
function hall(A, props, cx, cz, w, d, y0, h, o = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  boxW(A.red, x0, y0, z0, x1, y0 + h, z1, 3, 'nsew');
  latticeFace(A.lattice, 's', x0 + 0.5, y0, z0, x1 - 0.5, y0 + h - 0.3, z1 + 0.03);
  if (o.north) latticeFace(A.lattice, 'n', x0 + 0.5, y0, z0 - 0.03, x1 - 0.5, y0 + h - 0.3, z1);
  const R = A[o.roof || 'yellow'];
  if (o.double) { hipRoof(R, cx, cz, w + 1.2, d + 1.2, y0 + h, h * 0.18, 0, 1.0); boxW(A.red, x0 + 1.2, y0 + h + h * 0.12, z0 + 1.2, x1 - 1.2, y0 + h + h * 0.36, z1 - 1.2, 3, 'nsew'); hipRoof(R, cx, cz, w - 1.2, d - 1.6, y0 + h + h * 0.36, o.rh || d * 0.42, 0, 0.9); }
  else if (o.gable) gableRoof(R, cx, cz, w, d, y0 + h, o.rh || d * 0.45, 0, 0.8);
  else hipRoof(R, cx, cz, w, d, y0 + h, o.rh || d * 0.42, 0, 0.9);
  // ridge ornaments
  const top = y0 + h + (o.double ? h * 0.36 + (o.rh || d * 0.42) : (o.rh || d * 0.42));
  if (!o.gable) { const rr = Math.max(0.2, (w - d) / 2 - (o.double ? 1.2 : 0)); for (const s of [-1, 1]) props.push(box(cx + s * rr, top + 0.45, cz, 0.35, 0.9, 0.35, 0x8a6a1a)); props.push(box(cx, top + 0.12, cz, rr * 2, 0.25, 0.3, 0x8a6a1a)); }
  return { x0, x1, z0, z1, top };
}
// stepped white marble terrace (三台), also registered as walkable platforms
function terrace(A, cx, cz, w, d, tiers = 3, th = 0.8, shrink = 2) {
  let y = 0.3;
  for (let k = 0; k < tiers; k++) {
    const ww = w - k * shrink * 2, dd = d - k * shrink * 2 * (d / w);
    boxW(A.marble, cx - ww / 2, y, cz - dd / 2, cx + ww / 2, y + th, cz + dd / 2, 2.5);
    y += th;
    W.platforms.push({ x0: cx - ww / 2, x1: cx + ww / 2, z0: cz - dd / 2, z1: cz + dd / 2, h: y });
  }
  return y;
}
function roundTerrace(A, cx, cz, r0, tiers = 3, th = 0.8, step = 2) {
  let y = 0.3;
  for (let k = 0; k < tiers; k++) {
    const r = r0 - k * step;
    cylW(A.marble, cx, cz, r, y, y + th, 28, 2.5); discTop(A.marble, cx, cz, r, y + th, 28, 3);
    y += th;
    W.platforms.push({ circle: true, x: cx, z: cz, r, h: y });
  }
  return y;
}
// a big brick city-gate base (墩台) with a dark arch, then a tower on top
function gateBase(A, props, cx, cz, w, d, h, arch = true, mat = 'grey') {
  boxW(A[mat], cx - w / 2, 0.3, cz - d / 2, cx + w / 2, 0.3 + h, cz + d / 2, 2.5);
  if (arch) for (const s of [-1, 1]) props.push(box(cx, 0.3 + h * 0.34, cz + s * (d / 2 + 0.02), 3.4, h * 0.68, 0.06, 0x16120f), gpart(new THREE.CylinderGeometry(1.7, 1.7, 0.06, 16, 1, false, 0, Math.PI), 0x16120f, cx, 0.3 + h * 0.68, cz + s * (d / 2 + 0.02), Math.PI / 2, 0, Math.PI / 2 * 0 + (s > 0 ? 0 : 0)));
}

/* ================= landmarks ================= */
function genPalace(m) { // 故宫
  const A = acc3(), props = [], blk = m.blk;
  const X0 = m.x0, X1 = m.x1, Z0 = m.z0, Z1 = m.z1, cx = (X0 + X1) / 2;
  // 筒子河 moat on west, east, north
  addWater({ x0: X0 + 1.5, x1: X0 + 5.5, z0: Z0 + 1.5, z1: Z1 - 4 }); addWater({ x0: X1 - 5.5, x1: X1 - 1.5, z0: Z0 + 1.5, z1: Z1 - 4 }); addWater({ x0: X0 + 1.5, x1: X1 - 1.5, z0: Z0 + 1.5, z1: Z0 + 5.5 });
  const wx0 = X0 + 8, wx1 = X1 - 8, wz0 = Z0 + 8, wz1 = Z1 - 7, wh = 6.2;
  const solids = [
    ...palaceWall(A, wx0, wz0, wx1, wz0, wh, 1.4, [[cx - 2.4, cx + 2.4]]),
    ...palaceWall(A, wx0, wz0, wx0, wz1, wh, 1.4),
    ...palaceWall(A, wx1, wz0, wx1, wz1, wh, 1.4),
    ...palaceWall(A, wx0, wz1, wx1, wz1, wh, 1.4, [[cx - 16, cx + 16]]),
  ];
  for (const s of solids) addSolid(blk, Object.assign(s, { h: wh + 1, kind: 'bld' }));
  // 午门 Meridian Gate: U-shaped red base with the main hall on top and two wings
  const mz = wz1 + 1;
  boxW(A.red, cx - 16, 0.3, mz - 5, cx - 2.4, 0.3 + 6.5, mz + 1, 3); boxW(A.red, cx + 2.4, 0.3, mz - 5, cx + 16, 0.3 + 6.5, mz + 1, 3);
  boxW(A.red, cx - 2.4, 0.3 + 4.2, mz - 5, cx + 2.4, 0.3 + 6.5, mz + 1, 3, 'nst');
  addSolid(blk, { x0: cx - 16, x1: cx - 2.4, z0: mz - 5, z1: mz + 1, h: 16, kind: 'bld' }); addSolid(blk, { x0: cx + 2.4, x1: cx + 16, z0: mz - 5, z1: mz + 1, h: 16, kind: 'bld' });
  hall(A, props, cx, mz - 2, 20, 5.2, 6.8, 4.4, { double: true });
  for (const s of [-1, 1]) {
    boxW(A.red, cx + s * 16 - 3, 0.3, mz + 1, cx + s * 16 + 3, 6.8, Z1 - 1.5, 3);
    addSolid(blk, { x0: cx + s * 16 - 3, x1: cx + s * 16 + 3, z0: mz + 1, z1: Z1 - 1.5, h: 12, kind: 'bld' });
    hall(A, props, cx + s * 16, mz + 1.5, 5, 4, 6.8, 2.8, {}); hall(A, props, cx + s * 16, Z1 - 3.5, 5, 4, 6.8, 2.8, {});
  }
  // 角楼 corner towers
  for (const [tx, tz] of [[wx0, wz0], [wx1, wz0], [wx0, wz1], [wx1, wz1]]) {
    boxW(A.red, tx - 2.6, 0.3 + wh, tz - 2.6, tx + 2.6, 0.3 + wh + 3, tz + 2.6, 3);
    gableRoof(A.yellow, tx, tz, 6.4, 3.4, 0.3 + wh + 3, 1.8, 0, 0.6); gableRoof(A.yellow, tx, tz, 6.4, 3.4, 0.3 + wh + 3, 1.8, 1, 0.6);
    pyramidRoof(A.yellow, tx, tz, 2.4, 0.3 + wh + 4.4, 1.8, 0.4); props.push(gpart(new THREE.SphereGeometry(0.35, 8, 6), 0xd4a017, tx, 0.3 + wh + 6.4, tz));
  }
  // 太和门
  hall(A, props, cx, wz1 - 7, 16, 4.6, 0.3 + 1.0, 4.2, { double: true });
  terrace(A, cx, wz1 - 7, 19, 7, 1, 1.0, 0);
  addSolid(blk, { x0: cx - 8, x1: cx + 8, z0: wz1 - 9.3, z1: wz1 - 4.7, h: 12, kind: 'bld' });
  // 金水桥: a curved stream with five little bridges (decorative)
  addWater({ x0: cx - 14, x1: cx + 14, z0: wz1 - 3.2, z1: wz1 - 2.2, deco: true });
  for (let k = -2; k <= 2; k++) props.push(box(cx + k * 3.2, 0.62, wz1 - 2.7, 1.8, 0.35, 1.6, 0xeceae4));
  // 三台 + 太和殿 / 中和殿 / 保和殿
  const tz = (wz0 + wz1) / 2 + 4;
  const ty = terrace(A, cx, tz, 34, 26, 3, 0.8, 1.8);
  hall(A, props, cx, tz + 6, 22, 9, ty, 5.6, { double: true, rh: 3.6 });
  addSolid(blk, { x0: cx - 11, x1: cx + 11, z0: tz + 1.5, z1: tz + 10.5, h: 20, kind: 'bld' });
  const zh = hall(A, props, cx, tz - 1.5, 6.5, 6.5, ty, 4.2, {}); void zh;
  pyramidRoof(A.yellow, cx, tz - 1.5, 6.5, ty + 4.2, 2.6, 0.7); props.push(gpart(new THREE.SphereGeometry(0.45, 10, 8), 0xe8b422, cx, ty + 7.1, tz - 1.5));
  hall(A, props, cx, tz - 8, 18, 7, ty, 4.8, { double: true, rh: 3 });
  addSolid(blk, { x0: cx - 9, x1: cx + 9, z0: tz - 11.5, z1: tz - 4.5, h: 16, kind: 'bld' }); addSolid(blk, { x0: cx - 3.3, x1: cx + 3.3, z0: tz - 4.8, z1: tz + 1.8, h: 12, kind: 'bld' });
  // marble balustrade posts around the top tier
  for (let k = -8; k <= 8; k++) props.push(box(cx + k * 1.85, ty + 0.35, tz + 9.9, 0.18, 0.7, 0.18, 0xf2f0ea), box(cx + k * 1.85, ty + 0.35, tz - 9.9, 0.18, 0.7, 0.18, 0xf2f0ea));
  // inner court 乾清宫 / 坤宁宫 + 御花园
  const iz = wz0 + 12;
  const iy = terrace(A, cx, iz + 2, 20, 12, 1, 1.0, 0);
  hall(A, props, cx, iz + 3, 16, 6.5, iy, 4.6, { double: true, rh: 2.8 });
  addSolid(blk, { x0: cx - 8, x1: cx + 8, z0: iz - 0.3, z1: iz + 6.3, h: 14, kind: 'bld' });
  hall(A, props, cx, iz - 5, 14, 5, 0.3, 4.0, {});
  addSolid(blk, { x0: cx - 7, x1: cx + 7, z0: iz - 7.5, z1: iz - 2.5, h: 10, kind: 'bld' });
  for (let k = 0; k < 8; k++) BJB.cypress.push([blk, cx + rand(-14, 14), wz0 + rand(2.5, 4.5), rand(0.8, 1.1)]);
  // east & west side palaces: rows of yellow-roofed halls behind red walls
  for (const s of [-1, 1]) {
    const sx0 = s < 0 ? wx0 + 2 : cx + 14, sx1 = s < 0 ? cx - 14 : wx1 - 2;
    palaceWall(A, s < 0 ? cx - 13 : cx + 13, wz0 + 1, s < 0 ? cx - 13 : cx + 13, wz1 - 10, 4.2, 0.9, [[tz - 1, tz + 3]]).forEach((q) => addSolid(blk, Object.assign(q, { h: 6, kind: 'bld' })));
    for (let zz = wz0 + 4; zz < wz1 - 12; zz += 12) {
      const hw = sx1 - sx0 - 2;
      hall(A, props, (sx0 + sx1) / 2, zz + 3, hw, 4.4, 0.3, 3.4, { gable: true, rh: 1.8 });
      addSolid(blk, { x0: sx0 + 1, x1: sx1 - 1, z0: zz + 0.8, z1: zz + 5.2, h: 7, kind: 'bld' });
      boxW(A.red, sx0 + 0.5, 0.3, zz + 8.2, sx1 - 0.5, 3.3, zz + 8.8, 3, 'nsew'); gableRoof(A.yellow, (sx0 + sx1) / 2, zz + 8.5, sx1 - sx0 - 1, 0.6, 3.3, 0.35, 0, 0.2);
      if (Math.random() < 0.7) BJB.cypress.push([blk, (sx0 + sx1) / 2 + rand(-3, 3), zz + 6.8, rand(0.6, 0.85)]);
    }
  }
  // 神武门 north gate tower
  boxW(A.red, cx - 9, 0.3, wz0 - 3, cx - 2.4, 6.8, wz0 + 3, 3); boxW(A.red, cx + 2.4, 0.3, wz0 - 3, cx + 9, 6.8, wz0 + 3, 3); boxW(A.red, cx - 2.4, 4.3, wz0 - 3, cx + 2.4, 6.8, wz0 + 3, 3, 'nst');
  hall(A, props, cx, wz0, 14, 4.2, 6.8, 3.6, { double: true });
  addSolid(blk, { x0: cx - 9, x1: cx - 2.4, z0: wz0 - 3, z1: wz0 + 3, h: 14, kind: 'bld' }); addSolid(blk, { x0: cx + 2.4, x1: cx + 9, z0: wz0 - 3, z1: wz0 + 3, h: 14, kind: 'bld' });
  flushAcc(A); Build.props.push(...props);
  W.landmarks.palace = { x: cx, z: (Z0 + Z1) / 2, top: ty + 12 };
}
function genJingshan(m) { // 景山 + 万春亭
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
  const hill = { x: cx, z: cz, rx: (m.x1 - m.x0) / 2 - 7, rz: (m.z1 - m.z0) / 2 - 5, h: 10 };
  W.hills.push(hill);
  // hill mesh
  const g = new THREE.PlaneGeometry(hill.rx * 2 + 2, hill.rz * 2 + 2, 48, 24); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setXYZ(i, x, hillH(hill, x, z) + 0.3 + 0.01, z); uv.setXY(i, x / 6, z / 6); }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: TEX.grass, color: 0xb8d8a0 })); mesh.receiveShadow = true; scene.add(mesh);
  for (let k = 0; k < 70; k++) { const a = rand(TAU), rr = Math.sqrt(Math.random()) * 0.92; const x = cx + Math.cos(a) * hill.rx * rr, z = cz + Math.sin(a) * hill.rz * rr; if (Math.abs(x - cx) < 5 && Math.abs(z - cz) < 5) continue; if (Math.abs(x - cx) < 12 && z > cz + 2 && z < cz + 26) continue; BJB.cypress.push([blk, x, z, rand(0.7, 1.05)]); }
  // pavilions along the ridge: 万春亭 in the middle
  const pav = (x, s, tiers, roof) => {
    const y = hillH(hill, x, cz) + 0.3;
    for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.push(box(x + ax * s * 0.42, y + 1.6, cz + az * s * 0.42, 0.3, 3.2, 0.3, 0x9b2d24));
    pyramidRoof(A[roof], x, cz, s, y + 3.2, s * 0.35, 0.6);
    if (tiers > 1) { boxW(A.red, x - s * 0.3, y + 3.2 + s * 0.2, cz - s * 0.3, x + s * 0.3, y + 3.2 + s * 0.38, cz + s * 0.3, 2, 'nsew'); pyramidRoof(A[roof], x, cz, s * 0.62, y + 3.2 + s * 0.38, s * 0.42, 0.5); }
    props.push(gpart(new THREE.SphereGeometry(0.3, 8, 6), 0xe8b422, x, y + 3.2 + s * (tiers > 1 ? 0.82 : 0.37), cz));
    W.platforms.push({ x0: x - s * 0.5, x1: x + s * 0.5, z0: cz - s * 0.5, z1: cz + s * 0.5, h: y + 0.25 });
  };
  pav(cx, 6.5, 2, 'yellow'); pav(cx - 13, 4, 1, 'green'); pav(cx + 13, 4, 1, 'green'); pav(cx - 24, 3.2, 1, 'blue'); pav(cx + 24, 3.2, 1, 'blue');
  W.landmarks.jingshan = { x: cx, z: cz, y: hill.h + 0.3 };
  // enclosure wall with the south gate (you can walk up the hill for the view)
  const q = [
    ...palaceWall(A, m.x0 + 2, m.z0 + 2, m.x1 - 2, m.z0 + 2, 3.2, 0.8, [[cx - 2, cx + 2]]),
    ...palaceWall(A, m.x0 + 2, m.z1 - 2, m.x1 - 2, m.z1 - 2, 3.2, 0.8, [[cx - 2.2, cx + 2.2]]),
    ...palaceWall(A, m.x0 + 2, m.z0 + 2, m.x0 + 2, m.z1 - 2, 3.2, 0.8),
    ...palaceWall(A, m.x1 - 2, m.z0 + 2, m.x1 - 2, m.z1 - 2, 3.2, 0.8),
  ];
  for (const s of q) addSolid(blk, Object.assign(s, { h: 4, kind: 'bld' }));
  flushAcc(A); Build.props.push(...props);
}
function hillH(hl, x, z) { const u = ((x - hl.x) / hl.rx) ** 2 + ((z - hl.z) / hl.rz) ** 2; if (u >= 1) return 0; const t = 1 - u; return hl.h * t * t * (3 - 2 * t); }
function genGulou(m) { // 钟鼓楼
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2;
  const dz = m.z1 - 12, bz = m.z0 + 11;
  // 鼓楼: red base with 3 arches + two-storey hall + grey roof with green trim
  boxW(A.red, cx - 12, 0.3, dz - 6, cx + 12, 8.3, dz + 6, 3);
  for (const k of [-6, 0, 6]) props.push(box(cx + k, 3.1, dz + 6.03, 2.6, 5.2, 0.06, 0x17120e));
  addSolid(blk, { x0: cx - 12, x1: cx + 12, z0: dz - 6, z1: dz + 6, h: 22, kind: 'bld' });
  hall(A, props, cx, dz, 19, 8.5, 8.3, 3.6, { roof: 'roof', north: true });
  boxW(A.red, cx - 8.5, 13.2, dz - 3.6, cx + 8.5, 16.2, dz + 3.6, 3, 'nsew'); latticeFace(A.lattice, 's', cx - 8, 13.2, dz - 3.6, cx + 8, 16, dz + 3.63);
  hipRoof(A.roof, cx, dz, 17, 7.2, 16.2, 3.2, 0, 1.2);
  // 钟楼: grey brick, heavier, arched windows
  boxW(A.grey, cx - 7, 0.3, bz - 7, cx + 7, 8.3, bz + 7, 2.5); props.push(box(cx, 3.1, bz + 7.03, 2.8, 5.2, 0.06, 0x17120e));
  boxW(A.grey, cx - 5, 8.3, bz - 5, cx + 5, 13.3, bz + 5, 2.5); props.push(box(cx, 10.6, bz + 5.03, 1.8, 3.2, 0.06, 0x17120e));
  hipRoof(A.roof, cx, bz, 10.6, 10.6, 13.3, 1.2, 0, 1.0); boxW(A.grey, cx - 3.6, 14.2, bz - 3.6, cx + 3.6, 15.4, bz + 3.6, 2, 'nsew'); hipRoof(A.roof, cx, bz, 8, 8, 15.4, 3.0, 0, 0.9);
  addSolid(blk, { x0: cx - 7, x1: cx + 7, z0: bz - 7, z1: bz + 7, h: 19, kind: 'bld' });
  // hutongs on both sides of the square
  flushAcc(A); Build.props.push(...props);
  genHutong(blk, { rect: { x0: m.x0, x1: cx - 16, z0: m.z0, z1: m.z1 }, shops: false });
  genHutong(blk, { rect: { x0: cx + 16, x1: m.x1, z0: m.z0, z1: m.z1 }, shops: false });
  W.landmarks.gulou = { x: cx, z: dz };
}
function genQianmen(m) { // 正阳门 + 前门广场
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2;
  const gz = m.z1 - 7;
  gateBase(A, props, cx, gz, 34, 9, 8.5, true, 'grey');
  addSolid(blk, { x0: cx - 17, x1: cx - 2.2, z0: gz - 4.5, z1: gz + 4.5, h: 28, kind: 'bld' }); addSolid(blk, { x0: cx + 2.2, x1: cx + 17, z0: gz - 4.5, z1: gz + 4.5, h: 28, kind: 'bld' });
  hall(A, props, cx, gz, 26, 7, 8.8, 4.6, { roof: 'roof', north: true });
  boxW(A.red, cx - 11, 14.6, gz - 2.8, cx + 11, 18.4, gz + 2.8, 3, 'nsew'); latticeFace(A.lattice, 's', cx - 10.5, 14.6, gz - 2.8, cx + 10.5, 18.2, gz + 2.83);
  hipRoof(A.roof, cx, gz, 24, 7, 18.4, 3.8, 0, 1.3);
  props.push(box(cx, 16.5, gz + 3.6, 5, 1.2, 0.1, 0x16120e), box(cx, 16.5, gz + 3.65, 4.4, 0.8, 0.05, 0xd4a017));
  W.landmarks.qianmen = { x: cx, z: gz };
  flushAcc(A); Build.props.push(...props);
  genPlaza(blk, { x: cx, z: m.z0 + 14 });
  W.gordonAt = { x: m.x0 + 10, z: m.z0 + 16 };
}
function genTiantan(m) { // 天坛: 祈年殿 · 丹陛桥 · 皇穹宇 · 圜丘, in a cypress park
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2;
  const X0 = m.x0 + 2, X1 = m.x1 - 2, Z0 = m.z0 + 2, Z1 = m.z1 - 2;
  // outer wall: square in the south, rounded corners in the north (天圆地方)
  const walls = [
    ...palaceWall(A, X0, Z1, X1, Z1, 3, 0.8, [[cx - 2.5, cx + 2.5]]),
    ...palaceWall(A, X0, Z0 + 14, X0, Z1, 3, 0.8, [[(Z0 + Z1) / 2 - 2.5, (Z0 + Z1) / 2 + 2.5]]),
    ...palaceWall(A, X1, Z0 + 14, X1, Z1, 3, 0.8),
    ...palaceWall(A, X0 + 14, Z0, X1 - 14, Z0, 3, 0.8, [[cx - 2.5, cx + 2.5]]),
  ];
  // rounded north corners (天圆地方: round in the north, square in the south)
  walls.push(...arcWall(A, X0 + 14, Z0 + 14, 14, Math.PI, Math.PI * 1.5, 3, 0.8, 12), ...arcWall(A, X1 - 14, Z0 + 14, 14, Math.PI * 1.5, Math.PI * 2, 3, 0.8, 12));
  for (const q of walls) addSolid(blk, Object.assign(q, { h: 4, kind: 'bld' }));
  // 祈年殿 complex
  const qz = Z0 + 30;
  const enc = [...palaceWall(A, cx - 20, qz - 20, cx + 20, qz - 20, 3.4, 0.8), ...palaceWall(A, cx - 20, qz + 20, cx + 20, qz + 20, 3.4, 0.8, [[cx - 3, cx + 3]]),
    ...palaceWall(A, cx - 20, qz - 20, cx - 20, qz + 20, 3.4, 0.8), ...palaceWall(A, cx + 20, qz - 20, cx + 20, qz + 20, 3.4, 0.8)];
  for (const q of enc) addSolid(blk, Object.assign(q, { h: 4, kind: 'bld' }));
  const ty = roundTerrace(A, cx, qz, 14, 3, 0.8, 2);
  cylW(A.red, cx, qz, 6.2, ty, ty + 5.2, 24, 2);
  latticeRound(A.lattice, cx, qz, 6.25, ty, ty + 4.8);
  roundRoof(A.blue, cx, qz, 7.4, ty + 5.2, 1.2, 28, 1.1);
  cylW(A.red, cx, qz, 5.2, ty + 6.2, ty + 7.6, 24, 2); roundRoof(A.blue, cx, qz, 6.2, ty + 7.6, 1.1, 28, 0.9);
  cylW(A.red, cx, qz, 4.2, ty + 8.6, ty + 10.0, 24, 2); roundRoof(A.blue, cx, qz, 5.0, ty + 10.0, 3.8, 28, 0.8);
  props.push(gpart(new THREE.SphereGeometry(0.7, 12, 10), 0xe8b422, cx, ty + 14.3, qz));
  addSolid(blk, { x0: cx - 6.2, x1: cx + 6.2, z0: qz - 6.2, z1: qz + 6.2, h: 24, kind: 'bld' });
  // 丹陛桥 raised walkway to 皇穹宇
  const hz = Z1 - 36;
  boxW(A.marble, cx - 3, 0.3, qz + 20, cx + 3, 1.3, hz - 10, 2.5);
  W.platforms.push({ x0: cx - 3, x1: cx + 3, z0: qz + 20, z1: hz - 10, h: 1.3 });
  // 皇穹宇 + 回音壁
  const hy = roundTerrace(A, cx, hz, 5.5, 1, 0.8, 0);
  cylW(A.red, cx, hz, 3.6, hy, hy + 3.4, 20, 2); latticeRound(A.lattice, cx, hz, 3.65, hy, hy + 3.0); roundRoof(A.blue, cx, hz, 4.4, hy + 3.4, 3.0, 24, 0.8);
  props.push(gpart(new THREE.SphereGeometry(0.4, 10, 8), 0xe8b422, cx, hy + 6.7, hz));
  addSolid(blk, { x0: cx - 3.6, x1: cx + 3.6, z0: hz - 3.6, z1: hz + 3.6, h: 10, kind: 'bld' });
  // 回音壁: a smooth round wall with blue tiles, open to the south (the 丹陛桥 side is north, the gate faces south)
  for (const [u0, u1] of [[-Math.PI / 2 + 0.32, Math.PI / 2 - 0.3], [Math.PI / 2 + 0.3, Math.PI * 1.5 - 0.32]])
    for (const q of arcWall(A, cx, hz, 10, u0, u1, 3.2, 0.7, 20, 'blue')) addSolid(blk, Object.assign(q, { h: 3.5, kind: 'bld' }));
  // 圜丘 open round altar (you can stand on the 天心石)
  roundTerrace(A, cx, Z1 - 14, 9, 3, 0.8, 2.2);
  for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; props.push(box(cx + Math.cos(a) * 8.8, 1.45, Z1 - 14 + Math.sin(a) * 8.8, 0.22, 0.6, 0.22, 0xf2f0ea)); }
  // cypress groves
  for (let k = 0; k < 170; k++) {
    const x = rand(X0 + 3, X1 - 3), z = rand(Z0 + 3, Z1 - 3);
    if (Math.abs(x - cx) < 23 && z > qz - 23 && z < Z1 - 3) continue;
    if (z < Z0 + 14 && (Math.abs(x - X0 - 14) < 0 || ((x < X0 + 14 || x > X1 - 14) && Math.hypot(x - (x < cx ? X0 + 14 : X1 - 14), z - (Z0 + 14)) > 13))) continue;
    BJB.cypress.push([blk, x, z, rand(0.8, 1.25)]);
  }
  flushAcc(A); Build.props.push(...props);
  W.landmarks.tiantan = { x: cx, z: qz };
  m.ground = 'grass';
}
// lattice ring for round halls
function latticeRound(acc, cx, cz, r, y0, y1, n = 24) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    acc.quad(p1, p0, [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [((k + 1) / n) * 4, 0], [(k / n) * 4, 0], [(k / n) * 4, 1], [((k + 1) / n) * 4, 1]);
  }
}
function genHouhai(m) { // 什刹海: 后海 + 前海, 银锭桥, bars along the north shore, willows
  const A = acc3(), props = [], blk = m.blk;
  const cz = (m.z0 + m.z1) / 2 + 1, xa = m.x0 + 26, xb = m.x1 - 22;
  addWater({ ellipse: true, x: xa, z: cz, rx: 22, rz: 10.5 });
  addWater({ ellipse: true, x: xb, z: cz + 1.5, rx: 17, rz: 9.5 });
  const bx = (xa + 22 + xb - 17) / 2;
  addWater({ x0: xa + 18, x1: xb - 13, z0: cz - 1.4, z1: cz + 2.2 });
  // 银锭桥
  boxW(A.marble, bx - 2.2, 0.3, cz - 3.2, bx + 2.2, 1.1, cz + 4, 2);
  props.push(box(bx - 2.1, 1.5, cz + 0.4, 0.2, 0.8, 7.2, 0xeceae4), box(bx + 2.1, 1.5, cz + 0.4, 0.2, 0.8, 7.2, 0xeceae4));
  addDry({ x0: bx - 2.2, x1: bx + 2.2, z0: cz - 3.4, z1: cz + 4.2 }); W.platforms.push({ x0: bx - 2.2, x1: bx + 2.2, z0: cz - 3.2, z1: cz + 4, h: 1.1 });
  // bar street (后海酒吧街) on the north shore: small two-storey bars with neon
  const barMat = barNeonMat();
  let x = m.x0 + 3;
  while (x < m.x1 - 10) {
    const w = rand(7, 10);
    boxW(A.brick, x, 0.3, m.z0 + 1.5, x + w, 5.3, m.z0 + 7, 2, 'nsew');
    panel(A.shops[randi(0, A.shops.length - 1)], 's', x + 0.1, 0.3, m.z0 + 1.5, x + w - 0.1, 5.3, m.z0 + 7.03, Math.random() < 0.5 ? 0 : 0.5, Math.random() < 0.5 ? 0.5 : 1, 0, 1);
    gableRoof(A.roof, x + w / 2, m.z0 + 4.25, w, 5.5, 5.3, 1.6, 0, 0.5);
    BJB.neonBoxes.push({ x: x + w / 2, y: 4.3, z: m.z0 + 7.3, w: w * 0.6, mat: barMat });
    addSolid(blk, { x0: x, x1: x + w, z0: m.z0 + 1.5, z1: m.z0 + 7, h: 8, kind: 'bld' });
    x += w + 0.3;
  }
  // siheyuan strip on the south shore
  for (let k = 0; k < 5; k++) siheyuan(A, m.x0 + 3 + k * 19.5, m.z1 - 9.5, m.x0 + 3 + k * 19.5 + 18.5, m.z1 - 1, 'n', blk, props);
  // willows + stone rails around the lakes; a few paddle boats
  for (const [ex, ez, rx, rz] of [[xa, cz, 22, 10.5], [xb, cz + 1.5, 17, 9.5]]) {
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; W.palmList.push(newProp(ex + Math.cos(a) * (rx + 2.2), ez + Math.sin(a) * (rz + 2.2), rand(0.85, 1.1), 'palm', blk)); }
    for (let k = 0; k < 40; k++) { const a = (k / 40) * TAU; props.push(box(ex + Math.cos(a) * (rx + 0.5), 0.6, ez + Math.sin(a) * (rz + 0.5), 0.9, 0.6, 0.9, 0xd8d4ca)); }
    for (let k = 0; k < 3; k++) BJB.boats.push([ex + rand(-rx * 0.5, rx * 0.5), ez + rand(-rz * 0.4, rz * 0.4), rand(TAU)]);
  }
  flushAcc(A); Build.props.push(...props);
  W.landmarks.houhai = { x: bx, z: cz };
}
function barNeonMat() { if (!BJB.barMat) { BJB.barMat = new THREE.MeshBasicMaterial({ map: barNeonTex(), transparent: true }); W.neonMats.push(BJB.barMat); } return BJB.barMat; }
function barNeonTex() {
  const c = mkCanvas(512, 256), g = c.getContext('2d');
  const words = [['后海酒吧', '#ff3d8b'], ['LIVE 现场', '#38e1ff'], ['胡同酒馆', '#ffd23f'], ['烟袋斜街', '#7cff6b'], ['Token Bar', '#c084fc'], ['老炮儿', '#ff7a3d'], ['京 A 啤酒', '#ffffff'], ['驻唱', '#ff4d5a']];
  words.forEach(([t, col], i) => { const x = (i % 2) * 256, y = Math.floor(i / 2) * 64; g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 230, 44, 900); g.fillText(t, x + 128, y + 34); });
  return tex(c);
}
function genBeihai(m) { // 北海 + 琼华岛白塔
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
  addWater({ ellipse: true, x: cx, z: cz - 2, rx: (m.x1 - m.x0) / 2 - 3.5, rz: (m.z1 - m.z0) / 2 - 6 });
  const ix = cx, iz = m.z1 - 30, ir = 10;
  addDry({ ellipse: true, x: ix, z: iz, rx: ir, rz: ir });
  const hl = { x: ix, z: iz, rx: ir, rz: ir, h: 6.5 }; W.hills.push(hl);
  const g = new THREE.CircleGeometry(ir + 0.6, 40, 0, TAU); g.rotateX(-Math.PI / 2);
  const gp = g.attributes.position, guv = g.attributes.uv;
  for (let i = 0; i < gp.count; i++) { const x = gp.getX(i) + ix, z = gp.getZ(i) + iz; gp.setXYZ(i, x, hillH(hl, x, z) + 0.36, z); guv.setXY(i, x / 5, z / 5); }
  g.computeVertexNormals();
  const isl = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: TEX.grass, color: 0xb8d8a0 })); isl.receiveShadow = true; scene.add(isl);
  for (let k = 0; k < 18; k++) { const a = rand(TAU), rr = rand(3, ir - 1); BJB.cypress.push([blk, ix + Math.cos(a) * rr, iz + Math.sin(a) * rr, rand(0.6, 0.9)]); }
  // 永安桥 to the south shore
  boxW(A.marble, ix - 1.8, 0.3, iz + ir - 1, ix + 1.8, 1.0, m.z1 - 1, 2);
  addDry({ x0: ix - 1.8, x1: ix + 1.8, z0: iz + ir - 1.5, z1: m.z1 }); W.platforms.push({ x0: ix - 1.8, x1: ix + 1.8, z0: iz + ir - 1, z1: m.z1 - 1, h: 1.0 });
  // 白塔
  const by = hl.h + 0.3;
  boxW(A.white, ix - 3.4, by, iz - 3.4, ix + 3.4, by + 2.2, iz + 3.4, 2);
  const white = 0xf4f2ec;
  props.push(gpart(new THREE.CylinderGeometry(3.0, 3.2, 1.0, 20), white, ix, by + 2.7, iz), gpart(new THREE.SphereGeometry(3.1, 20, 14, 0, TAU, 0, Math.PI * 0.62), white, ix, by + 3.2, iz, 0, 0, 0, 1, 1.2, 1));
  props.push(box(ix, by + 4.4, iz + 3.02, 1.3, 1.8, 0.2, 0xb91c1c), gpart(new THREE.CylinderGeometry(1.0, 1.3, 1.2, 16), white, ix, by + 7.4, iz));
  props.push(gpart(new THREE.CylinderGeometry(0.35, 1.0, 4.4, 16), white, ix, by + 10.2, iz));
  for (let k = 0; k < 6; k++) props.push(gpart(new THREE.CylinderGeometry(0.95 - k * 0.1, 0.95 - k * 0.1, 0.12, 16), 0xd8d4c8, ix, by + 8.4 + k * 0.62, iz));
  props.push(gpart(new THREE.CylinderGeometry(1.6, 1.3, 0.3, 16), 0xc9a23e, ix, by + 12.5, iz), gpart(new THREE.SphereGeometry(0.4, 10, 8), 0xe8b422, ix, by + 13.1, iz));
  addSolid(blk, { x0: ix - 3.4, x1: ix + 3.4, z0: iz - 3.4, z1: iz + 3.4, h: 16, kind: 'bld' });
  // 五龙亭 on the north shore
  for (let k = -2; k <= 2; k++) { const px = cx + k * 7, pz = m.z0 + 4.5; for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) props.push(box(px + ax * 1.4, 1.6, pz + az * 1.4, 0.22, 2.6, 0.22, 0x9b2d24)); pyramidRoof(A.green, px, pz, 3.4, 2.9, 1.3, 0.5); }
  for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; W.palmList.push(newProp(cx + Math.cos(a) * ((m.x1 - m.x0) / 2 - 1.2), cz - 2 + Math.sin(a) * ((m.z1 - m.z0) / 2 - 2.5), rand(0.85, 1.05), 'palm', blk)); }
  flushAcc(A); Build.props.push(...props);
  W.landmarks.beihai = { x: ix, z: iz, top: by + 13 };
}
function genYonghegong(b) { // 雍和宫
  const A = acc3(), props = [], r = b.rect, cx = (r.x0 + r.x1) / 2;
  const q = [...palaceWall(A, r.x0 + 3, r.z0 + 3, r.x1 - 3, r.z0 + 3, 3.4, 0.8), ...palaceWall(A, r.x0 + 3, r.z1 - 3, r.x1 - 3, r.z1 - 3, 3.4, 0.8, [[cx - 2.4, cx + 2.4]]),
    ...palaceWall(A, r.x0 + 3, r.z0 + 3, r.x0 + 3, r.z1 - 3, 3.4, 0.8), ...palaceWall(A, r.x1 - 3, r.z0 + 3, r.x1 - 3, r.z1 - 3, 3.4, 0.8)];
  for (const s of q) addSolid(b, Object.assign(s, { h: 4, kind: 'bld' }));
  for (let k = 0; k < 3; k++) { const hz = r.z1 - 12 - k * 11; hall(A, props, cx, hz, 18 - k * 2, 6, 0.3 + k * 0.4, 3.8 + k * 0.4, { double: k === 2 }); addSolid(b, { x0: cx - 9 + k, x1: cx + 9 - k, z0: hz - 3, z1: hz + 3, h: 10, kind: 'bld' }); }
  // 牌楼 at the gate
  for (const s of [-1, 0, 1]) props.push(box(cx + s * 3, 2.4, r.z1 + 2.5, 0.5, 4.2, 0.5, 0x9b2d24));
  gableRoof(A.yellow, cx, r.z1 + 2.5, 7.5, 1.2, 4.5, 0.9, 0, 0.5);
  BJB.incense.push([cx, r.z1 - 6]);
  flushAcc(A); Build.props.push(...props);
}
function genBJStation(b) { // 北京站: long hall + twin clock towers with green roofs
  const A = acc3(), props = [], r = b.rect, cx = (r.x0 + r.x1) / 2, z0 = r.z0 + 6, z1 = r.z1 - 14;
  boxW(A.white, r.x0 + 3, 0.3, z0, r.x1 - 3, 9.3, z1, 3);
  latticeFace(A.lattice, 's', r.x0 + 4, 0.3, z0, r.x1 - 4, 6.3, z1 + 0.03);
  hipRoof(A.green, cx, (z0 + z1) / 2, r.x1 - r.x0 - 6, z1 - z0, 9.3, 2.2, 0, 0.6);
  boxW(A.white, cx - 7, 9.3, z1 - 8, cx + 7, 13.3, z1 - 1, 3, 'nsew'); hipRoof(A.green, cx, z1 - 4.5, 14, 7, 13.3, 2.6, 0, 0.8);
  for (const s of [-1, 1]) {
    const tx = cx + s * 13;
    boxW(A.white, tx - 2.4, 9.3, z1 - 4, tx + 2.4, 17.3, z1 + 0.8, 3, 'nsew');
    props.push(gpart(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 20), 0xf8f6f0, tx, 15, z1 + 0.9, Math.PI / 2, 0, 0), box(tx, 15.2, z1 + 1.02, 0.12, 1.0, 0.05, 0x111111), box(tx + 0.3, 15, z1 + 1.03, 0.7, 0.1, 0.05, 0x111111));
    pyramidRoof(A.green, tx, z1 - 1.6, 5.2, 17.3, 3.6, 0.7); props.push(gpart(new THREE.SphereGeometry(0.4, 8, 6), 0xe8b422, tx, 21.1, z1 - 1.6));
  }
  addSolid(b, { x0: r.x0 + 3, x1: r.x1 - 3, z0: z0, z1: z1 + 1, h: 20, kind: 'bld' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: plateTex('北 京 站', '#b91c1c', '#ffd23f'), transparent: true }));
  sign.position.set(cx, 11.4, z1 + 0.05); scene.add(sign); W.neonMats.push(sign.material);
  flushAcc(A); Build.props.push(...props);
}
function plateTex(t, bg, fg) { const c = mkCanvas(512, 112), g = c.getContext('2d'); rrect(g, 4, 4, 504, 104, 10); g.fillStyle = bg; g.fill(); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 470, 78, 900); g.fillText(t, 256, 60); return tex(c); }
function genCornerTower(b, opts = {}) { // 东南角楼 / 德胜门箭楼: brick fortress with rows of arrow windows
  const A = acc3(), props = [], r = b.rect, cx = opts.x ?? (r.x0 + r.x1) / 2, cz = opts.z ?? (r.z0 + r.z1) / 2, w = opts.w ?? 22, d = opts.d ?? 12;
  boxW(A.grey, cx - w / 2, 0.3, cz - d / 2, cx + w / 2, 10.3, cz + d / 2, 2.5);
  boxW(A.grey, cx - w / 2 + 1, 10.3, cz - d / 2 + 1, cx + w / 2 - 1, 16.3, cz + d / 2 - 1, 2.5);
  for (let row = 0; row < 4; row++) for (let k = 0; k < Math.floor(w / 2.2); k++) props.push(box(cx - w / 2 + 2 + k * 2.2, 11 + row * 1.35, cz + d / 2 - 0.98, 0.6, 0.6, 0.06, 0x16120e));
  hipRoof(A.roof, cx, cz, w + 0.5, d + 0.5, 16.3, 4.0, 0, 1.2);
  addSolid(b, { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: 22, kind: 'bld' });
  // a run of crenellated city wall
  if (opts.wall) {
    const [wx0, wz0, wx1, wz1] = opts.wall;
    boxW(A.grey, wx0, 0.3, wz0, wx1, 8.3, wz1, 2.5);
    const alongX = wx1 - wx0 > wz1 - wz0;
    for (let s = 0; s < (alongX ? wx1 - wx0 : wz1 - wz0); s += 2) props.push(alongX ? box(wx0 + s + 0.5, 8.9, wz1 - 0.3, 1, 1.2, 0.6, 0x8d9095) : box(wx1 - 0.3, 8.9, wz0 + s + 0.5, 0.6, 1.2, 1, 0x8d9095));
    addSolid(b, { x0: wx0, x1: wx1, z0: wz0, z1: wz1, h: 9, kind: 'bld' });
  }
  flushAcc(A); Build.props.push(...props);
}
function genOlympic(m) { // 鸟巢 + 水立方
  const props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
  // 水立方: blue bubble box
  const cubeX = m.x0 + 22;
  const cubeMat = new THREE.MeshLambertMaterial({ map: bubbleTex(), color: 0x9fd8ff, emissive: 0x1a5fb4, emissiveIntensity: 0.25 });
  const cube = new THREE.Mesh(buildingGeo(24, 9, 24), [cubeMat, cubeMat]); cube.position.set(cubeX, 0.3, cz); cube.castShadow = true; scene.add(cube);
  W.extraGlow.push(cubeMat);
  addSolid(blk, { x0: cubeX - 12, x1: cubeX + 12, z0: cz - 12, z1: cz + 12, h: 9.5, kind: 'bld' });
  // 鸟巢: a ring of criss-crossing steel beams around an elliptic bowl
  const nx = m.x1 - 24, rx = 17, rz = 14;
  props.push(gpart(new THREE.CylinderGeometry(1, 1, 9, 36, 1, true), 0x8c2f2a, nx, 4.8, cz, 0, 0, 0, rx - 1.5, 1, rz - 1.5));
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * TAU, x = nx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
    props.push(gpart(_BOX, 0x9aa1aa, x, 5, z, rand(-0.5, 0.5), -a, 0.55 + (k % 2 ? 0.25 : -0.25), 0.45, 12, 0.45));
  }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; props.push(gpart(_BOX, 0x9aa1aa, nx + Math.cos(a) * (rx - 1), 9.6, cz + Math.sin(a) * (rz - 1), 0, -a + Math.PI / 2, 0, 0.5, 0.5, rx * TAU / 24 + 1)); }
  addSolid(blk, { x0: nx - rx, x1: nx + rx, z0: cz - rz, z1: cz + rz, h: 11, kind: 'bld' });
  Build.props.push(...props);
  m.ground = 'plaza';
}
function bubbleTex() { const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'); g.fillStyle = '#cfe9ff'; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(40,110,190,.55)'; g.lineWidth = 3; for (let k = 0; k < 90; k++) { g.beginPath(); g.arc(rand(S), rand(S), rand(8, 26), 0, TAU); g.stroke(); } return tex(c, true); }
function genYongdingmen(m) { // 永定门 + 中轴线公园
  const A = acc3(), props = [], blk = m.blk, cx = (m.x0 + m.x1) / 2, gz = m.z0 + 12;
  gateBase(A, props, cx, gz, 26, 8, 7.5, true, 'grey');
  addSolid(blk, { x0: cx - 13, x1: cx + 13, z0: gz - 4, z1: gz + 4, h: 18, kind: 'bld' });
  hall(A, props, cx, gz, 20, 6, 7.8, 4.2, { roof: 'roof', double: true });
  for (let k = 0; k < 30; k++) BJB.trees.push([blk, rand(m.x0 + 3, m.x1 - 3), rand(gz + 7, m.z1 - 3), rand(0.8, 1.2)]);
  flushAcc(A); Build.props.push(...props);
  m.ground = 'grass';
}
function genCBDTower(b) { // 中国尊 = 中央算力塔: wide base, pinched waist, flared crown
  const r = b.rect, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const fac = Render.cutout(new THREE.MeshPhongMaterial({ color: 0xa9bdd6, map: TEX.curtain, emissive: 0xffc940, emissiveMap: TEX.curtainE, emissiveIntensity: 0.5, shininess: 70 }));
  W.towerMat = fac;
  const pts = []; const H = 104;
  for (let k = 0; k <= 12; k++) { const t = k / 12, w = 11.5 - 3.2 * Math.sin(t * Math.PI) + (t > 0.9 ? (t - 0.9) * 14 : 0); pts.push(new THREE.Vector2(w, t * H)); }
  const g = new THREE.LatheGeometry(pts, 4, Math.PI / 4); g.rotateY(0); // square-ish lathe = 尊
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * H / 16);
  const mesh = new THREE.Mesh(g, fac); mesh.position.set(cx, 0.3, cz); mesh.castShadow = true; scene.add(mesh);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(18, 2.5, 18), Render.cutout(new THREE.MeshBasicMaterial({ color: 0xffc940 }))); crown.position.set(cx, H + 0.3, cz); crown.rotation.y = 0; scene.add(crown); W.neonMats.push(crown.material);
  Build.props.push(box(cx, H + 11, cz, 0.6, 20, 0.6, 0x8a929c));
  Build.reds.push(box(cx, H + 21.5, cz, 1.2, 1.2, 1.2, 0xffffff));
  W.special.tower = addSolid(b, { x0: cx - 11, x1: cx + 11, z0: cz - 11, z1: cz + 11, h: H, kind: 'special', mesh });
  const signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signTex('中央算力塔', 'CITIC 尊 · CENTRAL COMPUTE', '#7a5a10', '#ffc940'), transparent: true })); W.neonMats.push(signMat);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), signMat); sign.position.set(cx, 18, cz + 11.4); scene.add(sign);
  W.towerPos = new V3(cx, 0, cz);
}
function gen798(b) { // 798 art district: red-brick sawtooth factories + chimneys + graffiti
  const A = acc3(), props = [], r = b.rect;
  const brickRed = Render.cutout(new THREE.MeshLambertMaterial({ map: brickTex('#9b5a44', '#6b4436') }));
  const acc = new GeoAcc();
  for (let k = 0; k < 2; k++) {
    const z0 = r.z0 + 4 + k * 20, z1 = z0 + 16;
    boxW(acc, r.x0 + 4, 0.3, z0, r.x1 - 4, 7.3, z1, 2.5);
    for (let s = 0; s < 6; s++) { const x = r.x0 + 4 + s * ((r.x1 - r.x0 - 8) / 6); props.push(gpart(new THREE.CylinderGeometry(2.2, 2.2, (r.x1 - r.x0 - 8) / 6, 3, 1), 0x7c8591, x + (r.x1 - r.x0 - 8) / 12, 8.4, (z0 + z1) / 2, 0, 0, Math.PI / 2, 1, 1, 3.6)); }
    addSolid(b, { x0: r.x0 + 4, x1: r.x1 - 4, z0, z1, h: 10, kind: 'bld' });
  }
  props.push(gpart(new THREE.CylinderGeometry(0.9, 1.3, 26, 12), 0x8d5a48, r.x1 - 6, 13.3, r.z1 - 4));
  for (let k = 0; k < 5; k++) props.push(box(rand(r.x0 + 6, r.x1 - 6), rand(2, 5), r.z1 - 7.97, rand(2, 5), rand(1, 3), 0.05, pick([0xff3d8b, 0x38e1ff, 0xffd23f, 0x7cff6b, 0xc084fc])));
  Build.add(brickRed, acc.geo());
  flushAcc(A); Build.props.push(...props);
}

/* ---------- water bodies (share one lake shader) ---------- */
function addWater(s) { W.water.push(s); if (!s.deco) W.waterSolid.push(s); }
function addDry(s) { W.dry.push(s); }
function inShape(s, x, z) { return s.ellipse ? ((x - s.x) / s.rx) ** 2 + ((z - s.z) / s.rz) ** 2 < 1 : x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1; }
function wetAt(x, z) {
  for (const s of W.waterSolid) if (inShape(s, x, z)) { for (const d of W.dry) if (inShape(d, x, z)) return false; return true; }
  return false;
}
function pushOutOfWater(pos) {
  if (!W.waterSolid.length || !wetAt(pos.x, pos.z)) return null;
  for (let s = 0.35; s <= 8; s += 0.35) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, x = pos.x + Math.cos(a) * s, z = pos.z + Math.sin(a) * s;
    if (!wetAt(x, z)) { pos.x = x; pos.z = z; return { b: null, nx: Math.cos(a), nz: Math.sin(a), water: true }; }
  }
  return null;
}

/* ---------- final instanced dressing: bikes, lanterns, signs, boats, incense ---------- */
function finishBeijing() {
  // hutong street plates
  if (BJB.signQuads.length) {
    const acc = new GeoAcc();
    for (const q of BJB.signQuads) {
      const u0 = (q.idx % 4) / 4, v1 = 1 - Math.floor(q.idx / 4) / 4, u1 = u0 + 0.25, v0 = v1 - 0.25, w = 1.6, h = 0.4;
      if (q.face === 'w') acc.quad([q.x, q.y - h / 2, q.z + w / 2], [q.x, q.y - h / 2, q.z - w / 2], [q.x, q.y + h / 2, q.z - w / 2], [q.x, q.y + h / 2, q.z + w / 2], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      else acc.quad([q.x, q.y - h / 2, q.z - w / 2], [q.x, q.y - h / 2, q.z + w / 2], [q.x, q.y + h / 2, q.z + w / 2], [q.x, q.y + h / 2, q.z - w / 2], [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
    }
    const m = new THREE.Mesh(acc.geo(), Render.cutout(new THREE.MeshLambertMaterial({ map: hutongSignAtlas() }))); scene.add(m);
  }
  // red lanterns (glow at night through W.neonMats)
  if (BJB.lanterns.length) {
    const parts = []; for (const [x, y, z] of BJB.lanterns) lantern(parts, x, y, z, 0.9);
    const m = new THREE.Mesh(mergeParts(parts), BJ.mats.lantern); scene.add(m);
  }
  // shared bikes (共享单车)
  if (BJB.bikes.length) {
    const bikeGeo = mergeParts([
      gpart(new THREE.TorusGeometry(0.34, 0.05, 3, 10), 0x222222, 0, 0.36, 0.52, 0, Math.PI / 2, 0), gpart(new THREE.TorusGeometry(0.34, 0.05, 3, 10), 0x222222, 0, 0.36, -0.52, 0, Math.PI / 2, 0),
      box(0, 0.62, 0, 0.08, 0.08, 1.05, 0xff7a1a), box(0, 0.8, -0.25, 0.08, 0.4, 0.08, 0xff7a1a), box(0, 1.0, -0.25, 0.22, 0.06, 0.34, 0x222222), box(0, 1.02, 0.45, 0.5, 0.06, 0.06, 0x333333), box(0, 0.85, 0.5, 0.26, 0.2, 0.2, 0xffd23f),
    ]);
    const items = BJB.bikes.map((b) => ({ x: b.x, z: b.z, ry: b.ry }));
    chunkInstances(items, [[bikeGeo, MAT.vc, 'cm', false]], 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const b of items) { m4.compose(new V3(b.x, groundH(b.x, b.z), b.z), q.setFromAxisAngle(UP, b.ry), new V3(1, 1, 1)); b.cm.setMatrixAt(b.ci, m4); }
  }
  // duck boats on the lakes
  if (BJB.boats.length) {
    const parts = [];
    for (const [x, z, ry] of BJB.boats) { parts.push(box(x, 0.55, z, 1.6, 0.5, 2.6, 0xf6d23a, ry), gpart(new THREE.SphereGeometry(0.45, 8, 6), 0xf6d23a, x + Math.sin(ry) * 1.3, 1.2, z + Math.cos(ry) * 1.3), box(x + Math.sin(ry) * 1.7, 1.2, z + Math.cos(ry) * 1.7, 0.2, 0.12, 0.35, 0xff7a1a, ry)); }
    const m = new THREE.Mesh(mergeParts(parts), MAT.vc); m.castShadow = true; scene.add(m); W.boats = m;
  }
  // neon bar signs
  for (const nb of BJB.neonBoxes) {
    const g = new THREE.PlaneGeometry(nb.w, nb.w * 0.25), idx = randi(0, 7), uv = g.attributes.uv, u0 = (idx % 2) * 0.5, v0 = 1 - (Math.floor(idx / 2) + 1) * 0.25;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.25);
    const m = new THREE.Mesh(g, nb.mat); m.position.set(nb.x, nb.y, nb.z); scene.add(m);
  }
}
