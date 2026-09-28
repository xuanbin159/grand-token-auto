/* ============================================================
   vehicle looks v4: smooth lofted bodies instead of boxes. One mesh per car carries paint, tinted glass, trim and
   the lamps (per-vertex PBR + emission, clearcoat on the sky reflections); wheels and livery decals are instanced
   for the whole town (like the 京牌). Also the 共享单车 / 外卖电驴 frames and the rounded armour kit of the mech.
   ============================================================ */

// ---- the car material: vertex colour + aPbr (roughness, metalness, clearcoat, paint mask) + aEmi (rgb, lamp group).
// Paint mask 1 = the material colour tints it (one material per paint colour, all sharing one program).
// Per-frame gains (shared by reference with every program): L = lamp groups 0 head lamps / DRL, 1 tail lamps,
// 2 always-on glow (mech, LED signs), 3 roof signs; E.x = metalness gain (no sky reflections → metal reads black), E.y = grime ----
const CAR_U = { L: new THREE.Vector4(0.25, 0.45, 1.5, 0.3), E: new THREE.Vector4(1, 0.35, 0, 0) };
const CAR_MATS = new Map(), CAR_MISS = [];
function carMatPatch(sh) {
  sh.uniforms.gtaCarL = { value: CAR_U.L }; sh.uniforms.gtaCarE = { value: CAR_U.E };
  const rep = (s, a, b) => { if (!s.includes(a)) { CAR_MISS.push(a); return s; } return s.replace(a, b); };
  sh.vertexShader = 'attribute vec4 aPbr, aEmi; varying vec4 vPbr, vEmi, vCarB; varying float vCarY, vCarNX;\n' +
    rep(sh.vertexShader, '#include <color_vertex>', '#include <color_vertex>\n\tvPbr = aPbr; vEmi = aEmi; vCarY = position.y; vCarNX = normal.x;\n' +
      '#ifdef USE_BATCHING_COLOR\n\tvCarB = getBatchingColor( getIndirectIndex( gl_DrawID ) ); vColor.rgb = color.rgb;\n#endif');
  let f = 'uniform vec4 gtaCarL, gtaCarE; varying vec4 vPbr, vEmi, vCarB; varying float vCarY, vCarNX;\n' + sh.fragmentShader;
  f = rep(f, '#include <color_fragment>', [
    '#ifdef USE_BATCHING_COLOR',
    '\tdiffuseColor.rgb = mix(vColor.rgb, vCarB.rgb * vColor.rgb, vPbr.w); float carLiv = floor((1.0 - vCarB.a) * 4.0 + 0.5);',
    '#else',
    '\tdiffuseColor.rgb = mix(vColor.rgb, diffuse * vColor.rgb, vPbr.w);',
    '#ifdef CAR_LIV', '\tfloat carLiv = float(CAR_LIV);', '#else', '\tfloat carLiv = 0.0;', '#endif',
    '#endif',
    // liveries on the paint, per pixel (antialiased by the height derivative; sRGB values, gtaLin decodes them later):
    // 1 北京出租 gold top + dark pinstripe, 2 巡警 blue flank band
    '\tif (carLiv > 0.5 && vPbr.w > 0.5) {', '\t\tfloat lw = max(fwidth(vCarY), 1e-4), fl = smoothstep(0.3, 0.5, abs(vCarNX));',
    '\t\tif (carLiv < 1.5) {',
    '\t\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.106), fl * smoothstep(0.735 - lw, 0.735 + lw, vCarY));',
    '\t\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.83, 0.19), smoothstep(0.765 - lw, 0.765 + lw, vCarY));',
    '\t\t} else',
    '\t\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.28, 0.65), fl * smoothstep(0.5 - lw, 0.5 + lw, vCarY) * (1.0 - smoothstep(0.72 - lw, 0.72 + lw, vCarY)));',
    '\t}',
    'float carDirt = 0.0;',
    '#ifdef CAR_DIRT', '\tcarDirt = gtaCarE.y * (1.0 - smoothstep(0.22, 0.7, vCarY));', '\tdiffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.76, 0.7), carDirt);', '#endif',
    '#ifdef CAR_BURNT', '\tdiffuseColor.rgb = vec3(0.12, 0.11, 0.1) * (0.5 + 0.5 * dot(vColor.rgb, vec3(0.333)));', '#endif'].join('\n'));
  // rain makes paint and glass glossier; grime roughens the sills
  f = rep(f, '#include <roughnessmap_fragment>', '#ifdef CAR_BURNT\n\tfloat roughnessFactor = 0.92;\n#else\n\tfloat roughnessFactor = clamp(vPbr.x * mix(1.0, 0.45, clamp(gtaWx.z * 3.4, 0.0, 1.0)) + carDirt * 0.3, 0.0, 1.0);\n#endif');
  f = rep(f, '#include <metalnessmap_fragment>', '#ifdef CAR_BURNT\n\tfloat metalnessFactor = 0.1;\n#else\n\tfloat metalnessFactor = vPbr.y * gtaCarE.x;\n#endif');
  f = rep(f, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifndef CAR_BURNT\n\ttotalEmissiveRadiance += vEmi.rgb * (vEmi.w < 0.5 ? gtaCarL.x : vEmi.w < 1.5 ? gtaCarL.y : vEmi.w < 2.5 ? gtaCarL.z : gtaCarL.w);\n#endif');
  if (f.includes('#include <lights_physical_fragment>')) f = f.replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n#ifdef CAR_BURNT\n\tmaterial.clearcoat = 0.0;\n#else\n\tmaterial.clearcoat *= vPbr.z * (1.0 - carDirt * 0.6);\n#endif\n#endif');
  sh.fragmentShader = f;
  if (CAR_MISS.length && !carMatPatch.warned) { carMatPatch.warned = true; console.warn('[cars] shader patches missed: ' + CAR_MISS.join(' | ')); }
}
// hex = paint colour; o.burnt = charred shell, o.dirt = false for parts that spin or live high up (wheels, the mech),
// o.liv = 'taxi' | 'police' (the livery drawn over the paint), o.batch = the far-traffic BatchedMesh's own copy
const CAR_LIV = { taxi: 1, police: 2 };
function carMat(hex = 0xffffff, o = {}) {
  const lv = !o.burnt && CAR_LIV[o.liv] || 0, flags = (o.burnt ? 'B' : '') + (o.dirt === false ? 'N' : 'D') + (lv ? 'L' + lv : '') + (o.batch ? 'X' : ''), key = hex + flags;
  let m = CAR_MATS.get(key);
  if (m) return m;
  const P = { vertexColors: true, color: hex, roughness: 0.5, metalness: 0 };
  // phones: no clearcoat layer (the low tier has no sky reflections to show it anyway)
  m = LOWQ ? new THREE.MeshStandardMaterial(P) : new THREE.MeshPhysicalMaterial(Object.assign(P, { clearcoat: 1, clearcoatRoughness: 0.07 }));
  m.defines = {}; if (o.burnt) m.defines.CAR_BURNT = ''; if (o.dirt !== false) m.defines.CAR_DIRT = ''; if (lv) m.defines.CAR_LIV = lv;
  m.onBeforeCompile = carMatPatch; m.customProgramCacheKey = () => 'gtaCar' + flags;
  CAR_MATS.set(key, m);
  return m;
}

/* ---------------- geometry builder: position, normal, colour, aPbr, aEmi ---------------- */
const _vA = new V3(), _vB = new V3(), _vC = new V3(), _nm3 = new THREE.Matrix3(), _cc = new THREE.Color();
// a surface: sRGB colour, [roughness, metalness, clearcoat, paint mask], emission colour × gain in lamp group grp
function vsurf(hex, pbr, emi, ek = 1, grp = 0) {
  _cc.set(hex); const s = { r: _cc.r, g: _cc.g, b: _cc.b, pbr, e: [0, 0, 0, 0] };
  if (emi !== undefined) { _cc.set(emi); s.e = [_cc.r * ek, _cc.g * ek, _cc.b * ek, grp]; }
  return s;
}
const SF = {
  paint: vsurf(0xffffff, [0.3, 0.35, 1, 1]),
  glass: vsurf(0x1a232d, [0.03, 0, 1, 0]), glassL: vsurf(0x2a3845, [0.04, 0, 1, 0]),
  black: vsurf(0x141619, [0.35, 0, 0.6, 0]), plastic: vsurf(0x1d1f22, [0.78, 0, 0, 0]), grille: vsurf(0x0e0f11, [0.5, 0.2, 0.3, 0]),
  seam: vsurf(0x0b0b0c, [0.9, 0, 0, 0]), under: vsurf(0x17181a, [0.95, 0, 0, 0]), rubber: vsurf(0x121212, [0.88, 0, 0, 0]),
  chrome: vsurf(0xe4e8ec, [0.1, 1, 0.3, 0]), alu: vsurf(0xd2d7dd, [0.3, 0.85, 0.6, 0]), steel: vsurf(0x3a3e44, [0.45, 0.6, 0.2, 0]),
  head: vsurf(0xa9b3bd, [0.05, 0.3, 1, 0], 0xfff1d8, 1.1, 0), drl: vsurf(0xf4f6f8, [0.08, 0, 1, 0], 0xeaf4ff, 1.6, 0),
  tail: vsurf(0x7a0a0a, [0.08, 0, 1, 0], 0xff2616, 1, 1), rev: vsurf(0xd8d8d8, [0.08, 0, 1, 0]),
  amber: vsurf(0xc77a12, [0.1, 0, 1, 0], 0xff9a1a, 0.4, 1), sign: vsurf(0xfff4c8, [0.3, 0, 0.5, 0], 0xffe9a8, 1, 3),
  led: vsurf(0x111214, [0.3, 0, 0.5, 0], 0xff9a1a, 0.05, 2), mirror: vsurf(0xc9d4de, [0.02, 1, 0, 0]),
};
class VB {
  constructor() { this.P = []; this.N = []; this.C = []; this.M = []; this.E = []; this.I = []; }
  get n() { return this.P.length / 3; }
  v(x, y, z, nx, ny, nz, s) { this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(s.r, s.g, s.b); this.M.push(s.pbr[0], s.pbr[1], s.pbr[2], s.pbr[3]); this.E.push(s.e[0], s.e[1], s.e[2], s.e[3]); return this.n - 1; }
  // a quad a-b-c-d (any winding): the side whose face normal agrees with the vertex normals faces out
  quad(p, n, s) {
    if (vtriA(...p[0], ...p[1], ...p[2]) + vtriA(...p[0], ...p[2], ...p[3]) < 1e-9) return; // nothing to draw (and no NaN normals)
    const o = this.n;
    for (let k = 0; k < 4; k++) this.v(p[k][0], p[k][1], p[k][2], n[k][0], n[k][1], n[k][2], s);
    _vA.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]); _vB.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    _vC.crossVectors(_vA, _vB);
    const fl = _vC.x * (n[0][0] + n[2][0]) + _vC.y * (n[0][1] + n[2][1]) + _vC.z * (n[0][2] + n[2][2]) < 0;
    if (fl) this.I.push(o, o + 3, o + 1, o + 1, o + 3, o + 2); else this.I.push(o, o + 1, o + 3, o + 1, o + 2, o + 3);
  }
  // any BufferGeometry placed by m (Matrix4), one surface
  add(g, m, s) {
    const P = g.attributes.position, N = g.attributes.normal, o = this.n, i0 = this.I.length;
    _nm3.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) { _vA.fromBufferAttribute(P, i).applyMatrix4(m); _vB.fromBufferAttribute(N, i).applyMatrix3(_nm3).normalize(); this.v(_vA.x, _vA.y, _vA.z, _vB.x, _vB.y, _vB.z, s); }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.I.push(o + g.index.getX(i)); else for (let i = 0; i < P.count; i++) this.I.push(o + i);
    if (m.determinant() < 0) for (let k = i0; k < this.I.length; k += 3) { const t = this.I[k + 1]; this.I[k + 1] = this.I[k + 2]; this.I[k + 2] = t; }
    return this;
  }
  // a geometry built by VB (keeps its own colour / pbr / emission), placed by m
  addG(g, m) {
    const o = this.n, C = g.attributes.color.array, Pb = g.attributes.aPbr.array, Em = g.attributes.aEmi.array, s = { r: 0, g: 0, b: 0, pbr: [0, 0, 0, 0], e: [0, 0, 0, 0] };
    this.add(g, m, s);
    for (let i = 0, n = g.attributes.position.count; i < n; i++) { for (let k = 0; k < 3; k++) this.C[(o + i) * 3 + k] = C[i * 3 + k]; for (let k = 0; k < 4; k++) { this.M[(o + i) * 4 + k] = Pb[i * 4 + k]; this.E[(o + i) * 4 + k] = Em[i * 4 + k]; } }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aPbr', new THREE.Float32BufferAttribute(this.M, 4));
    g.setAttribute('aEmi', new THREE.Float32BufferAttribute(this.E, 4)); g.setIndex(this.I);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const MXq = new THREE.Quaternion(), MXe = new THREE.Euler();
const vmx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new V3(x, y, z), MXq.setFromEuler(MXe.set(rx, ry, rz)), new V3(sx, sy, sz));
// rounded box (three's RoundedBoxGeometry trick: an odd-segment unit box whose vertices snap to the corner arcs), cached
const RBOX = new Map();
function rboxGeo(w, h, d, r, seg = 2) {
  r = Math.max(0.001, Math.min(r, w / 2, h / 2, d / 2));
  const key = [w, h, d, r, seg].map((v) => v.toFixed(3)).join();
  let g = RBOX.get(key);
  if (g) return g;
  const s = seg * 2 + 1, b = new THREE.BoxGeometry(1, 1, 1, s, s, s).toNonIndexed(), P = b.attributes.position.array, N = b.attributes.normal.array, hs = 0.5 / s;
  const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2], sx = Math.sign(x), sy = Math.sign(y), sz = Math.sign(z);
    _vA.set(x - sx * hs, y - sy * hs, z - sz * hs).normalize();
    P[i] = bx * sx + _vA.x * r; P[i + 1] = by * sy + _vA.y * r; P[i + 2] = bz * sz + _vA.z * r; N[i] = _vA.x; N[i + 1] = _vA.y; N[i + 2] = _vA.z;
  }
  b.deleteAttribute('uv'); RBOX.set(key, b);
  return b;
}
const CYL = new Map();
function cylGeo(rt, vrb, h, n = 12, open = false) { const k = [rt, vrb, h, n, open].join(); let g = CYL.get(k); if (!g) CYL.set(k, g = new THREE.CylinderGeometry(rt, vrb, h, n, 1, open)); return g; }
const SPH = new Map();
function sphGeo(r, n = 10) { const k = r + ',' + n; let g = SPH.get(k); if (!g) SPH.set(k, g = new THREE.SphereGeometry(r, n, Math.max(4, n >> 1))); return g; }
// rounded box part at (x,y,z) with rotation (rx, ry, rz)
const vrbF = (...a) => vrb(...a), vtubesF = (...a) => vtubes(...a);
function vrb(vb, s, x, y, z, w, h, d, r = 0.04, rx = 0, ry = 0, rz = 0, seg = 1) { vb.add(rboxGeo(w, h, d, r, seg), vmx(x, y, z, rx, ry, rz), s); return vb; }
// a vtube between two points
function vtube(vb, s, a, b, r, n = 8) {
  _vA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _vA.length(); if (L < 1e-4) return vb;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, _vA.clone().normalize());
  vb.add(cylGeo(r, r, L, n, true), new THREE.Matrix4().compose(new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new V3(1, 1, 1)), s);
  return vb;
}
// a bent vtube through points (spheres hide the joints)
function vtubes(vb, s, pts, r, n = 8) { for (let i = 0; i < pts.length - 1; i++) vtube(vb, s, pts[i], pts[i + 1], r, n); for (let i = 1; i < pts.length - 1; i++) vb.add(sphGeo(r, n), vmx(...pts[i]), s); return vb; }

/* ---------------- lofted car body ----------------
   Stations run along z (rear → front); each carries a half cross-section (x ≥ 0) from the underside centre round the sill,
   up the flank, over the shoulder and up the greenhouse to the roof centre. Where the top meets the beltline (bonnet, boot)
   the greenhouse collapses. The plan view closes both ends with a superellipse, so the nose / tail faces are part of the
   same grid, and the wheel arches lift the sill. Each quad is dressed by what it is (tag + position): paint, glass, lamps… */
// monotone cubic through [[z, v], …] (Fritsch–Carlson: no overshoot at the windscreen's kinks)
function monoCurve(P) {
  const n = P.length, X = P.map((p) => p[0]), Y = P.map((p) => p[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (z) => {
    if (z <= X[0]) return Y[0]; if (z >= X[n - 1]) return Y[n - 1];
    let i = 0; while (X[i + 1] < z) i++;
    const h = X[i + 1] - X[i], t = (z - X[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// the section's pieces: [tag, samples]; corners are quadratic Béziers clamped to half their edges (collapsed parts stay tidy)
// corners: A underside centre, B sill (vrb), M widest point (rm), K the shoulder crease (rk), C beltline (rs), D roof rail (rr), E roof centre
const SEC = [2, 3, 3, 2, 2, 2, 2, 3, 4, 3, 5], SEC_LO = [1, 2, 2, 1, 1, 1, 1, 2, 2, 2, 3];
const SEC_TAG = ['u', 'k', 's', 's', 'm', 'm', 'm', 'h', 'g', 'r', 't'];
function section(o, lo, X, Y, T) {
  const hw = o.hw, bot = o.bot, belt = o.belt, top = o.top, g = o.g, S = o.S;
  const ins = Math.min(S.ins, hw), tw = Math.max(0, hw - ins - S.tumble * g);
  const ym = bot + (belt - bot) * S.mk, [kb, kt] = S.crease || [0, 0.5];
  const C = [[0, bot, 0], [hw * (1 - (S.tuck ?? 0.03)), bot, S.rb], [hw, ym, S.rm], [hw - ins * kt + kb * Math.min(1, hw / 0.3), ym + (belt - ym) * kt, 0.025], [hw - ins, belt, S.rs], [tw, top, S.rr * (0.4 + 0.6 * g) + 0.02], [0, top + S.crown * (0.35 + 0.65 * g), 0]];
  const T1 = [], T2 = [], nc = C.length - 1;
  for (let i = 1; i < nc; i++) {
    const [px, py] = C[i - 1], [cx, cy, r] = C[i], [nx, ny] = C[i + 1], l1 = hyp(px - cx, py - cy), l2 = hyp(nx - cx, ny - cy);
    const t = Math.min(r, l1 * 0.5, l2 * 0.5);
    T1[i] = l1 > 1e-6 ? [cx + (px - cx) * t / l1, cy + (py - cy) * t / l1] : [cx, cy];
    T2[i] = l2 > 1e-6 ? [cx + (nx - cx) * t / l2, cy + (ny - cy) * t / l2] : [cx, cy];
  }
  const sec = lo ? SEC_LO : SEC;
  const line = (a, b, n, tag) => { for (let k = 0; k < n; k++) { const u = k / n; X.push(a[0] + (b[0] - a[0]) * u); Y.push(a[1] + (b[1] - a[1]) * u); T.push(tag); } };
  const bez = (i, n, tag) => { const a = T1[i], c = C[i], b = T2[i]; for (let k = 0; k < n; k++) { const u = k / n, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u; X.push(w0 * a[0] + w1 * c[0] + w2 * b[0]); Y.push(w0 * a[1] + w1 * c[1] + w2 * b[1]); T.push(tag); } };
  // line to the first corner, then corner / line / corner … / line to the roof centre
  line(C[0], T1[1], sec[0], SEC_TAG[0]);
  for (let i = 1; i < nc; i++) { bez(i, sec[i * 2 - 1], SEC_TAG[i * 2 - 1]); line(T2[i], i + 1 < nc ? T1[i + 1] : C[nc], sec[i * 2], SEC_TAG[i * 2]); }
  X.push(C[nc][0]); Y.push(C[nc][1]); T.push('t');
}
// the body's shape functions (also used to place mirrors, handles, plates, decals)
function loftShape(S) {
  if (S._f) return S._f;
  const L = S.L, H0 = S.W / 2, zr = -L / 2, zf = L / 2, [bR, pR] = S.tail, [bF, pF] = S.nose;
  const fTop = monoCurve(S.top), fBelt = monoCurve(S.belt), fBot = monoCurve(S.bot);
  const hw = (z) => {
    let fl = 0; if (S.flare) { for (const a of S.axles) fl = Math.max(fl, Math.exp(-(((z - a[0]) / (a[1] + 0.5)) ** 4))); fl = S.flare * (1 - fl); }
    let h = H0 * (1 - (S.taper || 0) * (2 * z / L) ** 2 - fl);
    if (z > zf - bF) h *= Math.pow(Math.max(0, 1 - Math.min(1, (z - (zf - bF)) / bF) ** pF), 1 / pF);
    else if (z < zr + bR) h *= Math.pow(Math.max(0, 1 - Math.min(1, (zr + bR - z) / bR) ** pR), 1 / pR);
    return h;
  };
  const bot = (z) => { let b = fBot(z); for (const a of S.axles) { const d = Math.abs(z - a[0]), R = a[1] + (S.arch || 0.07); if (d < R) b = Math.max(b, a[1] + Math.sqrt(R * R - d * d) * (S.archK || 1)); } return b; };
  const top = (z) => fTop(z), belt = (z) => Math.min(fBelt(z), fTop(z));
  return (S._f = { hw, bot, top, belt, zr, zf, bR, bF, pR, pF });
}
function loftBody(vb, S, lo, brake) {
  const F = loftShape(S), { zr, zf, bR, bF, pR, pF } = F;
  // stations: superellipse ends, an even run between, and every edge a zone needs (glass, seams, arches)
  const Zs = [], nE = lo ? 4 : S.nE || 7;
  for (let k = 0; k <= nE; k++) { const u = Math.pow(Math.sin((k / nE) * Math.PI / 2), 2 / pR); Zs.push(zr + bR - bR * u); }
  for (let k = 0; k <= nE; k++) { const u = Math.pow(Math.sin((k / nE) * Math.PI / 2), 2 / pF); Zs.push(zf - bF + bF * u); }
  const dz = (S.dz || 0.14) * (lo ? 2.2 : 1);
  for (let z = zr + bR; z < zf - bF; z += dz) Zs.push(z);
  const G = S.glass || {};
  for (const r of [G.ws, G.rw, G.side, G.bp, G.roof, S.keys]) if (r) for (const z of r.flat()) Zs.push(z);
  if (!lo) for (const z of S.seams || []) Zs.push(z - 0.006, z + 0.006);
  for (const a of S.axles) { const R = a[1] + (S.arch || 0.07), n = lo ? 5 : 9; for (let k = 0; k <= n; k++) Zs.push(a[0] + R * Math.cos((k / n) * Math.PI)); Zs.push(a[0] + R + 0.02, a[0] - R - 0.02); }
  Zs.sort((a, b) => a - b);
  const Z = [];
  for (const z of Zs) if (z >= zr - 1e-6 && z <= zf + 1e-6 && (!Z.length || z - Z[Z.length - 1] > 0.004)) Z.push(clamp(z, zr, zf));
  if (Z[Z.length - 1] < zf - 1e-4) Z.push(zf);
  // the grid (right half) + per-station data
  const PX = [], PY = [], TG = [], ST = [];
  for (const z of Z) {
    const top = F.top(z), belt = F.belt(z), o = { S, hw: F.hw(z), top, belt, bot: Math.min(F.bot(z), belt - 0.04), g: clamp((top - belt) / 0.22, 0, 1) };
    const X = [], Y = [], T = []; section(o, lo, X, Y, T);
    PX.push(X); PY.push(Y); TG.push(T); ST.push(o);
  }
  const nS = Z.length, nC = PX[0].length, NX = [], NY = [], NZ = [];
  for (let i = 0; i < nS; i++) { NX.push(new Float32Array(nC)); NY.push(new Float32Array(nC)); NZ.push(new Float32Array(nC)); }
  // area-weighted normals: the right half's faces; the seam (x = 0) takes the mirrored half's share (x cancels)
  const acc = (i, j, x, y, z) => { NX[i][j] += x; NY[i][j] += y; NZ[i][j] += z; };
  for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nC - 1; j++) {
    const ax = PX[i][j], ay = PY[i][j], az = Z[i], bx = PX[i][j + 1], by = PY[i][j + 1], bz = Z[i], cx = PX[i + 1][j], cy = PY[i + 1][j], cz = Z[i + 1], dx = PX[i + 1][j + 1], dy = PY[i + 1][j + 1], dzz = Z[i + 1];
    // (a, b, c) and (b, d, c): cross(ab, ac) points out of the right half
    for (const [p, q, r, ids] of [[[ax, ay, az], [bx, by, bz], [cx, cy, cz], [[i, j], [i, j + 1], [i + 1, j]]], [[bx, by, bz], [dx, dy, dzz], [cx, cy, cz], [[i, j + 1], [i + 1, j + 1], [i + 1, j]]]]) {
      const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const [a, b] of ids) acc(a, b, nx, ny, nz);
    }
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < nC; j++) {
    if (PX[i][j] < 1e-5) NX[i][j] = 0;
    let l = hyp(NX[i][j], NY[i][j], NZ[i][j]);
    if (l < 1e-9) { NX[i][j] = 0; NY[i][j] = j < nC / 2 ? -1 : 1; NZ[i][j] = 0; l = 1; }
    NX[i][j] /= l; NY[i][j] /= l; NZ[i][j] /= l;
  }
  const p = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], n = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], q = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, tag: '', st: null, S, F };
  const cell = [[0, 0], [0, 1], [1, 1], [1, 0]];
  for (let i = 0; i < nS - 1; i++) for (let j = 0; j < nC - 1; j++) {
    // skip collapsed quads (the greenhouse over the bonnet, the pinched tips)
    if (vtriA(PX[i][j], PY[i][j], Z[i], PX[i][j + 1], PY[i][j + 1], Z[i], PX[i + 1][j], PY[i + 1][j], Z[i + 1]) < 1e-7 &&
      vtriA(PX[i][j + 1], PY[i][j + 1], Z[i], PX[i + 1][j + 1], PY[i + 1][j + 1], Z[i + 1], PX[i + 1][j], PY[i + 1][j], Z[i + 1]) < 1e-7) continue;
    for (const side of [1, -1]) {
      let cx = 0, cy = 0, cz = 0, mx_ = 0, my = 0, mz = 0;
      for (let k = 0; k < 4; k++) {
        const ii = i + cell[k][0], jj = j + cell[k][1];
        p[k][0] = PX[ii][jj] * side; p[k][1] = PY[ii][jj]; p[k][2] = Z[ii];
        n[k][0] = NX[ii][jj] * side; n[k][1] = NY[ii][jj]; n[k][2] = NZ[ii][jj];
        cx += p[k][0]; cy += p[k][1]; cz += p[k][2]; mx_ += n[k][0]; my += n[k][1]; mz += n[k][2];
      }
      const ml = hyp(mx_, my, mz) || 1;
      q.x = cx / 4; q.y = cy / 4; q.z = cz / 4; q.nx = mx_ / ml; q.ny = my / ml; q.nz = mz / ml; q.tag = TG[i][j]; q.st = ST[i]; q.side = side;
      const s = bodySurf(S, q);
      vb.quad(p, n, s);
      // the tail lamps again, a hair proud: the brake-light overlay
      if (brake && s.brake) { for (let k = 0; k < 4; k++) { p[k][0] += n[k][0] * 0.004; p[k][1] += n[k][1] * 0.004; p[k][2] += n[k][2] * 0.004; } brake.quad(p, n, SF.tail); }
    }
  }
  return F;
}
const vtriA = (ax, ay, az, bx, by, bz, cx, cy, cz) => { const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; return hyp(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx); };
// z inside a range [a, b] or any of a list of ranges
const vinR = (z, r) => !!r && (typeof r[0] === 'number' ? z > r[0] && z < r[1] : r.some((k) => z > k[0] && z < k[1]));
// what a body quad is made of
function bodySurf(S, q) {
  const t = q.tag, z = q.z, G = S.glass || {};
  if (S.zone) { const r = S.zone(q); if (r) return r; }
  if (t === 'u') return SF.under;
  if (S.seams && (t === 'k' || t === 's' || t === 'm' || t === 'h')) for (const sz of S.seams) if (Math.abs(z - sz) < 0.0062 && q.y > q.st.bot + 0.06) return SF.seam;
  const inSide = vinR(z, G.side), inBp = vinR(z, G.bp);
  if (t === 'g') return inSide && !inBp ? SF.glass : inBp ? SF.black : (S.liv && S.liv(q)) || S.paint;
  if (t === 't') {
    if ((G.ws && z > G.ws[0] && z < G.ws[1]) || (G.rw && z > G.rw[0] && z < G.rw[1])) return (G.ws && (Math.abs(z - G.ws[0]) < 0.05 || Math.abs(z - G.ws[1]) < 0.04)) || (G.rw && (Math.abs(z - G.rw[0]) < 0.04 || Math.abs(z - G.rw[1]) < 0.05)) ? SF.black : SF.glass;
    if (G.roof && z > G.roof[0] && z < G.roof[1]) return SF.glass;
    return S.roofS && q.st.g > 0.5 ? S.roofS : (S.liv && S.liv(q)) || S.paint;
  }
  if (t === 'r') return S.railS || S.paint;
  if (t === 'h' && inSide && q.y > q.st.belt - 0.03 && q.st.g > 0.3) return SF.black;
  if (S.lowS && q.y < S.lowS[0]) return S.lowS[1];
  return (S.liv && S.liv(q)) || S.paint;
}

/* ---------------- ribbons: lamps, grilles, trims that hug the body ----------------
   flankX = the body's outer surface at station z and height y (the section walked up from the sill). A face vribbon runs
   round the nose / tail at a height band, parametrised by plan arc length from the centre line (so a lamp wraps the
   corner); a flank vribbon runs along z. Each is pushed d metres off the surface, so parts stack: housing → lens → DRL. */
function stationOf(S, F, z) { const top = F.top(z), belt = F.belt(z); return { S, hw: F.hw(z), top, belt, bot: Math.min(F.bot(z), belt - 0.04), g: clamp((top - belt) / 0.22, 0, 1) }; }
function flankX(S, F, z, y) {
  const o = stationOf(S, F, z); if (y < o.bot || y > o.top) return null;
  const X = [], Y = [], T = []; section(o, false, X, Y, T);
  for (let j = 1; j < X.length; j++) if (T[j - 1] !== 'u' && Y[j] >= y && Y[j - 1] <= y) { const d = Y[j] - Y[j - 1]; return X[j - 1] + (X[j] - X[j - 1]) * (d > 1e-9 ? (y - Y[j - 1]) / d : 0); }
  return null;
}
// the plan outline at height y from the end face's centre round the corner and `depth` back along the flank: arc length → [x, z]
const OUTL = new Map();
function outlineAt(S, F, y, end, depth = 0.8) {
  const key = S.key + y.toFixed(3) + end; let O = OUTL.get(key); if (O) return O;
  const b = end > 0 ? F.bF : F.bR, p = end > 0 ? F.pF : F.pR, z0 = end > 0 ? F.zf : F.zr, P = [];
  for (let k = 48; k >= 0; k--) { const z = z0 - end * (b - b * Math.pow(Math.sin((k / 48) * Math.PI / 2), 2 / p)), x = flankX(S, F, z, y); if (x !== null) P.push([x, z]); }
  for (let k = 1; k <= 16; k++) { const z = z0 - end * (b + depth * k / 16), x = flankX(S, F, z, y); if (x !== null) P.push([x, z]); }
  const L = [P.length ? P[0][0] : 0]; // arc length starts at the first point's x: as if the face ran flat to the centre line
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + hyp(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  O = { P, L, at(s, out) {
    const P = this.P, L = this.L; if (!P.length) return null;
    if (s <= L[0]) { out[0] = P[0][0]; out[1] = P[0][1]; return out; } // above the face at this height: hug the bonnet's edge
    let i = 1; while (i < L.length - 1 && L[i] < s) i++;
    const u = clamp((s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1); out[0] = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u; out[1] = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u; return out;
  } };
  OUTL.set(key, O);
  return O;
}
// a grid patch on the surface: pt(u, v) → [x, y, z] on the body (u, v ∈ [0,1]); pushed d along the outward normal; both sides unless one = true
const _o2 = [0, 0];
function vribbon(vb, pt, d, s, nu = 10, nv = 2, one = false) {
  const G = [];
  for (let i = 0; i <= nu; i++) { const row = []; for (let j = 0; j <= nv; j++) row.push(pt(i / nu, j / nv)); G.push(row); }
  if (G.some((r) => r.some((p) => !p))) return;
  const N = G.map((r, i) => r.map((p, j) => {
    const a = G[Math.min(nu, i + 1)][j], b = G[Math.max(0, i - 1)][j], c = G[i][Math.min(nv, j + 1)], e = G[i][Math.max(0, j - 1)];
    const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - e[0], vy = c[1] - e[1], vz = c[2] - e[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = hyp(nx, ny, nz);
    if (l < 1e-9) { nx = p[0] * 0.5; ny = 0; nz = Math.sign(p[2]) || 1; l = hyp(nx, nz); } // collapsed rows (a lamp tip hugging the bonnet edge)
    nx /= l; ny /= l; nz /= l;
    if (nx * p[0] + nz * p[2] * 0.25 + ny * (p[1] - 0.9) * 0.2 < 0) { nx = -nx; ny = -ny; nz = -nz; } // outward: away from the car's middle
    return [nx, ny, nz];
  }));
  for (const sd of one ? [1] : [1, -1]) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const P = [], Q = [];
    for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) { const p = G[a][b], n = N[a][b]; P.push([(p[0] + n[0] * d) * sd, p[1] + n[1] * d, p[2] + n[2] * d]); Q.push([n[0] * sd, n[1], n[2]]); }
    vb.quad(P, Q, s);
  }
}
// face ribbon: arc length s0..s1 from the centre line, heights y0..y1 (numbers or f(u)), round end 1 (nose) / −1 (tail)
function faceRib(vb, S, F, end, s0, s1, y0, y1, d, sf, nu = 10, nv = 2, one = false) {
  const f = (v) => (typeof v === 'function' ? v : () => v);
  const Y0 = f(y0), Y1 = f(y1);
  vribbon(vb, (u, v) => { const y = lerp(Y0(u), Y1(u), v), O = outlineAt(S, F, +y.toFixed(3), end); const r = O.at(lerp(s0, s1, u), _o2); return r ? [r[0], y, r[1]] : null; }, d, sf, nu, nv, one);
}
// flank ribbon: z0..z1 along the side, heights y0..y1 (numbers or f(u))
function flankRib(vb, S, F, z0, z1, y0, y1, d, sf, nu = 8, nv = 2) {
  const f = (v) => (typeof v === 'function' ? v : () => v), Y0 = f(y0), Y1 = f(y1);
  vribbon(vb, (u, v) => { const z = lerp(z0, z1, u), y = lerp(Y0(u), Y1(u), v), x = flankX(S, F, z, y); return x === null ? null : [x, y, z]; }, d, sf, nu, nv);
}

/* ---------------- kinds ---------------- */
const TAIL_B = Object.assign({}, SF.tail, { brake: true });
const CAR_SPEC = {};
CAR_SPEC.sedan = {
  L: 4.6, W: 1.96, H: 1.47, ins: 0.05, tumble: 0.2, crown: 0.05, mk: 0.52, tuck: 0.045, rb: 0.12, rm: 0.4, rs: 0.07, rr: 0.15, taper: 0.03, flare: 0.022, crease: [0.014, 0.6],
  nose: [0.28, 2.9], tail: [0.24, 3.1], dz: 0.14,
  top: [[-2.3, 0.8], [-2.2, 0.95], [-2.02, 1.02], [-1.32, 1.05], [-0.62, 1.43], [-0.3, 1.47], [0.3, 1.47], [1.2, 1.03], [1.8, 0.93], [2.1, 0.84], [2.24, 0.74], [2.3, 0.62]],
  belt: [[-2.3, 0.8], [-2.2, 0.95], [-2.02, 1.01], [-1.32, 1.02], [0, 1.0], [1.2, 0.99], [1.8, 0.93], [2.1, 0.84], [2.24, 0.74], [2.3, 0.62]],
  bot: [[-2.3, 0.44], [-2.05, 0.3], [2.0, 0.28], [2.3, 0.38]],
  axles: [[1.4, 0.34], [-1.36, 0.34]], tyreW: 0.24, rim: 'alloy',
  glass: { ws: [0.3, 1.2], rw: [-1.32, -0.62], side: [-1.2, 1.02], bp: [-0.13, -0.01] }, seams: [1.08, -0.07, -1.14],
  lamp: { head: { s: [0.46, 1.08], y0: (u) => 0.56 + 0.1 * u, y1: (u) => 0.64 + 0.1 * u }, tail: { s: [0.34, 1.06], y0: 0.76, y1: (u) => 0.87 + 0.03 * u }, grille: { s: 0.4, y: [0.42, 0.56], slats: 3 }, intake: { s: 0.62, y: [0.3, 0.39] }, diff: { s: 0.66, y: [0.3, 0.4] }, fog: { s: [0.66, 0.76], y: [0.32, 0.37] }, refl: { s: [0.78, 0.9], y: [0.42, 0.45] } },
  plate: { f: [0.52, 0], b: [0.62, 0] }, mirror: [0.98, 1.1], handles: [0.86, [0.18, -0.89]], exhaust: [[-0.5, 0.34]],
};
CAR_SPEC.taxi = Object.assign({}, CAR_SPEC.sedan, { sign: true, livery: 'taxi' });
CAR_SPEC.police = Object.assign({}, CAR_SPEC.sedan, { L: 4.7, bar: true, livery: 'police' });
CAR_SPEC.hatch = {
  L: 4.1, W: 1.9, H: 1.52, ins: 0.045, tumble: 0.18, crown: 0.05, mk: 0.52, tuck: 0.04, rb: 0.12, rm: 0.36, rs: 0.07, rr: 0.15, taper: 0.03, flare: 0.025, crease: [0.012, 0.55],
  nose: [0.28, 3], tail: [0.16, 3.6], dz: 0.14,
  top: [[-2.05, 0.9], [-2.0, 1.12], [-1.9, 1.4], [-1.62, 1.5], [0.2, 1.52], [1.0, 1.04], [1.6, 0.92], [1.9, 0.84], [2.0, 0.76], [2.05, 0.66]],
  belt: [[-2.05, 0.9], [-2.0, 1.0], [-1.6, 1.02], [0, 1.0], [1.0, 0.98], [1.6, 0.92], [1.9, 0.84], [2.0, 0.76], [2.05, 0.66]],
  bot: [[-2.05, 0.42], [-1.85, 0.3], [1.75, 0.28], [2.05, 0.38]],
  axles: [[1.3, 0.32], [-1.3, 0.32]], tyreW: 0.22, rim: 'alloy',
  glass: { ws: [0.2, 1.0], rw: [-1.97, -1.64], side: [-1.72, 0.84], bp: [-0.3, -0.18] }, seams: [0.9, -0.24, -1.75], keys: [-1.72],
  lamp: { head: { s: [0.44, 1.0], y0: (u) => 0.58 + 0.08 * u, y1: (u) => 0.66 + 0.08 * u }, tail: { s: [0.58, 1.0], y0: 0.86, y1: (u) => 1.0 + 0.04 * u }, grille: { s: 0.36, y: [0.46, 0.6], slats: 2, frame: SF.black }, intake: { s: 0.56, y: [0.3, 0.4] }, diff: { s: 0.6, y: [0.32, 0.42] } },
  plate: { f: [0.52, 0], b: [0.66, 0] }, mirror: [0.8, 1.08], handles: [0.86, [0.02, -1.5]], exhaust: [[0.5, 0.32]],
};
CAR_SPEC.suv = {
  L: 4.75, W: 2.02, H: 1.76, ins: 0.05, tumble: 0.16, crown: 0.04, mk: 0.55, tuck: 0.04, rb: 0.1, rm: 0.34, rs: 0.08, rr: 0.14, taper: 0.02, flare: 0.02, crease: [0.014, 0.5],
  nose: [0.28, 3.4], tail: [0.2, 3.6], dz: 0.15, arch: 0.09,
  top: [[-2.375, 1.06], [-2.3, 1.3], [-2.2, 1.66], [-1.9, 1.74], [0.2, 1.76], [1.0, 1.24], [1.7, 1.14], [2.2, 1.06], [2.32, 0.98], [2.375, 0.86]],
  belt: [[-2.375, 1.06], [-2.3, 1.18], [-1.9, 1.2], [0, 1.18], [1.0, 1.18], [1.7, 1.14], [2.2, 1.06], [2.32, 0.98], [2.375, 0.86]],
  bot: [[-2.375, 0.56], [-2.0, 0.42], [1.9, 0.42], [2.375, 0.52]],
  axles: [[1.45, 0.39], [-1.42, 0.39]], tyreW: 0.27, rim: 'alloy',
  glass: { ws: [0.2, 1.0], rw: [-2.24, -1.92], side: [-2.02, 0.86], bp: [[-0.2, -0.07], [-1.3, -1.2]] }, seams: [0.92, -0.14, -1.25], keys: [-1.3, -1.2],
  lamp: { head: { s: [0.52, 1.1], y0: (u) => 0.76 + 0.08 * u, y1: (u) => 0.86 + 0.08 * u }, tail: { s: [0.56, 1.1], y0: 1.02, y1: 1.18 }, grille: { s: 0.5, y: [0.56, 0.8], slats: 4 }, intake: { s: 0.66, y: [0.44, 0.53] }, diff: { s: 0.72, y: [0.46, 0.6] }, fog: { s: [0.68, 0.8], y: [0.47, 0.53] } },
  plate: { f: [0.66, 0], b: [0.8, 0] }, mirror: [1.18, 1.3], handles: [1.04, [0.1, -1.0]], exhaust: [[-0.55, 0.46]], rails: true, lowS: [0.56, SF.plastic], skirt: 0.12,
};
CAR_SPEC.legal = Object.assign({}, CAR_SPEC.suv, { L: 4.8, bar: true, livery: 'legal', rails: false });
CAR_SPEC.sport = {
  L: 4.5, W: 2.02, H: 1.2, ins: 0.06, tumble: 0.26, crown: 0.05, mk: 0.42, tuck: 0.05, rb: 0.1, rm: 0.3, rs: 0.1, rr: 0.18, taper: 0.05, flare: 0.045, crease: [0.016, 0.5],
  nose: [0.34, 2.6], tail: [0.22, 3.2], dz: 0.13,
  top: [[-2.25, 0.84], [-2.15, 0.94], [-1.7, 0.98], [-1.2, 1.0], [-0.55, 1.18], [0.1, 1.2], [0.85, 0.86], [1.5, 0.74], [2.1, 0.6], [2.25, 0.46]],
  belt: [[-2.25, 0.84], [-2.15, 0.93], [-1.2, 0.92], [0, 0.86], [0.85, 0.83], [1.5, 0.74], [2.1, 0.6], [2.25, 0.46]],
  bot: [[-2.25, 0.36], [-1.9, 0.2], [1.9, 0.18], [2.25, 0.26]],
  axles: [[1.38, 0.35], [-1.36, 0.36]], tyreW: 0.29, rim: 'sport', arch: 0.05,
  glass: { ws: [0.1, 0.85], rw: [-1.1, -0.6], side: [-0.95, 0.72] }, seams: [0.78, -0.62],
  lamp: { head: { s: [0.52, 1.1], y0: (u) => 0.44 + 0.08 * u, y1: (u) => 0.5 + 0.08 * u }, tail: { s: [0.2, 1.05], y0: 0.8, y1: 0.86 }, intake: { s: 0.8, y: [0.27, 0.4] }, diff: { s: 0.84, y: [0.26, 0.48] } },
  plate: { f: [0.32, 0], b: [0.56, 0] }, mirror: [0.72, 0.9], handles: [0.74, [-0.4]], exhaust: [[-0.3, 0.3], [0.3, 0.3]], wing: true, roofS: SF.black, railS: SF.black, skirt: 0.1,
};
CAR_SPEC.van = {
  L: 5.4, W: 2.1, H: 2.52, ins: 0.03, tumble: 0.06, crown: 0.04, mk: 0.5, bulge: 0.008, rb: 0.1, rm: 0.4, rs: 0.1, rr: 0.16, taper: 0.01,
  nose: [0.26, 3.4], tail: [0.1, 5], dz: 0.16,
  top: [[-2.7, 2.2], [-2.66, 2.46], [-2.5, 2.52], [1.5, 2.52], [2.05, 1.32], [2.45, 1.2], [2.62, 1.12], [2.7, 1.02]],
  belt: [[-2.7, 2.2], [-2.66, 2.3], [-2.5, 2.3], [0.8, 2.3], [1.0, 1.24], [2.05, 1.22], [2.45, 1.2], [2.62, 1.12], [2.7, 1.02]],
  bot: [[-2.7, 0.46], [-2.4, 0.34], [2.3, 0.34], [2.7, 0.44]],
  axles: [[1.85, 0.37], [-1.75, 0.37]], tyreW: 0.24, rim: 'steel',
  glass: { ws: [1.52, 2.03], side: [0.9, 1.98] }, seams: [0.92, 0.08, -1.2], keys: [0.9, 1.0],
  lamp: { head: { s: [0.58, 1.1], y0: 0.8, y1: (u) => 0.95 + 0.04 * u }, tail: { s: [0.9, 1.1], y0: 0.8, y1: 1.36 }, grille: { s: 0.54, y: [0.56, 0.78], slats: 3, frame: SF.black }, intake: { s: 0.8, y: [0.38, 0.5] } },
  plate: { f: [0.54, 0], b: [0.62, 0] }, mirror: [1.62, 1.35], handles: [1.2, [1.1]], livery: 'van',
  // the rear doors' windows
  zone: (q) => (q.nz < -0.6 && q.z < -2.6 && q.y > 1.45 && q.y < 2.15 && Math.abs(q.x) > 0.08 && Math.abs(q.x) < 0.88 ? SF.glass : null),
};
CAR_SPEC.bus = {
  L: 12, W: 2.5, H: 3.15, ins: 0.02, tumble: 0.05, crown: 0.05, mk: 0.45, bulge: 0.004, rb: 0.12, rm: 0.4, rs: 0.1, rr: 0.18, taper: 0,
  nose: [0.14, 4.5], tail: [0.12, 4.5], dz: 0.3,
  top: [[-6, 2.95], [-5.95, 3.1], [-5.8, 3.15], [5.8, 3.15], [5.95, 3.1], [6, 2.95]],
  belt: [[-6, 2.95], [-5.95, 3.0], [-5.8, 1.1], [5.8, 1.1], [5.95, 3.0], [6, 2.95]],
  bot: [[-6, 0.46], [-5.6, 0.34], [5.6, 0.34], [6, 0.4]],
  axles: [[3.7, 0.5], [-2.7, 0.5]], tyreW: 0.3, rim: 'steel',
  glass: {}, keys: [-5.8, 5.8, 4.6, 5.5, 3.0, -0.4, 0.6, -4.5], livery: 'bus',
};
CAR_SPEC.bus.zone = (q) => {
  const ax = Math.abs(q.x), z = q.z, y = q.y, t = q.tag;
  if (t === 'u') return SF.under;
  if (q.nz > 0.6 && z > 5.9) { // the front face: windscreen, LED route sign, lamps, bumper
    if (y > 2.78 && y < 3.02 && ax < 0.95) return SF.led;
    if (y > 1.12 && y < 2.74 && ax < q.st.hw - 0.06) return SF.glass;
    if (y > 0.62 && y < 0.8 && ax > 0.72) return SF.head;
    if (y < 0.5) return SF.plastic;
  }
  if (q.nz < -0.6 && z < -5.9) {
    if (y > 1.6 && y < 2.7 && ax < q.st.hw - 0.1) return SF.glass;
    if (y > 0.7 && y < 1.2 && ax > 0.8) return TAIL_B;
    if (y < 0.5) return SF.plastic;
  }
  // the window band: glass with black pillars every 1.3 m; the doors on the kerb side (−x) are glazed to the floor
  const door = q.x < 0 && ((z > 4.6 && z < 5.5) || (z > -0.4 && z < 0.6));
  if (door && y > 0.42 && y < 2.72) return Math.abs(z - (z > 2 ? 5.05 : 0.1)) < 0.03 || y < 0.5 ? SF.black : SF.glass;
  if (y > 1.2 && y < 2.72 && z > -5.6 && z < 5.7 && ax > 1.0) { const u = ((z + 5.6) / 1.3) % 1; return u < 0.07 ? SF.black : SF.glass; }
  if (y > 1.1 && y < 1.2 && ax > 1.0) return SF.black;
  if (y > 2.72 || t === 't' || t === 'r') return BUS_WHITE;
  if (y < 0.62) return SF.plastic;
  return null;
};
const BUS_WHITE = vsurf(0xf1f2f0, [0.3, 0.05, 1, 0]);
// 共享单车 / 外卖电驴: vtube frames, built in bikeBody
CAR_SPEC.bike = { L: 1.75, W: 0.6, H: 1.15, axles: [[0.54, 0.34], [-0.54, 0.34]], tyreW: 0.05, rim: 'bike', twoWheel: true };
CAR_SPEC.ebike = { L: 1.8, W: 0.7, H: 1.28, axles: [[0.62, 0.26], [-0.62, 0.26]], tyreW: 0.09, rim: 'bike', twoWheel: true };

// liveries: the taxi / police paint splits are drawn by the car shader (carMat o.liv); a spec's liv(q) can still bake a surface
const TAXI_Y = vsurf(0xfad430, [0.3, 0.12, 1, 0]), LIVERY = {}; // the taxi's gold (= the shader's CAR_LIV 1 top colour)

/* ---------------- the cabin behind see-through glass: floor, door cards, headliner, pillars, seats, dash, wheel ----------------
   (hi body only, desktop; the far body keeps its opaque tinted glass). The window glass is split off into its own mesh
   (carGlassMat: tinted, reflective, see-through); everything here is opaque and part of the body mesh */
const CAB = { floor: vsurf(0x1c1d20, [0.95, 0, 0, 0]), door: vsurf(0x2b2c30, [0.85, 0, 0, 0]), roof: vsurf(0x8a8780, [0.9, 0, 0, 0]),
  seat: vsurf(0x303238, [0.8, 0, 0, 0]), dash: vsurf(0x17181b, [0.6, 0, 0.2, 0]), trim: vsurf(0x0d0e10, [0.5, 0.2, 0.3, 0]) };
function carCabin(vb, S, F) {
  const G = S.glass || {}; if (!G.side) return null;
  const zb = G.rw ? G.rw[0] : G.side[0], zf = G.ws ? G.ws[1] : G.side[1], zm = (zb + zf) / 2, W = S.W / 2;
  const floorY = Math.max(0.34, F.belt(zm) - 0.58), tyreIn = W - 0.035 - S.tyreW - 0.02;
  const inner = (z) => F.hw(z) - S.ins - 0.06, st = (z) => stationOf(S, F, z);
  // stations along the cabin (and every arch edge)
  const Zs = []; for (let z = zb + 0.04; z < zf; z += 0.12) Zs.push(z); Zs.push(zf);
  for (const a of S.axles) { const R = a[1] + (S.arch || 0.07); for (let k = 0; k <= 6; k++) { const z = a[0] + R * Math.cos((k / 6) * Math.PI); if (z > zb + 0.04 && z < zf) Zs.push(z); } }
  Zs.sort((a, b) => a - b);
  // lower cabin: floor → sill (over the wheel houses) → door card, both sides, facing in
  const sec = (z) => { const o = st(z), xd = inner(z), yb = Math.max(floorY, F.bot(z) + 0.06); return [[0, floorY], [Math.min(xd, tyreIn), floorY], [xd, yb], [xd, o.belt + 0.01]]; };
  const band = (za, zb2, A, B, surfs, up) => {
    for (let j = 0; j < A.length - 1; j++) for (const sd of [1, -1]) {
      const [x0, y0] = A[j], [x1, y1] = A[j + 1], [x2, y2] = B[j + 1], [x3, y3] = B[j];
      let nx = -(y1 - y0), ny = x1 - x0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; if (up) { nx = -nx; ny = -ny; }
      const n = [nx * sd, ny, 0];
      vb.quad([[x0 * sd, y0, za], [x1 * sd, y1, za], [x2 * sd, y2, zb2], [x3 * sd, y3, zb2]], [n, n, n, n], surfs[j]);
    }
  };
  for (let i = 0; i < Zs.length - 1; i++) band(Zs[i], Zs[i + 1], sec(Zs[i]), sec(Zs[i + 1]), [CAB.floor, CAB.floor, CAB.door], false);
  // end walls: firewall (front) / rear panel, floor to belt
  for (const [z, dir] of [[Zs[0], 1], [zf, -1]]) {
    const s = sec(z), xd = s[3][0], y1 = s[3][1];
    vb.quad([[-xd, floorY, z], [xd, floorY, z], [xd, y1, z], [-xd, y1, z]], Array(4).fill([0, 0, dir]), CAB.door);
  }
  // headliner under the opaque roof, and the pillars between the side windows
  const r0 = G.rw ? G.rw[1] : zb, r1 = G.ws ? G.ws[0] : zf;
  const roofSec = (z) => { const o = st(z), tw = Math.max(0.05, o.hw - S.ins - S.tumble * o.g - 0.04); return [[0, o.top + S.crown * (0.35 + 0.65 * o.g) - 0.05], [tw, o.top - 0.05]]; };
  for (let z = r0; z < r1 - 1e-3; z += 0.15) { const z2 = Math.min(r1, z + 0.15); band(z, z2, roofSec(z), roofSec(z2), [CAB.roof], true); }
  for (const b of G.bp ? (typeof G.bp[0] === 'number' ? [G.bp] : G.bp) : []) {
    const ps = (z) => { const o = st(z), tw = Math.max(0.05, o.hw - S.ins - S.tumble * o.g - 0.05); return [[tw, o.top - 0.05], [inner(z) + 0.02, o.belt]]; };
    band(b[0] - 0.03, b[1] + 0.03, ps(b[0] - 0.03), ps(b[1] + 0.03), [CAB.door], true);
  }
  // seats: the front pair just ahead of the B-pillar (or a metre behind the dash), a rear bench when there's room; heights fit the roof
  const zd = zf - 0.24, bp0 = G.bp ? (typeof G.bp[0] === 'number' ? G.bp : G.bp[0]) : null, zfs = bp0 ? (bp0[0] + bp0[1]) / 2 + 0.06 : Math.max(G.side[0] + 0.12, zd - 1.0);
  const xd0 = inner(zfs), xs = Math.min(0.38, xd0 * 0.43), cush = floorY + 0.25, k = clamp((F.top(zfs) - floorY - 0.1) / 0.95, 0.7, 1);
  const seat = (x, z, w) => {
    vrb(vb, CAB.seat, x, cush - 0.06, z + 0.26, w, 0.13, 0.48, 0.045);
    vrb(vb, CAB.seat, x, cush + 0.3 * k, z - 0.06, w - 0.02, 0.62 * k, 0.12, 0.045, -0.2);
    vrb(vb, CAB.seat, x, cush + 0.69 * k, z - 0.15, Math.min(0.26, w * 0.5), 0.17, 0.09, 0.035, -0.2);
  };
  seat(xs, zfs, 0.47); seat(-xs, zfs, 0.47);
  const zrs = Math.max(zb + 0.08, zfs - 1.0);
  if (zrs < zfs - 0.8) seat(0, zrs, Math.min(2 * inner(zrs) - 0.14, 1.3));
  // parcel shelf behind the rear bench (saloons: under the rear window)
  if (G.rw && zrs - zb > 0.15) vb.quad([[-inner(zb), F.belt(zb), zb], [inner(zb), F.belt(zb), zb], [inner(zrs), F.belt(zrs), zrs], [-inner(zrs), F.belt(zrs), zrs]], Array(4).fill([0, 1, 0]), CAB.floor);
  // dash under the windscreen, the wheel on the left (+x: 左舵)
  const dashTop = Math.min(F.belt(zd) + 0.02, F.top(Math.min(zf, zd + 0.21)) - 0.03);
  vrb(vb, CAB.dash, 0, dashTop - 0.1, zd, 2 * inner(zd) - 0.06, 0.2, 0.42, 0.06);
  vb.add(new THREE.TorusGeometry(0.17, 0.018, 6, 20), vmx(xs, dashTop - 0.04, zd - 0.32, -0.45), CAB.trim);
  vrb(vb, CAB.trim, xs, dashTop - 0.08, zd - 0.24, 0.05, 0.05, 0.2, 0.02, -0.45);
  return { zb, zf, zfs, xs, cush, k };
}
// window glass out of the hi body (triangles of SF.glass inside the cabin's z range) into a mesh of its own
function vbSplit(vb, keep) {
  const A = new VB(), B = new VB(), mp = [new Map(), new Map()];
  for (let t = 0; t < vb.I.length; t += 3) {
    const tri = [vb.I[t], vb.I[t + 1], vb.I[t + 2]], w = tri.every(keep) ? 1 : 0, D = w ? B : A, m = mp[w];
    for (const i of tri) {
      let j = m.get(i);
      if (j === undefined) { j = D.n; m.set(i, j); D.P.push(vb.P[i * 3], vb.P[i * 3 + 1], vb.P[i * 3 + 2]); D.N.push(vb.N[i * 3], vb.N[i * 3 + 1], vb.N[i * 3 + 2]); D.C.push(vb.C[i * 3], vb.C[i * 3 + 1], vb.C[i * 3 + 2]); for (let q = 0; q < 4; q++) { D.M.push(vb.M[i * 4 + q]); D.E.push(vb.E[i * 4 + q]); } }
      D.I.push(j);
    }
  }
  return [A, B];
}
// clear (empty / a driver at the wheel) or dark (someone's in there we don't draw: the hero, a far driver)
const _glassMat = [];
function carGlassMat(dark) {
  const i = dark ? 1 : 0; if (_glassMat[i]) return _glassMat[i];
  const m = (_glassMat[i] = new THREE.MeshStandardMaterial({ color: dark ? 0x141c26 : 0x223040, roughness: 0.04, metalness: 0.1, transparent: true, opacity: dark ? 0.84 : 0.5, depthWrite: false, envMapIntensity: 1.4 }));
  Render.prepMaterial(m);
  return m;
}
/* ---------------- drivers: the nearest occupied cars get a townsperson at the wheel (pooled compact rigs, seated 'drive') ---------------- */
const CarDrivers = {
  N: LOWQ ? 0 : 6, list: [], t: 0, M: new THREE.Matrix4(), O: new THREE.Matrix4(),
  ok(c) {
    const p = camera.position;
    return !c.removed && c.hasDriver && !c.burnt && c.lod === 0 && c.look && c.look.cab && c !== Player.car && c.state !== 'ragdoll' && c.state !== 'held' && c.state !== 'thrown' && dist2(c.pos.x, c.pos.z, p.x, p.z) < 26 * 26;
  },
  free(d) { if (d.car) d.car._drv = null; d.car = null; d.rig.root.visible = false; },
  make() {
    const L = typeof Peds !== 'undefined' && Peds.vrm ? Peds.looks.filter((l) => /^c\d+$/.test(l.key)) : []; if (!L.length) return null;
    const l = pick(L), r = new CharRig({ body: CharLib.base(l.L.body, l.L.g), hair: l.L.hair, pal: l.L.pal, h: l.L.h, full: false, springs: false });
    r.play('drive', { fade: 0 }); r.root.visible = false; scene.add(r.root);
    const d = { rig: r, car: null, hips: pedClipHips(r.T, 'drive') }; this.list.push(d);
    return d;
  },
  update(dt) {
    if (!this.N || !CharLib.ready) return;
    for (const d of this.list) if (d.car && !this.ok(d.car)) this.free(d);
    if ((this.t -= dt) <= 0) {
      this.t = 0.3;
      const p = camera.position, want = Cars.list.filter((c) => this.ok(c)).sort((a, b) => dist2(a.pos.x, a.pos.z, p.x, p.z) - dist2(b.pos.x, b.pos.z, p.x, p.z)).slice(0, this.N);
      for (const d of this.list) if (d.car && !want.includes(d.car)) this.free(d);
      let made = false;
      for (const c of want) {
        if (c._drv) continue;
        let d = this.list.find((q) => !q.car); if (!d && !made && this.list.length < this.N) { d = guard('car.driver', () => this.make()); made = true; } if (!d) break;
        // seated on the driver's cushion (07a pedClipHips: the clip's hips above / behind the root)
        const C = c.look.cab, r = d.rig; d.car = c; c._drv = d;
        r.inner.position.set(0, C.cush + 0.1 - d.hips[0] * r.k, C.zfs + 0.16 - d.hips[1] * r.k);
        r.root.visible = true; r.needSnap = true; r.fresh = true;
      }
    }
    // follow the cars (world transform = car × seat)
    for (const d of this.list) if (d.car) { this.O.makeTranslation(d.car.look.cab.xs, 0, 0); this.M.multiplyMatrices(d.car.group.matrix, this.O).decompose(d.rig.root.position, d.rig.root.quaternion, d.rig.root.scale); }
  },
};

/* ---------------- a finished model per kind: body (hi / lo), brake overlay, wheels, plates, decals, flashers ---------------- */
const CAR_MODEL = new Map();
function carModel(kind) {
  let M = CAR_MODEL.get(kind);
  if (M) return M;
  const S = CAR_SPEC[kind] || CAR_SPEC.sedan;
  M = { S, wheels: [], decals: [], flash: null, beamZ: S.L / 2 - 2.3, plate: null };
  if (S.twoWheel) { bikeBody(M, kind); CAR_MODEL.set(kind, M); return M; }
  const SS = Object.assign({}, S, { key: kind, paint: S.paint || SF.paint, liv: LIVERY[S.livery] || null, _f: null });
  const vb = new VB(), brake = new VB(), lo = new VB();
  const F = loftBody(vb, SS, false, brake);
  loftBody(lo, Object.assign({}, SS, { _f: null }), true, null);
  carDetails(vb, SS, F, kind, M, false, brake); carDetails(lo, SS, F, kind, M, true, null);
  // desktop: a cabin inside, the window glass its own see-through mesh (M.glass); the far body keeps opaque glass
  let body = vb;
  const cab = LOWQ ? null : guard('car.cabin', () => carCabin(vb, SS, F));
  if (cab) {
    const g = SF.glass, z0 = cab.zb - 0.25, z1 = cab.zf + 0.25;
    const [a, b] = vbSplit(vb, (i) => vb.M[i * 4] === g.pbr[0] && vb.C[i * 3] === g.r && vb.C[i * 3 + 1] === g.g && vb.C[i * 3 + 2] === g.b && vb.P[i * 3 + 2] > z0 && vb.P[i * 3 + 2] < z1);
    if (b.n) { body = a; M.glass = b.geometry(); M.cab = cab; }
  }
  M.body = body.geometry(); M.lo = lo.geometry(); M.brake = brake.P.length ? brake.geometry() : null;
  // blinkers: the outer ends of the head / tail lamps on the left (+x) side; the right side is its mirror image
  const L = S.lamp;
  if (L && L.head && L.tail) {
    const bl = new VB(), f = (v) => (typeof v === 'function' ? v(1) : v);
    faceRib(bl, SS, F, 1, L.head.s[1] - 0.14, L.head.s[1] + 0.012, f(L.head.y0) - 0.012, f(L.head.y0) + 0.03, 0.017, SF.amber, 4, 1, true);
    faceRib(bl, SS, F, -1, L.tail.s[1] - 0.14, L.tail.s[1] + 0.012, f(L.tail.y0) - 0.012, f(L.tail.y0) + 0.03, 0.017, SF.amber, 4, 1, true);
    M.blinkL = bl.geometry(); M.blinkR = new VB().add(M.blinkL, vmx(0, 0, 0, 0, 0, 0, -1, 1, 1), SF.amber).geometry();
  }
  // wheels: [x, y, z, radius, width, steers]
  for (const [z, r] of S.axles) for (const sx of [1, -1]) M.wheels.push([sx * (S.W / 2 - 0.035 - S.tyreW / 2), r, z, r, S.tyreW, z > 0 && S.axles.length && z === Math.max(...S.axles.map((a) => a[0]))]);
  M.wb = Math.abs(S.axles[0][0] - S.axles[S.axles.length - 1][0]);
  // plates sit on the bumper faces
  const pf = S.plate || { f: [0.5, 0], b: [0.6, 0] }, zf = zAtFace(F, pf.f[0], 1), zb = zAtFace(F, pf.b[0], -1);
  M.plate = { f: [pf.f[0], zf + 0.012], b: [pf.b[0], zb - 0.012] };
  CAR_MODEL.set(kind, M);
  return M;
}
// z of the nose (dir 1) / tail (−1) face at height y on the centre line
function zAtFace(F, y, dir) {
  const bot = (z) => Math.min(F.bot(z), F.belt(z) - 0.04);
  let z = dir > 0 ? F.zf : F.zr;
  for (let k = 0; k < 60; k++) { const zz = z - dir * 0.01; if (y >= bot(z) && y <= F.top(z)) break; z = zz; }
  return z;
}
const vyAdd = (y, k) => (typeof y === 'function' ? (u) => y(u) + k : y + k);
// a height profile of a whole lamp, restricted to the part a..b of it (for a piece inside the lens)
const vySub = (y, a, b) => (typeof y === 'function' ? (u) => y(a + (b - a) * u) : y);
// lamps, grille, intakes: stacked ribbons (housing → lens → light strip); the tail lenses also go into the brake overlay
function lampSet(vb, S, F, L, lo, brake) {
  const nu = lo ? 4 : 12, nv = lo ? 1 : 2, e = 0.016;
  const H = L.head, T = L.tail, Gr = L.grille;
  if (H) {
    faceRib(vb, S, F, 1, H.s[0] - e, H.s[1] + e, vyAdd(H.y0, -e), vyAdd(H.y1, e), 0.004, SF.black, nu, 1);
    faceRib(vb, S, F, 1, H.s[0], H.s[1], H.y0, H.y1, 0.009, SF.head, nu, nv);
    if (!lo) { faceRib(vb, S, F, 1, H.s[0] + 0.02, H.s[1] - 0.01, vyAdd(H.y1, -0.024), vyAdd(H.y1, -0.01), 0.013, SF.drl, nu, 1); const a = 0.05 / (H.s[1] - H.s[0]), b = 0.24 / (H.s[1] - H.s[0]), y0 = vySub(H.y0, a, b); faceRib(vb, S, F, 1, H.s[0] + 0.05, H.s[0] + 0.24, vyAdd(y0, 0.014), vyAdd(y0, 0.046), 0.012, SF.chrome, 4, 1); }
  }
  if (T) {
    faceRib(vb, S, F, -1, T.s[0] - e, T.s[1] + e, vyAdd(T.y0, -e), vyAdd(T.y1, e), 0.004, SF.black, nu, 1);
    faceRib(vb, S, F, -1, T.s[0], T.s[1], T.y0, T.y1, 0.009, SF.tail, nu, nv);
    if (!lo) { faceRib(vb, S, F, -1, T.s[0] + 0.02, T.s[1] - 0.02, vyAdd(T.y1, -0.03), vyAdd(T.y1, -0.014), 0.012, TAIL_S, nu, 1); faceRib(vb, S, F, -1, T.s[0], T.s[0] + 0.12, T.y0, vyAdd(T.y0, 0.04), 0.012, SF.rev, 3, 1); }
    if (brake) faceRib(brake, S, F, -1, T.s[0], T.s[1], T.y0, T.y1, 0.015, SF.tail, nu, nv);
  }
  if (Gr) {
    faceRib(vb, S, F, 1, 0, Gr.s + 0.02, Gr.y[0] - 0.02, Gr.y[1] + 0.02, 0.004, Gr.frame || SF.chrome, lo ? 3 : 8, 1);
    faceRib(vb, S, F, 1, 0, Gr.s, Gr.y[0], Gr.y[1], 0.008, SF.grille, lo ? 3 : 8, 1);
    if (!lo && Gr.slats) for (let k = 1; k <= Gr.slats; k++) { const y = lerp(Gr.y[0], Gr.y[1], k / (Gr.slats + 1)); faceRib(vb, S, F, 1, 0, Gr.s - 0.02, y - 0.008, y + 0.008, 0.011, SF.chrome, 8, 1); }
  }
  // intakes / diffusers wrap the curved lower nose: more rows and a deeper offset, or the body pokes through them
  for (const [end, k] of [[1, 'intake'], [-1, 'diff']]) { const I = L[k]; if (I) faceRib(vb, S, F, end, 0, I.s, I.y[0], I.y[1], 0.011, SF.plastic, lo ? 3 : 12, lo ? 1 : 3); }
  if (L.fog && !lo) faceRib(vb, S, F, 1, L.fog.s[0], L.fog.s[1], L.fog.y[0], L.fog.y[1], 0.009, SF.head, 4, 1);
  if (L.refl && !lo) faceRib(vb, S, F, -1, L.refl.s[0], L.refl.s[1], L.refl.y[0], L.refl.y[1], 0.009, SF.tail, 3, 1);
}
const TAIL_S = vsurf(0xb01818, [0.08, 0, 1, 0], 0xff3020, 1.4, 1);
function carDetails(vb, S, F, kind, M, lo, brake) {
  const W = S.W / 2;
  if (S.lamp) lampSet(vb, S, F, S.lamp, lo, brake);
  // side skirts / cladding along the sill between the arches
  if (S.skirt) { const a = S.axles, z0 = Math.min(a[0][0], a[1][0]) + a[1][1] + 0.12, z1 = Math.max(a[0][0], a[1][0]) - a[0][1] - 0.12; flankRib(vb, S, F, z0, z1, (u) => F.bot(lerp(z0, z1, u)) + 0.03, (u) => F.bot(lerp(z0, z1, u)) + S.skirt, 0.006, SF.plastic, lo ? 3 : 8, 1); }
  // mirrors by the A-pillars: housing on a short arm, glass facing back
  if (S.mirror) {
    const [mz, my] = S.mirror, xb = F.hw(mz) - S.ins, x = xb + 0.12, ms = S.livery === 'taxi' ? TAXI_Y : S.mirrorS || S.paint;
    for (const sx of [1, -1]) {
      vrb(vb, ms, sx * x, my, mz, 0.2, 0.12, 0.1, 0.045, 0, sx * 0.1, 0, 2);
      if (!lo) { vrb(vb, SF.black, sx * (xb + 0.03), my - 0.035, mz + 0.01, 0.1, 0.04, 0.07, 0.015); vrb(vb, SF.mirror, sx * x, my, mz - 0.052, 0.165, 0.085, 0.01, 0.004, 0, sx * 0.1, 0); }
    }
  }
  if (lo) return;
  // door handles behind each door's leading seam
  if (S.handles) { const [hy, zs] = S.handles; for (const z of zs) for (const sx of [1, -1]) vrb(vb, S.livery === 'legal' || S.livery === 'police' ? SF.chrome : (S.liv && S.liv({ y: hy, nx: 1, tag: 'm' })) || S.paint, sx * ((flankX(S, F, z, hy) ?? F.hw(z)) + 0.006), hy, z, 0.03, 0.035, 0.17, 0.013); }
  // wipers resting on the cowl
  const G = S.glass || {};
  if (G.ws) { const z = G.ws[1] - 0.12, y = F.top(z) + 0.03; for (const x of [-0.45, 0.2]) vrb(vb, SF.plastic, x, y, z, 0.62, 0.015, 0.025, 0.006, 0, 0.12, 0); }
  // exhaust tips
  for (const [x, y] of S.exhaust || []) { const z = zAtFace(F, y + 0.02, -1); vb.add(cylGeo(0.045, 0.045, 0.16, 10), vmx(x, y, z + 0.02, Math.PI / 2), SF.chrome); vb.add(cylGeo(0.035, 0.035, 0.02, 10), vmx(x, y, z - 0.061, Math.PI / 2), SF.rubber); }
  // roof rails (SUV)
  // roof rails (SUV): on the flat of the roof, inside its rounded edge, standing on three feet
  if (S.rails) {
    const z0 = (G.rw ? G.rw[1] : -1.8) + 0.14, z1 = (G.ws ? G.ws[0] : 0.2) - 0.08, zm = (z0 + z1) / 2, x = F.hw(zm) - S.ins - S.tumble - 0.2;
    const ym = Math.max(F.top(z0), F.top(zm), F.top(z1)) + 0.06;
    for (const sx of [1, -1]) {
      vrb(vb, SF.plastic, sx * x, ym, zm, 0.045, 0.035, z1 - z0, 0.015);
      for (const z of [z0 + 0.06, zm, z1 - 0.06]) { const yb = F.top(z) - 0.01; vrb(vb, SF.plastic, sx * x, (ym + yb) / 2, z, 0.05, ym - yb + 0.02, 0.08, 0.012); }
    }
  }
  // rear wing (极客跑车)
  if (S.wing) { const z = F.zr + 0.28, y = F.top(z) + 0.2; vrb(vb, SF.black, 0, y, z, 1.7, 0.035, 0.28, 0.015, -0.06); for (const sx of [1, -1]) { vrb(vb, SF.black, sx * 0.55, y - 0.1, z + 0.02, 0.04, 0.2, 0.12, 0.012); vrb(vb, SF.black, sx * 0.86, y - 0.02, z, 0.02, 0.14, 0.32, 0.008); } }
  // the 出租 roof sign (lit at night)
  if (S.sign) { const z = -0.1, y = F.top(z); vrb(vb, SF.plastic, 0, y + 0.015, z, 0.62, 0.04, 0.22, 0.015); vrb(vb, SF.sign, 0, y + 0.12, z, 0.56, 0.17, 0.16, 0.05); M.decals.push(['taxiF', 0, y + 0.12, z + 0.083, 0, 0.44, 0.13], ['taxiB', 0, y + 0.12, z - 0.083, Math.PI, 0.44, 0.13]); }
  // light bar: housing + two flasher halves (flash: separate meshes that blink)
  if (S.bar) {
    const z = -0.15, y = F.top(z) + 0.02;
    vrb(vb, SF.black, 0, y + 0.03, z, 1.25, 0.06, 0.3, 0.025); for (const sx of [1, -1]) vrb(vb, SF.black, sx * 0.5, y, z, 0.08, 0.05, 0.18, 0.02);
    vrb(vb, SF.glassL, 0, y + 0.1, z, 1.2, 0.09, 0.26, 0.04);
    M.flash = { y: y + 0.1, z, w: 0.595, h: 0.1, d: 0.28, x: 0.3 }; // each half a hair larger than the lens it lights
  }
  // liveries on the doors (decal atlas)
  // door liveries sit on the flank (decal atlas): [slot, z, y, w, h]
  const dz = S.seams ? (S.seams[0] + S.seams[1]) / 2 : 0, side = (k, z, y, w, h) => { const x = (flankX(S, F, z, y) ?? F.hw(z)) + 0.008; M.decals.push([k, x, y, z, Math.PI / 2, w, h], [k, -x, y, z, -Math.PI / 2, w, h]); };
  if (S.livery === 'legal') side('fawu', dz, 0.86, 0.7, 0.35);
  if (S.livery === 'police') side('police', dz, 0.6, 0.9, 0.28);
  if (S.livery === 'taxi') side('taxiDoor', -0.62, 0.62, 0.5, 0.16);
  if (S.livery === 'van') side('van', -0.9, 1.55, 2.2, 0.55);
  if (S.livery === 'bus') { M.decals.push(['bus', 0, 2.9, F.zf + 0.012, 0, 1.8, 0.2]); side('busSide', 1.8, 0.95, 1.5, 0.22); }
}

/* ---------------- two-wheelers (lo: the parked 共享单车 instanced by the hundred — plain boxes, 4-sided vtubes) ---------------- */
const V_UBOX = new THREE.BoxGeometry(1, 1, 1);
function bikeBody(M, kind, lo) {
  const S = M.S, vb = new VB(), P = SF.paint, dark = SF.plastic, R = SF.rubber, ch = SF.alu;
  const rbL = lo ? (v, s, x, y, z, w, h, d, r, rx = 0, ry = 0, rz = 0) => v.add(V_UBOX, vmx(x, y, z, rx, ry, rz, w, h, d), s) : vrbF;
  const tubesL = lo ? (v, s, pts, r) => { for (let i = 0; i < pts.length - 1; i++) vtube(v, s, pts[i], pts[i + 1], r, 4); return v; } : vtubesF;
  if (kind === 'bike') {
    // 共享单车: step-through frame, basket, mudguards, chain case, the QR plate on the bar
    tubesL(vb, P, [[0, 0.34, -0.54], [0, 0.46, -0.22], [0, 0.46, 0.3], [0, 0.95, 0.46]], 0.03);   // chain stay → down vtube → head vtube
    tubesL(vb, P, [[0, 0.34, -0.54], [0, 0.62, -0.3]], 0.022); tubesL(vb, P, [[0, 0.46, -0.22], [0, 0.98, -0.34]], 0.03); // seat vtube
    tubesL(vb, dark, [[0, 0.34, 0.54], [0, 0.95, 0.46]], 0.025);                                   // fork
    tubesL(vb, dark, [[0, 0.95, 0.46], [0, 1.12, 0.42]], 0.022); tubesL(vb, dark, [[-0.3, 1.12, 0.38], [0.3, 1.12, 0.38]], 0.016);
    for (const sx of [1, -1]) rbL(vb, R, sx * 0.32, 1.12, 0.38, 0.1, 0.035, 0.035, 0.015);
    rbL(vb, dark, 0, 1.03, -0.36, 0.17, 0.07, 0.28, 0.035);                                       // saddle
    rbL(vb, P, 0, 0.9, 0.66, 0.34, 0.2, 0.24, 0.03); rbL(vb, dark, 0, 0.8, 0.66, 0.3, 0.02, 0.2, 0.008); // basket
    rbL(vb, P, 0, 0.62, 0.54, 0.08, 0.03, 0.46, 0.012, -0.25); rbL(vb, P, 0, 0.62, -0.56, 0.08, 0.03, 0.46, 0.012, 0.25); // mudguards
    rbL(vb, dark, 0.03, 0.44, -0.12, 0.05, 0.14, 0.42, 0.03);                                      // chain case
    for (const sx of [1, -1]) rbL(vb, dark, sx * 0.1, 0.44, 0.02, 0.1, 0.03, 0.03, 0.012);
    rbL(vb, SF.tail, 0, 0.66, -0.8, 0.07, 0.035, 0.02, 0.008);
    if (!lo) M.decals.push(['qr', 0, 1.02, 0.46 + 0.035, 0, 0.1, 0.1]);
    M.seat = [0, 1.06, -0.36]; M.bars = [0, 1.12, 0.38];
  } else {
    // 外卖电驴: scooter with a floorboard, leg shield, seat, and the insulated delivery box on the rack
    rbL(vb, dark, 0, 0.36, 0, 0.3, 0.08, 0.7, 0.03);                                                // floorboard
    rbL(vb, P, 0, 0.74, 0.37, 0.34, 0.6, 0.1, 0.05, -0.22, 0, 0, 2); rbL(vb, P, 0, 0.52, -0.36, 0.28, 0.28, 0.56, 0.09, 0, 0, 0, 2); // leg shield, rear cowl
    rbL(vb, R, 0, 0.74, -0.32, 0.3, 0.1, 0.56, 0.05);                                               // seat
    tubesL(vb, dark, [[0, 0.26, 0.62], [0, 0.72, 0.5], [0, 1.1, 0.44]], 0.03); tubesL(vb, dark, [[-0.34, 1.12, 0.42], [0.34, 1.12, 0.42]], 0.018);
    rbL(vb, P, 0, 1.12, 0.46, 0.34, 0.12, 0.14, 0.05); rbL(vb, SF.head, 0, 1.08, 0.54, 0.16, 0.08, 0.03, 0.02);   // head cowl + lamp
    for (const sx of [1, -1]) rbL(vb, R, sx * 0.34, 1.12, 0.42, 0.1, 0.04, 0.04, 0.016);
    rbL(vb, dark, 0, 0.55, 0.53, 0.11, 0.025, 0.22, 0.01, 0.6); rbL(vb, dark, 0, 0.56, 0.72, 0.11, 0.025, 0.2, 0.01, -0.5); rbL(vb, dark, 0, 0.56, -0.74, 0.12, 0.03, 0.3, 0.012, 0.35); // fenders
    rbL(vb, SF.tail, 0, 0.56, -0.67, 0.18, 0.04, 0.03, 0.01);
    rbL(vb, SF.steel, 0, 0.8, -0.5, 0.36, 0.03, 0.36, 0.01);                                       // rack
    rbL(vb, V_EBOX, 0, 1.06, -0.52, 0.46, 0.46, 0.46, 0.05); rbL(vb, SF.plastic, 0, 1.3, -0.52, 0.48, 0.03, 0.48, 0.012);
    M.decals.push(['waimai', 0.232, 1.05, -0.52, Math.PI / 2, 0.4, 0.2], ['waimai', -0.232, 1.05, -0.52, -Math.PI / 2, 0.4, 0.2], ['waimai', 0, 1.05, -0.752, Math.PI, 0.4, 0.2]);
    M.seat = [0, 0.8, -0.3]; M.bars = [0, 1.12, 0.42];
  }
  if (lo) return vb.geometry();
  M.body = vb.geometry(); M.lo = M.body; M.brake = null; M.wb = 1.1;
  for (const [z, r] of S.axles) M.wheels.push([0, r, z, r, S.tyreW, z > 0]);
  M.plate = null;
}
const V_EBOX = vsurf(0xffffff, [0.45, 0, 0.5, 1]);
// the parked 共享单车 of 04b (instanced, tinted per bike): the same frame with its wheels baked in, frame white for the tint
function bikeParkGeo() {
  const M = carModel('bike'), vb = new VB().addG(bikeBody({ S: M.S, decals: [], wheels: [] }, 'bike', true), new THREE.Matrix4());
  for (const [x, y, z, r, wd] of M.wheels) vb.addG(wheelGeo('bike', true), vmx(x, y, z, 0, 0, 0, wd, r, r));
  const g = vb.geometry(), C = g.attributes.color.array, Pb = g.attributes.aPbr.array;
  for (let i = 0; i < C.length / 3; i++) if (Pb[i * 4 + 3] > 0.5) C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 1; // frame: white, tinted per instance
  return g;
}

/* ---------------- wheels: unit radius / unit width, axle along x, the rim face on +x ---------------- */
const WHEEL_GEO = new Map();
function wheelGeo(style, lo) {
  const key = style + (lo ? '_lo' : '');
  let g = WHEEL_GEO.get(key);
  if (g) return g;
  const vb = new VB(), bike = style === 'bike', seg = lo ? (bike ? 8 : 10) : bike ? 16 : 18;
  // tyre: revolve a tread / shoulder / sidewall profile [radius, axial]
  const prof = bike ? (lo ? [[0.88, -0.4], [1, 0], [0.88, 0.4]] : [[0.9, -0.3], [0.94, -0.5], [0.99, -0.35], [1, 0], [0.99, 0.35], [0.94, 0.5], [0.9, 0.3]])
    : lo ? [[0.64, -0.42], [0.86, -0.5], [1, -0.36], [1, 0.36], [0.86, 0.5], [0.64, 0.42]]
      : [[0.64, -0.42], [0.8, -0.5], [0.93, -0.48], [0.99, -0.4], [1, -0.3], [0.975, -0.22], [1, -0.14], [1, 0.14], [0.975, 0.22], [1, 0.3], [0.99, 0.4], [0.93, 0.48], [0.8, 0.5], [0.64, 0.42]];
  vlathe(vb, prof, seg, SF.rubber);
  if (bike) {
    // 3-spoke mag wheel (the shared bikes' puncture-proof look) + hub
    vlathe(vb, lo ? [[0.86, -0.3], [0.86, 0.3]] : [[0.86, -0.3], [0.9, 0], [0.86, 0.3]], seg, SF.alu);
    if (!lo) for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; vb.add(rboxGeo(0.5, 0.78, 0.14, 0.05, 1), vmx(0, Math.cos(a) * 0.47, Math.sin(a) * 0.47, a, 0, 0), SF.alu); }
    vb.add(cylGeo(lo ? 0.3 : 0.14, lo ? 0.3 : 0.14, lo ? 0.9 : 1.4, lo ? 6 : 10), vmx(0, 0, 0, 0, 0, Math.PI / 2), SF.steel);
  } else {
    const rimS = style === 'steel' ? SF.steel : style === 'sport' ? vsurf(0x2a2d31, [0.3, 0.9, 0.6, 0]) : SF.alu;
    // barrel (the inside of the rim), brake disc, then the face
    vlathe(vb, [[0.64, 0.4], [0.62, 0.3], [0.62, -0.38], [0.6, -0.42]], seg, SF.steel, true);
    vb.add(cylGeo(0.5, 0.5, 0.06, seg), vmx(0.02, 0, 0, 0, 0, Math.PI / 2), SF.steel);
    if (lo) vb.add(cylGeo(0.64, 0.64, 0.05, seg), vmx(0.3, 0, 0, 0, 0, Math.PI / 2), rimS);
    else if (style === 'steel') {
      vb.add(cylGeo(0.64, 0.5, 0.08, seg), vmx(0.3, 0, 0, 0, 0, -Math.PI / 2), rimS);
      vb.add(cylGeo(0.36, 0.4, 0.1, seg), vmx(0.36, 0, 0, 0, 0, -Math.PI / 2), SF.chrome);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; vb.add(cylGeo(0.035, 0.035, 0.08, 6), vmx(0.42, Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0, 0, Math.PI / 2), SF.steel); }
    } else {
      // alloy: rim lip + 5 (sport: 10) spokes + centre cap
      vlathe(vb, [[0.6, 0.3], [0.66, 0.36], [0.64, 0.4]], seg, rimS);
      const n = style === 'sport' ? 10 : 5, sw = style === 'sport' ? 0.07 : 0.13;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU; vb.add(rboxGeo(0.1, 0.46, sw, 0.03, 1), vmx(0.3, Math.cos(a) * 0.38, Math.sin(a) * 0.38, a, 0, 0), rimS); }
      vb.add(cylGeo(0.17, 0.2, 0.14, 12), vmx(0.31, 0, 0, 0, 0, -Math.PI / 2), rimS);
      vb.add(cylGeo(0.09, 0.09, 0.02, 10), vmx(0.385, 0, 0, 0, 0, -Math.PI / 2), SF.chrome);
    }
  }
  g = vb.geometry();
  WHEEL_GEO.set(key, g);
  return g;
}
// revolve [radius, axial] around the x axis; normals from the profile (inside = the barrel faces in)
function vlathe(vb, prof, seg, s, inside) {
  const n = prof.length;
  for (let k = 0; k < n - 1; k++) {
    const [r0, a0] = prof[k], [r1, a1] = prof[k + 1];
    const tr = r1 - r0, ta = a1 - a0, tl = hyp(tr, ta) || 1;
    let nr = ta / tl, na = -tr / tl; if (inside) { nr = -nr; na = -na; }
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * TAU, t1 = ((i + 1) / seg) * TAU, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      vb.quad([[a0, r0 * c0, r0 * s0], [a1, r1 * c0, r1 * s0], [a1, r1 * c1, r1 * s1], [a0, r0 * c1, r0 * s1]],
        [[na, nr * c0, nr * s0], [na, nr * c0, nr * s0], [na, nr * c1, nr * s1], [na, nr * c1, nr * s1]], s);
    }
  }
}

/* ---------------- decal atlas: liveries, sign faces, the bus's LED route sign (glows), QR stickers ---------------- */
const DECAL = { tex: null, glow: null, slots: {}, mesh: null, slot: null, MAX: 240, n: 0 };
function decalAtlas() {
  if (DECAL.tex) return DECAL;
  const W = 1024, H = 512, c = mkCanvas(W, H), g = c.getContext('2d'), e = mkCanvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  // slots: each drawn clipped to its own rect, 8 px apart (the mips of one don't bleed into the next)
  let x = 0, y = 0, rowH = 0;
  const slot = (name, w, h, draw, glow) => {
    if (x + w > W) { x = 0; y += rowH; rowH = 0; }
    for (const gg of glow ? [g, ge] : [g]) { gg.save(); gg.translate(x, y); gg.beginPath(); gg.rect(0, 0, w, h); gg.clip(); draw(gg, w, h); gg.restore(); }
    DECAL.slots[name] = [x / W, 1 - (y + h) / H, w / W, h / H];
    x += w + 8; rowH = Math.max(rowH, h + 8);
  };
  const text = (t, col, font = 900, stroke) => (gg, w, h) => { gg.textAlign = 'center'; gg.textBaseline = 'middle'; fitFont(gg, t, w - 12, h * 0.8, font); if (stroke) { gg.lineWidth = h * 0.08; gg.strokeStyle = stroke; gg.strokeText(t, w / 2, h / 2 + 2); } gg.fillStyle = col; gg.fillText(t, w / 2, h / 2 + 2); };
  slot('fawu', 256, 128, (gg, w, h) => { text('法务部', '#f4f4f4')(gg, w, h * 0.72); gg.fillStyle = '#c9a44a'; gg.fillRect(20, h * 0.78, w - 40, 6); gg.font = `700 22px ${FONT_CN}`; gg.textAlign = 'center'; gg.fillText('LEGAL · 律师函专送', w / 2, h * 0.9); });
  slot('police', 320, 100, (gg, w, h) => { gg.fillStyle = '#1747a6'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; fitFont(gg, '巡警', w * 0.45, h * 0.8); gg.fillText('巡警', w * 0.28, h / 2 + 2); gg.font = `900 ${Math.round(h * 0.42)}px ${FONT_DISPLAY}`; gg.fillText('POLICE', w * 0.72, h / 2 + 2); });
  slot('taxiF', 160, 48, text('出租', '#1b1b1b'));
  slot('taxiB', 160, 48, (gg, w, h) => { gg.fillStyle = '#1b1b1b'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.font = `900 ${Math.round(h * 0.78)}px ${FONT_DISPLAY}`; gg.fillText('TAXI', w / 2, h / 2 + 2); });
  slot('taxiDoor', 200, 64, text('北京出租', '#1b1b1b', 800));
  slot('van', 512, 128, (gg, w, h) => { gg.fillStyle = '#ffc300'; rrect(gg, 4, 8, w - 8, h - 16, 18); gg.fill(); gg.fillStyle = '#1b1b1b'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; fitFont(gg, '饿急了外卖 · 30 分钟必达', w - 60, 62); gg.fillText('饿急了外卖 · 30 分钟必达', w / 2, h / 2 + 3); });
  slot('bus', 512, 60, text('1 路  四惠枢纽站 ⇄ 老山公交场站', '#ffb020', 800), true);
  slot('busSide', 300, 44, text('北京公交 · 1 路', '#f4f4f4', 800));
  slot('waimai', 200, 100, (gg, w, h) => { text('外卖', '#1b1b1b')(gg, w, h * 0.7); gg.font = `700 ${Math.round(h * 0.2)}px ${FONT_CN}`; gg.textAlign = 'center'; gg.fillStyle = '#1b1b1b'; gg.fillText('准时宝 · 超时赔', w / 2, h * 0.84); });
  slot('qr', 64, 64, (gg, w, h) => { gg.fillStyle = '#fff'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#111'; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if (Math.random() < 0.5 || (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5)) gg.fillRect(5 + i * 6, 5 + j * 6, 6, 6); });
  DECAL.tex = tex(c); DECAL.glow = tex(e);
  const geo = new THREE.PlaneGeometry(1, 1);
  DECAL.slot = new THREE.InstancedBufferAttribute(new Float32Array(DECAL.MAX * 4), 4); DECAL.slot.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aSlot', DECAL.slot);
  const mat = new THREE.MeshStandardMaterial({ map: DECAL.tex, emissiveMap: DECAL.glow, emissive: 0xffffff, emissiveIntensity: 1, alphaTest: 0.35, roughness: 0.45, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute vec4 aSlot;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvMapUv = uv * aSlot.zw + aSlot.xy; vEmissiveMapUv = vMapUv;'); };
  mat.customProgramCacheKey = () => 'carDecal-v1';
  DECAL.mat = mat;
  DECAL.mesh = new THREE.InstancedMesh(geo, mat, DECAL.MAX); DECAL.mesh.count = 0; DECAL.mesh.frustumCulled = false; DECAL.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(DECAL.mesh);
  return DECAL;
}

/* ---------------- per car: the meshes it owns ---------------- */
const FLASH_MAT = {};
const CarLook = {
  // build the car's meshes (called by the Car constructor)
  dress(c) {
    const M = carModel(c.kind), g = c.group;
    c.look = M; c.lod = 0;
    c.body = new THREE.Mesh(M.body, carMat(c.color, { liv: M.S.livery })); c.body.castShadow = true; c.body.receiveShadow = true;
    g.add(c.body);
    c.lights = c.body; // the lamps are part of the body now (old code toggles .lights.visible on wrecks)
    if (M.glass) { c.glass = new THREE.Mesh(M.glass, carGlassMat()); c.glass.renderOrder = 1; c.body.add(c.glass); } // (shown with the hi body only)
    if (M.brake) { c.brakeM = new THREE.Mesh(M.brake, this.brakeMat()); c.brakeM.visible = false; g.add(c.brakeM); }
    if (M.blinkL) { const bm = this.blinkMat(); c.blL = new THREE.Mesh(M.blinkL, bm); c.blR = new THREE.Mesh(M.blinkR, bm); c.blL.visible = c.blR.visible = false; g.add(c.blL, c.blR); }
    if (!M.S.twoWheel) { c.beamQ = new THREE.Mesh(BEAM_GEO, MAT.headBeam); c.beamQ.renderOrder = 2; c.beamQ.position.z = M.beamZ; c.beamQ.visible = false; g.add(c.beamQ); }
    if (M.flash) {
      const F = M.flash, geo = rboxGeo(F.w, F.h, F.d, 0.03, 1);
      if (!FLASH_MAT.r) { FLASH_MAT.r = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.25, 0.3) }); FLASH_MAT.b = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 3.4) }); }
      c.lr = new THREE.Mesh(geo, FLASH_MAT.r); c.lr.position.set(F.x, F.y, F.z);
      c.lb = new THREE.Mesh(geo, FLASH_MAT.b); c.lb.position.set(-F.x, F.y, F.z);
      g.add(c.lr, c.lb);
    }
    c.wa = 0; c.sa = 0; c._ph = null; c._sp = 0; c.brakeK = 0;
  },
  paint(c, hex) { c.color = hex; if (!c.burnt) c.body.material = carMat(hex, { liv: c.look.S.livery }); },
  burn(c) {
    if (c._bi !== undefined) CarFx.unbatch(c);
    c.body.material = carMat(0, { burnt: true }); c.body.geometry = c.look.body; c.lod = 0;
    if (c.glass) { c.glass.material = carMat(0, { burnt: true }); c.glass.visible = true; } // sooted over
    if (c.brakeM) c.brakeM.visible = false; if (c.beamQ) c.beamQ.visible = false; if (c.blL) c.blL.visible = c.blR.visible = false;
  },
  blinkMat() { return this._km || (this._km = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 1.3, 0.15), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); },
  brakeMat() { return this._bm || (this._bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 0.3, 0.22), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); },
};

/* ---------------- town-wide instancing: wheels (3 rim styles + a far version, 2-wheelers), decals; lamp gains ---------------- */
const CarFx = {
  W: null, M4: new THREE.Matrix4(), M5: new THREE.Matrix4(), Q: new THREE.Quaternion(), Q2: new THREE.Quaternion(), P: new V3(), S: new V3(), XA: new V3(1, 0, 0),
  init() {
    const mat = carMat(0xffffff, { dirt: false });
    this.W = {};
    for (const [k, n] of [['alloy', 200], ['sport', 40], ['steel', 80], ['lo', 260], ['bike', 40]]) {
      const m = new THREE.InstancedMesh(wheelGeo(k === 'lo' ? 'alloy' : k, k === 'lo'), mat, n);
      m.count = 0; m.castShadow = k !== 'lo'; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); // instances span the town: no culling on a stale bound
      this.W[k] = m;
    }
    decalAtlas();
  },
  put(mesh, M) { if (mesh.count >= mesh.instanceMatrix.count) return; mesh.setMatrixAt(mesh.count++, M); },
  // far traffic: every coarse (LOD 1) body goes into one BatchedMesh, one draw call for all of them; the instance colour
  // carries the paint (rgb) and the livery code (alpha 1 − code / 4). Lamps, beams, wheels stay where they were.
  B: null, bIn: new Set(), bGid: {}, C4: new THREE.Vector4(),
  batchInit() {
    const B = this.B = new THREE.BatchedMesh(LOWQ ? 120 : 160, 30000, 45000, carMat(0xffffff, { batch: true }));
    B.frustumCulled = false; B.perObjectFrustumCulled = true; B.sortObjects = false; B.castShadow = false; B.receiveShadow = true;
    // the colour texture exists from the start (so the program is built with USE_BATCHING_COLOR once)
    const t = B.addInstance(this.batchGid('sedan')); B.setColorAt(t, this.C4.set(1, 1, 1, 1)); B.deleteInstance(t);
    scene.add(B);
  },
  batchGid(kind) {
    let g = this.bGid[kind];
    if (g !== undefined) return g;
    const lo = carModel(kind).lo, B = this.B, nv = lo.attributes.position.count, ni = lo.index.count;
    if (B.unusedVertexCount < nv || B.unusedIndexCount < ni) B.setGeometrySize(Math.ceil((B._maxVertexCount + nv) * 1.4), Math.ceil((B._maxIndexCount + ni) * 1.4));
    return (this.bGid[kind] = B.addGeometry(lo));
  },
  // put c into the batch (on) or take it out; its own body mesh shows whenever it is not batched
  batch(c, on) {
    if (on && c._bi === undefined) {
      if (!this.B) this.batchInit();
      if (this.bIn.size < this.B.maxInstanceCount) { c._bi = this.B.addInstance(this.batchGid(c.kind)); c._bc = -1; this.bIn.add(c); }
    } else if (!on && c._bi !== undefined) this.unbatch(c);
    c.body.visible = c._bi === undefined;
    if (c._bi === undefined) return;
    const lv = CAR_LIV[c.look.S.livery] || 0, key = c.color * 4 + lv;
    if (c._bc !== key) { c._bc = key; _cc.set(c.color); this.B.setColorAt(c._bi, this.C4.set(_cc.r, _cc.g, _cc.b, 1 - lv / 4)); }
    this.B.setMatrixAt(c._bi, c.group.matrix);
  },
  unbatch(c) { this.B.deleteInstance(c._bi); c._bi = undefined; this.bIn.delete(c); if (c.body) c.body.visible = true; },
  t: 0,
  update(dt) {
    if (!this.W) this.init();
    this.t += dt;
    const L = DayNight.lamps || 0, U = CAR_U;
    // lamp gains: DRLs / tail lamps by day, full beams at night (HDR > 1 feeds the bloom)
    U.L.set(0.22 + 2.1 * L, 0.35 + 1.5 * L, 1.4 + 0.9 * L, 0.15 + 1.6 * L);
    U.E.x = scene.environment ? 1 : 0.35;
    U.E.y = 0.32 + 0.25 * clamp((GTA_U.wx.z || 0) * 2, 0, 1);
    DECAL.mat && DECAL.mat.emissive.setScalar(0.4 + 1.6 * L);
    for (const k in this.W) this.W[k].count = 0;
    const D = DECAL, sl = D.slot.array, beams = MAT.headBeam.opacity > 0.01;
    D.n = 0;
    const cx = camera.position.x, cz = camera.position.z, idt = dt > 1e-4 ? 1 / dt : 0;
    for (const c of this.bIn) if (c.removed) this.unbatch(c); // wrecks towed, traffic despawned
    for (const c of Cars.list) {
      if (c.removed || !c.look) continue;
      const M = c.look, dx = c.pos.x - cx, dz = c.pos.z - cz, d2 = dx * dx + dz * dz;
      // steering + rolling from what the car actually did (AI, player, physics alike)
      const sp = c.state === 'ragdoll' || c.state === 'thrown' || c.state === 'held' ? 0 : c.speed || 0;
      if (c._ph === null) c._ph = c.heading;
      const yr = angDiff(c._ph, c.heading) * idt; c._ph = c.heading;
      const st = Math.abs(sp) > 0.5 ? clamp(Math.atan(yr * M.wb / Math.abs(sp)) * Math.sign(sp), -0.55, 0.55) : c.sa;
      c.sa = damp(c.sa, st, 10, dt);
      c.wa = (c.wa + sp * dt / (M.wheels.length ? M.wheels[0][3] : 0.34)) % TAU;
      c.brakeK = idt ? (sp - c._sp) * idt : 0; c._sp = sp;
      // near: the detailed body; far: the coarse one, drawn by the far-traffic batch
      const lod = d2 > (LOWQ ? 26 * 26 : 48 * 48) ? 1 : 0;
      if (lod !== c.lod && !c.burnt) { c.lod = lod; c.body.geometry = lod ? M.lo : M.body; c.body.castShadow = !lod; if (c.glass) c.glass.visible = !lod; }
      c.group.updateMatrix();
      this.batch(c, lod === 1 && !c.burnt && !M.S.twoWheel && c !== Player.car && c.state !== 'held' && c.state !== 'thrown');
      if (c.glass && !c.burnt) c.glass.material = carGlassMat((c.hasDriver && !c._drv) || c === Player.car);
      if (d2 > 160 * 160) continue;
      if (c.brakeM) c.brakeM.visible = !c.burnt && d2 < 90 * 90 && (c.brakeK < -1.2 || (Math.abs(sp) < 0.3 && c.state === 'traffic') || (c === Player.car && Math.abs(sp) > 0.5 && c.brakeK < -3));
      // the throw lies on the road: none from a car rolling / flying / held up / on its side (it hung in the air as a glowing sheet)
      if (c.beamQ) c.beamQ.visible = beams && !c.burnt && (c.hasDriver !== false || c === Player.car) && Math.cos(c.rx) * Math.cos(c.rz) > 0.95 && c.state !== 'ragdoll' && c.state !== 'thrown' && c.state !== 'held';
      if (c.blL) {
        // AI traffic signals its turns: from 35 m before the junction until the curve is done
        let dir = 0; const t = c.tr;
        if (c.state === 'traffic' && t && t.nx && Math.abs(t.nx.turn) > 0.6 && t.nx.turn < 3 && ((t.turn && t.turn.on) || TR.sOut(t.e, t.dir) - t.s < 35)) dir = Math.sign(t.nx.turn);
        const on = dir !== 0 && d2 < 90 * 90 && this.t % 0.8 < 0.45 && !c.burnt;
        c.blL.visible = on && dir > 0; c.blR.visible = on && dir < 0;
      }
      const G = c.group.matrix;
      for (const w of M.wheels) {
        const [x, y, z, r, wd, steer] = w, left = x < 0 || (M.S.twoWheel && false);
        const mesh = M.S.twoWheel ? this.W.bike : lod ? this.W.lo : this.W[M.S.rim] || this.W.alloy;
        this.Q.setFromAxisAngle(UP, (steer ? c.sa : 0) + (left ? Math.PI : 0));
        this.Q2.setFromAxisAngle(this.XA, left ? -c.wa : c.wa); this.Q.multiply(this.Q2);
        this.M4.compose(this.P.set(x, y, z), this.Q, this.S.set(wd, r, r));
        this.M5.multiplyMatrices(G, this.M4); this.put(mesh, this.M5);
      }
      if (M.decals.length && d2 < 110 * 110 && !c.burnt) for (const [k, x, y, z, ry, w, h] of M.decals) {
        const s = D.slots[k]; if (!s || D.n >= D.MAX) continue;
        this.Q.setFromAxisAngle(UP, ry); this.M4.compose(this.P.set(x, y, z), this.Q, this.S.set(w, h, 1));
        this.M5.multiplyMatrices(G, this.M4); D.mesh.setMatrixAt(D.n, this.M5);
        sl[D.n * 4] = s[0]; sl[D.n * 4 + 1] = s[1]; sl[D.n * 4 + 2] = s[2]; sl[D.n * 4 + 3] = s[3]; D.n++;
      }
    }
    for (const k in this.W) this.W[k].instanceMatrix.needsUpdate = true;
    D.mesh.count = D.n; D.mesh.instanceMatrix.needsUpdate = true; D.slot.needsUpdate = true;
    guard('car.drivers', () => CarDrivers.update(dt));
  },
};
// the night headlight throw on the road (TEX.cone, a soft pool): from the bumper (beamZ + 2.3) out 10 m, 3.8 m across,
// brightest ~5 m out (over the roof from the chase cam); a polygon offset on MAT.headBeam keeps it off the asphalt
const BEAM_GEO = (() => { const g = new THREE.PlaneGeometry(3.8, 10); g.rotateX(-Math.PI / 2); g.translate(0, 0.08, 2.3 + 5); return g; })();
// tests / tools: GTA.Cars.Car (spawn any kind), GTA.Cars.Look
Cars.Car = Car; Cars.Look = { CarLook, CarFx, carModel, CAR_SPEC, CAR_U, wheelGeo, carMat, CarDrivers };
