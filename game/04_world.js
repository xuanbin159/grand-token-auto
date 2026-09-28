/* ============================================================
   world v3: the real 四九城, from OpenStreetMap
   (二环以内压缩到 1/4、二环外 1/6,见 scripts/map/build_map.py)
   map data → occupancy grid (1 m cells) + a road-SDF ground,
   collisions, water, parks, street furniture, street names.
   The city blocks are built in 04c_city.js, the landmarks and
   story places in 04d_landmarks.js.
   ============================================================ */
const MAPD = (() => {
  const d = MAP_DATA, k = d.unit;
  const pts = (f, o = []) => { for (let i = 0; i < f.length; i += 2) o.push([f[i] * k, f[i + 1] * k]); return o; };
  const b = d.bounds;
  return { raw: d, k, pts, bounds: { x0: b[0] * k, z0: b[1] * k, x1: b[2] * k, z1: b[3] * k } };
})();

const W = {
  bounds: MAPD.bounds, solids: [], hqs: [], lampList: [], treeList: [], palmList: [], cypressList: [], props: [],
  sun: null, hemi: null, sunDir: new V3(0.3, 0.8, 0.4), neonMats: [], extraFacades: [], extraGlow: [], doors: [], special: {}, redLights: null,
  spawn: new V3(), respawn: new V3(), garage: null, wheel: null,
  platforms: [], hills: [], water: [], waterMeshes: [], dry: [], landmarks: {}, plaza: null, gordonAt: null, dojoPos: null, towerPos: null,
  ring: [], anchors: {},
};

/* ---------------- road classes ---------------- */
// w = two-way width, ow = one carriageway of a divided road, walk = sidewalk, lanes per direction, spd = traffic cruise speed
const RCLS = [
  { key: 'ring', w: 20, ow: 13, walk: 5, lanes: 3, spd: 21, traffic: true, marks: true },
  { key: 'trunk', w: 20, ow: 13, walk: 5, lanes: 3, spd: 19, traffic: true, marks: true },
  { key: 'primary', w: 15, ow: 10, walk: 4, lanes: 2, spd: 16, traffic: true, marks: true },
  { key: 'secondary', w: 12, ow: 8, walk: 3.5, lanes: 2, spd: 14, traffic: true, marks: true },
  { key: 'tertiary', w: 10, ow: 7, walk: 3, lanes: 1, spd: 12, traffic: true, marks: true },
  { key: 'residential', w: 7.5, ow: 6, walk: 2, lanes: 1, spd: 9, traffic: true, marks: false },
  { key: 'hutong', w: 4.4, ow: 4.4, walk: 0.25, lanes: 0, spd: 0, traffic: false, marks: false },
  { key: 'pedestrian', w: 7, ow: 7, walk: 0.5, lanes: 0, spd: 0, traffic: false, marks: false },
];
const LANE_W = 3.4;

/* ---------------- the road graph ---------------- */
const Roads = {
  nodes: [], edges: [], hash: new Map(), cell: 24,
  build() {
    const d = MAPD.raw, k = MAPD.k;
    for (let i = 0; i < d.nodes.length; i += 2) this.nodes.push({ id: i / 2, x: d.nodes[i] * k, z: d.nodes[i + 1] * k, edges: [] });
    d.edges.forEach(([a, b, cls, nm, ow, f]) => {
      const A = this.nodes[a], B = this.nodes[b];
      const pts = [[A.x, A.z], ...MAPD.pts(f), [B.x, B.z]];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const C = RCLS[cls], w = ow ? C.ow : C.w;
      const e = { id: this.edges.length, a, b, cls, C, name: d.names[nm] || '', oneway: !!ow, w, hw: w / 2, pts, cum, len: cum[cum.length - 1] };
      this.edges.push(e); A.edges.push(e); if (b !== a) B.edges.push(e);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], c = this.cell;
        for (let gx = Math.floor((Math.min(x0, x1) - 12) / c); gx <= Math.floor((Math.max(x0, x1) + 12) / c); gx++)
          for (let gz = Math.floor((Math.min(z0, z1) - 12) / c); gz <= Math.floor((Math.max(z0, z1) + 12) / c); gz++) {
            const key = gx * 100003 + gz; let l = this.hash.get(key); if (!l) this.hash.set(key, l = []);
            l.push(e.id * 4096 + i);
          }
      }
    });
    for (const n of this.nodes) n.deg = n.edges.length;
  },
  // point + unit tangent at arc length s along edge e (a → b)
  at(e, s, out = [0, 0, 0, 1]) {
    const cum = e.cum, pts = e.pts;
    s = clamp(s, 0, e.len);
    let lo = 0, hi = cum.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = pts[lo], b = pts[lo + 1], L = cum[lo + 1] - cum[lo] || 1e-6, t = (s - cum[lo]) / L;
    out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = (b[0] - a[0]) / L; out[3] = (b[1] - a[1]) / L;
    return out;
  },
  // nearest road point: { e, s, d, x, z }
  nearest(x, z, maxD = 40, filter = null) {
    let best = null, bd = maxD * maxD;
    const c = this.cell, seen = new Set();
    for (let gx = Math.floor((x - maxD) / c); gx <= Math.floor((x + maxD) / c); gx++)
      for (let gz = Math.floor((z - maxD) / c); gz <= Math.floor((z + maxD) / c); gz++) {
        const l = this.hash.get(gx * 100003 + gz); if (!l) continue;
        for (const code of l) {
          if (seen.has(code)) continue; seen.add(code);
          const e = this.edges[(code / 4096) | 0], i = code % 4096;
          if (filter && !filter(e)) continue;
          const [x0, z0] = e.pts[i], [x1, z1] = e.pts[i + 1];
          const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-9;
          const t = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1), px = x0 + dx * t, pz = z0 + dz * t;
          const d2 = (x - px) ** 2 + (z - pz) ** 2;
          if (d2 < bd) { bd = d2; best = { e, s: e.cum[i] + Math.sqrt(L2) * t, d: 0, x: px, z: pz }; }
        }
      }
    if (best) best.d = Math.sqrt(bd);
    return best;
  },
  // a random lane position for traffic / token lines: { e, dir(+1 a→b, -1 b→a), lane, s, x, z, h }
  randomSpot(fx, fz, minD, maxD, tries = 50, filter = (e) => e.C.traffic) {
    const E = this.edges;
    for (let k = 0; k < tries; k++) {
      // bias toward nearby edges: sample a point in the ring and snap to the nearest road
      const a = rand(TAU), r = rand(minD, maxD), px = fx + Math.cos(a) * r, pz = fz + Math.sin(a) * r;
      const n = this.nearest(px, pz, 30, filter);
      if (!n || n.e.len < 8) continue;
      const e = n.e, dir = e.oneway ? 1 : Math.random() < 0.5 ? 1 : -1;
      const s = clamp(n.s, 3, e.len - 3);
      const lanes = e.oneway ? Math.max(1, Math.floor(e.w / LANE_W)) : e.C.lanes;
      const lane = randi(0, Math.max(0, lanes - 1));
      const p = laneAt(e, dir, lane, s);
      const d = hyp(p[0] - fx, p[1] - fz);
      if (d < minD || d > maxD) continue;
      return { e, dir, lane, s, x: p[0], z: p[1], h: Math.atan2(p[2], p[3]) };
    }
    void E;
    return null;
  },
};
// lateral offset of a lane from the edge centreline (right-hand traffic); dir = +1 drives a→b
function laneOffset(e, dir, lane) {
  if (e.oneway) { const n = Math.max(1, Math.floor(e.w / LANE_W)); return (lane - (n - 1) / 2) * LANE_W; }
  return (0.6 + lane + 0.5) * LANE_W * 0.92;
}
const _lt = [0, 0, 0, 1];
// [x, z, dx, dz] of a lane position (travel direction)
function laneAt(e, dir, lane, s) {
  const p = Roads.at(e, dir > 0 ? s : e.len - s, _lt);
  let dx = p[2], dz = p[3];
  if (dir < 0) { dx = -dx; dz = -dz; }
  const off = laneOffset(e, dir, lane);
  // right of travel direction: (-dz, dx) in this x-east / z-south frame
  return [p[0] - dz * off, p[1] + dx * off, dx, dz];
}
function randomRoadSpot(fx, fz, minD, maxD) { return Roads.randomSpot(fx, fz, minD, maxD); }

/* ---------------- occupancy grid (1 m) ---------------- */
const GK = { FREE: 0, ROAD: 1, ALLEY: 2, WATER: 3, PARK: 4, BLD: 5, RESV: 6, PLAZA: 7, WALK: 8 };
const Grid = {
  x0: 0, z0: 0, w: 0, h: 0, kind: null,
  init() {
    const b = W.bounds;
    this.x0 = Math.floor(b.x0) - 4; this.z0 = Math.floor(b.z0) - 4;
    this.w = Math.ceil(b.x1 - this.x0) + 8; this.h = Math.ceil(b.z1 - this.z0) + 8;
    this.kind = new Uint8Array(this.w * this.h);
  },
  idx(x, z) { const i = Math.floor(x - this.x0), j = Math.floor(z - this.z0); return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i; },
  at(x, z) { const i = this.idx(x, z); return i < 0 ? GK.WATER : this.kind[i]; },
  // visit every cell within r of segment a-b: fn(index, distance)
  capsule(ax, az, bx, bz, r, fn) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - this.x0)), i1 = Math.min(this.w - 1, Math.floor(Math.max(ax, bx) + r - this.x0));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - r - this.z0)), j1 = Math.min(this.h - 1, Math.floor(Math.max(az, bz) + r - this.z0));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + i + 0.5;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = x - ax - dx * t, ez = z - az - dz * t;
        const d = Math.sqrt(ex * ex + ez * ez);
        if (d <= r) fn(j * this.w + i, d);
      }
    }
  },
  // even-odd scanline fill of rings (outer + holes): fn(index)
  poly(rings, fn) {
    let zmin = Infinity, zmax = -Infinity;
    for (const r of rings) for (const p of r) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
    const j0 = Math.max(0, Math.floor(zmin - this.z0)), j1 = Math.min(this.h - 1, Math.ceil(zmax - this.z0));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + j + 0.5; xs.length = 0;
      for (const r of rings) for (let k = 0, n = r.length; k < n; k++) {
        const a = r[k], b = r[(k + 1) % n];
        if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil(xs[k] - this.x0 - 0.5)), i1 = Math.min(this.w - 1, Math.floor(xs[k + 1] - this.x0 - 0.5));
        for (let i = i0; i <= i1; i++) fn(j * this.w + i);
      }
    }
  },
  // oriented rectangle: center, half sizes along its axes (ux,uz = unit x axis)
  obb(cx, cz, hx, hz, ux, uz, fn) {
    const vx = -uz, vz = ux, R = Math.abs(hx * ux) + Math.abs(hz * vx), Rz = Math.abs(hx * uz) + Math.abs(hz * vz);
    const i0 = Math.max(0, Math.floor(cx - R - this.x0)), i1 = Math.min(this.w - 1, Math.floor(cx + R - this.x0));
    const j0 = Math.max(0, Math.floor(cz - Rz - this.z0)), j1 = Math.min(this.h - 1, Math.floor(cz + Rz - this.z0));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + j + 0.5 - cz;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + i + 0.5 - cx, lx = x * ux + z * uz, lz = x * vx + z * vz;
        if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) if (fn(j * this.w + i) === false) return false;
      }
    }
    return true;
  },
  // is an oriented rect entirely on cells of the allowed kinds?
  obbFree(cx, cz, hx, hz, ux, uz, allowed = 1 << GK.FREE | 1 << GK.WALK) {
    const K = this.kind, B = W.bounds, R = Math.abs(hx * ux) + Math.abs(hz * uz), Rz = Math.abs(hx * uz) + Math.abs(hz * ux);
    if (cx - R < B.x0 + 2 || cx + R > B.x1 - 2 || cz - Rz < B.z0 + 2 || cz + Rz > B.z1 - 2) return false; // never past the map wall
    return this.obb(cx, cz, hx, hz, ux, uz, (i) => ((allowed >> K[i]) & 1) === 1);
  },
  setObb(cx, cz, hx, hz, ux, uz, k) { const K = this.kind; this.obb(cx, cz, hx, hz, ux, uz, (i) => { K[i] = k; }); },
};

/* ---------------- collisions: AABB + OBB solids in a spatial hash, water from the grid ---------------- */
const SOLID_CELL = 16;
const SolidHash = new Map();
let _solidStamp = 1;
// s = { x0,x1,z0,z1,h } (axis aligned) or { cx,cz,hx,hz,rot,h } (rotated); blk is ignored (kept for old generators)
function addSolid(blk, s) {
  s.solid = true;
  if (s.cx !== undefined) {
    s.ux = Math.cos(s.rot || 0); s.uz = Math.sin(s.rot || 0);
    const R = Math.abs(s.hx * s.ux) + Math.abs(s.hz * s.uz), Rz = Math.abs(s.hx * s.uz) + Math.abs(s.hz * s.ux);
    s.x0 = s.cx - R; s.x1 = s.cx + R; s.z0 = s.cz - Rz; s.z1 = s.cz + Rz; s.obb = !!s.rot;
  }
  s.stamp = 0;
  W.solids.push(s);
  for (let gx = Math.floor(s.x0 / SOLID_CELL); gx <= Math.floor(s.x1 / SOLID_CELL); gx++)
    for (let gz = Math.floor(s.z0 / SOLID_CELL); gz <= Math.floor(s.z1 / SOLID_CELL); gz++) {
      const key = gx * 100003 + gz; let l = SolidHash.get(key); if (!l) SolidHash.set(key, l = []);
      l.push(s);
    }
  return s;
}
function forSolids(x, z, r, fn) {
  const st = ++_solidStamp;
  for (let gx = Math.floor((x - r) / SOLID_CELL); gx <= Math.floor((x + r) / SOLID_CELL); gx++)
    for (let gz = Math.floor((z - r) / SOLID_CELL); gz <= Math.floor((z + r) / SOLID_CELL); gz++) {
      const l = SolidHash.get(gx * 100003 + gz); if (!l) continue;
      for (const s of l) { if (s.stamp === st || !s.solid) continue; s.stamp = st; if (fn(s) === false) return; }
    }
}
// (hot: the player, every car and panicking ped, each frame) one module-level callback + one reused hit record, no garbage
let _ccP = null, _ccR = 0, _ccH = null; const _ccHit = { b: null, nx: 0, nz: 0 };
const _ccSet = (s, nx, nz) => { _ccHit.b = s; _ccHit.nx = nx; _ccHit.nz = nz; _ccH = _ccHit; };
function _ccSolid(s) {
  const pos = _ccP, r = _ccR;
  if (pos.x < s.x0 - r || pos.x > s.x1 + r || pos.z < s.z0 - r || pos.z > s.z1 + r) return;
  if (s.obb) {
    const dx = pos.x - s.cx, dz = pos.z - s.cz;
    const lx = dx * s.ux + dz * s.uz, lz = -dx * s.uz + dz * s.ux;
    const qx = clamp(lx, -s.hx, s.hx), qz = clamp(lz, -s.hz, s.hz);
    let ex = lx - qx, ez = lz - qz; const d2 = ex * ex + ez * ez;
    if (d2 >= r * r) return;
    let nlx, nlz, push;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; push = r - d; }
    else {
      const px = s.hx - Math.abs(lx), pz = s.hz - Math.abs(lz);
      if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; push = px + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; push = pz + r; }
    }
    const nx = nlx * s.ux - nlz * s.uz, nz = nlx * s.uz + nlz * s.ux;
    pos.x += nx * push; pos.z += nz * push; _ccSet(s, nx, nz);
    return;
  }
  const cx = clamp(pos.x, s.x0, s.x1), cz = clamp(pos.z, s.z0, s.z1);
  let dx = pos.x - cx, dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), push = r - d; dx /= d; dz /= d;
    pos.x += dx * push; pos.z += dz * push; _ccSet(s, dx, dz);
  } else {
    const pl = pos.x - s.x0, pr = s.x1 - pos.x, pt = pos.z - s.z0, pb = s.z1 - pos.z, m = Math.min(pl, pr, pt, pb);
    if (m === pl) { pos.x = s.x0 - r; _ccSet(s, -1, 0); }
    else if (m === pr) { pos.x = s.x1 + r; _ccSet(s, 1, 0); }
    else if (m === pt) { pos.z = s.z0 - r; _ccSet(s, 0, -1); }
    else { pos.z = s.z1 + r; _ccSet(s, 0, 1); }
  }
}
function collideCircle(pos, r) {
  _ccP = pos; _ccR = r; _ccH = null;
  forSolids(pos.x, pos.z, r + 1, _ccSolid);
  let hit = _ccH; _ccP = null;
  const wh = pushOutOfWater(pos); if (wh) hit = hit || wh;
  const B = W.bounds;
  if (pos.x < B.x0 + r) { pos.x = B.x0 + r; hit = hit || { b: null, nx: 1, nz: 0 }; }
  if (pos.x > B.x1 - r) { pos.x = B.x1 - r; hit = hit || { b: null, nx: -1, nz: 0 }; }
  if (pos.z < B.z0 + r) { pos.z = B.z0 + r; hit = hit || { b: null, nx: 0, nz: 1 }; }
  if (pos.z > B.z1 - r) { pos.z = B.z1 - r; hit = hit || { b: null, nx: 0, nz: -1 }; }
  return hit;
}
function collideWorld(pos, r) { return Interiors.cur ? Interiors.collide(pos, r) : collideCircle(pos, r); }
function solidsNear(x, z, r) { const out = []; if (Interiors.cur) return out; forSolids(x, z, r, (s) => { out.push(s); }); return out; }
function wetAt(x, z) { return Grid.kind ? Grid.at(x, z) === GK.WATER : false; }
function pushOutOfWater(pos) {
  if (!wetAt(pos.x, pos.z)) return null;
  for (let s = 0.5; s <= 12; s += 0.5) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, x = pos.x + Math.cos(a) * s, z = pos.z + Math.sin(a) * s;
    if (!wetAt(x, z)) { pos.x = x; pos.z = z; return { b: null, nx: Math.cos(a), nz: Math.sin(a), water: true }; }
  }
  return null;
}
function rayAABB2(ox, oz, dx, dz, s, maxT) {
  let t0 = 0, t1 = maxT;
  if (Math.abs(dx) < 1e-9) { if (ox < s.x0 || ox > s.x1) return -1; }
  else { let a = (s.x0 - ox) / dx, b = (s.x1 - ox) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < s.z0 || oz > s.z1) return -1; }
  else { let a = (s.z0 - oz) / dz, b = (s.z1 - oz) / dz; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return -1; }
  return t0;
}
// segment p→q against a solid (3D, treats OBBs exactly in their frame); scalar slabs, no garbage (camera + occlusion rays, every frame)
let _st0 = 0, _st1 = 1;
function _slab(o, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return !(o < lo || o > hi);
  let a = (lo - o) / d, b = (hi - o) / d; if (a > b) { const t = a; a = b; b = t; }
  if (a > _st0) _st0 = a; if (b < _st1) _st1 = b;
  return !(_st0 > _st1);
}
function segSolid3(p, q, s) {
  let ox, oz, dx, dz, x0, x1, z0, z1;
  if (s.obb) {
    const ax = p.x - s.cx, az = p.z - s.cz, bx = q.x - s.cx, bz = q.z - s.cz;
    ox = ax * s.ux + az * s.uz; oz = -ax * s.uz + az * s.ux;
    dx = bx * s.ux + bz * s.uz - ox; dz = -bx * s.uz + bz * s.ux - oz;
    x0 = -s.hx; x1 = s.hx; z0 = -s.hz; z1 = s.hz;
  } else { ox = p.x; oz = p.z; dx = q.x - p.x; dz = q.z - p.z; x0 = s.x0; x1 = s.x1; z0 = s.z0; z1 = s.z1; }
  _st0 = 0; _st1 = 1;
  if (!_slab(ox, dx, x0, x1) || !_slab(p.y, q.y - p.y, 0, s.h) || !_slab(oz, dz, z0, z1)) return -1;
  return _st0;
}
function segAABB3(p, q, s) { return segSolid3(p, q, s) >= 0; }
// first solid hit along p→q (for the camera): returns t in [0,1] or 1
function rayWorld(p, q, pad = 0.4) {
  let best = 1;
  const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, r = hyp(q.x - p.x, q.z - p.z) / 2 + pad + 2;
  forSolids(mx, mz, r, (s) => { if ((s.h || 0) < 1.2) return; const t = segSolid3(p, q, s); if (t >= 0 && t < best) best = t; });
  return best;
}

/* ---------------- ground height: flat city + terraces + hills ---------------- */
function groundH(x, z) {
  let h = 0;
  for (const p of W.platforms) if (p.circle ? (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r : x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = Math.max(h, p.h);
  for (const hl of W.hills) { const v = hillH(hl, x, z); if (v > 0) h = Math.max(h, 0.3 + v); }
  return h;
}
function hillH(hl, x, z) { const u = ((x - hl.x) / hl.rx) ** 2 + ((z - hl.z) / hl.rz) ** 2; if (u >= 1) return 0; const t = 1 - u; return hl.h * t * t * (3 - 2 * t); }

/* ---------------- merged static geometry, bucketed per material and per 160 m chunk ---------------- */
const CHUNK = 160;
const Build = {
  buckets: new Map(), props: [], ads: [], reds: [],
  chunk(x, z) { return Math.floor((x - W.bounds.x0) / CHUNK) + ':' + Math.floor((z - W.bounds.z0) / CHUNK); },
  add(mat, geo) {
    const p = geo.attributes.position; if (!p || !p.count) return;
    const key = this.chunk(p.getX(0), p.getZ(0));
    if (!this.buckets.has(mat)) this.buckets.set(mat, new Map());
    const m = this.buckets.get(mat); if (!m.has(key)) m.set(key, []); m.get(key).push(geo);
  },
  finish() {
    for (const [mat, chunks] of this.buckets) for (const geos of chunks.values()) { const m = new THREE.Mesh(mergeGeos(geos), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); Cull.add(m); }
    const pc = new Map();
    for (const p of this.props) { const e = p.m.elements, key = this.chunk(e[12], e[14]); if (!pc.has(key)) pc.set(key, []); pc.get(key).push(p); }
    for (const parts of pc.values()) { const m = new THREE.Mesh(mergeParts(parts), MAT.bldProps); m.castShadow = true; m.receiveShadow = true; scene.add(m); Cull.add(m, 560); }
    if (this.ads.length) { const m = new THREE.Mesh(mergeGeos(this.ads), MAT.ads); scene.add(m); }
    if (this.reds.length) { W.redLights = new THREE.Mesh(mergeParts(this.reds), MAT.redBlink); scene.add(W.redLights); }
    this.buckets.clear(); this.props = []; this.ads = []; this.reds = [];
  },
};
const ROOF_TANK = new THREE.CylinderGeometry(1.2, 1.2, 2.6, 10);

/* ---------------- distance culling: static chunk meshes drop out past the fog, small dressing much earlier ---------------- */
// (the frustum alone keeps half the city in view at street level: ~3000 draw calls before this)
const Cull = {
  list: [], on: true,
  // m: a static mesh in world space (a position offset is fine); d: its own max view distance; night: only while the lamps are lit
  add(m, d = 1e9, night = false) {
    const g = m.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const c = g.boundingSphere.center;
    this.list.push({ m, x: c.x + m.position.x, z: c.z + m.position.z, r: g.boundingSphere.radius, d, night });
    return m;
  },
  update(cam) {
    const f = scene.fog, L = this.list;
    // past fog.far everything is fog-coloured (fog uses view depth, we use plain distance: ×1.15 for the screen edges)
    const fog = !this.on ? 1e9 : f ? (f.far !== undefined ? f.far : 2.8 / Math.max(1e-4, f.density || 0)) * 1.15 + 20 : 1e9;
    const cx = cam.position.x, cz = cam.position.z, lit = DayNight.lamps > 0.02, q = LOWQ ? 0.65 : 1; // phones: small stuff drops out sooner
    const mk = cam === Mirror.cam ? Mirror.cullK : 1; // the lake mirror draws a shorter range (far things are fog and sky in a reflection)
    Foliage.U.uCamP.value.copy(cam.position); // tree LODs pick by distance to the camera that renders
    for (let i = 0; i < L.length; i++) {
      const it = L[i], lim = Math.min(this.on ? it.d * q : 1e9, fog) * mk + it.r, dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz;
      // dmin: a far LOD, shown only once its near twin (d = dmin) has dropped out
      it.m.visible = d2 < lim * lim && (lit || !it.night) && (!it.dmin || (this.on && d2 >= (it.dmin * q + it.r) ** 2));
    }
  },
  // runs inside renderer.render() before the scene is projected, so shadows and every pass see the same set
  hook() { const prev = scene.onBeforeRender; scene.onBeforeRender = function (r, s, cam, rt) { if (cam && cam.isPerspectiveCamera && !Warm.drawing) Cull.update(cam); prev.call(this, r, s, cam, rt); }; },
};

/* ---------------- trees & knockable props ---------------- */
const TREE_GEO_PARTS = () => [ // 国槐: layered round crowns
  box(0, 1.3, 0, 0.34, 2.6, 0.34, 0x5a4030),
  gpart(new THREE.IcosahedronGeometry(1.8, 1), 0x3f7f3a, 0, 3.5, 0, 0.3, 0.2, 0, 1, 0.8, 1),
  gpart(new THREE.IcosahedronGeometry(1.35, 0), 0x4f9446, 0.9, 4.1, 0.3, 0.5, 0.6, 0.2, 1, 0.82, 1), // (132 tris a tree: there are ~12k of them)
  gpart(new THREE.IcosahedronGeometry(1.25, 0), 0x356d33, -0.8, 4.0, -0.4, 0.1, 1.1, 0.3, 1, 0.82, 1),
];
function cypressGeo() { return mergeParts([box(0, 0.8, 0, 0.3, 1.6, 0.3, 0x4a3426), gpart(new THREE.ConeGeometry(1.15, 4.2, 7), 0x264d2c, 0, 3.4, 0), gpart(new THREE.ConeGeometry(0.85, 2.6, 7), 0x2e5a33, 0, 5.4, 0)]); }
function palmGeo() { // 垂柳: a tall trunk, a loose crown and long hanging strands
  const parts = [box(0, 2.0, 0, 0.42, 4.0, 0.42, 0x5a4636), gpart(_BOX, 0x5a4636, 0.5, 3.9, 0.2, 0, 0, -0.5, 0.22, 1.6, 0.22), gpart(_BOX, 0x5a4636, -0.45, 3.8, -0.25, 0, 0, 0.55, 0.2, 1.4, 0.2)];
  for (const [x, y, z, r, c] of [[0, 4.9, 0, 1.5, 0x6b8f3a], [0.9, 4.5, 0.4, 1.1, 0x7da446], [-0.8, 4.6, -0.3, 1.15, 0x74983f]]) parts.push(gpart(new THREE.SphereGeometry(r, 7, 4), c, x, y, z, 0, 0, 0, 1, 0.62, 1));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU + rand(-0.15, 0.15), r = rand(1.5, 2.3), L = rand(2.6, 3.6);
    parts.push(gpart(_BOX, k % 2 ? 0x9cc65a : 0x84ad4c, Math.cos(a) * r, 4.6 - L / 2, Math.sin(a) * r, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12, 0.2, L, 0.2));
  }
  return mergeParts(parts);
}
// a geometry sharing another's attribute buffers (its own bounding sphere): per-chunk instanced meshes don't copy vertex data
function shareGeo(src) { const g = new THREE.BufferGeometry(); for (const k in src.attributes) g.setAttribute(k, src.attributes[k]); if (src.index) g.setIndex(src.index); return g; }
// layers: [geo, mat, key, castShadow, nightOnly, shadowGeo]; cd = view distance for Cull. With a shadowGeo the detailed mesh
// doesn't cast: a shadow-only proxy sharing its instance matrices does (knocked-over props stay in sync)
function chunkInstances(list, layers, h, cd = 1e9) {
  const groups = new Map();
  for (const it of list) { const k = Build.chunk(it.x, it.z); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  for (const items of groups.values()) {
    let cx = 0, cz = 0; for (const it of items) { cx += it.x; cz += it.z; } cx /= items.length; cz /= items.length;
    let r = 0; for (const it of items) r = Math.max(r, Math.hypot(it.x - cx, it.z - cz));
    for (const [geo, mat, key, shadow, night, sgeo] of layers) {
      // the geometry keeps its LOCAL sphere (the frustum culler moves it by every instance matrix); Cull gets the chunk's world bounds
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const g = shareGeo(geo); g.boundingSphere = geo.boundingSphere.clone();
      const m = new THREE.InstancedMesh(g, mat, items.length); m.castShadow = shadow && !sgeo; m.receiveShadow = !shadow; scene.add(m);
      m.matrixAutoUpdate = false; Cull.list.push({ m, x: cx, z: cz, r: r + h + 3, d: cd, night: !!night });
      if (shadow && sgeo) { const p = Render.shadowProxy(sgeo, items.length, m.instanceMatrix); scene.add(p); Cull.list.push({ m: p, x: cx, z: cz, r: r + h, d: cd, night: false }); }
      items.forEach((it, k) => { it[key] = m; it.ci = k; });
    }
  }
}
// static instanced dressing, one InstancedMesh per chunk: items {x, y?, z, ry?, s?, c? (instance colour)}
function chunkStatic(items, geo, mat, cd, shadow = false) {
  if (!items.length) return;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new V3(), sc = new V3(), col = new THREE.Color();
  let ym = 0; for (const it of items) ym = Math.max(ym, it.y || 0);
  chunkInstances(items, [[geo, mat, '_m', shadow]], (geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox)).max.y + 1 + ym, cd);
  const dirty = new Set(), anyC = items.some((it) => it.c !== undefined);
  for (const it of items) {
    const s = it.s || 1;
    m4.compose(v.set(it.x, it.y || 0, it.z), q.setFromAxisAngle(UP, it.ry || 0), sc.set(s, s, s));
    it._m.setMatrixAt(it.ci, m4);
    if (anyC) it._m.setColorAt(it.ci, col.set(it.c !== undefined ? it.c : 0xffffff));
    dirty.add(it._m);
  }
  for (const m of dirty) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
const PROP_CELL = 20, PropHash = new Map();
function newProp(x, z, sc, kind) {
  const list = kind === 'palm' ? W.palmList : kind === 'cypress' ? W.cypressList : kind === 'lamp' ? W.lampList : W.treeList;
  const it = { x, z, ry: rand(TAU), sc, state: 0, t: 0, ax: 0, az: 0, idx: list.length, kind };
  list.push(it);
  const key = Math.floor(x / PROP_CELL) * 100003 + Math.floor(z / PROP_CELL);
  let l = PropHash.get(key); if (!l) PropHash.set(key, l = []); l.push(it);
  return it;
}
// every knockable prop (tree / lamp / willow / cypress) within r of (x, z)
function forProps(x, z, r, fn) {
  for (let gx = Math.floor((x - r) / PROP_CELL); gx <= Math.floor((x + r) / PROP_CELL); gx++)
    for (let gz = Math.floor((z - r) / PROP_CELL); gz <= Math.floor((z + r) / PROP_CELL); gz++)
      for (const it of PropHash.get(gx * 100003 + gz) || []) if (dist2(x, z, it.x, it.z) < r * r) fn(it);
}
const Props = {
  falling: [],
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _q2: new THREE.Quaternion(), _v: new V3(), _s: new V3(), _ax: new V3(),
  meshOf(it) { return it.cm; },
  writeMatrix(it) {
    const ang = it.state === 0 ? 0 : Math.min(1, it.t) * 1.45;
    this._q.setFromAxisAngle(UP, it.ry);
    if (ang > 0) { this._ax.set(it.az, 0, -it.ax); this._q2.setFromAxisAngle(this._ax, ang); this._q.premultiply(this._q2); }
    this._m.compose(this._v.set(it.x, groundH(it.x, it.z), it.z), this._q, this._s.set(it.sc, it.sc, it.sc));
    if (!it.cm) return;
    it.cm.setMatrixAt(it.ci, this._m);
    if (it.fm) { it.fm.setMatrixAt(it.fi, this._m); it.fm.instanceMatrix.needsUpdate = true; }
    if (it.pk >= 0) Foliage.poolSet(it, this._m);
    if (it.kind === 'lamp') {
      it.hm.setMatrixAt(it.ci, this._m);
      const s = it.state === 0 ? (it.hua ? 15 : 11) : 0, o = it.hua ? 0 : 2.2, fx = Math.sin(it.ry) * o, fz = Math.cos(it.ry) * o;
      this._q.identity();
      this._m.compose(this._v.set(it.x + fx, 0.06, it.z + fz), this._q, this._s.set(s, 1, s));
      it.pm.setMatrixAt(it.ci, this._m);
    }
  },
  knock(it, fx, fz) {
    if (it.state !== 0) return false;
    const l = hyp(fx, fz) || 1;
    it.ax = fx / l; it.az = fz / l; it.state = 1; it.t = 0;
    this.falling.push(it);
    if (it.kind === 'lamp') { FX.sparks(it.x, 4, it.z, 8); if (Math.random() < 0.5) Sfx.clang(); }
    else FX.leaves(it.x, 3.5, it.z, 10);
    return true;
  },
  knockAround(x, z, r, fx, fz, dirX, dirZ) {
    if (Interiors.cur) return 0;
    let n = 0;
    for (let gx = Math.floor((x - r) / PROP_CELL); gx <= Math.floor((x + r) / PROP_CELL); gx++)
      for (let gz = Math.floor((z - r) / PROP_CELL); gz <= Math.floor((z + r) / PROP_CELL); gz++) {
        const l = PropHash.get(gx * 100003 + gz); if (!l) continue;
        for (const it of l) {
          if (it.state !== 0 || dist2(x, z, it.x, it.z) >= r * r) continue;
          const dx = dirX !== undefined ? dirX : it.x - fx, dz = dirZ !== undefined ? dirZ : it.z - fz;
          if (this.knock(it, dx, dz)) n++;
        }
      }
    return n;
  },
  update(dt) {
    const dirty = new Set();
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const it = this.falling[k];
      it.t += dt * (it.kind === 'lamp' ? 3 : 2.2);
      if (it.t >= 1) { it.t = 1; it.state = 2; this.falling.splice(k, 1); }
      this.writeMatrix(it); dirty.add(it.cm); if (it.hm) { dirty.add(it.hm); dirty.add(it.pm); }
    }
    for (const m of dirty) if (m) m.instanceMatrix.needsUpdate = true;
    if (W.redLights) W.redLights.visible = (G.time % 1.6) < 0.8;
    if (W.wheel) {
      const w = W.wheel; w.rot.rotation.z += dt * 0.12;
      for (const c of w.cabins) { const a = c.a; c.c.position.set(Math.cos(a) * w.R, Math.sin(a) * w.R, 0); c.c.rotation.z = -w.rot.rotation.z; }
    }
    if (W.boats) W.boats.position.y = Math.sin(G.time * 1.3) * 0.06;
    Signals.update(dt);
  },
};

/* ---------------- street lamps: a tapered pole with a swept arm and an LED head; 长安街 / 天安门 get the white 华灯 ---------------- */
function lampParts() {
  const C = 0x565d66, D = 0x33373d;
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new V3(0, 6.45, 0), new V3(0, 7.3, 0.35), new V3(0, 7.02, 2.0)), 10, 0.055, 6);
  return {
    pole: mergeParts([gpart(new THREE.CylinderGeometry(0.2, 0.27, 0.55, 12), D, 0, 0.275, 0), gpart(new THREE.CylinderGeometry(0.075, 0.125, 6.6, 12), C, 0, 3.85, 0), gpart(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), D, 0, 6.5, 0), gpart(arm, C), box(0, 7.03, 2.15, 0.38, 0.13, 0.95, D)]),
    head: new THREE.BoxGeometry(0.3, 0.04, 0.82).translate(0, 6.955, 2.15),
  };
}
function huaParts() { // 华灯: a white fluted column, a crown of globes on four arms and a tall one on top
  const Wc = 0xeeebe2, parts = [box(0, 0.45, 0, 0.75, 0.9, 0.75, 0xd9d4c8), gpart(new THREE.CylinderGeometry(0.13, 0.18, 6.0, 14), Wc, 0, 3.9, 0), gpart(new THREE.CylinderGeometry(0.22, 0.14, 0.35, 12), 0xc9a23e, 0, 6.95, 0)];
  const globes = [gpart(new THREE.SphereGeometry(0.36, 14, 10), 0xffffff, 0, 7.62, 0)];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4, x = Math.cos(a), z = Math.sin(a);
    parts.push(box(x * 0.4, 6.72, z * 0.4, 0.8, 0.06, 0.06, Wc, -a));
    globes.push(gpart(new THREE.SphereGeometry(0.3, 12, 9), 0xffffff, x * 0.82, 6.98, z * 0.82), gpart(new THREE.SphereGeometry(0.22, 10, 8), 0xffffff, x * 0.42, 7.28, z * 0.42));
  }
  return { pole: mergeParts(parts), head: mergeParts(globes) };
}
// lamp posts (metal): lit by the scene, dithered away right in front of the lens
const LAMP_MAT = () => Render.cutout(PBR.HI ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 }) : new THREE.MeshLambertMaterial({ vertexColors: true }));

/* ---------------- street props (Poly Haven, CC0): bins and hydrants on the kerbs, benches by the lakes and on wide pavements,
   wooden utility poles with sagging wires down the hutongs. Instanced per chunk, one draw per material. ---------------- */
const PROP_SETS = {
  bin: ['metal_trash_can', ['metal_trash_can', 'metal_trash_can_lid', 'metal_trash_can_handle_left', 'metal_trash_can_handle_right']],
  hydrant: ['fire_hydrant', ['fire_hydrant', 'fire_hydrant_cap_01', 'fire_hydrant_cap_02', 'fire_hydrant_cap_03']],
  bench: ['modular_street_seating', ['seat', 'seat_back', 'legs_single', 'legs_double', 'back_support_l', 'back_support_r', 'arm_rest_01']],
  pole: ['modular_electricity_poles', ['preset_02_pole', 'preset_02_cap', 'preset_02_ring_large_02', 'preset_02_ring_small_04', 'preset_02_ring_small_05']],
  manhole: ['water_manhole_cover', ['water_manhole_cover_frame', 'water_manhole_cover']],
};
for (const k in PROP_SETS) Assets.need('prop/' + PROP_SETS[k][0], 'props/' + PROP_SETS[k][0] + '.glb', { tier: 'stream', prio: k === 'pole' ? 4 : 2 });
const StreetProps = {
  lists: { bin: [], hydrant: [], bench: [], pole: [], manhole: [] }, wires: [],
  // the named nodes of a prop GLB → one float geometry per material, sitting on y = 0 around the origin
  kit(k) {
    const [file, names] = PROP_SETS[k], G = Assets.get('prop/' + file); if (!G || !G.scene) return null;
    G.scene.updateMatrixWorld(true);
    const byMat = new Map(), box3 = new THREE.Box3(), parts = [];
    G.scene.traverse((o) => { if (o.isMesh && names.includes(o.name)) parts.push(o); });
    if (!parts.length) return null;
    for (const o of parts) {
      const src = o.geometry, g = new THREE.BufferGeometry(), n = src.attributes.position.count;
      for (const [a, sz] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const at = src.attributes[a], out = new Float32Array(n * sz), get = [at && at.getX, at && at.getY, at && at.getZ];
        if (at) for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) out[i * sz + j] = get[j].call(at, i);
        g.setAttribute(a, new THREE.BufferAttribute(out, sz));
      }
      g.setIndex(src.index ? Array.from(src.index.array) : null);
      g.applyMatrix4(o.matrixWorld); g.computeBoundingBox(); box3.union(g.boundingBox);
      const m = o.material; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(g);
    }
    const c = box3.getCenter(new V3()), out = [];
    for (const [m, gs] of byMat) {
      const g = THREE.mergeGeometries(gs.map((x) => (x.index ? x : x.toNonIndexed())), false); if (!g) continue;
      g.translate(-c.x, -box3.min.y, -c.z); g.computeBoundingSphere();
      const mm = m.clone(); mm.defines = Object.assign({}, mm.defines, { GTA_LINEAR_IN: '' }); // glTF colours are linear already
      out.push([g, mm]);
    }
    return out;
  },
  place() {
    const P = [0, 0, 0, 1], L = this.lists;
    const free = (x, z, r = 1.2) => { const k = Grid.at(x, z); if (k !== GK.WALK && k !== GK.FREE && k !== GK.PLAZA && k !== GK.PARK) return false; if (Ground.roadSdf(x, z) < 0.25) return false; let hit = false; forProps(x, z, r, () => { hit = true; }); return !hit && !W.doors.some((d) => dist2(x, z, d.x, d.z) < 5 * 5); };
    for (const e of Roads.edges) {
      if (e.cls > 5 || e.len < 20) continue;
      for (const side of [1, -1]) {
        if (e.oneway && side < 0 && e.cls <= 1) continue;
        // kerbside: a bin every ~50 m, a hydrant every ~150 m; benches on wide pavements
        for (let s = rand(8, 40); s < e.len - 6; s += rand(40, 60)) {
          Roads.at(e, s, P); const off = e.hw + 0.55, x = P[0] - P[3] * off * side, z = P[1] + P[2] * off * side;
          if (free(x, z)) L[Math.random() < 0.25 ? 'hydrant' : 'bin'].push({ x, z, ry: Math.atan2(-P[3] * side, P[2] * side) + rand(-0.2, 0.2) });
        }
        if (e.C.walk >= 4) for (let s = rand(20, 60); s < e.len - 10; s += rand(60, 110)) {
          Roads.at(e, s, P); const off = e.hw + e.C.walk - 0.9, x = P[0] - P[3] * off * side, z = P[1] + P[2] * off * side;
          if (free(x, z, 2)) L.bench.push({ x, z, ry: Math.atan2(-P[3] * side, P[2] * side) + Math.PI });
        }
      }
    }
    // benches along the lake shores, facing the water
    for (const wv of W.water) {
      if (wv.line) continue;
      const r = wv[0]; let acc = rand(0, 20);
      for (let k = 0; k < r.length; k++) {
        const a = r[k], b = r[(k + 1) % r.length], len = hyp(b[0] - a[0], b[1] - a[1]); if (len < 1) continue;
        for (; acc < len; acc += rand(22, 40)) {
          const t = acc / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
          for (const sg of [1, -1]) { const px = x + nx * 3.4 * sg, pz = z + nz * 3.4 * sg; if (wetAt(x + nx * 1.5 * sg, z + nz * 1.5 * sg) || !free(px, pz, 2)) continue; L.bench.push({ x: px, z: pz, ry: Math.atan2(-nx * sg, -nz * sg) }); break; }
        }
        acc -= len;
      }
    }
    // manhole covers in the lanes (sunk flush with the asphalt in build())
    for (const e of Roads.edges) {
      if (e.cls > 4 || e.len < 30) continue;
      for (let s = rand(10, 40); s < e.len - 10; s += rand(45, 85)) {
        const lane = e.oneway ? 0 : randi(0, Math.max(0, e.C.lanes - 1)), dir = Math.random() < 0.5 ? 1 : -1, q = laneAt(e, dir, lane, s);
        if (Ground.roadSdf(q[0], q[1]) < -1.2 && !(W.zebras || []).some((zb) => dist2(zb.x, zb.z, q[0], q[1]) < 36)) L.manhole.push({ x: q[0], z: q[1], ry: rand(TAU) });
      }
    }
    // hutong utility poles (every ~26 m on one side of the lane), wires strung pole to pole
    for (const e of Roads.edges) {
      if (e.cls !== 6 || e.len < 30) continue;
      const side = e.id % 2 ? 1 : -1; let last = null;
      for (let s = rand(4, 14); s < e.len - 4; s += rand(22, 30)) {
        Roads.at(e, s, P); const off = e.hw - 0.35, x = P[0] - P[3] * off * side, z = P[1] + P[2] * off * side;
        if (W.doors.some((d) => dist2(x, z, d.x, d.z) < 4 * 4)) { last = null; continue; }
        L.pole.push({ x, z, ry: Math.atan2(P[2], P[3]) });
        if (last) this.wires.push([last[0], last[1], x, z]);
        last = [x, z];
        addSolid(null, { x0: x - 0.16, x1: x + 0.16, z0: z - 0.16, z1: z + 0.16, h: 1.1, kind: 'pillar' });
      }
    }
    for (const it of L.bin.concat(L.hydrant)) addSolid(null, { x0: it.x - 0.3, x1: it.x + 0.3, z0: it.z - 0.3, z1: it.z + 0.3, h: 1.0, kind: 'pillar' });
  },
  // the instanced meshes of one kind (called at build, or when its model streams in later: built off-scene until its shaders are ready)
  mesh(k) {
    const L = this.lists, DIST = { bin: 110, hydrant: 110, bench: 140, pole: 200, manhole: 70 };
    const kit = L[k].length && this.kit(k); if (!kit) return;
    // manholes: sunk so only the top 1.5 cm shows (the kit sits on y = 0)
    const top = Math.max(...kit.map(([g]) => (g.computeBoundingBox(), g.boundingBox.max.y))), y = k === 'manhole' ? 0.015 - top : 0;
    for (const [g, m] of kit) chunkStatic(L[k].map((it) => ({ x: it.x, y, z: it.z, ry: it.ry, s: k === 'pole' ? 0.95 : 1 })), g, Render.cutout(m), DIST[k], k === 'pole' || k === 'bench');
  },
  build() {
    this.place();
    for (const k in this.lists) {
      const key = 'prop/' + PROP_SETS[k][0];
      if (Assets.has(key)) this.mesh(k);
      else Assets.on(key, () => Jobs.add(() => Warm.adopt(() => this.mesh(k))));
    }
    // wires: three sagging strands per span, merged per chunk (lines)
    const byChunk = new Map(), top = 5.55;
    for (const [ax, az, bx, bz] of this.wires) {
      const key = Build.chunk(ax, az); let arr = byChunk.get(key); if (!arr) byChunk.set(key, arr = []);
      const L2 = hyp(bx - ax, bz - az), nx = -(bz - az) / L2, nz = (bx - ax) / L2;
      for (const [o, dy] of [[-0.35, 0], [0.35, 0], [0, -0.45]]) {
        const sag = 0.25 + L2 * 0.018;
        for (let i = 0; i < 8; i++) {
          const t0 = i / 8, t1 = (i + 1) / 8, y0 = top + dy - sag * 4 * t0 * (1 - t0), y1 = top + dy - sag * 4 * t1 * (1 - t1);
          arr.push(ax + (bx - ax) * t0 + nx * o, y0, az + (bz - az) * t0 + nz * o, ax + (bx - ax) * t1 + nx * o, y1, az + (bz - az) * t1 + nz * o);
        }
      }
    }
    const wm = new THREE.LineBasicMaterial({ color: 0x1c1d20 });
    for (const arr of byChunk.values()) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeBoundingSphere(); const m = new THREE.LineSegments(g, wm); scene.add(m); Cull.add(m, 150); }
  },
};

/* ---------------- 绿化带: clipped 大叶黄杨 hedges along the kerbs of the big avenues. Rounded, lumpy tubes built in world space
   (merged per chunk), shaded by a leafy procedural shader: world-space leaf clusters for colour and a bump-mapped normal. ---------------- */
const HEDGE_FS = [
  'float hgH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }',
  'float hgN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(mix(hgH(i), hgH(i + vec3(1, 0, 0)), f.x), mix(hgH(i + vec3(0, 1, 0)), hgH(i + vec3(1, 1, 0)), f.x), f.y),',
  '             mix(mix(hgH(i + vec3(0, 0, 1)), hgH(i + vec3(1, 0, 1)), f.x), mix(hgH(i + vec3(0, 1, 1)), hgH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }',
].join('\n') + '\n';
const Hedges = {
  list: [], mat: null,
  place() {
    const P = [0, 0, 0, 1], S = StreetProps.lists, near = (x, z, r, list) => list.some((it) => dist2(x, z, it.x, it.z) < r * r);
    const ok = (x, z) => { const k = Grid.at(x, z); if (k !== GK.WALK && k !== GK.FREE && k !== GK.PARK) return false; if (Ground.roadSdf(x, z) < 0.35) return false;
      let lamp = false; forProps(x, z, 1.1, (it) => { if (it.kind === 'lamp') lamp = true; }); return !lamp && !W.doors.some((d) => dist2(x, z, d.x, d.z) < 7 * 7); };
    for (const e of Roads.edges) {
      if (e.cls > 2 || e.len < 40 || e.C.walk < 3.5) continue;
      for (const side of [1, -1]) {
        if (e.oneway && side < 0 && e.cls <= 1) continue;
        const off = e.hw + 0.95;
        for (let s = rand(12, 18); s < e.len - 14;) {
          const L = rand(5, 9), pts = [];
          for (let k = 0; k <= Math.ceil(L / 0.5); k++) { Roads.at(e, s + Math.min(L, k * 0.5), P); pts.push([P[0] - P[3] * off * side, P[1] + P[2] * off * side]); }
          const m = pts[pts.length >> 1];
          if (pts.every(([x, z]) => ok(x, z)) && !near(m[0], m[1], L / 2 + 1.2, S.bin) && !near(m[0], m[1], L / 2 + 1.2, S.hydrant) && !near(m[0], m[1], L / 2 + 2, S.bench)) this.list.push(pts);
          s += L + rand(1.6, 3.2);
        }
      }
    }
  },
  // one hedge: a rounded 0.86 × 0.78 section swept along the points, both ends capped, every vertex pushed in / out by 3-D noise
  geo(pts) {
    const W2 = 0.43, H = 0.78, R = 0.2, sec = [];
    for (let k = 0; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; sec.push([W2 - R + Math.cos(a) * R, H - R + Math.sin(a) * R]); } // right top corner
    const prof = [[W2, 0]].concat(sec, sec.slice().reverse().map(([x, y]) => [-x, y]), [[-W2, 0]]), np = prof.length, n = pts.length;
    const pos = [], idx = [], jit = (x, y, z) => (Math.sin(x * 3.1 + z * 1.7) * Math.sin(z * 2.3 - y * 4.1 + x) + Math.sin(x * 7.3 - z * 6.1 + y * 5.2) * 0.5) * 0.035;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
      const end = Math.min(i, n - 1 - i) === 0 ? 0.9 : 1; // the ends taper a touch
      for (const [px, py] of prof) {
        const x = pts[i][0] + nx * px * end, z = pts[i][1] + nz * px * end, y = py * (end < 1 ? 0.94 : 1), j = py > 0.05 ? jit(x, y, z) : 0;
        const ox = px === 0 ? 0 : Math.sign(px) * nx, oz = px === 0 ? 0 : Math.sign(px) * nz, up = py > H - R ? 1 : 0.3;
        pos.push(x + ox * j, y + j * up, z + oz * j);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < np - 1; k++) { const a = i * np + k, b = a + np; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    // end caps: fans from the section's centre
    for (const i of [0, n - 1]) {
      const c = pos.length / 3, p = pts[i]; pos.push(p[0], H * 0.45, p[1]);
      for (let k = 0; k < np - 1; k++) { const a = i * np + k; if (i === 0) idx.push(c, a, a + 1); else idx.push(c, a + 1, a); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  },
  build() {
    this.place(); if (!this.list.length) return;
    const m = this.mat = LOWQ ? new THREE.MeshLambertMaterial({ color: 0x5f8a45 }) : new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 0.72, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Render.cutoutPatch(sh);
      sh.fragmentShader = HEDGE_FS + sh.fragmentShader
        .replace('#include <map_fragment>', ['#include <map_fragment>',
          // leaf clusters (~7 cm) over bigger clumps; darker toward the base and inside the gaps
          '  vec3 hp = vGtaW * 13.0; float hl = hgN(hp) * 0.6 + hgN(hp * 2.3 + 4.1) * 0.4, hc = hgN(vGtaW * 1.7);',
          '  diffuseColor.rgb *= mix(vec3(0.5, 0.56, 0.42), vec3(1.12, 1.1, 0.86), hl) * mix(0.8, 1.1, hc) * mix(0.62, 1.0, smoothstep(0.0, 0.7, vGtaW.y));'].join('\n'))
        .replace('#include <normal_fragment_maps>', ['#include <normal_fragment_maps>',
          '  { float bh = hgN(vGtaW * 13.0) * 0.6 + hgN(vGtaW * 29.0 + 2.0) * 0.4; vec2 dH = vec2(dFdx(bh), dFdy(bh)) * 0.035;',
          '    vec3 sp = -vViewPosition, dx = dFdx(sp), dy = dFdy(sp), r1 = cross(dy, normal), r2 = cross(normal, dx); float det = dot(dx, r1);',
          '    normal = normalize(abs(det) * normal - sign(det) * (dH.x * r1 + dH.y * r2)); }'].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.85, 0.45, hl);'); // (大叶黄杨 leaves are glossy)
    };
    m.customProgramCacheKey = () => 'hedge' + (LOWQ ? 'l' : '');
    const byChunk = new Map();
    for (const pts of this.list) { const k = Build.chunk(pts[0][0], pts[0][1]); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(this.geo(pts)); }
    for (const gs of byChunk.values()) {
      const g = THREE.mergeGeometries(gs); gs.forEach((x) => x.dispose()); if (!g) continue; g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); Cull.add(mesh, 300);
    }
  },
};

/* ---------------- foliage: EZ-Tree 国槐 / 柳 / 桧柏 / 银杏 (assets/runtime/trees, MIT) with three LODs and wind ----------------
   near pool (lod0, the ~120 closest trees, desktop) · per-160 m-chunk lod1 (bark + leaves, casts the shadows) · per-480 m-cell
   impostor cards (a 2×2 atlas of views). Which LOD draws a tree is decided per instance in the vertex shader from its distance
   to the camera (uPoolR / uMid), so the chunk meshes never need re-sorting; the pool is refilled as the camera moves. */
const TREE_KEYS = ['guohuai', 'liu', 'cypress', 'yinxing'];
// per species: base scale (the GLBs are 9–13 m), impostor half extent / centre height (manifest), wind sway
const TREE_SP = { guohuai: { s: 0.72, he: 5.61, cy: 5.5, sway: 1 }, liu: { s: 0.82, he: 8.109, cy: 5, sway: 1.6 }, cypress: { s: 0.8, he: 4.59, cy: 4.5, sway: 0.35 }, yinxing: { s: 0.66, he: 6.63, cy: 6.5, sway: 0.8 } };
for (const k of TREE_KEYS) { Assets.need('tree/' + k, 'trees/' + k + '.glb', { tier: 'boot' }); Assets.need('treeimp/' + k, 'trees/' + k + '_impostor.webp', { tier: 'boot' }); }
const TREE_VERT = [
  '#include <begin_vertex>',
  'vec3 tIp = instanceMatrix[3].xyz; float tD = distance(uCamP.xz, tIp.xz);',
  '#if TREE_ROLE == 1',
  '  if (tD < uPoolR || tD >= uMid) transformed = vec3(0.0);',
  '#else',
  '  if (tD >= uPoolR) transformed = vec3(0.0);',
  '#endif',
  'float tW = _wind * _wind * uWS * uSway, tPh = tIp.x * 0.21 + tIp.z * 0.17;',
  'transformed.x += (sin(uWT * 1.25 + tPh) * 0.16 + sin(uWT * 3.1 + tPh * 2.0 + position.y * 0.7) * 0.035) * tW;',
  'transformed.z += (cos(uWT * 1.05 + tPh * 1.3) * 0.12 + cos(uWT * 3.7 + position.x) * 0.03) * tW;',
].join('\n');
// leaves: normals bent out from the crown (soft, rounded canopy shading), no back-face flip
const TREE_LEAFN = '#include <beginnormal_vertex>\n#ifdef TREE_LEAF\n  objectNormal = normalize(mix(objectNormal, normalize(position - vec3(0.0, uTreeCy, 0.0)) + vec3(0.0, 0.35, 0.0), 0.75));\n#endif';
const IMP_VERT = [
  '#include <begin_vertex>',
  'vec3 tIp = instanceMatrix[3].xyz, tC = uCamP - tIp; float tD = length(tC.xz); tC.y = 0.0; tC = normalize(tC + vec3(1e-4, 0.0, 0.0));',
  'mat3 tM = mat3(instanceMatrix); vec3 tR = normalize(transpose(tM) * vec3(tC.z, 0.0, -tC.x)), tL = normalize(transpose(tM) * tC);',
  'vec2 tq = uv * 2.0 - 1.0;',
  'transformed = tR * tq.x * uImp.x + vec3(0.0, uImp.y + tq.y * uImp.x, 0.0);',
  'float tK8 = mod(floor(atan(tL.x, tL.z) / 0.7853982 + 0.5) + 8.0, 8.0), tK = mod(tK8, 4.0);',
  'vec2 tCell = vec2(mod(tK, 2.0), 1.0 - floor(tK / 2.0)) * 0.5;',
  'vMapUv = tCell + vec2(tK8 > 3.5 ? 1.0 - uv.x : uv.x, uv.y) * 0.5;',
  'vNormal = normalize((viewMatrix * vec4(normalize(tC * 0.55 + vec3(0.0, 0.8, 0.0)), 0.0)).xyz);',
  'if (tD < uMid) transformed = vec3(0.0);',
].join('\n');
const Foliage = {
  sp: {}, pools: {}, ok: false, U: { uWT: { value: 0 }, uWS: { value: 1 }, uPoolR: { value: 0 }, uMid: { value: LOWQ ? 60 : 95 }, uCamP: { value: new V3() } },
  CAP: LOWQ ? 0 : 90, R0: 36, MARGIN: 6, _px: 1e9, _pz: 1e9, _t: 0, _cand: [],
  // a glTF mesh node → float geometry in the tree's frame (the GLBs are quantized: node scale / offset baked in here)
  geoOf(root, name) {
    let o = null; root.traverse((c) => { if (c.isMesh && c.name === name) o = c; }); if (!o) return null;
    o.updateWorldMatrix(true, false);
    const src = o.geometry, g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', '_wind']) {
      const a = src.attributes[k]; if (!a) continue;
      const n = a.count, sz = a.itemSize, out = new Float32Array(n * sz), get = [a.getX, a.getY, a.getZ, a.getW];
      for (let i = 0; i < n; i++) for (let j = 0; j < sz; j++) out[i * sz + j] = get[j].call(a, i);
      g.setAttribute(k, new THREE.BufferAttribute(out, sz));
    }
    if (!g.attributes._wind) g.setAttribute('_wind', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    g.setIndex(src.index ? new THREE.BufferAttribute(src.index.array.slice(), 1) : null);
    g.applyMatrix4(o.matrixWorld); g.computeBoundingSphere();
    return { g, mat: o.material };
  },
  treeMat(src, role, leaf, sp) {
    // (the species' sway / crown centre are uniforms: all four species share one program per role)
    const m = src.clone(), su = { uSway: { value: TREE_SP[sp].sway }, uTreeCy: { value: TREE_SP[sp].cy } };
    m.defines = Object.assign({}, m.defines, { GTA_LINEAR_IN: '', TREE_ROLE: role }, leaf ? { TREE_LEAF: '' } : {}); // glTF colours: already linear
    if (leaf) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; m.transparent = false; m.roughness = 0.85; }
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U, su);
      Render.cutoutPatch(sh);
      sh.vertexShader = 'attribute float _wind; uniform float uWT, uWS, uPoolR, uMid, uSway, uTreeCy; uniform vec3 uCamP;\n' + sh.vertexShader.replace('#include <begin_vertex>', TREE_VERT).replace('#include <beginnormal_vertex>', TREE_LEAFN);
      if (leaf) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif');
    };
    m.customProgramCacheKey = () => 'tree-' + role + (leaf ? 'l' : 'b');
    return m;
  },
  impMat(tex, sp) {
    const T = TREE_SP[sp], m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xe8e8e8 });
    tex.anisotropy = Math.min(4, MAX_ANISO);
    const imp = { value: new THREE.Vector2(T.he, T.cy) };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U); sh.uniforms.uImp = imp;
      sh.vertexShader = 'uniform float uMid; uniform vec2 uImp; uniform vec3 uCamP;\n' + sh.vertexShader.replace('#include <begin_vertex>', IMP_VERT);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif');
    };
    m.customProgramCacheKey = () => 'treeimp';
    return m;
  },
  prep() {
    for (const k of TREE_KEYS) {
      const G = Assets.get('tree/' + k), imp = Assets.get('treeimp/' + k); if (!G || !G.scene || !imp) continue;
      const P = (n) => this.geoOf(G.scene, n), b0 = P('bark'), l0 = P('leaves'), b1 = P('bark_lod1'), l1 = P('leaves_lod1');
      if (!b1 || !l1) continue;
      const T = TREE_SP[k], ig = new THREE.PlaneGeometry(1, 1); ig.boundingSphere = new THREE.Sphere(new V3(0, T.cy, 0), T.he * 1.3);
      // shadow caster: two crossed cards with the 0° / 90° views of the atlas (the lod meshes don't cast: far cheaper, still dappled)
      const sg = new THREE.BufferGeometry(), he = T.he * 0.96, cy = T.cy;
      sg.setAttribute('position', new THREE.Float32BufferAttribute([-he, cy - he, 0, he, cy - he, 0, he, cy + he, 0, -he, cy + he, 0, 0, cy - he, he, 0, cy - he, -he, 0, cy + he, -he, 0, cy + he, he], 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0.5, 0.5, 0.5, 0.5, 1, 0, 1, 0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], 2));
      sg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); sg.computeVertexNormals(); sg.computeBoundingSphere();
      const sm = new THREE.MeshBasicMaterial({ map: imp, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
      this.sp[k] = {
        b0: b0 && b0.g, l0: l0 && l0.g, b1: b1.g, l1: l1.g, ig, sg, sm,
        mb0: b0 && this.treeMat(b0.mat, 0, false, k), ml0: l0 && this.treeMat(l0.mat, 0, true, k), mb1: this.treeMat(b1.mat, 1, false, k), ml1: this.treeMat(l1.mat, 1, true, k),
        mi: this.impMat(imp, k),
      };
    }
    this.ok = !!(this.sp.guohuai && this.sp.liu && this.sp.cypress);
    if (!this.ok) return false;
    if (!this.sp.yinxing) this.sp.yinxing = this.sp.guohuai;
    return true;
  },
  // plant every tree list: street / park trees are mostly 国槐 with a sprinkle of 银杏, willows by the water, cypress in temples
  build() {
    const lists = { guohuai: [], liu: [], cypress: [], yinxing: [] }, c = new THREE.Color();
    for (const it of W.treeList) { it.sp = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453) % 1 < 0.13 ? 'yinxing' : 'guohuai'; lists[it.sp].push(it); }
    for (const it of W.palmList) { it.sp = 'liu'; lists.liu.push(it); }
    for (const it of W.cypressList) { it.sp = 'cypress'; lists.cypress.push(it); }
    for (const k of TREE_KEYS) {
      const items = lists[k], S = this.sp[k]; if (!items.length || !S) continue;
      for (const it of items) { const b = rand(0.8, 1.06); it.sc *= TREE_SP[k].s; it.pk = -1; it.tint = c.setRGB(b * rand(0.9, 1.04), b, b * rand(0.82, 1.0)).getHex(); }
      this.plant(k, items, S);
      // the near pool (lod0)
      if (this.CAP && S.b0 && S.l0) {
        const cap = this.CAP, im = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16), ic = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        im.setUsage(THREE.DynamicDrawUsage); ic.setUsage(THREE.DynamicDrawUsage);
        const ms = [[S.b0, S.mb0], [S.l0, S.ml0]].map(([g, mt]) => { const m = new THREE.InstancedMesh(g, mt, cap); m.instanceMatrix = im; m.instanceColor = ic; m.count = 0; m.castShadow = false; m.receiveShadow = true; scene.add(m); return m; });
        this.pools[k] = { ms, im, ic, n: 0, items: [] };
      }
    }
  },
  plant(k, items, S) {
    const byChunk = new Map(), byCell = new Map(), key = (x, z, s) => Math.floor((x - W.bounds.x0) / s) + ':' + Math.floor((z - W.bounds.z0) / s);
    for (const it of items) { const a = key(it.x, it.z, CHUNK), b = key(it.x, it.z, CHUNK * 3); if (!byChunk.has(a)) byChunk.set(a, []); byChunk.get(a).push(it); if (!byCell.has(b)) byCell.set(b, []); byCell.get(b).push(it); }
    const bounds = (list) => { let cx = 0, cz = 0; for (const it of list) { cx += it.x; cz += it.z; } cx /= list.length; cz /= list.length; let r = 0; for (const it of list) r = Math.max(r, Math.hypot(it.x - cx, it.z - cz)); return [cx, cz, r + 10]; };
    const col = new THREE.Color();
    for (const list of byChunk.values()) {
      const n = list.length, im = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16), ic = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), [cx, cz, r] = bounds(list);
      const ms = [[S.b1, S.mb1], [S.l1, S.ml1]].map(([g, mt]) => { const m = new THREE.InstancedMesh(g, mt, n); m.instanceMatrix = im; m.instanceColor = ic; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); Cull.list.push({ m, x: cx, z: cz, r, d: this.U.uMid.value + 10, night: false }); return m; });
      const sh = new THREE.InstancedMesh(S.sg, S.sm, n); sh.instanceMatrix = im; sh.castShadow = true; sh.receiveShadow = false; sh.layers.set(Render.SHADOW_LAYER); sh.matrixAutoUpdate = false; scene.add(sh);
      Cull.list.push({ m: sh, x: cx, z: cz, r, d: 170, night: false });
      list.forEach((it, i) => { it.cm = ms[0]; it.ci = i; col.setHex(it.tint); ic.setXYZ(i, col.r, col.g, col.b); });
    }
    for (const list of byCell.values()) {
      const n = list.length, [cx, cz, r] = bounds(list), m = new THREE.InstancedMesh(S.ig, S.mi, n);
      m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); Cull.list.push({ m, x: cx, z: cz, r, d: 1e9, night: false });
      const ic = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); m.instanceColor = ic;
      list.forEach((it, i) => { it.fm = m; it.fi = i; col.setHex(it.tint); ic.setXYZ(i, col.r, col.g, col.b); });
    }
  },
  poolSet(it, m4) { const P = this.pools[it.sp]; if (!P) return; m4.toArray(P.im.array, it.pk * 16); P.im.needsUpdate = true; },
  // refill the near pools around the camera: everything within poolR + MARGIN is in, so the camera can move MARGIN before a refill
  refill(cx, cz) {
    const C = this._cand; C.length = 0;
    const R = this.R0 + this.MARGIN;
    forProps(cx, cz, R, (it) => { if (it.sp && it.cm) { it._d = Math.hypot(it.x - cx, it.z - cz); C.push(it); } });
    C.sort((a, b) => a._d - b._d);
    let poolR = this.R0;
    if (C.length > this.CAP) poolR = Math.max(0, C[this.CAP - 1]._d - this.MARGIN);
    for (const k in this.pools) { const P = this.pools[k]; for (const it of P.items) it.pk = -1; P.items.length = 0; P.n = 0; }
    for (const it of C) {
      if (it._d >= poolR + this.MARGIN) break;
      const P = this.pools[it.sp]; if (!P) continue;
      it.pk = P.n++; P.items.push(it);
      P.im.array.set(it.cm.instanceMatrix.array.subarray(it.ci * 16, it.ci * 16 + 16), it.pk * 16);
      P.ic.setXYZ(it.pk, it.cm.instanceColor.getX(it.ci), it.cm.instanceColor.getY(it.ci), it.cm.instanceColor.getZ(it.ci));
    }
    for (const k in this.pools) { const P = this.pools[k]; for (const m of P.ms) m.count = P.n; P.im.needsUpdate = true; P.ic.needsUpdate = true; }
    this.U.uPoolR.value = poolR; this._px = cx; this._pz = cz;
  },
  update(dt) {
    if (!this.ok) return;
    this.U.uWT.value = (this.U.uWT.value + dt) % 1000;
    const w = Weather.str; this.U.uWS.value = 1 + 1.4 * w.rain + 2.2 * w.sand + 0.6 * w.snow;
    if (!this.CAP) return;
    this._t -= dt;
    const cx = camera.position.x, cz = camera.position.z;
    if (this._t <= 0 || Math.abs(cx - this._px) + Math.abs(cz - this._pz) > this.MARGIN * 0.6) { this._t = 0.5; this.refill(cx, cz); }
  },
};
Hooks.update(function foliage(dt) { if (!Interiors.cur) Foliage.update(dt); });

/* ---------------- the ground: one plane shaded from a road / alley / park / plaza SDF ---------------- */
const SDF_BAND = 4;
// layers (texture array index): 0 asphalt · 1 sidewalk tiles · 2 tactile strip (盲道) · 3 grass · 4 big stone paving (plazas, palace) ·
// 5 hutong brick paving · 6 dirt (park paths, bare patches) · 7 granite (kerbstones). Normals in a u = +x, v = −z frame.
const GROUND_GLSL = [
  'uniform sampler2D tSdf, tWear; uniform highp sampler2DArray tGA;',
  '#ifdef GROUND_HI', 'uniform highp sampler2DArray tGN, tGR;', '#endif',
  'uniform vec4 uB; uniform float uWet, uRain, uTime; varying vec3 vGW;',
  'vec3 gA = vec3(0.0), gN = vec3(0.0), gR = vec3(0.0); vec3 gNw = vec3(0.0, 1.0, 0.0); float gRough = 0.9, gAO = 1.0, gPud = 0.0;',
  'float gH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float gV(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gH(i), gH(i + vec2(1.0, 0.0)), f.x), mix(gH(i + vec2(0.0, 1.0)), gH(i + 1.0), f.x), f.y); }',
  'float gF(vec2 p){ return gV(p) * 0.55 + gV(p * 2.13 + 5.7) * 0.3 + gV(p * 4.71 + 1.3) * 0.15; }',
  'void gLay(float i, float w, vec2 uv){',
  '  if (w < 0.003) return;',
  '  vec3 q = vec3(uv, i); gA += texture(tGA, q).rgb * w;',
  '#ifdef GROUND_HI',
  '  gN += (texture(tGN, q).xyz * 2.0 - 1.0) * w; gR += texture(tGR, q).rgb * w;',
  '#else',
  '  gN += vec3(0.0, 0.0, w); gR += vec3(1.0, 0.85, 0.0) * w;',
  '#endif',
  '}',
].join('\n') + '\n';
const GROUND_MAP = [
  'vec2 suv = (vGW.xz - uB.xy) * uB.zw;',
  'vec4 S = (texture2D(tSdf, suv) * 255.0 - 128.0) / 127.0 * ' + SDF_BAND.toFixed(1) + ';',
  'float outside = step(1.0, max(max(-suv.x, suv.x - 1.0), max(-suv.y, suv.y - 1.0)) + 1.0);',
  'float aa = 0.04 + length(fwidth(vGW.xz)) * 0.9;',
  'vec2 wp = vec2(vGW.x, -vGW.z);',
  'float mac = gF(vGW.xz * 0.04), mac2 = gF(vGW.xz * 0.13 + 7.7);',
  // weights: road, kerb (0.3 m of granite along every road edge), hutong / pedestrian lanes, plazas, parks, tactile strip, sidewalk
  'float wRoad = 1.0 - smoothstep(-aa, aa, S.r);',
  'float wAlley = (1.0 - smoothstep(-aa, aa, S.g)) * (1.0 - wRoad);',
  'float wCurb = (1.0 - wRoad) * (1.0 - smoothstep(0.3 - aa, 0.3 + aa, S.r)) * (1.0 - wAlley);',
  'float rest = (1.0 - wRoad) * (1.0 - wAlley) * (1.0 - wCurb);',
  'float wPlaza = (1.0 - smoothstep(-aa, aa, S.a)) * rest;',
  'float wPark = max(1.0 - smoothstep(-aa, aa, S.b), outside) * rest * (1.0 - wPlaza / max(rest, 1e-3));',
  'float wDirt = wPark * smoothstep(0.6, 0.72, mac2) * (1.0 - outside * 0.5);',
  'float wWalk = max(0.0, rest - wPlaza - wPark);',
  'float wTac = wWalk * smoothstep(1.2 - aa, 1.2 + aa, S.r) * (1.0 - smoothstep(1.75 - aa, 1.75 + aa, S.r));',
  'wWalk -= wTac;',
  'if (wRoad > 0.003) {',
  '  vec3 q = vec3(wp / 3.0, 0.0); vec3 a = texture(tGA, q).rgb; a = mix(a, texture2D(tWear, wp / 30.0).rgb, 0.4);',
  '  a *= 0.82 + 0.18 * smoothstep(-1.2, -0.15, S.r);', // grime in the gutters
  '  gA += a * wRoad;',
  '#ifdef GROUND_HI',
  '  gN += (texture(tGN, q).xyz * 2.0 - 1.0) * wRoad; gR += texture(tGR, q).rgb * wRoad;',
  '#else',
  '  gN += vec3(0.0, 0.0, wRoad); gR += vec3(1.0, 0.9, 0.0) * wRoad;',
  '#endif',
  '}',
  'gLay(7.0, wCurb, wp / 2.0 * vec2(1.0, 0.25)); gLay(5.0, wAlley, wp / 2.0); gLay(4.0, wPlaza, wp / 7.5); gLay(3.0, wPark - wDirt, wp / 2.6);',
  'gLay(6.0, wDirt, wp / 1.4); gLay(1.0, wWalk, wp / 2.0); gLay(2.0, wTac, wp / 1.2);',
  // the big plaza slabs read too busy at full contrast; the tactile strip is a worn ochre, not paint-yellow
  // (plazas: the slab-to-slab contrast halved round a warm light grey; the strip: ochre tiles a shade darker than the pavement)
  'if (wPlaza > 0.003) { float pl = dot(gA, vec3(0.333)); gA = mix(gA, mix(vec3(pl), vec3(0.62, 0.6, 0.56), 0.55) * vec3(1.03, 1.0, 0.95), 0.6 * wPlaza) * (1.0 + 0.1 * wPlaza); }',
  'gA = mix(gA, vec3(dot(gA, vec3(0.333))) * vec3(1.08, 0.95, 0.66), 0.7 * wTac) * (1.0 - 0.14 * wTac);',
  // big soft variation so no tile repeats read at a distance; parks a touch warmer and patchier
  'gA *= (0.86 + 0.26 * mac) * mix(vec3(1.0), vec3(1.02, 1.04, 0.92), wPark);',
  'vec3 tn = normalize(gN + vec3(0.0, 0.0, 0.02));',
  'gNw = normalize(vec3(tn.x, tn.z, -tn.y));',
  'gRough = clamp(gR.g, 0.05, 1.0); gAO = mix(1.0, gR.r, 0.85);',
  // the kerb's road face: tilt the normal toward the road so the edge catches light / falls into shade
  'if (wCurb > 0.01 && S.r < 0.14) {',
  '  float e = 0.35 * uB.z; vec2 gr = vec2(texture2D(tSdf, suv + vec2(e, 0.0)).r - texture2D(tSdf, suv - vec2(e, 0.0)).r, texture2D(tSdf, suv + vec2(0.0, 0.35 * uB.w)).r - texture2D(tSdf, suv - vec2(0.0, 0.35 * uB.w)).r);',
  '  if (dot(gr, gr) > 1e-8) { gr = normalize(gr); gNw = normalize(mix(gNw, vec3(-gr.x, 0.35, -gr.y), 0.8 * smoothstep(0.14, 0.0, S.r) * wCurb)); gA *= 0.85; }',
  '}',
  // snow: it softens the paving's relief (tile joints, kerb edges) but a third of it still shows through
  'if (gtaWx.x > 0.001) { float gsn = clamp(gtaWx.x * 1.5, 0.0, 1.0); gNw = normalize(mix(gNw, vec3(0.0, 1.0, 0.0), gsn * 0.62)); gRough = mix(gRough, mix(0.8, 0.38, wRoad), gsn); gAO = mix(gAO, 1.0, gsn * 0.6); }',
  // rain: darker, glossier ground and puddles in the dips (mirror-smooth, with rain rings)
  'if (uWet > 0.01) {',
  '  float dry = wPark * 0.6;',
  '  gPud = smoothstep(0.58, 0.68, gF(vGW.xz * 0.16 + 3.1)) * smoothstep(0.3, 0.9, uWet) * (1.0 - wPark);',
  '  gA *= mix(1.0, 0.62, uWet * (1.0 - dry)) * (1.0 - 0.35 * gPud);',
  '  gRough = mix(gRough, mix(0.32, 0.03, gPud), uWet * (1.0 - dry));',
  '  gNw = normalize(mix(gNw, vec3(0.0, 1.0, 0.0), max(gPud, uWet * 0.5)));',
  '  if (uRain > 0.01) {',
  '    vec2 rp = vGW.xz * 1.7, ci = floor(rp), cf = fract(rp) - 0.5; float h = gH(ci), ph = fract(uTime * 0.9 + h), dd = length(cf - (vec2(h, gH(ci + 3.1)) - 0.5) * 0.4);',
  '    float ring = sin((dd - ph * 0.42) * 60.0) * (1.0 - ph) * smoothstep(0.42 * ph + 0.06, 0.0, abs(dd - ph * 0.42));',
  '    gNw = normalize(gNw + vec3(cf.x, 0.0, cf.y) * ring * 0.9 * uRain * (0.25 + gPud));',
  '  }',
  '}',
  'diffuseColor.rgb *= gA;',
].join('\n');
// snow on the pavements / lanes / plazas (after the generic snow cover made them plain white): thin patches where the paving and
// its joints show through, trodden grey slush down the lane centres and along the walls and kerbs, a few glints in the sun
const GROUND_SNOW = [
  'if (gtaWx.x > 0.001 && wRoad < 0.99) {',
  '  float sn = clamp(gtaWx.x * 1.5, 0.0, 1.0), n = gF(vGW.xz * 0.55 + 5.3) * 0.6 + gF(vGW.xz * 2.3 + 1.7) * 0.4;',
  '  vec3 pre = gtaLin(gPre); float lu = dot(pre, vec3(0.333));',
  '  float cov = mix(0.62, 1.0, smoothstep(0.3, 0.6, n)) * (1.0 - 0.3 * (1.0 - smoothstep(0.008, 0.04, lu)));',
  '  float dirt = max(wAlley * max(smoothstep(-1.1, -1.8, S.g), 1.0 - smoothstep(0.0, 0.5, -S.g)), max(wCurb, wWalk * (1.0 - smoothstep(0.3, 1.6, S.r))) * 0.8);',
  '  dirt *= 0.75 * smoothstep(0.38, 0.7, gF(vGW.xz * 0.7 + 9.1));',
  '  vec3 top = mix(vec3(0.78, 0.82, 0.88) * (0.93 + 0.07 * gF(vGW.xz * 7.0)), mix(pre * 0.6, vec3(0.26, 0.27, 0.28), 0.5), dirt * 0.8);',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, mix(pre, top, cov * sn), 1.0 - wRoad);',
  '  vec3 gv = cameraPosition - vGW; vec2 gc = floor(vGW.xz * 24.0) + floor(normalize(gv).xz * 9.0);',
  '  float sp = step(0.9965, fract(sin(dot(gc, vec2(12.99, 78.23))) * 43758.5)) * cov * sn * (1.0 - dirt) * (1.0 - wRoad) * (1.0 - smoothstep(6.0, 18.0, length(gv)));',
  '  totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * sp * clamp(length(gtaScat) * 10.0, 0.0, 1.0) * 1.5;',
  '}',
].join('\n');
const Ground = {
  tex: null, res: 1, mesh: null, U: null,
  build() {
    const res = this.res = LOWQ ? 2 : 1, B = W.bounds;
    const x0 = B.x0 - 8, z0 = B.z0 - 8, w = Math.ceil((B.x1 - B.x0 + 16) / res), h = Math.ceil((B.z1 - B.z0 + 16) / res);
    const data = new Uint8Array(w * h * 4);
    const f = new Float32Array(w * h);
    const cap = (ax, az, bx, bz, r) => { // min(distance - r) within the band
      const R = r + SDF_BAND, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - x0) / res)), i1 = Math.min(w - 1, Math.floor((Math.max(ax, bx) + R - x0) / res));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R - z0) / res)), j1 = Math.min(h - 1, Math.floor((Math.max(az, bz) + R - z0) / res));
      for (let j = j0; j <= j1; j++) {
        const z = z0 + (j + 0.5) * res;
        for (let i = i0; i <= i1; i++) {
          const x = x0 + (i + 0.5) * res;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), ex = x - ax - dx * t, ez = z - az - dz * t;
          const v = Math.sqrt(ex * ex + ez * ez) - r, k = j * w + i;
          if (v < f[k]) f[k] = v;
        }
      }
    };
    const inside = new Uint8Array(w * h);
    const fillPoly = (rings) => { // scanline mark inside
      let zmin = Infinity, zmax = -Infinity;
      for (const r of rings) for (const p of r) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
      const xs = [];
      for (let j = Math.max(0, Math.floor((zmin - z0) / res)); j <= Math.min(h - 1, Math.ceil((zmax - z0) / res)); j++) {
        const z = z0 + (j + 0.5) * res; xs.length = 0;
        for (const r of rings) for (let k = 0, n = r.length; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil((xs[k] - x0) / res - 0.5)); i <= Math.min(w - 1, Math.floor((xs[k + 1] - x0) / res - 0.5)); i++) inside[j * w + i] ^= 1;
      }
    };
    const channel = (c, fillFn, polys) => {
      f.fill(SDF_BAND);
      if (polys) {
        inside.fill(0);
        for (const rings of polys) { fillPoly(rings); for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; cap(a[0], a[1], b[0], b[1], 0); } }
        for (let k = 0; k < f.length; k++) if (inside[k]) f[k] = -f[k];
      } else fillFn();
      for (let k = 0; k < f.length; k++) data[k * 4 + c] = clamp(Math.round(128 + f[k] * (127 / SDF_BAND)), 0, 255);
    };
    const roadSeg = (keep) => () => { for (const e of Roads.edges) if (keep(e.cls)) for (let i = 0; i < e.pts.length - 1; i++) cap(e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1], e.hw); };
    channel(0, roadSeg((c) => c <= 5));
    channel(1, roadSeg((c) => c >= 6));
    channel(2, null, W.greenPolys.map((p) => p.rings));
    channel(3, null, W.plazaPolys);
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
    this.tex = t;
    // surface layers (PBR photo sets in one texture array each for albedo / normal / ARM; the old canvas look where a set is missing)
    const L = [['asphalt', TEX.asphalt], ['sidewalk', TEX.walk], ['tactile', null], ['grass', TEX.grass], ['paving_stone', TEX.stone], ['hutong_paving', TEX.paving], ['dirt', TEX.sand], ['granite_tile', TEX.concrete]];
    const src = L.map(([k, fb]) => (PBR.has(k) ? k : fb ? fb.image : null)), hi = PBR.HI && PBR.has('asphalt');
    this.U = { tSdf: { value: t }, uB: { value: new THREE.Vector4(x0, z0, 1 / (w * res), 1 / (h * res)) }, uWet: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 },
      tGA: { value: PBR.array(src, 'albedo') }, tWear: { value: PBR.tex('asphalt_wear', 'albedo', 1) || TEX.asphalt } };
    if (hi) { this.U.tGN = { value: PBR.array(L.map(([k]) => k), 'normal') }; this.U.tGR = { value: PBR.array(L.map(([k]) => k), 'arm', PBR.S / 2) }; }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    const U = this.U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = (hi ? '#define GROUND_HI\n' : '') + GROUND_GLSL + sh.fragmentShader
        .replace('#include <map_fragment>', GROUND_MAP)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = gRough;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize((viewMatrix * vec4(gNw, 0.0)).xyz);')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n  reflectedLight.indirectDiffuse *= gAO; reflectedLight.indirectSpecular *= mix(1.0, gAO, 0.6);')
        // snow: the carriageways are ploughed grey slush with dirty white patches, not a clean white sheet
        .replace('#include <gta_lit_fragment>', 'vec3 gPre = diffuseColor.rgb;\n#include <gta_lit_fragment>\n' + GROUND_SNOW +
          '\n  if (gtaWx.x > 0.001 && wRoad > 0.01) { float gsl = gF(vGW.xz * 0.35 + 2.0); diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.08, 0.08, 0.09), vec3(0.34, 0.35, 0.37), smoothstep(0.4, 0.78, gsl)), wRoad * clamp(gtaWx.x * 1.3, 0.0, 1.0) * 0.8); }')
        // wet ground: the sky in it is a soft grey sheen outside the puddles
        .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  radiance = mix(radiance, vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))) * vec3(1.0, 0.96, 0.9), 0.5 * uWet * (1.0 - gPud));');
    };
    mat.customProgramCacheKey = () => 'ground-v7' + (hi ? 'h' : '');
    const B2 = W.bounds, gw = B2.x1 - B2.x0 + 1400, gh = B2.z1 - B2.z0 + 1400;
    const g = new THREE.PlaneGeometry(gw, gh, 1, 1); g.rotateX(-Math.PI / 2);
    g.translate((B2.x0 + B2.x1) / 2, 0, (B2.z0 + B2.z1) / 2);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = -2;
    scene.add(m); this.mesh = m;
  },
  // signed distance to the nearest asphalt road edge (negative on the road)
  roadSdf(x, z) { return this._s(x, z, 0); },
  _s(x, z, c) {
    const t = this.tex; if (!t) return 9;
    const u = this.U.uB.value, i = Math.floor((x - u.x) * u.z * t.image.width), j = Math.floor((z - u.y) * u.w * t.image.height);
    if (i < 0 || j < 0 || i >= t.image.width || j >= t.image.height) return 9;
    return (t.image.data[(j * t.image.width + i) * 4 + c] - 128) / 127 * SDF_BAND;
  },
};

/* ---------------- road markings, crossings, bridges ---------------- */
function buildMarkings() {
  const white = 0, yellow = 1, byChunk = new Map();
  const quad = (list, ax, az, bx, bz, wd, y = 0.025) => {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * wd / 2, nz = dx / L * wd / 2;
    const k = Build.chunk(ax, az); let c = byChunk.get(k); if (!c) byChunk.set(k, c = [[], []]);
    c[list].push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
  };
  const along = (e, off, dash, gap, list, wd, trim) => {
    const P = [0, 0, 0, 1], Q = [0, 0, 0, 1];
    for (let s = trim; s < e.len - trim; s += dash + gap) {
      const s2 = Math.min(e.len - trim, s + dash);
      Roads.at(e, s, P); Roads.at(e, s2, Q);
      quad(list, P[0] - P[3] * off, P[1] + P[2] * off, Q[0] - Q[3] * off, Q[1] + Q[2] * off, wd);
    }
  };
  for (const e of Roads.edges) {
    const C = e.C; if (!C.marks || e.len < 14) continue;
    const trimA = Math.min(e.len / 2 - 1, 7 + e.hw * 0.6);
    if (e.oneway) {
      const n = Math.max(1, Math.floor(e.w / LANE_W));
      for (let k = 1; k < n; k++) along(e, (k - n / 2) * LANE_W, 3, 4, white, 0.14, trimA);
      along(e, -e.hw + 0.5, e.len, 0, white, 0.14, trimA); along(e, e.hw - 0.5, e.len, 0, white, 0.14, trimA);
    } else {
      along(e, 0.16, e.len, 0, yellow, 0.13, trimA); along(e, -0.16, e.len, 0, yellow, 0.13, trimA);
      for (let k = 1; k < C.lanes; k++) { along(e, (k + 0.6) * LANE_W * 0.92, 3, 4, white, 0.13, trimA); along(e, -(k + 0.6) * LANE_W * 0.92, 3, 4, white, 0.13, trimA); }
    }
  }
  // zebra crossings where marked roads meet (one per spot: short edges and divided-road crossings would stack them) → W.zebras
  const P = [0, 0, 0, 1], zs = W.zebras = [];
  for (const n of Roads.nodes) {
    if (n.deg < 3) continue;
    for (const e of n.edges) {
      if (!e.C.marks || e.len < 20) continue;
      const atA = e.a === n.id, s = atA ? Math.min(e.len * 0.4, 3.5 + e.hw * 0.6) : Math.max(e.len * 0.6, e.len - 3.5 - e.hw * 0.6);
      Roads.at(e, s, P);
      if (zs.some((z) => (z.x - P[0]) ** 2 + (z.z - P[1]) ** 2 < 5.5 * 5.5)) continue;
      zs.push({ e, s, x: P[0], z: P[1] });
      const nx = -P[3], nz = P[2];
      for (let t = -e.hw + 0.8; t < e.hw - 0.6; t += 1.1) quad(white, P[0] + nx * t - P[2] * 1.3, P[1] + nz * t - P[3] * 1.3, P[0] + nx * t + P[2] * 1.3, P[1] + nz * t + P[3] * 1.3, 0.55, 0.027);
    }
  }
  // paint: one mesh per chunk and colour, faded out beyond 380 m (it's 2 cm thick anyway)
  const mats = [0xe9e7e0, 0xe0b43a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  W.markMats = mats;
  for (const c of byChunk.values()) for (let k = 0; k < 2; k++) {
    const arr = c[k]; if (!arr.length) continue;
    const g = new THREE.BufferGeometry(), nor = new Float32Array(arr.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const m = new THREE.Mesh(g, mats[k]); m.receiveShadow = true; m.renderOrder = -1; scene.add(m); Cull.add(m, 380);
  }
}
/* ---------------- kerbs: a granite kerb stone along every carriageway edge (a 12 cm step, a chamfer, a short ramp back down to
   the pavement), cut wherever the kerb line would run into another road (junctions, entries), into water, or across a zebra
   (dropped kerbs). Built in world space, merged per chunk. ---------------- */
function buildKerbs() {
  const P = [0, 0, 0, 1], byChunk = new Map(), H = 0.12, step = LOWQ ? 3 : 2;
  const sec = [[0, 0], [0, H - 0.025], [0.035, H], [0.2, H], [0.42, 0.012]]; // (offset out from the road edge, height)
  const zebras = new Map(); // edge id → [s] of its zebra crossings (buildMarkings)
  for (const z of W.zebras || []) { if (!zebras.has(z.e.id)) zebras.set(z.e.id, []); zebras.get(z.e.id).push(z.s); }
  const emit = (run) => {
    const k = Build.chunk(run[0][0], run[0][1]); let c = byChunk.get(k); if (!c) byChunk.set(k, c = { p: [], n: [], u: [] });
    for (let i = 0; i < run.length - 1; i++) {
      const a = run[i], b = run[i + 1], u0 = a[4], u1 = b[4];
      for (let j = 0; j < sec.length - 1; j++) {
        const [o0, h0] = sec[j], [o1, h1] = sec[j + 1], dl = Math.hypot(o1 - o0, h1 - h0) || 1, sn = -(h1 - h0) / dl, su = (o1 - o0) / dl; // section normal: sn along n, su up
        const A0 = [a[0] + a[2] * o0, h0, a[1] + a[3] * o0], A1 = [a[0] + a[2] * o1, h1, a[1] + a[3] * o1], B0 = [b[0] + b[2] * o0, h0, b[1] + b[3] * o0], B1 = [b[0] + b[2] * o1, h1, b[1] + b[3] * o1];
        const na = [a[2] * sn, su, a[3] * sn], nb = [b[2] * sn, su, b[3] * sn], v0 = j * 0.15, v1 = v0 + dl;
        // wind so the face looks along its section normal
        const ex = B0[0] - A0[0], ey = B0[1] - A0[1], ez = B0[2] - A0[2], fx = A1[0] - A0[0], fy = A1[1] - A0[1], fz = A1[2] - A0[2];
        const flip = (ey * fz - ez * fy) * na[0] + (ez * fx - ex * fz) * na[1] + (ex * fy - ey * fx) * na[2] < 0;
        const T = flip ? [[A0, na, u0, v0], [A1, na, u0, v1], [B0, nb, u1, v0], [B0, nb, u1, v0], [A1, na, u0, v1], [B1, nb, u1, v1]] : [[A0, na, u0, v0], [B0, nb, u1, v0], [A1, na, u0, v1], [B0, nb, u1, v0], [B1, nb, u1, v1], [A1, na, u0, v1]];
        for (const [p, nn, u, v] of T) { c.p.push(p[0], p[1], p[2]); c.n.push(nn[0], nn[1], nn[2]); c.u.push(u, v); }
      }
    }
  };
  for (const e of Roads.edges) {
    if (e.cls > 5 || e.len < 3) continue;
    const zs = zebras.get(e.id) || [], n = Math.max(1, Math.ceil(e.len / step));
    for (const side of [1, -1]) {
      let run = [];
      for (let i = 0; i <= n; i++) {
        const s = (e.len * i) / n; Roads.at(e, s, P);
        const nx = -P[3] * side, nz = P[2] * side, bx = P[0] + nx * e.hw, bz = P[1] + nz * e.hw;
        const ok = Ground.roadSdf(bx + nx * 0.3, bz + nz * 0.3) > 0.12 && Ground._s(bx + nx * 0.3, bz + nz * 0.3, 1) > 0.12 && Grid.at(bx + nx * 0.6, bz + nz * 0.6) !== GK.WATER && !zs.some((z) => Math.abs(z - s) < 1.8);
        if (ok) run.push([bx, bz, nx, nz, s]); else { if (run.length > 1) emit(run); run = []; }
      }
      if (run.length > 1) emit(run);
    }
  }
  const mat = PBR.mat('granite_tile', { color: 0xeeece6, tile: 1.2 }) || new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0xd8d4cc });
  for (const c of byChunk.values()) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(c.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(c.u, 2));
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); Cull.add(m, 240);
  }
}
// stone decks where streets cross lakes / moats (the water grid is cleared under them)
function buildBridges() {
  const parts = [], P = [0, 0, 0, 1];
  for (const e of Roads.edges) {
    let run = null;
    const flush = (s1) => {
      if (!run) return;
      const s0 = Math.max(0, run - 2), s2 = Math.min(e.len, s1 + 2), mid = (s0 + s2) / 2, L = s2 - s0;
      Roads.at(e, mid, P);
      const ang = Math.atan2(P[2], P[3]), wd = e.w + 1;
      parts.push(box(P[0], 0.42, P[1], wd, 0.36, L, 0xb9b4aa, ang));
      for (const sd of [-1, 1]) {
        const ox = -P[3] * sd * (wd / 2 - 0.2), oz = P[2] * sd * (wd / 2 - 0.2);
        parts.push(box(P[0] + ox, 1.0, P[1] + oz, 0.3, 0.8, L, 0xd8d4ca, ang), box(P[0] + ox, 1.45, P[1] + oz, 0.2, 0.1, L, 0xe8e4da, ang));
        // 望柱: marble posts along the parapet
        for (let t = -L / 2 + 0.3; t <= L / 2 - 0.2; t += 1.8) parts.push(box(P[0] + ox + P[2] * t, 1.0, P[1] + oz + P[3] * t, 0.36, 1.3, 0.36, 0xeeeae2, ang), box(P[0] + ox + P[2] * t, 1.72, P[1] + oz + P[3] * t, 0.26, 0.16, 0.26, 0xe0dcd2, ang));
      }
      W.dry.push({ e, s0, s1: s2 });
      run = null;
    };
    for (let s = 0; s <= e.len; s += 1) {
      Roads.at(e, s, P);
      const wet = Grid.at(P[0], P[1]) === GK.WATER;
      if (wet && run === null) run = s; else if (!wet && run !== null) flush(s);
    }
    flush(e.len);
  }
  // clear the water under each deck so you can drive across
  for (const d of W.dry) for (let s = d.s0; s <= d.s1; s += 0.8) { Roads.at(d.e, s, P); Grid.capsule(P[0], P[1], P[0] + 0.01, P[1], d.e.hw + 0.6, (i) => { if (Grid.kind[i] === GK.WATER) Grid.kind[i] = GK.ROAD; }); }
  Build.props.push(...parts); // merged per chunk
}

/* ---------------- traffic lights on the big crossings ---------------- */
// list: [{ n, phase, heads: [{ head: {x,y,z,ry}, axis, e }] }]; node.signal = its entry.
// Cycle (34 s): axis 0 green 0–11, amber 11–14, all red 14–17, axis 1 green 17–28, amber 28–31, all red 31–34.
// A divided-road crossing is up to 4 graph nodes: they share one phase so the whole crossing switches together.
const Signals = {
  list: [], items: [], t: 0, _k: 0,
  COL: [new THREE.Color(0xff2a2a), new THREE.Color(0x3aff6a), new THREE.Color(0xffb020)],
  build() {
    const P = [0, 0, 0, 1];
    const cand = Roads.nodes.filter((n) => n.deg >= 3 && n.edges.filter((e) => e.cls <= 3).length >= 2);
    const cid = new Map(), phases = [];
    for (const n of cand) {
      if (cid.has(n)) continue;
      const q = [n], c = phases.length; cid.set(n, c); phases.push(rand(0, 34));
      while (q.length) { const a = q.pop(); for (const b of cand) if (!cid.has(b) && Math.abs(a.x - b.x) < 30 && dist2(a.x, a.z, b.x, b.z) < 30 * 30) { cid.set(b, c); q.push(b); } }
    }
    const poles = new Map(); // crossing id -> [[x, z]]: one mast per approach, not one per graph node
    for (const n of cand) {
      const sig = { n, phase: phases[cid.get(n)], heads: [], cid: cid.get(n) }, pl = poles.get(sig.cid) || poles.set(sig.cid, []).get(sig.cid);
      let live = false;
      for (const e of n.edges) {
        if (!e.C.traffic) continue;
        live = true;
        // stubs inside a divided-road crossing get no mast of their own
        const o = Roads.nodes[e.a === n.id ? e.b : e.a]; if (o && cid.get(o) === sig.cid) continue;
        const atA = e.a === n.id; Roads.at(e, atA ? Math.min(6, e.len / 2) : Math.max(e.len - 6, e.len / 2), P);
        const axis = Math.abs(P[3]) > Math.abs(P[2]) ? 0 : 1; // (same sample as axisOf)
        // far-side signal: pole on the kerb corner right of the outgoing lanes (past the crossing road's asphalt, on the
        // sidewalk: never out on a wide road's zebra), a mast arm over the lanes, the head faces the crossing
        let s0 = 1.2; for (const o of n.edges) if (o !== e && o.C.traffic) s0 = Math.max(s0, o.hw + 1.2);
        const off = e.hw + Math.max(0.7, e.C.walk * 0.45);
        let dx = 0, dz = 0, px = 0, pz = 0, sd = 1, ok = false;
        for (const side of [1, -1]) { // a one-way carriageway coming in has its kerb on the other hand (the median is on the right)
          for (let k = 0, s = s0; k < 12 && !ok; k++, s += 1.5) {
            const ss = Math.min(s, e.len / 2); Roads.at(e, atA ? ss : e.len - ss, P);
            dx = atA ? P[2] : -P[2]; dz = atA ? P[3] : -P[3]; // pointing away from the node
            px = P[0] - dz * off * side; pz = P[1] + dx * off * side;
            const g = Grid.at(px, pz); ok = g === GK.WALK || g === GK.FREE || g === GK.PLAZA || g === GK.PARK;
            if (ss >= e.len / 2) break;
          }
          if (ok) { sd = side; break; }
        }
        if (!ok) continue; // no kerb to stand on (a short stub between carriageways): the other approaches carry the crossing
        const arm = Math.min(off - e.hw * 0.25, 7.5), ry = Math.atan2(-dx, -dz), ax = px + dz * arm * sd, az = pz - dx * arm * sd;
        if (pl.some((q) => dist2(q[0], q[1], px, pz) < 8 * 8)) continue; pl.push([px, pz]);
        addSolid(null, { x0: px - 0.2, x1: px + 0.2, z0: pz - 0.2, z1: pz + 0.2, h: 1.1, kind: 'pillar' }); // low h: the chase camera ignores it
        Build.props.push(box(px, 2.9, pz, 0.24, 5.8, 0.24, 0x3a3f47), box((px + ax) / 2, 5.7, (pz + az) / 2, 0.16, 0.16, arm, 0x3a3f47, Math.atan2(dz, -dx)),
          box(ax, 5.1, az, 0.5, 1.3, 0.34, 0x1b1e24, ry), box(px - dx * 0.2, 2.6, pz - dz * 0.2, 0.34, 0.5, 0.12, 0x1b1e24, ry));
        const it = { x: ax - dx * 0.2, y: 5.1, z: az - dz * 0.2, ry, axis, sig, st: -1, c: 0xff2a2a };
        this.items.push(it);
        sig.heads.push({ head: it, axis, e });
      }
      if (live) { this.list.push(sig); n.signal = sig; }
    }
    // the lit lamps: one instanced mesh per chunk, coloured per instance
    const g = new THREE.BoxGeometry(0.36, 0.36, 0.06);
    chunkStatic(this.items, g, new THREE.MeshBasicMaterial({ color: 0xffffff }), 420);
  },
  // 0 red, 1 green, 2 amber for an approach axis
  state(sig, axis) { const t = (this.t + sig.phase) % 34, u = axis === 0 ? t : t - 17; return u >= 0 && u < 11 ? 1 : u >= 11 && u < 14 ? 2 : 0; },
  // green (or amber) for this approach axis?
  green(sig, axis) { const t = (this.t + sig.phase) % 34; return axis === 0 ? t < 14 : t >= 17 && t < 31; },
  axisOf(e, n) { const P = Roads.at(e, e.a === n.id ? Math.min(6, e.len / 2) : Math.max(e.len - 6, e.len / 2), [0, 0, 0, 1]); return Math.abs(P[3]) > Math.abs(P[2]) ? 0 : 1; },
  update(dt) {
    this.t += dt;
    if ((this._k = this._k + 1) % 6) return;
    const px = camera.position.x, pz = camera.position.z, dirty = this._d || (this._d = new Set());
    for (const it of this.items) {
      if (Math.abs(it.x - px) > 260 || Math.abs(it.z - pz) > 260) continue;
      const st = this.state(it.sig, it.axis);
      if (st !== it.st) { it.st = st; it._m.setColorAt(it.ci, this.COL[st]); dirty.add(it._m); }
    }
    for (const m of dirty) m.instanceColor.needsUpdate = true;
    dirty.clear();
  },
};

/* ---------------- water: lakes, moats, rivers ---------------- */
function buildWater() {
  const d = MAPD.raw;
  // rasterize
  for (const poly of d.water) {
    const rings = poly.map((f) => MAPD.pts(f));
    Grid.poly(rings, (i) => { Grid.kind[i] = GK.WATER; });
    W.water.push(rings);
  }
  for (const r of d.rivers) {
    const wd = r[0] * MAPD.k, pts = MAPD.pts(r.slice(1));
    for (let i = 0; i < pts.length - 1; i++) Grid.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], wd / 2, (k) => { Grid.kind[k] = GK.WATER; });
    W.water.push({ line: pts, w: wd });
  }
}
function waterMeshes() {
  Water.init();
  const geos = [];
  for (const wv of W.water) {
    if (wv.line) {
      const pts = wv.line, hw = wv.w / 2, pos = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        pos.push(pts[i][0] - dz / L * hw, 0, pts[i][1] + dx / L * hw, pts[i][0] + dz / L * hw, 0, pts[i][1] - dx / L * hw);
        if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); geos.push(g);
      continue;
    }
    const outer = wv[0].map((p) => new THREE.Vector2(p[0], p[1])), holes = wv.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
    const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    const all = [...outer, ...holes.flat()], pos = [];
    for (const v of all) pos.push(v.x, 0, v.y);
    const idx = []; for (const t of tris) idx.push(t[0], t[2], t[1]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); geos.push(g);
  }
  for (const d of W.decoWater || []) { // 金水河 channels in the palace / in front of 天安门
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([d.x0, 0, d.z0, d.x1, 0, d.z0, d.x1, 0, d.z1, d.x0, 0, d.z1], 3)); g.setIndex([0, 2, 1, 0, 3, 2]); geos.push(g);
  }
  // one mesh per chunk-ish group keeps culling useful
  const byChunk = new Map();
  for (const g of geos) { g.computeBoundingSphere(); const c = g.boundingSphere.center, k = Build.chunk(c.x, c.z); if (!byChunk.has(k)) byChunk.set(k, []); byChunk.get(k).push(g); }
  for (const list of byChunk.values()) {
    const merged = mergeGeosPos(list);
    const m = new THREE.Mesh(merged, Water.mat); m.position.y = 0.33; m.receiveShadow = true; scene.add(m); W.waterMeshes.push(m); Cull.add(m);
  }
}
// flat water: position + up normals + world-space uv (x/8, z/8); triangles wound to face up
function mergeGeosPos(geos) {
  const pos = [], idx = []; let off = 0;
  for (const g of geos) {
    const a = g.attributes.position.array, ia = g.index.array;
    for (let i = 0; i < a.length; i++) pos.push(a[i]);
    for (let i = 0; i < ia.length; i += 3) {
      const p = ia[i] * 3, q = ia[i + 1] * 3, r = ia[i + 2] * 3, cr = (a[q] - a[p]) * (a[r + 2] - a[p + 2]) - (a[q + 2] - a[p + 2]) * (a[r] - a[p]);
      if (cr > 0) idx.push(ia[i] + off, ia[i + 2] + off, ia[i + 1] + off); else idx.push(ia[i] + off, ia[i + 1] + off, ia[i + 2] + off);
    }
    off += a.length / 3;
  }
  const n = pos.length / 3, nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { nor[i * 3 + 1] = 1; uv[i * 2] = pos[i * 3] / 8; uv[i * 2 + 1] = pos[i * 3 + 2] / 8; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); r.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  r.setIndex(idx); r.computeBoundingSphere();
  return r;
}
// the old generators still call these (small decorative ponds, bridge decks)
function addWater(s) {
  if (s.deco) { // a stone-lined channel (金水河): water in the grid except under its bridges (bridges: [[x, width], …])
    W.decoWater = W.decoWater || []; W.decoWater.push(s);
    Grid.poly([[[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]]], (i) => { Grid.kind[i] = GK.WATER; });
    for (const [bx, bw] of s.bridges || []) Grid.poly([[[bx - bw / 2, s.z0 - 0.6], [bx + bw / 2, s.z0 - 0.6], [bx + bw / 2, s.z1 + 0.6], [bx - bw / 2, s.z1 + 0.6]]], (i) => { if (Grid.kind[i] === GK.WATER) Grid.kind[i] = GK.PLAZA; });
    const t = 0.4, h = 0.52, c = 0xdcd7cc, mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
    Build.props.push(box(mx, h / 2, s.z0 - t / 2, s.x1 - s.x0 + 2 * t, h, t, c), box(mx, h / 2, s.z1 + t / 2, s.x1 - s.x0 + 2 * t, h, t, c), box(s.x0 - t / 2, h / 2, mz, t, h, s.z1 - s.z0, c), box(s.x1 + t / 2, h / 2, mz, t, h, s.z1 - s.z0, c));
    return;
  }
  const rings = [s.ellipse ? Array.from({ length: 28 }, (_, k) => [s.x + Math.cos(k / 28 * TAU) * s.rx, s.z + Math.sin(k / 28 * TAU) * s.rz]) : [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]]];
  Grid.poly(rings, (i) => { Grid.kind[i] = GK.WATER; }); W.water.push(rings);
}
function addDry(s) { const rings = [s.ellipse ? Array.from({ length: 24 }, (_, k) => [s.x + Math.cos(k / 24 * TAU) * s.rx, s.z + Math.sin(k / 24 * TAU) * s.rz]) : [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]]]; Grid.poly(rings, (i) => { if (Grid.kind[i] === GK.WATER) Grid.kind[i] = GK.RESV; }); }

/* ---------------- parks & green ---------------- */
function buildGreen() {
  W.greenPolys = [];
  for (const [type, name, polys] of MAPD.raw.green) {
    const rings = polys.map((f) => MAPD.pts(f));
    W.greenPolys.push({ type, name, rings });
    Grid.poly(rings, (i) => { if (Grid.kind[i] === GK.FREE) Grid.kind[i] = GK.PARK; });
  }
}
function scatterParkTrees() {
  for (const gp of W.greenPolys) {
    let area = 0; const r0 = gp.rings[0];
    for (let k = 0; k < r0.length; k++) { const a = r0[k], b = r0[(k + 1) % r0.length]; area += a[0] * b[1] - b[0] * a[1]; }
    area = Math.abs(area) / 2;
    if (gp.type === 'pitch' || gp.type === 'stadium') continue;
    const dens = gp.type === 'forest' ? 1 / 70 : gp.type === 'park' ? 1 / 150 : 1 / 260;
    const n = Math.min(900, Math.round(area * dens));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of r0) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const cyp = /坛|景山|庙|陵|寺|宫/.test(gp.name);
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
      const x = rand(x0, x1), z = rand(z0, z1);
      if (Grid.at(x, z) !== GK.PARK || Ground.roadSdf(x, z) < 2) continue;
      let hit = false; forSolids(x, z, 2, (s) => { if (x > s.x0 - 1.6 && x < s.x1 + 1.6 && z > s.z0 - 1.6 && z < s.z1 + 1.6) { hit = true; return false; } }); // halls / pavilions in the park
      if (hit) continue;
      k++;
      newProp(x, z, rand(0.8, 1.3), cyp || gp.type === 'forest' && Math.random() < 0.5 ? 'cypress' : 'tree');
    }
  }
  // willows along the lake shores (什刹海, 北海, 龙潭湖 …)
  for (const wv of W.water) {
    if (wv.line) continue;
    const r = wv[0];
    let per = 0; for (let k = 0; k < r.length; k++) per += hyp(r[(k + 1) % r.length][0] - r[k][0], r[(k + 1) % r.length][1] - r[k][1]);
    if (per < 60) continue;
    let acc = rand(0, 12);
    for (let k = 0; k < r.length; k++) {
      const a = r[k], b = r[(k + 1) % r.length], L = hyp(b[0] - a[0], b[1] - a[1]);
      for (; acc < L; acc += rand(9, 15)) {
        const t = acc / L, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (const s of [2.4, -2.4]) { const px = x + nx * s, pz = z + nz * s, kd = Grid.at(px, pz); if ((kd === GK.PARK || kd === GK.FREE) && Ground.roadSdf(px, pz) > 1.5) { newProp(px, pz, rand(0.85, 1.1), 'palm'); break; } }
      }
      acc -= L;
    }
  }
}

/* ---------------- street furniture: lamps and 国槐 along the streets ---------------- */
function streetFurniture() {
  const P = [0, 0, 0, 1];
  for (const e of Roads.edges) {
    if (e.cls > 5 || e.len < 12) continue;
    const off = e.hw + Math.min(1.6, e.C.walk * 0.45), step = e.cls <= 2 ? 8 : 9;
    for (const side of [1, -1]) {
      if (e.oneway && side < 0 && e.cls <= 1) continue; // divided roads: one row per carriageway
      let k = 0;
      for (let s = 6; s < e.len - 6; s += step, k++) {
        Roads.at(e, s, P);
        const x = P[0] - P[3] * off * side, z = P[1] + P[2] * off * side;
        const kd = Grid.at(x, z);
        if (kd !== GK.FREE && kd !== GK.WALK && kd !== GK.PARK) continue;
        if (W.doors.some((d) => dist2(x, z, d.x, d.z) < 6.5 * 6.5)) continue;
        if (Ground.roadSdf(x, z) < 0.4) continue;
        // 行道树: a 国槐 in most slots (the busiest ring roads get them too), a lamp every 4th
        if (k % 4 === 0) { const it = newProp(x, z, 1, 'lamp'); it.ry = Math.atan2(P[3] * side, -P[2] * side); }
        else if (e.cls >= 1 && Math.random() < (e.cls >= 3 ? 0.9 : 0.75)) { const t = newProp(x + rand(-0.4, 0.4), z + rand(-0.4, 0.4), rand(0.8, 1.05), 'tree'); t.pit = Math.atan2(P[2], P[3]); }
      }
    }
  }
}

// 树池: a granite-framed square of bare earth (a few fallen leaves) round every street tree, instanced per chunk
function treePitTex() {
  const S = 256, b = 34, c = mkCanvas(S, S), g = c.getContext('2d'), gr = PBR.img('granite_tile', 'albedo'), dt = PBR.img('dirt', 'albedo');
  if (gr) g.drawImage(gr, 0, 0, gr.width * 0.5, gr.height * 0.5, 0, 0, S, S); else { g.fillStyle = '#9a968e'; g.fillRect(0, 0, S, S); }
  if (dt) g.drawImage(dt, 0, 0, dt.width * 0.7, dt.height * 0.7, b, b, S - 2 * b, S - 2 * b); else { g.fillStyle = '#5c4b3a'; g.fillRect(b, b, S - 2 * b, S - 2 * b); }
  g.fillStyle = 'rgba(40,30,20,.25)'; g.fillRect(b, b, S - 2 * b, S - 2 * b);
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 7; g.strokeRect(b + 3, b + 3, S - 2 * b - 6, S - 2 * b - 6);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3; g.strokeRect(2, 2, S - 4, S - 4); g.strokeRect(b - 2, b - 2, S - 2 * b + 4, S - 2 * b + 4);
  for (let i = 0; i < 16; i++) { g.save(); g.translate(rand(b + 8, S - b - 8), rand(b + 8, S - b - 8)); g.rotate(rand(TAU)); g.fillStyle = pick(['#c9a23e', '#9a8a3a', '#6f7a34', '#b07a2a']); g.beginPath(); g.ellipse(0, 0, rand(4, 7), rand(2, 3.5), 0, 0, TAU); g.fill(); g.restore(); }
  return new THREE.CanvasTexture(c);
}
function treePits() {
  const items = W.treeList.filter((it) => it.pit !== undefined).map((it) => ({ x: it.x, y: 0.015, z: it.z, ry: it.pit }));
  if (!items.length) return;
  const g = new THREE.PlaneGeometry(1.3, 1.3); g.rotateX(-Math.PI / 2);
  const m = PBR.HI ? new THREE.MeshStandardMaterial({ map: treePitTex(), roughness: 0.95, metalness: 0 }) : new THREE.MeshLambertMaterial({ map: treePitTex() });
  Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); m.map.anisotropy = Math.min(4, MAX_ANISO);
  chunkStatic(items, g, m, 140);
}

/* ---------------- where am I: street + neighbourhood names ---------------- */
const Places = {
  st: [],
  build() {
    for (const [name, x, z, lines, sub] of MAPD.raw.stations) if (sub) this.st.push({ name: name.replace(/\(.*\)/, ''), x: x * MAPD.k, z: z * MAPD.k });
  },
  area(x, z) {
    let best = null, bd = 190 * 190;
    for (const s of this.st) { const d = dist2(x, z, s.x, s.z); if (d < bd) { bd = d; best = s; } }
    if (W.ringPoly && !pointInRing(x, z, W.ringPoly)) return best ? best.name + '外' : '二环外';
    return best ? best.name : '四九城';
  },
};
function pointInRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1] + 1e-12) + a[0]) c = !c; }
  return c;
}
const PINYIN = { '二环': '2ND RING RD', '长安街': 'CHANG\'AN AVE' };
function districtAt(x, z) {
  const n = Roads.nearest(x, z, 26);
  if (n && n.d < n.e.hw + 5 && n.e.name) {
    const nm = n.e.name;
    const en = /二环/.test(nm) ? PINYIN['二环'] : /长安街/.test(nm) ? PINYIN['长安街'] : /胡同|条$/.test(nm) ? 'HUTONG' : Places.area(x, z);
    return [nm, en];
  }
  return [Places.area(x, z), n && n.e.cls === 6 ? 'HUTONG' : 'BEIJING'];
}

// the 二环 centreline, Chaikin-smoothed once (also the old-city boundary)
function ringPolygon() {
  const raw = MAPD.pts(MAPD.raw.ring2), sm = [];
  for (let k = 0; k < raw.length; k++) { const a = raw[k], b = raw[(k + 1) % raw.length]; sm.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
  return sm;
}
/* ---------------- the 上下文轻轨: an elevated loop over the 二环 ---------------- */
const Monorail = {
  pts: [], cum: [], L: 0, train: [], s: 0, speed: 15, y: 10.2, hijacked: false, cars: 4,
  build() {
    const raw = W.ringPoly || (W.ringPoly = ringPolygon());
    let L = 0; const cum = [0];
    for (let k = 1; k < raw.length; k++) { L += hyp(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]); cum.push(L); }
    L += hyp(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]);
    this.pts = raw; this.cum = cum; this.L = L;
    const parts = [], beam = [], pier = new THREE.CylinderGeometry(0.72, 0.92, this.y - 0.8, 16);
    for (let s = 0; s < L; s += 28) {
      const [x, z] = this.at(s);
      if (Roads.nodes.some((n) => n.deg >= 3 && dist2(n.x, n.z, x, z) < 14 * 14)) continue;
      // the squashed 二环 has no median: stand the pier on the kerb, off the asphalt, and cantilever a cross-head out to the beam
      const [x2, z2] = this.at(s + 1), nl = hyp(x2 - x, z2 - z) || 1, nx = -(z2 - z) / nl, nz = (x2 - x) / nl;
      let off = null;
      for (let o = 0; o <= 14 && off === null; o += 0.5) for (const sg of o ? [1, -1] : [1]) {
        const px = x + nx * o * sg, pz = z + nz * o * sg, gk = Grid.at(px, pz);
        let clear = Ground.roadSdf(px, pz) > 1.3 && gk !== GK.WATER && gk !== GK.BLD;
        if (clear) forSolids(px, pz, 2, (q) => { if (px > q.x0 - 1 && px < q.x1 + 1 && pz > q.z0 - 1 && pz < q.z1 + 1) { clear = false; return false; } });
        if (clear) { off = o * sg; break; }
      }
      if (off === null) continue;
      const px = x + nx * off, pz = z + nz * off;
      parts.push(gpart(pier, 0x9aa1aa, px, this.y / 2 - 0.4, pz));
      parts.push(box((px + x) / 2, this.y - 1.2, (pz + z) / 2, 3.2, 0.8, Math.abs(off) + 3.2, 0x7d848d, Math.atan2(nx, nz)));
      addSolid(null, { x0: px - 0.9, x1: px + 0.9, z0: pz - 0.9, z1: pz + 0.9, h: this.y, kind: 'pillar' });
    }
    for (let s = 0; s < L; s += 4) {
      const [x, z] = this.at(s), [x2, z2] = this.at(s + 4);
      const len = hyp(x2 - x, z2 - z) + 0.1, a = Math.atan2(x2 - x, z2 - z);
      beam.push(box((x + x2) / 2, this.y - 0.2, (z + z2) / 2, 2.6, 1.0, len, (Math.floor(s / 4) % 2) ? 0xc9ced6 : 0xbfc5ce, a));
      beam.push(box((x + x2) / 2, this.y + 0.35, (z + z2) / 2, 0.5, 0.15, len, 0xffc940, a));
    }
    Build.props.push(...parts, ...beam); // merged per chunk
    // 建国门 station next to the compute tower (east side of the ring)
    const tp = W.towerPos || new V3(900, 0, 0);
    this.stationS = this.nearestS(tp.x, tp.z);
    const [sx, sz] = this.at(this.stationS), [sx2, sz2] = this.at(this.stationS + 2);
    const st = new THREE.Mesh(mergeParts([box(0, 0, 0, 6, 0.6, 30, 0xd9d4c8), box(2.8, 3, 0, 0.3, 0.3, 30, 0xffc940), box(2.8, 1.6, -14, 0.3, 3, 0.3, 0x8a929c), box(2.8, 1.6, 14, 0.3, 3, 0.3, 0x8a929c)]), MAT.vc);
    st.position.set(sx, this.y - 0.5, sz); st.rotation.y = Math.atan2(sx2 - sx, sz2 - sz); st.translateX(3.6); scene.add(st);
    this.carMat = MAT.vc;
    this.stripeMat = new THREE.MeshBasicMaterial({ color: 0xffc940 });
    this.winMat = new THREE.MeshBasicMaterial({ color: 0x223044 }); this._winDay = new THREE.Color(0x223044); this._winNight = new THREE.Color(0xd9b98a);
    // the cars: a rounded-rectangle section extruded with bevelled (rounded) ends, not boxes
    const sec = new THREE.Shape(), CW = 1.35, CH = 3.0, CR = 0.85;
    sec.moveTo(-CW + CR, 0); sec.lineTo(CW - CR, 0); sec.quadraticCurveTo(CW, 0, CW, CR); sec.lineTo(CW, CH - CR); sec.quadraticCurveTo(CW, CH, CW - CR, CH);
    sec.lineTo(-CW + CR, CH); sec.quadraticCurveTo(-CW, CH, -CW, CH - CR); sec.lineTo(-CW, CR); sec.quadraticCurveTo(-CW, 0, -CW + CR, 0);
    const carG = (nose) => { const g = new THREE.ExtrudeGeometry(sec, { depth: nose ? 8.6 : 9.1, bevelEnabled: true, bevelThickness: nose ? 0.7 : 0.45, bevelSize: 0.25, bevelSegments: 4, curveSegments: 5 }); g.translate(0, 0.35, nose ? -4.3 : -4.55); g.deleteAttribute('uv'); return g; };
    const G0 = carG(false), G1 = carG(true);
    for (let k = 0; k < this.cars; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(mergeParts([gpart(k === 0 ? G1 : G0, 0xeef1f5), box(0, 3.62, 0, 1.6, 0.2, 8.4, 0xd5dbe3)]), this.carMat);
      const wins = new THREE.Mesh(mergeParts([
        box(1.6, 1.95, 0, 0.05, 0.9, 8.0, 0xffffff), box(-1.6, 1.95, 0, 0.05, 0.9, 8.0, 0xffffff),
        ...(k === 0 ? [box(0, 2.25, 5.03, 2.2, 1.0, 0.1, 0xffffff)] : []),
      ]), this.winMat);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.3, 9.2), this.stripeMat); stripe.position.y = 1.2;
      body.castShadow = true; g.add(body, wins, stripe); scene.add(g);
      this.train.push({ g, body, stripe });
    }
    this.s = rand(this.L);
  },
  at(s) {
    const L = this.L, pts = this.pts, cum = this.cum;
    s = ((s % L) + L) % L;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = pts[lo], b = pts[(lo + 1) % pts.length], segL = (lo + 1 < cum.length ? cum[lo + 1] : L) - cum[lo];
    const t = segL > 0 ? (s - cum[lo]) / segL : 0;
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  },
  nearestS(x, z) { let best = 0, bd = Infinity; for (let s = 0; s < this.L; s += 2) { const [px, pz] = this.at(s); const d = dist2(px, pz, x, z); if (d < bd) { bd = d; best = s; } } return best; },
  carPos(k) { return this.at(this.s - k * 11); },
  update(dt) {
    if (!this.frozen) this.s = (this.s + this.speed * dt) % this.L;
    for (let k = 0; k < this.train.length; k++) {
      const c = this.train[k], s = this.s - k * 11;
      const [x, z] = this.at(s), [x2, z2] = this.at(s + 1);
      c.g.position.set(x, this.y + 0.4, z); c.g.rotation.set(0, Math.atan2(x2 - x, z2 - z), 0);
    }
    this.winMat.color.copy(this._winDay).lerp(this._winNight, DayNight.night);
    if (!Interiors.cur) { const [tx, tz] = this.carPos(1); Sfx.hum(clamp(1 - hyp(tx - Player.pos.x, tz - Player.pos.z) / 60, 0, 1)); }
  },
  hijack(on) { this.hijacked = on; this.stripeMat.color.set(on ? 0xff5a2a : 0xffc940); },
};

/* ---------------- doors ---------------- */
function addDoor(id, interior, name, x, z, heading = 0) { const d = { id, interior, name, x, z, heading }; W.doors.push(d); return d; }

/* ---------------- build order ---------------- */
// async only to let the title's progress bar paint between phases (Boot.step yields a macrotask); nothing else runs in between
async function buildWorld() {
  // lights / fog / shadows are driven every frame by DayNight + Render (tiers, camera-fitted cascades); these are start values
  scene.background = null; // the sky dome covers every pixel
  scene.fog = new THREE.Fog(0xd9b59d, 160, 700);
  W.hemi = new THREE.HemisphereLight(0xc4dbff, 0x7a6450, 0.62 * LIGHT_K); scene.add(W.hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 0.8 * LIGHT_K);
  sun.castShadow = true;
  const sm = LOWQ ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target); W.sun = sun;
  const T0 = performance.now(), TT = [], lap = (k) => TT.push(k + ' ' + Math.round(performance.now() - T0));
  bjMaterials();
  Grid.init();
  Roads.build();
  Places.build();
  // rasterize: water first, then streets (bridges keep the water under them for now), parks, plazas
  buildWater();
  for (const e of Roads.edges) {
    const k = e.cls >= 6 ? GK.ALLEY : GK.ROAD;
    for (let i = 0; i < e.pts.length - 1; i++) Grid.capsule(e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1], e.hw, (c) => { if (Grid.kind[c] !== GK.WATER && Grid.kind[c] !== GK.ROAD) Grid.kind[c] = k; });
    // sidewalk band: keep it clear of houses
    if (e.C.walk > 0.5) for (let i = 0; i < e.pts.length - 1; i++) Grid.capsule(e.pts[i][0], e.pts[i][1], e.pts[i + 1][0], e.pts[i + 1][1], e.hw + e.C.walk, (c) => { if (Grid.kind[c] === GK.FREE) Grid.kind[c] = GK.WALK; });
  }
  buildGreen();
  W.plazaPolys = []; W.doorLamps = [];
  W.ringPoly = ringPolygon();
  Landmarks.reserve();          // landmark footprints + story places claim their ground first
  lap('grid'); await Boot.step(0.38); Ground.build(); lap('ground');
  buildBridges();
  Landmarks.build();            // palaces, temples, the square, special buildings, HQs, doors
  Metro.build();                // subway entrance kiosks on the sidewalks → W.stations
  lap('landmarks'); await Boot.step(0.44); await City.build();           // hutongs, shop streets, modern blocks
  lap('city');
  Monorail.build();
  Signals.build();
  buildMarkings();
  buildKerbs();
  finishBeijing();
  await Boot.step(0.5); Build.finish(); lap('merge'); await Boot.step(0.56);
  waterMeshes();
  scatterParkTrees();
  streetFurniture();
  // lamps (pole + glowing head + pool of light) and trees, instanced per chunk
  const poolG = new THREE.PlaneGeometry(1, 1); poolG.rotateX(-Math.PI / 2);
  // 长安街 and the square get 华灯, everything else the modern LED lamp
  for (const it of W.lampList) if (!it.hua) { const n = Roads.nearest(it.x, it.z, 30); it.hua = !!(n && /长安街|天安门/.test(n.e.name)); }
  const lampMat = LAMP_MAT(), LP = lampParts(), HP = huaParts(), huaL = W.lampList.filter((it) => it.hua), stdL = W.lampList.filter((it) => !it.hua);
  Render.cutout(MAT.lampHead); // lamp heads dither away with their poles (no floating heads in front of the lens)
  chunkInstances(stdL, [[LP.pole, lampMat, 'cm', true], [LP.head, MAT.lampHead, 'hm', false], [poolG, MAT.lampPool, 'pm', false, true]], 8, 380);
  // 华灯 globes: frosted white glass by day (lit by the scene), glowing warm at night (NightLights drives the emissive)
  W.huaMat = Render.cutout(PBR.HI ? new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.3, metalness: 0, emissive: 0xfff0d6, emissiveIntensity: 0 }) : new THREE.MeshLambertMaterial({ color: 0xf2f0ea, emissive: 0xfff0d6, emissiveIntensity: 0 }));
  if (huaL.length) chunkInstances(huaL, [[HP.pole, lampMat, 'cm', true], [HP.head, W.huaMat, 'hm', false], [poolG, MAT.lampPool, 'pm', false, true]], 8, 420);
  // shadow proxies: one crown + trunk (the 国槐 is 132 tris, the willow ~350)
  const posOnly = (g) => { const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position); o.setIndex(g.index); o.computeBoundingSphere(); return o; };
  const treeSh = posOnly(mergeParts([box(0, 1.3, 0, 0.34, 2.6, 0.34, 0), gpart(new THREE.IcosahedronGeometry(2.0, 0), 0, 0.2, 3.7, 0, 0, 0, 0, 1, 0.85, 1)]));
  const palmSh = posOnly(mergeParts([box(0, 2.0, 0, 0.42, 4.0, 0.42, 0), gpart(new THREE.IcosahedronGeometry(2.1, 0), 0, 0, 4.2, 0, 0, 0, 0, 1, 0.9, 1)]));
  if (Foliage.prep()) Foliage.build();
  else { // no tree models shipped: the old low-poly trees
    chunkInstances(W.treeList, [[mergeParts(TREE_GEO_PARTS()), MAT.vcCut, 'cm', true, false, treeSh]], 6, 400);
    chunkInstances(W.palmList, [[palmGeo(), MAT.vcCut, 'cm', true, false, palmSh]], 7, 420);
    chunkInstances(W.cypressList, [[cypressGeo(), MAT.vcCut, 'cm', true]], 8, 420);
  }
  for (const list of [W.lampList, W.treeList, W.palmList, W.cypressList]) for (const it of list) Props.writeMatrix(it);
  treePits();
  hutongClutter();
  parkBikes();
  StreetProps.build();
  Hedges.build();
  Shrubs.build();
  Skyline.build();
  Grass.build();
  Atmos.init();
  NightLights.init();
  Mirror.init();
  Cull.hook(); W.cull = Cull;
  // static chunk meshes never move: skip recomposing their matrices every frame (scene.updateMatrixWorld walks ~4k objects)
  for (const it of Cull.list) { it.m.updateMatrix(); it.m.matrixAutoUpdate = false; }
  lap('props');
  W.buildMs = Math.round(performance.now() - T0);
  window.GTAX = Object.assign(window.GTAX || {}, { Foliage, Ground, Cull, PBR, CityMat, Build, BJ, Atmos, Grass, NightLights, StreetProps, Mirror, Hedges, Shrubs }); // environment internals for tests
  console.log('[world] built in ' + W.buildMs + ' ms (' + TT.join(', ') + '), ' + W.solids.length + ' solids, ' + City.count + ' lots');
}

/* ---------------- grass & wild flowers: tufts of crossed cards that follow the camera, drawn only where the ground SDF says park
   (positions wrap on the GPU like the weather particles: no per-frame CPU work). Desktop dense, phones sparse. ---------------- */
function grassTuftTex(flowers) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < (flowers ? 40 : 90); i++) {
    const x = rand(8, S - 8), h = rand(S * 0.45, S * 0.98), bend = rand(-30, 30), w = rand(3, 7);
    const col = flowers ? pick(['#3f6e2c', '#4d7d33']) : pick(['#4f7f2e', '#5f8f36', '#3f6b27', '#6f9a3c', '#86a846', '#56832f']);
    g.fillStyle = col; g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x + bend * 0.4, S - h * 0.55, x + bend, S - h); g.quadraticCurveTo(x + bend * 0.4 + w * 0.3, S - h * 0.55, x + w, S); g.fill();
  }
  if (flowers) for (let i = 0; i < 26; i++) {
    const x = rand(14, S - 14), y = rand(S * 0.08, S * 0.5), r = rand(5, 10), col = pick(['#e8454f', '#f4c542', '#f07ab0', '#ffffff', '#b77ae8', '#ff8a3c']);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.fillStyle = col; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, 0, TAU); g.fill(); }
    g.fillStyle = '#f7d44a'; g.beginPath(); g.arc(x, y, r * 0.35, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(4, MAX_ANISO); return t;
}
// 花坛 cards: dense pale blossoms over a few dark leaves, tinted per instance (red salvia, yellow marigold, pink petunia)
function flowerBedTex() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const x = rand(8, S - 8), h = rand(S * 0.35, S * 0.8), bend = rand(-24, 24), w = rand(4, 9);
    g.fillStyle = pick(['#6a8a5a', '#58784a', '#7a9868']); g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x + bend * 0.4, S - h * 0.55, x + bend, S - h); g.quadraticCurveTo(x + bend * 0.4 + w * 0.3, S - h * 0.55, x + w, S); g.fill();
  }
  for (let i = 0; i < 80; i++) {
    const x = rand(12, S - 12), y = rand(S * 0.06, S * 0.62), r = rand(6, 12), l = randi(0, 40);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + rand(0.3); g.fillStyle = `rgb(${255 - l},${255 - l},${255 - l})`; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, 0, TAU); g.fill(); }
    g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(x, y, r * 0.28, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(4, MAX_ANISO); return t;
}
// a tuft: three crossed cards w × h standing on y = 0, normals straight up (lit like the ground they grow from)
function tuftGeo(w, h) { const gs = []; for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(w, h, 1, 1); g.translate(0, h / 2, 0); g.rotateY((k / 3) * Math.PI); gs.push(g); } const m = THREE.mergeGeometries(gs); const n = m.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); return m; }
const GRASS_VERT = [
  '#include <begin_vertex>',
  // the tuft's cell in a SIZE × SIZE field that wraps round the camera; kept only on park cells of the occupancy grid (not water / paths)
  'vec2 gc = instanceMatrix[3].xz, gw = uGC.xz - uGS * 0.5 + fract((gc - (uGC.xz - uGS * 0.5)) / uGS) * uGS;',
  'float gd = length(gw - uGC.xz), gk = step(0.5, texture2D(tGMask, (gw - uGB.xy) * uGB.zw).r) * (1.0 - smoothstep(uGS * 0.36, uGS * 0.48, gd));',
  'float gh = fract(sin(dot(floor(gc * 7.0), vec2(12.9898, 78.233))) * 43758.5453);',
  'transformed *= gk * (0.7 + 0.6 * gh);',
  'transformed.xz += sin(uGT * 1.7 + gw.x * 0.35 + gw.y * 0.21) * 0.12 * position.y * uGW;',
  // on 景山 / 琼华岛 the tufts ride the hill (the same smoothstep dome as hillH)
  'float gy = 0.0; for (int i = 0; i < 4; i++) { vec2 hd = (gw - uHill[i].xy) / max(uHill[i].zw, vec2(1e-3)); float hu = dot(hd, hd); if (hu < 1.0 && uHillH[i] > 0.0) { float ht = 1.0 - hu; gy = max(gy, 0.31 + uHillH[i] * ht * ht * (3.0 - 2.0 * ht)); } }',
  'vec3 gP = vec3(gw.x + transformed.x, transformed.y + gy, gw.y + transformed.z);',
].join('\n');
const Grass = {
  U: { uGC: { value: new V3() }, uGS: { value: LOWQ ? 40 : 64 }, uGT: { value: 0 }, uGW: { value: 1 }, uGB: { value: new THREE.Vector4() }, tGMask: { value: null },
    uHill: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 1)) }, uHillH: { value: [0, 0, 0, 0] } },
  meshes: [],
  build() {
    // mask: 2 m cells of the occupancy grid that are park
    const R = 2, mw = Math.ceil(Grid.w / R), mh = Math.ceil(Grid.h / R), md = new Uint8Array(mw * mh);
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) { let k = 0; for (let b = 0; b < R; b++) for (let a = 0; a < R; a++) { const gi = i * R + a, gj = j * R + b; if (gi < Grid.w && gj < Grid.h && Grid.kind[gj * Grid.w + gi] === GK.PARK) k++; } md[j * mw + i] = k >= 3 ? 255 : 0; }
    const mt = new THREE.DataTexture(md, mw, mh, THREE.RedFormat, THREE.UnsignedByteType); mt.magFilter = THREE.LinearFilter; mt.minFilter = THREE.LinearFilter; mt.needsUpdate = true;
    this.U.tGMask.value = mt; this.U.uGB.value.set(Grid.x0, Grid.z0, 1 / (mw * R), 1 / (mh * R));
    W.hills.slice(0, 4).forEach((hl, i) => { this.U.uHill.value[i].set(hl.x, hl.z, hl.rx, hl.rz); this.U.uHillH.value[i] = hl.h; });
    // a tuft: three crossed cards 0.7 m tall; flowers: a separate, sparser field
    const tuft = tuftGeo;
    for (const [n, flowers, w, h] of [[LOWQ ? 2500 : 16000, false, 0.9, 0.55], [LOWQ ? 300 : 2400, true, 0.8, 0.5]]) {
      const geo = tuft(w, h), mat = new THREE.MeshLambertMaterial({ map: grassTuftTex(flowers), alphaTest: 0.5, side: THREE.DoubleSide, color: flowers ? 0xffffff : 0xd8e6c4 });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.U);
        // the tuft is placed in world space here (the instance matrix only carries its cell): projection, shadow lookup and fog follow
        sh.vertexShader = 'uniform vec3 uGC; uniform float uGS, uGT, uGW; uniform vec4 uGB; uniform sampler2D tGMask; uniform vec4 uHill[4]; uniform float uHillH[4];\n' + sh.vertexShader.replace('#include <begin_vertex>', GRASS_VERT)
          .replace('#include <project_vertex>', '#include <project_vertex>\n  mvPosition = viewMatrix * vec4(gP, 1.0); gl_Position = projectionMatrix * mvPosition;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\n  worldPosition = vec4(gP, 1.0);\n#endif')
          .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vGtaW = gP;');
      };
      mat.customProgramCacheKey = () => 'grass' + (flowers ? 'f' : '');
      const m = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), S = this.U.uGS.value;
      for (let i = 0; i < n; i++) m.setMatrixAt(i, m4.compose(new V3(rand(S), 0, rand(S)), q.setFromAxisAngle(UP, rand(TAU)), new V3(1, 1, 1)));
      m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false; scene.add(m); this.meshes.push(m);
      m.geometry.boundingSphere = new THREE.Sphere(new V3(), 1e5);
    }
  },
  update(dt) {
    if (!this.meshes.length) return;
    this.U.uGT.value = (this.U.uGT.value + dt) % 1000; this.U.uGC.value.copy(camera.position);
    this.U.uGW.value = 1 + 2 * Weather.str.rain + 3 * Weather.str.sand;
    const on = !Interiors.cur && Weather.snowC < 0.5; for (const m of this.meshes) m.visible = on;
  },
};
Hooks.update(function grass(dt) { Grass.update(dt); });

/* ---------------- shrubs: 大叶黄杨 / 丁香 / 月季 bushes in the parks and along the park paths — five crossed leaf cards in a dome
   (a painted canvas, alpha-tested), instanced per chunk, tinted per bush; flowering ones in spring colours ---------------- */
function shrubTex(flower) {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 1100; i++) {
    // points in a dome: denser in the middle, the silhouette ragged
    const a = rand(Math.PI), r = Math.sqrt(Math.random()) * rand(0.86, 1), x = S / 2 + Math.cos(a) * r * S * 0.47, y = S - 4 - Math.sin(a) * r * S * 0.9;
    const top = 1 - y / S, l = randi(-10, 14) + top * 34 - (1 - r) * 22;
    g.fillStyle = shade(pick(['#3f6e2a', '#4a7a30', '#355f25', '#5a8a36']), l);
    g.save(); g.translate(x, y); g.rotate(rand(TAU)); g.beginPath(); g.ellipse(0, 0, rand(4, 7.5), rand(2.2, 3.8), 0, 0, TAU); g.fill(); g.restore();
  }
  if (flower) for (let i = 0; i < 150; i++) {
    const a = rand(0.15, Math.PI - 0.15), r = rand(0.35, 0.95), x = S / 2 + Math.cos(a) * r * S * 0.45, y = S - 6 - Math.sin(a) * r * S * 0.86;
    g.fillStyle = pick(['#ff7aa8', '#ffb3cf', '#ff5f7e', '#fff0f4', '#ffe27a', '#d9a6ff']); g.beginPath(); g.arc(x, y, rand(2.5, 4.5), 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,245,200,.8)'; g.beginPath(); g.arc(x, y, 1.1, 0, TAU); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = Math.min(4, MAX_ANISO); return t;
}
// four vertical cards at 45° + one tilted over the top; normals point up and out (a round, soft shading like the tree crowns)
function shrubGeo() {
  const gs = [];
  for (let k = 0; k < 4; k++) { const g = new THREE.PlaneGeometry(1.6, 1.2, 1, 1); g.translate(0, 0.6, 0); g.rotateY((k / 4) * Math.PI); gs.push(g); }
  const tg = new THREE.PlaneGeometry(1.3, 1.3); tg.rotateX(-Math.PI / 2 + 0.25); tg.translate(0, 0.95, 0); gs.push(tg);
  const m = THREE.mergeGeometries(gs), p = m.attributes.position, n = m.attributes.normal, v = new V3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), Math.max(0.2, p.getY(i)) + 0.35, p.getZ(i)).normalize(); n.setXYZ(i, v.x * 0.6, v.y, v.z * 0.6); }
  return m;
}
const Shrubs = {
  items: [[], []],
  place() {
    const ok = (x, z) => { if (Grid.at(x, z) !== GK.PARK || Ground.roadSdf(x, z) < 1.3) return false; let hit = false; forSolids(x, z, 1.5, (s) => { if (x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1) { hit = true; return false; } }); return !hit; };
    for (const gp of W.greenPolys) {
      if (gp.type === 'pitch' || gp.type === 'stadium') continue;
      const r0 = gp.rings[0]; let area = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < r0.length; k++) { const a = r0[k], b = r0[(k + 1) % r0.length]; area += a[0] * b[1] - b[0] * a[1]; x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); z0 = Math.min(z0, a[1]); z1 = Math.max(z1, a[1]); }
      const n = Math.min(260, Math.round(Math.abs(area) / 2 / (LOWQ ? 900 : 380))), flowerK = /花|园/.test(gp.name) ? 0.45 : 0.18;
      for (let k = 0, tries = 0; k < n && tries < n * 5; tries++) {
        const cx = rand(x0, x1), cz = rand(z0, z1); if (!ok(cx, cz)) continue; k++;
        // a clump of 2–4 bushes, one colour
        const fl = Math.random() < flowerK ? 1 : 0, tint = pick([0xffffff, 0xe8f0d8, 0xd8e8c8, 0xf0f4e0, 0xfff4e0]);
        for (let j = randi(2, 4); j > 0; j--) { const x = cx + rand(-1.6, 1.6), z = cz + rand(-1.6, 1.6); if (ok(x, z)) this.items[fl].push({ x, z, ry: rand(TAU), s: rand(0.75, 1.25), c: tint }); }
      }
    }
  },
  build() {
    this.place();
    const geo = shrubGeo();
    this.items.forEach((list, fl) => {
      if (!list.length) return;
      const m = new THREE.MeshLambertMaterial({ map: shrubTex(!!fl), alphaTest: 0.5, side: THREE.DoubleSide });
      m.onBeforeCompile = (sh) => sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif');
      m.customProgramCacheKey = () => 'shrub';
      chunkStatic(list, geo, m, 170);
    });
  },
};

/* ---------------- atmosphere: HDRI skies (Poly Haven, CC0) as image-based light per time of day + a cloud dome ----------------
   Each HDRI is turned at load so its sun sits at azimuth 0 (then one rotation lines every sky up with DayNight's sun), its sun
   disc is clipped (the direct light is W.sun's job) and its brightness is matched to the procedural sky of the moment. Two skies
   blend (time of day, or weather); Render.setEnvironment builds the reflections + soft sky light, the dome shows the clouds. */
const HDRI_SETS = { day: 'kloofendal_48d_partly_cloudy_puresky', sunset: 'kloppenheim_06_puresky', dusk: 'qwantani_dusk_2_puresky', night: 'kloppenheim_02_puresky',
  city: 'shanghai_bund', grey: 'kloofendal_overcast_puresky', haze: 'kloofendal_misty_morning_puresky' };
// time of day → [hdri a, hdri b, mix]
const HDRI_KEYS = [[0, 'city', 'night', 0.35], [4.8, 'city', 'night', 0.35], [5.6, 'dusk', 'sunset', 0.2], [6.6, 'sunset', 'day', 0.1], [8.5, 'day', 'day', 0], [16.2, 'day', 'day', 0],
  [18.0, 'sunset', 'day', 0.15], [19.1, 'sunset', 'dusk', 0.6], [20.2, 'dusk', 'city', 0.5], [21.3, 'city', 'night', 0.35], [24, 'city', 'night', 0.35]];
// streamed, the title's hour first (20:40: dusk → city night); the procedural sky stands in until a sky lands, then the dome fades in
if (!LOWQ) for (const [k, f] of Object.entries(HDRI_SETS)) Assets.need('hdri/' + k, 'hdri/' + f + '_1k.hdr', { tier: 'stream', prio: ['dusk', 'city', 'night'].includes(k) ? 0 : k === 'day' ? 1 : 12 });
const Atmos = {
  ok: false, info: {}, dome: null, U: null, cur: null, _k: '',
  // the loaded HDR (RGBA half floats): turn it so the brightest spot (the sun) sits at u = 0.5, clip it, measure the sky's mean
  prep(t) {
    const img = t.image, w = img.width, h = img.height, src = img.data, H = THREE.DataUtils, out = new Uint16Array(src.length);
    let best = -1, bi = 0, sum = 0, n = 0;
    for (let j = 0; j < h >> 1; j++) for (let i = 0; i < w; i += 2) { const k = (j * w + i) * 4, l = H.fromHalfFloat(src[k]) + H.fromHalfFloat(src[k + 1]) + H.fromHalfFloat(src[k + 2]); if (l > best) { best = l; bi = i; } }
    const shift = ((bi - (w >> 1)) % w + w) % w;
    for (let j = 0; j < h * 0.45; j++) for (let i = 0; i < w; i += 3) { const k = (j * w + i) * 4; sum += Math.min(3, 0.2126 * H.fromHalfFloat(src[k]) + 0.7152 * H.fromHalfFloat(src[k + 1]) + 0.0722 * H.fromHalfFloat(src[k + 2])); n++; }
    const avg = Math.max(1e-3, sum / Math.max(1, n)), K = 1 / avg, CL = 14; // normalised: the sky's mean luminance → 1, the sun clipped at 14
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const s = (j * w + (i + shift) % w) * 4, d = (j * w + i) * 4;
      let r = H.fromHalfFloat(src[s]) * K, g = H.fromHalfFloat(src[s + 1]) * K, b = H.fromHalfFloat(src[s + 2]) * K; const m = Math.max(r, g, b);
      if (m > CL) { const q = CL / m; r *= q; g *= q; b *= q; }
      out[d] = H.toHalfFloat(r); out[d + 1] = H.toHalfFloat(g); out[d + 2] = H.toHalfFloat(b); out[d + 3] = src[s + 3];
    }
    img.data = out; t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping;
    return { avg };
  },
  init() {
    Hooks.on('daynight', (p) => guard('atmos', () => this.update(p))); // light shaping + grade on every tier, the skies on desktop
    if (LOWQ) return;
    // each sky as it arrives (streamed ones after the start): normalised in a Jobs slice, then the dome / reflections re-pick
    for (const k in HDRI_SETS) Assets.on('hdri/' + k, (t) => Jobs.add(() => { if (!t.image || !t.image.data || this.info[k]) return; this.info[k] = Object.assign(this.prep(t), { t }); this._k = ''; if (!this.dome) this.makeDome(); }));
  },
  makeDome() {
    const first = this.info.night || this.info.day || Object.values(this.info)[0]; if (!first) return;
    this.ok = true; this.fade = 0;
    // the dome: HDRI clouds over the procedural sky, fading into its horizon (the fog colour) and out at night / in haze
    const U = this.U = Object.assign({}, SKY_U, { tA: { value: first.t }, tB: { value: first.t }, uMix: { value: 0 }, uGA: { value: 1 }, uGB: { value: 1 }, uRot: { value: 0 }, uW: { value: 0 } });
    const mat = new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false, transparent: true,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: '#include <common>\n' + SKY_GLSL + '\nuniform sampler2D tA, tB; uniform float uMix, uGA, uGB, uRot, uW; varying vec3 vDir;\n' +
        'vec3 hdr(sampler2D t, vec3 d){ float a = atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5 + uRot, b = asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5; return texture2D(t, vec2(fract(a), b)).rgb; }\n' +
        'void main(){ vec3 d = normalize(vDir); if (d.y < -0.02) discard;\n' +
        '  vec3 c = hdr(tA, d) * uGA * (1.0 - uMix) + hdr(tB, d) * uGB * uMix;\n' +
        '  float s = max(dot(d, uSunDir), 0.0), sv = uSunVis * smoothstep(-0.12, 0.02, uSunDir.y);\n' +
        '  c += uSunCol * sv * (smoothstep(0.99955, 0.99985, s) * 30.0 + pow(s, 64.0) * 0.3) * (1.0 - uHaze * 0.85);\n' +
        '  c = mix(c, uHazeC, uHaze * (1.0 - smoothstep(-0.1, 0.7, d.y)));\n' +
        '  gl_FragColor = vec4(c, uW * smoothstep(-0.01, 0.16, d.y));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    });
    Warm.adopt(() => { const m = this.dome = new THREE.Mesh(new THREE.SphereGeometry(840, 48, 24), mat); m.renderOrder = -9; m.frustumCulled = false; m.visible = false; scene.add(m); });
  },
  // the look: a soft glow on bright highlights by day, lamps and neon bloom at night; warm highlights, teal shade, a bit more colour
  grade(p) {
    const U = Render.gradeU, n = p.lamps;
    // (a painterly lift: warm golden highlights, teal-leaning shade, a touch more colour, a soft daytime glow off the sky,
    // sunlit marble and glazed tiles)
    Render.setBloom((0.3 + 0.36 * n) * p.bloomK, 1.02 - 0.24 * n, 0.66 + 0.1 * n);
    U.uSat.value *= 1.04; U.uHigh.value.x *= 1.04; U.uHigh.value.z *= 0.94; U.uShadow.value.x *= 0.95; U.uShadow.value.y *= 1.01; U.uShadow.value.z *= 1.05;
    U.uExposure.value *= 1 + 0.3 * DayNight.night; // moonlit streets stay readable (a blue night, not a black one)
  },
  // key / fill: by day a stronger, warmer sun over a softer, cooler sky fill (modelled light: the Blade & Soul look); the moon as is
  _warm: linHex('#ffd8a8'),
  light(p) {
    scene.fog.near *= 0.8; scene.fog.far *= 0.94; // a little more aerial perspective: layered depth, the far city melting into the haze
    const day = p.si >= p.mi ? clamp(p.si / 0.6, 0, 1) : 0; if (!day) return;
    W.sun.intensity *= 1 + 0.32 * day; W.sun.color.lerp(this._warm, 0.14 * day); W.hemi.intensity *= 1 - 0.14 * day;
  },
  update(p) {
    if (!DayNight.indoor) this.light(p);
    if (!this.ok || !Sky.mesh) { if (!DayNight.indoor) this.grade(p); return; }
    this.dome.position.copy(camera.position); this.dome.visible = !DayNight.indoor;
    if (DayNight.indoor) return;
    const h = DayNight.hour; let i = 0; while (i < HDRI_KEYS.length - 2 && HDRI_KEYS[i + 1][0] <= h) i++;
    const A = HDRI_KEYS[i], B = HDRI_KEYS[i + 1], t = smooth(clamp((h - A[0]) / (B[0] - A[0]), 0, 1));
    // weights of every sky in the two keys, the strongest two blend; weather takes the second slot
    const wt = {}; for (const [K, k] of [[A, 1 - t], [B, t]]) { wt[K[1]] = (wt[K[1]] || 0) + (1 - K[3]) * k; wt[K[2]] = (wt[K[2]] || 0) + K[3] * k; }
    const top = Object.keys(wt).sort((x, y) => wt[y] - wt[x]);
    let a = top[0], b = top[1] || top[0], mix = top[1] ? wt[b] / (wt[a] + wt[b]) : 0;
    const w = Weather.str, wet = clamp(w.rain + w.snow, 0, 1), dusty = clamp(w.smog + w.sand, 0, 1);
    if (wet > 0.05 || dusty > 0.05) { b = wet >= dusty ? 'grey' : 'haze'; mix = Math.max(wet, dusty); }
    const any = this.info.day ? 'day' : Object.keys(this.info)[0];
    if (!this.info[a]) a = this.info.night && (a === 'city' || a === 'dusk') ? 'night' : any; if (!this.info[b]) { b = a; mix = 0; }
    // brightness: follow the procedural sky of the moment (its zenith / horizon luminance)
    const L = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, target = 0.6 * L(p.zen) + 0.4 * L(p.hor);
    const gA = target, gB = target; // every sky was normalised to a mean of 1 at load
    const S = DayNight.sunDir, rot = -Math.atan2(S.z, S.x) / TAU;
    // the dome only ever shows the pure skies: shanghai_bund lights the night reflections, but its skyline (东方明珠!) must not stand over Beijing
    const dk = (k) => (k === 'city' ? 'night' : k), da = this.info[dk(a)] || this.info[a], db = this.info[dk(b)] || this.info[b];
    const U = this.U; U.tA.value = da.t; U.tB.value = db.t; U.uMix.value = da === db ? 0 : mix; U.uGA.value = gA; U.uGB.value = gB; U.uRot.value = rot;
    this.fade = Math.min(1, (this.fade || 0) + 0.02); // a sky that just streamed in fades in over ~1 s (daynight runs every frame)
    U.uW.value = clamp(0.85 - 0.45 * DayNight.night - 0.55 * dusty, 0.2, 0.85) * this.fade;
    // reflections + soft sky light: rebuilt when the pair / blend / brightness moves enough (the engine's key rounds them too)
    const gl = target, key = a + b + Math.round(mix * 12) + '|' + Math.round(rot * 48) + '|' + Math.round(Math.log2(gl + 1e-3) * 6);
    if (key !== this._k) {
      this._k = key;
      Render.setEnvironment(this.info[a].t, { b: this.info[b].t, mix, sky: 0.3, gain: 0.8 * gl, rot, diffuse: 0.55, intensity: 1 });
    }
    // the sky light now comes partly from the environment: the hemisphere fill steps back
    W.hemi.intensity *= Render.envTexture ? lerp(0.62, 0.95, DayNight.night) : 1;
    this.grade(p);
  },
};

/* ---------------- night lights: a few real warm point lights on the lamps / lanterns nearest the camera (desktop) ----------------
   the rest of the city's lamps are the glowing heads + light pools; these four put warm light on the walls, trees and people around you */
const NightLights = {
  L: [], _t: 0, cand: [],
  init() {
    if (LOWQ) return;
    for (let k = 0; k < 4; k++) { const l = new THREE.PointLight(0xffb070, 0, 22, 2); l.castShadow = false; scene.add(l); this.L.push(l); }
    for (const it of W.lampList) { const o = it.hua ? 0 : 2.15; this.cand.push({ x: it.x + Math.sin(it.ry) * o, y: it.hua ? 7.1 : 6.75, z: it.z + Math.cos(it.ry) * o, c: it.hua ? 0xfff0d0 : 0xffb070, k: it.hua ? 1.3 : 1, it }); }
    for (const [x, y, z, sc] of BJB.lanterns) this.cand.push({ x, y: y - 0.2, z, c: 0xff6a3a, k: 0.55 * Math.min(2, sc || 1) });
    for (const [x, y, z] of W.doorLamps || []) this.cand.push({ x, y, z, c: 0xffc27a, k: 0.42 }); // hutong door lamps (City.put)
  },
  update(dt) {
    if (W.huaMat) W.huaMat.emissiveIntensity = 2.2 * DayNight.lamps;
    if (!this.L.length) return;
    const n = DayNight.indoor ? 0 : DayNight.lamps;
    if (n < 0.02) { for (const l of this.L) l.intensity = 0; return; }
    this._t -= dt; if (this._t > 0) return; this._t = 0.25;
    const t = Cam.target, best = [];
    for (const c of this.cand) {
      if (c.it && c.it.state !== 0) continue;
      const d = (c.x - t.x) ** 2 + (c.z - t.z) ** 2; if (d > 48 * 48) continue;
      best.push([d, c]);
    }
    best.sort((a, b) => a[0] - b[0]);
    this.L.forEach((l, i) => {
      const c = best[i] && best[i][1];
      if (!c) { l.intensity = 0; return; }
      l.position.set(c.x, c.y, c.z); toLin(l.color.set(c.c)); l.intensity = 26 * c.k * n; l.distance = 20;
    });
  },
};
Hooks.update(function nightLights(dt) { NightLights.update(dt); });

/* ---------------- lake reflections: a planar mirror of the scene (half res, oblique-clipped at the water line) that the water
   shader samples through its ripples — 什刹海's bars and lanterns, the palace moat's red wall, the clouds. High tier only, and only
   while some water is in view; the mirror pass's draws are added back into renderer.info after the frame's reset. ---------------- */
const Mirror = {
  rt: null, cam: null, H: 0.33, done: false, calls: 0, tris: 0, every: 1, _n: 0, w: 0, R0: 80, R1: 150, cullK: 0.5,
  U: { tRefl: { value: null }, uRM: { value: new THREE.Matrix4() }, uRefOn: { value: 0 } },
  _rot: new THREE.Matrix4(), _pl: new THREE.Plane(), _cp: new THREE.Vector4(), _q: new THREE.Vector4(), _fr: new THREE.Frustum(), _pm: new THREE.Matrix4(),
  _p: new V3(), _t: new V3(), _l: new V3(), _o: new V3(), _s: new THREE.Sphere(),
  init() {
    if (LOWQ || !Water.mat || this.cam) return;
    const src = Water.mat.fragmentShader, R = [
      ['uniform float uTime, uRain, uLamp;', 'uniform float uTime, uRain, uLamp, uRefOn; uniform sampler2D tRefl; uniform mat4 uRM;'],
      ['  vec3 refl = skyCol(R, 1.0);', '  vec3 refl = skyCol(R, 1.0);\n  if (uRefOn > 0.0) { vec4 rc = uRM * vec4(vGtaW, 1.0); vec2 ruv = clamp(rc.xy / rc.w + g * 0.9, 0.002, 0.998); refl = mix(refl, texture2D(tRefl, ruv).rgb, uRefOn); }'],
      ['  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);', '  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0); fr = mix(fr, 0.07 + 0.93 * pow(1.0 - max(dot(N, V), 0.0), 3.5), uRefOn);'],
      ['(0.006 + 0.14 * st);', '(0.006 + 0.14 * st) * (1.0 - uRefOn);'],
    ];
    if (R.some(([a]) => !src.includes(a))) return; // the water shader changed: no mirror rather than a broken one
    Water.mat.fragmentShader = R.reduce((f, [a, b]) => f.replace(a, b), src);
    Object.assign(Water.U, this.U); Water.mat.needsUpdate = true;
    this.cam = new THREE.PerspectiveCamera();
    const r0 = Render.render;
    Render.render = function (t) { Mirror.pre(); r0.call(this, t); Mirror.post(); };
  },
  // how much mirror the view wants (0..1): water in view, full within R0 m, fading out by R1 (farther water shows the sky)
  wanted() {
    if (!Render.Q || Render.quality !== 'high' || DayNight.indoor || Interiors.cur || camera.position.y < this.H + 0.25) return -1;
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._fr.setFromProjectionMatrix(this._pm);
    const cp = camera.position, S = this._s;
    let any = false;
    for (const m of W.waterMeshes) {
      if (!m.visible) continue;
      const b = m.geometry.boundingSphere; S.center.copy(b.center).add(m.position); S.radius = b.radius;
      if (S.center.distanceTo(cp) - S.radius < this.R1 && this._fr.intersectsSphere(S)) { any = true; break; }
    }
    return any ? 1 - smooth(clamp((this.waterDist() - this.R0) / (this.R1 - this.R0), 0, 1)) : 0;
  },
  // the nearest water in view: a fan of ground samples over the water grid and the 金水河 channels, a house in the way hides
  // it from a street-level camera. (The moat's bounding sphere reaches half the city, so the sphere test alone kept this
  // second full-scene render on nearly everywhere: ~8 ms a frame on an M2.)
  waterDist() {
    const cp = camera.position, f = camera.getWorldDirection(this._t), yaw = Math.atan2(f.x, f.z), D = W.decoWater || [], low = cp.y < 12;
    const hf = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect);
    let best = 1e9;
    for (let i = 0; i <= 10; i++) {
      const a = yaw + (i / 5 - 1) * hf, sx = Math.sin(a), sz = Math.cos(a);
      for (let d = 2; d < best && d < this.R1; d += Math.max(2, d * 0.06)) {
        const x = cp.x + sx * d, z = cp.z + sz * d, k = Grid.idx(x, z);
        if ((k >= 0 && Grid.kind[k] === GK.WATER) || D.some((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1)) { best = d; break; }
        if (low && k >= 0 && Grid.kind[k] === GK.BLD) break;
      }
    }
    return best;
  },
  pre() {
    this.done = false;
    if (!this.cam) return;
    camera.updateMatrixWorld();
    const w = this.wanted(); // eased, so a far canal slipping between the samples doesn't flicker the reflection
    this.w = w < 0 ? 0 : this.w + (w - this.w) * (w > this.w ? 0.3 : 0.08);
    if (this.w < 0.02) { this.w = 0; this.U.uRefOn.value = 0; return; }
    if (this._n++ % this.every) return; // (every > 1: the last mirror image is reused in between)
    const r = renderer, dw = Math.max(64, Math.round(Math.min(1100, innerWidth * 0.55))), dh = Math.max(32, Math.round(dw * innerHeight / Math.max(1, innerWidth)));
    if (!this.rt) { this.rt = new THREE.WebGLRenderTarget(dw, dh, { type: THREE.HalfFloatType, depthBuffer: true }); this.rt.texture.generateMipmaps = false; this.U.tRefl.value = this.rt.texture; }
    else if (this.rt.width !== dw || this.rt.height !== dh) this.rt.setSize(dw, dh);
    // the virtual camera: the main one reflected in the plane y = H (three's Reflector recipe)
    const vc = this.cam, n = UP, cp = camera.position, rw = this._o.set(cp.x, this.H, cp.z);
    this._rot.extractRotation(camera.matrixWorld);
    const view = this._p.subVectors(rw, cp).reflect(n).negate().add(rw);
    const look = this._l.set(0, 0, -1).applyMatrix4(this._rot).add(cp), tgt = this._t.subVectors(rw, look).reflect(n).negate().add(rw);
    vc.position.copy(view); vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n); vc.lookAt(tgt);
    vc.near = camera.near; vc.far = camera.far; vc.layers.mask = camera.layers.mask; vc.updateMatrixWorld(); vc.projectionMatrix.copy(camera.projectionMatrix);
    this.U.uRM.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // oblique near plane = the water surface: nothing under the water shows up in the mirror
    this._pl.setFromNormalAndCoplanarPoint(n, rw).applyMatrix4(vc.matrixWorldInverse);
    const cl = this._cp.set(this._pl.normal.x, this._pl.normal.y, this._pl.normal.z, this._pl.constant), e = vc.projectionMatrix.elements, q = this._q;
    q.set((Math.sign(cl.x) + e[8]) / e[0], (Math.sign(cl.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    cl.multiplyScalar(2 / cl.dot(q)); e[2] = cl.x; e[6] = cl.y; e[10] = cl.z + 1; e[14] = cl.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    // render it: no see-through cut-outs (they're placed for the main view), no water
    const cu = Render.cutU, cr = cu.uCutR.value, cn = cu.uNear.value, prev = r.getRenderTarget(), ac = r.autoClear, i0 = r.info.render.calls, t0 = r.info.render.triangles;
    cu.uCutR.value = 0; cu.uNear.value = 0; Water.mat.visible = false; r.autoClear = true;
    try { r.setRenderTarget(this.rt); r.render(scene, vc); }
    finally { r.setRenderTarget(prev); r.autoClear = ac; Water.mat.visible = true; cu.uCutR.value = cr; cu.uNear.value = cn; }
    this.calls = r.info.render.calls - i0; this.tris = r.info.render.triangles - t0; this.done = true;
    this.U.uRefOn.value = this.w;
  },
  post() { if (this.done) { const I = renderer.info.render; I.calls += this.calls; I.triangles += this.tris; } },
};

/* ---------------- beyond the map edge: the rest of Beijing as a skyline, 西山 in the west ---------------- */
const Skyline = {
  build() {
    const B = W.bounds, towers = { office: [], flats: [] };
    const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, rx = (B.x1 - B.x0) / 2 + 60, rz = (B.z1 - B.z0) / 2 + 60;
    const T = (tpl, x, z, w, h, d, rot, col, y = 0) => towers[tpl].push({ x, y, z, w, h, d, rot, col });
    // the rest of Beijing: 三环 / 四环 blocks all round (taller to the east), lit windows at night
    for (let k = 0; k < 300; k++) {
      const a = (k / 300) * TAU + rand(-0.01, 0.01), r = rand(1.0, 1.4);
      const x = cx + Math.cos(a) * rx * r, z = cz + Math.sin(a) * rz * r;
      const east = Math.cos(a) > 0.55, h = east ? rand(40, 150) : rand(20, 75), flats = Math.random() < (east ? 0.3 : 0.65);
      T(flats ? 'flats' : 'office', x, z, rand(12, 30), h, rand(12, 30), rand(TAU), pick(flats ? FLAT_COLS : MODERN_COLS));
    }
    // CBD just past the east wall, where 长安街 runs on to 国贸: a dense cluster, 国贸三期 and the 大裤衩 loop
    const ex = B.x1 + 70;
    for (let k = 0; k < 70; k++) {
      const x = ex + rand(0, 420), z = rand(-320, 280); if (Math.abs(z) < 26) continue; // keep 长安街's line of sight open
      const h = rand(60, 170) * (1 - Math.min(0.5, Math.abs(z) / 900)), w = rand(18, 34), d = rand(18, 30), rot = pick([0, 0, Math.PI / 2, rand(TAU)]);
      T('office', x, z, w, h, d, rot, pick(MODERN_COLS));
      if (h > 90) T('office', x, z, w * 0.7, rand(12, 30), d * 0.7, rot, pick(MODERN_COLS), h);
    }
    { const x = ex + 170, z = 40; T('office', x, z, 26, 120, 26, 0, 0x9fb2c8); T('office', x, z, 21, 70, 21, 0, 0x9fb2c8, 120); T('office', x, z, 16, 40, 16, 0, 0xaec0d4, 190); T('office', x, z, 3, 26, 3, 0, 0xcfd6de, 230); }
    { const x = ex + 320, z = 140, c = 0x5f6670; // CCTV: two towers, a base and the cantilevered top
      T('office', x - 22, z, 20, 150, 24, 0, c); T('office', x + 22, z + 14, 20, 150, 24, 0, c);
      T('office', x - 6, z + 26, 64, 30, 20, 0, c, 150); T('office', x + 22, z - 4, 20, 30, 60, 0, c, 150); T('office', x, z + 6, 70, 26, 22, 0, c); }
    for (const [tpl, list] of Object.entries(towers)) {
      const g = Tpl.defs[tpl].geo.clone(), seeds = new Float32Array(list.length).map(() => randi(0, 1023) / 1024);
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      const m = new THREE.InstancedMesh(g, CityMat.mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
      list.forEach((t, i) => { m4.compose(new V3(t.x, t.y, t.z), q.setFromAxisAngle(UP, t.rot), new V3(t.w, t.h, t.d)); m.setMatrixAt(i, m4); m.setColorAt(i, c.set(t.col)); });
      m.frustumCulled = false; scene.add(m);
    }
    // 西山: blue-grey ridges far in the west
    // 西山: a ridged range (value-noise heightfield), greener at the foot, blue-grey ridges; the haze does the rest
    const vn = (x) => { const i = Math.floor(x), f = x - i, h = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }, u = f * f * (3 - 2 * f); return h(i) + (h(i + 1) - h(i)) * u; };
    const NZ = 110, NX = 20, Z0 = cz - 1700, Z1 = cz + 1700, X1 = B.x0 - 420, X0 = X1 - 900, hp = [], hc = [], hix = [], c0 = new THREE.Color(0x3f5a45), c1 = new THREE.Color(0x6a7f78);
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      const z = Z0 + (Z1 - Z0) * j / NZ, u = i / NX, x = X0 + (X1 - X0) * u;
      const ridge = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7), n = vn(z * 0.0028) * 0.55 + vn(z * 0.009 + 3) * 0.3 + vn(z * 0.027 + 7) * 0.15, peak = Math.abs(vn(z * 0.013 + i * 0.35) - 0.5) * 2;
      const h = ridge * (70 + 170 * n + 40 * (1 - peak)) - 8;
      hp.push(x, h, z); const c = c0.clone().lerp(c1, clamp(h / 200, 0, 1)); hc.push(c.r, c.g, c.b);
      if (i < NX && j < NZ) { const a = j * (NX + 1) + i, b = a + NX + 1; hix.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3)); hg.setIndex(hix); hg.computeVertexNormals();
    const hm = new THREE.Mesh(hg, MAT.vc); hm.frustumCulled = false; scene.add(hm);
    // the map edge: a 施工围挡 (blue site hoarding) all the way round, facing in; the collision is the bounds clamp
    const HH = 3.2, P = 24, pos = [], uv = [], idx = [];
    const side = (ax, az, bx, bz) => { // a quad from a to b, its front toward the map
      const L = Math.hypot(bx - ax, bz - az), o = pos.length / 3;
      pos.push(ax, 0, az, bx, 0, bz, bx, HH, bz, ax, HH, az); uv.push(0, 0, L / P, 0, L / P, 1, 0, 1); idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    side(B.x1, B.z1, B.x0, B.z1); side(B.x0, B.z0, B.x1, B.z0); side(B.x1, B.z0, B.x1, B.z1); side(B.x0, B.z1, B.x0, B.z0); // map on the right as the text runs
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const wm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: hoardingTex() })); wm.receiveShadow = true; wm.frustumCulled = false; scene.add(wm);
  },
};
// 4 panels of site hoarding (24 m of wall per repeat): blue sheet, white rails, the usual slogans
function hoardingTex() {
  const c = mkCanvas(2048, 256), g = c.getContext('2d');
  const txt = ['前方施工 · 请您绕行', '地图到头了 · 回吧您内', '四九城 · 欢迎您', '三环以外 · 敬请期待'];
  txt.forEach((t, i) => {
    const x = i * 512;
    g.fillStyle = '#1d4f9c'; g.fillRect(x, 0, 512, 256);
    g.fillStyle = '#f4f4f0'; g.fillRect(x, 0, 512, 22); g.fillRect(x, 232, 512, 24); g.fillStyle = '#c7ccd3'; g.fillRect(x, 22, 512, 4);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 509, 26, 3, 206);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t, 440, 76, 900); g.fillText(t, x + 256, 132);
  });
  speckle(g, 2048, 256, 5000, 0.05);
  const t = tex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

// ---- AI product HQ (destructible) ----
class HQ {
  // rot: facing (object +z = the entrance side) → this.front {x, z, ox, oz}: the entrance point on the street side
  constructor(def, x, z, rot = 0) {
    Object.assign(this, def);
    this.cx = x; this.cz = z; this.rot = rot; this.ox = Math.sin(rot); this.oz = Math.cos(rot);
    this.front = { x: x + this.ox * 17, z: z + this.oz * 17, ox: this.ox, oz: this.oz };
    this.maxHp = def.hp || 1200; this.hp = this.maxHp;
    this.alerted = false; this.dead = false; this.gone = false; this.collapseT = -1;
    this.spawnT = 1.5; this.shake = 0; this.flash = 0; this.smokeT = 0; this.beaconT = 0;
    this.H = def.h || 42;
    const g = new THREE.Group(); g.position.set(this.cx, 0.3, this.cz); g.rotation.y = rot; scene.add(g); this.group = g;
    // mirror glass tinted with the brand colour (PBR curtain wall), lit offices at night; the old canvas glass without the photo set
    this.baseColor = new THREE.Color(def.glass).lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.25);
    this.towerMat = Render.cutout(PBR.glass({ color: this.baseColor.clone(), emissive: new THREE.Color(def.c1).lerp(new THREE.Color(0xffd9a0), 0.6) }) ||
      new THREE.MeshStandardMaterial({ color: new THREE.Color(def.glass), map: TEX.curtain, emissive: new THREE.Color(def.c1), emissiveMap: TEX.curtainE, emissiveIntensity: 0.4, metalness: 0.8, roughness: 0.16 }));
    const podMat = Render.cutout(new THREE.MeshLambertMaterial({ color: 0xf1ede6, map: MAT.facades[1].map }));
    const crownMat = Render.cutout(new THREE.MeshLambertMaterial({ color: new THREE.Color(def.c1), emissive: new THREE.Color(def.c1), emissiveIntensity: 0.5 }));
    const pod = new THREE.Mesh(buildingGeo(30, 7, 30), [podMat, MAT.roof]);
    const tower = new THREE.Mesh(buildingGeo(22, this.H, 20), [this.towerMat, MAT.roof]); tower.position.y = 7;
    const crown = new THREE.Mesh(new THREE.BoxGeometry(23, 2.6, 21), crownMat); crown.position.y = 7 + this.H - 1.2;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 3), crownMat); canopy.position.set(0, 4.2, 16.2);
    for (const m of [pod, tower, crown, canopy]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const signT = signTex(def.name, def.sub, def.c1, def.c2);
    this.signMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signT, transparent: true, side: THREE.DoubleSide }));
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(28, 7), this.signMat);
    this.sign.position.set(0, 7 + this.H + 4.4, 4); this.sign.rotation.x = -0.62; g.add(this.sign);
    const posts = new THREE.Mesh(mergeParts([box(-8.5, 0, 0, 0.6, 5, 0.6, 0x2b2f36), box(8.5, 0, 0, 0.6, 5, 0.6, 0x2b2f36)]), MAT.vc);
    posts.position.set(0, 7 + this.H + 2.3, 5); g.add(posts);
    this.deckMat = Render.cutout(new THREE.MeshBasicMaterial({ map: signT, transparent: true }));
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(26, 5.2), this.deckMat);
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, 7.06, 12.2); g.add(deck);
    this.beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), Render.cutout(new THREE.MeshBasicMaterial({ color: 0xff3344 })));
    this.beacon.position.set(-8, 7 + this.H + 1.2, -7); g.add(this.beacon);
    this.solid = addSolid(null, { cx: this.cx, cz: this.cz, hx: 15, hz: 15, rot: -rot, h: this.H + 7.3, kind: 'hq', hq: this });
    this.minions = 0;
  }
  get ratio() { return this.hp / this.maxHp; }
  // world point `f` metres out the front and `l` metres to the side (local +x)
  at(f, l = 0) { return [this.cx + this.ox * f + this.oz * l, this.cz + this.oz * f - this.ox * l]; }
  damage(amount, px, pz, kind, bonus) {
    if (this.dead) return 0;
    if (!this.alerted) {
      this.alerted = true; this.spawnT = 0.8;
      Bubble.at(this.cx, this.H + 14, this.cz, this.alert, 3.4, 'hq');
      Sfx.alert();
    }
    this.hp -= amount; this.flash = 0.12; this.shake = Math.min(1.4, this.shake + amount / 70);
    G.addMoney(amount * 180 * RPG.m.valuation); G.crime(0.016); RPG.charge(amount);
    const y = rand(2, 8);
    FX.chunks(px, y, pz, Math.min(14, 3 + (amount / 12) | 0), [0xdfe6ee, this.glass, 0x9aa3ad]);
    FX.glassBits(px, y + 2, pz, 6, this.glass);
    if (Math.random() < 0.3) Tokens.burst(px, pz, 1, 50000, 3);
    const txt = '-' + Math.round(amount) + (bonus ? ' ' + bonus : '');
    Floaters.add(px, y + 4, pz, txt, bonus ? 'fl-bonus' : 'fl-dmg');
    if (this.hp <= 0) this.destroy();
    return amount;
  }
  destroy() {
    this.dead = true; this.hp = 0; this.solid.solid = false; this.collapseT = 0;
    { const [x, z] = this.at(10); FX.boom(x, 10, z, 3.2, false); }
    FX.boom(this.cx + rand(-8, 8), this.H * 0.7, this.cz + rand(-6, 6), 2.4, false);
    Sfx.boom(true); Sfx.crumble(); Sfx.glass();
    G.slow(0.32, 1.5); Cam.shake(2.4);
    Enemies.killOwnedBy(this);
    if (Tokens.enabled) { const [x, z] = this.at(20); Tokens.burst(x, z, 14, 50000, 10); Tokens.burst(x, z, 3, 250000, 12); }
    const wp = new V3(); this.sign.getWorldPosition(wp);
    this.group.remove(this.sign); scene.add(this.sign); this.sign.position.copy(wp);
    const [tx, tz] = this.at(21, rand(-6, 6));
    this.sign.rotation.order = 'YXZ'; this.fallSign = { t: 0, from: wp.clone(), to: new V3(tx, 0.45, tz), r0: this.sign.rotation.x, spin: rand(-0.4, 0.4) };
    G.onHQDestroyed(this);
  }
  wreck() {
    this.dead = true; this.hp = 0; this.solid.solid = false; this.collapseT = 99;
    const [sx, sz] = this.at(21, 3);
    this.group.remove(this.sign); scene.add(this.sign); this.sign.position.set(sx, 0.45, sz); this.sign.rotation.order = 'YXZ'; this.sign.rotation.set(-Math.PI / 2, this.rot + 0.2, 0);
    this.updateCollapse(0);
  }
  update(dt, pd) {
    if (this.fallSign) {
      const f = this.fallSign; f.t += dt; const u = Math.min(1, f.t / 1.8), e = easeIn(u);
      this.sign.position.set(lerp(f.from.x, f.to.x, u), lerp(f.from.y, f.to.y, e) + Math.sin(u * Math.PI) * 6, lerp(f.from.z, f.to.z, u));
      this.sign.rotation.set(lerp(f.r0, -Math.PI / 2, e), this.rot + f.spin * u, 0);
      if (u >= 1) { this.fallSign = null; FX.dust(f.to.x, f.to.z, 10, 5); Sfx.thud(); }
    }
    if (this.gone) return;
    if (this.collapseT >= 0) { this.updateCollapse(dt); return; }
    this.shake = Math.max(0, this.shake - dt * 3); this.flash = Math.max(0, this.flash - dt);
    const s = this.shake * 0.45;
    this.group.position.set(this.cx + rand(-s, s), 0.3, this.cz + rand(-s, s));
    const ratio = this.ratio;
    this.towerMat.color.copy(this.baseColor).multiplyScalar(0.4 + 0.6 * ratio);
    this.towerMat.emissiveIntensity = 0.06 + DayNight.lamps * 1.1 + this.flash * 7;
    this.beaconT += dt; this.beacon.visible = (this.beaconT % 1.2) < 0.6;
    if (ratio < 0.3) this.signMat.opacity = Math.random() < 0.08 ? 0.3 : 1;
    if (ratio < 0.7 && pd < 150) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = ratio < 0.35 ? 0.06 : 0.16;
        FX.smoke(this.cx + rand(-11, 11), 7 + this.H * rand(0.6, 1), this.cz + rand(-10, 10), 1);
        if (ratio < 0.35) { const [x, z] = this.at(10.2, rand(-12, 12)); FX.fire(x, 7 + this.H * rand(0.2, 0.95), z, 1); }
      }
    }
    if (this.alerted && pd < 120) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 3.0; if (this.minions < 5 && Enemies.list.length < 26) Enemies.spawn(this.enemy, this); }
    }
  }
  updateCollapse(dt) {
    this.collapseT += dt;
    const T = 3.0, u = Math.min(1, this.collapseT / T);
    this.group.position.set(this.cx + Math.sin(this.collapseT * 31) * 0.4 * (1 - u), 0.3 - easeIn(u) * (this.H + 10), this.cz);
    this.group.rotation.z = Math.sin(this.collapseT * 6) * 0.03 * (1 - u);
    this.group.rotation.x = u * 0.07;
    if (u < 0.9) {
      for (let k = 0, n = perSec(120, dt); k < n; k++) { const a = rand(TAU), rr = rand(15, 20); FX.dust(this.cx + Math.cos(a) * rr, this.cz + Math.sin(a) * rr, 1, rand(5, 9)); }
      if (Math.random() < dt * 30) FX.chunks(this.cx + rand(-11, 11), Math.max(3, 7 + this.H + this.group.position.y), this.cz + rand(-10, 10), 2, [0xcfd6de, this.glass, 0x8a8f96]);
    }
    if (u >= 1) {
      this.gone = true; this.group.visible = false;
      const parts = [];
      for (let k = 0; k < 26; k++) {
        const w = rand(3, 8), h = rand(1, 4), d = rand(3, 8);
        parts.push({ geo: _BOX, c: pick([0x8d9196, 0x70757b, 0xa7abb0, this.glass]), m: MX(rand(-12, 12), h / 2, rand(-12, 12), rand(-0.3, 0.3), rand(TAU), rand(-0.3, 0.3), w, h, d) });
      }
      const rub = new THREE.Mesh(mergeParts(parts), MAT.vc); rub.position.set(this.cx, 0.3, this.cz); rub.castShadow = true; rub.receiveShadow = true; scene.add(rub);
      const nf = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), new THREE.MeshBasicMaterial({ map: TEX.notFound, transparent: true }));
      const [nx, nz] = this.at(11, 6), [qx, qz] = this.at(10.6, 6);
      nf.position.set(nx, 6.2, nz); nf.rotation.order = 'YXZ'; nf.rotation.set(-0.5, this.rot, 0); scene.add(nf);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), MAT.vc); post.position.set(qx, 2.8, qz); scene.add(post);
    }
  }
}

/* ---- Tokens: the gold coins everybody fights over ---- */
const Tokens = {
  MAX: 560, items: [], free: [], mesh: null, alive: 0, combo: 0, comboT: 0, refillT: 0, dirtyAny: false, enabled: true,
  _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _p: new V3(), _s: new V3(), ZERO: new THREE.Matrix4().makeScale(0, 0, 0),
  init() {
    this.mesh = new THREE.InstancedMesh(coinGeometry(), MAT.coin, this.MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.MAX; i++) { this.mesh.setMatrixAt(i, this.ZERO); this.items.push({ i, alive: false }); this.free.push(this.MAX - 1 - i); }
    scene.add(this.mesh);
  },
  add(x, z, val = 50000, o = {}) {
    if (!this.free.length) return null;
    const t = this.items[this.free.pop()];
    Object.assign(t, { alive: true, x, z, y: o.y ?? 1.5, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, air: !!o.air, val, big: val >= 200000, ph: rand(TAU), age: 0, dirty: true, tag: o.tag || null });
    this.alive++;
    return t;
  },
  remove(t) { t.alive = false; this.mesh.setMatrixAt(t.i, this.ZERO); this.free.push(t.i); this.alive--; this.dirtyAny = true; },
  clearAll(tag) { for (const t of this.items) if (t.alive && (!tag || t.tag === tag)) this.remove(t); },
  burst(x, z, n, val = 50000, y = 4) {
    for (let k = 0; k < n; k++) { const a = rand(TAU), s = rand(3, 11); this.add(x, z, val, { y, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(8, 15), air: true }); }
  },
  line(ax, az, bx, bz, n, val = 50000) { for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); this.add(lerp(ax, bx, t), lerp(az, bz, t), val); } },
  // a short row of tokens down a lane
  roadLine(spot, n) {
    const e = spot.e, s0 = clamp(spot.s, 2, Math.max(2, e.len - n * 3.2 - 2));
    for (let k = 0; k < n; k++) { const p = laneAt(e, spot.dir, spot.lane, Math.min(e.len - 1, s0 + k * 3.2)); this.add(p[0], p[1]); }
  },
  seed() {
    const pc = W.plaza ? { x: W.plaza.x + 8, z: W.plaza.z - 6 } : { x: 0, z: 30 };
    for (let a = 0; a < 12; a++) { const ang = (a / 12) * TAU, x = pc.x + Math.cos(ang) * 10.5, z = pc.z + Math.sin(ang) * 10.5; if (openAt(x, z, 0.8)) this.add(x, z); } // not inside the 箭楼 / monument
    const sp = W.spawn;
    for (let k = 0; k < 50; k++) { const s = Roads.randomSpot(sp.x, sp.z, 20, 420); if (s) this.roadLine(s, randi(3, 6)); }
  },
  collect(t) {
    const val = Math.round(t.val * RPG.m.tokenValue);
    this.remove(t);
    this.combo++; this.comboT = 0.9;
    if (t.big) Sfx.bigCoin(); else Sfx.coin(this.combo);
    Player.addTokens(val);
    Floaters.add(t.x, 3.2, t.z, '+' + fmtTok(val), t.big ? 'fl-tok big' : 'fl-tok');
    FX.sparkle(t.x, t.y + 0.4, t.z, t.big ? 14 : 6);
    G.stats.tokens += val; RPG.gainXP(Math.max(1, Math.round(val / 50000)));
  },
  update(dt) {
    const p = Player.pos, pr = Player.pickupR(), mr = Player.magnetR(), can = Player.canPickup() && !Interiors.cur;
    const cx = Cam.target.x, cz = Cam.target.z, B = W.bounds;
    for (const t of this.items) {
      if (!t.alive) continue;
      t.age += dt; t.ph += dt * 3.2;
      if (t.air) {
        t.vy -= 30 * dt; t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
        if (t.y <= 1.5 && t.vy < 0) { t.y = 1.5; t.air = false; if (wetAt(t.x, t.z)) { this.remove(t); continue; } }
        t.x = clamp(t.x, B.x0 + 2, B.x1 - 2); t.z = clamp(t.z, B.z0 + 2, B.z1 - 2);
      }
      if (can && !t.air && t.age > 0.4) {
        const dx = p.x - t.x, dz = p.z - t.z, d2 = dx * dx + dz * dz;
        if (d2 < mr * mr) { const d = Math.sqrt(d2) || 1, s = Math.min(d, (16 + (mr - d) * 4) * dt); t.x += (dx / d) * s; t.z += (dz / d) * s; }
        if (d2 < pr * pr) { this.collect(t); continue; }
      }
      if ((Math.abs(t.x - cx) > 160 || Math.abs(t.z - cz) > 160) && !t.dirty) continue;
      const s = t.big ? 1.8 : 1;
      this._q.setFromAxisAngle(UP, t.ph);
      this._p.set(t.x, t.y + Math.sin(t.ph * 0.7) * 0.25 + groundH(t.x, t.z), t.z);
      this._m.compose(this._p, this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(t.i, this._m); t.dirty = false; this.dirtyAny = true;
    }
    if (this.dirtyAny) { this.mesh.instanceMatrix.needsUpdate = true; this.dirtyAny = false; }
    let top = 0; for (let k = this.MAX - 1; k >= 0; k--) if (this.items[k].alive) { top = k + 1; break; }
    this.mesh.count = top;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.refillT -= dt;
    if (this.refillT <= 0 && this.enabled && !Interiors.cur) {
      this.refillT = 1.2;
      if (this.alive < 190) { const s = Roads.randomSpot(p.x, p.z, 45, 160); if (s) this.roadLine(s, randi(3, 6)); }
    }
  },
  nearest(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.items) { if (!t.alive || t.air) continue; const d = dist2(x, z, t.x, t.z); if (d < bd) { bd = d; best = t; } }
    return best;
  },
};
