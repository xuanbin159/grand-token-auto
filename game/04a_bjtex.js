/* ============================================================
   老北京 materials: PBR texture sets (assets/runtime/tex, CC0 Poly Haven / ambientCG: 青砖, 宫墙红, 红漆,
   汉白玉, 琉璃瓦 …) + canvas textures (花格窗, 彩画, 斗拱, 飞椽, 老字号铺面), and textured geometry for
   Chinese roofs: concave 举折 profile, swept-up corners (飞檐), ridges with 正吻, eave fascia + soffit
   (硬山 gable, 庑殿 hip, 攒尖 pyramid, round). UVs are in metres; a material's texture repeat = 1 / tile.
   ============================================================ */
const BJ = { mats: {}, oldShopMats: [] };

/* ---------------- PBR sets: queued at load (Assets), turned into materials / texture arrays in buildWorld ---------------- */
// desktop: albedo + normal + ARM (AO, roughness, metal) at ≤1024; phones: the 512 albedo only (Lambert, no normal maps).
// Desktop boots on the 512 copies (tex/lo, a few MB) and swaps the full-res maps in as they stream (same texture objects,
// new pixels: the materials and programs stay as they are)
const PBR = {
  HI: !LOWQ, S: LOWQ ? 512 : 1024, _t: new Map(), _c: new Map(), _arr: [],
  // the full-res stream, first-view sets first (ground and hutong layers, then the palace / roofs)
  ORDER: ['asphalt', 'sidewalk', 'hutong_paving', 'brick_grey', 'roof_grey', 'courtyard_brick', 'concrete', 'grass', 'paving_stone', 'granite_tile', 'tactile', 'dirt',
    'lacquer_red', 'plaster_palace_red', 'roof_yellow', 'marble_white', 'concrete_tile_facade', 'glass_curtain', 'roof_green', 'roof_blue', 'asphalt_wear'],
  // metres per texture repeat (assets/runtime/manifest.json)
  TILE: { brick_grey: 1.9, plaster_palace_red: 2, lacquer_red: 1, marble_white: 2, paving_stone: 3.5, courtyard_brick: 2, hutong_paving: 2, granite_tile: 2,
    asphalt: 3, asphalt_wear: 30, sidewalk: 2, tactile: 1.2, grass: 2, dirt: 1.4, concrete: 3, concrete_tile_facade: 3, facade_office_night: 12, glass_curtain: 6,
    facade_brick_windows: 13, roof_grey: 2.9, roof_yellow: 2.9, roof_green: 2.9, roof_blue: 2.9, bark_hackberry: 1, bark_willow: 1 },
  SETS: ['brick_grey', 'plaster_palace_red', 'lacquer_red', 'marble_white', 'paving_stone', 'courtyard_brick', 'hutong_paving', 'granite_tile', 'asphalt', 'asphalt_wear',
    'sidewalk', 'tactile', 'grass', 'dirt', 'concrete', 'concrete_tile_facade', 'glass_curtain', 'roof_grey', 'roof_yellow', 'roof_green', 'roof_blue'],
  // the roofs share one normal map; the curtain wall's lit offices come from the night facade set
  id(k, m) { return (m === 'normal' && k.startsWith('roof_') ? 'roof_tiles' : k) + '/' + m; },
  path(k, m, hi) { const d = m === 'emissive' ? 'facade_office_night/emissive' : this.id(k, m); return 'tex/' + (hi ? '' : 'lo/') + d + '.webp'; },
  key(k, m, hi) { return 'pbr/' + this.id(k, m) + (hi ? '/hi' : ''); },
  queue() {
    const want = (k, m, n) => {
      Assets.need(this.key(k, m), this.path(k, m), { tier: 'boot' });
      if (!this.HI) return;
      // full res: albedo / normal first, the ARM maps after (their arrays stay at 512 anyway)
      Assets.need(this.key(k, m, 1), this.path(k, m, 1), { tier: 'stream', prio: 10 + n + (m === 'arm' ? 30 : m === 'emissive' ? 20 : 0), max: this.S });
      Assets.on(this.key(k, m, 1), () => Jobs.add(() => this.upgrade(k, m)));
    };
    const seen = new Set();
    for (const k of this.SETS) for (const m of this.HI ? ['albedo', 'normal', 'arm'] : ['albedo']) { const id = this.id(k, m); if (seen.has(id)) continue; seen.add(id); want(k, m, Math.max(0, this.ORDER.indexOf(k))); }
    want('glass_curtain', 'emissive', 18);
  },
  // the best image loaded so far: full res (desktop) or the 512 copy. Image textures from Assets are pre-flipped bitmaps
  // (userData.flipped) where the browser can, else <img>; canvas code draws them the right way up via flip()
  src(k, m) { const hi = this.HI ? Assets.get(this.key(k, m, 1)) : null, t = hi && hi.image && hi.image.width ? hi : Assets.get(this.key(k, m)); return t && t.image && t.image.width ? t : null; },
  img(k, m) { const t = this.src(k, m); return t ? t.image : null; },
  flipped(k, m) { const t = this.src(k, m); return !!(t && t.userData.flipped); },
  has(k) { return !!this.img(k, 'albedo'); },
  // one GPU texture per map; clones share it and carry their own repeat
  base(k, m) {
    const id = this.id(k, m); if (this._t.has(id)) return this._t.get(id);
    const s = this.src(k, m); let t = null;
    if (s) {
      const im = s.image;
      if (im.width > this.S) { const c = mkCanvas(this.S, this.S); c.getContext('2d').drawImage(im, 0, 0, this.S, this.S); t = new THREE.CanvasTexture(c); t.flipY = !s.userData.flipped; }
      else { t = new THREE.Texture(); t.source = s.source; t.flipY = s.flipY; t.needsUpdate = true; }
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, MAX_ANISO); t.colorSpace = THREE.NoColorSpace;
      t.userData.w = Math.min(im.width, this.S);
    }
    this._t.set(id, t); this._c.set(id, []); return t;
  },
  tex(k, m, rx, ry = rx) { const b = this.base(k, m); if (!b) return null; const t = b.clone(); t.repeat.set(rx, ry); this._c.get(this.id(k, m)).push(t); return t; },
  // a full-res map arrived: new pixels into the texture (and its clones) made from the 512 copy, then the arrays that use it
  upgrade(k, m) {
    const hi = Assets.get(this.key(k, m, 1)), id = this.id(k, m), b = this._t.get(id);
    if (hi && b && hi.image && hi.image.width > (b.userData.w || 0)) {
      for (const t of [b, ...this._c.get(id)]) { t.dispose(); t.source = hi.source; t.flipY = hi.flipY; t.needsUpdate = true; }
      b.userData.w = hi.image.width;
      if (renderer) renderer.initTexture(b); // upload now (inside this job's time slice), not in the middle of a frame
    }
    for (const a of this._arr) if (!a.busy && a.w < a.S && a.m === m && a.layers.some((x) => typeof x === 'string' && this.id(x, m) === id)) this.regrow(a);
    // the 512 copy is done with (img() prefers the full map now): free its pixels
    const lo = Assets.get(this.key(k, m)); if (hi && hi.image && lo && lo !== hi && lo.image && lo.image.close && (!b || b.source !== lo.source)) lo.image.close();
  },
  // a material from a set: tint (sRGB hex, decoded with the albedo), rough / metal multipliers, normal strength, AO, glaze (clearcoat)
  mat(k, o = {}) {
    const tile = o.tile || this.TILE[k] || 2, rx = 1 / tile, ry = o.tileY ? 1 / o.tileY : rx, a = this.tex(k, 'albedo', rx, ry);
    if (!a) return null;
    const P = { map: a, color: o.color !== undefined ? o.color : 0xffffff };
    if (!this.HI) return new THREE.MeshLambertMaterial(Object.assign(P, o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei || 0.3 } : {}));
    Object.assign(P, { roughness: o.rough !== undefined ? o.rough : 1, metalness: o.metal || 0 });
    const m = o.glaze ? new THREE.MeshPhysicalMaterial(Object.assign(P, { clearcoat: o.glaze, clearcoatRoughness: o.ccr !== undefined ? o.ccr : 0.22 })) : new THREE.MeshStandardMaterial(P);
    const n = this.tex(k, 'normal', rx, ry), r = this.tex(k, 'arm', rx, ry);
    if (n) { m.normalMap = n; m.normalScale.set(o.ns || 1, o.ns || 1); }
    if (r) { m.roughnessMap = r; m.aoMap = r; m.aoMapIntensity = o.ao !== undefined ? o.ao : 1; if (o.metal) m.metalnessMap = r; }
    if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei || 0.3; }
    return m;
  },
  // glass curtain wall (HQ / CBD towers): mirror panes and mullions from the set's ARM (metal 1, rough 0 on the glass), the lit
  // offices of facade_office_night as the emissive. rx / ry = repeats per uv unit (buildingGeo: 16 m → 1.6 m × 3.2 m panes).
  // Registered with Render.reflMats (the low tier, without reflections, turns the metal down so the panes don't go black)
  glass(o = {}) {
    const rx = o.rx || 1, ry = o.ry || 0.5, a = this.tex('glass_curtain', 'albedo', rx, ry); if (!a) return null;
    const e = this.tex('glass_curtain', 'emissive', rx, ry), P = { map: a, color: o.color !== undefined ? o.color : 0xffffff, emissive: o.emissive !== undefined ? o.emissive : 0xffc27a, emissiveIntensity: o.ei || 0.4 };
    if (e) P.emissiveMap = e;
    if (!this.HI) return new THREE.MeshLambertMaterial(P);
    const m = new THREE.MeshStandardMaterial(Object.assign(P, { metalness: 1, roughness: 1, envMapIntensity: 1.15 })), r = this.tex('glass_curtain', 'arm', rx, ry), n = this.tex('glass_curtain', 'normal', rx, ry);
    if (r) { m.roughnessMap = r; m.metalnessMap = r; } else m.roughness = 0.08;
    if (n) { m.normalMap = n; m.normalScale.set(0.6, 0.6); }
    m.userData.gtaMetal = 1; Render.reflMats.push(m);
    if (Render.Q && !Render.Q.env) m.metalness = 0.15;
    return m;
  },
  // a WebGL2 texture array (one layer per set / canvas, all S×S, rows flipped like an image texture so normal maps keep +v up)
  // missing layers get a neutral fill: grey albedo, flat normal, AO 1 / rough 0.8. Built at the size of what has loaded (the
  // 512 copies at boot) and grown to S once the full-res layers are in (regrow)
  array(layers, m, S = this.S) {
    let w = 0; for (const k of layers) { const im = typeof k === 'string' ? this.img(k, m) : k; if (im) w = Math.max(w, im.width); }
    const s0 = Math.min(S, w || S), n = layers.length, data = new Uint8Array(s0 * s0 * 4 * n), c = mkCanvas(s0, s0), g = c.getContext('2d', { willReadFrequently: true }), avg = [];
    layers.forEach((k, i) => { const [px, a] = this.layer(g, k, m, s0); data.set(px, i * s0 * s0 * 4); avg.push(a); });
    const t = new THREE.DataArrayTexture(data, s0, s0, n); t.userData.avg = avg;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Math.min(8, MAX_ANISO); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    if (this.HI && s0 < S) this._arr.push({ t, layers, m, S, w: s0 });
    return t;
  },
  // one layer: pixels + mean colour (to use a set as detail on authored colours)
  layer(g, k, m, S) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy';
    const str = typeof k === 'string', src = str ? this.img(k, m) : k;
    if (src) { if (!(str && this.flipped(k, m))) g.setTransform(1, 0, 0, -1, 0, S); g.drawImage(src, 0, 0, S, S); }
    else { g.fillStyle = m === 'normal' ? '#8080ff' : m === 'arm' ? '#ffcc00' : '#8a8a86'; g.fillRect(0, 0, S, S); }
    const px = g.getImageData(0, 0, S, S).data;
    let r = 0, gg = 0, b = 0, c = 0; for (let j = 0; j < px.length; j += 4 * 61) { r += px[j]; gg += px[j + 1]; b += px[j + 2]; c++; }
    return [px, new THREE.Vector3(r / c / 255, gg / c / 255, b / c / 255)];
  },
  // an array at full size once every full-res layer it uses has landed (or failed): one layer per job, then new pixels in place
  regrow(a) {
    if (a.layers.some((k) => typeof k === 'string' && Assets.pending(this.key(k, a.m, 1)))) return;
    a.busy = true;
    const S = a.S, n = a.layers.length, data = new Uint8Array(S * S * 4 * n), c = mkCanvas(S, S), g = c.getContext('2d', { willReadFrequently: true }), avg = a.t.userData.avg;
    a.layers.forEach((k, i) => Jobs.add(() => { const [px, v] = this.layer(g, k, a.m, S); data.set(px, i * S * S * 4); avg[i].copy(v); }));
    Jobs.add(() => { const t = a.t; t.dispose(); t.source = new (THREE.TextureSource || THREE.Source)({ data, width: S, height: S, depth: n }); t.needsUpdate = true; a.w = S; a.busy = false; if (renderer) renderer.initTexture(t); });
  },
};
PBR.queue();

/* ---------------- canvas textures (fallbacks + things no photo set has) ---------------- */
function brickTex(base = '#8d9095', mortar = '#6f7276') {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = mortar; g.fillRect(0, 0, S, S);
  const bh = 16, bw = 44;
  for (let r = 0; r < S / bh; r++) {
    const off = (r % 2) * (bw / 2);
    for (let x = -bw; x < S + bw; x += bw) { g.fillStyle = shade(base, randi(-16, 10)); g.fillRect(x + off + 1, r * bh + 1, bw - 2, bh - 2); }
  }
  speckle(g, S, S, 1800, 0.07);
  const t = tex(c, true); t.repeat.set(0.5, 0.5); return t;
}
function pavingTex() { // 胡同 grey brick paving, herring-ish running bond
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#6d6c69'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < 8; r++) for (let q = -1; q < 5; q++) {
    const x = q * 32 + (r % 2) * 16, y = r * 16;
    g.fillStyle = shade('#8a8883', randi(-12, 10)); g.fillRect(x + 1, y + 1, 30, 14);
  }
  speckle(g, S, S, 700, 0.07);
  return tex(c, true);
}
function stonePaveTex(base = '#b9b4aa') { // palace / square: big slabs
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = shade(base, -28); g.fillRect(0, 0, S, S);
  for (let r = 0; r < 4; r++) for (let q = -1; q < 3; q++) {
    const x = q * 64 + (r % 2) * 32, y = r * 32;
    g.fillStyle = shade(base, randi(-10, 8)); g.fillRect(x + 1.5, y + 1.5, 61, 29);
  }
  speckle(g, S, S, 500, 0.05);
  return tex(c, true);
}
function roofTileTex() { // grey-scale 筒瓦 rows; the material colour tints it (grey / yellow / green / blue)
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#8e8e8e'; g.fillRect(0, 0, S, S);
  const cw = 16;
  for (let x = 0; x < S; x += cw) {
    const grd = g.createLinearGradient(x, 0, x + cw, 0);
    grd.addColorStop(0, '#4e4e4e'); grd.addColorStop(0.28, '#b4b4b4'); grd.addColorStop(0.5, '#e6e6e6'); grd.addColorStop(0.72, '#a6a6a6'); grd.addColorStop(1, '#4a4a4a');
    g.fillStyle = grd; g.fillRect(x, 0, cw, S);
  }
  g.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < S; y += 16) g.fillRect(0, y, S, 2);
  speckle(g, S, S, 400, 0.07);
  const t = tex(c, true); t.repeat.set(0.5, 0.6); return t;
}
function plasterTex() { // light noise, tinted red for 宫墙 / white for 白塔
  const S = 128, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.008, 0.024)})`; g.beginPath(); g.arc(rand(S), rand(S), rand(6, 22), 0, TAU); g.fill(); }
  speckle(g, S, S, 900, 0.03);
  const t = tex(c, true); t.repeat.set(1 / 3, 1 / 3); return t;
}
// 花格窗 house front: red columns, lattice windows over a brick sill wall. 4 bays, two of them lit at night
function latticeTex() {
  const W = 512, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let b = 0; b < 4; b++) {
    const x = b * 128, lit = b === 1 || b === 2;
    g.fillStyle = '#8e9196'; g.fillRect(x, 84, 128, 44);
    g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 88; y < H; y += 8) g.fillRect(x, y, 128, 1);
    g.fillStyle = '#9b2d24'; g.fillRect(x, 0, 12, H); g.fillRect(x + 116, 0, 12, H);
    g.fillStyle = '#6b3a24'; g.fillRect(x + 12, 6, 104, 78);
    g.fillStyle = lit ? '#efdcb0' : '#d8cfb8'; g.fillRect(x + 18, 12, 92, 66);
    g.strokeStyle = '#5a2e1c'; g.lineWidth = 2;
    for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(x + 18 + k * 11.5, 12); g.lineTo(x + 18 + k * 11.5, 78); g.stroke(); }
    for (let k = 0; k <= 6; k++) { g.beginPath(); g.moveTo(x + 18, 12 + k * 11); g.lineTo(x + 110, 12 + k * 11); g.stroke(); }
    g.fillStyle = '#2e6b5a'; g.fillRect(x + 12, 0, 104, 6); // 绿色额枋
    if (lit) { ge.fillStyle = '#ffc070'; ge.fillRect(x + 18, 12, 92, 66); ge.fillStyle = 'rgba(0,0,0,.4)'; for (let k = 0; k <= 8; k++) ge.fillRect(x + 17 + k * 11.5, 12, 2, 66); }
  }
  const m = new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.4 });
  return m;
}
// 格扇门 for the palace halls: red frames, gilded 菱花 lattice panels over a solid skirt, one bay = 256 px (≈ 3.6 m)
function hallDoorTex() {
  const W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = '#8a1e16'; g.fillRect(0, 0, W, H);
  for (let d = 0; d < 8; d++) { // 4 leaves per bay
    const x = d * 64 + 4, w = 56;
    g.fillStyle = '#9e2a1e'; g.fillRect(x, 6, w, H - 12);
    g.fillStyle = '#5a1810'; g.fillRect(x + 5, 14, w - 10, 150);
    g.strokeStyle = '#d9ae4a'; g.lineWidth = 1.4; // 菱花: diagonal lattice
    g.save(); g.beginPath(); g.rect(x + 6, 15, w - 12, 148); g.clip();
    for (let k = -160; k < 200; k += 9) { g.beginPath(); g.moveTo(x + k, 15); g.lineTo(x + k + 148, 163); g.stroke(); g.beginPath(); g.moveTo(x + k + 148, 15); g.lineTo(x + k, 163); g.stroke(); }
    g.restore();
    g.fillStyle = '#7d1c14'; g.fillRect(x + 5, 172, w - 10, 20); g.fillRect(x + 5, 198, w - 10, 44);
    g.fillStyle = '#c99532'; g.fillRect(x + 5, 168, w - 10, 3); g.fillRect(x + 5, 194, w - 10, 3); g.fillRect(x + w / 2 - 6, 212, 12, 8);
    ge.fillStyle = '#3a2208'; ge.fillRect(x + 6, 15, w - 12, 148);
  }
  g.fillStyle = 'rgba(0,0,0,.25)'; for (let d = 0; d <= 8; d++) g.fillRect(d * 64, 0, 4, H);
  const m = new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.2 });
  return m;
}
// 旋子彩画 for the architraves: 箍头 · 藻头 with 旋花 rosettes · the long 枋心 panel; one bay per 512 px. The top 16 px are plain
// (other faces of the beam sample there)
function caihuaTex() {
  const W = 1024, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  const GOLD = '#d8ad45', BLUE = '#1f4f8f', GREEN = '#2c7a5a', DBLUE = '#173a6e';
  g.fillStyle = GREEN; g.fillRect(0, 0, W, 16);
  for (let u = 0; u < 2; u++) {
    const x0 = u * 512, y0 = 16, h = H - 16;
    g.fillStyle = BLUE; g.fillRect(x0, y0, 512, h);
    g.fillStyle = GREEN; g.fillRect(x0, y0 + h / 2, 512, h / 2);
    // 箍头: gold-edged stripes at both ends
    for (const bx of [x0, x0 + 472]) { g.fillStyle = GREEN; g.fillRect(bx, y0, 40, h); g.fillStyle = BLUE; g.fillRect(bx + 12, y0, 16, h); g.fillStyle = GOLD; g.fillRect(bx + 10, y0, 2, h); g.fillRect(bx + 28, y0, 2, h); }
    // 藻头: a 旋花 rosette in a pointed frame on each side
    for (const [rx, dir] of [[x0 + 96, 1], [x0 + 416, -1]]) {
      g.fillStyle = GREEN; g.beginPath(); g.moveTo(rx - 56 * dir, y0); g.lineTo(rx + 58 * dir, y0); g.lineTo(rx + 58 * dir + 22 * dir, y0 + h / 2); g.lineTo(rx + 58 * dir, y0 + h); g.lineTo(rx - 56 * dir, y0 + h); g.closePath(); g.fill();
      g.strokeStyle = GOLD; g.lineWidth = 3; g.stroke();
      for (const [r, col] of [[40, '#f2f0e6'], [34, BLUE], [26, '#f2f0e6'], [20, GREEN], [11, '#f2f0e6'], [6, GOLD]]) { g.fillStyle = col; g.beginPath(); g.arc(rx, y0 + h / 2, r, 0, TAU); g.fill(); }
      g.strokeStyle = BLUE; g.lineWidth = 2; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.beginPath(); g.moveTo(rx + Math.cos(a) * 12, y0 + h / 2 + Math.sin(a) * 12); g.quadraticCurveTo(rx + Math.cos(a + 0.4) * 30, y0 + h / 2 + Math.sin(a + 0.4) * 30, rx + Math.cos(a) * 38, y0 + h / 2 + Math.sin(a) * 38); g.stroke(); }
    }
    // 枋心: the long dark panel with pointed ends and a gold border
    const fx0 = x0 + 176, fx1 = x0 + 336, fy0 = y0 + 14, fy1 = y0 + h - 14;
    g.fillStyle = DBLUE; g.beginPath(); g.moveTo(fx0, fy0); g.lineTo(fx1, fy0); g.lineTo(fx1 + 24, (fy0 + fy1) / 2); g.lineTo(fx1, fy1); g.lineTo(fx0, fy1); g.lineTo(fx0 - 24, (fy0 + fy1) / 2); g.closePath(); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(216,173,69,.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(fx0 + 8, (fy0 + fy1) / 2); g.bezierCurveTo(fx0 + 50, fy0 + 10, fx1 - 50, fy1 - 10, fx1 - 8, (fy0 + fy1) / 2); g.stroke();
    g.fillStyle = GOLD; g.fillRect(x0, y0, 512, 3); g.fillRect(x0, H - 3, 512, 3);
  }
  speckle(g, W, H, 1500, 0.05);
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// 斗拱: bracket clusters (blue-green arms, white edges) over the red 栱眼壁, one cluster per 128 px (≈ 1.3 m); shaded for depth
function dougongTex() {
  const W = 512, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#6e1c14'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) {
    const cx = k * 128 + 64;
    for (let t = 0; t < 4; t++) { // stacked arms widening upward, each with a block (斗) under it
      const y = H - 18 - t * 26, hw = 16 + t * 14, col = t % 2 ? '#2d7a5c' : '#24588f';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx - hw, y + 6, hw * 2, 18);
      g.fillStyle = col; g.fillRect(cx - hw, y - 6, hw * 2, 14);
      g.fillStyle = '#f0ede2'; g.fillRect(cx - hw, y - 6, hw * 2, 2); g.fillRect(cx - hw, y + 7, hw * 2, 1);
      g.fillStyle = col === '#2d7a5c' ? '#24588f' : '#2d7a5c'; g.fillRect(cx - 9, y + 8, 18, 12);
      g.fillStyle = '#f0ede2'; g.fillRect(cx - 9, y + 8, 18, 2);
    }
  }
  g.fillStyle = '#24588f'; g.fillRect(0, 0, W, 12); g.fillStyle = '#f0ede2'; g.fillRect(0, 11, W, 2);
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// eave atlas: top half = the fascia (瓦当 tile ends over green 飞椽 rafter heads with gold 万字), bottom half = the soffit
// (blue-green rafters running up under the roof, red between); u tiles every 1.4 m
function eaveTex() {
  const W = 256, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  // soffit (v 0..0.5 → canvas rows 128..256)
  g.fillStyle = '#5a1a14'; g.fillRect(0, 128, W, 128);
  for (let k = 0; k < 4; k++) { const x = k * 64; const grd = g.createLinearGradient(x + 10, 0, x + 46, 0); grd.addColorStop(0, '#1d3f5f'); grd.addColorStop(0.5, '#3f7fa0'); grd.addColorStop(1, '#1d3f5f'); g.fillStyle = grd; g.fillRect(x + 10, 128, 36, 128); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 128, W, 10);
  // fascia (v 0.5..1 → rows 0..128): tile ends on top, rafter heads below
  g.fillStyle = '#23352c'; g.fillRect(0, 0, W, 128);
  for (let k = 0; k < 8; k++) { const x = k * 32 + 16; g.fillStyle = '#4c4f52'; g.beginPath(); g.arc(x, 22, 13, 0, TAU); g.fill(); g.fillStyle = '#6a6d70'; g.beginPath(); g.arc(x, 22, 8, 0, TAU); g.fill(); }
  for (let k = 0; k < 4; k++) {
    const x = k * 64 + 12;
    g.fillStyle = '#2d7a5c'; g.fillRect(x, 50, 40, 40); g.fillStyle = '#e0b64c'; g.fillRect(x + 16, 54, 8, 32); g.fillRect(x + 4, 66, 32, 8);
    g.fillStyle = '#24588f'; g.beginPath(); g.arc(x + 20, 110, 15, 0, TAU); g.fill(); g.fillStyle = '#f0ede2'; g.beginPath(); g.arc(x + 20, 110, 6, 0, TAU); g.fill();
  }
  g.fillStyle = '#b8872c'; g.fillRect(0, 40, W, 3);
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
const OLD_SHOPS = [
  '张二元茶庄', '稻香村饽饽铺', '六必居酱园', '都一处烧麦', '馄饨侯', '庆丰包子铺', '爆肚冯', '年糕钱', '老北京炸酱面', '卤煮火烧',
  '吴裕泰茶社', '月盛斋酱肉', '桂馨斋', '豆汁儿焦圈', '瑞蚨祥绸布', '胡同理发', '冰糖葫芦', '修自行车', '烟袋斜街', '北冰漾汽水',
  '老舍茶馆', '砂锅居', '褡裢火烧', '天兴居炒肝', '宫廷糕点', '京味儿涮肉', '驴打滚', '王致和腐乳', '五道口书店', '二八自行车',
];
// two-storey 老字号 shopfront: lattice upstairs, black-and-gold plaque, open shop + red lanterns downstairs
function oldShopTex(names) {
  const W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  const e = mkCanvas(W, H), ge = e.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  for (let k = 0; k < 2; k++) {
    const x = k * 256, name = names[k];
    g.fillStyle = '#8e9196'; g.fillRect(x, 0, 256, H);
    // upstairs
    g.fillStyle = '#9b2d24'; for (const cx of [0, 124, 244]) g.fillRect(x + cx, 0, 12, 118);
    for (const wx of [12, 136]) {
      g.fillStyle = '#6b3a24'; g.fillRect(x + wx, 14, 112, 70);
      g.fillStyle = '#e2d4b2'; g.fillRect(x + wx + 6, 20, 100, 58);
      g.strokeStyle = '#5a2e1c'; g.lineWidth = 2;
      for (let q = 0; q <= 8; q++) { g.beginPath(); g.moveTo(x + wx + 6 + q * 12.5, 20); g.lineTo(x + wx + 6 + q * 12.5, 78); g.stroke(); }
      for (let q = 0; q <= 5; q++) { g.beginPath(); g.moveTo(x + wx + 6, 20 + q * 11.6); g.lineTo(x + wx + 106, 20 + q * 11.6); g.stroke(); }
      if (Math.random() < 0.6) { ge.fillStyle = '#ffbd6a'; ge.fillRect(x + wx + 6, 20, 100, 58); }
    }
    g.fillStyle = '#2e6b5a'; g.fillRect(x, 0, 256, 10);
    g.fillStyle = '#4a2a1a'; g.fillRect(x, 86, 256, 10); // balcony rail
    for (let q = 0; q < 16; q++) g.fillRect(x + 6 + q * 16, 96, 4, 20);
    g.fillStyle = '#4a2a1a'; g.fillRect(x, 114, 256, 6);
    // plaque 牌匾
    rrect(g, x + 38, 124, 180, 40, 6); g.fillStyle = '#16120e'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#c9a23e'; g.stroke();
    g.fillStyle = '#e8c35a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 164, 28, 900); g.fillText(name, x + 128, 145);
    ge.fillStyle = '#6a5010'; rrect(ge, x + 40, 126, 176, 36, 6); ge.fill(); ge.fillStyle = '#ffd86a'; ge.textAlign = 'center'; ge.textBaseline = 'middle'; ge.font = g.font; ge.fillText(name, x + 128, 145);
    // shop floor
    g.fillStyle = '#9b2d24'; g.fillRect(x, 166, 14, 90); g.fillRect(x + 242, 166, 14, 90);
    const grd = g.createLinearGradient(0, 170, 0, 256); grd.addColorStop(0, '#f2cf8e'); grd.addColorStop(1, '#7a5230');
    g.fillStyle = grd; g.fillRect(x + 14, 170, 228, 86);
    for (let q = 0; q < 3; q++) { g.fillStyle = 'rgba(80,45,20,.55)'; g.fillRect(x + 22, 186 + q * 20, 212, 4); for (let p = 0; p < 7; p++) { g.fillStyle = pick(['#c0392b', '#e67e22', '#27ae60', '#f1c40f', '#8e44ad', '#ecf0f1']); g.fillRect(x + 26 + p * 30, 174 + q * 20, 18, 11); } }
    g.fillStyle = '#5a3a24'; g.fillRect(x + 14, 232, 228, 24);
    ge.fillStyle = '#ffb04a'; ge.fillRect(x + 14, 170, 228, 60);
    // lanterns
    for (const lx of [40, 216]) {
      g.fillStyle = '#d7263d'; g.beginPath(); g.ellipse(x + lx, 186, 13, 16, 0, 0, TAU); g.fill(); g.fillStyle = '#f6c343'; g.fillRect(x + lx - 6, 168, 12, 4); g.fillRect(x + lx - 2, 202, 4, 8);
      ge.fillStyle = '#ff5030'; ge.beginPath(); ge.ellipse(x + lx, 186, 13, 16, 0, 0, TAU); ge.fill();
    }
  }
  return new THREE.MeshLambertMaterial({ map: tex(c, true), emissive: 0xffffff, emissiveMap: tex(e, true), emissiveIntensity: 0.3 });
}
function hutongSignTex(name) { // blue street plate
  const c = mkCanvas(256, 64), g = c.getContext('2d');
  rrect(g, 2, 2, 252, 60, 6); g.fillStyle = '#1d3f8f'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#f5f5f5'; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, name, 230, 34, 900); g.fillText(name, 128, 34);
  return tex(c);
}

// the roof colours (ridge ornaments, far LOD tints) per tile accumulator
const ROOF_COL = { roof: 0x5a5e63, yellow: 0xd9a21c, green: 0x2f7a4e, blue: 0x2c5c8c };
// weathering over the photo sets (a painted look instead of one clean tile repeated over a whole palace): big soft world-space
// blotches, rain streaks down the walls, dirt streaks down the roof slopes and a darker band along the eaves
const BJ_WX = [
  'float bjH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float bjN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(bjH(i), bjH(i + vec2(1.0, 0.0)), f.x), mix(bjH(i + vec2(0.0, 1.0)), bjH(i + 1.0), f.x), f.y); }',
].join('\n') + '\n';
// kind: 'wall' | 'roof' | 'stone' | 'marble'; tile = the material's metres per repeat (roof uv → metres)
function bjWeather(m, kind, tile = 1) {
  const k = kind === 'roof' ? 2 : kind === 'wall' ? 1 : kind === 'marble' ? 3 : 0, tu = { value: tile }; // (tile: a uniform, so one program per kind)
  m.onBeforeCompile = (sh) => {
    Render.cutoutPatch(sh); sh.uniforms.uBjTile = tu;
    sh.fragmentShader = 'uniform float uBjTile;\n' + BJ_WX + sh.fragmentShader.replace('#include <map_fragment>', ['#include <map_fragment>',
      '{ vec3 bw = vGtaW; float bm = bjN(bw.xz * 0.085 + bw.y * 0.03) * 0.6 + bjN(bw.xz * 0.29 + bw.y * 0.2 + 7.3) * 0.4;',
      '  diffuseColor.rgb *= mix(' + (k === 0 ? '0.9, 1.05' : k === 3 ? '0.82, 1.03' : '0.8, 1.07') + ', bm);',
      // walls / marble: the along-the-wall coordinate (dominant horizontal axis of the face normal) and how wall-like the face is
      k === 1 || k === 3 ? '  vec3 bn = cross(dFdx(bw), dFdy(bw)); float bu = abs(bn.x) > abs(bn.z) ? bw.z : bw.x, bv = 1.0 - smoothstep(0.45, 0.8, abs(vGtaUp));' : '',
      // rain streaks: narrow runs hanging from sill / eave lines (a line every 2.8–4.4 m per column), each 1.5–3 m long and fading
      // downward; only some 0.25 m columns carry one (the old full-height noise bands read as curtain folds)
      k === 1 ? ['  { float bq = bu * 4.0, bc = floor(bq), h1 = bjH(vec2(bc, 3.7)), h2 = bjH(vec2(bc, 8.1)), h3 = bjH(vec2(bc, 1.3)), bp = 2.8 + 1.6 * h2;',
        '    float bd = bp * (1.0 - fract((bw.y + h1 * bp) / bp)), bl = 1.5 + 1.5 * h3;',
        '    float bs = step(0.58, h3 * 0.5 + h1 * 0.5) * smoothstep(0.42, 0.1, abs(fract(bq) - 0.5 + (h2 - 0.5) * 0.2)) * smoothstep(0.0, 0.25, bd) * (1.0 - smoothstep(0.0, bl, bd));',
        '    diffuseColor.rgb *= 1.0 - 0.13 * bv * bs * (0.55 + 0.45 * bjN(vec2(bc, bw.y * 1.9))); }'].join('\n') : '',
      // 汉白玉: slab joints (running bond on the paving, courses on the faces), a darker lip at each slab edge, per-slab tint
      k === 3 ? ['  { vec2 bz = bv > 0.5 ? vec2(1.1, 0.55) : vec2(1.3, 0.85), bq = bv > 0.5 ? vec2(bu, bw.y) : bw.xz, bg = bq / bz;',
        '    bg.x += 0.5 * mod(floor(bg.y), 2.0); vec2 bf = (0.5 - abs(fract(bg) - 0.5)) * bz; float jd = min(bf.x, bf.y);',
        '    diffuseColor.rgb *= (1.0 - 0.3 * (1.0 - smoothstep(0.004, 0.018, jd))) * mix(0.9, 1.0, smoothstep(0.0, 0.1, jd)) * (0.95 + 0.07 * bjH(floor(bg))); }'].join('\n') : '',
      k === 2 ? '#ifdef USE_MAP\n  vec2 rm = vMapUv * uBjTile; float rs = bjN(vec2(rm.x * 2.2, rm.y * 0.35)) * bjN(vec2(rm.x * 0.45, 2.9));' +
        ' diffuseColor.rgb *= (1.0 - 0.3 * smoothstep(0.2, 0.6, rs)) * mix(0.72, 1.0, smoothstep(0.0, 1.1, rm.y));\n#endif' : '',
      '}'].join('\n'));
  };
  m.customProgramCacheKey = () => 'bjwx' + k;
  return m;
}
function bjMaterials() {
  const M = BJ.mats, P = PBR, cut = (m) => Render.cutout(m);
  TEX.brick = brickTex(); TEX.paving = pavingTex(); TEX.stone = stonePaveTex(); TEX.marblePave = stonePaveTex('#e6e2d8');
  TEX.tile = TEX.tile || tileTex(); TEX.roofTile = roofTileTex(); TEX.plaster = plasterTex();
  TEX.caihua = caihuaTex(); TEX.dougong = dougongTex(); TEX.eave = eaveTex();
  // PBR where the photo sets shipped (weathered in the shader), the old canvas look otherwise
  const pm = (k, o, fb, kind = 'stone') => { const m = P.mat(k, o); return m ? bjWeather(m, kind, o.tile || P.TILE[k]) : cut(fb()); };
  M.brick = pm('brick_grey', { color: 0xe4e6ea }, () => new THREE.MeshLambertMaterial({ map: TEX.brick }), 'wall');
  M.greyBrick = pm('brick_grey', { color: 0xfafbfd, tile: 2.2 }, () => new THREE.MeshLambertMaterial({ map: brickTex('#9a9ca0', '#7d7f83') }), 'wall');
  M.roofGrey = pm('roof_grey', { color: 0xd4d6da, tile: 3.2, ns: 1.3 }, () => new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x70757c }), 'roof');
  // glazed tiles: a touch less saturated than the photo (they read as plastic in full sun), clear-coated
  M.roofYellow = pm('roof_yellow', { color: 0xecd8b2, tile: 3.2, ns: 1.3, glaze: 0.7, rough: 0.8 }, () => new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0xe8a623, emissive: 0x3a2600, emissiveIntensity: 0.25 }), 'roof');
  M.roofGreen = pm('roof_green', { color: 0xecf6ee, tile: 3.2, ns: 1.3, glaze: 0.6, rough: 0.8 }, () => new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x3f9a62 }), 'roof');
  M.roofBlue = pm('roof_blue', { color: 0xf0f6ff, tile: 3.2, ns: 1.3, glaze: 0.6, rough: 0.8 }, () => new THREE.MeshLambertMaterial({ map: TEX.roofTile, color: 0x3150b8 }), 'roof');
  M.redWall = pm('plaster_palace_red', { color: new THREE.Color(1.12, 1.0, 0.96), tile: 2.6 }, () => new THREE.MeshLambertMaterial({ map: TEX.plaster, color: 0xa33a2c }), 'wall');
  M.white = pm('marble_white', { color: 0xf0ede6, tile: 4, ns: 0.5 }, () => new THREE.MeshLambertMaterial({ map: TEX.plaster, color: 0xf1eee6 }), 'wall');
  // (a notch darker than white: at noon the full-white slabs blew out to a flat blank)
  M.marble = pm('marble_white', { color: 0xdcd8d0, tile: 1.8 }, () => new THREE.MeshLambertMaterial({ map: TEX.marblePave, color: 0xe4e0d8 }), 'marble');
  M.lacquer = pm('lacquer_red', { color: 0xf2d0c8, tile: 1.6, rough: 0.7 }, () => new THREE.MeshLambertMaterial({ color: 0x9b2d24 }));
  const std = (o) => { if (P.HI) return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, o)); const { roughness, ...l } = o; void roughness; return new THREE.MeshLambertMaterial(l); };
  M.caihua = cut(std({ map: TEX.caihua }));
  M.dougong = cut(std({ map: TEX.dougong, roughness: 0.85 }));
  M.eave = cut(std({ map: TEX.eave, roughness: 0.85, side: THREE.DoubleSide }));
  M.lattice = cut(latticeTex()); W.extraFacades.push(M.lattice);
  M.doors = cut(hallDoorTex()); W.extraFacades.push(M.doors);
  for (let k = 0; k < 6; k++) {
    const names = [OLD_SHOPS[(k * 2) % OLD_SHOPS.length], OLD_SHOPS[(k * 2 + 1) % OLD_SHOPS.length]];
    const m = cut(oldShopTex(names)); W.extraFacades.push(m); BJ.oldShopMats.push(m);
  }
  M.lantern = new THREE.MeshBasicMaterial({ vertexColors: true }); W.neonMats.push(M.lantern);
  M.gold = cut(new THREE.MeshLambertMaterial({ color: 0xe6b422, emissive: 0x4a3200, emissiveIntensity: 0.4 }));
  MAT.paving = new THREE.MeshLambertMaterial({ map: TEX.paving });
  MAT.stonePave = new THREE.MeshLambertMaterial({ map: TEX.stone });
}

/* ---- textured geometry accumulator (flat normals, uv in metres) ---- */
class GeoAcc {
  constructor() { this.p = []; this.n = []; this.u = []; this.A = null; }
  tri(a, b, c, ua, ub, uc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  }
  quad(a, b, c, d, ua, ub, uc, ud) { this.tri(a, b, c, ua, ub, uc); this.tri(a, c, d, ua, uc, ud); }
  get empty() { return this.p.length === 0; }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    return g;
  }
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const len3 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
// local frame: lx along the ridge, lz across; rot = 0 (ridge ∥ x) or 1 (ridge ∥ z)
function roofFrame(cx, cz, rot) { return rot ? (lx, y, lz) => [cx + lz, y, cz - lx] : (lx, y, lz) => [cx + lx, y, cz + lz]; }

/* ---------------- Chinese roofs ---------------- */
// 举折 profile: the share of the rise reached at v (0 eave → 1 ridge): flat at the eave, steep near the ridge
const roofG = (v) => v * (0.4 + 0.6 * v);
// 飞檐 sweep along an eave: 0 in the middle, 1 at the corners
const roofSweep = (t) => { const s = Math.abs(2 * t - 1); return s * s * s; };
// one slope: eave curve E(t) → ridge R(t) (a line or a point), n × k quads, uv in metres (u along the eave, v up the slope).
// Returns the vertex grid (rows eave → ridge)
function roofFace(acc, E, R, n, k) {
  const grid = [];
  for (let j = 0; j <= k; j++) {
    const v = j / k, g = roofG(v), row = [];
    for (let i = 0; i <= n; i++) { const t = i / n, e = E(t), r = R(t); row.push([e[0] + (r[0] - e[0]) * v, e[1] + (r[1] - e[1]) * g, e[2] + (r[2] - e[2]) * v]); }
    grid.push(row);
  }
  const u = [0]; for (let i = 1; i <= n; i++) u.push(u[i - 1] + len3(grid[0][i - 1], grid[0][i]));
  const vv = grid.map(() => []); for (let i = 0; i <= n; i++) { vv[0][i] = 0; for (let j = 1; j <= k; j++) vv[j][i] = vv[j - 1][i] + len3(grid[j - 1][i], grid[j][i]); }
  // each quad wound to face up (away from the building)
  for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) {
    const p00 = grid[j][i], p10 = grid[j][i + 1], p11 = grid[j + 1][i + 1], p01 = grid[j + 1][i];
    const q00 = [u[i], vv[j][i]], q10 = [u[i + 1], vv[j][i + 1]], q11 = [u[i + 1], vv[j + 1][i + 1]], q01 = [u[i], vv[j + 1][i]];
    const e1x = p10[0] - p00[0], e1z = p10[2] - p00[2], e2x = p01[0] - p00[0], e2z = p01[2] - p00[2];
    if (e1z * e2x - e1x * e2z < 0) acc.quad(p00, p01, p11, p10, q00, q01, q11, q10); else acc.quad(p00, p10, p11, p01, q00, q10, q11, q01);
  }
  return grid;
}
// a raised tiled ridge (a small tent of two quads) along a polyline of points
function ridgeAlong(acc, pts, w = 0.3, hh = 0.22) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, sx = -dz / L * w / 2, sz = dx / L * w / 2;
    const at = [a[0], a[1] + hh, a[2]], bt = [b[0], b[1] + hh, b[2]], al = [a[0] + sx, a[1], a[2] + sz], bl = [b[0] + sx, b[1], b[2] + sz], ar = [a[0] - sx, a[1], a[2] - sz], br = [b[0] - sx, b[1], b[2] - sz];
    const l = len3(a, b);
    acc.quad(al, bl, bt, at, [0, 0], [l, 0], [l, 0.3], [0, 0.3]); acc.quad(br, ar, at, bt, [l, 0], [0, 0], [0, 0.3], [l, 0.3]);
  }
}
// eave fascia (瓦当 + rafter heads, facing out) and soffit (painted rafters, facing down) under an eave curve
// E(t): the eave points, I(t): the matching points on the wall line (under the roof)
function eaveBand(A, E, I, n, fh) {
  const acc = A && A.eave; if (!acc) return;
  let u = 0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, e0 = E(t0), e1 = E(t1), i0 = I(t0), i1 = I(t1), d = len3(e0, e1) / 1.4;
    const b0 = [e0[0], e0[1] - fh, e0[2]], b1 = [e1[0], e1[1] - fh, e1[2]];
    // fascia: outward = away from the inner line
    const ox = e0[0] - i0[0], oz = e0[2] - i0[2], fx = e1[0] - e0[0], fz = e1[2] - e0[2], out = fx * oz - fz * ox > 0;
    if (out) acc.quad(b0, b1, e1, e0, [u, 0.52], [u + d, 0.52], [u + d, 0.98], [u, 0.98]); else acc.quad(b1, b0, e0, e1, [u + d, 0.52], [u, 0.52], [u, 0.98], [u + d, 0.98]);
    // soffit: from the fascia's foot in to the wall line
    if (out) acc.quad(i0, i1, b1, b0, [u, 0.02], [u + d, 0.02], [u + d, 0.46], [u, 0.46]); else acc.quad(i1, i0, b0, b1, [u + d, 0.02], [u, 0.02], [u, 0.46], [u + d, 0.46]);
    u += d;
  }
}
// 正脊 with 正吻 (the curled ridge-end beasts) between the ridge ends ±r (local frame F, ridge ∥ lx)
function mainRidge(acc, F, r, yR, hr, wr, beasts = true) {
  boxLocal(acc, F, -r - 0.2, yR - 0.1, r + 0.2, yR + hr, -wr / 2, wr / 2);
  if (!beasts) return;
  for (const sx of [-1, 1]) { // a tall block at each end, curled inward at the top
    const cx = sx * (r + 0.2), h = hr * 2.4 + 0.4, w = Math.max(0.35, wr * 1.1);
    boxLocal(acc, F, cx - sx * w * 0.5, yR - 0.1, cx + sx * w * 0.5, yR + h, -w * 0.45, w * 0.45);
    boxLocal(acc, F, cx - sx * w * 1.3, yR + h * 0.62, cx - sx * w * 0.45, yR + h * 0.86, -w * 0.3, w * 0.3);
  }
}
// an axis-aligned box in a roof's local frame (x0 may exceed x1: sorted here)
function boxLocal(acc, F, x0, y0, x1, y1, z0, z1) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  const c = (x, y, z) => F(x, y, z), dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  acc.quad(c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1), [0, 0], [dx, 0], [dx, dy], [0, dy]);
  acc.quad(c(x1, y0, z0), c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0), [0, 0], [dx, 0], [dx, dy], [0, dy]);
  acc.quad(c(x1, y0, z1), c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1), [0, 0], [dz, 0], [dz, dy], [0, dy]);
  acc.quad(c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0), [0, 0], [dz, 0], [dz, dy], [0, dy]);
  acc.quad(c(x0, y1, z1), c(x1, y1, z1), c(x1, y1, z0), c(x0, y1, z0), [0, 0], [dx, 0], [dx, dz], [0, dz]);
}
const roofSegs = (L) => clamp(Math.round(L / 2.6), 3, 10);

// 硬山 gable roof (hutong houses, halls): L along the ridge, D across. The gable ends go to acc.A.gable (brick) when there is one
function gableRoof(acc, cx, cz, L, D, yE, h, rot = 0, o = 0.45, lift = 0) {
  const F = roofFrame(cx, cz, rot), a = L / 2 + o, b = D / 2 + o, yR = yE + h, ye = yE - 0.12, n = roofSegs(2 * a), k = D > 2 ? 4 : 2;
  const E = (sz) => (t) => { const x = sz > 0 ? -a + 2 * a * t : a - 2 * a * t; return F(x, ye + lift * roofSweep(t), sz * b); };
  const R = (sz) => (t) => F(sz > 0 ? -a + 2 * a * t : a - 2 * a * t, yR, 0);
  const gf = roofFace(acc, E(1), R(1), n, k), gb = roofFace(acc, E(-1), R(-1), n, k);
  // gable ends: the profile polygon, fanned from the eave line's middle
  const G = (acc.A && acc.A.gable) || acc;
  for (const [col, colB, sx] of [[0, n, -1], [n, 0, 1]]) {
    const pts = []; for (let j = 0; j <= k; j++) pts.push(gf[j][col]); for (let j = k - 1; j >= 0; j--) pts.push(gb[j][colB]);
    const c0 = F(sx * a, ye - 0.02, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], uvp = [rot ? p[0] : p[2], p[1]], uvq = [rot ? q[0] : q[2], q[1]], uvc = [rot ? c0[0] : c0[2], c0[1]];
      if (sx < 0) G.tri(c0, p, q, uvc, uvp, uvq); else G.tri(c0, q, p, uvc, uvq, uvp);
    }
  }
  if (D > 1.5) {
    ridgeAlong(acc, [F(-a, yR, 0), F(a, yR, 0)], Math.min(0.5, D * 0.08), Math.min(0.5, 0.1 + D * 0.04));
    eaveBand(acc.A, E(1), (t) => F(-a + 2 * a * t, yE, D / 2), n, 0.22); eaveBand(acc.A, E(-1), (t) => F(a - 2 * a * t, yE, -D / 2), n, 0.22);
  }
}
// 庑殿 hip roof (W along the ridge ≥ D) — also the 攒尖 pyramid when W = D. Swept-up corners, hip ridges, 正脊 + 正吻
function hipRoof(acc, cx, cz, Wd, D, yE, h, rot = 0, o = 0.8, lift) {
  const F = roofFrame(cx, cz, rot), a = Wd / 2 + o, b = D / 2 + o, r = Math.max(0, (Wd - D) / 2), yR = yE + h, ye = yE - 0.18;
  const Lc = lift !== undefined ? lift : clamp(0.08 * Math.min(Wd, D) + 0.25, 0.3, 1.5), Kc = Lc * 0.8;
  // corners: FL, FR, BR, BL, each swept up and out along its diagonal
  const C = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ x: sx * a, z: sz * b, dx: sx * 0.7071, dz: sz * 0.7071 }));
  const edge = (i, j) => (t) => { const A = C[i], B = C[j], sw = roofSweep(t), dx = A.dx * (1 - t) + B.dx * t, dz = A.dz * (1 - t) + B.dz * t; return F(A.x + (B.x - A.x) * t + dx * Kc * sw, ye + Lc * sw, A.z + (B.z - A.z) * t + dz * Kc * sw); };
  const R0 = F(-r, yR, 0), R1 = F(r, yR, 0), line = (p, q) => (t) => lerp3(p, q, t), pt = (p) => () => p;
  const nL = roofSegs(2 * a), nS = roofSegs(2 * b), k = 4;
  const faces = [roofFace(acc, edge(0, 1), line(R0, R1), nL, k), roofFace(acc, edge(1, 2), pt(R1), nS, k), roofFace(acc, edge(2, 3), line(R1, R0), nL, k), roofFace(acc, edge(3, 0), pt(R0), nS, k)];
  // hip ridges (垂脊) up each corner line
  const hw = clamp(0.06 * Math.min(Wd, D), 0.22, 0.5);
  for (const f of [faces[0], faces[2]]) for (const col of [0, f[0].length - 1]) ridgeAlong(acc, f.map((row) => row[col]), hw, hw * 0.7);
  if (r > 0.1) mainRidge(acc, F, r, yR, clamp(0.05 * Wd, 0.3, 1.1), hw * 1.4);
  // fascia + soffit under all four eaves
  const I = (i, j) => (t) => { const A = C[i], B = C[j]; return F((A.x + (B.x - A.x) * t) * (Wd / 2) / a, yE - 0.05, (A.z + (B.z - A.z) * t) * (D / 2) / b); };
  const fh = clamp(0.03 * Math.min(Wd, D) + 0.2, 0.22, 0.6);
  eaveBand(acc.A, edge(0, 1), I(0, 1), nL, fh); eaveBand(acc.A, edge(1, 2), I(1, 2), nS, fh); eaveBand(acc.A, edge(2, 3), I(2, 3), nL, fh); eaveBand(acc.A, edge(3, 0), I(3, 0), nS, fh);
  // a ceiling inside the soffit ring: open pavilions and storeys narrower than the roof showed sky through the (culled) underside
  const ea = acc.A && acc.A.eave;
  if (ea) { const y = yE - 0.05, w = Wd / 2, d = D / 2; ea.quad(F(-w, y, -d), F(w, y, -d), F(w, y, d), F(-w, y, d), [0, 0.02], [Wd, 0.02], [Wd, 0.46], [0, 0.46]); }
}
// 攒尖 pyramid roof on a square pavilion
function pyramidRoof(acc, cx, cz, s, yE, h, o = 0.7) { hipRoof(acc, cx, cz, s, s, yE, h, 0, o); }
// round conical roof (天坛 / 皇穹宇 / 亭), n segments; concave profile, fascia + soffit ring.
// rw = the wall (drum) radius under it: the soffit runs all the way in to it (R > rw left an open ring under the eave)
function roundRoof(acc, cx, cz, R, yE, h, n = 20, o = 0.6, rw = R) {
  const ye = yE - 0.15, yR = yE + h, Ro = R + o, k = 4;
  const E = (t) => { const a = -t * TAU; return [cx + Math.cos(a) * Ro, ye, cz + Math.sin(a) * Ro]; };
  roofFace(acc, E, () => [cx, yR, cz], n, k);
  eaveBand(acc.A, E, (t) => { const a = -t * TAU; return [cx + Math.cos(a) * rw, yE - 0.05, cz + Math.sin(a) * rw]; }, n, clamp(0.04 * R + 0.2, 0.22, 0.5));
}
// textured box (walls / bases), bottom at y; uv in metres (rep: kept for old callers, ignored)
function boxW(acc, x0, y0, z0, x1, y1, z1, rep = 2, faces = 'nsewt') {
  void rep;
  const P = (x, y, z) => [x, y, z], ux = (p) => [p[0], p[1]], uz = (p) => [p[2], p[1]];
  if (faces.includes('s')) { const a = P(x0, y0, z1), b = P(x1, y0, z1), c = P(x1, y1, z1), d = P(x0, y1, z1); acc.quad(a, b, c, d, ux(a), ux(b), ux(c), ux(d)); }
  if (faces.includes('n')) { const a = P(x1, y0, z0), b = P(x0, y0, z0), c = P(x0, y1, z0), d = P(x1, y1, z0); acc.quad(a, b, c, d, ux(a), ux(b), ux(c), ux(d)); }
  if (faces.includes('e')) { const a = P(x1, y0, z1), b = P(x1, y0, z0), c = P(x1, y1, z0), d = P(x1, y1, z1); acc.quad(a, b, c, d, uz(a), uz(b), uz(c), uz(d)); }
  if (faces.includes('w')) { const a = P(x0, y0, z0), b = P(x0, y0, z1), c = P(x0, y1, z1), d = P(x0, y1, z0); acc.quad(a, b, c, d, uz(a), uz(b), uz(c), uz(d)); }
  if (faces.includes('t')) { const a = P(x0, y1, z1), b = P(x1, y1, z1), c = P(x1, y1, z0), d = P(x0, y1, z0), ut = (p) => [p[0], p[2]]; acc.quad(a, b, c, d, ut(a), ut(b), ut(c), ut(d)); }
}
// textured cylinder side (round halls, drums, columns)
function cylW(acc, cx, cz, r, y0, y1, n = 20, rep = 2) {
  void rep;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
    const q0 = [p0[0], y1, p0[2]], q1 = [p1[0], y1, p1[2]], u0 = (k / n) * r * TAU, u1 = ((k + 1) / n) * r * TAU;
    acc.quad(p1, p0, q0, q1, [u1, y0], [u0, y0], [u0, y1], [u1, y1]);
  }
}
// flat disc / ring top (terraces)
function discTop(acc, cx, cz, r, y, n = 24, rep = 3) {
  void rep;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    const p0 = [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], p1 = [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], c = [cx, y, cz];
    acc.tri(c, p1, p0, [cx, cz], [p1[0], p1[2]], [p0[0], p0[2]]);
  }
}
