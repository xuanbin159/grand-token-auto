/* ============================================================
   robot: the Token Transformer — robot pose <-> truck pose
   every part has a transform in each pose and tweens between
   ============================================================ */
let RC = { red: 0xd7263d, arm: 0xd7263d, blue: 0x1f4fd1, silver: 0xbac3cd, dark: 0x2a2f38, glass: 0x8fd8ff, gold: 0xffc940, black: 0x15171b };
function setPaintColors(pid) { const P = PAINTS[pid] || PAINTS.classic; RC = Object.assign({}, RC, { red: P.chest, arm: P.arm, blue: P.leg, silver: P.trim }); }
const Robot = {
  root: null, parts: {}, list: [], morph: null, pose: 'robot', paint: 'classic',
  build(paint = 'classic') {
    this.paint = paint; setPaintColors(paint); this.parts = {}; this.list = [];
    const root = new THREE.Group(); root.visible = false; root.scale.setScalar(1.2); scene.add(root); this.root = root;
    const mk = (parts) => { const m = new THREE.Mesh(mergeParts(parts), MAT.vc); m.castShadow = true; return m; };
    const grp = (name, mesh) => { const g = new THREE.Group(); if (mesh) g.add(mesh); root.add(g); this.parts[name] = g; this.list.push(g); g.userData.name = name; return g; };
    grp('chest', mk([
      box(0, 0, 0, 3.4, 2.0, 1.7, RC.red),
      box(-0.8, 0.25, 0.86, 1.3, 1.0, 0.08, RC.glass), box(0.8, 0.25, 0.86, 1.3, 1.0, 0.08, RC.glass),
      box(0, -0.62, 0.87, 0.75, 0.5, 0.08, RC.gold),
      box(0, -1.35, 0, 1.9, 0.8, 1.3, RC.silver), box(0, -1.35, 0.66, 1.6, 0.5, 0.06, RC.dark),
      box(-2.2, 0.55, 0, 1.1, 1.1, 1.6, RC.red), box(2.2, 0.55, 0, 1.1, 1.1, 1.6, RC.red),
      box(-1.25, 1.4, -0.7, 0.35, 2.2, 0.35, RC.silver), box(1.25, 1.4, -0.7, 0.35, 2.2, 0.35, RC.silver),
      box(0, 1.08, 0, 1.3, 0.2, 1.1, RC.blue),
    ]));
    grp('pelvis', mk([box(0, 0, 0, 2.4, 0.8, 1.3, RC.blue), box(0, 0, 0.66, 1.0, 0.5, 0.06, RC.silver)]));
    grp('head', mk([box(0, 0, 0, 1.2, 1.2, 1.2, RC.blue), box(0, 0.75, 0, 0.25, 0.5, 0.9, RC.silver), box(-0.7, 0.3, 0, 0.2, 1.0, 0.3, RC.blue), box(0.7, 0.3, 0, 0.2, 1.0, 0.3, RC.blue)]));
    for (const s of [-1, 1]) {
      const arm = grp(s < 0 ? 'armL' : 'armR', mk([box(0, -0.85, 0, 0.85, 1.7, 0.85, RC.silver)]));
      const elbow = new THREE.Group(); elbow.position.y = -1.7; arm.add(elbow);
      elbow.add(mk([box(0, -0.9, 0, 1.05, 1.8, 1.05, RC.arm), box(0, -2.2, 0, 1.12, 0.9, 1.12, RC.dark), box(s * 0.56, -0.9, 0, 0.1, 1.2, 0.6, RC.silver)]));
      arm.userData.j = elbow;
      const leg = grp(s < 0 ? 'legL' : 'legR', mk([box(0, -0.9, 0, 1.1, 1.8, 1.2, RC.silver)]));
      const knee = new THREE.Group(); knee.position.y = -1.8; leg.add(knee);
      knee.add(mk([box(0, -0.95, 0, 1.3, 1.9, 1.4, RC.blue), box(s * 0.7, -0.9, 0, 0.22, 1.0, 1.0, RC.black), box(0, -2.1, 0.25, 1.4, 0.45, 2.0, RC.blue), box(0, -0.4, 0.71, 0.8, 0.6, 0.06, RC.silver)]));
      leg.userData.j = knee;
    }
    for (let k = 0; k < 6; k++) grp('w' + k, mk([box(0, 0, 0, 0.6, 1.25, 1.25, RC.black), box(0, 0, 0, 0.64, 0.5, 0.5, RC.silver)]));
    this.gear(mk);
    // pose tables: [x,y,z, rx,ry,rz, sx,sy,sz]
    const R = {
      chest: [0, 6.35, 0, 0, 0, 0, 1, 1, 1], pelvis: [0, 4.3, 0, 0, 0, 0, 1, 1, 1], head: [0, 8.05, 0, 0, 0, 0, 1, 1, 1],
      armL: [-2.2, 6.6, 0, 0, 0, 0.12, 1, 1, 1], armR: [2.2, 6.6, 0, 0, 0, -0.12, 1, 1, 1],
      legL: [-0.75, 4.15, 0, 0, 0, 0, 1, 1, 1], legR: [0.75, 4.15, 0, 0, 0, 0, 1, 1, 1],
    };
    const Tk = {
      chest: [0, 2.75, 2.2, 0, 0, 0, 0.82, 1, 1], pelvis: [0, 1.35, 0.5, 0, 0, 0, 1, 1, 1.3], head: [0, 2.4, 1.6, 0, 0, 0, 0.01, 0.01, 0.01],
      armL: [-1.62, 1.3, 1.0, Math.PI / 2, 0, 0, 1, 1, 1], armR: [1.62, 1.3, 1.0, Math.PI / 2, 0, 0, 1, 1, 1],
      legL: [-0.72, 1.6, 0.2, Math.PI / 2, 0, 0, 1, 1, 1], legR: [0.72, 1.6, 0.2, Math.PI / 2, 0, 0, 1, 1, 1],
    };
    const wheelT = [[-1.45, 0.62, 2.3], [1.45, 0.62, 2.3], [-1.45, 0.62, -1.7], [1.45, 0.62, -1.7], [-1.45, 0.62, -3.1], [1.45, 0.62, -3.1]];
    const wheelR = [[-1.5, 2.2, 0], [1.5, 2.2, 0], [-1.5, 1.2, 0], [1.5, 1.2, 0], [-1.5, 3.0, -0.3], [1.5, 3.0, -0.3]];
    for (let k = 0; k < 6; k++) { R['w' + k] = [...wheelR[k], 0, 0, 0, 0.01, 0.01, 0.01]; Tk['w' + k] = [...wheelT[k], 0, 0, 0, 1, 1, 1]; }
    const toT = (a) => ({ p: new V3(a[0], a[1], a[2]), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(a[3], a[4], a[5])), s: new V3(a[6], a[7], a[8]) });
    this.POSE = { robot: {}, truck: {} };
    for (const n in R) { this.POSE.robot[n] = toT(R[n]); this.POSE.truck[n] = toT(Tk[n]); }
    this.snap('robot');
  },
  // everything bought at Kodex's lab / 中关村 (and the big gold chain) is bolted onto the mech
  gear(mk) {
    const P = this.parts, own = (id) => RPG.owns(id), cnt = (id) => RPG.count(id);
    const glow = (parts) => new THREE.Mesh(mergeParts(parts), MAT.glowVC);
    const add = (g, parts, lit) => { if (parts.length) g.add(lit ? glow(parts) : mk(parts)); };
    const hex = (x, y, z, r, c) => gpart(new THREE.CylinderGeometry(r, r, 0.06, 6), c, x, y, z, Math.PI / 2, 0, 0);
    const chest = [], chestLit = [], pel = [], pelLit = [];
    if (own('plate1')) for (const s of [-1, 1]) chest.push(box(s * 2.25, 1.22, 0, 1.45, 0.28, 1.95, RC.silver), box(s * 2.25, 1.03, 0, 1.52, 0.12, 2.0, RC.dark), box(s * 2.93, 0.72, 0, 0.14, 0.75, 1.9, RC.silver));
    if (own('plate3')) {
      chest.push(box(0, 0.98, 0.9, 3.0, 0.22, 0.16, RC.dark), box(-1.62, 0.25, 0.9, 0.16, 1.3, 0.14, RC.silver), box(1.62, 0.25, 0.9, 0.16, 1.3, 0.14, RC.silver), box(0, 0.2, -0.9, 3.0, 1.6, 0.12, RC.silver));
      pel.push(box(-0.85, -0.55, 0.25, 0.75, 0.65, 1.05, RC.silver), box(0.85, -0.55, 0.25, 0.75, 0.65, 1.05, RC.silver));
    }
    if (own('reactive')) {
      for (const x of [-0.56, 0, 0.56]) { chest.push(hex(x, -1.35, 0.68, 0.3, RC.dark)); chestLit.push(hex(x, -1.35, 0.72, 0.22, 0x22d3ee)); }
      for (const x of [-0.72, 0.72]) { pel.push(hex(x, 0, 0.68, 0.3, RC.dark)); pelLit.push(hex(x, 0, 0.72, 0.22, 0x22d3ee)); }
    }
    if (own('nos')) for (const s of [-1, 1]) {
      chest.push(gpart(new THREE.CylinderGeometry(0.22, 0.26, 2.6, 10), RC.silver, s * 0.95, 1.1, -1.05), gpart(new THREE.CylinderGeometry(0.27, 0.27, 0.2, 10), RC.dark, s * 0.95, 2.45, -1.05));
      chestLit.push(gpart(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), 0x60a5fa, s * 0.95, 2.57, -1.05));
    }
    if (own('rtx')) {
      chest.push(box(0, -0.15, -1.3, 2.3, 1.9, 0.8, 0x111318));
      chestLit.push(box(0, 0.83, -1.71, 2.2, 0.06, 0.04, 0xef4444), box(0, -1.13, -1.71, 2.2, 0.06, 0.04, 0x3b82f6), box(-1.12, -0.15, -1.71, 0.06, 1.9, 0.04, 0x22c55e), box(1.12, -0.15, -1.71, 0.06, 1.9, 0.04, 0xa855f7));
      for (const [x, y] of [[-0.55, 0.32], [0.55, 0.32], [-0.55, -0.6], [0.55, -0.6]]) {
        chest.push(gpart(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12), 0x1f2937, x, y, -1.71, Math.PI / 2, 0, 0));
        chestLit.push(gpart(new THREE.TorusGeometry(0.33, 0.035, 4, 16), pick([0xf472b6, 0x22d3ee, 0xfacc15]), x, y, -1.74));
      }
    }
    const cards = Math.min(4, cnt('ctxcard'));
    [[-2.2, 0.8], [2.2, 0.8], [-2.2, 0.32], [2.2, 0.32]].slice(0, cards).forEach(([x, y]) => { chest.push(box(x, y, 0.81, 0.86, 0.26, 0.04, RC.dark)); chestLit.push(box(x, y, 0.84, 0.76, 0.16, 0.04, 0x4ade80)); });
    if (RPG.equip && RPG.equip.neck === 'chain') {
      // 大金链子 hangs across the chest (and on the truck's grille)
      for (let k = 0; k <= 16; k++) { const u = k / 16 * 2 - 1, x = u * 1.15, y = 1.02 - (1 - u * u) * 1.0; chest.push(box(x, y, 0.93, 0.2, 0.14, 0.1, 0xf5c542, k % 2 ? 0 : 0.6)); }
      chest.push(gpart(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16), 0xf5c542, 0, -0.18, 0.96, Math.PI / 2, 0, 0), gpart(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 4), 0x8a6a10, 0, -0.18, 0.98, Math.PI / 2, 0, 0));
    }
    add(P.chest, chest); add(P.chest, chestLit, true); add(P.pelvis, pel); add(P.pelvis, pelLit, true);
    const tubes = Math.min(3, cnt('cooler'));
    for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
      const arm = P['arm' + side], elbow = arm.userData.j, leg = P['leg' + side], knee = leg.userData.j;
      const fa = [], faLit = [], ua = [], uaLit = [], ul = [], sh = [];
      for (let k = 0; k < tubes; k++) { faLit.push(box(s * 0.58, -0.9, 0.36 - k * 0.36, 0.08, 1.6, 0.08, 0x38bdf8)); uaLit.push(box(s * 0.47, -0.85, 0.24 - k * 0.3, 0.07, 1.5, 0.07, 0x38bdf8)); }
      if (own('plate3')) { fa.push(box(s * 0.6, -1.0, 0, 0.1, 1.5, 0.95, RC.silver)); ul.push(box(0, -0.9, 0.64, 0.95, 1.2, 0.12, RC.silver)); ua.push(box(s * 0.47, -0.5, 0, 0.08, 0.7, 0.9, RC.silver)); }
      if (own('plate2')) sh.push(box(0, -1.0, 0.8, 1.05, 1.3, 0.16, RC.silver), box(0, -0.42, 0.87, 0.5, 0.16, 0.06, RC.gold));
      add(elbow, fa); add(elbow, faLit, true); add(arm, ua); add(arm, uaLit, true); add(leg, ul); add(knee, sh);
    }
  },
  repaint(pid) {
    const vis = this.root.visible, pose = this.pose, pos = this.root.position.clone(), rot = this.root.rotation.y;
    scene.remove(this.root);
    this.build(pid); this.snap(pose);
    this.root.visible = vis; this.root.position.copy(pos); this.root.rotation.y = rot;
    TEX.helmet = tex(helmetCanvas(PAINTS[pid]));
    if (Player.faceMatR) { Player.faceMatR.map = TEX.helmet; Player.faceMatR.needsUpdate = true; }
    UI.portraitR = null;
  },
  snap(pose) {
    this.pose = pose; this.morph = null;
    for (const g of this.list) { const t = this.POSE[pose][g.userData.name]; g.position.copy(t.p); g.quaternion.copy(t.q); g.scale.copy(t.s); if (g.userData.j) g.userData.j.rotation.set(0, 0, 0); }
  },
  // scatter all parts into a cloud around the player (for the first transformation)
  scatter() {
    for (const g of this.list) {
      const a = rand(TAU), r = rand(5, 9);
      g.position.set(Math.cos(a) * r, rand(6, 13), Math.sin(a) * r);
      g.quaternion.setFromEuler(new THREE.Euler(rand(TAU), rand(TAU), rand(TAU)));
      g.scale.setScalar(0.01);
      if (g.userData.j) g.userData.j.rotation.set(0, 0, 0);
    }
  },
  morphTo(pose, dur = 0.7, stagger = 0.035, delay = 0, back = false, arc = 1.4) {
    this.pose = pose;
    const order = this.list.slice().sort(() => Math.random() - 0.5);
    this.morph = {
      t: -delay, back, arc,
      items: order.map((g, k) => ({ g, d: k * stagger, dur: Math.max(0.2, dur - k * stagger * 0.5), p0: g.position.clone(), q0: g.quaternion.clone(), s0: g.scale.clone(), to: this.POSE[pose][g.userData.name], clicked: false })),
    };
    for (const g of this.list) if (g.userData.j) g.userData.j.rotation.set(0, 0, 0);
  },
  // the transformation: parts fly in from a wide spiral, one after another, and clunk into place
  scatterWide() {
    this.list.forEach((g, k) => {
      const a = (k / this.list.length) * TAU * 1.6 + rand(0.4), r = rand(9, 13);
      g.position.set(Math.cos(a) * r, rand(3, 11), Math.sin(a) * r);
      g.quaternion.setFromEuler(new THREE.Euler(rand(TAU), rand(TAU), rand(TAU)));
      g.scale.setScalar(g.userData.name[0] === 'w' ? 0.01 : 0.55);
      if (g.userData.j) g.userData.j.rotation.set(0, 0, 0);
    });
  },
  assemble(delays, dur = 0.46) {
    this.pose = 'robot';
    this.morph = { t: 0, back: true, arc: 2.2, cine: true, items: this.list.map((g) => ({ g, d: delays[g.userData.name] ?? 0.3, dur, p0: g.position.clone(), q0: g.quaternion.clone(), s0: g.scale.clone(), to: this.POSE.robot[g.userData.name], clicked: g.userData.name[0] === 'w' })) };
  },
  explodeOut() {
    this.morph = {
      t: 0, back: false, arc: 0, out: true,
      items: this.list.map((g) => {
        const a = rand(TAU), r = rand(6, 11);
        return { g, d: rand(0.12), dur: 0.55, p0: g.position.clone(), q0: g.quaternion.clone(), s0: g.scale.clone(), to: { p: new V3(Math.cos(a) * r, rand(1, 8), Math.sin(a) * r), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(TAU), rand(TAU), rand(TAU))), s: new V3(0.01, 0.01, 0.01) }, clicked: true };
      }),
    };
  },
  updateMorph(dt) {
    const m = this.morph;
    if (!m) return true;
    m.t += dt;
    let done = true;
    for (const it of m.items) {
      const u = clamp((m.t - it.d) / it.dur, 0, 1);
      if (u < 1) done = false;
      const e = m.back ? clamp(easeOutBack(u), 0, 1.15) : easeInOut(u);
      it.g.position.lerpVectors(it.p0, it.to.p, e);
      if (m.arc) it.g.position.y += Math.sin(Math.PI * clamp(u, 0, 1)) * m.arc;
      it.g.quaternion.copy(it.q0).slerp(it.to.q, clamp(e, 0, 1));
      it.g.scale.lerpVectors(it.s0, it.to.s, clamp(e, 0, 1.05));
      if (u >= 1 && !it.clicked) {
        it.clicked = true;
        const wp = new V3(); it.g.getWorldPosition(wp);
        if (m.cine) {
          m.n = (m.n || 0) + 1; Sfx.clunk(m.n); FX.sparks(wp.x, wp.y, wp.z, 10, [1, 0.85, 0.5]); FX.light(wp.x, wp.y, wp.z, 1.2, 0xffc060); Cam.shake(0.35);
          if (it.g.userData.name.startsWith('arm') || it.g.userData.name.startsWith('leg')) Sfx.servo(0.22);
        } else if (Math.random() < 0.5) { FX.sparks(wp.x, wp.y, wp.z, 3, [0.7, 0.9, 1]); if (!m.out && (m.n = (m.n || 0) + 1) <= 4) Sfx.clunk(m.n); }
      }
    }
    if (done) this.morph = null;
    return done;
  },
  // procedural animation of limbs in robot pose
  animate(dt, st) {
    if (this.morph || this.pose !== 'robot') return;
    const P = this.parts, walk = st.walk, ph = st.ph;
    const sw = Math.sin(ph) * 0.62 * walk, kneeL = Math.max(0, -Math.sin(ph)) * 0.9 * walk, kneeR = Math.max(0, Math.sin(ph)) * 0.9 * walk;
    let lx = sw, rx = -sw, alx = -sw * 0.7, arx = sw * 0.7, elL = -0.2, elR = -0.2, bodyTw = 0, bodyLean = 0, crouch = Math.abs(Math.sin(ph)) * 0.22 * walk;
    let alz = 0.12, arz = -0.12;
    const a = st.atk;
    if (a) {
      const u = clamp(a.t / a.def.dur, 0, 1), hitU = a.def.hit / a.def.dur;
      const strike = u < hitU ? easeIn(u / hitU) : 1 - easeOut((u - hitU) / (1 - hitU)) * 0.9;
      const wind = u < hitU * 0.5 ? u / (hitU * 0.5) : 0;
      if (a.def.anim === 'punchR' || a.def.anim === 'punchL') {
        const R = a.def.anim === 'punchR';
        const v = -1.62 * strike + 0.5 * wind * (1 - strike);
        if (R) { arx = v; elR = -0.1 * strike - 0.9 * (1 - strike); arz = -0.05; } else { alx = v; elL = -0.1 * strike - 0.9 * (1 - strike); alz = 0.05; }
        bodyTw = (R ? -0.35 : 0.35) * strike;
      } else if (a.def.anim === 'spin') {
        arx = -1.5; elR = -0.1; bodyTw = -TAU * easeOut(u); crouch = 0.2;
      } else if (a.def.anim === 'upper') {
        arx = lerp(0.6, -2.7, strike); elR = lerp(-1.4, -0.3, strike); bodyTw = -0.3 * strike; bodyLean = -0.15 * strike; crouch = 0.5 * (1 - strike) * (u < hitU ? 1 : 0);
      } else if (a.def.anim === 'kick') {
        rx = -1.55 * strike; bodyLean = 0.22 * strike; alx = 0.5 * strike; arx = 0.5 * strike;
      }
    }
    if (st.slam) { alx = arx = -2.9; elL = elR = -0.4; }
    if (st.slamLand > 0) { const k = st.slamLand; alx = arx = lerp(-2.9, -0.6, 1 - k); crouch = 1.1 * k; }
    if (st.held) { alx = arx = -3.0; elL = elR = -0.35; alz = 0.25; arz = -0.25; }
    if (st.throwT > 0) { alx = arx = lerp(-3.0, -1.2, 1 - st.throwT / 0.3); }
    if (st.beam) { alx = arx = -0.5; alz = 0.7; arz = -0.7; elL = elR = -1.2; bodyLean = -0.08; }
    if (st.pose > 0) { // the end of the transformation: fist to the sky
      const q = st.pose; arx = lerp(arx, -2.85, q); elR = lerp(elR, -0.12, q); arz = lerp(arz, 0.38, q);
      alx = lerp(alx, 0.5, q); elL = lerp(elL, -1.9, q); alz = lerp(alz, -0.15, q); bodyLean = -0.12 * q; crouch = Math.max(crouch, 0.3 * q);
    }
    const k = Math.min(1, dt * 18);
    const setX = (g, v) => { g.rotation.x += (v - g.rotation.x) * k; };
    setX(P.legL, lx); setX(P.legR, rx);
    P.legL.userData.j.rotation.x += (kneeL - P.legL.userData.j.rotation.x) * k;
    P.legR.userData.j.rotation.x += ((a && a.def.anim === 'kick' ? 0 : kneeR) - P.legR.userData.j.rotation.x) * k;
    setX(P.armL, alx); setX(P.armR, arx);
    P.armL.rotation.z += (alz - P.armL.rotation.z) * k; P.armR.rotation.z += (arz - P.armR.rotation.z) * k;
    P.armL.userData.j.rotation.x += (elL - P.armL.userData.j.rotation.x) * k;
    P.armR.userData.j.rotation.x += (elR - P.armR.userData.j.rotation.x) * k;
    const base = this.POSE.robot;
    const cy = -crouch;
    P.chest.position.y = base.chest.p.y + cy; P.head.position.y = base.head.p.y + cy; P.pelvis.position.y = base.pelvis.p.y + cy;
    P.armL.position.y = base.armL.p.y + cy; P.armR.position.y = base.armR.p.y + cy;
    P.legL.position.y = base.legL.p.y + cy; P.legR.position.y = base.legR.p.y + cy;
    if (!a || a.def.anim !== 'spin') P.chest.rotation.y = wrapA(P.chest.rotation.y);
    P.chest.rotation.y += (bodyTw - P.chest.rotation.y) * k; P.chest.rotation.x += (bodyLean - P.chest.rotation.x) * k;
    P.head.rotation.y = P.chest.rotation.y * 0.5;
  },
};
