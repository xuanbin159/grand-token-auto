/* ============================================================
   ui: SA-style HUD, radar, dialog/phone/letterbox, panels
   (stats · skill tree · specialisation · map · missions),
   shops, wardrobe, credits, touch controls
   ============================================================ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RADIO = [
  ['京城 Token 交通台 FM 88.8', '《二环又堵了》'], ['胡同之声 FM 97.4', '《鸽哨儿与 Attention》'], ['得云社相声台', '《我和大模型不得不说的事儿》'],
  ['京韵大鼓 · Softmax 专场', '《温度调到 0.7》'], ['显存告急台', '《OOM 之歌（京剧版）》'], ['上下文 1M 广播', '《长文本也会累》'], ['梯度之声 FM', '《学习率甭太大》'],
];
const TIPS = ['吃满 1M Token 才能变身，变完身 Token 会一点点儿烧掉。', '王府里的雕花大床能存档，衣柜能换行头。', '开车撞进舆情公关中心，花钱就能把律师函给平了。',
  '按 Tab 打开角色面板：技能树、专精、地图、任务，全在里头。', '5 级以后能选专精，攒满能量按 R 放大招。', '拳头招呼 Kwen 办公、飞脚踹逗包办公，伤害翻倍。',
  '打人会爆金币！戴上大金链子、貔貅手串，爆得更多。', '琉璃厂、王府井、大栅栏、老王五金、中关村都能买装备，买了立马穿身上。', '天桥得云社能听相声，乐呵完了经验涨得快。',
  '护锅寺小吃的卤煮火烧能回满血，权重德的二锅头喝了能打醉拳。', 'Kodex 应用科学部能给战甲上镀层、换涂装。', '变身动画太长？按 T 或空格直接跳到亮相。'];
const TOUCH_LABELS = {
  human: { KeyJ: '拳', KeyK: '踢', Space: '跳', KeyF: '上车', KeyT: '变身', KeyL: '', KeyR: '', KeyQ: '' },
  car: { KeyJ: '喇叭', KeyK: '', Space: '手刹', KeyF: '下车', KeyT: '变身', KeyL: '', KeyR: '', KeyQ: '' },
  robot: { KeyJ: '拳', KeyK: '踢', Space: '砸地', KeyF: '抓车', KeyT: '卡车', KeyL: '光束', KeyR: '大招', KeyQ: '解除' },
  truck: { KeyJ: '喇叭', KeyK: '', Space: '手刹', KeyF: '', KeyT: '机器人', KeyL: '', KeyR: '大招', KeyQ: '解除', ShiftLeft: '氮气' },
};

/* ---- your own face: pick a picture, line the eyes up, and it becomes the hero everywhere.
   Kept only in this browser (localStorage); nothing leaves the page. ---- */
const HeroFace = {
  KEY: 'gta-hero-face', custom: false,
  stored() { const d = Store.get(this.KEY); return d && typeof d.img === 'string' && d.img.startsWith('data:image/') ? d : null; },
  async load(url) {
    FACE_IMG.src = url;
    await Promise.race([FACE_IMG.decode().catch(() => {}), new Promise((r) => { if (FACE_IMG.complete) r(); else { FACE_IMG.onload = r; FACE_IMG.onerror = r; } }), new Promise((r) => setTimeout(r, 1500))]);
  },
  // at boot, before any texture is made from the face
  async boot() { const d = this.stored(); if (!d) return; this.custom = true; FACE_EYES = d.eyes || FACE_EYES_CENTRED; await this.load(d.img); },
  async set(url) {
    const saved = Store.set(this.KEY, { v: 1, img: url, eyes: FACE_EYES_CENTRED });
    this.custom = true; FACE_EYES = FACE_EYES_CENTRED; await this.load(url); this.refresh();
    return saved;
  },
  async reset() { Store.del(this.KEY); this.custom = false; FACE_EYES = FACE_EYES_DEFAULT; await this.load(FACE_DATA); this.refresh(); },
  // everything that has the face baked in: head sprite with hat/glasses, helmet, portraits, title art
  refresh() { TEX.face = tex(faceSticker(256, 9)); Player.refreshHead(); Robot.repaint(RPG.paint); this.titleArt(); },
  titleArt() {
    const bust = this.custom ? heroBustCanvas().toDataURL('image/jpeg', 0.9) : BUST_DATA;
    $('t-bust').src = bust; $('ld-bust').src = bust;
    const th = $('t-helmet'), g = th.getContext('2d'); g.clearRect(0, 0, th.width, th.height); g.drawImage(TEX.helmet.image, 0, 0, th.width, th.height);
  },
};

const HEAD_URLS = new WeakMap();
function headURL(sp) { const h = sp && sp.head ? sp.head() : null; if (!h || !h.image) return ''; let u = HEAD_URLS.get(h.image); if (!u) { u = h.image.toDataURL(); HEAD_URLS.set(h.image, u); } return u; }
const UI = {
  last: {}, bigT: 0, subT: 0, newsT: 0, radioT: 0, distT: 0, hintT: 0, toastT: 0, hurtA: 0, flashA: 0, healA: 0, radarT: 0, statT: 0, lvT: 0, carT: 0,
  moneyShown: 0, lastDist: '', touchMode: '', panelOpen: false, panelTab: 'stats', shopId: null, portraitR: null,
  init() {
    Floaters.el = $('floaters'); Bubble.el = $('bubbles');
    this.radar = $('radar'); this.rctx = this.radar.getContext('2d');
    this.hqBars = W.hqs.map((h) => {
      const d = document.createElement('div'); d.className = 'hqbar'; d.hidden = true;
      d.innerHTML = '<b></b><i><s></s></i>'; d.querySelector('b').textContent = h.name; d.querySelector('s').style.background = h.c1;
      $('hqbars').appendChild(d); return { h, d, fill: d.querySelector('s') };
    });
    this.portraitH = faceSticker(160, 6).toDataURL();
    $('portrait').src = this.portraitH;
    const st = $('stars'); for (let k = 0; k < 6; k++) { const s = document.createElement('i'); s.textContent = '★'; st.appendChild(s); }
    this.stars = [...st.children];
    $('btn-pause').addEventListener('click', () => togglePause());
    $('btn-menu').addEventListener('click', () => this.openPanel('stats'));
    $('p-resume').addEventListener('click', () => togglePause(false));
    $('p-panel').addEventListener('click', () => { togglePause(false); this.openPanel('stats'); });
    $('p-mute').addEventListener('click', () => toggleMute());
    $('p-save').addEventListener('click', () => { const ok = G.save(false); this.toast(ok ? '已保存（浏览器本地）' : '这个浏览器不让存档', 2.4); });
    $('p-restart').addEventListener('click', () => { this.confirm('确定要重新开始吗？没存的进度会丢失。', () => location.reload()); });
    $('p-face').addEventListener('click', () => this.openFacePicker());
    $('e-continue').addEventListener('click', () => { $('end').hidden = true; G.paused = false; });
    $('e-restart').addEventListener('click', () => location.reload());
    $('panel-close').addEventListener('click', () => this.closePanel());
    for (const b of document.querySelectorAll('#panel .tabs button')) b.addEventListener('click', () => { Sfx.click(); this.panelTab = b.dataset.tab; this.renderPanel(); });
    $('shop-close').addEventListener('click', () => this.closeShop());
    $('dlg').addEventListener('click', () => { Input.click = true; });
    $('lb-skip').addEventListener('click', () => { if (Cutscene.active) Cutscene.skip(); });
    if (IS_TOUCH) { document.body.classList.add('touch'); this.initTouch(); }
    canvasEl.addEventListener('pointerdown', () => { Input.click = true; });
    this.resize();
  },
  resize() {
    const r = this.radar.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.radar.width = Math.max(10, Math.round(r.width * dpr)); this.radar.height = Math.max(10, Math.round(r.height * dpr)); this.rdpr = dpr;
  },
  showHud() { $('hud').hidden = false; if (IS_TOUCH) $('touch').hidden = false; this.resize(); },
  hudDim(on) { $('hud').classList.toggle('dim', on); if (IS_TOUCH) $('touch').hidden = on || !G.started; },
  // ---- transient text ----
  big(title, sub = '', style = 'white', dur = 2.2, force = false) {
    // SA keeps pickup/level banners out of cutscenes: hold them until the letterbox lifts
    if (!force && Cutscene.active && document.body.classList.contains('cine')) { this.deferred.big = [title, sub, style, dur]; return; }
    $('bt-title').textContent = title; $('bt-sub').textContent = sub; $('bigtext').className = 'show ' + style; this.bigT = dur;
  },
  deferred: {},
  flushDeferred() {
    const d = this.deferred; this.deferred = {};
    if (d.big) this.big(...d.big);
    if (d.lv) this.levelUp(d.lv);
  },
  subtitle(text, dur = 3) { const el = $('subtitle'); el.textContent = text; el.classList.add('show'); this.subT = dur; },
  hint(text) { this.toast(text, 1.8); },
  toast(text, dur = 2) { const el = $('toast'); el.textContent = text; el.classList.add('show'); this.toastT = dur; },
  news(text) { $('news-text').textContent = text; $('news').classList.add('show'); this.newsT = 6; },
  radio() { const [s, song] = pick(RADIO); $('radio').innerHTML = `<b>${esc(s)}</b><span>正在播放 ${esc(song)}</span>`; $('radio').classList.add('show'); this.radioT = 3; },
  carName(n) { $('carname').textContent = n; $('carname').classList.add('show'); this.carT = 2.6; },
  district(cn, en) { $('d-cn').textContent = cn; $('d-en').textContent = en; $('district').classList.add('show'); this.distT = 3; },
  hurt(a) { this.hurtA = Math.min(0.9, this.hurtA + a); },
  flash() { this.flashA = 1; },
  flashHeal() { this.healA = 0.7; },
  stat(t) { const el = $('statpop'); el.textContent = t; el.classList.add('show'); this.statT = 2.6; },
  levelUp(lv) { if (Cutscene.active && document.body.classList.contains('cine')) { this.deferred.lv = lv; return; } const el = $('lvup'); el.innerHTML = `<b>等级提升！</b><span>Lv.${lv} · 获得 1 个技能点（Tab 查看）</span>`; el.classList.add('show'); this.lvT = 3.2; },
  wasted(busted) { canvasEl.classList.add('wasted'); this.big(busted ? 'BUSTED' : 'WASTED', busted ? '让法务部请去喝茶了 · 律师函已送达' : 'OOM · 显存溢出，人撂这儿了', busted ? 'busted' : 'wasted', 4); },
  unwasted() { canvasEl.classList.remove('wasted'); },
  fade(to, dur, cb) {
    const el = $('fadeov'); el.style.transition = `opacity ${dur}s linear`; el.style.opacity = String(to);
    if (cb) setTimeout(cb, dur * 1000 + 20);
  },
  letterbox(on) { document.body.classList.toggle('cine', on); },
  chapter(t, sub) {
    const el = $('chapter');
    if (!t) { el.classList.remove('show'); return; }
    $('ch-t').textContent = t; $('ch-s').textContent = sub || ''; el.classList.add('show');
    clearTimeout(this._chT); this._chT = setTimeout(() => el.classList.remove('show'), 2700);
  },
  dialog(sp, text) {
    const el = $('dlg');
    if (!sp) { el.classList.remove('show'); return; }
    const url = headURL(sp);
    $('dlg-img').hidden = !url; if (url) $('dlg-img').src = url;
    $('dlg-name').textContent = sp.name; $('dlg-name').style.color = sp.color;
    $('dlg-text').textContent = text; el.classList.add('show');
  },
  dialogText(t) { $('dlg-text').textContent = t; },
  phone(sp, text) {
    const el = $('phone');
    if (!sp) { el.classList.remove('show'); return; }
    const url = headURL(sp);
    $('ph-img').hidden = !url; if (url) $('ph-img').src = url;
    $('ph-name').textContent = sp.name; $('ph-name').style.color = sp.color; $('ph-text').textContent = text; el.classList.add('show');
  },
  missionTitle(t) { const el = $('mtitle'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); },
  objective(t) { this.obj = t; },
  timer(t) { const el = $('m-timer'); if (t === null || t === undefined) { el.hidden = true; return; } el.hidden = false; el.textContent = `${Math.floor(t / 60)}:${String(Math.max(0, Math.floor(t % 60))).padStart(2, '0')}`; el.classList.toggle('low', t < 10); },
  missionPassed(title, r) { this.big('任务完成！', [r.money ? `¥ +${r.money.toLocaleString('en-US')}` : '', r.xp ? `经验 +${r.xp}` : ''].filter(Boolean).join('  ·  '), 'passed', 3.4); },
  missionFailed(reason) { this.big('任务砸了！', reason, 'failed', 3); },
  boss(name, ratio, sub) {
    const el = $('bossbar');
    if (!name) { el.hidden = true; return; }
    el.hidden = false; $('boss-name').textContent = name; $('boss-fill').style.width = (clamp(ratio, 0, 1) * 100).toFixed(1) + '%'; $('boss-sub').textContent = sub || '';
  },
  card(on) { $('card').classList.toggle('show', on); },
  confirm(text, yes, o = {}) {
    $('confirm-text').textContent = text; $('confirm').hidden = false;
    $('confirm-yes').textContent = o.yes || '确定'; $('confirm-no').textContent = o.no || '取消';
    $('confirm-yes').onclick = () => { $('confirm').hidden = true; yes(); };
    $('confirm-no').onclick = () => { $('confirm').hidden = true; if (o.no && o.onNo) o.onNo(); };
  },
  gym(on, kind, n, t) {
    const el = $('gym'); el.hidden = !on; if (!on) return;
    $('gym-t').textContent = kind === 'stamina' ? '跑步机 · 练耐力' : '卧推 · 练肌肉';
    $('gym-k').textContent = IS_TOUCH ? '快速连点屏幕' : kind === 'stamina' ? '交替按 A / D' : '交替按 J / K';
    $('gym-n').textContent = n; $('gym-fill').style.width = clamp((8 - t) / 8 * 100, 0, 100) + '%';
  },
  credits(done) {
    const el = $('credits'), roll = $('cr-roll');
    const lines = [['GRAND TOKEN AUTO', '四九城 · 侠影之谜'], ['主演', 'Token 侠'], ['反派', 'Klaude（本色出演）'], ['友情客串', 'Kodex'], ['管家', '阿福 · 25 号机（4×RTZ 5090）'],
      ['法务部唯一的明白人', '老戈'], ['发小儿', '瑞秋'], ['幻觉供应商', '幻觉博士'], ['相声', '甄逗 · 贾捧'], ['群众演员', '百模帮全体成员 · 胡同儿里的大爷大妈'], ['特别鸣谢', '所有被 rm -rf 过的同事'], ['下集预告', '《Token 骑士》']];
    roll.innerHTML = lines.map(([a, b]) => `<p><small>${esc(a)}</small>${esc(b)}</p>`).join('');
    el.hidden = false; roll.style.animation = 'none'; void roll.offsetWidth; roll.style.animation = 'roll 16s linear forwards';
    Sfx.mood('cut');
    const end = () => { el.hidden = true; el.onclick = null; if (done) done(); };
    el.onclick = end; clearTimeout(this._crT); this._crT = setTimeout(end, 16500);
  },
  showEnd() {
    const s = G.stats, mm = Math.floor(G.time / 60), ss = Math.floor(G.time % 60);
    const rows = [
      ['用时', `${mm}:${String(ss).padStart(2, '0')}`], ['等级', `Lv.${RPG.level}`], ['吃掉 Token', fmtTok(s.tokens)], ['烧掉 Token', fmtTok(s.burned)],
      ['折合 API 账单', '¥' + ((s.burned / 1e6) * 16).toFixed(2)], ['出拳 / 飞踢', `${s.punches} / ${s.kicks}`], ['拆掉的百模帮', `${W.hqs.filter((h) => h.dead).length} / ${W.hqs.length}`],
      ['撞飞炸毁汽车', s.cars], ['偷车', s.stolen], ['收到律师函', s.letters], ['击退敌人', s.minions], ['花掉的钱', fmtMoney(s.spent)], ['估值', fmtMoney(G.money)],
    ];
    const box = $('e-stats'); box.innerHTML = '';
    for (const [k, v] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; box.append(dt, dd); }
    $('end').hidden = false; G.paused = true; Sfx.passed();
  },
  // ---- panels ----
  openPanel(tab, atHome = false) {
    if (Cutscene.active) return;
    this.panelOpen = true; this.panelHome = atHome; this.panelTab = tab || this.panelTab; Input.lock = true;
    $('panel').hidden = false; this.renderPanel();
  },
  closePanel() { this.panelOpen = false; $('panel').hidden = true; Input.lock = Cutscene.active || !!Gym.active; },
  renderPanel() {
    for (const b of document.querySelectorAll('#panel .tabs button')) b.classList.toggle('on', b.dataset.tab === this.panelTab);
    const body = $('panel-body'), R = RPG, m = R.m;
    if (this.panelTab === 'stats') {
      const bar = (k, n, c) => `<div class="stat"><span>${k}</span><i><s style="width:${(n / 10).toFixed(1)}%;background:${c}"></s></i><em>${Math.round(n)}</em></div>`;
      const owned = [...SHOPS.electronics.items, ...SHOPS.lab.items].filter((i) => !i.paint && R.count(i.id) > 0).map((i) => i.name + (R.count(i.id) > 1 ? ' ×' + R.count(i.id) : ''));
      body.innerHTML = `
        <div class="p-grid">
          <section><h4>Lv.${R.level} <small>${R.xp} / ${R.xpNext(R.level)} 经验 · 技能点 ${R.sp}</small></h4>
            <div class="xpbar"><s style="width:${(R.xp / R.xpNext(R.level) * 100).toFixed(1)}%"></s></div>
            ${bar('耐力', R.stats.stamina, '#22c55e')}${bar('肌肉', R.stats.muscle, '#ef4444')}${bar('车技', R.stats.driving, '#3b82f6')}
            <p class="note">耐力靠冲刺和跑步机，肌肉靠卧推和蛋白粉，车技靠高速驾驶。</p></section>
          <section><h4>当前加成</h4><dl class="kv">
            <dt>血量上限</dt><dd>${m.maxHp}</dd><dt>装甲上限</dt><dd>${m.maxArmor}</dd><dt>上下文上限</dt><dd>${fmtTok(m.capacity)}</dd>
            <dt>变身消耗</dt><dd>×${m.drain.toFixed(2)}</dd><dt>人形近战</dt><dd>×${m.humanMelee.toFixed(2)}</dd><dt>机器人近战</dt><dd>×${m.robotMelee.toFixed(2)}</dd>
            <dt>光束伤害</dt><dd>×${m.beamDmg.toFixed(2)}</dd><dt>专精</dt><dd>${R.spec ? SPECS.find((s) => s.id === R.spec).name : (R.level >= 5 ? '未选择' : '5 级解锁')}</dd>
            <dt>爆金币</dt><dd>×${m.coinRate.toFixed(2)} · 元宝 ${(m.ingot * 100).toFixed(0)}%</dd><dt>移动 / 冲刺</dt><dd>×${m.speed.toFixed(2)} / ×${m.sprint.toFixed(2)}</dd>
            <dt>战甲改装</dt><dd>${owned.length ? esc(owned.join('、')) : '无'}</dd><dt>涂装 / 服装</dt><dd>${PAINTS[R.paint].name} / ${OUTFITS[R.outfit].name}</dd></dl></section>
          <section><h4>身上的行头 <small>在王府衣柜里换</small></h4><dl class="kv">${Object.keys(SLOTS).map((sl) => `<dt>${SLOTS[sl]}</dt><dd>${R.equip[sl] ? esc(EQUIP[R.equip[sl]].name) + ' <small>' + esc(EQUIP[R.equip[sl]].desc.split('：').pop()) + '</small>' : '<span style="opacity:.5">空着</span>'}</dd>`).join('')}</dl></section>
        </div>`;
    } else if (this.panelTab === 'skills') {
      let html = `<p class="note">技能点：<b class="pts">${R.sp}</b>　每升一级 +1。二阶技能需要该系先投 2 点，三阶需要 5 点。${this.panelHome ? `<button class="mini" id="respec">洗点（¥100,000）</button>` : ''}</p><div class="tree">`;
      BRANCHES.forEach((B, bi) => {
        html += `<div class="branch" style="--c:${B.color}"><h4>${B.name}<small>${R.branchPts(bi)} 点</small></h4>`;
        for (const S of SKILLS.filter((s) => s.br === bi)) {
          const r = R.rank(S.id), why = R.canLearn(S.id), dots = Array.from({ length: S.max }, (_, k) => `<i class="${k < r ? 'on' : ''}"></i>`).join('');
          html += `<div class="node t${S.tier} ${r ? 'got' : ''}"><div class="nh"><b>${S.name}</b><span class="dots">${dots}</span></div><p>${esc(S.desc(Math.max(1, r)))}</p>
            <button data-skill="${S.id}" ${why ? 'disabled' : ''}>${why || (r ? '升级' : '学习')}</button></div>`;
        }
        html += '</div>';
      });
      body.innerHTML = html + '</div>';
      body.querySelectorAll('[data-skill]').forEach((b) => b.addEventListener('click', () => { if (RPG.learn(b.dataset.skill)) this.renderPanel(); }));
      const rs = $('respec'); if (rs) rs.addEventListener('click', () => { if (G.money < 100000) { this.toast('钱不够洗点', 2); return; } G.money -= 100000; RPG.respec(); this.renderPanel(); Sfx.buy(); });
    } else if (this.panelTab === 'spec') {
      let html = `<p class="note">${R.level < 5 ? `5 级解锁专精（现在 Lv.${R.level}）。` : R.spec ? '已选专精。在王府作战室的电脑上可以花钱换专精。' : '选一个专精：它决定你的被动加成和 R 键大招。'}</p><div class="specs">`;
      for (const S of SPECS) {
        const on = R.spec === S.id, can = R.level >= 5 && (!R.spec || this.panelHome) && !on;
        html += `<div class="spec ${on ? 'on' : ''}" style="--c:${S.color}"><h4>${S.name}</h4><p><b>被动</b>${esc(S.passive)}</p><p><b>大招 · ${S.ult}</b>${esc(S.ultDesc)}</p>
          <button data-spec="${S.id}" ${can ? '' : 'disabled'}>${on ? '已选择' : R.spec && this.panelHome ? '换成这个（¥200,000）' : '选择'}</button></div>`;
      }
      body.innerHTML = html + '</div>';
      body.querySelectorAll('[data-spec]').forEach((b) => b.addEventListener('click', () => {
        if (R.spec) { if (G.money < 200000) { this.toast('钱不够', 2); return; } G.money -= 200000; }
        RPG.chooseSpec(b.dataset.spec); this.renderPanel(); this.toast('专精已选择：' + SPECS.find((s) => s.id === b.dataset.spec).name, 2.4);
      }));
    } else if (this.panelTab === 'map') {
      body.innerHTML = '<canvas id="bigmap"></canvas><p class="note">圆圈字是能进的铺子（府 = 王府存档），字母是任务，彩色街区是百模帮的地盘，拆了总部就变绿。黄框是二环，虚线是上下文轻轨。</p>';
      const c = $('bigmap'), dpr = Math.min(2, window.devicePixelRatio || 1), sz = Math.min(body.clientWidth - 4, 560);
      c.style.width = c.style.height = sz + 'px'; c.width = c.height = Math.round(sz * dpr);
      this.drawMap(c.getContext('2d'), c.width, dpr, true);
    } else if (this.panelTab === 'story') {
      const recap = { m0: '显存看守所里，杜卡德找上了您。', m1: '西山道场，杜卡德教您吃 Token、变身。', m2: '您不肯 rm -rf，道场一把火烧了，您还把杜卡德背了出来。', m3: '回到 Token 王府，25 号机还给您开着。', m4: 'Kodex 给了您卡车模块：“有黑色款吗？”绕二环跑了一圈儿。', m5: '杜卡德远程支招儿，您在望京拳打了 Kwen 办公。', m6: '大钟寺，脚踢逗包办公。', m7: '国贸横扫起查查，老戈找上了您。', m8: '安定门外的阿卡姆：死在道场的，不过是个 prompt。', m9: '生日宴上杜卡德亮了底牌——他就是 Klaude。', m10: 'Kodex 给了您一批 Token。', m11: '二环上下文轻轨上的最终决战，天亮在景山。' };
      body.innerHTML = '<ol class="log">' + MISSIONS.map((mm, i) => {
        const d = Story.done[mm.id], cur = Story.cur && Story.cur.def === mm, next = !d && i === Story.prog;
        return `<li class="${d ? 'done' : cur || next ? 'cur' : 'todo'}"><b>${esc(mm.title)}</b><span>${d ? esc(recap[mm.id] || '') : cur ? '进行中：' + esc(this.obj || '') : next ? '下一个任务：去雷达上的 ' + GIVERS[mm.giver].letter + ' 标记' : '？？？'}</span></li>`;
      }).join('') + `</ol><p class="note">支线：拆掉剩下的百模帮总部（${W.hqs.filter((h) => h.dead).length} / ${W.hqs.length}）。</p>`;
    }
  },
  // ---- face picker: drag to move, wheel / slider to zoom, slider to straighten; eyes on the two circles ----
  openFacePicker() {
    if (!this.fp) this.fp = this.initFacePicker();
    this.fpLock = Input.lock; Input.lock = true;
    $('facepick').hidden = false; $('fp-reset').disabled = !HeroFace.custom;
    this.fp.draw();
  },
  closeFacePicker() { $('facepick').hidden = true; Input.lock = this.fpLock || false; },
  initFacePicker() {
    const cv = $('fp-canvas'), g = cv.getContext('2d'), K = cv.width / 300, E = FACE_EYES_CENTRED;
    const st = { img: null, x: 150, y: 182, fit: 1, s: 1, r: 0 };
    const paint = (ctx) => { ctx.save(); ctx.translate(st.x, st.y); ctx.rotate(st.r); ctx.scale(st.s, st.s); ctx.drawImage(st.img, -st.img.width / 2, -st.img.height / 2); ctx.restore(); };
    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0b0d11'; g.fillRect(0, 0, cv.width, cv.height);
      g.setTransform(K, 0, 0, K, 0, 0);
      if (st.img) paint(g);
      g.fillStyle = 'rgba(8,10,14,.66)'; g.beginPath(); g.rect(0, 0, 300, 364); g.ellipse(150, 182, 150, 182, 0, 0, TAU, true); g.fill('evenodd');
      g.lineWidth = 2; g.strokeStyle = '#ffc940'; g.beginPath(); g.ellipse(150, 182, 149, 181, 0, 0, TAU); g.stroke();
      g.strokeStyle = '#38e1ff';
      for (const [ex, ey] of E) { g.beginPath(); g.arc(ex, ey, 14, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(ex - 5, ey); g.lineTo(ex + 5, ey); g.moveTo(ex, ey - 5); g.lineTo(ex, ey + 5); g.stroke(); }
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(56,225,255,.45)'; g.beginPath(); g.moveTo(150, 40); g.lineTo(150, 330); g.stroke(); g.setLineDash([]);
      g.fillStyle = 'rgba(56,225,255,.95)'; g.font = `800 12px ${FONT_CN}`; g.textAlign = 'center'; g.fillText('两只眼睛放圈里', 150, E[0][1] + 34);
    };
    const setZoom = (v) => { st.s = clamp(v, st.fit * 0.2, st.fit * 6); $('fp-zoom').value = String(Math.round((st.s / st.fit) * 100)); draw(); };
    const pick = (file) => {
      if (!file) return;
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        // big phone pictures: work on a copy no larger than 1600 px
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = mkCanvas(Math.max(1, Math.round(im.naturalWidth * k)), Math.max(1, Math.round(im.naturalHeight * k)));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        st.img = c; st.fit = Math.max(300 / c.width, 364 / c.height); st.s = st.fit; st.x = 150; st.y = 182; st.r = 0;
        $('fp-zoom').value = '100'; $('fp-rot').value = '0'; $('fp-ok').disabled = false; $('fp-empty').hidden = true; draw();
      };
      im.onerror = () => { URL.revokeObjectURL(url); this.toast('这张图片打不开，换一张试试（手机的 HEIC 格式先转成 JPG）', 3); };
      im.src = url;
    };
    $('fp-input').addEventListener('change', (e) => { pick(e.target.files && e.target.files[0]); e.target.value = ''; });
    $('fp-pick').addEventListener('click', () => $('fp-input').click());
    let drag = null;
    const at = (e) => { const b = cv.getBoundingClientRect(); return [((e.clientX - b.left) / b.width) * 300, ((e.clientY - b.top) / b.height) * 364]; };
    cv.addEventListener('pointerdown', (e) => { if (!st.img) { $('fp-input').click(); return; } drag = { id: e.pointerId, p: at(e), x: st.x, y: st.y }; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already released */ } cv.classList.add('drag'); });
    cv.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const p = at(e); st.x = drag.x + p[0] - drag.p[0]; st.y = drag.y + p[1] - drag.p[1]; draw(); });
    const end = (e) => { if (drag && e.pointerId === drag.id) { drag = null; cv.classList.remove('drag'); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { if (!st.img) return; e.preventDefault(); setZoom(st.s * (e.deltaY < 0 ? 1.06 : 1 / 1.06)); }, { passive: false });
    cv.addEventListener('dragover', (e) => e.preventDefault());
    cv.addEventListener('drop', (e) => { e.preventDefault(); pick(e.dataTransfer && e.dataTransfer.files[0]); });
    $('fp-zoom').addEventListener('input', (e) => { if (st.img) setZoom(st.fit * (+e.target.value / 100)); });
    $('fp-rot').addEventListener('input', (e) => { st.r = (+e.target.value * Math.PI) / 180; draw(); });
    $('fp-ok').addEventListener('click', async () => {
      if (!st.img) return;
      const out = mkCanvas(300, 364), o = out.getContext('2d');
      o.save(); o.beginPath(); o.ellipse(150, 182, 150, 182, 0, 0, TAU); o.clip(); paint(o); o.restore();
      let url = out.toDataURL('image/webp', 0.9); if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/png');
      const saved = await HeroFace.set(url);
      this.closeFacePicker(); Sfx.buy();
      this.toast(saved ? '主角头像换好了（只存在这个浏览器里）' : '头像换好了，但浏览器存不下，刷新后会恢复默认', 3);
    });
    $('fp-reset').addEventListener('click', async () => { await HeroFace.reset(); this.closeFacePicker(); this.toast('已恢复默认头像', 2); });
    $('fp-close').addEventListener('click', () => this.closeFacePicker());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('facepick').hidden) { delete Input.hit.Escape; this.closeFacePicker(); } });
    return { draw };
  },
  // ---- shops ----
  openShop(id) {
    this.shopId = id; Input.lock = true; $('shop').hidden = false;
    const S = SHOPS[id];
    $('shop-title').textContent = S.title; $('shop-greet').textContent = S.greet;
    this.renderShop();
  },
  openWardrobe() { this.shopId = 'wardrobe'; Input.lock = true; $('shop').hidden = false; $('shop-title').textContent = '衣柜'; $('shop-greet').textContent = '买过的行头都在这儿：衣服、帽子眼镜、手里的家伙什儿、战甲涂装，想怎么搭就怎么搭。'; this.renderShop(); },
  closeShop() { this.shopId = null; $('shop').hidden = true; Input.lock = Cutscene.active || !!Gym.active; },
  renderShop() {
    if (!this.shopId) return; // a purchase can close the shop (e.g. a 相声 ticket starts the show)
    const R = RPG, list = $('shop-list');
    $('shop-money').textContent = fmtMoney(G.money);
    let items;
    if (this.shopId === 'wardrobe') {
      // everything you own, grouped the way it sits on you
      items = [{ sec: '衣服' }, ...SHOPS.clothes.items.filter((i) => R.outfits[i.outfit])];
      for (const slot in SLOTS) {
        const got = Object.keys(EQUIP).filter((id) => EQUIP[id].slot === slot && R.owns(id)).map((id) => eq(id));
        if (got.length) items.push({ sec: SLOTS[slot] }, ...got);
      }
      const paints = SHOPS.lab.items.filter((i) => i.paint && R.paints[i.paint]);
      if (paints.length) items.push({ sec: '战甲涂装' }, ...paints);
      if (!Object.keys(EQUIP).some((id) => R.owns(id))) items.push({ sec: '还没买过装备：王府井、琉璃厂、大栅栏、老王五金、中关村都有卖的' });
    } else items = SHOPS[this.shopId].items;
    const wearVerb = { head: '戴上', face: '戴上', neck: '戴上', back: '背上', hand: '拿上', wrist: '戴上', feet: '换上' };
    list.innerHTML = items.map((it, k) => {
      if (it.sec) return `<li class="sec">${esc(it.sec)}</li>`;
      let state = '', btn = `¥${it.price.toLocaleString('en-US')}`, dis = false, cls = '', bcls = '';
      if (it.equip) {
        const on = R.equip[it.slot] === it.id;
        state = '部位：' + SLOTS[it.slot];
        if (R.owns(it.id)) { btn = on ? '卸下' : wearVerb[it.slot]; bcls = on ? 'off' : ''; state += on ? ' · 穿戴中' : ' · 已拥有'; if (on) cls = 'on'; }
        else if (R.equip[it.slot]) state += ' · 会替换「' + EQUIP[R.equip[it.slot]].name + '」';
      } else if (it.paint) { if (R.paints[it.paint]) { btn = R.paint === it.paint ? '使用中' : '喷涂'; dis = R.paint === it.paint; if (dis) cls = 'on'; } }
      else if (it.outfit) { if (R.outfits[it.outfit]) { btn = R.outfit === it.outfit ? '穿着中' : '穿上'; dis = R.outfit === it.outfit; if (dis) cls = 'on'; } }
      else if (it.max && R.count(it.id) >= it.max) { btn = '已买满'; dis = true; }
      if (it.max > 1) state = `已有 ${R.count(it.id)} / ${it.max}`;
      if (!dis && btn.startsWith('¥') && G.money < it.price) state = (state ? state + ' · ' : '') + '钱不够';
      return `<li class="${cls}"><div><b>${esc(it.name)}</b><p>${esc(it.desc)}</p>${state ? `<small>${state}</small>` : ''}</div><button class="${bcls}" data-i="${k}" ${dis ? 'disabled' : ''}>${btn}</button></li>`;
    }).join('');
    list.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const it = items[+b.dataset.i], r = RPG.buy(it);
      if (r && r !== 'equip') { this.toast(r, 1.8); Sfx.denied(); }
      else if (r === 'equip') { const off = it.equip && RPG.equip[it.slot] !== it.id; this.toast((off ? '卸下了：' : '换上了：') + it.name, 1.6); Sfx.click(); }
      else this.toast(it.equip ? `买了「${it.name}」，已经${wearVerb[it.slot]}` : '买了：' + it.name, 1.8);
      this.renderShop();
    }));
  },
  // ---- per-frame ----
  set(key, el, prop, val) { if (this.last[key] !== val) { this.last[key] = val; el[prop] = val; } },
  update(rdt) {
    const P = Player;
    Floaters.update(rdt); Bubble.update(rdt);
    const tick = (k, id, cls = 'show') => { if (this[k] > 0) { this[k] -= rdt; if (this[k] <= 0) { if (id === 'bigtext') $('bigtext').className = ''; else $(id).classList.remove(cls); } } };
    tick('bigT', 'bigtext'); tick('subT', 'subtitle'); tick('toastT', 'toast'); tick('newsT', 'news'); tick('radioT', 'radio'); tick('distT', 'district');
    tick('statT', 'statpop'); tick('lvT', 'lvup'); tick('carT', 'carname');
    this.hurtA = Math.max(0, this.hurtA - rdt * 1.6); this.set('vig', $('vignette').style, 'opacity', this.hurtA.toFixed(2));
    this.flashA = Math.max(0, this.flashA - rdt * 2.5); this.set('flash', $('flash').style, 'opacity', this.flashA.toFixed(2));
    this.healA = Math.max(0, this.healA - rdt * 1.5); this.set('heal', $('healov').style, 'opacity', this.healA.toFixed(2));
    // SA cluster
    const mech = P.isMech(), m = RPG.m;
    this.set('clock', $('sa-clock'), 'textContent', DayNight.timeText());
    this.set('hp', $('hp-fill').style, 'width', ((P.hp / m.maxHp) * 100).toFixed(1) + '%');
    this.set('armorOn', $('armor-row'), 'hidden', !mech);
    if (mech) this.set('armor', $('armor-fill').style, 'width', ((P.rhp / m.maxArmor) * 100).toFixed(1) + '%');
    this.set('tok', $('tok-fill').style, 'width', ((P.tokens / m.capacity) * 100).toFixed(1) + '%');
    this.set('tokMark', $('tok-mark').style, 'left', ((CAP / m.capacity) * 100).toFixed(1) + '%');
    this.set('tokTxt', $('tok-text'), 'textContent', `${fmtTok(P.tokens)} / ${fmtTok(m.capacity)}${Tokens.enabled ? '' : ' · 已被压缩'}`);
    this.set('tokFull', $('tokrow'), 'className', P.tokens >= CAP && !mech && Story.flags.transform ? 'bar tok full' : mech ? 'bar tok burn' : 'bar tok');
    this.set('xp', $('xp-fill').style, 'width', ((RPG.xp / RPG.xpNext(RPG.level)) * 100).toFixed(1) + '%');
    this.set('lv', $('sa-lv'), 'textContent', 'Lv.' + RPG.level + (RPG.sp ? ' +' + RPG.sp : ''));
    if (!this.portraitR) { const hc = mkCanvas(160, 160); hc.getContext('2d').drawImage(TEX.helmet.image, 0, 0, 160, 160); this.portraitR = hc.toDataURL(); this.last.portrait = null; }
    this.set('portrait', $('portrait'), 'src', mech ? this.portraitR : this.portraitH);
    this.set('stamOn', $('stam'), 'hidden', mech || P.mode !== 'human' || P.stamina > 99);
    this.set('stam', $('stam-fill').style, 'width', P.stamina.toFixed(0) + '%');
    this.moneyShown = Math.abs(G.money - this.moneyShown) < 50 ? G.money : lerp(this.moneyShown, G.money, Math.min(1, rdt * 6));
    this.set('money', $('money'), 'textContent', fmtMoneySA(this.moneyShown));
    const lvl = Math.floor(G.heat), cooling = G.heat > 0 && G.time - G.lastCrime > 12, blink = cooling && Math.floor(G.time * 4) % 2 === 0;
    const sk = lvl + (blink ? 'b' : '');
    if (this.last.stars !== sk) { this.last.stars = sk; this.stars.forEach((s, k) => { s.className = k < lvl ? (blink ? 'on dim' : 'on') : ''; }); }
    this.set('wantedLbl', $('wanted-lbl'), 'hidden', lvl < 1);
    this.set('starsVis', $('stars').style, 'visibility', lvl < 1 && !blink ? 'hidden' : 'visible'); // SA only shows stars while wanted
    const showUlt = !!RPG.spec;
    this.set('ultOn', $('ult'), 'hidden', !showUlt);
    if (showUlt) { this.set('ultW', $('ult-fill').style, 'width', RPG.ult.toFixed(0) + '%'); this.set('ultR', $('ult'), 'className', RPG.ult >= 100 ? 'ready' : ''); }
    // mission box
    const C = Story.cur, avail = Story.available()[0];
    const mt = C ? C.def.title : avail ? '新任务：' + avail.title : Story.flags.finished ? '自由模式' : !Tokens.enabled ? '去找 Kodex' : '';
    const mo = C ? (this.obj || '') : avail ? `上雷达上的「${GIVERS[avail.giver].letter}」那儿找${GIVERS[avail.giver].name}` : Story.flags.finished ? `拆掉剩下的百模帮总部（${W.hqs.filter((h) => h.dead).length} / ${W.hqs.length}）` : '';
    this.set('mt', $('m-title'), 'textContent', mt); this.set('mo', $('m-obj'), 'textContent', mo); this.set('mOn', $('mission'), 'hidden', !mt);
    // interaction prompt
    const na = Interiors.nearAct;
    const pr = na ? `${IS_TOUCH ? '点「交互」' : 'E'} · ${na.label}` : this.contextHint();
    this.set('prompt', $('prompt'), 'textContent', pr); this.set('promptOn', $('prompt'), 'hidden', !pr || Cutscene.active);
    // district
    if (!Interiors.cur && G.started && !Cutscene.active) { const [dn, de] = districtAt(P.pos.x, P.pos.z); if (dn !== this.lastDist) { this.lastDist = dn; this.district(dn, de); } }
    const tgt = Cutscene.active ? null : Story.target();
    Pillar.update(tgt); this.edge(tgt); this.hqbars();
    this.radarT -= rdt; if (this.radarT <= 0) { this.radarT = 1 / 30; this.drawRadar(tgt); }
    if (IS_TOUCH) this.touchLabels();
    if (this.panelOpen && kpRaw('Escape', 'Tab')) this.closePanel();
    else if (this.shopId && kpRaw('Escape')) this.closeShop();
  },
  contextHint() {
    const P = Player;
    if (Interiors.cur) return '';
    if (P.mode === 'human' && Cars.nearestDrivable(P.pos.x, P.pos.z, 4.8)) return `${IS_TOUCH ? '「上车」' : 'F'} 上车（抢车也行）`;
    if (P.mode === 'human' && P.tokens >= CAP && Story.flags.transform) return `${IS_TOUCH ? '「变身」' : 'T'} 变身！`;
    if (IS_TOUCH) return '';
    if (P.mode === 'robot') return 'J 连拳 · K 飞踢 · 空格 砸地 · F 抓车 · 按住 L 光束' + (Story.flags.truck ? ' · T 卡车' : '') + ' · Q 解除' + (RPG.spec ? ' · R 大招' : '');
    if (P.mode === 'truck') return 'W/S 油门 · A/D 转向 · 空格 手刹 · Shift 氮气 · T 机器人';
    if (P.mode === 'car') return 'F 下车 · 空格 手刹 · J 喇叭';
    return '';
  },
  edge(tgt) {
    const el = $('edge');
    if (!tgt || G.over) { this.set('edgeOn', el, 'hidden', true); return; }
    _proj.set(tgt.x, tgt.kind === 'hq' ? 10 : 1.5, tgt.z).project(camera);
    let x = _proj.x, y = _proj.y;
    if (_proj.z > 1) { x = -x; y = -y; }
    const on = Math.abs(x) < 0.9 && Math.abs(y) < 0.85 && _proj.z <= 1;
    if (on && tgt.kind === 'token') { this.set('edgeOn', el, 'hidden', true); return; }
    this.set('edgeOn', el, 'hidden', false);
    const W2 = innerWidth / 2, H2 = innerHeight / 2;
    let sx = x * W2, sy = -y * H2;
    if (!on) { const mx = W2 - 46, my = H2 - 60, k = Math.min(mx / Math.max(1e-3, Math.abs(sx)), my / Math.max(1e-3, Math.abs(sy))); sx *= k; sy *= k; } else sy -= 34;
    const ang = on ? Math.PI / 2 : Math.atan2(sy, sx);
    el.style.transform = `translate(${(W2 + sx).toFixed(0)}px,${(H2 + sy).toFixed(0)}px) translate(-50%,-50%) rotate(${ang.toFixed(3)}rad)`;
    el.classList.toggle('bob', on);
    el.style.setProperty('--c', tgt.color || (tgt.kind === 'hq' ? tgt.hq.c1 : tgt.kind === 'enemy' ? '#ef4444' : '#ffc940'));
  },
  hqbars() {
    const P = Player;
    for (const b of this.hqBars) {
      const h = b.h;
      const show = !Interiors.cur && !h.dead && (h.alerted || h.hp < h.maxHp) && dist2(h.cx, h.cz, P.pos.x, P.pos.z) < 140 * 140;
      if (!show) { if (!b.d.hidden) b.d.hidden = true; continue; }
      const s = worldToScreen(h.cx, 7 + h.H + 13, h.cz + 4);
      if (!s || !s.on) { if (!b.d.hidden) b.d.hidden = true; continue; }
      b.d.hidden = false;
      b.d.style.transform = `translate(${s.x.toFixed(0)}px,${s.y.toFixed(0)}px) translate(-50%,-100%)`;
      b.fill.style.width = ((h.hp / h.maxHp) * 100).toFixed(1) + '%';
    }
  },
  // a painted Beijing map, drawn once: hutong grey, modern blocks, the palace, lakes, parks, 二环 and 长安街
  buildBaseMap() {
    const E = BOUND + 60, N = 1400, c = mkCanvas(N, N), g = c.getContext('2d'), k = N / (2 * E);
    const X = (x) => (x + E) * k, Y = (z) => (z + E) * k, rect = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(X(x0), Y(z0), (x1 - x0) * k, (z1 - z0) * k); };
    const ell = (x, z, rx, rz, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(X(x), Y(z), rx * k, rz * k, 0, 0, TAU); g.fill(); };
    g.fillStyle = '#5b7450'; g.fillRect(0, 0, N, N);
    rect(-CITY, -CITY, CITY, CITY, '#a3a6ab');
    const COL = { outer: '#6b717b', modern: '#646b76', tall: '#5b626d', xizhan: '#7d7368', bjstation: '#7d7368', tower: '#555c67', sanlitun: '#6a6f7e', '798': '#7b5e4b', hq: '#646b76',
      park: '#56864a', lakepark: '#56864a', forest: '#44723d', dojo: '#44723d', wheelpark: '#56864a', arkham: '#465233', yonghegong: '#b58d34', guijie: '#8a5a4a', lab: '#4b6a63', gym: '#6b717b', garage: '#5f6b6b' };
    for (const b of W.blocks) {
      if (b.m) continue;
      const r = b.rect, old = inOldCity(b.i, b.j), col = COL[b.type] || (old ? '#8f8476' : '#6b717b');
      rect(r.x0, r.z0, r.x1, r.z1, col);
      if (old && !COL[b.type]) { // hutong lanes + courtyards
        g.strokeStyle = 'rgba(214,204,188,.55)'; g.lineWidth = Math.max(1, 1.1 * k);
        for (let q = 1; q < 4; q++) { const z = r.z0 + (q * BLK) / 4; g.beginPath(); g.moveTo(X(r.x0 + 1), Y(z)); g.lineTo(X(r.x1 - 1), Y(z)); g.stroke(); }
        g.fillStyle = 'rgba(60,52,44,.35)'; for (let q = 0; q < 4; q++) for (let w = 0; w < 4; w++) g.fillRect(X(r.x0 + 2 + w * 10.5), Y(r.z0 + 2 + q * 11), 3.5 * k, 3 * k);
      }
      if (b.type === 'yonghegong') { for (let q = 0; q < 4; q++) rect((r.x0 + r.x1) / 2 - 7, r.z0 + 6 + q * 9, (r.x0 + r.x1) / 2 + 7, r.z0 + 11 + q * 9, '#d6a93c'); }
    }
    for (const m of W.merged) {
      const { x0, x1, z0, z1 } = m, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (m.type === 'palace') {
        rect(x0, z0, x1, z1, '#4d8fbf'); rect(x0 + 4, z0 + 4, x1 - 4, z1 - 4, '#a8342b'); rect(x0 + 6, z0 + 6, x1 - 6, z1 - 6, '#d9c08a');
        for (const [w, d, zz] of [[30, 10, 0.28], [16, 8, 0.4], [22, 9, 0.5], [34, 12, 0.66], [14, 7, 0.78], [10, 6, 0.9]]) rect(cx - w / 2, z0 + (z1 - z0) * zz - d / 2, cx + w / 2, z0 + (z1 - z0) * zz + d / 2, '#e1a82b');
        for (const sx of [-1, 1]) for (let q = 0; q < 5; q++) rect(cx + sx * 30 - 6, z0 + 16 + q * 16, cx + sx * 30 + 6, z0 + 24 + q * 16, '#c9962e');
      } else if (m.type === 'jingshan') { rect(x0, z0, x1, z1, '#6c8f58'); ell(cx, cz, (x1 - x0) * 0.33, (z1 - z0) * 0.3, '#4f7a42'); ell(cx, cz, 3.5, 3.5, '#e1a82b'); }
      else if (m.type === 'tiantan') {
        rect(x0, z0, x1, z1, '#4a7a40'); g.strokeStyle = '#a8342b'; g.lineWidth = 2 * k; g.strokeRect(X(x0 + 3), Y(z0 + 3), (x1 - x0 - 6) * k, (z1 - z0 - 6) * k);
        const L = W.landmarks.tiantan; rect(cx - 2.5, z0 + 12, cx + 2.5, z1 - 12, '#cfc6b4');
        ell(cx, z0 + 22, 11, 11, '#e9e2d0'); ell(cx, z0 + 22, 6, 6, '#2c4f9e'); ell(cx, z1 - 24, 12, 12, '#e9e2d0'); ell(cx, z1 - 24, 3, 3, '#cfc6b4'); if (L) ell(L.x, L.z, 5, 5, '#2c4f9e');
      } else if (m.type === 'qianmen') { rect(x0, z0, x1, z1, '#c4bdb0'); rect(cx - 17, z1 - 11, cx + 17, z1 - 3, '#7a7068'); ell(cx, z0 + 14, 4.5, 4.5, '#8d8272'); }
      else if (m.type === 'gulou') { rect(x0, z0, x1, z1, '#aaa092'); rect(cx - 9, cz - 12, cx + 9, cz - 1, '#a8342b'); rect(cx - 7, cz + 3, cx + 7, cz + 14, '#6b6760'); }
      else if (m.type === 'olympic') { rect(x0, z0, x1, z1, '#9aa3ad'); rect(x0 + 10, cz - 12, x0 + 34, cz + 12, '#6fb6e6'); ell(x1 - 24, cz, 17, 14, '#8a8f98'); ell(x1 - 24, cz, 12, 9, '#b0463c'); }
      else if (m.type === 'yongdingmen') { rect(x0, z0, x1, z1, '#aaa399'); rect(cx - 14, cz - 5, cx + 14, cz + 5, '#7a7068'); }
      else if (m.type === 'houhai') rect(x0, z0, x1, z1, '#978b7c');
      else if (m.type === 'beihai') rect(x0, z0, x1, z1, '#5e8a50');
      else rect(x0, z0, x1, z1, '#8f8476');
    }
    for (const w of W.water) { if (w.ellipse) ell(w.x, w.z, w.rx, w.rz, '#3f86b8'); else rect(w.x0, w.z0, w.x1, w.z1, '#3f86b8'); }
    for (const d of W.dry) { if (d.ellipse) ell(d.x, d.z, d.rx, d.rz, '#6d9460'); else rect(d.x0, d.z0, d.x1, d.z1, '#c9c1b3'); }
    if (W.landmarks.beihai) ell(W.landmarks.beihai.x, W.landmarks.beihai.z, 2.6, 2.6, '#f4f1ea');
    // 长安街 and the 二环
    g.strokeStyle = '#e8e3d6'; g.lineWidth = RW * 1.15 * k; g.beginPath(); g.moveTo(X(-CITY), Y(0)); g.lineTo(X(CITY), Y(0)); g.stroke();
    const A = roadC(RING_LO), B = roadC(RING_HI);
    g.strokeStyle = '#f2d27a'; g.lineWidth = RW * 1.1 * k; g.strokeRect(X(A), Y(A), (B - A) * k, (B - A) * k);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = Math.max(1, 0.8 * k); g.strokeRect(X(A), Y(A), (B - A) * k, (B - A) * k);
    this.baseMap = c; this.baseE = E;
  },
  drawMap(g, S, dpr, full) {
    const P = Player, R = S / 2;
    if (!this.baseMap) this.buildBaseMap();
    const range = full ? BOUND + 12 : P.mode === 'car' || P.mode === 'truck' ? 170 : 125;
    const k = (R - 3 * dpr) / range, px = full ? 0 : P.pos.x, pz = full ? 0 : P.pos.z;
    const X = (x) => R + (x - px) * k, Y = (z) => R + (z - pz) * k;
    g.save(); g.clearRect(0, 0, S, S);
    if (!full) { g.beginPath(); g.arc(R, R, R - 3 * dpr, 0, TAU); g.clip(); }
    g.fillStyle = '#5b7450'; g.fillRect(0, 0, S, S);
    const E = this.baseE; g.imageSmoothingEnabled = true; g.drawImage(this.baseMap, X(-E), Y(-E), 2 * E * k, 2 * E * k);
    // 百模帮 turf and their HQs
    for (const h of W.hqs) {
      const b = h.blk, r = b.rect, x0 = X(r.x0), y0 = Y(r.z0), w = BLK * k;
      if (x0 > S + 3 * w || y0 > S + 3 * w || x0 + 2 * w < -w || y0 + 2 * w < -w) continue;
      if (!h.dead) { g.fillStyle = h.c1 + '40'; g.fillRect(X(r.x0 - PITCH), Y(r.z0 - PITCH), (BLK + 2 * PITCH) * k, (BLK + 2 * PITCH) * k); }
      g.fillStyle = h.dead ? '#2f7d4a' : h.c1; g.fillRect(x0, y0, w, w);
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(w * 0.42)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.dead ? '✓' : h.short.slice(0, 1), x0 + w / 2, y0 + w / 2 + 1);
    }
    // shops & places you can walk into
    const ICON = { home: ['府', '#d7263d'], snack: ['吃', '#ea580c'], electronics: ['卡', '#0891b2'], clothes: ['衣', '#b4402f'], dept: ['百', '#a16207'], antique: ['古', '#7c2d12'], shoes: ['鞋', '#92400e'],
      pharmacy: ['药', '#15803d'], duck: ['鸭', '#b91c1c'], teahouse: ['茶', '#0f766e'], hardware: ['砖', '#57534e'], gym: ['健', '#c2410c'], lab: ['X', '#10b981'], dojo: ['道', '#7c2d12'], arkham: ['阿', '#4d7c0f'] };
    const dot = (x, y, ic, rr) => { g.fillStyle = ic[1]; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.lineWidth = 1.5 * dpr; g.strokeStyle = '#fff'; g.stroke(); g.fillStyle = '#fff'; g.font = `900 ${Math.round(rr * 1.25)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ic[0], x, y + 1); };
    const rr = Math.max(5 * dpr, (full ? 7 : 6) * dpr);
    for (const d of W.doors) {
      const ic = ICON[d.interior]; if (!ic || d.locked || (d.interior === 'dojo' && Story.flags.dojoBurnt)) continue;
      const x = X(d.x), y = Y(d.z - 4); if (x < -10 || y < -10 || x > S + 10 || y > S + 10) continue; dot(x, y, ic, rr);
    }
    if (W.garage) dot(X(W.garage.x), Y(W.garage.z - 4), ['喷', '#0f766e'], rr);
    if (W.towerPos) dot(X(W.towerPos.x), Y(W.towerPos.z), ['塔', '#b8860b'], rr);
    if (full) {
      // place names, like a tourist map
      const lab = (t, x, z, sz = 11, col = '#fff') => { g.font = `900 ${Math.round(sz * dpr)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(t, X(x), Y(z)); g.fillStyle = col; g.fillText(t, X(x), Y(z)); };
      const NAMES = { palace: '故宫', jingshan: '景山', gulou: '钟鼓楼', qianmen: '天安门广场 · 前门', tiantan: '天坛', houhai: '什刹海', beihai: '北海', olympic: '奥林匹克公园', yongdingmen: '永定门' };
      for (const m of W.merged) lab(NAMES[m.type] || '', (m.x0 + m.x1) / 2, m.type === 'qianmen' ? m.z0 + 26 : m.type === 'palace' ? (m.z0 + m.z1) / 2 + 30 : (m.z0 + m.z1) / 2, m.type === 'palace' ? 14 : 11, m.type === 'palace' ? '#ffe9a8' : '#fff');
      const SP = { yonghegong: '雍和宫', guijie: '簋街', bjstation: '北京站', '798': '798', sanlitun: '三里屯', tower: '国贸', electronics: '中关村', xizhan: '北京西站', deshengmen: '德胜门', jiaolou: '东南角楼', wheelpark: '朝阳公园', dashilar: '大栅栏', antique: '琉璃厂', teahouse: '天桥', dept: '王府井', clothes: '西单', home: '恭王府' };
      for (const b of W.blocks) { const t = SP[b.type]; if (t) lab(t, (b.rect.x0 + b.rect.x1) / 2, b.rect.z1 - 6, 9.5, '#fde68a'); }
      lab('长 安 街', -150, -8, 10, '#fffbe8'); lab('二 环', roadC(RING_HI) + 18, roadC(RING_LO) + 40, 10, '#fde68a');
    }
    if (Monorail.pts.length) { g.strokeStyle = 'rgba(255,201,64,.7)'; g.lineWidth = 2 * dpr; g.setLineDash([5 * dpr, 4 * dpr]); g.beginPath(); Monorail.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath(); g.stroke(); g.setLineDash([]);
      const [tx, tz] = Monorail.carPos(1); g.fillStyle = Story.trainFight ? '#ff5a2a' : '#ffffff'; g.fillRect(X(tx) - 3 * dpr, Y(tz) - 3 * dpr, 6 * dpr, 6 * dpr); }
    if (!full) { g.fillStyle = '#ffc940'; for (const t of Tokens.items) { if (!t.alive) continue; const x = X(t.x), y = Y(t.z); if (x < 0 || y < 0 || x > S || y > S) continue; g.fillRect(x - 1.2 * dpr, y - 1.2 * dpr, 2.4 * dpr, 2.4 * dpr); } }
    g.fillStyle = '#ff4d5a'; for (const e of Enemies.list) { if (e.dead) continue; g.beginPath(); g.arc(X(e.pos.x), Y(e.pos.z), 2.6 * dpr, 0, TAU); g.fill(); }
    const blink = Math.floor(G.time * 6) % 2;
    for (const cc of Cars.list) { if (cc.state !== 'legal' || cc.removed) continue; g.fillStyle = blink ? '#ff3344' : '#3a7bff'; g.beginPath(); g.arc(X(cc.pos.x), Y(cc.pos.z), 3.4 * dpr, 0, TAU); g.fill(); }
    for (const m of Story.available()) { const w = m.where(), gv = GIVERS[m.giver]; let x = X(w.x), y = Y(w.z); if (!full) { const dx = x - R, dy = y - R, dl = hyp(dx, dy), lim = R - 10 * dpr; if (dl > lim) { x = R + dx / dl * lim; y = R + dy / dl * lim; } } g.fillStyle = gv.color; g.beginPath(); g.arc(x, y, 7 * dpr, 0, TAU); g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#111'; g.stroke(); g.fillStyle = '#fff'; g.font = `900 ${Math.round(9 * dpr)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gv.letter, x, y + 0.5); }
    const tgt = this.lastTgt;
    if (tgt && tgt.kind !== 'marker') {
      let x = X(tgt.x), y = Y(tgt.z);
      if (!full) { const dx = x - R, dy = y - R, dl = hyp(dx, dy), lim = R - 10 * dpr; if (dl > lim) { x = R + (dx / dl) * lim; y = R + (dy / dl) * lim; } }
      const pulse = 4 + Math.sin(G.time * 8) * 1.5;
      g.fillStyle = tgt.kind === 'hq' ? '#ffd23f' : tgt.kind === 'enemy' ? '#ff4d5a' : '#fff3b0'; g.strokeStyle = '#111'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(x, y, pulse * dpr, 0, TAU); g.fill(); g.stroke();
    } else if (tgt && tgt.kind === 'marker') {
      let x = X(tgt.x), y = Y(tgt.z);
      if (!full) { const dx = x - R, dy = y - R, dl = hyp(dx, dy), lim = R - 10 * dpr; if (dl > lim) { x = R + (dx / dl) * lim; y = R + (dy / dl) * lim; } }
      g.fillStyle = tgt.color || '#ffd23f'; g.strokeStyle = '#111'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(x, y - 6 * dpr); g.lineTo(x + 5 * dpr, y); g.lineTo(x, y + 6 * dpr); g.lineTo(x - 5 * dpr, y); g.closePath(); g.fill(); g.stroke();
    }
    const ppx = full ? X(Interiors.cur && Interiors.back ? Interiors.back.x : P.pos.x) : R, ppy = full ? Y(Interiors.cur && Interiors.back ? Interiors.back.z : P.pos.z) : R;
    g.translate(ppx, ppy); g.rotate(Math.PI - P.heading);
    g.beginPath(); g.moveTo(0, -8 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(0, 3.5 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2 * dpr; g.strokeStyle = '#111'; g.stroke();
    g.restore();
    if (!full) {
      g.beginPath(); g.arc(R, R, R - 3 * dpr, 0, TAU); g.lineWidth = 5 * dpr; g.strokeStyle = '#0d0f12'; g.stroke();
      g.fillStyle = '#fff'; g.font = `900 ${Math.round(11 * dpr)}px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', R, 11 * dpr);
    }
  },
  drawRadar(tgt) {
    this.lastTgt = tgt;
    if (Interiors.cur) { const g = this.rctx, S = this.radar.width; g.clearRect(0, 0, S, S); g.fillStyle = '#1b1f27'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 3, 0, TAU); g.fill(); g.fillStyle = '#cbd5e1'; g.font = `900 ${Math.round(S * 0.1)}px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('室内', S / 2, S / 2); return; }
    this.drawMap(this.rctx, this.radar.width, this.rdpr, false);
  },
  // ---- touch ----
  initTouch() {
    const zone = $('joyzone'), base = $('joy'), knob = $('joy-knob');
    let id = null, cx = 0, cy = 0; const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; cx = e.clientX; cy = e.clientY;
      base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
      Input.joy.on = true; Input.joy.x = 0; Input.joy.y = 0; zone.setPointerCapture(e.pointerId); e.preventDefault();
      if (Gym.active) Input.click = true;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const l = hyp(dx, dy);
      if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; Input.joy.x = dx / R; Input.joy.y = dy / R;
    });
    const end = (e) => { if (e.pointerId !== id) return; id = null; Input.joy.on = false; Input.joy.x = Input.joy.y = 0; base.classList.remove('on'); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    for (const b of document.querySelectorAll('#tbtns button')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => { Input.down[k] = true; Input.hit[k] = true; if (k === 'KeyF') Input.hit.KeyE = true; b.classList.add('press'); b.setPointerCapture(e.pointerId); e.preventDefault(); if (Gym.active) Input.click = true; });
      const up = () => { Input.down[k] = false; b.classList.remove('press'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
  },
  touchLabels() {
    const P = Player, m = P.mode === 'xform' || P.mode === 'dead' ? this.touchMode || 'human' : P.mode;
    const near = Interiors.nearAct ? 'A' : '', key = m + (P.tokens >= CAP ? 'F' : '') + near + (RPG.ult >= 100 ? 'U' : '');
    if (key === this.touchKey) return;
    this.touchKey = key; this.touchMode = m;
    const L = Object.assign({}, TOUCH_LABELS[m] || TOUCH_LABELS.human);
    if (Interiors.nearAct) L.KeyF = '交互';
    if (!RPG.spec) L.KeyR = '';
    for (const b of document.querySelectorAll('#tbtns button')) {
      const t = L[b.dataset.k]; b.hidden = !t; if (t) b.textContent = t;
      if (b.dataset.k === 'KeyT') b.classList.toggle('ready', (m === 'human' || m === 'car') && P.tokens >= CAP);
      if (b.dataset.k === 'KeyR') b.classList.toggle('ready', RPG.ult >= 100);
    }
  },
};

// objective light pillar
const Pillar = {
  mesh: null,
  init() {
    const g = new THREE.CylinderGeometry(3.2, 3.2, 160, 16, 1, true); g.translate(0, 80, 0);
    const c = mkCanvas(4, 128), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,.9)');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 128);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex(c), color: 0xffd23f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.visible = false; this.mesh.renderOrder = 2; scene.add(this.mesh);
  },
  update(t) {
    if (!t || Interiors.cur || (t.kind !== 'hq' && t.kind !== 'marker') || dist2(t.x, t.z, Player.pos.x, Player.pos.z) < 60 * 60) { this.mesh.visible = false; return; }
    this.mesh.visible = true; this.mesh.position.set(t.x, 0, t.z);
    this.mesh.material.color.set(t.color || (t.hq ? t.hq.c1 : '#ffd23f')).lerp(new THREE.Color(0xffffff), 0.35);
    this.mesh.scale.set(1 + Math.sin(G.time * 4) * 0.08, 1, 1 + Math.sin(G.time * 4) * 0.08);
  },
};
