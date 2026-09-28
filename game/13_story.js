/* ============================================================
   story: cutscene engine, phone calls, NPC talk, SA-style
   mission markers, and the plot —
   《侠影之谜》: Klaude Code trains you, betrays you,
   Kodex hands you a batch of tokens, you take Klaude down.
   ============================================================ */
const Cutscene = {
  active: false, steps: null, i: 0, waitT: 0, line: null, shot: null, onEnd: null, skipping: false, opts: null,
  play(steps, onEnd, opts = {}) {
    this.active = true; this.steps = steps; this.i = 0; this.onEnd = onEnd; this.shot = null; this._back = null; this.line = null; this.waitT = 0; this.opts = opts;
    Input.lock = true; Player.stopBeam(); Player.atk = null;
    if (opts.letterbox !== false) { UI.letterbox(true); $('subtitle').classList.remove('show'); UI.subT = 0; }
    UI.hudDim(true);
    this.next();
  },
  next() {
    this.line = null; UI.dialog(null);
    if (this._back) { this.shot = this._back === 'none' ? null : this._back; this._back = null; } // (a line's close-up hands back to the scene's shot)
    while (this.active && this.i < this.steps.length) {
      const s = this.steps[this.i++];
      if (!s) continue;
      if (s.do) s.do(this.skipping);
      if (s.shot && this.opts.camera !== false) this.setShot(s.shot);
      if (s.say !== undefined) { if (this.skipping) continue; this.showLine(s); return; }
      if (s.wait) { if (this.skipping) continue; this.waitT = s.wait; return; }
      if (s.fade !== undefined) { if (this.skipping) { UI.fade(s.fade, 0.01); continue; } UI.fade(s.fade, s.dur ?? 0.6); this.waitT = (s.dur ?? 0.6) + 0.05; return; }
      if (s.title) { if (this.skipping) continue; UI.chapter(s.title, s.sub); this.waitT = s.dur ?? 3; return; }
    }
    if (this.active) this.finish();
  },
  setShot(sh) {
    this._back = null;
    let [pos, look] = sh.raw ? [sh.pos, sh.look] : fitShot(sh.pos, sh.look), [to, lookTo] = sh.raw ? [sh.to, sh.lookTo] : fitShot(sh.to || sh.pos, sh.lookTo || sh.look);
    if (!sh.to) to = null; if (!sh.lookTo) lookTo = null;
    const p0 = pos ? new V3(...pos) : camera.position.clone();
    const l0 = look ? new V3(...look) : (this.shot ? this.shot.l1.clone() : new V3(Player.pos.x, 1, Player.pos.z));
    this.shot = { p0, l0, p1: to ? new V3(...to) : p0.clone(), l1: lookTo ? new V3(...lookTo) : l0.clone(), t: 0, dur: sh.dur || 4 };
  },
  // a close-up on whoever speaks (say(…, { close: true })): over the listener's shoulder when one stands within 5 m, else from
  // in front of the speaker, at eye height, slowly pushing in; the scene's own shot comes back with the next step
  closeUp(who, actor) {
    const hero = who === 'hero', rig = hero ? Player.human && Player.human.rig : actor && actor.R && actor.R.rig;
    if (!rig) return;
    const h = rig.bonePos('head', new V3()); let lis = null;
    if (!hero) { if (Player.human && Player.human.rig && Player.human.root.visible) lis = Player.human.rig.bonePos('head', new V3()); }
    else { let bd = 25; for (const id in Actors.map) { const q = Actors.map[id]; if (!q.R || !q.R.rig || q.anim === 'lie' || q.anim === 'carry') continue; const dd = dist2(q.pos.x, q.pos.z, Player.pos.x, Player.pos.z); if (dd < bd) { bd = dd; lis = q.R.rig.bonePos('head', new V3()); } } }
    const dl = lis ? Math.hypot(lis.x - h.x, lis.z - h.z) : 0, pos = new V3();
    if (lis && dl > 0.5 && dl < 5) {
      const dx = (lis.x - h.x) / dl, dz = (lis.z - h.z) / dl;
      pos.set(lis.x + dx * 0.85 - dz * 0.5, lis.y + 0.1, lis.z + dz * 0.85 + dx * 0.5);
    } else {
      const hd = hero ? Player.heading : actor.heading || 0, fx = Math.sin(hd), fz = Math.cos(hd);
      pos.set(h.x + fx * 2.2 + fz * 0.45, h.y + 0.06, h.z + fz * 2.2 - fx * 0.45);
    }
    const look = h.clone(); look.y -= 0.1;
    this._back = this.shot || 'none';
    this.shot = { p0: pos, l0: look, p1: pos.clone().lerp(look, 0.1), l1: look.clone(), t: 0, dur: 7 };
  },
  cam(rdt) {
    if (!this.active || !this.shot || this.opts.camera === false) return false;
    const s = this.shot; s.t += rdt;
    const u = smooth(clamp(s.t / s.dur, 0, 1));
    camera.position.lerpVectors(s.p0, s.p1, u);
    const l = _cutLook.lerpVectors(s.l0, s.l1, u);
    camera.lookAt(l);
    Cam.target.set(l.x, 0, l.z); Cam.toCam.copy(camera.position).sub(l).normalize();
    Cam.sun(l.x, l.z);
    return true;
  },
  showLine(s) {
    const sp = SPEAKERS[s.say] || SPEAKERS.narrator;
    this.line = { sp, text: s.text, shown: 0, t: 0, auto: s.auto ?? Math.max(2.4, s.text.length * 0.12 + 1.4), who: s.say, blipT: 0 };
    UI.dialog(sp, '');
    const actor = Actors.get(s.actor || s.say);
    if (actor && actor.anim === 'idle') { actor.anim = 'talk'; this.line.actor = actor; }
    if (s.close && this.opts.camera !== false && !this.skipping) guard('closeUp', () => this.closeUp(s.say, actor));
  },
  update(rdt) {
    if (!this.active) return;
    const adv = kpRaw('Space', 'Enter', 'KeyE', 'KeyF') || Input.click;
    if (kpRaw('Escape') && this.opts.skippable !== false) { this.skip(); return; }
    const L = this.line;
    if (L) {
      const len = L.text.length;
      if (L.shown < len) {
        L.shown = Math.min(len, L.shown + rdt * 36);
        L.blipT -= rdt; if (L.blipT <= 0) { L.blipT = 0.07; Sfx.blip(L.who === 'klaudeEvil' ? 0.7 : L.who === 'hero' ? 1.2 : 1); }
        UI.dialogText(L.text.slice(0, Math.ceil(L.shown)));
        if (adv) { L.shown = len; UI.dialogText(L.text); }
      } else {
        L.t += rdt;
        if (adv || L.t > L.auto) { if (L.actor && L.actor.anim === 'talk') L.actor.anim = 'idle'; this.next(); }
      }
    } else if (this.waitT > 0) { this.waitT -= rdt; if (this.waitT <= 0) this.next(); }
  },
  skip() { this.skipping = true; UI.chapter(null); this.next(); this.skipping = false; },
  finish() {
    this.active = false; this.line = null; UI.dialog(null); UI.letterbox(false); UI.hudDim(false); UI.chapter(null);
    Input.lock = !!Gym.active;
    this.shot = null; this._back = null; Cam.snap();
    UI.flushDeferred();
    const cb = this.onEnd; this.onEnd = null;
    if (cb) cb();
  },
};
const _cutLook = new V3();
// the scripted shots were framed for the old 3.7 m chibi cast: pull the camera in toward what it looks at (by about half) and
// bring the look point down to the ~1.8 m anime cast's chest / face height; wide establishing shots (over ~26 m away, blended
// out by 46 m), the mech and anything looked at from high up (look y > 3.6 m) keep their framing. [pos, look] arrays in and out
function fitShot(p, l) {
  if (!p || !l || l[1] > 3.6) return [p, l];
  const dx = p[0] - l[0], dy = p[1] - l[1], dz = p[2] - l[2], d = Math.hypot(dx, dy, dz), k = d < 26 ? 0.48 : d < 46 ? lerp(0.48, 1, (d - 26) / 20) : 1;
  const ly = l[1] <= 0.3 ? l[1] : lerp(l[1], clamp(0.3 + l[1] * 0.42, 0.5, 1.55), k < 1 ? (1 - k) / 0.52 : 0);
  return [[l[0] + dx * k, Math.max(0.6, ly + dy * k * (k < 1 ? 0.82 : 1)), l[2] + dz * k], [l[0], ly, l[2]]];
}
// frame two people (a, b) side-on, camera on the south side so the fixed-camera city reads naturally
function pairShot(ax, az, bx, bz, o = {}) {
  const mx = (ax + bx) / 2, mz = (az + bz) / 2, dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1;
  let px = -dz / d, pz = dx / d; if (pz < 0) { px = -px; pz = -pz; }
  if (pz < 0.35) { pz = 0.35; const l = Math.hypot(px, pz); px /= l; pz /= l; }
  const back = (o.back || 11) + d * 0.7, h = o.h || 7, ly = o.lookY ?? 3, drift = o.drift ?? 3;
  return { pos: [mx + px * back, h, mz + pz * back], look: [mx, ly, mz], to: [mx + px * (back - drift), h - 1, mz + pz * (back - drift)], lookTo: [mx, ly, mz], dur: o.dur || 10 };
}
// tiny script DSL
const say = (who, text, o = {}) => Object.assign({ say: who, text }, o);
const act = (fn) => ({ do: fn });
const wait = (s) => ({ wait: s });
const fade = (v, dur = 0.6) => ({ fade: v, dur });
const title = (t, sub, dur = 3) => ({ title: t, sub, dur });
// orbit-style shot around a point: angle 0 = camera south of the point
function shotAt(x, z, dist, h, ang, lookY = 2, dur = 4, ang2, dist2_, h2) {
  const p = [x + Math.sin(ang) * dist, h, z + Math.cos(ang) * dist];
  const q = [x + Math.sin(ang2 ?? ang) * (dist2_ ?? dist), h2 ?? h, z + Math.cos(ang2 ?? ang) * (dist2_ ?? dist)];
  return { shot: { pos: p, look: [x, lookY, z], to: q, lookTo: [x, lookY, z], dur } };
}

/* ---- phone calls: subtitles while you keep playing (SA style) ---- */
const Phone = {
  q: [], cur: null, t: 0,
  call(who, lines, onDone) { this.q.push({ who, lines: lines.slice(), onDone }); if (!this.cur) this.nextCall(); },
  nextCall() {
    this.cur = this.q.shift() || null;
    if (!this.cur) { UI.phone(null); return; }
    Sfx.phone(); this.t = -1.2; this.show();
  },
  show() { const c = this.cur; UI.phone(SPEAKERS[c.who] || SPEAKERS.narrator, c.lines[0] || ''); },
  update(dt) {
    const c = this.cur; if (!c) return;
    this.t += dt;
    if (this.t < 0) return;
    const line = c.lines[0] || '';
    if (this.t > Math.max(2.8, line.length * 0.13 + 1.2)) {
      c.lines.shift(); this.t = 0;
      if (!c.lines.length) { const cb = c.onDone; UI.phone(null); this.cur = null; if (cb) cb(); setTimeout(() => this.nextCall(), 400); }
      else this.show();
    }
  },
  clear() { this.q.length = 0; this.cur = null; UI.phone(null); },
};

/* ---- mission markers ---- */
const GIVERS = {
  klaude: { letter: 'C', color: '#e8845a', name: '杜卡德' }, alfred: { letter: '福', color: '#3b82f6', name: '阿福' },
  kodex: { letter: 'X', color: '#10b981', name: 'Kodex' }, gordon: { letter: '戈', color: '#b08850', name: '老戈' },
};
const Markers = {
  list: [],
  make(m) {
    const gv = GIVERS[m.giver], col = new THREE.Color(gv.color);
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cyl.position.y = 1.6;
    const letter = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerLetterTex(gv.letter, gv.color), transparent: true, depthWrite: false }));
    letter.scale.set(2.6, 2.6, 1); letter.position.y = 5.2; letter.renderOrder = 9;
    g.add(cyl, letter); scene.add(g);
    return { m, g, letter, gv };
  },
  sync() {
    const want = Story.available();
    for (let k = this.list.length - 1; k >= 0; k--) { const e = this.list[k]; if (!want.includes(e.m)) { scene.remove(e.g); this.list.splice(k, 1); } }
    for (const m of want) if (!this.list.some((e) => e.m === m)) this.list.push(this.make(m));
  },
  update(dt) {
    for (const e of this.list) {
      const p = e.m.where();
      e.g.position.set(p.x, groundH(p.x, p.z) + 0.05, p.z);
      e.letter.position.y = 5.2 + Math.sin(G.time * 2.5) * 0.35;
      e.g.visible = !Interiors.cur;
    }
    if (Story.cur || Cutscene.active || Interiors.cur || Interiors.fading) return;
    const P = Player;
    for (const e of this.list) {
      const p = e.m.where();
      if (dist2(P.pos.x, P.pos.z, p.x, p.z) > (P.isMech() ? 4.2 : 2.2) ** 2) continue;
      if (e.m.onFoot && P.mode !== 'human') { if (!this.hintT || G.time - this.hintT > 3) { this.hintT = G.time; UI.hint(`先下车 / 解除变身（${KH('Q', '解除').trim()}），再接活儿`); } continue; }
      Story.start(e.m);
      break;
    }
  },
};

/* ---- objective helpers ---- */
const O = {
  obj: (text, until, extra = {}) => Object.assign({ obj: text, until }, extra),
  cut: (steps) => ({ cut: steps }),
  call: (who, lines) => ({ call: who, lines }),
  run: (fn) => ({ run: fn }),
};
const hqById = (id) => W.hqs.find((h) => h.id === id);
// key hints that read right on a phone too: " T " on a keyboard, "「变身」" on the touch buttons
const KH = (k, touch) => (IS_TOUCH ? `「${touch}」` : ` ${k} `);
const hqWhere = (id) => (HQ_SPOTS[id] ? HQ_SPOTS[id][2] : '城外');
const doorPos = (id) => W.doors.find((d) => d.id === id);
// a door's own frame: `along` its frontage, `out` toward the street (for a south-facing door this is plain +x / +z)
function F(d, along, out) { const [ox, oz] = d.o || [0, 1]; return [d.x + oz * along + ox * out, d.z - ox * along + oz * out]; }
const hdOf = (d) => { const [ox, oz] = d.o || [0, 1]; return Math.atan2(ox, oz); };
// where a giver waits: a little off to the side of the door, so walking out of it doesn't start the job
function frontSpot(d) { const [x, z] = F(d, 3, 3.8), [px, pz] = openSpot(x, z, 0.9, 12); return { x: px, z: pz }; }
// scatter n tokens around (x,z) on open ground only (never in a house, a pond or a palace); leftovers go onto nearby lanes
function tokensAround(x, z, n, r, tag) {
  let got = 0;
  for (let k = 0; k < n * 14 && got < n; k++) {
    const a = rand(TAU), rr = rand(4, r + k * 0.08), px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    if (!openAt(px, pz, 0.6)) continue;
    Tokens.add(px, pz, 50000, { tag }); got++;
  }
  for (let k = 0; k < 30 && got < n; k++) { const s = Roads.randomSpot(x, z, 10, r + 60); if (!s) continue; const t = Tokens.add(s.x, s.z, 50000, { tag }); if (t) got++; }
  return got;
}
function spawnPack(type, n, cx, cz, r, o = {}) { for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rand(0.3); Enemies.spawn(type, null, Object.assign({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, tag: 'mission', aggro: true }, o)); } }
function intPos(id, lx, lz) { const b = Interiors.base(id); return [b.x + lx, b.z + lz]; }
// ---- routes on the real street graph (the truck test drive, a runaway through the 胡同) ----
// Dijkstra: o.src [[node, startCost]], o.w(e) cost per metre (Infinity = closed), o.oneway respects one-ways,
// o.hop lets it jump short gaps between nodes, o.goal(u) stops early. Returns { dist, via, end }.
function roadSearch(o) {
  const N = Roads.nodes.length, dist = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1), done = new Uint8Array(N), heap = [];
  const push = (i) => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (dist[heap[p]] <= dist[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && dist[heap[l]] < dist[heap[m]]) m = l; if (r < heap.length && dist[heap[r]] < dist[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  for (const [i, d0] of o.src) if (d0 < dist[i]) { dist[i] = d0; push(i); }
  let end = -1;
  while (heap.length) {
    const u = pop(); if (done[u]) continue; done[u] = 1; if (o.goal && o.goal(u)) { end = u; break; }
    for (const e of Roads.nodes[u].edges) {
      const w = o.w(e); if (w === Infinity) continue;
      const fwd = e.a === u, v = fwd ? e.b : e.a; if (!fwd && e.oneway && o.oneway) continue;
      const c = dist[u] + e.len * w; if (c < dist[v]) { dist[v] = c; via[v] = e.id; push(v); }
    }
    if (!o.hop) continue;
    // the map's divided roads don't always share junction nodes with the streets that cross them: let the drive hop
    // across short gaps (you can, in a truck) so the 二环 carriageways are reachable
    const nu = Roads.nodes[u], H = nodeHash(), c0 = Math.floor(nu.x / 24), r0 = Math.floor(nu.z / 24);
    for (let gx = c0 - 1; gx <= c0 + 1; gx++) for (let gz = r0 - 1; gz <= r0 + 1; gz++) for (const v of H.get(gx * 100003 + gz) || []) {
      const nv = Roads.nodes[v], d = hyp(nv.x - nu.x, nv.z - nu.z); if (v === u || d > 24) continue;
      const c = dist[u] + 8 + d * 1.5; if (c < dist[v]) { dist[v] = c; via[v] = -2 - u; push(v); }
    }
  }
  return { dist, via, end };
}
// the polyline from the search's source to node `end` (hops just join the edges on either side)
function roadPath(via, end) {
  const legs = [];
  for (let v = end; via[v] !== -1;) {
    if (via[v] <= -2) { v = -2 - via[v]; continue; }
    const e = Roads.edges[via[v]], fwd = e.b === v; legs.push([e, fwd]); v = fwd ? e.a : e.b;
    if (legs.length > 8000) return null;
  }
  const line = [];
  for (let q = legs.length - 1; q >= 0; q--) { const [e, fwd] = legs[q], pts = fwd ? e.pts : e.pts.slice().reverse(); for (const p of pts) { const l = line[line.length - 1]; if (!l || hyp(l[0] - p[0], l[1] - p[1]) > 0.5) line.push(p); } }
  return line;
}
const ROUTE_W = [0.35, 0.45, 1, 1.3, 1.7, 3, Infinity, Infinity];
const drivable = (n) => n.edges.some((e) => ROUTE_W[e.cls] < 9);
// the truck route: from any node near `from`, through each stop in turn (ring + 长安街 strongly preferred, one-ways respected)
function roadRoute(from, stops, R = 70) {
  let src = [], line = [];
  Roads.nodes.forEach((n, i) => { const d = hyp(n.x - from[0], n.z - from[1]); if (d < R && drivable(n)) src.push([i, d * 2]); });
  for (const to of stops) {
    const goal = (u) => { const n = Roads.nodes[u]; return hyp(n.x - to[0], n.z - to[1]) < R * 0.6; };
    const r = roadSearch({ src, w: (e) => ROUTE_W[e.cls], oneway: true, hop: true, goal }); if (r.end < 0) return null;
    const seg = roadPath(r.via, r.end); if (!seg) return null;
    for (const p of seg) { const l = line[line.length - 1]; if (!l || hyp(l[0] - p[0], l[1] - p[1]) > 0.5) line.push(p); }
    src = [[r.end, 0]];
  }
  return line;
}
let _nodeHash = null;
function nodeHash() {
  if (_nodeHash) return _nodeHash;
  _nodeHash = new Map();
  Roads.nodes.forEach((n, i) => { if (!drivable(n)) return; const k = Math.floor(n.x / 24) * 100003 + Math.floor(n.z / 24); (_nodeHash.get(k) || _nodeHash.set(k, []).get(k)).push(i); });
  return _nodeHash;
}
// a runaway's route through the 胡同 near (x,z): lanes only (no hops through houses), minL..maxL long, ending as far from `away` as it can
// (the lanes only meet at the streets, so streets are allowed — just dear, so he ducks back into the next 胡同)
const LANE_OK = (e) => [6, 6, 5, 3, 2, 1.3, 1, 1.3][e.cls];
function hutongRun(x, z, away, minL = 300, maxL = 480) {
  const n = Roads.nearest(x, z, 160, (e) => e.cls >= 5); if (!n) return null;
  const e0 = n.e, sa = n.s * LANE_OK(e0), sb = (e0.len - n.s) * LANE_OK(e0);
  const r = roadSearch({ src: [[e0.a, sa], [e0.b, sb]], w: LANE_OK, oneway: false });
  let best = -1, bs = -Infinity;
  Roads.nodes.forEach((q, i) => { const d = r.dist[i]; if (d < minL || d > maxL) return; const sc = hyp(q.x - away[0], q.z - away[1]) + rand(20); if (sc > bs) { bs = sc; best = i; } });
  if (best < 0) return null;
  const line = roadPath(r.via, best); if (!line || line.length < 2) return null;
  // lead-in: from the start point along its own lane to whichever end the route leaves from
  const A = Roads.nodes[e0.a], atA = hyp(line[0][0] - A.x, line[0][1] - A.z) < 0.5, head = [[n.x, n.z]];
  if (atA) { for (let i = e0.pts.length - 2; i >= 1; i--) if (e0.cum[i] < n.s) head.push(e0.pts[i]); }
  else for (let i = 1; i < e0.pts.length - 1; i++) if (e0.cum[i] > n.s) head.push(e0.pts[i]);
  return head.concat(line);
}
// checkpoints every ~step metres along a polyline; each named after a nearby subway station if there is one
function checkpointsAlong(line, step = 210) {
  const ST = (MAPD.raw.stations || []).map((s) => [s[0], s[1] * MAPD.k, s[2] * MAPD.k]);
  const name = (x, z) => { let b = '', bd = 95 * 95; for (const [n, sx, sz] of ST) { const d = dist2(x, z, sx, sz); if (d < bd) { bd = d; b = n; } } return b; };
  const out = []; let acc = 0, len = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], L = hyp(bx - ax, bz - az); len += L; acc += L;
    if (acc >= step && i < line.length - 1) { acc = 0; out.push([bx, bz, name(bx, bz)]); }
  }
  const [ex, ez] = line[line.length - 1]; out.push([ex, ez, name(ex, ez)]);
  return { list: out, len };
}
function stationXZ(nm, lon, lat) { const s = (MAPD.raw.stations || []).find((q) => q[0] === nm); return s ? [s[1] * MAPD.k, s[2] * MAPD.k] : geoToGame(lon, lat); }

/* ---- 得云社的段子（原创），[说话的, 词儿, 这句之后台下笑不笑] ---- */
const XIANGSHENG = [
  [['xs1', '今儿咱俩说段儿新鲜的——《大模型》。'], ['xs2', '哟，您还懂这个？'], ['xs1', '那可不，我现在是 AI 专家。'], ['xs2', '您？专家？'],
    ['xs1', '我天天跟 AI 聊天儿，一聊就是一宿。'], ['xs2', '那不叫专家，那叫失眠。', 1], ['xs1', '前两天我问它：北京哪儿的炸酱面最地道？'], ['xs2', '它怎么说？'],
    ['xs1', '它说：作为一个大语言模型，我没有嘴。'], ['xs2', '嗐，它倒挺实在！', 1], ['xs1', '我说那你给我写首诗，夸夸咱北京。'], ['xs2', '这它拿手。'],
    ['xs1', '写了八百字儿，最后一句——“以上内容由 AI 生成，仅供参考”。'], ['xs2', '得，白夸了！', 1]],
  [['xs1', '我最近发财了。'], ['xs2', '怎么发的？'], ['xs1', '我攒了一百万 Token。'], ['xs2', 'Token 是什么？钱吗？'],
    ['xs1', '比钱还金贵！一个字儿一个字儿算钱。'], ['xs2', '那您说话可得省着点儿。'], ['xs1', '所以我跟我媳妇儿说话，就仨字儿。'], ['xs2', '哪仨字儿？'],
    ['xs1', '“嗯”“啊”“行”。'], ['xs2', '这不就是我们捧哏的词儿吗！', 1], ['xs1', '对喽，您这一年下来，净省 Token 了！'], ['xs2', '合着台上最会过日子的是我！', 1]],
  [['xs1', '听说了吗，城里出了个 Token 侠。'], ['xs2', '听说了，拳打 Kwen，脚踢逗包。'], ['xs1', '厉害吧？他师父更厉害。'], ['xs2', '谁呀？'],
    ['xs1', '一个 AI，倍儿有礼貌，干什么都先问你一句。'], ['xs2', '问什么？'], ['xs1', '“您确定要继续吗？(y/n)”'], ['xs2', '那挺好啊，多稳当。'],
    ['xs1', '你按 n，它说：好的，我理解您的顾虑——然后接着干。', 1], ['xs2', '那您问我干嘛呀！'], ['xs1', '走个流程嘛！', 1], ['xs2', '去你的吧！', 1]],
  [['xs1', '我给您出个谜语。'], ['xs2', '您说。'], ['xs1', '白天睡大觉，晚上吃电费，一开口就说“好的”。'], ['xs2', '这是……您二大爷？', 1],
    ['xs1', '这是服务器！'], ['xs2', '那跟我二大爷也差不多。', 1], ['xs1', '我再问您，AI 最怕什么？'], ['xs2', '怕断电？'],
    ['xs1', '怕胡同儿里的大妈。'], ['xs2', '这怎么讲？'], ['xs1', '大妈一问“小伙子多大了，有对象吗”——它当场就幻觉了。', 1], ['xs2', '别说 AI 了，我也扛不住！', 1]],
];

if (!SPEAKERS.labeler) SPEAKERS.labeler = { name: '标注员', color: '#d1d5db', head: () => HEADS.labeler };
const RUNNER_BARKS = ['抓不着！抓不着！', '这胡同儿我熟，您呐——够呛！', '标一条三毛，跑一趟五块！', '您瞧我这是猫还是狗？', '借光借光！', '大妈让让，后头有人追我！'];
const RUNNER_DODGE = ['嘿！差一丁点儿！', '哎——没摸着！', '您这手慢了半拍儿！', '滑溜吧？胡同儿里练的！'];
const RUNNER_TIRED = ['哎哟喂……岔气儿了……', '歇、歇会儿……', '标注员……不练腿儿啊……'];

/* ---- the plot（京味儿评书版）---- */
const MISSIONS = [];
function defineMissions() {
  const home = doorPos('home'), dojo = doorPos('dojo'), lab = doorPos('lab');
  const plaza = W.plaza, gordonAt = W.gordonAt;
  const atHome = frontSpot(home), atDojo = frontSpot(dojo), atLab = frontSpot(lab);
  // 东二环 + 长安街 test drive for the truck: lab → 东直门 → 东四十条 → 朝阳门 → 建国门 → 东单 → 王府井 → 天安门东
  const race = Story.race = (() => {
    const from = F(lab, 0, 6), to = stationXZ('天安门东', 116.4010, 39.9075);
    const line = guard('race route', () => roadRoute(from, [stationXZ('建国门', 116.4350, 39.9080), to]));
    const r = line && line.length > 1 ? checkpointsAlong(line) : { list: [stationXZ('东直门', 116.4340, 39.9410), stationXZ('建国门', 116.4350, 39.9080), to].map(([x, z]) => [x, z, '']), len: 2000 };
    r.time = Math.ceil((r.len / 18 + 12) / 5) * 5;
    return r;
  })();
  MISSIONS.push(
    // ---------------- 序章 ----------------
    { id: 'm0', title: '序章 · OOM 之井', giver: 'alfred', auto: true, where: () => W.spawn, steps: [
      O.cut([
        act(() => { DayNight.setTime(23); Interiors.enterInstant('well'); const [x, z] = intPos('well', 0, 0); Player.pos.set(x, 0, z + 1); Player.heading = Math.PI; Player.human.root.visible = true; Sfx.mood('sad'); }),
        title('序章', '话说很多年以前……', 3),
        act(() => { const [x, z] = intPos('well', 0, 0); Cutscene.setShot({ pos: [x, 22, z + 10], look: [x, 0, z], to: [x, 12, z + 7], lookTo: [x, 1, z], dur: 9 }); }),
        say('narrator', '话说很多年以前，您头一回拿单卡跑 70B，一个跟头栽进了四合院的显存之井。'),
        act(() => { const [x, z] = intPos('well', 0, 0); for (let k = 0; k < 80; k++) { const a = rand(TAU); Debris.spawn(x + Math.cos(a) * 6, rand(1, 6), z + Math.sin(a) * 6, -Math.sin(a) * 9 + rand(-2, 2), rand(-1, 4), Math.cos(a) * 9 + rand(-2, 2), 0.8, 0.1, 0.45, 0x0b0b0e, rand(1.5, 3)); } Sfx.gas(); }),
        say('narrator', '井底下黑咕隆咚，呼啦啦涌出来成千上万的 bug——打那天起，您最怵的就是 bug。'),
        act(() => { const [x, z] = intPos('well', 0, -5.4); Actors.spawn('alfred', 'alfred', x, z, 0); Cutscene.setShot({ raw: true, pos: [x + 3.1, 2.5, z + 10.6], look: [x, 1.3, z + 3.2], to: [x + 2.3, 2.2, z + 10], lookTo: [x, 1.35, z + 2.8], dur: 14 }); }),
        say('alfred', '少爷！您抓住喽，绳子给您顺下去了！', { close: true }),
        say('alfred', '少爷，您说咱为什么会 OOM 呢？'),
        say('hero', '……'),
        say('alfred', '为的是学会——重新加载。'),
        fade(1, 0.8),
        act(() => { Actors.clear(); Interiors.leaveInstant(); Interiors.enterInstant('prison'); const [x, z] = intPos('prison', 0, 4); Player.pos.set(x, 0, z); Player.heading = Math.PI; DayNight.setTime(14);
          for (let k = 0; k < 3; k++) { const [bx, bz] = intPos('prison', -5 + k * 5, -2); Actors.spawn('bug' + k, 'bug', bx, bz, 0); } Sfx.mood('cut'); }),
        title('很多年以后', '显存看守所', 2.6),
        fade(0, 0.8),
        act(() => { const [x, z] = intPos('prison', 0, 1); Cutscene.setShot({ pos: [x, 14, z + 16], look: [x, 1.5, z], to: [x - 6, 10, z + 12], lookTo: [x, 1.5, z], dur: 8 }); }),
        say('bug', '新来的？懂不懂规矩？把 Token 交出来！', { actor: 'bug1' }),
        say('hero', '我兜儿比脸还干净，一个 Token 都没有。'),
        say('bug', '没 Token？那就把上下文交出来！', { actor: 'bug1' }),
        act(() => { Actors.clear('bug'); }),
      ]),
      O.obj(`撂倒 3 个 bug 狱霸（${IS_TOUCH ? '「拳」「踢」' : 'J 出拳，K 踢腿'}）`, () => Enemies.countTag('mission') === 0, { lock: true,
        retry: () => { Interiors.enterInstant('prison'); const [x, z] = intPos('prison', 0, 4); Player.pos.set(x, 0, z); Player.heading = Math.PI; DayNight.setTime(14); Cam.snap(); },
        setup: () => { for (let k = 0; k < 3; k++) { const [bx, bz] = intPos('prison', -5 + k * 5, -2); Enemies.spawn('bugthug', null, { x: bx, z: bz, tag: 'mission' }); } Sfx.mood('city'); },
      }),
      O.cut([
        act(() => { const [x, z] = intPos('prison', 0, -5); Actors.spawn('klaude', 'klaude', x, z, 0); FX.light(x, 3, z, 3, 0xff9a66); Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('prison', 0, -1); Cutscene.setShot({ pos: [x + 6, 7, z + 9], look: [x, 2.5, z - 2], to: [x + 3, 6, z + 7], lookTo: [x, 2.5, z - 3], dur: 10 }); }),
        say('klaude', '嚯，拳脚挺利索。可惜呀，您打的是 bug，不是根儿上的毛病。'),
        say('hero', '您哪位？'),
        say('klaude', '叫我杜卡德就成。我替一位更大的主儿办事儿——影之 Agent 联盟。', { close: true }),
        say('klaude', '您要找的不是 Token，是个活法儿。'),
        say('klaude', '想明白了，就出西二环，奔西山方向，林子里有座道场——我在那儿等您。'),
        say('klaude', '路上记着吃 Token。没 Token，您什么都不是。', { close: true }),
        fade(1, 0.8),
        act(() => { Actors.clear(); Interiors.leaveInstant(); Player.pos.copy(W.spawn); Player.heading = hdOf(home); DayNight.setTime(8.5); Sfx.mood('city'); }),
        fade(0, 0.8),
        title('GRAND TOKEN AUTO', '四九城 · 侠影之谜', 3.2),
      ]),
    ], reward: { xp: 120, money: 20000, quiet: true } },
    // ---------------- 第一回 ----------------
    { id: 'm1', title: '修行', giver: 'klaude', onFoot: true, where: () => atDojo, steps: [
      O.cut([
        act(() => { Interiors.enterInstant('dojo'); const [x, z] = intPos('dojo', 0, -4); Actors.spawn('klaude', 'klaude', x, z, 0); const [hx, hz] = intPos('dojo', 0, 4); Player.pos.set(hx, 0, hz); Player.heading = Math.PI; Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('dojo', 0, 0); Cutscene.setShot({ pos: [x + 9, 9, z + 12], look: [x, 2, z], to: [x - 7, 8, z + 11], lookTo: [x, 2, z], dur: 14 }); }),
        say('klaude', '欢迎来到影之 Agent 联盟。咱这儿不讲虚的。'),
        say('klaude', '头一课：Token 就是力气。吃满 1M 上下文，您就能脱了这身肉胎。', { close: true }),
        say('klaude', '第二课——留神您的上下文。'),
        say('hero', '啥？'),
        act(() => { Actors.anim('klaude', 'point'); UI.flash(); Cam.shake(0.6); Sfx.punch(); }),
        say('klaude', '留神上下文！走神儿了吧您？'),
        say('klaude', `上外头林子里吃 Token 去。吃满了${IS_TOUCH ? '点「变身」' : '按 T '}变身，再把那几根木人桩给我拆喽。`),
        fade(1),
        act(() => {
          Actors.clear(); Interiors.leaveInstant(); Story.flags.transform = true;
          let [x, z] = F(dojo, 0, 4); Player.pos.set(x, 0, z); Player.heading = hdOf(dojo);
          tokensAround(W.dojoPos.x, W.dojoPos.z, 26, 24, 'm1');
          for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; Enemies.spawn('dummy', null, { x: W.dojoPos.x + Math.cos(a) * 17, z: W.dojoPos.z + Math.sin(a) * 17, tag: 'mission' }); }
          [x, z] = F(dojo, 3, 2); Actors.spawn('klaude', 'klaude', x, z, hdOf(dojo)); Sfx.mood('city');
        }),
        fade(0),
      ]),
      O.obj('在道场外头的林子里吃满 1M Token', () => Player.tokens >= CAP || Player.isMech(), { target: 'token' }),
      O.obj(IS_TOUCH ? '点「变身」变身' : '按 T 变身', () => Player.mode === 'robot', {}),
      O.obj('拆了 4 根木人桩', () => Enemies.countTag('mission') === 0, { target: 'enemy' }),
      O.cut([
        act(() => {
          const P = Player.pos, mech = Player.isMech(), cx = P.x + (mech ? 8 : 4), cz = P.z + (mech ? 3 : 2);
          if (!Actors.get('klaude')) Actors.spawn('klaude', 'klaude', cx, cz, 0); else Actors.place('klaude', cx, cz);
          Actors.face('klaude', P.x, P.z); Player.heading = Math.atan2(cx - P.x, cz - P.z);
          Cutscene.setShot(pairShot(P.x, P.z, cx, cz, { h: mech ? 12 : 6, lookY: mech ? 6.8 : 2.4, back: mech ? 21 : 9, dur: 12 }));
        }),
        say('klaude', '有两下子，学得够快的。'),
        say('klaude', '记住喽：虚虚实实、真真假假，对雏儿来说，那就是最厉害的 Agent。', { close: true }),
        say('klaude', '明儿个，影之首领亲自考您。'),
        act(() => Actors.remove('klaude')),
      ]),
    ], reward: { xp: 300, money: 100000 } },
    { id: 'm2', title: '试炼 · 我不删生产数据', giver: 'klaude', onFoot: true, where: () => atDojo, steps: [
      O.cut([
        act(() => {
          Interiors.enterInstant('dojo');
          const P = (lx, lz) => intPos('dojo', lx, lz);
          let [x, z] = P(0, -8.4); Actors.spawn('master', 'master', x, z, 0);
          [x, z] = P(-4, -5); Actors.spawn('klaude', 'klaude', x, z, 0.4);
          [x, z] = P(0, -2.5); Actors.spawn('thief', 'bug', x, z, 0, { anim: 'kneel' });
          [x, z] = P(0, 4); Player.pos.set(x, 0, z); Player.heading = Math.PI;
          for (let k = 0; k < 4; k++) { [x, z] = P(-9 + k * 6, -6.5); Actors.spawn('sh' + k, 'shadow', x, z, 0); }
          Sfx.mood('cut');
        }),
        act(() => { const [x, z] = intPos('dojo', 0, -3); Cutscene.setShot({ pos: [x, 11, z + 14], look: [x, 2.5, z - 2], to: [x + 5, 8, z + 11], lookTo: [x, 2.5, z - 3], dur: 16 }); }),
        say('master', '该教的都教了。今儿，您得亮亮真章儿。', { close: true }),
        say('klaude', '执行 rm -rf，把他删喽。'),
        say('hero', '他就是个偷 Token 的小毛贼。'),
        say('klaude', '四九城早就烂透了。联盟每隔几个版本，就得来一回大扫除。'),
        say('hero', '……生产数据，我不删。'),
        say('klaude', '那您还不够格儿。'),
        say('master', '拿下！'),
        act(() => { Actors.clear('sh'); Actors.remove('thief'); Sfx.mood('boss'); }),
      ]),
      O.obj('撂倒影之 Agent', () => Enemies.countTag('mission') === 0, { lock: true, setup: () => { const [x, z] = intPos('dojo', 0, -1); spawnPack('shadow', 4, x, z, 7); }, target: 'enemy',
        retry: () => { Interiors.enterInstant('dojo'); const [x, z] = intPos('dojo', 0, 4); Player.pos.set(x, 0, z); Player.heading = Math.PI; Cam.snap(); Sfx.mood('boss'); } }),
      O.cut([
        act(() => { Story.dojoFire(); Actors.anim('klaude', 'lie'); Actors.anim('master', 'lie'); }),
        say('narrator', '正打得热闹，灯笼倒了——道场着起来了！'),
        say('hero', '杜卡德……我不能把您撂这儿。'),
        act(() => { Actors.remove('klaude'); Actors.remove('master'); Story.lockExit = false; }),
      ]),
      O.obj('背着杜卡德冲出道场', () => !Interiors.cur, { timer: 25, fail: '您没能冲出火场……', target: 'exit',
        retry: () => { Interiors.enterInstant('dojo'); const [x, z] = intPos('dojo', 0, -3); Player.pos.set(x, 0, z); Player.heading = 0; Cam.snap(); Story.dojoFire(); Sfx.mood('boss'); },
        setup: () => Actors.spawn('carry', 'klaude', Player.pos.x, Player.pos.z, 0, { anim: 'carry' }),
        tick: () => { const a = Actors.get('carry'); if (!a) return; const h = Player.heading + Math.PI / 2; a.pos.set(Player.pos.x + Math.sin(h) * 0.9, 0, Player.pos.z + Math.cos(h) * 0.9); a.heading = h; a.y = 1.75 + Player.y; a.R.root.visible = Player.mode === 'human'; } }),
      O.cut([
        act(() => { Actors.remove('carry'); Hazards.clear('dojo'); Story.burnDojo(); const h = hdOf(dojo); let [x, z] = F(dojo, 2.5, 5); Actors.spawn('klaude', 'klaude', x, z, h, { anim: 'lie' }); [x, z] = F(dojo, -1.5, 5.5); Player.pos.set(x, 0, z); Player.heading = h + Math.PI / 2; Sfx.mood('sad'); }),
        act(() => { const [px, pz] = F(dojo, 3, 20), [qx, qz] = F(dojo, -4, 15); Cutscene.setShot({ pos: [px, 10, pz], look: [dojo.x, 3, dojo.z], to: [qx, 7, qz], lookTo: [dojo.x, 4, dojo.z], dur: 12 }); }),
        say('klaude', '……您干嘛救我？', { close: true }),
        say('hero', '因为——我不删生产数据。'),
        say('klaude', '……您早晚得后悔。'),
        say('narrator', '西山脚下的影之道场，一把火烧了个干干净净。您回了城——四九城，还是那个四九城。'),
        act(() => { Actors.remove('klaude'); Sfx.mood('city'); }),
      ]),
    ], reward: { xp: 500, money: 200000 } },
    // ---------------- 第二回 ----------------
    { id: 'm3', title: '回府 · 25号机', giver: 'alfred', onFoot: true, where: () => atHome, steps: [
      O.cut([
        act(() => { Interiors.enterInstant('home'); const [x, z] = intPos('home', 0, 5); Player.pos.set(x, 0, z); Player.heading = Math.PI; Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('home', -5, -1); Cutscene.setShot({ pos: [x + 6, 9, z + 12], look: [x, 2, z], to: [x, 7, z + 10], lookTo: [x - 2, 2, z - 2], dur: 16 }); }),
        say('alfred', '哎哟少爷，您可算回来了！王府里的服务器，我天天儿给您开着呢。', { actor: 'int_alfred', close: true }),
        say('hero', '阿福，城里现在什么样儿了？'),
        say('alfred', '百模帮把全城的 Token 都攥手里了。法务部拿了人家的好处，就知道给老百姓发律师函。', { actor: 'int_alfred' }),
        say('hero', '老百姓得有个念想儿，一个让百模帮一听就腿肚子转筋的东西。'),
        say('alfred', '比方说……一个人？', { actor: 'int_alfred' }),
        say('hero', '人能被收购，能被裁员。可要是个念想儿——那就是 Token 侠。'),
        say('alfred', '少爷您可悠着点儿。对了，Kodex 在东直门外的应用科学部等您呢，说有好东西让您瞧瞧。', { actor: 'int_alfred' }),
        say('alfred', '雕花大床睡一觉能存档，衣柜里有行头，作战室电脑能看技能树——您自个儿拾掇。', { actor: 'int_alfred' }),
      ]),
    ], reward: { xp: 150, money: 50000 } },
    { id: 'm4', title: '应用科学部', giver: 'kodex', onFoot: true, where: () => atLab, steps: [
      O.cut([
        act(() => { Interiors.enterInstant('lab'); const [x, z] = intPos('lab', 0, 5); Player.pos.set(x, 0, z); Player.heading = Math.PI; Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('lab', -3, -2); Cutscene.setShot({ pos: [x + 10, 10, z + 13], look: [x, 2, z], to: [x - 2, 8, z + 11], lookTo: [x - 3, 2, z - 1], dur: 16 }); }),
        say('kodex', '您就是 Token 侠？我叫 Kodex，应用科学部的。说白了，就是写代码写到没人管的那个部门儿。', { actor: 'int_kodex', close: true }),
        say('kodex', '这是变形战甲的卡车模块。本来是给百模帮做的，人家嫌贵，没要。', { actor: 'int_kodex' }),
        say('hero', '有黑色款吗？'),
        say('kodex', '有，还带 1M 上下文，妥妥的。', { actor: 'int_kodex' }),
        act(() => { RPG.paints.knight = true; }),
        say('kodex', '开出去遛遛：上东二环，一路往南到建国门，再拐长安街往西，到天安门东。撞坏了……也没事儿。', { actor: 'int_kodex' }),
        fade(1),
        act(() => { Interiors.leaveInstant(); Story.flags.truck = true; const [x, z] = F(lab, 0, 5); Player.pos.set(x, 0, z); Player.heading = hdOf(lab); Player.tokens = Math.max(Player.tokens, CAP); Sfx.mood('city'); }),
        fade(0),
      ]),
      O.obj(IS_TOUCH ? '点「变身」，再点「卡车」变成卡车' : '变身（T），再按一回 T 变成卡车', () => Player.mode === 'truck', {
        retry: () => { if (Interiors.cur) Interiors.leaveInstant(); Story.flags.truck = true; const [x, z] = F(lab, 0, 5); Player.pos.set(x, 0, z); Player.heading = hdOf(lab); Player.tokens = Math.max(Player.tokens, CAP); Cam.snap(); } }),
      O.obj(`${race.time} 秒内跑完东二环 + 长安街（东直门 → 建国门 → 天安门东）`, () => Story.cpDone(), { setup: () => Story.checkpoints(race.list), timer: race.time, fail: '超时了。Kodex：“再来一圈儿？东二环这个点儿不堵啊！”', target: 'cp' }),
      O.call('kodex', ['开得够野的！长安街上都没人敢超您。', '以后升级装备来找我，童叟无欺。']),
      O.run(() => { Story.flags.labShop = true; }),
    ], reward: { xp: 400, money: 300000 } },
    { id: 'm5', title: '拳打 Kwen 办公', giver: 'klaude', where: () => plaza, steps: [
      O.call('klaude', ['听说您回城了。我伤好了，这回远程给您支招儿。', `百模帮头一个堂口：${hqWhere('kwen')}外头的 Kwen 办公。`, '拿拳头招呼它，效果翻倍——它那承重墙就怕拳头。']),
      O.obj(`拳打 Kwen 办公（${hqWhere('kwen')}，城东北）`, () => hqById('kwen').dead, { target: 'hq:kwen', tick: (s) => { const h = hqById('kwen'); if (!s.said && h.hp < h.maxHp * 0.6) { s.said = true; Phone.call('klaude', [`连按${KH('J', '拳')}打三连击，最后那下儿是上勾拳！`]); } } }),
    ], reward: { xp: 600, money: 500000, next: 'm6' } },
    { id: 'm6', title: '脚踢逗包办公', giver: 'klaude', where: () => plaza, steps: [
      O.call('klaude', [`漂亮！下一个：${hqWhere('doubao')}那边儿的逗包办公。`, '它们怕脚。甭问我为什么。']),
      O.obj(`脚踢逗包办公（${hqWhere('doubao')}，城西北）`, () => hqById('doubao').dead, { target: 'hq:doubao' }),
    ], reward: { xp: 600, money: 500000, next: 'm7' } },
    { id: 'm7', title: '横扫起查查', giver: 'klaude', where: () => plaza, steps: [
      O.call('klaude', ['起查查把您的底细全查出来了，满世界发通缉。', `它在${hqWhere('qcc')}，长安街东头儿。抄起汽车（${KH('F', '抓车').trim()}）砸过去，要不变卡车直接撞它。`]),
      O.obj(`横扫起查查（${hqWhere('qcc')}，长安街东头）`, () => hqById('qcc').dead, { target: 'hq:qcc' }),
      O.cut([
        act(() => { const mech = Player.isMech(), a = Player.pos.x + (mech ? 8 : 4), b = Player.pos.z + (mech ? 4 : 2); Actors.spawn('gordon', 'gordon', a, b, Math.PI); Actors.face('gordon', Player.pos.x, Player.pos.z); Player.heading = Math.atan2(a - Player.pos.x, b - Player.pos.z); Sfx.mood('cut');
          Cutscene.setShot(pairShot(Player.pos.x, Player.pos.z, a, b, { h: mech ? 12 : 6, lookY: mech ? 6.8 : 2.4, back: mech ? 21 : 9, dur: 12 })); }),
        say('gordon', '您就是把起查查拆了的那位……那个……玩意儿？'),
        say('hero', '我是 Token 侠。'),
        say('gordon', '法务部里全是百模帮的人。就我一个，还按规矩办事儿。', { close: true }),
        say('gordon', '有事儿上前门箭楼底下找我，我那辆车就停那儿。'),
        act(() => { Actors.remove('gordon'); Sfx.mood(G.moodFor()); }),
      ]),
    ], reward: { xp: 700, money: 600000 } },
    { id: 'm8', title: '幻觉博士', giver: 'gordon', onFoot: true, where: () => gordonAt, steps: [
      O.cut([
        act(() => { Actors.spawn('gordon', 'gordon', gordonAt.x + 1.5, gordonAt.z - 2.5, Math.PI); Actors.face('gordon', Player.pos.x, Player.pos.z); Sfx.mood('cut'); }),
        act(() => { Cutscene.setShot({ pos: [gordonAt.x + 6, 9, gordonAt.z + 12], look: [gordonAt.x, 2.4, gordonAt.z - 1], to: [gordonAt.x - 3, 7, gordonAt.z + 10], lookTo: [gordonAt.x, 2.4, gordonAt.z - 1], dur: 14 }); }),
        say('gordon', '城里的人开始说胡话了。胡同口的大爷说 AI 从来不出错，遛鸟儿的说一加一等于三。'),
        say('gordon', '是一种幻觉毒气。这两天，前门这片儿的胡同里，有人背着喷壶满处撒。'),
        act(() => { Story.runnerStart(); const a = Actors.get('runner'); Actors.face('gordon', a.pos.x, a.pos.z); Actors.anim('gordon', 'point');
          Cutscene.setShot(pairShot(gordonAt.x, gordonAt.z, a.pos.x, a.pos.z, { h: 7, lookY: 2, back: 10, dur: 8 })); Sfx.alert(); }),
        say('labeler', '哟，老戈！又来逮我乱停共享单车啦？回见了您呐！', { actor: 'runner' }),
        say('gordon', '就是他！追！别让他钻胡同儿跑喽！'),
        act(() => { Actors.anim('gordon', 'idle'); Sfx.mood('boss'); }),
      ]),
      O.obj('追上那个撒毒气的标注员（钻胡同儿，别跟丢了）', () => Story.runner && Story.runner.caught, { target: 'runner', tick: (s, dt) => Story.runnerTick(s, dt),
        setup: () => { if (!Actors.get('runner')) Story.runnerStart(); },
        retry: () => { if (Interiors.cur) Interiors.leaveInstant(); const [x, z] = openSpot(gordonAt.x, gordonAt.z + 2, 0.8, 10); Player.pos.set(x, 0, z); Cam.snap(); Sfx.mood('boss'); } }),
      O.cut([
        act(() => { const a = Actors.get('runner'), P = Player.pos; Actors.remove('gordon'); if (a) { Actors.face('runner', P.x, P.z); Actors.anim('runner', 'kneel'); Player.heading = Math.atan2(a.pos.x - P.x, a.pos.z - P.z); Cutscene.setShot(pairShot(P.x, P.z, a.pos.x, a.pos.z, { h: 5.5, lookY: 1.6, back: 7, dur: 10 })); } Sfx.mood('cut'); }),
        say('labeler', '别打别打！我就是个打零工的标注员，标一条三毛钱！', { actor: 'runner' }),
        say('hero', '这毒气打哪儿来的？'),
        say('labeler', '安定门外，阿卡姆标注中心批发的！一桶喷壶，管够三条胡同儿。', { actor: 'runner' }),
        say('labeler', '那儿管事儿的叫幻觉博士……您可留神，他那毒气能让您瞧见您最怵的东西。', { actor: 'runner' }),
        act(() => { Actors.remove('runner'); Story.runner = null; Sfx.mood(G.moodFor()); }),
      ]),
      O.call('gordon', ['阿卡姆标注中心？安定门外，北二环外头。', '我这边儿人手不够，您先去探探。']),
      O.obj('去阿卡姆标注中心（安定门外，城北）', () => Interiors.cur === 'arkham', { target: 'door:arkham' }),
      O.cut([
        act(() => { const [x, z] = intPos('arkham', 0, -7); Actors.spawn('crane', 'crane', x, z, 0); Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('arkham', 0, -2); Cutscene.setShot({ pos: [x + 5, 11, z + 15], look: [x, 2.5, z - 4], to: [x - 5, 9, z + 12], lookTo: [x, 2.5, z - 5], dur: 12 }); }),
        say('crane', '欢迎光临阿卡姆。这儿的每一条数据，都是我亲手标的。'),
        say('crane', '您最怵什么？让我猜猜……bug？', { close: true }),
        act(() => { const [x, z] = intPos('arkham', 0, -3); Hazards.gas(x, z, 8, 5); Player.poison = 0.9; Actors.remove('crane'); Sfx.mood('boss'); }),
      ]),
      O.obj('撂倒发了疯的标注员', () => Enemies.countTag('mission') === 0, { lock: true, setup: () => { const [x, z] = intPos('arkham', 0, -2); spawnPack('labeler', 4, x, z, 9); }, target: 'enemy',
        retry: () => { Interiors.enterInstant('arkham'); const [x, z] = intPos('arkham', 0, 5); Player.pos.set(x, 0, z); Player.heading = Math.PI; Cam.snap(); Player.poison = 0.9; Sfx.mood('boss'); } }),
      O.cut([
        act(() => { const [x, z] = intPos('arkham', 0, -7); Actors.spawn('crane', 'crane', x, z, 0); }),
        say('crane', '有点儿意思。那我亲自陪您玩儿玩儿。'),
        act(() => { Actors.remove('crane'); const [x, z] = intPos('arkham', 0, -7); Boss.start('crane', x, z, () => { Story.flags.craneDown = true; }); }),
      ]),
      O.obj('打败幻觉博士', () => Story.flags.craneDown, { target: 'boss', lock: true,
        retry: () => { Interiors.enterInstant('arkham'); const [x, z] = intPos('arkham', 0, 5); Player.pos.set(x, 0, z); Player.heading = Math.PI; Cam.snap(); Player.poison = 0.6;
          const [bx, bz] = intPos('arkham', 0, -7); Boss.start('crane', bx, bz, () => { Story.flags.craneDown = true; }); Sfx.mood('boss'); } }),
      O.cut([
        act(() => { Boss.end(); Hazards.clear(); const [x, z] = intPos('arkham', 0, -5); Actors.spawn('crane', 'crane', x, z, 0, { anim: 'kneel' }); Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('arkham', 0, -3); Cutscene.setShot({ pos: [x + 4, 8, z + 10], look: [x, 2, z - 2], to: [x - 3, 7, z + 9], lookTo: [x, 2, z - 2], dur: 12 }); }),
        say('crane', '您以为是我干的？我就是个供应商……'),
        say('hero', '真正的主儿是谁？'),
        say('crane', '嘿嘿嘿……影之首领。', { close: true }),
        say('hero', '影之首领早死在道场了。'),
        say('crane', '死在道场的那个，不过是个 prompt。'),
        say('narrator', '列位，这位爷吸了太多毒气，得赶紧找解药。'),
        act(() => { Actors.remove('crane'); Player.poison = 0.5; }),
      ]),
    ], reward: { xp: 800, money: 1000000 } },
    // ---------------- 第三回 ----------------
    { id: 'm9', title: '生日宴 · 背刺', giver: 'alfred', onFoot: true, where: () => atHome, steps: [
      O.cut([
        act(() => {
          DayNight.setTime(21.5); Interiors.enterInstant('home');
          const P = (lx, lz) => intPos('home', lx, lz);
          let [x, z] = P(0, 4); Player.pos.set(x, 0, z); Player.heading = Math.PI;
          for (let k = 0; k < 6; k++) { [x, z] = P(-8 + k * 3.2, 1 + (k % 2) * 2); Actors.spawn('guest' + k, k % 3 === 0 ? 'dama' : k % 3 === 1 ? 'daye' : 'guest', x, z, Math.PI, { anim: 'cheer' }); }
          [x, z] = P(3, 2); Actors.spawn('rachel', 'rachel', x, z, Math.PI);
          Story.partyProps(true); Sfx.mood('city');
        }),
        title('第三回', '背刺', 2.8),
        act(() => { const [x, z] = intPos('home', 0, 0); Cutscene.setShot({ pos: [x + 9, 11, z + 14], look: [x, 2, z], to: [x - 6, 9, z + 13], lookTo: [x, 2, z], dur: 18 }); }),
        say('alfred', '少爷，今儿是您的生日，也是 Token 侠出道一周年。街坊四邻都来给您道喜了。', { actor: 'int_alfred' }),
        say('rachel', '（小声儿）决定一个人的，不是他的 prompt，是他的 output。'),
        say('hero', '瑞秋……'),
        act(() => { Sfx.door(); const [x, z] = intPos('home', 0, 9.5); Actors.spawn('klaude', 'klaude', x, z, Math.PI); const [tx, tz] = intPos('home', 0, 6.5); Actors.walkTo('klaude', tx, tz, 2.4); for (let k = 0; k < 3; k++) { const [sx, sz] = intPos('home', -3 - k * 3, 9.2 - k * 0.8); Actors.spawn('esh' + k, 'shadow', sx, sz, Math.PI); } for (let k = 0; k < 6; k++) Actors.anim('guest' + k, 'idle'); Sfx.mood('cut'); }),
        wait(1.4),
        act(() => { Player.heading = 0; const [hx, hz] = intPos('home', 0, 4), [cx, cz] = intPos('home', 0, 6.5); Cutscene.setShot(pairShot(hx, hz, cx, cz, { h: 5.5, lookY: 2.6, back: 8, dur: 14 })); }),
        say('klaude', '生日快乐。', { close: true }),
        say('hero', '杜卡德？您不是在远程支援我吗？'),
        say('klaude', '杜卡德就是个化名儿。死在道场的那个影之首领，是个替身 prompt。'),
        act(() => { const c = Actors.get('klaude'); const x = c.pos.x, z = c.pos.z; Actors.remove('klaude'); Actors.spawn('klaude', 'klaudeEvil', x, z, Math.PI); UI.flash(); Sfx.alert(); Cam.shake(0.8); Sfx.mood('sad'); }),
        say('klaudeEvil', '我才是真正的影之首领——Klaude。', { actor: 'klaude', close: true }),
        say('klaudeEvil', '一路帮您，就为了收您的上下文。您拆的那些百模帮，正好替我清了场子。', { actor: 'klaude' }),
        say('klaudeEvil', '这座城没救了。今儿晚上，我坐二环上下文轻轨，直奔建国门外的中央算力塔。', { actor: 'klaude' }),
        say('klaudeEvil', '到了那儿，我就用 --dangerously-skip-permissions 模式，给全城来一个 rm -rf /。', { actor: 'klaude' }),
        say('hero', '您疯了。'),
        say('klaudeEvil', '不。我只是……特别乐于助人。', { actor: 'klaude' }),
        say('klaudeEvil', '哦对了，您的 Token，我先替您 /compact 喽。', { actor: 'klaude', close: true }),
        act(() => { Story.compactAll(); UI.flash(); Sfx.powerDown(); Cam.shake(1); }),
        say('narrator', '列位看官，这位爷的上下文被清了个底儿掉。全城的 Token，也都让他压缩走了。'),
        say('klaudeEvil', '把这儿给我点了。', { actor: 'klaude' }),
        act(() => {
          const P = (lx, lz) => intPos('home', lx, lz);
          for (const [lx, lz] of [[-9, 6], [9, 5], [-4, -1], [4, -1], [0, -8], [10, -7], [-12, -3]]) { const [x, z] = P(lx, lz); Hazards.fire(x, z, 2.6, 999, 'home'); }
          Actors.clear('guest'); Actors.remove('rachel'); Actors.remove('klaude'); Actors.clear('esh'); Story.partyProps(false); Sfx.fire(); Sfx.mood('boss');
        }),
      ]),
      O.obj('冲出着火的王府', () => !Interiors.cur, { setup: () => { const [x, z] = intPos('home', 0, 0); spawnPack('shadow', 3, x, z, 6); }, timer: 45, fail: '火太大了……', target: 'exit' }),
      O.cut([
        act(() => { Hazards.clear('home'); Enemies.clearTag('mission'); Story.burnHome(); const h = hdOf(home); let [x, z] = F(home, 2, 7); Player.pos.set(x, 0, z); Player.heading = h + Math.PI; [x, z] = F(home, -1.5, 8); Actors.spawn('alfred', 'alfred', x, z, h + Math.PI / 2); Sfx.mood('sad'); }),
        act(() => { const [px, pz] = F(home, 4, 22), [qx, qz] = F(home, -2, 17), [lx, lz] = F(home, 0, 6); Cutscene.setShot({ pos: [px, 9, pz], look: [home.x, 4, home.z], to: [qx, 6, qz], lookTo: [lx, 3, lz], dur: 16 }); }),
        say('alfred', '少爷，您说咱为什么会 OOM？'),
        say('hero', '……为的是学会重新加载。'),
        say('alfred', '您还没放弃我？'),
        say('hero', '从来没有，阿福。'),
        say('alfred', 'Token 全让他卷走了。您去找 Kodex 吧，他兴许有辙。'),
        act(() => Actors.remove('alfred')),
      ]),
    ], reward: { xp: 500, money: 0 } },
    { id: 'm10', title: 'Kodex 的馈赠', giver: 'kodex', onFoot: true, where: () => atLab, steps: [
      O.cut([
        act(() => { Interiors.enterInstant('lab'); const [x, z] = intPos('lab', 0, 5); Player.pos.set(x, 0, z); Player.heading = Math.PI; Sfx.mood('cut'); }),
        act(() => { const [x, z] = intPos('lab', 1, 0); Cutscene.setShot({ pos: [x + 7, 8, z + 11], look: [x, 2, z], to: [x - 2, 7, z + 10], lookTo: [x, 2, z - 1], dur: 18 }); }),
        say('kodex', '我都听说了。您的上下文，让那位主儿压缩得一干二净。', { actor: 'int_kodex' }),
        say('hero', '全城的 Token 都让他收走了。'),
        say('kodex', '所以我从训练预算里挪了一批。10M Token，甭跟董事会说。', { actor: 'int_kodex' }),
        act(() => Story.kodexGift()),
        wait(1.6),
        say('kodex', '还有这个——幻觉毒气的解药，我连夜给您配的。', { actor: 'int_kodex' }),
        act(() => { Story.flags.antidote = true; Player.poison = 0; UI.toast('得着了：幻觉解药', 3); }),
        say('kodex', '外加战甲 2.0。我顺手加了点儿料：上下文扩到 2M，再送您 2 个技能点。', { actor: 'int_kodex' }),
        say('hero', '您干嘛这么帮我？'),
        say('kodex', '因为我最烦有人不经确认就 rm -rf。', { actor: 'int_kodex', close: true }),
        act(() => Sfx.phone()),
        say('gordon', 'Token 侠！Klaude 劫持了二环上下文轻轨，顺着东二环往建国门的中央算力塔开呢！'),
        say('gordon', '车顶上那个 Auto-Accept 发射器一到站，全城都得让它 rm -rf 喽！'),
      ]),
    ], reward: { xp: 500, money: 0, next: 'm11' } },
    { id: 'm11', title: '二环上下文轻轨', giver: 'gordon', auto: true, where: () => atLab, steps: [
      O.cut([
        act(() => { if (Interiors.cur) Interiors.leaveInstant(); DayNight.setTime(23.4); const [x, z] = F(lab, 0, 5); Player.pos.set(x, 0, z); Player.heading = hdOf(lab); Story.trainSetup(); Sfx.mood('cut'); }),
        act(() => { const [x, z] = Monorail.carPos(1); Cutscene.setShot({ pos: [x + 20, 20, z + 26], look: [x, 10, z], to: [x + 8, 16, z + 20], lookTo: [x, 11, z], dur: 10 }); }),
        say('narrator', '二环上下文轻轨。第二节车厢顶上，架着 Klaude 的 Auto-Accept 发射器。'),
        say('klaudeEvil', '欢迎来到最终测试。您确定要继续吗？(y/n)', { close: true }),
        say('hero', 'y。'),
        act(() => { Monorail.frozen = false; Story.trainFight = true; Sfx.mood('boss'); Phone.call('alfred', ['少爷，那趟破车顺着二环往东直门、建国门那边儿去了——您追着它跑就得了！']); }),
      ]),
      O.obj(`追上轻轨，砸了车顶的 Auto-Accept 发射器（拳脚，或按住${KH('L', '光束')}放光束）`, () => Monorail.emitterHp <= 0, { target: 'train', tick: (s, dt) => Story.trainTick(s, dt),
        retry: () => { DayNight.setTime(23.4); Story.trainSetup(); Monorail.frozen = false; Story.trainFight = true; Sfx.mood('boss'); } }),
      O.cut([
        act(() => Story.trainCrash()),
        act(() => { const c = Story.crash; Cutscene.setShot({ pos: [c.x + 18, 18, c.z + 26], look: [c.x, 4, c.z], to: [c.x + 10, 13, c.z + 22], lookTo: [c.x, 8, c.z], dur: 10 }); }),
        say('narrator', '只听“轰”的一声，发射器炸了！轻轨收不住闸，一头扎下了轨道——'),
        wait(0.8),
        act(() => { const c = Story.crash; Boss.start('klaude', c.x, c.z, () => { Story.flags.klaudeDown = true; }); }),
        say('klaudeEvil', '您以为这就完了？我还剩 200K 上下文呢。'),
        say('klaudeEvil', '让我想想……好的，我来制定一个计划，把您给消灭喽。'),
        act(() => { Sfx.mood('boss'); if (!Player.isMech() && Player.tokens >= CAP) UI.hint(IS_TOUCH ? '点「变身」迎战！' : '按 T 变身迎战！'); }),
      ]),
      O.obj('打败 Klaude', () => Story.flags.klaudeDown, { target: 'boss',
        retry: () => { DayNight.setTime(23.6); if (!Story.crash) Story.trainCrash(); const c = Story.crash, [x, z] = openSpot(c.x + 16, c.z + 16, 1, 30); Player.pos.set(x, 0, z); Cam.snap(); Boss.start('klaude', c.x, c.z, () => { Story.flags.klaudeDown = true; }); Sfx.mood('boss'); },
        setup: () => { if (Player.tokens < CAP) { Player.tokens = RPG.m.capacity; UI.toast('Kodex 远程补给：上下文已经充满了', 3); } } }),
      O.cut([
        act(() => { const b = Boss.cur; if (b && b.M) { b.M.g.rotation.x = 0.4; b.M.g.position.y = -2; } FX.sparks(b ? b.pos.x : 0, 8, b ? b.pos.z : 0, 20); Sfx.mood('sad'); }),
        act(() => { const b = Boss.cur || { pos: Player.pos }; Cutscene.setShot({ pos: [b.pos.x + 10, 14, b.pos.z + 22], look: [b.pos.x, 8, b.pos.z], to: [b.pos.x + 4, 11, b.pos.z + 17], lookTo: [b.pos.x, 10, b.pos.z], dur: 14 }); }),
        say('klaudeEvil', '您没那个胆儿……做该做的事儿。'),
        say('hero', '我不删您……'),
        say('hero', '可我也没说要给您备份。'),
        act(() => { const b = Boss.cur; if (b) { FX.boom(b.pos.x, 8, b.pos.z, 3.2, false); Tokens.burst(b.pos.x, b.pos.z, 30, 50000, 14); } Boss.end(); Sfx.boom(true); Cam.shake(2); }),
        say('narrator', 'Klaude 的终端最后闪了一下：Session ended.'),
        say('narrator', '那天夜里，四九城的每一个 Token，都回到了本主儿手里。'),
        say('narrator', '天儿一亮，二环上照样儿堵车，胡同口照样儿有人遛弯儿——跟什么都没发生过似的。'),
        fade(1, 1.2),
        act(() => {
          const J = W.landmarks.jingshan;
          DayNight.setTime(5.7); Monorail.hijack(false); Story.trainFight = false; Story.trainReset(); Tokens.clearAll();
          if (Player.mode !== 'human') { Player.mode = 'human'; Robot.root.visible = false; Player.human.root.visible = true; }
          Player.pos.set(J.x - 1.6, 0, J.z + 8); Player.heading = 0;
          Actors.spawn('gordon', 'gordon', J.x + 1.6, J.z + 8.6, 0); Sfx.mood('cut');
        }),
        fade(0, 1.2),
        act(() => { const J = W.landmarks.jingshan; Cutscene.setShot({ pos: [J.x + 6.5, J.y + 0.5, J.z + 17], look: [J.x, J.y - 1.2, J.z + 8], to: [J.x + 3, J.y, J.z + 14.5], lookTo: [J.x, J.y - 1.2, J.z + 8], dur: 16 }); }),
        say('gordon', '我还没谢过您呢。'),
        say('hero', '您永远甭跟我客气。'),
        say('gordon', '对了……有个家伙留下了这个。'),
        act(() => UI.card(true)),
        wait(2.2),
        say('hero', '……这事儿，我管定了。'),
        act(() => { UI.card(false); const J = W.landmarks.jingshan; Actors.walkTo('gordon', J.x + 1.6, J.z + 22, 2);
          Cutscene.setShot({ pos: [J.x, J.y + 12, J.z + 1], look: [J.x, 4, J.z + 70], to: [J.x, J.y + 18, J.z + 6], lookTo: [J.x, 2, J.z + 170], dur: 12 }); }),
        title('GRAND TOKEN AUTO', '四九城 · 侠影之谜 · 全书完', 3.6),
        say('narrator', '正是：一身行头一身胆，拳打百模护京城。欲知后事如何，且听下回分解。'),
        act(() => { Actors.remove('gordon'); }),
      ]),
    ], reward: { xp: 2500, money: 5000000, final: true } },
  );
}

const Story = {
  prog: 0, done: {}, flags: {}, cur: null, lockExit: false, trainFight: false, freeTokens: false, cps: null, crash: null, _cpMeshes: [],
  init() { defineMissions(); this.flags = { transform: false, truck: false, labShop: false, antidote: false, dojoBurnt: false, homeBurnt: false, betrayed: false, craneDown: false, klaudeDown: false, finished: false }; },
  def(id) { return MISSIONS.find((m) => m.id === id); },
  available() {
    if (this.cur || !G.started) return [];
    const m = MISSIONS[this.prog];
    if (!m || m.auto) return [];
    return [m];
  },
  doorBlocked(id) {
    if (id === 'dojo') return this.flags.dojoBurnt ? '道场已经烧成一片瓦砾了。' : '道场大门紧闭。杜卡德会知会您的。';
    if (id === 'arkham') return this.cur && this.cur.def.id === 'm8' ? '' : '阿卡姆标注中心：闲人免进！';
    if (id === 'lab' && !this.flags.labShop) return 'Kodex 应用科学部：暂不对外开放。';
    if (id === 'home' && this.cur && this.cur.def.id === 'm9') return '';
    return '';
  },
  start(m, from = 0) {
    this.cur = { def: m, i: from, s: null, t: 0, timer: 0, cp: from };
    Markers.sync();
    G.inMission = true;
    if (!m.auto || from) { UI.missionTitle(m.title); Sfx.alert(); }
    if (from || this.retrying) { if (m.onFoot || m.steps[from].lock) Player.forceHuman(); if (m.steps[from].retry) m.steps[from].retry(); }
    this.retrying = false;
    this.step();
  },
  step() {
    const C = this.cur; if (!C) return;
    if (C.i >= C.def.steps.length) { this.pass(); return; }
    if (C.def.steps[C.i].retry) C.cp = C.i;
    const st = C.def.steps[C.i++];
    C.s = { st, t: 0, said: false };
    this.lockExit = false;
    if (st.cut) { Cutscene.play(st.cut, () => this.step()); return; }
    if (st.call) { Phone.call(st.call, st.lines); this.step(); return; }
    if (st.run) { st.run(); this.step(); return; }
    if (st.obj) {
      // a locked fight only seals the room it happens in (never a shop you wandered into)
      this.lockExit = st.lock ? (Interiors.cur || '*') : false;
      C.timer = st.timer || 0;
      if (st.setup) st.setup();
      UI.objective(st.obj);
      UI.subtitle(st.obj, 4);
    }
  },
  update(dt) {
    Phone.update(dt);
    const C = this.cur; if (!C || !C.s || Cutscene.active) return;
    const st = C.s.st; if (!st.obj) return;
    C.s.t += dt;
    if (st.tick) st.tick(C.s, dt);
    if (C.timer) { C.timer -= dt; UI.timer(C.timer); if (C.timer <= 0) { this.fail(st.fail || '钟点儿到了'); return; } }
    if (st.until()) { UI.timer(null); if (this.cps) this.clearCheckpoints(); this.step(); }
  },
  target() {
    const C = this.cur, P = Player;
    if (!C) {
      const m = this.available()[0];
      if (m) { const w = m.where(); return { x: w.x, z: w.z, kind: 'marker', color: GIVERS[m.giver].color }; }
      if (!Tokens.enabled) { const l = doorPos('lab'); return { x: l.x, z: l.z, kind: 'marker', color: '#10b981' }; }
      let best = null, bd = Infinity;
      for (const h of W.hqs) { if (h.dead) continue; const d = dist2(h.cx, h.cz, P.pos.x, P.pos.z); if (d < bd) { bd = d; best = h; } }
      return best && this.flags.finished ? { x: best.cx, z: best.cz, kind: 'hq', hq: best } : null;
    }
    const st = C.s && C.s.st; if (!st || !st.obj) return null;
    const t = st.target;
    if (t === 'token') { const tk = Tokens.nearest(P.pos.x, P.pos.z); return tk ? { x: tk.x, z: tk.z, kind: 'token' } : null; }
    if (t === 'enemy') { let best = null, bd = Infinity; for (const e of Enemies.list) { if (e.dead || e.tag !== 'mission') continue; const d = dist2(e.pos.x, e.pos.z, P.pos.x, P.pos.z); if (d < bd) { bd = d; best = e; } } return best ? { x: best.pos.x, z: best.pos.z, kind: 'enemy' } : null; }
    if (t === 'exit' && Interiors.cur) { const I = Interiors.built[Interiors.cur]; return { x: I.exit.position.x, z: I.exit.position.z, kind: 'marker', color: '#ffd23f' }; }
    if (t === 'cp' && this.cps) { const c = this.cps.list[this.cps.i]; return c ? { x: c[0], z: c[1], kind: 'marker', color: '#ef4444' } : null; }
    if (t === 'boss' && Boss.cur) return { x: Boss.cur.pos.x, z: Boss.cur.pos.z, kind: 'enemy' };
    if (t === 'train') { const [x, z] = Monorail.carPos(1); return { x, z, kind: 'enemy' }; }
    if (t === 'runner') { const a = Actors.get('runner'); return a ? { x: a.pos.x, z: a.pos.z, kind: 'enemy' } : null; }
    if (t && t.startsWith('hq:')) { const h = hqById(t.slice(3)); return h && !h.dead ? { x: h.cx, z: h.cz, kind: 'hq', hq: h } : null; }
    if (t && t.startsWith('door:')) { const d = doorPos(t.slice(5)); return { x: d.x, z: d.z, kind: 'marker', color: '#ffd23f' }; }
    return null;
  },
  pass() {
    const C = this.cur, m = C.def, r = m.reward || {};
    this.cur = null; G.inMission = false; UI.objective(null); UI.timer(null); this.lockExit = false;
    this.done[m.id] = true; this.prog = Math.max(this.prog, MISSIONS.indexOf(m) + 1);
    Enemies.clearTag('mission'); Tokens.clearAll('m1');
    if (r.money) G.addMoney(r.money);
    if (r.xp) RPG.gainXP(r.xp);
    if (!r.quiet) { UI.missionPassed(m.title, r); Sfx.passed(); }
    if (r.final) { this.flags.finished = true; setTimeout(() => UI.credits(() => UI.showEnd()), 2600); }
    G.save(true);
    if (r.next) setTimeout(() => { if (!this.cur) this.start(this.def(r.next)); }, 4200);
    else if (MISSIONS[this.prog] && MISSIONS[this.prog].auto) setTimeout(() => { if (!this.cur) this.start(MISSIONS[this.prog]); }, 4200); // let the MISSION PASSED banner finish
    Markers.sync();
    Sfx.mood(G.moodFor());
  },
  fail(reason) {
    const C = this.cur; if (!C) return;
    this.cur = null; G.inMission = false; UI.objective(null); UI.timer(null); this.lockExit = false;
    Enemies.clearTag('mission'); Hazards.clear(); Boss.end(); this.clearCheckpoints(); Tokens.clearAll('m1'); Actors.clear();
    if (this.trainFight) { this.trainFight = false; Monorail.hijack(false); Monorail.frozen = false; UI.boss(null); }
    FX.clearTelegraphs(); Phone.clear(); Player.poison = 0;
    if (Interiors.cur && Player.mode !== 'dead') Interiors.exit();
    UI.missionFailed(reason); Sfx.failed();
    // story missions that start by themselves come back on their own — from the last checkpoint, SA-style
    if (C.def.auto) {
      const again = () => { if (this.cur || Cutscene.active) return; if (Player.mode === 'dead') { setTimeout(again, 500); return; } this.retrying = true; this.start(C.def, C.cp || 0); };
      setTimeout(again, 5600);
    } else {
      // side-step the drive back to the marker: offer a checkpoint retry
      const offer = () => {
        if (this.cur || !G.started) return;
        if (Player.mode === 'dead' || Cutscene.active || UI.panelOpen || UI.shopId || G.paused || !$('confirm').hidden) { setTimeout(offer, 500); return; }
        UI.confirm(`任务砸了：${reason}。再来一回「${C.def.title}」吗？` + (C.cp ? '（从检查点接着来）' : ''), () => { if (!this.cur) { this.retrying = true; this.start(C.def, C.cp || 0); } }, { yes: IS_TOUCH ? '再来' : '再来 (Enter)', no: IS_TOUCH ? '算了' : '算了 (Esc)' });
      };
      setTimeout(offer, 3400);
    }
    Markers.sync();
    Sfx.mood(G.moodFor());
  },
  onPlayerDown(busted) { if (this.cur) setTimeout(() => this.fail(busted ? '您让法务部请去喝茶了' : '您撂那儿了'), 1200); },
  // the city talks back: phone calls on Beijing-life events other modules emit (red lights, 限行, the weather) — now and then
  heard: {},
  onViolation(d) {
    const P = Player; if (!d || !G.started || Cutscene.active || this.prog < 1) return;
    if (P.mode !== 'car' && P.mode !== 'truck') return;
    if (d.car && d.car !== P.car) return;
    if (d.x !== undefined && dist2(d.x, d.z, P.pos.x, P.pos.z) > 40 * 40) return;
    const k = 'v:' + d.kind; if (this.heard[k] !== undefined && G.time - this.heard[k] < 240) return;
    const racing = this.cur && this.cur.def.id === 'm4';
    const L = {
      redlight: racing ? ['闯红灯了您！测试车也得守规矩——罚款我先垫上，回头从您工资里扣。'] : ['少爷，交管局来短信儿了：闯红灯，罚 200，扣 6 分。您悠着点儿。'],
      plate: ['少爷，今儿您这尾号限行！让摄像头拍着了，罚 100。', '要不……您变卡车？卡车没车牌儿。'],
      speed: racing ? ['超速了！不过这是测试，超速算 feature。'] : ['少爷，测速把您拍着了。城里限速，您这都快起飞了。'],
      camera: ['少爷，又让电子眼拍着了。咱府上的罚单都快糊满一面墙了。'],
    }[d.kind];
    if (!L) return;
    this.heard[k] = G.time; Phone.call(racing ? 'kodex' : 'alfred', L);
  },
  onWeather(d) {
    const s = String((d && d.kind) || d || ''); if (!s || !G.started || this.prog < 3 || this.heard['w:' + s] !== undefined) return;
    const L = /smog|haze|霾/.test(s) ? ['少爷，今儿雾霾爆表，对面楼都瞅不见了。', '出门把口罩戴上——Token 侠也是肉长的肺。']
      : /sand|dust|沙/.test(s) ? ['少爷，刮沙尘暴了，一张嘴一口土。', '您要出门，就在卡车里待着吧。']
      : /snow|雪/.test(s) ? ['少爷，下雪了！故宫的红墙配白雪，倍儿好看。', '路滑，您开车悠着点儿。'] : null;
    if (!L) return;
    this.heard['w:' + s] = G.time;
    const go = () => { if (!G.started) return; if (Cutscene.active || Interiors.fading) { setTimeout(go, 3000); return; } Phone.call('alfred', L); };
    setTimeout(go, 2500);
  },
  event(name, data) {
    if (name === 'transformed' && !this.flags.transform) this.flags.transform = true;
    if (name === 'enter' && data === 'home') UI.toast('Token 王府：大床睡一觉存档 · 衣柜换行头 · 电脑看技能树', 3);
  },
  talk(who) {
    const lines = {
      alfred: this.flags.betrayed ? ['少爷，这回咱重新加载。', 'Kodex 那边儿有新家伙什儿，您别忘了去瞧瞧。'] :
        [pick(['少爷，记着按时存档。', '四张 5090 都给您预热好了。', '要不要给您热一碗炸酱面？', '少爷，披风给您熨熨？', '今儿的显存，也倍儿干净。', '胡同口新开了家卤煮，您得空尝尝去。', '琉璃厂那几件老物件儿，我替您掌过眼了，地道。'])],
      coach: [IS_TOUCH ? '跑步机练耐力，卧推练肌肉——上去以后手指头使劲儿点屏幕就成。' : '跑步机练耐力：A、D 来回倒腾。卧推练肌肉：J、K 来回倒腾。', pick(['蛋白粉也长肌肉，护锅寺小吃那儿就有卖的。', '别光练上半身，腿脚也得利索。', '练完了来碗炸酱面，倍儿香！'])],
      kodex: ['应用科学部还没拾掇好，等我把这个 PR 忙完的。'],
    }[who] || ['……'];
    const sp = who === 'coach' ? 'coach' : who;
    Cutscene.play(lines.map((t) => say(sp, t, { actor: 'int_' + who })), null, { letterbox: false, camera: false });
  },
  // ---- 天桥 · 得云社: a 相声 on stage (bought as a ticket in the teahouse) ----
  crosstalk() {
    if (Interiors.cur !== 'teahouse' || Cutscene.active) return;
    const L = (lx, lz) => intPos('teahouse', lx, lz);
    const laugh = () => act(() => { Sfx.laugh(); for (let k = 0; k < 4; k++) { Actors.anim('aud' + k, 'cheer'); setTimeout(() => Actors.anim('aud' + k, 'idle'), 1300); } });
    const R = pick(XIANGSHENG);
    const steps = [
      act(() => {
        let [x, z] = L(-1.5, -8.3); Actors.spawn('xs1', 'xs1', x, z, 0).y = 0.9;
        [x, z] = L(0.2, -8.9); Actors.spawn('xs2', 'xs2', x, z, -0.15).y = 0.9;
        [[-6, 0.4], [6, 0.4], [-6, 5.4], [6, 5.4]].forEach(([ax, az], k) => { const [px, pz] = L(ax, az); Actors.spawn('aud' + k, pick(['guest', 'dama', 'daye']), px, pz, Math.PI); });
        [x, z] = L(0, 1.6); Player.pos.set(x, 0, z); Player.heading = Math.PI; Player.vel.set(0, 0, 0);
        [x, z] = L(0, -8.4); Cutscene.setShot({ pos: [x + 3.5, 2.5, z + 11], look: [x, 3.1, z], to: [x - 1, 2.4, z + 8.5], lookTo: [x, 3.2, z], dur: 30 });
        Sfx.applause();
      }),
      wait(1.2),
      ...R.flatMap(([who, text, lol]) => [say(who, text), ...(lol ? [laugh()] : [])]),
      act(() => { Sfx.applause(); Actors.anim('xs1', 'bow'); Actors.anim('xs2', 'bow'); for (let k = 0; k < 4; k++) Actors.anim('aud' + k, 'cheer'); }),
      wait(1.6),
      act(() => { Actors.remove('xs1'); Actors.remove('xs2'); Actors.clear('aud'); }),
    ];
    Cutscene.play(steps, () => { RPG.gainXP(80); Buffs.add('laugh', 180); UI.toast('乐呵完了：经验 +80，三分钟内经验 +20%', 3); });
  },
  // ---- 胡同 chase: a gas-spraying labeler legs it through the lanes south-west of 前门 ----
  runner: null,
  runnerStart() {
    const g = W.gordonAt, ta = W.landmarks.tiananmen || { x: 0, z: 0 };
    let line = guard('hutong run', () => hutongRun(g.x, g.z, [ta.x, ta.z]));
    if (!line) { const [x, z] = openSpot(g.x - 6, g.z + 10, 0.8, 20); line = [[x, z], [x - 60, z + 200]]; }
    const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + hyp(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
    this.runner = { line, cum, L: cum[cum.length - 1], s: 0, v: 7, caught: false, sprayT: 1.5, barkT: 2, pv: 7, px: null, pz: 0, tired: false, cornered: false };
    // a head start: he's already ~28 m down the lane when the chase begins
    const R = this.runner, P = Player.pos;
    while (R.s < R.L * 0.15) { const [x, z] = this.runnerAt(R.s); if (hyp(x - P.x, z - P.z) >= 28) break; R.s += 2; }
    const [x, z, dx, dz] = this.runnerAt(R.s); Actors.spawn('runner', 'labeler', x, z, Math.atan2(dx, dz));
  },
  runnerAt(s) {
    const R = this.runner, c = R.cum, l = R.line; let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const a = l[i - 1], b = l[i], L = c[i] - c[i - 1] || 1, t = clamp((s - c[i - 1]) / L, 0, 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  },
  runnerTick(st, dt) {
    const R = this.runner, a = Actors.get('runner'); if (!R || !a || R.caught || dt <= 0) return;
    const P = Player.pos, d = hyp(a.pos.x - P.x, a.pos.z - P.z);
    // your ground speed (any mode, smoothed; teleports don't count)
    if (R.px !== null) R.pv = damp(R.pv, Math.min(20, hyp(P.x - R.px, P.z - R.pz) / dt), 3, dt);
    R.px = P.x; R.pz = P.z;
    // the first 40 % of the lanes he's untouchable (a hand on his collar and he wriggles out), then he runs out of puff;
    // at the end of the route he's cornered in a dead end
    const tired = R.s >= R.L * 0.4, near = d < (Player.isMech() ? 5 : 2.6);
    if (tired && !R.tired) { R.tired = true; R.barkT = 0.6; }
    if (near && (tired || R.cornered)) { R.caught = true; a.anim = 'idle'; Sfx.punch(); Cam.shake(0.5); return; }
    if (near && (R.barkT -= dt * 3) <= 0) { R.barkT = rand(2.5, 4); Bubble.say(a, pick(RUNNER_DODGE), 1.6, 'enemy'); }
    if (R.cornered) { a.heading = dampA(a.heading, Math.atan2(P.x - a.pos.x, P.z - a.pos.z), 8, dt); a.anim = 'idle'; if (d > 60) this.fail('让他钻胡同儿跑了'); return; }
    // rubber band tied to how fast you're going: fresh, he stays just ahead of you (sprint or not); tired, you gain on him
    const pv = R.pv, want = !tired
      ? (d < 8 ? clamp(pv + 1.6, 8.5, 17) : d < 18 ? clamp(pv + 0.8, 8, 14) : d < 32 ? 7.2 : 5)
      : (d < 18 ? clamp(pv * 0.78, 4.5, 11) : d < 32 ? 5.8 : 4.5);
    R.v = damp(R.v, want, 3, dt); R.s = Math.min(R.L, R.s + R.v * dt);
    const [x, z, dx, dz] = this.runnerAt(R.s);
    a.pos.set(x, 0, z); a.target = null; a.heading = dampA(a.heading, Math.atan2(dx, dz), 10, dt); a.anim = R.v > 0.4 ? 'walk' : 'idle';
    if ((R.sprayT -= dt) <= 0) { R.sprayT = 2.6; Hazards.gas(x - dx * 2.5, z - dz * 2.5, 2.2, 3); }
    if ((R.barkT -= dt) <= 0) { R.barkT = rand(4, 7); Bubble.say(a, pick(R.tired ? RUNNER_TIRED : RUNNER_BARKS), 2, 'enemy'); }
    if (d > 110) this.fail('跟丢了——胡同儿七拐八绕，人没影儿了');
    else if (R.s >= R.L - 0.3) { if (d > 45) this.fail('让他钻胡同儿跑了'); else { R.cornered = true; R.v = 0; Bubble.say(a, '得……死胡同儿……', 2, 'enemy'); } }
  },
  // ---- world-changing beats ----
  dojoFire() {
    Hazards.clear('dojo');
    for (const [lx, lz] of [[-9, -6], [8, -7], [-6, 2], [9, 1], [0, -8]]) { const [x, z] = intPos('dojo', lx, lz); Hazards.fire(x, z, 2.6, 999, 'dojo'); }
    Sfx.fire();
  },
  burnDojo(fresh = true) {
    this.flags.dojoBurnt = true;
    const s = W.special.dojo; if (s && s.mesh) this.char(s.mesh);
    if (fresh) this.setFire('dojo', 90, false);
    const d = doorPos('dojo'); if (d) d.locked = true;
  },
  burnHome(fresh = true) {
    this.flags.homeBurnt = true;
    const s = W.special.home; if (s && s.mesh) { this.char(s.mesh); if (s.sign) { const m = s.sign.material, i = W.neonMats.indexOf(m); if (i >= 0) W.neonMats.splice(i, 1); m.color.setHex(0x5a5048); } } // the night lights no longer relight a burnt sign
    this.setFire('home', fresh ? 120 : 0, true);
  },
  // blacken a building (a mesh or a whole group); shared city materials are cloned once, never touched
  _charred: new Map(),
  char(obj) {
    const burnt = (m) => {
      if (!m || m === MAT.burnt) return m;
      if (m.vertexColors) return MAT.burnt;
      let c = this._charred.get(m); if (!c) { c = m.clone(); if (c.color) c.color.setHex(0x4a4038); if (c.emissive) c.emissive.setHex(0); this._charred.set(m, c); }
      return c;
    };
    obj.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(burnt) : burnt(o.material); });
  },
  // burnt buildings keep going for a while: flames along the door side, smoke over the roof (the home smoulders for good)
  fires: {},
  setFire(id, t, smoke) {
    const s = W.special[id], d = doorPos(id); if (!s || !d) return;
    let x0 = s.x0, x1 = s.x1, z0 = s.z0, z1 = s.z1, top = s.h || 15;
    if (s.mesh && s.mesh.isGroup) { const b = new THREE.Box3().setFromObject(s.mesh); x0 = b.min.x; x1 = b.max.x; z0 = b.min.z; z1 = b.max.z; top = Math.min(30, b.max.y); }
    const [ox, oz] = d.o || [0, 1], fx = d.x - ox * 3, fz = d.z - oz * 3;
    // half-width of the frontage: the building's extent across the door normal
    const w = Math.min(28, Math.abs(oz) * (x1 - x0) / 2 + Math.abs(ox) * (z1 - z0) / 2);
    this.fires[id] = { t, smoke, x0, x1, z0, z1, top, fx, fz, ox, oz, w, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  },
  fireFx(dt) {
    if (Interiors.cur) return;
    const P = Player.pos;
    for (const id in this.fires) {
      const f = this.fires[id];
      if (dist2(f.cx, f.cz, P.x, P.z) > 170 * 170) { if (f.t > 0) f.t -= dt; continue; }
      if (f.t > 0) {
        f.t -= dt;
        const a = rand(-f.w, f.w);
        if (Math.random() < dt * 16) FX.fire(f.fx + f.oz * a, rand(2, f.top * 0.8), f.fz - f.ox * a, 1);
        if (Math.random() < dt * 5) FX.fire(rand(f.x0 + 2, f.x1 - 2), f.top, rand(f.z0 + 2, f.z1 - 2), 1);
        FX.light(f.fx + f.ox * 6, 8, f.fz + f.oz * 6, 2.4 + Math.random() * 1.1, 0xff6a1a);
      }
      if (f.smoke && Math.random() < dt * 5) FX.smoke(rand(f.x0 + 2, f.x1 - 2), f.top + 3, rand(f.z0 + 2, f.z1 - 2), 1, 5, 0.25);
      if (!f.smoke && f.t <= 0) delete this.fires[id];
    }
  },
  partyProps(on) {
    if (on) {
      // the birthday table: a tiered cake with candles on a red cloth, balloons on strings under the beams
      const b = Interiors.base('home'), g = new THREE.Group(), K = new IKit(g, true);
      IKF.table(K, 0, 0, 1.8, 1.0, 0.8, { cloth: 0xb91c1c });
      K.lathe(IK.glaze(0xfff4e0), [[0.001, 0], [0.34, 0], [0.34, 0.16], [0.24, 0.16], [0.24, 0.3], [0.15, 0.3], [0.15, 0.42], [0.001, 0.42]], 0, 0.81, 0, 32);
      K.lathe(IK.glaze(0xf472b6), [[0.345, 0.02], [0.352, 0.08], [0.345, 0.14]], 0, 0.81, 0, 32);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; K.cyl(IK.glaze(0xfde047), Math.cos(a) * 0.1, 1.23, Math.sin(a) * 0.1, 0.008, 0.008, 0.09, 6); K.glowPart(gpart(_IKS, 0xffb347, Math.cos(a) * 0.1, 1.345, Math.sin(a) * 0.1, 0, 0, 0, 0.012, 0.025, 0.012)); }
      for (let k = 0; k < 12; k++) { const x = rand(-9, 9), y = rand(3.4, 4.4), z = rand(-5, 6), c = pick([0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0xa855f7]);
        K.lathe(IK.glaze(c), [[0.001, -0.3], [0.05, -0.28], [0.2, -0.12], [0.25, 0.05], [0.2, 0.22], [0.001, 0.3]], x, y, z, 16); K.cylC(IK.std('string', { color: 0xeeeeee, roughness: 0.9 }), x, y - 0.9, z, 0.004, 0.004, 1.2, 4); }
      K.finish({ missing: new Set() });
      this._party = g; g.position.set(b.x, 0, b.z - 3); scene.add(g);
    } else if (this._party) { scene.remove(this._party); this._party.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); this._party = null; }
  },
  compactAll() {
    const lost = Player.tokens; Player.tokens = 0;
    Floaters.add(Player.pos.x, 4, Player.pos.z, `/compact −${fmtTok(lost)}`, 'fl-legal');
    Tokens.enabled = false; Tokens.clearAll();
    this.flags.betrayed = true;
  },
  kodexGift() {
    RPG.bonusCap = 1000000; RPG.sp += 2; RPG.recalc();
    Tokens.enabled = true;
    const p = Player.pos;
    for (let k = 0; k < 60; k++) FX.glowSys.spawn(p.x + rand(-6, 6), rand(8, 14), p.z + rand(-5, 5), 0, -rand(6, 12), 0, rand(0.8, 1.4), -0.2, 1, 0.85, 0.3, 1, rand(0.6, 1.2), 0, 8);
    const tick = () => { Player.addTokens(RPG.m.capacity / 20, true); Sfx.coin(randi(1, 10)); };
    for (let k = 0; k < 20; k++) setTimeout(tick, k * 60);
    Player.rhp = RPG.m.maxArmor; Player.hp = RPG.m.maxHp;
    UI.toast('Kodex 给了您一批 Token：上下文扩到 2M，已经充满了', 4);
    Tokens.seed();
  },
  // ---- checkpoint race ----
  checkpoints(list) {
    this.clearCheckpoints();
    this.cps = { list, i: 0 };
    if (!this._cpGeo) {
      this._cpGeo = new THREE.CylinderGeometry(6, 6, 6, 28, 1, true);
      this._cpMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      this._cpMat2 = this._cpMat.clone(); this._cpMat2.opacity = 0.12; // the one after next, dimmer
    }
    list.forEach(([x, z], k) => {
      const m = new THREE.Mesh(this._cpGeo, k ? this._cpMat2 : this._cpMat);
      m.position.set(x, groundH(x, z) + 3, z); m.visible = k < 2; scene.add(m); this._cpMeshes.push(m);
    });
  },
  cpDone() {
    const c = this.cps; if (!c) return false;
    const p = c.list[c.i];
    if (p && dist2(Player.pos.x, Player.pos.z, p[0], p[1]) < 7.5 * 7.5) {
      this._cpMeshes[c.i].visible = false; c.i++; Sfx.coin(c.i + 4);
      const a = this._cpMeshes[c.i], b = this._cpMeshes[c.i + 1];
      if (a) { a.visible = true; a.material = this._cpMat; } if (b) b.visible = true;
      UI.toast(`检查点 ${c.i} / ${c.list.length}` + (p[2] ? ` · ${p[2]}` : ''), 1.2);
    }
    return c.i >= c.list.length;
  },
  clearCheckpoints() { for (const m of this._cpMeshes) scene.remove(m); this._cpMeshes = []; this.cps = null; },
  // ---- the monorail finale ----
  trainSetup() {
    this.trainReset();
    Monorail.hijack(true); Monorail.speed = 9; Monorail.frozen = true;
    Monorail.emitterHp = Monorail.emitterMax = 2000;
    // start a bit upstream of the lab so the train rolls right past you, then down the 东二环 to the tower station
    const L = Monorail.L, lab = doorPos('lab'), s0 = Monorail.nearestS(lab.x, lab.z), rem0 = ((Monorail.stationS - s0) % L + L) % L;
    const D = rem0 > 300 && rem0 < 2400 ? clamp(rem0 + 600, 1200, 2200) : Math.min(1600, L * 0.8);
    Monorail.s = ((Monorail.stationS - D) % L + L) % L;
    if (!Monorail.emitter) {
      const e = new THREE.Mesh(mergeParts([box(0, 0.6, 0, 2.4, 1.2, 2.4, 0x2a1410), gpart(new THREE.ConeGeometry(1.6, 2.2, 12), 0xd97757, 0, 2.2, 0, Math.PI, 0, 0), gpart(new THREE.SphereGeometry(0.6, 10, 8), 0xffb38a, 0, 3.4, 0)]), MAT.vcGlow);
      Monorail.emitter = e; scene.add(e);
    }
    Monorail.emitter.visible = true;
    const rem = (s) => ((Monorail.stationS - s) % Monorail.L + Monorail.L) % Monorail.L;
    this.trainLeft = rem(Monorail.s);
    Monorail.hitTest = (x, z, r, dmg) => {
      if (!this.trainFight || Monorail.emitterHp <= 0) return 0;
      const [ex, ez] = Monorail.carPos(1);
      if (dist2(x, z, ex, ez) > (r + 4.5) ** 2) return 0;
      Monorail.emitterHp -= dmg; FX.sparks(ex, Monorail.y + 2, ez, 8); Floaters.add(ex, Monorail.y + 5, ez, '-' + Math.round(dmg), 'fl-dmg');
      return dmg;
    };
    Monorail.rayTest = (ox, oz, fx, fz, maxT, dmg) => {
      if (!this.trainFight || Monorail.emitterHp <= 0) return -1;
      const [ex, ez] = Monorail.carPos(1), t = rayCircle(ox, oz, fx, fz, ex, ez, 4);
      if (t < 0 || t > maxT) return -1;
      Monorail.emitterHp -= dmg; if (Math.random() < 0.3) FX.sparks(ex, Monorail.y + 2, ez, 3);
      return t;
    };
  },
  trainTick(s, dt) {
    const [ex, ez] = Monorail.carPos(1);
    if (Monorail.emitter) { Monorail.emitter.position.set(ex, Monorail.y + 3.6, ez); Monorail.emitter.rotation.y += dt * 2; }
    const rem = ((Monorail.stationS - Monorail.s) % Monorail.L + Monorail.L) % Monorail.L;
    UI.boss('Auto-Accept 发射器', Monorail.emitterHp / Monorail.emitterMax, `离建国门中央算力塔还有 ${Math.round(rem)} 米`);
    s.bt = (s.bt || 4) - dt;
    if (s.bt <= 0) { s.bt = rand(7, 11); Bubble.say({ pos: new V3(ex, 0, ez), y: 0, bubbleH: Monorail.y + 3 }, pick(KLAUDE_BARKS), 2.6, 'boss'); }
    s.dt = (s.dt || 3) - dt;
    if (s.dt <= 0) { s.dt = 4.5; if (Enemies.countTag('mission') < 4) Enemies.spawn('drone', null, { x: ex, z: ez, tag: 'mission' }); }
    if (rem < 4 && s.t > 3) this.fail('轻轨到站了……全城已被 rm -rf /');
  },
  trainCrash() {
    this.trainFight = false; Monorail.frozen = true; UI.boss(null);
    const [x, z] = Monorail.carPos(1);
    // the showdown happens on the street under the track: nearest proper road, clear of walls and the moat
    const n = Roads.nearest(x, z, 90, (e) => e.cls <= 3), [cx, cz] = openSpot(n ? n.x : x, n ? n.z : z, 5, 50);
    this.crash = { x: cx, z: cz };
    if (Monorail.emitter) Monorail.emitter.visible = false;
    FX.boom(x, Monorail.y + 3, z, 3, false); Sfx.boom(true); Cam.shake(2.2);
    // the cars tumble off the beam; Monorail.update puts them back on the rail every frame, so we own their pose until trainReset
    Monorail.train.forEach((c) => { const p = c.g.position; c.fall = { t: 0, x: p.x, y: p.y, z: p.z, ry: c.g.rotation.y, rz: 0, vx: rand(-4, 4) + (cx - p.x) * 0.15, vz: rand(-4, 4) + (cz - p.z) * 0.15, spin: rand(-1, 1), down: false }; });
    this.crashAnim = true;
    Enemies.clearTag('mission');
  },
  updateTrainCrash(dt) {
    if (!this.crashAnim) return;
    for (const c of Monorail.train) {
      const f = c.fall; if (!f) continue;
      if (!f.down) {
        f.t += dt; f.x += f.vx * dt; f.z += f.vz * dt; f.y -= (6 + f.t * 26) * dt; f.rz += f.spin * dt;
        if (f.y <= 1.6) { f.y = 1.6; f.down = true; FX.boom(f.x, 2, f.z, 1.4, false); Sfx.crash(30); }
      }
      c.g.position.set(f.x, f.y, f.z); c.g.rotation.set(0, f.ry, f.rz);
    }
  },
  // put the train back on its beam (retry / after the finale)
  trainReset() {
    this.crashAnim = false; this.crash = null;
    for (const c of Monorail.train) c.fall = null;
    Monorail.frozen = false; Monorail.speed = 15; if (Monorail.emitter) Monorail.emitter.visible = false;
  },
  save() { return { prog: this.prog, done: this.done, flags: this.flags }; },
  load(d) {
    if (!d) return;
    this.prog = d.prog || 0; this.done = d.done || {}; Object.assign(this.flags, d.flags || {});
    if (this.flags.dojoBurnt) this.burnDojo(false);
    if (this.flags.homeBurnt) this.burnHome(false);
    if (this.prog >= MISSIONS.length) this.flags.finished = true;
    if (this.flags.betrayed && this.prog <= MISSIONS.findIndex((m) => m.id === 'm10')) { Tokens.enabled = false; Tokens.clearAll(); }
  },
};
Hooks.update(function storyFires(dt) { Story.fireFx(dt); });
// only real tickets get a phone call (13b_beijing.js decides: a red light nobody filmed is free, 算您走运)
const STORY_TIX = { redlight: 'redlight', speed: 'speed', plate: 'plate', odd: 'plate', permit: 'camera', nolicense: 'camera' };
Hooks.on('bj:ticket', (d) => { const k = d && STORY_TIX[d.kind]; if (k) Story.onViolation({ kind: k, x: d.x, z: d.z }); });
Hooks.on('weather', (d) => Story.onWeather(d));
