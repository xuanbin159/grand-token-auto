// Bake the game's animation set into VRMA files (VRMC_vrm_animation 1.0), one clip per file.
// Sources: Mesh2Motion human animation GLBs (CC0; include Quaternius UAL1/UAL2 Standard) and CMU mocap BVH.
// Output rig = synthetic T-pose skeleton with identity rest rotations, so the tracks ARE the VRM
// normalized local rotations (see lib/motion.mjs). Load with VRMAnimationLoaderPlugin +
// createVRMAnimationClip(vrmAnimation, vrm) on any VRM 0.x / 1.0 model.
//   node scripts/assets/bake_anims.mjs [--raw DIR] [--only key,key]
import { mkdirSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3 } from 'three';
import { loadGLTFMotion, loadBVH, bake, hipsYaw, turn, VRM_PARENT, LOWER, isFinger } from './lib/motion.mjs';
import { writeGLB, readGLB } from './lib/glb.mjs';
import { meshoptGLB } from './lib/meshopt.mjs';
import { CLIPS } from './lib/clips.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const RAW = opt('raw', process.env.GTA_RAW || join(REPO, 'assets/_raw')), OUT = join(REPO, 'assets/runtime/anims');
const only = opt('only', '') ? opt('only').split(',') : null;
mkdirSync(OUT, { recursive: true });

const SRC = {}, src = (id) => {
  if (!SRC[id]) SRC[id] = id.startsWith('cmu/') ? loadBVH(join(RAW, 'anims', id + '.bvh')) : loadGLTFMotion(join(RAW, 'anims', `human-${id}-animations.glb`));
  return SRC[id];
};
const parse = (s) => { const [id, clip] = s.split(':'); return { skel: src(id), clip: clip || null }; };

// --- motion surgery -------------------------------------------------------------------------
function sampleMotion(spec) {
  const { skel, clip } = parse(spec.src);
  const m = bake(skel, clip, { t0: spec.t0 || 0, t1: spec.t1 ?? null, fps: 30 });
  if (spec.face === 'travel') { const d = m.hips.at(-1).clone().sub(m.hips[0]); turn(m, -Math.atan2(d.x, d.z)); } // travel along +Z
  else if (spec.face !== false && spec.src.startsWith('cmu/')) turn(m, -hipsYaw(m, 0)); // start facing +Z
  if (spec.yaw) turn(m, spec.yaw);
  return m;
}
// resample a motion to n frames over its own duration (for body-part mixing with a different length)
function resample(m, n, cycles = 1, T = m.times.at(-1)) {
  const out = { ...m, times: [], rot: {}, hips: [] };
  for (const b of m.bones) out.rot[b] = [];
  for (let f = 0; f < n; f++) {
    const c = (f / (n - 1)) * cycles; let u = c - Math.floor(c); if (c > 0 && u === 0) u = 1;
    const x = u * (m.times.length - 1), i = Math.min(Math.floor(x), m.times.length - 2), k = x - i;
    for (const b of m.bones) out.rot[b].push(m.rot[b][i].clone().slerp(m.rot[b][i + 1], k));
    out.hips.push(m.hips[i].clone().lerp(m.hips[i + 1], k)); out.times.push((T * f) / (n - 1));
  }
  return out;
}
// upper body from another clip (spine up, arms, fingers); legs + hips stay
function mixUpper(base, upper, cycles, only) {
  const u = resample(upper, base.times.length, cycles);
  for (const b of base.bones) if (!LOWER.has(b) && u.rot[b] && (!only || only.test(b))) base.rot[b] = u.rot[b];
  return base;
}
// remove net horizontal travel (keep sway) and centre the path on the origin
function inPlace(m, centre) {
  const n = m.hips.length, a = m.hips[0].clone(), d = m.hips[n - 1].clone().sub(a).setY(0);
  const travel = [+d.x.toFixed(3), +d.z.toFixed(3)];
  const p = m.hips.map((h, i) => h.clone().sub(d.clone().multiplyScalar(i / (n - 1))).sub(new Vector3(a.x, 0, a.z)));
  // loops: centre the sway on the origin; one-shots start (and end) exactly at the origin
  const mean = centre ? p.reduce((s, v) => s.add(v), new Vector3()).multiplyScalar(1 / n).setY(0) : new Vector3();
  m.hips = p.map((v) => v.sub(mean));
  return travel;
}
function startAtOrigin(m) { const a = m.hips[0].clone(); m.hips = m.hips.map((h) => new Vector3(h.x - a.x, h.y, h.z - a.z)); const e = m.hips.at(-1); return [+e.x.toFixed(3), +e.z.toFixed(3)]; }
// make a mocap segment loop: cross-fade the last `blend` seconds into the first frames
function loopBlend(m, blend = 0.25) {
  const n = m.times.length, k = Math.min(Math.round(blend * 30), Math.floor(n / 3));
  for (let i = 0; i < k; i++) {
    const w = (i + 1) / (k + 1), j = n - k + i; // frame j eases toward frame i of the start
    for (const b of m.bones) m.rot[b][j] = m.rot[b][j].clone().slerp(m.rot[b][0], w);
    m.hips[j] = m.hips[j].clone().lerp(m.hips[0], w);
  }
  for (const b of m.bones) m.rot[b][n - 1] = m.rot[b][0].clone(); m.hips[n - 1] = m.hips[0].clone();
}
// scale a bone's rotation (0 = rest, 1 = as captured), e.g. calm noisy mocap fingers / torso
function damp(m, bones, s) { for (const b of bones) if (m.rot[b]) m.rot[b] = m.rot[b].map((q) => new Quaternion().slerp(q, s)); }

// --- keyframe reduction ------------------------------------------------------------------------
function reduceQuat(times, qs, tol) {
  const keep = [0]; let last = 0;
  for (let i = 1; i < qs.length - 1; i++) {
    let ok = true; // can we skip from `last` to i+1 ?
    for (let j = last + 1; j <= i && ok; j++) { const f = (times[j] - times[last]) / (times[i + 1] - times[last]); ok = qs[last].clone().slerp(qs[i + 1], f).angleTo(qs[j]) < tol; }
    if (!ok) { keep.push(i); last = i; }
  }
  keep.push(qs.length - 1);
  if (keep.length === 2 && qs[0].angleTo(qs.at(-1)) < tol) keep.pop(); // constant
  return keep;
}
function reduceVec(times, vs, tol) {
  const keep = [0]; let last = 0;
  for (let i = 1; i < vs.length - 1; i++) {
    let ok = true;
    for (let j = last + 1; j <= i && ok; j++) { const f = (times[j] - times[last]) / (times[i + 1] - times[last]); ok = vs[last].clone().lerp(vs[i + 1], f).distanceTo(vs[j]) < tol; }
    if (!ok) { keep.push(i); last = i; }
  }
  keep.push(vs.length - 1); return keep;
}

// --- VRMA writer ---------------------------------------------------------------------------------
function writeVRMA(path, m, { fingers = true, name = 'clip' } = {}) {
  const bones = m.bones.filter((b) => fingers || !isFinger(b));
  const nodes = [], idx = {};
  for (const b of bones) {
    let p = VRM_PARENT[b]; while (p && idx[p] == null) p = VRM_PARENT[p];
    const t = p ? m.restPos[b].clone().sub(m.restPos[p]) : m.restPos[b].clone().setX(0).setZ(0);
    idx[b] = nodes.push({ name: b, translation: t.toArray().map((x) => +x.toFixed(5)) }) - 1;
    if (p) (nodes[idx[p]].children ||= []).push(idx[b]);
  }
  const json = { asset: { version: '2.0', generator: 'GrandTokenAuto bake_anims' }, scene: 0, scenes: [{ nodes: [idx.hips] }], nodes,
    accessors: [], bufferViews: [], animations: [{ name, channels: [], samplers: [] }],
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones: Object.fromEntries(bones.map((b) => [b, { node: idx[b] }])) } } } };
  const g = { json, views: [] }, anim = json.animations[0], timeCache = new Map();
  const acc = (arr, type, minmax) => {
    const bv = json.bufferViews.push({ buffer: 0, byteLength: arr.byteLength }) - 1; g.views.push(Buffer.from(arr.buffer));
    const a = { bufferView: bv, componentType: 5126, count: arr.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], type };
    if (minmax) { a.min = [Math.min(...arr)]; a.max = [Math.max(...arr)]; }
    return json.accessors.push(a) - 1;
  };
  const timesAcc = (keep) => { const k = keep.join(','); if (!timeCache.has(k)) timeCache.set(k, acc(new Float32Array(keep.map((i) => m.times[i])), 'SCALAR', true)); return timeCache.get(k); };
  const tol = (b) => (isFinger(b) ? 0.01 : b === 'hips' || LOWER.has(b) ? 0.0025 : 0.004);
  for (const b of bones) {
    const qs = m.rot[b]; for (let i = 1; i < qs.length; i++) if (qs[i].dot(qs[i - 1]) < 0) qs[i].set(-qs[i].x, -qs[i].y, -qs[i].z, -qs[i].w);
    const keep = reduceQuat(m.times, qs, tol(b)), vals = new Float32Array(keep.length * 4);
    keep.forEach((i, k) => qs[i].toArray(vals, k * 4));
    const s = anim.samplers.push({ input: timesAcc(keep), output: acc(vals, 'VEC4'), interpolation: 'LINEAR' }) - 1;
    anim.channels.push({ sampler: s, target: { node: idx[b], path: 'rotation' } });
  }
  const hk = reduceVec(m.times, m.hips, 0.002), hv = new Float32Array(hk.length * 3); hk.forEach((i, k) => m.hips[i].toArray(hv, k * 3));
  const s = anim.samplers.push({ input: timesAcc(hk), output: acc(hv, 'VEC3'), interpolation: 'LINEAR' }) - 1;
  anim.channels.push({ sampler: s, target: { node: idx.hips, path: 'translation' } });
  return writeGLB(path, g);
}

// --- main ----------------------------------------------------------------------------------------
const results = [];
for (const c of CLIPS) {
  if (only && !only.includes(c.key)) continue;
  const out = join(OUT, c.key + '.vrma');
  if (c.alias) continue;
  if (c.copy) { copyFileSync(join(RAW, c.copy), out); results.push({ key: c.key, bytes: statSync(out).size, copied: true }); continue; }
  let m = sampleMotion(c);
  if (c.repeat) m = resample(m, (m.times.length - 1) * c.repeat + 1, c.repeat, m.times.at(-1) * c.repeat);
  if (c.upper) mixUpper(m, sampleMotion({ ...c, src: c.upper, t0: c.upperT0, t1: c.upperT1, yaw: 0 }), c.upperCycles || 1, c.upperOnly);
  if (c.damp) for (const [bs, s] of c.damp) damp(m, bs, s);
  if (c.loopBlend) loopBlend(m, c.loopBlend);
  const travel = c.root === 'keep' ? startAtOrigin(m) : inPlace(m, !!c.loop);
  const bytes = writeVRMA(out, m, { name: c.key });
  results.push({ key: c.key, bytes, dur: +m.times.at(-1).toFixed(3), frames: m.times.length, travel });
  console.log(c.key.padEnd(16), String(bytes).padStart(7), 'B', m.times.at(-1).toFixed(2) + 's', 'travel', travel);
}
// meshopt-code every clip written (lib/meshopt.mjs: lossless; .vrma travels without gzip on GitHub Pages)
for (const r of results) { const p = join(OUT, r.key + '.vrma'), b = await meshoptGLB(readGLB(p)); if (b) { writeFileSync(p, b); r.bytes = b.length; } }
if (!only) writeFileSync(join(HERE, 'data/anim_bake.json'), JSON.stringify(results, null, 1) + '\n');
