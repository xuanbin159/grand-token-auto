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
const BJB = { signs: null, bikes: [], signQuads: [], lanterns: [], trees: [], cypress: [], boats: [], neonBoxes: [], incense: [], barMat: null, plateNames: null };

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
    chunkStatic(BJB.lanterns.map(([x, y, z]) => ({ x, y, z })), mergeParts(parts), BJ.mats.lantern, 330);
  }
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
  chunkStatic(BJB.bikes, bikeGeo, MAT.vcCut, 170);
  W.bikes = BJB.bikes;
}
