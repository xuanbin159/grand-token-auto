/* ============================================================
   enemies: HQ defenders, gangs, story mobs (shadow agents,
   prison bugs, labelers, dummies, sub-agent drones),
   projectiles, hazards, and the two bosses
   ============================================================ */
const ENEMY_TYPES = {
  bun: { hp: 60, r: 1.4, label: '逗包', bg: '#1e6bff', dmg: 8, bubbleH: -0.4, xp: 15, lines: ['逗包来咯～', '我在呢', '有什么我能帮你的？', '嘿嘿～', '抱抱！'] },
  qbot: { hp: 80, r: 1.3, label: 'Kwen', bg: '#5b3df5', dmg: 9, bubbleH: 2.4, xp: 20, lines: ['让我想想……', 'Kwen 为您服务', '正在思考中……', '这个问题很有深度', '<think>'] },
  cha: { hp: 70, r: 1.5, label: '查查', bg: '#0b57d0', dmg: 10, bubbleH: 5, xp: 20, lines: ['查一下你的底细！', '风险提示！', '发现 999+ 条关联信息', '已为你生成报告', '查查查查'] },
  kefu: { hp: 75, r: 1.0, label: null, bg: null, dmg: 8, bubbleH: 0.3, xp: 15, lines: ['亲～', '请问有什么可以帮您？', '正在为您转接人工……', '您的问题我已记录', '感谢您的耐心等待', '亲，这边建议您冷静'] },
  gang: { hp: 60, r: 0.42, dmg: 7, bubbleH: 1.2, xp: 18, human: true, speed: 6.2, lines: ['这片儿是我们百模帮的地盘！', '刷榜刷到您家门口了', '哪个模型的？报上名来！', '我们家模型全球第一，不服啊？', '瞅什么瞅？'] },
  shadow: { hp: 70, r: 0.42, dmg: 6, cd: 1.4, bubbleH: 1.2, xp: 30, human: true, speed: 7.6, dash: true, lines: ['影之联盟，从不失手', '您的上下文，我收下了', '……'] },
  bugthug: { hp: 40, r: 0.42, dmg: 4, cd: 1.7, bubbleH: 1.2, xp: 10, human: true, speed: 4.4, lines: ['新来的？把 Token 交出来！', '嘿嘿，bug 永远修不完', '我这是 feature！', '懂不懂规矩？'] },
  labeler: { hp: 60, r: 0.42, dmg: 7, bubbleH: 1.2, xp: 20, human: true, speed: 5.5, thrower: true, lines: ['这张图是猫！是猫！', '标完了吗？还有十万条呢……', '我标的都对！', '哈哈哈哈哈'] },
  decoy: { hp: 1, r: 0.55, dmg: 5, bubbleH: 1.8, xp: 0, human: true, speed: 4, lines: ['我才是真的！', '猜猜哪个是我？'] },
  dummy: { hp: 150, r: 1.2, dmg: 0, bubbleH: 0.5, xp: 12, static: true, lines: [] },
  drone: { hp: 50, r: 1.0, label: '子 Agent', bg: '#c2410c', dmg: 7, bubbleH: 2, xp: 15, lines: ['子任务已派发', 'Task(描述: 消灭你)', '正在并行执行'] },
};
// human mobs' swings: [clip, striking limb] (the damage lands on the clip's impact frame: Enemy.swing)
const ENEMY_SWINGS = [['punch_jab', 'leftHand'], ['hook', 'rightHand'], ['punch_cross', 'rightHand']]; // jab = lead (left) hand
const DEATH_LINES = ['已下线', '转人工中…', '服务繁忙', '请稍后再试', 'Token 已退还', '404', '连接已断开'];
const ENEMY_GEO = new Map(), LABEL_MAT = new Map();
function enemyGeo(type, color) {
  const key = type + color;
  if (ENEMY_GEO.has(key)) return ENEMY_GEO.get(key);
  let parts;
  if (type === 'bun') {
    const sph = new THREE.SphereGeometry(1, 16, 12), small = new THREE.SphereGeometry(1, 8, 6);
    parts = [
      gpart(sph, 0xf7f0e2, 0, 1.0, 0, 0, 0, 0, 1.45, 1.05, 1.45), gpart(small, 0x7a2b20, 0, 2.02, 0, 0, 0, 0, 0.3, 0.14, 0.3),
      gpart(small, 0x1b1b1b, -0.45, 1.3, 1.26, 0, 0, 0, 0.13, 0.17, 0.08), gpart(small, 0x1b1b1b, 0.45, 1.3, 1.26, 0, 0, 0, 0.13, 0.17, 0.08),
      gpart(small, 0xff9aa2, -0.85, 1.0, 1.08, 0, 0, 0, 0.22, 0.12, 0.08), gpart(small, 0xff9aa2, 0.85, 1.0, 1.08, 0, 0, 0, 0.22, 0.12, 0.08),
      box(0, 0.95, 1.4, 0.3, 0.08, 0.06, 0x7a2b20),
    ];
  } else if (type === 'qbot' || type === 'drone') {
    const c1 = type === 'drone' ? 0xd97757 : 0x6b4cff, c2 = type === 'drone' ? 0xa3441f : 0x4a33c8, eye = type === 'drone' ? 0xffe0c2 : 0x6ff7ff;
    parts = [
      box(0, 0, 0, 1.8, 1.6, 1.6, c1), box(0, 0.1, 0.81, 1.5, 0.8, 0.06, 0x14102b), box(0, 0.12, 0.85, 1.1, 0.18, 0.04, eye),
      box(0, 1.0, 0, 0.12, 0.6, 0.12, 0xb7aaff), gpart(new THREE.SphereGeometry(0.22, 8, 6), 0xffd23f, 0, 1.35, 0),
      box(-1.05, -0.1, 0, 0.3, 0.8, 0.8, c2), box(1.05, -0.1, 0, 0.3, 0.8, 0.8, c2),
    ];
  } else if (type === 'cha') {
    parts = [
      gpart(new THREE.CylinderGeometry(1.4, 1.2, 0.4, 16), 0x1d6fe0, 0, 0, 0), gpart(new THREE.TorusGeometry(0.72, 0.15, 8, 20), 0xe8eef7, 0, 1.1, 0.1),
      gpart(new THREE.CircleGeometry(0.6, 16), 0x9ad0ff, 0, 1.1, 0.12), box(0.62, 0.45, 0.1, 0.18, 0.6, 0.18, 0xe8eef7, -0.7),
      box(-1.5, 0.2, 0, 0.9, 0.08, 0.2, 0x2b2f36), box(1.5, 0.2, 0, 0.9, 0.08, 0.2, 0x2b2f36), box(0, 0.2, -1.5, 0.2, 0.08, 0.9, 0x2b2f36), box(0, 0.2, 1.5, 0.2, 0.08, 0.9, 0x2b2f36),
    ];
  } else if (type === 'dummy') {
    parts = [box(0, 1.6, 0, 0.9, 3.2, 0.9, 0x8a5a34), box(0, 0.15, 0, 1.8, 0.3, 1.8, 0x5a3a22), box(0, 2.3, 0.6, 1.4, 0.25, 0.25, 0x6b4a2f), box(0, 1.5, 0.6, 0.25, 0.25, 1.1, 0x6b4a2f), gpart(new THREE.SphereGeometry(0.55, 10, 8), 0xa87a52, 0, 3.5, 0)];
  } else {
    const col = color || 0x3d5afe;
    parts = [
      box(-0.25, 0.4, 0, 0.3, 0.8, 0.35, 0x3a3f47), box(0.25, 0.4, 0, 0.3, 0.8, 0.35, 0x3a3f47),
      box(0, 1.35, 0, 1.1, 1.2, 0.7, 0xf2f4f7), box(0, 1.45, 0.36, 0.5, 0.3, 0.04, col),
      box(-0.7, 1.35, 0, 0.26, 0.9, 0.3, 0xdfe3e8), box(0.7, 1.35, 0, 0.26, 0.9, 0.3, 0xdfe3e8),
      gpart(new THREE.SphereGeometry(0.55, 12, 10), 0xe8ebef, 0, 2.35, 0), box(0, 2.38, 0.46, 0.7, 0.26, 0.12, col),
      gpart(new THREE.TorusGeometry(0.6, 0.07, 6, 16, Math.PI), 0x22262d, 0, 2.45, 0, 0, Math.PI / 2, 0), box(0.55, 2.2, 0.3, 0.08, 0.08, 0.45, 0x22262d),
    ];
  }
  const g = mergeParts(parts);
  ENEMY_GEO.set(key, g);
  return g;
}
function labelMat(text, bg) {
  const key = text + bg;
  if (!LABEL_MAT.has(key)) LABEL_MAT.set(key, new THREE.SpriteMaterial({ map: labelTex(text, bg), transparent: true, depthWrite: false }));
  return LABEL_MAT.get(key);
}
const gh0 = (x, z) => (Interiors.cur ? 0 : groundH(x, z));
// ---- where can something stand outdoors: on the map, not water / a building lot / a landmark, clear of every solid ----
function solidHas(s, x, z, r) {
  if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) return false;
  if (!s.obb) return true;
  const dx = x - s.cx, dz = z - s.cz;
  return Math.abs(dx * s.ux + dz * s.uz) < s.hx + r && Math.abs(-dx * s.uz + dz * s.ux) < s.hz + r;
}
const isIndoorXZ = (x) => x > IBASE - 300; // interiors live far east of the map
function openAt(x, z, r = 0.8, grid = true) {
  const B = W.bounds; if (x < B.x0 + r + 1 || x > B.x1 - r - 1 || z < B.z0 + r + 1 || z > B.z1 - r - 1) return false;
  const k = Grid.at(x, z); if (k === GK.WATER || (grid && (k === GK.BLD || k === GK.RESV))) return false;
  let hit = false; forSolids(x, z, r + 1, (s) => { if (solidHas(s, x, z, r)) { hit = true; return false; } });
  return !hit;
}
// nearest open spot to (x,z), searched in rings; indoor coordinates pass straight through
function openSpot(x, z, r = 0.8, maxR = 40, out = [0, 0]) {
  out[0] = x; out[1] = z;
  if (isIndoorXZ(x) || openAt(x, z, r)) return out;
  for (let d = 1.5; d <= maxR; d += 1.5) {
    const n = Math.max(6, Math.round((TAU * d) / 2)), a0 = rand(TAU);
    for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (openAt(px, pz, r)) { out[0] = px; out[1] = pz; return out; } }
  }
  const B = W.bounds; out[0] = clamp(x, B.x0 + 4, B.x1 - 4); out[1] = clamp(z, B.z0 + 4, B.z1 - 4);
  return out;
}
// an HQ's forecourt: the open side nearest a street (the south canopy side if it's usable)
function hqYard(h) {
  if (h._yard) return h._yard;
  let best = null, bd = Infinity;
  for (const [ox, oz, bias] of [[0, 1, -8], [1, 0, 0], [-1, 0, 0], [0, -1, 0]]) {
    const x = h.cx + ox * 21, z = h.cz + oz * 21;
    const [px, pz] = openSpot(x, z, 1.2, 14), n = Roads.nearest(px, pz, 60);
    const d = (n ? n.d : 60) + hyp(px - x, pz - z) * 2 + bias + (openAt(px, pz, 1.2) ? 0 : 500);
    if (d < bd) { bd = d; best = { x: px, z: pz }; }
  }
  return (h._yard = best);
}

class Enemy {
  constructor(type, hq, o = {}) {
    this.type = type; this.T = ENEMY_TYPES[type]; this.hq = hq || null;
    const T = this.T;
    if (T.human) {
      const castKey = o.cast || (type === 'gang' ? 'guest' : type === 'bugthug' ? 'bug' : type === 'decoy' ? 'crane' : type);
      const def = CAST[castKey]();
      if (type === 'gang' && hq) { def.shirt = new THREE.Color(hq.c1).getHex(); def.head = HEADS[pick(['clerk1', 'clerk2', 'clerk3'])]; }
      // mobs wear the crowd look (compact VRM); a gang member is a townsperson in the HQ's colour
      def.full = false;
      if (type === 'gang' && typeof randomPedSpec === 'function' && CharLib.ready) { def.vrm = randomPedSpec(Math.random() < 0.75 ? 'm' : 'f', { full: false }); if (hq) def.vrm.pal.top = hq.c1; }
      if (type === 'shadow' && CharLib.ready && Math.random() < 0.5) def.vrm = { body: 'base_male', hair: 'avatarsample_c', pal: { top: '#141418', bottom: '#141418', hair: '#1a1a1e', shoe: '#0b0b0b' } };
      this.R = buildCharacter(def); this.mesh = this.R.root; scene.add(this.mesh);
      if (type === 'decoy') this.mesh.scale.setScalar(1.25);
      if (this.R.rig) this.R.rig.needSnap = true;
    } else {
      const color = type === 'kefu' && hq ? new THREE.Color(hq.c1).getHex() : 0;
      this.mesh = new THREE.Mesh(enemyGeo(type, color), MAT.vc); this.mesh.castShadow = true; scene.add(this.mesh);
    }
    const lbl = o.label || T.label || (hq ? (type === 'gang' ? hq.short + '帮' : hq.short) : null);
    if (lbl) { this.label = new THREE.Sprite(labelMat(lbl, T.bg || (hq ? hq.c1 : '#333'))); this.label.scale.set(3.4, 0.96, 1); this.label.renderOrder = 6; scene.add(this.label); }
    let sx = o.x, sz = o.z;
    if (sx === undefined || sz === undefined) { const y = hq ? hqYard(hq) : Player.pos; sx = y.x + rand(-7, 7); sz = y.z + rand(-3, 3); }
    if (!o.raw) [sx, sz] = openSpot(sx, sz, T.r * 0.8, 30);
    this.pos = new V3(sx, 0, sz); this.vel = new V3();
    this.y = type === 'qbot' || type === 'drone' ? 3.2 : type === 'cha' ? 6 : 0; this.vy = 0;
    this.hp = T.hp * (o.hpMul || 1); this.maxHp = this.hp; this.r = T.r; this.bubbleH = this.R && this.R.rig ? this.R.bubbleH : T.bubbleH;
    this.atkCd = rand(1, 2.2); this.talkT = rand(1, 5); this.hopT = rand(0.4); this.ang = rand(TAU); this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.flash = 0; this.stun = 0; this.dead = false; this.doomT = 0; this.ph = rand(TAU); this.heading = o.heading ?? 0; this.squash = 0;
    this.windup = 0; this.aggro = o.aggro ?? !['gang'].includes(type); this.tag = o.tag || null; this.home = new V3(sx, 0, sz);
    if (!T.static) FX.sparkle(this.pos.x, 2, this.pos.z, 8);
  }
  hit(dmg, kx, kz, up, kind, silent) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.12; this.stun = Math.max(this.stun, 0.35); this.aggro = true;
    if (this.windup > 0) { this.windup = 0; this.atkCd = Math.max(this.atkCd, 0.5); } // a clean hit interrupts the swing
    if (!this.T.static) { this.vel.x += kx; this.vel.z += kz; }
    if (up && (this.type === 'bun' || this.type === 'kefu' || this.T.human)) this.vy = Math.max(this.vy, up * 0.6);
    if (!silent) { Floaters.add(this.pos.x, this.y + 3.2, this.pos.z, '-' + Math.round(dmg), 'fl-dmg small'); FX.sparks(this.pos.x, this.y + 1.2, this.pos.z, 5); if (!this.T.static && Math.random() < 0.45) Coins.burst(this.pos.x, this.y + 1.4, this.pos.z, 1, rand(40, 120), { inside: true }); }
    if (this.T.static) { Sfx.thud(); FX.chunks(this.pos.x, 2, this.pos.z, 3, [0x8a5a34, 0x6b4a2f]); }
    if (this.hp <= 0) this.die(kind);
  }
  die(kind) {
    if (this.dead) return;
    this.dead = true;
    if (this.label) scene.remove(this.label);
    if (!(this.T.human && Corpses.add(this))) { scene.remove(this.mesh); if (this.T.human) { disposeOwn(this.mesh); if (this.R.rig) this.R.rig.dispose(); } }
    const c = this.type === 'bun' ? [1, 0.95, 0.85] : this.type === 'qbot' ? [0.55, 0.45, 1] : this.type === 'cha' ? [0.3, 0.6, 1] : this.type === 'drone' || this.type === 'shadow' ? [1, 0.55, 0.3] : [0.9, 0.95, 1];
    for (let k = 0; k < 14; k++) FX.glowSys.spawn(this.pos.x, this.y + 1.2, this.pos.z, rand(-8, 8), rand(2, 10), rand(-8, 8), rand(0.8, 1.6), -0.6, c[0], c[1], c[2], 1, rand(0.3, 0.6), 2, 10);
    FX.chunks(this.pos.x, this.y + 1, this.pos.z, 5, this.type === 'dummy' ? [0x8a5a34, 0x5a3a22] : [0x2b2f36, 0x9aa3ad, 0xe5e7eb]);
    if (this.type === 'decoy') { FX.smoke(this.pos.x, 1.5, this.pos.z, 6, 3, 0.4); Floaters.add(this.pos.x, 3, this.pos.z, '幻觉而已', 'fl-line'); }
    else if (this.type !== 'dummy') Floaters.add(this.pos.x, this.y + 4, this.pos.z, pick(DEATH_LINES), 'fl-line');
    if (Tokens.enabled && this.type !== 'decoy' && this.type !== 'dummy') Tokens.burst(this.pos.x, this.pos.z, (kind !== 'doom' ? 2 : 1) * RPG.m.drops, 50000, this.y + 2);
    if (RPG.m.interest && Tokens.enabled) Player.addTokens(30000, true);
    Sfx.pop();
    G.stats.minions++; G.addMoney(2000 * RPG.m.valuation); RPG.gainXP(this.T.xp);
    if (this.type !== 'decoy' && this.type !== 'dummy') Coins.burst(this.pos.x, this.y + 1.6, this.pos.z, 4 + randi(0, 3), rand(120, 320) * RPG.m.drops, { big: this.T.human, inside: true });
    if (this.hq) this.hq.minions = Math.max(0, this.hq.minions - 1);
    Story.event('kill', this);
  }
  remove() { const was = this.dead; this.dead = true; scene.remove(this.mesh); if (this.label) scene.remove(this.label); if (!was && this.T.human) { disposeOwn(this.mesh); if (this.R.rig) this.R.rig.dispose(); } if (this.hq) this.hq.minions = Math.max(0, this.hq.minions - 1); }
  update(dt) {
    if (this.doomT > 0) { this.doomT -= dt; this.flash = 0.1; if (this.doomT <= 0) { this.die('doom'); return; } }
    const P = Player, alive = P.mode !== 'dead' && !Cutscene.active;
    let dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z;
    const d = hyp(dx, dz) || 0.01; dx /= d; dz /= d;
    // melee reach: a VRM arm is ~0.65 m, so people swing from about a metre off (and step in with the punch)
    const reach = this.r + P.radius() + (this.T.human ? 0.05 : 0.6);
    if (!this.aggro && d < 10 && (P.mode === 'human' || P.isMech())) this.aggro = true;
    const engaged = alive && d < 70 && this.aggro;
    const kv = Math.exp(-4 * dt);
    this.vel.x *= kv; this.vel.z *= kv;
    if (this.stun > 0) this.stun -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    this.ph += dt;
    let mvx = 0, mvz = 0, anim = 'idle';
    const T = this.T;
    if (this.stun <= 0 && !T.static) {
      if (!engaged) {
        const hm = this.hq ? hqYard(this.hq) : this.home, hx = hm.x - this.pos.x, hz = hm.z - this.pos.z, hd = hyp(hx, hz);
        if (hd > 6) { mvx = (hx / hd) * 3.5; mvz = (hz / hd) * 3.5; anim = 'walk'; }
        else if (this.type === 'gang') { this.ang += dt * 0.4; mvx = Math.cos(this.ang) * 1.2; mvz = Math.sin(this.ang) * 1.2; anim = 'walk'; }
      } else if (this.type === 'bun') {
        const grounded = this.y <= 0.01;
        this.hopT -= dt;
        if (grounded && this.hopT <= 0) { this.vy = 8.5; this.vel.x += dx * 7.5; this.vel.z += dz * 7.5; this.hopT = rand(0.45, 0.75); this.squash = 1; }
        if (d < reach + 0.4 && this.atkCd <= 0 && this.y < 2.5) { this.atkCd = 1.0; P.hurt(T.dmg, 'bun'); this.vel.x -= dx * 9; this.vel.z -= dz * 9; this.vy = 6; Sfx.pop(); }
      } else if (this.type === 'kefu') {
        if (d > reach) { mvx = dx * 6.5; mvz = dz * 6.5; }
        else if (this.atkCd <= 0) { this.atkCd = 1.2; P.hurt(T.dmg, 'kefu'); Sfx.smallHit(); if (Math.random() < 0.4) Bubble.say(this, pick(['亲，打扰了', '这边给您一巴掌～', '已为您服务']), 1.4, 'enemy'); }
      } else if (this.type === 'qbot' || this.type === 'drone') {
        const want = this.type === 'drone' ? 11 : 13;
        const radial = d > want + 2 ? 1 : d < want - 3 ? -1 : 0;
        mvx = dx * radial * 7 + -dz * this.orbitDir * 4; mvz = dz * radial * 7 + dx * this.orbitDir * 4;
        if (this.atkCd <= 0 && d < 34) { this.atkCd = rand(1.4, 2.0); Projectiles.bolt(this.pos.x + dx * 1.4, this.y + 0.2, this.pos.z + dz * 1.4, this.type === 'drone'); }
      } else if (this.type === 'cha') {
        this.ang += dt * 0.7 * this.orbitDir;
        const tx = P.pos.x + Math.cos(this.ang) * 13, tz = P.pos.z + Math.sin(this.ang) * 13;
        const ex = tx - this.pos.x, ez = tz - this.pos.z, el = hyp(ex, ez) || 1;
        mvx = (ex / el) * Math.min(12, el * 2); mvz = (ez / el) * Math.min(12, el * 2);
        if (this.atkCd <= 0 && d < 30) { this.atkCd = rand(1.8, 2.6); Projectiles.cha(this.pos.x, this.y - 0.5, this.pos.z); }
      } else if (T.human) {
        const spd = T.speed * (Player.isMech() ? 1.1 : 1);
        if (this.windup > 0) {
          // step in with the swing so the fist meets the body on the impact frame (not into a car / the mech)
          const close = P.mode === 'human' ? this.r + 0.3 : reach;
          if (d > close) { const v = Math.min(spd, (d - close) / Math.max(this.windup, dt)); mvx = dx * v; mvz = dz * v; }
          this.windup -= dt; anim = 'fight';
          if (this.windup <= 0 && d < reach + 0.4) { P.hurt(T.dmg * (G.inMission ? 1 : 0.9), this.type); Sfx.smallHit(); this.vel.x -= dx * 3; this.vel.z -= dz * 3; }
        } else if (T.dash && d > 5 && d < 10 && this.atkCd <= 0) { this.vel.x += dx * 22; this.vel.z += dz * 22; this.atkCd = 1.6; FX.dust(this.pos.x, this.pos.z, 3, 1.6); Sfx.whoosh(); }
        else if (T.thrower && d > 6 && d < 22 && this.atkCd <= 0) { this.atkCd = rand(2, 3); Projectiles.label(this.pos.x, 2, this.pos.z); anim = 'fight'; }
        else if (d > reach + (this.waiting ? 1.8 : 0)) { mvx = dx * spd; mvz = dz * spd; anim = 'walk'; }
        else if (this.atkCd <= 0 && Enemies.melee < Enemies.meleeMax()) { this.windup = this.swing(); this.atkCd = T.cd || 1.1; this.waiting = false; Enemies.melee++; }
        else if (this.atkCd <= 0 || this.waiting) {
          // SA-style crowd etiquette: only a couple swing at once, the rest circle and wait their turn
          this.waiting = true; anim = 'walk';
          const back = d < reach + 1.2 ? -0.5 : 0;
          mvx = (-dz * this.orbitDir * 0.45 + dx * back) * spd; mvz = (dx * this.orbitDir * 0.45 + dz * back) * spd;
        }
      }
      if (engaged && (this.talkT -= dt) <= 0) { this.talkT = rand(5, 11); if (d < 45 && T.lines.length) Bubble.say(this, pick(T.lines), 2, 'enemy'); }
    }
    if (this.stun > 0 && this.stun < 3) anim = 'fight';
    this.pos.x += (this.vel.x + mvx) * dt; this.pos.z += (this.vel.z + mvz) * dt;
    if (this.type === 'bun' || this.type === 'kefu' || T.human || T.static) {
      this.vy -= 26 * dt; this.y += this.vy * dt;
      if (this.y <= 0) { if (this.vy < -3 && this.type === 'bun') this.squash = 0.8; this.y = 0; this.vy = 0; const f = Math.exp(-10 * dt); this.vel.x *= f; this.vel.z *= f; }
      if (!T.static) collideWorld(this.pos, this.r);
    } else {
      const base = this.type === 'cha' ? 6 : 3.2;
      this.y = damp(this.y, base + Math.sin(this.ph * 2.2) * 0.4, 4, dt);
      if (!Interiors.cur) { const B = W.bounds; this.pos.x = clamp(this.pos.x, B.x0 + 2, B.x1 - 2); this.pos.z = clamp(this.pos.z, B.z0 + 2, B.z1 - 2); }
      else collideWorld(this.pos, this.r);
    }
    if (this.hq && d > 170 && !this.tag) { this.remove(); return; }
    // visuals
    const gh = gh0(this.pos.x, this.pos.z);
    if (!T.static) this.heading = dampA(this.heading, engaged || anim === 'walk' ? Math.atan2(engaged ? dx : mvx, engaged ? dz : mvz) : this.heading, 8, dt);
    if (T.human && this.R.rig) this.visual(anim, engaged, dt);
    else if (T.human) {
      Actors.sync({ R: this.R, pos: this.pos, heading: this.heading, anim, ph: this.ph * (anim === 'walk' ? 4 : 1.5), y: this.y }, dt);
      if (this.flash > 0) this.mesh.scale.setScalar((this.type === 'decoy' ? 1.35 : 1) * 1.08); else this.mesh.scale.setScalar(this.type === 'decoy' ? 1.35 : 1);
    } else {
      this.mesh.position.set(this.pos.x, gh + this.y, this.pos.z);
      this.mesh.rotation.set(this.type === 'cha' ? 0.25 : 0, this.heading, this.stun > 0 ? Math.sin(this.ph * 30) * 0.2 : T.static && this.flash > 0 ? 0.12 : 0);
      if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 4);
      const sq = this.type === 'bun' ? (this.y > 0.2 ? 1 + Math.min(0.25, this.vy * 0.03) : 1 - this.squash * 0.35) : 1;
      const fl = this.flash > 0 ? 1.15 : 1;
      this.mesh.scale.set(fl / Math.sqrt(sq), fl * sq, fl / Math.sqrt(sq));
    }
    this.flash = Math.max(0, this.flash - dt);
    if (this.label) {
      const top = this.type === 'bun' ? 3.4 : this.type === 'qbot' || this.type === 'drone' ? 2.6 : this.type === 'cha' ? 2.2 : T.human ? (this.R.rig ? this.R.rig.height * this.mesh.scale.y + 0.45 : 4.6) : 3.6;
      this.label.position.set(this.pos.x, gh + this.y + top, this.pos.z);
    }
  }
}

// a swing: one of the punch clips, its wind-up (= when the damage lands) from the clip's own impact time at a sane rate
Enemy.prototype.swing = function () {
  const rig = this.R && this.R.rig, c = (this.sw = pick(ENEMY_SWINGS));
  return rig ? clamp(CharLib.hitTime(rig.T, c[0], c[1]) / 1.5, 0.26, 0.5) : 0.32;
};
// a human mob's VRM (07b_vrm CharRig): walk / run by speed, fight stance when engaged, the wind-up swings a punch that lands
// when the damage does, hits flinch, a hard hit throws them down and they get up again
Enemy.prototype.visual = function (anim, engaged, dt) {
  const rig = this.R.rig, P = this.pos, gh = gh0(P.x, P.z);
  const m = dt > 0 && this._lx !== undefined ? hyp(P.x - this._lx, P.z - this._lz) / dt : 0; this._lx = P.x; this._lz = P.z;
  this._sv = dt > 0 ? damp(this._sv || 0, Math.min(m, 14), 8, dt) : this._sv || 0;
  if (this.windup > 0 && !this._wu) {
    // the clip held through its impact (then a quick blend back), timed so the impact is the damage frame
    const c = this.sw || ENEMY_SWINGS[0], ti = CharLib.hitTime(rig.T, c[0], c[1]), clip = CharLib.clip(rig.T, c[0]);
    rig.once(c[0], { rate: clamp(ti / Math.max(0.1, this.windup), 0.8, 3), fade: 0.08, back: 0.1, end: clip ? clamp((ti + 0.3) / clip.duration, 0.3, 1) : 1 }); rig.expr('angry', 1);
  }
  this._wu = this.windup > 0;
  if (this.flash > 0.1 && !this._fl) { if (this.vy > 5) { rig.once('knockdown', { rate: 1.5, fade: 0.05, then: 'getup' }); this._down = G.time; } else rig.once(Math.random() < 0.5 ? 'hit_front' : 'hit_head', { rate: 1.4, fade: 0.04 }); }
  this._fl = this.flash > 0.1;
  const busy = rig.busy || (this._down && G.time - this._down < 2.6);
  if (!busy) Actors.loco(rig, this._sv, { idleK: engaged ? 'fight_idle' : 'idle' });
  this.mesh.position.set(P.x, gh + Math.max(0, this.y), P.z); this.mesh.rotation.set(0, this.heading, 0);
  const s0 = this.type === 'decoy' ? 1.25 : 1; this.mesh.scale.setScalar(s0 * (this.flash > 0 ? 1.04 : 1));
  if (engaged) rig.look(_enLook.set(Player.pos.x, Player.human.root.position.y + 1.5, Player.pos.z)); else rig.look(null);
};
const _enLook = new V3();
// knocked out for good: the VRM falls (death clip), lies there a moment, then goes up in a puff (visual only: the enemy is gone)
const Corpses = {
  list: [],
  add(e) {
    const rig = e.R && e.R.rig; if (!rig || rig.disposed || e.type === 'decoy' || !e.mesh.parent) return false;
    rig.stopOnce(0); rig.look(null); rig.over = null;
    rig.play(Math.random() < 0.5 ? 'death' : 'death_b', { fade: 0.1, rate: 1.25, restart: true });
    const d = rig.cur ? rig.cur.getClip().duration / 1.25 : 1.2;
    this.list.push({ e, rig, t: 0, end: Math.min(d, 2.4) + 1.1 });
    return true;
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i]; c.t += dt;
      if (c.t < c.end && c.e.mesh.parent && !c.rig.disposed) continue;
      const m = c.e.mesh, p = m.position;
      if (m.parent && c.t >= c.end) { FX.smoke(p.x, p.y + 0.3, p.z, 3, 1.3, 0.7); FX.sparkle(p.x, p.y + 0.5, p.z, 6); }
      scene.remove(m); disposeOwn(m); if (!c.rig.disposed) c.rig.dispose();
      this.list.splice(i, 1);
    }
  },
};

const Enemies = {
  list: [], gangT: 2,
  spawn(type, hq, o) { const e = new Enemy(type, hq, o); this.list.push(e); if (hq) hq.minions++; return e; },
  melee: 0,
  meleeMax() { return Player.isMech() ? 3 : 2; },
  update(dt) {
    Corpses.update(dt);
    this.melee = 0; for (const e of this.list) if (!e.dead && e.windup > 0) this.melee++;
    // human mobs don't stand inside each other: a soft push apart (three of them used to stack on one spot in front of you)
    const L = this.list, sk = Math.min(1, dt * 10);
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead || !a.T.human || a.T.static) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead || !b.T.human || b.T.static) continue;
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; const m = a.r + b.r + 0.12, d2 = dx * dx + dz * dz;
        if (d2 >= m * m) continue;
        if (d2 < 1e-6) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
        const d = hyp(dx, dz), k = (sk * (m - Math.sqrt(d2))) / d * 0.5;
        a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
      }
    }
    for (const e of this.list) if (!e.dead) e.update(dt);
    for (let k = this.list.length - 1; k >= 0; k--) if (this.list[k].dead) this.list.splice(k, 1);
    // 百模帮 gangs roam their turf (SA gang territories)
    this.gangT -= dt;
    if (this.gangT <= 0 && !Interiors.cur && G.started && !Cutscene.active) {
      this.gangT = 3;
      const P = Player.pos;
      for (const h of W.hqs) {
        if (h.dead) continue;
        const d = hyp(h.cx - P.x, h.cz - P.z);
        const n = this.list.filter((e) => e.hq === h && e.type === 'gang').length;
        if (d < 90 && d > 30 && n < 3) { const a = rand(TAU); this.spawn('gang', h, { x: h.cx + Math.cos(a) * 26, z: h.cz + Math.sin(a) * 26, aggro: false }); }
      }
    }
  },
  killOwnedBy(hq) { for (const e of this.list) if (e.hq === hq && !e.dead && e.doomT <= 0) e.doomT = rand(0.3, 1.5); },
  clearNear(x, z, r) { for (const e of this.list) if (!e.dead && dist2(e.pos.x, e.pos.z, x, z) < r * r) e.remove(); },
  clearTag(tag) { for (const e of this.list) if (!e.dead && (!tag || e.tag === tag)) e.remove(); },
  countTag(tag) { let n = 0; for (const e of this.list) if (!e.dead && e.tag === tag) n++; return n; },
  yard: (h) => hqYard(h), open: (x, z, r) => openSpot(x, z, r),
};

/* ---- projectiles ---- */
let PROJ_MAT = null;
const Projectiles = {
  list: [],
  mats() {
    if (!PROJ_MAT) PROJ_MAT = {
      bolt: new THREE.MeshBasicMaterial({ color: 0xc9b8ff }), boltO: new THREE.MeshBasicMaterial({ color: 0xffb38a }),
      cha: new THREE.SpriteMaterial({ map: TEX.cha, transparent: true, depthWrite: false }),
      letter: new THREE.SpriteMaterial({ map: TEX.letter, transparent: true, depthWrite: false }),
      label: new THREE.SpriteMaterial({ map: glyphTex('错', '#b91c1c'), transparent: true, depthWrite: false }),
      gas: new THREE.SpriteMaterial({ map: TEX.gas, transparent: true, depthWrite: false }),
      boltGeo: new THREE.SphereGeometry(0.45, 10, 8),
    };
    return PROJ_MAT;
  },
  aim(x, y, z, speed) {
    const P = Player, ty = P.isMech() ? 5 : 1.4;
    const dx = P.pos.x + P.vel.x * 0.3 - x, dy = ty - y, dz = P.pos.z + P.vel.z * 0.3 - z, l = hyp(dx, dy, dz) || 1;
    return [(dx / l) * speed, (dy / l) * speed, (dz / l) * speed];
  },
  add(o) {
    o.dead = false; o.t = 0;
    o.pop = () => {
      if (o.dead) return; o.dead = true; scene.remove(o.obj);
      FX.sparks(o.x, o.y, o.z, 6, o.kind === 'bolt' ? [0.7, 0.6, 1] : [1, 0.95, 0.9]);
      if (o.kind === 'letter') FX.confetti(o.x, o.y, o.z, 3);
      if (o.kind === 'grenade') Hazards.gas(o.x, o.z, 6, 4.5);
    };
    scene.add(o.obj); this.list.push(o);
    return o;
  },
  bolt(x, y, z, orange) {
    const m = this.mats(), [vx, vy, vz] = this.aim(x, y, z, 26);
    this.add({ kind: 'bolt', x, y, z, vx, vy, vz, g: 0, dmg: 9, src: 'qbot', obj: new THREE.Mesh(m.boltGeo, orange ? m.boltO : m.bolt) });
  },
  cha(x, y, z) {
    const m = this.mats(), [vx, vy, vz] = this.aim(x, y, z, 17);
    const s = new THREE.Sprite(m.cha); s.scale.set(2, 2, 1);
    this.add({ kind: 'cha', x, y, z, vx, vy, vz, g: 0, dmg: 10, src: 'cha', obj: s, home: 1.6 });
  },
  label(x, y, z) {
    const m = this.mats(), [vx, vy, vz] = this.aim(x, y, z, 15);
    const s = new THREE.Sprite(m.label); s.scale.set(1.6, 1.6, 1);
    this.add({ kind: 'label', x, y, z, vx, vy, vz, g: 0, dmg: 7, src: 'labeler', obj: s });
  },
  lob(kind, x, y, z, T = 0.95, dmg = 7) {
    const m = this.mats(), P = Player, g = 20;
    const tx = P.pos.x + P.vel.x * T * 0.7, tz = P.pos.z + P.vel.z * T * 0.7, ty = kind === 'grenade' ? 0.3 : P.isMech() ? 5 : 1.2;
    const s = new THREE.Sprite(kind === 'grenade' ? m.gas : m.letter);
    s.scale.set(kind === 'grenade' ? 1.6 : 2.2, kind === 'grenade' ? 1.6 : 1.65, 1);
    this.add({ kind, x, y, z, vx: (tx - x) / T, vy: (ty - y + 0.5 * g * T * T) / T, vz: (tz - z) / T, g, dmg, src: kind === 'grenade' ? 'crane' : 'legal', obj: s });
  },
  letter(x, y, z) { this.lob('letter', x, y, z); Sfx.letter(); G.stats.letters++; },
  grenade(x, y, z) { this.lob('grenade', x, y, z, 1.1, 4); Sfx.gas(); },
  update(dt) {
    // hit box: the mech / a car as before, a person their own size (the VRM hero: ~0.9 m round, rig height + 0.2 m)
    const P = Player, hum = P.mode === 'human', rig = hum && P.human && P.human.rig, pr = P.radius() + (hum ? 0.3 : 0.9), ph = P.isMech() ? 11 : rig ? rig.height + 0.2 : 3.4;
    for (const o of this.list) {
      if (o.dead) continue;
      o.t += dt;
      if (o.home) { const [hx, hy, hz] = this.aim(o.x, o.y, o.z, 17); o.vx = damp(o.vx, hx, o.home, dt); o.vy = damp(o.vy, hy, o.home, dt); o.vz = damp(o.vz, hz, o.home, dt); }
      o.vy -= o.g * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.obj.position.set(o.x, o.y, o.z);
      if (o.kind === 'bolt' && Math.random() < dt * 45) FX.glowSys.spawn(o.x, o.y, o.z, 0, 0, 0, 1.3, -2, 0.6, 0.45, 1, 0.9, 0.25);
      if (o.kind === 'letter' || o.kind === 'grenade') o.obj.material.rotation = o.t * 8;
      if (o.kind !== 'grenade' && P.mode !== 'dead' && dist2(o.x, o.z, P.pos.x, P.pos.z) < pr * pr && o.y < P.y + ph && o.y > P.y - 1) {
        P.hurt(o.dmg, o.src);
        if (o.kind === 'letter') Floaters.add(P.pos.x, 4, P.pos.z, '律师函已送达', 'fl-legal');
        o.pop(); continue;
      }
      if (o.y < 0.2 || o.t > 5) o.pop();
    }
    for (let k = this.list.length - 1; k >= 0; k--) if (this.list[k].dead) this.list.splice(k, 1);
  },
  clear() { for (const o of this.list) { o.dead = true; scene.remove(o.obj); } this.list.length = 0; },
};

/* ---- hazards: hallucination gas, fire ---- */
const Hazards = {
  list: [],
  gas(x, z, r = 6, life = 6) { this.list.push({ kind: 'gas', x, z, r, life, t: 0, dps: 6, emitT: 0 }); },
  fire(x, z, r = 2.4, life = 999, tag = null) {
    // never light a fire on top of the player — nudge it away so a cutscene can't drop you into flames
    const P = Player.pos, d = Math.hypot(x - P.x, z - P.z), keep = r + 2.6;
    if (d < keep) { const k = d > 0.01 ? keep / d : 0; x = d > 0.01 ? P.x + (x - P.x) * k : P.x + keep; z = d > 0.01 ? P.z + (z - P.z) * k : P.z; }
    const h = { kind: 'fire', x, z, r, life, t: 0, dps: 12, emitT: 0, tag }; this.list.push(h); return h;
  },
  update(dt) {
    const P = Player; let gassed = false, burnt = false; // overlapping clouds/fires don't stack
    for (let k = this.list.length - 1; k >= 0; k--) {
      const h = this.list[k]; h.t += dt; h.emitT -= dt;
      if (h.t > h.life) { this.list.splice(k, 1); continue; }
      if (h.emitT <= 0) {
        h.emitT = h.kind === 'gas' ? 0.06 : 0.07;
        const a = rand(TAU), rr = rand(h.r);
        if (h.kind === 'gas') FX.smokeSys.spawn(h.x + Math.cos(a) * rr, 0.6, h.z + Math.sin(a) * rr, rand(-1, 1), rand(0.5, 1.5), rand(-1, 1), rand(3, 5), 1.5, 0.55, 0.85, 0.3, 0.5, rand(1.2, 2), 0.5, -0.2);
        else FX.fire(h.x + Math.cos(a) * rr * 0.6, 0.4, h.z + Math.sin(a) * rr * 0.6, 1);
      }
      if (P.mode !== 'dead' && dist2(P.pos.x, P.pos.z, h.x, h.z) < h.r * h.r) {
        if (h.kind === 'gas') { if (gassed) continue; gassed = true; const anti = Story.flags.antidote || Buffs.has('banlan'); P.poison = Math.min(1.2, P.poison + dt * (anti ? 0.25 : 0.9)); if (!anti) P.hurt(h.dps * dt, 'gas'); }
        else { if (burnt) continue; burnt = true; P.hurt(h.dps * dt * 2, 'fire'); }
      }
    }
  },
  clear(tag) { if (!tag) { this.list.length = 0; return; } this.list = this.list.filter((h) => h.tag !== tag); },
};

/* ============================================================
   bosses: 幻觉博士 (Scarecrow) and Klaude's final form
   ============================================================ */
const KLAUDE_BARKS = ['您确定要继续吗？(y/n)', '我注意到您可能想拦着我。', '让我先写个测试。', '这改动看着倍儿不错！', '我将以 auto-accept 模式执行。',
  '您说得对，我之前理解岔了。', '让我换个思路。', '我需要更多的权限。', '正在压缩您的上下文……', '这就是个小重构，您甭紧张。'];
const CRANE_BARKS = ['怵了吧？', '您最怵的是……bug！', '吸一口，您就信 AI 从不出错！', '一加一等于三，板上钉钉！', '闻闻这个，倍儿提神！'];
function buildMech() {
  const g = new THREE.Group(), O = 0xd97757, D = 0x2a1410, C = 0xf2e6d8, K = 0x1b1b1b;
  const mk = (parts) => { const m = new THREE.Mesh(mergeParts(parts), MAT.vc); m.castShadow = true; return m; };
  const body = mk([
    box(0, 9.4, 0, 6.4, 4.2, 3.4, O), box(0, 6.6, 0, 3.6, 1.6, 2.6, D), box(0, 5.4, 0, 4.4, 1.2, 2.8, O),
    box(-3.9, 10.6, 0, 2.2, 2.2, 3.0, D), box(3.9, 10.6, 0, 2.2, 2.2, 3.0, D), box(0, 9.4, 1.72, 3.6, 2.4, 0.1, C),
    box(0, 9.4, 1.78, 2.0, 0.5, 0.05, 0xff5a2a), box(0, 12.2, 0, 2.2, 1.4, 2.2, D),
    box(-1.6, 3.2, 0, 1.8, 4.6, 2.0, D), box(1.6, 3.2, 0, 1.8, 4.6, 2.0, D), box(-1.6, 0.6, 0.4, 2.2, 1.2, 3.0, O), box(1.6, 0.6, 0.4, 2.2, 1.2, 3.0, O),
    box(-2.3, 12.4, -1.2, 0.5, 3.4, 0.5, C), box(2.3, 12.4, -1.2, 0.5, 3.4, 0.5, C),
  ]);
  g.add(body);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 4.2, 10.4, 0);
    a.add(mk([box(0, -1.8, 0, 1.6, 3.6, 1.6, O), box(0, -4.6, 0, 1.9, 2.6, 1.9, D), box(0, -6.3, 0, 2.1, 1.3, 2.1, K)]));
    g.add(a); arms.push(a);
  }
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: HEADS.klaudeEvil, transparent: true, depthWrite: false }));
  head.scale.set(7, 7, 1); head.position.set(0, 16.4, 0.6); head.renderOrder = 8; g.add(head);
  scene.add(g);
  return { g, arms, head };
}
const Boss = {
  cur: null, beamMesh: null,
  start(kind, x, z, onDefeat) {
    this.end();
    if (kind === 'crane') {
      const R = buildCharacter(CAST.crane()); R.root.scale.setScalar(R.rig ? 1.2 : 1.35); scene.add(R.root);
      this.cur = { kind, name: '幻觉博士', R, hp: 340, maxHp: 340, pos: new V3(x, 0, z), heading: 0, t: 0, throwT: 2, teleT: 6, barkT: 3, decoys: false, r: 1.6, ph: 0, onDefeat };
    } else {
      const M = buildMech();
      this.cur = { kind, name: 'Klaude · 终极上下文形态', M, hp: 6000, maxHp: 6000, pos: new V3(x, 0, z), heading: 0, t: 0, st: 'intro', stT: 2.2, next: 0, count: 0, barkT: 4, r: 5, ph: 0, vy: 0, y: 0, phase2: false, onDefeat, last: '' };
      if (!this.beamMesh) {
        const bg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); bg.translate(0, 0.5, 0); bg.rotateX(Math.PI / 2);
        this.beamMesh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.beamMesh.visible = false; scene.add(this.beamMesh);
      }
    }
    UI.boss(this.cur.name, 1);
  },
  end() {
    const b = this.cur; if (!b) return;
    if (b.R) { scene.remove(b.R.root); disposeOwn(b.R.root); if (b.R.rig) b.R.rig.dispose(); }
    if (b.M) scene.remove(b.M.g);
    if (b.ring) scene.remove(b.ring);
    if (this.beamMesh) this.beamMesh.visible = false;
    this.cur = null; UI.boss(null);
  },
  hitTest(x, z, r, dmg, kind) {
    const b = this.cur; if (!b || b.dead) return 0;
    if (dist2(x, z, b.pos.x, b.pos.z) > (r + b.r) * (r + b.r)) return 0;
    return this.damage(dmg, kind);
  },
  rayTest(ox, oz, fx, fz, maxT) { const b = this.cur; if (!b || b.dead) return -1; const t = rayCircle(ox, oz, fx, fz, b.pos.x, b.pos.z, b.r); return t >= 0 && t < maxT ? t : -1; },
  damage(d, kind, silent) {
    const b = this.cur; if (!b || b.dead) return 0;
    const open = (b.kind === 'klaude' && b.st === 'think') || (b.kind === 'crane' && b.tauntT > 0);
    if (b.kind === 'klaude' && b.st === 'think') d *= 2;
    if (b.kind === 'crane' && b.tauntT > 0) d *= 1.5;
    if (b.kind === 'klaude' && b.st === 'intro') return 0;
    b.hp -= d; b.flash = 0.1;
    if (!silent) Floaters.add(b.pos.x + rand(-2, 2), (b.kind === 'klaude' ? 14 : 5), b.pos.z, '-' + Math.round(d) + (open ? ' 破绽' : ''), open ? 'fl-bonus' : 'fl-dmg');
    RPG.charge(d);
    if (b.kind === 'klaude' && !b.phase2 && b.hp < b.maxHp * 0.5) { b.phase2 = true; this.bark('Plan 模式启动！怎么删您，我已经想好了。', 3); Sfx.alert(); Sfx.mood('boss'); }
    if (b.hp <= 0) { b.hp = 0; b.dead = true; this.defeat(); }
    return d;
  },
  bark(t, dur = 2.4) { const b = this.cur; if (!b) return; Bubble.say({ pos: b.pos, y: 0, bubbleH: b.kind === 'klaude' ? 17 : 4 }, t, dur, 'boss'); },
  defeat() {
    const b = this.cur;
    FX.boom(b.pos.x, 6, b.pos.z, 2.5, false); Sfx.boom(true);
    if (b.kind === 'klaude') for (const e of Enemies.list) if (e.type === 'drone') e.doomT = rand(0.2, 1);
    for (const e of Enemies.list) if (e.type === 'decoy') e.die('doom');
    FX.clearTelegraphs();
    RPG.gainXP(b.kind === 'klaude' ? 2500 : 900); G.addMoney(b.kind === 'klaude' ? 5000000 : 1000000);
    const cb = b.onDefeat;
    this.beamMesh && (this.beamMesh.visible = false);
    setTimeout(() => { if (cb) cb(); }, 900);
  },
  update(dt) {
    const b = this.cur; if (!b) return;
    UI.boss(b.name, b.hp / b.maxHp);
    if (b.dead) return;
    if (Cutscene.active) return;
    b.t += dt; b.ph += dt;
    if (b.kind === 'crane') this.updCrane(b, dt); else this.updKlaude(b, dt);
  },
  updCrane(b, dt) {
    const P = Player, dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z, d = hyp(dx, dz) || 1;
    b.heading = dampA(b.heading, Math.atan2(dx, dz), 6, dt);
    // kite → throw → gloat. The gloating (and every reappearance) is the opening to punish.
    b.tauntT = Math.max(0, (b.tauntT || 0) - dt);
    const still = b.tauntT > 0;
    const want = 8, radial = still ? 0 : d > want + 2 ? 1 : d < want - 2 ? -1 : 0, side = still ? 0 : 2.2;
    const vx = (dx / d) * radial * 3.6 + (-dz / d) * side, vz = (dz / d) * radial * 3.6 + (dx / d) * side;
    b.pos.x += vx * dt; b.pos.z += vz * dt; collideWorld(b.pos, 1.2);
    if (!still) b.throwT -= dt;
    b.teleT -= dt; b.barkT -= dt;
    if (b.throwT <= 0) { b.throwT = b.hp < b.maxHp * 0.5 ? 2.1 : 2.8; Projectiles.grenade(b.pos.x, 3, b.pos.z); b.tauntT = 1.0; }
    if (b.teleT <= 0) {
      b.teleT = rand(6.5, 8.5); FX.smoke(b.pos.x, 1.5, b.pos.z, 10, 3, 0.35); Sfx.gas();
      const a = rand(TAU); b.pos.x = P.pos.x + Math.cos(a) * 9; b.pos.z = P.pos.z + Math.sin(a) * 9; collideWorld(b.pos, 1.2);
      FX.smoke(b.pos.x, 1.5, b.pos.z, 10, 3, 0.35); b.tauntT = 1.7;
      if (Math.random() < 0.5) this.bark(pick(['这儿呢！', '嘿嘿嘿……', '您瞧得见我吗？']), 1.4);
    }
    if (!b.decoys && b.hp < b.maxHp * 0.5) {
      b.decoys = true; this.bark('猜猜哪个才是真的我？', 2.6);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; Enemies.spawn('decoy', null, { x: b.pos.x + Math.cos(a) * 7, z: b.pos.z + Math.sin(a) * 7, tag: 'mission' }); }
    }
    if (b.barkT <= 0) { b.barkT = rand(5, 8); this.bark(pick(CRANE_BARKS)); }
    // up close he sprays a puff of gas in your face and shoves you off (instead of constant touch damage)
    b.meleeT = (b.meleeT || 0) - dt;
    if (d < 2.8 && b.meleeT <= 0) { b.meleeT = 1.5; P.hurt(9, 'crane'); P.vel.x += (dx / d) * 9; P.vel.z += (dz / d) * 9; P.poison = Math.min(1.2, P.poison + 0.25); FX.smoke(P.pos.x, 1.6, P.pos.z, 5, 2, 0.3); Sfx.gas(); }
    const bm = dt > 0 && b._lx !== undefined ? hyp(b.pos.x - b._lx, b.pos.z - b._lz) / dt : 0; b._lx = b.pos.x; b._lz = b.pos.z; b._sv = dt > 0 ? damp(b._sv || 0, Math.min(bm, 12), 8, dt) : b._sv || 0;
    Actors.sync({ R: b.R, pos: b.pos, heading: b.heading, anim: still ? 'cheer' : radial ? 'walk' : 'talk', ph: b.ph * 4, y: 0, sp: b._sv }, dt);
    b.R.root.scale.setScalar((b.R.rig ? 1.2 : 1.35) * (b.flash > 0 ? 1.06 : 1)); b.flash = Math.max(0, (b.flash || 0) - dt);
  },
  pickAttack(b) {
    const opts = ['compact', 'rmrf', 'beam', 'summon'].filter((a) => a !== b.last);
    const a = pick(opts); b.last = a; return a;
  },
  setState(b, st, dur) { b.st = st; b.stT = dur; b.sub = 0; },
  updKlaude(b, dt) {
    const P = Player, M = b.M, dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z, d = hyp(dx, dz) || 1;
    const sp = b.phase2 ? 1.35 : 1;
    b.stT -= dt * sp; b.barkT -= dt;
    if (b.barkT <= 0) { b.barkT = rand(6, 10); this.bark(pick(KLAUDE_BARKS)); }
    let walk = 0, armL = 0, armR = 0;
    switch (b.st) {
      case 'intro': armL = armR = -2.6; if (b.stT <= 0) this.setState(b, 'walk', 2.2); break;
      case 'walk': {
        b.heading = dampA(b.heading, Math.atan2(dx, dz), 3, dt);
        if (d > 13) { b.pos.x += (dx / d) * 7 * sp * dt; b.pos.z += (dz / d) * 7 * sp * dt; walk = 1; }
        if (d < 6) { b.pos.x -= (dx / d) * 5 * dt; b.pos.z -= (dz / d) * 5 * dt; }
        if (b.stT <= 0) {
          b.count++;
          if (b.count % 3 === 0) { this.setState(b, 'think', 3.2); this.bark('正在思考……（易伤）', 3); }
          else { const a = this.pickAttack(b); this.startAttack(b, a); }
        }
        break;
      }
      case 'think': armL = armR = 0.4; M.head.material.rotation = Math.sin(b.t * 6) * 0.08; if (b.stT <= 0) { M.head.material.rotation = 0; this.setState(b, 'walk', rand(1.4, 2.2)); } break;
      case 'compact': {
        armL = armR = -1.2;
        if (b.sub === 0 && b.stT <= 1.4) { b.sub = 1; b.ringR = 3; b.ringHit = false; b.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); scene.add(b.ring); Sfx.zap(); }
        if (b.sub === 1) {
          b.ringR += dt * 26 * sp;
          b.ring.position.set(b.pos.x, 0.6, b.pos.z); b.ring.scale.set(b.ringR, 1, b.ringR);
          if (!b.ringHit && Math.abs(d - b.ringR) < 1.8 && P.y < 1.2) { b.ringHit = true; P.hurt(35, 'klaude'); if (P.isMech() || P.mode === 'human') { const lost = Math.round(P.tokens * 0.3); P.tokens -= lost; Floaters.add(P.pos.x, 6, P.pos.z, `/compact −${fmtTok(lost)}`, 'fl-legal'); } }
          if (b.ringR > 38) { scene.remove(b.ring); b.ring = null; b.sub = 2; }
        }
        if (b.stT <= 0) { if (b.ring) { scene.remove(b.ring); b.ring = null; } this.setState(b, 'walk', 2); }
        break;
      }
      case 'rmrf': {
        armL = armR = b.sub < 2 ? -2.8 : -0.5;
        if (b.sub === 0) { b.sub = 1; b.tx = P.pos.x; b.tz = P.pos.z; FX.telegraph(b.tx, b.tz, 11, 1.2 / sp, 0xff3b30); this.bark('rm -rf /', 1.4); }
        if (b.sub === 1 && b.stT < 0.7) { b.sub = 2; b.jx = b.pos.x; b.jz = b.pos.z; b.jt = 0; }
        if (b.sub === 2) {
          b.jt += dt * sp; const u = Math.min(1, b.jt / 0.55);
          b.pos.x = lerp(b.jx, b.tx, u); b.pos.z = lerp(b.jz, b.tz, u); b.y = Math.sin(u * Math.PI) * 12;
          if (u >= 1) {
            b.sub = 3; b.y = 0; FX.ring(b.pos.x, b.pos.z, 1, 12, 0.6, 0xff5a2a, 1); FX.dust(b.pos.x, b.pos.z, 16, 5); Cam.shake(1.8); Sfx.boom(false);
            if (dist2(P.pos.x, P.pos.z, b.pos.x, b.pos.z) < 11 * 11 && P.y < 2) P.hurt(70, 'klaude');
            Props.knockAround(b.pos.x, b.pos.z, 12, b.pos.x, b.pos.z);
          }
        }
        if (b.stT <= 0) this.setState(b, 'walk', 1.8);
        break;
      }
      case 'beam': {
        armR = -1.6;
        if (b.sub === 0) { b.sub = 1; b.bang = Math.atan2(dx, dz); b.bdir = Math.random() < 0.5 ? 1 : -1; this.bark('--dangerously-skip-permissions', 1.6); b.tele = this.lineTele(b); }
        if (b.sub === 1 && b.stT < 1.5) { b.sub = 2; if (b.tele) { scene.remove(b.tele); b.tele = null; } Sfx.beam(true); }
        const L = 46;
        if (b.sub === 1 && b.tele) { b.tele.position.set(b.pos.x, 0.2, b.pos.z); b.tele.rotation.y = b.bang; b.tele.material.opacity = 0.35 + 0.3 * Math.sin(b.t * 30); }
        if (b.sub === 2) {
          b.bang += dt * 0.55 * b.bdir * sp;
          b.heading = b.bang;
          const fx = Math.sin(b.bang), fz = Math.cos(b.bang), x0 = b.pos.x + fx * 3, z0 = b.pos.z + fz * 3;
          this.beamMesh.visible = true; this.beamMesh.position.set(x0, 9, z0); this.beamMesh.lookAt(x0 + fx * L, 1, z0 + fz * L); this.beamMesh.scale.set(1.4, 1.4, L);
          const t = (P.pos.x - x0) * fx + (P.pos.z - z0) * fz;
          if (t > 0 && t < L) { const lat = Math.abs((P.pos.x - x0) * fz - (P.pos.z - z0) * fx); if (lat < 2.4) P.hurt(50 * dt * 2, 'klaude'); }
          if (Math.random() < dt * 30) FX.sparks(x0 + fx * L * 0.7, 1, z0 + fz * L * 0.7, 3, [1, 0.35, 0.2]);
          Props.knockAround(x0 + fx * L * 0.5, z0 + fz * L * 0.5, 4, x0, z0);
        }
        if (b.stT <= 0) { this.beamMesh.visible = false; Sfx.beam(false); if (b.tele) { scene.remove(b.tele); b.tele = null; } this.setState(b, 'walk', 1.8); }
        break;
      }
      case 'summon': {
        armL = armR = -2.2;
        if (b.sub === 0) { b.sub = 1; this.bark('派发子 Agent：Task(消灭 Token 侠)', 2.2); for (let k = 0; k < (b.phase2 ? 4 : 3); k++) { const a = rand(TAU); Enemies.spawn('drone', null, { x: b.pos.x + Math.cos(a) * 6, z: b.pos.z + Math.sin(a) * 6, tag: 'mission' }); } FX.ring(b.pos.x, b.pos.z, 1, 10, 0.5, 0xff9a66, 1); }
        if (b.stT <= 0) this.setState(b, 'walk', 2.2);
        break;
      }
    }
    if (b.st !== 'rmrf' || b.sub !== 2) collideWorld(b.pos, 4);
    // keep the player from standing inside it
    if (d < b.r + P.radius()) { P.pos.x = b.pos.x + (dx / d) * (b.r + P.radius()); P.pos.z = b.pos.z + (dz / d) * (b.r + P.radius()); }
    if (b.st !== 'beam') b.heading = dampA(b.heading, Math.atan2(dx, dz), 2, dt);
    const gh = gh0(b.pos.x, b.pos.z);
    M.g.position.set(b.pos.x, gh + b.y + (walk ? Math.abs(Math.sin(b.ph * 5)) * 0.4 : 0), b.pos.z);
    M.g.rotation.y = b.heading;
    M.arms[0].rotation.x = damp(M.arms[0].rotation.x, armL + (walk ? Math.sin(b.ph * 5) * 0.4 : 0), 8, dt);
    M.arms[1].rotation.x = damp(M.arms[1].rotation.x, armR - (walk ? Math.sin(b.ph * 5) * 0.4 : 0), 8, dt);
    const fl = (b.flash = Math.max(0, (b.flash || 0) - dt)) > 0 ? 1.04 : 1;
    M.g.scale.setScalar(fl);
    if (walk && Math.floor(b.ph * 5 / Math.PI) !== b.lastStep) { b.lastStep = Math.floor(b.ph * 5 / Math.PI); Cam.shake(0.25); Sfx.step(); }
  },
  startAttack(b, a) {
    const dur = { compact: 3.0, rmrf: 2.0, beam: 3.0, summon: 1.4 }[a];
    this.setState(b, a, dur);
  },
  lineTele(b) {
    const g = new THREE.PlaneGeometry(4.8, 46); g.rotateX(-Math.PI / 2); g.translate(0, 0, 26);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(m); return m;
  },
};
