/* ============================================================
   vrm · 四九城的人: anime characters (pixiv VRoid samples, VRM 0.x) for the hero, the cast, enemies and the crowd.
   Every base VRM is loaded once (Assets) and prepared as a template; characters are synchronous clones with their own
   bones and shared geometry / materials:
   - full    (hero, cast, bosses): every material, thin outline, spring hair / skirts, blinking, lookAt, expressions
   - compact (crowd, mobs): face / body / hair each one skinned mesh on a per-base texture atlas, recoloured per
             palette in the shader (region id per vertex), no morphs / outlines: 3 draws a person
   Parts can come from different bases of one gender (hair from A on the body of B: its bones ride on B's head).
   Clips are VRMA files retargeted straight onto the raw bones (VRoid rest rotations are all identity, so a
   normalized rotation is the raw one; VRM 0.x only needs x / z mirrored). One AnimationMixer per character,
   crossfaded by a tiny state machine (play / once); Chars.frame() runs them all just before each render.
   ============================================================ */
const VRM_BASES = {
  hairsample_male: 'm', avatarsample_c: 'm', sakurada_fumiriya: 'm', base_male: 'm',
  sendagaya_shino: 'f', vita: 'f', sendagaya_shibu: 'f', darkness_shibu: 'f', vivi: 'f', victoria_rubin: 'f', hairsample_female: 'f', base_female: 'f', avatarsample_a: 'f', avatarsample_b: 'f',
};
// phones: the 512 px copies (chars/lo) of a smaller set
const VRM_ON = LOWQ ? ['hairsample_male', 'sakurada_fumiriya', 'base_male', 'avatarsample_c', 'sendagaya_shino', 'hairsample_female', 'vivi', 'base_female'] : Object.keys(VRM_BASES);
// clip → [loop, stride (m/s of ground speed per metre of hips height at rate 1; 0 = in place)]
const VRM_CLIPS = {
  idle: [1], idle_alt: [1], idle_listen: [1], idle_arms: [1], idle_soft: [1],
  walk: [1, 0.64], walk_female: [1, 0.72], walk_formal: [1, 0.64], jog: [1, 3.4], run: [1, 3.6], run_female: [1, 3.3], sprint: [1, 3.9], flee: [1, 3.2], walk_carry: [1, 0.52],
  jump_start: [0], jump_air: [1], jump_land: [0], roll: [0],
  fight_idle: [1], punch_jab: [0], punch_cross: [0], hook: [0], jab_l: [0], jab_r: [0], kick: [0], kick_spin: [0], kick_breach: [0], kick_jump: [0], defend: [0], dodge_back: [0],
  power_up: [0], land_hero: [0], throw: [0], ground_pound: [0],
  hit_front: [0], hit_head: [0], knockdown: [0], getup: [0], death: [0], death_b: [0], dizzy: [1], hurt_idle: [1], fear: [1],
  sit_idle: [1], sit_talk: [1], drive: [1], phone_call: [1], talk: [1], wave: [0], nod: [0], yes: [0], reject: [0], angry: [0], confused: [0], insult: [0],
  bow: [0], salute: [0], cheer: [1], cheer_one: [0], victory: [0], fist_pump: [0],
  dance: [1], dance_charleston: [1], dance_bodyroll: [1], dance_chicken: [1], jumping_jacks: [1], taichi: [1], push: [1], pickup: [0], interact: [0], meditate: [1], sleep: [1], pushup: [1],
};
// clips whose hands grip / punch / hold something: no relaxed fingers
const VRM_FIST = /fight|punch|jab|hook|kick|defend|dodge|power|push|drive|phone|carry|fist|cheer|pickup|interact|throw|ground|victory|pound|hit|getup|knock/;
// loading: the hero and the plain male base before the start (the prologue's cast is made of them), a woman and the story cast next,
// then the rest of the crowd;
// the clips the first minutes use before the start, the rest streamed (CharLib picks every file up as it lands)
const VRM_PLAY = ['hairsample_male', 'base_male'], VRM_CAST = ['hairsample_female', 'sakurada_fumiriya', 'avatarsample_c', 'sendagaya_shino', 'vita', 'vivi', 'base_female'];
const CLIP_PLAY = /^(idle|idle_alt|walk|walk_female|jog|run|run_female|sprint|flee|jump_\w+|fight_idle|punch_\w+|hook|jab_[lr]|kick|hit_\w+|knockdown|getup|death|death_b|talk|sit_idle|drive|phone_call|dance|taichi|wave|nod)$/;
for (const k of VRM_ON) Assets.need('vrm:' + k, (LOWQ ? 'chars/lo/' : 'chars/') + k + '.vrm', VRM_PLAY.includes(k) ? { tier: 'play' } : { tier: 'stream', prio: VRM_CAST.includes(k) ? VRM_CAST.indexOf(k) : 20 });
for (const k in VRM_CLIPS) Assets.need('vrma:' + k, 'anims/' + k + '.vrma', CLIP_PLAY.test(k) ? { tier: 'play' } : { tier: 'stream', prio: 8 });

// world scale of every character (VRoid men ~1.75 m, women ~1.62 m) and the Blade & Soul proportions:
// a slightly smaller head and longer legs than the teen VRoid defaults
const CHAR_K = 1.03, CHAR_HEAD = 0.89, CHAR_LEG = 1.07;
const VRM_REG = { top: 1, bottom: 2, hair: 3, shoe: 4, iris: 5 };
const vrmRegion = (n) => (/_HAIR/.test(n) ? 'hair' : /EyeIris/.test(n) ? 'iris' : /_(FACE|EYE)|Face_00_SKIN|_SKIN/.test(n) ? null : /Shoes/.test(n) ? 'shoe' : /Bottoms/.test(n) ? 'bottom' : /_CLOTH/.test(n) ? 'top' : null);
const vrmPart = (n) => (/_HAIR/.test(n) ? 'hair' : /_(FACE|EYE)|Face_00_SKIN/.test(n) ? 'face' : 'body');
const _vq = new THREE.Quaternion(), _vq2 = new THREE.Quaternion(), _ve = new THREE.Euler(), _vv = new V3(), _vv2 = new V3(), _vm = new THREE.Matrix4();

/* ---------------- look: MToon tuned toward Blade & Soul (soft terminator, warm shade, rim light) ---------------- */
function vrmStyle(m, o = {}) {
  const u = m.uniforms; if (!u || !u.litFactor) return m;
  const n = m.name || '', skin = /SKIN/.test(n), hair = /HAIR/.test(n), eye = /_EYE/.test(n), decal = /_FACE/.test(n) && !skin;
  if (!eye && !decal) {
    u.shadingToonyFactor.value = skin ? 0.42 : hair ? 0.5 : 0.46;
    u.shadingShiftFactor.value = skin ? -0.08 : -0.14;
    // warm, slightly rosy shade instead of VRoid's lavender / blue-grey
    const sh = u.shadeColorFactor.value, w = skin ? [1.0, 0.8, 0.76] : hair ? [0.7, 0.62, 0.6] : [0.78, 0.7, 0.72];
    sh.setRGB(w[0], w[1], w[2]);
    u.giEqualizationFactor.value = 0.55;
    // rim: warm fresnel that follows the light (reads as a back-light at dusk), the VRoid matcap rim a little softer
    u.parametricRimColorFactor.value.setRGB(0.32, 0.25, 0.2);
    if (skin) { // the low-sun tune below (copies too; a copy of an aura'd material doesn't inherit the aura flag)
      if (!VRM_SKIN.has(m)) { delete m.userData.gtaAura; VRM_SKIN.add(m); m.addEventListener('dispose', () => VRM_SKIN.delete(m)); }
      vrmSkinSun(m, VRM_SKIN.k);
    }
    // (cloth / hair a little tighter: their normal maps sparkle at grazing angles)
    u.parametricRimFresnelPowerFactor.value = skin ? 4.5 : 4.2; u.parametricRimLiftFactor.value = 0.01; u.rimLightingMixFactor.value = 0.85;
    if (u.matcapFactor) u.matcapFactor.value.setRGB(0.55, 0.52, 0.5);
  }
  if (m.isOutline) { u.outlineColorFactor.value.setRGB(0.07, 0.045, 0.04); u.outlineLightingMixFactor.value = 0.6; u.outlineWidthFactor.value = Math.min(u.outlineWidthFactor.value, 0.0006); }
  if (o.noNormal && u.normalMap.value) { m.normalMap = null; }
  m.update && m.update(0); // pushes alphaTest / opacity / texture matrices into the uniforms (three-vrm does it in vrm.update)
  return m;
}
// skin under a low sun: the warm, rosy shade and the warm rim above are right by day, but a golden-hour sun (already orange)
// multiplied by them turned faces saturated orange. From ~25° elevation down to the horizon both ease toward a neutral shade
// and a dimmer, neutral rim (k = 0 by day and at night, 1 at sunrise / sunset); the grade side is DayNight's paler low sun
const VRM_SKIN = new Set(); VRM_SKIN.k = 0;
const _skSh = [1.0, 0.8, 0.76], _skSh1 = [0.87, 0.84, 0.86], _skRim = [0.32, 0.25, 0.2], _skRim1 = [0.09, 0.088, 0.085];
function vrmSkinSun(m, k) {
  const u = m.uniforms; if (!u || !u.shadeColorFactor || m.userData.gtaAura) return;
  u.shadeColorFactor.value.setRGB(lerp(_skSh[0], _skSh1[0], k), lerp(_skSh[1], _skSh1[1], k), lerp(_skSh[2], _skSh1[2], k));
  u.parametricRimColorFactor.value.setRGB(lerp(_skRim[0], _skRim1[0], k), lerp(_skRim[1], _skRim1[1], k), lerp(_skRim[2], _skRim1[2], k));
}
Hooks.on('daynight', (p) => {
  const k = DayNight.indoor || p.si < p.mi ? 0 : (1 - smooth(clamp(p.el / 25, 0, 1))) * clamp(p.si / 0.3, 0, 1);
  if (Math.abs(k - VRM_SKIN.k) < 0.004) return;
  VRM_SKIN.k = k; for (const m of VRM_SKIN) vrmSkinSun(m, k);
});
// region recolour in the shader: gtaTint(c) keeps the texture's shading and swaps its hue / brightness for the target colour.
// attr: per-vertex region id (aTint) with 6 slots (compact); else one slot for the whole material (full)
function vrmTintPatch(m, attr) {
  if (m.userData.gtaTint) return m; m.userData.gtaTint = attr ? 2 : 1;
  const U = m.uniforms;
  if (attr) { U.gtaTintC = { value: Array.from({ length: 6 }, () => new THREE.Vector4(1, 1, 1, 0)) }; U.gtaTintL = { value: new Array(6).fill(0.4) }; }
  else { U.gtaTintC1 = { value: new THREE.Vector4(1, 1, 1, 0) }; U.gtaTintL1 = { value: 0.4 }; }
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey;
  const fn = attr
    ? 'uniform vec4 gtaTintC[6]; uniform float gtaTintL[6]; varying float vTint;\nvec3 gtaTint(vec3 c) { int i = int(vTint + 0.5); if (i <= 0) return c; vec4 t = gtaTintC[i];\n  return mix(c, min(t.rgb * (dot(c, vec3(0.2126, 0.7152, 0.0722)) / max(gtaTintL[i], 0.015)), vec3(1.05)), t.a); }\n'
    : 'uniform vec4 gtaTintC1; uniform float gtaTintL1;\nvec3 gtaTint(vec3 c) { return mix(c, min(gtaTintC1.rgb * (dot(c, vec3(0.2126, 0.7152, 0.0722)) / max(gtaTintL1, 0.015)), vec3(1.05)), gtaTintC1.a); }\n';
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    Object.assign(sh.uniforms, attr ? { gtaTintC: U.gtaTintC, gtaTintL: U.gtaTintL } : { gtaTintC1: U.gtaTintC1, gtaTintL1: U.gtaTintL1 });
    if (attr) sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aTint; varying float vTint;\nvoid main() {\n  vTint = aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 litFactor;', 'uniform vec3 litFactor;\n' + fn)
      .replace('diffuseColor *= sampledDiffuseColor;', 'sampledDiffuseColor.rgb = gtaTint(sampledDiffuseColor.rgb);\n    diffuseColor *= sampledDiffuseColor;')
      .replace('material.shadeColor *= texture2D( shadeMultiplyTexture, shadeMultiplyTextureUv ).rgb;', 'material.shadeColor *= gtaTint(texture2D( shadeMultiplyTexture, shadeMultiplyTextureUv ).rgb);');
  };
  m.customProgramCacheKey = () => (key0 ? key0.call(m) : '') + ',gtaTint' + (attr ? 'A' : 'M');
  m.needsUpdate = true;
  return m;
}
// dissolve (the transformation): fragments burn away along the bind-pose height (+ value noise) with a glowing rim.
// gtaDis = (amount 0..1, rim width, rim glow, direction: 1 = feet first, -1 = head first); gtaDisC = rim colour (linear)
function vrmDissolvePatch(m) {
  if (m.userData.gtaDis) return m; m.userData.gtaDis = true;
  const U = m.uniforms; U.gtaDis = { value: new THREE.Vector4(0, 0.07, 5, 1) }; U.gtaDisC = { value: new THREE.Color(1.0, 0.62, 0.16) };
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.gtaDis = U.gtaDis; sh.uniforms.gtaDisC = U.gtaDisC;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vGtaP;\nvoid main() {\n  vGtaP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 litFactor;', 'uniform vec3 litFactor;\nuniform vec4 gtaDis; uniform vec3 gtaDisC; varying vec3 vGtaP;\n' +
      'float gtaHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\n' +
      'float gtaVNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);\n' +
      '  return mix(mix(mix(gtaHash(i), gtaHash(i + vec3(1, 0, 0)), f.x), mix(gtaHash(i + vec3(0, 1, 0)), gtaHash(i + vec3(1, 1, 0)), f.x), f.y),\n' +
      '    mix(mix(gtaHash(i + vec3(0, 0, 1)), gtaHash(i + vec3(1, 0, 1)), f.x), mix(gtaHash(i + vec3(0, 1, 1)), gtaHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }\n')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  float gtaE = 0.0;\n  if (gtaDis.x > 0.0) {\n' +
        '    float h = clamp(vGtaP.y / 1.7, 0.0, 1.0); h = gtaDis.w < 0.0 ? 1.0 - h : h;\n' +
        '    float n = h * 0.72 + gtaVNoise(vGtaP * 23.0) * 0.28 - (gtaDis.x * 1.2 - 0.1);\n' +
        '    if (n < 0.0) discard;\n    gtaE = 1.0 - smoothstep(0.0, gtaDis.y, n);\n  }')
      .replace('gl_FragColor = vec4( col, diffuseColor.a );', 'col = mix(col, gtaDisC * gtaDis.z, gtaE * gtaE);\n  gl_FragColor = vec4( col, diffuseColor.a );');
  };
  m.customProgramCacheKey = () => (key0 ? key0.call(m) : '') + ',gtaDis';
  m.needsUpdate = true;
  return m;
}
// hats (07a pedHat): hair fragments (region 3) above the band and inside the crown's ellipse, in bind space, are cut away.
// c = [x, y, z, rx, rz] (the band centre, the ellipse radii)
function vrmClipPatch(m, c) {
  if (m.userData.gtaClip) return m; m.userData.gtaClip = true;
  const U = m.uniforms; U.gtaClip0 = { value: new THREE.Vector4(c[0], c[1], c[2], 1) }; U.gtaClip1 = { value: new THREE.Vector2(c[3], c[4]) };
  const prev = m.onBeforeCompile, key0 = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.gtaClip0 = U.gtaClip0; sh.uniforms.gtaClip1 = U.gtaClip1;
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vGtaC;\nvoid main() {\n  vGtaC = position;');
    sh.fragmentShader = sh.fragmentShader.replace('uniform vec3 litFactor;', 'uniform vec3 litFactor;\nuniform vec4 gtaClip0; uniform vec2 gtaClip1; varying vec3 vGtaC;')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\n  { vec2 q = (vGtaC.xz - gtaClip0.xz) / gtaClip1; if (vTint > 2.5 && vTint < 3.5 && vGtaC.y > gtaClip0.y && dot(q, q) < 1.0) discard; }');
  };
  m.customProgramCacheKey = () => (key0 ? key0.call(m) : '') + ',gtaClip';
  m.needsUpdate = true;
  return m;
}
// a rig's own copy of a shared template material (the hero: dissolve / aura must not leak onto the cast)
function vrmOwnMat(m, cache) {
  let c = cache.get(m); if (c) return c;
  c = m.clone(); c.name = m.name; c.isOutline = m.isOutline;
  const tint = m.userData.gtaTint; delete c.userData.gtaPrep; delete c.userData.gtaTint; delete c.userData.gtaDis;
  Render.prepMaterial(c); vrmStyle(c);
  if (tint === 1) { vrmTintPatch(c, false); c.uniforms.gtaTintC1.value.copy(m.uniforms.gtaTintC1.value); c.uniforms.gtaTintL1.value = m.uniforms.gtaTintL1.value; }
  vrmDissolvePatch(c); c.update && c.update(0);
  cache.set(m, c);
  return c;
}
// a colour target: '#rrggbb' / 0xrrggbb (sRGB) → linear Vector4 (w = strength)
function vrmTintV(c, s = 1, out = new THREE.Vector4()) { if (c == null) return out.set(1, 1, 1, 0); const k = linHex(c); return out.set(k.r, k.g, k.b, s); }
// mean linear luminance of a texture (alpha-weighted), for the recolour normalisation
const _lumC = new Map();
function vrmTexLum(t) {
  if (!t || !t.image) return 0.4;
  if (_lumC.has(t.image)) return _lumC.get(t.image);
  let l = 0.4;
  try {
    const c = mkCanvas(24, 24), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(t.image, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data; let s = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (a < 0.3) continue; const f = (v) => Math.pow(v / 255, 2.2); s += a * (0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2])); w += a; }
    if (w > 0) l = s / w;
  } catch (e) { /* not drawable */ }
  _lumC.set(t.image, l);
  return l;
}

/* ---------------- far LOD: quadric edge collapse ---------------- */
// Half-edge collapses (a vertex moves onto a neighbour): every kept vertex keeps its own uv / skin / region, so the atlas never
// shows stray texels and nothing shrinks. Uv seams (twin vertices at one position) collapse in pairs along the seam, open
// borders (hair strand edges) only along the border, corners never; a collapse that folds a triangle over is refused.
// A generator: yields now and then so it can run time-sliced (CharLib.lodGeo); returns the geometry.
function* vrmSimplify(g, target, maxErr) {
  const A = g.attributes, P0 = A.position.array, I0 = g.index.array, SI = A.skinIndex.array, SW = A.skinWeight.array;
  // used vertices only (a VRoid primitive carries its whole mesh's vertex buffer)
  const map = new Int32Array(A.position.count).fill(-1), src = [];
  for (let i = 0; i < I0.length; i++) if (map[I0[i]] < 0) { map[I0[i]] = src.length; src.push(I0[i]); }
  const n = src.length, nt = I0.length / 3, T = new Int32Array(I0.length), X = new Float64Array(n * 3), bone = new Int32Array(n);
  for (let i = 0; i < I0.length; i++) T[i] = map[I0[i]];
  for (let v = 0; v < n; v++) {
    const s = src[v]; X[v * 3] = P0[s * 3]; X[v * 3 + 1] = P0[s * 3 + 1]; X[v * 3 + 2] = P0[s * 3 + 2];
    let b = 0; for (let j = 1; j < 4; j++) if (SW[s * 4 + j] > SW[s * 4 + b]) b = j; bone[v] = SI[s * 4 + b];
  }
  // twins (same position: uv / normal seams); triangles per vertex
  const pid = new Int32Array(n), byP = new Map(), pk = new Map(), vt = Array.from({ length: n }, () => []);
  for (let v = 0; v < n; v++) {
    if ((v & 4095) === 4095) yield 0;
    const k = Math.round(X[v * 3] * 2e5) + ',' + Math.round(X[v * 3 + 1] * 2e5) + ',' + Math.round(X[v * 3 + 2] * 2e5);
    let p = pk.get(k); if (p === undefined) { p = pk.size; pk.set(k, p); byP.set(p, []); } pid[v] = p; byP.get(p).push(v);
  }
  for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) vt[T[t * 3 + j]].push(t);
  yield 0;
  const tdead = new Uint8Array(nt), vdead = new Uint8Array(n);
  // directed edge a→b is open when no triangle has b→a (by index: a border or a seam; by position too: a border)
  const hx = new Set(), hp = new Set();
  for (let t = 0; t < nt; t++) { if ((t & 4095) === 4095) yield 0; for (let j = 0; j < 3; j++) { const a = T[t * 3 + j], b = T[t * 3 + (j + 1) % 3]; hx.add(a * n + b); hp.add(pid[a] * n + pid[b]); } }
  // quadrics (10 floats a vertex): triangle planes weighted by relative area, border / seam edges held by a plane across them
  const Q = new Float64Array(n * 10), oin = new Int32Array(n).fill(-1), oout = new Int32Array(n).fill(-1), no = new Uint8Array(n), fb = new Uint8Array(n);
  let area = 0; const nrm = new Float64Array(nt * 4);
  for (let t = 0; t < nt; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], wx = X[c] - X[a], wy = X[c + 1] - X[a + 1], wz = X[c + 2] - X[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz);
    if (l > 1e-12) { nx /= l; ny /= l; nz /= l; }
    nrm[t * 4] = nx; nrm[t * 4 + 1] = ny; nrm[t * 4 + 2] = nz; nrm[t * 4 + 3] = l * 0.5; area += l * 0.5;
  }
  const mA = area / Math.max(1, nt) || 1e-6;
  const addQ = (v, nx, ny, nz, px, py, pz, w) => {
    const d = -(nx * px + ny * py + nz * pz), o = v * 10;
    Q[o] += w * nx * nx; Q[o + 1] += w * nx * ny; Q[o + 2] += w * nx * nz; Q[o + 3] += w * nx * d; Q[o + 4] += w * ny * ny;
    Q[o + 5] += w * ny * nz; Q[o + 6] += w * ny * d; Q[o + 7] += w * nz * nz; Q[o + 8] += w * nz * d; Q[o + 9] += w * d * d;
  };
  for (let t = 0; t < nt; t++) {
    if ((t & 4095) === 4095) yield 0;
    const nx = nrm[t * 4], ny = nrm[t * 4 + 1], nz = nrm[t * 4 + 2], w = Math.min(4, nrm[t * 4 + 3] / mA);
    for (let j = 0; j < 3; j++) {
      const a = T[t * 3 + j], b = T[t * 3 + (j + 1) % 3];
      addQ(a, nx, ny, nz, X[a * 3], X[a * 3 + 1], X[a * 3 + 2], w);
      if (hx.has(b * n + a)) continue;
      // open edge a→b: a plane through it, across the surface
      const border = !hp.has(pid[b] * n + pid[a]), f = border ? 1 : 2; no[a]++; no[b]++; oout[a] = b; oin[b] = a; fb[a] |= f; fb[b] |= f;
      let ex = X[b * 3] - X[a * 3], ey = X[b * 3 + 1] - X[a * 3 + 1], ez = X[b * 3 + 2] - X[a * 3 + 2]; const el = Math.hypot(ex, ey, ez) || 1; ex /= el; ey /= el; ez /= el;
      let mx = ey * nz - ez * ny, my = ez * nx - ex * nz, mz = ex * ny - ey * nx; const ml = Math.hypot(mx, my, mz) || 1; mx /= ml; my /= ml; mz /= ml;
      const bw = border ? 4 : 2;
      addQ(a, mx, my, mz, X[a * 3], X[a * 3 + 1], X[a * 3 + 2], bw); addQ(b, mx, my, mz, X[a * 3], X[a * 3 + 1], X[a * 3 + 2], bw);
    }
  }
  yield 0;
  // kinds: 0 inside, 1 border (one open edge in, one out, no twin), 2 seam (the same, one twin, closed by position), 3 fixed
  const kind = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    const tw = byP.get(pid[v]).length - 1;
    kind[v] = !no[v] ? (tw ? 3 : 0) : no[v] !== 2 || oin[v] < 0 || oout[v] < 0 ? 3 : !tw && fb[v] === 1 ? 1 : tw === 1 && fb[v] === 2 ? 2 : 3;
  }
  const twin = (v) => { const L = byP.get(pid[v]); return L.length === 2 ? (L[0] === v ? L[1] : L[0]) : -1; };
  // the twin of u next along v2's seam (a seam collapse moves v2 onto it)
  const mate = (v2, u) => { for (const w of byP.get(pid[u])) if (w !== u && !vdead[w] && (w === oin[v2] || w === oout[v2])) return w; return -1; };
  const qerr = (v, u) => { const o = v * 10, x = X[u * 3], y = X[u * 3 + 1], z = X[u * 3 + 2];
    return Q[o] * x * x + 2 * Q[o + 1] * x * y + 2 * Q[o + 2] * x * z + 2 * Q[o + 3] * x + Q[o + 4] * y * y + 2 * Q[o + 5] * y * z + 2 * Q[o + 6] * y + Q[o + 7] * z * z + 2 * Q[o + 8] * z + Q[o + 9]; };
  const ban = new Set();
  const cost = (v, u) => {
    if (vdead[u] || ban.has(v * n + u)) return Infinity;
    const k = kind[v];
    if (k === 3) return Infinity;
    if ((k === 1 || k === 2) && u !== oin[v] && u !== oout[v]) return Infinity;
    let e = qerr(v, u);
    if (k === 2) { const v2 = twin(v); if (v2 < 0 || vdead[v2]) return Infinity; const u2 = mate(v2, u); if (u2 < 0) return Infinity; e += qerr(v2, u2); }
    const dx = X[u * 3] - X[v * 3], dy = X[u * 3 + 1] - X[v * 3 + 1], dz = X[u * 3 + 2] - X[v * 3 + 2], d2 = dx * dx + dy * dy + dz * dz;
    return Math.max(0, e) + d2 * (bone[u] !== bone[v] ? 0.08 : 0.002); // short collapses first, joints last
  };
  // a min-heap of [cost, v, u, version]
  const H = [], ver = new Int32Array(n);
  const push = (c, v, u) => { H.push([c, v, u, ver[v]]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
  const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
  const nb = [];
  const evalV = (v) => {
    ver[v]++; if (vdead[v] || kind[v] === 3) return;
    let bc = Infinity, bu = -1; nb.length = 0;
    for (const t of vt[v]) if (!tdead[t]) for (let j = 0; j < 3; j++) { const u = T[t * 3 + j]; if (u !== v && !nb.includes(u)) nb.push(u); }
    for (const u of nb) { const c = cost(v, u); if (c < bc) { bc = c; bu = u; } }
    if (bu >= 0 && bc <= maxErr) push(bc, v, bu);
  };
  // would moving v onto u fold a triangle over, or pinch the surface (more shared neighbours than shared triangles)?
  const ring = (v, S) => { S.clear(); for (const t of vt[v]) if (!tdead[t]) for (let j = 0; j < 3; j++) if (T[t * 3 + j] !== v) S.add(T[t * 3 + j]); return S; };
  const R1 = new Set(), R2 = new Set();
  const flips = (v, u) => {
    ring(v, R1); ring(u, R2); let common = 0, shared = 0;
    for (const w of R1) if (R2.has(w)) common++;
    for (const t of vt[v]) if (!tdead[t] && (T[t * 3] === u || T[t * 3 + 1] === u || T[t * 3 + 2] === u)) shared++;
    if (common !== shared) return true;
    for (const t of vt[v]) {
      if (tdead[t] || nrm[t * 4 + 3] < 1e-10) continue;
      const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2]; if (a === u || b === u || c === u) continue;
      const p = (w) => (w === v ? u : w) * 3, pa = p(a), pb = p(b), pc = p(c);
      const ux = X[pb] - X[pa], uy = X[pb + 1] - X[pa + 1], uz = X[pb + 2] - X[pa + 2], wx = X[pc] - X[pa], wy = X[pc + 1] - X[pa + 1], wz = X[pc + 2] - X[pa + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-12 || (nx * nrm[t * 4] + ny * nrm[t * 4 + 1] + nz * nrm[t * 4 + 2]) / l < 0.3) return true;
    }
    return false;
  };
  const moved = [];
  let live = 0;
  const collapse = (v, u) => {
    vdead[v] = 1; moved.push(u);
    for (const t of vt[v]) {
      if (tdead[t]) continue;
      if (T[t * 3] === u || T[t * 3 + 1] === u || T[t * 3 + 2] === u) { tdead[t] = 1; live--; continue; }
      for (let j = 0; j < 3; j++) if (T[t * 3 + j] === v) T[t * 3 + j] = u;
      vt[u].push(t);
    }
    for (let j = 0; j < 10; j++) Q[u * 10 + j] += Q[v * 10 + j];
    // the border / seam runs on through u
    if (oout[v] === u) { oin[u] = oin[v]; if (oin[v] >= 0) oout[oin[v]] = u; } else if (oin[v] === u) { oout[u] = oout[v]; if (oout[v] >= 0) oin[oout[v]] = u; }
  };
  for (let t = 0; t < nt; t++) if (T[t * 3] !== T[t * 3 + 1] && T[t * 3 + 1] !== T[t * 3 + 2] && T[t * 3] !== T[t * 3 + 2]) live++; else tdead[t] = 1;
  for (let v = 0; v < n; v++) { evalV(v); if ((v & 2047) === 2047) yield 0; }
  let steps = 0;
  while (live > target && H.length) {
    const [, v, u, vr] = pop();
    if (vr !== ver[v] || vdead[v] || vdead[u]) continue;
    const v2 = kind[v] === 2 ? twin(v) : -1, u2 = v2 >= 0 ? mate(v2, u) : -1;
    if (kind[v] === 2 && (u2 < 0 || vdead[v2])) { evalV(v); continue; }
    if (flips(v, u) || (v2 >= 0 && flips(v2, u2))) { ban.add(v * n + u); evalV(v); continue; }
    moved.length = 0; collapse(v, u); if (v2 >= 0) collapse(v2, u2);
    // everyone round the kept vertices looks for a new best move
    for (const w of moved) { evalV(w); for (const t of vt[w]) if (!tdead[t]) for (let j = 0; j < 3; j++) { const x = T[t * 3 + j]; if (x !== w) evalV(x); } }
    if ((++steps & 63) === 0) yield steps;
  }
  // the kept triangles (duplicates once), vertices renumbered
  const out = [], seen = new Set(), rn = new Int32Array(n).fill(-1), keep = [];
  for (let t = 0; t < nt; t++) {
    if (tdead[t]) continue;
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2]; if (a === b || b === c || a === c) continue;
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c), key = (lo * n + (a + b + c - lo - hi)) * n + hi;
    if (seen.has(key)) continue; seen.add(key);
    for (const w of [a, b, c]) { if (rn[w] < 0) { rn[w] = keep.length; keep.push(src[w]); } out.push(rn[w]); }
  }
  const q = new THREE.BufferGeometry(), m = keep.length;
  for (const [name, a] of Object.entries(A)) {
    const s = a.itemSize, arr = new a.array.constructor(m * s);
    for (let i = 0; i < m; i++) for (let j = 0; j < s; j++) arr[i * s + j] = a.array[keep[i] * s + j];
    q.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));
  }
  q.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1));
  q.boundingSphere = g.boundingSphere.clone();
  return q;
}

/* ---------------- templates ---------------- */
const CharLib = {
  T: {}, bases: [], inited: false,
  init() {
    if (!this.inited) for (const k of VRM_ON) Assets.on('vrm:' + k, () => { if (this.inited && !this.bases.includes(k)) this.add(k); });
    this.inited = true; this.bases = VRM_ON.filter((k) => Assets.vrm('vrm:' + k)); return this.bases.length > 0;
  },
  // a base streamed in after the start: in the pool from now on (new walkers / looks pick it up; Hooks 'vrm' tells the crowd)
  add(k) { this.bases = VRM_ON.filter((b) => b === k || this.bases.includes(b)); Hooks.emit('vrm', k); },
  get ready() { if (!this.inited) this.init(); return this.bases.length > 0; },
  // the wanted base, or one of the same gender that did load
  base(k, g) {
    if (k && Assets.vrm('vrm:' + k)) return k;
    g = g || VRM_BASES[k] || 'm';
    return this.bases.find((b) => VRM_BASES[b] === g) || this.bases[0] || null;
  },
  tpl(k) {
    k = this.base(k); if (!k) return null;
    return this.T[k] || (this.T[k] = this.prep(k));
  },
  prep(key) {
    const vrm = Assets.vrm('vrm:' + key), sc = vrm.scene;
    sc.updateMatrixWorld(true);
    const T = { key, g: VRM_BASES[key], vrm, scene: sc, bones: new Map(), hb: {}, clips: new Map(), prims: [], hairBones: new Set(), hairRoots: [], hit: {} };
    sc.traverse((o) => { if (o.isBone) T.bones.set(o.name, o); });
    const H = vrm.humanoid;
    for (const n of Object.keys(H.humanBones)) { const b = H.getRawBoneNode(n); if (b) T.hb[n] = b.name; }
    // primitives by part (a VRoid export: Face / Body / Hair meshes, one primitive per material)
    sc.traverse((o) => { if (!o.isSkinnedMesh) return; const m0 = [].concat(o.material)[0]; T.prims.push({ mesh: o, part: vrmPart(m0.name), mat: m0 }); });
    // hair joints by name (VRoid: HairJoint-<id> under the head; every skin lists every joint, so skins can't tell them apart)
    for (const n of T.bones.keys()) if (/hair/i.test(n) && !/^J_Bip|^J_Adj/.test(n)) T.hairBones.add(n);
    for (const n of T.hairBones) { const b = T.bones.get(n); if (!T.hairBones.has(b.parent.name)) T.hairRoots.push(b); }
    // sizes (metres, rest pose)
    const wy = (n) => { const b = T.bones.get(T.hb[n]); return b ? b.getWorldPosition(_vv).y : 0; };
    T.hipsY = wy('hips'); T.headY = wy('head'); T.eyeY = Math.max(wy('leftEye'), T.headY + 0.06); T.footY = wy('leftFoot');
    // (from the geometry: the rest pose is the bind pose. Box3.setFromObject / computeBoundingSphere on a SkinnedMesh skin every vertex on the CPU)
    const bb = new THREE.Box3(); for (const p of T.prims) { const g = p.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox(); bb.union(g.boundingBox.clone().applyMatrix4(p.mesh.matrixWorld)); }
    T.height = bb.max.y;
    // one enlarged rest bounding sphere per primitive, shared by every copy (a posed SkinnedMesh would recompute it on the CPU)
    for (const p of T.prims) { const g = p.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); p.sphere = g.boundingSphere.clone(); p.sphere.radius = Math.max(p.sphere.radius * 1.35, 1.1); }
    // expressions: morph binds as [prim index, morph index, weight]
    T.expr = {};
    if (vrm.expressionManager) for (const e of vrm.expressionManager.expressions) {
      const L = [];
      for (const b of e.binds) if (b.primitives && b.index !== undefined) for (const pm of b.primitives) { const i = T.prims.findIndex((p) => p.mesh === pm); if (i >= 0) L.push([i, b.index, b.weight]); }
      if (L.length) T.expr[e.expressionName] = L;
    }
    // spring bones: joints by bone name, collider groups by the bone they sit on
    T.springs = [];
    const sbm = vrm.springBoneManager, cgIx = new Map(); T.cgroups = [];
    if (sbm) {
      for (const g of sbm.colliderGroups) { cgIx.set(g, T.cgroups.length); T.cgroups.push(g.colliders.map((c) => ({ bone: c.parent ? c.parent.name : '', shape: c.shape }))); }
      for (const j of sbm.joints) T.springs.push({ bone: j.bone.name, child: j.child ? j.child.name : null, settings: j.settings, groups: j.colliderGroups.map((g) => cgIx.get(g)).filter((i) => i !== undefined), center: j.center ? j.center.name : null });
    }
    // look (+ the dissolve patch on every full material, idle at 0: the hero's own copies and the cast then share one set of
    // shader programs instead of two, which halves the MToon compiles of a first visit)
    const seen = new Set();
    sc.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (!seen.has(m)) { seen.add(m); vrmStyle(m); vrmDissolvePatch(m); } });
    T.mats = [...seen];
    return T;
  },
  // a clip retargeted onto this template's raw bones (hips height scaled to the model)
  clip(T, name) {
    let c = T.clips.get(name); if (c !== undefined) return c;
    const va = Assets.vrma('vrma:' + name);
    if (!va) { if (!Assets.pending('vrma:' + name)) T.clips.set(name, null); else Assets.bump('vrma:' + name); return null; }
    const tracks = [], sc = T.hipsY / (va.restHipsPosition.y || 1), fingers = LOWQ;
    for (const [hb, tr] of va.humanoidTracks.rotation) {
      const n = T.hb[hb]; if (!n) continue;
      if (fingers && /Thumb|Index|Middle|Ring|Little/.test(hb)) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', tr.times, tr.values.map((v, i) => (i % 2 === 0 ? -v : v))));
    }
    for (const [hb, tr] of va.humanoidTracks.translation) {
      const n = T.hb[hb]; if (!n) continue;
      tracks.push(new THREE.VectorKeyframeTrack(n + '.position', tr.times, Array.from(tr.values, (v, i) => (i % 3 !== 1 ? -v : v) * sc)));
    }
    c = new THREE.AnimationClip(name, va.duration, tracks);
    T.clips.set(name, c);
    return c;
  },
  // when a strike lands inside a clip: the moment the hand / foot is furthest out in front (sampled once per clip)
  hitTime(T, name, limb) {
    const k = name + ':' + limb; if (T.hit[k] !== undefined) return T.hit[k];
    const c = this.clip(T, name); if (!c) return Assets.pending('vrma:' + name) ? 0.3 : (T.hit[k] = 0.3);
    const rest = []; T.scene.traverse((o) => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone()]); });
    const mx = new THREE.AnimationMixer(T.scene), a = mx.clipAction(c); a.play();
    const e = T.bones.get(T.hb[limb]), h = T.bones.get(T.hb.hips);
    let best = 0, bt = c.duration * 0.3;
    for (let t = 0; t <= c.duration * 0.75; t += 1 / 30) {
      mx.setTime(t); T.scene.updateMatrixWorld(true);
      const p = e.getWorldPosition(_vv), q = h.getWorldPosition(_vv2), f = -(p.z - q.z) + (limb.includes('Foot') ? p.y * 0.4 : 0); // forward = -Z on a VRM 0.x model
      if (f > best) { best = f; bt = t; }
    }
    mx.stopAllAction(); mx.uncacheRoot(T.scene);
    for (const [o, p, q] of rest) { o.position.copy(p); o.quaternion.copy(q); }
    T.scene.updateMatrixWorld(true);
    return (T.hit[k] = bt);
  },

  /* ---- compact look: per part one merged skinned mesh on the base's atlas ---- */
  compact(T) {
    if (T.cp) return T.cp;
    const A = LOWQ ? 512 : 1024, pad = 2;
    const prims = T.prims.filter((p) => !/EyeExtra|EyeHighlight/.test(p.mat.name) && p.mat.map);
    // atlas: every distinct colour map × colour factor (VRoid hair / cloth maps are often grey, coloured by the material's
    // litFactor: that colour is baked in), scaled so they fill ~75% of the square
    const lin2s = (v) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
    const col = (m) => { const c = m.uniforms && m.uniforms.litFactor ? m.uniforms.litFactor.value : null; return c ? [lin2s(c.r), lin2s(c.g), lin2s(c.b)] : [255, 255, 255]; };
    const ents = new Map();
    for (const p of prims) { const c = col(p.mat), k = p.mat.map.uuid + ':' + c.join(); p.akey = k; if (!ents.has(k)) ents.set(k, { t: p.mat.map, c }); }
    const imgs = [...ents.values()];
    const area = imgs.reduce((s, e) => s + e.t.image.width * e.t.image.height, 0);
    let s = Math.min(0.5, Math.sqrt((A * A * 0.72) / area)), R;
    for (let tries = 0; tries < 12; tries++, s *= 0.9) {
      R = new Map(); let x = 0, y = 0, rowH = 0, ok = true;
      const list = [...ents].map(([k, e]) => ({ k, e, w: Math.max(8, Math.round(e.t.image.width * s)), h: Math.max(8, Math.round(e.t.image.height * s)) })).sort((a, b) => b.h - a.h);
      for (const r of list) {
        if (x + r.w + pad * 2 > A) { x = 0; y += rowH; rowH = 0; }
        if (y + r.h + pad * 2 > A) { ok = false; break; }
        R.set(r.k, { e: r.e, x: x + pad, y: y + pad, w: r.w, h: r.h }); x += r.w + pad * 2; rowH = Math.max(rowH, r.h + pad * 2);
      }
      if (ok) break;
    }
    const cv = mkCanvas(A, A), g = cv.getContext('2d');
    for (const [, r] of R) {
      let im = r.e.t.image; const c = r.e.c;
      if (c[0] < 255 || c[1] < 255 || c[2] < 255) {
        // multiply by the factor, keep the map's own alpha
        const tc = mkCanvas(r.w, r.h), tg = tc.getContext('2d');
        tg.drawImage(im, 0, 0, r.w, r.h); tg.globalCompositeOperation = 'multiply'; tg.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; tg.fillRect(0, 0, r.w, r.h);
        tg.globalCompositeOperation = 'destination-in'; tg.drawImage(im, 0, 0, r.w, r.h); im = tc;
      }
      g.drawImage(im, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2); g.clearRect(r.x, r.y, r.w, r.h); g.drawImage(im, r.x, r.y, r.w, r.h);
    }
    const atlas = new THREE.CanvasTexture(cv); atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = Math.min(4, MAX_ANISO);
    // recolour normalisation per region (mean luminance of the region's own textures)
    const regL = new Array(6).fill(0.4), regN = new Array(6).fill(0);
    for (const p of prims) { const r = VRM_REG[vrmRegion(p.mat.name)] || 0; if (!r) continue; const c = col(p.mat), l = vrmTexLum(p.mat.map) * (0.2126 * (c[0] / 255) ** 2.2 + 0.7152 * (c[1] / 255) ** 2.2 + 0.0722 * (c[2] / 255) ** 2.2); regL[r] = (regL[r] * regN[r] + l) / (regN[r] + 1); regN[r]++; }
    // the material: a copy of the base's cloth MToon (VRM 0.x shade compat etc.) on the atlas, alpha-tested, both sides
    const src = (T.prims.find((p) => /Tops|Body_00_SKIN/.test(p.mat.name)) || T.prims[0]).mat, mat = src.clone();
    delete mat.userData.gtaPrep; delete mat.userData.gtaTint;
    mat.name = T.key + ':atlas'; mat.map = atlas; mat.shadeMultiplyTexture = atlas; mat.normalMap = null; mat.emissiveMap = null; mat.rimMultiplyTexture = null;
    mat.shadingShiftTexture = null; mat.outlineWidthMultiplyTexture = null; mat.uvAnimationMaskTexture = null; mat.isOutline = false;
    mat.transparent = false; mat.depthWrite = true; mat.alphaTest = 0.45; mat.side = THREE.DoubleSide; mat.emissive = new THREE.Color(0, 0, 0);
    if (mat.uniforms.litFactor) mat.uniforms.litFactor.value.setRGB(1, 1, 1); // the factors are in the atlas
    Render.prepMaterial(mat); vrmStyle(mat); mat.name = T.key + ':atlas';
    vrmTintPatch(mat, true); mat.uniforms.gtaTintL.value = regL;
    mat.update(0);
    const parts = {};
    for (const part of ['face', 'body', 'hair']) {
      const ps = prims.filter((p) => p.part === part); if (!ps.length) continue;
      parts[part] = this.merge(ps, R, A);
    }
    return (T.cp = { atlas, mat, parts, pal: new Map() });
  },
  // merge primitives (one skin by bone name) with uvs moved into their atlas rects and a region id per vertex
  merge(ps, R, A) {
    const names = [], ix = new Map(), inv = [];
    for (const p of ps) p.mesh.skeleton.bones.forEach((b, i) => { if (!ix.has(b.name)) { ix.set(b.name, names.length); names.push(b.name); inv.push(p.mesh.skeleton.boneInverses[i]); } });
    let nv = 0, ni = 0; for (const p of ps) { nv += p.mesh.geometry.attributes.position.count; ni += p.mesh.geometry.index ? p.mesh.geometry.index.count : p.mesh.geometry.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), tint = new Float32Array(nv), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const p of ps) {
      const G = p.mesh.geometry, P = G.attributes.position, N = G.attributes.normal, U = G.attributes.uv, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight, c = P.count, r = R.get(p.akey);
      const remap = p.mesh.skeleton.bones.map((b) => ix.get(b.name)), reg = VRM_REG[vrmRegion(p.mat.name)] || 0;
      for (let i = 0; i < c; i++) {
        const k = vo + i;
        pos[k * 3] = P.getX(i); pos[k * 3 + 1] = P.getY(i); pos[k * 3 + 2] = P.getZ(i);
        if (N) { nor[k * 3] = N.getX(i); nor[k * 3 + 1] = N.getY(i); nor[k * 3 + 2] = N.getZ(i); }
        const u = U ? clamp(U.getX(i), 0, 1) : 0, v = U ? clamp(U.getY(i), 0, 1) : 0;
        uv[k * 2] = (r.x + u * r.w) / A; uv[k * 2 + 1] = (r.y + v * r.h) / A;
        for (let j = 0; j < 4; j++) { si[k * 4 + j] = remap[SI.getComponent(i, j)] || 0; sw[k * 4 + j] = SW.getComponent(i, j); }
        tint[k] = reg;
      }
      if (G.index) { const a = G.index; for (let i = 0; i < a.count; i++) idx[io + i] = a.getX(i) + vo; io += a.count; } else { for (let i = 0; i < c; i++) idx[io + i] = vo + i; io += c; }
      vo += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? idx : new Uint16Array(idx), 1));
    g.computeBoundingSphere();
    const sphere = g.boundingSphere.clone(); sphere.radius = Math.max(sphere.radius * 1.35, 1.1);
    return { geo: g, names, inv, bind: ps[0].mesh.bindMatrix.clone(), sphere, tris: ni / 3 };
  },
  // the far geometry of a compact part: [share of the triangles, at most, error cap] per part. Simplified time-sliced in the
  // background on first use (vrmSimplify, ~2 ms slices); until it's ready the full mesh stands in
  LOD: { face: [0.35, 1000, 2e-4], hair: [0.3, 3600, 6e-4], body: [0.26, 3200, 6e-4] },
  lodGeo(P, part) {
    if (P.lo) return P.lo;
    if (!P.loRun) {
      const L = this.LOD[part] || this.LOD.body, it = vrmSimplify(P.geo, Math.min(L[1], Math.round(P.tris * L[0])), L[2]);
      P.loRun = () => {
        if (P.lo) return;
        const t0 = performance.now(); let r;
        try { do r = it.next(); while (!r.done && performance.now() - t0 < 2); } catch (e) { console.warn('[vrm] lod', e); r = { done: true, value: P.geo }; }
        if (r.done) P.lo = r.value; else Jobs.add(P.loRun);
      };
      Jobs.add(P.loRun);
    }
    return P.geo;
  },
  // a compact palette: { top, bottom, hair, shoe, iris } colours (strength 1, or [colour, strength]) → one shared material
  // (+ clip: a hat's hair cut, vrmClipPatch)
  palette(T, pal) {
    const cp = this.compact(T), key = JSON.stringify(pal || {});
    let m = cp.pal.get(key); if (m) return m;
    m = cp.mat.clone(); delete m.userData.gtaPrep; delete m.userData.gtaTint;
    Render.prepMaterial(m); vrmTintPatch(m, true); m.uniforms.gtaTintL.value = cp.mat.uniforms.gtaTintL.value;
    for (const r in VRM_REG) { const v = pal && pal[r]; if (v != null) Array.isArray(v) ? vrmTintV(v[0], v[1], m.uniforms.gtaTintC.value[VRM_REG[r]]) : vrmTintV(v, 1, m.uniforms.gtaTintC.value[VRM_REG[r]]); }
    if (pal && pal.clip) vrmClipPatch(m, pal.clip);
    m.update(0);
    cp.pal.set(key, m);
    return m;
  },
  // full-look materials recoloured per region (cast outfits); cached per template + palette
  fullMats(T, pal) {
    if (!pal) return null;
    const key = JSON.stringify(pal); T.fm = T.fm || new Map();
    let M = T.fm.get(key); if (M) return M;
    M = new Map();
    for (const m of T.mats) {
      const r = vrmRegion(m.name.replace(/ \(Outline\)$/, '')), v = r && pal[r];
      if (v == null) continue;
      const c = m.clone(); delete c.userData.gtaPrep; delete c.userData.gtaTint; delete c.userData.gtaDis; c.name = m.name;
      Render.prepMaterial(c); vrmStyle(c); vrmTintPatch(c, false); vrmDissolvePatch(c);
      Array.isArray(v) ? vrmTintV(v[0], v[1], c.uniforms.gtaTintC1.value) : vrmTintV(v, 1, c.uniforms.gtaTintC1.value);
      c.uniforms.gtaTintL1.value = vrmTexLum(m.map);
      if (c.uniforms.gtaTintC1.value.w >= 1 && c.uniforms.litFactor) c.uniforms.litFactor.value.setRGB(1, 1, 1); // fully recoloured: the base colour factor would tint it again
      c.update(0); M.set(m, c);
    }
    T.fm.set(key, M);
    return M;
  },
};

/* ---------------- one character ---------------- */
// a base's skull: the face-skin box relative to the head joint (rest pose, metres)
function vrmHeadBox(T) {
  if (T.headBox) return T.headBox;
  const p = T.prims.find((q) => /Face_00_SKIN/.test(q.mat.name)) || T.prims.find((q) => q.part === 'face');
  const b = new THREE.Box3(); if (p) b.setFromBufferAttribute(p.mesh.geometry.attributes.position);
  const h = T.bones.get(T.hb.head), hp = h ? h.getWorldPosition(new V3()) : new V3(0, T.headY, 0);
  return (T.headBox = { c: b.getCenter(new V3()).sub(hp), s: b.getSize(new V3()) });
}
// donor hair (Hr) onto body B: uniform scale and head-local offset that put the donor's skull on ours
function vrmHairFit(B, Hr) {
  const a = vrmHeadBox(B), d = vrmHeadBox(Hr);
  if (!(d.s.x > 0.01 && a.s.x > 0.01)) return [1, new V3()];
  const k = clamp((a.s.x / d.s.x + a.s.y / d.s.y + a.s.z / d.s.z) / 3, 0.7, 1.4);
  return [k, a.c.clone().sub(d.c.clone().multiplyScalar(k))];
}
// spec: { body, hair?, face? (base keys, same gender), full (true: every material + outline), springs, pal {top, bottom, hair, shoe, iris},
//         h (height factor), head / leg (proportion factors), shadow (cast shadows) }
const _skipNode = (o) => o.type === 'VRMExpression' || o.name === 'VRMHumanoidRig' || o.name === 'VRMLookAtQuaternionProxy' || (THREE.VRM.VRMSpringBoneCollider && o instanceof THREE.VRM.VRMSpringBoneCollider);
function vrmCopy(src, map, skip) {
  if (_skipNode(src) || (skip && skip(src))) return null;
  let o;
  if (src.isSkinnedMesh) { o = new THREE.SkinnedMesh(src.geometry, src.material); o.bindMode = src.bindMode; }
  else if (src.isMesh) o = new THREE.Mesh(src.geometry, src.material);
  else if (src.isBone) o = new THREE.Bone();
  else o = new THREE.Object3D();
  o.name = src.name; o.position.copy(src.position); o.quaternion.copy(src.quaternion); o.scale.copy(src.scale);
  o.visible = src.visible; o.renderOrder = src.renderOrder; o.frustumCulled = src.frustumCulled;
  if (src.morphTargetInfluences) o.morphTargetInfluences = src.morphTargetInfluences.slice();
  map.set(src, o);
  for (const c of src.children) { const k = vrmCopy(c, map, skip); if (k) o.add(k); }
  return o;
}
let _rigId = 0, _phoneM = null;
class CharRig {
  constructor(spec) {
    this.id = ++_rigId; this.spec = spec;
    const B = CharLib.tpl(spec.body), g = B.g, F = spec.face && spec.face !== B.key ? CharLib.tpl(CharLib.base(spec.face, g)) : B, Hr = spec.hair && spec.hair !== B.key ? CharLib.tpl(CharLib.base(spec.hair, g)) : B;
    this.T = B; this.Hr = Hr; this.full = !!spec.full;
    const map = new Map(), swapF = F !== B, swapH = Hr !== B;
    const skip = (o) => (o.isSkinnedMesh && ((swapF && vrmPart([].concat(o.material)[0].name) === 'face') || (swapH && vrmPart([].concat(o.material)[0].name) === 'hair') || !this.full))
      || (swapH && o.isBone && B.hairBones.has(o.name));
    const model = vrmCopy(B.scene, map, skip);
    this.bones = new Map(); model.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
    // hair from another base: its bone chains hang off our head through a fit node that moves / scales the donor's skull onto
    // ours (the donor head's vertices are bound to that node too); without it a big-headed donor's fringe hangs over the face
    let rm = null;
    if (swapH) {
      const head = this.bones.get(B.hb.head), fit = new THREE.Object3D(), [k, off] = vrmHairFit(B, Hr);
      fit.name = 'hairFit'; fit.position.copy(off); fit.scale.setScalar(k); if (head) head.add(fit); this.hairFit = fit;
      rm = { [Hr.hb.head]: fit };
      for (const r of Hr.hairRoots) {
        const p = r.parent.name === Hr.hb.head ? fit : this.bones.get(r.parent.name); if (!p) continue;
        const c = vrmCopy(r, map); p.add(c); c.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
      }
    }
    this.model = model;
    // meshes
    this.meshes = []; this.face = [];
    const sk = new Map(), skel = (bones, inv, key, r) => { let s = sk.get(key); if (!s) { s = new THREE.Skeleton(bones.map((n) => (r && r[n]) || this.bones.get(n) || this.bones.get(B.hb.hips)), inv); sk.set(key, s); } return s; };
    const shadow = spec.shadow !== false;
    const addMesh = (m, sphere, cast) => { m.boundingSphere = sphere; m.castShadow = shadow && cast; m.receiveShadow = true; this.meshes.push(m); };
    if (this.full) {
      const pal = spec.pal ? [CharLib.fullMats(B, spec.pal), swapH ? CharLib.fullMats(Hr, { hair: spec.pal.hair }) : null, swapF ? CharLib.fullMats(F, { iris: spec.pal.iris }) : null] : [];
      const bind = (T, p, m) => {
        m.bind(skel(p.mesh.skeleton.bones.map((b) => b.name), p.mesh.skeleton.boneInverses, p.mesh.skeleton, T === Hr && swapH && p.part === 'hair' ? rm : null), p.mesh.bindMatrix);
        const M = T === Hr && swapH ? pal[1] : T === F && swapF ? pal[2] : pal[0];
        if (M) m.material = Array.isArray(m.material) ? m.material.map((x) => M.get(x) || x) : M.get(m.material) || m.material;
        if (spec.outline === false && Array.isArray(m.material)) m.material = m.material[0];
        if (spec.own) { const oc = this.ownC || (this.ownC = new Map()); m.material = Array.isArray(m.material) ? m.material.map((x) => vrmOwnMat(x, oc)) : vrmOwnMat(m.material, oc); }
        addMesh(m, p.sphere, !/_EYE|_FACE/.test(p.mat.name));
        if (p.part === 'face') this.face.push([T.prims.indexOf(p), m]);
      };
      for (const p of B.prims) { const m = map.get(p.mesh); if (m) bind(B, p, m); }
      const extra = (T, part) => { for (const p of T.prims) if (p.part === part) { const m = vrmCopy(p.mesh, map); model.add(m); bind(T, p, m); } };
      if (swapF) extra(F, 'face');
      if (swapH) extra(Hr, 'hair');
      this.exprT = F.expr; this.faceT = F;
    } else {
      const parts = [['face', F], ['body', B], ['hair', Hr]], pm = CharLib.palette(B, spec.pal);
      for (const [part, T] of parts) {
        const cp = CharLib.compact(T), P = cp.parts[part]; if (!P) continue;
        const m = new THREE.SkinnedMesh(P.geo, T === B ? pm : CharLib.palette(T, part === 'hair' ? { hair: spec.pal && spec.pal.hair } : { iris: spec.pal && spec.pal.iris }));
        m.name = part; model.add(m); (this.cparts || (this.cparts = [])).push([m, P, part]);
        m.bind(skel(P.names, P.inv, P, T === Hr && swapH && part === 'hair' ? rm : null), P.bind);
        addMesh(m, P.sphere, part !== 'face');
      }
    }
    // proportions: Blade & Soul-ish head / legs, height; the model stands on y = 0 whatever the legs
    const hk = spec.head ?? CHAR_HEAD, lk = spec.leg ?? CHAR_LEG;
    const b = (n) => this.bones.get(B.hb[n]);
    this.b = { hips: b('hips'), spine: b('spine'), chest: b('chest'), upperChest: b('upperChest') || b('chest'), neck: b('neck'), head: b('head'), eyeL: b('leftEye'), eyeR: b('rightEye'),
      armL: b('leftUpperArm'), armR: b('rightUpperArm'), foreL: b('leftLowerArm'), foreR: b('rightLowerArm'), handL: b('leftHand'), handR: b('rightHand'),
      legL: b('leftUpperLeg'), legR: b('rightUpperLeg'), kneeL: b('leftLowerLeg'), kneeR: b('rightLowerLeg'), footL: b('leftFoot'), footR: b('rightFoot') };
    if (this.b.head) this.b.head.scale.setScalar(hk);
    if (this.b.legL) { this.b.legL.scale.setScalar(lk); this.b.legR.scale.setScalar(lk); }
    const legLen = Math.max(0.5, B.hipsY - B.footY + 0.1);
    this.k = CHAR_K * (spec.h || 1);
    this.root = new THREE.Group(); this.root.name = 'char:' + B.key;
    this.inner = new THREE.Group(); this.inner.rotation.y = Math.PI; // VRM 0.x faces -Z
    this.inner.position.y = legLen * (lk - 1) * this.k; this.inner.scale.setScalar(this.k);
    this.inner.add(model); this.root.add(this.inner);
    const lift = legLen * (lk - 1); // the head scales about its joint
    this.height = (B.headY + (B.height - B.headY) * hk + lift) * this.k; this.eyeY = (B.headY + (B.eyeY - B.headY) * hk + lift) * this.k;
    // animation
    this.mixer = new THREE.AnimationMixer(model);
    this.acts = new Map(); this.cur = null; this.curK = ''; this.one = null; this.oneK = ''; this.next = null; this.hold = -1;
    // face
    this.ex = {}; this.exW = {}; this.blinkT = rand(1, 4); this.blinkW = 0; this.talkW = 0; this.talk = false;
    // relaxed hands: the clips hold loose fists; at ease the fingers open into a soft curl (right hand +X, palm down: curl about Z)
    this.fing = []; this.relax = 0;
    for (const sd of ['left', 'right']) for (const f of ['Index', 'Middle', 'Ring', 'Little']) ['Proximal', 'Intermediate', 'Distal'].forEach((j, i) => {
      const bn = this.bones.get(B.hb[sd + f + j]); if (!bn) return;
      const a = [0.2, 0.3, 0.22][i] + (f === 'Little' ? 0.12 : f === 'Ring' ? 0.06 : 0);
      this.fing.push([bn, new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), sd === 'right' ? -a : a)]);
    });
    this.lookAt = null; this.lk = { yaw: 0, pitch: 0 }; this.lookAmt = 0;
    this.props = []; this.over = null; this.lodSkip = 0; this.acc = 0; this.visibleT = 0; this.off = false; this.fresh = true;
    // spring bones (hair, skirts): the hero, the cast, the nearest few
    this.spring = null; this.springOn = false;
    if (spec.springs && !LOWQ) this.buildSprings([B, Hr]);
    model.updateMatrixWorld(true);
    this.play('idle', { fade: 0 });
    Chars.add(this);
  }
  buildSprings(Ts) {
    const V = THREE.VRM; if (!V || !V.VRMSpringBoneManager) return;
    const mgr = new V.VRMSpringBoneManager(), cache = new Map(), [B, Hr] = Ts;
    const group = (T, gi) => {
      const k = T.key + gi; if (cache.has(k)) return cache.get(k);
      const cols = [];
      for (const c of T.cgroups[gi] || []) { const bn = T === Hr && Hr !== B && c.bone === Hr.hb.head && this.hairFit ? this.hairFit : this.bones.get(c.bone); if (!bn) continue; const col = new V.VRMSpringBoneCollider(c.shape); bn.add(col); cols.push(col); }
      const g = { colliders: cols, name: k }; cache.set(k, g); return g;
    };
    // body springs (skirt, ribbons) from the body base; hair springs from whichever base the hair came from
    const add = (T, pick) => {
      for (const s of T.springs) {
        if (!pick(s)) continue;
        const bone = this.bones.get(s.bone); if (!bone) continue;
        const j = new V.VRMSpringBoneJoint(bone, s.child ? this.bones.get(s.child) || null : null, s.settings, s.groups.map((gi) => group(T, gi)));
        if (s.center) j.center = this.bones.get(s.center) || null;
        mgr.addJoint(j);
      }
    };
    add(B, (s) => Hr === B || !B.hairBones.has(s.bone));
    if (Hr !== B) add(Hr, (s) => Hr.hairBones.has(s.bone));
    if (!mgr.joints.size) return;
    this.spring = mgr; this.springOn = true;
    this.model.updateMatrixWorld(true);
    mgr.setInitState();
  }
  // ---- animation state ----
  act(name) {
    let a = this.acts.get(name);
    if (a === undefined) {
      const c = CharLib.clip(this.T, name);
      a = c ? this.mixer.clipAction(c) : null;
      if (a) { const L = VRM_CLIPS[name]; a.setLoop(L && L[0] ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; }
      if (a || !Assets.pending('vrma:' + name)) this.acts.set(name, a); // (a clip still streaming: ask again next time)
    }
    return a;
  }
  // main (looping or held) state; o: { fade, rate, at (start fraction), hold (freeze at fraction), sync (fraction to jump to when switching) }
  play(name, o = {}) {
    if (this.curK === name && !o.restart) { if (o.rate !== undefined && this.cur) this.cur.timeScale = this.hold >= 0 ? 0 : o.rate; return this; }
    let a = this.act(name);
    if (!a) { if (name !== 'idle') return this.play('idle', o); return this; }
    const fade = o.fade ?? 0.25, prev = this.cur;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.timeScale = o.rate ?? 1;
    if (o.loop !== undefined) a.setLoop(o.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    if (o.at !== undefined) a.time = o.at * a.getClip().duration;
    this.hold = o.hold ?? -1;
    if (this.hold >= 0) { a.time = this.hold * a.getClip().duration; a.timeScale = 0; }
    a.play();
    if (!this.one) { if (prev && prev !== a && fade > 0) a.crossFadeFrom(prev, fade, false); else if (prev && prev !== a) prev.stop(); }
    else a.setEffectiveWeight(0);
    this.cur = a; this.curK = name;
    return this;
  }
  // one-shot over the main state; o: { fade, rate, then (main state after), start (fraction) } → the clip's duration at that rate
  once(name, o = {}) {
    const a = this.act(name); if (!a) return 0;
    const fade = o.fade ?? 0.12, from = this.one || this.cur;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.timeScale = o.rate ?? 1; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    if (o.start) a.time = o.start * a.getClip().duration;
    a.play();
    if (from && from !== a) { if (fade > 0) a.crossFadeFrom(from, fade, false); else from.stop(); }
    this.one = a; this.oneK = name; this.oneEnd = o.end ?? 1; this.oneBack = o.back ?? 0.2;
    if (o.then) { this.curK = ''; this.nextK = o.then; } else this.nextK = null;
    return (a.getClip().duration * (this.oneEnd - (o.start || 0))) / Math.max(0.01, a.timeScale);
  }
  get busy() { return !!this.one; }
  stopOnce(fade = 0.15) { if (!this.one) return; this.endOnce(fade); }
  endOnce(fade) {
    const a = this.one; this.one = null; this.oneK = '';
    const k = this.nextK || this.curK || 'idle'; this.nextK = null;
    let b = k === this.curK && this.cur ? this.cur : this.act(k) || this.act('idle');
    if (b !== this.cur) { b.reset(); b.play(); this.cur = b; this.curK = k; this.hold = -1; }
    b.enabled = true; b.setEffectiveWeight(1);
    if (fade > 0) b.crossFadeFrom(a, fade, false); else a.stop();
  }
  // ---- face ----
  expr(name, w = 1) { this.ex[name] = w; return this; }
  clearExpr() { for (const k in this.ex) this.ex[k] = 0; return this; }
  look(p) { this.lookAt = p; return this; }
  // ---- per frame (Chars) ----
  update(dt) {
    // teleported (spawned, placed by a scene, streamed back in): settle the hair where it is now instead of whipping it across
    const rp = this.root.position; if (this._lp) { if (Math.abs(rp.x - this._lp.x) + Math.abs(rp.z - this._lp.z) > 3) this.needSnap = true; this._lp.copy(rp); } else { this._lp = rp.clone(); this.needSnap = true; }
    if (this.needSnap) { this.needSnap = false; if (this.springOn) this.snap(); }
    if (this.one) {
      const a = this.one, d = a.getClip().duration;
      if (a.time >= d * this.oneEnd - this.oneBack * a.timeScale || !a.isRunning()) this.endOnce(this.oneBack);
    }
    this.mixer.update(dt);
    if (this.hold >= 0 && this.cur) this.cur.time = this.hold * this.cur.getClip().duration;
    // faded-out actions stay scheduled in the mixer: stop them
    if ((this.gcT = (this.gcT || 0) + dt) > 1) { this.gcT = 0; for (const a of this.acts.values()) if (a && a !== this.cur && a !== this.one && a.isScheduled() && a.getEffectiveWeight() === 0) a.stop(); }
    const rt = VRM_FIST.test(this.one ? this.oneK : this.curK) ? 0 : 0.85; this.relax += (rt - this.relax) * Math.min(1, dt * 8);
    this.pose(dt);
    if (this.full) this.faceUpdate(dt);
    if (this.springOn) { this.root.updateMatrixWorld(true); this.spring.update(Math.min(dt, 0.05)); }
  }
  // after the clip: a longer stride, head / eyes toward a target, pose overrides (bike pedals, umbrella arm, pointing)
  pose(dt) {
    const B = this.b, dk = dt || 0.016;
    if (this.relax > 0.02 && this.lodLv !== 1) for (const [bn, q] of this.fing) bn.quaternion.slerp(q, this.relax);
    // stride (Actors.loco on fast runs): the thighs swing wider about their running mean pitch, so a planted foot keeps pace
    const sk = !this.one && this.stride > 1 && (VRM_CLIPS[this.curK] || [])[1] ? this.stride : 1;
    this.strideW = (this.strideW || 1) + (sk - (this.strideW || 1)) * Math.min(1, dk * 6);
    if (this.strideW > 1.005 && B.legL) {
      const M = this.legM || (this.legM = [null, null]), km = Math.min(1, dk * 2.5);
      for (let i = 0; i < 2; i++) {
        const leg = i ? B.legR : B.legL; _ve.setFromQuaternion(leg.quaternion, 'XYZ');
        const m = (M[i] = M[i] === null ? _ve.x : M[i] + (_ve.x - M[i]) * km);
        _ve.x = m + (_ve.x - m) * this.strideW; leg.quaternion.setFromEuler(_ve);
      }
    } else if (this.legM) this.legM = null;
    let yaw = 0, pitch = 0;
    if (this.lookAt && B.head) {
      this.root.updateMatrixWorld(true);
      B.head.getWorldPosition(_vv);
      const dx = this.lookAt.x - _vv.x, dy = this.lookAt.y - _vv.y, dz = this.lookAt.z - _vv.z, h = this.root.rotation.y;
      const fx = Math.sin(h), fz = Math.cos(h), lx = dx * fz - dz * fx, lz = dx * fx + dz * fz; // heading frame: lz forward, lx toward the character's left
      yaw = clamp(Math.atan2(lx, lz), -1.1, 1.1); pitch = clamp(Math.atan2(dy, Math.hypot(lx, lz)), -0.5, 0.45);
      if (lz < -0.3 * Math.abs(lx)) yaw = Math.sign(yaw) * 0.9; // behind: over the shoulder, not a full turn
    }
    const L = this.lk, k = 1 - Math.exp(-6 * (dt || 0.016));
    L.yaw += (yaw - L.yaw) * k; L.pitch += (pitch - L.pitch) * k;
    if (B.neck && (Math.abs(L.yaw) > 1e-3 || Math.abs(L.pitch) > 1e-3)) {
      // VRM 0.x bones: +Y up, the model looks down -Z; yaw about Y, pitch about X (positive = up)
      B.neck.quaternion.multiply(_vq.setFromEuler(_ve.set(L.pitch * 0.35, L.yaw * 0.4, 0)));
      B.head.quaternion.multiply(_vq.setFromEuler(_ve.set(L.pitch * 0.65, L.yaw * 0.6, 0)));
      if (B.eyeL && this.full) { const q = _vq.setFromEuler(_ve.set(L.pitch * 0.25, L.yaw * 0.25, 0)); B.eyeL.quaternion.copy(q); B.eyeR.quaternion.copy(q); }
    }
    const O = this.over;
    if (O) {
      // legs (bike pedals: radians forward on each thigh, knees bent to match)
      if (O.legL !== undefined && B.legL) {
        B.legL.quaternion.multiply(_vq.setFromAxisAngle(_vv.set(1, 0, 0), O.legL)); B.legR.quaternion.multiply(_vq.setFromAxisAngle(_vv.set(1, 0, 0), O.legR));
        B.kneeL.quaternion.multiply(_vq.setFromAxisAngle(_vv.set(1, 0, 0), -O.kneeL)); B.kneeR.quaternion.multiply(_vq.setFromAxisAngle(_vv.set(1, 0, 0), -O.kneeR));
      }
      // right arm up (an umbrella / pointing): blend w toward a fixed pose
      if (O.armR && B.armR) {
        const w = O.armR.w ?? 1;
        B.armR.quaternion.slerp(_vq.setFromEuler(_ve.set(O.armR.x || 0, O.armR.y || 0, O.armR.z || 0)), w);
        if (B.foreR) B.foreR.quaternion.slerp(_vq.setFromEuler(_ve.set(0, O.armR.fy || 0, O.armR.fz || 0)), w);
      }
      if (O.armL && B.armL) {
        const w = O.armL.w ?? 1;
        B.armL.quaternion.slerp(_vq.setFromEuler(_ve.set(O.armL.x || 0, O.armL.y || 0, O.armL.z || 0)), w);
        if (B.foreL) B.foreL.quaternion.slerp(_vq.setFromEuler(_ve.set(0, O.armL.fy || 0, O.armL.fz || 0)), w);
      }
    }
  }
  faceUpdate(dt) {
    const T = this.faceT, E = this.exprT; if (!E || !this.face.length) return;
    // blink every few seconds (not while smiling hard / knocked out)
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkW = 1; this.blinkT = rand(2, 5.5); }
    this.blinkW = Math.max(0, this.blinkW - dt * 7);
    const bl = this.blinkW > 0 ? Math.sin(Math.min(1, this.blinkW) * Math.PI) : 0;
    const w = this.exW, k = 1 - Math.exp(-8 * dt);
    for (const n in this.ex) w[n] = (w[n] || 0) + ((this.ex[n] || 0) - (w[n] || 0)) * k;
    this.talkW = this.talk ? 0.35 + 0.35 * Math.sin(G.time * 17) * Math.sin(G.time * 5.3) : Math.max(0, this.talkW - dt * 4);
    const block = Math.max(w.happy || 0, w.ko || 0, w.Surprised || 0);
    for (const [, m] of this.face) if (m.morphTargetInfluences) m.morphTargetInfluences.fill(0);
    const add = (name, v) => { const L = E[name]; if (!L || v < 0.005) return; for (const [pi, mi, bw] of L) { const e = this.face.find((f) => f[0] === pi); if (e && e[1].morphTargetInfluences) e[1].morphTargetInfluences[mi] += bw * v; } };
    for (const n in w) if (n !== 'blink') add(n, w[n]);
    add('blink', Math.max(bl * (1 - block), w.blink || 0));
    add('aa', Math.max(0, this.talkW));
  }
  // a prop in a hand bone (hand space: +X along the fingers of the right hand, -X for the left)
  attach(obj, bone = 'handR') { const b = this.b[bone] || this.bones.get(bone); if (!b) return null; b.add(obj); this.props.push(obj); return obj; }
  detach(obj) { if (obj && obj.parent) obj.parent.remove(obj); const i = this.props.indexOf(obj); if (i >= 0) this.props.splice(i, 1); }
  // a phone in the right hand (for the phone_call clip): made on first use, then only shown / hidden
  phone(on) {
    if (!on && !this.ph) return;
    if (!this.ph) {
      if (!_phoneM) { _phoneM = [new THREE.BoxGeometry(0.145, 0.009, 0.07), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.35, metalness: 0.6 })]; Render.prepMaterial(_phoneM[1]); }
      this.ph = new THREE.Mesh(_phoneM[0], _phoneM[1]); this.ph.position.set(0.075, -0.028, 0.012); this.ph.rotation.set(0, 0.15, 0.1);
      if (!this.attach(this.ph, 'handR')) { this.ph = null; return; }
    }
    this.ph.visible = !!on;
  }
  // teleported / re-shown: settle the hair where it is
  snap() { if (this.spring) { this.root.updateMatrixWorld(true); this.spring.reset(); } }
  setSprings(on) { if (!this.spring || on === this.springOn) return; this.springOn = on; if (on) this.snap(); }
  // compact rigs: 1 = the simplified far geometry (same skeleton / bone order), 0 = full
  setLod(lv) {
    if (!this.cparts || this.lodLv === lv) return;
    let ok = true; for (const [, P, part] of this.cparts) if (lv && CharLib.lodGeo(P, part) === P.geo) ok = false;
    if (lv && !ok) return; // (still being made)
    this.lodLv = lv; for (const [m, P, part] of this.cparts) m.geometry = lv ? P.lo : P.geo;
  }
  // burn away (t 0 → 1) / build up (1 → 0) in light; dir 1 = feet first, -1 = head first (spec.own rigs only)
  dissolve(t, dir = 1, col = null) {
    if (!this.ownC) return;
    for (const m of this.ownC.values()) { const u = m.uniforms.gtaDis.value; u.x = t; u.w = dir; if (col) m.uniforms.gtaDisC.value.copy(col); }
    this.dis = t; this.noShadow = t > 0.2;
  }
  shadows(on) { on = on && !this.noShadow; if (this.castOn === on) return; this.castOn = on; for (const m of this.meshes) m.castShadow = on && m.name !== 'face' && !/_EYE|_FACE/.test([].concat(m.material)[0].name); }
  // world position of a bone (bubble heights, effects)
  bonePos(n = 'head', out = new V3()) { const b = this.b[n] || this.bones.get(n); return b ? b.getWorldPosition(out) : out.copy(this.root.position); }
  dispose() {
    Chars.remove(this);
    if (this.root.parent) this.root.parent.remove(this.root);
    this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model);
    const sk = new Set(); for (const m of this.meshes) if (m.skeleton) sk.add(m.skeleton);
    for (const s of sk) s.dispose();
    if (this.ownC) for (const m of this.ownC.values()) m.dispose();
    this.disposed = true;
  }
}

/* ---------------- every character, updated right before each render ---------------- */
const Chars = {
  list: [], lastG: -1, lastR: 0, frameN: 0, _f: new THREE.Frustum(), _pm: new THREE.Matrix4(), _s: new THREE.Sphere(),
  stats: { n: 0, anim: 0, spring: 0, ms: 0 }, // ms: CPU time of the last frame's animation / spring / pose pass
  add(r) { this.list.push(r); },
  remove(r) { const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); },
  frame() {
    const t0 = performance.now(), now = t0, live = typeof G !== 'undefined' && G.started;
    let dt = live ? G.time - (this.lastG < 0 ? G.time : this.lastG) : (now - (this.lastR || now)) / 1000;
    this.lastG = live ? G.time : -1; this.lastR = now;
    dt = clamp(dt, 0, 0.1);
    this.frameN++;
    camera.updateMatrixWorld(); this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._f.setFromProjectionMatrix(this._pm);
    const c = camera.position, lo = Render.quality === 'low' || LOWQ;
    let na = 0, ns = 0;
    for (const r of this.list.slice()) {
      const R = r.root;
      if (!R.parent) { if ((r.orphanT = (r.orphanT || 0) + dt) > 3) r.dispose(); continue; } // taken out of the scene without dispose()
      r.orphanT = 0;
      if (!R.visible) { r.acc += dt; continue; }
      const d = R.position.distanceTo(c), on = this._f.intersectsSphere(this._s.set(R.position, 2.2 * r.k));
      // far / off screen: animate less often (their clock keeps running)
      const every = !on ? 8 : d < 22 || r.full ? 1 : d < 45 ? 2 : 3;
      r.acc += dt;
      if ((this.frameN + r.id) % every && !r.fresh) continue;
      r.fresh = false;
      const step = r.acc; r.acc = 0;
      if (r.spring) r.setSprings(on && !lo && (r.full || d < 16));
      // the crowd: simplified past ~14 m (≈26k → 7k triangles a person), sun shadows only close up
      if (r.cparts) r.setLod(d > (lo ? 9 : 14) + (r.lodLv ? -1.5 : 1.5) ? 1 : 0);
      r.shadows(d < (lo ? 12 : r.full ? 45 : 18));
      r.update(step); na++; if (r.springOn) ns++;
    }
    this.stats.n = this.list.length; this.stats.anim = na; this.stats.spring = ns; this.stats.ms = +(performance.now() - t0).toFixed(2);
  },
};
Hooks.init(function vrmInit() {
  CharLib.init();
  if (typeof Peds !== 'undefined' && Peds.initImp) guard('imp.init', () => Peds.initImp());
  // the HUD portrait: the anime face (or the photo sticker); rendered after the shader warm-up (its studio lights compile their own programs)
  if (typeof UI !== 'undefined' && CharLib.ready) Warm.after(() => HeroFace.refreshPortraits());
  const r0 = Render.render;
  // far-crowd sprites bake one look per frame once the warm-up is done (each bake is a small studio render)
  Render.render = function (t) { guard('Chars.frame', () => Chars.frame()); if (CharImp.queue.length && Warm.done) CharImp.step(); return r0.call(this, t); };
  setTimeout(() => { if (window.GTA) Object.assign(window.GTA, { Chars, CharLib, CharRig, CharPortrait, CharImp, Life, Corpses }); }, 0);
});

/* ---------------- portraits: a small render of a character's face (dialogue box, HUD) ---------------- */
const CharPortrait = {
  cache: new Map(), rt: null, sc: null, cam: null,
  // spec as for CharRig (+ o.bust: shoulders too); a canvas, made once per key
  get(key, spec, o = {}) {
    let c = this.cache.get(key); if (c) return c;
    if (Render.soft && !DEV.portraits) return null; // software GL (headless tests): every extra light setup is a slow shader compile
    c = guard('portrait', () => this.make(spec, o)) || null;
    if (c) this.cache.set(key, c);
    return c;
  },
  // the little studio: warm key + rim light, and the ACES / sRGB pass that turns a linear render into bytes
  studio() {
    if (this.sc) return;
    this.sc = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xfff4ea, 0x6b5a52, 1.25 * LIGHT_K); this.sc.add(hemi);
    const k = new THREE.DirectionalLight(0xfff0e0, 1.6 * LIGHT_K); k.position.set(1.6, 2.4, 3); this.sc.add(k);
    const rim = new THREE.DirectionalLight(0xffc89a, 1.2 * LIGHT_K); rim.position.set(-2.5, 1.5, -2.5); this.sc.add(rim);
    this.lights = [[hemi, hemi.intensity], [k, k.intensity], [rim, rim.intensity]];
    this.cam = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
    this.q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uExp: { value: 1.0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tMap; uniform float uExp; uniform vec4 uRect; varying vec2 vUv;\n' +
        'vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }\n' +
        'void main() { vec4 c = texture2D(tMap, uRect.xy + vUv * uRect.zw); vec3 m = aces(c.rgb / max(c.a, 1e-4) * uExp); m = mix(m * 12.92, 1.055 * pow(m, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, m)); gl_FragColor = vec4(m, c.a); }',
    }));
    this.q.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.q); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  },
  // compile a look's programs under the studio lights in the background (the first portrait would otherwise stall on them)
  async warm(spec) {
    if (!renderer || !CharLib.ready || Warm.skip()) return;
    this.studio(); this.target(256, 256);
    const r = new CharRig(Object.assign({ springs: false, shadow: false }, spec, { full: true, own: false })); Chars.remove(r);
    this.sc.add(r.root); r.update(0.016);
    try { await Warm.compile(r.root, this.sc, this.rt, this.cam); } finally { this.sc.remove(r.root); r.dispose(); }
  },
  target(W, H) {
    if (this.rt && this.rt.width === W && this.rt.height === H) return;
    if (this.rt) { this.rt.dispose(); this.out.dispose(); }
    // linear HDR render, then ACES + sRGB into bytes (render targets get no tone mapping / output encoding)
    this.rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType });
    this.out = new THREE.WebGLRenderTarget(W, H);
  },
  // light level: the sprites are baked bright (the crowd shader dims them to the sky), a face close-up about as lit as the street
  lit(k) { for (const [l, i] of this.lights) l.intensity = i * k; },
  make(spec, o) {
    if (!renderer || !CharLib.ready) return null;
    const W = o.w || 256, H = o.h || 256;
    this.studio(); this.target(W, H);
    const r = new CharRig(Object.assign({ springs: false, shadow: false }, spec, { full: true, own: false }));
    Chars.remove(r); this.lit(o.lit ?? 0.5);
    if (o.anim) r.play(o.anim, { fade: 0, hold: o.at ?? 0.3 });
    if (o.expr) r.expr(o.expr, 1);
    r.exW = Object.assign({}, r.ex);
    r.root.rotation.y = o.turn ?? 0.35; this.sc.add(r.root);
    r.update(0.016); r.root.updateMatrixWorld(true);
    const hp = r.bonePos('head', new V3()), ey = hp.y + 0.075 * r.k;
    const bust = o.bust, dist = bust ? 1.35 : 0.72;
    this.cam.aspect = W / H; this.cam.position.set(Math.sin(0.12) * dist, ey + (bust ? 0.02 : 0.03), dist); this.cam.lookAt(hp.x, bust ? ey - 0.2 : ey - 0.03, hp.z);
    this.cam.updateProjectionMatrix();
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(this.sc, this.cam);
    this.q.material.uniforms.tMap.value = this.rt.texture; this.q.material.uniforms.uExp.value = o.exp || 1.1;
    renderer.setRenderTarget(this.out); renderer.clear(); renderer.render(this.qs, this.qc);
    const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(this.out, 0, 0, W, H, px);
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.shadowMap.autoUpdate = prevSh;
    this.sc.remove(r.root); r.dispose();
    const cv = mkCanvas(W, H), g = cv.getContext('2d'), im = g.createImageData(W, H);
    for (let y = 0; y < H; y++) im.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // GL rows are bottom-up
    g.putImageData(im, 0, 0);
    if (o.bg) { const b = mkCanvas(W, H), bg = b.getContext('2d'); const gr = bg.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H / 2, W * 0.7); gr.addColorStop(0, o.bg[0]); gr.addColorStop(1, o.bg[1]); bg.fillStyle = gr; bg.fillRect(0, 0, W, H); bg.drawImage(cv, 0, 0); return b; }
    return cv;
  },
};

/* ---------------- far crowd: sprites of each look pre-rendered from 8 directions (idle + 3 walk frames), one instanced draw ---------------- */
// (e-bike riders: seated on the bike in every frame, baked at half scale into a cell twice as wide / tall: wide)
const CharImp = {
  DIRS: 8, FR: 4, CW: LOWQ ? 32 : 44, CH: LOWQ ? 64 : 88, rows: new Map(), wide: new Set(), queue: [], mesh: null, cap: LOWQ ? 60 : 90, n: 0, hdr: null, ldr: null,
  // specs: [[key, CharRig spec]] — baked one look per frame, before the frame's own render
  init(specs) {
    if (!renderer || this.mesh) return;
    const W = this.DIRS * this.FR * this.CW, H = Math.max(1, specs.length) * this.CH;
    this.W = W; this.H = H;
    this.ldr = new THREE.WebGLRenderTarget(W, H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.hdr = new THREE.WebGLRenderTarget(W, this.CH, { type: THREE.HalfFloatType });
    const g = new THREE.PlaneGeometry(1, 2); g.translate(0, 1, 0);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 2), 2).setUsage(THREE.DynamicDrawUsage); g.setAttribute('aCell', cell); this.cell = cell;
    const m = new THREE.MeshBasicMaterial({ map: this.ldr.texture, alphaTest: 0.45, side: THREE.DoubleSide });
    const U = { uCell: { value: new THREE.Vector2(this.CW / W, this.CH / H) } };
    m.onBeforeCompile = (sh) => { sh.uniforms.uCell = U.uCell; sh.vertexShader = 'attribute vec2 aCell; uniform vec2 uCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv = aCell + uv * uCell;\n#endif'); };
    m.customProgramCacheKey = () => 'charImp';
    this.mesh = new THREE.InstancedMesh(g, m, this.cap); this.mesh.count = 0; this.mesh.name = 'crowd:sprites'; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    specs.forEach(([key, spec], i) => this.queue.push({ key, spec, row: i }));
  },
  has(key) { return this.rows.has(key); },
  // bake one queued look (called before a render; restores the renderer state)
  step() {
    const q = this.queue.shift(); if (!q) return;
    guard('imp.bake', () => this.bake(q));
  },
  bake(q) {
    const P = CharPortrait; P.studio(); P.lit(1);
    const wide = !!q.spec.bike, r = new CharRig(Object.assign({}, q.spec, { full: false, springs: false, shadow: false })); Chars.remove(r);
    const cam = wide ? this._camW || (this._camW = new THREE.OrthographicCamera(-1.1, 1.1, 4.2, -0.2, 0.1, 20)) : this._cam || (this._cam = new THREE.OrthographicCamera(-0.55, 0.55, 2.1, -0.1, 0.1, 20));
    cam.position.set(0, 0, 6); cam.lookAt(0, 1, 6 - 10);
    if (wide) r.root.add(pedBikeMesh(q.spec.bike));
    P.sc.add(r.root);
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; renderer.setClearColor(0x000000, 0);
    const hdr = this.hdr; hdr.scissorTest = true;
    renderer.setRenderTarget(hdr); hdr.viewport.set(0, 0, this.W, this.CH); hdr.scissor.set(0, 0, this.W, this.CH); renderer.setRenderTarget(hdr); renderer.clear();
    for (let f = 0; f < this.FR; f++) {
      const clip = wide ? 'drive' : f ? (r.T.g === 'f' ? 'walk_female' : 'walk') : 'idle';
      r.play(clip, { fade: 0, restart: true }); const a = r.cur;
      if (a) { a.time = f && !wide ? ((f - 1) / 3) * a.getClip().duration : 0.3; a.timeScale = 0; }
      if (wide) { const [hy, hz] = pedClipHips(r.T, 'drive'), st = PED_SEAT(); r.inner.position.set(0, st[0] - hy * r.k, st[1] - hz * r.k); } // on the saddle (Peds.poseRig)
      r.mixer.update(0); r.pose(0);
      for (let d = 0; d < this.DIRS; d++) {
        r.root.rotation.y = (d / this.DIRS) * TAU; r.root.updateMatrixWorld(true);
        const x = (d * this.FR + f) * this.CW;
        hdr.viewport.set(x, 0, this.CW, this.CH); hdr.scissor.set(x, 0, this.CW, this.CH); renderer.setRenderTarget(hdr);
        renderer.render(P.sc, cam);
      }
    }
    // tone map this row into the atlas
    const qm = P.q.material;
    qm.uniforms.tMap.value = hdr.texture; qm.uniforms.uExp.value = 1.05; qm.uniforms.uRect.value.set(0, 0, 1, 1);
    const L = this.ldr; L.scissorTest = true; L.viewport.set(0, q.row * this.CH, this.W, this.CH); L.scissor.copy(L.viewport);
    renderer.setRenderTarget(L); renderer.clear(); renderer.render(P.qs, P.qc);
    qm.uniforms.uRect.value.set(0, 0, 1, 1);
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA); renderer.shadowMap.autoUpdate = prevSh;
    P.sc.remove(r.root); r.dispose();
    this.rows.set(q.key, q.row); if (wide) this.wide.add(q.key); else this.wide.delete(q.key);
  },
  begin() { this.n = 0; },
  // one sprite: feet at (x, y, z), turned to the camera, the cell for how the person faces it and how far through a stride they are
  _o: new THREE.Object3D(),
  add(key, x, y, z, heading, walkPh, moving) {
    if (!this.mesh || this.n >= this.cap) return false;
    const row = this.rows.get(key); if (row === undefined) return false;
    const c = camera.position, to = Math.atan2(c.x - x, c.z - z);
    const d = ((Math.round(angDiff(to, heading) / (TAU / this.DIRS)) % this.DIRS) + this.DIRS) % this.DIRS;
    const f = moving ? 1 + (Math.floor(walkPh * 3) % 3) : 0;
    const w = this.wide.has(key) ? 2 : 1, o = this._o; o.position.set(x, y - 0.1 * w, z); o.rotation.set(0, to, 0); o.scale.set(1.1 * w, 1.1 * w, 1); o.updateMatrix(); // the cell spans 1.1 × 2.2 m from 0.1 m below the feet (wide: twice)
    const i = this.n++;
    this.mesh.setMatrixAt(i, o.matrix);
    this.cell.array[i * 2] = ((d * this.FR + f) * this.CW) / this.W; this.cell.array[i * 2 + 1] = (row * this.CH) / this.H;
    return true;
  },
  end() {
    const m = this.mesh; if (!m) return;
    m.count = this.n; m.visible = this.n > 0;
    if (this.n) { m.instanceMatrix.needsUpdate = true; this.cell.needsUpdate = true; }
    // the sprites were lit once, neutrally: follow the sky and sun
    if (W.hemi) { const k = clamp((W.hemi.intensity / LIGHT_K) * 0.95 + (W.sun ? (W.sun.intensity / LIGHT_K) * 0.35 : 0), 0.12, 1.25); m.material.color.setScalar(Math.sqrt(k)); }
  },
};
