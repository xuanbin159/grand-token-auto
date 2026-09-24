/* ============================================================
   vehicles v3: AI traffic on the real road graph (lanes, curves
   through junctions, traffic lights, 早晚高峰), 京牌 plates,
   legal-department chasers (A* on the graph), 共享单车,
   shared arcade driving physics
   ============================================================ */
const CAR_KINDS = {
  sedan: { len: 4.6, wid: 2.1, h: 1.7, maxSpd: 34, accel: 20, brake: 42, maxRev: 11, steer: 2.3, grip: 7, colors: [0xd23c3c, 0x2f6fd6, 0xe8e8e8, 0x222428, 0x3aa35b, 0xf2c14e, 0x8b5cf6, 0x9aa3ad, 0xff7a3d] },
  taxi: { len: 4.6, wid: 2.1, h: 1.9, maxSpd: 34, accel: 20, brake: 42, maxRev: 11, steer: 2.3, grip: 7, colors: [0xf5c518, 0x2fb36d] },
  van: { len: 5.4, wid: 2.3, h: 2.6, maxSpd: 28, accel: 15, brake: 36, maxRev: 9, steer: 2.0, grip: 7.5, colors: [0xf0f0f0, 0x6b7280, 0x1e88e5] },
  sport: { len: 4.5, wid: 2.1, h: 1.4, maxSpd: 48, accel: 32, brake: 50, maxRev: 12, steer: 2.6, grip: 6.5, colors: [0xff2d55, 0xffcc00, 0x00c2ff] },
  legal: { len: 4.8, wid: 2.15, h: 1.9, maxSpd: 40, accel: 26, brake: 44, maxRev: 12, steer: 2.4, grip: 7.5, colors: [0x15171b] },
  // 共享单车: slow, twitchy, no fireballs
  bike: { len: 1.8, wid: 0.62, h: 1.15, maxSpd: 10, accel: 6.5, brake: 13, maxRev: 2, steer: 3.3, grip: 13, colors: [0xffc400, 0x2f80ed, 0xff7a1a, 0x22c55e], bike: true },
};
const TRUCK_PRM = { maxSpd: 50, accel: 30, brake: 52, maxRev: 14, steer: 2.1, grip: 6.5, boost: 1 };
const CAR_NAMES = { sedan: '码农小轿车', taxi: 'Token 出租', van: '外卖面包车', sport: '极客跑车', legal: '法务专车', bike: '共享单车' };
const CAR_LIGHT_GEO = new Map();
function carLightsGeo(kind) {
  if (CAR_LIGHT_GEO.has(kind)) return CAR_LIGHT_GEO.get(kind);
  const k = CAR_KINDS[kind], L = k.len, Wd = k.wid, parts = [];
  if (k.bike) parts.push(box(0, 0.98, 0.7, 0.14, 0.1, 0.08, 0xfff2c8), box(0, 0.62, -0.78, 0.12, 0.08, 0.04, 0xd11f1f));
  else for (const sx of [-1, 1]) {
    parts.push(box(sx * (Wd / 2 - 0.4), kind === 'van' ? 1.0 : 0.85, L / 2 + 0.03, 0.46, 0.24, 0.08, 0xfff2c8));
    parts.push(box(sx * (Wd / 2 - 0.4), kind === 'van' ? 1.0 : 0.85, -L / 2 - 0.03, 0.46, 0.22, 0.08, 0xd11f1f));
  }
  const g = mergeParts(parts); CAR_LIGHT_GEO.set(kind, g); return g;
}
const BEAM_GEO = (() => { const g = new THREE.PlaneGeometry(4.4, 9); g.rotateX(-Math.PI / 2); g.translate(0, 0.08, 7); return g; })();
const CAR_GEO = new Map();
function carGeo(kind, color) {
  const key = kind + ':' + color;
  if (CAR_GEO.has(key)) return CAR_GEO.get(key);
  const k = CAR_KINDS[kind], L = k.len, Wd = k.wid, parts = [];
  const dark = 0x1b1e24, glass = 0x2a3a4d;
  if (k.bike) {
    const wheel = new THREE.TorusGeometry(0.33, 0.055, 4, 12);
    parts.push(gpart(wheel, 0x1b1b1b, 0, 0.36, 0.56, 0, Math.PI / 2, 0), gpart(wheel, 0x1b1b1b, 0, 0.36, -0.56, 0, Math.PI / 2, 0));
    parts.push(box(0, 0.36, 0.56, 0.07, 0.07, 0.07, 0x9aa3ad), box(0, 0.36, -0.56, 0.12, 0.12, 0.12, 0x9aa3ad)); // hubs
    parts.push(gpart(_BOX, color, 0, 0.6, 0.02, -0.5, 0, 0, 0.09, 0.09, 1.12), box(0, 0.5, -0.3, 0.08, 0.1, 0.55, color)); // frame
    parts.push(gpart(_BOX, color, 0, 0.72, -0.34, 0.25, 0, 0, 0.08, 0.62, 0.08), box(0, 1.04, -0.42, 0.24, 0.08, 0.36, 0x222222)); // seat post + saddle
    parts.push(gpart(_BOX, 0x333333, 0, 0.78, 0.5, -0.2, 0, 0, 0.07, 0.8, 0.07), box(0, 1.16, 0.44, 0.62, 0.05, 0.05, 0x333333)); // fork + bar
    parts.push(box(0, 0.92, 0.72, 0.36, 0.24, 0.28, color), box(0, 0.62, 0.56, 0.1, 0.05, 0.5, color), box(0, 0.62, -0.58, 0.1, 0.05, 0.5, color)); // basket, mudguards
    parts.push(box(0, 0.5, -0.1, 0.14, 0.18, 0.16, 0x2b2b2b), box(0.11, 0.5, -0.1, 0.02, 0.1, 0.1, 0xffffff)); // chain case + QR sticker
  } else if (kind === 'van') {
    parts.push(box(0, 1.5, -0.3, Wd, 2.1, L - 0.8, color), box(0, 1.05, L / 2 - 0.6, Wd - 0.05, 1.2, 1.2, color), box(0, 1.95, L / 2 - 1.0, Wd * 0.94, 0.7, 0.34, glass));
  } else if (kind === 'sport') {
    parts.push(box(0, 0.62, 0, Wd, 0.6, L, color), box(0, 1.12, -0.3, Wd * 0.84, 0.46, L * 0.42, glass), box(0, 1.37, -0.3, Wd * 0.8, 0.06, L * 0.34, color), box(0, 1.05, -L / 2 + 0.25, Wd * 0.9, 0.08, 0.5, dark));
  } else {
    parts.push(box(0, 0.72, 0, Wd, 0.72, L, color), box(0, 1.3, -0.25, Wd * 0.88, 0.62, L * 0.52, glass), box(0, 1.63, -0.25, Wd * 0.86, 0.1, L * 0.46, color));
  }
  if (!k.bike) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(sx * (Wd / 2 - 0.2), 0.42, sz * (L / 2 - 0.9), 0.44, 0.84, 0.84, dark));
    parts.push(box(0, 0.45, L / 2, Wd * 0.98, 0.25, 0.14, dark), box(0, 0.45, -L / 2, Wd * 0.98, 0.25, 0.14, dark));
    for (const sx of [-1, 1]) parts.push(box(sx * (Wd / 2 + 0.08), kind === 'van' ? 1.9 : 1.2, L / 2 - (kind === 'van' ? 0.9 : 1.55), 0.16, 0.12, 0.22, dark)); // mirrors
  }
  if (kind === 'taxi') parts.push(box(0, 1.8, -0.25, 0.9, 0.25, 0.4, 0xffffff));
  const g = mergeParts(parts);
  CAR_GEO.set(key, g);
  return g;
}
let DECAL_MAT = null;
function decalMats() {
  if (!DECAL_MAT) DECAL_MAT = {
    legal: new THREE.MeshBasicMaterial({ map: TEX.legalDecal }),
    taxi: new THREE.MeshBasicMaterial({ map: TEX.taxiDecal }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2233 }), blue: new THREE.MeshBasicMaterial({ color: 0x2266ff }),
  };
  return DECAL_MAT;
}

/* ---------------- 京牌: one pre-drawn atlas of number plates, one instanced mesh for every plate in town ---------------- */
const PLATE_PROV = [['冀', 9], ['津', 3], ['鲁', 2], ['晋', 1.4], ['豫', 1.4], ['蒙', 1], ['辽', 1], ['苏', 1], ['浙', 1], ['川', 0.8], ['粤', 0.8], ['黑', 0.7], ['吉', 0.6], ['沪', 0.6]];
const Plates = {
  SW: 128, SH: 40, COLS: 8, N: 200, MAXI: 240, txt: [], local: [], used: null, mesh: null, slot: null, loc: new Map(), _m: new THREE.Matrix4(),
  // slots 0-7 法务 (京A·FWxxx), 8-27 出租 (京B), the rest private cars: 京 blue / 京 green (new energy) / 外地
  gen(i) {
    const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '0123456789';
    const tail = (n, letters) => { let s = '', nl = 0; for (let k = 0; k < n; k++) { const let_ = letters && nl < 2 && k < n - 1 && Math.random() < 0.3; if (let_) nl++; s += let_ ? pick(L) : pick(D); } return s; };
    if (i < 8) return ['京A·FW' + (110 + i * 11 + randi(0, 9)), true, 0];
    if (i < 28) return ['京B·' + tail(5, true), true, 0];
    if (Math.random() < 0.72) return Math.random() < 0.18 ? ['京' + pick('ABCEFGHJKLMNPQ') + '·' + pick('DF') + tail(5, false), true, 1] : ['京' + pick('ABCEFGHJKLMNPQ') + '·' + tail(5, true), true, 0];
    return [weighted(PLATE_PROV) + pick('ABCDEFGH') + '·' + tail(5, true), false, 0];
  },
  init() {
    const c = mkCanvas(1024, 1024), g = c.getContext('2d');
    this.used = new Uint8Array(this.N);
    for (let i = 0; i < this.N; i++) {
      const [t, loc, green] = this.gen(i), x = (i % this.COLS) * this.SW, y = Math.floor(i / this.COLS) * this.SH;
      this.txt.push(t); this.local.push(loc);
      rrect(g, x + 2, y + 2, this.SW - 4, this.SH - 4, 5);
      if (green) { const gr = g.createLinearGradient(0, y, 0, y + this.SH); gr.addColorStop(0, '#f2fbef'); gr.addColorStop(1, '#4cbb62'); g.fillStyle = gr; } else g.fillStyle = '#1b4fc0';
      g.fill(); g.lineWidth = 2; g.strokeStyle = green ? '#1f2937' : '#f5f5f5'; rrect(g, x + 5, y + 5, this.SW - 10, this.SH - 10, 3); g.stroke();
      g.fillStyle = green ? '#111' : '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, this.SW - 16, 27, 800); g.fillText(t, x + this.SW / 2, y + this.SH / 2 + 1);
    }
    const t = tex(c);
    const geo = new THREE.PlaneGeometry(0.46, 0.15);
    this.slot = new THREE.InstancedBufferAttribute(new Float32Array(this.MAXI * 2), 2); this.slot.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSlot', this.slot);
    const mat = new THREE.MeshBasicMaterial({ map: t, color: 0xdadada });
    const su = (this.SW / 1024).toFixed(6), sv = (this.SH / 1024).toFixed(6);
    mat.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute vec2 aSlot;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n  vUv = uv * vec2(${su}, ${sv}) + aSlot;`); };
    mat.customProgramCacheKey = () => 'plates-v1';
    this.mesh = new THREE.InstancedMesh(geo, mat, this.MAXI); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.mesh);
  },
  // a free slot of the right family (legal / taxi / private); a full atlas just shares a plate
  alloc(kind) {
    const [a, b] = kind === 'legal' ? [0, 8] : kind === 'taxi' ? [8, 28] : [28, this.N];
    const s0 = randi(a, b - 1);
    for (let k = 0; k < b - a; k++) { const i = a + ((s0 - a + k) % (b - a)); if (!this.used[i]) { this.used[i] = 1; return i; } }
    return s0;
  },
  release(i) { if (i >= 0 && this.used) this.used[i] = 0; },
  locFor(kind, back) {
    const key = kind + (back ? 'b' : 'f');
    let m = this.loc.get(key);
    if (!m) {
      const k = CAR_KINDS[kind], z = k.len / 2 + 0.085;
      m = new THREE.Matrix4().makeRotationY(back ? Math.PI : 0).setPosition(0, kind === 'van' ? 0.62 : 0.5, back ? -z : z);
      this.loc.set(key, m);
    }
    return m;
  },
  update() {
    if (!this.mesh) return;
    const cx = Cam.target.x, cz = Cam.target.z, M = this.mesh, sl = this.slot.array;
    let n = 0;
    for (const c of Cars.list) {
      if (c.removed || c.plateSlot < 0 || c.burnt || n + 2 > this.MAXI) continue;
      if (Math.abs(c.pos.x - cx) > 110 || Math.abs(c.pos.z - cz) > 110) continue;
      c.group.updateMatrix();
      const i = c.plateSlot, u = (i % this.COLS) * this.SW / 1024, v = 1 - (Math.floor(i / this.COLS) + 1) * this.SH / 1024;
      for (const back of [true, false]) {
        this._m.multiplyMatrices(c.group.matrix, this.locFor(c.kind, back));
        M.setMatrixAt(n, this._m); sl[n * 2] = u; sl[n * 2 + 1] = v; n++;
      }
    }
    M.count = n; M.instanceMatrix.needsUpdate = true; this.slot.needsUpdate = true;
  },
};

/* ---------------- vehicle ground: terraces / hills (groundH) + the stone bridge decks ---------------- */
const VehGround = {
  m: null, x0: 0, z0: 0, w: 0, h: 0, DECK: 0.6,
  init() {
    const B = W.bounds; this.x0 = B.x0 - 4; this.z0 = B.z0 - 4;
    const w = this.w = Math.ceil((B.x1 - this.x0 + 8) / 2), h = this.h = Math.ceil((B.z1 - this.z0 + 8) / 2);
    const m = this.m = new Uint8Array(w * h), P = [0, 0, 0, 1];
    for (const d of W.dry || []) {
      const r = d.e.hw + 0.5;
      for (let s = d.s0; s <= d.s1; s += 1) {
        Roads.at(d.e, s, P);
        for (let i = Math.max(0, Math.floor((P[0] - r - this.x0) / 2)); i <= Math.min(w - 1, Math.floor((P[0] + r - this.x0) / 2)); i++)
          for (let j = Math.max(0, Math.floor((P[1] - r - this.z0) / 2)); j <= Math.min(h - 1, Math.floor((P[1] + r - this.z0) / 2)); j++)
            if (hyp(this.x0 + i * 2 + 1 - P[0], this.z0 + j * 2 + 1 - P[1]) <= r) m[j * w + i] = 1;
      }
    }
  },
  at(x, z) {
    let h = groundH(x, z);
    if (this.m) { const i = Math.floor((x - this.x0) / 2), j = Math.floor((z - this.z0) / 2); if (i >= 0 && j >= 0 && i < this.w && j < this.h && this.m[j * this.w + i]) h = Math.max(h, this.DECK); }
    return h;
  },
};

// ---- shared arcade driving ----
function driveCar(v, thr, steer, hand, dt, prm) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = -fz, rz = fx;
  let vf = v.vel.x * fx + v.vel.z * fz, vr = v.vel.x * rx + v.vel.z * rz;
  if (thr > 0) vf += (vf < -0.5 ? prm.brake : prm.accel) * thr * dt;
  else if (thr < 0) vf += (vf > 0.5 ? -prm.brake : -prm.accel * 0.7) * -thr * dt;
  else vf -= vf * Math.min(1, 0.9 * dt);
  vf = clamp(vf, -prm.maxRev, prm.maxSpd * (prm.boost || 1));
  if (hand) vf -= vf * Math.min(1, 1.3 * dt);
  const sp = Math.abs(vf);
  const turn = steer * prm.steer * clamp(sp / 7, 0, 1) * (1 - clamp((sp - 22) / 80, 0, 0.35)) * (vf >= 0 ? 1 : -1) * (hand ? 1.45 : 1);
  v.heading = wrapA(v.heading + turn * dt);
  vr *= Math.exp(-(hand ? prm.grip * 0.16 : prm.grip) * dt);
  v.vel.x = fx * vf + rx * vr; v.vel.z = fz * vf + rz * vr;
  v.pos.x += v.vel.x * dt; v.pos.z += v.vel.z * dt;
  v.speed = vf;
  return Math.abs(vr);
}
const _tmpP = { x: 0, z: 0 };
// three probe circles (nose, tail, middle); each push is applied before the next probe so they never double up
function vehicleWorldCollide(v, rad, len) {
  if (v.colR) rad = v.colR;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let nx = 0, nz = 0, hitB = null, any = false;
  for (const off of [len * 0.3, -len * 0.3, 0]) {
    _tmpP.x = v.pos.x + fx * off; _tmpP.z = v.pos.z + fz * off;
    const ox = _tmpP.x, oz = _tmpP.z, h = collideCircle(_tmpP, rad);
    if (!h) continue;
    const px = _tmpP.x - ox, pz = _tmpP.z - oz;
    v.pos.x += px; v.pos.z += pz; nx += px; nz += pz; hitB = h.b || hitB; any = true;
  }
  if (!any) return null;
  const nl = hyp(nx, nz);
  if (nl < 1e-6) return { impact: 0, nx: 0, nz: 0, b: hitB };
  nx /= nl; nz /= nl;
  const vn = v.vel.x * nx + v.vel.z * nz;
  let impact = 0;
  if (vn < 0) {
    impact = -vn;
    // kill the inbound part (hard hits bounce a little), scrub the rest by how hard it was: grazes slide, crashes stop
    const k = 1 + (impact > 7 ? 0.25 : 0);
    v.vel.x -= nx * vn * k; v.vel.z -= nz * vn * k;
    const f = Math.max(0.55, 1 - impact * 0.03); v.vel.x *= f; v.vel.z *= f;
    // swing the body parallel to the wall so a scrape slides along instead of sticking nose-first
    if (Math.abs(v.speed || 0) > 2 || hyp(v.vel.x, v.vel.z) > 2) {
      let want = Math.atan2(-nz, nx);
      if (Math.abs(angDiff(v.heading, want)) > Math.PI / 2) want = wrapA(want + Math.PI);
      v.heading = wrapA(v.heading + clamp(angDiff(v.heading, want), -0.05, 0.05));
    }
  }
  return { impact, nx, nz, b: hitB };
}
// what a moving vehicle does to everything around it
function vehicleImpacts(v, self, rad, heavy) {
  const bike = !!(self && self.k && self.k.bike);
  if (bike) rad = 0.9;
  const sp = hyp(v.vel.x, v.vel.z);
  for (const c of Cars.list) {
    if (c === self || c.removed || c.state === 'held' || c.state === 'thrown' || c.y > 2.5) continue;
    const rr = rad + c.radius * 0.75;
    const dx = c.pos.x - v.pos.x, dz = c.pos.z - v.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, pen = rr - d;
    const rel = (v.vel.x - c.vel.x) * nx + (v.vel.z - c.vel.z) * nz;
    if (rel > 6 && !bike) {
      // a real hit: the other car goes flying
      c.knock(v.vel.x * (heavy ? 1.2 : 0.7) + nx * 4, 3 + rel * (heavy ? 0.4 : 0.15), v.vel.z * (heavy ? 1.2 : 0.7) + nz * 4, rel * (heavy ? 3.2 : 1.3));
      if (heavy) { v.vel.x *= 0.92; v.vel.z *= 0.92; }
      else { v.vel.x *= 0.62; v.vel.z *= 0.62; if (self) self.damage(rel * 0.5); }
      Sfx.crash(rel); FX.sparks((v.pos.x + c.pos.x) / 2, 1.2, (v.pos.z + c.pos.z) / 2, 8);
      if (v === Player || self === Player.car) { Cam.shake(Math.min(1, rel / 22)); G.crime(0.06); }
      continue;
    }
    // cars on rails (traffic) don't budge: the mover takes the whole push, so leaning on one never jitters
    if (heavy) { c.pos.x += nx * pen; c.pos.z += nz * pen; }
    else if (c.state === 'traffic' || bike) {
      v.pos.x -= nx * pen; v.pos.z -= nz * pen;
      if (rel > 0) { const k = bike ? 1.3 : 1; v.vel.x -= nx * rel * k; v.vel.z -= nz * rel * k; }
      if (bike && rel > 4) { Sfx.thud(); if (self === Player.car) Cam.shake(0.2); }
    } else {
      v.pos.x -= nx * pen * 0.5; v.pos.z -= nz * pen * 0.5; c.pos.x += nx * pen * 0.5; c.pos.z += nz * pen * 0.5;
      // a nudge shares momentum: parked cars get shoved along instead of acting like walls
      if (rel > 0) { v.vel.x -= nx * rel * 0.5; v.vel.z -= nz * rel * 0.5; if (c.state === 'parked' || c.state === 'legal') { c.vel.x += nx * rel * 0.5; c.vel.z += nz * rel * 0.5; } }
    }
  }
  if (sp > 5) {
    for (const e of Enemies.list) {
      if (e.dead) continue;
      if (dist2(e.pos.x, e.pos.z, v.pos.x, v.pos.z) < (rad + e.r) * (rad + e.r) && e.y < 4) e.hit(sp * (heavy ? 4 : bike ? 0.8 : 2.2), v.vel.x * 0.7, v.vel.z * 0.7, 9, heavy ? 'ram' : 'car');
    }
    Peds.dodge(v.pos.x, v.pos.z, v.vel.x, v.vel.z, rad + 2);
    if (!bike) Props.knockAround(v.pos.x, v.pos.z, rad + 0.5, 0, 0, v.vel.x, v.vel.z);
  }
}
// point inside a solid's footprint (AABB or OBB), padded
function inSolid(s, x, z, pad) {
  if (x < s.x0 - pad || x > s.x1 + pad || z < s.z0 - pad || z > s.z1 + pad) return false;
  if (!s.obb) return true;
  const dx = x - s.cx, dz = z - s.cz;
  return Math.abs(dx * s.ux + dz * s.uz) < s.hx + pad && Math.abs(-dx * s.uz + dz * s.ux) < s.hz + pad;
}

/* ---------------- the road graph, seen by a driver: lanes, junction trims, headings ---------------- */
// edges that carry AI traffic: no hutongs / pedestrian streets, no loops, nothing that runs through water without a deck
// or through a gate / wall / landmark the map stands on the street (TR.blocked)
const TE = (e) => e.C.traffic && e.a !== e.b && !(TR.blocked && TR.blocked[e.id]);
// lanes per direction: one-ways follow the painted lanes, two-way streets fit as many as the half-width allows
function tLanes(e) { return e.oneway ? Math.max(1, Math.floor(e.w / LANE_W)) : clamp(Math.floor(e.hw / 2.9), 1, Math.max(1, e.C.lanes)); }
function tLaneOff(e, lane) { return e.oneway ? laneOffset(e, 1, lane) : (lane + 0.5) * e.hw / tLanes(e); }
const _pa = [0, 0, 0, 1], _pb = [0, 0, 0, 1], _pc = [0, 0, 0, 1];
// lane point at travel distance s (dir +1 = a→b) with a tangent smoothed over ±3 m, so polyline kinks don't make cars twitch
function lanePt(e, dir, s, off, out) {
  const L = e.len, u = clamp(dir > 0 ? s : L - s, 0, L), d = Math.min(3, L * 0.5);
  Roads.at(e, u, _pa); Roads.at(e, Math.max(0, u - d), _pb); Roads.at(e, Math.min(L, u + d), _pc);
  let tx = _pc[0] - _pb[0], tz = _pc[1] - _pb[1];
  const l = Math.hypot(tx, tz);
  if (l > 1e-6) { tx /= l; tz /= l; } else { tx = _pa[2]; tz = _pa[3]; }
  if (dir < 0) { tx = -tx; tz = -tz; }
  out[0] = _pa[0] - tz * off; out[1] = _pa[1] + tx * off; out[2] = tx; out[3] = tz;
  return out;
}
const TR = {
  hA: null, hB: null, tA: null, tB: null, axA: null, axB: null, tdeg: null, boxR: null, blocked: null,
  init() {
    const E = Roads.edges, N = Roads.nodes, ne = E.length, P = [0, 0, 0, 1];
    this.hA = new Float32Array(ne); this.hB = new Float32Array(ne); this.tA = new Float32Array(ne); this.tB = new Float32Array(ne);
    this.axA = new Int8Array(ne).fill(-1); this.axB = new Int8Array(ne).fill(-1);
    for (const e of E) {
      const d = Math.min(4, e.len / 2), A = N[e.a], B = N[e.b];
      Roads.at(e, d, P); this.hA[e.id] = Math.atan2(P[0] - A.x, P[1] - A.z);
      Roads.at(e, e.len - d, P); this.hB[e.id] = Math.atan2(B.x - P[0], B.z - P[1]);
    }
    for (const e of E) { this.tA[e.id] = this.trim(e, N[e.a]); this.tB[e.id] = this.trim(e, N[e.b]); }
    // closed to traffic: water without a deck under the street, or a lane that clips a building / gate / wall the map
    // drops on the road (鼓楼, 德胜门箭楼, 永定门, 中南海 and 雍和宫 walls...). Monorail piers stand on the kerb (Monorail.build).
    const bl = this.blocked = new Uint8Array(ne), offs = [];
    let qx = 0, qz = 0, hit = false;
    const hitFn = (so) => { if (so.h > 2 && so.kind !== 'pillar' && so.kind !== 'hq' && inSolid(so, qx, qz, 0.8)) { hit = true; return false; } };
    for (const e of E) {
      if (!e.C.traffic || e.a === e.b) continue;
      offs.length = 0; offs.push(0);
      for (let l = 0, nl = tLanes(e); l < nl; l++) { const o = tLaneOff(e, l); offs.push(o); if (!e.oneway) offs.push(-o); }
      // solids only where the lanes run (junction boxes are curves); water along the whole edge, as before
      const s0 = this.tA[e.id] - 1, s1 = e.len - this.tB[e.id] + 1;
      for (let s = 1; s < e.len - 1 && !bl[e.id]; s += 2) {
        Roads.at(e, s, P);
        const lanes = s > s0 && s < s1;
        for (let k = 0; k < offs.length; k++) {
          qx = P[0] - P[3] * offs[k]; qz = P[1] + P[2] * offs[k];
          if (Grid.at(qx, qz) === GK.WATER) { bl[e.id] = 1; break; }
          if (!lanes) continue;
          hit = false; forSolids(qx, qz, 1, hitFn);
          if (hit) { bl[e.id] = 2; break; }
        }
      }
    }
    this.tdeg = new Uint8Array(N.length); this.boxR = new Float32Array(N.length);
    for (const n of N) {
      let k = 0, r = 0;
      for (const e of n.edges) { if (TE(e)) k++; r = Math.max(r, e.hw); }
      this.tdeg[n.id] = Math.min(255, k); this.boxR[n.id] = clamp(r + 1.5, 5, 16);
    }
  },
  away(e, nid) { return e.a === nid ? this.hA[e.id] : wrapA(this.hB[e.id] + Math.PI); },
  // how far before a node a lane ends (the junction box): wide crossing roads push it back, a bent joint a little
  trim(e, n) {
    if (e.a === e.b) return Math.min(2, e.len * 0.45);
    const h = this.away(e, n.id);
    let r = 1, others = 0, bend = 0;
    for (const o of n.edges) {
      if (o === e || o.a === o.b) continue;
      others++;
      const ang = Math.abs(angDiff(h, this.away(o, n.id))), s = Math.sin(ang);
      if (s > 0.3) r = Math.max(r, o.hw / s + 1.2);
      bend = Math.PI - ang;
    }
    if (others === 1) r = Math.max(r, 1.5 + Math.abs(bend) * 5);
    return Math.min(clamp(r, 1, 16), e.len * 0.45);
  },
  sIn(e, dir) { return dir > 0 ? this.tA[e.id] : this.tB[e.id]; },
  sOut(e, dir) { return e.len - (dir > 0 ? this.tB[e.id] : this.tA[e.id]); },
  endNode(e, dir) { return Roads.nodes[dir > 0 ? e.b : e.a]; },
  arrH(e, dir) { return dir > 0 ? this.hB[e.id] : wrapA(this.hA[e.id] + Math.PI); },
  depH(e, dir) { return dir > 0 ? this.hA[e.id] : wrapA(this.hB[e.id] + Math.PI); },
  // which signal axis you approach the end node on (cached Signals.axisOf)
  axis(e, dir) {
    const A = dir > 0 ? this.axB : this.axA;
    if (A[e.id] < 0) A[e.id] = Signals.axisOf(e, this.endNode(e, dir));
    return A[e.id];
  },
};
// neighbouring signals share one phase, so a car never gets a green at one half of a dual-carriageway crossing and a red at the other
function syncSignalPhases() {
  const L = Signals.list, R = 36, par = L.map((_, i) => i), cells = new Map();
  const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  L.forEach((s, i) => { const k = Math.floor(s.n.x / R) * 100003 + Math.floor(s.n.z / R); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); });
  L.forEach((s, i) => {
    const gx = Math.floor(s.n.x / R), gz = Math.floor(s.n.z / R);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of cells.get((gx + dx) * 100003 + gz + dz) || []) {
      if (j > i && dist2(s.n.x, s.n.z, L[j].n.x, L[j].n.z) < R * R) { const a = find(i), b = find(j); if (a !== b) par[b] = a; }
    }
  });
  L.forEach((s, i) => { s.phase = L[find(i)].phase; });
}

/* ---------------- 早晚高峰: density and flow from the clock ---------------- */
const Traffic = {
  rushK: 0, _was: false,
  // 0..1: how deep into 早高峰 (7:00–9:30) / 晚高峰 (17:00–19:30), with half-hour ramps
  rushAt(m) { const f = (a, b) => clamp(Math.min(m - a, b - m) / 30, 0, 1); return Math.max(f(420, 570), f(1020, 1170)); },
  update() {
    const m = DayNight.clock;
    this.rushK = this.rushAt(m);
    const on = this.rushK > 0.5;
    if (on !== this._was) {
      this._was = on;
      Hooks.emit('traffic:rush', { on, name: this.rushName() });
      if (on && G.started) guard('rushToast', () => UI.toast(m < 720 ? '早高峰：二环堵成停车场了' : '晚高峰：全北京都在回家的路上', 2.8));
    }
  },
  rushName() { return this.rushK > 0.5 ? (DayNight.clock < 720 ? '早高峰' : '晚高峰') : ''; },
  night() { const m = DayNight.clock; return m >= 1380 || m < 330 ? 1 : 0; },
  densityK() {
    const m = DayNight.clock;
    const base = m >= 1380 || m < 330 ? 0.42 : m >= 1260 || m < 390 ? 0.7 : 1;
    return base * (1 + 0.5 * this.rushK);
  },
  target() { return Math.round((LOWQ ? 18 : 32) * this.densityK()); },
  flowK(cls) { return (1 - this.rushK * (cls <= 3 ? 0.5 : 0.3)) * (this.night() ? 1.1 : 1); },
};

const _lp = [0, 0, 0, 1], _lq = [0, 0, 0, 1], _bz = [0, 0, 0, 1];
function bezAt(T, u, out) {
  const a = (1 - u) * (1 - u) * (1 - u), b = 3 * (1 - u) * (1 - u) * u, c = 3 * (1 - u) * u * u, d = u * u * u;
  const X = T.x, Z = T.z;
  out[0] = a * X[0] + b * X[1] + c * X[2] + d * X[3]; out[1] = a * Z[0] + b * Z[1] + c * Z[2] + d * Z[3];
  const ta = 3 * (1 - u) * (1 - u), tb = 6 * (1 - u) * u, tc = 3 * u * u;
  out[2] = ta * (X[1] - X[0]) + tb * (X[2] - X[1]) + tc * (X[3] - X[2]); out[3] = ta * (Z[1] - Z[0]) + tb * (Z[2] - Z[1]) + tc * (Z[3] - Z[2]);
  return out;
}
const CLS_W = [1.4, 1.4, 1.25, 1.1, 1, 0.55, 0, 0];
// seconds of green left for this approach (0 = red / all-red); same cycle as Signals.green
function sigGreenLeft(sig, axis) { const t = (Signals.t + sig.phase) % 34; return axis === 0 ? (t < 14 ? 14 - t : 0) : (t >= 17 && t < 31 ? 31 - t : 0); }
const _opts = [];
const TRF = {
  dbg: { green: 0, late: 0, ran: 0, turns: 0, past: 0, late2: 0, panic: 0 },
  // pick where to go at node n arriving on eIn with heading h1; strict = no dead-end U-turn fallback
  choose(n, eIn, h1, strict) {
    const o = _opts; o.length = 0; let tw = 0;
    for (const e2 of n.edges) {
      if (e2 === eIn || !TE(e2)) continue;
      const d2 = e2.a === n.id ? 1 : -1;
      if (e2.oneway && d2 < 0) continue;
      const turn = angDiff(h1, TR.depH(e2, d2)), at = Math.abs(turn);
      if (at > 2.5) continue; // no U-turns through the median
      let w = (at < 0.45 ? 6 : turn < 0 ? 3 : 2.2) * CLS_W[e2.cls];
      if (TR.tdeg[TR.endNode(e2, d2).id] <= 1) w *= 0.05;
      o.push(e2, d2, turn, w); tw += w;
    }
    if (!o.length) {
      if (strict) return null;
      // dead end (or the map edge): turn around on the same street
      return { e: eIn, dir: TR.endNode(eIn, 1) === n ? -1 : 1, turn: Math.PI };
    }
    let r = Math.random() * tw;
    for (let k = 0; k < o.length; k += 4) { r -= o[k + 3]; if (r <= 0 || k + 4 >= o.length) return { e: o[k], dir: o[k + 1], turn: o[k + 2] }; }
    return null;
  },
  // decide the next move while entering an edge: short stubs inside big junction boxes are skipped over by one curve
  plan(c) {
    const t = c.tr, e = t.e, dir = t.dir, n = TR.endNode(e, dir);
    let pick = this.choose(n, e, TR.arrH(e, dir), false);
    let turn = pick.turn;
    for (let chain = 0; chain < 3 && TR.sOut(pick.e, pick.dir) - TR.sIn(pick.e, pick.dir) < 3; chain++) {
      const nxt = this.choose(TR.endNode(pick.e, pick.dir), pick.e, TR.arrH(pick.e, pick.dir), true);
      if (!nxt) break;
      turn += nxt.turn; pick = nxt;
    }
    const nl = tLanes(pick.e), lane = turn < -0.6 ? nl - 1 : turn > 0.6 ? 0 : Math.min(t.lane, nl - 1);
    // one junction = one light: the other nodes of the same crossing (dual carriageways) don't stop you again
    let sig = n.signal || null;
    if (e.len > 60 || pick.turn === Math.PI) t.sigN = null; // a long block (or turning back) leaves the last crossing behind
    if (sig && t.sigN && dist2(t.sigN.x, t.sigN.z, n.x, n.z) < 45 * 45) sig = null;
    // curve radius ≈ trim / tan(θ/2) → a comfortable cornering speed
    const at = Math.min(Math.abs(turn), 3), trimL = Math.max(1, e.len - TR.sOut(e, dir) + TR.sIn(pick.e, pick.dir));
    const R = at < 0.1 ? 999 : Math.max(2.5, trimL * 0.5 / Math.tan(at / 2));
    // the light after next, when the block beyond this junction is short: we must be able to stop for it too
    const n2 = TR.endNode(pick.e, pick.dir), len2 = TR.sOut(pick.e, pick.dir) - TR.sIn(pick.e, pick.dir);
    const sig2 = n2.signal && len2 < 60 && !(n.signal && dist2(n2.x, n2.z, n.x, n.z) < 45 * 45) ? n2.signal : null;
    t.nx = { e: pick.e, dir: pick.dir, lane, turn, sig, pass: n.signal ? n : null, axis: sig ? TR.axis(e, dir) : 0, vTurn: Math.sqrt(3.4 * R), sig2, ax2: sig2 ? TR.axis(pick.e, pick.dir) : 0, len2, trimL };
    t.go = !sig; t.late = false; t.squeeze = 0;
    t.nx.dead = pick.e === e && e.oneway;
    t.cruise = e.C.spd * c.cruiseK * Traffic.flowK(e.cls);
  },
  startTurn(c, over) {
    const t = c.tr, nx = t.nx;
    lanePt(t.e, t.dir, TR.sOut(t.e, t.dir), t.off, _lp);
    const s3 = TR.sIn(nx.e, nx.dir), off3 = tLaneOff(nx.e, nx.lane);
    lanePt(nx.e, nx.dir, s3, off3, _lq);
    const ch = hyp(_lq[0] - _lp[0], _lq[1] - _lp[1]), k = Math.max(ch * 0.42, Math.abs(nx.turn) > 2.4 ? 3.5 : 0.3);
    const T = t.turn || (t.turn = { x: new Float32Array(4), z: new Float32Array(4), len: 1, u: 0, on: false, s3: 0, off3: 0 });
    T.x[0] = _lp[0]; T.z[0] = _lp[1]; T.x[1] = _lp[0] + _lp[2] * k; T.z[1] = _lp[1] + _lp[3] * k;
    T.x[3] = _lq[0]; T.z[3] = _lq[1]; T.x[2] = _lq[0] - _lq[2] * k; T.z[2] = _lq[1] - _lq[3] * k;
    let L = 0, px = T.x[0], pz = T.z[0];
    for (let i = 1; i <= 8; i++) { bezAt(T, i / 8, _bz); L += hyp(_bz[0] - px, _bz[1] - pz); px = _bz[0]; pz = _bz[1]; }
    T.len = Math.max(0.5, L); T.u = over / T.len; T.on = true; T.s3 = s3; T.off3 = off3;
    this.dbg.turns++;
    if (nx.pass) t.sigN = nx.pass; // every signalled node of a crossing counts as the same light
    if (nx.sig) { if (Signals.green(nx.sig, nx.axis)) this.dbg.green++; else if (t.late) this.dbg.late++; else this.dbg.ran++; }
  },
};

// the nearest thing in front of car c within range: { d = gap from c's centre to its near side, who }
const _ob = { d: 99, who: null };
// a shop / interior door or a subway entrance within r of (x, z)
function nearDoor(x, z, r) {
  const r2 = r * r, D = W.doors, S = W.stations;
  if (D) for (let i = 0; i < D.length; i++) if (dist2(D[i].x, D[i].z, x, z) < r2) return true;
  if (S) for (let i = 0; i < S.length; i++) if (S[i].door && dist2(S[i].door.x, S[i].door.z, x, z) < r2) return true;
  return false;
}
// is there room `dl` metres to the side (positive = right) for a lane change?
function laneFree(c, dl) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading), CL = Cars.list;
  for (let i = 0; i < CL.length; i++) {
    const o = CL[i];
    if (o === c || o.removed || o.y > 2.5) continue;
    const dx = o.pos.x - c.pos.x, dz = o.pos.z - c.pos.z;
    if (dx * dx + dz * dz > 144) continue;
    const f = dx * fx + dz * fz, l = -(dx * fz - dz * fx); // right of travel is (-fz, fx)
    if (Math.abs(f) < 6.5 && Math.abs(l - dl) < 2.3) return false;
  }
  return true;
}
const onTurn = (c) => !!(c.state === 'traffic' && c.tr && c.tr.turn && c.tr.turn.on);
// no closures / for..of here: ~55 calls per frame, it used to be the biggest garbage source of the sim
function obstacleAhead(c, range = 15) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading), px = c.pos.x, pz = c.pos.z, hw = c.k.wid * 0.5, cTurn = onTurn(c);
  let best = 99, who = null;
  const CL = Cars.list;
  for (let i = 0; i < CL.length; i++) {
    const o = CL[i];
    if (o === c || o.removed || o.state === 'held' || o.state === 'thrown' || o.y > 2.5) continue;
    const dx = o.pos.x - px, dz = o.pos.z - pz;
    if (dx > range + 4 || dx < -range - 4 || dz > range + 4 || dz < -range - 4) continue;
    const f = dx * fx + dz * fz;
    if (f <= 0.3 || f > range + 3) continue;
    const dh = o.heading - c.heading, cd = Math.cos(dh), cs = Math.abs(cd), sn = Math.abs(Math.sin(dh));
    // crossing or oncoming AI traffic: whoever is already in the junction goes first, ties by id — no standoffs
    if (o.state === 'traffic') {
      const oTurn = onTurn(o);
      if (cd < -0.85 && !cTurn && !oTurn && c.tr && o.tr && c.tr.e !== o.tr.e) continue; // the other carriageway (squashed onto ours by the map compression)
      if (cd < 0.6) { if ((cTurn && !oTurn) || (cTurn === oTurn && c.id < o.id)) continue; }
      // two curves merging into one lane: the lower id slots in first
      else if (cTurn && oTurn && cd < 0.97 && c.id < o.id && (px - o.pos.x) * Math.sin(o.heading) + (pz - o.pos.z) * Math.cos(o.heading) > -1) continue;
    }
    const ow = cs * o.k.wid * 0.5 + sn * o.k.len * 0.5, ol = cs * o.k.len * 0.5 + sn * o.k.wid * 0.5;
    if (Math.abs(dx * fz - dz * fx) < hw + ow + 0.05 && f - ol < best) { best = f - ol; who = o; }
  }
  const R1 = range + 1, R1q = R1 * R1;
  if (Player.mode !== 'dead' && !(Player.car && Player.car === c) && (Player.mode !== 'car' || !Player.car)) {
    const r = Player.radius(), dx = Player.pos.x - px, dz = Player.pos.z - pz, f = dx * fx + dz * fz;
    if (f > 0 && f <= R1 && Math.abs(dx * fz - dz * fx) < hw + r + 0.3 && f - r < best) { best = f - r; who = Player; }
  }
  const PL = Peds.list;
  for (let i = 0; i < PL.length; i++) {
    const p = PL[i], dx = p.pos.x - px, dz = p.pos.z - pz;
    if (dx * dx + dz * dz >= R1q) continue;
    const f = dx * fx + dz * fz;
    if (f > 0 && f <= R1 && Math.abs(dx * fz - dz * fx) < hw + 0.75 && f - 0.45 < best) { best = f - 0.45; who = p; }
  }
  _ob.d = best; _ob.who = who;
  return _ob;
}

/* ---------------- A* on the road graph for the legal department ---------------- */
const NAVF = (e) => e.cls <= 5 && e.a !== e.b;
const Nav = {
  g: null, pe: null, st: null, cl: null, hn: null, hf: null, hs: 0, stamp: 0, cap: 0,
  init() {
    const N = Roads.nodes.length;
    this.g = new Float32Array(N); this.pe = new Int32Array(N); this.st = new Uint32Array(N); this.cl = new Uint32Array(N);
    this.cap = N * 3 + 64; this.hn = new Int32Array(this.cap); this.hf = new Float32Array(this.cap);
  },
  push(n, f) {
    if (this.hs >= this.cap) return;
    const hn = this.hn, hf = this.hf; let i = this.hs++;
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hn[i] = hn[p]; hf[i] = hf[p]; i = p; }
    hn[i] = n; hf[i] = f;
  },
  pop() {
    const hn = this.hn, hf = this.hf, n = hn[0]; this._f = hf[0];
    const N = --this.hs, ln = hn[N], lf = hf[N]; let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= N) break; if (c + 1 < N && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hn[i] = hn[c]; hf[i] = hf[c]; i = c; }
    hn[i] = ln; hf[i] = lf;
    return n;
  },
  // srcs / goals: [[nodeId, extraCost], ...] → { edges (travel order), start, goal } or null
  find(srcs, goals, gx, gz, maxIt = 6000) {
    const st = ++this.stamp, g = this.g, pe = this.pe, S = this.st, C = this.cl, nodes = Roads.nodes;
    this.hs = 0;
    for (const [n, c] of srcs) if (S[n] !== st || c < g[n]) { S[n] = st; g[n] = c; pe[n] = -1; this.push(n, c + hyp(nodes[n].x - gx, nodes[n].z - gz) * 0.85); }
    let best = Infinity, bestN = -1, it = 0;
    while (this.hs && it++ < maxIt) {
      const n = this.pop();
      if (this._f >= best) break;
      if (C[n] === st) continue;
      C[n] = st;
      for (const [gn, gc] of goals) if (gn === n && g[n] + gc < best) { best = g[n] + gc; bestN = n; }
      for (const e of nodes[n].edges) {
        if (!NAVF(e)) continue;
        const m = e.a === n ? e.b : e.a, c = g[n] + e.len * (e.cls <= 2 ? 0.85 : e.cls === 5 ? 1.25 : 1) * (e.oneway && e.b === n ? 1.5 : 1);
        if (S[m] !== st || c < g[m]) { S[m] = st; g[m] = c; pe[m] = e.id; C[m] = C[m] === st ? 0 : C[m]; this.push(m, c + hyp(nodes[m].x - gx, nodes[m].z - gz) * 0.85); }
      }
    }
    if (bestN < 0) return null;
    const edges = []; let n = bestN;
    while (pe[n] >= 0 && edges.length < 4000) { const e = Roads.edges[pe[n]]; edges.push(e); n = e.a === n ? e.b : e.a; }
    edges.reverse();
    return { edges, start: n, goal: bestN };
  },
  // polyline points of e from arc length s0 to s1 (either direction), excluding s0's own point
  span(e, s0, s1, X, Z) {
    const P = e.pts, cum = e.cum;
    if (s1 >= s0) { for (let i = 0; i < P.length; i++) if (cum[i] > s0 + 0.01 && cum[i] < s1 - 0.01) { X.push(P[i][0]); Z.push(P[i][1]); } }
    else for (let i = P.length - 1; i >= 0; i--) if (cum[i] < s0 - 0.01 && cum[i] > s1 + 0.01) { X.push(P[i][0]); Z.push(P[i][1]); }
    Roads.at(e, s1, _pa); X.push(_pa[0]); Z.push(_pa[1]);
  },
  // a drivable polyline from (x,z) facing heading to (tx,tz): { x:[], z:[], n, i }
  route(x, z, heading, tx, tz) {
    const A = Roads.nearest(x, z, 70, NAVF), B = Roads.nearest(tx, tz, 90, NAVF);
    if (!A || !B) return null;
    const X = [A.x], Z = [A.z];
    if (A.e === B.e) this.span(A.e, A.s, B.s, X, Z);
    else {
      const fx = Math.sin(heading), fz = Math.cos(heading), nd = Roads.nodes;
      const behind = (id) => ((nd[id].x - x) * fx + (nd[id].z - z) * fz > 0 ? 0 : 25);
      const r = this.find([[A.e.a, A.s + behind(A.e.a)], [A.e.b, A.e.len - A.s + behind(A.e.b)]], [[B.e.a, B.s], [B.e.b, B.e.len - B.s]], tx, tz);
      if (!r) return null;
      this.span(A.e, A.s, r.start === A.e.a ? 0 : A.e.len, X, Z);
      let n = r.start;
      for (const e of r.edges) { const fw = e.a === n; this.span(e, fw ? 0 : e.len, fw ? e.len : 0, X, Z); n = fw ? e.b : e.a; }
      this.span(B.e, r.goal === B.e.a ? 0 : B.e.len, B.s, X, Z);
    }
    X.push(tx); Z.push(tz);
    return { x: X, z: Z, n: X.length, i: 0 };
  },
  // pure pursuit: the point `look` metres down the path from the car's projection; returns the squared distance off the path
  pursue(P, x, z, look, out) {
    let bi = P.i, bt = 0, bd = Infinity;
    for (let k = P.i; k < Math.min(P.n - 1, P.i + 10); k++) {
      const ax = P.x[k], az = P.z[k], dx = P.x[k + 1] - ax, dz = P.z[k + 1] - az, L2 = dx * dx + dz * dz || 1e-9;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = dist2(x, z, ax + dx * t, az + dz * t);
      if (d < bd) { bd = d; bi = k; bt = t; }
    }
    P.i = bi;
    let k = bi, cx = P.x[k] + (P.x[k + 1] - P.x[k]) * bt, cz = P.z[k] + (P.z[k + 1] - P.z[k]) * bt, rem = look;
    while (k < P.n - 1) {
      const nx = P.x[k + 1], nz = P.z[k + 1], L = hyp(nx - cx, nz - cz);
      if (L >= rem) { out[0] = cx + (nx - cx) * rem / L; out[1] = cz + (nz - cz) * rem / L; return bd; }
      rem -= L; cx = nx; cz = nz; k++;
    }
    out[0] = P.x[P.n - 1]; out[1] = P.z[P.n - 1];
    return bd;
  },
};
// no building / water / walled compound on the straight line between two points (1.5 m steps on the occupancy grid)
function clearLine(ax, az, bx, bz) {
  const L = hyp(bx - ax, bz - az), n = Math.ceil(L / 1.5);
  for (let i = 1; i < n; i++) { const k = Grid.at(ax + (bx - ax) * i / n, az + (bz - az) * i / n); if (k === GK.BLD || k === GK.WATER || k === GK.RESV) return false; }
  return true;
}

let CAR_ID = 0;
class Car {
  constructor(kind, color) {
    this.id = ++CAR_ID; this.kind = kind; this.k = CAR_KINDS[kind];
    this.color = color ?? pick(this.k.colors);
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(carGeo(kind, this.color), MAT.vc); this.body.castShadow = true;
    this.lights = new THREE.Mesh(carLightsGeo(kind), MAT.carLights);
    this.group.add(this.body, this.lights);
    this.beamQ = null;
    if (!this.k.bike) { this.beamQ = new THREE.Mesh(BEAM_GEO, MAT.headBeam); this.beamQ.renderOrder = 2; this.group.add(this.beamQ); }
    const dm = decalMats();
    if (kind === 'legal' || kind === 'taxi') {
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), kind === 'legal' ? dm.legal : dm.taxi); dec.geometry.userData.own = true;
      dec.rotation.x = -Math.PI / 2; dec.rotation.z = Math.PI / 2; dec.position.set(0, 1.695, -0.5); this.group.add(dec);
    }
    if (kind === 'legal') {
      this.lr = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.36), dm.red); this.lr.geometry.userData.own = true; this.lr.position.set(-0.36, 1.78, 0.35);
      this.lb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.36), dm.blue); this.lb.geometry.userData.own = true; this.lb.position.set(0.36, 1.78, 0.35);
      this.group.add(this.lr, this.lb);
    }
    scene.add(this.group);
    this.pos = new V3(); this.vel = new V3(); this.heading = 0; this.speed = 0;
    this.y = 0; this.gy = 0; this.rx = 0; this.rz = 0; this.wx = 0; this.wy = 0; this.wz = 0;
    this.hp = kind === 'legal' ? 130 : 100; this.state = 'traffic';
    this.fireT = 0; this.exploded = false; this.burnt = false; this.age = 0; this.settleT = 0;
    this.radius = this.k.len * 0.45; this.colR = this.k.bike ? 0.42 : 0; this.cruiseK = 1;
    this.blockedT = 0; this.ghostT = 0; this.honkT = 0; this.throwCd = rand(1.5, 3); this.ramCd = 0; this.stuckT = 0; this.revT = 0; this.idleT = 0; this.waiting = false;
    this.tr = null; this.path = null; this.navT = 0; this.wd = 99; this.removed = false; this.hasDriver = true; this.flashT = 0;
    this.plateSlot = -1; this.plate = ''; this.local = true;
    if (!this.k.bike) this.newPlate();
    this.name = CAR_NAMES[kind] + (this.plate ? ' · ' + this.plate : '');
  }
  newPlate() {
    Plates.release(this.plateSlot);
    const i = this.plateSlot = Plates.used ? Plates.alloc(this.kind) : -1;
    this.plate = i >= 0 ? Plates.txt[i] : '京A·' + randi(10000, 99999); this.local = i >= 0 ? Plates.local[i] : true;
    this.name = CAR_NAMES[this.kind] + ' · ' + this.plate;
  }
  // drop this car onto a lane: spot = { e, dir, s } (travel-frame s, like Roads.randomSpot)
  placeOnRoad(spot) {
    const e = spot.e, dir = e.oneway ? 1 : spot.dir, a = TR.sIn(e, dir), b = TR.sOut(e, dir);
    const s = clamp(spot.s, a, Math.max(a, b - 2)), lane = randi(0, tLanes(e) - 1);
    this.state = 'traffic';
    this.tr = { e, dir, lane, s, off: tLaneOff(e, lane), turn: this.tr && this.tr.turn || null, nx: null, go: true, late: false, cruise: 10, sigN: null };
    if (this.tr.turn) this.tr.turn.on = false;
    this.cruiseK = rand(0.86, 1.12);
    TRF.plan(this);
    lanePt(e, dir, s, this.tr.off, _lp);
    this.pos.set(_lp[0], 0, _lp[1]); this.heading = Math.atan2(_lp[2], _lp[3]);
    this.speed = this.tr.cruise * 0.7;
    const nx = this.tr.nx;
    if (nx.sig) { const dStop = b - 1.2 - s; if (!Signals.green(nx.sig, nx.axis) || dStop < 8) { this.tr.go = dStop < -0.3; this.speed = Math.min(this.speed, Math.sqrt(2 * 3 * Math.max(0, dStop - 0.3))); } }
    this.vel.set(_lp[2] * this.speed, 0, _lp[3] * this.speed);
    this.y = 0; this.rx = this.rz = 0; this.hasDriver = true; this.age = 0; this.blockedT = 0; this.ghostT = 0; this.idleT = 0; this.waiting = false; this.wd = 99;
    this.gy = VehGround.at(this.pos.x, this.pos.z);
    this.sync();
  }
  drivable() { return !this.removed && this.hp > 0 && !this.burnt && (this.state === 'traffic' || this.state === 'parked' || this.state === 'legal') && this.y < 0.5 && Math.abs(Math.cos(this.rx) * Math.cos(this.rz)) > 0.5; }
  damage(d) {
    if (this.exploded) return;
    if (this.k.bike) {
      // a bike never catches fire: whatever hits it hits the rider
      if (this === Player.car && d > 4 && Player.mode === 'car') { Player.hp -= d * 0.6; UI.hurt(0.3); if (Player.hp <= 0) { Player.hp = 0; Player.bailOut(false); Player.die('car'); } }
      return;
    }
    if (this === Player.car) d *= RPG.m.carDmg;
    this.hp -= d;
    if (this.hp <= 0 && this.fireT <= 0) { this.fireT = rand(1.4, 2.4); }
  }
  knock(vx, vy, vz, dmg) {
    if (this.removed || this.state === 'held' || this.state === 'thrown') return;
    if (this === Player.car) { this.vel.x += vx * 0.4; this.vel.z += vz * 0.4; this.damage(dmg * 0.6); return; }
    if (this.hasDriver && !this.exploded) this.ejectDriver(false);
    this.state = 'ragdoll'; this.settleT = 0;
    this.vel.set(vx, Math.max(vy, 2), vz);
    const s = clamp(hyp(vx, vz) / 12, 0.4, 2.2), spin = dmg < 25 ? 2.5 : 5;
    this.wx = rand(-spin, spin) * s; this.wy = rand(-4, 4) * s; this.wz = rand(-spin, spin) * s;
    this.damage(dmg);
  }
  ejectDriver(stolen) {
    if (!this.hasDriver) return;
    this.hasDriver = false;
    if (this.kind === 'legal' || this.k.bike) return;
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    const p = Peds.spawnAt(this.pos.x + lx * 2.2, this.pos.z + lz * 2.2);
    if (p) { p.panic(this.pos.x, this.pos.z, 5); Bubble.say(p, stolen ? pick(['我的车！！', '我刚提的车！', '抢车啦！', '车贷还没还完！', '摇了八年号才摇上的！']) : pick(['吓死我了', '救命！', '保险能赔吗？']), 2.2, 'ped'); }
  }
  explode(noDmg) {
    if (this.exploded) return;
    this.exploded = true; this.burnt = true; this.hp = 0; this.fireT = 0;
    this.body.material = MAT.burnt; this.lights.visible = false; if (this.beamQ) this.beamQ.visible = false;
    if (this.lr) { this.lr.visible = this.lb.visible = false; }
    RPG.gainXP(10); G.addMoney(1500);
    const wasPlayer = Player.car === this;
    if (wasPlayer) Player.bailOut(true);
    this.state = 'ragdoll'; this.settleT = 0; this.vel.y = 9; this.wx = rand(-3, 3); this.wz = rand(-3, 3);
    FX.boom(this.pos.x, 1.4 + this.y + this.gy, this.pos.z, this.k.bike ? 0.6 : 1.25, !noDmg);
    Sfx.boom(false);
    if (this.kind === 'legal') { FX.confetti(this.pos.x, 2, this.pos.z, 26); Floaters.add(this.pos.x, 4, this.pos.z, '律师函退回！', 'fl-bonus'); }
    G.stats.cars++;
    this.age = 0;
  }
  remove() { if (this.removed) return; this.removed = true; scene.remove(this.group); disposeOwn(this.group); Plates.release(this.plateSlot); this.plateSlot = -1; if (Player.held === this) Player.held = null; }
  sync() {
    this.group.position.set(this.pos.x, this.y + this.gy, this.pos.z);
    this.group.rotation.set(this.rx, this.heading, this.rz, 'YXZ');
  }
  // lowest point of the tumbling body below its origin: rolled cars rest on roof / side instead of sinking into the road
  clearance() {
    const k = this.k, cx = Math.cos(this.rx), sx = Math.sin(this.rx), cz = Math.cos(this.rz), sz = Math.sin(this.rz);
    return Math.abs(sz * cx) * k.wid / 2 + Math.abs(sx) * k.len / 2 - Math.min(0, cz * cx) * k.h;
  }
  update(dt) {
    this.age += dt;
    if (this.ramCd > 0) this.ramCd -= dt;
    switch (this.state) {
      case 'traffic': this.trafficStep(dt); break;
      case 'parked': this.parkedStep(dt); break;
      case 'ragdoll': this.ragdollStep(dt); break;
      case 'thrown': this.thrownStep(dt); break;
      case 'legal': this.legalStep(dt); break;
      case 'wreck': if (Math.random() < dt * 2 && this.age < 25) FX.smoke(this.pos.x, 1.5 + this.gy, this.pos.z, 1, 2.5, 0.18); break;
      default: break;
    }
    if (this.state !== 'held' && this.state !== 'thrown' && (this.state !== 'parked' || this.age < 1 || this.vel.x * this.vel.x + this.vel.z * this.vel.z > 0.01)) this.gy = damp(this.gy, VehGround.at(this.pos.x, this.pos.z), 12, dt);
    if (this.fireT > 0 && !this.exploded) {
      this.fireT -= dt;
      if (Math.random() < dt * 30) FX.fire(this.pos.x + Math.sin(this.heading) * 1.4, 1.4 + this.y + this.gy, this.pos.z + Math.cos(this.heading) * 1.4, 1);
      if (this.fireT <= 0) this.explode();
    }
    if (this.lr && !this.burnt) { this.flashT += dt; const on = (this.flashT * 6) % 2 < 1; this.lr.visible = on; this.lb.visible = !on; }
    if (this.state !== 'player' && this.state !== 'held') this.sync();
  }
  trafficStep(dt) {
    const t = this.tr;
    if (!t) { this.state = 'parked'; return; }
    const T = t.turn, onTurn = !!(T && T.on), nx = t.nx;
    let want = onTurn ? Math.min(t.cruise, nx.vTurn * 1.15) : t.cruise, waitLight = false, brake = 0;
    const sOut = TR.sOut(t.e, t.dir), dEnd = sOut - t.s;
    if (!onTurn) {
      // slow for the corner ahead
      want = Math.min(want, Math.sqrt(nx.vTurn * nx.vTurn + 2 * 3.2 * Math.max(0, dEnd)));
      // traffic light at the end of this block: stop on red, and on a green that won't last until we get there
      if (!t.go) {
        const dStop = dEnd - 1.2, rem = sigGreenLeft(nx.sig, nx.axis), v = Math.max(0, this.speed);
        const tArr = (Math.sqrt(v * v + 6 * Math.max(0, dStop)) - v) / 3; // time to the line, pulling away at 3 m/s²
        if (dStop < -0.3) { t.go = true; TRF.dbg.past++; }
        else if (rem > 0 && (dStop < 1 || tArr < rem - 0.3 || v * v > 2 * 6 * dStop)) { if (dStop < 1) { t.go = true; t.late = rem < 0.5; } }
        else if (v * v > 2 * 6.5 * Math.max(0.2, dStop)) { t.go = true; TRF.dbg.late2++; } // too late to stop: 抢黄灯
        else { want = Math.min(want, Math.sqrt(2 * 4 * Math.max(0, dStop - 0.25))); waitLight = dStop < 25; brake = clamp(v * v / (2 * Math.max(0.3, dStop - 0.25)) * 1.25, 4, 12); }
      }
    }
    if (nx.sig2) {
      const d2 = (onTurn ? (1 - T.u) * T.len : Math.max(0, dEnd) + nx.trimL) + nx.len2 - 1.2, v = Math.max(0, this.speed);
      const rem2 = sigGreenLeft(nx.sig2, nx.ax2), tArr2 = (Math.sqrt(v * v + 6 * d2) - v) / 3;
      if (!(rem2 > 0 && tArr2 < rem2 - 0.3)) want = Math.min(want, Math.sqrt(2 * 3.5 * Math.max(0, d2 - 0.25)) + 2);
    }
    // the mech is stomping around: floor it, lights be damned
    const panic = Player.isMech() && dist2(this.pos.x, this.pos.z, Player.pos.x, Player.pos.z) < 900;
    if (panic) { want = Math.max(want, t.cruise * 1.5); if (!t.go) TRF.dbg.panic++; t.go = true; }
    // wd = how many cars back from a red light we queue (99 = not queued); a loop of cars blocking each other counts up and out
    if (this.ghostT > 0) { this.ghostT -= dt; this.wd = waitLight ? 0 : 99; }
    else {
      const ob = obstacleAhead(this, 9 + this.speed * 1.3);
      let wd = waitLight ? 0 : 99;
      if (ob.who) {
        const gap = ob.d - this.k.len * 0.5, o = ob.who;
        const vo = o instanceof Car && (o.state === 'traffic' || o.state === 'player' || o.state === 'legal') ? Math.max(0, o.speed) : 0;
        want = Math.min(want, Math.max(0, vo + (gap - 2.4) * 1.1));
        if (gap < 1.4) { want = 0; this.speed = Math.min(this.speed, Math.max(0, gap - 0.4) * 3); }
        if (!waitLight && o.wd !== undefined && o.wd < 40 && gap < 14) wd = o.wd + 1;
        if (this.speed < 0.6 && wd >= 40 && gap < 10) {
          this.blockedT += dt;
          const isPlayer = o === Player || (Player.car && o === Player.car);
          if (!isPlayer && !(o instanceof Car) && this.blockedT > 1.5 && this.honkT <= 0) { this.honkT = rand(2, 3); Sfx.horn(); Peds.dodge(this.pos.x, this.pos.z, Math.sin(this.heading) * 6, Math.cos(this.heading) * 6, 3); }
          if (isPlayer && this.blockedT > 1.2 && this.honkT <= 0) {
            this.honkT = rand(3, 5); Sfx.horn(); Bubble.say(this, pick(['滴滴——劳驾让让！', '您倒是往边儿上靠靠啊！', '起开起开！', '会不会走道儿啊？', '这儿不让停车您不知道啊？']), 1.6, 'ped');
          }
          // something parked in my lane: change lanes if there's another one, otherwise squeeze past after a while
          if (!isPlayer && this.blockedT > (this.dodgeAt || 0) + 1.2 && !onTurn && !(o instanceof Car && o.state === 'traffic')) {
            const nl = tLanes(t.e), alt = t.lane > 0 ? t.lane - 1 : t.lane + 1;
            if (nl > 1) { if (laneFree(this, tLaneOff(t.e, alt) - t.off)) t.lane = alt; } else t.squeeze = t.s + 22;
            this.dodgeAt = this.blockedT;
          }
          if (!isPlayer && this.blockedT > 5) {
            this.ghostT = 2.2; this.blockedT = 0; this.dodgeAt = 0;
            const k = o instanceof Car ? 'g_' + o.state : 'g_ped'; TRF.dbg[k] = (TRF.dbg[k] || 0) + 1;
          }
        } else { this.blockedT = Math.max(0, this.blockedT - dt); if (this.speed > 2) this.dodgeAt = 0; }
      } else this.blockedT = 0;
      this.wd = wd;
    }
    this.waiting = this.wd < 40;
    if (this.honkT > 0) this.honkT -= dt;
    // gentle accel, firm brakes
    if (want > this.speed) this.speed = Math.min(want, this.speed + (3.4 - Traffic.rushK) * dt);
    else this.speed = Math.max(want, this.speed - Math.max(brake, this.speed - want > 5 ? 9 : 5) * dt);
    this.idleT = this.speed < 0.3 && !this.waiting ? this.idleT + dt : 0;
    let adv = this.speed * dt;
    if (!onTurn) {
      if (!t.go) { const lim = sOut - 1.2; if (t.s + adv > lim) adv = Math.max(0, lim - t.s); }
      t.s += adv;
      // lane changes glide
      const wantOff = tLaneOff(t.e, t.lane) - (t.squeeze > t.s ? 1.4 : 0), dOff = clamp(wantOff - t.off, -1.8 * dt, 1.8 * dt);
      t.off += dOff;
      if (t.s >= sOut && nx.dead) { if (Cars.recycle(this)) return; t.s = sOut; this.speed = 0; this.wd = 0; } // one-way dead end: wait out of sight, never drive against the arrows
      if (t.s >= sOut && !nx.dead) TRF.startTurn(this, t.s - sOut);
      else {
        lanePt(t.e, t.dir, t.s, t.off, _lp);
        this.pos.x = _lp[0]; this.pos.z = _lp[1];
        this.heading = Math.atan2(_lp[2], _lp[3]) - (this.speed > 0.5 && dt > 1e-4 ? Math.atan2(dOff / dt, this.speed) : 0);
      }
    } else T.u += adv / T.len;
    if (t.turn && t.turn.on) {
      const T = t.turn;
      if (T.u >= 1) {
        const over = (T.u - 1) * T.len;
        T.on = false; t.e = nx.e; t.dir = nx.dir; t.lane = nx.lane; t.off = T.off3; t.s = T.s3 + over;
        TRF.plan(this);
        lanePt(t.e, t.dir, t.s, t.off, _lp);
        this.pos.x = _lp[0]; this.pos.z = _lp[1]; this.heading = Math.atan2(_lp[2], _lp[3]);
      } else {
        bezAt(T, T.u, _bz);
        this.pos.x = _bz[0]; this.pos.z = _bz[1];
        if (_bz[2] * _bz[2] + _bz[3] * _bz[3] > 1e-8) this.heading = Math.atan2(_bz[2], _bz[3]);
      }
    }
    this.vel.set(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed);
  }
  parkedStep(dt) {
    const f = Math.exp(-2.5 * dt);
    this.vel.x *= f; this.vel.z *= f;
    if (this.vel.x * this.vel.x + this.vel.z * this.vel.z > 0.01) {
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      vehicleWorldCollide(this, 1.1, this.k.len);
    }
  }
  ragdollStep(dt) {
    this.vel.y -= 32 * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.y += this.vel.y * dt;
    this.rx += this.wx * dt; this.heading += this.wy * dt; this.rz += this.wz * dt;
    const floor = this.clearance();
    if (this.y <= floor) {
      this.y = floor;
      if (this.vel.y < -5) { this.vel.y *= -0.3; this.wx *= 0.5; this.wz *= 0.5; Sfx.thud(); FX.dust(this.pos.x, this.pos.z, 3, 2.5); FX.sparks(this.pos.x, 0.5 + this.gy, this.pos.z, 4); }
      else this.vel.y = 0;
      this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt); this.wy *= Math.exp(-4 * dt);
    }
    const h = collideCircle(this.pos, this.k.bike ? 0.5 : 1.6);
    if (h && this.y < 6) {
      const vn = this.vel.x * h.nx + this.vel.z * h.nz;
      if (vn < 0) { this.vel.x -= h.nx * vn * 1.5; this.vel.z -= h.nz * vn * 1.5; if (vn < -8) { this.damage(-vn); Sfx.crash(-vn); FX.sparks(this.pos.x, this.y + 1, this.pos.z, 6); if (h.b && h.b.hq) h.b.hq.damage(-vn * 1.5, this.pos.x, this.pos.z, 'car'); } }
    }
    if (this.y <= floor + 0.05 && hyp(this.vel.x, this.vel.z) < 1.5) {
      this.settleT += dt;
      const upX = Math.round(this.rx / Math.PI) * Math.PI, upZ = Math.round(this.rz / Math.PI) * Math.PI;
      this.rx = damp(this.rx, upX, 8, dt); this.rz = damp(this.rz, upZ, 8, dt);
      this.wx *= 0.8; this.wz *= 0.8;
      if (this.settleT > 0.7) {
        this.rx = wrapA(upX); this.rz = wrapA(upZ);
        const upside = Math.cos(this.rx) * Math.cos(this.rz) < 0;
        if (upside && !this.burnt && !this.k.bike) this.damage(999);
        if (upside && this.k.bike) { this.rx = 0; this.rz = 0; }
        this.y = this.clearance();
        this.vel.set(0, 0, 0);
        this.state = this.burnt ? 'wreck' : 'parked';
        this.age = 0;
      }
    }
  }
  thrownStep(dt) {
    this.vel.y -= 24 * dt;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.y += this.vel.y * dt;
    this.rx += this.wx * dt; this.heading += this.wy * dt; this.rz += this.wz * dt;
    let hit = this.y <= 0.3;
    if (!hit) for (const s of solidsNear(this.pos.x, this.pos.z, 3)) if (this.y < s.h && inSolid(s, this.pos.x, this.pos.z, 1.8)) { hit = true; break; }
    if (!hit) for (const e of Enemies.list) if (!e.dead && dist2(e.pos.x, e.pos.z, this.pos.x, this.pos.z) < 12 && Math.abs(e.y - this.y) < 5) { hit = true; break; }
    if (!hit) for (const c of Cars.list) if (c !== this && !c.removed && c.state !== 'held' && dist2(c.pos.x, c.pos.z, this.pos.x, this.pos.z) < 10 && this.y < 3) { hit = true; break; }
    if (hit || this.age > 4) {
      this.y = Math.max(0, this.y);
      G.stats.throws++;
      Combat.explosion(this.pos.x, this.pos.z, 11 * (this.throwR || 1), 240 * (this.throwMul || 1), 'throw');
      if (this.exploded) {
        // a thrown wreck can't blow up twice: just crash down (explode() would return early and leave it 'thrown' forever)
        this.state = 'ragdoll'; this.settleT = 0; this.age = 0; this.vel.set(this.vel.x * 0.2, 6, this.vel.z * 0.2);
        FX.boom(this.pos.x, 1.4 + this.y, this.pos.z, 0.9, false); Sfx.boom(false);
      } else { this.hp = 0; this.explode(true); }
    }
  }
  // 法务专车: A* along the streets, straight at you once it can see you
  legalStep(dt) {
    const p = Player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = hyp(dx, dz) || 0.01;
    const lead = Player.mode === 'car' ? 0.5 : 0.25;
    const px = p.x + Player.vel.x * lead, pz = p.z + Player.vel.z * lead;
    let tx = px, tz = pz, vmax = this.k.maxSpd;
    this.navT -= dt;
    const direct = d < 34 && clearLine(this.pos.x, this.pos.z, p.x, p.z);
    if (!direct) {
      if (!this.path || this.navT <= 0) { this.navT = rand(1.8, 2.6); this.path = Nav.route(this.pos.x, this.pos.z, this.heading, p.x, p.z); }
      if (this.path) {
        const off = Nav.pursue(this.path, this.pos.x, this.pos.z, 7 + Math.abs(this.speed) * 0.45, _lp);
        tx = _lp[0]; tz = _lp[1];
        if (off > 400) this.navT = Math.min(this.navT, 0.3);
        // brake for the bend further down the path
        const i0 = this.path.i;
        Nav.pursue(this.path, this.pos.x, this.pos.z, 20 + Math.abs(this.speed) * 0.9, _lq); this.path.i = i0;
        const bend = Math.abs(angDiff(this.heading, Math.atan2(_lq[0] - this.pos.x, _lq[1] - this.pos.z)));
        vmax = lerp(this.k.maxSpd, 9, clamp(bend / 1.3, 0, 1));
      }
    } else this.path = null;
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z), diff = angDiff(this.heading, want);
    let steer = clamp(diff * 2.4, -1, 1), thr = Math.abs(diff) > 1.3 && this.speed > 12 ? -0.5 : this.speed > vmax + 2 ? -0.6 : this.speed > vmax ? 0 : 1;
    if (d < 7 && !Player.isMech()) thr = 0.25;
    if (this.revT > 0) { this.revT -= dt; thr = -1; steer = -steer; }
    driveCar(this, thr, steer, false, dt, this.k);
    const h = vehicleWorldCollide(this, 1.1, this.k.len);
    if (h && h.impact > 9) { this.damage(h.impact * 0.25); FX.sparks(this.pos.x, 1 + this.gy, this.pos.z, 4); }
    if (Math.abs(this.speed) < 2 && this.revT <= 0) { this.stuckT += dt; if (this.stuckT > 1.3) { this.revT = 0.9; this.stuckT = 0; this.navT = 0; this.idleT += 1.3; } } else if (Math.abs(this.speed) > 6) { this.stuckT = 0; this.idleT = 0; }
    vehicleImpacts(this, this, 1.9, false);
    // ram
    const pr = Player.radius() + 2.2;
    if (d < pr && this.ramCd <= 0 && Player.mode !== 'dead') {
      this.ramCd = 1.1;
      if (Player.isMech()) { this.knock(-dx / d * 16, 8, -dz / d * 16, 40); Sfx.crash(18); }
      else { Player.hurt(this.speed > 8 ? 16 : 9, 'legal'); this.vel.multiplyScalar(0.3); Sfx.crash(12); }
    }
    // lawyer's letters
    this.throwCd -= dt;
    if (this.throwCd <= 0 && d < 34 && Player.mode !== 'dead') {
      this.throwCd = rand(2.2, 3.4);
      Projectiles.letter(this.pos.x, 2.2, this.pos.z);
      if (Math.random() < 0.35) Bubble.say(this, pick(['律师函警告！', '您这属于侵权啊！', '我们保留追究的权利', '法务部办事儿，靠边儿！']), 1.8, 'legal');
    }
  }
}

/* ---------------- 共享单车: the parked instances from 04b become real bikes when you scan one ---------------- */
const _ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const Bikes = {
  ride: null, hintT: 0, ph: 0, lastH: 0, lastHint: null,
  all() { return W.bikes || (typeof BJB !== 'undefined' && BJB.bikes) || []; },
  nearest(x, z, r) {
    let best = null, bd = r * r;
    for (const b of this.all()) { if (b.taken) continue; const d = dist2(x, z, b.x, b.z); if (d < bd) { bd = d; best = b; } }
    return best;
  },
  take(b) {
    b.taken = true;
    const m = b._m || b.cm; // the instanced mesh + slot it was drawn with (04b chunkStatic)
    if (m && b.ci !== undefined) { m.setMatrixAt(b.ci, _ZERO_M); m.instanceMatrix.needsUpdate = true; }
    const c = new Car('bike', b.c !== undefined ? b.c : pick(CAR_KINDS.bike.colors));
    c.hasDriver = false; c.state = 'parked'; c.pos.set(b.x, 0, b.z); c.heading = b.ry; c.gy = VehGround.at(b.x, b.z); c.sync();
    Cars.list.push(c);
    return c;
  },
  mounted(c) {
    const H = Player.human;
    H.root.visible = true;
    this.ride = { t0: DayNight.clock, g0: G.time, x: c.pos.x, z: c.pos.z, dist: 0, car: c };
    this.lastH = c.heading;
    Hooks.emit('bike:start', { car: c, x: c.pos.x, z: c.pos.z });
    UI.hint(pick(['扫码成功 · 开锁！', '滴——开锁成功，骑行愉快', '押金？早退了。开骑！']));
  },
  dismounted(c) {
    const H = Player.human, R = this.ride;
    H.root.rotation.set(0, c.heading, 0);
    for (const k of ['legL', 'legR', 'armL', 'armR']) if (H[k]) H[k].rotation.x = 0;
    c.rz = 0; c.sync();
    if (R) {
      const minutes = Math.max(1, Math.round((DayNight.clock - R.t0 + 1440) % 1440));
      Hooks.emit('bike:end', { car: c, minutes, seconds: G.time - R.g0, dist: Math.round(R.dist), x: c.pos.x, z: c.pos.z });
    }
    this.ride = null;
  },
  // rider on the saddle, pedalling, leaning into turns (runs after Player.syncVisuals; the 3D head rides on the rig)
  update(dt) {
    const P = Player, c = P.car;
    if (P.mode !== 'car' || !c || !c.k.bike) {
      if (this.ride && (!c || !c.k.bike)) this.ride = null;
      // point out a parked bike when you walk up to one
      if ((this.hintT -= dt) <= 0) {
        this.hintT = 0.3;
        if (P.mode === 'human' && !Interiors.cur && !Cutscene.active) {
          const b = this.nearest(P.pos.x, P.pos.z, 2.2);
          // phones: the prompt line + the 「扫码」 button already say it, a toast on top would just repeat it
          if (b && b !== this.lastHint && !IS_TOUCH && !Cars.nearestDrivable(P.pos.x, P.pos.z, 3)) { this.lastHint = b; UI.hint('按 F 扫码骑共享单车'); }
        }
      }
      return;
    }
    if (dt <= 0) return;
    const H = P.human, sp = c.speed, fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    if (this.ride) this.ride.dist += Math.abs(sp) * dt;
    const yaw = angDiff(this.lastH, c.heading) / dt; this.lastH = c.heading;
    c.rz = damp(c.rz, clamp(-yaw * Math.abs(sp) * 0.045, -0.42, 0.42), 7, dt); c.sync();
    this.ph += dt * sp * 1.9;
    const gh = c.gy, lean = 0.2, s = Math.sin(this.ph);
    H.root.visible = true;
    H.root.rotation.order = 'YXZ'; H.root.rotation.set(lean, c.heading, c.rz);
    H.root.position.set(c.pos.x - fx * 0.2, gh + 0.2, c.pos.z - fz * 0.2);
    if (H.legL) { H.legL.rotation.x = -0.55 + s * 0.42; H.legR.rotation.x = -0.55 - s * 0.42; }
    if (H.armL) { H.armL.rotation.x = -0.72; H.armR.rotation.x = -0.72; }
    if (H.cape) H.cape.rotation.x = damp(H.cape.rotation.x, 0.3 + Math.abs(sp) * 0.06, 6, dt);
    // speech bubbles sit over the rider's head, not a car roof
    P.bubbleH = 1.05;
    Sfx.engine(false, 0);
  },
};

/* ---------------- the rules of the road, for the player: 闯红灯 / 超速 (fines live elsewhere; we only report) ---------------- */
const RoadRules = {
  eT: 0, cur: null, lastOut: null, box: null, spT: 0, lastN: null, lastT: -99,
  update(dt) {
    const P = Player, c = P.car;
    if (P.mode !== 'car' || !c || c.removed || Interiors.cur) { this.box = null; this.lastOut = null; return; }
    if ((this.eT -= dt) > 0) return;
    this.eT = 0.15; this.spT -= 0.15;
    const x = c.pos.x, z = c.pos.z, sp = Math.abs(c.speed);
    const n = Roads.nearest(x, z, 18);
    this.cur = n && n.d < n.e.hw + 1.5 ? n.e : null;
    if (this.cur && !this.box) this.lastOut = this.cur;
    // speeding on the big roads (二环 / 长安街 / 主干道)
    if (this.cur && this.cur.cls <= 2 && !c.k.bike) {
      const lim = this.cur.C.spd * 1.6;
      if (sp > lim && this.spT <= 0) { this.spT = 8; Hooks.emit('violation', { kind: 'speed', car: c, x, z, speed: sp, limit: lim, road: this.cur.name }); }
    }
    // red lights: note the light as you cross into a signalled junction box, judge it on the way out (右转不受灯控)
    if (!this.box && this.lastOut && sp > 1.5) {
      for (const id of [this.lastOut.a, this.lastOut.b]) {
        const nd = Roads.nodes[id]; if (!nd.signal) continue;
        if (this.lastN && G.time - this.lastT < 8 && dist2(nd.x, nd.z, this.lastN.x, this.lastN.z) < 45 * 45) continue; // same crossing
        const R = TR.boxR[id];
        if (dist2(x, z, nd.x, nd.z) > R * R || (nd.x - x) * c.vel.x + (nd.z - z) * c.vel.z <= 0) continue;
        this.box = { n: nd, R, red: !Signals.green(nd.signal, TR.axis(this.lastOut, this.lastOut.b === id ? 1 : -1)), h0: c.heading, sp };
        break;
      }
    }
    if (this.box) {
      const b = this.box; b.sp = Math.max(b.sp, sp);
      if (dist2(x, z, b.n.x, b.n.z) > (b.R + 3) * (b.R + 3)) {
        const turn = angDiff(b.h0, c.heading);
        if (b.red && b.sp > 3 && turn > -0.6) Hooks.emit('violation', { kind: 'redlight', car: c, x, z, node: b.n, bike: !!c.k.bike });
        this.box = null; this.lastN = b.n; this.lastT = G.time;
      }
    }
  },
};
Hooks.update(function vehicleHooks(dt) { RoadRules.update(dt); Bikes.update(dt); });

/* ---------------- the fleet: streaming traffic, parked cars, the legal department ---------------- */
const _frus = new THREE.Frustum(), _frM = new THREE.Matrix4(), _frI = new THREE.Matrix4(), _sph = new THREE.Sphere(new V3(), 4);
const Cars = {
  list: [], streamT: 0, lastP: new V3(), wasStarted: false, TR, TRF,
  target() { return Traffic.target(); },
  init() {
    TR.init(); Nav.init(); Plates.init(); VehGround.init(); syncSignalPhases();
    this.lastP.set(0, 0, 0);
    this.refill(0, 0); // the title shot looks at 长安街
  },
  center() { return G.started ? Player.pos : Cam.target; },
  occupied(x, z, r = 10) { for (const c of this.list) if (!c.removed && dist2(c.pos.x, c.pos.z, x, z) < r * r) return true; return false; },
  frustum() {
    camera.updateMatrixWorld(); _frI.copy(camera.matrixWorld).invert();
    _frM.multiplyMatrices(camera.projectionMatrix, _frI); _frus.setFromProjectionMatrix(_frM);
  },
  inView(x, z) { _sph.center.set(x, 1.5, z); return _frus.intersectsSphere(_sph); },
  // a lane spot, weighted by road class (big roads carry more cars), off-screen unless `vis`
  trafficSpot(fx, fz, minD, maxD, vis) {
    for (let k = 0; k < 8; k++) {
      const s = Roads.randomSpot(fx, fz, minD, maxD, 20, TE);
      if (!s || Math.random() > CLS_W[s.e.cls] / 1.4) continue;
      if (!vis && G.started && this.inView(s.x, s.z)) continue;
      const kd = Grid.at(s.x, s.z);
      if (kd === GK.BLD || kd === GK.WATER || kd === GK.RESV) continue;
      if (this.occupied(s.x, s.z)) continue;
      return s;
    }
    return null;
  },
  // an unseen traffic car becomes a "new" car somewhere else around the player
  recycle(c) {
    const p = this.center();
    if (G.started && this.inView(c.pos.x, c.pos.z)) return false;
    const s = this.trafficSpot(p.x, p.z, 85, 165, false);
    if (!s) return false;
    c.newPlate(); if (c.kind === 'sedan') { c.color = pick(c.k.colors); c.body.geometry = carGeo('sedan', c.color); }
    c.placeOnRoad(s);
    return true;
  },
  spawnTraffic(fx, fz, minD, maxD, vis) {
    const s = this.trafficSpot(fx, fz, minD, maxD, vis);
    if (!s) return null;
    const c = new Car(weighted([['sedan', 6], ['taxi', 2], ['van', 1.4], ['sport', 0.9]]));
    c.placeOnRoad(s); this.list.push(c);
    return c;
  },
  // move traffic to wherever the player is now (new game, respawn, teleports): on-screen spots allowed
  refill(fx, fz) {
    this.frustum();
    for (const c of this.list) if (c.state === 'traffic' && c !== Player.car && dist2(c.pos.x, c.pos.z, fx, fz) > 170 * 170) { const s = this.trafficSpot(fx, fz, 12, 170, true); if (s) { c.newPlate(); c.placeOnRoad(s); } else c.remove(); }
    let n = 0; for (const c of this.list) if (c.state === 'traffic' && !c.removed) n++;
    for (let k = n; k < this.target(); k++) this.spawnTraffic(fx, fz, 12, 170, true);
    // a few cars parked by the kerb right where you are, so stealing one is easy
    if (G.started) { let near = 0; for (const c of this.list) if (c.state === 'parked' && !c.k.bike && dist2(c.pos.x, c.pos.z, fx, fz) < 70 * 70) near++; for (let k = near; k < 3; k++) this.spawnParked(fx, fz, 10, 70, true); }
  },
  // 停车: half up on the kerb of a two-way street, the Beijing way
  spawnParked(fx, fz, minD, maxD, vis) {
    for (let k = 0; k < 10; k++) {
      const s = Roads.randomSpot(fx, fz, minD, maxD, 12, (e) => e.cls >= 3 && e.cls <= 5 && !e.oneway && e.a !== e.b && e.len > 30);
      if (!s) continue;
      const e = s.e, dir = s.dir, a = TR.sIn(e, dir) + 5, b = TR.sOut(e, dir) - 5;
      if (b <= a) continue;
      const sp = clamp(s.s, a, b);
      lanePt(e, dir, sp, e.hw + 0.45, _lp);
      const x = _lp[0], z = _lp[1], tx = _lp[2], tz = _lp[3];
      if (!vis && G.started && this.inView(x, z)) continue;
      if (nearDoor(x, z, 5.5)) continue; // never park on a door marker (you'd never reach the 1.5 m trigger from the street)
      const ok = (1 << GK.ROAD) | (1 << GK.WALK) | (1 << GK.FREE) | (1 << GK.PLAZA);
      if (!Grid.obbFree(x, z, 2.5, 1.2, tx, tz, ok)) continue;
      const other = Roads.nearest(x, z, 14, TE);
      if (other && other.e !== e && other.d < other.e.hw + 1.4) continue;
      let blocked = false;
      forSolids(x, z, 4, (so) => { if (inSolid(so, x + tx * 1.6, z + tz * 1.6, 1.2) || inSolid(so, x - tx * 1.6, z - tz * 1.6, 1.2) || inSolid(so, x, z, 1.2)) { blocked = true; return false; } });
      if (blocked || this.occupied(x, z, 7)) continue;
      for (let gx = Math.floor((x - 4) / PROP_CELL); gx <= Math.floor((x + 4) / PROP_CELL) && !blocked; gx++)
        for (let gz = Math.floor((z - 4) / PROP_CELL); gz <= Math.floor((z + 4) / PROP_CELL) && !blocked; gz++)
          for (const it of PropHash.get(gx * 100003 + gz) || []) { const px = it.x - x, pz = it.z - z, f = px * tx + pz * tz; if (Math.abs(f) < 3 && Math.abs(px * tz - pz * tx) < 1.6) { blocked = true; break; } }
      if (blocked) continue;
      const c = new Car(weighted([['sedan', 6], ['taxi', 1], ['van', 1.5], ['sport', 0.8]]));
      c.hasDriver = false; c.state = 'parked'; c.pos.set(x, 0, z); c.heading = Math.atan2(tx, tz) + (Math.random() < 0.2 ? Math.PI : 0);
      c.gy = VehGround.at(x, z); c.sync(); this.list.push(c);
      return c;
    }
    return null;
  },
  spawnLegal() {
    const p = Player.pos;
    this.frustum();
    let s = null;
    for (let k = 0; k < 6 && !s; k++) { const q = Roads.randomSpot(p.x, p.z, 70, 115, 20, NAVF); if (q && (k > 3 || !this.inView(q.x, q.z)) && !this.occupied(q.x, q.z, 8)) s = q; }
    if (!s) return null;
    const c = new Car('legal');
    const e = s.e, dir0 = s.dir;
    lanePt(e, dir0, s.s, e.oneway ? 0 : tLaneOff(e, 0), _lp);
    let h = Math.atan2(_lp[2], _lp[3]);
    if ((p.x - _lp[0]) * _lp[2] + (p.z - _lp[1]) * _lp[3] < 0 && !e.oneway) h = wrapA(h + Math.PI);
    c.state = 'legal'; c.pos.set(_lp[0], 0, _lp[1]); c.heading = h; c.speed = 16;
    c.vel.set(Math.sin(h) * 16, 0, Math.cos(h) * 16); c.navT = 0; c.path = null;
    c.gy = VehGround.at(c.pos.x, c.pos.z); c.sync(); this.list.push(c);
    return c;
  },
  legalCount() { let n = 0; for (const c of this.list) if (c.state === 'legal' && !c.removed) n++; return n; },
  update(dt) {
    Traffic.update();
    for (const c of this.list) if (!c.removed) c.update(dt);
    for (let k = this.list.length - 1; k >= 0; k--) if (this.list[k].removed) this.list.splice(k, 1);
    const p = this.center();
    // new game / respawn / teleport: bring the traffic along
    if (G.started !== this.wasStarted || dist2(p.x, p.z, this.lastP.x, this.lastP.z) > 120 * 120) { this.wasStarted = G.started; this.refill(p.x, p.z); this.streamT = 0.5; }
    this.lastP.set(p.x, 0, p.z);
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 0.5; this.stream(); }
    Plates.update();
  },
  stream() {
    const p = this.center(), B = W.bounds;
    this.frustum();
    let traffic = 0, parked = 0;
    // anything flung out of the map is gone for good
    for (const c of this.list) if (!c.removed && c !== Player.car && c !== Player.held && (c.pos.x < B.x0 - 60 || c.pos.x > B.x1 + 60 || c.pos.z < B.z0 - 60 || c.pos.z > B.z1 + 60)) c.remove();
    // cap the scrapyard: a rampage shouldn't pile up hundreds of burnt shells
    const wrecks = this.list.filter((c) => !c.removed && c.state === 'wreck');
    if (wrecks.length > 16) { wrecks.sort((a, b) => b.age - a.age); for (let k = 0; k < wrecks.length - 16; k++) { FX.smoke(wrecks[k].pos.x, 1, wrecks[k].pos.z, 2, 2, 0.3); wrecks[k].remove(); } }
    for (const c of this.list) {
      if (c.removed || c === Player.car || c.state === 'held' || c.state === 'thrown') continue;
      const d = dist2(c.pos.x, c.pos.z, p.x, p.z);
      if (c.state === 'traffic') {
        traffic++;
        // too far, or wedged for ages somewhere nobody is looking: reuse it elsewhere as a "new" car
        if ((d > 190 * 190 || (c.idleT > 25 && !this.inView(c.pos.x, c.pos.z))) && !this.recycle(c) && d > 190 * 190) c.remove();
      } else if (c.state === 'parked') { if (d > 200 * 200 && c.age > 15) c.remove(); else if (d < 170 * 170 && !c.k.bike) parked++; }
      else if (c.state === 'wreck' && ((d > 150 * 150 && c.age > 15) || c.age > 40)) c.remove();
      else if (c.state === 'legal' && (d > 220 * 220 || (G.heat < 1 && d > 80 * 80) || (c.idleT > 12 && !this.inView(c.pos.x, c.pos.z)))) c.remove();
    }
    const want = this.target();
    for (let k = 0; k < 3 && traffic < want; k++) if (this.spawnTraffic(p.x, p.z, 85, 165, false)) traffic++;
    if (traffic > want + 6) {
      // thin out (late night): drop the farthest invisible car
      let far = null, fd = 0;
      for (const c of this.list) if (c.state === 'traffic' && !c.removed) { const d = dist2(c.pos.x, c.pos.z, p.x, p.z); if (d > fd && !this.inView(c.pos.x, c.pos.z)) { fd = d; far = c; } }
      if (far) far.remove();
    }
    if (parked < (LOWQ ? 5 : 9)) this.spawnParked(p.x, p.z, 50, 150, false);
  },
  nearestDrivable(x, z, r) {
    let best = null, bd = r * r;
    for (const c of this.list) { if (!c.drivable()) continue; const d = dist2(x, z, c.pos.x, c.pos.z); if (d < bd) { bd = d; best = c; } }
    return best;
  },
  // what F gets you: the closest car, or a 共享单车 (a parked instance is turned into a real bike on the spot)
  enterable(x, z) {
    const c = this.nearestDrivable(x, z, 4.8), b = Bikes.nearest(x, z, 2.4);
    if (b && (!c || dist2(x, z, b.x, b.z) < dist2(x, z, c.pos.x, c.pos.z) * 0.8)) return Bikes.take(b);
    return c;
  },
  onEnter(c) { if (c && c.k.bike) Bikes.mounted(c); },
  onExit(c) { if (c && c.k.bike) Bikes.dismounted(c); },
  plateOf(c) { if (!c || !c.k || c.k.bike) return ''; if (!c.plate) c.newPlate(); return c.plate; },
  // 尾号: the last digit of the plate (a trailing letter counts as 0, like the real 限行 rule)
  tailOf(c) { const p = this.plateOf(c), ch = p.slice(-1); return /\d/.test(ch) ? +ch : 0; },
  rush() { return Traffic.rushK; },
  _dbg() { return TRF.dbg; },
  rushName() { return Traffic.rushName(); },
  stats() {
    const o = { total: 0, traffic: 0, parked: 0, legal: 0, wreck: 0, bikes: 0, waiting: 0 };
    for (const c of this.list) { if (c.removed) continue; o.total++; if (c.k.bike) o.bikes++; if (o[c.state] !== undefined) o[c.state]++; if (c.state === 'traffic' && c.waiting) o.waiting++; }
    return o;
  },
};
