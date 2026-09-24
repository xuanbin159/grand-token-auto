/* ============================================================
   老北京 materials: 青砖, 灰瓦 / 琉璃瓦, 红墙, 花格窗, 老字号铺面,
   plus textured geometry builders for Chinese roofs
   (硬山 gable, 庑殿 hip, 攒尖 pyramid, round) with curved eaves
   ============================================================ */
const BJ = { mats: {}, oldShopMats: [] };

function brickTex(base = '#8d9095', mortar = '#6f7276') {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = mortar; g.fillRect(0, 0, S, S);
  const bh = 16, bw = 44;
  for (let r = 0; r < S / bh; r++) {
    const off = (r % 2) * (bw / 2);
    for (let x = -bw; x < S + bw; x += bw) { g.fillStyle = shade(base, randi(-16, 10)); g.fillRect(x + off + 1, r * bh + 1, bw - 2, bh - 2); }
  }
  speckle(g, S, S, 1800, 0.07);
  return tex(c, true);
}
function pavingTex() { // 胡同 grey brick paving, herring-ish running bond
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#6d6c69'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = -1; q < 5; q++) {
    const x = q * 32 + (r % 2) * 16, y = r * 16;
    g.fillStyle = shade('#8a8883', randi(-12, 10)); g.fillRect(x + 1, y + 1, 30, 14);
  }
  speckle(g, S, S, 700, 0.07);
  return tex(c, true);
}
function stonePaveTex(base = '#b9b4aa') { // palace / square: big slabs
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = shade(base, -28); g.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) for (let q = -1; q < 3; q++) {
    const x = q * 64 + (r % 2) * 32, y = r * 32;
    g.fillStyle = shade(base, randi(-10, 8)); g.fillRect(x + 1.5, y + 1.5, 61, 29);
  }
  speckle(g, S, S, 500, 0.05);
  return tex(c, true);
}
function roofTileTex() { // grey-scale 筒瓦 rows; the material colour tints it (grey / yellow / green / blue)
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#8e8e8e'; g.fillRect(0, 0, S, S);
  const cw = 16;
  for (let x = 0; x < S; x += cw) {
    const grd = g.createLinearGradient(x, 0, x + cw, 0);
    grd.addColorStop(0, '#4e4e4e'); grd.addColorStop(0.28, '#b4b4b4'); grd.addColorStop(0.5, '#e6e6e6'); grd.addColorStop(0.72, '#a6a6a6'); grd.addColorStop(1, '#4a4a4a');
    g.fillStyle = grd; g.fillRect(x, 0, cw, S);
  }
  g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < S; y += 16) g.fillRect(0, y, S, 2);
  speckle(g, S, S, 400, 0.07);
  return tex(c, true);
}
function plasterTex() { // light noise, tinted red for 宫墙 / white for 白塔
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.008, 0.024)})`; g.beginPath(); g.arc(rand(S), rand(S), rand(6, 22), 0, TAU); g.fill(); } // weathering, kept subtle: big red walls read as noise otherwise
  speckle(g, S, S, 900, 0.03);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, S - 10, S, 10); // grime at the foot
  return tex(c, true);
}
// 花格窗 house front: red columns, lattice windows over a brick sill wall. 4 bays, two of them lit at night
function latticeTex() {
  const W = 512, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let b = 0; b < 4; b++) {
    const x = b * 128, lit = b === 1 || b === 2;
    g.fillStyle = '#8e9196'; g.fillRect(x, 84, 128, 44);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 88; y < H; y += 8) g.fillRect(x, y, 128, 1);
    g.fillStyle = '#9b2d24'; g.fillRect(x, 0, 12, H); g.fillRect(x + 116, 0, 12, H);
    g.fillStyle = '#6b3a24'; g.fillRect(x + 12, 6, 104, 78);
    g.fillStyle = lit ? '#efdcb0' : '#d8cfb8'; g.fillRect(x + 18, 12, 92, 66);
    g.strokeStyle = '#5a2e1c'; g.lineWidth = 2;
    for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(x + 18 + k * 11.5, 12); g.lineTo(x + 18 + k * 11.5, 78); g.stroke(); }
    for (let k = 0; k <= 6; k++) { g.beginPath(); g.moveTo(x + 18, 12 + k * 11); g.lineTo(x + 110, 12 + k * 11); g.stroke(); }
    g.fillStyle = '#2e6b5a'; g.fillRect(x + 12, 0, 104, 6); // 绿色额枋
    if (lit) { ge.fillStyle = '#ffc070'; ge.fillRect(x + 18, 12, 92, 66); ge.fillStyle = 'rgba(0,0,0,.4)'; for (let k = 0; k <= 8; k++) ge.fillRect(x + 17 + k * 11.5, 12, 2, 66); }
  }
  const m = new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.4 });
  return m;
}
const OLD_SHOPS = [
  '张二元茶庄', '稻香村饽饽铺', '六必居酱园', '都一处烧麦', '馄饨侯', '庆丰包子铺', '爆肚冯', '年糕钱', '老北京炸酱面', '卤煮火烧',
  '吴裕泰茶社', '月盛斋酱肉', '桂馨斋', '豆汁儿焦圈', '瑞蚨祥绸布', '胡同理发', '冰糖葫芦', '修自行车', '烟袋斜街', '北冰漾汽水',
  '老舍茶馆', '砂锅居', '褡裢火烧', '天兴居炒肝', '宫廷糕点', '京味儿涮肉', '驴打滚', '王致和腐乳', '五道口书店', '二八自行车',
];
// two-storey 老字号 shopfront: lattice upstairs, black-and-gold plaque, open shop + red lanterns downstairs
function oldShopTex(names) {
  const W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const x = k * 256, name = names[k];
    g.fillStyle = '#8e9196'; g.fillRect(x, 0, 256, H);
    // upstairs
    g.fillStyle = '#9b2d24'; for (const cx of [0, 124, 244]) g.fillRect(x + cx, 0, 12, 118);
    for (const wx of [12, 136]) {
      g.fillStyle = '#6b3a24'; g.fillRect(x + wx, 14, 112, 70);
      g.fillStyle = '#e2d4b2'; g.fillRect(x + wx + 6, 20, 100, 58);
      g.strokeStyle = '#5a2e1c'; g.lineWidth = 2;
      for (let q = 0; q <= 8; q++) { g.beginPath(); g.moveTo(x + wx + 6 + q * 12.5, 20); g.lineTo(x + wx + 6 + q * 12.5, 78); g.stroke(); }
      for (let q = 0; q <= 5; q++) { g.beginPath(); g.moveTo(x + wx + 6, 20 + q * 11.6); g.lineTo(x + wx + 106, 20 + q * 11.6); g.stroke(); }
      if (Math.random() < 0.6) { ge.fillStyle = '#ffbd6a'; ge.fillRect(x + wx + 6, 20, 100, 58); }
    }
    g.fillStyle = '#2e6b5a'; g.fillRect(x, 0, 256, 10);
    g.fillStyle = '#4a2a1a'; g.fillRect(x, 86, 256, 10); // balcony rail
    for (let q = 0; q < 16; q++) g.fillRect(x + 6 + q * 16, 96, 4, 20);
    g.fillStyle = '#4a2a1a'; g.fillRect(x, 114, 256, 6);
    // plaque 牌匾
    rrect(g, x + 38, 124, 180, 40, 6); g.fillStyle = '#16120e'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#c9a23e'; g.stroke();
    g.fillStyle = '#e8c35a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 164, 28, 900); g.fillText(name, x + 128, 145);
    ge.fillStyle = '#6a5010'; rrect(ge, x + 40, 126, 176, 36, 6); ge.fill(); ge.fillStyle = '#ffd86a'; ge.textAlign = 'center'; ge.textBaseline = 'middle'; ge.font = g.font; ge.fillText(name, x + 128, 145);
    // shop floor
    g.fillStyle = '#9b2d24'; g.fillRect(x, 166, 14, 90); g.fillRect(x + 242, 166, 14, 90);
    const grd = g.createLinearGradient(0, 170, 0, 256); grd.addColorStop(0, '#f2cf8e'); grd.addColorStop(1, '#7a5230');
    g.fillStyle = grd; g.fillRect(x + 14, 170, 228, 86);
    for (let q = 0; q < 3; q++) { g.fillStyle = 'rgba(80,45,20,.55)'; g.fillRect(x + 22, 186 + q * 20, 212, 4); for (let p = 0; p < 7; p++) { g.fillStyle = pick(['#c0392b', '#e67e22', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1']); g.fillRect(x + 26 + p * 30, 174 + q * 20, 18, 11); } }
    g.fillStyle = '#5a3a24'; g.fillRect(x + 14, 232, 228, 24);
    ge.fillStyle = '#ffb04a'; ge.fillRect(x + 14, 170, 228, 60);
    // lanterns
    for (const lx of [40, 216]) {
      g.fillStyle = '#d7263d'; g.beginPath(); g.ellipse(x + lx, 186, 13, 16, 0, 0, TAU); g.fill(); g.fillStyle = '#f6c343'; g.fillRect(x + lx - 6, 168, 12, 4); g.fillRect(x + lx - 2, 202, 4, 8);
      ge.fillStyle = '#ff5030'; ge.beginPath(); ge.ellipse(x + lx, 186, 13, 16, 0, 0, TAU); ge.fill();
    }
  }
  return new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.3 });
}
function hutongSignTex(name) { // blue street plate
  const c = mkCanvas(256, 64), g = c.getContext('2d');
  rrect(g, 2, 2, 252, 60, 6); g.fillStyle = '#1d3f8f'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#f5f5f5'; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 230, 34, 900); g.fillText(name, 128, 34);
  return tex(c);
}

function bjMaterials() {
  const M = BJ.mats;
  TEX.brick = brickTex(); TEX.paving = pavingTex(); TEX.stone = stonePaveTex(); TEX.marblePave = stonePaveTex('#e6e2d8');
  TEX.tile = TEX.tile || tileTex(); TEX.roofTile = roofTileTex(); TEX.plaster = plasterTex();
  M.brick = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.brick }));
  M.roofGrey = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x70757c }));
  M.roofYellow = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0xe8a623, emissive: 0x3a2600, emissiveIntensity: 0.25 }));
  M.roofGreen = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x3f9a62 }));
  M.roofBlue = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x3150b8 }));
  M.redWall = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.plaster, color: 0xa33a2c }));
  M.white = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.plaster, color: 0xf1eee6 }));
  M.marble = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.marblePave, color: 0xffffff }));
  M.lattice = Render.cutout(latticeTex()); W.extraFacades.push(M.lattice);
  M.greyBrick = Render.cutout(new THREE.MeshLambertMaterial({ map: brickTex('#9a9ca0', '#7d7f83') }));
  for (let k = 0; k < 6; k++) {
    const names = [OLD_SHOPS[(k * 2) % OLD_SHOPS.length], OLD_SHOPS[(k * 2 + 1) % OLD_SHOPS.length]];
    const m = Render.cutout(oldShopTex(names)); W.extraFacades.push(m); BJ.oldShopMats.push(m);
  }
  M.lantern = new THREE.MeshBasicMaterial({ vertexColors: true }); W.neonMats.push(M.lantern);
  M.gold = Render.cutout(new THREE.MeshLambertMaterial({ color: 0xe6b422, emissive: 0x4a3200, emissiveIntensity: 0.4 }));
  MAT.paving = new THREE.MeshLambertMaterial({ map: TEX.paving });
  MAT.stonePave = new THREE.MeshLambertMaterial({ map: TEX.stone });
}

/* ---- textured geometry accumulator (flat normals, world-space uv) ---- */
class GeoAcc {
  constructor() { this.p = []; this.n = []; this.u = []; }
  tri(a, b, c, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  quad(a, b, c, d, ua, ub, uc, ud) { this.tri(a, b, c, ua, ub, uc); this.tri(a, c, d, ua, uc, ud); }
  get empty() { return this.p.length === 0; }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    return g;
  }
}
// eave profile: flatter near the eave, steeper near the ridge (the classic concave Chinese roof)
const EAVE_T = 0.52, EAVE_RISE = 0.36;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function midPt(e, r, yE, yR) { const p = lerp3(e, r, EAVE_T); p[1] = yE + (yR - yE) * EAVE_RISE; return p; }
// uv helpers: u follows the eave line, v runs up the slope (1 tile repeat ≈ 2 world units)
function slopeUV(p, q, along) { return [along === 'x' ? p[0] / 2 : p[2] / 2, 0]; }
function roofQuadStrip(acc, e0, e1, m1, m0, r1, r0, along) {
  // two stacked quads eave→mid→ridge with v measured along the slope
  const u = (p) => (along === 'x' ? p[0] : p[2]) / 2;
  const d1 = Math.hypot(m0[0] - e0[0], m0[1] - e0[1], m0[2] - e0[2]) / 1.6, d2 = d1 + Math.hypot(r0[0] - m0[0], r0[1] - m0[1], r0[2] - m0[2]) / 1.6;
  acc.quad(e0, e1, m1, m0, [u(e0), 0], [u(e1), 0], [u(m1), d1], [u(m0), d1]);
  if (r0 === r1) acc.tri(m0, m1, r0, [u(m0), d1], [u(m1), d1], [(u(m0) + u(m1)) / 2, d2]);
  else acc.quad(m0, m1, r1, r0, [u(m0), d1], [u(m1), d1], [u(r1), d2], [u(r0), d2]);
}
// local frame: lx along the ridge, lz across; rot = 0 (ridge ∥ x) or 1 (ridge ∥ z)
function roofFrame(cx, cz, rot) { return rot ? (lx, y, lz) => [cx + lz, y, cz - lx] : (lx, y, lz) => [cx + lx, y, cz + lz]; }

// 硬山 gable roof (hutong houses, halls): L along the ridge, D across
function gableRoof(acc, cx, cz, L, D, yE, h, rot = 0, o = 0.45) {
  const F = roofFrame(cx, cz, rot), ax = rot ? 'z' : 'x';
  const a = L / 2 + o, b = D / 2 + o, yR = yE + h, ye = yE - 0.12;
  const eFL = F(-a, ye, b), eFR = F(a, ye, b), eBL = F(-a, ye, -b), eBR = F(a, ye, -b), rL = F(-a, yR, 0), rR = F(a, yR, 0);
  const mFL = midPt(eFL, rL, ye, yR), mFR = midPt(eFR, rR, ye, yR), mBL = midPt(eBL, rL, ye, yR), mBR = midPt(eBR, rR, ye, yR);
  roofQuadStrip(acc, eFL, eFR, mFR, mFL, rR, rL, ax);
  roofQuadStrip(acc, eBR, eBL, mBL, mBR, rL, rR, ax);
  // gable ends (pentagons fanned from the ridge)
  const across = rot ? 'x' : 'z', uvA = (p) => [(across === 'x' ? p[0] : p[2]) / 2, p[1] / 2];
  for (const [e1, m1, r, m2, e2] of [[eFR, mFR, rR, mBR, eBR], [eBL, mBL, rL, mFL, eFL]]) {
    acc.tri(e1, e2, m2, uvA(e1), uvA(e2), uvA(m2)); acc.tri(e1, m2, m1, uvA(e1), uvA(m2), uvA(m1)); acc.tri(m1, m2, r, uvA(m1), uvA(m2), uvA(r));
  }
}
// 庑殿 hip roof: W along the ridge (≥ D)
function hipRoof(acc, cx, cz, Wd, D, yE, h, rot = 0, o = 0.8) {
  const F = roofFrame(cx, cz, rot), ax = rot ? 'z' : 'x', ax2 = rot ? 'x' : 'z';
  const a = Wd / 2 + o, b = D / 2 + o, r = Math.max(0.2, (Wd - D) / 2), yR = yE + h, ye = yE - 0.2;
  const eFL = F(-a, ye, b), eFR = F(a, ye, b), eBL = F(-a, ye, -b), eBR = F(a, ye, -b), rL = F(-r, yR, 0), rR = F(r, yR, 0);
  const mFL = midPt(eFL, rL, ye, yR), mFR = midPt(eFR, rR, ye, yR), mBL = midPt(eBL, rL, ye, yR), mBR = midPt(eBR, rR, ye, yR);
  roofQuadStrip(acc, eFL, eFR, mFR, mFL, rR, rL, ax);
  roofQuadStrip(acc, eBR, eBL, mBL, mBR, rL, rR, ax);
  roofQuadStrip(acc, eFR, eBR, mBR, mFR, rR, rR, ax2);
  roofQuadStrip(acc, eBL, eFL, mFL, mBL, rL, rL, ax2);
}
// 攒尖 pyramid roof on a square pavilion
function pyramidRoof(acc, cx, cz, s, yE, h, o = 0.7) {
  const a = s / 2 + o, ye = yE - 0.15, yR = yE + h, apex = [cx, yR, cz];
  const c = [[cx - a, ye, cz + a], [cx + a, ye, cz + a], [cx + a, ye, cz - a], [cx - a, ye, cz - a]];
  const m = c.map((p) => midPt(p, apex, ye, yR));
  for (let k = 0; k < 4; k++) roofQuadStrip(acc, c[k], c[(k + 1) % 4], m[(k + 1) % 4], m[k], apex, apex, k % 2 ? 'z' : 'x');
}
// round conical roof (天坛 / 皇穹宇 / 亭), n segments
function roundRoof(acc, cx, cz, R, yE, h, n = 20, o = 0.6) {
  const ye = yE - 0.15, yR = yE + h, apex = [cx, yR, cz];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const e0 = [cx + Math.cos(a0) * (R + o), ye, cz + Math.sin(a0) * (R + o)], e1 = [cx + Math.cos(a1) * (R + o), ye, cz + Math.sin(a1) * (R + o)];
    const m0 = midPt(e0, apex, ye, yR), m1 = midPt(e1, apex, ye, yR);
    const u0 = k / n * (R + o) * TAU / 2, u1 = (k + 1) / n * (R + o) * TAU / 2, d1 = 1, d2 = 2;
    acc.quad(e1, e0, m0, m1, [u1, 0], [u0, 0], [u0, d1], [u1, d1]);
    acc.tri(m1, m0, apex, [u1, d1], [u0, d1], [(u0 + u1) / 2, d2]);
  }
}
// textured box (walls / bases), bottom at y; uv in world units / rep
function boxW(acc, x0, y0, z0, x1, y1, z1, rep = 2, faces = 'nsewt') {
  const P = (x, y, z) => [x, y, z], ux = (p) => [p[0] / rep, p[1] / rep], uz = (p) => [p[2] / rep, p[1] / rep];
  if (faces.includes('s')) { const a = P(x0, y0, z1), b = P(x1, y0, z1), c = P(x1, y1, z1), d = P(x0, y1, z1); acc.quad(a, b, c, d, ux(a), ux(b), ux(c), ux(d)); }
  if (faces.includes('n')) { const a = P(x1, y0, z0), b = P(x0, y0, z0), c = P(x0, y1, z0), d = P(x1, y1, z0); acc.quad(a, b, c, d, ux(a), ux(b), ux(c), ux(d)); }
  if (faces.includes('e')) { const a = P(x1, y0, z1), b = P(x1, y0, z0), c = P(x1, y1, z0), d = P(x1, y1, z1); acc.quad(a, b, c, d, uz(a), uz(b), uz(c), uz(d)); }
  if (faces.includes('w')) { const a = P(x0, y0, z0), b = P(x0, y0, z1), c = P(x0, y1, z1), d = P(x0, y1, z0); acc.quad(a, b, c, d, uz(a), uz(b), uz(c), uz(d)); }
  if (faces.includes('t')) { const a = P(x0, y1, z1), b = P(x1, y1, z1), c = P(x1, y1, z0), d = P(x0, y1, z0), ut = (p) => [p[0] / rep, p[2] / rep]; acc.quad(a, b, c, d, ut(a), ut(b), ut(c), ut(d)); }
}
// textured cylinder side (round halls, drums)
function cylW(acc, cx, cz, r, y0, y1, n = 20, rep = 2) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    const q0 = [p0[0], y1, p0[2]], q1 = [p1[0], y1, p1[2]], u0 = (k / n) * r * TAU / rep, u1 = ((k + 1) / n) * r * TAU / rep;
    acc.quad(p1, p0, q0, q1, [u1, y0 / rep], [u0, y0 / rep], [u0, y1 / rep], [u1, y1 / rep]);
  }
}
// flat disc / ring top (terraces)
function discTop(acc, cx, cz, r, y, n = 24, rep = 3) {
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], c = [cx, y, cz];
    acc.tri(c, p1, p0, [cx / rep, cz / rep], [p1[0] / rep, p1[2] / rep], [p0[0] / rep, p0[2] / rep]);
  }
}
