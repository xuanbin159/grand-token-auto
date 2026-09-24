/* ============================================================
   北京规矩 (BJRules): 尾号限行 / 单双号 · 电子眼 + 驾照 12 分 ·
   外地牌 + 进京证 · 居住证 + 积分落户 · 小客车指标摇号 ·
   地铁 (安检 / 按里程计价 / 换乘) · 共享单车计费 · 京城交通台 ·
   「北京生活」面板 (B / HUD「北京」). Everything is wired through Hooks;
   state lives under its own Store keys and rides along with G.save / G.load.
   BJRules.stations (= W.stations) and BJRules.cams ({x, z, kind}) are there for the map.
   ============================================================ */
// 政务口径 so one session sees it all: 4 game hours = 1 年 (社保 / 记分周期 / 落户年度), 20 game minutes = 1 个月, 摇号 every 2 h
const BJ_KEY = 'gta-bj3', BJ_SKEY = 'gta-bj3-save', BJ_YEAR = 240, BJ_MONTH = 20, BJ_DRAW = 120;
const BJ_T0 = [2026, 2, 2]; // game day 0 = 2026-03-02, a Monday
const BJ_WD = '日一二三四五六';
const BJ_PAIRS = [[1, 6], [2, 7], [3, 8], [4, 9], [5, 0]];
const BJ_VIO = {
  redlight: { name: '闯红灯', fine: 200, pts: 6 },
  speed: { name: '超速', fine: 200, pts: 3 },
  plate: { name: '违反尾号限行', fine: 100, pts: 1 },
  odd: { name: '违反单双号限行', fine: 100, pts: 1 },
  permit: { name: '外地车无进京证进五环', fine: 100, pts: 1 },
  nolicense: { name: '无证驾驶（驾照已吊销）', fine: 2000, pts: 0 },
  bike: { name: '骑车闯红灯', fine: 20, pts: 0 },
  other: { name: '交通违法', fine: 200, pts: 0 },
};
// what the X-ray machine won't let through (RPG.equip.hand)
const BJ_WEAPONS = {
  brick: '板砖属于管制器具（胡同特供版），不让带', rollpin: '擀面杖？您这是去包饺子还是去茬架？不让带',
  wrench: '大扳手超长超重，属于危险工具', keyboard: '青轴机械键盘算钝器，还扰民——不让带', birdcage: '活禽不能进站，大爷您先把鸟送回家',
};
const BJ_BAG = ['充电宝（两万毫安）', '工牌', '半个煎饼果子', '保温杯（泡着枸杞）', '笔记本电脑', '降噪耳机', '三根数据线', '一包纸巾', '没吃完的驴打滚', '褶子了的一卡通'];
const BJ_SEC_OK = ['充电宝两万毫安？行，过吧', '保温杯里是枸杞？喝一口我看看——行', '包里半个煎饼果子，您进去之前吃了吧', '工牌挺新啊，刚入职？进吧', '下一位——别挤！'];
const BJ_QUIZ = [
  ['黄灯亮了，您应该？', ['一脚油门冲过去', '停车，等下一个绿灯', '按喇叭让黄灯快点儿变绿'], 1],
  ['今天限行尾号 3 和 8，您的车尾号 8，想出门怎么办？', ['坐地铁', '把尾号贴成 9', '专挑没电子眼的胡同开'], 0],
  ['二环主路限速多少？', ['80 公里', '120 公里', '看心情'], 0],
  ['闯一次红灯记几分？', ['3 分', '6 分', '12 分'], 1],
  ['驾照 12 分扣光了会怎样？', ['送一套煎饼果子', '吊销，满分学习后重考', '啥事儿没有'], 1],
  ['外地牌照的车进五环要办什么？', ['进京证', '胡同通行证', '长城门票'], 0],
  ['共享单车骑完停哪儿？', ['马路中间', '电子围栏里', '推回家'], 1],
  ['法务专车在后头鸣笛闪灯，您应该？', ['变身机甲', '靠边停车，配合调查', '扔辆车过去'], 1],
  ['重污染红色预警，北京会？', ['单双号限行', '全城放假', '发口罩当红包'], 0],
  ['路口右转碰上过马路的行人，您应该？', ['按喇叭催', '停车礼让', '从人行道上绕过去'], 1],
];
const BJ_LINES = [
  '西直门立交桥：进去容易出来难，导航已经放弃治疗了',
  '国贸桥下又堵了，算力塔的码农们今晚别想准点下班',
  '天安门地区禁飞：无人机、风筝、机甲，一律不许上天',
  '地铁 10 号线早高峰限流，排队排到中午也算早高峰',
  '北京南站出租车排队 300 米，建议换乘地铁 4 号线',
  '共享单车请停进电子围栏，停马路中间的，师傅要收调度费了',
  '二环主路限速 80。开卡车那位机甲朋友，说的就是您',
  '长安街今晚有活动，实行临时交通管制，请绕行——绕哪儿？您自个儿琢磨',
  '据统计，本市每天有四十万人在找车位，三十九万人在绕圈',
  '中关村大街：Token 运输车侧翻，路面散落大量上下文，请绕行',
  '后海酒吧街晚高峰：代驾比客人多',
  '京藏高速进京方向堵了 18 公里——老规矩了，不算新闻',
  '法务专车正在全城巡逻，请遵纪守法，不要吃霸王 Token',
  '积分落户申报开始了，分数线比去年又涨了，您的分儿够吗？',
  '进京证 12 次用完的外地朋友：试试地铁，一张票通全城',
  '五道口职业技术学院在职研究生招生：学费不便宜，学历倍儿硬',
  '友情提示：电子眼不认识您是谁，但认识您的车牌',
  '三里屯网红打卡导致人行道拥堵，路过请加速',
  '东直门：机场快轨今天没坏，特此播报',
  '北京交警提醒：路口的大爷大妈不是协管员，是真管',
];
const BJ_RESPECT = ['哟，北京户口！您是这个！', '瞧瞧，人家有户口本儿', '北京人儿，局气！', '您是正经北京人，跟我们不一样', '有户口就是硬气，走道儿都带风', '这位爷，积分落户的吧？佩服佩服'];
const bjShuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const bjPt = (v) => String(Math.round(v * 100) / 100);
const bjDur = (m) => { m = Math.max(0, Math.round(m)); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };
const bjLineCol = (l) => (typeof METRO_LINE_COLS !== 'undefined' && METRO_LINE_COLS[l]) || '#6b7280';
const bjBadges = (ls) => ls.map((l) => `<i class="bj-line" style="background:${bjLineCol(l)}">${l}</i>`).join('');

const BJRules = {
  S: null, cams: [], stations: [], VIO: BJ_VIO, lastClock: -1, loaded: false, begun: false, dirty: false, saveT: 2,
  cool: Object.create(null), lastCam: null, lastCamT: -99, warned: null, warnT: -99, inCar: null, lastCar: null, carT: 1, myCar: null,
  respectT: 40, lastSpent: 0, driveT: 0, heatT: 1, flashM: null, flashT: 0, ride: null, _st: {},
  fresh() {
    return { v: 1, day: 0, mins: 0, pts: 12, revoked: false, revokes: 0, tix: 0, fines: 0, log: [], permits: {}, permitN: 0, permitY: 0,
      juzhu: 0, juzhuAt: 0, hukou: 0, hukouAt: 0, edu: 0, lot: { on: false, fails: 0, won: false, draws: 0, code: '', last: '' }, car: null,
      rides: 0, bikeMin: 0, bikeFee: 0, rebate: 0 };
  },
  adopt(d) { const f = this.fresh(); this.S = d && d.v === 1 ? Object.assign(f, d, { lot: Object.assign(f.lot, d.lot || {}), permits: Object.assign({}, d.permits), log: (d.log || []).slice(0, 12) }) : f; },
  persist() { this.dirty = true; },
  flush() { this.dirty = false; Store.set(BJ_KEY, this.S); },
  init() {
    this.adopt(Store.get(BJ_KEY));
    this.stations = W.stations || [];
    guard('bj.cams', () => this.buildCams());
    guard('bj.ui', () => BJUI.init());
    // our state rides along with the main save (own key; the save file itself is untouched)
    const s0 = G.save, l0 = G.load, te = Player.tryEnter;
    G.save = function (auto) { guard('bj.save', () => { BJRules.flush(); Store.set(BJ_SKEY, BJRules.S); }); return s0.apply(this, arguments); };
    G.load = function (d) { const r = l0.apply(this, arguments); guard('bj.load', () => BJRules.restore()); return r; };
    // standing at a kiosk, F / 上车 means 进站 (the bikes piled at the exit and the curbside cars come second)
    if (te) Player.tryEnter = function () { if (guard('bj.claim', () => BJSubway.claim())) return; return te.apply(this, arguments); };
    Hooks.on('violation', (e) => this.onViolation(e));
    Hooks.on('bike:start', (e) => this.bikeStart(e));
    Hooks.on('bike:end', (e) => this.bikeEnd(e));
    Hooks.on('weather', (e) => BJRadio.weather(e));
    Hooks.on('traffic:rush', (e) => BJRadio.rush(e));
    if (typeof Touch !== 'undefined' && Touch.ctx) Touch.ctx(() => BJSubway.ctx());
    setTimeout(() => { if (window.GTA) window.GTA.BJRules = BJRules; }, 0);
  },
  // only the copy written with the save itself: the auto-flushed BJ_KEY belongs to whatever session ran last (an old save
  // without one starts 北京 from scratch rather than inheriting another playthrough's 户口 / 摇号 car / licence)
  restore() { this.adopt(Store.get(BJ_SKEY)); this.loaded = true; this.reset(); },
  reset() { this.lastClock = -1; this.myCar = null; this.inCar = null; this.lastCar = null; this.cool = Object.create(null); this.lastSpent = G.stats.spent || 0; this.carT = 1; },
  // first playing frame: a new game starts from a clean slate, "继续游戏" already restored ours in G.load
  begin() {
    this.begun = true;
    if (!this.loaded) { this.S = this.fresh(); this.flush(); }
    this.reset(); BJRadio.next = 90;
    // worded when it airs (after the prologue), not now
    BJRadio.say(() => { const R = this.rule(); return `京城交通台 FM88.8 陪您上路：今天${this.dateText()}，${R ? R.text + '（7 点到 20 点）' : '周末不限行'}。限行、进京证、摇号、落户，按 ${IS_TOUCH ? '「北京」' : 'B'} 查`; });
  },

  /* ---------------- calendar ---------------- */
  date(d = this.S.day) { return new Date(BJ_T0[0], BJ_T0[1], BJ_T0[2] + d); },
  dateText(d) { const t = this.date(d); return `${t.getMonth() + 1}月${t.getDate()}日 周${BJ_WD[t.getDay()]}`; },
  year() { return Math.floor(this.S.mins / BJ_YEAR); },
  // today's rule: 尾号 pairs on weekdays (rotating every 13 weeks), 单双号 while the smog alert is on, null at the weekend
  rule() {
    if (typeof Weather !== 'undefined' && Weather.cur === 'smog') { const odd = this.date().getDate() % 2 === 1; return { kind: 'odd', odd, text: odd ? '单双号限行：今天单号出行' : '单双号限行：今天双号出行', short: odd ? '单号日' : '双号日' }; }
    const w = this.date().getDay(); if (w === 0 || w === 6) return null;
    const ds = BJ_PAIRS[(((w - 1 - Math.floor(this.S.day / 91)) % 5) + 5) % 5];
    return { kind: 'tail', ds, text: `限行尾号 ${ds[0]} 和 ${ds[1]}`, short: `限行 ${ds[0]}·${ds[1]}` };
  },
  inHours() { const m = DayNight.clock; return m >= 420 && m < 1200; },
  clock() {
    const c = DayNight.clock, S = this.S;
    if (this.lastClock < 0) { this.lastClock = c; return; }
    let d = c - this.lastClock; this.lastClock = c;
    if (d < 0) d += 1440;
    if (d <= 0 || d > 720) return; // a cutscene wound the clock back: not time played
    const m0 = S.mins, c0 = c - d;
    S.mins += d; this.persist();
    if (c0 < 0) this.newDay();
    if (c0 < 390 && c >= 390) this.morning();
    if (c0 < 420 && c >= 420 && this.rule()) BJRadio.say(`7 点了，${this.rule().text}开始生效，电子眼开工`);
    if (c0 < 1200 && c >= 1200 && this.rule()) BJRadio.say('20 点，今天的限行结束了。限行尾号的车主们，可以出来遛弯儿了');
    if (Math.floor(S.mins / BJ_YEAR) > Math.floor(m0 / BJ_YEAR)) this.newYear();
    if (Math.floor(S.mins / BJ_DRAW) > Math.floor(m0 / BJ_DRAW)) this.draw();
    if (S.juzhu === 1 && S.mins >= S.juzhuAt) { S.juzhu = 2; UI.big('居住证办好了', '北京居住证到手 · 能申请积分落户、能报名摇号了', 'green', 3); Sfx.stat(); }
    if (S.hukou === 1 && S.mins >= S.hukouAt) {
      S.hukou = 2; UI.big('落户成功！', '北京户口本到手 · 商店返现 5% · 摇号中签率翻倍', 'gold', 4.2); Sfx.passed();
      BJRadio.say('喜报：又一位积分落户的新北京人！公示期没人举报，恭喜您，以后就是这个城市的主人了', true);
    }
  },
  newDay() {
    const S = this.S; S.day++;
    for (const p in S.permits) if (S.permits[p] < S.day) delete S.permits[p];
    const y = this.date().getFullYear(); if (S.permitY !== y) { S.permitY = y; S.permitN = 0; }
    if (S.day % 91 === 0) BJRadio.say('交管局通知：尾号限行从本周起轮换，别按老黄历开车');
    this.persist();
  },
  morning() {
    const R = this.rule();
    BJRadio.say(`早上好！今天是${this.dateText()}。${R ? R.text + '，7 点到 20 点，电子眼已经就位' : '周末不限行——全北京的车都出来了，您掂量着'}`, true);
  },
  newYear() {
    const S = this.S;
    if (!S.revoked && S.pts < 12) { S.pts = 12; UI.toast('新的记分周期：驾照恢复 12 分', 2.6); }
    BJRadio.say(`新的落户年度开始：积分落户分数线 ${bjPt(this.cutoff())} 分，比去年又涨了`);
    this.persist();
  },

  /* ---------------- plates ---------------- */
  // status of car c right now (one shared object: copy what you keep)
  info(c) {
    const o = this._st, bike = !!(c && c.k && c.k.bike);
    const p = !c || bike ? '' : (typeof Cars.plateOf === 'function' ? Cars.plateOf(c) : c.plate) || '';
    o.plate = p; o.bike = bike;
    o.tail = !p ? 0 : typeof Cars.tailOf === 'function' ? Cars.tailOf(c) : /\d$/.test(p) ? +p.slice(-1) : 0;
    o.local = !p || (c.local !== false && p[0] === '京');
    o.green = /·[DF]/.test(p); o.taxi = !!(c && c.kind === 'taxi') || p.startsWith('京B'); o.mine = !!(c && c.bjMine);
    const R = this.rule(), on = this.inHours();
    o.rule = R; o.restricted = false; o.noPermit = false;
    if (p) {
      if (R && on && !o.green && !o.taxi) o.restricted = R.kind === 'tail' ? R.ds.includes(o.tail) : (o.tail % 2 === 1) !== R.odd;
      o.noPermit = !o.local && !this.permitOk(p);
    }
    o.revoked = !bike && !!c && this.S.revoked;
    o.bad = o.restricted || o.noPermit || o.revoked;
    return o;
  },
  permitOk(p) { const u = this.S.permits[p]; return u !== undefined && this.S.day <= u; },
  curCar() {
    const P = Player;
    if (P.mode === 'car' && P.car && !(P.car.k && P.car.k.bike)) { const s = this.info(P.car); return { plate: s.plate, local: s.local, tail: s.tail, green: s.green, taxi: s.taxi }; }
    return this.lastCar;
  },
  why(st) { return st.revoked ? '驾照已吊销' : st.noPermit ? '外地牌没进京证' : st.restricted ? `尾号 ${st.tail} 今天限行` : ''; },

  /* ---------------- 电子眼 ---------------- */
  // on a pole at the right-hand kerb ~17 m before the big signalled crossings, plus 区间测速 along the 二环
  buildCams() {
    const cams = this.cams, P = [0, 0, 0, 1], cap = LOWQ ? 110 : 170;
    const bad = (x, z) => { const k = Grid.at(x, z); return k === GK.BLD || k === GK.WATER || k === GK.RESV; };
    const free = (x, z, r) => { for (const c of cams) if (dist2(c.x, c.z, x, z) < r * r) return false; return true; };
    const put = (e, s, dir, kind, n) => {
      if (cams.length >= cap) return false;
      Roads.at(e, clamp(s, 2, e.len - 2), P);
      const tx = P[2] * dir, tz = P[3] * dir, rx = -tz, rz = tx;
      let off = 0, x = 0, z = 0;
      for (const o of [1.2, 2.2, 3.4]) { off = e.hw + o; x = P[0] + rx * off; z = P[1] + rz * off; if (!bad(x, z) && Ground.roadSdf(x, z) >= 0.3) break; off = 0; }
      if (!off || !free(x, z, kind === 'speed' ? 220 : 95)) return false;
      const arm = clamp(off * 0.8, 3, 8.5), gy = groundH(x, z), fu = arm * 0.72;
      cams.push({ x, z, gy, tx, tz, rx, rz, arm, kind, n, wx: P[0] + rx * e.hw * 0.4, wz: P[1] + rz * e.hw * 0.4, r2: (e.hw * 0.7 + 5) ** 2,
        hx: x - rx * fu - tx * 0.3, hy: gy + 5.9, hz: z - rz * fu - tz * 0.3 });
      return true;
    };
    const hash = (n) => { const v = Math.sin(n.x * 12.9898 + n.z * 78.233) * 43758.5453; return v - Math.floor(v); };
    const sigs = Signals.list.filter((s) => s.n && s.n.edges.some((e) => e.cls <= 2)).sort((a, b) => hash(a.n) - hash(b.n));
    for (const sg of sigs) {
      const n = sg.n, es = n.edges.filter((e) => e.cls <= 2 && e.len > 24 && e.a !== e.b).sort((a, b) => a.cls - b.cls || b.len - a.len);
      for (const e of es) { const dir = e.b === n.id ? 1 : -1, d = Math.min(17, e.len * 0.6); if (e.oneway && dir < 0) continue; if (put(e, dir > 0 ? e.len - d : d, dir, 'sig', n)) break; }
    }
    let k = 0;
    for (const e of Roads.edges) { if (e.cls !== 0 || e.len < 24) continue; for (let s = 12; s < e.len - 12; s += 60) put(e, s, e.oneway || k++ % 2 ? 1 : -1, 'speed', null); }
    this.camMeshes();
  },
  camMeshes() {
    const by = new Map(), signs = [], GREY = 0x8e959e, DARK = 0x2b2f36, HOUS = 0xe3e6ea, LENS = 0x101216;
    for (const c of this.cams) {
      const key = Build.chunk(c.x, c.z); let L = by.get(key); if (!L) by.set(key, L = []);
      const ax = -c.rx, az = -c.rz, ry = Math.atan2(-az, ax);
      // u: along the arm (over the lanes), y: up, f: along the traffic (the lenses look back at it)
      const B = (u, y, f, w, h, d, col) => L.push(box(c.x + ax * u + c.tx * f, c.gy + y, c.z + az * u + c.tz * f, w, h, d, col, ry));
      B(0, 0.15, 0, 0.55, 0.3, 0.55, DARK); B(0, 3.25, 0, 0.24, 6.5, 0.24, GREY); B(c.arm / 2, 6.35, 0, c.arm, 0.2, 0.2, GREY);
      B(0.05, 3.6, -0.18, 1.06, 0.58, 0.05, 0x1b1e22);
      signs.push({ x: c.x + ax * 0.05 - c.tx * 0.21, y: c.gy + 3.6, z: c.z + az * 0.05 - c.tz * 0.21, ry: Math.atan2(-c.tx, -c.tz), w: 1, h: 0.52, u0: 0, u1: 1, v0: c.kind === 'speed' ? 0 : 0.5, v1: c.kind === 'speed' ? 0.5 : 1 });
      for (const u of [c.arm * 0.5, c.arm * 0.92]) { B(u, 6.02, 0, 0.36, 0.34, 0.8, HOUS); B(u, 5.98, -0.42, 0.22, 0.2, 0.06, LENS); B(u, 6.22, 0, 0.1, 0.14, 0.1, DARK); }
      B(c.arm * 0.72, 5.9, 0, 0.46, 0.3, 0.34, DARK); B(c.arm * 0.72, 5.9, -0.18, 0.4, 0.22, 0.04, 0xf4f4f4);
      addSolid(null, { x0: c.x - 0.2, x1: c.x + 0.2, z0: c.z - 0.2, z1: c.z + 0.2, h: 1.1, kind: 'pillar' }); // low h: the chase camera's occlusion ray ignores it
    }
    for (const L of by.values()) {
      const m = new THREE.Mesh(mergeParts(L), MAT.vc); m.matrixAutoUpdate = false;
      scene.add(m); if (typeof Cull !== 'undefined') Cull.add(m, 300);
    }
    // the plate under each camera: 电子警察 (blue) / 区间测速 (white), one atlas, merged quads per chunk
    if (signs.length && typeof quadsPerChunk === 'function') {
      const cv = mkCanvas(256, 256), g = cv.getContext('2d');
      const sign = (y, bg, fg, t1, t2) => {
        g.fillStyle = bg; g.fillRect(0, y, 256, 128); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(9, y + 9, 238, 110);
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, t1, 210, 50, 900); g.fillText(t1, 128, y + 50); fitFont(g, t2, 210, 22, 800); g.fillText(t2, 128, y + 95);
      };
      sign(0, '#1f4fb4', '#ffffff', '电子警察', '闯红灯 · 限行 · 进京证 抓拍');
      sign(128, '#f4f4f4', '#1f4fb4', '区间测速', '二环主路 限速 80');
      quadsPerChunk(signs, new THREE.MeshLambertMaterial({ map: tex(cv) }), 150);
    }
    const fm = this.flashM = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: TEX.soft || null, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    fm.visible = false; fm.renderOrder = 7; scene.add(fm);
  },
  camNear(x, z, r) { let b = null, bd = r * r; for (const c of this.cams) { const d = dist2(x, z, c.wx, c.wz); if (d < bd) { bd = d; b = c; } } return b; },
  flash(cam) {
    FX.light(cam.hx, cam.hy - 0.3, cam.hz, 7, 0xf2f6ff);
    if (this.flashM) { this.flashM.position.set(cam.hx, cam.hy, cam.hz); this.flashM.visible = true; this.flashT = 0.35; }
    BJUI.flashScreen(); Sfx.click(); Sfx.letter();
  },
  // every 0.15 s while the player drives: warnings, 无证驾驶 heat, and the lenses you pass
  drive() {
    const P = Player, c = P.car;
    if (P.mode !== 'car' || !c || c.removed || Interiors.cur) { this.inCar = null; return; }
    const st = this.info(c);
    if (c !== this.inCar) { this.inCar = c; this.onEnter(c, st); }
    if (st.bike) return;
    if (st.revoked && Math.abs(c.speed) > 4 && (this.heatT -= 0.15) <= 0) { this.heatT = 1; G.crime(0.006); }
    const x = c.pos.x, z = c.pos.z, vx = c.vel.x, vz = c.vel.z;
    for (const cam of this.cams) {
      const dx = cam.wx - x, dz = cam.wz - z, d2 = dx * dx + dz * dz;
      if (d2 > 125 * 125) continue;
      const along = vx * cam.tx + vz * cam.tz;
      if (d2 < cam.r2) {
        if (along > 1.5 && !(this.lastCam === cam && G.time - this.lastCamT < 25)) { this.lastCam = cam; this.lastCamT = G.time; this.pass(cam, c, st); }
      } else if (st.bad && along > 3 && dx * vx + dz * vz > 0 && (this.warned !== cam || G.time - this.warnT > 60)) {
        this.warned = cam; this.warnT = G.time;
        UI.hint(`前方 ${Math.max(10, Math.round(Math.sqrt(d2) / 10) * 10)} 米电子眼 · ${this.why(st)}`);
      }
    }
  },
  pass(cam, c, st) {
    const ks = [];
    if (st.revoked) ks.push('nolicense');
    if (st.restricted) ks.push(st.rule && st.rule.kind === 'odd' ? 'odd' : 'plate');
    if (st.noPermit) ks.push('permit');
    // the same plate is fined once per 3 game hours for 限行 / 进京证 (real rule); 无证驾驶 every lens
    const due = ks.filter((k) => { if (k === 'nolicense') return true; const key = k + st.plate, t = this.cool[key]; if (t !== undefined && this.S.mins - t < 180) return false; this.cool[key] = this.S.mins; return true; });
    if (!due.length) return;
    const plate = st.plate;
    this.flash(cam);
    for (const k of due) this.ticket(k, c, cam.wx, cam.wz, { plate });
  },
  onEnter(c, st) {
    if (st.bike) return;
    this.lastCar = { plate: st.plate, local: st.local, tail: st.tail, green: st.green, taxi: st.taxi };
    const key = IS_TOUCH ? '「北京」' : 'B';
    let msg = '';
    if (st.revoked) msg = '驾照已吊销——这车您开就是无证驾驶，电子眼一拍法务部就到';
    else if (st.noPermit) msg = `${st.plate} 是外地牌，没进京证：按 ${key} 在手机上办一个`;
    else if (st.restricted) msg = `${st.plate} 尾号 ${st.tail}，今儿限行！躲着电子眼开`;
    else if (st.mine) msg = `您的京牌车 ${st.plate} · 走着！`;
    else if (st.rule && this.inHours()) msg = `${st.plate} · 尾号 ${st.tail} · ${st.green ? '新能源不限行' : st.taxi ? '出租车不限行' : '今儿不限行'}`;
    if (msg) setTimeout(() => { if (Player.car === c) UI.toast(msg, 3); }, 900);
  },
  where(x, z) { const n = Roads.nearest(x, z, 40); return n && n.e.name ? n.e.name : typeof districtAt === 'function' ? districtAt(x, z)[0] : '路口'; },
  ticket(k, c, x, z, o = {}) {
    const V = BJ_VIO[k], S = this.S; if (!V) return;
    const fine = o.fine || V.fine, pts = o.pts !== undefined ? o.pts : V.pts, name = o.name || V.name;
    const plate = o.plate || (c && c.k && c.k.bike ? '共享单车' : this.info(c).plate) || '无牌车';
    G.addMoney(-fine); S.fines += fine; if (k !== 'bike') S.tix++;
    let lost = 0;
    if (pts && !S.revoked) { lost = Math.min(S.pts, pts); S.pts -= lost; }
    if (k === 'nolicense') G.crime(0.9);
    const where = this.where(x, z);
    S.log.unshift({ d: S.day, t: DayNight.timeText(), k, n: name, p: plate, w: where, f: fine, s: lost }); if (S.log.length > 12) S.log.length = 12;
    if (c && c.pos) Floaters.add(c.pos.x, 3.2, c.pos.z, `罚 ¥${fine}${lost ? ' · −' + lost + ' 分' : ''}`, 'fl-legal', 1.6);
    BJUI.sms(plate, where, name, fine, lost); Sfx.denied();
    Hooks.emit('bj:ticket', { kind: k, fine, pts: lost, plate, x, z });
    if (pts && !S.revoked && S.pts <= 0) this.revoke();
    this.persist();
  },
  revoke() {
    const S = this.S; S.revoked = true; S.revokes++; S.pts = 0;
    UI.big('驾照吊销！', `12 分扣光了 · 按 ${IS_TOUCH ? '「北京」' : 'B'} 去考满分学习（¥200，答对 3 题）`, 'failed', 3.6);
    BJRadio.say('插播：又一位老司机 12 分扣光了。满分学习、科目一重考——交规那本儿书，您得从头背', true);
  },
  onViolation(e) {
    if (!G.started || !e || !e.kind) return;
    const P = Player, c = P.car;
    if (P.mode !== 'car' || !c || (e.car && e.car !== c)) return;
    const x = e.x ?? c.pos.x, z = e.z ?? c.pos.z;
    if (e.kind === 'redlight') {
      if (e.bike || (c.k && c.k.bike)) {
        const cam = this.camNear(x, z, 70);
        if (cam || Math.random() < 0.35) { if (cam) this.flash(cam); this.ticket('bike', c, x, z); UI.hint(cam ? '电子眼：自行车闯红灯，照样拍！' : '路口协管员大妈：「嘿！骑车那个！红灯！罚款二十！」'); }
        return;
      }
      const cam = this.camNear(x, z, 80);
      if (!cam) { if (Math.random() < 0.3) UI.hint('闯了个红灯……这路口没电子眼，算您走运'); return; }
      this.flash(cam); this.ticket('redlight', c, x, z);
    } else if (e.kind === 'speed') {
      if (c.k && c.k.bike) return;
      const cam = this.camNear(x, z, 75); if (!cam) return; // you have to actually pass the lens
      const lim = Math.round((e.limit || 30) / 1.6 * 3.6 / 10) * 10, kmh = Math.round((e.speed || 0) * 3.6);
      this.flash(cam); this.ticket('speed', c, x, z, { name: `超速 ${kmh} km/h（限速 ${lim}）` });
    } else if (e.fine && !BJ_VIO[e.kind]) this.ticket('other', c, x, z, { name: e.name, fine: e.fine, pts: e.pts || 0 });
  },

  /* ---------------- 共享单车 ---------------- */
  bikeStart() { this.ride = { t0: DayNight.clock }; },
  bikeFeeFor(m) { return 1.5 * Math.ceil(Math.max(1, m) / 15); },
  bikeEnd(e) {
    const S = this.S, m = Math.max(1, Math.round((e && e.minutes) || 1)), fee = this.bikeFeeFor(m);
    const extra = e && e.x !== undefined && !this.inFence(e.x, e.z) ? 5 : 0, pay = Math.ceil(fee + extra);
    G.addMoney(-pay); S.bikeMin += m; S.bikeFee += pay; this.ride = null;
    UI.toast(`还车成功 · 骑了 ${m} 分钟 · 扣费 ¥${fee.toFixed(1)}${extra ? ' + 调度费 ¥5（没停进电子围栏）' : ''}`, 3.2);
    Sfx.cash(1); this.persist();
  },
  // 电子围栏: by a subway exit or next to a bike heap
  inFence(x, z) {
    for (const st of this.stations) if (dist2(x, z, st.door.x, st.door.z) < 40 * 40) return true;
    const L = typeof Bikes !== 'undefined' && Bikes.all ? Bikes.all() : [];
    for (let i = 0; i < L.length; i++) { const b = L[i]; if (!b.taken && dist2(x, z, b.x, b.z) < 14 * 14) return true; }
    return false;
  },

  /* ---------------- 进京证 · 居住证 · 积分落户 ---------------- */
  applyPermit() {
    const S = this.S, c = this.curCar();
    if (!c || c.local || this.permitOk(c.plate)) return;
    const y = this.date().getFullYear(); if (S.permitY !== y) { S.permitY = y; S.permitN = 0; }
    if (S.permitN >= 12) { UI.toast('今年 12 次进京证已经用完了——坐地铁吧您', 2.8); Sfx.denied(); return; }
    S.permitN++; S.permits[c.plate] = S.day + 6;
    UI.toast(`北京交警 App：${c.plate} 进京证审核通过，7 天有效（今年第 ${S.permitN} 次）`, 3); Sfx.buy(); this.persist();
  },
  eduLevel() { const lv = RPG.level; return Math.max(this.S.edu, lv >= 15 ? 2 : lv >= 8 ? 1 : 0); },
  points() {
    const S = this.S, mo = Math.floor(S.mins / BJ_MONTH), yy = Math.floor(mo / 12), el = this.eduLevel();
    const spent = G.stats.spent || 0, hq = W.hqs.filter((h) => h.dead).length, done = Object.keys(Story.done || {}).length, stolen = G.stats.stolen || 0;
    const rows = [
      ['年龄', 20, '不满 45 周岁（35 岁危机不算数）'],
      ['学历', [15, 26, 37][el], ['本科', '硕士', '博士'][el] + (S.edu && S.edu >= el ? ' · 五道口职业技术学院' : ' · 等级 Lv.' + RPG.level)],
      ['合法稳定就业', mo / 4, `社保 ${yy} 年 ${mo % 12} 个月 · 3 分/年`],
      ['合法稳定住所', mo / 12, '王府（自有产权）· 1 分/年'],
      ['纳税', Math.min(6, 2 * Math.floor(spent / 100000)), `累计消费 ${fmtMoney(spent)} · 每 10 万 2 分，封顶 6`],
      ['创新创业', Math.min(12, 3 * hq), `拆掉百模帮总部 ${hq} 家 · 3 分/家，封顶 12`],
      ['荣誉表彰', Story.flags && Story.flags.finished ? 20 : Math.min(12, done), `完成任务 ${done} 个${Story.flags && Story.flags.finished ? ' · 全国劳模' : ''}`],
      ['守法记录', -(S.tix + 5 * S.revokes + Math.min(10, stolen * 0.1)), `违章 ${S.tix} 次 · 吊销 ${S.revokes} 次 · 偷车 ${stolen} 辆`],
    ];
    let total = 0; for (const r of rows) total += r[1];
    return { rows, total: Math.round(total * 100) / 100 };
  },
  cutoff() { return 100.5 + 1.25 * this.year(); },
  applyJuzhu() {
    const S = this.S; if (S.juzhu) return;
    if (S.mins < 6 * BJ_MONTH) { UI.toast(`居住证得在京住满半年：还差 ${Math.ceil((6 * BJ_MONTH - S.mins) / BJ_MONTH)} 个月（政务口径）`, 2.8); Sfx.denied(); return; }
    S.juzhu = 1; S.juzhuAt = S.mins + 60;
    UI.toast('派出所：材料收了，一个钟头以后来拿居住证', 2.6); Sfx.stat(); this.persist();
  },
  applyHukou() {
    const S = this.S; if (S.hukou) return;
    if (S.juzhu !== 2) { UI.toast('先办居住证——没居住证，积分落户的门儿都摸不着', 2.6); Sfx.denied(); return; }
    const t = this.points().total, cut = this.cutoff();
    if (t < cut) { UI.toast(`还差 ${bjPt(cut - t)} 分——分数线又涨了`, 2.6); Sfx.denied(); return; }
    S.hukou = 1; S.hukouAt = S.mins + 60;
    UI.toast('申报成功：落户名单公示一个钟头，没人举报您就是北京人了', 3); Sfx.stat(); this.persist();
  },
  buyEdu() {
    const next = this.eduLevel() + 1; if (next > 2) return;
    const price = next === 1 ? 880000 : 2880000;
    if (G.money < price) { UI.toast('学费不够——五道口职业技术学院概不赊账', 2.4); Sfx.denied(); return; }
    G.addMoney(-price); G.stats.spent = (G.stats.spent || 0) + price; this.lastSpent = G.stats.spent; this.S.edu = next;
    UI.big(next === 1 ? '硕士毕业！' : '博士毕业！', '五道口职业技术学院 · 积分落户学历分 +11', 'gold', 3); Sfx.levelUp(); this.persist();
  },

  /* ---------------- 小客车指标摇号 ---------------- */
  canLot() { const S = this.S; return S.hukou === 2 || (S.juzhu === 2 && S.mins >= 2 * BJ_YEAR); },
  // 阶梯: every draw you miss adds a rung (and another ticket in the drum); 京籍 doubles it
  ladder() { return 1 + this.S.lot.fails; },
  odds() { return Math.min(0.5, 0.005 * this.ladder() * (this.S.hukou === 2 ? 2 : 1)); },
  enterLot() {
    const L = this.S.lot; if (L.on || L.won) return;
    if (!this.canLot()) { UI.toast('报名条件：北京户口，或者居住证 + 社保满 2 年', 2.8); Sfx.denied(); return; }
    L.on = true; L.code = String(randi(1000000000000, 9999999999999));
    UI.toast(`报名成功 · 申请编码 ${L.code} · 每两个钟头开一期`, 3); Sfx.stat(); this.persist();
  },
  draw(force) {
    const L = this.S.lot; if (!L.on || L.won) return;
    L.draws++;
    if (force === 'win' || (force !== 'lose' && Math.random() < this.odds())) { this.win(); return; }
    L.fails++; L.last = `第 ${L.draws} 期未中签`;
    const quota = randi(1400, 2600), pool = randi(310, 360);
    BJRadio.say(`小客车指标第 ${L.draws} 期摇号：${pool} 万人抢 ${quota} 个指标。编码尾号 ${L.code.slice(-4)} 那位——没您。阶梯升到 ${this.ladder()}，下期接着陪跑`);
    this.persist();
  },
  win() {
    const S = this.S, L = S.lot; L.won = true; L.last = `第 ${L.draws} 期中签！`;
    const plate = '京' + pick('ACEFGHJKLMNPQ') + '·' + pick('ABCEFGHJKLMNPQRSTUVWXY') + randi(100, 999) + randi(0, 9);
    S.car = { plate, color: pick(CAR_KINDS.sedan.colors) };
    UI.big('中签了！！', `摇了 ${L.draws} 期 · 京牌 ${plate} 的新车停在王府门口`, 'gold', 4.2); Sfx.passed();
    BJRadio.say(`特大喜讯：申请编码尾号 ${L.code.slice(-4)} 中签了！全胡同的大爷都来道喜，鞭炮都放上了`, true);
    this.myCar = null; this.carT = 0.5; this.persist();
  },
  // a spot at the kerb of the nearest ordinary street: [x, z, heading]
  parkSpot(x, z) {
    const n = Roads.nearest(x, z, 90, (e) => e.cls >= 2 && e.cls <= 5 && e.len > 24 && e.a !== e.b); if (!n) return null;
    const P = [0, 0, 0, 1], D = W.doors || [];
    for (const ds of [0, 9, -9, 18, -18, 27, -27]) {
      Roads.at(n.e, clamp(n.s + ds, 8, n.e.len - 8), P);
      const tx = P[2], tz = P[3], rx = -tz, rz = tx, side = (x - P[0]) * rx + (z - P[1]) * rz >= 0 ? 1 : -1;
      const off = Math.max(0, n.e.hw - 1.5) * side, px = P[0] + rx * off, pz = P[1] + rz * off;
      if (Cars.occupied && Cars.occupied(px, pz, 5)) continue;
      if (D.some((d) => dist2(d.x, d.z, px, pz) < 8 * 8)) continue; // never parked across a doorway (the 王府 gate is the save point)
      return [px, pz, Math.atan2(tx * side, tz * side)];
    }
    return null;
  },
  spawnCar(x, z, h) {
    const S = this.S, c = new Car('sedan', S.car.color);
    c.hasDriver = false; c.state = 'parked'; c.pos.set(x, 0, z); c.heading = h; c.speed = 0; c.vel.set(0, 0, 0);
    c.gy = typeof VehGround !== 'undefined' && VehGround.at ? VehGround.at(x, z) : 0; c.sync(); Cars.list.push(c);
    guard('bj.plate', () => this.paintPlate(c));
    c.plate = S.car.plate; c.local = true; c.bjMine = true; c.name = '您的京牌车 · ' + S.car.plate;
    this.myCar = c;
    return c;
  },
  // our own plate lives in one slot of the shared plate atlas, taken for good: marked used and never released, so no traffic car
  // ever gets our 京牌 when the lottery car is streamed out, and a respawned lottery car reuses the same slot
  pin: -1,
  paintPlate(c) {
    const P = Plates, want = this.S.car.plate;
    if (!P || !P.mesh || !P.used) return;
    if (this.pin < 0) {
      for (let k = P.N - 1; k >= 28; k--) if (!P.used[k] && P.local[k] && !/·[DF]/.test(P.txt[k])) { this.pin = k; break; }
      if (this.pin < 0) return;
      const rel = P.release; P.release = function (k) { if (k !== BJRules.pin) rel.call(this, k); };
    }
    const i = this.pin;
    if (c.plateSlot !== i) P.release(c.plateSlot);
    P.used[i] = 1; c.plateSlot = i;
    if (P.txt[i] === want) return;
    P.txt[i] = want;
    const map = P.mesh.material.map, cv = map && map.image; if (!cv || !cv.getContext) return;
    const g = cv.getContext('2d'), x = (i % P.COLS) * P.SW, y = Math.floor(i / P.COLS) * P.SH;
    g.clearRect(x, y, P.SW, P.SH); rrect(g, x + 2, y + 2, P.SW - 4, P.SH - 4, 5); g.fillStyle = '#1b4fc0'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#f5f5f5'; rrect(g, x + 5, y + 5, P.SW - 10, P.SH - 10, 3); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, want, P.SW - 16, 27, 800); g.fillText(want, x + P.SW / 2, y + P.SH / 2 + 1);
    map.needsUpdate = true;
  },
  // the 摇号 car waits at home; left far away or burnt out, 代驾 / the insurance brings it back
  keepCar() {
    const S = this.S, P = Player; if (!S.car || Interiors.cur || Cutscene.active) return;
    const c = this.myCar;
    if (c && !c.removed && !c.burnt) return;
    if (c && !c.removed) return; // a smoking wreck: the scrapyard takes it away first
    const f = W.special.home && W.special.home.front, hx = f ? f.x + f.ox * 8 : W.spawn.x, hz = f ? f.z + f.oz * 8 : W.spawn.z;
    const spot = this.parkSpot(hx, hz); if (!spot) return;
    if (dist2(spot[0], spot[1], P.pos.x, P.pos.z) < 70 * 70 && Cars.inView && Cars.inView(spot[0], spot[1])) return; // never pop in on camera
    this.spawnCar(spot[0], spot[1], spot[2]);
    if (c) UI.toast(c.burnt ? '保险公司赔了辆一模一样的——京牌车在王府门口等您' : `代驾把您的 ${S.car.plate} 开回王府门口了`, 3);
  },
  callCar() {
    const S = this.S, P = Player; if (!S.car) return;
    if (P.mode !== 'human' || Interiors.cur) { UI.toast('出了门、下了车再叫代驾', 2.2); return; }
    if (G.money < 200) { UI.toast('代驾费 ¥200 都掏不出来了？', 2.2); Sfx.denied(); return; }
    const spot = this.parkSpot(P.pos.x, P.pos.z); if (!spot) { UI.toast('附近没地儿停车，走到大路边上再叫', 2.4); return; }
    G.addMoney(-200);
    if (this.myCar && !this.myCar.removed && this.myCar !== P.car) this.myCar.remove();
    this.spawnCar(spot[0], spot[1], spot[2]);
    UI.toast(`代驾师傅把 ${S.car.plate} 开过来了 · 代驾费 ¥200`, 2.8); Sfx.horn();
  },

  /* ---------------- 户口 perks ---------------- */
  perks(dt) {
    const S = this.S, sp = G.stats.spent || 0;
    if (sp > this.lastSpent) {
      const d = sp - this.lastSpent; this.lastSpent = sp;
      if (S.hukou === 2 && d >= 100) { const r = Math.round(d * 0.05); G.addMoney(r); S.rebate += r; UI.toast(`京籍会员价：返现 ¥${r.toLocaleString('en-US')}`, 2.4); Sfx.cash(3); this.persist(); }
    } else this.lastSpent = sp;
    if (S.hukou === 2 && (this.respectT -= dt) <= 0) {
      this.respectT = rand(35, 70);
      const P = Player; if (P.mode !== 'human' || Interiors.cur || Cutscene.active || !Peds.list) return;
      let best = null, bd = 11 * 11;
      for (const p of Peds.list) { if (!p.active || p.removed || p.dead || p.state === 'panic' || p.state === 'dive') continue; const d = dist2(p.pos.x, p.pos.z, P.pos.x, P.pos.z); if (d < bd) { bd = d; best = p; } }
      if (best) Bubble.say(best, pick(BJ_RESPECT), 2.4, 'ped');
    }
  },
  fx(rdt) {
    const m = this.flashM; if (!m || this.flashT <= 0) return;
    this.flashT -= rdt;
    m.quaternion.copy(camera.quaternion); m.material.opacity = clamp(this.flashT / 0.35, 0, 1); m.scale.setScalar(1 + (0.35 - this.flashT) * 5);
    if (this.flashT <= 0) m.visible = false;
  },
  update(dt, rdt) {
    if (!G.started) return;
    if (!this.begun) this.begin();
    this.clock();
    if ((this.driveT -= rdt) <= 0) { this.driveT = 0.15; this.drive(); }
    BJSubway.update(); BJRadio.update(dt, rdt); BJUI.update(rdt); this.fx(rdt);
    if ((this.carT -= rdt) <= 0) { this.carT = 2; guard('bj.car', () => this.keepCar()); }
    this.perks(dt);
    if (this.dirty && (this.saveT -= rdt) <= 0) { this.saveT = 2; this.flush(); }
  },
};

/* ---------------- 地铁: 安检 → 买票 → 选站 → 黑屏 → 出站 ---------------- */
const BJSubway = {
  at: null, hinted: null, openedT: -1, from: null, tab: 'near', bad: null,
  nearest(x, z, r) { let b = null, bd = r * r; for (const st of BJRules.stations) { const d = dist2(x, z, st.door.x, st.door.z); if (d < bd) { bd = d; b = st; } } return b; },
  update() {
    const P = Player;
    this.at = null;
    if (Interiors.cur || Cutscene.active || (P.mode !== 'human' && P.mode !== 'robot')) { this.hinted = null; return; }
    const near = this.nearest(P.pos.x, P.pos.z, 7);
    if (near !== this.hinted) {
      this.hinted = near;
      if (near) UI.hint(P.mode === 'robot' ? `机甲进不了地铁站——先${IS_TOUCH ? '点「解除」' : '按 Q'}解除变身` : `${IS_TOUCH ? '点「进站」' : '按 F'} 坐地铁 · ${near.name}站 ${near.lines.map((l) => l + ' 号线').join(' / ')}`);
    }
    if (near && P.mode === 'human' && dist2(P.pos.x, P.pos.z, near.door.x, near.door.z) < 2.8 * 2.8) this.at = near;
    // in case the F press never reached Player.tryEnter
    if (this.at && kp('KeyF', 'KeyE') && P.mode === 'human' && !BJUI.open && G.time !== this.openedT) this.open(this.at);
  },
  ctx() { return this.at && Player.mode === 'human' ? '进站' : ''; },
  claim() { if (!this.at || Player.mode !== 'human' || BJUI.open) return false; this.open(this.at); return true; },
  open(st) {
    this.openedT = G.time;
    if (G.heat >= 2) { UI.toast('安检员瞅您两眼，拿起了对讲机：「法务部通缉的那位吧？」——进不去', 3); Sfx.denied(); return; }
    this.from = st; this.tab = 'near'; this.bad = null;
    const hand = RPG.equip && RPG.equip.hand, bad = hand && BJ_WEAPONS[hand] ? hand : null;
    const items = bjShuffle(BJ_BAG.slice()).slice(0, randi(2, 3));
    if (Player.tokens >= 300000) items.push('一兜子 Token');
    const badName = bad ? (EQUIP[bad] || {}).name || bad : '';
    if (bad) items.splice(1, 0, badName);
    BJUI.modal(`安检 · ${st.name}站`, `<p class="bj-note">${bjBadges(st.lines)} 进站安检：包放传送带上，人走安检门</p>
      <div class="bj-belt" id="bj-belt"><div class="track"></div><div class="arch"></div><div class="bag"></div></div>
      <div class="bj-xray" id="bj-xray">${items.map((t) => `<i class="${t === badName ? 'bad' : ''}">${esc(t)}</i>`).join('')}</div>
      <div class="bj-verdict" id="bj-verdict">X 光机：嗡——</div><div id="bj-sec-btns"></div>`, `${DayNight.timeText()} · 余额 ${fmtMoney(G.money)}`);
    Sfx.servo(0.8);
    requestAnimationFrame(() => requestAnimationFrame(() => { const b = $('bj-belt'); if (b) b.classList.add('go'); }));
    [...document.querySelectorAll('#bj-xray i')].forEach((el, i) => setTimeout(() => el.classList.add('on'), 450 + i * 260));
    setTimeout(() => this.verdict(st, bad, badName), 1700);
  },
  verdict(st, bad, badName) {
    if (BJUI.open !== 'modal' || this.from !== st) return;
    const v = $('bj-verdict'), b = $('bj-sec-btns'); if (!v || !b) return;
    if (bad) {
      this.bad = bad; v.className = 'bj-verdict bad'; v.textContent = '嘀——！' + BJ_WEAPONS[bad];
      b.innerHTML = `<button class="bj-btn primary" type="button" data-a="unequip">把「${esc(badName)}」摘了再进</button> <button class="bj-btn" type="button" data-a="close">算了，不坐了</button>`;
      Sfx.denied(); return;
    }
    v.className = 'bj-verdict ok'; v.textContent = '安检通过 · ' + pick(BJ_SEC_OK); Sfx.blip(1.4);
    setTimeout(() => { if (BJUI.open === 'modal' && this.from === st) this.picker(); }, 800);
  },
  unequip() {
    const id = this.bad; if (!id) return;
    if (RPG.equip.hand === id) RPG.toggleEquip(id);
    this.bad = null; UI.toast(`「${(EQUIP[id] || {}).name || id}」先揣兜里了（下了地铁再拿出来）`, 2.2);
    this.picker();
  },
  km(a, b) { return hyp(a.door.x - b.door.x, a.door.z - b.door.z) * 5.5 / 1000; }, // the map is squeezed 1/4 – 1/6
  fare(km) { return km <= 6 ? 3 : km <= 12 ? 4 : km <= 22 ? 5 : km <= 32 ? 6 : 7 + Math.floor((km - 32) / 20); },
  same(a, b) { return a.lines.some((l) => b.lines.includes(l)); },
  mins(a, b, km) { return Math.round(5 + km / 32 * 60 + (this.same(a, b) ? 0 : 6)); },
  picker() {
    if (BJUI.open !== 'modal') return;
    const st = this.from, S = BJRules.stations, byD = (a, b) => dist2(a.door.x, a.door.z, st.door.x, st.door.z) - dist2(b.door.x, b.door.z, st.door.x, st.door.z);
    let list = S.filter((s) => s !== st);
    if (this.tab === 'near') list = list.sort(byD).slice(0, 12);
    else if (this.tab === 'all') list.sort(byD);
    else list = list.filter((s) => s.lines.includes(+this.tab)).sort(byD);
    const tabs = [['near', '附近'], ...st.lines.map((l) => [String(l), l + ' 号线']), ['all', '全部']];
    const rush = typeof Traffic !== 'undefined' && Traffic.rushK > 0.5;
    BJUI.modal(`地铁 · ${st.name}站`, `<p class="bj-note">${bjBadges(st.lines)} 选个目的地 · 票价按里程：6 公里内 3 元，越远越贵${rush ? ' · <b style="color:#ff8d95">早晚高峰，车厢里挤成图片</b>' : ''}</p>
      <div class="bj-tabs">${tabs.map(([k, n]) => `<button type="button" data-a="tab" data-i="${k}" class="${String(this.tab) === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <ul class="bj-st">${list.map((s) => { const km = this.km(st, s); return `<li><button type="button" data-a="go" data-i="${S.indexOf(s)}"><span><b>${esc(s.name)}</b> ${bjBadges(s.lines)}${this.same(st, s) ? '' : '<small>换乘</small>'}</span><em>¥${this.fare(km)} · ${this.mins(st, s, km)} 分钟</em></button></li>`; }).join('') || '<li class="bj-note">这条线上没别的站了</li>'}</ul>`,
    `${DayNight.timeText()} · 余额 ${fmtMoney(G.money)}`);
  },
  ride(to) {
    const from = this.from; if (!from || !to || to === from) return;
    const km = this.km(from, to), fare = this.fare(km), rush = typeof Traffic !== 'undefined' && Traffic.rushK > 0.5, mins = this.mins(from, to, km) + (rush ? 6 : 0);
    if (G.money < fare) { UI.toast('一卡通余额不足……您兜里就剩这点儿了？', 2.4); Sfx.denied(); return; }
    G.addMoney(-fare); BJRules.S.rides++; BJRules.persist();
    BJUI.hide(); Input.lock = true; Sfx.door();
    UI.fade(1, 0.45, () => {
      DayNight.clock = (DayNight.clock + mins) % 1440;
      const P = Player, o = to.door.o;
      P.pos.set(to.door.x + o[0] * 1.6, 0, to.door.z + o[1] * 1.6); P.vel.set(0, 0, 0); P.heading = Math.atan2(o[0], o[1]); P.y = 0; P.vy = 0;
      collideWorld(P.pos, 0.6);
      Cam.snap();
      Hooks.emit('subway:ride', { from: from.name, to: to.name, fare, minutes: mins, km: Math.round(km * 10) / 10 });
      UI.big(to.name + '站到了', `车费 ¥${fare} · 坐了 ${mins} 分钟${rush ? ' · 高峰挤成了相片儿' : ''}`, 'white', 2.4);
      setTimeout(() => UI.fade(0, 0.6, () => { Input.lock = !!(Cutscene.active || (typeof Gym !== 'undefined' && Gym.active) || UI.panelOpen); }), 250);
    });
  },
};

/* ---------------- 京城交通台 FM88.8: a ticker under the news slot ---------------- */
const BJRadio = {
  q: [], t: 0, next: 40, noFly: -1e9, cur: '', wasSmog: false, freeT: 0,
  say(text, front) {
    if (!text || this.cur === text || this.q.includes(text)) return;
    if (front) this.q.unshift(text); else this.q.push(text);
    if (this.q.length > 5) this.q.length = 5;
  },
  update(dt, rdt) {
    // on air only out in the streets, a few seconds after the last cutscene let go
    this.freeT = Cutscene.active || Interiors.cur || Input.lock ? 0 : this.freeT + rdt;
    if (this.t > 0) { this.t -= rdt; if (this.t <= 0) { this.cur = ''; BJUI.radio(''); } }
    else if (this.q.length && this.freeT > 4) { let s = this.q.shift(); if (typeof s === 'function') s = s(); if (s) { this.cur = s; this.t = clamp(3 + s.length * 0.12, 5, 10); BJUI.radio(s); } }
    if ((this.next -= dt) <= 0) { this.next = rand(80, 150); if (!Cutscene.active && !Interiors.cur) this.say(this.line()); }
    const T = W.landmarks && W.landmarks.tiananmen, P = Player;
    if (T && P.isMech() && G.time - this.noFly > 240 && dist2(P.pos.x, P.pos.z, T.x, T.z) < 280 * 280) { this.noFly = G.time; this.say('天安门地区禁飞！那位机甲朋友请您落地，别往城楼上蹦——风筝都不让放，何况您', true); }
  },
  line() {
    const R = BJRules.rule(), L = BJRules.S.lot, pool = BJ_LINES.slice();
    const roads = ['二环', '三环', '长安街', '西直门桥', '国贸桥', '四惠桥', '中关村大街', '平安大街', '德胜门桥', '安定门外大街'];
    pool.push(`${pick(roads)}现在平均时速 ${randi(6, 14)} 公里，走着都比开车快`);
    if (R && R.kind === 'tail') pool.push(`今日${R.text}，7 点到 20 点。电子眼已经就位，心存侥幸的朋友您悠着点儿`);
    pool.push(L.on && !L.won ? `摇号提醒：您的阶梯数 ${BJRules.ladder()}，中签率 ${(BJRules.odds() * 100).toFixed(1)}%，每两个钟头开一期` : '小客车指标摇号：普通指标中签率千分之几，阶梯越高越好中——报了名才有阶梯');
    return pick(pool);
  },
  weather(e) {
    if (!G.started || !e) return;
    const k = e.kind, odd = BJRules.date().getDate() % 2 === 1, M = {
      smog: `重污染红色预警！即日起单双号限行：${odd ? '今天单号日，双号车别上路' : '今天双号日，单号车别上路'}，新能源车不限`,
      sand: '沙尘暴进京：能见度不足 200 米，电子眼照样拍得清，您可别心存侥幸',
      snow: '下雪了：二环变溜冰场，立交桥上别猛踩刹车。追尾了电子眼不管，保险公司管',
      rain: '暴雨预警：莲花桥、广渠门桥下积水，别往里扎——去年有辆车在那儿当了回潜水艇',
      clear: this.wasSmog ? '空气转好，单双号限行解除，恢复尾号限行' : '',
    };
    this.wasSmog = k === 'smog';
    if (M[k]) this.say(M[k], true);
  },
  rush(e) { if (G.started && e) this.say(e.on ? `${e.name || '高峰'}来了：二环、三环、长安街全线飘红，能坐地铁就坐地铁` : '高峰过去了，路面恢复……恢复成一般堵', true); },
};

/* ---------------- DOM: HUD chip, ticker, 罚单短信, 「北京生活」 panel, 地铁 / 考试 modal ---------------- */
const BJ_CSS = `/* === beijing === */
#bj-hud{display:grid;justify-items:end;gap:3px}
#bj-hud.float{position:absolute;right:calc(16px + var(--safe-r));top:calc(52px + var(--safe-t))}
#bj-chip,#bj-car{display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.62);border:1px solid var(--panel-edge);border-radius:3px;padding:3px 8px;font:800 12px/1.25 var(--cn);white-space:nowrap;text-shadow:none}
#bj-chip b{color:var(--gold)}#bj-chip .no{color:#ff8d95}#bj-chip .dim{color:#9aa3ad}
#bj-car.bad{background:rgba(150,18,28,.82);border-color:#ff8d95;animation:pulse .6s infinite alternate}
#bj-car.bike{border-color:#ffc400;color:#ffe38a}
#bj-radio{position:absolute;left:calc(32px + min(380px,44vw) + var(--safe-l));right:calc(150px + var(--safe-r));top:calc(12px + var(--safe-t));width:fit-content;margin-inline:auto;transform:translateY(-8px);opacity:0;transition:opacity .35s,transform .35s,top .3s;display:flex;align-items:stretch;max-width:560px;background:rgba(10,14,22,.88);border:1px solid rgba(121,215,255,.45);border-radius:3px;overflow:hidden}
#bj-radio.show{opacity:1;transform:none}
#bj-radio.low{top:calc(70px + var(--safe-t))}
#bj-radio b{flex:none;background:#1d6fe0;color:#fff;font:900 11.5px/1.2 var(--cn);padding:6px 8px;display:flex;align-items:center;white-space:nowrap}
#bj-radio span{flex:1;min-width:0;font:700 13px/1.45 var(--cn);padding:5px 10px;color:#e8f4ff}
#bj-sms{position:absolute;right:calc(16px + var(--safe-r));top:44%;width:min(300px,78vw);background:#f7f7f2;color:#15171b;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);padding:9px 12px 10px;transform:translateX(130%);visibility:hidden;transition:transform .35s cubic-bezier(.2,1.2,.4,1),visibility 0s .35s;font:600 12.5px/1.5 var(--cn)}
#bj-sms.show{transform:none;visibility:visible;transition:transform .35s cubic-bezier(.2,1.2,.4,1)}
#bj-sms .h{display:flex;justify-content:space-between;gap:8px;font:900 12px/1 var(--cn);color:#1d4ed8;margin-bottom:6px}
#bj-sms .h i{font-style:normal;color:#666;font-weight:700}
#bj-sms .m{font:900 16px/1.3 var(--cn);color:#b91c1c;margin-top:4px}
#bj-sms .f{font:700 11.5px/1.4 var(--cn);color:#555}
#bj-prompt{position:absolute;left:50%;bottom:calc(96px + var(--safe-b));transform:translateX(-50%);font:800 13px/1.5 var(--cn);background:rgba(10,40,100,.8);border:1px solid rgba(121,215,255,.6);padding:5px 12px;border-radius:3px;white-space:nowrap}
#bj-flash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:6}
#hud.dim #bj-radio,#hud.dim #bj-prompt,body.cine #bj-radio,body.cine #bj-sms,body.cine #bj-prompt{opacity:0!important}
#bj-panel .sheet{width:min(1060px,100%)}
#bj-panel .pbody{overflow:auto;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px;-webkit-overflow-scrolling:touch;align-items:start}
.bj-sub{font:700 12px/1 var(--cn);color:var(--muted);white-space:nowrap}
.bj-card{background:#171b22;border:1px solid #2a2f38;border-radius:5px;padding:10px 12px}
.bj-card h4{margin:0 0 6px;font:900 15px/1.3 var(--cn);color:var(--gold);display:flex;justify-content:space-between;align-items:center;gap:8px}
.bj-card h4 small{color:var(--muted);font:700 12px/1.2 var(--cn)}
.bj-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font:600 13px/1.55 var(--cn)}
.bj-row>span{color:var(--muted)}.bj-row>span small{display:block;font-size:11px;line-height:1.3;color:#7c8591}
.bj-row>b{text-align:right;white-space:nowrap}.bj-row>b.neg{color:#ff8d95}
.bj-big{font:900 21px/1.25 var(--cn);margin:2px 0 6px}
.bj-tag{display:inline-block;padding:2px 7px;border-radius:3px;font:900 12px/1.35 var(--cn);background:#2a2f38;color:#e5e7eb;white-space:nowrap}
.bj-tag.red{background:#b91c1c;color:#fff}.bj-tag.green{background:#15803d;color:#fff}.bj-tag.gold{background:var(--gold);color:#111}.bj-tag.blue{background:#1d4ed8;color:#fff}
.bj-btn{margin:7px 6px 0 0;background:#232833;border:1px solid #3a414d;border-radius:4px;padding:7px 11px;font:800 13px/1.25 var(--cn);color:#f1ece2}
.bj-btn.primary{background:var(--gold);color:#111;border-color:var(--gold)}
.bj-btn:disabled{opacity:.42;cursor:default}
.bj-pts{display:flex;gap:3px;margin:4px 0 6px}.bj-pts i{flex:1;height:10px;background:#3a414d;border-radius:2px}.bj-pts i.on{background:#4ade80}.bj-pts.warn i.on{background:#f59e0b}.bj-pts.bad i.on{background:#ef4444}
.bj-bar{height:10px;background:#2a2f38;border-radius:5px;position:relative;margin:8px 0 3px}.bj-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#f59e0b,#ffc940)}.bj-bar i.ok{background:linear-gradient(90deg,#16a34a,#4ade80)}.bj-bar s{position:absolute;top:-3px;bottom:-3px;width:2px;background:#fff;box-shadow:0 0 0 1px #000}
.bj-log{margin:6px 0 0;padding:0;list-style:none;font:600 12px/1.5 var(--cn);color:#d7d2c8;max-height:132px;overflow:auto}
.bj-log li{border-top:1px dashed #2a2f38;padding:3px 0}.bj-log li b{color:#ff8d95}
.bj-line{display:inline-grid;place-items:center;min-width:18px;height:17px;padding:0 3px;border-radius:3px;font:900 11px/1 var(--cn);font-style:normal;color:#fff;margin-right:3px;vertical-align:1px}
.bj-note{font:600 12px/1.55 var(--cn);color:#9aa3ad;margin:6px 0 0}
#bj-modal .sheet{width:min(560px,100%)}
#bj-modal .pbody{overflow:auto;padding:10px 14px 14px;-webkit-overflow-scrolling:touch}
.bj-belt{position:relative;height:118px;background:#0f1218;border:1px solid #2a2f38;border-radius:6px;overflow:hidden;margin:8px 0 10px}
.bj-belt .track{position:absolute;left:0;right:0;bottom:16px;height:14px;background:repeating-linear-gradient(90deg,#30353f 0 14px,#23272f 14px 28px);animation:bjbelt .5s linear infinite}
@keyframes bjbelt{to{background-position:28px 0}}
.bj-belt .arch{position:absolute;left:38%;width:24%;top:8px;bottom:14px;border:5px solid #8a93a0;border-bottom:0;border-radius:10px 10px 0 0;background:rgba(40,120,255,.12);z-index:2}
.bj-belt .bag{position:absolute;bottom:30px;left:-80px;width:66px;height:42px;background:#394150;border:2px solid #0b0d11;border-radius:9px 9px 4px 4px;transition:left 1.55s linear}
.bj-belt .bag::before{content:"";position:absolute;left:18px;top:-11px;width:24px;height:11px;border:3px solid #0b0d11;border-bottom:0;border-radius:9px 9px 0 0}
.bj-belt.go .bag{left:calc(100% + 16px)}
.bj-xray{display:flex;gap:6px;flex-wrap:wrap;min-height:28px}
.bj-xray i{font-style:normal;padding:2px 8px;border-radius:3px;background:#12324f;color:#9fd8ff;font:800 12px/1.7 var(--cn);opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s}
.bj-xray i.on{opacity:1;transform:none}.bj-xray i.bad{background:#7f1d1d;color:#fecaca}
.bj-verdict{font:900 16px/1.45 var(--cn);margin:10px 0 2px}.bj-verdict.bad{color:#ff8d95}.bj-verdict.ok{color:#8fdc5f}
.bj-tabs{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}
.bj-tabs button{background:#232833;border:1px solid #3a414d;border-radius:14px;padding:5px 11px;font:800 12px/1.2 var(--cn)}
.bj-tabs button.on{background:var(--gold);color:#111;border-color:var(--gold)}
.bj-st{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.bj-st button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;background:#171b22;border:1px solid #2a2f38;border-radius:4px;padding:9px 10px;font:700 14px/1.3 var(--cn)}
.bj-st button:hover,.bj-st button:focus-visible{border-color:var(--gold)}
.bj-st small{margin-left:4px;font:800 11px/1 var(--cn);color:#fbbf24}
.bj-st em{font-style:normal;color:#8fdc5f;font:800 13px/1 var(--cn);white-space:nowrap}
.bj-q .bj-btn{display:block;width:100%;text-align:left;margin:7px 0 0}
.bj-qt{font:900 17px/1.45 var(--cn);margin:6px 0 4px}
/* phones: the ticker + SMS stack in #hudT (under the mission card upright, top-centre sideways), the 进站 prompt in #hudB (head.html) */
body.touch #bj-radio b{font-size:11px;padding:4px 6px}
@media (orientation:portrait){body.touch #bj-radio{flex-direction:column}body.touch #bj-radio b{padding:3px 8px}body.touch #bj-radio b br{display:none}}body.touch #bj-radio span{font-size:12px;line-height:1.4;padding:4px 8px}
body.touch #bj-radio,body.touch #bj-sms{visibility:visible;transition:none}
body.touch #bj-sms{width:min(280px,100%);box-sizing:border-box;text-align:left}
body.touch #bj-prompt{white-space:normal}
body.touch #bj-car{max-width:44vw;white-space:normal;text-align:right;font-size:11px}
body.touch .bj-btn,body.touch .bj-tabs button,body.touch .bj-st button{min-height:44px}
@media (max-width:760px){#bj-radio{max-width:92vw}#bj-panel .pbody{grid-template-columns:1fr}}
`;
const BJUI = {
  open: null, panel: null, modalEl: null, t: 0, smsT: 0, pollI: 0, last: {}, qs: null, qi: 0,
  init() {
    const st = document.createElement('style'); st.id = 'bj-css'; st.textContent = BJ_CSS; document.head.appendChild(st);
    const hud = $('hud');
    const mk = (id, html, parent = hud, cls = '') => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
    const box = document.createElement('div'); box.id = 'bj-hud';
    box.innerHTML = '<div id="bj-chip"><b id="bj-day"></b><span id="bj-rule"></span></div><div id="bj-car" hidden></div>';
    const clk = $('sa-clock'); if (clk && clk.parentNode) clk.insertAdjacentElement('afterend', box); else { box.classList.add('float'); hud.appendChild(box); }
    // phones stack these with the rest of the HUD text (head.html #hudT / #hudB have no box of their own on desktop)
    const hT = $('hudT') || hud, hB = $('hudB') || hud;
    mk('bj-radio', `<b>${IS_TOUCH ? '交通台<br> FM88.8' : '京城交通台 FM88.8'}</b><span id="bj-radio-t"></span>`, hT);
    mk('bj-sms', '', hT);
    hB.insertBefore(mk('bj-prompt', '', hB), $('subtitle') && $('subtitle').parentNode === hB ? $('subtitle') : null).hidden = true;
    mk('bj-flash', '', document.body);
    const btns = $('hud-btns'), b = document.createElement('button');
    b.type = 'button'; b.id = 'btn-bj'; b.textContent = IS_TOUCH ? '北京' : '北京 (B)';
    b.addEventListener('click', () => { Sfx.click(); if (this.open) this.hide(); else this.openPanel(); });
    if (btns) btns.insertBefore(b, btns.children[1] || null);
    const ov = (id) => {
      const o = mk(id, '<div class="sheet"><header><h3></h3><span class="bj-sub"></span><button class="x" type="button" data-a="close">关闭</button></header><div class="pbody"></div></div>', document.body, 'overlay');
      o.hidden = true; o.addEventListener('click', (e) => this.click(e)); return o;
    };
    this.panel = ov('bj-panel'); this.modalEl = ov('bj-modal');
    this.panel.querySelector('.x').textContent = IS_TOUCH ? '关闭' : '关闭 (B)';
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.code !== 'KeyB' || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if (this.open === 'panel') this.hide(); else if (!this.open) this.openPanel();
    });
  },
  canOpen() {
    return G.started && !G.paused && !G.over && !Cutscene.active && !UI.panelOpen && !UI.shopId && $('confirm').hidden && $('facepick').hidden &&
      !(typeof Gym !== 'undefined' && Gym.active) && Player.mode !== 'dead' && Player.mode !== 'xform';
  },
  // our sheets borrow UI.panelOpen: the main loop then freezes the world, and its Esc / Tab closes us too
  show(which) {
    this.open = which; UI.panelOpen = true; Input.lock = true; Input.clear();
    this.panel.hidden = which !== 'panel'; this.modalEl.hidden = which !== 'modal';
    clearInterval(this.pollI); this.pollI = setInterval(() => { if (this.open && !UI.panelOpen) this.hide(true); }, 100);
  },
  hide(ext) {
    if (!this.open) return;
    this.open = null; this.panel.hidden = true; this.modalEl.hidden = true; clearInterval(this.pollI);
    if (!ext) UI.panelOpen = false;
    Input.lock = !!(Cutscene.active || (typeof Gym !== 'undefined' && Gym.active));
  },
  openPanel() { if (!this.canOpen()) return; this.renderPanel(); this.show('panel'); },
  modal(title, html, sub = '') {
    const m = this.modalEl; m.querySelector('h3').textContent = title; m.querySelector('.bj-sub').textContent = sub; m.querySelector('.pbody').innerHTML = html;
    m.querySelector('.pbody').scrollTop = 0;
    if (this.open !== 'modal') { if (this.open) this.hide(); this.show('modal'); }
  },
  click(e) {
    const t = e.target.closest('[data-a]');
    if (!t) { if (e.target.classList.contains('overlay')) this.hide(); return; }
    if (t.disabled) return;
    Sfx.click();
    const a = t.dataset.a, i = t.dataset.i;
    guard('bj.act', () => this.act(a, i));
  },
  act(a, i) {
    const R = BJRules, re = () => { if (this.open === 'panel') this.renderPanel(); };
    switch (a) {
      case 'close': this.hide(); break;
      case 'permit': R.applyPermit(); re(); break;
      case 'juzhu': R.applyJuzhu(); re(); break;
      case 'hukou': R.applyHukou(); re(); break;
      case 'edu': R.buyEdu(); re(); break;
      case 'lot': R.enterLot(); re(); break;
      case 'ev': UI.toast(`新能源指标排队：您前面还有 ${randi(46, 72)} 万人，预计 ${2026 + randi(8, 13)} 年轮到您`, 3.4); break;
      case 'call': this.hide(); R.callCar(); break;
      case 'study': this.quizStart(); break;
      case 'ans': this.quizAnswer(+i); break;
      case 'unequip': BJSubway.unequip(); break;
      case 'tab': BJSubway.tab = i; BJSubway.picker(); break;
      case 'go': BJSubway.ride(R.stations[+i]); break;
      default: break;
    }
  },
  // ---- HUD ----
  set(k, el, prop, v) { if (el && this.last[k] !== v) { this.last[k] = v; el[prop] = v; } },
  update(rdt) {
    if (this.smsT > 0 && (this.smsT -= rdt) <= 0) $('bj-sms').classList.remove('show');
    if ((this.t -= rdt) > 0) return;
    this.t = 0.25;
    const R = BJRules, S = R.S, P = Player, rule = R.rule(), on = R.inHours(), d = R.date();
    this.set('day', $('bj-day'), 'textContent', `周${BJ_WD[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`);
    let rc = 'dim', rt = '不限行';
    if (rule) { rt = rule.short + (on ? '' : ' · 未生效'); rc = on ? '' : 'dim'; }
    const inCar = P.mode === 'car' && P.car && !P.car.removed, bike = inCar && P.car.k && P.car.k.bike;
    let ct = '', cc = '';
    if (inCar && bike && R.ride) { const m = Math.round((DayNight.clock - R.ride.t0 + 1440) % 1440); ct = `共享单车 · ${m} 分钟 · ¥${R.bikeFeeFor(m).toFixed(1)}`; cc = 'bike'; }
    else if (inCar && !bike) {
      const st = R.info(P.car);
      if (st.restricted) rc = 'no';
      const why = !st.bad ? '' : IS_TOUCH ? (st.revoked ? '' : st.noPermit ? ' · 无进京证' : ' · 限行') : ' · ' + R.why(st);
      ct = `${st.plate || '无牌'}${st.local ? '' : ' 外地'} · ${S.revoked ? '无证驾驶' : (IS_TOUCH ? '' : '驾照 ') + S.pts + ' 分'}${why}`; cc = st.bad ? 'bad' : '';
    }
    this.set('rule', $('bj-rule'), 'textContent', rt); this.set('ruleC', $('bj-rule'), 'className', rc);
    this.set('car', $('bj-car'), 'textContent', ct); this.set('carC', $('bj-car'), 'className', cc); this.set('carOn', $('bj-car'), 'hidden', !ct);
    const at = BJSubway.at, pr = at ? `${IS_TOUCH ? '「进站」' : 'F'} 进站 · ${at.name}站 · 安检 + 买票` : '';
    this.set('pr', $('bj-prompt'), 'textContent', pr); this.set('prOn', $('bj-prompt'), 'hidden', !pr);
    const nw = $('news'); if (nw) this.set('low', $('bj-radio'), 'className', ($('bj-radio').classList.contains('show') ? 'show ' : '') + (nw.classList.contains('show') ? 'low' : ''));
  },
  radio(text) {
    const el = $('bj-radio'); if (!el) return;
    if (text) $('bj-radio-t').textContent = text;
    el.classList.toggle('show', !!text); this.last.low = null;
  },
  sms(plate, where, name, fine, lost) {
    const S = BJRules.S, el = $('bj-sms'); if (!el) return;
    el.innerHTML = `<div class="h"><span>【北京交警】电子眼抓拍</span><i>${DayNight.timeText()}</i></div>您驾驶的 <b>${esc(plate)}</b> 在 <b>${esc(where)}</b> ${esc(name)}。<div class="m">罚款 ¥${fine.toLocaleString('en-US')}${lost ? ' · 记 ' + lost + ' 分' : ''}</div><div class="f">${S.revoked ? '驾照已吊销' : '驾照剩余 ' + S.pts + ' 分'} · 按 ${IS_TOUCH ? '「北京」' : 'B'} 查违章</div>`;
    el.classList.add('show'); this.smsT = 4.8;
  },
  flashScreen() {
    const f = $('bj-flash'); if (!f) return;
    f.style.transition = 'none'; f.style.opacity = '0.5'; void f.offsetWidth; f.style.transition = 'opacity .4s ease-out'; f.style.opacity = '0';
  },
  // ---- 「北京生活」 panel ----
  renderPanel() {
    const R = BJRules, S = R.S, P = Player, rule = R.rule(), on = R.inHours(), key = IS_TOUCH ? '「北京」' : 'B';
    this.panel.querySelector('h3').textContent = '北京生活';
    this.panel.querySelector('.bj-sub').textContent = `${R.dateText()} ${DayNight.timeText()} · 余额 ${fmtMoney(G.money)}`;
    const row = (k, v, note = '', cls = '') => `<div class="bj-row"><span>${k}${note ? `<small>${note}</small>` : ''}</span><b class="${cls}">${v}</b></div>`;
    const card = (t, sub, body) => `<section class="bj-card"><h4>${t}<small>${sub}</small></h4>${body}</section>`;
    const btn = (a, label, dis, pri) => `<button class="bj-btn${pri ? ' primary' : ''}" type="button" data-a="${a}"${dis ? ' disabled' : ''}>${label}</button>`;
    const cc = R.curCar(), driving = P.mode === 'car' && P.car && !(P.car.k && P.car.k.bike);
    let carInfo = '';
    if (cc) {
      const st = driving ? R.info(P.car) : null, tags = [];
      if (cc.green) tags.push('<span class="bj-tag green">新能源 不限行</span>'); else if (cc.taxi) tags.push('<span class="bj-tag">出租车 不限行</span>');
      if (st && st.restricted) tags.push('<span class="bj-tag red">今天限行</span>');
      if (!cc.local) tags.push(R.permitOk(cc.plate) ? '<span class="bj-tag blue">进京证有效</span>' : '<span class="bj-tag red">外地牌 无进京证</span>');
      carInfo = row(driving ? '正在开' : '上一辆车', `${esc(cc.plate)} · 尾号 ${cc.tail}`) + (tags.length ? `<div>${tags.join(' ')}</div>` : '');
    }
    const cards = [];
    cards.push(card('今天', R.dateText(), `<div class="bj-big">${rule ? esc(rule.text) : '周末不限行'}</div>
      ${row('时段', rule ? '7:00 – 20:00 ' + (on ? '<span class="bj-tag red">生效中</span>' : '<span class="bj-tag">没到点</span>') : '—')}
      ${row('不受限行', '新能源绿牌 · 出租车 · 单车')}${carInfo}${row('全城电子眼', R.cams.length + ' 个', '大路口的灯杆上，灰盒子带闪光灯')}
      <p class="bj-note">${rule && rule.kind === 'odd' ? '重污染红色预警：单双号限行，按日期单双号出行。' : '尾号每 13 周轮换一次，字母尾号按 0 算。外地车全天都要进京证。'}</p>`));
    const pts = S.revoked ? 0 : S.pts, pc = S.revoked || pts <= 3 ? 'bad' : pts <= 6 ? 'warn' : '';
    const log = S.log.length ? `<ul class="bj-log">${S.log.slice(0, 6).map((l) => `<li>${esc(l.t)} <b>${esc(l.n)}</b> · ${esc(l.p)} · ${esc(l.w)} · ¥${l.f}${l.s ? ' · −' + l.s + ' 分' : ''}</li>`).join('')}</ul>` : '<p class="bj-note">还没吃过罚单，保持住！</p>';
    cards.push(card('驾驶证', S.revoked ? '<span class="bj-tag red">已吊销</span>' : `${pts} / 12 分`,
      `<div class="bj-pts ${pc}">${Array.from({ length: 12 }, (_, k) => `<i class="${k < pts ? 'on' : ''}"></i>`).join('')}</div>
      ${row('记分周期', '还剩 ' + bjDur(BJ_YEAR - (S.mins % BJ_YEAR)), '到期没扣满就清零')}${row('违章 / 罚款', `${S.tix} 次 · ${fmtMoney(S.fines)}`)}
      ${S.revoked ? `<p class="bj-note">吊销了还开车 = 无证驾驶：每过一个电子眼罚 ¥2,000，法务部还会找上门。</p>${btn('study', '满分学习 + 科目一重考 · ¥200', G.money < 200, true)}` : ''}${log}`));
    let pb = '';
    if (!cc) pb = '<p class="bj-note">进京证跟着车走：开上一辆外地牌的车，再来这儿办。</p>';
    else if (cc.local) pb = row('当前车辆', `${esc(cc.plate)} · 京牌`) + '<p class="bj-note">京牌车不用办进京证。</p>';
    else if (R.permitOk(cc.plate)) pb = row(esc(cc.plate), `有效到 ${R.dateText(S.permits[cc.plate])}`);
    else pb = row(esc(cc.plate), '<span class="bj-tag red">没有进京证</span>') + btn('permit', `给 ${esc(cc.plate)} 办进京证（7 天）`, S.permitN >= 12, true);
    const act = Object.keys(S.permits).filter((p) => R.permitOk(p));
    cards.push(card('进京证', `今年 ${S.permitN} / 12 次`, pb + (act.length ? `<p class="bj-note">有效的：${act.map((p) => `${esc(p)}（到 ${R.dateText(S.permits[p])}）`).join('、')}</p>` : '') +
      '<p class="bj-note">外地牌没证进五环：电子眼一拍罚 ¥100 记 1 分，同一辆车 3 个钟头罚一次。</p>'));
    const pp = R.points(), cut = R.cutoff(), el = R.eduLevel(), top = Math.max(cut, pp.total) * 1.12;
    let hk = '';
    if (S.hukou === 2) hk = '<div class="bj-big"><span class="bj-tag gold">北京户口</span></div><p class="bj-note">户口本到手：商店消费返现 5% · 摇号中签率翻倍 · 胡同里的大爷大妈高看您一眼。</p>';
    else if (S.hukou === 1) hk = row('落户申请', `公示中 · 还剩 ${bjDur(S.hukouAt - S.mins)}`);
    else {
      hk = row('居住证', S.juzhu === 2 ? '<span class="bj-tag green">已办</span>' : S.juzhu === 1 ? `办理中 · 还剩 ${bjDur(S.juzhuAt - S.mins)}` : '<span class="bj-tag">没办</span>', '在京住满半年（政务口径）可以申领');
      if (!S.juzhu) hk += btn('juzhu', '去派出所申领居住证', false, true);
      hk += btn('hukou', pp.total >= cut ? '申请积分落户' : `申请积分落户（还差 ${bjPt(cut - pp.total)} 分）`, S.juzhu !== 2 || pp.total < cut, S.juzhu === 2 && pp.total >= cut);
    }
    const edu = el < 2 ? btn('edu', el === 0 ? '读个在职硕士（五道口职业技术学院）· ¥880,000' : '接着读博 · ¥2,880,000', G.money < (el === 0 ? 880000 : 2880000)) : '';
    cards.push(card('积分落户', `分数线 ${bjPt(cut)} 分`, `<div class="bj-big">${bjPt(pp.total)} 分</div>
      <div class="bj-bar"><i class="${pp.total >= cut ? 'ok' : ''}" style="width:${clamp(pp.total / top * 100, 0, 100).toFixed(1)}%"></i><s style="left:${(cut / top * 100).toFixed(1)}%"></s></div>
      ${pp.rows.map(([k, v, n]) => row(k, (v < 0 ? '' : '+') + bjPt(v), n, v < 0 ? 'neg' : '')).join('')}
      ${hk}${S.hukou === 2 ? '' : edu}<p class="bj-note">政务口径：游戏里 4 个钟头算一年社保，20 分钟算一个月。分数线每年都涨。</p>`));
    const L = S.lot;
    let lb = '';
    if (L.won) lb = `<div class="bj-big"><span class="bj-tag gold">已中签</span> ${esc(S.car ? S.car.plate : '')}</div>${row('摇了', L.draws + ' 期')}<p class="bj-note">车停在王府门口；扔远了代驾会开回去，烧了保险公司赔新的。</p>${btn('call', '叫代驾把车开到身边 · ¥200', G.money < 200 || P.mode !== 'human', true)}`;
    else if (L.on) lb = `${row('申请编码', L.code)}${row('阶梯数', R.ladder())}${row('中签率', (R.odds() * 100).toFixed(1) + '%', S.hukou === 2 ? '京籍翻倍' : '每没中一期，阶梯 +1')}${row('下一期', bjDur(BJ_DRAW - (S.mins % BJ_DRAW)) + ' 后开奖')}${L.last ? row('上一期', esc(L.last)) : ''}`;
    else lb = `<p class="bj-note">报名条件：北京户口，或者居住证 + 社保满 2 年。每两个钟头开一期，没中就攒阶梯。</p>${btn('lot', '报名普通指标摇号', !R.canLot(), R.canLot())}`;
    if (!L.won) lb += btn('ev', '新能源指标排队');
    cards.push(card('小客车指标摇号', L.won ? '京牌到手' : L.on ? `已摇 ${L.draws} 期` : '未报名', lb));
    cards.push(card('出行', '地铁 · 单车', `${row('坐地铁', S.rides + ' 次', '地铁口蓝色小亭子，走到跟前按 ' + (IS_TOUCH ? '「进站」' : 'F'))}${row('共享单车', `${S.bikeMin} 分钟 · ¥${S.bikeFee}`, '¥1.5 / 15 分钟，停进电子围栏（地铁口、单车堆）')}
      ${row('累计罚款', fmtMoney(S.fines))}${S.rebate ? row('京籍返现', fmtMoney(S.rebate)) : ''}<p class="bj-note">京城交通台 FM88.8 全天播报路况；关面板按 ${key} 或 Esc。</p>`));
    this.panel.querySelector('.pbody').innerHTML = cards.join('');
  },
  // ---- 满分学习: three questions, all right or pay again ----
  quizStart() {
    const S = BJRules.S; if (!S.revoked) return;
    if (G.money < 200) { UI.toast('学费 ¥200 都没有？先去挣点儿', 2); return; }
    G.addMoney(-200);
    this.qs = bjShuffle(BJ_QUIZ.slice()).slice(0, 3); this.qi = 0; this.quizQ();
  },
  quizQ() {
    const [q, a] = this.qs[this.qi];
    this.modal('满分学习 · 科目一重考', `<p class="bj-note">第 ${this.qi + 1} / 3 题 · 全答对才算过，学费不退</p><p class="bj-qt">${esc(q)}</p><div class="bj-q">${a.map((t, i) => `<button class="bj-btn" type="button" data-a="ans" data-i="${i}">${'ABC'[i]}. ${esc(t)}</button>`).join('')}</div>`, '车管所');
  },
  quizAnswer(i) {
    const [, a, ok] = this.qs[this.qi], S = BJRules.S;
    if (i !== ok) {
      Sfx.failed();
      this.modal('没考过', `<p class="bj-qt">正确答案：${esc(a[ok])}</p><p class="bj-note">回去把交规背熟了再来。学费？不退。</p><button class="bj-btn primary" type="button" data-a="close">回去背书</button>`, '车管所');
      return;
    }
    Sfx.blip(1.6);
    if (++this.qi < this.qs.length) { this.quizQ(); return; }
    S.revoked = false; S.pts = 12; BJRules.persist();
    this.hide(); UI.big('驾照拿回来了', '12 分满血复活 · 这回悠着点儿开', 'passed', 3); Sfx.passed();
  },
};

Object.assign(BJRules, { Subway: BJSubway, Radio: BJRadio, UI: BJUI }); // handles for the map / tests
Hooks.init(function bjInit() { BJRules.init(); });
Hooks.update(function bjUpdate(dt, rdt) { BJRules.update(dt, rdt); });
