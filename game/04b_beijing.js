/* ============================================================
   老北京 generators: 胡同 blocks of 四合院 + 老字号 shop rows,
   and the landmarks — 故宫, 景山, 钟鼓楼, 前门, 天坛, 什刹海,
   北海白塔, 雍和宫, 北京站, 东南角楼, 德胜门, 奥林匹克公园,
   永定门, CBD 中国尊, 798, 朝阳公园 …
   ============================================================ */
const HUTONG_NAMES = ['帽儿胡同', '菊儿胡同', '雨儿胡同', '东棉花胡同', '北兵马司', '黑芝麻胡同', '沙井胡同', '板厂胡同',
  '史家胡同', '东四三条', '烟袋斜街', '大金丝胡同', '南锣鼓巷', '方家胡同', '炒豆胡同', '小经厂胡同'];
// blue enamel street plates, 8 x 8 atlas of 256 x 64 cells (the real lane names, longest lanes first)
function hutongSignAtlas(names = HUTONG_NAMES) {
  const c = mkCanvas(2048, 512), g = c.getContext('2d');
  names.slice(0, 64).forEach((n, i) => {
    const x = (i % 8) * 256, y = Math.floor(i / 8) * 64;
    rrect(g, x + 4, y + 4, 248, 56, 6); g.fillStyle = '#1d3f8f'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#f5f5f5'; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, n, 224, 36, 900); g.fillText(n, x + 128, y + 30);
    g.font = '700 11px sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('东城区 · 西城区', x + 128, y + 52);
  });
  return tex(c);
}
const BJB = { signs: null, bikes: [], signQuads: [], lanterns: [], trees: [], cypress: [], boats: [], neonBoxes: [], incense: [], flowers: [], barMat: null, plateNames: null };

/* ---------- small helpers ---------- */
// one accumulator per material; the tile accumulators know their set (acc.A) so a roof can add its eave band / gable ends
const ACC_MATS = [['brick', 'brick'], ['roof', 'roofGrey'], ['lattice', 'lattice'], ['red', 'redWall'], ['yellow', 'roofYellow'], ['green', 'roofGreen'], ['blue', 'roofBlue'],
  ['white', 'white'], ['marble', 'marble'], ['grey', 'greyBrick'], ['lacq', 'lacquer'], ['caihua', 'caihua'], ['dougong', 'dougong'], ['eave', 'eave'], ['doors', 'doors']];
function acc3() {
  const A = { shops: BJ.oldShopMats.map(() => new GeoAcc()) };
  for (const [k] of ACC_MATS) { A[k] = new GeoAcc(); A[k].A = A; }
  A.gable = A.red;
  return A;
}
function flushAcc(A) {
  for (const [k, mk] of ACC_MATS) if (!A[k].empty) Build.add(BJ.mats[mk], A[k].geo());
  A.shops.forEach((a, k) => { if (!a.empty) Build.add(BJ.oldShopMats[k], a.geo()); });
  Portals.flush();
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
// 灯笼: a round paper body with darker ribs, gilded caps and a tassel (smooth: they're instanced, the tris are cheap)
function lantern(parts, x, y, z, s = 1) {
  parts.push(gpart(new THREE.SphereGeometry(0.36 * s, 12, 8), 0xe0301e, x, y, z, 0, 0, 0, 1, 0.92, 1));
  for (let k = 0; k < 2; k++) parts.push(gpart(new THREE.TorusGeometry(0.36 * s, 0.012 * s, 3, 14), 0x9a1810, x, y, z, 0, (k / 2) * Math.PI + 0.4, 0, 1, 0.92, 1));
  parts.push(gpart(new THREE.CylinderGeometry(0.15 * s, 0.17 * s, 0.09 * s, 12), 0xf0c040, x, y + 0.34 * s, z), gpart(new THREE.CylinderGeometry(0.17 * s, 0.15 * s, 0.09 * s, 12), 0xf0c040, x, y - 0.34 * s, z));
  parts.push(gpart(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.3 * s, 5), 0xf0c040, x, y + 0.52 * s, z), gpart(new THREE.CylinderGeometry(0.03 * s, 0.07 * s, 0.3 * s, 8), 0xe8b030, x, y - 0.54 * s, z));
}
function addSign(x, y, z, face, idx) { BJB.signQuads.push({ x, y, z, ry: { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[face] || 0, idx: idx ?? randi(0, 15) }); }
const BIKE_COLS = [0xffc81e, 0xffc81e, 0x2f7cf6, 0x2f7cf6, 0x34c759, 0xff7a1a]; // 共享单车: yellow, blue, green, orange
function addBike(x, z, ry, c = pick(BIKE_COLS)) { BJB.bikes.push({ x, z, ry, c }); }

/* ---------- red palace wall with yellow coping ---------- */
// a smooth curved wall (回音壁, rounded corners): outer + inner faces, a tiled coping, and small colliders along the arc
function arcWall(A, cx, cz, R, a0, a1, h, t, n, tile = 'yellow') {
  const solids = [], y0 = 0.3, y1 = 0.3 + h, ro = R + t / 2, ri = R - t / 2, rc = R + t / 2 + 0.3;
  for (let k = 0; k < n; k++) {
    const u0 = a0 + (a1 - a0) * (k / n), u1 = a0 + (a1 - a0) * ((k + 1) / n);
    const P = (r, a, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    const L = R * Math.abs(u1 - u0), s0 = R * Math.abs(u0 - a0), s1 = s0 + L;
    A.red.quad(P(ro, u1, y0), P(ro, u0, y0), P(ro, u0, y1), P(ro, u1, y1), [s1, y0], [s0, y0], [s0, y1], [s1, y1]);
    A.red.quad(P(ri, u0, y0), P(ri, u1, y0), P(ri, u1, y1), P(ri, u0, y1), [s0, y0], [s1, y0], [s1, y1], [s0, y1]);
    // coping: two tiled slopes meeting at a ridge over the wall's centre line
    const yr = y1 + 0.55;
    A[tile].quad(P(rc, u1, y1), P(rc, u0, y1), P(R, u0, yr), P(R, u1, yr), [s1, 0], [s0, 0], [s0, 0.8], [s1, 0.8]);
    A[tile].quad(P(R - t / 2 - 0.3, u0, y1), P(R - t / 2 - 0.3, u1, y1), P(R, u1, yr), P(R, u0, yr), [s0, 0], [s1, 0], [s1, 0.8], [s0, 0.8]);
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
  const c = alongX ? z0 : x0, yb = 0.3 + Math.min(1.0, h * 0.2), tb = t / 2 + 0.08;
  for (const [s0, s1] of segs) {
    // 下碱: grey brick plinth, a little proud of the red plaster
    if (h > 2) { if (alongX) boxW(A.grey, s0, 0, c - tb, s1, yb, c + tb, 3); else boxW(A.grey, c - tb, 0, s0, c + tb, yb, s1, 3); }
    // the coping: a low double slope with a good overhang (a steep narrow one reads as a tent from the courtyards)
    if (alongX) { boxW(A.red, s0, 0.3, c - t / 2, s1, 0.3 + h, c + t / 2, 3, 'nsew'); gableRoof(A.yellow, (s0 + s1) / 2, c, s1 - s0, t, 0.3 + h, 0.42, 0, 0.45); }
    else { boxW(A.red, c - t / 2, 0.3, s0, c + t / 2, 0.3 + h, s1, 3, 'nsew'); gableRoof(A.yellow, c, (s0 + s1) / 2, s1 - s0, t, 0.3 + h, 0.42, 1, 0.45); }
  }
  return segs.map(([s0, s1]) => (alongX ? { x0: s0, x1: s1, z0: c - t / 2, z1: c + t / 2 } : { x0: c - t / 2, x1: c + t / 2, z0: s0, z1: s1 }));
}
// a lacquered column on a stone base (柱础)
function column(A, x, z, y0, hc, r) {
  cylW(A.lacq, x, z, r, y0 + 0.2, y0 + hc, 10);
  cylW(A.marble, x, z, r * 1.4, y0, y0 + 0.2, 10); discTop(A.marble, x, z, r * 1.4, y0 + 0.2, 10);
}
// a box whose four sides carry a band texture running along them (彩画 beams, 斗拱 rows): u = metres / per, v over the height
function bandBox(acc, x0, y0, z0, x1, y1, z1, per, bottom = true) {
  const u = (s) => s / per;
  acc.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [u(x0), 0.12], [u(x1), 0.12], [u(x1), 1], [u(x0), 1]);
  acc.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [u(x1), 0.12], [u(x0), 0.12], [u(x0), 1], [u(x1), 1]);
  acc.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [u(z1), 0.12], [u(z0), 0.12], [u(z0), 1], [u(z1), 1]);
  acc.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [u(z0), 0.12], [u(z1), 0.12], [u(z1), 1], [u(z0), 1]);
  if (bottom) acc.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0.04], [0.05, 0.04], [0.05, 0.06], [0, 0.06]);
}
// 格扇门 across a face: bays of 4 leaves between the columns (the texture holds 2 bays)
function doorFace(acc, face, x0, y0, z, x1, y1, bays) {
  if (face === 's') acc.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0], [bays / 2, 0], [bays / 2, 1], [0, 1]);
  else acc.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], [0, 0], [bays / 2, 0], [bays / 2, 1], [0, 1]);
}
// the timber frame of a hall between y0 and y0 + h: a colonnade (front, and back with o.north) before door walls, 彩画 architrave,
// a row of 斗拱 under the eave. Returns the inset wall line
function hallBody(A, x0, z0, x1, z1, y0, h, o = {}) {
  const w = x1 - x0, d = z1 - z0, vd = clamp(d * 0.13, 0.7, 1.7), zi1 = z1 - vd, zi0 = o.north ? z0 + vd : z0;
  const beam = clamp(h * 0.13, 0.4, 0.95), brk = clamp(h * 0.1, 0.32, 0.8), hc = h - beam - brk;
  const nb = o.bays || Math.max(2, Math.round((w - 0.8) / 3.8)), cr = clamp(w * 0.01 + 0.14, 0.2, 0.46), bay = (w - 0.8) / nb;
  boxW(A.red, x0 + 0.3, y0, zi0, x1 - 0.3, y0 + hc, zi1, 3, o.north ? 'ew' : 'new');
  doorFace(A.doors, 's', x0 + 0.3, y0 + 0.15, zi1 + 0.01, x1 - 0.3, y0 + hc, nb);
  if (o.north) doorFace(A.doors, 'n', x0 + 0.3, y0 + 0.15, zi0 - 0.01, x1 - 0.3, y0 + hc, nb);
  for (let i = 0; i <= nb; i++) {
    const x = x0 + 0.4 + bay * i;
    column(A, x, z1 - 0.4, y0, hc, cr);
    if (o.north) column(A, x, z0 + 0.4, y0, hc, cr);
  }
  bandBox(A.caihua, x0 + 0.1, y0 + hc, z0 + 0.1, x1 - 0.1, y0 + hc + beam, z1 - 0.1, bay * 2);
  bandBox(A.dougong, x0 - 0.12, y0 + hc + beam, z0 - 0.12, x1 + 0.12, y0 + h + 0.02, z1 + 0.12, 5.2, false);
  return { zi0, zi1, hc };
}
// a classical hall: red columns + 格扇 doors + 彩画 + 斗拱, on an optional platform, under a (double) hip roof with swept eaves
function hall(A, props, cx, cz, w, d, y0, h, o = {}) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  hallBody(A, x0, z0, x1, z1, y0, h, o);
  const R = A[o.roof || 'yellow'], rh = o.rh || d * 0.42;
  let top;
  if (o.double) {
    // 重檐: a short skirt roof, then a clerestory storey and the main roof
    const y1 = y0 + h, ux0 = x0 + 1.3, ux1 = x1 - 1.3, uz0 = z0 + 1.3, uz1 = z1 - 1.3, uy0 = y1 + h * 0.12, uh = h * 0.3;
    hipRoof(R, cx, cz, w, d, y1, h * 0.26, 0, 1.3, clamp(0.06 * d, 0.25, 0.9));
    boxW(A.red, ux0 + 0.2, uy0 - h * 0.12, uz0 + 0.2, ux1 - 0.2, uy0 + uh * 0.55, uz1 - 0.2, 3, 'nsew');
    doorFace(A.doors, 's', ux0 + 0.2, uy0 - 0.1, uz1 - 0.18, ux1 - 0.2, uy0 + uh * 0.55, Math.max(2, Math.round((ux1 - ux0) / 3.8)));
    bandBox(A.caihua, ux0, uy0 + uh * 0.55, uz0, ux1, uy0 + uh * 0.78, uz1, 7.6);
    bandBox(A.dougong, ux0 - 0.1, uy0 + uh * 0.78, uz0 - 0.1, ux1 + 0.1, uy0 + uh + 0.02, uz1 + 0.1, 5.2, false);
    hipRoof(R, cx, cz, ux1 - ux0, uz1 - uz0, uy0 + uh, rh, 0, 1.1);
    top = uy0 + uh + rh;
  } else if (o.gable) { gableRoof(R, cx, cz, w, d, y0 + h, rh, 0, 0.8); top = y0 + h + rh; }
  else { hipRoof(R, cx, cz, w, d, y0 + h, rh, 0, 1.0); top = y0 + h + rh; }
  void props;
  return { x0, x1, z0, z1, top };
}
// 汉白玉 balustrade along a rectangle's edge at height y (posts + a rail), with a gap on the south side for the stair
function balustrade(A, x0, z0, x1, z1, y, gap = 0) {
  const P = 1.7, ph = 0.95, cx = (x0 + x1) / 2;
  const run = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / P));
    for (let i = 0; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (gap && az === z1 && bz === z1 && Math.abs(x - cx) < gap / 2) continue;
      boxW(A.marble, x - 0.12, y, z - 0.12, x + 0.12, y + ph, z + 0.12, 2, 'nsewt');
    }
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const segs = gap && az === z1 && bz === z1 ? [[ax, cx - gap / 2], [cx + gap / 2, bx]] : [[along ? ax : az, along ? bx : bz]];
    for (let [s0, s1] of segs) {
      if (s0 > s1) [s0, s1] = [s1, s0];
      if (along) boxW(A.marble, s0, y + ph * 0.55, az - 0.07, s1, y + ph * 0.72, az + 0.07, 2, 'nst'), boxW(A.marble, s0, y + 0.08, az - 0.09, s1, y + 0.2, az + 0.09, 2, 'nst');
      else boxW(A.marble, ax - 0.07, y + ph * 0.55, s0, ax + 0.07, y + ph * 0.72, s1, 2, 'ewt'), boxW(A.marble, ax - 0.09, y + 0.08, s0, ax + 0.09, y + 0.2, s1, 2, 'ewt');
    }
  };
  run(x0, z0, x1, z0); run(x1, z1, x0, z1); run(x0, z0, x0, z1); run(x1, z0, x1, z1);
}
// stepped white marble terrace (三台), also registered as walkable platforms
function terrace(A, cx, cz, w, d, tiers = 3, th = 0.8, shrink = 2) {
  let y = 0.3;
  for (let k = 0; k < tiers; k++) {
    const ww = w - k * shrink * 2, dd = d - k * shrink * 2 * (d / w), x0 = cx - ww / 2, x1 = cx + ww / 2, z0 = cz - dd / 2, z1 = cz + dd / 2;
    boxW(A.marble, x0, y, z0, x1, y + th, z1, 2.5);
    // a plinth moulding and a front stair (踏跺) in the middle
    boxW(A.marble, x0 - 0.12, y, z0 - 0.12, x1 + 0.12, y + 0.18, z1 + 0.12, 2, 'nsew');
    const sw = Math.min(8, ww * 0.25), steps = Math.max(2, Math.round(th / 0.18));
    for (let i = 0; i < steps; i++) boxW(A.marble, cx - sw / 2, y, z1 + (steps - i - 1) * 0.3, cx + sw / 2, y + th * (i + 1) / steps, z1 + (steps - i) * 0.3, 2, 'sewt');
    y += th;
    if (tiers > 1 || th >= 1) balustrade(A, x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15, y, sw + 0.4);
    W.platforms.push({ x0, x1, z0, z1, h: y });
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
// a big brick city-gate base (墩台) with a real walk-through 门洞 (aw wide: the callers leave that gap in their solids), then a tower on top
function gateBase(A, props, cx, cz, w, d, h, arch = true, mat = 'grey', aw = 4.8) {
  const z0 = cz - d / 2, z1 = cz + d / 2, y1 = 0.3 + h;
  if (!arch) { boxW(A[mat], cx - w / 2, 0.3, z0, cx + w / 2, y1, z1, 2.5); return; }
  boxW(A[mat], cx - w / 2, 0.3, z0, cx - aw / 2, y1, z1, 2.5); boxW(A[mat], cx + aw / 2, 0.3, z0, cx + w / 2, y1, z1, 2.5);
  archTop(A[mat], cx, z0, z1, 0.3 + h * 0.55, y1, aw);
  void props;
}
// a quad wound so its normal points along wd (GeoAcc takes the normal from the winding)
function quadTo(acc, a, b, c, d, ua, ub, uc, ud, wd) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  if ((uy * vz - uz * vy) * wd[0] + (uz * vx - ux * vz) * wd[1] + (ux * vy - uy * vx) * wd[2] >= 0) acc.quad(a, b, c, d, ua, ub, uc, ud); else acc.quad(d, c, b, a, ud, uc, ub, ua);
}
// the wall block over a walk-through arch (门洞) in a wall running along x (faces at z0 / z1): both faces with a round-headed
// hole, the top, and the barrel vault inside. The piers either side are ordinary boxes (their inner faces are the passage walls).
// Opening aw wide, springing line at ys (the vault rises aw / 2 above it), block top y1
function archTop(acc, cx, z0, z1, ys, y1, aw, n = 14) {
  const r = aw / 2, U = (p) => [p[0], p[1]];
  boxW(acc, cx - r, ys, z0, cx + r, y1, z1, 3, 't');
  let s = 0;
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n, x0 = cx + Math.cos(a0) * r, x1 = cx + Math.cos(a1) * r, y0 = ys + Math.sin(a0) * r, ya = ys + Math.sin(a1) * r;
    const t0 = cx + r - 2 * r * k / n, t1 = cx + r - 2 * r * (k + 1) / n;
    // the faces: the strip between this arc segment and the matching stretch of the top edge
    for (const [z, sz] of [[z1, 1], [z0, -1]]) { const p = [[x0, y0, z], [x1, ya, z], [t1, y1, z], [t0, y1, z]]; quadTo(acc, ...p, ...p.map(U), [0, 0, sz]); }
    // the vault, facing the passage axis
    const L = Math.hypot(x1 - x0, ya - y0);
    quadTo(acc, [x0, y0, z1], [x1, ya, z1], [x1, ya, z0], [x0, y0, z0], [s, z1], [s + L, z1], [s + L, z0], [s, z0], [cx - (x0 + x1) / 2, ys - (y0 + ya) / 2, 0]);
    s += L;
  }
}

/* ---------- painted-on openings with depth: side arches, doors, arrow windows ----------
   One quad just in front of the wall per opening; its fragments trace the view ray into a tunnel D deep (the rect + a barrel
   vault on it, or a flat lintel): lining walls that darken away from the mouth, a stone floor, and at the far end daylight
   (kind 1, a passage), a dark room (0) or closed red doors (2). The outline is cut in the shader, so the quad is all it costs. */
const PORTAL_GLSL = [
  'vec3 pOpen = vec3(0.0);',
  '{ float w = vArch.x, hs = abs(vArch.y), D = vArch.z, kind = vArch.w, r = vArch.y > 0.0 ? w * 0.5 : 0.0; vec2 q = vPq;',
  '  if (q.y > hs && (r == 0.0 || length(q - vec2(w * 0.5, hs)) > r)) discard;',
  '  vec3 N = normalize(vPn), T = vec3(N.z, 0.0, -N.x), V = normalize(vGtaW - cameraPosition);',
  '  vec3 d = vec3(dot(V, T), V.y, max(-dot(V, N), 0.03));',
  '  float tE = D / d.z, tF = d.y < 0.0 ? -q.y / d.y : 1e9, tS = d.x > 0.0 ? (w - q.x) / d.x : d.x < 0.0 ? -q.x / d.x : 1e9, tW = tS;',
  '  if (q.y + d.y * tS > hs + 1e-3) tW = 1e9;',
  '  if (r > 0.0) { vec2 o = q - vec2(w * 0.5, hs); float a = dot(d.xy, d.xy), b = dot(o, d.xy), c = dot(o, o) - r * r, e = b * b - a * c;',
  '    if (a > 1e-6 && e > 0.0) { float t1 = (-b + sqrt(e)) / a; if (q.y + d.y * t1 >= hs - 1e-3) tW = min(tW, t1); } }',
  '  else if (d.y > 0.0) tW = min(tW, (hs - q.y) / d.y);',
  '  if (tW > 1e8) tW = tS;',
  '  float t = min(tE, min(tF, tW)); vec3 h = vec3(q, 0.0) + d * t;',
  // daylight reaches in from the mouth (and from the far end of a passage); the middle of a long one is dim
  '  float le = abs(kind - 1.0) < 0.5 ? exp(-(D - h.z) * 0.4) : 0.0, occ = 0.07 + 0.93 * max(exp(-h.z * 0.55), le * 0.75);',
  '  vec3 c;',
  '  if (t == tE) {',
  '    if (kind > 1.5) { float st = step(0.7, fract(h.x * 2.6)) * step(0.7, fract(h.y * 2.6)); c = mix(vec3(0.2, 0.018, 0.012), vec3(0.5, 0.33, 0.06), st) * (0.12 + 0.88 * exp(-D * 0.55)); }',
  '    else if (kind > 0.5) {',
  '      c = vec3(0.0);',
  '#ifdef USE_FOG',
  '      pOpen = fogColor * mix(0.5, 1.0, smoothstep(0.0, 1.6, h.y));',
  '#else',
  '      pOpen = vec3(0.35, 0.36, 0.38);',
  '#endif',
  '    } else c = vec3(0.004);',
  '  } else if (t == tF) c = vec3(0.2, 0.19, 0.17) * occ;',
  '  else { vec2 bq = vec2(h.z * 3.6 + step(0.5, fract(h.y * 4.0)) * 0.5, h.y * 4.0); c = gtaLin(vPCol) * occ * (0.86 + 0.14 * fract(sin(dot(floor(bq), vec2(12.99, 78.23))) * 43758.5)) * mix(0.8, 1.0, step(0.08, fract(bq.y))); }',
  '  diffuseColor.rgb = c; }',
].join('\n');
const Portals = {
  p: [], n: [], q: [], a: [], c: [], mat: null,
  // bottom centre (x, y0, z) on the wall face, (nx, nz) its outward normal; w wide, hs to the springing line (a vault of w / 2
  // on top, or flat: a lintel at hs), D deep, kind (0 dark room · 1 passage · 2 red doors), lining colour (sRGB hex)
  add(x, y0, z, nx, nz, w, hs, D, kind = 1, col = 0x8d9095, flat = false) {
    const tx = nz, tz = -nx, H = hs + (flat ? 0 : w / 2), o = 0.035, c = new THREE.Color(col);
    const P = (u) => [x + tx * (u - w / 2) + nx * o, z + tz * (u - w / 2) + nz * o];
    for (const [u, v] of [[0, 0], [w, 0], [w, H], [0, 0], [w, H], [0, H]]) {
      const [px, pz] = P(u); this.p.push(px, y0 + v, pz); this.n.push(nx, 0, nz); this.q.push(u, v); this.a.push(w, flat ? -hs : hs, D, kind); this.c.push(c.r, c.g, c.b);
    }
  },
  material() {
    if (this.mat) return this.mat;
    const m = this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.defines = { GTA_LINEAR_IN: '' }; // the shader writes linear colours itself
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aArch; attribute vec2 aPq; attribute vec3 aPCol; varying vec4 vArch; varying vec2 vPq; varying vec3 vPn, vPCol;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vArch = aArch; vPq = aPq; vPn = normal; vPCol = aPCol;');
      sh.fragmentShader = 'varying vec4 vArch; varying vec2 vPq; varying vec3 vPn, vPCol;\n' + sh.fragmentShader.replace('#include <map_fragment>', PORTAL_GLSL)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pOpen;');
    };
    m.customProgramCacheKey = () => 'portal';
    return m;
  },
  // one mesh for what was added since the last flush (flushAcc calls this: a landmark's openings become one draw)
  flush() {
    if (!this.p.length) return;
    const g = new THREE.BufferGeometry(), F = THREE.Float32BufferAttribute;
    g.setAttribute('position', new F(this.p, 3)); g.setAttribute('normal', new F(this.n, 3)); g.setAttribute('aPq', new F(this.q, 2));
    g.setAttribute('aArch', new F(this.a, 4)); g.setAttribute('aPCol', new F(this.c, 3)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material()); m.receiveShadow = true; scene.add(m); Cull.add(m, 420);
    this.p = []; this.n = []; this.q = []; this.a = []; this.c = [];
  },
};

// lattice ring for round halls
function latticeRound(acc, cx, cz, r, y0, y1, n = 24) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    acc.quad(p1, p0, [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [((k + 1) / n) * 4, 0], [(k / n) * 4, 0], [(k / n) * 4, 1], [((k + 1) / n) * 4, 1]);
  }
}
function barNeonMat() { if (!BJB.barMat) { BJB.barMat = new THREE.MeshBasicMaterial({ map: barNeonTex(), transparent: true }); W.neonMats.push(BJB.barMat); } return BJB.barMat; }
function barNeonTex() {
  const c = mkCanvas(512, 256), g = c.getContext('2d');
  const words = [['后海酒吧', '#ff3d8b'], ['LIVE 现场', '#38e1ff'], ['胡同酒馆', '#ffd23f'], ['烟袋斜街', '#7cff6b'], ['Token Bar', '#c084fc'], ['老炮儿', '#ff7a3d'], ['京 A 啤酒', '#ffffff'], ['驻唱', '#ff4d5a']];
  words.forEach(([t, col], i) => { const x = (i % 2) * 256, y = Math.floor(i / 2) * 64; g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 230, 44, 900); g.fillText(t, x + 128, y + 34); });
  return tex(c);
}
function plateTex(t, bg, fg) { const c = mkCanvas(512, 112), g = c.getContext('2d'); rrect(g, 4, 4, 504, 104, 10); g.fillStyle = bg; g.fill(); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 470, 78, 900); g.fillText(t, 256, 60); return tex(c); }


/* ---------- final instanced dressing: signs, lanterns, neon, boats (bikes: parkBikes, after the lamps) ---------- */
// merged quads per chunk: q = {x, y, z, ry, w, h, u0, v0, u1, v1}, facing +z rotated by ry
function quadsPerChunk(list, mat, cd) {
  const byChunk = new Map();
  for (const q of list) { const k = Build.chunk(q.x, q.z); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(q); }
  for (const qs of byChunk.values()) {
    const pos = new Float32Array(qs.length * 12), nor = new Float32Array(qs.length * 12), uv = new Float32Array(qs.length * 8), idx = [];
    qs.forEach((q, k) => {
      const c = Math.cos(q.ry), s = Math.sin(q.ry), hw = q.w / 2, hh = q.h / 2;
      [[-hw, -hh, q.u0, q.v0], [hw, -hh, q.u1, q.v0], [hw, hh, q.u1, q.v1], [-hw, hh, q.u0, q.v1]].forEach(([lx, ly, u, v], j) => {
        const o = (k * 4 + j) * 3; pos[o] = q.x + lx * c; pos[o + 1] = q.y + ly; pos[o + 2] = q.z - lx * s; nor[o] = s; nor[o + 2] = c;
        uv[(k * 4 + j) * 2] = u; uv[(k * 4 + j) * 2 + 1] = v;
      });
      const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); scene.add(m); Cull.add(m, cd);
  }
}
function finishBeijing() {
  // hutong street plates (8 x 8 atlas)
  W.plates = BJB.signQuads; // [{x, y, z, ry, idx}] → BJB.plateNames[idx]
  if (BJB.signQuads.length) {
    const mat = Render.cutout(new THREE.MeshLambertMaterial({ map: hutongSignAtlas(BJB.plateNames || HUTONG_NAMES), emissive: 0x0a1633 }));
    quadsPerChunk(BJB.signQuads.map((q) => { const u0 = (q.idx % 8) / 8, v1 = 1 - Math.floor(q.idx / 8) / 8; return { x: q.x, y: q.y, z: q.z, ry: q.ry, w: 1.7, h: 0.44, u0, u1: u0 + 0.125, v0: v1 - 0.125, v1 }; }), mat, 160);
  }
  // red lanterns: instanced per chunk, they glow at night through W.neonMats
  if (BJB.lanterns.length) {
    const parts = []; lantern(parts, 0, 0, 0, 0.9);
    chunkStatic(BJB.lanterns.map(([x, y, z, s]) => ({ x, y, z, s })), mergeParts(parts), BJ.mats.lantern, 260); // [x, y, z, scale?]
  }
  // flower-bed cards (天安门 花坛): instanced per chunk, tinted per card
  if (BJB.flowers.length) chunkStatic(BJB.flowers, tuftGeo(0.8, 0.42), Render.cutout(new THREE.MeshLambertMaterial({ map: flowerBedTex(), alphaTest: 0.5, side: THREE.DoubleSide })), 260);
  // duck boats on the lakes
  if (BJB.boats.length) {
    const parts = [];
    for (const [x, z, ry] of BJB.boats) { parts.push(box(x, 0.55, z, 1.6, 0.5, 2.6, 0xf6d23a, ry), gpart(new THREE.SphereGeometry(0.45, 8, 6), 0xf6d23a, x + Math.sin(ry) * 1.3, 1.2, z + Math.cos(ry) * 1.3), box(x + Math.sin(ry) * 1.7, 1.2, z + Math.cos(ry) * 1.7, 0.2, 0.12, 0.35, 0xff7a1a, ry)); }
    const m = new THREE.Mesh(mergeParts(parts), MAT.vc); m.castShadow = true; scene.add(m); W.boats = m;
  }
  // neon bar signs (后海 / 烟袋斜街): one atlas, merged per chunk, double-sided so they read from both ends of the street
  W.bars = BJB.neonBoxes; // 后海 / 烟袋斜街 bar fronts: [{x, y, z, rot, w}]
  if (BJB.neonBoxes.length) {
    const mat = barNeonMat(); mat.side = THREE.DoubleSide;
    quadsPerChunk(BJB.neonBoxes.map((nb) => { const i = randi(0, 7), u0 = (i % 2) * 0.5, v0 = 1 - (Math.floor(i / 2) + 1) * 0.25; return { x: nb.x, y: nb.y, z: nb.z, ry: nb.rot || 0, w: nb.w, h: nb.w * 0.25, u0, u1: u0 + 0.5, v0, v1: v0 + 0.25 }; }), mat, 520);
  }
}
// 共享单车 parked in rows on the wide sidewalks, thickest at the subway exits; instanced per chunk, tinted per bike
function parkBikes() {
  const P = [0, 0, 0, 1], near = (x, z, r) => { let hit = false; forProps(x, z, r, () => { hit = true; }); return hit; };
  const okAt = (x, z) => { const k = Grid.at(x, z); return (k === GK.WALK || k === GK.FREE || k === GK.PLAZA) && Ground.roadSdf(x, z) > 0.5 && !W.doors.some((d) => dist2(x, z, d.x, d.z) < 5 * 5) && !near(x, z, 1.1); };
  const row = (e, s0, side, n) => {
    const col = pick(BIKE_COLS), mixed = Math.random() < 0.4;
    for (let k = 0; k < n; k++) {
      const s = s0 + k * 0.78; if (s < 4 || s > e.len - 4) continue;
      Roads.at(e, s, P);
      const nx = -P[3] * side, nz = P[2] * side, off = e.hw + Math.max(0.9, e.C.walk * 0.62), x = P[0] + nx * off, z = P[1] + nz * off;
      if (!okAt(x, z)) continue;
      addBike(x, z, Math.atan2(nx, nz) + Math.PI + rand(-0.12, 0.12) + (side > 0 ? 0.5 : -0.5), mixed ? pick(BIKE_COLS) : col);
    }
  };
  for (const e of Roads.edges) {
    if (e.cls < 2 || e.cls > 5 || e.C.walk < 2 || e.len < 30) continue;
    for (let s = rand(10, 90); s < e.len - 12; s += rand(110, 240)) row(e, s, Math.random() < 0.5 ? 1 : -1, randi(4, 9));
  }
  for (const st of W.stations || []) { // the bike heaps at every subway exit
    const n = Roads.nearest(st.door.x, st.door.z, 30, (e) => e.cls <= 5 && e.C.walk >= 2); if (!n) continue;
    const T = Roads.at(n.e, n.s, P), side = (st.door.x - n.x) * -T[3] + (st.door.z - n.z) * T[2] >= 0 ? 1 : -1;
    row(n.e, n.s + 5, side, randi(8, 16)); row(n.e, n.s - 18, side, randi(6, 12));
  }
  if (!BJB.bikes.length) return;
  const frame = 0xffffff, dark = 0x222222; // frame colour comes from the instance tint
  const bikeGeo = mergeParts([
    gpart(new THREE.TorusGeometry(0.34, 0.05, 3, 10), dark, 0, 0.36, 0.52, 0, Math.PI / 2, 0), gpart(new THREE.TorusGeometry(0.34, 0.05, 3, 10), dark, 0, 0.36, -0.52, 0, Math.PI / 2, 0),
    box(0, 0.62, 0, 0.08, 0.08, 1.05, frame), box(0, 0.8, -0.25, 0.08, 0.4, 0.08, frame), box(0, 0.47, 0.38, 0.06, 0.3, 0.06, frame), box(0, 1.0, -0.25, 0.22, 0.06, 0.34, dark),
    box(0, 1.02, 0.45, 0.5, 0.06, 0.06, 0x333333), box(0, 0.85, 0.6, 0.3, 0.2, 0.22, frame), box(0, 0.36, 0.52, 0.02, 0.02, 0.02, dark),
  ]);
  chunkStatic(BJB.bikes, typeof bikeParkGeo === 'function' ? bikeParkGeo() : bikeGeo, MAT.vcCut, 170); // 06a: the same frame you ride
  W.bikes = BJB.bikes;
}
// 胡同 life along the walls: potted plants and 月季 by the doors, winter stores (大白菜 under an old quilt, a 蜂窝煤 stack), old 二八
// bikes leaning on the wall (parkBikes instances them: call this first), AC units up on the walls. Instanced per chunk, near only
function hutongClutter() {
  const P = [0, 0, 0, 1], L = { pot: [], store: [], ac: [] }, dens = LOWQ ? 0.5 : 1;
  const near = (x, z, r) => { let hit = false; forProps(x, z, r, () => { hit = true; }); return hit; };
  for (const e of Roads.edges) {
    if (e.cls < 6 || e.len < 16) continue;
    Roads.at(e, e.len / 2, P); if (!inOldCity(P[0], P[1])) continue;
    for (const side of [1, -1]) for (let s = rand(2, 8); s < e.len - 2; s += rand(4, 11) / dens) {
      Roads.at(e, s, P);
      const tx = P[2], tz = P[3], nx = -tz * side, nz = tx * side, ry = Math.atan2(-nx, -nz); // ry: facing the lane
      if (Grid.at(P[0] + nx * (e.hw + 1.2), P[1] + nz * (e.hw + 1.2)) !== GK.BLD) continue; // only against a house wall
      const off = e.hw - 0.32, x = P[0] + nx * off, z = P[1] + nz * off;
      if (W.doors.some((d) => dist2(x, z, d.x, d.z) < 16) || near(x, z, 1.2)) continue;
      const r = Math.random();
      if (r < 0.42) L.pot.push({ x, z, ry: ry + rand(-0.4, 0.4), s: rand(0.85, 1.15) });
      else if (r < 0.6) L.store.push({ x, z, ry, s: rand(0.9, 1.1) });
      else if (r < 0.78) addBike(x - nx * 0.08, z - nz * 0.08, Math.atan2(tx, tz) + rand(-0.08, 0.08), pick([0x2a2a2a, 0x2a2a2a, 0x1f3a5a, 0x4a2a22]));
      if (!LOWQ && Math.random() < 0.2) L.ac.push({ x: P[0] + nx * (e.hw + 0.12), y: rand(1.9, 2.3), z: P[1] + nz * (e.hw + 0.12), ry });
    }
  }
  const cyl = (r0, r1, h, n = 8) => new THREE.CylinderGeometry(r0, r1, h, n), sph = (r) => new THREE.SphereGeometry(r, 7, 5);
  const pots = [], store = [], ac = [];
  for (const [px, pr, ph, leaf, flower] of [[-0.34, 0.17, 0.3, 0x3f7a35, 0xd8344a], [0.02, 0.13, 0.24, 0x4c8a3c, 0], [0.34, 0.2, 0.34, 0x356b2e, 0xf2a0c0]]) {
    pots.push(gpart(cyl(pr, pr * 0.78, ph), 0x9c4f2e, px, ph / 2, 0), gpart(cyl(pr * 1.05, pr * 1.05, 0.04), 0x7c3d24, px, ph, 0)); // terracotta pot + rim
    pots.push(gpart(sph(pr * 1.35), leaf, px, ph + pr * 0.9, 0, 0, 0, 0, 1, 0.8, 1));
    if (flower) for (let k = 0; k < 4; k++) { const a = k * 1.7; pots.push(gpart(sph(0.045), flower, px + Math.cos(a) * pr * 0.9, ph + pr * 1.5, Math.sin(a) * pr * 0.9)); }
  }
  // 大白菜 stacked on a board with a quilt thrown over half, a stack of 蜂窝煤 beside it
  store.push(box(-0.15, 0.03, 0, 0.9, 0.06, 0.5, 0x6b5a44));
  for (let k = 0; k < 7; k++) { const row = k < 4 ? 0 : 1, i = row ? k - 4 : k; store.push(gpart(sph(0.13), k % 3 ? 0xd8e4b4 : 0xb7cc86, -0.48 + i * 0.22 + row * 0.11, 0.18 + row * 0.18, rand(-0.08, 0.08), Math.PI / 2, 0, 0, 1, 1.9, 1)); }
  store.push(gpart(_BOX, 0x2c3e66, -0.3, 0.33, 0, 0, 0, 0.35, 0.55, 0.06, 0.52));
  for (const [bx, bz] of [[0.48, -0.1], [0.48, 0.12], [0.7, 0]]) store.push(gpart(cyl(0.1, 0.1, 0.48, 10), 0x262626, bx, 0.24, bz), gpart(cyl(0.101, 0.101, 0.01, 10), 0x3a3a3a, bx, 0.485, bz));
  // an outdoor AC unit: the casing, the fan grille, the refrigerant pipe up the wall
  ac.push(box(0, 0, -0.02, 0.8, 0.56, 0.3, 0xd9d8d2), gpart(cyl(0.2, 0.2, 0.02, 14), 0x3a3c3e, -0.12, 0, 0.14, Math.PI / 2), box(0.3, 0.02, 0.14, 0.12, 0.4, 0.01, 0x8d8f91), box(0.34, 0.6, -0.12, 0.04, 0.8, 0.04, 0xe6e4de));
  if (L.pot.length) chunkStatic(L.pot, mergeParts(pots), MAT.vcCut, 110);
  if (L.store.length) chunkStatic(L.store, mergeParts(store), MAT.vcCut, 110);
  if (L.ac.length) chunkStatic(L.ac, mergeParts(ac), MAT.vcCut, 110);
  W.clutter = L;
}
