/* ============================================================
   vehicles: traffic, parked cars, legal-department chasers,
   shared arcade driving physics
   ============================================================ */
const CAR_KINDS = {
  sedan: { len: 4.6, wid: 2.1, maxSpd: 34, accel: 20, brake: 42, maxRev: 11, steer: 2.3, grip: 7, colors: [0xd23c3c, 0x2f6fd6, 0xe8e8e8, 0x222428, 0x3aa35b, 0xf2c14e, 0x8b5cf6, 0x9aa3ad, 0xff7a3d] },
  taxi: { len: 4.6, wid: 2.1, maxSpd: 34, accel: 20, brake: 42, maxRev: 11, steer: 2.3, grip: 7, colors: [0xf5c518, 0x2fb36d] },
  van: { len: 5.4, wid: 2.3, maxSpd: 28, accel: 15, brake: 36, maxRev: 9, steer: 2.0, grip: 7.5, colors: [0xf0f0f0, 0x6b7280, 0x1e88e5] },
  sport: { len: 4.5, wid: 2.1, maxSpd: 48, accel: 32, brake: 50, maxRev: 12, steer: 2.6, grip: 6.5, colors: [0xff2d55, 0xffcc00, 0x00c2ff] },
  legal: { len: 4.8, wid: 2.15, maxSpd: 40, accel: 26, brake: 44, maxRev: 12, steer: 2.4, grip: 7.5, colors: [0x15171b] },
};
const TRUCK_PRM = { maxSpd: 50, accel: 30, brake: 52, maxRev: 14, steer: 2.1, grip: 6.5, boost: 1 };
const CAR_NAMES = { sedan: '码农小轿车', taxi: 'Token 出租', van: '外卖面包车', sport: '极客跑车', legal: '法务专车' };
const CAR_LIGHT_GEO = new Map();
function carLightsGeo(kind) {
  if (CAR_LIGHT_GEO.has(kind)) return CAR_LIGHT_GEO.get(kind);
  const k = CAR_KINDS[kind], L = k.len, Wd = k.wid, parts = [];
  for (const sx of [-1, 1]) {
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
  if (kind === 'van') {
    parts.push(box(0, 1.5, -0.3, Wd, 2.1, L - 0.8, color), box(0, 1.05, L / 2 - 0.6, Wd - 0.05, 1.2, 1.2, color), box(0, 1.95, L / 2 - 1.0, Wd * 0.94, 0.7, 0.34, glass));
  } else if (kind === 'sport') {
    parts.push(box(0, 0.62, 0, Wd, 0.6, L, color), box(0, 1.12, -0.3, Wd * 0.84, 0.46, L * 0.42, glass), box(0, 1.37, -0.3, Wd * 0.8, 0.06, L * 0.34, color), box(0, 1.05, -L / 2 + 0.25, Wd * 0.9, 0.08, 0.5, dark));
  } else {
    parts.push(box(0, 0.72, 0, Wd, 0.72, L, color), box(0, 1.3, -0.25, Wd * 0.88, 0.62, L * 0.52, glass), box(0, 1.63, -0.25, Wd * 0.86, 0.1, L * 0.46, color));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(sx * (Wd / 2 - 0.2), 0.42, sz * (L / 2 - 0.9), 0.44, 0.84, 0.84, dark));
  parts.push(box(0, 0.45, L / 2, Wd * 0.98, 0.25, 0.14, dark), box(0, 0.45, -L / 2, Wd * 0.98, 0.25, 0.14, dark));
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
function vehicleWorldCollide(v, rad, len) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  let px = 0, pz = 0, hitB = null, any = false;
  for (const off of [len * 0.28, -len * 0.28]) {
    _tmpP.x = v.pos.x + fx * off; _tmpP.z = v.pos.z + fz * off;
    const ox = _tmpP.x, oz = _tmpP.z;
    const h = collideCircle(_tmpP, rad);
    if (h) { px += _tmpP.x - ox; pz += _tmpP.z - oz; hitB = h.b || hitB; any = true; }
  }
  if (!any) return null;
  v.pos.x += px; v.pos.z += pz;
  const nl = hyp(px, pz) || 1, nx = px / nl, nz = pz / nl;
  const vn = v.vel.x * nx + v.vel.z * nz;
  if (vn < 0) { v.vel.x -= nx * vn * 1.3; v.vel.z -= nz * vn * 1.3; v.vel.x *= 0.82; v.vel.z *= 0.82; }
  return { impact: -vn, nx, nz, b: hitB };
}
// what a moving vehicle does to everything around it
function vehicleImpacts(v, self, rad, heavy) {
  const sp = hyp(v.vel.x, v.vel.z);
  for (const c of Cars.list) {
    if (c === self || c.removed || c.state === 'held' || c.state === 'thrown' || c.y > 2.5) continue;
    const rr = rad + c.radius * 0.75;
    const dx = c.pos.x - v.pos.x, dz = c.pos.z - v.pos.z, d2 = dx * dx + dz * dz;
    if (d2 > rr * rr) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, pen = rr - d;
    const rel = (v.vel.x - c.vel.x) * nx + (v.vel.z - c.vel.z) * nz;
    if (heavy) { c.pos.x += nx * pen; c.pos.z += nz * pen; }
    else { v.pos.x -= nx * pen * 0.5; v.pos.z -= nz * pen * 0.5; c.pos.x += nx * pen * 0.5; c.pos.z += nz * pen * 0.5; }
    if (rel > 6) {
      c.knock(v.vel.x * (heavy ? 1.2 : 0.7) + nx * 4, 3 + rel * (heavy ? 0.4 : 0.15), v.vel.z * (heavy ? 1.2 : 0.7) + nz * 4, rel * (heavy ? 3.2 : 1.3));
      if (heavy) { v.vel.x *= 0.92; v.vel.z *= 0.92; }
      else { v.vel.x *= 0.62; v.vel.z *= 0.62; if (self) self.damage(rel * 0.5); }
      Sfx.crash(rel); FX.sparks((v.pos.x + c.pos.x) / 2, 1.2, (v.pos.z + c.pos.z) / 2, 8);
      if (v === Player || self === Player.car) { Cam.shake(Math.min(1, rel / 22)); G.crime(0.06); }
    }
  }
  if (sp > 5) {
    for (const e of Enemies.list) {
      if (e.dead) continue;
      if (dist2(e.pos.x, e.pos.z, v.pos.x, v.pos.z) < (rad + e.r) * (rad + e.r) && e.y < 4) e.hit(sp * (heavy ? 4 : 2.2), v.vel.x * 0.7, v.vel.z * 0.7, 9, heavy ? 'ram' : 'car');
    }
    Peds.dodge(v.pos.x, v.pos.z, v.vel.x, v.vel.z, rad + 2);
    Props.knockAround(v.pos.x, v.pos.z, rad + 0.5, 0, 0, v.vel.x, v.vel.z);
  }
}

let CAR_ID = 0;
class Car {
  constructor(kind, color) {
    this.id = ++CAR_ID; this.kind = kind; this.k = CAR_KINDS[kind];
    this.color = color ?? pick(this.k.colors);
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(carGeo(kind, this.color), MAT.vc); this.body.castShadow = true;
    this.lights = new THREE.Mesh(carLightsGeo(kind), MAT.carLights);
    this.beamQ = new THREE.Mesh(BEAM_GEO, MAT.headBeam); this.beamQ.renderOrder = 2;
    this.group.add(this.body, this.lights, this.beamQ);
    this.name = CAR_NAMES[kind];
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
    this.y = 0; this.rx = 0; this.rz = 0; this.wx = 0; this.wy = 0; this.wz = 0;
    this.hp = kind === 'legal' ? 130 : 100; this.state = 'traffic';
    this.fireT = 0; this.exploded = false; this.burnt = false; this.age = 0; this.settleT = 0;
    this.radius = this.k.len * 0.45; this.cruise = rand(12, 17);
    this.blockedT = 0; this.ghostT = 0; this.honkT = 0; this.throwCd = rand(1.5, 3); this.ramCd = 0; this.stuckT = 0; this.revT = 0;
    this.tr = null; this.nav = null; this.removed = false; this.hasDriver = true; this.flashT = 0;
  }
  setLane(s) {
    this.state = 'traffic'; this.tr = { ni: s.ni, nj: s.nj, d: s.d, s: s.s, turn: null };
    this.pos.set(s.x, 0, s.z); this.heading = Math.atan2(DIRS[s.d][0], DIRS[s.d][1]);
    this.speed = this.cruise * 0.6; this.y = 0; this.rx = this.rz = 0; this.hasDriver = true; this.age = 0;
    this.sync();
  }
  drivable() { return !this.removed && this.hp > 0 && !this.burnt && (this.state === 'traffic' || this.state === 'parked' || this.state === 'legal') && this.y < 0.5 && Math.abs(Math.cos(this.rx) * Math.cos(this.rz)) > 0.5; }
  damage(d) {
    if (this.exploded) return;
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
    const s = clamp(hyp(vx, vz) / 12, 0.4, 2.2);
    this.wx = rand(-5, 5) * s; this.wy = rand(-4, 4) * s; this.wz = rand(-5, 5) * s;
    this.damage(dmg);
  }
  ejectDriver(stolen) {
    if (!this.hasDriver) return;
    this.hasDriver = false;
    if (this.kind === 'legal') return;
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    const p = Peds.spawnAt(this.pos.x + lx * 2.2, this.pos.z + lz * 2.2);
    if (p) { p.panic(this.pos.x, this.pos.z, 5); Bubble.say(p, stolen ? pick(['我的车！！', '我刚提的车！', '抢车啦！', '车贷还没还完！']) : pick(['吓死我了', '救命！', '保险能赔吗？']), 2.2, 'ped'); }
  }
  explode(noDmg) {
    if (this.exploded) return;
    this.exploded = true; this.burnt = true; this.hp = 0; this.fireT = 0;
    this.body.material = MAT.burnt; this.lights.visible = false; this.beamQ.visible = false;
    if (this.lr) { this.lr.visible = this.lb.visible = false; }
    RPG.gainXP(10); G.addMoney(1500);
    const wasPlayer = Player.car === this;
    if (wasPlayer) Player.bailOut(true);
    this.state = 'ragdoll'; this.settleT = 0; this.vel.y = 9; this.wx = rand(-3, 3); this.wz = rand(-3, 3);
    FX.boom(this.pos.x, 1.4 + this.y, this.pos.z, 1.25, !noDmg);
    Sfx.boom(false);
    if (this.kind === 'legal') { FX.confetti(this.pos.x, 2, this.pos.z, 26); Floaters.add(this.pos.x, 4, this.pos.z, '律师函退回！', 'fl-bonus'); }
    G.stats.cars++;
    this.age = 0;
  }
  remove() { if (this.removed) return; this.removed = true; scene.remove(this.group); disposeOwn(this.group); if (Player.held === this) Player.held = null; }
  sync() {
    this.group.position.set(this.pos.x, this.y + (this.state === 'traffic' ? 0 : groundH(this.pos.x, this.pos.z)), this.pos.z);
    this.group.rotation.set(this.rx, this.heading, this.rz, 'YXZ');
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
      case 'wreck': if (Math.random() < dt * 2 && this.age < 25) FX.smoke(this.pos.x, 1.5, this.pos.z, 1, 2.5, 0.18); break;
      default: break;
    }
    if (this.fireT > 0 && !this.exploded) {
      this.fireT -= dt;
      if (Math.random() < dt * 30) FX.fire(this.pos.x + Math.sin(this.heading) * 1.4, 1.4 + this.y, this.pos.z + Math.cos(this.heading) * 1.4, 1);
      if (this.fireT <= 0) this.explode();
    }
    if (this.lr && !this.burnt) { this.flashT += dt; const on = (this.flashT * 6) % 2 < 1; this.lr.visible = on; this.lb.visible = !on; }
    if (this.state !== 'player' && this.state !== 'held') this.sync();
  }
  trafficStep(dt) {
    const t = this.tr;
    let want = this.cruise;
    if (this.ghostT > 0) this.ghostT -= dt;
    else {
      const ob = obstacleAhead(this);
      if (ob.d < 14) want = Math.min(want, Math.max(0, (ob.d - 5.5) * 2.2));
      if (this.speed < 0.6 && ob.d < 14) {
        this.blockedT += dt;
        if (ob.who === Player && this.blockedT > 1.2 && this.honkT <= 0) {
          this.honkT = rand(3, 5); Sfx.horn(); Bubble.say(this, pick(['滴滴——劳驾让让！', '您倒是往边儿上靠靠啊！', '起开起开！', '会不会走道儿啊？']), 1.6, 'ped');
        }
        if (ob.who !== Player && this.blockedT > 4.5) { this.ghostT = 1.6; this.blockedT = 0; }
      } else this.blockedT = 0;
    }
    if (this.honkT > 0) this.honkT -= dt;
    // panic when the mech is near: floor it
    if (Player.isMech() && dist2(this.pos.x, this.pos.z, Player.pos.x, Player.pos.z) < 900) want = Math.max(want, 22);
    this.speed = damp(this.speed, want, want < this.speed ? 7 : 1.6, dt);
    const adv = this.speed * dt;
    if (!t.turn) {
      t.s += adv;
      if (t.s >= SEG_LEN) {
        const bi = t.ni + DIRS[t.d][0], bj = t.nj + DIRS[t.d][1], opts = [];
        for (const [d2, w] of [[t.d, 5], [(t.d + 1) % 4, 2.5], [(t.d + 3) % 4, 2.5]]) if (edgeOpen(bi, bj, d2)) opts.push([d2, w]);
        const d2 = opts.length ? weighted(opts) : (t.d + 2) % 4;
        const [sx, sz] = segStart(t.ni, t.nj, t.d);
        const p0 = [sx + DIRS[t.d][0] * SEG_LEN, sz + DIRS[t.d][1] * SEG_LEN];
        const p2 = segStart(bi, bj, d2);
        let p1;
        if (d2 === t.d) p1 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
        else { const r1 = rightOf(t.d), r2 = rightOf(d2); p1 = [roadC(bi) + (r1[0] + r2[0]) * LANE, roadC(bj) + (r1[1] + r2[1]) * LANE]; }
        const len = Math.max(4, (hyp(p0[0] - p1[0], p0[1] - p1[1]) + hyp(p1[0] - p2[0], p1[1] - p2[1]) + hyp(p0[0] - p2[0], p0[1] - p2[1])) / 2);
        t.turn = { p0, p1, p2, len, u: (t.s - SEG_LEN) / len, d2, bi, bj };
      }
    } else {
      t.turn.u += adv / t.turn.len;
      if (t.turn.u >= 1) { const over = (t.turn.u - 1) * t.turn.len; t.ni = t.turn.bi; t.nj = t.turn.bj; t.d = t.turn.d2; t.s = over; t.turn = null; }
    }
    if (!t.turn) {
      const [sx, sz] = segStart(t.ni, t.nj, t.d);
      this.pos.x = sx + DIRS[t.d][0] * t.s; this.pos.z = sz + DIRS[t.d][1] * t.s;
      this.heading = Math.atan2(DIRS[t.d][0], DIRS[t.d][1]);
    } else {
      const { p0, p1, p2, u } = t.turn, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      this.pos.x = a * p0[0] + b * p1[0] + c * p2[0]; this.pos.z = a * p0[1] + b * p1[1] + c * p2[1];
      const tx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]), tz = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
      if (tx * tx + tz * tz > 1e-6) this.heading = Math.atan2(tx, tz);
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
    if (this.y <= 0) {
      this.y = 0;
      if (this.vel.y < -5) { this.vel.y *= -0.3; this.wx *= 0.5; this.wz *= 0.5; Sfx.thud(); FX.dust(this.pos.x, this.pos.z, 3, 2.5); FX.sparks(this.pos.x, 0.5, this.pos.z, 4); }
      else this.vel.y = 0;
      this.vel.x *= Math.exp(-3 * dt); this.vel.z *= Math.exp(-3 * dt); this.wy *= Math.exp(-4 * dt);
    }
    const h = collideCircle(this.pos, 1.6);
    if (h && this.y < 6) {
      const vn = this.vel.x * h.nx + this.vel.z * h.nz;
      if (vn < 0) { this.vel.x -= h.nx * vn * 1.5; this.vel.z -= h.nz * vn * 1.5; if (vn < -8) { this.damage(-vn); Sfx.crash(-vn); FX.sparks(this.pos.x, this.y + 1, this.pos.z, 6); if (h.b && h.b.hq) h.b.hq.damage(-vn * 1.5, this.pos.x, this.pos.z, 'car'); } }
    }
    if (this.y === 0 && hyp(this.vel.x, this.vel.z) < 1.5) {
      this.settleT += dt;
      const upX = Math.round(this.rx / Math.PI) * Math.PI, upZ = Math.round(this.rz / Math.PI) * Math.PI;
      this.rx = damp(this.rx, upX, 8, dt); this.rz = damp(this.rz, upZ, 8, dt);
      this.wx *= 0.8; this.wz *= 0.8;
      if (this.settleT > 0.7) {
        this.rx = upX; this.rz = upZ;
        const upside = Math.cos(this.rx) * Math.cos(this.rz) < 0;
        if (upside && !this.burnt) this.damage(999);
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
    if (!hit) for (const s of solidsNear(this.pos.x, this.pos.z, 3)) {
      if (this.y < s.h && this.pos.x > s.x0 - 1.8 && this.pos.x < s.x1 + 1.8 && this.pos.z > s.z0 - 1.8 && this.pos.z < s.z1 + 1.8) { hit = true; break; }
    }
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
  legalStep(dt) {
    const p = Player.pos, dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = hyp(dx, dz);
    let tx, tz;
    if (d < 30) { tx = p.x; tz = p.z; this.nav = null; }
    else {
      if (!this.nav || dist2(this.pos.x, this.pos.z, this.nav[0], this.nav[1]) < 40) this.nav = nextNavNode(this.pos.x, this.pos.z, p.x, p.z);
      tx = this.nav[0]; tz = this.nav[1];
    }
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z), diff = angDiff(this.heading, want);
    let steer = clamp(diff * 2.4, -1, 1), thr = Math.abs(diff) > 1.3 && this.speed > 12 ? -0.5 : 1;
    if (d < 7 && !Player.isMech()) thr = 0.25;
    if (this.revT > 0) { this.revT -= dt; thr = -1; steer = -steer; }
    driveCar(this, thr, steer, false, dt, this.k);
    const h = vehicleWorldCollide(this, 1.1, this.k.len);
    if (h && h.impact > 9) { this.damage(h.impact * 0.25); FX.sparks(this.pos.x, 1, this.pos.z, 4); }
    if (Math.abs(this.speed) < 2 && this.revT <= 0) { this.stuckT += dt; if (this.stuckT > 1.3) { this.revT = 0.9; this.stuckT = 0; this.nav = null; } } else this.stuckT = 0;
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
function nextNavNode(x, z, px, pz) {
  let ni = clamp(Math.round((x + HALF) / PITCH), 0, NB), nj = clamp(Math.round((z + HALF) / PITCH), 0, NB);
  if (!nodeLive(ni, nj)) {
    // the nearest crossing was swallowed by a landmark (palace, Temple of Heaven...): head for the closest live one
    let bd = Infinity, bi = ni, bj = nj;
    for (let i = Math.max(0, ni - 2); i <= Math.min(NB, ni + 2); i++) for (let j = Math.max(0, nj - 2); j <= Math.min(NB, nj + 2); j++) {
      if (!nodeLive(i, j)) continue;
      const dd = dist2(x, z, roadC(i), roadC(j)); if (dd < bd) { bd = dd; bi = i; bj = j; }
    }
    ni = bi; nj = bj;
  }
  const nx = roadC(ni), nz = roadC(nj);
  if (dist2(x, z, nx, nz) > 60) return [nx, nz];
  let best = [nx, nz], bd = Infinity;
  for (let d = 0; d < 4; d++) {
    if (!edgeOpen(ni, nj, d)) continue;
    const ci = ni + DIRS[d][0], cj = nj + DIRS[d][1];
    const dd = dist2(roadC(ci), roadC(cj), px, pz);
    if (dd < bd) { bd = dd; best = [roadC(ci), roadC(cj)]; }
  }
  return best;
}
function obstacleAhead(c) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  let best = 99, who = null;
  const test = (x, z, rad, w) => {
    const dx = x - c.pos.x, dz = z - c.pos.z, f = dx * fx + dz * fz;
    if (f <= 0 || f > 15) return;
    if (Math.abs(dx * fz - dz * fx) < 1.5 + rad && f - rad < best) { best = f - rad; who = w; }
  };
  for (const o of Cars.list) if (o !== c && !o.removed && o.state !== 'held' && o.state !== 'thrown') test(o.pos.x, o.pos.z, 1.0, o);
  if (Player.mode !== 'dead') test(Player.pos.x, Player.pos.z, Player.radius(), Player);
  return { d: best, who };
}

const Cars = {
  list: [], streamT: 0,
  target() { return LOWQ ? 18 : 30; },
  init() {
    for (let k = 0; k < this.target(); k++) this.spawnTraffic(0, 0, 0, 340);
    // a few parked cars around the start so stealing is easy
    for (const [x, z, h] of [[-7.5, -24, 0], [-24, -7.5, Math.PI / 2], [7.5, -30, Math.PI]]) {
      const c = new Car(pick(['sedan', 'sport', 'taxi'])); c.hasDriver = false; c.state = 'parked'; c.pos.set(x, 0, z); c.heading = h; c.sync(); this.list.push(c);
    }
  },
  occupied(s) { for (const c of this.list) if (!c.removed && dist2(c.pos.x, c.pos.z, s.x, s.z) < 100) return true; return false; },
  spawnTraffic(fx, fz, minD, maxD) {
    const s = randomRoadSpot(fx, fz, minD, maxD);
    if (!s || this.occupied(s)) return null;
    const c = new Car(weighted([['sedan', 6], ['taxi', 2], ['van', 1.4], ['sport', 0.9]]));
    c.setLane(s); this.list.push(c);
    return c;
  },
  spawnLegal() {
    const p = Player.pos, s = randomRoadSpot(p.x, p.z, 70, 110);
    if (!s || this.occupied(s)) return null;
    const c = new Car('legal');
    c.state = 'legal'; c.pos.set(s.x, 0, s.z);
    c.heading = Math.atan2(p.x - s.x, p.z - s.z); c.vel.set(Math.sin(c.heading) * 18, 0, Math.cos(c.heading) * 18);
    c.sync(); this.list.push(c);
    return c;
  },
  legalCount() { let n = 0; for (const c of this.list) if (c.state === 'legal' && !c.removed) n++; return n; },
  update(dt) {
    for (const c of this.list) if (!c.removed) c.update(dt);
    for (let k = this.list.length - 1; k >= 0; k--) if (this.list[k].removed) this.list.splice(k, 1);
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 0.5; this.stream(); }
  },
  stream() {
    const p = Player.pos;
    let traffic = 0;
    // cap the scrapyard: a rampage shouldn't pile up hundreds of burnt shells
    // anything that got flung out of the map is gone for good
    for (const c of this.list) if (!c.removed && c !== Player.car && c !== Player.held && (Math.abs(c.pos.x) > BOUND + 60 || c.pos.z < -BOUND - 60 || c.pos.z > SHORE + 120)) c.remove();
    const wrecks = this.list.filter((c) => !c.removed && c.state === 'wreck');
    if (wrecks.length > 16) { wrecks.sort((a, b) => b.age - a.age); for (let k = 0; k < wrecks.length - 16; k++) { FX.smoke(wrecks[k].pos.x, 1, wrecks[k].pos.z, 2, 2, 0.3); wrecks[k].remove(); } }
    for (const c of this.list) {
      if (c === Player.car || c.state === 'held' || c.state === 'thrown') continue;
      const d = dist2(c.pos.x, c.pos.z, p.x, p.z);
      if (c.state === 'traffic') {
        traffic++;
        if (d > 175 * 175) { const s = randomRoadSpot(p.x, p.z, 80, 150); if (s && !this.occupied(s)) c.setLane(s); }
      } else if ((c.state === 'wreck' || c.state === 'parked') && d > 130 * 130 && c.age > 15) c.remove();
      else if (c.state === 'wreck' && c.age > 40) c.remove();
      else if (c.state === 'legal' && (d > 220 * 220 || (G.heat < 1 && d > 80 * 80))) c.remove();
    }
    if (traffic < this.target()) this.spawnTraffic(p.x, p.z, 80, 160);
  },
  nearestDrivable(x, z, r) {
    let best = null, bd = r * r;
    for (const c of this.list) { if (!c.drivable()) continue; const d = dist2(x, z, c.pos.x, c.pos.z); if (d < bd) { bd = d; best = c; } }
    return best;
  },
};
