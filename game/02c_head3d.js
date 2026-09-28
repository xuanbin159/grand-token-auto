/* ============================================================
   head3d · 一张图片，一颗真脑袋
   One parametric head (skull, brow, eye sockets, nose, cheeks, lips,
   chin, jaw, ears, neck; ~2k tris) lofted from profile curves. The
   picture is projected onto it from the front *in the shader*: turned
   by `yaw` for a 3/4 photo and pinned on the two eye anchors, it fades
   (by how squarely each point faces the camera that took it) into a
   generated skin + short-hair cap whose colours and front hairline are
   sampled from the picture itself. Re-fitting (eyes, yaw) is a uniform
   change: no re-bake, one material per face, shared geometry.
   Head space: x = the subject's left, y = up, z = where the nose points;
   1 unit = half the head's width at the eyes; the eyes at (±EX, 0, EZ).
   ============================================================ */
const Head3D = (() => {
  const EX = 0.4, EZ = 0.97, Y0 = 0.25, YB = -2.3, VT = 1.5;
  const HERO = { unit: 0.66, y: 2.74 };        // world metres per head unit / eye height on the hero (chin on the collar)
  const S01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const G2 = (u, v) => Math.exp(-(u * u + v * v));
  const spow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));
  // lower-head keyframes [y, half width, front depth, back depth]; the cap above Y0 is a superellipse
  const SHAPES = {
    human: { top: 1.32, capE: 0.62, e: 0.85, face: true, ears: true,
      // below the jaw the neck tucks in (back depth 0.28 × 0.66 m sits inside the hero's torso, back face z -0.26): no skin panel behind the collar
      keys: [[0.25, 1, 1.1, 1.22], [0, 0.99, 1.08, 1.2], [-0.3, 0.96, 1.06, 1.12], [-0.6, 0.9, 1.04, 0.96], [-0.9, 0.8, 1, 0.74], [-1.1, 0.7, 0.95, 0.5],
        [-1.25, 0.6, 0.9, 0.3], [-1.38, 0.52, 0.8, 0.28], [-1.48, 0.44, 0.56, 0.28], [-1.58, 0.4, 0.36, 0.28], [-1.75, 0.4, 0.32, 0.28], [-2.3, 0.4, 0.32, 0.28]] },
    // 显示器脑袋 (Kodex / 阿福): a rounded box on a stand
    screen: { top: 1.08, capE: 0.16, e: 0.2, face: false, ears: false,
      keys: [[0.25, 1.18, 0.62, 0.86], [-0.9, 1.18, 0.62, 0.86], [-1.0, 1.14, 0.6, 0.83], [-1.06, 1.0, 0.52, 0.72], [-1.1, 0.6, 0.3, 0.45], [-1.13, 0.22, 0.14, 0.2], [-2.3, 0.22, 0.14, 0.2]] },
  };
  function key(K, y) {
    let i = 0; while (i < K.length - 2 && y < K[i + 1][0]) i++;
    const a = K[Math.max(0, i - 1)], b = K[i], c = K[i + 1], d = K[Math.min(K.length - 1, i + 2)], t = clamp((b[0] - y) / (b[0] - c[0]), 0, 1);
    const cr = (j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t);
    return { y, w: cr(1), f: cr(2), b: cr(3) };
  }
  // extra forward depth of the face at (x, y): nose, brow, sockets, cheekbones, lips, chin
  function feat(x, y) {
    const ax = Math.abs(x), nr = S01((0.08 - y) / 0.64) * (1 - S01((-0.56 - y) / 0.12)), nw = 0.1 + 0.07 * nr;
    let d = 0.3 * nr * Math.exp(-((x / nw) ** 2));
    d += 0.06 * G2((ax - 0.15) / 0.08, (y + 0.58) / 0.08);
    d += 0.06 * Math.exp(-(((y - 0.3) / 0.12) ** 2)) * (1 - S01((ax - 0.62) / 0.3));
    d -= 0.07 * G2((ax - EX) / 0.2, y / 0.13);
    d += 0.05 * G2((ax - 0.6) / 0.22, (y + 0.36) / 0.22);
    d += 0.055 * G2(x / 0.3, (y + 0.86) / 0.07) + 0.045 * G2(x / 0.26, (y + 1.0) / 0.06) - 0.02 * G2(x / 0.28, (y + 0.93) / 0.03);
    d += 0.06 * G2(x / 0.28, (y + 1.26) / 0.12);
    return d;
  }
  // hair: hairline height around the head (th = 0 front, ±π back, + = the subject's left)
  const HAIR0 = { f: 0.8, tl: 0.52, tr: 0.52, s: 0.26, b: -1.15, vol: 1, bald: false, long: false, hood: false, none: false };
  function hairline(th, H) {
    const a = Math.abs(th), t = th >= 0 ? H.tl : H.tr, sd = H.long ? -1.2 : H.s, bk = H.long ? -2.3 : H.b;
    const K = [0, 0.8, 1.5, 2.3, Math.PI], V = [H.f, t, sd, sd * 0.4 + bk * 0.6, bk];
    let i = 0; while (i < 3 && a > K[i + 1]) i++;
    const u = (a - K[i]) / (K[i + 1] - K[i]), s = (1 - Math.cos(Math.PI * u)) / 2;
    return V[i] + (V[i + 1] - V[i]) * s + 0.035 * Math.sin(th * 23) + 0.02 * Math.sin(th * 41 + 1);
  }
  function hairMask(th, y, H) {
    if (H.none) return 0;
    if (H.hood) { const q = (th / 1.0) ** 2 + ((y + 0.22) / 1.2) ** 2; return S01((q - 0.82) / 0.3); }
    let m = S01((y - hairline(th, H)) / 0.08 + 0.5);
    if (H.bald) m *= 1 - S01((y - 0.5) / 0.16);
    return m;
  }

  /* ---------------- geometry ---------------- */
  const _v = new V3(), _a = new V3(), _b = new V3();
  function buildGeo(shape, H, hi) {
    // hi: true = the hero (~2.2k tris), false = the cast (~1k), 'ped' = a closed ~200-tri skull for the instanced walkers
    const S = SHAPES[shape], K = S.keys, R = [], ped = hi === 'ped';
    const nt = ped ? 3 : hi ? 8 : 5, nc = ped ? 10 : hi ? 30 : 20, dy = ped ? 1 / 3 : hi ? 1 / 12 : 1 / 7;
    for (let k = 0; k <= nt; k++) { const a = (k / nt) * Math.PI / 2, sc = Math.pow(Math.sin(a), S.capE); R.push({ y: Y0 + (S.top - Y0) * Math.cos(a), w: K[0][1] * sc, f: K[0][2] * sc, b: K[0][3] * sc }); }
    for (let k = 1; Y0 - k * dy > -1.45; k++) R.push(key(K, Y0 - k * dy));
    for (const y of ped ? [-1.5] : [-1.5, -1.58, -1.7, -1.95, YB]) R.push(key(K, y));
    if (ped) R.push({ y: -1.53, w: 0, f: 0, b: 0 });
    const cols = []; for (let j = 0; j <= nc; j++) { const t = -1 + (2 * j) / nc; cols.push(Math.PI * (0.45 * t + 0.55 * t * t * t)); }
    const nr = R.length, W1 = nc + 1, NG = nr * W1;
    const earG = S.ears && !H.hood && !ped ? new THREE.SphereGeometry(1, hi ? 10 : 6, hi ? 7 : 5) : null, NE = earG ? earG.attributes.position.count : 0;
    const NV = NG + NE * 2, pos = new Float32Array(NV * 3), nor = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), hl = ped ? null : new Float32Array(NV).fill(-9);
    for (let i = 0; i < nr; i++) {
      const r = R[i];
      for (let j = 0; j < W1; j++) {
        const th = cols[j], sx = spow(Math.sin(th), S.e), cz = spow(Math.cos(th), S.e);
        let x = r.w * sx, y = r.y, z = (cz > 0 ? r.f : r.b) * cz;
        if (S.face && cz > 0.3) z += S01((cz - 0.3) / 0.5) * feat(x, y);
        const m = H.vol ? hairMask(th, y, H) : 0;
        // how far above the generated hairline (the shader stops projecting the photo there: its own hair / backdrop)
        if (hl) hl[i * W1 + j] = H.none ? -9 : H.hood ? (hairMask(th, y, H) - 0.5) * 0.4 : y - hairline(th, H);
        if (m > 0) {
          const h = m * H.vol * (H.hood ? 0.11 + 0.05 * S01(y / S.top) : (0.04 + 0.06 * S01(y / S.top)) * (1 - 0.5 * S01((cz - 0.55) / 0.4)) + (H.long ? 0.06 * S01((-y - 0.2) / 0.8) * S01(-cz) : 0));
          x *= 1 + h; z *= 1 + h; if (y > Y0) y = Y0 + (y - Y0) * (1 + h * 1.3);
        }
        const k = i * W1 + j;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = th / TAU + 0.5; uv[k * 2 + 1] = (r.y - YB) / (VT - YB);
      }
    }
    const P = (i, j, o) => { const k = (i * W1 + j) * 3; return o.set(pos[k], pos[k + 1], pos[k + 2]); };
    for (let i = 0; i < nr; i++) for (let j = 0; j < W1; j++) {
      const k = (i * W1 + j) * 3;
      if (i === 0) { nor[k + 1] = 1; continue; }
      P(i, j === nc ? 1 : j + 1, _a).sub(P(i, j === 0 ? nc - 1 : j - 1, _v));      // → around
      if (_a.lengthSq() < 1e-10) { nor[k + 1] = -1; continue; }                    // closed bottom pole
      P(Math.min(nr - 1, i + 1), j, _b).sub(P(i - 1, j, _v));                      // → down
      _b.cross(_a).normalize();
      nor[k] = _b.x; nor[k + 1] = _b.y; nor[k + 2] = _b.z;
    }
    const idx = [];
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) {
      const a = i * W1 + j, b = a + 1, c = a + W1, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
    if (earG) { // ears: flattened, tilted a little forward, skin-coloured (uv on the cheek below the hairline)
      const ey = -0.2, ew = key(K, ey).w, m = new THREE.Matrix4(), nm = new THREE.Matrix3(), EP = earG.attributes.position, EN = earG.attributes.normal;
      [-1, 1].forEach((s, e) => {
        m.compose(_v.set(s * (ew + 0.03), ey, -0.08), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.38, s * -0.08)), _a.set(0.13, 0.36, 0.24)); nm.getNormalMatrix(m);
        const o = NG + e * NE;
        for (let q = 0; q < NE; q++) {
          _b.fromBufferAttribute(EP, q).applyMatrix4(m); pos.set([_b.x, _b.y, _b.z], (o + q) * 3);
          _b.fromBufferAttribute(EN, q).applyMatrix3(nm).normalize(); nor.set([_b.x, _b.y, _b.z], (o + q) * 3);
          uv[(o + q) * 2] = 0.5 + s * 0.25; uv[(o + q) * 2 + 1] = -0.5; // v < 0: plain skin, never the photo (a flat ear rarely lines up)
        }
        const ia = earG.index.array; for (let q = 0; q < ia.length; q++) idx.push(ia[q] + o);
      });
      earG.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (hl) g.setAttribute('hdHl', new THREE.BufferAttribute(hl, 1));
    g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  /* ---------------- the photo on the head ---------------- */
  // head space → photo uv (the picture's own w × h, v up), and the direction the photo was taken from
  function fitM(fit, m4, dir) {
    const [L, R] = fit.eyes, al = fit.yaw || 0, ca = Math.cos(al), sa = Math.sin(al);
    const qr = -EX * ca + EZ * sa, dq = 2 * EX * ca;
    const a = (R[0] - L[0]) / dq, b = (R[1] - L[1]) / dq, bx = L[0] - a * qr, by = L[1] - b * qr, iw = fit.iw, ih = fit.ih;
    m4.set(a * ca / iw, b / iw, a * sa / iw, bx / iw, -b * ca / ih, a / ih, -b * sa / ih, 1 - by / ih, 0, 0, 0, 0, 0, 0, 0, 1);
    if (dir) dir.set(-sa, 0, ca);
    return m4;
  }
  // a power-of-two copy of the picture (mipmaps everywhere), premultiplied so the cut-out edge doesn't go black
  function photoTex(img, n = 512) {
    const c = mkCanvas(n, n), w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w && h) c.getContext('2d').drawImage(img, 0, 0, n, n);
    const t = new THREE.CanvasTexture(c); t.premultiplyAlpha = true; t.anisotropy = Math.min(4, MAX_ANISO);
    return t;
  }
  // an uploaded picture has a wall / sky behind the head: outside the middle of the face, fade out whatever is
  // neither skin nor hair so it doesn't end up painted on the head (c: the square photo canvas, the fit in picture px)
  function maskPhoto(c, fit, skin, hair) {
    const n = c.width, g = c.getContext('2d'); let im; try { im = g.getImageData(0, 0, n, n); } catch (e) { return; }
    const d = im.data, [L, R] = fit.eyes, al = fit.yaw || 0, ca = Math.cos(al), sa = Math.sin(al), qr = -EX * ca + EZ * sa, dq = 2 * EX * ca;
    const a = (R[0] - L[0]) / dq, b = (R[1] - L[1]) / dq, bx = L[0] - a * qr, by = L[1] - b * qr, A2 = a * a + b * b || 1, sx = fit.iw / n, sy = fit.ih / n, qm = EZ * sa;
    const sh = skin.map((v) => v * 0.6), hl = hair.map((v) => Math.min(255, v * 1.6 + 35));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 4; if (!d[k + 3]) continue;
      const u = (i + 0.5) * sx - bx, v = (j + 0.5) * sy - by, qx = (a * u + b * v) / A2, qy = (b * u - a * v) / A2; // picture → head plane
      if (((qx - qm) / 0.78) ** 2 + ((qy + 0.5) / 0.95) ** 2 < 1) continue;
      // near skin (lit or in shadow) or hair (or its highlights) stays; clearly neither fades out
      const p = [d[k], d[k + 1], d[k + 2]], m = Math.min(cdist(p, skin), cdist(p, sh), cdist(p, hair), cdist(p, hl));
      if (m > 75) d[k + 3] *= 1 - S01((m - 75) / 55);
    }
    g.putImageData(im, 0, 0);
  }
  const hexRGB = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hn = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hn(i) * (1 - u) + hn(i + 1) * u; };
  // generated skin + hair (or hood / bezel) in head uv: u = around, v = height
  function paintBase(skin, hair, H, shape) {
    const W = 256, HH = 128, c = mkCanvas(W, HH), g = c.getContext('2d'), im = g.createImageData(W, HH), d = im.data;
    for (let j = 0; j < HH; j++) {
      const y = VT - ((j + 0.5) / HH) * (VT - YB), neck = 1 - 0.14 * S01((-1.38 - y) / 0.35);
      for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W, th = (u - 0.5) * TAU, k = (j * W + i) * 4;
        let r = skin[0] * neck, gg = skin[1] * neck, b = skin[2] * neck;
        if (shape === 'screen') { const back = Math.abs(th) > 2.1 ? 0.84 - (((y * 7) % 1 + 1) % 1 < 0.22 && Math.abs(y) < 0.8 ? 0.2 : 0) : 1; r *= back; gg *= back; b *= back; }
        const m = hairMask(th, y, H);
        if (m > 0) {
          let s;
          if (H.hood) { const q = (th / 1.0) ** 2 + ((y + 0.22) / 1.2) ** 2; s = (0.9 + 0.1 * Math.sin(th * 5 + y * 2)) * (0.55 + 0.45 * S01((q - 1.0) / 0.25)); }
          else s = 0.88 + 0.16 * vn(u * 260 + vn(y * 2.5 + u * 9) * 5) + 0.06 * vn(u * 37 + y * 4) - 0.12 * S01((hairline(th, H) + 0.12 - y) / 0.12);
          r += (hair[0] * s - r) * m; gg += (hair[1] * s - gg) * m; b += (hair[2] * s - b) * m;
        }
        d[k] = clamp(r, 0, 255); d[k + 1] = clamp(gg, 0, 255); d[k + 2] = clamp(b, 0, 255); d[k + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
    return t;
  }
  // Lambert + the projection: photo where the head faces the camera that took it, generated skin/hair elsewhere
  function headMat(photo, base, fit) {
    const m = new THREE.MeshLambertMaterial({ map: base });
    const U = m.userData.hd = { hdPhoto: { value: photo }, hdM: { value: new THREE.Matrix4() }, hdDir: { value: new V3(0, 0, 1) }, hdFall: { value: new THREE.Vector2(0.14, 0.5) }, hdGlow: { value: 0.1 } };
    fitM(fit, U.hdM.value, U.hdDir.value);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'uniform mat4 hdM; uniform vec3 hdDir; attribute float hdHl; varying vec2 vHdPh; varying float vHdF, vHdHl;\n' +
        sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHdPh = (hdM * vec4(position, 1.0)).xy; vHdHl = hdHl;\n\t' +
          // the jaw corners: a flat picture rarely matches there (collar, shadow, hair) → generated skin
          'vHdF = dot(normal, hdDir) - 0.6 * smoothstep(0.45, 0.8, abs(position.x)) * smoothstep(-0.55, -1.05, position.y);');
      sh.fragmentShader = 'uniform sampler2D hdPhoto; uniform vec2 hdFall; uniform float hdGlow; varying vec2 vHdPh; varying float vHdF, vHdHl;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          'vec4 hdB = texture2D(map, vMapUv), hdP = texture2D(hdPhoto, vHdPh);',
          'vec2 hdE = step(vec2(0.0), vHdPh) * step(vHdPh, vec2(1.0));',
          // above the generated hairline the cap takes over (the picture's own hair / backdrop would sit on it as a patch);
          // only the solid part of the cut-out counts, and its thin edge is never un-premultiplied into a coloured fringe
          'float hdW = hdE.x * hdE.y * smoothstep(hdFall.x, hdFall.y, vHdF) * smoothstep(0.6, 0.98, hdP.a) * step(0.0, vMapUv.y) * (1.0 - smoothstep(-0.05, 0.1, vHdHl));',
          'diffuseColor.rgb *= mix(hdB.rgb, hdP.rgb / max(hdP.a, 0.35), hdW);'].join('\n\t'))
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * hdGlow;');
    };
    m.customProgramCacheKey = () => 'head3d-v2';
    return m;
  }

  /* ---------------- reading a picture: skin, hair, hairline ---------------- */
  function pixels(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const c = mkCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
    try { return { w, h, d: g.getImageData(0, 0, w, h).data }; } catch (e) { return null; }
  }
  const luma = (p) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;
  function grab(D, M, x, y, z, rad, out) { // pixels around where head point (x, y, z) lands on the picture
    const e = M.elements, u = e[0] * x + e[4] * y + e[8] * z + e[12], v = e[1] * x + e[5] * y + e[9] * z + e[13];
    const cx = Math.round(u * D.w), cy = Math.round((1 - v) * D.h);
    for (let yy = cy - rad; yy <= cy + rad; yy++) for (let xx = cx - rad; xx <= cx + rad; xx++) {
      if (xx < 0 || yy < 0 || xx >= D.w || yy >= D.h) continue;
      const k = (yy * D.w + xx) * 4; if (D.d[k + 3] > 200) out.push([D.d[k], D.d[k + 1], D.d[k + 2]]);
    }
    return out;
  }
  function midMean(ps, lo = 0.25, hi = 0.75) { // the middle of the brightness range: no glasses frames, no highlights
    if (!ps.length) return null;
    ps.sort((a, b) => luma(a) - luma(b));
    const a = Math.floor(ps.length * lo), b = Math.max(a + 1, Math.ceil(ps.length * hi)), s = [0, 0, 0];
    for (let i = a; i < b; i++) for (let c = 0; c < 3; c++) s[c] += ps[i][c];
    return s.map((v) => v / (b - a));
  }
  const cdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function sampleFace(img, fit) {
    const D = pixels(img), out = { skin: [233, 195, 160], hair: [34, 28, 26], H: Object.assign({}, HAIR0), ok: false };
    if (!D) return out;
    const M = fitM(fit, new THREE.Matrix4()), dir = new V3(-Math.sin(fit.yaw || 0), 0, Math.cos(fit.yaw || 0));
    const rad = Math.max(1, Math.round(Math.hypot(fit.eyes[1][0] - fit.eyes[0][0], fit.eyes[1][1] - fit.eyes[0][1]) / 30));
    const face = (x) => clamp(dir.x * Math.sin(x * 1.1) + dir.z * Math.cos(x * 1.1), 0, 1);
    const sk = [];
    for (const [x, y] of [[-0.55, -0.38], [0.55, -0.38], [-0.5, -0.6], [0.5, -0.6], [-0.3, -0.72], [0.3, -0.72], [0, -1.22], [0, -0.28]]) if (face(x) > 0.45) grab(D, M, x, y, 1 - 0.25 * x * x, rad, sk);
    const skin = midMean(sk, 0.3, 0.85);
    if (!skin) return out;
    out.skin = skin; out.ok = true;
    const hp = [], sl = luma(skin);
    // hair: above the brows (the very top of a cut-out picture is its matte fringe); the darker half of what isn't skin
    for (const x of [-0.6, -0.3, 0, 0.3, 0.6]) for (const y of [0.6, 0.8, 1.0, 1.15]) if (face(x) > 0.3) grab(D, M, x, y, 1.05 - 0.4 * x * x - 0.5 * Math.max(0, y - 0.5) ** 2, rad, hp);
    const far = hp.filter((p) => cdist(p, skin) > 55 || Math.abs(luma(p) - sl) > 38);
    const H = out.H;
    if (far.length > hp.length * 0.2) out.hair = midMean(far, 0.06, 0.5);
    else { out.hair = skin.map((v) => v * 0.92); H.bald = true; H.vol = 0.2; }
    // front hairline: walk up the forehead until hair wins twice in a row
    const scan = (x) => {
      if (face(x) < 0.4) return null;
      let run = 0;
      for (let y = 0.12; y < 1.3; y += 0.05) {
        const p = midMean(grab(D, M, x, y, 1.05 - 0.4 * x * x - 0.3 * Math.max(0, y - 0.5) ** 2, rad, []), 0.2, 0.8);
        if (p && cdist(p, out.hair) < cdist(p, skin)) { if (++run >= 2) return y - 0.05; } else run = 0;
      }
      return 1.25;
    };
    const c = scan(0), l = scan(0.5), r = scan(-0.5);
    if (c !== null) H.f = clamp(c, 0.2, 1.25);
    H.tl = clamp(l ?? r ?? H.f - 0.25, 0.1, H.f + 0.1); H.tr = clamp(r ?? l ?? H.f - 0.25, 0.1, H.f + 0.1);
    return out;
  }

  /* ---------------- hats & glasses (head space, vertex colours) ---------------- */
  const DOME = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), CYL = new THREE.CylinderGeometry(1, 1, 1, 20), RING = new THREE.TorusGeometry(1, 0.1, 5, 18), BALL = new THREE.SphereGeometry(1, 10, 7);
  // a crown that follows the skull's own (boxy) cap, scaled k and cut off at height yb: it clears any hair cap
  const shells = new Map();
  function shellGeo(k, yb) {
    const key = k + ':' + yb; if (shells.has(key)) return shells.get(key);
    const nc = 24, nt = 7, K0 = SHAPES.human.keys[0], top = (SHAPES.human.top - Y0) * k, a1 = Math.acos(clamp((yb - Y0) / top, 0, 1)), pos = [], idx = [];
    for (let i = 0; i <= nt; i++) {
      const a = (i / nt) * a1, sc = Math.pow(Math.sin(a), 0.62), y = Y0 + top * Math.cos(a);
      for (let j = 0; j < nc; j++) { const th = (j / nc) * TAU, cz = spow(Math.cos(th), 0.85); pos.push(K0[1] * k * sc * spow(Math.sin(th), 0.85), y, (cz > 0 ? K0[2] : K0[3]) * k * sc * cz); }
    }
    for (let i = 0; i < nt; i++) for (let j = 0; j < nc; j++) { const a = i * nc + j, b = i * nc + ((j + 1) % nc); idx.push(a, a + nc, b + nc, a, b + nc, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    shells.set(key, g); return g;
  }
  const crown = (c, k = 1.12, yb = 0.42) => gpart(shellGeo(k, yb), c);
  function hatParts(kind) {
    switch (kind) {
      case 'cap': return [crown(0xd11f2a), gpart(CYL, 0xb8151f, 0, 0.46, 1.12, -0.14, 0, 0, 0.9, 0.05, 0.68),
        gpart(BALL, 0xb8151f, 0, 1.56, 0, 0, 0, 0, 0.12, 0.08, 0.12), gpart(_BOX, 0xffffff, 0, 0.9, 1.12, -0.42, 0, 0, 0.34, 0.32, 0.05)];
      case 'hardhat': return [crown(0xf7c81e, 1.16), gpart(CYL, 0xe0a800, 0, 0.44, 0.02, 0, 0, 0, 1.4, 0.07, 1.56), box(0, 1.6, 0, 0.2, 0.12, 1.3, 0xe0a800)];
      case 'straw': return [gpart(CYL, 0xe2c27a, 0, 0.72, -0.04, 0, 0, 0, 1.9, 0.05, 1.95), gpart(CYL, 0xe8cd8a, 0, 1.1, -0.06, 0, 0, 0, 1.14, 0.72, 1.32),
        gpart(CYL, 0xc8102e, 0, 0.86, -0.06, 0, 0, 0, 1.16, 0.18, 1.34), gpart(DOME, 0xe8cd8a, 0, 1.45, -0.06, 0, 0, 0, 1.14, 0.16, 1.32)];
      case 'guapi': return [crown(0x1b1b1f, 1.12, 0.62), gpart(CYL, 0x2a2a30, 0, 0.66, 0, 0, 0, 0, 1.13, 0.12, 1.3), gpart(BALL, 0xc8102e, 0, 1.64, 0, 0, 0, 0, 0.15, 0.15, 0.15)];
      case 'leifeng': return [crown(0x7a5534, 1.16), gpart(CYL, 0xa07a52, 0, 0.56, -0.02, 0, 0, 0, 1.22, 0.34, 1.42),
        gpart(BALL, 0x6b4a2e, -1.16, -0.1, -0.06, 0, 0, 0, 0.2, 0.62, 0.52), gpart(BALL, 0x6b4a2e, 1.16, -0.1, -0.06, 0, 0, 0, 0.2, 0.62, 0.52)];
    }
    return [];
  }
  // a bar from (ax, az) to (bx, bz) at height y (glasses arms hugging the side of the head)
  const bar = (ax, az, bx, bz, y, t, c) => gpart(_BOX, c, (ax + bx) / 2, y, (az + bz) / 2, 0, Math.atan2(bx - ax, bz - az), 0, t, t, Math.hypot(bx - ax, bz - az) + t);
  function glassesParts(kind) {
    if (!kind) return [];
    const z = 1.16, P = [];
    if (kind === 'vr') {
      P.push(box(0, 0.03, 1.2, 1.5, 0.56, 0.42, 0xf2f4f7), box(0, 0.03, 1.415, 1.32, 0.4, 0.02, 0x16181d), box(0, 0.0, 1.43, 1.0, 0.05, 0.01, 0x38e1ff));
      P.push(gpart(RING, 0x2a2e36, 0, 0.05, 0.02, Math.PI / 2, 0, 0, 1.13, 1.32, 1.2));
      return P;
    }
    const big = kind === 'hama', rx = big ? 0.29 : 0.24, ry = big ? 0.25 : 0.19;
    const frame = kind === 'goldrim' || big ? 0xd4a017 : 0x0b0b0d, lens = big ? 0xff7a8a : 0x111114, t = kind === 'goldrim' ? 0.035 : 0.05;
    for (const s of [-1, 1]) {
      if (kind !== 'goldrim') P.push(gpart(CYL, lens, s * EX, -0.01, z, Math.PI / 2, 0, 0, rx, 0.03, ry));
      P.push(gpart(RING, frame, s * EX, -0.01, z + 0.01, 0, 0, 0, rx, ry, kind === 'goldrim' ? 0.4 : 0.8));
      const e = EX + rx;
      P.push(bar(s * e, z, s * 0.76, 0.93, 0.03, t, frame), bar(s * 0.76, 0.93, s * 1.02, 0.46, 0.03, t, frame), bar(s * 1.02, 0.46, s * 1.06, -0.08, 0.03, t, frame));
    }
    P.push(box(0, 0.05, z + 0.04, 2 * (EX - rx) + 0.06, t, t, frame));
    return P;
  }

  /* ---------------- faces: the hero, the drawn cast ---------------- */
  // the cast drawn in 02_assets (drawHead): eyes on the 256 canvas, colours of the back of the head, hair style
  const EYES_DRAWN = [[100, 130], [156, 130]];
  const CAST3D = {
    klaude: { skin: '#1b1613', hair: '#3a261d', H: { hood: true } }, klaudeEvil: { skin: '#140a08', hair: '#2a1410', H: { hood: true } },
    master: { skin: '#f2efe8', hair: '#5a1515', H: { hood: true } }, shadow: { skin: '#16161a', hair: '#16161a', eyes: [[91, 126], [165, 126]], H: { hood: true } },
    kodex: { shape: 'screen', skin: '#f2f3f5', eyes: [[96, 124], [160, 124]], H: { none: true } }, alfred: { shape: 'screen', skin: '#c9ced6', eyes: [[96, 124], [160, 124]], H: { none: true } },
    gordon: { skin: '#e9bd97', hair: '#6b4a2f', eyes: [[96, 128], [160, 128]] }, rachel: { skin: '#f5d0b3', hair: '#3b2418', H: { long: true, vol: 1.3, f: 0.86 } },
    crane: { skin: '#b79b6b', hair: '#b79b6b', eyes: [[92, 116], [164, 116]], H: { none: true } }, bug: { skin: '#5fbf4a', hair: '#5fbf4a', eyes: [[94, 128], [162, 128]], H: { none: true } },
    labeler: { skin: '#dfe6d6', hair: '#2a2a2a' }, dama: { skin: '#f0c8a4', hair: '#2b1d16', H: { vol: 1.9, f: 0.9 } },
    daye: { skin: '#e8b890', hair: '#b8b8b8', H: { bald: true, f: 1.4, tl: 1.3, tr: 1.3, vol: 0.6 } }, shopkeeper: { skin: '#ecc59c', hair: '#1b1b1b', H: { f: 0.66 } },
    doctor: { skin: '#efcfae', hair: '#f2f2f2', ring: false }, waiter: { skin: '#f1cba8', hair: '#1b1b1b' }, xs1: { skin: '#f0c49c', hair: '#111111' },
    xs2: { skin: '#ecc39e', hair: '#2a2a2a', eyes: [[104, 124], [152, 124]], ring: [128, 138, 64, 96] },
  };
  const geoCache = new Map(), castCache = new Map();
  function geoFor(shape, H, hi) {
    const k = shape + ':' + hi + ':' + JSON.stringify(H);
    let g = geoCache.get(k); if (!g) { g = buildGeo(shape, H, hi); geoCache.set(k, g); }
    return g;
  }
  let hero = null;
  function heroFace() {
    if (hero) return hero;
    const img = FACE_IMG, iw = img.naturalWidth || img.width || 300, ih = img.naturalHeight || img.height || 364;
    const fit = { eyes: FACE_EYES, yaw: FACE_YAW, iw, ih }, s = sampleFace(img, fit);
    const photo = photoTex(img), base = paintBase(s.skin, s.hair, s.H, 'human');
    // an upload with a background behind the head gets it faded out; the built-in face (and crops of it) is a clean cut-out
    const cut = typeof HeroFace === 'undefined' || !HeroFace.custom || HeroFace.cut;
    if (s.ok && !cut) { maskPhoto(photo.image, fit, s.skin, s.hair); photo.needsUpdate = true; }
    hero = { geo: buildGeo('human', s.H, true), mat: headMat(photo, base, fit), photo, base, fit, s };
    return hero;
  }
  function castFace(t) {
    let c = castCache.get(t); if (c) return c;
    const kind = t.headKind, raw = (t.image && t.image.raw) || t.image, meta = (raw && raw.meta) || {}, D = CAST3D[kind] || {};
    const shape = D.shape || 'human', H = Object.assign({}, HAIR0, D.H || {});
    const fit = { eyes: D.eyes || EYES_DRAWN, yaw: 0, iw: raw.width || 256, ih: raw.height || 256 };
    let skin = D.skin || meta.skin, hair = D.hair || meta.hair;
    if (!skin || !hair) { const s = sampleFace(raw, fit); skin = skin || s.skin; hair = hair || s.hair; }
    let src = raw;
    if (shape === 'human' && !H.hood && !H.none && D.ring !== false && typeof skin === 'string') {
      // the ink outline of a drawn face would read as a chin strap in 3D: paint the lower half of it out
      src = mkCanvas(raw.width, raw.height); const g = src.getContext('2d'), [cx, cy, rx, ry] = D.ring || [128, 138, 78, 90];
      g.drawImage(raw, 0, 0); g.strokeStyle = skin; g.lineWidth = 13; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, -0.08 * Math.PI, 1.08 * Math.PI); g.stroke();
      g.clearRect(0, cy + ry + 7, raw.width, raw.height); // hair drawn behind the chin would read as a beard

    }
    const photo = photoTex(src, 256), base = paintBase(typeof skin === 'string' ? hexRGB(skin) : skin, typeof hair === 'string' ? hexRGB(hair) : hair, H, shape);
    c = { geo: geoFor(shape, H, false), mat: headMat(photo, base, fit), shape };
    castCache.set(t, c);
    return c;
  }
  function assemble(F, hat, glasses) {
    const g = new THREE.Group(), m = new THREE.Mesh(F.geo, F.mat);
    m.castShadow = true; g.add(m); g.userData.face = m;
    const acc = [...hatParts(hat), ...glassesParts(glasses)];
    if (acc.length) { const a = new THREE.Mesh(mergeParts(acc), MAT.vc); a.castShadow = true; a.geometry.userData.own = true; g.add(a); }
    return g;
  }

  /* ---------------- hero hook: the 3D head replaces the sticker wherever the person shows ---------------- */
  let carHead = null, idleT = 0, look = 0;
  const _q = new V3();
  function syncHero(P, dt = 0) {
    const H = P.human, hd = H && H.head3d, human = P.face.material === P.faceMatH;
    if (H && H.rig && human) P.face.visible = false; // the VRM hero has a face of its own (anime or the photo head on its neck)
    if (!hd) return;
    if (human) P.face.visible = false;
    const pulse = P.gulp > 0 ? Math.sin(Math.min(1, (0.22 - P.gulp) / 0.22) * Math.PI) * 0.22 : 0;
    hd.scale.setScalar(HERO.unit * (1 + pulse));
    if (hd.userData.vrm) { if (carHead) carHead.visible = false; return; } // on the VRM body: the rig turns the head, no roof gag
    // standing about: after a moment the head turns to glance at the camera (only if it's somewhere in front)
    idleT = P.mode === 'human' && !P.atk && hyp(P.vel.x, P.vel.z) < 0.5 ? idleT + dt : 0;
    const d = angDiff(P.heading, Math.atan2(Cam.toCam.x, Cam.toCam.z));
    look = damp(look, idleT > 1.4 && Math.abs(d) < 2.1 ? clamp(d, -0.75, 0.75) : 0, 3, dt || 0.016);
    hd.rotation.y = look;
    // in a car the body is hidden: the head pokes out of the roof and turns with the car
    const c = human && P.mode === 'car' && !H.root.visible ? P.car : null;
    if (c && !c.removed) {
      if (!carHead || carHead.userData.src !== hd) { if (carHead) scene.remove(carHead); carHead = hd.clone(); carHead.userData.src = hd; scene.add(carHead); }
      const u = HERO.unit * 0.78 * (1 + pulse), fx = Math.sin(c.heading), fz = Math.cos(c.heading), gy = c.gy ?? groundH(c.pos.x, c.pos.z);
      _q.set(c.pos.x - fx * 0.15 + fz * 0.42, gy + (c.y || 0) + (c.k ? c.k.h : 1.7) - 0.3 + 1.42 * u, c.pos.z - fz * 0.15 - fx * 0.42);
      carHead.position.copy(_q); carHead.rotation.set(0, c.heading, 0); carHead.scale.setScalar(u); carHead.visible = true;
    } else if (carHead) carHead.visible = false;
  }
  /* ---------------- finding the face in an uploaded picture ---------------- */
  // how far the eyes' midpoint sits across the cheek-level skin span, for a head turned by yaw (model cross-section at y −0.3)
  const YAW_TAB = (() => {
    const out = [];
    for (let d = -60; d <= 60; d += 2) {
      const al = (d * Math.PI) / 180, ca = Math.cos(al), sa = Math.sin(al);
      let lo = 1e9, hi = -1e9;
      for (let k = 0; k <= 40; k++) { const th = -Math.PI / 2 + (k / 40) * Math.PI, x = 0.96 * spow(Math.sin(th), 0.85), z = 1.06 * spow(Math.cos(th), 0.85), q = ca * x + sa * z; lo = Math.min(lo, q); hi = Math.max(hi, q); }
      out.push([al, (EZ * sa - lo) / (hi - lo)]);
    }
    return out;
  })();
  const yawFromRatio = (r) => { let b = YAW_TAB[0], e = 9; for (const t of YAW_TAB) { const d = Math.abs(t[1] - r); if (d < e) { e = d; b = t; } } return b[0]; };
  // FaceDetector (where the browser has it) for the box / eyes, then skin segmentation + dark blobs inside the skin for the eyes,
  // and the skin span at cheek level for the yaw. Everything in the source picture's pixels; null when there's no face-ish skin.
  async function detect(src) {
    const w0 = src.width, h0 = src.height; if (!w0 || !h0) return null;
    let fd = null;
    if (typeof FaceDetector === 'function') try {
      const fs = await Promise.race([new FaceDetector({ fastMode: false, maxDetectedFaces: 1 }).detect(src), new Promise((r) => setTimeout(() => r(null), 1500))]);
      if (fs && fs[0]) {
        const f = fs[0], b = f.boundingBox, ey = (f.landmarks || []).filter((l) => l.type === 'eye' && l.locations && l.locations.length)
          .map((l) => { let x = 0, y = 0; for (const p of l.locations) { x += p.x; y += p.y; } return [x / l.locations.length, y / l.locations.length]; });
        fd = { box: [b.x, b.y, b.width, b.height], eyes: ey.length === 2 ? ey.sort((p, q) => p[0] - q[0]) : null };
      }
    } catch (e) { fd = null; }
    const k = Math.min(1, 200 / Math.max(w0, h0)), w = Math.max(8, Math.round(w0 * k)), h = Math.max(8, Math.round(h0 * k)), N = w * h;
    const c = mkCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
    let D; try { D = g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    const skin = new Uint8Array(N), Y = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = D[i * 4], gg = D[i * 4 + 1], b = D[i * 4 + 2], y = 0.299 * r + 0.587 * gg + 0.114 * b, cb = 128 - 0.1687 * r - 0.3313 * gg + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * gg - 0.0813 * b;
      Y[i] = y; skin[i] = D[i * 4 + 3] > 128 && y > 40 && cr > 137 && cr < 180 && cb > 75 && cb < 130 && r > gg && r > b ? 1 : 0;
    }
    // connected skin regions: keep the big one nearest the middle (or the FaceDetector box)
    const lab = new Int32Array(N), stack = new Int32Array(N), fb = fd ? fd.box.map((v) => v * k) : null;
    let best = null, nl = 0;
    for (let s = 0; s < N; s++) {
      if (!skin[s] || lab[s]) continue;
      const id = ++nl; let sp = 0, n = 0, sx = 0, sy = 0; stack[sp++] = s; lab[s] = id;
      while (sp) { const p = stack[--sp], x = p % w, y = (p / w) | 0; n++; sx += x; sy += y;
        if (x > 0 && skin[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; } if (x < w - 1 && skin[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && skin[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; } if (y < h - 1 && skin[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; } }
      if (n < N * 0.015) continue;
      const cx = sx / n, cy = sy / n, off = fb ? Math.hypot(cx - fb[0] - fb[2] / 2, cy - fb[1] - fb[3] / 2) / Math.max(fb[2], 1) : Math.hypot(cx / w - 0.5, cy / h - 0.45);
      const sc = n / (1 + off * 3); if (!best || sc > best.sc) best = { id, n, sc };
    }
    const toSrc = (p) => [p[0] / k, p[1] / k];
    if (!best) return fd && fd.eyes ? { eyes: fd.eyes, yaw: 0, found: true, box: fd.box } : null;
    const minX = new Int16Array(h).fill(-1), maxX = new Int16Array(h).fill(-1);
    let x0 = w, x1 = 0, y0 = h, y1 = 0, ys = 0;
    for (let i = 0; i < N; i++) if (lab[i] === best.id) { const x = i % w, y = (i / w) | 0; if (minX[y] < 0 || x < minX[y]) minX[y] = x; if (x > maxX[y]) maxX[y] = x; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); ys += Y[i]; }
    const Wf = Math.max(4, x1 - x0), my = ys / best.n;
    let eyes = fd && fd.eyes ? fd.eyes.map((p) => [p[0] * k, p[1] * k]) : null, found = true;
    if (!eyes) {
      // darkness of what isn't skin inside the face (upper part), blurred to about an eye's size: eyes are its best pair of peaks
      // (thin glasses rims and stray hairs blur away, the pupil + lashes stay)
      const r = Math.max(1, Math.round(Wf / 22)), dm = new Float32Array(N), tmp = new Float32Array(N), blobs = [];
      const ya = Math.round(y0 + 0.05 * Wf), yb = Math.min(h - 1, Math.round(y0 + 0.62 * Wf));
      for (let y = ya; y <= yb; y++) if (minX[y] >= 0) {
        const m = Math.round((maxX[y] - minX[y]) * 0.1); // not the hair gap by the ear / temple
        for (let x = minX[y] + m; x <= maxX[y] - m; x++) { const i = y * w + x; if (lab[i] !== best.id) dm[i] = Math.max(0, my * 0.85 - Y[i]); }
      }
      for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x < w + r; x++) { if (x + r < w) s += dm[y * w + x + r]; if (x - r - 1 >= 0) s -= dm[y * w + x - r - 1]; if (x >= 0 && x < w) tmp[y * w + x] = s; } }
      for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y < h + r; y++) { if (y + r < h) s += tmp[(y + r) * w + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * w + x]; if (y >= 0 && y < h) dm[y * w + x] = s; } }
      let top = 0; for (let i = 0; i < N; i++) top = Math.max(top, dm[i]);
      for (let y = ya; y <= yb; y++) for (let x = 1; x < w - 1; x++) {
        const v = dm[y * w + x]; if (v < top * 0.08) continue;
        let peak = true;
        for (let dy = -r; dy <= r && peak; dy++) for (let dx = -r; dx <= r; dx++) { const yy = y + dy, xx = x + dx; if ((dx || dy) && yy >= 0 && yy < h && xx >= 0 && xx < w && dm[yy * w + xx] > v) { peak = false; break; } }
        if (peak) blobs.push({ x, y, s: v });
      }
      blobs.sort((a, b) => b.s - a.s);
      for (let i = 0; i < blobs.length; i++) for (let j = blobs.length - 1; j > i; j--) if (Math.hypot(blobs[j].x - blobs[i].x, blobs[j].y - blobs[i].y) < r * 1.6) blobs.splice(j, 1); // flat tops
      blobs.length = Math.min(blobs.length, 14);
      if (DEV.faceDbg) DEV.faceBlobs = { blobs: blobs.map((b) => [b.x, b.y, Math.round(b.s)]), Wf, x0, y0, r, top: Math.round(top) };
      let bs = 0;
      for (const a of blobs) for (const b of blobs) {
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx < 0.24 * Wf || dx > 0.72 * Wf || Math.abs(dy) > 0.22 * dx) continue;
        const sc = (Math.min(a.s, b.s) + 0.3 * (a.s + b.s)) * (1 + 1.2 * clamp(((a.y + b.y) / 2 - y0) / Wf, 0, 0.6)); // eyes sit under the brows
        if (sc > bs) { bs = sc; eyes = [[a.x, a.y], [b.x, b.y]]; }
      }
      if (!eyes) { found = false; eyes = [[x0 + 0.3 * Wf, y0 + 0.36 * Wf], [x0 + 0.7 * Wf, y0 + 0.36 * Wf]]; }
    }
    // yaw: where the eyes' midpoint sits across the skin at cheek level
    const ed = Math.hypot(eyes[1][0] - eyes[0][0], eyes[1][1] - eyes[0][1]), mx = (eyes[0][0] + eyes[1][0]) / 2, ry = Math.round((eyes[0][1] + eyes[1][1]) / 2 + 0.35 * ed);
    let lo = 0, hi = 0, n = 0;
    for (let y = ry - 2; y <= ry + 2; y++) if (y >= 0 && y < h && minX[y] >= 0) { lo += minX[y]; hi += maxX[y]; n++; }
    const yaw = found && n && hi > lo + 4 ? clamp(yawFromRatio((mx - lo / n) / ((hi - lo) / n)), -1, 1) : 0;
    if (DEV.faceDbg) { // headless tests: what the segmentation saw
      const im = g.getImageData(0, 0, w, h), q = im.data;
      for (let i = 0; i < N; i++) if (lab[i] === best.id) { q[i * 4 + 1] = Math.min(255, q[i * 4 + 1] + 90); }
      g.putImageData(im, 0, 0); g.fillStyle = '#0ff'; for (const e of eyes) g.fillRect(e[0] - 1.5, e[1] - 1.5, 3, 3);
      g.fillStyle = '#f0f'; g.fillRect(lo / Math.max(n, 1), ry, (hi - lo) / Math.max(n, 1), 1);
      DEV.faceDbg = c.toDataURL();
    }
    return { eyes: eyes.map(toSrc), yaw, found, box: [x0 / k, y0 / k, Wf / k, (y1 - y0) / k] };
  }

  /* ---------------- a little turntable for the face picker (its own tiny renderer, drawing only while open) ---------------- */
  function preview(canvas) {
    let R = null, sc, cam, mesh, mat, geo, photo, base, spin = 0.5, drag = null, raf = 0, last = 0, heavyT = 0, want = null, pend = null, hk = '';
    const fit = { eyes: FACE_EYES_CENTRED, yaw: 0, iw: 300, ih: 364 };
    const init = () => {
      R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      R.setPixelRatio(1); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.15;
      sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xdde8ff, 0x6a5a4a, 0.85 * LIGHT_K));
      const d = new THREE.DirectionalLight(0xfff2e0, 0.95 * LIGHT_K); d.position.set(2, 4, 5); sc.add(d);
      cam = new THREE.PerspectiveCamera(24, canvas.width / canvas.height, 1, 60); cam.position.set(0, 10.5, 12.5); cam.lookAt(0, 9.62, 0);
      photo = photoTex(mkCanvas(2, 2)); base = paintBase([233, 195, 160], [34, 28, 26], HAIR0, 'human');
      geo = buildGeo('human', HAIR0, true); mat = headMat(photo, base, fit);
      mesh = new THREE.Mesh(geo, mat); mesh.position.y = 10; sc.add(mesh); // up high: clear of the ground-contact shading
    };
    // drag to spin it yourself
    canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, s: spin }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } });
    canvas.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) spin = drag.s + (e.clientX - drag.x) * 0.012; });
    const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    const heavy = (w) => { // the picture, the fit, colours, hairline, hair cap: re-read it all
      fit.eyes = w.eyes; fit.yaw = w.yaw; fit.iw = w.src.width; fit.ih = w.src.height;
      const s = sampleFace(w.src, fit), key = JSON.stringify(s.H), pg = photo.image.getContext('2d');
      pg.clearRect(0, 0, 512, 512); pg.drawImage(w.src, 0, 0, 512, 512); if (!w.cut && s.ok) maskPhoto(photo.image, fit, s.skin, s.hair); photo.needsUpdate = true;
      fitM(fit, mat.userData.hd.hdM.value, mat.userData.hd.hdDir.value);
      base.dispose(); base = mat.map = paintBase(s.skin, s.hair, s.H, 'human');
      if (key !== hk) { hk = key; const old = geo; geo = mesh.geometry = buildGeo('human', s.H, true); old.dispose(); }
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      if (want) { pend = want; want = null; }
      if (pend && now - heavyT > 120) { heavyT = now; heavy(pend); pend = null; } // at most ~8× a second while you drag
      if (!drag) spin += dt * 0.8;
      mesh.rotation.y = spin; R.render(sc, cam);
    };
    return {
      set(src, eyes, yaw, cut) { want = { src, eyes, yaw, cut }; }, // cut: a clean cut-out, nothing behind the head to fade
      // the context is made on first open and kept (a lost context can't be re-made on the same canvas); closed = no frames
      start() { if (!R) guard('head3d.preview', init); if (R && !raf) { last = 0; raf = requestAnimationFrame(frame); } },
      stop() { cancelAnimationFrame(raf); raf = 0; drag = null; },
      // tests: hold it at an angle
      at(a) { spin = a; drag = { id: -1, x: 0, s: a }; },
    };
  }

  Hooks.init(function head3dHero() {
    if (typeof Player === 'undefined' || Player._hd3) return;
    const orig = Player.syncVisuals; Player._hd3 = true; Player.face.visible = false;
    Player.syncVisuals = function (dt, rdt) { orig.call(this, dt, rdt); guard('head3d.sync', () => syncHero(this, rdt || 0)); };
  });

  return {
    EX, EZ, HERO, SHAPES, fitM, buildGeo, headMat, photoTex, paintBase, sampleFace, hexRGB, detect, preview, hatParts, glassesParts,
    // the hero's head with whatever hat / glasses are worn; buildHuman parents it at the neck
    heroHead(hat, glasses) { const g = assemble(heroFace(), hat, glasses); g.position.y = HERO.y; g.scale.setScalar(HERO.unit); return g; },
    get hero() { return heroFace(); },
    // the face picture / eyes / yaw changed: drop the old head (the caller rebuilds the human)
    invalidateHero() {
      const h = hero; hero = null;
      if (carHead) { scene.remove(carHead); carHead = null; }
      if (h) { h.geo.dispose(); h.mat.dispose(); h.photo.dispose(); h.base.dispose(); }
    },
    // a drawn cast head texture (HEADS.x) → a 3D head of that character, sized like the old billboard
    forCast(t, size = 2.1) {
      if (t === HEADS.hero || t === TEX.faceEq) return this.heroHead(null, null);
      const g = assemble(castFace(t)); g.scale.setScalar(size * 0.3);
      return g;
    },
    // for the instanced walkers (07a pedGeo): a drop-in for the old 0.4 m box head — the same skull, ~200 tris, vertex colour,
    // sized to that box so the hair / eye / cap boxes still sit right: Head3D.pedSkull(skin) in place of box(0, 1.77, 0, 0.4, 0.42, 0.38, skin)
    pedSkull(skin, y = 1.8) { return gpart(geoFor('human', Object.assign({}, HAIR0, { none: true }), 'ped'), skin, 0, y, 0, 0, 0, 0, 0.2, 0.15, 0.17); },
    syncHero,
  };
})();
