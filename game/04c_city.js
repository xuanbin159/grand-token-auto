/* ============================================================
   city: fills the real street network with buildings.
   Every street frontage gets lots (胡同四合院 / 老字号 / 小区楼 /
   写字楼), checked against the occupancy grid so nothing overlaps
   roads, water, parks or landmarks. Buildings are instanced
   templates drawn by one "palette + pattern" shader (brick, tiles,
   lattice, procedural windows that light up at night).
   ============================================================ */
const SHOP_STREETS = /前门大街|大栅栏|琉璃厂|南锣鼓巷|烟袋斜街|鼓楼东大街|东直门内大街|王府井|西单北大街|护锅寺街|国子监街|五道营|杨梅竹斜街|北新桥|地安门外大街|交道口南大街|隆福寺|前门东大街|鲜鱼口|钱市胡同|南新华街/;
function hintAt(x, z) {
  const H = MAPD.raw.hint, i = Math.floor((x - W.bounds.x0) / H.cell), j = Math.floor((z - W.bounds.z0) / H.cell);
  if (i < 0 || j < 0 || i >= H.w || j >= H.h) return { n: 0, avg: 0, max: 0 };
  const k = j * H.w + i; return { n: H.count[k], avg: H.avg[k], max: H.max[k] };
}
const inOldCity = (x, z) => !!W.ringPoly && pointInRing(x, z, W.ringPoly);

/* ---------- the shared building material ---------- */
const CityMat = {
  U: { tDetail: { value: null }, uNight: { get value() { return DayNight.night; } } }, // windows light up with the lamps
  mat: null,
  detailTex() { // R brick, G roof tiles, B lattice, A plaster — all tile seamlessly
    const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    const rnd = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4;
      // brick: 10 courses x 5 bricks per tile, running bond
      const row = Math.floor(y / 25.6), bx = (x + (row % 2) * 25.6) % 256, col = Math.floor(bx / 51.2), fy = (y % 25.6) / 25.6, fx = (bx % 51.2) / 51.2;
      const mortar = fy < 0.14 || fx < 0.06;
      d[k] = mortar ? 40 : 170 + rnd(col, row, 1) * 70 + (rnd(x, y, 2) - 0.5) * 30;
      // roof tiles: 8 rounded channels, 4 rows
      const cx = (x % 32) / 32, ry = (y % 64) / 64, bump = Math.sin(cx * Math.PI);
      d[k + 1] = Math.max(0, Math.min(255, 40 + bump * 190 - (ry < 0.08 ? 90 : 0) + (rnd(x, y, 3) - 0.5) * 24));
      // lattice: a grid of thin bars over paper
      const lx = x % 32, ly = y % 32;
      d[k + 2] = (lx < 3 || ly < 3) ? 30 : 220 + (rnd(x, y, 4) - 0.5) * 20;
      // plaster: soft blotches
      d[k + 3] = 200 + Math.sin(x * 0.05 + Math.sin(y * 0.07) * 2) * 20 + (rnd(x, y, 5) - 0.5) * 30;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, MAX_ANISO);
    t.premultiplyAlpha = false;
    return t;
  },
  make() {
    this.U.tDetail.value = this.detailTex();
    const U = this.U;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float aPat; attribute float aSeed; varying float vPat; varying float vSeed; varying vec3 vOP; varying vec3 vON;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));',
          '  vSeed = aSeed;',
          '  vec3 ioff = vec3(0.0, instanceMatrix[3].y, 0.0);', // stacked tiers keep world-height window rows
          '#else',
          '  vec3 ioff = vec3(0.0);',
          '  vec3 isc = vec3(1.0); vSeed = 0.37;',
          '#endif',
          '  vOP = position * isc + ioff; vON = normal; vPat = aPat;',
        ].join('\n'));
      Render.cutoutPatch(sh);
      sh.fragmentShader = 'uniform sampler2D tDetail; uniform float uNight; varying float vPat; varying float vSeed; varying vec3 vOP; varying vec3 vON;\n' +
        'float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          'vec3 an = abs(vON); float pat = floor(vPat + 0.5); vec3 winGlow = vec3(0.0); float rough = 0.86;',
          // the per-building seed is k/1024: snap it back to an integer before hashing, or the sin-hash turns the
          // varying's interpolation error (1 ulp) into per-pixel static on every pane
          'float sd = floor(vSeed * 1024.0 + 0.5);',
          'vec2 puv = an.y > 0.7 ? vOP.xz : (an.x > an.z ? vOP.zy : vOP.xy);',
          'if (pat == 1.0) { diffuseColor.rgb *= mix(0.55, 1.12, texture2D(tDetail, puv / vec2(2.2, 1.1)).r); }',
          'else if (pat == 2.0) { diffuseColor.rgb *= mix(0.5, 1.15, texture2D(tDetail, vOP.xz / 1.6 + vec2(0.0, vOP.y * 0.4)).g); rough = 0.7; }',
          'else if (pat == 3.0) { diffuseColor.rgb *= mix(0.5, 1.15, texture2D(tDetail, vOP.zx / 1.6 + vec2(0.0, vOP.y * 0.4)).g); rough = 0.7; }',
          'else if (pat == 4.0) { float l = texture2D(tDetail, puv / 1.6).b; diffuseColor.rgb *= mix(0.35, 1.08, l);',
          '  float lit = step(0.45, hsh(floor(puv / 3.2) + sd * 0.0166)); winGlow = vec3(1.0, 0.66, 0.34) * l * lit * 0.9; }',
          'else if (pat == 5.0) { diffuseColor.rgb *= mix(0.86, 1.04, texture2D(tDetail, puv / 5.0).a); }',
          'else if (pat >= 6.0) {',
          // facade variant = the seed's top two bits (City.put): office 0 punched, 1 curtain wall, 2 ribbon windows;
          // flats 0 punched, 1 balconies + AC units, 2 small windows + balconies, 3 red-brick 老小区
          '  float vr = floor(sd / 256.0), fl = step(6.5, pat), wall = step(an.y, 0.7) * step(3.6, vOP.y);',
          '  vec2 cs = fl > 0.5 ? vec2(3.1, 3.0) : vr == 1.0 ? vec2(1.5, 3.6) : vec2(2.3, 3.5); vec2 q = puv / cs, f = fract(q), id = floor(q);',
          '  float win;',
          '  if (fl < 0.5 && vr == 1.0) win = step(0.05, f.x) * step(0.12, f.y);',
          '  else if (fl < 0.5 && vr == 2.0) win = step(0.03, f.x) * step(0.34, f.y) * step(f.y, 0.88);',
          '  else if (fl > 0.5 && vr == 2.0) win = step(0.14, f.x) * step(f.x, 0.6) * step(0.36, f.y) * step(f.y, 0.86);',
          '  else win = step(0.2 + 0.04 * fl, f.x) * step(f.x, 0.8 - 0.04 * fl) * step(0.22, f.y) * step(f.y, 0.86);',
          '  win *= wall;',
          '  float h = hsh(id + sd * 0.0302), bt = hsh(vec2(sd, 3.3));',
          '  if (fl > 0.5 && vr == 3.0) diffuseColor.rgb *= mix(0.62, 1.1, texture2D(tDetail, puv / vec2(2.2, 1.1)).r) * vec3(1.0, 0.72, 0.6);',
          // daytime glass reads blue-grey (sky in it), some panes with blinds / curtains drawn; unlit panes go dark at night.
          // A curtain wall is one tint per building (blue / green / bronze), glossier
          '  vec3 glass = (fl > 0.5 ? vec3(0.30, 0.35, 0.40) : vec3(0.25, 0.34, 0.45)) * (0.82 + 0.36 * h);',
          '  if (fl < 0.5 && vr == 1.0) glass = mix(mix(vec3(0.3, 0.42, 0.52), vec3(0.28, 0.44, 0.42), step(0.55, bt)), vec3(0.44, 0.38, 0.3), step(0.85, bt)) * (0.9 + 0.16 * h);',
          '  glass = mix(glass, vec3(0.74, 0.70, 0.62), step(0.84, fract(h * 7.31)) * 0.65 * (1.0 - step(0.5, vr) * (1.0 - fl))) * (1.0 - 0.55 * uNight);',
          '  float shop = step(vOP.y, 3.4) * step(an.y, 0.7) * step(0.08, f.x) * step(f.x, 0.92) * step(0.5, vOP.y);',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, glass, max(win, shop * 0.9));',
          // balconies: a white slab + railing under each window row, an AC box beside some windows
          '  if (fl > 0.5 && (vr == 1.0 || vr == 2.0)) {',
          '    float bal = step(f.y, 0.3) * step(0.03, f.x) * step(f.x, 0.97) * wall, rail = bal * step(0.5, fract(puv.x * 3.0));',
          '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.82) * (0.8 + 0.2 * step(0.26, f.y)), bal * (0.55 + 0.35 * rail));',
          '    float ac = step(0.66, f.x) * step(f.x, 0.9) * step(0.36, f.y) * step(f.y, 0.58) * wall * step(0.45, fract(h * 3.7)) * step(vr, 1.5);',
          '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.9, 0.88) * (0.85 + 0.15 * step(0.5, fract(puv.y * 12.0))), ac);',
          '  }',
          '  if (an.y > 0.7) diffuseColor.rgb *= 0.62;',
          '  float lit = fl < 0.5 && vr == 1.0 ? step(0.62, h) : step(0.52, h);',
          '  winGlow = win * lit * vec3(1.0, 0.82, 0.58) * (0.55 + 0.45 * h) + shop * vec3(1.0, 0.86, 0.6) * 0.8;',
          '  rough = mix(0.85, fl < 0.5 && vr == 1.0 ? 0.1 : 0.18, win);',
          '}',
        ].join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rough;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += winGlow * uNight;');
    };
    m.customProgramCacheKey = () => 'city-v4';
    this.mat = m;
    return m;
  },
};

/* ---------- template builder: boxes / roofs with colour + pattern id ---------- */
class TB {
  // twin: a second builder that only gets the massing (walls, houses, roofs, towers; no panels / plaques / steps / paving):
  // the template's shadow proxy (see Render.shadowProxy)
  constructor(twin = true) { this.p = []; this.n = []; this.c = []; this.t = []; this._c = new THREE.Color(); this.sh = twin ? new TB(false) : null; }
  tri(a, b, c, col, pat) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this._c.set(col);
    for (const p of [a, b, c]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.c.push(this._c.r, this._c.g, this._c.b); this.t.push(pat); }
  }
  quad(a, b, c, d, col, pat) { this.tri(a, b, c, col, pat); this.tri(a, c, d, col, pat); }
  // axis-aligned box; faces: n s e w t b
  box(x0, y0, z0, x1, y1, z1, col, pat = 0, faces = 'nsewt') {
    if (this.sh && Math.min(x1 - x0, y1 - y0, z1 - z0) >= 0.25 && (x1 - x0) * (y1 - y0) * (z1 - z0) >= 0.6) this.sh.box(x0, y0, z0, x1, y1, z1, 0, 0, faces);
    if (faces.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, pat);
    if (faces.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, pat);
    if (faces.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, pat);
    if (faces.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, pat);
    if (faces.includes('t')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, pat);
    if (faces.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, pat);
  }
  // gable roof over a rect, ridge along x (alongX) or z, concave Chinese eave profile
  gable(cx, cz, L, D, yE, h, col, alongX = true, o = 0.4) {
    if (this.sh && D >= 1.2) this.sh.gable(cx, cz, L, D, yE, h, 0, alongX, o);
    const pat = alongX ? 2 : 3;
    const F = alongX ? (lx, y, lz) => [cx + lx, y, cz + lz] : (lx, y, lz) => [cx + lz, y, cz - lx];
    const a = L / 2 + o, b = D / 2 + o, ye = yE - 0.1, yR = yE + h, ym = ye + (yR - ye) * 0.36;
    const e = (s, t) => F(s * a, ye, t * b), m = (s, t) => F(s * a, ym, t * b * 0.48), r = (s) => F(s * a, yR, 0);
    for (const t of [1, -1]) {
      const [p0, p1] = t > 0 ? [e(-1, t), e(1, t)] : [e(1, t), e(-1, t)], [m1, m0] = t > 0 ? [m(1, t), m(-1, t)] : [m(-1, t), m(1, t)], [r1, r0] = t > 0 ? [r(1), r(-1)] : [r(-1), r(1)];
      this.quad(p0, p1, m1, m0, col, pat); this.quad(m0, m1, r1, r0, col, pat);
    }
    for (const s of [1, -1]) { // gable ends
      const E1 = e(s, 1), E2 = e(s, -1), M1 = m(s, 1), M2 = m(s, -1), R = r(s);
      if (s > 0) { this.tri(E1, E2, M2, 0x6f6f6f, 1); this.tri(E1, M2, M1, 0x6f6f6f, 1); this.tri(M1, M2, R, 0x6f6f6f, 1); }
      else { this.tri(E2, E1, M1, 0x6f6f6f, 1); this.tri(E2, M1, M2, 0x6f6f6f, 1); this.tri(M2, M1, R, 0x6f6f6f, 1); }
    }
    // ridge
    if (this.sh) this.box(cx - (alongX ? a : 0.12), yR - 0.08, cz - (alongX ? 0.12 : a), cx + (alongX ? a : 0.12), yR + 0.14, cz + (alongX ? 0.12 : a), 0x3f4246, 0, 'nsewt');
  }
  hip(cx, cz, Wd, D, yE, h, col, o = 0.7) {
    if (this.sh) this.sh.hip(cx, cz, Wd, D, yE, h, 0, o);
    const a = Wd / 2 + o, b = D / 2 + o, r = Math.max(0.2, (Wd - D) / 2), yR = yE + h, ye = yE - 0.15;
    const E = [[cx - a, ye, cz + b], [cx + a, ye, cz + b], [cx + a, ye, cz - b], [cx - a, ye, cz - b]], R0 = [cx - r, yR, cz], R1 = [cx + r, yR, cz];
    this.quad(E[0], E[1], R1, R0, col, 2); this.quad(E[2], E[3], R0, R1, col, 2); this.tri(E[1], E[2], R1, col, 3); this.tri(E[3], E[0], R0, col, 3);
  }
  // position-only, for the depth pass
  shadowGeo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.sh.p, 3)); g.computeBoundingSphere(); return g; }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.t, 1));
    g.computeBoundingSphere();
    if (this.sh) g.userData.sgeo = this.sh.p.length ? this.shadowGeo() : null;
    return g;
  }
}

const COL = { brick: 0x8b8e92, brick2: 0x9a9c9f, roof: 0x5c6066, lattice: 0x7a4428, red: 0x9b1c14, redCol: 0x9b2d24, stone: 0xb6b1a6, plaster: 0xe2ddd2, green: 0x2e6b5a, dark: 0x1b1714, gold: 0xc9a23e, shopWarm: 0xf2cf8e };

/* ---------- templates (object space: lot centred at origin, +z faces the street) ---------- */
const Tpl = {
  defs: {},
  build() {
    // 胡同 courtyard house seen from the lane: wall + gatehouse, main house behind
    for (const [key, gateL] of [['hutongA', false], ['hutongB', true]]) {
      const b = new TB(), w = 8, d = 9, hw = w / 2, hd = d / 2, t = 0.3, wh = 2.7;
      const gx = gateL ? -hw + 2.0 : hw - 2.0, gw = 1.5;
      b.box(-hw, 0, hd - t, gx - gw / 2 - 0.4, wh, hd, COL.brick, 1, 'nsewt');
      b.box(gx + gw / 2 + 0.4, 0, hd - t, hw, wh, hd, COL.brick, 1, 'nsewt');
      b.box(-hw, 0, -hd, -hw + t, wh, hd, COL.brick, 1, 'ewt'); b.box(hw - t, 0, -hd, hw, wh, hd, COL.brick, 1, 'ewt');
      // wall coping
      b.gable(-hw + t / 2, 0, d, 0.5, wh, 0.25, COL.roof, false, 0.08); b.gable(hw - t / 2, 0, d, 0.5, wh, 0.25, COL.roof, false, 0.08);
      // gatehouse
      b.box(gx - gw / 2 - 0.45, 0, hd - 1.6, gx - gw / 2, 3.0, hd, COL.brick2, 1); b.box(gx + gw / 2, 0, hd - 1.6, gx + gw / 2 + 0.45, 3.0, hd, COL.brick2, 1);
      b.box(gx - gw / 2, 2.35, hd - 1.6, gx + gw / 2, 3.0, hd, COL.brick2, 1, 'st');
      b.box(gx - gw / 2, 0, hd - 0.55, gx + gw / 2, 2.35, hd - 0.45, COL.red, 0, 's');
      b.box(gx - gw / 2 - 0.05, 2.1, hd - 0.44, gx + gw / 2 + 0.05, 2.3, hd - 0.4, COL.green, 0, 's');
      b.gable(gx, hd - 0.8, gw + 1.2, 1.9, 3.0, 1.0, COL.roof, true, 0.3);
      for (const s of [-1, 1]) b.box(gx + s * (gw / 2 + 0.25) - 0.2, 0, hd - 0.05, gx + s * (gw / 2 + 0.25) + 0.2, 0.5, hd + 0.4, COL.stone, 0);
      // main house across the back, 倒座 house by the gate
      b.box(-hw + 0.5, 0, -hd + 0.3, hw - 0.5, 3.2, -hd + 3.6, COL.brick, 1, 'nsew');
      b.box(-hw + 0.8, 0.4, -hd + 3.62, hw - 0.8, 3.0, -hd + 3.64, COL.lattice, 4, 's');
      b.gable(0, -hd + 1.95, w - 1.0, 3.3, 3.2, 1.6, COL.roof, true, 0.45);
      const dx0 = gateL ? gx + gw / 2 + 0.5 : -hw + 0.5, dx1 = gateL ? hw - 0.5 : gx - gw / 2 - 0.5;
      if (dx1 - dx0 > 2.5) { b.box(dx0, 0, hd - 2.8, dx1, 2.6, hd - t, COL.brick, 1, 'nsew'); b.gable((dx0 + dx1) / 2, hd - 1.55, dx1 - dx0, 2.5, 2.6, 1.1, COL.roof, true, 0.35); }
      // yard paving
      b.box(-hw + t, 0.01, -hd + 3.6, hw - t, 0.03, hd - 2.8, 0x8a8782, 1, 't');
      this.defs[key] = { geo: b.geo(), h: 4.8, tree: [0, -0.5] };
    }
    // street-facing 倒座房 with lattice windows and a door (a lane-side house)
    {
      const b = new TB(), w = 8, d = 7, hw = w / 2, hd = d / 2;
      b.box(-hw, 0, -hd, hw, 3.1, hd, COL.brick, 1, 'nsew');
      b.box(-hw + 0.1, 0, hd, hw - 0.1, 0.9, hd + 0.02, COL.brick2, 1, 's');
      b.box(-hw + 0.5, 0.9, hd, -0.9, 2.8, hd + 0.03, COL.lattice, 4, 's'); b.box(0.9, 0.9, hd, hw - 0.5, 2.8, hd + 0.03, COL.lattice, 4, 's');
      b.box(-0.7, 0, hd, 0.7, 2.4, hd + 0.05, COL.red, 0, 's');
      b.box(-hw, 2.8, hd, hw, 3.1, hd + 0.04, COL.green, 0, 's');
      b.gable(0, 0, w, d, 3.1, 1.7, COL.roof, true, 0.5);
      this.defs.laneHouse = { geo: b.geo(), h: 5 };
    }
    // a full 四合院 for the insides of big blocks
    {
      const b = new TB(), w = 14, d = 16, hw = w / 2, hd = d / 2, t = 0.35;
      b.box(-hw, 0, -hd, hw, 2.8, -hd + t, COL.brick, 1); b.box(-hw, 0, hd - t, hw - 3.5, 2.8, hd, COL.brick, 1); b.box(hw - 1.8, 0, hd - t, hw, 2.8, hd, COL.brick, 1);
      b.box(-hw, 0, -hd, -hw + t, 2.8, hd, COL.brick, 1); b.box(hw - t, 0, -hd, hw, 2.8, hd, COL.brick, 1);
      b.box(-hw + 0.6, 0, -hd + t, hw - 0.6, 3.4, -hd + 4.2, COL.brick, 1, 'sew');
      b.box(-hw + 0.9, 0.4, -hd + 4.2, hw - 0.9, 3.2, -hd + 4.23, COL.lattice, 4, 's');
      b.gable(0, -hd + 2.3, w - 1.2, 3.9, 3.4, 1.9, COL.roof, true, 0.5);
      for (const s of [-1, 1]) {
        b.box(s > 0 ? hw - t - 2.6 : -hw + t, 0, -hd + 5.2, s > 0 ? hw - t : -hw + t + 2.6, 2.9, hd - 3.6, COL.brick, 1, 'nsew');
        b.box(s > 0 ? hw - t - 2.63 : -hw + t + 2.6, 0.4, -hd + 5.5, s > 0 ? hw - t - 2.6 : -hw + t + 2.63, 2.7, hd - 3.9, COL.lattice, 4, s > 0 ? 'w' : 'e');
        b.gable(s * (hw - t - 1.3), -0.2, 2.6, d - 8.8, 2.9, 1.3, COL.roof, false, 0.35);
      }
      b.box(-hw + 0.6, 0, hd - 3.2, hw - 4.0, 2.7, hd - t, COL.brick, 1, 'nsew'); b.gable(-1.7, hd - 1.8, w - 4.6, 2.8, 2.7, 1.2, COL.roof, true, 0.35);
      b.box(hw - 3.4, 0, hd - 0.6, hw - 1.9, 2.3, hd - 0.5, COL.red, 0, 's'); b.gable(hw - 2.65, hd - 0.9, 2.4, 1.8, 2.9, 0.9, COL.roof, true, 0.3);
      b.box(-hw + t, 0.01, -hd + 4.2, hw - t, 0.03, hd - 3.2, 0x8a8782, 1, 't');
      this.defs.siheyuan = { geo: b.geo(), h: 5.4, tree: [0, 1] };
    }
    // 老字号: two storeys, lattice upstairs, open lit shop below, plaque board, grey tiled hip roof
    {
      const b = new TB(), w = 8, d = 9, hw = w / 2, hd = d / 2, H = 5.8;
      b.box(-hw, 0, -hd, hw, H, hd, COL.brick, 1, 'nsew');
      for (const x of [-hw + 0.3, 0, hw - 0.3]) b.box(x - 0.18, 0, hd, x + 0.18, H - 0.3, hd + 0.3, COL.redCol, 0);
      b.box(-hw + 0.5, 0.2, hd + 0.01, hw - 0.5, 2.6, hd + 0.03, COL.shopWarm, 0, 's');
      b.box(-hw + 0.4, 3.3, hd + 0.01, hw - 0.4, H - 0.6, hd + 0.04, COL.lattice, 4, 's');
      b.box(-hw, 2.7, hd, hw, 3.25, hd + 0.5, 0x4a2a1a, 0);
      b.box(-2.2, 2.75, hd + 0.5, 2.2, 3.2, hd + 0.56, COL.dark, 0, 's');
      b.box(-hw, H - 0.35, hd, hw, H - 0.1, hd + 0.08, COL.green, 0, 's');
      b.hip(0, 0, w, d, H, 2.0, COL.roof, 0.8);
      this.defs.oldShop = { geo: b.geo(), h: 8, sign: [0, 2.97, hd + 0.6, 4.2, 0.42], lanterns: [[-hw + 1.2, 2.3, hd + 0.9], [hw - 1.2, 2.3, hd + 0.9]], neon: [0, 4.45, hd + 0.12] };
    }
    // modern: unit boxes scaled per instance (procedural facades); office (6) or residential (7)
    for (const [key, pat, col] of [['office', 6, 0xc9ced4], ['flats', 7, 0xd8cfc1], ['cap', 5, 0x8e9197]]) {
      const b = new TB();
      b.box(-0.5, 0, -0.5, 0.5, 1, 0.5, col, pat, 'nsewt');
      this.defs[key] = { geo: b.geo(), unit: true };
    }
    // a simple grey compound wall with a gate (大院)
    {
      const b = new TB(), w = 12, hw = 6;
      b.box(-hw, 0, -0.3, -1.4, 2.6, 0.3, 0x9a9690, 5); b.box(1.4, 0, -0.3, hw, 2.6, 0.3, 0x9a9690, 5);
      b.gable(-(hw + 1.4) / 2, 0, hw - 1.4, 0.6, 2.6, 0.25, COL.roof, true, 0.1); b.gable((hw + 1.4) / 2, 0, hw - 1.4, 0.6, 2.6, 0.25, COL.roof, true, 0.1);
      b.box(-1.4, 0, -0.1, 1.4, 2.4, 0.1, 0x2f3338, 0, 's');
      this.defs.wall = { geo: b.geo(), h: 3 };
    }
  },
};

/* ---------- lots ---------- */
const CITY_CHUNK = 256; // instancing granularity (coarser than CHUNK: fewer draw calls, the templates are cheap)
const SHADOW_TILE = 96;  // shadow-proxy granularity
const HUTONG_TINTS = [0xffffff, 0xf3f1ec, 0xe7e5e1, 0xfff5e6, 0xedf1f5, 0xdcdad6, 0xf6ece0];
const City = {
  inst: new Map(), // chunk key → template key → [{x,y,z,rot,sx,sy,sz,seed,col}]
  signs: [], lanterns: [], count: 0, plates: [], proxies: 0,
  put(tpl, x, z, rot, sx, sy, sz, col, y = 0, o = {}) {
    const k = Math.floor((x - W.bounds.x0) / CITY_CHUNK) + ':' + Math.floor((z - W.bounds.z0) / CITY_CHUNK);
    let c = this.inst.get(k); if (!c) this.inst.set(k, c = new Map());
    let l = c.get(tpl); if (!l) c.set(tpl, l = []);
    const D = Tpl.defs[tpl];
    if (col === undefined && !D.unit) col = pick(HUTONG_TINTS);
    l.push({ x, y, z, rot, sx, sy, sz, seed: o.seed !== undefined ? o.seed : randi(0, 1023) / 1024, col });
    if (tpl !== 'cap') this.count++;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const loc = (lx, ly, lz) => [x + lx * sx * cs + lz * sz * sn, y + ly * sy, z - lx * sx * sn + lz * sz * cs];
    if (D.tree && Math.random() < 0.65) { const p = loc(D.tree[0], 0, D.tree[1]); newProp(p[0], p[2], rand(0.55, 0.8), 'tree'); }
    if (D.sign) { const [lx, ly, lz, wd, ht] = D.sign; this.signs.push({ p: loc(lx, ly, lz), rot, w: wd * sx, h: ht }); }
    if (D.lanterns) for (const [lx, ly, lz] of D.lanterns) { const p = loc(lx, ly, lz); BJB.lanterns.push([p[0], p[1], p[2]]); }
    // 后海 / 烟袋斜街 bars: a neon sign over the shopfront
    if (o.bar && D.neon && Math.random() < 0.8) { const p = loc(...D.neon); BJB.neonBoxes.push({ x: p[0], y: p[1], z: p[2], rot, w: Math.min(4.6, 3.4 * sx + 0.6) }); }
  },
  // try to claim an oriented lot; returns true on success
  tryLot(cx, cz, w, d, ux, uz, h, tpl, opts = {}) {
    if (!Grid.obbFree(cx, cz, w / 2, d / 2, ux, uz, 1 << GK.FREE)) return false;
    Grid.setObb(cx, cz, w / 2, d / 2, ux, uz, GK.BLD);
    const rot = Math.atan2(-uz, ux); // object +x → world (ux, uz)
    addSolid(null, { cx, cz, hx: w / 2, hz: d / 2, rot: -rot, h, kind: 'bld' });
    const D = Tpl.defs[tpl];
    if (!D.unit) { this.put(tpl, cx, cz, rot, w / (opts.nw || 8), 1, d / (opts.nd || 9), opts.col, 0, opts); return true; }
    const cs = Math.cos(rot), sn = Math.sin(rot), at = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs], F = { seed: this.facade(tpl, cx, cz, h) };
    if (tpl === 'office' && h > 34 && w > 16 && d > 14) {
      // podium + a slimmer tower (set back from the street), sometimes a second setback near the top
      const ph = rand(7, 11), tw = w * rand(0.62, 0.8), td = d * rand(0.62, 0.8), [tx, tz] = at(rand(-1, 1) * (w - tw) * 0.3, -(d - td) * 0.35);
      this.put('office', cx, cz, rot, w, ph, d, opts.col, 0, { seed: this.facade('office', cx, cz, 0) }); // the podium: shops + punched / ribbon windows
      if (h > 60 && Math.random() < 0.6) { const h1 = h * rand(0.6, 0.75); this.put('office', tx, tz, rot, tw, h1, td, opts.col, 0, F); this.put('office', tx, tz, rot, tw * 0.74, h - h1, td * 0.74, opts.col, h1, F); }
      else this.put('office', tx, tz, rot, tw, h, td, opts.col, 0, F);
      this.cap(tx, tz, rot, tw, td, h);
    } else {
      this.put(tpl, cx, cz, rot, w, h, d, opts.col, 0, F);
      if (h > 22) this.cap(cx, cz, rot, w, d, h);
    }
    return true;
  },
  // facade variant in the seed's top two bits (the city shader reads it): offices outside the old city mostly glass
  // curtain walls, some ribbon windows; 小区 balconies + AC units, red-brick 老小区 mostly inside the 二环
  facade(tpl, cx, cz, h) {
    let v = 0; const r = Math.random(), old = inOldCity(cx, cz);
    if (tpl === 'office') v = h > 30 && r < (old ? 0.3 : 0.7) ? 1 : Math.random() < 0.4 ? 2 : 0;
    else if (tpl === 'flats') v = old ? (r < 0.4 ? 3 : r < 0.75 ? 1 : 0) : (r < 0.45 ? 1 : r < 0.7 ? 2 : r < 0.82 ? 3 : 0);
    return (v * 256 + randi(0, 255)) / 1024;
  },
  // rooftop plant room / water tanks, and a mast on the tallest towers
  cap(cx, cz, rot, w, d, h) {
    const cs = Math.cos(rot), sn = Math.sin(rot), n = h > 50 ? 1 : randi(1, 2);
    for (let k = 0; k < n; k++) {
      const cw = w * rand(0.22, 0.45), cd = d * rand(0.25, 0.5), lx = rand(-1, 1) * (w - cw) * 0.4, lz = rand(-1, 1) * (d - cd) * 0.4;
      this.put('cap', cx + lx * cs + lz * sn, cz - lx * sn + lz * cs, rot, cw, rand(2.2, 4.2), cd, 0xffffff, h);
    }
    if (h > 70 && Math.random() < 0.7) { this.put('cap', cx, cz, rot, 0.7, rand(8, 16), 0.7, 0xb8bcc2, h); Build.reds.push(box(cx, h + 16.6, cz, 0.8, 0.8, 0.8, 0xffffff)); }
  },
  build() {
    Tpl.build();
    CityMat.make();
    const P = [0, 0, 0, 1];
    // shop / bar streets claim their frontage first (前门大街, 南锣鼓巷 … are pedestrian: they'd come last by class)
    const pri = (e) => (BAR_STREETS.test(e.name) || SHOP_STREETS.test(e.name) ? -1 : e.cls);
    const edges = Roads.edges.slice().sort((a, b) => pri(a) - pri(b) || b.len - a.len);
    for (const e of edges) {
      if (e.len < 6) continue;
      const mid = Roads.at(e, e.len / 2, P), old = inOldCity(mid[0], mid[1]), hint = hintAt(mid[0], mid[1]);
      const bar = BAR_STREETS.test(e.name), shopSt = bar || SHOP_STREETS.test(e.name) || e.cls === 7;
      let type;
      if (e.cls <= 1) type = 'tall';
      else if (e.cls <= 3) type = shopSt ? 'shop' : old ? (hint.avg >= 4 || Math.random() < 0.55 ? 'mid' : 'shop') : 'tall';
      else if (e.cls === 4) type = shopSt ? 'shop' : old ? (hint.avg >= 5 ? 'mid' : Math.random() < 0.3 ? 'shop' : 'hutong') : 'mid';
      else if (e.cls === 5) type = bar ? 'shop' : old ? (hint.avg >= 5 ? 'flats' : 'hutong') : 'flats';
      else type = shopSt ? 'shop' : 'hutong';
      const setback = e.hw + e.C.walk + 0.15;
      for (const side of [1, -1]) {
        let s = rand(0.5, 3);
        while (s < e.len - 2) {
          let w, d, h, tpl, dMin, nw = 8, nd = 9;
          if (type === 'hutong') { w = rand(7, 10.5); d = rand(7.5, 11); dMin = 5.5; tpl = Math.random() < 0.3 ? 'laneHouse' : Math.random() < 0.5 ? 'hutongA' : 'hutongB'; h = 5; if (tpl === 'laneHouse') nd = 7; }
          else if (type === 'shop') { w = rand(6.5, 9.5); d = rand(8, 11); dMin = 6; tpl = 'oldShop'; h = 8; }
          else if (type === 'mid') { w = rand(14, 26); d = rand(12, 18); dMin = 9; tpl = Math.random() < 0.5 ? 'flats' : 'office'; h = Math.round(clamp(hint.avg || rand(4, 7), 3, 8) * rand(0.8, 1.2)) * 3.2 + 1; }
          else if (type === 'flats') { w = rand(22, 40); d = rand(11, 15); dMin = 9; tpl = 'flats'; h = Math.round(clamp(hint.avg || rand(5, 12), 4, 18) * rand(0.85, 1.2)) * 3.0 + 1; }
          else { w = rand(20, 36); d = rand(16, 28); dMin = 12; tpl = Math.random() < 0.75 ? 'office' : 'flats'; h = Math.round(clamp(hint.max || rand(8, 20), 6, 32) * rand(0.7, 1.15)) * 3.3 + 2; }
          if (s + w > e.len - 1) { w = e.len - 1 - s; if (w < 5.5) break; }
          const sm = s + w / 2;
          Roads.at(e, sm, P);
          const tx = P[2], tz = P[3], nx = -tz * side, nz = tx * side; // outward normal on this side
          // object +z (street face) points back toward the road → object z axis = -n; object x axis = z × ... keep the facade facing the street
          const ux = -nz, uz = nx; // x axis along the street (so +z faces the road)
          let placed = false;
          for (let dd = d; dd >= dMin; dd *= 0.78) {
            const cx = P[0] + nx * (setback + dd / 2), cz = P[1] + nz * (setback + dd / 2);
            if (this.tryLot(cx, cz, w, dd, ux, uz, h, tpl, { nw, nd, bar, col: tpl === 'office' || tpl === 'flats' ? pick(tpl === 'office' ? MODERN_COLS : FLAT_COLS) : undefined })) { placed = true; break; }
          }
          s += placed ? w + (type === 'hutong' || type === 'shop' ? rand(0, 0.4) : rand(1.5, 5)) : 1.5;
        }
      }
    }
    // insides of big blocks: courtyards in the old city, slabs outside
    const B = W.bounds;
    for (let z = B.z0 + 8; z < B.z1 - 8; z += 9) for (let x = B.x0 + 8; x < B.x1 - 8; x += 9) {
      if (Grid.at(x, z) !== GK.FREE) continue;
      const old = inOldCity(x, z);
      if (old) { if (this.tryLot(x, z, 14, 16, 1, 0, 5.4, 'siheyuan', { nw: 14, nd: 16 })) continue; if (this.tryLot(x, z, 9, 10, 1, 0, 5, 'hutongA', {})) continue; }
      else { const h = Math.round(rand(6, 16)) * 3 + 1; if (this.tryLot(x, z, rand(26, 36), rand(11, 14), 1, 0, h, 'flats', { col: pick(FLAT_COLS) })) continue; }
    }
    this.hutongPlates();
    this.flush();
  },
  // blue 胡同 name plates on the corner walls, both ends of every named lane in the old city
  hutongPlates() {
    const P = [0, 0, 0, 1], tot = new Map(), cand = [];
    for (const e of Roads.edges) {
      if (!e.name || e.len < 10 || e.cls < 5 || !/胡同|条$|巷$|街$|夹道|斜街|沿$/.test(e.name)) continue;
      Roads.at(e, e.len / 2, P); if (!inOldCity(P[0], P[1])) continue;
      tot.set(e.name, (tot.get(e.name) || 0) + e.len); cand.push(e);
    }
    const names = [...tot.keys()].sort((a, b) => tot.get(b) - tot.get(a)).slice(0, 64), idx = new Map(names.map((n, i) => [n, i]));
    BJB.plateNames = names;
    for (const e of cand) {
      if (!idx.has(e.name)) continue;
      for (const s of [3.2, e.len - 3.2]) {
        Roads.at(e, s, P);
        for (const side of s < e.len / 2 ? [1, -1] : [-1, 1]) {
          const nx = -P[3] * side, nz = P[2] * side, set = e.hw + e.C.walk + 0.15;
          if (Grid.at(P[0] + nx * (set + 0.8), P[1] + nz * (set + 0.8)) !== GK.BLD) continue;
          BJB.signQuads.push({ x: P[0] + nx * (set - 0.05), y: 2.55, z: P[1] + nz * (set - 0.05), ry: Math.atan2(-nx, -nz), idx: idx.get(e.name) });
          break;
        }
      }
    }
  },
  flush() {
    const mat = CityMat.mat, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new V3(), s = new V3(), c = new THREE.Color();
    for (const [, tpls] of this.inst) for (const [tpl, list] of tpls) {
      const D = Tpl.defs[tpl];
      let cx = 0, cz = 0; for (const it of list) { cx += it.x; cz += it.z; } cx /= list.length; cz /= list.length;
      let r = 0, hmax = 0; for (const it of list) { r = Math.max(r, Math.hypot(it.x - cx, it.z - cz) + Math.max(it.sx * (D.unit ? 0.7 : 6), it.sz * (D.unit ? 0.7 : 6))); hmax = Math.max(hmax, it.y + (D.unit ? it.sy : D.h)); }
      const g = D.geo.clone();
      const seeds = new Float32Array(list.length);
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      g.boundingSphere = new THREE.Sphere(new V3(cx, hmax / 2, cz), r + hmax / 2 + 4);
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, k) => {
        q.setFromAxisAngle(UP, it.rot); m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz)); mesh.setMatrixAt(k, m4);
        seeds[k] = it.seed;
        mesh.setColorAt(k, c.set(it.col !== undefined ? it.col : 0xffffff));
      });
      mesh.castShadow = false; mesh.receiveShadow = true; scene.add(mesh); Cull.add(mesh, D.unit ? 1e9 : 400); // low courtyard roofs vanish into the haze first
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    }
    // shadows come from massing proxies in SHADOW_TILE tiles (a cascade touches a few tiles, not whole 256 m chunks of full detail)
    const tiles = new Map();
    for (const [, tpls] of this.inst) for (const [tpl, list] of tpls) {
      if (!Tpl.defs[tpl].geo.userData.sgeo) continue;
      for (const it of list) {
        const k = tpl + '|' + Math.floor((it.x - W.bounds.x0) / SHADOW_TILE) + ':' + Math.floor((it.z - W.bounds.z0) / SHADOW_TILE);
        let l = tiles.get(k); if (!l) tiles.set(k, l = []); l.push(it);
      }
    }
    for (const [k, list] of tiles) {
      const m = Render.shadowProxy(Tpl.defs[k.slice(0, k.indexOf('|'))].geo.userData.sgeo, list.length);
      list.forEach((it, i) => { q.setFromAxisAngle(UP, it.rot); m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz)); m.setMatrixAt(i, m4); });
      scene.add(m); this.proxies++;
    }
    // shop plaques: one atlas, merged per chunk
    if (this.signs.length) {
      const atlas = shopSignAtlas(), byChunk = new Map();
      for (const sg of this.signs) { const k = Build.chunk(sg.p[0], sg.p[2]); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(sg); }
      const smat = Render.cutout(new THREE.MeshBasicMaterial({ map: atlas, transparent: false }));
      W.neonMats.push(smat);
      for (const list of byChunk.values()) {
        const pos = [], uv = [], idx = [];
        list.forEach((sg, k) => {
          const i = randi(0, 31), u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 8, du = 0.25, dv = 0.125;
          const cs = Math.cos(sg.rot), sn = Math.sin(sg.rot), hw = sg.w / 2, hh = sg.h / 2;
          const P0 = (lx, ly) => [sg.p[0] + lx * cs, sg.p[1] + ly, sg.p[2] - lx * sn];
          for (const [lx, ly, uu, vv] of [[-hw, -hh, u0, v0], [hw, -hh, u0 + du, v0], [hw, hh, u0 + du, v0 + dv], [-hw, hh, u0, v0 + dv]]) { const p = P0(lx, ly); pos.push(p[0], p[1], p[2]); uv.push(uu, vv); }
          const o = k * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
        });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, smat); scene.add(m); Cull.add(m, 300);
      }
    }
  },
};
const BAR_STREETS = /后海|前海|银锭|荷花市场|烟袋斜街|鸦儿胡同|南锣鼓巷/;
const MODERN_COLS = [0xc9ced4, 0xb9c2cc, 0xd6d2c8, 0xa9b4c0, 0xdad6ce, 0xbfb8ad, 0x9eabb8, 0xcfc8bb];
const FLAT_COLS = [0xd8cfc1, 0xe0d5c4, 0xcdbfad, 0xd9c7b5, 0xc8c3bb, 0xe3dccf, 0xc4b19d, 0xd1c2b0];
// 32 老字号 plaques, black lacquer with gold characters (4 x 8 atlas)
function shopSignAtlas() {
  const c = mkCanvas(1024, 512), g = c.getContext('2d');
  const names = OLD_SHOPS.concat(['同和居', '鸿宾楼', '全素斋', '小肠陈', '姚记炒肝', '门框胡同', '大碗茶', '北京布鞋', '稻香村', '义利面包', '聚宝源', '烤肉季']).slice(0, 32);
  names.forEach((n, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64;
    g.fillStyle = '#16120e'; g.fillRect(x, y, 256, 64);
    g.strokeStyle = '#c9a23e'; g.lineWidth = 5; g.strokeRect(x + 5, y + 5, 246, 54);
    g.fillStyle = '#f0c75a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, n, 220, 40, 900); g.fillText(n, x + 128, y + 34);
  });
  return tex(c);
}
