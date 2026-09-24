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
    const cx = cam.position.x, cz = cam.position.z, lit = DayNight.lamps > 0.02, q = LOWQ ? 0.8 : 1; // phones: small stuff drops out sooner
    for (let i = 0; i < L.length; i++) {
      const it = L[i], lim = Math.min(this.on ? it.d * q : 1e9, fog) + it.r, dx = it.x - cx, dz = it.z - cz;
      it.m.visible = dx * dx + dz * dz < lim * lim && (lit || !it.night);
    }
  },
  // runs inside renderer.render() before the scene is projected, so shadows and every pass see the same set
  hook() { const prev = scene.onBeforeRender; scene.onBeforeRender = function (r, s, cam, rt) { if (cam && cam.isPerspectiveCamera) Cull.update(cam); prev.call(this, r, s, cam, rt); }; },
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
      const g = shareGeo(geo); g.boundingSphere = new THREE.Sphere(new V3(cx, h / 2, cz), r + h + 3);
      const m = new THREE.InstancedMesh(g, mat, items.length); m.castShadow = shadow && !sgeo; m.receiveShadow = !shadow; scene.add(m);
      m.matrixAutoUpdate = false; Cull.add(m, cd, !!night);
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
    if (it.kind === 'lamp') {
      it.hm.setMatrixAt(it.ci, this._m);
      const s = it.state === 0 ? 11 : 0, fx = Math.sin(it.ry) * 2.2, fz = Math.cos(it.ry) * 2.2;
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

/* ---------------- the ground: one plane shaded from a road / alley / park / plaza SDF ---------------- */
const SDF_BAND = 4;
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
    this.U = { tSdf: { value: t }, uB: { value: new THREE.Vector4(x0, z0, 1 / (w * res), 1 / (h * res)) },
      tAsph: { value: TEX.asphalt }, tWalk: { value: TEX.walk }, tPave: { value: TEX.paving }, tGrass: { value: TEX.grass }, tStone: { value: TEX.stone }, uWet: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const U = this.U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform sampler2D tSdf, tAsph, tWalk, tPave, tGrass, tStone; uniform vec4 uB; uniform float uWet; varying vec3 vGW;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', [
          'vec2 suv = (vGW.xz - uB.xy) * uB.zw;',
          'vec4 S = (texture2D(tSdf, suv) * 255.0 - 128.0) / 127.0 * ' + SDF_BAND.toFixed(1) + ';',
          'float outside = step(1.0, max(max(-suv.x, suv.x - 1.0), max(-suv.y, suv.y - 1.0)) + 1.0);',
          'float aa = 0.05 + length(fwidth(vGW.xz)) * 0.9;',
          'vec3 cWalk = texture2D(tWalk, vGW.xz / 3.2).rgb * vec3(0.94, 0.93, 0.9);',
          'vec3 cGrass = texture2D(tGrass, vGW.xz / 7.0).rgb * vec3(0.78, 0.95, 0.7);',
          'vec3 cStone = texture2D(tStone, vGW.xz / 6.0).rgb;',
          'vec3 cPave = texture2D(tPave, vGW.xz / 2.6).rgb;',
          'vec3 cAsph = texture2D(tAsph, vGW.xz / 9.0).rgb * 0.92;',
          'vec3 gcol = mix(cWalk, cGrass, 1.0 - smoothstep(-aa, aa, S.b));',
          'gcol = mix(gcol, cStone, 1.0 - smoothstep(-aa, aa, S.a));',
          'gcol = mix(gcol, cPave, 1.0 - smoothstep(-aa, aa, S.g));',
          'float curb = smoothstep(-aa, aa, S.r) * (1.0 - smoothstep(0.32 - aa, 0.32 + aa, S.r));',
          'gcol = mix(gcol, vec3(0.66, 0.66, 0.63), curb * (1.0 - step(0.5, 1.0 - smoothstep(-aa, aa, S.g))));',
          'float onRoad = 1.0 - smoothstep(-aa, aa, S.r);',
          'float gutter = 1.0 - smoothstep(-0.9, -0.05, S.r);',
          'gcol = mix(gcol, cAsph * (0.82 + 0.18 * gutter), onRoad);',
          'gcol = mix(gcol, cGrass * 0.9, outside);',
          'diffuseColor.rgb *= gcol;',
          'float wetR = uWet * onRoad; diffuseColor.rgb *= 1.0 - 0.25 * wetR;', // wet asphalt reads darker …
        ].join('\n'))
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.42, wetR);')
          // … with a grey sheen of the street and its lights, not a mirror of the blue zenith
          .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  radiance = mix(radiance, vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))) * vec3(1.0, 0.96, 0.9), 0.85 * uWet) * (1.0 - 0.5 * wetR);');
    };
    mat.customProgramCacheKey = () => 'ground-v4';
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
  // zebra crossings where marked roads meet
  const P = [0, 0, 0, 1];
  for (const n of Roads.nodes) {
    if (n.deg < 3) continue;
    for (const e of n.edges) {
      if (!e.C.marks || e.len < 20) continue;
      const atA = e.a === n.id, s = atA ? Math.min(e.len * 0.4, 3.5 + e.hw * 0.6) : Math.max(e.len * 0.6, e.len - 3.5 - e.hw * 0.6);
      Roads.at(e, s, P);
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
      for (const sd of [-1, 1]) parts.push(box(P[0] - P[3] * sd * (wd / 2 - 0.2), 1.0, P[1] + P[2] * sd * (wd / 2 - 0.2), 0.3, 0.8, L, 0xd8d4ca, ang));
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
    const off = e.hw + Math.min(1.6, e.C.walk * 0.45), step = e.cls <= 2 ? 16 : 18;
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
        if (k % 2 === 0) { const it = newProp(x, z, 1, 'lamp'); it.ry = Math.atan2(P[3] * side, -P[2] * side); }
        else if (e.cls >= 3) newProp(x, z, rand(0.75, 0.95), 'tree');
      }
    }
  }
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
    const parts = [], beam = [];
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
      parts.push(box(px, this.y / 2 - 0.4, pz, 1.5, this.y - 0.8, 1.5, 0x9aa1aa));
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
    for (let k = 0; k < this.cars; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(mergeParts([
        box(0, 1.7, 0, 3.2, 3.2, 10, 0xeef1f5), box(0, 3.4, 0, 2.6, 0.3, 9.4, 0xd5dbe3),
        ...(k === 0 ? [box(0, 1.6, 5.4, 3.0, 2.6, 1.2, 0xeef1f5)] : []),
      ]), this.carMat);
      const wins = new THREE.Mesh(mergeParts([
        box(1.62, 2.2, 0, 0.05, 1.1, 8.4, 0xffffff), box(-1.62, 2.2, 0, 0.05, 1.1, 8.4, 0xffffff),
        ...(k === 0 ? [box(0, 2.3, 5.97, 2.4, 1.0, 0.1, 0xffffff)] : []),
      ]), this.winMat);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.35, 9.6), this.stripeMat); stripe.position.y = 1.2;
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
function buildWorld() {
  // lights / fog / shadows are driven every frame by DayNight + Render (tiers, camera-fitted cascades); these are start values
  scene.background = null; // the sky dome covers every pixel
  scene.fog = new THREE.Fog(0xd9b59d, 160, 700);
  W.hemi = new THREE.HemisphereLight(0xc4dbff, 0x7a6450, 0.62); scene.add(W.hemi);
  const sun = new THREE.DirectionalLight(0xffe2bd, 0.8);
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
  W.plazaPolys = [];
  W.ringPoly = ringPolygon();
  Landmarks.reserve();          // landmark footprints + story places claim their ground first
  lap('grid'); Ground.build(); lap('ground');
  buildBridges();
  Landmarks.build();            // palaces, temples, the square, special buildings, HQs, doors
  Metro.build();                // subway entrance kiosks on the sidewalks → W.stations
  lap('landmarks'); City.build();                 // hutongs, shop streets, modern blocks
  lap('city');
  Monorail.build();
  Signals.build();
  buildMarkings();
  finishBeijing();
  Build.finish(); lap('merge');
  waterMeshes();
  scatterParkTrees();
  streetFurniture();
  // lamps (pole + glowing head + pool of light) and trees, instanced per chunk
  const poolG = new THREE.PlaneGeometry(1, 1); poolG.rotateX(-Math.PI / 2);
  chunkInstances(W.lampList, [
    [mergeParts([box(0, 0.2, 0, 0.45, 0.4, 0.45, 0x2b2f36), box(0, 2.7, 0, 0.18, 5.2, 0.18, 0x3a3f47), box(0, 5.2, 0.6, 0.14, 0.14, 1.3, 0x3a3f47)]), MAT.vcCut, 'cm', true],
    [new THREE.BoxGeometry(0.55, 0.18, 0.6).translate(0, 5.08, 1.2), MAT.lampHead, 'hm', false], [poolG, MAT.lampPool, 'pm', false, true]], 7, 380);
  // shadow proxies: one crown + trunk (the 国槐 is 132 tris, the willow ~350)
  const posOnly = (g) => { const o = new THREE.BufferGeometry(); o.setAttribute('position', g.attributes.position); o.setIndex(g.index); o.computeBoundingSphere(); return o; };
  const treeSh = posOnly(mergeParts([box(0, 1.3, 0, 0.34, 2.6, 0.34, 0), gpart(new THREE.IcosahedronGeometry(2.0, 0), 0, 0.2, 3.7, 0, 0, 0, 0, 1, 0.85, 1)]));
  const palmSh = posOnly(mergeParts([box(0, 2.0, 0, 0.42, 4.0, 0.42, 0), gpart(new THREE.IcosahedronGeometry(2.1, 0), 0, 0, 4.2, 0, 0, 0, 0, 1, 0.9, 1)]));
  chunkInstances(W.treeList, [[mergeParts(TREE_GEO_PARTS()), MAT.vcCut, 'cm', true, false, treeSh]], 6, 400);
  chunkInstances(W.palmList, [[palmGeo(), MAT.vcCut, 'cm', true, false, palmSh]], 7, 420);
  chunkInstances(W.cypressList, [[cypressGeo(), MAT.vcCut, 'cm', true]], 8, 420);
  for (const list of [W.lampList, W.treeList, W.palmList, W.cypressList]) for (const it of list) Props.writeMatrix(it);
  parkBikes();
  Skyline.build();
  Cull.hook(); W.cull = Cull;
  // static chunk meshes never move: skip recomposing their matrices every frame (scene.updateMatrixWorld walks ~4k objects)
  for (const it of Cull.list) { it.m.updateMatrix(); it.m.matrixAutoUpdate = false; }
  lap('props');
  W.buildMs = Math.round(performance.now() - T0);
  console.log('[world] built in ' + W.buildMs + ' ms (' + TT.join(', ') + '), ' + W.solids.length + ' solids, ' + City.count + ' lots');
}

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
    const hills = [];
    for (let k = 0; k < 14; k++) hills.push(gpart(new THREE.ConeGeometry(rand(160, 280), rand(90, 170), 7), pick([0x55705a, 0x4d6a54, 0x5f7a60]), B.x0 - 500 - rand(0, 300), 0, cz - 1300 + k * 200 + rand(-60, 60), 0, rand(TAU), 0));
    const hm = new THREE.Mesh(mergeParts(hills), MAT.vc); hm.position.y = 30; hm.frustumCulled = false; scene.add(hm);
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
    this.baseColor = new THREE.Color(def.glass);
    this.towerMat = Render.cutout(new THREE.MeshPhongMaterial({ color: this.baseColor.clone(), map: TEX.curtain, emissive: new THREE.Color(def.c1), emissiveMap: TEX.curtainE, emissiveIntensity: 0.4, shininess: 60, specular: 0x8fa8ff }));
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
    this.towerMat.emissiveIntensity = 0.35 + DayNight.night * 0.9 + this.flash * 7;
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
