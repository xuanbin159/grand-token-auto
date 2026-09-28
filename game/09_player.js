/* ============================================================
   player: human ↔ car ↔ Token 金刚 (robot) ↔ truck
   plus Combat (all damage dealing) and specialisation ultimates
   ============================================================ */
const ATK = {
  // on foot (the 1.8 m VRM hero, arm ~0.65 m): the hit circle sits just past the fist / foot, a little generous so a swing at a
  // body in front lands, one at thin air a body-length off doesn't (human foes r 0.42: punch lands to ~1.8 m, kick ~1.9 m)
  h_punch: { dur: 0.3, hit: 0.11, reach: 0.6, rad: 0.75, dmg: 11, kind: 'punch', anim: 'punchR', knock: 3 },
  h_kick: { dur: 0.42, hit: 0.18, reach: 0.7, rad: 0.8, dmg: 15, kind: 'kick', anim: 'kick', knock: 6 },
  r_punchR: { dur: 0.3, hit: 0.1, reach: 4.8, rad: 3.5, dmg: 55, kind: 'punch', anim: 'punchR', knock: 20, up: 7 },
  r_punchL: { dur: 0.3, hit: 0.1, reach: 4.8, rad: 3.5, dmg: 55, kind: 'punch', anim: 'punchL', knock: 20, up: 7 },
  r_upper: { dur: 0.48, hit: 0.19, reach: 4.6, rad: 3.9, dmg: 105, kind: 'punch', anim: 'upper', knock: 16, up: 22, heavy: true },
  r_spin: { dur: 0.55, hit: 0.24, reach: 1.5, rad: 6.2, dmg: 125, kind: 'punch', anim: 'spin', knock: 30, up: 12, heavy: true },
  r_kick: { dur: 0.5, hit: 0.2, reach: 5.7, rad: 3.9, dmg: 95, kind: 'kick', anim: 'kick', knock: 34, up: 9, heavy: true },
  u_flurry: { dur: 0.1, hit: 0.02, reach: 5.2, rad: 4.8, dmg: 48, kind: 'punch', anim: 'punchR', knock: 10, up: 5 },
};
const norm2 = (x, z) => { const l = hyp(x, z) || 1; return [x / l, z / l]; };
function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const lx = cx - ox, lz = cz - oz, t = lx * dx + lz * dz;
  if (t < 0) return -1;
  const d2 = lx * lx + lz * lz - t * t;
  if (d2 > r * r) return -1;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}
// on foot: WASD / stick are camera-relative — "up" walks where the camera looks. Returns world [x, z, amount] (reused array)
const _mv = [0, 0, 0], _exitV = new V3();
function moveInput() {
  let x = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0);
  let y = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
  if (Input.joy.on && !Input.lock) { x += Input.joy.x; y -= Input.joy.y; }
  const l = hyp(x, y);
  if (l > 1) { x /= l; y /= l; }
  const fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw);
  _mv[0] = fx * y - fz * x; _mv[1] = fz * y + fx * x; _mv[2] = Math.min(1, l);
  return _mv;
}
// driving: keys stay tank-style (W gas, S brake / reverse, A/D steer). The stick means "drive toward that spot on screen":
// up = along the camera, sideways = turn that way, pulled back (toward the car's tail) = brake and reverse.
// The chase cam trails the car in turns, so "back" is read off the stick itself, not only the angle: no endless circling
const _vin = { thr: 0, steer: 0, hand: false, boost: false };
function vehicleInput(heading) {
  let thr = (kd('KeyW', 'ArrowUp') ? 1 : 0) - (kd('KeyS', 'ArrowDown') ? 1 : 0);
  let steer = (kd('KeyA', 'ArrowLeft') ? 1 : 0) - (kd('KeyD', 'ArrowRight') ? 1 : 0);
  if (Input.joy.on && !Input.lock) {
    const jx = Input.joy.x, jy = Input.joy.y, m = Math.min(1, hyp(jx, jy));
    if (m > 0.18) {
      const fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw);
      const want = Math.atan2(-fx * jy - fz * jx, -fz * jy + fx * jx), diff = angDiff(heading, want);
      if (Math.abs(diff) > 1.6 && jy > 0.3 && jy > Math.abs(jx) * 0.75) { thr = -m; steer = clamp(-jx * 1.4, -1, 1); }
      else { thr = m * (Math.abs(diff) < 1.6 ? 1 : 0.55); steer = clamp(diff * 2.2, -1, 1); }
    }
  }
  _vin.thr = thr; _vin.steer = steer; _vin.hand = kd('Space'); _vin.boost = kd('ShiftLeft', 'ShiftRight');
  return _vin;
}

const Combat = {
  strike(def) {
    const P = Player, mech = P.isMech();
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const cx = P.pos.x + fx * def.reach, cz = P.pos.z + fz * def.reach, r = def.rad;
    const mul = mech ? RPG.m.robotMelee : RPG.m.humanMelee;
    let hits = 0, dealt = 0;
    for (const hq of W.hqs) {
      if (hq.dead || Interiors.cur) continue;
      const s = hq.solid, qx = clamp(cx, s.x0, s.x1), qz = clamp(cz, s.z0, s.z1);
      if (dist2(cx, cz, qx, qz) > r * r) continue;
      let dmg = mech ? def.dmg * mul : (RPG.equip.hand ? 3 : 1), bonus = '';
      if (mech && hq.bonus === def.kind) { dmg *= 2; bonus = def.kind === 'punch' ? '拳打×2' : '脚踢×2'; }
      hq.damage(dmg, qx, qz, def.kind, bonus); hits++; dealt += dmg;
      if (!mech && Math.random() < 0.6) Bubble.say(P, pick(['哎哟，手疼……', '先吃 Token 变身啊您！', '人肉攻击：伤害 1', '这楼比我还硬']), 1.6, 'me');
    }
    for (const s of solidsNear(cx, cz, r)) {
      if (s.kind === 'hq') continue;
      const qx = clamp(cx, s.x0, s.x1), qz = clamp(cz, s.z0, s.z1);
      if (dist2(cx, cz, qx, qz) < r * r) { FX.sparks(qx, rand(2, 5), qz, mech ? 10 : 3); if (mech) FX.chunks(qx, rand(2, 6), qz, 4, [0xb8b2a7, 0x8a8f96]); hits++; }
    }
    if (!Interiors.cur) for (const c of Cars.list) {
      if (c.removed || c === P.car || c.state === 'held' || c.state === 'thrown') continue;
      if (dist2(cx, cz, c.pos.x, c.pos.z) > (r + 1.6) * (r + 1.6)) continue;
      const [nx, nz] = norm2(c.pos.x - P.pos.x, c.pos.z - P.pos.z);
      if (mech) c.knock(nx * def.knock * 1.3, (def.up || 6) + 4, nz * def.knock * 1.3, def.dmg * 0.8 * mul);
      else { c.damage(def.dmg * 0.25 * mul); if (Math.random() < 0.3) Bubble.say(P, '这车够瓷实的', 1.2, 'me'); }
      hits++; G.crime(0.04);
    }
    for (const e of Enemies.list) {
      if (e.dead) continue;
      if (dist2(cx, cz, e.pos.x, e.pos.z) > (r + e.r) * (r + e.r)) continue;
      const [nx, nz] = norm2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      const d = def.dmg * mul;
      e.hit(d, nx * def.knock, nz * def.knock, def.up || 4, def.kind); dealt += d;
      hits++;
    }
    // passers-by: they go down and 爆金币
    if (!Interiors.cur) for (const pd of Peds.list) {
      if (pd.state === 'down' && pd.t > 0.4 && !mech) continue;
      if (dist2(cx, cz, pd.pos.x, pd.pos.z) > (r + 0.45) * (r + 0.45)) continue;
      const [nx, nz] = norm2(pd.pos.x - P.pos.x, pd.pos.z - P.pos.z), k = (mech ? 18 : def.kind === 'kick' ? 9 : 6.5) * (RPG.m.knock || 1);
      const coins = pd.hit(nx * k, nz * k, mech || def.kind === 'kick');
      hits++; G.crime(mech ? 0.04 : 0.1);
      if (coins) {
        const crit = Math.random() < 0.08 + (RPG.m.coinRate - 1) * 0.04;
        Coins.burst(pd.pos.x, 1.5, pd.pos.z, (mech ? 10 : def.kind === 'kick' ? 7 : 5) * (crit ? 2 : 1), rand(25, 80) * (mech ? 1.6 : 1), { big: crit });
        if (crit) { Floaters.add(pd.pos.x, 3.6, pd.pos.z, '暴击！爆金币', 'fl-bonus'); Cam.shake(0.3); }
      }
    }
    for (const pr of Projectiles.list) if (!pr.dead && pr.y < 10 && dist2(cx, cz, pr.x, pr.z) < (r + 1.2) * (r + 1.2)) { pr.pop(); hits++; }
    if (Boss.cur) { const d = Boss.hitTest(cx, cz, r, def.dmg * mul, def.kind); if (d) { hits++; dealt += d; } }
    if (Monorail.hitTest) { const d = Monorail.hitTest(cx, cz, r + 1, def.dmg * mul * (mech ? 1 : 0.1)); if (d) { hits++; dealt += d; } }
    if (mech) Props.knockAround(cx, cz, r, P.pos.x, P.pos.z);
    if (hits) {
      RPG.charge(dealt);
      if (mech && RPG.m.brawlerHeal) P.addTokens(5000, true);
      G.hitstop(def.heavy ? 0.085 : mech ? 0.05 : 0.03);
      Cam.shake(mech ? (def.heavy ? 0.9 : 0.5) : 0.12); Input.buzz(mech ? 24 : 14);
      if (mech) (def.kind === 'kick' ? Sfx.kick() : Sfx.punch()); else Sfx.smallHit();
      FX.ring(cx, cz, 0.5, mech ? 4.5 : 1.4, 0.25, 0xffe0a0, 0.8, mech ? 3 : 1.2);
    } else Sfx.whoosh();
    return hits;
  },
  explosion(x, z, r, dmg, src) {
    if (!Interiors.cur) {
      for (const hq of W.hqs) {
        if (hq.dead) continue;
        const s = hq.solid, qx = clamp(x, s.x0, s.x1), qz = clamp(z, s.z0, s.z1), d = hyp(x - qx, z - qz);
        if (d < r) hq.damage(dmg * (1 - (d / r) * 0.5), qx, qz, 'boom', src === 'throw' ? '砸车!' : '');
      }
      for (const c of Cars.list) {
        if (c.removed || c.state === 'held' || c.state === 'thrown' || c === Player.car) continue;
        const d = hyp(c.pos.x - x, c.pos.z - z);
        if (d < r && d > 0.01) { const f = 1 - d / r; c.knock(((c.pos.x - x) / d) * 18 * f, 10 * f + 4, ((c.pos.z - z) / d) * 18 * f, dmg * 0.55 * f); }
      }
    }
    for (const e of Enemies.list) {
      if (e.dead) continue;
      const d = hyp(e.pos.x - x, e.pos.z - z);
      if (d < r) { const f = 1 - d / r, l = d || 1; e.hit(dmg * f, ((e.pos.x - x) / l) * 16 * f, ((e.pos.z - z) / l) * 16 * f, 10 * f, 'boom'); }
    }
    if (Boss.cur && src !== 'boss') Boss.hitTest(x, z, r, dmg * 0.6, 'boom');
    Monorail.hitTest && Monorail.hitTest(x, z, r, dmg);
    const dp = hyp(Player.pos.x - x, Player.pos.z - z);
    if (dp < r * 0.85 && src !== 'throw' && src !== 'slam') Player.hurt(dmg * 0.16 * (1 - dp / r), 'boom');
    Props.knockAround(x, z, r * 0.8, x, z);
    if (!Interiors.cur) Peds.panicAround(x, z, r * 3, 4);
  },
  slam(x, z) {
    const R = 14 * RPG.m.slamR;
    if (!Interiors.cur) {
      for (const hq of W.hqs) {
        if (hq.dead) continue;
        const s = hq.solid, qx = clamp(x, s.x0, s.x1), qz = clamp(z, s.z0, s.z1), d = hyp(x - qx, z - qz);
        if (d < R) hq.damage(150 * RPG.m.robotMelee * (1 - (d / R) * 0.5), qx, qz, 'slam', '砸地!');
      }
      for (const c of Cars.list) {
        if (c.removed || c.state === 'held' || c.state === 'thrown') continue;
        const d = hyp(c.pos.x - x, c.pos.z - z);
        if (d < R) { const f = 1 - d / R, l = d || 1; c.knock(((c.pos.x - x) / l) * 22 * f, 14 * f + 5, ((c.pos.z - z) / l) * 22 * f, 90 * f); }
      }
      Peds.panicAround(x, z, 40, 4);
    }
    for (const e of Enemies.list) {
      if (e.dead) continue;
      const d = hyp(e.pos.x - x, e.pos.z - z);
      if (d < R) { const f = 1 - d / R, l = d || 1; e.hit((130 * f + 20) * RPG.m.robotMelee, ((e.pos.x - x) / l) * 20 * f, ((e.pos.z - z) / l) * 20 * f, 14 * f, 'slam'); }
    }
    if (Boss.cur) Boss.hitTest(x, z, R, 160 * RPG.m.robotMelee, 'slam');
    for (const pr of Projectiles.list) if (!pr.dead && dist2(x, z, pr.x, pr.z) < R * R) pr.pop();
    if (Monorail.hitTest) Monorail.hitTest(x, z, R, 160 * RPG.m.robotMelee);
    Props.knockAround(x, z, R, x, z);
    FX.ring(x, z, 1, R, 0.6, 0xffd070, 1); FX.ring(x, z, 1, R * 0.6, 0.45, 0xffffff, 0.8);
    for (let k = 0; k < 26; k++) { const a = (k / 26) * TAU; FX.smokeSys.spawn(x + Math.cos(a) * 3, 0.8, z + Math.sin(a) * 3, Math.cos(a) * 16, rand(1, 3), Math.sin(a) * 16, rand(3, 5), 3, 0.62, 0.58, 0.52, 0.6, rand(0.8, 1.3), 2.2, 0); }
    FX.chunks(x, 1, z, 10, [0x6d6a66, 0x8a8680, 0x3b3e45]);
    FX.light(x, 3, z, 5, 0xffd080);
    RPG.charge(150);
    Cam.shake(1.6); G.hitstop(0.08); Sfx.boom(false); Sfx.kick();
  },
};

const Player = {
  mode: 'human', pos: new V3(), vel: new V3(), heading: Math.PI, y: 0, vy: 0, onGround: true, speed: 0,
  hp: 100, rhp: 450, tokens: 0, stamina: 100, coffeeT: 0, tired: false, sprintAcc: 0, driveAcc: 0,
  car: null, held: null, holdT: 0, throwT: 0,
  atk: null, queued: null, combo: 0, comboWin: 0,
  invuln: 0, lastHurt: -99, killer: '', gulp: 0,
  xf: null, deadT: 0, ph: 0, lastStep: 0, slam: false, slamLand: 0, beam: false, beamAcc: 0, beamT: 0, rammedT: 0,
  ult: null, human: null, face: null, bubbleH: 0, trailT: 0, poison: 0,
  get maxHp() { return RPG.m.maxHp; }, get rmax() { return RPG.m.maxArmor; },
  init() {
    this.human = buildHuman(RPG.outfit, RPG.equip);
    Robot.build(RPG.paint);
    this.faceMatH = new THREE.SpriteMaterial({ map: TEX.faceEq, transparent: true, depthWrite: false });
    this.faceMatR = new THREE.SpriteMaterial({ map: TEX.helmet, transparent: true, depthWrite: false });
    this.face = new THREE.Sprite(this.faceMatH); this.face.renderOrder = 8; scene.add(this.face);
    this.pos.copy(W.spawn); this.heading = Math.PI; this.hp = this.maxHp; this.rhp = this.rmax;
  },
  rebuildHuman() {
    const vis = this.human.root.visible;
    scene.remove(this.human.root); disposeOwn(this.human.root); if (this.human.rig) this.human.rig.dispose();
    this.human = buildHuman(RPG.outfit, RPG.equip);
    this.human.root.visible = vis;
    this.refreshHead();
    this.syncVisuals(0, 0);
  },
  // hat + glasses live on the head sticker; the HUD portrait follows
  refreshHead() {
    const c = heroHeadCanvas(RPG.equip.head, RPG.equip.face);
    const old = TEX.faceEq; TEX.faceEq = tex(c); HEADS.hero = TEX.faceEq;
    if (this.faceMatH) { this.faceMatH.map = TEX.faceEq; this.faceMatH.needsUpdate = true; }
    if (old) old.dispose();
    const pc = mkCanvas(160, 160); pc.getContext('2d').drawImage(c, 52, 62, 280, 280, 0, 0, 160, 160); UI.portraitH = pc.toDataURL(); UI.last.portrait = null;
    if (HeroFace.look !== 'photo' && CharLib.ready) UI.portraitH = HeroFace.portraitURL();
  },
  radius() { return this.mode === 'robot' ? 2.5 : this.mode === 'truck' ? 2.9 : this.mode === 'car' ? 2.1 : this.mode === 'xform' ? 2.3 : 0.6; },
  pickupR() { return { human: 1.9, car: 3.0, robot: 3.8, truck: 3.6, xform: 3 }[this.mode] || 0; },
  magnetR() { return (this.mode === 'robot' || this.mode === 'truck' ? 10 : this.mode === 'car' ? 4.5 : 3.2) * RPG.m.magnet; },
  canPickup() { return this.mode !== 'dead' && Tokens.enabled; },
  isMech() { return this.mode === 'robot' || this.mode === 'truck' || (this.mode === 'xform' && this.xf && this.xf.to !== 'human'); },
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); if (this.isMech()) this.rhp = Math.min(this.rmax, this.rhp + n * 3); UI.flashHeal(); },
  addTokens(v, quiet) {
    const before = this.tokens, cap = RPG.m.capacity;
    this.tokens = Math.min(cap, this.tokens + v);
    const over = before + v - this.tokens;
    if (over > 0) G.addMoney(over * 0.02);
    if (!quiet) this.gulp = 0.22;
    if (before < CAP && this.tokens >= CAP && (this.mode === 'human' || this.mode === 'car') && Story.flags.transform) {
      UI.big('上下文已满！', IS_TOUCH ? '点「变身」' : '按 T 变身', 'gold', 2.4); Sfx.bigCoin();
    }
  },
  hurt(amount, src = '') {
    if (this.mode === 'dead' || this.mode === 'xform' || this.invuln > 0 || G.over || Cutscene.active) return;
    this.lastHurt = G.time;
    amount *= RPG.m.dmgTaken;
    if (RPG.m.unstop && this.atk) amount *= 0.5;
    if (this.mode === 'robot' || this.mode === 'truck') {
      this.rhp -= amount * 0.4; UI.hurt(0.18);
      if (this.rhp <= 0) { this.rhp = 0; this.revert('装甲被打爆了！'); }
    } else if (this.mode === 'car') { this.car.damage(amount * 0.8); UI.hurt(0.2); }
    else {
      this.hp -= amount;
      if (src === 'gas' || src === 'fire') {
        // damage over time: a steady red pulse instead of a hit reaction every frame
        UI.hurt(0.03); if ((this.dotSfxT = (this.dotSfxT || 0) - 1 / 60) <= 0) { this.dotSfxT = 0.6; Sfx.hurt(); }
      } else { UI.hurt(0.55); Sfx.hurt(); Cam.shake(0.25); }
      if (this.hp <= 0) { this.hp = 0; this.die(src); }
    }
  },
  update(dt, rdt) {
    if (this.invuln > 0) this.invuln -= rdt;
    if (this.gulp > 0) this.gulp = Math.max(0, this.gulp - rdt);
    if (this.coffeeT > 0) this.coffeeT -= dt;
    if (this.poison > 0) { this.poison = Math.max(0, this.poison - dt * 0.12); }
    switch (this.mode) {
      case 'human': this.updHuman(dt); break;
      case 'car': this.updCar(dt); break;
      case 'robot': this.updRobot(dt); break;
      case 'truck': this.updTruck(dt); break;
      case 'xform': this.updXform(dt, rdt); break;
      case 'dead': this.updDead(dt, rdt); break;
    }
    if (this.ult) this.updUlt(dt, rdt);
    if (this.mode !== 'car' && this.mode !== 'truck') Sfx.engine(false, 0);
    if (G.time - this.lastHurt > 4 && !Cutscene.active) {
      if (this.mode === 'human' || this.mode === 'car') this.hp = Math.min(this.maxHp, this.hp + 7 * RPG.m.regen * dt);
      else if (this.mode !== 'dead') this.rhp = Math.min(this.rmax, this.rhp + 10 * dt);
    }
    this.syncVisuals(dt, rdt);
  },
  gravity(dt, g) {
    if (this.onGround) return false;
    this.vy -= g * dt; this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; this.onGround = true; return true; }
    return false;
  },
  pushOutCars(r) {
    if (Interiors.cur) return;
    for (const c of Cars.list) {
      if (c.removed || c.state === 'held' || c.state === 'thrown' || c.y > 1.5) continue;
      const rr = r + c.k.wid * 0.55, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const t = clamp((this.pos.x - c.pos.x) * fx + (this.pos.z - c.pos.z) * fz, -c.k.len * 0.35, c.k.len * 0.35);
      const qx = c.pos.x + fx * t, qz = c.pos.z + fz * t, ex = this.pos.x - qx, ez = this.pos.z - qz, d = hyp(ex, ez);
      if (d < rr && d > 1e-4) { this.pos.x = qx + (ex / d) * rr; this.pos.z = qz + (ez / d) * rr; }
    }
  },
  // ---------------- attacks ----------------
  attackInput(pre) {
    const J = kp('KeyJ'), K = kp('KeyK');
    if (!J && !K) return;
    const type = J ? 'punch' : 'kick';
    if (this.atk) { if (this.atk.t > this.atk.def.dur * 0.35) this.queued = type; return; }
    this.startAttack(pre, type);
  },
  startAttack(pre, type) {
    let key;
    if (pre === 'h') key = type === 'punch' ? 'h_punch' : 'h_kick';
    else if (type === 'kick') { key = 'r_kick'; this.combo = -1; }
    else {
      const len = RPG.m.combo4 ? 4 : 3;
      this.combo = this.comboWin > 0 ? (this.combo + 1) % len : 0;
      key = ['r_punchR', 'r_punchL', 'r_upper', 'r_spin'][this.combo];
    }
    this.atk = { def: ATK[key], t: 0, done: false };
    this.aimAssist(pre === 'h' ? 2 : 9); // on foot: turn to a foe within ~2 m of your reach, not one across the lane
    if (type === 'punch') G.stats.punches++; else G.stats.kicks++;
  },
  // SA-style soft lock: swing toward the nearest foe in reach instead of thin air
  aimAssist(range) {
    const px = this.pos.x, pz = this.pos.z, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let best = null, bs = Infinity;
    const consider = (x, z, r) => {
      const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz) - (r || 0);
      if (d > range) return;
      const front = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      const score = d - front * 1.5; // prefer what we're already facing
      if (score < bs) { bs = score; best = [dx, dz]; }
    };
    for (const e of Enemies.list) if (!e.dead) consider(e.pos.x, e.pos.z, e.T ? e.T.r : 0.8);
    if (Boss.cur && !Boss.cur.dead) consider(Boss.cur.pos.x, Boss.cur.pos.z, Boss.cur.r || 2);
    if (Story.trainFight && Monorail.emitterHp > 0) { const [ex, ez] = Monorail.carPos(1); consider(ex, ez, 3.5); }
    if (!best && !Interiors.cur) for (const pd of Peds.list) if (pd.state !== 'down') consider(pd.pos.x, pd.pos.z, 0.4);
    if (best && (best[0] || best[1])) this.heading = Math.atan2(best[0], best[1]);
  },
  updAttack(dt) {
    const a = this.atk;
    if (!a) { if (this.comboWin > 0) this.comboWin -= dt; return; }
    a.t += dt;
    if (!a.done && a.t >= a.def.hit) {
      a.done = true;
      if (this.isMech()) { this.vel.x += Math.sin(this.heading) * 5; this.vel.z += Math.cos(this.heading) * 5; }
      Combat.strike(a.def);
    }
    if (a.t >= a.def.dur) {
      this.atk = null; this.comboWin = RPG.m.combo4 ? 0.6 : 0.45;
      if (this.queued) { const q = this.queued; this.queued = null; this.startAttack(this.isMech() ? 'r' : 'h', q); }
    }
  },
  // ---------------- modes ----------------
  updHuman(dt) {
    const [mx, mz, ml] = moveInput();
    const wantSprint = kd('ShiftLeft', 'ShiftRight') || (Input.joy.on && ml > 0.92);
    if (this.stamina < 2) this.tired = true; else if (this.stamina > 25) this.tired = false;
    const sprint = wantSprint && ml > 0.3 && !this.tired;
    if (sprint && this.coffeeT <= 0) this.stamina = Math.max(0, this.stamina - (24 / RPG.m.stamina) * dt);
    else this.stamina = Math.min(100, this.stamina + 16 * dt);
    if (sprint) { this.sprintAcc += dt; if (this.sprintAcc > 2) { this.sprintAcc = 0; RPG.train('stamina', 1); } }
    const busy = !!this.atk;
    // sprint ~9.3 m/s: what the sprint clip plants at its top cadence (Actors.loco: rate 2.2); 12.5 needed the widest stride and
    // still skated. Shoes / cap add stride on top, up to 11 m/s
    const spd = busy ? 2 : sprint ? Math.min(11, 9.3 * RPG.m.sprint) : 7.2 * RPG.m.speed;
    this.vel.x = damp(this.vel.x, mx * spd, 12, dt); this.vel.z = damp(this.vel.z, mz * spd, 12, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pushOutCars(0.6); collideWorld(this.pos, 0.6); // walls win: a parked car never shoves you into a house
    if (ml > 0.1 && !busy) this.heading = dampA(this.heading, Math.atan2(mx, mz), 14, dt);
    if (kp('Space') && this.onGround) { this.vy = 7.5 * Math.sqrt(RPG.m.jump); this.onGround = false; Sfx.jump(); }
    this.gravity(dt, 24);
    this.attackInput('h'); this.updAttack(dt);
    if (kp('KeyF', 'KeyE')) { if (Interiors.cur) Interiors.interact(); else if (!Interiors.nearNpc()) this.tryEnter(); }
    if (kp('KeyT')) this.tryTransform();
  },
  carPrm(c) {
    const m = RPG.m, k = c.k;
    const wg = Weather.grip(); // wet / snowy roads: the tyres let go sooner (1 when dry)
    return { maxSpd: k.maxSpd * (1 + (m.grip - 1) * 0.5), accel: k.accel * (0.6 + 0.4 * wg), brake: k.brake * wg, maxRev: k.maxRev, steer: k.steer * m.grip, grip: k.grip * m.grip * wg };
  },
  updCar(dt) {
    const c = this.car;
    if (!c || c.removed) { this.car = null; this.mode = 'human'; this.human.root.visible = true; return; }
    const inp = vehicleInput(c.heading);
    const prm = this.carPrm(c);
    const slip = driveCar(c, inp.thr, inp.steer, inp.hand, dt, prm);
    const h = vehicleWorldCollide(c, 1.1, c.k.len);
    if (h && h.impact > 8) {
      c.damage(h.impact * 0.6); Cam.shake(Math.min(1, h.impact / 25)); Sfx.crash(h.impact);
      FX.sparks(c.pos.x + Math.sin(c.heading) * 2, 1, c.pos.z + Math.cos(c.heading) * 2, 6);
      if (h.b && h.b.hq) h.b.hq.damage(h.impact * 1.2, clamp(c.pos.x, h.b.x0, h.b.x1), clamp(c.pos.z, h.b.z0, h.b.z1), 'car');
    }
    vehicleImpacts(c, c, 2.0, false);
    if (Math.abs(c.speed) > prm.maxSpd * 0.6) { this.driveAcc += dt; if (this.driveAcc > 3) { this.driveAcc = 0; RPG.train('driving', 1); } }
    if (slip > 7 && Math.abs(c.speed) > 10) { this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.05; FX.smoke(c.pos.x - Math.sin(c.heading) * 2, 0.5, c.pos.z - Math.cos(c.heading) * 2, 1, 1.6, 0.65); } }
    this.pos.copy(c.pos); this.heading = c.heading; this.vel.copy(c.vel); this.speed = c.speed;
    c.sync();
    Sfx.engine(true, clamp(Math.abs(c.speed) / c.k.maxSpd, 0, 1));
    if (kp('KeyJ')) Sfx.horn();
    if (kp('KeyF', 'KeyE')) { this.exitCar(); return; }
    if (kp('KeyT')) this.tryTransform();
    Interiors.checkGarage();
  },
  updRobot(dt) {
    const [mx, mz, ml] = moveInput();
    const sprint = kd('ShiftLeft', 'ShiftRight') || (Input.joy.on && ml > 0.92);
    const busy = this.atk || this.held || this.beam || this.slamLand > 0.3 || (this.ult && this.ult.kind === 'brawler');
    let spd = sprint ? 16 : 10.5;
    if (busy) spd *= 0.3;
    if (!this.onGround) spd = 10;
    this.vel.x = damp(this.vel.x, mx * spd, 7, dt); this.vel.z = damp(this.vel.z, mz * spd, 7, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collideWorld(this.pos, 2.5);
    this.shoveCars();
    if (ml > 0.1 && (!busy || this.beam)) this.heading = dampA(this.heading, Math.atan2(mx, mz), this.beam ? 3 : 10, dt);
    else if (this.beam && !Cam.top) this.heading = dampA(this.heading, Cam.yaw, 4, dt); // standing still: the beam goes where you look
    const sp = hyp(this.vel.x, this.vel.z);
    if (this.onGround && sp > 1) {
      this.ph += dt * sp * 0.55;
      const st = Math.floor(this.ph / Math.PI);
      if (st !== this.lastStep) { this.lastStep = st; Sfx.step(); Cam.shake(0.12); FX.dust(this.pos.x, this.pos.z, 2, 2.2); }
    }
    if (!this.held && !this.beam && !this.ult) this.attackInput('r');
    this.updAttack(dt);
    if (kp('Space') && this.onGround && !this.atk && !this.held) this.startSlam();
    if (this.gravity(dt, 40)) this.landed();
    if (this.slamLand > 0) this.slamLand = Math.max(0, this.slamLand - dt * 2.5);
    if (kp('KeyF', 'KeyE')) this.grabOrThrow();
    this.updHeld(dt);
    this.updBeam(dt, kd('KeyL'));
    if (kp('KeyR')) this.startUlt();
    if (kp('KeyQ') && !this.held) { this.stopBeam(); this.startXform('r2h'); UI.hint('解除变身（Token 保留）'); return; }
    if (kp('KeyT') && !this.held && this.onGround) {
      if (!Story.flags.truck) UI.hint('卡车模块还没装呢——找 Kodex 去');
      else { this.stopBeam(); this.startXform('r2t'); return; }
    }
    this.drain(dt, 7000);
  },
  updTruck(dt) {
    const inp = vehicleInput(this.heading);
    const boosting = inp.boost && this.tokens > 0;
    const m = RPG.m;
    TRUCK_PRM.boost = boosting ? m.boostMul : 1;
    const prm = Object.assign({}, TRUCK_PRM, { maxSpd: TRUCK_PRM.maxSpd * m.truckSpeed, grip: TRUCK_PRM.grip * m.grip, steer: TRUCK_PRM.steer * Math.sqrt(m.grip) });
    const slip = driveCar(this, inp.thr, inp.steer, inp.hand, dt, prm);
    const h = vehicleWorldCollide(this, 2.0, 8.6);
    if (this.rammedT > 0) this.rammedT -= dt;
    if (h) {
      if (h.b && h.b.kind === 'hq' && h.impact > 8 && this.rammedT <= 0) {
        this.rammedT = 0.35;
        const fx = Math.sin(this.heading), fz = Math.cos(this.heading), s = h.b;
        const qx = clamp(this.pos.x + fx * 3.5, s.x0, s.x1), qz = clamp(this.pos.z + fz * 3.5, s.z0, s.z1);
        s.hq.damage(h.impact * 5.5 * m.ram, qx, qz, 'ram', '冲撞!');
        Cam.shake(1.3); G.hitstop(0.06); Sfx.crash(30); Sfx.kick(); FX.sparks(qx, 2, qz, 16);
      } else if (h.impact > 12) { Cam.shake(0.6); Sfx.crash(h.impact); FX.sparks(this.pos.x, 1.5, this.pos.z, 8); }
    }
    vehicleImpacts(this, null, 3.0, true);
    if (Boss.cur && Math.abs(this.speed) > 12 && this.rammedT <= 0) { const d = Boss.hitTest(this.pos.x, this.pos.z, 4, Math.abs(this.speed) * 3 * m.ram, 'ram'); if (d) { this.rammedT = 0.5; this.vel.multiplyScalar(-0.4); Cam.shake(1.2); Sfx.crash(30); } }
    if (slip > 7 && Math.abs(this.speed) > 12) { this.trailT -= dt; if (this.trailT <= 0) { this.trailT = 0.05; FX.smoke(this.pos.x - Math.sin(this.heading) * 3.5, 0.6, this.pos.z - Math.cos(this.heading) * 3.5, 1, 2, 0.65); } }
    if (boosting) {
      const bx = this.pos.x - Math.sin(this.heading) * 5.3, bz = this.pos.z - Math.cos(this.heading) * 5.3;
      if (Math.random() < dt * 40) for (const s of [-1, 1]) FX.glowSys.spawn(bx + Math.cos(this.heading) * s * 1.1, 1.4, bz - Math.sin(this.heading) * s * 1.1, -this.vel.x * 0.3 + rand(-1, 1), rand(0, 2), -this.vel.z * 0.3 + rand(-1, 1), rand(1.2, 2), -1.5, 1, 0.55, 0.15, 1, 0.25, 1, 0);
    }
    this.drain(dt, 5000 + (boosting ? 45000 * m.boostCost : 0));
    Sfx.engine(true, clamp(Math.abs(this.speed) / 60, 0, 1));
    if (kp('KeyJ')) Sfx.horn(true);
    if (kp('KeyR')) this.startUlt();
    if (kp('KeyQ')) { this.startXform('r2h'); return; }
    if (kp('KeyT') && this.mode === 'truck') this.startXform('t2r');
    Interiors.checkGarage();
  },
  drain(dt, rate) {
    if (this.mode !== 'robot' && this.mode !== 'truck') return;
    const r = rate * RPG.m.drain * (Story.freeTokens ? 0.15 : 1);
    this.tokens -= r * dt;
    G.stats.burned += r * dt;
    if (this.tokens <= 0) { this.tokens = 0; this.revert('上下文见底儿了！'); }
  },
  spend(amount) {
    if (Math.random() < RPG.m.cache) { Floaters.add(this.pos.x, 9, this.pos.z, '缓存命中', 'fl-line'); return true; }
    if (this.tokens < amount) return false;
    this.tokens -= amount; G.stats.burned += amount; return true;
  },
  shoveCars() {
    if (Interiors.cur) return;
    const sp = hyp(this.vel.x, this.vel.z);
    for (const c of Cars.list) {
      if (c.removed || c.state === 'held' || c.state === 'thrown' || c.y > 2) continue;
      const rr = 2.5 + c.radius * 0.7, dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > rr * rr) continue;
      const d = Math.sqrt(d2) || 0.01;
      if (sp > 4) c.knock((dx / d) * 9 + this.vel.x, 5, (dz / d) * 9 + this.vel.z, 12);
      else { this.pos.x -= (dx / d) * (rr - d); this.pos.z -= (dz / d) * (rr - d); }
    }
  },
  startSlam() {
    const cost = RPG.m.slamCost;
    if (!this.spend(cost)) { UI.hint(`Token 不够砸地了（每次 ${fmtTok(cost)}）`); Sfx.denied(); return; }
    this.vy = 17; this.onGround = false; this.slam = true; Sfx.jumpHeavy();
  },
  landed() {
    if (this.slam) { this.slam = false; this.slamLand = 1; Combat.slam(this.pos.x, this.pos.z); }
    else Sfx.step();
  },
  grabOrThrow() {
    if (this.held) { this.throwHeld(); return; }
    if (Interiors.cur) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let best = null, bd = 8 * 8;
    for (const c of Cars.list) {
      if (c.removed || c.state === 'held' || c.state === 'thrown' || c.y > 2) continue;
      const d = dist2(this.pos.x + fx * 3, this.pos.z + fz * 3, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) { UI.hint('边儿上没车可抓'); return; }
    if (best.hasDriver) best.ejectDriver(false);
    best.state = 'held'; best.fireT = 0; this.held = best; this.holdT = 0;
    Sfx.mech(); G.crime(0.1);
    if (best.kind === 'legal') Bubble.say(this, '法务车？正好退回去', 1.6, 'me');
  },
  updHeld(dt) {
    if (this.throwT > 0) this.throwT -= dt;
    const c = this.held;
    if (!c) return;
    if (c.removed) { this.held = null; return; }
    this.holdT += dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    c.pos.set(this.pos.x - fx * 0.3, 0, this.pos.z - fz * 0.3);
    c.y = lerp(1, 12.4, clamp(this.holdT / 0.25, 0, 1)) + this.y;
    c.heading = this.heading + Math.PI / 2; c.rx = 0; c.rz = 0; c.sync();
    if (this.holdT > 0.6) this.throwHeld();
  },
  throwHeld() {
    const c = this.held;
    if (!c) return;
    this.held = null;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    c.state = 'thrown'; c.age = 0; c.y = 10.5; c.throwMul = RPG.m.throwDmg; c.throwR = RPG.m.throwR;
    c.pos.set(this.pos.x + fx * 2.5, 0, this.pos.z + fz * 2.5);
    c.vel.set(fx * 44 + this.vel.x, 7, fz * 44 + this.vel.z);
    c.wx = rand(-6, 6); c.wy = rand(-3, 3); c.wz = rand(-6, 6);
    this.throwT = 0.3; Sfx.whoosh(); Cam.shake(0.4);
  },
  beamRay(ox, oz, fx, fz, range, pierce, dps, dt) {
    let best = range, tgt = null, kind = null;
    const hits = [];
    if (!Interiors.cur) for (const s of W.solids) {
      if (!s.solid || s.kind === 'pillar') continue;
      const t = rayAABB2(ox, oz, fx, fz, s, best); if (t >= 0 && t < best) { best = t; tgt = s; kind = 'solid'; }
    }
    for (const e of Enemies.list) { if (e.dead) continue; const t = rayCircle(ox, oz, fx, fz, e.pos.x, e.pos.z, e.r + 0.8); if (t >= 0 && t < best) { if (pierce) hits.push(e); else { best = t; tgt = e; kind = 'enemy'; } } }
    if (!Interiors.cur) for (const c of Cars.list) { if (c.removed || c.state === 'held' || c.state === 'thrown') continue; const t = rayCircle(ox, oz, fx, fz, c.pos.x, c.pos.z, c.radius * 0.8); if (t >= 0 && t < best) { if (pierce) hits.push(c); else { best = t; tgt = c; kind = 'car'; } } }
    for (const h of hits) { if (h instanceof Car) { h.damage(dps * dt * 0.7); } else h.hit(dps * dt * 1.4, fx * 30 * dt, fz * 30 * dt, 0, 'beam', true); }
    if (kind === 'enemy') tgt.hit(dps * dt * 1.4, fx * 30 * dt, fz * 30 * dt, 0, 'beam', true);
    else if (kind === 'car') { tgt.damage(dps * dt * 0.7); tgt.vel.x += fx * 30 * dt; tgt.vel.z += fz * 30 * dt; }
    if (Boss.cur) { const bt = Boss.rayTest(ox, oz, fx, fz, best); if (bt >= 0) { best = Math.min(best, bt); Boss.damage(dps * dt, 'beam', true); } }
    if (Monorail.rayTest) { const mt = Monorail.rayTest(ox, oz, fx, fz, best, dps * dt); if (mt >= 0) best = Math.min(best, mt); }
    return { best, tgt, kind };
  },
  updBeam(dt, want) {
    const m = RPG.m;
    const can = want && this.tokens > 20000 && !this.held && !this.atk && this.onGround && !this.ult;
    if (!can) { if (this.beam) this.stopBeam(); if (want && this.tokens <= 20000 && kp('KeyL')) UI.hint('Token 不够放光束了您呐'); return; }
    if (!this.beam) { this.beam = true; this.beamAcc = 0; this.beamT = 0; }
    const cost = 130000 * m.beamCost * dt;
    if (Math.random() >= m.cache) { this.tokens -= cost; G.stats.burned += cost; }
    Sfx.beam(true);
    const dps = 300 * m.beamDmg, range = 52 * m.beamRange;
    const dirs = m.multi ? [0, -0.22, 0.22] : [0];
    let mainHit = null;
    dirs.forEach((off, i) => {
      const h = this.heading + off, fx = Math.sin(h), fz = Math.cos(h);
      const ox = this.pos.x + fx * 1.6, oz = this.pos.z + fz * 1.6;
      const r = this.beamRay(ox, oz, fx, fz, range, m.pierce, i === 0 ? dps : dps * 0.5, dt);
      const hx = ox + fx * r.best, hz = oz + fz * r.best;
      if (i === 0) { mainHit = { r, hx, hz, fx, fz }; }
      else FX.sparks(hx, 2, hz, 1, [1, 0.8, 0.4]);
      if (Math.random() < dt * 40) FX.sparks(hx, 2.5, hz, 2, [1, 0.85, 0.35]);
    });
    const { r, hx, hz, fx, fz } = mainHit;
    this.beamT += dt; this.beamAcc += dps * dt;
    if (this.beamT > 0.13) {
      if (r.kind === 'solid' && r.tgt.hq) r.tgt.hq.damage(this.beamAcc, hx, hz, 'beam', '光束');
      RPG.charge(this.beamAcc * 0.5);
      this.beamT = 0; this.beamAcc = 0;
    }
    const hy = r.kind === 'solid' ? 3.5 : r.kind === 'enemy' ? Math.max(1.2, r.tgt.y + 1) : 1.2;
    FX.beamSet(true, this.pos.x + fx * 1.7, 7.6 + this.y, this.pos.z + fz * 1.7, hx, hy, hz);
    if (Math.random() < dt * 15) FX.smoke(hx, hy, hz, 1, 2, 0.3);
    if (Math.random() < dt * 50) FX.glowSys.spawn(this.pos.x + fx * 1.8, 7.6, this.pos.z + fz * 1.8, 0, 0, 0, rand(2.5, 3.5), -4, 1, 0.85, 0.4, 0.8, 0.08, 0, 0);
    Props.knockAround(hx, hz, 2, this.pos.x, this.pos.z);
    Cam.shake(0.07);
  },
  stopBeam() { if (!this.beam) return; this.beam = false; FX.beamSet(false); Sfx.beam(false); },
  // ---------------- specialisation ultimates ----------------
  startUlt() {
    if (!RPG.spec) { UI.hint(RPG.level < 5 ? '5 级解锁专精大招' : '按 Tab 选择专精后才有大招'); return; }
    if (RPG.ult < 100) { UI.hint(`大招充能 ${Math.floor(RPG.ult)}%，打出伤害来充能`); Sfx.denied(); return; }
    if (this.ult) return;
    RPG.ult = 0; this.stopBeam(); this.atk = null;
    const spec = SPECS.find((s) => s.id === RPG.spec);
    this.ult = { kind: RPG.spec, t: 0, tick: 0, ang: this.heading };
    UI.big(spec.ult + '！', spec.ultDesc, 'gold', 1.8); Sfx.ult(); G.slow(0.4, 0.5); Cam.shake(1);
    if (RPG.spec === 'alchemist') {
      for (let k = 0; k < 34; k++) { const a = rand(TAU), rr = rand(3, 22); Tokens.add(this.pos.x + Math.cos(a) * rr, this.pos.z + Math.sin(a) * rr, 50000, { y: rand(18, 34), vy: -rand(2, 8), air: true }); }
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5); this.rhp = Math.min(this.rmax, this.rhp + this.rmax * 0.5);
      FX.ring(this.pos.x, this.pos.z, 1, 24, 0.8, 0xffd23f, 1);
    }
    if (RPG.spec === 'knight') {
      Bubble.say(this, '是时候让我的敌人也尝尝我的恐惧了。', 2.6, 'me');
      for (let k = 0; k < 90; k++) { const a = rand(TAU), sp = rand(8, 26); Debris.spawn(this.pos.x, rand(3, 9), this.pos.z, Math.cos(a) * sp, rand(2, 9), Math.sin(a) * sp, 0.9, 0.12, 0.5, pick([0x0b0b0e, 0x1a1a20, 0x2b1d14]), rand(1.2, 2.2)); }
      for (const e of Enemies.list) if (!e.dead && dist2(e.pos.x, e.pos.z, this.pos.x, this.pos.z) < 34 * 34) { e.hit(160 * RPG.m.robotMelee, 0, 0, 6, 'ult'); e.stun = 4; }
      if (Boss.cur) Boss.hitTest(this.pos.x, this.pos.z, 34, 320, 'ult');
      if (!Interiors.cur) for (const c of Cars.list) if (c.state === 'legal' && dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 40 * 40) c.knock(rand(-10, 10), 12, rand(-10, 10), 80);
      FX.ring(this.pos.x, this.pos.z, 1, 34, 0.9, 0x94a3b8, 1);
    }
  },
  updUlt(dt, rdt) {
    const U = this.ult; U.t += dt;
    if (U.kind === 'brawler') {
      U.tick -= dt;
      if (U.tick <= 0) { U.tick = 0.09; this.heading += rand(-0.25, 0.25); Combat.strike(ATK.u_flurry); Robot.parts.armR.rotation.x = -1.6; Robot.parts.armL.rotation.x = (Math.random() < 0.5 ? -1.6 : 0); }
      if (U.t > 3) this.ult = null;
    } else if (U.kind === 'mage') {
      U.ang += dt * 5.2;
      const fx = Math.sin(U.ang), fz = Math.cos(U.ang), ox = this.pos.x + fx * 1.6, oz = this.pos.z + fz * 1.6;
      const r = this.beamRay(ox, oz, fx, fz, 44, true, 900 * RPG.m.beamDmg, dt);
      const hx = ox + fx * r.best, hz = oz + fz * r.best;
      if (r.kind === 'solid' && r.tgt.hq) r.tgt.hq.damage(900 * dt, hx, hz, 'beam', '');
      FX.beamSet(true, this.pos.x, 7.6, this.pos.z, hx, 2, hz); Sfx.beam(true);
      FX.sparks(hx, 2, hz, 2, [0.8, 0.6, 1]);
      if (U.t > 2.4) { this.ult = null; FX.beamSet(false); Sfx.beam(false); }
    } else if (U.t > 1.2) this.ult = null;
  },
  // ---------------- cars ----------------
  tryEnter() {
    const c = Cars.enterable(this.pos.x, this.pos.z); // nearest car, or a 共享单车
    if (!c) { UI.hint('边儿上没车可开'); return; }
    if (c.hasDriver) { c.ejectDriver(true); G.crime(c.kind === 'legal' ? 0.6 : 0.22); G.stats.stolen++; }
    c.state = 'player'; c.vel.set(Math.sin(c.heading) * c.speed, 0, Math.cos(c.heading) * c.speed);
    this.car = c; this.mode = 'car'; this.atk = null; this.queued = null;
    this.human.root.visible = false; Sfx.door(); UI.radio(); UI.carName(c.name);
    Cars.onEnter(c);
  },
  exitCar() {
    const c = this.car;
    this.car = null; this.mode = 'human';
    if (c && !c.removed) {
      if (c.state === 'player') { c.state = 'parked'; c.age = 0; }
      // step out of whichever door is clear (a car parked against a wall lets you out the other side, then front / back)
      const lx = Math.cos(c.heading), lz = -Math.sin(c.heading), fx = -lz, fz = lx, t = _exitV;
      let ok = false;
      for (const [dx, dz, d] of [[lx, lz, 2.3], [-lx, -lz, 2.3], [-fx, -fz, 3.8], [fx, fz, 3.8], [lx, lz, 3.4], [-lx, -lz, 3.4]]) {
        t.set(c.pos.x + dx * d, 0, c.pos.z + dz * d);
        if (!collideCircle(t, 0.65) && Grid.at(t.x, t.z) !== GK.BLD) { ok = true; break; }
      }
      if (ok) this.pos.copy(t); else this.pos.set(c.pos.x + lx * 2.3, 0, c.pos.z + lz * 2.3);
    }
    collideWorld(this.pos, 0.6);
    this.vel.set(0, 0, 0); this.human.root.visible = true; this.human.root.scale.setScalar(1);
    Sfx.door(); Sfx.engine(false, 0);
    Cars.onExit(c);
  },
  bailOut(exploded) {
    if (!this.car) return;
    this.exitCar();
    if (exploded) { this.invuln = 0; this.hurt(38, 'boom'); }
  },
  // ---------------- transformation ----------------
  tryTransform() {
    if (this.mode !== 'human' && this.mode !== 'car') return;
    if (Interiors.cur) { UI.hint('屋里忒窄，变不开身'); return; }
    if (!Story.flags.transform) { UI.hint('您还不会变身呢——杜卡德会教您'); Sfx.denied(); return; }
    if (this.tokens < CAP) { UI.hint(`Token 不够：${fmtTok(this.tokens)} / 1M，先吃 Token 去`); Sfx.denied(); return; }
    if (this.mode === 'car') this.exitCar();
    this.startXform('h2r');
  },
  startXform(kind) {
    this.atk = null; this.queued = null; this.stopBeam();
    const X = { kind, t: 0 };
    this.xf = X; this.mode = 'xform';
    const instant = RPG.m.instant && (kind === 'r2t' || kind === 't2r');
    if (kind === 'h2r') {
      // cinematic: charge (0–1s) → the human shatters (1s) → parts fly in and clunk on (1–2.7s) → helmet → pose → shockwave (3.15s)
      X.dur = 3.6; X.to = 'robot'; X.cine = true; X.lift = 0;
      this.heading = 0; this.vel.set(0, 0, 0);
      G.slow(0.3, 3.3); Sfx.transform2();
      UI.letterbox(true); UI.hudDim(true);
      Robot.snap('robot'); Robot.scatterWide(); Robot.root.visible = false;
      this.rhp = this.rmax; G.stats.transforms++;
    } else if (kind === 'r2t') { X.dur = instant ? 0.12 : 0.75; X.to = 'truck'; Robot.morphTo('truck', instant ? 0.1 : 0.68, instant ? 0 : 0.03); Sfx.mech(); }
    else if (kind === 't2r') { X.dur = instant ? 0.12 : 0.75; X.to = 'robot'; this.vel.multiplyScalar(0.5); Robot.morphTo('robot', instant ? 0.1 : 0.68, instant ? 0 : 0.03); Sfx.mech(); }
    else if (kind === 'r2h') { X.dur = 1.1; X.to = 'human'; Robot.explodeOut(); Sfx.powerDown(); }
    if (instant) { FX.ring(this.pos.x, this.pos.z, 1, 14, 0.5, 0x93c5fd, 1); Combat.explosion(this.pos.x, this.pos.z, 11, 120, 'slam'); }
  },
  updXform(dt, rdt) {
    const X = this.xf;
    X.t += rdt;
    const f = Math.exp(-3 * dt);
    this.vel.x *= f; this.vel.z *= f;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    collideWorld(this.pos, X.to === 'human' ? 0.6 : 2.5);
    if (!this.onGround) this.gravity(dt, 40);
    Robot.updateMorph(rdt);
    if (X.kind === 'h2r') {
      const px = this.pos.x, pz = this.pos.z, H = this.human;
      // any of T / Space / click skips straight to the pose
      if (X.t > 0.25 && X.t < 2.75 && (kpRaw('KeyT', 'Space', 'Enter') || Input.click)) {
        X.t = 2.75; X.shatter = true; H.root.visible = false; Robot.root.visible = true; Robot.snap('robot'); FX.light(px, 5, pz, 2.4, 0xffd060); UI.flash();
      }
      if (X.t < 1.0) {
        // charge: float up, spin faster and faster, arms up, tokens spiral in
        const u = X.t / 1.0;
        X.lift = 1.3 * easeInOut(u);
        H.root.rotation.set(0, this.heading + u * u * 14, 0);
        H.armL.rotation.x = H.armR.rotation.x = lerp(0, -2.8, Math.min(1, u * 2.5)); H.legL.rotation.x = 0.25 * u; H.legR.rotation.x = -0.25 * u;
        for (let k = 0, n = perSec(200, rdt); k < n; k++) {
          const a = rand(TAU), r = rand(5, 8), y = rand(0.2, 4.5), sp = rand(7, 11);
          FX.glowSys.spawn(px + Math.cos(a) * r, y, pz + Math.sin(a) * r, -Math.cos(a) * sp - Math.sin(a) * 5, rand(-0.5, 1.5), -Math.sin(a) * sp + Math.cos(a) * 5, rand(0.3, 0.65), -0.3, 1, 0.8 + rand(0.15), 0.25, 1, 0.55, 0.2, 0);
        }
        if (Math.random() < rdt * 14) FX.sparks(px + rand(-1.2, 1.2), 1.2 + X.lift + rand(2.5), pz + rand(-1.2, 1.2), 3, [1, 0.9, 0.5]);
        X.ringT = (X.ringT || 0) - rdt; if (X.ringT <= 0) { X.ringT = 0.22; FX.ring(px, pz, 8, 1.2, 0.35, 0xffc940, 0.8, 0.15); }
        if (Math.random() < rdt * 10) FX.light(px, 2.5 + X.lift, pz, 0.8 + u * 1.6, 0xffd060);
      } else if (!X.shatter) {
        // shatter: the human bursts into cubes of their own clothes, the mech parts appear in a ring
        X.shatter = true; H.root.visible = false; Robot.root.visible = true;
        const o = OUTFITS[RPG.outfit] || OUTFITS.tee, cols = [o.shirt, o.shirt, o.pants, o.shoe, 0xe8b890, o.print || o.shirt];
        if (!H.rig) for (let k = 0; k < 42; k++) { const a = rand(TAU), sp = rand(4, 10); Debris.spawn(px + rand(-0.5, 0.5), rand(0.4, 3.4) + X.lift, pz + rand(-0.5, 0.5), Math.cos(a) * sp, rand(1, 6), Math.sin(a) * sp, rand(0.22, 0.42), rand(0.22, 0.42), rand(0.22, 0.42), pick(cols), rand(0.7, 1.1)); }
        for (let k = 0; k < 40; k++) { const a = rand(TAU), sp = rand(8, 16); FX.glowSys.spawn(px, 2 + X.lift, pz, Math.cos(a) * sp, rand(-2, 6), Math.sin(a) * sp, rand(0.4, 0.8), -0.5, 1, 0.9, 0.55, 1, 0.45, 1.5, 0); }
        FX.light(px, 4, pz, 2.2, 0xfff0b0); UI.flash(); Cam.shake(0.8);
        FX.ring(px, pz, 0.5, 9, 0.4, 0xffffff, 0.9);
        Robot.assemble({ legL: 0.05, legR: 0.2, w0: 0.3, w1: 0.3, w2: 0.3, w3: 0.3, w4: 0.3, w5: 0.3, pelvis: 0.42, chest: 0.66, armL: 0.9, armR: 1.04, head: 1.24 });
      }
      if (X.shatter && X.t < 2.7) {
        X.lift = damp(X.lift, 0, 3, rdt);
        for (let k = 0, n = perSec(45, rdt); k < n; k++) { const a = rand(TAU), r = rand(3, 6); FX.glowSys.spawn(px + Math.cos(a) * r, rand(1, 9), pz + Math.sin(a) * r, -Math.cos(a) * 5, 0, -Math.sin(a) * 5, rand(0.3, 0.6), -0.4, 1, 0.82, 0.3, 0.9, 0.4, 0.2, 0); }
      }
      if (X.t >= 2.7 && !X.helmet) { X.helmet = true; X.lift = 0; Sfx.servo(0.35); FX.light(px, 10, pz, 2.2, 0x93c5fd); FX.sparks(px, 10, pz, 14, [0.7, 0.9, 1]); }
      X.pose = X.t < 2.75 ? 0 : Math.min(1, (X.t - 2.75) / 0.3);
      if (X.t > 3.15 && !X.boom) {
        X.boom = true; UI.big('变身！', 'TOKEN 金刚 · 启动', 'gold', 2.0);
        FX.ring(this.pos.x, this.pos.z, 1, 20, 0.7, 0xffd070, 1); FX.ring(this.pos.x, this.pos.z, 1, 12, 0.5, 0xffffff, 0.9);
        if (!Interiors.cur) for (const c of Cars.list) { if (c.removed || c.state === 'held') continue; const d = hyp(c.pos.x - this.pos.x, c.pos.z - this.pos.z); if (d < 16 && d > 0.1) c.knock(((c.pos.x - this.pos.x) / d) * 14, 9, ((c.pos.z - this.pos.z) / d) * 14, 20); }
        Props.knockAround(this.pos.x, this.pos.z, 12, this.pos.x, this.pos.z);
        if (!Interiors.cur) Peds.panicAround(this.pos.x, this.pos.z, 50, 5);
        FX.dust(this.pos.x, this.pos.z, 12, 3.5); Cam.shake(1.6); Sfx.boom(false);
      }
      if (X.t > 3.3 && !X.unbox) { X.unbox = true; UI.letterbox(false); UI.hudDim(false); }
    } else if (X.kind === 'r2h') {
      if (X.t > 0.35 && !X.pop) { X.pop = true; this.human.root.visible = true; this.human.root.scale.setScalar(0.3); this.human.root.rotation.set(0, this.heading, 0); FX.sparkle(this.pos.x, 2, this.pos.z, 16); }
      if (X.pop) this.human.root.scale.setScalar(Math.min(1, this.human.root.scale.x + rdt * 3));
    }
    if (X.t >= X.dur) {
      this.xf = null; this.mode = X.to;
      if (X.cine && !X.unbox) { UI.letterbox(false); UI.hudDim(false); }
      if (X.to === 'robot') { Robot.snap('robot'); Robot.root.visible = true; this.human.root.visible = false; if (X.kind === 'h2r') Story.event('transformed'); }
      else if (X.to === 'truck') { Robot.snap('truck'); Story.event('truck'); }
      else { Robot.root.visible = false; this.human.root.visible = true; this.human.root.scale.setScalar(1); this.invuln = 3; this.onGround = true; this.y = 0; }
      Sfx.mood(G.moodFor());
    }
  },
  // instant, no animation — used when a mission (re)starts somewhere that needs you on foot
  forceHuman() {
    if (this.mode === 'car') this.exitCar();
    if (this.mode === 'robot' || this.mode === 'truck' || this.mode === 'xform') {
      this.stopBeam(); this.ult = null; this.slam = false;
      if (this.held) { const c = this.held; this.held = null; c.state = 'ragdoll'; c.vel.set(0, 2, 0); }
      this.mode = 'human'; this.onGround = true; this.y = 0; this.vel.set(0, 0, 0);
      Robot.root.visible = false; this.human.root.visible = true; this.human.root.scale.setScalar(1);
      Sfx.engine(false, 0);
    }
  },
  revert(msg) {
    if (this.mode !== 'robot' && this.mode !== 'truck') return;
    this.stopBeam(); this.ult = null;
    if (this.held) { const c = this.held; this.held = null; c.state = 'ragdoll'; c.vel.set(0, 2, 0); }
    this.hp = Math.max(this.hp, this.maxHp * 0.6);
    this.slam = false; this.onGround = true; this.y = 0;
    this.startXform('r2h');
    UI.big('变身解除', msg + ' 再吃满 1M Token 才能变身', 'red', 2.6);
  },
  // ---------------- death ----------------
  die(src) {
    this.mode = 'dead'; this.deadT = 0; this.killer = src; this.atk = null; this.ult = null;
    this.stopBeam(); Sfx.engine(false, 0);
    const busted = src === 'legal';
    UI.wasted(busted); G.slow(0.3, 3); Sfx.wasted();
    this.human.root.visible = true; G.stats.deaths++;
    Story.onPlayerDown(busted);
  },
  updDead(dt, rdt) {
    this.deadT += rdt;
    this.human.root.rotation.set(-Math.min(1, this.deadT * 2.5) * 1.45, this.heading, 0, 'YXZ');
    if (this.deadT > 4.2) this.respawn();
  },
  respawn() {
    const inside = Interiors.cur;
    if (inside) Interiors.leaveInstant();
    const fee = Math.round(G.money * 0.05);
    G.money -= fee;
    this.mode = 'human'; this.hp = this.maxHp; this.tokens = Math.floor(this.tokens * 0.5);
    this.pos.copy(W.respawn); this.vel.set(0, 0, 0); this.heading = Math.PI; this.y = 0; this.vy = 0; this.onGround = true; this.poison = 0;
    this.human.root.rotation.set(0, 0, 0); this.human.root.visible = true; Robot.root.visible = false;
    G.heat = 0;
    for (const c of Cars.list) if (c.state === 'legal') c.remove();
    Enemies.clearNear(this.pos.x, this.pos.z, 60); Projectiles.clear();
    UI.unwasted(); UI.subtitle(`您在王府门口醒过来了。医药费 ${fmtMoney(fee)}，Token 少了一半儿。`, 4);
    this.invuln = 2.5;
    Sfx.mood(G.moodFor());
  },
  // ---------------- visuals ----------------
  syncVisuals(dt, rdt) {
    const gh = Interiors.cur ? 0 : groundH(this.pos.x, this.pos.z), m = this.mode, X = this.xf;
    const walk = clamp(hyp(this.vel.x, this.vel.z) / 7, 0, 1);
    const H = this.human;
    if (H.rig) heroSync(this, dt, gh);
    else if (H.root.visible) {
      if (m === 'human') {
        this.ph += dt * hyp(this.vel.x, this.vel.z) * 1.5;
        const sw = Math.sin(this.ph) * 0.8 * walk;
        let al = -sw * 0.8, ar = sw * 0.8, ll = sw, lr = -sw;
        if (this.atk) {
          const a = this.atk, u = clamp(a.t / a.def.dur, 0, 1), hu = a.def.hit / a.def.dur;
          const s = u < hu ? u / hu : 1 - (u - hu) / (1 - hu);
          if (a.def.kind === 'punch') ar = RPG.owns('keyboard') ? -2.6 + 2.2 * s : -1.6 * s; else lr = -1.4 * s;
        }
        if (!this.onGround) { al = -2.4; ar = -2.4; }
        H.legL.rotation.x = ll; H.legR.rotation.x = lr; H.armL.rotation.x = al; H.armR.rotation.x = ar;
        H.root.rotation.set(0, this.heading, 0);
        if (H.cape) H.cape.rotation.x = damp(H.cape.rotation.x, 0.15 + walk * 0.9 + (this.onGround ? 0 : 0.6), 6, dt || 0.016);
      }
      H.root.position.set(this.pos.x, gh + this.y + (m === 'human' ? Math.abs(Math.sin(this.ph)) * 0.08 * walk : 0) + (X && X.lift ? X.lift : 0), this.pos.z);
    }
    const R = Robot.root;
    if (R.visible) {
      R.position.set(this.pos.x, gh + this.y, this.pos.z);
      R.rotation.set(0, this.heading, 0);
      Robot.animate(rdt, { walk: this.onGround ? walk : 0, ph: this.ph, atk: this.atk, slam: this.slam, slamLand: this.slamLand, held: !!this.held, throwT: this.throwT, beam: this.beam || (this.ult && this.ult.kind === 'mage'), pose: X && X.kind === 'h2r' ? X.pose || 0 : 0 });
    }
    let x = this.pos.x, y = 0, z = this.pos.z, size = 2.15, robo = false, hideFace = false;
    const humanHead = () => { y = gh + this.y + 2.75 + (m === 'human' ? Math.abs(Math.sin(this.ph)) * 0.1 * walk : 0); size = 2.15; };
    if (m === 'human') humanHead();
    else if (m === 'dead') { const u = Math.min(1, this.deadT * 2.5); x -= Math.sin(this.heading) * 2.2 * u; z -= Math.cos(this.heading) * 2.2 * u; y = gh + lerp(2.75, 0.8, u); }
    else if (m === 'car') { y = gh + 3.2; size = 1.7; }
    else if (m === 'xform' && X.kind === 'r2h') {
      if (X.t < 0.35) { Robot.parts.head.getWorldPosition(_faceTmp); x = _faceTmp.x; y = _faceTmp.y + 0.8; z = _faceTmp.z; size = 4.6 * (1 - (X.t / 0.35) * 0.5); robo = true; }
      else humanHead();
    } else if (m === 'robot' || (m === 'xform' && Robot.pose === 'robot')) {
      Robot.parts.head.getWorldPosition(_faceTmp);
      x = _faceTmp.x; y = _faceTmp.y + 0.8; z = _faceTmp.z; size = 4.6; robo = true;
      if (m === 'xform' && X.kind === 'h2r') {
        if (!X.shatter) { humanHead(); robo = false; x = this.pos.x; z = this.pos.z; y += X.lift || 0; }
        else if (!X.helmet) hideFace = true;
        else { const u = clamp((X.t - 2.7) / 0.25, 0, 1); size = 4.6 * Math.max(0.01, easeOutBack(u)); }
      }
    } else if (m === 'truck' || (m === 'xform' && Robot.pose === 'truck')) {
      x = this.pos.x + Math.sin(this.heading) * 2.2; z = this.pos.z + Math.cos(this.heading) * 2.2; y = gh + 6.0; size = 3.1; robo = true;
    }
    // the mech has a modelled helmet, and a driver sits inside the (tinted) car: no sprite over either (bike riders keep theirs)
    this.face.visible = !hideFace && !(robo && Robot.head3d) && !(m === 'car' && this.car && !this.car.k.bike);
    this.face.material = robo ? this.faceMatR : this.faceMatH;
    const s = size * (1 + Math.sin(Math.min(1, (0.22 - this.gulp) / 0.22) * Math.PI) * (this.gulp > 0 ? 0.28 : 0));
    const k = size * 0.45, hs = robo ? 1 : 1.5;
    this.face.position.set(x + Cam.toCam.x * k, y + Cam.toCam.y * k, z + Cam.toCam.z * k);
    this.face.scale.set(s * hs, s * hs, 1); this.face.center.set(0.5, robo ? 0.5 : 1 - 224 / 384);
    this.bubbleH = y - (gh + this.y) + size * 0.5 - 3;
    if (H.rig && (m === 'human' || m === 'dead' || (m === 'xform' && X.kind === 'r2h' && X.pop))) this.bubbleH = H.rig.height + 0.35 - 3;
  },
};
const _faceTmp = new V3();

/* ---- the VRM hero's animation (07b_vrm CharRig): clips chosen from the game state every frame ---- */
const _hs = { atk: null, n: 0, lastAtk: -9, air: false, hurt: -99, idleT: 0, xk: '', seat: null };
// [clip, striking limb]: the jab is the lead (left) hand, the cross the rear (right) one (measured on the retargeted clips: with the
// limbs swapped the jab's "impact" read as frame 0, so it played at the 0.9 floor and landed ~0.2 s after the damage)
const HERO_PUNCH = [['punch_jab', 'leftHand'], ['punch_cross', 'rightHand'], ['hook', 'rightHand']], HERO_KICK = [['kick', 'rightFoot'], ['kick_spin', 'rightFoot']];
function heroSync(P, dt, gh) {
  const H = P.human, rig = H.rig, m = P.mode, X = P.xf, S = _hs, T = rig.T;
  const sp = hyp(P.vel.x, P.vel.z), bike = m === 'car' && P.car && P.car.k && P.car.k.bike;
  rig.inner.position.set(0, rig.legY ?? (rig.legY = rig.inner.position.y), 0);
  rig.over = null; rig.talk = false; if (m !== 'human') rig.phone(false);
  // the transformation: after the burst the hero burns away in gold light, feet first, while the mech builds up round him;
  // coming back he glows back into being, head first
  if (m === 'xform' && rig.ownC) {
    if (X.kind === 'h2r' && X.shatter) { if (S.disT === undefined) S.disT = X.t; const u = X.t >= 2.7 ? 1 : clamp((X.t - S.disT) / 0.95, 0, 1); H.root.visible = u < 1; rig.dissolve(u, 1); }
    else if (X.kind === 'r2h') { if (!X.pop) rig.dissolve(1, 1); else { if (S.popT === undefined) S.popT = X.t; const u = clamp((X.t - S.popT) / 0.6, 0, 1); rig.dissolve(1 - u, 1); heroAura(rig, 1 - u); } }
  }
  if (H.head3d && H.head3d.userData.vrm) H.head3d.visible = !(rig.dis > 0.55);
  if (!H.root.visible) { S.air = false; return; }
  const lift = X && X.lift ? X.lift : 0;
  if (m === 'human') {
    H.root.position.set(P.pos.x, gh + P.y + lift, P.pos.z); H.root.rotation.set(0, P.heading, 0);
    // a new strike: jab / cross / hook (kick / spin kick) in turn, played so its impact lands on the hit frame
    if (P.atk && P.atk !== S.atk) {
      const d = P.atk.def, chain = G.time - S.lastAtk < 0.9, L = d.kind === 'kick' ? HERO_KICK : HERO_PUNCH;
      S.n = chain ? (S.n + 1) % L.length : 0; S.lastAtk = G.time;
      // played so the impact frame lands on the hit frame (jab ~2.4×, cross ~3×, kicks ~3.2×); an impact that reads as the first
      // frames (a clip still streaming in) gets a plain quick rate instead of the slow floor
      const [clip, limb] = L[S.n % L.length], ti = CharLib.hitTime(T, clip, limb), rate = ti > 0.05 ? clamp(ti / Math.max(0.05, d.hit), 1, 3.4) : 2.4;
      rig.once(clip, { rate, fade: 0.06, end: clamp((ti + 0.45) / (CharLib.clip(T, clip) || { duration: 1 }).duration, 0.35, 1), back: 0.16 });
      rig.expr('angry', 0.7);
    }
    S.atk = P.atk;
    // jump: take-off → air → landing
    if (!P.onGround) { if (!S.air) { S.air = true; rig.once('jump_start', { start: 0.38, rate: 2.2, fade: 0.06, then: 'jump_air', back: 0.08 }); } }
    else if (S.air) { S.air = false; if (!P.atk) { if (sp < 3) rig.once('jump_land', { start: 0.1, rate: 1.8, fade: 0.05, end: 0.5, back: 0.15 }); else rig.stopOnce(0.12); } }
    // hit reactions
    if (P.lastHurt !== S.hurt) { const fresh = G.time - P.lastHurt < 0.2 && S.hurt > -99; S.hurt = P.lastHurt; if (fresh && !P.atk && P.onGround) { rig.once(Math.random() < 0.5 ? 'hit_front' : 'hit_head', { rate: 1.3, fade: 0.05 }); rig.expr('Surprised', 0.8); } }
    // moving breaks out of a finishing move early
    if (rig.busy && !P.atk && P.onGround && sp > 2.5 && !/jump|hit/.test(rig.oneK)) rig.stopOnce(0.18);
    const carry = Actors.map.carry, gym = typeof Gym !== 'undefined' && Gym.active;
    if (gym || carry || !(P.onGround || !S.air)) S.ak = '';
    if (gym) rig.play(gym.kind === 'stamina' ? 'jog' : 'pushup', { fade: 0.3, rate: clamp(0.7 + gym.n * 0.04, 0.7, 2) });
    else if (carry) rig.play('walk_carry', { fade: 0.3, rate: clamp(sp / (0.52 * T.hipsY * rig.k), 0, 1.8) });
    else if (P.onGround || !S.air) {
      // fight stance with a foe close by
      let foe = false; for (const e of Enemies.list) if (!e.dead && e.aggro && dist2(e.pos.x, e.pos.z, P.pos.x, P.pos.z) < 100) { foe = true; break; }
      S.idleT = sp < 0.3 && !P.atk ? S.idleT + dt : 0;
      const call = typeof Phone !== 'undefined' && Phone.cur && Phone.t > -0.6; // answers the phone standing about
      S.ak = Actors.loco(rig, sp, { idleK: foe || G.time - S.lastAtk < 3 ? 'fight_idle' : call ? 'phone_call' : S.idleT > 9 ? 'idle_soft' : 'idle' });
      if (!foe && G.time - S.lastAtk > 3 && rig._mood !== 'angry') rig.expr('angry', 0);
    }
    rig.phone(S.ak === 'phone_call' && !rig.busy);
    if (H.cape) H.cape.rotation.x = damp(H.cape.rotation.x, 0.12 + clamp(sp / 7, 0, 1) * 0.9 + (P.onGround ? 0 : 0.5), 6, dt || 0.016);
    heroLook(P, rig, sp);
  } else if (m === 'dead') {
    H.root.position.set(P.pos.x, gh + P.y, P.pos.z); H.root.rotation.set(0, P.heading, 0);
    rig.play('death', { fade: 0.15 }); rig.expr('ko', 1); rig.look(null);
  } else if (bike) {
    // 共享单车: seated (06_vehicles Bikes places the root on the saddle and writes the pedal angles into the legacy leg dummies)
    rig.play('drive', { fade: 0.2 });
    if (!S.seat) S.seat = heroSeat(rig);
    rig.inner.position.set(0, rig.legY + S.seat[0], S.seat[1]);
    const pl = H.legL.rotation.x + 0.55, pr = H.legR.rotation.x + 0.55;
    rig.over = { legL: 0.2 + pl, legR: 0.2 + pr, kneeL: 0.3 + pl * 0.9, kneeR: 0.3 + pr * 0.9 };
    rig.look(null);
  } else if (m === 'xform') {
    H.root.position.set(P.pos.x, gh + P.y + lift, P.pos.z);
    if (X.kind === 'h2r') {
      // charge: power-up pose, the body lit from the edges in by a gold aura, sparks peeling off the limbs; then it bursts (updXform)
      rig.play('power_up', { fade: 0.1, hold: clamp(X.t / 0.8, 0.05, 0.62) }); rig.expr('angry', 1);
      heroAura(rig, clamp(X.t / 0.9, 0, 1));
      if (!X.shatter && Math.random() < dt * 30) { const b = pick(['handL', 'handR', 'footL', 'footR', 'head', 'chest']); rig.bonePos(b, _heroT); FX.glowSys.spawn(_heroT.x, _heroT.y, _heroT.z, rand(-1, 1), rand(1, 3), rand(-1, 1), rand(0.25, 0.5), -0.3, 1, 0.82, 0.35, 1, 0.45, 0.4, 0); }
      if (X.shatter && !S.burst) { S.burst = true; for (const b of ['head', 'chest', 'hips', 'handL', 'handR', 'foreL', 'foreR', 'kneeL', 'kneeR', 'footL', 'footR']) { rig.bonePos(b, _heroT); for (let k = 0; k < 4; k++) { const a = rand(TAU), v = rand(4, 9); FX.glowSys.spawn(_heroT.x, _heroT.y, _heroT.z, Math.cos(a) * v, rand(1, 6), Math.sin(a) * v, rand(0.4, 0.8), -0.5, 1, 0.9, 0.55, 1, 0.45, 1.5, 0); } } }
    }
    else if (X.kind === 'r2h' && X.pop && S.xk !== 'pop') rig.once('land_hero', { start: 0.2, rate: 1.1, then: 'idle' });
    S.xk = X.kind === 'r2h' && X.pop ? 'pop' : X.kind;
    rig.look(null);
  } else { H.root.position.set(P.pos.x, gh + P.y, P.pos.z); H.root.rotation.set(0, P.heading, 0); }
  // back from the dead (respawn, a checkpoint retry): the KO face goes (it would stay on every later close-up)
  if (m !== 'dead' && (rig.ex.ko || rig.ex.blink)) rig.expr('ko', 0).expr('blink', 0);
  if (m !== 'xform') { S.xk = ''; S.burst = false; S.disT = S.popT = undefined; if (rig.aura) heroAura(rig, 0); if (rig.dis) rig.dissolve(0); }
  if (P.gulp > 0.15) rig.expr('happy', 1); else if (P.gulp <= 0 && rig._mood !== 'happy') rig.expr('happy', 0);
  if (rig.ex.Surprised && G.time - P.lastHurt > 0.8) rig.expr('Surprised', 0);
}
// the transformation aura: MToon rim light turned up to a gold glow (no shader change: VRoid's black emission maps stay)
function heroAura(rig, k) {
  if (!rig.aura) { if (k <= 0) return; rig.aura = new Map(); for (const m of rig.meshes) for (const x of [].concat(m.material)) if (x.uniforms && x.uniforms.parametricRimColorFactor && !rig.aura.has(x)) { rig.aura.set(x, [x.uniforms.parametricRimColorFactor.value.clone(), x.uniforms.parametricRimLiftFactor.value, x.uniforms.rimLightingMixFactor.value]); x.userData.gtaAura = 1; } } // (gtaAura: the low-sun skin tune keeps off it meanwhile)
  for (const [x, v] of rig.aura) {
    const u = x.uniforms;
    u.parametricRimColorFactor.value.copy(v[0]).lerp(_auraC, k); u.parametricRimLiftFactor.value = lerp(v[1], 0.35, k * k); u.rimLightingMixFactor.value = lerp(v[2], 0, k);
  }
  if (k <= 0) { for (const x of rig.aura.keys()) { delete x.userData.gtaAura; if (VRM_SKIN.has(x)) vrmSkinSun(x, VRM_SKIN.k); } rig.aura = null; }
}
const _auraC = new THREE.Color(2.2, 1.45, 0.45);
// the saddle: how far the seated clip's hips sit above / behind the root (so they land on the bike seat)
function heroSeat(rig) {
  const c = CharLib.clip(rig.T, 'drive'); let hy = rig.T.hipsY, hz = 0;
  if (c) for (const t of c.tracks) if (t.name.endsWith('.position')) { hy = t.values[1]; hz = -t.values[2]; break; }
  // Bikes puts the root 0.2 m above the ground, 0.2 m back; the saddle is ~0.86 m above that, 0.16 m further back
  return [0.86 - hy * rig.k, -0.16 - hz * rig.k];
}
// who the hero looks at: the speaker in a scene, the nearest foe in a fight, the camera when idling
function heroLook(P, rig, sp) {
  const L = Cutscene.active ? Cutscene.line : null;
  let t = null;
  if (L) {
    rig.talk = L.who === 'hero' && L.shown < L.text.length;
    vrmMood(rig, L.who === 'hero' ? L : null);
    const a = L.actor || Actors.map[L.who];
    if (L.who === 'hero') { let bd = 64; for (const id in Actors.map) { const q = Actors.map[id], d = dist2(q.pos.x, q.pos.z, P.pos.x, P.pos.z); if (q.R.rig && d < bd && q.anim !== 'lie' && q.anim !== 'carry') { bd = d; t = q.R.rig.bonePos('head', _heroT); } } } // talks to whoever stands closest
    else if (a && a.R && a.R.rig) t = a.R.rig.bonePos('head', _heroT);
  } else vrmMood(rig, null);
  if (!L && !P.atk) {
    let best = null, bd = 64;
    for (const e of Enemies.list) { if (e.dead) continue; const d = dist2(e.pos.x, e.pos.z, P.pos.x, P.pos.z); if (d < bd) { bd = d; best = e; } }
    if (best) t = _heroT.set(best.pos.x, best.y + 1.5 + (Interiors.cur ? 0 : groundH(best.pos.x, best.pos.z)), best.pos.z);
    else if (_hs.idleT > 1.4) { const d = angDiff(P.heading, Math.atan2(Cam.toCam.x, Cam.toCam.z)); if (Math.abs(d) < 1.9) t = camera.position; }
  }
  rig.look(t);
}
const _heroT = new V3();
