// Scripted story run-through for the headless smoke test:
//   node scripts/dev/smoke.mjs --html <build folder or page> --wait 60 --eval "$(cat scripts/dev/story_run.js)"
// Starts a new game, walks (teleports) to every giver marker, skips cutscenes, satisfies each objective through the
// game's own API (kill the mission mobs, eat tokens, transform, drive the checkpoints, wreck the HQ, enter / leave doors,
// beat the bosses) and checks that every marker / objective / door is on reachable ground. Returns a JSON report.
(async () => {
  const T = GTA, S = T.Story, P = T.Player, W = T.W, I = T.Interiors, E = T.Enemies, C = T.Cutscene, B = T.Boss, M = T.Monorail, Gd = T.Grid;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errs = [], oe = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 400)); oe.apply(console, a); };
  window.addEventListener('error', (e) => errs.push('uncaught ' + e.message));
  const r1 = (v) => Math.round(v * 10) / 10;
  // ---- reachability: 1 m flood fill from the spot to the street network, through open (non-water, non-solid) cells ----
  const SC = 16, hash = new Map();
  for (const s of W.solids) for (let gx = Math.floor(s.x0 / SC); gx <= Math.floor(s.x1 / SC); gx++) for (let gz = Math.floor(s.z0 / SC); gz <= Math.floor(s.z1 / SC); gz++) { const k = gx * 100003 + gz; (hash.get(k) || hash.set(k, []).get(k)).push(s); }
  const inSolid = (x, z, r) => {
    const l = hash.get(Math.floor(x / SC) * 100003 + Math.floor(z / SC)) || [];
    for (const s of l) {
      if (!s.solid || x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
      if (!s.obb) return true;
      const dx = x - s.cx, dz = z - s.cz; if (Math.abs(dx * s.ux + dz * s.uz) < s.hx + r && Math.abs(-dx * s.uz + dz * s.ux) < s.hz + r) return true;
    }
    return false;
  };
  const B0 = W.bounds;
  const pass = (x, z) => x > B0.x0 + 1 && x < B0.x1 - 1 && z > B0.z0 + 1 && z < B0.z1 - 1 && Gd.at(x, z) !== 3 && !inSolid(x, z, 0.45);
  const street = (x, z) => { const k = Gd.at(x, z); return k === 1 || k === 2 || k === 8; };
  function reach(x, z) {
    if (x > 3700) return { ok: true, why: 'indoor' };
    let sx = x, sz = z;
    if (!pass(sx, sz)) { // allow a spot right next to a wall (door markers, targets): start from the nearest open cell within 2.5 m
      let found = false;
      for (let d = 0.5; d <= 2.5 && !found; d += 0.5) for (let a = 0; a < 16 && !found; a++) { const px = x + Math.cos(a / 16 * 6.283) * d, pz = z + Math.sin(a / 16 * 6.283) * d; if (pass(px, pz)) { sx = px; sz = pz; found = true; } }
      if (!found) return { ok: false, why: 'blocked(' + Gd.at(x, z) + ')' };
    }
    const seen = new Set(), q = [[Math.floor(sx), Math.floor(sz)]]; seen.add(q[0][0] * 100000 + q[0][1]);
    for (let h = 0; h < q.length && h < 60000; h++) {
      const [cx, cz] = q[h];
      if (street(cx + 0.5, cz + 0.5)) return { ok: true, why: 'steps ' + h };
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz, k = nx * 100000 + nz; if (seen.has(k)) continue; seen.add(k);
        if (pass(nx + 0.5, nz + 0.5)) q.push([nx, nz]);
      }
    }
    return { ok: false, why: 'enclosed' };
  }
  const bad = [];
  const check = (what, x, z) => { const r = reach(x, z); if (!r.ok) bad.push({ what, x: r1(x), z: r1(z), grid: Gd.at(x, z), why: r.why }); return r.ok; };

  // ---- 1. doors: every door has an interior; leaving puts you outside that door (outward normal), clear of walls, and doesn't re-enter ----
  const doors = [];
  T.DEV.noRender = true;
  for (const d of W.doors) {
    const rep = { id: d.id, interior: d.interior, o: d.o && d.o.map((v) => r1(v)) };
    rep.reach = check('door ' + d.id, d.x, d.z);
    if (I.cur) I.leaveInstant();
    P.forceHuman(); P.pos.set(d.x, 0, d.z);
    I.enterInstant(d.interior, d); rep.in = I.cur === d.interior;
    I.leaveInstant();
    const dx = P.pos.x - d.x, dz = P.pos.z - d.z, dd = Math.hypot(dx, dz);
    rep.outDist = r1(dd); rep.outward = d.o ? r1((dx * d.o[0] + dz * d.o[1]) / (dd || 1)) : null;
    rep.outClear = !inSolid(P.pos.x, P.pos.z, 0.5) && Gd.at(P.pos.x, P.pos.z) !== 3;
    T.tick(6); rep.stayedOut = !I.cur && !I.fading;
    rep.ok = rep.reach && rep.in && rep.outDist > 1.6 && rep.outward > 0.8 && rep.outClear && rep.stayedOut;
    doors.push(rep);
    await sleep(0);
  }
  if (I.cur) I.leaveInstant();
  T.begin(null);
  for (let k = 0; k < 80 && !T.G.started; k++) await sleep(100);

  // ---- 2. the story: marker → cutscenes → objectives, mission by mission ----
  const MS = T.MISSIONS, per = {};
  const cur = () => (S.cur ? S.cur.def.id : null);
  const note = (id) => (per[id] = per[id] || { steps: [], t0: performance.now() });
  let lastStep = null, stuck = 0;
  for (let it = 0; it < 2000; it++) {
    P.hp = Math.max(P.hp, 60); P.invuln = 5;
    if (S.prog >= MS.length && !S.cur && S.flags.finished) break;
    if (!document.getElementById('confirm').hidden) { document.getElementById('confirm-yes').click(); await sleep(50); continue; }
    if (C.active) { C.skip(); T.tick(1); await sleep(20); continue; }
    if (I.fading || P.mode === 'dead' || P.mode === 'xform') { T.tick(4); await sleep(30); continue; }
    if (!S.cur) {
      const m = MS[S.prog]; if (!m) break;
      if (m.auto) { T.tick(2); await sleep(120); continue; }
      const w = m.where(); const rec = note(m.id);
      if (!rec.marker) { rec.marker = [r1(w.x), r1(w.z)]; rec.markerOk = check(m.id + ' marker', w.x, w.z); }
      if (I.cur) I.leaveInstant();
      P.forceHuman(); P.pos.set(w.x, 0, w.z); T.tick(2); await sleep(20);
      continue;
    }
    const id = cur(), rec = note(id), st = S.cur.s && S.cur.s.st;
    if (!st || !st.obj) { T.tick(2); await sleep(20); continue; }
    const key = id + ':' + st.obj;
    if (key !== lastStep) {
      lastStep = key; stuck = 0; T.tick(2);
      const tg = S.target(), step = { obj: st.obj };
      if (tg && tg.kind !== 'hq' && tg.kind !== 'enemy') step.targetOk = check(id + ' target ' + st.obj.slice(0, 16), tg.x, tg.z);
      if (st.target === 'enemy' || /countTag/.test(String(st.until))) { step.enemies = 0; for (const e of E.list) if (!e.dead && e.tag === 'mission') { step.enemies++; if (!check(id + ' enemy ' + e.type, e.pos.x, e.pos.z)) step.targetOk = false; } }
      if (st.target === 'token') { let n = 0, v = 0; for (const t of T.Tokens.items) if (t.alive && t.tag === 'm1') { n++; v += t.val; if (n <= 30 && !check(id + ' token', t.x, t.z)) step.targetOk = false; } step.tokens = n; step.tokenVal = v; }
      if (st.target && st.target.startsWith('hq:')) { const h = W.hqs.find((q) => q.id === st.target.slice(3)); const y = E.yard(h); step.targetOk = check(id + ' hq yard ' + h.id, y.x, y.z); }
      if (st.target === 'cp' && S.cps) { step.cps = S.cps.list.map((c) => c[2] || '·').join(' '); step.cpOk = S.cps.list.every((c) => check(id + ' cp', c[0], c[1])); step.timer = S.cur.timer; }
      rec.steps.push(step);
    }
    if (++stuck > 400) { rec.stuck = st.obj; break; }
    // satisfy the objective through the game's own systems
    const t = st.target;
    if (t === 'enemy' || /countTag/.test(String(st.until))) for (const e of E.list) { if (!e.dead && e.tag === 'mission') e.hit(1e5, 0, 0, 0, 'test'); }
    else if (t === 'token') P.tokens = Math.max(P.tokens, 1e6);
    else if (/变成卡车/.test(st.obj)) { if (P.mode === 'human') P.tryTransform(); else if (P.mode === 'robot') P.startXform('r2t'); }
    else if (/变身/.test(st.obj)) { if (P.mode === 'human') { P.tokens = Math.max(P.tokens, 1e6); P.tryTransform(); } }
    else if (t === 'cp' && S.cps) { const c = S.cps.list[S.cps.i]; if (c) { P.pos.set(c[0], 0, c[1]); P.vel.set(0, 0, 0); } }
    else if (t && t.startsWith('hq:')) { const h = W.hqs.find((q) => q.id === t.slice(3)); if (!h.dead) h.damage(1e7, h.cx, h.cz + 16, 'test'); }
    else if (t && t.startsWith('door:')) { const d = W.doors.find((q) => q.id === t.slice(5)); if (!I.cur) { P.forceHuman(); P.pos.set(d.x, 0, d.z); } }
    else if (t === 'exit' && I.cur) { const B = I.built[I.cur], x = B.exit.position; if (!I.exitArmed) { P.pos.set(B.b.x, 0, B.b.z); } else P.pos.set(x.x, 0, x.z); }
    else if (t === 'boss' && B.cur && !B.cur.dead) { rec.bossAt = [r1(B.cur.pos.x), r1(B.cur.pos.z)]; if (!I.cur) rec.bossOk = check(id + ' boss arena', B.cur.pos.x, B.cur.pos.z); B.damage(1e7, 'test', true); }
    else if (t === 'runner') { const a = T.Actors.get('runner'); if (a) { if (!rec.runLen) { rec.runLen = Math.round(S.runner.L); rec.runOk = S.runner.line.filter((p, i) => i % 3 === 0).every((p) => check(id + ' runner path', p[0], p[1])); } P.pos.set(a.pos.x + 1.2, 0, a.pos.z); } }
    else if (t === 'train' && M.hitTest) { const [ex, ez] = M.carPos(1); rec.trainRem = Math.round(((M.stationS - M.s) % M.L + M.L) % M.L); M.hitTest(ex, ez, 1, 1e5); }
    T.tick(3); await sleep(25);
  }
  for (const id in per) { per[id].ms = Math.round(performance.now() - per[id].t0); delete per[id].t0; per[id].done = !!S.done[id]; }
  console.error = oe;
  return JSON.stringify({
    prog: S.prog + '/' + MS.length, finished: !!S.flags.finished, done: Object.keys(S.done), race: S.race && { n: S.race.list.length, len: Math.round(S.race.len), time: S.race.time },
    doorsBad: doors.filter((d) => !d.ok), doorsOk: doors.filter((d) => d.ok).map((d) => d.id), unreachable: bad, missions: per, errors: errs.slice(0, 20),
  });
})()
