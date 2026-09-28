// Poly Haven CC0 street props (process_props.mjs). ratio/error: meshoptimizer simplification targets; tex: max texture size.
export const PROPS = [
  { key: 'fire_hydrant', author: 'Gonçalo Felício', ratio: 0.07, error: 0.01, tex: 512, use: 'red fire hydrant (clean + _aged variants, caps and chain as separate nodes)' },
  { key: 'metal_trash_can', author: 'GurJas Studios', ratio: 0.3, error: 0.01, tex: 512, use: 'metal street bin (clean + _rust variants)' },
  { key: 'modular_street_seating', author: 'Stuart Attenborrow', ratio: 0.25, error: 0.01, tex: 1024, use: 'modular bench kit: seat, back, legs, armrests, connectors' },
  { key: 'concrete_road_barrier', author: 'Amal Kumar', ratio: 0.03, error: 0.01, tex: 512, use: 'concrete jersey barrier (roadworks, 天安门 security lines)' },
  { key: 'modular_electricity_poles', author: 'James Ray Cock', ratio: 0.06, error: 0.02, tex: 1024, use: 'modular wooden utility-pole kit: poles, crossarms, insulators, bolts (胡同 overhead wires)' },
  { key: 'water_manhole_cover', author: 'Raunox', ratio: 0.25, error: 0.01, tex: 512, use: 'manhole cover + frame' },
];

// Poly Haven CC0 interior furniture (process_props.mjs --set furniture -> assets/runtime/furniture/<key>.glb): 12_interiors.js
// places them (instanced per room) where they fit; each has a procedural stand-in until / unless its file has streamed in
export const FURNITURE = [
  { key: 'chinese_armchair', author: 'Kirill Sannikov', ratio: 0.6, error: 0.004, tex: 512, use: '太师椅 armchair (Token 王府, 同 Token 堂, 权重德)' },
  { key: 'chinese_tea_table', author: 'Kirill Sannikov', ratio: 0.6, error: 0.004, tex: 512, use: 'square tea table (得云社, 王府)' },
  { key: 'chinese_stool', author: 'Kirill Sannikov', ratio: 0.7, error: 0.004, tex: 512, use: 'round-legged stool (得云社, 老北京小吃店)' },
  { key: 'chinese_cabinet', author: 'Kirill Sannikov', ratio: 0.25, error: 0.006, tex: 1024, use: 'tall carved cabinet (容错斋, 王府 wardrobe)' },
  { key: 'chinese_screen_panels', author: 'Kirill Sannikov', ratio: 1, error: 0.004, tex: 1024, use: 'folding screen (王府, 道场)' },
  { key: 'chinese_chandelier', author: 'Kirill Sannikov', ratio: 0.45, error: 0.006, tex: 512, use: 'hanging palace lantern / chandelier (王府, 得云社, 权重德)' },
  { key: 'chinese_commode', author: 'Kirill Sannikov', ratio: 0.45, error: 0.006, tex: 1024, use: 'long carved sideboard (容错斋, 同 Token 堂 counter back)' },
  { key: 'chinese_console_table', author: 'Kirill Sannikov', ratio: 0.3, error: 0.006, tex: 512, use: 'narrow altar / console table (王府, 容错斋)' },
  { key: 'chinese_sofa', author: 'Kirill Sannikov', ratio: 1, error: 0.004, tex: 1024, use: '罗汉床 daybed (王府 bedroom corner, 得云社)' },
  { key: 'antique_ceramic_vase_01', author: 'James Ray Cock', ratio: 0.3, error: 0.006, tex: 512, use: 'tall antique vase (容错斋 shelves)' },
  { key: 'ceramic_vase_02', author: 'James Ray Cock', ratio: 0.6, error: 0.004, tex: 512, use: 'small ceramic vase (容错斋, 王府)' },
  { key: 'wooden_display_shelves_01', author: 'James Ray Cock', ratio: 0.6, error: 0.004, tex: 512, use: 'wooden display shelves (布鞋店、商场)' },
  { key: 'steel_frame_shelves_01', author: 'James Ray Cock', ratio: 0.5, error: 0.004, tex: 512, use: 'steel shelving (老王五金, 海量电子城)' },
  { key: 'metal_office_desk', author: 'Ulan Cabanilla', ratio: 0.5, error: 0.004, tex: 512, use: 'metal office desk (应用科学部, 阿卡姆标注中心)' },
  { key: 'modern_arm_chair_01', author: 'Vibrant Nordic', ratio: 0.35, error: 0.006, tex: 512, use: 'office armchair (应用科学部, 阿卡姆)' },
  { key: 'potted_plant_04', author: 'James Ray Cock', ratio: 0.4, error: 0.006, tex: 512, use: 'potted plant (shops, lab)' },
  { key: 'wooden_crate_02', author: 'James Ray Cock, Jurita Burger', ratio: 0.4, error: 0.006, tex: 512, use: 'wooden crate (五金, 电子城 stock)' },
  { key: 'round_wooden_table_02', author: 'Ulan Cabanilla', ratio: 0.5, error: 0.004, tex: 512, use: 'round table (老北京小吃店)' },
  { key: 'wooden_bookshelf_worn', author: 'Ulan Cabanilla', ratio: 0.35, error: 0.006, tex: 1024, use: 'worn bookshelf (王府 study, 应用科学部)' },
];
