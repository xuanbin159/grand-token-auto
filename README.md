# Grand Token Auto: 四九城

**直接玩:https://xuanbin159.github.io/grand-token-auto/**(电脑上用 Chrome / Edge / Safari / Firefox 打开;手机也能玩,自动用轻量画质)

老北京版 GTA 风格的开放世界网页游戏(three.js r186)。地图是真实的北京二环一带,画风朝《剑灵》那种日韩动漫 3D 走:
VRoid 动漫角色、PBR 材质的故宫红墙琉璃瓦和胡同灰砖、HDR 天空、泛光和环境光遮蔽。主角 Token 侠吃满 1M Token 就变身成变形金刚,
拳打各路 AI 办公楼,最后干掉背刺自己的 Klaude。剧情致敬《蝙蝠侠:侠影之谜》和《圣安地列斯》,台词是京味儿评书腔。

> 纯属玩笑的恶搞游戏。里面的公司、产品和店铺都是谐音化名,只是剧情里的角色,与真实公司无关;主角是原创形象。

## 玩法

| 按键 | 作用 |
| --- | --- |
| WASD | 移动(跟着镜头方向走);开车 W/S 油门刹车,A/D 转向 |
| 鼠标 | 拖动转视角;点一下画面锁定鼠标自由环视(锁定时左键拳、右键踢),Esc 松开 |
| J / K | 出拳 / 飞踢(打人会爆金币) |
| 空格 | 跳 / 砸地 / 开车手刹 |
| F | 上车下车 · 扫码骑共享单车 · 进站坐地铁 · 进店交互 |
| T | 变身(吃满 1M Token 后);变身后再按 T 变卡车 |
| L / R | 注意力光束 / 专精大招(5 级选专精后) |
| Q | 解除变身 |
| V / 滚轮 | 镜头:近景 · 中景 · 远景 · 经典俯视 |
| B | 北京生活面板:户口积分、驾照分、进京证、摇号、今日限行 |
| Tab | 角色面板:技能树、专精、地图、剧情 |
| Esc | 暂停(暂停菜单的大地图上点一下设导航点) |

手机:左下角摇杆(手指按哪儿摇杆就出在哪儿),右半屏拖动转视角,右下角拳 / 踢 / 跳,上车、进站、变身这些按钮到了能用的地方才出现;顶上一排是角色 / 北京 / 暂停 / 声音 / 镜头;画质在暂停菜单里切(自动 / 流畅 / 均衡 / 电影)。

打开后标题页马上出来,「新游戏」按钮上显示加载进度:先下约 11 MB(512 px 贴图、树、主角和常用动作)就能开玩,
全分辨率贴图、别的角色、天空这些在后台接着下,到了就换上。第一次打开显卡要编译着色器,会多等几秒;再打开有缓存,两三秒就能进。

## 画面

- **动漫角色**:主角、剧情人物、路人全是 VRoid 动漫模型,卡通着色 + 暖色阴影 + 边缘光,主角和剧情人物带细描边;会眨眼、说话动嘴、按台词换表情、转头看说话的人,头发有弹簧骨物理。动作是 VRMA 动作库:走 / 跑 / 冲刺按速度切换,跳、拳脚连招、受击、倒地起身、背人、坐着开车骑车,街上还有广场舞、太极、下象棋。
- **环境**:PBR 贴图(Poly Haven / ambientCG,CC0)——故宫朱红墙、黄绿蓝琉璃瓦、胡同灰砖、石板路、柏油路,墙面屋檐带雨痕和积灰;曲面屋顶、彩画斗拱、朱漆大门配铜门环和对联、纸糊窗棂、红灯笼;国槐、柳、桧柏、银杏(EZ-Tree 生成)随风摇;HDRI 天空,清晨、黄昏、夜里的光色各不相同,远处有雾气,后海水面有倒影。
- **车辆**:按侧视轮廓放样的圆润车身,清漆车漆、玻璃、镀铬;北京出租车金黄配色、警车蓝白涂装和闪烁警灯;车灯夜里会亮。机甲是圆润的装甲件。
- **画质**:电影档有 HDR 泛光、环境光遮蔽(N8AO)、2048 软阴影和天空反射;均衡档去掉 AO;手机默认流畅档(不开后处理)。

## 里面有什么

- **真实北京地图**:OpenStreetMap 的二环一带真实路网、水系、公园和地标轮廓(二环内压缩到 1/4,二环外 1/6),右下角实时显示所在街道和片区。
- **地标**:故宫(三大殿、东西六宫、午门、神武门、角楼、金水河)、天安门与端门、天安门广场、前门正阳门 + 箭楼、景山万春亭、北海白塔、钟鼓楼、天坛、雍和宫、国家大剧院、北京站、德胜门、永定门;主角家 Token 王府 = 恭王府;二环上跑着上下文轻轨。
- **胡同与街道**:沿真实街道生成四合院、老字号铺面、酒吧街(后海 / 烟袋斜街 / 南锣鼓巷)、城外高楼和 CBD 天际线;共享单车、地铁站口。
- **交通**:车按车道走真实路网、看红绿灯排队;早晚高峰更堵;京牌 / 外地牌;警车沿路网追你。
- **北京特色**:尾号限行 + 电子眼 + 驾照扣分、进京证、户口积分、小客车摇号、地铁快速移动、扫码骑共享单车;街上有广场舞、煎饼 / 糖葫芦摊、城管、遛鸟大爷、下象棋的、外卖小哥。
- **天气**:晴、雾霾、沙尘、雨(路面反光)、雪,会随机变。
- **主角的脸**:默认动漫脸;也能上传一张脸的图片,自动生成 3D 头模换上(图片只存在你自己浏览器的本地存储里,不会上传)。
- 12 个剧情任务、15 处能进的建筑、装备上身、技能树 / 专精 / 升级;打人爆金币、得云社听相声、王府大床存档。

## 本机运行

游戏是一个文件夹(`dist/`),要用 http 打开,双击 `index.html` 不行(浏览器不让 `file://` 读模型和贴图):

```bash
python3 -m http.server -d dist 8000      # 然后浏览器打开 http://localhost:8000/
```

## 改代码

```
game/            游戏源码(按文件名顺序拼进一个 IIFE)+ head.html(页面骨架与样式)
assets/          主角卡通头像、beijing_map.json(地图数据)、runtime/(VRM 角色、VRMA 动作、PBR 贴图、HDRI、树、街道道具)
vendor/          three r186 + GLTF/KTX2/VRM 加载器 + postprocessing + N8AO 的打包入口 entry.js;产物 vendor/dist/ 已提交
scripts/build.py 构建脚本 → dist/ 游戏文件夹(不用装 npm)
scripts/assets/  素材流水线:下载(限速)、处理 VRM / 动作 / 贴图 / 树 / 道具、生成 manifest
scripts/map/     OpenStreetMap → assets/beijing_map.json 的预处理脚本
scripts/dev/     无头 Chrome 冒烟测试 smoke.mjs、剧情全流程 story_run.js、加载耗时 loadtime.mjs
index.html       GitHub Pages 入口(跳转到 dist/index.html)
```

改完 `game/` 里的文件后运行 `python3 scripts/build.py`,重新生成 `dist/`;装了 node 时顺带做语法检查。
升级 three 等依赖后 `npm install && node vendor/build.mjs` 重打 `vendor/dist/vendor.js`。浏览器里的调试钩子挂在 `window.GTA`。

```bash
node scripts/dev/smoke.mjs --begin --shot /tmp/a.png                           # 无头冒烟测试(自己起本地 http 服务)
node scripts/dev/smoke.mjs --wait 60 --eval "$(cat scripts/dev/story_run.js)"   # 12 个任务全流程 + 15 个门
```

## 许可与署名

- 地图数据 © OpenStreetMap 贡献者,以 ODbL 1.0 许可提供(https://www.openstreetmap.org/copyright)。
- 角色模型(pixiv VRoid 样例)、动作(Mesh2Motion / Quaternius、CMU 动捕、pixiv ChatVRM)、贴图与 HDRI(Poly Haven、ambientCG)、
  树(EZ-Tree)、街道道具(Poly Haven):CC0 / MIT / pixiv 样例条款等可再分发许可,逐项出处、作者与条款见
  [assets/ATTRIBUTION.md](assets/ATTRIBUTION.md)。
  The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- three.js r186 与 addons:MIT(three.js authors);@pixiv/three-vrm、three-vrm-animation:MIT(pixiv);postprocessing:Zlib;
  N8AO:ISC / CC0-1.0;basis_universal 转码器、draco 解码器:Apache-2.0。许可原文见 `vendor/dist/THIRD_PARTY.txt`(随构建放进 `dist/`)。
- 游戏本身的代码与原创美术保留所有权利。
