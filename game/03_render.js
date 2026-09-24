/* ============================================================
   render: linear-light pipeline (three's built-in shaders patched once),
   post (bloom → ACES grade → FXAA), quality tiers, camera-fitted
   two-cascade sun shadows, sky + sky reflections, day/night, water
   ============================================================ */

// ---- values every built-in material sees: plain {x,y,z(,w)} objects are passed by reference through
// UniformsUtils.clone, so writing them here reaches every program without touching any material ----
const GTA_U = {
  sun: { x: 0, y: 1, z: 0 },               // direction to the sun, world space (DayNight)
  sunV: { x: 0, y: 1, z: 0 },              // … in view space for the fog in-scatter (Render, per frame)
  scat: { x: 0, y: 0, z: 0 },              // in-scatter colour toward the sun (linear)
  fog: { x: 0.012, y: 0.5, z: 0, w: 0 },   // x: haze falloff with height, y: how much height thins it
  wx: { x: 0, y: 0.3, z: 0, w: 0 },        // x: snow cover, y: ground-contact AO, z: wet darkening
};
// every colour in the game is authored as sRGB hex; shaders decode it with gtaLin (x² below 1, and >1 stays an HDR boost)
const toLin = (c) => { c.r *= c.r; c.g *= c.g; c.b *= c.b; return c; };
const linHex = (hex) => toLin(new THREE.Color(hex));
(function linearPipeline() {
  const C = THREE.ShaderChunk, L = THREE.ShaderLib;
  C.common += '\nvec3 gtaLin(vec3 c){ return mix(c * c, 2.0 * c - 1.0, step(1.0, c)); }\n';
  // world position, camera-relative view vector and world up-ness of the normal for every material (fog, contact AO, snow, wet).
  // Only modelMatrix is uploaded for every material type in r128 (cameraPosition / viewMatrix are not), so build from that.
  C.begin_vertex += '\n#ifndef GTA_TF\n#define GTA_TF\n#endif\n';
  C.defaultnormal_vertex += '\n#ifndef GTA_TN\n#define GTA_TN\n#endif\n';
  C.fog_pars_vertex = 'varying vec3 vGtaW, vGtaV; varying float vGtaUp;\n#ifdef USE_FOG\n\tvarying float fogDepth;\n#endif\n';
  C.fog_vertex = [
    '#ifdef GTA_TF', '\tvec4 gtaWp = vec4(transformed, 1.0);', '\t#ifdef USE_INSTANCING', '\t\tgtaWp = instanceMatrix * gtaWp;', '\t#endif', '\tvGtaW = (modelMatrix * gtaWp).xyz;',
    '#else', '\tvGtaW = modelMatrix[3].xyz;', '#endif',
    'vGtaV = mvPosition.xyz;',
    '#ifdef GTA_TN', '\tvec3 gtaN = objectNormal;', '\t#ifdef USE_INSTANCING', '\t\tgtaN = mat3(instanceMatrix) * gtaN;', '\t#endif', '\tvGtaUp = normalize(mat3(modelMatrix) * gtaN).y;',
    '#else', '\tvGtaUp = 1.0;', '#endif',
    '#ifdef USE_FOG', '\tfogDepth = - mvPosition.z;', '#endif'].join('\n');
  C.fog_pars_fragment = [
    'varying vec3 vGtaW, vGtaV; varying float vGtaUp; uniform vec3 gtaSun, gtaScat; uniform vec4 gtaFog, gtaWx;',
    '#ifdef USE_FOG', '\tuniform vec3 fogColor; varying float fogDepth;',
    '\t#ifdef FOG_EXP2', '\t\tuniform float fogDensity;', '\t#else', '\t\tuniform float fogNear; uniform float fogFar;', '\t#endif', '#endif'].join('\n');
  // aerial perspective: true distance, thinner with height, warm toward the sun (gtaSun is in view space).
  // fogColor is already linear (DayNight writes it)
  C.fog_fragment = [
    '#ifdef USE_FOG',
    '\tfloat gtaD = length(vGtaV); vec3 gtaRd = vGtaV / max(gtaD, 0.001);',
    '\t#ifdef FOG_EXP2', '\t\tfloat fogFactor = 1.0 - exp( - fogDensity * fogDensity * gtaD * gtaD );',
    '\t#else', '\t\tfloat gtaT = max(gtaD - fogNear, 0.0) / max(fogFar - fogNear, 1.0); float fogFactor = 1.0 - exp(-gtaT * gtaT * 3.0);', '\t#endif',
    '\tfogFactor *= mix(1.0, exp(-max(vGtaW.y, 0.0) * gtaFog.x), gtaFog.y);',
    '\tgl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + gtaScat * pow(max(dot(gtaRd, gtaSun), 0.0), 6.0), fogFactor);',
    '#endif'].join('\n');
  // decode the final albedo once (the product of colour × map × vertex colour × whatever custom shaders did), plus
  // cheap ground-contact darkening on walls, wet darkening and snow cover on anything facing up
  C.gta_lin_fragment = 'diffuseColor.rgb = gtaLin(diffuseColor.rgb);';
  C.gta_lit_fragment = [
    'diffuseColor.rgb = gtaLin(diffuseColor.rgb); totalEmissiveRadiance = gtaLin(totalEmissiveRadiance);',
    'float gtaWall = 1.0 - smoothstep(0.45, 0.8, abs(vGtaUp)), gtaTop = smoothstep(0.55, 0.92, vGtaUp);',
    'diffuseColor.rgb *= (1.0 - gtaWx.y * gtaWall * (1.0 - smoothstep(0.0, 2.6, vGtaW.y))) * (1.0 - gtaWx.z * gtaTop);',
    'if (gtaWx.x > 0.001) {',
    '  vec2 gq = vGtaW.xz * 0.45, gi = floor(gq), gf = fract(gq); gf = gf * gf * (3.0 - 2.0 * gf);',
    '  float gn = mix(mix(fract(sin(dot(gi, vec2(12.99, 78.23))) * 43758.5), fract(sin(dot(gi + vec2(1.0, 0.0), vec2(12.99, 78.23))) * 43758.5), gf.x),',
    '    mix(fract(sin(dot(gi + vec2(0.0, 1.0), vec2(12.99, 78.23))) * 43758.5), fract(sin(dot(gi + 1.0, vec2(12.99, 78.23))) * 43758.5), gf.x), gf.y);',
    '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.82, 0.88), gtaTop * clamp(gtaWx.x * 1.6 - gn * 0.6, 0.0, 1.0));',
    '}'].join('\n');
  // r128 bug: the PMREM chunk's r0/v1/m1… macros leak into the Phong/Lambert BRDF code (v1 is a parameter name there)
  { const cu = C.cube_uv_reflection_fragment, e = cu.lastIndexOf('#endif');
    C.cube_uv_reflection_fragment = cu.slice(0, e) + ['r0', 'v0', 'm0', 'r1', 'v1', 'm1', 'r4', 'v4', 'm4', 'r5', 'v5', 'm5', 'r6', 'v6', 'm6'].map((m) => '\t#undef ' + m + '\n').join('') + cu.slice(e); }
  // sky reflections on PBR materials only add specular (the hemisphere light stays the one ambient term)
  C.lights_fragment_maps = C.lights_fragment_maps.replace('iblIrradiance += getLightProbeIndirectIrradiance( geometry, maxMipLevel );', '');
  // two-cascade sun shadow: light 0 = tight map around the player, light 1 = wide low-res map (no light of its own)
  C.shadowmap_pars_fragment += [
    '', '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2',
    'float gtaCascade() {',
    '  vec3 p = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w; vec2 e = abs(p.xy - 0.5);',
    '  float w = smoothstep(0.36, 0.47, max(e.x, e.y)), s = 1.0;',
    '  if (w < 1.0) s = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );',
    '  if (w > 0.0) s = mix(s, getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ), w);',
    '  return s;', '}', '#endif', ''].join('\n');
  const DS = 'directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (C.lights_fragment_begin.includes(DS)) C.lights_fragment_begin = C.lights_fragment_begin.replace(DS, [
    '#if NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0', '\t\tdirectLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? gtaCascade() : 1.0;',
    '\t\t#elif NUM_DIR_LIGHT_SHADOWS != 2', '\t\t' + DS, '\t\t#endif'].join('\n'));
  C.shadowmask_pars_fragment = C.shadowmask_pars_fragment.replace('#if NUM_DIR_LIGHT_SHADOWS > 0', '#if NUM_DIR_LIGHT_SHADOWS == 2\n\tshadow *= receiveShadow ? gtaCascade() : 1.0;\n\t#elif NUM_DIR_LIGHT_SHADOWS > 0');
  const U = { gtaSun: { value: GTA_U.sunV }, gtaScat: { value: GTA_U.scat }, gtaFog: { value: GTA_U.fog }, gtaWx: { value: GTA_U.wx } };
  for (const k in L) {
    const s = L[k];
    Object.assign(s.uniforms, U);
    let f = s.fragmentShader;
    if (!f.includes('#include <fog_fragment>')) continue;
    // fog in linear light, before tone mapping (three r128 fogs after it)
    f = f.replace(/(\s*#include <tonemapping_fragment>\s*#include <encodings_fragment>)(\s*#include <fog_fragment>)/, '$2$1');
    const lit = ['#include <lights_physical_fragment>', '#include <lights_phong_fragment>', '#include <lights_toon_fragment>'].find((a) => f.includes(a));
    if (lit) f = f.replace(lit, '#include <gta_lit_fragment>\n\t' + lit);
    else if (f.includes('vIndirectFront')) f = f.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\t#include <gta_lit_fragment>');
    else if (f.includes('outgoingLight = diffuseColor.rgb;')) f = f.replace('outgoingLight = diffuseColor.rgb;', '#include <gta_lin_fragment>\n\toutgoingLight = diffuseColor.rgb;');
    else if (f.includes('reflectedLight.indirectDiffuse *= diffuseColor.rgb;')) f = f.replace('reflectedLight.indirectDiffuse *= diffuseColor.rgb;', '#include <gta_lin_fragment>\n\treflectedLight.indirectDiffuse *= diffuseColor.rgb;');
    else if (f.includes('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;')) f = f.replace('vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;', '#include <gta_lin_fragment>\n\tvec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;');
    s.fragmentShader = f;
  }
})();

// ---- InstancedMesh culling: r128 tests them against the base geometry's bounds (wrong), so every module turns
// culling off and each chunk of trees / lamps / houses / peds is drawn in the main pass and in every shadow pass.
// Cull them by the bounds of their instances instead (cached until instanceMatrix / count change). frustumCulled on
// an InstancedMesh is therefore always true; an empty one (count 0) is skipped entirely. ----
(function instancedCulling() {
  const F = THREE.Frustum.prototype, base = F.intersectsObject, S = new THREE.Sphere(), M = new THREE.Matrix4(), c = new V3(), lo = new V3(), hi = new V3();
  Object.defineProperty(THREE.InstancedMesh.prototype, 'frustumCulled', { get() { return true; }, set() { }, configurable: true });
  F.intersectsObject = function (o) {
    if (!o.isInstancedMesh) return base.call(this, o);
    const n = o.count, k = o.instanceMatrix.version;
    let b = o._gtaBS;
    if (!b || o._gtaK !== k || o._gtaN !== n) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const gs = g.boundingSphere, a = o.instanceMatrix.array;
      b = o._gtaBS || (o._gtaBS = new THREE.Sphere()); o._gtaK = k; o._gtaN = n;
      lo.set(Infinity, Infinity, Infinity); hi.set(-Infinity, -Infinity, -Infinity); let r = 0;
      for (let i = 0; i < n; i++) { M.fromArray(a, i * 16); c.copy(gs.center).applyMatrix4(M); lo.min(c); hi.max(c); r = Math.max(r, gs.radius * M.getMaxScaleOnAxis()); }
      if (n) { b.center.addVectors(lo, hi).multiplyScalar(0.5); b.radius = lo.distanceTo(hi) / 2 + r + 1; } else b.radius = -1;
    }
    return b.radius >= 0 && this.intersectsSphere(S.copy(b).applyMatrix4(o.matrixWorld));
  };
})();

/* ---------------- grade: exposure → ACES → split-tone → sRGB → vignette + grain ---------------- */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uSat: { value: 1.05 }, uContrast: { value: 1.02 }, uTime: { value: 0 }, uHallu: { value: 0 },
    uGrain: { value: 0.018 }, uVig: { value: 0.32 }, uTint: { value: new V3(1, 1, 1) }, uShadow: { value: new V3(0.97, 1, 1.04) }, uHigh: { value: new V3(1.03, 1, 0.96) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float uExposure, uSat, uContrast, uVig, uTime, uHallu, uGrain; uniform vec3 uTint, uShadow, uHigh; varying vec2 vUv;',
    'vec3 rrtOdt(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }',
    'vec3 aces(vec3 c){',
    '  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));',
    '  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));',
    '  return clamp(O * rrtOdt(I * (c / 0.6)), 0.0, 1.0); }',
    'vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }',
    'void main(){',
    '  vec2 uv = vUv; vec3 col;',
    '  if (uHallu > 0.001) {',
    '    uv += vec2(sin(uv.y * 14.0 + uTime * 3.1), cos(uv.x * 11.0 + uTime * 2.4)) * 0.007 * uHallu;',
    '    float o = 0.006 * uHallu;',
    '    col = vec3(texture2D(tDiffuse, uv + vec2(o, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(o, o)).b);',
    '  } else col = texture2D(tDiffuse, uv).rgb;',
    '  col = aces(max(col, 0.0) * uExposure * uTint);',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = max(mix(vec3(l), col, uSat), 0.0) * mix(uShadow, uHigh, smoothstep(0.02, 0.45, l));',
    '  col = sqrt(col);',
    '  col = (col - 0.5) * uContrast + 0.5;',
    '  if (uHallu > 0.001) col = mix(col, hue(col, uTime * 1.3), uHallu * 0.6);',
    '  vec2 d = vUv - 0.5; col *= 1.0 - uVig * smoothstep(0.08, 0.5, dot(d, d));',
    '  col += (fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain * (1.2 - l);',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}',
  ].join('\n'),
};

/* ---------------- quality tiers + post + shadows + sky reflections ---------------- */
// low: no post (three tone-maps), one shadow map, no sky reflections. med: post at a lower bloom res, 2 cascades at 1024.
// high: full post, 2 cascades at 2048, sky reflections refreshed often. Auto-steps down when the frame rate can't keep up.
const QUALITY = {
  // (the shadow casters are massing proxies: a cascade is ~60 draws / ~60k tris, cheap enough to redraw every frame, so no every-other-frame judder)
  low: { pr: 1.35, post: false, near: 1024, far: 0, nearR: 36, farR: 0, farEvery: 1, nearEvery: 1, env: 0, bloomDiv: 0, fxaa: false, parts: 0.45 },
  med: { pr: 1.25, post: true, near: 1024, far: 1024, nearR: 22, farR: 100, farEvery: 8, nearEvery: 1, env: 9, bloomDiv: 4, fxaa: true, parts: 0.7 },
  high: { pr: 1.5, post: true, near: 2048, far: 2048, nearR: 24, farR: 135, farEvery: 5, nearEvery: 1, env: 3, bloomDiv: 2, fxaa: true, parts: 1 },
};
const Q_ORDER = ['low', 'med', 'high'];
const Render = {
  quality: 'high', Q: QUALITY.high, userQ: null, composer: null, bloom: null, grade: null, fxaa: null, renderPass: null,
  cutU: { uCutPos: { value: new THREE.Vector2(-1e5, -1e5) }, uCutR: { value: 0 }, uCutDepth: { value: 0 }, uNear: { value: 0 } },
  _v: new V3(), _r: new V3(), _u: new V3(), _c: new V3(), _f: new V3(),
  pmrem: null, envRT: null, envT: -1e9, envClock: -1e9, envKey: '', skyScene: null, reflMats: [],
  farN: 0, nearN: 0, _ema: 0, _lastNow: 0, _lowT: 0, _hiT: 0, _stepped: false,
  get fx() { return !!this.composer; },
  // ---- shadow-only casters: the detailed city (256 m instanced chunks, ~500-tri houses) doesn't cast; cheap massing proxies on
  // layer SHADOW_LAYER do, cut into small tiles so a 48 m cascade touches a handful of them. The main camera never has the
  // layer; the shadow pass (which tests layers against the main camera) gets it for its duration only. ----
  SHADOW_LAYER: 2, _proxyMat: null,
  proxyMat() { return this._proxyMat || (this._proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); },
  // an InstancedMesh that only draws into the shadow maps (geo: shared, never cloned; mats: [Matrix4] or a shared instanceMatrix)
  shadowProxy(geo, n, im) {
    const m = new THREE.InstancedMesh(geo, this.proxyMat(), n);
    if (im) m.instanceMatrix = im;
    m.castShadow = true; m.receiveShadow = false; m.layers.set(this.SHADOW_LAYER); m.matrixAutoUpdate = false;
    return m;
  },
  hookShadowLayer() {
    const sm = renderer.shadowMap, r0 = sm.render, L = 1 << this.SHADOW_LAYER; if (sm._gtaL) return; sm._gtaL = true;
    sm.render = function (lights, sc, cam) { const k = cam.layers.mask; cam.layers.mask = k | L; try { r0.call(this, lights, sc, cam); } finally { cam.layers.mask = k; } };
  },
  // dithered see-through hole around the player for anything between camera and player
  cutout(mat) {
    mat.onBeforeCompile = (sh) => this.cutoutPatch(sh);
    mat.customProgramCacheKey = () => 'cutout';
    return mat;
  },
  // the same patch for materials that do their own onBeforeCompile
  cutoutPatch(sh) {
    const U = this.cutU;
    sh.uniforms.uCutPos = U.uCutPos; sh.uniforms.uCutR = U.uCutR; sh.uniforms.uCutDepth = U.uCutDepth; sh.uniforms.uNear = U.uNear;
    sh.vertexShader = 'varying float vCutZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutZ = -mvPosition.z;');
    sh.fragmentShader = 'uniform vec2 uCutPos; uniform float uCutR; uniform float uCutDepth; uniform float uNear; varying float vCutZ;\n' +
      'float cutBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n' +
      sh.fragmentShader.replace('void main() {', 'void main() {\n  float cutN = cutBayer2(0.5 * gl_FragCoord.xy) * 0.25 + cutBayer2(gl_FragCoord.xy);\n  if (vCutZ < uNear && cutN < (uNear - vCutZ) / 4.0) discard;\n  if (uCutR > 0.0 && vCutZ < uCutDepth) { float cr = length(gl_FragCoord.xy - uCutPos) / uCutR; if (cr < 1.0 && cutN > cr * cr * 0.92) discard; }');
  },
  init() {
    this.hookShadowLayer();
    this.maxQ = renderer.capabilities.isWebGL2 ? 'high' : 'low'; // 8-bit linear buffers band badly: WebGL1 stays on the three tone-mapper
    // software GL (headless tests, blocklisted GPUs) is slow whatever we do: don't let the watchdog chase it
    try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); this.soft = /SwiftShader|llvmpipe/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { this.soft = false; }
    const saved = Store.get('gta-q');
    if (Q_ORDER.includes(saved)) this.userQ = saved;
    renderer.outputEncoding = THREE.sRGBEncoding;
    // glass curtain walls reflect the sky
    scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.isMeshPhongMaterial && m.map === TEX.curtain && !this.reflMats.includes(m)) { m.combine = THREE.MixOperation; m.reflectivity = 0.42; this.reflMats.push(m); } });
    this.setQuality(this.userQ || (LOWQ ? 'low' : 'high'));
  },
  // q: 'low' | 'med' | 'high'; persist = remember it for this browser (a player's explicit choice)
  setQuality(q, persist) {
    if (!QUALITY[q]) return;
    if (Q_ORDER.indexOf(q) > Q_ORDER.indexOf(this.maxQ)) q = this.maxQ;
    if (persist) { this.userQ = q; Store.set('gta-q', q); }
    const Q = QUALITY[q], was = this.quality, toneWas = renderer.toneMapping;
    this.quality = q; this.Q = Q;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    renderer.toneMapping = Q.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    if (Q.post && !this.composer) this.buildPost();
    if (!Q.post && this.composer) this.dropPost();
    if (!this.composer && Q.post) { this.Q = QUALITY.low; this.quality = 'low'; renderer.toneMapping = THREE.ACESFilmicToneMapping; }
    if (this.fxaa) this.fxaa.enabled = this.Q.fxaa;
    this.setupShadows();
    this.envT = -1e9;
    if (renderer.toneMapping !== toneWas) scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
    if (W.sun) onResize();
    if (was !== this.quality && G.started) UI.toast('画质：' + { low: '流畅', med: '均衡', high: '电影' }[this.quality], 1.6);
  },
  // the pause card's 画质 button: 自动 → 流畅 → 均衡 → 电影 → 自动 (a hand-picked tier is remembered; 自动 hands it back to the watchdog)
  cycleQuality() {
    const order = [null, 'low', 'med', 'high'].filter((q) => !q || Q_ORDER.indexOf(q) <= Q_ORDER.indexOf(this.maxQ));
    const next = order[(order.indexOf(this.userQ) + 1) % order.length];
    if (next) this.setQuality(next, true);
    else { this.userQ = null; Store.del('gta-q'); this._stepped = false; this._ema = 0; this.setQuality(LOWQ ? 'low' : this.maxQ); }
    this.qLabel();
  },
  qLabel() { const b = $('p-q'); if (b) b.textContent = '画质：' + (this.userQ ? { low: '流畅', med: '均衡', high: '电影' }[this.userQ] : '自动'); },
  buildPost() {
    try {
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType });
      this.composer = new THREE.EffectComposer(renderer, rt);
      this.renderPass = new THREE.RenderPass(scene, camera);
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.3, 0.55, 1.2);
      this.grade = new THREE.ShaderPass(GradeShader);
      this.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom);
      this.composer.addPass(this.grade); this.composer.addPass(this.fxaa);
    } catch (e) { this.dropPost(); }
  },
  dropPost() {
    const c = this.composer;
    if (c) { c.renderTarget1.dispose(); c.renderTarget2.dispose(); if (this.bloom && this.bloom.dispose) this.bloom.dispose(); }
    this.composer = this.bloom = this.grade = this.fxaa = this.renderPass = null;
  },
  // the sun is two lights: W.sun (the light + tight shadow) and W.sun2 (dark, carries the wide low-res cascade)
  setupShadows() {
    const s = W.sun; if (!s) return;
    const Q = this.Q, set = (l, n) => { if (l.shadow.mapSize.x !== n) { l.shadow.mapSize.set(n, n); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } };
    set(s, Q.near);
    if (!W.sun2) {
      const l = W.sun2 = new THREE.DirectionalLight(0xffffff, 0);
      l.shadow.bias = -0.0008; l.shadow.normalBias = 0.12; l.shadow.autoUpdate = false;
      scene.add(l, l.target);
    }
    W.sun2.castShadow = Q.far > 0; if (Q.far) set(W.sun2, Q.far);
    this.farN = 0;
  },
  // fit both cascades to the view: centred ahead of the camera target, texel-snapped so they don't shimmer
  fitShadow(tx, tz) {
    const s = W.sun; if (!s) return;
    const d = W.sunDir, r = this._r.set(0, 1, 0).cross(d), u = this._u, f = this._f, Q = this.Q;
    if (r.lengthSq() < 1e-6) r.set(1, 0, 0); r.normalize(); u.copy(d).cross(r);
    camera.getWorldDirection(f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    // depth range: ground across the box spans R·cot(el) toward / away from the sun, plus the towers that can shade it
    const sn = Math.max(d.y, 0.16), ct = Math.sqrt(1 - sn * sn) / sn;
    const place = (l, R, ahead, size, wb, tall) => {
      const cx = tx + f.x * R * ahead, cz = tz + f.z * R * ahead, texel = (2 * R) / size, D = 30 + tall / sn + R * ct;
      let lx = cx * r.x + cz * r.z, ly = cx * u.x + cz * u.z;
      lx = Math.round(lx / texel) * texel; ly = Math.round(ly / texel) * texel;
      // world point with these light-space coords, on the ground plane
      const k = -(r.y * lx + u.y * ly) / d.y, c = this._c.set(r.x * lx + u.x * ly + d.x * k, 0, r.z * lx + u.z * ly + d.z * k);
      l.target.position.copy(c); l.position.copy(c).addScaledVector(d, D);
      const sc = l.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = D + R * ct + 20;
      l.shadow.bias = -wb / sc.far; l.shadow.normalBias = texel * 1.2;
      sc.updateProjectionMatrix(); l.target.updateMatrixWorld(); l.updateMatrixWorld();
    };
    // the tight map: every frame on high, every other frame on smaller tiers (the light only slides, so map + matrix stay paired)
    s.shadow.autoUpdate = false; if ((this.nearN++ % Q.nearEvery) === 0) { place(s, Q.nearR, 0.45, Q.near, 0.06, 110); s.shadow.needsUpdate = true; }
    const s2 = W.sun2;
    // the wide cascade only holds far-away shadows: re-rendering it every few frames is plenty (and saves hundreds of draw calls)
    if (s2 && s2.castShadow && (this.farN++ % Q.farEvery) === 0) { place(s2, Q.farR, 0.6, Q.far, 0.3, 160); s2.shadow.needsUpdate = true; }
  },
  resize() {
    if (!this.composer) return;
    const pr = renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth / this.Q.bloomDiv, innerHeight / this.Q.bloomDiv);
    this.fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  },
  // sky reflections (PMREM of the sky dome) for PBR materials + glass towers; refreshed as the sky changes
  updateEnv(force) {
    const Q = this.Q, now = performance.now();
    if (!Sky.mesh || DayNight.indoor) return;
    // again once a weather change has settled, and as the clock moves (low tier: rarely, it is only the sky)
    const key = Weather.cur + (Weather.str[Weather.cur] > 0.99 ? '' : '~'), dc = Math.abs(((DayNight.clock - this.envClock + 720) % 1440 + 1440) % 1440 - 720);
    const due = force || !this.envRT || key !== this.envKey || (dc > (Q.env ? 10 : 45) && now - this.envT > (Q.env || 20) * 1000);
    if (!due) return;
    try {
      if (!this.pmrem) {
        this.pmrem = new THREE.PMREMGenerator(renderer);
        this.skyScene = new THREE.Scene();
        const m = new THREE.Mesh(Sky.mesh.geometry, Sky.mesh.material); m.frustumCulled = false; this.skyScene.add(m);
      }
      const rt = this.pmrem.fromScene(this.skyScene, 0, 1, 1000), old = this.envRT;
      this.envRT = rt; scene.environment = rt.texture;
      for (const m of this.reflMats) { if (!m.envMap) m.needsUpdate = true; m.envMap = rt.texture; }
      if (old) old.dispose();
    } catch (e) { this.dropEnv(); this.Q = Object.assign({}, this.Q, { env: 0 }); }
    this.envT = now; this.envClock = DayNight.clock; this.envKey = key;
  },
  dropEnv() {
    if (!this.envRT) return;
    scene.environment = null; for (const m of this.reflMats) { m.envMap = null; m.needsUpdate = true; }
    this.envRT.dispose(); this.envRT = null;
  },
  // frame-time watchdog: a tier down after ~6 s of struggling, one step up after a long smooth stretch (once)
  autoQ() {
    const now = performance.now(), dt = now - this._lastNow; this._lastNow = now;
    if (this.userQ || this.soft || DEV.fixedQ || !G.started || G.paused || document.hidden || dt > 250 || dt <= 0) return;
    this._ema = this._ema ? this._ema * 0.96 + dt * 0.04 : dt;
    const fps = 1000 / this._ema, i = Q_ORDER.indexOf(this.quality);
    if (i > 0 && fps < (i === 2 ? 42 : 30)) { this._lowT += dt; this._hiT = 0; if (this._lowT > 6000) { this._stepped = true; this._lowT = 0; this._ema = 0; this.setQuality(Q_ORDER[i - 1]); } }
    else { this._lowT = Math.max(0, this._lowT - dt); }
    if (!this._stepped && i < Q_ORDER.indexOf(LOWQ ? 'med' : this.maxQ) && fps > 58) { this._hiT += dt; if (this._hiT > 20000) { this._stepped = true; this._ema = 0; this.setQuality(Q_ORDER[i + 1]); } }
    else if (fps <= 58) this._hiT = 0;
  },
  render(t) {
    this.autoQ();
    camera.updateMatrixWorld();
    const sv = this._v.set(GTA_U.sun.x, GTA_U.sun.y, GTA_U.sun.z).transformDirection(camera.matrixWorldInverse);
    GTA_U.sunV.x = sv.x; GTA_U.sunV.y = sv.y; GTA_U.sunV.z = sv.z;
    if (!DayNight.indoor) this.updateEnv();
    if (this.composer) { this.grade.uniforms.uTime.value = t % 1000; this.composer.render(); }
    else renderer.render(scene, camera);
  },
  set hallu(v) { if (this.grade) this.grade.uniforms.uHallu.value = v; canvasEl.style.filter = !this.grade && v > 0.05 ? `hue-rotate(${Math.round(v * 90)}deg) saturate(${1 + v})` : ''; },
  // enable the cutout when something stands between the camera and (x,y,z)
  // nearK > 0 also fades out everything closer to the camera than nearK × player depth (close-up camera)
  updateCutout(on, x, y, z, rPx, nearK = 0) {
    const U = this.cutU;
    if (!on && !nearK) { U.uCutR.value = 0; U.uNear.value = 0; return; }
    const v = this._v.set(x, y, z);
    v.applyMatrix4(camera.matrixWorldInverse);
    U.uNear.value = -v.z * nearK;
    if (!on) { U.uCutR.value = 0; return; }
    U.uCutDepth.value = -v.z - 1.5;
    v.set(x, y, z).project(camera);
    const pr = renderer.getPixelRatio();
    U.uCutPos.value.set((v.x + 1) * 0.5 * innerWidth * pr, (v.y + 1) * 0.5 * innerHeight * pr);
    U.uCutR.value = rPx * pr;
  },
};

Hooks.init(function qualityButton() {
  const mute = $('p-mute'); if (!mute || $('p-q')) return;
  const b = document.createElement('button'); b.id = 'p-q'; b.type = 'button';
  b.addEventListener('click', () => Render.cycleQuality());
  mute.after(b); Render.qLabel();
});

/* ---------------- sky: analytic gradient, sun + halo, moon, clouds, stars, weather haze ---------------- */
// linear colours; shared by the sky dome, the water's reflections and the PMREM environment
const SKY_U = {
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uHazeC: { value: new THREE.Color() },
  uSunDir: { value: new V3(0.3, 0.6, 0.4) }, uSunCol: { value: new THREE.Color() }, uMoonDir: { value: new V3(-0.4, 0.8, 0.45).normalize() },
  uNight: { value: 0 }, uSkyT: { value: 0 }, uCloud: { value: 0.35 }, uHaze: { value: 0 }, uSunVis: { value: 1 }, uCloudC: { value: new THREE.Color() },
};
const SKY_GLSL = [
  'uniform vec3 uZen, uHor, uGnd, uHazeC, uSunDir, uSunCol, uMoonDir, uCloudC; uniform float uNight, uSkyT, uCloud, uHaze, uSunVis;',
  'float skH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float skN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(skH(i), skH(i + vec2(1.0, 0.0)), f.x), mix(skH(i + vec2(0.0, 1.0)), skH(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float skF(vec2 p){ return skN(p) * 0.55 + skN(p * 2.03 + 7.1) * 0.28 + skN(p * 4.37 + 3.7) * 0.17; }',
  'vec3 skyCol(vec3 d, float detail){',
  '  float h = d.y, hb = pow(1.0 - clamp(h, 0.0, 1.0), 7.0);',
  '  vec3 col = mix(uZen, uHor, hb);',
  '  col = mix(col, uGnd, smoothstep(0.0, -0.3, h));',
  '  float s = max(dot(d, uSunDir), 0.0), sv = uSunVis * smoothstep(-0.12, 0.02, uSunDir.y);',
  '  col += uSunCol * sv * (pow(s, 6.0) * 0.22 * hb + pow(s, 64.0) * 0.35) * step(-0.02, h);',
  '  float m = max(dot(d, uMoonDir), 0.0);',
  '  col += vec3(0.8, 0.86, 1.0) * uNight * (smoothstep(0.99935, 0.99965, m) * 2.2 + pow(m, 250.0) * 0.05) * (1.0 - uHaze);',
  '  if (h > 0.0) {',
  '    if (detail > 0.5) {',
  '      vec2 uv = d.xz / (h + 0.12) * 1.1 + vec2(uSkyT * 0.008, uSkyT * 0.003);',
  '      float n = skF(uv), cov = smoothstep(1.0 - uCloud, 1.35 - uCloud, n) * smoothstep(0.0, 0.18, h);',
  '      float lit = clamp(0.55 + (skN(uv) - skN(uv + uSunDir.xz * 0.15)) * 2.2, 0.0, 1.0);',
  '      vec3 cc = uCloudC * (0.55 + 0.45 * lit) + uSunCol * sv * lit * (0.25 + pow(s, 8.0) * 0.8);',
  '      col = mix(col, cc, cov * 0.9);',
  '      vec3 sd = floor(d * 240.0); float st = step(0.9984, fract(sin(dot(sd, vec3(12.99, 78.23, 37.72))) * 43758.5));',
  '      col += vec3(0.9) * st * uNight * (1.0 - cov) * (1.0 - uHaze) * smoothstep(0.05, 0.4, h) * (0.6 + 0.4 * sin(uSkyT * 3.0 + sd.x));',
  '    }',
  '    col += uSunCol * sv * smoothstep(0.99955, 0.99985, s) * 30.0 * (1.0 - uHaze * 0.85);',
  '  }',
  '  return mix(col, uHazeC, uHaze * (1.0 - smoothstep(-0.1, 0.7, h)));',
  '}',
].join('\n');
const Sky = {
  mesh: null, U: SKY_U,
  init() {
    const mat = new THREE.ShaderMaterial({
      uniforms: SKY_U, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: '#include <common>\n' + SKY_GLSL + '\nvarying vec3 vDir;\nvoid main(){ gl_FragColor = vec4(skyCol(normalize(vDir), 1.0), 1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}',
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), mat);
    this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  },
  update(t) { this.mesh.position.copy(camera.position); SKY_U.uSkyT.value = t; },
};

/* ---------------- day / night ---------------- */
// colours are sRGB hex (converted to linear once); zen/hor/gnd: sky (hor is also the fog colour); hs/hg/hi: hemisphere;
// sc/si: sun; mi: moon; el: sun elevation (deg); win: window glow; lamps: street lights; ex: exposure; tint: white balance;
// sat/con: saturation/contrast; sh/hl: split tone for shadows/highlights; cl: cloud cover; fn/ff: haze near/far
const NIGHT_DN = { zen: '#050918', hor: '#2c2536', gnd: '#0b0b12', hs: '#6072a4', hg: '#4a3326', hi: 0.46, sc: '#ff8a50', si: 0, mi: 0.3, el: -24, win: 1.05, lamps: 1, ex: 1.45, tint: [0.97, 0.99, 1.05], sat: 1.04, con: 1.03, sh: [0.93, 0.98, 1.1], hl: [1.06, 1.0, 0.92], cl: 0.4, fn: 25, ff: 430 };
const KEYS_DN = [
  Object.assign({ h: 0 }, NIGHT_DN),
  Object.assign({ h: 4.6 }, NIGHT_DN),
  { h: 5.5, zen: '#14224a', hor: '#7d7494', gnd: '#15151e', hs: '#7a88b4', hg: '#3c3440', hi: 0.5, sc: '#ff9a6a', si: 0, mi: 0.12, el: -5, win: 0.85, lamps: 0.85, ex: 1.4, tint: [0.97, 0.99, 1.05], sat: 1.04, con: 1.02, sh: [0.95, 0.99, 1.07], hl: [1.04, 1.0, 0.96], cl: 0.35, fn: 30, ff: 400 },
  { h: 6.4, zen: '#44679f', hor: '#eaae8c', gnd: '#2a2522', hs: '#b4b6d0', hg: '#6a5040', hi: 0.48, sc: '#ffa468', si: 0.78, mi: 0, el: 6, win: 0.5, lamps: 0.35, ex: 1.18, tint: [1.04, 1.0, 0.96], sat: 1.1, con: 1.03, sh: [0.95, 0.99, 1.07], hl: [1.07, 1.0, 0.92], cl: 0.35, fn: 40, ff: 470 },
  { h: 8, zen: '#2766c8', hor: '#a9bfd6', gnd: '#3a3a36', hs: '#c4d8ff', hg: '#7a6a58', hi: 0.5, sc: '#fff0da', si: 0.86, mi: 0, el: 28, win: 0.12, lamps: 0, ex: 0.96, tint: [1.0, 1.0, 1.0], sat: 1.12, con: 1.06, sh: [0.97, 1.0, 1.04], hl: [1.03, 1.0, 0.97], cl: 0.32, fn: 60, ff: 640 },
  { h: 12, zen: '#2462cc', hor: '#adc2d9', gnd: '#3c3c38', hs: '#cadcff', hg: '#7c6c5a', hi: 0.52, sc: '#fff2e0', si: 0.92, mi: 0, el: 54, win: 0.08, lamps: 0, ex: 0.88, tint: [1.0, 1.0, 0.99], sat: 1.15, con: 1.07, sh: [0.97, 1.0, 1.04], hl: [1.02, 1.0, 0.98], cl: 0.3, fn: 70, ff: 660 },
  { h: 16, zen: '#2c6ac2', hor: '#c4bcae', gnd: '#3c3a34', hs: '#d2d8f0', hg: '#7a6450', hi: 0.5, sc: '#ffe4bc', si: 0.9, mi: 0, el: 33, win: 0.12, lamps: 0, ex: 0.95, tint: [1.02, 1.0, 0.96], sat: 1.13, con: 1.06, sh: [0.96, 1.0, 1.05], hl: [1.04, 1.0, 0.95], cl: 0.32, fn: 60, ff: 620 },
  { h: 18.2, zen: '#4a6ca8', hor: '#eeae7a', gnd: '#34302a', hs: '#c4aeb4', hg: '#6a4a38', hi: 0.46, sc: '#ffa04e', si: 0.9, mi: 0, el: 9, win: 0.4, lamps: 0.2, ex: 1.08, tint: [1.07, 0.99, 0.9], sat: 1.14, con: 1.04, sh: [0.94, 0.99, 1.08], hl: [1.08, 1.0, 0.9], cl: 0.34, fn: 50, ff: 540 },
  { h: 19.2, zen: '#2c3876', hor: '#dd7658', gnd: '#221c20', hs: '#9486b0', hg: '#4a3430', hi: 0.44, sc: '#ff6a3c', si: 0.38, mi: 0, el: 1.5, win: 0.8, lamps: 0.7, ex: 1.25, tint: [1.05, 0.97, 0.97], sat: 1.12, con: 1.03, sh: [0.93, 0.98, 1.1], hl: [1.08, 0.99, 0.92], cl: 0.36, fn: 40, ff: 470 },
  { h: 20, zen: '#121a46', hor: '#58486c', gnd: '#101018', hs: '#6a78b0', hg: '#40302a', hi: 0.48, sc: '#ff6a3c', si: 0, mi: 0.18, el: -7, win: 1, lamps: 1, ex: 1.4, tint: [0.98, 0.97, 1.06], sat: 1.07, con: 1.03, sh: [0.92, 0.98, 1.1], hl: [1.07, 1.0, 0.92], cl: 0.38, fn: 30, ff: 440 },
  Object.assign({ h: 21.5 }, NIGHT_DN),
  Object.assign({ h: 24 }, NIGHT_DN),
];
const INDOOR_DN = { zen: '#222222', hor: '#333333', gnd: '#444444', hs: '#fff3e2', hg: '#6b5a4a', hi: 0.7, sc: '#ffffff', si: 0.5, mi: 0, el: 70, win: 0.4, lamps: 0.2, ex: 1.05, tint: [1.02, 1.0, 0.98], sat: 1.06, con: 1.02, sh: [0.98, 1.0, 1.02], hl: [1.02, 1.0, 0.98], cl: 0, fn: 200, ff: 900 };
const DN_COLS = ['zen', 'hor', 'gnd', 'hs', 'hg', 'sc'], DN_NUMS = ['hi', 'si', 'mi', 'el', 'win', 'lamps', 'ex', 'sat', 'con', 'cl', 'fn', 'ff'], DN_V3 = ['tint', 'sh', 'hl'];
const dnPrep = (k) => { for (const c of DN_COLS) k['_' + c] = linHex(k[c]); return k; };
KEYS_DN.forEach(dnPrep); dnPrep(INDOOR_DN);
const DayNight = {
  clock: 20 * 60 + 40, speed: 1, lamps: 0, night: 0, indoor: false, frozen: false, sunEl: 0,
  sunDir: new V3(0.3, 0.8, 0.4), _o: null, _in: {}, _col: new THREE.Color(),
  get hour() { return this.clock / 60; },
  timeText() { const m = Math.floor(this.clock) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
  setTime(h) { this.clock = ((h * 60) % 1440 + 1440) % 1440; },
  // the current key blend: linear THREE.Colors, numbers and [r,g,b] triples (one reused object, no per-frame garbage)
  sample() {
    const o = this._o || (this._o = { tint: [1, 1, 1], sh: [1, 1, 1], hl: [1, 1, 1] });
    for (const c of DN_COLS) if (!o[c]) o[c] = new THREE.Color();
    let A, B, t;
    if (this.indoor) {
      const I = Interiors.cur && INTERIORS[Interiors.cur], id = Interiors.cur || '-';
      if (!this._in[id]) this._in[id] = I && I.mood ? dnPrep(Object.assign({}, INDOOR_DN, I.mood)) : INDOOR_DN;
      A = B = this._in[id]; t = 0;
    } else {
      const h = this.clock / 60;
      let i = 0; while (i < KEYS_DN.length - 2 && KEYS_DN[i + 1].h <= h) i++;
      A = KEYS_DN[i]; B = KEYS_DN[i + 1]; t = smooth(clamp((h - A.h) / (B.h - A.h), 0, 1));
    }
    for (const c of DN_COLS) o[c].copy(A['_' + c]).lerp(B['_' + c], t);
    for (const k of DN_NUMS) o[k] = lerp(A[k], B[k], t);
    for (const k of DN_V3) for (let j = 0; j < 3; j++) o[k][j] = lerp(A[k][j], B[k][j], t);
    o.fogC = o.fogC || new THREE.Color(); o.fogC.copy(o.hor);
    o.haze = 0; o.hazeC = o.hazeC || new THREE.Color(); o.hazeC.copy(o.hor); o.sunVis = 1; o.bloomK = 1;
    return o;
  },
  update(dt) {
    if (!this.frozen) this.clock = (this.clock + dt * this.speed) % 1440;
    const p = this.sample();
    Weather.mod(p, dt);
    this.lamps = p.lamps; this.night = clamp((p.lamps - 0.2) / 0.8, 0, 1);
    scene.fog.color.copy(p.fogC); scene.fog.near = p.fn; scene.fog.far = p.ff;
    W.hemi.color.copy(p.hs); W.hemi.groundColor.copy(p.hg); W.hemi.intensity = p.hi;
    // the sun follows its real arc (east at dawn, south at noon, west at dusk); the moon takes over the light at night
    const H = (this.clock / 1440 - 0.5) * TAU + 0.5, el = THREE.MathUtils.degToRad(p.el), ce = Math.cos(el);
    this.sunEl = p.el;
    this.sunDir.set(-Math.sin(H) * ce, Math.sin(el), Math.cos(H) * ce * 0.85 + 0.2).normalize();
    const moon = SKY_U.uMoonDir.value.set(-0.45 + Math.sin(H) * 0.3, 0.78, 0.42).normalize();
    if (p.si >= p.mi) {
      const e2 = Math.max(el, THREE.MathUtils.degToRad(this.indoor ? 70 : 11));
      W.sunDir.set(this.sunDir.x, 0, this.sunDir.z).normalize().multiplyScalar(Math.cos(e2)).setY(Math.sin(e2));
      W.sun.color.copy(p.sc); W.sun.intensity = p.si;
    } else { W.sunDir.copy(moon); W.sun.color.setRGB(0.55, 0.64, 1.0); W.sun.intensity = p.mi; }
    // sky
    SKY_U.uZen.value.copy(p.zen); SKY_U.uHor.value.copy(p.hor); SKY_U.uGnd.value.copy(p.gnd); SKY_U.uSunDir.value.copy(this.sunDir);
    SKY_U.uSunCol.value.copy(p.sc).multiplyScalar(0.6 + 0.4 * clamp(p.si, 0, 1.5)); SKY_U.uNight.value = this.night;
    SKY_U.uCloud.value = p.cl; SKY_U.uHaze.value = p.haze; SKY_U.uHazeC.value.copy(p.hazeC); SKY_U.uSunVis.value = p.sunVis;
    this._col.copy(p.hs).multiplyScalar(p.hi * 0.9).lerp(p.hor, 0.35); SKY_U.uCloudC.value.copy(this._col);
    // aerial perspective shares the sky's sun glow so the far city melts into the horizon
    const sv = p.sunVis * clamp((p.el + 7) / 9, 0, 1), sc = SKY_U.uSunCol.value;
    GTA_U.sun.x = this.sunDir.x; GTA_U.sun.y = this.sunDir.y; GTA_U.sun.z = this.sunDir.z;
    GTA_U.scat.x = sc.r * 0.22 * sv; GTA_U.scat.y = sc.g * 0.22 * sv; GTA_U.scat.z = sc.b * 0.22 * sv;
    // grade
    if (Render.grade) {
      const u = Render.grade.uniforms; u.uExposure.value = p.ex; u.uSat.value = p.sat; u.uContrast.value = p.con;
      u.uTint.value.set(p.tint[0], p.tint[1], p.tint[2]); u.uShadow.value.set(p.sh[0], p.sh[1], p.sh[2]); u.uHigh.value.set(p.hl[0], p.hl[1], p.hl[2]);
    } else renderer.toneMappingExposure = p.ex;
    // bloom is for neon, lamps and the sun: sunlit concrete must not glow
    if (Render.bloom) { Render.bloom.strength = (0.16 + 0.42 * p.lamps) * p.bloomK; Render.bloom.threshold = 1.35 - 0.3 * p.lamps; Render.bloom.radius = 0.5 + 0.15 * p.lamps; }
    for (const m of MAT.facades) m.emissiveIntensity = p.win;
    for (const m of W.extraFacades) m.emissiveIntensity = p.win;
    for (const m of MAT.shops) m.emissiveIntensity = 0.25 + p.win * 0.85;
    // unlit emitters: colour scalars above 1 are HDR (gtaLin keeps them linear) so they feed the bloom at night
    const lb = 0.5 + 1.9 * p.lamps; MAT.lampHead.color.setRGB(1.0 * lb, 0.8 * lb, 0.5 * lb);
    MAT.lampPool.color.setRGB(1, 0.72, 0.4); MAT.lampPool.opacity = 0.55 * p.lamps;
    const cl = 1 + 1.3 * p.lamps; MAT.carLights.color.setRGB(cl, cl, cl);
    MAT.headBeam.opacity = 0.32 * p.lamps;
    const ab = 0.92 + 0.8 * p.lamps; MAT.ads.color.setRGB(ab, ab, ab);
    for (const h of W.hqs) h.signMat.color.setScalar(0.95 + 0.8 * p.lamps);
    for (const m of W.neonMats) m.color.setScalar(0.92 + 1.1 * p.lamps);
    Water.sync(p);
  },
};

/* ---------------- lakes & moats (什刹海, 北海, 筒子河 …): world-space ripples, fresnel sky reflection ---------------- */
const Water = {
  mat: null, U: null,
  init() {
    if (this.U) return;
    this.U = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SKY_U, {
      gtaSun: { value: GTA_U.sunV }, gtaScat: { value: GTA_U.scat }, gtaFog: { value: GTA_U.fog }, gtaWx: { value: GTA_U.wx },
      uTime: { value: 0 }, uLight: { value: new THREE.Color() }, uSunL: { value: new THREE.Color() }, uLDir: { value: new V3(0, 1, 0) },
      uDeep: { value: linHex('#173d3c') }, uShallow: { value: linHex('#2f5f55') }, uRain: { value: 0 }, uLamp: { value: 0 },
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.U, fog: true,
      vertexShader: '#include <common>\n#include <fog_pars_vertex>\nvoid main(){\n#include <begin_vertex>\n vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: [
        '#include <common>', '#include <fog_pars_fragment>', SKY_GLSL,
        'uniform float uTime, uRain, uLamp; uniform vec3 uLight, uSunL, uLDir, uDeep, uShallow;',
        'vec2 wv(vec2 p, vec2 d, float f, float s){ float ph = dot(p, d) * f + uTime * s; return d * cos(ph) * f; }',
        'void main(){',
        '  vec2 p = vGtaW.xz;',
        '  vec2 g = wv(p, vec2(0.83, 0.55), 0.9, 1.3) * 0.02 + wv(p, vec2(-0.45, 0.89), 1.7, 1.9) * 0.012 + wv(p, vec2(0.97, -0.24), 3.1, 2.7) * 0.006 + wv(p, vec2(-0.7, -0.7), 5.3, 3.6) * 0.003;',
        '  float n = skN(p * 0.7 + uTime * 0.25) - skN(p * 0.7 + vec2(0.37, 0.61) - uTime * 0.2);',
        '  g += vec2(n, -n) * 0.03;',
        '  if (uRain > 0.01) { vec2 q = p * 3.0; vec2 c = floor(q); float r = fract(sin(dot(c, vec2(12.99, 78.23))) * 43758.5); float ph = fract(uTime * 0.9 + r);',
        '    float dd = length(fract(q) - 0.5); g += normalize(fract(q) - 0.5 + 1e-4) * sin((dd - ph * 0.5) * 40.0) * (1.0 - ph) * smoothstep(0.5, 0.0, dd) * 0.08 * uRain; }',
        '  vec3 N = normalize(vec3(-g.x, 1.0, -g.y)), V = normalize(cameraPosition - vGtaW);',
        '  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);',
        '  vec3 R = reflect(-V, N); R.y = abs(R.y);',
        '  vec3 refl = skyCol(R, 1.0);',
        // night: the lit shore (bars, lamps, windows) mirrors as thin warm streaks running toward the viewer, in sparse
        // clusters, broken by the ripples; between them the lake stays dark (not a sheet of tan)
        '  vec2 vd = normalize(cameraPosition.xz - p + 1e-4); float acr = dot(p, vec2(-vd.y, vd.x)), alo = dot(p, vd);',
        '  float st = smoothstep(0.62, 0.95, skN(vec2(acr * 0.8, alo * 0.05) + g * 8.0 + vec2(0.0, uTime * 0.1))) * smoothstep(0.5, 0.85, skN(vec2(acr * 0.06, 3.7)));',
        '  refl += vec3(1.0, 0.7, 0.4) * uLamp * smoothstep(0.22, 0.0, R.y) * (0.006 + 0.14 * st);',
        '  float depth = 0.5 + 0.5 * skN(p * 0.05);',
        '  vec3 body = mix(uShallow, uDeep, depth) * (uLight + uSunL * max(uLDir.y, 0.0) * 0.6) * 0.6;',
        '  body += (vec3(1.0, 0.62, 0.3) * 0.012 * (0.6 + 0.4 * skN(p * 0.3)) + vec3(0.012, 0.022, 0.034)) * uLamp;',
        '  vec3 col = mix(body, refl, clamp(fr, 0.0, 1.0));',
        '  col += uSunL * pow(max(dot(reflect(-uLDir, N), V), 0.0), 240.0) * 6.0;',
        '  gl_FragColor = vec4(col, 1.0);',
        '#include <fog_fragment>', '#include <tonemapping_fragment>', '#include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
  },
  sync(p) {
    if (!this.U) return;
    this.U.uLight.value.copy(p.hs).multiplyScalar(p.hi);
    this.U.uSunL.value.copy(W.sun.color).multiplyScalar(W.sun.intensity);
    this.U.uLDir.value.copy(W.sunDir); this.U.uLamp.value = p.lamps; this.U.uRain.value = DayNight.indoor ? 0 : Weather.str.rain;
  },
  update(t) { if (this.U) this.U.uTime.value = t; },
};
