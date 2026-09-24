/* ============================================================
   assets: canvas textures, materials, geometry helpers,
   the photo face, and drawn heads for the rest of the cast
   ============================================================ */
const FONT_CN = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Micro Hei",sans-serif';
const FONT_DISPLAY = 'Impact,Haettenschweiler,"Arial Black",' + FONT_CN;
const FONT_MONO = 'Menlo,Consolas,"SF Mono","Courier New",monospace';
const TEX = {}, MAT = {}, HEADS = {};
const FACE_IMG = new Image();

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, rep) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(8, MAX_ANISO);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function speckle(g, w, h, n, a = 0.07, sz = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(a)})` : `rgba(255,255,255,${rand(a * 0.8)})`;
    g.fillRect(Math.random() * w, Math.random() * h, sz, sz);
  }
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), gg = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
}
function fitFont(g, text, maxW, size, weight = 900, family = FONT_CN) {
  let s = size;
  for (;;) { g.font = `${weight} ${s}px ${family}`; if (g.measureText(text).width <= maxW || s <= 12) break; s -= 4; }
  return s;
}

// ---------------- ground ----------------
function asphaltTex() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#3b3e45'; g.fillRect(0, 0, S, S); speckle(g, S, S, 2600, 0.09);
  g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath(); let x = rand(S), y = rand(S); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rand(-18, 18); y += rand(-18, 18); g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c, true);
}
function roadTex() {
  const c = mkCanvas(128, 256), g = c.getContext('2d');
  g.fillStyle = '#383b42'; g.fillRect(0, 0, 128, 256); speckle(g, 128, 256, 1500, 0.08);
  g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(22, 0, 14, 256); g.fillRect(92, 0, 14, 256);
  g.fillStyle = '#e6e2d6'; g.fillRect(5, 0, 3, 256); g.fillRect(120, 0, 3, 256);
  g.fillStyle = '#f0b429'; g.fillRect(59, 0, 3, 256); g.fillRect(66, 0, 3, 256);
  return tex(c, true);
}
function interTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#383b42'; g.fillRect(0, 0, S, S); speckle(g, S, S, 800, 0.08);
  g.fillStyle = 'rgba(235,232,222,.85)';
  for (let k = 26; k < S - 26; k += 11) { g.fillRect(k, 3, 6, 19); g.fillRect(k, S - 22, 6, 19); g.fillRect(3, k, 19, 6); g.fillRect(S - 22, k, 19, 6); }
  return tex(c);
}
function walkTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, S, S); speckle(g, S, S, 700, 0.06);
  g.strokeStyle = 'rgba(60,50,40,.22)'; g.lineWidth = 2;
  for (let k = 0; k <= S; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  return tex(c, true);
}
function grassTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#5a9447'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(30,70,25,.25)' : 'rgba(170,210,110,.2)'; g.fillRect(rand(S), rand(S), 1.5, rand(2, 5)); }
  return tex(c, true);
}
function sandTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#dcc596'; g.fillRect(0, 0, S, S); speckle(g, S, S, 2200, 0.08, 1.5);
  g.strokeStyle = 'rgba(150,120,70,.12)'; g.lineWidth = 2;
  for (let k = 0; k < 6; k++) { g.beginPath(); const y = rand(S); g.moveTo(0, y); g.bezierCurveTo(40, y + rand(-8, 8), 90, y + rand(-8, 8), S, y); g.stroke(); }
  return tex(c, true);
}
function plazaTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#c7b597'; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 32) {
    const o = (y / 16) % 2 ? 16 : 0;
    g.fillStyle = Math.random() < 0.5 ? '#bda988' : '#d1c1a4'; g.fillRect(x + o + 1, y + 1, 30, 14);
  }
  speckle(g, S, S, 400, 0.05);
  return tex(c, true);
}
function roofTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#a4a19a'; g.fillRect(0, 0, S, S); speckle(g, S, S, 900, 0.06);
  g.strokeStyle = 'rgba(60,55,50,.18)'; g.lineWidth = 1.5;
  for (let k = 0; k <= S; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(40,35,30,.05)'; g.beginPath(); g.arc(rand(S), rand(S), rand(3, 7), 0, TAU); g.fill(); }
  return tex(c, true);
}
function woodTex(base = '#8a5a34') {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    g.fillStyle = shade(base, randi(-18, 14)); g.fillRect(0, y + 1, S, 14);
    g.strokeStyle = 'rgba(0,0,0,.08)';
    for (let k = 0; k < 3; k++) { g.beginPath(); const yy = y + rand(2, 14); g.moveTo(0, yy); g.bezierCurveTo(40, yy + rand(-2, 2), 80, yy + rand(-2, 2), S, yy); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(randi(10, 110), y, 2, 16);
  }
  return tex(c, true);
}
function tileTex(a = '#e9e6df', b = '#d8d3ca', n = 4) {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d'), st = S / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = (x + y) % 2 ? a : b; g.fillRect(x * st, y * st, st, st); }
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  for (let k = 0; k <= S; k += st) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
  speckle(g, S, S, 300, 0.04);
  return tex(c, true);
}
function carpetTex(base = '#3d4a5c') {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S); speckle(g, S, S, 3000, 0.08, 1);
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
  for (let k = 0; k <= S; k += 64) { g.strokeRect(k + 2, 2, 60, S - 4); }
  return tex(c, true);
}

// ---------------- building skins ----------------
const FACADES = [
  { wall: '#d9d2c5', glass: '#56708c', style: 'punch' },
  { wall: '#c7ccd4', glass: '#3f5f7f', style: 'ribbon' },
  { wall: '#b8a48e', glass: '#4a5a6a', style: 'punch' },
  { wall: '#9fb2c4', glass: '#35506b', style: 'curtain' },
  { wall: '#e3dccf', glass: '#607a94', style: 'grid' },
  { wall: '#c98f74', glass: '#4b5563', style: 'punch' },
  { wall: '#8c96a3', glass: '#2e4257', style: 'curtain' },
  { wall: '#d8c6a8', glass: '#5a6f86', style: 'ribbon' },
  { wall: '#a9b8a0', glass: '#44586a', style: 'grid' },
  { wall: '#e7c9a9', glass: '#5d6d7e', style: 'punch' },
];
function makeFacade(f) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  const e = mkCanvas(S, S), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  g.fillStyle = f.wall; g.fillRect(0, 0, S, S); speckle(g, S, S, 900, 0.07);
  for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
    const x = q * 64, y = r * 64, lit = Math.random() < 0.3, warm = Math.random() < 0.75;
    let wx, wy, ww, wh;
    if (f.style === 'punch') { wx = x + 12; wy = y + 16; ww = 40; wh = 34; }
    else if (f.style === 'ribbon') { wx = x; wy = y + 20; ww = 64; wh = 26; }
    else if (f.style === 'curtain') { wx = x + 2; wy = y + 3; ww = 60; wh = 58; }
    else { wx = x + 6; wy = y + 8; ww = 52; wh = 46; }
    const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    grd.addColorStop(0, shade(f.glass, 30)); grd.addColorStop(1, shade(f.glass, -14));
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
    if (f.style === 'ribbon') { g.fillStyle = f.wall; for (let k = 1; k < 4; k++) g.fillRect(x + k * 16 - 1, wy, 2, wh); }
    else { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(wx, wy + wh - 3, ww, 3); }
    if (f.style === 'curtain') { g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(wx, wy, ww, 2); g.fillRect(wx, wy, 2, wh); }
    if (lit) {
      ge.fillStyle = warm ? '#ffc877' : '#bfe0ff'; ge.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
      ge.fillStyle = 'rgba(0,0,0,.35)'; ge.fillRect(wx + ww * rand(0.2, 0.7), wy + 4, 3, wh - 8);
    }
  }
  const m = new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.4 });
  return m;
}
const SHOP_NAMES = ['奶茶', '烧烤', '网吧', '打印', '显卡回收', '咖啡', '兰州拉面', '沙县小吃', '眼镜', '理发', '修电脑', '麻辣烫', '花店', '彩票', '房产中介', '水果', '药店', '面包', '五金', '手机膜'];
const SHOP_COLS = ['#d7263d', '#1f6feb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#ea580c'];
function makeShopfront() {
  const W = 256, H = 64, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = '#5c5750'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const x = k * 128, col = pick(SHOP_COLS), name = pick(SHOP_NAMES);
    g.fillStyle = col; g.fillRect(x + 3, 3, 122, 14);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 110, 12); g.fillText(name, x + 64, 10.5);
    ge.fillStyle = shade(col, 40); ge.fillRect(x + 3, 3, 122, 14); ge.fillStyle = '#fff'; ge.textAlign = 'center'; ge.textBaseline = 'middle'; ge.font = g.font; ge.fillText(name, x + 64, 10.5);
    // awning stripes
    for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? '#f5f0e6' : shade(col, -20); g.fillRect(x + 6 + s * 15, 18, 15, 5); }
    // window + door
    const grd = g.createLinearGradient(0, 24, 0, 62); grd.addColorStop(0, '#f3d7a2'); grd.addColorStop(1, '#8a6a44');
    g.fillStyle = grd; g.fillRect(x + 8, 25, 80, 36);
    g.fillStyle = 'rgba(60,40,20,.5)'; for (let s = 0; s < 3; s++) g.fillRect(x + 12 + s * 26, 44, 20, 3);
    g.fillStyle = '#2b2f36'; g.fillRect(x + 94, 27, 26, 35); g.fillStyle = '#bcd6f0'; g.fillRect(x + 97, 30, 20, 20);
    ge.fillStyle = '#ffcf85'; ge.fillRect(x + 8, 25, 80, 36); ge.fillStyle = '#a8c8ff'; ge.fillRect(x + 97, 30, 20, 20);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 8, 25, 80, 2);
  }
  return new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.35 });
}
// rooftop billboard atlas: 2 x 4 ads of 512 x 256
const ADS = [
  ['Token 限时五折', '今晚下单 · 明早 OOM', '#d7263d', '#ffd23f'],
  ['上下文 1M 起', '长文本也会累', '#1f6feb', '#ffffff'],
  ['显卡高价回收', '5090 · 4090 · 显存条', '#111111', '#7CFC00'],
  ['25 号机 · 您可靠的管家', '4×RTZ 5090 · 永不宕机*', '#0f3d5e', '#7cc4ff'],
  ['Kodex 应用科学部', '我们只写代码，从不删库', '#f4f4f0', '#111111'],
  ['律师函代发', '全城最快 · 百模帮认证', '#5b1a1a', '#ffb4a8'],
  ['AGI 即将到来', '（这次是真的）', '#6d28d9', '#fef08a'],
  ['今晚不加班', '——你的 KPI', '#0e7490', '#ffffff'],
];
function adsAtlas() {
  const c = mkCanvas(1024, 1024), g = c.getContext('2d');
  ADS.forEach(([t, s, bg, fg], i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    g.fillStyle = bg; g.fillRect(x, y, 512, 256);
    g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(x + 10, y + 10, 492, 236);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitFont(g, t, 450, 86); g.fillText(t, x + 256, y + 104);
    fitFont(g, s, 440, 40, 700); g.fillText(s, x + 256, y + 190);
  });
  return tex(c);
}

// curtain wall for AI HQ towers: neutral, tinted by the material colour
function curtainTex() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  const e = mkCanvas(S, S), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  g.fillStyle = '#e9eef5'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
    const x = q * 32, y = r * 32, v = rand(0.72, 0.95);
    const grd = g.createLinearGradient(x, y, x + 32, y + 32);
    grd.addColorStop(0, `rgba(255,255,255,${v})`); grd.addColorStop(1, `rgba(150,165,185,${v})`);
    g.fillStyle = grd; g.fillRect(x + 1.5, y + 1.5, 29, 29);
    if (Math.random() < 0.18) { ge.fillStyle = 'rgba(255,255,255,.55)'; ge.fillRect(x + 2, y + 2, 28, 28); }
  }
  g.fillStyle = 'rgba(40,50,70,.55)'; for (let k = 0; k <= S; k += 32) { g.fillRect(k - 1, 0, 2, S); g.fillRect(0, k - 1, S, 2); }
  return [tex(c, true), tex(e, true)];
}

// ---------------- sprites & decals ----------------
function coinTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#c98a12'; g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(52, 48, 6, 64, 64, 64);
  grd.addColorStop(0, '#fff6c4'); grd.addColorStop(0.45, '#ffd23f'); grd.addColorStop(1, '#d08a0a');
  g.beginPath(); g.arc(64, 64, 63, 0, TAU); g.fillStyle = grd; g.fill();
  g.lineWidth = 6; g.strokeStyle = '#a86a00'; g.beginPath(); g.arc(64, 64, 50, 0, TAU); g.stroke();
  g.fillStyle = '#8f5400'; g.font = `900 70px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('T', 64, 68);
  return tex(c);
}
function softTex() {
  const S = 64, c = mkCanvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return tex(c);
}
function ringTex() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 127);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,.2)');
  grd.addColorStop(0.9, 'rgba(255,255,255,.95)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return tex(c);
}
function discTex() { // soft pool of light / telegraph disc
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return tex(c);
}
function coneTex() { // headlight throw on the road
  const c = mkCanvas(64, 128), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 128, 0, 0); grd.addColorStop(0, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.moveTo(26, 128); g.lineTo(38, 128); g.lineTo(64, 0); g.lineTo(0, 0); g.closePath(); g.fill();
  return tex(c);
}
function letterTex() {
  const c = mkCanvas(128, 96), g = c.getContext('2d');
  rrect(g, 4, 8, 120, 80, 6); g.fillStyle = '#fbf8f1'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#333'; g.stroke();
  g.beginPath(); g.moveTo(6, 12); g.lineTo(64, 52); g.lineTo(122, 12); g.stroke();
  g.beginPath(); g.arc(64, 56, 17, 0, TAU); g.fillStyle = '#c8102e'; g.fill();
  g.fillStyle = '#fff'; g.font = `900 20px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('律', 64, 57);
  return tex(c);
}
function glyphTex(ch, bg, fg = '#fff', size = 52) {
  const S = 96, c = mkCanvas(S, S), g = c.getContext('2d');
  g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.fillStyle = bg; g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = fg; g.font = `900 ${size}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 48, 51);
  return tex(c);
}
function labelTex(text, bg = '#111', fg = '#fff') {
  const c = mkCanvas(256, 72), g = c.getContext('2d');
  const s = fitFont(g, text, 220, 40);
  const w = Math.min(248, g.measureText(text).width + 36);
  rrect(g, 128 - w / 2, 8, w, 56, 26); g.fillStyle = bg; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  g.fillStyle = fg; g.font = `900 ${s}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 37);
  return tex(c);
}
function signTex(name, sub, c1, c2) {
  const c = mkCanvas(1024, 256), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 1024, 256); grd.addColorStop(0, c1); grd.addColorStop(1, c2);
  rrect(g, 10, 10, 1004, 236, 38); g.fillStyle = grd; g.fill();
  g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.14)'; rrect(g, 24, 22, 976, 90, 30); g.fill();
  const s = fitFont(g, name, 900, 150);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowOffsetY = 6; g.shadowBlur = 0;
  g.fillText(name, 512, sub ? 112 : 132);
  if (sub) { g.shadowColor = 'transparent'; g.font = `800 34px ${FONT_DISPLAY}`; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(sub, 512, 206); }
  void s;
  return tex(c);
}
function decalTex(text, bg, fg) {
  const c = mkCanvas(128, 64), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, text, 116, 40); g.fillText(text, 64, 34);
  return tex(c);
}
function notFoundTex() {
  const c = mkCanvas(256, 160), g = c.getContext('2d');
  rrect(g, 6, 6, 244, 148, 14); g.fillStyle = '#f7f3ea'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#d7263d'; g.font = `900 78px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('404', 128, 62);
  g.fillStyle = '#111'; g.font = `800 26px ${FONT_CN}`; g.fillText('服务已下线', 128, 124);
  return tex(c);
}
function markerLetterTex(ch, col) {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 10; g.strokeStyle = '#0c0e12'; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, ch, 84, 72, 900, FONT_DISPLAY); g.fillText(ch, 64, 68);
  return tex(c);
}

// ---------------- the star of the show ----------------
function stickerOf(img, size, border, col = '#ffffff', outline = '#111418') {
  const c = mkCanvas(size, size), g = c.getContext('2d');
  const iw = img.width, ih = img.height;
  const pad = border + 4, s = Math.min((size - pad * 2) / iw, (size - pad * 2) / ih);
  const w = iw * s, h = ih * s, x = (size - w) / 2, y = (size - h) / 2;
  const sil = (color) => {
    const t = mkCanvas(size, size), tg = t.getContext('2d');
    tg.drawImage(img, x, y, w, h); tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = color; tg.fillRect(0, 0, size, size); return t;
  };
  const so = sil(outline), sw = sil(col);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; g.drawImage(so, Math.cos(a) * (border + 3), Math.sin(a) * (border + 3)); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; g.drawImage(sw, Math.cos(a) * border, Math.sin(a) * border); }
  g.drawImage(img, x, y, w, h);
  return c;
}
const faceSticker = (size, border, col, outline) => stickerOf(FACE_IMG, size, border, col, outline);
// ---- hats & glasses drawn onto the photo face (face-image px → canvas via T = {x, y, s}) ----
function stickerShape(g, draw, fill, line = '#111418') {
  g.save(); g.lineJoin = 'round';
  draw(); g.lineWidth = 16; g.strokeStyle = '#ffffff'; g.stroke();
  draw(); g.fillStyle = fill; g.fill(); g.lineWidth = 5; g.strokeStyle = line; g.stroke();
  g.restore();
}
function drawHat(g, kind, T) {
  const X = (fx) => T.x + fx * T.s, Y = (fy) => T.y + fy * T.s, S = (v) => v * T.s;
  const ell = (fx, fy, rx, ry, rot = 0, a0 = 0, a1 = TAU) => () => { g.beginPath(); g.ellipse(X(fx), Y(fy), S(rx), S(ry), rot, a0, a1); g.closePath(); };
  switch (kind) {
    case 'cap':
      stickerShape(g, ell(62, 92, 118, 30, -0.22), '#b8151f');
      stickerShape(g, ell(162, 78, 140, 92, -0.08, Math.PI, TAU), '#d11f2a');
      g.fillStyle = '#ffffff'; g.font = `900 ${Math.round(S(58))}px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', X(165), Y(28));
      stickerShape(g, ell(168, -12, 16, 12), '#b8151f');
      break;
    case 'leifeng':
      stickerShape(g, ell(6, 170, 42, 88), '#6b4a2e'); stickerShape(g, ell(292, 186, 40, 88), '#6b4a2e');
      stickerShape(g, ell(158, 62, 168, 104, -0.05, Math.PI, TAU), '#7a5534');
      stickerShape(g, () => { g.beginPath(); g.moveTo(X(-4), Y(64)); g.quadraticCurveTo(X(158), Y(96), X(320), Y(58)); g.lineTo(X(318), Y(26)); g.quadraticCurveTo(X(158), Y(56), X(-2), Y(30)); g.closePath(); }, '#a07a52');
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 40; k++) { g.fillRect(X(rand(20, 300)), Y(rand(-60, 40)), S(4), S(10)); }
      break;
    case 'guapi':
      stickerShape(g, ell(160, 58, 128, 82, -0.06, Math.PI, TAU), '#1b1b1f');
      g.strokeStyle = '#3a3a44'; g.lineWidth = 3; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(X(160 + k * 40), Y(56)); g.quadraticCurveTo(X(160 + k * 20), Y(-10), X(160), Y(-24)); g.stroke(); }
      stickerShape(g, () => { g.beginPath(); g.rect(X(34), Y(44), S(252), S(16)); }, '#2a2a30');
      stickerShape(g, ell(160, -30, 16, 16), '#c8102e');
      break;
    case 'hardhat':
      stickerShape(g, ell(40, 80, 90, 22, -0.2), '#f2b705');
      stickerShape(g, ell(162, 70, 150, 100, -0.06, Math.PI, TAU), '#f7c81e');
      stickerShape(g, () => { g.beginPath(); g.rect(X(148), Y(-30), S(26), S(100)); }, '#e0a800');
      break;
    case 'straw':
      stickerShape(g, ell(160, 60, 236, 56, -0.06), '#e2c27a');
      stickerShape(g, ell(162, 44, 118, 82, -0.06, Math.PI, TAU), '#e8cd8a');
      stickerShape(g, () => { g.beginPath(); g.rect(X(46), Y(26), S(234), S(18)); }, '#c8102e');
      g.strokeStyle = 'rgba(120,80,30,.45)'; g.lineWidth = 2; for (let k = 0; k < 12; k++) { g.beginPath(); g.ellipse(X(160), Y(60), S(236 - k * 10), S(56 - k * 2.5), -0.06, 0, TAU); g.stroke(); }
      break;
  }
}
// where the eyes are in the face image (300×364): the default face looks a little to the left;
// a face you upload is lined up to the centred pair
const FACE_EYES_DEFAULT = [[50, 148], [142, 158]], FACE_EYES_CENTRED = [[104, 160], [196, 160]];
let FACE_EYES = FACE_EYES_DEFAULT;
function drawGlasses(g, kind, T) {
  const X = (fx) => T.x + fx * T.s, Y = (fy) => T.y + fy * T.s, S = (v) => v * T.s;
  const [L, R] = FACE_EYES, top = Math.min(L[1], R[1]), span = R[0] - L[0];
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  if (kind === 'vr') {
    g.beginPath(); rrect(g, X(L[0] - 56), Y(top - 38), S(span + 120), S(96), S(26)); g.lineWidth = 14; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#f2f4f7'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#111418'; g.stroke();
    g.fillStyle = '#16181d'; g.beginPath(); rrect(g, X(L[0] - 44), Y(top - 24), S(span + 96), S(58), S(16)); g.fill();
    g.fillStyle = '#38e1ff'; g.fillRect(X(L[0] - 26), Y(top + 2), S(span + 58), S(6));
    g.strokeStyle = '#2a2e36'; g.lineWidth = S(16); g.beginPath(); g.moveTo(X(R[0] + 64), Y(top + 2)); g.lineTo(X(Math.min(300, R[0] + 150)), Y(top - 8)); g.stroke();
    g.restore(); return;
  }
  const big = kind === 'hama', rx = big ? 48 : 42, ry = big ? 38 : 30;
  const lens = (c) => { g.beginPath(); if (big) { g.moveTo(X(c[0] - rx), Y(c[1] - ry * 0.7)); g.quadraticCurveTo(X(c[0]), Y(c[1] - ry * 1.1), X(c[0] + rx), Y(c[1] - ry * 0.7)); g.quadraticCurveTo(X(c[0] + rx * 0.9), Y(c[1] + ry * 1.2), X(c[0]), Y(c[1] + ry)); g.quadraticCurveTo(X(c[0] - rx), Y(c[1] + ry * 0.9), X(c[0] - rx), Y(c[1] - ry * 0.7)); g.closePath(); } else g.ellipse(X(c[0]), Y(c[1]), S(rx), S(ry), 0.1, 0, TAU); };
  for (const c of [L, R]) {
    lens(c);
    if (kind === 'goldrim') { g.lineWidth = S(9); g.strokeStyle = '#d4a017'; g.stroke(); g.fillStyle = 'rgba(255,240,200,.12)'; g.fill(); continue; }
    g.lineWidth = 12; g.strokeStyle = '#fff'; g.stroke();
    if (big) { const gr = g.createLinearGradient(X(c[0] - rx), Y(c[1] - ry), X(c[0] + rx), Y(c[1] + ry)); gr.addColorStop(0, '#ffd36a'); gr.addColorStop(0.5, '#ff5fa2'); gr.addColorStop(1, '#4fc3ff'); g.fillStyle = gr; }
    else g.fillStyle = 'rgba(12,12,14,.94)';
    g.fill(); g.lineWidth = 5; g.strokeStyle = big ? '#d4a017' : '#0b0b0d'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(X(c[0] - rx * 0.35), Y(c[1] - ry * 0.35), S(rx * 0.35), S(ry * 0.14), -0.5, 0, TAU); g.fill();
  }
  g.strokeStyle = kind === 'goldrim' || big ? '#d4a017' : '#0b0b0d'; g.lineWidth = S(8);
  g.beginPath(); g.moveTo(X(L[0] + rx - 2), Y(L[1] - 4)); g.quadraticCurveTo(X((L[0] + R[0]) / 2), Y(L[1] - 14), X(R[0] - rx + 2), Y(R[1] - 6)); g.stroke();
  g.beginPath(); g.moveTo(X(R[0] + rx), Y(R[1] - 6)); g.lineTo(X(Math.min(296, R[0] + 130)), Y(R[1] - 8)); g.stroke();
  g.restore();
}
// the hero's head sticker with hat + glasses: 384 canvas, face at (64,96) so a hat has room
const HERO_FACE_T = { x: 64 + 33.2, y: 96 + 13, s: 0.6319 };
function heroHeadCanvas(head, face) {
  const c = mkCanvas(384, 384), g = c.getContext('2d');
  g.drawImage(faceSticker(256, 9), 64, 96);
  if (face) drawGlasses(g, face, HERO_FACE_T);
  if (head) drawHat(g, head, HERO_FACE_T);
  return c;
}
// title / loading poster of whoever the hero currently is (used when you upload your own face)
function heroBustCanvas() {
  const W = 456, H = 528, c = mkCanvas(W, H), g = c.getContext('2d');
  const bg = g.createRadialGradient(228, 240, 20, 228, 240, 320); bg.addColorStop(0, '#2b3f6b'); bg.addColorStop(1, '#0f1628');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.lineWidth = 9; g.strokeStyle = 'rgba(242,194,51,.6)'; g.beginPath(); g.arc(228, 232, 146, 0, TAU); g.stroke();
  g.lineWidth = 4; g.strokeStyle = 'rgba(242,194,51,.28)'; g.beginPath(); g.arc(228, 232, 130, 0, TAU); g.stroke();
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); };
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#1a1a1f';
  poly([[24, H], [40, 460], [80, 418], [156, 392], [228, 388], [300, 392], [376, 418], [416, 460], [432, H]]); g.fillStyle = '#17191e'; g.fill(); g.stroke();
  poly([[202, 346], [254, 346], [256, 394], [228, 410], [200, 394]]); g.fillStyle = '#e9bd95'; g.fill();
  poly([[200, 394], [228, 410], [256, 394]]); g.stroke();
  g.strokeStyle = '#3c404a'; g.beginPath(); g.ellipse(228, 398, 40, 17, 0, 0, TAU); g.stroke();
  g.fillStyle = '#2bb3a8'; g.beginPath(); g.arc(158, 474, 34, 0, TAU); g.fill(); g.strokeStyle = '#146e68'; g.stroke();
  g.fillStyle = '#17191e'; g.fillRect(139, 458, 38, 9); g.fillRect(154, 458, 8, 37);
  g.drawImage(faceSticker(300, 8), 78, 76);
  return c;
}
function helmetCanvas(paint) {
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
  const P = paint || PAINTS.classic;
  const blue = P.helmet, blue2 = shade(P.helmet, -40), silver = '#d2d9e2', ink = '#0d1330', red = P.crest;
  g.lineJoin = 'round';
  for (const s of [-1, 1]) {
    const x = S / 2 + s * 196;
    g.beginPath(); g.moveTo(x - 24, 330); g.lineTo(x - 18, 84); g.lineTo(x + s * 12, 34); g.lineTo(x + 22, 330); g.closePath();
    g.fillStyle = blue; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
    g.fillStyle = silver; g.fillRect(x - 9, 96, 18, 70);
  }
  g.beginPath(); g.ellipse(S / 2, 266, 196, 214, 0, 0, TAU); g.fillStyle = blue; g.fill(); g.lineWidth = 10; g.strokeStyle = ink; g.stroke();
  g.beginPath(); g.ellipse(S / 2, 300, 168, 176, 0, 0, TAU); g.fillStyle = blue2; g.fill();
  g.beginPath(); g.moveTo(S / 2 - 30, 26); g.lineTo(S / 2 + 30, 26); g.lineTo(S / 2 + 14, 150); g.lineTo(S / 2 - 14, 150); g.closePath();
  g.fillStyle = silver; g.fill(); g.lineWidth = 7; g.strokeStyle = ink; g.stroke();
  g.fillStyle = red; g.fillRect(S / 2 - 8, 46, 16, 70);
  const f = faceSticker(330, 7, '#e8edf3', ink);
  g.drawImage(f, S / 2 - 165, 128);
  // worn glasses carry over into the helmet, and Kodex's 聚焦器 adds a visor
  const T = { x: S / 2 - 165 + 38.1, y: 128 + 11, s: 0.846 };
  if (typeof RPG !== 'undefined' && RPG.equip && RPG.equip.face) drawGlasses(g, RPG.equip.face, T);
  if (typeof RPG !== 'undefined' && RPG.owns && RPG.owns('lens')) { g.fillStyle = 'rgba(56,225,255,.38)'; g.fillRect(T.x - 10, T.y + 112 * T.s, 230 * T.s, 76 * T.s); g.fillStyle = 'rgba(160,245,255,.9)'; g.fillRect(T.x - 10, T.y + 146 * T.s, 230 * T.s, 5); }
  for (const s of [-1, 1]) {
    const x = S / 2 + s * 150;
    g.beginPath(); g.moveTo(x, 318); g.lineTo(x + s * 44, 300); g.lineTo(x + s * 34, 450); g.lineTo(x - s * 18, 478); g.closePath();
    g.fillStyle = silver; g.fill(); g.lineWidth = 7; g.strokeStyle = ink; g.stroke();
  }
  return c;
}

// drawn heads for the cast (sticker style, like the hero)
function drawHead(kind) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  const ink = '#141414';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const face = (skin = '#f1c9a5') => { g.beginPath(); g.ellipse(128, 138, 78, 90, 0, 0, TAU); g.fillStyle = skin; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke(); };
  const eyes = (y = 128, dx = 28, r = 9) => { g.fillStyle = ink; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * dx, y, r, 0, TAU); g.fill(); } };
  const smile = (y = 178, w = 30, d = 12) => { g.beginPath(); g.moveTo(128 - w, y); g.quadraticCurveTo(128, y + d, 128 + w, y); g.lineWidth = 7; g.strokeStyle = ink; g.stroke(); };
  const screen = (bg, bezel, txt, col, font) => {
    rrect(g, 30, 44, 196, 160, 26); g.fillStyle = bezel; g.fill(); g.lineWidth = 9; g.strokeStyle = ink; g.stroke();
    rrect(g, 48, 60, 160, 128, 16); g.fillStyle = bg; g.fill();
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font; g.fillText(txt, 128, 126);
  };
  switch (kind) {
    case 'klaude': {
      g.beginPath(); g.moveTo(128, 8); g.bezierCurveTo(240, 20, 250, 150, 236, 238); g.lineTo(20, 238); g.bezierCurveTo(6, 150, 16, 20, 128, 8); g.closePath();
      g.fillStyle = '#3a261d'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      g.strokeStyle = '#e8845a'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 226); g.bezierCurveTo(30, 150, 40, 40, 128, 24); g.bezierCurveTo(216, 40, 226, 150, 216, 226); g.stroke();
      rrect(g, 56, 70, 144, 116, 18); g.fillStyle = '#1b1613'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#e8845a'; g.stroke();
      g.shadowColor = '#ff9a66'; g.shadowBlur = 16; g.fillStyle = '#ff9a66'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT_MONO}`; g.fillText('>_', 128, 130); g.shadowBlur = 0;
      break;
    }
    case 'klaudeEvil': {
      g.beginPath(); g.moveTo(128, 8); g.bezierCurveTo(240, 20, 250, 150, 236, 238); g.lineTo(20, 238); g.bezierCurveTo(6, 150, 16, 20, 128, 8); g.closePath();
      g.fillStyle = '#2a1410'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      rrect(g, 56, 70, 144, 116, 18); g.fillStyle = '#140a08'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#ff5a2a'; g.stroke();
      g.shadowColor = '#ff3b1f'; g.shadowBlur = 18; g.fillStyle = '#ff5a2a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 40px ${FONT_MONO}`; g.fillText('rm -rf', 128, 118);
      g.font = `900 26px ${FONT_MONO}`; g.fillText('/ ▋', 128, 156); g.shadowBlur = 0;
      break;
    }
    case 'kodex':
      screen('#0b0d10', '#f2f3f5', '{ }', '#e9fff6', `900 76px ${FONT_MONO}`);
      g.fillStyle = '#35d49a'; g.fillRect(98, 168, 60, 7);
      break;
    case 'alfred':
      screen('#1d4ed8', '#c9ced6', '^_^', '#ffffff', `900 64px ${FONT_MONO}`);
      g.fillStyle = '#16a34a'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(80 + k * 32, 212, 6, 0, TAU); g.fill(); }
      g.fillStyle = '#b91c1c'; g.beginPath(); g.moveTo(96, 232); g.lineTo(128, 244); g.lineTo(160, 232); g.lineTo(160, 254); g.lineTo(128, 244); g.lineTo(96, 254); g.closePath(); g.fill();
      break;
    case 'gordon':
      face('#e9bd97'); g.fillStyle = '#6b4a2f'; g.beginPath(); g.ellipse(128, 70, 74, 36, 0, Math.PI, TAU); g.fill();
      g.lineWidth = 7; g.strokeStyle = ink; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 32, 128, 20, 0, TAU); g.stroke(); }
      g.beginPath(); g.moveTo(108, 128); g.lineTo(148, 128); g.stroke();
      eyes(128, 32, 6);
      g.fillStyle = '#8d8d8d'; g.beginPath(); g.ellipse(128, 176, 40, 14, 0, 0, TAU); g.fill(); g.stroke();
      break;
    case 'rachel':
      g.fillStyle = '#3b2418'; g.beginPath(); g.ellipse(128, 150, 104, 110, 0, 0, TAU); g.fill();
      face('#f5d0b3'); g.fillStyle = '#3b2418'; g.beginPath(); g.ellipse(128, 72, 80, 40, 0, Math.PI, TAU); g.fill();
      eyes(132, 28, 8); smile(178, 26, 14);
      g.fillStyle = '#ff9ec3'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 50, 160, 10, 0, TAU); g.fill(); }
      break;
    case 'crane':
      g.beginPath(); g.moveTo(52, 60); g.quadraticCurveTo(128, 0, 204, 60); g.lineTo(214, 200); g.quadraticCurveTo(128, 250, 42, 200); g.closePath();
      g.fillStyle = '#b79b6b'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      g.strokeStyle = '#5a4630'; g.lineWidth = 4; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(80 + k * 14, 168); g.lineTo(80 + k * 14, 186); g.stroke(); }
      g.beginPath(); g.moveTo(72, 178); g.lineTo(186, 178); g.stroke();
      g.fillStyle = '#1a1a1a'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 36, 116, 18, 24, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#9fe870'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 36, 116, 5, 0, TAU); g.fill(); }
      g.strokeStyle = '#6b5a3a'; g.lineWidth = 10; g.beginPath(); g.moveTo(40, 214); g.quadraticCurveTo(128, 236, 216, 214); g.stroke();
      break;
    case 'shadow':
      g.beginPath(); g.ellipse(128, 132, 92, 104, 0, 0, TAU); g.fillStyle = '#16161a'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      rrect(g, 58, 112, 140, 30, 12); g.fillStyle = '#ff7a3d'; g.fill();
      g.fillStyle = '#ffd3b0'; g.fillRect(78, 122, 26, 8); g.fillRect(152, 122, 26, 8);
      break;
    case 'master':
      g.beginPath(); g.moveTo(128, 6); g.bezierCurveTo(244, 22, 250, 160, 236, 240); g.lineTo(20, 240); g.bezierCurveTo(6, 160, 12, 22, 128, 6); g.closePath();
      g.fillStyle = '#5a1515'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      g.beginPath(); g.ellipse(128, 140, 60, 76, 0, 0, TAU); g.fillStyle = '#f2efe8'; g.fill(); g.stroke();
      g.fillStyle = '#b91c1c'; g.beginPath(); g.moveTo(84, 118); g.lineTo(118, 126); g.lineTo(88, 134); g.fill(); g.beginPath(); g.moveTo(172, 118); g.lineTo(138, 126); g.lineTo(168, 134); g.fill();
      g.fillRect(122, 150, 12, 40);
      break;
    case 'bug':
      g.strokeStyle = ink; g.lineWidth = 7; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 30, 60); g.quadraticCurveTo(128 + s * 60, 10, 128 + s * 86, 20); g.stroke(); g.fillStyle = '#9ae66e'; g.beginPath(); g.arc(128 + s * 86, 20, 10, 0, TAU); g.fill(); g.stroke(); }
      g.beginPath(); g.ellipse(128, 142, 90, 88, 0, 0, TAU); g.fillStyle = '#5fbf4a'; g.fill(); g.lineWidth = 8; g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 38, 124, 30, 36, 0, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.stroke(); g.fillStyle = ink; g.beginPath(); g.arc(128 + s * 34, 130, 12, 0, TAU); g.fill(); }
      g.beginPath(); g.moveTo(92, 186); g.lineTo(108, 176); g.lineTo(124, 188); g.lineTo(140, 176); g.lineTo(156, 188); g.lineTo(168, 178); g.lineWidth = 6; g.stroke();
      break;
    case 'labeler':
      face('#dfe6d6'); g.fillStyle = '#2a2a2a'; g.beginPath(); g.ellipse(128, 66, 78, 34, 0, Math.PI, TAU); g.fill();
      g.fillStyle = 'rgba(90,60,110,.55)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 30, 140, 18, 10, 0, 0, TAU); g.fill(); }
      eyes(128, 30, 10); g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 30 + 3, 125, 3, 0, TAU); g.fill(); }
      g.strokeStyle = ink; g.lineWidth = 7; g.beginPath(); g.moveTo(96, 184); g.quadraticCurveTo(128, 170, 160, 184); g.stroke();
      g.strokeStyle = '#222'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 96, Math.PI * 1.05, TAU * 0.98); g.stroke();
      break;
    case 'dama': // 胡同大妈: permed curls, red cheeks
      g.fillStyle = '#2b1d16'; for (let k = 0; k < 11; k++) { g.beginPath(); g.arc(60 + k * 13.6, 66 + Math.sin(k) * 6, 20, 0, TAU); g.fill(); }
      face('#f0c8a4'); g.fillStyle = '#2b1d16'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(70 + k * 14.5, 62, 15, 0, TAU); g.fill(); }
      eyes(130, 28, 7); smile(176, 30, 16); g.fillStyle = 'rgba(230,80,80,.35)'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 48, 162, 13, 0, TAU); g.fill(); }
      break;
    case 'daye': // 胡同大爷: bald top, grey sides, big grin
      face('#e8b890'); g.fillStyle = '#b8b8b8'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 70, 110, 16, 34, 0, 0, TAU); g.fill(); }
      g.strokeStyle = ink; g.lineWidth = 6; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 28, 128, 9, Math.PI, TAU); g.stroke(); }
      smile(174, 34, 18); g.fillStyle = '#fff'; g.fillRect(104, 176, 48, 8);
      break;
    case 'shopkeeper': // 掌柜: 瓜皮帽 + round glasses + little moustache
      face('#ecc59c'); g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(128, 70, 80, 40, 0, Math.PI, TAU); g.fill(); g.fillStyle = '#b91c1c'; g.beginPath(); g.arc(128, 30, 10, 0, TAU); g.fill();
      g.lineWidth = 6; g.strokeStyle = ink; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 30, 126, 16, 0, TAU); g.stroke(); }
      eyes(126, 30, 5); g.fillStyle = '#3a2a20'; g.beginPath(); g.moveTo(100, 168); g.quadraticCurveTo(128, 158, 156, 168); g.lineTo(128, 174); g.closePath(); g.fill();
      break;
    case 'doctor': // 老中医: white hair + long white beard
      g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(80, 170); g.quadraticCurveTo(128, 280, 176, 170); g.closePath(); g.fill(); g.lineWidth = 6; g.strokeStyle = ink; g.stroke();
      face('#efcfae'); g.fillStyle = '#f2f2f2'; g.beginPath(); g.ellipse(128, 66, 80, 34, 0, Math.PI, TAU); g.fill();
      g.beginPath(); g.moveTo(96, 176); g.quadraticCurveTo(128, 250, 160, 176); g.closePath(); g.fill(); g.stroke();
      eyes(128, 28, 6); g.fillStyle = '#f2f2f2'; g.fillRect(92, 108, 30, 7); g.fillRect(134, 108, 30, 7);
      break;
    case 'waiter': // 服务员: neat hair, red vest collar
      face('#f1cba8'); g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(128, 76, 80, 40, 0, Math.PI, TAU); g.fill(); g.fillRect(48, 70, 18, 40);
      eyes(130, 28, 7); smile(176, 26, 12); g.fillStyle = '#b91c1c'; g.fillRect(88, 222, 80, 20);
      break;
    case 'xs1': // 逗哏: round face, big eyebrows, grinning
      face('#f0c49c'); g.fillStyle = '#111'; g.beginPath(); g.ellipse(128, 70, 82, 38, 0, Math.PI, TAU); g.fill();
      g.lineWidth = 9; g.strokeStyle = ink; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 14, 106); g.lineTo(128 + s * 50, 100); g.stroke(); }
      eyes(128, 30, 8); smile(172, 40, 22);
      break;
    case 'xs2': // 捧哏: long face, deadpan
      g.beginPath(); g.ellipse(128, 138, 64, 96, 0, 0, TAU); g.fillStyle = '#ecc39e'; g.fill(); g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
      g.fillStyle = '#2a2a2a'; g.beginPath(); g.ellipse(128, 60, 62, 26, 0, Math.PI, TAU); g.fill();
      eyes(124, 24, 6); g.lineWidth = 7; g.beginPath(); g.moveTo(108, 184); g.lineTo(148, 184); g.stroke();
      break;
    default: {
      const skin = pick(['#f1c9a5', '#e0ac86', '#f5d5b8', '#c98e6b']);
      const hair = pick(['#1b1b1b', '#3b2a20', '#6b4a2f', '#111']);
      face(skin); g.fillStyle = hair;
      if (kind === 'clerk2') { g.beginPath(); g.ellipse(128, 110, 92, 88, 0, Math.PI * 0.95, TAU * 1.02); g.fill(); }
      else if (kind === 'clerk3') { g.fillStyle = '#1f6feb'; g.beginPath(); g.ellipse(128, 66, 84, 30, 0, Math.PI, TAU); g.fill(); g.fillRect(40, 60, 176, 14); }
      else { g.beginPath(); g.ellipse(128, 70, 76, 36, 0, Math.PI, TAU); g.fill(); }
      eyes(130, 28, 8); smile(176, 24, 10);
    }
  }
  return stickerOf(c, 256, 7);
}

// ---------------- robot paint jobs & outfits ----------------
const PAINTS = {
  classic: { name: '经典红蓝', chest: 0xd7263d, arm: 0xd7263d, leg: 0x1f4fd1, trim: 0xbac3cd, helmet: '#2156d8', crest: '#d7263d' },
  knight: { name: '暗夜黑金', chest: 0x22252b, arm: 0x2c3038, leg: 0x16181d, trim: 0xd4a93a, helmet: '#1a1c22', crest: '#e0b64a' },
  bee: { name: '警戒黄黑', chest: 0xf2c418, arm: 0xf2c418, leg: 0x2a2d33, trim: 0xd9dde2, helmet: '#e8b90f', crest: '#2a2d33' },
  aurora: { name: '极光白', chest: 0xeef2f6, arm: 0xdfe6ee, leg: 0x6b7a8f, trim: 0x7fe3ff, helmet: '#dfe8f2', crest: '#34d3ff' },
  neon: { name: '赛博霓虹', chest: 0xff2d95, arm: 0x7c3aed, leg: 0x111827, trim: 0x22d3ee, helmet: '#7c3aed', crest: '#22d3ee' },
  klaude: { name: '缴获·Klaude 橙', chest: 0xd97757, arm: 0xc4613f, leg: 0x3a261d, trim: 0xf2e6d8, helmet: '#c4613f', crest: '#f2e6d8' },
  jingju: { name: '京剧脸谱', chest: 0xb3171b, arm: 0x15171b, leg: 0x15171b, trim: 0xe8b422, helmet: '#b3171b', crest: '#e8b422' },
};
const OUTFITS = {
  tee: { name: '黑 T 恤（原版）', shirt: 0x17191e, print: 0x2bb3a8, pants: 0x2b2f3a, shoe: 0x8a8f99 },
  plaid: { name: '程序员格子衫', shirt: 0xb4402f, print: 0x2b3a67, pants: 0x3b4f6b, shoe: 0x5a4a3a, plaid: true },
  hoodie: { name: '连帽卫衣', shirt: 0x6b7280, print: 0xf5f5f5, pants: 0x1f2937, shoe: 0xf5f5f5 },
  suit: { name: '韦恩式西装', shirt: 0x1c1f26, print: 0xf5f5f5, pants: 0x1c1f26, shoe: 0x0b0b0b, tie: true },
  batsuit: { name: 'Token 侠战衣', shirt: 0x15171b, print: 0xe0b64a, pants: 0x15171b, shoe: 0x0b0b0b, cape: true },
  laotou: { name: '老头衫（跨栏背心）', shirt: 0xf4f2ec, pants: 0x3b4252, shoe: 0x1b1b1b, tank: true },
  tracksuit: { name: '蓝白校服', shirt: 0x1e56c8, print: 0xffffff, pants: 0x1e56c8, shoe: 0xf5f5f5, stripes: 0xffffff, longSleeve: true },
  delivery: { name: '外卖骑手服', shirt: 0xf6c21a, print: 0x111111, pants: 0x1f2937, shoe: 0x1b1b1b, longSleeve: true },
  tangzhuang: { name: '红色唐装', shirt: 0xb3171b, print: 0xe8b422, pants: 0x1b1b1b, shoe: 0x1b1b1b, tang: true, longSleeve: true },
};

// ---------------- geometry helpers ----------------
const _BOX = new THREE.BoxGeometry(1, 1, 1);
function MX(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
}
const box = (x, y, z, w, h, d, c, ry = 0) => ({ geo: _BOX, c, m: MX(x, y, z, 0, ry, 0, w, h, d) });
const gpart = (geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({ geo, c, m: MX(x, y, z, rx, ry, rz, sx, sy, sz) });
// free per-instance geometry (flagged userData.own) when a character/car leaves the scene; cached/shared geometry is left alone
function disposeOwn(root) { if (root) root.traverse((o) => { if (o.geometry && o.geometry.userData.own) o.geometry.dispose(); }); }
function mergeParts(parts) {
  let total = 0;
  for (const p of parts) total += p.geo.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const idx = [];
  const v = new V3(), n = new V3(), nm = new THREE.Matrix3(), c = new THREE.Color();
  let off = 0;
  for (const p of parts) {
    const g = p.geo, Pa = g.attributes.position, Na = g.attributes.normal;
    nm.getNormalMatrix(p.m); c.set(p.c);
    for (let i = 0; i < Pa.count; i++) {
      const k = (off + i) * 3;
      v.fromBufferAttribute(Pa, i).applyMatrix4(p.m); pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      n.fromBufferAttribute(Na, i).applyMatrix3(nm).normalize(); nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < Pa.count; i++) idx.push(off + i);
    off += Pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(idx); out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
function mergeGeos(geos) {
  const out = { position: [], normal: [], uv: [] }, idx = [];
  let off = 0;
  for (const g of geos) {
    for (const a of ['position', 'normal', 'uv']) { const arr = g.attributes[a].array; for (let i = 0; i < arr.length; i++) out[a].push(arr[i]); }
    const cnt = g.attributes.position.count;
    if (g.index) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx.push(ia[i] + off); }
    else for (let i = 0; i < cnt; i++) idx.push(off + i);
    off += cnt;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  r.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  r.setIndex(idx); r.computeBoundingSphere();
  return r;
}
function flatPlane(w, d, x, y, z, su, sv, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  g.translate(x, y, z);
  return g;
}
function scaleBoxUV(g, fn) {
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) { const [su, sv] = fn(f); for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); } }
}
// a box translated into world space; sides tile 16u, top tiles 8u
function sideGeo(w, h, d, x, y, z, rep = 16, vOff = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  scaleBoxUV(g, (f) => (f < 2 ? [d / rep, h / rep] : f < 4 ? [w / 8, d / 8] : [w / rep, h / rep]));
  if (vOff) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + vOff); }
  const ia = g.index.array, sides = [], tops = [];
  for (const f of [0, 1, 4, 5]) for (let k = 0; k < 6; k++) sides.push(ia[f * 6 + k]);
  for (const f of [2, 3]) for (let k = 0; k < 6; k++) tops.push(ia[f * 6 + k]);
  g.translate(x, y + h / 2, z);
  const side = g.clone(); side.setIndex(sides);
  const top = g.clone(); top.setIndex(tops);
  return [side, top];
}
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  scaleBoxUV(g, (f) => (f < 2 ? [d / 16, h / 16] : f < 4 ? [w / 8, d / 8] : [w / 16, h / 16]));
  const ia = g.index.array, order = [0, 1, 4, 5, 2, 3], ni = [];
  for (const f of order) for (let k = 0; k < 6; k++) ni.push(ia[f * 6 + k]);
  g.setIndex(ni); g.clearGroups(); g.addGroup(0, 24, 0); g.addGroup(24, 12, 1);
  return g;
}
function coinGeometry() {
  const g = new THREE.CylinderGeometry(1, 1, 0.24, 14);
  const uv = g.attributes.uv, grp = g.groups[0], ia = g.index;
  for (let k = grp.start; k < grp.start + grp.count; k++) uv.setXY(ia.getX(k), 0.02, 0.02);
  const back = g.groups[2], seen = new Set();
  for (let k = back.start; k < back.start + back.count; k++) { const vi = ia.getX(k); if (!seen.has(vi)) { seen.add(vi); uv.setY(vi, 1 - uv.getY(vi)); } }
  g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2);
  g.clearGroups();
  return g;
}

function buildAssets() {
  TEX.asphalt = asphaltTex(); TEX.road = roadTex(); TEX.inter = interTex(); TEX.walk = walkTex();
  TEX.grass = grassTex(); TEX.plaza = plazaTex(); TEX.roof = roofTex(); TEX.sand = sandTex();
  TEX.wood = woodTex(); TEX.woodDark = woodTex('#5a3a22'); TEX.tile = tileTex(); TEX.tileDark = tileTex('#3a3f47', '#30343b');
  TEX.carpet = carpetTex(); TEX.carpetRed = carpetTex('#6b2430'); TEX.concrete = tileTex('#8e8b85', '#85827c', 2);
  TEX.coin = coinTex(); TEX.soft = softTex(); TEX.ring = ringTex(); TEX.disc = discTex(); TEX.cone = coneTex(); TEX.letter = letterTex();
  TEX.cha = glyphTex('查', '#1d6fe0'); TEX.gas = glyphTex('幻', '#4d7c0f', '#d9f99d'); TEX.notFound = notFoundTex();
  [TEX.curtain, TEX.curtainE] = curtainTex();
  TEX.ads = adsAtlas();
  TEX.face = tex(faceSticker(256, 9)); TEX.faceEq = tex(heroHeadCanvas(null, null));
  TEX.helmet = tex(helmetCanvas(PAINTS.classic));
  TEX.legalDecal = decalTex('法务', '#15171b', '#ffffff');
  TEX.taxiDecal = decalTex('出租', '#f5c518', '#111111');
  for (const k of ['klaude', 'klaudeEvil', 'kodex', 'alfred', 'gordon', 'rachel', 'crane', 'shadow', 'master', 'bug', 'labeler', 'clerk1', 'clerk2', 'clerk3', 'dama', 'daye', 'shopkeeper', 'doctor', 'waiter', 'xs1', 'xs2']) HEADS[k] = tex(drawHead(k));
  HEADS.hero = TEX.faceEq;

  MAT.vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.vcGlow = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 });
  MAT.burnt = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3430 });
  MAT.roof = Render.cutout(new THREE.MeshLambertMaterial({ map: TEX.roof }));
  MAT.facades = FACADES.map((f) => Render.cutout(makeFacade(f)));
  MAT.shops = [0, 1, 2, 3].map(() => Render.cutout(makeShopfront()));
  MAT.bldProps = Render.cutout(new THREE.MeshLambertMaterial({ vertexColors: true }));
  MAT.coin = new THREE.MeshLambertMaterial({ map: TEX.coin, emissive: 0xffffff, emissiveMap: TEX.coin, emissiveIntensity: 0.55 });
  MAT.lampHead = new THREE.MeshBasicMaterial({ color: 0xfff1b8 });
  MAT.lampPool = new THREE.MeshBasicMaterial({ map: TEX.disc, color: 0xffcf7a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  MAT.carLights = new THREE.MeshBasicMaterial({ vertexColors: true });
  MAT.headBeam = new THREE.MeshBasicMaterial({ map: TEX.cone, color: 0xfff0c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  MAT.ads = Render.cutout(new THREE.MeshBasicMaterial({ map: TEX.ads }));
  MAT.redBlink = Render.cutout(new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  MAT.markerGlow = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  MAT.glowVC = new THREE.MeshBasicMaterial({ vertexColors: true });
}
