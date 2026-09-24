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

const Interiors = {
  cur: null, built: {}, lights: [], back: null, doorMeshes: [], nearAct: null, garageCd: 0, fading: false,
  init() {
    for (let k = 0; k < 2; k++) { const l = new THREE.PointLight(0xffffff, 0, 40, 1.4); scene.add(l); this.lights.push(l); }
    const cone = new THREE.ConeGeometry(0.7, 1.4, 4); cone.rotateX(Math.PI);
    this.arrowGeo = cone;
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    this.ringGeo = new THREE.RingGeometry(1.2, 1.6, 32).rotateX(-Math.PI / 2);
    for (const d of W.doors) d.mesh = this.doorMarker(d.x, groundH(d.x, d.z), d.z);
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
  build(id) {
    if (this.built[id]) return this.built[id];
    const def = INTERIORS[id], b = this.base(id), w = def.w, d = def.d;
    const grp = new THREE.Group(); grp.position.copy(b); scene.add(grp);
    const I = { id, def, b, grp, solids: [], acts: [], npcs: [], w, d };
    // floor + walls
    const floorTex = { carpet: TEX.carpet, carpetRed: TEX.carpetRed, tile: TEX.tile, tileDark: TEX.tileDark, wood: TEX.wood, concrete: TEX.concrete, paving: TEX.paving }[def.floor];
    const fl = new THREE.Mesh(flatPlane(w, d, 0, 0.01, 0, w / 4, d / 4), new THREE.MeshLambertMaterial({ map: floorTex }));
    fl.receiveShadow = true; grp.add(fl);
    const under = new THREE.Mesh(flatPlane(w + 60, d + 60, 0, -0.05, 0, 1, 1), new THREE.MeshBasicMaterial({ color: 0x07080a })); grp.add(under);
    const wallH = 5.2, P = [];
    P.push(box(0, wallH / 2, -d / 2 - 0.3, w + 1.2, wallH, 0.6, def.wall));
    P.push(box(-w / 2 - 0.3, wallH / 2, 0, 0.6, wallH, d + 1.2, def.wall), box(w / 2 + 0.3, wallH / 2, 0, 0.6, wallH, d + 1.2, def.wall));
    P.push(box(-w / 4 - 1.5, 0.55, d / 2 + 0.3, w / 2 - 3, 1.1, 0.6, def.wall), box(w / 4 + 1.5, 0.55, d / 2 + 0.3, w / 2 - 3, 1.1, 0.6, def.wall));
    P.push(box(0, 0.25, d / 2 + 0.2, 6, 0.1, 1.2, 0x6b4a30));
    P.push(box(0, wallH - 0.2, -d / 2 + 0.05, w, 0.35, 0.1, shadeHex(def.wall, -30)));
    I.solids.push({ x0: -w / 2 - 1, x1: w / 2 + 1, z0: -d / 2 - 1, z1: -d / 2 }, { x0: -w / 2 - 1, x1: -w / 2, z0: -d / 2, z1: d / 2 + 1 }, { x0: w / 2, x1: w / 2 + 1, z0: -d / 2, z1: d / 2 + 1 });
    I.solids.push({ x0: -w / 2, x1: -3, z0: d / 2, z1: d / 2 + 1 }, { x0: 3, x1: w / 2, z0: d / 2, z1: d / 2 + 1 });
    const add = (x, z, sw, sh, sd, c, solid = true, y = null) => { P.push(box(x, y ?? sh / 2, z, sw, sh, sd, c)); if (solid) I.solids.push({ x0: x - sw / 2, x1: x + sw / 2, z0: z - sd / 2, z1: z + sd / 2 }); };
    const act = (x, z, label, fn, r = 2.4) => { I.acts.push({ x, z, label, fn, r }); };
    const sign = (text, x, y, z, sw, c1, c2) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), new THREE.MeshBasicMaterial({ map: signTex(text, '', c1, c2), transparent: true })); m.position.set(x, y, z); grp.add(m); return m; };
    const glow = (x, y, z, sw, sh, sd, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, y, z); grp.add(m); return m; };
    const plane = (tx, x, y, z, sw, sh, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tx })); m.position.set(x, y, z); m.rotation.x = rx; grp.add(m); return m; };
    const npc = (key, kind, x, z, h = 0) => { I.npcs.push({ key, kind, x, z, h }); };
    // 老字号 dressing: red columns along the walls, lattice windows on the back wall, lanterns under the beams
    const oldRoom = () => {
      for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) for (let z = -d / 2 + 2; z < d / 2 - 1; z += 4) P.push(box(x, 2.6, z, 0.45, 5.2, 0.45, 0x9b2d24));
      for (let x = -w / 2 + 2.5; x < w / 2 - 2; x += 4.5) { glow(x, 3.2, -d / 2 + 0.06, 3.2, 1.6, 0.05, 0xf0dcb0); P.push(box(x, 3.2, -d / 2 + 0.1, 3.4, 0.12, 0.08, 0x5a2e1c), box(x, 3.2, -d / 2 + 0.1, 0.12, 1.8, 0.08, 0x5a2e1c)); }
      P.push(box(0, wallH - 0.25, 0, w - 1, 0.35, 0.35, 0x5a2e1c));
      for (let x = -w / 2 + 4; x < w / 2 - 3; x += 6) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3a })); l.scale.y = 1.2; l.position.set(x, wallH - 1.0, 0); grp.add(l); }
    };
    const plaque = (t, x, y, z, sw) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 0.22), new THREE.MeshBasicMaterial({ map: plaqueTex(t), transparent: true })); m.position.set(x, y, z); grp.add(m); };
    switch (id) {
      case 'home': {
        oldRoom(); plaque('Token 王府', 0, 4.2, -d / 2 + 0.12, 7);
        // 八仙桌 + 太师椅, the 25 machine, 作战室 screens, carved bed, wardrobe
        add(-7, 2, 2.6, 1.0, 2.6, 0x6b3a22); for (const [dx, dz] of [[-1.8, 0], [1.8, 0]]) add(-7 + dx, 2 + dz, 0.9, 1.4, 0.9, 0x4a2a1a);
        add(0, -9.4, 7, 1.0, 2, 0x2b2f36); for (const dx of [-2.2, 0, 2.2]) glow(dx, 1.9, -9.9, 1.8, 1.1, 0.08, 0x34d399);
        act(0, -8, '作战室电脑（技能 / 专精 / 洗点）', () => UI.openPanel('skills', true));
        add(10.5, -7.5, 6, 1.0, 3.2, 0x7a3a22); add(10.5, -9.0, 6, 2.4, 0.3, 0x5a2a16); add(10.5, -7.5, 5.4, 0.25, 2.8, 0xd94a3a, false, 1.1);
        act(10.5, -5.6, '雕花大床：睡一觉并存档（时间 +6 小时）', () => G.sleepSave());
        add(13.9, 3, 1.2, 4, 3.4, 0x7c3a22); act(12.2, 3, '衣柜：换衣服 / 换装备', () => UI.openWardrobe());
        for (let k = 0; k < 3; k++) { add(-12.5, -8 + k * 1.2, 2.2, 3.6, 1, 0x1f2937); glow(-11.4, 2.5, -8 + k * 1.2, 0.05, 0.3, 0.8, 0x22c55e); }
        plane(whiteboardTex(['Token 侠作战计划', '1. 吃满 1M Token', '2. 变身', '3. 拆了百模帮', '4. 再去喝碗豆汁儿']), 6, 3.2, -10.95, 6, 3);
        npc('alfred', 'alfred', -9, -6, 0); act(-9, -4.4, '跟阿福唠两句', () => Story.talk('alfred'));
        break;
      }
      case 'snack': {
        oldRoom(); plaque('护锅寺小吃', 0, 4.1, -d / 2 + 0.12, 6);
        add(0, -5.4, 11, 1.2, 1.2, 0x7a4a2a); for (let k = 0; k < 4; k++) P.push(gpart(new THREE.CylinderGeometry(0.55, 0.5, 0.6, 12), 0x9aa3ad, -4 + k * 2.6, 1.5, -5.4));
        plane(menuTex(['豆汁儿 焦圈', '卤煮火烧', '炸酱面', '驴打滚', '北冰漾', '冰糖葫芦']), 0, 2.8, -7.9, 7, 2.6);
        for (const [x, z] of [[-6, 0], [0, 0], [6, 0], [-6, 4], [6, 4]]) { add(x, z, 2.4, 0.9, 1.3, 0x8a5a34); P.push(box(x, 0.35, z - 1.1, 2.2, 0.7, 0.4, 0x6b4428), box(x, 0.35, z + 1.1, 2.2, 0.7, 0.4, 0x6b4428)); }
        npc('clerk', 'dama', 0, -6.8, 0); act(0, -3.8, '点单：豆汁儿 · 卤煮 · 炸酱面', () => UI.openShop('snack'));
        break;
      }
      case 'electronics': {
        for (const [x, z] of [[-6, -2], [0, -2], [6, -2], [-6, 3], [6, 3]]) { add(x, z, 3.6, 1.1, 2, 0x111827); for (let k = 0; k < 2; k++) { P.push(box(x - 0.8 + k * 1.6, 1.3, z, 1.2, 0.35, 1.6, 0x374151)); P.push(gpart(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 12), 0x9ca3af, x - 0.8 + k * 1.6, 1.49, z - 0.3)); } }
        glow(0, 4.5, -7.9, 20, 0.2, 0.1, 0x22d3ee); glow(-10.9, 3, 0, 0.1, 0.2, 14, 0xa855f7); glow(10.9, 3, 0, 0.1, 0.2, 14, 0xa855f7);
        sign('海量电子城 · 5090 现货', 0, 3.4, -7.85, 9, '#111827', '#22d3ee');
        add(0, 2.8, 5, 1.2, 1.6, 0x0f172a); glow(0, 1.62, 3.42, 4.6, 0.12, 0.05, 0x22d3ee); npc('clerk', 'clerk', 0, 1.1, 0); act(0, 4.4, '柜台：看看显卡和装备', () => UI.openShop('electronics'));
        break;
      }
      case 'clothes': {
        for (const [x, z] of [[-6, -3], [-6, 2], [0, -3], [6, -3]]) { add(x, z, 4, 0.2, 0.3, 0x9ca3af, false, 2.6); I.solids.push({ x0: x - 2, x1: x + 2, z0: z - 0.6, z1: z + 0.6 }); for (let k = 0; k < 6; k++) P.push(box(x - 1.6 + k * 0.64, 1.7, z, 0.5, 1.6, 0.5, pick([0xb4402f, 0x1f6feb, 0x16a34a, 0x6b7280, 0xf59e0b, 0xd7263d]))); }
        glow(8.5, 2.2, 0, 0.1, 3.4, 2.4, 0xd1d5db);
        add(5, 4, 4, 1.1, 1.4, 0xb4402f); npc('clerk', 'clerk', 5, 2.2, 0); act(5, 5.6, '店员：买衣服', () => UI.openShop('clothes'));
        break;
      }
      case 'dept': {
        for (const [x, z] of [[-7, -3], [0, -3], [7, -3], [-7, 2.5], [7, 2.5]]) { add(x, z, 4, 1.0, 1.6, 0xe7e2d8); glow(x, 1.05, z, 3.6, 0.08, 1.3, 0xfff3c4); for (let k = 0; k < 3; k++) P.push(gpart(new THREE.SphereGeometry(0.28, 8, 6), pick([0xd7263d, 0x1b1b1b, 0xe0b64a, 0x2156d8]), x - 1.2 + k * 1.2, 1.35, z)); }
        sign('王府景百货大楼', 0, 3.6, -7.85, 9, '#7c2d12', '#fbbf24');
        add(0, 4.2, 4.5, 1.1, 1.4, 0x7c2d12); npc('clerk', 'clerk', 0, 2.5, 0); act(0, 5.8, '柜台：帽子 · 眼镜 · 围巾 · 背包', () => UI.openShop('dept'));
        break;
      }
      case 'antique': {
        oldRoom(); plaque('容错斋', 0, 4.1, -d / 2 + 0.12, 5);
        for (const x of [-8, -4, 4, 8]) { add(x, -7, 3, 3.6, 0.8, 0x4a2a1a); for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) P.push(gpart(new THREE.SphereGeometry(0.3, 10, 8), k ? 0xf2f2f2 : 0x2a5ab8, x - 0.6 + k * 1.2, 0.9 + r * 1.1, -6.8, 0, 0, 0, 1, 1.4, 1)); }
        add(0, -2, 5, 0.9, 2, 0x5a3420); P.push(box(0, 0.95, -2, 3, 0.05, 1.2, 0xf5f0e0), box(-1.5, 1.05, -2.3, 0.1, 0.1, 0.5, 0x111111));
        plane(scrollTex('上善若水'), -6.5, 2.6, -7.88, 1.4, 3.4); plane(scrollTex('厚德载物'), 6.5, 2.6, -7.88, 1.4, 3.4);
        npc('clerk', 'shopkeeper', 0, -3.8, 0); act(0, -0.2, '掌柜：看看稀罕物件', () => UI.openShop('antique'));
        break;
      }
      case 'shoes': {
        oldRoom(); plaque('内联胜', 0, 4.1, -d / 2 + 0.12, 5);
        for (const x of [-7, -3.5, 3.5, 7]) { add(x, -5.8, 3, 3.4, 0.9, 0x6b4428); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) P.push(box(x - 1 + k, 0.55 + r * 0.8, -5.5, 0.7, 0.28, 0.4, pick([0x111111, 0x111111, 0xf5f5f5, 0xd7263d]))); }
        add(0, 2, 4, 0.5, 1.2, 0x7a4a2a); glow(-8.8, 1.8, 2, 0.08, 3, 1.6, 0xcfe8ff);
        npc('clerk', 'clerk', 0, -3.4, 0); act(0, -1.2, '伙计：试试新鞋', () => UI.openShop('shoes'));
        break;
      }
      case 'pharmacy': {
        oldRoom(); plaque('同 Token 堂', 0, 4.1, -d / 2 + 0.12, 6);
        // 百子柜: a wall of little drawers
        for (let r = 0; r < 6; r++) for (let k = 0; k < 12; k++) P.push(box(-6.6 + k * 1.2, 0.5 + r * 0.62, -7.55, 1.1, 0.55, 0.3, r % 2 === k % 2 ? 0x6b3f22 : 0x7a4a2a), box(-6.6 + k * 1.2, 0.5 + r * 0.62, -7.39, 0.12, 0.08, 0.05, 0xc9a23e));
        I.solids.push({ x0: -7.4, x1: 7.4, z0: -8, z1: -7.2 });
        add(0, -4.6, 10, 1.1, 1.2, 0x5a3420); P.push(box(3, 1.3, -4.6, 0.6, 0.3, 0.4, 0xc9a23e), gpart(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 10), 0xf2efe8, -3, 1.45, -4.6));
        npc('clerk', 'doctor', 0, -6, 0); act(0, -2.8, '老先生：抓药', () => UI.openShop('pharmacy'));
        break;
      }
      case 'duck': {
        oldRoom(); plaque('权重德', 0, 4.1, -d / 2 + 0.12, 5);
        // the oven, ducks hanging in the glow
        add(-9, -7, 5, 3.6, 2.2, 0x8a4a30); glow(-9, 1.2, -5.88, 2.2, 1.2, 0.05, 0xff7a2a);
        for (let k = 0; k < 4; k++) P.push(gpart(new THREE.SphereGeometry(0.42, 10, 8), 0xa0521e, -10.2 + k * 0.8, 2.6, -5.6, 0, 0, 0, 0.8, 1.3, 0.8));
        for (const [x, z] of [[-4, -2], [4, -2], [-4, 4], [4, 4], [10, 1]]) { P.push(gpart(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), 0xb91c1c, x, 1.0, z), gpart(new THREE.CylinderGeometry(0.25, 0.4, 0.95, 10), 0x5a3420, x, 0.48, z)); I.solids.push({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4 }); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; P.push(box(x + Math.cos(a) * 2.1, 0.5, z + Math.sin(a) * 2.1, 0.7, 1.0, 0.7, 0x6b3a22)); } }
        npc('clerk', 'waiter', 4, -6.4, 0); act(4, -4.8, '服务员：点菜', () => UI.openShop('duck'));
        break;
      }
      case 'teahouse': {
        oldRoom(); plaque('得云社', 0, 4.4, -d / 2 + 0.12, 5);
        // stage with red curtains and the 相声 table
        add(0, -7.6, 14, 0.9, 4, 0x6b3a22);
        glow(-6.4, 2.8, -9.8, 1.4, 4.6, 0.1, 0x9b1c14); glow(6.4, 2.8, -9.8, 1.4, 4.6, 0.1, 0x9b1c14); glow(0, 5.0, -9.8, 14, 0.8, 0.1, 0x9b1c14);
        P.push(box(0, 1.4, -7.8, 2.4, 1.0, 0.9, 0xb91c1c), box(0, 1.92, -7.8, 2.5, 0.06, 1.0, 0xf2c94c));
        for (const [x, z] of [[-6, -1], [0, -1], [6, -1], [-6, 4], [0, 4], [6, 4]]) { add(x, z, 1.8, 0.85, 1.8, 0x6b3a22); P.push(gpart(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 8), 0xf2f2f2, x - 0.3, 0.95, z), gpart(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 8), 0xf2f2f2, x + 0.3, 0.95, z + 0.2)); }
        npc('clerk', 'waiter', 9, 6, -Math.PI / 2); act(8.2, 6.6, '伙计：买票听相声 / 沏壶茶', () => UI.openShop('teahouse'));
        break;
      }
      case 'hardware': {
        for (const x of [-7, -3.5, 3.5, 7]) { add(x, -5.6, 3, 3.4, 0.9, 0x4b5563); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) P.push(box(x - 1 + k, 0.55 + r * 0.8, -5.3, 0.6, 0.4, 0.5, pick([0xb45309, 0x6b7280, 0xdc2626, 0x2563eb, 0xfbbf24]))); }
        for (let k = 0; k < 5; k++) P.push(box(-8, 0.2 + k * 0.28, 3.5, 1.1, 0.26, 0.55, 0x8d9095)); // the famous 板砖 stack
        add(0, 1.5, 5, 1.1, 1.2, 0x6b7280); npc('clerk', 'daye', 0, -0.4, 0); act(0, 3.0, '老王：板砖管够', () => UI.openShop('hardware'));
        break;
      }
      case 'gym': {
        for (const x of [-7, -3.5]) { add(x, -3, 2, 1.4, 3.4, 0x27272a); glow(x, 2.1, -4.5, 1.2, 0.6, 0.08, 0x22c55e); }
        act(-5.25, -0.5, '跑步机：练耐力（¥5,000 / 次）', () => Gym.start('stamina'));
        add(5, -3, 2.2, 0.8, 4, 0x3f3f46); P.push(box(5, 2.1, -4.2, 3.6, 0.15, 0.15, 0x9ca3af), gpart(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), 0x1f2937, 3.3, 2.1, -4.2, 0, 0, Math.PI / 2), gpart(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), 0x1f2937, 6.7, 2.1, -4.2, 0, 0, Math.PI / 2));
        act(5, -0.4, '卧推：练肌肉（¥5,000 / 次）', () => Gym.start('muscle'));
        for (let k = 0; k < 5; k++) add(-10.5, -5 + k * 2.2, 1.2, 1.2, 1.6, 0x52525b);
        glow(0, 2.4, -7.9, 14, 3.2, 0.05, 0x71717a);
        npc('coach', 'guest', 4, 3, -Math.PI / 2); act(2.6, 3.4, '教练', () => Story.talk('coach'));
        break;
      }
      case 'lab': {
        add(-7, -4, 9, 0.6, 7, 0xe2e8f0); P.push(box(-7, 1.4, -4, 3.2, 2.2, 7.2, 0x1f2937), box(-7, 2.7, -1.2, 2.8, 1.4, 1.6, 0x111827));
        for (const s of [-1, 1]) for (const z of [-6.6, -1.6]) P.push(box(-7 + s * 1.6, 0.9, z, 0.6, 1.2, 1.2, 0x0b0b0b));
        glow(-7, 0.35, 0, 9.4, 0.08, 7.4, 0x35d49a);
        for (const [x, z] of [[4, -6], [9, -6], [9, 0]]) { add(x, z, 3.6, 1.1, 2.2, 0xf1f5f9); P.push(box(x, 1.4, z, 1, 0.6, 1, pick([0x35d49a, 0x60a5fa, 0xfbbf24]))); }
        sign('应用科学部', 4, 3.8, -9.85, 8, '#0b0d10', '#35d49a');
        npc('kodex', 'kodex', 3, -2, 0); act(3, 0, 'Kodex：升级装备 / 涂装', () => (Story.flags.labShop ? UI.openShop('lab') : Story.talk('kodex')));
        break;
      }
      case 'dojo': {
        for (const x of [-11, 11]) for (const z of [-8, -2, 4]) { add(x, z, 1, 5.2, 1, 0x3b2418); glow(x * 0.9, 3.8, z, 0.7, 0.9, 0.7, 0xff8a3d); }
        add(0, -9.3, 6, 1.4, 2.4, 0x5a1515); P.push(box(0, 2.6, -10.1, 4, 2.6, 0.6, 0x3b0d0d));
        for (let k = 0; k < 5; k++) add(-12.8, -8 + k * 3, 0.6, 3, 2.2, 0x6b4a2f);
        glow(0, 4.6, -10.8, 18, 0.25, 0.1, 0xff7a3d);
        break;
      }
      case 'arkham': {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const x = -10.5 + c * 7, z = -7 + r * 6; add(x, z, 4, 1.0, 1.6, 0x3f3f46); glow(x, 1.7, z - 0.5, 1.6, 1.0, 0.06, 0x84cc16); }
        for (const x of [-15, 15]) for (let k = 0; k < 6; k++) P.push(box(x, 2.6, -10 + k * 4, 0.15, 5.2, 0.15, 0x27272a));
        glow(0, 4.5, -11.9, 26, 0.3, 0.1, 0x65a30d);
        break;
      }
      case 'prison': {
        for (let k = 0; k < 6; k++) { add(-12 + k * 4.8, -9.2, 3.6, 1.4, 1.4, 0x52525b); }
        for (let k = -12; k <= 12; k += 1.5) P.push(box(k, 2.2, -6.6, 0.12, 4.4, 0.12, 0x3f3f46));
        P.push(box(0, 4.3, -6.6, 26, 0.15, 0.15, 0x3f3f46));
        break;
      }
      case 'well': {
        for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; P.push(box(Math.cos(a) * 7, 3, Math.sin(a) * 7, 2.2, 6, 0.8, 0x3a3a3a, -a + Math.PI / 2)); }
        break;
      }
    }
    const m = new THREE.Mesh(mergeParts(P), MAT.vc); m.castShadow = true; m.receiveShadow = true; grp.add(m);
    // local colliders -> world
    I.solids = I.solids.map((s) => ({ x0: s.x0 + b.x, x1: s.x1 + b.x, z0: s.z0 + b.z, z1: s.z1 + b.z }));
    I.acts.forEach((a) => { a.x += b.x; a.z += b.z; });
    I.exit = this.doorMarker(b.x, 0, b.z + d / 2 - 0.9);
    this.built[id] = I;
    return I;
  },
  collide(pos, r) { const I = this.built[this.cur]; return I ? collideList(pos, r, I.solids) : null; },
  // walk-in door check (city doors + interior exit)
  update(dt) {
    const P = Player;
    for (const d of W.doors) if (d.mesh) { d.mesh.userData.arrow.position.y = 2.2 + Math.sin(G.time * 3) * 0.3; d.mesh.userData.arrow.rotation.y += dt * 2; d.mesh.visible = !this.cur && !d.locked; }
    if (this.garageCd > 0) this.garageCd -= dt;
    if (Cutscene.active || this.fading || P.mode === 'dead') { this.nearAct = null; return; }
    if (this.cur) {
      const I = this.built[this.cur];
      I.exit.userData.arrow.position.y = 2.2 + Math.sin(G.time * 3) * 0.3; I.exit.userData.arrow.rotation.y += dt * 2;
      // a mission can lock you in (fights, the fire escape needs the door) — but only while that mission runs
      const lk = Story.cur && Story.lockExit, locked = !!I.def.noExit || !!(lk && (lk === '*' || lk === this.cur));
      I.exit.visible = !locked;
      if (dist2(P.pos.x, P.pos.z, I.exit.position.x, I.exit.position.z) < 1.4 * 1.4 && !locked) this.exit();
      let best = null, bd = Infinity;
      for (const a of I.acts) { const dd = dist2(P.pos.x, P.pos.z, a.x, a.z); if (dd < a.r * a.r && dd < bd) { bd = dd; best = a; } }
      this.nearAct = best;
    } else {
      this.nearAct = null;
      if (P.mode !== 'human') return;
      for (const d of W.doors) {
        if (d.locked || dist2(P.pos.x, P.pos.z, d.x, d.z) > 1.5 * 1.5) continue;
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
    const I = this.build(id);
    if (!this.cur) this.back = door ? { x: door.x, z: door.z + 2.2, h: 0 } : { x: Player.pos.x, z: Player.pos.z, h: Player.heading };
    if (Player.mode === 'car') Player.exitCar();
    this.cur = id; DayNight.indoor = true;
    Player.pos.set(I.b.x, 0, I.b.z + I.d / 2 - 2.6); Player.vel.set(0, 0, 0); Player.heading = Math.PI;
    Cam.snap();
    I.npcs.forEach((n) => { if (!Actors.get('int_' + n.key)) Actors.spawn('int_' + n.key, n.kind, I.b.x + n.x, I.b.z + n.z, n.h); });
    this.lights.forEach((l, k) => { l.position.set(I.b.x + (k ? I.w / 4 : -I.w / 4), 4.6, I.b.z); l.color.set(I.def.light); l.intensity = 0.9; });
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
    this.cur = null; DayNight.indoor = false;
    this.lights.forEach((l) => { l.intensity = 0; });
    const bk = this.back || { x: W.respawn.x, z: W.respawn.z, h: 0 };
    Player.pos.set(bk.x, 0, bk.z); Player.vel.set(0, 0, 0); Player.heading = 0;
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
  },
  press(k) { const A = this.active; if (!A) return; if (k !== A.last) { A.n++; A.last = k; Sfx.click(); } },
  update(dt) {
    const A = this.active; if (!A) return;
    A.t -= dt;
    for (const k of A.keys) if (Input.hit[k]) this.press(k);
    if (Input.hit.Space || Input.click) this.press(A.last === 'tapA' ? 'tapB' : 'tapA');
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
