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
// patterns (vertex attribute aPat): 0 plain colour · 1 brick · 2/3 roof tiles (ridge ∥ x / z) · 4 lattice (lit at night) · 5 plaster ·
// 6 office / 7 flats facades (procedural window grid; each window is a little room seen through the glass: interior mapping)
const CITY_GLSL = [
  'uniform sampler2D tDetail; uniform float uNight;',
  '#ifdef CITY_PBR', 'uniform highp sampler2DArray tCA; uniform vec3 uAvg[6];', '#endif',
  '#ifdef CITY_HI', 'uniform highp sampler2DArray tCN, tCR;', '#endif',
  'varying float vPat; varying float vSeed; varying vec3 vOP; varying vec3 vON; varying vec4 vIsc;',
  'float hsh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
  'float cWn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), f.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + 1.0), f.x), f.y); }',
  // tangent frame from screen derivatives of any uv (no tangents needed): columns T, B, N in view space
  'mat3 cityTBN(vec3 n, vec3 e, vec2 uv){ vec3 q0 = dFdx(e), q1 = dFdy(e); vec2 s0 = dFdx(uv), s1 = dFdy(uv); vec3 q1p = cross(q1, n), q0p = cross(n, q0);',
  '  vec3 T = q1p * s0.x + q0p * s1.x, B = q1p * s0.y + q0p * s1.y; float d = max(dot(T, T), dot(B, B)); float k = d == 0.0 ? 0.0 : inversesqrt(d); return mat3(T * k, B * k, n); }',
].join('\n') + '\n';
const CITY_MAP = [
  'vec3 an = abs(vON); float pat = floor(vPat + 0.5); vec3 winGlow = vec3(0.0); float rough = 0.86, metal = 0.0, cAO = 1.0;',
  // the per-building seed is k/1024: snap it back to an integer before hashing, or the sin-hash turns the
  // varying's interpolation error (1 ulp) into per-pixel static on every pane
  'float sd = floor(vSeed * 1024.0 + 0.5);',
  'vec2 puv = an.y > 0.7 ? vOP.xz : (an.x > an.z ? vOP.zy : vOP.xy);',
  'vec2 cuv = puv; float lay = -1.0; vec3 cN = vec3(0.0, 0.0, 1.0);',
  'mat3 cfr = cityTBN(normalize(vNormal), -vViewPosition, puv);', // the facade's frame (derivatives: outside any branch)
  'float vr = floor(sd / 256.0), fl = step(6.5, pat);',
  'if (pat == 1.0) { lay = an.y > 0.7 ? 5.0 : 0.0; cuv = puv / (an.y > 0.7 ? 2.0 : 1.9); }', // courtyards: 砖墁地 floor brick
  'else if (pat == 2.0) { lay = 1.0; cuv = vec2(vOP.x, vOP.z + vOP.y * 0.6) / 3.0; }',
  'else if (pat == 3.0) { lay = 1.0; cuv = vec2(vOP.z, vOP.x + vOP.y * 0.6) / 3.0; }',
  'else if (pat == 5.0) { lay = 2.0; cuv = puv / 3.0; }',
  'else if (pat >= 6.0 && pat < 7.5) { lay = fl > 0.5 ? (vr == 3.0 ? 4.0 : 2.0) : 3.0; cuv = puv / (lay == 4.0 ? 1.9 : 3.0); }',
  // detail from the photo set (normalised by the set's mean: the authored vertex / instance colours stay the base)
  '#ifdef CITY_PBR',
  '  vec2 cdx = dFdx(cuv), cdy = dFdy(cuv);',
  '  if (lay >= 0.0) { vec3 q = vec3(cuv, lay); int li = int(lay); diffuseColor.rgb *= mix(vec3(1.0), textureGrad(tCA, q, cdx, cdy).rgb / uAvg[li], pat >= 6.0 ? 0.7 : 0.95);',
  '#ifdef CITY_HI',
  '    cN = textureGrad(tCN, q, cdx, cdy).xyz * 2.0 - 1.0; vec3 ar = textureGrad(tCR, q, cdx, cdy).rgb; rough = ar.g; cAO = mix(1.0, ar.r, 0.8);',
  '#endif',
  '  }',
  '#else',
  '  if (pat == 1.0) diffuseColor.rgb *= mix(0.55, 1.12, texture2D(tDetail, puv / vec2(2.2, 1.1)).r);',
  '  else if (pat == 2.0) diffuseColor.rgb *= mix(0.5, 1.15, texture2D(tDetail, vOP.xz / 1.6 + vec2(0.0, vOP.y * 0.4)).g);',
  '  else if (pat == 3.0) diffuseColor.rgb *= mix(0.5, 1.15, texture2D(tDetail, vOP.zx / 1.6 + vec2(0.0, vOP.y * 0.4)).g);',
  '  else if (pat == 5.0) diffuseColor.rgb *= mix(0.86, 1.04, texture2D(tDetail, puv / 5.0).a);',
  '#endif',
  'if (pat == 2.0 || pat == 3.0) rough = min(rough, 0.72);',
  // weathering (brick, roofs, plaster): soft world-space blotches, rain streaks down the walls, dirt streaks down the slopes
  'if (pat >= 1.0 && pat <= 5.0 && pat != 4.0) {',
  '  vec2 wq = vec2(vGtaW.x + vGtaW.z, vGtaW.y); float wm = cWn(vGtaW.xz * 0.085 + 3.7) * 0.6 + cWn(vGtaW.xz * 0.3 + vGtaW.y * 0.2) * 0.4;',
  '  diffuseColor.rgb *= mix(0.8, 1.07, wm);',
  '  if ((pat == 1.0 || pat == 5.0) && an.y < 0.7) diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.22, 0.62, cWn(vec2(wq.x * 1.7, wq.y * 0.13 + 3.1)) * cWn(vec2(wq.x * 0.33, 1.7)));',
  '  else if (pat == 2.0 || pat == 3.0) { vec2 sq = pat == 2.0 ? vOP.xz : vOP.zx; diffuseColor.rgb *= 1.0 - 0.3 * smoothstep(0.2, 0.6, cWn(vec2(sq.x * 2.2 + sd, sq.y * 0.4)) * cWn(vec2(sq.x * 0.45, 2.9 + sd))); }',
  '}',
  // 花格窗: dark lacquered bars over pale window paper (not the whole panel tinted wood-brown)
  // (per house: a finer or coarser grid, and one in eight has swapped the paper for aluminium-framed glass)
  'if (pat == 4.0) { float lv = hsh(vec2(sd, 9.1)), l = texture2D(tDetail, puv / (lv < 0.3 ? 1.15 : lv < 0.75 ? 1.6 : 2.2)).b;',
  '  diffuseColor.rgb = lv > 0.88 ? mix(vec3(0.72, 0.73, 0.74), vec3(0.14, 0.17, 0.19), smoothstep(0.35, 0.8, l)) / max(vColor.rgb, vec3(0.2)) : mix(diffuseColor.rgb * 0.42, vec3(0.86, 0.82, 0.72) / max(vColor.rgb, vec3(0.2)), smoothstep(0.35, 0.8, l));',
  '  float lit = step(0.45, hsh(floor(puv / 3.2) + sd * 0.0166)); winGlow = vec3(1.0, 0.66, 0.34) * l * lit * 0.9; }',
  'else if (pat >= 6.0 && pat < 7.5) {',
  // facade variant = the seed's top two bits (City.put): office 0 punched, 1 curtain wall, 2 ribbon windows;
  // flats 0 punched, 1 balconies + AC units, 2 small windows + balconies, 3 red-brick 老小区
  '  float wall = step(an.y, 0.7) * step(3.6, vOP.y);',
  // corner pilasters and a plain band under the roof line (no windows cut in half at the corners): the pilaster stands a few cm
  // proud (a lighter face, a shadow line where it meets the wall)
  '  float ce = an.x > an.z ? vIsc.z * 0.5 - abs(vOP.z) : vIsc.x * 0.5 - abs(vOP.x), te = vIsc.y + vIsc.w - vOP.y, pil = fl > 0.5 ? 0.5 : 0.75;',
  '  if (an.y < 0.7 && vOP.y > 0.4) { diffuseColor.rgb *= (1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.07, ce - pil)) * step(pil, ce)) * mix(1.07, 1.0, step(pil, ce) * step(0.9, te)); }',
  '  vec2 cs = fl > 0.5 ? vec2(3.1, 3.0) : vr == 1.0 ? vec2(1.5, 3.6) : vec2(2.3, 3.5); vec2 q = puv / cs, f = fract(q), id = floor(q);',
  '  vec4 wr = fl < 0.5 && vr == 1.0 ? vec4(0.05, 1.0, 0.12, 1.0) : fl < 0.5 && vr == 2.0 ? vec4(0.03, 1.0, 0.34, 0.88) : fl > 0.5 && vr == 2.0 ? vec4(0.14, 0.6, 0.36, 0.86) : vec4(0.2 + 0.04 * fl, 0.8 - 0.04 * fl, 0.22, 0.86);',
  // whole windows only: a cell whose opening would run into a pilaster or the top band stays wall
  '  float E = (an.x > an.z ? vIsc.z : vIsc.x) * 0.5; wall *= (1.0 - step(0.3, min(an.x, an.z))) * step(-E + pil + 0.1, (id.x + wr.x) * cs.x) * step((id.x + wr.y) * cs.x, E - pil - 0.1) * step((id.y + wr.w) * cs.y, vIsc.y + vIsc.w - 0.8);',
  '  float win = step(wr.x, f.x) * step(f.x, wr.y) * step(wr.z, f.y) * step(f.y, wr.w) * wall;',
  '  float h = hsh(id + sd * 0.0302), bt = hsh(vec2(sd, 3.3)), curtainW = fl < 0.5 && vr == 1.0 ? 1.0 : 0.0;',
  '  if (fl > 0.5 && vr == 3.0) diffuseColor.rgb *= vec3(1.0, 0.72, 0.6);',
  '  float shop = step(vOP.y, 3.4) * step(an.y, 0.7) * step(0.08, f.x) * step(f.x, 0.92) * step(0.5, vOP.y);',
  '  float lit = curtainW > 0.5 ? step(0.62, h) : step(0.52, h);',
  '  if (max(win, shop) > 0.5) {',
  // a room behind the pane: march the view ray into a box (pane size × 3 m deep), shade floor / ceiling / walls
  '    vec2 wsz = shop > 0.5 ? vec2(cs.x * 0.84, 2.9) : cs * (wr.yw - wr.xz), wf = shop > 0.5 ? vec2((f.x - 0.08) / 0.84, (vOP.y - 0.5) / 2.9) : (f - wr.xz) / (wr.yw - wr.xz);',
  '    vec3 Vv = normalize(vViewPosition);',
  '    vec3 d = -vec3(dot(Vv, normalize(cfr[0])), dot(Vv, normalize(cfr[1])), max(dot(Vv, cfr[2]), 0.05)); vec3 p = vec3(wf * wsz, 0.0);',
  // punched windows sit in a reveal R deep: trace to the pane plane; a ray that leaves the opening first sees the reveal
  // (side / sill / head: wall, shaded by which way it faces and how deep), else the pane (and the room) from where it lands
  '    float rv = 0.0, rk = 1.0, pao = 1.0; vec3 rn = vec3(0.0, 0.0, 1.0);',
  '    if (shop < 0.5 && curtainW < 0.5) {',
  '      float R = fl > 0.5 ? 0.26 : 0.2; vec2 pp = p.xy + d.xy * (R / -d.z);',
  '      if (pp.x < 0.0 || pp.x > wsz.x || pp.y < 0.0 || pp.y > wsz.y) {',
  '        float sx = d.x > 0.0 ? (wsz.x - p.x) / d.x : -p.x / min(d.x, -1e-5), sy = d.y > 0.0 ? (wsz.y - p.y) / d.y : -p.y / min(d.y, -1e-5), dep = clamp(min(sx, sy) * -d.z / R, 0.0, 1.0);',
  '        rv = 1.0; rn = sx < sy ? vec3(d.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0) : vec3(0.0, d.y > 0.0 ? -1.0 : 1.0, 0.0);',
  '        rk = (sx < sy ? 0.8 : d.y > 0.0 ? 0.5 : 1.15) * mix(1.0, 0.7, dep);',
  '      } else { p.xy = pp; wf = pp / wsz; pao = mix(0.62, 1.0, smoothstep(0.0, 0.45, wsz.y - pp.y)) * mix(0.8, 1.0, smoothstep(0.0, 0.18, min(pp.x, wsz.x - pp.x))); }',
  '    }',
  '    if (rv > 0.5) { diffuseColor.rgb *= rk; cN = rn; winGlow = vec3(0.0); rough = 0.9; } else {',
  '    float tb = -3.0 / d.z, tx = d.x > 0.0 ? (wsz.x - p.x) / d.x : -p.x / min(d.x, -1e-4), ty = d.y > 0.0 ? (wsz.y - p.y) / d.y : -p.y / min(d.y, -1e-4), t = min(tb, min(tx, ty));',
  '    vec3 hp = p + d * t, tint = mix(vec3(0.95, 0.9, 0.82), vec3(0.8, 0.86, 0.95), hsh(id + 7.1));',
  '    vec3 room = t == ty ? (d.y < 0.0 ? vec3(0.42, 0.3, 0.2) * (0.8 + 0.4 * hsh(id + 2.0)) : vec3(0.86, 0.85, 0.82)) : t == tx ? vec3(0.66, 0.62, 0.56) * tint : vec3(0.6, 0.58, 0.55) * tint;',
  '    if (t == tb) room *= 1.0 - 0.45 * step(hp.y, 0.85) * step(0.2, hp.x) * step(hp.x, wsz.x - 0.4) * step(0.5, hsh(id + 3.3));', // a desk / sofa against the back wall
  '    room *= 1.0 - 0.4 * clamp(-hp.z / 3.0, 0.0, 1.0);',
  // curtains / blinds drawn in some panes; tinted glass on curtain walls
  '    float blind = step(0.84, fract(h * 7.31)) * (1.0 - curtainW);',
  '    room = mix(room, vec3(0.78, 0.74, 0.64), blind * 0.8);',
  '    vec3 glassT = curtainW > 0.5 ? mix(mix(vec3(0.3, 0.42, 0.52), vec3(0.28, 0.44, 0.42), step(0.55, bt)), vec3(0.44, 0.38, 0.3), step(0.85, bt)) : vec3(0.82, 0.86, 0.9);',
  '    vec3 pane = room * glassT * (curtainW > 0.5 ? 0.45 : 0.62);',
  // frames: a thin dark border round each pane
  '    float fw = 0.06 / max(wsz.x, 0.5), fh = 0.06 / max(wsz.y, 0.5), frame = 1.0 - step(fw, wf.x) * step(wf.x, 1.0 - fw) * step(fh, wf.y) * step(wf.y, 1.0 - fh);',
  '    pane = mix(pane, vec3(0.2, 0.21, 0.22), frame * (1.0 - curtainW * 0.7));',
  // curtain walls: a vertical aluminium fin on each mullion (it catches the light on one side), a darker transom per floor
  '    float fin = curtainW * (1.0 - step(0.055, min(wf.x, 1.0 - wf.x) * wsz.x));',
  '    pane = mix(pane, vec3(0.42, 0.44, 0.46), fin) * (1.0 - 0.35 * curtainW * (1.0 - step(0.05, wf.y * wsz.y)));',
  '    diffuseColor.rgb = pane * pao / max(vColor.rgb, vec3(0.2));',
  '    float on = shop > 0.5 ? 1.0 : lit;',
  '    winGlow = room * glassT * on * (shop > 0.5 ? vec3(1.2, 1.0, 0.78) * 1.1 : vec3(1.15, 0.95, 0.7) * (0.55 + 0.45 * h)) * (1.0 - frame) * (1.0 - fin);',
  '    rough = mix(0.06, 0.5, max(frame, fin)); metal = curtainW * 0.35 * (1.0 - frame) + fin * 0.5; cN = fin > 0.5 ? vec3(wf.x < 0.5 ? -0.55 : 0.55, 0.0, 0.83) : vec3(0.0, 0.0, 1.0); cAO = 1.0;',
  '    }',
  '  }',
  // a stone sill under each punched window (a lit top edge, its shadow line below); 小区 with balconies draw their slabs instead
  '  else if (wall > 0.5 && curtainW < 0.5 && !(fl > 0.5 && (vr == 1.0 || vr == 2.0))) {',
  '    float yb = (f.y - wr.z) * cs.y, xb = (f.x - wr.x) * cs.x, ww = (wr.y - wr.x) * cs.x, inx = step(-0.08, xb) * step(xb, ww + 0.08);',
  '    float sill = inx * step(-0.1, yb) * step(yb, 0.0), shd = inx * step(-0.22, yb) * step(yb, -0.1);',
  '    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(0.8, 0.78, 0.74) / max(vColor.rgb, vec3(0.2)), 0.5) * 1.12, sill) * (1.0 - 0.3 * shd * (1.0 - smoothstep(-0.22, -0.1, yb)));',
  '    if (sill > 0.5) cN = vec3(0.0, 0.45, 0.89);',
  '  }',
  // balconies: a white slab + railing under each window row, an AC box beside some windows
  '  if (fl > 0.5 && (vr == 1.0 || vr == 2.0)) {',
  '    float bal = step(f.y, 0.3) * step(0.03, f.x) * step(f.x, 0.97) * wall, rail = bal * step(0.5, fract(puv.x * 3.0));',
  '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.82) * (0.8 + 0.2 * step(0.26, f.y)), bal * (0.55 + 0.35 * rail));',
  '    float ac = step(0.66, f.x) * step(f.x, 0.9) * step(0.36, f.y) * step(f.y, 0.58) * wall * step(0.45, fract(h * 3.7)) * step(vr, 1.5);',
  '    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.9, 0.88) * (0.85 + 0.15 * step(0.5, fract(puv.y * 12.0))), ac);',
  '  }',
  '  if (an.y > 0.7) diffuseColor.rgb *= 0.62;',
  '}',
  // 8: a lane door in the house's own lacquer (朱红 / 墨绿 / 黑漆 / 原木, from its seed); 9: a frosted door lamp, lit at night
  // on two houses in three (City.put hands the same ones to NightLights)
  'if (pat == 8.0) { float dh = hsh(vec2(sd, 5.7)); vec3 dc = dh < 0.42 ? vec3(0.5, 0.1, 0.07) : dh < 0.62 ? vec3(0.12, 0.24, 0.18) : dh < 0.8 ? vec3(0.13, 0.11, 0.1) : vec3(0.42, 0.27, 0.15);',
  '  diffuseColor.rgb = dc * (0.88 + 0.12 * cWn(puv * vec2(2.0, 9.0))) / max(vColor.rgb, vec3(0.2)); rough = 0.45; }',
  'if (pat == 9.0) { diffuseColor.rgb = vec3(0.92, 0.88, 0.76) / max(vColor.rgb, vec3(0.2)); winGlow = vec3(1.0, 0.7, 0.38) * 3.2 * step(mod(sd, 3.0), 1.5); rough = 0.3; }',
].join('\n');
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
    // photo sets as texture arrays: 0 grey brick · 1 grey roof tiles · 2 concrete / plaster · 3 tiled facade · 4 red brick (老小区) · 5 courtyard floor brick
    const L = ['brick_grey', 'roof_grey', 'concrete', 'concrete_tile_facade', 'brick_grey', 'courtyard_brick'], pbr = PBR.has('brick_grey') && PBR.has('roof_grey'), hi = pbr && PBR.HI;
    if (pbr) { const A = PBR.array(L, 'albedo'); this.U.tCA = { value: A }; this.U.uAvg = { value: A.userData.avg }; }
    if (hi) { this.U.tCN = { value: PBR.array(L, 'normal') }; this.U.tCR = { value: PBR.array(L, 'arm', PBR.S / 2) }; }
    const U = this.U;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float aPat; attribute float aSeed; varying float vPat; varying float vSeed; varying vec3 vOP; varying vec3 vON; varying vec4 vIsc;\n' +
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
          '  vOP = position * isc + ioff; vON = normal; vPat = aPat; vIsc = vec4(isc, ioff.y);',
        ].join('\n'));
      Render.cutoutPatch(sh);
      sh.fragmentShader = (pbr ? '#define CITY_PBR\n' : '') + (hi ? '#define CITY_HI\n' : '') + CITY_GLSL +
        sh.fragmentShader.replace('#include <map_fragment>', CITY_MAP)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rough;')
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = metal;')
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n#ifdef CITY_HI\n  { mat3 tb = cityTBN(normal, -vViewPosition, cuv); if (lay >= 0.0) normal = normalize(tb * cN); }\n#endif')
          .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= cAO;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += winGlow * uNight;');
    };
    m.customProgramCacheKey = () => 'city-v8' + (pbr ? 'p' : '') + (hi ? 'h' : '');
    this.mat = m;
    return m;
  },
};

/* ---------- template builder: boxes / roofs with colour + pattern id ---------- */
class TB {
  // twin: a second builder that only gets the massing (walls, houses, roofs, towers; no panels / plaques / steps / paving):
  // the template's shadow proxy (see Render.shadowProxy)
  // lo: the far-LOD version (flat two-part slopes, no eave band / ridge ornaments)
  constructor(twin = true, lo = TB.LO) { this.p = []; this.n = []; this.c = []; this.t = []; this._c = new THREE.Color(); this.lo = lo; this.sh = twin ? new TB(false, true) : null; }
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
  // gable roof over a rect, ridge along x (alongX) or z, concave Chinese eave profile; near LOD: a 3-row 举折 curve, a dark eave
  // band + soffit, the ridge with upturned ends (蝎子尾)
  gable(cx, cz, L, D, yE, h, col, alongX = true, o = 0.4) {
    if (this.sh && D >= 1.2) this.sh.gable(cx, cz, L, D, yE, h, 0, alongX, o);
    const pat = alongX ? 2 : 3, fine = !this.lo && D >= 1.5;
    const F = alongX ? (lx, y, lz) => [cx + lx, y, cz + lz] : (lx, y, lz) => [cx + lz, y, cz - lx];
    const a = L / 2 + Math.min(o, 0.3), b = D / 2 + o, ye = yE - 0.1, yR = yE + h;
    const rows = fine ? [0, 0.36, 0.7, 1] : [0, 0.52, 1], G = (v) => (fine ? roofG(v) : v < 0.6 ? v * 0.7 : 0.36 + (v - 0.52) * 1.33);
    const P = (s, t, v) => F(s * a, ye + (yR - ye) * G(v), t * b * (1 - v));
    for (const t of [1, -1]) for (let k = 0; k < rows.length - 1; k++) {
      const v0 = rows[k], v1 = rows[k + 1];
      if (t > 0) this.quad(P(-1, t, v0), P(1, t, v0), P(1, t, v1), P(-1, t, v1), col, pat); else this.quad(P(1, t, v0), P(-1, t, v0), P(-1, t, v1), P(1, t, v1), col, pat);
    }
    for (const sx of [1, -1]) { // gable ends: the profile polygon fanned from the eave line's middle
      const c0 = F(sx * a, ye, 0), pts = rows.map((v) => P(sx, 1, v)).concat(rows.slice(0, -1).reverse().map((v) => P(sx, -1, v)));
      for (let i = 0; i < pts.length - 1; i++) { if (sx > 0) this.tri(c0, pts[i + 1], pts[i], 0x6f6f6f, 1); else this.tri(c0, pts[i], pts[i + 1], 0x6f6f6f, 1); }
    }
    if (!fine) { if (this.sh) this.box(cx - (alongX ? a : 0.12), yR - 0.08, cz - (alongX ? 0.12 : a), cx + (alongX ? a : 0.12), yR + 0.14, cz + (alongX ? 0.12 : a), 0x3f4246, 0, 'nsewt'); return; }
    // eave band (瓦当 line) and soffit back to the wall
    const fh = 0.16, D2 = D / 2, EC = 0x2e3134;
    for (const t of [1, -1]) {
      const e0 = F(-a, ye, t * b), e1 = F(a, ye, t * b), f0 = F(-a, ye - fh, t * b), f1 = F(a, ye - fh, t * b), i0 = F(-a, yE - 0.05, t * D2), i1 = F(a, yE - 0.05, t * D2);
      if (t > 0) { this.quad(f0, f1, e1, e0, EC, 0); this.quad(i0, i1, f1, f0, 0x3a3634, 0); } else { this.quad(f1, f0, e0, e1, EC, 0); this.quad(i1, i0, f0, f1, 0x3a3634, 0); }
    }
    // 正脊 with 蝎子尾: the ridge block and a horn curling up at each end
    const rw = 0.14, rt = yR + 0.22;
    this.box(cx - (alongX ? a : rw), yR - 0.08, cz - (alongX ? rw : a), cx + (alongX ? a : rw), rt, cz + (alongX ? rw : a), 0x3f4246, 0, 'nsewt');
    for (const sx of [1, -1]) {
      const B = [F(sx * (a - 0.34), rt - 0.02, -rw), F(sx * (a - 0.34), rt - 0.02, rw), F(sx * a, rt, rw), F(sx * a, rt, -rw)], T = [F(sx * (a + 0.08), rt + 0.2, -rw * 0.5), F(sx * (a + 0.16), rt + 0.23, -rw * 0.5), F(sx * (a + 0.16), rt + 0.23, rw * 0.5), F(sx * (a + 0.08), rt + 0.2, rw * 0.5)];
      const q = (p0, p1, p2, p3) => (sx > 0 ? this.quad(p0, p1, p2, p3, 0x3f4246, 0) : this.quad(p3, p2, p1, p0, 0x3f4246, 0));
      q(B[3], B[2], T[2], T[1]); q(B[2], B[1], T[3], T[2]); q(B[1], B[0], T[0], T[3]); q(B[0], B[3], T[1], T[0]); q(T[0], T[1], T[2], T[3]);
    }
  }
  hip(cx, cz, Wd, D, yE, h, col, o = 0.7) {
    if (this.sh) this.sh.hip(cx, cz, Wd, D, yE, h, 0, o);
    const a = Wd / 2 + o, b = D / 2 + o, r = Math.max(0.2, (Wd - D) / 2), yR = yE + h, ye = yE - 0.15;
    const E = [[cx - a, ye, cz + b], [cx + a, ye, cz + b], [cx + a, ye, cz - b], [cx - a, ye, cz - b]], R0 = [cx - r, yR, cz], R1 = [cx + r, yR, cz];
    this.quad(E[0], E[1], R1, R0, col, 2); this.quad(E[2], E[3], R0, R1, col, 2); this.tri(E[1], E[2], R1, col, 3); this.tri(E[3], E[0], R0, col, 3);
  }
  // a lacquered 两扇 door on a face at z (facing +z): the leaves' joint, brass 门钹 knockers, a 春联 strip pasted on each leaf
  door(x0, x1, y1, z) {
    const cx = (x0 + x1) / 2;
    this.box(x0, 0, z - 0.1, x1, y1, z, 0x7a1a12, 8, 's');
    if (this.lo) return;
    this.box(cx - 0.018, 0.04, z, cx + 0.018, y1 - 0.04, z + 0.012, 0x2a0e0a, 0, 's');
    for (const sx of [-1, 1]) {
      this.box(cx + sx * 0.12 - 0.05, 1.08, z, cx + sx * 0.12 + 0.05, 1.18, z + 0.03, COL.gold, 0, 'st');
      const lx = cx + sx * (x1 - x0) * 0.3; this.box(lx - 0.08, 0.45, z, lx + 0.08, y1 - 0.3, z + 0.008, 0xd8342a, 0, 's');
    }
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

TB.LO = false;
const COL = { brick: 0x8b8e92, brick2: 0x9a9c9f, roof: 0x5c6066, lattice: 0x7a4428, red: 0x9b1c14, redCol: 0x9b2d24, stone: 0xb6b1a6, plaster: 0xe2ddd2, green: 0x2e6b5a, dark: 0x1b1714, gold: 0xc9a23e, shopWarm: 0xf2cf8e };

/* ---------- templates (object space: lot centred at origin, +z faces the street) ---------- */
const Tpl = {
  defs: {},
  // every template twice: the near version and a cheaper far one (geoLo, TB.LO)
  build() {
    TB.LO = true; this.build1(); const lo = this.defs; this.defs = {};
    TB.LO = false; this.build1();
    for (const k in this.defs) if (!this.defs[k].unit && lo[k]) this.defs[k].geoLo = lo[k].geo;
  },
  build1() {
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
      b.door(gx - gw / 2, gx + gw / 2, 2.35, hd - 0.45);
      b.box(gx - 0.1, 2.46, hd, gx + 0.1, 2.72, hd + 0.14, 0xffffff, 9, 'sewtb'); // a door lamp under the gatehouse eave
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
      this.defs[key] = { geo: b.geo(), h: 4.8, tree: [0, -0.5], lanterns: [[gx - 0.62, 2.0, hd + 0.22], [gx + 0.62, 2.0, hd + 0.22]], lanternP: 0.22, doorLamp: [gx, 2.5, hd + 0.4] }; // a red lantern pair on some gates
    }
    // street-facing 倒座房 with lattice windows and a door (a lane-side house)
    {
      const b = new TB(), w = 8, d = 7, hw = w / 2, hd = d / 2;
      b.box(-hw, 0, -hd, hw, 3.1, hd, COL.brick, 1, 'nsew');
      b.box(-hw + 0.1, 0, hd, hw - 0.1, 0.9, hd + 0.02, COL.brick2, 1, 's');
      b.box(-hw + 0.5, 0.9, hd, -0.9, 2.8, hd + 0.03, COL.lattice, 4, 's'); b.box(0.9, 0.9, hd, hw - 0.5, 2.8, hd + 0.03, COL.lattice, 4, 's');
      b.door(-0.7, 0.7, 2.4, hd + 0.05); b.box(0.86, 2.02, hd, 1.06, 2.28, hd + 0.14, 0xffffff, 9, 'sewtb');
      b.box(-hw, 2.8, hd, hw, 3.1, hd + 0.04, COL.green, 0, 's');
      b.gable(0, 0, w, d, 3.1, 1.7, COL.roof, true, 0.5);
      this.defs.laneHouse = { geo: b.geo(), h: 5, doorLamp: [0.96, 2.1, hd + 0.4] };
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
      b.door(hw - 3.4, hw - 1.9, 2.3, hd - 0.5); b.gable(hw - 2.65, hd - 0.9, 2.4, 1.8, 2.9, 0.9, COL.roof, true, 0.3);
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
      b.box(-hw, 2.7, hd, hw, 2.95, hd + 0.5, 0x4a2a1a, 0);
      b.box(-2.2, 2.75, hd + 0.5, 2.2, 3.2, hd + 0.56, COL.dark, 0, 's');
      b.box(-hw, H - 0.35, hd, hw, H - 0.1, hd + 0.08, COL.green, 0, 's');
      // 腰檐: a lean-to tiled eave between the storeys (fascia + soffit), 幌子 signboards hanging at both ends
      const ez = hd + 1.25, ey = 3.02, ty = 3.62;
      b.quad([-hw - 0.25, ey, ez], [hw + 0.25, ey, ez], [hw + 0.25, ty, hd + 0.02], [-hw - 0.25, ty, hd + 0.02], COL.roof, 2);
      b.box(-hw - 0.25, ey - 0.16, ez - 0.06, hw + 0.25, ey, ez, 0x2e3134, 0, 'sewt');
      b.quad([-hw - 0.25, ey - 0.16, hd], [hw + 0.25, ey - 0.16, hd], [hw + 0.25, ey - 0.16, ez - 0.06], [-hw - 0.25, ey - 0.16, ez - 0.06], 0x3a2a22, 0);
      if (!b.lo) for (const sx of [-1, 1]) { b.box(sx * (hw - 0.55) - 0.2, 1.45, ez - 0.25, sx * (hw - 0.55) + 0.2, 2.75, ez - 0.19, 0xa8322a, 0); b.box(sx * (hw - 0.55) - 0.21, 1.3, ez - 0.26, sx * (hw - 0.55) + 0.21, 1.45, ez - 0.18, COL.gold, 0); }
      b.gable(0, 0, w, d, H, 2.1, COL.roof, true, 0.6);
      this.defs.oldShop = { geo: b.geo(), h: 8, sign: [0, 2.97, hd + 0.6, 4.2, 0.42], lanterns: [[-hw + 1.3, 2.25, hd + 0.9], [hw - 1.3, 2.25, hd + 0.9]], neon: [0, 4.45, hd + 0.12] };
    }
    // modern: unit boxes scaled per instance (procedural facades); office (6) or residential (7)
    for (const [key, pat, col] of [['office', 6, 0xc9ced4], ['flats', 7, 0xd8cfc1], ['cap', 5, 0x8e9197], ['canopy', 0, 0xffffff]]) {
      const b = new TB();
      b.box(-0.5, 0, -0.5, 0.5, 1, 0.5, col, pat, 'nsewt');
      this.defs[key] = { geo: b.geo(), unit: true };
    }
    // a tower with its corners cut at 45° (some CBD / 金融街 towers): the same facade shader; the cut faces stay solid stone
    {
      const b = new TB(), k = 0.14, c = 0xc9ced4, P = [[-0.5 + k, -0.5], [0.5 - k, -0.5], [0.5, -0.5 + k], [0.5, 0.5 - k], [0.5 - k, 0.5], [-0.5 + k, 0.5], [-0.5, 0.5 - k], [-0.5, -0.5 + k]];
      for (let i = 0; i < 8; i++) {
        const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % 8];
        b.quad([x1, 0, z1], [x0, 0, z0], [x0, 1, z0], [x1, 1, z1], c, 6);
        b.tri([0, 1, 0], [x1, 1, z1], [x0, 1, z0], c, 6);
      }
      b.sh.box(-0.5, 0, -0.5, 0.5, 1, 0.5, 0, 0, 'nsewt'); // shadow massing: the plain box
      this.defs.officeC = { geo: b.geo(), unit: true };
    }
    // roof parapet / cornice for the modern blocks: a hollow rim, placed over every tier top (unit space: ~0.3 m walls)
    {
      const b = new TB(), t = 0.016, c = 0xd9d6cf;
      b.box(-0.5, 0, -0.5, 0.5, 1, -0.5 + t, c, 5); b.box(-0.5, 0, 0.5 - t, 0.5, 1, 0.5, c, 5);
      b.box(-0.5, 0, -0.5 + t, -0.5 + t, 1, 0.5 - t, c, 5); b.box(0.5 - t, 0, -0.5 + t, 0.5, 1, 0.5 - t, c, 5);
      this.defs.parapet = { geo: b.geo(), unit: true };
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
  signs: [], msigns: [], lanterns: [], count: 0, plates: [], proxies: 0,
  put(tpl, x, z, rot, sx, sy, sz, col, y = 0, o = {}) {
    const k = Math.floor((x - W.bounds.x0) / CITY_CHUNK) + ':' + Math.floor((z - W.bounds.z0) / CITY_CHUNK);
    let c = this.inst.get(k); if (!c) this.inst.set(k, c = new Map());
    let l = c.get(tpl); if (!l) c.set(tpl, l = []);
    const D = Tpl.defs[tpl];
    if (col === undefined && !D.unit) col = pick(HUTONG_TINTS);
    l.push({ x, y, z, rot, sx, sy, sz, seed: o.seed !== undefined ? o.seed : randi(0, 1023) / 1024, col });
    if (tpl !== 'cap' && tpl !== 'canopy' && tpl !== 'parapet') this.count++;
    if (tpl === 'office' || tpl === 'flats') this.put('parapet', x, z, rot, sx + 0.35, 0.95, sz + 0.35, col, y + sy); // cornice line on every tier
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const loc = (lx, ly, lz) => [x + lx * sx * cs + lz * sz * sn, y + ly * sy, z - lx * sx * sn + lz * sz * cs];
    if (D.tree && Math.random() < 0.7) { const p = loc(D.tree[0], 0, D.tree[1]); newProp(p[0], p[2], rand(0.85, 1.2), 'tree'); } // an old 国槐 over the courtyard walls
    if (D.sign) { const [lx, ly, lz, wd, ht] = D.sign; this.signs.push({ p: loc(lx, ly, lz), rot, w: wd * sx, h: ht }); }
    if (D.lanterns && (!D.lanternP || Math.random() < D.lanternP)) for (const [lx, ly, lz] of D.lanterns) { const p = loc(lx, ly, lz); BJB.lanterns.push([p[0], p[1], p[2]]); }
    // the door lamps the shader lights (pattern 9: seed % 3 < 2) become NightLights candidates: warm pools in the lanes at night
    const sd = Math.round(l[l.length - 1].seed * 1024); if (D.doorLamp && sd % 3 <= 1) (W.doorLamps || (W.doorLamps = [])).push(loc(...D.doorLamp));
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
    // street-level shops: a coloured canopy over the shop band and a lit sign board above it
    if (opts.front && w > 9 && Math.random() < 0.7) {
      const cw = Math.min(w - 2, rand(6, 14)), ox = rand(-1, 1) * (w - cw) * 0.4, [kx, kz] = at(ox, d / 2 + 0.65), [sx, sz] = at(ox, d / 2 + 0.06);
      this.put('canopy', kx, kz, rot, cw, 0.2, 1.3, parseInt(pick(SHOP_COLS).slice(1), 16), 3.15);
      this.msigns.push({ p: [sx, 3.85, sz], rot, w: Math.min(cw, 7), h: 0.75 });
    }
    if (tpl === 'office' && h > 34 && w > 16 && d > 14) {
      // podium + a slimmer tower (set back from the street), sometimes a second setback near the top
      const ph = rand(7, 11), tw = w * rand(0.62, 0.8), td = d * rand(0.62, 0.8), [tx, tz] = at(rand(-1, 1) * (w - tw) * 0.3, -(d - td) * 0.35);
      this.put('office', cx, cz, rot, w, ph, d, opts.col, 0, { seed: this.facade('office', cx, cz, 0) }); // the podium: shops + punched / ribbon windows
      const T = Math.random() < 0.35 ? 'officeC' : 'office'; // (some towers with chamfered corners: not every silhouette a box)
      if (h > 60 && Math.random() < 0.6) { const h1 = h * rand(0.6, 0.75); this.put(T, tx, tz, rot, tw, h1, td, opts.col, 0, F); this.put(T, tx, tz, rot, tw * 0.74, h - h1, td * 0.74, opts.col, h1, F); }
      else this.put(T, tx, tz, rot, tw, h, td, opts.col, 0, F);
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
  // async: on phones it yields to the title screen every ~60 ms (the lot loops were one 2–6 s long task there). Desktop builds it in
  // one go: a background download started mid-build could sit unread long enough to trip the loader's stall timeout
  async build() {
    Tpl.build();
    CityMat.make();
    const P = [0, 0, 0, 1];
    // shop / bar streets claim their frontage first (前门大街, 南锣鼓巷 … are pedestrian: they'd come last by class)
    const pri = (e) => (BAR_STREETS.test(e.name) || SHOP_STREETS.test(e.name) ? -1 : e.cls);
    const edges = Roads.edges.slice().sort((a, b) => pri(a) - pri(b) || b.len - a.len);
    let tY = performance.now();
    const yieldIf = async (f) => { if (LOWQ && !document.hidden && performance.now() - tY > 60) { await Boot.step(f); tY = performance.now(); } };
    for (let ei = 0; ei < edges.length; ei++) {
      const e = edges[ei];
      if ((ei & 31) === 0) await yieldIf(0.44 + 0.04 * ei / edges.length);
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
            if (this.tryLot(cx, cz, w, dd, ux, uz, h, tpl, { nw, nd, bar, front: true, col: tpl === 'office' || tpl === 'flats' ? pick(tpl === 'office' ? MODERN_COLS : FLAT_COLS) : undefined })) { placed = true; break; }
          }
          s += placed ? w + (type === 'hutong' || type === 'shop' ? rand(0, 0.4) : rand(1.5, 5)) : 1.5;
        }
      }
    }
    // insides of big blocks: courtyards in the old city, slabs outside
    const B = W.bounds;
    for (let z = B.z0 + 8; z < B.z1 - 8; z += 9) {
      await yieldIf(0.48 + 0.02 * (z - B.z0) / (B.z1 - B.z0));
      for (let x = B.x0 + 8; x < B.x1 - 8; x += 9) {
      if (Grid.at(x, z) !== GK.FREE) continue;
      const old = inOldCity(x, z);
      if (old) { if (this.tryLot(x, z, 14, 16, 1, 0, 5.4, 'siheyuan', { nw: 14, nd: 16 })) continue; if (this.tryLot(x, z, 9, 10, 1, 0, 5, 'hutongA', {})) continue; }
      else { const h = Math.round(rand(6, 16)) * 3 + 1; if (this.tryLot(x, z, rand(26, 36), rand(11, 14), 1, 0, h, 'flats', { col: pick(FLAT_COLS) })) continue; }
    } }
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
      const seeds = new Float32Array(list.length), sa = new THREE.InstancedBufferAttribute(seeds, 1);
      g.setAttribute('aSeed', sa);
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, k) => {
        q.setFromAxisAngle(UP, it.rot); m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz)); mesh.setMatrixAt(k, m4);
        seeds[k] = it.seed;
        mesh.setColorAt(k, c.set(it.col !== undefined ? it.col : 0xffffff));
      });
      mesh.castShadow = false; mesh.receiveShadow = true; scene.add(mesh); mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      const cr = r + 6;
      if (D.geoLo) { // near: the detailed template around the camera, far: the cheap one (low courtyard roofs vanish into the haze first)
        const gl = D.geoLo.clone(); gl.setAttribute('aSeed', sa);
        const lo = new THREE.InstancedMesh(gl, mat, list.length); lo.instanceMatrix = mesh.instanceMatrix; lo.instanceColor = mesh.instanceColor;
        lo.castShadow = false; lo.receiveShadow = true; scene.add(lo); lo.matrixAutoUpdate = false; lo.updateMatrix();
        Cull.list.push({ m: mesh, x: cx, z: cz, r: cr, d: 60, night: false }, { m: lo, x: cx, z: cz, r: cr, d: 400, dmin: 60, night: false });
      } else Cull.list.push({ m: mesh, x: cx, z: cz, r: cr, d: D.unit ? 1e9 : 400, night: false });
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
    // shop plaques (老字号, black and gold) and modern shop boards: one atlas each, merged per chunk
    for (const [list, atlas] of [[this.signs, this.signs.length && shopSignAtlas()], [this.msigns, this.msigns.length && modernSignAtlas()]]) {
      if (!list.length) continue;
      const byChunk = new Map();
      for (const sg of list) { const k = Build.chunk(sg.p[0], sg.p[2]); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(sg); }
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
// 32 modern shop boards (4 x 8 atlas): bright panels, white characters
function modernSignAtlas() {
  const c = mkCanvas(1024, 512), g = c.getContext('2d');
  const names = SHOP_NAMES.concat(['便利店', '火锅', '串串香', '烤鸭外卖', '书店', '健身', '按摩', '宠物', '包子', '煎饼果子', '牛肉面', '鲜花']).slice(0, 32);
  names.forEach((n, i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 64, col = SHOP_COLS[i % SHOP_COLS.length];
    g.fillStyle = col; g.fillRect(x, y, 256, 64); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, 256, 6); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y + 58, 256, 6);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, n, 220, 40, 900); g.fillText(n, x + 128, y + 33);
  });
  return tex(c);
}
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
