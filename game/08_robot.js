/* ============================================================
   robot: the Token Transformer — robot pose <-> truck pose
   every part has a transform in each pose and tweens between
   ============================================================ */
let RC = { red: 0xd7263d, arm: 0xd7263d, blue: 0x1f4fd1, silver: 0xbac3cd, dark: 0x2a2f38, glass: 0x8fd8ff, gold: 0xffc940, black: 0x15171b };
function setPaintColors(pid) { const P = PAINTS[pid] || PAINTS.classic; RC = Object.assign({}, RC, { red: P.chest, arm: P.arm, blue: P.leg, silver: P.trim }); }
// ---- armour kit: every part is a bevelled panel (rounded box) or a turned piece in vehicle PBR (06a VB / carMat):
// metallic clearcoat paint, chrome, dark steel, tinted glass; lamps and cores glow through the bloom. Parts are
// { geo, c | s, m, r }: box() parts from 02_assets work too (a unit box becomes a rounded one, bevel r automatic) ----
let RS = null;
const rglow = (hex, k = 1.6, grp = 2) => vsurf(hex, [0.25, 0, 0.6, 0], hex, k, grp);
function robotSurfs() {
  const paint = (c) => vsurf(c, [0.26, 0.5, 1, 0]);
  return RS = { red: paint(RC.red), arm: paint(RC.arm), blue: paint(RC.blue), silver: vsurf(RC.silver, [0.22, 0.9, 0.5, 0]), chrome: SF.chrome,
    dark: vsurf(RC.dark, [0.4, 0.75, 0.3, 0]), black: vsurf(RC.black, [0.55, 0.3, 0.15, 0]), glass: vsurf(0x1b2a3a, [0.03, 0.1, 1, 0]), gold: vsurf(RC.gold, [0.2, 1, 0.7, 0]),
    lamp: rglow(0xfff4dc, 1.1, 0), eye: rglow(0x7fdcff, 2.2), amber: rglow(0xffa21a, 1.2, 0), core: rglow(0xffc940, 1.8) };
}
function robotSurf(c, lit) {
  if (lit) return rglow(c, 1.6);
  const S = RS; for (const k of ['red', 'arm', 'blue', 'silver', 'dark', 'black', 'gold']) if (c === RC[k]) return S[k];
  return c === RC.glass ? S.glass : vsurf(c, [0.35, 0.5, 0.6, 0]);
}
const _dp = new V3(), _dq = new THREE.Quaternion(), _ds = new V3(), _rOne = new V3(1, 1, 1);
function armorGeo(parts, lit) {
  const vb = new VB();
  for (const p of parts) {
    const s = p.s || robotSurf(p.c, lit);
    if (p.vb) { vb.addG(p.geo, p.m); continue; }
    if (p.geo === _BOX) {
      p.m.decompose(_dp, _dq, _ds);
      const w = Math.abs(_ds.x), h = Math.abs(_ds.y), d = Math.abs(_ds.z), mn = Math.min(w, h, d);
      vb.add(rboxGeo(w, h, d, p.r ?? Math.min(0.14, mn * 0.22), mn > 0.4 ? 2 : 1), new THREE.Matrix4().compose(_dp, _dq, _rOne), s);
    } else vb.add(p.geo, p.m, s);
  }
  return vb.geometry();
}
// a bevelled panel / a turned piece (axis y unless rotated)
const rbx = (x, y, z, w, h, d, s, r, rx = 0, ry = 0, rz = 0) => ({ geo: _BOX, s, r, m: MX(x, y, z, rx, ry, rz, w, h, d) });
const rcyl = (x, y, z, rad, h, s, rx = 0, ry = 0, rz = 0, n = 14) => ({ geo: cylGeo(rad, rad, h, n), s, m: MX(x, y, z, rx, ry, rz) });
const robotMat = () => carMat(0xffffff, { dirt: false });
const Robot = {
  root: null, parts: {}, list: [], morph: null, pose: 'robot', paint: 'classic', head3d: true, spin: 0, steer: 0, _lh: null,
  build(paint = 'classic') {
    this.paint = paint; setPaintColors(paint); this.parts = {}; this.list = [];
    const root = new THREE.Group(); root.visible = false; root.scale.setScalar(1.2); scene.add(root); this.root = root;
    const S = robotSurfs(), PI = Math.PI, H = PI / 2;
    const mk = (parts, lit) => { const m = new THREE.Mesh(armorGeo(parts, lit), robotMat()); m.geometry._robot = true; m.castShadow = true; m.receiveShadow = true; return m; };
    const grp = (name, mesh) => { const g = new THREE.Group(); if (mesh) g.add(mesh); root.add(g); this.parts[name] = g; this.list.push(g); g.userData.name = name; return g; };
    const both = (f) => [...f(-1), ...f(1)];
    // chest = the cab: broad chest over a narrower waist, windscreens in chrome frames, the radiator grille and headlamps,
    // shoulder pods with roof-marker lamps, chrome exhaust stacks, a vented back pack
    const chest = grp('chest', mk([
      rbx(0, 0.28, 0, 3.4, 1.45, 1.7, S.red, 0.22), rbx(0, -0.62, -0.05, 3.0, 0.72, 1.5, S.red, 0.16),
      ...both((s) => [rbx(s * 0.8, 0.28, 0.86, 1.44, 1.12, 0.06, S.silver, 0.05), rbx(s * 0.8, 0.28, 0.9, 1.3, 1.0, 0.06, S.glass, 0.06), rbx(s * 0.8, -0.26, 0.93, 1.0, 0.03, 0.03, S.black, 0.01, 0, 0, s * 0.1)]),
      rbx(0, 0.28, 0.9, 0.2, 1.2, 0.12, S.silver, 0.05),
      { geo: cylGeo(0.34, 0.34, 0.08, 6), s: S.gold, m: MX(0, -0.62, 0.74, H, 0, 0) },
      rbx(0, -1.35, 0, 1.9, 0.8, 1.3, S.silver, 0.14), rbx(0, -1.35, 0.64, 1.6, 0.52, 0.06, S.dark, 0.03),
      ...Array.from({ length: 7 }, (_, k) => rbx(-0.66 + k * 0.22, -1.35, 0.68, 0.07, 0.5, 0.05, S.chrome, 0.02)),
      ...both((s) => [rbx(s * 1.25, -0.72, 0.72, 0.62, 0.3, 0.08, S.silver, 0.04), rbx(s * 1.2, -0.62, 0.72, 0.03, 0.66, 0.06, S.black, 0.01)]),
      ...both((s) => [rbx(s * 2.2, 0.55, 0, 1.1, 1.1, 1.6, S.red, 0.24), rbx(s * 2.2, 1.12, 0, 0.96, 0.1, 1.4, S.silver, 0.04), rbx(s * 2.72, 0.5, 0, 0.1, 0.7, 1.2, S.silver, 0.04)]),
      ...both((s) => [rcyl(s * 1.25, 1.4, -0.7, 0.17, 2.2, S.chrome), rcyl(s * 1.25, 2.52, -0.7, 0.2, 0.1, S.dark), rbx(s * 1.25, 1.1, -0.5, 0.3, 1.1, 0.05, S.silver, 0.02)]),
      rbx(0, 1.08, 0, 1.3, 0.2, 1.1, S.blue, 0.07),
      rbx(0, 0.2, -0.95, 2.2, 1.4, 0.3, S.dark, 0.12), ...Array.from({ length: 4 }, (_, k) => rbx(0, -0.2 + k * 0.26, -1.12, 1.6, 0.07, 0.05, S.black, 0.02)),
    ]));
    chest.add(mk([{ geo: cylGeo(0.2, 0.2, 0.1, 6), s: S.core, m: MX(0, -0.62, 0.78, H, 0, 0) }, ...both((s) => [rbx(s * 1.25, -0.72, 0.77, 0.52, 0.2, 0.06, S.lamp, 0.03), rbx(s * 2.2, 1.18, 0.62, 0.34, 0.06, 0.08, S.amber, 0.02)])]));
    // pelvis: armoured hips with a glowing buckle
    const pel = grp('pelvis', mk([rbx(0, 0, 0, 2.4, 0.8, 1.3, S.blue, 0.18), rbx(0, 0, 0.66, 1.0, 0.5, 0.06, S.silver, 0.05), rcyl(0, -0.12, 0, 0.3, 2.62, S.dark, 0, 0, H)]));
    pel.add(mk([rbx(0, 0, 0.7, 0.54, 0.08, 0.04, S.eye, 0.02)]));
    // head: helmet, silver face plate, a glowing visor, crest fin, ear antennas
    const head = grp('head', mk([
      rbx(0, 0, 0, 1.2, 1.2, 1.2, S.blue, 0.28), rbx(0, -0.28, 0.56, 0.8, 0.52, 0.12, S.silver, 0.1), rbx(0, 0.12, 0.6, 0.94, 0.24, 0.06, S.black, 0.05),
      rbx(0, 0.75, 0.05, 0.2, 0.5, 0.95, S.silver, 0.08), rbx(0, 0.52, 0.56, 0.16, 0.3, 0.14, S.silver, 0.05),
      ...both((s) => [rbx(s * 0.7, 0.3, 0, 0.2, 1.0, 0.3, S.blue, 0.08), rcyl(s * 0.7, 0.95, 0, 0.05, 0.4, S.chrome), rbx(s * 0.3, -0.3, 0.63, 0.12, 0.3, 0.02, S.dark, 0.01)]),
    ]));
    head.add(mk([rbx(0, 0.12, 0.635, 0.8, 0.09, 0.03, S.eye, 0.02)]));
    for (const s of [-1, 1]) {
      // arms: shoulder joint, silver upper arm with a piston; elbow joint, forearm (paint) with chrome trim, wrist band, a heavy fist
      const arm = grp(s < 0 ? 'armL' : 'armR', mk([rcyl(0, 0, 0, 0.46, 1.0, S.dark, 0, 0, H), rbx(0, -0.85, 0, 0.85, 1.7, 0.85, S.silver, 0.14), rcyl(0, -0.9, 0.46, 0.07, 1.2, S.chrome)]));
      const elbow = new THREE.Group(); elbow.position.y = -1.7; arm.add(elbow);
      elbow.add(mk([
        rcyl(0, 0, 0, 0.38, 1.12, S.dark, 0, 0, H), rbx(0, -0.9, 0, 1.05, 1.8, 1.05, S.arm, 0.18), rbx(s * 0.56, -0.9, 0, 0.1, 1.2, 0.6, S.silver, 0.04),
        rbx(0, -0.5, 0.54, 0.6, 0.04, 0.03, S.black, 0.01), rbx(0, -1.72, 0, 1.12, 0.18, 1.12, S.dark, 0.05), rbx(0, -2.2, 0, 1.12, 0.9, 1.12, S.dark, 0.22),
        rbx(0, -1.25, 0.53, 0.46, 0.05, 0.03, S.eye, 0.01), rbx(s * 0.53, -1.25, 0.2, 0.03, 0.05, 0.36, S.eye, 0.01),
        ...Array.from({ length: 4 }, (_, k) => rbx(-0.39 + k * 0.26, -2.42, 0.44, 0.22, 0.26, 0.3, S.silver, 0.07)),
      ]));
      arm.userData.j = elbow;
      // legs: silver thigh with twin pistons; knee joint, shin (paint) with a front plate and the side tyre, foot with a toe cap
      const leg = grp(s < 0 ? 'legL' : 'legR', mk([rcyl(0, 0, 0, 0.5, 1.12, S.dark, 0, 0, H), rbx(0, -0.9, 0, 1.1, 1.8, 1.2, S.silver, 0.16), rcyl(-0.3, -0.9, 0.62, 0.07, 1.4, S.chrome), rcyl(0.3, -0.9, 0.62, 0.07, 1.4, S.chrome)]));
      const knee = new THREE.Group(); knee.position.y = -1.8; leg.add(knee);
      knee.add(mk([
        rcyl(0, 0, 0, 0.52, 1.24, S.dark, 0, 0, H), rbx(0, -0.95, 0, 1.3, 1.9, 1.4, S.blue, 0.2), rbx(0, -0.85, 0.72, 1.0, 1.2, 0.12, S.blue, 0.08, -0.06),
        { geo: wheelGeo('steel'), vb: true, m: MX(s * 0.66, -0.9, 0, 0, 0, 0, s * 0.3, 0.5, 0.5) },
        rbx(0, -2.1, 0.25, 1.4, 0.45, 2.0, S.blue, 0.16), rbx(0, -2.12, 1.2, 1.3, 0.36, 0.3, S.silver, 0.1), rbx(0, -2.02, -0.72, 1.2, 0.3, 0.3, S.dark, 0.08),
        rbx(0, -0.4, 0.71, 0.8, 0.6, 0.1, S.silver, 0.08), rcyl(0, -0.4, 0.77, 0.08, 0.04, S.gold, H, 0, 0, 8),
        rbx(0, -1.24, 0.815, 0.56, 0.05, 0.03, S.eye, 0.01), rbx(0, -1.34, 0.82, 0.4, 0.05, 0.03, S.eye, 0.01),
      ]));
      leg.userData.j = knee;
    }
    // the truck's six wheels (hidden in robot pose): tyres on steel rims, rims facing out
    const wx = [-1, 1, -1, 1, -1, 1];
    for (let k = 0; k < 6; k++) grp('w' + k, mk([{ geo: wheelGeo('steel'), vb: true, m: MX(0, 0, 0, 0, 0, 0, wx[k] * 0.6, 0.62, 0.62) }])).rotation.order = 'YXZ';
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
    const add = (g, parts, lit) => { if (parts.length) g.add(mk(parts, lit)); };
    const hex = (x, y, z, r, c) => gpart(cylGeo(r, r, 0.06, 6), c, x, y, z, Math.PI / 2, 0, 0);
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
      chest.push(gpart(cylGeo(0.22, 0.26, 2.6, 10), RC.silver, s * 0.95, 1.1, -1.05), gpart(cylGeo(0.27, 0.27, 0.2, 10), RC.dark, s * 0.95, 2.45, -1.05));
      chestLit.push(gpart(cylGeo(0.2, 0.2, 0.08, 10), 0x60a5fa, s * 0.95, 2.57, -1.05));
    }
    if (own('rtx')) {
      chest.push(box(0, -0.15, -1.3, 2.3, 1.9, 0.8, 0x111318));
      chestLit.push(box(0, 0.83, -1.71, 2.2, 0.06, 0.04, 0xef4444), box(0, -1.13, -1.71, 2.2, 0.06, 0.04, 0x3b82f6), box(-1.12, -0.15, -1.71, 0.06, 1.9, 0.04, 0x22c55e), box(1.12, -0.15, -1.71, 0.06, 1.9, 0.04, 0xa855f7));
      for (const [x, y] of [[-0.55, 0.32], [0.55, 0.32], [-0.55, -0.6], [0.55, -0.6]]) {
        chest.push(gpart(cylGeo(0.34, 0.34, 0.06, 12), 0x1f2937, x, y, -1.71, Math.PI / 2, 0, 0));
        chestLit.push(gpart(new THREE.TorusGeometry(0.33, 0.035, 4, 16), pick([0xf472b6, 0x22d3ee, 0xfacc15]), x, y, -1.74));
      }
    }
    const cards = Math.min(4, cnt('ctxcard'));
    [[-2.2, 0.8], [2.2, 0.8], [-2.2, 0.32], [2.2, 0.32]].slice(0, cards).forEach(([x, y]) => { chest.push(box(x, y, 0.81, 0.86, 0.26, 0.04, RC.dark)); chestLit.push(box(x, y, 0.84, 0.76, 0.16, 0.04, 0x4ade80)); });
    if (RPG.equip && RPG.equip.neck === 'chain') {
      // 大金链子 hangs across the chest (and on the truck's grille)
      for (let k = 0; k <= 16; k++) { const u = k / 16 * 2 - 1, x = u * 1.15, y = 1.02 - (1 - u * u) * 1.0; chest.push(box(x, y, 0.93, 0.2, 0.14, 0.1, 0xf5c542, k % 2 ? 0 : 0.6)); }
      chest.push(gpart(cylGeo(0.34, 0.34, 0.08, 16), 0xf5c542, 0, -0.18, 0.96, Math.PI / 2, 0, 0), gpart(cylGeo(0.16, 0.16, 0.1, 4), 0x8a6a10, 0, -0.18, 0.98, Math.PI / 2, 0, 0));
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
    // free the old paint job's GPU buffers (shared geometries / materials stay: only per-build ones are disposed)
    const old = this.root; old.traverse((o) => { if (o.isMesh && o.geometry && o.geometry._robot) o.geometry.dispose(); });
    this.build(pid); this.snap(pose);
    this.root.visible = vis; this.root.position.copy(pos); this.root.rotation.y = rot;
    if (TEX.helmet && TEX.helmet.dispose) TEX.helmet.dispose();
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
    if (!this.morph && this.pose === 'truck' && dt > 0) {
      const h = Player.heading, sp = Player.speed || 0; if (this._lh === null) this._lh = h;
      const yr = angDiff(this._lh, h) / dt; this._lh = h;
      this.spin = (this.spin + sp * dt / 0.744) % TAU;
      this.steer = damp(this.steer, Math.abs(sp) > 0.5 ? clamp(Math.atan(yr * 4.6 / Math.abs(sp)) * Math.sign(sp), -0.5, 0.5) : this.steer, 8, dt);
      for (let k = 0; k < 6; k++) this.parts['w' + k].rotation.set(this.spin, k < 2 ? this.steer : 0, 0);
      return;
    }
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
