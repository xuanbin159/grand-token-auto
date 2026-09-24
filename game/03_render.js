/* ============================================================
   render: post-processing (bloom + SA-style grade + FXAA),
   see-through cutout, sky dome, day/night cycle, sea
   ============================================================ */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uExposure: { value: 1 }, uSat: { value: 1.1 }, uContrast: { value: 1.05 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0.38 }, uTime: { value: 0 }, uHallu: { value: 0 }, uGrain: { value: 0.022 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float uExposure, uSat, uContrast, uVig, uTime, uHallu, uGrain; uniform vec3 uTint; varying vec2 vUv;',
    'vec3 shoulder(vec3 c){ vec3 k = vec3(0.78); vec3 o = max(c - k, 0.0); return min(c, k) + o / (1.0 + o * 1.5); }',
    'vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec3 col;',
    '  if (uHallu > 0.001) {',
    '    uv += vec2(sin(uv.y * 14.0 + uTime * 3.1), cos(uv.x * 11.0 + uTime * 2.4)) * 0.007 * uHallu;',
    '    float o = 0.006 * uHallu;',
    '    col = vec3(texture2D(tDiffuse, uv + vec2(o, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(o, o)).b);',
    '  } else col = texture2D(tDiffuse, uv).rgb;',
    '  col = shoulder(col * uExposure) * uTint;',
    '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(l), col, uSat);',
    '  col = (col - 0.5) * uContrast + 0.5;',
    '  if (uHallu > 0.001) col = mix(col, hue(col, uTime * 1.3), uHallu * 0.6);',
    '  vec2 d = vUv - 0.5; col *= 1.0 - uVig * dot(d, d) * 1.7;',
    '  col += (fract(sin(dot(vUv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain;',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}',
  ].join('\n'),
};

const Render = {
  fx: !LOWQ, composer: null, bloom: null, grade: null, fxaa: null, renderPass: null,
  cutU: { uCutPos: { value: new THREE.Vector2(-1e5, -1e5) }, uCutR: { value: 0 }, uCutDepth: { value: 0 }, uNear: { value: 0 } },
  _v: new V3(),
  // dithered see-through hole around the player for anything between camera and player
  cutout(mat) {
    const U = this.cutU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCutPos = U.uCutPos; sh.uniforms.uCutR = U.uCutR; sh.uniforms.uCutDepth = U.uCutDepth; sh.uniforms.uNear = U.uNear;
      sh.vertexShader = 'varying float vCutZ;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutZ = -mvPosition.z;');
      sh.fragmentShader = 'uniform vec2 uCutPos; uniform float uCutR; uniform float uCutDepth; uniform float uNear; varying float vCutZ;\n' +
        'float cutBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }\n' +
        sh.fragmentShader.replace('void main() {', 'void main() {\n  float cutN = cutBayer2(0.5 * gl_FragCoord.xy) * 0.25 + cutBayer2(gl_FragCoord.xy);\n  if (vCutZ < uNear && cutN < (uNear - vCutZ) / 4.0) discard;\n  if (uCutR > 0.0 && vCutZ < uCutDepth) { float cr = length(gl_FragCoord.xy - uCutPos) / uCutR; if (cr < 1.0 && cutN > cr * cr * 0.92) discard; }');
    };
    mat.customProgramCacheKey = () => 'cutout';
    return mat;
  },
  init() {
    if (!this.fx) return;
    try {
      const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
      const caps = renderer.capabilities;
      const type = caps.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
      const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type });
      this.composer = new THREE.EffectComposer(renderer, rt);
      this.renderPass = new THREE.RenderPass(scene, camera);
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.62, 0.5, 0.86);
      this.grade = new THREE.ShaderPass(GradeShader);
      this.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom);
      this.composer.addPass(this.grade); this.composer.addPass(this.fxaa);
      this.resize();
    } catch (e) { this.fx = false; this.composer = null; }
  },
  resize() {
    if (!this.composer) return;
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.setSize(innerWidth / 2, innerHeight / 2);
    const pr = renderer.getPixelRatio();
    this.fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  },
  render(t) {
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

/* ---------------- sky dome ---------------- */
const Sky = {
  mesh: null, U: null,
  init() {
    this.U = {
      uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uSunDir: { value: new V3(0.3, 0.6, 0.4) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uNight: { value: 0 }, uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: [
        'uniform vec3 uTop, uMid, uBot, uSunDir, uSunCol; uniform float uNight, uTime; varying vec3 vDir;',
        'float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }',
        'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  float a = hash(vec3(i, 0.0)), b = hash(vec3(i + vec2(1.0, 0.0), 0.0)), c = hash(vec3(i + vec2(0.0, 1.0), 0.0)), d = hash(vec3(i + vec2(1.0, 1.0), 0.0));',
        '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }',
        'void main(){',
        '  vec3 d = normalize(vDir); float h = d.y;',
        '  vec3 col = mix(uBot, uMid, smoothstep(-0.2, 0.06, h));',
        '  col = mix(col, uTop, smoothstep(0.06, 0.65, h));',
        '  float s = max(dot(d, normalize(uSunDir)), 0.0);',
        '  col += uSunCol * (pow(s, 600.0) * 2.4 + pow(s, 14.0) * 0.32 * (1.0 - uNight * 0.7));',
        '  if (h > 0.0) {',
        '    vec2 uv = d.xz / (h + 0.18) * 1.5 + vec2(uTime * 0.012, uTime * 0.004);',
        '    float n = noise(uv * 2.0) * 0.6 + noise(uv * 4.3) * 0.3 + noise(uv * 9.1) * 0.1;',
        '    float cl = smoothstep(0.56, 0.86, n) * smoothstep(0.0, 0.28, h);',
        '    col = mix(col, mix(vec3(1.0), uSunCol, 0.4) * (1.0 - uNight * 0.78), cl * 0.6);',
        '    float st = step(0.9972, hash(floor(d * 300.0)));',
        '    col += vec3(st) * uNight * smoothstep(0.02, 0.3, h) * (1.0 - cl);',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), mat);
    this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  },
  update(t) { this.mesh.position.copy(camera.position); this.U.uTime.value = t; },
};

/* ---------------- day / night ---------------- */
const KEYS_DN = [
  { h: 0, top: '#070b1c', mid: '#141b3a', bot: '#262746', fog: '#161c30', hs: '#6a7cab', hg: '#24222e', hi: 0.52, sc: '#9fb4ff', si: 0.3, el: 50, win: 1.1, lamps: 1, ex: 1.18, tint: [0.9, 0.96, 1.12], sat: 1.05, fn: 90, ff: 300 },
  { h: 5, top: '#0b1026', mid: '#1c2448', bot: '#2e2c4a', fog: '#1b2036', hs: '#6d7ea9', hg: '#26242e', hi: 0.52, sc: '#a8b8ff', si: 0.3, el: 40, win: 1.05, lamps: 1, ex: 1.16, tint: [0.92, 0.96, 1.1], sat: 1.05, fn: 90, ff: 300 },
  { h: 6.5, top: '#3d5a8a', mid: '#e8a38c', bot: '#f2c49b', fog: '#d9a99a', hs: '#c9b8c8', hg: '#5a4a44', hi: 0.52, sc: '#ffb07a', si: 0.6, el: 14, win: 0.7, lamps: 0.5, ex: 1.04, tint: [1.06, 0.98, 0.95], sat: 1.1, fn: 120, ff: 360 },
  { h: 8, top: '#6fa6e0', mid: '#bcd8f0', bot: '#e8e2d4', fog: '#cfd8de', hs: '#cfe0ff', hg: '#7a6a58', hi: 0.54, sc: '#fff0d8', si: 0.72, el: 32, win: 0.25, lamps: 0, ex: 1.0, tint: [1, 1, 1], sat: 1.08, fn: 140, ff: 420 },
  { h: 12, top: '#5b9be0', mid: '#a9cdf0', bot: '#efe6d6', fog: '#d7dde0', hs: '#cfe0ff', hg: '#7a6a58', hi: 0.55, sc: '#fff6e8', si: 0.76, el: 62, win: 0.2, lamps: 0, ex: 1.0, tint: [1.02, 1.0, 0.97], sat: 1.08, fn: 150, ff: 440 },
  { h: 16.5, top: '#6b9ed6', mid: '#e5d0b0', bot: '#f0caa0', fog: '#e0c0a0', hs: '#e8d8c8', hg: '#7a6450', hi: 0.54, sc: '#ffe0b0', si: 0.75, el: 34, win: 0.3, lamps: 0, ex: 1.0, tint: [1.07, 1.0, 0.92], sat: 1.12, fn: 130, ff: 400 },
  { h: 19, top: '#3a4a8a', mid: '#f08a5a', bot: '#ffb070', fog: '#d98a70', hs: '#d0a0b0', hg: '#6a4a40', hi: 0.55, sc: '#ff9a50', si: 0.68, el: 10, win: 0.75, lamps: 0.6, ex: 1.05, tint: [1.1, 0.96, 0.9], sat: 1.16, fn: 110, ff: 360 },
  { h: 20.5, top: '#1a2050', mid: '#6a4a7a', bot: '#b06a6a', fog: '#4a3e58', hs: '#8a86c0', hg: '#2a2030', hi: 0.46, sc: '#c8a0ff', si: 0.34, el: 42, win: 1, lamps: 1, ex: 1.12, tint: [0.98, 0.95, 1.06], sat: 1.1, fn: 100, ff: 320 },
  { h: 22, top: '#070b1c', mid: '#141b3a', bot: '#262746', fog: '#161c30', hs: '#6a7cab', hg: '#24222e', hi: 0.52, sc: '#9fb4ff', si: 0.3, el: 50, win: 1.1, lamps: 1, ex: 1.18, tint: [0.9, 0.96, 1.12], sat: 1.05, fn: 90, ff: 300 },
  { h: 24, top: '#070b1c', mid: '#141b3a', bot: '#262746', fog: '#161c30', hs: '#6a7cab', hg: '#24222e', hi: 0.52, sc: '#9fb4ff', si: 0.3, el: 50, win: 1.1, lamps: 1, ex: 1.18, tint: [0.9, 0.96, 1.12], sat: 1.05, fn: 90, ff: 300 },
];
const INDOOR_DN = { top: '#222', mid: '#333', bot: '#444', fog: '#0c0e12', hs: '#fff3e2', hg: '#6b5a4a', hi: 0.64, sc: '#ffffff', si: 0.42, el: 70, win: 0.4, lamps: 0.2, ex: 1.02, tint: [1.02, 1.0, 0.98], sat: 1.06, fn: 200, ff: 900 };
const DayNight = {
  clock: 20 * 60 + 40, speed: 1, lamps: 0, night: 0, indoor: false, frozen: false,
  _c: {}, _a: new THREE.Color(), _b: new THREE.Color(),
  get hour() { return this.clock / 60; },
  timeText() { const m = Math.floor(this.clock) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); },
  setTime(h) { this.clock = ((h * 60) % 1440 + 1440) % 1440; },
  sample() {
    if (this.indoor) { const I = Interiors.cur && INTERIORS[Interiors.cur]; return I && I.mood ? Object.assign({}, INDOOR_DN, I.mood) : INDOOR_DN; }
    const h = this.clock / 60;
    let i = 0; while (i < KEYS_DN.length - 2 && KEYS_DN[i + 1].h <= h) i++;
    const A = KEYS_DN[i], B = KEYS_DN[i + 1], t = clamp((h - A.h) / (B.h - A.h), 0, 1);
    const o = this._c;
    for (const k of ['top', 'mid', 'bot', 'fog', 'hs', 'hg', 'sc']) o[k] = [A[k], B[k], t];
    for (const k of ['hi', 'si', 'el', 'win', 'lamps', 'ex', 'sat', 'fn', 'ff']) o[k] = lerp(A[k], B[k], t);
    o.tint = [lerp(A.tint[0], B.tint[0], t), lerp(A.tint[1], B.tint[1], t), lerp(A.tint[2], B.tint[2], t)];
    return o;
  },
  col(target, v) { if (Array.isArray(v)) target.set(v[0]).lerp(this._b.set(v[1]), v[2]); else target.set(v); return target; },
  update(dt) {
    if (!this.frozen) this.clock = (this.clock + dt * this.speed) % 1440;
    const p = this.sample();
    this.lamps = p.lamps; this.night = clamp((p.lamps - 0.2) / 0.8, 0, 1);
    this.col(scene.fog.color, p.fog); scene.fog.near = p.fn; scene.fog.far = p.ff;
    this.col(W.hemi.color, p.hs); this.col(W.hemi.groundColor, p.hg); W.hemi.intensity = p.hi;
    this.col(W.sun.color, p.sc); W.sun.intensity = p.si;
    const az = (this.clock / 1440) * TAU + 2.2, el = THREE.MathUtils.degToRad(p.el);
    W.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el) * 0.6 + 0.45).normalize();
    if (Sky.U) {
      this.col(Sky.U.uTop.value, p.top); this.col(Sky.U.uMid.value, p.mid); this.col(Sky.U.uBot.value, p.bot);
      Sky.U.uSunDir.value.copy(W.sunDir); this.col(Sky.U.uSunCol.value, p.sc); Sky.U.uNight.value = this.night;
    }
    if (Render.grade) { const u = Render.grade.uniforms; u.uExposure.value = p.ex; u.uSat.value = p.sat; u.uTint.value.set(p.tint[0], p.tint[1], p.tint[2]); }
    // bloom is for neon and headlights: keep it low in daylight so sunlit concrete doesn't glow
    if (Render.bloom) { Render.bloom.strength = 0.24 + 0.52 * p.lamps; Render.bloom.threshold = 0.93 - 0.1 * p.lamps; }
    for (const m of MAT.facades) m.emissiveIntensity = p.win;
    for (const m of W.extraFacades) m.emissiveIntensity = p.win;
    for (const m of MAT.shops) m.emissiveIntensity = 0.25 + p.win * 0.85;
    const lb = 0.35 + 2.3 * p.lamps;
    MAT.lampHead.color.setRGB(1.0 * lb, 0.92 * lb, 0.66 * lb);
    MAT.lampPool.opacity = 0.5 * p.lamps;
    const cl = 1 + 1.5 * p.lamps; MAT.carLights.color.setRGB(cl, cl, cl);
    MAT.headBeam.opacity = 0.32 * p.lamps;
    const ab = 0.72 + 1.0 * p.lamps; MAT.ads.color.setRGB(ab, ab, ab);
    for (const h of W.hqs) h.signMat.color.setScalar(0.95 + 0.9 * p.lamps);
    for (const m of W.neonMats) m.color.setScalar(0.9 + 1.3 * p.lamps);
    Water.sync(p);
  },
};

/* ---------------- lakes & moats (什刹海, 北海, 筒子河 …): one calm-water shader ---------------- */
const Water = {
  mat: null, U: null, meshes: [],
  init() {
    if (this.U) return;
    this.U = {
      uTime: { value: 0 }, uSunDir: { value: new V3(0.3, 0.6, 0.4) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uSky: { value: new THREE.Color('#9fc4e8') }, uDeep: { value: new THREE.Color('#1f4f55') }, uShallow: { value: new THREE.Color('#3f7f76') },
      uFog: { value: new THREE.Color() }, uFogNear: { value: 100 }, uFogFar: { value: 400 }, uNight: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.U,
      vertexShader: [
        'varying vec3 vW; varying float vFogDepth; varying vec2 vUv;',
        'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = uv; vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uSunDir, uSunCol, uSky, uDeep, uShallow, uFog; uniform float uFogNear, uFogFar, uTime, uNight;',
        'varying vec3 vW; varying float vFogDepth; varying vec2 vUv;',
        'void main(){',
        '  float t = uTime;',
        '  vec3 n = normalize(vec3(sin(vW.x * 0.9 + t * 1.3) * 0.05 + sin((vW.x + vW.z) * 0.6 + t * 0.8) * 0.05, 1.0, cos(vW.z * 1.1 - t * 1.1) * 0.05 + sin(vW.z * 0.45 + vW.x * 0.3 - t * 0.7) * 0.04));',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);',
        '  float edge = smoothstep(0.0, 0.18, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));',
        '  vec3 col = mix(uShallow, uDeep, edge) * (1.0 - uNight * 0.65);',
        '  col = mix(col, uSky * (1.0 - uNight * 0.7), fres * 0.6);',
        '  vec3 r = reflect(-normalize(uSunDir), n);',
        '  col += uSunCol * pow(max(dot(r, v), 0.0), 120.0) * 1.6 * (1.0 - uNight);',
        '  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vFogDepth));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
  },
  build() {
    this.init();
    for (const s of W.water) {
      let g;
      if (s.ellipse) { g = new THREE.CircleGeometry(1, 48); const uv = g.attributes.uv; g.scale(s.rx, s.rz, 1); for (let i = 0; i < uv.count; i++) { const x = uv.getX(i) - 0.5, y = uv.getY(i) - 0.5, d = Math.hypot(x, y) * 2; uv.setXY(i, 0.5 - d * 0.5, 0.5 - d * 0.5); } }
      else g = new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.mat);
      m.position.set(s.ellipse ? s.x : (s.x0 + s.x1) / 2, 0.33, s.ellipse ? s.z : (s.z0 + s.z1) / 2); m.receiveShadow = false;
      scene.add(m); this.meshes.push(m);
    }
  },
  sync(p) {
    if (!this.U) return;
    this.U.uSunDir.value.copy(W.sunDir); DayNight.col(this.U.uSunCol.value, p.sc);
    DayNight.col(this.U.uSky.value, p.mid); this.U.uFog.value.copy(scene.fog.color);
    this.U.uFogNear.value = p.fn; this.U.uFogFar.value = p.ff; this.U.uNight.value = DayNight.night;
  },
  update(t) { if (this.U) this.U.uTime.value = t; },
};
