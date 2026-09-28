/* ============================================================
   assets: runtime files beside index.html (assets/runtime/**, mirrored by scripts/build.py together with
   assets/runtime/files.json, the list of what exists). glTF / VRM / VRMA / HDR / KTX2 / images / JSON.
   Loaded in three tiers so the title is up at once and the game starts after a few MB:
     boot   — what buildWorld reads synchronously (512 px texture sets, tree models): awaited before the world is built
     play   — what the first playable view needs (the hero + a few bodies, core animation clips, the sky of the hour):
              fetched while the world builds, awaited before 新游戏 unlocks
     stream — everything else (full-res textures, the other VRMs / clips / skies, street props), fetched in the background
              by priority while you're on the title screen or playing; modules pick each file up when it lands (Assets.on)
   ============================================================ */
// Modules queue what they need while the game script evaluates (top level) and read it in their init / on arrival:
//   Assets.need('hero', 'chars/hero.vrm', { tier: 'play' });   Hooks.init(() => { const vrm = Assets.vrm('hero'); … });
//   Assets.need('pbr/x/hi', 'tex/x/albedo.webp', { tier: 'stream', prio: 20 }); Assets.on('pbr/x/hi', (t) => swapIn(t));
// Later / lazy:  const got = await Assets.load([{ key: 'npc3', url: 'chars/npc3.vrm' }]);  (got.npc3)
// Item options: { tier ('boot' | 'play' | 'stream', default 'play'), prio (lower loads sooner, default 50), type?, srgb? (colour
// texture for PBR / glTF-style materials), max? (images: decode scaled down to at most this many px wide, off the main thread),
// tex? (texture props), keep? (keep the file's bytes so Assets.instance(key) can parse fresh copies), required? (log an error
// when it fails; default: missing files are skipped quietly) }.
// Types by extension: .glb/.gltf → gltf, .vrm → vrm, .vrma → vrma (all three give the loaded glTF; see vrm() / vrma()),
// .hdr → HDR equirect DataTexture, .ktx2 → compressed texture, .png/.jpg/.webp/.avif → texture, .json → object, .bin → ArrayBuffer, .txt → string.
// Images decode off the main thread (createImageBitmap, pre-flipped: texture.flipY = false, userData.flipped = true);
// browsers without it get an <img> texture (flipY = true, userData.flipped = false). Canvas code that reads t.image must honour it.
const TIER = { boot: 0, play: 1, stream: 2 };
// ImageBitmap decode: not on Safari < 17 / Firefox < 98 (the same rule as three's GLTFLoader)
const BITMAP_OK = typeof createImageBitmap === 'function' && !(/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && +((navigator.userAgent.match(/Version\/(\d+)/) || [])[1] || 99) < 17) &&
  !(/Firefox\/(\d+)/.test(navigator.userAgent) && +navigator.userAgent.match(/Firefox\/(\d+)/)[1] < 98);
const Assets = {
  BASE: 'assets/runtime/', files: null, vers: {}, items: Object.create(null), bufs: Object.create(null), failed: Object.create(null),
  reqs: new Map(), _ls: Object.create(null), _wait: [], _run: false, _act: 0, _stream: false, _gateT: 0,
  _gltf: null, _ktx2: null, _pend: Object.create(null),
  stats: { bytes: [0, 0, 0], files: [0, 0, 0], ms: {} },
  need(key, url, opt = {}) {
    const tier = typeof opt.tier === 'number' ? opt.tier : TIER[opt.tier] ?? 1;
    let r = this.reqs.get(key);
    if (r) { // asked again (sooner / more urgently): promote it
      if (tier < r.tier) r.tier = tier;
      if (opt.prio !== undefined) r.prio = Math.min(r.prio, opt.prio);
    } else this.reqs.set(key, r = Object.assign({ prio: 50 }, opt, { key, url, tier, st: 0, got: 0 }));
    this._kick();
    return this;
  },
  // a wanted file, now: to the front of its queue (and out of the background tier)
  bump(key, tier = 1) { const r = this.reqs.get(key); if (r && r.st === 0) { r.tier = Math.min(r.tier, tier); r.prio = -1; this._kick(); } return this; },
  has(key) { return this.items[key] !== undefined; },
  get(key) { return this.items[key]; },
  vrm(key) { const g = this.items[key]; return g && g.userData ? g.userData.vrm || null : null; },
  vrma(key) { const g = this.items[key]; return g && g.userData && g.userData.vrmAnimations ? g.userData.vrmAnimations[0] || null : null; },
  // is it still coming? (queued or loading; false once loaded, failed or never asked for)
  pending(key) { const r = this.reqs.get(key); return !!r && r.st < 2; },
  // fn(result, key) once the file has loaded (now, if it already has); never called for a file that fails
  on(key, fn) {
    if (this.items[key] !== undefined) guard('assets.on ' + key, () => fn(this.items[key], key));
    else (this._ls[key] || (this._ls[key] = [])).push(fn);
    return this;
  },
  // resolves when every file of this tier and the ones before it has loaded or failed
  tier(name) { const t = TIER[name] ?? name; return this._done(t) ? Promise.resolve() : new Promise((r) => this._wait.push([t, r])); },
  _done(t) { for (const r of this.reqs.values()) if (r.tier <= t && r.st < 2) return false; return true; },
  // nothing queued or loading any more (the background stream has finished)
  idle() { for (const r of this.reqs.values()) if (r.st < 2) return false; return true; },
  // loaded share of the tiers up to t, by bytes (files.json sizes)
  progress(t = 1) {
    let n = 0, d = 0;
    for (const r of this.reqs.values()) if (r.tier <= t) { const s = this.size(r); n += s; d += r.st >= 2 ? s : Math.min(r.got, s); }
    return n ? d / n : 1;
  },
  size(r) { return (this.files && this.files[r.url]) || 60000; },
  // does the build ship this file? (relative to BASE; true while the list is unknown)
  exists(url) { return !this.files || !!this.files[url]; },
  list(prefix = '') { return this.files ? Object.keys(this.files).filter((f) => f.startsWith(prefix)) : []; },
  // the served URL of a runtime file (cache-busted), for code that fetches it itself
  url(path) { return this.BASE + path + (this.vers[path] ? '?v=' + this.vers[path] : ''); },
  type(url) {
    const e = (url.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    return { glb: 'gltf', gltf: 'gltf', vrm: 'vrm', vrma: 'vrma', hdr: 'hdr', ktx2: 'ktx2', png: 'tex', jpg: 'tex', jpeg: 'tex', webp: 'tex', avif: 'tex', json: 'json', bin: 'bin', txt: 'text' }[e.toLowerCase()] || 'bin';
  },
  // the file list: inlined in index.html by build.py (ASSET_FILES), else fetched
  async manifest() {
    if (this.files) return this.files;
    let j = typeof ASSET_FILES !== 'undefined' ? ASSET_FILES : null;
    if (!j) try { const r = await fetch(this.BASE + 'files.json', { cache: 'no-cache' }); j = r.ok ? await r.json() : {}; } catch (e) { j = {}; }
    this.files = j.files || {}; this.vers = j.v || {};
    return this.files;
  },
  // start fetching: boot + play right away; stream once released (Assets.stream())
  start() { if (this._run) return this; this._run = true; this.stats.t0 = performance.now(); this.manifest().then(() => this._kick()); return this; },
  stream() { this._stream = true; this._kick(); return this; },
  // the scheduler: 6 at a time for the tiers the start waits on, 3 for the background (so a bumped file isn't stuck behind it)
  _kick() {
    if (!this._run || !this.files) return;
    const q = []; for (const r of this.reqs.values()) if (r.st === 0) q.push(r);
    if (!q.length) return this._settle();
    q.sort((a, b) => a.tier - b.tier || a.prio - b.prio);
    for (const r of q) {
      if (r.tier >= 2 && (!this._stream || this._act >= 3)) break;
      if (this._act >= 6) break;
      this._fire(r);
    }
  },
  _fire(r) {
    if (!/^(https?:|\/|\.\.?\/|data:|blob:)/.test(r.url) && !this.exists(r.url)) { if (r.required) console.error('[assets] missing ' + r.url); this.failed[r.key] = 'missing'; r.st = 3; return this._settle(); }
    r.st = 1; this._act++;
    const t0 = performance.now();
    this._pend[r.key] = this._one(r, (l, t) => { r.got = t ? this.size(r) * Math.min(1, l / t) : l; })
      .then((v) => { this.items[r.key] = v; r.st = 2; this.stats.bytes[r.tier] += this.size(r); this.stats.files[r.tier]++; this.stats.ms[r.key] = Math.round(performance.now() - t0); const L = this._ls[r.key]; delete this._ls[r.key]; if (L) for (const fn of L) guard('assets.on ' + r.key, () => fn(v, r.key)); })
      .catch((e) => {
        // a stalled download gets one more go (a busy service worker / network hiccup), then counts as missing like a 404
        if (e && e.stalled && !r.retried) { r.retried = true; r.st = 0; r.got = 0; return; }
        r.st = 3; this.failed[r.key] = String(e && e.message || e); (r.required ? console.error : console.warn)('[assets] ' + r.url + ': ' + this.failed[r.key]);
      })
      .finally(() => { this._act--; delete this._pend[r.key]; this._settle(); this._kick(); });
  },
  _settle() {
    if (!this._kept && this._stream && this.idle()) { this._kept = true; guard('sw.keep', () => this.keepCache()); }
    if (!this._wait.length) return;
    this._wait = this._wait.filter(([t, res]) => { if (!this._done(t)) return true; res(); return false; });
  },
  // everything is in: tell the service worker which versioned files this build uses (older copies get dropped from its cache)
  keepCache() {
    const sw = navigator.serviceWorker; if (!sw || !sw.controller) return;
    const keep = Object.keys(this.files || {}).map((f) => new URL(this.url(f), location.href).href);
    for (const s of document.scripts) if (s.src) keep.push(s.src);
    sw.controller.postMessage({ keep });
  },
  // background files take turns on the main thread: one parse per ~frame, so a VRM landing mid-game is one short stall at most
  async gate(r) {
    if (r.tier < 2 || typeof G === 'undefined' || !G.started) return;
    while (performance.now() - this._gateT < 30) await new Promise((res) => requestAnimationFrame(res));
    this._gateT = performance.now();
  },
  // one GLTFLoader for everything: KTX2 textures, meshopt / draco geometry, VRM 0.x / 1.0 and VRMA animations
  gltfLoader() {
    if (this._gltf) return this._gltf;
    const L = new THREE.GLTFLoader();
    if (renderer) { this._ktx2 = new THREE.KTX2Loader().setTranscoderPath('libs/basis/').detectSupport(renderer); L.setKTX2Loader(this._ktx2); }
    L.setMeshoptDecoder(THREE.MeshoptDecoder);
    L.setDRACOLoader(new THREE.DRACOLoader().setDecoderPath('libs/draco/'));
    L.register((p) => new THREE.VRMLoaderPlugin(p));
    L.register((p) => new THREE.VRMAnimationLoaderPlugin(p));
    return (this._gltf = L);
  },
  // no byte for this long and a download counts as failed (a request that never finishes must not hang the title): the same
  // fallbacks as a 404 take over. Start tiers / background stream, ms
  STALL: [25000, 25000, 60000],
  // bytes with progress (the bar moves while a big avatar streams in); stall: abort after that many ms without a byte (a timer
  // that fires seconds late means the page itself was too busy to tell: it waits again)
  async fetchBuf(url, prog, stall = 0) {
    const ac = stall && typeof AbortController === 'function' ? new AbortController() : null;
    let tm = 0; const arm = () => { if (!ac) return; clearTimeout(tm); const due = performance.now() + stall; tm = setTimeout(() => { if (performance.now() - due > 2000) arm(); else ac.abort(); }, stall); };
    try {
      arm();
      const r = await fetch(url, ac ? { signal: ac.signal } : undefined);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      const total = +r.headers.get('content-length') || 0;
      if (!r.body || !r.body.getReader || !prog) { const b = await r.arrayBuffer(); if (prog) prog(b.byteLength, b.byteLength); return b; }
      const rd = r.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; arm(); parts.push(value); got += value.length; prog(got, total); }
      const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      return out.buffer;
    } catch (e) { if (ac && ac.signal.aborted) throw Object.assign(new Error('stalled ' + Math.round(stall / 1000) + ' s: ' + url), { stalled: true }); throw e; } finally { clearTimeout(tm); }
  },
  // loaders that can't be aborted (<img> fallback, KTX2): give up waiting after ms (the request itself runs on)
  deadline(p, ms, url) { return !ms ? p : Promise.race([p, new Promise((res, rej) => setTimeout(() => rej(Object.assign(new Error('timed out ' + Math.round(ms / 1000) + ' s: ' + url), { stalled: true })), ms))]); },
  async parseGltf(buf, url) {
    const g = await this.gltfLoader().parseAsync(buf, url.slice(0, url.lastIndexOf('/') + 1));
    if (g.scene && typeof Render !== 'undefined') Render.prepModel(g.scene);
    // the parser holds the whole file (GLB body, JSON, bufferView / texture caches) and nothing reads it once the scene, the
    // VRM (userData.vrm) and the clips exist: let it go (~40 MB of the heap once every model has streamed in)
    g.parser = null;
    return g;
  },
  // a fresh, independent copy of a glTF / VRM loaded with keep: true (one VRM instance per character)
  async instance(key) {
    const it = this.bufs[key]; if (!it) return null;
    return this.parseGltf(it.buf.slice(0), it.url);
  },
  // width × height from a WebP / PNG header (to scale big images down while decoding), or null
  imgSize(u8) {
    const s = (a, n) => String.fromCharCode(...u8.subarray(a, a + n));
    if (u8.length > 30 && s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') {
      const c = s(12, 4);
      if (c === 'VP8X') return [1 + (u8[24] | u8[25] << 8 | u8[26] << 16), 1 + (u8[27] | u8[28] << 8 | u8[29] << 16)];
      if (c === 'VP8L') { const b = u8[21] | u8[22] << 8 | u8[23] << 16 | u8[24] << 24; return [1 + (b & 0x3fff), 1 + ((b >>> 14) & 0x3fff)]; }
      if (c === 'VP8 ') return [(u8[26] | u8[27] << 8) & 0x3fff, (u8[28] | u8[29] << 8) & 0x3fff];
    }
    if (u8.length > 24 && u8[0] === 0x89 && s(1, 3) === 'PNG') { const v = new DataView(u8.buffer, u8.byteOffset); return [v.getUint32(16), v.getUint32(20)]; }
    return null;
  },
  // an image file → texture, decoded (and scaled to it.max) off the main thread
  async image(it, url, prog) {
    if (!BITMAP_OK) {
      const t = await this.deadline(new THREE.TextureLoader().loadAsync(url, (e) => prog(e.loaded, e.total)), this.STALL[it.tier] * 2, url);
      t.userData.flipped = false; return t;
    }
    const buf = await this.fetchBuf(url, prog, this.STALL[it.tier]), u8 = new Uint8Array(buf), wh = it.max ? this.imgSize(u8) : null;
    const o = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    if (wh && wh[0] > it.max) { o.resizeWidth = it.max; o.resizeHeight = Math.max(1, Math.round(wh[1] * it.max / wh[0])); o.resizeQuality = 'high'; }
    const type = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', avif: 'image/avif' }[(url.split('?')[0].match(/\.(\w+)$/) || [])[1]] || '';
    const bm = await createImageBitmap(new Blob([buf], { type }), o);
    const t = new THREE.Texture(bm); t.flipY = false; t.userData.flipped = true; t.needsUpdate = true;
    return t;
  },
  async _one(it, prog) {
    const url = /^(https?:|\/|\.\.?\/|data:|blob:)/.test(it.url) ? it.url : this.url(it.url), type = it.type || this.type(it.url), st = this.STALL[it.tier] || 0;
    if (type === 'gltf' || type === 'vrm' || type === 'vrma') {
      const buf = await this.fetchBuf(url, prog, st);
      if (it.keep) this.bufs[it.key] = { buf: buf.slice(0), url };
      await this.gate(it);
      return this.parseGltf(buf, url);
    }
    if (type === 'json') return JSON.parse(new TextDecoder().decode(await this.fetchBuf(url, prog, st)));
    if (type === 'text') return new TextDecoder().decode(await this.fetchBuf(url, prog, st));
    if (type === 'bin') return this.fetchBuf(url, prog, st);
    if (type === 'hdr') {
      const buf = await this.fetchBuf(url, prog, st); await this.gate(it);
      const L = new THREE.HDRLoader().setDataType(THREE.HalfFloatType), d = L.parse(buf), t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
      t.flipY = true; t.mapping = THREE.EquirectangularReflectionMapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.LinearSRGBColorSpace; t.needsUpdate = true;
      // the half-float pixels only matter until they're on the GPU (the sky reads them once, before it first draws the texture)
      t.onUpdate = () => { t.image.data = null; t.onUpdate = null; };
      return t;
    }
    if (type === 'ktx2') { this.gltfLoader(); const t = await this.deadline(this._ktx2.loadAsync(url, (e) => prog(e.loaded, e.total)), st * 2, url); if (it.srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
    // images: game textures stay NoColorSpace (the shaders decode sRGB once, 03_render.js); srgb: true for glTF-style PBR use
    const t = await this.image(it, url, prog);
    if (it.srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = MAX_ANISO; if (it.tex) Object.assign(t, it.tex);
    return t;
  },
  // load a list now (queued at the front of the play tier); resolves to { key: result } (skipped / failed keys are undefined)
  async load(list, onProgress) {
    this.start();
    for (const it of list) { const { key, url, ...o } = it; this.need(key, url, Object.assign({ tier: 'play', prio: -1 }, o)); this.bump(key); }
    await new Promise((res) => {
      const tick = () => {
        let n = 0, d = 0, left = 0; for (const it of list) { const r = this.reqs.get(it.key), s = this.size(r); n += s; d += r.st >= 2 ? s : r.got; if (r.st < 2) left++; }
        if (onProgress) onProgress(n ? Math.min(1, d / n) : 1, d, n);
        if (!left) res(); else setTimeout(tick, 50);
      };
      tick();
    });
    const out = {}; for (const it of list) out[it.key] = this.items[it.key];
    return out;
  },
};

/* ---------------- main-thread work in small slices: streamed assets are swapped in a few ms per frame ---------------- */
// Jobs.add(fn): runs in a later animation frame, ≤ 5 ms of jobs per frame while playing (16 on the title screen), at least one
const Jobs = {
  q: [], _on: false,
  add(fn) { this.q.push(fn); if (!this._on) { this._on = true; requestAnimationFrame(() => this.run()); } },
  run() {
    const t = performance.now(), B = typeof G !== 'undefined' && G.started ? 5 : 16;
    do guard('job', this.q.shift()); while (this.q.length && performance.now() - t < B);
    if (this.q.length) requestAnimationFrame(() => this.run()); else this._on = false;
  },
};

/* ---------------- boot progress: marks for the load-time benchmark + the title screen's bar / button ---------------- */
// Boot.mark('world') → performance mark 'gta:world' (scripts/dev/loadtime.mjs reads them); Boot.ui(frac, text) moves the bar,
// and the 新游戏 button shows '加载中 xx%' until Boot.ready()
const Boot = {
  t: {}, frac: 0, tipT: 0,
  mark(k) { this.t[k] = Math.round(performance.now()); try { performance.mark('gta:' + k); } catch (e) { /* old browsers */ } },
  ui(frac, text) {
    if (this.fin) return;
    const bar = document.getElementById('boot-bar'), fill = document.getElementById('boot-fill'), msg = document.getElementById('boot-msg'), bn = document.getElementById('t-new');
    this.frac = Math.max(this.frac, clamp(frac, 0, 1));
    if (bar) bar.hidden = false;
    if (fill) fill.style.width = (this.frac * 100).toFixed(1) + '%';
    if (bn && bn.disabled) bn.textContent = '加载中 ' + Math.floor(this.frac * 100) + '%';
    if (msg && text !== undefined) msg.textContent = text;
  },
  // a Beijing tip under the bar while it fills (they rotate)
  tip() {
    const el = document.getElementById('boot-tip'); if (!el || typeof TIPS === 'undefined') return;
    const now = performance.now(); if (now - this.tipT < 5200 && el.textContent) return; this.tipT = now;
    el.textContent = '小贴士 · ' + pick(TIPS); el.hidden = false;
  },
  // a progress tick inside a long synchronous build: bar forward, one macrotask so the page can paint it
  step(frac) { this.ui(frac); return new Promise((r) => setTimeout(r, 0)); },
  done() { this.fin = true; const bar = document.getElementById('boot-bar'), tip = document.getElementById('boot-tip'); if (bar) bar.hidden = true; if (tip) tip.hidden = true; },
};
