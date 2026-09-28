/* ============================================================
   interiors: SA-style enterable rooms far outside the city,
   yellow door markers, furniture colliders, interactions,
   gym minigame, and the 舆情公关中心 drive-in (Pay 'n' Spray)
   ============================================================ */
function collideList(pos, r, list) {
  let hit = null;
  for (const s of list) {
    const cx = clamp(pos.x, s.x0, s.x1), cz = clamp(pos.z, s.z0, s.z1);
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), push = r - d; dx /= d; dz /= d; pos.x += dx * push; pos.z += dz * push; hit = s; }
    else { const pl = pos.x - s.x0, pr = s.x1 - pos.x, pt = pos.z - s.z0, pb = s.z1 - pos.z, m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = s.x0 - r; else if (m === pr) pos.x = s.x1 + r; else if (m === pt) pos.z = s.z0 - r; else pos.z = s.z1 + r; hit = s; }
  }
  return hit;
}
const IBASE = 4000;
function whiteboardTex(lines) {
  const c = mkCanvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 512, 256); g.lineWidth = 10; g.strokeStyle = '#94a3b8'; g.strokeRect(5, 5, 502, 246);
  g.fillStyle = '#1e3a8a'; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((l, i) => { g.font = `${i ? 700 : 900} ${i ? 26 : 34}px ${FONT_CN}`; g.fillStyle = i ? '#334155' : '#b91c1c'; g.fillText(l, 22, 18 + i * 44); });
  return tex(c);
}
function screenTex(txt, bg = '#0b1220', fg = '#34d399') {
  const c = mkCanvas(128, 80), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 80); g.fillStyle = fg; g.font = `700 11px ${FONT_MONO}`;
  const rows = txt.split('\n'); rows.forEach((r, i) => g.fillText(r, 6, 14 + i * 13));
  return tex(c);
}

const INTERIORS = {
  home: { name: 'Token 王府', w: 30, d: 22, floor: 'wood', wall: 0xd8cfc0, light: 0xfff1dc, old: true, mood: { hi: 0.56, si: 0.38, ex: 1.0 } },
  snack: { name: '护锅寺小吃', w: 22, d: 16, floor: 'paving', wall: 0xe2d8c6, light: 0xffe2b0, old: true, mood: { hi: 0.56, si: 0.38 } },
  electronics: { name: '海量电子城', w: 22, d: 16, floor: 'tileDark', wall: 0x1f2937, light: 0x9fe7ff },
  clothes: { name: '西单袖水服装城', w: 20, d: 14, floor: 'wood', wall: 0xe1d8ca, light: 0xfff4e0, mood: { hi: 0.56, si: 0.38 } },
  dept: { name: '王府景百货大楼', w: 24, d: 16, floor: 'tile', wall: 0xe0d8ca, light: 0xfff6e8, mood: { hi: 0.56, si: 0.38 } },
  antique: { name: '琉璃厂 · 容错斋', w: 22, d: 16, floor: 'wood', wall: 0x6b4a30, light: 0xffd9a0, old: true, mood: { hi: 0.5, si: 0.34, tint: [1.06, 1.0, 0.92] } },
  shoes: { name: '内联胜布鞋', w: 20, d: 14, floor: 'wood', wall: 0xd6c6ac, light: 0xfff0d0, old: true, mood: { hi: 0.56, si: 0.38 } },
  pharmacy: { name: '同 Token 堂', w: 22, d: 16, floor: 'paving', wall: 0x7a5236, light: 0xffe0a8, old: true, mood: { hi: 0.52, si: 0.36, tint: [1.05, 1.0, 0.94] } },
  duck: { name: '权重德烤鸭', w: 26, d: 18, floor: 'carpetRed', wall: 0xcdbb9c, light: 0xffd8a0, old: true, mood: { hi: 0.56, si: 0.38, tint: [1.05, 1.0, 0.95] } },
  teahouse: { name: '天桥 · 得云社', w: 26, d: 20, floor: 'wood', wall: 0x5a3a22, light: 0xffd090, old: true, mood: { hi: 0.5, si: 0.34, tint: [1.06, 1.0, 0.92] } },
  hardware: { name: '老王五金', w: 20, d: 14, floor: 'concrete', wall: 0x9a958c, light: 0xfff4e0, mood: { hi: 0.56, si: 0.38 } },
  gym: { name: '东单体育馆', w: 24, d: 16, floor: 'tileDark', wall: 0x3f3f46, light: 0xffe4c4 },
  lab: { name: 'Kodex 应用科学部', w: 28, d: 20, floor: 'tile', wall: 0xd5dde4, light: 0xeafff6, mood: { hi: 0.5, si: 0.36, ex: 0.98, tint: [0.96, 1.02, 1.04] } },
  dojo: { name: '影之 Agent 联盟道场', w: 28, d: 22, floor: 'wood', wall: 0x5a3a22, light: 0xffb47a, mood: { hi: 0.5, si: 0.35, sc: '#ffb47a', ex: 1.05, tint: [1.08, 0.98, 0.9] } },
  arkham: { name: '阿卡姆标注中心', w: 32, d: 24, floor: 'tileDark', wall: 0x2b3024, light: 0xb9f27c, mood: { hi: 0.36, si: 0.26, sc: '#b9f27c', ex: 1.0, tint: [0.92, 1.06, 0.9] } },
  prison: { name: '显存看守所', w: 26, d: 20, floor: 'concrete', wall: 0x6b6b6b, light: 0xdfe7ff, noExit: true, mood: { hi: 0.52, si: 0.4, sc: '#dfe7ff', ex: 1.0, tint: [0.95, 0.98, 1.06], sat: 0.85 } },
  well: { name: '四合院的井', w: 16, d: 16, floor: 'concrete', wall: 0x2b2b2b, light: 0x8aa0c8, noExit: true, mood: { hi: 0.16, si: 0.34, sc: '#8aa0c8', ex: 0.95, tint: [0.85, 0.92, 1.12], sat: 0.7 } },
};
const INTERIOR_ORDER = Object.keys(INTERIORS);
function menuTex(lines) {
  const c = mkCanvas(512, 192), g = c.getContext('2d');
  g.fillStyle = '#9b1c14'; g.fillRect(0, 0, 512, 192); g.strokeStyle = '#f2c94c'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 180);
  g.fillStyle = '#ffe8a3'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = `900 34px ${FONT_CN}`; g.fillText(l, 128 + (i % 2) * 256, 44 + Math.floor(i / 2) * 52); });
  return tex(c);
}
function scrollTex(t) {
  const c = mkCanvas(96, 256), g = c.getContext('2d');
  g.fillStyle = '#f3ead2'; g.fillRect(0, 0, 96, 256); g.fillStyle = '#6b4a30'; g.fillRect(0, 0, 96, 10); g.fillRect(0, 246, 96, 10);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 44px ${FONT_CN}`;
  [...t].forEach((ch, i) => g.fillText(ch, 48, 44 + i * 54));
  return tex(c);
}

/* ---------------- room kit: PBR shells (plank / brick / stone floors, wainscot + plaster walls, painted frieze, coffered or
   panelled ceilings, lacquer columns, paper lattice windows), lathe lanterns, bevelled procedural furniture and Poly Haven CC0
   furniture (instanced per room). Everything is room-local (x across, z from the back wall -d/2 to the door +d/2, metres) ---------------- */
// the rooms' own photo sets: the 512 copies early in the background stream, the full maps later (PBR swaps them in)
const IK_SETS = ['wood_floor', 'plaster_beige', 'wood_dark'];
for (const k of IK_SETS) for (const m of PBR.HI ? ['albedo', 'normal', 'arm'] : ['albedo']) {
  Assets.need(PBR.key(k, m), PBR.path(k, m), { tier: 'stream', prio: 3 });
  if (PBR.HI) { Assets.need(PBR.key(k, m, 1), PBR.path(k, m, 1), { tier: 'stream', prio: 44, max: PBR.S }); Assets.on(PBR.key(k, m, 1), () => Jobs.add(() => PBR.upgrade(k, m))); }
}
const IK_FURN = ['chinese_armchair', 'chinese_tea_table', 'chinese_stool', 'chinese_cabinet', 'chinese_screen_panels', 'chinese_chandelier', 'chinese_commode',
  'chinese_console_table', 'chinese_sofa', 'antique_ceramic_vase_01', 'ceramic_vase_02', 'wooden_display_shelves_01', 'steel_frame_shelves_01', 'metal_office_desk',
  'modern_arm_chair_01', 'potted_plant_04', 'wooden_crate_02', 'round_wooden_table_02', 'wooden_bookshelf_worn'];
for (const k of IK_FURN) Assets.need('furn/' + k, 'furniture/' + k + '.glb', { tier: 'stream', prio: 6 });

// uv × (su, sv): a primitive's 0..1 uvs into metres
function ikUV(g, su, sv) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv); return g; }
// a bevelled box (45° chamfer of radius r, soft normals), uv in metres per face: the unit 3×3×3 box's vertices snap to the edges
const _IKB = (() => {
  const b = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), P = b.attributes.position.array, D = new Float32Array(P.length), v = new V3(), hs = 1 / 6;
  for (let i = 0; i < P.length; i += 3) { v.set(P[i] - Math.sign(P[i]) * hs, P[i + 1] - Math.sign(P[i + 1]) * hs, P[i + 2] - Math.sign(P[i + 2]) * hs).normalize(); D[i] = v.x; D[i + 1] = v.y; D[i + 2] = v.z; }
  return { b, D };
})();
function ikBox(w, h, d, r = 0.015) {
  r = Math.max(0.002, Math.min(r, w * 0.45, h * 0.45, d * 0.45));
  const g = _IKB.b.clone(), S = _IKB.b.attributes.position.array, D = _IKB.D, P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
  const e = [w / 2 - r, h / 2 - r, d / 2 - r];
  for (let i = 0; i < P.length; i++) { P[i] = Math.sign(S[i]) * e[i % 3] + D[i] * r; N[i] = D[i]; }
  const fd = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // faces px nx py ny pz nz, 16 vertices each
  for (let f = 0; f < 6; f++) for (let k = 0; k < 16; k++) { const j = (f * 16 + k) * 2; U[j] *= fd[f][0]; U[j + 1] *= fd[f][1]; }
  return g;
}
const _IKS = new THREE.SphereGeometry(1, 14, 10);
// canvas textures of the kit (made once)
const IKT = {
  get(k, fn) { return this[k] || (this[k] = fn()); },
  // paper lattice window (步步锦): dark frame and muntins over warm paper; e = the glow of the lamp-lit room behind it
  win() {
    return this.get('_win', () => {
      const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), e = mkCanvas(S, S), ge = e.getContext('2d');
      const grd = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.7); grd.addColorStop(0, '#f6e7c4'); grd.addColorStop(1, '#d9c296'); g.fillStyle = grd; g.fillRect(0, 0, S, S);
      const ge2 = ge.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.75); ge2.addColorStop(0, '#ffcf8a'); ge2.addColorStop(1, '#7a4a1c'); ge.fillStyle = ge2; ge.fillRect(0, 0, S, S);
      const bar = (x, y, w, h) => { for (const q of [g, ge]) { q.fillStyle = q === g ? '#3b2314' : '#000'; q.fillRect(x, y, w, h); } };
      bar(0, 0, S, 14); bar(0, S - 14, S, 14); bar(0, 0, 14, S); bar(S - 14, 0, 14, S);
      // 步步锦: nested stepped rectangles
      for (const [x0, y0, x1, y1] of [[40, 40, 216, 216], [72, 72, 184, 184], [104, 104, 152, 152]]) { bar(x0, y0, x1 - x0, 6); bar(x0, y1 - 6, x1 - x0, 6); bar(x0, y0, 6, y1 - y0); bar(x1 - 6, y0, 6, y1 - y0); }
      for (const t of [40, 72, 104]) { bar(14, t, t - 14, 6); bar(S - t, t, t - 14, 6); bar(14, S - t - 6, t - 14, 6); bar(S - t, S - t - 6, t - 14, 6); bar(t, 14, 6, t - 14); bar(t, S - t, 6, t - 14); bar(S - t - 6, 14, 6, t - 14); bar(S - t - 6, S - t, 6, t - 14); }
      bar(S / 2 - 3, 14, 6, 26); bar(S / 2 - 3, S - 40, 6, 26); bar(14, S / 2 - 3, 26, 6); bar(S - 40, S / 2 - 3, 26, 6);
      return { map: tex(c), emi: tex(e) };
    });
  },
  // 天花: one coffer of a painted ceiling (a gold-ringed rosette on blue-green in a dark red grid)
  coffer() {
    return this.get('_coffer', () => {
      const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
      g.fillStyle = '#4a1a12'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#1f4f6f'; g.fillRect(18, 18, S - 36, S - 36);
      g.strokeStyle = '#d8ad45'; g.lineWidth = 4; g.strokeRect(24, 24, S - 48, S - 48);
      g.fillStyle = '#2c7a5a'; for (const [x, y] of [[24, 24], [S - 24, 24], [24, S - 24], [S - 24, S - 24]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x < S / 2 ? 44 : -44), y); g.lineTo(x, y + (y < S / 2 ? 44 : -44)); g.closePath(); g.fill(); }
      for (const [r, col] of [[74, '#d8ad45'], [68, '#173a6e'], [54, '#f2f0e6'], [46, '#2c7a5a'], [30, '#f2f0e6'], [22, '#b8322a'], [9, '#d8ad45']]) { g.fillStyle = col; g.beginPath(); g.arc(S / 2, S / 2, r, 0, TAU); g.fill(); }
      g.strokeStyle = '#d8ad45'; g.lineWidth = 2; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * 30, S / 2 + Math.sin(a) * 30); g.lineTo(S / 2 + Math.cos(a) * 54, S / 2 + Math.sin(a) * 54); g.stroke(); }
      speckle(g, S, S, 900, 0.05);
      const t = tex(c, true); return t;
    });
  },
  // a rug: base colour, a 回纹 border and a round medallion
  rug(base, edge) {
    return this.get('_rug' + base + edge, () => {
      const W = 512, H = 320, c = mkCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = edge; g.fillRect(0, 0, W, H); g.fillStyle = base; g.fillRect(26, 26, W - 52, H - 52);
      g.strokeStyle = edge; g.lineWidth = 5;
      for (let x = 34; x < W - 40; x += 22) for (const y of [8, H - 22]) { g.strokeRect(x, y, 14, 14); }
      for (let y = 34; y < H - 40; y += 22) for (const x of [8, W - 22]) { g.strokeRect(x, y, 14, 14); }
      g.strokeStyle = shade(edge, 30); g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
      for (const [r, col] of [[92, edge], [80, base], [70, shade(edge, 25)], [40, base], [20, edge]]) { g.fillStyle = col; g.beginPath(); g.ellipse(W / 2, H / 2, r * 1.35, r, 0, 0, TAU); g.fill(); }
      for (const [x, y] of [[70, 70], [W - 70, 70], [70, H - 70], [W - 70, H - 70]]) { g.fillStyle = shade(edge, 25); g.beginPath(); g.arc(x, y, 18, 0, TAU); g.fill(); }
      speckle(g, W, H, 5000, 0.06, 1);
      return tex(c);
    });
  },
  // a monitor / wall screen: code, a loss curve or a token meter over a dark UI
  screen(kind, col = '#34d399') {
    return this.get('_scr' + kind + col, () => {
      const W = 256, H = 160, c = mkCanvas(W, H), g = c.getContext('2d');
      g.fillStyle = '#060a10'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, W, 14);
      g.fillStyle = col; g.font = `700 9px ${FONT_MONO}`;
      if (kind === 'code') for (let i = 0; i < 12; i++) { g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(8 + (i % 3) * 10, 22 + i * 11, rand(40, 180), 5); }
      else if (kind === 'chart') { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let x = 0; x < W - 16; x += 4) { const y = 140 - 110 * Math.exp(-x / 70) - rand(0, 8); x ? g.lineTo(8 + x, y) : g.moveTo(8, y); } g.stroke(); g.globalAlpha = 0.3; for (let y = 30; y < 150; y += 20) g.fillRect(8, y, W - 16, 1); }
      else { for (let i = 0; i < 8; i++) { g.globalAlpha = 0.9; g.fillRect(10, 24 + i * 16, (W - 20) * rand(0.2, 1), 9); } }
      g.globalAlpha = 1;
      return tex(c);
    });
  },
};
const IK = {
  M: new Map(),
  // a photo set whose files have streamed in (all its maps: PBR.base would remember a missing one)
  ready(k) { return (PBR.HI ? ['albedo', 'normal', 'arm'] : ['albedo']).every((m) => Assets.has(PBR.key(k, m)) || (PBR.HI && Assets.has(PBR.key(k, m, 1)))); },
  // a set as a material (cached once it exists; until then a flat stand-in, not cached, so a later room gets the real thing)
  pbr(k, o, fb) {
    const key = k + JSON.stringify(o); let m = this.M.get(key); if (m) return m;
    m = this.ready(k) ? PBR.mat(k, o) : null; if (!m) return fb();
    this.M.set(key, m); return m;
  },
  std(key, o) {
    let m = this.M.get(key);
    if (!m) { if (PBR.HI) m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7, metalness: 0 }, o)); else { const { roughness, metalness, ...l } = o; void roughness; void metalness; m = new THREE.MeshLambertMaterial(l); } this.M.set(key, m); }
    return m;
  },
  lam(key, o) { let m = this.M.get(key); if (!m) this.M.set(key, m = new THREE.MeshLambertMaterial(o)); return m; },
  floor(kind) {
    if (kind === 'paving') return this.pbr('courtyard_brick', { tile: 1.6, color: 0xeae6e0 }, () => this.lam('fl:pave', { map: TEX.paving }));
    if (kind === 'tile') return this.pbr('granite_tile', { tile: 1.2, color: 0xf6f2ec, rough: 0.55 }, () => this.lam('fl:tile', { map: TEX.tile }));
    if (kind === 'tileDark') return this.pbr('granite_tile', { tile: 1.2, color: 0x5c6068, rough: 0.5 }, () => this.lam('fl:tiled', { map: TEX.tileDark }));
    if (kind === 'concrete') return this.pbr('concrete', { tile: 3, color: 0xd6d1c8 }, () => this.lam('fl:conc', { map: TEX.concrete }));
    return this.pbr('wood_floor', { tile: 2.4, color: 0xf2e6d8, rough: 0.8 }, () => this.lam('fl:wood', { map: TEX.wood }));
  },
  plaster(hex) { return this.pbr('plaster_beige', { tile: 3, color: hex }, () => this.lam('pl' + hex, { color: hex })); },
  wood(hex = 0xffffff) { return this.pbr('wood_dark', { tile: 1.2, color: hex, rough: 0.72 }, () => this.lam('wd' + hex, { map: TEX.woodDark, color: hex })); },
  lacquer() { return BJ.mats.lacquer || this.std('lacq', { color: 0x8e1c12, roughness: 0.45 }); },
  marble() { return BJ.mats.marble || this.std('marb', { color: 0xeeeae2, roughness: 0.5 }); },
  brick() { return BJ.mats.greyBrick || this.lam('brk', { map: TEX.brick }); },
  concrete(hex = 0xd6d1c8) { return this.pbr('concrete', { tile: 3, color: hex }, () => this.lam('cc' + hex, { map: TEX.concrete, color: hex })); },
  metal(hex = 0x3a3f47, rough = 0.35) { return this.std('mt' + hex + rough, { color: hex, metalness: 0.85, roughness: rough }); },
  gold() { return this.std('gold', { color: 0xd8b04a, metalness: 1, roughness: 0.32 }); },
  cloth(hex) { return this.std('cl' + hex, { color: hex, roughness: 0.95, side: THREE.DoubleSide }); },
  glaze(hex) { return this.std('gz' + hex, { color: hex, roughness: 0.25 }); },
  glass(hex = 0xd8e8ee) { return this.std('gs' + hex, { color: hex, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }); },
  vc() { return this.std('vc', { vertexColors: true, roughness: 0.62 }); },
  // emissive surfaces (bloom): lantern paper, screens, light panels, the oven's mouth
  glow(hex, k = 2.2) { return PBR.HI ? this.std('gl' + hex + k, { color: 0x140604, emissive: hex, emissiveIntensity: k, roughness: 0.6 }) : this.M.get('gb' + hex) || (this.M.set('gb' + hex, new THREE.MeshBasicMaterial({ color: hex })), this.M.get('gb' + hex)); },
  glowTex(key, t, k = 1.3) { return PBR.HI ? this.std('gt' + key, { color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: k, roughness: 0.3 }) : this.M.get('gtb' + key) || (this.M.set('gtb' + key, new THREE.MeshBasicMaterial({ map: t })), this.M.get('gtb' + key)); },
  paperWin() { const T = IKT.win(); return this.std('paper', { map: T.map, emissive: 0xffffff, emissiveMap: T.emi, emissiveIntensity: 0.85, roughness: 0.9 }); },
  coffer() { const t = IKT.coffer(); t.repeat.set(1 / 1.6, 1 / 1.6); return this.std('coffer', { map: t, roughness: 0.8 }); },
  // the 彩画 band under the ceiling (TEX.caihua: one 1024 px strip ≈ 5 m)
  frieze() { if (!this.M.has('frz')) { const t = TEX.caihua.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(1 / 5, 1 / 0.62); t.needsUpdate = true; this.std('frz', { map: t, roughness: 0.8 }); } return this.M.get('frz'); },
  rug(base, edge) { return this.std('rug' + base + edge, { map: IKT.rug(base, edge), roughness: 0.95 }); },
  tex(key, t) { return this.std('tx' + key, { map: t, roughness: 0.85 }); },
};
class IKit {
  constructor(grp, cast = true) { this.grp = grp; this.cast = cast; this.L = new Map(); this.vc = []; this.lit = []; this.F = []; }
  put(mat, g, m) { if (m) g.applyMatrix4(m); let a = this.L.get(mat); if (!a) this.L.set(mat, a = []); a.push(g); return this; }
  // bevelled box, centre (x, y, z), turned ry
  box(mat, x, y, z, w, h, d, r = 0.015, ry = 0, rx = 0, rz = 0) { return this.put(mat, ikBox(w, h, d, r), MX(x, y, z, rx, ry, rz)); }
  // box standing on y0
  blk(mat, x, y0, z, w, h, d, r = 0.015, ry = 0) { return this.box(mat, x, y0 + h / 2, z, w, h, d, r, ry); }
  // upright cylinder / cone from y0 up h (or centred and turned: cylC)
  cyl(mat, x, y0, z, rt, rb, h, n = 18, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, n, 1, open); ikUV(g, TAU * Math.max(rt, rb), h); return this.put(mat, g, MX(x, y0 + h / 2, z)); }
  cylC(mat, x, y, z, rt, rb, h, n = 12, rx = 0, ry = 0, rz = 0) { const g = new THREE.CylinderGeometry(rt, rb, h, n); ikUV(g, TAU * Math.max(rt, rb), h); return this.put(mat, g, MX(x, y, z, rx, ry, rz)); }
  // a turned profile [[r, y], …] (lanterns, vases, pots, table legs)
  lathe(mat, pts, x, y, z, n = 24, s = 1, sy = s) { const g = new THREE.LatheGeometry(pts.map(([r, yy]) => new THREE.Vector2(r, yy)), n); ikUV(g, TAU * Math.max(...pts.map((p) => p[0])), Math.abs(pts[pts.length - 1][1] - pts[0][1]) || 1); return this.put(mat, g, MX(x, y, z, 0, 0, 0, s, sy, s)); }
  // a flat panel facing +z (turned ry), uv in metres (or uw × uh repeats)
  plane(mat, x, y, z, w, h, ry = 0, rx = 0, uw = w, uh = h) { const g = new THREE.PlaneGeometry(w, h); ikUV(g, uw, uh); return this.put(mat, g, MX(x, y, z, rx, ry, 0)); }
  // gathered cloth (curtains, table skirts): a panel with sine folds, hanging from y
  drape(mat, x, y, z, w, h, ry = 0, folds = 6, depth = 0.08) {
    const g = new THREE.PlaneGeometry(w, h, folds * 6, 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setZ(i, Math.sin((P.getX(i) / w + 0.5) * folds * TAU) * depth);
    g.computeVertexNormals(); ikUV(g, w, h); return this.put(mat, g, MX(x, y - h / 2, z, 0, ry, 0));
  }
  part(p) { this.vc.push(p); return this; }
  glowPart(p) { this.lit.push(p); return this; }
  // Poly Haven furniture (instanced per model when its file is in), else the procedural stand-in fb(kit, f)
  furn(key, x, z, ry = 0, o = {}) { this.F.push({ key, x, y: o.y || 0, z, ry, s: o.s || 1, sy: o.sy, fb: o.fb }); return this; }
  finish(I) {
    const grp = this.grp, by = new Map();
    for (const f of this.F) { const g = Assets.get('furn/' + f.key); if (g && g.scene) { let l = by.get(f.key); if (!l) by.set(f.key, l = []); l.push(f); } else { I.missing.add(f.key); if (f.fb) f.fb(this, f); } }
    const m4 = new THREE.Matrix4();
    for (const [key, list] of by) {
      const sc = Assets.get('furn/' + key).scene; sc.updateMatrixWorld(true);
      sc.traverse((o) => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
        list.forEach((f, i) => im.setMatrixAt(i, m4.copy(MX(f.x, f.y, f.z, 0, f.ry, 0, f.s, f.sy || f.s, f.s)).multiply(o.matrixWorld)));
        im.castShadow = this.cast; im.receiveShadow = true; im.userData.shared = true; im.computeBoundingSphere(); grp.add(im);
      });
    }
    for (const [mat, geos] of this.L) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = this.cast; m.receiveShadow = true; grp.add(m); }
    if (this.vc.length) { const m = new THREE.Mesh(mergeParts(this.vc), IK.vc()); m.castShadow = this.cast; m.receiveShadow = true; grp.add(m); }
    if (this.lit.length) grp.add(new THREE.Mesh(mergeParts(this.lit), MAT.glowVC));
  }
}
// ---- procedural furniture (also the stand-ins for the Poly Haven pieces) ----
const IKF = {
  // table: top w × d at height h, four square legs, an apron; o.cloth: a hanging tablecloth colour, o.round: round top
  table(K, x, z, w, d, h, o = {}) {
    const W = o.mat || IK.wood(o.tint), t = 0.05;
    if (o.round) { K.cyl(W, x, h - t, z, w / 2, w / 2 - 0.01, t, 28); K.cyl(W, x, 0, z, 0.08, 0.16, h - t, 12); K.cyl(W, x, 0, z, 0.3, 0.34, 0.05, 16); }
    else { K.box(W, x, h - t / 2, z, w, t, d, 0.012); for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.blk(W, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08), 0.07, h - t, 0.07, 0.01); K.box(W, x, h - t - 0.05, z, w - 0.14, 0.1, d - 0.14, 0.01); }
    if (o.cloth) { const C = IK.cloth(o.cloth), r = w / 2 + 0.03; if (o.round) { K.cyl(C, x, h - 0.004, z, r, r, 0.012, 32); K.cyl(C, x, h - 0.3, z, r, r + 0.04, 0.3, 32, true); } else K.box(C, x, h + 0.004, z, w + 0.06, 0.012, d + 0.06, 0.004); }
    return K;
  },
  bench(K, x, z, len, ry = 0, h = 0.45) { const W = IK.wood(), c = Math.cos(ry), s = Math.sin(ry); K.box(W, x, h - 0.03, z, len, 0.06, 0.32, 0.01, ry); for (const k of [-1, 1]) K.blk(W, x + c * k * (len / 2 - 0.12), 0, z - s * k * (len / 2 - 0.12), 0.26, h - 0.06, 0.06, 0.01, ry + Math.PI / 2); return K; },
  stool(K, x, z) { const W = IK.wood(); K.cyl(W, x, 0.42, z, 0.19, 0.18, 0.05, 16); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; K.cylC(W, x + Math.cos(a) * 0.12, 0.21, z + Math.sin(a) * 0.12, 0.022, 0.028, 0.43, 6, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); } K.cyl(W, x, 0.14, z, 0.14, 0.14, 0.03, 12, true); return K; },
  // 太师椅 / office chair stand-in: seat, back, arms, legs (front = +z turned by ry)
  chair(K, x, z, ry = 0, mat = null) {
    const W = mat || IK.wood(0xd8c2b0), f = (lx, lz) => [x + Math.cos(ry) * lx + Math.sin(ry) * lz, z - Math.sin(ry) * lx + Math.cos(ry) * lz];
    K.box(W, x, 0.47, z, 0.56, 0.05, 0.5, 0.01, ry);
    const b = f(0, -0.24); K.box(W, b[0], 0.85, b[1], 0.52, 0.72, 0.05, 0.015, ry);
    for (const s of [-1, 1]) { const a = f(s * 0.27, 0); K.box(W, a[0], 0.68, a[1], 0.04, 0.04, 0.46, 0.01, ry); for (const lz of [-0.21, 0.21]) { const l = f(s * 0.24, lz); K.blk(W, l[0], 0, l[1], 0.045, lz < 0 ? 0.47 : 0.66, 0.045, 0.008, ry); } }
    return K;
  },
  // cabinet / wardrobe: a body with two framed doors and brass pulls (front = +z turned by ry)
  cabinet(K, x, z, w, h, d, ry = 0, tint = 0xc8a890) {
    const W = IK.wood(tint), G = IK.gold(), c = Math.cos(ry), s = Math.sin(ry), fx = (lx, lz) => x + c * lx + s * lz, fz = (lx, lz) => z - s * lx + c * lz;
    K.blk(W, x, 0.08, z, w, h - 0.08, d, 0.02, ry); K.blk(W, x, 0, z, w - 0.08, 0.08, d - 0.08, 0.01, ry); K.box(W, x, h + 0.03, z, w + 0.08, 0.06, d + 0.08, 0.015, ry);
    for (const k of [-1, 1]) { K.box(W, fx(k * w / 4, d / 2 + 0.01), 0.08 + (h - 0.08) / 2, fz(k * w / 4, d / 2 + 0.01), w / 2 - 0.1, h - 0.3, 0.03, 0.01, ry); K.box(G, fx(k * 0.06, d / 2 + 0.035), h * 0.52, fz(k * 0.06, d / 2 + 0.035), 0.03, 0.12, 0.02, 0.005, ry); }
    return K;
  },
  // shelving: frame + n shelves; goods(K, lx, y, lz) fills each shelf (local x along the unit), front = +z turned by ry
  shelf(K, x, z, w, h, d, ry = 0, n = 4, goods = null, mat = null) {
    const W = mat || IK.wood(), c = Math.cos(ry), s = Math.sin(ry), P = (lx, lz) => [x + c * lx + s * lz, z - s * lx + c * lz];
    for (const k of [-1, 1]) { const p = P(k * (w / 2 - 0.02), 0); K.blk(W, p[0], 0, p[1], 0.04, h, d, 0.008, ry); }
    const bk = P(0, -d / 2 + 0.01); K.blk(W, bk[0], 0, bk[1], w, h, 0.02, 0.004, ry);
    for (let i = 0; i <= n; i++) { const y = 0.08 + i * (h - 0.12) / n; K.box(W, x, y, z, w - 0.04, 0.03, d, 0.006, ry); if (goods && i < n) goods(K, P, y + 0.015); }
    return K;
  },
  // server rack: black cabinet, perforated door, blinking LED rows
  rack(K, x, z, ry = 0) {
    const M = IK.metal(0x1b1e24, 0.5), c = Math.cos(ry), s = Math.sin(ry);
    K.blk(M, x, 0, z, 0.62, 2.0, 1.0, 0.02, ry);
    for (let i = 0; i < 14; i++) { const y = 0.2 + i * 0.12, lx = -0.22, lz = 0.505; K.glowPart(box(x + c * lx + s * lz, y, z - s * lx + c * lz, 0.06, 0.012, 0.01, i % 3 ? 0x22c55e : 0x38bdf8, ry)); K.glowPart(box(x + c * 0.2 + s * lz, y, z - s * 0.2 + c * lz, 0.03, 0.012, 0.01, i % 4 ? 0x22c55e : 0xf59e0b, ry)); }
    return K;
  },
  // monitor on a stand: bezel + an emissive screen (front = +z turned by ry)
  monitor(K, x, y, z, w, h, ry = 0, kind = 'code', col = '#34d399') {
    const M = IK.metal(0x15171b, 0.4), c = Math.cos(ry), s = Math.sin(ry);
    K.box(M, x, y + h / 2 + 0.12, z, w + 0.05, h + 0.05, 0.04, 0.012, ry); K.blk(M, x - s * 0.05, y, z - c * 0.05, 0.05, 0.14, 0.05, 0.01, ry); K.box(M, x - s * 0.05, y + 0.01, z - c * 0.05, 0.28, 0.02, 0.2, 0.008, ry);
    K.plane(IK.glowTex(kind + col, IKT.screen(kind, col)), x + s * 0.022, y + h / 2 + 0.12, z + c * 0.022, w, h, ry, 0, 1, 1);
    return K;
  },
  // red silk lantern (宫灯): lathe body glowing, gilded caps, a tassel
  lantern(K, x, y, z, s = 1, hex = 0xff4a1c) {
    K.lathe(IK.glow(hex, 2.4), [[0.001, -0.32], [0.16, -0.3], [0.27, -0.18], [0.3, 0], [0.27, 0.18], [0.16, 0.3], [0.001, 0.32]], x, y, z, 20, s);
    const G = IK.gold(); K.cyl(G, x, y + 0.29 * s, z, 0.13 * s, 0.15 * s, 0.07 * s, 12); K.cyl(G, x, y - 0.36 * s, z, 0.15 * s, 0.13 * s, 0.07 * s, 12);
    K.cyl(IK.cloth(0xc81e28), x, y - 0.75 * s, z, 0.02 * s, 0.06 * s, 0.4 * s, 8); K.cylC(G, x, y + 0.5 * s, z, 0.006, 0.006, 0.36 * s, 4);
    return K;
  },
  // round lacquer column on a marble drum, gilded ring at the top
  column(K, x, z, h, r = 0.2) { K.cyl(IK.marble(), x, 0, z, r * 1.5, r * 1.7, 0.22, 20); K.cyl(IK.lacquer(), x, 0.22, z, r, r * 1.06, h - 0.22, 20); K.cyl(IK.gold(), x, h - 0.5, z, r * 1.05, r * 1.05, 0.06, 20); return K; },
  // blue-and-white vase (a stand-in for the Poly Haven ones)
  vase(K, x, y, z, s = 1) { K.lathe(IK.glaze(0xdfe6f2), [[0.001, 0], [0.08, 0], [0.12, 0.08], [0.14, 0.2], [0.09, 0.34], [0.05, 0.4], [0.07, 0.44], [0.001, 0.44]], x, y, z, 18, s); return K; },
  plant(K, x, z, s = 1) {
    K.lathe(IK.glaze(0x7a4a32), [[0.001, 0], [0.16, 0], [0.22, 0.34], [0.24, 0.36], [0.001, 0.36]], x, 0, z, 16, s);
    for (let k = 0; k < 7; k++) { const a = k * 2.4, r = k ? 0.12 : 0; K.part(gpart(_IKS, k % 2 ? 0x3f6b35 : 0x4f7d3c, x + Math.cos(a) * r * s, (0.5 + (k ? 0.1 : 0.3)) * s, z + Math.sin(a) * r * s, 0, a, 0.4, 0.11 * s, 0.3 * s, 0.08 * s)); }
    return K;
  },
};

const Interiors = {
  cur: null, built: {}, lights: [], back: null, doorMeshes: [], nearAct: null, garageCd: 0, fading: false,
  init() {
    for (let k = 0; k < 2; k++) { const l = new THREE.PointLight(0xffffff, 0, 40, 0.5); scene.add(l); this.lights.push(l); }
    const cone = new THREE.ConeGeometry(0.7, 1.4, 4); cone.rotateX(Math.PI);
    this.arrowGeo = cone;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    this.ringGeo = new THREE.RingGeometry(1.2, 1.6, 32).rotateX(-Math.PI / 2);
    for (const d of W.doors) {
      if (!INTERIORS[d.interior]) { console.warn('door without interior: ' + d.id); d.locked = true; continue; }
      if (!d.o) d.o = [0, 1];
      d.mesh = this.doorMarker(d.x, groundH(d.x, d.z), d.z);
    }
  },
  // the spot just outside a door (along its outward normal o), pushed clear of walls; h faces the street
  outside(d, out = 2.8) {
    const [ox, oz] = d.o || [0, 1], p = new V3(d.x + ox * out, 0, d.z + oz * out);
    collideCircle(p, 0.7);
    return { x: p.x, z: p.z, h: Math.atan2(ox, oz), door: d.id };
  },
  doorMarker(x, y, z) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(this.arrowGeo, this.arrowMat); a.position.y = 2.2;
    const ring = new THREE.Mesh(this.ringGeo, MAT.markerGlow);
    g.add(a, ring); g.position.set(x, y + 0.08, z); scene.add(g);
    g.userData.arrow = a;
    return g;
  },
  base(id) { const k = INTERIOR_ORDER.indexOf(id); return new V3(IBASE + k * 160, 0, IBASE); },
  // the shell: floor (+ a porch behind the door, where the chase camera can back out to), four inward-facing walls (seen through
  // from outside, like a cutaway), wainscot / plaster / 彩画 frieze or modern plaster, and a ceiling group that hides itself when the
  // camera rises above it (top view, high cutscene shots)
  shell(I, S, C, K) {
    const { def, w, d, H, id } = I, old = !!def.old || id === 'dojo', porch = 3, zc = porch / 2;
    const lum = ((def.wall >> 16 & 255) * 0.3 + (def.wall >> 8 & 255) * 0.59 + (def.wall & 255) * 0.11) / 255, panelled = old && lum < 0.45;
    const WD = IK.wood(0xc9ae98), wall = panelled ? IK.wood(shadeHex(def.wall, 40)) : IK.plaster(def.wall);
    S.plane(IK.floor(def.floor), 0, 0, zc, w, d + porch, 0, -Math.PI / 2);
    if (def.floor === 'carpetRed') S.plane(IK.rug('#7a1c1c', '#c9a23e'), 0, 0.012, 0.5, w - 4, d - 5, 0, -Math.PI / 2, 1, 1);
    // walls: back, left, right (with the porch), the door wall with its opening, the porch's far wall
    // (the door wall: flat inward-facing panels only, so the chase camera behind it looks straight through)
    const wallRun = (x, z, len, ry, flat = false) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      if (old) {
        S.plane(WD, x, 0.55, z, len, 1.1, ry);
        S.plane(wall, x, 1.1 + (H - 2.0) / 2, z, len, H - 2.0, ry);
        S.plane(IK.frieze(), x, H - 0.62, z, len, 0.56, ry, 0, len, 0.62);
        if (!flat) { S.box(WD, x + s * 0.03, 1.12, z + c * 0.03, len, 0.06, 0.08, 0.01, ry); S.box(IK.lacquer(), x + s * 0.08, H - 0.17, z + c * 0.08, len, 0.34, 0.2, 0.02, ry); }
      } else {
        S.plane(wall, x, H / 2, z, len, H, ry);
        if (!flat) { S.box(IK.metal(0x2a2c30, 0.6), x + s * 0.02, 0.06, z + c * 0.02, len, 0.12, 0.03, 0.005, ry); S.box(IK.plaster(0xf0eee8), x + s * 0.06, H - 0.1, z + c * 0.06, len, 0.2, 0.12, 0.02, ry); }
      }
    };
    wallRun(0, -d / 2, w, 0); wallRun(-w / 2, zc, d + porch, Math.PI / 2); wallRun(w / 2, zc, d + porch, -Math.PI / 2);
    for (const k of [-1, 1]) wallRun(k * (w / 4 + 0.8), d / 2, w / 2 - 1.6, Math.PI, true);
    S.plane(wall, 0, (H + 2.8) / 2, d / 2, 3.4, H - 2.8, Math.PI);
    const F = old ? IK.lacquer() : IK.metal(0x3a3d42, 0.5);
    for (const k of [-1, 1]) S.plane(F, k * 1.7, 1.45, d / 2 - 0.01, 0.22, 2.9, Math.PI); S.plane(F, 0, 2.9, d / 2 - 0.01, 3.6, 0.22, Math.PI);
    S.plane(IK.glow(old ? 0xffe2b0 : 0xe8f2ff, 0.9), 0, 1.5, d / 2 + porch - 0.02, 3.2, 3, Math.PI);
    S.plane(wall, 0, H / 2, d / 2 + porch, w, H, Math.PI);
    // ceiling
    if (old) {
      C.plane(IK.coffer(), 0, H, zc, w, d + porch, 0, Math.PI / 2);
      for (let x = -w / 2 + 1.6; x < w / 2 - 0.5; x += 1.6) C.box(WD, x, H - 0.08, zc, 0.12, 0.16, d + porch, 0.01);
      for (let z = -d / 2 + 1.6; z < d / 2 + porch - 0.5; z += 1.6) C.box(WD, 0, H - 0.08, z, w, 0.16, 0.12, 0.01);
      for (let z = -d / 2 + 4; z < d / 2 - 5; z += 5) C.box(IK.lacquer(), 0, H - 0.4, z, w, 0.32, 0.28, 0.03);
    } else {
      C.plane(IK.plaster(0xf4f2ee), 0, H, zc, w, d + porch, 0, Math.PI / 2);
      for (let x = -w / 2 + 3; x < w / 2 - 1; x += 4) for (let z = -d / 2 + 2.5; z < d / 2; z += 4) { C.box(IK.metal(0xd8dade, 0.4), x, H - 0.03, z, 1.3, 0.05, 0.7, 0.01); C.plane(IK.glow(def.light, 1.6), x, H - 0.058, z, 1.2, 0.6, 0, Math.PI / 2); }
    }
    // columns and windows (old rooms): lacquer columns down the side walls, paper lattice windows on the back wall
    if (old) {
      for (const x of [-w / 2 + 0.45, w / 2 - 0.45]) for (let z = -d / 2 + 0.45; z < d / 2; z += Math.max(3.8, (d - 0.9) / 4)) { IKF.column(S, x, z, H - 0.34, 0.2); I.solids.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }); }
      for (let x = -w / 2 + 2.6; x <= w / 2 - 2.6 + 0.01; x += (w - 5.2) / Math.max(1, Math.round((w - 5.2) / 4.4))) {
        if (Math.abs(x) < 2.6) continue; // (the back wall's centre is for the plaque / the room's own set piece)
        S.plane(IK.paperWin(), x, 2.55, -d / 2 + 0.03, 1.5, 1.5, 0, 0, 1, 1);
        S.box(WD, x, 2.55 + 0.8, -d / 2 + 0.06, 1.72, 0.1, 0.08, 0.01); S.box(WD, x, 2.55 - 0.8, -d / 2 + 0.06, 1.72, 0.1, 0.08, 0.01); for (const k of [-1, 1]) S.box(WD, x + k * 0.81, 2.55, -d / 2 + 0.06, 0.1, 1.7, 0.08, 0.01);
        S.box(WD, x, 1.72, -d / 2 + 0.12, 1.9, 0.06, 0.2, 0.01);
      }
    }
  },
  build(id) {
    if (this.built[id]) return this.built[id];
    const def = INTERIORS[id], b = this.base(id), w = def.w, d = def.d, H = id === 'well' ? 13 : 5.2;
    // (hidden while you're not in it: a built room costs the frame nothing, not even a visit in the scene walk)
    const grp = new THREE.Group(); grp.position.copy(b); grp.userData.room = true; grp.visible = this.cur === id; scene.add(grp);
    const ceil = new THREE.Group(); grp.add(ceil);
    const I = { id, def, b, grp, ceil, solids: [], acts: [], npcs: [], w, d, H, missing: new Set(), lightAt: null };
    const S = new IKit(grp, false), K = new IKit(grp, true), C = new IKit(ceil, false);
    const under = new THREE.Mesh(flatPlane(w + 60, d + 60, 0, -0.05, 0, 1, 1), new THREE.MeshBasicMaterial({ color: 0x07080a })); grp.add(under);
    // walls: the back and both sides; the door wall leaves a 6 m gap (the way out), the porch behind it
    I.solids.push({ x0: -w / 2 - 1, x1: w / 2 + 1, z0: -d / 2 - 1, z1: -d / 2 }, { x0: -w / 2 - 1, x1: -w / 2, z0: -d / 2, z1: d / 2 + 1 }, { x0: w / 2, x1: w / 2 + 1, z0: -d / 2, z1: d / 2 + 1 });
    I.solids.push({ x0: -w / 2, x1: -3, z0: d / 2, z1: d / 2 + 1 }, { x0: 3, x1: w / 2, z0: d / 2, z1: d / 2 + 1 });
    const solid = (x, z, sw, sd) => { I.solids.push({ x0: x - sw / 2, x1: x + sw / 2, z0: z - sd / 2, z1: z + sd / 2 }); };
    const act = (x, z, label, fn, r = 2.4) => { I.acts.push({ x, z, label, fn, r }); };
    const npc = (key, kind, x, z, h = 0) => { I.npcs.push({ key, kind, x, z, h }); };
    const sign = (text, x, y, z, sw, c1, c2) => { K.box(IK.metal(0x16181c, 0.5), x, y, z - 0.04, sw + 0.12, sw / 4 + 0.12, 0.06, 0.01); K.plane(IK.glowTex('sign' + text, signTex(text, '', c1, c2), 1.1), x, y, z, sw, sw / 4, 0, 0, 1, 1); };
    const plaque = (t, x, y, z, sw) => { K.box(IK.wood(0x6b4a30), x, y, z - 0.05, sw + 0.3, sw * 0.22 + 0.24, 0.1, 0.03); K.plane(IK.tex('plq' + t, plaqueTex(t)), x, y, z + 0.005, sw, sw * 0.22, 0, 0, 1, 1); };
    const board = (t, x, y, z, sw, sh) => { K.box(IK.wood(0x6b4a30), x, y, z - 0.03, sw + 0.16, sh + 0.16, 0.05, 0.02); K.plane(IK.tex('bd' + x + '/' + z, t), x, y, z, sw, sh, 0, 0, 1, 1); };
    const lan = (x, y, z, s = 1, hex) => IKF.lantern(S, x, y, z, s, hex);
    if (id !== 'well') this.shell(I, S, C, K);
    const hang = (x, z) => { lan(x, H - 1.25, z, 1); C.cylC(IK.gold(), x, H - 0.45, z, 0.008, 0.008, 0.9, 4); };
    switch (id) {
      case 'home': {
        plaque('Token 王府', 0, 4.15, -d / 2 + 0.13, 6);
        // 堂屋: 八仙桌 + two 太师椅 on a rug, the altar table under the plaque, screens
        K.plane(IK.rug('#6e1a18', '#c9a23e'), -7, 0.014, 2, 5.4, 4.2, 0, -Math.PI / 2, 1, 1);
        IKF.table(K, -7, 2, 1.1, 1.1, 0.86); solid(-7, 2, 1.2, 1.2);
        for (const s of [-1, 1]) { K.furn('chinese_armchair', -7 + s * 1.25, 2, -s * Math.PI / 2, { fb: (k, f) => IKF.chair(k, f.x, f.z, f.ry) }); solid(-7 + s * 1.25, 2, 0.8, 0.8); }
        K.furn('chinese_console_table', 0, -d / 2 + 0.4, 0, { s: 1.6, fb: (k, f) => IKF.table(k, f.x, f.z, 2.7, 0.5, 1.0) }); solid(0, -d / 2 + 0.4, 2.8, 0.7);
        for (const x of [-0.9, 0.9]) K.furn('ceramic_vase_02', x, -d / 2 + 0.4, 0, { y: 1.06, s: 1.2, fb: (k, f) => IKF.vase(k, f.x, f.y, f.z) });
        // 作战室: the 25 machine (a row of racks), a long desk with three screens
        IKF.table(K, 0, -9.3, 4.2, 1.0, 0.78); solid(0, -9.3, 4.4, 1.2);
        for (const dx of [-1.4, 0, 1.4]) IKF.monitor(K, dx, 0.78, -9.55, 1.1, 0.62, 0, dx ? 'code' : 'chart');
        K.furn('modern_arm_chair_01', 0, -8.3, Math.PI, { fb: (k, f) => IKF.chair(k, f.x, f.z, f.ry, IK.metal(0x22252b, 0.5)) });
        act(0, -8, '作战室电脑（技能 / 专精 / 洗点）', () => UI.openPanel('skills', true));
        for (let k = 0; k < 3; k++) IKF.rack(K, -12.9, -8 + k * 1.05, Math.PI / 2); solid(-12.9, -6.95, 1.1, 3.3);
        // 拔步床: platform, red silk, four posts, lattice back and canopy, curtains
        { const x = 10.5, z = -8.2, WD = IK.wood(0xb07860);
          K.blk(WD, x, 0, z, 2.6, 0.45, 2.2, 0.03); K.box(IK.cloth(0xb91c1c), x, 0.55, z + 0.05, 2.3, 0.18, 1.9, 0.08); K.box(IK.cloth(0xe8c86a), x - 0.8, 0.7, z - 0.55, 0.5, 0.14, 0.4, 0.06);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.blk(WD, x + sx * 1.25, 0.45, z + sz * 1.05, 0.1, 2.0, 0.1, 0.02);
          K.box(WD, x, 2.5, z, 2.7, 0.12, 2.3, 0.02); K.plane(IK.paperWin(), x, 1.5, z - 1.08, 2.4, 1.9, 0, 0, 2, 1.6);
          for (const sx of [-1, 1]) K.drape(IK.cloth(0x9b1c14), x + sx * 1.05, 2.42, z + 1.12, 0.5, 1.9, 0, 3, 0.05);
          solid(x, z, 2.8, 2.4); }
        act(10.5, -5.6, '雕花大床：睡一觉并存档（时间 +6 小时）', () => G.sleepSave());
        K.furn('chinese_cabinet', 13.9, 3, -Math.PI / 2, { fb: (k, f) => IKF.cabinet(k, f.x, f.z, 1.3, 2.8, 0.6, f.ry) }); solid(14.1, 3, 0.8, 1.4);
        act(12.2, 3, '衣柜：换衣服 / 换装备', () => UI.openWardrobe());
        K.furn('chinese_screen_panels', 7.6, -7.4, 0.5, { s: 1.15 });
        K.furn('chinese_sofa', -10.5, 7.2, Math.PI / 2, { fb: (k, f) => IKF.bench(k, f.x, f.z, 2.2, f.ry) }); solid(-10.5, 7.2, 1.1, 2.4);
        K.furn('chinese_tea_table', -8.8, 7.2, 0); solid(-8.8, 7.2, 0.9, 0.9);
        board(whiteboardTex(['Token 侠作战计划', '1. 吃满 1M Token', '2. 变身', '3. 拆了百模帮', '4. 再去喝碗豆汁儿']), 6, 2.9, -10.94, 4.2, 2.1);
        for (const [x, z] of [[-13.6, -10.2], [13.4, -3.5], [13.4, 8.5], [-13.6, 3]]) K.furn('potted_plant_04', x, z, 0, { s: 3.2, fb: (k, f) => IKF.plant(k, f.x, f.z) });
        for (const [x, z] of [[-7, 2], [6, -2]]) K.furn('chinese_chandelier', x, z, 0, { y: H - 0.2, s: 1.2, fb: (k, f) => hang(f.x, f.z) });
        for (const x of [-11, 11]) hang(x, 5);
        npc('alfred', 'alfred', -9, -6, 0); act(-9, -4.4, '跟阿福唠两句', () => Story.talk('alfred'));
        I.lightAt = [[-7, 4.2, 1], [8, 4.2, -5]];
        break;
      }
      case 'snack': {
        plaque('护锅寺小吃', 0, 4.1, -d / 2 + 0.13, 5);
        // counter: wood body, stone top, steaming pots, the menu board behind
        K.blk(IK.wood(0xb88a6a), 0, 0, -5.4, 9, 0.95, 0.9, 0.03); K.box(IK.marble(), 0, 0.98, -5.4, 9.2, 0.06, 1.05, 0.02); solid(0, -5.4, 9.4, 1.2);
        for (let k = 0; k < 4; k++) { const x = -3.6 + k * 2.4; K.lathe(IK.metal(0xa8b0b8, 0.25), [[0.001, 0], [0.3, 0], [0.34, 0.08], [0.34, 0.36], [0.37, 0.38], [0.001, 0.38]], x, 1.01, -5.4, 20); K.lathe(IK.metal(0x9aa3ad, 0.3), [[0.001, 0.1], [0.36, 0], [0.38, 0.02], [0.001, 0.14]], x, 1.4, -5.4, 16); }
        board(menuTex(['豆汁儿 焦圈', '卤煮火烧', '炸酱面', '驴打滚', '北冰漾', '冰糖葫芦']), 0, 2.75, -7.94, 6, 2.2);
        for (const [x, z] of [[-6, 0], [0, 0], [6, 0], [-6, 4], [6, 4]]) {
          K.furn('round_wooden_table_02', x, z, 0, { s: 1.25, sy: 1.05, fb: (k, f) => IKF.table(k, f.x, f.z, 1.0, 1.0, 0.78, { round: true }) }); solid(x, z, 1.1, 1.1);
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; K.furn('chinese_stool', x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, -a, { fb: (kk, f) => IKF.stool(kk, f.x, f.z) }); }
          K.part(gpart(_IKS, 0xf4f2ec, x + 0.15, 0.84 * 1.05, z, 0, 0, 0, 0.09, 0.03, 0.09)).part(gpart(_IKS, 0x5a3a22, x - 0.2, 0.84 * 1.05, z + 0.1, 0, 0, 0, 0.07, 0.04, 0.07));
        }
        for (const x of [-7, -2.5, 2.5, 7]) hang(x, -2);
        npc('clerk', 'dama', 0, -6.8, 0); act(0, -3.8, '点单：豆汁儿 · 卤煮 · 炸酱面', () => UI.openShop('snack'));
        I.lightAt = [[-4, 4, -3], [4, 4, 2]];
        break;
      }
      case 'electronics': {
        // glass display cases (cards glowing inside), steel shelving of boxed GPUs along the walls, a lit counter
        for (const [x, z] of [[-6, -2], [0, -2], [6, -2], [-6, 3], [6, 3]]) {
          const M = IK.metal(0x1a1d22, 0.45); K.blk(M, x, 0, z, 3.2, 0.85, 1.4, 0.03); K.box(IK.glass(0x9ad8e8), x, 1.05, z, 3.1, 0.36, 1.3, 0.02);
          for (let k = 0; k < 3; k++) { K.box(IK.metal(0x2b2f36, 0.3), x - 1 + k, 0.97, z, 0.8, 0.1, 0.4, 0.02); K.glowPart(box(x - 1 + k, 1.03, z + 0.21, 0.6, 0.02, 0.01, pick([0x22d3ee, 0xa855f7, 0x34d399]))); }
          K.glowPart(box(x, 0.86, z + 0.71, 3.1, 0.03, 0.01, 0x22d3ee)); solid(x, z, 3.4, 1.6);
        }
        for (let k = 0; k < 4; k++) { const x = -8.4 + k * 5.6; K.furn('steel_frame_shelves_01', x, -7.4, 0, { s: 0.1, fb: (kk, f) => IKF.shelf(kk, f.x, f.z, 1.1, 2.1, 0.5, 0, 4, null, IK.metal(0x6b7280, 0.4)) }); solid(x, -7.4, 1.2, 0.6);
          for (let r = 0; r < 4; r++) for (let j = 0; j < 3; j++) K.part(box(x - 0.36 + j * 0.36, 0.2 + r * 0.53, -7.35, 0.3, 0.26, 0.4, pick([0x111827, 0x1f2937, 0x0f766e, 0x7c3aed, 0xb91c1c]))); }
        sign('海量电子城 · 5090 现货', 0, 3.9, -7.9, 7, '#111827', '#22d3ee');
        K.glowPart(box(0, 4.7, -7.93, 20, 0.08, 0.02, 0x22d3ee)); K.glowPart(box(-10.93, 3, 0, 0.02, 0.08, 14, 0xa855f7)); K.glowPart(box(10.93, 3, 0, 0.02, 0.08, 14, 0xa855f7));
        K.blk(IK.metal(0x14171c, 0.4), 0, 0, 2.8, 4.4, 1.05, 1.2, 0.03); K.box(IK.glaze(0x1c2733), 0, 1.08, 2.8, 4.6, 0.06, 1.35, 0.02); K.glowPart(box(0, 0.8, 3.41, 4.4, 0.05, 0.01, 0x22d3ee)); solid(0, 2.8, 4.6, 1.4);
        IKF.monitor(K, 1.2, 1.1, 2.6, 0.7, 0.42, Math.PI, 'bars', '#22d3ee');
        npc('clerk', 'clerk', 0, 1.1, 0); act(0, 4.4, '柜台：看看显卡和装备', () => UI.openShop('electronics'));
        K.furn('potted_plant_04', -10, 6.4, 0, { s: 3.4, fb: (kk, f) => IKF.plant(kk, f.x, f.z) }); K.furn('potted_plant_04', 10, 6.4, 1, { s: 3.4, fb: (kk, f) => IKF.plant(kk, f.x, f.z) });
        I.lightAt = [[-5, 4.2, 0], [5, 4.2, 0]];
        break;
      }
      case 'clothes': {
        // clothes rails (garments on hangers), display shelves of folded shirts, a full-length mirror, the till
        for (const [x, z] of [[-6, -3], [-6, 2], [0, -3], [6, -3]]) {
          const M = IK.metal(0xb8bec6, 0.25); for (const s of [-1, 1]) K.cyl(M, x + s * 1.9, 0, z, 0.025, 0.025, 1.7, 8); K.cylC(M, x, 1.68, z, 0.02, 0.02, 3.9, 8, 0, 0, Math.PI / 2); for (const s of [-1, 1]) K.box(M, x + s * 1.9, 0.02, z, 0.06, 0.04, 0.6, 0.01);
          for (let k = 0; k < 9; k++) { const gx = x - 1.6 + k * 0.4, c = pick([0xb4402f, 0x1f6feb, 0x16a34a, 0x6b7280, 0xf59e0b, 0xd7263d, 0xf4f2ec, 0x1f2937]); K.part(box(gx, 1.22, z, 0.05, 0.84, 0.5, c)).part(box(gx, 1.6, z, 0.03, 0.08, 0.36, 0x2a2a2a)); }
          I.solids.push({ x0: x - 2, x1: x + 2, z0: z - 0.4, z1: z + 0.4 });
        }
        for (const x of [-7.5, -3, 1.5]) { K.furn('wooden_display_shelves_01', x, -6.6, Math.PI / 2, { fb: (kk, f) => IKF.shelf(kk, f.x, f.z, 1.1, 1.6, 0.4) }); solid(x, -6.6, 1.2, 0.5);
          for (let r = 0; r < 3; r++) for (let j = 0; j < 3; j++) K.part(box(x - 0.34 + j * 0.34, 0.36 + r * 0.46, -6.5, 0.28, 0.08, 0.28, pick([0xb4402f, 0x1f6feb, 0xf4f2ec, 0x1f2937, 0xf59e0b]))); }
        K.box(IK.wood(0xd8c2b0), 9.85, 1.3, 0, 0.08, 2.6, 1.4, 0.02); K.plane(IK.std('mirror', { color: 0xdfe6ee, metalness: 1, roughness: 0.05 }), 9.8, 1.3, 0, 1.2, 2.4, -Math.PI / 2);
        K.blk(IK.wood(0xb4402f), 5, 0, 4, 3.4, 1.0, 1.0, 0.04); K.box(IK.marble(), 5, 1.03, 4, 3.6, 0.06, 1.15, 0.02); solid(5, 4, 3.6, 1.2);
        npc('clerk', 'clerk', 5, 2.2, 0); act(5, 5.6, '店员：买衣服', () => UI.openShop('clothes'));
        K.furn('potted_plant_04', -9.2, 5.8, 0, { s: 3.4, fb: (kk, f) => IKF.plant(kk, f.x, f.z) });
        I.lightAt = [[-4, 4.2, -1], [5, 4.2, 1]];
        break;
      }
      case 'dept': {
        // glass vitrines with hats / glasses / scarves under light, marble columns, the counter
        for (const [x, z] of [[-7, -3], [0, -3], [7, -3], [-7, 2.5], [7, 2.5]]) {
          K.blk(IK.wood(0xefe6d8), x, 0, z, 3.6, 0.9, 1.3, 0.04); K.box(IK.glass(), x, 1.12, z, 3.5, 0.42, 1.2, 0.02); K.box(IK.gold(), x, 1.34, z, 3.52, 0.02, 1.22, 0.004); K.glowPart(box(x, 1.34, z, 3.3, 0.02, 1.1, 0xfff3c4));
          for (let k = 0; k < 3; k++) K.part(gpart(_IKS, pick([0xd7263d, 0x1b1b1b, 0xe0b64a, 0x2156d8]), x - 1.1 + k * 1.1, 1.0, z, 0, 0, 0, 0.22, 0.12, 0.22));
          solid(x, z, 3.8, 1.5);
        }
        for (const x of [-4, 4]) for (const z of [-5.5, 5.5]) { K.cyl(IK.marble(), x, 0, z, 0.32, 0.34, 5.2, 24); K.cyl(IK.gold(), x, 4.7, z, 0.36, 0.34, 0.12, 24); solid(x, z, 0.7, 0.7); }
        sign('王府景百货大楼', 0, 3.8, -7.9, 7, '#7c2d12', '#fbbf24');
        K.blk(IK.wood(0x7c2d12), 0, 0, 4.2, 3.8, 1.02, 1.1, 0.04); K.box(IK.marble(), 0, 1.05, 4.2, 4, 0.06, 1.25, 0.02); solid(0, 4.2, 4, 1.3);
        npc('clerk', 'clerk', 0, 2.5, 0); act(0, 5.8, '柜台：帽子 · 眼镜 · 围巾 · 背包', () => UI.openShop('dept'));
        for (const [x, z] of [[-10.6, -6.6], [10.6, -6.6]]) K.furn('potted_plant_04', x, z, 0, { s: 3.6, fb: (kk, f) => IKF.plant(kk, f.x, f.z) });
        I.lightAt = [[-5, 4.2, 0], [5, 4.2, 0]];
        break;
      }
      case 'antique': {
        plaque('容错斋', 0, 4.1, -d / 2 + 0.13, 4.4);
        // curio cabinets with vases, the long counter with brush and paper, two scrolls
        for (const x of [-8, -4, 4, 8]) { K.furn('chinese_cabinet', x, -7.2, 0, { s: 0.95, fb: (k, f) => IKF.shelf(k, f.x, f.z, 1.2, 2.7, 0.55, 0, 4, (kk, P, y) => { for (const lx of [-0.3, 0.3]) { const p = P(lx, 0); IKF.vase(kk, p[0], y, p[1], 0.9); } }) }); solid(x, -7.2, 1.3, 0.7); }
        for (const x of [-9.5, -6, 6, 9.5]) K.furn(x < 0 ? 'antique_ceramic_vase_01' : 'ceramic_vase_02', x, -5.9, 0, { s: 1.6, fb: (k, f) => IKF.vase(k, f.x, 0, f.z, 1.8) });
        K.furn('chinese_commode', 0, -2.3, 0, { s: 0.62, sy: 0.5, fb: (k, f) => IKF.table(k, f.x, f.z, 2.8, 0.8, 0.95) }); solid(0, -2.2, 3.0, 1.0);
        K.box(IK.std('paper', { color: 0xf5f0e0, roughness: 0.9 }), 0.4, 1.03, -2.1, 0.9, 0.01, 0.5, 0.002); K.cylC(IK.wood(0x2a1a10), -0.3, 1.04, -2.2, 0.01, 0.01, 0.3, 6, 0, 0, Math.PI / 2);
        board(scrollTex('上善若水'), -6.5, 2.7, -7.92, 1.2, 3.1); board(scrollTex('厚德载物'), 6.5, 2.7, -7.92, 1.2, 3.1);
        for (const x of [-5, 5]) hang(x, -1);
        npc('clerk', 'shopkeeper', 0, -3.8, 0); act(0, -0.2, '掌柜：看看稀罕物件', () => UI.openShop('antique'));
        I.lightAt = [[-4, 4, -2], [4, 4, -2]];
        break;
      }
      case 'shoes': {
        plaque('内联胜', 0, 4.1, -d / 2 + 0.13, 4.4);
        for (const x of [-7, -3.5, 3.5, 7]) { K.furn('wooden_display_shelves_01', x, -6.2, Math.PI / 2, { s: 1.4, fb: (kk, f) => IKF.shelf(kk, f.x, f.z, 1.4, 2.1, 0.45) }); solid(x, -6.2, 1.6, 0.7);
          for (let r = 0; r < 3; r++) for (let j = 0; j < 3; j++) K.part(box(x - 0.44 + j * 0.44, 0.5 + r * 0.64, -6.05, 0.32, 0.12, 0.26, pick([0x111111, 0x111111, 0xf5f5f5, 0xd7263d]))); }
        IKF.bench(K, 0, 2, 2.6, 0); solid(0, 2, 2.8, 0.6);
        K.box(IK.wood(0xd8c2b0), -9.85, 1.3, 2, 0.08, 2.6, 1.4, 0.02); K.plane(IK.std('mirror', { color: 0xdfe6ee, metalness: 1, roughness: 0.05 }), -9.8, 1.3, 2, 1.2, 2.4, Math.PI / 2);
        for (const x of [-4.5, 4.5]) hang(x, -1);
        npc('clerk', 'clerk', 0, -3.4, 0); act(0, -1.2, '伙计：试试新鞋', () => UI.openShop('shoes'));
        I.lightAt = [[-4, 4, -2], [4, 4, 0]];
        break;
      }
      case 'pharmacy': {
        plaque('同 Token 堂', 0, 4.15, -d / 2 + 0.13, 5);
        // 百子柜: a wall of labelled drawers with brass pulls
        { const WD = IK.wood(0xa87a58), G = IK.gold();
          K.blk(WD, 0, 0, -7.6, 14.6, 3.9, 0.6, 0.02);
          for (let r = 0; r < 6; r++) for (let k = 0; k < 12; k++) { const x = -6.6 + k * 1.2, y = 0.5 + r * 0.62; K.box(IK.wood(r % 2 === k % 2 ? 0x8a5a3a : 0x9a6a48), x, y, -7.28, 1.1, 0.55, 0.05, 0.01); K.box(G, x, y, -7.24, 0.1, 0.05, 0.03, 0.01); }
          I.solids.push({ x0: -7.4, x1: 7.4, z0: -8, z1: -7.2 }); }
        K.blk(IK.wood(0x7a4a2a), 0, 0, -4.6, 9.6, 1.02, 1.0, 0.03); K.box(IK.wood(0x5a3420), 0, 1.05, -4.6, 9.9, 0.07, 1.2, 0.02); solid(0, -4.6, 10, 1.2);
        K.furn('ceramic_vase_02', -3, -4.6, 0, { y: 1.08, s: 1.3, fb: (k, f) => IKF.vase(k, f.x, f.y, f.z) });
        { const G = IK.gold(); K.cylC(G, 3, 1.45, -4.6, 0.008, 0.008, 0.6, 4, 0, 0, Math.PI / 2); K.cyl(G, 3, 1.09, -4.6, 0.03, 0.05, 0.36, 8); for (const s of [-1, 1]) K.lathe(G, [[0.001, 0], [0.11, 0.02], [0.12, 0.04], [0.001, 0.03]], 3 + s * 0.28, 1.25, -4.6, 14); }
        for (const x of [-6, 6]) K.furn('chinese_armchair', x, 1.5, 0, { fb: (k, f) => IKF.chair(k, f.x, f.z, f.ry) });
        K.furn('chinese_tea_table', 0, 1.5, 0); solid(0, 1.5, 0.9, 0.9);
        for (const x of [-5, 5]) hang(x, -1.5);
        npc('clerk', 'doctor', 0, -6, 0); act(0, -2.8, '老先生：抓药', () => UI.openShop('pharmacy'));
        I.lightAt = [[-4, 4, -3], [4, 4, 0]];
        break;
      }
      case 'duck': {
        plaque('权重德', 0, 4.1, -d / 2 + 0.13, 4.4);
        // the brick oven with its fire, ducks hanging in the glow
        K.blk(IK.brick(), -9, 0, -7.4, 4.6, 3.2, 1.8, 0.05); K.box(IK.brick(), -9, 3.35, -7.4, 3.6, 0.3, 1.5, 0.05);
        K.plane(IK.glow(0xff6a1a, 3.2), -9, 1.1, -6.49, 1.8, 1.1, 0, 0, 1, 1); K.box(IK.metal(0x2a2a2a, 0.5), -9, 1.72, -6.48, 2.1, 0.12, 0.08, 0.01);
        K.cylC(IK.metal(0x8a8f96, 0.3), -9, 2.85, -6, 0.02, 0.02, 3.4, 6, 0, 0, Math.PI / 2);
        for (let k = 0; k < 4; k++) K.lathe(IK.glaze(0x8a3a12), [[0.001, -0.42], [0.12, -0.36], [0.22, -0.14], [0.24, 0.06], [0.16, 0.26], [0.05, 0.36], [0.001, 0.38]], -10.2 + k * 0.8, 2.3, -6, 16);
        solid(-9, -7.4, 4.8, 2.2);
        for (const [x, z] of [[-4, -2], [4, -2], [-4, 4], [4, 4], [10, 1]]) {
          IKF.table(K, x, z, 1.9, 1.9, 0.8, { round: true, cloth: 0xa31616 }); K.cyl(IK.glaze(0xf2efe8), x, 0.82, z, 0.5, 0.5, 0.03, 24);
          for (const [dx, dz] of [[0.4, 0.2], [-0.3, -0.35], [0.1, 0.5]]) K.part(gpart(_IKS, 0xf4f2ec, x + dx, 0.84, z + dz, 0, 0, 0, 0.12, 0.02, 0.12));
          solid(x, z, 2, 2);
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; K.furn('chinese_armchair', x + Math.cos(a) * 1.45, z + Math.sin(a) * 1.45, -a - Math.PI / 2, { fb: (kk, f) => IKF.chair(kk, f.x, f.z, f.ry) }); }
        }
        for (const [x, z] of [[-4, 1], [4, 1]]) K.furn('chinese_chandelier', x, z, 0, { y: H - 0.2, s: 1.3, fb: (k, f) => hang(f.x, f.z) });
        for (const x of [-9, 9]) hang(x, 6);
        npc('clerk', 'waiter', 4, -6.4, 0); act(4, -4.8, '服务员：点菜', () => UI.openShop('duck'));
        I.lightAt = [[-9, 3.4, -5], [3, 4.2, 1]];
        break;
      }
      case 'teahouse': {
        plaque('得云社', 0, 4.45, -d / 2 + 0.13, 4.4);
        // the stage: planks on a lacquer skirt, red curtains, the 相声 table in its cloth
        { const WD = IK.wood(0xb58a6a);
          K.blk(IK.lacquer(), 0, 0, -7.6, 14, 0.8, 4, 0.02); K.box(WD, 0, 0.84, -7.6, 14.2, 0.08, 4.2, 0.02); solid(0, -7.6, 14, 4);
          for (const s of [-1, 1]) K.drape(IK.cloth(0x9b1c14), s * 6.2, 5.0, -9.6, 1.8, 4.2, 0, 5, 0.1);
          K.drape(IK.cloth(0xa31616), 0, 5.2, -9.5, 14, 0.9, 0, 20, 0.06);
          K.blk(IK.cloth(0xb91c1c), 0, 0.88, -7.9, 1.3, 0.86, 0.62, 0.04); K.box(IK.cloth(0xf2c94c), 0, 1.75, -7.9, 1.36, 0.02, 0.68, 0.005); // the 相声 table in its cloth
          K.box(IK.wood(0x3a2418), 0.35, 1.78, -7.85, 0.18, 0.03, 0.04, 0.005); K.cylC(IK.glaze(0xf4f2ec), -0.35, 1.8, -7.85, 0.035, 0.03, 0.08, 10); // 醒木, a teacup
        }
        for (const [x, z] of [[-6, -1], [0, -1], [6, -1], [-6, 4], [0, 4], [6, 4]]) {
          K.furn('chinese_tea_table', x, z, 0, { s: 1.15, fb: (k, f) => IKF.table(k, f.x, f.z, 0.95, 0.95, 0.58) }); solid(x, z, 1.1, 1.1);
          for (const [dx, dz, r] of [[0.9, 0, -Math.PI / 2], [-0.9, 0, Math.PI / 2], [0, 0.9, Math.PI]]) K.furn('chinese_stool', x + dx, z + dz, r, { fb: (k, f) => IKF.stool(k, f.x, f.z) });
          K.lathe(IK.glaze(0xe8e2d6), [[0.001, 0], [0.07, 0], [0.1, 0.06], [0.09, 0.12], [0.04, 0.14], [0.05, 0.16], [0.001, 0.16]], x + 0.15, 0.58 * 1.15, z, 14);
          for (const dz of [-0.2, 0.2]) K.lathe(IK.glaze(0xf4f2ec), [[0.001, 0], [0.03, 0], [0.045, 0.05], [0.001, 0.05]], x - 0.2, 0.58 * 1.15, z + dz, 10);
        }
        K.furn('chinese_screen_panels', -10.5, -4, 0.6, { s: 1.2 }); K.furn('chinese_screen_panels', 10.5, -4, -0.6, { s: 1.2 });
        for (const x of [-6, 0, 6]) K.furn('chinese_chandelier', x, 1.5, 0, { y: H - 0.2, s: 1.1, fb: (k, f) => hang(f.x, f.z) });
        for (const x of [-10, 10]) hang(x, 6);
        npc('clerk', 'waiter', 9, 6, -Math.PI / 2); act(8.2, 6.6, '伙计：买票听相声 / 沏壶茶', () => UI.openShop('teahouse'));
        I.lightAt = [[0, 4.2, -6], [0, 4.2, 3]];
        break;
      }
      case 'hardware': {
        for (const x of [-7, -3.5, 3.5, 7]) { K.furn('steel_frame_shelves_01', x, -5.8, 0, { s: 0.1, fb: (kk, f) => IKF.shelf(kk, f.x, f.z, 1.1, 2.1, 0.5, 0, 4, null, IK.metal(0x6b7280, 0.4)) }); solid(x, -5.8, 1.2, 0.6);
          for (let r = 0; r < 4; r++) for (let j = 0; j < 3; j++) K.part(box(x - 0.36 + j * 0.36, 0.2 + r * 0.53, -5.75, 0.28, 0.24, 0.4, pick([0xb45309, 0x6b7280, 0xdc2626, 0x2563eb, 0xfbbf24]))); }
        // the famous 板砖 stack, crates, a counter with a till
        for (let k = 0; k < 6; k++) for (let j = 0; j < 2; j++) K.box(IK.brick(), -8 + j * 0.12, 0.06 + k * 0.12, 3.5 + (k % 2) * 0.05, 0.24, 0.11, 0.5, 0.01, j * 0.05);
        for (const [x, z, r] of [[-8.6, 1.2, 0.2], [8.4, 3.8, -0.4], [8.6, 2.4, 0.1]]) K.furn('wooden_crate_02', x, z, r, { fb: (k, f) => k.blk(IK.wood(0xc9a47a), f.x, 0, f.z, 0.55, 0.45, 1.1, 0.02, f.ry) });
        K.blk(IK.wood(0x8a7a66), 0, 0, 1.5, 3.4, 1.0, 1.0, 0.03); K.box(IK.metal(0x9aa0a8, 0.4), 0, 1.03, 1.5, 3.6, 0.05, 1.15, 0.01); solid(0, 1.5, 3.6, 1.2);
        K.blk(IK.metal(0x2a2d32, 0.4), 0.9, 1.05, 1.5, 0.4, 0.22, 0.34, 0.03);
        npc('clerk', 'daye', 0, -0.4, 0); act(0, 3.0, '老王：板砖管够', () => UI.openShop('hardware'));
        I.lightAt = [[-4, 4.2, -2], [4, 4.2, 1]];
        break;
      }
      case 'gym': {
        // treadmills (belt, rails, console), a bench press, the dumbbell rack, a mirror wall
        for (const x of [-7, -3.5]) { const M = IK.metal(0x2a2d33, 0.4);
          K.blk(M, x, 0, -3, 0.9, 0.22, 2.2, 0.04); K.box(IK.std('rubber', { color: 0x141414, roughness: 0.9 }), x, 0.235, -2.95, 0.62, 0.02, 1.9, 0.005);
          for (const s of [-1, 1]) { K.cylC(M, x + s * 0.42, 0.75, -3.8, 0.03, 0.03, 1.2, 8, 0.35, 0, 0); K.cylC(M, x + s * 0.42, 1.0, -3.35, 0.025, 0.025, 0.9, 8, Math.PI / 2, 0, 0); }
          K.box(M, x, 1.35, -3.95, 0.9, 0.4, 0.12, 0.03, 0, -0.5); K.plane(IK.glowTex('tread', IKT.screen('bars', '#22c55e')), x, 1.38, -3.87, 0.6, 0.28, 0, -0.5, 1, 1);
          solid(x, -3, 1.2, 2.6); }
        act(-5.25, -0.5, '跑步机：练耐力（¥5,000 / 次）', () => Gym.start('stamina'));
        { const M = IK.metal(0x2a2d33, 0.4); K.blk(IK.std('pad', { color: 0x1f2937, roughness: 0.7 }), 5, 0.42, -3, 0.45, 0.12, 1.6, 0.05); K.blk(M, 5, 0, -3, 0.2, 0.42, 1.2, 0.02);
          for (const s of [-1, 1]) K.cyl(M, 5 + s * 0.55, 0, -4.2, 0.035, 0.035, 1.35, 8);
          K.cylC(IK.metal(0xb8bec6, 0.2), 5, 1.35, -4.2, 0.018, 0.018, 2.2, 8, 0, 0, Math.PI / 2); for (const s of [-1, 1]) K.cylC(IK.metal(0x15171b, 0.5), 5 + s * 0.85, 1.35, -4.2, 0.23, 0.23, 0.07, 20, 0, 0, Math.PI / 2); solid(5, -3.3, 1.4, 2.2); }
        act(5, -0.4, '卧推：练肌肉（¥5,000 / 次）', () => Gym.start('muscle'));
        { const M = IK.metal(0x2a2d33, 0.4); K.blk(M, -10.9, 0, -0.6, 0.5, 0.9, 8.6, 0.02); for (let k = 0; k < 10; k++) { const z = -4.4 + k * 0.85; K.cylC(IK.metal(0x9aa0a8, 0.3), -10.9, 0.98, z, 0.02, 0.02, 0.3, 8, 0, 0, Math.PI / 2); for (const s of [-1, 1]) K.cylC(IK.metal(0x15171b, 0.5), -10.9 + s * 0.13, 0.98, z, 0.06 + k * 0.004, 0.06 + k * 0.004, 0.06, 14, 0, 0, Math.PI / 2); } solid(-10.9, -0.6, 0.7, 8.8); }
        K.plane(IK.std('mirror', { color: 0xdfe6ee, metalness: 1, roughness: 0.06 }), 0, 2.2, -7.95, 12, 3, 0);
        K.plane(IK.rug('#1f2937', '#c2410c'), 1, 0.012, 2.5, 9, 4, 0, -Math.PI / 2, 1, 1);
        npc('coach', 'guest', 4, 3, -Math.PI / 2); act(2.6, 3.4, '教练', () => Story.talk('coach'));
        I.lightAt = [[-5, 4.2, -2], [5, 4.2, 0]];
        break;
      }
      case 'lab': {
        // the prototype on its lit turntable, robot arms, benches with screens, the sign
        { const M = IK.metal(0x1b1e24, 0.35), x = -7, z = -4;
          K.cyl(IK.metal(0xd8dde4, 0.3), x, 0, z, 4.2, 4.3, 0.3, 48); K.glowPart(gpart(new THREE.TorusGeometry(4.25, 0.03, 6, 64), 0x35d49a, x, 0.31, z, Math.PI / 2, 0, 0));
          K.box(M, x, 0.95, z, 2.4, 0.7, 5.2, 0.35); K.box(IK.glaze(0x0b141c), x, 1.45, z - 0.3, 1.9, 0.5, 2.4, 0.22); K.box(M, x, 0.85, z + 2.2, 2.6, 0.3, 1.0, 0.12);
          for (const sx of [-1, 1]) for (const sz of [-1.7, 1.7]) K.cylC(IK.metal(0x0b0b0b, 0.8), x + sx * 1.2, 0.5, z + sz, 0.45, 0.45, 0.36, 24, 0, 0, Math.PI / 2);
          K.glowPart(box(x, 0.9, z + 2.72, 1.8, 0.05, 0.02, 0x35d49a)).glowPart(box(x, 0.95, z - 2.62, 1.6, 0.05, 0.02, 0xff3b3b));
          solid(x, z, 8.6, 8.6); }
        for (const [x, z] of [[4, -6], [9, -6], [9, 0]]) { K.furn('metal_office_desk', x, z, 0, { s: 1.4, sy: 1, fb: (kk, f) => IKF.table(kk, f.x, f.z, 2.8, 1.3, 0.8, { mat: IK.metal(0xd8dde4, 0.3) }) }); solid(x, z, 3, 1.5);
          IKF.monitor(K, x - 0.6, 0.8, z - 0.3, 0.8, 0.46, 0, 'chart', '#35d49a'); K.part(box(x + 0.7, 0.95, z, 0.5, 0.3, 0.5, pick([0x35d49a, 0x60a5fa, 0xfbbf24])));
          K.furn('modern_arm_chair_01', x, z + 1.2, Math.PI, { fb: (kk, f) => IKF.chair(kk, f.x, f.z, f.ry, IK.metal(0x22252b, 0.5)) }); }
        K.furn('wooden_bookshelf_worn', 12.6, -3.5, -Math.PI / 2, { fb: (kk, f) => IKF.shelf(kk, f.x, f.z, 1.4, 2.1, 0.5, f.ry) }); solid(12.8, -3.5, 0.8, 1.6);
        sign('应用科学部', 4, 3.9, -9.9, 6, '#0b0d10', '#35d49a');
        for (const [x, z] of [[1.5, -8.8], [12.8, 7.8], [-12.8, 7.8]]) K.furn('potted_plant_04', x, z, 0, { s: 3.4, fb: (kk, f) => IKF.plant(kk, f.x, f.z) });
        npc('kodex', 'kodex', 3, -2, 0); act(3, 0, 'Kodex：升级装备 / 涂装', () => (Story.flags.labShop ? UI.openShop('lab') : Story.talk('kodex')));
        I.lightAt = [[-7, 4.4, -4], [7, 4.4, -2]];
        break;
      }
      case 'dojo': {
        // dark timber pillars with fire bowls, the master's dais before a folding screen, weapon racks, training mats
        for (const x of [-11, 11]) for (const z of [-8, -2, 4]) { K.cyl(IK.wood(0x6a4a3a), x, 0, z, 0.32, 0.36, 5.2, 16); K.cyl(IK.marble(), x, 0, z, 0.5, 0.56, 0.24, 16);
          K.lathe(IK.metal(0x2a2622, 0.5), [[0.001, 0], [0.12, 0], [0.34, 0.28], [0.36, 0.32], [0.001, 0.3]], x * 0.88, 2.9, z, 16); K.lathe(IK.glow(0xff7a2a, 3), [[0.001, 0.28], [0.3, 0.3], [0.18, 0.55], [0.001, 0.75]], x * 0.88, 2.9, z, 12); K.cyl(IK.metal(0x2a2622, 0.5), x * 0.88, 0, z, 0.04, 0.05, 2.9, 8);
          solid(x, z, 1, 1); }
        K.blk(IK.wood(0x5a2020), 0, 0, -9.3, 6, 0.6, 2.4, 0.03); K.blk(IK.lacquer(), 0, 0.6, -9.3, 5.2, 0.25, 1.9, 0.02); solid(0, -9.3, 6, 2.4);
        K.furn('chinese_screen_panels', -1.3, -10.3, 0, { s: 1.6 }); K.furn('chinese_screen_panels', 1.3, -10.3, 0, { s: 1.6 });
        K.drape(IK.cloth(0x3b0d0d), 0, 5.0, -10.9, 16, 1.2, 0, 16, 0.05);
        for (let k = 0; k < 5; k++) { const z = -8 + k * 3, WD = IK.wood(0x7a5a3a); K.blk(WD, -12.8, 0, z, 0.3, 2.6, 1.8, 0.02); for (let j = 0; j < 4; j++) { K.cylC(IK.wood(0x8a6a44), -12.6, 1.6, z - 0.6 + j * 0.4, 0.02, 0.02, 2.8, 6, 0.08, 0, 0); K.lathe(IK.metal(0xc0c6ce, 0.2), [[0.001, 0], [0.04, 0.05], [0.001, 0.3]], -12.6, 2.95, z - 0.6 + j * 0.4, 6); } solid(-12.8, z, 0.6, 2.2); }
        for (const [x, z] of [[-3, 1], [3, 1], [-3, 5], [3, 5]]) K.box(IK.std('tatami', { color: 0xa39064, roughness: 0.9 }), x, 0.02, z, 3.6, 0.04, 3.6, 0.01);
        I.lightAt = [[-8, 3.4, -2], [8, 3.4, 2]];
        break;
      }
      case 'arkham': {
        // rows of labelling desks under sick green monitors, cable trays, the green strip light
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = -10.5 + c * 7, z = -7 + r * 6;
          K.furn('metal_office_desk', x, z, 0, { s: 1.5, sy: 1, fb: (kk, f) => IKF.table(kk, f.x, f.z, 3, 1.4, 0.8, { mat: IK.metal(0x3f3f46, 0.4) }) }); solid(x, z, 3.2, 1.6);
          IKF.monitor(K, x - 0.5, 0.8, z - 0.4, 0.9, 0.5, 0, 'code', '#84cc16'); IKF.monitor(K, x + 0.6, 0.8, z - 0.4, 0.9, 0.5, 0, 'bars', '#84cc16');
          K.furn('modern_arm_chair_01', x, z + 1.3, Math.PI, { fb: (kk, f) => IKF.chair(kk, f.x, f.z, f.ry, IK.metal(0x22252b, 0.5)) }); }
        for (const x of [-15, 15]) for (let k = 0; k < 6; k++) K.cyl(IK.metal(0x27272a, 0.5), x, 0, -10 + k * 4, 0.08, 0.08, 5.2, 8);
        K.glowPart(box(0, 4.6, -11.92, 26, 0.12, 0.02, 0x65a30d));
        K.plane(IK.glowTex('ark', IKT.screen('chart', '#84cc16'), 1.1), 0, 3, -11.94, 6, 3.4, 0, 0, 1, 1);
        I.lightAt = [[-8, 4.2, -2], [8, 4.2, 2]];
        break;
      }
      case 'prison': {
        // bunks along the back, a row of steel bars, the cell block's painted wall band
        const M = IK.metal(0x4a4f57, 0.45);
        S.plane(IK.std('paint', { color: 0x5f6f66, roughness: 0.6 }), 0, 0.7, -d / 2 + 0.02, w, 1.4, 0);
        for (let k = 0; k < 6; k++) { const x = -12 + k * 4.8; K.blk(M, x, 0, -9.2, 2.1, 0.1, 0.95, 0.02); K.blk(M, x, 0.45, -9.2, 2.1, 0.08, 0.95, 0.02); K.box(IK.cloth(0x8a8f7a), x, 0.58, -9.2, 1.95, 0.14, 0.85, 0.05); K.box(IK.cloth(0x8a8f7a), x, 1.72, -9.2, 1.95, 0.14, 0.85, 0.05); K.blk(M, x, 1.58, -9.2, 2.1, 0.08, 0.95, 0.02);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.cyl(M, x + sx * 1.02, 0, -9.2 + sz * 0.44, 0.03, 0.03, 1.95, 8);
          solid(x, -9.2, 2.3, 1.2); }
        for (let k = -12; k <= 12; k += 0.5) if (Math.abs(k) > 1.1) K.cyl(M, k, 0, -6.6, 0.028, 0.028, 4.4, 8);
        K.box(M, 0, 4.35, -6.6, 26, 0.12, 0.12, 0.02); K.box(M, 0, 2.1, -6.6, 26, 0.08, 0.08, 0.01);
        I.lightAt = [[-6, 4.2, -2], [6, 4.2, 2]];
        break;
      }
      case 'well': {
        // the shaft: a ring of grey brick, moss at its foot, a damp floor with a puddle, the rope and bucket from the rim far above,
        // the night sky in the opening
        const R = 7, acc = new GeoAcc(), mo = new GeoAcc(), n = 40;
        const ring = (A, y0, y1) => { for (let k = 0; k < n; k++) { const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU, p0 = [Math.cos(a0) * R, y0, Math.sin(a0) * R], p1 = [Math.cos(a1) * R, y0, Math.sin(a1) * R], u0 = (k / n) * R * TAU, u1 = ((k + 1) / n) * R * TAU;
          A.quad(p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], [u0, y0], [u1, y0], [u1, y1], [u0, y1]); } };
        ring(mo, 0, 1.3); ring(acc, 1.3, H);
        S.put(IK.brick(), acc.geo()); S.put(IK.pbr('brick_grey', { color: 0x9fb58a, tile: 1.9 }, () => IK.lam('moss', { color: 0x4a5a3a })), mo.geo());
        const disc = (r, n) => ikUV(new THREE.CircleGeometry(r, n), 2 * r, 2 * r);
        S.put(IK.pbr('paving_stone', { tile: 1.6, color: 0x8e8e88 }, () => IK.lam('wellf', { color: 0x3a3a3a })), disc(R + 0.2, 48), MX(0, 0, 0, -Math.PI / 2));
        // a puddle under the rope: dark still water (it mirrors the room light), a ring of wet stone round it
        S.put(IK.pbr('paving_stone', { tile: 1.6, color: 0x62625c, rough: 0.35 }, () => IK.lam('wellw', { color: 0x2a2a2a })), disc(1.5, 32), MX(1.9, 0.004, -1.9, -Math.PI / 2, 0, 0, 1, 0.7, 1));
        S.put(IK.std('water', { color: 0x2a3a44, roughness: 0.03, metalness: 0.55, envMapIntensity: 1.4 }), disc(1.05, 32), MX(1.9, 0.009, -1.9, -Math.PI / 2, 0, 0.4, 1, 0.62, 1));
        // fallen bricks and rubble along the foot of the wall, a few dead leaves blown in from the courtyard
        for (let k = 0; k < 22; k++) { const a = k * 0.29 + rand(0.2), r = rand(5.4, 6.7); K.box(IK.brick(), Math.cos(a) * r, 0.05, Math.sin(a) * r, 0.24, 0.1, 0.12, 0.01, rand(TAU), rand(-0.3, 0.3), rand(-0.2, 0.2)); }
        for (let k = 0; k < 6; k++) { const a = rand(TAU), r = rand(5.6, 6.6); K.part(gpart(_IKS, pick([0x3a3a36, 0x45453f]), Math.cos(a) * r, 0.04, Math.sin(a) * r, 0, rand(TAU), 0, rand(0.25, 0.45), rand(0.07, 0.14), rand(0.2, 0.35))); }
        for (let k = 0; k < 30; k++) { const a = rand(TAU), r = rand(1, 6.5); K.part(gpart(_IKS, pick([0x6b4a22, 0x8a5a24, 0x5a4020]), Math.cos(a) * r, 0.012, Math.sin(a) * r, 0, rand(TAU), 0, 0.07, 0.006, 0.04)); }
        K.cylC(IK.std('rope', { color: 0x8a7350, roughness: 0.95 }), 2.2, (H + 0.72) / 2, -2.4, 0.025, 0.025, H - 0.72, 6);
        K.lathe(IK.wood(0x8a6a4a), [[0.001, 0], [0.2, 0], [0.24, 0.36], [0.23, 0.38], [0.001, 0.38]], 2.2, 0.3, -2.4, 16, 1, 1); K.lathe(IK.metal(0x3a3a3a, 0.6), [[0.235, 0.12], [0.245, 0.14], [0.235, 0.16]], 2.2, 0.3, -2.4, 16);
        K.cylC(IK.metal(0x3a3a3a, 0.6), 2.2, 0.72, -2.4, 0.008, 0.008, 0.46, 6, 0, 0, Math.PI / 2);
        S.cyl(IK.std('rim', { color: 0x7a7a74, roughness: 0.9, side: THREE.DoubleSide }), 0, H, 0, R + 0.5, R + 0.4, 0.5, 40, true);
        const sky = mkCanvas(256, 256), g = sky.getContext('2d'); g.fillStyle = '#05070f'; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(220,230,255,${rand(0.3, 1)})`; g.fillRect(rand(256), rand(256), rand(0.6, 1.8), rand(0.6, 1.8)); } g.fillStyle = '#e8eefc'; g.beginPath(); g.arc(170, 90, 16, 0, TAU); g.fill();
        S.plane(IK.glowTex('wellsky', tex(sky), 0.9), 0, H + 0.3, 0, 2 * R + 1, 2 * R + 1, 0, Math.PI / 2, 1, 1);
        // stepped colliders just outside the circle (the room box is square)
        for (let k = 0; k < 16; k++) { const x0 = -8 + k, x1 = x0 + 1, m = Math.min(Math.abs(x0), Math.abs(x1)), zi = Math.sqrt(Math.max(0, (R - 0.3) * (R - 0.3) - m * m)); if (m >= R - 0.3) { solid((x0 + x1) / 2, 0, 1, 16); continue; } I.solids.push({ x0, x1, z0: -8, z1: -zi }, { x0, x1, z0: zi, z1: 8 }); }
        I.lightAt = [[0, 11, 0], [-3, 6, 3]];
        break;
      }
    }
    S.finish(I); K.finish(I); C.finish(I);
    // nothing in a room moves: world matrices once, then out of the per-frame matrix pass
    grp.updateMatrixWorld(true); grp.traverse((o) => { o.matrixAutoUpdate = false; });
    // local colliders -> world
    I.solids = I.solids.map((s) => ({ x0: s.x0 + b.x, x1: s.x1 + b.x, z0: s.z0 + b.z, z1: s.z1 + b.z }));
    I.acts.forEach((a) => { a.x += b.x; a.z += b.z; });
    I.exit = this.doorMarker(b.x, 0, b.z + d / 2 - 0.9);
    this.built[id] = I;
    // a room built mid-game (walking up to its door): its programs compile in the background
    if (typeof Warm !== 'undefined' && Warm.live) Warm.add(grp, 2, true);
    return I;
  },
  // drop a built room (its merged geometry; furniture instances share the loaded models') so the next build() starts fresh
  unbuild(id) {
    const I = this.built[id]; if (!I || this.cur === id) return;
    I.grp.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    scene.remove(I.grp); scene.remove(I.exit); delete this.built[id];
  },
  collide(pos, r) { const I = this.built[this.cur]; return I ? collideList(pos, r, I.solids) : null; },
  // walk-in door check (city doors + interior exit)
  update(dt) {
    const P = Player;
    // the bobbing arrow hides while the camera is right on top of it (it would fill the screen and swallow the hero)
    const cx = camera.position.x, cz = camera.position.z;
    for (const d of W.doors) if (d.mesh) { const a = d.mesh.userData.arrow; a.position.y = 2.2 + Math.sin(G.time * 3) * 0.3; a.rotation.y += dt * 2; a.visible = dist2(cx, cz, d.x, d.z) > 3.5 * 3.5; d.mesh.visible = !this.cur && !d.locked; }
    if (this.garageCd > 0) this.garageCd -= dt;
    { const IC = this.cur && this.built[this.cur]; if (IC && IC.ceil) IC.ceil.visible = camera.position.y < IC.H - 0.15; } // (top view / high shots look in from above)
    if (Cutscene.active || this.fading || P.mode === 'dead') { this.nearAct = null; return; }
    if (this.cur) {
      const I = this.built[this.cur];
      const ea = I.exit.userData.arrow;
      ea.position.y = 2.2 + Math.sin(G.time * 3) * 0.3; ea.rotation.y += dt * 2;
      ea.visible = dist2(cx, cz, I.exit.position.x, I.exit.position.z) > 4.5 * 4.5; // you spawn facing in, so the camera starts right behind it
      // a mission can lock you in (fights, the fire escape needs the door) — but only while that mission runs
      const lk = Story.cur && Story.lockExit, locked = !!I.def.noExit || !!(lk && (lk === '*' || lk === this.cur));
      I.exit.visible = !locked;
      // the way out only arms once you've stepped into the room (holding "back" through the door mustn't bounce you out)
      const de = dist2(P.pos.x, P.pos.z, I.exit.position.x, I.exit.position.z);
      if (!this.exitArmed && de > 2.5 * 2.5) this.exitArmed = true;
      if (this.exitArmed && de < 1.4 * 1.4 && !locked) this.exit();
      let best = null, bd = Infinity;
      for (const a of I.acts) { const dd = dist2(P.pos.x, P.pos.z, a.x, a.z); if (dd < a.r * a.r && dd < bd) { bd = dd; best = a; } }
      this.nearAct = best;
    } else {
      this.nearAct = null;
      // walking up to a door: its room is built (and its shaders compile) a few seconds before you step in
      if ((this._preT = (this._preT || 0) - dt) <= 0) {
        this._preT = 0.7;
        for (const d of W.doors) if (!d.locked && !this.built[d.interior] && INTERIORS[d.interior] && dist2(P.pos.x, P.pos.z, d.x, d.z) < 40 * 40) { const id = d.interior; Jobs.add(() => { if (!this.built[id]) guard('room.pre', () => this.build(id)); }); break; }
      }
      // a door you just came out of stays quiet until you've stepped away from it
      if (this.rearm && dist2(P.pos.x, P.pos.z, this.rearm.x, this.rearm.z) > 3.2 * 3.2) this.rearm = null;
      if (P.mode !== 'human') return;
      for (const d of W.doors) {
        if (d.locked || d === this.rearm || dist2(P.pos.x, P.pos.z, d.x, d.z) > 1.5 * 1.5) continue;
        const why = Story.doorBlocked(d.interior);
        if (why) { if (!this.blockMsgT || G.time - this.blockMsgT > 3) { this.blockMsgT = G.time; UI.hint(why); } continue; }
        this.enter(d.interior, d);
        break;
      }
    }
  },
  nearNpc() { return !!this.nearAct; },
  interact() { if (this.nearAct) { Sfx.click(); this.nearAct.fn(); } },
  enter(id, door, cb) {
    if (this.fading) return;
    this.fading = true; Input.lock = true;
    UI.fade(1, 0.35, () => { this.enterInstant(id, door); UI.fade(0, 0.35, () => { this.fading = false; Input.lock = Cutscene.active || !!Gym.active; if (cb) cb(); }); });
  },
  enterInstant(id, door) {
    // built before its furniture / surfaces had streamed in and they're here now: build it again, properly dressed
    { const B = this.built[id]; if (B && this.cur !== id && [...B.missing].some((k) => Assets.has('furn/' + k)) && !B.def.noExit) this.unbuild(id); }
    const I = this.build(id);
    if (!this.cur) {
      // story steps enter without a door (checkpoint retries start at home): leave by this room's own door, the nearest
      // one if it has several; only doorless rooms (the prison, the well) send you back to where you stood
      const P = Player.pos;
      let dr = door || null, bd = Infinity;
      if (!dr) for (const d of W.doors) if (d.interior === id) { const dd = dist2(d.x, d.z, P.x, P.z); if (dd < bd) { bd = dd; dr = d; } }
      this.back = dr ? this.outside(dr) : { x: P.x, z: P.z, h: Player.heading };
    }
    if (Player.mode === 'car') Player.exitCar();
    this.cur = id; DayNight.indoor = true;
    for (const k in this.built) this.built[k].grp.visible = k === id;
    Player.pos.set(I.b.x, 0, I.b.z + I.d / 2 - 3); Player.vel.set(0, 0, 0); Player.heading = Math.PI; this.exitArmed = false;
    Cam.snap();
    I.npcs.forEach((n) => { if (!Actors.get('int_' + n.key)) Actors.spawn('int_' + n.key, n.kind, I.b.x + n.x, I.b.z + n.z, n.h); });
    this.lights.forEach((l, k) => { const a = I.lightAt && I.lightAt[k]; if (a) l.position.set(I.b.x + a[0], a[1], I.b.z + a[2]); else l.position.set(I.b.x + (k ? I.w / 4 : -I.w / 4), 4.6, I.b.z); l.color.set(I.def.light); l.intensity = 0.9 * 6.1; });
    UI.district(I.def.name, 'INTERIOR');
    Sfx.door();
    Story.event('enter', id);
  },
  exit(cb) {
    if (this.fading || !this.cur) return;
    this.fading = true; Input.lock = true;
    UI.fade(1, 0.35, () => { this.leaveInstant(); UI.fade(0, 0.35, () => { this.fading = false; Input.lock = Cutscene.active || !!Gym.active; if (cb) cb(); }); });
  },
  leaveInstant() {
    const id = this.cur;
    if (!id) return;
    Actors.clear('int_');
    if (this.built[id]) this.built[id].grp.visible = false;
    this.cur = null; DayNight.indoor = false;
    this.lights.forEach((l) => { l.intensity = 0; });
    const bk = this.back || { x: W.respawn.x, z: W.respawn.z, h: 0 };
    Player.pos.set(bk.x, 0, bk.z); Player.vel.set(0, 0, 0); Player.heading = bk.h || 0;
    this.rearm = bk.door ? W.doors.find((d) => d.id === bk.door) : null; this.back = null;
    Cam.snap(); UI.lastDist = '';
    Story.event('exit', id);
  },
  // 舆情公关中心: drive a car in to wash away your wanted level
  checkGarage() {
    const g = W.garage; if (!g || this.garageCd > 0 || Cutscene.active) return;
    const P = Player; if (P.mode !== 'car') return;
    if (dist2(P.pos.x, P.pos.z, g.x, g.z) > 5 * 5 || Math.abs(P.speed) > 14) return;
    this.garageCd = 6;
    const stars = Math.floor(G.heat);
    if (stars < 1) { UI.hint('舆情良好，不需要公关。'); return; }
    const cost = 20000 * stars;
    if (G.money < cost) { UI.hint(`公关费 ${fmtMoney(cost)}，你的钱不够`); Sfx.denied(); return; }
    Input.lock = true; P.car.vel.set(0, 0, 0);
    UI.fade(1, 0.5, () => {
      G.money -= cost; G.heat = 0; G.lastCrime = G.time - 99;
      for (const c of Cars.list) if (c.state === 'legal') c.remove();
      if (P.car) { P.car.hp = 100; P.car.fireT = 0; }
      Sfx.buy();
      setTimeout(() => UI.fade(0, 0.5, () => { Input.lock = false; UI.big('舆情已处理', `公关费 ${fmtMoney(cost)} · 通缉清零`, 'green', 2.4); }), 700);
    });
  },
};
function shadeHex(hex, amt) { return parseInt(shade('#' + hex.toString(16).padStart(6, '0'), amt).slice(1), 16); }

/* ---- gym minigame: alternate two keys as fast as you can ---- */
const Gym = {
  active: null,
  start(kind) {
    if (this.active) return;
    if (G.money < 5000) { UI.hint('练一次 ¥5,000，你的钱不够'); Sfx.denied(); return; }
    G.money -= 5000;
    const keys = kind === 'stamina' ? ['KeyA', 'KeyD'] : ['KeyJ', 'KeyK'];
    this.active = { kind, t: 8, n: 0, last: null, keys };
    Input.lock = true;
    UI.gym(true, kind, 0, 8);
    $('gym').style.pointerEvents = 'none'; // 快速连点屏幕: taps on the card must fall through to the touch zones
  },
  press(k) { const A = this.active; if (!A) return; if (k !== A.last) { A.n++; A.last = k; Sfx.click(); } },
  update(dt) {
    const A = this.active; if (!A) return;
    A.t -= dt;
    // a tap (screen, or a touch button — which also sets its key) is one rep; otherwise alternate the two keys
    if (Input.hit.Space || Input.click) this.press(A.last === 'tapA' ? 'tapB' : 'tapA');
    else for (const k of A.keys) if (Input.hit[k]) this.press(k);
    UI.gym(true, A.kind, A.n, A.t);
    if (A.t <= 0) {
      const gain = Math.min(45, Math.round(A.n * 0.7));
      this.active = null; Input.lock = false; UI.gym(false);
      RPG.train(A.kind, gain);
      UI.big(A.kind === 'stamina' ? '跑完了！' : '练完了！', `${A.kind === 'stamina' ? '耐力' : '肌肉'} +${gain}（${A.n} 次）`, 'green', 2.2);
      Sfx.passed();
    }
  },
};
