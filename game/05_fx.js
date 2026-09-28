/* ============================================================
   fx: soft particles (points), debris (instanced), rings, flash,
   floating numbers & speech bubbles (DOM)
   ============================================================ */
class SoftSystem {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX.soft }, scale: { value: 600 } },
      vertexShader: 'attribute vec4 pcolor; attribute float psize; uniform float scale; varying vec4 vC;' +
        'void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(psize * scale / -mv.z, 900.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: '#include <common>\nuniform sampler2D map; varying vec4 vC;\n' +
        'void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vC.a; if (a < 0.004) discard; gl_FragColor = vec4(gtaLin(vC.rgb), a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, size, grow, r, g, b, a, life, drag = 0, grav = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, k = i * 3, c = i * 4;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[c] = r; this.col[c + 1] = g; this.col[c + 2] = b; this.col[c + 3] = 0;
    this.size[i] = size; this.grow[i] = grow; this.a0[i] = a;
    this.life[i] = life; this.maxLife[i] = life; this.drag[i] = drag; this.grav[i] = grav;
  }
  copy(from, to) {
    const f3 = from * 3, t3 = to * 3, f4 = from * 4, t4 = to * 4;
    for (let q = 0; q < 3; q++) { this.pos[t3 + q] = this.pos[f3 + q]; this.vel[t3 + q] = this.vel[f3 + q]; }
    for (let q = 0; q < 4; q++) this.col[t4 + q] = this.col[f4 + q];
    this.size[to] = this.size[from]; this.grow[to] = this.grow[from]; this.a0[to] = this.a0[from];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from]; this.drag[to] = this.drag[from]; this.grav[to] = this.grav[from];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.n--; if (i !== this.n) this.copy(this.n, i); continue; }
      const k = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.1) { this.pos[k + 1] = 0.1; this.vel[k + 1] *= -0.3; }
      this.size[i] = Math.max(0.01, this.size[i] + this.grow[i] * dt);
      const t = 1 - this.life[i] / this.maxLife[i];
      this.col[i * 4 + 3] = this.a0[i] * (t < 0.12 ? t / 0.12 : (1 - t) / 0.88);
      i++;
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.n);
  }
  resize(h) { this.mat.uniforms.scale.value = (h * renderer.getPixelRatio()) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); }
}

const Debris = {
  max: 700, n: 0, mesh: null,
  d: null, // x y z vx vy vz rx ry rz wx wy wz sx sy sz life maxlife
  cols: [], _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _e: new THREE.Euler(), _p: new V3(), _s: new V3(), _c: new THREE.Color(),
  init() {
    this.mesh = new THREE.InstancedMesh(_BOX, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.max);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // allocate the colour buffer for all slots *before* shrinking count (setColorAt sizes it from count)
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.d = new Float32Array(this.max * 17);
    scene.add(this.mesh);
  },
  spawn(x, y, z, vx, vy, vz, sx, sy, sz, color, life = 2.2) {
    if (this.n >= this.max) return;
    const i = this.n++, o = i * 17, d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = rand(TAU); d[o + 7] = rand(TAU); d[o + 8] = rand(TAU); d[o + 9] = rand(-9, 9); d[o + 10] = rand(-9, 9); d[o + 11] = rand(-9, 9);
    d[o + 12] = sx; d[o + 13] = sy; d[o + 14] = sz; d[o + 15] = life; d[o + 16] = life;
    this.cols[i] = color;
    this.mesh.setColorAt(i, this._c.set(color));
    this.mesh.instanceColor.needsUpdate = true;
  },
  update(dt) {
    const d = this.d;
    let i = 0;
    while (i < this.n) {
      const o = i * 17;
      d[o + 15] -= dt;
      if (d[o + 15] <= 0) {
        this.n--;
        if (i !== this.n) { const s = this.n * 17; for (let q = 0; q < 17; q++) d[o + q] = d[s + q]; this.cols[i] = this.cols[this.n]; this.mesh.setColorAt(i, this._c.set(this.cols[i])); this.mesh.instanceColor.needsUpdate = true; }
        continue;
      }
      d[o + 4] -= 30 * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const floor = d[o + 13] * 0.5;
      if (d[o + 1] < floor) { d[o + 1] = floor; d[o + 4] *= -0.35; d[o + 3] *= 0.6; d[o + 5] *= 0.6; d[o + 9] *= 0.5; d[o + 10] *= 0.5; d[o + 11] *= 0.5; }
      d[o + 6] += d[o + 9] * dt; d[o + 7] += d[o + 10] * dt; d[o + 8] += d[o + 11] * dt;
      const fade = Math.min(1, d[o + 15] / 0.5);
      this._q.setFromEuler(this._e.set(d[o + 6], d[o + 7], d[o + 8]));
      this._m.compose(this._p.set(d[o], d[o + 1], d[o + 2]), this._q, this._s.set(d[o + 12] * fade, d[o + 13] * fade, d[o + 14] * fade));
      this.mesh.setMatrixAt(i, this._m);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  },
};

const FX = {
  smokeSys: null, glowSys: null, rings: [], flash: null, flashI: 0, beam: null,
  init() {
    this.smokeSys = new SoftSystem(LOWQ ? 900 : 1600, false);
    this.glowSys = new SoftSystem(LOWQ ? 900 : 1600, true);
    Debris.init();
    this.flash = new THREE.PointLight(0xffa040, 0, 70, 0.5); scene.add(this.flash); // r155+ physical falloff: decay 0.5 × 7.3 matches the old 1.6 fall to ~40 m
    const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: TEX.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
      m.visible = false; m.renderOrder = 5; scene.add(m);
      this.rings.push({ m, t: 0, life: 0, r0: 0, r1: 0 });
    }
    // beam mesh (attention beam)
    const bg = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); bg.translate(0, 0.5, 0); bg.rotateX(Math.PI / 2);
    this.beam = new THREE.Group();
    this.beamOuter = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamInner = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.add(this.beamOuter, this.beamInner); this.beam.visible = false; scene.add(this.beam);
    Weather.init();
  },
  resize() { this.smokeSys.resize(innerHeight); this.glowSys.resize(innerHeight); Weather.resize(); },
  update(dt) {
    this.smokeSys.update(dt); this.glowSys.update(dt); Debris.update(dt);
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt; const u = r.t / r.life;
      if (u >= 1) { r.m.visible = false; continue; }
      const s = lerp(r.r0, r.r1, easeOut(u)) * 2; r.m.scale.set(s, 1, s); r.m.material.opacity = (1 - u) * r.a;
    }
    if (this.flashI > 0) { this.flashI = Math.max(0, this.flashI - dt * 9); this.flash.intensity = this.flashI * 7.3; }
    this.updateTelegraphs(dt);
  },
  ring(x, z, r0, r1, life = 0.6, color = 0xffffff, a = 1, y = 0.4) {
    const r = this.rings.find((q) => !q.m.visible) || this.rings[0];
    r.m.visible = true; r.t = 0; r.life = life; r.r0 = r0; r.r1 = r1; r.a = a;
    r.m.position.set(x, y, z); r.m.material.color.set(color);
  },
  light(x, y, z, i = 4, color = 0xffa040) { this.flash.position.set(x, y, z); toLin(this.flash.color.set(color)); this.flashI = Math.max(this.flashI, i); this.flash.intensity = this.flashI * 7.3; },
  sparkle(x, y, z, n) { for (let k = 0; k < n; k++) this.glowSys.spawn(x, y, z, rand(-3, 3), rand(3, 8), rand(-3, 3), rand(0.5, 1.1), -0.4, 1, 0.85, 0.3, 1, rand(0.35, 0.7), 1.5, 4); },
  sparks(x, y, z, n, col = [1, 0.7, 0.25]) { for (let k = 0; k < n; k++) this.glowSys.spawn(x, y, z, rand(-10, 10), rand(2, 12), rand(-10, 10), rand(0.35, 0.7), -0.3, col[0], col[1], col[2], 1, rand(0.25, 0.55), 2.5, 22); },
  smoke(x, y, z, n, size = 4, dark = 0.3) {
    for (let k = 0; k < n; k++) { const c = rand(dark, dark + 0.15); this.smokeSys.spawn(x + rand(-1, 1), y, z + rand(-1, 1), rand(-1.2, 1.2), rand(2.5, 5), rand(-1.2, 1.2), size * rand(0.7, 1.2), size * 0.9, c, c, c * 1.02, 0.55, rand(2, 3.4), 0.5, -0.4); }
  },
  fire(x, y, z, n) {
    for (let k = 0; k < n; k++) this.glowSys.spawn(x + rand(-0.8, 0.8), y, z + rand(-0.8, 0.8), rand(-1, 1), rand(3, 7), rand(-1, 1), rand(1.6, 3.2), -1.2, 1, rand(0.35, 0.6), 0.1, 0.9, rand(0.4, 0.8), 1, -2);
    if (Math.random() < 0.5) this.smoke(x, y + 2, z, 1, 3, 0.18);
  },
  dust(x, z, n, size = 3) {
    for (let k = 0; k < n; k++) { const a = rand(TAU), s = rand(2, 7); const c = rand(0.55, 0.7); this.smokeSys.spawn(x + rand(-1, 1), rand(0.5, 1.5), z + rand(-1, 1), Math.cos(a) * s, rand(0.5, 2.5), Math.sin(a) * s, size * rand(0.6, 1.1), size * 0.8, c, c * 0.93, c * 0.84, 0.55, rand(0.9, 1.8), 1.6, -0.2); }
  },
  leaves(x, y, z, n) { for (let k = 0; k < n; k++) Debris.spawn(x + rand(-1, 1), y + rand(0, 2), z + rand(-1, 1), rand(-5, 5), rand(2, 7), rand(-5, 5), 0.35, 0.08, 0.3, pick([0x3f9a4c, 0x2f7d3a, 0x88c057]), rand(1, 1.8)); },
  chunks(x, y, z, n, colors) {
    for (let k = 0; k < n; k++) { const s = rand(0.35, 1.2); Debris.spawn(x + rand(-1, 1), y + rand(-1, 1), z + rand(-1, 1), rand(-9, 9), rand(3, 13), rand(-9, 9), s, s * rand(0.5, 1), s, pick(colors), rand(1.4, 2.6)); }
  },
  glassBits(x, y, z, n, col) { for (let k = 0; k < n; k++) Debris.spawn(x, y, z, rand(-10, 10), rand(2, 10), rand(-10, 10), 0.45, 0.06, 0.35, pick([col, 0xd8ecff, 0xffffff]), rand(0.8, 1.5)); },
  confetti(x, y, z, n) { for (let k = 0; k < n; k++) Debris.spawn(x, y, z, rand(-8, 8), rand(5, 14), rand(-8, 8), 0.7, 0.05, 0.5, pick([0xfbf8f1, 0xffffff, 0xf2eee4, 0xc8102e]), rand(1.6, 2.6)); },
  boom(x, y, z, size = 1, withDamage = true) {
    this.light(x, y + 2, z, 3 + size * 2);
    for (let k = 0; k < 10 * size; k++) this.glowSys.spawn(x + rand(-1, 1) * size, y + rand(-1, 1) * size, z + rand(-1, 1) * size, rand(-7, 7) * size, rand(2, 10) * size, rand(-7, 7) * size, rand(3, 6) * size, 2 * size, 1, rand(0.45, 0.75), 0.15, 1, rand(0.35, 0.7), 3, -1);
    for (let k = 0; k < 8 * size; k++) this.smokeSys.spawn(x + rand(-2, 2) * size, y + rand(0, 2) * size, z + rand(-2, 2) * size, rand(-4, 4) * size, rand(2, 6), rand(-4, 4) * size, rand(4, 7) * size, 2.5 * size, 0.22, 0.2, 0.2, 0.7, rand(1.8, 3.2), 0.9, -0.5);
    this.sparks(x, y, z, 12 * size);
    this.chunks(x, y, z, 6 * size, [0x2b2f36, 0x555a61, 0xff8a3d]);
    this.ring(x, z, 1, 9 * size, 0.55, 0xffc070, 0.9);
    Cam.shake(0.8 * size);
    if (withDamage) Combat.explosion(x, z, 8 * Math.sqrt(size), 150 * size);
  },
  telegraphs: [],
  telegraph(x, z, r, dur, color = 0xff3b30) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, groundH(x, z) + 0.12, z); ring.position.copy(m.position); ring.position.y += 0.01;
    m.scale.set(0.01, 1, 0.01); ring.scale.set(r, 1, r);
    scene.add(m, ring);
    const t = { m, ring, r, t: 0, dur, x, z };
    this.telegraphs.push(t);
    return t;
  },
  updateTelegraphs(dt) {
    for (let k = this.telegraphs.length - 1; k >= 0; k--) {
      const t = this.telegraphs[k]; t.t += dt;
      const u = Math.min(1, t.t / t.dur);
      t.m.scale.set(t.r * u, 1, t.r * u); t.m.material.opacity = 0.18 + 0.25 * u;
      t.ring.material.opacity = 0.5 + 0.5 * Math.sin(t.t * 20);
      if (u >= 1) { scene.remove(t.m, t.ring); t.m.geometry.dispose(); t.ring.geometry.dispose(); this.telegraphs.splice(k, 1); }
    }
  },
  clearTelegraphs() { for (const t of this.telegraphs) scene.remove(t.m, t.ring); this.telegraphs.length = 0; },
  beamSet(on, x0, y0, z0, x1, y1, z1) {
    this.beam.visible = on;
    if (!on) return;
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = hyp(dx, dy, dz);
    this.beam.position.set(x0, y0, z0);
    this.beam.lookAt(x1, y1, z1);
    const w = rand(0.85, 1.15);
    this.beamOuter.scale.set(1.25 * w, 1.25 * w, L); this.beamInner.scale.set(0.45 * w, 0.45 * w, L);
  },
};

/* ---------------- weather: 晴 · 雾霾 · 沙尘 · 雪 · 雨 ----------------
   Weather.set(kind) / Weather.cur; kinds blend in over ~15 s. It bends DayNight's sample (fog, sun, sky, grade),
   wets the roads (Ground.U.uWet), piles snow on anything facing up, and runs GPU-animated particles around the camera.
   Weather.grip() → tyre grip multiplier for vehicles; Hooks.emit('weather', {kind, name, season, grip}) on every change. */
const WX = {
  clear: { name: '晴' },
  smog: { name: '雾霾', fn: 3, ff: 150, day: '#968c7a', night: '#3c3226', zen: 0.8, haze: 0.9, sun: 0.28, vis: 0.4, hemi: 1.18, sat: 0.72, tint: [1.04, 1.0, 0.88], cl: 0.1, ex: 1.06, hh: 0.12,
    msg: '雾霾橙色预警：PM2.5 爆表，出门把口罩戴好喽' },
  sand: { name: '沙尘', fn: 2, ff: 105, day: '#b98c56', night: '#3a2a1a', zen: 0.9, haze: 0.95, sun: 0.25, vis: 0.3, hemi: 1.15, sat: 0.82, tint: [1.12, 0.98, 0.78], cl: 0, ex: 1.05, hh: 0.2, parts: 'sand',
    msg: '沙尘暴来了：内蒙古的沙子进京报到，眯着点儿眼' },
  snow: { name: '雪', fn: 8, ff: 240, day: '#c3cad4', night: '#343644', zen: 0.7, haze: 0.6, sun: 0.1, vis: 0.05, hemi: 1.4, sat: 0.86, tint: [0.97, 1.0, 1.05], cl: 0.95, ex: 1.08, hh: 0.4, parts: 'snow', grip: 0.62,
    msg: '下雪了：北京一下雪就成了北平。路面打滑，开车悠着点儿' },
  rain: { name: '雨', fn: 10, ff: 300, day: '#7c8691', night: '#22252d', zen: 0.8, haze: 0.55, sun: 0.07, vis: 0, hemi: 1.12, sat: 0.9, tint: [0.97, 1.0, 1.04], cl: 1.0, ex: 1.12, hh: 0.4, parts: 'rain', grip: 0.8,
    msg: '下雨了：二环看海预警，路面湿滑，别在立交桥上漂移' },
};
const SEASONS = [
  ['春', [['clear', 45], ['sand', 25], ['smog', 15], ['rain', 15]]],
  ['夏', [['clear', 55], ['rain', 40], ['smog', 5]]],
  ['秋', [['clear', 70], ['smog', 20], ['rain', 10]]],
  ['冬', [['clear', 35], ['smog', 30], ['snow', 35]]],
];
const Weather = {
  cur: 'clear', str: { clear: 1, smog: 0, sand: 0, snow: 0, rain: 0 }, wet: 0, snowC: 0, day: 0, rollT: 240, lastClock: -1, sys: {},
  _c: new THREE.Color(), _d: new THREE.Color(), _g: new THREE.Color(0.55, 0.58, 0.62), _f: new V3(), scale: 600,
  get season() { return SEASONS[Math.floor(this.day / 3) % 4][0]; },
  get name() { return WX[this.cur].name; },
  // tyre grip for vehicles: 1 dry, less on wet roads and snow
  grip() { return Math.min(1, 1 - (1 - 0.8) * this.wet, 1 - (1 - 0.62) * clamp(this.snowC * 1.5, 0, 1)); },
  set(kind, instant) {
    if (!WX[kind]) return;
    const was = this.cur; this.cur = kind;
    if (instant) for (const k in this.str) this.str[k] = k === kind ? 1 : 0;
    if (kind !== was) {
      if (G.started && typeof UI !== 'undefined' && UI.toast) UI.toast(WX[kind].msg || '天儿放晴了：今儿个是"APEC 蓝"', 3.4);
      Hooks.emit('weather', { kind, name: WX[kind].name, season: this.season, grip: this.grip() });
    }
  },
  pick() { return weighted(SEASONS[Math.floor(this.day / 3) % 4][1]); },
  // game-time schedule: a new roll every few game hours, a new day every midnight, a new season every 3 days
  update(dt) {
    const c = DayNight.clock;
    if (this.lastClock >= 0 && c < this.lastClock - 600) this.day++;
    this.lastClock = c;
    if (Cutscene.active) return;
    this.rollT -= dt * DayNight.speed;
    if (this.rollT <= 0) { this.rollT = rand(150, 320); this.set(this.pick()); }
  },
  // called from DayNight.update: blend strengths, then bend the time-of-day sample in place
  mod(p, dt) {
    const K = clamp(dt / 15, 0, 1);
    for (const k in this.str) this.str[k] = k === this.cur ? Math.min(1, this.str[k] + K) : Math.max(0, this.str[k] - K);
    const s = this.str;
    this.wet = clamp(this.wet + (s.rain > 0.5 ? dt / 25 : -dt / 140), 0, 1);
    this.snowC = clamp(this.snowC + (s.snow > 0.5 ? dt / 60 : -dt / 160), 0, 1);
    if (typeof Ground !== 'undefined' && Ground.U) { const U = Ground.U; U.uWet.value = this.wet; U.uRain.value = DayNight.indoor ? 0 : s.rain; U.uTime.value = (U.uTime.value + dt) % 1000; }
    GTA_U.wx.x = DayNight.indoor ? 0 : this.snowC; GTA_U.wx.z = DayNight.indoor ? 0 : this.wet * 0.3;
    GTA_U.fog.y = 0.5;
    this.animate(dt);
    if (DayNight.indoor) return;
    const dayK = clamp((p.si + p.hi * 0.6) / 1.6, 0, 1);
    for (const k in WX) {
      const w = s[k], X = WX[k]; if (k === 'clear' || w < 0.001) continue;
      const c = this._c.set(X.night).lerp(this._d.set(X.day), dayK); toLin(c);
      p.fn = lerp(p.fn, X.fn, w); p.ff = lerp(p.ff, X.ff, w);
      p.fogC.lerp(c, w); p.hazeC.lerp(c, w); p.hor.lerp(c, w * 0.8); p.zen.lerp(c, w * X.zen);
      p.hs.lerp(this._g, w * 0.5);
      p.haze = Math.max(p.haze, X.haze * w);
      p.si *= lerp(1, X.sun, w); p.mi *= lerp(1, X.sun, w); p.hi *= lerp(1, X.hemi, w); p.sunVis *= lerp(1, X.vis, w);
      p.sat *= lerp(1, X.sat, w); p.ex *= lerp(1, X.ex, w); p.cl = lerp(p.cl, X.cl, w);
      for (let j = 0; j < 3; j++) p.tint[j] *= lerp(1, X.tint[j], w);
      GTA_U.fog.y = lerp(GTA_U.fog.y, X.hh, w);
    }
  },
  // ---- particles: static random lattice, positions computed on the GPU (no per-frame CPU work) ----
  init() {
    const mk = (n, lines, vs, fs, U, blend) => {
      const pos = new Float32Array(n * (lines ? 2 : 1) * 3), g = new THREE.BufferGeometry();
      const end = lines ? new Float32Array(n * 2) : null;
      for (let i = 0; i < n; i++) {
        const x = Math.random(), y = Math.random(), z = Math.random();
        if (lines) { pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; } else pos.set([x, y, z], i * 3);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); if (end) g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      const u = Object.assign({ uC: { value: new V3() }, uT: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color() }, uScale: { value: 600 } }, U);
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend || THREE.NormalBlending });
      const o = lines ? new THREE.LineSegments(g, m) : new THREE.Points(g, m);
      o.frustumCulled = false; o.renderOrder = 6; o.visible = false; scene.add(o);
      return { o, u, n, per: lines ? 2 : 1 };
    };
    // wrap a [0,1) lattice coordinate into a box of size B centred on c, drifting by v·t
    const wrap = 'float wr(float p, float c, float B, float v){ return c - B * 0.5 + fract(p - (c - B * 0.5) / B + v * uT / B) * B; }\n' +
      'float edge(vec3 w){ vec2 q = abs(w.xz - uC.xz) / (uBox.xz * 0.5); return 1.0 - smoothstep(0.7, 1.0, max(q.x, q.y)); }\n';
    const head = 'uniform vec3 uC, uBox; uniform float uT, uA, uScale; uniform vec2 uWind; uniform float uFall; varying float vA;\n' + wrap;
    const tail = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
    this.sys.rain = mk(5200, true,
      head + 'attribute float aEnd; void main(){ vec3 p = position;\n' +
      '  vec3 w = vec3(wr(p.x, uC.x, uBox.x, uWind.x), wr(p.y, uC.y, uBox.y, -uFall), wr(p.z, uC.z, uBox.z, uWind.y));\n' +
      '  vec3 v = normalize(vec3(uWind.x, -uFall, uWind.y)); w += v * aEnd * (0.7 + p.x * 0.6);\n' +
      '  vA = uA * edge(w) * (0.35 + 0.65 * aEnd); gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }',
      '#include <common>\nuniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * 0.42);' + tail,
      { uBox: { value: new V3(60, 34, 60) }, uWind: { value: new THREE.Vector2(1.5, 0.8) }, uFall: { value: 17 } });
    this.sys.snow = mk(4200, false,
      head + 'void main(){ vec3 p = position;\n' +
      '  vec3 w = vec3(wr(p.x, uC.x, uBox.x, uWind.x), wr(p.y, uC.y, uBox.y, -uFall), wr(p.z, uC.z, uBox.z, uWind.y));\n' +
      '  w.x += sin(uT * 1.1 + p.y * 37.0) * 0.6; w.z += cos(uT * 0.9 + p.x * 29.0) * 0.5;\n' +
      '  vec4 mv = viewMatrix * vec4(w, 1.0); gl_PointSize = clamp((0.05 + p.z * 0.05) * uScale / -mv.z, 1.0, 24.0);\n' +
      '  vA = uA * edge(w) * smoothstep(0.5, 3.0, -mv.z); gl_Position = projectionMatrix * mv; }',
      '#include <common>\nuniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a);' + tail,
      { uBox: { value: new V3(50, 30, 50) }, uWind: { value: new THREE.Vector2(0.8, 0.3) }, uFall: { value: 1.4 } });
    // 沙尘: fine grains (a few px, faded out near the lens: big close points read as dirt on the camera) plus wind-blown streaks,
    // both in the haze colour so the air itself looks dusty (Weather.animate: 'dust' follows the sand strength)
    this.sys.sand = mk(2600, false,
      head + 'void main(){ vec3 p = position;\n' +
      '  vec3 w = vec3(wr(p.x, uC.x, uBox.x, uWind.x * (0.7 + p.y * 0.6)), wr(p.y, uC.y, uBox.y, -0.4), wr(p.z, uC.z, uBox.z, uWind.y));\n' +
      '  w.y += sin(uT * 2.0 + p.x * 50.0) * 0.8;\n' +
      '  vec4 mv = viewMatrix * vec4(w, 1.0); gl_PointSize = clamp((0.03 + p.z * 0.05) * uScale / -mv.z, 1.0, 10.0);\n' +
      '  vA = uA * edge(w) * smoothstep(4.0, 6.5, -mv.z) * (0.1 + 0.14 * p.x); gl_Position = projectionMatrix * mv; }',
      '#include <common>\nuniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a);' + tail,
      { uBox: { value: new V3(60, 16, 60) }, uWind: { value: new THREE.Vector2(15, 4) }, uFall: { value: 0 } });
    this.sys.dust = mk(1400, true,
      head + 'attribute float aEnd; void main(){ vec3 p = position; float k = 0.8 + p.y * 0.5;\n' +
      '  vec3 w = vec3(wr(p.x, uC.x, uBox.x, uWind.x * k), wr(p.y, uC.y, uBox.y, -0.3), wr(p.z, uC.z, uBox.z, uWind.y * k));\n' +
      '  w.y += sin(uT * 1.7 + p.z * 40.0) * 0.6; w += normalize(vec3(uWind.x, 0.0, uWind.y)) * aEnd * (0.5 + p.x * 0.9);\n' +
      '  vec4 mv = viewMatrix * vec4(w, 1.0); vA = uA * edge(w) * smoothstep(4.0, 7.0, -mv.z) * (0.3 + 0.7 * aEnd); gl_Position = projectionMatrix * mv; }',
      '#include <common>\nuniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * 0.3);' + tail,
      { uBox: { value: new V3(60, 16, 60) }, uWind: { value: new THREE.Vector2(15, 4) }, uFall: { value: 0 } });
    Hooks.update(function weather(dt) { Weather.update(dt); });
    this.resize();
  },
  resize() { this.scale = (innerHeight * renderer.getPixelRatio()) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); for (const k in this.sys) this.sys[k].u.uScale.value = this.scale; },
  animate(dt) {
    const f = camera.getWorldDirection(this._f), cp = camera.position, parts = Render.Q ? Render.Q.parts : 1;
    const lum = clamp((W.hemi.intensity * 0.9 + W.sun.intensity * 0.35) / LIGHT_K, 0.08, 1.2);
    for (const k in this.sys) {
      const S = this.sys[k], a = DayNight.indoor ? 0 : this.str[k === 'dust' ? 'sand' : k];
      S.o.visible = a > 0.01; if (!S.o.visible) continue;
      S.u.uA.value = a; S.u.uT.value = (S.u.uT.value + dt) % 1000;
      S.u.uC.value.set(cp.x + f.x * 14, (k === 'sand' || k === 'dust' ? groundH(cp.x, cp.z) + 6 : cp.y + 4), cp.z + f.z * 14);
      if (k === 'rain') S.u.uCol.value.setRGB(0.55, 0.6, 0.68).multiplyScalar(lum);
      else if (k === 'snow') S.u.uCol.value.setRGB(0.85, 0.88, 0.95).multiplyScalar(lum);
      else S.u.uCol.value.copy(scene.fog.color).multiplyScalar(k === 'dust' ? 1.18 : 1.08); // (fog colour: already linear and lit for the hour)
      S.o.geometry.setDrawRange(0, Math.round(S.n * parts) * S.per);
    }
  },
};

/* ---- DOM overlays: floating text & speech bubbles ---- */
const _proj = new V3();
function worldToScreen(x, y, z) {
  _proj.set(x, y, z).project(camera);
  if (_proj.z > 1 || _proj.z < -1) return null;
  return { x: (_proj.x + 1) * 0.5 * innerWidth, y: (1 - _proj.y) * 0.5 * innerHeight, on: Math.abs(_proj.x) <= 1.05 && Math.abs(_proj.y) <= 1.05 };
}
const Floaters = {
  el: null, list: [],
  add(x, y, z, text, cls = '', life = 1.15) {
    if (!this.el) return;
    const d = document.createElement('div'); d.className = 'fl ' + cls; d.textContent = text;
    this.el.appendChild(d);
    this.list.push({ d, x, y, z, t: 0, life });
    if (this.list.length > 46) { const o = this.list.shift(); o.d.remove(); }
  },
  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const f = this.list[k];
      f.t += dt;
      if (f.t >= f.life) { f.d.remove(); this.list.splice(k, 1); continue; }
      const s = worldToScreen(f.x, f.y, f.z);
      if (!s) { f.d.style.opacity = '0'; continue; }
      const u = f.t / f.life, sc = u < 0.12 ? 0.6 + (u / 0.12) * 0.5 : 1.1 - (u - 0.12) * 0.15;
      f.d.style.transform = `translate(${s.x.toFixed(1)}px,${(s.y - u * 52).toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      f.d.style.opacity = u > 0.7 ? ((1 - u) / 0.3).toFixed(2) : '1';
    }
  },
  clear() { for (const f of this.list) f.d.remove(); this.list.length = 0; },
};
const Bubble = {
  el: null, list: [],
  say(obj, text, dur = 2.2, cls = '', yOff = 3) {
    if (!this.el || !obj) return;
    const old = this.list.find((b) => b.obj === obj);
    if (old) { old.d.textContent = text; old.t = 0; old.life = dur; return; }
    if (this.list.length >= 9) { const o = this.list.shift(); o.d.remove(); }
    const d = document.createElement('div'); d.className = 'bubble ' + cls; d.textContent = text; this.el.appendChild(d);
    this.list.push({ d, obj, t: 0, life: dur, yOff });
  },
  at(x, y, z, text, dur = 2.5, cls = '') { this.say({ pos: new V3(x, 0, z), fixedY: y }, text, dur, cls, 0); },
  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const b = this.list[k];
      b.t += dt;
      const gone = b.obj.dead || b.obj.removed;
      if (b.t >= b.life || gone) { b.d.remove(); this.list.splice(k, 1); continue; }
      const y = b.obj.fixedY !== undefined ? b.obj.fixedY : (b.obj.y || 0) + b.yOff + (b.obj.bubbleH || 0);
      const s = worldToScreen(b.obj.pos.x, y, b.obj.pos.z);
      if (!s || !s.on) { b.d.style.opacity = '0'; continue; }
      const pop = Math.min(1, b.t / 0.12);
      b.d.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px) translate(-50%,-100%) scale(${(0.7 + pop * 0.3).toFixed(3)})`;
      b.d.style.opacity = b.t > b.life - 0.3 ? ((b.life - b.t) / 0.3).toFixed(2) : '1';
    }
  },
  clear() { for (const b of this.list) b.d.remove(); this.list.length = 0; },
};
