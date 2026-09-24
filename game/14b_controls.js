/* ============================================================
   controls: phone touch layer — floating left stick, right-half
   drag to look around, thumb-arc action buttons, context buttons
   that only show up when they mean something — plus a last-resort
   FPS watchdog that renders fewer pixels on very slow phones
   ============================================================ */
// per mode: [main button, ...the arc around it] as [key, label]
const TOUCH_ARC = {
  human: [['KeyJ', '拳'], ['KeyK', '踢'], ['Space', '跳']],
  car: [['Space', '手刹'], ['KeyJ', '喇叭']],
  robot: [['KeyJ', '拳'], ['KeyK', '踢'], ['Space', '砸地'], ['KeyL', '光束'], ['KeyR', '大招']],
  truck: [['ShiftLeft', '氮气'], ['Space', '手刹'], ['KeyJ', '喇叭'], ['KeyR', '大招']],
};
// arc slots around the main button: [ring, angle° counter-clockwise from "straight left"]; upright phones fold the outer ring up
const TOUCH_SLOTS = [[1, 0], [1, 47], [1, 94], [2, 18], [2, 54]], TOUCH_SLOTS_P = [[1, 0], [1, 47], [1, 94], [2, 30], [2, 66]];
const Touch = {
  on: false, B: {}, held: new Map(), sig: '', mode: 'human', lastM: '', ct: 0, ctxFns: [], arc: [], ctxs: [], M: null,
  stick: { id: null, cx: 0, cy: 0, R: 58 }, look: { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: false },
  // other modules can offer an action for the 交互 / F button (and read kp('KeyF') themselves): Touch.ctx(() => nearStall ? '买' : '')
  ctx(fn) { this.ctxFns.push(fn); },
  init() {
    this.on = true; document.body.classList.add('touch');
    for (const b of document.querySelectorAll('#touch button[data-k]')) { this.B[b.dataset.k] = b; this.bindBtn(b); }
    const cam = $('tcam'); $('hud-btns').appendChild(cam); $('btn-menu').textContent = '角色'; // no Tab key on a phone
    cam.addEventListener('click', () => { if (G.started && !Cutscene.active) Cam.cycle(1); });
    this.bindStick(); this.bindLook();
    $('touch').addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS pinch-zoom
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 250));
    this.layout();
  },
  bindBtn(b) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
      this.held.set(e.pointerId, b); b.classList.add('press');
      Input.down[k] = true; Input.hit[k] = true; if (k === 'KeyF') Input.hit.KeyE = true;
      if (Gym.active) Input.click = true;
      Input.buzz(8);
    });
    const up = (e) => { if (this.held.get(e.pointerId) !== b) return; this.held.delete(e.pointerId); this.up(b); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  },
  up(b) { b.classList.remove('press'); for (const o of this.held.values()) if (o === b) return; Input.down[b.dataset.k] = false; },
  // let go of everything (overlay hidden, focus lost): nothing stays pressed
  release() {
    const bs = [...this.held.values()]; this.held.clear();
    for (const b of bs) { b.classList.remove('press'); Input.down[b.dataset.k] = false; }
    if (this.stick.id !== null) this.stickEnd();
    this.look.id = null;
  },
  bindStick() {
    const zone = $('joyzone'), base = $('joy'), knob = $('joy-knob'), S = this.stick, J = Input.joy;
    const place = () => { base.style.left = S.cx.toFixed(1) + 'px'; base.style.top = S.cy.toFixed(1) + 'px'; };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (Gym.active) Input.click = true;
      if (S.id !== null) return;
      S.id = e.pointerId; try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      // the stick appears where the thumb lands (kept whole on screen)
      S.cx = clamp(e.clientX, S.R + 10, innerWidth - S.R - 10); S.cy = clamp(e.clientY, S.R + 10, innerHeight - S.R - 10);
      place(); base.classList.add('on'); knob.style.transform = ''; J.on = true; J.x = J.y = 0;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== S.id) return;
      let dx = e.clientX - S.cx, dy = e.clientY - S.cy, l = hyp(dx, dy);
      // drag well past the rim and the stick slides after the thumb
      const lim = S.R * 1.35;
      if (l > lim) {
        const k = (l - lim) / l;
        S.cx = clamp(S.cx + dx * k, S.R + 6, innerWidth - S.R - 6); S.cy = clamp(S.cy + dy * k, S.R + 6, innerHeight - S.R - 6); place();
        dx = e.clientX - S.cx; dy = e.clientY - S.cy; l = hyp(dx, dy);
      }
      const c = Math.min(l, S.R), ux = l ? dx / l : 0, uy = l ? dy / l : 0, m = c / S.R, mm = m < 0.12 ? 0 : (m - 0.12) / 0.88;
      knob.style.transform = `translate(${(ux * c).toFixed(1)}px,${(uy * c).toFixed(1)}px)`;
      J.x = ux * mm; J.y = uy * mm;
      base.classList.toggle('run', mm > 0.92 && (Player.mode === 'human' || Player.mode === 'robot'));
    });
    const end = (e) => { if (e.pointerId === S.id) this.stickEnd(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
  },
  stickEnd() {
    const S = this.stick, J = Input.joy, base = $('joy');
    S.id = null; J.on = false; J.x = J.y = 0;
    base.classList.remove('on', 'run'); base.style.left = base.style.top = ''; $('joy-knob').style.transform = '';
  },
  bindLook() {
    const z = $('lookzone'), L = this.look;
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (Gym.active) Input.click = true;
      if (L.id !== null) return;
      L.id = e.pointerId; L.x = L.sx = e.clientX; L.y = L.sy = e.clientY; L.t = performance.now(); L.moved = false;
      try { z.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== L.id) return;
      const dx = e.clientX - L.x, dy = e.clientY - L.y; L.x = e.clientX; L.y = e.clientY;
      if (!L.moved && hyp(e.clientX - L.sx, e.clientY - L.sy) > 9) L.moved = true;
      if (L.moved && G.started && !G.paused) Input.addLook(dx, dy);
    });
    const end = (e) => {
      if (e.pointerId !== L.id) return;
      L.id = null;
      // a quick tap (no drag) is still a tap on the screen: next line of dialogue, skip the transformation
      if (e.type === 'pointerup' && !L.moved && performance.now() - L.t < 320 && !Gym.active) Input.click = true;
    };
    z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end); z.addEventListener('lostpointercapture', end);
  },
  // label for the 交互 / F button, '' = hide it
  ctxF(m) {
    const P = Player, na = Interiors.nearAct;
    if (na) return na.label && na.label.length <= 4 ? na.label : '交互';
    for (const fn of this.ctxFns) { const l = guard('touch.ctx', fn); if (l) return l; }
    if (m === 'human') {
      if (Interiors.cur) return '';
      // same pick as Cars.enterable (without its side effects): the closest car, or a 共享单车 that's clearly closer
      const x = P.pos.x, z = P.pos.z, c = Cars.nearestDrivable ? Cars.nearestDrivable(x, z, 4.8) : null;
      const b = typeof Bikes === 'object' && Bikes.nearest ? Bikes.nearest(x, z, 2.4) : null;
      if (b && (!c || dist2(x, z, b.x, b.z) < dist2(x, z, c.pos.x, c.pos.z) * 0.8)) return '扫码';
      return c ? '上车' : '';
    }
    if (m === 'car') return '下车';
    if (m === 'robot') {
      if (P.held) return '扔车';
      if (Interiors.cur) return '';
      const fx = P.pos.x + Math.sin(P.heading) * 3, fz = P.pos.z + Math.cos(P.heading) * 3;
      for (const c of Cars.list) if (!c.removed && c.state !== 'held' && c.state !== 'thrown' && c.y <= 2 && dist2(fx, fz, c.pos.x, c.pos.z) < 64) return '抓车';
    }
    return '';
  },
  ctxT(m) {
    if (m === 'human' || m === 'car') return Story.flags.transform && Player.tokens >= CAP && !Interiors.cur ? '变身' : '';
    if (m === 'robot') return Story.flags.truck ? '卡车' : '';
    if (m === 'truck') return '机器人';
    return '';
  },
  // called every frame from UI.update: rebuilds the button set only when something changed
  update(rdt = 0) {
    if (!this.on) return;
    const P = Player;
    if (P.mode !== 'xform') this.mode = P.mode;
    // the context lookups scan cars / bikes: ~10 times a second is plenty (a mode change goes through at once)
    if (this.mode === this.lastM && (this.ct -= rdt) > 0) return;
    this.ct = 0.1; this.lastM = this.mode;
    const m = this.mode, dead = m === 'dead', mech = m === 'robot' || m === 'truck';
    const f = dead ? '' : this.ctxF(m), t = dead ? '' : this.ctxT(m), q = mech ? '解除' : '';
    const spec = !!RPG.spec && mech, ready = RPG.ult >= 100;
    const sig = m + '|' + f + '|' + t + '|' + q + '|' + spec + ready;
    if (sig === this.sig) return;
    this.sig = sig;
    this.arc = dead ? [] : (TOUCH_ARC[m] || TOUCH_ARC.human).filter(([k]) => k !== 'KeyR' || spec);
    this.ctxs = [['KeyF', f], ['KeyT', t], ['KeyQ', q]].filter((c) => c[1]);
    const on = new Set();
    for (const [k, lab] of this.arc.concat(this.ctxs)) { const b = this.B[k]; if (!b) continue; on.add(k); if (b.textContent !== lab) b.textContent = lab; b.hidden = false; }
    for (const k in this.B) if (!on.has(k)) { const b = this.B[k]; if (!b.hidden) { b.hidden = true; for (const [id, o] of this.held) if (o === b) { this.held.delete(id); this.up(b); } } }
    this.B.KeyT.classList.toggle('ready', t === '变身');
    this.B.KeyR.classList.toggle('ready', ready);
    this.place();
  },
  // sizes follow the short screen edge; the main button sits in the bottom-right corner, the rest on arcs around it
  layout() {
    const w = innerWidth, h = innerHeight, land = w > h, s = clamp(Math.min(w, h) / 410, 0.86, 1.3);
    const M = Math.round(80 * s), S = Math.round(60 * s), gap = 12 * s;
    const mx = (land ? 26 : 18) * s, my = (land ? 18 : 24) * s;
    this.M = { land, s, M, S, cx: mx + M / 2, cy: my + M / 2, r1: M / 2 + gap + S / 2, r2: M / 2 + gap * 1.9 + S * 1.5, my };
    this.stick.R = Math.round(58 * s);
    const t = $('touch').style; t.setProperty('--jd', Math.round(this.stick.R * 2.28) + 'px'); t.setProperty('--jk', Math.round(this.stick.R * 1.04) + 'px');
    this.place();
  },
  place() {
    const L = this.M; if (!L) return;
    let top = L.cy + L.M / 2, left = L.cx + L.M / 2;
    this.arc.forEach(([k], i) => {
      const b = this.B[k]; if (!b) return;
      let x, y, sz;
      if (i === 0) { sz = L.M; x = L.cx; y = L.cy; b.classList.add('main'); }
      else {
        const SL = L.land ? TOUCH_SLOTS : TOUCH_SLOTS_P, [ring, a] = SL[i - 1] || SL[4], r = ring === 1 ? L.r1 : L.r2, ang = a * Math.PI / 180;
        sz = L.S; x = L.cx + Math.cos(ang) * r; y = L.cy + Math.sin(ang) * r; b.classList.remove('main');
      }
      b.style.setProperty('--s', sz + 'px'); b.style.setProperty('--x', (x - sz / 2).toFixed(1) + 'px'); b.style.setProperty('--y', (y - sz / 2).toFixed(1) + 'px');
      top = Math.max(top, y + sz / 2); left = Math.max(left, x + sz / 2);
    });
    // context buttons: above the arc (portrait) or just left of it (landscape), stacked upward
    const box = $('tctx');
    if (L.land) { box.style.setProperty('--x', (left + 18 * L.s).toFixed(1) + 'px'); box.style.setProperty('--y', L.my.toFixed(1) + 'px'); }
    else { box.style.setProperty('--x', (14 * L.s).toFixed(1) + 'px'); box.style.setProperty('--y', (top + 16 * L.s).toFixed(1) + 'px'); }
    this.ctxs.forEach(([k], i) => { const b = this.B[k]; if (b) b.style.setProperty('--o', (i * 60) + 'px'); });
  },
};

// ---- FPS watchdog, last resort: Render steps its own tiers (high → med → low); if a phone still crawls on 'low'
// for ~8 s, render fewer pixels (never back up by itself) ----
const AutoQ = {
  last: 0, acc: 0, n: 0, strikes: 0, drops: 0, off: false,
  init() {
    // SwiftShader (headless tests, blocklisted GPUs) crawls whatever we do
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); this.off = /SwiftShader/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { /* ignore */ }
  },
  update() {
    const now = performance.now(), dt = now - this.last; this.last = now;
    if (this.off || DEV.noRender || document.hidden || this.drops >= 2 || Cutscene.active || dt > 250) return; // stalls / loading don't count
    const tiered = Render.Q && typeof Render.quality === 'string';
    if (tiered && (Render.quality !== 'low' || Render.userQ)) { this.acc = this.n = this.strikes = 0; return; } // Render's watchdog (or the player) is in charge
    this.acc += dt; this.n++;
    if (this.acc < 4000) return;
    const fps = (this.n * 1000) / this.acc; this.acc = 0; this.n = 0;
    this.strikes = fps < 24 ? this.strikes + 1 : 0;
    if (this.strikes >= 2) { this.strikes = 0; this.drop(); }
  },
  drop() {
    const pr = renderer.getPixelRatio(); if (pr <= 0.8) { this.drops = 2; return; }
    this.drops++; renderer.setPixelRatio(Math.max(0.75, pr * 0.75)); onResize();
    UI.toast('画面有点卡，分辨率已自动调低', 2.4);
  },
};
Hooks.init(function autoQInit() { AutoQ.init(); });
Hooks.update(function autoQ() { AutoQ.update(); });
// button set / context labels follow the player's state (own hook, so a HUD error elsewhere can't freeze the buttons)
Hooks.update(function touchUpd(dt, rdt) { Touch.update(rdt); });
