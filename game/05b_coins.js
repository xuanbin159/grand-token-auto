/* ============================================================
   爆金币: hit people and money flies out — 铜钱 coins and the
   occasional 金元宝 ingot. They bounce, then get sucked into you.
   ============================================================ */
function tongqianTex() {
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#b07a14'; g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(50, 46, 6, 64, 64, 64); grd.addColorStop(0, '#ffe9a0'); grd.addColorStop(0.5, '#e5b33a'); grd.addColorStop(1, '#a36d10');
  g.beginPath(); g.arc(64, 64, 63, 0, TAU); g.fillStyle = grd; g.fill();
  g.lineWidth = 5; g.strokeStyle = '#8a5a08'; g.beginPath(); g.arc(64, 64, 54, 0, TAU); g.stroke();
  g.fillStyle = '#3a2a10'; g.fillRect(50, 50, 28, 28); g.strokeStyle = '#8a5a08'; g.lineWidth = 4; g.strokeRect(46, 46, 36, 36);
  g.fillStyle = '#7a4e08'; g.font = `900 22px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['T', 64, 28], ['K', 64, 101], ['通', 28, 65], ['宝', 100, 65]].forEach(([t, x, y]) => g.fillText(t, x, y));
  return tex(c);
}
function ingotGeo() {
  return mergeParts([
    gpart(new THREE.SphereGeometry(1, 10, 6), 0xf2c233, 0, 0, 0, 0, 0, 0, 1.25, 0.42, 0.7),
    gpart(new THREE.SphereGeometry(0.62, 8, 5), 0xffd84a, 0, 0.32, 0, 0, 0, 0, 1, 0.8, 1),
    gpart(new THREE.SphereGeometry(0.5, 6, 4), 0xf2c233, -0.95, 0.28, 0, 0, 0, 0.5, 0.8, 0.6, 0.8), gpart(new THREE.SphereGeometry(0.5, 6, 4), 0xf2c233, 0.95, 0.28, 0, 0, 0, -0.5, 0.8, 0.6, 0.8),
  ]);
}
const Coins = {
  MAX: 320, items: [], free: [], mesh: null, ingots: null, ingotItems: [], combo: 0, comboT: 0,
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _e: new THREE.Euler(), _p: new V3(), _s: new V3(), ZERO: new THREE.Matrix4().makeScale(0, 0, 0),
  init() {
    const mat = new THREE.MeshLambertMaterial({ map: tongqianTex(), emissive: 0x6a4400, emissiveIntensity: 0.45 });
    this.mesh = new THREE.InstancedMesh(coinGeometry(), mat, this.MAX);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.castShadow = true;
    for (let i = 0; i < this.MAX; i++) { this.mesh.setMatrixAt(i, this.ZERO); this.items.push({ i, alive: false }); this.free.push(this.MAX - 1 - i); }
    scene.add(this.mesh);
    const im = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x7a5200, emissiveIntensity: 0.55 });
    this.ingots = new THREE.InstancedMesh(ingotGeo(), im, 40); this.ingots.frustumCulled = false; this.ingots.castShadow = true;
    for (let i = 0; i < 40; i++) { this.ingots.setMatrixAt(i, this.ZERO); this.ingotItems.push({ i, alive: false, ingot: true }); }
    scene.add(this.ingots);
  },
  spawn(x, y, z, val, ingot) {
    let t;
    if (ingot) { t = this.ingotItems.find((q) => !q.alive); if (!t) return null; }
    else { if (!this.free.length) return null; t = this.items[this.free.pop()]; }
    const a = rand(TAU), sp = rand(2.5, ingot ? 5 : 8);
    Object.assign(t, { alive: true, x, y, z, vx: Math.cos(a) * sp, vy: rand(8, 13), vz: Math.sin(a) * sp, val: Math.round(val), age: 0, spin: rand(TAU), ws: rand(6, 14), rest: false });
    return t;
  },
  // n coins worth ~val each, with a small chance of a 金元宝 (×15)
  burst(x, y, z, n, val, o = {}) {
    if (Interiors.cur && !o.inside) return;
    const rate = RPG.m.coinRate || 1;
    const count = Math.max(1, Math.round(n * Math.sqrt(rate)));
    for (let k = 0; k < count; k++) this.spawn(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), val * Math.sqrt(rate) * rand(0.7, 1.3), false);
    if (Math.random() < (RPG.m.ingot || 0.03) * (o.big ? 3 : 1)) { this.spawn(x, y + 0.5, z, val * 15 * rate, true); Floaters.add(x, y + 3, z, '金元宝！', 'fl-bonus'); }
    Sfx.coinBurst();
  },
  collect(t) {
    t.alive = false;
    if (t.ingot) { this.ingots.setMatrixAt(t.i, this.ZERO); Sfx.ingot(); FX.sparkle(t.x, t.y + 0.5, t.z, 18); }
    else { this.mesh.setMatrixAt(t.i, this.ZERO); this.free.push(t.i); this.combo++; this.comboT = 0.8; Sfx.cash(this.combo); }
    G.addMoney(t.val); G.stats.coins = (G.stats.coins || 0) + t.val;
    Floaters.add(t.x, 2.6, t.z, '+' + fmtMoney(t.val), t.ingot ? 'fl-bonus' : 'fl-cash');
  },
  clear() { for (const t of this.items) if (t.alive) { t.alive = false; this.mesh.setMatrixAt(t.i, this.ZERO); this.free.push(t.i); } for (const t of this.ingotItems) if (t.alive) { t.alive = false; this.ingots.setMatrixAt(t.i, this.ZERO); } },
  update(dt) {
    const P = Player, px = P.pos.x, pz = P.pos.z, mr = (P.isMech() ? 11 : 4.2) * (RPG.m.magnet || 1), pr = P.isMech() ? 3.6 : 1.4;
    const alive = P.mode !== 'dead';
    let dirtyC = false, dirtyI = false;
    for (const list of [this.items, this.ingotItems]) for (const t of list) {
      if (!t.alive) continue;
      t.age += dt; t.spin += dt * t.ws;
      if (!t.rest) {
        t.vy -= 30 * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
        const gh = Interiors.cur ? 0 : groundH(t.x, t.z), floor = gh + (t.ingot ? 0.35 : 0.25);
        if (t.y < floor) { t.y = floor; if (t.vy < -3) { t.vy *= -0.42; t.vx *= 0.6; t.vz *= 0.6; } else { t.vy = 0; t.vx *= 0.8; t.vz *= 0.8; if (Math.abs(t.vx) + Math.abs(t.vz) < 0.3) t.rest = true; } }
      }
      if (alive && t.age > 0.35) {
        const dx = px - t.x, dz = pz - t.z, d = Math.hypot(dx, dz);
        if (d < mr) { const k = Math.min(d, (10 + (mr - d) * 6) * dt); t.x += (dx / (d || 1)) * k; t.z += (dz / (d || 1)) * k; t.rest = false; t.vy = Math.max(t.vy, 0); t.y = Math.max(t.y, (Interiors.cur ? 0 : groundH(t.x, t.z)) + 0.6); }
        if (d < pr) { this.collect(t); t.ingot ? dirtyI = true : dirtyC = true; continue; }
      }
      if (t.age > 45) { t.alive = false; if (t.ingot) this.ingots.setMatrixAt(t.i, this.ZERO); else { this.mesh.setMatrixAt(t.i, this.ZERO); this.free.push(t.i); } continue; }
      const sc = t.ingot ? 0.62 : 0.5;
      this._q.setFromEuler(this._e.set(t.rest && !t.ingot ? Math.PI / 2 * 0.9 : 0, t.spin, 0));
      this._m.compose(this._p.set(t.x, t.y + (t.rest ? Math.sin(t.age * 4) * 0.05 : 0), t.z), this._q, this._s.set(sc, sc, sc));
      if (t.ingot) { this.ingots.setMatrixAt(t.i, this._m); dirtyI = true; } else { this.mesh.setMatrixAt(t.i, this._m); dirtyC = true; }
    }
    if (dirtyC) this.mesh.instanceMatrix.needsUpdate = true;
    if (dirtyI) this.ingots.instanceMatrix.needsUpdate = true;
    let top = 0; for (let k = this.MAX - 1; k >= 0; k--) if (this.items[k].alive) { top = k + 1; break; }
    this.mesh.count = top;
    let ti = 0; for (let k = 39; k >= 0; k--) if (this.ingotItems[k].alive) { ti = k + 1; break; }
    this.ingots.count = ti;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
  },
};
