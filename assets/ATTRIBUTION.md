# 素材来源与许可 / Asset attribution

`assets/runtime/**` 是游戏运行时加载的全部素材(公开版、私有版都用),逐个文件的来源、许可、大小见
`assets/runtime/manifest.json` 的 `files` 列表。这里按来源汇总署名和许可条款。

- 只收可再分发的素材:CC0、MIT、pixiv 样例模型条款、CMU 动捕条款。没有 CC-BY、没有需要登录才能下的素材。
- `assets/face.webp`、`assets/bust.webp` 是原创卡通主角头像(`scripts/draw_hero.py` 画的),不在 runtime 里。
- 原始下载件(zip、glTF、BVH、未压缩贴图)不进仓库:`scripts/assets/fetch.sh` 按 `scripts/assets/sources/*.tsv` 重新下载
  (限速 2 MB/s),再用 `scripts/assets/*.mjs` 处理出 runtime 文件,整条流水线见文末。

## 1. 角色模型(VRM 0.x,pixiv VRoid 样例)

处理:合并共用顶点 + 同材质的 primitive(头发 ~100 次绘制 → 1–3 次)、只保留表情用到的 morph target、
缩略图缩到 64 px、贴图转 WebP(桌面 1024 px,手机 512 px),几何数据 meshopt 无损压缩(EXT_meshopt_compression,体积约减半),
VRM 扩展数据(骨骼、弹簧骨、表情、MToon)原样保留。

| key | 模型 | 许可 | 来源 |
| --- | --- | --- | --- |
| hairsample_male | HairSample_Male | CC0 1.0 | pixiv VRoid 样例,经 OpenGameArt: https://opengameart.org/content/vroid-studio-cc0-models |
| sendagaya_shino | 千駄ヶ谷篠 Sendagaya Shino | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360013482714-Sendagaya-Shino |
| vita | ヴィータ Vita(β AvatarSample_3) | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360014900113 |
| sendagaya_shibu | 千駄ヶ谷渋 Sendagaya Shibu(β AvatarSample_1) | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360012381793 |
| darkness_shibu | Darkness Shibu(β AvatarSample_1 暗色版) | CC0 1.0 | 同上 |
| vivi | ビビ Vivi(β AvatarSample_2) | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360014900273 |
| victoria_rubin | ヴィクトリア・ルービン Victoria Rubin(β AvatarSample_4) | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360014900233 |
| hairsample_female | HairSample_Female | CC0 1.0 | OpenGameArt(同第一行) |
| sakurada_fumiriya | 桜田史利矢 Sakurada Fumiriya | CC0 1.0 | https://vroid.pixiv.help/hc/en-us/articles/360014788554-Sakurada-Fumiriya |
| base_male / base_female | VRoid Studio 0.14 基础模型 | CC0 1.0 | OpenGameArt(同第一行) |
| avatarsample_a / _b / _c | VRoidPreset A / B / C | **pixiv 自定条款,不是 CC0** | https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/stable/ ;条款 https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z |

- CC0 那几个:pixiv 在各自的帮助页声明放弃著作权(“The CC license for this model is CC0 … pixiv Inc. has waived all
  copyright”),样例清单见 https://vroid.pixiv.help/hc/en-us/articles/4402614652569 。文件里嵌的 VRM meta 写的是
  VRoid Hub 条件(所有用途允许、无需署名),两者不冲突。致谢:pixiv Inc. VRoid プロジェクト。
- AvatarSample_A / B / C 的条款:任何人可以营利或非营利使用、修改、再分发,不必署名;**禁止**把它们标成 CC0 再分发、
  收费再分发、用样例数据做“角色生成服务”、暗示 pixiv 背书、用于歧视 / 极端 / 邪教宣传。所以:本仓库的任何 CC0 / MIT
  声明都不覆盖这三个文件;游戏里只用固定的成品变体(可以换色),不做玩家可拼装的捏人系统。
- VRoid Studio 条款(FAQ 4405813333657 ③)限制“输出由 VRoid 制作的网格/贴图拼装出的新模型”的应用:运行时的部件拼装
  (换脸、换发型)只对 CC0 那几个做。

## 2. 动画(VRMA,VRMC_vrm_animation 1.0)

处理:源动画按世界空间旋转差换算到 VRM 归一化骨骼(源 T-pose 朝 +Z),写成恒等静止姿态的 VRMA;去掉水平位移
(`manifest.json` 的 `travel` 给出去掉的位移,需要时由角色控制器补上),CMU 动捕按脚踝贴地、朝向对齐、30 fps 重采样。

- **Mesh2Motion human animation library**(`human-base / human-addon / human-mocap-animations.glb`),CC0 1.0,
  https://github.com/Mesh2Motion/mesh2motion-app (LICENSE-CC0.MD)。其中包含 **Quaternius Universal Animation Library 1 / 2
  Standard**(CC0 1.0,https://quaternius.com )。谢谢 Mesh2Motion 和 Quaternius。大部分动画来自这里(idle / walk / run /
  jump / 拳 / 受击 / 倒地起身 / 死亡 / 坐 / 开车 / 打电话 / 挥手 / 舞蹈 / 游泳 等,逐个见 manifest 的 `anims[].source`)。
- **CMU Graphics Lab Motion Capture Database**,http://mocap.cs.cmu.edu/ (BVH 取自 https://github.com/una-dinosauria/cmu-mocap )。
  用到的片段:12_04 太极(taichi)、135_04 正蹬(kick)、87_01 旋风踢(kick_spin)、90_05 飞踢(kick_jump)、18_15 小鸡舞
  (dance_chicken)。条款:任何用途免费、可放进商业产品,但**不得单独转卖这些数据(包括转换后的形式)**——只随游戏分发,
  不作为独立动作包发布。要求的致谢:
  > The data used in this project was obtained from mocap.cs.cmu.edu.
  > The database was created with funding from NSF EIA-0196217.
- `idle_soft.vrma`:pixiv ChatVRM 的 `public/idle_loop.vrma`,https://github.com/pixiv/ChatVRM ,MIT 许可(全文见文末 A)。

## 3. 环境贴图(WebP:albedo / normal(OpenGL) / arm = AO·粗糙度·金属度;桌面 1024 px,手机 512 px)

全部 CC0 1.0。Poly Haven(https://polyhaven.com/license ):自托管不要求署名,仍列出作者致谢。
ambientCG(https://docs.ambientcg.com/license/ ):“Contains assets from ambientCG.com, licensed under CC0 1.0 Universal.”

| material key | 来源 | 作者 / 处理 |
| --- | --- | --- |
| brick_grey | Poly Haven brick_wall_08 | Amal Kumar |
| plaster_palace_red | Poly Haven red_plaster_weathered | Amal Kumar;albedo 调到故宫红 #8b2a1e |
| lacquer_red | ambientCG PaintedWood003 + Poly Haven lacquered_cherry_wood(粗糙度) | Jenelle van Heerden, Rico Cilliers;albedo 调色 #8e1c12 |
| marble_white | ambientCG Marble019 | |
| paving_stone | ambientCG PavingStones128 | |
| courtyard_brick | Poly Haven blue_floor_tiles_01 | Rob Tuytel |
| hutong_paving | Poly Haven brick_pavement_02 | Charlotte Baglioni |
| granite_tile | Poly Haven granite_tile_04 | Amal Kumar |
| asphalt / asphalt_wear | Poly Haven asphalt_02 / aerial_asphalt_01 | Rob Tuytel |
| sidewalk | Poly Haven floor_tiles_09 | Rob Tuytel |
| tactile | ambientCG TactilePaving003 | |
| grass / dirt | Poly Haven leafy_grass / brown_mud_dry | Charlotte Baglioni / Rob Tuytel |
| facade_brick_windows / facade_office_night / glass_curtain | ambientCG Facade018A / Facade017(含夜间发光)/ Facade001 | |
| concrete_tile_facade / concrete | Poly Haven concrete_tile_facade / concrete_wall_008 | Charlotte Baglioni / Dario Barresi, Charlotte Baglioni |
| roof_grey / roof_yellow / roof_green / roof_blue(+ roof_tiles 共用法线) | ambientCG RoofingTiles014A | 保留法线 / AO,按亮度重做 albedo(灰瓦、黄绿蓝琉璃),琉璃瓦粗糙度压低 |
| leaves_broadleaf / leaves_conifer | ambientCG LeafSet024 / LeafSet019 | alpha 并进 albedo |
| bark_hackberry / bark_willow | Poly Haven chinese_hackberry_bark / bark_willow | Charlotte Baglioni / Dario Barresi, Dimitrios Savva |
| wood_floor / plaster_beige / wood_dark(室内:地板、墙面、梁和木作) | Poly Haven dark_wooden_planks / beige_wall_001 / dark_wood | Amal Kumar / Dimitrios Savva, Rico Cilliers / Dario Barresi, Dimitrios Savva, Rico Cilliers |

## 4. HDRI 天空(Radiance .hdr,只发 1k:游戏只读 1k,2k 和没用上的 zhengyang_gate 只留在原始下载里)

全部 Poly Haven,CC0 1.0:kloofendal_48d_partly_cloudy_puresky、kloppenheim_06_puresky、qwantani_dusk_2_puresky、
kloppenheim_02_puresky(Greg Zaal, Jarod Guest);kloofendal_overcast_puresky、kloofendal_misty_morning_puresky、
shanghai_bund(Greg Zaal)。

## 5. 树(GLB,lod0 / lod1 两级 + 远景 impostor 图集)

国槐(guohuai)、柳(liu)、桧柏(cypress)、银杏(yinxing)用 **EZ-Tree**(Daniel Greenheck,MIT,
https://github.com/dgreenheck/ez-tree )离线生成;叶片贴图来自 EZ-Tree 自带的叶子图(MIT,全文见文末 B),
树皮用上面的 Poly Haven bark 贴图(CC0)。生成参数在 `scripts/assets/lib/trees.mjs`。

## 6. 街道道具(GLB,减面 + meshopt 压缩)

全部 Poly Haven,CC0 1.0:fire_hydrant(Gonçalo Felício)、metal_trash_can(GurJas Studios)、
modular_street_seating(Stuart Attenborrow)、concrete_road_barrier(Amal Kumar)、
modular_electricity_poles(James Ray Cock)、water_manhole_cover(Raunox)。

### 6b. 室内家具(GLB,`assets/runtime/furniture/`,同一条流水线:`process_props.mjs --set furniture`)

全部 Poly Haven,CC0 1.0:chinese_armchair、chinese_tea_table、chinese_stool、chinese_cabinet、chinese_screen_panels、
chinese_chandelier、chinese_commode、chinese_console_table、chinese_sofa(Kirill Sannikov);antique_ceramic_vase_01、
ceramic_vase_02、wooden_display_shelves_01、steel_frame_shelves_01、potted_plant_04(James Ray Cock);wooden_crate_02
(James Ray Cock, Jurita Burger);metal_office_desk、round_wooden_table_02、wooden_bookshelf_worn(Ulan Cabanilla);
modern_arm_chair_01(Vibrant Nordic)。

## 7. 只用来处理素材的工具(不随游戏分发)

three.js(MIT)、@pixiv/three-vrm / three-vrm-animation(MIT)、glTF-Transform(MIT)、meshoptimizer(MIT)、
sharp / libvips(Apache-2.0 / LGPL-3.0,仅构建工具)、esbuild(MIT)、EZ-Tree(MIT)。

## 流水线(可复现)

```bash
npm ci --prefix scripts/assets                       # 处理工具(不进仓库)
GTA_RAW=/某个临时目录 bash scripts/assets/fetch.sh     # 下载原始件,默认 assets/_raw/(自带 .gitignore),限速 2 MB/s
node scripts/assets/process_vrm.mjs                  # 角色 → assets/runtime/chars(/lo)
node scripts/assets/bake_anims.mjs                   # 动画 → assets/runtime/anims
node scripts/assets/process_textures.mjs             # 环境贴图 → assets/runtime/tex(/lo)
node scripts/assets/gen_trees.mjs                    # 树 → assets/runtime/trees(无头 Chrome)
node scripts/assets/process_props.mjs                # 道具 → assets/runtime/props
cp <raw>/hdri/*_1k.hdr assets/runtime/hdri/ && rm assets/runtime/hdri/zhengyang_gate_1k.hdr   # 只发游戏用到的 1k
node scripts/assets/check_vrm.mjs; node scripts/assets/check_anims.mjs   # 无头 Chrome 目检截图 + 步幅速度
node scripts/assets/build_manifest.mjs               # → assets/runtime/manifest.json
```

---

### A. pixiv ChatVRM(idle_soft.vrma)

```
MIT License

Copyright (c) 2023 pixiv Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### B. EZ-Tree(树的生成器与叶片贴图)

```
MIT License

Copyright (c) 2024 Daniel Greenheck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
