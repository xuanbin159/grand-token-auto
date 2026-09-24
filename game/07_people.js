/* ============================================================
   people: the character builder (hero, cast, NPC actors).
   Street pedestrians, e-bike riders and street life live in 07a_peds.js.
   ============================================================ */
/* ============================================================
   characters: one builder for the hero, the cast and NPCs.
   Everyone gets a big 3D head (02c_head3d: their drawing / photo on a real skull).
   ============================================================ */
function buildCharacter(o = {}) {
  const skin = o.skin ?? 0xe9c3a0, shirt = o.shirt ?? 0x17191e, pants = o.pants ?? 0x2b2f3a, shoe = o.shoe ?? 0x2b2b2b;
  const root = new THREE.Group();
  const mk = (parts) => { const m = new THREE.Mesh(mergeParts(parts), MAT.vc); m.castShadow = true; m.geometry.userData.own = true; return m; };
  const bodyParts = [];
  if (o.rack) {
    // 25 号机: a GPU server with a bow tie
    bodyParts.push(box(0, 1.25, 0, 1.2, 2.1, 0.9, 0x2a2d33), box(0, 2.34, 0, 1.25, 0.1, 0.95, 0x4b5160));
    for (let k = 0; k < 4; k++) { bodyParts.push(gpart(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), 0x9aa3ad, 0, 0.55 + k * 0.45, 0.46, Math.PI / 2, 0, 0)); bodyParts.push(box(0.42, 0.55 + k * 0.45, 0.46, 0.12, 0.06, 0.02, 0x22c55e)); }
    bodyParts.push(box(0, 2.1, 0.47, 0.34, 0.14, 0.04, 0xb91c1c));
  } else if (o.robe) {
    bodyParts.push(gpart(new THREE.CylinderGeometry(0.42, 0.72, 1.8, 10), o.robe, 0, 0.95, 0), box(0, 1.25, 0.25, 0.12, 1.2, 0.5, o.trim ?? 0xe8845a));
    bodyParts.push(gpart(new THREE.CylinderGeometry(0.55, 0.62, 0.28, 10), o.trim ?? 0xe8845a, 0, 1.18, 0));
  } else {
    bodyParts.push(box(0, 1.36, 0, 0.92, 0.96, 0.52, o.coat ?? shirt));
    if (o.coat) bodyParts.push(box(0, 1.3, 0.265, 0.3, 0.8, 0.02, shirt), box(0, 0.78, 0, 0.94, 0.3, 0.54, o.coat));
    if (o.print !== undefined) bodyParts.push(box(0.06, 1.32, 0.265, 0.44, 0.46, 0.02, o.print));
    if (o.plaid) for (let k = 0; k < 4; k++) bodyParts.push(box(0, 1.0 + k * 0.24, 0.266, 0.93, 0.05, 0.01, 0x2b3a67), box(-0.3 + k * 0.2, 1.36, 0.267, 0.05, 0.95, 0.01, 0xf5d9a8));
    if (o.tie) bodyParts.push(box(0, 1.5, 0.27, 0.12, 0.55, 0.03, o.tieCol ?? 0xb91c1c));
    if (o.trim !== undefined && !o.robe) bodyParts.push(box(0, 1.62, 0.27, 0.92, 0.1, 0.03, o.trim));
    if (o.emblem) bodyParts.push(box(0, 1.45, 0.275, 0.34, 0.34, 0.02, o.emblem));
    if (o.tang) { bodyParts.push(box(0, 1.84, 0, 0.62, 0.14, 0.5, o.shirt)); for (let k = 0; k < 4; k++) bodyParts.push(box(0.05, 1.7 - k * 0.2, 0.275, 0.22, 0.05, 0.03, o.print ?? 0xe8b422)); }
    if (o.tank) bodyParts.push(box(-0.34, 1.62, 0.1, 0.24, 0.3, 0.4, skin), box(0.34, 1.62, 0.1, 0.24, 0.3, 0.4, skin));
    bodyParts.push(box(0, 1.9, 0, 0.28, 0.14, 0.28, skin));
    // neck
    if (o.neck === 'chain') { bodyParts.push(gpart(new THREE.TorusGeometry(0.36, 0.055, 6, 18), 0xf0c030, 0, 1.62, 0.12, 1.25, 0, 0)); bodyParts.push(box(0, 1.3, 0.31, 0.2, 0.22, 0.05, 0xf0c030)); }
    if (o.neck === 'scarf') bodyParts.push(box(0, 1.86, 0.02, 0.62, 0.18, 0.46, 0xc81e28), box(0.14, 1.5, 0.28, 0.16, 0.62, 0.05, 0xc81e28));
    if (o.neck === 'badge') bodyParts.push(box(-0.14, 1.68, 0.27, 0.04, 0.34, 0.02, 0x1d4ed8), box(0.14, 1.68, 0.27, 0.04, 0.34, 0.02, 0x1d4ed8), box(0, 1.36, 0.28, 0.26, 0.34, 0.02, 0xf8fafc), box(0, 1.42, 0.29, 0.16, 0.08, 0.01, 0xd7263d));
    // back
    if (o.back === 'backpack') bodyParts.push(box(0, 1.34, -0.46, 0.72, 0.82, 0.38, 0x2d3a4a), box(0, 1.52, -0.66, 0.5, 0.26, 0.04, 0x46586e), box(-0.3, 1.5, 0.02, 0.08, 0.82, 0.56, 0x2d3a4a), box(0.3, 1.5, 0.02, 0.08, 0.82, 0.56, 0x2d3a4a));
    if (o.back === 'delivery') bodyParts.push(box(0, 1.5, -0.62, 0.95, 0.95, 0.72, 0xf6c21a), box(0, 1.55, -0.985, 0.6, 0.3, 0.02, 0x111111), box(-0.32, 1.5, 0.02, 0.08, 0.7, 0.56, 0x333333), box(0.32, 1.5, 0.02, 0.08, 0.7, 0.56, 0x333333));
    if (o.back === 'gpupack') bodyParts.push(box(0, 1.38, -0.5, 0.78, 0.9, 0.44, 0x16181d), box(0, 1.38, -0.73, 0.6, 0.7, 0.02, 0x2a2e36));
  }
  const body = mk(bodyParts);
  root.add(body);
  const R = { root, body };
  if (!o.rack && !o.robe) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.22, 0.9, 0);
      const lp = [box(0, -0.42, 0, 0.33, 0.84, 0.36, o.skirt && s ? 0x111827 : pants), ...shoeParts(o.shoeKind, shoe, skin)];
      if (o.stripes) lp.push(box(s * 0.17, -0.42, 0, 0.02, 0.8, 0.1, o.stripes));
      leg.add(mk(lp));
      const arm = new THREE.Group(); arm.position.set(s * 0.58, 1.74, 0);
      const sleeve = o.tank ? skin : o.coat ?? shirt;
      const ap = [box(0, -0.2, 0, 0.3, 0.42, 0.34, sleeve), box(0, -0.62, 0, 0.23, 0.46, 0.25, o.longSleeve ? sleeve : skin), box(0, -0.9, 0, 0.25, 0.18, 0.27, skin)];
      if (o.stripes) ap.push(box(s * 0.16, -0.4, 0, 0.02, 0.7, 0.1, o.stripes));
      if (s < 0 && o.wrist === 'pixiu') { for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; ap.push(gpart(BEAD, k === 0 ? 0xe0b030 : 0x5a2e16, Math.cos(a) * 0.16, -0.78, Math.sin(a) * 0.16)); } }
      if (s < 0 && o.wrist === 'watch') ap.push(box(0, -0.78, 0, 0.27, 0.1, 0.29, 0x111111), box(0, -0.78, 0.15, 0.16, 0.12, 0.02, 0x38e1ff));
      arm.add(mk(ap));
      root.add(leg, arm);
      R[s < 0 ? 'legL' : 'legR'] = leg; R[s < 0 ? 'armL' : 'armR'] = arm;
    }
  } else if (o.robe) {
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(s * 0.62, 1.7, 0);
      arm.add(mk([box(0, -0.45, 0, 0.36, 0.9, 0.4, o.robe), box(0, -0.95, 0, 0.26, 0.16, 0.28, skin)]));
      root.add(arm); R[s < 0 ? 'armL' : 'armR'] = arm;
    }
  }
  if (o.cape) {
    const cape = new THREE.Group(); cape.position.set(0, 1.86, -0.28);
    const cm = mk([box(0, -0.85, -0.05, 1.15, 1.7, 0.05, 0x0f1115), box(0, -0.02, 0, 1.0, 0.08, 0.12, 0xe0b64a)]);
    cape.add(cm); root.add(cape); R.cape = cape;
  }
  const hand = o.hand || (o.keyboard ? 'keyboard' : null);
  if (hand && R.armR && HAND_ITEMS[hand]) {
    const H = HAND_ITEMS[hand], it = mk(H.parts());
    it.position.set(0, -1.02, 0.12); it.rotation.x = H.rx ?? 0.5; R.armR.add(it); R.handItem = it; R.keyboard = hand === 'keyboard' ? it : null;
  }
  if (o.back === 'gpupack') { // RGB fans glow
    const fan = new THREE.Mesh(mergeParts([0, 1, 2].map((k) => gpart(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12), [0xff3d8b, 0x38e1ff, 0x7cff6b][k], -0.2 + k * 0.2, 1.38 + (k === 1 ? 0.2 : 0), -0.745, Math.PI / 2, 0, 0))), MAT.glowVC);
    root.add(fan);
  }
  if (o.head) {
    // a real 3D head (02c_head3d) with the drawing projected on the front: it turns with the body
    const size = o.headSize ?? 2.1, head = Head3D.forCast(o.head, size);
    head.position.y = (o.rack ? 2.45 : 1.95) + size * 0.42;
    root.add(head); R.head = head; R.headY = head.position.y;
  }
  if (o.scale) root.scale.setScalar(o.scale);
  return R;
}
function buildHuman(outfit = 'tee', eqp = {}) {
  const O = OUTFITS[outfit] || OUTFITS.tee;
  const R = buildCharacter({ shirt: O.shirt, print: O.tang ? undefined : O.print, pants: O.pants, shoe: O.shoe, plaid: O.plaid, tie: O.tie, cape: O.cape, emblem: outfit === 'batsuit' ? 0xe0b64a : undefined, trim: outfit === 'batsuit' ? 0xe0b64a : undefined,
    longSleeve: O.longSleeve || outfit === 'suit' || outfit === 'hoodie' || outfit === 'batsuit', tank: O.tank, stripes: O.stripes, tang: O.tang,
    hand: eqp.hand, neck: eqp.neck, back: eqp.back, wrist: eqp.wrist, shoeKind: eqp.feet });
  // the hero's own face as a 3D head, hat and glasses on it (the billboard sticker only stays for the mech helmet)
  const head = Head3D.heroHead(eqp.head, eqp.face);
  R.root.add(head); R.head = R.head3d = head; R.headY = head.position.y;
  scene.add(R.root);
  return R;
}
const BEAD = new THREE.SphereGeometry(0.055, 6, 4);
// what you can hold in your right hand (板砖 / 擀面杖 / 扳手 / 键盘 / 鸟笼 / 折扇 / 核桃 / 糖葫芦)
const HAND_ITEMS = {
  brick: { parts: () => [box(0, 0, 0, 0.18, 0.52, 0.3, 0xa0442e), box(0, 0.12, 0.151, 0.16, 0.02, 0.01, 0x7a3322)] },
  rollpin: { parts: () => [gpart(new THREE.CylinderGeometry(0.08, 0.08, 0.95, 8), 0xd9b48a, 0, 0, 0), gpart(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), 0xb8905e, 0, 0.62, 0), gpart(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), 0xb8905e, 0, -0.62, 0)], rx: 1.2 },
  wrench: { parts: () => [box(0, 0, 0, 0.1, 0.95, 0.07, 0x6b7280), box(0, 0.5, 0, 0.28, 0.14, 0.08, 0x6b7280), box(0, 0.58, 0, 0.1, 0.14, 0.08, 0x3f3f46)] },
  keyboard: { parts: () => [box(0, 0, 0, 0.14, 0.95, 0.34, 0x2b2f36), box(0.075, 0, 0, 0.02, 0.85, 0.28, 0xd1d5db)] },
  birdcage: { parts: () => [gpart(new THREE.CylinderGeometry(0.28, 0.3, 0.55, 10, 1, true), 0xc9a36a, 0, -0.42, 0), gpart(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, Math.PI / 2), 0x1e3a8a, 0, -0.16, 0), box(0, 0.05, 0, 0.04, 0.3, 0.04, 0xc9a36a), gpart(new THREE.SphereGeometry(0.09, 8, 6), 0xf6d23a, 0, -0.5, 0)], rx: 0 },
  fan: { parts: () => [gpart(new THREE.CylinderGeometry(0.55, 0.55, 0.02, 14, 1, false, -Math.PI / 2, Math.PI), 0xf2e6c8, 0, 0.25, 0, Math.PI / 2, 0, Math.PI / 2), box(0, -0.05, 0, 0.05, 0.3, 0.03, 0x5a3420)], rx: 0.2 },
  walnut: { parts: () => [gpart(new THREE.IcosahedronGeometry(0.12, 1), 0x7a4a26, -0.07, 0, 0.06), gpart(new THREE.IcosahedronGeometry(0.12, 1), 0x6b3f20, 0.08, -0.02, 0.1)], rx: 0 },
  hulu: { parts: () => [box(0, 0, 0, 0.03, 1.0, 0.03, 0xd9b48a), ...[0, 1, 2, 3, 4].map((k) => gpart(new THREE.SphereGeometry(0.1, 8, 6), 0xc8102e, 0, 0.12 + k * 0.17, 0))], rx: 0.2 },
};
function shoeParts(kind, shoe, skin) {
  switch (kind) {
    case 'bushoe': return [box(0, -0.84, 0.07, 0.35, 0.12, 0.5, 0x151515), box(0, -0.9, 0.07, 0.37, 0.05, 0.52, 0xf2f2f2)];
    case 'huili': return [box(0, -0.84, 0.07, 0.36, 0.15, 0.52, 0xf5f5f5), box(0, -0.82, 0.07, 0.37, 0.04, 0.46, 0xd7263d), box(0, -0.9, 0.07, 0.38, 0.04, 0.54, 0xd1d5db)];
    case 'aj': return [box(0, -0.83, 0.07, 0.38, 0.17, 0.54, 0xc81e28), box(0, -0.8, -0.1, 0.39, 0.1, 0.22, 0x111111), box(0, -0.9, 0.07, 0.4, 0.05, 0.56, 0xf5f5f5)];
    case 'flipflop': return [box(0, -0.86, 0.09, 0.3, 0.08, 0.46, skin), box(0, -0.9, 0.09, 0.34, 0.04, 0.5, 0x2563eb), box(0, -0.84, 0.18, 0.28, 0.03, 0.04, 0x2563eb)];
    default: return [box(0, -0.84, 0.07, 0.35, 0.14, 0.5, shoe)];
  }
}

const CAST = {
  klaude: () => ({ robe: 0x3a261d, trim: 0xe8845a, head: HEADS.klaude, headSize: 2.3, name: '杜卡德', color: '#ff9a66' }),
  klaudeEvil: () => ({ robe: 0x2a1410, trim: 0xff5a2a, head: HEADS.klaudeEvil, headSize: 2.5, name: 'Klaude', color: '#ff6a3d' }),
  kodex: () => ({ coat: 0xf2f4f7, shirt: 0x111827, pants: 0x1f2937, shoe: 0x111111, head: HEADS.kodex, name: 'Kodex', color: '#6ee7b7' }),
  alfred: () => ({ rack: true, head: HEADS.alfred, headSize: 1.9, name: '阿福 · 25号机', color: '#7cc4ff' }),
  gordon: () => ({ coat: 0x8a6a44, shirt: 0xe5e7eb, pants: 0x3f3f46, tie: true, tieCol: 0x1f2937, head: HEADS.gordon, name: '老戈', color: '#e8c48a' }),
  rachel: () => ({ shirt: 0x1d4ed8, pants: 0x1f2937, skirt: true, skin: 0xf5d0b3, head: HEADS.rachel, name: '瑞秋', color: '#ff9ec3' }),
  crane: () => ({ shirt: 0x2f3542, coat: 0x2f3542, pants: 0x2f3542, tie: true, tieCol: 0x4d7c0f, head: HEADS.crane, name: '幻觉博士', color: '#a3e635' }),
  shadow: () => ({ shirt: 0x16161a, pants: 0x16161a, trim: 0xff7a3d, longSleeve: true, head: HEADS.shadow, name: '影之 Agent', color: '#ff9a66' }),
  master: () => ({ robe: 0x5a1515, trim: 0xb91c1c, head: HEADS.master, headSize: 2.6, name: '影之首领', color: '#f87171' }),
  bug: () => ({ shirt: 0xf97316, pants: 0xf97316, head: HEADS.bug, name: 'bug 囚犯', color: '#9ae66e' }),
  labeler: () => ({ shirt: 0xd1d5db, pants: 0x4b5563, head: HEADS.labeler, name: '标注员', color: '#d1d5db' }),
  clerk: () => ({ shirt: pick([0x16a34a, 0x1d4ed8, 0xb91c1c, 0x7c3aed]), pants: 0x1f2937, head: HEADS[pick(['clerk1', 'clerk2', 'clerk3'])], name: '店员', color: '#e5e7eb' }),
  guest: () => ({ shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), head: HEADS[pick(['clerk1', 'clerk2', 'clerk3'])], name: '客人', color: '#e5e7eb' }),
  dama: () => ({ shirt: 0xd7263d, pants: 0x1f2937, skin: 0xf0c8a4, head: HEADS.dama, name: '王大妈', color: '#fda4af' }),
  daye: () => ({ shirt: 0xf4f2ec, pants: 0x3b4252, skin: 0xe8b890, head: HEADS.daye, name: '老王', color: '#fde68a', tank: true }),
  shopkeeper: () => ({ robe: 0x3b2a1e, trim: 0x8a6a44, head: HEADS.shopkeeper, headSize: 2.2, name: '掌柜的', color: '#e8c48a' }),
  doctor: () => ({ robe: 0xece8dc, trim: 0x8a6a44, head: HEADS.doctor, headSize: 2.2, name: '老先生', color: '#f5f5f4' }),
  waiter: () => ({ shirt: 0xf4f2ec, coat: 0xb91c1c, pants: 0x1b1b1b, head: HEADS.waiter, name: '服务员', color: '#fecaca' }),
  xs1: () => ({ robe: 0x1e3a8a, trim: 0x1e3a8a, head: HEADS.xs1, headSize: 2.2, name: '逗哏 · 甄逗', color: '#93c5fd' }),
  xs2: () => ({ robe: 0x4b5563, trim: 0x4b5563, head: HEADS.xs2, headSize: 2.2, name: '捧哏 · 贾捧', color: '#d1d5db' }),
};
const SPEAKERS = {
  hero: { name: 'Token 侠', color: '#ffc940', head: () => HEADS.hero },
  narrator: { name: '说书人', color: '#cfcfcf', head: null },
  klaude: { name: '杜卡德', color: '#ff9a66', head: () => HEADS.klaude },
  klaudeEvil: { name: 'Klaude', color: '#ff6a3d', head: () => HEADS.klaudeEvil },
  kodex: { name: 'Kodex', color: '#6ee7b7', head: () => HEADS.kodex },
  alfred: { name: '阿福 · 25号机', color: '#7cc4ff', head: () => HEADS.alfred },
  gordon: { name: '老戈', color: '#e8c48a', head: () => HEADS.gordon },
  rachel: { name: '瑞秋', color: '#ff9ec3', head: () => HEADS.rachel },
  crane: { name: '幻觉博士', color: '#a3e635', head: () => HEADS.crane },
  master: { name: '影之首领', color: '#f87171', head: () => HEADS.master },
  bug: { name: 'bug 囚犯', color: '#9ae66e', head: () => HEADS.bug },
  shadow: { name: '影之 Agent', color: '#ff9a66', head: () => HEADS.shadow },
  clerk: { name: '店员', color: '#e5e7eb', head: () => HEADS.clerk1 },
  coach: { name: '教练', color: '#fdba74', head: () => HEADS.clerk3 },
  dama: { name: '王大妈', color: '#fda4af', head: () => HEADS.dama }, daye: { name: '老王', color: '#fde68a', head: () => HEADS.daye },
  shopkeeper: { name: '掌柜的', color: '#e8c48a', head: () => HEADS.shopkeeper }, doctor: { name: '老先生', color: '#f5f5f4', head: () => HEADS.doctor },
  waiter: { name: '服务员', color: '#fecaca', head: () => HEADS.waiter }, xs1: { name: '逗哏 · 甄逗', color: '#93c5fd', head: () => HEADS.xs1 }, xs2: { name: '捧哏 · 贾捧', color: '#d1d5db', head: () => HEADS.xs2 },
  ped: { name: '路人', color: '#e5e7eb', head: () => HEADS.clerk2 },
};

/* ---- actors: NPCs placed by cutscenes and interiors ---- */
const Actors = {
  map: {},
  spawn(id, kind, x, z, heading = 0, opts = {}) {
    this.remove(id);
    const def = CAST[kind] ? CAST[kind]() : CAST.guest();
    Object.assign(def, opts);
    const R = buildCharacter(def);
    scene.add(R.root);
    [x, z] = standableSpot(x, z); // outdoors: never inside a building or a lake
    const a = { id, kind, R, pos: new V3(x, 0, z), heading, anim: opts.anim || 'idle', ph: rand(TAU), target: null, speed: 3, y: 0, bubbleH: 0.4, onArrive: null, t: 0, name: def.name };
    this.map[id] = a;
    this.sync(a, 0);
    return a;
  },
  get(id) { return this.map[id]; },
  remove(id) { const a = this.map[id]; if (!a) return; scene.remove(a.R.root); disposeOwn(a.R.root); a.removed = true; delete this.map[id]; },
  clear(prefix) { for (const id of Object.keys(this.map)) if (!prefix || id.startsWith(prefix)) this.remove(id); },
  walkTo(id, x, z, speed = 3, onArrive = null) { const a = this.map[id]; if (!a) return; a.target = [x, z]; a.speed = speed; a.onArrive = onArrive; a.anim = 'walk'; },
  face(id, x, z) { const a = this.map[id]; if (a) a.heading = Math.atan2(x - a.pos.x, z - a.pos.z); },
  faceEach(a, b) { const A = this.map[a], B = this.map[b]; if (A && B) { this.face(a, B.pos.x, B.pos.z); this.face(b, A.pos.x, A.pos.z); } },
  anim(id, name) { const a = this.map[id]; if (a) { a.anim = name; a.t = 0; } },
  place(id, x, z, h) { const a = this.map[id]; if (a) { [x, z] = standableSpot(x, z); a.pos.set(x, 0, z); if (h !== undefined) a.heading = h; a.target = null; } },
  update(dt) {
    for (const id in this.map) {
      const a = this.map[id];
      a.t += dt; a.ph += dt * (a.anim === 'walk' ? 9 : 2.2);
      if (a.target) {
        const dx = a.target[0] - a.pos.x, dz = a.target[1] - a.pos.z, d = hyp(dx, dz);
        if (d < 0.2) { a.target = null; a.anim = 'idle'; const cb = a.onArrive; a.onArrive = null; if (cb) cb(); }
        else { const s = Math.min(d, a.speed * dt); a.pos.x += (dx / d) * s; a.pos.z += (dz / d) * s; a.heading = dampA(a.heading, Math.atan2(dx, dz), 10, dt); }
      }
      this.sync(a, dt);
    }
  },
  sync(a, dt) {
    const R = a.R, gh = Interiors.cur ? 0 : groundH(a.pos.x, a.pos.z);
    let y = gh, rx = 0, sw = 0, al = 0, ar = 0, headBob = 0;
    switch (a.anim) {
      case 'walk': sw = Math.sin(a.ph) * 0.7; y += Math.abs(Math.sin(a.ph)) * 0.08; al = -sw * 0.8; ar = sw * 0.8; break;
      case 'talk': al = -0.3 - Math.max(0, Math.sin(a.ph * 1.6)) * 0.6; ar = -0.2; headBob = Math.sin(a.ph * 3) * 0.06; break;
      case 'point': ar = -1.5; al = 0; break;
      case 'cheer': al = ar = -2.6 + Math.sin(a.ph * 4) * 0.3; y += Math.abs(Math.sin(a.ph * 4)) * 0.3; break;
      case 'kneel': y -= 0.45; rx = 0.25; al = ar = -0.4; break;
      case 'fall': rx = -1.45; y += 0.2; break;
      case 'lie': rx = -1.5; y += 0.25; break;
      case 'carry': rx = -1.5; al = ar = 0.5 + Math.sin(a.ph * 3) * 0.15; sw = 0.2; break; // slung over someone's shoulders
      case 'bow': rx = 0.5; break;
      case 'fight': al = -1.2 + Math.sin(a.ph * 5) * 0.3; ar = -1.2 - Math.sin(a.ph * 5) * 0.3; break;
      default: headBob = Math.sin(a.ph) * 0.03;
    }
    R.root.position.set(a.pos.x, y + (a.y || 0), a.pos.z);
    R.root.rotation.set(rx, a.heading, 0, 'YXZ');
    if (R.legL) { R.legL.rotation.x = sw; R.legR.rotation.x = -sw; }
    if (R.armL) { R.armL.rotation.x = damp(R.armL.rotation.x, al, 12, dt || 1); R.armR.rotation.x = damp(R.armR.rotation.x, ar, 12, dt || 1); }
    if (R.head) R.head.position.y = R.headY + headBob;
  },
};
