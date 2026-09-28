/* ============================================================
   main: game state, wanted level, camera, occlusion cutout,
   save / load, main loop, title + loading, boot
   ============================================================ */
const SAVE_KEY = 'grand-token-auto-sa-v2';
const G = {
  started: false, paused: false, over: false, time: 0, money: 0, heat: 0, lastCrime: -99, inMission: false,
  slowT: 0, slowS: 1, stopT: 0,
  stats: { tokens: 0, burned: 0, punches: 0, kicks: 0, cars: 0, stolen: 0, letters: 0, minions: 0, hqs: 0, deaths: 0, transforms: 0, throws: 0, spent: 0 },
  crime(x) { this.heat = Math.min(6.99, this.heat + x); this.lastCrime = this.time; },
  slow(s, d) { this.slowS = this.slowT > 0 ? Math.min(this.slowS, s) : s; this.slowT = Math.max(this.slowT, d); },
  hitstop(d) { this.stopT = Math.max(this.stopT, d); },
  addMoney(v) { this.money = Math.max(0, Math.round(this.money + v)); },
  moodFor() { if (Boss.cur) return 'boss'; if (Player.isMech()) return 'mech'; if (Story.flags.betrayed && !Tokens.enabled) return 'sad'; return DayNight.night > 0.6 ? 'night' : 'city'; },
  onHQDestroyed(hq) {
    this.stats.hqs++; this.crime(1.1); this.addMoney(2000000 * RPG.m.valuation); RPG.gainXP(500);
    UI.news(hq.news);
    UI.big(hq.name + ' 已下线', '地盘已收复 · 估值大涨', 'green', 3.2);
    if (W.hqs.every((h) => h.dead)) setTimeout(() => UI.big('百模帮全灭！', '全城都是你的地盘了', 'gold', 4), 3600);
  },
  save(auto) {
    const d = {
      v: 2, at: Date.now(), story: Story.save(), rpg: RPG.save(), money: this.money, tokens: Player.tokens, clock: DayNight.clock,
      hqs: W.hqs.filter((h) => h.dead).map((h) => h.id), stats: this.stats, time: this.time, tokensOn: Tokens.enabled,
    };
    const ok = Store.set(SAVE_KEY, d);
    if (auto && ok) UI.toast('已自动保存', 1.4);
    return ok;
  },
  load(d) {
    Story.load(d.story); RPG.load(d.rpg);
    this.money = Math.round(d.money || 0); this.time = d.time || 0; Object.assign(this.stats, d.stats || {});
    DayNight.clock = d.clock ?? DayNight.clock;
    for (const id of d.hqs || []) { const h = W.hqs.find((q) => q.id === id); if (h && !h.dead) h.wreck(); }
    Tokens.enabled = d.tokensOn !== false; if (!Tokens.enabled) Tokens.clearAll();
    Player.rebuildHuman(); Robot.repaint(RPG.paint);
    Player.tokens = d.tokens || 0; Player.hp = RPG.m.maxHp; Player.rhp = RPG.m.maxArmor;
    Player.pos.copy(W.respawn); Player.heading = Math.PI;
  },
  sleepSave() {
    Input.lock = true;
    UI.fade(1, 0.5, () => {
      DayNight.clock = (DayNight.clock + 360) % 1440; Player.hp = RPG.m.maxHp;
      const ok = this.save(false);
      setTimeout(() => UI.fade(0, 0.5, () => { Input.lock = false; UI.big(ok ? '进度已保存' : '存档失败', ok ? `一觉睡到 ${DayNight.timeText()}` : '这个浏览器不让存档', 'green', 2.2); Sfx.stat(); }), 500);
    });
  },
};

const Wanted = {
  spawnT: 0, lastLvl: 0,
  update(dt) {
    const P = Player;
    let nearLegal = false, nd = Infinity;
    for (const c of Cars.list) if (c.state === 'legal' && !c.removed) { const d = dist2(c.pos.x, c.pos.z, P.pos.x, P.pos.z); nd = Math.min(nd, d); if (d < 35 * 35) nearLegal = true; }
    if (G.time - G.lastCrime > 12 && !nearLegal && G.heat > 0) G.heat = Math.max(0, G.heat - 0.11 * (RPG.m.heatDecay || 1) * dt);
    const lvl = Math.floor(G.heat);
    if (lvl > this.lastLvl && G.started && !Cutscene.active) { Sfx.alert(); UI.subtitle(lvl >= 4 ? '法务部倾巢出动！律师函跟雪片儿似的飞过来了。' : '法务部盯上您了，律师函在路上呢。', 3); }
    this.lastLvl = lvl;
    const want = [0, 1, 2, 3, 5, 6, 7][Math.min(6, lvl)];
    this.spawnT -= dt;
    if (this.spawnT <= 0 && P.mode !== 'dead' && !Cutscene.active && !Story.trainFight) { this.spawnT = 2.2; if (Cars.legalCount() < want) Cars.spawnLegal(); }
    Sfx.siren(nd < Infinity ? clamp(1 - Math.sqrt(nd) / 90, 0, 1) : 0);
  },
};

const _camO = new V3(), _camL = new V3(), _camN = new V3(), _camP = new V3(), _camQ = new V3(), _camH = new V3();
// GTA-style third-person camera: orbits behind the hero at street level (mouse / right-thumb drag to look around,
// vehicles swing back behind the car), pulls in when a wall gets in between; the old SA top-down view stays in the V cycle
const Cam = {
  target: new V3(), topT: new V3(), look: new V3(), toCam: new V3(0, 0.83, 0.55), shakeA: 0, orbit: 0, lookY: 0,
  // yaw: the camera's ground-plane forward is (sin yaw, cos yaw) in (x, z) — π looks north, like the old fixed camera
  yaw: Math.PI, pitch: 0, el: 0.3, dist: 7.4, curD: 7.4, pivY: 2.3, lift: 0.4, blend: 0, topH: 26, topD: 17, pm: '', swingT: 0,
  // third person per mode: pivot height over the feet, distance, elevation (rad), look-point lift. On foot it's framed for the
  // ~1.9 m anime hero (中景: head to toe in about half the frame height, like 剑灵's follow camera)
  RIG: { human: [1.45, 5.2, 0.3, 0.12], car: [2.0, 10.5, 0.25, 0.9], bike: [1.5, 5.8, 0.27, 0.18], truck: [3.4, 15.5, 0.26, 1.3], robot: [6.4, 17, 0.28, 1.2], xform: [5, 16, 0.3, 1], dead: [0.6, 6.5, 0.62, 0] },
  // classic top-down [height, distance] per mode
  OFF: { human: [29, 19], car: [38, 24], robot: [45, 29], truck: [50, 31], xform: [30, 20], dead: [22, 14] },
  // V / mouse wheel: 近景 · 中景 · 远景 · 经典俯视
  ZOOMS: [{ d: 0.66, p: -0.04, n: '近景' }, { d: 1, p: 0, n: '中景' }, { d: 1.6, p: 0.1, n: '远景' }, { top: true, n: '经典俯视' }],
  zoom: 1,
  get top() { return !!(this.ZOOMS[this.zoom] || {}).top; },
  shake(a) { this.shakeA = Math.min(2.5, Math.max(this.shakeA, a)); if (a >= 0.25) Input.buzz(10 + a * 30); },
  aspectK() { const a = innerWidth / innerHeight; return a < 1 ? 1 + (1 - a) * 0.12 : 1; },
  // portrait phones: the vertical FOV follows a minimum horizontal one (≈56°), so cross traffic and turns stay in view
  fov() { const a = innerWidth / innerHeight; return a < 1 ? clamp((2 * Math.atan(Math.tan((28 * Math.PI) / 180) / a) * 180) / Math.PI, 46, 90) : 46; },
  cycle(dir = 1, wrap = true) {
    const n = this.ZOOMS.length, z = wrap ? (this.zoom + 1) % n : clamp(this.zoom + dir, 0, n - 1);
    if (z === this.zoom) return;
    const was = this.top; this.zoom = z;
    if (was && !this.top) { this.pitch = 0; this.topT.copy(this.target); }
    Store.set('gta-cam3', this.zoom); UI.toast('镜头：' + this.ZOOMS[this.zoom].n, 1.2);
  },
  rig() {
    const P = Player, z = this.ZOOMS[this.zoom] || this.ZOOMS[1];
    let [pv, d, p, lf] = this.RIG[P.mode === 'car' && P.car && P.car.k && P.car.k.bike ? 'bike' : P.mode] || this.RIG.human;
    if (P.mode === 'xform' && P.xf && P.xf.to === 'human' && P.xf.t > 0.4) [pv, d, p, lf] = this.RIG.human;
    if (!z.top) { d *= z.d; p += z.p; }
    if (Interiors.cur) d = Math.min(d, 7); // (under the rooms' ceilings: no extra lift)
    if (Boss.cur && Boss.cur.kind === 'klaude') { d *= 1.4; p += 0.08; }
    const sp = P.mode === 'car' || P.mode === 'truck' ? Math.abs(P.speed) : 0;
    return [pv, d * (1 + clamp(sp / 70, 0, 0.3)) * this.aspectK(), p, lf];
  },
  wantTop() {
    const P = Player;
    let [h, d] = this.OFF[P.mode] || this.OFF.human;
    h *= 0.86; d *= 1.04;
    if (Interiors.cur) [h, d] = [17 * 1.015, 12 * 1.04];
    if (Boss.cur && Boss.cur.kind === 'klaude') { h += 10; d += 6; }
    return [h, d];
  },
  // how far back the camera may sit before something solid is in the way (snap in, ease back out)
  allow(D) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), ce = Math.cos(this.el), dx = -fx * ce, dy = Math.sin(this.el), dz = -fz * ce;
    _camL.set(this.target.x, this.pivY, this.target.z);
    if (Interiors.cur) {
      // rooms: stay inside the four walls (the low front wall lets the camera back out a little)
      const I = Interiors.built[Interiors.cur]; if (!I) return D;
      const m = 0.7, x0 = I.b.x - I.w / 2 + m, x1 = I.b.x + I.w / 2 - m, z0 = I.b.z - I.d / 2 + m, z1 = I.b.z + I.d / 2 + 2.5;
      let t = D;
      if (dx > 1e-4) t = Math.min(t, (x1 - _camL.x) / dx); else if (dx < -1e-4) t = Math.min(t, (x0 - _camL.x) / dx);
      if (dz > 1e-4) t = Math.min(t, (z1 - _camL.z) / dz); else if (dz < -1e-4) t = Math.min(t, (z0 - _camL.z) / dz);
      return Math.max(1.2, t);
    }
    _camO.set(_camL.x + dx * D, _camL.y + dy * D, _camL.z + dz * D);
    const t = rayWorld(_camL, _camO);
    return t < 1 ? Math.max(1.1, t * D - 0.45) : D;
  },
  snap() {
    const P = Player, [pv, D, p0, lf] = this.rig();
    if (this.top) this.yaw = Math.PI; else if (P.mode !== 'dead') { this.yaw = P.heading; this.pitch = 0; }
    this.el = clamp(p0 + this.pitch, -0.25, 1.3); this.dist = D; this.lift = lf;
    this.target.set(P.pos.x, 0, P.pos.z); this.topT.copy(this.target);
    this.pivY = (Interiors.cur ? 0 : groundH(P.pos.x, P.pos.z)) + pv;
    [this.topH, this.topD] = this.wantTop(); this.lookY = 0;
    this.blend = this.top ? 1 : 0; this.curD = this.top ? D : this.allow(D);
    this.place();
  },
  place() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), ce = Math.cos(this.el), se = Math.sin(this.el), d = this.curD;
    _camL.set(this.target.x, this.pivY, this.target.z);
    _camO.set(_camL.x - fx * ce * d, _camL.y + se * d, _camL.z - fz * ce * d);
    _camL.y += this.lift;
    if (this.blend > 0) {
      const b = smooth(this.blend);
      _camP.set(this.topT.x - fx * this.topD, this.topH, this.topT.z - fz * this.topD); _camQ.set(this.topT.x, this.lookY, this.topT.z);
      _camO.lerp(_camP, b); _camL.lerp(_camQ, b);
    }
    const gy = (Interiors.cur ? 0 : groundH(_camO.x, _camO.z)) + 0.4; if (_camO.y < gy) _camO.y = gy;
    camera.position.copy(_camO); camera.lookAt(_camL); this.look.copy(_camL);
    this.toCam.copy(_camO).sub(_camL).normalize();
    const nr = this.blend > 0.5 ? 1 : 0.3; if (camera.near !== nr) { camera.near = nr; camera.updateProjectionMatrix(); }
    // pulled right in (a tight courtyard or 胡同): don't look out through the inside of the hero's own big head
    const hd = Player.human && Player.human.head3d;
    if (hd) { hd.getWorldPosition(_camH); hd.visible = _camO.distanceTo(_camH) > 1.45 * (hd.scale.x / 0.66); }
  },
  update(rdt) {
    const L = Input.look;
    if (Cutscene.cam(rdt)) { L.dx = L.dy = 0; return; }
    const P = Player, top = this.top, veh = P.mode === 'car' || P.mode === 'truck';
    // manual look: mouse drag / pointer lock, or the right-thumb drag on phones (the classic view stays north-up)
    if (L.dx || L.dy) {
      if (!top) { const s = IS_TOUCH ? 0.0085 : 0.0028; this.yaw = wrapA(this.yaw - L.dx * s); this.pitch = clamp(this.pitch + L.dy * s * 0.85, -0.5, 0.85); }
      L.dx = L.dy = 0;
    }
    if (veh && this.pm !== P.mode) { this.swingT = 1.5; L.t = -1e9; } // just got in: swing round behind the car
    this.pm = P.mode;
    const idle = performance.now() - L.t > (veh ? 1300 : 2200);
    if (top) this.yaw = dampA(this.yaw, Math.PI, 4, rdt);
    else if (P.mode === 'dead') this.yaw += rdt * 0.22;
    else if (veh) {
      // chase cam: swing back behind the car once it moves (or the player steps on it) and nobody's looking around
      const sp = Math.abs(P.speed), go = sp > 2.5 || kd('KeyW', 'ArrowUp') || (Input.joy.on && hyp(Input.joy.x, Input.joy.y) > 0.3);
      if (this.swingT > 0) { this.swingT -= rdt; if (idle) this.yaw = dampA(this.yaw, P.heading, 3.2, rdt); }
      else if (idle && go) this.yaw = dampA(this.yaw, P.heading, clamp(sp / 8, 1.1, 3.4), rdt);
      if (idle) this.pitch = damp(this.pitch, 0, 1.2, rdt);
    } else if (idle && (P.mode === 'human' || P.mode === 'robot')) {
      // running (nearly) straight ahead swings the camera in behind; strafing or running at the camera doesn't
      const vx = P.vel.x, vz = P.vel.z, v = hyp(vx, vz);
      if (v > 3 && (vx * Math.sin(this.yaw) + vz * Math.cos(this.yaw)) / v > 0.88) this.yaw = dampA(this.yaw, Math.atan2(vx, vz), 1.1, rdt);
    }
    const [pv, D, p0, lf] = this.rig(), k = veh ? 9 : 16;
    this.target.x = damp(this.target.x, P.pos.x, k, rdt); this.target.z = damp(this.target.z, P.pos.z, k, rdt); this.target.y = 0;
    this.pivY = damp(this.pivY, (Interiors.cur ? 0 : groundH(P.pos.x, P.pos.z)) + pv + P.y * (P.mode === 'human' ? 0.5 : 0.3), 7, rdt);
    this.el = damp(this.el, clamp(p0 + this.pitch, -0.25, 1.3), 10, rdt); this.lift = damp(this.lift, lf, 3, rdt);
    this.dist = damp(this.dist, D, 3, rdt);
    const bt = top ? 1 : 0; this.blend = Math.abs(this.blend - bt) < 0.003 ? bt : damp(this.blend, bt, 3.2, rdt);
    if (this.blend < 1) { const a = this.allow(this.dist); this.curD = a < this.curD ? a : damp(this.curD, a, 2.2, rdt); }
    if (this.blend > 0) {
      const [h, d] = this.wantTop(), lead = veh ? 0.42 : 0.12;
      this.topT.x = damp(this.topT.x, P.pos.x + clamp(P.vel.x * lead, -18, 18), 5, rdt); this.topT.z = damp(this.topT.z, P.pos.z + clamp(P.vel.z * lead, -18, 18), 5, rdt);
      this.topH = damp(this.topH, h, 2.4, rdt); this.topD = damp(this.topD, d, 2.4, rdt);
    } else { this.topT.copy(this.target); [this.topH, this.topD] = this.wantTop(); }
    this.lookY = damp(this.lookY, 0, 3, rdt); this.yaw = wrapA(this.yaw);
    this.place();
    const X = P.xf;
    if (P.mode === 'xform' && X && X.cine) {
      // transformation: a low orbit that pulls back as the mech grows, then hands back to the normal camera
      const t = X.t, g = easeInOut(clamp((t - 0.8) / 2.0, 0, 1));
      const ang = lerp(-1.15, 0.3, easeInOut(clamp(t / 3.2, 0, 1)));
      const dist = lerp(7.5, 19, g), hh = lerp(2.0, 8.5, g), ly = lerp(1.9, 6.4, easeInOut(clamp((t - 0.9) / 1.8, 0, 1)));
      const w = t < 3.1 ? 1 : 1 - smooth(clamp((t - 3.1) / 0.5, 0, 1));
      _camO.set(P.pos.x + Math.sin(ang) * dist, groundH(P.pos.x, P.pos.z) + hh, P.pos.z + Math.cos(ang) * dist);
      _camL.set(P.pos.x, groundH(P.pos.x, P.pos.z) + ly, P.pos.z);
      _camN.copy(this.look);
      camera.position.lerp(_camO, w); _camN.lerp(_camL, w);
      camera.lookAt(_camN); this.toCam.copy(camera.position).sub(_camN).normalize();
      // come out of it looking at the mech from the front-ish side the orbit ended on
      if (w > 0.5) this.yaw = wrapA(Math.atan2(P.pos.x - camera.position.x, P.pos.z - camera.position.z));
    }
    if (this.shakeA > 0.002) {
      const s = this.shakeA * (this.blend > 0.5 ? 0.55 : 0.3);
      camera.position.x += rand(-s, s); camera.position.y += rand(-s, s) * 0.5; camera.position.z += rand(-s, s);
      this.shakeA *= Math.exp(-7 * rdt);
    }
    this.sun(this.target.x, this.target.z);
  },
  // sun shadows: two texel-snapped cascades fitted ahead of the camera (Render.fitShadow)
  sun(x, z) { Render.fitShadow(x, z); },
  title(rdt) {
    this.orbit += rdt * 0.045;
    const r = 150, a = this.orbit;
    camera.position.set(Math.cos(a) * r, 95, Math.sin(a) * r + 30);
    camera.lookAt(0, 0, 30);
    this.toCam.copy(camera.position).normalize();
    this.target.set(0, 0, 30);
    this.sun(0, 30);
  },
};

// dithered cut-out whenever a building stands between the camera and the hero
const Occl = {
  _t: new V3(), _b: new V3(),
  update() {
    const P = Player;
    if (Interiors.cur || !G.started) { Render.updateCutout(false); return; }
    // outdoor cutscenes: fade whatever stands in the front half of the shot
    if (Cutscene.active) { if (Cutscene.shot && Cutscene.opts.camera !== false) Render.updateCutout(false, _cutLook.x, _cutLook.y, _cutLook.z, 0, 0.5); else Render.updateCutout(false); return; }
    const gh = groundH(P.pos.x, P.pos.z), ty = P.isMech() ? 7.5 : 2.2, c = camera.position;
    this._t.set(P.pos.x, gh + ty, P.pos.z); this._b.set(P.pos.x, gh + 0.6, P.pos.z);
    let hit = false;
    forSolids((c.x + P.pos.x) / 2, (c.z + P.pos.z) / 2, hyp(c.x - P.pos.x, c.z - P.pos.z) / 2 + 2, (s) => {
      if (s.kind === 'monument' || s.kind === 'pillar') return;
      if (segAABB3(c, this._t, s) || segAABB3(c, this._b, s)) { hit = true; return false; }
    });
    // street-level views also fade out whatever is right in front of the lens (trees, lamp posts, signs)
    const nearK = Cam.blend > 0.5 ? 0 : [0.5, 0.42, 0.3][Cam.zoom] || 0.4;
    Render.updateCutout(hit, P.pos.x, gh + ty * 0.6, P.pos.z, P.isMech() ? 200 : 125, nearK);
  },
};

/* ---- pause / mute / cheats ---- */
function togglePause(force) {
  if (!G.started || !$('end').hidden || Cutscene.active) return;
  G.paused = force === undefined ? !G.paused : force;
  $('pause').hidden = !G.paused;
  if (G.paused) { Sfx.engine(false, 0); Sfx.siren(0); Sfx.beam(false); Sfx.hum(0); }
}
function toggleMute() { const m = Sfx.toggleMute(), k = IS_TOUCH ? '' : ' (M)'; $('btn-mute').textContent = m ? '静音中' : '声音'; $('p-mute').textContent = (m ? '打开声音' : '静音') + k; }
onTyped = (s) => {
  if (!G.started) return;
  if (s.endsWith('HESOYAM')) {
    Player.hp = RPG.m.maxHp; Player.rhp = RPG.m.maxArmor; Player.tokens = RPG.m.capacity; G.addMoney(250000);
    UI.big('作弊已激活', 'HESOYAM · 血满 · Token 满 · ¥250,000', 'gold', 2); Sfx.cheat(); delete Input.hit.KeyM; delete Input.hit.KeyA; delete Input.hit.KeyS;
  } else if (s.endsWith('LEAVEMEALONE')) {
    G.heat = 0; for (const c of Cars.list) if (c.state === 'legal') c.remove();
    UI.big('作弊已激活', '法务部：告辞', 'gold', 2); Sfx.cheat(); delete Input.hit.KeyE;
  }
};

/* ---- main loop ---- */
let lastT = performance.now();
const PERF = { n: 0, acc: 0, cpu: 0, fps() { const f = this.n / Math.max(1e-3, this.acc); this.n = 0; this.acc = 0; return f; } };
function worldTick(dt) {
  if (!Interiors.cur) { guard('Cars.update', () => Cars.update(dt)); guard('Peds.update', () => Peds.update(dt)); Monorail.update(dt); }
  Tokens.update(dt); Coins.update(dt); FX.update(dt); Props.update(dt);
  for (const hq of W.hqs) hq.update(dt, G.started && !Interiors.cur ? hyp(hq.cx - Player.pos.x, hq.cz - Player.pos.z) : 999);
  if (W.monument) W.monument.rotation.y += dt * 0.8;
}
let rafId = 0;
function frame(now, pumped) {
  if (!pumped) rafId = 0;
  if (!rafId) rafId = requestAnimationFrame(frame);
  const f0 = performance.now();
  let rdt = (now - lastT) / 1000; lastT = now;
  rdt = clamp(rdt, 0.0005, 0.05);
  if (!G.started) {
    Cam.title(rdt); DayNight.update(rdt * 4); worldTick(rdt); Sky.update(now / 1000); Water.update(now / 1000);
    // the title's fly-over only once its shaders are compiled (a cold first frame would freeze the page for seconds)
    if (!DEV.noRender && Warm.live && !G.starting) Render.render(now / 1000);
    Input.hit = Object.create(null); Input.click = false;
    return;
  }
  if (!$('confirm').hidden) {
    // modal question: Enter / Y accepts, Esc / N declines; nothing else reaches the game this frame
    if (kpRaw('Enter', 'KeyY')) $('confirm-yes').click(); else if (kpRaw('Escape', 'KeyN')) $('confirm-no').click();
    Input.hit = Object.create(null); Input.click = false;
  }
  // menus freeze the world, like SA's pause map/stats screens
  if ((UI.panelOpen || UI.shopId) && !G.paused) {
    if (!G.menuFrozen) { G.menuFrozen = true; Sfx.engine(false, 0); Sfx.siren(0); Sfx.beam(false); Sfx.hum(0); }
    if (UI.panelOpen && kpRaw('Escape', 'Tab')) UI.closePanel(); else if (UI.shopId && kpRaw('Escape')) UI.closeShop();
    Input.hit = Object.create(null); Input.click = false;
    Render.render(now / 1000);
    return;
  }
  G.menuFrozen = false;
  if (!Input.lock && kp('Escape', 'KeyP')) togglePause();
  if (kpRaw('Tab') && !Cutscene.active && !UI.shopId && !Gym.active && !G.paused && !UI.panelOpen) UI.openPanel();
  if (kpRaw('KeyM') && !UI.panelOpen) toggleMute();
  if (kp('KeyV') && !Cutscene.active) Cam.cycle(1);
  if (G.paused) { Input.hit = Object.create(null); Input.click = false; return; }
  let s = 1;
  if (G.stopT > 0) { G.stopT -= rdt; s = 0.06; }
  if (G.slowT > 0) { G.slowT -= rdt; s = Math.min(s, G.slowS); }
  const dt = rdt * s;
  G.time += dt;
  DayNight.update(dt);
  Cutscene.update(rdt); Gym.update(rdt); Buffs.update(dt);
  Player.update(dt, rdt);
  worldTick(dt);
  if (!Interiors.cur) Wanted.update(dt); else Sfx.siren(0);
  Enemies.update(dt); Projectiles.update(dt); Hazards.update(dt); Boss.update(dt); Actors.update(dt);
  guard('Story.update', () => { Story.update(dt); Story.updateTrainCrash(dt); }); Markers.update(dt); Interiors.update(dt);
  Hooks.runUpdate(dt, rdt);
  // burning home / dojo flames live in Story.fireFx (13_story.js); the ruined dojo keeps smouldering here
  if (Story.flags.dojoBurnt && !Interiors.cur && Math.random() < dt * 3) { const s3 = W.special.dojo; if (s3 && s3.x0 !== undefined && dist2((s3.x0 + s3.x1) / 2, (s3.z0 + s3.z1) / 2, Player.pos.x, Player.pos.z) < 160 * 160) FX.smoke(rand(s3.x0, s3.x1), 15, rand(s3.z0, s3.z1), 1, 4, 0.2); }
  Render.hallu = Math.max(Math.min(1, Player.poison) * (Story.flags.antidote || Buffs.has('banlan') ? 0.35 : 1), Buffs.has('drunk') ? 0.28 : 0);
  Cam.update(rdt); Occl.update(); Sky.update(G.time); Water.update(G.time);
  guard('UI.update', () => UI.update(rdt));
  if (!DEV.noRender) Render.render(G.time);
  Input.hit = Object.create(null); Input.click = false;
  PERF.n++; PERF.acc += rdt; PERF.cpu = performance.now() - f0;
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.fov = Cam.fov(); camera.updateProjectionMatrix();
  Render.resize(); FX.resize(); UI.resize();
}
function beginPlay(saveData) {
  if (G.started || G.starting) return; // G.started only flips after the loading screen: a second Enter / click must not queue another start
  G.starting = true; Boot.mark('begin');
  Sfx.init();
  $('title').hidden = true;
  const ld = $('loading'); ld.hidden = false; $('ld-tip').textContent = pick(TIPS);
  const bar = $('ld-fill'); bar.style.transition = 'width .25s ease-out'; bar.style.width = '8%';
  // what the start needs, new or saved game alike: the opening's shaders (priority 0: the hero, the first rooms or the street a
  // saved game wakes up in; capped: anything left compiles as it shows up, behind the loading screen's last frames) and the models
  // of whoever the current mission puts on stage (they stream first). The rest of the city compiles and streams in behind play.
  const t0 = performance.now(), m0 = saveData ? MISSIONS[(saveData.story && saveData.story.prog) || 0] : null;
  const cast = [...new Set(missionCast(m0).flatMap((k) => [CAST_VRM[k].body, CAST_VRM[k].hair]).filter(Boolean).map((k) => 'vrm:' + k))].filter((k) => Assets.reqs.has(k));
  for (const k of cast) Assets.bump(k);
  if (saveData) Warm.bumpNear(W.respawn.x, W.respawn.z, 180);
  const go = () => {
    if (!HeroFace._pOk) guard('portraits', () => HeroFace.portraitsNow());
    G.started = true; UI.showHud(); Boot.mark('playing'); Warm.stats.atGo = renderer.info.programs.length;
    // the first frames draw behind the loading screen: whatever the opening view still needs compiles there, not on screen
    let n = 0; const reveal = () => { if (++n < 3) return requestAnimationFrame(reveal); ld.hidden = true; canvasEl.classList.add('live'); Boot.done(); Warm.stats.atReveal = renderer.info.programs.length; };
    requestAnimationFrame(reveal);
    if (saveData) {
      G.load(saveData);
      Cam.snap(); Markers.sync();
      UI.big('继续游戏', `Lv.${RPG.level} · ${fmtMoney(G.money)}`, 'logo', 2.2);
      const m = MISSIONS[Story.prog]; if (m && m.auto) setTimeout(() => Story.start(m), 1200);
    } else {
      Player.pos.copy(W.spawn); Player.heading = Math.PI; Cam.snap();
      Story.start(MISSIONS[0]);
    }
    Sfx.mood(G.moodFor());
  };
  let pre = false;
  const wait = () => {
    // first, behind the painted loading screen (not in the click handler): what the title didn't get round to — the post
    // chain's frame and the map canvases (the radar needs them); the GPU keeps compiling the start set meanwhile
    if (!pre) { pre = true; guard('warm.post', () => Warm.postFrame()); if (!MapGfx.lv) guard('MapGfx.build', () => { MapGfx.ready(); MapLabels.build(); }); return setTimeout(wait, 30); }
    const el = performance.now() - t0, castIn = cast.every((k) => !Assets.pending(k)), warm = (!Warm.busy(0) && (!HeroFace._pw || HeroFace._pwOk)) || el > 6000;
    bar.style.width = Math.round(8 + 92 * Math.min(1, 0.7 * Warm.frac() + 0.3 * (cast.length ? cast.filter((k) => !Assets.pending(k)).length / cast.length : 1))) + '%';
    if ((warm && castIn) || el > 15000) setTimeout(go, 120); else setTimeout(wait, 60);
  };
  requestAnimationFrame(() => setTimeout(wait, 0));
}
// who a mission puts on stage (givers, speakers, spawned actors): their CAST_VRM kinds, read off its steps
function missionCast(m) {
  const out = new Set(), seen = new Set();
  const walk = (v, d) => {
    if (v == null || d > 7) return;
    if (typeof v === 'string') { if (CAST_VRM[v]) out.add(v); return; }
    if (typeof v === 'function') { const src = String(v); for (const k in CAST_VRM) if (src.includes("'" + k + "'") || src.includes('"' + k + '"')) out.add(k); return; } // (the minified build prints "…")
    if (typeof v !== 'object' || seen.has(v) || v.isObject3D) return;
    seen.add(v); for (const k in v) walk(v[k], d + 1);
  };
  if (m) walk(m, 0);
  return [...out];
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.started && !G.paused && !Cutscene.active) togglePause(true); });

/* ---------------- shader warm-up: every program the frame will use, compiled before it's needed, without freezing the page ----------------
   A cold program costs 20-80 ms on a real GPU (the first visit: ~100 of them). They're compiled a batch at a time with
   KHR_parallel_shader_compile (compile + poll, the page stays live), exactly as the frame renders them (the post chain's linear
   target, the sky environment, the scene's lights); each batch is then drawn once into a 1-pixel scissor of that target, where
   the driver finishes its pipeline. One representative per material × object kind. Warm.add(root, prio) queues more (late
   streamed models); Warm.adopt(fn) builds objects off-scene until their shaders are ready. */
const _warmS = new THREE.Sphere();
const Warm = {
  q: [], seen: new Set(), n: 0, ok: 0, running: false, live: false, done: false, drawing: false, _after: [], stats: { wait: 0, draw: 0, batches: 0, progs: 0 },
  frac() { return this.n ? this.ok / this.n : 1; },
  // anything of this priority or sooner still to compile?
  busy(p) { return this.q.some((it) => it.prio <= p) || !!(this.cur && this.cur.some((it) => it.prio <= p)); },
  // fn once the warm-up has finished (as a Jobs slice); afterStart: once the opening's set (priority 0) is warm
  after(fn) { if (this.done) Jobs.add(fn); else this._after.push(fn); },
  afterStart(fn) { if (this._started0 || this.skip()) Jobs.add(fn); else (this._afterS || (this._afterS = [])).push(fn); },
  // software GL (headless tests): every compile takes seconds, a warm-up would only slow the tests down
  skip() { return !renderer || (Render.soft && !DEV.warm); },
  sig(o) {
    const g = o.geometry, a = g ? Object.keys(g.attributes).join() : '', m = [].concat(o.material).map((x) => x.uuid).join('+');
    return m + '|' + (o.isInstancedMesh ? 'I' + (o.instanceColor ? 'c' : '') : '') + (o.isSkinnedMesh ? 'S' : '') + (o.isBatchedMesh ? 'B' : '') + (o.isPoints ? 'P' : o.isLine ? 'L' : o.isSprite ? 'Z' : '') + (o.receiveShadow ? 'r' : '') + '|' + a + (g && g.morphAttributes.position ? 'M' : '');
  },
  // every drawable under root (default: the whole scene) not seen yet, at this priority (lower = sooner). room: it's only ever
  // seen indoors, under the rooms' studio environment (another PMREM size than the sky's: other programs for PBR materials)
  add(root = scene, prio = 5, room = false) {
    if (this.skip()) { this.done = this._started0 = true; if (!this.live) this.goLive(); for (const fn of this._after.splice(0).concat((this._afterS || []).splice(0))) Jobs.add(fn); return this; }
    const tops = root === scene ? scene.children.filter((c) => !c.userData.room) : [root]; // (the rooms are queued on their own)
    for (const top of tops) top.traverse((o) => {
      if (!o.material || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const s = (room ? 'R' : '') + this.sig(o); if (this.seen.has(s)) return; this.seen.add(s);
      let t = o; while (t.parent && t.parent !== scene) t = t.parent;
      // things drawn wherever you are (sky, particles, screen-wide effects) right after the start set
      this.q.push({ o, top: t, room, prio: o.frustumCulled === false || o.isPoints || o.isSprite ? Math.min(prio, 1) : prio }); this.n++;
    });
    this.done = false; this.run();
    return this;
  },
  // build fn()'s new scene objects off-scene, add them once their programs are ready (streamed props / skies: no hitch)
  adopt(fn) {
    if (this.skip()) return fn();
    const n0 = scene.children.length; fn();
    const add = scene.children.slice(n0); if (!add.length) return;
    const grp = new THREE.Group(); for (const o of add) scene.remove(o); for (const o of add) grp.add(o);
    // (then only the new objects are looked at for anything left to warm, not the whole scene)
    this.compile(grp).then(() => { for (const o of add) { grp.remove(o); scene.add(o); } for (const o of add) this.add(o, 3); }, () => { for (const o of add) scene.add(o); });
  },
  // queued items within r of (x, z) to the front (a saved game wakes up on the street at W.respawn, not in the well)
  bumpNear(x, z, r) {
    for (const it of this.q) {
      if (it.prio <= 0) continue;
      const o = it.o; let s = null;
      if (o.isInstancedMesh || o.isBatchedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); s = o.boundingSphere; }
      else if (o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); s = o.geometry.boundingSphere; }
      if (!s) continue;
      _warmS.copy(s).applyMatrix4(o.matrixWorld);
      if (hyp(_warmS.center.x - x, _warmS.center.z - z) - _warmS.radius < r) it.prio = 0;
    }
  },
  // the programs root uses, compiled like the frame does (post chain target or the canvas), resolved once they're linked
  compile(root, sc = scene, rt = Render.composer ? Render.composer.inputBuffer : null, cam = camera, env = null) {
    if (sc === scene && !DayNight.indoor && !env) Render.updateEnv();
    const prev = renderer.getRenderTarget(), e0 = sc.environment;
    let mats;
    try { if (env) sc.environment = env; renderer.setRenderTarget(rt); mats = renderer.compile(root, cam, sc); } finally { renderer.setRenderTarget(prev); sc.environment = e0; }
    return new Promise((res) => {
      const chk = () => { for (const m of mats) { const p = renderer.properties.get(m).currentProgram; if (!p || p.isReady()) mats.delete(m); } if (!mats.size) res(); else setTimeout(chk, 8); };
      chk();
    });
  },
  // the post chain (bloom, AO, grade: fullscreen passes with scenes of their own) and the interiors' room environment can't be
  // compiled ahead: one frame of an empty scene through the composer, early and out of sight, pays for them in one go
  postFrame() {
    if (this._post || this.skip()) return; this._post = true;
    Render.roomTex();
    const C = Render.composer; if (!C) return;
    const undo = []; for (const c of scene.children) if (!c.isLight && c.visible) { c.visible = false; undo.push(c); }
    this.drawing = true;
    try { C.render(); } finally { this.drawing = false; for (const c of undo) c.visible = true; }
  },
  async run() {
    if (this.running || !renderer) return;
    this.running = true;
    try {
      while (this.q.length) {
        // while playing: a batch only in a frame with time to spare (its own work under ~10 ms; at most 20 frames' wait)
        if (G.started) for (let k = 0; k < 20 && PERF.cpu > 10; k++) await new Promise((r) => requestAnimationFrame(r));
        this.q.sort((a, b) => a.prio - b.prio);
        // predraw draws whole top-level objects, so whole tops are compiled (a member left out would link synchronously inside
        // that draw) and the items queued under the same tops come along (up to a cap: the rest are cheap later, already built)
        // (one environment per batch: the rooms' items under the room PMREM, the rest under the sky's)
        const room = this.q[0].room, n = G.started ? 2 : 8, cap = G.started ? 16 : 48, B = this.cur = [], tops = new Set(), rest = [];
        for (const it of this.q) if (B.length < n && it.room === room) { B.push(it); tops.add(it.top); } else rest.push(it);
        this.q = []; for (const it of rest) (B.length < cap && it.room === room && tops.has(it.top) ? B : this.q).push(it);
        const env = room ? Render.roomTex() : null, t0 = performance.now();
        await Promise.all([...tops].map((t) => this.compile(t, scene, undefined, camera, env)));
        while (G.started && !$('loading').hidden) await new Promise((r) => requestAnimationFrame(r)); // (the start's hidden frames go first)
        const t1 = performance.now();
        guard('warm.draw', () => this.predraw(B, false, env));
        const S = this.stats; S.wait += t1 - t0; S.draw += performance.now() - t1; S.batches++; S.progs = renderer.info.programs.length;
        this.ok += B.length; this.cur = null;
        if (!this._started0 && !this.busy(0)) { this._started0 = true; for (const fn of (this._afterS || []).splice(0)) Jobs.add(fn); }
        if (!G.started) Boot.ui(0.9 + 0.1 * this.frac(), '准备画面 ' + Math.round(this.frac() * 100) + '%');
        await new Promise((r) => requestAnimationFrame(r));
      }
    } finally { this.running = false; }
    this.done = !this.q.length;
    if (!this.done) return this.run();
    if (!this._started0) { this._started0 = true; for (const fn of (this._afterS || []).splice(0)) Jobs.add(fn); }
    if (!this.live) this.goLive();
    for (const fn of this._after.splice(0)) Jobs.add(fn);
  },
  // one draw of each batch member into a 1-px scissor of the frame's target: the driver builds its pipeline now, not mid-game.
  // The scene is cut down to the lights + the batch's tops for that draw (its child list swapped, nothing else touched: no
  // sweep over ~12k children, no world-matrix pass over the rest). shadows: also through the shadow pass (its depth programs)
  predraw(B, shadows = false, env = null) {
    const rt = Render.composer ? Render.composer.inputBuffer : null, tops = new Set(B.map((it) => it.top)), undo = [], kids = scene.children, only = [], sl = [];
    for (const c of kids) if (c.isLight ? c.visible : tops.has(c)) only.push(c);
    for (const it of B) {
      for (let p = it.o; p && p !== scene; p = p.parent) if (!p.visible) { p.visible = true; undo.push([p, 'visible', false]); }
      if (it.o.frustumCulled) { it.o.frustumCulled = false; undo.push([it.o, 'frustumCulled', true]); }
    }
    if (shadows) for (const c of only) if (c.isLight && c.castShadow && c.shadow) sl.push(c);
    const prevT = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate, ac = renderer.autoClear, sc = rt ? rt.scissor.clone() : null, st = rt ? rt.scissorTest : false;
    this.drawing = true; renderer.shadowMap.autoUpdate = shadows && sl.length > 0; renderer.autoClear = false;
    for (const l of sl) l.shadow.needsUpdate = true;
    const e0 = scene.environment; if (env) scene.environment = env;
    scene.children = only;
    try {
      renderer.setRenderTarget(rt);
      if (rt) { rt.scissor.set(0, 0, 1, 1); rt.scissorTest = true; renderer.setRenderTarget(rt); } else { renderer.setScissor(0, 0, 1, 1); renderer.setScissorTest(true); }
      renderer.render(scene, camera);
    } finally {
      scene.children = kids; scene.environment = e0;
      if (rt) { rt.scissor.copy(sc); rt.scissorTest = st; } else renderer.setScissorTest(false);
      renderer.setRenderTarget(prevT); renderer.shadowMap.autoUpdate = sh; renderer.autoClear = ac; this.drawing = false;
      for (let i = undo.length - 1; i >= 0; i--) { const [o, k, v] = undo[i]; o[k] = v; }
      for (const l of sl) l.shadow.needsUpdate = true; // (the maps now hold only the batch: the next real frame redraws them)
    }
  },
  // the shadow pass's depth programs (renderer.compile can't build them; the title's fly-over only makes the city's): one
  // shadow-casting draw of the opening's characters and rooms while the title is idle, not in the first frames after 新游戏
  shadowWarm(roots) {
    if (this.skip() || G.started || G.starting || this._shadowed) return; this._shadowed = true;
    const B = [];
    for (const r of roots) if (r) { let t = r; while (t.parent && t.parent !== scene) t = t.parent; if (t.parent) r.traverse((o) => { if (o.castShadow && o.material && (o.isMesh || o.isPoints || o.isLine)) B.push({ o, top: t }); }); }
    if (B.length) guard('warm.shadow', () => this.predraw(B, true, Render.roomTex())); // (a new game opens indoors)
  },
  // the title's world appears (a fade-in behind the title card)
  goLive() {
    if (!G.started && !G.starting && !DEV.noRender) guard('warm.frame', () => { this.postFrame(); Render.render(0); }); // (shadow passes, the post chain, anything missed)
    this.live = true; Boot.mark('live');
    canvasEl.classList.add('live');
    if (!G.started && !G.starting) { Boot.done(); $('boot-msg').hidden = true; }
  },
};
// the start first (the hero and the prologue's rooms: a new game opens in the well, then the prison), then the city
function warmStart() {
  if (Player.human) Warm.add(Player.human.root, 0).add(Player.human.root, 0, true); // (outdoors and in the rooms: a new game opens in the well)
  guard('warm.portraits', () => HeroFace.refreshPortraits()); // the HUD face + title bust: their studio programs compile alongside
  for (const id of ['well', 'prison']) { const I = guard('warm.room', () => Interiors.build(id)); if (I) Warm.add(I.grp, 0, true); }
}
// then, while the title is up: the post chain's frame (a second or so of driver work on a first visit) and the map's canvases
function warmShaders() {
  Warm.afterStart(() => guard('warm.post', () => Warm.postFrame()));
  Warm.afterStart(() => Warm.shadowWarm([Player.human && Player.human.root, ...['well', 'prison'].map((id) => Interiors.built[id] && Interiors.built[id].grp)]));
  Warm.afterStart(() => guard('MapGfx.pre', () => MapGfx.prebuild()));
  Warm.add(scene, 5);
}
async function boot() {
  if (!renderer) { $('boot-msg').textContent = '你的浏览器不支持 WebGL2，这个游戏跑不起来。换个新一点的 Chrome / Edge / Safari 试试。'; $('boot-msg').className = 'err'; $('boot-bar').hidden = true; return; }
  Boot.mark('boot');
  // files: 'boot' (what the world is built from) and 'play' (the first view's models / clips / sky) download from here on;
  // the rest streams in the background once the title is up
  Assets.start();
  const tier = (t, k0, k1, text) => { const tk = setInterval(() => { Boot.ui(k0 + (k1 - k0) * Assets.progress(t), text); Boot.tip(); }, 90); return Assets.tier(t).then(() => clearInterval(tk)); };
  Boot.ui(0.01, '正在搬运素材……'); Boot.tip();
  FACE_IMG.src = FACE_DATA;
  // decode() can stall in a background tab: whichever of decode / onload / a short timeout comes first
  await Promise.race([FACE_IMG.decode().catch(() => {}), new Promise((r) => { if (FACE_IMG.complete) r(); else { FACE_IMG.onload = r; FACE_IMG.onerror = r; } }), new Promise((r) => setTimeout(r, 1500))]);
  await HeroFace.boot(); // a face the player uploaded earlier replaces the default before any texture is made
  buildAssets();
  // title art right away (the hero's bust: last visit's render, or the drawing until the model is in)
  HeroFace.titleArt(true);
  const tc = $('t-klaude'); tc.getContext('2d').drawImage(HEADS.klaudeEvil.image, 0, 0, tc.width, tc.height);
  const tx = $('t-kodex'); tx.getContext('2d').drawImage(HEADS.kodex.image, 0, 0, tx.width, tx.height);
  Boot.mark('title');
  await tier(0, 0.02, 0.3, '正在搬运素材……'); Boot.mark('assets-boot');
  Boot.ui(0.32, '正在盖四九城……');
  await new Promise((r) => setTimeout(r, 0)); // let the text paint before the synchronous world build
  await buildWorld(); Boot.mark('world');
  Sky.init(); Water.init(); FX.init(); Pillar.init();
  Tokens.init(); guard('Tokens.seed', () => Tokens.seed()); Coins.init();
  RPG.recalc();
  // the scene's lights and the post chain are final from here: programs compiled from now on are the ones the frames use
  guard('Interiors.init', () => Interiors.init()); Render.init();
  await tier(1, 0.62, 0.85, '正在请演员……'); Boot.mark('assets-play');
  Assets.stream(); // everything else, in the background
  Player.init();
  guard('warm.start', warmStart); // the GPU compiles the opening's shaders while the rest sets up
  guard('Cars.init', () => Cars.init()); guard('Peds.init', () => Peds.init());
  guard('Story.init', () => Story.init());
  guard('UI.init', () => UI.init());
  Hooks.runInit();
  DayNight.update(0);
  onResize();
  Boot.ui(0.9, '准备画面……');
  guard('warmup', warmShaders);
  window.addEventListener('resize', onResize);
  { const z = Store.get('gta-cam3'); if (Number.isInteger(z) && z >= 0 && z < Cam.ZOOMS.length) Cam.zoom = z; }
  Mouse.init();
  let wheelT = 0;
  canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!G.started || G.paused || Cutscene.active || UI.panelOpen || !e.deltaY) return;
    const now = performance.now(); if (now - wheelT < 220) return; wheelT = now;
    Cam.cycle(e.deltaY > 0 ? 1 : -1, false);
  }, { passive: false });
  const save = Store.get(SAVE_KEY);
  const bn = $('t-new'), bc = $('t-continue');
  bn.disabled = false; bn.textContent = '新游戏'; Boot.mark('ready');
  bn.addEventListener('click', () => { if (save) UI.confirm('开始新游戏会覆盖浏览器里的存档，确定吗？', () => { Store.del(SAVE_KEY); beginPlay(null); }); else beginPlay(null); });
  if (save && save.v === 2) { bc.hidden = false; bc.textContent = `继续游戏 · Lv.${save.rpg ? save.rpg.level : 1}`; bc.addEventListener('click', () => beginPlay(save)); }
  window.addEventListener('keydown', (e) => { if (!G.started && !G.starting && !e.repeat && e.code === 'Enter' && $('confirm').hidden && $('facepick').hidden) (save ? bc : bn).click(); });
  $('t-face').addEventListener('click', () => UI.openFacePicker());
  if (Warm.live) { Boot.done(); $('boot-msg').hidden = true; }
  rafId = requestAnimationFrame(frame);
  // debug: keep simulating while the tab is hidden (automated play-testing)
  let pumpT = 0;
  const pump = (on) => { clearInterval(pumpT); if (on) pumpT = setInterval(() => { if (document.hidden || performance.now() - lastT > 100) frame(performance.now(), true); }, 16); };
  const tick = (n = 1, ms = 1000 / 60) => { for (let i = 0; i < n; i++) frame(lastT + ms, true); };
  window.GTA = { DEV, Hooks, guard, Roads, Grid, MAPD, Landmarks, City, Signals, pump, tick, scene, camera, G, Player, W, Cars, Tokens, Enemies, Story, MISSIONS, Cam, PERF, Robot, UI, Input, Peds, FX, RPG, Interiors, Boss, Monorail, DayNight, Cutscene, Actors, Render, Coins, Buffs, Props, Markers, EQUIP, SHOPS, begin: beginPlay, warm: warmShaders, Warm, Boot, Jobs, renderer, Touch, Mouse, AutoQ, Weather, Sky, Water, Head3D, HeroFace, HEADS, Assets, MapGfx };
}
boot();
