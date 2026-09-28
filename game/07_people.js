/* ============================================================
   people: the character builder (hero, cast, NPC actors).
   Everyone is a VRoid anime character (07b_vrm.js: CharRig); the old box people below
   only stand in if the models failed to load.
   Street pedestrians, e-bike riders and street life live in 07a_peds.js.
   ============================================================ */
// fallback: the old box character with a big 3D head (02c_head3d)
function buildBoxCharacter(o = {}) {
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
function buildBoxHuman(outfit = 'tee', eqp = {}) {
  const O = OUTFITS[outfit] || OUTFITS.tee;
  const R = buildBoxCharacter({ shirt: O.shirt, print: O.tang ? undefined : O.print, pants: O.pants, shoe: O.shoe, plaid: O.plaid, tie: O.tie, cape: O.cape, emblem: outfit === 'batsuit' ? 0xe0b64a : undefined, trim: outfit === 'batsuit' ? 0xe0b64a : undefined,
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


/* ============================================================
   VRM characters (07b_vrm.js): the hero, the cast, NPC actors
   ============================================================ */
const HERO_VRM = 'hairsample_male';
// outfits recolour the hero's hoodie / trousers / shoes (the shop's 服装: 11_rpg.js)
const OUTFIT_PAL = {
  tee: { top: '#353a45', bottom: '#22252c' }, plaid: { top: '#a83a2c', bottom: '#34465f' }, hoodie: { top: '#6b7280', bottom: '#1f2937', shoe: '#e8e8e8' },
  suit: { top: '#1c1f26', bottom: '#1c1f26', shoe: '#0b0b0b' }, batsuit: { top: '#131418', bottom: '#131418', shoe: '#0b0b0b' }, laotou: { top: '#f4f2ec', bottom: '#3b4252' },
  tracksuit: { top: '#1e56c8', bottom: '#1e56c8', shoe: '#f5f5f5' }, delivery: { top: '#f2bd12', bottom: '#1f2937' }, tangzhuang: { top: '#b3171b', bottom: '#1b1b1b' },
};
const FEET_SHOE = { bushoe: '#141414', huili: '#f2f2f2', aj: '#c81e28', flipflop: '#2563eb' };
// the cast: a base (and a hair donor), recoloured; h = height factor, eyes = expression they wear
const CAST_VRM = {
  klaude: { body: 'sakurada_fumiriya', pal: { top: '#4a3024', bottom: '#2b2420', hair: '#7d746c', iris: '#c8753f' }, h: 1.02 },
  klaudeEvil: { body: 'sakurada_fumiriya', pal: { top: '#2a1410', bottom: '#1a0c0a', hair: '#2e211d', iris: '#ff4a1a' }, h: 1.03, expr: 'angry' },
  kodex: { body: 'avatarsample_c', pal: { top: '#e9edf3', bottom: '#1f2937', iris: '#2fb89a' } },
  alfred: { body: 'base_male', hair: 'hairsample_male', pal: { top: '#1a1c22', bottom: '#1a1c22', shoe: '#101010', hair: '#cfcfcf' }, back: 'gpupack' },
  gordon: { body: 'base_male', hair: 'sakurada_fumiriya', pal: { top: '#8a6a44', bottom: '#3f3f46', hair: '#5a3e28', shoe: '#2a2018' }, h: 1.02 },
  rachel: { body: 'sendagaya_shino', pal: { top: '#2f5496', bottom: '#1f2937' } },
  crane: { body: 'avatarsample_c', pal: { top: '#2f3542', bottom: '#2a2f3a', hair: '#8a8466', iris: '#9acd32' }, h: 1.03, expr: 'happy' },
  shadow: { body: 'vita', pal: { top: '#18181c', bottom: '#18181c', hair: '#2a2a30' } },
  master: { body: 'avatarsample_c', pal: { top: '#5a1515', bottom: '#1a0a0a', hair: '#161616', iris: '#ff3b1f' }, h: 1.08, expr: 'angry' },
  bug: { body: 'base_male', hair: 'hairsample_male', pal: { top: '#f97316', bottom: '#f97316', hair: '#5fbf4a' } },
  labeler: { body: 'hairsample_female', pal: { top: '#d1d5db', bottom: '#4b5563' } },
  clerk: { body: 'vivi', pal: { hair: '#2b1d16' } },
  dama: { body: 'base_female', hair: 'vivi', pal: { top: '#d7263d', bottom: '#1f2937', hair: '#2b1d16' }, h: 0.96 },
  daye: { body: 'base_male', hair: 'hairsample_male', pal: { top: '#f4f2ec', bottom: '#3b4252', hair: '#bdbdbd' }, h: 0.97 },
  shopkeeper: { body: 'base_male', hair: 'sakurada_fumiriya', pal: { top: '#3b2a1e', bottom: '#2a2019', hair: '#1b1b1b' } },
  doctor: { body: 'base_male', hair: 'hairsample_male', pal: { top: '#ece8dc', bottom: '#8a6a44', hair: '#f2f2f2' }, h: 0.98 },
  waiter: { body: 'sakurada_fumiriya', pal: { top: '#b91c1c', bottom: '#1b1b1b', hair: '#1b1b1b' } },
  xs1: { body: 'base_male', hair: 'hairsample_male', pal: { top: '#1e3a8a', bottom: '#1e3a8a', hair: '#111111' } },
  xs2: { body: 'base_male', hair: 'avatarsample_c', pal: { top: '#4b5563', bottom: '#4b5563', hair: '#2a2a2a' } },
};
// a random townsperson (07a_peds uses the same pool): { body, hair, pal, h }
const PED_HAIR = ['#141212', '#1c1616', '#2a1c16', '#3a2a20', '#4a3326', '#16161c'];
const PED_TOPS = ['#c23b3b', '#3b6fc2', '#2a9d8f', '#e0b84a', '#f2efe8', '#24262b', '#7b4fa0', '#d9822b', '#4f7a3a', '#9aa3ad', '#6b2d2d', '#1e3a5f', '#e07a9a', '#8a6a44', '#5c7cfa', '#0f766e'];
const PED_BOTTOMS = ['#1d2a44', '#2b2b2e', '#4a3a2c', '#6c7580', '#243b3a', '#1f2937', '#3b4f6b', '#d8d2c4', '#111111'];
const PED_M = ['hairsample_male', 'sakurada_fumiriya', 'avatarsample_c', 'base_male'], PED_F = ['sendagaya_shibu', 'hairsample_female', 'vivi', 'avatarsample_a', 'avatarsample_b', 'base_female', 'sendagaya_shino', 'victoria_rubin', 'darkness_shibu'];
function randomPedSpec(g, o = {}) {
  g = g || (Math.random() < 0.5 ? 'm' : 'f');
  const pool = (g === 'm' ? PED_M : PED_F).filter((k) => CharLib.base(k) === k), body = pick(pool.length ? pool : [CharLib.base(null, g)]);
  const hairPool = pool.filter((k) => k !== 'base_male' && k !== 'base_female'), hair = /^base_/.test(body) || Math.random() < 0.45 ? pick(hairPool.length ? hairPool : [body]) : body;
  return Object.assign({ body, hair, pal: { top: pick(PED_TOPS), bottom: pick(PED_BOTTOMS), hair: pick(PED_HAIR), iris: '#3a2a22', shoe: pick(['#1b1b1b', '#f2f2f2', '#5a4030', null]) }, h: rand(0.94, 1.05) }, o);
}

// dummies the old pose code (bike pedals, transform charge) still writes; the rig reads what it needs
const vrmDummies = () => ({ legL: new THREE.Object3D(), legR: new THREE.Object3D(), armL: new THREE.Object3D(), armR: new THREE.Object3D() });
// gear in the character's own frame (x = their left, y up, z forward, metres) on a bone
function vrmHolder(rig, bone) { const h = new THREE.Group(); h.rotation.y = Math.PI; return rig.attach(h, bone) || h; }
function vrmMesh(parts, glow) { const m = new THREE.Mesh(mergeParts(parts), glow ? MAT.glowVC : MAT.vc); m.castShadow = true; m.geometry.userData.own = true; return m; }
// right-hand items: the old HAND_ITEMS (built along the old arm, -y down it) turned into the hand's frame (+x along the fingers)
const _handM = new THREE.Matrix4().makeBasis(new V3(0, -1, 0), new V3(-1, 0, 0), new V3(0, 0, -1));
// an object built in the "arm hanging down" frame (-y toward the fingers, +z forward, origin at the wrist) into a hand
function vrmInHand(rig, obj, side = 'handR') {
  const g = new THREE.Group(); g.add(obj); g.matrixAutoUpdate = false; g.matrix.copy(_handM);
  if (side === 'handL') g.matrix.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  g.matrix.setPosition(side === 'handL' ? -0.05 : 0.05, -0.01, 0);
  return rig.attach(g, side);
}
function vrmHandItem(rig, kind, side = 'handR') {
  const H = HAND_ITEMS[kind]; if (!H) return null;
  const it = vrmMesh(H.parts());
  it.rotation.x = (H.rx ?? 0.5) * 0.6; it.scale.setScalar(0.42); it.position.set(0, -0.06, 0.03);
  return vrmInHand(rig, it, side);
}
function vrmGear(rig, eqp = {}, outfit) {
  const R = {};
  // hats / glasses: the 3D-head parts (02c_head3d, head units) sized to the anime head
  if (eqp.head || eqp.face) {
    const acc = [...Head3D.hatParts(eqp.head), ...Head3D.glassesParts(eqp.face)];
    if (acc.length) { const h = vrmHolder(rig, 'head'), m = vrmMesh(acc); m.scale.setScalar(0.104); m.position.set(0, 0.066, -0.004); h.add(m); R.hat = m; }
  }
  const chest = () => R.chest || (R.chest = vrmHolder(rig, 'upperChest'));
  // back: 双肩包 / 外卖箱 / 显卡背包
  const bp = [];
  // (rounded: a soft pack, a hard delivery box)
  if (eqp.back === 'backpack') bp.push(gpart(rboxGeo(0.3, 0.4, 0.15, 0.055), 0x2d3a4a, 0, -0.06, -0.19), gpart(rboxGeo(0.22, 0.14, 0.05, 0.022), 0x46586e, 0, -0.12, -0.265), gpart(rboxGeo(0.035, 0.34, 0.2, 0.014), 0x2d3a4a, -0.12, 0.02, -0.03), gpart(rboxGeo(0.035, 0.34, 0.2, 0.014), 0x2d3a4a, 0.12, 0.02, -0.03));
  if (eqp.back === 'delivery') bp.push(gpart(rboxGeo(0.44, 0.44, 0.34, 0.035), 0xf6c21a, 0, 0.02, -0.29), box(0, 0.04, -0.461, 0.3, 0.14, 0.01, 0x111111), gpart(rboxGeo(0.035, 0.32, 0.24, 0.014), 0x333333, -0.14, -0.02, -0.04), gpart(rboxGeo(0.035, 0.32, 0.24, 0.014), 0x333333, 0.14, -0.02, -0.04));
  if (eqp.back === 'gpupack') bp.push(gpart(rboxGeo(0.36, 0.42, 0.2, 0.05), 0x16181d, 0, -0.03, -0.2), box(0, -0.03, -0.302, 0.24, 0.3, 0.01, 0x2a2e36));
  if (bp.length) chest().add(vrmMesh(bp));
  if (eqp.back === 'gpupack') chest().add(vrmMesh([0, 1, 2].map((k) => gpart(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), [0xff3d8b, 0x38e1ff, 0x7cff6b][k], -0.09 + k * 0.09, -0.03 + (k === 1 ? 0.09 : 0), -0.309, Math.PI / 2, 0, 0)), true));
  // neck: 大金链子 / 红围巾 / 工牌
  const nk = [];
  if (eqp.neck === 'chain') { nk.push(gpart(new THREE.TorusGeometry(0.105, 0.012, 6, 20), 0xf0c030, 0, 0.1, 0.03, 1.25, 0, 0)); nk.push(box(0, -0.02, 0.125, 0.055, 0.065, 0.012, 0xf0c030)); }
  if (eqp.neck === 'scarf') nk.push(gpart(new THREE.TorusGeometry(0.075, 0.035, 8, 16), 0xc81e28, 0, 0.14, 0.0, Math.PI / 2, 0, 0), box(0.05, 0.03, 0.1, 0.06, 0.2, 0.025, 0xc81e28));
  if (eqp.neck === 'badge') nk.push(box(-0.05, 0.08, 0.11, 0.012, 0.12, 0.006, 0x1d4ed8), box(0.05, 0.08, 0.11, 0.012, 0.12, 0.006, 0x1d4ed8), box(0, -0.02, 0.12, 0.075, 0.1, 0.006, 0xf8fafc), box(0, 0.0, 0.124, 0.05, 0.022, 0.004, 0xd7263d));
  if (outfit === 'suit') nk.push(box(0, 0.02, 0.118, 0.04, 0.2, 0.01, 0xb91c1c));
  if (outfit === 'batsuit') nk.push(box(0, 0.0, 0.12, 0.1, 0.1, 0.008, 0xe0b64a));
  if (nk.length) chest().add(vrmMesh(nk));
  // wrist (left): 貔貅手串 / 智能手表
  if (eqp.wrist === 'pixiu' || eqp.wrist === 'watch') {
    const w = new THREE.Group(), P = [];
    if (eqp.wrist === 'pixiu') for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; P.push(gpart(BEAD, k === 0 ? 0xe0b030 : 0x5a2e16, 0, Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0, 0, 0, 0.18, 0.18, 0.18)); }
    else P.push(box(0, 0, 0, 0.022, 0.07, 0.07, 0x111111), box(0, 0.036, 0, 0.018, 0.004, 0.04, 0x38e1ff));
    const m = vrmMesh(P); m.position.x = 0.02; w.add(m); rig.attach(w, 'foreL'); w.position.set(-0.2, 0, 0);
  }
  // batsuit cape: hangs off the shoulders, swings back with speed (09_player / 06_vehicles set cape.rotation.x)
  if (outfit === 'batsuit') {
    const cape = new THREE.Group(); cape.position.set(0, 0.12, -0.13); chest().add(cape);
    const cm = vrmMesh([box(0, -0.5, -0.02, 0.5, 1.0, 0.02, 0x0f1115), box(0, -0.01, 0, 0.44, 0.04, 0.05, 0xe0b64a)]); cm.material = MAT.vc; cape.add(cm); R.cape = cape;
  }
  if (eqp.hand && HAND_ITEMS[eqp.hand]) R.handItem = vrmHandItem(rig, eqp.hand);
  return R;
}
// the hero's photo head (我的图片) on the VRM neck: realistic proportions, the anime face + hair hidden
const HERO_PHOTO_UNIT = 0.082;
function vrmPhotoHead(rig, eqp) {
  const hd = Head3D.heroHead(eqp.head, eqp.face); hd.position.set(0, 0, 0); hd.scale.setScalar(Head3D.HERO.unit); hd.userData.vrm = true;
  // the VRoid skull is part of the body skin (it can't be hidden on its own): shrink it inside the photo head
  const hb = rig.b.head, k0 = hb ? hb.scale.x : 1; if (hb) hb.scale.setScalar(k0 * 0.55);
  const hs = hb ? hb.scale.x : 1, holder = vrmHolder(rig, 'head'); holder.scale.setScalar(HERO_PHOTO_UNIT / Head3D.HERO.unit / hs); holder.position.set(0, 0.058, -0.01).multiplyScalar(k0 / hs); holder.add(hd);
  for (const m of rig.meshes) { const n = [].concat(m.material)[0].name || ''; if (/_(FACE|EYE)|Face_00_SKIN|_HAIR/.test(n) || m.name === 'face' || m.name === 'hair') m.visible = false; }
  return hd;
}
function vrmCastSpec(o) {
  const c = o.vrm || CAST_VRM[o.kind];
  if (c) return Object.assign({ full: true, springs: true }, c, c.pal ? { pal: Object.assign({}, c.pal) } : {});
  return Object.assign(randomPedSpec(), { full: false });
}
// NPCs / cast / enemies: a VRM rig with the old R interface ({ root, legL.., head / headY }) + rig
function buildCharacter(o = {}) {
  if (!CharLib.ready || o.box) return buildBoxCharacter(o);
  const spec = vrmCastSpec(o);
  if (o.full !== undefined) spec.full = o.full;
  if (o.tint) spec.pal = Object.assign({}, spec.pal, o.tint);
  const rig = new CharRig(spec), R = Object.assign({ root: rig.root, rig, headY: rig.height }, vrmDummies());
  if (spec.expr) rig.expr(spec.expr, 0.7);
  const hand = o.hand || (o.keyboard ? 'keyboard' : null);
  Object.assign(R, vrmGear(rig, { hand, back: spec.back || (o.back === 'gpupack' ? 'gpupack' : null) }));
  if (o.scale) rig.root.scale.setScalar(o.scale);
  R.bubbleH = rig.height + 0.35 - 3;
  return R;
}
// the hero: 动漫脸 (VRM face, default) or 我的图片 (02c_head3d photo head on the VRM body), outfit tint, the gear
function heroSpec(outfit = RPG.outfit, eqp = RPG.equip) {
  const pal = Object.assign({ iris: '#6b4a34' }, OUTFIT_PAL[outfit] || OUTFIT_PAL.tee);
  if (eqp && FEET_SHOE[eqp.feet]) pal.shoe = FEET_SHOE[eqp.feet];
  return { body: HERO_VRM, full: true, springs: true, own: true, pal, h: 1.02 };
}
function buildHuman(outfit = 'tee', eqp = {}) {
  if (!CharLib.ready) return buildBoxHuman(outfit, eqp);
  const rig = new CharRig(heroSpec(outfit, eqp)), R = Object.assign({ root: rig.root, rig, headY: rig.height, hero: true }, vrmDummies());
  const photo = typeof HeroFace !== 'undefined' && HeroFace.look === 'photo';
  Object.assign(R, vrmGear(rig, photo ? Object.assign({}, eqp, { head: null, face: null }) : eqp, outfit));
  if (photo) R.head = R.head3d = vrmPhotoHead(rig, eqp);
  R.keyboard = eqp.hand === 'keyboard' ? R.handItem : null;
  scene.add(R.root);
  return R;
}
// dialogue / HUD portraits of the cast (a small render of their VRM face; the old drawings stand in until it exists)
const VRM_HEADS = new Map();
function vrmHead(kind) {
  if (!CharLib.ready) return null;
  const key = kind === 'hero' ? 'hero:' + RPG.outfit : kind;
  let h = VRM_HEADS.get(key);
  if (h === undefined) {
    const spec = kind === 'hero' ? heroSpec() : CAST_VRM[kind] ? vrmCastSpec({ kind }) : null;
    const c = spec && CharPortrait.get('cast:' + key, spec, { expr: spec.expr, turn: 0.3, bg: kind === 'hero' ? ['#3a4050', '#15171c'] : ['#403830', '#141210'] });
    h = c ? { image: c } : null; VRM_HEADS.set(key, h);
  }
  return h;
}
const CAST = {
  klaude: () => ({ kind: 'klaude', robe: 0x3a261d, trim: 0xe8845a, head: HEADS.klaude, headSize: 2.3, name: '杜卡德', color: '#ff9a66' }),
  klaudeEvil: () => ({ kind: 'klaudeEvil', robe: 0x2a1410, trim: 0xff5a2a, head: HEADS.klaudeEvil, headSize: 2.5, name: 'Klaude', color: '#ff6a3d' }),
  kodex: () => ({ kind: 'kodex', coat: 0xf2f4f7, shirt: 0x111827, pants: 0x1f2937, shoe: 0x111111, head: HEADS.kodex, name: 'Kodex', color: '#6ee7b7' }),
  alfred: () => ({ kind: 'alfred', rack: true, head: HEADS.alfred, headSize: 1.9, name: '阿福 · 25号机', color: '#7cc4ff' }),
  gordon: () => ({ kind: 'gordon', coat: 0x8a6a44, shirt: 0xe5e7eb, pants: 0x3f3f46, tie: true, tieCol: 0x1f2937, head: HEADS.gordon, name: '老戈', color: '#e8c48a' }),
  rachel: () => ({ kind: 'rachel', shirt: 0x1d4ed8, pants: 0x1f2937, skirt: true, skin: 0xf5d0b3, head: HEADS.rachel, name: '瑞秋', color: '#ff9ec3' }),
  crane: () => ({ kind: 'crane', shirt: 0x2f3542, coat: 0x2f3542, pants: 0x2f3542, tie: true, tieCol: 0x4d7c0f, head: HEADS.crane, name: '幻觉博士', color: '#a3e635' }),
  shadow: () => ({ kind: 'shadow', shirt: 0x16161a, pants: 0x16161a, trim: 0xff7a3d, longSleeve: true, head: HEADS.shadow, name: '影之 Agent', color: '#ff9a66' }),
  master: () => ({ kind: 'master', robe: 0x5a1515, trim: 0xb91c1c, head: HEADS.master, headSize: 2.6, name: '影之首领', color: '#f87171' }),
  bug: () => ({ kind: 'bug', shirt: 0xf97316, pants: 0xf97316, head: HEADS.bug, name: 'bug 囚犯', color: '#9ae66e' }),
  labeler: () => ({ kind: 'labeler', shirt: 0xd1d5db, pants: 0x4b5563, head: HEADS.labeler, name: '标注员', color: '#d1d5db' }),
  clerk: () => ({ kind: 'clerk', shirt: pick([0x16a34a, 0x1d4ed8, 0xb91c1c, 0x7c3aed]), pants: 0x1f2937, head: HEADS[pick(['clerk1', 'clerk2', 'clerk3'])], name: '店员', color: '#e5e7eb' }),
  guest: () => ({ kind: 'guest', shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), head: HEADS[pick(['clerk1', 'clerk2', 'clerk3'])], name: '客人', color: '#e5e7eb' }),
  dama: () => ({ kind: 'dama', shirt: 0xd7263d, pants: 0x1f2937, skin: 0xf0c8a4, head: HEADS.dama, name: '王大妈', color: '#fda4af' }),
  daye: () => ({ kind: 'daye', shirt: 0xf4f2ec, pants: 0x3b4252, skin: 0xe8b890, head: HEADS.daye, name: '老王', color: '#fde68a', tank: true }),
  shopkeeper: () => ({ kind: 'shopkeeper', robe: 0x3b2a1e, trim: 0x8a6a44, head: HEADS.shopkeeper, headSize: 2.2, name: '掌柜的', color: '#e8c48a' }),
  doctor: () => ({ kind: 'doctor', robe: 0xece8dc, trim: 0x8a6a44, head: HEADS.doctor, headSize: 2.2, name: '老先生', color: '#f5f5f4' }),
  waiter: () => ({ kind: 'waiter', shirt: 0xf4f2ec, coat: 0xb91c1c, pants: 0x1b1b1b, head: HEADS.waiter, name: '服务员', color: '#fecaca' }),
  xs1: () => ({ kind: 'xs1', robe: 0x1e3a8a, trim: 0x1e3a8a, head: HEADS.xs1, headSize: 2.2, name: '逗哏 · 甄逗', color: '#93c5fd' }),
  xs2: () => ({ kind: 'xs2', robe: 0x4b5563, trim: 0x4b5563, head: HEADS.xs2, headSize: 2.2, name: '捧哏 · 贾捧', color: '#d1d5db' }),
};
const SPEAKERS = {
  hero: { name: 'Token 侠', color: '#ffc940', head: () => (typeof HeroFace !== 'undefined' && HeroFace.look === 'photo' ? null : vrmHead('hero')) || HEADS.hero },
  narrator: { name: '说书人', color: '#cfcfcf', head: null },
  klaude: { name: '杜卡德', color: '#ff9a66', head: () => vrmHead('klaude') || HEADS.klaude },
  klaudeEvil: { name: 'Klaude', color: '#ff6a3d', head: () => vrmHead('klaudeEvil') || HEADS.klaudeEvil },
  kodex: { name: 'Kodex', color: '#6ee7b7', head: () => vrmHead('kodex') || HEADS.kodex },
  alfred: { name: '阿福 · 25号机', color: '#7cc4ff', head: () => vrmHead('alfred') || HEADS.alfred },
  gordon: { name: '老戈', color: '#e8c48a', head: () => vrmHead('gordon') || HEADS.gordon },
  rachel: { name: '瑞秋', color: '#ff9ec3', head: () => vrmHead('rachel') || HEADS.rachel },
  crane: { name: '幻觉博士', color: '#a3e635', head: () => vrmHead('crane') || HEADS.crane },
  master: { name: '影之首领', color: '#f87171', head: () => vrmHead('master') || HEADS.master },
  bug: { name: 'bug 囚犯', color: '#9ae66e', head: () => vrmHead('bug') || HEADS.bug },
  shadow: { name: '影之 Agent', color: '#ff9a66', head: () => vrmHead('shadow') || HEADS.shadow },
  clerk: { name: '店员', color: '#e5e7eb', head: () => vrmHead('clerk') || HEADS.clerk1 },
  coach: { name: '教练', color: '#fdba74', head: () => vrmHead('clerk') || HEADS.clerk3 },
  dama: { name: '王大妈', color: '#fda4af', head: () => vrmHead('dama') || HEADS.dama }, daye: { name: '老王', color: '#fde68a', head: () => vrmHead('daye') || HEADS.daye },
  shopkeeper: { name: '掌柜的', color: '#e8c48a', head: () => vrmHead('shopkeeper') || HEADS.shopkeeper }, doctor: { name: '老先生', color: '#f5f5f4', head: () => vrmHead('doctor') || HEADS.doctor },
  waiter: { name: '服务员', color: '#fecaca', head: () => vrmHead('waiter') || HEADS.waiter }, xs1: { name: '逗哏 · 甄逗', color: '#93c5fd', head: () => vrmHead('xs1') || HEADS.xs1 }, xs2: { name: '捧哏 · 贾捧', color: '#d1d5db', head: () => vrmHead('xs2') || HEADS.xs2 },
  ped: { name: '路人', color: '#e5e7eb', head: () => vrmHead('clerk') || HEADS.clerk2 },
  labeler: { name: '标注员', color: '#d1d5db', head: () => vrmHead('labeler') || HEADS.labeler },
};

/* ---- actors: NPCs placed by cutscenes and interiors ---- */
const Actors = {
  map: {},
  spawn(id, kind, x, z, heading = 0, opts = {}) {
    this.remove(id);
    const def = CAST[kind] ? CAST[kind]() : CAST.guest();
    Object.assign(def, opts);
    if (!CAST_VRM[def.kind] && ['guest', 'clerk'].includes(kind)) def.full = false; // walk-ons: the crowd look
    const R = buildCharacter(def);
    scene.add(R.root);
    [x, z] = standableSpot(x, z); // outdoors: never inside a building or a lake
    const a = { id, kind, R, pos: new V3(x, 0, z), heading, anim: opts.anim || 'idle', ph: rand(TAU), target: null, speed: 3, y: 0, bubbleH: R.bubbleH ?? 0.4, onArrive: null, t: 0, name: def.name };
    if (R.rig) R.rig.needSnap = true; // settles the hair on its first update, once it stands where the scene put it
    this.map[id] = a;
    this.sync(a, 0);
    return a;
  },
  get(id) { return this.map[id]; },
  remove(id) { const a = this.map[id]; if (!a) return; scene.remove(a.R.root); disposeOwn(a.R.root); if (a.R.rig) a.R.rig.dispose(); a.removed = true; delete this.map[id]; },
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
  // VRM actors: a clip per scene verb (a.anim), walking / running by how fast they actually move, heads toward whoever talks
  sync(a, dt) {
    const R = a.R;
    if (!R.rig) return this.boxSync(a, dt);
    const rig = R.rig, gh = Interiors.cur ? 0 : groundH(a.pos.x, a.pos.z);
    let sp = a.sp;
    if (sp === undefined) {
      const m = dt > 0 && a._px !== undefined ? hyp(a.pos.x - a._px, a.pos.z - a._pz) / dt : 0;
      a._px = a.pos.x; a._pz = a.pos.z; sp = a._sv = dt > 0 ? damp(a._sv || 0, Math.min(m, 16), 8, dt) : a._sv || 0;
    }
    let y = gh + (a.y || 0), rx = 0;
    const was = a._anim; a._anim = a.anim;
    switch (a.anim) {
      case 'walk': case 'idle': this.loco(rig, sp, a); break;
      case 'talk': rig.play('talk', { fade: 0.35 }); break;
      case 'point': rig.play('insult', { fade: 0.3, hold: 0.27 }); break;
      case 'cheer': rig.play('cheer', { fade: 0.3, rate: a.rate || (a.rate = rand(0.85, 1.15)) }); rig.expr('happy', 0.8); break;
      case 'kneel': rig.play('death', { fade: 0.4, hold: 0.6 }); rig.expr('sad', 0.6); break;
      case 'fall': if (was !== 'fall') rig.play('knockdown', { fade: 0.1 }); rig.expr('ko', 1); break;
      case 'lie': rig.play('knockdown', { fade: was ? 0.3 : 0, hold: 0.999 }); rig.expr('ko', 1); rig.expr('blink', 1); break;
      case 'carry': rig.play('hurt_idle', { fade: 0 }); rig.expr('ko', 1); rig.expr('blink', 1); rx = -1.5; y -= 0.3; break; // slung over someone's shoulders
      case 'bow': if (was !== 'bow') rig.once('bow', { then: 'idle' }); break;
      case 'fight': rig.play('fight_idle', { fade: 0.2 }); break;
      default: rig.play(a.anim, { fade: 0.3 });
    }
    // up again (a scene stands them back up, a cast member reused after a KO beat): the knocked-out face and shut eyes go
    if (a.anim !== 'fall' && a.anim !== 'lie' && a.anim !== 'carry' && (rig.ex.ko || rig.ex.blink)) rig.expr('ko', 0).expr('blink', 0);
    R.root.position.set(a.pos.x, y, a.pos.z);
    R.root.rotation.set(rx, a.heading, 0, 'YXZ');
    this.gaze(a, rig);
  },
  // idle / walk / jog / run / sprint by ground speed, the clip's stride matched to it (feet planted). Fast runs don't just spin
  // the legs faster (hamster legs): past a sane cadence the stride lengthens instead (CharRig.pose swings the thighs wider)
  loco(rig, sp, a) {
    const f = rig.T.g === 'f', hy = rig.T.hipsY * rig.k;
    let k = sp < 0.3 ? (a && a.idleK) || 'idle' : sp < 1.9 ? (f ? 'walk_female' : a && a.formal ? 'walk_formal' : 'walk') : sp < 5.5 ? (f ? 'run_female' : 'jog') : sp < 9 ? 'run' : 'sprint';
    if (a && a.fleeing && sp >= 0.3) k = 'flee';
    const L = VRM_CLIPS[k], walk = k.startsWith('walk'), R = L && L[1] ? sp / (L[1] * hy) : 1, cap = walk ? 2.3 : k === 'sprint' ? 2.2 : 1.5;
    const st = walk || !(L && L[1]) ? 1 : clamp(R / cap, 1, 1.4), rate = L && L[1] ? clamp(R / st, 0.6, walk ? 2.3 : 2.8) : 1;
    rig.stride = st;
    rig.play(k, { fade: 0.3, rate });
    return k;
  },
  // who looks at whom: in a scene the listeners face the speaker, the speaker the camera; otherwise the hero when he's close
  gaze(a, rig) {
    const L = Cutscene.active ? Cutscene.line : null;
    rig.talk = !!(L && L.actor === a && L.shown < L.text.length);
    vrmMood(rig, L && (L.actor === a || (L.who && Actors.map[L.who] === a)) ? L : null);
    let t = null;
    if (L) {
      if (L.actor === a || (L.who && Actors.map[L.who] === a)) t = camera.position;
      else if (L.who === 'hero') t = _actLook.set(Player.pos.x, (Interiors.cur ? 0 : groundH(Player.pos.x, Player.pos.z)) + 1.6, Player.pos.z);
      else { const s = L.actor || Actors.map[L.who]; if (s && s !== a && s.R && s.R.rig) t = s.R.rig.bonePos('head', _actLook); }
    } else if (Player.mode === 'human' && a.anim !== 'lie' && a.anim !== 'carry' && dist2(a.pos.x, a.pos.z, Player.pos.x, Player.pos.z) < 36) t = _actLook.set(Player.pos.x, Player.human.root.position.y + 1.6, Player.pos.z);
    rig.look(t ? _actLook2.copy(t) : null);
  },
  boxSync(a, dt) {
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

const _actLook = new V3(), _actLook2 = new V3();
// the speaker's face follows the line: 滚 / 找死 → angry, 哈哈 / 谢了 → happy, ？！ / 什么 → surprised, 唉 / 对不起 → sad
const LINE_MOODS = [['angry', /滚|找死|混蛋|休想|可恶|闭嘴|放肆|大胆|别跑|站住|给我/], ['Surprised', /[?？][!！]|[!！][?？]|什么[?？!！]|啥[?？!！]|咦|卧槽|我去|不会吧|天哪|居然/],
  ['happy', /哈哈|嘿嘿|嘻|好耶|太好了|谢了|谢谢|得嘞|成交|漂亮|够意思|牛/], ['sad', /唉|可惜|对不起|抱歉|呜|完了/]];
function lineMood(t) { if (!t) return null; if (t._mood !== undefined) return t._mood; for (const [k, re] of LINE_MOODS) if (re.test(t.text)) return (t._mood = k); return (t._mood = null); }
function vrmMood(rig, L) {
  const m = L ? lineMood(L) : null, base = rig.spec && rig.spec.expr;
  if (m === rig._mood) return;
  if (rig._mood) rig.expr(rig._mood, rig._mood === base ? 0.7 : 0);
  if (m) { if (base && base !== m) rig.expr(base, 0); rig.expr(m, m === 'Surprised' ? 0.65 : 0.8); } else if (base) rig.expr(base, 0.7);
  rig._mood = m;
}
