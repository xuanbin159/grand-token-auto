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

const _camO = new V3(), _camL = new V3(), _camN = new V3();
const Cam = {
  target: new V3(), toCam: new V3(0, 0.83, 0.55), shakeA: 0, curH: 26, curD: 17, orbit: 0, lookY: 0,
  OFF: { human: [29, 19], car: [38, 24], robot: [45, 29], truck: [50, 31], xform: [30, 20], dead: [22, 14] },
  shake(a) { this.shakeA = Math.min(2.5, Math.max(this.shakeA, a)); },
  aspectK() { const a = innerWidth / innerHeight; return a < 1 ? 1 + (1 - a) * 0.75 : 1; },
  // SA-style camera distance cycling (V / mouse wheel): close · normal · far
  ZOOMS: [[0.64, 1.1, '近景'], [0.86, 1.04, '中景'], [1.12, 1.1, '远景']],
  zoom: 1,
  cycle(dir = 1, wrap = true) {
    const z = wrap ? (this.zoom + 1) % 3 : Math.max(0, Math.min(2, this.zoom + dir));
    if (z === this.zoom) return; this.zoom = z;
    Store.set('gta-sa-cam', this.zoom); UI.toast('镜头：' + this.ZOOMS[this.zoom][2], 1.2);
  },
  want() {
    const P = Player;
    let [h, d] = this.OFF[P.mode] || this.OFF.human;
    const z = this.ZOOMS[this.zoom] || this.ZOOMS[1]; h *= z[0]; d *= z[1];
    if (Interiors.cur) [h, d] = [17 * (0.8 + z[0] * 0.25), 12 * z[1]];
    if (Boss.cur && Boss.cur.kind === 'klaude') { h += 10; d += 6; }
    const ak = this.aspectK(); return [h * ak, d * ak];
  },
  snap() { const [h, d] = this.want(); this.curH = h; this.curD = d; this.target.set(Player.pos.x, 0, Player.pos.z); this.lookY = 0; this.place(); },
  place() {
    camera.position.set(this.target.x, this.curH, this.target.z + this.curD);
    camera.lookAt(this.target.x, this.lookY, this.target.z);
    this.toCam.set(0, this.curH - this.lookY, this.curD).normalize();
  },
  update(rdt) {
    if (Cutscene.cam(rdt)) return;
    const P = Player;
    let [h, d] = this.want();
    const lead = P.mode === 'car' || P.mode === 'truck' ? 0.42 : 0.12;
    const tx = P.pos.x + clamp(P.vel.x * lead, -18, 18), tz = P.pos.z + clamp(P.vel.z * lead, -18, 18);
    this.target.x = damp(this.target.x, tx, 5, rdt); this.target.z = damp(this.target.z, tz, 5, rdt);
    this.curH = damp(this.curH, h, 2.4, rdt); this.curD = damp(this.curD, d, 2.4, rdt);
    this.lookY = damp(this.lookY, 0, 3, rdt);
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
      _camN.set(this.target.x, this.lookY, this.target.z);
      camera.position.lerp(_camO, w); _camN.lerp(_camL, w);
      camera.lookAt(_camN); this.toCam.copy(camera.position).sub(_camN).normalize();
    }
    if (this.shakeA > 0.002) {
      const s = this.shakeA * 0.55;
      camera.position.x += rand(-s, s); camera.position.y += rand(-s, s) * 0.5; camera.position.z += rand(-s, s);
      this.shakeA *= Math.exp(-7 * rdt);
    }
    this.sun(this.target.x, this.target.z);
  },
  sun(x, z) {
    const s = W.sun; if (!s) return;
    const sx = Math.round(x / 4) * 4, sz = Math.round(z / 4) * 4, d = W.sunDir;
    s.position.set(sx + d.x * 160, Math.max(40, d.y * 160), sz + d.z * 160); s.target.position.set(sx, 0, sz); s.target.updateMatrixWorld();
  },
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
  _t: { x: 0, y: 0, z: 0 }, _b: { x: 0, y: 0, z: 0 },
  update() {
    const P = Player;
    if (Interiors.cur || !G.started) { Render.updateCutout(false); return; }
    // outdoor cutscenes: fade whatever stands in the front half of the shot
    if (Cutscene.active) { if (Cutscene.shot && Cutscene.opts.camera !== false) Render.updateCutout(false, _cutLook.x, _cutLook.y, _cutLook.z, 0, 0.5); else Render.updateCutout(false); return; }
    const ty = P.isMech() ? 7.5 : 2.2;
    this._t.x = P.pos.x; this._t.y = ty; this._t.z = P.pos.z; this._b.x = P.pos.x; this._b.y = 0.6; this._b.z = P.pos.z;
    let hit = false;
    for (const s of solidsNear(P.pos.x, P.pos.z + 18, 40)) {
      if (s.kind === 'monument' || s.kind === 'pillar') continue;
      if (segAABB3(camera.position, this._t, s) || segAABB3(camera.position, this._b, s)) { hit = true; break; }
    }
    Render.updateCutout(hit, P.pos.x, ty * 0.6, P.pos.z, P.isMech() ? 200 : 125, [0.62, 0.36, 0][Cam.zoom] || 0);
  },
};

/* ---- pause / mute / cheats ---- */
function togglePause(force) {
  if (!G.started || !$('end').hidden || Cutscene.active) return;
  G.paused = force === undefined ? !G.paused : force;
  $('pause').hidden = !G.paused;
  if (G.paused) { Sfx.engine(false, 0); Sfx.siren(0); Sfx.beam(false); Sfx.hum(0); }
}
function toggleMute() { const m = Sfx.toggleMute(); $('btn-mute').textContent = m ? '静音中' : '声音'; $('p-mute').textContent = m ? '打开声音 (M)' : '静音 (M)'; }
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
const PERF = { n: 0, acc: 0, fps() { const f = this.n / Math.max(1e-3, this.acc); this.n = 0; this.acc = 0; return f; } };
function worldTick(dt) {
  if (!Interiors.cur) { Cars.update(dt); Peds.update(dt); Monorail.update(dt); }
  Tokens.update(dt); Coins.update(dt); FX.update(dt); Props.update(dt);
  for (const hq of W.hqs) hq.update(dt, G.started && !Interiors.cur ? hyp(hq.cx - Player.pos.x, hq.cz - Player.pos.z) : 999);
  if (W.monument) W.monument.rotation.y += dt * 0.8;
}
let rafId = 0;
function frame(now, pumped) {
  if (!pumped) rafId = 0;
  if (!rafId) rafId = requestAnimationFrame(frame);
  let rdt = (now - lastT) / 1000; lastT = now;
  rdt = clamp(rdt, 0.0005, 0.05);
  if (!G.started) {
    Cam.title(rdt); DayNight.update(rdt * 4); worldTick(rdt); Sky.update(now / 1000); Water.update(now / 1000);
    Render.render(now / 1000);
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
  Story.update(dt); Story.updateTrainCrash(dt); Markers.update(dt); Interiors.update(dt);
  if (W.homeSmoke && !Interiors.cur && Math.random() < dt * 6) { const s2 = W.special.home; FX.smoke(rand(s2.x0, s2.x1), 29, rand(s2.z0, s2.z1), 1, 5, 0.25); }
  // freshly burnt buildings keep burning for a while: flames up the front and a flickering orange glow
  for (const [key, id, top] of [['homeFireT', 'home', 26], ['dojoFireT', 'dojo', 17]]) {
    if (!(W[key] > 0) || Interiors.cur) continue;
    W[key] -= dt; const sb = W.special[id]; if (!sb || sb.x0 === undefined) continue;
    const cx = (sb.x0 + sb.x1) / 2, near = dist2(cx, sb.z1, Player.pos.x, Player.pos.z) < 130 * 130;
    if (!near) continue;
    if (Math.random() < dt * 16) FX.fire(rand(sb.x0 + 1, sb.x1 - 1), rand(2, top), sb.z1 + 0.6, 1);
    if (Math.random() < dt * 5) FX.fire(rand(sb.x0 + 1, sb.x1 - 1), top + 1, rand(sb.z0 + 1, sb.z1 - 1), 1);
    FX.light(cx, 8, sb.z1 + 7, 2.4 + Math.random() * 1.1, 0xff6a1a);
  }
  if (Story.flags.dojoBurnt && !Interiors.cur && Math.random() < dt * 3) { const s3 = W.special.dojo; if (s3 && s3.x0 !== undefined && dist2((s3.x0 + s3.x1) / 2, (s3.z0 + s3.z1) / 2, Player.pos.x, Player.pos.z) < 160 * 160) FX.smoke(rand(s3.x0, s3.x1), 15, rand(s3.z0, s3.z1), 1, 4, 0.2); }
  Render.hallu = Math.max(Math.min(1, Player.poison) * (Story.flags.antidote || Buffs.has('banlan') ? 0.35 : 1), Buffs.has('drunk') ? 0.28 : 0);
  Cam.update(rdt); Occl.update(); Sky.update(G.time); Water.update(G.time);
  UI.update(rdt);
  Render.render(G.time);
  Input.hit = Object.create(null); Input.click = false;
  PERF.n++; PERF.acc += rdt;
}

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  Render.resize(); FX.resize(); UI.resize();
}
function beginPlay(saveData) {
  if (G.started) return;
  Sfx.init();
  $('title').hidden = true;
  const ld = $('loading'); ld.hidden = false; $('ld-tip').textContent = pick(TIPS);
  const bar = $('ld-fill'); bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = 'width 1.5s ease-out'; bar.style.width = '100%';
  setTimeout(() => {
    ld.hidden = true;
    G.started = true; UI.showHud();
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
  }, 1650);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.started && !G.paused && !Cutscene.active) togglePause(true); });

async function boot() {
  if (!renderer) { $('boot-msg').textContent = '你的浏览器不支持 WebGL，这个游戏跑不起来。换个新一点的 Chrome / Safari 试试。'; return; }
  FACE_IMG.src = FACE_DATA;
  // decode() can stall in a background tab: whichever of decode / onload / a short timeout comes first
  await Promise.race([FACE_IMG.decode().catch(() => {}), new Promise((r) => { if (FACE_IMG.complete) r(); else { FACE_IMG.onload = r; FACE_IMG.onerror = r; } }), new Promise((r) => setTimeout(r, 1500))]);
  await HeroFace.boot(); // a face the player uploaded earlier replaces the default before any texture is made
  buildAssets();
  buildWorld();
  Sky.init(); Water.init(); FX.init(); Pillar.init();
  Tokens.init(); Tokens.seed(); Coins.init();
  RPG.recalc();
  Player.init();
  Cars.init(); Peds.init();
  Interiors.init(); Story.init();
  UI.init(); Render.init();
  DayNight.update(0);
  // title art
  HeroFace.titleArt();
  const tc = $('t-klaude'); tc.getContext('2d').drawImage(HEADS.klaudeEvil.image, 0, 0, tc.width, tc.height);
  const tx = $('t-kodex'); tx.getContext('2d').drawImage(HEADS.kodex.image, 0, 0, tx.width, tx.height);
  onResize();
  window.addEventListener('resize', onResize);
  { const z = Store.get('gta-sa-cam'); if (z === 0 || z === 1 || z === 2) Cam.zoom = z; }
  let wheelT = 0;
  canvasEl.addEventListener('wheel', (e) => {
    if (!G.started || G.paused || Cutscene.active || UI.panelOpen) return;
    e.preventDefault(); const now = performance.now(); if (now - wheelT < 260) return; wheelT = now;
    Cam.cycle(e.deltaY > 0 ? 1 : -1, false);
  }, { passive: false });
  const save = Store.get(SAVE_KEY);
  const bn = $('t-new'), bc = $('t-continue');
  bn.disabled = false; bn.textContent = '新游戏';
  bn.addEventListener('click', () => { if (save) UI.confirm('开始新游戏会覆盖浏览器里的存档，确定吗？', () => { Store.del(SAVE_KEY); beginPlay(null); }); else beginPlay(null); });
  if (save && save.v === 2) { bc.hidden = false; bc.textContent = `继续游戏 · Lv.${save.rpg ? save.rpg.level : 1}`; bc.addEventListener('click', () => beginPlay(save)); }
  window.addEventListener('keydown', (e) => { if (!G.started && e.code === 'Enter' && $('confirm').hidden && $('facepick').hidden) (save ? bc : bn).click(); });
  $('t-face').addEventListener('click', () => UI.openFacePicker());
  $('boot-msg').hidden = true;
  rafId = requestAnimationFrame(frame);
  // debug: keep simulating while the tab is hidden (automated play-testing)
  let pumpT = 0;
  const pump = (on) => { clearInterval(pumpT); if (on) pumpT = setInterval(() => { if (document.hidden || performance.now() - lastT > 100) frame(performance.now(), true); }, 16); };
  const tick = (n = 1, ms = 1000 / 60) => { for (let i = 0; i < n; i++) frame(lastT + ms, true); };
  window.GTA = { pump, tick, scene, camera, G, Player, W, Cars, Tokens, Enemies, Story, MISSIONS, Cam, PERF, Robot, UI, Input, Peds, FX, RPG, Interiors, Boss, Monorail, DayNight, Cutscene, Actors, Render, Coins, Buffs, Props, Markers, EQUIP, SHOPS, begin: beginPlay, renderer };
}
boot();
