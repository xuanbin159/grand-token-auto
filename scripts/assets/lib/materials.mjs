// Environment PBR material set (processed by process_textures.mjs).
// src: 'ph:<id>' = Poly Haven (diff / nor_gl / arm), 'acg:<ID>' = ambientCG (Color / NormalGL / Roughness / AO / Metalness / Opacity / Emission)
// res: desktop size (1024 | 2048); phone copies are 512. tile: real-world size of one texture repeat (m).
// tint: re-colour albedo to this mean sRGB colour. rough: [min,max] remap of roughness. roughFrom: take ARM.G from another source.
export const MATERIALS = [
  { key: 'brick_grey', src: 'ph:brick_wall_08', res: 2048, tile: 1.9, use: 'hutong grey brick walls (青砖)' },
  { key: 'plaster_palace_red', src: 'ph:red_plaster_weathered', res: 2048, tile: 2, tint: '#8b2a1e', use: 'palace / temple red walls (故宫红)' },
  { key: 'lacquer_red', src: 'acg:PaintedWood003', res: 1024, tile: 1, tint: '#8e1c12', roughFrom: 'ph:lacquered_cherry_wood', use: 'red lacquered columns, doors, window frames' },
  { key: 'marble_white', src: 'acg:Marble019', res: 1024, tile: 2, use: 'white marble balustrades / terraces (汉白玉)' },
  { key: 'paving_stone', src: 'acg:PavingStones128', res: 2048, tile: 3.5, use: 'big stone paving: Tiananmen Square, palace courtyards' },
  { key: 'courtyard_brick', src: 'ph:blue_floor_tiles_01', res: 1024, tile: 2, use: 'courtyard brick floor (砖墁地)' },
  { key: 'hutong_paving', src: 'ph:brick_pavement_02', res: 2048, tile: 2, use: 'hutong lane paving' },
  { key: 'granite_tile', src: 'ph:granite_tile_04', res: 1024, tile: 2, use: 'plazas, station forecourts' },
  { key: 'asphalt', src: 'ph:asphalt_02', res: 2048, tile: 3, use: 'road surface (tileable detail)' },
  { key: 'asphalt_wear', src: 'ph:aerial_asphalt_01', res: 1024, tile: 30, use: 'large-scale road wear / tyre marks overlay (blend over asphalt)' },
  { key: 'sidewalk', src: 'ph:floor_tiles_09', res: 2048, tile: 2, use: 'sidewalk concrete tiles' },
  { key: 'tactile', src: 'acg:TactilePaving003', res: 1024, tile: 1.2, use: 'yellow tactile strip (盲道)' },
  { key: 'grass', src: 'ph:leafy_grass', res: 1024, tile: 2, use: 'park lawns' },
  { key: 'dirt', src: 'ph:brown_mud_dry', res: 1024, tile: 1.4, use: 'tree pits, dirt lots' },
  { key: 'facade_brick_windows', src: 'acg:Facade018A', res: 1024, tile: 13, use: 'mid-rise brick facade with windows' },
  { key: 'facade_office_night', src: 'acg:Facade017', res: 1024, tile: 12, emissive: true, use: 'office tower facade; emissive.webp = lit windows at night' },
  { key: 'glass_curtain', src: 'acg:Facade001', res: 1024, tile: 6, use: 'glass curtain wall (CBD towers); metalness from source' },
  { key: 'concrete_tile_facade', src: 'ph:concrete_tile_facade', res: 1024, tile: 3, use: 'modern concrete facade tiles' },
  { key: 'concrete', src: 'ph:concrete_wall_008', res: 1024, tile: 3, use: 'generic concrete walls, overpasses' },
  // barrel roof tiles (筒瓦 / 琉璃瓦): RoofingTiles014A normal + AO, regenerated albedo per colour
  { key: 'roof_grey', src: 'acg:RoofingTiles014A', res: 2048, tile: 2.9, recolour: '#5b5e61', rough: [0.7, 0.9], sharedNormal: 'roof_tiles', use: 'grey clay roof tiles (hutong, 四合院)' },
  { key: 'roof_yellow', src: 'acg:RoofingTiles014A', res: 2048, tile: 2.9, recolour: '#d6a11e', rough: [0.18, 0.45], sharedNormal: 'roof_tiles', use: 'yellow glazed tiles (imperial: 故宫, 天安门); clearcoat ~0.6' },
  { key: 'roof_green', src: 'acg:RoofingTiles014A', res: 2048, tile: 2.9, recolour: '#2f7a4e', rough: [0.18, 0.45], sharedNormal: 'roof_tiles', use: 'green glazed tiles (princely mansions, 恭王府)' },
  { key: 'roof_blue', src: 'acg:RoofingTiles014A', res: 2048, tile: 2.9, recolour: '#2c5c8c', rough: [0.18, 0.45], sharedNormal: 'roof_tiles', use: 'blue glazed tiles (天坛 祈年殿)' },
  // interiors (12_interiors.js): floors, plaster, dark wood for beams / wainscot / procedural furniture
  { key: 'wood_floor', src: 'ph:dark_wooden_planks', res: 1024, tile: 2.4, use: 'room floor planks (王府, 老字号, 道场)' },
  { key: 'plaster_beige', src: 'ph:beige_wall_001', res: 1024, tile: 3, use: 'interior plaster walls (tinted per room)' },
  { key: 'wood_dark', src: 'ph:dark_wood', res: 1024, tile: 1.2, use: 'dark hardwood: ceiling beams, wainscot, counters, procedural furniture' },
  // foliage / trees
  { key: 'leaves_broadleaf', src: 'acg:LeafSet024', res: 1024, tile: 1, alpha: true, use: 'broadleaf leaf cards (国槐, 柳, 银杏); alpha in albedo' },
  { key: 'leaves_conifer', src: 'acg:LeafSet019', res: 1024, tile: 1, alpha: true, use: 'conifer needle cards (桧柏, pine); alpha in albedo' },
  { key: 'bark_hackberry', src: 'ph:chinese_hackberry_bark', res: 1024, tile: 1, use: 'broadleaf bark (国槐)' },
  { key: 'bark_willow', src: 'ph:bark_willow', res: 1024, tile: 1, use: 'willow bark (柳)' },
];

export const PH_CREDIT = 'Poly Haven (polyhaven.com), CC0';
export const ACG_CREDIT = 'ambientCG (ambientcg.com), CC0';
