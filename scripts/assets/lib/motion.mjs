// Motion sources -> VRM normalized humanoid tracks.
// Every source (glTF skeleton clip or BVH mocap) is sampled into per-frame WORLD rotations of the
// mapped joints. With the source rest pose being a T-pose facing +Z, the VRM normalized local
// rotation of bone b is  N_b(t) = D_p(t)^-1 * D_b(t),  D_x(t) = W_x(t) * W_x(rest)^-1
// (p = nearest mapped humanoid ancestor). This is exactly what VRMAnimationLoaderPlugin expects when
// the VRMA rig has identity rest rotations, so the output rig is a synthetic T-pose skeleton.
import { Quaternion, Vector3, Matrix4, Euler } from 'three';
import { readFileSync } from 'node:fs';
import { readGLB, accessorArray } from './glb.mjs';

// VRM humanoid parent map (VRM 1.0 names), only bones we may write
export const VRM_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot',
};
for (const s of ['left', 'right']) {
  VRM_PARENT[s + 'ThumbMetacarpal'] = s + 'Hand'; VRM_PARENT[s + 'ThumbProximal'] = s + 'ThumbMetacarpal'; VRM_PARENT[s + 'ThumbDistal'] = s + 'ThumbProximal';
  for (const f of ['Index', 'Middle', 'Ring', 'Little']) { VRM_PARENT[s + f + 'Proximal'] = s + 'Hand'; VRM_PARENT[s + f + 'Intermediate'] = s + f + 'Proximal'; VRM_PARENT[s + f + 'Distal'] = s + f + 'Intermediate'; }
}
export const BONE_ORDER = Object.keys(VRM_PARENT);
export const isFinger = (b) => /Thumb|Index|Middle|Ring|Little/.test(b);
export const LOWER = new Set(['hips', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes']);

// UE5-mannequin names (Mesh2Motion / Quaternius UAL) -> VRM
export const UE_MAP = { pelvis: 'hips', spine_01: 'spine', spine_02: 'chest', spine_03: 'upperChest', neck_01: 'neck', head: 'head' };
for (const [s, S] of [['l', 'left'], ['r', 'right']]) {
  Object.assign(UE_MAP, { [`clavicle_${s}`]: S + 'Shoulder', [`upperarm_${s}`]: S + 'UpperArm', [`lowerarm_${s}`]: S + 'LowerArm', [`hand_${s}`]: S + 'Hand',
    [`thigh_${s}`]: S + 'UpperLeg', [`calf_${s}`]: S + 'LowerLeg', [`foot_${s}`]: S + 'Foot', [`ball_${s}`]: S + 'Toes',
    [`thumb_01_${s}`]: S + 'ThumbMetacarpal', [`thumb_02_${s}`]: S + 'ThumbProximal', [`thumb_03_${s}`]: S + 'ThumbDistal' });
  for (const [u, v] of [['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Little']])
    Object.assign(UE_MAP, { [`${u}_01_${s}`]: S + v + 'Proximal', [`${u}_02_${s}`]: S + v + 'Intermediate', [`${u}_03_${s}`]: S + v + 'Distal' });
}
// CMU (cgspeed BVH) -> VRM. LHipJoint / Neck1 / finger stubs fold into their neighbours.
export const CMU_MAP = { Hips: 'hips', LowerBack: 'spine', Spine: 'chest', Spine1: 'upperChest', Neck: 'neck', Head: 'head' };
for (const [s, S] of [['Left', 'left'], ['Right', 'right']])
  Object.assign(CMU_MAP, { [s + 'Shoulder']: S + 'Shoulder', [s + 'Arm']: S + 'UpperArm', [s + 'ForeArm']: S + 'LowerArm', [s + 'Hand']: S + 'Hand',
    [s + 'UpLeg']: S + 'UpperLeg', [s + 'Leg']: S + 'LowerLeg', [s + 'Foot']: S + 'Foot', [s + 'ToeBase']: S + 'Toes' });

// ---------- generic skeleton sampler ----------
// skel: { joints: [{name, parent(index|-1), restT:Vector3, restQ:Quaternion}], root world matrix }
// pose(t) -> per-joint local {t, q}; returns world matrices
export function fk(skel, locals, rootM) {
  const W = new Array(skel.joints.length);
  skel.joints.forEach((j, i) => {
    const L = new Matrix4().compose(locals[i].t, locals[i].q, locals[i].s || new Vector3(1, 1, 1));
    W[i] = j.parent < 0 ? rootM.clone().multiply(L) : W[j.parent].clone().multiply(L);
  });
  return W;
}

// ---------- glTF (Mesh2Motion) source ----------
export function loadGLTFMotion(path) {
  const g = readGLB(path), j = g.json;
  const parent = new Map(); j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const pelvis = j.nodes.findIndex((n) => n.name === 'pelvis');
  let top = pelvis; while (parent.has(top)) top = parent.get(top); // Armature
  // joints = pelvis ancestors (root, Armature) + pelvis subtree, in parent-first order
  const order = [], visit = (i) => { order.push(i); (j.nodes[i].children || []).forEach(visit); };
  const chain = []; for (let i = pelvis; i != null; i = parent.get(i)) chain.unshift(i);
  chain.slice(0, -1).forEach((i) => order.push(i)); visit(pelvis);
  const idx = new Map(order.map((n, k) => [n, k]));
  const joints = order.map((n) => {
    const nd = j.nodes[n];
    return { name: nd.name, node: n, parent: parent.has(n) && idx.has(parent.get(n)) ? idx.get(parent.get(n)) : -1,
      restT: new Vector3(...(nd.translation || [0, 0, 0])), restQ: new Quaternion(...(nd.rotation || [0, 0, 0, 1])), restS: new Vector3(...(nd.scale || [1, 1, 1])) };
  });
  const clips = new Map();
  for (const a of j.animations) {
    const ch = a.channels.map((c) => {
      const s = a.samplers[c.sampler];
      return { k: idx.get(c.target.node), path: c.target.path, times: accessorArray(g, s.input), values: accessorArray(g, s.output), interp: s.interpolation || 'LINEAR' };
    }).filter((c) => c.k != null && c.path !== 'scale' && c.k >= idx.get(pelvis)); // ignore root/Armature keys (a few clips move 'root')
    const dur = Math.max(...ch.map((c) => c.times[c.times.length - 1]));
    clips.set(a.name, { dur, ch });
  }
  const skel = { joints, map: UE_MAP, fps: 30 };
  skel.sample = (clipName, t) => {
    const clip = clips.get(clipName); if (!clip) throw new Error('no clip ' + clipName);
    const loc = joints.map((jt) => ({ t: jt.restT.clone(), q: jt.restQ.clone(), s: jt.restS }));
    for (const c of clip.ch) {
      const T = c.times, n = T.length, w = c.path === 'rotation' ? 4 : 3;
      let i = 0; if (t >= T[n - 1]) i = n - 1; else while (i < n - 1 && T[i + 1] <= t) i++;
      const f = i < n - 1 && c.interp !== 'STEP' ? (t - T[i]) / (T[i + 1] - T[i]) : 0;
      if (c.path === 'rotation') {
        const a = new Quaternion().fromArray(c.values, i * 4);
        if (f > 0) a.slerp(new Quaternion().fromArray(c.values, (i + 1) * 4), f);
        loc[c.k].q.copy(a);
      } else if (c.path === 'translation') {
        const a = new Vector3().fromArray(c.values, i * 3); if (f > 0) a.lerp(new Vector3().fromArray(c.values, (i + 1) * 3), f);
        loc[c.k].t.copy(a);
      }
    }
    return loc;
  };
  skel.clipDuration = (n) => clips.get(n).dur;
  skel.clipNames = () => [...clips.keys()];
  skel.rest = () => joints.map((jt) => ({ t: jt.restT, q: jt.restQ, s: jt.restS }));
  skel.rootM = new Matrix4();
  return skel;
}

// ---------- BVH (CMU cgspeed) source ----------
export function loadBVH(path) {
  const txt = readFileSync(path, 'utf8'), lines = txt.split(/\r?\n/);
  const joints = [], stack = []; let li = 0, cur = -1;
  for (; li < lines.length; li++) {
    const l = lines[li].trim(); if (l === 'MOTION') break;
    let m;
    if ((m = l.match(/^(ROOT|JOINT)\s+(\S+)/))) { joints.push({ name: m[2], parent: cur, offset: null, channels: [] }); stack.push(cur); cur = joints.length - 1; }
    else if (l.startsWith('End Site')) { stack.push(cur); cur = -2; }
    else if ((m = l.match(/^OFFSET\s+(\S+)\s+(\S+)\s+(\S+)/)) && cur >= 0) joints[cur].offset = new Vector3(+m[1], +m[2], +m[3]);
    else if ((m = l.match(/^CHANNELS\s+\d+\s+(.*)$/))) joints[cur].channels = m[1].trim().split(/\s+/);
    else if (l === '}') cur = stack.pop();
  }
  const nFrames = +lines[++li].split(':')[1], dt = +lines[++li].split(':')[1];
  const frames = []; for (let f = 0; f < nFrames; f++) frames.push(lines[++li].trim().split(/\s+/).map(Number));
  const D2R = Math.PI / 180;
  const locals = (fr) => {
    let c = 0;
    return joints.map((jt) => {
      const t = jt.offset.clone(); let order = '', ang = {};
      for (const ch of jt.channels) {
        const v = fr[c++];
        if (ch.endsWith('position')) t.setComponent('XYZ'.indexOf(ch[0]), v);
        else { order += ch[0]; ang[ch[0]] = v * D2R; }
      }
      // BVH: R = R(ch1) * R(ch2) * R(ch3) (intrinsic); three's Euler order string names the same product
      const q = new Quaternion().setFromEuler(new Euler(ang.X || 0, ang.Y || 0, ang.Z || 0, order || 'XYZ'));
      return { t, q };
    });
  };
  const skel = { joints: joints.map((jt) => ({ name: jt.name, parent: jt.parent })), map: CMU_MAP, fps: 1 / dt, nFrames, rootM: new Matrix4(), hipsFromLegs: true, autoGround: true };
  skel.sample = (_, t) => { const f = Math.min(nFrames - 1, Math.max(0, t / dt)), i = Math.floor(f), k = f - i, a = locals(frames[i]); if (k < 1e-6 || i + 1 >= nFrames) return a; const b = locals(frames[i + 1]); return a.map((x, n) => ({ t: x.t.lerp(b[n].t, k), q: x.q.slerp(b[n].q, k) })); };
  skel.rest = () => locals(frames[0]); // cgspeed frame 0 = T-pose
  skel.clipDuration = () => (nFrames - 1) * dt;
  return skel;
}

const LIMB_AXES = [
  ['leftUpperArm', 'leftLowerArm', new Vector3(1, 0, 0)], ['leftLowerArm', 'leftHand', new Vector3(1, 0, 0)],
  ['rightUpperArm', 'rightLowerArm', new Vector3(-1, 0, 0)], ['rightLowerArm', 'rightHand', new Vector3(-1, 0, 0)],
  ['leftUpperLeg', 'leftLowerLeg', new Vector3(0, -1, 0)], ['leftLowerLeg', 'leftFoot', new Vector3(0, -1, 0)],
  ['rightUpperLeg', 'rightLowerLeg', new Vector3(0, -1, 0)], ['rightLowerLeg', 'rightFoot', new Vector3(0, -1, 0)],
];

// ---------- world deltas -> normalized tracks ----------
// returns { bones:[vrm names], restPos:{bone:Vector3 world (scaled)}, times, rot:{bone:[Quaternion]}, hips:[Vector3] }
// Positions are normalised to the Quaternius proportions (hips 0.917 m, ankles 0.104 m) by the
// hips-to-ankle length, so mocap with ankle joints at floor level keeps its feet on the ground.
export function bake(skel, clipName, { t0 = 0, t1 = null, fps = 30, hipsH = 0.917, ankleH = 0.104 } = {}) {
  const restW = fk(skel, skel.rest(), skel.rootM);
  const mapped = skel.joints.map((j, i) => [skel.map[j.name], i]).filter(([b]) => b);
  const jointOf = Object.fromEntries(mapped);
  const bones = BONE_ORDER.filter((b) => jointOf[b] != null);
  // Hips translation point. CMU's Hips joint sits ~9 cm above the hip joints while VRoid/Quaternius
  // hips are level with them; tracking the hip-joint midpoint keeps feet planted when knees bend.
  const hipsJ = jointOf.hips, legsJ = [jointOf.leftUpperLeg, jointOf.rightUpperLeg];
  const hipsAt = (W) => skel.hipsFromLegs ? new Vector3().setFromMatrixPosition(W[legsJ[0]]).add(new Vector3().setFromMatrixPosition(W[legsJ[1]])).multiplyScalar(0.5) : new Vector3().setFromMatrixPosition(W[hipsJ]);
  const restHips = hipsAt(restW);
  const ankleY = ['leftFoot', 'rightFoot'].reduce((s, b) => s + new Vector3().setFromMatrixPosition(restW[jointOf[b]]).y, 0) / 2;
  const scale = (hipsH - ankleH) / (restHips.y - ankleY), off = new Vector3(0, ankleH - ankleY * scale, 0);
  const place = (v) => v.multiplyScalar(scale).add(off);
  const restPos = {}; for (const b of bones) restPos[b] = place(new Vector3().setFromMatrixPosition(restW[jointOf[b]]));
  restPos.hips = place(restHips.clone());
  const restQinv = {}; for (const b of bones) restQinv[b] = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(restW[jointOf[b]])).invert();
  // Mocap "T-pose" frames are rarely exact (CMU arms droop ~8 deg): snap limb rest directions to the
  // ideal T-pose axes, so the delta is measured from a true T-pose. (~0 for the Quaternius rigs.)
  for (const [b, child, axis] of LIMB_AXES) {
    if (!restPos[b] || !restPos[child]) continue;
    const cur = restPos[child].clone().sub(restPos[b]).normalize(), C = new Quaternion().setFromUnitVectors(cur, axis);
    restQinv[b].multiply(C.invert());
  }
  const end = t1 ?? skel.clipDuration(clipName), n = Math.max(2, Math.round((end - t0) * fps) + 1);
  const times = [], rot = Object.fromEntries(bones.map((b) => [b, []])), hips = [], ankles = [];
  for (let f = 0; f < n; f++) {
    const t = t0 + ((end - t0) * f) / (n - 1);
    const W = fk(skel, skel.sample(clipName, t), skel.rootM);
    const D = {};
    for (const b of bones) D[b] = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(W[jointOf[b]])).multiply(restQinv[b]);
    for (const b of bones) {
      let p = VRM_PARENT[b]; while (p && !D[p]) p = VRM_PARENT[p];
      rot[b].push(p ? D[p].clone().invert().multiply(D[b]) : D[b].clone());
    }
    hips.push(place(hipsAt(W)));
    if (skel.autoGround) ankles.push(Math.min(place(new Vector3().setFromMatrixPosition(W[jointOf.leftFoot])).y, place(new Vector3().setFromMatrixPosition(W[jointOf.rightFoot])).y));
    times.push(t - t0);
  }
  // mocap floor != the synthetic T-pose frame's floor: put the lowest ankle (5th percentile) at ankleH
  if (skel.autoGround && ankles.length) { const a = [...ankles].sort((x, y) => x - y)[Math.floor(ankles.length * 0.05)], dy = ankleH - a; hips.forEach((h) => { h.y += dy; }); }
  return { bones, restPos, times, rot, hips, fps };
}

// yaw of the hips forward (+Z) at frame i
export function hipsYaw(m, i = 0) { const f = new Vector3(0, 0, 1).applyQuaternion(m.rot.hips[i]); return Math.atan2(f.x, f.z); }

// rotate the whole motion about Y (world): hips rotation and hips path
export function turn(m, yaw, pivot = null) {
  const G = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), c = pivot || m.hips[0].clone().setY(0);
  m.rot.hips = m.rot.hips.map((q) => G.clone().multiply(q));
  m.hips = m.hips.map((p) => p.clone().sub(c).applyQuaternion(G).add(c));
  return m;
}
