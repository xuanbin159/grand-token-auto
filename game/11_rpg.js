/* ============================================================
   rpg: levels, SA-style stats, skill tree, specialisations,
   equipment (worn and visible), shop catalogue —
   everything funnels into RPG.m (modifiers)
   ============================================================ */
const BRANCHES = [
  { name: '拳脚', en: 'MELEE', color: '#ef4444' },
  { name: 'Token 经济学', en: 'ECONOMY', color: '#f5b400' },
  { name: '变形 · 载具', en: 'VEHICLE', color: '#3b82f6' },
  { name: '注意力', en: 'ATTENTION', color: '#a06bff' },
];
const SKILLS = [
  { id: 'fist', br: 0, tier: 1, name: '铁拳', max: 3, desc: (r) => `近战伤害 +${12 * r}%` },
  { id: 'body', br: 0, tier: 1, name: '金刚不坏', max: 3, desc: (r) => `血量与装甲上限 +${15 * r}%` },
  { id: 'combo', br: 0, tier: 2, name: '连击大师', max: 1, desc: () => '机器人连拳追加第 4 击「回旋锤」' },
  { id: 'quake', br: 0, tier: 2, name: '震地', max: 2, desc: (r) => `砸地范围 +${20 * r}%，消耗 −${20 * r}K Token` },
  { id: 'unstop', br: 0, tier: 3, name: '霸体', max: 1, desc: () => '出招时受到的伤害减半' },
  { id: 'coin', br: 1, tier: 1, name: '财神附体', max: 3, desc: (r) => `打人爆金币 +${30 * r}%，爆出金元宝的几率 +${4 * r}%` },
  { id: 'frugal', br: 1, tier: 1, name: '省流', max: 3, desc: (r) => `变身后 Token 消耗 −${12 * r}%` },
  { id: 'magnet', br: 1, tier: 1, name: '吸金大法', max: 2, desc: (r) => `吸 Token / 金币范围 +${50 * r}%，Token 价值 +${10 * r}%` },
  { id: 'ctx', br: 1, tier: 2, name: '上下文扩容', max: 2, desc: (r) => `上下文上限 +${(0.5 * r).toFixed(1)}M` },
  { id: 'cache', br: 1, tier: 2, name: '缓存命中', max: 2, desc: (r) => `砸地 / 光束有 ${15 * r}% 几率不耗 Token` },
  { id: 'interest', br: 1, tier: 3, name: '复利', max: 1, desc: () => '击败敌人返还 30K Token，拆楼估值 +50%' },
  { id: 'nitro', br: 2, tier: 1, name: '氮气加速', max: 2, desc: (r) => `卡车极速 +${15 * r}%，氮气消耗 −${30 * r}%` },
  { id: 'driver', br: 2, tier: 1, name: '老司机', max: 2, desc: (r) => `车辆操控 +${10 * r}%，车辆受损 −${25 * r}%` },
  { id: 'ram', br: 2, tier: 2, name: '重型撞角', max: 2, desc: (r) => `卡车撞击伤害 +${40 * r}%` },
  { id: 'throw', br: 2, tier: 2, name: '投掷臂', max: 2, desc: (r) => `扔车伤害 +${35 * r}%，爆炸范围 +${15 * r}%` },
  { id: 'instant', br: 2, tier: 3, name: '瞬间变形', max: 1, desc: () => '机器人与卡车瞬间切换，并放出冲击波' },
  { id: 'flash', br: 3, tier: 1, name: 'Flash Attention', max: 3, desc: (r) => `光束消耗 −${15 * r}%` },
  { id: 'longctx', br: 3, tier: 1, name: '长上下文', max: 2, desc: (r) => `光束射程 +${25 * r}%` },
  { id: 'multi', br: 3, tier: 2, name: '多头注意力', max: 1, desc: () => '光束分裂成 3 道' },
  { id: 'temp0', br: 3, tier: 2, name: 'Temperature 0', max: 2, desc: (r) => `光束伤害 +${25 * r}%` },
  { id: 'fullattn', br: 3, tier: 3, name: '全注意力', max: 1, desc: () => '光束贯穿所有目标' },
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
const SPECS = [
  { id: 'brawler', name: '擎天拳圣', color: '#ef4444', passive: '近战伤害 +25%，每次命中回复 5K Token', ult: '千问千拳', ultDesc: '3 秒疯狂连拳，每一拳都带冲击波' },
  { id: 'alchemist', name: 'Token 炼金术士', color: '#f5b400', passive: 'Token 消耗 −25%，敌人掉落 Token 与金币翻倍', ult: 'Token 暴雨', ultDesc: '天降 Token 雨，并回复一半血量与装甲' },
  { id: 'mage', name: '注意力法师', color: '#a06bff', passive: '光束消耗 −30%，伤害 +20%', ult: '全局注意力', ultDesc: '360° 光束横扫，附近一切都吃满伤害' },
  { id: 'knight', name: '暗夜骑士', color: '#94a3b8', passive: '装甲 +50%，卡车撞击 +50%', ult: '侠影降临', ultDesc: '召唤 bug 群——是时候让敌人也尝尝你的恐惧' },
];

/* ---- equipment: everything you buy shows up on you (and a few things on the robot too) ---- */
const SLOTS = { head: '帽子', face: '眼镜', neck: '脖子', back: '背上', hand: '手上', wrist: '手腕', feet: '鞋' };
const EQUIP = {
  // 帽子
  cap: { slot: 'head', name: '红色鸭舌帽', price: 18000, desc: '潮！冲刺速度 +8%', m: { sprint: 0.08 } },
  leifeng: { slot: 'head', name: '雷锋帽', price: 36000, desc: '护耳朵，也护命：血量上限 +12%', m: { hp: 0.12 } },
  guapi: { slot: 'head', name: '瓜皮帽', price: 28000, desc: '老理儿都在里头：经验 +15%', m: { xp: 0.15 } },
  hardhat: { slot: 'head', name: '安全帽', price: 15000, desc: '工地同款：受到伤害 −10%', m: { armor: 0.1 } },
  straw: { slot: 'head', name: '草帽', price: 8000, desc: '往胡同里一钻，谁也认不出：通缉消退 +40%', m: { heat: 0.4 } },
  // 眼镜
  shades: { slot: 'face', name: '墨镜', price: 22000, desc: '低调：通缉消退 +30%', m: { heat: 0.3 } },
  hama: { slot: 'face', name: '蛤蟆镜', price: 40000, desc: '八十年代顶配：爆金币 +15%', m: { coin: 0.15 } },
  goldrim: { slot: 'face', name: '金丝眼镜', price: 66000, desc: '斯文人：拆楼估值 +15%', m: { val: 0.15 } },
  vr: { slot: 'face', name: 'VR 眼镜', price: 88000, desc: '看得更远：光束伤害 +12%', m: { beam: 0.12 } },
  // 脖子
  chain: { slot: 'neck', name: '大金链子', price: 288000, desc: '爆金币 +30%，路人见了绕着走（变身后也戴着）', m: { coin: 0.3 } },
  scarf: { slot: 'neck', name: '红围巾', price: 12000, desc: '暖和：耐力 +20%', m: { stamina: 0.2 } },
  badge: { slot: 'neck', name: 'P8 工牌', price: 5000, desc: '有工牌就有底气：经验 +8%', m: { xp: 0.08 } },
  // 背上
  backpack: { slot: 'back', name: '双肩包', price: 26000, desc: '能装：吸 Token / 金币范围 +30%', m: { magnet: 0.3 } },
  delivery: { slot: 'back', name: '外卖箱', price: 9900, desc: '三十分钟必达：移动速度 +10%', m: { speed: 0.1 } },
  gpupack: { slot: 'back', name: '显卡背包', price: 120000, desc: '背着 RGB 走：Token 消耗 −8%', m: { drain: 0.08 } },
  // 手上
  brick: { slot: 'hand', name: '板砖', price: 2000, desc: '胡同一绝：人形近战 +60%', m: { melee: 0.6 } },
  rollpin: { slot: 'hand', name: '擀面杖', price: 3500, desc: '人形近战 +40%，击退 +50%', m: { melee: 0.4, knock: 0.5 } },
  wrench: { slot: 'hand', name: '大扳手', price: 12000, desc: '人形近战 +70%，砸车伤害翻倍', m: { melee: 0.7, car: 1 } },
  keyboard: { slot: 'hand', name: '机械键盘', price: 30000, desc: '青轴巨响：人形近战 +80%', m: { melee: 0.8 } },
  birdcage: { slot: 'hand', name: '鸟笼', price: 58000, desc: '遛鸟的大爷谁敢惹：爆金币 +20%', m: { coin: 0.2 } },
  fan: { slot: 'hand', name: '折扇', price: 16000, desc: '文化人：经验 +10%', m: { xp: 0.1 } },
  walnut: { slot: 'hand', name: '文玩核桃', price: 66000, desc: '盘出包浆：耐力 +25%，血量回复 +30%', m: { stamina: 0.25, regen: 0.3 } },
  hulu: { slot: 'hand', name: '冰糖葫芦', price: 800, desc: '边走边吃：血量回复 +50%', m: { regen: 0.5 } },
  // 手腕
  pixiu: { slot: 'wrist', name: '貔貅手串', price: 188000, desc: '只进不出：爆金币 +50%', m: { coin: 0.5 } },
  watch: { slot: 'wrist', name: '智能手表', price: 3999, desc: '记步：冲刺耐力 +15%', m: { stamina: 0.15 } },
  // 鞋
  bushoe: { slot: 'feet', name: '千层底布鞋', price: 6800, desc: '跟脚：移动速度 +8%，耐力 +10%', m: { speed: 0.08, stamina: 0.1 } },
  huili: { slot: 'feet', name: '回利球鞋', price: 399, desc: '国货之光：冲刺速度 +10%', m: { sprint: 0.1 } },
  aj: { slot: 'feet', name: '气垫球鞋', price: 12999, desc: '跳得高：跳跃 +35%，速度 +5%', m: { jump: 0.35, speed: 0.05 } },
  flipflop: { slot: 'feet', name: '人字拖', price: 59, desc: '穿拖鞋的都是大佬：速度 −5%，爆金币 +10%', m: { speed: -0.05, coin: 0.1 } },
};
const OUTFIT_BONUS = { batsuit: { all: 0.1 }, tangzhuang: { coin: 0.1 }, delivery: { speed: 0.08 }, laotou: { regen: 0.5 }, tracksuit: { stamina: 0.15 } };
const eq = (id) => Object.assign({ id, equip: id }, EQUIP[id]);
const SHOPS = {
  snack: {
    title: '护锅寺小吃 · 南锣鼓巷', greet: '来了您呐！里边儿请，豆汁儿刚熬好！', clerk: 'clerk',
    items: [
      { id: 'douzhi', name: '豆汁儿 + 焦圈', desc: '血量 +40（喝完一脸嫌弃）', price: 1200, consumable: true, use: () => { Player.heal(40); Bubble.say(Player, '……这味儿，倍儿正！', 1.8, 'me'); } },
      { id: 'luzhu', name: '卤煮火烧', desc: '血量回满', price: 4500, consumable: true, use: () => Player.heal(9999) },
      { id: 'zhajiang', name: '老北京炸酱面', desc: '血量 +60，60 秒内近战 +20%', price: 3800, consumable: true, use: () => { Player.heal(60); Buffs.add('zhajiang', 60); } },
      { id: 'lvdagun', name: '驴打滚', desc: '耐力回满', price: 1500, consumable: true, use: () => { Player.stamina = 100; } },
      { id: 'bingyang', name: '北冰漾汽水', desc: '耐力回满，90 秒内冲刺不累', price: 2500, consumable: true, use: () => { Player.stamina = 100; Player.coffeeT = 90; } },
      { id: 'protein', name: '胡同蛋白粉', desc: '肌肉 +25', price: 12000, consumable: true, use: () => RPG.train('muscle', 25) },
      { id: 'tokpack', name: 'Token 快充包', desc: 'Token +500K', price: 60000, consumable: true, use: () => Player.addTokens(500000) },
      eq('hulu'),
    ],
  },
  electronics: {
    title: '海量电子城 · 中关村', greet: '哥们儿，5090 刚到货，看看？正经行货！', clerk: 'clerk',
    items: [eq('keyboard'),
      { id: 'ctxcard', name: '上下文扩容卡', desc: '上下文上限 +0.25M（最多 4 张，机器人胸口会亮）', price: 400000, max: 4 },
      { id: 'cooler', name: '液冷散热器', desc: '变身 Token 消耗 −10%（最多 3 个，战甲手臂走蓝光水管）', price: 600000, max: 3 },
      { id: 'rtx', name: '4×5090 旗舰套装', desc: 'Token 消耗 −20%，光束伤害 +20%（战甲背上一台 RGB 主机）', price: 3000000, max: 1 },
      eq('vr'), eq('gpupack'), eq('watch')],
  },
  lab: {
    title: 'Kodex 应用科学部', greet: '随便看，都是给军方做的，人家嫌贵。', clerk: 'kodex',
    items: [
      { id: 'plate1', name: '战甲镀层 I', desc: '装甲上限 +25%（肩甲）', price: 200000, max: 1 },
      { id: 'plate2', name: '战甲镀层 II', desc: '装甲上限再 +25%（护胫）', price: 600000, max: 1, req: 'plate1' },
      { id: 'plate3', name: '战甲镀层 III', desc: '装甲上限再 +25%（全身重甲）', price: 1500000, max: 1, req: 'plate2' },
      { id: 'reactive', name: '反应装甲', desc: '受到的所有伤害 −15%（胸口六边形发光板）', price: 900000, max: 1 },
      { id: 'nos', name: '氮气罐', desc: '卡车氮气更猛、更省（背后两根排气管）', price: 350000, max: 1 },
      { id: 'lens', name: '光束聚焦器', desc: '光束伤害 +15%（头盔加一道青色目镜）', price: 500000, max: 1 },
      { id: 'paint:knight', name: '涂装 · 暗夜黑金', desc: '黑金配色（有黑色款）', price: 250000, paint: 'knight' },
      { id: 'paint:bee', name: '涂装 · 警戒黄黑', desc: '黄黑配色', price: 250000, paint: 'bee' },
      { id: 'paint:aurora', name: '涂装 · 极光白', desc: '白色配色', price: 300000, paint: 'aurora' },
      { id: 'paint:neon', name: '涂装 · 赛博霓虹', desc: '夜里最骚的那台', price: 450000, paint: 'neon' },
      { id: 'paint:jingju', name: '涂装 · 京剧脸谱', desc: '红黑金，戏台上的关公', price: 520000, paint: 'jingju' },
      { id: 'paint:classic', name: '涂装 · 经典红蓝', desc: '出厂配色', price: 0, paint: 'classic' },
    ],
  },
  clothes: {
    title: '西单袖水服装城', greet: '您穿这身儿，倍儿精神！', clerk: 'clerk',
    items: [
      { id: 'outfit:tee', name: OUTFITS.tee.name, desc: '原配的那件', price: 0, outfit: 'tee' },
      { id: 'outfit:plaid', name: OUTFITS.plaid.name, desc: '穿上它，bug 自动减少 3%', price: 20000, outfit: 'plaid' },
      { id: 'outfit:hoodie', name: OUTFITS.hoodie.name, desc: '加班标配', price: 30000, outfit: 'hoodie' },
      { id: 'outfit:laotou', name: OUTFITS.laotou.name, desc: '胡同大爷夏季限定：血量回复 +50%', price: 3000, outfit: 'laotou' },
      { id: 'outfit:tracksuit', name: OUTFITS.tracksuit.name, desc: '青春回来了：耐力 +15%', price: 8000, outfit: 'tracksuit' },
      { id: 'outfit:delivery', name: OUTFITS.delivery.name, desc: '跑单王：移动速度 +8%', price: 6600, outfit: 'delivery' },
      { id: 'outfit:tangzhuang', name: OUTFITS.tangzhuang.name, desc: '过年穿：爆金币 +10%', price: 68000, outfit: 'tangzhuang' },
      { id: 'outfit:suit', name: OUTFITS.suit.name, desc: '白天是富家少爷', price: 120000, outfit: 'suit' },
      { id: 'outfit:batsuit', name: OUTFITS.batsuit.name, desc: '黑金战衣 + 披风，全属性 +10%', price: 800000, outfit: 'batsuit' },
    ],
  },
  dept: {
    title: '王府景百货大楼', greet: '欢迎光临！帽子眼镜包，楼上楼下随便挑。', clerk: 'clerk',
    items: [eq('cap'), eq('leifeng'), eq('guapi'), eq('straw'), eq('shades'), eq('hama'), eq('goldrim'), eq('scarf'), eq('badge'), eq('backpack'), eq('delivery')],
  },
  antique: {
    title: '琉璃厂 · 容错斋', greet: '您掌掌眼，这可都是开过光的。', clerk: 'shopkeeper',
    items: [eq('chain'), eq('pixiu'), eq('walnut'), eq('birdcage'), eq('fan')],
  },
  shoes: {
    title: '内联胜布鞋', greet: '头戴马聚圆，脚踩内联胜——您来着了！', clerk: 'clerk',
    items: [eq('bushoe'), eq('huili'), eq('aj'), eq('flipflop')],
  },
  pharmacy: {
    title: '同 Token 堂', greet: '炮制虽繁必不敢省人工，品味虽贵必不敢减物力。', clerk: 'doctor',
    items: [
      { id: 'angong', name: '安宫牛黄丸', desc: '血量回满，60 秒内受到伤害 −30%', price: 18000, consumable: true, use: () => { Player.heal(9999); Buffs.add('angong', 60); } },
      { id: 'liuwei', name: '六味地黄丸', desc: '耐力回满，120 秒内冲刺不累', price: 6000, consumable: true, use: () => { Player.stamina = 100; Player.coffeeT = 120; } },
      { id: 'banlan', name: '板蓝根', desc: '解毒，90 秒内不怕幻觉毒气', price: 3000, consumable: true, use: () => { Player.poison = 0; Buffs.add('banlan', 90); } },
      { id: 'dieda', name: '跌打酒', desc: '血量 +70，装甲 +120', price: 5000, consumable: true, use: () => { Player.heal(70); Player.rhp = Math.min(RPG.m.maxArmor, Player.rhp + 120); } },
      { id: 'dali', name: '大力丸', desc: '60 秒内近战 +40%', price: 9000, consumable: true, use: () => Buffs.add('dali', 60) },
    ],
  },
  duck: {
    title: '权重德烤鸭', greet: '您几位？里边请——烤鸭一只，片好了给您端上来！', clerk: 'clerk',
    items: [
      { id: 'duckset', name: '烤鸭套餐', desc: '血量回满；2 分钟内近战 +25%、经验 +20%', price: 16800, consumable: true, use: () => { Player.heal(9999); Buffs.add('duck', 120); } },
      { id: 'duckbone', name: '鸭架汤', desc: '血量 +50', price: 2800, consumable: true, use: () => Player.heal(50) },
      { id: 'erguotou', name: '二锅头', desc: '醉拳：30 秒内近战 +50%，受伤 −20%，走路有点飘', price: 1800, consumable: true, use: () => Buffs.add('drunk', 30) },
    ],
  },
  hardware: {
    title: '老王五金', greet: '要啥有啥，板砖管够！', clerk: 'shopkeeper',
    items: [eq('brick'), eq('rollpin'), eq('wrench'), eq('hardhat')],
  },
  teahouse: {
    title: '天桥 · 得云社', greet: '您来得正好，下一场马上开演！', clerk: 'clerk',
    items: [
      { id: 'show', name: '听一段相声', desc: '乐呵乐呵：经验 +80，3 分钟内经验 +20%', price: 2000, consumable: true, use: () => { UI.closeShop(); Story.crosstalk(); } },
      { id: 'tea', name: '茉莉花茶', desc: '血量 +30，耐力回满', price: 800, consumable: true, use: () => { Player.heal(30); Player.stamina = 100; } },
    ],
  },
};
/* ---- timed buffs from food & medicine ---- */
const Buffs = {
  list: {},
  NAMES: { zhajiang: '炸酱面', angong: '安宫牛黄', banlan: '板蓝根', dali: '大力丸', duck: '烤鸭', drunk: '醉拳', laugh: '乐呵' },
  add(id, dur) { this.list[id] = Math.max(this.list[id] || 0, dur); RPG.recalc(); UI.toast(`获得状态：${this.NAMES[id] || id}（${Math.round(dur)} 秒）`, 2.2); },
  has(id) { return (this.list[id] || 0) > 0; },
  update(dt) {
    let changed = false;
    for (const k in this.list) { this.list[k] -= dt; if (this.list[k] <= 0) { delete this.list[k]; changed = true; } }
    if (changed) RPG.recalc();
  },
};

const RPG = {
  level: 1, xp: 0, sp: 0, skills: {}, spec: null, ult: 0,
  stats: { stamina: 0, muscle: 0, driving: 0 }, owned: {}, outfit: 'tee', outfits: { tee: true }, paint: 'classic', paints: { classic: true },
  equip: { head: null, face: null, neck: null, back: null, hand: null, wrist: null, feet: null },
  bonusCap: 0, m: {},
  xpNext(L) { return Math.round(220 + 170 * Math.pow(L - 1, 1.35)); },
  gainXP(n) {
    if (!n || !G.started) return;
    n = Math.round(n * (this.m.xpMul || 1));
    this.xp += n;
    let lv = false;
    while (this.xp >= this.xpNext(this.level) && this.level < 30) { this.xp -= this.xpNext(this.level); this.level++; this.sp++; lv = true; }
    if (lv) {
      this.recalc(); Player.hp = this.m.maxHp; Player.rhp = this.m.maxArmor;
      UI.levelUp(this.level); Sfx.levelUp();
      if (this.level === 5 && !this.spec) UI.toast(`专精解锁了！${IS_TOUCH ? '点「角色」' : '按 Tab '}打开角色面板挑一个`, 5);
    }
  },
  rank(id) { return this.skills[id] || 0; },
  branchPts(br) { let n = 0; for (const s of SKILLS) if (s.br === br) n += this.rank(s.id); return n; },
  canLearn(id) {
    const S = SKILL_BY_ID[id];
    if (this.rank(id) >= S.max) return '已满级';
    if (S.tier === 2 && this.branchPts(S.br) < 2) return '该系需 2 点';
    if (S.tier === 3 && this.branchPts(S.br) < 5) return '该系需 5 点';
    if (this.sp < 1) return '没有技能点';
    return '';
  },
  learn(id) { if (this.canLearn(id)) return false; this.skills[id] = this.rank(id) + 1; this.sp--; this.recalc(); Sfx.stat(); return true; },
  respec() { let n = 0; for (const k in this.skills) n += this.skills[k]; this.skills = {}; this.sp += n; this.recalc(); },
  chooseSpec(id) { if (this.level < 5) return false; this.spec = id; this.ult = 0; this.recalc(); Sfx.levelUp(); return true; },
  charge(dmg) { if (this.spec && Player.isMech()) this.ult = Math.min(100, this.ult + dmg / 24); },
  train(stat, amount) {
    const before = this.stats[stat];
    this.stats[stat] = clamp(before + amount, 0, 1000);
    if (Math.floor(this.stats[stat] / 50) > Math.floor(before / 50)) {
      UI.stat({ stamina: '耐力提升', muscle: '肌肉提升', driving: '车技提升' }[stat]); Sfx.stat();
    }
    this.recalc();
  },
  owns(id) { return (this.owned[id] || 0) > 0; },
  count(id) { return this.owned[id] || 0; },
  // sum of an equipment / outfit modifier
  eqm(k) {
    let v = 0;
    for (const s in this.equip) { const id = this.equip[s]; if (id && EQUIP[id] && EQUIP[id].m[k]) v += EQUIP[id].m[k]; }
    const ob = OUTFIT_BONUS[this.outfit]; if (ob) v += (ob[k] || 0) + (k !== 'coin' && k !== 'heat' && ob.all ? 0 : 0);
    return v;
  },
  recalc() {
    const r = (id) => this.rank(id), sp = this.spec, bat = this.outfit === 'batsuit' ? 1.1 : 1, B = Buffs;
    const plates = this.count('plate1') + this.count('plate2') + this.count('plate3');
    const st = this.stats, e = (k) => this.eqm(k);
    const buffMelee = (B.has('zhajiang') ? 1.2 : 1) * (B.has('dali') ? 1.4 : 1) * (B.has('duck') ? 1.25 : 1) * (B.has('drunk') ? 1.5 : 1);
    this.m = {
      maxHp: Math.round((100 + 8 * (this.level - 1)) * (1 + 0.15 * r('body') + e('hp')) * bat),
      maxArmor: Math.round(450 * (1 + 0.15 * r('body')) * (1 + 0.25 * plates) * (sp === 'knight' ? 1.5 : 1) * bat),
      dmgTaken: (this.owns('reactive') ? 0.85 : 1) * (1 - e('armor')) * (B.has('angong') ? 0.7 : 1) * (B.has('drunk') ? 0.8 : 1),
      humanMelee: (1 + 0.12 * r('fist')) * (1 + st.muscle / 1000) * (1 + e('melee')) * (sp === 'brawler' ? 1.25 : 1) * bat * buffMelee,
      robotMelee: (1 + 0.12 * r('fist')) * (1 + st.muscle / 3300) * (sp === 'brawler' ? 1.25 : 1) * bat * buffMelee,
      knock: 1 + e('knock'), carSmash: 1 + e('car'),
      combo4: r('combo') > 0, unstop: r('unstop') > 0,
      slamR: 1 + 0.2 * r('quake'), slamCost: 60000 - 20000 * r('quake'),
      drain: (1 - 0.12 * r('frugal')) * (1 - 0.1 * this.count('cooler')) * (this.owns('rtx') ? 0.8 : 1) * (sp === 'alchemist' ? 0.75 : 1) * (1 - e('drain')),
      magnet: (1 + 0.5 * r('magnet')) * (1 + e('magnet')), tokenValue: 1 + 0.1 * r('magnet'),
      capacity: CAP + 500000 * r('ctx') + 250000 * this.count('ctxcard') + this.bonusCap,
      cache: 0.15 * r('cache'), interest: r('interest') > 0, valuation: (r('interest') > 0 ? 1.5 : 1) * (1 + e('val')),
      truckSpeed: 1 + 0.15 * r('nitro'), boostCost: (1 - 0.3 * r('nitro')) * (this.owns('nos') ? 0.7 : 1), boostMul: this.owns('nos') ? 1.7 : 1.5,
      grip: 1 + 0.1 * r('driver') + st.driving / 3300, carDmg: 1 - 0.25 * r('driver'),
      ram: (1 + 0.4 * r('ram')) * (sp === 'knight' ? 1.5 : 1), throwDmg: 1 + 0.35 * r('throw'), throwR: 1 + 0.15 * r('throw'),
      instant: r('instant') > 0,
      beamCost: (1 - 0.15 * r('flash')) * (sp === 'mage' ? 0.7 : 1), beamRange: 1 + 0.25 * r('longctx'),
      beamDmg: (1 + 0.25 * r('temp0')) * (this.owns('lens') ? 1.15 : 1) * (this.owns('rtx') ? 1.2 : 1) * (sp === 'mage' ? 1.2 : 1) * (1 + e('beam')),
      multi: r('multi') > 0, pierce: r('fullattn') > 0,
      drops: sp === 'alchemist' ? 2 : 1, brawlerHeal: sp === 'brawler',
      stamina: (1 + st.stamina / 600) * (1 + e('stamina')),
      // 爆金币: how much money flies out of the people you hit
      coinRate: (1 + 0.3 * r('coin') + e('coin')) * (sp === 'alchemist' ? 1.5 : 1), ingot: 0.03 + 0.04 * r('coin'),
      speed: 1 + e('speed'), sprint: 1 + e('sprint') + e('speed') * 0.5, jump: 1 + e('jump'),
      xpMul: (1 + e('xp')) * (B.has('duck') ? 1.2 : 1) * (B.has('laugh') ? 1.2 : 1), heatDecay: 1 + e('heat'), regen: 1 + e('regen'),
    };
    if (Player.hp > this.m.maxHp) Player.hp = this.m.maxHp;
    if (Player.rhp > this.m.maxArmor) Player.rhp = this.m.maxArmor;
  },
  // buying: returns '' on success, 'equip' when it only re-equips, or a reason
  buy(item) {
    if (item.req && !this.owns(item.req)) return '得先买「' + SHOPS.lab.items.find((i) => i.id === item.req).name + '」';
    if (item.equip) {
      if (this.owns(item.id)) { this.toggleEquip(item.id); return 'equip'; }
      if (G.money < item.price) return '钱不够，您呐';
      G.money -= item.price; G.stats.spent += item.price; this.owned[item.id] = 1;
      this.setEquip(item.id); Sfx.buy(); return '';
    }
    if (item.max && this.count(item.id) >= item.max) return '已经买满了';
    if (item.paint && this.paints[item.paint]) { this.setPaint(item.paint); return 'equip'; }
    if (item.outfit && this.outfits[item.outfit]) { this.setOutfit(item.outfit); return 'equip'; }
    if (G.money < item.price) return '钱不够，您呐';
    G.money -= item.price; G.stats.spent += item.price;
    if (item.consumable) item.use();
    else if (item.paint) { this.paints[item.paint] = true; this.setPaint(item.paint); }
    else if (item.outfit) { this.outfits[item.outfit] = true; this.setOutfit(item.outfit); }
    else { this.owned[item.id] = this.count(item.id) + 1; Robot.repaint(this.paint); }
    this.recalc(); Sfx.buy();
    return '';
  },
  setEquip(id) { const E = EQUIP[id]; this.equip[E.slot] = id; this.recalc(); Player.rebuildHuman(); Robot.repaint(this.paint); },
  toggleEquip(id) { const E = EQUIP[id]; this.equip[E.slot] = this.equip[E.slot] === id ? null : id; this.recalc(); Player.rebuildHuman(); Robot.repaint(this.paint); },
  setPaint(p) { this.paint = p; Robot.repaint(p); },
  setOutfit(o) { this.outfit = o; this.recalc(); Player.rebuildHuman(); },
  save() { return { level: this.level, xp: this.xp, sp: this.sp, skills: this.skills, spec: this.spec, stats: this.stats, owned: this.owned, outfit: this.outfit, outfits: this.outfits, paint: this.paint, paints: this.paints, bonusCap: this.bonusCap, equip: this.equip }; },
  load(d) {
    if (!d) return;
    Object.assign(this, { level: d.level || 1, xp: d.xp || 0, sp: d.sp || 0, skills: d.skills || {}, spec: d.spec || null, stats: Object.assign({ stamina: 0, muscle: 0, driving: 0 }, d.stats), owned: d.owned || {}, outfit: d.outfit || 'tee', outfits: d.outfits || { tee: true }, paint: d.paint || 'classic', paints: d.paints || { classic: true }, bonusCap: d.bonusCap || 0 });
    this.equip = Object.assign({ head: null, face: null, neck: null, back: null, hand: null, wrist: null, feet: null }, d.equip || {});
    if (this.owns('keyboard') && !d.equip) this.equip.hand = 'keyboard';
    for (const s in this.equip) if (this.equip[s] && !EQUIP[this.equip[s]]) this.equip[s] = null;
    if (!OUTFITS[this.outfit]) this.outfit = 'tee';
    if (!PAINTS[this.paint]) this.paint = 'classic';
    this.recalc();
  },
};
