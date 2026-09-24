/* ============================================================
   Grand Token Auto: 四九城 · 侠影之谜
   core: utils, constants, renderer, input, audio, storage
   ============================================================ */
'use strict';
const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const angDiff = (a, b) => wrapA(b - a);
const dampA = (a, b, k, dt) => a + angDiff(a, b) * (1 - Math.exp(-k * dt));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);
const hyp = Math.hypot;
const perSec = (rate, dt) => Math.floor(rate * dt + Math.random());
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
function weighted(opts) {
  let s = 0; for (const o of opts) s += o[1];
  let r = Math.random() * s;
  for (const o of opts) { r -= o[1]; if (r <= 0) return o[0]; }
  return opts.length ? opts[opts.length - 1][0] : null;
}
const fmtTok = (n) => { n = Math.max(0, Math.round(n)); return n >= 995000 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(n / 1000) + 'K'; };
const fmtMoney = (n) => '¥' + Math.max(0, Math.round(n)).toLocaleString('en-US');
const fmtMoneySA = (n) => '¥' + String(Math.max(0, Math.min(99999999, Math.round(n)))).padStart(8, '0');

const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const LOWQ = IS_TOUCH || Math.min(screen.width, screen.height) < 600;

// ---- city layout: 老北京 on a 10 x 10 grid. roads 1 and 9 are the 二环 (the old city wall line),
// the 8 x 8 blocks inside are the old city, the ring of blocks outside is 海淀 / 朝阳 / 丰台 ----
const NB = 10, BLK = 44, RW = 14, PITCH = BLK + RW, HALF = (NB * PITCH) / 2;
const CITY = HALF + RW / 2;
const BOUND = CITY + 10;          // all four sides end at a wall
const SHORE = BOUND;              // (no sea in Beijing — kept as the south limit)
const RING_LO = 1, RING_HI = NB - 1;
const LANE = 3.3;
const CAP = 1000000;              // tokens needed to transform
const roadC = (i) => -HALF + i * PITCH;
const UP = new V3(0, 1, 0);

// ---- renderer ----
const canvasEl = document.getElementById('gta-canvas');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: LOWQ, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWQ ? 1.5 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
} catch (e) { renderer = null; }
const MAX_ANISO = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 1, 1100);

// ---- input ----
const Input = { down: Object.create(null), hit: Object.create(null), joy: { x: 0, y: 0, on: false }, typed: '', lock: false, click: false };
let onTyped = null;
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyJ', 'KeyK', 'KeyL', 'KeyF', 'KeyT', 'KeyE', 'KeyQ', 'KeyR', 'ShiftLeft', 'ShiftRight', 'KeyM', 'KeyP', 'Escape', 'KeyH', 'Enter', 'Tab', 'KeyC', 'KeyV']);
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.code) && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) e.preventDefault();
  if (e.repeat) return;
  Input.down[e.code] = true; Input.hit[e.code] = true;
  if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
    Input.typed = (Input.typed + e.key.toUpperCase()).slice(-12);
    if (onTyped) onTyped(Input.typed);
  }
}, { passive: false });
window.addEventListener('keyup', (e) => { Input.down[e.code] = false; });
window.addEventListener('blur', () => { for (const k in Input.down) Input.down[k] = false; });
// gameplay queries respect Input.lock (cutscenes, menus); raw ones don't
const kd = (...c) => !Input.lock && c.some((k) => Input.down[k]);
const kp = (...c) => !Input.lock && c.some((k) => Input.hit[k]);
const kpRaw = (...c) => c.some((k) => Input.hit[k]);

// ---- storage (per-viewer convenience; never required) ----
const Store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

/* ============================================================
   Audio — all synthesized with WebAudio, no samples
   ============================================================ */
const Sfx = (() => {
  let ctx = null, master, bus, mus, nbuf, muted = false;
  let engine = null, siren = null, beam = null, hum = null;
  const M = { bpm: 108, step: 0, next: 0, timer: 0, mode: 'city' };
  const MODES = {
    city: { bpm: 108, roots: [110, 87.31, 130.81, 98], kick: 1, hat: 1, bass: 1, lead: 0, pad: 1 },
    mech: { bpm: 124, roots: [110, 87.31, 130.81, 98], kick: 2, hat: 2, bass: 1, lead: 1, pad: 0 },
    night: { bpm: 92, roots: [73.42, 110, 116.54, 130.81], kick: 1, hat: 1, bass: 1, lead: 0, pad: 2 },
    boss: { bpm: 142, roots: [82.41, 65.41, 73.42, 61.74], kick: 2, hat: 2, bass: 2, lead: 2, pad: 0 },
    sad: { bpm: 70, roots: [110, 82.41, 87.31, 65.41], kick: 0, hat: 0, bass: 0, lead: 0, pad: 2 },
    cut: { bpm: 84, roots: [110, 87.31, 130.81, 98], kick: 0, hat: 0, bass: 1, lead: 0, pad: 2 },
    off: { bpm: 100, roots: [110], kick: 0, hat: 0, bass: 0, lead: 0, pad: 0 },
  };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(master);
    mus = ctx.createGain(); mus.gain.value = 0.24; mus.connect(master);
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engine = voice('sawtooth', 50, 'lowpass', 380);
    beam = voice('sawtooth', 92, 'bandpass', 900);
    hum = voice('triangle', 55, 'lowpass', 300);
    siren = sirenVoice();
    M.next = ctx.currentTime + 0.2;
    M.timer = setInterval(schedule, 30);
  }
  function voice(type, f, ftype, ff) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = type; o2.frequency.value = f * 1.012;
    const fl = ctx.createBiquadFilter(); fl.type = ftype; fl.frequency.value = ff; fl.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(bus); o.start(); o2.start();
    return { o, o2, fl, g };
  }
  function sirenVoice() {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 780;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.7;
    const lg = ctx.createGain(); lg.gain.value = 150; lfo.connect(lg); lg.connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(bus); o.start(); lfo.start();
    return { o, g };
  }
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(f, d, type = 'square', vol = 0.12, f2 = 0, delay = 0) {
    if (!ctx || muted) return;
    const t = now() + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    env(g, t, 0.004, vol, d);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 0.06);
  }
  function noise(d, vol = 0.2, ff = 1200, type = 'lowpass', ff2 = 0, delay = 0, q = 0.8) {
    if (!ctx || muted) return;
    const t = now() + delay;
    const s = ctx.createBufferSource(); s.buffer = nbuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(ff, t); fl.Q.value = q;
    if (ff2) fl.frequency.exponentialRampToValueAtTime(ff2, t + d);
    const g = ctx.createGain(); env(g, t, 0.003, vol, d);
    s.connect(fl); fl.connect(g); g.connect(bus);
    s.start(t, Math.random() * 1.2); s.stop(t + d + 0.06);
  }

  // ---- music sequencer with moods ----
  function schedule() {
    if (!ctx) return;
    if (muted || ctx.state !== 'running') { M.next = ctx.currentTime + 0.1; return; }
    const mo = MODES[M.mode] || MODES.city;
    const spb = 60 / mo.bpm / 4;
    while (M.next < ctx.currentTime + 0.15) { playStep(mo, M.step, M.next, spb); M.next += spb; M.step = (M.step + 1) % 64; }
  }
  function mOsc(type, f, t, d, vol, ff = 0, a = 0.008) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    let node = o;
    if (ff) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = ff; o.connect(fl); node = fl; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    node.connect(g); g.connect(mus); o.start(t); o.stop(t + d + 0.05);
  }
  function mNoise(t, d, vol, ff, type) {
    const s = ctx.createBufferSource(); s.buffer = nbuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = ff;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(mus); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }
  function playStep(mo, s, t, spb) {
    const bar = (s >> 4) % mo.roots.length, st = s & 15, r = mo.roots[bar];
    if (mo.kick && st % 4 === 0 && (mo.kick > 1 || st % 8 === 0)) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(mus); o.start(t); o.stop(t + 0.22);
    }
    if (mo.kick && (st === 4 || st === 12)) mNoise(t, 0.16, 0.45, 1800, 'bandpass');
    if (mo.hat && (st % 2 === 0 || mo.hat > 1)) mNoise(t, 0.04, st % 4 === 2 ? 0.2 : 0.09, 7000, 'highpass');
    const bp = mo.bass > 1 ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1] : [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1];
    if (mo.bass && bp[st]) mOsc('sawtooth', r * (st === 13 || st === 15 ? 2 : 1), t, spb * 1.7, 0.22, 520);
    if (mo.lead && st % 2 === 0) {
      const arp = mo.lead > 1 ? [1, 1.19, 1.5, 2, 1.5, 1.19, 2, 2.38] : [1, 1.5, 2, 2.52, 3, 2.52, 2, 1.5];
      mOsc('square', r * 2 * arp[(st >> 1) & 7], t, spb * 1.6, 0.065, 2600);
    }
    if (mo.pad === 1 && (st === 0 || st === 10)) mOsc('triangle', r * 4 * (st ? 1.5 : 1.26), t, spb * 5, 0.05);
    if (mo.pad === 2 && st === 0) { for (const k of [2, 2.38, 3]) mOsc('triangle', r * k, t, spb * 15, 0.045, 0, 0.4); }
  }

  function setLoop(v, gain, freq, ff) {
    if (!ctx || !v) return;
    const t = now();
    v.g.gain.setTargetAtTime(muted ? 0 : gain, t, 0.06);
    if (freq) { v.o.frequency.setTargetAtTime(freq, t, 0.08); if (v.o2) v.o2.frequency.setTargetAtTime(freq * 1.012, t, 0.08); }
    if (ff && v.fl) v.fl.frequency.setTargetAtTime(ff, t, 0.08);
  }

  return {
    init,
    get ready() { return !!ctx; },
    get muted() { return muted; },
    toggleMute() { muted = !muted; if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, now(), 0.05); return muted; },
    mood(m) { if (MODES[m]) M.mode = m; },
    get moodName() { return M.mode; },
    engine(on, s01) { setLoop(engine, on ? 0.035 + s01 * 0.05 : 0, 42 + s01 * 95, 260 + s01 * 1300); },
    siren(vol) { setLoop(siren, vol * 0.05); },
    beam(on) { setLoop(beam, on ? 0.09 : 0, on ? 96 + Math.random() * 10 : 92, on ? 1400 : 900); },
    hum(vol) { setLoop(hum, vol * 0.08, 55, 300); },
    coin(n = 1) { const m = Math.pow(1.059, Math.min(n - 1, 14)); tone(988 * m, 0.06, 'square', 0.06); tone(1319 * m, 0.16, 'square', 0.06, 0, 0.06); },
    bigCoin() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.06, 0, i * 0.06)); },
    cash(n = 1) { const m = Math.pow(1.04, Math.min(n - 1, 12)); tone(1568 * m, 0.05, 'triangle', 0.06); tone(2349 * m, 0.12, 'triangle', 0.05, 0, 0.04); },
    ingot() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, i * 0.05)); noise(0.3, 0.08, 6000, 'highpass', 0, 0.1); },
    coinBurst() { for (let i = 0; i < 5; i++) tone(1400 + Math.random() * 900, 0.05, 'triangle', 0.04, 0, i * 0.03); },
    ouch() { tone(420, 0.1, 'square', 0.06, 260); tone(300, 0.14, 'triangle', 0.05, 180, 0.08); },
    laugh() { for (let i = 0; i < 9; i++) noise(0.09, 0.07, 700 + Math.random() * 600, 'bandpass', 0, i * 0.11 + Math.random() * 0.04, 3); },
    applause() { for (let i = 0; i < 40; i++) noise(0.02, 0.05, 2500 + Math.random() * 2500, 'bandpass', 0, Math.random() * 1.6, 1.2); },
    clunk(k = 0) { tone(140 + k * 18, 0.1, 'square', 0.1, 70); noise(0.06, 0.28, 2600 + k * 200, 'bandpass', 0, 0, 2); },
    servo(d = 0.5) { tone(220, d, 'sawtooth', 0.04, 520); tone(330, d, 'sawtooth', 0.03, 760); },
    charge() { tone(120, 0.7, 'sawtooth', 0.08, 900); tone(180, 0.7, 'triangle', 0.06, 1400, 0.05); noise(0.7, 0.08, 800, 'bandpass', 4000); },
    punch() { tone(170, 0.12, 'sine', 0.5, 52); noise(0.08, 0.25, 1100); },
    kick() { tone(130, 0.2, 'sine', 0.6, 40); noise(0.14, 0.3, 800, 'lowpass', 180); },
    whoosh() { noise(0.18, 0.1, 700, 'bandpass', 2600, 0, 1.4); },
    smallHit() { tone(240, 0.07, 'square', 0.08, 120); noise(0.05, 0.1, 2500, 'bandpass'); },
    thud() { tone(90, 0.22, 'sine', 0.45, 38); noise(0.2, 0.18, 500, 'lowpass', 120); },
    clang() { tone(620, 0.25, 'square', 0.06, 380); tone(1240, 0.2, 'triangle', 0.05, 900); noise(0.12, 0.12, 3000, 'bandpass'); },
    crash(v = 10) { const k = clamp(v / 25, 0.3, 1); noise(0.35, 0.4 * k, 2200, 'lowpass', 300); tone(110, 0.25, 'square', 0.12 * k, 50); },
    glass() { noise(0.4, 0.14, 5000, 'highpass'); for (let i = 0; i < 4; i++) tone(2400 + Math.random() * 1800, 0.08, 'sine', 0.025, 0, i * 0.05); },
    boom(big = false) { noise(big ? 2.0 : 1.1, big ? 0.9 : 0.65, 1600, 'lowpass', 70); tone(80, big ? 1.4 : 0.8, 'sine', 0.8, 26); },
    crumble() { for (let i = 0; i < 7; i++) noise(0.5, 0.35, 900 - i * 80, 'lowpass', 90, i * 0.28); },
    transform() {
      tone(160, 0.9, 'sawtooth', 0.09, 880); tone(240, 0.9, 'sawtooth', 0.07, 1320, 0.05);
      for (let i = 0; i < 10; i++) noise(0.035, 0.28, 3500, 'highpass', 0, 0.7 + i * 0.075);
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.5, 'square', 0.07, 0, 1.55 + i * 0.07));
      tone(60, 1.0, 'sine', 0.7, 30, 1.7);
    },
    // the long transformation: charge riser → shatter → (clunks come from each part) → fanfare
    transform2() {
      tone(80, 1.0, 'sawtooth', 0.07, 640); tone(120, 1.0, 'sawtooth', 0.05, 960, 0.03); noise(1.0, 0.1, 600, 'bandpass', 5200, 0, 2);
      noise(0.5, 0.3, 4500, 'highpass', 0, 1.0); for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 2000, 0.1, 'sine', 0.03, 0, 1.0 + i * 0.04);
      tone(55, 0.6, 'sine', 0.5, 30, 1.0);
      [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.55, 'square', 0.06, 0, 2.75 + i * 0.06));
    },
    mech() { for (let i = 0; i < 7; i++) noise(0.03, 0.25, 3200 + Math.random() * 2000, 'highpass', 0, i * 0.075); tone(300, 0.4, 'sawtooth', 0.05, 600); },
    powerDown() { tone(700, 0.9, 'sawtooth', 0.08, 90); noise(0.5, 0.2, 2000, 'lowpass', 200); },
    hurt() { tone(320, 0.14, 'square', 0.09, 130); },
    denied() { tone(200, 0.12, 'square', 0.08); tone(150, 0.18, 'square', 0.08, 0, 0.12); },
    pop() { tone(600, 0.12, 'sine', 0.2, 1400); noise(0.08, 0.12, 3000, 'bandpass'); },
    horn(big = false) { if (big) { tone(98, 0.6, 'sawtooth', 0.14); tone(123, 0.6, 'sawtooth', 0.12); } else { tone(415, 0.32, 'square', 0.07); tone(523, 0.32, 'square', 0.06); } },
    door() { noise(0.06, 0.2, 1500, 'lowpass'); tone(180, 0.08, 'square', 0.06, 0, 0.05); },
    jump() { tone(300, 0.18, 'square', 0.06, 620); },
    jumpHeavy() { tone(90, 0.4, 'sawtooth', 0.12, 240); noise(0.3, 0.15, 800, 'bandpass', 2400); },
    step() { tone(70, 0.12, 'sine', 0.35, 40); noise(0.06, 0.08, 400); },
    letter() { noise(0.12, 0.1, 4000, 'bandpass', 1500); tone(900, 0.06, 'triangle', 0.05); },
    alert() { tone(880, 0.12, 'square', 0.07); tone(660, 0.18, 'square', 0.07, 0, 0.13); },
    passed() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i > 3 ? 0.35 : 0.14, 'square', 0.08, 0, i * 0.11)); tone(262, 0.9, 'triangle', 0.12, 0, 0.3); },
    failed() { [440, 415, 392, 330].forEach((f, i) => tone(f, 0.4, 'square', 0.08, 0, i * 0.22)); },
    wasted() { [392, 370, 349, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.18, 0, i * 0.34)); noise(1.4, 0.2, 400, 'lowpass', 80); },
    cheat() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 0, i * 0.05)); },
    blip(p = 1) { tone(520 * p + Math.random() * 40, 0.035, 'square', 0.025); },
    phone() { for (let i = 0; i < 2; i++) { tone(1250, 0.35, 'square', 0.05, 0, i * 0.5); tone(1560, 0.35, 'square', 0.04, 0, i * 0.5); } },
    levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'square', 0.08, 0, i * 0.07)); tone(131, 1.0, 'triangle', 0.14, 0, 0.1); },
    buy() { tone(1568, 0.08, 'square', 0.06); tone(2093, 0.25, 'square', 0.06, 0, 0.08); noise(0.1, 0.1, 5000, 'highpass', 0, 0.02); },
    click() { tone(900, 0.03, 'square', 0.04); },
    stat() { tone(880, 0.1, 'triangle', 0.08); tone(1175, 0.2, 'triangle', 0.08, 0, 0.1); },
    fire() { noise(0.4, 0.12, 900, 'bandpass', 400); },
    ult() { tone(110, 1.2, 'sawtooth', 0.1, 880); noise(0.8, 0.3, 400, 'bandpass', 5000); [659, 880, 1047].forEach((f, i) => tone(f, 0.4, 'square', 0.07, 0, 0.5 + i * 0.08)); },
    gas() { noise(0.7, 0.18, 2500, 'highpass', 600); },
    zap() { tone(1400, 0.18, 'sawtooth', 0.06, 200); noise(0.12, 0.12, 6000, 'highpass'); },
  };
})();
